// 리그 학습
//
//   npm run sim:league
//   npm run sim:league -- --gens 12 --matches 60
//
// 왜 필요한가.
//
// 지금까지의 자가대전(sim/tuneAI.ts)은 단일 집단이라 모두가 같은 방향으로
// 수렴했다. 그 결과 massing 과 support 가 매번 0 으로 떨어졌다. 뭉치기를
// 깨러 오는 상대가 집단 안에 없으니 "안 뭉쳐도 안 지는" 것이 사실이 되어
// 버린 것이다. 순수 자가대전은 전략이 순환하거나 한쪽으로 무너진다.
//
// AlphaStar 의 리그가 이 문제를 풀려고 만든 장치다. 세 종류를 둔다.
//   주 에이전트  실제로 강해지는 본체
//   착취자       주 에이전트의 약점만 골라 파고드는 전용 상대
//   명예의 전당  과거 챔피언들. 얼려두고 계속 상대하게 한다
//
// 착취자의 적합도는 "전체 승률"이 아니라 "같은 판에서 주 에이전트를 앞섰는가"다.
// 이 신호가 있어야 주 에이전트가 약점을 메우는 방향으로 움직인다.

import { makeRng, RNG } from '../src/services/combatSystem';
import { playGame } from './gameSim';
import { AIWeights, BASE_WEIGHTS, LEARNED_WEIGHTS, PERSONALITIES } from '../src/engine/ai';

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

function mutate(w: AIWeights, rng: RNG, strength: number): AIWeights {
  const out = { ...w };
  for (const k of KEYS) {
    const [lo, hi] = BOUNDS[k];
    const noise = (rng() + rng() - 1) * (hi - lo) * strength;
    out[k] = Math.max(lo, Math.min(hi, w[k] + noise));
  }
  return out;
}

type Kind = 'main' | 'exploiter' | 'hof';

interface Member {
  label: string;
  kind: Kind;
  w: AIWeights;
  played: number;
  wins: number;
  /** 같은 판에서 주 에이전트를 앞선 횟수 (착취자 적합도) */
  beatMain: number;
  metMain: number;
}

function fresh(label: string, kind: Kind, w: AIWeights): Member {
  return { label, kind, w, played: 0, wins: 0, beatMain: 0, metMain: 0 };
}

const rate = (a: number, b: number) => (b === 0 ? 0 : a / b);
const pct = (v: number) => (v * 100).toFixed(0) + '%';

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * 한 판을 치르고 결과를 기록한다.
 * 승자뿐 아니라 최종 영향력 순위까지 본다 — 착취자는 "이겼나"가 아니라
 * "주 에이전트보다 앞섰나"로 평가해야 하기 때문이다.
 */
function runMatch(roster: Member[], mainIdx: number, size: number, rng: RNG): void {
  const r = playGame(
    roster.map((m) => m.w),
    size,
    size,
    rng,
    200
  );
  for (const m of roster) m.played++;
  if (r.winner !== null) roster[r.winner].wins++;

  if (mainIdx >= 0) {
    // 최종 영토로 순위를 가른다 (승자는 자동으로 최상위)
    const mainScore = r.winner === mainIdx ? Infinity : r.finalCells[mainIdx];
    roster.forEach((m, i) => {
      if (i === mainIdx) return;
      m.metMain++;
      const mine = r.winner === i ? Infinity : r.finalCells[i];
      if (mine > mainScore) m.beatMain++;
    });
  }
}

/** PFSP — 버거운 상대일수록 자주 만난다 */
function pickOpponents(
  pool: Member[],
  count: number,
  mainWinRateVs: (m: Member) => number,
  rng: RNG
): Member[] {
  const weights = pool.map((m) => {
    const p = mainWinRateVs(m); // 주 에이전트가 이 상대를 이길 확률 추정
    // (1-p)^2 — 이기기 힘든 상대에 무게를 준다
    return Math.max(0.02, (1 - p) * (1 - p));
  });
  const chosen: Member[] = [];
  const used = new Set<number>();
  while (chosen.length < count && used.size < pool.length) {
    const total = weights.reduce((a, b, i) => a + (used.has(i) ? 0 : b), 0);
    let roll = rng() * total;
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;
      roll -= weights[i];
      if (roll <= 0) {
        used.add(i);
        chosen.push(pool[i]);
        break;
      }
    }
    if (chosen.length === 0) break;
  }
  return chosen;
}

function main() {
  const gens = parseArg('gens', 10);
  const matches = parseArg('matches', 50);
  const exploiterCount = parseArg('exploiters', 3);
  const size = parseArg('size', 11);
  const rng = makeRng(parseArg('seed', 20260920));

  let mainW: AIWeights = { ...LEARNED_WEIGHTS };
  const hof: Member[] = [
    fresh('전당:초기학습형', 'hof', { ...LEARNED_WEIGHTS }),
    fresh('전당:확장형', 'hof', { ...PERSONALITIES['확장형'] }),
    fresh('전당:균형', 'hof', { ...BASE_WEIGHTS }),
  ];
  let exploiters: Member[] = [];
  for (let i = 0; i < exploiterCount; i++) {
    exploiters.push(fresh(`착취자${i}`, 'exploiter', mutate(mainW, rng, 0.25)));
  }

  console.log(
    `리그 학습 — ${gens}세대 · 세대당 ${matches}판 · 착취자 ${exploiterCount} · ${size}x${size}\n`
  );

  for (let g = 1; g <= gens; g++) {
    // 이번 세대의 주 후보들 — 현재 본체와 그 변이들
    const mainCandidates: Member[] = [fresh('본체', 'main', mainW)];
    for (let i = 0; i < 3; i++) {
      mainCandidates.push(fresh(`본체+${i}`, 'main', mutate(mainW, rng, 0.1)));
    }
    for (const e of exploiters) {
      e.played = 0;
      e.wins = 0;
      e.beatMain = 0;
      e.metMain = 0;
    }
    for (const h of hof) {
      h.played = 0;
      h.wins = 0;
    }

    for (let m = 0; m < matches; m++) {
      const cand = mainCandidates[m % mainCandidates.length];
      // 상대 넷: 착취자와 명예의 전당에서 PFSP 로 고른다
      const pool = [...exploiters, ...hof];
      const opps = pickOpponents(pool, 4, (x) => rate(x.wins, Math.max(1, x.played)), rng);
      while (opps.length < 4) opps.push(hof[Math.floor(rng() * hof.length)]);
      const roster = [cand, ...opps.slice(0, 4)];
      runMatch(roster, 0, size, rng);
    }

    // 본체 갱신 — 전체 승률이 가장 좋은 후보
    mainCandidates.sort((a, b) => rate(b.wins, b.played) - rate(a.wins, a.played));
    const best = mainCandidates[0];
    mainW = best.w;

    // 착취자 갱신 — "본체를 앞선 비율"로 평가하고, 못 하는 놈은 새로 뽑는다
    exploiters.sort((a, b) => rate(b.beatMain, b.metMain) - rate(a.beatMain, a.metMain));
    const bestExp = exploiters[0];
    const newExp: Member[] = [
      fresh(bestExp.label, 'exploiter', bestExp.w),
      ...Array.from({ length: exploiterCount - 1 }, (_, i) =>
        fresh(`착취자${i}`, 'exploiter', mutate(bestExp.w, rng, 0.2))
      ),
    ];

    console.log(
      `세대 ${String(g).padStart(2)} | 본체 승률 ${pct(rate(best.wins, best.played))} ` +
        `| 최고 착취자 본체추월 ${pct(rate(bestExp.beatMain, bestExp.metMain))} ` +
        `| 전당 ${hof.length}`
    );

    exploiters = newExp;

    // 본체가 충분히 강해지면 전당에 박제한다
    if (rate(best.wins, best.played) > 0.35 && g % 3 === 0) {
      hof.push(fresh(`전당:G${g}`, 'hof', { ...mainW }));
      if (hof.length > 8) hof.splice(1, 1); // 오래된 것부터 (초기학습형은 남긴다)
      console.log(`   ↑ 본체를 전당에 등록 (현재 ${hof.length}개)`);
    }
  }

  console.log('\n최종 본체 가중치');
  console.log(KEYS.map((k) => `${k}=${mainW[k].toFixed(2)}`).join(' '));

  console.log('\n비교 — 이전 학습형 대비 변화');
  for (const k of KEYS) {
    const before = LEARNED_WEIGHTS[k];
    const after = mainW[k];
    const d = after - before;
    if (Math.abs(d) < 0.05) continue;
    console.log(
      `  ${k.padEnd(14)} ${before.toFixed(2).padStart(6)} → ${after.toFixed(2).padStart(6)}  ${
        d > 0 ? '+' : ''
      }${d.toFixed(2)}`
    );
  }

  // 검증 — 손으로 만든 성격 4종 상대
  console.log('\n검증: 리그 본체 vs 손으로 만든 성격 4종');
  const vrng = makeRng(31337);
  const challengers = ['확장형', '공격형', '수비형', '균형'];
  let wins = 0;
  const N = 80;
  for (let i = 0; i < N; i++) {
    const r = playGame([mainW, ...challengers.map((c) => PERSONALITIES[c])], size, size, vrng, 200);
    if (r.winner === 0) wins++;
  }
  console.log(`리그 본체 승률 ${((wins / N) * 100).toFixed(1)}%  (5자리, 무작위 기준선 20%)`);
}

main();
