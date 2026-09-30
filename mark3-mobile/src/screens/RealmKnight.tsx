import React,{useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {useLoader,useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils';
import type {Ground,Piece} from './medievalScene';
import {armyFormation,ArmyKind} from './realmLayout';
import {terrainField} from './campaignTerrain';
import {animateArmyMaterial,tagKnightEquipment,ACTION_CODE,ArmyAction} from './armyAnimation';
import {ArmyTrack,animationNow,sampleTrack} from './armyTimeline';

/** 조형된 갑옷·인체·무기와 원본 UV를 공유한다. 몸통을 기본 도형으로 대체하지 않는다. */
export default function RealmKnight({ground,detail=false,kind,action='idle',tracks}:{ground:Ground[];detail?:boolean;kind?:ArmyKind;action?:ArmyAction;tracks?:Map<string,ArmyTrack>}){
  const asset=useLoader(GLTFLoader,'/realm/knight/knight.gltf'),ref=useRef<THREE.InstancedMesh>(null);
  const time=useMemo(()=>({value:0}),[]);
  const model=useMemo(()=>{asset.scene.updateMatrixWorld(true);const parts:THREE.BufferGeometry[]=[];let material:THREE.MeshStandardMaterial|undefined;
    asset.scene.traverse(o=>{if(!(o as THREE.Mesh).isMesh)return;const mesh=o as THREE.Mesh;const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);tagKnightEquipment(geometry,mesh.name.endsWith('001'));parts.push(geometry);if(!material)material=(mesh.material as THREE.MeshStandardMaterial).clone();});
    const geometry=mergeGeometries(parts);parts.forEach(p=>p.dispose());geometry.computeBoundingBox();const box=geometry.boundingBox!,center=box.getCenter(new THREE.Vector3()),height=box.max.y-box.min.y;
    geometry.translate(-center.x,-box.min.y,-center.z);geometry.scale(1.75/height,1.75/height,1.75/height);geometry.computeBoundingSphere();
    for(const t of [material!.map,material!.normalMap])if(t)t.anisotropy=8;
    animateArmyMaterial(material!,time);
    const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});animateArmyMaterial(depth,time);
    return {geometry,material:material!,depth};
  },[asset]);
  useEffect(()=>()=>{model.geometry.dispose();model.material.dispose();model.depth.dispose();},[model]);
  const places=useMemo(()=>{const field=terrainField(ground),out:Array<Piece&{cellId?:string}>=[];
    if(detail)return [{position:[0,field.height(0,0),0],scale:[1,1,1],rotation:[0,0,0],color:'#ffffff'}] as Array<Piece&{cellId?:string}>;
    for(const g of ground)for(const p of armyFormation(g)){if(kind&&p.kind!==kind)continue;const x=g.position[0]+p.x,z=g.position[2]+p.z;out.push({cellId:g.cell.id,position:[x,field.height(x,z)+.002,z],scale:[p.scale,p.scale,p.scale],rotation:[0,p.yaw,0],color:'#ffffff'});}
    return out;
  },[ground,detail,kind]);
  const motion=useMemo(()=>new THREE.InstancedBufferAttribute(new Float32Array(places.length*2),2),[places.length]);
  useLayoutEffect(()=>{model.geometry.setAttribute('realmMotion',motion);},[model,motion]);
  const field=useMemo(()=>terrainField(ground),[ground]),object=useMemo(()=>new THREE.Object3D(),[]);
  useFrame(()=>{
    const mesh=ref.current;if(!mesh)return;const now=animationNow();time.value=now;
    places.forEach((p,i)=>{
      const track=p.cellId?tracks?.get(p.cellId):undefined,sample=track?sampleTrack(track,now):null;
      const mode=sample?.action??action;
      let x=p.position[0],z=p.position[2],yaw=p.rotation?.[1]??0;
      if(track&&sample){x+=(track.to[0]-track.from[0])*sample.progress;z+=(track.to[2]-track.from[2])*sample.progress;yaw=Math.atan2(track.to[0]-track.from[0],track.to[2]-track.from[2]);if(track.battle){const lx=p.position[0]-track.from[0],lz=p.position[2]-track.from[2]-(track.formationZ??0);x=track.from[0]+(track.to[0]-track.from[0])*sample.progress+lx*Math.cos(yaw)+lz*Math.sin(yaw);z=track.from[2]+(track.to[2]-track.from[2])*sample.progress-lx*Math.sin(yaw)+lz*Math.cos(yaw);}if(sample.progress<.62&&mode==='walk'&&track.battle&&now-track.start>track.duration*.82)yaw+=Math.PI;}
      object.position.set(x,!track?p.position[1]:field.height(x,z)+.003,z);object.scale.set(...p.scale);object.rotation.set(0,yaw,0);object.updateMatrix();mesh.setMatrixAt(i,object.matrix);
      motion.setXY(i,ACTION_CODE[mode],i*.17);
    });
    mesh.instanceMatrix.needsUpdate=true;motion.needsUpdate=true;
  });
  return <instancedMesh key={places.length} ref={ref} args={[model.geometry,model.material,places.length]} customDepthMaterial={model.depth} frustumCulled={false} castShadow receiveShadow raycast={()=>{}} dispose={null}/>;
}
