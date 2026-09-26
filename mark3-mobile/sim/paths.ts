// 정의의 길과 공포의 길 — 어느 쪽이 더 이기나
//
//   npm run sim:paths -- --size 11 --games 200
//   npm run sim:paths -- --size 21 --games 120 --wj 1.2 --wf 0.9
//
// 같은 학습형 AI 다섯에게 길만 다르게 준다(Nation.path). 판마다 자리를
// [정·공·정·공·정] 과 [공·정·공·정·공] 으로 번갈아 줘서 자리의 유불리를 지운다.
// 나라당 승률을 견준다 — 정의가 셋인 판과 둘인 판이 반씩이므로 나라 수로 나눈다.
//
// 목표는 반반이다. 어느 한 길이 뚜렷이 이기면 사람은 그 길만 걷고, 그러면
// '정의냐 공포냐' 는 선택이 아니라 정답이 된다. 저울추(--wj, --wf 는
// EconomyConfig.justiceWeight·fearWeight)를 돌려가며 맞춘다. 반드시 11 과 21
// 양쪽에서, 시드를 바꿔가며 잰다.

import { makeRng } from '../src/services/combatSystem';
import { playGame } from './gameSim';
import { LEARNED_WEIGHTS } from '../src/engine/ai';
import { DEFAULT_ECONOMY, GameState } from '../src/engine/types';
import { characterOf, PATH_KNOBS } from '../src/engine/reputation';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

function wilson(k: number, n: number): [number, number, number] {
  if (n === 0) return [0, 0, 0];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [p, c - h, c + h];
}

const size = arg('size', 11);
const games = arg('games', 200);
const seed = arg('seed', 4242);
DEFAULT_ECONOMY.justiceWeight = arg('wj', DEFAULT_ECONOMY.justiceWeight);
DEFAULT_ECONOMY.fearWeight = arg('wf', DEFAULT_ECONOMY.fearWeight);
DEFAULT_ECONOMY.annexUnrestTurns = arg('unrest', DEFAULT_ECONOMY.annexUnrestTurns);
DEFAULT_ECONOMY.conquestLoyalty = arg('cloyal', DEFAULT_ECONOMY.conquestLoyalty);
DEFAULT_ECONOMY.annexArmyKeep = arg('keep', DEFAULT_ECONOMY.annexArmyKeep);

// --off conquest,encounters — 길이 그 선택에 닿지 않게 한다(어느 선택이 차이를 만드나)
const offIdx = process.argv.indexOf('--off');
const off = offIdx >= 0 ? process.argv[offIdx + 1].split(',') : [];
for (const k of off) (PATH_KNOBS as Record<string, boolean>)[k] = false;

const rng = makeRng(seed);
const wins = { just: 0, feared: 0, none: 0 };
const seats = { just: 0, feared: 0 };
const charEnd = { just: { just: 0, feared: 0, none: 0 }, feared: { just: 0, feared: 0, none: 0 } };
let turns = 0;
let limit = 0;

for (let g = 0; g < games; g++) {
  const pattern: Array<'just' | 'feared'> =
    g % 2 === 0 ? ['just', 'feared', 'just', 'feared', 'just'] : ['feared', 'just', 'feared', 'just', 'feared'];
  let st: GameState | null = null;
  const r = playGame(Array(5).fill(LEARNED_WEIGHTS), size, size, rng, 250, undefined, undefined, undefined, (s) => {
    st = s;
    s.nations.forEach((n, i) => (n.path = pattern[i]));
  });
  for (const p of pattern) seats[p]++;
  turns += r.turns;
  if (r.turns >= 250) limit++;
  if (r.winner === null) wins.none++;
  else wins[pattern[r.winner]]++;
  for (const n of st!.nations) charEnd[n.path!][characterOf(n)]++;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(
  `길 견주기 — ${size}x${size} · ${games}판 · 시드 ${seed} · 저울추 정의 ${DEFAULT_ECONOMY.justiceWeight} / 공포 ${DEFAULT_ECONOMY.fearWeight} · 병합 불안 ${DEFAULT_ECONOMY.annexUnrestTurns}턴 · 정복 속국 충성 ${DEFAULT_ECONOMY.conquestLoyalty} · 병합 군대 ${DEFAULT_ECONOMY.annexArmyKeep}` +
    (off.length ? ` · 끔 ${off.join(',')}` : '')
);
for (const p of ['just', 'feared'] as const) {
  const [w, lo, hi] = wilson(wins[p], seats[p]);
  const ce = charEnd[p];
  const tot = ce.just + ce.feared + ce.none;
  console.log(
    `  ${p === 'just' ? '정의의 길' : '공포의 길'}  나라당 승률 ${pct(w)} (${pct(lo)} ~ ${pct(hi)})  ` +
      `· 판 끝 성격 정의 ${pct(ce.just / tot)} 공포 ${pct(ce.feared / tot)} 없음 ${pct(ce.none / tot)}`
  );
}
const ratio = seats.just && seats.feared ? wins.just / seats.just / Math.max(1e-9, wins.feared / seats.feared) : 0;
console.log(
  `  정의/공포 승률비 ${ratio.toFixed(2)} (1 이 반반) · 평균 ${(turns / games).toFixed(1)}턴 · 턴제한 ${pct(limit / games)}`
);
