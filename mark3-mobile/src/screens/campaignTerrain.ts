import * as THREE from 'three';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils';
import type { Ground } from './medievalScene';

const hash=(x:number,z:number)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
function noise(x:number,z:number){const ix=Math.floor(x),iz=Math.floor(z);let fx=x-ix,fz=z-iz;fx=fx*fx*(3-2*fx);fz=fz*fz*(3-2*fz);
  return (hash(ix,iz)*(1-fx)+hash(ix+1,iz)*fx)*(1-fz)+(hash(ix,iz+1)*(1-fx)+hash(ix+1,iz+1)*fx)*fz;}

// 같은 월드 좌표는 어느 칸에서 계산하든 같은 높이를 갖는다. 육각형은 규칙에만 남는다.
export function terrainField(ground: Ground[]) {
  const buckets=new Map<string,Ground[]>();
  for(const g of ground){const key=`${Math.floor(g.position[0]/3)},${Math.floor(g.position[2]/3)}`;
    const bucket=buckets.get(key)??[];bucket.push(g);buckets.set(key,bucket);}
  const nearby=(x:number,z:number)=>{
    const out:Ground[]=[];const bx=Math.floor(x/3),bz=Math.floor(z/3);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)out.push(...(buckets.get(`${bx+dx},${bz+dz}`)??[]));
    return out;
  };
  const height=(x:number,z:number)=>{
    let mountain=0,flat=0;
    for(const g of nearby(x,z)){
      const d=Math.hypot(x-g.position[0],z-g.position[2]);
      if(g.known&&g.terrain==='mountain'&&d<2.8){
        const dx=x-g.position[0],dz=z-g.position[2],a=.65+noise(g.position[0]*.17,g.position[2]*.17)*.7;
        const along=dx*Math.cos(a)+dz*Math.sin(a),across=-dx*Math.sin(a)+dz*Math.cos(a);
        const ridge=.62+.44*(1-Math.abs(noise(x*2.1,z*2.1)*2-1))+.19*(1-Math.abs(noise(x*5.3,z*5.3)*2-1));
        const distance=Math.hypot(along*.7,across*1.18);
        mountain=Math.max(mountain,Math.pow(Math.max(0,1-distance/2.65),1.9)*2.25*ridge);
      }
      if(g.castle&&d<1.65){const t=Math.max(0,(d-1.16)/.49);flat=Math.max(flat,1-t*t*(3-2*t));}
    }
    const rolling=.16+.22*noise(x*.5,z*.5)+.10*noise(x*1.6,z*1.6);
    const detail=.028*noise(x*9,z*9);
    return rolling*(1-flat)+.32*flat+detail*(1-flat)+mountain*(1-flat);
  };
  const color=(x:number,z:number)=>{
    const result=new THREE.Color(0,0,0);let sum=0;
    for(const g of nearby(x,z)){
      const d=Math.hypot(x-g.position[0],z-g.position[2]);if(d>2.1)continue;
      const w=Math.pow(Math.max(0,1-d/2.1),4);sum+=w;result.add(new THREE.Color(g.color).multiplyScalar(w));
    }
    if(sum)result.multiplyScalar(1/sum);
    const h=height(x,z);if(h>.6)result.lerp(new THREE.Color('#858476'),Math.min(.82,(h-.6)*.65));
    if(h>1.9)result.lerp(new THREE.Color('#d7d3ba'),Math.min(.7,(h-1.9)*.8));
    return result;
  };
  const mask=(x:number,z:number)=>{let light=0,desert=0,forest=0,sum=0;
    for(const g of nearby(x,z)){const d=Math.hypot(x-g.position[0],z-g.position[2]);if(d>2.1)continue;const w=Math.pow(Math.max(0,1-d/2.1),4);sum+=w;light+=w*(g.seen?1:g.known?.35:.06);desert+=w*(g.known&&g.terrain==='desert'?1:0);forest+=w*(g.known&&g.terrain==='forest'?1:0);}
    return [sum?light/sum:1,sum?desert/sum:0,sum?forest/sum:0];};
  return {height,color,mask};
}

export function campaignSurface(ground: Ground[], subdivisions=12) {
  const field=terrainField(ground),positions:number[]=[],colors:number[]=[],indices:number[]=[],faces:number[]=[],uv:number[]=[],masks:number[]=[];
  const vertices=new Map<string,number>();
  const vertex=(x:number,z:number)=>{
    const key=`${Math.round(x*100000)},${Math.round(z*100000)}`;const old=vertices.get(key);if(old!==undefined)return old;
    const id=positions.length/3;vertices.set(key,id);positions.push(x,field.height(x,z),z);
    const c=field.color(x,z);colors.push(c.r,c.g,c.b);uv.push(x*.65,z*.65);masks.push(...field.mask(x,z));return id;
  };
  const triangle=(a:number,b:number,c:number,cell:number)=>{indices.push(a,c,b);faces.push(cell);};
  ground.forEach((g,cell)=>{
    const x=g.position[0],z=g.position[2];
    for(let side=0;side<6;side++){
      const a=Math.PI/6+side*Math.PI/3,b=a+Math.PI/3;
      const at=(i:number,j:number)=>vertex(x+(Math.cos(a)*i+Math.cos(b)*j)/subdivisions,z+(Math.sin(a)*i+Math.sin(b)*j)/subdivisions);
      for(let i=0;i<subdivisions;i++)for(let j=0;j<subdivisions-i;j++){
        triangle(at(i,j),at(i+1,j),at(i,j+1),cell);
        if(i+j<subdivisions-1)triangle(at(i+1,j),at(i+1,j+1),at(i,j+1),cell);
      }
    }
  });
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('realmMask',new THREE.Float32BufferAttribute(masks,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return {geometry,faces,field};
}

/** 경계는 땅의 굴곡을 따라간다. 같은 나라의 내부 육각선은 그리지 않는다. */
export function campaignBorders(ground: Ground[], height:(x:number,z:number)=>number) {
  const positions:number[]=[],colors:number[]=[];
  const lookup=new Map(ground.map(g=>[`${g.cell.row},${g.cell.col}`,g]));
  for(const g of ground){
    if(g.owner===null||!g.known)continue;
    const color=new THREE.Color(g.heraldry).lerp(new THREE.Color('#d8cfaa'),.18);
    for(let edge=0;edge<6;edge++){
      const a=Math.PI/6+edge*Math.PI/3,b=a+Math.PI/3;
      const mx=(Math.cos(a)+Math.cos(b))/2,mz=(Math.sin(a)+Math.sin(b))/2;
      // 중심 좌표를 인접 행·열로 돌려 판 전체를 검색하지 않는다.
      const row=g.cell.row+Math.round(mz*2/1.5);
      const col=g.cell.col+Math.round((mx*2/Math.sqrt(3))-((row%2)-(g.cell.row%2))*.5);
      const neighbor=lookup.get(`${row},${col}`);
      if(neighbor?.known&&neighbor.owner===g.owner)continue;
      for(let k=0;k<8;k++)for(const f of [k/8,(k+1)/8]){
        const x=g.position[0]+(Math.cos(a)*(1-f)+Math.cos(b)*f)*.998;
        const z=g.position[2]+(Math.sin(a)*(1-f)+Math.sin(b)*f)*.998;
        positions.push(x,height(x,z)+.028,z);colors.push(color.r,color.g,color.b);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geometry;
}

/** 판의 외곽 모서리에서 바깥 풍경을 잇는다. 장식 영역에는 선택할 게임 칸이 없다. */
export function campaignBackdrop(ground:Ground[]) {
  const field=terrainField(ground),lookup=new Set(ground.map(g=>`${g.cell.row},${g.cell.col}`));
  const positions:number[]=[],uv:number[]=[],masks:number[]=[],indices:number[]=[];
  for(const g of ground)for(let edge=0;edge<6;edge++){
    const a=Math.PI/6+edge*Math.PI/3,b=a+Math.PI/3,mx=(Math.cos(a)+Math.cos(b))/2,mz=(Math.sin(a)+Math.sin(b))/2;
    const row=g.cell.row+Math.round(mz*2/1.5),col=g.cell.col+Math.round(mx*2/Math.sqrt(3)-(row%2-g.cell.row%2)*.5);
    if(lookup.has(`${row},${col}`))continue;
    for(let k=0;k<6;k++)for(let band=0;band<32;band++){
      const n=positions.length/3;
      for(const [along,out] of [[k/6,band],[(k+1)/6,band],[k/6,band+1],[(k+1)/6,band+1]]){
        const factor=1+out*.14,x=(g.position[0]+Math.cos(a)*(1-along)+Math.cos(b)*along)*factor,z=(g.position[2]+Math.sin(a)*(1-along)+Math.sin(b)*along)*factor;
        positions.push(x,field.height(x,z),z);uv.push(x*.65,z*.65);masks.push(...field.mask(x,z));
      }
      indices.push(n,n+2,n+1,n+1,n+2,n+3);
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('realmMask',new THREE.Float32BufferAttribute(masks,3));geo.setIndex(indices);
  const smooth=mergeVertices(geo,.0001);geo.dispose();smooth.computeVertexNormals();return smooth;
}
