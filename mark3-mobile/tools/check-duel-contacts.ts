import assert from 'node:assert/strict';
import * as T from 'three';
import {buildAuthoredKnight,sampleAuthoredDuel,AUTHORED_DUEL_DURATION,DEATH_LANDED_AT} from '../src/screens/authoredKnightMotion';
import {buildDuelContacts,resolveDuelContacts,bladeShield} from '../src/screens/duelContacts';
import {testKnightScene} from './knight-test-model';
import {campaignSurface} from '../src/screens/campaignTerrain';
import {createGameState} from '../src/engine';
import {makeRng} from '../src/services/combatSystem';
import {buildMedievalScene} from '../src/screens/medievalScene';
const ground=buildMedievalScene(createGameState(2,9,9,makeRng(947)),0,true).ground,surface=campaignSurface(ground,18),vertices=surface.geometry.getAttribute('position'),indices=surface.geometry.getIndex()!;
let terrainError=0;
for(let i=0;i<indices.count;i+=291){const p=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(vertices,indices.getX(i+j))),center=p[0].multiplyScalar(.2).addScaledVector(p[1],.3).addScaledVector(p[2],.5);terrainError=Math.max(terrainError,Math.abs(center.y-surface.field.surfaceHeight(center.x,center.z)));}
assert(terrainError<.00001,'지면 접촉 높이가 실제 렌더링된 삼각형과 일치한다');surface.geometry.dispose();
const rigs=[buildAuthoredKnight(testKnightScene()),buildAuthoredKnight(testKnightScene())],shapes=rigs.map(buildDuelContacts),groups=rigs.map(r=>{const g=new T.Group();g.add(r.mesh);return g;});
let hit=0,maxOffset=0,maxJump=0,worst='',minGap=Infinity,maxRestDrift=0;const start=performance.now();
for(const first of [0,1] as const)for(const winner of [0,1] as const){
 let previous:T.Vector3[]|undefined;
 let resting:number[]|undefined;
 const terrain=(x:number,z:number)=>.045*Math.sin(x*2)+.025*Math.sin(z*4);
 for(let t=0;t<=AUTHORED_DUEL_DURATION;t+=1/120){
  const frame=sampleAuthoredDuel(t,first,winner),r=resolveDuelContacts(rigs,shapes,frame,terrain);maxOffset=Math.max(maxOffset,r.offset);
  if(t>=DEATH_LANDED_AT){
   const dead=rigs[frame.loser],now=[...dead.bones,...shapes[frame.loser].parts.map(p=>p.mesh)].flatMap(o=>o.matrixWorld.elements);
   if(resting)now.forEach((v,i)=>{maxRestDrift=Math.max(maxRestDrift,Math.abs(v-resting![i]));});
   else resting=now;
   assert.equal(dead.mesh.rotation.x,0,'착지한 몸을 추가 회전해서 들어 올리지 않는다');
  }
  for(let i=0;i<2;i++){
   for(const target of [i,1-i])if(bladeShield(rigs[i],rigs[target],shapes[target],0)){hit++;if(hit<10)console.log('overlap',t,i,target);}
   const gap=-shapes[i].groundLift(frame.roots[i],frame.yaws[i],terrain);minGap=Math.min(minGap,gap);assert(gap>-.00001,'갑옷·손·무기 실제 정점이 지형 아래로 내려가지 않는다');
   if(previous){const jump=frame.roots[i].distanceTo(previous[i]);if(jump>maxJump){maxJump=jump;worst=`${t} actor ${i}`;}}
  }previous=frame.roots.map(p=>p.clone());
 }
}
for(const t of [1.62,3.82]){const f=sampleAuthoredDuel(t),r=resolveDuelContacts(rigs,shapes,f,()=>0);assert(r.contact,'방어 타격이 실제 방패의 충돌 표면에 닿는다');}
// 실제 전략 지도에서 쓰는 축척과 회전에서도 로컬/월드 공간을 혼동하지 않는다.
const world=new T.Group();world.position.set(2,.32,-4);world.rotation.y=.8;world.scale.setScalar(.17);groups.forEach(g=>world.add(g));world.updateMatrixWorld(true);
for(const t of [0,1.60,1.62,1.68,3.82,6.02,6.35,7,8.6,10]){
 const f=sampleAuthoredDuel(t,1,0),terrain=(x:number,z:number)=>.05*Math.sin(x+z);
 resolveDuelContacts(rigs,shapes,f,terrain);
 for(let i=0;i<2;i++){
  assert(!bladeShield(rigs[i],rigs[1-i],shapes[1-i],0),'맵 축척에서도 칼날 관통이 없다');
  assert(shapes[i].groundLift(f.roots[i],f.yaws[i],terrain)<1e-6,'맵 축척에서도 장비가 지면 위에 있다');
 }
}
console.log({hit,maxOffset,maxJump,worst,minGap,maxRestDrift,terrainError,seconds:(performance.now()-start)/1000,supportPoints:shapes.map(s=>s.parts.reduce((n,p)=>n+p.ids.length,0))});
assert(maxRestDrift<1e-8,'착지 후 소멸이 끝날 때까지 몸·손·검·방패의 월드 자세와 높이가 유지된다');
assert.equal(hit,0,'양쪽 날과 검 끝이 자기·상대 방패를 관통하지 않는다');
assert(maxJump<.1,'접촉 보정으로 순간이동하지 않는다');rigs.forEach(r=>r.dispose());
