// 지휘 용량 — 병력을 모으는 것이 이득이 되게 만드는 규칙
//
//   npm run sim:command -- --games 200
//
// 지금 규칙에서는 병력을 쪼개는 쪽이 언제나 옳다. 행동 횟수가 부대 수에
// 비례하기 때문이다 — 10명 넷은 턴당 네 번 치고, 40명 하나는 한 번 친다.
// 그래서 자가대전 학습은 매번 massing 0 으로 수렴했고, 협공을 넣어도
// 측면 지원을 넣어도 살아나지 않았다. 가중치가 아니라 규칙의 문제였다.
//
// 한 턴에 내릴 수 있는 명령 수를 거점 수에 묶으면, 쪼갤수록 노는 부대가
// 생긴다. 그러면 모으는 쪽이 비로소 효율적인 선택이 된다.
//
// 여기서 재는 것은 두 가지다.
//   1. 판이 망가지지 않는가 (턴 제한, 공격 횟수, 판 길이)
//   2. massing 의 최적값이 0 에서 움직이는가  ← 이게 핵심이다

import { makeRng, RNG } from '../src/services/combatSystem';
import { playGame } from './gameSim';
import { AIWeights, LEARNED_WEIGHTS, PERSONALITIES } from '../src/engine/ai';
import { DEFAULT_ECONOMY, EconomyConfig } from '../src/engine/types';

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

const CHALLENGERS = ['확장형', '공격형', '수비형', '균형'].map((c) => PERSONALITIES[c]);

interface Health {
  turns: number;
  limitHits: number;
  attacks: number;
  vassals: number;
}

function health(eco: EconomyConfig, games: number, size: number, seed: number): Health {
  const rng = makeRng(seed);
  let turns = 0;
  let limitHits = 0;
  let attacks = 0;
  let vassals = 0;
  for (let i = 0; i < games; i++) {
    const r = playGame([LEARNED_WEIGHTS, ...CHALLENGERS], size, size, rng, 180, eco);
    turns += r.turns;
    if (r.turns >= 180) limitHits++;
    attacks += r.attacksMade.reduce((a, b) => a + b, 0);
    vassals += r.vassalsHeld.reduce((a, b) => a + b, 0);
  }
  return {
    turns: turns / games,
    limitHits: limitHits / games,
    attacks: attacks / games,
    vassals: vassals / games,
  };
}

/** massing 만 바꾼 나라가 나머지 넷을 상대로 얼마나 이기는가 */
function massingRate(eco: EconomyConfig, m: number, games: number, size: number, seed: number): number {
  const rng = makeRng(seed);
  const me: AIWeights = { ...LEARNED_WEIGHTS, massing: m };
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const r = playGame([me, ...CHALLENGERS], size, size, rng, 180, eco);
    if (r.winner === 0) wins++;
  }
  return wins / games;
}

function main() {
  const games = parseArg('games', 200);
  const size = parseArg('size', 11);
  const seed = parseArg('seed', 20260920);

  const SETTINGS: Array<[string, EconomyConfig]> = [
    ['제한 없음 (지금 규칙)', DEFAULT_ECONOMY],
    ['기본 3 + 거점당 2', { ...DEFAULT_ECONOMY, commandBase: 3, commandPerHub: 2 }],
    ['기본 2 + 거점당 1.5', { ...DEFAULT_ECONOMY, commandBase: 2, commandPerHub: 1.5 }],
    ['기본 5 + 거점당 3', { ...DEFAULT_ECONOMY, commandBase: 5, commandPerHub: 3 }],
    // 한도는 사실상 없고 순서 규칙만 켠다. 앞선 측정에서 두 가지를 같이
    // 바꿔놓고 좋아졌다고 말할 뻔했다 — 어느 쪽이 효과인지 갈라야 한다.
    ['순서만 (한도 없음)', { ...DEFAULT_ECONOMY, commandBase: 999, commandPerHub: 0 }],
  ];

  console.log(`지휘 용량 — ${games}판씩 · ${size}x${size}\n`);
  console.log('1. 판이 망가지지 않는가');
  console.log('  설정                     평균 턴   턴제한   공격/판   속국/판');
  for (const [label, eco] of SETTINGS) {
    const h = health(eco, Math.min(games, 120), size, seed);
    console.log(
      `  ${label.padEnd(22)} ${h.turns.toFixed(1).padStart(6)}   ${(h.limitHits * 100)
        .toFixed(1)
        .padStart(5)}%   ${h.attacks.toFixed(1).padStart(6)}   ${h.vassals.toFixed(2).padStart(6)}`
    );
  }

  console.log('\n2. massing 의 최적값이 움직이는가 (무작위 기준선 20%)');
  const LEVELS = [0, 0.6, 1.5, 3];
  for (const [label, eco] of SETTINGS) {
    const parts: string[] = [];
    for (const m of LEVELS) {
      const p = massingRate(eco, m, games, size, seed);
      const [lo, hi] = wilson(p, games);
      parts.push(`${(p * 100).toFixed(1)}%[${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}]`);
    }
    console.log(`  ${label.padEnd(22)} ${parts.map((s) => s.padStart(18)).join(' ')}`);
  }
  console.log(`  ${''.padEnd(22)} ${LEVELS.map((m) => `massing ${m}`.padStart(18)).join(' ')}`);
}

main();
