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
import {sampleDuel,CONTACT_TIMES,DUEL_DURATION,localToWorld,worldToLocal,jointIK} from '../src/screens/duelMotion';
import {buildKnightRig,poseKnight} from '../src/screens/knightRig';
import {testKnightScene} from './knight-test-model';
const rig=buildKnightRig(testKnightScene());
for(const first of [0,1] as const)for(const [n,t] of CONTACT_TIMES.entries()){
 const frame=sampleDuel(t,first),striker=((n===1?1:0)^first),receiver=1-striker;
 const a=frame.fighters[striker],b=frame.fighters[receiver];
 assert.equal(sampleDuel(t-.001,first).impact,0,'접촉 전에는 불꽃을 내지 않는다');
 assert(frame.impact>0,'접촉 프레임에만 충돌을 낸다');
 assert(sampleDuel(t+.12,first).fighters[receiver].reaction>0,'맞은 쪽이 접촉 후에 반응한다');
 assert(new THREE.Vector3(...localToWorld(a.tip,a)).distanceTo(new THREE.Vector3(...frame.contact))<.001,'검 끝 표적과 방어자 접촉점이 일치한다');
 const toward=new THREE.Vector3(...b.root).sub(new THREE.Vector3(...a.root)).normalize();
 assert(toward.dot(new THREE.Vector3(Math.sin(a.yaw),0,Math.cos(a.yaw)))>.99,'공격자는 상대를 정면으로 바라본다');
 poseKnight(rig,a);rig.mesh.skeleton.update();
 const point=new THREE.Vector3(),g=rig.mesh.geometry,idx=g.getAttribute('skinIndex');let nearest=Infinity;
 for(let i=0;i<idx.count;i++)if(idx.getX(i)===3){rig.mesh.getVertexPosition(i,point);nearest=Math.min(nearest,point.distanceTo(new THREE.Vector3(...a.tip)));}
 assert(nearest<.035,`실제 변형된 검도 표적에 도달해야 한다: ${n}, 오차 ${nearest}`);
 if(n<2){poseKnight(rig,b);rig.mesh.skeleton.update();const target=worldToLocal(frame.contact,b),ray=new THREE.Raycaster(new THREE.Vector3(target[0],target[1],2),new THREE.Vector3(0,0,-1));const contact=ray.intersectObject(rig.mesh)[0];assert(contact&&contact.point.distanceTo(new THREE.Vector3(...target))<.035,'방패 표면과 불꽃 위치가 일치한다');}
}
for(let t=0;t<=DUEL_DURATION;t+=1/60){const frame=sampleDuel(t);for(const a of frame.fighters){poseKnight(rig,a);assert(a.crouch<.1,'허리를 크게 꺾지 않는다');for(const foot of a.feet)assert(foot[1]>=.08-1e-6,'발목이 바닥을 뚫지 않는다');assert(rig.bones.every(b=>[...b.position.toArray(),...b.quaternion.toArray()].every(Number.isFinite)));}}
const joint=jointIK([0,0,0],[.35,.1,0],[0,1,0],.263,.251);
assert(Math.abs(new THREE.Vector3(...joint).length()-.263)<1e-5);
assert(Math.abs(new THREE.Vector3(...joint).distanceTo(new THREE.Vector3(.35,.1,0))-.251)<1e-5);
rig.dispose();
console.log('양쪽 선공·정면 표적·실제 스키닝된 검/방패 접촉·후행 반응·관절 길이 검증 통과');
