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
import { pushLog, nationStats } from './rules';
import { vassalsOf, nationPower, breakVassalage } from './vassals';

export type OrderKind = 'attack' | 'reinforce' | 'tax';
export type OrderResponse = 'obey' | 'feign' | 'refuse';

export interface VassalOrder {
  kind: OrderKind;
  /** attack: 칠 나라 */
  target?: number;
  /** reinforce: 보낼 병력 · tax: 더 걷는 비율 */
  amount: number;
  issuedTurn: number;
  /** 이 턴까지 이행해야 한다 */
  deadline: number;
  /** 속국의 속내. 종주국은 revealed 가 되기 전까지 모른다. */
  response: OrderResponse;
  /** 종주국이 속내를 알아챘는가 */
  revealed: boolean;
  /** 이행 정도 0~1 */
  progress: number;
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
  if (order.kind === 'reinforce') {
    const mine = nationStats(state, vassal.id).units;
    return {
      burden: Math.min(1, order.amount / Math.max(1, mine)),
      label: `파병 ${order.amount}명`,
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
  const lp = nationPower(state, lord.id);
  const vp = nationPower(state, vassal.id);
  const mightRatio = Math.min(3, lp / Math.max(1, vp));

  // 따를 마음 = 충성 + 정의로운 주인에 대한 신뢰
  const willing = vassal.loyalty / 100 + (lord.justice - 50) / 200;
  if (willing > burden + 0.15) return 'obey';

  // 안 따르기로 했다. 들켰을 때 감당할 수 있는가.
  // 힘 차이가 크면 대놓고 못 한다 — 그래서 듣는 척을 한다.
  const daring = (1 - vassal.loyalty / 100) / Math.max(0.5, mightRatio);
  return rng() < daring * 0.6 ? 'refuse' : 'feign';
}

/** 종주국이 명령을 내린다 */
export function issueOrder(
  state: GameState,
  lordId: number,
  vassalId: number,
  kind: OrderKind,
  rng: RNG,
  opts: { target?: number; amount?: number; turns?: number } = {}
): VassalOrder | null {
  const lord = state.nations[lordId];
  const vassal = state.nations[vassalId];
  if (!lord || !vassal || vassal.suzerain !== lordId) return null;
  if (vassal.order) return null; // 한 번에 하나만

  const order: VassalOrder = {
    kind,
    target: opts.target,
    amount: opts.amount ?? (kind === 'tax' ? 0.15 : 3),
    issuedTurn: state.turn,
    deadline: state.turn + (opts.turns ?? 8),
    response: 'obey',
    revealed: false,
    progress: 0,
  };
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
 * 매 턴 명령의 진행을 본다.
 *
 * 순종은 저절로 차오르고 태업은 제자리다. 기한이 지나면 드러난다 —
 * 그 전에도 종주국이 눈치챌 수 있다. 눈치는 정의보다 공포가 밝다.
 */
export function stepOrders(state: GameState, rng: RNG, eco: EconomyConfig = DEFAULT_ECONOMY): void {
  for (const v of state.nations) {
    if (!v.alive || v.suzerain === null || !v.order) continue;
    const lord = state.nations[v.suzerain];
    if (!lord || !lord.alive) {
      v.order = undefined;
      continue;
    }
    const o = v.order;

    if (o.response === 'obey') {
      o.progress = Math.min(1, o.progress + 0.34);
      if (o.progress >= 1) {
        // 이행했다. 신뢰가 쌓인다.
        v.loyalty = Math.min(100, v.loyalty + 3);
        if (o.kind === 'tax') lord.gold += Math.floor(v.gold * o.amount);
        pushLog(state, `${v.name}이(가) 명령을 이행했습니다`);
        v.order = undefined;
        continue;
      }
    } else if (o.response === 'feign' && !o.revealed) {
      // 들킬 확률. 공포로 눌러놓은 주인일수록 감시가 촘촘하다.
      const watch = 0.06 + (lord.fear / 100) * 0.12;
      if (rng() < watch) {
        o.revealed = true;
        pushLog(state, `${v.name}의 태업이 드러났습니다`);
      }
    }

    if (state.turn > o.deadline) {
      if (o.response !== 'obey') {
        o.revealed = true;
        v.loyalty = Math.max(0, v.loyalty - 6);
        pushLog(state, `${v.name}이(가) 기한을 넘겼습니다 — 명령 불이행`);
      }
      v.order = undefined;
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
  v.order = undefined;
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

    const discontent = Math.pow(1 - v.loyalty / 100, 2);
    if (discontent <= 0.04) continue;

    // 주인이 약해졌을수록 기회다
    const lp = nationPower(state, lord.id);
    const vp = nationPower(state, v.id);
    const opportunity = Math.min(2, vp / Math.max(1, lp) * 1.5);
    // 불이행이 드러난 참이면 이미 돌아선 것이다
    const defiant = v.order && v.order.revealed && v.order.response !== 'obey' ? 1.6 : 1;
    // 형제 속국이 먼저 일어섰나
    const contagion = vassalsOf(state, lord.id).some((x) => x.id !== v.id && x.loyalty < 15) ? 1.4 : 1;

    const p = 0.05 * discontent * opportunity * defiant * contagion;
    if (rng() >= p) continue;

    breakVassalage(state, v.id, '반란');
    v.order = undefined;
    // 자기 땅에서 일어선 군대는 사기가 오른다
    for (const c of state.cells) {
      if (c.owner === v.id && c.units > 0) c.morale = Math.min(100, c.morale + 25);
    }
    // 다른 속국들의 마음도 흔들린다
    for (const o of vassalsOf(state, lord.id)) o.loyalty = Math.max(0, o.loyalty - 10);
    pushLog(state, `${v.name}이(가) ${lord.name}에게 반기를 들었습니다`);
  }
}
