import assert from 'node:assert/strict';
import {resolveCombat,makeRng,DEFAULT_COMBAT_CONFIG} from '../src/services/combatSystem';
import {createBattleReplay,replayStage,representedTroops,bakeBattleMovement} from '../src/screens/battleReplay';
import {exampleBattle,BATTLE_EXAMPLES} from '../src/screens/battleExamples';
for(let seed=0;seed<150;seed++){
 const result=resolveCombat({units:1+seed%37},{units:1+(seed*13)%41},makeRng(seed));
 const before=JSON.stringify(result),plan=createBattleReplay(result,['knight','bandit']);
 assert.equal(JSON.stringify(result),before,'replay does not mutate combat results');
 assert.deepEqual(plan.final,[result.attackerSurvivors,result.defenderSurvivors]);
 assert.deepEqual(createBattleReplay(result,['knight','bandit']),plan,'replay is deterministic');
 for(const stage of plan.stages)for(const side of [0,1]){
  const shown=plan.actors.filter(a=>a.side===side&&a.deathAt>stage.at).reduce((n,a)=>n+representedTroops(a,stage.counts[side]),0);
  assert.equal(shown,stage.counts[side],`seed ${seed}: survivor groups match round ${stage.round}`);
 }
 for(const e of plan.exchanges){
  assert.notEqual(plan.actors[e.attacker].side,plan.actors[e.target].side);
  assert(e.at<plan.actors[e.attacker].deathAt,`seed ${seed}: dead actor attacks at ${e.at}`);
  assert(e.at<plan.actors[e.target].deathAt,'no striking an already dead target');
  if(e.defense==='shield')assert.equal(plan.actors[e.target].kind,'knight');
  if(e.defense==='parry')assert.equal(plan.actors[e.target].kind,'mercenary');
 }
 assert(plan.actors.every(a=>!Number.isFinite(a.deathAt)||a.deathAt+7<plan.duration));
}
const draw=resolveCombat({units:5},{units:5},makeRng(7),{...DEFAULT_COMBAT_CONFIG,maxRounds:2,baseLossRate:0,routThreshold:0});
assert.equal(createBattleReplay(draw).outcome,'stalemate');assert(createBattleReplay(draw).actors.every(a=>a.deathAt===Infinity));
for(let i=0;i<BATTLE_EXAMPLES.length;i++){
 const p=exampleBattle(i),nav=bakeBattleMovement(p),end=nav.sample(p.duration);
 assert.deepEqual(replayStage(p,p.duration).counts,p.final);
 for(let t=0;t<p.duration;t+=1/30){const f=nav.sample(t);assert(f.positions.every(a=>[a.x,a.z,a.yaw].every(Number.isFinite)));
  for(let a=0;a<p.actors.length;a++)for(let b=a+1;b<p.actors.length;b++)if(t<p.actors[a].deathAt&&t<p.actors[b].deathAt)assert(Math.hypot(f.positions[a].x-f.positions[b].x,f.positions[a].z-f.positions[b].z)>.86,'live bodies do not overlap');
 }
 assert(end.positions.length===p.actors.length);console.log(BATTLE_EXAMPLES[i].label,p.initial,p.final,p.outcome,p.duration);
}
console.log('150 engine results: exact counts, rout losses, stalemate, deterministic replay, live targets and body clearance verified');
