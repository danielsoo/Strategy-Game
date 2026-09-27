// 평판 — 정의와 공포, 그리고 나라의 성격
//
// 모든 나라는 아무 성향 없이 시작한다(정의 0 · 공포 0). 한 일이 쌓여 한쪽이
// 다른 쪽을 누르면 나라의 성격이 바뀐다. 시간이 지나도 저절로 돌아오지 않는다 —
// 한 번 쓴 역사는 지워지지 않는다. 다른 일을 해서 덮을 수 있을 뿐이다.
//
//   정의가 오르는 것   옳은 일 — 약속을 끝까지 지키고, 법대로 벌하고,
//                     청해 온 약자를 받아주고, 동맹의 적과 함께 싸운다
//   정의가 깎이는 것   그른 일 — 배신, 징발, 약탈, 제 속국을 토벌함
//   공포가 오르는 것   잔혹 — 병합, 토벌·문책, 배신, 징발, 약탈, 공물을 챙김
//   공포가 내리는 것   자비 — 살려두고(병합 대신 속국), 용서하고, 돌려주고, 돕는다
//
// 옳은 일(정의)과 선한 일(공포를 누그러뜨림)을 나눈 까닭: 법대로 벌하는 것은
// 옳지만 자비롭지는 않고, 공물을 돌려주는 것은 자비롭지만 법의 문제는 아니다.
//
// 이 파일은 types 말고는 아무것도 불러오지 않는다 — rules·diplomacy·orders·
// vassals·encounters 가 모두 이걸 부른다.

import { GameState, Nation, DEFAULT_ECONOMY } from './types';

export type Character = 'just' | 'feared' | 'none';

/** 성격이 갈리는 차이. 이만큼 한쪽이 앞서야 그 나라의 이름이 된다. */
export const CHARACTER_GAP = 15;

export function characterOf(n: Nation): Character {
  const d = n.justice - n.fear;
  if (d >= CHARACTER_GAP) return 'just';
  if (-d >= CHARACTER_GAP) return 'feared';
  return 'none';
}

export const CHARACTER_NAME: Record<Character, string> = {
  just: '정의의 나라',
  feared: '공포의 나라',
  none: '성향 없음',
};

/**
 * 성격이 바뀔 때의 대사. 한 나라의 역사에 한 줄이 새겨지는 순간이라, 사건
 * 줄의 다른 말들과 달리 판타지 연대기처럼 쓴다. '{n}' 자리에 나라 이름.
 * 같은 줄만 되풀이되면 금방 무뎌지므로 여럿을 돌려 쓴다.
 */
const LINES: Record<string, string[]> = {
  'none>just': [
    '약속을 지킨 칼은 녹슬지 않는다. 사람들은 이제 {n}의 깃발을 보면 문을 연다.',
    '{n}의 이름이 노래가 되어 장터를 떠돈다 — 정의의 군대가 온다고.',
    '저울은 기울지 않았고, 사람들은 그것을 기억했다. {n}은 정의의 나라가 되었다.',
  ],
  'none>feared': [
    '불탄 마을의 연기가 국경을 넘었다. 이제 {n}의 이름은 아이들의 울음을 그치게 한다.',
    '성문마다 {n}의 깃발을 본 자들이 무릎을 꿇는다. 공포가 왕관을 썼다.',
    '까마귀가 {n}의 군대를 따라 날기 시작했다. 세상은 그 뜻을 안다.',
  ],
  'just>none': [
    '노래는 끊겼고 사람들은 머뭇거린다. {n}의 저울이 흔들리고 있다.',
    '한때 문을 열어주던 마을들이 빗장을 건다. {n}의 이름이 빛을 잃었다.',
  ],
  'feared>none': [
    '피로 쓴 역사 위에 처음으로 자비가 적혔다. 세상은 아직 믿지 않지만, {n}은 달라지기 시작했다.',
    '까마귀들이 흩어진다. {n}의 이름 앞에서 더는 누구도 떨지 않는다.',
  ],
  'just>feared': [
    '정의를 외치던 입이 칼을 물었다. {n}의 이름은 이제 배신과 함께 불린다.',
  ],
  'feared>just': [
    '재 위에 새 성벽이 올라간다. {n}은 공포를 버리고 정의를 택했다.',
  ],
};

/** 판에 새겨질 연대기 한 줄 — 화면이 크게 띄울 수 있게 모아둔다 */
export interface Chronicle {
  turn: number;
  nation: number;
  from: Character;
  to: Character;
  line: string;
}

function lineFor(state: GameState, n: Nation, from: Character, to: Character): string {
  const list = LINES[`${from}>${to}`] ?? LINES[`none>${to}`] ?? [`{n}은 ${CHARACTER_NAME[to]}가 되었다.`];
  // 난수를 쓰지 않는다 — 대사 하나 고르느라 판의 전개가 바뀌면 안 된다
  const pick = list[(state.turn + n.id * 7 + list.length) % list.length];
  return pick.split('{n}').join(n.name);
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * 정의·공포를 바꾼다. 모든 변동은 여기를 거친다 — 흩어져 있으면 무엇이 무엇을
 * 바꾸는지 셀 수가 없다(한 번 뽑아보니 공포를 내리는 길이 하나도 없었다).
 * 성격이 바뀌었으면 연대기에 한 줄을 새긴다.
 */
export function adjustRep(state: GameState, nationId: number, dJustice: number, dFear: number): void {
  const n = state.nations[nationId];
  if (!n) return;
  const before = characterOf(n);
  n.justice = clamp(n.justice + dJustice);
  n.fear = clamp(n.fear + dFear);
  const after = characterOf(n);
  if (after === before) return;
  const line = lineFor(state, n, before, after);
  state.log.push(`📜 ${line}`);
  if (state.log.length > 40) state.log.shift();
  const list = (state.chronicle = state.chronicle ?? []);
  list.push({ turn: state.turn, nation: n.id, from: before, to: after, line });
  if (list.length > 30) list.shift();
}

/**
 * 종주국의 성격이 속국에게 미치는 것 — '마음' 과 '복종' 을 나눈다.
 *
 *   충성(마음)   정의가 올리고 공포가 깎는다 — 매 턴 조금씩
 *   복종         공포가 올린다 — 속으로 싫어도 따른다
 *   대놓고 거부  정의로운 주인에게는 한다(벌하지 않을 걸 안다),
 *                두려운 주인에게는 못 한다(태업으로 돌린다)
 *   반란         공포는 주인이 강할 때 누르고, 흔들릴 때 한꺼번에 터뜨린다
 *
 * 공포는 '지금' 을 사고, 정의는 '나중' 을 산다.
 */
export function loyaltyDrift(lord: Nation): number {
  return (lord.justice * wJ() - lord.fear * wF()) / 50;
}

/**
 * 두 저울추. 판마다 넘기지 않고 DEFAULT_ECONOMY 에서 읽는다 — 평판 효과는
 * 전투·항복·충성·도적 등 eco 를 받지 않는 곳곳에서 쓰이기 때문이다.
 * 하네스(sim/paths.ts)는 이 값을 바꿔가며 두 길의 승률을 잰다.
 */
export function wJ(): number {
  return DEFAULT_ECONOMY.justiceWeight;
}
export function wF(): number {
  return DEFAULT_ECONOMY.fearWeight;
}

/**
 * 효과를 셈할 때 쓰는 값 — 옛 척도(50 이 중립)로 환산한다.
 *
 * 평판을 0 에서 시작하게 바꾸면서, 전투의 사기·항복 처우·급여 유예·현지 조달·
 * 도적·자발적 복속·배신 확률 같은 공식은 그대로 두고 여기서 환산한다. 성향
 * 없는 나라(0)는 예전의 '정의 50 · 공포 50' 과 똑같이 움직이고, 평판이 쌓일수록
 * 한쪽 끝(100)으로 간다. 이렇게 하지 않으면 시작값만 바꿔도 전투 균형('5 대 10
 * 도 13% 쯤 이긴다')과 AI 배신 확률(두 배가 된다)이 통째로 흔들린다.
 */
export function effective(v: number): number {
  return 50 + Math.max(0, Math.min(100, v)) / 2;
}
/** 정의 쪽 효과값 — 저울추를 곱한다 */
export function effJ(v: number): number {
  return effective(v * wJ());
}
/** 공포 쪽 효과값 — 저울추를 곱한다 */
export function effF(v: number): number {
  return effective(v * wF());
}

/**
 * 길(Nation.path)이 어느 선택에 닿는지 — 하네스가 하나씩 꺼서 어느 선택이 두 길의
 * 승률 차이를 만드는지 가른다(sim/paths.ts --off). 게임에서는 늘 전부 켜져 있다.
 */
export const PATH_KNOBS = {
  conquest: true, // 병합 대 속국
  vassals: true, // 문책 대 용서
  bands: true, // 진 무리 섬멸 대 보내주기
  betray: true, // 배신 빈도
  encounters: true, // 행군 사건 대처
};
