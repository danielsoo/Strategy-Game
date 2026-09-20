// 먼 곳까지 가는 길과, 거기 닿는 데 걸리는 턴
//
// 지금까지 부대는 한 칸씩만 움직일 수 있었다. 행군력이 병력 수에 비례해
// 비싸지는 규칙을 넣은 뒤로는 "저기까지 몇 턴 걸리나"가 판단의 대부분인데,
// 그걸 플레이어가 암산해야 했다. 3칸 떨어진 곳이 평지면 두 턴, 산이면 다섯 턴이다.
//
// 그래서 길을 미리 찾아 보여준다. 계산은 실제 이동 규칙과 같은 함수를 쓴다 —
// 규칙이 두 군데에 있으면 미리보기와 실제가 반드시 갈라진다.
//
// 안개 너머는 평지로 친다. 실제 지형으로 계산하면 가보지도 않은 산을 피해
// 돌아가는 길이 나오고, 그건 플레이어가 모르는 것을 아는 것이다.

import { Cell, GameState, EconomyConfig, DEFAULT_ECONOMY } from './types';
import { neighbors, marchCost, stackCap, isFoeCell } from './rules';
import { isExplored } from './vision';

export interface PathStep {
  cell: Cell;
  /** 이 칸에 발을 딛는 턴. 0 이면 이번 턴 안에 닿는다. */
  turn: number;
}

export interface PathPlan {
  /** 출발 칸을 뺀 걸어갈 칸들, 순서대로 */
  steps: PathStep[];
  /** 도착까지 걸리는 턴. 0 이면 이번 턴에 닿는다. */
  turns: number;
}

/** 몇 턴을 넘어가면 길이 없는 것으로 친다 */
const TURN_LIMIT = 60;

/**
 * 이 칸에 들어가는 데 드는 행군력.
 *
 * 못 가본 칸은 평지로 친다. 실제 지형을 쓰면 안개 너머의 산을 피해 가는
 * 길이 나와서, 정찰하지 않고도 지형을 읽는 셈이 된다.
 */
function enterCost(
  state: GameState,
  mover: number,
  units: number,
  c: Cell,
  eco: EconomyConfig
): number {
  if (isExplored(state, mover, c)) return marchCost(units, c, eco);
  // 평지·길 없음 기준값. terrainMarch('plain') 은 1 이라 곱하지 않는다.
  return eco.marchBase + eco.marchPerUnit * Math.max(0, units);
}

/** 지나갈 수 있는 칸인가. 목적지는 적이어도 된다 — 닿는 순간이 공격이다. */
function passable(
  state: GameState,
  mover: number,
  units: number,
  c: Cell,
  isGoal: boolean,
  eco: EconomyConfig
): boolean {
  if (c.offMap) return false;
  if (isGoal) return true;
  // 적이 선 칸은 비켜 간다. 길목의 싸움까지 미리 셈할 수는 없다.
  if (isFoeCell(state, mover, c)) return false;
  // 합쳐서 정원을 넘는 칸은 지나갈 수 없다. 들어갈 수 없는 칸이기 때문이다.
  const merging = c.units > 0 && c.owner === mover && !c.neutral;
  if (merging && units + c.units > stackCap(eco)) return false;
  return true;
}

/**
 * 한 턴이 지나 행군력이 차오른 뒤의 값.
 * beginTurn 과 같은 식이어야 한다 — 다르면 미리보기가 거짓말을 한다.
 */
function afterRest(march: number, eco: EconomyConfig): number {
  return Math.min(eco.marchMax, march + eco.marchRegen);
}

/**
 * from 에서 to 까지 가는 가장 빠른 길.
 *
 * 다익스트라인데 견주는 값이 둘이다. 먼저 턴 수가 적은 길, 같으면 도착했을 때
 * 행군력이 더 많이 남는 길. 거리(칸 수)로만 재면 산을 넘는 짧은 길이 평지로
 * 도는 긴 길보다 낫다고 나온다 — 실제로는 두 배 느린데.
 *
 * 한 턴에 한 칸이다. 이걸 빼먹고 행군력이 남으면 계속 가게 뒀더니 평지 9칸을
 * 6턴이라고 했다. 실제로는 9턴이다. 미리보기가 실제보다 빠르면 안 보여주느니만
 * 못하다 — 그 숫자를 믿고 짠 계획이 매번 어긋난다.
 *
 * readyNow 가 거짓이면 이 부대는 이번 턴에 이미 움직였다. 첫 걸음은 다음 턴이다.
 */
export function findPath(
  state: GameState,
  from: Cell,
  to: Cell,
  eco: EconomyConfig = DEFAULT_ECONOMY,
  readyNow = true
): PathPlan | null {
  if (from.id === to.id || from.units <= 0) return null;
  if (from.owner === null) return null;
  const mover = from.owner;
  const units = from.units;

  interface Node {
    /** 이 칸에 발을 딛는 턴. -1 은 아직 출발 전(이번 턴에 한 번 움직일 수 있다). */
    turn: number;
    /** 딛고 난 뒤 남은 행군력 */
    march: number;
    prev: string | null;
  }
  const best = new Map<string, Node>();
  best.set(from.id, { turn: readyNow ? -1 : 0, march: from.march, prev: null });

  // 칸 수가 많지 않아 단순 선형 탐색으로 충분하다. 217칸에서도 눈에 안 띈다.
  const open = new Set<string>([from.id]);

  while (open.size > 0) {
    let curId: string | null = null;
    let cur: Node | null = null;
    for (const id of open) {
      const n = best.get(id)!;
      if (!cur || n.turn < cur.turn || (n.turn === cur.turn && n.march > cur.march)) {
        cur = n;
        curId = id;
      }
    }
    if (!curId || !cur) break;
    open.delete(curId);
    if (curId === to.id) break;

    const c = state.cells.find((x) => x.id === curId);
    if (!c) continue;

    for (const n of neighbors(state, c)) {
      const isGoal = n.id === to.id;
      if (!passable(state, mover, units, n, isGoal, eco)) continue;

      const cost = enterCost(state, mover, units, n, eco);

      // 다음 걸음은 무조건 다음 턴이다. 턴이 바뀌면 행군력이 차오른다 —
      // 다만 출발 칸의 행군력은 이미 이번 턴 몫이 들어 있으므로 또 채우지 않는다.
      let turn = cur.turn + 1;
      let march = cur.turn < 0 ? cur.march : afterRest(cur.march, eco);
      // 그래도 모자라면 그 자리에서 쉰다
      let stuck = false;
      while (march < cost) {
        const rested = afterRest(march, eco);
        if (rested <= march || turn >= TURN_LIMIT) {
          stuck = true;
          break;
        }
        march = rested;
        turn++;
      }
      if (stuck) continue;
      march -= cost;

      const prevBest = best.get(n.id);
      if (prevBest && (prevBest.turn < turn || (prevBest.turn === turn && prevBest.march >= march))) {
        continue;
      }
      best.set(n.id, { turn, march, prev: curId });
      open.add(n.id);
    }
  }

  const goal = best.get(to.id);
  if (!goal || goal.prev === null) return null;

  const steps: PathStep[] = [];
  let id: string | null = to.id;
  while (id && id !== from.id) {
    const node = best.get(id)!;
    const cell = state.cells.find((x) => x.id === id);
    if (!cell) return null;
    steps.unshift({ cell, turn: node.turn });
    id = node.prev;
  }
  return { steps, turns: goal.turn };
}

/**
 * 길의 첫 칸 — 이번 턴에 실제로 밟을 곳.
 * 명령을 받은 부대가 매 턴 이걸 한 번씩 밟아 목적지로 간다.
 */
export function nextStep(
  state: GameState,
  from: Cell,
  to: Cell,
  eco: EconomyConfig = DEFAULT_ECONOMY
): Cell | null {
  const plan = findPath(state, from, to, eco);
  if (!plan || plan.steps.length === 0) return null;
  const first = plan.steps[0];
  // 이번 턴에 못 밟는 칸이면 아직 쉬어야 한다
  return first.turn === 0 ? first.cell : null;
}
