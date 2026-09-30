import {Vector3,Quaternion,Euler} from 'three';
export type Point=[number,number,number];
export const DUEL_DURATION=6.4;
export const SWORD_REST_DIRECTION:Point=[.000187,.407555,.74768];
export const SWORD_LENGTH=Math.hypot(...SWORD_REST_DIRECTION);
export const SWORD_FOREARM:Point=[-.18,-.15,.03];
export const MAX_ELBOW_FLEX=125*Math.PI/180;
export const SHIELD_REST_NORMAL:Point=[-.529848,.030807,.847533];
export const SHIELD_GRIP_OFFSET:Point=[.085375,-.181472,.148256];
// 원본 방패 앞쪽 돌출부. 중심 평면을 쓰면 검이 문양과 테두리를 관통한다.
export const SHIELD_CONTACT_OFFSET:Point=[-.180310514,.033019239,.095862591];
export const BATTLE_DURATION=DUEL_DURATION+1.2;
export const CONTACT_TIMES=[1.62,3.02,4.42];
export interface FighterPose {
 root:Point; yaw:number; sword:Point; tip:Point; shield:Point;
 aimPoint:Point; bladeFraction:number; bladeRoll:number; shieldNormal:Point;
 blockNormal?:Point; blockAlignment?:number;
 feet:[Point,Point]; twist:number; crouch:number; reaction:number;
}
export interface DuelFrame {fighters:[FighterPose,FighterPose]; contact:Point; impact:number; blocked:boolean; phase:string}
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const lerp=(a:Point,b:Point,t:number):Point=>a.map((v,i)=>mix(v,b[i],t)) as Point;
const v=(p:Point)=>new Vector3(...p);
export function localToWorld(p:Point,actor:FighterPose):Point {
 const c=Math.cos(actor.yaw),s=Math.sin(actor.yaw);
 return [actor.root[0]+p[0]*c+p[2]*s,actor.root[1]+p[1],actor.root[2]-p[0]*s+p[2]*c];
}
export function worldToLocal(p:Point,actor:FighterPose):Point {
 const x=p[0]-actor.root[0],z=p[2]-actor.root[2],c=Math.cos(actor.yaw),s=Math.sin(actor.yaw);
 return [x*c-z*s,p[1]-actor.root[1],x*s+z*c];
}
function guard(x:number,yaw:number):FighterPose {
 return {root:[x,0,0],yaw,sword:[-.30,1.13,.34],tip:[-.23,1.84,.65],aimPoint:[-.23,1.84,.65],bladeFraction:1,bladeRoll:-.25,shield:[.20,1.20,.32],shieldNormal:[0,0,1],feet:[[-.21,.08,-.12],[.21,.08,.24]],twist:0,crouch:.06,reaction:0};
}
export function shieldRotation(normal:Point){
 return new Quaternion().setFromUnitVectors(new Vector3(0,0,1),v(normal).normalize())
  .multiply(new Quaternion().setFromUnitVectors(v(SHIELD_REST_NORMAL).normalize(),new Vector3(0,0,1)));
}
/** 방패의 원래 손잡이 위치를 고정한다. 팔이 닿지 않으면 방패와 손을 함께 당긴다. */
export function shieldGrip(pose:FighterPose):Point {
 return v(SHIELD_GRIP_OFFSET).applyQuaternion(shieldRotation(pose.shieldNormal)).add(v(pose.shield)).toArray() as Point;
}
export function shieldContact(pose:FighterPose):Point {
 return v(SHIELD_CONTACT_OFFSET).applyQuaternion(shieldRotation(pose.shieldNormal)).add(v(pose.shield)).addScaledVector(v(pose.shieldNormal),.006).toArray() as Point;
}
function fitShield(pose:FighterPose){
 const shoulder=v([.24,.46,0]).applyEuler(new Euler(0,pose.twist,0)).add(v([0,.88-pose.crouch,-pose.reaction]));
 const hand=v(shieldGrip(pose)),delta=hand.clone().sub(shoulder);
 if(delta.length()>.485)pose.shield=v(pose.shield).add(shoulder.add(delta.setLength(.485)).sub(hand)).toArray() as Point;
}
export function swordShoulder(pose:FighterPose):Point {
 return v([-.24,.46,0]).applyEuler(new Euler(0,pose.twist,0)).add(v([0,.88-pose.crouch,-pose.reaction])).toArray() as Point;
}
/** 손목을 따로 돌리지 않는다. 아래팔·손·검을 한 강체로 풀어 원래 쥐는 각도를 보존한다. */
export function solveSwordArm(pose:FighterPose){
 const shoulder=swordShoulder(pose),offset=v(pose.aimPoint).sub(v(shoulder));
 const distal=v(SWORD_FOREARM).addScaledVector(v(SWORD_REST_DIRECTION),pose.bladeFraction);
 const length=distal.length(),maximum=length+.263-.045;
 const distance=Math.max(length-.263+.08,Math.min(maximum,offset.length())),direction=offset.normalize();
 const atDistance=(distance:number)=>{
  const target=v(shoulder).addScaledVector(direction,distance);
  const pole=v([-.55,-.32,.22]).applyEuler(new Euler(0,pose.twist,0)).add(v(shoulder)).toArray() as Point;
  const elbow=jointIK(shoulder,target.toArray() as Point,pole,.263,length);
  const axis=target.clone().sub(v(elbow)).normalize();
  const rotation=new Quaternion().setFromUnitVectors(distal.clone().normalize(),axis);
  let roll=pose.bladeRoll;
  if(pose.blockNormal&&pose.blockAlignment){
   const normal=v(pose.blockNormal),blade=v(SWORD_REST_DIRECTION).applyQuaternion(rotation).normalize();
   const parallel=axis.clone().multiplyScalar(blade.dot(axis)),radial=blade.clone().sub(parallel);
   const A=radial.dot(normal),B=new Vector3().crossVectors(axis,radial).dot(normal),C=parallel.dot(normal),radius=Math.hypot(A,B);
   if(radius>1e-6){
    const base=Math.atan2(B,A),angle=Math.acos(Math.max(-1,Math.min(1,-C/radius)));
    const delta=(r:number)=>Math.atan2(Math.sin(r-roll),Math.cos(r-roll));
    const x=delta(base+angle),y=delta(base-angle);roll+=(Math.abs(x)<Math.abs(y)?x:y)*pose.blockAlignment;
   }
  }
  rotation.premultiply(new Quaternion().setFromAxisAngle(axis,roll));
  const hand=v(elbow).add(v(SWORD_FOREARM).applyQuaternion(rotation));
  const tip=hand.clone().add(v(SWORD_REST_DIRECTION).applyQuaternion(rotation));
  const flex=v(elbow).sub(v(shoulder)).angleTo(hand.clone().sub(v(elbow)));
  return {shoulder,elbow,hand:hand.toArray() as Point,tip:tip.toArray() as Point,rotation,flex};
 };
 let result=atDistance(distance);
 // 검을 몸 안으로 끌어당겨 팔을 접지 않는다. 쥐는 각도를 유지한 채 궤적을 몸 밖으로 제한한다.
 if(result.flex>MAX_ELBOW_FLEX){
  let low=distance,high=maximum;
  for(let i=0;i<14;i++){const mid=(low+high)/2;if(atDistance(mid).flex>MAX_ELBOW_FLEX)low=mid;else high=mid;}
  result=atDistance(high);
 }
 return result;
}
/** 손목 위치를 직선으로 끌어당기지 않고 어깨 주위의 호를 따라 칼끝을 이동시킨다. */
function arcTip(from:Point,to:Point,origin:Point,t:number):Point {
 const a=v(from).sub(v(origin)),b=v(to).sub(v(origin)),radius=mix(a.length(),b.length(),t);
 const turn=new Quaternion().setFromUnitVectors(a.clone().normalize(),b.clone().normalize());
 return a.normalize().applyQuaternion(new Quaternion().slerp(turn,t)).multiplyScalar(radius).add(v(origin)).toArray() as Point;
}
function cutCurve(from:Point,to:Point,normal:Point,t:number):Point {
 const c1=v(from).add(new Vector3(0,0,.20)),c2=v(to).addScaledVector(v(normal),.16),u=1-t;
 return v(from).multiplyScalar(u*u*u).addScaledVector(c1,3*u*u*t).addScaledVector(c2,3*u*t*t).addScaledVector(v(to),t*t*t).toArray() as Point;
}
/** 칼날이 방패 면과 나란해지는 접촉 자세. 찌르기처럼 검 끝을 면 안으로 보내지 않는다. */
function makeContactPlan(horizontal:boolean,blocked:boolean){
 const advance=blocked?(horizontal?.44:.43):.63;
 const a=guard(0,0),b=guard(0,Math.PI);b.root=[0,0,1.45-advance];
 a.twist=horizontal?.38:.28;a.crouch=.085;a.bladeRoll=horizontal?-1.60:-1.50;a.bladeFraction=.70;
 b.shield=blocked?[.12,1.25,.38]:[.39,1.04,.18];
 let point:Point=[0,0,0];
 for(let i=0;i<24;i++){
  fitShield(b);
  point=localToWorld(blocked?shieldContact(b):[-.22,1.34,.14],b);
  a.aimPoint=point;
  if(!blocked)break;
  const arm=solveSwordArm(a),blade=v(arm.tip).sub(v(arm.hand)).normalize();
  const normal=v(horizontal?[.85,.08,-.65]:[.60,.62,-.70]);
  normal.addScaledVector(blade,-normal.dot(blade)).normalize();
  b.shieldNormal=[-normal.x,normal.y,-normal.z];
 }
 fitShield(b);
 return {advance,shield:b.shield,normal:b.shieldNormal,twist:a.twist,roll:a.bladeRoll};
}
const contactPlans=[makeContactPlan(false,true),makeContactPlan(true,true),makeContactPlan(false,false)];
/** 뒤발은 지면에 남기고 앞발을 먼저 디딘다. 회수 때도 발이 들린 구간에만 옮긴다. */
function attackStep(a:FighterPose,advance:number,step:number,recover:number){
 const frontReturn=smooth(recover/.55),rearReturn=smooth((recover-.55)/.45);
 const travel=advance*step*(1-.6*frontReturn-.4*rearReturn),front=(advance+.05)*smooth(step*1.55)*(1-frontReturn);
 const rear=Math.max(0,advance-.22)*smooth((step-.45)/.55)*(1-rearReturn);
 a.root[0]+=Math.sin(a.yaw)*travel;
 a.feet[1][2]+=front-travel;a.feet[0][2]+=rear-travel;
 const lift=(q:number)=>Math.sin(Math.PI*clamp(q));
 a.feet[1][1]+=.085*(recover>0?lift(recover/.55):lift(step*1.55));
 a.feet[0][1]+=.035*(recover>0?lift((recover-.55)/.45):lift((step-.65)/.35));
}
/** 방패 준비 → 날로 충돌 → 압축 → 튕김 → 회수. 두 배우와 접촉 효과가 한 시계를 쓴다. */
export function sampleDuel(seconds:number,first:0|1=0,finishWinner:0|1=first):DuelFrame {
 const t=Math.max(0,Math.min(DUEL_DURATION,seconds));
 const entry=smooth(t/.8),exit=smooth((t-5.15)/1.25);
 const distance=mix(mix(2.2,1.45,entry),2.2,exit);
 const actors:[FighterPose,FighterPose]=[guard(-distance/2,Math.PI/2),guard(distance/2,-Math.PI/2)];
 let contact:Point=[0,1.2,0],impact=0,blocked=true,phase=t<.8?'서로 거리를 좁힙니다':t>5.15?'거리를 벌리고 경계를 회복합니다':'상대의 빈틈을 살핍니다';
 for(let n=0;n<3;n++){
  const at=CONTACT_TIMES[n],start=at-.70,end=at+.66;
  if(t<start||t>end)continue;
  const striker=(n===2?finishWinner:((n===1?1:0)^first)) as 0|1,receiver=(1-striker) as 0|1;
  const a=actors[striker],b=actors[receiver],plan=contactPlans[n],horizontal=n===1;blocked=n<2;
  const wind=smooth((t-start)/.36),strike=clamp((t-(at-.34))/.34),swing=strike*strike;
  const recover=smooth((t-at-.18)/.48),rebound=smooth((t-at-.055)/.125)*(1-recover);
  const brace=smooth((t-start-.06)/.27)*(1-recover);
  // 날이 오기 전에 어깨까지 가린다. 접촉 뒤에만 팔꿈치와 무릎으로 충격을 흡수한다.
  const compression=t>=at?Math.sin(Math.PI*clamp((t-at)/.20)):0;
  b.shield=lerp(b.shield,plan.shield,brace);
  b.shieldNormal=v(lerp(b.shieldNormal,plan.normal,brace)).normalize().toArray() as Point;
  b.reaction=compression*(blocked?.028:.075);b.crouch+=compression*(blocked?.018:.03);
  b.twist=compression*(blocked?-.045:.12);
  b.shield=v(b.shield).addScaledVector(v(b.shieldNormal),-compression*(blocked?.045:0)).toArray() as Point;
  fitShield(b);
  a.twist=mix(horizontal?-.30:-.22,plan.twist,swing)*wind*(1-recover);
  a.crouch+=.025*wind*(1-recover);
  attackStep(a,plan.advance,smooth((t-(at-.44))/.36),recover);
  contact=localToWorld(blocked?shieldContact(b):[-.22,1.34,.14],b);
  const target=worldToLocal(contact,a),shoulder=swordShoulder(a);
  // 왼쪽 높은 경계에서 몸 앞을 가로질러 베어 나온다. 칼날의 진행과 길이 방향을 분리한다.
  const chamber:Point=horizontal?[.86,1.70,.10]:[.62,2.03,.08];
  const attackNormal:Point=blocked?[-b.shieldNormal[0],b.shieldNormal[1],-b.shieldNormal[2]]:[.4,.6,-.6];
  a.aimPoint=strike>0?cutCurve(chamber,target,attackNormal,swing):arcTip(a.aimPoint,chamber,shoulder,wind);
  a.bladeFraction=mix(1,.70,wind*(1-recover));
  a.bladeRoll=mix(a.bladeRoll,plan.roll,wind*(1-recover));
  if(blocked){a.blockNormal=[-b.shieldNormal[0],b.shieldNormal[1],-b.shieldNormal[2]];a.blockAlignment=t>=at?1-smooth((t-at-.08)/.14):0;}
  if(t>at){
   const normal=blocked?v([-b.shieldNormal[0],b.shieldNormal[1],-b.shieldNormal[2]]):v([.2,-.4,.1]);
   a.aimPoint=v(a.aimPoint).addScaledVector(normal,blocked?.20*rebound:.22*smooth((t-at)/.18)*(1-recover)).toArray() as Point;
  }
  a.aimPoint=arcTip(a.aimPoint,guard(0,0).aimPoint,shoulder,recover);
  // 공격 중에도 자기 방패는 몸 가까이 유지한다.
  a.shield=lerp(a.shield,[.34,.98,.16],wind*(1-recover));
  a.shieldNormal=v(lerp(a.shieldNormal,[.20,0,.98],wind*(1-recover))).normalize().toArray() as Point;fitShield(a);
  impact=t>=at&&t<at+.09?1-(t-at)/.09:0;
  phase=t<at-.34?'방패를 공격선에 세우고 앞발을 디딥니다':t<at?(horizontal?'몸 앞을 가로지르는 횡베기':'높은 경계에서 내려 베기'):t<at+.055?blocked?'칼날을 방패 면으로 받아냅니다':'방패 바깥 어깨 피격':t<at+.18?blocked?'방패가 충격을 흡수하고 검이 튕깁니다':'무릎을 굽혀 충격을 흡수합니다':n===0?'방어자가 검을 회수하며 반격을 준비합니다':'검을 거두고 거리를 회복합니다';
 }
 if(t<.8||t>5.15){const q=t<.8?t/.8:(t-5.15)/1.25;actors.forEach(a=>{a.feet.forEach((f,i)=>{const cycle=clamp(q*2-i);f[1]+=.085*Math.sin(Math.PI*cycle);f[2]+=.12*Math.sin(Math.PI*cycle);});});}
 actors.forEach(a=>{fitShield(a);const arm=solveSwordArm(a);a.sword=arm.hand;a.tip=arm.tip;});
 return {fighters:actors,contact,impact,blocked,phase};
}

/** 길이를 보존하는 두 관절 IK. 팔꿈치/무릎은 지정한 바깥쪽으로 접힌다. */
export function jointIK(start:Point,end:Point,pole:Point,upper:number,lower:number):Point {
 const a=v(start),d=v(end).sub(a),distance=Math.min(upper+lower-.0001,Math.max(.0001,d.length()));d.normalize();
 const bend=v(pole).sub(a);bend.addScaledVector(d,-bend.dot(d)).normalize();
 const along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
 return a.addScaledVector(d,along).addScaledVector(bend,height).toArray() as Point;
}
