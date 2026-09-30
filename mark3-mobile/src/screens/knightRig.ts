import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils';
import {tagKnightEquipment} from './armyAnimation';
import {FighterPose,Point,jointIK,SWORD_REST_DIRECTION} from './duelMotion';

const V=(p:Point)=>new THREE.Vector3(...p);
const shoulder=(s:number):Point=>[s*.24,1.34,0];
const elbow=(s:number):Point=>[s*.43,1.16,.015];
const wrist=(s:number):Point=>[s*.61,1.01,.045];
const hip=(s:number):Point=>[s*.135,.83,0];
const knee=(s:number):Point=>[s*.14,.45,.01];
const ankle=(s:number):Point=>[s*.145,.08,0];
const rest:Point[]=[[0,.88,0],shoulder(-1),elbow(-1),wrist(-1),shoulder(1),elbow(1),wrist(1),[0,1.48,0],[0,.8,0],hip(-1),knee(-1),hip(1),knee(1),[.524625,1.191472,-.103256]];
const smooth=(a:number,b:number,x:number)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

/** 정적 원본에 관절 가중치를 추가한다. 검·방패는 단일 손뼈에 묶어 휘지 않게 한다. */
export function buildKnightRig(scene:THREE.Group){
 scene.updateMatrixWorld(true);const parts:THREE.BufferGeometry[]=[];let material:THREE.MeshStandardMaterial|undefined;
 scene.traverse(o=>{if(!(o as THREE.Mesh).isMesh)return;const m=o as THREE.Mesh,g=m.geometry.clone().applyMatrix4(m.matrixWorld);tagKnightEquipment(g,m.name.endsWith('001'));parts.push(g);material??=(m.material as THREE.MeshStandardMaterial).clone();});
 const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());geometry.computeBoundingBox();const box=geometry.boundingBox!,scale=1.75/(box.max.y-box.min.y);
 // 무기까지 포함한 경계 상자로 중심을 잡으면 어깨 축이 인체에서 벗어난다.
 geometry.translate(0,-box.min.y,0);geometry.scale(scale,scale,scale);
 const p=geometry.getAttribute('position'),equipment=geometry.getAttribute('realmEquipment'),ids:number[]=[],weights:number[]=[];
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),ax=Math.abs(x),side=x<0?-1:1,arm=side<0?1:4,leg=side<0?9:11;
  let influences:Array<[number,number]>;
  if(equipment.getX(i)>1.5)influences=[[13,1]];
  else if(equipment.getX(i)>.5)influences=[[3,1]];
  else if(y>1.46&&ax<.18)influences=[[7,1]];
  else if(ax>.24&&y>.83){
   const lower=smooth(.40,.49,ax),hand=smooth(.56,.61,ax),armWeight=smooth(.23,.33,ax);
   influences=[[0,1-armWeight],[arm,armWeight*(1-lower)],[arm+1,armWeight*lower*(1-hand)],[arm+2,armWeight*lower*hand]];
  }else if(y<.79){const legWeight=1-smooth(.69,.81,y),lower=1-smooth(.40,.50,y);influences=[[8,1-legWeight],[leg,legWeight*(1-lower)],[leg+1,legWeight*lower]];}
  else influences=[[y<.9?8:0,1]];
  for(let k=0;k<4;k++){ids.push(influences[k]?.[0]??0);weights.push(influences[k]?.[1]??0);}
 }
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ids,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
 geometry.deleteAttribute('realmEquipment');
 const bones=rest.map((p,i)=>{const b=new THREE.Bone();b.name=`knight-joint-${i}`;b.position.copy(V(p));return b;});
 const mesh=new THREE.SkinnedMesh(geometry,material!);bones.forEach(b=>mesh.add(b));mesh.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);mesh.bind(skeleton);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;
 material!.roughness=.55;material!.metalness=.62;
 for(const map of [material!.map,material!.normalMap])if(map)map.anisotropy=8;
 return {mesh,bones,dispose:()=>{geometry.dispose();material!.dispose();skeleton.dispose();}};
}

export function poseKnight(rig:ReturnType<typeof buildKnightRig>,pose:FighterPose){
 const {bones}=rig;
 const body=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,pose.twist,0));
 const pivot=V([0,.88,0]);
 const torsoPoint=(p:Point):Point=>V(p).sub(pivot).applyQuaternion(body).add(pivot).add(new THREE.Vector3(0,-pose.crouch,-pose.reaction)).toArray() as Point;
 const set=(index:number,point:Point,q=new THREE.Quaternion())=>{bones[index].position.copy(V(point));bones[index].quaternion.copy(q);};
 const segment=(index:number,a:Point,b:Point,ra:Point,rb:Point)=>set(index,a,new THREE.Quaternion().setFromUnitVectors(V(rb).sub(V(ra)).normalize(),V(b).sub(V(a)).normalize()));
 set(0,torsoPoint(rest[0]),body);set(7,torsoPoint(rest[7]),new THREE.Quaternion());set(8,[0,.8-pose.crouch,0]);
 for(const side of [-1,1]){
  const i=side<0?1:4,a=torsoPoint(shoulder(side)),hand:Point=side<0?pose.sword:[pose.shield[0],pose.shield[1]-.13,pose.shield[2]-.06];
  // 손이 닿을 수 있는 범위를 제한해 팔이 고무처럼 늘어나지 않게 한다.
  const delta=V(hand).sub(V(a)),length=.51;const endpoint=delta.length()>length?V(a).add(delta.normalize().multiplyScalar(length)).toArray() as Point:hand;
  const joint=jointIK(a,endpoint,[side*.70,1.04,-.25],.263,.251);
  segment(i,a,joint,shoulder(side),elbow(side));segment(i+1,joint,endpoint,elbow(side),wrist(side));
  if(side<0){const blade=V(pose.tip).sub(V(endpoint)).normalize();set(i+2,endpoint,new THREE.Quaternion().setFromUnitVectors(V(SWORD_REST_DIRECTION).normalize(),blade));}
  else {const shieldRotation=new THREE.Quaternion().setFromUnitVectors(V([-.529848,.030807,.847533]).normalize(),new THREE.Vector3(0,0,1));set(i+2,endpoint,shieldRotation);set(13,pose.shield,shieldRotation);}
  const leg=side<0?9:11,h:Point=[side*.135,.83-pose.crouch,0],foot=pose.feet[side<0?0:1];
  const k=jointIK(h,foot,[side*.14,.42,.6],.38,.37);segment(leg,h,k,hip(side),knee(side));segment(leg+1,k,foot,knee(side),ankle(side));
 }
 rig.mesh.updateMatrixWorld(true);
}
