import * as T from 'three';
import {AuthoredPose,combatPose,sampleKnightClip,mixKnightPoses,sampleAuthoredDuel,DEATH_START} from './authoredKnightMotion';
import type {BattleFrame,Combatant} from './battleReplay';
const smooth=(n:number)=>{n=T.MathUtils.clamp(n,0,1);return n*n*(3-2*n);};
export function fighterPose(actor:Combatant,time:number,action:BattleFrame['actions'][number],moving:boolean):AuthoredPose{
 if(time>=actor.deathAt){const f=sampleAuthoredDuel(DEATH_START+time-actor.deathAt);return f.poses[f.loser];}
 let guard=actor.kind==='knight'?combatPose(time):sampleKnightClip('Sword_Idle',(time+actor.id*.17)%1.6666);
 if(actor.kind!=='knight'){
  // The empty left hand hangs near the body instead of holding an invisible shield.
  const relaxed=sampleKnightClip('Walk_Loop',.38);for(const j of [8,9,10])guard[j]=relaxed[j];
 }
 if(moving){const walk=sampleKnightClip('Walk_Loop',(time+actor.id*.19)%1.3333);for(const j of [0,11,12,13,14,15,16])guard[j]=walk[j];}
 if(!action)return guard;
 const dt=time-action.exchange.at,w=smooth((dt+.65)/.32)*(1-smooth((dt-.05)/.43));
 if(action.role==='attack'){
  const pair=sampleAuthoredDuel(1.62+dt);if(actor.kind!=='knight')for(const j of [8,9,10])pair.poses[0][j]=guard[j];return mixKnightPoses(guard,pair.poses[0],w);
 }
 if(action.exchange.defense==='shield')return mixKnightPoses(guard,sampleAuthoredDuel(1.62+dt).poses[1],w);
 if(action.exchange.defense==='parry')return mixKnightPoses(guard,sampleKnightClip('Sword_Block',Math.min(1.23,Math.max(0,(dt+.65)*1.1))),w);
 if(action.exchange.defense==='hit'){
  // A recorded casualty is an opening in the guard, not a successful shield block.
  if(action.exchange.fatal){const open=mixKnightPoses(guard,sampleKnightClip('Walk_Loop',.38),w);for(const j of [8,9,10])guard[j]=open[j];}
  return dt<0?guard:mixKnightPoses(guard,sampleKnightClip('Hit_Chest',Math.min(.333,dt)),Math.sin(Math.PI*Math.min(1,dt/.48))*.55);
 }
 const crouch=sampleKnightClip('Crouch_Idle_Loop',.6);return mixKnightPoses(guard,crouch,w*.38);
}
