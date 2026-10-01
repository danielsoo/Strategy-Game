import * as T from 'three';
import {ConvexHull} from 'three/examples/jsm/math/ConvexHull';
import {AuthoredRig,poseAuthoredKnight,sampleAuthoredDuel} from './authoredKnightMotion';

export type ContactFrame=ReturnType<typeof sampleAuthoredDuel>;
/** 실제로 그리는 정점만 사용한다. 삭제한 원본 검·손 정점은 검사하지 않는다. */
export function buildDuelContacts(rig:AuthoredRig){
 const parts:{mesh:T.Mesh;ids:number[]}[]=[];
 rig.mesh.traverse(o=>{if(!(o as T.Mesh).isMesh)return;const mesh=o as T.Mesh,p=mesh.geometry.getAttribute('position'),index=mesh.geometry.getIndex();
  const seen=new Set<string>(),ids:number[]=[];
  for(const i of new Set(index?Array.from(index.array):Array.from({length:p.count},(_,i)=>i))){
   const key=`${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;if(!seen.has(key)){seen.add(key);ids.push(i);}
  }parts.push({mesh,ids});
 });
 const shieldPoints=parts.find(p=>p.mesh===rig.shield)!.ids.map(i=>new T.Vector3().fromBufferAttribute(rig.shield.geometry.getAttribute('position'),i));
 const hull=new ConvexHull().setFromPoints(shieldPoints),planes=hull.faces.map(f=>new T.Plane(f.normal.clone(),-f.constant));
 const inverse=new T.Matrix4(),relative=new T.Matrix4(),point=new T.Vector3();
 return {parts,planes,
  groundLift:(root:T.Vector3,yaw:number,height:(x:number,z:number)=>number)=>{
   rig.mesh.updateMatrixWorld(true);rig.mesh.skeleton.update();inverse.copy(rig.mesh.matrixWorld).invert();let lift=-Infinity;
   const c=Math.cos(yaw),s=Math.sin(yaw);
   for(const part of parts){relative.multiplyMatrices(inverse,part.mesh.matrixWorld);for(const id of part.ids){
    part.mesh.getVertexPosition(id,point);point.applyMatrix4(relative);
    const x=root.x+point.x*c+point.z*s,z=root.z-point.x*s+point.z*c;
    lift=Math.max(lift,height(x,z)+.006-(root.y+point.y));
   }}return lift;
  }
 };
}
export type DuelContacts=ReturnType<typeof buildDuelContacts>;
/** 방패의 실제 두께를 가진 볼록 다면체. 끝점 사이가 방패를 뚫는 경우도 검출한다. */
export function segmentShield(a:T.Vector3,b:T.Vector3,planes:T.Plane[],padding=.014){
 let enter=0,exit=1;
 for(const plane of planes){const da=plane.distanceToPoint(a)-padding,db=plane.distanceToPoint(b)-padding;
  if(da>0&&db>0)return null;
  if(da<=0&&db<=0)continue;
  const t=da/(da-db);if(da>0)enter=Math.max(enter,t);else exit=Math.min(exit,t);if(enter>exit)return null;
 }return enter;
}
const bladeSamples=[[-.035,0,.085],[.035,0,.085],[-.025,0,.58],[.025,0,.58],[-.02,0,.75],[.02,0,.75],[0,0,.87]];
/** 칼날 양쪽 날과 가운데 선분을 모두 검사한다. */
export function bladeShield(rig:AuthoredRig,shield:AuthoredRig,shape:DuelContacts,padding=.014){
 const inverse=new T.Matrix4().copy(shield.shield.matrixWorld).invert().multiply(rig.sword.matrixWorld),points=bladeSamples.map(p=>new T.Vector3().fromArray(p).applyMatrix4(inverse));
 for(const [a,b] of [[0,2],[2,4],[4,6],[1,3],[3,5],[5,6],[0,1],[2,3],[4,5]]){
  const t=segmentShield(points[a],points[b],shape.planes,padding);if(t!==null)return points[a].clone().lerp(points[b],t).applyMatrix4(shield.shield.matrixWorld);
 }return null;
}
function armorSpheres(rig:AuthoredRig){
 return [[8,0,.17],[0,.25,.205],[7,.07,.135]].map(([bone,dy,radius])=>({center:new T.Vector3(0,dy,0).applyMatrix4(rig.bones[bone].matrixWorld),radius:radius*rig.mesh.getWorldScale(new T.Vector3()).x}));
}
/** 상대의 흉갑·골반·투구를 감싼 보호 부피. 마지막 타격도 갑옷 표면에서 멈춘다. */
function weaponArmor(attacker:AuthoredRig,defender:AuthoredRig,shape:DuelContacts){
 const a=new T.Vector3(0,0,.085).applyMatrix4(attacker.sword.matrixWorld),b=new T.Vector3(0,0,.87).applyMatrix4(attacker.sword.matrixWorld),line=new T.Line3(a,b),inverse=new T.Matrix4().copy(attacker.shield.matrixWorld).invert();
 const scale=attacker.mesh.getWorldScale(new T.Vector3()).x;
 for(const sphere of armorSpheres(defender)){
  const closest=line.closestPointToPoint(sphere.center,true,new T.Vector3());if(closest.distanceTo(sphere.center)<sphere.radius+.025*scale)return closest;
  const local=sphere.center.clone().applyMatrix4(inverse);
  if(segmentShield(local,local,shape.planes,sphere.radius/scale+.01)!==null)return sphere.center;
 }return null;
}
/** 팔·손목을 꺾지 않고 두 사람의 간격으로 상대 장비 관통을 막는다. */
export function resolveDuelContacts(rigs:AuthoredRig[],shapes:DuelContacts[],frame:ContactFrame,height:(x:number,z:number)=>number){
 const groups=rigs.map(r=>r.mesh.parent as T.Group),update=(i:number)=>{groups[i].position.copy(frame.roots[i]);groups[i].rotation.y=frame.yaws[i];groups[i].updateMatrixWorld(true);};
 rigs.forEach((r,i)=>{poseAuthoredKnight(r,frame.poses[i]);update(i);});
 rigs.forEach((r,i)=>{frame.roots[i].y+=shapes[i].groundLift(frame.roots[i],frame.yaws[i],height);update(i);});
 // 칼이 방패의 두께를 통과하는 접근·접촉·회수 전 구간을 보정한다.
 const active=frame.striker,away=active===0?-1:1;
 const overlap=()=>bladeShield(rigs[0],rigs[1],shapes[1])||bladeShield(rigs[1],rigs[0],shapes[0])||weaponArmor(rigs[0],rigs[1],shapes[0])||weaponArmor(rigs[1],rigs[0],shapes[1]);
 let contact=overlap(),offset=0;
 for(let pass=0;pass<4&&overlap();pass++){
  const start=frame.roots[active].x;let lastHit=overlap();
  let hi=.04;while(hi<1.2){frame.roots[active].x=start+away*hi;update(active);if(!overlap())break;hi+=.04;}
  let lo=Math.max(0,hi-.04);for(let j=0;j<10;j++){const mid=(lo+hi)/2;frame.roots[active].x=start+away*mid;update(active);const p=overlap();if(p){lo=mid;lastHit=p;}else hi=mid;}
  offset+=hi;frame.roots[active].x=start+away*hi;update(active);contact=lastHit;
  frame.roots[active].y+=shapes[active].groundLift(frame.roots[active],frame.yaws[active],height);update(active);
 }
 return {contact,offset};
}
