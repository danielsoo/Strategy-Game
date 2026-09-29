// 관리자 화면 — 게임을 재고 고치는 사람만 보는 것
//
// 관전·한 수·속도, 판 짜기 단추 줄, 리셋, 기록 내보내기는 게임을 만드는 쪽의 도구다.
// 가족이 두는 화면에 늘 떠 있으면 무엇을 눌러야 하는지 헷갈리고, 판 크기 단추를 잘못
// 눌러 두던 판이 사라진다.
//
// 켜는 법: 주소 뒤에 ?admin=1 을 붙여 한 번 열면 그 브라우저는 계속 관리자다.
// ?admin=0 으로 끈다. 보안이 아니라 '화면 정리' 다 — 숨긴 것일 뿐 막은 것이 아니다.

const KEY = 'mark3.admin';

export function isAdmin(): boolean {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
    const q = new URLSearchParams(window.location.search).get('admin');
    if (q === '1') localStorage.setItem(KEY, '1');
    if (q === '0') localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
