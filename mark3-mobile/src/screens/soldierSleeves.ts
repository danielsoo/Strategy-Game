import * as T from 'three';

/** Fitted cloth arms, authored around the actual bind skeleton. Recolouring the
 * knight's projecting pauldrons made them fold up through a soldier's elbow. */
export function appendClothSleeves(g:T.BufferGeometry,bones:T.Bone[]){
 const values:Record<string,number[]>={};
 for(const [name,attribute] of Object.entries(g.attributes))values[name]=Array.from(attribute.array);
 const indices=Array.from(g.getIndex()!.array),start=indices.length;
 const sides=16;
 for(const arm of [1,4]){
  const s=bones[arm].position,e=bones[arm+1].position,w=bones[arm+2].position;
  const upper=e.clone().sub(s),lower=w.clone().sub(e),normal=upper.clone().cross(lower).normalize();
  const offset=values.position.length/3;
  // A narrow elbow transition maintains volume without a rigid armour plate.
  const rings=[[-.16,.079],[0,.080],[.3,.075],[.65,.068],[.90,.061],[1,.060],[1.10,.058],[1.4,.055],[1.75,.048],[2,.041]];
  for(const [row,[t,radius]] of rings.entries()){
   const center=t<=1?s.clone().addScaledVector(upper,t):e.clone().addScaledVector(lower,t-1);
   const blend=T.MathUtils.smoothstep(t,.9,1.1),axis=upper.clone().normalize().lerp(lower.clone().normalize(),blend).normalize(),across=normal.clone().cross(axis).normalize();
   for(let k=0;k<=sides;k++){
    const theta=k/sides*Math.PI*2,r=radius*(1+.035*Math.cos(theta*6+row*.45));
    const n=across.clone().multiplyScalar(Math.cos(theta)).addScaledVector(normal,Math.sin(theta));
    const point=center.clone().addScaledVector(n,r);
    values.position.push(...point.toArray());values.normal.push(...n.toArray());values.uv.push(k/sides,t*.35);
    values.tangent?.push(...axis.toArray(),1);
    values.skinIndex.push(arm,arm+1,0,0);values.skinWeight.push(1-blend,blend,0,0);
    if(row>0&&k<sides){const a=offset+(row-1)*(sides+1)+k,b=a+sides+1;indices.push(a,a+1,b,a+1,b+1,b);}
   }
  }
 }
 for(const [name,attribute] of Object.entries(g.attributes)){
  const array=name==='skinIndex'?new Uint16Array(values[name]):new Float32Array(values[name]);
  g.setAttribute(name,new T.BufferAttribute(array,attribute.itemSize,attribute.normalized));
 }
 g.setIndex(indices);g.addGroup(start,indices.length-start,0);
 g.computeBoundingBox();g.computeBoundingSphere();
}
