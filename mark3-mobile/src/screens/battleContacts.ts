import * as T from 'three';
import {BattleReplay,BattleFrame,bakeBattleMovement,COMBAT_PACE} from './battleReplay';
import {fighterPose} from './battleMotion';
import {buildFighter} from './fighterAppearance';
import {buildDuelContacts,bladeShield,armorSpheres} from './duelContacts';
import {poseAuthoredKnight,DEATH_START,DEATH_LANDED_AT} from './authoredKnightMotion';
import {settleCorpse} from './groundedCorpse';
export type BattleActor={rig:ReturnType<typeof buildFighter>;shape:ReturnType<typeof buildDuelContacts>};
const v=(z:number)=>new T.Vector3(0,0,z);
export function swordContact(a:BattleActor,b:BattleActor,scale=1){
 const line=new T.Line3(v(.10).applyMatrix4(a.rig.sword.matrixWorld),v(.85).applyMatrix4(a.rig.sword.matrixWorld)),other=new T.Line3(v(.10).applyMatrix4(b.rig.sword.matrixWorld),v(.85).applyMatrix4(b.rig.sword.matrixWorld));
 let best:T.Vector3|null=null,distance=Infinity;
 for(let i=0;i<=20;i++){const pa=line.at(i/20,new T.Vector3()),pb=other.closestPointToPoint(pa,true,new T.Vector3()),d=pa.distanceTo(pb);if(d<distance){distance=d;best=pa.lerp(pb,.5);}}
 return distance<.06*scale?best:null;
}
/** Shared by WebGL rendering and headless geometry regression tests. */
function solveBattlePose(plan:BattleReplay,time:number,frame:BattleFrame,actors:BattleActor[],height:(x:number,z:number)=>number,scale=1,yaw=0,align=true){
 const groups=actors.map(a=>a.rig.mesh.parent as T.Group),ground=(i:number)=>{const a=actors[i],g=groups[i];g.position.y+=a.shape.groundLift(g.position,g.rotation.y,height);g.updateMatrixWorld(true);};
 actors.forEach(({rig},i)=>{const p=frame.positions[i],g=groups[i];g.position.set(p.x,0,p.z);g.rotation.y=p.yaw;rig.mesh.rotation.x=0;poseAuthoredKnight(rig,fighterPose(plan.actors[i],time,frame.actions[i],p.moving));g.updateMatrixWorld(true);ground(i);});
 const touches=new Map<number,T.Vector3>();
 const partners=new Map<number,number>();
 for(const e of plan.exchanges)if(e.defense==='parry'&&Math.abs(time-e.at)<.12&&frame.actions[e.attacker]?.exchange===e&&frame.actions[e.target]?.exchange===e){partners.set(e.attacker,e.target);partners.set(e.target,e.attacker);}
 const move=(i:number,delta:T.Vector3,obstacle:number)=>{groups[i].position.add(delta);groups[i].updateMatrixWorld(true);const other=partners.get(i);if(other!==undefined&&other!==obstacle){groups[other].position.add(delta);groups[other].updateMatrixWorld(true);}};
 const clearWeapon=(i:number,j:number,away:T.Vector3,amount:number)=>{
  const action=frame.actions[i];
  if(action?.role==='attack'&&action.exchange.target!==j)move(j,away.clone().multiplyScalar(-amount),i);
  else {move(i,away.clone().multiplyScalar(amount*.5),j);move(j,away.clone().multiplyScalar(-amount*.5),i);}
 };
 if(align)for(const event of plan.exchanges){
  const dt=(time-event.at)*COMBAT_PACE;if(dt<-.5||dt>.36||time>=plan.actors[event.attacker].deathAt||event.defense==='dodge')continue;
  const a=actors[event.attacker],b=actors[event.target],ga=groups[event.attacker],gb=groups[event.target];
  if(frame.actions[event.attacker]?.role!=='attack'||frame.actions[event.attacker]?.exchange!==event)continue;
  const blade=v(.52).applyMatrix4(a.rig.sword.matrixWorld);let target:T.Vector3;
  if(event.defense==='shield'){
   b.rig.shield.geometry.computeBoundingBox();target=b.rig.shield.geometry.boundingBox!.getCenter(new T.Vector3()).applyMatrix4(b.rig.shield.matrixWorld);const toward=ga.getWorldPosition(new T.Vector3()).sub(gb.getWorldPosition(new T.Vector3()));toward.y=0;target.addScaledVector(toward.normalize(),.03*scale);
  }else if(event.defense==='parry'){
   const start=v(.12).applyMatrix4(b.rig.sword.matrixWorld),end=v(.80).applyMatrix4(b.rig.sword.matrixWorld);
   const t=Math.abs(end.y-start.y)>.01?T.MathUtils.clamp((blade.y-start.y)/(end.y-start.y),0,1):.5;target=start.lerp(end,t);
  }else target=new T.Vector3(0,.23,0).applyMatrix4(b.rig.bones[0].matrixWorld);
  const center=ga.getWorldPosition(new T.Vector3()),edge=blade.clone().sub(center),aim=target.clone().sub(center);
  const turn=Math.atan2(Math.sin(Math.atan2(aim.x,aim.z)-Math.atan2(edge.x,edge.z)),Math.cos(Math.atan2(aim.x,aim.z)-Math.atan2(edge.x,edge.z)));
  ga.rotation.y+=T.MathUtils.clamp(turn,-.75,.75);ga.updateMatrixWorld(true);blade.copy(v(.52).applyMatrix4(a.rig.sword.matrixWorld));
  const shift=target.sub(blade).divideScalar(scale).applyAxisAngle(new T.Vector3(0,1,0),-yaw),weight=T.MathUtils.smoothstep(dt,-.5,-.02)*(1-T.MathUtils.smoothstep(dt,.08,.36));
  shift.y=0;if(shift.length()>.75)shift.setLength(.75);ga.position.addScaledVector(shift,weight);ga.updateMatrixWorld(true);
 }
 for(let pass=0;pass<3;pass++)for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){
  if(time>=plan.actors[i].deathAt||time>=plan.actors[j].deathAt)continue;
  const a=groups[i],b=groups[j],d=a.position.clone().sub(b.position);d.y=0;const n=d.length();if(n>=.90)continue;d.setLength((.90-n)/2);a.position.add(d);b.position.sub(d);a.updateMatrixWorld(true);b.updateMatrixWorld(true);
 }
 // Full blade/shield intersection tests also include the bystanders, not only the chosen opponent.
 for(let i=0;i<actors.length;i++)for(let j=0;j<actors.length;j++){
  if(i===j||time>=plan.actors[i].deathAt||time>=plan.actors[j].deathAt||!actors[j].rig.hasShield)continue;
  const away=groups[i].position.clone().sub(groups[j].position);away.y=0;away.normalize();
  for(let pass=0;pass<35;pass++){
   const hit=bladeShield(actors[i].rig,actors[j].rig,actors[j].shape,.012);if(!hit)break;
   touches.set(i,hit);clearWeapon(i,j,away,.012);
  }
 }
 // A parry is a shared blade contact. Split the approach between both feet so crowd
 // separation cannot leave the defender blocking empty air.
 if(align)for(let pass=0;pass<3;pass++)for(const e of plan.exchanges){
  const dt=(time-e.at)*COMBAT_PACE;if(e.defense!=='parry'||dt<-.5||dt>.36)continue;
  if(frame.actions[e.attacker]?.exchange!==e||frame.actions[e.target]?.exchange!==e)continue;
  const a=actors[e.attacker],b=actors[e.target],blade=v(.52).applyMatrix4(a.rig.sword.matrixWorld),lo=v(.12).applyMatrix4(b.rig.sword.matrixWorld),hi=v(.8).applyMatrix4(b.rig.sword.matrixWorld);
  const along=Math.abs(hi.y-lo.y)>.01?T.MathUtils.clamp((blade.y-lo.y)/(hi.y-lo.y),0,1):.5;
  const correction=lo.lerp(hi,along).sub(blade).divideScalar(scale).applyAxisAngle(new T.Vector3(0,1,0),-yaw);correction.y=0;
  if(correction.length()>.5)correction.setLength(.5);
  correction.multiplyScalar(.5*T.MathUtils.smoothstep(dt,-.5,-.02)*(1-T.MathUtils.smoothstep(dt,.08,.36)));
  groups[e.attacker].position.add(correction);groups[e.target].position.sub(correction);groups[e.attacker].updateMatrixWorld(true);groups[e.target].updateMatrixWorld(true);
 }
 actors.forEach(({rig,shape},i)=>{
  ground(i);const g=groups[i],rest=T.MathUtils.smoothstep(time-plan.actors[i].deathAt,1.05,DEATH_LANDED_AT-DEATH_START);
  if(rest>0)for(let pass=0;pass<3;pass++){settleCorpse(rig,shape.parts,rest,g.position,g.rotation.y,height);ground(i);}
 });
 for(let i=0;i<actors.length;i++)for(let j=0;j<actors.length;j++){
  if(i===j||time>=plan.actors[i].deathAt||time>=plan.actors[j].deathAt)continue;
  const away=groups[i].position.clone().sub(groups[j].position);away.y=0;away.normalize();
  for(let pass=0;pass<40;pass++){
   const line=new T.Line3(v(.10).applyMatrix4(actors[i].rig.sword.matrixWorld),v(.85).applyMatrix4(actors[i].rig.sword.matrixWorld));
   const hit=armorSpheres(actors[j].rig).find(s=>line.closestPointToPoint(s.center,true,new T.Vector3()).distanceTo(s.center)<s.radius+.01*scale);
   if(!hit)break;touches.set(i,line.closestPointToPoint(hit.center,true,new T.Vector3()));clearWeapon(i,j,away,.012);
  }
 }
 // Solve the whole contact graph again after grounding and shared parries. A change to
 // one pair can otherwise push a neighbouring blade through a shield.
 for(let pass=0;pass<16;pass++){let changed=false;for(let i=0;i<actors.length;i++)for(let j=0;j<actors.length;j++){
  if(i===j||time>=plan.actors[i].deathAt||time>=plan.actors[j].deathAt)continue;
  const away=groups[i].position.clone().sub(groups[j].position);away.y=0;const distance=away.length();if(distance>3)continue;away.normalize();
  if(distance<.8999){move(i,away.clone().multiplyScalar(.9-distance),j);changed=true;}
  for(let k=0;k<65;k++){
   const hit=bladeShield(actors[i].rig,actors[j].rig,actors[j].shape,.014);if(!hit)break;
   changed=true;touches.set(i,hit);clearWeapon(i,j,away,.012);
  }
 }if(!changed)break;}
 actors.forEach((_,i)=>ground(i));
 for(const e of plan.exchanges)if(Math.abs(time-e.at)<.1&&e.defense==='parry'){
  const contact=swordContact(actors[e.attacker],actors[e.target],scale);if(contact)touches.set(e.attacker,contact);
 }
 return touches;
}

type Footstep={at:number;offset:T.Vector3;turn:number};
function footOffset(path:Footstep[],time:number){
 let index=0;while(index+1<path.length&&path[index+1].at<=time)index++;
 const a=path[index],b=path[Math.min(index+1,path.length-1)];return a.offset.clone().lerp(b.offset,a===b?0:T.MathUtils.smoothstep(time,a.at,b.at));
}
function footTurn(path:Footstep[],time:number){let i=0;while(i+1<path.length&&path[i+1].at<=time)i++;const a=path[i],b=path[Math.min(i+1,path.length-1)];return a.turn+(b.turn-a.turn)*(a===b?0:T.MathUtils.smoothstep(time,a.at,b.at));}
const contactPaths=new WeakMap<BattleActor[],{plan:BattleReplay;scale:number;yaw:number;paths:Footstep[][]}>();
/** Solve contact stances once, then travel between them. Re-solving a near-horizontal
 * parry every display frame used to move a fighter almost a metre in 1/60 second. */
export function poseBattleActors(plan:BattleReplay,time:number,frame:BattleFrame,actors:BattleActor[],height:(x:number,z:number)=>number,scale=1,yaw=0){
 let cached=contactPaths.get(actors);
 if(!cached||cached.plan!==plan||cached.scale!==scale||cached.yaw!==yaw){
  const movement=bakeBattleMovement(plan),paths:Footstep[][]=actors.map(()=>[{at:0,offset:new T.Vector3(),turn:0}]);
  for(const at of [...new Set(plan.exchanges.map(e=>e.at))]){
   const sample=movement.sample(at);
   const positions=sample.positions.map((p,i)=>{const dead=at>=plan.actors[i].deathAt,offset=dead?footOffset(paths[i],at):new T.Vector3();return {...p,x:p.x+offset.x,z:p.z+offset.z,yaw:p.yaw+(dead?footTurn(paths[i],at):0)};});
   solveBattlePose(plan,at,{...sample,positions},actors,height,scale,yaw);
   for(let i=0;i<actors.length;i++){
    const p=sample.positions[i],position=actors[i].rig.mesh.parent!.position;
    paths[i].push({at,offset:new T.Vector3(position.x-p.x,0,position.z-p.z),turn:actors[i].rig.mesh.parent!.rotation.y-p.yaw});
   }
  }
  cached={plan,scale,yaw,paths};contactPaths.set(actors,cached);
 }
 const positions=frame.positions.map((p,i)=>{
  const offset=footOffset(cached!.paths[i],time);
  return {...p,x:p.x+offset.x,z:p.z+offset.z,yaw:p.yaw+footTurn(cached!.paths[i],time)};
 });
 return solveBattlePose(plan,time,{...frame,positions},actors,height,scale,yaw,false);
}
