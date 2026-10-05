import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createDuelActor,createNativeDuel,duelEvents,DuelFighter,DuelSide} from '../src/screens/nativeDuel';
import {arrowPose,ARROW_LENGTH} from '../src/screens/duelBallistics';
(globalThis as any).ProgressEvent=class{};
async function load(id:string){const dir=`public/realm/${id}`,j=JSON.parse(fs.readFileSync(`${dir}/model.gltf`,'utf8'));for(const b of j.buffers)b.uri='data:application/octet-stream;base64,'+fs.readFileSync(`${dir}/${b.uri}`).toString('base64');for(const m of j.materials){delete m.pbrMetallicRoughness.baseColorTexture;delete m.normalTexture;}return new GLTFLoader().parseAsync(JSON.stringify(j),'');}
async function main(){
 const assets={paladin:await load('paladin'),arissa:await load('arissa'),erika:await load('erika')};
 const configs:[DuelFighter,DuelFighter,DuelSide][]=[];
 for(const weapon of ['sword','axe','hatchet','spear','halberd','flail','bow'] as const)configs.push([{model:'paladin',weapon},{model:'paladin',weapon:'sword'},0]);
 for(const model of ['arissa','erika'] as const)configs.push([{model,weapon:model==='arissa'?'hatchet':'axe'},{model:'paladin',weapon:'sword'},1],[{model:'paladin',weapon:'sword'},{model,weapon:model==='arissa'?'hatchet':'axe'},0]);
 configs.push([{model:'erika',weapon:'bow'},{model:'paladin',weapon:'sword'},1]);
 for(const [a,b,winner] of configs){
  const duel=createNativeDuel([createDuelActor(assets[a.model],a),createDuelActor(assets[b.model],b)],duelEvents(winner,a.weapon==='bow'));
  for(const e of duel.events){
   const A=duel.actors[e.attacker],D=duel.actors[1-e.attacker];
   const preHealth=[...duel.update(e.contact-.001).health];
   duel.update(e.contact);const attackPoint=A.visual.localToWorld(A.strike.clone()),defensePoint=D.visual.localToWorld((e.outcome==='block'?D.guard:D.bodyTarget).clone());
   if(e.outcome==='block'){assert.deepEqual(duel.state.health,preHealth,'a successful block caused damage');assert.equal(duel.state.winner,null,'a successful block killed the defender');}
   else{assert(['block','twoBlock','axeBlock','bowIdle'].includes(e.defenderClip),'failure is an attack pose instead of a guard attempt');assert(e.defenseTime<=.111,'failed guard was fully raised');if(D.fighter.model==='paladin'&&D.fighter.weapon==='sword')assert(D.guard.distanceTo(D.bodyTarget)>.25,'shield still covers the hit point');}
   if(A.fighter.weapon!=='bow')assert(attackPoint.distanceTo(defensePoint)<.48,`${a.model}/${a.weapon} vs ${b.model}: contact missed (${attackPoint.distanceTo(defensePoint)})`);
   else{const arrow=A.equipment.prop!.userData.arrow as T.Group;arrow.updateWorldMatrix(true,false);const tip=arrow.localToWorld(new T.Vector3(0,0,.935));assert(tip.distanceTo(e.point)<.015,'arrow did not reach resolved contact');duel.update(e.contact+.2);assert(!arrow.visible,'arrow continued through opponent');}
   // Sampling both sides of every contact catches position discontinuities.
   duel.update(e.contact-1/60);const before=duel.actors.map(x=>x.visual.position.clone());duel.update(e.contact+1/60);duel.actors.forEach((x,i)=>assert(x.visual.position.distanceTo(before[i])<.12,'contact teleported a fighter'));
   if(e.outcome!=='block'){
    const joints=['mixamorigRightHand','mixamorigLeftHand','mixamorigNeck'];
    duel.update(e.contact-.01);const pre=joints.map(n=>D.root.getObjectByName(n)!.getWorldPosition(new T.Vector3()));
    duel.update(e.contact+.01);joints.forEach((n,i)=>assert(D.root.getObjectByName(n)!.getWorldPosition(new T.Vector3()).distanceTo(pre[i])<.08,'guard-to-impact transition snapped a joint'));
   }
  }
  let previous:T.Vector3[]|undefined;
  for(let t=0;t<duel.duration;t+=1/24){duel.update(t);const positions=duel.actors.map(A=>A.visual.position.clone());assert(positions[0].distanceTo(positions[1])>1.1,'fighters overlap');if(previous)positions.forEach((p,i)=>assert(p.distanceTo(previous![i])<.25,'fighter root teleported'));previous=positions;}
  const end=duel.update(duel.duration);assert.equal(end.winner,winner);assert.equal(end.health[1-winner],0);assert(end.health[winner]>0);
  const t=duel.events[0].contact;duel.update(t);const first=duel.actors.map(A=>A.visual.localToWorld(A.strike.clone()));duel.update(duel.duration);duel.update(t);duel.actors.forEach((A,i)=>assert(A.visual.localToWorld(A.strike.clone()).distanceTo(first[i])<1e-5,'rewind changes resolved fight'));
  console.log(`${a.model}/${a.weapon} vs ${b.model}/${b.weapon}: contact, arrow, spacing, replay and winner ${winner} verified`);duel.dispose();
 }
 for(const model of ['paladin','arissa','erika'] as const){
  const duel=createNativeDuel([createDuelActor(assets[model],{model,weapon:'bow'}),createDuelActor(assets.paladin,{model:'paladin',weapon:'sword'})],duelEvents(0,true),18);
  for(const e of duel.events){
   const f=e.ballistic!;assert(f.velocity.y>5,'long shot did not launch upward');
   const mid=arrowPose(f,f.duration/2),end=arrowPose(f,f.duration);
   assert(mid.position.y>Math.max(f.origin.y,e.point.y)+2,'long shot did not rise in an arc');
   assert(end.direction.y<0,'long shot did not descend');assert(end.position.clone().addScaledVector(end.direction,ARROW_LENGTH).distanceTo(e.point)<.001,'ballistic tip misses target');
   duel.update(e.contact-e.flight-.001);const A=duel.actors[0],aim=A.equipment.leftGrip.clone().sub(A.equipment.rightGrip).normalize();assert(aim.y>.4,'archer did not raise bow for long shot');
   assert(aim.dot(e.aimDirection!)>.995,'grips point away from launch direction');
   const quiver=A.equipment.prop!.userData.quiver as T.Group;assert(quiver?.visible&&quiver.parent===A.root,'archer has no attached quiver');
   duel.update(e.contact);const arrow=A.equipment.prop!.userData.arrow as T.Group;arrow.updateWorldMatrix(true,false);assert(arrow.localToWorld(new T.Vector3(0,0,ARROW_LENGTH)).distanceTo(e.point)<.015,'rendered ballistic arrow misses');
  }
  console.log(`${model}: attached quiver, raised bow, long-range apex and descending contact verified`);duel.dispose();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
