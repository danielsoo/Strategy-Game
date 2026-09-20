// 게임 상태 — 규칙의 유일한 출처
//
// 이전에는 GameScreen.tsx 의 턴 루프와 sim/engine.ts 가 각각 규칙을 들고 있어
// 갈라질 위험이 있었다. 이제 화면과 시뮬레이터가 모두 이 엔진을 호출한다.
//
// 설계상 중요한 두 가지
//  1. 국가 수는 N개다. 0|1 이분법을 쓰지 않는다.
//  2. 부대가 떠나도 칸의 소유권은 남는다. 소유권이 부대와 함께 사라지면
//     "영토 = 현재 부대 수"가 되어 경제도 전선도 성립하지 않는다.

import type { NationVision } from './vision';

export type Terrain = 'plain' | 'forest' | 'mountain' | 'desert';

/** 칸의 소유 국가. null 은 어느 나라도 차지하지 않은 땅. */
export type Owner = number | null;

/** 나라에 속하지 않은 무장 세력 */
export type NeutralKind = 'mercenary' | 'bandit';

export interface Cell {
  id: string; // `${row},${col}`
  row: number;
  col: number;
  owner: Owner;
  units: number;
  /** 사기 0~100. 전투는 병력이 아니라 이게 꺾여서 끝난다. */
  morale: number;
  /** 피로 0~100. 이동·전투로 쌓이고 쉬면 회복된다. */
  exhaustion: number;
  /** 누적 전투 보정(기세/베테랑). ±15%p 로 제한된다. */
  driftPP: number;
  /**
   * 행군력 0~100. 턴마다 차오르고 이동할 때 쓴다.
   *
   * 병력이 많을수록 한 칸 옮기는 데 더 든다. 대군이 굼뜬 것은 게임의 편의가
   * 아니라 실제 전쟁이 그렇기 때문이다 — 보급과 대열이 길어지면 하루에 갈
   * 수 있는 거리가 줄어든다. 이게 있어야 "느리고 무거운 망치냐, 빠르고 약한
   * 기병이냐"가 선택이 된다. 없으면 크게 모으는 쪽에 아무 대가가 없다.
   */
  march: number;
  terrain: Terrain;
  castle: boolean;
  /** 0 없음, 1~3 건설 중, 4 완공 */
  fortStage: number;
  /** 인접 6칸 중 4칸 이상이 적이면 참. 매 턴 다시 계산한다. */
  encircled: boolean;
  /** owner 가 null 이면서 units > 0 일 때의 세력 종류 */
  neutral?: NeutralKind;
  /** 무역상이 닦아놓은 길 */
  hasRoad?: boolean;
  /**
   * 이 부대가 직전에 떠나온 칸.
   *
   * AI 에 기억이 없으면 두 칸의 점수가 비슷할 때 끝없이 오간다. 실제로
   * 후반에는 이동의 3분의 2가 두 턴 전 자리로 돌아가는 왕복이었다.
   */
  lastFrom?: string;
  /**
   * 이 부대가 향하는 곳과, 그 명령을 받은 지 몇 턴 됐는가.
   *
   * 매 턴 백지에서 다시 고르면 두 칸 점수가 비슷할 때 끝없이 오간다.
   * 되돌아가기 벌점으로 30.6% → 26.6% 까지 줄였지만 거기서 막혔다.
   * 목적지를 기억하고 도착할 때까지 유지해야 그 이상 줄어든다.
   */
  order?: { destId: string; age: number };
  /**
   * 판 밖. 격자는 사각형으로 들고 있지만 실제 판은 그 안에 깎아낸 육각형이다.
   *
   * 칸을 지우지 않고 표시만 하는 이유는 `row * cols + col` 로 인덱싱하는 자리가
   * 여럿 있어서다(시야 배열, cellAt). 지우면 그 인덱스가 전부 어긋난다.
   * 대신 cellAt 이 null 을 돌려주므로 이웃·이동·전투·시야에서 자연히 빠진다.
   */
  offMap?: boolean;
  /**
   * 이 성이 마지막으로 징병한 턴.
   * 성 하나는 한 턴에 한 명만 뽑는다. 여러 성을 가지면 그만큼 더 뽑을 수 있다.
   */
  recruitedTurn?: number;
}

export type MerchantPhase = 'idle' | 'outbound' | 'atTarget' | 'returning';

export interface Merchant {
  id: string;
  nation: number;
  row: number;
  col: number;
  /** 운반 중인 원금. 도착지에서 배수와 세율이 적용된다. */
  gold: number;
  phase: MerchantPhase;
  originId: string;
  destinationId?: string;
  route: string[];
  stayTurnsLeft: number;
  roundTrips: number;
}

export interface Nation {
  id: number;
  name: string;
  color: string;
  gold: number;
  /** 공포 0~100 */
  fear: number;
  /** 정의 0~100 */
  justice: number;
  /** 자국에 도착한 무역에 매기는 세율 */
  taxRate: number;
  alive: boolean;
  isHuman: boolean;
  /** 종주국. null 이면 독립국. */
  suzerain: number | null;
  /** 속국일 때의 충성도 0~100. 0 이 되면 독립 전쟁을 일으킨다. */
  loyalty: number;
  /**
   * 급여를 못 준 연속 턴 수.
   * 돈이 마르자마자 병력이 흩어지면 한 번의 실수가 곧바로 회복 불가가 된다.
   * 유예를 두고, 정의로운 나라는 더 오래 버틴다.
   */
  unpaidTurns: number;
  /**
   * 속국이 된 경위.
   * conquest  본진을 잃고 강제로 복속 — 조공은 많지만 충성이 잘 깎인다
   * voluntary 위협에 시달리다 정의로운 나라에 보호를 청함 — 조공은 적지만 안정적
   */
  vassalOrigin: 'conquest' | 'voluntary' | null;
}

export interface GameState {
  rows: number;
  cols: number;
  cells: Cell[];
  nations: Nation[];
  merchants: Merchant[];
  turn: number;
  /** 지금 차례인 나라 */
  current: number;
  /** 최근 이벤트 — 화면에 띄우고 오래된 것은 버린다 */
  log: string[];
  /** 나라별 시야. 인덱스는 nation.id 와 같다. */
  vision: NationVision[];
  winner: number | null;
  /** 왜 이겼는가. "승리"만 띄우면 무엇 때문인지 알 수가 없다. */
  winReason?: string;
}

export interface EconomyConfig {
  cellIncome: number;
  castleIncome: number;
  fortIncome: number;
  unitUpkeep: number;
  recruitCost: number;
  maxRecruitPerTurn: number;
  fortCost: number;
  startingGold: number;
  /**
   * 관리 거점(본진·완공 요새)에서 멀어질 때 수입이 감쇠하는 척도.
   * 이게 없으면 걸어다니며 땅을 칠하는 것이 곧 수입이 되어 확장이 지배 전략이 된다.
   */
  adminRange: number;
  /** 칸 하나를 유지하는 데 드는 행정 비용. 먼 땅은 순손실이 되어야 한다. */
  adminCostPerCell: number;
  /**
   * 행정 비용이 영토 규모에 대해 가속하는 지수.
   *
   * 이 값 하나가 "확장이 지배 전략인가"를 거의 혼자 결정한다. 측정값:
   *   1.00  확장형 92%  (선형이면 요새 몇 개로 상쇄되어 눈덩이가 멈추지 않는다)
   *   1.30  확장형 58%
   *   1.38  확장형 22% · 공격형 39% · 균형 35% · 경제형 18%
   *
   * 한 칸 10명 상한이 생긴 뒤 다시 쟀다. 병력을 집중할 수 없으니 땅을 넓히는
   * 쪽이 더 유리해졌고, 1.38 은 이제 느슨하다 (확장형 51%로 독주).
   *   1.38  확장형 29% · 수비형  9%
   *   1.50  확장형 25% · 수비형 18%  (판이 141턴으로 늘어지고 턴제한 20.7%)
   *   1.56  확장형 22% · 수비형 34%  (과교정 — 수비가 지배한다)
   *   1.45  확장형  8%  (과교정 — 넓히면 무조건 손해가 된다)
   */
  adminExponent: number;
  /** 무역상이 목적지에서 받는 배수 (본진 / 요새) */
  merchantCastleMultiplier: number;
  merchantFortMultiplier: number;
  /** 무역상 1명이 들고 나가는 원금 */
  merchantStake: number;
  /**
   * 점령 시 상대 국고에서 빼앗는 비율.
   * 부(富)가 손댈 수 없는 숫자로 남아 있으면 선두를 되돌리는 힘이 없다.
   * 돈을 뺏을 수 있어야 "부유한 나라가 표적이 된다"가 성립한다.
   */
  plunderCastleShare: number;
  plunderFortShare: number;
  plunderCellShare: number;

  /**
   * 속국이 종주국에 바치는 순수입 비율.
   * 속국의 땅에는 종주국이 행정비를 내지 않는다. 그래서 제국이 커지는 길이
   * '직접 먹기'에서 '부리기'로 옮겨간다 — adminExponent 와 짝을 이루는 장치다.
   */
  tributeRateConquest: number;
  tributeRateVoluntary: number;
  /** 정복 속국의 충성도 자연 감소 (턴당) */
  loyaltyDecayConquest: number;
  /** 종주국이 압도적으로 강하면 붙는 충성 보정의 상한 */
  loyaltyPowerBonus: number;
  /** 승리 판정에서 속국 영토를 직할 영토의 몇 배로 치는가 */
  vassalInfluenceWeight: number;
  /** 약소국이 정의로운 나라에 자발적으로 복속할 기본 확률 */
  voluntarySubmitChance: number;
  /**
   * 협공 계수 — 전투 칸에 인접한 아군이 전력의 몇 할을 보태는가.
   *
   * 행동 횟수가 부대 수에 비례하는 탓에 쪼개는 쪽이 언제나 이득이었다.
   * 자가대전 학습이 massing 을 매번 0 으로 고른 이유가 이것이다.
   * 협공은 기동성을 뺏지 않으면서 전선을 이루고 뭉치는 것에 값을 준다.
   */
  flankSupport: number;
  /** 부대가 보는 거리 */
  visionRadiusUnit: number;
  /** 본진·완공 요새가 보는 거리 */
  visionRadiusHub: number;
  /**
   * 맵에서 중립 세력이 지키고 있는 칸의 비율.
   *
   * 이게 낮으면 빈 땅이 공짜라서, 걸어 들어가 칠하는 것이 싸우는 것보다
   * 언제나 이득이 된다. 자가대전 학습이 "전진 0, 집결 0"으로 수렴한 이유가
   * 이것이었다. 땅을 얻으려면 싸워야 전투력이 값어치를 갖는다.
   *
   * 한 칸 10명 상한이 들어온 뒤 다시 훑었다. 중립이 많을수록 초반 땅따먹기가
   * 느려져 판이 길어지고 시작 위치 운이 줄어든다.
   *   0.06  자리편차 10.0% · 74턴
   *   0.08  자리편차  6.7% · 84턴
   *   0.10  자리편차  4.0% · 99턴   ← 현재
   */
  neutralDensity: number;
  /** 급여가 밀려도 버티는 기본 턴 수 */
  graceTurnsBase: number;
  /** 정의 100 일 때 더 버티는 턴 수. 정의로운 군주는 외상으로도 따른다. */
  graceTurnsJustice: number;
  /**
   * 본진을 잃은 나라의 군대가 현지 조달로 버는 액수 (유닛당).
   * 이게 없으면 본진을 빼앗기는 순간 징병도 수입도 끊겨 회복할 길이 없다.
   * 공포가 높을수록 더 걷는다 — 약탈로 연명하는 군대다.
   */
  forageIncomePerUnit: number;
  /**
   * 한 턴에 내릴 수 있는 명령 수의 기본값. 0 이면 제한 없음 (옛 규칙).
   *
   * 왜 필요한가 — 지금 규칙에서는 병력을 쪼개는 쪽이 언제나 옳다. 행동 횟수가
   * 부대 수에 비례하기 때문이다. 10명 넷은 턴당 네 번 치고 40명 하나는 한 번
   * 친다. 그래서 자가대전 학습은 매번 '뭉치기 0'으로 수렴했고, 협공을 넣어도
   * 측면 지원을 넣어도 살아나지 않았다. 가중치 문제가 아니라 규칙 문제였다.
   *
   * 문명의 '죽음의 스택'을 뒤집은 '죽음의 양탄자'다. 역사에서 장군이 통제할
   * 수 있는 부대 수에 한계가 있었던 것이 집중의 이유였고, 그 한계를 되살린다.
   */
  commandBase: number;
  /** 거점(성·요새) 하나당 늘어나는 명령 수. 지휘 체계가 있어야 더 부린다. */
  commandPerHub: number;
  /**
   * 한 칸에 설 수 있는 최대 병력. 0 이면 제한 없음.
   *
   * 전투력이 병력 수에 정비례하니 40명 한 덩어리와 10명 넷은 싸움에서 같은
   * 힘이다. 그래서 합칠 이유가 없었고, massing 은 어떤 실험에서도 0 이
   * 최선이었다 — 자리 수를 바꿔도, 명령 수를 제한해도, 협공을 꺼도.
   *
   * 상한을 두면 '한 칸 = 한 부대'가 되고, 집중은 포개는 것이 아니라 옆으로
   * 늘어서는 것으로 표현된다. 이미 있는 협공과 맞물린다.
   */
  maxStackUnits: number;
  /** 턴마다 차오르는 행군력 */
  marchRegen: number;
  /**
   * 쌓아둘 수 있는 행군력의 상한.
   *
   * 한 턴 회복분보다 커야 한다. 안 그러면 회복분보다 비싼 이동은 영영 못 하고,
   * 큰 부대가 느린 게 아니라 아예 못 걷는 돌이 된다 — 실제로 그렇게 만들었다가
   * 공격 횟수가 30.8 에서 11.4 로 주저앉았다. 느린 것과 못 가는 것은 다르다.
   */
  marchMax: number;
  /** 한 칸 이동의 기본 비용 */
  marchBase: number;
  /** 병력 한 명당 더 드는 이동 비용 */
  marchPerUnit: number;
}

// 균형의 핵심은 세 가지다.
//  1. 시작 국가가 흑자여야 한다. 본진 수입 < 초기 병력 유지비면 모두가 개전 전에
//     파산해 병력이 이탈하고, 무방비가 된 본진을 먼저 확장한 나라가 주워간다.
//  2. 제국은 커질수록 유지가 가팔라져야 한다 (adminExponent).
//  3. 부는 뺏을 수 있어야 한다. 그래야 선두의 국고가 표적이 된다.
export const DEFAULT_ECONOMY: EconomyConfig = {
  cellIncome: 2,
  castleIncome: 25,
  fortIncome: 8,
  unitUpkeep: 0.8,
  recruitCost: 18,
  maxRecruitPerTurn: 1,
  fortCost: 120,
  startingGold: 150,
  adminRange: 2.5,
  adminCostPerCell: 0.4,
  adminExponent: 1.45,
  merchantCastleMultiplier: 2.0,
  merchantFortMultiplier: 1.5,
  merchantStake: 60,
  plunderCastleShare: 0.25,
  plunderFortShare: 0.1,
  plunderCellShare: 0.02,
  tributeRateConquest: 0.4,
  tributeRateVoluntary: 0.2,
  loyaltyDecayConquest: 1.2,
  loyaltyPowerBonus: 2.5,
  vassalInfluenceWeight: 0.5,
  voluntarySubmitChance: 0.12,
  flankSupport: 0.42,
  visionRadiusUnit: 2,
  visionRadiusHub: 3,
  neutralDensity: 0.1,
  graceTurnsBase: 2,
  graceTurnsJustice: 4,
  forageIncomePerUnit: 0.8,
  // 기본은 옛 규칙 그대로다. 켜고 끄며 재보려고 넣은 것이라 기본값으로 게임을
  // 바꾸지는 않는다.
  commandBase: 0,
  commandPerHub: 0,
  // 10명이면 평지에서도 두 턴에 한 칸이다 (30 + 8*10 = 110 > 100).
  // 3명은 54 라 매 턴 움직인다. 소부대는 빠르고 대군은 굼뜨다.
  maxStackUnits: 10,
  marchRegen: 100,
  marchMax: 300,
  marchBase: 30,
  marchPerUnit: 8,
};

export const NATION_PRESETS: Array<{ name: string; color: string; taxRate: number }> = [
  { name: '당신', color: '#3b82f6', taxRate: 0.15 },
  { name: '북부왕국', color: '#ef4444', taxRate: 0.18 },
  { name: '사막연맹', color: '#f59e0b', taxRate: 0.12 },
  { name: '산악부족', color: '#8b5cf6', taxRate: 0.25 },
  { name: '자유도시동맹', color: '#10b981', taxRate: 0.1 },
  { name: '남부공국', color: '#ec4899', taxRate: 0.2 },
];

export const NEUTRAL_COLOR: Record<NeutralKind, string> = {
  mercenary: '#a3a3a3',
  bandit: '#7c2d12',
};
