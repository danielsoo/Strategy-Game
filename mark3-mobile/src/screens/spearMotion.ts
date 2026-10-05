import * as T from 'three';
import type {AuthoredPose} from './authoredKnightMotion';
import {motionCurve as curve} from './weaponBodyMotion';

// Low (Pflug) guard, extension and withdrawal. See the reference notes in CREDITS.
// The actor stands obliquely; this axis becomes its forward line in the scene.
export const SPEAR_AXIS=new T.Vector3(.96,0,.28).normalize();
export const SPEAR_STANCE_YAW=-Math.atan2(SPEAR_AXIS.x,SPEAR_AXIS.z);
export function spearMotion(p:AuthoredPose,dt:number,attack:boolean,parry:number,weight:number){
 const drive=attack?curve(dt,[[-.65,0],[-.24,-.035],[0,.06],[.06,.065],[.30,-.025],[.48,0]]):0;
 const extension=attack?curve(dt,[[-.65,0],[-.24,0],[0,1],[.06,1],[.32,0],[.48,0]]):0;
 const body=attack?curve(dt,[[-.65,0],[-.30,-.04],[.015,.22],[.08,.22],[.38,0],[.48,0]]):0;
 const old=p[2].q.clone();
 // Small axial unwinding, not the large lateral torso sweep used by an axe.
 const turn=attack?curve(dt,[[-.65,0],[-.24,-.12],[.03,.13],[.35,0],[.48,0]]):0;
 const chest=new T.Quaternion().setFromEuler(new T.Euler(.025,-.08+turn,-body*.35,'YXZ'));
 p[2].q.slerp(chest,weight);p[3].q.copy(p[2].q);
 const change=p[2].q.clone().multiply(old.invert());
 for(const j of [4,5,6,7,8,9,10])p[j].q.premultiply(change);
 p[4].q.slerp(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),1.05),weight);
 p[0].q.slerp(new T.Quaternion().setFromEuler(new T.Euler(0,turn*.55,-body*.16)),weight);
 p[0].p.lerp(SPEAR_AXIS.clone().multiplyScalar(body).add(new T.Vector3(0,-.035,0)),weight);
 const feet=[new T.Vector3(-.25,.08,-.16),new T.Vector3(.29,.08,.14)];
 p.stance={weight,feet};
 // Rear hand pushes; the guide hand lets the shaft slide through by 5 cm.
 // Both displacement and withdrawal follow the shaft, never the chest's Z axis.
 const wrist=new T.Vector3(-.30,1.17,.18).addScaledVector(SPEAR_AXIS,drive);
 const direction=SPEAR_AXIS.clone();direction.y=.06*(1-extension)+.15*parry;
 p.weaponPose={wrist,direction:direction.normalize(),support:.43-.05*extension,shaftLocked:true};
}
