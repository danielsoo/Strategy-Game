import * as T from 'three';
import {buildBattleWeapon,WeaponKind,WEAPONS} from './battleWeapons';
import {NativeClip} from './nativeCombatModels';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils';

export const WEAPON_CLIPS:Record<WeaponKind,NativeClip[]>={
 sword:['idle','slash','cross','heavy','jumpHeavy','block','guard','release','impact','impactHeavy','death','walk'],
 hatchet:['axeIdle','axeChop','axeSweep','axeJump','axeBlock','axeImpact','axeImpactHeavy','death','axeWalk'],
 axe:['twoIdle','twoChop','twoSweep','twoJump','twoBlock','twoImpact','twoDeath','twoWalk'],
 halberd:['twoIdle','twoChop','twoSweep','twoJump','twoBlock','twoImpact','twoDeath','twoWalk','spearGuard','spearThrust'],
 spear:['spearGuard','spearThrust','twoImpact','twoDeath'],
 flail:['axeIdle','axeChop','axeSweep','axeJump','axeImpact','axeImpactHeavy','death','axeWalk'],
};
export const clipsForWeapon=(kind:WeaponKind,shield:boolean):NativeClip[]=>shield&&(kind==='hatchet'||kind==='flail')
 ?['idle','axeChop','axeSweep','axeJump','block','guard','release','impact','impactHeavy','death','walk']:WEAPON_CLIPS[kind];

export function nativeWeaponClip(animations:T.AnimationClip[],name:NativeClip,shield:boolean,kind:WeaponKind){
 const source=animations.find(c=>c.name===name)!;
 if(!shield||!['hatchet','flail'].includes(kind)||!name.startsWith('axe'))return source;
 const guard=animations.find(c=>c.name==='guard')!;
 const left=(track:T.KeyframeTrack)=>/^mixamorigLeft(Shoulder|Arm|ForeArm|Hand)/.test(track.name);
 const held=guard.tracks.filter(left).map(t=>{const track=t.clone(),value=Array.from(t.createInterpolant().evaluate(guard.duration*.5) as Float32Array);track.times=new Float32Array([0,source.duration]);track.values=new Float32Array([...value,...value]);return track;});
 return new T.AnimationClip(`${name}-shield`,source.duration,[...source.tracks.filter(t=>!left(t)),...held]);
}

/** The shaft belongs inside curled fingers (+palm Z), not behind the knuckles. */
export function capturedGrip(hand:T.Object3D,out=new T.Vector3(),scope?:T.Object3D){
 const side=hand.name.includes('Right')?'Right':'Left';
 let hierarchy=scope??hand;if(!scope)while(hierarchy.parent)hierarchy=hierarchy.parent;
 const base=hierarchy.getObjectByName(`mixamorig${side}HandMiddle1`)!;
 const curl=hierarchy.getObjectByName(`mixamorig${side}HandMiddle3`)!;
 return out.copy(base.getWorldPosition(new T.Vector3())).lerp(curl.getWorldPosition(new T.Vector3()),.5);
}
function shaftFrame(root:T.Object3D,two:boolean,spear:boolean){
 const right=root.getObjectByName('mixamorigRightHand')!,left=root.getObjectByName('mixamorigLeftHand')!;
 const r=capturedGrip(right,new T.Vector3(),root),l=capturedGrip(left,new T.Vector3(),root),q=right.getWorldQuaternion(new T.Quaternion());
 const axis=two?(spear?l.clone().sub(r):r.clone().sub(l)).normalize():new T.Vector3(1,0,0).applyQuaternion(q);
 const edge=new T.Vector3(0,1,0).applyQuaternion(q);edge.addScaledVector(axis,-edge.dot(axis)).normalize();
 return {r,l,axis,edge};
}

// Fit one constant grip roll to the fastest part of each captured cut. This is
// not a per-frame auto-aim: the weapon never spins independently during a cut.
export function calibrateCutRolls(root:T.Object3D,animations:T.AnimationClip[],kind:WeaponKind){
 const result:Partial<Record<NativeClip,number>>={};
 if(!['axe','hatchet','halberd'].includes(kind))return result;
 const sampleRoot=clone(root),mixer=new T.AnimationMixer(sampleRoot),two=WEAPONS[kind].twoHanded;
 for(const name of two?['twoChop','twoSweep','twoJump']:['axeChop','axeSweep','axeJump','jumpHeavy']){
  const clip=animations.find(c=>c.name===name);if(!clip)continue;
  mixer.stopAllAction();const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
  const samples=[];
  for(let i=0;i<=100;i++){action.enabled=true;action.paused=false;mixer.setTime(clip.duration*i/100);sampleRoot.updateMatrixWorld(true);const f=shaftFrame(sampleRoot,two,false);samples.push({...f,head:f.r.clone().addScaledVector(f.axis,kind==='hatchet'?.43:kind==='axe'?.66:1.02)});}
  let best=-1,roll=0;
  for(let i=25;i<65;i++){const f=samples[i],v=samples[i+1].head.clone().sub(samples[i-1].head);v.addScaledVector(f.axis,-v.dot(f.axis));const speed=v.lengthSq();if(speed<=best)continue;best=speed;v.normalize();roll=Math.atan2(f.axis.dot(f.edge.clone().cross(v)),f.edge.dot(v));}
  result[name as NativeClip]=roll;
 }
 mixer.stopAllAction();mixer.uncacheRoot(sampleRoot);return result;
}
export const weaponClipLabel=(weapon:WeaponKind,clip:NativeClip,label:string)=>weapon==='flail'?({axeChop:'강공격 · 철구 내려치기',axeSweep:'철구 가로 휘두르기'} as Partial<Record<NativeClip,string>>)[clip]??label:label;

/** Follow native captured hands. Never replace the captured shoulder/elbow rotations with IK. */
export function createNativeWeapon(root:T.Object3D,kind:WeaponKind,animations:T.AnimationClip[]=[]){
 const right=root.getObjectByName('mixamorigRightHand')!,left=root.getObjectByName('mixamorigLeftHand')!;
 root.updateMatrixWorld(true);
 const rolls=calibrateCutRolls(root,animations,kind);
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
 const releases=new Map<string,{position:T.Vector3;rotation:T.Quaternion;ground:T.Quaternion;time:number}>();
 if(prop){const sampleRoot=clone(root),mixer=new T.AnimationMixer(sampleRoot);
  for(const name of ['death','twoDeath']){const clip=animations.find(c=>c.name===name);if(!clip)continue;mixer.stopAllAction();mixer.clipAction(clip).play();const time=clip.duration*.28;mixer.setTime(time);sampleRoot.updateMatrixWorld(true);
   const f=shaftFrame(sampleRoot,WEAPONS[kind].twoHanded,false);f.edge.applyAxisAngle(f.axis,rolls[WEAPONS[kind].twoHanded?'twoChop':'axeChop']??0);
   const normal=new T.Vector3().crossVectors(f.axis,f.edge).normalize();
   const rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(f.edge,normal,f.axis));
   const groundAxis=f.axis.clone().setY(0).normalize(),groundEdge=new T.Vector3().crossVectors(new T.Vector3(0,1,0),groundAxis);
   const ground=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(groundEdge,new T.Vector3(0,1,0),groundAxis));
   f.r.y-=sampleRoot.position.y;releases.set(name,{position:f.r,rotation,ground,time});
  }mixer.stopAllAction();mixer.uncacheRoot(sampleRoot);
 }
 let released=false;
 function update(clip:NativeClip,time:number,duration:number){
  if(!prop)return;
  root.updateMatrixWorld(true);capturedGrip(right,rightGrip,root);capturedGrip(left,leftGrip,root);
  right.getWorldQuaternion(q);
  const two=WEAPONS[kind].twoHanded;
  if(two){
   // Spear: forward hand ahead of rear hand. Axe/poleaxe: leading right hand
   // above the left hand on the haft. Both palms stay on one straight shaft.
   axis.copy(rightGrip).sub(leftGrip);if(clip.startsWith('spear'))axis.negate();
   axis.normalize();
  }else axis.set(1,0,0).applyQuaternion(q).normalize();
  edge.set(0,1,0).applyQuaternion(q);edge.addScaledVector(axis,-edge.dot(axis)).normalize();
  const roll=rolls[clip]??rolls[two?'twoChop':'axeChop']??0;
  edge.applyAxisAngle(axis,roll);
  normal.crossVectors(axis,edge).normalize();edge.crossVectors(normal,axis).normalize();
  prop.quaternion.setFromRotationMatrix(matrix.makeBasis(edge,normal,axis));
  prop.position.copy(rightGrip);prop.updateMatrixWorld(true);
  const release=releases.get(clip);released=!!release&&time>=release.time;
  if(released&&release){const elapsed=time-release.time;
   prop.position.copy(release.position);prop.position.y+=root.position.y-4.9*elapsed*elapsed;prop.position.x+=Math.min(elapsed,.6)*.22;
   prop.quaternion.copy(release.rotation).slerp(release.ground,T.MathUtils.smoothstep(elapsed,0,.48));
  }
  if(kind==='flail'){
   // Deterministic lag; no accumulated simulation state, including on rewind.
   const chain=prop.userData.chain as T.Group,phase=time/Math.max(duration,.01);
   const attack=clip==='axeChop'||clip==='axeSweep';
   const load=T.MathUtils.smoothstep(phase,.08,.32),release=1-T.MathUtils.smoothstep(phase,.54,.84);
   const gravity=new T.Vector3(0,-1,0).applyQuaternion(prop.quaternion.clone().invert());
   const delayed=new T.Vector3(-Math.sin((1-phase)*1.2),0,Math.cos((1-phase)*1.2));
   const direction=gravity.lerp(delayed,attack?load*release:0).normalize();
   prop.updateMatrixWorld(true);const origin=prop.localToWorld(chain.position.clone()),worldDirection=direction.clone().applyQuaternion(prop.quaternion);
   const minY=T.MathUtils.clamp((.155-origin.y)/.34,-1,1);
   if(worldDirection.y<minY){worldDirection.setY(0);if(worldDirection.lengthSq()<1e-6)worldDirection.copy(axis).setY(0);worldDirection.normalize().multiplyScalar(Math.sqrt(1-minY*minY));worldDirection.y=minY;direction.copy(worldDirection).applyQuaternion(prop.quaternion.clone().invert());}
   chain.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),direction);
  }
  if(released){prop.updateMatrixWorld(true);const floor=new T.Box3().setFromObject(prop,true).min.y;if(floor<.012)prop.position.y+=.012-floor;}
 }
 return {prop,update,rightGrip,leftGrip,get released(){return released;},dispose(){if(!prop)return;const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();prop.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if((m as T.MeshStandardMaterial).map)textures.add((m as T.MeshStandardMaterial).map!);}}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
