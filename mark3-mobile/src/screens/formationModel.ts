import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils';
import {buildFighter} from './fighterAppearance';
import type {FighterKind} from './battleReplay';
import {fighterPose} from './battleMotion';
import {poseAuthoredKnight} from './authoredKnightMotion';
/** Bake equipment variants once for instanced campaign formations. */
export function buildFormationModel(scene:T.Group,kind:FighterKind){
 const rig=buildFighter(scene,kind),parts:T.BufferGeometry[]=[],materials:T.Material[]=[];
 poseAuthoredKnight(rig,fighterPose({id:0,side:0,kind,low:0,high:1,deathAt:Infinity},0,null,false));rig.mesh.updateMatrixWorld(true);rig.mesh.skeleton.update();
 rig.mesh.traverse(o=>{if(!(o as T.Mesh).isMesh)return;const mesh=o as T.Mesh,g=mesh.geometry,index=g.getIndex();
  const groups=g.groups.length?g.groups:[{start:0,count:index?.count??g.getAttribute('position').count,materialIndex:0}];
  for(const group of groups){
   const copy=g.clone();copy.setIndex(index?Array.from(index.array).slice(group.start,group.start+group.count):Array.from({length:group.count},(_,i)=>i+group.start));copy.clearGroups();
   if((mesh as T.SkinnedMesh).isSkinnedMesh){const p=copy.getAttribute('position'),v=new T.Vector3();for(let i=0;i<p.count;i++){mesh.getVertexPosition(i,v);p.setXYZ(i,v.x,v.y,v.z);}copy.computeVertexNormals();}
   copy.applyMatrix4(mesh.matrixWorld);
   for(const name of Object.keys(copy.attributes))if(!['position','normal','uv'].includes(name))copy.deleteAttribute(name);
   const count=copy.getAttribute('position').count;if(!copy.getAttribute('uv'))copy.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(count*2),2));
   const equipment=new Float32Array(count);equipment.fill(mesh===rig.shield?2:mesh.parent===rig.sword?1:0);copy.setAttribute('realmEquipment',new T.Float32BufferAttribute(equipment,1));
   parts.push(copy);const source=Array.isArray(mesh.material)?mesh.material[group.materialIndex??0]:mesh.material;const m=source.clone() as T.MeshStandardMaterial;
   if(m.map){m.map=m.map.clone();m.map.needsUpdate=true;}if(m.bumpMap){m.bumpMap=m.bumpMap.clone();m.bumpMap.needsUpdate=true;}materials.push(m);
  }
 });
 const geometry=mergeGeometries(parts,true);parts.forEach(p=>p.dispose());rig.dispose();
 return {geometry,materials};
}
