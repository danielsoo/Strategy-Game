import React,{Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,TouchableOpacity,StyleSheet,ScrollView,useWindowDimensions} from 'react-native';
import {Canvas,useFrame,useLoader} from '@react-three/fiber';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {COMBAT_MODELS,CombatModel} from './nativeCombatModels';
import {NativeWeaponKind,REVIEW_WEAPONS} from './nativeWeaponRig';
import {createDuelActor,DuelFighter} from './nativeDuel';
import RealmDaylight from './RealmDaylight';
import {useRealmMaterial} from './realmAssets';
import {createNativeSquad,proficiencyLabel} from './nativeSquad';
import {nativeBattlePlan,NativeBattlePlan} from './nativeBattlePlan';
import {DetailedCombatResult,resolveCombat,makeRng,DEFAULT_COMBAT_CONFIG} from '../services/combatSystem';
import type {FighterKind} from './battleReplay';
import {armyFighter,formationFighter} from './armyAppearance';

type Clock={time:number;paused:boolean;speed:number;duration:number;contacts:number[];flights:number[];shots:number[];failures:number[];encirclements:number[];interceptions:number[];exposures:number[]};
function previewTroops():[number,number]{const preset=typeof window==='undefined'?null:new URLSearchParams(window.location.search).get('squad');return preset==='2v1'?[2,1]:preset==='1v2'?[1,2]:preset==='3v1'?[3,1]:preset==='1v3'?[1,3]:[3,3];}
function Scene({fighters,plan,mixed,range,clock,angle,onState,onReady}:{fighters:[DuelFighter,DuelFighter];plan:NativeBattlePlan;mixed:boolean;range:number;clock:Clock;angle:number;onState:(s:string,c:number[])=>void;onReady:()=>void}){
 const first=useLoader(GLTFLoader,COMBAT_MODELS[fighters[0].model].path),second=useLoader(GLTFLoader,COMBAT_MODELS[fighters[1].model].path);
 const duel=useMemo(()=>{
  const teams=[0,1].map(side=>plan.actors.filter(a=>a.side===side).map(a=>{
   return createDuelActor(side===0?first:second,formationFighter(fighters[side],a.slot,mixed));
  })) as [ReturnType<typeof createDuelActor>[],ReturnType<typeof createDuelActor>[]];
  return createNativeSquad(teams,plan,range);
 },[first,second,fighters,plan,mixed,range]);
 const framing=useMemo(()=>{
  const bounds=new T.Box3();duel.update(0);duel.actors.forEach(a=>bounds.expandByPoint(a.visual.position));
  duel.engagements.forEach(e=>{e.routes.flat().forEach(p=>bounds.expandByPoint(p));e.finish.forEach(p=>bounds.expandByPoint(p.position));e.duel.positionsAt(e.duel.events[0].contact).forEach(p=>bounds.expandByPoint(p.applyAxisAngle(new T.Vector3(0,1,0),e.yaw).add(e.origin)));});
  return bounds;
 },[duel]);
 useEffect(()=>{clock.duration=duel.duration;clock.contacts=duel.contacts;clock.failures=duel.failures;clock.shots=duel.shots;clock.flights=duel.flights;clock.encirclements=duel.engagements.filter(e=>e.opening!==undefined).map(e=>e.contact-.03);clock.exposures=duel.engagements.filter(e=>e.vulnerability==='attack').map(e=>e.contact-.04);clock.interceptions=duel.engagements.filter(e=>e.interception).map(e=>e.contact-.25);onReady();return()=>duel.dispose();},[duel]);
 const grass=useRealmMaterial('grass_ground',24),effect=useRef<T.Group>(null),last=useRef('');
 useFrame(({camera,size},delta)=>{
  if(!clock.paused)clock.time=Math.min(duel.duration,clock.time+Math.min(delta,.05)*clock.speed);
  const state=duel.update(clock.time),finished=clock.time>=duel.duration;if(finished)clock.paused=true;
  const text=`${state.phase} · ${clock.time.toFixed(1)} / ${duel.duration.toFixed(1)}초`,key=text+(finished?'done':'');if(last.current!==key){last.current=key;onState(text,state.counts);}
  // Hold the shot through the exchange. Following changing body bounds on
  // every frame makes each lunge/death zoom and slide the entire battlefield.
  const bounds=framing,focus=bounds.getCenter(new T.Vector3()),span=bounds.getSize(new T.Vector3()).length();
  const distance=Math.max(fighters[0].weapon==='bow'&&range>8?13:5.4,(span+3)/(.56*(size.width/size.height)));
  const loft=fighters[0].weapon==='bow'&&range>8;
  if(duel.actors.length>2){
   // Fit all three ranks, including the nearest soldier's feet. A low duel
   // camera clips the front rank when the controls leave a short canvas.
   const tanV=Math.tan(19*Math.PI/180),tanH=tanV*size.width/size.height;
   const back=new T.Vector3(Math.sin(angle-.35),.65,Math.cos(angle-.35)).normalize(),right=new T.Vector3(0,1,0).cross(back).normalize(),up=back.clone().cross(right);
   focus.y=loft?1.8:1;let fit=4;
   for(const x of [bounds.min.x-.85,bounds.max.x+.85])for(const z of [bounds.min.z-.85,bounds.max.z+.85])for(const y of [0,loft?5:2.5]){
    const v=new T.Vector3(x,y,z).sub(focus),depth=v.dot(back);fit=Math.max(fit,depth+Math.abs(v.dot(right))/tanH,depth+Math.abs(v.dot(up))/tanV);
   }
   camera.position.copy(focus).addScaledVector(back,fit*1.06);camera.lookAt(focus);
  }else{camera.position.set(focus.x+Math.sin(angle)*distance,loft?5:2.6,focus.z+Math.cos(angle)*distance);camera.lookAt(focus.x,loft?2:.85,focus.z);}
  if(effect.current)effect.current.children.forEach((group,k)=>{const contact=state.contacts[k];group.visible=!!contact;if(contact){group.position.copy(contact.point);const p=contact.age/.22;group.children.forEach((o,i)=>{o.position.set(Math.sin(i*2.4)*p*.28,Math.cos(i*1.7)*p*.28,-p*.05);o.scale.setScalar((1-p)*.6+.05);});}});
 });
 return <><color attach="background" args={['#82958c']}/><fog attach="fog" args={['#82958c',50,120]}/><RealmDaylight/><ambientLight intensity={.65}/><mesh rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[160,160]}/><meshStandardMaterial {...grass} roughness={1}/></mesh>
  {duel.actors.map((a,i)=><React.Fragment key={i}><primitive object={a.visual} dispose={null}/><Follower actor={a.visual} color={duel.sides[i]===0?'#5babec':'#db6253'}/></React.Fragment>)}
  <group ref={effect}>{Array.from({length:3},(_,k)=><group key={k} visible={false}>{Array.from({length:8},(_,i)=><mesh key={i} rotation={[i,i*.7,i*.4]}><boxGeometry args={[.018,.10,.018]}/><meshBasicMaterial color="#ffda88"/></mesh>)}</group>)}</group>
 </>;
}
function Follower({actor,color}:{actor:T.Group;color:string}){const ref=useRef<T.Group>(null);useFrame(()=>{ref.current?.position.set(actor.position.x,.016,actor.position.z);});return <group ref={ref}><mesh rotation-x={-Math.PI/2}><ringGeometry args={[.38,.405,48]}/><meshBasicMaterial color={color} transparent opacity={.8} depthWrite={false}/></mesh></group>;}

export default function RealmMocapDuel({onSingle,result,kinds=['knight','knight'],onClose}:{onSingle?:()=>void;result?:DetailedCombatResult;kinds?:[FighterKind,FighterKind];onClose?:()=>void}){
 const [troops,setTroops]=useState<[number,number]>(previewTroops),[ranks,setRanks]=useState<[number,number]>([1,1]),[model,setModel]=useState<CombatModel>('paladin'),[weapon,setWeapon]=useState<NativeWeaponKind>('sword'),[opponent,setOpponent]=useState<CombatModel>('paladin'),[record,setRecord]=useState(41),[stalemate,setStalemate]=useState(false),[mixed,setMixed]=useState(true),[details,setDetails]=useState(false),[paused,setPaused]=useState(false),[slow,setSlow]=useState(false),[angle,setAngle]=useState(-.23),[range,setRange]=useState(6),[ready,setReady]=useState(false),[status,setStatus]=useState('동작을 불러오는 중'),[counts,setCounts]=useState([3,3]);
 const {height}=useWindowDimensions(),clock=useRef<Clock>({time:0,paused:false,speed:1,duration:1,contacts:[],flights:[],shots:[],failures:[],encirclements:[],interceptions:[],exposures:[]}).current;
 const resolved=useMemo(()=>result??resolveCombat({units:troops[0],morale:100},{units:troops[1],morale:100},makeRng(record),stalemate?{...DEFAULT_COMBAT_CONFIG,maxRounds:2,baseLossRate:0,routThreshold:0}:undefined),[result,troops,record,stalemate]);
 const plan=useMemo(()=>nativeBattlePlan(resolved),[resolved]);
 const fighters=useMemo<[DuelFighter,DuelFighter]>(()=>{
  if(result)return kinds.map(k=>armyFighter(k)) as [DuelFighter,DuelFighter];
  return [{model,weapon},{model:opponent,weapon:opponent==='paladin'?'sword':opponent==='arissa'?'hatchet':'axe'}];
 },[result,kinds[0],kinds[1],model,weapon,opponent]);
 useEffect(()=>{clock.time=0;clock.paused=false;setPaused(false);setCounts(plan.initial);},[plan]);
 function reset(){clock.time=0;clock.paused=false;setPaused(false);}
 const button=(label:string,fn:()=>void,active=false)=><TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={label} onPress={fn} style={[s.button,active&&s.active]}><Text style={s.label}>{label}</Text></TouchableOpacity>;
 const row=(children:React.ReactNode)=><ScrollView horizontal style={s.row} showsHorizontalScrollIndicator={false}><View style={s.controls}>{children}</View></ScrollView>;
 return <View style={[s.page,{height}]}><View style={s.header}><Text style={s.title}>왕국의 병사 · 공방</Text><Text style={s.note}>{result?'이번 지도 전투의 확정 기록':'게임 전투 엔진으로 계산한 예시 기록'} · 푸른 원 공격측 / 붉은 원 방어측</Text></View>
  {!result&&<>{row(([[1,1],[2,1],[1,2],[3,1],[1,3],[3,3],[12,12],[60,60]] as [number,number][]).map(([a,b])=>button(`${a} 대 ${b}`,()=>{setTroops([a,b]);reset();},troops[0]===a&&troops[1]===b)))}
  {row(button(details?'부대·무기 설정 접기':'부대·무기 설정',()=>setDetails(v=>!v)))}
  {details&&<>{row(<>{button(`아군 ${proficiencyLabel(ranks[0])}`,()=>setRanks(r=>[(r[0]+1)%4,r[1]]))}{button(`적군 ${proficiencyLabel(ranks[1])}`,()=>setRanks(r=>[r[0],(r[1]+1)%4]))}<Text style={[s.note,{alignSelf:'center'}]}>별은 숙련도 · 병력과 별도 표시</Text></>)}
  {row((Object.entries(COMBAT_MODELS) as [CombatModel,typeof COMBAT_MODELS[CombatModel]][]).map(([key,value])=>button(`아군 ${value.label}`,()=>{setModel(key);if(key!=='paladin'&&weapon==='sword')setWeapon('hatchet');reset();},model===key)))}
  {row(Object.entries(REVIEW_WEAPONS).filter(([key])=>key!=='sword'||model==='paladin').map(([key,value])=>button(value.name,()=>{setWeapon(key as NativeWeaponKind);reset();},weapon===key)))}
  {weapon==='bow'&&row(<>{button('가까운 거리 · 6m',()=>{setRange(6);reset();},range===6)}{button('먼 거리 · 18m 곡사',()=>{setRange(18);reset();},range===18)}{button('발사 순간',()=>{clock.time=clock.shots.find(t=>t>clock.time+.03)??clock.shots[0]??0;clock.paused=true;setPaused(true);})}{button('화살 비행 중간',()=>{clock.time=clock.flights.find(t=>t>clock.time+.03)??clock.flights[0]??0;clock.paused=true;setPaused(true);})}</>)}
  {row(([['paladin','상대 기사 · 검과 방패'],['erika','상대 용병 · 전투도끼'],['arissa','상대 도적 · 손도끼']] as const).map(([key,label])=>button(label,()=>{setOpponent(key);reset();},opponent===key)))}
  {row(<>{button(mixed?'혼성 무기':'동일 무기',()=>{setMixed(v=>!v);reset();},mixed)}{button('다른 전투 기록',()=>{setRecord(r=>r+1);setStalemate(false);reset();})}{button('교착 기록',()=>{setStalemate(true);reset();},stalemate)}</>)}</>}</>}
  <Text style={[s.note,{paddingHorizontal:16,paddingBottom:8}]}>확정 결과: {plan.outcome==='stalemate'?'교착':plan.outcome==='attacker-win'?'공격측 승리':'방어측 승리'} · 최종 생존 {plan.final[0]} : {plan.final[1]}</Text>
  {row(<>{onClose&&button('결과표 보기',onClose)}{button(paused?'재생':'일시정지',()=>{if(clock.time>=clock.duration)clock.time=0;clock.paused=!clock.paused;setPaused(clock.paused);})}{button('다시 보기',()=>{clock.time=0;clock.paused=false;setPaused(false);})}{button(slow?'정상 속도':'느리게 보기',()=>{clock.speed=slow?1:.25;setSlow(!slow);})}{clock.interceptions.length>0&&button('우회 저지',()=>{clock.time=clock.interceptions.find(t=>t>clock.time+.03)??clock.interceptions[0];clock.paused=true;setPaused(true);})}{clock.exposures.length>0&&button('공격 중 빈틈',()=>{clock.time=clock.exposures.find(t=>t>clock.time+.03)??clock.exposures[0];clock.paused=true;setPaused(true);})}{clock.encirclements.length>0&&button('협공 순간',()=>{clock.time=clock.encirclements.find(t=>t>clock.time+.03)??clock.encirclements[0];clock.paused=true;setPaused(true);})}{button('접촉 순간',()=>{clock.time=clock.contacts.find(t=>t>clock.time+.03)??clock.contacts[0]??0;clock.paused=true;setPaused(true);})}{button('방어 실패 직전',()=>{clock.time=(clock.failures.find(t=>t>clock.time+.04)??clock.failures[0]??.02)-.02;clock.paused=true;setPaused(true);})}{button('피격 반응',()=>{clock.time=(clock.failures.find(t=>t>=clock.time-.25)??clock.failures[0]??0)+.2;clock.paused=true;setPaused(true);})}{button('이전 프레임',()=>{clock.time=Math.max(0,clock.time-1/30);clock.paused=true;setPaused(true);})}{button('다음 프레임',()=>{clock.time=Math.min(clock.duration,clock.time+1/30);clock.paused=true;setPaused(true);})}{button('반대쪽 보기',()=>setAngle(a=>a+Math.PI))}{onSingle&&button('개별 동작 보기',onSingle)}{button('최종 결과',()=>{clock.time=clock.duration;clock.paused=true;setPaused(true);})}</>)}
  <View style={s.health}><Text style={{color:'#90caf6',fontSize:12,flex:1}}>공격측 {counts[0]} / {plan.initial[0]}명{!result&&` · ${proficiencyLabel(ranks[0])}`}</Text><Text style={{color:'#f39c90',fontSize:12,flex:1,textAlign:'right'}}>방어측 {counts[1]} / {plan.initial[1]}명{!result&&` · ${proficiencyLabel(ranks[1])}`}</Text></View>
  <View style={{flex:1,minHeight:0}}>{!ready&&<Text style={s.loading}>병사와 공방 동작을 준비하고 있습니다…</Text>}<Canvas shadows dpr={[1,1.5]} camera={{fov:38,near:.01,far:150}} gl={{antialias:true,toneMapping:T.ACESFilmicToneMapping,toneMappingExposure:1.18}}><Suspense fallback={null}><Scene fighters={fighters} plan={plan} mixed={mixed} range={range} clock={clock} angle={angle} onReady={()=>setReady(true)} onState={(text,h)=>{setStatus(text);setCounts(h);if(clock.paused)setPaused(true);}}/></Suspense></Canvas></View>
  <Text style={s.footer}>{status}</Text>
 </View>;
}
const s=StyleSheet.create({page:{width:'100%',backgroundColor:'#172521'},header:{padding:14,paddingBottom:8},title:{fontFamily:'serif',fontSize:23,color:'#e2d5b7'},note:{fontSize:12,color:'#acb7ac',marginTop:4},row:{flexGrow:0,flexShrink:0},controls:{flexDirection:'row',gap:6,paddingHorizontal:14,paddingBottom:8},button:{paddingHorizontal:12,paddingVertical:9,borderWidth:1,borderColor:'#596451'},active:{backgroundColor:'#5a664e'},label:{color:'#e5dbc4',fontSize:13},health:{flexDirection:'row',justifyContent:'space-between',paddingHorizontal:18,paddingBottom:9},loading:{position:'absolute',zIndex:2,top:'45%',alignSelf:'center',color:'#e5dbc4'},footer:{padding:12,color:'#c2caba',fontSize:12}});
