import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
globalThis.ProgressEvent=class {};
const approved=['idle','slash','cross','block','guard','release','impact','walk'];
for(const id of ['paladin','arissa','erika']){
 const dir=`public/realm/${id}`,json=JSON.parse(fs.readFileSync(`${dir}/model.gltf`));
 for(const image of json.images)assert(fs.statSync(`${dir}/${image.uri}`).size>1000,'missing texture');
 for(const buffer of json.buffers)buffer.uri='data:application/octet-stream;base64,'+fs.readFileSync(`${dir}/${buffer.uri}`).toString('base64');
 // Verify animation/skinning in Node without requiring a browser image decoder.
 for(const m of json.materials){delete m.pbrMetallicRoughness.baseColorTexture;delete m.normalTexture;}
 const asset=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
 assert.deepEqual(asset.animations.map(c=>c.name),approved);
 const meshes=[];asset.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
 assert(meshes.length>=3);
 const mixer=new T.AnimationMixer(asset.scene);
 for(const clip of asset.animations){
  mixer.stopAllAction();const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
  for(const track of clip.tracks)assert(asset.scene.getObjectByName(T.PropertyBinding.parseTrackName(track.name).nodeName),`unbound ${track.name}`);
  for(const time of [0,clip.duration*.25,clip.duration*.5,clip.duration,clip.duration*.5]){
   action.paused=false;action.enabled=true;mixer.setTime(time);asset.scene.updateMatrixWorld(true);
   const box=new T.Box3();
   for(const mesh of meshes){mesh.skeleton.update();mesh.computeBoundingBox();box.union(mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld));}
   assert([...box.min,...box.max].every(Number.isFinite));
   assert(box.max.y>1&&box.max.y<3,`${id}/${clip.name}: invalid scale`);
   assert(box.min.y>-.4,`${id}/${clip.name}: unexpected root drift`);
  }
 }
 console.log(`${id}: ${meshes.length} native skinned meshes, ${approved.length} bound clips, textures and reverse scrubbing verified`);
}

