import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {createNativeWeapon,clipsForWeapon} from '../src/screens/nativeWeaponRig';
import {nativeDeathGround} from '../src/screens/nativeDeathGround';
(globalThis as any).ProgressEvent=class{};
async function main(){for(const model of ['paladin','arissa','erika']){
 const dir=`public/realm/${model}`,json=JSON.parse(fs.readFileSync(`${dir}/model.gltf`,'utf8'));
 for(const b of json.buffers)b.uri='data:application/octet-stream;base64,'+fs.readFileSync(`${dir}/${b.uri}`).toString('base64');
 for(const m of json.materials){delete m.pbrMetallicRoughness.baseColorTexture;delete m.normalTexture;}
 const asset=await new GLTFLoader().parseAsync(JSON.stringify(json),''),root=asset.scene,mixer=new T.AnimationMixer(root),bow=createNativeWeapon(root,'bow',asset.animations),ground=nativeDeathGround(root);
 assert(!root.getObjectByName('Paladin_J_Nordstrom')?.visible,'bow retained sword');
 assert(!root.getObjectByName('Paladin_J_Nordstrom_Helmet')?.visible,'bow retained shield');
 for(const name of clipsForWeapon('bow',model==='paladin')){
  mixer.stopAllAction();const clip=asset.animations.find(c=>c.name===name)!,action=mixer.clipAction(clip).setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();let middle:number[]=[];
  for(const frame of [...Array.from({length:121},(_,i)=>i),60]){
   const t=clip.duration*frame/120;action.paused=false;action.enabled=true;mixer.setTime(t);ground.update(name==='bowDeath');root.updateMatrixWorld(true);
   const elbow=root.getObjectByName('mixamorigLeftForeArm')!,native=elbow.quaternion.clone();bow.update(name,t,clip.duration);bow.prop!.updateMatrixWorld(true);
   assert(native.equals(elbow.quaternion),'bow overwrote native elbow');
   const quiver=bow.prop!.userData.quiver as T.Group;assert(quiver?.parent===root,'bow has no attached quiver');
   if(name==='bowDeath')assert(new T.Box3().setFromObject(quiver,true).min.y>=.01,'quiver penetrates ground during death');
   assert(bow.released||bow.prop!.position.distanceTo(bow.leftGrip)<1e-6,'left palm lost bow');
   const nock=bow.prop!.localToWorld(bow.prop!.userData.nock.clone());
   if(name==='bowAim'||name==='bowDraw'&&t>.58||name==='bowShoot'&&t<5/30)assert(nock.distanceTo(bow.rightGrip)<1e-6,'string detached from drawing hand');
   const arrow=bow.prop!.userData.arrow as T.Group,position=arrow.getWorldPosition(new T.Vector3());
   assert([...position,...bow.prop!.quaternion].every(Number.isFinite));
   if(name==='bowShoot'&&t>.3)assert(position.distanceTo(bow.rightGrip)>2,'released arrow still follows hand');
   if(name==='bowDeath'){const bounds=new T.Box3();bow.prop!.traverseVisible(o=>{if(o instanceof T.Mesh)bounds.expandByObject(o,true);});const min=bounds.min.y;assert(min>=-.015,'fallen bow penetrates ground');if(t>clip.duration*.6)assert(min<.03,'fallen bow floats above ground');}
   const pose=[...position,...bow.prop!.position,...bow.prop!.quaternion];if(frame===60){if(middle.length)pose.forEach((x,i)=>assert(Math.abs(x-middle[i])<1e-6,'bow rewind changed pose'));else middle=pose;}
  }
 }
 console.log(`${model}: 8 bow actions, palm/string contact, arrow release, death grounding and rewind passed`);bow.dispose();ground.dispose();
}}
main().catch(e=>{console.error(e);process.exitCode=1;});
