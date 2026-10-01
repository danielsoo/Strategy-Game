import * as T from 'three';
import data from './knightMotionData.json';
import {buildKnightRig} from './knightRig';
import {SHIELD_REST_NORMAL,shieldRotation,DUEL_DURATION} from './duelMotion';

type Joint={p:T.Vector3;q:T.Quaternion};
export type AuthoredPose=Joint[];
type Pose=AuthoredPose;
const V=(p:number[])=>new T.Vector3().fromArray(p);
const Q=(q:number[])=>new T.Quaternion().fromArray(q);
const restPose=(a:number[]):Pose=>Array.from({length:17},(_,i)=>({p:V(a.slice(i*7,i*7+3)),q:Q(a.slice(i*7+3,i*7+7))}));
const rests={1:restPose(data.rests['1']),2:restPose(data.rests['2'])};
const clips=data.clips;
type Clip=keyof typeof clips;
/** 원본 골격의 월드 회전을 T 자세에 대한 변화량으로 표준화한다. */
export function sampleKnightClip(name:Clip,time:number):Pose{
 const c=clips[name],r=rests[c.version as 1|2],f=Math.min(c.frames.length-1,Math.max(0,time*data.fps)),i=Math.floor(f),j=Math.min(i+1,c.frames.length-1),t=f-i;
 return Array.from({length:17},(_,b)=>{const a=c.frames[i],z=c.frames[j],k=b*7;return {
  p:V(a.slice(k,k+3)).lerp(V(z.slice(k,k+3)),t).sub(r[b].p),
  q:Q(a.slice(k+3,k+7)).slerp(Q(z.slice(k+3,k+7)),t).multiply(r[b].q.clone().invert())
 };});
}
const sample=sampleKnightClip;
export const mixKnightPoses=(a:Pose,b:Pose,t:number):Pose=>a.map((p,i)=>({p:p.p.clone().lerp(b[i].p,t),q:p.q.clone().slerp(b[i].q,t)}));
const mix=mixKnightPoses;
const smooth=(n:number)=>{n=T.MathUtils.clamp(n,0,1);return n*n*(3-2*n);};
const S=(s:number)=>V([s*.24,1.35,-.075]),E=(s:number)=>V([s*.425,1.21,-.075]),W=(s:number)=>V([s*.565,1.12,.035]);
const H=(s:number)=>V([s*.135,.83,0]),K=(s:number)=>V([s*.14,.45,.01]),F=(s:number)=>V([s*.145,.08,0]);
const align=(a:T.Vector3,b:T.Vector3)=>new T.Quaternion().setFromUnitVectors(a.clone().normalize(),b.clone().normalize());
const segmentCorrection=(a:T.Vector3,b:T.Vector3,i:number,j:number)=>align(b.clone().sub(a),rests[2][j].p.clone().sub(rests[2][i].p));
const corrections=[segmentCorrection(S(-1),E(-1),5,6),segmentCorrection(E(-1),W(-1),6,7),segmentCorrection(S(1),E(1),8,9),segmentCorrection(E(1),W(1),9,10),segmentCorrection(H(-1),K(-1),11,12),segmentCorrection(K(-1),F(-1),12,13),segmentCorrection(H(1),K(1),14,15),segmentCorrection(K(1),F(1),15,16)];
// 원본 법선은 손잡이가 있는 뒷면 방향이다. 문장이 있는 앞면을 상대에게 향하게 한다.
const shieldSocket=Q(clips.Idle_Shield_Loop.frames[0].slice(73,77)).invert().multiply(shieldRotation([0,0,-1]));
/** 날·가드·손잡이의 축이 명확한 한손검. 큰 갈고리형 가드가 손목 윤곽을 가리지 않는다. */
function buildArmingSword(){
 const group=new T.Group(),steel=new T.MeshStandardMaterial({color:'#abb4bb',metalness:.93,roughness:.29}),leather=new T.MeshStandardMaterial({color:'#29231f',roughness:.92}),darkSteel=new T.MeshStandardMaterial({color:'#565f65',metalness:.85,roughness:.4});
 const add=(geometry:T.BufferGeometry,material:T.MeshStandardMaterial,position:number[],rotationX=0)=>{const m=new T.Mesh(geometry,material);m.position.fromArray(position);m.rotation.x=rotationX;m.castShadow=true;group.add(m);return m;};
 add(new T.CylinderGeometry(.014,.018,.135,12),leather,[0,0,0],Math.PI/2);
 for(let i=0;i<10;i++)add(new T.TorusGeometry(.017,.0015,3,12),darkSteel,[0,0,-.058+i*.012]);
 add(new T.SphereGeometry(.025,12,8),steel,[0,0,-.093]).scale.set(1,.55,1);
 const guard=add(new T.CylinderGeometry(.010,.013,.235,8),steel,[0,0,.080]);guard.rotation.z=Math.PI/2;
 for(const s of [-1,1])add(new T.SphereGeometry(.014,8,6),steel,[s*.118,0,.080]);
 const rows=[[.085,.035],[.14,.031],[.58,.025],[.75,.020],[.87,0]],vertices:number[]=[],indices:number[]=[];
 for(const [z,w] of rows)for(const [x,y] of [[-w,0],[0,.006],[w,0],[0,-.006]])vertices.push(x,y,z);
 for(let r=0;r<rows.length-1;r++)for(let k=0;k<4;k++){const a=r*4+k,b=r*4+(k+1)%4,c=a+4,d=b+4;indices.push(a,b,c,b,d,c);}
 const blade=new T.BufferGeometry();blade.setAttribute('position',new T.Float32BufferAttribute(vertices,3));blade.setIndex(indices);blade.computeVertexNormals();add(blade,steel,[0,0,0]);
 const fuller=add(new T.BoxGeometry(.008,.001,.47),darkSteel,[0,.006,.335]);fuller.material.side=T.DoubleSide;
 return group;
}
export function buildAuthoredKnight(scene:T.Group){
 const rig=buildKnightRig(scene,true),hands=['r','l'].map(side=>{
  const d=data.hands[side as 'r'|'l'],g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(d.position,3));g.setAttribute('normal',new T.Float32BufferAttribute(d.normal,3));g.setIndex(d.index);
  const m=new T.Mesh(g,new T.MeshStandardMaterial({color:'#777d83',metalness:.78,roughness:.5}));m.scale.setScalar(.78);m.castShadow=true;
  const cuff=new T.Mesh(new T.CylinderGeometry(.038,.069,.13,10,1,true),m.material);cuff.position.y=-.05;cuff.castShadow=true;m.add(cuff);rig.mesh.add(m);return m;
 });
 const sword=buildArmingSword();rig.mesh.add(sword);
 const shield=new T.Mesh(rig.shieldGeometry!,rig.mesh.material);shield.castShadow=true;shield.receiveShadow=true;rig.mesh.add(shield);
 return {...rig,hands,sword,shield,dispose:()=>{rig.dispose();const materials=new Set<T.Material>();[...hands,sword].forEach(o=>o.traverse(o=>{if(!(o as T.Mesh).isMesh)return;const m=o as T.Mesh;m.geometry.dispose();materials.add(m.material as T.Material);}));materials.forEach(m=>m.dispose());}};
}
export type AuthoredRig=ReturnType<typeof buildAuthoredKnight>;
/** 공격자는 제작된 한손검 클립, 방어자는 방패 클립을 같은 시계로 재생한다. */
export function combatPose(time:number,role:'guard'|'attack'|'block'|'hit'='guard',local=0,horizontal=false):Pose{
 const guard=sample('Idle_Shield_Loop',time%2.5);
 // 칼을 든 오른팔은 방패를 든 기본 자세의 원본을 그대로 사용한다.
 if(role==='guard')return guard;
 if(role==='attack'){
  const attack=sample(horizontal?'Sword_Regular_A':'Sword_Attack',horizontal?local*.5:local),weight=smooth(local/.2)*(1-smooth((local-1.12)/.4));
  const p=mix(guard,attack,weight);
  const oldChest=p[2].q.clone();
  // 깊은 맨몸 런지는 중갑의 짧은 전진 베기로 조정하되 팔의 상대 관절 회전은 보존한다.
  for(const i of [0,1,2,3,11,12,13,14,15,16])p[i]={p:guard[i].p.clone().lerp(p[i].p,.35),q:guard[i].q.clone().slerp(p[i].q,.55)};
  const chestCorrection=p[2].q.clone().multiply(oldChest.invert());
  for(const i of [4,5,6,7])p[i].q.premultiply(chestCorrection);
  // 방패 팔은 공격 반대편에서 경계를 유지한다. 검을 쫓는 IK는 없다.
  for(const i of [8,9,10])p[i]=guard[i];
  return p;
 }
 const block=sample('Shield_OneShot',T.MathUtils.clamp(local,0,.83)),weight=smooth(local/.16)*(1-smooth((local-.5)/.33));
 if(role==='block')return mix(guard,block,weight);
 const hit=sample('Hit_Chest',T.MathUtils.clamp(local,0,.333));return mix(guard,hit,Math.sin(Math.PI*T.MathUtils.clamp(local/.5,0,1))*.55);
}
export function knightTransforms(p:Pose){
 const bones=Array.from({length:17},()=>({position:new T.Vector3(),quaternion:new T.Quaternion()})),hands=Array.from({length:2},()=>({position:new T.Vector3(),quaternion:new T.Quaternion()}));
 const set=(i:number,v:T.Vector3,q=new T.Quaternion())=>{bones[i].position.copy(v);bones[i].quaternion.copy(q);};
 const pelvis=V([0,.8,0]).add(p[0].p.clone().multiplyScalar(.9));
 const chest=pelvis.clone().add(V([0,.08,0]).applyQuaternion(p[0].q));
 set(8,pelvis,p[0].q);set(0,chest,p[2].q);
 set(7,chest.clone().add(V([0,.6,0]).applyQuaternion(p[2].q)),p[4].q);
 for(const s of [-1,1]){
  const right=s<0,i=right?1:4,j=right?5:8,c=right?0:2;
  const upperQ=p[j].q.clone().multiply(corrections[c]),lowerQ=p[j+1].q.clone().multiply(corrections[c+1]),handQ=p[j+2].q.clone().multiply(corrections[c+1]);
  const shoulder=chest.clone().add(S(s).sub(V([0,.88,0])).applyQuaternion(p[2].q));
  const elbow=shoulder.clone().add(E(s).sub(S(s)).applyQuaternion(upperQ));
  const wrist=elbow.clone().add(W(s).sub(E(s)).applyQuaternion(lowerQ));
  set(i,shoulder,upperQ);set(i+1,elbow,lowerQ);set(i+2,wrist,handQ);
  const actualHandQ=p[j+2].q.clone().multiply(rests[2][j+2].q);
  // 가벼운 소품용 원본의 과도한 손목 플릭을 중갑 장갑의 12도 범위로 제한한다.
  const handAxis=V([0,1,0]).applyQuaternion(actualHandQ),forearm=wrist.clone().sub(elbow).normalize(),bend=handAxis.angleTo(forearm);
  if(bend>Math.PI/15)actualHandQ.premultiply(new T.Quaternion().slerp(align(handAxis,forearm),1-(Math.PI/15)/bend));
  bones[i+2].quaternion.copy(actualHandQ).multiply(rests[2][j+2].q.clone().invert()).multiply(corrections[c+1]);
  const hand=hands[right?0:1];hand.position.copy(wrist);hand.quaternion.copy(actualHandQ);
  if(right){
   const bladeQ=actualHandQ.clone();
   const grip=wrist.clone().add(V([-.025,.076,0]).applyQuaternion(actualHandQ));set(16,grip,bladeQ);
  }else{
   // 방패 면과 손잡이를 같은 아래팔 좌표계에 붙인다.
   const shieldQ=actualHandQ.clone().multiply(shieldSocket);
   const grip=wrist.clone().add(V([.025,.076,0]).applyQuaternion(actualHandQ));set(13,grip.add(V(SHIELD_REST_NORMAL).multiplyScalar(-.09).applyQuaternion(shieldQ)),shieldQ);
  }
  const leg=right?9:11,k=right?11:14,l=right?4:6,hip=pelvis.clone().add(H(s).sub(V([0,.8,0])).applyQuaternion(p[0].q));
  const thighQ=p[k].q.clone().multiply(corrections[l]),calfQ=p[k+1].q.clone().multiply(corrections[l+1]);
  const knee=hip.clone().add(K(s).sub(H(s)).applyQuaternion(thighQ)),foot=knee.clone().add(F(s).sub(K(s)).applyQuaternion(calfQ));
  set(leg,hip,thighQ);set(leg+1,knee,calfQ);set(right?14:15,foot,p[k+2].q);
 }
 // 쓰러진 자세에서는 발뿐 아니라 몸통·머리도 지면을 지지한다.
 const lift=-Math.min(bones[14].position.y-.08,bones[15].position.y-.08,bones[0].position.y-.17,bones[8].position.y-.15,bones[7].position.y-.12);
 bones.forEach(b=>b.position.y+=lift);hands.forEach(h=>h.position.y+=lift);
 return {bones,hands,tip:V([0,0,.87]).applyQuaternion(bones[16].quaternion).add(bones[16].position),grip:bones[16].position.clone(),shield:bones[13].position.clone(),normal:V(SHIELD_REST_NORMAL).negate().applyQuaternion(bones[13].quaternion).normalize()};
}
export function poseAuthoredKnight(rig:AuthoredRig,p:Pose){
 const f=knightTransforms(p);
 f.bones.forEach((b,i)=>{rig.bones[i].position.copy(b.position);rig.bones[i].quaternion.copy(b.quaternion);});
 f.hands.forEach((h,i)=>{rig.hands[i].position.copy(h.position);rig.hands[i].quaternion.copy(h.quaternion);});
 rig.sword.position.copy(f.bones[16].position);rig.sword.quaternion.copy(f.bones[16].quaternion);
 rig.shield.position.copy(f.bones[13].position);rig.shield.quaternion.copy(f.bones[13].quaternion);
 rig.mesh.updateMatrixWorld(true);return f;
}

const impactSamples=[.47,.50,.47];
const atTimes=[1.62,3.82,6.02];
export const AUTHORED_CONTACT_TIMES=atTimes;
export const AUTHORED_DUEL_DURATION=DUEL_DURATION;
export const DEATH_START=6.1;
// 다리가 내려오는 원본 동작까지 재생한 뒤 자세를 유지한다.
// 이후에는 몸 전체를 추가 회전하거나 들어 올리지 않고 먼지만 움직인다.
export const DEATH_LAND_SAMPLE=clips.Death01.duration;
export const DEATH_LANDED_AT=DEATH_START+DEATH_LAND_SAMPLE/1.15;
export const ASH_START=8.6;
export const ASH_DURATION=2.3;
/** 접촉 계산은 발 디딜 위치와 몸의 방향만 정한다. 팔꿈치·손목 회전을 강제로 꺾지 않는다. */
const plans=atTimes.map((at,n)=>{
 const a=knightTransforms(combatPose(at,'attack',impactSamples[n],n===1)),b=knightTransforms(combatPose(at,'block',.22));
 const target=n===2?b.bones[1].position:b.shield;
 const point=a.grip.clone().lerp(a.tip,.65),targetX=-target.x;
 const yaw=Math.asin(T.MathUtils.clamp(targetX/Math.hypot(point.x,point.z),-.95,.95))-Math.atan2(point.x,point.z);
 const rotated=point.clone().applyAxisAngle(V([0,1,0]),yaw);
 // 칼날 중간점만 맞추면 비스듬한 검 끝이 방패 안에 들어간다.
 // 전체 날의 접촉 거리만큼 접근을 줄이고 남은 오차는 실제 장비 충돌로 보정한다.
 return {yaw,distance:rotated.z+target.z+[.364,.349,.635][n]};
});
export function sampleAuthoredDuel(seconds:number,first:0|1=0,winner:0|1=first){
 const time=T.MathUtils.clamp(seconds,0,AUTHORED_DUEL_DURATION),poses:[Pose,Pose]=[combatPose(time),combatPose(time)],roots=[V([-.9,0,0]),V([.9,0,0])],yaws=[Math.PI/2,-Math.PI/2];
 let phase='방패를 세우고 상대를 살핍니다',impact=0,striker=first,blocked=true;
 for(let n=0;n<3;n++){
  const at=atTimes[n],lead=.76,recovery=.84,dt=time-at;
  if(dt< -lead||dt>recovery)continue;
  striker=(n===2?winner:((n===1?1:0)^first)) as 0|1;const defender=1-striker;
  const wind=smooth((dt+lead)/lead),release=smooth((dt-.15)/.69),strength=wind*(1-release),hit=impactSamples[n];
  blocked=n<2;
  // 제작된 준비 동작을 읽고, 막힌 베기는 접촉 프레임에서 멈춘 뒤 되튕긴다.
  // 명중 뒤에도 칼을 자기 방패 안으로 끝까지 휘두르지 않고 같은 궤도로 회수한다.
  const clipTime=dt<=0?hit*(dt+lead)/lead:hit-.025*smooth(dt/.12);
  poses[striker]=mix(combatPose(time,'attack',clipTime,n===1),combatPose(time),release);
  const braceTime=dt<0?.22*smooth((dt+lead-.08)/.35):.22+Math.min(.18,dt);
  if(blocked)poses[defender]=mix(combatPose(time,'block',braceTime),combatPose(time),release);
  else{
   poses[defender]=dt>=0?combatPose(time,'hit',dt):combatPose(time);
   const guard=combatPose(time),lower=sample('Sword_Attack',0),open=wind*(1-release);
   for(const i of [8,9,10])poses[defender][i]={p:guard[i].p.clone().lerp(lower[i].p,open),q:guard[i].q.clone().slerp(lower[i].q,open)};
  }
  yaws[striker]+=plans[n].yaw*strength;
  roots[striker].x+=(striker===0?1:-1)*(1.8-plans[n].distance)*strength;
  if(n===2)roots[striker].x-=(striker===0?1:-1)*.16*smooth(dt/.16)*(1-release);
  impact=dt>=0&&dt<.08?1-dt/.08:0;
  phase=dt<-.2?'어깨와 몸통을 돌려 베기를 준비합니다':dt<0?n===1?'옆으로 베어 방패를 겨눕니다':'앞발에 체중을 실어 내려 벱니다':dt<.15?blocked?'방패에 막힌 칼날이 되튕깁니다':'공격을 받은 쪽이 몸을 접어 충격을 받습니다':'방패를 유지하며 검을 회수합니다';
  break;
 }
 const loser=(1-winner) as 0|1,deathTime=Math.max(0,time-DEATH_START);
 if(time>=DEATH_START){
  const fallen=sample('Death01',Math.min(DEATH_LAND_SAMPLE,deathTime*1.15));
  poses[loser]=mix(poses[loser],fallen,smooth(deathTime/.32));
  // 쓰러질 때 검 팔을 몸 바깥으로 열어 방패와 칼을 겹쳐 쥐지 않는다.
  const spread=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0).applyQuaternion(poses[loser][2].q),-.45*smooth(deathTime/.24));
  for(const j of [5,6,7])poses[loser][j].q.premultiply(spread);
  phase=time<ASH_START?'치명상을 입은 병사가 힘을 잃고 쓰러집니다':time<ASH_START+ASH_DURATION?'몸과 장비가 재처럼 부서져 바람에 흩어집니다':'먼지가 사라지고 승자가 남습니다';
 }
 return {poses,roots,yaws,phase,impact,striker,blocked,loser,deathTime,ash:T.MathUtils.clamp((time-ASH_START)/ASH_DURATION,0,1)};
}
