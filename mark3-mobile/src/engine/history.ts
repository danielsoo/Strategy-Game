// 한 판의 역사 — 판이 끝났을 때 돌아볼 것
//
// 로그(state.log)는 40줄에서 잘리고 연대기(state.chronicle)는 성격이 바뀐 순간만
// 30개까지 담는다. 둘 다 '지금 무슨 일이 있었나' 를 알려주려는 것이라 판 전체를
// 돌아보기에는 모자란다. 이긴 뒤에 "이 판은 어떤 판이었나" 를 보여주려면 굵직한
// 일을 자르지 않고 따로 쌓아야 한다.
//
// 무엇을 굵직하다고 볼까 — 나라의 운명이 바뀐 일만 담는다. 병합·복속·반란·멸망,
// 동맹과 배신, 성격이 바뀐 순간. 휴전은 AI 끼리도 잦아서 넣으면 묻힌다.
//
// 그리고 턴마다 나라별 영토를 적어 둔다. 끝 화면의 그래프가 이걸로 그린다.
// 판 하나에 많아야 250턴 × 5나라 — 저장에 실어도 가볍다.

import { GameState } from './types';
import { CHARACTER_NAME, Character } from './reputation';

export type HistoryKind =
  | 'annex' //       a 가 b 를 병합했다
  | 'vassal' //      b 가 a 의 속국이 되었다 (정복)
  | 'protect' //     b 가 a 에 스스로 보호를 청했다
  | 'rebel' //       a 가 종주국 b 에게서 떨어져 나갔다
  | 'fall' //        a 가 멸망했다
  | 'alliance' //    a 와 b 가 동맹을 맺었다
  | 'betray' //      a 가 b 와의 조약을 깼다 (배신)
  | 'provoked' //    a 가 b 의 침범을 참지 못해 조약을 깼다
  | 'character'; //  a 의 성격이 바뀌었다

export interface HistoryEvent {
  turn: number;
  kind: HistoryKind;
  a: number;
  b?: number;
  /** character: 무엇이 되었나 */
  to?: Character;
  /** character: 연대기 대사 */
  line?: string;
}

export interface TimelinePoint {
  turn: number;
  /** 나라별 칸 수. 망한 나라는 0 */
  cells: number[];
}

export function recordHistory(state: GameState, ev: Omit<HistoryEvent, 'turn'>): void {
  (state.history = state.history ?? []).push({ turn: state.turn, ...ev });
}

/**
 * 턴이 바뀐 뒤 처음 불릴 때만 적는다. beginTurn 이 나라마다 불리므로 같은 턴을
 * 다섯 번 적지 않게 막는다.
 */
export function recordTimeline(state: GameState): void {
  const tl = (state.timeline = state.timeline ?? []);
  if (tl.length > 0 && tl[tl.length - 1].turn === state.turn) return;
  const cells = state.nations.map(() => 0);
  for (const c of state.cells) {
    if (c.owner !== null && !c.neutral && !c.offMap) cells[c.owner]++;
  }
  tl.push({ turn: state.turn, cells });
}

/**
 * 이름 뒤 조사. 받침이 있으면 앞의 것, 없으면 뒤의 것 — '이가', '을를', '과와', '은는'.
 * 이름은 사람이 짓는다(플레이어 나라). '이(가)' 로 적으면 연대기가 서류처럼 읽힌다.
 */
export function josa(name: string, pair: '이가' | '을를' | '과와' | '은는'): string {
  const last = name.charCodeAt(name.length - 1);
  const hangul = last >= 0xac00 && last <= 0xd7a3;
  const batchim = hangul ? (last - 0xac00) % 28 !== 0 : /[0-9a-zA-Z]$/.test(name) ? false : true;
  return name + (batchim ? pair[0] : pair[1]);
}

/** 역사 한 줄을 사람이 읽을 글로 */
export function describeEvent(state: GameState, ev: HistoryEvent): string {
  const n = (id?: number) => (id === undefined ? '' : state.nations[id]?.name ?? '?');
  const j = (id: number | undefined, pair: '이가' | '을를' | '과와' | '은는') => josa(n(id), pair);
  switch (ev.kind) {
    case 'annex':
      return `${j(ev.a, '이가')} ${j(ev.b, '을를')} 삼켰다. 그 이름은 지도에서 지워졌다.`;
    case 'vassal':
      return `${j(ev.b, '이가')} 무릎을 꿇고 ${n(ev.a)}의 속국이 되었다.`;
    case 'protect':
      return `${j(ev.b, '이가')} 스스로 ${n(ev.a)}의 깃발 아래로 들어왔다.`;
    case 'rebel':
      return `${j(ev.a, '이가')} ${n(ev.b)}에게 반기를 들고 떨어져 나갔다.`;
    case 'fall':
      return `${j(ev.a, '이가')} 무너졌다.`;
    case 'alliance':
      return `${j(ev.a, '과와')} ${j(ev.b, '이가')} 손을 잡았다.`;
    case 'betray':
      return `${j(ev.a, '이가')} ${j(ev.b, '과와')}의 맹약을 저버렸다.`;
    case 'provoked':
      return `${j(ev.a, '이가')} ${n(ev.b)}의 무례를 더 참지 않고 조약을 찢었다.`;
    case 'character':
      return ev.line ?? `${n(ev.a)} — ${ev.to ? CHARACTER_NAME[ev.to] : ''}`;
  }
}

/** 끝 화면의 한 줄 요약에 쓰는 셈 */
export function historyTally(state: GameState, nationId: number) {
  const h = state.history ?? [];
  const peak = Math.max(0, ...(state.timeline ?? []).map((p) => p.cells[nationId] ?? 0));
  return {
    annexed: h.filter((e) => e.kind === 'annex' && e.a === nationId).length,
    vassals: h.filter((e) => (e.kind === 'vassal' || e.kind === 'protect') && e.a === nationId).length,
    betrayals: h.filter((e) => e.kind === 'betray' && e.a === nationId).length,
    rebellions: h.filter((e) => e.kind === 'rebel' && e.b === nationId).length,
    peak,
  };
}
