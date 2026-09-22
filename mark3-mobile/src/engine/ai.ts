// AI — 평가 함수 기반
//
// "지금 당장 싸움에서 이긴다고 게임을 이기는 게 아니다"는 문제는 평가 함수에 담긴다.
// 영토·병력·본진·전진 중 무엇을 얼마나 중요하게 보느냐가 그 나라의 전략이 된다.
//
// 이 파일의 상수들은 손으로 고른 것이고, sim/tuneAI.ts 의 자가대전 탐색이
// 더 나은 값을 찾으면 그걸로 갈아끼운다.

import { hexDistance } from '../utils/hexGrid';
import { RNG, terrainDefense } from '../services/combatSystem';
import {
  Cell,
  GameState,
  EconomyConfig,
  DEFAULT_ECONOMY,
  Merchant,
} from './types';
import {
  neighbors,
  cellPower,
  cellEfficiency,
  adminHubs,
  estimateWinProb,
  performAttack,
  moveStack,
  AttackOutcome,
  isHostile,
  startFort,
  recruit,
  commandLimit,
  defenseOptions,
  isFoeCell,
  blocOf,
  nationStats,
  canMoveTo,
  canAttackFrom,
  merchantDestinations,
  expectedTradeProfit,
  sendMerchant,
  plunderValue,
  computeLedger,
  resolveCastleLoss,
  flankingSupport,
} from './rules';
import { vassalize, vassalsOf } from './vassals';
import { issueOrder, punishVassal } from './orders';
import { isExplored, isVisible, knownCell, unexploredCount } from './vision';
import { FitProvenance } from './stamp';
import { DefenseChoice } from './defense';

/**
 * 사람이 수비할 차례라 AI 턴을 멈추고 물어봐야 할 때 내보내는 것.
 *
 * AI 는 규칙으로 즉시 정하지만 사람은 눌러야 정해진다. 엔진은 동기라서
 * 기다릴 수가 없으니, AI 턴 자체를 제너레이터로 만들어 그 자리에서 양보한다.
 */
export interface DefenseRequest {
  fromId: string;
  toId: string;
  options: DefenseChoice[];
  attackerUnits: number;
  defenderUnits: number;
  myPower: number;
  theirPower: number;
}

export interface AIWeights {
  territory: number;
  units: number;
  castleAssault: number;
  fort: number;
  /** 승산이 낮아도 공격하는 정도 (1 = 기대값대로, >1 = 무모, <1 = 신중) */
  aggression: number;
  massing: number;
  homeDefense: number;
  advance: number;
  expansion: number;
  terrain: number;
  /**
   * 상대의 부(富)를 표적 가치로 환산하는 정도.
   * 이 값이 크면 AI 는 "가장 강한 나라"가 아니라 "가장 부유한 나라"를 노린다.
   * 선두가 쌓은 국고가 곧 표적이 되므로, 눈덩이를 되돌리는 힘으로 작동한다.
   */
  wealth: number;
  /**
   * 압박받는 아군에게 달려가는 정도.
   * 이게 0 이면 부대들이 각자 점수만 보고 움직여, 옆에서 아군이 두들겨 맞아도
   * 모른 척한다. 실제 전쟁은 얻어맞는 곳으로 병력이 몰린다.
   */
  support: number;
  /**
   * 미탐색 지역을 밝히려는 성향.
   * 안개 속에서는 모르는 곳이 곧 위험이자 기회다. 정찰하지 않으면 적이
   * 어디에 얼마나 있는지도 모른 채 둬야 한다.
   */
  explore: number;
  /** 영토에 비례해 늘어나는 목표 병력의 기준값 */
  targetArmy: number;
}

/**
 * 골드를 평가 점수로 옮긴다. 제곱근을 쓰는 이유는 국고가 수만 단위로 커져도
 * 다른 항을 완전히 지워버리지 않게 하기 위해서다. 그래도 기본값에서는
 * 영토·병력보다 앞선다 — 우선순위는 돈, 그다음이 국력이다.
 */
export function wealthValue(gold: number, w: AIWeights): number {
  return w.wealth * Math.sqrt(Math.max(0, gold));
}

export const BASE_WEIGHTS: AIWeights = {
  territory: 1,
  units: 1.2,
  castleAssault: 12,
  fort: 2,
  aggression: 1,
  // 0.6 과 1 은 내가 "균형이라면 이쯤"이라고 찍은 값이었다. 재보니 둘 다
  // 해롭다 — 균형이 3.2% → 8.0% → 17.2% 로 올랐다(뭉치기 0, 그다음 지원 0).
  //
  // 뭉치기: 턴을 써서 합치는 것은 한 칸 10명 상한이 생긴 뒤에도 손해다.
  //   집중은 포개는 게 아니라 옆에 늘어서는 것으로 표현된다(협공).
  // 지원: 압박받는 아군 쪽으로 끌려가면 전선이 한 점으로 빨려들어, 정작
  //   따야 할 땅과 쳐야 할 성을 놓친다. 구하러 가는 값은 이미 태세 판단에 있다.
  massing: 0,
  homeDefense: 1,
  advance: 1,
  expansion: 1,
  terrain: 0.5,
  wealth: 1,
  support: 0,
  explore: 1,
  targetArmy: 18,
};

export const PERSONALITIES: Record<string, AIWeights> = {
  균형: { ...BASE_WEIGHTS },
  /*
    공격형은 '정복을 노린다' 이지 '던진다' 가 아니다.

    aggression 1.6 이 하던 일이 둘이었다. 태세 문턱을 0.55/1.6 = 0.34 로
    낮춰 적 전력의 3분의 1 만 있어도 밀어붙이게 했고, 승산도 1.6배로
    부풀려 보게 했다. 40% 싸움을 64% 로 착각하고 덤빈다는 뜻이다.
    그래서 끝날 때 병력이 6.3명이었다 — 다른 성격은 30명 안팎이다.
    정복하는 게 아니라 흘리고 있었고, 어느 설정에서도 승률이 3~9% 로
    늘 바닥이었다.

    승산을 그대로 보게 하고(1.0), 칠 군대를 미리 모으게 했다(18 → 26).
    고정 상대 넷과 설정당 350판:

            승률                끝났을때 병력   공격
      11x11  7.1% [5~10] → 16.0% [13~20]   6.3 → 12.7   21.7 → 22.0
      21x21  5.4% [4~8]  →  6.9% [5~10]    8.7 → 12.9   37.7 → 36.6

    11x11 에서는 구간이 안 겹치고 21x21 에서는 겹치지만 방향이 같다.
    공격 횟수는 그대로인데 병력이 두 배 남는다 — 같은 만큼 싸우되 이길
    싸움을 고른다는 뜻이다. advance 2.2 는 그대로 둔다. 결연히 진군하는
    것은 공격형의 성격이고, 무모한 것과는 다르다.
  */
  공격형: { ...BASE_WEIGHTS, aggression: 1.0, advance: 2.2, homeDefense: 0.3, castleAssault: 18, targetArmy: 26 },
  // 수비형은 '아무것도 안 하기'가 아니라 '적당히 넓히고 요새로 굳히기'다.
  // advance 0.3 / expansion 1.0 으로 두면 1~2칸만 붙들고 있다가 남의 속국이 된다.
  수비형: {
    ...BASE_WEIGHTS,
    aggression: 0.5,
    homeDefense: 1.8,
    advance: 0.4,
    fort: 6,
    terrain: 1.2,
    expansion: 1.5,
    territory: 1.4,
    targetArmy: 24,
  },
  // 기본값에서 해로운 항(뭉치기·지원)을 걷어내자 그 이득을 확장형이 가장 크게
  // 가져가 51% 로 독주했다. 행정비 지수로 누르면 판 전체가 늘어지니(141턴,
  // 턴제한 20.7%) 확장형만 직접 낮춘다.
  확장형: { ...BASE_WEIGHTS, expansion: 2.0, territory: 1.8, aggression: 0.8, advance: 0.7 },
  /*
    한 칸 10명 상한이 생긴 뒤로 "집중"의 뜻이 달라졌다. 포개는 것이 아니라
    정원을 채운 부대로 밀집해서 미는 것이다. 옛 정의(massing 2.5)는 그냥 턴
    낭비라 4.3% 였고, 0.4 로 줄여 9.5% 가 됐다.

    그런데 그 뒤로 4.7% 까지 내려왔다. 정의가 틀려서가 아니라 그 밑에서
    규칙이 바뀌었다 — 거리 환산, 행정비, 그리고 땅 모으기 승리를 없앤 것.

    다시 재보니 뭉치기가 범인이었다(고정 상대 넷과 설정당 250판).

              승률                    병력          영토
      11x11   5.2% [3~9] → 16.0% [12~21]   8.4 → 13.8   8.1 → 12.4
      21x21   3.2% [2~6] →  8.0% [5~12]    9.1 → 12.2  23.0 → 25.2

    BASE_WEIGHTS 는 이미 massing 0 이다 — "뭉치는 것은 한 칸 10명 상한이
    생긴 뒤에도 손해" 라고 재놓고서, 정작 집중형만 0.4 를 들고 있었다.
    주석에는 "포개는 것이 아니다" 라고 써두고 코드는 포개고 있었던 셈이다.

    이제 집중은 targetArmy 28 과 units 1.8 로 나타난다 — 큰 군대를 모아
    아껴 쓰며 민다. 한 칸에 포개는 것이 아니라.
  */
  집중형: {
    ...BASE_WEIGHTS,
    units: 1.8,
    aggression: 1.0,
    advance: 1.8,
    expansion: 1.4,
    territory: 1.4,
    targetArmy: 28,
  },
  경제형: { ...BASE_WEIGHTS, aggression: 0.4, expansion: 1.6, targetArmy: 30, homeDefense: 1.6 },
};

/** 토너먼트에 학습 결과도 참가시킨다 (아래에서 PERSONALITIES 에 더한다) */

/**
 * sim/tuneAI.ts 의 자가대전이 수렴한 값 (손으로 만든 성격 4종 상대 61.7%).
 *
 * 약탈·속국·초선형 행정비가 들어온 뒤 다시 학습한 결과다. 이전 값과 비교하면
 * 무엇이 바뀌었는지가 그대로 보인다.
 *   advance  0.47 → 1.42  본진을 치면 속국이 되니 전진할 이유가 생겼다
 *   massing  0.14 → 0.61  본진을 실제로 떨어뜨리려면 병력을 모아야 한다
 *   castleAssault 15.0 → 18.4  본진의 값이 올랐다
 *   wealth   (신규) 0.42  기본값 1.0 보다 낮게 골랐다 — 돈을 쫓는 것은
 *                          생각만큼 이득이 아니라는 뜻이다
 *
 * advance 를 1.5 로 올려봤다가 되돌렸다. 한 나라만 올리면 왕복이 24.9% →
 * 17.7% 로 줄어 좋아 보였는데, 다섯 나라가 모두 그 값이면 서로 상대 본진만
 * 보고 행군하느라 지나쳐 버린다 — 같은 AI 5명으로 재니 90턴·공격 85회가
 * 174턴·공격 17회가 됐다. 한 가지 조건에서 재고 일반화하면 이렇게 된다.
 */
export const LEARNED_WEIGHTS: AIWeights = {
  territory: 2.59,
  units: 1.33,
  castleAssault: 16.05,
  fort: 0.0,
  aggression: 0.66,
  massing: 0.0,
  homeDefense: 0.38,
  advance: 0.24,
  expansion: 2.27,
  terrain: 0.91,
  wealth: 0.82,
  support: 0.0,
  explore: 0.79,
  targetArmy: 20.23,
};

PERSONALITIES['학습형'] = LEARNED_WEIGHTS;
/**
 * 이 값이 어느 규칙에서 나왔는가.
 *
 * 가중치는 규칙의 함수다. 행정비 식을 바꾸고 거리 기준을 바꿨으면 예전 값은
 * 옛 게임의 정답이다. 그런데 파일만 봐서는 그걸 알 수 없어서, 불안한 마음에
 * 규칙을 조금만 건드려도 다시 학습을 돌리게 된다 — 그게 며칠을 먹는다.
 *
 * 그래서 도장을 같이 적어둔다(stamp.ts). 하네스가 지금 규칙과 견줘 다르면
 * 한 줄로 알려주고, 다시 돌릴지는 그때 정한다. 적어도 모르고 지나치지는 않는다.
 */
export const LEARNED_PROVENANCE: FitProvenance = {
  stamp: '0be0f9d6',
  fittedAt: '2026-09-18',
  sizes: [11],
  note: '약탈·속국·초선형 행정비까지 반영한 자가대전. 그 뒤 거리 환산·승리 문턱·행정비 식이 바뀌었다.',
};


/**
 * 판 크기에 따라 가중치를 바꿔봤다가 되돌렸다. 기록해 둔다 — 안 그러면 또 한다.
 *
 * 이 값들은 전부 11x11 에서 뽑았는데 사람은 21x21 로 논다. 그 판에서 정식
 * 평가를 돌리니 균형이 뒤집혀 있었다(수비형 49.2%, 경제형 48.2%, 학습형 11.8%).
 * 그래서 큰 판에서 가중치를 하나씩 밀어봤다(sim/scale.ts, 설정당 70판).
 *
 *   aggression  0.66 → 0.5 → 0.4 → 0.3   8.6% → 14.3% → 18.6% → 24.3%
 *   homeDefense 0.38 → 1.0 → 1.6 → 2.2   8.6% → 14.3% → 15.7% → 15.7%
 *   advance     0.24 → 1.5 → 2.2          8.6% → 14.3% → 18.6%
 *
 * 깨끗한 단조 상승이라 그대로 반지름에 맞춰 섞었다. 그랬더니 21x21 이
 * 80턴·턴제한 0%·공격 59회에서 184턴·58%·10회가 됐다.
 *
 * 스윕은 "넷은 공격적인데 나 혼자 신중하면?"을 잰 것이다. 그건 이 판에 대한
 * 대응 전략이지 더 나은 수가 아니다. 다섯이 모두 신중해지면 아무도 안 싸운다.
 * 두 자리(학습형)에만 적용해도 152턴·25% 로 여전히 나빴다.
 *
 *   모두 적용   184턴 · 턴제한 58% · 공격 10회
 *   학습형만    152턴 · 턴제한 25% · 공격 48회
 *   안 건드림     80턴 · 턴제한  0% · 공격 59회   ← 지금
 *
 * advance 1.5 때와 똑같은 실수다(아래 주석). 한 나라만 바꿔 재고 전부에
 * 적용하면 이렇게 된다. 가중치를 sim/scale.ts 로 고를 때는 반드시
 * sim/boards.ts 로 판 전체가 어떻게 되는지 같이 봐야 한다.
 *
 * 21x21 에 남은 진짜 문제는 '맴돎'이 아니라(그건 scoutTarget 이 고쳤다)
 * 전략 균형이다 — 넓은 판에서는 웅크리는 쪽이 이긴다. 그건 가중치가 아니라
 * 규칙의 문제다.
 */

/**
 * 태세를 가르는 전력비 문턱. 시뮬레이터에서 훑어보려고 밖에 둔다.
 *
 * 이 값은 거리 계산에 민감하다. hexGrid 의 좌표계 버그를 고치자 반경 2 안에
 * 보이는 적이 늘어, 옛 문턱에서는 모두가 열세로 판정되어 눈치만 보다 판이
 * 멎었다(턴 제한 도달 69.7%).
 */
//   1.15 / 0.60   턴제한 41% · 고르기 -8.55   (버그 있던 거리에 맞춰둔 값)
//   0.63 / 0.33   턴제한 22% · 고르기 -6.77
//   0.55 / 0.29                                ← 현재
//   0.46 / 0.24   턴제한 14% · 고르기 -7.59
export const POSTURE = { pressAt: 0.55, withdrawAt: 0.29 };

/**
 * 명령이 수를 끄는 힘과, 명령을 붙들고 있는 최대 턴 수.
 *
 * 부대에 목적지를 쥐여주고 도착할 때까지 유지한다. 매 턴 백지에서 다시
 * 고르면 두 칸 점수가 비슷할 때 끝없이 오간다.
 */
//   끌힘  0   왕복 26.6% · 50턴후 34.1% · 60턴 · 공격 60
//   끌힘  4   왕복 17.1% · 50턴후 15.3% · 40턴 · 공격 39  (판이 짧아진다)
//   끌힘  7   왕복 18.8% · 50턴후 19.2% · 53턴 · 공격 63  ← 현재
//   끌힘 12   왕복 20.5% · 50턴후 25.0% · 43턴 · 공격 45
export const ORDER = { pull: 7, maxAge: 14 };

/**
 * 이 부대의 명령을 손본다 — 다 왔거나, 오래됐거나, 목적지가 뜻을 잃었으면 새로 받는다.
 *
 * 적이 코앞에 있으면 명령을 지운다. 눈앞의 싸움이 먼 목적지보다 급하다.
 */
function refreshOrder(ctx: Ctx, c: Cell, enemyAdjacent: number): Cell | null {
  if (enemyAdjacent > 0) {
    c.order = undefined;
    return null;
  }

  // 종주국이 부른 자리가 있으면 그게 우선이다
  if (ctx.rally) {
    if (!c.order || c.order.destId !== ctx.rally.id) {
      c.order = { destId: ctx.rally.id, age: 0 };
    }
  } else if (ctx.token && ctx.token.stackId === c.id) {
    // 생색내기로 뽑힌 부대 하나만 간다. 나머지는 제 할 일을 한다.
    if (!c.order || c.order.destId !== ctx.token.dest.id) {
      c.order = { destId: ctx.token.dest.id, age: 0 };
    }
  }

  let dest = c.order ? ctx.state.cells.find((x) => x.id === c.order!.destId) ?? null : null;
  const arrived = dest ? hexDistance(c.row, c.col, dest.row, dest.col) <= 1 : false;
  // 한 칸에 한 턴이니 길이가 곧 시간이다. 판이 두 배면 수명도 두 배여야
  // 한다 — 안 그러면 도착하기 전에 명령이 늙어 죽고 부대가 제자리를 맴돈다.
  const stale = c.order ? c.order.age >= ORDER.maxAge * ctx.scale : false;
  // 이미 내 땅이 된 곳으로 계속 갈 이유는 없다
  const taken = dest ? dest.owner === ctx.me && !dest.neutral : false;

  if (!dest || arrived || stale || taken) {
    dest = ctx.target;
    c.order = dest ? { destId: dest.id, age: 0 } : undefined;
  } else if (c.order) {
    c.order.age++;
  }
  return dest;
}

export interface Ctx {
  state: GameState;
  me: number;
  w: AIWeights;
  homes: Cell[];
  enemyHomes: Cell[];
  target: Cell | null;
  homeThreat: number;
  hubs: Cell[];
  eco: EconomyConfig;
  /** 지금 압박받고 있는 내 진지들. 가까운 부대를 끌어당긴다. */
  distress: Array<{ cell: Cell; severity: number }>;
  /** 11x11 기준으로 거리를 환산하는 자 (boardScale) */
  scale: number;
  /** 종주국이 부른 자리. 명령을 받들 때만 채워진다. */
  rally: Cell | null;
  /**
   * 치는 시늉. 태업하는 속국이 눈가림으로 내보내는 한 부대다.
   *
   * 이게 있어야 '듣는 척'이 종주국 눈에 이행으로 보인다. 아무것도 안 하면
   * 어차피 들통나니, 실제 속국이 하는 일은 작은 병력을 생색내듯 보내는 것이다.
   */
  token: { stackId: string; dest: Cell } | null;
}

/**
 * 압박받는 아군 진지를 찾는다.
 *
 * 부대가 각자 점수만 보고 움직이면 옆에서 아군이 두들겨 맞아도 모른 척한다.
 * 실제 전쟁은 그렇지 않다 — 얻어맞는 곳으로 병력이 몰린다.
 * severity 는 "얼마나 부족한가"다. 혼자 막을 수 있으면 부르지 않는다.
 */
function findDistress(
  state: GameState,
  me: number
): Array<{ cell: Cell; severity: number }> {
  const out: Array<{ cell: Cell; severity: number }> = [];
  for (const c of state.cells) {
    if (c.owner !== me || c.units <= 0 || c.neutral) continue;
    let hostile = 0;
    for (const n of neighbors(state, c)) {
      if (isFoeCell(state, me, n)) hostile += cellPower(n, false);
    }
    if (hostile <= 0) continue;
    const mine = cellPower(c, true);
    const shortfall = hostile - mine;
    if (shortfall <= 0) continue; // 혼자 감당되면 부르지 않는다
    // 본진과 요새는 잃으면 타격이 크므로 더 크게 부른다
    const weight = c.castle ? 2.5 : c.fortStage === 4 ? 1.8 : 1;
    // 위급함 = 모자란 전력 + 거기서 잃게 될 병력. 둘 다 걸려 있다.
    out.push({ cell: c, severity: (shortfall + c.units) * weight });
  }
  return out;
}

/**
 * 판을 11x11 기준으로 환산하는 자.
 *
 * 평가식 곳곳에 거리와 턴이 절대값으로 박혀 있었다. 그러면 판 크기가 바뀔
 * 때마다 가중치를 새로 뽑아야 하는데, 그건 틀린 틀이다. 문턱은 같고 재는
 * 자가 달라져야 한다 — "열네 칸"이 아니라 "판의 3분의 2".
 *
 * 가장 나빴던 곳은 전진 항의 14 다. 11x11 은 끝에서 끝이 10칸이라 어떤
 * 목표든 걸리지만, 21x21 에서는 14칸 넘게 떨어진 목표에 전진 유인이 정확히
 * 0 이 된다. 부대가 본진에서 평균 3.7칸을 못 벗어나고 최대 진출이 15칸에서
 * 멎던 것이 이 숫자였다.
 *
 * 반지름 5(11x11)에서 1 이므로 그 판의 균형은 한 톨도 안 바뀐다.
 */
export function boardScale(state: GameState): number {
  return Math.max(0.5, Math.floor(Math.min(state.rows, state.cols) / 2) / 5);
}

function minDist(c: Cell, targets: Cell[]): number {
  if (targets.length === 0) return 99;
  let best = 99;
  for (const t of targets) {
    const d = hexDistance(c.row, c.col, t.row, t.col);
    if (d < best) best = d;
  }
  return best;
}

/** 어떤 칸 주변(반경 2)의 전력 합 — "저기가 비었나"를 판단하는 눈 */
function localStrength(state: GameState, center: Cell, owner: number | null): number {
  let total = 0;
  for (const c of state.cells) {
    if (c.units <= 0) continue;
    if (c.owner !== owner) continue;
    const d = hexDistance(center.row, center.col, c.row, c.col);
    if (d > 2) continue;
    total += cellPower(c, false) * (d === 0 ? 1 : d === 1 ? 0.7 : 0.4);
  }
  return total;
}

/**
 * 적 본진 중 '약하고 가까운' 곳을 이번 원정의 목표로 고른다.
 *
 * 안개 때문에 아직 못 본 본진은 후보가 아니다. 어디 있는지도 모르는 곳을
 * 향해 진군할 수는 없다. 그래서 초반에는 정찰이 곧 전략이 된다.
 */
/**
 * 아무 적의 본진도 못 봤을 때 어디로 갈 것인가.
 *
 * pickTarget 이 null 을 주면 refreshOrder 가 부대의 목적지를 지운다. 그러면
 * 부대는 매 턴 눈앞의 점수만 보고 한 칸씩 움직이고, 그게 '맴도는' 것이다.
 * 11x11 에서는 이게 안 보였다 — 판이 작아 6턴이면 적 본진이 시야에 들어오니까.
 * 21x21 에서는 절반이 넘는 턴을 목표 없이 보내고, 다섯 나라 중 하나는 끝까지
 * 적을 한 번도 못 찾는다. 부대가 본진에서 평균 3.7칸을 못 벗어난다.
 *
 * 그래서 목표가 없으면 '모르는 곳'을 목표로 삼는다. 가장 가까운 변두리 중
 * 그 너머에 모르는 칸이 많은 쪽. 거기 닿으면 시야가 밀려나고 다음 변두리가
 * 생기므로, 적을 찾을 때까지 꾸준히 바깥으로 나간다.
 */
function scoutTarget(
  ctx: Omit<Ctx, 'target' | 'homeThreat' | 'distress' | 'rally' | 'token'>
): Cell | null {
  let best: Cell | null = null;
  let bestScore = -Infinity;
  for (const c of ctx.state.cells) {
    if (c.offMap) continue;
    if (!isExplored(ctx.state, ctx.me, c)) continue;
    // 모르는 곳과 맞닿은 칸만 후보다. 이미 다 아는 한복판은 갈 이유가 없다.
    let unknown = 0;
    for (const n of neighbors(ctx.state, c)) {
      if (!isExplored(ctx.state, ctx.me, n)) unknown++;
    }
    if (unknown === 0) continue;
    // 멀수록 손해지만, 모르는 게 많이 걸린 쪽이면 멀어도 간다
    const score = unknown * 2 - (minDist(c, ctx.homes) / ctx.scale) * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function pickTarget(
  ctx: Omit<Ctx, 'target' | 'homeThreat' | 'distress' | 'rally' | 'token'>
): Cell | null {
  let best: Cell | null = null;
  let bestScore = -Infinity;
  for (const h of ctx.enemyHomes) {
    if (!isExplored(ctx.state, ctx.me, h)) continue;
    // 지금 안 보이면 마지막으로 본 기억으로 판단한다
    const defense = isVisible(ctx.state, ctx.me, h)
      ? localStrength(ctx.state, h, h.owner)
      : (knownCell(ctx.state, ctx.me, h)?.units ?? 0) * 1.2;
    const dist = minDist(h, ctx.homes);
    // 부유한 나라가 우선 표적이다. 국고를 쌓아둔 선두가 저절로 매를 번다.
    const gold = h.owner !== null ? ctx.state.nations[h.owner].gold : 0;
    const prize = ctx.w.castleAssault + wealthValue(gold, ctx.w);
    // 헐거운 본진일수록 크게 끌린다. 본진을 잃은 나라는 징병도 수입도 끊겨
    // 들판의 군대가 저절로 스러지므로, 지금 비어 있다면 그게 곧 기회다.
    const score = prize / (1 + defense * 0.7) - (dist / ctx.scale) * 0.6;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  // 아직 아무도 못 찾았으면 찾으러 간다
  return best ?? scoutTarget(ctx);
}

function computeHomeThreat(state: GameState, me: number, homes: Cell[]): number {
  let threat = 0;
  for (const h of homes) {
    let enemy = 0;
    for (const c of state.cells) {
      if (c.units <= 0 || c.owner === me) continue;
      const d = hexDistance(h.row, h.col, c.row, c.col);
      if (d === 0 || d > 3) continue;
      enemy += cellPower(c, false) / d;
    }
    threat += Math.max(0, enemy - localStrength(state, h, me) * 0.6);
  }
  return threat;
}

function positionValue(ctx: Ctx, c: Cell): number {
  const w = ctx.w;
  let v = 0;
  v += w.terrain * (1 + (c.fortStage === 4 ? 0.3 : 0));

  // 본진이 위협받으면 집으로 당기는 힘이 커진다.
  // 상한이 중요하다. 여기를 크게 열어두면 전진 기울기를 압도해
  // 전원이 집에 눌러앉고 모든 나라가 이동 0회로 게임이 멎는다.
  const homePull = w.homeDefense * (1 + Math.min(0.8, ctx.homeThreat / 40));
  v += homePull * (2 / (1 + minDist(c, ctx.homes) / ctx.scale));

  // 전진은 선형 기울기여야 한다. 5/(1+거리) 형태는 원거리에서 평평해져
  // (거리 9→0.50, 8→0.56) 멀리 있는 부대가 움직일 이유를 잃는다.
  // 그리고 '가장 가까운' 적이 아니라 '이번 원정 목표'를 향해 당겨야 한다.
  const dist = ctx.target
    ? hexDistance(c.row, c.col, ctx.target.row, ctx.target.col)
    : minDist(c, ctx.enemyHomes);
  // 14 는 '11x11 한 판 길이만큼'이라는 뜻이다. 칸으로 두면 큰 판에서
  // 멀리 있는 목표가 전진 유인을 통째로 잃는다.
  v += w.advance * Math.max(0, 14 - dist / ctx.scale) * 1.0;

  // 압박받는 아군 쪽으로 끌린다. 가까울수록 세게 당긴다.
  //
  // 크기가 중요하다. 전진 항은 거리 1에서 advance×13 (기본값 기준 약 18)에
  // 달하는데, 지원 항이 한 자릿수면 사실상 무시되어 부대들이 끝까지
  // 따로 논다. 위급한 아군 옆에 있을 때는 원정보다 우선해야 한다.
  for (const d of ctx.distress) {
    if (d.cell.id === c.id) continue;
    const dd = hexDistance(c.row, c.col, d.cell.row, d.cell.col);
    if (dd > 5) continue; // 너무 멀면 가봐야 늦는다
    v += w.support * (d.severity * 2.5) / (1 + dd * 1.3);
  }
  return v;
}

/** 위험은 '내 군대의 크기'가 아니라 '상대적 열세'다. 압도적이면 0이어야 한다. */
function riskAt(ctx: Ctx, c: Cell, myUnits: number, myPower: number): number {
  let hostile = 0;
  for (const n of neighbors(ctx.state, c)) {
    if (isFoeCell(ctx.state, ctx.me, n)) hostile += cellPower(n, false);
  }
  if (hostile <= 0) return 0;
  const ratio = hostile / Math.max(0.001, myPower);
  const exposure = Math.max(0, Math.min(1.5, ratio - 0.6));
  return ctx.w.units * myUnits * 0.12 * exposure;
}

export type Action =
  | { kind: 'stay'; score: number }
  | { kind: 'move'; score: number; target: Cell }
  | { kind: 'attack'; score: number; target: Cell };

/**
 * 부대의 태세.
 *   press    수가 앞선다 — 적극적으로 들이댄다
 *   hold     비슷하거나 원군이 오는 중 — 자리를 지키며 기다린다
 *   withdraw 수가 크게 밀리고 도와줄 이가 없다 — 지연하며 뒤로 뺀다
 *
 * 이게 없으면 부대는 매 턴 점수가 가장 높은 행동을 그냥 실행한다.
 * 기다린다는 개념도, 물러난다는 개념도 없어서 열세인 부대가 그대로 갈려나간다.
 */
type Posture = 'press' | 'even' | 'hold' | 'withdraw';

interface Assessment {
  posture: Posture;
  /** 주변 적 전력 (거리로 감쇠) */
  enemyNear: number;
  /** 곧 닿을 수 있는 아군 전력 */
  helpNear: number;
  ratio: number;
}

function assessPosture(ctx: Ctx, c: Cell, myPower: number): Assessment {
  let enemyNear = 0;
  let helpNear = 0;

  for (const x of ctx.state.cells) {
    if (x.units <= 0 || x.id === c.id) continue;
    const d = hexDistance(c.row, c.col, x.row, x.col);
    if (d > 2) continue;
    const hostile = isFoeCell(ctx.state, ctx.me, x);
    if (hostile) {
      // 당장 맞붙을 적만 센다. 반경을 넓히고 완만하게 감쇠시키면 주변 적이
      // 전부 합산되어 거의 언제나 열세로 판정되고, 모두가 눈치만 보다 게임이 멎는다.
      enemyNear += cellPower(x, false) / (d * d);
    } else if (x.owner === ctx.me && !x.neutral) {
      helpNear += cellPower(x, false) / (1 + d);
    }
  }

  if (enemyNear <= 0) return { posture: 'even', enemyNear, helpNear, ratio: 99 };

  const ratio = myPower / enemyNear;
  const ratioWithHelp = (myPower + helpNear) / enemyNear;

  // 중립 구간이 있어야 한다. 애매한 상황까지 '대기'로 묶으면 아무도 안 싸운다.
  //
  // 문턱은 성격을 따른다. 태세를 모두에게 똑같이 적용하면 aggression 가중치를
  // 덮어써서 공격형조차 눈치를 보게 된다. 대담한 나라는 더 낮은 전력비에서도
  // 밀어붙이고, 신중한 나라는 더 확실할 때만 움직인다.
  const boldness = Math.max(0.4, ctx.w.aggression);
  const pressAt = POSTURE.pressAt / boldness;
  const withdrawAt = POSTURE.withdrawAt / boldness;

  let posture: Posture;
  if (ratio >= pressAt) posture = 'press';
  else if (ratio <= withdrawAt) posture = ratioWithHelp >= 1.0 ? 'hold' : 'withdraw';
  else posture = 'even';

  return { posture, enemyNear, helpNear, ratio };
}

/** 이 칸이 후퇴지로 얼마나 좋은가 — 적에게서 멀고, 방어가 되고, 본거지에 가까울수록 */
function retreatValue(ctx: Ctx, n: Cell): number {
  let pressure = 0;
  for (const x of neighbors(ctx.state, n)) {
    if (isFoeCell(ctx.state, ctx.me, x)) pressure += cellPower(x, false);
  }
  const terrain = terrainDefense(n.terrain) + (n.fortStage === 4 ? 0.4 : 0) + (n.castle ? 0.3 : 0);
  const homeward = 6 / (1 + minDist(n, ctx.hubs.length > 0 ? ctx.hubs : ctx.homes) / ctx.scale);
  return terrain * 4 + homeward - pressure * 0.9;
}

function scoreActions(ctx: Ctx, c: Cell): Action[] {
  const w = ctx.w;
  const myPower = cellPower(c, false);
  const actions: Action[] = [];

  // 목표에서 멀리 떨어진 채 가만히 있는 것은 그 자체로 손해다.
  // 이 항이 없으면 덧셈식 점수에 국소 최적점이 생겨, 대군이 적을 앞에 두고도
  // "제자리"를 최선으로 고르며 게임이 영구히 멎는다.
  const distToTarget = ctx.target ? hexDistance(c.row, c.col, ctx.target.row, ctx.target.col) : 0;
  const idlePenalty = distToTarget > 1 ? w.advance * 1.5 : 0;

  // 지켜야 할 자리는 비우지 않는다.
  // 적이 붙어 있는 본진·요새를 두고 원정을 나가면 그 사이에 잃는다.
  let enemyAdjacent = 0;
  for (const n of neighbors(ctx.state, c)) {
    if (isFoeCell(ctx.state, ctx.me, n)) enemyAdjacent += cellPower(n, false);
  }
  const holdingCritical = (c.castle || c.fortStage === 4) && enemyAdjacent > 0;
  const holdBonus = holdingCritical ? w.homeDefense * 12 + enemyAdjacent * 0.8 : 0;

  // 전력비에 따라 태세를 정한다
  const a = assessPosture(ctx, c, myPower);

  // 받아둔 명령. 이쪽으로 가는 수에 힘을 실어준다.
  const orderDest = refreshOrder(ctx, c, enemyAdjacent);
  const orderDist = orderDest ? hexDistance(c.row, c.col, orderDest.row, orderDest.col) : 0;

  // 원군을 기다릴 때는 좋은 자리에서 버티는 것 자체가 값어치가 있다.
  // 물러날 때도 제자리에서 한 번 더 막아보는 선택지는 남겨둔다.
  // 대기 보너스는 '정말로 밀릴 때'만. 애매할 때까지 주면 전원이 눌러앉는다.
  const waitBonus =
    a.posture === 'hold'
      ? (terrainDefense(c.terrain) - 0.9) * 6 + Math.min(6, a.helpNear * 0.3)
      : 0;

  actions.push({
    kind: 'stay',
    score:
      positionValue(ctx, c) -
      (a.posture === 'withdraw' || a.posture === 'hold' ? idlePenalty * 0.4 : idlePenalty) +
      holdBonus +
      waitBonus +
      (c.exhaustion > 50 ? w.units * c.units * 0.2 : 0),
  });

  for (const n of neighbors(ctx.state, c)) {
    // 방금 떠나온 칸으로 되돌아가는 수에는 벌점. 기억이 없으면 두 칸 점수가
    // 비슷할 때 끝없이 오간다 — 후반 이동의 3분의 2가 그런 왕복이었다.
    // 공격은 예외다. 물러났다가 다시 치는 것은 왕복이 아니라 전술이다.
    const backtrack = n.id === c.lastFrom && !isHostile(c, n, ctx.state) ? w.advance * 3 + 4 : 0;
    // 명령받은 곳으로 가까워지면 힘을 싣고, 멀어지면 뺀다
    const toward =
      orderDest && a.posture !== 'withdraw'
        ? (orderDist - hexDistance(n.row, n.col, orderDest.row, orderDest.col)) * ORDER.pull
        : 0;

    if (isHostile(c, n, ctx.state)) {
      // 행군력이 모자라면 칠 수 없다. 후보에조차 올리지 않는다.
      if (!canAttackFrom(c, n, ctx.eco)) continue;
      // 협공을 셈에 넣는다. 규칙만 바뀌고 AI 가 모르면 행동은 그대로다.
      const myFlank = flankingSupport(ctx.state, n, c, ctx.eco);
      const theirFlank = flankingSupport(ctx.state, n, n, ctx.eco);
      const p = estimateWinProb(myPower + myFlank, cellPower(n, true) + theirFlank);
      // 적 병력을 없애는 것이 이기는 주된 방법이다. 이 항이 작으면
      // AI 가 평화롭게 빈 땅만 먹고 전쟁을 아예 하지 않는다.
      // 약탈 기대액이 먼저다. 땅과 병력은 그다음.
      const loot = plunderValue(ctx.state, n, ctx.eco);
      // 본진은 헐거울 때 바로 무너뜨려야 한다. 전력이 앞설수록 값이 커진다 —
      // 나중에 고쳐 앉은 본진을 치는 것보다 지금 비어 있을 때 치는 것이 싸다.
      const edge = n.castle
        ? Math.min(1, Math.max(0, (myPower + myFlank) / Math.max(0.5, cellPower(n, true) + theirFlank) - 1))
        : 0;
      const prize =
        wealthValue(loot, w) +
        w.territory +
        w.units * n.units * 1.4 +
        (n.castle ? w.castleAssault * (1 + edge) : 0) +
        (n.fortStage === 4 ? w.fort : 0) +
        positionValue(ctx, n);
      // 비용은 '내 군대 전체'가 아니라 '예상 사상자'다.
      const cost = w.units * c.units * 0.35;
      const pAdj = Math.min(1, p * w.aggression);
      // 수가 앞서면 적극적으로, 밀리면 소극적으로. 물러나는 중엔 웬만하면 안 친다.
      const postureMul =
        a.posture === 'press'
          ? 1.35
          : a.posture === 'even'
          ? 1.0
          : a.posture === 'hold'
          ? 0.6
          : 0.25;
      actions.push({
        kind: 'attack',
        score: (pAdj * prize - (1 - pAdj) * cost) * postureMul,
        target: n,
      });
      continue;
    }

    if (n.units > 0 && n.owner === ctx.me && !n.neutral) {
      // 상한을 넘는 합류와 행군력이 없는 이동은 수가 아니다
      if (!canMoveTo(c, n, ctx.eco)) continue;
      // 합류 가치는 병력 수에만 비례하면 안 된다. 그러면 1~2명짜리 부대가
      // 합칠 이유를 못 찾아 자잘하게 흩어진 채로 각자 싸우다 각개격파당한다.
      // 주변 적 앞에서 내가 약할수록 뭉쳐야 한다.
      const weakness = enemyAdjacent / Math.max(1, myPower);
      const urge = 1 + Math.min(2.5, weakness * 1.5);
      const merged = c.units + n.units;
      actions.push({
        kind: 'move',
        score:
          w.massing * Math.min(c.units, n.units) * urge +
          // 합쳐서 의미 있는 덩어리가 되는지도 본다
          w.massing * Math.min(6, merged) * 0.8 +
          positionValue(ctx, n) -
          w.territory -
          backtrack +
          toward,
        target: n,
      });
      continue;
    }

    if (n.units === 0) {
      if (!canMoveTo(c, n, ctx.eco)) continue;

      // 거점에서 먼 땅은 행정 비용만 나가는 순손실이다. 효율을 반영하지 않으면
      // AI 가 돈도 안 되는 변두리를 끝없이 칠한다.
      const eff = cellEfficiency(n, ctx.hubs, ctx.eco);
      // 안개를 걷는 것 자체가 값어치다. 모르는 곳은 위험이자 기회다.
      /*
        모르는 곳이 얼마나 걸려 있나. 반경 2 는 박힌 값이고, 이걸 판 크기에
        맞춰 키워봤다가 되돌렸다.

        시야는 판이 커지면 같이 넓어지는데(vision.ts visionScale) 이 반경은
        안 그랬다. 21x21 에서는 부대 시야가 4 라 반경 2 안은 이미 다 밝혀져
        있고, 그래서 이 항이 늘 0 이었다 — explore 를 0 으로 두든 3 으로 두든
        게임이 한 판도 안 달라졌다(11x11 에서는 첫 발견이 7.4 → 6.0턴으로
        줄어드는데).

        반경을 시야에 맞춰 키우니 손잡이는 살아났다(0 → 16.9턴/227칸,
        3 → 10.2턴/290칸). 그런데 판정이 6/6 에서 4/6 으로 내려갔다 —
        수비형 29.9 → 36.6%, 집중형 7.5 → 4.5%. 다들 더 많이 밝히니 빈 땅을
        먼저 줍는 쪽이 더 이득을 봤다.

        죽어 있던 이 항이 사실상 균형추 노릇을 하고 있었던 셈이다. 손잡이를
        살리는 것 자체가 목적은 아니므로 2 로 둔다. 큰 판의 정찰은 이미
        scoutTarget 이 맡는다.
      */
      const scout = w.explore * unexploredCount(ctx.state, ctx.me, n, 2) * 0.6;
      const fresh = n.owner !== ctx.me ? 1.5 : 0.2;
      const gain = w.expansion * w.territory * (2 * eff - 0.4) * fresh + positionValue(ctx, n);

      if (a.posture === 'withdraw') {
        // 지연하며 뒤로. 그냥 도망가는 게 아니라 막을 수 있는 자리로 물러난다.
        // 적 압박이 적고, 지형이 받쳐주고, 본거지에 가까운 칸을 고른다.
        actions.push({
          kind: 'move',
          score:
            retreatValue(ctx, n) * w.homeDefense * 1.6 + gain * 0.25 + scout * 0.2 - backtrack,
          target: n,
        });
      } else {
        actions.push({
          kind: 'move',
          score: gain + scout - riskAt(ctx, n, c.units, myPower) - backtrack + toward,
          target: n,
        });
      }
    }
  }

  return actions;
}

/**
 * 수를 고르는 방식을 바깥에서 갈아끼우는 자리.
 *
 * 후보 행동은 규칙이 정한다(제자리 + 이웃 한 칸씩). 바뀌는 건 그 후보를
 * 어떻게 매기고 어떻게 고르느냐다. 손으로 쓴 평가식도, 학습한 가치함수도
 * 같은 자리에 꽂힌다 — 그래야 둘을 같은 기준으로 붙여볼 수 있다.
 */
export interface Policy {
  /** 후보를 다시 매긴다. 없으면 손으로 쓴 점수를 그대로 쓴다. */
  score?: (ctx: Ctx, c: Cell, a: Action) => number;
  /** 고르는 방식. 없으면 최고점. 학습 중에는 여기로 탐색을 섞는다. */
  select?: (actions: Action[], rng: RNG, ctx: Ctx, c: Cell) => Action;
  /** 고른 수를 알린다. 학습 자료는 여기서 모은다. */
  onChoose?: (ctx: Ctx, c: Cell, chosen: Action, all: Action[]) => void;
}

/**
 * 속국을 다룬다.
 *
 * 불이행이 드러난 속국은 손본다. 다만 응징은 공짜가 아니다 — 다른 속국들이
 * 보고 마음이 식으므로, 공포로 누르는 나라일수록 세게 나간다.
 *
 * 명령은 한 번에 하나만. 지금 무엇이 아쉬운지에 따라 고른다.
 */
function governVassals(
  state: GameState,
  nationId: number,
  w: AIWeights,
  rng: RNG,
  eco: EconomyConfig
): void {
  const mine = vassalsOf(state, nationId);
  if (mine.length === 0) return;
  const lord = state.nations[nationId];

  for (const v of mine) {
    if (v.order?.revealed && v.order.response !== 'obey') {
      // 공포를 쓰는 나라는 세게, 정의를 쓰는 나라는 국고만 건드린다
      const harsh = lord.fear > 60 && v.loyalty < 25;
      punishVassal(state, nationId, v.id, harsh ? 'strip' : 'seize', eco);
    }
  }

  // 한 턴에 하나만 새로 내린다
  const idle = mine.filter((v) => !v.order);
  if (idle.length === 0) return;
  const v = idle[Math.floor(rng() * idle.length)];

  // 돈이 급하면 조공, 적이 뚜렷하면 진격, 아니면 파병
  const ledger = computeLedger(state, nationId, eco);
  if (ledger.net < 0) {
    issueOrder(state, nationId, v.id, 'tax', rng, { amount: 0.15 });
    return;
  }

  // 속국의 본성 — 명령은 이 자리를 기준으로 재야 한다.
  // 종주국 형편만 보고 고르면 지도 반대편으로 부르게 되고, 속국은 따를 마음이
  // 있어도 기한 안에 닿지 못한다. 그러면 순종과 태업이 지도에서 구별되지 않는다.
  const vHome =
    state.cells.find((c) => c.castle && c.owner === v.id) ??
    state.cells.find((c) => c.owner === v.id) ??
    null;

  // 칠 상대는 '가장 큰 나라'가 아니라 '속국이 닿을 수 있는 적'이다
  let foe: number | null = null;
  let best = Infinity;
  for (const n of state.nations) {
    if (!n.alive || blocOf(state, n.id) === nationId) continue;
    let near = Infinity;
    for (const c of state.cells) {
      if (c.owner !== n.id || c.neutral) continue;
      const d = vHome ? hexDistance(c.row, c.col, vHome.row, vHome.col) : 0;
      if (d < near) near = d;
    }
    if (near < best) {
      best = near;
      foe = n.id;
    }
  }

  const roll = rng();
  if (foe !== null && roll < 0.4) {
    // 닿는 데 걸리는 시간만큼은 줘야 한다. 못 지킬 기한은 명령이 아니라 구실이다.
    const turns = Math.max(8, Math.min(24, Math.round((Number.isFinite(best) ? best : 6) * 1.6) + 6));
    issueOrder(state, nationId, v.id, 'attack', rng, { target: foe, turns });
    return;
  }

  // 내 최전선 — 적과 맞닿은 내 칸 중 하나로 부른다
  const front = state.cells.filter(
    (c) =>
      c.owner === nationId &&
      !c.neutral &&
      neighbors(state, c).some((n) => isFoeCell(state, nationId, n))
  );
  // 그 중 속국에게 가장 가까운 자리. 먼 전선에 부르는 건 부리는 게 아니라 버리는 것이다.
  // 다만 이미 속국 병력이 가 있는 자리는 뺀다 — 가만히 있어도 이행되는 명령은
  // 시킨 적이 없는 것과 같다.
  let dest: Cell | null = null;
  let closest = Infinity;
  for (const c of front) {
    let already = 0;
    for (const x of state.cells) {
      if (x.owner !== v.id || x.units <= 0 || x.neutral) continue;
      if (hexDistance(x.row, x.col, c.row, c.col) <= 2) already += x.units;
    }
    if (already > 0) continue;
    const d = vHome ? hexDistance(c.row, c.col, vHome.row, vHome.col) : 0;
    if (d < closest) {
      closest = d;
      dest = c;
    }
  }
  if (dest) {
    // 기한은 거리가 정한다. 열 칸 떨어진 곳에 여덟 턴을 주면 그건 못 지킬 명령이다.
    const turns = Math.max(6, Math.min(20, Math.round(closest * 1.6) + 4));
    const army = nationStats(state, v.id).units;
    issueOrder(state, nationId, v.id, roll < 0.7 ? 'march' : 'garrison', rng, {
      destId: dest.id,
      amount: Math.max(2, Math.min(6, Math.floor(army * 0.35))),
      turns,
    });
  } else {
    issueOrder(state, nationId, v.id, 'tax', rng, { amount: 0.1 });
  }
}

export interface AITurnLog {
  attacks: AttackOutcome[];
  recruited: number;
  fortsStarted: number;
  moved: Set<string>;
}

/**
 * 마지막 본진을 빼앗았을 때 병합할지 속국으로 둘지 고른다.
 *
 * 순전히 계산이다. 병합하면 그 땅의 수입이 들어오지만 내 행정비가 가팔라진다.
 * 속국으로 두면 조공만 들어오고 행정비는 그 나라가 낸다.
 * 이미 넓은 나라일수록 부리는 쪽이 이득이 된다 — 역사가 그랬듯이.
 */
export function chooseVassalOrAnnex(
  state: GameState,
  winnerId: number,
  loserId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): 'annex' | 'vassalize' {
  const mine = computeLedger(state, winnerId, eco);
  const theirs = computeLedger(state, loserId, eco);

  // 병합: 상대 수입을 얻지만 행정비가 (내 칸 + 상대 칸)^지수 로 뛴다
  const adminNow = Math.pow(mine.cells, eco.adminExponent) * eco.adminCostPerCell;
  const adminAfter =
    Math.pow(mine.cells + theirs.cells, eco.adminExponent) * eco.adminCostPerCell;
  const annexGain = theirs.income - (adminAfter - adminNow);

  // 속국: 상대 순수입의 일부가 조공으로 들어온다. 행정비는 없다.
  const tributeGain = Math.max(0, theirs.net) * eco.tributeRateConquest;

  return annexGain >= tributeGain ? 'annex' : 'vassalize';
}

/**
 * AI 한 나라의 턴. 사람이 수비할 차례가 오면 그 자리에서 멈추고 선택을 받는다.
 *
 * 시뮬레이터는 takeAITurn() 으로 끝까지 돌리면 되고, 화면만 이 제너레이터를
 * 직접 몬다.
 */
/**
 * 이 나라가 세워볼 만한 작전들.
 *
 * 작전이란 곧 '이번 원정을 어디로' 다. 아는 적 본진 하나하나가 후보이고,
 * 거기에 '안개를 걷는다'(scoutTarget)와 '집을 굳힌다'(null)를 더한다.
 * 많아야 대여섯이라 전부 굴려볼 수 있다.
 */
export function planCandidates(
  state: GameState,
  nationId: number,
  w: AIWeights,
  eco: EconomyConfig = DEFAULT_ECONOMY
): Array<Cell | null> {
  const homes = state.cells.filter((c) => c.castle && c.owner === nationId);
  const enemyHomes = state.cells.filter(
    (c) => c.castle && c.owner !== null && blocOf(state, c.owner) !== blocOf(state, nationId)
  );
  const hubs = adminHubs(state, nationId);
  const partial = { state, me: nationId, w, homes, enemyHomes, hubs, eco, scale: boardScale(state) };

  const out: Array<Cell | null> = [];
  for (const h of enemyHomes) {
    if (isExplored(state, nationId, h)) out.push(h);
  }
  const scout = scoutTarget(partial);
  if (scout && !out.some((c) => c?.id === scout.id)) out.push(scout);
  out.push(null); // 집을 굳힌다
  return out;
}

export function* takeAITurnGen(
  state: GameState,
  nationId: number,
  w: AIWeights,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY,
  policy?: Policy,
  defenseNoise = 0,
  /**
   * 이번 원정의 목표를 밖에서 정한다.
   *
   * 작전 탐색(plan.ts)이 여러 목표를 굴려보고 고른 값을 여기로 넣는다.
   * undefined 면 예전처럼 pickTarget 이 정한다 — 넣지 않으면 아무것도 안 바뀐다.
   */
  planTarget?: Cell | null
): Generator<DefenseRequest, AITurnLog, DefenseChoice | undefined> {
  const moved = new Set<string>();
  const log: AITurnLog = { attacks: [], recruited: 0, fortsStarted: 0, moved };

  const homes = state.cells.filter((c) => c.castle && c.owner === nationId);
  // 안개 속에서는 '내가 아는' 적 본진만 셈에 넣는다
  const enemyHomes = state.cells.filter(
    (c) =>
      c.castle &&
      c.owner !== null &&
      blocOf(state, c.owner) !== blocOf(state, nationId) &&
      isExplored(state, nationId, c)
  );
  const hubs = adminHubs(state, nationId);
  const partial = { state, me: nationId, w, homes, enemyHomes, hubs, eco, scale: boardScale(state) };
  const ctx: Ctx = {
    ...partial,
    target: planTarget !== undefined ? planTarget : pickTarget(partial),
    homeThreat: computeHomeThreat(state, nationId, homes),
    distress: findDistress(state, nationId),
    rally: null,
    token: null,
  };

  /**
   * 받든 명령은 실제 행동으로 옮긴다.
   *
   * 이게 없으면 '순종'이 장부상의 숫자일 뿐이다. 주둔·이동은 그 자리를
   * 부대들의 목적지로 삼고, 공격은 그 나라의 성을 이번 원정의 목표로 삼는다.
   * 태업하는 속국은 이 갈래를 타지 않으므로 지도에 아무 일도 일어나지 않는다 —
   * 그래서 들킨다.
   */
  const myOrder = state.nations[nationId]?.order;
  if (myOrder && myOrder.response === 'obey') {
    if (myOrder.destId) {
      ctx.rally = state.cells.find((c) => c.id === myOrder.destId) ?? null;
    } else if (myOrder.kind === 'attack' && myOrder.target !== undefined) {
      // 본성을 노리되, 아직 못 봤으면 눈에 보이는 그 나라 땅 중 가장 가까운 곳.
      // 성만 찾으면 정찰이 안 된 상대에게는 명령이 아무 일도 일으키지 못한다.
      const home = state.cells.find((c) => c.castle && c.owner === nationId) ?? null;
      let pick: Cell | null = null;
      let bestD = Infinity;
      for (const c of state.cells) {
        if (c.owner !== myOrder.target || c.neutral) continue;
        if (!isExplored(state, nationId, c)) continue;
        const d = home ? hexDistance(c.row, c.col, home.row, home.col) : 0;
        const score = c.castle ? d - 100 : d;
        if (score < bestD) {
          bestD = score;
          pick = c;
        }
      }
      if (pick) ctx.target = pick;
    }
  } else if (myOrder && myOrder.response === 'feign' && myOrder.kind === 'attack') {
    /**
     * 치는 척.
     *
     * 태업이 '아무것도 안 한다'면 종주국 눈에는 그냥 불이행이고, 속국 입장에서
     * 굳이 속내를 숨길 이유가 없어진다. 실제로는 가장 작은 부대 하나를 떼어
     * 생색을 낸다 — 종주국은 싸우는 걸 보고, 속국은 힘을 아낀다.
     */
    let small: Cell | null = null;
    for (const c of state.cells) {
      if (c.owner !== nationId || c.units <= 0 || c.neutral) continue;
      if (!small || c.units < small.units) small = c;
    }
    let dest: Cell | null = null;
    let near = Infinity;
    for (const c of state.cells) {
      if (c.owner !== myOrder.target || c.neutral) continue;
      if (!isExplored(state, nationId, c)) continue;
      const d = small ? hexDistance(c.row, c.col, small.row, small.col) : 0;
      if (d < near) {
        near = d;
        dest = c;
      }
    }
    if (small && dest) ctx.token = { stackId: small.id, dest };
  }

  // 0. 속국 다루기 — 명령을 내리고, 안 듣는 놈은 손본다
  governVassals(state, nationId, w, rng, eco);

  // 1. 징병 — 목표 병력은 영토에 비례해야 한다. 절대 상한으로 두면
  //    넓은 나라가 적은 병력에서 징병을 멈추고 골드만 쌓인 채 정지한다.
  let myUnits = 0;
  let myCells = 0;
  for (const c of state.cells) {
    if (c.owner !== nationId) continue;
    myUnits += c.units;
    myCells++;
  }
  if (homes.length > 0 && myUnits < w.targetArmy + myCells * 0.6) {
    log.recruited = recruit(state, nationId, eco);
  }

  // 2. 요새 — 거점에서 먼 땅을 쓸모 있게 만드는 수단이다
  if (state.nations[nationId].gold >= eco.fortCost * 1.4) {
    let site: Cell | null = null;
    let worst = 1;
    for (const c of state.cells) {
      if (c.owner !== nationId || c.castle || c.fortStage !== 0 || c.units < 3) continue;
      const eff = cellEfficiency(c, hubs, eco);
      if (eff < worst) {
        worst = eff;
        site = c;
      }
    }
    if (site && worst < 0.35 + w.fort * 0.06 && startFort(state, site, nationId, eco)) {
      log.fortsStarted = 1;
    }
  }

  // 3. 무역상 — 가장 이문이 큰 목적지로 보낸다
  for (const m of state.merchants) {
    if (m.nation !== nationId || m.phase !== 'idle') continue;
    const dest = bestTradeDestination(state, m, eco);
    if (dest) sendMerchant(state, m, dest);
  }

  // 4. 부대별 행동 — 한 턴에 한 번씩
  const stackIds: string[] = [];
  for (const c of state.cells) {
    if (c.owner === nationId && c.units > 0 && !c.neutral && c.fortStage === 0) stackIds.push(c.id);
  }
  for (let i = stackIds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [stackIds[i], stackIds[j]] = [stackIds[j], stackIds[i]];
  }

  // 명령 수에 한도가 있으면 아무 순서로나 쓸 수 없다. 값어치가 큰 수부터
  // 쓰는 것이 한도 아래에서 두는 법이다. 한도가 없으면 예전 그대로 둔다 —
  // 순서를 바꾸면 지금까지 재둔 기준선이 전부 무의미해진다.
  let budget = commandLimit(state, nationId, eco);
  if (budget !== Infinity) {
    const ranked: Array<{ id: string; score: number }> = [];
    for (const id of stackIds) {
      const c = state.cells.find((x) => x.id === id);
      if (!c) continue;
      const actions = scoreActions(ctx, c);
      if (policy?.score) for (const a of actions) a.score = policy.score(ctx, c, a);
      actions.sort((a, b) => b.score - a.score);
      const top = actions[0];
      const stay = actions.find((a) => a.kind === 'stay');
      // 제자리와의 차이가 곧 '이 명령을 쓸 값어치'다
      if (top && top.kind !== 'stay') ranked.push({ id, score: top.score - (stay?.score ?? 0) });
    }
    ranked.sort((a, b) => b.score - a.score);
    stackIds.length = 0;
    for (const r of ranked) stackIds.push(r.id);
  }

  for (const id of stackIds) {
    if (budget <= 0) break;
    const c = state.cells.find((x) => x.id === id);
    if (!c || c.owner !== nationId || c.units <= 0) continue;

    const actions = scoreActions(ctx, c);
    if (policy?.score) for (const a of actions) a.score = policy.score(ctx, c, a);
    actions.sort((a, b) => b.score - a.score);
    const best = policy?.select ? policy.select(actions, rng, ctx, c) : actions[0];
    if (!best) continue;
    // 제자리도 하나의 수다. 학습 자료에서 빼면 '가만히 있기'를 영영 못 배운다.
    policy?.onChoose?.(ctx, c, best, actions);
    if (best.kind === 'stay') continue;

    if (best.kind === 'attack') {
      const wasCastle = best.target.castle;
      const victim = best.target.owner;
      // 이 싸움에 실제로 건 병력. 전투 뒤에는 알 수 없으므로 미리 적어둔다.
      const committedUnits = c.units;
      // 사람이 지키는 칸이면 여기서 멈추고 물어본다
      let forced: DefenseChoice | undefined;
      const victimNation = best.target.owner;
      if (victimNation !== null && !best.target.neutral && state.nations[victimNation]?.isHuman) {
        const info = defenseOptions(state, c, best.target, eco);
        if (info.options.length > 1) {
          forced =
            (yield {
              fromId: c.id,
              toId: best.target.id,
              options: info.options,
              attackerUnits: c.units,
              defenderUnits: best.target.units,
              myPower: info.myPower,
              theirPower: info.theirPower,
            }) ?? undefined;
        }
      }
      const out = performAttack(state, c, best.target, rng, eco, forced, defenseNoise);
      log.attacks.push(out);

      /**
       * 진격 명령 — 친 것만 셈에 넣되, 진실과 목격을 따로 적는다.
       *
       * 실제 이행(progress)은 얼마나 걸었느냐로 잰다. 한 명 찔러보고 오는 건
       * 참전이 아니다. 반면 종주국이 보는 것(witnessed)은 규모를 가리지 않는다 —
       * 싸우는 장면을 봤을 뿐이지 얼마나 진심인지는 알 수 없다.
       * 이 둘의 차이가 곧 '치는 척'이다.
       */
      const ord = state.nations[nationId]?.order;
      if (
        ord &&
        ord.kind === 'attack' &&
        out.defenderNation !== null &&
        blocOf(state, out.defenderNation) === blocOf(state, ord.target ?? -1)
      ) {
        const army = nationStats(state, nationId).units;
        const committed = Math.min(1, committedUnits / Math.max(1, army * 0.25));
        ord.progress = Math.min(1, ord.progress + 0.5 * committed);

        const lordId = state.nations[nationId].suzerain;
        if (lordId !== null && isVisible(state, lordId, best.target)) {
          ord.witnessed = Math.min(1, ord.witnessed + 0.5);
          ord.observedTurn = state.turn;
        }
      }

      // 마지막 본진을 빼앗았다면 병합할지 속국으로 둘지 정한다
      if (
        wasCastle &&
        out.capturedCell &&
        victim !== null &&
        victim !== nationId &&
        state.nations[victim]?.alive &&
        !state.cells.some((x) => x.castle && x.owner === victim)
      ) {
        const choice = chooseVassalOrAnnex(state, nationId, victim, eco);
        resolveCastleLoss(state, victim, nationId, choice, best.target);
        if (choice === 'vassalize') vassalize(state, nationId, victim, 'conquest');
      }
    } else {
      moveStack(c, best.target);
    }
    moved.add(id);
    budget--;
  }

  return log;
}

/**
 * 제너레이터를 끝까지 몰아준다. 사람이 없는 판(시뮬레이터)에서는 멈출 일이
 * 없으므로 예전과 똑같이 동작한다.
 */
export function takeAITurn(
  state: GameState,
  nationId: number,
  w: AIWeights,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY,
  policy?: Policy,
  defenseNoise = 0,
  planTarget?: Cell | null
): AITurnLog {
  const gen = takeAITurnGen(state, nationId, w, rng, eco, policy, defenseNoise, planTarget);
  let step = gen.next();
  // 멈춰 서면 규칙대로 알아서 정한다
  while (!step.done) step = gen.next(undefined);
  return step.value;
}

export function bestTradeDestination(
  state: GameState,
  m: Merchant,
  eco: EconomyConfig = DEFAULT_ECONOMY
): Cell | null {
  let best: Cell | null = null;
  let bestNet = 0;
  for (const d of merchantDestinations(state)) {
    if (d.row === m.row && d.col === m.col) continue;
    const p = expectedTradeProfit(state, m, d, eco);
    // 거리가 멀수록 강도에 털릴 위험이 커지므로 살짝 할인한다
    const adjusted = p.net - p.distance * 2;
    if (adjusted > bestNet) {
      bestNet = adjusted;
      best = d;
    }
  }
  return best;
}
