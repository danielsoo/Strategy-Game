// 종주국은 본 것으로만 판단한다 — 얼마나 맞고 얼마나 속는가
//
// 재는 것이 두 가지다.
//   진실   지도에서 실제로 벌어진 일 (order.progress)
//   판단   종주국이 확인한 것      (order.witnessed)
//
// 둘이 갈라지는 만큼이 이 체계의 값어치다. 늘 같으면 안개를 넣어놓고도
// 종주국이 전지적인 것이고, 늘 다르면 명령이 아무 뜻도 없는 것이다.
import { makeRng } from '../src/services/combatSystem';
import { LEARNED_WEIGHTS, PERSONALITIES, takeAITurn } from '../src/engine/ai';
import {
  createGameState, beginTurn, restUnmoved, updateAliveFlags, stepNeutrals, stepMerchants,
  collectTribute, updateLoyalty, stepVoluntarySubmission, checkBlocVictory,
  stepOrders, stepRebellion,
} from '../src/engine';

const R = [LEARNED_WEIGHTS, ...['확장형','공격형','수비형','균형'].map((c)=>PERSONALITIES[c])];
type Rec = { resp: string; kind: string; truth: number; seen: number; accepted: boolean; unverified: boolean };
const rows: Rec[] = [];

for (let g = 0; g < 30; g++) {
  const rng = makeRng(1700 + g);
  const s = createGameState(5, 11, 11, rng);
  for (const n of s.nations) n.isHuman = false;
  let taken = 0;
  for (let t = 1; t <= 200 && s.winner === null; t++) {
    s.turn = t;
    for (let id = 0; id < 5; id++) {
      if (!s.nations[id].alive || s.winner !== null) continue;
      s.current = id; beginTurn(s, id, rng);
      restUnmoved(s, id, takeAITurn(s, id, R[id], rng).moved);
      stepMerchants(s); stepNeutrals(s, rng); collectTribute(s); updateLoyalty(s);
      stepOrders(s, rng); stepRebellion(s, rng);
      stepVoluntarySubmission(s, rng); updateAliveFlags(s); checkBlocVictory(s);

      // 끝난 명령은 engine 이 직접 적어준다. 하네스가 삭제 시점을 쫓을 필요가 없다.
      for (; taken < s.orderLog.length; taken++) {
        const o = s.orderLog[taken];
        rows.push({
          resp: o.response, kind: o.kind, truth: o.truth, seen: o.witnessed,
          accepted: o.accepted, unverified: o.unverified,
        });
      }
    }
  }
}

const DONE = 0.999;
const by: Record<string, { n: number; truth: number; seen: number; blind: number }> = {};
for (const v of rows) {
  const k = v.resp;
  by[k] = by[k] ?? { n: 0, truth: 0, seen: 0, blind: 0 };
  by[k].n++;
  if (v.truth >= DONE) by[k].truth++;
  if (v.accepted) by[k].seen++;
  if (v.unverified) by[k].blind++;
}
const pc = (a: number, b: number) => `${((a / Math.max(1, b)) * 100).toFixed(0)}%`;

console.log('속국의 속내별 — 실제로 했나 / 종주국이 인정했나 / 끝내 못 봤나\n');
console.log('  속내      건수    실제이행   인정     확인불가');
for (const k of ['obey', 'feign', 'refuse']) {
  const v = by[k]; if (!v) continue;
  const name = k === 'obey' ? '순종' : k === 'feign' ? '태업' : '거부';
  console.log(`  ${name}    ${String(v.n).padStart(6)}    ${pc(v.truth, v.n).padStart(6)}   ${pc(v.seen, v.n).padStart(6)}   ${pc(v.blind, v.n).padStart(6)}`);
}

let fooled = 0, missed = 0, right = 0, caught = 0, blind = 0;
for (const v of rows) {
  // 확인하지 못한 명령은 맞힌 것도 틀린 것도 아니다. 따로 센다 —
  // 이걸 '적발'에 섞으면 종주국이 실제보다 훨씬 밝은 것처럼 보인다.
  if (v.unverified) { blind++; continue; }
  const t = v.truth >= DONE;
  if (v.accepted && !t) fooled++;
  else if (!v.accepted && t) missed++;
  else if (v.accepted && t) right++;
  else caught++;
}
const judged = rows.length - blind;
console.log(`\n종주국의 판단 ${rows.length}건`);
console.log(`  확인불가    ${String(blind).padStart(4)} (${pc(blind, rows.length)})   끝내 보지 못했다`);
console.log(`\n  확인한 ${judged}건 중`);
console.log(`  맞게 인정   ${String(right).padStart(4)} (${pc(right, judged)})   실제로 했고 종주국도 안다`);
console.log(`  맞게 적발   ${String(caught).padStart(4)} (${pc(caught, judged)})   안 했고 인정도 안 했다`);
console.log(`  속았다      ${String(fooled).padStart(4)} (${pc(fooled, judged)})   안 했는데 이행으로 봤다`);
console.log(`  억울하다    ${String(missed).padStart(4)} (${pc(missed, judged)})   했는데 못 알아줬다`);
console.log('\n명령 종류별 — 실제이행 / 인정 / 확인불가');
const byKind: Record<string, { n: number; t: number; s: number; b: number }> = {};
for (const v of rows) {
  const k = `${v.kind}/${v.resp === 'obey' ? '순종' : '불복'}`;
  byKind[k] = byKind[k] ?? { n: 0, t: 0, s: 0, b: 0 };
  byKind[k].n++;
  if (v.truth >= DONE) byKind[k].t++;
  if (v.accepted) byKind[k].s++;
  if (v.unverified) byKind[k].b++;
}
for (const [k, v] of Object.entries(byKind).sort()) {
  console.log(`  ${k.padEnd(14)} ${String(v.n).padStart(4)}건   ${pc(v.t, v.n).padStart(5)} / ${pc(v.s, v.n).padStart(5)} / ${pc(v.b, v.n).padStart(5)}`);
}
