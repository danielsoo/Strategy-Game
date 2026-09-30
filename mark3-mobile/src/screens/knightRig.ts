import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils';
import {tagKnightEquipment} from './armyAnimation';
import {FighterPose,Point,jointIK,solveSwordArm,SWORD_REST_DIRECTION,SWORD_FOREARM,shieldGrip,shieldRotation} from './duelMotion';

const V=(p:Point)=>new THREE.Vector3(...p);
const shoulder=(s:number):Point=>[s*.24,1.34,0];
const elbow=(s:number):Point=>[s*.43,1.16,.015];
const wrist=(s:number):Point=>[s*.61,1.01,.045];
const hip=(s:number):Point=>[s*.135,.83,0];
const knee=(s:number):Point=>[s*.14,.45,.01];
const ankle=(s:number):Point=>[s*.145,.08,0];
const rest:Point[]=[[0,.88,0],shoulder(-1),elbow(-1),wrist(-1),shoulder(1),elbow(1),wrist(1),[0,1.48,0],[0,.8,0],hip(-1),knee(-1),hip(1),knee(1),[.524625,1.191472,-.103256],ankle(-1),ankle(1)];
const smooth=(a:number,b:number,x:number)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
/** 180도 반대 방향에서도 최단 회전축이 뒤집히지 않도록 팔의 굽힘 면을 함께 사용한다. */
function upperArmRotation(a:Point,b:Point,c:Point){
 const frame=(a:Point,b:Point,c:Point)=>{
  const along=V(b).sub(V(a)).normalize(),normal=new THREE.Vector3().crossVectors(along,V(c).sub(V(b))).normalize();
  return new THREE.Matrix4().makeBasis(along,new THREE.Vector3().crossVectors(normal,along),normal);
 };
 return new THREE.Quaternion().setFromRotationMatrix(frame(a,b,c).multiply(frame(shoulder(-1),elbow(-1),wrist(-1)).transpose()));
}

/** 정적 원본에 관절 가중치를 추가한다. 검·방패는 단일 손뼈에 묶어 휘지 않게 한다. */
export function buildKnightRig(scene:THREE.Group){
 scene.updateMatrixWorld(true);const parts:THREE.BufferGeometry[]=[];let material:THREE.MeshStandardMaterial|undefined;
 scene.traverse(o=>{if(!(o as THREE.Mesh).isMesh)return;const m=o as THREE.Mesh,g=m.geometry.clone().applyMatrix4(m.matrixWorld);tagKnightEquipment(g,m.name.endsWith('001'));parts.push(g);material??=(m.material as THREE.MeshStandardMaterial).clone();});
 const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());geometry.computeBoundingBox();const box=geometry.boundingBox!,scale=1.75/(box.max.y-box.min.y);
 // 무기까지 포함한 경계 상자로 중심을 잡으면 어깨 축이 인체에서 벗어난다.
 geometry.translate(0,-box.min.y,0);geometry.scale(scale,scale,scale);
 const p=geometry.getAttribute('position'),equipment=geometry.getAttribute('realmEquipment'),ids:number[]=[],weights:number[]=[];
 // 원본의 편 손가락을 검 손잡이 주위로 말아 쥔다. 손목·손바닥·무기는 이동시키지 않는다.
 const grip=V(wrist(-1)),axis=V(SWORD_REST_DIRECTION).normalize(),finger=V(SWORD_FOREARM);
 finger.addScaledVector(axis,-finger.dot(axis)).normalize();const curl=new THREE.Vector3().crossVectors(axis,finger);
 for(let i=0;i<p.count;i++){
  if(equipment.getX(i)!==0||p.getX(i)>-.56||p.getY(i)<.87||p.getY(i)>1.10)continue;
  const point=new THREE.Vector3().fromBufferAttribute(p,i),reach=point.clone().sub(grip).dot(finger);
  if(reach<=.015)continue;
  const angle=Math.min(Math.PI*1.15,(reach-.015)/.019);
  point.addScaledVector(finger,.015+Math.sin(angle)*.019-reach).addScaledVector(curl,(1-Math.cos(angle))*.019);
  p.setXYZ(i,point.x,point.y,point.z);
 }
 geometry.computeVertexNormals();geometry.computeTangents();
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),ax=Math.abs(x),side=x<0?-1:1,arm=side<0?1:4,leg=side<0?9:11;
  let influences:Array<[number,number]>;
  if(equipment.getX(i)>1.5)influences=[[13,1]];
  else if(equipment.getX(i)>.5)influences=[[3,1]];
  else if(y>1.46&&ax<.18)influences=[[7,1]];
  else if(ax>.24&&y>.83){
   // 가로 좌표만 쓰면 넓은 어깨 갑옷 끝이 아래팔로 분류되어 접힌다.
   const origin=V(shoulder(side)),axis=V(wrist(side)).sub(origin),point=new THREE.Vector3(x,y,p.getZ(i));
   const along=point.sub(origin).dot(axis)/axis.lengthSq();
   const lower=smooth(.47,.60,along),hand=smooth(.87,1.0,along),armWeight=smooth(.23,.33,ax);
   influences=[[0,1-armWeight],[arm,armWeight*(1-lower)],[arm+1,armWeight*lower*(1-hand)],[arm+2,armWeight*lower*hand]];
  }else if(y<.79){const legWeight=1-smooth(.69,.81,y),lower=1-smooth(.40,.50,y),foot=1-smooth(.12,.22,y);influences=[[8,1-legWeight],[leg,legWeight*(1-lower)],[leg+1,legWeight*lower*(1-foot)],[side<0?14:15,legWeight*lower*foot]];}
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
  if(side<0){
   const arm=solveSwordArm(pose);
   set(1,arm.shoulder,upperArmRotation(arm.shoulder,arm.elbow,arm.hand));
   set(2,arm.elbow,arm.rotation);set(3,arm.hand,arm.rotation);
  }else{
  const i=4,a=torsoPoint(shoulder(side)),endpoint=shieldGrip(pose);
  const joint=jointIK(a,endpoint,[side*.64,.98,-.16],.263,.236);
  segment(i,a,joint,shoulder(side),elbow(side));
  const rotation=shieldRotation(pose.shieldNormal),restForearm=V(wrist(side)).sub(V(elbow(side))).normalize();
  // 방패 각도를 손목에 그대로 복사하지 않는다. 손과 아래팔은 같은 축을 유지한다.
  const forearmRotation=new THREE.Quaternion().setFromUnitVectors(restForearm.clone().applyQuaternion(rotation),V(endpoint).sub(V(joint)).normalize()).multiply(rotation);
  set(i+1,joint,forearmRotation);set(i+2,endpoint,forearmRotation);set(13,pose.shield,rotation);
  }
  const leg=side<0?9:11,h:Point=[side*.135,.83-pose.crouch,0],foot=pose.feet[side<0?0:1];
  const k=jointIK(h,foot,[side*.14,.42,.6],.38,.37);segment(leg,h,k,hip(side),knee(side));segment(leg+1,k,foot,knee(side),ankle(side));
  // 종아리가 기울어도 지지하는 발바닥은 지면에 남는다.
  set(side<0?14:15,foot);
 }
 rig.mesh.updateMatrixWorld(true);
}
