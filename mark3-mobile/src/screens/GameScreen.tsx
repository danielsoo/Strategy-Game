import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { makeRng, DetailedCombatResult } from '../services/combatSystem';
import {
  Cell,
  GameState,
  Merchant,
  DEFAULT_ECONOMY,
  NEUTRAL_COLOR,
  createGameState,
  cellAt,
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
} from '../engine';
import { takeAITurn, PERSONALITIES, LEARNED_WEIGHTS, AIWeights } from '../engine/ai';

const ROWS = 11;
const COLS = 11;
const NATIONS = 5;
const PLAYER = 0;

// AI 나라마다 다른 성격을 준다. 0번은 사람이다.
const AI_WEIGHTS: AIWeights[] = [
  LEARNED_WEIGHTS, // 사용되지 않음 (사람 자리)
  PERSONALITIES['공격형'],
  PERSONALITIES['확장형'],
  PERSONALITIES['수비형'],
  LEARNED_WEIGHTS,
];

const HEX = 30;
const HEX_W = Math.sqrt(3) * HEX;
const HEX_H = HEX * 2;

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

export default function GameScreen() {
  const [rng] = useState(() => makeRng(Date.now() & 0xffffffff));
  const [state, setState] = useState<GameState>(() => {
    const s = createGameState(NATIONS, ROWS, COLS, rng);
    beginTurn(s, PLAYER, rng);
    return s;
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [combat, setCombat] = useState<DetailedCombatResult | null>(null);
  const [merchantPick, setMerchantPick] = useState<Merchant | null>(null);
  const [showLog, setShowLog] = useState(false);

  const me = state.nations[PLAYER];
  const ledger = useMemo(() => computeLedger(state, PLAYER), [state]);
  const myTurn = state.current === PLAYER && state.winner === null;

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
        if (cell.fortStage > 0 && cell.fortStage < 4) return; // 건설 중 수비대는 못 움직인다
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
        const outcome = performAttack(prev, from, to, rng);
        setCombat(outcome.result);
      } else if (to.units === 0 || (to.owner === PLAYER && !to.neutral)) {
        moveStack(from, to);
      }
      updateAliveFlags(prev);
      return bump(prev);
    });
    setSelected(null);
  };

  const buildFort = () => {
    if (!selectedCell) return;
    setState((prev) => {
      const c = prev.cells.find((x) => x.id === selectedCell.id)!;
      startFort(prev, c, PLAYER);
      return bump(prev);
    });
    setSelected(null);
  };

  const doRecruit = () => {
    setState((prev) => {
      recruit(prev, PLAYER, DEFAULT_ECONOMY.maxRecruitPerTurn);
      return bump(prev);
    });
  };

  const chooseDestination = (dest: Cell) => {
    if (!merchantPick) return;
    setState((prev) => {
      const m = prev.merchants.find((x) => x.id === merchantPick.id);
      if (m) sendMerchant(prev, m, dest);
      return bump(prev);
    });
    setMerchantPick(null);
  };

  const endTurn = () => {
    setSelected(null);
    setState((prev) => {
      // 내 턴 마무리
      restUnmoved(prev, PLAYER, new Set());
      stepMerchants(prev);
      stepNeutrals(prev, rng);
      updateAliveFlags(prev);

      // AI 나라들이 차례로 둔다
      for (let id = 1; id < prev.nations.length; id++) {
        if (!prev.nations[id].alive || prev.winner !== null) continue;
        prev.current = id;
        beginTurn(prev, id, rng);
        const log = takeAITurn(prev, id, AI_WEIGHTS[id] ?? PERSONALITIES['균형'], rng);
        restUnmoved(prev, id, log.moved);
        stepMerchants(prev);
        stepNeutrals(prev, rng);
        updateAliveFlags(prev);
      }

      prev.turn++;
      prev.current = PLAYER;
      if (prev.nations[PLAYER].alive && prev.winner === null) beginTurn(prev, PLAYER, rng);
      return bump(prev);
    });
  };

  const reset = () => {
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
      >
        <Svg width={HEX_W} height={HEX_H}>
          <Polygon
            points={points}
            fill={fill}
            stroke={isSel ? '#fff' : cell.hasRoad ? '#a16207' : 'rgba(0,0,0,0.35)'}
            strokeWidth={isSel ? 3 : cell.hasRoad ? 2 : 0.5}
          />
        </Svg>
        <View style={styles.hexInner} pointerEvents="none">
          {icon !== '' && <Text style={styles.icon}>{icon}</Text>}
          {merchant && <Text style={styles.merchant}>🚚</Text>}
          {cell.units > 0 && <Text style={styles.units}>{cell.units}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  const fortCheck = selectedCell ? canBuildFort(state, selectedCell, PLAYER) : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          턴 {state.turn} · {me.name}
        </Text>
        <Text style={styles.gold}>
          💰 {Math.floor(me.gold)}G
          <Text style={ledger.net >= 0 ? styles.plus : styles.minus}>
            {'  '}
            {ledger.net >= 0 ? '+' : ''}
            {ledger.net.toFixed(1)}/턴
          </Text>
        </Text>
        <Text style={styles.sub}>
          영토 {ledger.cells} · 병력 {ledger.units} · 수입 {ledger.income.toFixed(0)} · 유지{' '}
          {ledger.upkeep.toFixed(0)} · 행정 {ledger.admin.toFixed(0)}
        </Text>
      </View>

      <View style={styles.repRow}>
        <View style={styles.repItem}>
          <Text style={styles.repLabel}>공포 {me.fear}</Text>
          <View style={styles.bar}>
            <View style={[styles.fill, { width: `${me.fear}%`, backgroundColor: '#ef4444' }]} />
          </View>
        </View>
        <View style={styles.repItem}>
          <Text style={styles.repLabel}>정의 {me.justice}</Text>
          <View style={styles.bar}>
            <View style={[styles.fill, { width: `${me.justice}%`, backgroundColor: '#3b82f6' }]} />
          </View>
        </View>
      </View>

      <ScrollView style={styles.gridWrap} contentContainerStyle={{ paddingBottom: 12 }}>
        <ScrollView horizontal contentContainerStyle={{ paddingRight: 12 }}>
          <View style={{ width: COLS * HEX_W + HEX_W, height: ROWS * HEX_H * 0.75 + HEX_H * 0.3 }}>
            {state.cells.map(renderCell)}
          </View>
        </ScrollView>
      </ScrollView>

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
            <TouchableOpacity style={[styles.btn, styles.fortBtn]} onPress={buildFort}>
              <Text style={styles.btnText}>요새 건설 ({DEFAULT_ECONOMY.fortCost}G)</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.hint}>{fortCheck?.reason ?? ''}</Text>
          )}
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.recruitBtn]} onPress={doRecruit}>
            <Text style={styles.btnText}>징병 ({DEFAULT_ECONOMY.recruitCost}G)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.logBtn]} onPress={() => setShowLog(true)}>
            <Text style={styles.btnText}>기록</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.endBtn]} onPress={endTurn}>
            <Text style={styles.btnText}>턴 종료</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.resetBtn]} onPress={reset}>
            <Text style={styles.btnText}>리셋</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.standings}>
          {state.nations
            .map((n) => {
              const s = nationStats(state, n.id);
              return `${n.name} ${n.alive ? s.cells : '×'}`;
            })
            .join('  ·  ')}
        </Text>
      </View>

      {state.winner !== null && (
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>{state.nations[state.winner].name} 승리</Text>
        </View>
      )}

      <CombatModal result={combat} onClose={() => setCombat(null)} />

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
                        onPress={() => chooseDestination(d)}
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
            <TouchableOpacity style={[styles.btn, styles.endBtn]} onPress={() => setMerchantPick(null)}>
              <Text style={styles.btnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showLog} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>기록</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {[...state.log].reverse().map((l, i) => (
                <Text key={i} style={styles.logLine}>
                  · {l}
                </Text>
              ))}
            </ScrollView>
            <TouchableOpacity style={[styles.btn, styles.endBtn]} onPress={() => setShowLog(false)}>
              <Text style={styles.btnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
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
    result.outcome === 'stalemate'
      ? '교착 — 밀어내지 못했다'
      : win
      ? '승리'
      : '패배 — 물러났다';

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
  header: { paddingTop: 44, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: '#1f1f1f' },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  gold: { color: '#fbbf24', fontSize: 15, fontWeight: 'bold', marginTop: 2 },
  sub: { color: '#8b8b8b', fontSize: 11, marginTop: 3 },
  plus: { color: '#34d399', fontSize: 13 },
  minus: { color: '#f87171', fontSize: 13 },
  repRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  repItem: { flex: 1 },
  repLabel: { color: '#cbd5e1', fontSize: 11, marginBottom: 3 },
  bar: { height: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%' },
  gridWrap: { flex: 1, paddingHorizontal: 8 },
  hex: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  hexInner: {
    position: 'absolute',
    width: HEX_W,
    height: HEX_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { position: 'absolute', top: 4, right: 4, fontSize: 13 },
  merchant: { position: 'absolute', bottom: 4, left: 4, fontSize: 13 },
  units: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  panel: { backgroundColor: '#1f1f1f', marginHorizontal: 12, borderRadius: 8, padding: 10 },
  panelTitle: { color: '#e5e7eb', fontSize: 12, marginBottom: 6 },
  hint: { color: '#9ca3af', fontSize: 11, fontStyle: 'italic' },
  footer: { backgroundColor: '#1f1f1f', padding: 12, gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  endBtn: { backgroundColor: '#3b82f6' },
  resetBtn: { backgroundColor: '#ef4444' },
  recruitBtn: { backgroundColor: '#059669' },
  logBtn: { backgroundColor: '#4b5563' },
  fortBtn: { backgroundColor: '#a16207' },
  standings: { color: '#9ca3af', fontSize: 11, textAlign: 'center' },
  banner: {
    position: 'absolute',
    top: '45%',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 20,
    borderRadius: 12,
  },
  bannerText: { color: '#fbbf24', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
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
  destRow: {
    backgroundColor: '#141414',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  destName: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  destInfo: { color: '#9ca3af', fontSize: 12, marginTop: 4 },
  logLine: { color: '#d1d5db', fontSize: 12, marginBottom: 4 },
});
