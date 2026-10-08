import React,{useEffect,useMemo} from 'react';
import * as T from 'three';
import {useFrame,useLoader} from '@react-three/fiber';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {COMBAT_MODELS} from './nativeCombatModels';
import {armyFighter} from './armyAppearance';
import {createDuelActor} from './nativeDuel';
import {createNativeSquad} from './nativeSquad';
import {nativeBattlePlan} from './nativeBattlePlan';
import {fighterKind} from './battleReplay';
import {ArmyEvent,animationNow} from './armyTimeline';
import {MAP_SOLDIER_SCALE} from './realmLayout';
import type {terrainField} from './campaignTerrain';

/** The small map replay uses the same actor factory/director as the full film. */
export default function NativeMapBattle({event,field}:{event:ArmyEvent;field:ReturnType<typeof terrainField>}){
 const kinds=[fighterKind(event.from.cell.neutral),fighterKind(event.to.cell.neutral)] as const;
 const assets=useLoader(GLTFLoader,kinds.map(kind=>COMBAT_MODELS[armyFighter(kind).model].path));
 const squad=useMemo(()=>{
  const plan=nativeBattlePlan(event.track.combatResult!);
  const teams=[0,1].map(side=>plan.actors.filter(a=>a.side===side).map(a=>createDuelActor(assets[side],armyFighter(kinds[side],a.slot)))) as [ReturnType<typeof createDuelActor>[],ReturnType<typeof createDuelActor>[]];
  return createNativeSquad(teams,plan,6);
 },[assets[0],assets[1],event]);
 useEffect(()=>()=>squad.dispose(),[squad]);
 const x=event.track.from[0]*.5+event.track.to[0]*.5,z=event.track.from[2]*.5+event.track.to[2]*.5;
 const yaw=Math.atan2(event.track.to[0]-event.track.from[0],event.track.to[2]-event.track.from[2])-Math.PI/2,scale=MAP_SOLDIER_SCALE;
 useFrame(()=>{
  const elapsed=Math.max(0,animationNow()-event.track.start),progress=Math.min(1,elapsed/event.track.duration);
  squad.update(progress*squad.duration);
  squad.actors.forEach(a=>{const p=a.visual.position;const wx=x+scale*(p.x*Math.cos(yaw)+p.z*Math.sin(yaw)),wz=z+scale*(-p.x*Math.sin(yaw)+p.z*Math.cos(yaw));p.y+=field.height(wx,wz)/scale;a.visual.updateMatrixWorld(true);a.root.traverse(o=>{if(o instanceof T.SkinnedMesh)o.skeleton.update();});});
 });
 return <group position={[x,.006,z]} scale={scale} rotation={[0,yaw,0]}>{squad.actors.map((a,i)=><primitive key={i} object={a.visual} dispose={null}/>)}</group>;
}
