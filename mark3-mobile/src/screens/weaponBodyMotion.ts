import * as T from 'three';
import type {AuthoredPose} from './authoredKnightMotion';
import type {WeaponKind} from './battleWeapons';

export const motionCurve=(t:number,keys:[number,number][])=>{
 let i=0;while(i+1<keys.length&&t>keys[i+1][0])i++;
 const a=keys[i],b=keys[Math.min(i+1,keys.length-1)];
 return a===b?a[1]:T.MathUtils.lerp(a[1],b[1],T.MathUtils.smoothstep(t,a[0],b[0]));
};
/** Pelvis leads the chest, the shoulder carries the elbow, and the hand follows.
 * These poses are authored for a weighted tool, independently of the sword clip. */
export function weaponBodyMotion(p:AuthoredPose,weapon:WeaponKind,dt:number,heavy:boolean,blocked:boolean){
 const spear=weapon==='spear',flail=weapon==='flail',pole=weapon==='axe'||weapon==='halberd';
 const weight=motionCurve(dt,[[-.65,0],[-.38,1],[.20,1],[.48,0]]);
 const guardYaw=spear?-.55:-.12;
 const pelvis=motionCurve(dt,[[-.65,0],[-.31,spear?-.20:-.36],[.015,spear?.18:.29],[.18,blocked?.20:.36],[.48,0]]);
 const chest=motionCurve(dt,[[-.65,0],[-.23,spear?-.22:flail?-.85:pole?-.66:-.58],[.035,spear?.20:.34],[.17,blocked?.22:flail?.78:.52],[.48,0]]);
 const lean=motionCurve(dt,[[-.65,0],[-.25,-.06],[.03,spear?.16:heavy?.22:.13],[.18,blocked?.10:.19],[.48,0]]);
 const shift=motionCurve(dt,[[-.65,0],[-.29,-.065],[.03,spear?.16:.095],[.17,blocked?.065:.12],[.48,0]]);
 const hipQ=new T.Quaternion().setFromEuler(new T.Euler(lean*.32,guardYaw*.45+pelvis,0,'YXZ'));
 const chestQ=new T.Quaternion().setFromEuler(new T.Euler(lean,guardYaw+chest,flail?-.08*weight:0,'YXZ'));
 // Skeleton source rotations are world-space, so carry the free arm with the chest too.
 chestQ.copy(p[2].q.clone().slerp(chestQ,weight));
 const change=chestQ.clone().multiply(p[2].q.clone().invert());
 for(const j of [4,5,6,7,8,9,10])p[j].q.premultiply(change);
 p[0].q.slerp(hipQ,weight);p[2].q.copy(chestQ);p[3].q.copy(chestQ);
 p[4].q.slerp(new T.Quaternion().setFromEuler(new T.Euler(lean*.3,guardYaw*.35+chest*.25,0)),.65);
 p[0].p.lerp(new T.Vector3(-.025,-.025,shift),weight);
 // A staggered planted stance lets the hips turn without dragging both feet.
 // The forward foot lands before the shoulder accelerates; the rear knee drives.
 const plant=motionCurve(dt,[[-.65,0],[-.30,1],[.19,1],[.48,0]]);
 p.stance={weight:plant,feet:[new T.Vector3(-.17,.08,-.19),new T.Vector3(.17,.08,.17+(spear?.11:.06)*plant)]};
 return {weight,chestYaw:guardYaw+chest};
}
