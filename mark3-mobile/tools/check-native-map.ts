import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {armyFighter,formationFighter} from '../src/screens/armyAppearance';
import {buildNativeFormation,FORMATION_FRAMES} from '../src/screens/nativeFormationModel';
import {createDuelActor} from '../src/screens/nativeDuel';
import type {FighterKind} from '../src/screens/battleReplay';
(globalThis as any).ProgressEvent=class{};
async function load(id:string){
 const dir='public/realm/'+id,j=JSON.parse(fs.readFileSync(dir+'/model.gltf','utf8'));
 for(const b of j.buffers)b.uri='data:application/octet-stream;base64,'+fs.readFileSync(dir+'/'+b.uri).toString('base64');
 for(const m of j.materials){delete m.pbrMetallicRoughness.baseColorTexture;delete m.normalTexture;}
 return new GLTFLoader().parseAsync(JSON.stringify(j),'');
}
async function main(){
 let total=0,variants=0;const seen=new Set<string>();
 for(const kind of ['knight','mercenary','bandit'] as FighterKind[]){
  const asset=await load(armyFighter(kind).model);
  for(let slot=0;slot<3;slot++){
   const fighter=armyFighter(kind,slot);assert.deepEqual(fighter,formationFighter(armyFighter(kind),slot),'map and battle equipment differ');
   const key=`${fighter.model}/${fighter.weapon}`;if(seen.has(key))continue;seen.add(key);
   const t=performance.now(),baked=buildNativeFormation(asset,fighter),reference=createDuelActor(asset,fighter);
   const count=baked.geometry.attributes.position.count,data=baked.positionTexture.image.data;
   assert(baked.positionTexture.image.height<=4096,'atlas exceeds baseline texture size');
   assert(baked.geometry.groups.every(g=>(g.materialIndex??0)<baked.materials.length),'missing material');
   assert(!baked.geometry.getAttribute('skinIndex'),'baked vertices would be skinned twice');
   for(const mode of [0,1])for(const frame of [0,4,8,15]){
    const walk=fighter.weapon==='sword'?'walk':fighter.weapon==='hatchet'?'axeWalk':'twoWalk';
    reference.evaluate({clip:reference.idle,time:mode?reference.duration(reference.idle)*.25:frame/FORMATION_FRAMES*reference.duration(reference.idle)},undefined,1,undefined,mode?{clip:walk,time:frame/FORMATION_FRAMES*reference.duration(walk),weight:1,direction:0}:undefined);
    let index=0,maxError=0;
    reference.visual.traverseVisible(o=>{if(!(o instanceof T.Mesh))return;if(o instanceof T.SkinnedMesh)o.skeleton.update();
     for(let corner=0;corner<(o.geometry.index?.count??o.geometry.attributes.position.count);corner++){
      const i=o.geometry.index?.getX(corner)??corner,vertex=baked.geometry.index!.getX(index++);
      const v=o.getVertexPosition(i,new T.Vector3()).applyMatrix4(o.matrixWorld),at=((mode*FORMATION_FRAMES+frame)*count+vertex)*4;
      const q=new T.Vector3(...[0,1,2].map(axis=>T.DataUtils.fromHalfFloat(data[at+axis])));
      assert(q.toArray().every(Number.isFinite),'invalid GPU vertex');maxError=Math.max(maxError,v.distanceTo(q));
     }
    });
    assert.equal(index,baked.geometry.index!.count);assert(maxError<.003,`${key}: battle and map pose differ by ${maxError}`);
   }
   const bytes=baked.positionTexture.image.data.byteLength+baked.normalTexture.image.data.byteLength;total+=bytes;variants++;
   console.log(`${key}: ${count} vertices, ${(bytes/1048576).toFixed(1)} MB shared atlas, ${((performance.now()-t)/1000).toFixed(1)}s bake+verify`);
   baked.dispose();reference.dispose();
  }
 }
 console.log(`${variants} shared model/weapon variants: original battle poses and materials PASS; ${(total/1048576).toFixed(1)} MB for all factions`);
}
main();
