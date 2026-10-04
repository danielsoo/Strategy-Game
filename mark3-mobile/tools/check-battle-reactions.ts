import assert from 'node:assert/strict';
import * as T from 'three';
import {exampleBattle} from '../src/screens/battleExamples';
import {bakeBattleMovement} from '../src/screens/battleReplay';
import {testKnightScene} from './knight-test-model';
import {buildFighter} from '../src/screens/fighterAppearance';
import {buildDuelContacts,armorSpheres} from '../src/screens/duelContacts';
import {poseBattleActors,shieldSurfacePoint} from '../src/screens/battleContacts';
const plan=exampleBattle(0),events=plan.exchanges.filter(e=>!e.fatal),movement=bakeBattleMovement(plan);
const actors=plan.actors.map(a=>{const rig=buildFighter(testKnightScene(),a.kind);new T.Group().add(rig.mesh);return {rig,shape:buildDuelContacts(rig)};});
assert(events.some(e=>e.move==='shove')&&events.some(e=>e.defense==='parry')&&events.some(e=>e.defense==='dodge'));
const runs:number[]=[];for(let i=0;i<events.length;i++){if(i&&events[i].attacker===events[i-1].attacker)runs[runs.length-1]++;else runs.push(1);}
assert(new Set(runs).size>=3,'initiative has single attacks, bursts and sustained pressure');
for(const e of events.filter(e=>e.counterOf!==undefined)){
 const previous=events.find(p=>p.at===e.counterOf)!;assert(previous.defense==='parry'||previous.defense==='dodge');assert.equal(e.attacker,previous.target);
}
for(const e of events.filter(e=>e.move==='shove')){
 poseBattleActors(plan,e.at,movement.sample(e.at),actors,()=>0);
 const attacker=actors[e.attacker],defender=actors[e.target],hand=attacker.rig.hands[1].getWorldPosition(new T.Vector3());
 const closest=shieldSurfacePoint(defender.rig,hand);
 const gap=closest.distanceTo(hand);
 const before=defender.rig.mesh.parent!.position.clone(),away=before.clone().sub(attacker.rig.mesh.parent!.position);away.y=0;away.normalize();
 poseBattleActors(plan,e.at+.26,movement.sample(e.at+.26),actors,()=>0);
 const retreat=defender.rig.mesh.parent!.position.clone().sub(before).dot(away);
 console.log('Shove',e.at,{gap,retreat});
 assert(gap<.04,'pushing hand reaches the guard');assert(retreat>.04,'defender steps back after a shove');
}
for(const e of events.filter(e=>e.defense==='dodge')){
 const before=movement.sample(e.at-.4).positions,from=before[e.target],enemy=before[e.attacker],tangent=new T.Vector3(-(enemy.z-from.z),0,enemy.x-from.x).normalize();
 const after=movement.sample(e.at+.1).positions[e.target];
 const sidestep=Math.abs(new T.Vector3(after.x-from.x,0,after.z-from.z).dot(tangent));
 poseBattleActors(plan,e.at,movement.sample(e.at),actors,()=>0);
 const sword=actors[e.attacker].rig.sword,line=new T.Line3(new T.Vector3(0,0,.1).applyMatrix4(sword.matrixWorld),new T.Vector3(0,0,.85).applyMatrix4(sword.matrixWorld));
 const gap=Math.min(...armorSpheres(actors[e.target].rig).map(s=>line.closestPointToPoint(s.center,true,new T.Vector3()).distanceTo(s.center)-s.radius));
 console.log('Dodge',e.at,{sidestep,gap});
 assert(sidestep>.12,'evasion moves off the attack line');assert(gap>0,'evaded blade misses the torso');
}
actors.forEach(a=>a.rig.dispose());
console.log('Parry/riposte, varied initiative and physical shove response verified');
