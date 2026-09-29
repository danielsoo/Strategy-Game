import React, {useMemo,useEffect} from 'react';
import * as THREE from 'three';
import {ThreeEvent} from '@react-three/fiber';
import {Ground} from './medievalScene';
import {campaignSurface,campaignBorders,terrainField} from './campaignTerrain';

export default function CampaignLand({ground,onPick}:{ground:Ground[];onPick:(index:number,event:ThreeEvent<MouseEvent>)=>void}) {
  const surface=useMemo(()=>campaignSurface(ground),[ground]);
  const borders=useMemo(()=>campaignBorders(ground,surface.field.height),[ground,surface]);
  useEffect(()=>()=>{surface.geometry.dispose();borders.dispose();},[surface,borders]);
  return <group>
    <mesh geometry={surface.geometry} receiveShadow castShadow onClick={e=>{if(e.faceIndex!=null)onPick(surface.faces[e.faceIndex],e);}}>
      <meshStandardMaterial vertexColors roughness={.96} onBeforeCompile={shader=>{
        shader.vertexShader='varying vec3 vLandscape;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLandscape=position;');
        shader.fragmentShader=`varying vec3 vLandscape;
          float hashland(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float nland(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hashland(i),hashland(i+vec2(1,0)),f.x),mix(hashland(i+vec2(0,1)),hashland(i+vec2(1,1)),f.x),f.y);}
        `+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float soil=nland(vLandscape.xz*7.0)*.5+nland(vLandscape.xz*24.0)*.32+nland(vLandscape.xz*90.0)*.18;
          diffuseColor.rgb*=.72+soil*.55;
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.10,1.02,.80),smoothstep(.5,.75,soil)*.38);
        `);
      }}/>
    </mesh>
    <lineSegments geometry={borders} raycast={()=>{}}><lineBasicMaterial vertexColors transparent opacity={.8} toneMapped={false}/></lineSegments>
  </group>;
}

export function TerrainRing({tile,ground,selected}:{tile:Ground;ground:Ground[];selected:boolean}) {
  const geometry=useMemo(()=>{
    const field=terrainField(ground),positions:number[]=[],index:number[]=[];
    for(let edge=0;edge<6;edge++)for(let k=0;k<8;k++){
      const a=Math.PI/6+edge*Math.PI/3,b=a+Math.PI/3,n=positions.length/3;
      for(const [f,r] of [[k/8,.94],[k/8,.99],[(k+1)/8,.94],[(k+1)/8,.99]]){
        const x=tile.position[0]+(Math.cos(a)*(1-f)+Math.cos(b)*f)*r;
        const z=tile.position[2]+(Math.sin(a)*(1-f)+Math.sin(b)*f)*r;
        positions.push(x,field.height(x,z)+.038,z);
      }index.push(n,n+1,n+2,n+1,n+3,n+2);
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(index);return geo;
  },[tile,ground]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry} raycast={()=>{}}><meshBasicMaterial color={selected?'#ffebac':'#c8ac60'} transparent opacity={selected?.95:.6} side={THREE.DoubleSide} toneMapped={false}/></mesh>;
}
