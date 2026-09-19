// 게임 상태 — 규칙의 유일한 출처
//
// 이전에는 GameScreen.tsx 의 턴 루프와 sim/engine.ts 가 각각 규칙을 들고 있어
// 갈라질 위험이 있었다. 이제 화면과 시뮬레이터가 모두 이 엔진을 호출한다.
//
// 설계상 중요한 두 가지
//  1. 국가 수는 N개다. 0|1 이분법을 쓰지 않는다.
//  2. 부대가 떠나도 칸의 소유권은 남는다. 소유권이 부대와 함께 사라지면
//     "영토 = 현재 부대 수"가 되어 경제도 전선도 성립하지 않는다.

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
  winner: number | null;
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
   *   1.38  확장형 22% · 공격형 39% · 균형 35% · 경제형 18%   ← 현재
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
  unitUpkeep: 0.7,
  recruitCost: 18,
  maxRecruitPerTurn: 3,
  fortCost: 120,
  startingGold: 150,
  adminRange: 2.5,
  adminCostPerCell: 0.4,
  adminExponent: 1.38,
  merchantCastleMultiplier: 2.0,
  merchantFortMultiplier: 1.5,
  merchantStake: 60,
  plunderCastleShare: 0.25,
  plunderFortShare: 0.1,
  plunderCellShare: 0.02,
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
