// 이 게임에서 '병력 집중'은 어떻게 표현되는가
//
//   npm run sim:concentration -- --games 150
//
// massing 의 최적값은 어느 자리 수에서도, 명령 수를 제한해도 0 이었다.
// 그런데 이 게임에는 이미 집중 기제가 하나 있다 — 협공이다. 인접한 아군이
// 전력을 보태주니, 두 부대가 나란히 서면 합친 것과 같은 힘으로 싸우면서
// 공격은 두 번 한다. 그러면 한 칸에 포개는 것은 순손해다.
//
// 그게 맞다면, 협공을 끄면 뭉치기가 살아나야 한다. 이걸 잰다.
import { makeRng } from '../src/services/combatSystem';
import { playGame } from './gameSim';
import { AIWeights, LEARNED_WEIGHTS, PERSONALITIES } from '../src/engine/ai';
import { DEFAULT_ECONOMY, EconomyConfig } from '../src/engine/types';

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

const CHALLENGERS = ['확장형', '공격형', '수비형', '균형'].map((c) => PERSONALITIES[c]);

function rate(eco: EconomyConfig, m: number, games: number, size: number, seed: number): number {
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
  const games = parseArg('games', 150);
  const size = parseArg('size', 11);
  const seed = parseArg('seed', 20260920);
  const LEVELS = [0, 0.6, 1.5, 3];
  const FLANKS = [0, 0.15, 0.3, 0.6];

  console.log(`협공과 뭉치기 — ${games}판씩 · ${size}x${size} · 무작위 기준선 20%\n`);
  console.log('  협공      ' + LEVELS.map((m) => ('뭉치기 ' + m).padStart(10)).join(''));
  for (const f of FLANKS) {
    const eco = { ...DEFAULT_ECONOMY, flankSupport: f };
    const row = LEVELS.map((m) => ((rate(eco, m, games, size, seed) * 100).toFixed(1) + '%').padStart(10));
    const mark = f === DEFAULT_ECONOMY.flankSupport ? ' ← 지금' : '';
    console.log(`  ${f.toFixed(2).padStart(6)}  ${row.join('')}${mark}`);
  }
}

main();
