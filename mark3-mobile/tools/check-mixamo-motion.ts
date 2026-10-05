import assert from 'node:assert/strict';
import * as T from 'three';
import {MOCAP_CLIPS,MocapClip,mocapDuration,sampleMocap} from '../src/screens/mixamoMotion';
import {knightTransforms} from '../src/screens/authoredKnightMotion';
import source from '../src/screens/mixamoMotionData.json';
const segments=[[1,2],[2,3],[4,5],[5,6],[9,10],[11,12]];
for(const clip of Object.keys(MOCAP_CLIPS) as MocapClip[]){
 let previous:ReturnType<typeof knightTransforms>|undefined,maxStep=0,maxWristBend=0;
 const shoulder=new T.Box3(),hip=new T.Box3();let lengths:number[]|undefined;
 for(let time=0;time<=mocapDuration(clip);time+=1/60){
  const pose=sampleMocap(clip,time),f=knightTransforms(pose);
  assert(!pose.weaponPose&&!pose.stance,'capture must not be overridden by procedural weapon/foot targets');
  for(const b of f.bones){assert(b.position.toArray().every(Number.isFinite));assert(Math.abs(b.quaternion.length()-1)<.0001);}
  const size=segments.map(([a,b])=>f.bones[a].position.distanceTo(f.bones[b].position));
  if(lengths)size.forEach((x,i)=>assert(Math.abs(x-lengths![i])<1e-5,'limbs must not stretch'));else lengths=size;
  assert(Math.min(f.bones[14].position.y,f.bones[15].position.y)>=.079,'feet sink below the ground');
  shoulder.expandByPoint(f.bones[1].position);hip.expandByPoint(f.bones[8].position);
  for(const [i,j,hand] of [[2,3,0],[5,6,1]]){const axis=new T.Vector3(0,1,0).applyQuaternion(f.hands[hand].quaternion),forearm=f.bones[j].position.clone().sub(f.bones[i].position);maxWristBend=Math.max(maxWristBend,axis.angleTo(forearm));}
  if(previous)for(const i of [1,2,3,4,5,6,8,14,15])maxStep=Math.max(maxStep,f.bones[i].position.distanceTo(previous.bones[i].position));previous=f;
 }
 const shoulderTravel=shoulder.getSize(new T.Vector3()).length(),hipTravel=hip.getSize(new T.Vector3()).length();
 console.log(clip,{maxStep,maxWristBend,shoulderTravel,hipTravel});
 // Fast source cuts exceed a generic locomotion speed limit; compare against
 // their recorded world-space travel instead of silently slowing every attack.
 const frames=source.clips[clip].frames;let sourceStep=0;
 for(let i=1;i<frames.length;i++)for(const j of [0,5,6,7,8,9,10,13,16]){const a=frames[i-1],b=frames[i];sourceStep=Math.max(sourceStep,Math.hypot(b[j*7]-a[j*7],b[j*7+1]-a[j*7+1],b[j*7+2]-a[j*7+2])*.88/2);}
 assert(maxStep<sourceStep+.025,'retarget introduced movement beyond the captured joint travel');
 assert(maxWristBend<.601,'armored wrist exceeds its permitted bend');
 if(['slash','combo','cross','power','down'].includes(clip)){assert(shoulderTravel>.08);assert(hipTravel>.05,'attacks need captured whole-body weight transfer');}
}
