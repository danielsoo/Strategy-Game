// 저장을 어디에 둘 것인가
//
// 웹에서는 localStorage 다. PC 로 쌀 때(Tauri)도 같은 자리를 쓰고, 나중에
// 파일로 옮기고 싶으면 여기만 바꾸면 된다 — 게임 쪽은 이 네 함수만 안다.
//
// 저장이 안 되는 자리(사생활 보호 창, 저장 공간 꽉 참, 웹이 아닌 곳)가
// 있으므로 전부 try 로 감싼다. 저장에 실패했다고 판이 멈춰서는 안 된다.

const KEY = 'mark3.save.v1';

function store(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readSave(): string | null {
  try {
    return store()?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

/** 저장됐으면 true. 실패해도 조용히 false — 화면에서 한 번만 알려준다. */
export function writeSave(text: string): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(KEY, text);
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    store()?.removeItem(KEY);
  } catch {
    /* 지우지 못해도 할 일은 없다 */
  }
}

export function canSave(): boolean {
  return store() !== null;
}
