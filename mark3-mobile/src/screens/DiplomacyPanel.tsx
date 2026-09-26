// 외교 — 사신을 보내는 곳, 사신을 맞는 곳, 그리고 행군 중에 만나는 일
//
// 세 창이 한 파일에 있다. 셋 다 '다른 이가 나에게 무언가를 청하고 나는
// 고른다' 는 같은 모양이라, 모양을 맞춰두면 사람이 한 번 익힌 것으로 셋을
// 다 읽는다.
//
// 외교 창에서 지키는 선: 다른 나라의 속내(wants 의 판단)는 보여주지 않는다.
// 청하고 나서야 답과 까닭을 듣는다. 미리 '받아줄 것' 이 보이면 외교가
// 아니라 계산이 된다.

import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  GameState,
  Encounter,
  Proposal,
  TreatyKind,
  relationOf,
  treatyOf,
  knows,
  nationStats,
  DEFAULT_ECONOMY,
} from '../engine';

const KIND: Record<TreatyKind, string> = { truce: '휴전', alliance: '동맹' };

/** diplomacy.sign 과 같은 셈 — 판이 크면 휴전도 길다 */
function truceLength(state: GameState): number {
  const scale = Math.max(0.5, Math.floor(Math.min(state.rows, state.cols) / 2) / 5);
  return Math.round(DEFAULT_ECONOMY.truceTurns * scale);
}

interface PanelProps {
  visible: boolean;
  state: GameState;
  playerId: number;
  /** 방금 무슨 일이 있었는지 한 줄 */
  note: string | null;
  onPropose: (to: number, kind: TreatyKind) => void;
  onBreak: (other: number) => void;
  onClose: () => void;
}

export default function DiplomacyPanel({
  visible,
  state,
  playerId,
  note,
  onPropose,
  onBreak,
  onClose,
}: PanelProps) {
  /** 깨기는 두 번 누르게 한다 — 되돌릴 수 없고 정의가 깎인다 */
  const [confirmBreak, setConfirmBreak] = useState<number | null>(null);
  const me = state.nations[playerId];
  const lord = me.suzerain !== null ? state.nations[me.suzerain] : null;
  // 같은 진영(종주국·속국)은 외교 상대가 아니다
  const others = state.nations.filter(
    (n) => n.id !== playerId && n.alive && n.suzerain === null && relationOf(state, playerId, n.id) !== 'bloc'
  );

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.modal}>
          <Text style={s.title}>외교</Text>
          <Text style={s.hint}>
            휴전은 {truceLength(state)}턴 동안 서로 치지 않고 서로의 땅에 들어가지 않는 약속입니다.
            동맹은 거기에 더해 시야를 나누고, 붙어 있으면 협공을 거듭니다.{'\n'}
            조약을 깨면 정의가 깎이고, 다른 나라들이 당신의 제안을 덜 믿습니다.
          </Text>
          <Text style={s.meta}>
            나의 정의 {Math.round(me.justice)} · 공포 {Math.round(me.fear)}
            {(me.betrayals ?? 0) > 0 ? ` · 배신 ${me.betrayals}번` : ''}
          </Text>
          {lord && (
            <Text style={s.warnLine}>
              당신은 {lord.name}의 속국입니다 — 조약은 종주국이 맺고, 당신은 그 조약을 따릅니다.
            </Text>
          )}
          <ScrollView style={{ maxHeight: 400, marginTop: 8 }}>
            {others.map((n) => {
              const met = knows(state, playerId, n.id);
              const rel = relationOf(state, playerId, n.id);
              const t = treatyOf(state, playerId, n.id);
              const st = nationStats(state, n.id);
              return (
                <View key={n.id} style={s.card}>
                  <View style={s.head}>
                    <View style={[s.swatch, { backgroundColor: n.color }]} />
                    <Text style={s.name}>{met ? n.name : '아직 만나지 못한 나라'}</Text>
                    <Text style={[s.rel, rel === 'war' ? s.relWar : rel === 'alliance' ? s.relAlly : s.relTruce]}>
                      {rel === 'war'
                        ? '전쟁'
                        : rel === 'alliance'
                        ? '🤝 동맹'
                        : `🕊 휴전 · ${Math.max(0, (t?.until ?? state.turn) - state.turn)}턴 남음`}
                    </Text>
                  </View>
                  {met && (
                    <Text style={s.meta}>
                      정의 {Math.round(n.justice)} · 공포 {Math.round(n.fear)} · 영토 {st.cells}
                      {(n.betrayals ?? 0) > 0 ? ` · 배신 ${n.betrayals}번` : ''}
                    </Text>
                  )}
                  {lord ? null : !met ? (
                    <Text style={s.meta}>땅을 한 칸이라도 봐야 사신을 보낼 수 있습니다.</Text>
                  ) : confirmBreak === n.id ? (
                    <View style={s.row}>
                      <TouchableOpacity
                        style={[s.btn, s.war]}
                        onPress={() => {
                          setConfirmBreak(null);
                          onBreak(n.id);
                        }}
                      >
                        <Text style={s.btnText}>정말 깬다 (정의 -{DEFAULT_ECONOMY.betrayJustice})</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.btn, s.plain]} onPress={() => setConfirmBreak(null)}>
                        <Text style={s.btnText}>그만둔다</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={s.row}>
                      {rel === 'war' && (
                        <TouchableOpacity style={[s.btn, s.truce]} onPress={() => onPropose(n.id, 'truce')}>
                          <Text style={s.btnText}>휴전 제안</Text>
                        </TouchableOpacity>
                      )}
                      {rel !== 'alliance' && (
                        <TouchableOpacity style={[s.btn, s.ally]} onPress={() => onPropose(n.id, 'alliance')}>
                          <Text style={s.btnText}>동맹 제안</Text>
                        </TouchableOpacity>
                      )}
                      {rel !== 'war' && (
                        <TouchableOpacity style={[s.btn, s.war]} onPress={() => setConfirmBreak(n.id)}>
                          <Text style={s.btnText}>{KIND[t?.kind ?? 'truce']} 깨기</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            {others.length === 0 && <Text style={s.meta}>외교할 상대가 없습니다.</Text>}
          </ScrollView>
          {note && <Text style={s.note}>{note}</Text>}
          <TouchableOpacity style={s.close} onPress={onClose}>
            <Text style={s.btnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** 사신이 왔다 — 받을지 말지 */
export function ProposalCard({
  state,
  proposal,
  onAnswer,
}: {
  state: GameState;
  proposal: Proposal | null;
  onAnswer: (accept: boolean) => void;
}) {
  if (!proposal) return null;
  const from = state.nations[proposal.from];
  return (
    <Modal visible transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.modal}>
          <View style={s.head}>
            <View style={[s.swatch, { backgroundColor: from.color }]} />
            <Text style={s.title}>{from.name}의 사신</Text>
          </View>
          <Text style={s.story}>
            {from.name}이(가) {KIND[proposal.kind]}을 청합니다.
            {proposal.reason ? `\n"${proposal.reason}"` : ''}
          </Text>
          <Text style={s.meta}>
            {from.name} — 정의 {Math.round(from.justice)} · 공포 {Math.round(from.fear)}
            {(from.betrayals ?? 0) > 0 ? ` · 조약을 ${from.betrayals}번 깬 나라` : ''}
          </Text>
          <Text style={s.hint}>
            {proposal.kind === 'truce'
              ? '받으면 한동안 서로 치지 않고 서로의 땅에 들어가지 않습니다.'
              : '받으면 서로 치지 않고, 시야를 나누고, 붙어 있으면 협공을 거듭니다.'}
          </Text>
          <View style={s.row}>
            <TouchableOpacity style={[s.btn, s.ally]} onPress={() => onAnswer(true)}>
              <Text style={s.btnText}>받아들인다</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.plain]} onPress={() => onAnswer(false)}>
              <Text style={s.btnText}>거절한다</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** 행군 중에 만난 일 */
export function EncounterCard({
  encounter,
  onPick,
}: {
  encounter: Encounter | null;
  onPick: (choice: number) => void;
}) {
  if (!encounter) return null;
  return (
    <Modal visible transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.modal}>
          <Text style={s.eyebrow}>행군 중에</Text>
          <Text style={s.title}>{encounter.title}</Text>
          <Text style={s.story}>{encounter.story}</Text>
          {encounter.options.map((o, i) => (
            <TouchableOpacity
              key={i}
              style={[s.btn, i === 0 ? s.ally : s.plain, { marginTop: 8 }]}
              onPress={() => onPick(i)}
            >
              <Text style={s.btnText}>{o.label}</Text>
            </TouchableOpacity>
          ))}
          {encounter.options.length > 1 && (
            <Text style={[s.hint, { marginTop: 8 }]}>
              고른 것이 평판(정의·공포)이 됩니다. 평판이 다음에 만날 일을 바꿉니다.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: { backgroundColor: '#1f1f1f', borderRadius: 12, padding: 18, width: '90%', maxWidth: 520 },
  eyebrow: { color: '#fbbf24', fontSize: 11, fontWeight: 'bold', marginBottom: 2 },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  story: { color: '#e5e7eb', fontSize: 14, lineHeight: 21, marginBottom: 6 },
  hint: { color: '#9ca3af', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  note: { color: '#fbbf24', fontSize: 12, marginTop: 8 },
  meta: { color: '#9ca3af', fontSize: 11, marginTop: 4 },

  card: { backgroundColor: '#141414', borderRadius: 8, padding: 12, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 11, height: 11, borderRadius: 6 },
  name: { color: '#fff', fontSize: 14, fontWeight: 'bold', flex: 1 },
  rel: { fontSize: 12, fontWeight: 'bold' },
  relWar: { color: '#f87171' },
  relTruce: { color: '#93c5fd' },
  relAlly: { color: '#4ade80' },

  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  btn: {
    flex: 1,
    minWidth: 96,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  truce: { backgroundColor: '#2563eb' },
  ally: { backgroundColor: '#059669' },
  war: { backgroundColor: '#ef4444' },
  plain: { backgroundColor: '#475569' },
  // flex 를 주지 않는다 — 세로로 쌓이는 창에서 flex:1 은 높이를 0 으로 눌러
  // 글자가 단추 밖으로 삐져나왔다
  close: {
    backgroundColor: '#3b82f6',
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  warnLine: { color: '#fbbf24', fontSize: 12, marginTop: 8 },
});
