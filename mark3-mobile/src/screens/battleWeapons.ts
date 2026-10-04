import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils';

export type WeaponKind='sword'|'axe'|'hatchet'|'spear'|'halberd'|'flail';
export const WEAPONS:Record<WeaponKind,{name:string;twoHanded:boolean;reach:number;action:string}>={
 sword:{name:'검',twoHanded:false,reach:1.58,action:'베기'},
 axe:{name:'전투 도끼',twoHanded:true,reach:1.65,action:'내려찍기'},
 hatchet:{name:'손도끼',twoHanded:false,reach:1.32,action:'짧게 찍기'},
 spear:{name:'창',twoHanded:true,reach:2.05,action:'찌르기'},
 halberd:{name:'할버드',twoHanded:true,reach:1.95,action:'도끼날 베기'},
 flail:{name:'사슬 철퇴',twoHanded:false,reach:1.65,action:'철구 휘두르기'},
};
export const FIELD_WEAPONS={knight:['sword','spear','halberd'],mercenary:['axe','spear','sword'],bandit:['hatchet','flail','hatchet']} satisfies Record<string,WeaponKind[]>;

/** Original geometry, inspired by the supplied silhouettes; +Z follows the haft. */
export function buildBattleWeapon(kind:Exclude<WeaponKind,'sword'>){
 const root=new T.Group();root.userData.weapon=kind;
 const metal=new T.MeshStandardMaterial({color:'#929a9b',metalness:.88,roughness:.38}),edge=new T.MeshStandardMaterial({color:'#c9ced0',metalness:.95,roughness:.24}),dark=new T.MeshStandardMaterial({color:'#343b3d',metalness:.8,roughness:.5}),brass=new T.MeshStandardMaterial({color:'#99804e',metalness:.75,roughness:.47}),leather=new T.MeshStandardMaterial({color:'#32241b',roughness:.95});
 const grain=new Uint8Array(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const n=110+25*Math.sin(x*.78+Math.sin(y*.15)*.7)+12*Math.sin(x*2.3+y*.08);grain.set([n,n*.68,n*.40,255],(y*64+x)*4);}
 const texture=new T.DataTexture(grain,64,64);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(2,5);texture.needsUpdate=true;texture.colorSpace=T.SRGBColorSpace;
 const wood=new T.MeshStandardMaterial({map:texture,roughness:.83});
 const add=(g:T.BufferGeometry,m:T.Material,p:T.Vector3|number[]=[0,0,0],parent:T.Group=root)=>{const o=new T.Mesh(g,m);o.position.copy(p instanceof T.Vector3?p:new T.Vector3(...p));o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
 const cylinder=(from:number,to:number,r:number,m:T.Material)=>{const o=add(new T.CylinderGeometry(r,r*1.10,to-from,12),m,[0,0,(from+to)/2]);o.rotation.x=Math.PI/2;return o;};
 const ring=(z:number,r=.028,m:T.Material=brass)=>add(new T.TorusGeometry(r,.004,5,16),m,[0,0,z]);
 const wrap=(from:number,to:number)=>{cylinder(from,to,.026,leather);for(let z=from;z<to;z+=.024){const o=ring(z,.028,dark);o.rotation.x=.15;}};
 const plate=(outline:number[][],thickness:number,m:T.Material)=>{const s=new T.Shape();outline.forEach(([x,z],i)=>i?s.lineTo(x,z):s.moveTo(x,z));s.closePath();const g=new T.ExtrudeGeometry(s,{depth:thickness,bevelEnabled:true,bevelSize:.006,bevelThickness:.003,bevelSegments:1,steps:1});g.rotateX(Math.PI/2);g.translate(0,thickness/2,0);return add(g,m);};
 const head=kind==='spear'?1.15:kind==='halberd'?1.02:kind==='axe'?.66:kind==='hatchet'?.43:.43;
 const butt=kind==='spear'||kind==='halberd'?-.64:kind==='axe'?-.39:-.10;
 cylinder(butt,head,.022,wood);wrap(-.09,.10);if(WEAPONS[kind].twoHanded)wrap(.26,.43);cylinder(butt-.035,butt+.06,.029,dark);ring(butt+.06);
 cylinder(head-.12,head+.03,.032,dark);ring(head-.11);ring(head+.025);
 if(kind==='spear'||kind==='halberd'){
  const length=kind==='spear'?.34:.25,w=kind==='spear'?.07:.045;
  plate([[0,head+length],[-w,head+.095],[-.025,head-.03],[.025,head-.03],[w,head+.095]],.016,edge);
  add(new T.BoxGeometry(.012,.024,length*.68),metal,[0,0,head+length*.38]);
 }
 if(kind==='axe'||kind==='hatchet'||kind==='halberd'){
  const width=kind==='hatchet'?.19:kind==='halberd'?.25:.27,h=kind==='hatchet'?.13:.19;
  for(const sign of kind==='axe'?[-1,1]:[1]){
   const outline=[[.012,head-h*.38],[width*.55,head-h*.52],[width,head-h],[width*1.07,head-h*.2],[width,head+h],[width*.5,head+h*.50],[.012,head+h*.37]].map(([x,z])=>[x*sign,z]);
   plate(outline,.028,metal);
   plate([[width,head-h],[width*1.07,head-h*.2],[width,head+h],[width*.84,head+h*.77],[width*.90,head-h*.14],[width*.84,head-h*.77]].map(([x,z])=>[x*sign,z]),.030,edge);
   for(const face of [-1,1])for(let j=0;j<3;j++){
    const o=add(new T.TorusGeometry(.024+j*.012,.0017,3,18),brass,[sign*width*.55,face*.021,head]);o.rotation.x=Math.PI/2;
   }
  }
  for(const y of [-.039,.039])add(new T.SphereGeometry(.016,10,6),brass,[0,y,head]);
  if(kind==='halberd')plate([[0,head+.04],[-.19,head-.07],[-.12,head-.09],[0,head-.02]],.018,metal);
 }
 if(kind==='flail'){
  const chain=new T.Group();root.add(chain);chain.position.z=head;root.userData.chain=chain;
  for(let i=0;i<7;i++){const link=add(new T.TorusGeometry(.027,.006,6,12),dark,[0,0,.034+i*.038],chain);link.scale.set(1,1.4,1);link.rotation.x=Math.PI/2;link.rotation.z=i%2*Math.PI/2;}
  const ball=new T.Group();ball.position.z=.34;chain.add(ball);root.userData.ball=ball;
  add(new T.IcosahedronGeometry(.088,1),dark,[0,0,0],ball);
  for(const direction of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[.7,.7,0],[-.7,-.7,0]]){
   const d=new T.Vector3(...direction).normalize(),spike=add(new T.ConeGeometry(.024,.075,6),edge,d.clone().multiplyScalar(.108),ball);spike.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d);
  }
 }
 // Batch static pieces by material. Chain and ball keep their own moving frames.
 const batch=(parent:T.Group)=>{const groups=new Map<T.Material,T.BufferGeometry[]>();for(const o of [...parent.children]){if(!(o instanceof T.Mesh))continue;o.updateMatrix();const g=o.geometry.clone().applyMatrix4(o.matrix),m=o.material as T.Material;groups.set(m,[...(groups.get(m)??[]),g]);o.geometry.dispose();parent.remove(o);}for(const [m,parts] of groups){const g=mergeGeometries(parts.map(p=>p.index?p.toNonIndexed():p));parts.forEach(p=>p.dispose());add(g,m,[0,0,0],parent);}};
 if(kind==='flail'){batch(root.userData.ball);batch(root.userData.chain);}batch(root);
 return root;
}

export function weaponKind(root:T.Group):WeaponKind{return root.userData.weapon??'sword';}
/** Collision landmarks are in the actual weapon's local frame, not the old sword length. */
export function weaponPoint(root:T.Group,t:number){
 const kind=weaponKind(root),u=T.MathUtils.clamp((t-.10)/.75,0,1);
 if(kind==='sword')return new T.Vector3(0,0,t);
 if(kind==='spear')return new T.Vector3(0,0,.94+u*.54);
 if(kind==='halberd')return new T.Vector3(.25,0,.84+u*.37);
 if(kind==='axe')return new T.Vector3(.27,0,.47+u*.38);
 if(kind==='hatchet')return new T.Vector3(.19,0,.30+u*.26);
 const chain=root.userData.chain as T.Group;return new T.Vector3(0,0,.25+u*.18).applyQuaternion(chain.quaternion).add(chain.position);
}
export function weaponSegments(root:T.Group):T.Line3[]{
 if(weaponKind(root)==='sword')return [new T.Line3(new T.Vector3(-.03,0,.085),new T.Vector3(0,0,.87)),new T.Line3(new T.Vector3(.03,0,.085),new T.Vector3(0,0,.87))];
 const lines=[new T.Line3(weaponPoint(root,.1),weaponPoint(root,.85))];
 if(weaponKind(root)==='axe')lines.push(new T.Line3(new T.Vector3(-.27,0,.47),new T.Vector3(-.27,0,.85)));
 if(['axe','hatchet','halberd'].includes(weaponKind(root))){
  const kind=weaponKind(root),head=kind==='axe'?.66:kind==='hatchet'?.43:1.02,width=kind==='axe'?.27:kind==='hatchet'?.19:.25,h=kind==='hatchet'?.13:.19;
  for(const side of kind==='axe'?[-1,1]:[1])for(const end of [-1,1])lines.push(new T.Line3(new T.Vector3(0,0,head+end*h*.37),new T.Vector3(side*width,0,head+end*h)));
 }
 if(weaponKind(root)==='halberd')lines.push(new T.Line3(new T.Vector3(0,0,.90),new T.Vector3(0,0,1.27)));
 lines.push(new T.Line3(new T.Vector3(0,0,-.09),new T.Vector3(0,0,weaponKind(root)==='hatchet'?.43:weaponKind(root)==='flail'?.43:weaponKind(root)==='axe'?.66:1.04)));
 return lines;
}
export function parryPoint(root:T.Group,t:number){
 const kind=weaponKind(root);
 if(WEAPONS[kind].twoHanded){const low=.1,high=kind==='axe'?.65:1.02;return new T.Vector3(0,0,low+(t-.1)/.75*(high-low));}
 return weaponPoint(root,t);
}
/** A deterministic delayed chain arc: stable under pause, scrubbing and replay. */
export function animateFlail(root:T.Group,phase:number|null,time:number,dead=false){
 if(weaponKind(root)!=='flail')return;
 const chain=root.userData.chain as T.Group;
 const gravity=new T.Vector3(0,-1,0).applyQuaternion(root.quaternion.clone().invert());
 const swing=phase===null?0:T.MathUtils.smoothstep(phase,-.5,-.05)*(1-T.MathUtils.smoothstep(phase,.08,.42));
 // The head trails the accelerating handle, then catches up through impact.
 // Keep the chain taut in the cutting plane instead of instantly making a rigid rod.
 const lag=phase===null?0:.85*(1-T.MathUtils.smoothstep(phase,-.16,.02));
 const direction=gravity.lerp(new T.Vector3(-Math.sin(lag),0,Math.cos(lag)),dead?0:swing).normalize();
 chain.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),direction);
 if(!dead&&phase===null)chain.rotateZ(Math.sin(time*2)*.06);
}
