import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createDuelActor,DuelActor,DuelFighter} from '../src/screens/nativeDuel';
import {createNativeSquad,representativeCount,proficiencyLabel,strikeLaneClear,threatRadius} from '../src/screens/nativeSquad';
import {nativeBattlePlan,representedCount} from '../src/screens/nativeBattlePlan';
import {resolveCombat,makeRng} from '../src/services/combatSystem';
(globalThis as any).ProgressEvent=class{};
async function load(id:string){
 const dir='public/realm/'+id,j=JSON.parse(fs.readFileSync(dir+'/model.gltf','utf8'));
 for(const b of j.buffers)b.uri='data:application/octet-stream;base64,'+fs.readFileSync(dir+'/'+b.uri).toString('base64');
 for(const m of j.materials){delete m.pbrMetallicRoughness.baseColorTexture;delete m.normalTexture;}
 return new GLTFLoader().parseAsync(JSON.stringify(j),'');
}
async function main(){
 const assets={paladin:await load('paladin'),arissa:await load('arissa'),erika:await load('erika')};
 // Guard layering must preserve the captured arm/grip, and restoring a normal
 // pose must not retain any pelvis correction (including reverse scrubbing).
 for(const model of ['paladin','arissa','erika'] as const)for(const weapon of ['hatchet','spear','halberd'] as const){
  const a=createDuelActor(assets[model],{model,weapon}),clip=weapon==='hatchet'?'axeWalk':'twoWalk';
  const names=['mixamorigLeftArm','mixamorigRightArm','mixamorigLeftForeArm','mixamorigRightForeArm','mixamorigLeftHand','mixamorigRightHand'];
  a.evaluate({clip:a.idle,time:.2});const native=names.map(n=>a.root.getObjectByName(n)!.quaternion.clone()),hand=a.root.getObjectByName('mixamorigRightHand')!.getWorldPosition(new T.Vector3());
  for(const direction of [-1.2,1.2,0]){a.evaluate({clip:a.idle,time:.2},undefined,1,undefined,{clip,time:.3,weight:1,direction});names.forEach((n,i)=>assert(a.root.getObjectByName(n)!.quaternion.angleTo(native[i])<.001,`${model}/${weapon}: guarded movement changed captured arm ${n}`));}
  a.evaluate({clip:a.idle,time:.2});assert(a.root.getObjectByName('mixamorigRightHand')!.getWorldPosition(new T.Vector3()).distanceTo(hand)<.001,`${model}/${weapon}: movement correction leaked into normal pose`);a.dispose();
 }
 assert.equal(representativeCount(60),3);assert.equal(representativeCount(0),0);assert.equal(proficiencyLabel(3),'근위 ★★★');
 const knight:DuelFighter={model:'paladin',weapon:'sword'};
 const configs:[number,number,number,DuelFighter,DuelFighter,number,boolean?][]=[];
 for(const [n,m,w] of [[2,1,0],[1,2,0],[3,3,0],[3,1,0],[3,1,1],[1,3,0],[1,3,1],[3,2,1],[2,3,1]] as const)configs.push([n,m,w,knight,knight,6]);
 for(const weapon of ['axe','hatchet','spear','halberd','flail','bow'] as const)configs.push([3,3,0,{model:'paladin',weapon},knight,6]);
 configs.push([3,3,1,{model:'erika',weapon:'bow'},knight,18],[3,1,0,{model:'arissa',weapon:'hatchet'},knight,6],[1,3,1,knight,{model:'erika',weapon:'axe'},6]);
 configs.push([12,12,0,knight,knight,6,true],[5,3,0,knight,{model:'erika',weapon:'axe'},6,true],[3,1,0,knight,knight,6,true],[1,3,0,knight,knight,6,true]);
 if(process.argv.includes('--tactics')){configs.length=0;for(const seed of [0,2,7,19,34])for(const [n,m] of [[2,1],[1,2],[3,3]])configs.push([n,m,seed,knight,knight,6,true]);}
 for(const [n,m,winner,a,b,range,mixed] of configs.filter(c=>(!process.argv.includes('--mixed')||c[6])&&(!process.argv.includes('--bow')||c[3].weapon==='bow'))){
  const teams:[DuelActor[],DuelActor[]]=[Array.from({length:representativeCount(n)},(_,i)=>createDuelActor(assets[a.model],{...a,weapon:mixed?([a.weapon,'spear','halberd'] as const)[i]:a.weapon})),Array.from({length:representativeCount(m)},(_,i)=>createDuelActor(assets[b.model],{...b,weapon:mixed?([b.weapon,'hatchet','axe'] as const)[i]:b.weapon}))];
  const result=resolveCombat({units:n},{units:m},makeRng(41+winner)),record=nativeBattlePlan(result);const plan=createNativeSquad(teams,record,range);let previous:T.Vector3[]|undefined,min=Infinity,maxStep=0,encirclementGap=Math.PI*2;
  for(let t=0;t<plan.duration;t+=1/15){
   plan.update(t);const p=plan.actors.map(actor=>actor.visual.position.clone());
   if(previous)p.forEach((q,i)=>{const step=q.distanceTo(previous![i]);maxStep=Math.max(maxStep,step);assert(step<.5,`teleport ${n}v${m} ${a.weapon} at ${t} actor ${i}: ${step}`);});
   for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){const d=p[i].distanceTo(p[j]);min=Math.min(min,d);assert(d>.75,`overlap ${n}v${m} ${a.weapon} at ${t}: ${i},${j} ${d}`);}
   previous=p;
   if((n===3&&m===1||n===1&&m===3)&&plan.state.alive[0]+plan.state.alive[1]===4){const lone=n===1?0:3,angles=p.filter((_,id)=>id!==lone).map(v=>Math.atan2(v.z-p[lone].z,v.x-p[lone].x)).sort((a,b)=>a-b);encirclementGap=Math.min(encirclementGap,Math.max(angles[1]-angles[0],angles[2]-angles[1],angles[0]+Math.PI*2-angles[2]));}
  }
  for(let i=0;i<plan.engagements.length;i++)for(let j=i+1;j<plan.engagements.length;j++){
   const a=plan.engagements[i],b=plan.engagements[j];for(const id of a.ids.filter(id=>b.ids.includes(id))){const x=a.ids.indexOf(id),y=b.ids.indexOf(id);if(a.owns[x]&&b.owns[y])assert(a.release[x]<=b.moveStart[y]||b.release[y]<=a.moveStart[x],'one body assigned conflicting movement/action tracks');}
  }
  if(((n===2&&m===1)||(n===1&&m===2))&&winner===0){
   assert(plan.engagements.some(e=>e.tactic.includes('측면')),'missing numerical-advantage tactic');
   assert(plan.engagements.some((a,i)=>plan.engagements.some((b,j)=>i<j&&a.duel.events[0].outcome==='block'&&a.ids[a.duel.events[0].attacker]!==b.ids[b.duel.events[0].attacker]&&a.ids.some(id=>b.ids.includes(id))&&b.actionStart[b.duel.events[0].attacker]<a.end)),'second attacker waits for the entire previous block/recovery');
   assert(plan.engagements.some(a=>plan.engagements.some(b=>Math.abs(a.yaw-b.yaw)>.5)),'outnumbered soldier never turns between attack lanes');
   assert(plan.engagements.some(e=>e.opening!==undefined),'outnumbered exchange never exploits a committed opponent');
  }
  if(n===3&&m===1&&winner===0)assert(encirclementGap<Math.PI,'three allies never surrounded the opponent');
  for(const stage of plan.engagements){
   if(stage.interception){assert.equal(stage.duel.events[0].outcome,'block','interception invented damage');assert(stage.guarded,'interception lost guard');}
   for(let k=0;k<2;k++)if(stage.guarded&&stage.owns[k]&&stage.actionStart[k]-stage.moveStart[k]>.9){
    const other=1-k,focus=stage.to[other].position,start=stage.from[k].position,end=stage.to[k].position;
    const minDistance=Math.min(threatRadius(plan.actors[stage.ids[other]]),start.distanceTo(focus)-.025,end.distanceTo(focus)-.025);
    for(let time=stage.moveStart[k]+.42;time<stage.actionStart[k]-.22;time+=.13){
     plan.update(time);const actor=plan.actors[stage.ids[k]],toward=focus.clone().sub(actor.visual.position).setY(0).normalize(),forward=new T.Vector3(0,0,1).applyAxisAngle(new T.Vector3(0,1,0),actor.visual.rotation.y);
     assert(forward.dot(toward)>.9,`unguarded bypass: ${n}v${m}, actor ${stage.ids[k]}, time ${time}`);
     assert(actor.visual.position.distanceTo(focus)>=minDistance,`bypass cut through weapon reach: ${n}v${m}, actor ${stage.ids[k]}, time ${time}`);
    }
   }
   for(let k=0;k<2;k++){
    if(!stage.owns[k])continue;
    const actor=plan.actors[stage.ids[k]],handoff=stage.release[k],joints=['mixamorigLeftHand','mixamorigRightHand','mixamorigNeck'];
    plan.update(handoff-.003);const before=joints.map(n=>actor.root.getObjectByName(n)!.getWorldPosition(new T.Vector3()));
    plan.update(handoff+.003);joints.forEach((n,i)=>assert(actor.root.getObjectByName(n)!.getWorldPosition(new T.Vector3()).distanceTo(before[i])<.10,JSON.stringify({weapon:actor.fighter.weapon,joint:n,actor:stage.ids[k],handoff,event:stage.duel.events[0].outcome,role:k===stage.duel.events[0].attacker?'attacker':'defender',gap:actor.root.getObjectByName(n)!.getWorldPosition(new T.Vector3()).distanceTo(before[i])})));
   }
   const event=stage.duel.events[0],time=stage.start+stage.enter+event.contact;
   plan.update(time);const A=plan.actors[stage.ids[event.attacker]],D=plan.actors[stage.ids[1-event.attacker]];
   const target=D.visual.localToWorld((stage.duel.receiver?D.backTarget:event.outcome==='block'?D.guard:D.bodyTarget).clone());
   if(stage.opening!==undefined){
    const busy=plan.engagements.find(e=>e!==stage&&e.ids[1-e.duel.events[0].attacker]===stage.ids[1-event.attacker]&&e.ids[e.duel.events[0].attacker]!==stage.ids[event.attacker]&&e.contact<stage.contact&&stage.contact-e.contact<.14);
    assert(busy,'flank must land while another ally is still striking the same defender');
    const overlap=Math.min(busy.contact+.14,stage.contact+.14)-Math.max(busy.start+busy.duel.events[0].start+.18,stage.start+event.start+.18);
    assert(overlap>.45,`allied attack clips overlap for only ${overlap}s`);
    // Inspect the rendered arms, not merely overlapping movement reservations.
    for(const attacker of [A,plan.actors[busy.ids[busy.duel.events[0].attacker]]]){
     plan.update(time-.02);const joints=['mixamorigRightArm','mixamorigRightForeArm'],attackPose=joints.map(n=>attacker.root.getObjectByName(n)!.getWorldQuaternion(new T.Quaternion()));
     attacker.evaluate({clip:attacker.idle,time:(time-.02+plan.actors.indexOf(attacker)*.39)%attacker.duration(attacker.idle)});
     // Arissa's FBX rotation wrappers animate the parents of these bones.
     assert(joints.some((n,i)=>attacker.root.getObjectByName(n)!.getWorldQuaternion(new T.Quaternion()).angleTo(attackPose[i])>.15),'one ally is only walking/idle during the supposed combined strike');
    }
    plan.update(time);
    const forward=new T.Vector3(0,0,1).applyAxisAngle(new T.Vector3(0,1,0),D.visual.rotation.y);assert(forward.dot(A.visual.position.clone().sub(D.visual.position).normalize())<-.2,'rear attack turned defender towards the attacker');
   }
   for(let id=0;id<plan.actors.length;id++)if(id!==stage.ids[event.attacker]&&plan.sides[id]===plan.sides[stage.ids[event.attacker]])assert(strikeLaneClear(A.visual.position,event.point.clone().applyAxisAngle(new T.Vector3(0,1,0),stage.yaw).add(stage.origin),plan.actors[id].visual.position),'ally occupies strike corridor');
   if(event.outcome==='miss'){assert(A.visual.localToWorld(A.strike.clone()).distanceTo(target)>.45,'zero-loss rear attack hit body');continue;}
   if(A.fighter.weapon==='bow'){
    const arrow=A.equipment.prop!.userData.arrow as T.Group;arrow.updateWorldMatrix(true,false);
    assert(arrow.localToWorld(new T.Vector3(0,0,.935)).distanceTo(target)<.02,JSON.stringify({message:'transformed arrow missed defender',time,ids:stage.ids,gap:arrow.localToWorld(new T.Vector3(0,0,.935)).distanceTo(target),event:event.outcome,origin:stage.origin.toArray(),yaw:stage.yaw}));
   }else assert(A.visual.localToWorld(A.strike.clone()).distanceTo(target)<.48,JSON.stringify({message:'group contact missed',ids:stage.ids,event:event.outcome,clip:event.clip,A:A.fighter,D:D.fighter,gap:A.visual.localToWorld(A.strike.clone()).distanceTo(target)}));
  }
  const final=plan.update(plan.duration);assert.deepEqual(final.counts,record.final);for(const side of [0,1])assert.equal(final.alive[side],record.actors.filter(a=>a.side===side&&representedCount(a,record.final[side])>0).length);
  plan.update(2);const pose=plan.actors.map(a=>a.visual.position.clone());plan.update(plan.duration);plan.update(2);
  plan.actors.forEach((a,i)=>assert(a.visual.position.distanceTo(pose[i])<1e-6,'scrub changed position'));
  if((n===3&&m===1||n===1&&m===3||n===2&&m===1||n===1&&m===2)&&winner===0)assert(plan.engagements.some(e=>e.interception),'nearby bypass was not challenged');
  console.log(`${n}v${m} ${a.model}/${a.weapon} vs ${b.model}/${b.weapon}: ${plan.duration.toFixed(1)}s, spacing ${min.toFixed(2)}, step ${maxStep.toFixed(2)}, interceptions ${plan.engagements.filter(e=>e.interception).length}, openings ${plan.engagements.filter(e=>e.opening!==undefined).length}, rear hits ${plan.engagements.filter(e=>e.opening!==undefined&&e.duel.events[0].outcome!=='miss').length}`);plan.dispose();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
