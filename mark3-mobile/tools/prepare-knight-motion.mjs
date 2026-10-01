// Quaternius CC0 원본을 재생해 관절 변환과 쥔 손을 추출한다. 실행 중 IK로 검 끝을 쫓지 않는다.
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const sources=[['.realm-source/animation/ual1/Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb',1],['.realm-source/animation/ual2.glb',2]];
const canonical=['pelvis','spine_01','spine_02','spine_03','Head','upperarm_r','lowerarm_r','hand_r','upperarm_l','lowerarm_l','hand_l','thigh_r','calf_r','foot_r','thigh_l','calf_l','foot_l'];
const old=['DEF-hips','DEF-spine.001','DEF-spine.002','DEF-spine.003','DEF-head','DEF-upper_arm.R','DEF-forearm.R','DEF-hand.R','DEF-upper_arm.L','DEF-forearm.L','DEF-hand.L','DEF-thigh.R','DEF-shin.R','DEF-foot.R','DEF-thigh.L','DEF-shin.L','DEF-foot.L'];
const result={fps:60,clips:{},rests:{},hands:{}};
for(const [path,version] of sources){
 const bytes=fs.readFileSync(path),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const mixer=new T.AnimationMixer(asset.scene),bones=canonical.map((n,i)=>asset.scene.getObjectByName(version===1?old[i].replaceAll('.',''):n));
 const read=()=>bones.flatMap(b=>[...b.getWorldPosition(new T.Vector3()).toArray(),...b.getWorldQuaternion(new T.Quaternion()).toArray()].map(v=>+v.toFixed(6)));
 const set=(name,t)=>{mixer.stopAllAction();const clip=asset.animations.find(c=>c.name===name),action=mixer.clipAction(clip);action.reset().setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(t);asset.scene.updateMatrixWorld(true);};
 set('A_TPose',0);result.rests[version]=read();
 for(const name of version===1?['Sword_Attack','Hit_Chest','Death01','Sword_Idle','Walk_Loop','Crouch_Idle_Loop']:['Idle_Shield_Loop','Shield_OneShot','Sword_Regular_A','Sword_Block']){
  const clip=asset.animations.find(c=>c.name===name),count=Math.ceil(clip.duration*60)+1,frames=[];
  for(let i=0;i<count;i++){set(name,Math.min(clip.duration,i/60));frames.push(read());}
  result.clips[name]={version,duration:clip.duration,frames};console.log(name,clip.duration,count);
 }
 if(version===2){
  set('Idle_Shield_Loop',0);
  const meshes=[];asset.scene.traverse(o=>{if(o.isSkinnedMesh){meshes.push(o);o.skeleton.update();}});
  for(const side of ['r','l']){
   const hand=asset.scene.getObjectByName('hand_'+side),inverse=new T.Matrix4().copy(hand.matrixWorld).invert();
   const positions=[];
   for(const mesh of meshes){
   const g=mesh.geometry,source=g.getAttribute('position'),idx=g.getIndex();
   const bindInverse=mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(hand)];
   const selected=i=>{const p=new T.Vector3().fromBufferAttribute(source,i).applyMatrix4(mesh.bindMatrix).applyMatrix4(bindInverse);return p.y>-.025&&p.y<.30&&Math.abs(p.x)<.13&&Math.abs(p.z)<.13;};
   for(let i=0;i<idx.count;i+=3){const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];if(!ids.every(selected))continue;
    for(const id of ids){const p=mesh.applyBoneTransform(id,new T.Vector3().fromBufferAttribute(source,id)).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);positions.push(...p.toArray().map(v=>+v.toFixed(6)));}
   }
   }
   const raw=new T.BufferGeometry();raw.setAttribute('position',new T.Float32BufferAttribute(positions,3));const geo=mergeVertices(raw,1e-5);geo.computeVertexNormals();
   const position=Array.from(geo.getAttribute('position').array).map(v=>+v.toFixed(6)),normal=Array.from(geo.getAttribute('normal').array).map(v=>+v.toFixed(4)),index=Array.from(geo.getIndex().array);
   result.hands[side]={position,normal,index};console.log('hand',side,position.length/3);
  }
 }
}
fs.writeFileSync('src/screens/knightMotionData.json',JSON.stringify(result));
