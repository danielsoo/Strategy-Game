import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  useWindowDimensions,
  Dimensions,
  Platform,
} from 'react-native';
import Board3D from './Board3D';
import { encodeSave, decodeSave, describeSave } from '../engine/save';
import {
  readSave, writeSave, clearSave, tutorialSeen, markTutorialSeen,
} from '../services/saveStore';
import Coach from './Coach';
import { COACH_STEPS, CoachProgress, coachTarget, coachReady } from './tutorial';
import {
  MatchLog, startMatch, recordTurn, finishMatch, emptyHumanTurn,
} from '../engine/matchLog';
import {
  putMatch, downloadMatches, newMatchId, findMatch, loadPlayerName, savePlayerName,
  sendMatch,
} from '../services/matchStore';
import { DIFFICULTIES, difficultyPolicy } from '../engine/difficulty';
import Svg, { Polygon, Polyline } from 'react-native-svg';
import { makeRng, DetailedCombatResult, RNG } from '../services/combatSystem';
import {
  Cell,
  GameState,
  Merchant,
  DEFAULT_ECONOMY,
  NEUTRAL_COLOR,
  createGameState,
  neighbors,
  isHostile,
  performAttack,
  moveStack,
  canMoveTo,
  canAttackFrom,
  marchCost,
  stackCap,
  beginTurn,
  restUnmoved,
  updateAliveFlags,
  stepMerchants,
  stepNeutrals,
  computeLedger,
  canBuildFort,
  startFort,
  recruit,
  merchantDestinations,
  expectedTradeProfit,
  sendMerchant,
  nationStats,
  pushLog,
  recruitableCastles,
  desertionGrace,
  collectTribute,
  updateLoyalty,
  stepVoluntarySubmission,
  checkBlocVictory,
  vassalsOf,
  vassalize,
  resolveCastleLoss,
  influenceOf,
  recomputeVision,
  isVisible,
  isExplored,
  isFoeCell,
  cellPower,
  planCandidates,
  choosePlan,
  knownCell,
  findPath,
  nextStep,
  stepOrders,
  stepRebellion,
  issueOrder,
  punishVassal,
  orderCost,
  blocOf,
  assessVassal,
  nationPower,
} from '../engine';
import type { OrderKind, Punishment } from '../engine';
import VassalPanel from './VassalPanel';
import DiplomacyPanel, { ProposalCard, EncounterCard } from './DiplomacyPanel';
import {
  propose,
  breakTreaty,
  answerProposal,
  proposalsFor,
  rollEncounter,
  applyEncounter,
  relationOf,
  treatyOf,
  isGuestLand,
  enterAsGuest,
  settleGuests,
  answerBreakOrder,
  dissolveAlliance,
  wa,
} from '../engine';
import type { Encounter, TreatyKind } from '../engine';
import {
  takeAITurn,
  PERSONALITIES,
  LEARNED_WEIGHTS,
  AIWeights,
  chooseVassalOrAnnex,
  Policy,
  takeAITurnGen,
  DefenseRequest,
  AITurnLog,
} from '../engine/ai';
import { DefenseChoice } from '../engine/defense';

const PLAYER = 0;

/**
 * 판 짜기. size 는 격자 한 변이고, 실제 판은 그 안에 깎아낸 육각형이다.
 *
 *   9x9  →  61칸     11x11 →  91칸     13x13 → 127칸
 *
 * 사각 판을 육각형으로 깎으면 칸이 4분의 1쯤 준다. 처음에 1대1 을 9x9 로
 * 뒀더니 61칸밖에 안 되어 평균 28턴, 공격 10회로 끝났다 — 접전 한 번에
 * 승부가 나는 수준이다. 120판 재본 값:
 *
 *   1대1   61칸  턴 28 · 공격 10          91칸  턴 59 · 공격 13   ← 채택
 *         127칸  턴 93 · 턴제한 39% (늘어짐)
 *   5인    91칸  턴 75 · 공격 103 · 턴제한 12%   ← 채택
 *         127칸  턴 111 · 턴제한 29%
 */
const MODES = [
  { label: '1대1', nations: 2 },
  { label: '5인 난전', nations: 5 },
] as const;

/** 칸 하나의 목표 가로 크기(px). 이만큼씩 들어가도록 판을 키운다. */
const TARGET_HEX_W = 64;

/**
 * 화면에 맞는 판 크기를 고른다.
 *
 * 칸 수를 고정해두면 큰 화면에서 칸만 거대해진다 — 1920x1080 에서 91칸을
 * 그리니 칸 하나가 108px 이었다. 칸 크기를 정해두고 들어가는 만큼 판을
 * 키우는 쪽이 맞다.
 *
 * 반지름 R 인 육각 판은 가로로 2R+1.5 칸, 세로로 1.5R+1 칸을 차지한다.
 * 격자 한 변은 2R+1 이고 실제 칸 수는 3R(R+1)+1 이다.
 */
function mapSizeFor(winW: number, winH: number): number {
  const hex = TARGET_HEX_W / Math.sqrt(3);
  const fit = (w: number, h: number) =>
    Math.min((w / (Math.sqrt(3) * hex) - 1.5) / 2, (h / (2 * hex) - 1) / 1.5);

  const side = fit(winW - paneWidth(winW) - 16, winH - 16);
  const stacked = fit(winW, winH - CHROME_H);
  const r = Math.max(4, Math.min(12, Math.floor(Math.max(side, stacked))));
  return 2 * r + 1;
}

/** 판 한 변에서 실제 칸 수 */
function tileCount(size: number): number {
  const r = (size - 1) / 2;
  return 3 * r * (r + 1) + 1;
}

/**
 * 고를 수 있는 판 크기.
 *
 * size 는 격자 한 변이고, 실제 판은 그 안에 깎아낸 육각형이라 칸 수가 다르다.
 * 버튼에는 격자와 실제 칸 수를 같이 적는다 — 11x11 이라 써놓고 91칸이 나오면
 * 무슨 일이 벌어진 건지 알 수가 없다.
 */
const SIZES = [9, 11, 13, 15, 17, 19, 21];

/** 화면에 맞는 크기를 SIZES 에서 고른다 */
function defaultSizeIdx(winW: number, winH: number): number {
  const want = mapSizeFor(winW, winH);
  let best = 0;
  for (let i = 0; i < SIZES.length; i++) {
    if (Math.abs(SIZES[i] - want) < Math.abs(SIZES[best] - want)) best = i;
  }
  return best;
}

/** 나라별 AI 성격. 0번 자리는 사람이 둘 때는 쓰이지 않고, 관전 모드에서만 쓰인다. */
const AI_WEIGHTS: AIWeights[] = [
  LEARNED_WEIGHTS,
  LEARNED_WEIGHTS, // 가장 센 상대를 하나는 만나야 한다 (토너먼트 68%)
  PERSONALITIES['확장형'],
  PERSONALITIES['수비형'],
  PERSONALITIES['공격형'],
];
const AI_LABELS = ['학습형', '학습형', '확장형', '수비형', '공격형'];

/**
 * 칸 크기는 고정값이 아니라 화면에서 정한다.
 *
 * 판이 육각형이라 실제로 칸이 놓인 범위만 재야 한다 — 사각 격자의 모서리는
 * 깎여 비어 있으므로, 그것까지 넣고 계산하면 판이 쓸데없이 작아진다.
 */
function layout(cells: Cell[], maxW: number, maxH: number) {
  const on = cells.filter((c) => !c.offMap);
  if (on.length === 0 || maxW <= 0 || maxH <= 0) return null;

  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  let anyOddRow = false;
  for (const c of on) {
    if (c.col < minCol) minCol = c.col;
    if (c.col > maxCol) maxCol = c.col;
    if (c.row < minRow) minRow = c.row;
    if (c.row > maxRow) maxRow = c.row;
    if (c.row % 2 === 1) anyOddRow = true;
  }

  // 가로: 칸 수 + 홀수 행이 반 칸 밀린 만큼. 세로: 행마다 0.75 씩 겹친다.
  const wUnits = maxCol - minCol + 1 + (anyOddRow ? 0.5 : 0);
  const hUnits = (maxRow - minRow) * 0.75 + 1;
  const hex = Math.min(maxW / (Math.sqrt(3) * wUnits), maxH / (2 * hUnits));

  const w = Math.sqrt(3) * hex;
  const h = hex * 2;
  return {
    hex,
    w,
    h,
    points: [
      [w * 0.5, 0],
      [w, h * 0.25],
      [w, h * 0.75],
      [w * 0.5, h],
      [0, h * 0.75],
      [0, h * 0.25],
    ]
      .map((p) => `${p[0]},${p[1]}`)
      .join(' '),
    x: (c: { row: number; col: number }) =>
      (c.col - minCol) * w + (c.row % 2 === 0 ? 0 : w * 0.5),
    y: (c: { row: number; col: number }) => (c.row - minRow) * h * 0.75,
    width: wUnits * w,
    height: hUnits * h,
  };
}

type Layout = NonNullable<ReturnType<typeof layout>>;

/**
 * 처음 만나는 사람이 막히는 자리만 고른다.
 *
 * 이 게임은 문명과 두 군데가 다르다 — 전투가 확률이고(열세도 이긴다), 진
 * 나라를 속국으로 둘 수 있다. 거기에 부대 편성 규칙이 겹쳐서, 설명 없이
 * 만나면 "왜 옆 칸으로 못 가지?" 에서 막힌다.
 */
const HELP: Array<{ title: string; body: string }> = [
  {
    title: '이기는 법',
    body: '살아남은 나라가 모두 당신 진영이 되면 이긴다. 땅만 넓혀서는 이기지 못한다 — 적의 마지막 성을 빼앗아, 그 나라를 병합하거나 속국으로 삼아야 한다. 속국은 조공을 바치고, 행정비는 그쪽이 낸다 — 넓어질수록 직접 먹는 것보다 부리는 쪽이 이득이다.',
  },
  {
    title: '외교',
    body: '"외교" 단추로 휴전이나 동맹을 청할 수 있다. 휴전은 한동안, 동맹은 기한 없이 서로 치지 않는 약속이고, 동맹군은 붙어 있으면 협공을 거든다. 동맹이어도 속사정은 보이지 않는다 — 내 부대가 가서 봐야 안다. 조약 상대의 땅에 군대를 들일 수는 있지만 무례한 일이라, 상대가 철수를 요구하고 버티면 조약을 깬다. 조약을 스스로 깨면 배신이다 — 정의가 깎이고 다른 나라들이 당신을 덜 믿는다. 속국도 따로 조약을 맺을 수 있고, 종주국은 허락 밖의 조약을 끊으라 명할 수 있다. 동맹은 이긴 것으로 치지 않는다 — 공동의 적이 사라지면 풀린다.',
  },
  {
    title: '행군 중에 만나는 일',
    body: '새 땅에 들어서면 가끔 일이 생긴다. 정의로운 나라에는 마을이 곡식을 내놓고 용병이 합류를 청하며, 두려운 나라에는 공물이 들어오고 도적이 흩어지지만 원한을 품은 주민이 우물에 독을 풀기도 한다. 그 앞에서 무엇을 고르느냐가 다시 평판이 된다.',
  },
  {
    title: '부대는 한 턴에 한 번',
    body: '부대를 누르고 노란 칸을 누르면 이동하거나 공격한다. 한 번 움직인 부대는 그 턴에 다시 못 움직인다.',
  },
  {
    title: '많을수록 느리다',
    body: '한 칸 옮기는 데 드는 행군력은 병력 수에 비례한다. 3명은 매 턴 움직이지만 10명은 평지에서도 두 턴에 한 칸, 산이면 세 턴이다. 싸우는 것은 절반만 든다 — 대군도 매 턴 싸울 수는 있다. 무역상이 닦은 길 위에서는 40% 싸진다.',
  },
  {
    title: '한 칸에 10명까지',
    body: '넘치게 합칠 수 없다. 대신 옆에 붙어 있는 아군이 전력을 보태준다(협공). 포개는 것이 아니라 나란히 늘어서는 것이 이 게임의 병력 집중이다.',
  },
  {
    title: '열세도 이긴다',
    body: '전투는 병력이 아니라 사기가 꺾여서 끝난다. 지형·포위·기세가 붙고, 밀리는 쪽에는 결사항전 보정이 붙는다. 5 대 10 도 13% 쯤 이기고, 포위되면 50% 까지 오른다.',
  },
  {
    title: '보이는 만큼만 안다',
    body: '한 번도 못 가본 곳은 지형조차 모른다. 가봤어도 지금 보는 부대가 없으면 마지막으로 본 기억만 남는다 — 그 사이에 적이 왔는지는 모른다.',
  },
  {
    title: '돈',
    body: '성 하나당 한 턴에 한 명 징병한다(성이 꽉 차 있으면 못 뽑는다). 병력 유지비와 행정비가 나가고, 행정비는 땅이 넓어질수록 가팔라진다. 돈이 마르면 바로는 아니고 몇 턴 뒤에 병력이 흩어진다 — 정의가 높으면 더 버틴다.',
  },
];

/**
 * 넓은 화면에서 왼쪽 정보 칸의 너비.
 *
 * 고정폭으로 두면 창이 좁을수록 손해가 커진다 — 900px 창에서 300px 은
 * 가로의 3분의 1이다. 표가 읽히는 최소폭(240)과 넉넉한 폭(300) 사이에서
 * 창 크기를 따라간다.
 */
function paneWidth(winW: number): number {
  return Math.max(240, Math.min(300, Math.round(winW * 0.26)));
}

/** 세로로 쌓을 때 판 위아래가 쓰는 대략의 높이 (머리말 + 표 + 사건 + 버튼) */
const CHROME_H = 300;

/**
 * 판이 실제로 차지하는 칸 수. 가로는 홀수 행이 반 칸 밀린 만큼 더 넓다.
 * layout() 과 같은 셈이지만, 어느 배치를 쓸지 먼저 정하려면 상자 크기 없이
 * 이 값만 있으면 된다.
 */
function boardUnits(cells: Cell[]): { w: number; h: number } {
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  let odd = false;
  for (const c of cells) {
    if (c.offMap) continue;
    if (c.col < minCol) minCol = c.col;
    if (c.col > maxCol) maxCol = c.col;
    if (c.row < minRow) minRow = c.row;
    if (c.row > maxRow) maxRow = c.row;
    if (c.row % 2 === 1) odd = true;
  }
  if (minCol === Infinity) return { w: 1, h: 1 };
  return { w: maxCol - minCol + 1 + (odd ? 0.5 : 0), h: (maxRow - minRow) * 0.75 + 1 };
}

/**
 * 옆에 두는 배치가 더 나은가.
 *
 * 창이 세로로 길면 옆에 두는 쪽이 오히려 손해다. 육각 판은 가로:세로가
 * 1.17:1 쯤인데, 왼쪽 칸이 가로를 먹으면 가로가 먼저 차서 세로가 남는다.
 * 1024x768 에서 재보니 판이 553x493 이고 아래로 259px 이 놀고 있었다.
 *
 * 그래서 고정된 폭으로 가르지 않고 두 배치의 칸 크기를 직접 비교한다.
 */
function preferSide(cells: Cell[], winW: number, winH: number, chromeH: number): boolean {
  const u = boardUnits(cells);
  const hexOf = (w: number, h: number) => Math.min(w / (Math.sqrt(3) * u.w), h / (2 * u.h));
  return hexOf(winW - paneWidth(winW) - 16, winH - 16) > hexOf(winW, winH - chromeH);
}

const SPEEDS: Array<{ label: string; ms: number }> = [
  { label: '느리게', ms: 900 },
  { label: '보통', ms: 350 },
  { label: '빠르게', ms: 120 },
  { label: '최고속', ms: 1 },
];

/** 엔진은 상태를 제자리에서 고친다. React 가 다시 그리도록 최상위 참조만 새로 만든다. */
function bump(s: GameState): GameState {
  return {
    ...s,
    cells: s.cells.slice(),
    nations: s.nations.slice(),
    merchants: s.merchants.slice(),
    log: s.log.slice(),
  };
}

/** 지금 차례인 나라 하나를 AI 로 두고, 다음 살아있는 나라로 넘긴다. */
/** 멈춰 선 것인지(사람에게 물어볼 차례인지) 가른다 */
function isAsk(
  r: IteratorResult<DefenseRequest, AITurnLog>
): r is IteratorYieldResult<DefenseRequest> {
  return !r.done;
}

/** AI 나라에만 수입 배수를 건다. 사람은 늘 1.0 이다. */
function applyHandicap(s: GameState, mul: number): void {
  for (const nat of s.nations) nat.incomeMul = nat.id === PLAYER ? 1 : mul;
}

/**
 * 관전 중 한 나라의 차례.
 *
 * plan 을 받는다. 이게 없으면 관전 화면만 예전 AI 로 도는데, 그러면 화면에서
 * 보는 것과 실제로 플레이할 때 상대하는 것이 달라진다 — 실제로 그 상태로
 * "어려움에서 잘 돌아간다" 고 볼 뻔했다.
 */
function playOneNation(
  s: GameState,
  rng: RNG,
  aiPolicy?: Policy,
  plan?: (s: GameState, id: number, w: AIWeights) => Cell | null | undefined
): void {
  if (s.winner !== null) return;
  const id = s.current;
  const nation = s.nations[id];

  if (nation.alive) {
    beginTurn(s, id, rng);
    const w = AI_WEIGHTS[id] ?? PERSONALITIES['균형'];
    const log = takeAITurn(s, id, w, rng, undefined, aiPolicy, 0, plan?.(s, id, w));
    restUnmoved(s, id, log.moved);
    for (const a of log.attacks) {
      const res = a.result;
      const verb =
        res.outcome === 'attacker-win' ? '점령' : res.outcome === 'stalemate' ? '교착' : '격퇴당함';
      pushLog(
        s,
        `${nation.name}: 공격 ${verb} (${res.rounds.length}R, 생존 ${res.attackerSurvivors})`
      );
    }
    stepMerchants(s);
    stepNeutrals(s, rng);
    collectTribute(s);
    updateLoyalty(s);
    /**
     * 명령과 반란은 여기서 돈다.
     *
     * 이게 빠져 있어서 속국 명령 체계가 시뮬레이터에서만 살아 있었다 —
     * 실제로 플레이하는 판에서는 명령을 내려도 아무 일도 일어나지 않았다.
     */
    stepOrders(s, rng);
    stepRebellion(s, rng);
    stepVoluntarySubmission(s, rng);
    updateAliveFlags(s);
    checkBlocVictory(s);
  }

  // 다음 살아있는 나라로. 한 바퀴 돌면 턴이 오른다.
  const n = s.nations.length;
  for (let i = 1; i <= n; i++) {
    const next = (s.current + i) % n;
    if (s.nations[next].alive) {
      if (next <= s.current) s.turn++;
      s.current = next;
      return;
    }
  }
}

export default function GameScreen() {
  const rngRef = useRef<RNG>(makeRng(Date.now() & 0xffffffff));
  const rng = rngRef.current;

  const [modeIdx, setModeIdx] = useState(0);
  const mode = MODES[modeIdx];

  const startSize = useRef(
    (() => {
      const d = Dimensions.get('window');
      return defaultSizeIdx(d.width, d.height);
    })()
  );
  const [sizeIdx, setSizeIdx] = useState(startSize.current);

  const [state, setState] = useState<GameState>(() => {
    const size = SIZES[startSize.current];
    const s = createGameState(MODES[0].nations, size, size, rng);
    applyHandicap(s, DIFFICULTIES[2].incomeMul);
    beginTurn(s, PLAYER, rng);
    return s;
  });
  const [watching, setWatching] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [combat, setCombat] = useState<DetailedCombatResult | null>(null);
  const [merchantPick, setMerchantPick] = useState<Merchant | null>(null);
  const [showStats, setShowStats] = useState(true);
  // 처음 켜면 한 번 띄운다. 규칙을 모르고 만나면 "왜 안 움직이지?" 가 된다.
  const [showHelp, setShowHelp] = useState(true);
  /**
   * 판 기록.
   *
   * 이 게임에 대해 아는 것이 전부 AI 끼리 돌린 결과다. 하네스는 'AI 들끼리
   * 균형이 맞나' 를 재지 '사람이 재미있나' 를 재지 않는다. 사람이 두는 판을
   * 통째로 남겨두면, 한 판이 하네스 삼천 판보다 많은 것을 알려준다.
   *
   * 매 턴 덮어쓴다 — 중간에 창을 닫아도 그때까지가 남는다.
   */
  const [playerName, setPlayerName] = useState(loadPlayerName);
  /** 이름 없이 시작을 눌렀다. 한 번 막고 물어본다. */
  const [nameAsk, setNameAsk] = useState(false);
  const matchRef = useRef<MatchLog | null>(null);
  /** 이번 턴에 사람이 한 것. 턴이 넘어갈 때 기록에 실린다. */
  const humanRef = useRef(emptyHumanTurn());
  /**
   * 어디까지 적었는지.
   *
   * state.log 는 40줄에서 밀려나므로 번호로 셀 수 없다 — 다섯째 줄이 다음
   * 턴에는 둘째 줄이 되어 있다. 그래서 마지막으로 적은 줄을 들고 있다가,
   * 다음에 그 줄을 뒤에서부터 찾아 그 뒤만 새로 적는다. 못 찾으면 그 사이에
   * 40줄이 넘게 밀려난 것이므로 지금 남은 것을 전부 적는다.
   */
  const lastLineRef = useRef<string | null>(null);

  /**
   * 첫 판 길잡이. null 이면 꺼져 있다.
   *
   * 셈은 튜토리얼 전용으로 따로 둔다. humanRef 는 턴마다 비워지므로 '움직여
   * 봤나' 를 물을 수 없다.
   */
  const [coach, setCoach] = useState<number | null>(null);
  /** 지금 단계를 해냈나 — 그러면 카드가 '방금 일어난 일' 풀이로 바뀐다 */
  const [coachDone, setCoachDone] = useState(false);
  const tutRef = useRef({ moves: 0, paths: 0, recruits: 0, attacks: 0 });
  /** 지금 단계가 시작될 때의 값. 앞 단계에서 한 것으로 저절로 넘어가지 않게. */
  const coachBaseRef = useRef<CoachProgress | null>(null);
  /** 다음 reset() 이 튜토리얼 판을 여는가. reset 이 한 번 읽고 끈다. */
  const tutorialNextRef = useRef(false);
  const [firstVisit] = useState(() => !tutorialSeen());

  const freshEvents = (log: string[]): string[] => {
    const mark = lastLineRef.current;
    lastLineRef.current = log.length > 0 ? log[log.length - 1] : mark;
    if (mark === null) return [...log];
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i] === mark) return log.slice(i + 1);
    }
    return [...log];
  };

  /**
   * 기록을 연다.
   *
   * reset() 에서만 열었더니 '시작' 으로 들어간 첫 판이 통째로 안 남았다 —
   * 시작 단추는 도움말을 닫을 뿐 reset 을 부르지 않는다. 첫 판이야말로
   * 사람들이 제일 많이 두는 판이다.
   */
  const beginMatch = (s: GameState, dIdx: number, tutorial = false) => {
    const name = playerName.trim().slice(0, 12);
    if (name) s.nations[PLAYER].name = name;
    matchRef.current = startMatch(s, name || '이름없음', DIFFICULTIES[dIdx].label, newMatchId());
    if (tutorial) matchRef.current.setup.tutorial = true;
    humanRef.current = emptyHumanTurn();
    lastLineRef.current = s.log.length > 0 ? s.log[s.log.length - 1] : null;
  };

  const noteMatchTurn = (s: GameState) => {
    const m = matchRef.current;
    if (!m) return;
    recordTurn(m, s, freshEvents(s.log), humanRef.current);
    if (s.winner !== null) finishMatch(m, s);
    putMatch(m);
    sendMatch(m);
    humanRef.current = emptyHumanTurn();
  };

  // 3D 는 웹에서만. 네이티브는 expo-gl 위에서 따로 붙여야 한다.
  const [use3D, setUse3D] = useState(Platform.OS === 'web');
  const can3D = Platform.OS === 'web';
  const [diffIdx, setDiffIdx] = useState(2); // 보통
  const difficulty = DIFFICULTIES[diffIdx];
  // 난이도는 '수를 고르는 방식'으로 들어간다. 평가식은 그대로 두고 고르는 데서만 흔든다.
  const aiPolicy = useMemo(() => difficultyPolicy(difficulty, rng), [difficulty, rng]);
  /** 마지막 본진을 빼앗았을 때의 처분 선택 */
  const [conquest, setConquest] = useState<{ victim: number; castleId: string } | null>(null);
  /**
   * 사람이 지키는 칸이 공격받는 중. AI 턴이 여기서 멈춰 서 있다.
   *
   * 엔진은 동기라 기다릴 수가 없어서 AI 턴을 제너레이터로 만들었다.
   * 답을 받으면 멈춘 자리에서 이어 돌린다.
   */
  const [defenseAsk, setDefenseAsk] = useState<DefenseRequest | null>(null);
  // 종주국 집무실 — 속국에게 명령을 내린다
  const [showVassals, setShowVassals] = useState(false);
  /** 지도에서 자리를 고르는 중. 이 동안 칸을 누르면 이동이 아니라 명령이 된다. */
  const [placing, setPlacing] = useState<{ vassalId: number; kind: 'garrison' | 'march' } | null>(
    null
  );
  const [orderNote, setOrderNote] = useState<string | null>(null);
  /** 기록 내보내기 결과 한 줄 */
  const [logNote, setLogNote] = useState<string | null>(null);
  const [showDiplo, setShowDiplo] = useState(false);
  const [diploNote, setDiploNote] = useState<string | null>(null);
  /**
   * 행군 중에 만난 일들. 한 턴에 여럿 날 수 있다(길 따라 가는 부대들).
   * setState 의 갱신 함수 안에서 생기므로 ref 에 쌓고, 그 갱신이 부르는
   * 다음 그림에서 첫 것을 띄운다.
   */
  const encQueueRef = useRef<Encounter[]>([]);

  /**
   * 행군이 멈춘 부대. 다음 그림에서 골라준다 —
   * "뭔가 나와서 멈췄다"는 말만 띄우고 어느 부대인지 안 알려주면
   * 넓은 판에서는 찾지 못한다.
   */
  const haltedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!haltedRef.current) return;
    const id = haltedRef.current;
    haltedRef.current = null;
    if (state.cells.some((c) => c.id === id && c.owner === PLAYER && c.units > 0)) {
      setSelected(id);
      setPathTo(null);
    }
  }, [state]);

  /** 길을 물어본 칸. 같은 칸을 한 번 더 누르면 그리로 보낸다. */
  const [pathTo, setPathTo] = useState<string | null>(null);

  const pendingRef = useRef<{ gen: ReturnType<typeof takeAITurnGen>; idx: number } | null>(null);
  /**
   * 이번 턴에 이미 움직인 내 부대들 (부대가 도착한 칸의 id).
   * 제한이 없으면 한 부대로 맵을 가로지르며 연속 공격이 가능해 게임이 성립하지 않는다.
   * 상태가 아니라 ref 인 이유는, 엔진이 상태를 제자리에서 고치고 그때마다
   * bump() 로 다시 그리므로 별도 리렌더 신호가 필요 없기 때문이다.
   */
  const actedRef = useRef<Set<string>>(new Set());

  /**
   * 넓은 화면에서는 판을 오른쪽에 따로 띄운다.
   *
   * 세로로만 쌓으면 판의 크기를 세로가 먼저 제한해서, 가로로 넓은 화면에서는
   * 옆이 텅 빈 채로 판이 작아진다. 휴대폰(세로)에서는 그대로 아래로 쌓는다.
   */
  const { width: winW, height: winH } = useWindowDimensions();
  /**
   * 판 위아래가 쓰는 높이. onLayout 으로 한 번 잰다.
   *
   * onLayout 은 마운트 때만 불리고 창 크기가 바뀔 때는 안 불린다 — 그래서
   * 여기서 받은 값을 판 크기로 바로 쓰면, 창을 줄여도 판이 그대로 남아
   * 화면 밖으로 넘친다 (1440x1200 에서 잰 뒤 1200x900 으로 줄이니 112px 넘쳤다).
   *
   * 그래서 재는 것은 '위아래가 먹는 높이'까지만 하고, 판 크기는 매번 창
   * 크기에서 뺀다. 위아래 높이는 머리말·표·버튼의 내용으로 정해지므로
   * 창 높이가 바뀌어도 그대로다.
   */
  const [chromeH, setChromeH] = useState(CHROME_H);

  const wide = useMemo(
    () => preferSide(state.cells, winW, winH, chromeH),
    [state.cells, winW, winH, chromeH]
  );

  const paneW = paneWidth(winW);
  const boardBox = wide
    ? { width: Math.max(0, winW - paneW - 16), height: Math.max(0, winH - 16) }
    : { width: winW, height: Math.max(0, winH - chromeH) };

  const lay = useMemo(
    () => layout(state.cells, boardBox.width, boardBox.height),
    [state.cells, boardBox.width, boardBox.height]
  );

  const me = state.nations[PLAYER];
  // 성 하나당 한 턴에 한 번. 성이 많으면 그만큼 더 뽑는다.
  const readyCastles = recruitableCastles(state, PLAYER).length;
  const ledger = useMemo(() => computeLedger(state, PLAYER), [state]);
  const myTurn = !watching && state.current === PLAYER && state.winner === null;

  // ── 관전 모드: 한 나라씩 자동으로 둔다 ────────────────────
  useEffect(() => {
    if (!watching || state.winner !== null) return;
    const t = setTimeout(() => {
      setState((prev) => {
        playOneNation(prev, rng, aiPolicy, planFor);
        return bump(prev);
      });
    }, SPEEDS[speedIdx].ms);
    return () => clearTimeout(t);
  }, [watching, speedIdx, state, rng]);

  const selectedCell = selected ? state.cells.find((c) => c.id === selected) ?? null : null;
  // 갈 수 있는 칸. 행군력이 모자라거나 합쳐서 상한을 넘으면 후보가 아니다.
  // AI 와 같은 판정을 쓴다 — 규칙이 두 군데에 있으면 반드시 갈라진다.
  /** 내 속국들. 이 목록이 비면 집무실 버튼 자체를 띄우지 않는다. */
  const myVassals = useMemo(() => vassalsOf(state, PLAYER), [state]);
  /** 불이행이 드러나 응징을 기다리는 속국 수 — 버튼에 바로 띄운다 */
  const pendingPunish = useMemo(
    () => myVassals.filter((v) => v.order?.revealed).length,
    [myVassals]
  );

  /**
   * 물어본 길. 실제 이동과 같은 함수로 재므로 여기 뜬 턴 수는 거짓말하지 않는다.
   */
  const preview = useMemo(() => {
    if (!selectedCell || !pathTo || !myTurn) return null;
    const to = state.cells.find((c) => c.id === pathTo);
    if (!to || to.offMap) return null;
    return findPath(
      state,
      selectedCell,
      to,
      DEFAULT_ECONOMY,
      !actedRef.current.has(selectedCell.id)
    );
  }, [state, selectedCell, pathTo, myTurn]);

  /** 3D 판에 넘길 길 — 출발 칸을 앞에 붙인다. 화살표는 칸과 칸 사이를 잇는다. */
  const path3D = useMemo(() => {
    if (!preview || !selectedCell || preview.steps.length === 0) return undefined;
    return [
      { id: selectedCell.id, turn: -1 },
      ...preview.steps.map((s) => ({ id: s.cell.id, turn: s.turn })),
    ];
  }, [preview, selectedCell]);

  /** 길 위의 칸 → 그 칸을 밟는 턴 */
  const pathTurns = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of preview?.steps ?? []) m.set(s.cell.id, s.turn);
    return m;
  }, [preview]);

  /**
   * 키보드. PC 로 낼 것이므로 손이 마우스와 키 사이를 오가지 않아야 한다.
   *
   * 직접 해보니 턴 종료를 연달아 누르는 게 이 게임에서 가장 잦은 동작인데,
   * 부대가 멈춰 자동 선택되면 왼쪽 패널이 늘어나 버튼이 아래로 밀렸다.
   * 다섯 번 눌렀는데 한 턴만 갔다. 자리를 고정하는 것과 별개로, 이런 동작은
   * 애초에 키가 맡아야 한다.
   *
   *   Enter · Space   턴 종료
   *   Esc             고르던 것 물리기 (자리 고르기 → 길 → 선택)
   *   R               징병
   */
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      // 무언가 물어보는 중이면 키는 끈다. 모르고 누른 Enter 가 턴을 넘기면 안 된다.
      const asking = showHelp || !!defenseAsk || !!conquest || !!merchantPick || showVassals;

      if (e.key === 'Escape') {
        if (placing) {
          setPlacing(null);
          setShowVassals(true);
        } else if (pathTo) {
          setPathTo(null);
        } else {
          setSelected(null);
        }
        return;
      }
      if (asking || !myTurn || state.winner !== null) return;

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        endTurn();
      } else if (e.key === 'r' || e.key === 'R') {
        if (readyCastles > 0) {
          setState((prev) => {
            const got = recruit(prev, PLAYER);
            humanRef.current.recruited += got;
            tutRef.current.recruits += got;
            return bump(prev);
          });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    showHelp, defenseAsk, conquest, merchantPick, showVassals,
    placing, pathTo, myTurn, state, readyCastles,
  ]);

  /**
   * 저장. 턴이 바뀔 때마다 조용히 덮어쓴다.
   *
   * 따로 '저장' 단추를 두지 않았다. 21x21 한 판이 예순 턴을 넘기는데 저장을
   * 사람 손에 맡기면 반드시 잊는다. 되돌리기가 있는 게임이 아니라 매 턴이
   * 그대로 이어지는 게임이니, 마지막 판 하나만 붙들고 있으면 된다.
   *
   * 이긴 판은 저장하지 않는다 — 이어하기를 눌렀는데 이미 끝난 판이 열리면
   * 그건 저장이 아니라 고장이다.
   */
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    /*
      시작 화면이 떠 있는 동안은 저장하지 않는다.
      앱을 켜면 기본 판이 먼저 만들어지고, 사람이 '이어하기'를 고르기도 전에
      그 1턴짜리 판이 저장을 덮어쓴다. 실제로 그렇게 5턴짜리 판을 날렸다.
    */
    if (showHelp) return;
    if (state.winner !== null) {
      // 끝난 판을 남겨두면 이어하기가 이미 끝난 판을 연다
      clearSave();
      return;
    }
    const ok = writeSave(
      encodeSave(state, {
        modeIdx,
        sizeIdx,
        diffIdx,
        acted: [...actedRef.current],
        matchId: matchRef.current?.id,
      })
    );
    if (!ok) setSaveFailed(true);
  }, [state.turn, state.winner, showHelp]);

  /** 켤 때 한 번만 본다. 이어할 판이 있으면 시작 화면에서 물어본다. */
  const [resumable] = useState(() => decodeSave(readSave()));

  const resumeSaved = () => {
    // 켤 때 읽어둔 것을 쓴다. 지금 다시 읽으면 그 사이에 덮어써졌을 수 있다.
    const file = resumable;
    if (!file) return;
    setWatching(false);
    setModeIdx(file.meta.modeIdx);
    setSizeIdx(file.meta.sizeIdx);
    setDiffIdx(file.meta.diffIdx);
    actedRef.current = new Set(file.meta.acted);
    setSelected(null);
    setPathTo(null);
    setCombat(null);
    setState(file.state);
    setShowHelp(false);
    /*
      같은 판의 기록에 이어 붙인다. 전에는 여기서 새 기록을 열어, 이어할
      때마다 한 판이 여러 조각으로 쪼개졌다.
      기록이 스무 판 밖으로 밀려났거나 id 가 없는 옛 저장이면 새로 연다.
      그때도 저장의 id 를 그대로 쓴다 — 앞서 내려받은 파일과 id 로 이어진다.
    */
    const found = file.meta.matchId ? findMatch(file.meta.matchId) : null;
    const m =
      found ??
      startMatch(
        file.state,
        file.state.nations[PLAYER]?.name || playerName.trim() || '이름없음',
        DIFFICULTIES[file.meta.diffIdx]?.label ?? '보통',
        file.meta.matchId ?? newMatchId()
      );
    m.resumes = [...(m.resumes ?? []), file.state.turn];
    matchRef.current = m;
    humanRef.current = emptyHumanTurn();
    // 저장 속 로그는 이미 적었거나(이어 붙일 때) 이 기록 앞의 일이다.
    // 표시를 안 해두면 다음 턴에 40줄이 통째로 다시 실린다.
    const log = file.state.log;
    lastLineRef.current = log.length > 0 ? log[log.length - 1] : null;
  };

  const movable = useMemo(() => {
    if (!selectedCell || !myTurn) return new Set<string>();
    const out = new Set<string>();
    for (const n of neighbors(state, selectedCell)) {
      const ok = isHostile(selectedCell, n, state)
        ? canAttackFrom(selectedCell, n)
        : canMoveTo(selectedCell, n);
      if (ok) out.add(n.id);
    }
    return out;
  }, [selectedCell, state, myTurn]);

  // ── 플레이어 조작 ────────────────────────────────────────

  const onCellPress = (cell: Cell) => {
    if (!myTurn) return;

    // 명령할 자리를 고르는 중이면 이동이 아니라 발령이다
    if (placing) {
      issueAt(cell);
      return;
    }

    const merchantHere = state.merchants.find(
      (m) => m.nation === PLAYER && m.phase === 'idle' && m.row === cell.row && m.col === cell.col
    );
    if (!selected && merchantHere) {
      setMerchantPick(merchantHere);
      return;
    }

    if (!selected) {
      if (cell.owner === PLAYER && cell.units > 0 && !cell.neutral) {
        if (cell.fortStage > 0 && cell.fortStage < 4) return;
        if (actedRef.current.has(cell.id)) return; // 이번 턴엔 이미 움직였다
        setSelected(cell.id);
      }
      return;
    }

    if (cell.id === selected) {
      setSelected(null);
      setPathTo(null);
      return;
    }
    // 조약 상대의 칸 — 막혀 있는 까닭을 말해준다. 말없이 안 움직이면 고장으로 보인다.
    if (selectedCell && cell.owner !== null && cell.owner !== PLAYER && !movable.has(cell.id)) {
      const t = treatyOf(state, PLAYER, cell.owner);
      if (t) {
        const who = state.nations[blocOf(state, cell.owner)].name;
        setState((prev) => {
          pushLog(
            prev,
            `${t.kind === 'alliance' ? '🤝' : '🕊'} ${wa(who)} ${t.kind === 'alliance' ? '동맹' : '휴전'} 중 — 치려면 외교에서 조약을 깨야 합니다`
          );
          return bump(prev);
        });
        return;
      }
    }
    if (!movable.has(cell.id) || !selectedCell) {
      /*
        이번 턴엔 못 닿는 곳을 찍었다. 예전에는 그냥 선택이 풀렸는데,
        그러면 "저기까지 몇 턴이지?"에 답할 방법이 없었다. 한 번 찍으면 길과
        걸리는 턴을 보여주고, 같은 곳을 다시 찍으면 그리로 보낸다.
      */
      if (selectedCell && !cell.offMap && cell.id !== selectedCell.id) {
        if (pathTo === cell.id) {
          const plan = findPath(state, selectedCell, cell, DEFAULT_ECONOMY, !actedRef.current.has(selectedCell.id));
          if (plan) {
            setState((prev) => {
              const from = prev.cells.find((c) => c.id === selectedCell.id);
              if (from) from.order = { destId: cell.id, age: 0 };
              tutRef.current.paths++;
              const halted = advanceGotos(prev, actedRef.current, selectedCell.id);
              if (halted.length > 0) haltedRef.current = halted[0];
              return bump(prev);
            });
          }
          setPathTo(null);
          setSelected(null);
          return;
        }
        setPathTo(cell.id);
        return;
      }
      setPathTo(null);
      setSelected(null);
      return;
    }

    setState((prev) => {
      const from = prev.cells.find((c) => c.id === selectedCell.id)!;
      const to = prev.cells.find((c) => c.id === cell.id)!;
      if (isHostile(from, to, prev)) {
        const wasCastle = to.castle;
        const victim = to.owner;
        const outcome = performAttack(prev, from, to, rng);
        setCombat(outcome.result);
        humanRef.current.attacks++;
        tutRef.current.attacks++;
        tutRef.current.moves++;
        if (outcome.capturedCell) humanRef.current.captured++;
        // 이겨서 밀고 들어갔으면 목표 칸에, 아니면 제자리에 남는다
        actedRef.current.add(outcome.capturedCell ? to.id : from.id);

        // 마지막 본진을 빼앗았다면 처분을 플레이어가 고른다
        if (
          wasCastle &&
          outcome.capturedCell &&
          victim !== null &&
          victim !== PLAYER &&
          prev.nations[victim]?.alive &&
          !prev.cells.some((x) => x.castle && x.owner === victim)
        ) {
          setConquest({ victim, castleId: to.id });
        }
      } else if (
        to.units === 0 ||
        (to.owner === PLAYER && !to.neutral)
      ) {
        const prevOwner = to.owner;
        const guest = isGuestLand(prev, PLAYER, prevOwner);
        const fresh = prevOwner === null || blocOf(prev, prevOwner) !== blocOf(prev, PLAYER);
        moveStack(from, to);
        if (guest && prevOwner !== null) {
          // 조약 상대의 땅 — 빼앗지 않고 손님으로 선다. 상대는 안다.
          enterAsGuest(prev, to, prevOwner);
        } else if (fresh) {
          const e = rollEncounter(prev, to, rng);
          if (e) encQueueRef.current.push(e);
        }
        // 손님으로 서 있던 칸을 떠났으면 그 자리에서 주인에게 돌려준다
        settleGuests(prev);
        tutRef.current.moves++;
        // 합류한 경우에도 도착 칸을 소진 처리한다.
        // 아니면 A를 B에 합친 뒤 B를 또 움직여 사실상 두 번 움직이게 된다.
        actedRef.current.add(to.id);
      }
      updateAliveFlags(prev);
      recomputeVision(prev, PLAYER); // 움직였으면 보이는 범위도 바뀐다
      return bump(prev);
    });
    setSelected(null);
  };

  /**
   * 목적지를 받은 내 부대를 한 칸씩 옮긴다.
   *
   * 문명의 이동 명령과 같다 — 먼 곳을 찍어두면 매 턴 알아서 한 칸씩 간다.
   * 안개 너머로도 보낼 수 있다. 길찾기는 못 가본 칸을 '비어 있다'고 치고
   * 긋기 때문에, 가보면 없던 것이 나온다.
   *
   * 그때 멈춘다. 적을 만났거나 길이 막혔으면 목적지를 지우고 그 부대를
   * 골라준다 — 싸울지 돌아갈지는 사람이 정할 일이지, 알아서 밀고 들어갈
   * 일이 아니다. 이게 정찰을 도박으로 만든다.
   *
   * freshId 는 방금 명령을 받은 부대다. 이 부대에게는 '옆에 적이 있으면
   * 출발도 안 한다'를 적용하지 않는다. 판에는 중립 세력이 널려 있어서
   * 그 규칙을 그대로 두면 두 번 눌러도 아무 일이 안 일어나고, 사람 눈에는
   * 버튼이 고장난 것으로 보인다. 방금 사람이 직접 고른 길이니 첫 걸음은 뗀다.
   *
   * 멈춰 세운 부대들의 칸을 돌려준다.
   */
  const advanceGotos = (s: GameState, acted: Set<string>, freshId?: string): string[] => {
    const queued = s.cells
      .filter((c) => c.owner === PLAYER && c.units > 0 && !c.neutral && c.order)
      .map((c) => c.id);
    const halted: string[] = [];

    /**
     * 이 칸 옆에 행군을 멈춰 세울 만한 것이 있는가.
     *
     * 처음엔 '적이 하나라도 옆에 있으면' 으로 뒀다가 직접 해보고 고쳤다.
     * 판에는 중립 세력이 널려 있어서(331칸에 서른 남짓) 그 규칙이면 열한 칸을
     * 가는 동안 예닐곱 번 멈춘다. 도적 떼 셋이 옆에 섰다고 여섯 명짜리 대열이
     * 행군을 접지는 않는다.
     *
     * 그래서 '나를 어떻게 할 수 있는 것'만 센다 — 나라의 군대는 전쟁이니
     * 무조건이고, 중립은 내 힘의 절반은 되어야 걸음을 멈출 값이 된다.
     */
    const foeBeside = (at: Cell) => {
      const mine = cellPower(at, false);
      return neighbors(s, at).some((n) => {
        if (!isVisible(s, PLAYER, n) || !isFoeCell(s, PLAYER, n)) return false;
        if (!n.neutral) return true;
        return cellPower(n, false) >= mine * 0.5;
      });
    };

    for (const id of queued) {
      let c = s.cells.find((x) => x.id === id);
      if (!c || !c.order || c.owner !== PLAYER || c.units <= 0) continue;
      if (acted.has(c.id)) continue; // 이번 턴에 이미 움직였다

      const dest = s.cells.find((x) => x.id === c!.order!.destId);
      if (!dest || dest.id === c.id) {
        c.order = undefined;
        continue;
      }

      // 출발하기 전에 이미 적이 옆에 있으면 여기서부터 사람이 정한다.
      // 다만 방금 받은 명령은 예외다 — 사람이 그걸 보고 고른 것이다.
      if (c.id !== freshId && foeBeside(c)) {
        c.order = undefined;
        halted.push(c.id);
        pushLog(s, '적이 코앞이라 행군을 멈췄습니다');
        continue;
      }

      const next = nextStep(s, c, dest);
      if (!next) continue; // 행군력이 모자라다. 이번 턴은 쉰다.

      // 가려던 칸에 뭔가 있었다 — 안개가 걷히니 드러난 것이다
      if (
        isHostile(c, next, s) ||
        next.units > 0 ||
        !canMoveTo(c, next)
      ) {
        c.order = undefined;
        halted.push(c.id);
        pushLog(s, '가는 길에 무언가 있어 행군을 멈췄습니다');
        continue;
      }

      const prevOwner = next.owner;
      const guest = isGuestLand(s, PLAYER, prevOwner);
      const fresh = prevOwner === null || blocOf(s, prevOwner) !== blocOf(s, PLAYER);
      moveStack(c, next);
      acted.add(next.id);
      c = next;
      if (guest && prevOwner !== null) enterAsGuest(s, next, prevOwner);
      else if (fresh) {
        const e = rollEncounter(s, next, rng);
        if (e) encQueueRef.current.push(e);
      }
      settleGuests(s);
      // 한 칸 갔으니 보이는 범위가 달라진다. 새로 드러난 것을 그 자리에서 본다.
      recomputeVision(s, PLAYER);

      if (c.id === dest.id) {
        c.order = undefined;
        continue;
      }
      if (foeBeside(c)) {
        c.order = undefined;
        halted.push(c.id);
        pushLog(s, '행군 중 적을 발견해 멈췄습니다');
      }
    }
    recomputeVision(s, PLAYER);
    return halted;
  };

  /**
   * 고른 자리로 명령을 내린다.
   *
   * issueOrder 가 null 을 주는 경우가 있고, 그 이유를 플레이어에게 말해줘야
   * 한다. 아무 반응이 없으면 버튼이 고장난 줄 안다.
   */
  const issueAt = (cell: Cell) => {
    const req = placing;
    if (!req) return;
    const v = state.nations[req.vassalId];
    if (!v) return;

    const army = nationStats(state, req.vassalId).units;
    const amount = Math.max(2, Math.min(6, Math.floor(army * 0.35)));
    let issued = false;

    setState((prev) => {
      const out = issueOrder(prev, PLAYER, req.vassalId, req.kind, rng, {
        destId: cell.id,
        amount,
        turns: 10,
      });
      issued = out !== null;
      if (issued) humanRef.current.orders++;
      return bump(prev);
    });

    setPlacing(null);
    setOrderNote(
      issued
        ? v.name + '에게 명령했다 — ' + (req.kind === 'garrison' ? '주둔' : '이동') +
          ' ' + amount + '명. 따를지는 저쪽이 정한다.'
        : v.name + '은(는) 이미 그 자리에 가 있다. 아무것도 바뀌지 않는 명령은 내릴 수 없다.'
    );
    setShowVassals(true);
  };

  /** 자리가 필요 없는 명령 — 공격과 조공 */
  const issuePlain = (vassalId: number, kind: OrderKind, target?: number) => {
    const v = state.nations[vassalId];
    if (!v) return;
    let issued = false;
    setState((prev) => {
      const out = issueOrder(prev, PLAYER, vassalId, kind, rng, {
        target,
        amount: kind === 'tax' ? 0.15 : 3,
        // 조약을 끊는 데는 행군이 필요 없다 — 오래 기다려줄 까닭이 없다
        turns: kind === 'breakTreaty' ? 3 : 12,
      });
      issued = out !== null;
      if (issued) humanRef.current.orders++;
      return bump(prev);
    });
    const foeName = target !== undefined ? state.nations[target]?.name ?? '' : '';
    setOrderNote(
      !issued
        ? v.name + '에게 지금 내릴 수 있는 명령이 아니다.'
        : kind === 'attack'
          ? v.name + '에게 ' + foeName + ' 공격을 명했다. 정말 치는지는 전장을 봐야 안다.'
          : kind === 'breakTreaty'
            ? v.name + '에게 ' + foeName + '와의 조약을 끊으라 했다. 조약은 숨길 수 없으니 곧 안다.'
            : v.name + '에게 조공을 더 걷기로 했다.'
    );
  };

  const doPunish = (vassalId: number, kind: Punishment) => {
    const v = state.nations[vassalId];
    setState((prev) => {
      punishVassal(prev, PLAYER, vassalId, kind);
      updateAliveFlags(prev);
      return bump(prev);
    });
    setOrderNote(
      kind === 'war'
        ? (v?.name ?? '') + '을(를) 토벌한다. 속국 관계는 끝났다.'
        : (v?.name ?? '') + '을(를) 벌했다. 다른 속국들이 지켜보고 있다.'
    );
  };

  /** 한 나라의 턴을 마친 뒤 공통으로 도는 것들 */
  const finishNation = (s: GameState, i: number, moved: Set<string>) => {
    restUnmoved(s, i, moved);
    stepMerchants(s);
    stepNeutrals(s, rng);
    collectTribute(s);
    updateLoyalty(s);
    stepVoluntarySubmission(s, rng);
    updateAliveFlags(s);
    checkBlocVictory(s);
  };

  /** 한 바퀴를 마치고 사람 차례로 돌려놓는다 */
  const finishRound = (s: GameState) => {
    noteMatchTurn(s);
    s.turn++;
    s.current = PLAYER;
    actedRef.current = new Set();
    if (s.nations[PLAYER].alive && s.winner === null) {
      beginTurn(s, PLAYER, rng);
      // 찍어둔 목적지로 한 칸씩. 행군력이 찬 뒤라야 제대로 간다.
      const halted = advanceGotos(s, actedRef.current);
      if (halted.length > 0) haltedRef.current = halted[0];
    }
  };

  /**
   * 이번 원정을 어디로 — 어려운 난이도는 몇 갈래 굴려보고 고른다.
   *
   * 후보는 아는 적 본성 하나하나 + 안개 걷기 + 집 굳히기, 많아야 대여섯이다.
   * 각각 판을 복사해 lookahead 턴 굴려보고 끝난 자리가 제일 좋은 쪽을 고른다.
   * lookahead 가 0 이면 undefined 를 주고, 그러면 예전처럼 pickTarget 이 정한다.
   *
   * 자가대전에서 승률이 1.7~1.8배가 됐다(sim/planner.ts). 실수 확률과 수입
   * 배수가 '덜 똑똑하게'와 '더 부유하게'라면 이것만이 '더 멀리 본다'다.
   */
  const planFor = (s: GameState, id: number, w: typeof LEARNED_WEIGHTS) => {
    if (difficulty.lookahead <= 0) return undefined;
    const cands = planCandidates(s, id, w);
    if (cands.length <= 1) return undefined;
    const ranked = choosePlan(
      s,
      id,
      cands,
      rng,
      (cs, cid, ct) => {
        beginTurn(cs, cid, rng);
        restUnmoved(
          cs,
          cid,
          takeAITurn(cs, cid, w, rng, undefined, undefined, 0, ct).moved
        );
      },
      difficulty.lookahead
    );
    return ranked[0].target;
  };

  /**
   * AI 들을 차례로 돌린다. 사람에게 물어봐야 하면 거기서 멈추고 false 를 준다.
   * 답이 오면 같은 함수를 resume 과 함께 다시 부른다.
   */
  const runAI = (
    s: GameState,
    from: number,
    resume?: { gen: ReturnType<typeof takeAITurnGen>; idx: number },
    answer?: DefenseChoice
  ): boolean => {
    const n = s.nations.length;
    let i = resume ? resume.idx : from;
    let gen = resume?.gen ?? null;

    for (; i < n; i++) {
      if (!s.nations[i].alive || s.winner !== null) {
        gen = null;
        continue;
      }
      if (!gen) {
        s.current = i;
        beginTurn(s, i, rng);
        const w = AI_WEIGHTS[i] ?? PERSONALITIES['균형'];
        gen = takeAITurnGen(
          s,
          i,
          w,
          rng,
          undefined,
          aiPolicy,
          difficulty.noise,
          planFor(s, i, w)
        );
      }
      const step: IteratorResult<DefenseRequest, AITurnLog> = gen.next(answer);
      answer = undefined;
      if (isAsk(step)) {
        pendingRef.current = { gen, idx: i };
        setDefenseAsk(step.value);
        return false;
      }
      /*
        AI 가 무엇을 했는지 남긴다.

        관전 모드(playOneNation)는 이걸 하는데 실제로 플레이하는 길은 안
        했다. 그래서 턴을 넘기면 AI 넷이 무엇을 했는지 알 방법이 없었다 —
        열한 턴을 둬도 사건 표시줄에 '게임 시작' 한 줄뿐이었다.
        판 기록에도 아무것도 안 남아서, 남겨봐야 형세 숫자뿐이었다.
      */
      for (const a of step.value.attacks) {
        const res = a.result;
        const verb =
          res.outcome === 'attacker-win' ? '점령' : res.outcome === 'stalemate' ? '교착' : '격퇴당함';
        pushLog(
          s,
          `${s.nations[i].name}: 공격 ${verb} (${res.rounds.length}R, 생존 ${res.attackerSurvivors})`
        );
      }
      finishNation(s, i, step.value.moved);
      gen = null;
    }
    return true;
  };

  /** 사람이 고른 답을 넣고 멈춘 자리에서 이어 돌린다 */
  const answerDefense = (choice: DefenseChoice) => {
    humanRef.current.defense.push(choice);
    const pending = pendingRef.current;
    setDefenseAsk(null);
    pendingRef.current = null;
    if (!pending) return;
    setState((prev) => {
      if (runAI(prev, pending.idx, pending, choice)) finishRound(prev);
      recomputeVision(prev, PLAYER);
      return bump(prev);
    });
  };

  const endTurn = () => {
    setSelected(null);
    setState((prev) => {
      // 움직인 부대는 쉬지 못한다. 빈 집합을 넘기면 플레이어만 피로가 안 쌓여
      // 사기·피로 모델이 사람 쪽에서만 무력해진다.
      restUnmoved(prev, PLAYER, actedRef.current);
      stepMerchants(prev);
      stepNeutrals(prev, rng);
      collectTribute(prev);
      updateLoyalty(prev);
      stepVoluntarySubmission(prev, rng);
      updateAliveFlags(prev);
      checkBlocVictory(prev);
      prev.current = PLAYER;
      // 사람 차례를 마친 뒤 AI 들을 차례로 돌린다.
      // 사람이 지키는 칸이 공격받으면 여기서 멈추고 물어본다.
      /*
        사람이 늘 먼저 두고 AI 는 1번부터 차례로 둔다.

        동일한 AI 다섯으로 재면 늘 먼저 두는 자리가 5~6%p 이득을 본다
        (sim/seats.ts). 시뮬레이터는 선수를 돌려 그 이점을 지웠지만, 실제
        게임에서는 사람이 먼저 두는 쪽을 남겨뒀다 — 단일 플레이 게임의 흔한
        관례이고, 난이도는 실측 승률로 맞추므로 그 이점은 이미 난이도 곡선에
        녹아 있다.
      */
      if (runAI(prev, 1)) finishRound(prev);
      return bump(prev);
    });
  };

  const stepOnce = () => {
    setState((prev) => {
      playOneNation(prev, rng, aiPolicy, planFor);
      return bump(prev);
    });
  };

  const reset = (idx = modeIdx, sIdx = sizeIdx, dIdx = diffIdx) => {
    // 길잡이 판은 startTutorial 이 표시해 둔 한 번뿐이다. 리셋·모드 바꾸기로
    // 새 판을 열면 길잡이는 끝난다.
    const tut = tutorialNextRef.current;
    tutorialNextRef.current = false;
    tutRef.current = { moves: 0, paths: 0, recruits: 0, attacks: 0 };
    coachBaseRef.current = null;
    setCoach(tut ? 0 : null);
    setCoachDone(false);
    setWatching(false);
    setModeIdx(idx);
    setSizeIdx(sIdx);
    setDiffIdx(dIdx);
    setState(() => {
      const size = SIZES[sIdx];
      const s = createGameState(MODES[idx].nations, size, size, rng);
      applyHandicap(s, DIFFICULTIES[dIdx].incomeMul);
      beginTurn(s, PLAYER, rng);
      beginMatch(s, dIdx, tut);
      // 새 판을 그 자리에서 한 번 적어둔다. 턴이 1 에서 1 로 바뀌지 않아
      // 저장 효과가 안 뜨는 경우가 있다.
      writeSave(
        encodeSave(s, {
          modeIdx: idx,
          sizeIdx: sIdx,
          diffIdx: dIdx,
          acted: [],
          matchId: matchRef.current?.id,
        })
      );
      return s;
    });
    setSelected(null);
    setCombat(null);
    actedRef.current = new Set();
  };

  /** 기록이 열린 채 두는 중인가. 도움말 창의 '시작' 이 새 판인지 계속인지 가른다. */
  const inMatch = matchRef.current !== null && state.winner === null;

  // ── 길잡이 ──────────────────────────────────────────────
  const coachNow: CoachProgress = {
    selected: selected !== null,
    ...tutRef.current,
    turn: state.turn,
  };
  const advanceCoach = () => {
    coachBaseRef.current = { ...coachNow };
    setCoachDone(false);
    setCoach((c) => (c === null ? null : Math.min(c + 1, COACH_STEPS.length - 1)));
  };
  const quitCoach = () => {
    coachBaseRef.current = null;
    setCoachDone(false);
    setCoach(null);
  };
  const coachStep = coach !== null ? COACH_STEPS[coach] : null;
  /** 판 위에서 짚는 칸. 해낸 뒤(풀이 중)에는 짚지 않는다. */
  const coachCell =
    coachStep && !coachDone && myTurn
      ? coachTarget(state, PLAYER, coachStep.target, selected, actedRef.current)
      : null;
  const coachIsReady = coachStep
    ? coachReady(state, PLAYER, coachStep, coachCell, selected)
    : true;
  /** 반짝이게 할 단추 */
  const coachButton =
    coachStep && !coachDone && myTurn && coachIsReady ? coachStep.target : undefined;
  /**
   * 스포트라이트 — 누를 것만 밝히고 나머지는 어둡게.
   *
   * 반짝이는 표지만으로는 3D 판의 깃발·나무·안개 사이에서 눈이 헤맨다.
   * 나머지를 누르지 못하게 막지는 않는다. 막으면 짚을 것이 없는 순간
   * (옆에 적이 없음 등) 판에 갇힌다 — 어둡게만 해서 눈을 끈다.
   */
  const spot: 'cell' | 'button' | 'gold' | null =
    !coachStep || coachDone || !myTurn || !coachIsReady
      ? null
      : coachButton === 'recruit' || coachButton === 'endTurn' || coachButton === 'diplo'
      ? 'button'
      : coachStep.target === 'gold'
      ? 'gold'
      : coachCell
      ? 'cell'
      : null;
  /** 칸 스포트라이트에서 밝게 남길 칸 — 짚은 칸과 고른 부대 */
  const litCells = spot === 'cell' ? [coachCell!, ...(selected ? [selected] : [])] : null;
  /*
    그림이 바뀔 때마다 지금 단계를 해냈는지 본다. 엔진이 상태를 제자리에서
    고치고 bump() 로 다시 그리므로, 셈(tutRef)이 늘면 곧 여기로 온다.
  */
  useEffect(() => {
    if (coach === null) return;
    if (!coachBaseRef.current) {
      coachBaseRef.current = { ...coachNow };
      return;
    }
    if (coachDone) return;
    const st = COACH_STEPS[coach];
    if (st?.done?.(coachNow, coachBaseRef.current)) {
      // 풀이가 있으면 먼저 보여주고, 없으면 바로 다음 과제로
      if (st.after) setCoachDone(true);
      else advanceCoach();
    }
  });

  /**
   * 길잡이 판을 연다 — 1대1 · 가장 작은 판 · 아주 쉬움.
   * 처음 하는 사람이 다섯 나라 난전에 던져지면 무엇이 무엇 때문에 일어났는지
   * 가릴 수 없다. 상대 하나, 좁은 판이면 몇 턴 만에 적과 닿아 '싸우기'
   * 단계까지 간다.
   */
  const startTutorial = () => {
    if (!playerName.trim()) {
      setNameAsk(true);
      return;
    }
    markTutorialSeen();
    tutorialNextRef.current = true;
    reset(0, 0, 0);
    setShowHelp(false);
  };

  // ── 렌더 ────────────────────────────────────────────────

  /**
   * 길을 판 위에 겹쳐 그린다.
   *
   * 칸마다 따로 Svg 를 두는 구조라 칸과 칸 사이에는 아무것도 그릴 수 없다.
   * 그래서 판 전체를 덮는 Svg 를 하나 더 얹는다. 눌리지는 않아야 하므로
   * pointerEvents 는 none 이다.
   */
  const renderPath = (lay: Layout) => {
    if (!preview || !selectedCell || preview.steps.length === 0) return null;
    const cx = (c: Cell) => lay.x(c) + lay.w / 2;
    const cy = (c: Cell) => lay.y(c) + lay.h / 2;

    const pts = [selectedCell, ...preview.steps.map((s) => s.cell)];
    const line = pts.map((c) => `${cx(c)},${cy(c)}`).join(' ');

    // 각 턴의 마지막 칸에만 숫자를 붙인다. 칸마다 붙이면 길이 숫자에 묻힌다.
    const lastOfTurn = new Map<number, Cell>();
    for (const s of preview.steps) lastOfTurn.set(s.turn, s.cell);

    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={lay.width} height={lay.height}>
          <Polyline
            points={line}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={Math.max(2, lay.hex * 0.14)}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
          />
          {pts.slice(1).map((c, i) => {
            // 화살촉 — 앞 칸에서 이 칸으로 향하는 방향
            const prev = pts[i];
            const ang = Math.atan2(cy(c) - cy(prev), cx(c) - cx(prev));
            const r = Math.max(4, lay.hex * 0.3);
            const tipX = cx(c) - Math.cos(ang) * r * 0.2;
            const tipY = cy(c) - Math.sin(ang) * r * 0.2;
            const head = [0, 2.6, -2.6]
              .map((off) => {
                const a = ang + Math.PI + off;
                const d = off === 0 ? 0 : r;
                return `${tipX + Math.cos(a) * d},${tipY + Math.sin(a) * d}`;
              })
              .join(' ');
            return <Polygon key={`h${c.id}`} points={head} fill="#38bdf8" opacity={0.95} />;
          })}
        </Svg>
        {[...lastOfTurn.entries()].map(([turn, c]) => (
          <View
            key={`t${turn}`}
            style={[
              styles.turnBadge,
              { left: cx(c) - 13, top: cy(c) - 10, borderColor: '#38bdf8' },
            ]}
          >
            <Text style={styles.turnBadgeText}>{turn === 0 ? '지금' : `${turn}턴`}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderCell = (cell: Cell, lay: Layout) => {
    if (cell.offMap) return null; // 깎여나간 바깥은 그리지 않는다
    // 관전 중에는 안개를 걷고 전체를 보여준다. 플레이 중에는 내가 아는 만큼만.
    const seen = watching || isVisible(state, PLAYER, cell);
    const known = watching || isExplored(state, PLAYER, cell);
    const mem = known && !seen ? knownCell(state, PLAYER, cell) : null;

    if (!known) {
      /*
        한 번도 못 가본 곳. 예전에는 누를 수 없는 View 였는데, 그러면 안개
        너머로는 부대를 보낼 방법이 아예 없다. 문명처럼 찍어서 보낼 수 있어야
        정찰이 성립한다 — 가봐야 아는 것이니까.
      */
      return (
        <TouchableOpacity
          key={cell.id}
          style={[styles.hex, { left: lay.x(cell), top: lay.y(cell) }]}
          onPress={() => onCellPress(cell)}
          activeOpacity={0.8}
        >
          <Svg width={lay.w} height={lay.h}>
            {/*
              안 가본 칸도 '칸'으로 보여야 한다. 배경(#141414)보다 어둡게 칠하면
              여러 칸이 하나의 검은 덩어리로 뭉쳐서, 판을 키워도 칸이 늘어난 것처럼
              보이지 않는다 — 실제로 그렇게 보였다.
            */}
            <Polygon
              points={lay.points}
              fill={pathTurns.has(cell.id) ? '#24384a' : '#1d1d1f'}
              stroke={pathTurns.has(cell.id) ? '#38bdf8' : '#33333a'}
              strokeWidth={1}
            />
          </Svg>
        </TouchableOpacity>
      );
    }

    const isSel = cell.id === selected;
    const isSpent =
      !watching && cell.owner === PLAYER && cell.units > 0 && actedRef.current.has(cell.id);
    const isActive = cell.owner !== null && cell.owner === state.current && watching;

    // 기억만 있는 칸은 지형과 건물만 안다. 지금 누가 서 있는지는 모른다.
    const shownOwner = seen ? cell.owner : mem?.owner ?? null;
    const shownCastle = seen ? cell.castle : mem?.castle ?? false;
    const shownFort = seen ? cell.fortStage : mem?.fortStage ?? 0;
    const shownTerrain = seen ? cell.terrain : mem?.terrain ?? 'plain';

    let fill = '#2b2b2e';
    if (seen) {
      if (cell.owner !== null) fill = state.nations[cell.owner].color + (cell.units > 0 ? '' : '55');
      if (cell.neutral) fill = NEUTRAL_COLOR[cell.neutral];
    } else {
      // 기억 속의 땅 — 지형만 어렴풋이
      fill =
        shownTerrain === 'mountain'
          ? '#2b2b33'
          : shownTerrain === 'forest'
          ? '#1f2a1f'
          : shownTerrain === 'desert'
          ? '#332e22'
          : '#1e1e1e';
    }
    if (movable.has(cell.id) && !isSel) fill = '#fbbf24';

    let icon = '';
    if (shownCastle) icon = '🏴';
    else if (shownFort === 4) icon = '🏰';
    else if (seen && cell.fortStage > 0) icon = '🏗️';
    else if (seen && cell.neutral === 'bandit') icon = '🦹';
    else if (seen && cell.neutral === 'mercenary') icon = '⚔️';

    const merchant = seen
      ? state.merchants.find((m) => m.row === cell.row && m.col === cell.col)
      : undefined;

    return (
      <TouchableOpacity
        key={cell.id}
        style={[
          styles.hex,
          { left: lay.x(cell), top: lay.y(cell) },
          litCells && !litCells.includes(cell.id) && styles.dim,
        ]}
        onPress={() => onCellPress(cell)}
        activeOpacity={0.8}
      >
        <Svg width={lay.w} height={lay.h}>
          <Polygon
            points={lay.points}
            fill={fill}
            fillOpacity={seen ? 1 : 0.85}
            stroke={
              cell.id === coachCell
                ? '#f472b6'
                : isSel
                ? '#fff'
                : shownCastle
                ? '#fbbf24'
                : shownFort === 4
                ? '#a78bfa'
                : isActive
                ? '#fde68a'
                : seen && cell.hasRoad
                ? '#a16207'
                : 'rgba(255,255,255,0.14)'
            }
            strokeWidth={
              cell.id === coachCell ? 5 : isSel ? 3 : shownCastle ? 3 : shownFort === 4 ? 2.5 : isActive ? 2 : seen && cell.hasRoad ? 2 : 1
            }
          />
        </Svg>
        <View
          style={[styles.hexInner, { width: lay.w, height: lay.h }]}
          pointerEvents="none"
        >
          {icon !== '' && (
            <Text
              style={[
                shownCastle || shownFort === 4 ? styles.hubIcon : styles.icon,
                !seen && styles.faded,
              ]}
            >
              {icon}
            </Text>
          )}
          {merchant && <Text style={styles.merchant}>🚚</Text>}
          {seen && cell.units > 0 && (
            <Text style={[styles.units, isSpent && styles.spent]}>{cell.units}</Text>
          )}
          {/* 기억 속의 주인만 점으로 남긴다 — 지금도 그런지는 모른다 */}
          {!seen && shownOwner !== null && (
            <View
              style={[styles.memoryDot, { backgroundColor: state.nations[shownOwner].color }]}
            />
          )}
          {seen && cell.units > 0 && cell.morale < 60 && <Text style={styles.shaken}>▼</Text>}
          {seen && cell.encircled && <Text style={styles.encircled}>◌</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  const fortCheck = selectedCell ? canBuildFort(state, selectedCell, PLAYER) : null;
  const current = state.nations[state.current];

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          wide && { width: paneW },
          spot !== null && spot !== 'gold' && styles.dim,
          spot === 'gold' && styles.coachGlow,
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>턴 {state.turn}</Text>
          <View style={[styles.turnChip, { backgroundColor: current.color }]}>
            <Text style={styles.turnChipText}>
              {current.name}
              {watching ? ` (${AI_LABELS[state.current]})` : ''}
            </Text>
          </View>
        </View>
        {!watching && (
          <>
            <Text style={styles.gold}>
              💰 {Math.floor(me.gold)}G
              <Text style={ledger.net >= 0 ? styles.plus : styles.minus}>
                {'  '}
                {ledger.net >= 0 ? '+' : ''}
                {ledger.net.toFixed(1)}/턴
              </Text>
            </Text>
            <Text style={styles.breakdown}>
              수입 <Text style={styles.plus}>+{ledger.income.toFixed(1)}</Text>
              {'   '}지출{' '}
              <Text style={styles.minus}>
                -{(ledger.upkeep + ledger.admin).toFixed(1)}
              </Text>
              <Text style={styles.breakdownDim}>
                {' '}
                (군 {ledger.upkeep.toFixed(1)} · 행정 {ledger.admin.toFixed(1)})
              </Text>
            </Text>
            {me.unpaidTurns > 0 && (
              <Text style={styles.arrears}>
                ⚠ 급여 체납 {me.unpaidTurns}/{desertionGrace(me)}턴 — 넘기면 병력이 이탈합니다
                {me.justice > 50 ? ` (정의 ${me.justice}로 유예 연장됨)` : ''}
              </Text>
            )}
          </>
        )}
      </View>

      {coach !== null && !watching && (
        <View style={wide ? { width: paneW } : undefined}>
          <Coach
            step={coach}
            done={coachDone}
            ready={coachIsReady}
            color={state.nations[PLAYER].color}
            onNext={advanceCoach}
            onQuit={quitCoach}
          />
        </View>
      )}

      {/* 관전 조작 — 길잡이 중에는 숨긴다(처음 하는 사람에게는 소음이고, 자리를 먹어
          부대 정보가 아래 단추에 가려졌다) */}
      {coach === null && (
      <View style={styles.watchBar}>
        <TouchableOpacity
          style={[styles.chip, watching ? styles.chipOn : styles.chipOff]}
          onPress={() => setWatching((w) => !w)}
        >
          <Text style={styles.chipText}>{watching ? '⏸ 정지' : '▶ 관전'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.chip, styles.chipOff]} onPress={stepOnce}>
          <Text style={styles.chipText}>▷ 한 수</Text>
        </TouchableOpacity>
        {SPEEDS.map((s, i) => (
          <TouchableOpacity
            key={s.label}
            style={[styles.chip, i === speedIdx ? styles.chipOn : styles.chipOff]}
            onPress={() => setSpeedIdx(i)}
          >
            <Text style={styles.chipText}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      )}

      {/* 수치 표 */}
      {showStats && coach === null && (
        <View style={[styles.table, wide && { width: paneW }]}>
          <View style={styles.trHead}>
            <Text style={[styles.th, styles.colName]}>나라</Text>
            <Text style={styles.th}>영향력</Text>
            <Text style={styles.th}>영토</Text>
            <Text style={styles.th}>병력</Text>
            <Text style={styles.th}>요새</Text>
            <Text style={styles.th}>골드</Text>
            <Text style={styles.th}>수지</Text>
            <Text style={styles.th}>속국</Text>
          </View>
          {state.nations.map((n) => {
            const s = nationStats(state, n.id);
            const l = computeLedger(state, n.id);
            // 안개를 지도에서만 걷어내고 표에서 다 보여주면 의미가 없다.
            // 내 나라와 내 속국은 훤히 알고, 남의 사정은 본 만큼만 안다.
            const open = watching || n.id === PLAYER || n.suzerain === PLAYER;
            // 남의 영토는 '내가 본 적 있는 그들의 땅' 수로 센다
            const seenCells = open
              ? s.cells
              : state.cells.filter((c) => c.owner === n.id && isExplored(state, PLAYER, c)).length;
            const discovered = open || seenCells > 0;
            return (
              <View
                key={n.id}
                style={[styles.tr, n.id === state.current && styles.trActive]}
              >
                <View style={[styles.colName, styles.nameCell]}>
                  <View style={[styles.dot, { backgroundColor: n.color }]} />
                  <Text style={[styles.td, !n.alive && styles.dead]} numberOfLines={1}>
                    {n.suzerain !== null ? '└ ' : ''}
                    {discovered ? n.name : '미발견'}
                    {!n.alive && discovered ? ' ×' : ''}
                    {n.alive && n.id !== PLAYER && relationOf(state, PLAYER, n.id) === 'alliance' ? ' 🤝' : ''}
                    {n.alive && n.id !== PLAYER && relationOf(state, PLAYER, n.id) === 'truce' ? ' 🕊' : ''}
                  </Text>
                </View>
                <Text style={[styles.td, styles.influence]}>
                  {!open ? '?' : n.suzerain === null ? influenceOf(state, n.id).toFixed(0) : '-'}
                </Text>
                <Text style={styles.td}>{open ? s.cells : discovered ? `${seenCells}+` : '?'}</Text>
                <Text style={styles.td}>{open ? s.units : '?'}</Text>
                <Text style={styles.td}>{open ? s.forts : '?'}</Text>
                <Text style={styles.td}>{open ? Math.floor(s.gold) : '?'}</Text>
                <Text style={[styles.td, open && l.net < 0 ? styles.minus : styles.plus]}>
                  {open ? `${l.net >= 0 ? '+' : ''}${l.net.toFixed(0)}` : '?'}
                </Text>
                <Text style={styles.td}>
                  {n.suzerain !== null
                    ? `└충${Math.round(n.loyalty)}`
                    : vassalsOf(state, n.id).length > 0
                    ? `${vassalsOf(state, n.id).length}국`
                    : '-'}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/*
        판은 남은 공간을 꽉 채운다. onLayout 으로 실제로 받은 크기를 재서
        칸 크기를 거기 맞춘다 — 고정 픽셀로 두면 화면마다 잘리거나 남는다.
      */}
      <View
        style={[
          styles.gridWrap,
          wide && styles.gridWide,
          wide && { left: paneW + 8 },
          (spot === 'button' || spot === 'gold') && styles.dim,
        ]}
        onLayout={(e) => {
          // 옆에 둘 때는 판이 절대 위치라 이 값이 위아래 높이를 말해주지 않는다
          if (!wide) setChromeH(Math.max(0, winH - e.nativeEvent.layout.height));
        }}
      >
        {use3D && can3D ? (
          <View style={{ width: boardBox.width, height: boardBox.height }}>
            <Board3D
              state={state}
              player={PLAYER}
              watching={watching}
              selected={selected}
              movable={movable}
              path={path3D}
              hint={coachCell}
              lit={litCells}
              onCellPress={onCellPress}
            />
          </View>
        ) : (
          lay && (
            <View style={{ width: lay.width, height: lay.height }}>
              {state.cells.map((c) => renderCell(c, lay))}
              {renderPath(lay)}
            </View>
          )
        )}
      </View>

      {/* 최근 사건 */}
      <View style={[styles.feed, wide && { width: paneW }, spot !== null && styles.dim]}>
        {state.log.slice(-3).map((l, i) => (
          <Text key={i} style={styles.feedLine} numberOfLines={1}>
            · {l}
          </Text>
        ))}
        {state.log.length === 0 && <Text style={styles.feedLine}>· 게임 시작</Text>}
      </View>

      {selectedCell && (
        <View style={[styles.panel, wide && { width: paneW }, spot !== null && styles.dim]}>
          <Text style={styles.panelTitle}>
            병력 {selectedCell.units} · 사기 {Math.round(selectedCell.morale)} · 피로{' '}
            {Math.round(selectedCell.exhaustion)}
            {selectedCell.driftPP !== 0
              ? ` · 기세 ${selectedCell.driftPP > 0 ? '+' : ''}${selectedCell.driftPP.toFixed(0)}`
              : ''}
            {selectedCell.encircled ? ' · 포위됨' : ''}
          </Text>
          {/*
            행군력은 '얼마나 멀리 갈 수 있나'가 아니라 '지금 갈 수 있나'다.
            병력이 많을수록 한 칸이 비싸지니, 숫자만 보여주면 왜 못 가는지 모른다.
            그래서 실제 비용과 나란히 놓는다.
          */}
          <Text style={styles.panelNote}>
            행군력 {Math.round(selectedCell.march)} · 한 칸{' '}
            {Math.round(marchCost(selectedCell.units, selectedCell))}~
            {Math.round(marchCost(selectedCell.units, selectedCell) * 2)}
            {selectedCell.units >= stackCap() ? ` · 정원 ${stackCap()}명 (합류 불가)` : ''}
            {movable.size === 0 && myTurn ? ' · 이번 턴엔 움직일 수 없다' : ''}
          </Text>
          {/*
            먼 곳을 찍으면 몇 턴 걸리는지 여기에 뜬다. 한 번 더 누르면 보낸다 —
            찍자마자 보내면 길을 물어볼 수가 없다.
          */}
          {preview ? (
            <Text style={styles.pathNote}>
              {preview.steps.length}칸 ·{' '}
              {preview.turns === 0 ? '이번 턴에 도착' : `${preview.turns}턴 후 도착`} — 한 번 더
              누르면 보낸다
            </Text>
          ) : selectedCell.order ? (
            <Text style={styles.pathNote}>
              가는 중 — 목적지 {selectedCell.order.destId}
            </Text>
          ) : null}
          {fortCheck?.ok ? (
            <TouchableOpacity style={[styles.btn, styles.fortBtn]} onPress={buildFortHandler()}>
              <Text style={styles.btnText}>요새 건설 ({DEFAULT_ECONOMY.fortCost}G)</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.hint}>{fortCheck?.reason ?? ''}</Text>
          )}
        </View>
      )}

      {/*
        넓은 화면에서는 단추 줄을 바닥에 못박는다.
        위에 쌓인 것들(기록 줄 수, 부대 패널)의 높이가 바뀌면 단추가 따라
        움직여서, 턴 종료를 연달아 누르다 엉뚱한 것을 누르게 된다. 직접
        해보고 알았다 — 다섯 번 눌렀는데 한 턴만 갔다.
      */}
      <View
        style={[
          styles.footer,
          wide && styles.footerWide,
          wide && { width: paneW },
          (spot === 'cell' || spot === 'gold') && styles.dim,
        ]}
      >
        <View style={styles.row}>
          <TouchableOpacity
            style={[
              styles.btn,
              styles.recruitBtn,
              (!myTurn || readyCastles === 0) && styles.btnDim,
              spot === 'button' && coachButton !== 'recruit' && styles.dim,
              coachButton === 'recruit' && styles.coachGlow,
            ]}
            onPress={() =>
              setState((prev) => {
                const got = recruit(prev, PLAYER);
                humanRef.current.recruited += got;
                tutRef.current.recruits += got;
                return bump(prev);
              })
            }
            disabled={!myTurn || readyCastles === 0}
          >
            <Text style={styles.btnText}>
              {readyCastles > 0
                ? `징병 ${readyCastles}성 (${DEFAULT_ECONOMY.recruitCost * readyCastles}G)`
                : '징병 완료'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.btn,
              styles.endBtn,
              !myTurn && styles.btnDim,
              spot === 'button' && coachButton !== 'endTurn' && styles.dim,
              coachButton === 'endTurn' && styles.coachGlow,
            ]}
            onPress={endTurn}
            disabled={!myTurn}
          >
            <Text style={styles.btnText}>턴 종료</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.resetBtn, spot === 'button' && styles.dim]}
            onPress={() => reset()}
          >
            <Text style={styles.btnText}>리셋</Text>
          </TouchableOpacity>
        </View>
        {/* 외교 — 조약이 있으면 몇 개인지 같이 */}
        <View style={[styles.row, spot === 'button' && coachButton !== 'diplo' && styles.dim]}>
          <TouchableOpacity
            style={[
              styles.btn,
              styles.diploBtn,
              !myTurn && styles.btnDim,
              coachButton === 'diplo' && styles.coachGlow,
            ]}
            onPress={() => {
              setDiploNote(null);
              setShowDiplo(true);
            }}
            disabled={!myTurn}
          >
            <Text style={styles.btnText}>
              외교
              {(state.treaties ?? []).some((t) => t.a === blocOf(state, PLAYER) || t.b === blocOf(state, PLAYER))
                ? ` · 조약 ${(state.treaties ?? []).filter((t) => t.a === blocOf(state, PLAYER) || t.b === blocOf(state, PLAYER)).length}`
                : ''}
            </Text>
          </TouchableOpacity>
        </View>
        {/* 단추 스포트라이트 중에는 그 아래를 통째로 어둡게 */}
        <View style={[styles.footerRest, spot === 'button' && styles.dim]}>
        {myVassals.length > 0 && (
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, styles.vassalBtn, !myTurn && styles.btnDim]}
              onPress={() => {
                setOrderNote(null);
                setShowVassals(true);
              }}
              disabled={!myTurn}
            >
              <Text style={styles.btnText}>
                속국 {myVassals.length}
                {pendingPunish > 0 ? ' · 불이행 ' + pendingPunish : ''}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {/* 판 짜기를 바꾸면 새 판으로 시작한다 */}
        <View style={styles.row}>
          {MODES.map((m, i) => (
            <TouchableOpacity
              key={m.label}
              style={[styles.btn, styles.modeBtn, i !== modeIdx && styles.btnDim]}
              onPress={() => reset(i)}
            >
              <Text style={styles.btnText}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.toggle}>
          난이도 {difficulty.label} · 판 {SIZES[sizeIdx]}x{SIZES[sizeIdx]} ·{' '}
          {tileCount(SIZES[sizeIdx])}칸
        </Text>
        <View style={styles.row}>
          {DIFFICULTIES.map((d, i) => (
            <TouchableOpacity
              key={d.label}
              style={[styles.sizeBtn, i !== diffIdx && styles.btnDim]}
              onPress={() => reset(modeIdx, sizeIdx, i)}
            >
              <Text style={styles.sizeText}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          {SIZES.map((sz, i) => (
            <TouchableOpacity
              key={sz}
              style={[styles.sizeBtn, i !== sizeIdx && styles.btnDim]}
              onPress={() => reset(modeIdx, i)}
            >
              <Text style={styles.sizeText}>{sz}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowStats((v) => !v)}>
            <Text style={styles.toggle}>{showStats ? '수치 숨기기' : '수치 보기'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowHelp(true)}>
            <Text style={styles.toggle}>도움말</Text>
          </TouchableOpacity>
          {can3D && (
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setUse3D((v) => !v)}>
              <Text style={styles.toggle}>{use3D ? '2D 지도' : '중세 3D'}</Text>
            </TouchableOpacity>
          )}
          {Platform.OS === 'web' && (
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => setLogNote(downloadMatches(playerName.trim()) ? '기록을 내려받았습니다' : '아직 남은 기록이 없습니다')}
            >
              <Text style={styles.toggle}>기록 내보내기</Text>
            </TouchableOpacity>
          )}
        </View>
        {logNote && <Text style={styles.toggle}>{logNote}</Text>}
        {Platform.OS === 'web' && (
          <Text style={styles.toggle}>Enter 턴 종료 · R 징병 · Esc 물리기</Text>
        )}
        {saveFailed && (
          <Text style={[styles.toggle, { color: '#fca5a5' }]}>
            저장할 수 없는 창입니다 — 닫으면 판이 사라집니다
          </Text>
        )}
        </View>
      </View>

      {state.winner !== null && (
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>{state.nations[state.winner].name} 승리</Text>
          <Text style={styles.bannerSub}>
            {state.turn}턴 · {state.winReason ?? '승리 조건 달성'}
          </Text>
        </View>
      )}

      <VassalPanel
        visible={showVassals && !placing}
        state={state}
        playerId={PLAYER}
        note={orderNote}
        onClose={() => setShowVassals(false)}
        onPickPlace={(vassalId, kind) => {
          setShowVassals(false);
          setSelected(null);
          setOrderNote(null);
          setPlacing({ vassalId, kind });
        }}
        onOrder={issuePlain}
        onPunish={doPunish}
        onPolicy={(p) =>
          setState((prev) => {
            prev.nations[PLAYER].vassalPolicy = p;
            return bump(prev);
          })
        }
      />

      {/* 자리를 고르는 동안은 지도가 주인공이다. 무엇을 고르는 중인지만 띄운다. */}
      {placing && (
        <View style={styles.placing}>
          <Text style={styles.placingText}>
            {state.nations[placing.vassalId]?.name}에게{' '}
            {placing.kind === 'garrison' ? '진 칠 자리' : '옮겨갈 자리'}를 고르세요
          </Text>
          <TouchableOpacity
            style={styles.placingCancel}
            onPress={() => {
              setPlacing(null);
              setShowVassals(true);
            }}
          >
            <Text style={styles.btnText}>취소</Text>
          </TouchableOpacity>
        </View>
      )}

      <CombatModal result={combat} onClose={() => setCombat(null)} />

      <EncounterCard
        encounter={!combat && !defenseAsk ? encQueueRef.current[0] ?? null : null}
        onPick={(choice) => {
          const e = encQueueRef.current.shift();
          if (!e) return;
          humanRef.current.encounters.push(`${e.kind}:${choice}`);
          setState((prev) => {
            applyEncounter(prev, e, choice);
            return bump(prev);
          });
        }}
      />
      <ProposalCard
        state={state}
        proposal={
          myTurn &&
          !showHelp &&
          !combat &&
          !defenseAsk &&
          !conquest &&
          !showVassals &&
          !showDiplo &&
          encQueueRef.current.length === 0
            ? proposalsFor(state, PLAYER)[0] ?? null
            : null
        }
        onAnswer={(accept) =>
          setState((prev) => {
            const p = proposalsFor(prev, PLAYER)[0];
            if (p) {
              if (p.kind === 'breakOrder') answerBreakOrder(prev, PLAYER, accept);
              else answerProposal(prev, p, accept);
              humanRef.current.diplomacy.push(`${accept ? 'accept' : 'decline'}:${p.kind}:${p.from}`);
            }
            return bump(prev);
          })
        }
      />
      <DiplomacyPanel
        visible={showDiplo}
        state={state}
        playerId={PLAYER}
        note={diploNote}
        onClose={() => setShowDiplo(false)}
        onPropose={(to, kind: TreatyKind) =>
          setState((prev) => {
            const r = propose(prev, PLAYER, to, kind, rng);
            const who = prev.nations[to].name;
            const k = kind === 'truce' ? '휴전' : '동맹';
            setDiploNote(
              r.result === 'accepted'
                ? `${who}이(가) ${k}을 받아들였다.`
                : r.result === 'declined'
                ? `${who}이(가) 거절했다 — "${r.reason}"`
                : r.reason
            );
            humanRef.current.diplomacy.push(`propose:${kind}:${to}:${r.result}`);
            return bump(prev);
          })
        }
        onDissolve={(other) =>
          setState((prev) => {
            if (dissolveAlliance(prev, PLAYER, other)) {
              setDiploNote(`${wa(prev.nations[other].name)}의 동맹을 풀고 휴전으로 돌렸다. 휴전이 끝나면 다시 전쟁이다.`);
              humanRef.current.diplomacy.push(`dissolve:${other}`);
            }
            return bump(prev);
          })
        }
        onBreak={(other) =>
          setState((prev) => {
            const t = treatyOf(prev, PLAYER, other);
            if (breakTreaty(prev, PLAYER, other)) {
              setDiploNote(`${wa(prev.nations[other].name)}의 ${t?.kind === 'alliance' ? '동맹' : '휴전'}을 깼다. 이제 전쟁이다.`);
              humanRef.current.diplomacy.push(`break:${t?.kind}:${other}`);
            }
            return bump(prev);
          })
        }
      />

      {/* 본진 함락 — 병합할까 속국으로 둘까 */}
      <Modal visible={showHelp} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>어떻게 하는 게임인가</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {HELP.map((h) => (
                <View key={h.title} style={styles.helpItem}>
                  <Text style={styles.helpTitle}>{h.title}</Text>
                  <Text style={styles.helpBody}>{h.body}</Text>
                </View>
              ))}
            </ScrollView>
            {/*
              이름을 받는다. 그게 곧 내 나라 이름이 되고, 남는 기록에도 실린다.
              가족들이 각자 두고 기록을 보내주면 그게 누구 판인지 알아야 한다.
            */}
            <Text style={styles.helpTitle}>이름</Text>
            <TextInput
              value={playerName}
              onChangeText={(t) => {
                setPlayerName(t);
                savePlayerName(t.trim());
                if (t.trim()) setNameAsk(false);
              }}
              placeholder="당신"
              placeholderTextColor="#6b7280"
              maxLength={12}
              style={styles.nameInput}
            />
            {nameAsk ? (
              <Text style={[styles.hint, { color: '#f87171' }]}>
                이름을 적어주세요 — 기록을 모았을 때 누구 판인지 가려야 합니다.
              </Text>
            ) : (
              <Text style={styles.hint}>
                이 판의 기록이 남습니다 — 매 턴 나라별 형세와 당신이 한 수가 함께 적힙니다.
              </Text>
            )}

            {/*
              처음 온 사람에게는 길잡이를 맨 위에 크게 권한다. 한 번 본 사람에게는
              작은 글씨로만 — 매번 크게 권하면 귀찮아서 안 읽는다.
            */}
            {firstVisit ? (
              <>
                <TouchableOpacity
                  style={[styles.btn, styles.tutorialBtn, { marginTop: 12 }]}
                  onPress={startTutorial}
                >
                  <Text style={styles.btnText}>처음이에요 — 배우면서 한 판</Text>
                </TouchableOpacity>
                <Text style={styles.hint}>
                  1대1 · 작은 판 · 아주 쉬운 상대와, 한 단계씩 해보며 배웁니다.
                </Text>
              </>
            ) : (
              <TouchableOpacity onPress={startTutorial} style={{ marginTop: 10 }}>
                <Text style={styles.toggle}>길잡이 다시 하기</Text>
              </TouchableOpacity>
            )}

            {/* 두는 중에 연 도움말이면 켤 때 읽어둔 옛 저장을 권하지 않는다 */}
            {resumable && !inMatch && (
              <>
                <TouchableOpacity
                  style={[styles.btn, styles.recruitBtn, { marginTop: 12 }]}
                  onPress={resumeSaved}
                >
                  <Text style={styles.btnText}>이어하기 — {describeSave(resumable)}</Text>
                </TouchableOpacity>
                <Text style={styles.hint}>
                  새로 시작하면 저장해둔 판은 사라집니다.
                </Text>
              </>
            )}
            <TouchableOpacity
              style={[styles.btn, styles.endBtn, { marginTop: 12 }]}
              onPress={() => {
                /*
                  이름 없이는 시작하지 않는다. 비워둔 채 시작하게 두면
                  '이름없음' 이 쌓여 가족 기록을 나눌 수 없다.
                  이어하기는 막지 않는다 — 그 판의 이름은 이미 기록에 있다.
                */
                if (!playerName.trim()) {
                  setNameAsk(true);
                  return;
                }
                /*
                  두던 중에 '도움말' 로 연 것이면 창만 닫는다. 전에는 여기서도
                  기록을 새로 열어, 판은 그대로인데 기록만 두 조각이 났다.
                */
                if (inMatch) {
                  setShowHelp(false);
                  return;
                }
                setState((prev) => {
                  beginMatch(prev, diffIdx);
                  return bump(prev);
                });
                setShowHelp(false);
              }}
            >
              <Text style={styles.btnText}>
                {inMatch ? '계속하기' : resumable ? '새로 시작' : '시작'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 내 부대가 공격받는 중 — 맞설까, 물러날까, 항복할까 */}
      <Modal visible={!!defenseAsk} transparent animationType="fade">
        <View style={styles.overlay}>
          {defenseAsk && (
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>⚔️ 공격받는 중</Text>
              <Text style={styles.hint}>
                적 {defenseAsk.attackerUnits}명이 내 {defenseAsk.defenderUnits}명을 친다 · 전력비{' '}
                {(defenseAsk.myPower / Math.max(0.001, defenseAsk.theirPower)).toFixed(2)}
              </Text>

              <TouchableOpacity
                style={[styles.btn, styles.endBtn, { marginTop: 12 }]}
                onPress={() => answerDefense('fight')}
              >
                <Text style={styles.btnText}>맞서 싸운다</Text>
              </TouchableOpacity>
              <Text style={styles.helpBody}>
                사기가 꺾이는 쪽이 무너진다. 지형과 요새, 옆에 붙은 아군이 거든다.
              </Text>

              {defenseAsk.options.includes('retreat') && (
                <>
                  <TouchableOpacity
                    style={[styles.btn, styles.modeBtn, { marginTop: 10 }]}
                    onPress={() => answerDefense('retreat')}
                  >
                    <Text style={styles.btnText}>물러난다</Text>
                  </TouchableOpacity>
                  <Text style={styles.helpBody}>
                    칸은 내주지만 병력의 일부가 옆으로 빠진다. 연달아 물러날수록 더 많이 잃는다.
                  </Text>
                </>
              )}

              {defenseAsk.options.includes('surrender') && (
                <>
                  <TouchableOpacity
                    style={[styles.btn, styles.resetBtn, { marginTop: 10 }]}
                    onPress={() => answerDefense('surrender')}
                  >
                    <Text style={styles.btnText}>항복한다</Text>
                  </TouchableOpacity>
                  <Text style={styles.helpBody}>
                    포로의 운명은 상대의 평판이 정한다 — 공포가 높으면 처형하고, 정의가 높으면
                    자기 군대로 받아들인다.
                  </Text>
                </>
              )}
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={!!conquest} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            {conquest && (
              <>
                <Text style={styles.modalTitle}>
                  🏴 {state.nations[conquest.victim].name}의 본진 함락
                </Text>
                <Text style={styles.hint}>
                  {(() => {
                    const rec = chooseVassalOrAnnex(state, PLAYER, conquest.victim);
                    const theirs = computeLedger(state, conquest.victim);
                    return `상대 영토 ${theirs.cells}칸 · 순수입 ${theirs.net.toFixed(
                      0
                    )}/턴 — 계산상 유리한 쪽: ${rec === 'annex' ? '병합' : '속국화'}`;
                  })()}
                </Text>

                <TouchableOpacity
                  style={[styles.btn, styles.resetBtn, { marginTop: 12 }]}
                  onPress={() => {
                    setState((prev) => {
                      const castle = prev.cells.find((c) => c.id === conquest.castleId)!;
                      resolveCastleLoss(prev, conquest.victim, PLAYER, 'annex', castle);
                      updateAliveFlags(prev);
                      checkBlocVictory(prev);
                      return bump(prev);
                    });
                    setConquest(null);
                  }}
                >
                  <Text style={styles.btnText}>병합 — 땅을 전부 차지한다</Text>
                </TouchableOpacity>
                <Text style={styles.hint}>영토가 늘지만 행정비가 가팔라진다</Text>

                <TouchableOpacity
                  style={[styles.btn, styles.recruitBtn, { marginTop: 10 }]}
                  onPress={() => {
                    setState((prev) => {
                      const castle = prev.cells.find((c) => c.id === conquest.castleId)!;
                      resolveCastleLoss(prev, conquest.victim, PLAYER, 'vassalize', castle);
                      vassalize(prev, PLAYER, conquest.victim, 'conquest');
                      updateAliveFlags(prev);
                      checkBlocVictory(prev);
                      return bump(prev);
                    });
                    setConquest(null);
                  }}
                >
                  <Text style={styles.btnText}>속국으로 둔다 — 조공을 받는다</Text>
                </TouchableOpacity>
                <Text style={styles.hint}>
                  행정비 없이 조공만 받는다. 대신 충성도가 떨어지면 반란을 일으킨다.
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!merchantPick} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>무역 목적지</Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {merchantPick &&
                merchantDestinations(state)
                  .filter((d) => !(d.row === merchantPick.row && d.col === merchantPick.col))
                  .map((d) => {
                    const p = expectedTradeProfit(state, merchantPick, d);
                    const ownerName = d.owner === null ? '중립' : state.nations[d.owner].name;
                    return (
                      <TouchableOpacity
                        key={d.id}
                        style={styles.destRow}
                        onPress={() => {
                          setState((prev) => {
                            const m = prev.merchants.find((x) => x.id === merchantPick.id);
                            const dest = prev.cells.find((c) => c.id === d.id);
                            if (m && dest) sendMerchant(prev, m, dest);
                            return bump(prev);
                          });
                          setMerchantPick(null);
                        }}
                      >
                        <Text style={styles.destName}>
                          {ownerName}의 {d.castle ? '본진' : '요새'} ({d.row},{d.col})
                        </Text>
                        <Text style={styles.destInfo}>
                          거리 {p.distance} · 총 {p.gross}G
                          {p.tax > 0 ? ` · 관세 -${p.tax}G` : ''} · 순이익{' '}
                          <Text style={styles.plus}>+{p.net}G</Text>
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.btn, styles.endBtn]}
              onPress={() => setMerchantPick(null)}
            >
              <Text style={styles.btnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );

  function buildFortHandler() {
    return () => {
      if (!selectedCell) return;
      setState((prev) => {
        const c = prev.cells.find((x) => x.id === selectedCell.id)!;
        if (startFort(prev, c, PLAYER)) actedRef.current.add(c.id); // 수비대로 묶인다
        return bump(prev);
      });
      setSelected(null);
    };
  }
}

/** 전투 연출 — 개입 없이 라운드별 전개를 보여준다 */
function CombatModal({
  result,
  onClose,
}: {
  result: DetailedCombatResult | null;
  onClose: () => void;
}) {
  if (!result) return null;
  const win = result.outcome === 'attacker-win';
  const headline =
    result.outcome === 'stalemate' ? '교착 — 밀어내지 못했다' : win ? '승리' : '패배 — 물러났다';

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>⚔️ {headline}</Text>
          {result.attackerResolvePP > 0 && (
            <Text style={styles.resolve}>
              열세 결사항전 +{result.attackerResolvePP.toFixed(0)}%p
            </Text>
          )}
          {(result.attackerSupport > 0 || result.defenderSupport > 0) && (
            <Text style={styles.resolve}>
              협공 — 아군 +{result.attackerSupport.toFixed(1)} · 적군 +
              {result.defenderSupport.toFixed(1)}
            </Text>
          )}
          <ScrollView style={{ maxHeight: 300 }}>
            {result.rounds.map((r) => (
              <View key={r.round} style={styles.roundRow}>
                <Text style={styles.roundNo}>{r.round}R</Text>
                <Text style={styles.roundBody}>
                  피해 {r.attackerLosses} : {r.defenderLosses} · 사기 {r.attackerMorale} :{' '}
                  {r.defenderMorale}
                  {r.notes.length > 0 ? `\n   ${r.notes.join(' / ')}` : ''}
                </Text>
              </View>
            ))}
          </ScrollView>
          <Text style={styles.summary}>
            {result.reason === 'rout'
              ? '사기가 꺾여 붕괴했다'
              : result.reason === 'annihilation'
              ? '전멸했다'
              : '양측 모두 버텼다'}
            {' · '}생존 {result.attackerSurvivors} vs {result.defenderSurvivors}
          </Text>
          <TouchableOpacity style={[styles.btn, styles.endBtn]} onPress={onClose}>
            <Text style={styles.btnText}>확인</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414' },
  header: { paddingTop: 40, paddingHorizontal: 14, paddingBottom: 6, backgroundColor: '#1f1f1f' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  turnChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  turnChipText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  gold: { color: '#fbbf24', fontSize: 14, fontWeight: 'bold', marginTop: 3 },
  plus: { color: '#34d399' },
  minus: { color: '#f87171' },
  breakdown: { color: '#cbd5e1', fontSize: 11, marginTop: 2 },
  breakdownDim: { color: '#6b7280', fontSize: 10 },
  arrears: { color: '#fbbf24', fontSize: 11, marginTop: 3, fontWeight: 'bold' },

  watchBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  chipOn: { backgroundColor: '#3b82f6' },
  chipOff: { backgroundColor: '#374151' },
  chipText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  table: { marginHorizontal: 12, backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 4 },
  trHead: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 3 },
  tr: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  trActive: { backgroundColor: 'rgba(251,191,36,0.13)' },
  th: { flex: 1, color: '#6b7280', fontSize: 10, textAlign: 'right' },
  td: { flex: 1, color: '#e5e7eb', fontSize: 11, textAlign: 'right' },
  colName: { flex: 2.2, textAlign: 'left' },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dead: { color: '#6b7280', textDecorationLine: 'line-through' },
  influence: { color: '#fbbf24', fontWeight: 'bold' },

  // minHeight 0 이 없으면 flex 항목이 자기 내용보다 작아지지 않는다. 판이
  // 남은 공간을 먹고 아래 버튼을 화면 밖으로 밀어낸다.
  // 넓은 화면: 왼쪽 정보 칸을 비워두고 나머지를 판이 차지한다
  sizeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#475569',
  },
  sizeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  gridWide: { position: 'absolute', top: 8, right: 8, bottom: 8, marginTop: 0 },
  gridWrap: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hex: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  hexInner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { position: 'absolute', top: 3, right: 3, fontSize: 11 },
  // 본진·요새는 한눈에 들어와야 한다. 구석의 11px 그림으로는 안 보인다.
  hubIcon: { position: 'absolute', top: -1, fontSize: 17 },
  merchant: { position: 'absolute', bottom: 3, left: 3, fontSize: 11 },
  units: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  /** 이번 턴에 이미 움직인 부대 */
  spent: { color: 'rgba(255,255,255,0.4)' },
  /** 기억 속의 정보 — 지금도 그런지는 모른다 */
  faded: { opacity: 0.35 },
  memoryDot: { width: 5, height: 5, borderRadius: 3, opacity: 0.45 },
  shaken: { position: 'absolute', bottom: 2, right: 5, color: '#fca5a5', fontSize: 9 },
  encircled: { position: 'absolute', top: 3, left: 4, color: '#fde68a', fontSize: 10 },

  // 늘 세 줄 자리를 잡아둔다. 기록이 늘 때마다 아래가 밀리면 안 된다.
  feed: { paddingHorizontal: 14, paddingVertical: 2, height: 51 },
  feedLine: { color: '#9ca3af', fontSize: 11, lineHeight: 15 },

  panel: {
    backgroundColor: '#1f1f1f',
    marginHorizontal: 12,
    borderRadius: 8,
    padding: 10,
    overflow: 'hidden',
  },
  panelTitle: { color: '#e5e7eb', fontSize: 12, marginBottom: 6 },
  panelNote: { color: '#9ca3af', fontSize: 11, marginBottom: 6 },
  hint: { color: '#9ca3af', fontSize: 11, fontStyle: 'italic' },
  nameInput: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 6,
    marginBottom: 6,
  },
  turnBadge: {
    position: 'absolute',
    backgroundColor: 'rgba(8,20,30,0.92)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  turnBadgeText: { color: '#bae6fd', fontSize: 10, fontWeight: 'bold' },
  pathNote: { color: '#7dd3fc', fontSize: 11, marginBottom: 6 },

  footer: { backgroundColor: '#1f1f1f', padding: 10, gap: 6 },
  footerWide: { position: 'absolute', left: 0, bottom: 0 },
  row: { flexDirection: 'row', gap: 6 },
  btn: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: 'center' },
  btnDim: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  endBtn: { backgroundColor: '#3b82f6' },
  tutorialBtn: { backgroundColor: '#b45309' },
  diploBtn: { backgroundColor: '#7c3aed' },
  /** 스포트라이트 밖 */
  dim: { opacity: 0.22 },
  footerRest: { gap: 6 },
  /** 길잡이가 '이걸 누르세요' 하고 짚는 단추 */
  coachGlow: {
    borderWidth: 3,
    borderColor: '#f472b6',
    shadowColor: '#f472b6',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  resetBtn: { backgroundColor: '#ef4444' },
  modeBtn: { backgroundColor: '#475569' },
  vassalBtn: { backgroundColor: '#7c3aed' },
  recruitBtn: { backgroundColor: '#059669' },
  fortBtn: { backgroundColor: '#a16207' },
  toggle: { color: '#6b7280', fontSize: 11, textAlign: 'center' },

  banner: {
    position: 'absolute',
    top: '42%',
    left: 24,
    right: 24,
    backgroundColor: 'rgba(0,0,0,0.88)',
    padding: 20,
    borderRadius: 12,
  },
  /*
    고르는 중이라는 표시. 처음엔 화면 전체를 가로지르게 했더니 턴 수와 국고를
    덮어서, 명령 하나 내리려다 판을 못 보게 됐다. 지도 위에만 얹는다.
  */
  placing: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(124,58,237,0.96)',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  placingText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  placingCancel: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  bannerText: { color: '#fbbf24', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  bannerSub: { color: '#9ca3af', fontSize: 13, textAlign: 'center', marginTop: 4 },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: { backgroundColor: '#1f1f1f', borderRadius: 12, padding: 18, width: '88%' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  helpItem: { marginBottom: 12 },
  helpTitle: { color: '#fbbf24', fontSize: 13, fontWeight: 'bold', marginBottom: 3 },
  helpBody: { color: '#d1d5db', fontSize: 12, lineHeight: 18 },
  resolve: { color: '#fbbf24', fontSize: 12, marginBottom: 8 },
  roundRow: { flexDirection: 'row', marginBottom: 6 },
  roundNo: { color: '#fbbf24', fontSize: 12, width: 34, fontWeight: 'bold' },
  roundBody: { color: '#d1d5db', fontSize: 12, flex: 1 },
  summary: { color: '#9ca3af', fontSize: 12, marginVertical: 10 },
  destRow: { backgroundColor: '#141414', borderRadius: 8, padding: 12, marginBottom: 8 },
  destName: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  destInfo: { color: '#9ca3af', fontSize: 12, marginTop: 4 },
});
