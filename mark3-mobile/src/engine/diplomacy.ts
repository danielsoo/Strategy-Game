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
import { GameState, EconomyConfig, DEFAULT_ECONOMY } from './types';
import { Treaty, TreatyKind, blocOf, treatyOf } from './treaty';
import { getHexNeighborOffsets } from '../utils/hexGrid';

export interface Proposal {
  from: number;
  to: number;
  kind: TreatyKind;
  turn: number;
  /** 왜 청하는가 — 사람에게 보여줄 한 줄 */
  reason: string;
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
    for (const o of getHexNeighborOffsets(c.row)) {
      const other = cellHead(c.row + o.dr, c.col + o.dc);
      if (other !== null && other !== h) touch.add(key(h, other));
    }
  }
  return { heads, power, touch };
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
  board?: Board
): { yes: boolean; reason: string } {
  const b = board ?? readBoard(state);
  const mine = b.power.get(blocOf(state, me)) ?? 0;
  const theirs = b.power.get(blocOf(state, other)) ?? 0;
  const touching = b.touch.has(key(blocOf(state, me), blocOf(state, other)));
  const threat = commonThreat(state, b, blocOf(state, me), blocOf(state, other));
  const name = (id: number) => state.nations[id]?.name ?? '?';

  if (kind === 'truce') {
    if (touching && mine > theirs * 1.6) return { yes: false, reason: '지금은 칠 수 있을 때다' };
    if (theirs > mine * 1.2) return { yes: true, reason: '싸워서 이길 수 없는 상대다' };
    if (threat && threat.power > mine * 0.8) {
      return { yes: true, reason: `${name(threat.id)}와의 전선이 급하다` };
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
  return Math.max(0.05, Math.min(0.95, 0.8 * betrayed + (n.justice - 50) / 200));
}

// ── 맺고 깨기 ────────────────────────────────────────────────

function pushLog(state: GameState, msg: string): void {
  state.log.push(msg);
  if (state.log.length > 40) state.log.shift();
}

const KIND_NAME: Record<TreatyKind, string> = { truce: '휴전', alliance: '동맹' };

function sign(state: GameState, a: number, b: number, kind: TreatyKind, eco: EconomyConfig): void {
  const ha = blocOf(state, a);
  const hb = blocOf(state, b);
  state.treaties = (state.treaties ?? []).filter(
    (t) => !((t.a === ha && t.b === hb) || (t.a === hb && t.b === ha))
  );
  const t: Treaty = { a: ha, b: hb, kind, since: state.turn };
  if (kind === 'truce') t.until = state.turn + Math.round(eco.truceTurns * scaleOf(state));
  state.treaties.push(t);
  pushLog(state, `🤝 ${state.nations[ha].name} ↔ ${state.nations[hb].name}: ${KIND_NAME[kind]} 체결`);
}

function drop(state: GameState, t: Treaty): void {
  state.treaties = (state.treaties ?? []).filter((x) => x !== t);
}

/**
 * 조약을 깬다. 배신이다 — 정의가 깎이고, 다른 나라들이 덜 믿는다.
 * 깨진 상대는 곧바로 적이 된다.
 */
export function breakTreaty(
  state: GameState,
  who: number,
  other: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): boolean {
  if (state.nations[who]?.suzerain !== null) return false; // 속국은 깰 조약도 없다
  const t = treatyOf(state, who, other);
  if (!t) return false;
  drop(state, t);
  const n = state.nations[blocOf(state, who)];
  n.justice = Math.max(0, n.justice - eco.betrayJustice);
  n.fear = Math.min(100, n.fear + 5);
  n.betrayals = (n.betrayals ?? 0) + 1;
  const victim = state.nations[blocOf(state, other)];
  pushLog(state, `🗡 ${n.name}: ${victim.name}와의 ${KIND_NAME[t.kind]}을 깼다 — 배신 (정의 -${eco.betrayJustice})`);
  // 배신당한 쪽에게 따로 온 제안도 없던 일이 된다
  state.proposals = (state.proposals ?? []).filter(
    (p) => !(p.from === n.id && p.to === victim.id) && !(p.from === victim.id && p.to === n.id)
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
  // 속국은 스스로 조약을 맺지 못한다. 막지 않으면 속국의 사신이 종주국 이름으로
  // 조약을 맺고 온다(화면에서 실제로 그렇게 됐다).
  if (state.nations[from]?.suzerain !== null) {
    return { result: 'invalid', reason: '속국은 외교를 할 수 없다 — 종주국이 한다' };
  }
  const hf = blocOf(state, from);
  const ht = blocOf(state, to);
  if (hf === ht || !state.nations[ht]?.alive) return { result: 'invalid', reason: '상대가 없다' };
  const existing = treatyOf(state, hf, ht);
  if (existing && (existing.kind === kind || existing.kind === 'alliance')) {
    return { result: 'invalid', reason: '이미 맺었다' };
  }
  state.diploCooldown = state.diploCooldown ?? {};
  state.diploCooldown[key(hf, ht)] = state.turn;

  const target = state.nations[ht];
  if (target.isHuman) {
    const list = (state.proposals = state.proposals ?? []);
    if (!list.some((p) => p.from === hf && p.to === ht && p.kind === kind)) {
      list.push({ from: hf, to: ht, kind, turn: state.turn, reason });
    }
    return { result: 'pending', reason: '' };
  }

  const w = wants(state, ht, hf, kind);
  if (!w.yes) {
    pushLog(state, `${target.name}: ${state.nations[hf].name}의 ${KIND_NAME[kind]} 제안 거절 — ${w.reason}`);
    return { result: 'declined', reason: w.reason };
  }
  if (rng() > trustIn(state, hf)) {
    const why = (state.nations[hf].betrayals ?? 0) > 0 ? '배신한 나라는 믿을 수 없다' : '아직 믿기 어렵다';
    pushLog(state, `${target.name}: ${state.nations[hf].name}의 ${KIND_NAME[kind]} 제안 거절 — ${why}`);
    return { result: 'declined', reason: why };
  }
  sign(state, hf, ht, kind, eco);
  return { result: 'accepted', reason: w.reason };
}

/** 사람이 받은 제안에 답한다 */
export function answerProposal(
  state: GameState,
  p: Proposal,
  accept: boolean,
  eco: EconomyConfig = DEFAULT_ECONOMY
): void {
  state.proposals = (state.proposals ?? []).filter((x) => x !== p);
  if (!state.nations[p.from]?.alive || state.nations[p.from].suzerain !== null) return;
  if (accept) sign(state, p.from, p.to, p.kind, eco);
  else pushLog(state, `${state.nations[p.to].name}: ${state.nations[p.from].name}의 ${KIND_NAME[p.kind]} 제안 거절`);
}

/** 이 나라에게 지금 와 있는 제안 */
export function proposalsFor(state: GameState, id: number): Proposal[] {
  return (state.proposals ?? []).filter((p) => p.to === id);
}

// ── 한 턴의 외교 ─────────────────────────────────────────────

/**
 * 턴 시작마다 (rules.beginTurn). 모든 나라가 거치고, 사람도 거친다.
 *   1. 정리 — 망했거나 속국이 된 나라의 조약, 기한이 다 된 휴전
 *   2. 동맹만 남았으면 푼다 — 안 그러면 판이 끝나지 않는다
 *   3. AI 라면 깰지, 청할지
 */
export function stepDiplomacy(
  state: GameState,
  nationId: number,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY
): void {
  if (!eco.diplomacyOn) return;
  const list = state.treaties ?? [];
  const isHead = (id: number) => !!state.nations[id]?.alive && state.nations[id].suzerain === null;

  for (const t of [...list]) {
    if (!isHead(t.a) || !isHead(t.b)) {
      drop(state, t);
      continue;
    }
    if (t.until !== undefined && state.turn >= t.until) {
      drop(state, t);
      pushLog(state, `${state.nations[t.a].name} ↔ ${state.nations[t.b].name}: 휴전 기한이 끝났다`);
    }
  }
  state.proposals = (state.proposals ?? []).filter(
    (p) => isHead(p.from) && isHead(p.to) && state.turn - p.turn <= 1
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
  if (!me || !isHead(nationId) || me.isHuman) return;
  aiDiplomacy(state, nationId, rng, eco);
}

/**
 * AI 의 외교. 한 턴에 하나만 한다 — 깨거나, 청하거나.
 *
 * 깨는 것: 조약 상대가 맞닿아 있고, 내가 두 배 넘게 세고, 둘 다보다 센
 * 공동의 적이 없을 때. 정의가 높을수록 잘 안 깬다 — 정의로운 나라가
 * 약속을 지키는 쪽이어야 정의가 이름값을 한다.
 */
/**
 * 배신의 문턱. edge 배 넘게 세고 공동의 적이 없으면, 턴마다
 * chance × (1 - 정의) 로 깬다.
 *
 * 처음엔 2배 · 0.3 이었다 — 11x11 20판에 배신 1번(판당 0.05). 동맹이 5번씩
 * 맺어지는데 한 번도 안 깨지면 '동맹 파기' 는 없는 기능과 같다.
 */
const BETRAY = { edge: 1.5, chance: 0.35 };

function aiDiplomacy(state: GameState, me: number, rng: RNG, eco: EconomyConfig): void {
  const b = readBoard(state);
  const self = state.nations[me];
  const mine = b.power.get(me) ?? 0;

  for (const t of [...(state.treaties ?? [])]) {
    if (t.a !== me && t.b !== me) continue;
    const other = t.a === me ? t.b : t.a;
    if (t.until !== undefined && t.until - state.turn <= 2) continue; // 곧 끝날 휴전은 기다린다
    if (!b.touch.has(key(me, other))) continue;
    const theirs = b.power.get(other) ?? 0;
    if (mine <= theirs * BETRAY.edge) continue;
    const threat = commonThreat(state, b, me, other);
    if (threat && threat.power > theirs) continue;
    const p = BETRAY.chance * (1 - self.justice / 100);
    if (rng() < p) {
      breakTreaty(state, me, other, eco);
      return;
    }
  }

  const cd = state.diploCooldown ?? {};
  const waitTurns = Math.round(5 * scaleOf(state));
  for (const other of b.heads) {
    if (other === me) continue;
    if (state.turn - (cd[key(me, other)] ?? -999) < waitTurns) continue;
    if (!knows(state, me, other)) continue;
    const existing = treatyOf(state, me, other);
    if (existing?.kind === 'alliance') continue;

    // 상대가 AI 면 받아줄지 먼저 헤아린다. 안 그러면 판마다 거절이 스물다섯
    // 번씩 쌓였다(11x11 20판) — 속으로 원하지 않을 줄 아는 것을 청하는 나라는 없다.
    const theyWant = (k: TreatyKind) =>
      state.nations[other].isHuman || wants(state, other, me, k, b).yes;
    const ally = wants(state, me, other, 'alliance', b);
    if (ally.yes && theyWant('alliance')) {
      propose(state, me, other, 'alliance', rng, eco, ally.reason);
      return;
    }
    if (!existing && b.touch.has(key(me, other))) {
      const truce = wants(state, me, other, 'truce', b);
      if (truce.yes && theyWant('truce')) {
        propose(state, me, other, 'truce', rng, eco, truce.reason);
        return;
      }
    }
  }
}
