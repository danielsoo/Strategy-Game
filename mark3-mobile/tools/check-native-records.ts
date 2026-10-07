import assert from 'node:assert/strict';
import {resolveCombat,makeRng,DEFAULT_COMBAT_CONFIG} from '../src/services/combatSystem';
import {nativeBattlePlan,representedCount} from '../src/screens/nativeBattlePlan';

const outcomes=new Set<string>();let count=0;
for(const [a,b] of [[1,1],[1,3],[3,1],[3,3],[12,12],[60,60],[80,4],[4,80],[0,3],[3,0],[0,0]])for(let seed=1;seed<=30;seed++){
 const result=resolveCombat({units:a},{units:b},makeRng(seed)),before=JSON.stringify(result),plan=nativeBattlePlan(result);
 outcomes.add(result.outcome);count++;
 assert.deepEqual(plan.final,[result.attackerSurvivors,result.defenderSurvivors]);
 assert.equal(plan.outcome,result.outcome);assert.equal(plan.reason,result.reason);
 for(const side of [0,1])assert(plan.actors.filter(a=>a.side===side).length<=3);
 const sizes=[0,1].map(side=>plan.actors.filter(a=>a.side===side).length);
 if(sizes[0]&&sizes[1]&&sizes[0]!==sizes[1]&&plan.rounds[0]?.round===1){
  const majority=sizes[0]>sizes[1]?0:1,allies=plan.actors.filter(a=>a.side===majority);
  const pressure=plan.rounds[0].exchanges.slice(0,allies.length);
  assert.equal(new Set(pressure.map(e=>e.attacker)).size,allies.length,'not every outnumbering soldier took initiative');
  pressure.forEach(e=>{assert.equal(plan.actors[e.attacker].side,majority);assert.equal(e.event.outcome,'block','opening pressure invented damage');});
 }
 const dead=new Set<number>();let counts=plan.initial;
 for(const round of plan.rounds){
  for(const e of round.exchanges){assert(!dead.has(e.attacker)&&!dead.has(e.target),'dead representative acted again');assert.notEqual(plan.actors[e.attacker].side,plan.actors[e.target].side);if(e.event.outcome==='hit')assert(round.counts[plan.actors[e.target].side]<counts[plan.actors[e.target].side],'invented damage in an unchanged round');}
  for(const id of round.fallen){assert(!dead.has(id));const actor=plan.actors[id];assert.equal(representedCount(actor,round.counts[actor.side]),0);dead.add(id);}
  for(const side of [0,1])assert.equal(plan.actors.filter(a=>a.side===side).reduce((n,a)=>n+representedCount(a,round.counts[side]),0),round.counts[side]);
  counts=round.counts;
 }
 assert.deepEqual(counts,plan.final);assert.equal(JSON.stringify(result),before,'presentation mutated game result');assert.deepEqual(nativeBattlePlan(result),plan,'replay rerolled choreography');
}
const draw=resolveCombat({units:5},{units:5},makeRng(9),{...DEFAULT_COMBAT_CONFIG,maxRounds:2,baseLossRate:0,routThreshold:0});
assert.equal(nativeBattlePlan(draw).rounds.flatMap(r=>r.fallen).length,0);
assert.equal(draw.outcome,'stalemate');
const variation=nativeBattlePlan(resolveCombat({units:3},{units:3},makeRng(41))).rounds[0].exchanges;
assert(new Set(variation.map(e=>`${e.event.attacker}:${e.event.heavy}:${e.event.variation}`)).size>1,'all fighters copied the same action');
assert.equal(outcomes.size,3);
console.log(`${count} resolved battles: outcome, round counts, casualty slices, no resurrection, no mutation, deterministic variation PASS`);
