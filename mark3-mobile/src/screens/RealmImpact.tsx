import React,{useMemo,useEffect,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import type {V3} from './medievalScene';
import {animationNow} from './armyTimeline';
/** 검·방패 충돌의 짧은 불꽃. 긴 발광 구체가 화면에 남지 않는다. */
export default function RealmImpact({position,scale=1,startAt=0}:{position:V3;scale?:number;startAt?:number}){
 const mesh=useRef<THREE.LineSegments>(null);
 const geometry=useMemo(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(18*6),3));return g;},[]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 useFrame(()=>{const now=animationNow(),phase=now%(Math.PI*2/5.8),burst=Math.max(0,phase-.25);const visible=now>=startAt&&phase>.25&&phase<.49;if(!mesh.current)return;mesh.current.visible=visible;if(!visible)return;
  const p=geometry.getAttribute('position');for(let i=0;i<18;i++){const a=i*2.399,y=Math.sin(i*13.1)*.7;for(let end=0;end<2;end++){const r=(burst*3+end*.09)*scale;p.setXYZ(i*2+end,Math.cos(a)*r,y*r-burst*burst*scale*2,Math.sin(a)*r);}}p.needsUpdate=true;(mesh.current.material as THREE.LineBasicMaterial).opacity=1-burst/.24;
 });
 return <lineSegments ref={mesh} geometry={geometry} position={position} frustumCulled={false} raycast={()=>{}}><lineBasicMaterial color="#ffe6a1" transparent toneMapped={false} blending={THREE.AdditiveBlending}/></lineSegments>;
}
