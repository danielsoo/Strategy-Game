// 설정 — 소리 크기, 진행 속도, 보기
//
// 판 저장(saveStore)과 따로 둔다. 판은 새로 시작하면 사라지지만 설정은 사람에게
// 붙어 있어야 한다. 저장이 안 되는 곳(사생활 보호 창)이면 켤 때마다 기본값이다 —
// 그래도 게임은 돈다.

export interface Settings {
  /** 효과음 크기 0~1 */
  sfx: number;
  /** 배경음 크기 0~1 */
  music: number;
  /** 모든 소리를 끈다 — 크기는 기억해 둔다 */
  muted: boolean;
  /** AI 차례를 얼마나 천천히 보여주나 (0 느리게 · 1 보통 · 2 빠르게 · 3 최고속) */
  aiSpeed: number;
  /** 전투 결과 창을 띄우지 않고 기록 한 줄로만 */
  quickCombat: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  // 설정 창의 눈금(0·0.2·…·1)에 맞춘다 — 눈금 사이 값이면 막대가 한 칸 모자라 보였다
  sfx: 0.6,
  music: 0.4,
  muted: false,
  aiSpeed: 1,
  quickCombat: false,
};

const KEY = 'mark3.settings.v1';

let current: Settings = load();
const listeners = new Set<(s: Settings) => void>();

function load(): Settings {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    // 나중에 항목이 늘어도 옛 저장이 깨지지 않게 기본값 위에 덮는다
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...current, ...patch };
  try {
    localStorage?.setItem(KEY, JSON.stringify(current));
  } catch {
    /* 기억 못 해도 이번 판에는 먹힌다 */
  }
  for (const f of listeners) f(current);
  return current;
}

export function onSettings(f: (s: Settings) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
