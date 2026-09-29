import { realm } from './realmTheme';
// 판의 끝 — 이 판은 어떤 판이었나
//
// 전에는 이기면 '몇 턴 · 승리' 한 줄이 떴다. 한 시간을 둔 판의 끝으로는 너무
// 짧았다. 판 내내 쌓은 역사(engine/history.ts)를 연대기처럼 펼치고, 나라마다
// 영토가 어떻게 오르내렸는지 그래프로 보여준다.
//
// 세 가지 끝이 있다.
//   이겼다       — 모두가 내 진영이 되었다
//   살아남았다   — 남이 이겼지만 나는 그 진영(속국)으로 남았다
//   무너졌다     — 내 나라가 사라졌다. 판은 계속될 수 있다(관전)

import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Polyline, Line } from 'react-native-svg';
import { GameState } from '../engine/types';
import { describeEvent, historyTally, josa, HistoryEvent } from '../engine/history';
import { characterOf, CHARACTER_NAME } from '../engine/reputation';
import { blocLeader } from '../engine/vassals';

type Ending = 'won' | 'survived' | 'fallen' | 'lost';

export function endingOf(state: GameState, me: number): Ending | null {
  const alive = state.nations[me]?.alive;
  if (state.winner === null) return alive ? null : 'fallen';
  if (state.winner === me) return 'won';
  if (alive && blocLeader(state, me) === state.winner) return 'survived';
  return alive ? 'lost' : 'fallen';
}

const TITLE: Record<Ending, string> = {
  won: '천하가 당신의 깃발 아래 모였다',
  survived: '왕관은 남의 것이 되었으나, 당신의 나라는 살아남았다',
  fallen: '당신의 나라는 무너졌다',
  lost: '다른 이가 천하를 쥐었다',
};

/** 내 나라가 걸어온 길을 한 문단으로 — 숫자를 읽는 게 아니라 이야기를 읽게 */
function verdict(state: GameState, me: number): string {
  const n = state.nations[me];
  const t = historyTally(state, me);
  const ch = characterOf(n);
  const first =
    ch === 'none'
      ? `${josa(n.name, '은는')} 끝내 어느 쪽으로도 기울지 않았다.`
      : `${josa(n.name, '은는')} ${CHARACTER_NAME[ch]}로 기억될 것이다.`;
  // 한 일들을 '~고, ~고, ~다' 로 잇는다
  const deeds: [string, string][] = [];
  if (t.annexed > 0) deeds.push([`나라 ${t.annexed}곳을 지도에서 지웠고`, `나라 ${t.annexed}곳을 지도에서 지웠다`]);
  if (t.vassals > 0) deeds.push([`${t.vassals}곳을 속국으로 거느렸고`, `${t.vassals}곳을 속국으로 거느렸다`]);
  if (t.betrayals > 0) deeds.push([`맹약을 ${t.betrayals}번 저버렸고`, `맹약을 ${t.betrayals}번 저버렸다`]);
  else if (t.annexed + t.vassals > 0) deeds.push(['맹약은 한 번도 저버리지 않았고', '맹약은 한 번도 저버리지 않았다']);
  deeds.push([`가장 넓을 때 ${t.peak}칸을 다스렸고`, `가장 넓을 때 ${t.peak}칸을 다스렸다`]);
  const body = deeds.map((d, i) => (i === deeds.length - 1 ? d[1] : d[0])).join(', ') + '.';
  const tail = t.rebellions > 0 ? ` 속국이 ${t.rebellions}번 등을 돌렸다.` : '';
  return `${first} ${body}${tail}`;
}

const KIND_ICON: Record<HistoryEvent['kind'], string> = {
  annex: '🔥',
  vassal: '⛓',
  protect: '🛡',
  rebel: '⚔️',
  fall: '💀',
  alliance: '🤝',
  betray: '🗡',
  provoked: '🗡',
  character: '📜',
};

function TerritoryChart({ state, me }: { state: GameState; me: number }) {
  const tl = state.timeline ?? [];
  if (tl.length < 2) return null;
  const W = 300;
  const H = 110;
  const maxT = tl[tl.length - 1].turn;
  const minT = tl[0].turn;
  const maxC = Math.max(1, ...tl.flatMap((p) => p.cells));
  const x = (t: number) => ((t - minT) / Math.max(1, maxT - minT)) * W;
  const y = (c: number) => H - (c / maxC) * (H - 6) - 3;
  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Line x1={0} y1={H - 3} x2={W} y2={H - 3} stroke="#4d5547" strokeWidth={1} />
        {state.nations.map((n) => (
          <Polyline
            key={n.id}
            points={tl.map((p) => `${x(p.turn).toFixed(1)},${y(p.cells[n.id] ?? 0).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={n.color}
            strokeWidth={n.id === me ? 2.6 : 1.6}
            strokeOpacity={n.id === me ? 1 : 0.8}
          />
        ))}
      </Svg>
      <View style={s.legend}>
        {state.nations.map((n) => (
          <Text key={n.id} style={[s.legendItem, { color: n.color }]}>
            ● {n.name}
          </Text>
        ))}
        <Text style={s.axis}>
          {minT}턴 → {maxT}턴 · 칸 수
        </Text>
      </View>
    </View>
  );
}

export default function EndScreen({
  state,
  playerId,
  visible,
  onNewGame,
  onClose,
}: {
  state: GameState;
  playerId: number;
  visible: boolean;
  onNewGame: () => void;
  /** 지도로 돌아가 본다(무너졌으면 이어서 지켜본다) */
  onClose: () => void;
}) {
  const ending = endingOf(state, playerId);
  if (!ending) return null;
  const history = state.history ?? [];
  const winner = state.winner !== null ? state.nations[state.winner] : null;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <ScrollView style={s.card} contentContainerStyle={{paddingBottom:4}} nestedScrollEnabled>
          <Text style={s.eyebrow}>연 대 기 · 종 장 · {state.turn}턴</Text>
          <Text style={[s.title, ending === 'won' ? s.gold : ending === 'fallen' ? s.grey : null]}>
            {TITLE[ending]}
          </Text>
          {winner && (
            <Text style={s.sub}>
              <Text style={{ color: winner.color, fontWeight: 'bold' }}>{winner.name}</Text> 승리 ·{' '}
              {state.winReason ?? '승리 조건 달성'}
            </Text>
          )}
          <Text style={s.verdict}>{verdict(state, playerId)}</Text>

          <TerritoryChart state={state} me={playerId} />

          <Text style={s.section}>이 판의 역사</Text>
          <ScrollView style={s.list}>
            {history.length === 0 && <Text style={s.empty}>굵직한 일 없이 끝났다.</Text>}
            {history.map((e, i) => {
              const mine = e.a === playerId || e.b === playerId;
              return (
                <View key={i} style={s.row}>
                  <Text style={s.turn}>{e.turn}</Text>
                  <Text style={s.icon}>{KIND_ICON[e.kind]}</Text>
                  <Text style={[s.line, mine && s.mine, { borderLeftColor: state.nations[e.a]?.color ?? '#555' }]}>
                    {describeEvent(state, e)}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          <View style={s.buttons}>
            <TouchableOpacity style={[s.btn, s.primary]} onPress={onNewGame}>
              <Text style={s.btnText}>새 판</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.plain]} onPress={onClose}>
              <Text style={s.btnText}>{state.winner === null ? '끝까지 지켜본다' : '지도를 본다'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  card: {
    backgroundColor: '#17140f',
    borderColor: '#786440',
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
    width: '100%',
    maxWidth: 640,
    maxHeight: '94%',
    flexGrow:0,
  },
  eyebrow: { color: '#d4b483', fontSize: 11, letterSpacing: 3, textAlign: 'center' },
  title: { color: '#f5f5f4', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginTop: 8 },
  gold: { color: '#d9bd80' },
  grey: { color: '#a8a29e' },
  sub: { color: '#a8a29e', fontSize: 12, textAlign: 'center', marginTop: 4 },
  verdict: {
    color: '#e7e5e4',
    fontSize: 13,
    lineHeight: 20,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 12,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, alignItems: 'center' },
  legendItem: { fontSize: 11 },
  axis: { color: '#78716c', fontSize: 10, marginLeft: 'auto' },
  section: { color: '#d9bd80', fontSize: 13, fontWeight: 'bold', marginTop: 12, marginBottom: 6 },
  list: { flexGrow: 0, flexShrink: 1, minHeight: 80 },
  empty: { color: '#78716c', fontSize: 12, fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5 },
  turn: { color: '#78716c', fontSize: 11, width: 28, textAlign: 'right', marginRight: 6, marginTop: 1 },
  icon: { fontSize: 11, width: 18, marginTop: 1 },
  line: { color: '#d6d3d1', fontSize: 12, lineHeight: 17, flex: 1, borderLeftWidth: 2, paddingLeft: 6 },
  mine: { color: '#fde68a' },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: 'center' },
  primary: { backgroundColor: '#80623c' },
  plain: { backgroundColor: '#44403c' },
  btnText: { color: '#f0e8d5', fontWeight: 'bold', fontSize: 13 },
});
