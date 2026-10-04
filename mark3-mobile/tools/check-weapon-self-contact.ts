import assert from 'node:assert/strict';
import * as T from 'three';
import {exampleBattle} from '../src/screens/battleExamples';
import {bakeBattleMovement} from '../src/screens/battleReplay';
import {fighterPose} from '../src/screens/battleMotion';
import {knightTransforms} from '../src/screens/authoredKnightMotion';
import {ConvexHull} from 'three/examples/jsm/math/ConvexHull';
import {testKnightScene} from './knight-test-model';
import {buildFighter} from '../src/screens/fighterAppearance';
import {buildDuelContacts} from '../src/screens/duelContacts';
import {poseBattleActors} from '../src/screens/battleContacts';

// Independent chest-space envelope, including a gauntlet/forearm thickness.
function clearance(point:T.Vector3,chest:T.Vector3,q:T.Quaternion,radius:number){
 const v=point.clone().sub(chest).applyQuaternion(q.clone().invert()).sub(new T.Vector3(0,.25,0));
 return Math.sqrt((v.x/(.225+radius))**2+(v.y/(.30+radius))**2+(v.z/(.155+radius))**2)-1;
}
let worst={gap:Infinity,example:0,time:0,actor:0,part:''};
for(const index of [5,6,7,8,9,10]){
 const plan=exampleBattle(index),movement=bakeBattleMovement(plan);
 for(let tick=0;tick<plan.duration*30;tick++){
  const time=tick/30,frame=movement.sample(time);
  for(const a of plan.actors){
   if(a.weapon==='sword'||time>=a.deathAt)continue;
   const f=knightTransforms(fighterPose(a,time,frame.actions[a.id],frame.positions[a.id].moving));
   for(const [side,i] of [1,4].entries())for(let k=0;k<=6;k++){
    const point=f.bones[i+1].position.clone().lerp(f.hands[side].position,k/6);
    const gap=clearance(point,f.bones[0].position,f.bones[0].quaternion,.045);
    if(gap<worst.gap)worst={gap,example:index,time,actor:a.id,part:`${side?'left':'right'} forearm ${k}`};
   }
  }
 }
}
console.log(worst);
assert(worst.gap>=-.025,'arm passes through its own torso');

// Test the final rendered hands, after contact-height corrections and grounding,
// against a convex volume of the real breastplate, rather than IK targets alone.
for(const index of [5,6,7,8,9,10]){
 const plan=exampleBattle(index),movement=bakeBattleMovement(plan),actors=plan.actors.map(a=>{
  const rig=buildFighter(testKnightScene(),a.kind,undefined,a.weapon);new T.Group().add(rig.mesh);
  const geometry=rig.mesh.geometry,p=geometry.getAttribute('position'),ids=geometry.getAttribute('skinIndex'),weights=geometry.getAttribute('skinWeight'),points:T.Vector3[]=[];
  for(let n=0;n<p.count;n++)if(ids.getX(n)===0&&weights.getX(n)>.99&&Math.abs(p.getX(n))<.23&&p.getY(n)>.9&&p.getY(n)<1.43)points.push(new T.Vector3().fromBufferAttribute(p,n).sub(new T.Vector3(0,.88,0)));
  return {rig,shape:buildDuelContacts(rig),body:new ConvexHull().setFromPoints(points)};
 });
 let checked=0,inside=0,worstFrame='';
 for(const e of plan.exchanges)for(const dt of [-.6,-.4,-.2,0,.12,.24,.4,.55]){
  const t=e.at+dt;poseBattleActors(plan,t,movement.sample(t),actors,()=>0);
  for(const [i,a] of actors.entries()){
   if(plan.actors[i].weapon==='sword'||t>=plan.actors[i].deathAt)continue;
   const inverse=a.rig.bones[0].matrixWorld.clone().invert();
   for(const hand of a.rig.hands){const p=hand.geometry.getAttribute('position'),matrix=inverse.clone().multiply(hand.matrixWorld);
    for(let n=0;n<p.count;n+=3){checked++;if(a.body.containsPoint(new T.Vector3().fromBufferAttribute(p,n).applyMatrix4(matrix))){inside++;worstFrame=`${index} ${i} ${t}`;}}
   }
  }
 }
 console.log({example:index,checked,inside,worstFrame});assert.equal(inside,0,'rendered gauntlet penetrates breastplate');actors.forEach(a=>a.rig.dispose());
}
