import React,{useMemo,useEffect} from 'react';
import * as THREE from 'three';
import type {Ground} from './medievalScene';
import {terrainField} from './campaignTerrain';
import {realmRandom as random,settlementPlan} from './realmLayout';
import {useRealmMaterial} from './realmAssets';

/** 게임 칸과 별도로 지면에 붙는 경작 구획과 굽은 길. 보이는/기억한 정보만 사용한다. */
export function landscapeDetails(ground:Ground[]){
  const field=terrainField(ground),positions:number[]=[],colors:number[]=[],indices:number[]=[];
  const vertex=(x:number,z:number,color:THREE.Color)=>{positions.push(x,field.height(x,z)+.012,z);colors.push(color.r,color.g,color.b);};
  const strip=(ax:number,az:number,bx:number,bz:number,width:number,color:THREE.Color)=>{
    const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),nx=-dz/Math.max(len,.001)*width/2,nz=dx/Math.max(len,.001)*width/2;
    const steps=Math.max(2,Math.ceil(len/.07));
    for(let k=0;k<steps;k++){const n=positions.length/3;
      for(const [t,side] of [[k/steps,-1],[k/steps,1],[(k+1)/steps,-1],[(k+1)/steps,1]]){const edge=.86+random(Math.round((ax+dx*t)*100)+Math.round((az+dz*t)*100)*17)*.24;vertex(ax+dx*t+nx*side*edge,az+dz*t+nz*side*edge,color);}
      indices.push(n,n+2,n+1,n+1,n+2,n+3);
    }
  };
  for(const g of ground){if(!g.known)continue;const [x,,z]=g.position,seed=g.cell.row*113+g.cell.col*31;
    const color=(hex:string)=>new THREE.Color(hex).multiplyScalar(g.seen?.48:.26);
    if(g.castle){const {yaw}=settlementPlan(g),road=color('#8d806b');
      const local=(ax:number,az:number,bx:number,bz:number,w:number)=>strip(x+ax*Math.cos(yaw)+az*Math.sin(yaw),z-ax*Math.sin(yaw)+az*Math.cos(yaw),x+bx*Math.cos(yaw)+bz*Math.sin(yaw),z-bx*Math.sin(yaw)+bz*Math.cos(yaw),w,road);
      local(0,-.38,0,1.02,.09);local(-1.1,.68,1.1,.68,.055);
      local(-.88,-.86,-.90,.91,.06);local(.88,-.86,.90,.91,.06);
      local(-.30,-.52,-.30,.50,.055);local(.30,-.52,.30,.50,.055);
      local(-.37,.26,.39,.26,.16);local(-.40,-.18,.40,-.18,.08);
    }else if(g.terrain==='plain'&&random(seed)>.32&&Math.max(...[[.55,0],[-.55,0],[0,.55],[0,-.55]].map(([dx,dz])=>Math.abs(field.height(x+dx,z+dz)-field.height(x,z))))<.16){
      const angle=random(seed+1)*2.2,co=Math.cos(angle),si=Math.sin(angle);
      for(let plot=0;plot<3;plot++){
        const ox=.22+(plot-1)*.24,oz=(random(seed+plot*7)-.5)*.30;
        const width=.19+random(seed+plot*13)*.07,length=.35+random(seed+plot*19)*.19;
        for(let row=0;row<24;row++){const xx=ox-width/2+row*width/24,bend=Math.sin(row*.12+seed)*.035;
          const tint=color(plot===0?'#b4a376':plot===1?'#87915f':'#a19070').multiplyScalar(row%2?.96:1);
          strip(x+xx*co-(oz-length/2+bend)*si,z+xx*si+(oz-length/2+bend)*co,x+xx*co-(oz+length/2+bend)*si,z+xx*si+(oz+length/2+bend)*co,width/24*1.12,tint);}
      }
      strip(x-.52*co,z-.52*si,x+.54*co,z+.54*si,.028,color('#9c9277'));
    }
    if(g.seen&&g.cell.hasRoad)for(const other of ground){
      if(!other.known||other.cell.id<=g.cell.id||!(other.castle||other.seen&&other.cell.hasRoad))continue;
      const dx=other.position[0]-x,dz=other.position[2]-z;
      if(Math.hypot(dx,dz)>1.8)continue;
      const mx=x+dx*.5-dz*.08,mz=z+dz*.5+dx*.08;
      strip(x,z,mx,mz,.052,color('#a3977d'));strip(mx,mz,other.position[0],other.position[2],.052,color('#a3977d'));
    }
  }
  const uv:number[]=[];for(let i=0;i<positions.length;i+=3)uv.push(positions[i]*2,positions[i+2]*2);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export default function RealmLandscape({ground}:{ground:Ground[]}){
  const maps=useRealmMaterial('aerial_grass_rock');
  const geometry=useMemo(()=>landscapeDetails(ground),[ground]);useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry} receiveShadow raycast={()=>{}}><meshStandardMaterial {...maps} vertexColors roughness={1} polygonOffset polygonOffsetFactor={-1} side={THREE.DoubleSide} onBeforeCompile={shader=>{
    shader.vertexShader='varying vec3 vEarth;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvEarth=position;');
    shader.fragmentShader='varying vec3 vEarth;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','vec3 earthTex=texture2D(map,vMapUv).rgb;diffuseColor.rgb*=.55+earthTex*.65;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nfloat grain=fract(sin(dot(floor(vEarth.xz*220.),vec2(12.9898,78.233)))*43758.5453);diffuseColor.rgb*=.88+grain*.17;');
  }}/></mesh>;
}
