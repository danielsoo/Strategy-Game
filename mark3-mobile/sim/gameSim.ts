// 전체 게임 시뮬레이터 — 모든 나라를 AI가 둔다
//
//   npm run sim:game                    5개국 기본 시뮬레이션
//   npm run sim:game -- --games 200 --nations 5 --size 11
//   npm run sim:game -- --tournament
//   npm run sim:game -- --trace         한 판을 추적
//
// 화면과 같은 엔진(src/engine)을 쓴다. 규칙이 한 군데에만 있어야
// 밸런스를 고칠 때 양쪽에 같이 반영된다.

import { makeRng, RNG } from '../src/services/combatSystem';
import {
  createGameState,
  GameState,
  DEFAULT_ECONOMY,
  EconomyConfig,
  beginTurn,
  restUnmoved,
  updateAliveFlags,
  nationStats,
  stepMerchants,
  stepNeutrals,
} from '../src/engine';
import { takeAITurn, AIWeights, PERSONALITIES } from '../src/engine/ai';

export interface GameResult {
  winner: number | null;
  turns: number;
  finalCells: number[];
  finalUnits: number[];
  attacksMade: number[];
  attacksWon: number[];
  underdogAttacks: number[];
  underdogWins: number[];
}

export function playGame(
  weightsPerNation: AIWeights[],
  rows: number,
  cols: number,
  rng: RNG,
  maxTurns = 250,
  eco: EconomyConfig = DEFAULT_ECONOMY
): GameResult {
  const n = weightsPerNation.length;
  const state = createGameState(n, rows, cols, rng, eco);
  for (const nat of state.nations) nat.isHuman = false;

  const attacksMade = new Array(n).fill(0);
  const attacksWon = new Array(n).fill(0);
  const underdogAttacks = new Array(n).fill(0);
  const underdogWins = new Array(n).fill(0);

  const snapshot = (turns: number, winner: number | null): GameResult => ({
    winner,
    turns,
    finalCells: state.nations.map((x) => nationStats(state, x.id).cells),
    finalUnits: state.nations.map((x) => nationStats(state, x.id).units),
    attacksMade,
    attacksWon,
    underdogAttacks,
    underdogWins,
  });

  for (let turn = 1; turn <= maxTurns; turn++) {
    state.turn = turn;
    for (let id = 0; id < n; id++) {
      if (!state.nations[id].alive) continue;
      state.current = id;

      beginTurn(state, id, rng, eco);
      const log = takeAITurn(state, id, weightsPerNation[id], rng, eco);
      restUnmoved(state, id, log.moved);

      for (const a of log.attacks) {
        attacksMade[id]++;
        if (a.result.outcome === 'attacker-win') attacksWon[id]++;
        if (a.powerRatio < 1) {
          underdogAttacks[id]++;
          if (a.result.outcome === 'attacker-win') underdogWins[id]++;
        }
      }

      stepMerchants(state, eco);
      stepNeutrals(state, rng);
      updateAliveFlags(state);
      if (state.winner !== null) return snapshot(turn, state.winner);
    }
  }

  // 턴 제한 — 영토가 가장 넓은 나라를 승자로 본다
  let best = -1;
  let bestCells = -1;
  for (const nat of state.nations) {
    if (!nat.alive) continue;
    const s = nationStats(state, nat.id);
    if (s.cells > bestCells) {
      bestCells = s.cells;
      best = nat.id;
    }
  }
  return snapshot(maxTurns, best >= 0 ? best : null);
}

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

const pct = (v: number) => (v * 100).toFixed(1) + '%';

function runBasic(games: number, nations: number, size: number, seed: number) {
  const names = Object.keys(PERSONALITIES).slice(0, nations);
  const weights = names.map((k) => PERSONALITIES[k]);
  const rng = makeRng(seed);

  const wins = new Array(nations).fill(0);
  let draws = 0;
  let totalTurns = 0;
  let turnLimitHits = 0;
  const atkMade = new Array(nations).fill(0);
  const atkWon = new Array(nations).fill(0);
  const udMade = new Array(nations).fill(0);
  const udWon = new Array(nations).fill(0);

  for (let g = 0; g < games; g++) {
    const r = playGame(weights, size, size, rng);
    if (r.winner === null) draws++;
    else wins[r.winner]++;
    totalTurns += r.turns;
    if (r.turns >= 250) turnLimitHits++;
    for (let i = 0; i < nations; i++) {
      atkMade[i] += r.attacksMade[i];
      atkWon[i] += r.attacksWon[i];
      udMade[i] += r.underdogAttacks[i];
      udWon[i] += r.underdogWins[i];
    }
  }

  console.log(`\n전체 게임 시뮬레이션 — ${nations}개국 · ${size}x${size} · ${games}판`);
  console.log('─'.repeat(78));
  console.log(
    '나라(성격)'.padEnd(20) +
      '게임승률'.padStart(10) +
      '전투승률'.padStart(10) +
      '공격수'.padStart(9) +
      '열세공격'.padStart(10) +
      '열세성공'.padStart(10)
  );
  console.log('─'.repeat(78));
  for (let i = 0; i < nations; i++) {
    console.log(
      names[i].padEnd(20) +
        pct(wins[i] / games).padStart(10) +
        (atkMade[i] ? pct(atkWon[i] / atkMade[i]) : '-').padStart(10) +
        (atkMade[i] / games).toFixed(1).padStart(9) +
        (udMade[i] / games).toFixed(1).padStart(10) +
        (udMade[i] ? pct(udWon[i] / udMade[i]) : '-').padStart(10)
    );
  }
  console.log('─'.repeat(78));
  console.log(
    `무승부 ${pct(draws / games)} · 평균 ${(totalTurns / games).toFixed(1)}턴 · 턴제한 도달 ${pct(
      turnLimitHits / games
    )}`
  );
}

function runTournament(games: number, size: number, seed: number) {
  const names = Object.keys(PERSONALITIES);
  const n = names.length;
  const rng = makeRng(seed);
  const wins = new Array(n).fill(0);
  const played = new Array(n).fill(0);
  const seats = 5;

  for (let g = 0; g < games; g++) {
    const roster: number[] = [];
    for (let s = 0; s < seats; s++) roster.push((g + s) % n);
    const weights = roster.map((i) => PERSONALITIES[names[i]]);
    const r = playGame(weights, size, size, rng);
    for (const i of roster) played[i]++;
    if (r.winner !== null) wins[roster[r.winner]]++;
  }

  console.log(`\n성격 토너먼트 — ${seats}자리 회전 · ${size}x${size} · ${games}판`);
  console.log('─'.repeat(50));
  console.log('성격'.padEnd(16) + '참가'.padStart(8) + '승'.padStart(8) + '승률'.padStart(10));
  console.log('─'.repeat(50));
  const order = names.map((_, i) => i).sort((a, b) => wins[b] / played[b] - wins[a] / played[a]);
  for (const i of order) {
    console.log(
      names[i].padEnd(16) +
        String(played[i]).padStart(8) +
        String(wins[i]).padStart(8) +
        pct(wins[i] / Math.max(1, played[i])).padStart(10)
    );
  }
  console.log('─'.repeat(50));
  console.log('(5자리 게임이므로 무작위 기준선은 20%)');
}

function runTrace(size: number, seed: number, nations: number) {
  const names = Object.keys(PERSONALITIES).slice(0, nations);
  const weights = names.map((k) => PERSONALITIES[k]);
  const rng = makeRng(seed);
  const eco = DEFAULT_ECONOMY;
  const state: GameState = createGameState(nations, size, size, rng, eco);
  for (const nat of state.nations) nat.isHuman = false;

  console.log(`\n한 판 추적 — ${nations}개국 · ${size}x${size} (전체 ${size * size}칸)`);
  console.log('턴'.padStart(4) + names.map((n) => n.padStart(26)).join(''));

  let attacks = 0;
  const movesSince = new Array(nations).fill(0);
  const attacksSince = new Array(nations).fill(0);

  for (let turn = 1; turn <= 250; turn++) {
    state.turn = turn;
    for (let id = 0; id < nations; id++) {
      if (!state.nations[id].alive) continue;
      state.current = id;
      beginTurn(state, id, rng, eco);
      const log = takeAITurn(state, id, weights[id], rng, eco);
      attacks += log.attacks.length;
      attacksSince[id] += log.attacks.length;
      movesSince[id] += log.moved.size;
      restUnmoved(state, id, log.moved);
      stepMerchants(state, eco);
      stepNeutrals(state, rng);
      updateAliveFlags(state);
    }
    if (turn % 25 === 0 || turn === 1) {
      const row = names
        .map((_, i) => {
          const s = nationStats(state, i);
          let stacks = 0;
          let biggest = 0;
          for (const c of state.cells) {
            if (c.owner === i && c.units > 0) {
              stacks++;
              if (c.units > biggest) biggest = c.units;
            }
          }
          const txt = `${s.cells}c ${s.units}u ${stacks}st(${biggest}) ${movesSince[i]}m ${attacksSince[i]}a`;
          movesSince[i] = 0;
          attacksSince[i] = 0;
          return txt.padStart(26);
        })
        .join('');
      console.log(String(turn).padStart(4) + row);
    }
    if (state.winner !== null) {
      console.log(`\n${state.nations[state.winner].name} 승리 (${turn}턴)`);
      break;
    }
  }
  const claimed = state.cells.filter((c) => c.owner !== null).length;
  console.log(`\n총 공격 ${attacks}회 · 점유된 칸 ${claimed}/${size * size}`);
}

function main() {
  const games = parseArg('games', 120);
  const nations = parseArg('nations', 5);
  const size = parseArg('size', 11);
  const seed = parseArg('seed', 4242);

  if (process.argv.includes('--trace')) runTrace(size, seed, nations);
  else if (process.argv.includes('--tournament')) runTournament(games, size, seed);
  else runBasic(games, nations, size, seed);
}

// playGame 을 tuneAI 가 import 한다. 가드가 없으면 import 만으로 시뮬레이션이 한 번 돈다.
if (process.argv[1] && process.argv[1].includes('gameSim')) {
  main();
}
