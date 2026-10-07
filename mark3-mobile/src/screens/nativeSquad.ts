import * as T from 'three';
import {DuelActor,DuelEvent,DuelSide,createNativeDuel,hasShield} from './nativeDuel';
import {NativeClip} from './nativeCombatModels';
import {NativeBattlePlan,representativeCount} from './nativeBattlePlan';

export {representativeCount};
export const proficiencyLabel=(rank:number)=>['일반','숙련 ★','정예 ★★','근위 ★★★'][T.MathUtils.clamp(Math.floor(rank),0,3)];
type Placement={position:T.Vector3;yaw:number;radius?:number};
type Engagement={start:number;enter:number;end:number;contact:number;ids:[number,number];duel:ReturnType<typeof createNativeDuel>;origin:T.Vector3;yaw:number;from:Placement[];to:Placement[];finish:Placement[];routes:T.Vector3[][];moveStart:number[];actionStart:number[];release:number[];owns:[boolean,boolean];tactic:string;opening?:number;vulnerability?:'attack'|'guard';guarded:boolean;interception:boolean};
const up=new T.Vector3(0,1,0);
const ease=(x:number)=>T.MathUtils.smoothstep(x,0,1);
const yawLerp=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
// Land the flank while the ally's strike is still pressing the guard, not
// after the defender has counterattacked and both weapons have recovered.
const PIN_OPENING=.08;
const APPROACH_SPEED=1.9;
const copy=(p:Placement):Placement=>({position:p.position.clone(),yaw:p.yaw});
export const threatRadius=(actor:DuelActor)=>actor.fighter.weapon==='spear'||actor.fighter.weapon==='halberd'?3.15:actor.fighter.weapon==='axe'?2.9:2.65;
export function strikeLaneClear(from:T.Vector3,tip:T.Vector3,friend:T.Vector3){const v=tip.clone().sub(from).setY(0),p=friend.clone().sub(from).setY(0),u=T.MathUtils.clamp(p.dot(v)/(v.lengthSq()||1),0,1);return p.addScaledVector(v,-u).length()>=.52;}
const pathLength=(points:T.Vector3[])=>points.slice(1).reduce((n,p,i)=>n+p.distanceTo(points[i]),0);
// One acceleration/deceleration envelope for the whole route, not a stop at
// every pathfinding vertex. Most of the approach runs at a steady pace.
function routeProgress(u:number){const t=T.MathUtils.clamp(u,0,1),r=.12;return t<r?t*t/(2*r*(1-r)):t>1-r?1-(1-t)*(1-t)/(2*r*(1-r)):(t-r/2)/(1-r);}
function pathPoint(points:T.Vector3[],u:number){let distance=pathLength(points)*routeProgress(u);for(let i=1;i<points.length;i++){const length=points[i].distanceTo(points[i-1]);if(distance<=length||i===points.length-1)return points[i-1].clone().lerp(points[i],length?distance/length:1);distance-=length;}return points.at(-1)!.clone();}
function pathFacing(points:T.Vector3[],u:number,from:number,to:number){
 const total=pathLength(points);if(total<1.2)return yawLerp(from,to,ease(u));
 const heading=(i:number)=>Math.atan2(points[i].x-points[i-1].x,points[i].z-points[i-1].z);
 let distance=total*u,yaw=to;
 for(let i=1;i<points.length;i++){const length=points[i].distanceTo(points[i-1]);if(distance<=length||i===points.length-1){yaw=heading(i);if(i<points.length-1)yaw=yawLerp(yaw,heading(i+1),ease((distance/(length||1)-.7)/.3));break;}distance-=length;}
 return yawLerp(yawLerp(from,yaw,ease(u/.35)),to,ease((u-.65)/.35));
}
function routeAround(a:T.Vector3,b:T.Vector3,obstacles:Placement[]){
 const clear=(p:T.Vector3,q:T.Vector3)=>obstacles.every(o=>{
  const v=q.clone().sub(p),u=T.MathUtils.clamp(o.position.clone().sub(p).dot(v)/(v.lengthSq()||1),0,1);
  return p.clone().addScaledVector(v,u).distanceTo(o.position)>=Math.min(o.radius??.92,a.distanceTo(o.position)-.01,b.distanceTo(o.position)-.01);
 });
 if(clear(a,b))return [a,b];
 const nodes=[a,b,...obstacles.flatMap(o=>Array.from({length:16},(_,i)=>o.position.clone().add(new T.Vector3(Math.cos(i*Math.PI/8),0,Math.sin(i*Math.PI/8)).multiplyScalar((o.radius??.92)+.22))))];
 const distances=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),visited=new Set<number>();distances[0]=0;
 for(let step=0;step<nodes.length;step++){
  let best=-1;for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(best<0||distances[i]<distances[best]))best=i;
  if(best<0||!Number.isFinite(distances[best]))break;if(best===1){const path:T.Vector3[]=[];for(let i=1;i>=0;i=previous[i])path.unshift(nodes[i]);return path;}
  visited.add(best);for(let j=0;j<nodes.length;j++){if(visited.has(j)||!clear(nodes[best],nodes[j]))continue;const length=distances[best]+nodes[best].distanceTo(nodes[j]);if(length<distances[j]){distances[j]=length;previous[j]=best;}}
 }
 return [a,b];
}
const walk=(a:DuelActor):NativeClip=>a.fighter.weapon==='bow'?'bowWalk':['axe','halberd','spear'].includes(a.fighter.weapon)?'twoWalk':a.fighter.weapon==='sword'?'walk':'axeWalk';
function approachPlacement(e:Engagement,k:number,t:number):Placement{
 const elapsed=t-e.moveStart[k],length=e.actionStart[k]-e.moveStart[k],u=T.MathUtils.clamp(elapsed/Math.max(.001,length),0,1),position=pathPoint(e.routes[k],u);
 const delta=e.to[1-k].position.clone().sub(position),towards=Math.atan2(delta.x,delta.z);
 const yaw=e.guarded?yawLerp(yawLerp(e.from[k].yaw,towards,ease(elapsed/.38)),e.to[k].yaw,ease((elapsed-length+.2)/.2)):pathFacing(e.routes[k],u,e.from[k].yaw,e.to[k].yaw);
 return {position,yaw};
}

/** Bounded review choreography. Outcomes are supplied, never decided by rank
 * or by how many representative meshes happen to be visible. */
export function createNativeSquad(teams:[DuelActor[],DuelActor[]],plan:NativeBattlePlan,range=6){
 const actors=teams.flat(),sides:DuelSide[]=actors.map((_,i)=>i<teams[0].length?0:1),n=teams.map(t=>t.length),ranged=teams[0][0]?.fighter.weapon==='bow';
 if(actors.length!==plan.actors.length)throw new Error('Recorded battle and representative models disagree');
 const homes:Placement[]=actors.map((a,id)=>{const side=sides[id],slot=side===0?id:id-n[0],lane=slot-(n[side]-1)/2;return {position:new T.Vector3((side===0?-1:1)*(ranged?range/2:1.6),0,lane*2.8),yaw:side===0?Math.PI/2:-Math.PI/2};});
 const last=homes.map(copy),available=actors.map((_,id)=>n[0]===n[1]?plan.actors[id].slot*.09:0),deathAt=actors.map(()=>Infinity),deathPose=actors.map(()=>null as null|Placement),engagements:Engagement[]=[];
 const onTrack=(e:Engagement,k:number,t:number):Placement=>{
  if(t>=e.release[k])return copy(e.finish[k]);
  if(t<e.actionStart[k])return approachPlacement(e,k,t);
  return {position:e.duel.positionsAt(t-e.start)[k].applyAxisAngle(up,e.yaw).add(e.origin),yaw:e.duel.facings[k]+e.yaw};
 };
 const placementAt=(id:number,t:number)=>{let p=copy(homes[id]);for(const e of engagements){const k=e.ids.indexOf(id);if(k>=0&&e.owns[k]&&t>=e.moveStart[k])p=onTrack(e,k,t);}return p;};
 function add(i:number,j:number,event:DuelEvent,earliest:number,allowPressure=true,interception=false):number{
  const requestedEvent=event;
  const ids:[number,number]=[i,n[0]+j],pair:[DuelActor,DuelActor]=[actors[ids[0]],actors[ids[1]]];
  let duel=createNativeDuel(pair,[event],range);
  const delta=last[ids[1]].position.clone().sub(last[ids[0]].position);
  let yaw=-Math.atan2(delta.z,delta.x),tactic=interception?'측면 접근 저지 · 경계하며 물러서기':'상대 견제 · 다음 공격 준비';
  const living=[0,1].map(side=>actors.filter((_,id)=>sides[id]===side&&!Number.isFinite(deathAt[id])).length);
  const half=ranged?range/2:1.25;
  // The attacker closes on the defender's existing position. Never relocate
  // both actors to a convenient midpoint to make a paired capture fit.
  const defender=1-event.attacker,anchorTarget=last[ids[defender]].position.clone();
  let loneSide:DuelSide|undefined,previous:Engagement|undefined,opening:number|undefined,vulnerability:Engagement['vulnerability'];
  const flankerId=ids[event.attacker],exposedId=ids[defender];
  // A committed attack exposes the attacker's rear. Land just after its
  // recorded contact, preserving that hit/casualty while beating recovery.
  // A fighter already attacking this ally is not an off-target opportunity.
  const exposed=!ranged&&allowPressure?engagements.slice().reverse().find(e=>e.ids.includes(exposedId)&&e.owns[e.ids.indexOf(exposedId)]):undefined;
  if(exposed&&exposed.ids[exposed.duel.events[0].attacker]===exposedId&&exposed.ids[1-exposed.duel.events[0].attacker]!==flankerId&&exposed.contact+.10>=earliest&&exposed.release[exposed.duel.events[0].attacker]>exposed.contact+.10&&available[flankerId]+.94<=exposed.contact+.10){
   const attackSide=exposed.duel.events[0].attacker,at=exposed.contact+.10,target=onTrack(exposed,attackSide,at);
   const towardsAlly=last[flankerId].position.clone().sub(target.position).normalize(),facing=new T.Vector3(0,0,1).applyAxisAngle(up,target.yaw);
   if(facing.dot(towardsAlly)<-.2){
    previous=exposed;opening=at;vulnerability='attack';anchorTarget.copy(target.position);
    const axis=event.attacker===0?target.position.clone().sub(last[flankerId].position):last[flankerId].position.clone().sub(target.position);yaw=-Math.atan2(axis.z,axis.x);
    // A short opening calls for a quick captured strike, not an unrelated
    // jump finisher that needs extra windup or sails over a leaning opponent.
    event={...event,heavy:false,jump:false,outcome:event.outcome==='block'?'miss':event.outcome};
    const source=exposed.duel.events[0],poseTime=source.marker+(source.outcome==='block'?-1:1)*.10*.65;
    duel=createNativeDuel(pair,[event],range,{side:defender as DuelSide,yaw:target.yaw-yaw,position:new T.Vector3(defender===0?-half:half,0,0),idleTime:0,pose:{clip:source.clip,time:poseTime}});
    tactic='적이 공격에 몸을 실은 순간 · 드러난 등 공격';
   }
  }
  const minority:DuelSide=living[0]<living[1]?0:1;
  const targets=plan.actors.filter(p=>p.side===minority&&!Number.isFinite(deathAt[p.id]));
  const group=plan.actors.filter(p=>p.side!==minority&&!Number.isFinite(deathAt[p.id])&&targets.slice().sort((x,y)=>Math.abs(x.slot-p.slot)-Math.abs(y.slot-p.slot)||x.id-y.id)[0]?.id===ids[minority]).sort((a,b)=>homes[a.id].position.distanceToSquared(homes[ids[minority]].position)-homes[b.id].position.distanceToSquared(homes[ids[minority]].position)||a.id-b.id);
  if(opening===undefined&&!ranged&&!interception&&event.attacker!==minority&&living[0]!==living[1]&&group.length>1&&group.some(p=>p.id===ids[1-minority])){
   loneSide=minority;const lone=ids[loneSide],flanker=ids[1-loneSide],slot=group.findIndex(p=>p.id===flanker);
   // Guarded routes stay outside weapon reach. Do not manufacture a solo
   // counterattack before every flank: that turns pressure into a turn queue.
   // Two allies occupy opposite sides; three use a full triangle around the
   // target. The rear attacker must physically walk around the target.
   // Stay on the side this fighter already occupies. Fixed slot signs sent
   // both wings around the far side and kept the front fighter waiting alone.
   yaw=slot===0?0:Math.sign(yaw||slot-.5)*(group.length===2?Math.PI:Math.PI*2/3);
   const pin=PIN_OPENING+(slot>1?.14:0);
   const anchor=last[lone].position.clone();
   tactic='정면 견제 · 측면과 배후 포위';
   if(allowPressure&&slot>0&&event.attacker!==loneSide){
    const around=routeAround(last[flanker].position,anchor.clone().add(new T.Vector3(loneSide===0?2.5:-2.5,0,0).applyAxisAngle(up,yaw)),[{...last[lone],radius:threatRadius(actors[lone])}]);
    const ready=Math.max(earliest,available[flanker]+pathLength(around)/APPROACH_SPEED+duel.events[0].contact-.47);
    const front=group[0];
    previous=engagements.filter(e=>e.ids[1-e.duel.events[0].attacker]===lone&&e.ids[e.duel.events[0].attacker]===front.id&&e.duel.events[0].outcome==='block').at(-1);
    if(front&&(!previous||previous.contact+pin<ready)){
     // Schedule the supporting cut to meet the approaching ally. No shared
     // defender-available gate: the second strike lands DURING this block.
     // The support cannot add casualties to the authoritative combat record.
     const blue=loneSide===0?lone:front.id,red=(loneSide===1?lone:front.id)-n[0];
     // Meet the wing's arrival with one supporting cut. Repeating whole
     // blocks until a fixed beat overshot readiness and padded the fight.
     add(blue,red,{attacker:(1-loneSide) as DuelSide,outcome:'block',variation:slot%3},ready-pin,false);
     previous=engagements.at(-1);
    }
    if(previous&&previous.release[previous.ids.indexOf(lone)]>previous.contact+pin){
     opening=previous.contact+pin;vulnerability='guard';const target=onTrack(previous,previous.ids.indexOf(lone),opening);
     anchorTarget.copy(target.position);
     // A second cut can miss while the target is occupied with the front.
     if(event.outcome==='block')event={...event,outcome:'miss'};
     // Carry the captured block recoil at this precise follow-up time into
     // the hit/death blend, without resetting the defender to idle.
     duel=createNativeDuel(pair,[event],range,{side:loneSide,yaw:target.yaw-yaw,position:new T.Vector3(loneSide===0?-half:half,0,0),idleTime:(opening+lone*.39)%pair[loneSide].duration(pair[loneSide].idle),pose:{clip:hasShield(pair[loneSide].fighter)?'impact':pair[loneSide].impact,time:pin}});
     tactic='정면 공격을 막는 순간 · 측후방 동시 공격';
    }
   }
  }
  // Find a clear attack angle around the current defender. A blocked approach
  // changes the attacker's route; it does not drag the defender into the blow.
  const candidates=[0,.22,-.22,.45,-.45,.75,-.75,1.1,-1.1,1.55,-1.55,2.1,-2.1,Math.PI];
  const a=event.attacker,d=1-a,native=duel.events[0],windup=native.contact-.47;
  // Reserve bodies, not an entire pair until the end of both clips. The next
  // attacker can already wind up while the defender recovers from a block.
  const from=ids.map(id=>copy(last[id]));
  const build=(angle:number,delay:number,extra:Placement[]=[]):Engagement=>{
   const center=anchorTarget.clone().sub(duel.positionsAt(0)[d].applyAxisAngle(up,angle));
   const place=(time:number,k:number):Placement=>({position:duel.positionsAt(time)[k].applyAxisAngle(up,angle).add(center),yaw:duel.facings[k]+angle});
   const guarded=!ranged&&actors.length>2;
   const to=[place(0,0),place(0,1)],routes=to.map((p,k)=>routeAround(from[k].position,p.position,[...last.flatMap((o,id)=>ids.includes(id)?[]:[{...o,radius:guarded&&sides[id]!==sides[ids[k]]&&!Number.isFinite(deathAt[id])?threatRadius(actors[id]):.92}]),...extra,...(guarded?[{position:to[1-k].position,yaw:0,radius:threatRadius(pair[1-k])}]:[])]));
   const travel=routes.map((r,k)=>Math.max(.22,pathLength(r)/APPROACH_SPEED,Math.abs(Math.atan2(Math.sin(to[k].yaw-from[k].yaw),Math.cos(to[k].yaw-from[k].yaw)))/3.2));
   const moveStart=ids.map(id=>available[id]+delay),contact=opening??Math.max(earliest,moveStart[a]+travel[a]+windup,moveStart[d]+travel[d]+.28);
   const actionStart=[0,0];actionStart[a]=contact-windup;actionStart[d]=contact-.28;
   if(opening!==undefined){moveStart[d]=opening;actionStart[d]=opening;from[d]=copy(to[d]);}
   const start=contact-native.contact,release=[0,0];
   const recovery=pair[a].fighter.weapon==='bow'?Math.max(.8,pair[a].duration(native.clip)-(native.contact-native.start)):.8;
   release[a]=contact+recovery;release[d]=contact+(event.outcome==='death'?pair[d].duration(pair[d].death)+.35:event.outcome==='hit'?pair[d].duration(pair[d].impact)+.1:.85);
   const owns:[boolean,boolean]=[true,true];if(event.outcome==='miss')owns[d]=false;
   return {start,enter:0,end:Math.max(...release.filter((_,k)=>owns[k])),contact,ids,duel,origin:center,yaw:angle,from,to,finish:release.map((t,k)=>place(t-start,k)),routes,moveStart,actionStart,release,owns,tactic,opening,vulnerability,guarded,interception};
  };
  const collision=(e:Engagement):Placement|null=>{
   for(let t=Math.min(...e.moveStart);t<=e.end+.08;t+=.08){
    const positions=actors.map((_,id)=>{const k=ids.indexOf(id);return k>=0&&e.owns[k]&&t>=e.moveStart[k]?onTrack(e,k,t):placementAt(id,t);});
    for(const id of ids)for(let other=0;other<actors.length;other++)if(id!==other&&positions[id].position.distanceTo(positions[other].position)<.87)return positions[other];
    if(t>=e.contact-.28&&t<=e.contact+.16){const tip=e.duel.events[0].point.clone().applyAxisAngle(up,e.yaw).add(e.origin);for(let other=0;other<actors.length;other++)if(other!==ids[a]&&sides[other]===sides[ids[a]]&&!strikeLaneClear(positions[ids[a]].position,tip,positions[other].position))return positions[other];}
   }
   return null;
  };
  let selected:Engagement|undefined;
  const clearAfter=Math.max(...available)-Math.min(...ids.map(id=>available[id]))+.2;
  search:for(const delay of opening!==undefined?[0]:[0,.3,.65,1.1,clearAfter])for(const turn of opening!==undefined?[0]:candidates){
   let e=build(yaw+turn,delay),hit=collision(e);
   if(hit){e=build(yaw+turn,delay,[hit]);hit=collision(e);}
   if(!hit&&e.actionStart[a]>=e.moveStart[a]+pathLength(e.routes[a])/2.15){selected=e;break search;}
  }
  if(!selected&&opening!==undefined)return add(i,j,vulnerability==='attack'?requestedEvent:event.outcome==='miss'?{...event,outcome:'block'}:event,earliest,false);
  if(!selected)throw new Error(`No safe squad route for ${ids.join(':')}`);
  const e=selected;
  if(opening!==undefined&&previous&&e.owns[d]){const k=previous.ids.indexOf(ids[d]);previous.finish[k]=onTrack(previous,k,opening);previous.release[k]=opening;previous.end=Math.max(...previous.release.filter((_,s)=>previous!.owns[s]));}
  ids.forEach((id,k)=>{if(e.owns[k]){last[id]=copy(e.finish[k]);available[id]=e.release[k];}});engagements.push(e);
  if(event.outcome==='death'){const victim=ids[d];deathAt[victim]=e.contact;deathPose[victim]=copy(last[victim]);}
  return e.contact;
 }
 // A presentation-only director. No resolver rounds, loss ticks, damage rolls
 // or weapon stats are consulted. Each body has its own animation clock.
 const doomed=new Set(plan.fallen),attacks=actors.map(()=>0);
 const livingIds=()=>actors.map((_,id)=>id).filter(id=>!Number.isFinite(deathAt[id]));
 const filmSeed=plan.initial[0]*13+plan.initial[1]*7+plan.final[0]*5+plan.final[1]*3;
 const perform=(a:number,d:number,event:Omit<DuelEvent,'attacker'>)=>{
  const i=sides[a]===0?a:d,j=(sides[a]===1?a:d)-n[0];
  const contact=add(i,j,{...event,attacker:sides[a]},0);
  attacks[a]++;return contact;
 };
 // Start all outnumbering fighters immediately, keeping the existing guarded
 // flank routes and supporting strike. They need not be hit to become active.
 if(n[0]&&n[1]&&n[0]!==n[1]){
  const majority=n[0]>n[1]?0:1;
  const front=plan.actors.filter(a=>a.side===majority).sort((a,b)=>Math.abs(a.slot-(n[majority]-1)/2)-Math.abs(b.slot-(n[majority]-1)/2)||a.id-b.id);
  for(const a of front){const d=plan.actors.filter(d=>d.side!==a.side).sort((b,c)=>Math.abs(b.slot-a.slot)-Math.abs(c.slot-a.slot)||b.id-c.id)[0];perform(a.id,d.id,{outcome:'block',variation:a.slot%3});}
 }
 let lastDeath=0;
 for(let step=0;step<120;step++){
  const live=livingIds(),pending=live.filter(id=>doomed.has(id));
  const casualties=[0,1].map(side=>pending.filter(id=>sides[id]===side).length);
  const choices=live.flatMap(a=>live.filter(d=>sides[d]!==sides[a]).map(d=>{
   const travel=Math.max(0,last[a].position.distanceTo(last[d].position)-(ranged?range:2.5))/APPROACH_SPEED;
   const ready=Math.max(available[a]+travel,available[d]-.7);
   // Settle casualties on both sides before eliminating the last opponent.
   // If both duelists must fall, settle the side with more final survivors
   // first, leaving nearby opponents to deliver the remaining finishing blows.
   const mutual=live.every(id=>doomed.has(id));
   const keepOpponent=!mutual&&live.filter(id=>sides[id]===sides[d]).length===1&&casualties[sides[a]]>0;
   const otherFirst=doomed.has(a)&&(plan.final[sides[a]]>plan.final[sides[d]]||plan.final[0]===plan.final[1]&&sides[a]===0);
   const fatal=ready>=5.8&&doomed.has(d)&&!keepOpponent&&!otherFirst;
   return {a,d,ready,fatal,score:ready+attacks[a]*.18+Math.abs(plan.actors[a].slot-plan.actors[d].slot)*.05-(fatal?.35:0)};
  })).filter(c=>!ranged||sides[c.a]===0||c.fatal).sort((a,b)=>a.score-b.score||a.a-b.a||a.d-b.d);
  if(!choices.length)break;
  // Surviving pairs keep sparring while the other pairs finish. A new hit on
  // an unrelated lane cannot stop their local clocks.
  if(!pending.length&&Math.min(...choices.map(c=>c.ready))>=Math.max(8,lastDeath))break;
  const {a,d,fatal}=choices[0];
  const roll=filmSeed+step*7+a*11+d*3;
  const contact=perform(a,d,{outcome:fatal?'death':roll%5===0?'hit':'block',heavy:roll%4===0,jump:fatal&&!ranged&&roll%4===0,variation:roll%3});
  if(fatal)lastDeath=Math.max(lastDeath,contact);
  if(step===119)throw new Error('Battle film did not settle its resolved outcome');
 }
 // In mutual destruction the last wounded fighter has nobody left to deliver
 // another blow. Its collapse still belongs to the precomputed casualty list.
 for(const id of livingIds().filter(id=>doomed.has(id))){
  deathAt[id]=Math.max(lastDeath,available[id]);deathPose[id]=copy(last[id]);
  lastDeath=Math.max(lastDeath,deathAt[id]+actors[id].duration(actors[id].death));
 }
 const finish=Math.max(0,...engagements.map(e=>e.end),lastDeath),duration=finish+2.4;
 // These are visual counts, not calculation rounds. Partially surviving
 // representative slices settle to the exact game total at the end.
 const stages=[{at:0,counts:[...plan.initial] as [number,number]}];
 const counts:[number,number]=[...plan.initial];
 for(const id of plan.fallen.slice().sort((a,b)=>deathAt[a]-deathAt[b])){
  const actor=plan.actors[id];counts[actor.side]-=actor.high-actor.low;
  stages.push({at:deathAt[id],counts:[...counts]});
 }
 stages.push({at:finish,counts:[...plan.final]});
 // Resolve attention from CURRENT bodies, independently of destination slots.
 // Fixed-step yaw samples make bounded turning identical during play/rewind.
 // Only the committed strike/block is locked to its calibrated capture frame.
 const facingStep=1/60,facingFrames:number[][]=[homes.map(p=>p.yaw)],attentionFrames:number[][]=[];
 const currentTrack=(id:number,t:number)=>engagements.find(e=>{const k=e.ids.indexOf(id);return k>=0&&e.owns[k]&&t>=e.moveStart[k]&&t<=e.release[k];});
 let attention=actors.map((_,id)=>actors.findIndex((__,other)=>sides[id]!==sides[other]));
 for(let frame=0;frame<=Math.ceil(finish/facingStep)+1;frame++){
  const time=frame*facingStep,positions=actors.map((_,id)=>placementAt(id,time).position),previous=facingFrames.at(-1)!;
  const next=actors.map((_,id)=>{
   const e=currentTrack(id,time),k=e?.ids.indexOf(id)??-1;
   if(time>=deathAt[id])return e?e.duel.facings[k]+e.yaw:previous[id];
   const enemies=actors.map((_,other)=>other).filter(other=>sides[other]!==sides[id]&&time<deathAt[other]);
   let target=e?e.ids[1-k]:attention[id];
   const nearest=enemies.slice().sort((a,b)=>positions[a].distanceToSquared(positions[id])-positions[b].distanceToSquared(positions[id]))[0];
   if(!enemies.includes(target)||!e&&nearest!==undefined&&positions[nearest].distanceTo(positions[id])+.65<positions[target].distanceTo(positions[id]))target=nearest;
   if(target===undefined)return previous[id];attention[id]=target;
   const delta=positions[target].clone().sub(positions[id]);let wanted=Math.atan2(delta.x,delta.z);
   if(e){
    const lock=e.actionStart[k],unlock=e.release[k],committed=e.duel.facings[k]+e.yaw;
    // Turn into the capture only as the weapon commits. Before that, a moving
    // opponent is followed where it actually is, never at its future marker.
    // An overlapping hit interrupts a committed attack or guard. Keep its
    // facing through the handoff instead of turning early and snapping back
    // when the rear impact begins.
    const interrupted=unlock<e.contact+.45;
    const blend=ease((time-lock+.24)/.24)*(interrupted?1:1-ease((time-unlock+.20)/.20));
    wanted=yawLerp(wanted,committed,blend);
   }
   const deltaYaw=Math.atan2(Math.sin(wanted-previous[id]),Math.cos(wanted-previous[id]));
   return previous[id]+T.MathUtils.clamp(deltaYaw,-5.5*facingStep,5.5*facingStep);
  });
  if(frame===0)facingFrames[0]=next;else facingFrames.push(next);
  attentionFrames.push([...attention]);
 }
 function facingsAt(time:number){const index=T.MathUtils.clamp(time/facingStep,0,facingFrames.length-1),a=Math.floor(index),b=Math.min(a+1,facingFrames.length-1);return facingFrames[a].map((yaw,id)=>yawLerp(yaw,facingFrames[b][id],index-a));}
 const resultLabel=plan.outcome==='stalemate'?'교착 · 양측 이탈':plan.outcome==='attacker-win'?'공격측 승리':'방어측 승리';
 const contacts=engagements.filter(e=>e.duel.events[0].outcome!=='miss').map(e=>e.contact).sort((a,b)=>a-b);
 const failures=engagements.filter(e=>['hit','death'].includes(e.duel.events[0].outcome)).map(e=>e.contact).sort((a,b)=>a-b);
 const shots=engagements.flatMap(e=>e.duel.events.filter(v=>v.flight>0).map(v=>e.start+e.enter+v.contact-v.flight-.001)).sort((a,b)=>a-b);
 const flights=engagements.flatMap(e=>e.duel.events.filter(v=>v.flight>0).map(v=>e.start+e.enter+v.contact-v.flight/2)).sort((a,b)=>a-b);
 const state={phase:'대형 유지 · 상대 탐색',health:[100,100],contacts:[] as {point:T.Vector3;age:number;blocked:boolean}[],alive:[n[0],n[1]],counts:plan.initial};
 function update(time:number){
  const t=T.MathUtils.clamp(time,0,duration),placements=homes.map(copy);state.contacts=[];state.health=[0,0];state.alive=[0,0];state.phase=t>=finish?resultLabel:'대형 유지 · 상대 탐색';
  const stage=stages.filter(s=>s.at<=t).at(-1)!;state.counts=[...stage.counts];
  const engaged=new Set<number>(),idleTimes=actors.map((a,id)=>(t+id*.39)%a.duration(a.idle)),facings=facingsAt(t);
  actors.forEach((a,id)=>{a.trail.visible=false;a.evaluate({clip:a.idle,time:idleTimes[id]});});
  for(const e of engagements){
   const participation:[number,number]=[0,0];
   e.ids.forEach((id,k)=>{
    if(!e.owns[k]||t<e.moveStart[k]||t>e.release[k])return;
    engaged.add(id);
    if(t<e.actionStart[k]){
     const elapsed=t-e.moveStart[k],length=e.actionStart[k]-e.moveStart[k],u=elapsed/length,a=actors[id],moving=pathLength(e.routes[k])>.08;
     placements[id]=approachPlacement(e,k,t);
     placements[id].yaw=facings[id];
     const clip=moving?walk(a):a.idle;
     const weight=ease(elapsed/.18)*(1-ease((elapsed-length+.18)/.18));
     if(e.guarded&&moving){
      const tangent=pathPoint(e.routes[k],Math.min(1,u+.002)).sub(pathPoint(e.routes[k],Math.max(0,u-.002))),heading=Math.atan2(tangent.x,tangent.z);
      // Choose forward/backward stride for the whole approach. Switching at
      // exactly 90 degrees makes circling feet/pelvis flip on every corner.
      const focus=e.to[1-k].position,backwards=e.to[k].position.distanceTo(focus)>e.from[k].position.distanceTo(focus)+.2;
      const direction=.72*Math.sin(heading-placements[id].yaw)*(backwards?-1:1);
      // The feet advance with distance covered, including acceleration and
      // delayed approaches; a slowly moving root must not keep walking fast.
      const stride=(pathLength(e.routes[k])*routeProgress(u)/1.45+id*.13)%a.duration(clip);
      a.evaluate({clip:a.idle,time:idleTimes[id]},undefined,1,undefined,{clip,time:backwards?a.duration(clip)-stride:stride,weight,direction});
     }else a.evaluate({clip,time:moving?(elapsed+id*.13)%a.duration(clip):idleTimes[id]},{clip:a.idle,time:idleTimes[id]},weight);
     state.phase=e.opening!==undefined?'경계 이동 · 측후방 접근':e.tactic;
    }else participation[k]=Math.max(.00001,ease((t-e.actionStart[k])/.14));
   });
   if(participation.some(w=>w>0)){
    const s=e.duel.update(t-e.start,participation,[idleTimes[e.ids[0]],idleTimes[e.ids[1]]]);
    state.phase=e.opening!==undefined&&t<=e.contact+.14?e.tactic:s.winner===null?s.phase:'대표 병사 쓰러짐 · 다른 교전 계속';
    e.ids.forEach((id,k)=>{if(participation[k]>0)placements[id]={position:actors[id].visual.position.clone().applyAxisAngle(up,e.yaw).add(e.origin),yaw:actors[id].visual.rotation.y+e.yaw};});
    if(s.contact)state.contacts.push({...s.contact,point:s.contact.point.clone().applyAxisAngle(up,e.yaw).add(e.origin)});
   }
  }
  // Reconstruct each completed placement from its own event, not the latest
  // event involving that actor, so scrubbing never jumps ahead in the fight.
  for(let id=0;id<actors.length;id++){
   if(!engaged.has(id)){const done=engagements.filter(e=>e.ids.includes(id)&&e.owns[e.ids.indexOf(id)]&&e.release[e.ids.indexOf(id)]<t).at(-1);if(done)placements[id]=copy(done.finish[done.ids.indexOf(id)]);}
   const a=actors[id],side=sides[id],dead=t>=deathAt[id];
   if(!dead&&t<=finish)placements[id].yaw=facings[id];
   if(dead&&!engaged.has(id)){placements[id]=copy(deathPose[id]!);a.evaluate({clip:a.death,time:Math.min(a.duration(a.death),t-deathAt[id])});}
   if(!dead&&t>finish&&(plan.outcome==='stalemate'||(plan.outcome==='attacker-win'?side===1:side===0))){
    const elapsed=t-finish,u=ease(elapsed/2.4);placements[id].position.x+=(side===0?-1:1)*1.7*u;placements[id].yaw=yawLerp(placements[id].yaw,side===0?-Math.PI/2:Math.PI/2,ease(elapsed/.6));
    a.evaluate({clip:walk(a),time:elapsed%a.duration(walk(a))},{clip:a.idle,time:idleTimes[id]},ease(elapsed/.3)*(1-ease((elapsed-2)/.4)));
   }
   if(!dead){state.alive[side]++;state.health[side]+=100/n[side];}
   a.visual.position.copy(placements[id].position);a.visual.rotation.y=placements[id].yaw;a.visual.updateMatrixWorld(true);a.root.traverse(o=>{if(o instanceof T.SkinnedMesh)o.skeleton.update();});
  }
  state.health=state.health.map(Math.round);return state;
 }
 return {actors,sides,engagements,duration,finish,stages,contacts,failures,shots,flights,deathAt,state,update,attentionAt(time:number){return attentionFrames[Math.min(attentionFrames.length-1,Math.max(0,Math.floor(time/facingStep)))];},dispose(){actors.forEach(a=>a.dispose());}};
}
