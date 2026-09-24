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
const NAME_KEY = 'mark3.player.v1';
const KEEP = 20;

/** 기록의 열쇠. version 1 에는 id 가 없어 startedAt 을 쓴다. */
function keyOf(m: MatchLog): string {
  return m.id ?? m.startedAt;
}

/**
 * 새 판의 id. 시각에 난수를 붙인다 — 가족 둘이 같은 초에 시작해도 겹치지
 * 않게. 게임 난수(rng)를 쓰지 않는 것은 일부러다: 기록 id 가 난수를 하나
 * 먹으면 같은 씨앗의 판 전개가 달라진다.
 */
export function newMatchId(): string {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `${t}-${r}`;
}

/** 이어하기에서 쓴다. 스무 판 밖으로 밀려났으면 null. */
export function findMatch(id: string): MatchLog | null {
  return listMatches().find((m) => keyOf(m) === id) ?? null;
}

/**
 * 이름을 기억한다. 새로고침할 때마다 다시 치게 하면 몇 번은 건너뛰고,
 * 그러면 기록이 '이름없음' 으로 쌓여 누구 판인지 가릴 수 없다.
 */
export function loadPlayerName(): string {
  try {
    return store()?.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    store()?.setItem(NAME_KEY, name);
  } catch {
    /* 기억 못 해도 다음에 다시 물으면 된다 */
  }
}

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
 * 같은 판이 턴마다 갱신되므로 id 를 열쇠로 삼아 덮는다. 안 그러면 한 판이
 * 백 개로 쌓인다. 덮은 판은 맨 뒤로 온다 — 오래전에 시작했어도 지금 두고
 * 있는 판이 먼저 밀려나면 안 된다.
 */
export function putMatch(m: MatchLog): boolean {
  try {
    const s = store();
    if (!s) return false;
    const list = listMatches().filter((x) => keyOf(x) !== keyOf(m));
    list.push(m);
    while (list.length > KEEP) list.shift();
    s.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    // 꽉 찼으면 오래된 절반을 버리고 한 번 더 해본다
    try {
      const s = store();
      if (!s) return false;
      const list = listMatches()
        .filter((x) => keyOf(x) !== keyOf(m))
        .slice(-Math.floor(KEEP / 2));
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
export function downloadMatches(player = ''): boolean {
  try {
    const list = listMatches();
    if (list.length === 0) return false;
    const text = JSON.stringify(list, null, 1);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // 가족 여럿이 보내면 파일 이름이 다 같아 덮인다. 이름을 넣어 가른다.
    const who = player.replace(/[\\/:*?"<>|\s]+/g, '_');
    const day = new Date().toISOString().slice(0, 10);
    a.download = who ? `mark3-기록-${who}-${day}.json` : `mark3-기록-${day}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
