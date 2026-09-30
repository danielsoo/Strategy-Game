import React, {useMemo,useEffect} from 'react';
import * as THREE from 'three';
import {ThreeEvent} from '@react-three/fiber';
import {Ground} from './medievalScene';
import {campaignSurface,campaignBorders,campaignBackdrop,terrainField} from './campaignTerrain';
import {useRealmMaterial} from './realmAssets';

function TerrainMaterial(){
  const grass=useRealmMaterial('grass_ground'),rock=useRealmMaterial('aerial_rocks_02'),floor=useRealmMaterial('forest_floor');
  return <meshStandardMaterial side={THREE.DoubleSide} normalMap={grass.normalMap} normalScale={new THREE.Vector2(.65,.65)} roughnessMap={grass.roughnessMap} roughness={1} onBeforeCompile={shader=>{
        shader.uniforms.uGrass={value:grass.map};shader.uniforms.uRock={value:rock.map};shader.uniforms.uRockNormal={value:rock.normalMap};
        shader.uniforms.uFloor={value:floor.map};shader.uniforms.uFloorNormal={value:floor.normalMap};shader.uniforms.uFloorRough={value:floor.roughnessMap};shader.uniforms.uGrassNormal={value:grass.normalMap};
        shader.vertexShader='varying vec3 vLandscape; varying vec3 vRealm; attribute vec3 realmMask;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLandscape=position;vRealm=realmMask;');
        shader.fragmentShader=`varying vec3 vLandscape;varying vec3 vRealm;uniform sampler2D uGrass;uniform sampler2D uRock;uniform sampler2D uRockNormal;uniform sampler2D uFloor;uniform sampler2D uFloorNormal;uniform sampler2D uFloorRough;uniform sampler2D uGrassNormal;
          float hashland(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float nland(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hashland(i),hashland(i+vec2(1,0)),f.x),mix(hashland(i+vec2(0,1)),hashland(i+vec2(1,1)),f.x),f.y);}
        `+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float soil=nland(vLandscape.xz*.9)*.65+nland(vLandscape.xz*3.0)*.35;
          float stone=smoothstep(.95,1.8,vLandscape.y+soil*.25);
          vec3 axis=pow(abs(normalize(cross(dFdx(vLandscape),dFdy(vLandscape)))),vec3(4.0));axis/=max(dot(axis,vec3(1.0)),.001);
          float meadow=smoothstep(.35,.7,nland(vLandscape.xz*.48)+nland(vLandscape.xz*2.7)*.18);
          vec2 groundUV=vLandscape.xz*4.0;
          vec3 turf=texture2D(uGrass,groundUV).rgb*mix(vec3(.68,1.14,.65),vec3(.9,1.1,.72),meadow);
          float litter=clamp(vRealm.z*.88+smoothstep(.62,.83,soil)*.42,0.,.94)*(1.-vRealm.y);
          vec3 woodland=texture2D(uFloor,groundUV).rgb*vec3(.64,.70,.58);
          turf=mix(turf,woodland,litter);
          vec3 cliff=texture2D(uRock,vLandscape.yz*.4).rgb*axis.x+texture2D(uRock,vLandscape.xz*.4).rgb*axis.y+texture2D(uRock,vLandscape.xy*.4).rgb*axis.z;
          cliff=mix(cliff,vec3(dot(cliff,vec3(.2126,.7152,.0722))),.42)*vec3(.92,.98,1.04);
          stone=max(stone,smoothstep(.35,.85,1.0-axis.y));
          turf=mix(turf,vec3(.39,.32,.21)*(texture2D(uRock,vLandscape.xz*.8).rgb+.4),vRealm.y*.95);
          diffuseColor.rgb=mix(turf,cliff,stone)*(.84+soil*.28)*mix(vec3(.12,.20,.23),vec3(1.0),vRealm.x);
        `);
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          roughnessFactor=mix(.92,texture2D(uFloorRough,groundUV).r,litter);
        `);
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
          vec3 groundNormal=mix(texture2D(uGrassNormal,groundUV).xyz,texture2D(uFloorNormal,groundUV).xyz,litter)*2.-1.;
          groundNormal.xy*=.7;
          normal=normalize(getTangentFrame(-vViewPosition,normal,groundUV)*groundNormal);
          vec3 rockNormal=texture2D(uRockNormal,vLandscape.xz*.33+vLandscape.y*.14).xyz*2.0-1.0;
          normal=normalize(mix(normal,getTangentFrame(-vViewPosition,normal,vLandscape.xz*.33+vLandscape.y*.14)*rockNormal,smoothstep(.65,1.6,vLandscape.y)*.65));
        `);
      }}/>;
}

export default function CampaignLand({ground,onPick}:{ground:Ground[];onPick:(index:number,event:ThreeEvent<MouseEvent>)=>void}) {
  const surface=useMemo(()=>campaignSurface(ground),[ground]);
  const borders=useMemo(()=>campaignBorders(ground,surface.field.height),[ground,surface]);
  const backdrop=useMemo(()=>campaignBackdrop(ground),[ground]);
  useEffect(()=>()=>{surface.geometry.dispose();borders.dispose();backdrop.dispose();},[surface,borders,backdrop]);
  return <group>
    <mesh geometry={backdrop} receiveShadow raycast={()=>{}}><TerrainMaterial/></mesh>
    <mesh geometry={surface.geometry} receiveShadow onClick={e=>{if(e.faceIndex!=null)onPick(surface.faces[e.faceIndex],e);}}><TerrainMaterial/></mesh>
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
