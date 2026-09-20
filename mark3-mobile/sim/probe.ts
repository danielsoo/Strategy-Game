// 학습된 정책에게 원래 질문을 다시 묻는다
//
//   npm run sim:probe -- --net sim/nets/best.json
//
// 손으로 쓴 평가식에서 massing 의 최적값은 어느 자리 수에서도 0 이었다.
// 하지만 그건 내 평가식 안에서만 참인 말이다 — massing 은 스칼라 하나라
// "전선이 하나일 때만 뭉친다" 같은 조건부 전략을 애초에 표현할 수 없다.
//
// 학습된 정책에는 그 제약이 없다. 특징에 접경국 수와 합쳤을 때의 크기가
// 따로 들어 있으니, 조건부로 뭉치는 게 이득이면 스스로 그렇게 둘 수 있다.
//
// 그래서 센다 — 아군과 합칠 수 있는 자리에서 실제로 몇 번이나 합치는가를,
// 접경국 수별로. 손평가식과 나란히 놓고 본다.

import { makeRng, RNG } from '../src/services/combatSystem';
import { playGame } from './gameSim';
import { AIWeights, LEARNED_WEIGHTS, PERSONALITIES, Policy, Ctx, Action } from '../src/engine/ai';
import { extractFeatures, FEATURE_INDEX } from '../src/engine/features';
import { Cell } from '../src/engine/types';
import { loadNet, predict, Net } from './net';

const { fronts: F_FRONTS, merge: F_MERGE } = FEATURE_INDEX;

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

const ROSTER: AIWeights[] = [
  LEARNED_WEIGHTS,
  PERSONALITIES['확장형'],
  PERSONALITIES['공격형'],
  PERSONALITIES['수비형'],
  PERSONALITIES['균형'],
];

/** 접경국 수별 집계 (특징은 0~1 로 눌려 있으니 되돌린다) */
interface Tally {
  chances: number[];
  merges: number[];
}

function newTally(): Tally {
  return { chances: [0, 0, 0, 0, 0], merges: [0, 0, 0, 0, 0] };
}

function observe(tally: Tally, ctx: Ctx, c: Cell, chosen: Action, all: Action[]): void {
  let hasMerge = false;
  let fronts = 0;
  let chosenIsMerge = false;

  for (const a of all) {
    const f = extractFeatures(ctx, c, a);
    fronts = Math.round(f[F_FRONTS] * 4);
    if (f[F_MERGE] === 1) {
      hasMerge = true;
      if (a === chosen) chosenIsMerge = true;
    }
  }
  if (!hasMerge) return;

  const b = Math.max(0, Math.min(4, fronts));
  tally.chances[b]++;
  if (chosenIsMerge) tally.merges[b]++;
}

function run(label: string, makePolicy: (t: Tally) => Policy, games: number, size: number): Tally {
  const tally = newTally();
  const rng = makeRng(20260919);
  for (let g = 0; g < games; g++) {
    const policies = ROSTER.map(() => makePolicy(tally));
    playGame(ROSTER, size, size, rng, 180, undefined, undefined, policies);
  }

  console.log(`\n${label}`);
  console.log('  접경국  합칠 기회   실제로 합침');
  for (let b = 0; b <= 4; b++) {
    if (tally.chances[b] < 30) continue;
    const r = tally.merges[b] / tally.chances[b];
    const bar = '█'.repeat(Math.round(r * 40));
    console.log(
      `   ${b}개   ${String(tally.chances[b]).padStart(7)}   ${(r * 100)
        .toFixed(1)
        .padStart(5)}%  ${bar}`
    );
  }
  return tally;
}

function main() {
  const file = parseStr('net', 'sim/nets/best.json');
  const games = parseArg('games', 60);
  const size = parseArg('size', 11);

  console.log(`합치기 성향 — ${games}판 · ${size}x${size}`);

  run(
    `손으로 쓴 평가식 (massing = ${LEARNED_WEIGHTS.massing.toFixed(2)})`,
    (t) => ({ onChoose: (ctx, c, chosen, all) => observe(t, ctx, c, chosen, all) }),
    games,
    size
  );

  let net: Net;
  try {
    net = loadNet(file);
  } catch {
    console.log(`\n(${file} 이 없어 학습된 정책은 건너뜀)`);
    return;
  }

  run(
    `학습된 정책 (${file})`,
    (t) => ({
      score: (ctx: Ctx, c: Cell, a: Action) => predict(net, extractFeatures(ctx, c, a)),
      select: (actions: Action[], _r: RNG) => actions[0],
      onChoose: (ctx, c, chosen, all) => observe(t, ctx, c, chosen, all),
    }),
    games,
    size
  );
}

main();
