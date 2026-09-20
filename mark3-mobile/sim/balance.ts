// 판의 균형을 계 수준에서 맞춘다
//
//   npm run sim:balance -- --rounds 30 --games 240
//
// 지금까지는 성격을 하나씩 손으로 고쳤다. 그런데 규칙이 바뀌면 균형은 계 전체가
// 움직인다 — 기본값에서 해로운 항 둘을 걷어내자 그 이득을 확장형이 가장 크게
// 가져가 51% 로 독주했고, 행정비 지수로 누르자 판이 141턴으로 늘어졌다.
// 하나를 고치면 다른 하나가 어긋난다.
//
// 그래서 개별 성격이 아니라 '규칙 손잡이'를 탐색한다. 목적은 승률 하나가 아니라
// 판이 고르고 건강한가다.
//
// 목적함수를 최저·최고 승률로 잡으면 안 된다. 그건 표본 하나에 크게 흔들려서
// (성격당 ±6%p) 잡음을 언덕오르기 하게 된다. 대신 고르기를 제곱 편차로 재고
// (부드럽고 분산이 작다) 판 길이와 결정성에 벌점을 붙인다.

import { makeRng } from '../src/services/combatSystem';
import { playGame } from './gameSim';
import { PERSONALITIES } from '../src/engine/ai';
import { DEFAULT_ECONOMY, EconomyConfig } from '../src/engine/types';

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

const NAMES = ['학습형', '확장형', '공격형', '수비형', '균형', '경제형', '집중형'];

/** 만지는 손잡이와 그 범위 */
const KNOBS = {
  adminExponent: [1.25, 1.55],
  flankSupport: [0, 0.6],
  neutralDensity: [0.04, 0.16],
  marchBase: [10, 50],
  marchPerUnit: [2, 14],
  unitUpkeep: [0.4, 1.1],
  castleIncome: [15, 35],
} as const;

type Knob = keyof typeof KNOBS;
const KEYS = Object.keys(KNOBS) as Knob[];

interface Measure {
  rates: number[];
  turns: number;
  limitRate: number;
  attacks: number;
}

function measure(eco: EconomyConfig, games: number, seed: number): Measure {
  const rng = makeRng(seed);
  const wins = new Array(NAMES.length).fill(0);
  const played = new Array(NAMES.length).fill(0);
  let turns = 0;
  let limits = 0;
  let attacks = 0;

  for (let g = 0; g < games; g++) {
    const idx = [0, 1, 2, 3, 4].map((i) => (g + i) % NAMES.length);
    const r = playGame(
      idx.map((i) => PERSONALITIES[NAMES[i]]),
      11,
      11,
      rng,
      180,
      eco
    );
    for (const i of idx) played[i]++;
    if (r.winner !== null) wins[idx[r.winner]]++;
    turns += r.turns;
    if (r.turns >= 180) limits++;
    attacks += r.attacksMade.reduce((a: number, b: number) => a + b, 0);
  }

  return {
    rates: wins.map((w, i) => (played[i] > 0 ? w / played[i] : 0)),
    turns: turns / games,
    limitRate: limits / games,
    attacks: attacks / games,
  };
}

/**
 * 점수 — 높을수록 좋다.
 *
 * 고르기는 1/7 에서의 제곱 편차로 잰다. 최저·최고를 쓰면 표본 하나가 튀는 것에
 * 그대로 끌려가지만, 제곱 편차는 일곱 개를 모두 쓰므로 훨씬 덜 흔들린다.
 */
function score(m: Measure): { total: number; even: number; penalty: number } {
  const target = 1 / NAMES.length;
  let sq = 0;
  for (const p of m.rates) sq += (p - target) * (p - target);
  const even = -sq * 100;

  let penalty = 0;
  // 판이 늘어지거나 턴 제한으로 끝나면 재미가 없다
  if (m.limitRate > 0.15) penalty += (m.limitRate - 0.15) * 200;
  if (m.turns > 150) penalty += (m.turns - 150) * 0.2;
  if (m.turns < 70) penalty += (70 - m.turns) * 0.2;
  // 싸움이 없는 평화로운 칠하기 게임이 되면 안 된다
  if (m.attacks < 25) penalty += (25 - m.attacks) * 0.5;

  return { total: even - penalty, even, penalty };
}

function apply(base: EconomyConfig, knobs: Record<Knob, number>): EconomyConfig {
  return { ...base, ...knobs };
}

function main() {
  const rounds = parseArg('rounds', 30);
  const games = parseArg('games', 240);
  const seed = parseArg('seed', 20260920);
  const rng = makeRng(seed + 1);

  let cur: Record<Knob, number> = {} as Record<Knob, number>;
  for (const k of KEYS) cur[k] = DEFAULT_ECONOMY[k] as number;

  const show = (label: string, m: Measure, s: ReturnType<typeof score>) => {
    const rates = m.rates.map((p) => (p * 100).toFixed(0).padStart(3)).join(' ');
    console.log(
      `${label.padEnd(10)} ${rates} | ${m.turns.toFixed(0)}턴 ${(m.limitRate * 100).toFixed(0)}% 공격${m.attacks.toFixed(0)} | 점수 ${s.total.toFixed(2)} (고르기 ${s.even.toFixed(2)} 벌점 ${s.penalty.toFixed(2)})`
    );
  };

  console.log(`균형 탐색 — ${rounds}회 · 회당 ${games}판\n`);
  console.log(`성격 순서: ${NAMES.join(' ')}\n`);

  let bestM = measure(apply(DEFAULT_ECONOMY, cur), games, seed);
  let bestS = score(bestM);
  show('지금', bestM, bestS);

  for (let r = 1; r <= rounds; r++) {
    // 손잡이 하나~둘을 흔든다. 전부 흔들면 무엇이 효과였는지 알 수 없다.
    const next = { ...cur };
    const n = rng() < 0.6 ? 1 : 2;
    const touched: Knob[] = [];
    for (let i = 0; i < n; i++) {
      const k = KEYS[Math.floor(rng() * KEYS.length)];
      const [lo, hi] = KNOBS[k];
      const span = hi - lo;
      next[k] = Math.max(lo, Math.min(hi, next[k] + (rng() + rng() - 1) * span * 0.25));
      touched.push(k);
    }

    const m = measure(apply(DEFAULT_ECONOMY, next), games, seed);
    const s = score(m);
    const better = s.total > bestS.total;
    show(`${r}회${better ? ' ★' : ''}`, m, s);
    console.log(`           ${touched.map((k) => `${k}=${next[k].toFixed(3)}`).join(' ')}`);

    if (better) {
      cur = next;
      bestM = m;
      bestS = s;
    }
  }

  console.log('\n가장 좋았던 손잡이:');
  for (const k of KEYS) {
    const was = DEFAULT_ECONOMY[k] as number;
    const mark = Math.abs(cur[k] - was) > 1e-6 ? '  ←' : '';
    console.log(`  ${k.padEnd(16)} ${was.toFixed(3)} → ${cur[k].toFixed(3)}${mark}`);
  }
  show('최종', bestM, bestS);
}

main();
