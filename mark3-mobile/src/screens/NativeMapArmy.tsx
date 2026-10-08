import React,{useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {useFrame,useLoader} from '@react-three/fiber';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {COMBAT_MODELS} from './nativeCombatModels';
import {armyFighter} from './armyAppearance';
import {fighterKind} from './battleReplay';
import type {DuelFighter} from './nativeDuel';
import {buildNativeFormation,FORMATION_FRAMES} from './nativeFormationModel';
import {armyFormation} from './realmLayout';
import {animationNow,ArmyTrack} from './armyTimeline';
import {sampleArmyMarch} from './armyMarch';
import {terrainField} from './campaignTerrain';
import type {Ground} from './medievalScene';

type Place={tile:Ground;slot:ReturnType<typeof armyFormation>[number]};
function Batch({fighter,places,tracks,ground}:{fighter:DuelFighter;places:Place[];tracks:Map<string,ArmyTrack>;ground:Ground[]}){
 const asset=useLoader(GLTFLoader,COMBAT_MODELS[fighter.model].path);
 const model=useMemo(()=>buildNativeFormation(asset,fighter),[asset,fighter.model,fighter.weapon]);
 const mesh=useRef<T.InstancedMesh>(null),object=useMemo(()=>new T.Object3D(),[]);
 const motion=useMemo(()=>new T.InstancedBufferAttribute(new Float32Array(places.length*3),3),[places.length]);
 const field=useMemo(()=>terrainField(ground),[ground]);
 useLayoutEffect(()=>{model.geometry.setAttribute('formationMotion',motion);},[model,motion]);
 useEffect(()=>()=>model.dispose(),[model]);
 useFrame(()=>{
  if(!mesh.current)return;const now=animationNow();
  places.forEach(({tile,slot},i)=>{
   const track=tracks.get(tile.cell.id),march=track?.march;
   const p=march?sampleArmyMarch(march,slot.index,now-track!.start):null;
   const x=p?.x??tile.position[0]+slot.x,z=p?.z??tile.position[2]+slot.z,scale=p?.scale??slot.scale;
   object.position.set(x,field.height(x,z)+.006,z);object.rotation.set(0,p?.yaw??slot.yaw,0);object.scale.setScalar(scale);object.updateMatrix();mesh.current!.setMatrixAt(i,object.matrix);
   // Ease captured walking legs in/out without moving the tile-centre route.
   const walk=p?.moving?Math.min(1,(now-track!.start-march!.turnTime)/.18,(track!.start+march!.duration-march!.turnTime-now)/.18):0;
   const phase=slot.index*.21+(tile.owner??7)*.07;
   motion.setXYZ(i,Math.max(0,walk),(now/model.idleDuration+phase)%1*FORMATION_FRAMES,((p?.distance??0)/(scale*1.45)+phase)%1*FORMATION_FRAMES);
  });
  mesh.current.instanceMatrix.needsUpdate=true;motion.needsUpdate=true;
 });
 return <instancedMesh key={places.length} ref={mesh} args={[model.geometry,model.materials,places.length]} customDepthMaterial={model.depth} castShadow receiveShadow frustumCulled={false} raycast={()=>{}} dispose={null}/>;
}
export default function NativeMapArmy({ground,tracks}:{ground:Ground[];tracks:Map<string,ArmyTrack>}){
 const batches=useMemo(()=>{
  const groups=new Map<string,{fighter:DuelFighter;places:Place[]}>();
  for(const tile of ground)for(const slot of armyFormation(tile)){
   const fighter=armyFighter(fighterKind(tile.cell.neutral),slot.index),key=`${fighter.model}/${fighter.weapon}`;
   if(!groups.has(key))groups.set(key,{fighter,places:[]});groups.get(key)!.places.push({tile,slot});
  }
  return [...groups];
 },[ground]);
 return <>{batches.map(([key,batch])=><Batch key={key} {...batch} ground={ground} tracks={tracks}/>)}</>;
}
