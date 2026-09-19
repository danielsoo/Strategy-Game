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
    });
  }

  // 중립 용병 몇 무리를 맵 가운데 쪽에 뿌린다
  const mercCount = Math.max(2, Math.floor(nationCount * 0.8));
  for (let i = 0; i < mercCount; i++) {
    const cand = state.cells.filter(
      (c) => c.owner === null && c.units === 0 && distToNearestCastle(state, c) >= 3
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
  const upkeep = units * eco.unitUpkeep;
  const admin = cells * eco.adminCostPerCell;
  return { income, upkeep, admin, net: income - upkeep - admin, cells, units };
}

/** 턴 시작 정산. 적자가 누적되면 병력이 이탈한다. */
export function applyUpkeep(
  state: GameState,
  nationId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): void {
  const n = state.nations[nationId];
  const l = computeLedger(state, nationId, eco);
  n.gold += l.net;

  if (n.gold < 0) {
    const deserters = Math.ceil(-n.gold / Math.max(0.1, eco.unitUpkeep));
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
    n.gold = 0;
    pushLog(state, `${n.name}: 재정이 바닥나 병력이 이탈했습니다`);
  }
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
  /** 공격 시점 전력비. 1 미만이면 열세의 공격. */
  powerRatio: number;
  capturedCell: boolean;
  fromId: string;
  toId: string;
}

export function performAttack(
  state: GameState,
  from: Cell,
  to: Cell,
  rng: RNG
): AttackOutcome {
  const powerRatio = cellPower(from, false) / Math.max(0.001, cellPower(to, true));
  const res = resolveCombat(sideOf(state, from, false), sideOf(state, to, true), rng);

  from.driftPP = clamp(from.driftPP + res.attackerDriftDelta, -15, 15);
  to.driftPP = clamp(to.driftPP + res.defenderDriftDelta, -15, 15);
  from.exhaustion = Math.min(100, from.exhaustion + 25);
  to.exhaustion = Math.min(100, to.exhaustion + 15);

  let captured = false;

  if (res.outcome === 'attacker-win') {
    captured = true;
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

  return { result: res, powerRatio, capturedCell: captured, fromId: from.id, toId: to.id };
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

export function recruit(
  state: GameState,
  nationId: number,
  count: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): number {
  const n = state.nations[nationId];
  const home = state.cells.find((c) => c.castle && c.owner === nationId);
  if (!home) return 0;
  let made = 0;
  while (made < count && n.gold >= eco.recruitCost) {
    n.gold -= eco.recruitCost;
    home.units += 1;
    made++;
  }
  if (made > 0) home.morale = Math.min(100, home.morale);
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

  // 무역상이 돌아다니면 이따금 강도가 나타난다
  if (state.merchants.length > 0 && rng() < 0.08) {
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
  applyUpkeep(state, nationId, eco);
  progressForts(state, nationId);
  trySpawnMerchant(state, nationId, eco);
  recomputeEncirclement(state);
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

export { DEFAULT_ECONOMY };
