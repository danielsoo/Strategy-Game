import * as THREE from 'three';
import type { Ground } from './medievalScene';

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
      if(g.known&&g.terrain==='mountain'&&d<2.05){
        const ridge=.85+.15*Math.sin(x*6.7+z*3.9)*Math.cos(z*5.1-x*2.4);
        mountain+=Math.pow(Math.max(0,1-d/2.05),1.7)*1.9*ridge;
      }
      if(g.castle&&d<1.04)flat=Math.max(flat,1-Math.pow(d/1.04,5));
    }
    const rolling=.24+.10*Math.sin(x*.65+z*.3)+.07*Math.cos(z*.95-x*.22);
    const detail=.022*Math.sin(x*8.1+z*4.3)*Math.cos(z*6.1);
    return rolling+detail*(1-flat)+mountain*(1-flat*.94);
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
  return {height,color};
}

export function campaignSurface(ground: Ground[], subdivisions=6) {
  const field=terrainField(ground),positions:number[]=[],colors:number[]=[],indices:number[]=[],faces:number[]=[];
  const vertices=new Map<string,number>();
  const vertex=(x:number,z:number)=>{
    const key=`${Math.round(x*100000)},${Math.round(z*100000)}`;const old=vertices.get(key);if(old!==undefined)return old;
    const id=positions.length/3;vertices.set(key,id);positions.push(x,field.height(x,z),z);
    const c=field.color(x,z);colors.push(c.r,c.g,c.b);return id;
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
