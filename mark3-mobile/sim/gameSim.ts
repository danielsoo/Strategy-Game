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
  collectTribute,
  updateLoyalty,
  stepVoluntarySubmission,
  checkBlocVictory,
  influenceOf,
  vassalsOf,
  stepOrders,
  stepRebellion,
} from '../src/engine';
import { takeAITurn, AIWeights, PERSONALITIES, Policy } from '../src/engine/ai';
import { Recorder, MatchLog, snapshot as turnSnapshot, TurnSnapshot } from './recorder';

/** 판을 통째로 남기고 싶을 때 넘긴다 */
export interface RecordOptions {
  recorder: Recorder;
  gameIndex: number;
  seed: number;
  labels: string[];
}

export interface GameResult {
  winner: number | null;
  /** 무엇으로 이겼나 — 패권인지 영향력인지 전멸인지 */
  winReason?: string;
  turns: number;
  finalCells: number[];
  /** 끝났을 때 완공된 요새 수 */
  finalForts: number[];
  finalUnits: number[];
  attacksMade: number[];
  attacksWon: number[];
  underdogAttacks: number[];
  underdogWins: number[];
  /** 받은 공격과 그중 막아낸 횟수 */
  defended: number[];
  defendedHeld: number[];
  /** 게임 종료 시점에 살아 있었는지 */
  survived: boolean[];
  /** 종료 시점에 거느린 속국 수 / 스스로 속국이 되었는지 */
  vassalsHeld: number[];
  becameVassal: boolean[];
  /** 수비자가 무엇을 골랐는지 — 맞섬/후퇴/항복 */
  choices: { fight: number; retreat: number; surrender: number };
}

export function playGame(
  weightsPerNation: AIWeights[],
  rows: number,
  cols: number,
  rng: RNG,
  maxTurns = 250,
  eco: EconomyConfig = DEFAULT_ECONOMY,
  record?: RecordOptions,
  /** 나라별로 수를 고르는 방식. 비워두면 손으로 쓴 평가식을 쓴다. */
  policies?: (Policy | undefined)[],
  /** 판을 만든 직후 한 번 불린다. 난이도 핸디캡처럼 나라에 값을 박을 때 쓴다. */
  setup?: (state: GameState) => void
): GameResult {
  const n = weightsPerNation.length;
  const state = createGameState(n, rows, cols, rng, eco);
  for (const nat of state.nations) nat.isHuman = false;
  setup?.(state);

  const attacksMade = new Array(n).fill(0);
  const attacksWon = new Array(n).fill(0);
  const underdogAttacks = new Array(n).fill(0);
  const underdogWins = new Array(n).fill(0);
  const defended = new Array(n).fill(0);
  const choices = { fight: 0, retreat: 0, surrender: 0 };
  const defendedHeld = new Array(n).fill(0);

  const snapshots: TurnSnapshot[] = [];
  let logCursor = 0;

  const finish = (turns: number, winner: number | null): GameResult => {
    if (record) {
      const match: MatchLog = {
        runId: record.recorder.runId,
        gameIndex: record.gameIndex,
        seed: record.seed,
        rows,
        cols,
        nations: state.nations.map((nat, i) => ({
          id: nat.id,
          name: nat.name,
          label: record.labels[i] ?? nat.name,
          weights: weightsPerNation[i],
        })),
        snapshots,
        decisions: [],
        result: {
          winner,
          winnerLabel: winner === null ? '무승부' : record.labels[winner] ?? String(winner),
          turns,
          reachedTurnLimit: turns >= maxTurns,
          attacksPerNation: attacksMade.slice(),
          finalInfluence: state.nations.map((x) => influenceOf(state, x.id, eco)),
        },
      };
      record.recorder.add(match);
    }
    return result(turns, winner);
  };

  const result = (turns: number, winner: number | null): GameResult => ({
    winner,
    winReason: state.winReason,
    turns,
    finalCells: state.nations.map((x) => nationStats(state, x.id).cells),
    finalForts: state.nations.map((x) => state.cells.filter((c) => c.owner === x.id && c.fortStage === 4).length),
    finalUnits: state.nations.map((x) => nationStats(state, x.id).units),
    attacksMade,
    attacksWon,
    underdogAttacks,
    underdogWins,
    defended,
    defendedHeld,
    survived: state.nations.map((x) => x.alive),
    vassalsHeld: state.nations.map((x) => vassalsOf(state, x.id).length),
    becameVassal: state.nations.map((x) => x.suzerain !== null),
    choices,
  });

  const firstMover = Math.floor(rng() * n);

  for (let turn = 1; turn <= maxTurns; turn++) {
    state.turn = turn;
    if (record) logCursor = state.log.length;
    // 선수는 돌아가며 잡는다 — 늘 0번이 먼저 두면 그게 곧 이점이다.
    // 첫 턴의 선수도 판마다 다르게 준다. 돌리기만 하면 1턴 선수가 늘 0번인데,
    // 초반 한 수는 후반 한 수보다 무겁다.
    for (let k = 0; k < n; k++) {
      const id = (turn - 1 + firstMover + k) % n;
      if (!state.nations[id].alive) continue;
      state.current = id;

      beginTurn(state, id, rng, eco);
      const log = takeAITurn(state, id, weightsPerNation[id], rng, eco, policies?.[id]);
      restUnmoved(state, id, log.moved);

      for (const a of log.attacks) {
        choices[a.choice]++;
        attacksMade[id]++;
        if (a.result.outcome === 'attacker-win') attacksWon[id]++;
        if (a.powerRatio < 1) {
          underdogAttacks[id]++;
          if (a.result.outcome === 'attacker-win') underdogWins[id]++;
        }
        if (a.defenderNation !== null) {
          defended[a.defenderNation]++;
          if (a.result.outcome !== 'attacker-win') defendedHeld[a.defenderNation]++;
        }
      }

      stepMerchants(state, eco);
      stepNeutrals(state, rng);
      collectTribute(state, eco);
      updateLoyalty(state, eco);
      stepOrders(state, rng, eco);
      stepRebellion(state, rng, eco);
      stepVoluntarySubmission(state, rng, eco);
      updateAliveFlags(state);
      checkBlocVictory(state, eco);
      if (state.winner !== null) {
        if (record) snapshots.push(turnSnapshot(state, logCursor));
        return finish(turn, state.winner);
      }
    }
    if (record) snapshots.push(turnSnapshot(state, logCursor));
  }

  // 턴 제한 — 영향력(직할 + 속국)이 가장 큰 나라를 승자로 본다
  let best = -1;
  let bestInfluence = -1;
  for (const nat of state.nations) {
    if (!nat.alive || nat.suzerain !== null) continue;
    const inf = influenceOf(state, nat.id, eco);
    if (inf > bestInfluence) {
      bestInfluence = inf;
      best = nat.id;
    }
  }
  return finish(maxTurns, best >= 0 ? best : null);
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
  const defMade = new Array(nations).fill(0);
  const defHeld = new Array(nations).fill(0);
  const survivals = new Array(nations).fill(0);
  const vassalTurns = new Array(nations).fill(0);
  const wasVassal = new Array(nations).fill(0);

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
      defMade[i] += r.defended[i];
      defHeld[i] += r.defendedHeld[i];
      if (r.survived[i]) survivals[i]++;
      vassalTurns[i] += r.vassalsHeld[i];
      if (r.becameVassal[i]) wasVassal[i]++;
    }
  }

  console.log(`\n전체 게임 시뮬레이션 — ${nations}개국 · ${size}x${size} · ${games}판`);
  console.log('─'.repeat(78));
  console.log(
    '나라(성격)'.padEnd(20) +
      '게임승률'.padStart(10) +
      '전투승률'.padStart(10) +
      '공격수'.padStart(9) +
      '방어수'.padStart(9) +
      '방어성공'.padStart(10) +
      '생존율'.padStart(9) +
      '속국수'.padStart(9) +
      '복속율'.padStart(9)
  );
  console.log('─'.repeat(78));
  for (let i = 0; i < nations; i++) {
    console.log(
      names[i].padEnd(20) +
        pct(wins[i] / games).padStart(10) +
        (atkMade[i] ? pct(atkWon[i] / atkMade[i]) : '-').padStart(10) +
        (atkMade[i] / games).toFixed(1).padStart(9) +
        (defMade[i] / games).toFixed(1).padStart(9) +
        (defMade[i] ? pct(defHeld[i] / defMade[i]) : '-').padStart(10) +
        pct(survivals[i] / games).padStart(9) +
        (vassalTurns[i] / games).toFixed(2).padStart(9) +
        pct(wasVassal[i] / games).padStart(9)
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
