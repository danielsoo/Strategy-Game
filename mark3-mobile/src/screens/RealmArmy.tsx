import React,{useMemo,useEffect,useLayoutEffect,useRef} from 'react';
import * as THREE from 'three';
import {useFrame} from '@react-three/fiber';
import {animateArmyMaterial,ACTION_CODE} from './armyAnimation';
import {ArmyTrack,BattleCue,animationNow,sampleTrack,useArmyTimeline} from './armyTimeline';
import RealmDuel from './RealmDuel';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils';
import type {Ground,Piece,V3} from './medievalScene';
import {terrainField} from './campaignTerrain';
import {armyFormation,ArmyKind} from './realmLayout';
import RealmKnight from './RealmKnight';

type Surface='mail'|'steel'|'cloth'|'leather'|'wood'|'skin'|'horse'|'dark';
const colors:Record<Surface,string>={mail:'#636962',steel:'#a0aaa5',cloth:'#b7b3a3',leather:'#483c30',wood:'#786042',skin:'#b2967c',horse:'#66513d',dark:'#242a28'};
/** 몸통·관절·장비를 합친 대열용 모델. 모든 부위가 한 지면 높이와 같은 자세를 공유한다. */
function soldier(kind:ArmyKind){
  const bins={} as Record<Surface,THREE.BufferGeometry[]>;
  const put=(surface:Surface,g:THREE.BufferGeometry,p:V3,s:V3=[1,1,1],rot:V3=[0,0,0])=>{
    const m=new THREE.Matrix4().compose(new THREE.Vector3(...p),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),new THREE.Vector3(...s));
    const geo=g.index?g.toNonIndexed():g; if(geo!==g)g.dispose();geo.applyMatrix4(m);geo.deleteAttribute('uv');(bins[surface]??=[]).push(geo);
  };
  const sphere=(mat:Surface,p:V3,s:V3)=>put(mat,new THREE.SphereGeometry(1,10,7),p,s);
  const box=(mat:Surface,p:V3,s:V3,rot?:V3)=>put(mat,new THREE.BoxGeometry(1,1,1),p,s,rot);
  const rod=(mat:Surface,a:V3,b:V3,r:number,r2=r)=>{
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.sub(from);
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
    const geo=new THREE.CylinderGeometry(r2,r,delta.length(),7);geo.applyQuaternion(q);put(mat,geo,from.addScaledVector(delta,.5).toArray() as V3);
  };
  const mounted=kind==='rider',lift=mounted?.63:0;
  // 말의 몸통, 목, 주둥이, 관절과 고삐. 기마 지휘관은 별도 실루엣이다.
  if(mounted){
    sphere('horse',[0,.79,0],[.28,.31,.62]);sphere('horse',[0,1.0,.49],[.19,.42,.26]);
    sphere('horse',[0,1.28,.71],[.16,.22,.29]);sphere('dark',[0,1.22,.91],[.13,.10,.12]);
    for(const x of [-.19,.19])for(const z of [-.4,.39]){
      const dz=z>0?.05:-.10;rod('horse',[x,.83,z],[x,.43,z+dz],.064,.09);rod('horse',[x,.43,z+dz],[x,.10,z+.06],.035,.048);box('dark',[x,.06,z+.09],[.11,.1,.16]);
    }
    for(const x of [-.1,.1])put('horse',new THREE.ConeGeometry(.055,.22,6),[x,1.5,.66]);
    rod('dark',[0,1.22,.46],[0,.78,-.21],.06);rod('dark',[0,.87,-.55],[0,.3,-.72],.06,.1);
    box('cloth',[0,.96,-.08],[.55,.08,.62]);box('leather',[0,1.06,-.08],[.40,.11,.36]);
    rod('leather',[-.11,1.22,.86],[-.14,1.40,.14],.016);rod('leather',[.11,1.22,.86],[.14,1.40,.14],.016);
  }
  const hip=mounted?.42:.13;
  for(const side of [-1,1]){
    const knee:V3=[side*(mounted?.34:.13),lift+.44,mounted?.13:.035*side];
    rod('mail',[side*hip,lift+.86,0],knee,.09,.105);
    rod('leather',knee,[side*(mounted?.38:.14),lift+.10,.07*side],.055,.07);
    sphere('leather',[side*(mounted?.38:.14),lift+.065,.09+.07*side],[.075,.067,.15]);
  }
  const torso=new THREE.LatheGeometry([new THREE.Vector2(.19,0),new THREE.Vector2(.23,.14),new THREE.Vector2(.27,.37),new THREE.Vector2(.20,.48)],12);
  put(kind==='archer'?'leather':'mail',torso,[0,lift+.79,0],[1,1,.64]);
  box('leather',[0,lift+.87,.01],[.42,.045,.28]);box('steel',[0,lift+.87,.158],[.055,.047,.022]);
  // 어깨에서 허리까지 몸에 맞춘 문장 천.
  put('cloth',new THREE.CylinderGeometry(.258,.229,.36,12,1,true,-Math.PI*.33,Math.PI*.66),[0,lift+1.055,0],[1,1,.67]);
  if(kind!=='archer')for(const side of [-1,1])sphere('steel',[side*.25,lift+1.21,.015],[.105,.065,.09]);
  sphere('skin',[0,lift+1.40,.01],[.115,.145,.105]);
  if(kind==='archer'){
    sphere('leather',[0,lift+1.45,-.015],[.14,.15,.13]);box('skin',[0,lift+1.405,.108],[.12,.11,.025]);
  }else{
    put('steel',new THREE.SphereGeometry(1,12,8,0,Math.PI*2,0,Math.PI*.62),[0,lift+1.43,0],[.146,.17,.14]);
    if(kind==='guard'||mounted){box('steel',[0,lift+1.38,.12],[.23,.18,.036]);box('dark',[0,lift+1.415,.142],[.19,.023,.01]);box('steel',[0,lift+1.36,.15],[.024,.11,.025]);}
    else put('steel',new THREE.CylinderGeometry(.19,.20,.025,12),[0,lift+1.435,0]);
  }
  const left:V3=[-.32,lift+1.02,.24],right:V3=[.34,lift+1.04,kind==='archer'?.30:.12];
  for(const [side,hand] of [[-1,left],[1,right]] as [number,V3][]){
    const elbow:V3=[side*.32,lift+1.04,.035];rod(kind==='archer'?'leather':'mail',[side*.23,lift+1.22,0],elbow,.072,.09);rod('mail',elbow,hand,.054,.068);sphere('leather',hand,[.06,.068,.052]);
  }
  if(kind==='guard'){
    const shape=new THREE.Shape();shape.moveTo(-.23,.28);shape.lineTo(.23,.28);shape.lineTo(.20,-.05);shape.lineTo(0,-.34);shape.lineTo(-.20,-.05);shape.closePath();
    put('cloth',new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.018,bevelThickness:.012}),[-.28,lift+.94,.27]);
    box('steel',[-.28,lift+.99,.332],[.035,.47,.012]);box('steel',[-.28,lift+1.05,.334],[.37,.032,.012]);
    box('steel',[.34,lift+1.35,.12],[.045,.64,.023],[0,0,-.13]);box('steel',[.34,lift+1.055,.12],[.21,.04,.04]);
  }else if(kind==='archer'){
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(.34,lift+.52,.22),new THREE.Vector3(.34,lift+.78,.42),new THREE.Vector3(.34,lift+1.13,.45),new THREE.Vector3(.34,lift+1.53,.22)]);
    put('wood',new THREE.TubeGeometry(curve,12,.017,5,false),[0,0,0]);rod('leather',[.34,lift+.52,.22],[.34,lift+1.53,.22],.005);
    rod('leather',[-.13,lift+.86,-.2],[.13,lift+1.24,-.21],.08);for(let i=0;i<4;i++)rod('wood',[.06+i*.026,lift+1.1,-.22],[.18+i*.026,lift+1.51,-.24],.009);
  }else{
    const length=mounted?2.6:2.8;rod('wood',[.35,lift+.06,.13],[.35,lift+length,.13],.019);
    put('steel',new THREE.ConeGeometry(.065,.26,4),[.35,lift+length+.12,.13]);
  }
  return Object.entries(bins).map(([key,list])=>{
    const geometry=mergeGeometries(list);list.forEach(g=>g.dispose());
    const material=new THREE.MeshStandardMaterial({color:colors[key as Surface],roughness:key==='steel'?.44:.9,metalness:key==='steel'?.65:key==='mail'?.35:0});
    if(key==='mail')material.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 vMail;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMail=position;');
      shader.fragmentShader='varying vec3 vMail;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nvec2 ring=fract(vec2(vMail.x+vMail.z,vMail.y)*75.)-.5;diffuseColor.rgb*=.7+.3*smoothstep(.15,.34,length(ring));');
    };
    return {surface:key,geometry,material};
  });
}
function ArmyBatch({part,places,tracks,ground}:{part:ReturnType<typeof soldier>[number];places:Array<Piece&{cellId:string}>;tracks:Map<string,ArmyTrack>;ground:Ground[]}){
  const ref=useRef<THREE.InstancedMesh>(null);
  const time=useMemo(()=>({value:0}),[]),motion=useMemo(()=>new THREE.InstancedBufferAttribute(new Float32Array(places.length*2),2),[places.length]);
  const depth=useMemo(()=>{animateArmyMaterial(part.material,time,0);const d=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});animateArmyMaterial(d,time,0);return d;},[part,time]);
  useEffect(()=>()=>depth.dispose(),[depth]);
  const field=useMemo(()=>terrainField(ground),[ground]),obj=useMemo(()=>new THREE.Object3D(),[]);
  useLayoutEffect(()=>{part.geometry.setAttribute('realmMotion',motion);if(!part.geometry.getAttribute('realmEquipment'))part.geometry.setAttribute('realmEquipment',new THREE.BufferAttribute(new Float32Array(part.geometry.getAttribute('position').count),1));},[part,motion]);
  useFrame(()=>{const mesh=ref.current;if(!mesh)return;const now=animationNow();time.value=now;places.forEach((p,i)=>{const track=tracks.get(p.cellId),sample=track?sampleTrack(track,now):null;let x=p.position[0],z=p.position[2],yaw=p.rotation?.[1]??0;if(track&&sample){x+=(track.to[0]-track.from[0])*sample.progress;z+=(track.to[2]-track.from[2])*sample.progress;yaw=Math.atan2(track.to[0]-track.from[0],track.to[2]-track.from[2]);if(track.battle){const lx=p.position[0]-track.from[0],lz=p.position[2]-track.from[2]-(track.formationZ??0);x=track.from[0]+(track.to[0]-track.from[0])*sample.progress+lx*Math.cos(yaw)+lz*Math.sin(yaw);z=track.from[2]+(track.to[2]-track.from[2])*sample.progress-lx*Math.sin(yaw)+lz*Math.cos(yaw);}}
  obj.position.set(x,track?field.height(x,z)+.008:p.position[1],z);obj.scale.set(...p.scale);obj.rotation.set(0,yaw,0);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);motion.setXY(i,ACTION_CODE[sample?.action??'idle'],i*.17);});mesh.instanceMatrix.needsUpdate=true;motion.needsUpdate=true;});
  useLayoutEffect(()=>{const mesh=ref.current;if(!mesh)return;const obj=new THREE.Object3D(),color=new THREE.Color();
    places.forEach((p,i)=>{obj.position.set(...p.position);obj.scale.set(...p.scale);obj.rotation.set(...p.rotation!);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);mesh.setColorAt(i,color.set(part.surface==='cloth'?p.color:'#ffffff'));});
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
  },[part,places]);
  if(!places.length)return null;
  return <instancedMesh key={places.length} ref={ref} args={[part.geometry,part.material,places.length]} customDepthMaterial={depth} frustumCulled={false} castShadow receiveShadow raycast={()=>{}} dispose={null}/>;
}
export default function RealmArmy({ground:live,battles}:{ground:Ground[];battles?:BattleCue[]}){
  const {ground:displayGround,tracks,events}=useArmyTimeline(live,battles);
  const ground=useMemo(()=>displayGround.map(g=>tracks.get(g.cell.id)?.battle?{...g,cell:{...g.cell,units:0}}:g),[displayGround,tracks]);
  const models=useMemo(()=>Object.fromEntries((['guard','pike','archer','rider'] as ArmyKind[]).map(k=>[k,soldier(k)])) as Record<ArmyKind,ReturnType<typeof soldier>>,[]);
  useEffect(()=>()=>Object.values(models).flat().forEach(p=>{p.geometry.dispose();p.material.dispose();}),[models]);
  const formations=useMemo(()=>{const field=terrainField(ground),out:Record<ArmyKind,Array<Piece&{cellId:string}>>={guard:[],pike:[],archer:[],rider:[]};
    for(const g of ground){const cloth=new THREE.Color(g.heraldry).lerp(new THREE.Color('#9b957d'),.55).getStyle();
      for(const p of armyFormation(g)){const x=g.position[0]+p.x,z=g.position[2]+p.z;
        out[p.kind].push({cellId:g.cell.id,position:[x,field.height(x,z)+.008,z],scale:[p.scale,p.scale,p.scale],rotation:[0,p.yaw,0],color:cloth});}}
    return out;
  },[ground]);
  return <group><RealmKnight ground={ground} kind="guard" tracks={tracks}/>{(Object.keys(models) as ArmyKind[]).filter(k=>k!=='guard').flatMap(k=>models[k].map((p,i)=><ArmyBatch key={k+i} part={p} places={formations[k]} tracks={tracks} ground={live}/>))}{events.filter(e=>e.track.battle).flatMap(e=>{
    const x=e.track.from[0]*.35+e.track.to[0]*.65,z=e.track.from[2]*.35+e.track.to[2]*.65;
    const yaw=Math.atan2(e.track.to[0]-e.track.from[0],e.track.to[2]-e.track.from[2])-Math.PI/2;
    const pairs=Math.min(3,Math.max(1,Math.min(e.from.cell.units,e.to.cell.units)));
    return Array.from({length:pairs},(_,i)=>{const offset=(i-(pairs-1)/2)*.29,px=x+Math.sin(yaw)*offset,pz=z+Math.cos(yaw)*offset;
      return <RealmDuel key={e.from.cell.id+'-'+i} startAt={e.track.start+.6} finishWinner={e.track.win?0:1} position={[px,terrainField(live).height(px,pz)+.01,pz]} scale={.17} yaw={yaw} colors={[e.from.heraldry,e.to.heraldry]}/>;
    });
  })}</group>;
}
