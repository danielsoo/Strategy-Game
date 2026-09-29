// 설정 창 — 소리 크기, 관전 속도, 빠른 전투
//
// 막대(슬라이더)는 웹과 폰에서 손맛이 제각각이라 여섯 칸짜리 눈금으로 했다.
// 칸을 누르면 그 크기가 되고, 들어보기로 바로 확인한다.

import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { realm } from './realmTheme';
import { DEFAULT_SETTINGS, getSettings, onSettings, Settings, updateSettings } from '../services/settings';
import { sfx, Sfx } from '../services/sound';

const STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1];

function Level({ value, onPick }: { value: number; onPick: (v: number) => void }) {
  return (
    <View style={s.level}>
      {STEPS.map((v) => (
        <TouchableOpacity
          key={v}
          accessibilityRole="button"
          accessibilityLabel={`음량 ${Math.round(v * 100)}%`}
          accessibilityState={{ selected: Math.abs(value-v)<.01 }}
          aria-pressed={Math.abs(value-v)<.01}
          onPress={() => onPick(v)}
          style={[s.step, v <= value + 1e-6 && v > 0 ? s.stepOn : s.stepOff, v === 0 && s.stepZero]}
        >
          <Text style={s.zero}>{v === 0 ? '끔' : Math.round(v*100)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Toggle({ on, onPress, label, hint }: { on: boolean; onPress: () => void; label: string; hint?: string }) {
  return (
    <TouchableOpacity style={s.toggleRow} onPress={onPress} accessibilityRole="switch" accessibilityState={{checked:on}} aria-checked={on} accessibilityLabel={label}>
      <View style={[s.box, on && s.boxOn]}>{on && <Text style={s.check}>✓</Text>}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{label}</Text>
        {hint && <Text style={s.hint}>{hint}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const SAMPLES: Sfx[] = ['select', 'attack', 'win', 'turn', 'event', 'chronicle', 'victory'];
const SAMPLE_NAME: Partial<Record<Sfx, string>> = {
  select: '부대 고르기',
  attack: '칼 부딪힘',
  win: '이긴 싸움',
  turn: '망루의 종',
  event: '사건',
  chronicle: '연대기의 징',
  victory: '천하통일',
};

export default function SettingsPanel({
  visible,
  onClose,
  onSpeed,
  speedLabels,
}: {
  visible: boolean;
  onClose: () => void;
  onSpeed: (i: number) => void;
  speedLabels: string[];
}) {
  const [st, setSt] = useState<Settings>(getSettings());
  const [sample, setSample] = useState(0);
  const [tab, setTab] = useState<'sound' | 'play'>('sound');
  const {height} = useWindowDimensions();
  useEffect(() => onSettings(setSt), []);
  const set = (p: Partial<Settings>) => setSt(updateSettings(p));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.card,{maxHeight:height-32}]}>
          <Text style={s.eyebrow}>왕국 연대기 · 환경 설정</Text>
          <Text style={s.title}>왕국의 소리와 흐름</Text>
          <View style={s.tabs}>{([['sound','소리'],['play','게임 진행']] as const).map(([id,label])=><TouchableOpacity key={id} accessibilityRole="tab" accessibilityState={{selected:tab===id}} aria-selected={tab===id} onPress={()=>setTab(id)} style={[s.tab,tab===id&&s.tabOn]}><Text style={s.btnText}>{label}</Text></TouchableOpacity>)}</View>
          <ScrollView style={{flexShrink:1}} contentContainerStyle={{paddingBottom:8}}>
          {tab==='sound' ? <>

          <Text style={s.section}>소리</Text>
          <Text style={s.hint}>왕국의 기억 · 확정 오케스트라 주제곡</Text>
          <View style={s.line}>
            <Text style={s.label}>효과음</Text>
            <Level value={st.sfx} onPick={(v) => set({ sfx: v, muted: false })} />
          </View>
          <View style={s.line}>
            <Text style={s.label}>배경음</Text>
            <Level value={st.music} onPick={(v) => set({ music: v, muted: false })} />
          </View>
          <Toggle
            on={st.muted}
            onPress={() => set({ muted: !st.muted })}
            label="모든 소리 끄기"
            hint="크기는 기억해 둔다 — 다시 켜면 그대로"
          />
          <TouchableOpacity
            style={[s.btn, s.plain]}
            onPress={() => {
              sfx(SAMPLES[sample % SAMPLES.length]);
              setSample((x) => x + 1);
            }}
          >
            <Text style={s.btnText}>효과음 들어보기 — {SAMPLE_NAME[SAMPLES[sample % SAMPLES.length]]}</Text>
          </TouchableOpacity>

          </> : <>
          <Text style={s.section}>진행</Text>
          <Text style={s.hint}>관전할 때 AI 가 한 수를 두는 빠르기</Text>
          <View style={s.chips}>
            {speedLabels.map((l, i) => (
              <TouchableOpacity
                key={l}
                style={[s.chip, st.aiSpeed === i ? s.chipOn : s.chipOff]}
                onPress={() => {
                  set({ aiSpeed: i });
                  onSpeed(i);
                }}
              >
                <Text style={s.chipText}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Toggle
            on={st.quickCombat}
            onPress={() => set({ quickCombat: !st.quickCombat })}
            label="빠른 전투"
            hint="내가 건 싸움의 결과 창을 띄우지 않는다 — 결과는 기록에 한 줄로 남는다"
          />
          </>}
          </ScrollView>
          <View style={s.buttons}>
            <TouchableOpacity
              style={[s.btn, s.plain, { flex: 1 }]}
              onPress={() => {
                set({ ...DEFAULT_SETTINGS });
                onSpeed(DEFAULT_SETTINGS.aiSpeed);
              }}
            >
              <Text style={s.btnText}>처음 값으로</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.primary, { flex: 1 }]} onPress={onClose}>
              <Text style={s.btnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  card: { backgroundColor: realm.panel, borderRadius: 4, borderWidth:1,borderColor:realm.border, padding: 20, width: '100%', maxWidth: 540 },
  eyebrow:{color:realm.gold,fontSize:10,letterSpacing:2,marginBottom:12},
  title: { color: realm.text, fontFamily:realm.serif,fontSize: 24, marginBottom: 18 },
  tabs:{flexDirection:'row',borderBottomWidth:1,borderBottomColor:realm.border,marginBottom:10},
  tab:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center'},
  tabOn:{backgroundColor:realm.inset,borderBottomWidth:2,borderBottomColor:realm.gold},
  section: { color: '#d9bd80', fontSize: 13, fontWeight: 'bold', marginTop: 14, marginBottom: 6 },
  line: { alignItems: 'stretch', gap:8, marginVertical: 12 },
  label: { color: '#eee5d1', fontSize: 13 },
  hint: { color: '#b0b4a3', fontSize: 11, marginTop: 2 },
  level: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  step: { flex:1,minHeight:44, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  stepOn: { backgroundColor: '#75633c' },
  stepOff: { backgroundColor: '#4d5547' },
  stepZero: { backgroundColor: '#14201d' },
  zero: { color: realm.text, fontSize: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10,minHeight:48 },
  box: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: '#898a70', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: '#4f725c', borderColor: '#4f725c' },
  check: { color: '#f0e8d5', fontSize: 13, fontWeight: 'bold' },
  chips: { flexDirection: 'row', gap: 6, marginTop: 6 },
  chip: { flex: 1, paddingVertical: 12,minHeight:44, borderRadius: 3, alignItems: 'center' },
  chipOn: { backgroundColor: '#596d52' },
  chipOff: { backgroundColor: '#303e35' },
  chipText: { color: '#f0e8d5', fontSize: 12, fontWeight: 'bold' },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 18 },
  btn: { paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  primary: { backgroundColor: '#596d52' },
  plain: { backgroundColor: '#303e35' },
  btnText: { color: '#f0e8d5', fontWeight: 'bold', fontSize: 13 },
});
