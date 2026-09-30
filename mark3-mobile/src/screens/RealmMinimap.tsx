import React from 'react';
import {View,Text,StyleSheet,useWindowDimensions} from 'react-native';
import Svg,{Polygon,Circle} from 'react-native-svg';
import type {Ground,V3} from './medievalScene';
/** 현재 보이는/기억한 영토만 그린다. 미니맵에서 카메라만 이동한다. */
export default function RealmMinimap({ground,target,onMove}:{ground:Ground[];target:V3;onMove:(tile:Ground)=>void}){
 const {width,height}=useWindowDimensions(),small=width<900||height<500;
 const xs=ground.map(g=>g.position[0]),zs=ground.map(g=>g.position[2]),minX=Math.min(...xs)-1,maxX=Math.max(...xs)+1,minZ=Math.min(...zs)-1,maxZ=Math.max(...zs)+1;
 const w=maxX-minX,h=maxZ-minZ;
 return <View style={[s.frame,small&&{width:124,height:91,right:8,bottom:82}]}><Text style={s.label}>왕국 지도</Text><Svg width="100%" height="82%" viewBox={`${minX} ${minZ} ${w} ${h}`}>
 {ground.map(g=><Polygon key={g.cell.id} points={Array.from({length:6},(_,i)=>{const a=Math.PI/6+i*Math.PI/3;return `${g.position[0]+Math.cos(a)*.99},${g.position[2]+Math.sin(a)*.99}`;}).join(' ')} fill={!g.known?'#19272b':g.owner!==null?g.heraldry:g.terrain==='mountain'?'#8a8979':g.terrain==='forest'?'#3e5940':'#8f875e'} opacity={g.seen?1:.5} onPress={()=>onMove(g)}/>)}
 {ground.filter(g=>g.known&&g.castle).map(g=><Circle key={g.cell.id} cx={g.position[0]} cy={g.position[2]} r={.27} fill="#f4db94"/>)}
 <Circle cx={target[0]} cy={target[2]} r={.8} fill="none" stroke="#fff0bc" strokeWidth={.1}/>
 </Svg></View>;
}
const s=StyleSheet.create({frame:{position:'absolute',right:16,bottom:16,width:208,height:148,backgroundColor:'#14211e',borderWidth:2,borderColor:'#a68c58',padding:7},label:{fontFamily:'serif',fontSize:11,color:'#e7d7b7',marginBottom:3}});
