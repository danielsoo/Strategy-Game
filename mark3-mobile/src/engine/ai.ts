// AI — 평가 함수 기반
//
// "지금 당장 싸움에서 이긴다고 게임을 이기는 게 아니다"는 문제는 평가 함수에 담긴다.
// 영토·병력·본진·전진 중 무엇을 얼마나 중요하게 보느냐가 그 나라의 전략이 된다.
//
// 이 파일의 상수들은 손으로 고른 것이고, sim/tuneAI.ts 의 자가대전 탐색이
// 더 나은 값을 찾으면 그걸로 갈아끼운다.

import { hexDistance } from '../utils/hexGrid';
import { RNG } from '../services/combatSystem';
import {
  Cell,
  GameState,
  EconomyConfig,
  DEFAULT_ECONOMY,
  Merchant,
} from './types';
import {
  neighbors,
  cellPower,
  cellEfficiency,
  adminHubs,
  estimateWinProb,
  performAttack,
  moveStack,
  AttackOutcome,
  isHostile,
  startFort,
  recruit,
  merchantDestinations,
  expectedTradeProfit,
  sendMerchant,
  plunderValue,
} from './rules';

export interface AIWeights {
  territory: number;
  units: number;
  castleAssault: number;
  fort: number;
  /** 승산이 낮아도 공격하는 정도 (1 = 기대값대로, >1 = 무모, <1 = 신중) */
  aggression: number;
  massing: number;
  homeDefense: number;
  advance: number;
  expansion: number;
  terrain: number;
  /**
   * 상대의 부(富)를 표적 가치로 환산하는 정도.
   * 이 값이 크면 AI 는 "가장 강한 나라"가 아니라 "가장 부유한 나라"를 노린다.
   * 선두가 쌓은 국고가 곧 표적이 되므로, 눈덩이를 되돌리는 힘으로 작동한다.
   */
  wealth: number;
  /** 영토에 비례해 늘어나는 목표 병력의 기준값 */
  targetArmy: number;
}

/**
 * 골드를 평가 점수로 옮긴다. 제곱근을 쓰는 이유는 국고가 수만 단위로 커져도
 * 다른 항을 완전히 지워버리지 않게 하기 위해서다. 그래도 기본값에서는
 * 영토·병력보다 앞선다 — 우선순위는 돈, 그다음이 국력이다.
 */
export function wealthValue(gold: number, w: AIWeights): number {
  return w.wealth * Math.sqrt(Math.max(0, gold));
}

export const BASE_WEIGHTS: AIWeights = {
  territory: 1,
  units: 1.2,
  castleAssault: 12,
  fort: 2,
  aggression: 1,
  massing: 0.6,
  homeDefense: 1,
  advance: 1,
  expansion: 1,
  terrain: 0.5,
  wealth: 1,
  targetArmy: 18,
};

export const PERSONALITIES: Record<string, AIWeights> = {
  균형: { ...BASE_WEIGHTS },
  공격형: { ...BASE_WEIGHTS, aggression: 1.6, advance: 2.2, homeDefense: 0.3, castleAssault: 18 },
  수비형: { ...BASE_WEIGHTS, aggression: 0.5, homeDefense: 2.5, advance: 0.3, fort: 5, terrain: 1.2 },
  확장형: { ...BASE_WEIGHTS, expansion: 2.6, territory: 2.2, aggression: 0.8, advance: 0.7 },
  집중형: { ...BASE_WEIGHTS, massing: 2.5, aggression: 1.2, advance: 1.4, targetArmy: 26 },
  경제형: { ...BASE_WEIGHTS, aggression: 0.4, expansion: 1.6, targetArmy: 30, homeDefense: 1.6 },
};

/** sim/tuneAI.ts 의 자가대전이 수렴한 값 (손으로 만든 성격 4종 상대 63.3%) */
export const LEARNED_WEIGHTS: AIWeights = {
  territory: 1.77,
  units: 1.04,
  castleAssault: 15.03,
  fort: 3.44,
  aggression: 0.88,
  massing: 0.14,
  homeDefense: 0.27,
  advance: 0.47,
  expansion: 2.19,
  terrain: 0.52,
  wealth: 1,
  targetArmy: 21.25,
};

interface Ctx {
  state: GameState;
  me: number;
  w: AIWeights;
  homes: Cell[];
  enemyHomes: Cell[];
  target: Cell | null;
  homeThreat: number;
  hubs: Cell[];
  eco: EconomyConfig;
}

function minDist(c: Cell, targets: Cell[]): number {
  if (targets.length === 0) return 99;
  let best = 99;
  for (const t of targets) {
    const d = hexDistance(c.row, c.col, t.row, t.col);
    if (d < best) best = d;
  }
  return best;
}

/** 어떤 칸 주변(반경 2)의 전력 합 — "저기가 비었나"를 판단하는 눈 */
function localStrength(state: GameState, center: Cell, owner: number | null): number {
  let total = 0;
  for (const c of state.cells) {
    if (c.units <= 0) continue;
    if (c.owner !== owner) continue;
    const d = hexDistance(center.row, center.col, c.row, c.col);
    if (d > 2) continue;
    total += cellPower(c, false) * (d === 0 ? 1 : d === 1 ? 0.7 : 0.4);
  }
  return total;
}

/** 적 본진 중 '약하고 가까운' 곳을 이번 원정의 목표로 고른다 */
function pickTarget(ctx: Omit<Ctx, 'target' | 'homeThreat'>): Cell | null {
  let best: Cell | null = null;
  let bestScore = -Infinity;
  for (const h of ctx.enemyHomes) {
    const defense = localStrength(ctx.state, h, h.owner);
    const dist = minDist(h, ctx.homes);
    // 부유한 나라가 우선 표적이다. 국고를 쌓아둔 선두가 저절로 매를 번다.
    const gold = h.owner !== null ? ctx.state.nations[h.owner].gold : 0;
    const prize = ctx.w.castleAssault + wealthValue(gold, ctx.w);
    const score = prize / (1 + defense * 0.5) - dist * 0.6;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

function computeHomeThreat(state: GameState, me: number, homes: Cell[]): number {
  let threat = 0;
  for (const h of homes) {
    let enemy = 0;
    for (const c of state.cells) {
      if (c.units <= 0 || c.owner === me) continue;
      const d = hexDistance(h.row, h.col, c.row, c.col);
      if (d === 0 || d > 3) continue;
      enemy += cellPower(c, false) / d;
    }
    threat += Math.max(0, enemy - localStrength(state, h, me) * 0.6);
  }
  return threat;
}

function positionValue(ctx: Ctx, c: Cell): number {
  const w = ctx.w;
  let v = 0;
  v += w.terrain * (1 + (c.fortStage === 4 ? 0.3 : 0));

  // 본진이 위협받으면 집으로 당기는 힘이 커진다.
  // 상한이 중요하다. 여기를 크게 열어두면 전진 기울기를 압도해
  // 전원이 집에 눌러앉고 모든 나라가 이동 0회로 게임이 멎는다.
  const homePull = w.homeDefense * (1 + Math.min(0.8, ctx.homeThreat / 40));
  v += homePull * (2 / (1 + minDist(c, ctx.homes)));

  // 전진은 선형 기울기여야 한다. 5/(1+거리) 형태는 원거리에서 평평해져
  // (거리 9→0.50, 8→0.56) 멀리 있는 부대가 움직일 이유를 잃는다.
  // 그리고 '가장 가까운' 적이 아니라 '이번 원정 목표'를 향해 당겨야 한다.
  const dist = ctx.target
    ? hexDistance(c.row, c.col, ctx.target.row, ctx.target.col)
    : minDist(c, ctx.enemyHomes);
  v += w.advance * Math.max(0, 14 - dist) * 1.0;
  return v;
}

/** 위험은 '내 군대의 크기'가 아니라 '상대적 열세'다. 압도적이면 0이어야 한다. */
function riskAt(ctx: Ctx, c: Cell, myUnits: number, myPower: number): number {
  let hostile = 0;
  for (const n of neighbors(ctx.state, c)) {
    if (n.units > 0 && (n.neutral || n.owner !== ctx.me)) hostile += cellPower(n, false);
  }
  if (hostile <= 0) return 0;
  const ratio = hostile / Math.max(0.001, myPower);
  const exposure = Math.max(0, Math.min(1.5, ratio - 0.6));
  return ctx.w.units * myUnits * 0.12 * exposure;
}

type Action =
  | { kind: 'stay'; score: number }
  | { kind: 'move'; score: number; target: Cell }
  | { kind: 'attack'; score: number; target: Cell };

function scoreActions(ctx: Ctx, c: Cell): Action[] {
  const w = ctx.w;
  const myPower = cellPower(c, false);
  const actions: Action[] = [];

  // 목표에서 멀리 떨어진 채 가만히 있는 것은 그 자체로 손해다.
  // 이 항이 없으면 덧셈식 점수에 국소 최적점이 생겨, 대군이 적을 앞에 두고도
  // "제자리"를 최선으로 고르며 게임이 영구히 멎는다.
  const distToTarget = ctx.target ? hexDistance(c.row, c.col, ctx.target.row, ctx.target.col) : 0;
  const idlePenalty = distToTarget > 1 ? w.advance * 1.5 : 0;
  actions.push({
    kind: 'stay',
    score:
      positionValue(ctx, c) - idlePenalty + (c.exhaustion > 50 ? w.units * c.units * 0.2 : 0),
  });

  for (const n of neighbors(ctx.state, c)) {
    if (isHostile(c, n)) {
      const p = estimateWinProb(myPower, cellPower(n, true));
      // 적 병력을 없애는 것이 이기는 주된 방법이다. 이 항이 작으면
      // AI 가 평화롭게 빈 땅만 먹고 전쟁을 아예 하지 않는다.
      // 약탈 기대액이 먼저다. 땅과 병력은 그다음.
      const loot = plunderValue(ctx.state, n, ctx.eco);
      const prize =
        wealthValue(loot, w) +
        w.territory +
        w.units * n.units * 1.4 +
        (n.castle ? w.castleAssault : 0) +
        (n.fortStage === 4 ? w.fort : 0) +
        positionValue(ctx, n);
      // 비용은 '내 군대 전체'가 아니라 '예상 사상자'다.
      const cost = w.units * c.units * 0.35;
      const pAdj = Math.min(1, p * w.aggression);
      actions.push({ kind: 'attack', score: pAdj * prize - (1 - pAdj) * cost, target: n });
      continue;
    }

    if (n.units > 0 && n.owner === ctx.me && !n.neutral) {
      actions.push({
        kind: 'move',
        score: w.massing * Math.min(c.units, n.units) + positionValue(ctx, n) - w.territory,
        target: n,
      });
      continue;
    }

    if (n.units === 0) {
      // 거점에서 먼 땅은 행정 비용만 나가는 순손실이다. 효율을 반영하지 않으면
      // AI 가 돈도 안 되는 변두리를 끝없이 칠한다.
      const eff = cellEfficiency(n, ctx.hubs, ctx.eco);
      const fresh = n.owner !== ctx.me ? 1.5 : 0.2;
      const gain = w.expansion * w.territory * (2 * eff - 0.4) * fresh + positionValue(ctx, n);
      actions.push({ kind: 'move', score: gain - riskAt(ctx, n, c.units, myPower), target: n });
    }
  }

  return actions;
}

export interface AITurnLog {
  attacks: AttackOutcome[];
  recruited: number;
  fortsStarted: number;
  moved: Set<string>;
}

export function takeAITurn(
  state: GameState,
  nationId: number,
  w: AIWeights,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY
): AITurnLog {
  const moved = new Set<string>();
  const log: AITurnLog = { attacks: [], recruited: 0, fortsStarted: 0, moved };

  const homes = state.cells.filter((c) => c.castle && c.owner === nationId);
  const enemyHomes = state.cells.filter((c) => c.castle && c.owner !== nationId);
  const hubs = adminHubs(state, nationId);
  const partial = { state, me: nationId, w, homes, enemyHomes, hubs, eco };
  const ctx: Ctx = {
    ...partial,
    target: pickTarget(partial),
    homeThreat: computeHomeThreat(state, nationId, homes),
  };

  // 1. 징병 — 목표 병력은 영토에 비례해야 한다. 절대 상한으로 두면
  //    넓은 나라가 적은 병력에서 징병을 멈추고 골드만 쌓인 채 정지한다.
  let myUnits = 0;
  let myCells = 0;
  for (const c of state.cells) {
    if (c.owner !== nationId) continue;
    myUnits += c.units;
    myCells++;
  }
  if (homes.length > 0 && myUnits < w.targetArmy + myCells * 0.6) {
    log.recruited = recruit(state, nationId, eco.maxRecruitPerTurn, eco);
  }

  // 2. 요새 — 거점에서 먼 땅을 쓸모 있게 만드는 수단이다
  if (state.nations[nationId].gold >= eco.fortCost * 1.4) {
    let site: Cell | null = null;
    let worst = 1;
    for (const c of state.cells) {
      if (c.owner !== nationId || c.castle || c.fortStage !== 0 || c.units < 3) continue;
      const eff = cellEfficiency(c, hubs, eco);
      if (eff < worst) {
        worst = eff;
        site = c;
      }
    }
    if (site && worst < 0.35 + w.fort * 0.06 && startFort(state, site, nationId, eco)) {
      log.fortsStarted = 1;
    }
  }

  // 3. 무역상 — 가장 이문이 큰 목적지로 보낸다
  for (const m of state.merchants) {
    if (m.nation !== nationId || m.phase !== 'idle') continue;
    const dest = bestTradeDestination(state, m, eco);
    if (dest) sendMerchant(state, m, dest);
  }

  // 4. 부대별 행동 — 한 턴에 한 번씩
  const stackIds: string[] = [];
  for (const c of state.cells) {
    if (c.owner === nationId && c.units > 0 && !c.neutral && c.fortStage === 0) stackIds.push(c.id);
  }
  for (let i = stackIds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [stackIds[i], stackIds[j]] = [stackIds[j], stackIds[i]];
  }

  for (const id of stackIds) {
    const c = state.cells.find((x) => x.id === id);
    if (!c || c.owner !== nationId || c.units <= 0) continue;

    const actions = scoreActions(ctx, c);
    actions.sort((a, b) => b.score - a.score);
    const best = actions[0];
    if (!best || best.kind === 'stay') continue;

    if (best.kind === 'attack') {
      log.attacks.push(performAttack(state, c, best.target, rng));
    } else {
      moveStack(c, best.target);
    }
    moved.add(id);
  }

  return log;
}

export function bestTradeDestination(
  state: GameState,
  m: Merchant,
  eco: EconomyConfig = DEFAULT_ECONOMY
): Cell | null {
  let best: Cell | null = null;
  let bestNet = 0;
  for (const d of merchantDestinations(state)) {
    if (d.row === m.row && d.col === m.col) continue;
    const p = expectedTradeProfit(state, m, d, eco);
    // 거리가 멀수록 강도에 털릴 위험이 커지므로 살짝 할인한다
    const adjusted = p.net - p.distance * 2;
    if (adjusted > bestNet) {
      bestNet = adjusted;
      best = d;
    }
  }
  return best;
}
