import * as T from 'three';
import {buildBattleWeapon,WeaponKind,WEAPONS} from './battleWeapons';
import {NativeClip} from './nativeCombatModels';

export const WEAPON_CLIPS:Record<WeaponKind,NativeClip[]>={
 sword:['idle','slash','cross','heavy','block','guard','release','impact','walk'],
 hatchet:['axeIdle','axeChop','axeSweep','axeBlock','axeWalk'],
 axe:['twoIdle','twoChop','twoSweep','twoBlock','twoWalk'],
 halberd:['twoIdle','twoChop','twoSweep','twoBlock','twoWalk','spearGuard','spearThrust'],
 spear:['spearGuard','spearThrust'],
 flail:['axeIdle','axeChop','axeSweep','axeWalk'],
};
export const weaponClipLabel=(weapon:WeaponKind,clip:NativeClip,label:string)=>weapon==='flail'?({axeChop:'강공격 · 철구 내려치기',axeSweep:'철구 가로 휘두르기'} as Partial<Record<NativeClip,string>>)[clip]??label:label;

/** Follow native captured hands. Never replace the captured shoulder/elbow rotations with IK. */
export function createNativeWeapon(root:T.Object3D,kind:WeaponKind){
 const right=root.getObjectByName('mixamorigRightHand')!,left=root.getObjectByName('mixamorigLeftHand')!;
 root.updateMatrixWorld(true);
 let bind=root.userData.nativeRightBind as number[]|undefined;
 if(!bind)root.traverse(o=>{if(o.userData.nativeRightBind)bind=o.userData.nativeRightBind;});
 if(!root.userData.nativeRightBind)root.userData.nativeRightBind=bind??right.getWorldQuaternion(new T.Quaternion()).toArray();
 const rest=new T.Quaternion().fromArray(root.userData.nativeRightBind).invert();
 const prop=kind==='sword'?null:buildBattleWeapon(kind);
 // Original FBX object labels do not describe their geometry: these are the
 // verified 684-vertex sword and 306-vertex shield, not the body or helmet.
 const sword=root.getObjectByName('Paladin_J_Nordstrom'),shield=root.getObjectByName('Paladin_J_Nordstrom_Helmet');
 // Lighter bodies use a shorter poleaxe, keeping its follow-through above
 // the floor without moving the captured arms or lifting the character.
 if(prop&&kind==='halberd')prop.scale.setScalar(sword?.95:.62);
 if(prop&&!sword&&kind==='axe')prop.scale.setScalar(.78);
 if(sword)sword.visible=kind==='sword';
 if(shield)shield.visible=kind==='sword'||kind==='hatchet'||kind==='flail';
 const rightGrip=new T.Vector3(),leftGrip=new T.Vector3(),axis=new T.Vector3(),edge=new T.Vector3(),normal=new T.Vector3(),q=new T.Quaternion(),matrix=new T.Matrix4();
 const palm=(hand:T.Object3D)=>{
  const knuckle=hand.children.find(b=>b.name.endsWith('HandMiddle1'));
  const p=knuckle?knuckle.position.clone().multiplyScalar(1.13):new T.Vector3(0,11,0);
  p.z-=p.length()*.227;return p;
 };
 const grip=(hand:T.Object3D,out:T.Vector3)=>hand.localToWorld(out.copy(palm(hand)));
 function update(clip:NativeClip,time:number,duration:number){
  if(!prop)return;
  root.updateMatrixWorld(true);grip(right,rightGrip);grip(left,leftGrip);
  right.getWorldQuaternion(q).multiply(rest);
  const two=WEAPONS[kind].twoHanded;
  if(two){
   // Spear: forward hand ahead of rear hand. Axe/poleaxe: leading right hand
   // above the left hand on the haft. Both palms stay on one straight shaft.
   axis.copy(rightGrip).sub(leftGrip);if(clip.startsWith('spear'))axis.negate();
   else if(axis.dot(new T.Vector3(0,0,1).applyQuaternion(q))<0)axis.negate();
   axis.normalize();
   edge.set(0,-1,0).applyQuaternion(q);edge.addScaledVector(axis,-edge.dot(axis)).normalize();
   normal.crossVectors(axis,edge).normalize();edge.crossVectors(normal,axis).normalize();
   prop.quaternion.setFromRotationMatrix(matrix.makeBasis(edge,normal,axis));
  }else prop.quaternion.copy(q).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-Math.PI/2));
  prop.position.copy(rightGrip);prop.updateMatrixWorld(true);
  if(kind==='flail'){
   // Deterministic lag; no accumulated simulation state, including on rewind.
   const chain=prop.userData.chain as T.Group,phase=time/Math.max(duration,.01);
   const attack=clip==='axeChop'||clip==='axeSweep';
   const load=T.MathUtils.smoothstep(phase,.08,.32),release=1-T.MathUtils.smoothstep(phase,.54,.84);
   const gravity=new T.Vector3(0,-1,0).applyQuaternion(prop.quaternion.clone().invert());
   const delayed=new T.Vector3(-Math.sin((1-phase)*1.2),0,Math.cos((1-phase)*1.2));
   chain.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),gravity.lerp(delayed,attack?load*release:0).normalize());
  }
 }
 return {prop,update,rightGrip,leftGrip,dispose(){if(!prop)return;const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();prop.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if((m as T.MeshStandardMaterial).map)textures.add((m as T.MeshStandardMaterial).map!);}}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
