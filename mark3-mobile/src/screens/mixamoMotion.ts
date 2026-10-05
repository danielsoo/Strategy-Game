import * as T from 'three';
import data from './mixamoMotionData.json';
import original from './knightMotionData.json';
import type {AuthoredPose} from './authoredKnightMotion';
export type MocapClip=keyof typeof data.clips;
export const MOCAP_CLIPS:Record<MocapClip,string>={idle:'전투 대기',slash:'베기 A',combo:'연속 베기',cross:'베기 B',power:'큰 베기',down:'낮은 베기',block:'방패 올리기',guard:'방패 경계',release:'방패 내리기',impact:'피격',walk:'전진'};
export const mocapDuration=(clip:MocapClip)=>data.clips[clip].duration;
const vector=(a:number[],i:number)=>new T.Vector3().fromArray(a,i*7),quat=(a:number[],i:number)=>new T.Quaternion().fromArray(a,i*7+3).normalize();
const rest=data.rest,old=original.rests['2'];
const corrections=new Map<number,T.Quaternion>();
for(const i of [5,6,8,9,11,12,14,15])corrections.set(i,new T.Quaternion().setFromUnitVectors(vector(old,i+1).sub(vector(old,i)).normalize(),vector(rest,i+1).sub(vector(rest,i)).normalize()));
/** Preserve captured world rotations and root travel; no weapon-target IK here. */
export function sampleMocap(clip:MocapClip,time:number):AuthoredPose{
 const c=data.clips[clip],frame=T.MathUtils.clamp(time,0,c.duration)*data.fps,i=Math.min(c.frames.length-1,Math.floor(frame)),j=Math.min(i+1,c.frames.length-1),t=frame-i;
 const pose=Array.from({length:17},(_,joint)=>{
  const q=quat(c.frames[i],joint).slerp(quat(c.frames[j],joint),t).multiply(quat(rest,joint).invert());
  if(corrections.has(joint))q.multiply(corrections.get(joint)!);
  const p=vector(c.frames[i],joint).lerp(vector(c.frames[j],joint),t).sub(vector(rest,joint)).multiplyScalar(.88);
  if(joint===0){p.x-=c.frames[0][0]*.88;p.z-=c.frames[0][2]*.88;}
  return {p,q};
 }) as AuthoredPose;
 pose.mocap=true;return pose;
}
