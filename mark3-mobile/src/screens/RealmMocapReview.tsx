import React,{Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,TouchableOpacity,StyleSheet,ScrollView,useWindowDimensions} from 'react-native';
import {Canvas,useFrame,useLoader} from '@react-three/fiber';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils';
import {NativeWeaponKind as WeaponKind,REVIEW_WEAPONS as WEAPONS} from './nativeWeaponRig';
import {createNativeWeapon,clipsForWeapon,weaponClipLabel,nativeWeaponClip} from './nativeWeaponRig';
import {COMBAT_MODELS,CombatModel,NATIVE_CLIPS,NativeClip} from './nativeCombatModels';
import {nativeDeathGround} from './nativeDeathGround';

import RealmDaylight from './RealmDaylight';
import {useRealmMaterial} from './realmAssets';




type Clock={time:number;paused:boolean;speed:number;duration:number};
function Motion({model,weapon,clip,clock,angle,close,onTime,onEnd}:{model:CombatModel;weapon:WeaponKind;clip:NativeClip;clock:Clock;angle:number;close:boolean;onTime:(s:string)=>void;onEnd:()=>void}){
 const asset=useLoader(GLTFLoader,COMBAT_MODELS[model].path);
 const rig=useMemo(()=>{const root=clone(asset.scene);root.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});return {root,mixer:new T.AnimationMixer(root)};},[asset]);
 const equipment=useMemo(()=>createNativeWeapon(rig.root,weapon,asset.animations),[rig,weapon,asset]);
 const ground=useMemo(()=>nativeDeathGround(rig.root),[rig]);
 const action=useMemo(()=>rig.mixer.clipAction(nativeWeaponClip(asset.animations,clip,model==='paladin',weapon)),[rig,asset,clip,model,weapon]);
 useEffect(()=>{rig.mixer.stopAllAction();action.reset().setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();clock.duration=action.getClip().duration;return()=>{action.stop();};},[rig,action,clock]);
 useEffect(()=>()=>equipment.dispose(),[equipment]);
 useEffect(()=>()=>ground.dispose(),[ground]);
 useEffect(()=>()=>{rig.mixer.stopAllAction();rig.mixer.uncacheRoot(rig.root);},[rig]);
 const grass=useRealmMaterial('grass_ground',24);
 const previous=useRef('');
 useFrame(({camera,size},delta)=>{
  const duration=clock.duration;if(!clock.paused){clock.time=Math.min(duration,clock.time+Math.min(delta,.05)*clock.speed);if(clock.time>=duration){clock.paused=true;onEnd();}}
  const time=Math.min(clock.time,duration);action.paused=false;action.enabled=true;rig.mixer.setTime(time);
  const h=0;ground.update(/death/i.test(clip));equipment.update(clip,time,duration);
  const jumping=/jump/i.test(clip),dying=/death/i.test(clip),hips=rig.root.getObjectByName('mixamorigHips')!.getWorldPosition(new T.Vector3());
  const long=weapon==='spear'||weapon==='halberd'||weapon==='bow',aspect=size.width/size.height;
  const distance=close?1.75:weapon==='bow'&&dying?Math.max(5.2,4.4/aspect):Math.max(jumping?5:weapon==='bow'?4.5:long?4.2:weapon==='axe'?3.8:3.4,(long?3.8:3)/aspect);
  const focus=hips.clone();if(weapon==='bow'&&dying&&equipment.prop)focus.lerp(equipment.prop.position,.5);
  camera.position.set(focus.x+Math.sin(angle)*distance,h+1.55,focus.z+Math.cos(angle)*distance);camera.lookAt(focus.x,h+(close?1.2:dying?.5:jumping||weapon==='bow'?1.1:.85),focus.z);
  const text=`${time.toFixed(2)} / ${duration.toFixed(2)}초`;if(text!==previous.current){previous.current=text;onTime(text);}
 });
 return <><color attach="background" args={['#82958c']}/><fog attach="fog" args={['#82958c',10,30]}/><RealmDaylight/><ambientLight intensity={.65}/><mesh rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[60,60]}/><meshStandardMaterial {...grass} roughness={1}/></mesh><primitive object={rig.root} dispose={null}/>{equipment.prop&&<primitive object={equipment.prop} dispose={null}/>}</>;
}
export default function RealmMocapReview(){
 const [model,setModel]=useState<CombatModel>('paladin'),[weapon,setWeapon]=useState<WeaponKind>('sword');
 const [clip,setClip]=useState<NativeClip>('idle'),[paused,setPaused]=useState(false),[slow,setSlow]=useState(false),[angle,setAngle]=useState(-.65),[time,setTime]=useState(''),[close,setClose]=useState(false);
 const clock=useRef<Clock>({time:0,paused:false,speed:1,duration:1}).current,{height}=useWindowDimensions();
 const button=(label:string,action:()=>void,active=false)=><TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={label} onPress={action} style={[s.button,active&&s.active]}><Text style={s.label}>{label}</Text></TouchableOpacity>;
 return <View style={[s.page,{height}]}><View style={s.header}><Text style={s.title}>왕국의 병사 · 외형과 동작</Text><Text style={s.note}>Mixamo 원본 모델·뼈대 · 전투 연결 전 검토</Text></View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.row}><View style={s.controls}>{(Object.entries(COMBAT_MODELS) as [CombatModel,typeof COMBAT_MODELS[CombatModel]][]).map(([key,value])=>button(value.label,()=>{setModel(key);const next=key==='paladin'?weapon:weapon==='sword'?'hatchet':weapon;setWeapon(next);setClip(clipsForWeapon(next,key==='paladin')[0]);clock.time=0;clock.paused=false;setPaused(false);},model===key))}</View></ScrollView>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.row}><View style={s.controls}>{(Object.entries(WEAPONS) as [WeaponKind,typeof WEAPONS[WeaponKind]][]).filter(([key])=>key!=='sword'||model==='paladin').map(([key,value])=>button(value.name,()=>{setWeapon(key);setClip(clipsForWeapon(key,model==='paladin')[0]);clock.time=0;clock.paused=false;setPaused(false);},weapon===key))}</View></ScrollView>
  <Text style={[s.note,{paddingHorizontal:16,paddingBottom:8}]}>{WEAPONS[weapon].name} · 원본 전신 동작 · {weapon==='bow'?'장전 · 조준 · 발사':WEAPONS[weapon].twoHanded?'양손 자루 고정':'한손 무기'}</Text>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.row}><View style={s.controls}>{clipsForWeapon(weapon,model==='paladin').map(key=>button(weaponClipLabel(weapon,key,NATIVE_CLIPS[key]),()=>{setClip(key);clock.time=0;clock.paused=false;setPaused(false);},clip===key))}</View></ScrollView>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.row}><View style={s.controls}>{button(paused?'재생':'일시정지',()=>{if(clock.paused&&clock.time>=clock.duration)clock.time=0;clock.paused=!clock.paused;setPaused(clock.paused);})}{button(slow?'정상 속도':'느리게 보기',()=>{clock.speed=slow?1:.25;setSlow(!slow);})}{button('처음부터',()=>{clock.time=0;})}{button('이전 프레임',()=>{clock.time=Math.max(0,clock.time-1/30);clock.paused=true;setPaused(true);})}{button('다음 프레임',()=>{clock.time=Math.min(clock.duration,clock.time+1/30);clock.paused=true;setPaused(true);})}{button('동작 중간',()=>{clock.time=clock.duration*.5;clock.paused=true;setPaused(true);})}{button(close?'전체 보기':'손·무기 확대',()=>setClose(v=>!v))}{button('왼쪽에서 보기',()=>setAngle(a=>a-.5))}{button('오른쪽에서 보기',()=>setAngle(a=>a+.5))}</View></ScrollView>
  <View style={{flex:1,minHeight:0}}><Canvas shadows dpr={[1,1.5]} camera={{fov:38,near:.01,far:60}} gl={{antialias:true,toneMapping:T.ACESFilmicToneMapping,toneMappingExposure:1.18}}><Suspense fallback={null}><Motion key={model} model={model} weapon={weapon} clip={clip} clock={clock} angle={angle} close={close} onTime={setTime} onEnd={()=>setPaused(true)}/></Suspense></Canvas></View>
  <View style={s.footer}><Text style={s.note}>{weaponClipLabel(weapon,clip,NATIVE_CLIPS[clip])} · {time}</Text>{button('전투 화면',()=>{if(typeof window!=='undefined')window.location.search='?art=1&battle=1';})}</View>
 </View>;
}
const s=StyleSheet.create({page:{flex:1,width:'100%',backgroundColor:'#172521'},header:{padding:16,paddingBottom:10},title:{fontFamily:'serif',fontSize:23,color:'#e2d5b7'},note:{fontSize:12,color:'#acb7ac'},row:{flexGrow:0,flexShrink:0},controls:{flexDirection:'row',gap:6,paddingHorizontal:16,paddingBottom:10},button:{paddingHorizontal:13,paddingVertical:10,borderWidth:1,borderColor:'#596451'},active:{backgroundColor:'#5a664e'},label:{color:'#e5dbc4',fontSize:13},footer:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:12}});
