import * as T from 'three';
import {AuthoredPose,sampleKnightClip,mixKnightPoses,sampleAuthoredDuel} from './authoredKnightMotion';
const ease=(x:number)=>T.MathUtils.smoothstep(x,0,1);
const turn=(pose:AuthoredPose,joints:number[],axis:T.Vector3,angle:number)=>{const q=new T.Quaternion().setFromAxisAngle(axis,angle);for(const j of joints)pose[j].q.premultiply(q);};
const torso=[2,3,4,5,6,7,8,9,10],arm=[5,6,7];
/** Rotate the whole sword arm from the shoulder, preserving elbow and wrist angles. */
export function heavyAttackPose(pose:AuthoredPose,guard:AuthoredPose,dt:number,blocked:boolean){
 if(dt<0){
  // Hold a single raised key pose; sampling the ordinary swing throughout the
  // long anticipation introduced an extra dip and a second wrist flick.
  const raised=sampleAuthoredDuel(1.25).poses[0],contact=sampleAuthoredDuel(1.62).poses[0];
  turn(raised,torso,new T.Vector3(0,1,0),-.48);
  turn(raised,arm,new T.Vector3(1,0,0),-.35);
  turn(raised,arm,new T.Vector3(0,0,1),-.60);
  const loaded=mixKnightPoses(guard,raised,ease((dt+.65)/.24));
  const strike=mixKnightPoses(loaded,contact,ease((dt+.20)/.20));
  for(const j of [2,3,4,5,6,7])pose[j].q.copy(strike[j].q);
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
