import React,{useMemo,useEffect,useRef,useState} from 'react';
import {useFrame,useThree,useLoader} from '@react-three/fiber';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import type {Ground,Piece} from './medievalScene';
import {terrainField} from './campaignTerrain';
import {realmRandom as random} from './realmLayout';
import {partsOf,MeshBatch} from './RealmModels';

/** 원본 풀·고사리의 UV와 형상을 보존하고 근거리에서만 군락을 렌더한다. */
export default function RealmGrass({ground}:{ground:Ground[]}){
  const {size}=useThree(),compact=size.width<700;
  const [grass,fern]=useLoader(GLTFLoader,['/realm/grass_medium_01/model.gltf','/realm/fern_02/model.gltf']);
  const [alpha,fernAlpha]=useLoader(THREE.TextureLoader,['/realm/grass_medium_01/alpha.png','/realm/fern_02/alpha.png']);
  const [focus,setFocus]=useState<[number,number]>([0,0]),last=useRef(''),direction=useMemo(()=>new THREE.Vector3(),[]);
  const models=useMemo(()=>{const result=[
    ...['grass_medium_01_small_a_LOD0','grass_medium_01_mid_a_LOD0','grass_medium_01_large_a_LOD0'].map(name=>partsOf(grass.scene.getObjectByName(name)!,true)),
    partsOf(fern.scene.getObjectByName('fern_02_a')!,true),
  ];for(const map of [alpha,fernAlpha]){map.flipY=false;map.anisotropy=8;}
    result.forEach((parts,k)=>parts.forEach(p=>(Array.isArray(p.material)?p.material:[p.material]).forEach(m=>{const material=m as THREE.MeshStandardMaterial;material.alphaMap=k===3?fernAlpha:alpha;material.alphaTest=.35;material.alphaToCoverage=true;})));
    return result;
  },[grass,fern,alpha,fernAlpha]);
  useEffect(()=>()=>models.flat().forEach(p=>{p.geometry.dispose();(Array.isArray(p.material)?p.material:[p.material]).forEach(m=>m.dispose());}),[models]);
  useFrame(({camera})=>{
    camera.getWorldDirection(direction);
    const distance=Math.max(0,(camera.position.y-.35)/Math.max(.1,-direction.y));
    const x=Math.round((camera.position.x+direction.x*distance)/1.5)*1.5,z=Math.round((camera.position.z+direction.z*distance)/1.5)*1.5;
    const key=camera.position.y>9?'far':`${x},${z}`;
    if(key!==last.current){last.current=key;setFocus(key==='far'?[Infinity,Infinity]:[x,z]);}
  });
  const places=useMemo(()=>{const out:Piece[][]=[[],[],[],[]],field=terrainField(ground);
    const tiles=ground.filter(g=>g.seen&&!g.castle&&g.cell.fortStage===0&&(g.terrain==='plain'||g.terrain==='forest')&&Math.hypot(g.position[0]-focus[0],g.position[2]-focus[1])<3.4);
    for(const g of tiles){const seed=g.cell.row*719+g.cell.col*173;
      for(let i=0;i<(compact?260:620);i++){
        const a=random(seed+i*11)*Math.PI*2,r=Math.sqrt(random(seed+i*23))*.85,dx=Math.cos(a)*r,dz=Math.sin(a)*r;
        // 도로와 대열의 발밑을 비워 선택 표시와 병사가 가려지지 않게 한다.
        if((g.cell.hasRoad&&Math.abs(dx)<.12)||(g.cell.units>0&&Math.abs(dx)<.3&&Math.abs(dz)<.3))continue;
        const x=g.position[0]+dx,z=g.position[2]+dz,patch=Math.sin(x*9+Math.sin(z*5))*Math.cos(z*8);
        if(patch<-.4||g.terrain==='forest'&&patch<0)continue;
        const y=field.height(x,z);if(Math.abs(field.height(x+.02,z)-y)>.012)continue;
        const kind=g.terrain==='forest'&&i%5===0?3:i%3,h=(kind===3?.035:.015)+random(seed+i*13)*.016;
        out[kind].push({position:[x,y-.001,z],scale:[h,h,h],rotation:[0,a,0],color:'#ffffff'});
      }
    }return out;
  },[ground,focus,compact]);
  return <group>{models.flatMap((parts,k)=>parts.map((part,i)=><MeshBatch key={`${k}-${i}`} part={part} places={places[k]} castShadow={k===3}/>))}</group>;
}
