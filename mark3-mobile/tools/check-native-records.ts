import assert from 'node:assert/strict';
import {resolveCombat,makeRng,DEFAULT_COMBAT_CONFIG} from '../src/services/combatSystem';
import {nativeBattlePlan,representedCount} from '../src/screens/nativeBattlePlan';

const outcomes=new Set<string>();let count=0;
for(const [a,b] of [[1,1],[1,3],[3,1],[3,3],[12,12],[60,60],[80,4],[4,80],[0,3],[3,0],[0,0]])for(let seed=1;seed<=30;seed++){
 const result=resolveCombat({units:a},{units:b},makeRng(seed)),before=JSON.stringify(result),plan=nativeBattlePlan(result);
 outcomes.add(result.outcome);count++;
 assert.deepEqual(plan.final,[result.attackerSurvivors,result.defenderSurvivors]);
 assert.equal(plan.outcome,result.outcome);assert.equal(plan.reason,result.reason);
 for(const side of [0,1]){
  const actors=plan.actors.filter(a=>a.side===side);
  assert(actors.length<=3);
  assert.equal(actors.reduce((n,a)=>n+representedCount(a,plan.final[side]),0),plan.final[side]);
 }
 assert.deepEqual(plan.fallen,plan.actors.filter(a=>!representedCount(a,plan.final[a.side])).map(a=>a.id));
 assert.equal(JSON.stringify(result),before,'presentation mutated game result');
 assert.deepEqual(nativeBattlePlan(result),plan,'replay rerolled outcome');
 // Intermediate damage records must not gate animation activity.
 if(result.rounds.length){
  const altered={...result,rounds:[{...result.rounds[0],round:97},...result.rounds.slice(1).reverse(),...result.rounds.slice(1)]};
  assert.deepEqual(nativeBattlePlan(altered),plan,'animation depends on resolver round order/count');
  assert.deepEqual(nativeBattlePlan({...result,rounds:[result.rounds[0]]}),plan,'animation waits for intermediate loss records');
 }
}
const draw=resolveCombat({units:5},{units:5},makeRng(9),{...DEFAULT_COMBAT_CONFIG,maxRounds:2,baseLossRate:0,routThreshold:0});
assert.equal(nativeBattlePlan(draw).fallen.length,0);assert.equal(draw.outcome,'stalemate');
assert.equal(outcomes.size,3);
console.log(`${count} resolved battles: immutable outcome, casualty slices, no dependency on intermediate rounds PASS`);
