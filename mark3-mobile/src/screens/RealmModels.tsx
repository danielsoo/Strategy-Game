import React,{useMemo,useLayoutEffect,useRef,useEffect,useState} from 'react';
import * as THREE from 'three';
import {useLoader,useThree,useFrame} from '@react-three/fiber';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {Ground,Piece,V3} from './medievalScene';
import {terrainField} from './campaignTerrain';
import {useRealmAssetRoot} from './realmAssets';
import {settlementPlan} from './realmLayout';

const ignore=()=>{};
const random=(n:number)=>{const a=Math.sin(n*127.1+311.7)*43758.5453;return a-Math.floor(a);};
type Part={geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[]};

// 모듈 전시용 위치를 제거하고 밑면 중앙이 원점인 단위 모델로 정규화한다.
function partsOf(root:THREE.Object3D,uniform=false):Part[]{
  root.updateWorldMatrix(true,true);
  const inverse=root.matrixWorld.clone().invert(),box=new THREE.Box3(),parts:Part[]=[];
  root.traverse(obj=>{if(!(obj as THREE.Mesh).isMesh)return;const mesh=obj as THREE.Mesh;
    const geometry=mesh.geometry.clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));geometry.computeBoundingBox();box.union(geometry.boundingBox!);
    const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>{const copy=m.clone() as THREE.MeshStandardMaterial;copy.side=THREE.DoubleSide;copy.transparent=false;copy.depthWrite=true;
      if(copy.name.includes('leaves')){copy.emissive.set('#445528');copy.emissiveIntensity=.42;}
      for(const tex of [copy.map,copy.normalMap,copy.roughnessMap])if(tex)tex.anisotropy=8;return copy;});
    parts.push({geometry,material:Array.isArray(mesh.material)?materials:materials[0]});});
  const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  for(const part of parts){part.geometry.translate(-center.x,-box.min.y,-center.z);part.geometry.scale(1/(uniform?size.y:size.x),1/size.y,1/(uniform?size.y:size.z));part.geometry.computeBoundingSphere();}
  return parts;
}

function MeshBatch({part,places}:{part:Part;places:Piece[]}){
  const ref=useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(()=>{if(!ref.current)return;const obj=new THREE.Object3D(),color=new THREE.Color();
    places.forEach((p,i)=>{obj.position.set(...p.position);obj.scale.set(...p.scale);obj.rotation.set(...(p.rotation??[0,0,0]));obj.updateMatrix();ref.current!.setMatrixAt(i,obj.matrix);ref.current!.setColorAt(i,color.set(p.color));});
    ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;ref.current.computeBoundingSphere();
  },[places,part]);
  if(!places.length)return null;
  return <instancedMesh key={places.length} ref={ref} args={[part.geometry,part.material,places.length]} castShadow receiveShadow raycast={ignore} dispose={null}/>;
}

/** 실제 모델을 네 방향에서 구워 원거리 수목의 잎·가지 실루엣을 보존한다. */
function bakeTree(parts:Part[],renderer:THREE.WebGLRenderer){
  const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
  parts.forEach(p=>group.add(new THREE.Mesh(p.geometry,p.material)));
  scene.add(new THREE.HemisphereLight('#d7e5e8','#39452e',2));const sun=new THREE.DirectionalLight('#fff3de',2.7);sun.position.set(-3,7,4);scene.add(sun);
  const camera=new THREE.OrthographicCamera(-.68,.68,.72,-.72,.01,10);camera.position.set(0,1.3,2.5);camera.lookAt(0,.5,0);
  const targets:THREE.WebGLRenderTarget[]=[];
  const old=renderer.getRenderTarget(),color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
  try{renderer.setClearColor(0,0);for(let i=0;i<4;i++){
    const target=new THREE.WebGLRenderTarget(512,512,{format:THREE.RGBAFormat,samples:4});target.texture.generateMipmaps=true;target.texture.minFilter=THREE.LinearMipmapLinearFilter;target.texture.anisotropy=4;group.rotation.y=i*Math.PI/2;
    renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);targets.push(target);
  }}finally{renderer.setRenderTarget(old);renderer.setClearColor(color,alpha);}
  return targets;
}

function Forest({parts,trees}:{parts:Part[];trees:Piece[]}){
  const {gl}=useThree();
  const [near,setNear]=useState<number[]>([]),last=useRef(''),tick=useRef(0);
  useFrame(({camera,size,clock})=>{if(clock.elapsedTime-tick.current<.3)return;tick.current=clock.elapsedTime;
    const candidates=trees.map((p,i)=>({i,d:camera.position.distanceTo(new THREE.Vector3(...p.position)),h:p.scale[1]}))
      .filter(p=>p.h/Math.max(.1,p.d)*size.height>29).sort((a,b)=>a.d-b.d).slice(0,18).map(p=>p.i);
    const key=candidates.join(',');if(key!==last.current){last.current=key;setNear(candidates);}
  });
  const targets=useMemo(()=>bakeTree(parts,gl),[parts,gl]);
  useEffect(()=>()=>targets.forEach(t=>t.dispose()),[targets]);
  const refs=useRef<Array<THREE.InstancedMesh|null>>([]);
  const detail=useMemo(()=>near.map(i=>trees[i]).filter(Boolean),[near,trees]);
  const batches=useMemo(()=>{const selected=new Set(near);return [0,1,2,3].map(k=>trees.filter((_,i)=>i%4===k&&!selected.has(i)));},[trees,near]);
  const materials=useMemo(()=>targets.map(t=>{
    const material=new THREE.MeshBasicMaterial({map:t.texture,alphaTest:.06,alphaToCoverage:true,side:THREE.DoubleSide,toneMapped:false});
    // 투명 바탕과 함께 축소된 수관의 색을 복원해 원거리에서 검은 점으로 보이지 않게 한다.
    material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb/=max(diffuseColor.a,.06);');};return material;
  }),[targets]);
  useEffect(()=>()=>materials.forEach(m=>m.dispose()),[materials]);
  // 정면만 향하는 평면 대신, 직교하는 두 잎 카드로 회전 중에도 수관의 부피를 유지한다.
  useLayoutEffect(()=>{const obj=new THREE.Object3D(),color=new THREE.Color();batches.forEach((batch,k)=>{const mesh=refs.current[k];if(!mesh)return;
    batch.forEach((p,i)=>{for(let cross=0;cross<2;cross++){obj.position.set(p.position[0],p.position[1]+p.scale[1]*.55,p.position[2]);obj.scale.set(p.scale[1]*1.36,p.scale[1]*1.44,1);obj.rotation.set(0,(p.rotation?.[1]??0)+cross*Math.PI/2,0);obj.updateMatrix();mesh.setMatrixAt(i*2+cross,obj.matrix);mesh.setColorAt(i*2+cross,color.set(p.color));}});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();});},[batches]);
  return <group>{batches.map((batch,k)=><instancedMesh key={`${k}-${batch.length}`} ref={m=>{refs.current[k]=m;}} args={[undefined,materials[k],batch.length*2]} raycast={ignore} castShadow>
    <planeGeometry/>
  </instancedMesh>)}{parts.map((part,i)=><MeshBatch key={'detail'+i} part={part} places={detail}/>)}</group>;
}

export default function RealmModels({ground}:{ground:Ground[]}){
  const root=useRealmAssetRoot();
  const [fort,tree,rock,pine,shrub]=useLoader(GLTFLoader,[`${root}modular_fort_01/model.gltf`,'/realm/tree_small_02/campaign-tree.gltf',`${root}rock_face_01/model.gltf`,'/realm/pine_sapling_small/campaign-tree.gltf','/realm/shrub_01/campaign-tree.gltf']);
  const models=useMemo(()=>{
    const named=(name:string)=>{const obj=fort.scene.getObjectByName(`modular_fort_01_${name}`);if(!obj)throw new Error(`성곽 모듈 누락: ${name}`);const parts=partsOf(obj);if(name.startsWith('wall'))parts.forEach(p=>p.geometry.rotateY(Math.PI/2));return parts;};
    return {wall:named('wall_thin_straight_01'),gate:named('wall_thin_gate_01'),tower:named('tower_round'),tree:partsOf(tree.scene,true),rock:partsOf(rock.scene),pine:partsOf(pine.scene.getObjectByName('pine_sapling_small_a')!,true),shrub:partsOf(shrub.scene,true)};
  },[fort,tree,rock,pine,shrub]);
  useEffect(()=>()=>Object.values(models).flat().forEach(p=>{p.geometry.dispose();(Array.isArray(p.material)?p.material:[p.material]).forEach(m=>m.dispose());}),[models]);
  const places=useMemo(()=>{
    const field=terrainField(ground),out:{wall:Piece[];gate:Piece[];tower:Piece[];tree:Piece[];rock:Piece[];pine:Piece[];shrub:Piece[]}={wall:[],gate:[],tower:[],tree:[],rock:[],pine:[],shrub:[]};
    ground.forEach((g,i)=>{if(!g.known)return;const [x,,z]=g.position;
      const put=(kind:keyof typeof out,dx:number,dz:number,scale:V3,yaw=0)=>out[kind].push({position:[x+dx,field.height(x+dx,z+dz)-.015,z+dz],scale,rotation:[0,yaw,0],color:g.seen?'#ffffff':'#68747b'});
      if(g.castle){
        const plan=settlementPlan(g),{outline,yaw,wallHeight:h}=plan;
        const place=(kind:'wall'|'gate'|'tower',dx:number,dz:number,scale:V3,angle=0)=>put(kind,dx*Math.cos(yaw)+dz*Math.sin(yaw),-dx*Math.sin(yaw)+dz*Math.cos(yaw),scale,angle+yaw);
        outline.forEach(([ax,az],j)=>{const [bx,bz]=outline[(j+1)%outline.length],length=Math.hypot(bx-ax,bz-az),angle=-Math.atan2(bz-az,bx-ax);
          if(j===0){const gap=.24,part=(length-gap)/2;for(const side of [-1,1]){const t=.5+side*(gap+part)/(2*length);place('wall',ax+(bx-ax)*t,az+(bz-az)*t,[part,h,.06],angle);}place('gate',(ax+bx)/2,(az+bz)/2,[gap,h*1.22,.075],angle);}
          else place('wall',(ax+bx)/2,(az+bz)/2,[length+.012,h,.06],angle);
          if(plan.kind!=='abbey'&&(plan.kind==='citadel'||j%2===0))place('tower',ax,az,[.13,h*1.35,.13]);
        });
        if(plan.kind==='march')place('tower',-.19,-.24,[.25,.49,.25]);
      }
      const occupied=g.castle||g.cell.fortStage>0&&g.seen;
      const count=g.terrain==='forest'?(occupied?6:30+Math.floor(random(i)*20)):g.terrain==='plain'?2:g.terrain==='mountain'?7:1;
      for(let j=0;j<count;j++){const a=random(i*153+j*13)*6.28,r=occupied?.99:.13+Math.sqrt(random(i*93+j))*.73;const dx=Math.cos(a)*r,dz=Math.sin(a)*r;
        const kind=g.terrain==='desert'?'shrub':g.terrain==='mountain'||random(i*7+j)>.62?'pine':'tree';
        const s=kind==='shrub'?.10:kind==='pine'?.22+random(i*31+j)*.27:.22+random(i*31+j)*.25;
        put(kind,dx,dz,[s*(.8+random(j)*.3),s,s],random(i*59+j)*6.28);
        if(!occupied&&j%7===0)put('shrub',dx+.09,dz-.06,[.10,.10,.10],a);
      }
      if(g.terrain==='mountain')for(let j=0;j<2;j++){const a=j*2.4+i*.8,r=.18+j*.18;put('rock',Math.cos(a)*r,Math.sin(a)*r,[.36,.10+random(i+j)*.16,.34],a);}
    });
    // 플레이 영역 바깥에도 같은 수목을 이어 붙인다. 배치는 게임 정보와 독립적이다.
    const extent=Math.max(...ground.map(g=>Math.hypot(g.position[0],g.position[2])))*1.7;
    for(let i=0;i<700;i++){
      const x=(random(i*7+19)*2-1)*extent,z=(random(i*13+41)*2-1)*extent;
      if(Math.hypot(x,z)>extent||ground.some(g=>Math.hypot(x-g.position[0],z-g.position[2])<1.25))continue;
      const h=field.height(x,z),s=.38+random(i*19)*.55;
      out.tree.push({position:[x,h,z],scale:[s,s,s],color:'#ffffff',rotation:[0,random(i)*6.28,0]});
    }
    return out;
  },[ground]);
  return <group>
    {(['wall','gate','tower','rock'] as const).flatMap(kind=>models[kind].map((part,i)=><MeshBatch key={kind+i} part={part} places={places[kind]}/>))}
    <Forest parts={models.tree} trees={places.tree}/>
    <Forest parts={models.pine} trees={places.pine}/>
    <Forest parts={models.shrub} trees={places.shrub}/>
  </group>;
}
