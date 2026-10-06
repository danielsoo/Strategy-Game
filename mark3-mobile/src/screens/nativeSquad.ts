import * as T from 'three';
import {DuelActor,DuelEvent,DuelSide,createNativeDuel} from './nativeDuel';
import {NativeClip} from './nativeCombatModels';

export const representativeCount=(troops:number)=>Math.min(3,Math.max(0,Math.floor(troops)));
export const proficiencyLabel=(rank:number)=>['일반','숙련 ★','정예 ★★','근위 ★★★'][T.MathUtils.clamp(Math.floor(rank),0,3)];
type Placement={position:T.Vector3;yaw:number};
type Engagement={start:number;enter:number;end:number;ids:[number,number];duel:ReturnType<typeof createNativeDuel>;origin:T.Vector3;yaw:number;from:Placement[];to:Placement[];finish:Placement[]};
const up=new T.Vector3(0,1,0);
const ease=(x:number)=>T.MathUtils.smoothstep(x,0,1);
const yawLerp=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const copy=(p:Placement):Placement=>({position:p.position.clone(),yaw:p.yaw});
const walk=(a:DuelActor):NativeClip=>a.fighter.weapon==='bow'?'bowWalk':['axe','halberd','spear'].includes(a.fighter.weapon)?'twoWalk':a.fighter.weapon==='sword'?'walk':'axeWalk';

/** Bounded review choreography. Outcomes are supplied, never decided by rank
 * or by how many representative meshes happen to be visible. */
export function createNativeSquad(teams:[DuelActor[],DuelActor[]],winner:DuelSide,range=6){
 const actors=teams.flat(),sides:DuelSide[]=actors.map((_,i)=>i<teams[0].length?0:1),n=teams.map(t=>t.length),ranged=teams[0][0].fighter.weapon==='bow';
 const homes:Placement[]=actors.map((a,id)=>{const side=sides[id],slot=side===0?id:id-n[0],lane=slot-(n[side]-1)/2;return {position:new T.Vector3((side===0?-1:1)*(ranged?range/2:1.6),0,lane*3.5),yaw:side===0?Math.PI/2:-Math.PI/2};});
 const last=homes.map(copy),available=actors.map(()=>0),deathAt=actors.map(()=>Infinity),deathPose=actors.map(()=>null as null|Placement),engagements:Engagement[]=[];
 function add(i:number,j:number,event:DuelEvent,earliest:number){
  const ids:[number,number]=[i,n[0]+j],pair:[DuelActor,DuelActor]=[actors[ids[0]],actors[ids[1]]];
  const duel=createNativeDuel(pair,[event],range),delta=homes[ids[1]].position.clone().sub(homes[ids[0]].position),yaw=-Math.atan2(delta.z,delta.x),origin=homes[ids[0]].position.clone().lerp(homes[ids[1]].position,.5);
  // The outnumbered soldier holds their ground while enemies take separate
  // approach directions. A single body never belongs to two engagements.
  const half=ranged?range/2:1.25;
  if(n[0]>n[1])origin.copy(homes[ids[1]].position).sub(new T.Vector3(half,0,0).applyAxisAngle(up,yaw));
  if(n[1]>n[0])origin.copy(homes[ids[0]].position).sub(new T.Vector3(-half,0,0).applyAxisAngle(up,yaw));
  const place=(side:number):Placement=>({position:pair[side].visual.position.clone().applyAxisAngle(up,yaw).add(origin),yaw:pair[side].visual.rotation.y+yaw});
  duel.update(0);const to=[place(0),place(1)],from=ids.map(id=>copy(last[id]));
  const travel=Math.max(...to.map((p,k)=>p.position.distanceTo(from[k].position))),turn=Math.max(...to.map((p,k)=>Math.abs(Math.atan2(Math.sin(p.yaw-from[k].yaw),Math.cos(p.yaw-from[k].yaw)))));
  const enter=Math.max(.32,travel/1.6,turn/2.5),start=Math.max(earliest,...ids.map(id=>available[id]));
  const end=start+enter+duel.duration;
  duel.update(duel.duration);const finish=[place(0),place(1)];ids.forEach((id,k)=>{last[id]=copy(finish[k]);available[id]=end+.08;});
  engagements.push({start,enter,end,ids,duel,origin,yaw,from,to,finish});
  if(event.outcome==='death'){const victim=ids[1-event.attacker];deathAt[victim]=start+enter+duel.events[0].contact;deathPose[victim]=copy(last[victim]);}
  return end;
 }
 let phase=0;
 // Independent pairs fight concurrently. An outnumbered target turns towards
 // each new threat; contacts sharing a defender cannot be double-booked.
 for(let round=0;round<2;round++){
  let end=phase;for(let lane=0;lane<Math.max(...n);lane++){
   const lanes=Math.max(...n)-1;
   const i=lanes?Math.round(lane*(n[0]-1)/lanes):0,j=lanes?Math.round(lane*(n[1]-1)/lanes):0,attacker=(ranged?0:round===0?(n[0]>=n[1]?0:1):(n[0]>=n[1]?1:0)) as DuelSide;
   end=Math.max(end,add(i,j,{attacker,outcome:round===0?'block':'hit',heavy:round===1},phase+lane*.23));
  }phase=end+.2;
 }
 // Example victory is explicit, as it is in the two-person review. The
 // campaign resolver remains the source of real casualties, not this demo.
 const losers=n[1-winner];for(let k=0;k<losers;k++){
  const partner=losers>1?Math.round(k*(n[winner]-1)/(losers-1)):0;
  const i=winner===0?partner:k,j=winner===1?partner:k;
  add(i,j,{attacker:winner,outcome:'death',heavy:true,jump:!ranged},phase+k*.27);
 }
 const duration=Math.max(...engagements.map(e=>e.end))+.3;
 const contacts=engagements.flatMap(e=>e.duel.events.map(v=>e.start+e.enter+v.contact)).sort((a,b)=>a-b);
 const failures=engagements.flatMap(e=>e.duel.events.filter(v=>v.outcome!=='block').map(v=>e.start+e.enter+v.contact)).sort((a,b)=>a-b);
 const shots=engagements.flatMap(e=>e.duel.events.filter(v=>v.flight>0).map(v=>e.start+e.enter+v.contact-v.flight-.001)).sort((a,b)=>a-b);
 const flights=engagements.flatMap(e=>e.duel.events.filter(v=>v.flight>0).map(v=>e.start+e.enter+v.contact-v.flight/2)).sort((a,b)=>a-b);
 const state={phase:'대형 유지 · 상대 탐색',health:[100,100],contacts:[] as {point:T.Vector3;age:number;blocked:boolean}[],alive:[n[0],n[1]]};
 function update(time:number){
  const t=T.MathUtils.clamp(time,0,duration),placements=homes.map(copy);state.contacts=[];state.health=[0,0];state.alive=[0,0];state.phase=t>=duration?`${winner===0?'아군':'적군'} 승리 · 공방 종료`:'대형 유지 · 상대 탐색';
  const engaged=new Set<number>();
  actors.forEach((a,id)=>{a.trail.visible=false;a.evaluate({clip:a.idle,time:(t+id*.39)%a.duration(a.idle)});});
  for(const e of engagements){
   if(t<e.start)continue;
   if(t>e.end)continue;
   const elapsed=t-e.start;e.ids.forEach(id=>engaged.add(id));
   if(elapsed<e.enter){
    const u=ease(elapsed/e.enter);e.ids.forEach((id,k)=>{const a=actors[id],moving=e.from[k].position.distanceTo(e.to[k].position)>.08;placements[id]={position:e.from[k].position.clone().lerp(e.to[k].position,u),yaw:yawLerp(e.from[k].yaw,e.to[k].yaw,u)};const clip=moving?walk(a):a.idle;a.evaluate({clip,time:(elapsed+id*.13)%a.duration(clip)},undefined,ease(elapsed/.18)*(1-ease((elapsed-e.enter+.18)/.18)));});state.phase=n[0]!==n[1]?'수적 우세 측이 다른 방향에서 접근':'각 병사가 교전 상대에게 접근';
   }else{
    const s=e.duel.update(elapsed-e.enter);state.phase=s.phase;
    e.ids.forEach((id,k)=>{placements[id]={position:actors[id].visual.position.clone().applyAxisAngle(up,e.yaw).add(e.origin),yaw:actors[id].visual.rotation.y+e.yaw};});
    if(s.contact)state.contacts.push({...s.contact,point:s.contact.point.clone().applyAxisAngle(up,e.yaw).add(e.origin)});
   }
  }
  // Reconstruct each completed placement from its own event, not the latest
  // event involving that actor, so scrubbing never jumps ahead in the fight.
  for(let id=0;id<actors.length;id++){
   if(!engaged.has(id)){const done=engagements.filter(e=>e.ids.includes(id)&&e.end<t).at(-1);if(done)placements[id]=copy(done.finish[done.ids.indexOf(id)]);}
   const a=actors[id],side=sides[id],dead=t>=deathAt[id];
   if(dead&&!engaged.has(id)){placements[id]=copy(deathPose[id]!);a.evaluate({clip:a.death,time:Math.min(a.duration(a.death),t-deathAt[id])});}
   if(!dead){state.alive[side]++;state.health[side]+=100/n[side];}
   a.visual.position.copy(placements[id].position);a.visual.rotation.y=placements[id].yaw;a.visual.updateMatrixWorld(true);a.root.traverse(o=>{if(o instanceof T.SkinnedMesh)o.skeleton.update();});
  }
  state.health=state.health.map(Math.round);return state;
 }
 return {actors,sides,engagements,duration,contacts,failures,shots,flights,deathAt,state,update,dispose(){actors.forEach(a=>a.dispose());}};
}
