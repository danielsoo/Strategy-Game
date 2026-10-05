import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {createNativeWeapon,clipsForWeapon,nativeWeaponClip} from '../src/screens/nativeWeaponRig';
import {nativeDeathGround} from '../src/screens/nativeDeathGround';
import {WEAPONS} from '../src/screens/battleWeapons';
(globalThis as any).ProgressEvent=class {};
async function main(){
 for(const id of ['paladin','arissa','erika']){
  const dir=`public/realm/${id}`,json=JSON.parse(fs.readFileSync(`${dir}/model.gltf`,'utf8'));
  for(const b of json.buffers)b.uri='data:application/octet-stream;base64,'+fs.readFileSync(`${dir}/${b.uri}`).toString('base64');
  for(const m of json.materials){delete m.pbrMetallicRoughness.baseColorTexture;delete m.normalTexture;}
  const asset=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
  for(const kind of ['hatchet','axe','spear','halberd','flail'] as const){
   const root=clone(asset.scene),equipment=createNativeWeapon(root,kind,asset.animations),mixer=new T.AnimationMixer(root),ground=nativeDeathGround(root);let min=Infinity;
   for(const name of clipsForWeapon(kind,id==='paladin')){
    mixer.stopAllAction();const clip=nativeWeaponClip(asset.animations,name,id==='paladin',kind);
    assert(clip,`${id}/${kind}/${name} missing`);
    const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
    let middle:number[]=[];const cuttingSamples:{head:T.Vector3;axis:T.Vector3;edge:T.Vector3}[]=[];
    const frames=[...Array.from({length:91},(_,i)=>i),45];
    for(const i of frames){
     const time=clip.duration*i/90;action.paused=false;action.enabled=true;mixer.setTime(time);ground.update(/death/i.test(name));root.updateMatrixWorld(true);
     const elbow=root.getObjectByName('mixamorigRightForeArm')!,before=elbow.quaternion.clone();
     equipment.update(name,time,clip.duration);const prop=equipment.prop!;prop.updateMatrixWorld(true);
     assert(before.equals(elbow.quaternion),'attachment must not override native elbow');
     assert(equipment.released||prop.position.distanceTo(equipment.rightGrip)<1e-7,'right hand lost grip');
     if(WEAPONS[kind].twoHanded&&!equipment.released){
      const local=prop.worldToLocal(equipment.leftGrip.clone());
      assert(Math.hypot(local.x,local.y)<1e-6,'support hand left shaft');
      assert(local.z>-.66&&local.z<1.1,'support hand outside handle');
     }
     const box=new T.Box3().setFromObject(prop,true);min=Math.min(min,box.min.y);
     if(i<=90&&cuttingSamples.length<=90){const axis=new T.Vector3(0,0,1).applyQuaternion(prop.quaternion),edge=new T.Vector3(1,0,0).applyQuaternion(prop.quaternion);const length=kind==='hatchet'?.43:kind==='axe'?.66:1.02;cuttingSamples.push({axis,edge,head:equipment.rightGrip.clone().addScaledVector(axis,length)});}
     assert([...box.min,...box.max].every(Number.isFinite));
     const pose=[...prop.position,...prop.quaternion];
     if(i===45){if(middle.length)pose.forEach((n,k)=>assert(Math.abs(n-middle[k])<1e-6,'rewind changed weapon pose'));else middle=pose;}
    }
    if(['axeChop','axeSweep','twoChop','twoSweep'].includes(name)&&kind!=='flail'){
     let speed=-1,alignment=0;for(let i=23;i<58;i++){const f=cuttingSamples[i],v=cuttingSamples[i+1].head.clone().sub(cuttingSamples[i-1].head);v.addScaledVector(f.axis,-v.dot(f.axis));if(v.lengthSq()>speed){speed=v.lengthSq();alignment=f.edge.dot(v.normalize());}}
     assert(alignment>.9,`${id}/${kind}/${name}: blade face leads instead of cutting edge (${alignment})`);
    }
    if(name==='twoJump'&&(kind==='axe'||kind==='halberd')){
     const stroke=[];for(let i=40;i<52;i++){const f=cuttingSamples[i],v=cuttingSamples[i+1].head.clone().sub(cuttingSamples[i-1].head);const down=-v.y;v.addScaledVector(f.axis,-v.dot(f.axis));stroke.push({down,alignment:f.edge.dot(v.normalize())});}
     const peak=Math.max(...stroke.map(s=>s.down)),active=stroke.filter(s=>s.down>peak*.5);
     assert(active.length>=3,'jump stroke sampling missed active descent');
     for(const s of active)assert(s.alignment>.9,`${id}/${kind}: jump edge misaligned during descent (${s.alignment})`);
     console.log(`${id}/${kind}: ${active.length} jump descent frames, minimum edge alignment ${Math.min(...active.map(s=>s.alignment)).toFixed(3)}`);
    }
   }
   console.log(`${id}/${kind}: grip, native elbow and rewind verified; min weapon height ${min.toFixed(3)}m`);
   assert(min>-.025,`${id}/${kind} penetrates flat ground`);
   equipment.dispose();ground.dispose();
  }
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
