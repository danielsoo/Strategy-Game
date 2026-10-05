import React,{useMemo,useEffect,useRef} from 'react';
import {useFrame,useLoader} from '@react-three/fiber';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {BattleReplay,bakeBattleMovement,replayStage,FIGHTER_NAMES} from './battleReplay';
import {buildFighter} from './fighterAppearance';
import {poseBattleActors} from './battleContacts';
import {buildDuelContacts} from './duelContacts';
import {ASH_START,ASH_DURATION,DEATH_START} from './authoredKnightMotion';
import {buildKnightAsh} from './knightAsh';
import type {DuelClock} from './RealmDuel';
import type {Point} from './duelMotion';
import {WEAPONS} from './battleWeapons';

/** Bounded representative formations; equipment and casualties follow the resolved combat log. */
export default function RealmBattle({plan,clock,startAt=0,position=[0,0,0],scale=1,yaw=0,surfaceHeight,colors=['#3e89db','#bf473c'],onPhase}:{plan:BattleReplay;clock?:DuelClock;startAt?:number;position?:Point;scale?:number;yaw?:number;surfaceHeight?:(x:number,z:number)=>number;colors?:[string,string];onPhase?:(s:string)=>void}){
 const asset=useLoader(GLTFLoader,'/realm/knight/knight.gltf');
 const actors=useMemo(()=>plan.actors.map(a=>{const rig=buildFighter(asset.scene,a.kind,colors[a.side],a.weapon);return {rig,shape:buildDuelContacts(rig),ash:buildKnightAsh(rig,650)};}),[asset,plan]);
 const movement=useMemo(()=>bakeBattleMovement(plan),[plan]),groups=useRef<Array<T.Group|null>>([]),markers=useRef<Array<T.Group|null>>([]),root=useRef<T.Group>(null),lastPhase=useRef('');
 const sparks=useMemo(()=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(plan.actors.length*12*6),3));return g;},[plan]),spark=useRef<T.LineSegments>(null);
 useEffect(()=>()=>{actors.forEach(a=>{a.ash.dispose();a.rig.dispose();});sparks.dispose();},[actors,sparks]);
 useFrame((_,delta)=>{
  if(clock&&!clock.paused)clock.time=(clock.time+Math.min(delta,.05)*clock.speed)%plan.duration;
  const time=clock?.time??Math.max(0,performance.now()/1000-startAt),frame=movement.sample(time),stage=replayStage(plan,time);
  if(groups.current.filter(Boolean).length!==actors.length)return;
  const height=(x:number,z:number)=>surfaceHeight?(surfaceHeight(position[0]+scale*(x*Math.cos(yaw)+z*Math.sin(yaw)),position[2]+scale*(-x*Math.sin(yaw)+z*Math.cos(yaw)))-position[1])/scale:0;
  root.current?.updateMatrixWorld(true);
  const contacts=poseBattleActors(plan,time,frame,actors,height,scale,yaw);
  let sparkCount=0;const vertices=sparks.getAttribute('position');
  actors.forEach(({ash},i)=>{
   const actor=plan.actors[i],g=groups.current[i]!,p=frame.positions[i],deadTime=time-actor.deathAt;
   const ashTime=deadTime-(ASH_START-DEATH_START);ash.update(T.MathUtils.clamp(ashTime/ASH_DURATION,0,1),ashTime);
   if(markers.current[i])markers.current[i]!.visible=deadTime<0;
   g.visible=ashTime<ASH_DURATION+2.1;
  });
  for(const event of plan.exchanges){const dt=time-event.at;if(dt<0||dt>.10||event.defense==='dodge'||event.move==='shove')continue;
   const contact=contacts.get(event.attacker)?.clone();
   if(!contact||!root.current)continue;root.current.worldToLocal(contact);
   for(let k=0;k<12;k++)for(let end=0;end<2;end++){const angle=k*2.399,r=(dt*2+end*.025)*(event.heavy&&event.defense==='parry'?1.8:1);vertices.setXYZ(sparkCount++,contact.x+Math.cos(angle)*r,contact.y+Math.sin(angle*2)*r,contact.z+Math.sin(angle)*r);}
  }
  sparks.setDrawRange(0,sparkCount);vertices.needsUpdate=true;if(spark.current)spark.current.visible=sparkCount>0;
  const names=[0,1].map(side=>FIGHTER_NAMES[plan.actors.find(a=>a.side===side)?.kind??'knight']);
  const result=plan.outcome==='stalemate'?'교착 · 양측 이탈':plan.outcome==='attacker-win'?'공격측 승리':'방어측 승리';
  const active=frame.actions.find(a=>a?.role==='attack')?.exchange;
  const weapon=WEAPONS[active?plan.actors[active.attacker].weapon??'sword':'sword'];
  const dying=plan.actors.find(a=>a.heavyDeath&&time>=a.deathAt&&time<a.deathAt+2.2);
  const actionLabel=active?`${FIGHTER_NAMES[plan.actors[active.attacker].kind]} ${active.move==='shove'?'밀쳐내기':`${active.counterOf!==undefined?'반격 · ':''}${active.heavy?'강공격 · ':''}${weapon.name==='검'?(active.cut==='horizontal'?'횡베기':'사선베기'):weapon.action}`} · ${active.move==='shove'?'뒤로 물러나 균형 회복':active.defense==='shield'?'방패 방어':active.defense==='parry'?(active.heavy?'강공격 패링 · 공격자 경직':'패링 · 무기 쳐내기'):active.defense==='dodge'?'옆걸음 회피':active.heavy&&active.fatal?'치명타 · 쓰러짐':'피격'}`:dying?'강공격 치명타 · 힘을 잃고 쓰러집니다':'간격 조절';
  const heavyPhase=active?.heavy?time<active.at?(weapon.name==='창'?'창을 거두어 찌르기 준비':weapon.name+' 강타 준비'):active.defense==='parry'||active.defense==='shield'?time<active.at+.22?'무릎을 굽혀 충격을 버팁니다':active.defense==='parry'?'공격을 옆으로 흘려내며 반격 준비':'방패를 밀어 올려 간격 회복':actionLabel:actionLabel;
  const label=`${names[0]} ${stage.counts[0]} / ${names[1]} ${stage.counts[1]} · ${dying?actionLabel:time>plan.finish?result:time<1.8&&!active?'접근 중':heavyPhase} · 최종 생존 ${plan.final[0]} : ${plan.final[1]}`;
  if(label!==lastPhase.current){lastPhase.current=label;onPhase?.(label);}
 });
 return <group ref={root} position={position} scale={scale} rotation={[0,yaw,0]}>
  {actors.map(({rig},i)=><group key={i} name={`realm-battle-actor-${i}`} ref={g=>{groups.current[i]=g;}}><primitive object={rig.mesh} dispose={null}/><group ref={g=>{markers.current[i]=g;}}>
   <mesh position={[0,1.95,0]}><octahedronGeometry args={[.06,0]}/><meshBasicMaterial color={colors[plan.actors[i].side]}/></mesh>
   <mesh rotation={[-Math.PI/2,0,0]} position={[0,.032,0]}><ringGeometry args={[.36,.375,32]}/><meshBasicMaterial color={colors[plan.actors[i].side]} transparent opacity={.7} depthWrite={false}/></mesh>
  </group></group>)}
  <lineSegments ref={spark} geometry={sparks} frustumCulled={false}><lineBasicMaterial color="#ffdb9b" toneMapped={false}/></lineSegments>
 </group>;
}
