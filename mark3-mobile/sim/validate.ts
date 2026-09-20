// 측정 도구 검증
//
// 승률 표를 믿기 전에 "이 표가 공정한가"를 먼저 확인한다.
// 하네스에 편향이 있으면 그 위에서 내린 모든 판단이 틀린다.
//
//   npm run sim:validate
//   npm run sim:validate -- --games 300
//
// 확인하는 것
//  1. A/A 검정 — 똑같은 AI 를 다섯 자리에 넣는다. 20% 씩 나와야 한다.
//     어긋나면 자리(턴 순서·본진 위치)에 이득이 있다는 뜻이다.
//  2. 신뢰구간 — 몇 판을 돌려야 차이를 구분할 수 있는지 숫자로 보여준다.
//  3. 시드 안정성 — 시드를 바꿔도 결론이 유지되는지.

import { makeRng } from '../src/services/combatSystem';
import { playGame } from './gameSim';
import { PERSONALITIES, AIWeights, LEARNED_WEIGHTS } from '../src/engine/ai';

/**
 * 윌슨 점수 구간 (95%).
 * 정규근사는 표본이 작거나 비율이 0/1 에 가까우면 엉뚱한 값을 내므로 쓰지 않는다.
 */
function wilson(wins: number, n: number): { lo: number; hi: number; p: number } {
  if (n === 0) return { lo: 0, hi: 1, p: 0 };
  const z = 1.96;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (centre - half) / d), hi: Math.min(1, (centre + half) / d), p };
}

const pct = (v: number) => (v * 100).toFixed(1) + '%';

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

/** 다섯 자리에 같은 AI 를 앉히고, 자리별 승률이 고른지 본다 */
function aaTest(w: AIWeights, games: number, size: number, seed: number, label: string) {
  const rng = makeRng(seed);
  const wins = new Array(5).fill(0);
  let draws = 0;
  let turns = 0;
  let limitHits = 0;

  for (let g = 0; g < games; g++) {
    const r = playGame([w, w, w, w, w], size, size, rng);
    if (r.winner === null) draws++;
    else wins[r.winner]++;
    turns += r.turns;
    if (r.turns >= 250) limitHits++;
  }

  console.log(`\nA/A 검정 — ${label} × 5자리 · ${games}판`);
  console.log('─'.repeat(64));
  console.log('자리'.padEnd(8) + '승'.padStart(6) + '승률'.padStart(10) + '95% 신뢰구간'.padStart(22));
  console.log('─'.repeat(64));
  let worst = 0;
  for (let i = 0; i < 5; i++) {
    const c = wilson(wins[i], games);
    const off = Math.abs(c.p - 0.2);
    if (off > worst) worst = off;
    const flag = c.lo > 0.2 || c.hi < 0.2 ? '  ← 20% 밖' : '';
    console.log(
      `${i}번`.padEnd(8) +
        String(wins[i]).padStart(6) +
        pct(c.p).padStart(10) +
        `${pct(c.lo)} ~ ${pct(c.hi)}`.padStart(22) +
        flag
    );
  }
  console.log('─'.repeat(64));
  console.log(
    `무승부 ${pct(draws / games)} · 평균 ${(turns / games).toFixed(1)}턴 · 턴제한 ${pct(
      limitHits / games
    )}`
  );
  console.log(
    `자리 편차 최대 ${(worst * 100).toFixed(1)}%p — ` +
      (worst < 0.05
        ? '공정하다고 볼 만하다'
        : worst < 0.1
        ? '약간의 자리 이점이 있다'
        : '자리 이점이 크다. 이 위의 성격 비교는 신뢰하기 어렵다')
  );
  return worst;
}

/** 몇 판을 돌려야 차이를 구분할 수 있는지 */
function precisionTable() {
  console.log('\n표본 크기와 분해능 (승률 20% 부근, 95% 신뢰구간)');
  console.log('─'.repeat(64));
  console.log('판수'.padStart(6) + '구간 폭'.padStart(16) + '구분 가능한 최소 차이'.padStart(28));
  console.log('─'.repeat(64));
  for (const n of [60, 100, 160, 200, 300, 500]) {
    const c = wilson(Math.round(0.2 * n), n);
    const width = c.hi - c.lo;
    // 두 비율이 겹치지 않으려면 대략 구간 폭만큼 떨어져 있어야 한다
    console.log(
      String(n).padStart(6) +
        `±${((width / 2) * 100).toFixed(1)}%p`.padStart(16) +
        `약 ${(width * 100).toFixed(0)}%p`.padStart(28)
    );
  }
  console.log('─'.repeat(64));
}

/** 시드를 바꿔도 순위가 유지되는가 */
function seedStability(games: number, size: number) {
  const names = Object.keys(PERSONALITIES);
  const seeds = [11111, 22222, 33333];
  const table: Record<string, number[]> = {};
  for (const nme of names) table[nme] = [];

  for (const seed of seeds) {
    const rng = makeRng(seed);
    const wins = new Array(names.length).fill(0);
    const played = new Array(names.length).fill(0);
    for (let g = 0; g < games; g++) {
      const roster: number[] = [];
      for (let s = 0; s < 5; s++) roster.push((g + s) % names.length);
      const r = playGame(
        roster.map((i) => PERSONALITIES[names[i]]),
        size,
        size,
        rng
      );
      for (const i of roster) played[i]++;
      if (r.winner !== null) wins[roster[r.winner]]++;
    }
    names.forEach((nme, i) => table[nme].push(wins[i] / Math.max(1, played[i])));
  }

  console.log(`\n시드 안정성 — 시드 3개 × ${games}판`);
  console.log('─'.repeat(64));
  console.log('성격'.padEnd(12) + seeds.map((s) => String(s).padStart(10)).join('') + '폭'.padStart(10));
  console.log('─'.repeat(64));
  for (const nme of names) {
    const vs = table[nme];
    const spread = Math.max(...vs) - Math.min(...vs);
    console.log(
      nme.padEnd(12) + vs.map((v) => pct(v).padStart(10)).join('') + `${(spread * 100).toFixed(1)}%p`.padStart(10)
    );
  }
  console.log('─'.repeat(64));
}

function main() {
  const games = parseArg('games', 150);
  const size = parseArg('size', 11);

  console.log(`측정 도구 검증 — ${size}x${size}`);

  // 1. 하네스가 공정한가
  const bias1 = aaTest(LEARNED_WEIGHTS, games, size, 4242, '학습형');
  const bias2 = aaTest(PERSONALITIES['균형'], games, size, 9999, '균형');

  // 2. 표본 크기가 얼마나 필요한가
  precisionTable();

  // 3. 결론이 시드에 흔들리는가
  seedStability(Math.max(70, Math.round(games * 0.7)), size);

  console.log('\n종합');
  const worst = Math.max(bias1, bias2);
  if (worst >= 0.1) {
    console.log('  하네스에 자리 이점이 크다. 성격 비교 전에 이것부터 고쳐야 한다.');
  } else if (worst >= 0.05) {
    console.log('  약한 자리 이점이 있다. 자리를 회전시켜 쓰면 상쇄된다(토너먼트 모드).');
  } else {
    console.log('  하네스는 공정하다고 볼 만하다.');
  }
}

main();
