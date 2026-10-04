import assert from 'node:assert/strict';
import * as T from 'three';
import {testKnightScene} from './knight-test-model';
import {buildFighter} from '../src/screens/fighterAppearance';
import {buildDuelContacts,bladeShield,armorSpheres} from '../src/screens/duelContacts';
import {poseBattleActors,swordContact} from '../src/screens/battleContacts';
import {bakeBattleMovement} from '../src/screens/battleReplay';
import {exampleBattle} from '../src/screens/battleExamples';
import {DEATH_START,DEATH_LANDED_AT} from '../src/screens/authoredKnightMotion';
for(const example of process.argv[2]?[Number(process.argv[2])]:[0,1,2,3]){
 const plan=exampleBattle(example),movement=bakeBattleMovement(plan),actors=plan.actors.map(a=>{const rig=buildFighter(testKnightScene(),a.kind);new T.Group().add(rig.mesh);return {rig,shape:buildDuelContacts(rig)};});
 for(const a of actors)assert.equal(a.rig.shield.visible,a.rig.kind==='knight');
 for(const event of plan.exchanges.filter(e=>!process.argv[3]||Math.abs(e.at-Number(process.argv[3]))<.001))for(const offset of [-.4,-.2,-.08,0,.08,.2,.4]){
  const time=event.at+offset;poseBattleActors(plan,time,movement.sample(time),actors,()=>0);
  for(const a of actors){const g=a.rig.mesh.parent as T.Group;assert(a.shape.groundLift(g.position,g.rotation.y,()=>0)<1e-6,'visible body and equipment stay above ground');}
  for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++)if(time<plan.actors[i].deathAt&&time<plan.actors[j].deathAt){
   const a=actors[i].rig.mesh.parent!,b=actors[j].rig.mesh.parent!;
   assert(Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)>.80,'contact correction keeps bodies apart');
   assert(!bladeShield(actors[i].rig,actors[j].rig,actors[j].shape,0),`blade ${i} through shield ${j} at ${time}`);
   assert(!bladeShield(actors[j].rig,actors[i].rig,actors[i].shape,0),`blade ${j} through shield ${i} at ${time}`);
  }
  if(offset===0&&event.defense==='parry')assert(swordContact(actors[event.attacker],actors[event.target]),`parry ${event.attacker} ${event.target} at ${time} cut ${event.cut}`);
  if(offset===0&&event.fatal){const a=actors[event.attacker],b=actors[event.target],line=new T.Line3(new T.Vector3(0,0,.1).applyMatrix4(a.rig.sword.matrixWorld),new T.Vector3(0,0,.85).applyMatrix4(a.rig.sword.matrixWorld));const gap=Math.min(...armorSpheres(b.rig).map(s=>line.closestPointToPoint(s.center,true,new T.Vector3()).distanceTo(s.center)-s.radius));assert(gap<.08,`fatal blade ${event.attacker} reaches ${event.target} at ${time}`);}
 }
 for(const a of plan.actors.filter(a=>Number.isFinite(a.deathAt))){let rest:T.Vector3|undefined;for(const dt of [DEATH_LANDED_AT-DEATH_START+.02,2.5,3.0]){const t=a.deathAt+dt;poseBattleActors(plan,t,movement.sample(t),actors,()=>0);const hip=actors[a.id].rig.bones[8].getWorldPosition(new T.Vector3());if(rest)assert(hip.distanceTo(rest)<1e-5,'landed body stays grounded until it dissolves');rest=hip;}}
 if(example===0){const root=new T.Group();root.scale.setScalar(.17);root.rotation.y=.55;root.position.set(2,.4,-1);actors.forEach(a=>root.add(a.rig.mesh.parent!));root.updateMatrixWorld(true);const e=plan.exchanges[0],height=(x:number,z:number)=>.015*x+.02*z;poseBattleActors(plan,e.at,movement.sample(e.at),actors,height,.17,.55);assert(swordContact(actors[e.attacker],actors[e.target],.17),'map scale and rotation preserve sword contact');for(const a of actors){const g=a.rig.mesh.parent!;assert(a.shape.groundLift(g.position,g.rotation.y,height)<1e-5,'map actors stand on sloping terrain');}}
 actors.forEach(a=>a.rig.dispose());
 console.log(`Scenario ${example}: windup, impact, recovery, casualties and ground contact passed`);
}
console.log('Archetype equipment, exact blade contacts and terrain clearance verified');
