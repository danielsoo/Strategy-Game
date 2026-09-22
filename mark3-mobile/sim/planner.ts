// 작전 탐색이 정말 나은가 — 지금 AI 와 직접 붙여본다
//
// 탐색 AI 는 매 턴 후보 작전들을 몇 턴씩 굴려보고 고른다. 나머지는 똑같다.
// 그래서 여기서 나오는 차이는 순전히 '앞을 내다본 값' 이다.
import { makeRng, RNG } from '../src/services/combatSystem';
import {
  AIWeights, LEARNED_WEIGHTS, PERSONALITIES, takeAITurn, planCandidates, choosePlan,
} from '../src/engine';
import {
  createGameState, beginTurn, restUnmoved, updateAliveFlags, stepNeutrals, stepMerchants,
  collectTribute, updateLoyalty, stepVoluntarySubmission, checkBlocVictory,
  stepOrders, stepRebellion, DEFAULT_ECONOMY, Cell, GameState,
} from '../src/engine';

const TURNS = Number(process.argv[process.argv.indexOf('--lookahead') + 1]) || 3;
const GAMES = Number(process.argv[process.argv.indexOf('--games') + 1]) || 40;
const SIZE = Number(process.argv[process.argv.indexOf('--size') + 1]) || 21;
/** 대조군 — 탐색을 끄고 똑같이 돌린다. 하네스 자체가 20% 를 내는지 확인한다. */
const OFF = process.argv.includes('--off');

/** 굴려볼 때 쓰는 한 턴 — 화면도 기록도 없이 그 나라만 둔다 */
function playOne(s: GameState, id: number, target: Cell | null, rng: RNG) {
  beginTurn(s, id, rng);
  restUnmoved(s, id, takeAITurn(s, id, LEARNED_WEIGHTS, rng, DEFAULT_ECONOMY, undefined, 0, target).moved);
}

const FOES: AIWeights[] = [
  PERSONALITIES['확장형'], PERSONALITIES['수비형'], PERSONALITIES['경제형'], LEARNED_WEIGHTS,
];

let wins = 0, n = 0, turnsSum = 0, searched = 0, changed = 0;
const t0 = Date.now();

for (let g = 0; g < GAMES; g++) {
  for (let seat = 0; seat < 5; seat++) {
    const rng = makeRng(101000 + g * 17 + seat);
    const s = createGameState(5, SIZE, SIZE, rng);
    for (const nn of s.nations) nn.isHuman = false;
    const roster: AIWeights[] = [...FOES];
    roster.splice(seat, 0, LEARNED_WEIGHTS);
    roster.length = 5;

    let t = 1;
    for (; t <= 250 && s.winner === null; t++) {
      s.turn = t;
      for (let id = 0; id < 5; id++) {
        if (!s.nations[id].alive || s.winner !== null) continue;
        s.current = id;
        beginTurn(s, id, rng);

        let target: Cell | null | undefined;
        if (id === seat && !OFF) {
          // 탐색하는 쪽만 작전을 굴려본다
          const cands = planCandidates(s, id, roster[id]);
          if (cands.length > 1) {
            const ranked = choosePlan(s, id, cands, rng, (cs, cid, ct) => playOne(cs, cid, ct, rng), TURNS);
            target = ranked[0].target;
            searched++;
            // 굴려본 결과가 기본 선택과 다른가
            if (ranked.length > 1 && ranked[0].score !== ranked[1].score) changed++;
          }
        }

        restUnmoved(
          s, id,
          takeAITurn(s, id, roster[id], rng, DEFAULT_ECONOMY, undefined, 0, target).moved
        );
        stepMerchants(s); stepNeutrals(s, rng); collectTribute(s); updateLoyalty(s);
        stepOrders(s, rng); stepRebellion(s, rng);
        stepVoluntarySubmission(s, rng); updateAliveFlags(s); checkBlocVictory(s);
      }
    }
    turnsSum += t - 1;
    if (s.winner === seat) wins++;
    n++;
  }
}

const p = wins / n, z = 1.96, d = 1 + (z * z) / n;
const c = p + (z * z) / (2 * n);
const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
console.log(
  `${SIZE}x${SIZE} · ${n}판 · 내다보기 ${TURNS}턴\n` +
  `  대상 승률 ${(p * 100).toFixed(1)}% [${((c - m) / d * 100).toFixed(1)}~${((c + m) / d * 100).toFixed(1)}]` +
  `  (자리 다섯 중 하나이니 기준선 20%)\n` +
  `  평균 ${(turnsSum / n).toFixed(0)}턴 · 작전을 고른 횟수 ${searched} · 걸린 시간 ${((Date.now() - t0) / 1000).toFixed(0)}초`
);
