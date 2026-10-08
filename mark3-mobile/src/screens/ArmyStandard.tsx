import React,{useMemo,useRef,useEffect} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import type {Ground} from './medievalScene';
import {ArmyTrack,animationNow} from './armyTimeline';
import {sampleArmyMarch} from './armyMarch';
import {armyAnchor} from './realmLayout';

/** 축소해도 소속을 읽을 수 있는 문장기. 숫자는 실제 병력 수를 그대로 표시한다. */
export default function ArmyStandard({tile,label,own,selected,onPick,track}:{tile:Ground;label:string;own:boolean;selected:boolean;onPick:()=>void;track?:ArmyTrack}){
  const ref=useRef<THREE.Sprite>(null);
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=288;const ctx=canvas.getContext('2d')!;
    const color=tile.owner===null?'#74644b':tile.heraldry;
    ctx.shadowColor='#000000';ctx.shadowBlur=9;ctx.fillStyle='#161c20';ctx.fillRect(7,229,242,49);ctx.shadowBlur=0;
    ctx.strokeStyle=selected?'#ffedab':'#b89959';ctx.lineWidth=selected?5:3;ctx.strokeRect(7,229,242,49);
    ctx.fillStyle='#f4e6c4';ctx.textAlign='center';ctx.font='bold 29px sans-serif';ctx.fillText(label.length>11?label.slice(0,10)+'…':label,128,262);
    ctx.fillStyle='#b89959';ctx.fillRect(119,14,6,200);
    ctx.beginPath();ctx.moveTo(73,17);ctx.lineTo(177,17);ctx.lineTo(177,128);ctx.lineTo(125,164);ctx.lineTo(73,128);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.lineWidth=4;ctx.stroke();
    // 글꼴 이모지 대신 벡터 문장을 그려 모든 기기에서 같은 표식을 보인다.
    ctx.strokeStyle='#f5d99a';ctx.fillStyle='#f5d99a';ctx.lineWidth=6;
    if(own){ctx.beginPath();ctx.moveTo(125,42);ctx.bezierCurveTo(97,65,113,79,125,90);ctx.bezierCurveTo(139,72,153,64,125,42);ctx.fill();ctx.beginPath();ctx.moveTo(125,84);ctx.lineTo(125,128);ctx.moveTo(99,111);ctx.lineTo(151,111);ctx.moveTo(125,101);ctx.bezierCurveTo(87,66,85,114,108,103);ctx.moveTo(125,101);ctx.bezierCurveTo(163,66,166,114,143,103);ctx.stroke();}
    else{ctx.beginPath();ctx.moveTo(99,60);ctx.lineTo(151,123);ctx.moveTo(151,60);ctx.lineTo(99,123);ctx.stroke();ctx.strokeRect(104,91,41,12);}
    ctx.fillStyle=selected?'#6c5228':'#141e27';ctx.fillRect(63,174,130,48);ctx.strokeStyle=selected?'#ffedab':'#c9ad73';ctx.strokeRect(63,174,130,48);
    ctx.fillStyle='#fff1d1';ctx.font='bold 36px serif';ctx.fillText(String(tile.cell.units),128,212);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
  },[tile.cell.units,tile.heraldry,tile.owner,label,own,selected]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  useFrame(({camera,size})=>{if(!ref.current)return;if(track?.march){const p=sampleArmyMarch(track.march,0,animationNow()-track.start),u=p.distance/Math.max(.001,track.march.distance);ref.current.position.set(p.center[0],track.from[1]+(track.to[1]-track.from[1])*u+.62,p.center[1]);}const distance=camera.position.distanceTo(ref.current.position);const pixels=size.width<700?81:100;const h=2*distance*Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov/2))*pixels/size.height;ref.current.scale.set(h*256/288,h,1);});
  const anchor=armyAnchor(tile);
  return <sprite ref={ref} position={[anchor[0],tile.height+.62,anchor[1]]} renderOrder={9} onClick={e=>{e.stopPropagation();onPick();}}>
    <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false}/>
  </sprite>;
}
