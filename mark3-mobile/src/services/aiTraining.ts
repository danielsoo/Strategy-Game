export type AIDifficulty = 'easy' | 'normal' | 'hard';

export interface AIPreset {
  name: string;
  description: string;
}

export const AI_PRESETS: Record<AIDifficulty, AIPreset> = {
  easy: {
    name: '쉬움',
    description: '기본 AI',
  },
  normal: {
    name: '보통',
    description: '표준 AI',
  },
  hard: {
    name: '어려움',
    description: '고급 AI',
  },
};

export function getAIByDifficulty(difficulty: AIDifficulty) {
  return AI_PRESETS[difficulty];
}

