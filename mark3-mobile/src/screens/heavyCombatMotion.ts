import * as T from 'three';
import {AuthoredPose,sampleKnightClip,mixKnightPoses,sampleAuthoredDuel,knightTransforms} from './authoredKnightMotion';
const ease=(x:number)=>T.MathUtils.smoothstep(x,0,1);
const turn=(pose:AuthoredPose,joints:number[],axis:T.Vector3,angle:number)=>{const q=new T.Quaternion().setFromAxisAngle(axis,angle);for(const j of joints)pose[j].q.premultiply(q);};
const torso=[2,3,4,5,6,7,8,9,10],arm=[5,6,7];
// Author one compact overhead guard. The elbow folds; forearm and hand rotate
// together, so raising the hilt never asks the wrist to bend around the sword.
const raisedGuard=(()=>{
 const p=sampleAuthoredDuel(1.25).poses[0];turn(p,torso,new T.Vector3(0,1,0),-.25);
 let f=knightTransforms(p);const upper=f.bones[2].position.clone().sub(f.bones[1].position),lower=f.bones[3].position.clone().sub(f.bones[2].position);
 turn(p,[6,7],upper.clone().cross(lower).normalize(),Math.PI/2-upper.angleTo(lower));
 f=knightTransforms(p);const reach=f.bones[3].position.clone().sub(f.bones[1].position).normalize(),lift=new T.Vector3(-.12,.94,.32).normalize();
 const raise=new T.Quaternion().setFromUnitVectors(reach,lift);for(const j of arm)p[j].q.premultiply(raise);
 const rollToward=(joints:number[],axis:T.Vector3,from:T.Vector3,to:T.Vector3)=>{from.addScaledVector(axis,-from.dot(axis)).normalize();to.addScaledVector(axis,-to.dot(axis)).normalize();turn(p,joints,axis,Math.atan2(axis.dot(from.clone().cross(to)),from.dot(to)));};
 f=knightTransforms(p);
 rollToward(arm,lift,f.bones[2].position.clone().sub(f.bones[1].position),new T.Vector3(-1,.2,-.2));
 f=knightTransforms(p);const forearm=f.bones[3].position.clone().sub(f.bones[2].position).normalize();
 rollToward([6,7],forearm,f.tip.clone().sub(f.grip),new T.Vector3(0,.85,-.53));
 return p;
})();
const contactGuard=sampleAuthoredDuel(1.62).poses[0];
/** Rotate the whole sword arm from the shoulder, preserving elbow and wrist angles. */
export function heavyAttackPose(pose:AuthoredPose,guard:AuthoredPose,dt:number,blocked:boolean){
 if(dt<0){
  // Hold a single raised key pose; sampling the ordinary swing throughout the
  // long anticipation introduced an extra dip and a second wrist flick.
  const loaded=mixKnightPoses(guard,raisedGuard,ease((dt+.65)/.32));
  const strike=mixKnightPoses(loaded,contactGuard,ease((dt+.20)/.20));
  for(const j of [2,3,4,5,6,7])pose[j].q.copy(strike[j].q);
 }else if(!blocked){
  // A miss carries past the old target line; only a block earns a rebound.
  const through=mixKnightPoses(contactGuard,contactGuard,0);
  turn(through,torso,new T.Vector3(0,1,0),.35);
  turn(through,arm,new T.Vector3(1,0,0),.72);
  const swing=mixKnightPoses(contactGuard,through,ease(dt/.20)),recover=mixKnightPoses(swing,guard,ease((dt-.23)/.25));
  for(const j of [2,3,4,5,6,7])pose[j].q.copy(recover[j].q);
  return pose;
 }
 // A clear recovery arc follows contact; a blocked blade is knocked outward,
 // while a landed cut carries through below the shoulder.
 const follow=ease(dt/.18)*(1-ease((dt-.30)/.18));
 turn(pose,torso,new T.Vector3(0,1,0),.24*follow);
 turn(pose,arm,new T.Vector3(1,0,0),(blocked?-.45:.48)*follow);
 return pose;
}
/** Absorb the blow through bent knees, then redirect it or drive the shield out. */
export function heavyDefensePose(pose:AuthoredPose,guard:AuthoredPose,dt:number,shield:boolean){
 const absorb=ease(dt/.10)*(1-ease((dt-.16)/.18));
 const crouch=mixKnightPoses(pose,sampleKnightClip('Crouch_Idle_Loop',.6),absorb*.48);
 for(const j of [0,11,12,13,14,15,16])pose[j]=crouch[j];
 turn(pose,torso,new T.Vector3(1,0,0),-.16*absorb);
 const answer=ease((dt-.13)/.17)*(1-ease((dt-.34)/.14));
 if(shield){
  const press=mixKnightPoses(pose,sampleKnightClip('Shield_OneShot',.60),answer);
  for(const j of [8,9,10])pose[j]=press[j];
 }else turn(pose,torso,new T.Vector3(0,1,0),.62*answer);
 return mixKnightPoses(pose,guard,ease((dt-.34)/.14));
}
