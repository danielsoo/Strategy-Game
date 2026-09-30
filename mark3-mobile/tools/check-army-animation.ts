import assert from 'node:assert/strict';
import {createGameState,moveStack,neighbors} from '../src/engine';
import {makeRng} from '../src/services/combatSystem';
import {buildMedievalScene} from '../src/screens/medievalScene';
import {visibleMoves,sampleTrack,ArmyTrack} from '../src/screens/armyTimeline';
const state=createGameState(2,9,9,makeRng(91));
const source=state.cells.find(c=>c.owner===0&&c.units>0)!;
const destination=neighbors(state,source).find(c=>!c.offMap)!;
destination.units=0;destination.owner=null;
const before=buildMedievalScene(state,0,true).ground.map(g=>({...g,cell:{...g.cell}}));
moveStack(source,destination);
const after=buildMedievalScene(state,0,true).ground;
assert.equal(visibleMoves(before,after).length,1,'이동 한 번은 한 번만 재생한다');
assert.equal(visibleMoves(after,after).length,0,'다시 렌더링하거나 턴을 넘겨도 과거 행군을 반복하지 않는다');
const hidden=after.map(g=>g.cell.id===destination.id?{...g,seen:false}:g);
assert.equal(visibleMoves(before,hidden).length,0,'보이지 않는 목적지를 애니메이션으로 드러내지 않는다');
const recruited=before.map(g=>g.cell.id===destination.id?{...g,cell:{...g.cell,units:1}}:g);
assert.equal(visibleMoves(before,recruited).length,0,'징병을 이동으로 해석하지 않는다');
const track:ArmyTrack={from:[0,0,0],to:[1,0,0],start:0,duration:2.8,battle:true,win:true};
assert.equal(sampleTrack(track,.3).action,'walk');
assert.equal(sampleTrack(track,1.5).action,'idle');
assert.equal(sampleTrack(track,2.8).progress,1,'승자는 목적지에 도착한다');
assert.equal(sampleTrack({...track,win:false},2.8).progress,0,'패자는 출발 위치로 물러난다');
assert.equal(sampleTrack({...track,defender:true},1.5).action,'idle','집단 전투는 개별 자유 반복 대신 대련이 담당한다');
console.log('행군 감지·반복 방지·시야 비노출·징병 구분·전투 단계 검증 통과');

import * as THREE from 'three';
import {sampleDuel,CONTACT_TIMES,DUEL_DURATION,localToWorld,worldToLocal,jointIK,solveSwordArm,SWORD_FOREARM,SWORD_REST_DIRECTION,shieldGrip,MAX_ELBOW_FLEX} from '../src/screens/duelMotion';
import {buildKnightRig,poseKnight} from '../src/screens/knightRig';
import {testKnightScene} from './knight-test-model';
const rig=buildKnightRig(testKnightScene());
for(const first of [0,1] as const)for(const [n,t] of CONTACT_TIMES.entries()){
 const frame=sampleDuel(t,first),striker=((n===1?1:0)^first),receiver=1-striker;
 const a=frame.fighters[striker],b=frame.fighters[receiver];
 assert.equal(sampleDuel(t-.001,first).impact,0,'접촉 전에는 불꽃을 내지 않는다');
 assert(frame.impact>0,'접촉 프레임에만 충돌을 낸다');
 assert(sampleDuel(t+.12,first).fighters[receiver].reaction>0,'맞은 쪽이 접촉 후에 반응한다');
 assert(new THREE.Vector3(...localToWorld(new THREE.Vector3(...a.sword).lerp(new THREE.Vector3(...a.tip),a.bladeFraction).toArray() as [number,number,number],a)).distanceTo(new THREE.Vector3(...frame.contact))<.001,'칼날 접촉 구간과 방어자 접촉점이 일치한다');
 const toward=new THREE.Vector3(...b.root).sub(new THREE.Vector3(...a.root)).normalize();
 assert(toward.dot(new THREE.Vector3(Math.sin(a.yaw),0,Math.cos(a.yaw)))>.99,'공격자는 상대를 정면으로 바라본다');
 poseKnight(rig,a);rig.mesh.skeleton.update();
 const point=new THREE.Vector3(),g=rig.mesh.geometry,idx=g.getAttribute('skinIndex');let nearest=Infinity;
 for(let i=0;i<idx.count;i++)if(idx.getX(i)===3){rig.mesh.getVertexPosition(i,point);nearest=Math.min(nearest,point.distanceTo(new THREE.Vector3(...worldToLocal(frame.contact,a))));}
 assert(nearest<.035,`실제 변형된 칼날도 표적에 도달해야 한다: ${n}, 오차 ${nearest}`);
 if(n<2){poseKnight(rig,b);rig.mesh.skeleton.update();const target=worldToLocal(frame.contact,b),normal=new THREE.Vector3(...b.shieldNormal),ray=new THREE.Raycaster(new THREE.Vector3(...target).addScaledVector(normal,1),normal.clone().negate());const contact=ray.intersectObject(rig.mesh).find(h=>rig.mesh.geometry.getAttribute('skinIndex').getX(h.face!.a)===13);assert(contact&&contact.point.distanceTo(new THREE.Vector3(...target))<.035,'방패 표면과 불꽃 위치가 일치한다');}
}
for(let t=0;t<=DUEL_DURATION;t+=1/60){const frame=sampleDuel(t);for(const a of frame.fighters){poseKnight(rig,a);assert(a.crouch<.1,'허리를 크게 꺾지 않는다');assert(Math.min(a.feet[0][1],a.feet[1][1])<.080001,'공방 중 최소 한 발은 지면에 남는다');for(const foot of a.feet)assert(foot[1]>=.08-1e-6,'발목이 바닥을 뚫지 않는다');assert(rig.bones.every(b=>[...b.position.toArray(),...b.quaternion.toArray()].every(Number.isFinite)));}}
const joint=jointIK([0,0,0],[.35,.1,0],[0,1,0],.263,.251);
assert(Math.abs(new THREE.Vector3(...joint).length()-.263)<1e-5);
assert(Math.abs(new THREE.Vector3(...joint).distanceTo(new THREE.Vector3(.35,.1,0))-.251)<1e-5);
rig.dispose();
console.log('양쪽 선공·정면 표적·실제 스키닝된 검/방패 접촉·후행 반응·관절 길이 검증 통과');

const wristRig=buildKnightRig(testKnightScene());
const neutralAngle=new THREE.Vector3(...SWORD_FOREARM).angleTo(new THREE.Vector3(...SWORD_REST_DIRECTION));
let maxFrameAngle=0,maxUpperAngle=0,maxElbowFlex=0;
for(const first of [0,1] as const)for(const winner of [0,1] as const)for(const actor of [0,1]){
 let previousRotation:THREE.Quaternion|undefined,previousUpper:THREE.Quaternion|undefined;
 for(let t=0;t<=DUEL_DURATION;t+=1/120){
 const pose=sampleDuel(t,first,winner).fighters[actor],arm=solveSwordArm(pose);
 poseKnight(wristRig,pose);
 maxElbowFlex=Math.max(maxElbowFlex,arm.flex);
 assert(arm.flex<=MAX_ELBOW_FLEX+1e-6,'팔꿈치가 허용 굽힘 범위를 넘지 않는다');
 assert(wristRig.bones[5].quaternion.angleTo(wristRig.bones[6].quaternion)<1e-6,'방패 손목도 아래팔과 독립적으로 꺾지 않는다');
 if(previousUpper)maxUpperAngle=Math.max(maxUpperAngle,previousUpper.angleTo(wristRig.bones[1].quaternion));previousUpper=wristRig.bones[1].quaternion.clone();
 assert(wristRig.bones[2].quaternion.angleTo(wristRig.bones[3].quaternion)<1e-6,'손목에 아래팔과 독립된 회전을 가하지 않는다');
 const forearm=new THREE.Vector3(...arm.hand).sub(new THREE.Vector3(...arm.elbow)),blade=new THREE.Vector3(...arm.tip).sub(new THREE.Vector3(...arm.hand));
 assert(Math.abs(forearm.angleTo(blade)-neutralAngle)<1e-6,'쥐는 각도가 동작 내내 일정하다');
 if(previousRotation)maxFrameAngle=Math.max(maxFrameAngle,previousRotation.angleTo(arm.rotation));previousRotation=arm.rotation.clone();
}
}
console.log('최대 1/120초 아래팔 회전',maxFrameAngle*180/Math.PI);
assert(maxFrameAngle<.15,'준비·타격·회수 사이에 관절 회전이 튀지 않는다');
console.log('최대 팔꿈치 굽힘 / 1/120초 위팔 회전',maxElbowFlex*180/Math.PI,maxUpperAngle*180/Math.PI);
assert(maxUpperAngle<.25,'위팔 회전축이 준비·베기·회수 사이에 뒤집히지 않는다');
const positions=wristRig.mesh.geometry.getAttribute('position'),indices=wristRig.mesh.geometry.getAttribute('skinIndex'),weights=wristRig.mesh.geometry.getAttribute('skinWeight');
let shoulderVertices=0;
for(let i=0;i<positions.count;i++){const x=Math.abs(positions.getX(i)),y=positions.getY(i);if(x>.35&&x<.50&&y>1.30&&y<1.44){shoulderVertices++;for(let j=0;j<4;j++){const bone=indices.getComponent(i,j);assert(![2,3,5,6].includes(bone)||weights.getComponent(i,j)<.001,'어깨 갑옷 바깥 끝이 아래팔/손을 따라 접히지 않는다');}}}
assert(shoulderVertices>20,'어깨 갑옷 영역의 실제 정점들을 검사한다');
wristRig.dispose();
console.log('손목 독립 회전 제거·쥐는 각도 보존·전 구간 회전 연속성 검증 통과');

// 한 장면의 접촉점만 맞추면 앞뒤 프레임의 관통과 찌르기를 놓친다.
const blockRig=buildKnightRig(testKnightScene());
for(const first of [0,1] as const)for(const n of [0,1]){
 const at=CONTACT_TIMES[n],attacker=n^first,defender=1-attacker;
 const frame=sampleDuel(at,first),a=frame.fighters[attacker],b=frame.fighters[defender];
 const blade=new THREE.Vector3(...a.tip).sub(new THREE.Vector3(...a.sword)).normalize();
 assert(Math.abs(blade.dot(new THREE.Vector3(-b.shieldNormal[0],b.shieldNormal[1],-b.shieldNormal[2])))<.005,'접촉 때 칼날이 방패 면과 나란하다');
 const earlier=sampleDuel(at-.015,first).fighters[attacker];
 const bladePoint=(p:typeof a)=>new THREE.Vector3(...localToWorld(new THREE.Vector3(...p.sword).lerp(new THREE.Vector3(...p.tip),.70).toArray() as [number,number,number],p));
 const velocity=bladePoint(a).sub(bladePoint(earlier)).normalize();
 const worldBlade=new THREE.Vector3(...localToWorld(a.tip,a)).sub(new THREE.Vector3(...localToWorld(a.sword,a))).normalize();
 assert(Math.abs(velocity.dot(worldBlade))<.35,'타격은 칼 길이 방향의 찌르기가 아니라 날을 옆으로 보내는 베기다');
 assert(new THREE.Vector3(...sampleDuel(at-.20,first).fighters[defender].shieldNormal).distanceTo(new THREE.Vector3(...b.shieldNormal))<.01,'방패를 타격 전에 세운다');
 for(let t=at-.70;t<at+.66;t+=1/120){
  const f=sampleDuel(t,first),striker=f.fighters[attacker];
  for(const target of [attacker,defender]){
   const receiver=f.fighters[target];poseKnight(blockRig,receiver);blockRig.mesh.skeleton.update();
   assert(blockRig.bones[6].position.distanceTo(new THREE.Vector3(...shieldGrip(receiver)))<1e-6,'방패 손잡이와 손이 떨어지지 않는다');
   const hand=new THREE.Vector3(...worldToLocal(localToWorld(striker.sword,striker),receiver));
   const tip=new THREE.Vector3(...worldToLocal(localToWorld(striker.tip,striker),receiver));
   const ray=new THREE.Raycaster(hand,tip.clone().sub(hand).normalize(),0,hand.distanceTo(tip));
   const hit=ray.intersectObject(blockRig.mesh).find(h=>blockRig.mesh.geometry.getAttribute('skinIndex').getX(h.face!.a)===13);
   assert(!hit,`검 선분이 ${target===attacker?'자기':'상대'} 방패를 관통한다: 선공 ${first}, 베기 ${n}, 시간 ${t-at}`);
  }
 }
}
blockRig.dispose();
console.log('양쪽 선공·칼날 횡방향 타격·선행 방어·손잡이 결합·120Hz 자기/상대 방패 관통 검사 통과');
