import * as T from 'three';
import type {AuthoredRig} from './authoredKnightMotion';

/** Two-bone support adjustment: preserve segment lengths and the authored bend plane. */
function supportLimb(rig:AuthoredRig,upper:number,lower:number,end:number,target:T.Vector3,origin:T.Vector3){
 const a=rig.bones[upper],b=rig.bones[lower],c=rig.bones[end];
 const oldA=a.position.clone(),oldB=b.position.clone(),oldC=c.position.clone();
 const l1=oldA.distanceTo(oldB),l2=oldB.distanceTo(oldC),axis=target.clone().sub(origin);
 const distance=T.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.0001,l1+l2-.0001);axis.normalize();
 const pole=oldB.clone().sub(oldA);pole.addScaledVector(axis,-pole.dot(axis));
 if(pole.lengthSq()<1e-8)pole.set(0,1,0).addScaledVector(axis,-axis.y);
 pole.normalize();
 const along=(l1*l1+distance*distance-l2*l2)/(2*distance),bend=Math.sqrt(Math.max(0,l1*l1-along*along));
 const knee=origin.clone().addScaledVector(axis,along).addScaledVector(pole,bend),tip=origin.clone().addScaledVector(axis,distance);
 const qa=new T.Quaternion().setFromUnitVectors(oldB.clone().sub(oldA).normalize(),knee.clone().sub(origin).normalize());
 const qb=new T.Quaternion().setFromUnitVectors(oldC.clone().sub(oldB).normalize(),tip.clone().sub(knee).normalize());
 a.position.copy(origin);a.quaternion.premultiply(qa);b.position.copy(knee);b.quaternion.premultiply(qb);c.position.copy(tip);c.quaternion.premultiply(qb);
 if(end===3||end===6){
  const hand=rig.hands[end===3?0:1];
  hand.position.sub(oldC).applyQuaternion(qb).add(tip);hand.quaternion.premultiply(qb);
 }
}

/** Let the back and heels settle separately; a grounded sword must not prop up the corpse. */
export function settleCorpse(rig:AuthoredRig,parts:{mesh:T.Mesh;ids:number[]}[],weight:number,root:T.Vector3,yaw:number,height:(x:number,z:number)=>number){
 if(weight<=0)return;
 rig.mesh.updateMatrixWorld(true);rig.mesh.skeleton.update();
 const inverse=new T.Matrix4().copy(rig.mesh.matrixWorld).invert(),point=new T.Vector3(),c=Math.cos(yaw),s=Math.sin(yaw);
 const gap=(v:T.Vector3)=>root.y+v.y-height(root.x+v.x*c+v.z*s,root.z-v.x*s+v.z*c)-.006;
 const clearances=[Infinity,Infinity,Infinity,Infinity,Infinity];
 const skin=rig.mesh.geometry.getAttribute('skinIndex'),weights=rig.mesh.geometry.getAttribute('skinWeight');
 for(const part of parts){
  const relative=new T.Matrix4().multiplyMatrices(inverse,part.mesh.matrixWorld);
  let group=rig.hands.findIndex(h=>part.mesh===h||part.mesh.parent===h)+1;
  if(part.mesh!==rig.mesh&&group===0)continue;
  for(const id of part.ids){
   if(part.mesh===rig.mesh){
    let dominant=0;for(let j=1;j<4;j++)if(weights.getComponent(id,j)>weights.getComponent(id,dominant))dominant=j;
    const bone=skin.getComponent(id,dominant);
    group=[0,1,4,7,8].includes(bone)?0:bone===14?3:bone===15?4:-1;
    if(group<0)continue;
   }
   part.mesh.getVertexPosition(id,point);point.applyMatrix4(relative);clearances[group]=Math.min(clearances[group],gap(point));
  }
 }
 const drop=Math.max(0,clearances[0])*weight,old=rig.bones.map(b=>b.position.clone());
 // Move the trunk as one piece. Solve limbs to their own support heights instead of stretching them.
 for(const i of [0,7,8])rig.bones[i].position.y-=drop;
 for(const [upper,lower,end,group] of [[1,2,3,1],[4,5,6,2],[9,10,14,3],[11,12,15,4]]){
  const origin=old[upper].clone();origin.y-=drop;
  const target=old[end].clone();target.y-=Math.max(0,clearances[group])*weight;
  supportLimb(rig,upper,lower,end,target,origin);
 }
 rig.mesh.updateMatrixWorld(true);
 // Released equipment rests on the ground independently of the body.
 for(const equipment of [rig.sword,rig.shield]){
  let lowest=Infinity;
  for(const part of parts){let ancestor:T.Object3D|null=part.mesh;while(ancestor&&ancestor!==equipment)ancestor=ancestor.parent;if(!ancestor)continue;
   const relative=new T.Matrix4().multiplyMatrices(inverse,part.mesh.matrixWorld);
   for(const id of part.ids){part.mesh.getVertexPosition(id,point);point.applyMatrix4(relative);lowest=Math.min(lowest,gap(point));}
  }
  if(Number.isFinite(lowest))equipment.position.y-=lowest*weight;
 }
 rig.mesh.updateMatrixWorld(true);
}
