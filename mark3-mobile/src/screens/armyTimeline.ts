import {useLayoutEffect,useRef,useState} from 'react';
import {useFrame} from '@react-three/fiber';
import type {AttackOutcome} from '../engine';
import type {Ground,V3} from './medievalScene';
import type {ArmyAction} from './armyAnimation';
import {createBattleReplay,fighterKind,BattleReplay} from './battleReplay';
import {FIELD_WEAPONS} from './battleWeapons';
export type BattleCue=AttackOutcome&{sequence:number};
export interface ArmyTrack {from:V3;to:V3;start:number;duration:number;battle:boolean;defender?:boolean;win?:boolean;formationZ?:number;replay?:BattleReplay}
export const animationNow=()=>performance.now()/1000;
const copy=(g:Ground):Ground=>({...g,position:[...g.position],cell:{...g.cell}});
export function visibleMoves(previous:Ground[],next:Ground[]){
 const old=new Map(previous.map(g=>[g.cell.id,g])),current=new Map(next.map(g=>[g.cell.id,g]));
 return next.flatMap(to=>{
  const from=to.cell.lastFrom?old.get(to.cell.lastFrom):undefined,was=old.get(to.cell.id),nowFrom=from&&current.get(from.cell.id);
  if(!to.seen||!from?.seen||!nowFrom||from.cell.units<=0||to.cell.units<=0||to.owner!==from.owner||nowFrom.cell.units>=from.cell.units||to.cell.units<=(was?.cell.units??0))return [];
  if(Math.hypot(from.position[0]-to.position[0],from.position[2]-to.position[2])>1.8)return [];
  return [{from,to,was}];
 });
}
export function sampleTrack(track:ArmyTrack,now:number):{progress:number;action:ArmyAction}{
 const t=Math.max(0,Math.min(1,(now-track.start)/track.duration));
 if(!track.battle)return {progress:t,action:t<1?'walk':'idle'};
 if(track.defender)return {progress:0,action:'idle'};
 if(t<.25)return {progress:t/.25*.62,action:'walk'};
 if(t<.82)return {progress:.62,action:'idle'};
 const finish=Math.max(0,Math.min(1,(t-.82)/.18));
 return {progress:track.win?.62+finish*.38:.62*(1-finish),action:'walk'};
}
/** 이전 화면에 보였던 부대만 재생한다. 저장 게임과 전투 판정은 변경하지 않는다. */
export function useArmyTimeline(ground:Ground[],battles:BattleCue[]=[]){
 const previous=useRef<Ground[]>(ground.map(copy)),lastBattle=useRef(0);
 const [events,setEvents]=useState<Array<{from:Ground;to:Ground;was?:Ground;track:ArmyTrack}>>([]);
 useLayoutEffect(()=>{
  const start=animationNow(),old=new Map(previous.current.map(g=>[g.cell.id,g]));
  const next:Array<{from:Ground;to:Ground;was?:Ground;track:ArmyTrack}>=[];
  for(const cue of battles){if(cue.sequence<=lastBattle.current)continue;lastBattle.current=cue.sequence;
   const from=old.get(cue.fromId),to=old.get(cue.toId);
   if(!from?.seen||!to?.seen||!cue.result.rounds.length)continue;
   const kinds=[fighterKind(from.cell.neutral),fighterKind(to.cell.neutral)] as const;
   const replay=createBattleReplay(cue.result,[...kinds],10,[FIELD_WEAPONS[kinds[0]],FIELD_WEAPONS[kinds[1]]]);
   next.push({from:copy(from),to:copy(to),track:{from:from.position,to:to.position,start,duration:replay.duration+.6,battle:true,win:cue.capturedCell,formationZ:from.castle?.92:0,replay}});
  }
  const fighting=new Set(next.flatMap(e=>[e.from.cell.id,e.to.cell.id]));
  for(const move of visibleMoves(previous.current,ground))if(!fighting.has(move.from.cell.id)&&!fighting.has(move.to.cell.id))next.push({...move,from:copy(move.from),to:copy(move.to),was:move.was&&copy(move.was),track:{from:move.from.position,to:move.to.position,start,duration:1.5,battle:false}});
  previous.current=ground.map(copy);
  if(next.length)setEvents(next);
 },[ground,battles]);
 useFrame(()=>{if(events.length&&events.every(e=>animationNow()>e.track.start+e.track.duration))setEvents([]);});
 const tracks=new Map<string,ArmyTrack>(),hidden=new Set(events.flatMap(e=>[e.from.cell.id,e.to.cell.id]));
 const display=ground.map(g=>hidden.has(g.cell.id)?{...g,cell:{...g.cell,units:0}}:g);
 for(const e of events){display.push(e.from);tracks.set(e.from.cell.id,e.track);
  if(e.track.battle){display.push(e.to);tracks.set(e.to.cell.id,{...e.track,from:e.to.position,to:e.from.position,defender:true,formationZ:e.to.castle?.92:0});}
  else if(e.was&&e.was.cell.units>0)display.push(e.was);
 }
 return {ground:display,tracks,events};
}
