import React,{useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {useLoader} from '@react-three/fiber';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils';
import type {Ground,Piece} from './medievalScene';
import {armyFormation,ArmyKind} from './realmLayout';
import {terrainField} from './campaignTerrain';

/** 조형된 갑옷·인체·무기와 원본 UV를 공유한다. 몸통을 기본 도형으로 대체하지 않는다. */
export default function RealmKnight({ground,detail=false,kind}:{ground:Ground[];detail?:boolean;kind?:ArmyKind}){
  const asset=useLoader(GLTFLoader,'/realm/knight/knight.gltf'),ref=useRef<THREE.InstancedMesh>(null);
  const model=useMemo(()=>{asset.scene.updateMatrixWorld(true);const parts:THREE.BufferGeometry[]=[];let material:THREE.MeshStandardMaterial|undefined;
    asset.scene.traverse(o=>{if(!(o as THREE.Mesh).isMesh)return;const mesh=o as THREE.Mesh;const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);parts.push(geometry);if(!material)material=(mesh.material as THREE.MeshStandardMaterial).clone();});
    const geometry=mergeGeometries(parts);parts.forEach(p=>p.dispose());geometry.computeBoundingBox();const box=geometry.boundingBox!,center=box.getCenter(new THREE.Vector3()),height=box.max.y-box.min.y;
    geometry.translate(-center.x,-box.min.y,-center.z);geometry.scale(1.75/height,1.75/height,1.75/height);geometry.computeBoundingSphere();
    for(const t of [material!.map,material!.normalMap])if(t)t.anisotropy=8;
    return {geometry,material:material!};
  },[asset]);
  useEffect(()=>()=>{model.geometry.dispose();model.material.dispose();},[model]);
  const places=useMemo(()=>{const field=terrainField(ground),out:Piece[]=[];
    if(detail)return [{position:[0,field.height(0,0),0],scale:[1,1,1],rotation:[0,0,0],color:'#ffffff'}] as Piece[];
    for(const g of ground)for(const p of armyFormation(g)){if(kind&&p.kind!==kind)continue;const x=g.position[0]+p.x,z=g.position[2]+p.z;out.push({position:[x,field.height(x,z)+.002,z],scale:[p.scale,p.scale,p.scale],rotation:[0,p.yaw,0],color:'#ffffff'});}
    return out;
  },[ground,detail,kind]);
  useLayoutEffect(()=>{if(!ref.current)return;const object=new THREE.Object3D();places.forEach((p,i)=>{object.position.set(...p.position);object.scale.set(...p.scale);object.rotation.set(...p.rotation!);object.updateMatrix();ref.current!.setMatrixAt(i,object.matrix);});ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();},[places,model]);
  return <instancedMesh key={places.length} ref={ref} args={[model.geometry,model.material,places.length]} castShadow receiveShadow raycast={()=>{}} dispose={null}/>;
}
