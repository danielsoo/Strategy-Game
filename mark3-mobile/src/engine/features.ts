// 학습용 특징 추출
//
// ai.ts 의 평가식은 항이 14개다. 그 항들은 내가 손으로 고른 것이라,
// 내가 안 적어둔 전략은 애초에 후보에 없다. "전선이 하나일 때만 뭉친다" 같은
// 조건부 전략을 그 식으로는 쓸 수가 없다 — massing 은 스칼라 하나니까.
//
// 그래서 수를 숫자 뭉치로 바꿔서 내보낸다. 무엇이 중요한지는 학습기가 정한다.
// 여기서 내가 정하는 건 '무엇을 볼 수 있는가'까지다.
//
// 후보 행동 자체는 규칙이 정한다(제자리 + 이웃 한 칸). 그건 편견이 아니라 합법수다.

import { hexDistance } from '../utils/hexGrid';
import { terrainDefense } from '../services/combatSystem';
import { Cell, GameState, EconomyConfig } from './types';
import {
  neighbors,
  cellPower,
  cellEfficiency,
  estimateWinProb,
  plunderValue,
  computeLedger,
  flankingSupport,
  isHostile,
} from './rules';
import { unexploredCount } from './vision';
import type { Ctx, Action } from './ai';

export const FEATURE_COUNT = 46;

/**
 * 앞에서부터 이만큼은 행동과 무관한 값이다 — 나라 형편 10개 + 부대 형편 16개.
 * 같은 결정 안의 후보들은 이 구간이 모두 같다. 기준선(가치함수)은 이것만 본다.
 */
export const STATE_FEATURE_COUNT = 26;

/** 밖에서 특정 특징을 집어 볼 때 쓴다. 자리 번호를 여기저기 박아두지 않는다. */
export const FEATURE_INDEX = {
  fronts: 4,
  merge: 29,
} as const;

export const FEATURE_NAMES = [
  '내칸비율', '내병력비율', '금고', '순수입', '접경국수', '생존국비율',
  '턴진행', '성개수', '속국수', '칸당병력',
  '부대크기', '피로', '성위', '요새위', '지형방어', '인접적', '인접아군',
  '거점거리', '목표거리', '국소전력비', '최전선',
  '광역적', '광역아군', '단독전력비', '원군포함전력비', '위급당김',
  '제자리', '이동', '공격', '합치기', '합친크기',
  '대상병력', '대상성', '대상요새', '대상지형', '승산', '약탈액',
  '대상주변적', '대상주변아군', '전진', '귀환', '빈땅', '적땅', '안개', '대상효율',
  '위급으로',
];

/** 나라 단위 값은 한 턴에 한 번만 센다. ctx 는 턴마다 새로 만들어지니 이걸로 족하다. */
interface TurnBase {
  vec: number[];
  hubDist: (c: Cell) => number;
}

const cache = new WeakMap<Ctx, TurnBase>();

function friendly(state: GameState, me: number, c: Cell): boolean {
  if (c.neutral) return false;
  if (c.owner === null) return false;
  if (c.owner === me) return true;
  return state.nations[c.owner]?.suzerain === me;
}

function minDist(c: Cell, targets: Cell[]): number {
  let best = 99;
  for (const t of targets) {
    const d = hexDistance(c.row, c.col, t.row, t.col);
    if (d < best) best = d;
  }
  return best;
}

function turnBase(ctx: Ctx): TurnBase {
  const hit = cache.get(ctx);
  if (hit) return hit;

  const { state, me, eco } = ctx;
  let myCells = 0;
  let myUnits = 0;
  let allCells = 0;
  let allUnits = 0;
  let myCastles = 0;

  for (const c of state.cells) {
    if (c.owner !== null && !c.neutral) {
      allCells++;
      allUnits += c.units;
    }
    if (c.owner === me && !c.neutral) {
      myCells++;
      myUnits += c.units;
      if (c.castle) myCastles++;
    }
  }

  // 접경국 수 — 전선이 몇 개인가. 뭉칠지 흩을지를 가르는 값이라고 본다.
  const fronts = new Set<number>();
  for (const c of state.cells) {
    if (c.owner !== me || c.neutral) continue;
    for (const n of neighbors(state, c)) {
      if (n.neutral) fronts.add(-1);
      else if (n.owner !== null && n.owner !== me && state.nations[n.owner]?.suzerain !== me) {
        fronts.add(n.owner);
      }
    }
  }

  let aliveFree = 0;
  let myVassals = 0;
  for (const nat of state.nations) {
    if (nat.alive && nat.suzerain === null) aliveFree++;
    if (nat.suzerain === me) myVassals++;
  }

  const ledger = computeLedger(state, me, eco);
  const gold = state.nations[me]?.gold ?? 0;

  const vec = [
    allCells > 0 ? myCells / allCells : 0,
    allUnits > 0 ? myUnits / allUnits : 0,
    Math.tanh(gold / 150),
    Math.tanh(ledger.net / 15),
    Math.min(1, fronts.size / 4),
    state.nations.length > 0 ? aliveFree / state.nations.length : 0,
    Math.min(1, state.turn / 180),
    Math.min(1, myCastles / 4),
    Math.min(1, myVassals / 4),
    Math.min(1, myUnits / Math.max(1, myCells) / 5),
  ];

  const anchors = ctx.hubs.length > 0 ? ctx.hubs : ctx.homes;
  const base: TurnBase = {
    vec,
    hubDist: (c: Cell) => (anchors.length > 0 ? minDist(c, anchors) : 6),
  };
  cache.set(ctx, base);
  return base;
}

/**
 * 반경 2 안의 적/아군 전력과, 압박받는 아군 진지의 당김.
 *
 * ai.ts 의 assessPosture·findDistress 가 보는 값들이다. 손평가식의 힘은
 * 상당 부분 여기서 나오는데 특징에 빠져 있었다. 그러면 망은 더 적은 정보로
 * 두게 되고, 그건 목적함수의 차이가 아니라 그냥 불공평한 비교다.
 *
 * 칸마다 전체 순회라 비싸다. 부대 단위로 한 번만 세고 아껴 쓴다.
 */
interface StackView {
  enemyNear: number;
  helpNear: number;
  distressPull: number;
}

const stackCache = new WeakMap<Ctx, Map<string, StackView>>();

function stackView(ctx: Ctx, c: Cell): StackView {
  let per = stackCache.get(ctx);
  if (!per) {
    per = new Map();
    stackCache.set(ctx, per);
  }
  const hit = per.get(c.id);
  if (hit) return hit;

  let enemyNear = 0;
  let helpNear = 0;
  for (const x of ctx.state.cells) {
    if (x.units <= 0 || x.id === c.id) continue;
    const d = hexDistance(c.row, c.col, x.row, x.col);
    if (d > 2) continue;
    // 당장 맞붙을 적만 센다 — assessPosture 와 같은 감쇠를 쓴다
    if (friendly(ctx.state, ctx.me, x)) helpNear += cellPower(x, false) / (1 + d);
    else enemyNear += cellPower(x, false) / (d * d);
  }

  let distressPull = 0;
  for (const s of ctx.distress) {
    const d = hexDistance(c.row, c.col, s.cell.row, s.cell.col);
    distressPull = Math.max(distressPull, s.severity / (1 + d));
  }

  const view = { enemyNear, helpNear, distressPull };
  per.set(c.id, view);
  return view;
}

/** 압박받는 아군 진지까지의 거리 */
function distressDist(ctx: Ctx, c: Cell): number {
  let best = 9;
  for (const s of ctx.distress) {
    const d = hexDistance(c.row, c.col, s.cell.row, s.cell.col);
    if (d < best) best = d;
  }
  return best;
}

/** 칸 주변의 적/아군 전력 */
function around(ctx: Ctx, c: Cell): { foe: number; friend: number } {
  let foe = 0;
  let friend = 0;
  for (const n of neighbors(ctx.state, c)) {
    if (n.units <= 0) continue;
    if (friendly(ctx.state, ctx.me, n)) friend += cellPower(n, false);
    else foe += cellPower(n, false);
  }
  return { foe, friend };
}

/**
 * (상태, 내 부대, 후보 행동) → 숫자 40개.
 * 값은 대체로 0~1 로 눌러둔다. 크기가 제각각이면 학습이 한쪽 축에만 끌려간다.
 */
export function extractFeatures(ctx: Ctx, c: Cell, a: Action): Float32Array {
  const base = turnBase(ctx);
  const { state, me, eco } = ctx;
  const myPower = cellPower(c, false);
  const here = around(ctx, c);

  const tDist = ctx.target ? hexDistance(c.row, c.col, ctx.target.row, ctx.target.col) : 6;
  const hDist = base.hubDist(c);

  const f = base.vec.slice();

  f.push(
    Math.min(1, c.units / 25),
    c.exhaustion / 100,
    c.castle ? 1 : 0,
    c.fortStage === 4 ? 1 : 0,
    terrainDefense(c.terrain) - 1,
    Math.min(1, here.foe / 20),
    Math.min(1, here.friend / 20),
    1 / (1 + hDist),
    1 / (1 + tDist),
    here.foe > 0 ? myPower / (myPower + here.foe) : 0.5,
    here.foe > 0 ? 1 : 0
  );

  // 태세 판단의 재료 — 반경 2 의 적·아군과, 원군까지 셈에 넣은 전력비
  const view = stackView(ctx, c);
  const ratioAlone = view.enemyNear > 0 ? myPower / view.enemyNear : 3;
  const ratioHelped = view.enemyNear > 0 ? (myPower + view.helpNear) / view.enemyNear : 3;
  const myDistressDist = distressDist(ctx, c);
  f.push(
    Math.min(1, view.enemyNear / 20),
    Math.min(1, view.helpNear / 20),
    Math.min(1, ratioAlone / 3),
    Math.min(1, ratioHelped / 3),
    Math.min(1, view.distressPull / 10)
  );

  const isStay = a.kind === 'stay';
  const n = isStay ? null : a.target;

  f.push(isStay ? 1 : 0, a.kind === 'move' ? 1 : 0, a.kind === 'attack' ? 1 : 0);

  if (!n) {
    // 제자리에는 대상이 없다. 나머지는 0 으로 둔다.
    while (f.length < FEATURE_COUNT) f.push(0);
    return Float32Array.from(f);
  }

  const merge = a.kind === 'move' && n.units > 0 && friendly(state, me, n);
  const there = around(ctx, n);
  const nDist = ctx.target ? hexDistance(n.row, n.col, ctx.target.row, ctx.target.col) : 6;

  let winProb = 0;
  let loot = 0;
  if (a.kind === 'attack' && isHostile(c, n, state)) {
    const mine = myPower + flankingSupport(state, n, c, eco);
    const theirs = cellPower(n, true) + flankingSupport(state, n, n, eco);
    winProb = estimateWinProb(mine, theirs);
    loot = plunderValue(state, n, eco);
  }

  f.push(
    merge ? 1 : 0,
    merge ? Math.min(1, (c.units + n.units) / 30) : 0,
    Math.min(1, n.units / 25),
    n.castle ? 1 : 0,
    n.fortStage === 4 ? 1 : 0,
    terrainDefense(n.terrain) - 1,
    winProb,
    Math.tanh(loot / 60),
    Math.min(1, there.foe / 20),
    Math.min(1, there.friend / 20),
    Math.max(-1, Math.min(1, tDist - nDist)),
    Math.max(-1, Math.min(1, hDist - base.hubDist(n))),
    n.owner === null && !n.neutral && n.units === 0 ? 1 : 0,
    n.owner !== null && n.owner !== me && n.units === 0 ? 1 : 0,
    Math.min(1, unexploredCount(state, me, n, 2) / 7),
    cellEfficiency(n, ctx.hubs, eco),
    // 얻어맞는 아군 쪽으로 가는 수인가
    Math.max(-1, Math.min(1, myDistressDist - distressDist(ctx, n)))
  );

  // 학습 쪽 뜨거운 반복문이 한 가지 자료형만 보게 한다. number[] 와 섞이면
  // JIT 가 형을 특정하지 못해 최적화를 포기한다.
  return Float32Array.from(f);
}
