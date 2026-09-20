import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  useWindowDimensions,
} from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
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
  knownCell,
} from '../engine';
import {
  takeAITurn,
  PERSONALITIES,
  LEARNED_WEIGHTS,
  AIWeights,
  chooseVassalOrAnnex,
} from '../engine/ai';

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
  { label: '1대1', nations: 2, size: 11 },
  { label: '5인 난전', nations: 5, size: 11 },
] as const;

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
    body: '영향력(내 땅 + 속국의 땅)이 압도적으로 커지면 이긴다. 적의 마지막 성을 빼앗으면 그 나라를 병합할지 속국으로 둘지 고른다. 속국은 조공을 바치고, 행정비는 그쪽이 낸다 — 넓어질수록 직접 먹는 것보다 부리는 쪽이 이득이다.',
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
function playOneNation(s: GameState, rng: RNG): void {
  if (s.winner !== null) return;
  const id = s.current;
  const nation = s.nations[id];

  if (nation.alive) {
    beginTurn(s, id, rng);
    const log = takeAITurn(s, id, AI_WEIGHTS[id] ?? PERSONALITIES['균형'], rng);
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

  const [state, setState] = useState<GameState>(() => {
    const s = createGameState(MODES[0].nations, MODES[0].size, MODES[0].size, rng);
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
  /** 마지막 본진을 빼앗았을 때의 처분 선택 */
  const [conquest, setConquest] = useState<{ victim: number; castleId: string } | null>(null);
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
        playOneNation(prev, rng);
        return bump(prev);
      });
    }, SPEEDS[speedIdx].ms);
    return () => clearTimeout(t);
  }, [watching, speedIdx, state, rng]);

  const selectedCell = selected ? state.cells.find((c) => c.id === selected) ?? null : null;
  // 갈 수 있는 칸. 행군력이 모자라거나 합쳐서 상한을 넘으면 후보가 아니다.
  // AI 와 같은 판정을 쓴다 — 규칙이 두 군데에 있으면 반드시 갈라진다.
  const movable = useMemo(() => {
    if (!selectedCell || !myTurn) return new Set<string>();
    const out = new Set<string>();
    for (const n of neighbors(state, selectedCell)) {
      const ok = isHostile(selectedCell, n)
        ? canAttackFrom(selectedCell, n)
        : canMoveTo(selectedCell, n);
      if (ok) out.add(n.id);
    }
    return out;
  }, [selectedCell, state, myTurn]);

  // ── 플레이어 조작 ────────────────────────────────────────

  const onCellPress = (cell: Cell) => {
    if (!myTurn) return;

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
      return;
    }
    if (!movable.has(cell.id) || !selectedCell) {
      setSelected(null);
      return;
    }

    setState((prev) => {
      const from = prev.cells.find((c) => c.id === selectedCell.id)!;
      const to = prev.cells.find((c) => c.id === cell.id)!;
      if (isHostile(from, to)) {
        const wasCastle = to.castle;
        const victim = to.owner;
        const outcome = performAttack(prev, from, to, rng);
        setCombat(outcome.result);
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
      } else if (to.units === 0 || (to.owner === PLAYER && !to.neutral)) {
        moveStack(from, to);
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
      // 사람 차례를 마친 뒤 AI 들을 차례로 돌린다
      const n = prev.nations.length;
      for (let i = 1; i < n; i++) {
        prev.current = i;
        if (prev.nations[i].alive && prev.winner === null) {
          beginTurn(prev, i, rng);
          const log = takeAITurn(prev, i, AI_WEIGHTS[i] ?? PERSONALITIES['균형'], rng);
          restUnmoved(prev, i, log.moved);
          stepMerchants(prev);
          stepNeutrals(prev, rng);
          collectTribute(prev);
          updateLoyalty(prev);
          stepVoluntarySubmission(prev, rng);
          updateAliveFlags(prev);
          checkBlocVictory(prev);
        }
      }
      prev.turn++;
      prev.current = PLAYER;
      if (prev.nations[PLAYER].alive && prev.winner === null) beginTurn(prev, PLAYER, rng);
      actedRef.current = new Set();
      return bump(prev);
    });
  };

  const stepOnce = () => {
    setState((prev) => {
      playOneNation(prev, rng);
      return bump(prev);
    });
  };

  const reset = (idx = modeIdx) => {
    setWatching(false);
    setModeIdx(idx);
    setState(() => {
      const s = createGameState(MODES[idx].nations, MODES[idx].size, MODES[idx].size, rng);
      beginTurn(s, PLAYER, rng);
      return s;
    });
    setSelected(null);
    setCombat(null);
    actedRef.current = new Set();
  };

  // ── 렌더 ────────────────────────────────────────────────

  const renderCell = (cell: Cell, lay: Layout) => {
    if (cell.offMap) return null; // 깎여나간 바깥은 그리지 않는다
    // 관전 중에는 안개를 걷고 전체를 보여준다. 플레이 중에는 내가 아는 만큼만.
    const seen = watching || isVisible(state, PLAYER, cell);
    const known = watching || isExplored(state, PLAYER, cell);
    const mem = known && !seen ? knownCell(state, PLAYER, cell) : null;

    if (!known) {
      // 한 번도 못 가본 곳 — 지형조차 모른다
      return (
        <View key={cell.id} style={[styles.hex, { left: lay.x(cell), top: lay.y(cell) }]}>
          <Svg width={lay.w} height={lay.h}>
            <Polygon points={lay.points} fill="#0c0c0c" stroke="#161616" strokeWidth={0.5} />
          </Svg>
        </View>
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

    let fill = '#242424';
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
        style={[styles.hex, { left: lay.x(cell), top: lay.y(cell) }]}
        onPress={() => onCellPress(cell)}
        activeOpacity={0.8}
      >
        <Svg width={lay.w} height={lay.h}>
          <Polygon
            points={lay.points}
            fill={fill}
            fillOpacity={seen ? 1 : 0.85}
            stroke={
              isSel
                ? '#fff'
                : isActive
                ? '#fde68a'
                : seen && cell.hasRoad
                ? '#a16207'
                : 'rgba(0,0,0,0.35)'
            }
            strokeWidth={isSel ? 3 : isActive ? 2 : seen && cell.hasRoad ? 2 : 0.5}
          />
        </Svg>
        <View
          style={[styles.hexInner, { width: lay.w, height: lay.h }]}
          pointerEvents="none"
        >
          {icon !== '' && <Text style={[styles.icon, !seen && styles.faded]}>{icon}</Text>}
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
      <View style={[styles.header, wide && { width: paneW }]}>
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

      {/* 관전 조작 */}
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

      {/* 수치 표 */}
      {showStats && (
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
        style={[styles.gridWrap, wide && styles.gridWide, wide && { left: paneW + 8 }]}
        onLayout={(e) => {
          // 옆에 둘 때는 판이 절대 위치라 이 값이 위아래 높이를 말해주지 않는다
          if (!wide) setChromeH(Math.max(0, winH - e.nativeEvent.layout.height));
        }}
      >
        {lay && (
          <View style={{ width: lay.width, height: lay.height }}>
            {state.cells.map((c) => renderCell(c, lay))}
          </View>
        )}
      </View>

      {/* 최근 사건 */}
      <View style={[styles.feed, wide && { width: paneW }]}>
        {state.log.slice(-3).map((l, i) => (
          <Text key={i} style={styles.feedLine} numberOfLines={1}>
            · {l}
          </Text>
        ))}
        {state.log.length === 0 && <Text style={styles.feedLine}>· 게임 시작</Text>}
      </View>

      {selectedCell && (
        <View style={[styles.panel, wide && { width: paneW }]}>
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
          {fortCheck?.ok ? (
            <TouchableOpacity style={[styles.btn, styles.fortBtn]} onPress={buildFortHandler()}>
              <Text style={styles.btnText}>요새 건설 ({DEFAULT_ECONOMY.fortCost}G)</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.hint}>{fortCheck?.reason ?? ''}</Text>
          )}
        </View>
      )}

      <View style={[styles.footer, wide && { width: paneW }]}>
        <View style={styles.row}>
          <TouchableOpacity
            style={[
              styles.btn,
              styles.recruitBtn,
              (!myTurn || readyCastles === 0) && styles.btnDim,
            ]}
            onPress={() =>
              setState((prev) => {
                recruit(prev, PLAYER);
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
            style={[styles.btn, styles.endBtn, !myTurn && styles.btnDim]}
            onPress={endTurn}
            disabled={!myTurn}
          >
            <Text style={styles.btnText}>턴 종료</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.resetBtn]} onPress={() => reset()}>
            <Text style={styles.btnText}>리셋</Text>
          </TouchableOpacity>
        </View>
        {/* 판 짜기를 바꾸면 새 판으로 시작한다 */}
        <View style={styles.row}>
          {MODES.map((m, i) => (
            <TouchableOpacity
              key={m.label}
              style={[styles.btn, styles.modeBtn, i !== modeIdx && styles.btnDim]}
              onPress={() => reset(i)}
            >
              <Text style={styles.btnText}>
                {m.label} ({m.size}x{m.size})
              </Text>
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
        </View>
      </View>

      {state.winner !== null && (
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>{state.nations[state.winner].name} 승리</Text>
          <Text style={styles.bannerSub}>{state.turn}턴</Text>
        </View>
      )}

      <CombatModal result={combat} onClose={() => setCombat(null)} />

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
            <TouchableOpacity
              style={[styles.btn, styles.endBtn, { marginTop: 12 }]}
              onPress={() => setShowHelp(false)}
            >
              <Text style={styles.btnText}>시작</Text>
            </TouchableOpacity>
          </View>
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
  merchant: { position: 'absolute', bottom: 3, left: 3, fontSize: 11 },
  units: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  /** 이번 턴에 이미 움직인 부대 */
  spent: { color: 'rgba(255,255,255,0.4)' },
  /** 기억 속의 정보 — 지금도 그런지는 모른다 */
  faded: { opacity: 0.35 },
  memoryDot: { width: 5, height: 5, borderRadius: 3, opacity: 0.45 },
  shaken: { position: 'absolute', bottom: 2, right: 5, color: '#fca5a5', fontSize: 9 },
  encircled: { position: 'absolute', top: 3, left: 4, color: '#fde68a', fontSize: 10 },

  feed: { paddingHorizontal: 14, paddingVertical: 2, minHeight: 20 },
  feedLine: { color: '#9ca3af', fontSize: 11, lineHeight: 15 },

  panel: { backgroundColor: '#1f1f1f', marginHorizontal: 12, borderRadius: 8, padding: 10 },
  panelTitle: { color: '#e5e7eb', fontSize: 12, marginBottom: 6 },
  panelNote: { color: '#9ca3af', fontSize: 11, marginBottom: 6 },
  hint: { color: '#9ca3af', fontSize: 11, fontStyle: 'italic' },

  footer: { backgroundColor: '#1f1f1f', padding: 10, gap: 6 },
  row: { flexDirection: 'row', gap: 6 },
  btn: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: 'center' },
  btnDim: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  endBtn: { backgroundColor: '#3b82f6' },
  resetBtn: { backgroundColor: '#ef4444' },
  modeBtn: { backgroundColor: '#475569' },
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
