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

/** 두 진영 우두머리 사이의 조약. 없으면 null. */
export function treatyOf(state: GameState, a: number, b: number): Treaty | null {
  const list = state.treaties;
  if (!list || list.length === 0) return null;
  const ha = blocOf(state, a);
  const hb = blocOf(state, b);
  if (ha === hb) return null;
  for (const t of list) {
    if ((t.a === ha && t.b === hb) || (t.a === hb && t.b === ha)) return t;
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
 * 이 나라가 이 칸에 발을 들일 수 있나.
 *
 * 조약 상대의 땅에는 못 들어간다. 빈 칸에 들어가면 그 칸이 내 것이 되므로,
 * 들어가게 두면 휴전 중에 땅을 한 칸씩 훔칠 수 있다.
 * 같은 진영(속국)의 땅은 원래대로 둔다.
 */
export function mayEnter(state: GameState, mover: number, owner: number | null): boolean {
  if (owner === null || owner === mover) return true;
  if (blocOf(state, owner) === blocOf(state, mover)) return true;
  return treatyOf(state, mover, owner) === null;
}
