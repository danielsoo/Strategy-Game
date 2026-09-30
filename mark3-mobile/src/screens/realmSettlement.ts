import type {Ground,Shape,V3} from './medievalScene';
import {settlementPlan} from './realmLayout';

type Emit=(shape:Shape,x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string,rotation?:V3)=>void;
/** 건물은 실제 저작된 자산으로 그린다. 이 투영에는 나라 깃발만 남긴다. */
export function buildSettlement(g:Ground,emit:Emit){
  const {yaw,kind}=settlementPlan(g),x=-.14,z=-.24,h=kind==='abbey'?.31:.42;
  const px=x*Math.cos(yaw)+z*Math.sin(yaw),pz=-x*Math.sin(yaw)+z*Math.cos(yaw);
  emit('trunk',px,h+.045,pz,.002,.10,.002,'#9d8e6c');
  emit('flag',px+.031,h+.069,pz,.064,.037,1,g.heraldry);
}
