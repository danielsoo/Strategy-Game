import React,{useMemo} from 'react';
import {ArmyTrack,BattleCue,useArmyTimeline} from './armyTimeline';
import NativeMapBattle from './NativeMapBattle';
import NativeMapArmy from './NativeMapArmy';
import type {Ground} from './medievalScene';
import {terrainField} from './campaignTerrain';
export default function RealmArmy({ground:live,battles,renderStandard}:{ground:Ground[];battles?:BattleCue[];renderStandard?:(tile:Ground,track?:ArmyTrack)=>React.ReactNode}){
  const contactField=useMemo(()=>terrainField(live),[live]);
  const {ground:displayGround,tracks,events}=useArmyTimeline(live,battles);
  const ground=useMemo(()=>displayGround.map(g=>tracks.get(g.cell.id)?.battle?{...g,cell:{...g.cell,units:0}}:g),[displayGround,tracks]);
  return <group><NativeMapArmy ground={ground} tracks={tracks}/>{events.filter(e=>e.track.battle&&e.track.combatResult).map(e=><NativeMapBattle key={e.from.cell.id+'-'+e.track.start} event={e} field={contactField}/>)}{renderStandard&&displayGround.filter(g=>g.seen&&g.cell.units>0).map((g,i)=><React.Fragment key={`standard-${g.cell.id}-${i}`}>{renderStandard(g,tracks.get(g.cell.id))}</React.Fragment>)}</group>;
}
