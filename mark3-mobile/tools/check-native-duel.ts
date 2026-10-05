import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createDuelActor,createNativeDuel,duelEvents,DuelFighter,DuelSide} from '../src/screens/nativeDuel';
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
   duel.update(e.contact);const attackPoint=A.visual.localToWorld(A.strike.clone()),defensePoint=D.visual.localToWorld(D.guard.clone());
   if(A.fighter.weapon!=='bow')assert(attackPoint.distanceTo(defensePoint)<.48,`${a.model}/${a.weapon} vs ${b.model}: contact missed (${attackPoint.distanceTo(defensePoint)})`);
   else{const arrow=A.equipment.prop!.userData.arrow as T.Group;arrow.updateWorldMatrix(true,false);const tip=arrow.localToWorld(new T.Vector3(0,0,.935));assert(tip.distanceTo(e.point)<.015,'arrow did not reach resolved contact');duel.update(e.contact+.2);assert(!arrow.visible,'arrow continued through opponent');}
   // Sampling both sides of every contact catches position discontinuities.
   duel.update(e.contact-1/60);const before=duel.actors.map(x=>x.visual.position.clone());duel.update(e.contact+1/60);duel.actors.forEach((x,i)=>assert(x.visual.position.distanceTo(before[i])<.12,'contact teleported a fighter'));
  }
  let previous:T.Vector3[]|undefined;
  for(let t=0;t<duel.duration;t+=1/24){duel.update(t);const positions=duel.actors.map(A=>A.visual.position.clone());assert(positions[0].distanceTo(positions[1])>1.1,'fighters overlap');if(previous)positions.forEach((p,i)=>assert(p.distanceTo(previous![i])<.25,'fighter root teleported'));previous=positions;}
  const end=duel.update(duel.duration);assert.equal(end.winner,winner);assert.equal(end.health[1-winner],0);assert(end.health[winner]>0);
  const t=duel.events[0].contact;duel.update(t);const first=duel.actors.map(A=>A.visual.localToWorld(A.strike.clone()));duel.update(duel.duration);duel.update(t);duel.actors.forEach((A,i)=>assert(A.visual.localToWorld(A.strike.clone()).distanceTo(first[i])<1e-5,'rewind changes resolved fight'));
  console.log(`${a.model}/${a.weapon} vs ${b.model}/${b.weapon}: contact, arrow, spacing, replay and winner ${winner} verified`);duel.dispose();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
