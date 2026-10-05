import assert from 'node:assert/strict';
import * as T from 'three';
import {exampleBattle} from '../src/screens/battleExamples';
import {bakeBattleMovement} from '../src/screens/battleReplay';
import {fighterPose} from '../src/screens/battleMotion';
import {knightTransforms} from '../src/screens/authoredKnightMotion';

let maxElbowHeight=-Infinity,maxSpread=0,maxUpperArmAngle=0,frames=0;
for(const example of [7,10]){
 const plan=exampleBattle(example),movement=bakeBattleMovement(plan);
 for(const actor of plan.actors.filter(a=>a.weapon==='spear'))for(let t=0;t<Math.min(actor.deathAt,plan.finish);t+=1/30){
  const sample=movement.sample(t),f=knightTransforms(fighterPose(actor,t,sample.actions[actor.id],sample.positions[actor.id].moving));
  const inverse=f.bones[0].quaternion.clone().invert(),chest=f.bones[0].position;
  for(const i of [1,4]){
   const s=f.bones[i].position.clone().sub(chest).applyQuaternion(inverse),e=f.bones[i+1].position.clone().sub(chest).applyQuaternion(inverse);
   maxElbowHeight=Math.max(maxElbowHeight,e.y-s.y);maxSpread=Math.max(maxSpread,Math.abs(e.x));
   maxUpperArmAngle=Math.max(maxUpperArmAngle,e.clone().sub(s).angleTo(new T.Vector3(0,-1,0)));frames++;
  }
 }
}
console.log({frames,maxElbowHeight,maxSpread,maxUpperArmAngle});
assert(maxElbowHeight<-.07,'spear grip lifts the elbow level with the shoulder');
assert(maxSpread<.42,'spear elbow flares too far outside the torso');
assert(maxUpperArmAngle<Math.PI*.40,'spear upper arm is held sideways rather than down');
