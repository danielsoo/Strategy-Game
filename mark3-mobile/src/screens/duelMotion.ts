import {Vector3} from 'three';
export type Point=[number,number,number];
export const DUEL_DURATION=6.4;
export const SWORD_REST_DIRECTION:Point=[.000187,.407555,.74768];
export const SWORD_LENGTH=Math.hypot(...SWORD_REST_DIRECTION);
export const BATTLE_DURATION=DUEL_DURATION+1.2;
export const CONTACT_TIMES=[1.62,3.02,4.42];
export interface FighterPose {
 root:Point; yaw:number; sword:Point; tip:Point; shield:Point;
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
 return {root:[x,0,0],yaw,sword:[-.30,1.13,.34],tip:[-.23,1.84,.65],shield:[.27,1.18,.39],feet:[[-.17,.08,-.15],[.17,.08,.20]],twist:0,crouch:.025,reaction:0};
}
/** 두 병사를 같은 시계로 움직여 접촉 전에는 피격 반응이 생기지 않게 한다. */
export function sampleDuel(seconds:number,first:0|1=0,finishWinner:0|1=first):DuelFrame {
 const t=Math.max(0,Math.min(DUEL_DURATION,seconds));
 const entry=smooth(t/.8),exit=smooth((t-5.15)/1.25);
 const distance=mix(mix(2.2,1.54,entry),2.2,exit);
 const actors:[FighterPose,FighterPose]=[guard(-distance/2,Math.PI/2),guard(distance/2,-Math.PI/2)];
 let contact:Point=[0,1.2,0],impact=0,blocked=true,phase=t<.8?'서로 거리를 좁힙니다':t>5.15?'거리를 벌리고 경계를 회복합니다':'상대의 빈틈을 살핍니다';
 for(let n=0;n<3;n++){
  const at=CONTACT_TIMES[n],start=at-.70,end=at+.66;
  if(t<start||t>end)continue;
  const striker=(n===2?finishWinner:((n===1?1:0)^first)) as 0|1,receiver=(1-striker) as 0|1;
  const a=actors[striker],b=actors[receiver];blocked=n<2;
  const wind=smooth((t-start)/.38),swing=smooth((t-(at-.32))/.32),recover=smooth((t-at-.13)/.53);
  const recoil=t>=at?Math.sin(Math.PI*clamp((t-at)/.42)):0;
  // 방패는 검이 도착하기 전에 공격선을 막는다. 마지막 공격은 방패 바깥의 어깨를 겨냥한다.
  b.shield=lerp(b.shield,blocked?[.12,1.24,.48]:[.38,1.03,.22],wind*(1-recover));
  b.reaction=recoil*(blocked?.035:.10);
  b.crouch+=recoil*(blocked?.012:.045);
  b.twist=recoil*(blocked?.035:.13);
  const retreat=(!blocked?.13:.045)*smooth((t-at)/.25)*(1-smooth((t-at-.32)/.34));
  b.root[0]+=Math.sin(b.yaw)*-retreat;
  b.feet[0][2]-=retreat*.7;b.feet[0][1]+=Math.sin(Math.PI*clamp((t-at)/.35))*(t>=at?.045:0);
  if(!blocked)a.root[0]+=Math.sin(a.yaw)*.18*wind*(1-recover);
  contact=localToWorld(blocked?[b.shield[0],b.shield[1],b.shield[2]+.009]:[-.22,1.34,.14],b);
  const target=worldToLocal(contact,a);
  const chamber:Point=[-.39,1.58,-.04],chamberTip:Point=[-.52,2.14,-.49];
  const hand:Point=[-.23,1.27,.43];
  a.sword=lerp(lerp(a.sword,chamber,wind),hand,swing);
  a.tip=lerp(lerp(a.tip,chamberTip,wind),target,swing);
  // 실제 검 길이의 길이을 표적에 맞춘다. 팔꿈치는 리그에서 두 뼈 IK로 푼다.
  if(swing>0){const direction=v(target).sub(v(a.sword)).normalize();const grip=v(target).addScaledVector(direction,-SWORD_LENGTH).toArray() as Point;a.sword=lerp(a.sword,grip,swing);}
  const rest=guard(0,0);a.sword=lerp(a.sword,rest.sword,recover);a.tip=lerp(a.tip,rest.tip,recover);
  a.twist=mix(-.13,.12,swing)*wind*(1-recover);
  a.feet[1][2]+=.13*wind*(1-recover);
  a.feet[1][1]+=.06*Math.sin(Math.PI*wind)*(1-recover);
  a.crouch+=.02*swing*(1-recover);
  impact=t>=at&&t<at+.18?1-(t-at)/.18:0;
  phase=t<at-.32?'검을 준비하며 방패로 몸을 가립니다':t<at?'상대를 향해 베어 들어갑니다':t<at+.18?blocked?'방패에 접촉 · 충격을 받아냅니다':'어깨 피격 · 발을 옮겨 균형을 잡습니다':n===0?'방어자가 반격을 준비합니다':'검을 거두고 경계를 회복합니다';
 }
 // 접근할 때만 발을 교대로 든다. 공방 중 양발을 함께 흔들지 않는다.
 if(t<.8||t>5.15){const q=t<.8?t/.8:(t-5.15)/1.25;actors.forEach(a=>{a.feet.forEach((f,i)=>{const cycle=clamp(q*2-i);f[1]+=.085*Math.sin(Math.PI*cycle);f[2]+=.12*Math.sin(Math.PI*cycle);});});}
 return {fighters:actors,contact,impact,blocked,phase};
}

/** 길이를 보존하는 두 관절 IK. 팔꿈치/무릎은 지정한 바깥쪽으로 접힌다. */
export function jointIK(start:Point,end:Point,pole:Point,upper:number,lower:number):Point {
 const a=v(start),d=v(end).sub(a),distance=Math.min(upper+lower-.0001,Math.max(.0001,d.length()));d.normalize();
 const bend=v(pole).sub(a);bend.addScaledVector(d,-bend.dot(d)).normalize();
 const along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
 return a.addScaledVector(d,along).addScaledVector(bend,height).toArray() as Point;
}
