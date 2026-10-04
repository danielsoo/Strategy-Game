import assert from 'node:assert/strict';
import * as T from 'three';
import {testKnightScene} from './knight-test-model';
import {buildFighter} from '../src/screens/fighterAppearance';
import {buildDuelContacts,bladeShield,armorSpheres} from '../src/screens/duelContacts';
import {poseBattleActors,swordContact} from '../src/screens/battleContacts';
import {exampleBattle} from '../src/screens/battleExamples';
import {bakeBattleMovement} from '../src/screens/battleReplay';
import {WEAPONS,weaponPoint,parryPoint} from '../src/screens/battleWeapons';
import {fighterPose} from '../src/screens/battleMotion';
import {knightTransforms} from '../src/screens/authoredKnightMotion';

for(const index of process.argv[2]?[Number(process.argv[2])]:[5,6,7,8,9,10]){
 const plan=exampleBattle(index),movement=bakeBattleMovement(plan),actors=plan.actors.map(a=>{const rig=buildFighter(testKnightScene(),a.kind,undefined,a.weapon);new T.Group().add(rig.mesh);return {rig,shape:buildDuelContacts(rig)};});
 const e=plan.exchanges[0];let maxSupport=0,maxLift=0;
 for(const event of plan.exchanges)for(const offset of [-.4,-.2,0,.15,.35]){
  const t=event.at+offset,frame=movement.sample(t);poseBattleActors(plan,t,frame,actors,()=>0);
  for(const [i,a] of actors.entries()){
   const p=a.rig.mesh.parent!;assert(Number.isFinite(p.position.length()));assert(a.shape.groundLift(p.position,p.rotation.y,()=>0)<1e-5,'equipment stays above ground');
   maxLift=Math.max(maxLift,p.position.y);
   assert.equal(a.rig.hasShield,plan.actors[i].kind==='knight'&&!WEAPONS[plan.actors[i].weapon!].twoHanded);
   if(t<plan.actors[i].deathAt&&WEAPONS[plan.actors[i].weapon!].twoHanded){
    const pose=fighterPose(plan.actors[i],t,frame.actions[i],frame.positions[i].moving),f=knightTransforms(pose),support=pose.weaponPose?.support;
    if(support!==undefined){const target=new T.Vector3(0,0,support).applyQuaternion(f.bones[16].quaternion).add(f.grip),hand=new T.Vector3(.025,.076,0).applyQuaternion(f.hands[1].quaternion).add(f.hands[1].position);maxSupport=Math.max(maxSupport,hand.distanceTo(target));}
   }
  }
  if(offset===0&&event.defense==='parry')assert(swordContact(actors[event.attacker],actors[event.target]),'parry actually contacts the weapon '+index+' '+event.at+' '+event.attacker);
  if(offset===0&&event.fatal){const rig=actors[event.attacker].rig,line=new T.Line3(weaponPoint(rig.sword,.1).applyMatrix4(rig.sword.matrixWorld),weaponPoint(rig.sword,.85).applyMatrix4(rig.sword.matrixWorld));const gap=Math.min(...armorSpheres(actors[event.target].rig).map(s=>line.closestPointToPoint(s.center,true,new T.Vector3()).distanceTo(s.center)-s.radius));assert(gap<.09,'fatal strike reaches the victim '+index+' '+gap);}
  for(let i=0;i<actors.length;i++)for(let j=0;j<actors.length;j++)if(i!==j&&t<plan.actors[i].deathAt&&t<plan.actors[j].deathAt)assert(!bladeShield(actors[i].rig,actors[j].rig,actors[j].shape,0),`weapon penetrates shield at ${index} ${offset}`);
 }
 const t=e.at;poseBattleActors(plan,t,movement.sample(t),actors,()=>0);const expected=weaponPoint(actors[0].rig.sword,.52).applyMatrix4(actors[0].rig.sword.matrixWorld);
 poseBattleActors(plan,t+.25,movement.sample(t+.25),actors,()=>0);poseBattleActors(plan,t,movement.sample(t),actors,()=>0);assert(expected.distanceTo(weaponPoint(actors[0].rig.sword,.52).applyMatrix4(actors[0].rig.sword.matrixWorld))<1e-7,'scrubbing is deterministic');
 console.log({example:index,weapons:plan.actors.map(a=>a.weapon),maxSupport,maxLift,final:plan.final});
 assert(maxSupport<.065,'support hand stays on the haft');
 for(const actor of plan.actors.filter(a=>Number.isFinite(a.deathAt))){let last:T.Vector3|undefined;for(const dt of [2.3,3]){const t=actor.deathAt+dt;poseBattleActors(plan,t,movement.sample(t),actors,()=>0);const hip=actors[actor.id].rig.bones[8].getWorldPosition(new T.Vector3());if(last)assert(hip.distanceTo(last)<.001,'fallen weapon carrier stays settled');last=hip;}}
 actors.forEach(a=>a.rig.dispose());
}
