import * as T from 'three';
import {AuthoredPose,combatPose,sampleKnightClip,mixKnightPoses,sampleAuthoredDuel,DEATH_START} from './authoredKnightMotion';
import type {BattleFrame,Combatant} from './battleReplay';
import {attackPhase} from './battleReplay';
import {heavyAttackPose,heavyDefensePose} from './heavyCombatMotion';
import {WEAPONS} from './battleWeapons';
import {weaponBodyMotion} from './weaponBodyMotion';
const smooth=(n:number)=>{n=T.MathUtils.clamp(n,0,1);return n*n*(3-2*n);};
const stroke=(dt:number,keys:[number,number][])=>{let i=0;while(i+1<keys.length&&dt>keys[i+1][0])i++;const a=keys[i],b=keys[Math.min(i+1,keys.length-1)];return a[1]+(b[1]-a[1])*smooth((dt-a[0])/(b[0]-a[0]||1));};
function heavyImpactPose(guard:AuthoredPose,weight:number){const open=sampleKnightClip('Walk_Loop',.38);for(const j of [8,9,10])guard[j]=open[j];return mixKnightPoses(guard,sampleKnightClip('Hit_Chest',.24),weight*.85);}
export function fighterPose(actor:Combatant,time:number,action:BattleFrame['actions'][number],moving:number|boolean):AuthoredPose{
 const weapon=actor.weapon??'sword',attacking=weapon!=='sword'&&action?.role==='attack'&&action.exchange.move!=='shove'&&time<actor.deathAt;
 const pose=baseFighterPose(actor,time,attacking?null:action,moving);
 const held=1-smooth((time-actor.deathAt)/.45);
 if(weapon==='sword'||!held)return pose;
 pose[2].q.slerp(new T.Quaternion(),.65*held);pose[4].q.slerp(new T.Quaternion(),.45*held);
 const dt=action?attackPhase(action.exchange,time):-.65;
 if(attacking)weaponBodyMotion(pose,weapon,dt,!!action?.exchange.heavy,action?.exchange.defense==='shield'||action?.exchange.defense==='parry');
 const parryWeight=action?.role==='defend'&&action.exchange.defense==='parry'?smooth((dt+.65)/.25)*(1-smooth((dt-.15)/.33)):0;
 if(weapon==='spear'){
  const attack=action?.role==='attack'&&action.exchange.move!=='shove';
  // The thrust is a compact forward drive and withdrawal, never a sword slash.
  const thrust=attack?smooth((dt+.65)/.25)*(1-smooth((dt-.15)/.33)):0;
  const draw=attack?stroke(dt,[[-.65,0],[-.27,-.04],[0,.10],[.08,.11],[.31,-.025],[.48,0]]):0;
  pose.weaponPose={wrist:new T.Vector3(-.29+draw*.12,1.18+.02*parryWeight,.19+draw),direction:new T.Vector3(.96,.12*(1-thrust)+.12*parryWeight,.28).normalize(),support:.38,shaftLocked:true};
 }else if(WEAPONS[weapon].twoHanded){
  const attacking=action?.role==='attack'&&action.exchange.move!=='shove';
  const blocked=action?.exchange.defense==='shield'||action?.exchange.defense==='parry';
  const halberd=weapon==='halberd';
  const heavy=action?.exchange.heavy,theta=attacking?stroke(dt,[[-.65,.70],[-.26,heavy?-.46:halberd?.03:-.20],[0,1.25],[.13,blocked?1.12:halberd?1.65:1.90],[.30,blocked?.92:1.65],[.48,.70]]):.70;
  const lift=attacking?stroke(dt,[[-.65,0],[-.26,heavy?.32:.23],[0,0],[.13,blocked?.025:-.10],[.30,-.025],[.48,0]]):0;
  const reach=attacking?stroke(dt,[[-.65,0],[-.26,halberd?-.14:-.11],[0,halberd?.09:.06],[.13,blocked?.025:.08],[.48,0]]):0;
  const wrist=new T.Vector3(-.13-reach*.5,1.28+lift,.24+reach),direction=new T.Vector3(-.45,Math.cos(theta),Math.sin(theta)).normalize();
  pose.weaponPose={wrist,direction,edge:new T.Vector3(0,-Math.sin(theta),Math.cos(theta)),support:-.18};
  if(attacking&&action.exchange.cut==='horizontal'&&!heavy){const axis=new T.Vector3(0,0,1),plane=.95*smooth((dt+.65)/.32)*(1-smooth((dt-.20)/.28));direction.applyAxisAngle(axis,plane);pose.weaponPose.edge!.applyAxisAngle(axis,plane);wrist.y-=lift*.35;}
  if(parryWeight){pose.weaponPose.wrist!.lerp(new T.Vector3(-.20,1.23,.24),parryWeight);pose.weaponPose.direction!.lerp(new T.Vector3(.8,.35,.45).normalize(),parryWeight).normalize();pose.weaponPose.support=-.18+.38*parryWeight;}
 }else{
  // Short chopping weapons load at the shoulder, strike, then recover above the hip.
  // They no longer inherit the sword clip's wide wrist-led sweep.
  const attack=action?.role==='attack'&&action.exchange.move!=='shove',blocked=action?.exchange.defense==='shield'||action?.exchange.defense==='parry';
  const flail=weapon==='flail';
  const theta=attack?stroke(dt,[[-.65,.6],[-.23,flail?-.65:-.55],[0,1.35],[.14,blocked?1.16:flail?2.05:2.1],[.48,.6]]):.6;
  const lift=attack?stroke(dt,[[-.65,0],[-.23,.25],[0,-.07],[.14,blocked?-.035:-.15],[.48,0]]):0;
  const reach=attack?stroke(dt,[[-.65,0],[-.23,flail?-.12:-.16],[0,.08],[.14,blocked?.03:.07],[.48,0]]):0;
  const across=attack?stroke(dt,[[-.65,0],[-.23,-.10],[0,.025],[.14,blocked?.015:-.04],[.48,0]]):0;
  pose.weaponPose={wrist:new T.Vector3(-.27+across,1.37+lift,.20+reach),direction:new T.Vector3(-.25,Math.cos(theta),Math.sin(theta)).normalize(),edge:new T.Vector3(0,-Math.sin(theta),Math.cos(theta))};
  if(attack&&action.exchange.cut==='horizontal'&&!action.exchange.heavy){const axis=new T.Vector3(0,0,1),plane=1.05*smooth((dt+.65)/.32)*(1-smooth((dt-.20)/.28));pose.weaponPose.direction!.applyAxisAngle(axis,plane);pose.weaponPose.edge!.applyAxisAngle(axis,plane);pose.weaponPose.wrist!.y-=lift*.35;}
  if(parryWeight){pose.weaponPose.wrist!.lerp(new T.Vector3(-.24,1.39,.21),parryWeight);pose.weaponPose.direction!.lerp(new T.Vector3(.2,.8,.45).normalize(),parryWeight).normalize();}
 }
 pose.weaponPose??={};pose.weaponPose.clearBody=true;
 if(pose.weaponPose.wrist){
  // Author grips relative to the chest so a recoil/turn cannot leave the hands
  // behind the moving breastplate. The final solver also checks parry offsets.
  pose.weaponPose.wrist.sub(new T.Vector3(0,.88,0)).applyQuaternion(pose[2].q).add(new T.Vector3(0,.8,0)).add(new T.Vector3(0,.08,0).applyQuaternion(pose[0].q)).add(pose[0].p.clone().multiplyScalar(.9));
  pose.weaponPose.direction!.applyQuaternion(pose[2].q);
  if(weapon==='spear'){
   const level=smooth((dt+.65)/.25)*(1-smooth((dt-.15)/.33));
   pose.weaponPose.direction!.y=.18*(1-level)+.15*parryWeight;
   pose.weaponPose.direction!.normalize();
  }
  pose.weaponPose.edge?.applyQuaternion(pose[2].q);
 }
 if(held<1)pose.weaponPose.weight=held;
 return pose;
}
function baseFighterPose(actor:Combatant,time:number,action:BattleFrame['actions'][number],moving:number|boolean):AuthoredPose{
 if(time>=actor.deathAt){
  const dt=time-actor.deathAt,f=sampleAuthoredDuel(DEATH_START+dt);
  if(actor.heavyDeath&&dt<.65){const guard=actor.kind==='knight'?combatPose(actor.deathAt):sampleKnightClip('Sword_Idle',(actor.deathAt+actor.id*.17)%1.6666),shock=heavyImpactPose(guard,1);return mixKnightPoses(shock,f.poses[f.loser],smooth(dt/.65));}
  return f.poses[f.loser];
 }
 let guard=actor.kind==='knight'?combatPose(time):sampleKnightClip('Sword_Idle',(time+actor.id*.17)%1.6666);
 if(actor.kind!=='knight'){
  // The empty left hand hangs near the body instead of holding an invisible shield.
  const relaxed=sampleKnightClip('Walk_Loop',.38);for(const j of [8,9,10])guard[j]=relaxed[j];
 }
 const walkWeight=Number(moving)*(actor.heavyDeath?1-smooth((time-actor.deathAt+.10)/.10):1);
 if(walkWeight){const walk=mixKnightPoses(guard,sampleKnightClip('Walk_Loop',(time+actor.id*.19)%1.3333),walkWeight);for(const j of [0,11,12,13,14,15,16])guard[j]=walk[j];}
 if(!action)return guard;
 const dt=attackPhase(action.exchange,time),w=smooth((dt+.65)/.32)*(1-smooth((dt-.05)/.43));
 if(action.exchange.move==='shove'){
  if(action.role==='attack'){
   const brace=sampleKnightClip('Shield_OneShot',.2+smooth((dt+.35)/.35)*.36);
   if(actor.kind!=='knight')for(const j of [5,6,7])brace[j]=guard[j];
   const lean=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),.35);
   for(const j of [2,3,4,5,6,7,8,9,10])brace[j].q.premultiply(lean);
   // Keep a braced blade/forearm rather than swinging a cut during the push.
   return mixKnightPoses(guard,brace,w);
  }
  const recoil=smooth(dt/.12)*(1-smooth((dt-.18)/.3));
  const brace=actor.kind==='knight'?mixKnightPoses(guard,sampleKnightClip('Shield_OneShot',.60),w):guard;
  return mixKnightPoses(brace,sampleKnightClip('Hit_Chest',Math.min(.333,Math.max(0,dt))),recoil*.65);
 }
 if(action.role==='attack'){
  const horizontal=action.exchange.cut==='horizontal',pair=sampleAuthoredDuel((horizontal?3.82:1.62)+dt),pose=pair.poses[horizontal?1:0];if(actor.kind!=='knight')for(const j of [8,9,10])pose[j]=guard[j];
  const cut=mixKnightPoses(guard,pose,w);
  if(action.exchange.heavy)heavyAttackPose(cut,guard,dt,action.exchange.defense==='parry'||action.exchange.defense==='shield');
  if(action.exchange.defense==='parry'&&dt>0){
   const rebound=action.exchange.heavy?mixKnightPoses(sampleKnightClip('Sword_Block',.85),sampleKnightClip('Hit_Chest',.20),.22):sampleKnightClip('Sword_Block',.65);
   return mixKnightPoses(cut,rebound,smooth(dt/.16)*(1-smooth((dt-.18)/.30))*(action.exchange.heavy?.85:.55));
  }
  return cut;
 }
 if(action.exchange.defense==='shield'){const block=mixKnightPoses(guard,sampleAuthoredDuel(1.62+dt).poses[1],w);return action.exchange.heavy?heavyDefensePose(block,guard,dt,true):block;}
 if(action.exchange.defense==='parry'){
  const block=sampleKnightClip('Sword_Block',Math.min(1.23,Math.max(0,.4+dt*(dt>0?1.8:.6))));
  const brace=mixKnightPoses(guard,block,w);return action.exchange.heavy?heavyDefensePose(brace,guard,dt,false):brace;
 }
 if(action.exchange.defense==='hit'){
  // A recorded casualty is an opening in the guard, not a successful shield block.
  if(action.exchange.fatal){const open=mixKnightPoses(guard,sampleKnightClip('Walk_Loop',.38),w);for(const j of [8,9,10])guard[j]=open[j];}
  if(action.exchange.fatal&&action.exchange.heavy&&dt>=0)return heavyImpactPose(guard,smooth((time-action.exchange.at)/.10));
  return dt<0?guard:mixKnightPoses(guard,sampleKnightClip('Hit_Chest',Math.min(.333,dt)),Math.sin(Math.PI*Math.min(1,dt/.48))*.55);
 }
 const crouch=sampleKnightClip('Crouch_Idle_Loop',.6);return mixKnightPoses(guard,crouch,w*.38);
}
