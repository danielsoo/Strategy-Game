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

export const FEATURE_COUNT = 40;

export const FEATURE_NAMES = [
  '내칸비율', '내병력비율', '금고', '순수입', '접경국수', '생존국비율',
  '턴진행', '성개수', '속국수', '칸당병력',
  '부대크기', '피로', '성위', '요새위', '지형방어', '인접적', '인접아군',
  '거점거리', '목표거리', '국소전력비', '최전선',
  '제자리', '이동', '공격', '합치기', '합친크기',
  '대상병력', '대상성', '대상요새', '대상지형', '승산', '약탈액',
  '대상주변적', '대상주변아군', '전진', '귀환', '빈땅', '적땅', '안개', '대상효율',
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
export function extractFeatures(ctx: Ctx, c: Cell, a: Action): number[] {
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

  const isStay = a.kind === 'stay';
  const n = isStay ? null : a.target;

  f.push(isStay ? 1 : 0, a.kind === 'move' ? 1 : 0, a.kind === 'attack' ? 1 : 0);

  if (!n) {
    // 제자리에는 대상이 없다. 나머지는 0 으로 둔다.
    while (f.length < FEATURE_COUNT) f.push(0);
    return f;
  }

  const merge = a.kind === 'move' && n.units > 0 && friendly(state, me, n);
  const there = around(ctx, n);
  const nDist = ctx.target ? hexDistance(n.row, n.col, ctx.target.row, ctx.target.col) : 6;

  let winProb = 0;
  let loot = 0;
  if (a.kind === 'attack' && isHostile(c, n)) {
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
    cellEfficiency(n, ctx.hubs, eco)
  );

  return f;
}
