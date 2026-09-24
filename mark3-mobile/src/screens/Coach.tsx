// 첫 판 길잡이 카드
//
// 판을 가리지 않게 정보 칸(머리말 아래)에 붙는다. 모달로 띄우면 '부대를
// 눌러보세요' 라고 해놓고 부대를 못 누르게 막는 꼴이 된다.
//
// 두 얼굴이 있다.
//   해보기  무엇을 누르라는가. 누를 것은 판 위에서 반짝인다.
//   풀이    해냈다. 방금 무슨 일이 일어났고 왜 그런가 → '다음'
// 해내자마자 다음 과제로 넘기면 '뭐가 된 거지?' 를 물을 틈이 없다.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COACH_STEPS } from './tutorial';

interface Props {
  step: number;
  /** 이 단계를 해냈나 — 그러면 풀이를 보여준다 */
  done: boolean;
  /** 짚을 것이 지금 판에 있나. 없으면 pending 글을 쓴다. */
  ready: boolean;
  /** 내 나라 색 — 첫 단계에서 '이 색' 이 무슨 색인지 보여준다 */
  color: string;
  onNext: () => void;
  onQuit: () => void;
}

export default function Coach({ step, done, ready, color, onNext, onQuit }: Props) {
  const s = COACH_STEPS[step];
  if (!s) return null;
  const last = step === COACH_STEPS.length - 1;
  const showAfter = done && !!s.after;
  const text = showAfter ? s.after! : !ready && s.pending ? s.pending : s.body;

  let action: React.ReactNode;
  if (showAfter || !s.done) {
    action = (
      <TouchableOpacity style={styles.next} onPress={last ? onQuit : onNext}>
        <Text style={styles.nextText}>{last ? '시작하기' : '다음'}</Text>
      </TouchableOpacity>
    );
  } else if (s.optional) {
    action = (
      <>
        <Text style={styles.waiting}>👆 해보면 다음으로 넘어갑니다</Text>
        <TouchableOpacity onPress={onNext} hitSlop={8}>
          <Text style={styles.later}>지금은 못 해요 — 다음으로</Text>
        </TouchableOpacity>
      </>
    );
  } else {
    action = <Text style={styles.waiting}>👆 해보면 다음으로 넘어갑니다</Text>;
  }

  return (
    <View style={[styles.card, showAfter && styles.cardDone]}>
      <View style={styles.top}>
        <Text style={styles.count}>
          길잡이 {step + 1}/{COACH_STEPS.length}
        </Text>
        {!last && (
          <TouchableOpacity onPress={onQuit} hitSlop={8}>
            <Text style={styles.quit}>그만 보기</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.titleRow}>
        {step === 0 && <View style={[styles.swatch, { backgroundColor: color }]} />}
        <Text style={styles.title}>
          {showAfter ? '✓ ' : ''}
          {s.title}
        </Text>
      </View>
      <Text style={styles.body}>{text}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderColor: '#f472b6',
    borderWidth: 2,
    borderRadius: 10,
    marginHorizontal: 12,
    marginTop: 8,
    padding: 12,
  },
  cardDone: { borderColor: '#34d399' },
  top: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  count: { color: '#f472b6', fontSize: 11, fontWeight: 'bold' },
  quit: { color: '#9ca3af', fontSize: 11 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  swatch: { width: 14, height: 14, borderRadius: 3 },
  title: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  body: { color: '#e5e7eb', fontSize: 13, lineHeight: 19 },
  next: {
    marginTop: 10,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  nextText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  later: { color: '#93c5fd', fontSize: 12, marginTop: 6 },
  waiting: { color: '#f9a8d4', fontSize: 12, marginTop: 8 },
});
