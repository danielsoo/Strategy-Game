import * as T from 'three';
import type {AuthoredPose} from './authoredKnightMotion';
import {motionCurve as curve} from './weaponBodyMotion';
import type {SpearTechnique,SpearGuard} from './spearTechniques';

// Low (Pflug) guard, extension and withdrawal. See the reference notes in CREDITS.
// The actor stands obliquely; this axis becomes its forward line in the scene.
export const SPEAR_AXIS=new T.Vector3(.96,0,.28).normalize();
export const SPEAR_STANCE_YAW=-Math.atan2(SPEAR_AXIS.x,SPEAR_AXIS.z);
export function spearMotion(p:AuthoredPose,dt:number,attack:boolean,parry:number,weight:number,technique:SpearTechnique='thrust',guard:SpearGuard='beat'){
 // The tip traces distinct paths before commitment and on recovery. Contact
 // remains at the recorded exchange time, including failed attacks and deaths.
 let yaw=0,pitch=0,lift=0,withdraw=0,torso=0;
 if(attack){
  if(technique==='beat-riposte'){
   yaw=curve(dt,[[-.65,0],[-.43,-.32],[-.27,.32],[-.10,0],[.18,0],[.48,0]]);
   pitch=curve(dt,[[-.65,0],[-.36,.18],[-.20,-.12],[-.04,0],[.48,0]]);
   torso=yaw*.45;
  }else if(technique==='disengage'){
   yaw=curve(dt,[[-.65,0],[-.45,-.27],[-.25,.27],[-.05,0],[.48,0]]);
   pitch=curve(dt,[[-.65,0],[-.43,-.28],[-.25,-.30],[-.08,.10],[0,0],[.48,0]]);
   withdraw=curve(dt,[[-.65,0],[-.4,-.07],[-.17,-.035],[0,0],[.48,0]]);
  }else if(technique==='high-low'){
   pitch=curve(dt,[[-.65,0],[-.42,.48],[-.22,.48],[0,-.12],[.10,-.12],[.48,0]]);
   lift=curve(dt,[[-.65,0],[-.42,.10],[-.22,.10],[0,-.015],[.48,0]]);
  }else if(technique==='sweep'){
   yaw=curve(dt,[[-.65,0],[-.27,-.42],[0,0],[.14,.38],[.48,0]]);
   pitch=curve(dt,[[-.65,0],[-.27,.15],[0,0],[.14,-.10],[.48,0]]);
   torso=yaw*.50;
  }
 }else if(parry){
  yaw=guard==='wind'?curve(dt,[[-.65,0],[-.30,-.23],[0,.12],[.16,.30],[.48,0]]):curve(dt,[[-.65,0],[-.22,-.30],[0,0],[.16,.32],[.48,0]]);
  pitch=guard==='wind'?curve(dt,[[-.65,0],[-.30,.34],[0,.12],[.16,.28],[.48,0]]):curve(dt,[[-.65,0],[-.22,.12],[0,0],[.16,-.18],[.48,0]]);
  lift=guard==='wind'?.055*parry:0;torso=yaw*.3;
 }
 const drive=attack?curve(dt,[[-.65,0],[-.24,-.035],[0,.06],[.06,.065],[.30,-.025],[.48,0]]):0;
 const extension=attack?curve(dt,[[-.65,0],[-.24,0],[0,1],[.06,1],[.32,0],[.48,0]]):0;
 const body=attack?curve(dt,[[-.65,0],[-.30,-.04],[.015,.22],[.08,.22],[.38,0],[.48,0]]):0;
 const old=p[2].q.clone();
 // Small axial unwinding, not the large lateral torso sweep used by an axe.
 const turn=attack?curve(dt,[[-.65,0],[-.24,-.12],[.03,.13],[.35,0],[.48,0]]):0;
 const chest=new T.Quaternion().setFromEuler(new T.Euler(.025,-.08+turn+torso,-body*.35,'YXZ'));
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
 const wrist=new T.Vector3(-.30,1.17+lift,.18).addScaledVector(SPEAR_AXIS,drive+withdraw);
 const direction=SPEAR_AXIS.clone().applyAxisAngle(new T.Vector3(0,1,0),yaw);direction.y=.06*(1-extension)+.15*parry+pitch;
 p.weaponPose={wrist,direction:direction.normalize(),support:.43-.05*extension,shaftLocked:true};
}
