import React,{useEffect,useMemo,useRef} from 'react';
import {useFrame,useLoader} from '@react-three/fiber';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {buildKnightRig,poseKnight} from './knightRig';
import {DUEL_DURATION,Point,sampleDuel} from './duelMotion';

export interface DuelClock {time:number;paused:boolean;speed:number;first:0|1}
/** 같은 표적·시계·접촉점으로 두 사람과 충돌 효과를 함께 갱신한다. */
export default function RealmDuel({clock,startAt,position=[0,0,0],scale=1,yaw=0,onPhase,finishWinner,colors=['#3e89db','#c64e43']}:{clock?:DuelClock;startAt?:number;position?:Point;scale?:number;yaw?:number;onPhase?:(phase:string)=>void;finishWinner?:0|1;colors?:[string,string]}){
 const asset=useLoader(GLTFLoader,'/realm/knight/knight.gltf');
 const rigs=useMemo(()=>[buildKnightRig(asset.scene),buildKnightRig(asset.scene)],[asset]);
 useEffect(()=>()=>rigs.forEach(r=>r.dispose()),[rigs]);
 const roots=useRef<Array<THREE.Group|null>>([]),spark=useRef<THREE.LineSegments>(null),lastPhase=useRef('');
 const sparkGeometry=useMemo(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(12*6),3));return g;},[]);
 useEffect(()=>()=>sparkGeometry.dispose(),[sparkGeometry]);
 useFrame((_,delta)=>{
  if(clock&&!clock.paused)clock.time=(clock.time+Math.min(delta,.05)*clock.speed)%DUEL_DURATION;
  const elapsed=clock?.time??Math.max(0,performance.now()/1000-(startAt??0));
  const frame=sampleDuel(elapsed,clock?.first??0,finishWinner??clock?.first??0);
  frame.fighters.forEach((actor,i)=>{const root=roots.current[i];if(!root)return;root.position.set(...actor.root);root.rotation.y=actor.yaw;poseKnight(rigs[i],actor);});
  if(lastPhase.current!==frame.phase){lastPhase.current=frame.phase;onPhase?.(frame.phase);}
  if(spark.current){spark.current.visible=frame.impact>0;spark.current.position.set(...frame.contact);if(frame.impact>0){
   const age=(1-frame.impact)*.18,p=sparkGeometry.getAttribute('position');
   for(let i=0;i<12;i++)for(let j=0;j<2;j++){const angle=i*2.399,r=age*1.5+j*.035;p.setXYZ(i*2+j,Math.cos(angle)*r,Math.sin(angle*2)*r-age*age*2,Math.sin(angle)*r);}
   p.needsUpdate=true;(spark.current.material as THREE.LineBasicMaterial).opacity=frame.impact;
  }}
 });
 return <group position={position} scale={scale} rotation={[0,yaw,0]}>
  {rigs.map((rig,i)=><group key={i} ref={g=>{roots.current[i]=g;}}>
   <primitive object={rig.mesh} dispose={null}/>
   <mesh position={[0,1.95,0]}><octahedronGeometry args={[.055,0]}/><meshBasicMaterial color={colors[i]}/></mesh>
   <mesh renderOrder={10} rotation={[-Math.PI/2,0,0]} position={[0,.035,0]}><ringGeometry args={[.34,.355,48]}/><meshBasicMaterial color={colors[i]} transparent opacity={.85} depthWrite={false} depthTest={false}/></mesh>
   <mesh position={[0,1.15,-.165]}><boxGeometry args={[.23,.33,.012]}/><meshStandardMaterial color={colors[i]} roughness={.95}/></mesh>
  </group>)}
  <lineSegments ref={spark} geometry={sparkGeometry} frustumCulled={false}><lineBasicMaterial color="#ffd28c" transparent toneMapped={false} blending={THREE.AdditiveBlending}/></lineSegments>
 </group>;
}
