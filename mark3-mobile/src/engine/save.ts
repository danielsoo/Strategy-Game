// 판을 접었다 펴기
//
// 21x21 한 판이 예순 턴을 넘긴다. 저장이 없으면 창을 닫는 순간 판이 사라지고,
// 그러면 아무도 한 판을 끝내지 못한다. PC 로 내기 전에 이게 먼저다.
//
// GameState 는 함수도 클래스도 없는 순수 데이터라 그대로 JSON 이 된다.
// 다만 두 가지를 같이 적어야 판이 제대로 이어진다.
//
//   acted   이번 턴에 이미 움직인 부대. 이걸 빼먹으면 불러온 직후 모든 부대가
//           한 번씩 더 움직인다.
//   meta    판 짜기(모드·크기·난이도). 화면이 이걸로 단추 상태를 되돌린다.
//
// 난수는 저장하지 않는다. 씨앗과 소비 위치를 적어도 불러온 뒤의 전개가
// 저장 전과 같아지지는 않는다 — 어차피 앞일은 아직 굴리지 않았다.

import { GameState } from './types';

/**
 * 저장 형식이 바뀌면 올린다. 옛 저장을 억지로 읽으면 이상한 판이 되느니만
 * 못하므로, 맞지 않으면 없는 것으로 친다.
 */
export const SAVE_VERSION = 1;

export interface SaveMeta {
  modeIdx: number;
  sizeIdx: number;
  diffIdx: number;
  /** 이번 턴에 이미 움직인 칸 */
  acted: string[];
  /**
   * 이 판의 기록 id. 이어하기가 같은 기록에 이어 붙으려면 저장에 있어야 한다.
   * 없어도 읽는다(이전 저장) — 그때는 기록을 새로 연다. 그래서 SAVE_VERSION 은
   * 올리지 않았다. 올리면 두던 판이 통째로 사라진다.
   */
  matchId?: string;
}

export interface SaveFile {
  version: number;
  savedAt: number;
  meta: SaveMeta;
  state: GameState;
}

export function encodeSave(state: GameState, meta: SaveMeta): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: Date.now(), meta, state };
  return JSON.stringify(file);
}

/**
 * 읽을 수 없으면 null. 깨진 저장 하나로 게임이 아예 안 켜지면 안 되므로
 * 여기서 전부 삼킨다.
 */
export function decodeSave(text: string | null): SaveFile | null {
  if (!text) return null;
  try {
    const file = JSON.parse(text) as SaveFile;
    if (!file || file.version !== SAVE_VERSION) return null;
    const s = file.state;
    if (!s || !Array.isArray(s.cells) || !Array.isArray(s.nations)) return null;
    if (s.cells.length !== s.rows * s.cols) return null;
    // 시야는 나라 수만큼 있어야 한다. 없으면 안개가 통째로 어긋난다.
    if (!Array.isArray(s.vision) || s.vision.length !== s.nations.length) return null;
    if (!file.meta || !Array.isArray(file.meta.acted)) return null;
    return file;
  } catch {
    return null;
  }
}

/** 화면에 "n턴 · 21x21 · 3분 전" 처럼 띄우기 위한 한 줄 */
export function describeSave(file: SaveFile): string {
  const mins = Math.max(0, Math.round((Date.now() - file.savedAt) / 60000));
  const when = mins < 1 ? '방금' : mins < 60 ? `${mins}분 전` : `${Math.round(mins / 60)}시간 전`;
  const alive = file.state.nations.filter((n) => n.alive).length;
  return `${file.state.turn}턴 · ${file.state.rows}x${file.state.cols} · ${alive}개국 · ${when}`;
}
