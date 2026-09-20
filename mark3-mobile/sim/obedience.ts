// 순종한 명령이 실제로 이행되는가, 태업은 정말 안 하는가
//
// 주의: stepOrders 는 이행된 명령을 그 자리에서 지운다. 라운드 끝에서 세면
// 이행된 것만 사라져 '순종은 이행률 1%' 같은 거짓말이 나온다. 그래서
// 지워지기 전에, 매 나라 차례마다 지도를 직접 읽는다.
import { makeRng } from '../src/services/combatSystem';
import { LEARNED_WEIGHTS, PERSONALITIES, takeAITurn } from '../src/engine/ai';
import { measureProgress } from '../src/engine/orders';
import {
  createGameState, beginTurn, restUnmoved, updateAliveFlags, stepNeutrals, stepMerchants,
  collectTribute, updateLoyalty, stepVoluntarySubmission, checkBlocVictory,
  stepOrders, stepRebellion,
} from '../src/engine';

const R = [LEARNED_WEIGHTS, ...['확장형','공격형','수비형','균형'].map((c)=>PERSONALITIES[c])];
type Rec = { resp: string; kind: string; best: number; deadline: number; done: boolean };
const seen = new Map<string, Rec>();
const live = new Set<string>();

for (let g = 0; g < 30; g++) {
  const rng = makeRng(1700 + g);
  const s = createGameState(5, 11, 11, rng);
  for (const n of s.nations) n.isHuman = false;
  for (let t = 1; t <= 200 && s.winner === null; t++) {
    s.turn = t;
    for (let id = 0; id < 5; id++) {
      if (!s.nations[id].alive || s.winner !== null) continue;
      s.current = id; beginTurn(s, id, rng);
      restUnmoved(s, id, takeAITurn(s, id, R[id], rng).moved);
      stepMerchants(s); stepNeutrals(s, rng); collectTribute(s); updateLoyalty(s);

      // 지워지기 전에 읽는다
      for (const n of s.nations) {
        const o = n.order;
        if (!n.alive || !o) continue;
        const key = `${g}:${n.id}:${o.issuedTurn}`;
        const prev = seen.get(key);
        const p = Math.max(o.progress, measureProgress(s, n, o));
        seen.set(key, {
          resp: o.response, kind: o.kind,
          best: Math.max(prev?.best ?? 0, p),
          deadline: o.deadline, done: prev?.done ?? false,
        });
        live.add(key);
      }

      // state.log 는 40줄에서 밀려나므로 기록으로 세면 이행이 새어나간다.
      // stepOrders 가 '이행'을 판정하는 규칙을 그대로 따라 직접 본다.
      for (const key of [...live]) {
        const nid = Number(key.split(':')[1]);
        const o = s.nations[nid]?.order;
        const rec = seen.get(key);
        if (!o || !rec || o.response !== 'obey') continue;
        let eff = Math.max(o.progress, measureProgress(s, s.nations[nid], o));
        if (o.kind === 'tax') eff += 1 / Math.max(1, o.deadline - o.issuedTurn);
        if (eff >= 1) { rec.best = 1; rec.done = true; }
      }

      stepOrders(s, rng); stepRebellion(s, rng);
      for (const key of [...live]) {
        const [, nid, issued] = key.split(':').map(Number);
        const n = s.nations[nid];
        if (!n?.order || n.order.issuedTurn !== issued) live.delete(key);
      }
      stepVoluntarySubmission(s, rng); updateAliveFlags(s); checkBlocVictory(s);
    }
  }
}

const by: Record<string, { n: number; sum: number; done: number }> = {};
const byKind: Record<string, { n: number; done: number }> = {};
for (const v of seen.values()) {
  by[v.resp] = by[v.resp] ?? { n: 0, sum: 0, done: 0 };
  by[v.resp].n++; by[v.resp].sum += v.best; if (v.done) by[v.resp].done++;
  const k = `${v.kind}/${v.resp === 'obey' ? '순종' : '불복'}`;
  byKind[k] = byKind[k] ?? { n: 0, done: 0 };
  byKind[k].n++; if (v.best >= 1) byKind[k].done++;
}
console.log('명령 이행 — 지도에서 읽은 값\n');
for (const k of ['obey', 'feign', 'refuse']) {
  const v = by[k]; if (!v) continue;
  console.log(`  ${k.padEnd(7)} ${String(v.n).padStart(4)}건 · 평균 ${(v.sum/v.n*100).toFixed(0)}% · 완수 ${((v.done/v.n)*100).toFixed(0)}%`);
}
console.log();
for (const [k, v] of Object.entries(byKind).sort()) {
  console.log(`  ${k.padEnd(14)} ${String(v.n).padStart(4)}건 · 완수 ${((v.done/v.n)*100).toFixed(0)}%`);
}
