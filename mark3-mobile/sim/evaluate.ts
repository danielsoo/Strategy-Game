// 본 평가 하네스
//
// 합의한 기준으로 게임을 채점한다. 판수와 시드를 충분히 써서 노이즈에
// 속지 않는 것이 목적이다.
//
//   npm run sim:eval                      기본 300판 × 시드 3개
//   npm run sim:eval -- --games 100
//   npm run sim:eval -- --log summary     판별 기록을 남긴다
//
// 중요한 전제: 모든 나라가 각자 최대한 이기려고 둔다.
// 일부러 약하게 만든 성격끼리 붙이면 게임이 아니라 그 성격들을 재게 된다.
// 그래서 두 가지를 따로 잰다.
//   공정성·결정성  — 같은 수준의 강한 AI 다섯이 붙었을 때
//   전략 다양성    — 서로 다른 전략이 얼마나 견디는지

import { makeRng } from '../src/services/combatSystem';
import { playGame } from './gameSim';
import { PERSONALITIES, AIWeights, LEARNED_WEIGHTS, LEARNED_PROVENANCE } from '../src/engine/ai';
import { rulesStamp, checkProvenance } from '../src/engine/stamp';
import { Recorder, LogLevel } from './recorder';

const pct = (v: number) => (v * 100).toFixed(1) + '%';

function wilson(wins: number, n: number) {
  if (n === 0) return { lo: 0, hi: 1, p: 0 };
  const z = 1.96;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (centre - half) / d), hi: Math.min(1, (centre + half) / d), p };
}

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}
function parseStr(name: string, fallback: string): string {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? fallback : process.argv[i + 1] ?? fallback;
}

interface Criterion {
  name: string;
  value: string;
  pass: boolean;
  target: string;
}

function judge(name: string, value: number, target: string, pass: boolean, fmt = pct): Criterion {
  return { name, value: fmt(value), pass, target };
}

/** 같은 수준의 강한 AI 다섯이 붙는다 — 하네스 공정성과 게임 결정성을 잰다 */
function fairnessRun(games: number, seeds: number[], size: number, rec: Recorder) {
  const seatWins = new Array(5).fill(0);
  let total = 0;
  let turns = 0;
  let limitHits = 0;
  let attacks = 0;
  let gameNo = 0;

  for (const seed of seeds) {
    const rng = makeRng(seed);
    for (let g = 0; g < games; g++) {
      const roster: AIWeights[] = [
        LEARNED_WEIGHTS,
        LEARNED_WEIGHTS,
        LEARNED_WEIGHTS,
        LEARNED_WEIGHTS,
        LEARNED_WEIGHTS,
      ];
      const r = playGame(roster, size, size, rng, 250, undefined, rec.enabled ? {
        recorder: rec,
        gameIndex: gameNo,
        seed,
        labels: ['학습형0', '학습형1', '학습형2', '학습형3', '학습형4'],
      } : undefined);
      gameNo++;
      total++;
      if (r.winner !== null) seatWins[r.winner]++;
      turns += r.turns;
      if (r.turns >= 250) limitHits++;
      attacks += r.attacksMade.reduce((a, b) => a + b, 0);
    }
  }

  console.log(`\n① 공정성·결정성 — 동일 강도 AI 5명 · ${total}판 (시드 ${seeds.length}개)`);
  console.log('─'.repeat(66));
  console.log('자리'.padEnd(8) + '승률'.padStart(10) + '95% 신뢰구간'.padStart(24));
  console.log('─'.repeat(66));
  let worstSeat = 0;
  for (let i = 0; i < 5; i++) {
    const c = wilson(seatWins[i], total);
    worstSeat = Math.max(worstSeat, Math.abs(c.p - 0.2));
    console.log(
      `${i}번`.padEnd(8) + pct(c.p).padStart(10) + `${pct(c.lo)} ~ ${pct(c.hi)}`.padStart(24)
    );
  }
  console.log('─'.repeat(66));
  const avgTurns = turns / total;
  const limitRate = limitHits / total;
  const atkPerGame = attacks / total;
  console.log(
    `평균 ${avgTurns.toFixed(1)}턴 · 턴제한 도달 ${pct(limitRate)} · 게임당 공격 ${atkPerGame.toFixed(1)}회`
  );

  return { worstSeat, avgTurns, limitRate, atkPerGame, total };
}

/** 서로 다른 전략이 얼마나 견디는지 — 학습형은 기준점으로 따로 본다 */
function diversityRun(games: number, seeds: number[], size: number, rec: Recorder) {
  const names = Object.keys(PERSONALITIES);
  const wins = new Array(names.length).fill(0);
  const played = new Array(names.length).fill(0);
  let gameNo = 10000;

  for (const seed of seeds) {
    const rng = makeRng(seed);
    for (let g = 0; g < games; g++) {
      const roster: number[] = [];
      for (let s = 0; s < 5; s++) roster.push((g + s) % names.length);
      const r = playGame(
        roster.map((i) => PERSONALITIES[names[i]]),
        size,
        size,
        rng,
        250,
        undefined,
        rec.enabled
          ? { recorder: rec, gameIndex: gameNo, seed, labels: roster.map((i) => names[i]) }
          : undefined
      );
      gameNo++;
      for (const i of roster) played[i]++;
      if (r.winner !== null) wins[roster[r.winner]]++;
    }
  }

  console.log(`\n② 전략 다양성 — 7성격 자리 회전 · ${games * seeds.length}판`);
  console.log('─'.repeat(66));
  console.log('성격'.padEnd(12) + '승률'.padStart(10) + '95% 신뢰구간'.padStart(24) + '참가'.padStart(8));
  console.log('─'.repeat(66));
  const rows = names.map((n, i) => ({ n, c: wilson(wins[i], played[i]), played: played[i] }));
  rows.sort((a, b) => b.c.p - a.c.p);
  for (const r of rows) {
    const mark = r.n === '학습형' ? '  (기준점)' : '';
    console.log(
      r.n.padEnd(12) +
        pct(r.c.p).padStart(10) +
        `${pct(r.c.lo)} ~ ${pct(r.c.hi)}`.padStart(24) +
        String(r.played).padStart(8) +
        mark
    );
  }
  console.log('─'.repeat(66));

  const handmade = rows.filter((r) => r.n !== '학습형');
  const top = Math.max(...handmade.map((r) => r.c.p));
  const bottom = Math.min(...handmade.map((r) => r.c.p));
  const learned = rows.find((r) => r.n === '학습형')!.c.p;
  return { top, bottom, learned };
}

function main() {
  const games = parseArg('games', 100);
  const size = parseArg('size', 11);
  const level = parseStr('log', 'off') as LogLevel;
  // 시드를 바꿔 다시 재는 것까지가 측정이다 — 같은 시드로 세 번 재고 '진짜'
  // 라고 할 뻔한 적이 있다.  --seeds 1,2,3
  const seeds = parseStr('seeds', '4242,13337,90210').split(',').map(Number);

  // --weights 'territory=2.1,units=1.6,...' — 학습 후보를 ai.ts 를 고치기 전에
  // 같은 판정에 올려본다. LEARNED_WEIGHTS 객체를 그대로 덮으므로 '학습형' 자리도
  // 함께 바뀐다(PERSONALITIES['학습형'] 이 같은 객체를 가리킨다).
  const wArg = parseStr('weights', '');
  if (wArg) {
    for (const kv of wArg.split(',')) {
      const [k, v] = kv.split('=');
      if (!(k in LEARNED_WEIGHTS)) throw new Error(`모르는 가중치 ${k}`);
      (LEARNED_WEIGHTS as unknown as Record<string, number>)[k] = Number(v);
    }
  }

  const rec = new Recorder(level);

  console.log(`본 평가 — ${size}x${size} · 시드 ${seeds.join(', ')}` + (wArg ? ' · 후보 가중치' : ''));

  /*
    이 가중치가 지금 규칙에서 나온 것인가.

    규칙을 건드릴 때마다 다시 학습하면 끝이 없다. 그렇다고 기억에 맡기면
    옛 규칙에서 뽑은 값을 그대로 쓰게 된다. 언제 다시 해야 하는지를 사람이
    아니라 하네스가 기억하게 한다.
  */
  const stale = checkProvenance(LEARNED_PROVENANCE);
  console.log(
    `규칙 도장 ${rulesStamp()}` + (stale ? `  ⚠ ${stale}` : `  (가중치와 같은 규칙)`)
  );
  if (rec.enabled) console.log(`기록 수준: ${level}`);

  const fair = fairnessRun(games, seeds, size, rec);
  const div = diversityRun(games, seeds, size, rec);

  const criteria: Criterion[] = [
    judge('하네스 공정성 (자리 편차)', fair.worstSeat, '< 5%p', fair.worstSeat < 0.05),
    judge('결정성 (턴제한 도달)', fair.limitRate, '< 20%', fair.limitRate < 0.2),
    /*
      게임 길이 밴드는 내가 근거 없이 80~150 으로 잡아둔 것이었고, 직접
      해보니 틀렸다. 21x21 을 한 판 두니 22턴에 331칸이 다섯 나라로 다 갈리고
      41턴에 영향력 승리로 끝났다 — 늘어지지 않고 비어 있지도 않았다.
      11x11 은 30턴대에 끝난다. 그런데 밴드는 둘 다 '미달' 이라고 했다.

      늘어지는지는 '턴제한 도달' 이 이미 본다. 여기서 볼 것은 판이 시작하자마자
      끝나지 않는가뿐이다. 그래서 아래를 25 로 내리고 위는 남긴다.
    */
    judge('게임 길이', fair.avgTurns, '25~150턴', fair.avgTurns >= 25 && fair.avgTurns <= 150, (v) =>
      v.toFixed(1) + '턴'
    ),
    judge('전투의 의미 (게임당 공격)', fair.atkPerGame, '≥ 8회', fair.atkPerGame >= 8, (v) =>
      v.toFixed(1) + '회'
    ),
    judge('지배 전략 없음 (최고)', div.top, '< 35%', div.top < 0.35),
    judge('죽은 전략 없음 (최저)', div.bottom, '> 5%', div.bottom > 0.05),
  ];

  console.log('\n③ 판정');
  console.log('─'.repeat(66));
  for (const c of criteria) {
    console.log(
      (c.pass ? '  통과  ' : '  미달  ') + c.name.padEnd(28) + c.value.padStart(10) + `  (${c.target})`
    );
  }
  console.log('─'.repeat(66));
  const passed = criteria.filter((c) => c.pass).length;
  console.log(`${passed}/${criteria.length} 통과 · 학습형 기준점 ${pct(div.learned)}`);

  const dir = rec.flush();
  if (dir) console.log(`\n기록 저장: ${dir}`);
}

main();
