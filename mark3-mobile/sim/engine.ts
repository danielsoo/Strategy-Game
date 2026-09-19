// 헤드리스 게임 엔진
//
// React 없이 전체 게임을 끝까지 돌린다. AI끼리 수천 판을 두게 해서
// "전투를 이기는 것"과 "게임을 이기는 것"이 어떻게 다른지 측정하기 위한 것.
//
// 주의: 지금은 GameScreen.tsx 의 턴 루프와 별개 구현이다. 규칙이 두 군데
// 존재하므로 갈라질 수 있다. 장기적으로는 이 엔진이 유일한 규칙이 되고
// GameScreen 이 이걸 호출하는 구조로 가야 한다.
//
// 경제는 최소한의 임시 모델이다(칸 수입 · 유닛 유지비 · 본진 징병).
// 세금/무역/속국이 들어오면 여기부터 바뀐다. 지금은 "생산이 없으면 초반 전투
// 결과가 그대로 게임 결과가 되어 시뮬레이션이 무의미해지기 때문에" 넣었다.

import { getHexNeighborOffsets, hexDistance } from '../src/utils/hexGrid';
import {
  resolveCombat,
  CombatSide,
  RNG,
  DEFAULT_COMBAT_CONFIG,
  terrainDefense,
} from '../src/services/combatSystem';

export type Terrain = 'plain' | 'forest' | 'mountain' | 'desert';

export interface SimCell {
  row: number;
  col: number;
  owner: number | null;
  units: number;
  morale: number;
  exhaustion: number;
  driftPP: number;
  terrain: Terrain;
  castle: boolean;
  /** 1~3 건설 중, 4 = 완공, 0 = 없음 */
  fortStage: number;
  encircled: boolean;
}

export interface SimNation {
  id: number;
  name: string;
  gold: number;
  fear: number;
  justice: number;
  alive: boolean;
}

export interface SimState {
  rows: number;
  cols: number;
  cells: SimCell[];
  nations: SimNation[];
  turn: number;
}

export interface EconomyConfig {
  cellIncome: number;
  castleIncome: number;
  fortIncome: number;
  unitUpkeep: number;
  recruitCost: number;
  maxRecruitPerTurn: number;
  fortCost: number;
  startingGold: number;
  /**
   * 관리 거점(본진·완공 요새)에서 멀어질 때 수입이 감쇠하는 척도.
   * 이게 없으면 걸어다니며 땅을 칠하는 것이 곧 수입이 되어 확장이 지배 전략이 된다.
   */
  adminRange: number;
  /** 칸 하나를 유지하는 데 드는 행정 비용. 먼 땅은 순손실이 되어야 한다. */
  adminCostPerCell: number;
}

// 균형의 핵심은 두 가지다.
//  1. 시작 국가가 흑자여야 한다. 본진 수입 < 초기 병력 유지비면 모두가 개전 전에
//     파산해 병력이 이탈하고, 무방비가 된 본진을 먼저 확장한 나라가 주워간다.
//  2. 대제국은 요새 없이는 적자여야 한다. 그래야 확장이 지배 전략이 되지 않는다.
export const DEFAULT_ECONOMY: EconomyConfig = {
  cellIncome: 2,
  castleIncome: 25,
  fortIncome: 8,
  unitUpkeep: 0.7,
  recruitCost: 18,
  maxRecruitPerTurn: 3,
  fortCost: 120,
  startingGold: 150,
  adminRange: 2.5,
  adminCostPerCell: 0.4,
};

const NATION_NAMES = [
  '북부왕국',
  '사막연맹',
  '산악부족',
  '자유도시동맹',
  '남부공국',
  '해안제후',
];

export function idx(state: SimState, row: number, col: number): number {
  if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return -1;
  return row * state.cols + col;
}

export function cellAt(state: SimState, row: number, col: number): SimCell | null {
  const i = idx(state, row, col);
  return i === -1 ? null : state.cells[i];
}

export function neighbors(state: SimState, c: SimCell): SimCell[] {
  const out: SimCell[] = [];
  for (const o of getHexNeighborOffsets(c.row)) {
    const n = cellAt(state, c.row + o.dr, c.col + o.dc);
    if (n) out.push(n);
  }
  return out;
}

export function createSimState(
  nationCount: number,
  rows: number,
  cols: number,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY
): SimState {
  const cells: SimCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const roll = rng();
      const terrain: Terrain =
        roll < 0.6 ? 'plain' : roll < 0.8 ? 'forest' : roll < 0.92 ? 'mountain' : 'desert';
      cells.push({
        row: r,
        col: c,
        owner: null,
        units: 0,
        morale: 100,
        exhaustion: 0,
        driftPP: 0,
        terrain,
        castle: false,
        fortStage: 0,
        encircled: false,
      });
    }
  }

  const nations: SimNation[] = [];
  const state: SimState = { rows, cols, cells, nations, turn: 1 };

  // 본진을 원형으로 고르게 배치한다
  const cr = (rows - 1) / 2;
  const cc = (cols - 1) / 2;
  const radius = Math.min(rows, cols) * 0.38;

  for (let i = 0; i < nationCount; i++) {
    const angle = (2 * Math.PI * i) / nationCount - Math.PI / 2;
    let r = Math.round(cr + radius * Math.sin(angle));
    let c = Math.round(cc + radius * Math.cos(angle));
    r = Math.max(1, Math.min(rows - 2, r));
    c = Math.max(1, Math.min(cols - 2, c));

    // 이미 쓰인 자리면 근처 빈 칸으로 민다
    let home = cellAt(state, r, c)!;
    if (home.owner !== null) {
      const alt = neighbors(state, home).find((n) => n.owner === null);
      if (alt) home = alt;
    }

    home.owner = i;
    home.castle = true;
    home.units = 6;
    home.terrain = 'plain';

    // 본진 옆에 병력 하나 더
    const side = neighbors(state, home).find((n) => n.owner === null);
    if (side) {
      side.owner = i;
      side.units = 5;
    }

    nations.push({
      id: i,
      name: NATION_NAMES[i] ?? `국가${i}`,
      gold: eco.startingGold,
      fear: 50,
      justice: 50,
      alive: true,
    });
  }

  return state;
}

/** 지형의 방어 가치 — AI가 자리를 고를 때 쓴다 */
export function terrainValue(t: Terrain): number {
  return terrainDefense(t);
}

/** 전투력 추정 — AI 판단과 엔진이 같은 기준을 쓰도록 한곳에 둔다 */
export function cellPower(c: SimCell, isDefender: boolean): number {
  let def = 1;
  if (isDefender) {
    def = terrainDefense(c.terrain);
    if (c.fortStage === 4) def *= 1.3;
    if (c.castle) def *= 1.2;
  }
  return (
    c.units *
    (1 + c.driftPP / 100) *
    def *
    (1 - (c.exhaustion / 100) * DEFAULT_COMBAT_CONFIG.exhaustionPowerMax)
  );
}

/**
 * 전투 승률 근사. 실제로 resolveCombat 을 돌리면 AI 탐색이 너무 느려진다.
 * p = r^2 / (1 + r^2) 는 sim/combatSim.ts 의 실측 표에 맞춰 고른 형태다.
 * (전력비 1.0 → 0.50, 1.43 → 0.67, 2.0 → 0.80 — 실측 0.47/0.67/0.80)
 */
export function estimateWinProb(myPower: number, theirPower: number): number {
  if (theirPower <= 0) return 1;
  if (myPower <= 0) return 0;
  const r = myPower / theirPower;
  const r2 = r * r;
  return r2 / (1 + r2);
}

function sideOf(c: SimCell, n: SimNation, isDefender: boolean): CombatSide {
  let def = 1;
  if (isDefender) {
    def = terrainDefense(c.terrain);
    if (c.fortStage === 4) def *= 1.3;
    if (c.castle) def *= 1.2;
  }
  return {
    units: c.units,
    morale: c.morale,
    exhaustion: c.exhaustion,
    driftPP: c.driftPP,
    fear: n.fear,
    justice: n.justice,
    defenseMultiplier: def,
    encircled: c.encircled,
  };
}

export function recomputeEncirclement(state: SimState): void {
  for (const c of state.cells) {
    if (c.owner === null || c.units === 0) {
      c.encircled = false;
      continue;
    }
    const ns = getHexNeighborOffsets(c.row);
    let hostile = 0;
    for (const o of ns) {
      const n = cellAt(state, c.row + o.dr, c.col + o.dc);
      // 맵 밖은 적으로 치지 않는다 — 구석에 있다고 포위된 건 아니다
      if (!n) continue;
      if (n.owner !== null && n.owner !== c.owner && n.units > 0) hostile++;
    }
    c.encircled = hostile >= 4;
  }
}

export interface AttackReport {
  attacker: number;
  defender: number;
  outcome: 'attacker-win' | 'defender-win' | 'stalemate';
  attackerUnitsBefore: number;
  defenderUnitsBefore: number;
  /** 공격 시점의 전력비 (1 미만이면 열세의 공격) */
  powerRatio: number;
}

/** 인접한 적 칸을 공격한다. 전투 결과를 상태에 반영한다. */
export function performAttack(
  state: SimState,
  from: SimCell,
  to: SimCell,
  rng: RNG
): AttackReport {
  const attNation = state.nations[from.owner!];
  const defNation = state.nations[to.owner!];
  const attUnitsBefore = from.units;
  const defUnitsBefore = to.units;
  const powerRatio = cellPower(from, false) / Math.max(0.001, cellPower(to, true));

  const res = resolveCombat(sideOf(from, attNation, false), sideOf(to, defNation, true), rng);

  from.driftPP = Math.max(-15, Math.min(15, from.driftPP + res.attackerDriftDelta));
  to.driftPP = Math.max(-15, Math.min(15, to.driftPP + res.defenderDriftDelta));
  from.exhaustion = Math.min(100, from.exhaustion + 25);
  to.exhaustion = Math.min(100, to.exhaustion + 15);

  if (res.outcome === 'attacker-win') {
    // 수비측 생존자는 인접 빈 칸으로 후퇴, 없으면 소멸
    const refuge = neighbors(state, to).find((n) => n.owner === null && n.units === 0);
    const defOwner = to.owner;
    if (res.defenderSurvivors > 0 && refuge) {
      refuge.owner = defOwner;
      refuge.units = res.defenderSurvivors;
      refuge.morale = Math.max(20, res.defenderMorale);
      refuge.exhaustion = to.exhaustion;
      refuge.driftPP = to.driftPP;
    }
    // 공격측이 칸을 차지한다
    to.owner = from.owner;
    to.units = res.attackerSurvivors;
    to.morale = res.attackerMorale;
    to.exhaustion = from.exhaustion;
    to.driftPP = from.driftPP;
    to.fortStage = 0; // 점령 시 건설 중이던 요새는 무너진다
    to.castle = to.castle; // 본진은 점령되어도 본진 자리로 남는다(소유만 바뀜)

    // 출발 칸은 소유한 채로 비워둔다 (moveStack 과 같은 이유)
    from.units = 0;
    from.morale = 100;
    from.exhaustion = 0;
    from.driftPP = 0;
  } else {
    // 방어 성공 또는 교착 — 공격측은 제자리에 남는다
    from.units = res.attackerSurvivors;
    from.morale = res.attackerMorale;
    to.units = res.defenderSurvivors;
    to.morale = res.defenderMorale;
    // 전멸해도 땅은 남는다 — 빈 칸이 되어 누구든 걸어 들어오면 넘어간다
    if (from.units <= 0) {
      from.units = 0;
      from.morale = 100;
      from.driftPP = 0;
      from.exhaustion = 0;
    }
    if (to.units <= 0) {
      to.units = 0;
      to.morale = 100;
      to.driftPP = 0;
      to.exhaustion = 0;
    }
  }

  return {
    attacker: attNation.id,
    defender: defNation.id,
    outcome: res.outcome,
    attackerUnitsBefore: attUnitsBefore,
    defenderUnitsBefore: defUnitsBefore,
    powerRatio,
  };
}

export function moveStack(from: SimCell, to: SimCell): void {
  if (to.owner === from.owner && to.units > 0) {
    // 합류 — 사기/피로는 가중평균
    const total = to.units + from.units;
    to.morale = (to.morale * to.units + from.morale * from.units) / total;
    to.exhaustion = (to.exhaustion * to.units + from.exhaustion * from.units) / total;
    to.driftPP = (to.driftPP * to.units + from.driftPP * from.units) / total;
    to.units = total;
  } else {
    to.owner = from.owner;
    to.units = from.units;
    to.morale = from.morale;
    to.exhaustion = from.exhaustion;
    to.driftPP = from.driftPP;
  }
  // 부대가 떠나도 칸의 소유권은 남는다.
  // 소유권이 부대와 함께 사라지면 "영토 = 현재 부대 수"가 되어 경제도 전선도
  // 성립하지 않는다. 땅은 점령한 채로 두고, 비어 있으면 적이 걸어 들어와 뺏는다.
  from.units = 0;
  from.morale = 100;
  from.exhaustion = 0;
  from.driftPP = 0;
}

/** 이 나라의 관리 거점 — 본진과 완공된 요새 */
export function adminHubs(state: SimState, nationId: number): SimCell[] {
  return state.cells.filter((c) => c.owner === nationId && (c.castle || c.fortStage === 4));
}

/**
 * 칸의 수입 효율 (0~1). 관리 거점에서 멀수록 떨어진다.
 * 요새를 지어 거점을 늘리는 것이 곧 영토를 쓸모 있게 만드는 길이다.
 */
export function cellEfficiency(c: SimCell, hubs: SimCell[], eco: EconomyConfig): number {
  if (hubs.length === 0) return 0.15;
  let best = 99;
  for (const h of hubs) {
    const d = hexDistance(c.row, c.col, h.row, h.col);
    if (d < best) best = d;
  }
  return 1 / (1 + best / eco.adminRange);
}

/** 턴 시작 시 수입·유지비 정산. 병력이 없는 칸은 회복한다. */
export function applyUpkeep(state: SimState, nationId: number, eco: EconomyConfig): void {
  const n = state.nations[nationId];
  const hubs = adminHubs(state, nationId);
  let income = 0;
  let units = 0;
  let cells = 0;
  for (const c of state.cells) {
    if (c.owner !== nationId) continue;
    cells++;
    units += c.units;
    if (c.castle) {
      income += eco.castleIncome;
      continue;
    }
    if (c.fortStage === 4) {
      income += eco.fortIncome;
      continue;
    }
    income += eco.cellIncome * cellEfficiency(c, hubs, eco);
  }
  n.gold += income - units * eco.unitUpkeep - cells * eco.adminCostPerCell;

  // 골드가 마이너스면 병력이 이탈한다 (유지 못 하는 군대는 흩어진다)
  if (n.gold < 0) {
    const deserters = Math.ceil(-n.gold / eco.unitUpkeep);
    let left = deserters;
    for (const c of state.cells) {
      if (left <= 0) break;
      if (c.owner !== nationId || c.units <= 0) continue;
      const take = Math.min(c.units, left);
      c.units -= take;
      left -= take;
    }
    n.gold = 0;
  }
}

/** 휴식 — 움직이지 않은 부대는 사기와 피로가 회복된다 */
export function restUnmoved(state: SimState, nationId: number, moved: Set<number>): void {
  for (let i = 0; i < state.cells.length; i++) {
    const c = state.cells[i];
    if (c.owner !== nationId || c.units <= 0) continue;
    if (moved.has(i)) continue;
    c.morale = Math.min(100, c.morale + 12);
    c.exhaustion = Math.max(0, c.exhaustion - 20);
    c.driftPP *= 0.9; // 기세는 시간이 지나면 식는다
  }
}

export function progressForts(state: SimState, nationId: number): void {
  for (const c of state.cells) {
    if (c.owner !== nationId) continue;
    if (c.fortStage >= 1 && c.fortStage < 4) c.fortStage++;
  }
}

export function nationStats(state: SimState, nationId: number) {
  let cells = 0;
  let units = 0;
  let castles = 0;
  let forts = 0;
  for (const c of state.cells) {
    if (c.owner !== nationId) continue;
    cells++;
    units += c.units;
    if (c.castle) castles++;
    if (c.fortStage === 4) forts++;
  }
  return { cells, units, castles, forts, gold: state.nations[nationId].gold };
}

export function updateAliveFlags(state: SimState): void {
  for (const n of state.nations) {
    if (!n.alive) continue;
    const s = nationStats(state, n.id);
    // 본진도 병력도 없으면 멸망
    if (s.castles === 0 && s.units === 0) n.alive = false;
  }
}
