import React,{Suspense,useEffect,useMemo,useState,useRef} from 'react';
import {View,Text,TouchableOpacity,StyleSheet,useWindowDimensions} from 'react-native';
import {Canvas,useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {createGameState} from '../engine';
import {makeRng} from '../services/combatSystem';
import {buildMedievalScene} from './medievalScene';
import {buildSettlement} from './realmSettlement';
import {terrainField} from './campaignTerrain';
import CampaignLand from './CampaignLand';
import RealmModels from './RealmModels';
import RealmArmy from './RealmKnight';
import {DUEL_DURATION} from './duelMotion';
import {AUTHORED_CONTACT_TIMES as CONTACT_TIMES,DEATH_START,ASH_START} from './authoredKnightMotion';
import RealmDuel,{DuelClock} from './RealmDuel';
import type {ArmyAction} from './armyAnimation';
import RealmDaylight from './RealmDaylight';
import RealmGrass from './RealmGrass';
import RealmLandscape from './RealmLandscape';
import {Instances,SHAPES} from './Board3D';

const names=['왕실 성채','수도원 도시','변경 성','군대 대열','병사 대련','숲과 지면'];
function SceneReady({onReady}:{onReady:(ready:boolean)=>void}){useEffect(()=>onReady(true),[onReady]);return null;}
/** 실제 게임과 같은 모델·재질·배치 코드. 저장이나 게임 서버 요청은 하지 않는다. */
function ReviewScene({variant,angle,action,clock,onPhase,closeup}:{variant:number;angle:number;action:ArmyAction;clock:DuelClock;closeup:boolean;onPhase:(phase:string)=>void}){
  const scene=useMemo(()=>{
    const state=createGameState(2,9,9,makeRng(947));
    state.cells.forEach(c=>{c.units=0;c.castle=false;c.fortStage=0;c.owner=null;c.terrain=variant===5&&c.col<4?'forest':'plain';c.hasRoad=false;});
    const center=state.cells.find(c=>c.row===4&&c.col===[4,3,5,4,4,4][variant])!;center.castle=variant<3;center.units=variant===5?0:10;center.owner=0;
    const original=buildMedievalScene(state,0,true),tile=original.ground.find(g=>g.cell.id===center.id)!;
    const ground=original.ground.map(g=>({...g,position:[g.position[0]-tile.position[0],g.position[1],g.position[2]-tile.position[2]] as [number,number,number]}));
    const selected=ground.find(g=>g.cell.id===center.id)!;
    const field=terrainField(ground),pieces=Object.fromEntries(SHAPES.map(k=>[k,[]])) as ReturnType<typeof buildMedievalScene>['pieces'];
    if(variant<3)buildSettlement(selected,(shape,x,y,z,sx,sy,sz,color,rotation)=>pieces[shape].push({position:[x,field.height(x,z)+y,z],scale:[sx,sy,sz],color,rotation}));
    return {ground,field,pieces};
  },[variant]);
  useFrame(({camera,size})=>{const h=scene.field.height(0,0),fit=Math.max(1,1.1/(size.width/size.height)),distance=(variant===3?1.05:variant===4?(closeup?2.7:4.6):variant===5?1.7:2.7)*fit;camera.position.set(Math.sin(angle)*distance,h+(variant===3?.44:variant===4?(closeup?1.7:2.0):variant===5?.5:1.85)*fit,Math.cos(angle)*distance);camera.lookAt(0,h+(variant===3?.055:variant===4?(closeup?1.2:.85):.15),variant===3?.07:0);});
  return <>
    <color attach="background" args={['#82958c']}/><fog attach="fog" args={['#82958c',7,18]}/>
    <RealmDaylight/>
    <CampaignLand ground={scene.ground} onPick={()=>{}}/>
    {variant<3&&<><RealmModels ground={scene.ground}/><RealmLandscape ground={scene.ground}/>{SHAPES.map(shape=><Instances key={shape} shape={shape} pieces={scene.pieces[shape]}/>)}</>}
    {variant!==5&&variant!==4&&<RealmArmy ground={scene.ground} detail={variant===4} action={action}/>}
    {variant===4&&<RealmDuel clock={clock} position={[0,scene.field.height(0,0)+.005,0]} surfaceHeight={scene.field.surfaceHeight} onPhase={onPhase}/>}
    {variant===5&&<RealmModels ground={scene.ground} architecture={false}/>}
    {variant!==4&&<RealmGrass ground={scene.ground}/>}
  </>;
}
export default function RealmArtReview(){
  const [variant,setVariant]=useState(()=>typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('nature')==='1'?5:typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('unit')==='1'?4:0),[angle,setAngle]=useState(.35);
  const clock=useRef<DuelClock>({time:0,paused:false,speed:1,first:0}).current;
  const [closeup,setCloseup]=useState(false),[reviewCut,setReviewCut]=useState(0);
  const [phase,setPhase]=useState('방패를 세우고 상대를 살핍니다'),[paused,setPaused]=useState(false),[slow,setSlow]=useState(false);
  const [action,setAction]=useState<ArmyAction>('idle');
  const [ready,setReady]=useState(false);
  const capture=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('capture')==='1';
  const {height}=useWindowDimensions();
  return <View style={[styles.page,{height,maxHeight:height}]}>
    {!capture&&<><View style={styles.header}><Text style={styles.title}>왕국의 풍경</Text><Text style={styles.note}>대련 동작 7 · 지면·장비 접촉 보정</Text></View>
    <View style={styles.tabs}>{names.map((name,i)=><TouchableOpacity key={name} accessibilityRole="button" accessibilityLabel={name} onPress={()=>setVariant(i)} style={[styles.button,variant===i&&styles.active]}><Text style={styles.label}>{name}</Text></TouchableOpacity>)}</View>{variant===3&&<View style={styles.tabs}>{([['idle','대기'],['walk','걷기']] as [ArmyAction,string][]).map(([mode,label])=><TouchableOpacity key={mode} accessibilityRole="button" accessibilityLabel={label} onPress={()=>setAction(mode)} style={[styles.button,action===mode&&styles.active]}><Text style={styles.label}>{label}</Text></TouchableOpacity>)}</View>}{variant===4&&<><View style={styles.tabs}>{([
      ['아군 선공',()=>{clock.first=0;clock.time=0;clock.paused=false;setPaused(false);}],
      ['사선베기',()=>{setReviewCut(0);clock.time=CONTACT_TIMES[0]-.7;clock.paused=false;setPaused(false);}],
      ['횡베기',()=>{setReviewCut(1);clock.time=CONTACT_TIMES[1]-.7;clock.paused=false;setPaused(false);}],
      ['적군 선공',()=>{clock.first=1;clock.time=0;clock.paused=false;setPaused(false);}],
      ['사망 모션',()=>{setCloseup(false);clock.time=DEATH_START-.35;clock.paused=false;setPaused(false);}],
      ['먼지 소멸',()=>{setCloseup(false);clock.time=ASH_START+1.2;clock.paused=true;setPaused(true);}],
      [paused?'재생':'일시정지',()=>{clock.paused=!clock.paused;setPaused(clock.paused);}],
      [slow?'정상 속도':'느리게 보기',()=>{clock.speed=slow?1:.3;setSlow(!slow);}],
      ['접촉 순간',()=>{clock.time=CONTACT_TIMES[reviewCut];clock.paused=true;setPaused(true);}],
      [closeup?'전체 자세':'손목 확대',()=>setCloseup(!closeup)],
      ['준비 자세',()=>{clock.time=CONTACT_TIMES[reviewCut]-.34;clock.paused=true;setPaused(true);}],
      ['이전 단계',()=>{clock.time=Math.max(0,clock.time-.08);clock.paused=true;setPaused(true);}],
      ['한 단계',()=>{clock.time=(clock.time+.08)%DUEL_DURATION;clock.paused=true;setPaused(true);}],
    ] as [string,()=>void][]).map(([label,fn])=><TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={label} onPress={fn} style={styles.button}><Text style={styles.label}>{label}</Text></TouchableOpacity>)}</View><Text style={[styles.note,{paddingHorizontal:16,paddingBottom:8}]}>푸른 원: 아군 · 붉은 원: 적군 — {phase}</Text></>}</>}
    <View style={{flex:1,minHeight:0,overflow:'hidden'}}>{!ready&&<View style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center'}]}><Text style={styles.note}>왕국의 건축과 풍경을 불러오고 있습니다</Text></View>}<Canvas shadows dpr={[1,1.5]} camera={{fov:38,near:.005,far:80}} gl={{antialias:true,toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1.18}}><Suspense fallback={null}><ReviewScene variant={variant} angle={angle} action={action} clock={clock} onPhase={setPhase} closeup={closeup}/><SceneReady onReady={setReady}/></Suspense></Canvas></View>
    {!capture&&<View style={styles.footer}><TouchableOpacity accessibilityRole="button" accessibilityLabel="왼쪽에서 보기" style={styles.button} onPress={()=>setAngle(a=>a-.5)}><Text style={styles.label}>↶ 왼쪽</Text></TouchableOpacity><Text style={styles.note}>{variant===5?'입체 수목 · 풀 · 낙엽과 흙':variant===4?'베기·방어 → 반격 → 쓰러짐 → 먼지 소멸':variant===3?'병사 모델 · 대열과 크기 검토':variant===0?'영주관 · 예배당 · 시장과 시가지':variant===1?'석조 수도원 · 시장 · 골목과 주택':'목조 요새 · 장원 · 변경 마을'}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="오른쪽에서 보기" style={styles.button} onPress={()=>setAngle(a=>a+.5)}><Text style={styles.label}>오른쪽 ↷</Text></TouchableOpacity></View>}
  </View>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#172521'},header:{padding:16,paddingBottom:8},title:{fontSize:24,color:'#e2d5b7',fontFamily:'serif'},note:{fontSize:12,color:'#a9b4a6',flexShrink:1},tabs:{flexDirection:'row',flexWrap:'wrap',gap:6,paddingHorizontal:16,paddingBottom:12},button:{paddingHorizontal:14,paddingVertical:10,borderWidth:1,borderColor:'#596451'},active:{backgroundColor:'#5a664e'},label:{fontSize:13,color:'#e5dbc4'},footer:{padding:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}});
