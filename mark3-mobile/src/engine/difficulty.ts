// AI 난이도
//
// 난이도를 만드는 길은 크게 둘이다.
//
//   판단 품질 — 최선수를 얼마나 자주 두는가. 약한 AI 는 실제로 실수를 하고,
//     사람은 그 실수를 이용해서 이긴다. 가장 정직하지만 천장이 있다 —
//     AI 의 최선보다 세게는 못 만든다.
//   핸디캡 — 자원을 더 준다. 위로는 무한히 올라가지만 "치트 쓴다"는 느낌이 난다.
//
// 그래서 아래쪽은 판단 품질로, 천장에 닿은 위쪽만 핸디캡으로 올린다.
//
// 숫자는 감으로 고르지 않는다. 1대1 로 돌려서 승률이 고르게 벌어지도록 맞춘다
// (sim/difficulty.ts).

import { RNG } from '../services/combatSystem';
import { Policy, Action } from './ai';

export interface Difficulty {
  label: string;
  /** 이 확률로 최선수 대신 아무 수나 둔다 */
  noise: number;
  /** 수입 배수 */
  incomeMul: number;
  /**
   * 이번 원정을 정할 때 몇 턴 앞을 내다보는가 (plan.ts).
   *
   * 0 이면 안 본다 — 예전 그대로다. 실수 확률과 수입 배수가 '덜 똑똑하게'
   * 와 '더 부유하게' 였다면 이건 '더 멀리 본다' 다. 셋 중 이것만이 사람이
   * "이 AI 똑똑하네" 로 느끼는 종류의 강함이다.
   */
  lookahead: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { label: '아주 쉬움', noise: 0.6, incomeMul: 0.7, lookahead: 0 },
  { label: '쉬움', noise: 0.35, incomeMul: 0.85, lookahead: 0 },
  { label: '보통', noise: 0.22, incomeMul: 1, lookahead: 0 },
  { label: '어려움', noise: 0, incomeMul: 1, lookahead: 2 },
  { label: '아주 어려움', noise: 0, incomeMul: 1.35, lookahead: 3 },
];

/**
 * 난이도를 수 고르는 방식으로 바꾼다.
 *
 * 점수는 손으로 쓴 평가식 그대로 쓰고, 고르는 데서만 흔든다. 평가식을
 * 망가뜨리면 '약한 AI' 가 아니라 '이상한 AI' 가 된다.
 */
export function difficultyPolicy(d: Difficulty, rng: RNG): Policy | undefined {
  if (d.noise <= 0) return undefined; // 최고점만 — 기본 동작
  return {
    select: (actions: Action[], r: RNG) =>
      r() < d.noise ? actions[Math.floor(r() * actions.length)] : actions[0],
  };
}
