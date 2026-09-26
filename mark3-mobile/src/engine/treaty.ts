// 조약 — 누가 누구와 싸우지 않기로 했나
//
// 이 파일은 판정만 한다. 누가 제안하고 받아들이고 깨는지는 diplomacy.ts 다.
// types 말고는 아무것도 가져오지 않는다 — rules·vision·path 가 모두 이걸
// 불러 쓰므로, 여기서 그쪽을 불러오면 순환이 생긴다.
//
// 조약은 진영의 우두머리(독립국)끼리 맺는다. 속국은 종주국의 조약을 따른다.
// 속국이 따로 동맹을 맺게 두면 종주국의 적과 손잡을 수 있게 되는데, 그건
// 이미 '반란' 이 맡고 있는 이야기다.
//
//   truce     휴전. 서로 치지 않고 서로의 땅에 들어가지 않는다. 기한이 있다.
//   alliance  동맹. 휴전에 더해 시야를 나누고, 붙어 있으면 협공을 거든다.
//             기한이 없다 — 누군가 깨기 전까지.

import { GameState } from './types';

export type TreatyKind = 'truce' | 'alliance';

export interface Treaty {
  a: number;
  b: number;
  kind: TreatyKind;
  since: number;
  /** 휴전이 끝나는 턴. 동맹은 없다. */
  until?: number;
}

/** 이 나라가 속한 진영의 우두머리 */
export function blocOf(state: GameState, nationId: number): number {
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
 * a 와 b 사이에 걸린 조약. 없으면 null.
 *
 * 조약의 당사자는 나라 그 자체다 — 속국도 스스로 맺는다. 다만 우두머리가
 * 맺은 조약은 그 진영 전체를 묶는다. 그래서 네 쌍을 본다:
 *   a–b 직접 · a–b의 우두머리 · a의 우두머리–b · 우두머리끼리
 * 속국이 맺은 조약은 그 속국만 묶는다 — 종주국은 여전히 그 나라와 싸울 수
 * 있다. 그게 '속국이 마음대로 동맹을 맺었다' 가 문제가 되는 까닭이다.
 */
export function treatyOf(state: GameState, a: number, b: number): Treaty | null {
  const list = state.treaties;
  if (!list || list.length === 0) return null;
  const ha = blocOf(state, a);
  const hb = blocOf(state, b);
  if (ha === hb) return null;
  const pairs: Array<[number, number]> = [
    [a, b],
    [a, hb],
    [ha, b],
    [ha, hb],
  ];
  for (const [x, y] of pairs) {
    for (const t of list) {
      if ((t.a === x && t.b === y) || (t.a === y && t.b === x)) return t;
    }
  }
  return null;
}

/** 같은 진영이거나 조약으로 묶였나 — 서로 치지 않는 사이 */
export function atPeace(state: GameState, a: number, b: number): boolean {
  if (blocOf(state, a) === blocOf(state, b)) return true;
  return treatyOf(state, a, b) !== null;
}

/** 동맹인가 (같은 진영은 동맹이 아니라 한 몸이다 — 여기서는 false) */
export function allied(state: GameState, a: number, b: number): boolean {
  return treatyOf(state, a, b)?.kind === 'alliance';
}

/**
 * 이 칸이 조약 상대의 땅인가 — 들어가면 '손님' 이 된다.
 *
 * 막지는 않는다. 동맹이어도 남의 나라에 군대를 보내는 건 무례한 일이고,
 * 그걸 싫어하는 것은 규칙이 아니라 상대의 몫이다(diplomacy 의 철수 요구).
 * AI 는 먼저 들어가지 않는다 — 이 판정은 그 예의에 쓴다.
 */
export function isGuestLand(state: GameState, mover: number, owner: number | null): boolean {
  if (owner === null || owner === mover) return false;
  if (blocOf(state, owner) === blocOf(state, mover)) return false;
  return treatyOf(state, mover, owner) !== null;
}


/**
 * 이름 뒤의 '와/과'. 받침이 있으면 '과' — "당신와의 동맹" 이 찍혀 나왔다.
 * 한글이 아니면(숫자 등) '와' 로 둔다.
 */
export function wa(name: string): string {
  const last = name.charCodeAt(name.length - 1);
  if (last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0) return `${name}과`;
  return `${name}와`;
}
