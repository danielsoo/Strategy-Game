import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {createNativeWeapon,WEAPON_CLIPS} from '../src/screens/nativeWeaponRig';
import {WEAPONS} from '../src/screens/battleWeapons';
(globalThis as any).ProgressEvent=class {};
async function main(){
 for(const id of ['paladin','arissa','erika']){
  const dir=`public/realm/${id}`,json=JSON.parse(fs.readFileSync(`${dir}/model.gltf`,'utf8'));
  for(const b of json.buffers)b.uri='data:application/octet-stream;base64,'+fs.readFileSync(`${dir}/${b.uri}`).toString('base64');
  for(const m of json.materials){delete m.pbrMetallicRoughness.baseColorTexture;delete m.normalTexture;}
  const asset=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
  for(const kind of ['hatchet','axe','spear','halberd','flail'] as const){
   const root=clone(asset.scene),equipment=createNativeWeapon(root,kind),mixer=new T.AnimationMixer(root);let min=Infinity;
   for(const name of WEAPON_CLIPS[kind]){
    mixer.stopAllAction();const clip=asset.animations.find(c=>c.name===name)!;
    assert(clip,`${id}/${kind}/${name} missing`);
    const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
    let middle:number[]=[];
    const frames=[...Array.from({length:91},(_,i)=>i),45];
    for(const i of frames){
     const time=clip.duration*i/90;action.paused=false;action.enabled=true;mixer.setTime(time);root.updateMatrixWorld(true);
     const elbow=root.getObjectByName('mixamorigRightForeArm')!,before=elbow.quaternion.clone();
     equipment.update(name,time,clip.duration);const prop=equipment.prop!;prop.updateMatrixWorld(true);
     assert(before.equals(elbow.quaternion),'attachment must not override native elbow');
     assert(prop.position.distanceTo(equipment.rightGrip)<1e-7,'right hand lost grip');
     if(WEAPONS[kind].twoHanded){
      const local=prop.worldToLocal(equipment.leftGrip.clone());
      assert(Math.hypot(local.x,local.y)<1e-6,'support hand left shaft');
      assert(local.z>-.66&&local.z<1.1,'support hand outside handle');
     }
     const box=new T.Box3().setFromObject(prop);min=Math.min(min,box.min.y);
     assert([...box.min,...box.max].every(Number.isFinite));
     const pose=[...prop.position,...prop.quaternion];
     if(i===45){if(middle.length)pose.forEach((n,k)=>assert(Math.abs(n-middle[k])<1e-6,'rewind changed weapon pose'));else middle=pose;}
    }
   }
   console.log(`${id}/${kind}: grip, native elbow and rewind verified; min weapon height ${min.toFixed(3)}m`);
   assert(min>-.025,`${id}/${kind} penetrates flat ground`);
   equipment.dispose();
  }
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
