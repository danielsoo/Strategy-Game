// AI — 평가 함수 기반
//
// "지금 당장 싸움에서 이긴다고 게임을 이기는 게 아니다"는 문제는 결국
// 평가 함수에 담긴다. 영토·병력·골드·본진·전진 중 무엇을 얼마나 중요하게
// 보느냐가 그 나라의 전략이 된다.
//
// 가중치를 사람이 정하지 않고 자가대전으로 고르는 게 최종 목표다.
// 지금은 몇 가지 성격을 손으로 정의해 토너먼트로 비교한다 — 그 결과가
// 나중에 학습의 기준선(baseline)이 된다.

import { hexDistance } from '../src/utils/hexGrid';
import { RNG } from '../src/services/combatSystem';
import {
  SimState,
  SimCell,
  EconomyConfig,
  neighbors,
  cellPower,
  cellEfficiency,
  adminHubs,
  estimateWinProb,
  performAttack,
  moveStack,
  AttackReport,
  terrainValue,
} from './engine';

export interface AIWeights {
  /** 칸 하나를 얼마나 가치 있게 보는가 */
  territory: number;
  /** 병력 하나의 가치 */
  units: number;
  /** 적 본진을 치는 것의 추가 가치 */
  castleAssault: number;
  /** 요새 점령/건설 선호 */
  fort: number;
  /** 승산이 낮아도 공격하는 정도 (1 = 기대값대로, >1 = 무모, <1 = 신중) */
  aggression: number;
  /** 병력을 뭉치려는 성향 */
  massing: number;
  /** 본진 주변에 머무르려는 성향 */
  homeDefense: number;
  /** 적 본진 쪽으로 전진하려는 성향 */
  advance: number;
  /** 빈 칸을 먹으려는 성향 */
  expansion: number;
  /** 방어 지형을 선호하는 정도 */
  terrain: number;
  /** 목표 병력 규모 — 이보다 적으면 징병을 우선한다 */
  targetArmy: number;
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

interface Ctx {
  state: SimState;
  me: number;
  w: AIWeights;
  /** 내 본진 좌표들 */
  homes: SimCell[];
  /** 적 본진 좌표들 */
  enemyHomes: SimCell[];
  /** 이번 턴의 전략 목표 — 가장 약하고 가까운 적 본진 */
  target: SimCell | null;
  /** 내 본진 주변 적 전력. 높으면 원정보다 수비를 택한다 */
  homeThreat: number;
  /** 관리 거점(본진·완공 요새) — 여기서 멀면 땅을 먹어도 돈이 안 된다 */
  hubs: SimCell[];
  eco: EconomyConfig;
}

/** 어떤 칸 주변(반경 2)의 특정 세력 전력 합 — "저기가 비었나"를 판단하는 눈 */
function localStrength(state: SimState, center: SimCell, owner: number | null): number {
  let total = 0;
  for (const c of state.cells) {
    if (owner !== null && c.owner !== owner) continue;
    if (owner === null && c.owner === null) continue;
    if (c.units <= 0) continue;
    const d = hexDistance(center.row, center.col, c.row, c.col);
    if (d > 2) continue;
    total += cellPower(c, false) * (d === 0 ? 1 : d === 1 ? 0.7 : 0.4);
  }
  return total;
}

/** 적 본진 중 '약하고 가까운' 곳을 이번 원정의 목표로 고른다. */
function pickTarget(ctx: Omit<Ctx, 'target' | 'homeThreat'>): SimCell | null {
  let best: SimCell | null = null;
  let bestScore = -Infinity;
  for (const h of ctx.enemyHomes) {
    const defense = localStrength(ctx.state, h, h.owner);
    const dist = minDist(h, ctx.homes);
    // 방어가 약할수록, 가까울수록 좋은 목표
    const score = ctx.w.castleAssault / (1 + defense * 0.5) - dist * 0.6;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

/** 내 본진들이 받고 있는 압박 */
function computeHomeThreat(state: SimState, me: number, homes: SimCell[]): number {
  let threat = 0;
  for (const h of homes) {
    let enemy = 0;
    for (const c of state.cells) {
      if (c.owner === null || c.owner === me || c.units <= 0) continue;
      const d = hexDistance(h.row, h.col, c.row, c.col);
      if (d > 3) continue;
      enemy += cellPower(c, false) / d;
    }
    threat += Math.max(0, enemy - localStrength(state, h, me) * 0.6);
  }
  return threat;
}

function minDist(c: SimCell, targets: SimCell[]): number {
  if (targets.length === 0) return 99;
  let best = 99;
  for (const t of targets) {
    const d = hexDistance(c.row, c.col, t.row, t.col);
    if (d < best) best = d;
  }
  return best;
}

/** 어떤 칸에 서 있는 것 자체의 가치 */
function positionValue(ctx: Ctx, c: SimCell): number {
  const w = ctx.w;
  let v = 0;
  v += w.terrain * terrainValue(c.terrain);

  // 본진이 위협받으면 집으로 당기는 힘이 커진다.
  // 다만 상한이 중요하다. 여기를 ×4까지 열어두면 본진 인력이 전진 기울기를
  // 압도해 전원이 집에 눌러앉고, 모든 나라가 이동 0회로 게임이 완전히 멎는다.
  const homePull = w.homeDefense * (1 + Math.min(0.8, ctx.homeThreat / 40));
  v += homePull * (2 / (1 + minDist(c, ctx.homes)));

  // 전진은 선형 기울기여야 한다.
  // 5/(1+거리) 형태는 원거리에서 평평해져(거리 9→0.50, 8→0.56) 멀리 있는 부대가
  // 적 쪽으로 움직일 이유를 잃는다. 그러면 각자 자기 땅에 눌러앉아 게임이 얼어붙는다.
  //
  // 그리고 '가장 가까운' 적이 아니라 '이번 원정 목표'를 향해 당겨야 한다.
  // 목표는 방어가 약한 적 본진으로 고른다 — 이게 없으면 AI는 적이 비었는지조차
  // 모른 채 적당한 거리에서 눌러앉는다.
  // 기울기 크기도 중요하다. 칸당 0.35 로는 빈 칸 점령(1.0)에 밀려서
  // 대군이 적 앞에 두고도 200턴 동안 땅만 칠하다 끝난다.
  const dist = ctx.target
    ? hexDistance(c.row, c.col, ctx.target.row, ctx.target.col)
    : minDist(c, ctx.enemyHomes);
  v += w.advance * Math.max(0, 14 - dist) * 1.0;
  return v;
}

/** 이 칸으로 옮겼을 때의 위험 — 주변 적 전력이 내 전력보다 크면 감점 */
function riskAt(ctx: Ctx, c: SimCell, myUnits: number, myPowerApprox: number): number {
  let hostile = 0;
  for (const n of neighbors(ctx.state, c)) {
    if (n.owner !== null && n.owner !== ctx.me && n.units > 0) {
      hostile += cellPower(n, false);
    }
  }
  if (hostile <= 0) return 0;
  // 위험은 '내 군대의 크기'가 아니라 '상대적 열세'다.
  // 절대 규모로 잡으면 대군일수록 겁을 먹어서, 77명 스택이 7명 지키는 성 옆에서
  // 한 발짝도 못 움직이고 게임이 멎는다. 압도적이면 위험은 0이어야 한다.
  const ratio = hostile / Math.max(0.001, myPowerApprox);
  const exposure = Math.max(0, Math.min(1.5, ratio - 0.6));
  return ctx.w.units * myUnits * 0.12 * exposure;
}

type Action =
  | { kind: 'stay'; score: number }
  | { kind: 'move'; score: number; target: SimCell }
  | { kind: 'attack'; score: number; target: SimCell };

function scoreActions(ctx: Ctx, c: SimCell): Action[] {
  const w = ctx.w;
  const myPower = cellPower(c, false);
  const actions: Action[] = [];

  // 제자리 — 휴식하며 지금 위치의 가치를 유지한다.
  //
  // 다만 목표에서 멀리 떨어진 채 가만히 있는 것은 그 자체로 손해다.
  // 이 항이 없으면 덧셈식 점수에 국소 최적점이 생겨, 대군이 적을 앞에 두고도
  // "제자리"를 최선으로 고르며 게임이 영구히 멎는다.
  const distToTarget = ctx.target
    ? hexDistance(c.row, c.col, ctx.target.row, ctx.target.col)
    : 0;
  const idlePenalty = distToTarget > 1 ? w.advance * 1.5 : 0;
  actions.push({
    kind: 'stay',
    score:
      positionValue(ctx, c) -
      idlePenalty +
      (c.exhaustion > 50 ? w.units * c.units * 0.2 : 0),
  });

  for (const n of neighbors(ctx.state, c)) {
    const isEnemy = n.owner !== null && n.owner !== ctx.me && n.units > 0;
    const isOwn = n.owner === ctx.me;

    if (isEnemy) {
      const p = estimateWinProb(myPower, cellPower(n, true));
      // 적 병력을 없애는 것이 이 게임에서 이기는 주된 방법이다.
      // 이 항이 작으면 AI가 평화롭게 빈 땅만 먹고 전쟁을 아예 하지 않는다.
      const prize =
        w.territory +
        w.units * n.units * 1.4 +
        (n.castle ? w.castleAssault : 0) +
        (n.fortStage === 4 ? w.fort : 0) +
        positionValue(ctx, n);
      // 비용은 '내 군대 전체'가 아니라 '예상 사상자'다. 전자로 잡으면
      // 군대가 클수록 공격을 꺼리는 거꾸로 된 행동이 나온다.
      const cost = w.units * c.units * 0.35;
      // aggression > 1 이면 기대값보다 승리 쪽을 과대평가한다 (무모함)
      const pAdj = Math.min(1, p * w.aggression);
      actions.push({ kind: 'attack', score: pAdj * prize - (1 - pAdj) * cost, target: n });
      continue;
    }

    // 병력 없는 적 영토 — 걸어 들어가 뺏는다. 전투 없음.
    if (n.owner !== null && n.owner !== ctx.me && n.units === 0) {
      actions.push({
        kind: 'move',
        score:
          w.expansion * w.territory * 1.5 + positionValue(ctx, n) - riskAt(ctx, n, c.units, myPower),
        target: n,
      });
      continue;
    }

    if (isOwn && n.units > 0) {
      // 합류 — 뭉치면 전투력이 오르지만 칸을 하나 비운다
      actions.push({
        kind: 'move',
        score: w.massing * Math.min(c.units, n.units) + positionValue(ctx, n) - w.territory,
        target: n,
      });
      continue;
    }

    if (n.owner === null && n.units === 0) {
      // 거점에서 먼 땅은 행정 비용만 나가는 순손실이다. 효율을 반영하지 않으면
      // AI가 돈도 안 되는 변두리를 끝없이 칠한다.
      const eff = cellEfficiency(n, ctx.hubs, ctx.eco);
      const gain = w.expansion * w.territory * (2 * eff - 0.4) + positionValue(ctx, n);
      actions.push({
        kind: 'move',
        score: gain - riskAt(ctx, n, c.units, myPower),
        target: n,
      });
      continue;
    }

    if (isOwn && n.units === 0) {
      actions.push({
        kind: 'move',
        score: positionValue(ctx, n) - riskAt(ctx, n, c.units, myPower),
        target: n,
      });
    }
  }

  return actions;
}

export interface TurnLog {
  attacks: AttackReport[];
  recruited: number;
  fortsStarted: number;
  /** 이번 턴에 움직인 부대 — 움직이지 않은 쪽만 휴식시키기 위해 필요하다 */
  moved: Set<number>;
}

export function takeAITurn(
  state: SimState,
  nationId: number,
  w: AIWeights,
  eco: EconomyConfig,
  rng: RNG
): TurnLog {
  const nation = state.nations[nationId];
  const moved = new Set<number>();
  const log: TurnLog = { attacks: [], recruited: 0, fortsStarted: 0, moved };

  const homes = state.cells.filter((c) => c.castle && c.owner === nationId);
  const enemyHomes = state.cells.filter(
    (c) => c.castle && c.owner !== null && c.owner !== nationId
  );
  const hubs = adminHubs(state, nationId);
  const partial = { state, me: nationId, w, homes, enemyHomes, hubs, eco };
  const ctx: Ctx = {
    ...partial,
    target: pickTarget(partial),
    homeThreat: computeHomeThreat(state, nationId, homes),
  };

  // 1. 징병 — 목표 병력에 못 미치면 본진에서 뽑는다
  //
  // 목표 병력은 영토에 비례해야 한다. 절대 상한으로 두면 82칸을 가진 나라가
  // 18명에서 징병을 멈추고 골드가 수만 단위로 쌓인 채 게임이 정지한다.
  let myUnits = 0;
  let myCells = 0;
  for (const c of state.cells) {
    if (c.owner !== nationId) continue;
    myUnits += c.units;
    myCells++;
  }
  const targetArmy = w.targetArmy + myCells * 0.6;
  if (homes.length > 0 && myUnits < targetArmy) {
    let n = 0;
    while (n < eco.maxRecruitPerTurn && nation.gold >= eco.recruitCost) {
      nation.gold -= eco.recruitCost;
      homes[0].units += 1;
      n++;
    }
    log.recruited = n;
  }

  // 2. 요새 — 거점에서 먼 땅을 쓸모 있게 만드는 수단이다.
  //    효율이 가장 낮은(= 가장 방치된) 내 땅에 짓는 것이 경제적으로 옳다.
  if (nation.gold >= eco.fortCost * 1.4) {
    let site: SimCell | null = null;
    let worst = 1;
    for (const c of state.cells) {
      if (c.owner !== nationId || c.castle || c.fortStage !== 0 || c.units < 3) continue;
      const eff = cellEfficiency(c, hubs, eco);
      if (eff < worst) {
        worst = eff;
        site = c;
      }
    }
    // fort 가중치가 높을수록 더 이른(효율이 덜 나쁜) 시점에도 짓는다
    if (site && worst < 0.35 + w.fort * 0.06) {
      nation.gold -= eco.fortCost;
      site.fortStage = 1;
      log.fortsStarted = 1;
    }
  }

  // 3. 부대별 행동 — 한 턴에 한 번씩
  const stackIdx: number[] = [];
  for (let i = 0; i < state.cells.length; i++) {
    const c = state.cells[i];
    if (c.owner === nationId && c.units > 0 && c.fortStage === 0) stackIdx.push(i);
  }
  // 무작위 순서 — 항상 같은 순서로 두면 편향이 생긴다
  for (let i = stackIdx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [stackIdx[i], stackIdx[j]] = [stackIdx[j], stackIdx[i]];
  }

  for (const i of stackIdx) {
    const c = state.cells[i];
    if (c.owner !== nationId || c.units <= 0) continue; // 이번 턴에 이미 사라졌을 수 있다

    const actions = scoreActions(ctx, c);
    actions.sort((a, b) => b.score - a.score);
    const best = actions[0];
    if (!best || best.kind === 'stay') continue;

    if (best.kind === 'attack') {
      log.attacks.push(performAttack(state, c, best.target, rng));
      moved.add(i);
    } else {
      moveStack(c, best.target);
      moved.add(i);
    }
  }

  return log;
}
