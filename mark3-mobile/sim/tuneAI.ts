// AI 가중치 자가대전 탐색
//
//   npm run sim:learn
//   npm run sim:learn -- --pop 16 --gens 8 --games 40
//
// 사람이 성격을 손으로 정의하는 대신, 가중치 집단을 서로 붙여서 이기는 쪽을
// 남기고 변이시킨다. 딥RL은 아니지만 목적은 같다 — "무엇이 이기는가"를
// 사람의 감이 아니라 대전 결과로 정하는 것.
//
// sim/tuneCombat.ts 와 같은 구조다: 목적함수를 정하고 → 파라미터 공간을
// 탐색하고 → 결과로 고른다. 다른 점은 목적함수가 '목표 승률과의 오차'가
// 아니라 '실제 자가대전 승률'이라는 것뿐이다.

import { makeRng, RNG } from '../src/services/combatSystem';
import { playGame } from './gameSim';
import { AIWeights, BASE_WEIGHTS, PERSONALITIES } from '../src/engine/ai';

/** 각 가중치의 탐색 범위 */
const BOUNDS: Record<keyof AIWeights, [number, number]> = {
  territory: [0.2, 4],
  units: [0.3, 3],
  castleAssault: [0, 30],
  fort: [0, 10],
  aggression: [0.2, 2.2],
  massing: [0, 4],
  homeDefense: [0, 4],
  advance: [0, 3],
  expansion: [0, 4],
  terrain: [0, 2],
  wealth: [0, 4],
  support: [0, 4],
  explore: [0, 4],
  targetArmy: [8, 40],
};

const KEYS = Object.keys(BOUNDS) as (keyof AIWeights)[];

function clampW(w: AIWeights): AIWeights {
  const out = { ...w };
  for (const k of KEYS) {
    const [lo, hi] = BOUNDS[k];
    out[k] = Math.max(lo, Math.min(hi, out[k]));
  }
  return out;
}

function randomWeights(rng: RNG): AIWeights {
  const w = { ...BASE_WEIGHTS };
  for (const k of KEYS) {
    const [lo, hi] = BOUNDS[k];
    w[k] = lo + rng() * (hi - lo);
  }
  return w;
}

/** 부모에서 조금 흔든 자식 */
function mutate(w: AIWeights, rng: RNG, strength: number): AIWeights {
  const out = { ...w };
  for (const k of KEYS) {
    const [lo, hi] = BOUNDS[k];
    const span = hi - lo;
    // 박스-뮬러 대신 균등분포 두 번 합으로 충분하다
    const noise = (rng() + rng() - 1) * span * strength;
    out[k] = w[k] + noise;
  }
  return clampW(out);
}

interface Member {
  w: AIWeights;
  label: string;
  wins: number;
  played: number;
}

function winRate(m: Member): number {
  return m.played === 0 ? 0 : m.wins / m.played;
}

/** 집단에서 5명을 뽑아 한 판 시키고 승패를 기록한다 */
function playRound(pop: Member[], rng: RNG, size: number, seats = 5): void {
  const n = Math.min(seats, pop.length);
  const picked: number[] = [];
  while (picked.length < n) {
    const i = Math.floor(rng() * pop.length);
    if (!picked.includes(i)) picked.push(i);
  }
  const r = playGame(
    picked.map((i) => pop[i].w),
    size,
    size,
    rng,
    180
  );
  for (const i of picked) pop[i].played++;
  if (r.winner !== null) pop[picked[r.winner]].wins++;
}

/**
 * 1대1 전원 맞대결.
 *
 * 5인 게임의 승패는 신호가 탁하다 — 내가 잘해서 이긴 건지 남 둘이 싸워줘서
 * 이긴 건지 구분이 안 된다. 1대1 은 제로섬이라 "A가 B를 이겼다"가 그대로
 * 신호가 되고, 자가대전 이론도 원래 2인 제로섬 전제다.
 *
 * 모든 쌍을 자리를 바꿔 두 번씩 둔다. 자리 이점이 상쇄되고 표본도 고르게 쌓인다.
 */
function roundRobinDuel(pop: Member[], rng: RNG, size: number, repeats: number): void {
  for (let r = 0; r < repeats; r++) {
    for (let i = 0; i < pop.length; i++) {
      for (let j = i + 1; j < pop.length; j++) {
        for (const [a, b] of [
          [i, j],
          [j, i],
        ]) {
          const res = playGame([pop[a].w, pop[b].w], size, size, rng, 180);
          pop[a].played++;
          pop[b].played++;
          if (res.winner === 0) pop[a].wins++;
          else if (res.winner === 1) pop[b].wins++;
        }
      }
    }
  }
}

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

function fmtWeights(w: AIWeights): string {
  return KEYS.map((k) => `${k}=${w[k].toFixed(2)}`).join(' ');
}

function main() {
  const duel = process.argv.includes('--duel');
  const popSize = parseArg('pop', duel ? 10 : 14);
  const gens = parseArg('gens', 7);
  const gamesPerGen = parseArg('games', 40);
  // 1대1 에 11x11 은 너무 넓다 — 서로 만나기 전에 턴이 끝난다
  const size = parseArg('size', duel ? 9 : 11);
  const repeats = parseArg('repeats', 1);
  const rng = makeRng(parseArg('seed', 777));

  // 손으로 만든 성격들을 초기 집단에 섞어 기준선으로 쓴다
  let pop: Member[] = [];
  const names = Object.keys(PERSONALITIES);
  for (let i = 0; i < popSize; i++) {
    if (i < names.length) {
      pop.push({ w: { ...PERSONALITIES[names[i]] }, label: names[i], wins: 0, played: 0 });
    } else {
      pop.push({ w: randomWeights(rng), label: `무작위${i}`, wins: 0, played: 0 });
    }
  }

  const mode = duel ? '1대1 전원 맞대결' : '5인 난전';
  const perGen = duel
    ? `쌍당 ${repeats * 2}판 (총 ${((popSize * (popSize - 1)) / 2) * repeats * 2}판)`
    : `세대당 ${gamesPerGen}판`;
  console.log(`자가대전 학습 — ${mode} · 집단 ${popSize} · ${gens}세대 · ${perGen} · ${size}x${size}\n`);

  for (let g = 1; g <= gens; g++) {
    for (const m of pop) {
      m.wins = 0;
      m.played = 0;
    }
    if (duel) roundRobinDuel(pop, rng, size, repeats);
    else for (let i = 0; i < gamesPerGen; i++) playRound(pop, rng, size);

    pop.sort((a, b) => winRate(b) - winRate(a));
    const top = pop.slice(0, Math.max(2, Math.floor(popSize / 3)));

    console.log(
      `세대 ${String(g).padStart(2)} | 1위 ${top[0].label.padEnd(10)} ${(
        winRate(top[0]) * 100
      ).toFixed(0)}%  | 상위: ${top
        .slice(0, 4)
        .map((m) => `${m.label}(${(winRate(m) * 100).toFixed(0)}%)`)
        .join(' ')}`
    );

    if (g === gens) break;

    // 다음 세대: 상위는 유지, 나머지는 상위에서 변이로 채운다
    const next: Member[] = top.map((m) => ({ ...m, wins: 0, played: 0 }));
    let childNo = 0;
    while (next.length < popSize) {
      const parent = top[Math.floor(rng() * top.length)];
      next.push({
        w: mutate(parent.w, rng, 0.12),
        label: `${parent.label}+${++childNo}`,
        wins: 0,
        played: 0,
      });
    }
    pop = next;
  }

  pop.sort((a, b) => winRate(b) - winRate(a));
  const best = pop[0];

  console.log(`\n최종 1위: ${best.label}`);
  console.log(fmtWeights(best.w));

  const challengers = ['확장형', '공격형', '수비형', '균형'];

  if (duel) {
    // 1대1 검증 — 상대마다 자리를 바꿔 각각 붙인다
    console.log('\n검증 1: 1대1, 손으로 만든 성격 4종 각각과');
    const per = 40;
    let allWins = 0;
    let allGames = 0;
    for (const c of challengers) {
      const vrng = makeRng(31337);
      let wins = 0;
      for (let i = 0; i < per; i++) {
        // 짝수 판은 0번 자리, 홀수 판은 1번 자리
        const first = i % 2 === 0;
        const roster = first ? [best.w, PERSONALITIES[c]] : [PERSONALITIES[c], best.w];
        const r = playGame(roster, size, size, vrng, 180);
        if (r.winner === (first ? 0 : 1)) wins++;
      }
      allWins += wins;
      allGames += per;
      console.log(`  vs ${c.padEnd(4)} ${((wins / per) * 100).toFixed(1)}%  (${wins}/${per})`);
    }
    console.log(`  종합 ${((allWins / allGames) * 100).toFixed(1)}%  (무작위 기준선 50%)`);
  }

  // 5인 게임으로의 전이 검증 — 1대1로 배운 게 난전에서도 통하는지
  console.log('\n검증 2: 5인 게임 (학습 결과 + 손으로 만든 4종)');
  const bigSize = 11;
  const verifyGames = 60;
  const vrng = makeRng(31337);
  let bestWins = 0;
  for (let i = 0; i < verifyGames; i++) {
    const roster = [best.w, ...challengers.map((c) => PERSONALITIES[c])];
    const r = playGame(roster, bigSize, bigSize, vrng, 180);
    if (r.winner === 0) bestWins++;
  }
  console.log(
    `학습 AI 승률 ${((bestWins / verifyGames) * 100).toFixed(1)}%  (5자리 게임, 무작위 기준선 20%)`
  );
}

main();
