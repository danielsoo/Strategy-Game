import * as T from 'three';
import {AuthoredPose,combatPose,sampleKnightClip,mixKnightPoses,sampleAuthoredDuel,DEATH_START} from './authoredKnightMotion';
import type {BattleFrame,Combatant} from './battleReplay';
import {attackPhase} from './battleReplay';
import {heavyAttackPose,heavyDefensePose} from './heavyCombatMotion';
import {WEAPONS} from './battleWeapons';
const smooth=(n:number)=>{n=T.MathUtils.clamp(n,0,1);return n*n*(3-2*n);};
function heavyImpactPose(guard:AuthoredPose,weight:number){const open=sampleKnightClip('Walk_Loop',.38);for(const j of [8,9,10])guard[j]=open[j];return mixKnightPoses(guard,sampleKnightClip('Hit_Chest',.24),weight*.85);}
export function fighterPose(actor:Combatant,time:number,action:BattleFrame['actions'][number],moving:number|boolean):AuthoredPose{
 const pose=baseFighterPose(actor,time,action,moving),weapon=actor.weapon??'sword';
 const held=1-smooth((time-actor.deathAt)/.45);
 if(weapon==='sword'||!held)return pose;
 if(WEAPONS[weapon].twoHanded){pose[2].q.slerp(new T.Quaternion(),.65*held);pose[4].q.slerp(new T.Quaternion(),.45*held);}
 const dt=action?attackPhase(action.exchange,time):-.65;
 const parryWeight=action?.role==='defend'&&action.exchange.defense==='parry'?smooth((dt+.65)/.25)*(1-smooth((dt-.15)/.33)):0;
 if(weapon==='spear'){
  const attack=action?.role==='attack'&&action.exchange.move!=='shove';
  const extend=attack?smooth((dt+.25)/.25)*(1-smooth((dt-.06)/.35)):0;
  // The thrust is a compact forward drive and withdrawal, never a sword slash.
  const thrust=attack?smooth((dt+.65)/.25)*(1-smooth((dt-.15)/.33)):0;
  pose.weaponPose={wrist:new T.Vector3(-.11,1.18-.10*parryWeight,-.13+extend*.19),direction:new T.Vector3(.18+.27*parryWeight,.65-.50*thrust-.45*parryWeight,1).normalize(),support:.22};
 }else if(WEAPONS[weapon].twoHanded){
  const attacking=action?.role==='attack'&&action.exchange.move!=='shove',load=attacking?smooth((dt+.65)/.3)*(1-smooth((dt+.20)/.20)):0,follow=attacking?smooth(dt/.18)*(1-smooth((dt-.22)/.26)):0;
  const blocked=action?.exchange.defense==='shield'||action?.exchange.defense==='parry';
  const wrist=new T.Vector3(0,1.20,.11).lerp(new T.Vector3(-.015,1.60,.03),load);wrist.y+=follow*(blocked?.08:-.16);wrist.z-=blocked?follow*.10:0;
  const swingDirection=new T.Vector3(.15,.18,1).lerp(new T.Vector3(.05,.86,-.50),load).lerp(blocked?new T.Vector3(.2,.8,.35):new T.Vector3(.15,-.62,.78),follow).normalize();
  const engaged=attacking?smooth((dt+.65)/.18)*(1-smooth((dt-.20)/.28)):0;
  const direction=new T.Vector3(.15,.75,.65).normalize().lerp(swingDirection,engaged).normalize();
  pose.weaponPose={wrist,direction,support:-.18};
  if(parryWeight){pose.weaponPose.wrist!.lerp(new T.Vector3(-.06,1.20,.13),parryWeight);pose.weaponPose.direction!.lerp(new T.Vector3(.65,.75,.40).normalize(),parryWeight).normalize();pose.weaponPose.support=-.18+.38*parryWeight;}
 }
 if(pose.weaponPose?.wrist){pose.weaponPose.wrist.add(pose[0].p.clone().multiplyScalar(.9));if(weapon==='spear')pose.weaponPose.wrist.y-=pose[0].p.y*.9*parryWeight;if(held<1)pose.weaponPose.weight=held;}
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
