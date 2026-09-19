// 속국 시스템
//
// 정복 후 선택지가 "차지하거나 버리거나" 둘뿐인 게 아쉽다는 데서 출발했다.
// 본진을 빼앗은 뒤 병합하는 대신 속국으로 두면, 그 나라는 살아남아 자기 땅을
// 유지하고 매 턴 조공을 바친다. 종주국은 그 땅에 행정비를 내지 않는다.
//
// 이게 adminExponent 와 짝을 이룬다. 직접 먹으면 행정비가 가팔라지고, 부리면
// 조공만 들어온다. 그래서 제국이 커지는 길이 '먹기'에서 '부리기'로 옮겨간다.
//
// 속국을 얻는 길은 둘이고, 공포/정의 축이 여기서 갈린다.
//   정복(conquest)  — 본진을 잃고 강제 복속. 조공은 많지만 충성이 잘 깎인다.
//   자발(voluntary) — 위협에 시달리다 정의로운 나라에 보호를 청한다.
//                     조공은 적지만 안정적이고, 정복하지 않고도 세력을 넓히는 길이다.

import { RNG } from '../services/combatSystem';
import { GameState, EconomyConfig, DEFAULT_ECONOMY, Nation } from './types';
import { computeLedger, nationStats, pushLog, cellPower } from './rules';

/** 이 나라의 속국들 */
export function vassalsOf(state: GameState, lordId: number): Nation[] {
  return state.nations.filter((n) => n.alive && n.suzerain === lordId);
}

/** 종주국을 따라 올라가 최상위 주인을 찾는다 (속국의 속국도 결국 한 진영) */
export function blocLeader(state: GameState, nationId: number): number {
  let cur = nationId;
  const seen = new Set<number>();
  while (true) {
    const n = state.nations[cur];
    if (!n || n.suzerain === null || seen.has(cur)) return cur;
    seen.add(cur);
    cur = n.suzerain;
  }
}

/**
 * 영향력 = 직할 영토 + 속국 영토 × 가중치.
 * 승리를 영토로만 재면 웅크린 나라는 살아남아도 늘 진다. 부리는 것도 세력이다.
 */
export function influenceOf(
  state: GameState,
  nationId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): number {
  let total = nationStats(state, nationId).cells;
  for (const v of vassalsOf(state, nationId)) {
    total += nationStats(state, v.id).cells * eco.vassalInfluenceWeight;
    // 속국의 속국도 셈에 넣는다
    for (const vv of vassalsOf(state, v.id)) {
      total += nationStats(state, vv.id).cells * eco.vassalInfluenceWeight * eco.vassalInfluenceWeight;
    }
  }
  return total;
}

/** 국력 추정 — 충성도 계산과 자발적 복속 판단에 쓴다 */
export function nationPower(state: GameState, nationId: number): number {
  let power = 0;
  for (const c of state.cells) {
    if (c.owner === nationId && c.units > 0) power += cellPower(c, false);
  }
  return power + nationStats(state, nationId).cells * 0.5;
}

export function vassalize(
  state: GameState,
  lordId: number,
  vassalId: number,
  origin: 'conquest' | 'voluntary'
): void {
  const lord = state.nations[lordId];
  const vassal = state.nations[vassalId];
  if (!lord || !vassal || lordId === vassalId) return;
  // 순환 종속 방지 — 내 종주국 계통에 있는 나라는 속국으로 삼을 수 없다
  if (blocLeader(state, lordId) === vassalId) return;

  vassal.suzerain = lordId;
  vassal.vassalOrigin = origin;
  vassal.loyalty = origin === 'conquest' ? 40 : 70;

  if (origin === 'conquest') {
    lord.fear = clamp(lord.fear + 4, 0, 100);
    lord.justice = clamp(lord.justice - 2, 0, 100);
    pushLog(state, `${vassal.name}이(가) ${lord.name}의 속국이 되었습니다 (정복)`);
  } else {
    lord.justice = clamp(lord.justice + 3, 0, 100);
    pushLog(state, `${vassal.name}이(가) ${lord.name}에 보호를 청했습니다 (자발)`);
  }
}

export function breakVassalage(state: GameState, vassalId: number, reason: string): void {
  const v = state.nations[vassalId];
  if (!v || v.suzerain === null) return;
  const lordName = state.nations[v.suzerain]?.name ?? '';
  v.suzerain = null;
  v.vassalOrigin = null;
  v.loyalty = 50;
  pushLog(state, `${v.name}이(가) ${lordName}에게서 독립했습니다 (${reason})`);
}

/** 매 턴 조공을 걷는다. 속국의 순수입에서 떼어 종주국에 넘긴다. */
export function collectTribute(state: GameState, eco: EconomyConfig = DEFAULT_ECONOMY): void {
  for (const v of state.nations) {
    if (!v.alive || v.suzerain === null) continue;
    const lord = state.nations[v.suzerain];
    if (!lord || !lord.alive) {
      breakVassalage(state, v.id, '종주국 멸망');
      continue;
    }
    const l = computeLedger(state, v.id, eco);
    if (l.net <= 0) continue;
    const rate = v.vassalOrigin === 'conquest' ? eco.tributeRateConquest : eco.tributeRateVoluntary;
    const tribute = Math.floor(l.net * rate);
    if (tribute <= 0) continue;
    v.gold = Math.max(0, v.gold - tribute);
    lord.gold += tribute;
  }
}

/**
 * 충성도 갱신. 종주국이 압도적이면 오르고, 약해지면 떨어진다.
 * 정복 속국은 가만 둬도 마음이 식는다. 0 이 되면 독립한다.
 */
export function updateLoyalty(state: GameState, eco: EconomyConfig = DEFAULT_ECONOMY): void {
  for (const v of state.nations) {
    if (!v.alive || v.suzerain === null) continue;
    const lord = state.nations[v.suzerain];
    if (!lord || !lord.alive) {
      breakVassalage(state, v.id, '종주국 멸망');
      continue;
    }

    const lp = nationPower(state, lord.id);
    const vp = nationPower(state, v.id);
    const ratio = vp > 0 ? lp / vp : 3;
    // 힘의 격차가 클수록 붙어 있을 이유가 커진다
    let delta = Math.min(eco.loyaltyPowerBonus, (ratio - 1) * 1.2);

    if (v.vassalOrigin === 'conquest') delta -= eco.loyaltyDecayConquest;
    // 정의로운 종주국은 속국이 따른다. 공포로만 누르면 마음이 떠난다.
    delta += (lord.justice - 50) / 50;

    v.loyalty = clamp(v.loyalty + delta, 0, 100);
    if (v.loyalty <= 0) {
      breakVassalage(state, v.id, '반란');
      v.fear = clamp(v.fear + 5, 0, 100);
    }
  }
}

/**
 * 자발적 복속 — 위협에 시달리는 약소국이 정의로운 강국에 보호를 청한다.
 *
 * 이게 없으면 속국은 정복으로만 생기고, 웅크리는 전략은 여전히 이길 길이 없다.
 * 정의를 쌓아 두면 정복하지 않고도 세력이 붙는다.
 */
export function stepVoluntarySubmission(
  state: GameState,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY
): void {
  const independents = state.nations.filter((n) => n.alive && n.suzerain === null);
  if (independents.length < 3) return;

  for (const weak of independents) {
    if (vassalsOf(state, weak.id).length > 0) continue; // 남을 부리는 나라는 굽히지 않는다
    const myPower = nationPower(state, weak.id);
    if (myPower <= 0) continue;

    // 가장 위협적인 이웃과 가장 정의로운 보호자 후보를 찾는다
    let maxThreat = 0;
    let protector: Nation | null = null;
    let bestJustice = -1;
    for (const other of independents) {
      if (other.id === weak.id) continue;
      const op = nationPower(state, other.id);
      if (op > maxThreat) maxThreat = op;
      if (other.justice > bestJustice && op > myPower * 1.3) {
        bestJustice = other.justice;
        protector = other;
      }
    }
    if (!protector) continue;

    // 절박함: 가장 센 이웃이 나보다 얼마나 센가
    const desperation = Math.max(0, Math.min(2, maxThreat / myPower - 1));
    if (desperation <= 0.2) continue;

    const justicePower = Math.pow(protector.justice / 100, 2);
    const p = eco.voluntarySubmitChance * justicePower * desperation;
    if (rng() < p) {
      vassalize(state, protector.id, weak.id, 'voluntary');
    }
  }
}

/**
 * 승패 판정.
 * 살아있는 모든 나라가 한 진영(우두머리와 그 속국들)에 속하면 그 우두머리의 승리다.
 * 전멸시킬 필요가 없다 — 부려도 이긴다.
 */
export function checkBlocVictory(
  state: GameState,
  eco: EconomyConfig = DEFAULT_ECONOMY
): void {
  if (state.winner !== null) return;
  const alive = state.nations.filter((n) => n.alive);
  if (alive.length === 0) return;

  // 모두가 한 진영이면 패권 승리
  const leaders = new Set(alive.map((n) => blocLeader(state, n.id)));
  if (leaders.size === 1) {
    const [leader] = [...leaders];
    state.winner = leader;
    pushLog(state, `${state.nations[leader].name}이(가) 패권을 잡았습니다`);
    return;
  }

  // 압도적 우위 승리.
  //
  // 부대가 뭉치고 서로 도우면서 잘 죽지 않게 되자 게임의 절반이 턴 제한에
  // 걸렸다. 끝까지 다 잡아먹어야만 이기는 구조면 후반이 늘어진다.
  // 지도의 절반 가까이를 쥐고 2위를 두 배 이상 앞서면 승부는 난 것이다.
  const total = state.rows * state.cols;
  const scores = [...leaders]
    .map((id) => ({ id, inf: influenceOf(state, id, eco) }))
    .sort((a, b) => b.inf - a.inf);
  const top = scores[0];
  const second = scores[1];
  if (top && top.inf >= total * 0.55 && (!second || top.inf >= second.inf * 2.5)) {
    state.winner = top.id;
    pushLog(
      state,
      `${state.nations[top.id].name}이(가) 압도적 우위로 승리했습니다 (영향력 ${top.inf.toFixed(0)})`
    );
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
