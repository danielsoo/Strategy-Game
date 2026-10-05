import assert from 'node:assert/strict';
import * as T from 'three';
import {exampleBattle} from '../src/screens/battleExamples';
import {bakeBattleMovement,attackLead} from '../src/screens/battleReplay';
import {fighterPose} from '../src/screens/battleMotion';
import {knightTransforms} from '../src/screens/authoredKnightMotion';

for(const index of [5,6,7,8,9]){
 const plan=exampleBattle(index),movement=bakeBattleMovement(plan);
 const event=plan.exchanges.find(e=>e.attacker===0&&e.move!=='shove')!,actor=plan.actors[0];
 const poses=[event.at-attackLead(event)*.4,event.at].map(t=>{const frame=movement.sample(t);return knightTransforms(fighterPose(actor,t,frame.actions[0],false));});
 const [load,hit]=poses,arm=(f:typeof load)=>f.bones[2].position.clone().sub(f.bones[1].position).normalize();
 const pelvis=load.bones[8].quaternion.angleTo(hit.bones[8].quaternion),chest=load.bones[0].quaternion.angleTo(hit.bones[0].quaternion),upperArm=arm(load).angleTo(arm(hit));
 const shoulder=load.bones[1].position.distanceTo(hit.bones[1].position),elbow=load.bones[2].position.distanceTo(hit.bones[2].position),grip=load.grip.distanceTo(hit.grip);
 let wristBend=0,worstWrist={time:0,side:0};
 for(let tick=0;tick<plan.finish*60;tick++){
  const t=tick/60,frame=movement.sample(t);if(t>=actor.deathAt)continue;
  const f=knightTransforms(fighterPose(actor,t,frame.actions[0],false));
  for(const [side,elbowIndex] of [2,5].entries()){
   const forearm=f.hands[side].position.clone().sub(f.bones[elbowIndex].position).normalize();
   const bend=forearm.angleTo(new T.Vector3(0,1,0).applyQuaternion(f.hands[side].quaternion));
   if(bend>wristBend){wristBend=bend;worstWrist={time:t,side};}
  }
 }
 console.log({weapon:actor.weapon,pelvis,chest,upperArm,shoulder,elbow,grip,wristBend,worstWrist});
 if(actor.weapon==='spear'){
  // A thrust is powered by translation along the shaft, not an axe-like sweep.
  const axis=new T.Vector3(0,0,1).applyQuaternion(hit.bones[16].quaternion);
  const travel=hit.grip.clone().sub(load.grip),hipTravel=hit.bones[8].position.clone().sub(load.bones[8].position);
  console.log({axis:axis.toArray(),travel:travel.toArray(),along:travel.dot(axis),alignment:travel.clone().normalize().dot(axis),hip:hipTravel.dot(axis)});
  assert(travel.dot(axis)>.25&&travel.clone().normalize().dot(axis)>.85,'spear moves sideways instead of along its shaft');
  assert(hipTravel.dot(axis)>.12,'spear thrust has no body weight transfer');
  assert(chest<.35&&pelvis<.25,'spear thrust inherits a broad chopping torso rotation');
 }else{
  assert(pelvis>.25,'attack has no meaningful pelvis rotation');
  assert(chest>.35,'attack has no meaningful chest rotation');
 }
 assert(shoulder>.08&&elbow>.12&&grip>.18,'weapon is flicked from a stationary arm');
 assert(wristBend<Math.PI/9,'gripping hand bends away from the forearm');
}
