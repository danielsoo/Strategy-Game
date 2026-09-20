// AI — 평가 함수 기반
//
// "지금 당장 싸움에서 이긴다고 게임을 이기는 게 아니다"는 문제는 평가 함수에 담긴다.
// 영토·병력·본진·전진 중 무엇을 얼마나 중요하게 보느냐가 그 나라의 전략이 된다.
//
// 이 파일의 상수들은 손으로 고른 것이고, sim/tuneAI.ts 의 자가대전 탐색이
// 더 나은 값을 찾으면 그걸로 갈아끼운다.

import { hexDistance } from '../utils/hexGrid';
import { RNG, terrainDefense } from '../services/combatSystem';
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
  commandLimit,
  canMoveTo,
  canAttackFrom,
  merchantDestinations,
  expectedTradeProfit,
  sendMerchant,
  plunderValue,
  computeLedger,
  resolveCastleLoss,
  flankingSupport,
} from './rules';
import { vassalize } from './vassals';
import { isExplored, isVisible, knownCell, unexploredCount } from './vision';

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
  /**
   * 압박받는 아군에게 달려가는 정도.
   * 이게 0 이면 부대들이 각자 점수만 보고 움직여, 옆에서 아군이 두들겨 맞아도
   * 모른 척한다. 실제 전쟁은 얻어맞는 곳으로 병력이 몰린다.
   */
  support: number;
  /**
   * 미탐색 지역을 밝히려는 성향.
   * 안개 속에서는 모르는 곳이 곧 위험이자 기회다. 정찰하지 않으면 적이
   * 어디에 얼마나 있는지도 모른 채 둬야 한다.
   */
  explore: number;
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
  support: 1,
  explore: 1,
  targetArmy: 18,
};

export const PERSONALITIES: Record<string, AIWeights> = {
  균형: { ...BASE_WEIGHTS },
  공격형: { ...BASE_WEIGHTS, aggression: 1.6, advance: 2.2, homeDefense: 0.3, castleAssault: 18 },
  // 수비형은 '아무것도 안 하기'가 아니라 '적당히 넓히고 요새로 굳히기'다.
  // advance 0.3 / expansion 1.0 으로 두면 1~2칸만 붙들고 있다가 남의 속국이 된다.
  수비형: {
    ...BASE_WEIGHTS,
    aggression: 0.5,
    homeDefense: 1.8,
    advance: 0.4,
    fort: 6,
    terrain: 1.2,
    expansion: 1.5,
    territory: 1.4,
    targetArmy: 24,
  },
  확장형: { ...BASE_WEIGHTS, expansion: 2.6, territory: 2.2, aggression: 0.8, advance: 0.7 },
  집중형: { ...BASE_WEIGHTS, massing: 2.5, aggression: 1.2, advance: 1.4, targetArmy: 26 },
  경제형: { ...BASE_WEIGHTS, aggression: 0.4, expansion: 1.6, targetArmy: 30, homeDefense: 1.6 },
};

/** 토너먼트에 학습 결과도 참가시킨다 (아래에서 PERSONALITIES 에 더한다) */

/**
 * sim/tuneAI.ts 의 자가대전이 수렴한 값 (손으로 만든 성격 4종 상대 61.7%).
 *
 * 약탈·속국·초선형 행정비가 들어온 뒤 다시 학습한 결과다. 이전 값과 비교하면
 * 무엇이 바뀌었는지가 그대로 보인다.
 *   advance  0.47 → 1.42  본진을 치면 속국이 되니 전진할 이유가 생겼다
 *   massing  0.14 → 0.61  본진을 실제로 떨어뜨리려면 병력을 모아야 한다
 *   castleAssault 15.0 → 18.4  본진의 값이 올랐다
 *   wealth   (신규) 0.42  기본값 1.0 보다 낮게 골랐다 — 돈을 쫓는 것은
 *                          생각만큼 이득이 아니라는 뜻이다
 */
export const LEARNED_WEIGHTS: AIWeights = {
  territory: 2.59,
  units: 1.33,
  castleAssault: 16.05,
  fort: 0.0,
  aggression: 0.66,
  massing: 0.0,
  homeDefense: 0.38,
  advance: 0.24,
  expansion: 2.27,
  terrain: 0.91,
  wealth: 0.82,
  support: 0.0,
  explore: 0.79,
  targetArmy: 20.23,
};

PERSONALITIES['학습형'] = LEARNED_WEIGHTS;

export interface Ctx {
  state: GameState;
  me: number;
  w: AIWeights;
  homes: Cell[];
  enemyHomes: Cell[];
  target: Cell | null;
  homeThreat: number;
  hubs: Cell[];
  eco: EconomyConfig;
  /** 지금 압박받고 있는 내 진지들. 가까운 부대를 끌어당긴다. */
  distress: Array<{ cell: Cell; severity: number }>;
}

/**
 * 압박받는 아군 진지를 찾는다.
 *
 * 부대가 각자 점수만 보고 움직이면 옆에서 아군이 두들겨 맞아도 모른 척한다.
 * 실제 전쟁은 그렇지 않다 — 얻어맞는 곳으로 병력이 몰린다.
 * severity 는 "얼마나 부족한가"다. 혼자 막을 수 있으면 부르지 않는다.
 */
function findDistress(
  state: GameState,
  me: number
): Array<{ cell: Cell; severity: number }> {
  const out: Array<{ cell: Cell; severity: number }> = [];
  for (const c of state.cells) {
    if (c.owner !== me || c.units <= 0 || c.neutral) continue;
    let hostile = 0;
    for (const n of neighbors(state, c)) {
      if (n.units > 0 && (n.neutral || n.owner !== me)) hostile += cellPower(n, false);
    }
    if (hostile <= 0) continue;
    const mine = cellPower(c, true);
    const shortfall = hostile - mine;
    if (shortfall <= 0) continue; // 혼자 감당되면 부르지 않는다
    // 본진과 요새는 잃으면 타격이 크므로 더 크게 부른다
    const weight = c.castle ? 2.5 : c.fortStage === 4 ? 1.8 : 1;
    // 위급함 = 모자란 전력 + 거기서 잃게 될 병력. 둘 다 걸려 있다.
    out.push({ cell: c, severity: (shortfall + c.units) * weight });
  }
  return out;
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

/**
 * 적 본진 중 '약하고 가까운' 곳을 이번 원정의 목표로 고른다.
 *
 * 안개 때문에 아직 못 본 본진은 후보가 아니다. 어디 있는지도 모르는 곳을
 * 향해 진군할 수는 없다. 그래서 초반에는 정찰이 곧 전략이 된다.
 */
function pickTarget(ctx: Omit<Ctx, 'target' | 'homeThreat' | 'distress'>): Cell | null {
  let best: Cell | null = null;
  let bestScore = -Infinity;
  for (const h of ctx.enemyHomes) {
    if (!isExplored(ctx.state, ctx.me, h)) continue;
    // 지금 안 보이면 마지막으로 본 기억으로 판단한다
    const defense = isVisible(ctx.state, ctx.me, h)
      ? localStrength(ctx.state, h, h.owner)
      : (knownCell(ctx.state, ctx.me, h)?.units ?? 0) * 1.2;
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

  // 압박받는 아군 쪽으로 끌린다. 가까울수록 세게 당긴다.
  //
  // 크기가 중요하다. 전진 항은 거리 1에서 advance×13 (기본값 기준 약 18)에
  // 달하는데, 지원 항이 한 자릿수면 사실상 무시되어 부대들이 끝까지
  // 따로 논다. 위급한 아군 옆에 있을 때는 원정보다 우선해야 한다.
  for (const d of ctx.distress) {
    if (d.cell.id === c.id) continue;
    const dd = hexDistance(c.row, c.col, d.cell.row, d.cell.col);
    if (dd > 5) continue; // 너무 멀면 가봐야 늦는다
    v += w.support * (d.severity * 2.5) / (1 + dd * 1.3);
  }
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

export type Action =
  | { kind: 'stay'; score: number }
  | { kind: 'move'; score: number; target: Cell }
  | { kind: 'attack'; score: number; target: Cell };

/**
 * 부대의 태세.
 *   press    수가 앞선다 — 적극적으로 들이댄다
 *   hold     비슷하거나 원군이 오는 중 — 자리를 지키며 기다린다
 *   withdraw 수가 크게 밀리고 도와줄 이가 없다 — 지연하며 뒤로 뺀다
 *
 * 이게 없으면 부대는 매 턴 점수가 가장 높은 행동을 그냥 실행한다.
 * 기다린다는 개념도, 물러난다는 개념도 없어서 열세인 부대가 그대로 갈려나간다.
 */
type Posture = 'press' | 'even' | 'hold' | 'withdraw';

interface Assessment {
  posture: Posture;
  /** 주변 적 전력 (거리로 감쇠) */
  enemyNear: number;
  /** 곧 닿을 수 있는 아군 전력 */
  helpNear: number;
  ratio: number;
}

function assessPosture(ctx: Ctx, c: Cell, myPower: number): Assessment {
  let enemyNear = 0;
  let helpNear = 0;

  for (const x of ctx.state.cells) {
    if (x.units <= 0 || x.id === c.id) continue;
    const d = hexDistance(c.row, c.col, x.row, x.col);
    if (d > 2) continue;
    const hostile = x.neutral || x.owner !== ctx.me;
    if (hostile) {
      // 당장 맞붙을 적만 센다. 반경을 넓히고 완만하게 감쇠시키면 주변 적이
      // 전부 합산되어 거의 언제나 열세로 판정되고, 모두가 눈치만 보다 게임이 멎는다.
      enemyNear += cellPower(x, false) / (d * d);
    } else if (x.owner === ctx.me && !x.neutral) {
      helpNear += cellPower(x, false) / (1 + d);
    }
  }

  if (enemyNear <= 0) return { posture: 'even', enemyNear, helpNear, ratio: 99 };

  const ratio = myPower / enemyNear;
  const ratioWithHelp = (myPower + helpNear) / enemyNear;

  // 중립 구간이 있어야 한다. 애매한 상황까지 '대기'로 묶으면 아무도 안 싸운다.
  //
  // 문턱은 성격을 따른다. 태세를 모두에게 똑같이 적용하면 aggression 가중치를
  // 덮어써서 공격형조차 눈치를 보게 된다. 대담한 나라는 더 낮은 전력비에서도
  // 밀어붙이고, 신중한 나라는 더 확실할 때만 움직인다.
  const boldness = Math.max(0.4, ctx.w.aggression);
  const pressAt = 1.15 / boldness;
  const withdrawAt = 0.6 / boldness;

  let posture: Posture;
  if (ratio >= pressAt) posture = 'press';
  else if (ratio <= withdrawAt) posture = ratioWithHelp >= 1.0 ? 'hold' : 'withdraw';
  else posture = 'even';

  return { posture, enemyNear, helpNear, ratio };
}

/** 이 칸이 후퇴지로 얼마나 좋은가 — 적에게서 멀고, 방어가 되고, 본거지에 가까울수록 */
function retreatValue(ctx: Ctx, n: Cell): number {
  let pressure = 0;
  for (const x of neighbors(ctx.state, n)) {
    if (x.units > 0 && (x.neutral || x.owner !== ctx.me)) pressure += cellPower(x, false);
  }
  const terrain = terrainDefense(n.terrain) + (n.fortStage === 4 ? 0.4 : 0) + (n.castle ? 0.3 : 0);
  const homeward = 6 / (1 + minDist(n, ctx.hubs.length > 0 ? ctx.hubs : ctx.homes));
  return terrain * 4 + homeward - pressure * 0.9;
}

function scoreActions(ctx: Ctx, c: Cell): Action[] {
  const w = ctx.w;
  const myPower = cellPower(c, false);
  const actions: Action[] = [];

  // 목표에서 멀리 떨어진 채 가만히 있는 것은 그 자체로 손해다.
  // 이 항이 없으면 덧셈식 점수에 국소 최적점이 생겨, 대군이 적을 앞에 두고도
  // "제자리"를 최선으로 고르며 게임이 영구히 멎는다.
  const distToTarget = ctx.target ? hexDistance(c.row, c.col, ctx.target.row, ctx.target.col) : 0;
  const idlePenalty = distToTarget > 1 ? w.advance * 1.5 : 0;

  // 지켜야 할 자리는 비우지 않는다.
  // 적이 붙어 있는 본진·요새를 두고 원정을 나가면 그 사이에 잃는다.
  let enemyAdjacent = 0;
  for (const n of neighbors(ctx.state, c)) {
    if (n.units > 0 && (n.neutral || n.owner !== ctx.me)) enemyAdjacent += cellPower(n, false);
  }
  const holdingCritical = (c.castle || c.fortStage === 4) && enemyAdjacent > 0;
  const holdBonus = holdingCritical ? w.homeDefense * 12 + enemyAdjacent * 0.8 : 0;

  // 전력비에 따라 태세를 정한다
  const a = assessPosture(ctx, c, myPower);

  // 원군을 기다릴 때는 좋은 자리에서 버티는 것 자체가 값어치가 있다.
  // 물러날 때도 제자리에서 한 번 더 막아보는 선택지는 남겨둔다.
  // 대기 보너스는 '정말로 밀릴 때'만. 애매할 때까지 주면 전원이 눌러앉는다.
  const waitBonus =
    a.posture === 'hold'
      ? (terrainDefense(c.terrain) - 0.9) * 6 + Math.min(6, a.helpNear * 0.3)
      : 0;

  actions.push({
    kind: 'stay',
    score:
      positionValue(ctx, c) -
      (a.posture === 'withdraw' || a.posture === 'hold' ? idlePenalty * 0.4 : idlePenalty) +
      holdBonus +
      waitBonus +
      (c.exhaustion > 50 ? w.units * c.units * 0.2 : 0),
  });

  for (const n of neighbors(ctx.state, c)) {
    if (isHostile(c, n)) {
      // 행군력이 모자라면 칠 수 없다. 후보에조차 올리지 않는다.
      if (!canAttackFrom(c, n, ctx.eco)) continue;
      // 협공을 셈에 넣는다. 규칙만 바뀌고 AI 가 모르면 행동은 그대로다.
      const myFlank = flankingSupport(ctx.state, n, c, ctx.eco);
      const theirFlank = flankingSupport(ctx.state, n, n, ctx.eco);
      const p = estimateWinProb(myPower + myFlank, cellPower(n, true) + theirFlank);
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
      // 수가 앞서면 적극적으로, 밀리면 소극적으로. 물러나는 중엔 웬만하면 안 친다.
      const postureMul =
        a.posture === 'press'
          ? 1.35
          : a.posture === 'even'
          ? 1.0
          : a.posture === 'hold'
          ? 0.6
          : 0.25;
      actions.push({
        kind: 'attack',
        score: (pAdj * prize - (1 - pAdj) * cost) * postureMul,
        target: n,
      });
      continue;
    }

    if (n.units > 0 && n.owner === ctx.me && !n.neutral) {
      // 상한을 넘는 합류와 행군력이 없는 이동은 수가 아니다
      if (!canMoveTo(c, n, ctx.eco)) continue;
      // 합류 가치는 병력 수에만 비례하면 안 된다. 그러면 1~2명짜리 부대가
      // 합칠 이유를 못 찾아 자잘하게 흩어진 채로 각자 싸우다 각개격파당한다.
      // 주변 적 앞에서 내가 약할수록 뭉쳐야 한다.
      const weakness = enemyAdjacent / Math.max(1, myPower);
      const urge = 1 + Math.min(2.5, weakness * 1.5);
      const merged = c.units + n.units;
      actions.push({
        kind: 'move',
        score:
          w.massing * Math.min(c.units, n.units) * urge +
          // 합쳐서 의미 있는 덩어리가 되는지도 본다
          w.massing * Math.min(6, merged) * 0.8 +
          positionValue(ctx, n) -
          w.territory,
        target: n,
      });
      continue;
    }

    if (n.units === 0) {
      if (!canMoveTo(c, n, ctx.eco)) continue;
      // 거점에서 먼 땅은 행정 비용만 나가는 순손실이다. 효율을 반영하지 않으면
      // AI 가 돈도 안 되는 변두리를 끝없이 칠한다.
      const eff = cellEfficiency(n, ctx.hubs, ctx.eco);
      // 안개를 걷는 것 자체가 값어치다. 모르는 곳은 위험이자 기회다.
      const scout = w.explore * unexploredCount(ctx.state, ctx.me, n, 2) * 0.6;
      const fresh = n.owner !== ctx.me ? 1.5 : 0.2;
      const gain = w.expansion * w.territory * (2 * eff - 0.4) * fresh + positionValue(ctx, n);

      if (a.posture === 'withdraw') {
        // 지연하며 뒤로. 그냥 도망가는 게 아니라 막을 수 있는 자리로 물러난다.
        // 적 압박이 적고, 지형이 받쳐주고, 본거지에 가까운 칸을 고른다.
        actions.push({
          kind: 'move',
          score: retreatValue(ctx, n) * w.homeDefense * 1.6 + gain * 0.25 + scout * 0.2,
          target: n,
        });
      } else {
        actions.push({
          kind: 'move',
          score: gain + scout - riskAt(ctx, n, c.units, myPower),
          target: n,
        });
      }
    }
  }

  return actions;
}

/**
 * 수를 고르는 방식을 바깥에서 갈아끼우는 자리.
 *
 * 후보 행동은 규칙이 정한다(제자리 + 이웃 한 칸씩). 바뀌는 건 그 후보를
 * 어떻게 매기고 어떻게 고르느냐다. 손으로 쓴 평가식도, 학습한 가치함수도
 * 같은 자리에 꽂힌다 — 그래야 둘을 같은 기준으로 붙여볼 수 있다.
 */
export interface Policy {
  /** 후보를 다시 매긴다. 없으면 손으로 쓴 점수를 그대로 쓴다. */
  score?: (ctx: Ctx, c: Cell, a: Action) => number;
  /** 고르는 방식. 없으면 최고점. 학습 중에는 여기로 탐색을 섞는다. */
  select?: (actions: Action[], rng: RNG, ctx: Ctx, c: Cell) => Action;
  /** 고른 수를 알린다. 학습 자료는 여기서 모은다. */
  onChoose?: (ctx: Ctx, c: Cell, chosen: Action, all: Action[]) => void;
}

export interface AITurnLog {
  attacks: AttackOutcome[];
  recruited: number;
  fortsStarted: number;
  moved: Set<string>;
}

/**
 * 마지막 본진을 빼앗았을 때 병합할지 속국으로 둘지 고른다.
 *
 * 순전히 계산이다. 병합하면 그 땅의 수입이 들어오지만 내 행정비가 가팔라진다.
 * 속국으로 두면 조공만 들어오고 행정비는 그 나라가 낸다.
 * 이미 넓은 나라일수록 부리는 쪽이 이득이 된다 — 역사가 그랬듯이.
 */
export function chooseVassalOrAnnex(
  state: GameState,
  winnerId: number,
  loserId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): 'annex' | 'vassalize' {
  const mine = computeLedger(state, winnerId, eco);
  const theirs = computeLedger(state, loserId, eco);

  // 병합: 상대 수입을 얻지만 행정비가 (내 칸 + 상대 칸)^지수 로 뛴다
  const adminNow = Math.pow(mine.cells, eco.adminExponent) * eco.adminCostPerCell;
  const adminAfter =
    Math.pow(mine.cells + theirs.cells, eco.adminExponent) * eco.adminCostPerCell;
  const annexGain = theirs.income - (adminAfter - adminNow);

  // 속국: 상대 순수입의 일부가 조공으로 들어온다. 행정비는 없다.
  const tributeGain = Math.max(0, theirs.net) * eco.tributeRateConquest;

  return annexGain >= tributeGain ? 'annex' : 'vassalize';
}

export function takeAITurn(
  state: GameState,
  nationId: number,
  w: AIWeights,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY,
  policy?: Policy
): AITurnLog {
  const moved = new Set<string>();
  const log: AITurnLog = { attacks: [], recruited: 0, fortsStarted: 0, moved };

  const homes = state.cells.filter((c) => c.castle && c.owner === nationId);
  // 안개 속에서는 '내가 아는' 적 본진만 셈에 넣는다
  const enemyHomes = state.cells.filter(
    (c) => c.castle && c.owner !== nationId && isExplored(state, nationId, c)
  );
  const hubs = adminHubs(state, nationId);
  const partial = { state, me: nationId, w, homes, enemyHomes, hubs, eco };
  const ctx: Ctx = {
    ...partial,
    target: pickTarget(partial),
    homeThreat: computeHomeThreat(state, nationId, homes),
    distress: findDistress(state, nationId),
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
    log.recruited = recruit(state, nationId, eco);
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

  // 명령 수에 한도가 있으면 아무 순서로나 쓸 수 없다. 값어치가 큰 수부터
  // 쓰는 것이 한도 아래에서 두는 법이다. 한도가 없으면 예전 그대로 둔다 —
  // 순서를 바꾸면 지금까지 재둔 기준선이 전부 무의미해진다.
  let budget = commandLimit(state, nationId, eco);
  if (budget !== Infinity) {
    const ranked: Array<{ id: string; score: number }> = [];
    for (const id of stackIds) {
      const c = state.cells.find((x) => x.id === id);
      if (!c) continue;
      const actions = scoreActions(ctx, c);
      if (policy?.score) for (const a of actions) a.score = policy.score(ctx, c, a);
      actions.sort((a, b) => b.score - a.score);
      const top = actions[0];
      const stay = actions.find((a) => a.kind === 'stay');
      // 제자리와의 차이가 곧 '이 명령을 쓸 값어치'다
      if (top && top.kind !== 'stay') ranked.push({ id, score: top.score - (stay?.score ?? 0) });
    }
    ranked.sort((a, b) => b.score - a.score);
    stackIds.length = 0;
    for (const r of ranked) stackIds.push(r.id);
  }

  for (const id of stackIds) {
    if (budget <= 0) break;
    const c = state.cells.find((x) => x.id === id);
    if (!c || c.owner !== nationId || c.units <= 0) continue;

    const actions = scoreActions(ctx, c);
    if (policy?.score) for (const a of actions) a.score = policy.score(ctx, c, a);
    actions.sort((a, b) => b.score - a.score);
    const best = policy?.select ? policy.select(actions, rng, ctx, c) : actions[0];
    if (!best) continue;
    // 제자리도 하나의 수다. 학습 자료에서 빼면 '가만히 있기'를 영영 못 배운다.
    policy?.onChoose?.(ctx, c, best, actions);
    if (best.kind === 'stay') continue;

    if (best.kind === 'attack') {
      const wasCastle = best.target.castle;
      const victim = best.target.owner;
      const out = performAttack(state, c, best.target, rng, eco);
      log.attacks.push(out);

      // 마지막 본진을 빼앗았다면 병합할지 속국으로 둘지 정한다
      if (
        wasCastle &&
        out.capturedCell &&
        victim !== null &&
        victim !== nationId &&
        state.nations[victim]?.alive &&
        !state.cells.some((x) => x.castle && x.owner === victim)
      ) {
        const choice = chooseVassalOrAnnex(state, nationId, victim, eco);
        resolveCastleLoss(state, victim, nationId, choice, best.target);
        if (choice === 'vassalize') vassalize(state, nationId, victim, 'conquest');
      }
    } else {
      moveStack(c, best.target);
    }
    moved.add(id);
    budget--;
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
