// 판 기록을 어디에 쌓고 어떻게 꺼내는가
//
// 쌓기만 하고 꺼낼 수 없으면 기록이 아니다. 가족들이 각자 자기 브라우저에서
// 두므로, 그 기록이 이쪽으로 건너올 길이 있어야 한다 — 파일로 내려받아
// 보내주면 된다.
//
// 스무 판까지 들고 있다가 오래된 것부터 버린다. 백 턴짜리가 50KB 남짓이니
// 스무 판이면 1MB 쯤이고, localStorage 한도(5MB)에 여유가 있다.

import { MatchLog } from '../engine/matchLog';

const KEY = 'mark3.matches.v1';
const KEEP = 20;

function store(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function listMatches(): MatchLog[] {
  try {
    const raw = store()?.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as MatchLog[]) : [];
  } catch {
    return [];
  }
}

/**
 * 한 판을 넣거나 덮어쓴다.
 *
 * 같은 판이 턴마다 갱신되므로 startedAt 을 열쇠로 삼아 제자리에 덮는다.
 * 안 그러면 한 판이 백 개로 쌓인다.
 */
export function putMatch(m: MatchLog): boolean {
  try {
    const s = store();
    if (!s) return false;
    const list = listMatches().filter((x) => x.startedAt !== m.startedAt);
    list.push(m);
    while (list.length > KEEP) list.shift();
    s.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    // 꽉 찼으면 오래된 절반을 버리고 한 번 더 해본다
    try {
      const s = store();
      if (!s) return false;
      const list = listMatches().slice(-Math.floor(KEEP / 2));
      list.push(m);
      s.setItem(KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  }
}

export function clearMatches(): void {
  try {
    store()?.removeItem(KEY);
  } catch {
    /* 못 지워도 할 일은 없다 */
  }
}

/**
 * 파일로 내려받는다. 웹에서만 동작하며, 안 되면 false 를 준다 —
 * 그때는 화면에서 다른 길을 알려줘야 한다.
 */
export function downloadMatches(): boolean {
  try {
    const list = listMatches();
    if (list.length === 0) return false;
    const text = JSON.stringify(list, null, 1);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mark3-기록-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
