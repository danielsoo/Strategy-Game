import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';

export type RenderStats={fps:number;triangles:number;calls:number};
export default function RealmAtmosphere({onStats}:{onStats?:(stats:RenderStats)=>void}){
  const {scene,gl}=useThree(),fog=useMemo(()=>new THREE.Fog('#a6b9b7',10,80),[]);
  const frames=useRef(0),elapsed=useRef(0);
  useEffect(()=>{const old=scene.fog,exposure=gl.toneMappingExposure;scene.fog=fog;gl.toneMappingExposure=1.04;
    return()=>{scene.fog=old;gl.toneMappingExposure=exposure;};},[scene,gl,fog]);
  useFrame(({camera},delta)=>{
    const distance=Math.max(3,camera.position.y*1.65);fog.near=distance*.62;fog.far=distance*2.4;
    frames.current++;elapsed.current+=delta;if(elapsed.current>2){onStats?.({fps:Math.round(frames.current/elapsed.current),triangles:gl.info.render.triangles,calls:gl.info.render.calls});frames.current=0;elapsed.current=0;}
  });return null;
}
