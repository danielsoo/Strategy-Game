import React,{Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,TouchableOpacity,StyleSheet,ScrollView,useWindowDimensions} from 'react-native';
import {Canvas,useFrame,useLoader} from '@react-three/fiber';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {buildFighter} from './fighterAppearance';
import {poseAuthoredKnight} from './authoredKnightMotion';
import {MOCAP_CLIPS,MocapClip,mocapDuration,sampleMocap} from './mixamoMotion';
import RealmDaylight from './RealmDaylight';
import CampaignLand from './CampaignLand';
import {createGameState} from '../engine';
import {makeRng} from '../services/combatSystem';
import {buildMedievalScene} from './medievalScene';
import {terrainField} from './campaignTerrain';
type Clock={time:number;paused:boolean;speed:number};
function Motion({clip,clock,angle,onTime,onEnd}:{clip:MocapClip;clock:Clock;angle:number;onTime:(s:string)=>void;onEnd:()=>void}){
 const asset=useLoader(GLTFLoader,'/realm/knight/knight.gltf');
 const rig=useMemo(()=>buildFighter(asset.scene,'knight'),[asset]);
 const land=useMemo(()=>{const state=createGameState(2,9,9,makeRng(947));state.cells.forEach(c=>{c.units=0;c.castle=false;c.owner=null;c.terrain='plain';});const ground=buildMedievalScene(state,0,true).ground;return {ground,field:terrainField(ground)};},[]);
 useEffect(()=>()=>rig.dispose(),[rig]);const previous=useRef('');
 useFrame(({camera,size},delta)=>{
  const duration=mocapDuration(clip);if(!clock.paused){clock.time=Math.min(duration,clock.time+Math.min(delta,.05)*clock.speed);if(clock.time>=duration){clock.paused=true;onEnd();}}
  const time=Math.min(clock.time,duration);poseAuthoredKnight(rig,sampleMocap(clip,time));
  const h=land.field.height(0,0);rig.mesh.position.y=h+.015;
  const distance=Math.max(4,4.1/(size.width/size.height));camera.position.set(Math.sin(angle)*distance,h+2.2,Math.cos(angle)*distance);camera.lookAt(0,h+.95,0);
  const text=`${time.toFixed(2)} / ${duration.toFixed(2)}초`;if(text!==previous.current){previous.current=text;onTime(text);}
 });
 return <><color attach="background" args={['#82958c']}/><fog attach="fog" args={['#82958c',10,30]}/><RealmDaylight/><CampaignLand ground={land.ground} onPick={()=>{}}/><primitive object={rig.mesh} dispose={null}/></>;
}
export default function RealmMocapReview(){
 const [clip,setClip]=useState<MocapClip>('slash'),[paused,setPaused]=useState(false),[slow,setSlow]=useState(false),[angle,setAngle]=useState(.35),[time,setTime]=useState('');
 const clock=useRef<Clock>({time:0,paused:false,speed:1}).current,{height}=useWindowDimensions();
 const button=(label:string,action:()=>void,active=false)=><TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={label} onPress={action} style={[s.button,active&&s.active]}><Text style={s.label}>{label}</Text></TouchableOpacity>;
 return <View style={[s.page,{height}]}><View style={s.header}><Text style={s.title}>왕국의 풍경 · 모션 캡처</Text><Text style={s.note}>Mixamo 무료 동작 · 현재 기사 모델에 적용 · 전투 연결 전 검토</Text></View>
  <ScrollView horizontal style={s.row}><View style={s.controls}>{(Object.entries(MOCAP_CLIPS) as [MocapClip,string][]).map(([key,label])=>button(label,()=>{setClip(key);clock.time=0;clock.paused=false;setPaused(false);},clip===key))}</View></ScrollView>
  <ScrollView horizontal style={s.row}><View style={s.controls}>{button(paused?'재생':'일시정지',()=>{if(clock.paused&&clock.time>=mocapDuration(clip))clock.time=0;clock.paused=!clock.paused;setPaused(clock.paused);})}{button(slow?'정상 속도':'느리게 보기',()=>{clock.speed=slow?1:.25;setSlow(!slow);})}{button('처음부터',()=>{clock.time=0;})}{button('이전 프레임',()=>{clock.time=Math.max(0,clock.time-1/30);clock.paused=true;setPaused(true);})}{button('다음 프레임',()=>{clock.time=Math.min(mocapDuration(clip),clock.time+1/30);clock.paused=true;setPaused(true);})}{button('동작 중간',()=>{clock.time=mocapDuration(clip)*.5;clock.paused=true;setPaused(true);})}{button('왼쪽에서 보기',()=>setAngle(a=>a-.5))}{button('오른쪽에서 보기',()=>setAngle(a=>a+.5))}</View></ScrollView>
  <View style={{flex:1,minHeight:0}}><Canvas shadows dpr={[1,1.5]} camera={{fov:38,near:.01,far:60}} gl={{antialias:true,toneMapping:T.ACESFilmicToneMapping,toneMappingExposure:1.18}}><Suspense fallback={null}><Motion clip={clip} clock={clock} angle={angle} onTime={setTime} onEnd={()=>setPaused(true)}/></Suspense></Canvas></View>
  <View style={s.footer}><Text style={s.note}>{MOCAP_CLIPS[clip]} · {time}</Text>{button('전투 화면',()=>{if(typeof window!=='undefined')window.location.search='?art=1&battle=1';})}</View>
 </View>;
}
const s=StyleSheet.create({page:{flex:1,width:'100%',backgroundColor:'#172521'},header:{padding:16,paddingBottom:10},title:{fontFamily:'serif',fontSize:23,color:'#e2d5b7'},note:{fontSize:12,color:'#acb7ac'},row:{flexGrow:0,flexShrink:0},controls:{flexDirection:'row',gap:6,paddingHorizontal:16,paddingBottom:10},button:{paddingHorizontal:13,paddingVertical:10,borderWidth:1,borderColor:'#596451'},active:{backgroundColor:'#5a664e'},label:{color:'#e5dbc4',fontSize:13},footer:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:12}});
