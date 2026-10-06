import React,{Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {View,Text,TouchableOpacity,StyleSheet,ScrollView,useWindowDimensions} from 'react-native';
import {Canvas,useFrame,useLoader} from '@react-three/fiber';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {COMBAT_MODELS,CombatModel} from './nativeCombatModels';
import {NativeWeaponKind,REVIEW_WEAPONS} from './nativeWeaponRig';
import {createDuelActor,createNativeDuel,duelEvents,DuelFighter,DuelSide} from './nativeDuel';
import RealmDaylight from './RealmDaylight';
import {useRealmMaterial} from './realmAssets';
import {createNativeSquad,representativeCount,proficiencyLabel} from './nativeSquad';

type Clock={time:number;paused:boolean;speed:number;duration:number;contacts:number[];flights:number[];shots:number[];failures:number[]};
function Scene({fighters,troops,winner,range,clock,angle,onState,onReady}:{fighters:[DuelFighter,DuelFighter];troops:[number,number];winner:DuelSide;range:number;clock:Clock;angle:number;onState:(s:string,h:number[])=>void;onReady:()=>void}){
 const first=useLoader(GLTFLoader,COMBAT_MODELS[fighters[0].model].path),second=useLoader(GLTFLoader,COMBAT_MODELS[fighters[1].model].path);
 const duel=useMemo(()=>{
  const teams=[Array.from({length:representativeCount(troops[0])},()=>createDuelActor(first,fighters[0])),Array.from({length:representativeCount(troops[1])},()=>createDuelActor(second,fighters[1]))] as [ReturnType<typeof createDuelActor>[],ReturnType<typeof createDuelActor>[]];
  if(teams[0].length+teams[1].length>2)return createNativeSquad(teams,winner,range);
  const pair=createNativeDuel([teams[0][0],teams[1][0]],duelEvents(winner,fighters[0].weapon==='bow'),range);
  return {actors:pair.actors,sides:[0,1],duration:pair.duration,contacts:pair.events.map(e=>e.contact),failures:pair.events.filter(e=>e.outcome!=='block').map(e=>e.contact),shots:pair.events.filter(e=>e.flight>0).map(e=>e.contact-e.flight-.001),flights:pair.events.filter(e=>e.flight>0).map(e=>e.contact-e.flight/2),update(t:number){const s=pair.update(t);return {...s,contacts:s.contact?[s.contact]:[]};},dispose:pair.dispose};
 },[first,second,fighters,troops,winner,range]);
 useEffect(()=>{clock.duration=duel.duration;clock.contacts=duel.contacts;clock.failures=duel.failures;clock.shots=duel.shots;clock.flights=duel.flights;onReady();return()=>duel.dispose();},[duel]);
 const grass=useRealmMaterial('grass_ground',24),effect=useRef<T.Group>(null),last=useRef('');
 useFrame(({camera,size},delta)=>{
  if(!clock.paused)clock.time=Math.min(duel.duration,clock.time+Math.min(delta,.05)*clock.speed);
  const state=duel.update(clock.time),finished=clock.time>=duel.duration;if(finished)clock.paused=true;
  const text=`${state.phase} · ${clock.time.toFixed(1)} / ${duel.duration.toFixed(1)}초`,key=text+(finished?'done':'');if(last.current!==key){last.current=key;onState(text,state.health);}
  const bounds=new T.Box3();duel.actors.forEach(a=>bounds.expandByPoint(a.visual.position));const focus=bounds.getCenter(new T.Vector3()),span=bounds.getSize(new T.Vector3()).length();
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

export default function RealmMocapDuel({onSingle}:{onSingle:()=>void}){
 const [troops,setTroops]=useState<[number,number]>([3,3]),[ranks,setRanks]=useState<[number,number]>([1,1]),[model,setModel]=useState<CombatModel>('paladin'),[weapon,setWeapon]=useState<NativeWeaponKind>('sword'),[opponent,setOpponent]=useState<CombatModel>('paladin'),[winner,setWinner]=useState<DuelSide>(0),[paused,setPaused]=useState(false),[slow,setSlow]=useState(false),[angle,setAngle]=useState(-.23),[range,setRange]=useState(6),[ready,setReady]=useState(false),[status,setStatus]=useState('동작을 불러오는 중'),[health,setHealth]=useState([100,100]);
 const {height}=useWindowDimensions(),clock=useRef<Clock>({time:0,paused:false,speed:1,duration:1,contacts:[],flights:[],shots:[],failures:[]}).current;
 const fighters=useMemo<[DuelFighter,DuelFighter]>(()=>[{model,weapon},{model:opponent,weapon:opponent==='paladin'?'sword':opponent==='arissa'?'hatchet':'axe'}],[model,weapon,opponent]);
 function reset(){clock.time=0;clock.paused=false;setPaused(false);}
 const button=(label:string,fn:()=>void,active=false)=><TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={label} onPress={fn} style={[s.button,active&&s.active]}><Text style={s.label}>{label}</Text></TouchableOpacity>;
 const row=(children:React.ReactNode)=><ScrollView horizontal style={s.row} showsHorizontalScrollIndicator={false}><View style={s.controls}>{children}</View></ScrollView>;
 return <View style={[s.page,{height}]}><View style={s.header}><Text style={s.title}>왕국의 병사 · 공방</Text><Text style={s.note}>푸른 원 아군 · 붉은 원 적군 · 모의 공방</Text></View>
  {row(([[1,1],[3,1],[1,3],[3,3],[12,12],[60,60]] as [number,number][]).map(([a,b])=>button(`${a} 대 ${b}`,()=>{setTroops([a,b]);reset();},troops[0]===a&&troops[1]===b)))}
  {row(<>{button(`아군 ${proficiencyLabel(ranks[0])}`,()=>setRanks(r=>[(r[0]+1)%4,r[1]]))}{button(`적군 ${proficiencyLabel(ranks[1])}`,()=>setRanks(r=>[r[0],(r[1]+1)%4]))}<Text style={[s.note,{alignSelf:'center'}]}>별은 숙련도 · 병력과 별도 표시</Text></>)}
  {row((Object.entries(COMBAT_MODELS) as [CombatModel,typeof COMBAT_MODELS[CombatModel]][]).map(([key,value])=>button(`아군 ${value.label}`,()=>{setModel(key);if(key!=='paladin'&&weapon==='sword')setWeapon('hatchet');reset();},model===key)))}
  {row(Object.entries(REVIEW_WEAPONS).filter(([key])=>key!=='sword'||model==='paladin').map(([key,value])=>button(value.name,()=>{setWeapon(key as NativeWeaponKind);reset();},weapon===key)))}
  {weapon==='bow'&&row(<>{button('가까운 거리 · 6m',()=>{setRange(6);reset();},range===6)}{button('먼 거리 · 18m 곡사',()=>{setRange(18);reset();},range===18)}{button('발사 순간',()=>{clock.time=clock.shots.find(t=>t>clock.time+.03)??clock.shots[0]??0;clock.paused=true;setPaused(true);})}{button('화살 비행 중간',()=>{clock.time=clock.flights.find(t=>t>clock.time+.03)??clock.flights[0]??0;clock.paused=true;setPaused(true);})}</>)}
  {row(([['paladin','상대 기사 · 검과 방패'],['erika','상대 용병 · 전투도끼'],['arissa','상대 도적 · 손도끼']] as const).map(([key,label])=>button(label,()=>{setOpponent(key);reset();},opponent===key)))}
  {row(<>{button('아군 승리',()=>{setWinner(0);reset();},winner===0)}{button('적군 승리',()=>{setWinner(1);reset();},winner===1)}{button(paused?'재생':'일시정지',()=>{if(clock.time>=clock.duration)clock.time=0;clock.paused=!clock.paused;setPaused(clock.paused);})}{button('다시 보기',()=>{clock.time=0;clock.paused=false;setPaused(false);})}{button(slow?'정상 속도':'느리게 보기',()=>{clock.speed=slow?1:.25;setSlow(!slow);})}{button('접촉 순간',()=>{clock.time=clock.contacts.find(t=>t>clock.time+.03)??clock.contacts[0]??0;clock.paused=true;setPaused(true);})}{button('방어 실패 직전',()=>{clock.time=(clock.failures.find(t=>t>clock.time+.04)??clock.failures[0]??.02)-.02;clock.paused=true;setPaused(true);})}{button('피격 반응',()=>{clock.time=(clock.failures.find(t=>t>=clock.time-.25)??clock.failures[0]??0)+.2;clock.paused=true;setPaused(true);})}{button('이전 프레임',()=>{clock.time=Math.max(0,clock.time-1/30);clock.paused=true;setPaused(true);})}{button('다음 프레임',()=>{clock.time=Math.min(clock.duration,clock.time+1/30);clock.paused=true;setPaused(true);})}{button('반대쪽 보기',()=>setAngle(a=>a+Math.PI))}{button('개별 동작 보기',onSingle)}</>)}
  <View style={s.health}><Text style={{color:'#90caf6',fontSize:12,flex:1}}>아군 병력 {troops[0]} · 대표 {representativeCount(troops[0])}명 · {proficiencyLabel(ranks[0])}</Text><Text style={{color:'#f39c90',fontSize:12,flex:1,textAlign:'right'}}>적군 병력 {troops[1]} · 대표 {representativeCount(troops[1])}명 · {proficiencyLabel(ranks[1])}</Text></View>
  <View style={{flex:1,minHeight:0}}>{!ready&&<Text style={s.loading}>병사와 공방 동작을 준비하고 있습니다…</Text>}<Canvas shadows dpr={[1,1.5]} camera={{fov:38,near:.01,far:150}} gl={{antialias:true,toneMapping:T.ACESFilmicToneMapping,toneMappingExposure:1.18}}><Suspense fallback={null}><Scene fighters={fighters} troops={troops} winner={winner} range={range} clock={clock} angle={angle} onReady={()=>setReady(true)} onState={(text,h)=>{setStatus(text);setHealth(h);if(clock.paused)setPaused(true);}}/></Suspense></Canvas></View>
  <Text style={s.footer}>{status}</Text>
 </View>;
}
const s=StyleSheet.create({page:{width:'100%',backgroundColor:'#172521'},header:{padding:14,paddingBottom:8},title:{fontFamily:'serif',fontSize:23,color:'#e2d5b7'},note:{fontSize:12,color:'#acb7ac',marginTop:4},row:{flexGrow:0,flexShrink:0},controls:{flexDirection:'row',gap:6,paddingHorizontal:14,paddingBottom:8},button:{paddingHorizontal:12,paddingVertical:9,borderWidth:1,borderColor:'#596451'},active:{backgroundColor:'#5a664e'},label:{color:'#e5dbc4',fontSize:13},health:{flexDirection:'row',justifyContent:'space-between',paddingHorizontal:18,paddingBottom:9},loading:{position:'absolute',zIndex:2,top:'45%',alignSelf:'center',color:'#e5dbc4'},footer:{padding:12,color:'#c2caba',fontSize:12}});
