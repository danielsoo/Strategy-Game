// Run after downloading the user's Mixamo Pro Sword And Shield Pack (FBX 7.4).
// Source FBX files stay in ignored .realm-source; export only this game's joints.
import fs from 'node:fs';
import * as T from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
const directory=process.argv[2]??'.realm-source/mixamo74';
const names=['Hips','Spine','Spine1','Spine2','Head','RightArm','RightForeArm','RightHand','LeftArm','LeftForeArm','LeftHand','RightUpLeg','RightLeg','RightFoot','LeftUpLeg','LeftLeg','LeftFoot'];
const selected={idle:'sword and shield idle (4)',slash:'sword and shield slash',combo:'sword and shield slash (2)',cross:'sword and shield slash (3)',power:'sword and shield slash (4)',down:'sword and shield slash (5)',block:'sword and shield block',guard:'sword and shield block idle',release:'sword and shield block (2)',impact:'sword and shield impact',walk:'sword and shield walk'};
function load(file){
 const buffer=fs.readFileSync(file),version=buffer.readUInt32LE(23);let end=27;
 // Mixamo's extra footer padding confuses Three r166's end-of-content heuristic.
 // Keep every declared FBX node byte-for-byte, normalize only the unused footer.
 for(;;){const next=version>=7500?Number(buffer.readBigUInt64LE(end)):buffer.readUInt32LE(end);if(!next)break;if(next<=end||next>buffer.length)throw Error('Invalid FBX node boundary');end=next;}
 const b=Buffer.concat([buffer.subarray(0,end),Buffer.alloc(176)]);
 return new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
}
const result={fps:30,source:'Adobe Mixamo / Pro Sword And Shield Pack',rest:[],clips:{}};
for(const [key,file] of Object.entries(selected)){
 const scene=load(`${directory}/${file}.fbx`),clip=scene.animations[0],bones=names.map(n=>scene.getObjectByName('mixamorig'+n));
 if(bones.some(b=>!b))throw Error('Missing humanoid joint');scene.updateMatrixWorld(true);
 const read=()=>bones.flatMap(b=>[...b.getWorldPosition(new T.Vector3()).multiplyScalar(.01).toArray(),...b.getWorldQuaternion(new T.Quaternion()).toArray()].map(v=>+v.toFixed(6)));
 const rest=read();if(!result.rest.length)result.rest=rest;
 const mixer=new T.AnimationMixer(scene),action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
 const frames=[];for(let i=0;i<=Math.ceil(clip.duration*result.fps);i++){mixer.setTime(Math.min(clip.duration,i/result.fps));scene.updateMatrixWorld(true);frames.push(read());}
 result.clips[key]={file,duration:clip.duration,frames};console.log(key,clip.duration,frames.length);
}
fs.writeFileSync('src/screens/mixamoMotionData.json',JSON.stringify(result));
