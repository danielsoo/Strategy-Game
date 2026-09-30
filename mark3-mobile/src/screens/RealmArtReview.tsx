import React,{Suspense,useEffect,useMemo,useState} from 'react';
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
import RealmArmy from './RealmArmy';
import RealmLandscape from './RealmLandscape';
import {Instances,SHAPES} from './Board3D';

const names=['왕실 성채','수도원 도시','변경 성','군대 대열'];
function SceneReady({onReady}:{onReady:(ready:boolean)=>void}){useEffect(()=>onReady(true),[onReady]);return null;}
/** 실제 게임과 같은 모델·재질·배치 코드. 저장이나 게임 서버 요청은 하지 않는다. */
function ReviewScene({variant,angle}:{variant:number;angle:number}){
  const scene=useMemo(()=>{
    const state=createGameState(2,9,9,makeRng(947));
    state.cells.forEach(c=>{c.units=0;c.castle=false;c.fortStage=0;c.owner=null;c.terrain='plain';c.hasRoad=false;});
    const center=state.cells.find(c=>c.row===4&&c.col===[4,3,5,4][variant])!;center.castle=variant<3;center.units=10;center.owner=0;
    const original=buildMedievalScene(state,0,true),tile=original.ground.find(g=>g.cell.id===center.id)!;
    const ground=original.ground.map(g=>({...g,position:[g.position[0]-tile.position[0],g.position[1],g.position[2]-tile.position[2]] as [number,number,number]}));
    const selected=ground.find(g=>g.cell.id===center.id)!;
    const field=terrainField(ground),pieces=Object.fromEntries(SHAPES.map(k=>[k,[]])) as ReturnType<typeof buildMedievalScene>['pieces'];
    if(variant<3)buildSettlement(selected,(shape,x,y,z,sx,sy,sz,color,rotation)=>pieces[shape].push({position:[x,field.height(x,z)+y,z],scale:[sx,sy,sz],color,rotation}));
    return {ground,field,pieces};
  },[variant]);
  useFrame(({camera,size})=>{const h=scene.field.height(0,0),fit=Math.max(1,1.1/(size.width/size.height)),distance=(variant===3?1.05:2.7)*fit;camera.position.set(Math.sin(angle)*distance,h+(variant===3?.44:1.85)*fit,Math.cos(angle)*distance);camera.lookAt(0,h+(variant===3?.055:.15),variant===3?.07:0);});
  return <>
    <color attach="background" args={['#82958c']}/><fog attach="fog" args={['#82958c',7,18]}/>
    <hemisphereLight args={['#d6e2e7','#434935',1.1]}/>
    <directionalLight position={[-4,8,5]} color="#fff0db" intensity={2.7} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={4} shadow-camera-bottom={-4} shadow-camera-near={.1} shadow-camera-far={30} shadow-bias={-.00015} shadow-normalBias={.012}/>
    <CampaignLand ground={scene.ground} onPick={()=>{}}/>
    {variant<3&&<><RealmModels ground={scene.ground}/><RealmLandscape ground={scene.ground}/>{SHAPES.map(shape=><Instances key={shape} shape={shape} pieces={scene.pieces[shape]}/>)}</>}
    <RealmArmy ground={scene.ground}/>
  </>;
}
export default function RealmArtReview(){
  const [variant,setVariant]=useState(0),[angle,setAngle]=useState(.35);
  const [ready,setReady]=useState(false);
  const capture=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('capture')==='1';
  const {height}=useWindowDimensions();
  return <View style={[styles.page,{height,maxHeight:height}]}>
    {!capture&&<><View style={styles.header}><Text style={styles.title}>왕국의 풍경</Text><Text style={styles.note}>게임에 적용된 성과 군대 · 실제 3D 모델</Text></View>
    <View style={styles.tabs}>{names.map((name,i)=><TouchableOpacity key={name} accessibilityRole="button" accessibilityLabel={name} onPress={()=>setVariant(i)} style={[styles.button,variant===i&&styles.active]}><Text style={styles.label}>{name}</Text></TouchableOpacity>)}</View></>}
    <View style={{flex:1,minHeight:0,overflow:'hidden'}}>{!ready&&<View style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center'}]}><Text style={styles.note}>왕국의 건축과 풍경을 불러오고 있습니다</Text></View>}<Canvas shadows dpr={[1,1.5]} camera={{fov:38,near:.005,far:80}} gl={{antialias:true,toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:1.18}}><Suspense fallback={null}><ReviewScene variant={variant} angle={angle}/><SceneReady onReady={setReady}/></Suspense></Canvas></View>
    {!capture&&<View style={styles.footer}><TouchableOpacity accessibilityRole="button" accessibilityLabel="왼쪽에서 보기" style={styles.button} onPress={()=>setAngle(a=>a-.5)}><Text style={styles.label}>↶ 왼쪽</Text></TouchableOpacity><Text style={styles.note}>{variant===3?'방패병 · 장창병 · 궁수 · 기마 지휘관':variant===0?'영주관 · 예배당 · 시장과 시가지':variant===1?'석조 수도원 · 시장 · 골목과 주택':'목조 요새 · 장원 · 변경 마을'}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="오른쪽에서 보기" style={styles.button} onPress={()=>setAngle(a=>a+.5)}><Text style={styles.label}>오른쪽 ↷</Text></TouchableOpacity></View>}
  </View>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#172521'},header:{padding:16,paddingBottom:8},title:{fontSize:24,color:'#e2d5b7',fontFamily:'serif'},note:{fontSize:12,color:'#a9b4a6',flexShrink:1},tabs:{flexDirection:'row',flexWrap:'wrap',gap:6,paddingHorizontal:16,paddingBottom:12},button:{paddingHorizontal:14,paddingVertical:10,borderWidth:1,borderColor:'#596451'},active:{backgroundColor:'#5a664e'},label:{fontSize:13,color:'#e5dbc4'},footer:{padding:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}});
