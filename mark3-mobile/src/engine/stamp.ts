// 규칙 도장
//
// 가중치는 어떤 규칙 아래에서 뽑은 것이다. 규칙이 바뀌면 그 값은 옛날 게임의
// 정답이지 지금 게임의 정답이 아니다. 그런데 파일만 봐서는 그걸 알 수 없어서,
// "이거 언제 뽑은 값이지" 를 매번 기억에 의존하게 된다. 그러다 보면 불안해서
// 규칙을 조금만 건드려도 다시 학습을 돌리게 되고, 그건 며칠이 갈 수도 있다.
//
// 그래서 값에 도장을 찍는다. 학습이 끝나면 그때의 규칙 도장을 같이 적어두고,
// 하네스가 지금 도장과 견줘 다르면 알려준다. 다시 돌릴지 말지는 그때 사람이
// 정하면 된다 — 적어도 모르고 지나치지는 않는다.
//
// 도장에 넣는 것은 '수를 고르는 데 실제로 영향을 주는 상수'뿐이다. 화면 색깔이
// 바뀌었다고 다시 학습할 일은 없다.

import { EconomyConfig, DEFAULT_ECONOMY } from './types';

/** 도장에 들어가는 항목. 여기 없는 값이 바뀌면 도장은 안 변한다. */
const KEYS: Array<keyof EconomyConfig> = [
  'cellIncome',
  'castleIncome',
  'fortIncome',
  'adminCostPerCell',
  'adminExponent',
  'adminRange',
  'unitUpkeep',
  'recruitCost',
  'fortCost',
  'maxStackUnits',
  'marchBase',
  'marchPerUnit',
  'marchRegen',
  'marchMax',
  'neutralDensity',
  'flankSupport',
  'visionRadiusUnit',
  'visionRadiusHub',
  'tributeRateConquest',
  'tributeRateVoluntary',
  'vassalInfluenceWeight',
  'dominanceShare',
  'diplomacyOn',
  'truceTurns',
  'betrayJustice',
  'encounterChance',
  'plunderCellShare',
  'plunderFortShare',
  'plunderCastleShare',
];

/**
 * 규칙을 한 줄로 줄인다. 사람이 읽을 것은 아니고 견주기만 하면 된다.
 * 짧은 해시라 충돌이 아주 없지는 않지만, 이건 잠금이 아니라 알림이다.
 */
export function rulesStamp(eco: EconomyConfig = DEFAULT_ECONOMY): string {
  const parts = KEYS.map((k) => `${k}=${eco[k]}`).join('|');
  let h = 2166136261;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 학습 결과에 같이 적어두는 것 */
export interface FitProvenance {
  stamp: string;
  fittedAt: string;
  /** 어떤 판 크기들에서 뽑았나 — 한 크기에서만 뽑으면 그 크기의 정답이 된다 */
  sizes: number[];
  note?: string;
}

export function makeProvenance(sizes: number[], note?: string): FitProvenance {
  return {
    stamp: rulesStamp(),
    fittedAt: new Date().toISOString().slice(0, 10),
    sizes,
    note,
  };
}

/** 지금 규칙과 견준다. 맞으면 null, 다르면 사람이 읽을 한 줄. */
export function checkProvenance(p: FitProvenance | null | undefined): string | null {
  if (!p) return '이 값이 어느 규칙에서 나왔는지 기록이 없습니다';
  const now = rulesStamp();
  if (p.stamp === now) return null;
  return `이 값은 옛 규칙(${p.stamp})에서 뽑았습니다 — 지금은 ${now} 입니다 (${p.fittedAt}, ${p.sizes.join('·')} 판)`;
}
