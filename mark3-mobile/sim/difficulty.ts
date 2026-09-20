// 난이도 보정 — 1대1 기준
//
//   npm run sim:difficulty -- --games 300
//
// 난이도의 정의는 "사람 기준 상대로 몇 % 이기느냐"다. 감으로 "무작위 30% 면
// 쉽겠지" 하면 실제로는 5% 거나 45% 일 수 있다. 재서 맞춘다.
//
// 기준(사람 자리)은 온전한 학습형 AI 로 둔다. 난이도 '어려움'이 곧 기준이므로
// 정의상 50% 가 나와야 하고, 나머지가 그 위아래로 고르게 벌어지면 된다.

import { makeRng } from '../src/services/combatSystem';
import { playGame } from './gameSim';
import { LEARNED_WEIGHTS, Policy } from '../src/engine/ai';
import { DIFFICULTIES, difficultyPolicy } from '../src/engine/difficulty';
import { DEFAULT_ECONOMY } from '../src/engine/types';

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

function wilson(p: number, n: number): [number, number] {
  const z = 1.96;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - s) / d, (c + s) / d];
}

function main() {
  const games = parseArg('games', 300);
  const size = parseArg('size', 11);

  console.log(`난이도 보정 — 1대1 · ${games}판씩 · ${size}x${size}`);
  console.log('기준 자리는 온전한 학습형 AI (사람 대역)\n');
  console.log('  난이도        승률              95% 구간        평균 턴');

  for (const d of DIFFICULTIES) {
    const rng = makeRng(20260920);
    let wins = 0;
    let turns = 0;
    for (let i = 0; i < games; i++) {
      // 자리를 번갈아 앉혀 자리 이점을 없앤다
      const aiFirst = i % 2 === 0;
      const ai = difficultyPolicy(d, rng);
      const policies: (Policy | undefined)[] = aiFirst ? [ai, undefined] : [undefined, ai];
      const r = playGame(
        [LEARNED_WEIGHTS, LEARNED_WEIGHTS],
        size,
        size,
        rng,
        250,
        DEFAULT_ECONOMY,
        undefined,
        policies,
        (st) => {
          // 핸디캡은 판을 만든 직후에 나라에 박는다
          st.nations[aiFirst ? 0 : 1].incomeMul = d.incomeMul;
        }
      );
      turns += r.turns;
      if (r.winner === (aiFirst ? 0 : 1)) wins++;
    }
    const p = wins / games;
    const [lo, hi] = wilson(p, games);
    console.log(
      `  ${d.label.padEnd(10)} ${(p * 100).toFixed(1).padStart(5)}%   ` +
        `[${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}]   ${(turns / games).toFixed(0).padStart(5)}`
    );
  }
}

main();
