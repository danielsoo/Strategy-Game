import assert from 'node:assert/strict';
import * as T from 'three';
import {testKnightScene} from './knight-test-model';
import {buildAuthoredKnight,poseAuthoredKnight,knightTransforms,sampleAuthoredDuel,AUTHORED_CONTACT_TIMES,AUTHORED_DUEL_DURATION} from '../src/screens/authoredKnightMotion';
const V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z),rig=buildAuthoredKnight(testKnightScene());
const raw=testKnightScene();raw.children.forEach(m=>m.scale.setScalar(1));const rawRig=buildAuthoredKnight(raw);
assert(rig.shield.geometry.getIndex()!.count>1000,'실제 glTF 축척에서도 방패 부품이 선택된다');
assert.equal(rig.shield.geometry.getIndex()!.count,rawRig.shield.geometry.getIndex()!.count,'원본 단위와 브라우저 축척에서 같은 방패를 선택한다');
rawRig.dispose();
let maxWrist=0,maxJump=0;
for(const first of [0,1] as const)for(const winner of [0,1] as const){
 let previous:T.Quaternion[][]|undefined;
 for(let t=0;t<AUTHORED_DUEL_DURATION;t+=1/120){
  const frame=sampleAuthoredDuel(t,first,winner),now:T.Quaternion[][]=[];
  frame.poses.forEach((p,i)=>{
   const f=knightTransforms(p);now.push(f.bones.map(b=>b.quaternion));
   assert(f.bones.every(b=>[...b.position.toArray(),...b.quaternion.toArray()].every(Number.isFinite)));
   assert(Math.abs(Math.min(f.bones[14].position.y,f.bones[15].position.y)-.08)<1e-6,'한 발 이상 지면에 지지한다');
   for(const [hand,elbow,wrist] of [[0,2,3],[1,5,6]]){
    const direction=f.bones[wrist].position.clone().sub(f.bones[elbow].position).normalize(),bend=V(0,1,0).applyQuaternion(f.hands[hand].quaternion).angleTo(direction);
    maxWrist=Math.max(maxWrist,bend);assert(bend<=Math.PI/15+1e-5,'검과 방패 손목은 아래팔 축에서 12도 이내');
   }
   assert(f.grip.distanceTo(f.hands[0].position.clone().add(V(-.025,.076,0).applyQuaternion(f.hands[0].quaternion)))<1e-7,'손잡이가 닫힌 주먹에서 이탈하지 않는다');
   if(previous)f.bones.forEach((b,k)=>{maxJump=Math.max(maxJump,b.quaternion.angleTo(previous![i][k]));});
  });previous=now;
 }
 for(const [n,t] of AUTHORED_CONTACT_TIMES.entries()){
  const f=sampleAuthoredDuel(t,first,winner),a=knightTransforms(f.poses[f.striker]),defender=1-f.striker,b=poseAuthoredKnight(rig,f.poses[defender]);rig.mesh.skeleton.update();
  assert.equal(sampleAuthoredDuel(t-.001,first,winner).impact,0);assert(f.impact>0);
  const point=a.grip.clone().lerp(a.tip,.65).applyAxisAngle(V(0,1,0),f.yaws[f.striker]).add(f.roots[f.striker]).sub(f.roots[defender]).applyAxisAngle(V(0,1,0),-f.yaws[defender]);
  if(n<2){const ray=new T.Raycaster(point.clone().addScaledVector(b.normal,.5),b.normal.clone().negate()),hit=ray.intersectObject(rig.shield)[0];console.log('방패 접촉 오차',first,n,hit?.point.clone().sub(point).dot(b.normal));assert(hit,'칼날 위치에 실제 방패 메시가 있다');assert(hit.point.distanceTo(point)<.03,'불꽃과 실제 방패 표면이 3cm 이내로 일치한다');}
 }
}
console.log('최대 손목 굽힘 / 1/120초 관절 회전',maxWrist*180/Math.PI,maxJump*180/Math.PI);
assert(maxJump<.3,'준비·방어·회수 전환에 관절이 갑자기 뒤집히지 않는다');
rig.dispose();console.log('제작 클립 기반 대련: 손잡이 고정·손목 제한·발 지지·양쪽 선공/승패·실제 방패 접촉 검증 완료');
