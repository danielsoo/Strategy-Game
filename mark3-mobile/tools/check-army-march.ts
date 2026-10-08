import assert from 'node:assert/strict';
import {createGameState,neighbors} from '../src/engine';
import {makeRng} from '../src/services/combatSystem';
import {buildMedievalScene} from '../src/screens/medievalScene';
import {armyFormation,armyAnchor} from '../src/screens/realmLayout';
import {createArmyMarch,sampleArmyMarch} from '../src/screens/armyMarch';
import {queueArmyEvents,ArmyEvent,visibleMoves} from '../src/screens/armyTimeline';
const state=createGameState(2,9,9,makeRng(91));
const ground=buildMedievalScene(state,0,true).ground;
const origin=ground.find(g=>g.cell.row===4&&g.cell.col===4)!;
const adjacent=neighbors(state,origin.cell).map(c=>ground.find(g=>g.cell.id===c.id)!);
let checks=0;
for(const units of [1,2,3,4,5,8])for(const castle of [false,true])for(const neutral of [undefined,'mercenary','bandit'] as const)for(const tile of adjacent){
 const from={...origin,castle,cell:{...origin.cell,units,owner:0,neutral,fortStage:0,lastFrom:undefined}};
 const to={...tile,castle,cell:{...tile.cell,units,owner:0,neutral,fortStage:0,lastFrom:from.cell.id}};
 const march=createArmyMarch(from,to),start=armyFormation(from),end=armyFormation(to);
 const points=(t:number)=>start.map((_,i)=>sampleArmyMarch(march,i,t));
 const centroid=(t:number)=>{const p=points(t);return [p.reduce((s,v)=>s+v.x,0)/p.length,p.reduce((s,v)=>s+v.z,0)/p.length]};
 for(const [t,g,slots] of [[0,from,start],[march.duration,to,end]] as const){
  const p=points(t),anchor=armyAnchor(g),center=centroid(t);
  assert(Math.hypot(center[0]-anchor[0],center[1]-anchor[1])<1e-8,'formation anchor jumped at endpoint');
  slots.forEach((slot,i)=>{
   assert(Math.hypot(p[i].x-g.position[0]-slot.x,p[i].z-g.position[2]-slot.z)<1e-8,'soldier jumped when timeline handed back to static rendering');
   assert(Math.abs(Math.sin(p[i].yaw-slot.yaw))<1e-8,'arrival changed facing');
   assert.equal(p[i].scale,slot.scale,'arrival resized soldier');
  });
 }
 // Every field-to-field leg follows the exact same centre line as PathArrow,
 // including odd/even rows and all six hex directions. Castle berth legs are
 // local to their own tile; they cannot offset the inter-tile march.
 for(let u=0;u<=1;u+=.05){
  const t=march.turnTime+(march.lengths[0]+march.lengths[1]*u)/1.15,p=centroid(t);
  const x=from.position[0]+(to.position[0]-from.position[0])*u,z=from.position[2]+(to.position[2]-from.position[2])*u;
  assert(Math.hypot(p[0]-x,p[1]-z)<1e-8,'formation drifts off tile-centre path');
 }
 let prev=points(0);
 for(let t=.01;t<march.duration;t+=.01){const p=points(t);p.forEach((v,i)=>assert(Math.hypot(v.x-prev[i].x,v.z-prev[i].z)<.13,JSON.stringify({units,castle,neutral,to:to.cell.id,t,index:i,previous:prev[i],next:v})));prev=p;}
 checks++;
}
const a={...origin,castle:false,cell:{...origin.cell,units:4,owner:0,fortStage:0}};
const b={...adjacent[0],castle:false,cell:{...adjacent[0].cell,units:4,owner:0,fortStage:0,lastFrom:a.cell.id}};
const c={...adjacent[1],castle:false,cell:{...adjacent[1].cell,units:4,owner:0,fortStage:0,lastFrom:b.cell.id}};
const event=(from:typeof a,to:typeof a,start:number):ArmyEvent=>{const march=createArmyMarch(from,to);return {from,to,track:{from:from.position,to:to.position,start,duration:march.duration,battle:false,march}}};
const first=event(a,b,0),second=event(b,c,.2),queue=queueArmyEvents([first],[second],.2);
assert.equal(queue.length,2,'new order cancelled unfinished movement');
assert.equal(queue[1].track.start,first.track.duration,'next leg skipped the intermediate tile centre');
for(let i=0;i<first.track.march!.from.length;i++){
 const end=sampleArmyMarch(first.track.march!,i,first.track.duration),begin=sampleArmyMarch(queue[1].track.march!,i,0);
 assert(Math.hypot(end.x-begin.x,end.z-begin.z)<1e-8,'queued movement jumped at a tile centre');
}
const unrelated=event(c,a,.2);
assert.equal(queueArmyEvents([first],[unrelated],.2)[1].track.start,.2,'unrelated army waits for another army');
const before=[a,{...b,cell:{...b.cell,units:0}}],after=[{...a,cell:{...a.cell,units:0}},b];
assert.equal(visibleMoves(before,after).length,1);
assert.equal(visibleMoves(after,after).length,0);
assert.equal(visibleMoves(before,after.map(g=>g.cell.id===b.cell.id?{...g,seen:false}:g)).length,0);
console.log(`${checks} formations: tile centres, six directions, castle berths, endpoint continuity, queued moves and visibility PASS`);
