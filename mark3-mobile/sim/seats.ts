// 자리가 공정한가 — 동일 AI 다섯으로 A/A
//
// 지도 위치는 createGameState 가 섞지만 '차례 순서'는 안 섞는다. 그래서 늘
// 먼저 두는 자리가 이득을 본다. 재보니 그대로였다.
//
//   고치기 전  0번 26.4% · 1번 21.8% · 2번 19.7% · 3번 17.9% · 4번 14.2%  (21x21)
//   고친 뒤    0번 20.6% · 1번 21.7% · 2번 19.6% · 3번 18.2% · 4번 20.0%
//
// 두 가지가 겹쳐 있었다. 선수를 늘 0번이 잡는 것과, 보호자 선택의 동점을
// 늘 낮은 번호가 가져가는 것(vassals.ts stepVoluntarySubmission).
//
// 같은 시드로 세 번 재고 '진짜'라고 할 뻔했다. 시드를 바꿔 다시 재는 것까지가
// 측정이다 — --base 로 시드 뭉치를 갈아끼운다.

import { makeRng } from '../src/services/combatSystem';
import { LEARNED_WEIGHTS } from '../src/engine/ai';
import { playGame } from './gameSim';

const BASE = Number(process.argv[process.argv.indexOf('--base') + 1]) || 31000;

function wilson(w: number, n: number) {
  const p = w / n, z = 1.96, d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { p, lo: (c - m) / d, hi: (c + m) / d };
}

for (const size of [11, 21]) {
  const seatWins = new Array(5).fill(0);
  let n = 0, draws = 0;
  for (let s = 0; s < 3; s++) {
    const rng = makeRng(BASE + s * 977);
    for (let g = 0; g < 300; g++) {
      const r = playGame(new Array(5).fill(LEARNED_WEIGHTS), size, size, rng, 250);
      n++;
      if (r.winner === null) draws++;
      else seatWins[r.winner]++;
    }
  }
  let worst = 0;
  const rows = seatWins.map((w, i) => {
    const c = wilson(w, n);
    worst = Math.max(worst, Math.abs(c.p - 0.2));
    return `${i}번 ${(c.p * 100).toFixed(1)}% [${(c.lo * 100).toFixed(1)}~${(c.hi * 100).toFixed(1)}]`;
  });
  console.log(`\n${size}x${size} · ${n}판 · 무승부 ${draws}`);
  console.log('  ' + rows.join('  ·  '));
  console.log(`  최대 편차 ${(worst * 100).toFixed(1)}%p`);
}
