// 판이 커지면 무슨 일이 벌어지나
//
// 모든 조율을 11x11 에서 했는데 사람은 21x21 로 논다. 같은 눈으로 나란히 본다.
// '목표 없는 턴' 이 핵심 지표다 — pickTarget 이 아무것도 못 주면 부대는 눈앞의
// 점수만 보고 한 칸씩 움직이고, 그게 판 위에서는 '맴도는' 것으로 보인다.
import { makeRng } from '../src/services/combatSystem';
import { LEARNED_WEIGHTS, PERSONALITIES, takeAITurn } from '../src/engine/ai';
import { hexDistance } from '../src/utils/hexGrid';
import {
  createGameState, beginTurn, restUnmoved, updateAliveFlags, stepNeutrals, stepMerchants,
  collectTribute, updateLoyalty, stepVoluntarySubmission, checkBlocVictory,
  stepOrders, stepRebellion, isExplored,
} from '../src/engine';

const R = [LEARNED_WEIGHTS, LEARNED_WEIGHTS, PERSONALITIES['확장형'], PERSONALITIES['수비형'], PERSONALITIES['공격형']];
const LIMIT = 250;
const GAMES = Number(process.argv[process.argv.indexOf('--games') + 1]) || 16;
const SIZES = [11, 13, 17, 21];

console.log(`판 크기별 · 각 ${GAMES}판 · 턴제한 ${LIMIT}\n`);
console.log('  판      칸   평균턴  턴제한  공격  목표없는턴  첫발견  못찾음  평균진출');

for (const size of SIZES) {
  let turns = 0, limitHits = 0, attacks = 0, cells = 0;
  let blind = 0, total = 0, firstFind = 0, neverFound = 0, distSum = 0, distN = 0;

  for (let g = 0; g < GAMES; g++) {
    const rng = makeRng(400 + g);
    const s = createGameState(5, size, size, rng);
    for (const n of s.nations) n.isHuman = false;
    const homes = s.nations.map((n) => s.cells.find((c) => c.castle && c.owner === n.id) ?? null);
    const foundAt = new Array(5).fill(-1);

    let t = 1;
    for (; t <= LIMIT && s.winner === null; t++) {
      s.turn = t;
      for (let id = 0; id < 5; id++) {
        if (!s.nations[id].alive || s.winner !== null) continue;
        const sees = homes.some((h, b) => h && b !== id && s.nations[b].alive && isExplored(s, id, h));
        total++;
        if (!sees) blind++;
        else if (foundAt[id] < 0) foundAt[id] = t;

        s.current = id; beginTurn(s, id, rng);
        const log = takeAITurn(s, id, R[id], rng);
        attacks += log.attacks.length;
        restUnmoved(s, id, log.moved);
        stepMerchants(s); stepNeutrals(s, rng); collectTribute(s); updateLoyalty(s);
        stepOrders(s, rng); stepRebellion(s, rng);
        stepVoluntarySubmission(s, rng); updateAliveFlags(s); checkBlocVictory(s);
      }
    }
    turns += t - 1;
    if (t - 1 >= LIMIT) limitHits++;
    for (let id = 0; id < 5; id++) {
      if (foundAt[id] < 0) neverFound++; else firstFind += foundAt[id];
    }
    for (const c of s.cells) {
      if (c.owner === null || c.units <= 0 || c.neutral) continue;
      const h = homes[c.owner];
      if (h) { distSum += hexDistance(c.row, c.col, h.row, h.col); distN++; }
    }
    cells += s.cells.reduce((n, c) => (c.offMap ? n : n + 1), 0);
  }

  const found = GAMES * 5 - neverFound;
  const p = (a: number, b: number) => `${((a / Math.max(1, b)) * 100).toFixed(0)}%`;
  console.log(
    `  ${String(size).padStart(2)}x${size}  ${String(Math.round(cells / GAMES)).padStart(4)}` +
    `  ${(turns / GAMES).toFixed(0).padStart(6)}` +
    `  ${p(limitHits, GAMES).padStart(6)}` +
    `  ${(attacks / GAMES).toFixed(0).padStart(4)}` +
    `  ${p(blind, total).padStart(10)}` +
    `  ${(found > 0 ? (firstFind / found).toFixed(0) + '턴' : '-').padStart(6)}` +
    `  ${String(neverFound).padStart(3)}/${GAMES * 5}` +
    `  ${(distSum / Math.max(1, distN)).toFixed(1).padStart(7)}칸`
  );
}
