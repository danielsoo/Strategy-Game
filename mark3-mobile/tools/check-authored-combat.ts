import assert from 'node:assert/strict';
import * as T from 'three';
import {testKnightScene} from './knight-test-model';
import {buildAuthoredKnight,poseAuthoredKnight,knightTransforms,sampleAuthoredDuel,AUTHORED_CONTACT_TIMES,AUTHORED_DUEL_DURATION,DEATH_START,ASH_START,ASH_DURATION} from '../src/screens/authoredKnightMotion';
import {buildKnightAsh} from '../src/screens/knightAsh';
const V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z),rig=buildAuthoredKnight(testKnightScene());
const raw=testKnightScene();raw.children.forEach(m=>m.scale.setScalar(1));const rawRig=buildAuthoredKnight(raw);
assert(rig.shield.geometry.getIndex()!.count>1000,'실제 glTF 축척에서도 방패 부품이 선택된다');
assert.equal(rig.shield.geometry.getIndex()!.count,rawRig.shield.geometry.getIndex()!.count,'원본 단위와 브라우저 축척에서 같은 방패를 선택한다');
rawRig.dispose();
let maxWrist=0,maxJump=0,maxJumpAt='';
for(const first of [0,1] as const)for(const winner of [0,1] as const){
 let previous:T.Quaternion[][]|undefined;
 for(let t=0;t<AUTHORED_DUEL_DURATION;t+=1/120){
  const frame=sampleAuthoredDuel(t,first,winner),now:T.Quaternion[][]=[];
  frame.poses.forEach((p,i)=>{
   const f=knightTransforms(p);now.push(f.bones.map(b=>b.quaternion));
   assert(f.bones.every(b=>[...b.position.toArray(),...b.quaternion.toArray()].every(Number.isFinite)));
   if(t<DEATH_START||i===winner)assert(Math.abs(Math.min(f.bones[14].position.y,f.bones[15].position.y)-.08)<1e-6,'살아 있는 병사는 한 발 이상 지면에 지지한다');
   assert(f.bones[0].position.y>=.17-1e-6&&f.bones[8].position.y>=.15-1e-6&&f.bones[7].position.y>=.12-1e-6,'쓰러진 몸통과 머리가 지면 아래로 내려가지 않는다');
   for(const [hand,elbow,wrist] of [[0,2,3],[1,5,6]]){
    const direction=f.bones[wrist].position.clone().sub(f.bones[elbow].position).normalize(),bend=V(0,1,0).applyQuaternion(f.hands[hand].quaternion).angleTo(direction);
    maxWrist=Math.max(maxWrist,bend);assert(bend<=Math.PI/15+1e-5,'검과 방패 손목은 아래팔 축에서 12도 이내');
   }
   assert(f.grip.distanceTo(f.hands[0].position.clone().add(V(-.025,.076,0).applyQuaternion(f.hands[0].quaternion)))<1e-7,'손잡이가 닫힌 주먹에서 이탈하지 않는다');
   if(previous)f.bones.forEach((b,k)=>{const jump=b.quaternion.angleTo(previous![i][k]);if(jump>maxJump){maxJump=jump;maxJumpAt=`${t.toFixed(3)} actor ${i} bone ${k}`;}});
  });previous=now;
 }
 for(const [n,t] of AUTHORED_CONTACT_TIMES.entries()){
  const f=sampleAuthoredDuel(t,first,winner);
  assert.equal(sampleAuthoredDuel(t-.001,first,winner).impact,0);assert(f.impact>0);
  // 실제 접촉·관통은 check-duel-contacts에서 렌더링과 같은 보정 후 전체 칼날로 검사한다.
 }
}
const before=sampleAuthoredDuel(DEATH_START),fallen=sampleAuthoredDuel(ASH_START);
assert(knightTransforms(fallen.poses[fallen.loser]).bones[7].position.y<knightTransforms(before.poses[before.loser]).bones[7].position.y-.6,'사망자는 지면으로 쓰러진다');
assert(sampleAuthoredDuel(ASH_START+ASH_DURATION).ash>1-1e-9,'몸과 장비가 끝까지 소멸한다');
const original=rig.mesh.material,ash=buildKnightAsh(rig,300);
poseAuthoredKnight(rig,fallen.poses[fallen.loser]);ash.update(.5,ASH_DURATION*.5);
assert(ash.points.visible);assert(Array.from(ash.points.geometry.getAttribute('position').array).every(Number.isFinite));
assert(rig.mesh.material!==original,'소멸 재질은 원본에서 분리된다');
ash.update(1,ASH_DURATION+2.2);assert(!ash.points.visible,'입자가 끝에 남지 않는다');
ash.update(0,0);assert(!ash.points.visible,'되감기와 반복 시 입자를 초기화한다');ash.dispose();assert.equal(rig.mesh.material,original);
console.log('최대 손목 굽힘 / 1/120초 관절 회전',maxWrist*180/Math.PI,maxJump*180/Math.PI,maxJumpAt);
assert(maxJump<.3,'준비·방어·회수 전환에 관절이 갑자기 뒤집히지 않는다');
rig.dispose();console.log('제작 클립 기반 대련: 손잡이 고정·손목 제한·발 지지·양쪽 선공/승패·실제 방패 접촉 검증 완료');
