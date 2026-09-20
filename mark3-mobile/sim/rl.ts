// 자가대전으로 가치함수를 배운다
//
//   npm run sim:rl                       기본
//   npm run sim:rl -- --iters 6 --games 60 --epochs 10
//   npm run sim:rl -- --eval sim/nets/best.json    학습된 망만 평가
//
// 지금까지의 '학습'은 내가 쓴 평가식 위에서 숫자 14개를 고르는 일이었다.
// 그러면 내가 안 적어둔 전략은 후보에조차 없다. 여기서는 수를 특징 40개로
// 바꿔 신경망에 넘기고, "이 수를 두면 이길 확률"을 승패로부터 직접 배운다.
// 무엇이 중요한지는 학습기가 정한다.
//
// 몬테카를로다 — 한 판에서 둔 모든 수에 그 판의 결과를 그대로 라벨로 붙인다.
// 편향은 없고 분산이 크다. 그래서 표본을 많이 본다.

import * as fs from 'fs';
import { makeRng, RNG } from '../src/services/combatSystem';
import { playGame } from './gameSim';
import { AIWeights, LEARNED_WEIGHTS, PERSONALITIES, Policy, Ctx, Action } from '../src/engine/ai';
import { extractFeatures, FEATURE_COUNT } from '../src/engine/features';
import { Cell } from '../src/engine/types';
import { createNet, loadNet, saveNet, predict, trainBatch, Net } from './net';

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}
function parseStr(name: string): string | null {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}

function wilson(p: number, n: number): [number, number] {
  const z = 1.96;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - s) / d, (c + s) / d];
}

/** 한 판에서 모은 수 하나 */
interface Sample {
  x: number[];
  nation: number;
}

/**
 * 망으로 수를 고르는 정책.
 *
 * epsilon 이 0 이면 순수하게 최고점만 둔다. 학습 중에는 조금 섞어야 한다 —
 * 늘 같은 수만 두면 안 둬본 수가 좋은지 나쁜지 영영 모른다.
 */
function netPolicy(
  net: Net,
  epsilon: number,
  collect: ((x: number[]) => void) | null,
  sampleRate: number,
  rng: RNG
): Policy {
  return {
    score: (ctx: Ctx, c: Cell, a: Action) => predict(net, extractFeatures(ctx, c, a)),
    select: (actions: Action[], r: RNG) =>
      epsilon > 0 && r() < epsilon ? actions[Math.floor(r() * actions.length)] : actions[0],
    onChoose: collect
      ? (ctx: Ctx, c: Cell, chosen: Action) => {
          if (rng() < sampleRate) collect(extractFeatures(ctx, c, chosen));
        }
      : undefined,
  };
}

/** 손으로 쓴 평가식 + 약간의 탐색. 첫 자료를 모을 때 쓴다. */
function handPolicy(
  epsilon: number,
  collect: ((x: number[]) => void) | null,
  sampleRate: number,
  rng: RNG
): Policy {
  return {
    select: (actions: Action[], r: RNG) =>
      epsilon > 0 && r() < epsilon ? actions[Math.floor(r() * actions.length)] : actions[0],
    onChoose: collect
      ? (ctx: Ctx, c: Cell, chosen: Action) => {
          if (rng() < sampleRate) collect(extractFeatures(ctx, c, chosen));
        }
      : undefined,
  };
}

const ROSTER: AIWeights[] = [
  LEARNED_WEIGHTS,
  PERSONALITIES['확장형'],
  PERSONALITIES['공격형'],
  PERSONALITIES['수비형'],
  PERSONALITIES['균형'],
];

/**
 * 자료 모으기 — 다섯 자리 모두 같은 정책으로 두게 한다.
 * 한 자리만 학습 정책으로 두면 나머지 넷의 수는 영영 못 배운다.
 */
function collectGames(
  makePolicy: (collect: (x: number[]) => void) => Policy,
  games: number,
  size: number,
  rng: RNG
): { xs: number[][]; ys: number[] } {
  const xs: number[][] = [];
  const ys: number[] = [];

  for (let g = 0; g < games; g++) {
    const perNation: Sample[][] = [[], [], [], [], []];
    const policies = ROSTER.map((_, id) =>
      makePolicy((x) => {
        perNation[id].push({ x, nation: id });
      })
    );
    const r = playGame(ROSTER, size, size, rng, 180, undefined, undefined, policies);
    for (let id = 0; id < 5; id++) {
      const y = r.winner === id ? 1 : 0;
      for (const s of perNation[id]) {
        xs.push(s.x);
        ys.push(y);
      }
    }
  }
  return { xs, ys };
}

/** 학습된 망 한 자리 vs 손으로 만든 네 자리 */
function evaluate(net: Net, games: number, size: number, seed: number): number {
  const rng = makeRng(seed);
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const policies: (Policy | undefined)[] = [
      netPolicy(net, 0, null, 0, rng),
      undefined,
      undefined,
      undefined,
      undefined,
    ];
    const r = playGame(ROSTER, size, size, rng, 180, undefined, undefined, policies);
    if (r.winner === 0) wins++;
  }
  return wins / games;
}

function train(net: Net, xs: number[][], ys: number[], epochs: number, lr: number, rng: RNG): number {
  const idx = xs.map((_, i) => i);
  const batch = 64;
  let last = 0;
  for (let e = 0; e < epochs; e++) {
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    let sum = 0;
    let n = 0;
    for (let s = 0; s < idx.length; s += batch) {
      const part = idx.slice(s, s + batch);
      sum += trainBatch(net, part.map((k) => xs[k]), part.map((k) => ys[k]), lr);
      n++;
    }
    last = sum / Math.max(1, n);
  }
  return last;
}

function main() {
  const evalOnly = parseStr('eval');
  const size = parseArg('size', 11);
  const evalGames = parseArg('evalgames', 200);

  if (evalOnly) {
    const net = loadNet(evalOnly);
    const p = evaluate(net, evalGames, size, 20260919);
    const [lo, hi] = wilson(p, evalGames);
    console.log(
      `${evalOnly}\n5인 게임 ${evalGames}판 — ${(p * 100).toFixed(1)}%  [${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}]  (학습형 78.3%, 무작위 20%)`
    );
    return;
  }

  const iters = parseArg('iters', 6);
  const games = parseArg('games', 60);
  const epochs = parseArg('epochs', 10);
  const lr = parseArg('lr', 0.003);
  const sampleRate = parseArg('sample', 0.15);
  const rng = makeRng(parseArg('seed', 20260919));

  const net = createNet([FEATURE_COUNT, 24, 16, 1], rng);
  fs.mkdirSync('sim/nets', { recursive: true });

  console.log(
    `가치함수 학습 — ${iters}회 · 회당 ${games}판 · 특징 ${FEATURE_COUNT}개 · 망 ${net.sizes.join('-')}\n`
  );

  let bestRate = -1;
  for (let it = 1; it <= iters; it++) {
    // 첫 회는 손으로 쓴 평가식으로 자료를 모은다. 무작위 망으로 시작하면
    // 아무 데나 두는 판만 쌓여서 이기는 수가 뭔지 배울 거리가 없다.
    const eps = it === 1 ? 0.15 : Math.max(0.05, 0.2 - it * 0.02);
    const make = (collect: (x: number[]) => void): Policy =>
      it === 1
        ? handPolicy(eps, collect, sampleRate, rng)
        : netPolicy(net, eps, collect, sampleRate, rng);

    const t0 = Date.now();
    const { xs, ys } = collectGames(make, games, size, rng);
    const gen = ((Date.now() - t0) / 1000).toFixed(0);

    const loss = train(net, xs, ys, epochs, lr, rng);
    const rate = evaluate(net, 80, size, 777000 + it);
    const posRate = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length);

    console.log(
      `${String(it).padStart(2)}회 | 표본 ${String(xs.length).padStart(6)} (승 ${(posRate * 100).toFixed(0)}%) · 손실 ${loss.toFixed(4)} · 탐색 ${(eps * 100).toFixed(0)}% · ${gen}초 | 평가 ${(rate * 100).toFixed(1)}%`
    );

    saveNet(net, `sim/nets/iter${it}.json`);
    if (rate > bestRate) {
      bestRate = rate;
      saveNet(net, 'sim/nets/best.json');
    }
  }

  console.log(`\n가장 좋았던 망: ${(bestRate * 100).toFixed(1)}% (sim/nets/best.json)`);
  const p = evaluate(loadNet('sim/nets/best.json'), evalGames, size, 20260919);
  const [lo, hi] = wilson(p, evalGames);
  console.log(
    `본 평가 ${evalGames}판 — ${(p * 100).toFixed(1)}%  [${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}]  (학습형 78.3%, 무작위 20%)`
  );
}

main();
