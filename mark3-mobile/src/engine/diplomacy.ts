// 외교 — 휴전, 동맹, 그리고 배신
//
// 이 게임이 고치려는 것은 문명의 '정복 아니면 무시' 다. 속국은 정복의 끝을
// 둘로 갈랐지만, 정복 이전은 여전히 '싸우거나 안 싸우거나' 뿐이었다. 외교는
// 그 사이를 채운다 — 급한 전선 하나를 멈추고(휴전), 더 큰 적 앞에서 손잡고
// (동맹), 그 적이 사라지면 칼끝이 서로를 향한다(배신).
//
// 배신이 공짜면 조약은 의미가 없다. 그래서 조약을 깨면
//   정의가 깎인다   — 자발적 복속·급여 유예·항복 처우가 모두 정의에 걸려 있다
//   믿음이 깎인다   — betrayals 가 늘고, 다른 나라들이 제안을 덜 받아준다
//
// 승리 조건은 그대로다(살아남은 나라가 모두 한 진영). 동맹은 진영이 아니다.
// 끝에 동맹만 남으면 '공동의 적이 사라져' 동맹이 풀린다 — 안 그러면 판이
// 끝나지 않는다.
//
// 이 파일은 rules 를 불러오지 않는다. rules.beginTurn 이 여기를 부르므로,
// 이웃·전력 셈은 여기서 따로 한다(순환 import 를 피한다).

import { RNG } from '../services/combatSystem';
import { Cell, GameState, EconomyConfig, DEFAULT_ECONOMY } from './types';
import { Treaty, TreatyKind, blocOf, treatyOf, wa } from './treaty';
import { adjustRep, characterOf, effective } from './reputation';
import { getHexNeighborOffsets } from '../utils/hexGrid';

/**
 * 사람에게 온 사신.
 *   truce·alliance  조약을 청한다
 *   withdraw        '우리 땅에서 군대를 빼라' — 손님의 무례에 대한 항의
 *   breakOrder      종주국이 속국에게 '그 나라와의 조약을 끊어라' (target)
 */
export interface Proposal {
  from: number;
  to: number;
  kind: TreatyKind | 'withdraw' | 'breakOrder';
  turn: number;
  /** 왜 청하는가 — 사람에게 보여줄 한 줄 */
  reason: string;
  /** breakOrder: 끊으라는 상대 */
  target?: number;
}

export type Relation = 'self' | 'bloc' | 'alliance' | 'truce' | 'war';

export function relationOf(state: GameState, a: number, b: number): Relation {
  if (a === b) return 'self';
  if (blocOf(state, a) === blocOf(state, b)) return 'bloc';
  const t = treatyOf(state, a, b);
  return t ? t.kind : 'war';
}

// ── 판세 읽기 ────────────────────────────────────────────────

/** 한 번 셈해서 여러 판단에 나눠 쓴다 */
interface Board {
  heads: number[];
  power: Map<number, number>;
  /** 나라 하나의 병력 (진영이 아니라). 속국이 제 힘을 셀 때 쓴다. */
  own: Map<number, number>;
  /** 'a-b' (a<b) — 두 진영의 땅이 맞닿아 있나 */
  touch: Set<string>;
}

function key(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function readBoard(state: GameState): Board {
  const heads = state.nations.filter((n) => n.alive && n.suzerain === null).map((n) => n.id);
  const headOf = new Map<number, number>();
  for (const n of state.nations) if (n.alive) headOf.set(n.id, blocOf(state, n.id));

  const power = new Map<number, number>();
  const own = new Map<number, number>();
  for (const h of heads) power.set(h, 0);
  const touch = new Set<string>();
  const cellHead = (r: number, c: number): number | null => {
    if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null;
    const x = state.cells[r * state.cols + c];
    if (!x || x.offMap || x.owner === null || x.neutral) return null;
    return headOf.get(x.owner) ?? null;
  };
  for (const c of state.cells) {
    if (c.offMap || c.owner === null || c.neutral) continue;
    const h = headOf.get(c.owner);
    if (h === undefined) continue;
    power.set(h, (power.get(h) ?? 0) + c.units);
    own.set(c.owner, (own.get(c.owner) ?? 0) + c.units);
    for (const o of getHexNeighborOffsets(c.row)) {
      const other = cellHead(c.row + o.dr, c.col + o.dc);
      if (other !== null && other !== h) touch.add(key(h, other));
    }
  }
  return { heads, power, own, touch };
}

function scaleOf(state: GameState): number {
  return Math.max(0.5, Math.floor(Math.min(state.rows, state.cols) / 2) / 5);
}

/** 이 나라가 그 나라를 아나 — 땅 한 칸이라도 본 적이 있어야 사신을 보낸다 */
export function knows(state: GameState, me: number, other: number): boolean {
  const v = state.vision[me];
  if (!v) return false;
  const hb = blocOf(state, other);
  for (let i = 0; i < state.cells.length; i++) {
    if (!v.explored[i]) continue;
    const owner = v.memory[i]?.owner;
    if (owner !== null && owner !== undefined && state.nations[owner] && blocOf(state, owner) === hb) {
      return true;
    }
  }
  return false;
}

/** 나와 전쟁 중이면서 가장 센 제3국 (me·other 둘 중 하나와 맞닿은) */
function commonThreat(
  state: GameState,
  b: Board,
  me: number,
  other: number
): { id: number; power: number } | null {
  let best: { id: number; power: number } | null = null;
  for (const h of b.heads) {
    if (h === me || h === other) continue;
    if (treatyOf(state, me, h)) continue; // 이미 손잡은 상대는 위협이 아니다
    const near = b.touch.has(key(h, me)) || b.touch.has(key(h, other));
    if (!near) continue;
    const p = b.power.get(h) ?? 0;
    if (!best || p > best.power) best = { id: h, power: p };
  }
  return best;
}

// ── 속국의 외교 ──────────────────────────────────────────────

export type VassalPolicy = 'free' | 'noEnemies' | 'forbid';

/**
 * 이 종주국은 속국의 외교를 어디까지 허락하나.
 * 정해두지 않았으면 성향으로 — 공포로 다스리는 나라는 막고, 정의로운 나라는
 * 풀어준다. 그 사이는 '내 적과만 안 된다'.
 */
export function policyOf(state: GameState, lordId: number): VassalPolicy {
  const n = state.nations[lordId];
  if (!n) return 'noEnemies';
  if (n.vassalPolicy) return n.vassalPolicy;
  // 정하지 않았으면 나라의 성격을 따른다 — 공포로 다스리는 나라는 막고,
  // 정의로운 나라는 풀어준다
  const c = characterOf(n);
  if (c === 'feared') return 'forbid';
  if (c === 'just') return 'free';
  return 'noEnemies';
}

/** 속국이 이 나라와 조약을 맺으면 종주국의 허락 밖인가 */
export function violatesPolicy(state: GameState, vassalId: number, otherId: number): boolean {
  const lord = state.nations[vassalId]?.suzerain;
  if (lord === null || lord === undefined) return false;
  const p = policyOf(state, lord);
  if (p === 'free') return false;
  if (p === 'forbid') return true;
  return relationOf(state, lord, otherId) === 'war';
}

/** 이 나라가 직접 맺은 조약들 (종주국이 맺은 것은 빼고) */
export function ownTreaties(
  state: GameState,
  id: number
): Array<{ other: number; kind: TreatyKind; until?: number; violates: boolean }> {
  return (state.treaties ?? [])
    .filter((t) => t.a === id || t.b === id)
    .map((t) => {
      const other = t.a === id ? t.b : t.a;
      return { other, kind: t.kind, until: t.until, violates: violatesPolicy(state, id, other) };
    });
}

// ── 조약을 원하나 ────────────────────────────────────────────

/**
 * 이 나라(me)는 그 나라(other)와 이 조약을 원하나.
 * 받아줄 때도, 먼저 청할 때도 같은 셈을 쓴다 — 속으로 원하지 않는 것을
 * 먼저 청하는 나라는 없다.
 */
export function wants(
  state: GameState,
  me: number,
  other: number,
  kind: TreatyKind,
  board?: Board,
  eco: EconomyConfig = DEFAULT_ECONOMY
): { yes: boolean; reason: string } {
  const b = board ?? readBoard(state);
  if (kind === 'truce' && eco.endgameHeads > 0 && b.heads.length <= eco.endgameHeads) {
    return { yes: false, reason: '끝이 가깝다 — 이제는 결판을 낼 때다' };
  }
  const mine = b.power.get(blocOf(state, me)) ?? 0;
  const theirs = b.power.get(blocOf(state, other)) ?? 0;
  const touching = b.touch.has(key(blocOf(state, me), blocOf(state, other)));
  const threat = commonThreat(state, b, blocOf(state, me), blocOf(state, other));
  const name = (id: number) => state.nations[id]?.name ?? '?';
  const self = state.nations[me];

  /*
    속국의 셈은 따로다. 속국이 밖과 손잡는 까닭은 대개 하나 — 종주국에 맞설
    뒷배다. 충성이 남아 있으면 허락 밖의 조약은 안 맺는다. 마음이 떠났으면
    (충성 40 미만) 허락을 가리지 않는다. 그 책임은 속국이 진다.
  */
  if (self && self.suzerain !== null) {
    if (!eco.vassalDiplomacy) return { yes: false, reason: '종주국이 외교를 맡는다' };
    const lord = self.suzerain;
    const defiant = self.loyalty < 40;
    if (violatesPolicy(state, me, other) && !defiant) {
      return { yes: false, reason: '종주국이 허락하지 않는다' };
    }
    if (kind === 'alliance') {
      const lordPower = b.power.get(blocOf(state, lord)) ?? 0;
      if (defiant && relationOf(state, lord, other) === 'war' && theirs >= lordPower * 0.6) {
        return { yes: true, reason: '종주국에 맞설 뒷배가 필요하다' };
      }
      return { yes: false, reason: '손잡을 까닭이 없다' };
    }
    const alone = b.own.get(me) ?? 0;
    if (touching && theirs > alone * 1.2) return { yes: true, reason: '혼자서는 막을 수 없다' };
    return { yes: false, reason: '싸울 만하다' };
  }

  /*
    상대가 남의 속국이면: 그 종주국과 전쟁 중일 때 속국을 떼어내는 것은
    이득이다 — 적의 진영에 금을 긋는다.
  */
  const otherN = state.nations[other];
  if (otherN && otherN.suzerain !== null && kind === 'alliance') {
    return relationOf(state, me, otherN.suzerain) === 'war'
      ? { yes: true, reason: `${name(otherN.suzerain)}의 진영에 금을 긋는다` }
      : { yes: false, reason: '그 종주국을 두고 따로 손잡을 일이 없다' };
  }

  if (kind === 'truce') {
    if (touching && mine > theirs * 1.6) return { yes: false, reason: '지금은 칠 수 있을 때다' };
    if (theirs > mine * 1.2) return { yes: true, reason: '싸워서 이길 수 없는 상대다' };
    if (threat && threat.power > mine * 0.8) {
      return { yes: true, reason: `${wa(name(threat.id))}의 전선이 급하다` };
    }
    return { yes: false, reason: '싸울 만하다' };
  }
  // 동맹 — 둘 다보다 센 공동의 적이 있어야 한다
  if (threat && threat.power > Math.max(mine, theirs)) {
    return { yes: true, reason: `공동의 적 ${name(threat.id)}` };
  }
  if (touching && theirs > mine * 1.8) {
    return { yes: true, reason: '강한 이웃과는 손잡는 편이 낫다' };
  }
  return { yes: false, reason: '손잡을 까닭이 없다' };
}

/**
 * 청한 쪽을 믿나. 배신한 적이 있으면 반씩 깎이고, 정의로운 나라는 더 믿는다.
 * 원하는 조약이어도 믿지 못하면 거절한다.
 */
function trustIn(state: GameState, proposer: number): number {
  const n = state.nations[proposer];
  if (!n) return 0;
  const betrayed = Math.pow(0.5, n.betrayals ?? 0);
  // 정의로운 나라의 말은 더 믿고, 두려운 나라의 말은 덜 믿는다
  return Math.max(0.05, Math.min(0.95, 0.8 * betrayed + (n.justice - n.fear) / 200));
}

// ── 맺고 깨기 ────────────────────────────────────────────────

function pushLog(state: GameState, msg: string): void {
  state.log.push(msg);
  if (state.log.length > 40) state.log.shift();
}

const KIND_NAME: Record<TreatyKind, string> = { truce: '휴전', alliance: '동맹' };

/** 조약을 맺는다. 당사자는 나라 그 자체다 — 속국이면 속국이 맺는다. */
function sign(state: GameState, a: number, b: number, kind: TreatyKind, eco: EconomyConfig): void {
  state.treaties = (state.treaties ?? []).filter(
    (t) => !((t.a === a && t.b === b) || (t.a === b && t.b === a))
  );
  const t: Treaty = { a, b, kind, since: state.turn };
  if (kind === 'truce') t.until = state.turn + Math.round(eco.truceTurns * scaleOf(state));
  state.treaties.push(t);
  pushLog(state, `🤝 ${state.nations[a].name} ↔ ${state.nations[b].name}: ${KIND_NAME[kind]} 체결`);
  for (const [v, o] of [
    [a, b],
    [b, a],
  ]) {
    if (violatesPolicy(state, v, o)) {
      const lord = state.nations[state.nations[v].suzerain!];
      pushLog(state, `⚠ 속국 ${state.nations[v].name}의 ${KIND_NAME[kind]} — ${lord.name}의 허락 밖`);
    }
  }
}

function drop(state: GameState, t: Treaty): void {
  state.treaties = (state.treaties ?? []).filter((x) => x !== t);
}

/**
 * 조약을 깬다.
 *   보통       배신 — 정의가 깎이고, 다른 나라들이 덜 믿는다
 *   ordered    종주국이 끊으라 해서 끊는다 — 벌은 절반
 *   provoked   상대가 먼저 무례했다(철수 요구를 무시) — 벌이 없다
 * 깨진 상대는 곧바로 적이 된다. 자기가 당사자인 조약만 깰 수 있다 — 속국은
 * 종주국이 맺은 조약을 깰 수 없다.
 */
export function breakTreaty(
  state: GameState,
  who: number,
  other: number,
  eco: EconomyConfig = DEFAULT_ECONOMY,
  opts: { ordered?: boolean; provoked?: boolean } = {}
): boolean {
  const t = treatyOf(state, who, other);
  if (!t || (t.a !== who && t.b !== who)) return false;
  drop(state, t);
  const n = state.nations[who];
  const victim = state.nations[t.a === who ? t.b : t.a];
  if (opts.provoked) {
    pushLog(state, `🗡 ${n.name}: ${victim.name}의 영토 침범을 더 참지 않는다 — ${KIND_NAME[t.kind]} 파기`);
  } else {
    const loss = opts.ordered ? Math.round(eco.betrayJustice / 2) : eco.betrayJustice;
    adjustRep(state, n.id, -loss, opts.ordered ? 2 : 5);
    n.betrayals = (n.betrayals ?? 0) + (opts.ordered ? 0 : 1);
    pushLog(
      state,
      opts.ordered
        ? `${n.name}: 종주국의 명으로 ${wa(victim.name)}의 ${KIND_NAME[t.kind]}을 끊었다 (정의 -${loss})`
        : `🗡 ${n.name}: ${wa(victim.name)}의 ${KIND_NAME[t.kind]}을 깼다 — 배신 (정의 -${loss})`
    );
  }
  state.proposals = (state.proposals ?? []).filter(
    (p) => !(p.from === n.id && p.to === victim.id) && !(p.from === victim.id && p.to === n.id)
  );
  return true;
}

/**
 * 동맹을 푼다 — 배신이 아니다. 동맹을 휴전으로 돌린다. 휴전 기한이 끝나면
 * 다시 전쟁이지만, 그 사이 서로 칼을 거둘 시간이 있다.
 *
 * 이게 없으면 동맹은 '영원하거나 배신하거나' 둘뿐이다. 21x21 에서 턴제한에
 * 걸린 판을 뜯어보니 끝에 동맹이 두 쌍쯤 남아 서로 안 싸우고 굳어 있었다
 * (60판 중 15판, 남은 동맹 판당 2.2). 명분(공동의 적)이 사라진 동맹은
 * 풀려야 판이 끝난다.
 */
export function dissolveAlliance(
  state: GameState,
  who: number,
  other: number,
  eco: EconomyConfig = DEFAULT_ECONOMY,
  why = ''
): boolean {
  const t = treatyOf(state, who, other);
  if (!t || t.kind !== 'alliance' || (t.a !== who && t.b !== who)) return false;
  t.kind = 'truce';
  t.since = state.turn;
  t.until = state.turn + Math.round(eco.truceTurns * scaleOf(state));
  const partner = state.nations[t.a === who ? t.b : t.a];
  // 칼을 거두고 헤어졌다 — 배신이 아니라 약속을 지킨 것이다
  adjustRep(state, who, +3, 0);
  adjustRep(state, partner.id, +3, 0);
  pushLog(
    state,
    `${state.nations[who].name}: ${wa(partner.name)}의 동맹을 풀고 휴전으로 돌렸다${why ? ` — ${why}` : ''}`
  );
  return true;
}

/**
 * 제안한다. 받는 쪽이 AI 면 그 자리에서 답하고, 사람이면 제안을 걸어두고
 * 'pending' 을 준다 — 사람 차례에 화면이 묻는다.
 */
export function propose(
  state: GameState,
  from: number,
  to: number,
  kind: TreatyKind,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY,
  reason = ''
): { result: 'accepted' | 'declined' | 'pending' | 'invalid'; reason: string } {
  if (!eco.diplomacyOn) return { result: 'invalid', reason: '외교가 꺼져 있다' };
  const fromN = state.nations[from];
  const target = state.nations[to];
  if (!fromN?.alive || !target?.alive || blocOf(state, from) === blocOf(state, to)) {
    return { result: 'invalid', reason: '상대가 없다' };
  }
  const existing = treatyOf(state, from, to);
  if (existing && (existing.kind === kind || existing.kind === 'alliance')) {
    return { result: 'invalid', reason: '이미 맺었다' };
  }
  state.diploCooldown = state.diploCooldown ?? {};
  state.diploCooldown[key(from, to)] = state.turn;

  if (target.isHuman) {
    const list = (state.proposals = state.proposals ?? []);
    if (!list.some((p) => p.from === from && p.to === to && p.kind === kind)) {
      list.push({ from, to, kind, turn: state.turn, reason });
    }
    return { result: 'pending', reason: '' };
  }

  if (!eco.vassalDiplomacy && (fromN.suzerain !== null || target.suzerain !== null)) {
    return { result: 'invalid', reason: '속국은 외교를 할 수 없다' };
  }
  const w = wants(state, to, from, kind, undefined, eco);
  if (!w.yes) {
    pushLog(state, `${target.name}: ${fromN.name}의 ${KIND_NAME[kind]} 제안 거절 — ${w.reason}`);
    return { result: 'declined', reason: w.reason };
  }
  if (rng() > trustIn(state, from)) {
    const why = (fromN.betrayals ?? 0) > 0 ? '배신한 나라는 믿을 수 없다' : '아직 믿기 어렵다';
    pushLog(state, `${target.name}: ${fromN.name}의 ${KIND_NAME[kind]} 제안 거절 — ${why}`);
    return { result: 'declined', reason: why };
  }
  sign(state, from, to, kind, eco);
  return { result: 'accepted', reason: w.reason };
}

/**
 * 사람이 받은 사신에 답한다. breakOrder(종주국의 명) 는 여기서 다루지 않는다
 * — 명령 체계(orders.answerBreakOrder)가 맡는다.
 */
export function answerProposal(
  state: GameState,
  p: Proposal,
  accept: boolean,
  eco: EconomyConfig = DEFAULT_ECONOMY
): void {
  state.proposals = (state.proposals ?? []).filter((x) => x !== p);
  const from = state.nations[p.from];
  const to = state.nations[p.to];
  if (!from?.alive || !to?.alive) return;
  if (p.kind === 'withdraw') {
    if (accept) {
      pushLog(state, `${to.name}: ${from.name}의 땅에서 물러나겠다고 답했다`);
    } else {
      // 대놓고 거절했다 — 주인은 더 기다리지 않는다
      breakTreaty(state, p.from, p.to, eco, { provoked: true });
      delete (state.intrusions ?? {})[`${p.to}>${p.from}`];
    }
    return;
  }
  if (p.kind === 'breakOrder') return;
  if (accept) sign(state, p.from, p.to, p.kind, eco);
  else pushLog(state, `${to.name}: ${from.name}의 ${KIND_NAME[p.kind]} 제안 거절`);
}

/** 이 나라에게 지금 와 있는 사신 */
export function proposalsFor(state: GameState, id: number): Proposal[] {
  return (state.proposals ?? []).filter((p) => p.to === id);
}

// ── 손님 부대 ────────────────────────────────────────────────

/**
 * 조약 상대의 빈 땅에 들어갔다. 칸을 빼앗지 않고 손님으로 선다 — 원래 주인을
 * 적어두고, 떠나면 돌려준다. 주인은 그걸 안다(사건 줄).
 */
export function enterAsGuest(state: GameState, cell: Cell, prevOwner: number): void {
  if (cell.landlord === undefined) cell.landlord = prevOwner;
  const guest = cell.owner !== null ? state.nations[cell.owner] : null;
  const host = state.nations[cell.landlord];
  if (guest && host) pushLog(state, `⚠ ${guest.name}의 군대가 ${host.name}의 땅에 들어갔다`);
}

/**
 * 손님 칸을 정리한다 (턴 시작마다).
 *   떠났다       → 땅은 원래 주인에게
 *   전쟁이 됐다  → 그 자리를 쥔 쪽이 갖는다 (배신한 쪽의 기습 이점)
 */
export function settleGuests(state: GameState): void {
  for (const c of state.cells) {
    if (c.landlord === undefined) continue;
    const host = c.landlord;
    if (!state.nations[host]?.alive) {
      c.landlord = undefined;
      continue;
    }
    if (c.units <= 0 || c.owner === null || c.neutral) {
      c.owner = c.units > 0 && c.neutral ? c.owner : host;
      c.landlord = undefined;
      continue;
    }
    if (c.owner === host || !atPeaceIds(state, c.owner, host)) c.landlord = undefined;
  }
}

function atPeaceIds(state: GameState, a: number, b: number): boolean {
  return blocOf(state, a) === blocOf(state, b) || treatyOf(state, a, b) !== null;
}

/** 이 나라 땅에 서 있는 손님 부대 수 — 손님 나라별 */
export function guestsIn(state: GameState, host: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const c of state.cells) {
    if (c.landlord !== host || c.owner === null || c.units <= 0) continue;
    out.set(c.owner, (out.get(c.owner) ?? 0) + 1);
  }
  return out;
}

/** 손님을 몇 턴 참나. 첫 턴에 철수를 요구하고, 이 턴을 넘기면 깬다. */
const PATIENCE = 2;

/**
 * 주인의 반응. 손님이 들어온 첫 턴에 철수를 요구하고, 참을성이 다하면 조약을
 * 깬다 — 도발을 받은 쪽이므로 배신 벌이 없다.
 */
function reactToGuests(state: GameState, host: number, eco: EconomyConfig): void {
  const intr = (state.intrusions = state.intrusions ?? {});
  const now = guestsIn(state, host);
  for (const k of Object.keys(intr)) {
    const [g, h] = k.split('>').map(Number);
    if (h === host && !now.has(g)) delete intr[k];
  }
  for (const [g, count] of now) {
    const k = `${g}>${host}`;
    const turns = (intr[k] ?? 0) + 1;
    intr[k] = turns;
    if (turns === 1) {
      const guest = state.nations[g];
      pushLog(state, `${state.nations[host].name}: ${guest.name}에게 군대를 빼라고 요구했다`);
      if (guest.isHuman) {
        const list = (state.proposals = state.proposals ?? []);
        if (!list.some((p) => p.kind === 'withdraw' && p.from === host && p.to === g)) {
          list.push({
            from: host,
            to: g,
            kind: 'withdraw',
            turn: state.turn,
            reason: `우리 땅에 당신 군대 ${count}부대가 서 있다. ${PATIENCE}턴 안에 물러나라.`,
          });
        }
      }
    } else if (turns > PATIENCE) {
      breakTreaty(state, host, g, eco, { provoked: true });
      delete intr[k];
    }
  }
}

// ── 한 턴의 외교 ─────────────────────────────────────────────

/**
 * 턴 시작마다 (rules.beginTurn). 모든 나라가 거치고, 사람도 거친다.
 *   1. 정리 — 망한 나라의 조약, 한 진영이 된 사이의 조약, 기한이 다 된 휴전
 *   2. 동맹만 남았으면 푼다 — 안 그러면 판이 끝나지 않는다
 *   3. AI 라면 — 손님에 반응하고, 깰지, 청할지
 */
export function stepDiplomacy(
  state: GameState,
  nationId: number,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY
): void {
  if (!eco.diplomacyOn) return;
  const list = state.treaties ?? [];
  const alive = (id: number) => !!state.nations[id]?.alive;

  for (const t of [...list]) {
    if (!alive(t.a) || !alive(t.b) || blocOf(state, t.a) === blocOf(state, t.b)) {
      drop(state, t);
      continue;
    }
    if (t.until !== undefined && state.turn >= t.until) {
      drop(state, t);
      pushLog(state, `${state.nations[t.a].name} ↔ ${state.nations[t.b].name}: 휴전을 끝까지 지켰다`);
      // 약속을 끝까지 지킨 것은 옳은 일이다 — 두 나라 모두
      adjustRep(state, t.a, +3, 0);
      adjustRep(state, t.b, +3, 0);
    }
  }
  state.proposals = (state.proposals ?? []).filter(
    (p) => alive(p.from) && alive(p.to) && state.turn - p.turn <= 1
  );

  const heads = state.nations.filter((n) => n.alive && n.suzerain === null).map((n) => n.id);
  if (heads.length >= 2 && (state.treaties ?? []).some((t) => t.kind === 'alliance')) {
    let anyWar = false;
    for (let i = 0; i < heads.length && !anyWar; i++) {
      for (let j = i + 1; j < heads.length; j++) {
        if (!treatyOf(state, heads[i], heads[j])) {
          anyWar = true;
          break;
        }
      }
    }
    if (!anyWar) {
      state.treaties = (state.treaties ?? []).filter((t) => t.kind !== 'alliance');
      pushLog(state, '공동의 적이 사라져 동맹이 풀렸다');
    }
  }

  const me = state.nations[nationId];
  if (!me || !me.alive || me.isHuman) return;
  reactToGuests(state, nationId, eco);
  aiDiplomacy(state, nationId, rng, eco);
}

/**
 * 배신의 문턱. edge 배 넘게 세고 공동의 적이 없으면, 턴마다
 * chance × (1 - 정의) 로 깬다.
 *
 * 처음엔 2배 · 0.3 이었다 — 11x11 20판에 배신 1번(판당 0.05). 동맹이 5번씩
 * 맺어지는데 한 번도 안 깨지면 '동맹 파기' 는 없는 기능과 같다.
 */
const BETRAY = { edge: 1.5, chance: 0.35 };

/**
 * AI 의 외교. 한 턴에 하나만 한다 — 깨거나, 청하거나.
 * 속국도 한다 — 셈은 wants 가 속국의 처지로 따로 한다.
 *
 * 깨는 것: 조약 상대가 맞닿아 있고, 내가 1.5배 넘게 세고, 상대보다 센
 * 공동의 적이 없을 때. 정의가 높을수록 잘 안 깬다 — 정의로운 나라가
 * 약속을 지키는 쪽이어야 정의가 이름값을 한다.
 */
function aiDiplomacy(state: GameState, me: number, rng: RNG, eco: EconomyConfig): void {
  const b = readBoard(state);
  const self = state.nations[me];
  const myHead = blocOf(state, me);
  const mine = b.power.get(myHead) ?? 0;

  for (const t of [...(state.treaties ?? [])]) {
    if (t.a !== me && t.b !== me) continue;
    const other = t.a === me ? t.b : t.a;
    const oh = blocOf(state, other);
    if (t.until !== undefined && t.until - state.turn <= 2) continue; // 곧 끝날 휴전은 기다린다
    if (!b.touch.has(key(myHead, oh))) continue;
    const theirs = b.power.get(oh) ?? 0;
    if (mine <= theirs * BETRAY.edge) continue;
    const threat = commonThreat(state, b, myHead, oh);
    if (threat && threat.power > theirs) continue;
    const p = BETRAY.chance * (1 - effective(self.justice) / 100);
    if (rng() < p) {
      breakTreaty(state, me, other, eco);
      return;
    }
  }

  // 명분이 사라진 동맹은 푼다 — 사흘을 지켜보고. 한 턴 흔들렸다고 풀면
  // 동맹이 맺고 풀리기를 되풀이한다.
  const doubt = (state.allianceDoubt = state.allianceDoubt ?? {});
  for (const t of [...(state.treaties ?? [])]) {
    if (t.kind !== 'alliance' || (t.a !== me && t.b !== me)) continue;
    const other = t.a === me ? t.b : t.a;
    const k = key(me, other);
    if (wants(state, me, other, 'alliance', b, eco).yes) {
      delete doubt[k];
      continue;
    }
    doubt[k] = (doubt[k] ?? 0) + 1;
    if (doubt[k] >= 3) {
      delete doubt[k];
      dissolveAlliance(state, me, other, eco, '공동의 적이 더는 두렵지 않다');
      return;
    }
  }

  const cd = state.diploCooldown ?? {};
  const waitTurns = Math.round(5 * scaleOf(state));
  for (const other of b.heads) {
    if (other === myHead) continue;
    if (state.turn - (cd[key(me, other)] ?? -999) < waitTurns) continue;
    if (!knows(state, me, other)) continue;
    const existing = treatyOf(state, me, other);
    if (existing?.kind === 'alliance') continue;

    // 상대가 AI 면 받아줄지 먼저 헤아린다. 안 그러면 판마다 거절이 스물다섯
    // 번씩 쌓였다(11x11 20판) — 속으로 원하지 않을 줄 아는 것을 청하는 나라는 없다.
    const theyWant = (k: TreatyKind) =>
      state.nations[other].isHuman || wants(state, other, me, k, b, eco).yes;
    const ally = wants(state, me, other, 'alliance', b, eco);
    if (ally.yes && theyWant('alliance')) {
      propose(state, me, other, 'alliance', rng, eco, ally.reason);
      return;
    }
    if (!existing && b.touch.has(key(myHead, other))) {
      const truce = wants(state, me, other, 'truce', b, eco);
      if (truce.yes && theyWant('truce')) {
        propose(state, me, other, 'truce', rng, eco, truce.reason);
        return;
      }
    }
  }
}
