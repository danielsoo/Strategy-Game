// 판이 커지면 어떤 가중치가 달라져야 하나
//
// 11x11 에서 뽑은 LEARNED_WEIGHTS 가 21x21 에서는 11.8% 로 바닥이다. 큰 판에서는
// 수비형(49%)·경제형(48%) 이 이긴다. 무엇이 그 차이를 만드는지, 가중치를 하나씩
// 밀어보며 승률로 확인한다.
//
// 자리를 돌린다. 안 돌리면 자리 이점이 가중치 효과로 둔갑한다.
//
// ⚠ 여기서 나온 값을 그대로 쓰면 안 된다. 이 하네스는 "넷은 그대로인데 하나만
// 바꾸면?"을 잰다. 그건 이 판에 대한 대응 전략이지 더 나은 수가 아니다.
// 실제로 aggression 을 0.3 으로 내리면 여기서는 8.6% → 24.3% 로 오르지만,
// 다섯이 모두 그러면 21x21 이 80턴에서 184턴이 되고 공격이 59회에서 10회가
// 된다. 아무도 안 싸우는 것이다.
//
// 고른 값은 반드시 sim/boards.ts 로 판 전체가 어떻게 되는지 같이 보고 정한다.
import { makeRng } from '../src/services/combatSystem';
import { AIWeights, LEARNED_WEIGHTS, PERSONALITIES } from '../src/engine/ai';
import { playGame } from './gameSim';

const FOES = ['확장형', '수비형', '공격형', '경제형'].map((k) => PERSONALITIES[k]);
const SIZE = Number(process.argv[process.argv.indexOf('--size') + 1]) || 21;
const SEEDS = Number(process.argv[process.argv.indexOf('--seeds') + 1]) || 14;

/** 후보를 자리마다 앉혀 승률을 잰다 */
function measure(cand: AIWeights): { rate: number; lo: number; hi: number; n: number; turns: number } {
  let wins = 0, n = 0, turns = 0;
  for (let s = 0; s < SEEDS; s++) {
    for (let seat = 0; seat < 5; seat++) {
      const roster: AIWeights[] = [...FOES];
      roster.splice(seat, 0, cand);
      roster.length = 5;
      const r = playGame(roster, SIZE, SIZE, makeRng(9000 + s * 17 + seat), 250);
      if (r.winner === seat) wins++;
      turns += r.turns;
      n++;
    }
  }
  // 윌슨 구간 — 표본이 적을 때 점추정만 보고 채택하면 반드시 되돌리게 된다
  const p = wins / n, z = 1.96;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { rate: p, lo: (c - m) / d, hi: (c + m) / d, n, turns: turns / n };
}

const KNOBS: Array<[keyof AIWeights, number[]]> = [
  ['homeDefense', [0.38, 1.0, 1.6, 2.2]],
  ['aggression', [0.66, 0.5, 0.4, 0.3]],
  ['targetArmy', [20.23, 26, 32, 38]],
  ['advance', [0.24, 0.8, 1.5, 2.2]],
  ['explore', [0.79, 1.5, 2.5]],
  ['expansion', [2.27, 1.6, 3.0]],
  ['castleAssault', [16.05, 22, 30]],
];

const base = measure(LEARNED_WEIGHTS);
console.log(`${SIZE}x${SIZE} · 자리당 ${SEEDS}시드 · 설정당 ${base.n}판\n`);
console.log(`  기준 (LEARNED_WEIGHTS)   ${(base.rate * 100).toFixed(1)}%  [${(base.lo * 100).toFixed(1)} ~ ${(base.hi * 100).toFixed(1)}]  ${base.turns.toFixed(0)}턴\n`);

for (const [key, values] of KNOBS) {
  console.log(`  ${key}`);
  for (const v of values) {
    const cand = { ...LEARNED_WEIGHTS, [key]: v } as AIWeights;
    const r = measure(cand);
    const mark = r.lo > base.hi ? ' ↑' : r.hi < base.lo ? ' ↓' : '';
    console.log(
      `    ${String(v).padStart(7)}  ${(r.rate * 100).toFixed(1).padStart(5)}%` +
      `  [${(r.lo * 100).toFixed(1)} ~ ${(r.hi * 100).toFixed(1)}]  ${r.turns.toFixed(0)}턴${mark}`
    );
  }
  console.log();
}
