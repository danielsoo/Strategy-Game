// 종주국의 집무실 — 플레이어가 속국에게 명령을 내리는 곳
//
// 여기서 지켜야 할 선이 하나 있다. 화면에 내보낼 수 있는 것은 종주국이
// 확인한 것까지다.
//
//   보여준다   witnessed(확인된 이행) · observedTurn(확인 여부) · revealed(드러난 불이행)
//   숨긴다     progress(실제 이행) · response(순종·태업·거부)
//
// order.response 를 한 줄이라도 찍으면 이 체계는 그 자리에서 무너진다.
// 속내가 보이면 '듣는 척'도, 시야 밖의 불확실함도 아무 뜻이 없어진다.
// 속국이 정말 갔는지는 직접 가서 봐야 안다.

import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  GameState,
  Nation,
  OrderKind,
  Punishment,
  VassalOrder,
  computeLedger,
  nationStats,
  orderCost,
  vassalsOf,
  blocOf,
} from '../engine';

interface Props {
  visible: boolean;
  state: GameState;
  playerId: number;
  onClose: () => void;
  /** 지도에서 자리를 고르는 단계로 넘어간다 */
  onPickPlace: (vassalId: number, kind: 'garrison' | 'march') => void;
  onOrder: (vassalId: number, kind: OrderKind, target?: number) => void;
  onPunish: (vassalId: number, kind: Punishment) => void;
  /** 방금 무슨 일이 있었는지 한 줄 */
  note: string | null;
}

/** 종주국이 아는 만큼의 명령 상태 */
function orderStatus(state: GameState, o: VassalOrder): { line: string; tone: string } {
  const left = o.deadline - state.turn;
  const seen = Math.round(o.witnessed * 100);

  if (o.revealed) {
    return { line: `불이행이 드러났다 — 응징할 수 있다`, tone: '#f87171' };
  }
  if (o.observedTurn < 0) {
    // 이게 핵심 표시다. '안 했다'가 아니라 '모른다'
    return {
      line: `아직 확인하지 못했다 · 기한 ${left}턴`,
      tone: '#9ca3af',
    };
  }
  return {
    line: `확인된 이행 ${seen}% · 기한 ${left}턴`,
    tone: seen >= 50 ? '#4ade80' : '#fbbf24',
  };
}

export default function VassalPanel({
  visible,
  state,
  playerId,
  onClose,
  onPickPlace,
  onOrder,
  onPunish,
  note,
}: Props) {
  const mine = vassalsOf(state, playerId);
  const foes = state.nations.filter(
    (n) => n.alive && blocOf(state, n.id) !== blocOf(state, playerId)
  );
  const history = state.orderLog.filter((o) => o.lord === playerId).slice(-6).reverse();

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.overlay}>
        <View style={s.modal}>
          <Text style={s.title}>속국</Text>
          <Text style={s.hint}>
            명령은 내릴 수 있지만 따르게 할 수는 없다. 속국이 정말 움직였는지는
            네 눈에 보이는 만큼만 알 수 있다.
          </Text>
          {note && <Text style={s.note}>{note}</Text>}

          <ScrollView style={{ maxHeight: 420, marginTop: 10 }}>
            {mine.length === 0 && (
              <Text style={s.hint}>아직 속국이 없다. 본진을 빼앗은 뒤 속국으로 두면 생긴다.</Text>
            )}

            {mine.map((v) => (
              <VassalRow
                key={v.id}
                state={state}
                v={v}
                foes={foes}
                onPickPlace={onPickPlace}
                onOrder={onOrder}
                onPunish={onPunish}
              />
            ))}

            {history.length > 0 && (
              <>
                <Text style={[s.title, { fontSize: 14, marginTop: 14 }]}>지난 명령</Text>
                {history.map((h, i) => {
                  const name = state.nations[h.vassal]?.name ?? '';
                  const what = KIND_LABEL[h.kind];
                  const verdict = h.accepted
                    ? { t: '이행했다', c: '#4ade80' }
                    : h.unverified
                      ? { t: '끝내 확인하지 못했다', c: '#9ca3af' }
                      : { t: '이행하지 않았다', c: '#f87171' };
                  return (
                    <Text key={i} style={s.histLine}>
                      {h.endedTurn}턴 · {name} · {what} —{' '}
                      <Text style={{ color: verdict.c }}>{verdict.t}</Text>
                    </Text>
                  );
                })}
              </>
            )}
          </ScrollView>

          <TouchableOpacity style={[s.btn, s.close]} onPress={onClose}>
            <Text style={s.btnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const KIND_LABEL: Record<OrderKind, string> = {
  garrison: '진을 쳐라',
  march: '군대를 옮겨라',
  attack: '같이 공격해라',
  tax: '조공을 더 내라',
};

function VassalRow({
  state,
  v,
  foes,
  onPickPlace,
  onOrder,
  onPunish,
}: {
  state: GameState;
  v: Nation;
  foes: Nation[];
  onPickPlace: Props['onPickPlace'];
  onOrder: Props['onOrder'];
  onPunish: Props['onPunish'];
}) {
  const [pickFoe, setPickFoe] = React.useState(false);
  const stats = nationStats(state, v.id);
  const ledger = computeLedger(state, v.id);
  const o = v.order;
  const st = o ? orderStatus(state, o) : null;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={[s.swatch, { backgroundColor: v.color }]} />
        <Text style={s.name}>{v.name}</Text>
        <Text style={s.loyal}>충성 {Math.round(v.loyalty)}</Text>
      </View>
      <Text style={s.meta}>
        {stats.cells}칸 · 병력 {stats.units} · 순수입 {ledger.net.toFixed(0)}/턴 ·{' '}
        {v.vassalOrigin === 'conquest' ? '정복' : '자발'}
      </Text>
      {/*
        충성이 낮으면 명령이 잘 안 먹는다는 것만 알려준다. 속국이 지금
        무슨 마음인지는 알려주지 않는다 — 그건 이 화면이 알 수 있는 게 아니다.
      */}
      {v.loyalty < 35 && (
        <Text style={s.warn}>마음이 떠나 있다. 명령을 내려도 따르지 않을 수 있다.</Text>
      )}

      {o ? (
        <>
          <Text style={s.orderLine}>
            내린 명령 — {KIND_LABEL[o.kind]} ({orderCost(state, v, o).label})
          </Text>
          <Text style={[s.status, { color: st!.tone }]}>{st!.line}</Text>
          {o.revealed && (
            <View style={s.row}>
              <TouchableOpacity style={[s.btn, s.seize]} onPress={() => onPunish(v.id, 'seize')}>
                <Text style={s.btnText}>국고 몰수</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.strip]} onPress={() => onPunish(v.id, 'strip')}>
                <Text style={s.btnText}>문책</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.war]} onPress={() => onPunish(v.id, 'war')}>
                <Text style={s.btnText}>토벌</Text>
              </TouchableOpacity>
            </View>
          )}
          {o.revealed && (
            <Text style={s.hint}>
              벌하면 당장은 말을 듣지만 다른 속국들도 지켜본다. 마음은 더 멀어진다.
            </Text>
          )}
        </>
      ) : pickFoe ? (
        <>
          <Text style={s.orderLine}>누구를 치게 할까</Text>
          <View style={s.wrap}>
            {foes.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={[s.btn, s.order, { minWidth: 92 }]}
                onPress={() => {
                  setPickFoe(false);
                  onOrder(v.id, 'attack', f.id);
                }}
              >
                <Text style={s.btnText}>{f.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[s.btn, s.close, { minWidth: 70 }]} onPress={() => setPickFoe(false)}>
              <Text style={s.btnText}>취소</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={s.wrap}>
          <TouchableOpacity
            style={[s.btn, s.order]}
            onPress={() => onPickPlace(v.id, 'garrison')}
          >
            <Text style={s.btnText}>진을 쳐라</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.order]} onPress={() => onPickPlace(v.id, 'march')}>
            <Text style={s.btnText}>군대를 옮겨라</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, s.order, foes.length === 0 && s.dim]}
            disabled={foes.length === 0}
            onPress={() => setPickFoe(true)}
          >
            <Text style={s.btnText}>같이 공격해라</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.order]} onPress={() => onOrder(v.id, 'tax')}>
            <Text style={s.btnText}>조공을 더 내라</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: { backgroundColor: '#1f1f1f', borderRadius: 12, padding: 18, width: '90%' },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  hint: { color: '#9ca3af', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  note: { color: '#fbbf24', fontSize: 12, marginTop: 8 },

  card: { backgroundColor: '#141414', borderRadius: 8, padding: 12, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 11, height: 11, borderRadius: 6 },
  name: { color: '#fff', fontSize: 14, fontWeight: 'bold', flex: 1 },
  loyal: { color: '#d1d5db', fontSize: 12 },
  meta: { color: '#9ca3af', fontSize: 11, marginTop: 4 },
  warn: { color: '#fca5a5', fontSize: 11, marginTop: 4 },
  orderLine: { color: '#e5e7eb', fontSize: 12, marginTop: 8 },
  status: { fontSize: 12, marginTop: 3, marginBottom: 6 },
  histLine: { color: '#9ca3af', fontSize: 11, lineHeight: 17 },

  row: { flexDirection: 'row', gap: 6, marginTop: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  btn: {
    flex: 1,
    minWidth: 104,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  dim: { opacity: 0.4 },
  order: { backgroundColor: '#475569' },
  seize: { backgroundColor: '#a16207' },
  strip: { backgroundColor: '#b45309' },
  war: { backgroundColor: '#ef4444' },
  close: { backgroundColor: '#3b82f6', marginTop: 10 },
});
