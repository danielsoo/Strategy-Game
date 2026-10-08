import type {Ground} from './medievalScene';
import {armyAnchor,armyFormation,armyHeading} from './realmLayout';

const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
const angle=(a:number,b:number,t:number)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
export function createArmyMarch(from:Ground,to:Ground){
 const heading=Math.atan2(to.position[0]-from.position[0],to.position[2]-from.position[2]);
 const points=[armyAnchor(from),[from.position[0],from.position[2]], [to.position[0],to.position[2]],armyAnchor(to)] as [number,number][];
 const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
 const distance=lengths.reduce((a,b)=>a+b,0),turnTime=.45,duration=distance/1.15+turnTime*2;
 return {points,lengths,distance,duration,turnTime,heading,toId:to.cell.id,from:armyFormation(from),to:armyFormation(to),fromHeading:armyHeading(from),toHeading:armyHeading(to),fromAnchor:points[0],toAnchor:points[3],fromPosition:from.position,toPosition:to.position};
}
export type ArmyMarch=ReturnType<typeof createArmyMarch>;
export function sampleArmyMarch(march:ArmyMarch,index:number,elapsed:number){
 const t=Math.max(0,Math.min(march.duration,elapsed)),moving=t>march.turnTime&&t<march.duration-march.turnTime;
 const distance=Math.max(0,Math.min(march.distance,(t-march.turnTime)*1.15));
 let remaining=distance,segment=0;
 for(;segment<2&&remaining>march.lengths[segment];segment++)remaining-=march.lengths[segment];
 // Zero-length exit/entry legs are ordinary field tiles, not extra stops.
 while(segment<2&&march.lengths[segment]<1e-8)segment++;
 const a=march.points[segment],b=march.points[segment+1],u=march.lengths[segment]?Math.min(1,remaining/march.lengths[segment]):1;
 const center=[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];
 const from=march.from[index],to=march.to[index]??from;
 const enter=smooth(t/march.turnTime),settle=smooth((t-march.duration+march.turnTime)/march.turnTime);
 let direction=march.lengths[segment]>1e-8?Math.atan2(b[0]-a[0],b[1]-a[1]):march.heading;
 const next=march.lengths.findIndex((length,i)=>i>segment&&length>1e-8);
 if(next>=0){const p=march.points[next],q=march.points[next+1],turnDistance=Math.min(.65,march.lengths[segment]);direction=angle(direction,Math.atan2(q[0]-p[0],q[1]-p[1]),smooth((remaining-march.lengths[segment]+turnDistance)/turnDistance));}
 const yaw=angle(angle(march.fromHeading,direction,enter),march.toHeading,settle);
 const unrotate=(x:number,z:number,y:number)=>[x*Math.cos(y)-z*Math.sin(y),x*Math.sin(y)+z*Math.cos(y)];
 const source=unrotate(from.x+march.fromPosition[0]-march.fromAnchor[0],from.z+march.fromPosition[2]-march.fromAnchor[1],march.fromHeading);
 const target=unrotate(to.x+march.toPosition[0]-march.toAnchor[0],to.z+march.toPosition[2]-march.toAnchor[1],march.toHeading);
 const x=source[0]+(target[0]-source[0])*settle,z=source[1]+(target[1]-source[1])*settle;
 const individual=angle(from.yaw-march.fromHeading,to.yaw-march.toHeading,settle);
 return {center,x:center[0]+x*Math.cos(yaw)+z*Math.sin(yaw),z:center[1]-x*Math.sin(yaw)+z*Math.cos(yaw),yaw:yaw+individual,scale:from.scale+(to.scale-from.scale)*settle,distance,moving};
}
