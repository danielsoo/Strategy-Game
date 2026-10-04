import assert from 'node:assert/strict';
import * as T from 'three';
import {exampleBattle} from '../src/screens/battleExamples';
import {bakeBattleMovement} from '../src/screens/battleReplay';
import {fighterPose} from '../src/screens/battleMotion';
import {knightTransforms} from '../src/screens/authoredKnightMotion';
import {testKnightScene} from './knight-test-model';
import {buildFighter} from '../src/screens/fighterAppearance';
import {buildDuelContacts} from '../src/screens/duelContacts';
import {poseBattleActors} from '../src/screens/battleContacts';

for(const index of process.argv[2]?[+process.argv[2]]:[5,6,7,8,9,10]){
 const plan=exampleBattle(index),movement=bakeBattleMovement(plan),actors=plan.actors.map(a=>{const rig=buildFighter(testKnightScene(),a.kind,undefined,a.weapon);new T.Group().add(rig.mesh);return {rig,shape:buildDuelContacts(rig)};});
 let navMax=0,renderMax=0,minEdge=1,shaftY=0,maxTurn={angle:0,time:0,actor:0};const last=new Map<number,T.Quaternion>();
 for(let t=0;t<plan.finish;t+=.1)for(const p of movement.sample(t).positions)navMax=Math.max(navMax,Math.hypot(p.x,p.z));
 for(let tick=0;tick<plan.finish*60;tick++){const t=tick/60,frame=movement.sample(t);for(const a of plan.actors){if(a.weapon==='sword'||t>=a.deathAt)continue;const f=knightTransforms(fighterPose(a,t,frame.actions[a.id],frame.positions[a.id].moving)),q=f.bones[16].quaternion;if(last.has(a.id)){const angle=q.angleTo(last.get(a.id)!);if(angle>maxTurn.angle)maxTurn={angle,time:t,actor:a.id};}last.set(a.id,q);}}
 for(const e of plan.exchanges){
  const frame=movement.sample(e.at);poseBattleActors(plan,e.at,frame,actors,()=>0);
  for(const a of actors)renderMax=Math.max(renderMax,Math.hypot(a.rig.mesh.parent!.position.x,a.rig.mesh.parent!.position.z));
  const a=plan.actors[e.attacker];if(a.weapon==='sword'||e.move==='shove')continue;
  const f=knightTransforms(fighterPose(a,e.at,frame.actions[a.id],false));
  if(a.weapon==='spear')shaftY=Math.max(shaftY,Math.abs(new T.Vector3(0,0,1).applyQuaternion(f.bones[16].quaternion).y));
  if(['axe','hatchet','halberd'].includes(a.weapon!)&&e.cut!=='horizontal'){
   const edge=new T.Vector3(1,0,0).applyQuaternion(f.bones[16].quaternion),axis=new T.Vector3(0,0,1).applyQuaternion(f.bones[16].quaternion);
   const tangent=new T.Vector3(0,-1,0).addScaledVector(axis,axis.y).normalize();minEdge=Math.min(minEdge,edge.dot(tangent));
  }
 }
 console.log({index,navMax,renderMax,minEdge,shaftY,maxTurn});
 assert(navMax<(index===10?4.5:3.2),'fighters chase one another away from the engagement centre');
 assert(renderMax<(index===10?4.5:2.4),'contact corrections move the battle off-centre');
 assert(minEdge>.85,'chopping edge turns away from its downward cutting plane');
 assert(shaftY<.18,'spear thrust points above the opponent');
 assert(maxTurn.angle<.45,'weapon abruptly changes its elbow branch or cutting plane');
 for(const a of plan.actors.filter(a=>Number.isFinite(a.deathAt))){const t=a.deathAt+2;poseBattleActors(plan,t,movement.sample(t),actors,()=>0);const g=actors[a.id].rig.mesh.parent!;assert(Math.hypot(g.position.x,g.position.z)<(index===10?4.8:2.6),'fallen actor leaves the review arena');}
 actors.forEach(a=>a.rig.dispose());
}
