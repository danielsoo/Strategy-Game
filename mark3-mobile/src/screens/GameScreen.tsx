import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
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
  collectTribute,
  updateLoyalty,
  stepVoluntarySubmission,
  checkBlocVictory,
  vassalsOf,
  vassalize,
  resolveCastleLoss,
  influenceOf,
} from '../engine';
import {
  takeAITurn,
  PERSONALITIES,
  LEARNED_WEIGHTS,
  AIWeights,
  chooseVassalOrAnnex,
} from '../engine/ai';

const ROWS = 11;
const COLS = 11;
const NATIONS = 5;
const PLAYER = 0;

/** 나라별 AI 성격. 0번 자리는 사람이 둘 때는 쓰이지 않고, 관전 모드에서만 쓰인다. */
const AI_WEIGHTS: AIWeights[] = [
  LEARNED_WEIGHTS,
  PERSONALITIES['공격형'],
  PERSONALITIES['확장형'],
  PERSONALITIES['수비형'],
  PERSONALITIES['집중형'],
];
const AI_LABELS = ['학습된 AI', '공격형', '확장형', '수비형', '집중형'];

const HEX = 26;
const HEX_W = Math.sqrt(3) * HEX;
const HEX_H = HEX * 2;

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

  const [state, setState] = useState<GameState>(() => {
    const s = createGameState(NATIONS, ROWS, COLS, rng);
    beginTurn(s, PLAYER, rng);
    return s;
  });
  const [watching, setWatching] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [combat, setCombat] = useState<DetailedCombatResult | null>(null);
  const [merchantPick, setMerchantPick] = useState<Merchant | null>(null);
  const [showStats, setShowStats] = useState(true);
  /** 마지막 본진을 빼앗았을 때의 처분 선택 */
  const [conquest, setConquest] = useState<{ victim: number; castleId: string } | null>(null);

  const me = state.nations[PLAYER];
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
  const movable = useMemo(() => {
    if (!selectedCell || !myTurn) return new Set<string>();
    return new Set(neighbors(state, selectedCell).map((n) => n.id));
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
      }
      updateAliveFlags(prev);
      return bump(prev);
    });
    setSelected(null);
  };

  const endTurn = () => {
    setSelected(null);
    setState((prev) => {
      restUnmoved(prev, PLAYER, new Set());
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
      return bump(prev);
    });
  };

  const stepOnce = () => {
    setState((prev) => {
      playOneNation(prev, rng);
      return bump(prev);
    });
  };

  const reset = () => {
    setWatching(false);
    setState(() => {
      const s = createGameState(NATIONS, ROWS, COLS, rng);
      beginTurn(s, PLAYER, rng);
      return s;
    });
    setSelected(null);
    setCombat(null);
  };

  // ── 렌더 ────────────────────────────────────────────────

  const renderCell = (cell: Cell) => {
    let fill = '#242424';
    if (cell.owner !== null) fill = state.nations[cell.owner].color + (cell.units > 0 ? '' : '55');
    if (cell.neutral) fill = NEUTRAL_COLOR[cell.neutral];

    const isSel = cell.id === selected;
    const isActive = cell.owner !== null && cell.owner === state.current && watching;
    if (movable.has(cell.id) && !isSel) fill = '#fbbf24';

    let icon = '';
    if (cell.castle) icon = '🏴';
    else if (cell.fortStage === 4) icon = '🏰';
    else if (cell.fortStage > 0) icon = '🏗️';
    else if (cell.neutral === 'bandit') icon = '🦹';
    else if (cell.neutral === 'mercenary') icon = '⚔️';

    const merchant = state.merchants.find((m) => m.row === cell.row && m.col === cell.col);

    const xOff = cell.row % 2 === 0 ? 0 : HEX_W * 0.5;
    const x = cell.col * HEX_W + xOff;
    const y = cell.row * HEX_H * 0.75;

    const points = [
      [HEX_W * 0.5, 0],
      [HEX_W, HEX_H * 0.25],
      [HEX_W, HEX_H * 0.75],
      [HEX_W * 0.5, HEX_H],
      [0, HEX_H * 0.75],
      [0, HEX_H * 0.25],
    ]
      .map((p) => `${p[0]},${p[1]}`)
      .join(' ');

    return (
      <TouchableOpacity
        key={cell.id}
        style={[styles.hex, { left: x, top: y }]}
        onPress={() => onCellPress(cell)}
        activeOpacity={0.8}
      >
        <Svg width={HEX_W} height={HEX_H}>
          <Polygon
            points={points}
            fill={fill}
            stroke={
              isSel ? '#fff' : isActive ? '#fde68a' : cell.hasRoad ? '#a16207' : 'rgba(0,0,0,0.35)'
            }
            strokeWidth={isSel ? 3 : isActive ? 2 : cell.hasRoad ? 2 : 0.5}
          />
        </Svg>
        <View style={styles.hexInner} pointerEvents="none">
          {icon !== '' && <Text style={styles.icon}>{icon}</Text>}
          {merchant && <Text style={styles.merchant}>🚚</Text>}
          {cell.units > 0 && <Text style={styles.units}>{cell.units}</Text>}
          {cell.units > 0 && cell.morale < 60 && <Text style={styles.shaken}>▼</Text>}
          {cell.encircled && <Text style={styles.encircled}>◌</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  const fortCheck = selectedCell ? canBuildFort(state, selectedCell, PLAYER) : null;
  const current = state.nations[state.current];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
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
          <Text style={styles.gold}>
            💰 {Math.floor(me.gold)}G
            <Text style={ledger.net >= 0 ? styles.plus : styles.minus}>
              {'  '}
              {ledger.net >= 0 ? '+' : ''}
              {ledger.net.toFixed(1)}/턴
            </Text>
          </Text>
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
        <View style={styles.table}>
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
            const traders = state.merchants.filter((m) => m.nation === n.id).length;
            return (
              <View
                key={n.id}
                style={[styles.tr, n.id === state.current && styles.trActive]}
              >
                <View style={[styles.colName, styles.nameCell]}>
                  <View style={[styles.dot, { backgroundColor: n.color }]} />
                  <Text style={[styles.td, !n.alive && styles.dead]} numberOfLines={1}>
                    {n.suzerain !== null ? '└ ' : ''}
                    {n.name}
                    {!n.alive ? ' ×' : ''}
                  </Text>
                </View>
                <Text style={[styles.td, styles.influence]}>
                  {n.suzerain === null ? influenceOf(state, n.id).toFixed(0) : '-'}
                </Text>
                <Text style={styles.td}>{s.cells}</Text>
                <Text style={styles.td}>{s.units}</Text>
                <Text style={styles.td}>{s.forts}</Text>
                <Text style={styles.td}>{Math.floor(s.gold)}</Text>
                <Text style={[styles.td, l.net >= 0 ? styles.plus : styles.minus]}>
                  {l.net >= 0 ? '+' : ''}
                  {l.net.toFixed(0)}
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

      <ScrollView style={styles.gridWrap} contentContainerStyle={{ paddingBottom: 8 }}>
        <ScrollView horizontal contentContainerStyle={{ paddingRight: 12 }}>
          <View style={{ width: COLS * HEX_W + HEX_W, height: ROWS * HEX_H * 0.75 + HEX_H * 0.3 }}>
            {state.cells.map(renderCell)}
          </View>
        </ScrollView>
      </ScrollView>

      {/* 최근 사건 */}
      <View style={styles.feed}>
        {state.log.slice(-3).map((l, i) => (
          <Text key={i} style={styles.feedLine} numberOfLines={1}>
            · {l}
          </Text>
        ))}
        {state.log.length === 0 && <Text style={styles.feedLine}>· 게임 시작</Text>}
      </View>

      {selectedCell && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>
            병력 {selectedCell.units} · 사기 {Math.round(selectedCell.morale)} · 피로{' '}
            {Math.round(selectedCell.exhaustion)}
            {selectedCell.driftPP !== 0
              ? ` · 기세 ${selectedCell.driftPP > 0 ? '+' : ''}${selectedCell.driftPP.toFixed(0)}`
              : ''}
            {selectedCell.encircled ? ' · 포위됨' : ''}
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

      <View style={styles.footer}>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, styles.recruitBtn, !myTurn && styles.btnDim]}
            onPress={() =>
              setState((prev) => {
                recruit(prev, PLAYER, DEFAULT_ECONOMY.maxRecruitPerTurn);
                return bump(prev);
              })
            }
            disabled={!myTurn}
          >
            <Text style={styles.btnText}>징병 ({DEFAULT_ECONOMY.recruitCost}G)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.endBtn, !myTurn && styles.btnDim]}
            onPress={endTurn}
            disabled={!myTurn}
          >
            <Text style={styles.btnText}>턴 종료</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.resetBtn]} onPress={reset}>
            <Text style={styles.btnText}>리셋</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => setShowStats((v) => !v)}>
          <Text style={styles.toggle}>{showStats ? '수치 숨기기' : '수치 보기'}</Text>
        </TouchableOpacity>
      </View>

      {state.winner !== null && (
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>{state.nations[state.winner].name} 승리</Text>
          <Text style={styles.bannerSub}>{state.turn}턴</Text>
        </View>
      )}

      <CombatModal result={combat} onClose={() => setCombat(null)} />

      {/* 본진 함락 — 병합할까 속국으로 둘까 */}
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
        startFort(prev, c, PLAYER);
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

  gridWrap: { flex: 1, paddingHorizontal: 6, marginTop: 6 },
  hex: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  hexInner: {
    position: 'absolute',
    width: HEX_W,
    height: HEX_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { position: 'absolute', top: 3, right: 3, fontSize: 11 },
  merchant: { position: 'absolute', bottom: 3, left: 3, fontSize: 11 },
  units: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  shaken: { position: 'absolute', bottom: 2, right: 5, color: '#fca5a5', fontSize: 9 },
  encircled: { position: 'absolute', top: 3, left: 4, color: '#fde68a', fontSize: 10 },

  feed: { paddingHorizontal: 14, paddingVertical: 4, minHeight: 46 },
  feedLine: { color: '#9ca3af', fontSize: 11, lineHeight: 15 },

  panel: { backgroundColor: '#1f1f1f', marginHorizontal: 12, borderRadius: 8, padding: 10 },
  panelTitle: { color: '#e5e7eb', fontSize: 12, marginBottom: 6 },
  hint: { color: '#9ca3af', fontSize: 11, fontStyle: 'italic' },

  footer: { backgroundColor: '#1f1f1f', padding: 10, gap: 6 },
  row: { flexDirection: 'row', gap: 6 },
  btn: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: 'center' },
  btnDim: { opacity: 0.4 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  endBtn: { backgroundColor: '#3b82f6' },
  resetBtn: { backgroundColor: '#ef4444' },
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
  resolve: { color: '#fbbf24', fontSize: 12, marginBottom: 8 },
  roundRow: { flexDirection: 'row', marginBottom: 6 },
  roundNo: { color: '#fbbf24', fontSize: 12, width: 34, fontWeight: 'bold' },
  roundBody: { color: '#d1d5db', fontSize: 12, flex: 1 },
  summary: { color: '#9ca3af', fontSize: 12, marginVertical: 10 },
  destRow: { backgroundColor: '#141414', borderRadius: 8, padding: 12, marginBottom: 8 },
  destName: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  destInfo: { color: '#9ca3af', fontSize: 12, marginTop: 4 },
});
