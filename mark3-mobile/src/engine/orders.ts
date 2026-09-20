// 속국에게 내리는 명령
//
// 속국이 조공만 바치는 돈줄이면 '부린다'는 말이 무색하다. 종주국은 명령을
// 내릴 수 있고, 속국은 그걸 들을지 말지 스스로 정한다.
//
// 세 가지 답이 있다.
//   순종   그대로 한다
//   태업   겉으로는 받들고 실제로는 안 한다. 종주국은 당장 알 수 없다 —
//          기한이 지나거나 들켜야 드러난다. 이게 이 체계의 핵심이다.
//   거부   대놓고 안 한다. 즉시 드러나지만 약한 종주국에게는 그래도 된다.
//
// 그리고 속국은 언제든 반란할 수 있다. 충성 0 에서만이 아니라, 충성이 낮고
// 종주국이 흔들릴 때 기회를 본다.

import { RNG } from '../services/combatSystem';
import { GameState, Nation, EconomyConfig, DEFAULT_ECONOMY } from './types';
import { pushLog, nationStats, computeLedger, cellPower, neighbors, isFoeCell, blocOf } from './rules';
import { hexDistance } from '../utils/hexGrid';
import { vassalsOf, nationPower, breakVassalage } from './vassals';
import { isVisible } from './vision';

/** 속국이 저울질할 때 쓰는 값들 */
export interface VassalAssessment {
  /** 내 힘 */
  myPower: number;
  /** 종주국의 힘 중 다른 전선에 묶이지 않은 부분 */
  lordFree: number;
  /** 종주국이 지금 상대하는 다른 적의 수 */
  fronts: number;
  /** 일어섰을 때 살아남을 확률 */
  survival: number;
  /** 남아서 얻는 것 (앞으로 내다본 값) */
  stayValue: number;
  /** 일어서서 얻는 것의 기대값 */
  rebelValue: number;
  /** 매 턴 조공으로 나가는 것. 원한의 크기이기도 하다. */
  keptPerTurn: number;
}

/** 앞으로 몇 턴을 내다보고 셈하는가 */
const HORIZON = 12;

/**
 * 속국이 하는 계산.
 *
 * 실제 나라가 그러듯, 종주국의 '전체 힘'이 아니라 '나에게 돌릴 수 있는 힘'을
 * 본다. 종주국이 다른 전선에 묶여 있으면 그게 곧 틈이다.
 *
 * 남으면 보호를 받는 대신 조공을 바치고, 일어서면 조공을 아끼는 대신 나라를
 * 걸어야 한다. 둘을 같은 단위(앞으로 12턴어치)로 환산해 견준다.
 */
export function assessVassal(
  state: GameState,
  lord: Nation,
  vassal: Nation,
  eco: EconomyConfig = DEFAULT_ECONOMY
): VassalAssessment {
  const myPower = nationPower(state, vassal.id);

  // 종주국의 병력을 '나를 겨눌 수 있는 것'과 '다른 전선에 묶인 것'으로 가른다
  let free = 0;
  const foes = new Set<number>();
  for (const c of state.cells) {
    if (c.owner !== lord.id || c.units <= 0 || c.neutral) continue;
    let engaged = false;
    for (const n of neighbors(state, c)) {
      if (n.units <= 0) continue;
      if (n.owner === vassal.id) continue; // 나와 맞닿은 것은 '묶였다'고 치지 않는다
      if (isFoeCell(state, lord.id, n)) {
        engaged = true;
        if (n.owner !== null && !n.neutral) foes.add(blocOf(state, n.owner));
      }
    }
    if (!engaged) free += cellPower(c, false);
  }

  // 내 땅에서 싸운다. 요새와 성이 받쳐준다.
  let works = 1;
  for (const c of state.cells) {
    if (c.owner !== vassal.id) continue;
    if (c.castle) works += 0.15;
    else if (c.fortStage === 4) works += 0.1;
  }
  const defended = myPower * Math.min(1.6, works);
  const survival = defended / Math.max(0.001, defended + free);

  // 조공으로 나가는 돈 — 일어서면 이만큼이 내 것이 된다
  const ledger = computeLedger(state, vassal.id, eco);
  const rate =
    vassal.vassalOrigin === 'conquest' ? eco.tributeRateConquest : eco.tributeRateVoluntary;
  const keptPerTurn = Math.max(0, ledger.net) * rate;

  // 독립하면 누가 나를 노리는가. 종주국의 그늘이 그걸 막아준다.
  let worstNeighbor = 0;
  for (const n of state.nations) {
    if (!n.alive || n.id === vassal.id || blocOf(state, n.id) === blocOf(state, vassal.id)) continue;
    worstNeighbor = Math.max(worstNeighbor, nationPower(state, n.id));
  }
  const exposure = Math.min(1.5, worstNeighbor / Math.max(1, myPower));
  // 보호의 값어치는 '내가 혼자서는 감당 못 하는 만큼'이다
  const shieldPerTurn = Math.max(0, exposure - 0.8) * Math.max(1, ledger.income) * 0.5;

  // 져서 잃는 것 — 땅과 군대만이 아니라 앞으로의 나라 전체다.
  // 이걸 싸게 잡았더니 생존 27% 에서도 '일어설 만하다'가 나왔다.
  const worth =
    nationStats(state, vassal.id).cells * 6 + myPower * 4 + Math.max(0, ledger.net) * HORIZON;

  const stayValue = shieldPerTurn * HORIZON;
  const rebelValue = survival * keptPerTurn * HORIZON - (1 - survival) * worth;

  return {
    myPower,
    lordFree: free,
    fronts: foes.size,
    survival,
    stayValue,
    rebelValue,
    keptPerTurn,
  };
}

export type OrderKind = 'garrison' | 'march' | 'attack' | 'tax';
export type OrderResponse = 'obey' | 'feign' | 'refuse';

export interface VassalOrder {
  kind: OrderKind;
  /** attack: 칠 나라 */
  target?: number;
  /** garrison·march: 어디에 */
  destId?: string;
  /** garrison·march: 몇 명 · tax: 더 걷는 비율 */
  amount: number;
  issuedTurn: number;
  /** 이 턴까지 이행해야 한다 */
  deadline: number;
  /** 속국의 속내. 종주국은 revealed 가 되기 전까지 모른다. */
  response: OrderResponse;
  /** 종주국이 불이행을 두 눈으로 확인했는가 */
  revealed: boolean;
  /** 실제로 이행된 정도 0~1 — 지도에서 벌어진 일. 종주국은 이걸 볼 수 없다. */
  progress: number;
  /** 종주국이 본 만큼의 이행 0~1 — 판단은 오직 이것으로 한다 */
  witnessed: number;
  /** 마지막으로 뭔가를 확인한 턴. -1 이면 한 번도 못 봤다. */
  observedTurn: number;
}

/** 끝난 명령 한 건 */
export interface OrderOutcome {
  lord: number;
  vassal: number;
  kind: OrderKind;
  issuedTurn: number;
  endedTurn: number;
  /** 종주국이 이행으로 인정했는가 */
  accepted: boolean;
  /** 끝내 확인하지 못했는가 — 벌할 근거도 믿을 근거도 없다 */
  unverified: boolean;
  /** 종주국이 본 만큼 */
  witnessed: number;
  /** 실제로 이행된 정도. 종주국에게 보여주면 안 된다. */
  truth: number;
  /** 속국의 속내. 이것도 종주국에게 보여주면 안 된다. */
  response: OrderResponse;
}

function endOrder(
  state: GameState,
  lord: Nation,
  v: Nation,
  o: VassalOrder,
  accepted: boolean
): void {
  state.orderLog.push({
    lord: lord.id,
    vassal: v.id,
    kind: o.kind,
    issuedTurn: o.issuedTurn,
    endedTurn: state.turn,
    accepted,
    // 대놓고 거부한 명령은 그 자리에서 드러난 것이다. observedTurn 만 보면
    // 종주국이 두 귀로 들은 거부가 '확인하지 못했다'로 기록된다.
    unverified: !accepted && !o.revealed && o.observedTurn < 0,
    witnessed: o.witnessed,
    truth: o.progress,
    response: o.response,
  });
  if (state.orderLog.length > 200) state.orderLog.shift();
  v.order = undefined;
}

export interface OrderCost {
  /** 이 명령이 속국에게 얼마나 부담인가 0~1 */
  burden: number;
  label: string;
}

export function orderCost(state: GameState, vassal: Nation, order: VassalOrder): OrderCost {
  if (order.kind === 'tax') {
    return { burden: Math.min(1, order.amount * 2.5), label: `조공 +${(order.amount * 100).toFixed(0)}%` };
  }
  if (order.kind === 'garrison' || order.kind === 'march') {
    const mine = nationStats(state, vassal.id).units;
    const dest = order.destId ? state.cells.find((c) => c.id === order.destId) : null;
    // 멀수록, 많이 떼어낼수록 부담이다
    const home = state.cells.find((c) => c.castle && c.owner === vassal.id);
    const far =
      dest && home ? hexDistance(dest.row, dest.col, home.row, home.col) / 16 : 0.2;
    return {
      burden: Math.min(1, (order.amount / Math.max(1, mine)) * 0.7 + far),
      label: order.kind === 'garrison' ? `${order.amount}명 주둔` : `${order.amount}명 이동`,
    };
  }
  // 공격은 상대가 셀수록 부담이 크다
  const me = nationPower(state, vassal.id);
  const foe = order.target !== undefined ? nationPower(state, order.target) : me;
  return {
    burden: Math.min(1, foe / Math.max(1, me) / 2),
    label: `${order.target !== undefined ? state.nations[order.target]?.name ?? '' : ''} 공격`,
  };
}

/**
 * 속국이 명령을 받고 속으로 정하는 것.
 *
 * 충성이 높으면 따르고, 낮으면 안 따른다. 다만 안 따르는 방식은 힘이 정한다 —
 * 종주국이 무서우면 겉으로만 받들고(태업), 만만하면 대놓고 거부한다.
 */
export function decideResponse(
  state: GameState,
  lord: Nation,
  vassal: Nation,
  order: VassalOrder,
  rng: RNG
): OrderResponse {
  const { burden } = orderCost(state, vassal, order);
  const a = assessVassal(state, lord, vassal);

  // 너무 센 주인에게는 그냥 따른다. 버티는 값이 없다.
  // 반대로 주인이 다른 전선에 묶여 있으면 배짱이 생긴다.
  // 힘의 격차가 가장 크게 말한다. 혼자서는 못 버티는 속국은 마음이 떠나 있어도
  // 일단 따른다 — 안 따를 수가 없으니까. 반대로 살아남을 자신이 서면
  // 충성이 남아 있어도 명령은 흘려듣기 시작한다.
  const willing =
    0.35 + (vassal.loyalty / 100) * 0.6 + (lord.justice - 50) / 200 + (0.5 - a.survival) * 1.2;
  if (willing > burden + 0.15) return 'obey';

  // 안 따르기로 했다. 그렇다고 대놓고 말하지는 않는다 —
  // 거부는 그 자리에서 드러나고 응징을 부른다. 토벌을 견딜 자신이 설 때만
  // 그 값을 치른다. 그래서 불복의 기본형은 '듣는 척'이다.
  return rng() < Math.max(0, a.survival - 0.35) * 1.2 ? 'refuse' : 'feign';
}

/** 종주국이 명령을 내린다 */
export function issueOrder(
  state: GameState,
  lordId: number,
  vassalId: number,
  kind: OrderKind,
  rng: RNG,
  opts: { target?: number; destId?: string; amount?: number; turns?: number } = {}
): VassalOrder | null {
  const lord = state.nations[lordId];
  const vassal = state.nations[vassalId];
  if (!lord || !vassal || vassal.suzerain !== lordId) return null;
  if (vassal.order) return null; // 한 번에 하나만

  const order: VassalOrder = {
    kind,
    target: opts.target,
    destId: opts.destId,
    amount: opts.amount ?? (kind === 'tax' ? 0.15 : 3),
    issuedTurn: state.turn,
    deadline: state.turn + (opts.turns ?? 8),
    response: 'obey',
    revealed: false,
    progress: 0,
    witnessed: 0,
    observedTurn: -1,
  };
  /**
   * 이미 되어 있는 일을 시키는 건 명령이 아니다.
   *
   * 속국에서 가장 가까운 전선을 고르게 했더니 그 자리에 이미 병력이 있는
   * 경우가 많았고, 그러면 대놓고 거부한 속국도 가만히 있는 것만으로 이행
   * 97% 가 나왔다. 아무것도 바꾸지 않는 명령은 순종과 불복을 구별하지 못한다.
   */
  if (measureProgress(state, vassal, order) >= 0.5) return null;

  order.response = decideResponse(state, lord, vassal, order, rng);

  vassal.order = order;
  if (order.response === 'refuse') {
    order.revealed = true;
    vassal.loyalty = Math.max(0, vassal.loyalty - 4);
    pushLog(state, `${vassal.name}이(가) ${lord.name}의 명령을 거부했습니다 (${orderCost(state, vassal, order).label})`);
  } else {
    pushLog(state, `${lord.name} → ${vassal.name}: ${orderCost(state, vassal, order).label}`);
  }
  return order;
}

/**
 * 명령이 실제로 이행되고 있는가 — 지도에서 직접 읽는다.
 *
 * 이게 핵심이다. progress 를 '순종이면 0.34씩 올린다' 같은 카운터로 두면
 * 명령이 장부상으로만 이행된다. 병력이 정말 그 자리에 갔는지, 정말 그 나라를
 * 쳤는지를 세야 '듣는 척'이 성립한다 — 속국이 겉으로 받들어도 지도는 안 속는다.
 */
export function measureProgress(state: GameState, vassal: Nation, order: VassalOrder): number {
  // 조공은 지도가 아니라 국고에 남는다 — stepOrders 가 실제로 옮긴 만큼 올린다
  if (order.kind === 'tax') return order.progress;

  // 공격은 지도에 자취가 남지 않는다 — 친 순간에만 안다.
  // 그래서 ai.ts 의 전투 처리가 progress 를 올려준다.
  if (order.kind === 'attack') return order.progress;

  const dest = order.destId ? state.cells.find((c) => c.id === order.destId) : null;
  if (!dest) return 1;
  const radius = order.kind === 'garrison' ? 1 : 2;
  let there = 0;
  for (const c of state.cells) {
    if (c.owner !== vassal.id || c.units <= 0 || c.neutral) continue;
    if (hexDistance(c.row, c.col, dest.row, dest.col) <= radius) there += c.units;
  }
  return Math.min(1, there / Math.max(1, order.amount));
}

/**
 * 종주국이 이번 턴에 확인할 수 있는 것.
 *
 * 이게 없으면 종주국은 전지적이다 — 속국이 지도 반대편에서 뭘 하든 장부에
 * 정확히 찍힌다. 실제로는 보내놓고 갔는지 안 갔는지 모르는 게 보통이다.
 *
 * null 은 '안 했다'가 아니라 '모른다'다. 둘을 같게 두면 못 본 것이 곧
 * 불이행이 되어, 시야 밖으로 보낸 명령은 전부 배신으로 기록된다.
 */
export function observeOrder(
  state: GameState,
  lord: Nation,
  vassal: Nation,
  order: VassalOrder
): number | null {
  // 조공은 내 국고로 들어온다. 이것만은 확실히 안다.
  if (order.kind === 'tax') return order.progress;
  // 공격은 전투가 벌어진 자리에서만 안다 — ai.ts 가 그때 올려준다
  if (order.kind === 'attack') return null;

  const dest = order.destId ? state.cells.find((c) => c.id === order.destId) : null;
  if (!dest) return null;
  // 부른 자리조차 지금 보고 있지 않다면 아무것도 확인할 수 없다
  if (!isVisible(state, lord.id, dest)) return null;

  const radius = order.kind === 'garrison' ? 1 : 2;
  let there = 0;
  for (const c of state.cells) {
    if (c.owner !== vassal.id || c.units <= 0 || c.neutral) continue;
    if (hexDistance(c.row, c.col, dest.row, dest.col) > radius) continue;
    // 보이는 부대만 센다. 숲 너머에 있으면 와 있어도 모른다.
    if (!isVisible(state, lord.id, c)) continue;
    there += c.units;
  }
  return Math.min(1, there / Math.max(1, order.amount));
}

/**
 * 매 턴 명령의 진행을 본다.
 *
 * 기한이 지나면 드러난다 — 그 전에도 종주국이 눈치챌 수 있다.
 * 눈치는 정의보다 공포가 밝다.
 */
export function stepOrders(state: GameState, rng: RNG, eco: EconomyConfig = DEFAULT_ECONOMY): void {
  for (const v of state.nations) {
    if (!v.alive || v.suzerain === null || !v.order) continue;
    const lord = state.nations[v.suzerain];
    if (!lord || !lord.alive) {
      v.order = undefined; // 명령을 내린 주인이 없다. 기록할 판단도 없다.
      continue;
    }
    const o = v.order;

    // 지도에서 실제로 벌어진 일. 조공처럼 진짜 효과가 걸린 데에만 쓴다.
    o.progress = Math.max(o.progress, measureProgress(state, v, o));

    // 종주국이 이번 턴에 확인한 것. 판단은 오직 이것으로 한다.
    const seenNow = observeOrder(state, lord, v, o);
    if (seenNow !== null) {
      o.witnessed = Math.max(o.witnessed, seenNow);
      o.observedTurn = state.turn;
    }

    /**
     * 추가 조공은 한 번에 털어내는 게 아니라 매 턴 나간다.
     * 이걸 '이행이 끝나는 시점에 한 번' 으로 두면 태업하는 속국과 순종하는
     * 속국이 국고에서 구별되지 않는다 — 돈이 실제로 움직여야 명령이다.
     */
    if (o.kind === 'tax' && o.response === 'obey') {
      const span = Math.max(1, o.deadline - o.issuedTurn);
      const due = Math.floor(computeLedger(state, v.id, eco).income * o.amount);
      const paid = Math.max(0, Math.min(v.gold, due));
      if (paid > 0) {
        v.gold -= paid;
        lord.gold += paid;
      }
      o.progress = Math.min(1, o.progress + 1 / span);
      // 돈은 내 국고로 들어온다. 조공만은 종주국이 틀림없이 안다.
      o.witnessed = o.progress;
      o.observedTurn = state.turn;
    }

    /**
     * 이행 판정은 속내가 아니라 목격으로 한다.
     *
     * 전에는 response 가 'obey' 인지를 먼저 보고 넘어갔다. 그건 종주국이
     * 속국의 마음을 읽는 것이다. 이제는 순종이든 태업이든 똑같이 본 만큼만
     * 인정한다 — 작은 병력으로 치는 시늉만 해도 눈에는 이행으로 보인다.
     */
    if (o.witnessed >= 1) {
      v.loyalty = Math.min(100, v.loyalty + 3);
      pushLog(state, `${v.name}이(가) 명령을 이행했습니다`);
      endOrder(state, lord, v, o, true);
      continue;
    }

    if (state.turn > o.deadline) {
      if (o.observedTurn >= 0) {
        // 지켜봤는데 안 했다. 이제야 드러난다.
        o.revealed = true;
        v.loyalty = Math.max(0, v.loyalty - 6);
        pushLog(state, `${v.name}이(가) 기한을 넘겼습니다 — 명령 불이행`);
      } else {
        // 끝내 확인하지 못했다. 의심은 남지만 벌할 근거가 없다.
        pushLog(state, `${v.name}의 이행 여부를 확인하지 못했습니다`);
      }
      endOrder(state, lord, v, o, false);
    }
  }
}

export type Punishment = 'seize' | 'strip' | 'war';

/**
 * 응징.
 *
 * 무엇을 하든 대가가 있다. 다른 속국들이 보고 있기 때문이다 —
 * 주인이 무서워지면 당장은 말을 듣지만 마음은 더 멀어진다.
 */
export function punishVassal(
  state: GameState,
  lordId: number,
  vassalId: number,
  kind: Punishment,
  eco: EconomyConfig = DEFAULT_ECONOMY
): void {
  const lord = state.nations[lordId];
  const v = state.nations[vassalId];
  if (!lord || !v || v.suzerain !== lordId) return;

  const others = vassalsOf(state, lordId).filter((x) => x.id !== vassalId);

  if (kind === 'seize') {
    const take = Math.floor(v.gold * 0.4);
    v.gold -= take;
    lord.gold += take;
    v.loyalty = Math.max(0, v.loyalty - 10);
    lord.justice = Math.max(0, lord.justice - 3);
    pushLog(state, `${lord.name}이(가) ${v.name}의 국고를 걷어갔습니다 (${take}G)`);
  } else if (kind === 'strip') {
    v.loyalty = Math.max(0, v.loyalty - 16);
    lord.fear = Math.min(100, lord.fear + 4);
    lord.justice = Math.max(0, lord.justice - 5);
    pushLog(state, `${lord.name}이(가) ${v.name}을(를) 문책했습니다`);
  } else {
    lord.fear = Math.min(100, lord.fear + 8);
    lord.justice = Math.max(0, lord.justice - 10);
    breakVassalage(state, vassalId, '종주국의 토벌');
    v.loyalty = 0;
    pushLog(state, `${lord.name}이(가) ${v.name}을(를) 토벌합니다`);
  }

  // 다른 속국들이 지켜본다
  for (const o of others) o.loyalty = Math.max(0, o.loyalty - (kind === 'war' ? 8 : 3));
  // 응징으로 끝난 명령도 기록에 남는다. 여기서 빠뜨리면 거부는 전부 응징으로
  // 지워지므로 장부에서 통째로 사라진다 — 없는 일이 되어버린다.
  if (v.order) endOrder(state, lord, v, v.order, false);
}

/**
 * 반란 — 충성 0 에서만이 아니라 언제든.
 *
 * 마음이 떠났고, 주인이 흔들리고, 내 힘이 받쳐줄 때 일어선다.
 * 옆에서 누가 먼저 일어섰으면 더 쉽게 결심한다.
 */
export function stepRebellion(state: GameState, rng: RNG, eco: EconomyConfig = DEFAULT_ECONOMY): void {
  for (const v of state.nations) {
    if (!v.alive || v.suzerain === null) continue;
    const lord = state.nations[v.suzerain];
    if (!lord || !lord.alive) continue;

    const a = assessVassal(state, lord, v, eco);

    /**
     * 셈만으로는 반란이 거의 안 난다. 나라를 거는 일이니 당연하다.
     * 실제로도 사람들은 계산이 맞아서가 아니라 견딜 수 없어서 일어선다.
     *
     * 그래서 두 축으로 나눈다 — 셈(rebelValue - stayValue)과 원한(grievance).
     * 원한은 '얼마나 빨리고 있는가'에 비례한다. 압도적인 주인 아래에서는
     * 셈이 워낙 나빠 원한만으로는 못 넘고, 주인이 다른 전선에 묶이면
     * 셈이 0 근처로 올라와 원한이 결정을 뒤집는다.
     */
    const grievance = Math.pow(1 - v.loyalty / 100, 2) * a.keptPerTurn * HORIZON * 2.5;
    let edge = a.rebelValue - a.stayValue + grievance;

    // 불이행이 드러난 참이면 이미 돌아선 것이다
    if (v.order && v.order.revealed && v.order.response !== 'obey') edge += 15;
    // 형제 속국이 먼저 일어섰으면 지금이 그때다
    if (vassalsOf(state, lord.id).some((x) => x.id !== v.id && x.loyalty < 15)) edge += 15;

    if (edge <= 0) continue;
    // 셈이 맞아도 바로 터지지는 않는다. 때를 본다.
    const p = Math.min(0.5, edge / 120);
    if (rng() >= p) continue;

    breakVassalage(state, v.id, '반란');
    if (v.order) endOrder(state, lord, v, v.order, false);
    // 자기 땅에서 일어선 군대는 사기가 오른다
    for (const c of state.cells) {
      if (c.owner === v.id && c.units > 0) c.morale = Math.min(100, c.morale + 25);
    }
    // 다른 속국들의 마음도 흔들린다
    for (const o of vassalsOf(state, lord.id)) o.loyalty = Math.max(0, o.loyalty - 10);
    pushLog(state, `${v.name}이(가) ${lord.name}에게 반기를 들었습니다`);
  }
}
