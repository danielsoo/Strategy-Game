import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createDuelActor,DuelActor,DuelFighter} from '../src/screens/nativeDuel';
import {createNativeSquad,representativeCount,proficiencyLabel} from '../src/screens/nativeSquad';
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
 assert.equal(representativeCount(60),3);assert.equal(representativeCount(0),0);assert.equal(proficiencyLabel(3),'근위 ★★★');
 const knight:DuelFighter={model:'paladin',weapon:'sword'};
 const configs:[number,number,number,DuelFighter,DuelFighter,number,boolean?][]=[];
 for(const [n,m,w] of [[2,1,0],[1,2,0],[3,3,0],[3,1,0],[3,1,1],[1,3,0],[1,3,1],[3,2,1],[2,3,1]] as const)configs.push([n,m,w,knight,knight,6]);
 for(const weapon of ['axe','hatchet','spear','halberd','flail','bow'] as const)configs.push([3,3,0,{model:'paladin',weapon},knight,6]);
 configs.push([3,3,1,{model:'erika',weapon:'bow'},knight,18],[3,1,0,{model:'arissa',weapon:'hatchet'},knight,6],[1,3,1,knight,{model:'erika',weapon:'axe'},6]);
 configs.push([12,12,0,knight,knight,6,true],[5,3,0,knight,{model:'erika',weapon:'axe'},6,true]);
 if(process.argv.includes('--tactics')){configs.length=0;for(const seed of [0,2,7,19,34])for(const [n,m] of [[2,1],[1,2],[3,3]])configs.push([n,m,seed,knight,knight,6,true]);}
 for(const [n,m,winner,a,b,range,mixed] of configs.filter(c=>(!process.argv.includes('--mixed')||c[6])&&(!process.argv.includes('--bow')||c[3].weapon==='bow'))){
  const teams:[DuelActor[],DuelActor[]]=[Array.from({length:representativeCount(n)},(_,i)=>createDuelActor(assets[a.model],{...a,weapon:mixed?([a.weapon,'spear','halberd'] as const)[i]:a.weapon})),Array.from({length:representativeCount(m)},(_,i)=>createDuelActor(assets[b.model],{...b,weapon:mixed?([b.weapon,'hatchet','axe'] as const)[i]:b.weapon}))];
  const result=resolveCombat({units:n},{units:m},makeRng(41+winner)),record=nativeBattlePlan(result);const plan=createNativeSquad(teams,record,range);let previous:T.Vector3[]|undefined,min=Infinity,maxStep=0;
  for(let t=0;t<plan.duration;t+=1/15){
   plan.update(t);const p=plan.actors.map(actor=>actor.visual.position.clone());
   if(previous)p.forEach((q,i)=>{const step=q.distanceTo(previous![i]);maxStep=Math.max(maxStep,step);assert(step<.5,`teleport ${n}v${m} ${a.weapon} at ${t} actor ${i}: ${step}`);});
   for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){const d=p[i].distanceTo(p[j]);min=Math.min(min,d);assert(d>.75,`overlap ${n}v${m} ${a.weapon} at ${t}: ${i},${j} ${d}`);}
   previous=p;
  }
  for(let i=0;i<plan.engagements.length;i++)for(let j=i+1;j<plan.engagements.length;j++){
   const a=plan.engagements[i],b=plan.engagements[j];for(const id of a.ids.filter(id=>b.ids.includes(id))){const x=a.ids.indexOf(id),y=b.ids.indexOf(id);assert(a.release[x]<=b.moveStart[y]||b.release[y]<=a.moveStart[x],'one body assigned conflicting movement/action tracks');}
  }
  if(((n===2&&m===1)||(n===1&&m===2))&&winner===0){
   assert(plan.engagements.some(e=>e.tactic.includes('측면')),'missing numerical-advantage tactic');
   assert(plan.engagements.some((a,i)=>plan.engagements.some((b,j)=>i<j&&a.duel.events[0].outcome==='block'&&a.ids[a.duel.events[0].attacker]!==b.ids[b.duel.events[0].attacker]&&a.ids.some(id=>b.ids.includes(id))&&b.actionStart[b.duel.events[0].attacker]<a.end)),'second attacker waits for the entire previous block/recovery');
   assert(plan.engagements.some(a=>plan.engagements.some(b=>Math.abs(a.yaw-b.yaw)>.5)),'outnumbered soldier never turns between attack lanes');
  }
  for(const stage of plan.engagements){
   for(let k=0;k<2;k++){
    const actor=plan.actors[stage.ids[k]],handoff=stage.release[k],joints=['mixamorigLeftHand','mixamorigRightHand','mixamorigNeck'];
    plan.update(handoff-.003);const before=joints.map(n=>actor.root.getObjectByName(n)!.getWorldPosition(new T.Vector3()));
    plan.update(handoff+.003);joints.forEach((n,i)=>assert(actor.root.getObjectByName(n)!.getWorldPosition(new T.Vector3()).distanceTo(before[i])<.10,JSON.stringify({weapon:actor.fighter.weapon,joint:n,actor:stage.ids[k],handoff,event:stage.duel.events[0].outcome,role:k===stage.duel.events[0].attacker?'attacker':'defender',gap:actor.root.getObjectByName(n)!.getWorldPosition(new T.Vector3()).distanceTo(before[i])})));
   }
   const event=stage.duel.events[0],time=stage.start+stage.enter+event.contact;
   plan.update(time);const A=plan.actors[stage.ids[event.attacker]],D=plan.actors[stage.ids[1-event.attacker]];
   const target=D.visual.localToWorld((event.outcome==='block'?D.guard:D.bodyTarget).clone());
   if(A.fighter.weapon==='bow'){
    const arrow=A.equipment.prop!.userData.arrow as T.Group;arrow.updateWorldMatrix(true,false);
    assert(arrow.localToWorld(new T.Vector3(0,0,.935)).distanceTo(target)<.02,JSON.stringify({message:'transformed arrow missed defender',time,ids:stage.ids,gap:arrow.localToWorld(new T.Vector3(0,0,.935)).distanceTo(target),event:event.outcome,origin:stage.origin.toArray(),yaw:stage.yaw}));
   }else assert(A.visual.localToWorld(A.strike.clone()).distanceTo(target)<.48,JSON.stringify({message:'group contact missed',ids:stage.ids,event:event.outcome,clip:event.clip,A:A.fighter,D:D.fighter,gap:A.visual.localToWorld(A.strike.clone()).distanceTo(target)}));
  }
  const final=plan.update(plan.duration);assert.deepEqual(final.counts,record.final);for(const side of [0,1])assert.equal(final.alive[side],record.actors.filter(a=>a.side===side&&representedCount(a,record.final[side])>0).length);
  plan.update(2);const pose=plan.actors.map(a=>a.visual.position.clone());plan.update(plan.duration);plan.update(2);
  plan.actors.forEach((a,i)=>assert(a.visual.position.distanceTo(pose[i])<1e-6,'scrub changed position'));
  console.log(`${n}v${m} ${a.model}/${a.weapon} vs ${b.model}/${b.weapon}: ${plan.duration.toFixed(1)}s, spacing ${min.toFixed(2)}, step ${maxStep.toFixed(2)}`);plan.dispose();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
