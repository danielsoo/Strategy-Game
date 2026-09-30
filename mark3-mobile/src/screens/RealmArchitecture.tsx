import React,{useMemo,useEffect,useLayoutEffect,useRef} from 'react';
import {useLoader} from '@react-three/fiber';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import type {Ground,Piece} from './medievalScene';
import {terrainField} from './campaignTerrain';
import {cityLayout} from './realmCityLayout';

type Part={geometry:THREE.BufferGeometry;material:THREE.Material|THREE.Material[]};
function ArchitectureBatch({part,places}:{part:Part;places:Piece[]}){
  const ref=useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(()=>{const mesh=ref.current;if(!mesh)return;const object=new THREE.Object3D(),color=new THREE.Color();
    places.forEach((p,i)=>{object.position.set(...p.position);object.rotation.set(...p.rotation!);object.scale.set(...p.scale);object.updateMatrix();mesh.setMatrixAt(i,object.matrix);mesh.setColorAt(i,color.set(p.color));});
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
  },[part,places]);
  return <instancedMesh key={places.length} ref={ref} args={[part.geometry,part.material,places.length]} castShadow receiveShadow raycast={()=>{}} dispose={null}/>;
}
export default function RealmArchitecture({ground}:{ground:Ground[]}){
  const gltf=useLoader(GLTFLoader,'/realm/medieval/architecture.gltf?v=20260930');
  const models=useMemo(()=>{
    const out:Record<string,Part[]>={};gltf.scene.updateMatrixWorld(true);
    for(const node of gltf.scene.children){
      const box=new THREE.Box3().setFromObject(node),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),span=Math.max(size.x,size.z);
      const parts:Part[]=[];
      node.traverse(o=>{if(!(o as THREE.Mesh).isMesh)return;const mesh=o as THREE.Mesh;
        const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);geometry.translate(-center.x,-box.min.y,-center.z);geometry.scale(1/span,1/span,1/span);
        const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>{const material=m.clone() as THREE.MeshStandardMaterial;
          for(const t of [material.map,material.normalMap,material.aoMap])if(t)t.anisotropy=8;return material;});
        parts.push({geometry,material:Array.isArray(mesh.material)?materials:materials[0]});
      });out[node.name]=parts;
    }return out;
  },[gltf]);
  useEffect(()=>()=>Object.values(models).flat().forEach(p=>{p.geometry.dispose();(Array.isArray(p.material)?p.material:[p.material]).forEach(m=>m.dispose());}),[models]);
  const batches=useMemo(()=>{const field=terrainField(ground),out:Record<string,Piece[]>={};
    for(const g of ground)for(const p of cityLayout(g)){
      const x=g.position[0]+p.x,z=g.position[2]+p.z,h=field.height(x,z);
      if(!g.castle&&ground.some(t=>t.known&&t.castle&&Math.hypot(x-t.position[0],z-t.position[2])<1.15))continue;
      // 산비탈의 경작지·농가는 급경사에 붙이지 않는다. 성 주변은 지형 생성 단계에서 평탄화한다.
      if(!g.castle&&Math.max(...[[.25,0],[-.25,0],[0,.25],[0,-.25]].map(([dx,dz])=>Math.abs(field.height(x+dx,z+dz)-h)))>.12)continue;
      (out[p.asset]??=[]).push({position:[x,h-.008,z],scale:p.scale,rotation:[0,p.yaw,0],color:g.seen?'#ffffff':'#68747b'});
    }
    return out;
  },[ground]);
  return <group>{Object.entries(batches).flatMap(([name,places])=>models[name]?.map((part,i)=><ArchitectureBatch key={name+i} part={part} places={places}/>)??[])}</group>;
}
