import React,{useEffect,useMemo,useRef} from 'react';
import {useFrame,useLoader} from '@react-three/fiber';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {ASH_START,buildAuthoredKnight,sampleAuthoredDuel} from './authoredKnightMotion';
import {buildKnightAsh} from './knightAsh';
import {buildDuelContacts,resolveDuelContacts} from './duelContacts';
import {DUEL_DURATION,Point} from './duelMotion';

export interface DuelClock {time:number;paused:boolean;speed:number;first:0|1}
/** 같은 표적·시계·접촉점으로 두 사람과 충돌 효과를 함께 갱신한다. */
export default function RealmDuel({clock,startAt,position=[0,0,0],scale=1,yaw=0,onPhase,finishWinner,surfaceHeight,colors=['#3e89db','#c64e43']}:{clock?:DuelClock;startAt?:number;position?:Point;scale?:number;yaw?:number;onPhase?:(phase:string)=>void;finishWinner?:0|1;surfaceHeight?:(x:number,z:number)=>number;colors?:[string,string]}){
 const asset=useLoader(GLTFLoader,'/realm/knight/knight.gltf');
 const rigs=useMemo(()=>[buildAuthoredKnight(asset.scene),buildAuthoredKnight(asset.scene)],[asset]);
 const ashes=useMemo(()=>rigs.map(r=>buildKnightAsh(r)),[rigs]);
 const contacts=useMemo(()=>rigs.map(buildDuelContacts),[rigs]);
 const sceneRoot=useRef<THREE.Group>(null);
 useEffect(()=>()=>{ashes.forEach(a=>a.dispose());rigs.forEach(r=>r.dispose());},[rigs,ashes]);
 const markers=useRef<Array<THREE.Group|null>>([]);
 const roots=useRef<Array<THREE.Group|null>>([]),spark=useRef<THREE.LineSegments>(null),lastPhase=useRef('');
 const sparkGeometry=useMemo(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(12*6),3));return g;},[]);
 useEffect(()=>()=>sparkGeometry.dispose(),[sparkGeometry]);
 useFrame((_,delta)=>{
  if(clock&&!clock.paused)clock.time=(clock.time+Math.min(delta,.05)*clock.speed)%DUEL_DURATION;
  const elapsed=clock?.time??Math.max(0,performance.now()/1000-(startAt??0));
  const frame=sampleAuthoredDuel(elapsed,clock?.first??0,finishWinner??clock?.first??0),contact=new THREE.Vector3();
  if(!roots.current[0]||!roots.current[1])return;
  sceneRoot.current?.updateMatrixWorld(true);
  const terrain=(x:number,z:number)=>surfaceHeight?(surfaceHeight(position[0]+scale*(x*Math.cos(yaw)+z*Math.sin(yaw)),position[2]+scale*(-x*Math.sin(yaw)+z*Math.cos(yaw)))-position[1])/scale:0;
  const resolved=resolveDuelContacts(rigs,contacts,frame,terrain);
  frame.poses.forEach((_,i)=>{
   ashes[i].update(i===frame.loser?frame.ash:0,elapsed-ASH_START);
   if(markers.current[i])markers.current[i]!.visible=!(i===frame.loser&&frame.deathTime>0);
  });
  if(resolved.contact&&sceneRoot.current)contact.copy(sceneRoot.current.worldToLocal(resolved.contact.clone()));
  if(lastPhase.current!==frame.phase){lastPhase.current=frame.phase;onPhase?.(frame.phase);}
  if(spark.current){spark.current.visible=frame.impact>0&&!!resolved.contact;spark.current.position.copy(contact);if(frame.impact>0){
   const age=(1-frame.impact)*.18,p=sparkGeometry.getAttribute('position');
   for(let i=0;i<12;i++)for(let j=0;j<2;j++){const angle=i*2.399,r=age*1.5+j*.035;p.setXYZ(i*2+j,Math.cos(angle)*r,Math.sin(angle*2)*r-age*age*2,Math.sin(angle)*r);}
   p.needsUpdate=true;(spark.current.material as THREE.LineBasicMaterial).opacity=frame.impact;
  }}
 });
 return <group ref={sceneRoot} position={position} scale={scale} rotation={[0,yaw,0]}>
  {rigs.map((rig,i)=><group key={i} ref={g=>{roots.current[i]=g;}}>
   <primitive object={rig.mesh} dispose={null}/>
   <group ref={g=>{markers.current[i]=g;}}>
   <mesh position={[0,1.95,0]}><octahedronGeometry args={[.055,0]}/><meshBasicMaterial color={colors[i]}/></mesh>
   <mesh renderOrder={10} rotation={[-Math.PI/2,0,0]} position={[0,.035,0]}><ringGeometry args={[.34,.355,48]}/><meshBasicMaterial color={colors[i]} transparent opacity={.85} depthWrite={false} depthTest={false}/></mesh>
   </group>
  </group>)}
  <lineSegments ref={spark} geometry={sparkGeometry} frustumCulled={false}><lineBasicMaterial color="#ffd28c" transparent toneMapped={false} blending={THREE.AdditiveBlending}/></lineSegments>
 </group>;
}
