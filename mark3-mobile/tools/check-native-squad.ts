import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createDuelActor,DuelActor,DuelFighter,DuelSide} from '../src/screens/nativeDuel';
import {createNativeSquad,representativeCount,proficiencyLabel} from '../src/screens/nativeSquad';
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
 const configs:[number,number,DuelSide,DuelFighter,DuelFighter,number][]=[];
 for(const [n,m,w] of [[3,3,0],[3,1,0],[3,1,1],[1,3,0],[1,3,1],[3,2,1],[2,3,1]] as const)configs.push([n,m,w,knight,knight,6]);
 for(const weapon of ['axe','hatchet','spear','halberd','flail','bow'] as const)configs.push([3,3,0,{model:'paladin',weapon},knight,6]);
 configs.push([3,3,1,{model:'erika',weapon:'bow'},knight,18],[3,1,0,{model:'arissa',weapon:'hatchet'},knight,6],[1,3,1,knight,{model:'erika',weapon:'axe'},6]);
 for(const [n,m,winner,a,b,range] of configs){
  const teams:[DuelActor[],DuelActor[]]=[Array.from({length:n},()=>createDuelActor(assets[a.model],a)),Array.from({length:m},()=>createDuelActor(assets[b.model],b))];
  const plan=createNativeSquad(teams,winner,range);let previous:T.Vector3[]|undefined,min=Infinity,maxStep=0;
  for(let t=0;t<plan.duration;t+=1/15){
   plan.update(t);const p=plan.actors.map(actor=>actor.visual.position.clone());
   if(previous)p.forEach((q,i)=>{const step=q.distanceTo(previous![i]);maxStep=Math.max(maxStep,step);assert(step<.5,`teleport ${n}v${m} ${a.weapon} at ${t} actor ${i}: ${step}`);});
   for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){const d=p[i].distanceTo(p[j]);min=Math.min(min,d);assert(d>.75,`overlap ${n}v${m} ${a.weapon} at ${t}: ${i},${j} ${d}`);}
   previous=p;
  }
  for(let i=0;i<plan.engagements.length;i++)for(let j=i+1;j<plan.engagements.length;j++){
   const a=plan.engagements[i],b=plan.engagements[j];if(a.ids.some(id=>b.ids.includes(id)))assert(a.end<=b.start||b.end<=a.start,'one fighter engaged twice');
  }
  for(const stage of plan.engagements){
   const event=stage.duel.events[0],time=stage.start+stage.enter+event.contact;
   plan.update(time);const A=plan.actors[stage.ids[event.attacker]],D=plan.actors[stage.ids[1-event.attacker]];
   const target=D.visual.localToWorld((event.outcome==='block'?D.guard:D.bodyTarget).clone());
   if(A.fighter.weapon==='bow'){
    const arrow=A.equipment.prop!.userData.arrow as T.Group;arrow.updateWorldMatrix(true,false);
    assert(arrow.localToWorld(new T.Vector3(0,0,.935)).distanceTo(target)<.02,'transformed arrow missed defender');
   }else assert(A.visual.localToWorld(A.strike.clone()).distanceTo(target)<.48,'group transform broke contact');
  }
  const final=plan.update(plan.duration);assert.equal(final.alive[1-winner],0);assert.equal(final.alive[winner],winner===0?n:m);
  plan.update(2);const pose=plan.actors.map(a=>a.visual.position.clone());plan.update(plan.duration);plan.update(2);
  plan.actors.forEach((a,i)=>assert(a.visual.position.distanceTo(pose[i])<1e-6,'scrub changed position'));
  console.log(`${n}v${m} ${a.model}/${a.weapon} vs ${b.model}/${b.weapon}: ${plan.duration.toFixed(1)}s, spacing ${min.toFixed(2)}, step ${maxStep.toFixed(2)}`);plan.dispose();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
