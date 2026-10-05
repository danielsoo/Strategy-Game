import assert from 'node:assert/strict';
import * as T from 'three';
import {testKnightScene} from './knight-test-model';
import {buildFighter} from '../src/screens/fighterAppearance';
import {exampleBattle} from '../src/screens/battleExamples';
import {bakeBattleMovement} from '../src/screens/battleReplay';
import {fighterPose} from '../src/screens/battleMotion';
import {poseAuthoredKnight} from '../src/screens/authoredKnightMotion';

// Check the visible cloth surface, not just hand targets: it must keep volume
// around the bone and never produce the projecting, folded plate-arm silhouette.
let vertices=0,maxRadius=0;
for(const example of [6,7,8,10]){
 const plan=exampleBattle(example),movement=bakeBattleMovement(plan);
 for(const actor of plan.actors.filter(a=>a.kind!=='knight'&&a.weapon!=='sword')){
  const rig=buildFighter(testKnightScene(),actor.kind,undefined,actor.weapon),g=rig.mesh.geometry;
  const group=g.groups.at(-1)!,index=g.getIndex()!,p=g.getAttribute('position'),ids=g.getAttribute('skinIndex');
  const sleeveVertices=new Set(Array.from(index.array).slice(group.start,group.start+group.count));
  for(let t=0;t<Math.min(actor.deathAt,plan.finish);t+=.08){
   const frame=movement.sample(t);poseAuthoredKnight(rig,fighterPose(actor,t,frame.actions[actor.id],frame.positions[actor.id].moving));rig.mesh.skeleton.update();
   for(const n of sleeveVertices){
    const point=rig.mesh.applyBoneTransform(n,new T.Vector3().fromBufferAttribute(p,n));
    const arm=ids.getX(n),s=rig.bones[arm].position,e=rig.bones[arm+1].position,w=rig.bones[arm+2].position;
    const upper=new T.Line3(s,e),lower=new T.Line3(e,w);
    const radius=Math.min(point.distanceTo(upper.closestPointToPoint(point,true,new T.Vector3())),point.distanceTo(lower.closestPointToPoint(point,true,new T.Vector3())));
    maxRadius=Math.max(maxRadius,radius);vertices++;
    assert(Number.isFinite(radius)&&radius<.095,`folded sleeve protrudes from arm at ${example}/${actor.id}/${t}`);
   }
   // Inner-elbow points can lie near the other segment; measure each cloth
   // cross-section's own width to distinguish a bent arm from collapsed skin.
   const first=Math.min(...sleeveVertices);
   for(let row=first;row<p.count;row+=17){
    const points=Array.from({length:16},(_,i)=>rig.mesh.applyBoneTransform(row+i,new T.Vector3().fromBufferAttribute(p,row+i)));
    const center=points.reduce((sum,v)=>sum.add(v),new T.Vector3()).multiplyScalar(1/16);
    assert(Math.min(...points.map(v=>v.distanceTo(center)))>.023,`sleeve cross-section collapses at ${example}/${actor.id}/${t}`);
   }
  }
  rig.dispose();
 }
}
console.log({vertices,maxRadius});
