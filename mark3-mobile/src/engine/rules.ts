// 게임 규칙 — 이동, 전투 반영, 요새, 경제, 중립 세력, 무역상, 턴 진행
//
// 순수 함수는 아니다(상태를 제자리에서 고친다). 대신 React 에 의존하지 않아
// 헤드리스로 수천 판을 돌릴 수 있고, 난수는 전부 주입받는다.

import { getHexNeighborOffsets, hexDistance } from '../utils/hexGrid';
import {
  resolveCombat,
  CombatSide,
  RNG,
  DEFAULT_COMBAT_CONFIG,
  terrainDefense,
  DetailedCombatResult,
} from '../services/combatSystem';
import {
  Cell,
  GameState,
  EconomyConfig,
  DEFAULT_ECONOMY,
  Merchant,
  Nation,
  NATION_PRESETS,
  NeutralKind,
  Terrain,
} from './types';

// ─────────────────────────────────────────────────────────────
// 격자 조회
// ─────────────────────────────────────────────────────────────

export function cellAt(state: GameState, row: number, col: number): Cell | null {
  if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return null;
  return state.cells[row * state.cols + col];
}

export function cellById(state: GameState, id: string): Cell | null {
  return state.cells.find((c) => c.id === id) ?? null;
}

export function neighbors(state: GameState, c: Cell): Cell[] {
  const out: Cell[] = [];
  for (const o of getHexNeighborOffsets(c.row)) {
    const n = cellAt(state, c.row + o.dr, c.col + o.dc);
    if (n) out.push(n);
  }
  return out;
}

/** 이 칸이 누구와도 싸우지 않는 '빈 땅'인지 */
export function isEmptyLand(c: Cell): boolean {
  return c.units <= 0;
}

/** 두 진영이 적대적인지. 중립 세력(owner=null, units>0)은 모두에게 적이다. */
export function isHostile(a: Cell, b: Cell): boolean {
  if (b.units <= 0) return false;
  if (b.neutral) return true;
  if (a.neutral) return true;
  return b.owner !== a.owner;
}

// ─────────────────────────────────────────────────────────────
// 초기 상태
// ─────────────────────────────────────────────────────────────

export function createGameState(
  nationCount: number,
  rows: number,
  cols: number,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY
): GameState {
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const roll = rng();
      const terrain: Terrain =
        roll < 0.6 ? 'plain' : roll < 0.8 ? 'forest' : roll < 0.92 ? 'mountain' : 'desert';
      cells.push({
        id: `${r},${c}`,
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

  const nations: Nation[] = [];
  const state: GameState = {
    rows,
    cols,
    cells,
    nations,
    merchants: [],
    turn: 1,
    current: 0,
    log: [],
    winner: null,
  };

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

    let home = cellAt(state, r, c)!;
    if (home.owner !== null) {
      const alt = neighbors(state, home).find((n) => n.owner === null);
      if (alt) home = alt;
    }

    home.owner = i;
    home.castle = true;
    home.units = 6;
    home.terrain = 'plain';

    const side = neighbors(state, home).find((n) => n.owner === null);
    if (side) {
      side.owner = i;
      side.units = 5;
    }

    const preset = NATION_PRESETS[i] ?? {
      name: `국가${i}`,
      color: '#94a3b8',
      taxRate: 0.15,
    };
    nations.push({
      id: i,
      name: preset.name,
      color: preset.color,
      gold: eco.startingGold,
      fear: 50,
      justice: 50,
      taxRate: preset.taxRate,
      alive: true,
      isHuman: i === 0,
      suzerain: null,
      loyalty: 100,
      unpaidTurns: 0,
      vassalOrigin: null,
    });
  }

  // 중립 세력이 땅을 지킨다. 빈 땅이 공짜면 확장이 언제나 전투보다 이득이 된다.
  const mercCount = Math.max(nationCount, Math.round(rows * cols * eco.neutralDensity));
  for (let i = 0; i < mercCount; i++) {
    const cand = state.cells.filter(
      (c) => c.owner === null && c.units === 0 && distToNearestCastle(state, c) >= 2
    );
    if (cand.length === 0) break;
    const pick = cand[Math.floor(rng() * cand.length)];
    pick.units = 3 + Math.floor(rng() * 3);
    pick.neutral = 'mercenary';
  }

  return state;
}

function distToNearestCastle(state: GameState, c: Cell): number {
  let best = 99;
  for (const x of state.cells) {
    if (!x.castle) continue;
    const d = hexDistance(c.row, c.col, x.row, x.col);
    if (d < best) best = d;
  }
  return best;
}

// ─────────────────────────────────────────────────────────────
// 경제
// ─────────────────────────────────────────────────────────────

export function adminHubs(state: GameState, nationId: number): Cell[] {
  return state.cells.filter((c) => c.owner === nationId && (c.castle || c.fortStage === 4));
}

/**
 * 칸의 수입 효율 (0~1). 관리 거점에서 멀수록 떨어진다.
 * 요새를 지어 거점을 늘리는 것이 곧 영토를 쓸모 있게 만드는 길이다.
 */
export function cellEfficiency(c: Cell, hubs: Cell[], eco: EconomyConfig): number {
  if (hubs.length === 0) return 0.15;
  let best = 99;
  for (const h of hubs) {
    const d = hexDistance(c.row, c.col, h.row, h.col);
    if (d < best) best = d;
  }
  return 1 / (1 + best / eco.adminRange);
}

export interface Ledger {
  income: number;
  upkeep: number;
  admin: number;
  net: number;
  cells: number;
  units: number;
}

export function computeLedger(
  state: GameState,
  nationId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): Ledger {
  const hubs = adminHubs(state, nationId);
  let income = 0;
  let units = 0;
  let cells = 0;
  for (const c of state.cells) {
    if (c.owner !== nationId) continue;
    cells++;
    units += c.units;
    if (c.castle) income += eco.castleIncome;
    else if (c.fortStage === 4) income += eco.fortIncome;
    else income += eco.cellIncome * cellEfficiency(c, hubs, eco);
  }
  // 본진을 잃은 군대는 현지에서 조달한다.
  // 이게 없으면 본진 함락이 곧 수입 0 · 징병 불가로 이어져 회복할 길이 사라진다.
  // 공포가 높을수록 더 걷는다 — 약탈로 연명하는 군대다.
  const hasCastle = state.cells.some((c) => c.castle && c.owner === nationId);
  if (!hasCastle && units > 0) {
    const fear = state.nations[nationId]?.fear ?? 50;
    income += units * eco.forageIncomePerUnit * (0.5 + fear / 100);
  }

  const upkeep = units * eco.unitUpkeep;
  const admin = Math.pow(cells, eco.adminExponent) * eco.adminCostPerCell;
  return { income, upkeep, admin, net: income - upkeep - admin, cells, units };
}

/** 턴 시작 정산. 적자가 누적되면 병력이 이탈한다. */
export function applyUpkeep(
  state: GameState,
  nationId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): void {
  const n = state.nations[nationId];
  let l = computeLedger(state, nationId, eco);

  // 적자라면 먼저 땅이 떨어져 나간다.
  // 군대부터 해산시키면 영토만 남은 좀비 국가가 되어 게임이 끝나지 않는다.
  // 관리 못 하는 변두리가 먼저 이탈해야 제국이 감당 가능한 크기로 줄어든다.
  if (l.net < 0 && n.gold + l.net < 0) {
    const hubs = adminHubs(state, nationId);
    const sheddable = state.cells
      .filter((c) => c.owner === nationId && !c.castle && c.fortStage === 0 && c.units === 0)
      .sort((a, b) => cellEfficiency(a, hubs, eco) - cellEfficiency(b, hubs, eco));

    let shed = 0;
    for (const c of sheddable) {
      if (l.net >= 0) break;
      c.owner = null;
      c.hasRoad = false;
      shed++;
      l = computeLedger(state, nationId, eco);
    }
    if (shed > 0) {
      pushLog(state, `${n.name}: 유지하지 못한 변두리 ${shed}칸이 이탈했습니다`);
    }
  }

  n.gold += l.net;

  if (n.gold >= 0) {
    if (n.unpaidTurns > 0) {
      pushLog(state, `${n.name}: 밀린 급여를 지급했습니다`);
      n.unpaidTurns = 0;
    }
    return;
  }

  // 돈이 마르자마자 병력이 흩어지면 한 번의 실수가 곧바로 회복 불가가 된다.
  // 유예를 두고, 그동안은 사기만 깎인다.
  const shortfall = -n.gold;
  n.gold = 0;
  n.unpaidTurns++;

  const grace = desertionGrace(n, eco);
  if (n.unpaidTurns <= grace) {
    // 급여가 밀린 군대는 마음이 상한다
    for (const c of state.cells) {
      if (c.owner !== nationId || c.units <= 0) continue;
      c.morale = Math.max(0, c.morale - 6);
    }
    pushLog(
      state,
      `${n.name}: 급여가 밀렸습니다 (${n.unpaidTurns}/${grace}턴) — 사기 하락`
    );
    return;
  }

  const deserters = Math.ceil(shortfall / Math.max(0.1, eco.unitUpkeep));
  let left = deserters;
  for (const c of state.cells) {
    if (left <= 0) break;
    if (c.owner !== nationId || c.units <= 0 || c.castle) continue;
    const take = Math.min(c.units, left);
    c.units -= take;
    left -= take;
  }
  if (left > 0) {
    for (const c of state.cells) {
      if (left <= 0) break;
      if (c.owner !== nationId || c.units <= 0) continue;
      const take = Math.min(c.units - 1, left);
      if (take > 0) {
        c.units -= take;
        left -= take;
      }
    }
  }
  pushLog(state, `${n.name}: 급여를 못 견딘 병력이 이탈했습니다`);
}

/**
 * 급여가 밀려도 버티는 턴 수.
 * 정의로운 군주의 군대는 외상으로도 따라온다 — 정의가 높을수록 오래 버틴다.
 */
export function desertionGrace(n: Nation, eco: EconomyConfig = DEFAULT_ECONOMY): number {
  return eco.graceTurnsBase + Math.round((n.justice / 100) * eco.graceTurnsJustice);
}

// ─────────────────────────────────────────────────────────────
// 전투력 / 전투
// ─────────────────────────────────────────────────────────────

export function defenseMultiplier(c: Cell): number {
  let def = terrainDefense(c.terrain);
  if (c.fortStage === 4) def *= 1.3;
  if (c.castle) def *= 1.2;
  return def;
}

export function cellPower(c: Cell, isDefender: boolean): number {
  const def = isDefender ? defenseMultiplier(c) : 1;
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
 */
export function estimateWinProb(myPower: number, theirPower: number): number {
  if (theirPower <= 0) return 1;
  if (myPower <= 0) return 0;
  const r = myPower / theirPower;
  return (r * r) / (1 + r * r);
}

/** 중립 세력은 소속 국가가 없으므로 기본 평판을 쓴다 */
function repOf(state: GameState, c: Cell): { fear: number; justice: number } {
  if (c.owner === null) return { fear: 50, justice: 50 };
  const n = state.nations[c.owner];
  return n ? { fear: n.fear, justice: n.justice } : { fear: 50, justice: 50 };
}

function sideOf(state: GameState, c: Cell, isDefender: boolean): CombatSide {
  const rep = repOf(state, c);
  return {
    units: c.units,
    morale: c.morale,
    exhaustion: c.exhaustion,
    driftPP: c.driftPP,
    fear: rep.fear,
    justice: rep.justice,
    defenseMultiplier: isDefender ? defenseMultiplier(c) : 1,
    encircled: c.encircled,
  };
}

export function recomputeEncirclement(state: GameState): void {
  for (const c of state.cells) {
    if (c.units <= 0) {
      c.encircled = false;
      continue;
    }
    let hostile = 0;
    for (const o of getHexNeighborOffsets(c.row)) {
      const n = cellAt(state, c.row + o.dr, c.col + o.dc);
      // 맵 밖은 적으로 치지 않는다 — 구석에 있다고 포위된 건 아니다
      if (!n) continue;
      if (isHostile(c, n)) hostile++;
    }
    c.encircled = hostile >= 4;
  }
}

function clearStack(c: Cell): void {
  c.units = 0;
  c.morale = 100;
  c.exhaustion = 0;
  c.driftPP = 0;
  c.neutral = undefined;
  c.encircled = false;
}

export interface AttackOutcome {
  result: DetailedCombatResult;
  /** 공격국 / 피격국. 방어 성적을 집계하려면 필요하다. */
  attackerNation: number | null;
  defenderNation: number | null;
  /** 공격 시점 전력비. 1 미만이면 열세의 공격. */
  powerRatio: number;
  capturedCell: boolean;
  fromId: string;
  toId: string;
}

/** 이 칸을 빼앗았을 때 상대 국고에서 가져오는 액수 */
export function plunderValue(
  state: GameState,
  target: Cell,
  eco: EconomyConfig = DEFAULT_ECONOMY
): number {
  if (target.owner === null) return 0;
  const victim = state.nations[target.owner];
  if (!victim) return 0;
  const share = target.castle
    ? eco.plunderCastleShare
    : target.fortStage === 4
    ? eco.plunderFortShare
    : eco.plunderCellShare;
  return Math.max(0, Math.floor(victim.gold * share));
}

export function performAttack(
  state: GameState,
  from: Cell,
  to: Cell,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY
): AttackOutcome {
  const attackerNationId = from.neutral ? null : from.owner;
  const defenderNationId = to.neutral ? null : to.owner;
  const powerRatio = cellPower(from, false) / Math.max(0.001, cellPower(to, true));
  const res = resolveCombat(sideOf(state, from, false), sideOf(state, to, true), rng);

  from.driftPP = clamp(from.driftPP + res.attackerDriftDelta, -15, 15);
  to.driftPP = clamp(to.driftPP + res.defenderDriftDelta, -15, 15);
  from.exhaustion = Math.min(100, from.exhaustion + 25);
  to.exhaustion = Math.min(100, to.exhaustion + 15);

  let captured = false;

  if (res.outcome === 'attacker-win') {
    captured = true;

    // 약탈 — 전쟁이 돈이 되어야 부유한 나라가 표적이 된다.
    // 약탈은 공포를 키우고 정의를 깎는다.
    const loot = plunderValue(state, to, eco);
    if (loot > 0 && to.owner !== null && from.owner !== null) {
      const victim = state.nations[to.owner];
      const raider = state.nations[from.owner];
      victim.gold = Math.max(0, victim.gold - loot);
      raider.gold += loot;
      raider.fear = clamp(raider.fear + 2, 0, 100);
      raider.justice = clamp(raider.justice - 1, 0, 100);
      pushLog(state, `${raider.name}: ${victim.name}에게서 ${loot}G를 약탈했습니다`);
    }
    // 수비측 생존자는 인접 빈 칸으로 후퇴, 없으면 흩어진다
    const refuge = neighbors(state, to).find((n) => n.units === 0 && !n.castle);
    if (res.defenderSurvivors > 0 && refuge) {
      refuge.units = res.defenderSurvivors;
      refuge.morale = Math.max(20, res.defenderMorale);
      refuge.exhaustion = to.exhaustion;
      refuge.driftPP = to.driftPP;
      refuge.neutral = to.neutral;
      if (!to.neutral) refuge.owner = to.owner;
    }

    const attackerOwner = from.owner;
    const attackerNeutral = from.neutral;

    to.units = res.attackerSurvivors;
    to.morale = res.attackerMorale;
    to.exhaustion = from.exhaustion;
    to.driftPP = from.driftPP;
    to.neutral = attackerNeutral;
    to.fortStage = 0; // 점령 시 건설 중이던 요새는 무너진다
    if (!attackerNeutral) to.owner = attackerOwner;

    clearStack(from);
    // 출발 칸의 소유권은 남는다 (영토는 부대와 함께 사라지지 않는다)
    from.owner = attackerNeutral ? from.owner : attackerOwner;
  } else {
    from.units = res.attackerSurvivors;
    from.morale = res.attackerMorale;
    to.units = res.defenderSurvivors;
    to.morale = res.defenderMorale;
    if (from.units <= 0) {
      const o = from.owner;
      clearStack(from);
      from.owner = o;
    }
    if (to.units <= 0) {
      const o = to.owner;
      clearStack(to);
      to.owner = o;
    }
  }

  return {
    result: res,
    attackerNation: attackerNationId,
    defenderNation: defenderNationId,
    powerRatio,
    capturedCell: captured,
    fromId: from.id,
    toId: to.id,
  };
}

export function moveStack(from: Cell, to: Cell): void {
  const sameSide = to.units > 0 && to.owner === from.owner && to.neutral === from.neutral;
  if (sameSide) {
    const total = to.units + from.units;
    to.morale = (to.morale * to.units + from.morale * from.units) / total;
    to.exhaustion = (to.exhaustion * to.units + from.exhaustion * from.units) / total;
    to.driftPP = (to.driftPP * to.units + from.driftPP * from.units) / total;
    to.units = total;
  } else {
    to.units = from.units;
    to.morale = from.morale;
    to.exhaustion = Math.min(100, from.exhaustion + 10);
    to.driftPP = from.driftPP;
    to.neutral = from.neutral;
    if (!from.neutral) to.owner = from.owner;
  }
  const keepOwner = from.owner;
  clearStack(from);
  from.owner = keepOwner;
}

/** 움직이지 않은 부대는 사기와 피로가 회복된다 */
export function restUnmoved(state: GameState, nationId: number, moved: Set<string>): void {
  for (const c of state.cells) {
    if (c.owner !== nationId || c.units <= 0 || c.neutral) continue;
    if (moved.has(c.id)) continue;
    c.morale = Math.min(100, c.morale + 12);
    c.exhaustion = Math.max(0, c.exhaustion - 20);
    c.driftPP *= 0.9; // 기세는 시간이 지나면 식는다
  }
}

export function progressForts(state: GameState, nationId: number): void {
  for (const c of state.cells) {
    if (c.owner !== nationId) continue;
    if (c.fortStage >= 1 && c.fortStage < 4) c.fortStage++;
  }
}

export interface FortCheck {
  ok: boolean;
  reason?: string;
}

export function canBuildFort(
  state: GameState,
  c: Cell,
  nationId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): FortCheck {
  if (c.owner !== nationId) return { ok: false, reason: '내 영토가 아닙니다' };
  if (c.castle) return { ok: false, reason: '본진에는 지을 수 없습니다' };
  if (c.fortStage !== 0) return { ok: false, reason: '이미 요새가 있습니다' };
  if (c.units < 3) return { ok: false, reason: '유닛 3명 이상 필요' };
  if (state.nations[nationId].gold < eco.fortCost)
    return { ok: false, reason: `골드 부족 (${eco.fortCost}G)` };
  return { ok: true };
}

export function startFort(
  state: GameState,
  c: Cell,
  nationId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): boolean {
  if (!canBuildFort(state, c, nationId, eco).ok) return false;
  state.nations[nationId].gold -= eco.fortCost;
  c.fortStage = 1;
  return true;
}

/**
 * 징병은 성마다 이루어지고, 한 성은 한 턴에 한 번만 뽑는다.
 * 성을 여럿 가지면 그만큼 더 뽑을 수 있고, 같은 성에서 몰아 뽑을 수는 없다.
 *
 * 본진이 하나도 없으면 완공 요새가 임시 수도가 되므로(promoteCapitalIfNeeded)
 * 여기서는 성만 보면 된다.
 */
export function recruitableCastles(state: GameState, nationId: number): Cell[] {
  return state.cells.filter(
    (c) => c.castle && c.owner === nationId && c.recruitedTurn !== state.turn
  );
}

export function canRecruitAt(
  state: GameState,
  cell: Cell,
  nationId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): boolean {
  if (!cell.castle || cell.owner !== nationId) return false;
  if (cell.recruitedTurn === state.turn) return false;
  return state.nations[nationId].gold >= eco.recruitCost;
}

/** 성 한 곳에서 징병한다. 성공하면 true. */
export function recruitAt(
  state: GameState,
  cell: Cell,
  nationId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): boolean {
  if (!canRecruitAt(state, cell, nationId, eco)) return false;
  state.nations[nationId].gold -= eco.recruitCost;
  cell.units += eco.maxRecruitPerTurn;
  cell.recruitedTurn = state.turn;
  return true;
}

/** 뽑을 수 있는 모든 성에서 한 번씩. 실제로 뽑은 성의 수를 돌려준다. */
export function recruit(
  state: GameState,
  nationId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): number {
  let made = 0;
  for (const c of recruitableCastles(state, nationId)) {
    if (recruitAt(state, c, nationId, eco)) made++;
  }
  return made;
}

// ─────────────────────────────────────────────────────────────
// 중립 세력 — 용병과 강도
// ─────────────────────────────────────────────────────────────

/** 강도는 무역상을 노린다. 공포가 높은 나라의 무역상은 덜 건드린다. */
export function stepNeutrals(state: GameState, rng: RNG): void {
  const bandits = state.cells.filter((c) => c.neutral === 'bandit' && c.units > 0);

  for (const b of bandits) {
    // 인접한 무역상을 약탈
    const prey = state.merchants.find(
      (m) => hexDistance(b.row, b.col, m.row, m.col) <= 1
    );
    if (prey) {
      const owner = state.nations[prey.nation];
      const fearShield = owner ? owner.fear / 100 : 0.5;
      if (rng() > fearShield * 0.6) {
        state.merchants = state.merchants.filter((m) => m.id !== prey.id);
        pushLog(state, `강도가 ${owner?.name ?? ''} 무역상을 약탈했습니다 (-${prey.gold}G)`);
        continue;
      }
    }
    // 가장 가까운 무역상 쪽으로 한 칸
    let best: Cell | null = null;
    let bestD = Infinity;
    for (const n of neighbors(state, b)) {
      if (n.units > 0 || n.castle) continue;
      let d = Infinity;
      for (const m of state.merchants) {
        d = Math.min(d, hexDistance(n.row, n.col, m.row, m.col));
      }
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (best) moveStack(b, best);
  }

  // 무역상이 돌아다니면 이따금 강도가 나타난다.
  // 판에 도는 돈이 많을수록 자주 나타난다 — 부는 그 자체로 위험을 부른다.
  let richest = 0;
  for (const n of state.nations) if (n.alive && n.gold > richest) richest = n.gold;
  const banditChance = 0.08 + Math.min(0.14, richest / 20000);
  if (state.merchants.length > 0 && rng() < banditChance) {
    const m = state.merchants[Math.floor(rng() * state.merchants.length)];
    const spot = state.cells.find(
      (c) =>
        c.units === 0 &&
        !c.castle &&
        c.fortStage === 0 &&
        hexDistance(c.row, c.col, m.row, m.col) === 2
    );
    if (spot) {
      spot.units = 1 + Math.floor(rng() * 3);
      spot.neutral = 'bandit';
      pushLog(state, '강도가 출현했습니다');
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 무역상
// ─────────────────────────────────────────────────────────────

let merchantSeq = 0;

export function merchantDestinations(state: GameState): Cell[] {
  return state.cells.filter((c) => c.castle || c.fortStage === 4);
}

export function expectedTradeProfit(
  state: GameState,
  m: Merchant,
  dest: Cell,
  eco: EconomyConfig = DEFAULT_ECONOMY
): { gross: number; tax: number; net: number; taxRate: number; distance: number } {
  const distance = hexDistance(m.row, m.col, dest.row, dest.col);
  const mult = dest.castle ? eco.merchantCastleMultiplier : eco.merchantFortMultiplier;
  const gross = Math.floor(m.gold * mult * (1 + distance * 0.05));
  // 남의 나라에 팔아야 이문이 남는다. 자국 목적지는 세금이 없지만 배수도 의미가 없다.
  const foreign = dest.owner !== null && dest.owner !== m.nation;
  const taxRate = foreign ? state.nations[dest.owner as number].taxRate : 0;
  const tax = Math.floor(gross * taxRate);
  return { gross, tax, net: gross - tax, taxRate, distance };
}

/** 본진에서 무역상을 내보낸다 (완공 요새 2개 이상일 때) */
export function trySpawnMerchant(
  state: GameState,
  nationId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): Merchant | null {
  const forts = state.cells.filter((c) => c.owner === nationId && c.fortStage === 4);
  if (forts.length < 2) return null;
  const existing = state.merchants.filter((m) => m.nation === nationId).length;
  if (existing >= forts.length - 1) return null;
  const home = state.cells.find((c) => c.castle && c.owner === nationId);
  if (!home) return null;

  const m: Merchant = {
    id: `m${++merchantSeq}`,
    nation: nationId,
    row: home.row,
    col: home.col,
    gold: eco.merchantStake,
    phase: 'idle',
    originId: home.id,
    route: [],
    stayTurnsLeft: 0,
    roundTrips: 0,
  };
  state.merchants.push(m);
  pushLog(state, `${state.nations[nationId].name}: 무역상이 준비되었습니다`);
  return m;
}

/** 목적지까지의 경로 — 적 부대가 선 칸은 피한다 */
export function routeTo(state: GameState, m: Merchant, dest: Cell): string[] {
  const start = cellAt(state, m.row, m.col);
  if (!start) return [];
  const visited = new Set<string>([start.id]);
  const queue: Array<{ cell: Cell; path: string[] }> = [{ cell: start, path: [] }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.cell.id === dest.id) return cur.path;
    const ns = neighbors(state, cur.cell).sort(
      (a, b) =>
        hexDistance(a.row, a.col, dest.row, dest.col) -
        hexDistance(b.row, b.col, dest.row, dest.col)
    );
    for (const n of ns) {
      if (visited.has(n.id)) continue;
      const blocked = n.units > 0 && n.owner !== m.nation;
      if (blocked && n.id !== dest.id) continue;
      visited.add(n.id);
      queue.push({ cell: n, path: [...cur.path, n.id] });
    }
  }
  return [];
}

export function sendMerchant(state: GameState, m: Merchant, dest: Cell): boolean {
  const route = routeTo(state, m, dest);
  if (route.length === 0) return false;
  m.destinationId = dest.id;
  m.route = route;
  m.phase = 'outbound';
  m.originId = `${m.row},${m.col}`;
  return true;
}

/**
 * 무역상 한 턴.
 *
 * 예전 구현은 귀환 전환 시 경로만 바꾸고 destinationId 는 바깥 목적지로 둔 채여서
 * 본진에 닿아도 "목적지 도착" 판정이 서지 않았고, 정산 조건도 무역상 칸의
 * owner 가 'merchant' 인 탓에 영원히 거짓이었다. 그래서 수익이 한 번도 들어오지
 * 않았다. 여기서는 단계(phase)와 목적지를 항상 같이 바꾼다.
 */
export function stepMerchants(state: GameState, eco: EconomyConfig = DEFAULT_ECONOMY): void {
  for (const m of [...state.merchants]) {
    if (m.phase === 'idle') continue;

    if (m.phase === 'atTarget') {
      m.stayTurnsLeft--;
      if (m.stayTurnsLeft <= 0) {
        const origin = cellById(state, m.originId);
        if (origin) {
          const back = routeTo(state, m, origin);
          m.route = back;
          m.destinationId = origin.id;
          m.phase = 'returning';
        }
      }
      continue;
    }

    // 도로가 깔린 귀환길은 빠르다
    const here = cellAt(state, m.row, m.col);
    let steps = 1;
    if (m.phase === 'returning' && here?.hasRoad) steps = 2;

    for (let s = 0; s < steps && m.route.length > 0; s++) {
      const nextId = m.route[0];
      const next = cellById(state, nextId);
      if (!next) break;
      if (next.units > 0 && next.owner !== m.nation) {
        // 막혔다 — 다음 턴에 경로를 다시 잡는다
        const dest = m.destinationId ? cellById(state, m.destinationId) : null;
        if (dest) m.route = routeTo(state, m, dest);
        break;
      }
      m.route.shift();
      m.row = next.row;
      m.col = next.col;
      // 왕복을 거듭하면 길이 난다
      if (m.roundTrips >= 1 && !next.hasRoad) next.hasRoad = true;
    }

    if (m.route.length > 0) continue;

    const dest = m.destinationId ? cellById(state, m.destinationId) : null;
    if (!dest || dest.row !== m.row || dest.col !== m.col) continue;

    if (m.phase === 'outbound') {
      m.phase = 'atTarget';
      m.stayTurnsLeft = 2;
      const p = expectedTradeProfit(state, m, dest, eco);
      m.gold = p.net; // 팔고 받은 대금을 들고 돌아간다
      if (p.tax > 0 && dest.owner !== null) {
        state.nations[dest.owner].gold += p.tax;
        pushLog(
          state,
          `${state.nations[dest.owner].name}: 관세 +${p.tax}G (${state.nations[m.nation].name} 무역)`
        );
      }
      pushLog(state, `${state.nations[m.nation].name}: 무역상이 목적지에 도착했습니다`);
    } else if (m.phase === 'returning') {
      state.nations[m.nation].gold += m.gold;
      pushLog(state, `${state.nations[m.nation].name}: 무역 수익 +${m.gold}G`);
      m.roundTrips++;
      m.phase = 'idle';
      m.route = [];
      m.destinationId = undefined;
      m.gold = eco.merchantStake;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 턴 진행
// ─────────────────────────────────────────────────────────────

export function pushLog(state: GameState, msg: string): void {
  state.log.push(msg);
  if (state.log.length > 40) state.log.shift();
}

export function nationStats(state: GameState, nationId: number) {
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

export function updateAliveFlags(state: GameState): void {
  for (const n of state.nations) {
    if (!n.alive) continue;
    const s = nationStats(state, n.id);
    if (s.castles === 0 && s.units === 0) {
      n.alive = false;
      state.merchants = state.merchants.filter((m) => m.nation !== n.id);
      // 멸망한 나라는 종속 관계에서도 빠진다. 거느리던 속국은 풀려난다.
      n.suzerain = null;
      n.vassalOrigin = null;
      for (const v of state.nations) {
        if (v.alive && v.suzerain === n.id) {
          v.suzerain = null;
          v.vassalOrigin = null;
          v.loyalty = 50;
          pushLog(state, `${v.name}이(가) 종주국을 잃고 풀려났습니다`);
        }
      }
      pushLog(state, `${n.name}이(가) 멸망했습니다`);
    }
  }
  const alive = state.nations.filter((n) => n.alive);
  if (alive.length === 1) state.winner = alive[0].id;
}

/** 한 나라의 차례가 시작될 때 자동으로 벌어지는 일들 */
export function beginTurn(
  state: GameState,
  nationId: number,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY
): void {
  promoteCapitalIfNeeded(state, nationId);
  applyUpkeep(state, nationId, eco);
  progressForts(state, nationId);
  trySpawnMerchant(state, nationId, eco);
  recomputeEncirclement(state);
}

/**
 * 본진을 모두 잃었는데 완공 요새가 남아 있으면, 그중 하나가 임시 수도가 된다.
 * 본진 함락이 곧 회복 불가를 뜻하면 "차지하거나 버리거나"를 고친 의미가 없다.
 * 요새를 미리 지어둔 나라는 다시 일어설 수 있어야 한다.
 */
export function promoteCapitalIfNeeded(state: GameState, nationId: number): void {
  const n = state.nations[nationId];
  if (!n || !n.alive) return;
  if (state.cells.some((c) => c.castle && c.owner === nationId)) return;

  // 병력이 가장 많은 요새를 새 수도로 삼는다
  let best: Cell | null = null;
  for (const c of state.cells) {
    if (c.owner !== nationId || c.fortStage !== 4) continue;
    if (!best || c.units > best.units) best = c;
  }
  if (!best) return;

  best.castle = true;
  best.fortStage = 0;
  pushLog(state, `${n.name}: 요새 (${best.row},${best.col})를 임시 수도로 삼았습니다`);
}

/** 차례를 다음 살아있는 나라로 넘긴다 */
export function advanceTurn(state: GameState): void {
  const n = state.nations.length;
  for (let i = 1; i <= n; i++) {
    const next = (state.current + i) % n;
    if (state.nations[next].alive) {
      if (next <= state.current) state.turn++;
      state.current = next;
      return;
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * 마지막 본진을 빼앗겼을 때의 처분.
 * annex     그 나라는 멸망하고 영토가 전부 정복자에게 넘어간다. 행정비가 가팔라진다.
 * vassalize 본진을 돌려주고 속국으로 둔다. 영토는 그대로, 대신 조공을 받는다.
 */
export function resolveCastleLoss(
  state: GameState,
  loserId: number,
  winnerId: number,
  choice: 'annex' | 'vassalize',
  castle: Cell
): void {
  const loser = state.nations[loserId];
  const winner = state.nations[winnerId];
  if (!loser || !winner) return;

  if (choice === 'vassalize') {
    // 왕좌는 돌려주되 신하로 삼는다
    castle.owner = loserId;
    castle.units = Math.max(1, Math.floor(castle.units * 0.4));
    return;
  }

  for (const c of state.cells) {
    if (c.owner === loserId) c.owner = winnerId;
  }
  state.merchants = state.merchants.filter((m) => m.nation !== loserId);
  loser.alive = false;
  pushLog(state, `이(가) 에 병합되었습니다`);
}

export { DEFAULT_ECONOMY };
