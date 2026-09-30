import React,{useMemo,useEffect} from 'react';
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils';
import type {Ground} from './medievalScene';
import {terrainField} from './campaignTerrain';
import {settlementPlan} from './realmLayout';
import {useRealmMaterial} from './realmAssets';

/** 주택과 독립된 석조 성벽. 벽 두께·보행로·총안·성문을 실제 입체로 만든다. */
export default function RealmFortifications({ground}:{ground:Ground[]}){
 const maps=useRealmMaterial('medieval_blocks_05');
 const geometry=useMemo(()=>{
  const pieces:THREE.BufferGeometry[]=[],field=terrainField(ground);
  for(const tile of ground){if(!tile.known||!tile.castle)continue;
   const {yaw}=settlementPlan(tile),co=Math.cos(yaw),si=Math.sin(yaw);
   const add=(shape:THREE.BufferGeometry,x:number,y:number,z:number,sx:number,sy:number,sz:number,a=0)=>{
    const wx=tile.position[0]+x*co+z*si,wz=tile.position[2]-x*si+z*co;
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(wx,field.height(wx,wz)+y,wz),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,yaw+a,0)),new THREE.Vector3(sx,sy,sz));
    const g=shape.index?shape.toNonIndexed():shape;if(g!==shape)shape.dispose();g.applyMatrix4(matrix);
    const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv:number[]=[],colors:number[]=[];
    const tint=new THREE.Color(tile.seen?'#b7b2a0':'#626f74');
    for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));uv.push((ax>az?p.getZ(i):p.getX(i))*8,(ay>Math.max(ax,az)?p.getZ(i):p.getY(i))*8);colors.push(tint.r,tint.g,tint.b);}
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));pieces.push(g);
   };
   const box=(x:number,y:number,z:number,w:number,h:number,d:number,a=0)=>add(new THREE.BoxGeometry(),x,y,z,w,h,d,a);
   const points=Array.from({length:10},(_,i)=>{const a=Math.PI/2+i*Math.PI*2/10;return [Math.cos(a)*.94,Math.sin(a)*.86] as const;});
   for(let i=0;i<points.length;i++){
    const [ax,az]=points[i],[bx,bz]=points[(i+1)%points.length],length=Math.hypot(bx-ax,bz-az),angle=-Math.atan2(bz-az,bx-ax);
    const segment=(lo:number,hi:number)=>{const t=(lo+hi)/2;box(ax+(bx-ax)*t,.115,az+(bz-az)*t,length*(hi-lo),.23,.065,angle);};
    if(i===0){segment(0,.29);segment(.71,1);const x=(ax+bx)/2,z=(az+bz)/2;box(x,.245,z,length*.43,.09,.085,angle);}
    else segment(0,1);
    const merlons=Math.ceil(length/.06);
    for(let k=0;k<merlons;k++){const t=(k+.5)/merlons;box(ax+(bx-ax)*t,.261,az+(bz-az)*t,.032,.055,.073,angle);}
    // 각 모서리의 원형 탑과 방어용 총안.
    add(new THREE.CylinderGeometry(1,1,1,16),ax,.17,az,.09,.34,.09);
    add(new THREE.CylinderGeometry(1,1,1,16),ax,.33,az,.103,.032,.103);
    for(let k=0;k<8;k++){const a=k*Math.PI/4;box(ax+Math.cos(a)*.09,.367,az+Math.sin(a)*.09,.042,.065,.038,-a);}
   }
   // 성내 높은 주탑이 멀리서도 도시의 중심으로 읽히게 한다.
   const kx=-.12,kz=-.21;
   box(kx,.22,kz,.29,.44,.26);
   for(const dx of [-.145,.145])for(const dz of [-.13,.13]){
    add(new THREE.CylinderGeometry(1,1,1,12),kx+dx,.29,kz+dz,.06,.58,.06);
    for(let k=0;k<6;k++){const a=k*Math.PI/3;box(kx+dx+Math.cos(a)*.055,.601,kz+dz+Math.sin(a)*.055,.026,.044,.028,-a);}
   }
  }
  if(!pieces.length)return new THREE.BufferGeometry();
  const merged=mergeGeometries(pieces);pieces.forEach(g=>g.dispose());return merged;
 },[ground]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} castShadow receiveShadow raycast={()=>{}}><meshStandardMaterial {...maps} vertexColors roughness={.95} onBeforeCompile={shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat stoneLight=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));diffuseColor.rgb=vec3(stoneLight)*vec3(1.18,1.21,1.19);');}}/></mesh>;
}
