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
import { createVision, recomputeVision } from './vision';
import { blocOf, atPeace, allied } from './treaty';
import { adjustRep, effF, effJ, wF, wJ } from './reputation';
import { stepDiplomacy, settleGuests } from './diplomacy';
export { blocOf };
import {
  decideDefense,
  decideDefenseAt,
  retreatSurvivors,
  surrenderOutcome,
  DefenseChoice,
} from './defense';

// ─────────────────────────────────────────────────────────────
// 격자 조회
// ─────────────────────────────────────────────────────────────

export function cellAt(state: GameState, row: number, col: number): Cell | null {
  if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return null;
  const c = state.cells[row * state.cols + col];
  return c && c.offMap ? null : c;
}

/** 판 안에 실제로 쓰이는 칸들 */
export function playableCells(state: GameState): Cell[] {
  return state.cells.filter((c) => !c.offMap);
}

/** 사각 격자 안에 깎아낼 육각형의 반지름과 중심 */
export function boardShape(rows: number, cols: number) {
  return {
    centerRow: Math.floor(rows / 2),
    centerCol: Math.floor(cols / 2),
    radius: Math.floor(Math.min(rows, cols) / 2),
  };
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
/**
 * 두 진영이 적대적인지. 중립 세력(owner=null, units>0)은 모두에게 적이다.
 *
 * 같은 진영(종주국과 그 속국들)끼리는 적이 아니다. 이걸 안 보던 때에는
 * 나라 상대 공격의 48.9% 가 자기 진영을 치는 것이었다 — 조공을 걷으면서
 * 동시에 전쟁을 하고 있었다.
 *
 * 진영 판단은 상태가 필요해서 밖에서 주입한다. state 없이 부르면 예전처럼
 * 주인만 비교한다.
 */
export function isHostile(a: Cell, b: Cell, state?: GameState): boolean {
  if (b.units <= 0) return false;
  if (b.neutral) return true;
  if (a.neutral) return true;
  if (b.owner === a.owner) return false;
  if (state && a.owner !== null && b.owner !== null) {
    // 같은 진영이거나 휴전·동맹이면 치지 않는다
    return !atPeace(state, a.owner, b.owner);
  }
  return true;
}

/**
 * 이 칸이 나에게 적인가. 진영을 본다.
 *
 * 곳곳에서 `owner !== me` 로 적을 가리고 있었는데, 그러면 내 속국이 전부
 * 적으로 잡힌다. 시야·태세·포위·협공이 모두 그 판단을 쓰므로 한 군데로 모은다.
 */
export function isFoeCell(state: GameState, me: number, c: Cell): boolean {
  if (c.units <= 0) return false;
  if (c.neutral) return true;
  if (c.owner === null) return false;
  return !atPeace(state, c.owner, me);
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
  // 판은 사각형이 아니라 육각형이다. 사각 격자를 만들고 바깥을 깎아낸다.
  // 그래야 모든 나라가 중심에서 같은 거리에 놓일 수 있다 — 사각 판에서는
  // 모서리에 앉은 나라가 구조적으로 불리하다.
  const shape = boardShape(rows, cols);

  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const outside =
        hexDistance(r, c, shape.centerRow, shape.centerCol) > shape.radius;
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
        // 0 에서 시작한다. 첫 턴의 beginTurn 이 한 번 채워주므로 100 으로 두면
        // 1턴부터 200 이 되어 "턴마다 100 차오름"과 어긋난다.
        march: 0,
        terrain,
        castle: false,
        fortStage: 0,
        encircled: false,
        offMap: outside,
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
    orderLog: [],
    winner: null,
    vision: [],
  };

  // 본진을 원형으로 고르게 배치한다
  const cr = (rows - 1) / 2;
  const cc = (cols - 1) / 2;
  const radius = Math.min(rows, cols) * 0.38;

  // 자리와 위치의 짝을 매 판 섞는다.
  //
  // 각도로 찍은 위치는 육각 격자에서 고르지 않다. 5인에서 재보니 0번 자리만
  // 가장 가까운 이웃이 5칸이고 나머지는 4칸이었고, 그게 승률 30% 대 18% 로
  // 그대로 나타났다. 배치가 고정이면 그 이점이 매 판 같은 자리에 간다.
  // 완벽히 고르게 놓을 수는 없으니, 누가 그 자리를 받을지를 운에 맡긴다.
  const slots = Array.from({ length: nationCount }, (_, i) => i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  for (let i = 0; i < nationCount; i++) {
    const angle = (2 * Math.PI * slots[i]) / nationCount - Math.PI / 2;
    let r = Math.round(cr + radius * Math.sin(angle));
    let c = Math.round(cc + radius * Math.cos(angle));
    r = Math.max(1, Math.min(rows - 2, r));
    c = Math.max(1, Math.min(cols - 2, c));

    // 깎아낸 바깥이나 이미 남이 앉은 자리면 가장 가까운 빈 칸으로 옮긴다
    let home = cellAt(state, r, c);
    if (!home || home.owner !== null) {
      let best: Cell | null = null;
      let bestD = Infinity;
      for (const x of state.cells) {
        if (x.offMap || x.owner !== null) continue;
        const d = hexDistance(x.row, x.col, r, c);
        if (d < bestD) {
          bestD = d;
          best = x;
        }
      }
      if (!best) continue;
      home = best;
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
      // 아무 성향 없이 시작한다 — 한 일이 쌓여 성격이 된다(reputation.ts)
      fear: 0,
      justice: 0,
      taxRate: preset.taxRate,
      alive: true,
      isHuman: i === 0,
      suzerain: null,
      loyalty: 100,
      unpaidTurns: 0,
      vassalOrigin: null,
    });
  }

  // 나라별 시야를 만들고 시작 위치를 밝힌다
  for (let i = 0; i < nationCount; i++) state.vision.push(createVision(cells.length));

  // 중립 세력이 땅을 지킨다. 빈 땅이 공짜면 확장이 언제나 전투보다 이득이 된다.
  const mercCount = Math.max(nationCount, Math.round(rows * cols * eco.neutralDensity));
  for (let i = 0; i < mercCount; i++) {
    const cand = state.cells.filter(
      (c) => !c.offMap && c.owner === null && c.units === 0 && distToNearestCastle(state, c) >= 2
    );
    if (cand.length === 0) break;
    const pick = cand[Math.floor(rng() * cand.length)];
    pick.units = 3 + Math.floor(rng() * 3);
    pick.neutral = 'mercenary';
    pick.bandGood = Math.round((rng() - 0.5) * 40);
    pick.bandIdle = 0;
  }

  for (let i = 0; i < nationCount; i++) recomputeVision(state, i, eco);

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
 * 한 턴에 내릴 수 있는 명령 수. 0 이면 제한 없음.
 *
 * 부대 수가 아니라 거점 수에 묶는다. 그래야 병력을 쪼갤수록 노는 부대가
 * 생기고, 비로소 모으는 쪽이 효율적인 선택이 된다. 지금 규칙에서는 반대다 —
 * 행동 횟수가 부대 수에 비례해서 쪼개는 쪽이 언제나 이긴다.
 */
export function commandLimit(
  state: GameState,
  nationId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): number {
  if (eco.commandBase <= 0) return Infinity;
  const hubs = adminHubs(state, nationId).length;
  return Math.max(1, Math.round(eco.commandBase + hubs * eco.commandPerHub));
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

/**
 * 행정비.
 *
 * 'cells^1.45' 로 두면 칸수가 절대값이라 판이 커질수록 비용이 폭발한다.
 * 21x21 에서 66칸을 쥐면 396, 11x11 에서 18칸이면 66 이다. 넓은 판에서는
 * 어느 나라도 제 몫만큼 뻗을 수 없어 다들 웅크리고, 그래서 오래 버티는
 * 쪽이 이겼다(수비형 43% · 공격형 4%).
 *
 * 판이 넓다고 한 고을 다스리기가 어려워질 이유는 없다. 어려워지는 것은
 * '내가 감당할 몫보다 얼마나 넘치게 쥐었나'다. 그래서 판 크기로 한 번
 * 나눠서 잰다 — 11x11(91칸)에서 1 이므로 그 판의 셈은 한 톨도 안 바뀐다.
 *
 *   admin = 칸당비용 × scale × (칸수 / scale)^지수      scale = 쓸 수 있는 칸 / 91
 *
 * 21x21 에서 66칸이면 396 → 231 이 된다. 지수를 1.3 으로 내린 것과 거의
 * 같은 값인데, 그쪽은 작은 판까지 같이 싸지므로 이 식이 맞다.
 */
export function adminCost(cells: number, playable: number, eco: EconomyConfig): number {
  const scale = Math.max(1, playable / 91);
  return eco.adminCostPerCell * scale * Math.pow(cells / scale, eco.adminExponent);
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
  let playable = 0;
  for (const c of state.cells) {
    if (!c.offMap) playable++;
    if (c.owner !== nationId) continue;
    cells++;
    units += c.units;
    // 손님으로 선 남의 땅은 아무에게도 거두지 못한다 — 주인은 군대가 서 있어
    // 못 걷고, 손님은 제 땅이 아니라 못 걷는다
    if (c.landlord !== undefined) continue;
    // 병합한 지 얼마 안 된 땅은 불안해서 거두지 못한다
    if (c.unrestUntil !== undefined && c.unrestUntil > state.turn) continue;
    if (c.castle) income += eco.castleIncome;
    else if (c.fortStage === 4) income += eco.fortIncome;
    else income += eco.cellIncome * cellEfficiency(c, hubs, eco);
  }
  // 본진을 잃은 군대는 현지에서 조달한다.
  // 이게 없으면 본진 함락이 곧 수입 0 · 징병 불가로 이어져 회복할 길이 사라진다.
  // 공포가 높을수록 더 걷는다 — 약탈로 연명하는 군대다.
  const hasCastle = state.cells.some((c) => c.castle && c.owner === nationId);
  if (!hasCastle && units > 0) {
    const fear = effF(state.nations[nationId]?.fear ?? 0);
    income += units * eco.forageIncomePerUnit * (0.5 + fear / 100);
  }

  income *= state.nations[nationId]?.incomeMul ?? 1;

  const upkeep = units * eco.unitUpkeep;
  const admin = adminCost(cells, playable, eco);
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
  return eco.graceTurnsBase + Math.round((effJ(n.justice) / 100) * eco.graceTurnsJustice);
}

// ─────────────────────────────────────────────────────────────
// 전투력 / 전투
// ─────────────────────────────────────────────────────────────

/**
 * 지키는 쪽의 전력 배수.
 *
 * 본진 1.2 · 요새 1.3 은 너무 물렀다. 평지 본진이면 6명이 7.2명 값이라
 * 10명만 데려오면 그냥 뚫렸고, AI 가 본진을 우선 노리게 하자 게임이 58턴으로
 * 짧아졌다. 성이란 적은 수로 많은 수를 막으라고 짓는 것이다.
 *
 * 짓는 중인 요새에도 조금 준다 — 공사장이라도 없는 것보다는 낫다.
 */
export function defenseMultiplier(c: Cell): number {
  let works = c.fortStage === 4 ? 1.5 : c.fortStage > 0 ? 1.1 : 1;
  if (c.castle) works *= 1.6;

  // 포위되면 보급이 끊긴다. 성벽은 그대로지만 지키는 힘은 대부분 사라진다.
  //
  // 성을 단단하게만 만들면 웅크리는 쪽이 이긴다 — 실제로 수비형이 40% 로
  // 독주했다. 요새를 무너뜨리는 정석은 정면 돌격이 아니라 에워싸는 것이고,
  // 그 길을 열어줘야 공성이 성립한다.
  if (c.encircled) works = 1 + (works - 1) * 0.35;

  return terrainDefense(c.terrain) * works;
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
  // 나라가 아닌 것(도적·용병)은 평판이 없다 — 중립
  if (c.owner === null) return { fear: 50, justice: 50 };
  const n = state.nations[c.owner];
  // 전투 공식은 옛 척도(50 중립)로 맞춰져 있다 — reputation.effective
  return n ? { fear: effF(n.fear), justice: effJ(n.justice) } : { fear: 50, justice: 50 };
}

/**
 * 이 칸 주위에서 같은 편이 보태줄 수 있는 전력 (자기 자신은 뺀다).
 * 협공은 붙어 있는 부대만 셈에 넣는다 — 전선이 이어져 있어야 한다.
 */
export function flankingSupport(
  state: GameState,
  around: Cell,
  side: Cell,
  eco: EconomyConfig = DEFAULT_ECONOMY
): number {
  let total = 0;
  for (const n of neighbors(state, around)) {
    if (n.id === side.id || n.units <= 0) continue;
    // 동맹군도 거든다 — 동맹이 '서로 안 친다' 에서 그치면 휴전과 다를 게 없다
    const sameSide = side.neutral
      ? n.neutral === side.neutral
      : !n.neutral &&
        (n.owner === side.owner ||
          (n.owner !== null && side.owner !== null && allied(state, n.owner, side.owner)));
    if (!sameSide) continue;
    // 지친 부대는 거들 힘도 없다
    total += n.units * (1 - (n.exhaustion / 100) * 0.5);
  }
  return total * eco.flankSupport;
}

function sideOf(
  state: GameState,
  c: Cell,
  isDefender: boolean,
  supportUnits = 0
): CombatSide {
  const rep = repOf(state, c);
  return {
    units: c.units,
    supportUnits,
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
      if (isHostile(c, n, state)) hostile++;
    }
    c.encircled = hostile >= 4;
  }
}

function clearStack(c: Cell): void {
  c.units = 0;
  c.morale = 100;
  c.exhaustion = 0;
  c.driftPP = 0;
  c.march = 100;
  c.order = undefined;
  c.neutral = undefined;
  c.bandGood = undefined;
  c.bandIdle = undefined;
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
  /** 수비자가 고른 것. 싸우지 않고 끝나면 result 는 빈 전투가 된다. */
  choice: DefenseChoice;
  /** 항복했을 때 공격자에 편입된 병력 */
  recruited?: number;
  /** 싸움에서 진 중립 무리가 달아난 칸 — 나라가 보내줄지 쫓을지 고른다 */
  fledBand?: string;
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

/** 물러날 자리 — 적에게서 가장 먼 빈 칸. 없으면 null. */
function retreatSpot(state: GameState, defender: Cell, attacker: Cell): Cell | null {
  let best: Cell | null = null;
  let bestD = -1;
  for (const n of neighbors(state, defender)) {
    if (n.units > 0 || n.castle) continue;
    if (n.owner !== null && n.owner !== defender.owner) continue; // 남의 땅으로는 못 물러난다
    const d = hexDistance(n.row, n.col, attacker.row, attacker.col);
    if (d > bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/**
 * 싸우지 않고 끝나는 경우.
 *
 * 후퇴  — 대열이 무너지며 일부를 잃고 옆 칸으로 빠진다. 연달아 물러나면 더 잃는다.
 * 항복  — 공격자의 공포·정의가 포로의 운명을 정한다. 편입된 병력은 공격자 것이 된다.
 */
function resolveWithoutBattle(
  state: GameState,
  from: Cell,
  to: Cell,
  choice: DefenseChoice,
  escape: Cell | null,
  powerRatio: number,
  eco: EconomyConfig
): AttackOutcome {
  const attackerNationId = from.neutral ? null : from.owner;
  const defenderNationId = to.neutral ? null : to.owner;
  const before = to.units;
  let recruited = 0;

  if (choice === 'retreat' && escape) {
    const survivors = retreatSurvivors(before, to.retreatStreak ?? 0);
    escape.owner = to.owner;
    escape.units = survivors;
    escape.morale = Math.max(20, to.morale - 15);
    escape.exhaustion = Math.min(100, to.exhaustion + 20);
    escape.driftPP = to.driftPP;
    escape.march = Math.max(0, to.march - marchCost(survivors, escape, eco));
    escape.retreatStreak = (to.retreatStreak ?? 0) + 1;
    escape.lastFrom = to.id;
    escape.order = to.order;
    pushLog(state, `${nameOf(state, defenderNationId)}: 물러났다 (${before} → ${survivors})`);
  } else {
    const att = from.owner !== null ? state.nations[from.owner] : null;
    const out = surrenderOutcome(before, effF(att?.fear ?? 0), effJ(att?.justice ?? 0));
    recruited = out.recruited;
    pushLog(
      state,
      `${nameOf(state, defenderNationId)}: 항복 — 처형 ${out.deaths} · 편입 ${out.recruited} · 흩어짐 ${out.escaped}`
    );
  }

  // 어느 쪽이든 칸은 넘어간다
  const keepOwner = from.owner;
  const moved = from.units + recruited;
  clearStack(to);
  to.owner = from.owner;
  to.units = Math.min(stackCap(eco), moved);
  to.morale = from.morale;
  to.exhaustion = Math.min(100, from.exhaustion + 10);
  to.driftPP = from.driftPP;
  to.march = Math.max(0, from.march);
  to.order = from.order;
  to.lastFrom = from.id;
  from.lastFrom = undefined;
  from.order = undefined;
  clearStack(from);
  from.owner = keepOwner;

  return {
    result: emptyCombat(before, to.units),
    attackerNation: attackerNationId,
    defenderNation: defenderNationId,
    powerRatio,
    capturedCell: true,
    fromId: from.id,
    toId: to.id,
    choice,
    recruited,
  };
}

function nameOf(state: GameState, id: number | null): string {
  return id !== null ? state.nations[id]?.name ?? '중립' : '중립';
}

/** 싸움이 없었을 때 넣을 빈 전투 기록 */
function emptyCombat(defBefore: number, attSurvivors: number): DetailedCombatResult {
  return {
    outcome: 'attacker-win',
    reason: 'rout',
    rounds: [],
    attackerSurvivors: attSurvivors,
    defenderSurvivors: 0,
    attackerMorale: 100,
    defenderMorale: 0,
    attackerDriftDelta: 0,
    defenderDriftDelta: 0,
    attackerResolvePP: 0,
    defenderResolvePP: 0,
    attackerSupport: 0,
    defenderSupport: 0,
  };
}

/**
 * 수비자가 고를 수 있는 것들. 사람에게 물어보려면 먼저 이걸 알아야 한다.
 */
export function defenseOptions(
  state: GameState,
  from: Cell,
  to: Cell,
  eco: EconomyConfig = DEFAULT_ECONOMY
): { options: DefenseChoice[]; escape: Cell | null; myPower: number; theirPower: number } {
  const escape = retreatSpot(state, to, from);
  const options: DefenseChoice[] = ['fight'];
  const fixed = to.castle || to.fortStage === 4 || !!to.neutral || to.owner === null;
  if (!fixed && escape) options.push('retreat');
  if (!fixed) options.push('surrender');
  return {
    options,
    escape,
    myPower: cellPower(to, true) + flankingSupport(state, to, to, eco),
    theirPower: cellPower(from, false) + flankingSupport(state, to, from, eco),
  };
}

export function performAttack(
  state: GameState,
  from: Cell,
  to: Cell,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY,
  /** 수비자의 선택을 밖에서 정해줄 때 (사람이 고른 경우) */
  forced?: DefenseChoice,
  /** 수비 판단에 섞을 잡음 — 난이도 */
  defenseNoise = 0
): AttackOutcome {
  // 접촉 전투도 행군을 먹는다. 다만 제자리에서 맞붙는 것이 행군보다는 수월하니
  // 절반만 문다. 이게 없으면 대군은 느려도 전투는 그대로라 반쪽짜리 규칙이 된다.
  from.march = Math.max(0, from.march - marchCost(from.units, to, eco) * ATTACK_MARCH_SHARE);
  const attackerNationId = from.neutral ? null : from.owner;
  const defenderNationId = to.neutral ? null : to.owner;
  const powerRatio = cellPower(from, false) / Math.max(0.001, cellPower(to, true));
  // 협공 — 전투가 벌어지는 칸에 붙어 있는 아군이 전력을 보탠다.
  // 공격측은 목표 칸 주위의 아군이, 수비측은 자기 칸 주위의 아군이 거든다.
  const attSupport = flankingSupport(state, to, from, eco);
  const defSupport = flankingSupport(state, to, to, eco);

  // 맞는 쪽이 먼저 정한다 — 맞설까, 물러날까, 항복할까.
  const escape = retreatSpot(state, to, from);
  const choice =
    forced ??
    decideDefenseAt(
      state,
      from,
      to,
      cellPower(to, true) + defSupport,
      cellPower(from, false) + attSupport,
      escape,
      rng,
      eco,
      defenseNoise
    );

  if (choice !== 'fight') {
    return resolveWithoutBattle(state, from, to, choice, escape, powerRatio, eco);
  }
  to.retreatStreak = 0;

  const res = resolveCombat(
    sideOf(state, from, false, attSupport),
    sideOf(state, to, true, defSupport),
    rng
  );

  from.driftPP = clamp(from.driftPP + res.attackerDriftDelta, -15, 15);
  to.driftPP = clamp(to.driftPP + res.defenderDriftDelta, -15, 15);
  from.exhaustion = Math.min(100, from.exhaustion + 25);
  to.exhaustion = Math.min(100, to.exhaustion + 15);

  let captured = false;
  let fledBand: string | undefined;

  /*
    동맹의 적과 함께 싸우는 것은 옳은 일이다 — 동맹이 '서로 안 친다' 에서 그치지
    않고 함께 짐을 지는 것이 되게. 공격마다 조금씩(+0.5): 한 판에 공격이 백 번을
    넘으니 크게 주면 정의가 싸움의 부산물이 된다.
  */
  if (from.owner !== null && to.owner !== null && !from.neutral && !to.neutral) {
    const me = from.owner;
    const foe = to.owner;
    const withAlly = state.nations.some(
      (a) => a.alive && a.id !== me && allied(state, me, a.id) && !atPeace(state, a.id, foe)
    );
    if (withAlly) adjustRep(state, me, +0.5, 0);
  }

  if (res.outcome === 'attacker-win') {
    captured = true;

    // 약탈 — 전쟁이 돈이 되어야 부유한 나라가 표적이 된다.
    //
    // 평판은 건드리지 않는다. 적국과 싸우며 전리품을 챙기는 것은 전쟁의
    // 기본이다. 평판에 걸리는 것은 싸움과 무관한 마을을 터는 일이고, 그건
    // 행군 사건(encounters.ts)의 대처가 맡는다. (처음엔 여기서 공포 +2 · 정의 -1
    // 을 붙였더니, 이긴 전투마다 따라붙어 거의 모든 나라가 공포의 나라가 됐다.)
    const loot = plunderValue(state, to, eco);
    if (loot > 0 && to.owner !== null && from.owner !== null) {
      const victim = state.nations[to.owner];
      const raider = state.nations[from.owner];
      victim.gold = Math.max(0, victim.gold - loot);
      raider.gold += loot;
      pushLog(state, `${raider.name}: ${victim.name}에게서 ${loot}G를 약탈했습니다`);
    }
    // 수비측 생존자는 인접 빈 칸으로 후퇴, 없으면 흩어진다.
    // 중립 무리는 주인 없는 땅으로만 달아난다 — 나라 땅에 서면 그 나라의
    // 병력으로 셈이 섞인다.
    const refuge = neighbors(state, to).find(
      (n) => n.units === 0 && !n.castle && (!to.neutral || n.owner === null)
    );
    if (res.defenderSurvivors > 0 && refuge) {
      refuge.units = res.defenderSurvivors;
      refuge.morale = Math.max(20, res.defenderMorale);
      refuge.exhaustion = to.exhaustion;
      refuge.driftPP = to.driftPP;
      refuge.neutral = to.neutral;
      refuge.bandGood = to.bandGood;
      refuge.bandIdle = 0;
      if (!to.neutral) refuge.owner = to.owner;
      // 나라가 무리를 이겼다 — 달아나는 자들을 보내줄지 쫓을지는 그 나라의 자비다
      if (to.neutral && from.owner !== null && !from.neutral) fledBand = refuge.id;
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
    choice: 'fight',
    fledBand,
  };
}

/**
 * 지형이 행군에 매기는 값. 길이 나 있으면 훨씬 수월하다 —
 * 무역상이 닦아놓은 길이 군대의 길이 되는 것도 역사 그대로다.
 */
export function terrainMarch(c: Cell): number {
  const base = c.terrain === 'mountain' ? 2 : c.terrain === 'forest' ? 1.5 : c.terrain === 'desert' ? 1.2 : 1;
  return c.hasRoad ? base * 0.6 : base;
}

/** 이 부대가 저 칸으로 한 칸 가는 데 드는 행군력 */
/** 공격이 무는 행군력의 비율 */
export const ATTACK_MARCH_SHARE = 0.5;

export function marchCost(units: number, to: Cell, eco: EconomyConfig = DEFAULT_ECONOMY): number {
  return (eco.marchBase + eco.marchPerUnit * Math.max(0, units)) * terrainMarch(to);
}

/** 한 칸에 설 수 있는 최대 병력 (0 이면 제한 없음) */
export function stackCap(eco: EconomyConfig = DEFAULT_ECONOMY): number {
  return eco.maxStackUnits > 0 ? eco.maxStackUnits : Infinity;
}

/**
 * 이 부대가 저 칸으로 갈 수 있는가.
 *
 * 두 가지를 본다 — 행군력이 남았는가, 그리고 합쳐서 상한을 넘지 않는가.
 * 상한을 넘는 합류는 아예 수가 아니다. 대신 옆에 붙어서 협공으로 싸우면 된다.
 */
/** 이 부대가 저 칸을 칠 수 있는가 */
export function canAttackFrom(from: Cell, to: Cell, eco: EconomyConfig = DEFAULT_ECONOMY): boolean {
  return from.units > 0 && from.march >= marchCost(from.units, to, eco) * ATTACK_MARCH_SHARE;
}

export function canMoveTo(from: Cell, to: Cell, eco: EconomyConfig = DEFAULT_ECONOMY): boolean {
  if (from.units <= 0) return false;
  if (from.march < marchCost(from.units, to, eco)) return false;
  const merging = to.units > 0 && to.owner === from.owner && to.neutral === from.neutral;
  if (merging && from.units + to.units > stackCap(eco)) return false;
  return true;
}

export function moveStack(from: Cell, to: Cell, eco: EconomyConfig = DEFAULT_ECONOMY): void {
  const spent = marchCost(from.units, to, eco);
  const sameSide = to.units > 0 && to.owner === from.owner && to.neutral === from.neutral;
  if (sameSide) {
    const total = to.units + from.units;
    to.morale = (to.morale * to.units + from.morale * from.units) / total;
    to.exhaustion = (to.exhaustion * to.units + from.exhaustion * from.units) / total;
    to.driftPP = (to.driftPP * to.units + from.driftPP * from.units) / total;
    // 합친 부대는 느린 쪽을 따른다. 대열이 길어지면 앞이 아니라 뒤가 속도를 정한다.
    to.march = Math.min(to.march, from.march - spent);
    to.lastFrom = from.id;
    // 합칠 때는 더 오래된 명령을 따른다 — 갓 붙은 쪽이 대열을 흔들면 안 된다
    if (!to.order || (from.order && from.order.age > to.order.age)) to.order = from.order;
    to.units = total;
  } else {
    to.units = from.units;
    to.morale = from.morale;
    to.exhaustion = Math.min(100, from.exhaustion + 10);
    to.driftPP = from.driftPP;
    to.neutral = from.neutral;
    to.march = Math.max(0, from.march - spent);
    to.lastFrom = from.id;
    to.order = from.order;
    to.bandGood = from.bandGood;
    to.bandIdle = from.bandIdle;
    if (!from.neutral) to.owner = from.owner;
  }
  const keepOwner = from.owner;
  from.lastFrom = undefined;
  from.order = undefined;
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
  // 성도 한 칸이다. 꽉 차 있으면 새 병력을 세울 자리가 없다 —
  // 먼저 밖으로 내보내야 한다. 이게 있어야 전선으로 병력이 흘러나간다.
  if (cell.units + eco.maxRecruitPerTurn > stackCap(eco)) return false;
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
/** 무리의 선악을 옮긴다 — 무리 자신이 한 일로만 */
function shiftBand(c: Cell, d: number): void {
  c.bandGood = Math.max(-100, Math.min(100, (c.bandGood ?? 0) + d));
}

function bandScale(state: GameState): number {
  return Math.max(0.5, Math.floor(Math.min(state.rows, state.cols) / 2) / 5);
}

/** 무리가 발을 디딜 수 있는 칸 — 주인 없는 빈 땅만. 나라 땅에 서면 셈이 섞인다. */
function openGround(c: Cell): boolean {
  return !c.offMap && c.units === 0 && c.owner === null && !c.castle && c.fortStage === 0;
}

/**
 * 중립 무리 — 도적과 용병. 저마다 하나의 AI 다.
 *
 * 예전에는 용병이 판을 만들 때 놓인 자리에 게임 내내 서 있었고, 도적은
 * 무역상 근처에만 생겼다. 그런데 무역상은 완공 요새가 둘 있어야 생기고
 * 학습된 AI 는 요새를 짓지 않아서(fort 0.0), 실제 판에는 무역상도 도적도
 * 한 번도 나오지 않았다(11·21 한 판씩: 무역상 0 · 강도 0).
 *
 * 이제 무리는 스스로 움직이고, 스스로 한 일로 선악이 바뀐다.
 *   도적  털 만한 나라 땅 쪽으로 떠돌다 마주치면 — 털거나(악 +3), 털 수
 *         있었는데 지나간다(선 +2). 공포 때문에 못 턴 것은 선택이 아니다(그대로).
 *         센 군대가 오면 달아나고, 털면 불어나고, 오래 굶으면 흩어진다.
 *         선이 60 을 넘으면 칼을 내려놓고 용병이 된다.
 *   용병  돈 많은 나라 쪽으로 천천히(2턴에 한 칸) 떠돈다. 마주친 나라에
 *         통행세를 뜯으면 악, 조용히 지나가면 선. 악한 용병이 오래 일거리를
 *         못 찾으면 도적이 된다. 고용할 수 있다(hireBand).
 *
 * 공포의 이득이 여기 있다 — 두려운 나라는 털지 못한다(공포만큼 억지). 정의의
 * 이득은 행군 사건 쪽이다 — 선한 도적은 정의로운 군대에 투항하기 쉽다.
 * 무리는 나라를 먼저 치지 않는다. 옆에서 털고, 센 군대가 오면 달아날 뿐이다.
 */
export function stepNeutrals(state: GameState, rng: RNG): void {
  // 나라마다 불리지만(한 바퀴에 나라 수만큼) 무리는 한 턴에 한 번만 움직인다.
  // 막지 않으면 다섯 나라 판에서 무리가 한 턴에 다섯 걸음을 간다.
  if (state.neutralTurn === state.turn) return;
  state.neutralTurn = state.turn;
  const scale = bandScale(state);
  const done = new Set<string>();
  const ids = state.cells.filter((c) => c.neutral && c.units > 0).map((c) => c.id);
  for (const id of ids) {
    if (done.has(id)) continue;
    const b = state.cells.find((c) => c.id === id);
    if (!b || !b.neutral || b.units <= 0) continue;
    if (b.bandGood === undefined) b.bandGood = b.neutral === 'bandit' ? -40 : 0;
    if (b.bandIdle === undefined) b.bandIdle = 0;
    const moved = b.neutral === 'bandit' ? stepBandit(state, b, rng, scale) : stepMerc(state, b, rng, scale);
    if (moved) done.add(moved.id);
  }
  spawnBandits(state, rng, scale);
}

/** 도적 한 무리의 한 턴. 옮겨갔으면 새 칸을 준다. */
function stepBandit(state: GameState, b: Cell, rng: RNG, scale: number): Cell | null {
  const myP = cellPower(b, false);

  // 1) 센 군대가 옆에 있으면 달아난다. 두려운 나라의 군대 앞에서는 더 일찍.
  let threat: Cell | null = null;
  for (const n of neighbors(state, b)) {
    if (n.units <= 0 || n.neutral || n.owner === null) continue;
    const F = Math.min(1, ((state.nations[n.owner]?.fear ?? 0) * wF()) / 100);
    if (cellPower(n, false) >= myP * (1.5 - 0.6 * F)) {
      threat = n;
      break;
    }
  }
  if (threat) {
    const t = threat;
    const esc = neighbors(state, b)
      .filter(openGround)
      .sort(
        (x, y) =>
          hexDistance(y.row, y.col, t.row, t.col) - hexDistance(x.row, x.col, t.row, t.col)
      )[0];
    if (esc) {
      moveStack(b, esc);
      return esc;
    }
    return null;
  }

  // 2) 옆의 무역상을 턴다 (무역상이 있을 때)
  const prey = state.merchants.find((m) => hexDistance(b.row, b.col, m.row, m.col) <= 1);
  if (prey) {
    const owner = state.nations[prey.nation];
    const fearShield = owner ? effF(owner.fear) / 100 : 0.5;
    if (rng() > fearShield * 0.6) {
      state.merchants = state.merchants.filter((m) => m.id !== prey.id);
      shiftBand(b, -3);
      b.bandIdle = 0;
      pushLog(state, `강도가 ${owner?.name ?? ''} 무역상을 약탈했습니다 (-${prey.gold}G)`);
      return null;
    }
  }

  // 3) 나라 땅과 마주쳤다 — 털까, 지나갈까
  const lands = neighbors(state, b).filter(
    (n) => !n.offMap && n.owner !== null && !n.neutral && n.units === 0 && !n.castle && n.fortStage === 0
  );
  if (lands.length > 0) {
    // 가장 덜 두려운 나라의 땅을 본다
    lands.sort(
      (x, y) => (state.nations[x.owner!]?.fear ?? 0) - (state.nations[y.owner!]?.fear ?? 0)
    );
    const n = state.nations[lands[0].owner!];
    const F = Math.min(1, (n.fear * wF()) / 100);
    /*
      탐욕 — 악할수록, 배고플수록 턴다. 처음엔 '0.5 - 선/200' 이었다. 선 -40 이면
      70% 를 털고 한 번 털 때마다 악이 3씩 붙으니 한 번 기울면 끝까지 갔다
      (21x21 한 판: 도적 여섯 중 다섯이 선 -100, 선한 도적이 용병이 된 일 0).
      배부른 무리는 지나가기도 해야 선으로 돌아올 길이 있다.
    */
    const hunger = Math.min(0.3, (b.bandIdle ?? 0) * 0.03);
    const greed = Math.max(0.05, Math.min(0.9, 0.35 - (b.bandGood ?? 0) / 300 + hunger));
    if (rng() < F * 0.9) {
      // 겁을 먹었다 — 털지 못했을 뿐 선택한 것은 아니다. 선악은 그대로.
      b.bandIdle = (b.bandIdle ?? 0) + 1;
    } else if (rng() < greed) {
      const steal = Math.min(Math.floor(n.gold), 1 + Math.floor(rng() * 3));
      n.gold -= steal;
      shiftBand(b, -2);
      b.bandIdle = 0;
      if (rng() < 0.5) b.units = Math.min(6, b.units + 1);
      if (n.isHuman) pushLog(state, `🦹 도적이 ${n.name}의 땅을 털었다 (-${steal}G)`);
      return null;
    } else {
      // 털 수 있었는데 지나갔다
      shiftBand(b, +2);
      b.bandIdle = (b.bandIdle ?? 0) + 1;
      if ((b.bandGood ?? 0) >= 60) {
        b.neutral = 'mercenary';
        b.bandIdle = 0;
        pushLog(state, '🦹 도적 무리가 칼을 내려놓고 용병이 되었다');
        return null;
      }
    }
  } else {
    b.bandIdle = (b.bandIdle ?? 0) + 1;
  }

  // 오래 굶었다 — 흩어진다
  if ((b.bandIdle ?? 0) > Math.round(14 * scale)) {
    clearStack(b);
    return null;
  }

  // 4) 털 만한 곳 쪽으로 — 덜 두려운 나라의 빈 땅. 없으면 떠돈다.
  const reach = Math.round(5 * scale);
  let goal: Cell | null = null;
  let goalScore = Infinity;
  for (const c of state.cells) {
    if (c.offMap || c.owner === null || c.neutral || c.units > 0 || c.castle) continue;
    const d = hexDistance(b.row, b.col, c.row, c.col);
    if (d > reach || d <= 1) continue;
    const score = d + (state.nations[c.owner]?.fear ?? 0) / 20;
    if (score < goalScore) {
      goalScore = score;
      goal = c;
    }
  }
  const steps = neighbors(state, b).filter(openGround);
  if (steps.length === 0) return null;
  let next: Cell | null = null;
  if (goal) {
    const g = goal;
    next = steps.reduce((a, x) =>
      hexDistance(x.row, x.col, g.row, g.col) < hexDistance(a.row, a.col, g.row, g.col) ? x : a
    );
  } else if (rng() < 0.5) {
    next = steps[Math.floor(rng() * steps.length)];
  }
  if (!next) return null;
  moveStack(b, next);
  return next;
}

/** 용병 한 무리의 한 턴 */
function stepMerc(state: GameState, b: Cell, rng: RNG, scale: number): Cell | null {
  b.bandIdle = (b.bandIdle ?? 0) + 1;

  // 마주친 나라 — 통행세를 뜯을까(악), 조용히 지나갈까(선)
  const land = neighbors(state, b).find((n) => !n.offMap && n.owner !== null && !n.neutral);
  if (land) {
    const n = state.nations[land.owner!];
    const F = Math.min(1, (n.fear * wF()) / 100);
    if (rng() < F * 0.9) {
      // 겁을 먹었다 — 선악은 그대로
    } else if (rng() < Math.max(0.02, 0.3 - (b.bandGood ?? 0) / 300)) {
      const toll = Math.min(Math.floor(n.gold), 2);
      n.gold -= toll;
      shiftBand(b, -3);
      if (n.isHuman) pushLog(state, `⚔️ 용병 무리가 ${n.name}에게서 통행세를 뜯었다 (-${toll}G)`);
    } else {
      shiftBand(b, +1);
    }
  }

  // 일거리를 못 찾은 악한 용병은 도적이 된다
  if ((b.bandGood ?? 0) < -30 && (b.bandIdle ?? 0) > Math.round(16 * scale)) {
    b.neutral = 'bandit';
    b.bandIdle = 0;
    pushLog(state, '⚔️ 일거리를 잃은 용병 무리가 도적이 되었다');
    return null;
  }

  // 떠돈다 — 2턴에 한 칸, 돈 많은 나라의 국경 쪽으로
  if ((state.turn + b.row + b.col) % 2 !== 0) return null;
  let rich: number | null = null;
  for (const n of state.nations) {
    if (!n.alive) continue;
    if (rich === null || n.gold > state.nations[rich].gold) rich = n.id;
  }
  if (rich === null) return null;
  let goal: Cell | null = null;
  let best = Infinity;
  for (const c of state.cells) {
    if (c.owner !== rich || c.neutral) continue;
    const d = hexDistance(b.row, b.col, c.row, c.col);
    if (d < best) {
      best = d;
      goal = c;
    }
  }
  if (!goal || best <= 1) return null;
  const g = goal;
  const steps = neighbors(state, b).filter(openGround);
  if (steps.length === 0) return null;
  const next = steps.reduce((a, x) =>
    hexDistance(x.row, x.col, g.row, g.col) < hexDistance(a.row, a.col, g.row, g.col) ? x : a
  );
  if (hexDistance(next.row, next.col, g.row, g.col) >= best) return null;
  moveStack(b, next);
  return next;
}

/**
 * 도적이 생겨난다 — 무역상과 상관없이, 주인 없는 변두리에서. 한 턴에 한 번.
 * 판에 도는 돈이 많을수록 자주. 판 크기만큼 무리 수의 상한도 늘린다.
 */
function spawnBandits(state: GameState, rng: RNG, scale: number): void {
  const alive = state.nations.filter((n) => n.alive).length;
  const now = state.cells.filter((c) => c.neutral === 'bandit' && c.units > 0).length;
  if (now >= Math.max(1, Math.round(alive * scale))) return;
  let richest = 0;
  for (const n of state.nations) if (n.alive && n.gold > richest) richest = n.gold;
  const chance = (0.1 + Math.min(0.15, richest / 6000)) * scale;
  if (rng() >= chance) return;
  const spots = state.cells.filter(
    (c) =>
      openGround(c) &&
      distToNearestCastle(state, c) >= 3 &&
      !neighbors(state, c).some((n) => n.units > 0 && !n.neutral)
  );
  if (spots.length === 0) return;
  const spot = spots[Math.floor(rng() * spots.length)];
  spot.units = 1 + Math.floor(rng() * 3);
  spot.neutral = 'bandit';
  spot.bandGood = -40 + Math.round((rng() - 0.5) * 30);
  spot.bandIdle = 0;
  spot.morale = 100;
  spot.exhaustion = 0;
  pushLog(state, '🦹 변두리에 도적 무리가 나타났다');
}

/**
 * 조우 — 내 부대가 무리와 맞닿았다. 무리와의 일은 모두 여기서 시작한다:
 * 계약하거나, 물러나라 하거나, 친다(performAttack). 무리를 멀리서 고용하는
 * 길은 없다 — 직접 가서 마주쳐야 한다.
 */
export function inContact(state: GameState, from: Cell, band: Cell): boolean {
  return (
    !!band.neutral &&
    band.units > 0 &&
    from.owner !== null &&
    !from.neutral &&
    from.units > 0 &&
    hexDistance(from.row, from.col, band.row, band.col) === 1
  );
}

/** 이 무리가 계약을 받아들일 가망 — 용병은 쉽고, 도적은 선할수록. 정의로운 나라에 더. */
export function contractOdds(state: GameState, nationId: number, band: Cell): number {
  const n = state.nations[nationId];
  const g = band.bandGood ?? 0;
  const J = Math.min(1, ((n?.justice ?? 0) * wJ()) / 100);
  const F = Math.min(1, ((n?.fear ?? 0) * wF()) / 100);
  const base = band.neutral === 'mercenary' ? 0.6 + g / 200 : 0.15 + g / 150;
  // 두려운 나라에게는 겁먹고 응하기도 한다 — 다만 정의만큼은 아니다
  return Math.max(0.05, Math.min(0.95, base + J * 0.3 + F * 0.15));
}

/** 물러나라 할 때 물러날 가망 — 내 힘이 셀수록, 두려울수록, 무리가 선할수록 */
export function leaveOdds(state: GameState, from: Cell, band: Cell): number {
  const F = Math.min(1, ((from.owner !== null ? state.nations[from.owner]?.fear ?? 0 : 0) * wF()) / 100);
  const ratio = (cellPower(from, false) * (1 + F)) / Math.max(0.5, cellPower(band, false));
  return Math.max(0.05, Math.min(0.95, 0.2 + (ratio - 1) * 0.5 + (band.bandGood ?? 0) / 200));
}

/** 계약 값 — 선한 무리는 싸고, 악한 무리는 비싸다. 도적은 더 비싸다. */
export function hireCost(c: Cell, eco: EconomyConfig = DEFAULT_ECONOMY): number {
  const bandit = c.neutral === 'bandit' ? 1.3 : 1;
  return Math.round(eco.recruitCost * c.units * (1.2 - (c.bandGood ?? 0) / 200) * bandit);
}

/**
 * 계약을 청한다. 무리가 받아들이면 그 자리에서 내 부대가 된다.
 * 받든 안 받든 돈은 받아들일 때만 나간다.
 */
export function contractBand(
  state: GameState,
  fromId: string,
  bandId: string,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY
): { ok: boolean; reason: string } {
  const from = state.cells.find((x) => x.id === fromId);
  const band = state.cells.find((x) => x.id === bandId);
  if (!from || !band || !inContact(state, from, band)) return { ok: false, reason: '맞닿아 있지 않다' };
  const n = state.nations[from.owner!];
  const cost = hireCost(band, eco);
  if (n.gold < cost) return { ok: false, reason: '돈이 모자라다' };
  const what = band.neutral === 'mercenary' ? '용병' : '도적';
  if (rng() >= contractOdds(state, n.id, band)) {
    pushLog(state, `${n.name}: ${what} 무리가 계약을 거절했다`);
    return { ok: false, reason: band.neutral === 'mercenary' ? '값이 맞지 않는다며 고개를 젓는다' : '비웃으며 침을 뱉는다' };
  }
  n.gold -= cost;
  const units = band.units;
  band.neutral = undefined;
  band.bandGood = undefined;
  band.bandIdle = undefined;
  band.owner = n.id;
  band.march = 0;
  pushLog(state, `${n.name}: ${what} 무리 ${units}명과 계약했다 (-${cost}G)`);
  return { ok: true, reason: '' };
}

/**
 * 물러나라 한다. 무리가 정한다 — 물러나면(선 +1) 두 칸쯤 떨어진 빈 땅으로
 * 가고, 갈 곳이 없으면 흩어진다. 거부하면 악 -1.
 */
export function demandLeave(
  state: GameState,
  fromId: string,
  bandId: string,
  rng: RNG
): { ok: boolean; reason: string } {
  const from = state.cells.find((x) => x.id === fromId);
  const band = state.cells.find((x) => x.id === bandId);
  if (!from || !band || !inContact(state, from, band)) return { ok: false, reason: '맞닿아 있지 않다' };
  const n = state.nations[from.owner!];
  const what = band.neutral === 'mercenary' ? '용병' : '도적';
  if (rng() >= leaveOdds(state, from, band)) {
    shiftBand(band, -1);
    pushLog(state, `${n.name}: ${what} 무리가 물러나기를 거부했다`);
    return { ok: false, reason: '꿈쩍도 하지 않는다' };
  }
  shiftBand(band, +1);
  // 내 부대에게서 멀어지는 쪽으로 두 걸음
  let at: Cell = band;
  for (let step = 0; step < 2; step++) {
    const away = neighbors(state, at)
      .filter(openGround)
      .sort(
        (x, y) =>
          hexDistance(y.row, y.col, from.row, from.col) - hexDistance(x.row, x.col, from.row, from.col)
      )[0];
    if (!away || hexDistance(away.row, away.col, from.row, from.col) <= hexDistance(at.row, at.col, from.row, from.col)) break;
    moveStack(at, away);
    at = away;
  }
  if (at === band) {
    clearStack(band);
    pushLog(state, `${n.name}: ${what} 무리가 물러나 흩어졌다`);
  } else {
    pushLog(state, `${n.name}: ${what} 무리가 물러났다`);
  }
  return { ok: true, reason: '' };
}

/**
 * 싸움에서 진 무리가 달아난다 — 보내주면 자비(공포 -1), 쫓아 섬멸하면 공포 +1.
 * 무리의 선악은 바꾸지 않는다. 무리의 선악은 무리 자신이 한 일로만 바뀐다.
 */
export function spareBand(state: GameState, nationId: number): void {
  adjustRep(state, nationId, 0, -1);
}

export function slayBand(state: GameState, nationId: number, cellId: string): void {
  const c = state.cells.find((x) => x.id === cellId);
  if (c && c.neutral && c.units > 0) clearStack(c);
  adjustRep(state, nationId, 0, +1);
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
  // 손님 부대가 떠난 칸은 원래 주인에게, 전쟁이 된 칸은 쥔 쪽에게.
  // 수입을 셈하기 전에 해야 떠난 칸의 수입이 제 주인에게 간다.
  settleGuests(state);
  promoteCapitalIfNeeded(state, nationId);
  // 행군력을 되채운다. 쉰 부대가 다시 걸을 힘을 얻는 자리다.
  for (const c of state.cells) {
    if (c.owner === nationId && !c.neutral) c.march = Math.min(eco.marchMax, c.march + eco.marchRegen);
  }
  applyUpkeep(state, nationId, eco);
  progressForts(state, nationId);
  trySpawnMerchant(state, nationId, eco);
  recomputeEncirclement(state);
  // 조약의 만료·정리, 그리고 AI 라면 외교. 턴 시작에 두는 것은 이 자리가
  // 화면·하네스의 모든 판 루프가 거치는 유일한 곳이기 때문이다.
  stepDiplomacy(state, nationId, rng, eco);
  recomputeVision(state, nationId, eco);
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
    // 왕좌는 돌려주되 신하로 삼는다. 나라를 살려두었다 — 자비이고, 옳은 일이다.
    // (처음엔 공포 -3 만 줬다. 정의의 길이 정의를 쌓을 길이 없어 '정의의 나라' 가
    // 되는 나라가 8~19% 뿐이었다 — sim/paths.ts)
    castle.owner = loserId;
    castle.units = Math.max(1, Math.floor(castle.units * 0.4));
    adjustRep(state, winnerId, +2, -3);
    return;
  }
  // 나라를 지웠다 — 세상은 그것을 잊지 않는다
  adjustRep(state, winnerId, 0, +4);

  // 병합한 땅은 한동안 다스리기 어렵다 — 불안이 가라앉을 때까지 수입이 없다
  // 판 크기로 늘리지 않는다 — 늘렸더니 21x21 에서만 병합이 지나치게 불리해져
  // 정의의 길이 앞섰다(승률비 11x11 0.75~1.02 · 21x21 1.13~1.22).
  const calm = state.turn + DEFAULT_ECONOMY.annexUnrestTurns;
  /*
    나라를 잃은 병사들은 새 주인을 따르지 않는다. 일부만 따라오고, 나머지는
    도적이 되어 흩어진다. 예전에는 군대를 통째로 흡수해서 병합이 눈덩이가 됐다 —
    공포의 길(늘 병합)이 정의의 길(늘 속국)을 압도한 까닭이 이것이었다
    (sim/paths.ts: 병합 대 속국만 끄면 승률비 0.37 → 1.47, 수입·충성은 무관).
  */
  const keep = DEFAULT_ECONOMY.annexArmyKeep;
  for (const c of state.cells) {
    if (c.owner === loserId) {
      c.owner = winnerId;
      if (DEFAULT_ECONOMY.annexUnrestTurns > 0) c.unrestUntil = calm;
      if (keep < 1 && c.units > 0 && !c.neutral && c !== castle) {
        const stay = Math.floor(c.units * keep);
        const gone = c.units - stay;
        if (stay > 0) {
          c.units = stay;
        } else if (!c.castle && c.fortStage === 0) {
          // 모두 떠났다 — 그 자리에 도적 무리가 선다(주인 없는 땅이 된다)
          c.owner = null;
          c.neutral = 'bandit';
          c.units = Math.min(6, gone);
          c.bandGood = -50;
          c.bandIdle = 0;
          c.order = undefined;
        } else {
          c.units = 0;
        }
      }
    }
  }
  state.merchants = state.merchants.filter((m) => m.nation !== loserId);
  loser.alive = false;
  pushLog(state, `${loser.name}이(가) ${winner.name}에 병합되었습니다`);
}

export { DEFAULT_ECONOMY };
