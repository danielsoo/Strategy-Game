import assert from 'node:assert/strict';
import * as T from 'three';
import {testKnightScene} from './knight-test-model';
import {buildFighter} from '../src/screens/fighterAppearance';
import {buildDuelContacts} from '../src/screens/duelContacts';
import {poseBattleActors} from '../src/screens/battleContacts';
import {bakeBattleMovement,attackLead,attackRecovery} from '../src/screens/battleReplay';
import {exampleBattle} from '../src/screens/battleExamples';
const example=Number(process.argv[2]??0),plan=exampleBattle(example),movement=bakeBattleMovement(plan),actors=plan.actors.map(a=>{const rig=buildFighter(testKnightScene(),a.kind);new T.Group().add(rig.mesh);return {rig,shape:buildDuelContacts(rig)};});
let previous:T.Vector3[][]|undefined;
const jumps:{time:number;actor:number;root:number;hip:number}[]=[];
for(let tick=0;tick<=Math.ceil(Math.min(plan.duration,Number(process.argv[3]??plan.duration))*60);tick++){
 const time=tick/60;poseBattleActors(plan,time,movement.sample(time),actors,()=>0);
 const now=actors.map(a=>[a.rig.mesh.parent!.position.clone(),a.rig.bones[8].getWorldPosition(new T.Vector3())]);
 if(previous)now.forEach((p,i)=>jumps.push({time,actor:i,root:p[0].distanceTo(previous![i][0]),hip:p[1].distanceTo(previous![i][1])}));previous=now;
}
const maxRoot=Math.max(...jumps.map(j=>j.root)),maxHip=Math.max(...jumps.map(j=>j.hip));
console.log('Largest root step',jumps.reduce((a,b)=>a.root>b.root?a:b));
assert(maxRoot<.075,`root teleported: ${maxRoot} metres in 1/60s`);
assert(maxHip<.085,`body snapped: ${maxHip} metres in 1/60s`);
const strikes=plan.exchanges.filter(e=>!e.fatal);
assert(strikes.length>=15,'sustained attacks throughout the duel');
assert(strikes.some((e,i)=>i>0&&e.attacker===strikes[i-1].attacker),'same fighter can continue a combo');
assert(strikes.some(e=>e.cut==='horizontal')&&strikes.some(e=>e.cut==='diagonal'),'both cuts are used');
if(example===0)assert(Math.max(...strikes.slice(1).map((e,i)=>e.at-attackLead(e)-(strikes[i].at+attackRecovery(strikes[i]))))<.32,'no idle round-length waits outside windup/recovery');
// Seeking and re-playing use the same foot paths, not display-frame-dependent lerp.
const checkTime=plan.exchanges[2].at;
poseBattleActors(plan,checkTime,movement.sample(checkTime),actors,()=>0);const first=actors.map(a=>a.rig.mesh.parent!.position.clone());
poseBattleActors(plan,.1,movement.sample(.1),actors,()=>0);
poseBattleActors(plan,checkTime,movement.sample(checkTime),actors,()=>0);actors.forEach((a,i)=>assert(a.rig.mesh.parent!.position.distanceTo(first[i])<1e-6));
console.log({maxRootStepAt60Hz:maxRoot,maxBodyStepAt60Hz:maxHip,strikes:plan.exchanges.length,deterministicSeeking:true});
actors.forEach(a=>a.rig.dispose());
