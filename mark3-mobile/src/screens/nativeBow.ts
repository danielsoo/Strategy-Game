import * as T from 'three';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils';
import {NativeClip} from './nativeCombatModels';

type Grip=(hand:T.Object3D,out:T.Vector3,scope:T.Object3D)=>T.Vector3;
const RELEASE_TIME=5/30;
/** Native Longbow captures drive both hands; only the held equipment is animated here. */
export function createNativeBow(root:T.Object3D,animations:T.AnimationClip[],grip:Grip){
 const left=root.getObjectByName('mixamorigLeftHand')!,right=root.getObjectByName('mixamorigRightHand')!;
 for(const name of ['Paladin_J_Nordstrom','Paladin_J_Nordstrom_Helmet']){const mesh=root.getObjectByName(name);if(mesh)mesh.visible=false;}
 const prop=new T.Group(),limbs=new T.Group();prop.add(limbs);
 const wood=new T.MeshStandardMaterial({color:'#704322',roughness:.73}),horn=new T.MeshStandardMaterial({color:'#c0a575',roughness:.5}),leather=new T.MeshStandardMaterial({color:'#352c23',roughness:.95}),steel=new T.MeshStandardMaterial({color:'#a9aeb0',metalness:.8,roughness:.38}),feather=new T.MeshStandardMaterial({color:'#c8bd9d',side:T.DoubleSide,roughness:1}),cord=new T.MeshStandardMaterial({color:'#cbbb94',roughness:1});
 const cylinder=new T.CylinderGeometry(1,1,1,8),vertical=new T.Vector3(0,1,0);
 function rod(a:T.Vector3,b:T.Vector3,r:number,material:T.Material,parent=prop){const mesh=new T.Mesh(cylinder,material);parent.add(mesh);setRod(mesh,a,b,r);return mesh;}
 function setRod(mesh:T.Mesh,a:T.Vector3,b:T.Vector3,r:number){const d=b.clone().sub(a);mesh.position.copy(a).lerp(b,.5);mesh.quaternion.setFromUnitVectors(vertical,d.clone().normalize());mesh.scale.set(r,d.length(),r);}
 const upper=new T.Vector3(0,.72,-.17),lower=new T.Vector3(0,-.72,-.17);
 for(const sign of [-1,1]){
  const curve=new T.CatmullRomCurve3([new T.Vector3(0,0,0),new T.Vector3(0,sign*.22,.025),new T.Vector3(0,sign*.48,-.035),new T.Vector3(0,sign*.65,-.135),new T.Vector3(0,sign*.72,-.17)]);
  const limb=new T.Mesh(new T.TubeGeometry(curve,24,.016,8,false),wood);limbs.add(limb);
  rod(new T.Vector3(0,sign*.66,-.14),new T.Vector3(0,sign*.725,-.173),.018,horn,limbs);
 }
 rod(new T.Vector3(0,-.09,0),new T.Vector3(0,.09,0),.024,leather);
 for(let i=0;i<12;i++){const band=new T.Mesh(new T.TorusGeometry(.024,.002,4,16),horn);band.rotation.x=Math.PI/2;band.position.y=-.08+i*.014;prop.add(band);}
 const stringA=rod(upper,new T.Vector3(0,0,-.17),.0018,cord),stringB=rod(lower,new T.Vector3(0,0,-.17),.0018,cord);
 const arrow=new T.Group();prop.add(arrow);
 rod(new T.Vector3(),new T.Vector3(0,0,.88),.004,wood,arrow);
 const tip=new T.Mesh(new T.ConeGeometry(.014,.065,4),steel);tip.rotation.x=Math.PI/2;tip.position.z=.905;arrow.add(tip);
 for(let i=0;i<3;i++){const f=new T.Mesh(new T.PlaneGeometry(.034,.115),feather);f.rotation.x=Math.PI/2;f.rotation.z=i*Math.PI*2/3;f.position.z=.11;arrow.add(f);}
 prop.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
 const rightGrip=new T.Vector3(),leftGrip=new T.Vector3(),up=new T.Vector3(),forward=new T.Vector3(),side=new T.Vector3(),basis=new T.Matrix4();
 function frame(scope:T.Object3D,l:T.Vector3,r:T.Vector3,aim:boolean){
  const hand=scope.getObjectByName('mixamorigLeftHand')!;
  up.set(-1,0,0).applyQuaternion(hand.getWorldQuaternion(new T.Quaternion()));
  forward.copy(aim?l.clone().sub(r):new T.Vector3(0,0,1).applyQuaternion(scope.getWorldQuaternion(new T.Quaternion()))).normalize();
  up.addScaledVector(forward,-up.dot(forward)).normalize();side.crossVectors(up,forward).normalize();up.crossVectors(forward,side).normalize();
  return new T.Quaternion().setFromRotationMatrix(basis.makeBasis(side,up,forward));
 }
 const sample=clone(root),mixer=new T.AnimationMixer(sample),shotClip=animations.find(c=>c.name==='bowShoot')!;
 mixer.clipAction(shotClip).play();mixer.setTime(RELEASE_TIME);sample.updateMatrixWorld(true);
 const shotLeft=grip(sample.getObjectByName('mixamorigLeftHand')!,new T.Vector3(),sample),shotRight=grip(sample.getObjectByName('mixamorigRightHand')!,new T.Vector3(),sample);
 const shotDirection=shotLeft.clone().sub(shotRight).normalize();shotRight.y-=sample.position.y;
 mixer.stopAllAction();const deathClip=animations.find(c=>c.name==='bowDeath')!;mixer.clipAction(deathClip).play();const deathTime=deathClip.duration*.28;mixer.setTime(deathTime);sample.updateMatrixWorld(true);
 const deathLeft=grip(sample.getObjectByName('mixamorigLeftHand')!,new T.Vector3(),sample),deathRight=grip(sample.getObjectByName('mixamorigRightHand')!,new T.Vector3(),sample),deathRotation=frame(sample,deathLeft,deathRight,false);deathLeft.y-=sample.position.y;
 mixer.stopAllAction();mixer.uncacheRoot(sample);
 let released=false;
 function update(clip:NativeClip,time:number,duration:number){
  if(clip==='bowVolley'){
   const draw=animations.find(c=>c.name==='bowDraw')!.duration,shoot=shotClip.duration;
   if(time<draw)clip='bowDraw';else if(time<draw+.65){clip='bowAim';time-=draw;}else if(time<draw+.65+shoot){clip='bowShoot';time-=draw+.65;}else{clip='bowIdle';time-=draw+.65+shoot;}
  }
  root.updateMatrixWorld(true);grip(left,leftGrip,root);grip(right,rightGrip,root);
  const aiming=clip==='bowAim'||clip==='bowShoot'&&time<RELEASE_TIME||clip==='bowDraw'&&time>.55;
  prop.position.copy(leftGrip);prop.quaternion.copy(frame(root,leftGrip,rightGrip,aiming));prop.updateMatrixWorld(true);
  const nock=new T.Vector3(0,0,-.17),drawing=clip==='bowDraw'&&time>.58;
  if(aiming||drawing)nock.copy(prop.worldToLocal(rightGrip.clone()));
  const fired=clip==='bowShoot'&&time>=RELEASE_TIME;
  if(fired)nock.z=-.17+Math.sin((time-RELEASE_TIME)*85)*.025*Math.exp(-(time-RELEASE_TIME)*18);
  setRod(stringA,upper,nock,.0018);setRod(stringB,lower,nock,.0018);
  arrow.visible=aiming||drawing||fired||clip==='bowDraw'&&time>.34;
  arrow.position.copy(nock);arrow.quaternion.identity();
  if(clip==='bowDraw'&&time<=.58){arrow.position.copy(prop.worldToLocal(rightGrip.clone()));const worldDirection=new T.Vector3(0,1,0).lerp(leftGrip.clone().sub(rightGrip).normalize(),T.MathUtils.smoothstep(time,.34,.58)).normalize();arrow.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),worldDirection.applyQuaternion(prop.quaternion.clone().invert()));}
  if(fired){const elapsed=time-RELEASE_TIME,position=shotRight.clone().addScaledVector(shotDirection,elapsed*24);position.y+=root.position.y-4.9*elapsed*elapsed;arrow.position.copy(prop.worldToLocal(position));const direction=shotDirection.clone().multiplyScalar(24).add(new T.Vector3(0,-9.8*elapsed,0)).normalize();arrow.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),direction.applyQuaternion(prop.quaternion.clone().invert()));}
  released=clip==='bowDeath'&&time>=deathTime;
  if(released){const elapsed=time-deathTime;prop.position.copy(deathLeft);prop.position.y+=root.position.y-4.9*elapsed*elapsed;prop.quaternion.copy(deathRotation).slerp(new T.Quaternion().setFromEuler(new T.Euler(Math.PI/2,0,0)),T.MathUtils.smoothstep(elapsed,0,.5));prop.updateMatrixWorld(true);const box=new T.Box3();prop.traverseVisible(o=>{if(o instanceof T.Mesh)box.expandByObject(o,true);});if(box.min.y<.012)prop.position.y+=.012-box.min.y;}
  prop.userData.nock=nock;prop.userData.arrow=arrow;prop.userData.fired=fired;prop.userData.releaseTime=RELEASE_TIME;
 }
 return {prop,update,rightGrip,leftGrip,get released(){return released;},dispose(){const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();prop.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
