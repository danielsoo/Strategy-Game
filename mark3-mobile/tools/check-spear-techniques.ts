import assert from 'node:assert/strict';
import * as T from 'three';
import {exampleBattle} from '../src/screens/battleExamples';
import {fighterPose} from '../src/screens/battleMotion';
import {knightTransforms} from '../src/screens/authoredKnightMotion';
import {SPEAR_TECHNIQUES,assignSpearTechniques,SpearTechnique} from '../src/screens/spearTechniques';
import type {Exchange} from '../src/screens/battleReplay';
const plan=exampleBattle(7),actor=plan.actors[0];
const paths=new Map<string,T.Vector3[]>();
for(const technique of Object.keys(SPEAR_TECHNIQUES) as SpearTechnique[]){
 const exchange:Exchange={at:2,attacker:0,target:1,defense:'dodge',fatal:false,spearTechnique:technique};
 const points:T.Vector3[]=[];
 for(let phase=-.60;phase<=.40;phase+=.02){
  const f=knightTransforms(fighterPose(actor,2+phase/1.35,{role:'attack',exchange},false));
  const axis=new T.Vector3(0,0,1).applyQuaternion(f.bones[16].quaternion);
  points.push(f.bones[16].position.clone().addScaledVector(axis,1.4));
  for(const [side,i] of [2,5].entries())assert(f.hands[side].position.clone().sub(f.bones[i].position).angleTo(new T.Vector3(0,1,0).applyQuaternion(f.hands[side].quaternion))<.35,'variant twists the wrist');
 }
 paths.set(technique,points);
}
let minimumDifference=Infinity;
for(const [a,pa] of paths)for(const [b,pb] of paths)if(a<b){
 const difference=Math.sqrt(pa.reduce((s,p,i)=>s+p.distanceToSquared(pb[i]),0)/pa.length);
 minimumDifference=Math.min(minimumDifference,difference);assert(difference>.10,'two spear techniques share the same path: '+a+' / '+b);
}
const exchanges:Exchange[]=[
 {at:1,attacker:0,target:1,defense:'parry',fatal:false},
 {at:2,attacker:0,target:1,defense:'dodge',fatal:false},
 {at:3,attacker:1,target:0,defense:'parry',fatal:false},
 {at:4,attacker:0,target:1,defense:'hit',fatal:false,counterOf:3},
];
assignSpearTechniques(plan.actors,exchanges);
assert.equal(exchanges[1].spearTechnique,'disengage');assert.equal(exchanges[3].spearTechnique,'beat-riposte');
const observed=new Set([7,10].flatMap(i=>exampleBattle(i).exchanges.map(e=>e.spearTechnique).filter(Boolean)));
assert(observed.size===5,'actual battles do not exercise all spear attacks');
assert.deepEqual(exampleBattle(7),plan,'technique selection is not deterministic');
console.log({techniques:[...observed],minimumTipPathRms:minimumDifference,contextSensitive:true});
