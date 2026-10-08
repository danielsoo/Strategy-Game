import * as T from 'three';
import type {GLTF} from 'three/examples/jsm/loaders/GLTFLoader';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils';
import {createDuelActor,DuelFighter} from './nativeDuel';
import type {NativeClip} from './nativeCombatModels';

export const FORMATION_FRAMES=16;
/** Sample the battle actor once, including its captured grip and equipment.
 * Shared vertex textures then animate all campaign instances on the GPU.
 * No spatial arm bending, substitute body geometry or per-unit mixers. */
export function buildNativeFormation(asset:GLTF,fighter:DuelFighter){
 const actor=createDuelActor(asset,fighter);
 const ownedTextures:T.Texture[]=[];
 const walk:NativeClip=fighter.weapon==='bow'?'bowWalk':['axe','spear','halberd'].includes(fighter.weapon)?'twoWalk':fighter.model==='paladin'&&fighter.weapon==='sword'?'walk':'axeWalk';
 const meshes:T.Mesh[]=[],parts:T.BufferGeometry[]=[],materials:T.Material[]=[],samples:number[][]=[];
 actor.visual.traverseVisible(o=>{if(o instanceof T.Mesh)meshes.push(o);});
 for(const mesh of meshes){
  const sourceGeometry=mesh.geometry,g=new T.BufferGeometry(),unique:number[]=[],remap:number[]=[],keys=new Map<string,number>();
  // The exported meshes repeat triangle corners. Weld only vertices with the
  // same UV, normal AND skin weights so animated seams remain identical.
  const attributes=Object.values(sourceGeometry.attributes);
  for(let i=0;i<sourceGeometry.attributes.position.count;i++){
   const key=attributes.map(a=>Array.from(a.array.slice(i*a.itemSize,(i+1)*a.itemSize)).join(',')).join('/');
   let index=keys.get(key);if(index===undefined){index=unique.length;keys.set(key,index);unique.push(i);}remap.push(index);
  }
  for(const name of ['position','normal','uv']){
   const a=sourceGeometry.getAttribute(name);if(!a)continue;
   const data=new Float32Array(unique.length*a.itemSize);
   unique.forEach((source,i)=>{for(let axis=0;axis<a.itemSize;axis++)data[i*a.itemSize+axis]=a.array[source*a.itemSize+axis];});
   g.setAttribute(name,new T.BufferAttribute(data,a.itemSize));
  }
  g.setIndex(sourceGeometry.index?Array.from(sourceGeometry.index.array,i=>remap[i]):remap);samples.push(unique);
  if(!g.getAttribute('uv'))g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));
  // Preserve material groups (body, armour, cloak and weapon textures).
  const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const groups=sourceGeometry.groups.length?sourceGeometry.groups:[{start:0,count:g.index!.count,materialIndex:0}];
  g.clearGroups();for(const group of groups)g.addGroup(group.start,group.count,materials.length+(group.materialIndex??0));
  let partOfProp:T.Object3D|null=mesh;while(partOfProp&&partOfProp!==actor.equipment.prop)partOfProp=partOfProp.parent;
  source.forEach(m=>{const copy=m.clone() as T.MeshStandardMaterial;
   // Generated weapon maps belong to the temporary actor. Keep our own copy;
   // large character textures stay shared with the loaded battle asset.
   if(partOfProp&&copy.map){copy.map=copy.map.clone();copy.map.needsUpdate=true;ownedTextures.push(copy.map);}
   materials.push(copy);
  });parts.push(g);
 }
 const geometry=mergeGeometries(parts,false);let indexOffset=0;
 parts.forEach(g=>{for(const group of g.groups)geometry.addGroup(indexOffset+group.start,group.count,group.materialIndex);indexOffset+=g.index!.count;g.dispose();});
 const count=geometry.attributes.position.count,width=1024,height=Math.ceil(count*FORMATION_FRAMES*2/width);
 const positions=new Uint16Array(width*height*4),normals=new Uint16Array(width*height*4),v=new T.Vector3();
 const bounds=new T.Box3(),idleDuration=actor.duration(actor.idle),walkDuration=actor.duration(walk);
 const sampled=geometry.attributes.position as T.BufferAttribute;
 for(let mode=0;mode<2;mode++)for(let frame=0;frame<FORMATION_FRAMES;frame++){
  const u=frame/FORMATION_FRAMES;
  actor.evaluate({clip:actor.idle,time:mode?idleDuration*.25:u*idleDuration},undefined,1,undefined,mode?{clip:walk,time:u*walkDuration,weight:1,direction:0}:undefined);
  let vertex=0;
  for(let part=0;part<meshes.length;part++){
   const mesh=meshes[part];
   if(mesh instanceof T.SkinnedMesh)mesh.skeleton.update();
   for(const i of samples[part]){
    mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);
    sampled.setXYZ(vertex,v.x,v.y,v.z);bounds.expandByPoint(v);vertex++;
   }
  }
  geometry.computeVertexNormals();const n=geometry.attributes.normal;
  for(let i=0;i<count;i++){
   const at=((mode*FORMATION_FRAMES+frame)*count+i)*4;
   for(let axis=0;axis<3;axis++){
    positions[at+axis]=T.DataUtils.toHalfFloat(sampled.array[i*3+axis]);
    normals[at+axis]=T.DataUtils.toHalfFloat(n.array[i*3+axis]);
   }
  }
 }
 const texture=(data:Uint16Array<ArrayBuffer>)=>{const t=new T.DataTexture(data,width,height,T.RGBAFormat,T.HalfFloatType);t.minFilter=t.magFilter=T.NearestFilter;t.needsUpdate=true;return t;};
 const positionTexture=texture(positions),normalTexture=texture(normals);
 geometry.setAttribute('formationVertex',new T.Float32BufferAttribute(Array.from({length:count},(_,i)=>i),1));
 geometry.boundingBox=bounds;geometry.boundingSphere=bounds.getBoundingSphere(new T.Sphere());
 const shader=`
 attribute float formationVertex;
 attribute vec3 formationMotion;
 uniform sampler2D formationPositions;
 uniform sampler2D formationNormals;
 vec3 formationRead(sampler2D atlas,float frame){
  float at=frame*${count.toFixed(1)}+formationVertex;
  return texture2D(atlas,vec2((mod(at,${width.toFixed(1)})+.5)/${width.toFixed(1)},(floor(at/${width.toFixed(1)})+.5)/${height.toFixed(1)})).xyz;
 }
 vec3 formationFrame(sampler2D atlas,float phase,float offset){
  float a=floor(phase),b=mod(a+1.,${FORMATION_FRAMES.toFixed(1)});
  return mix(formationRead(atlas,a+offset),formationRead(atlas,b+offset),fract(phase));
 }
 vec3 formationPose(sampler2D atlas){
  return mix(formationFrame(atlas,formationMotion.y,0.),formationFrame(atlas,formationMotion.z,${FORMATION_FRAMES.toFixed(1)}),formationMotion.x);
 }`;
 const patch=(m:T.Material)=>{
  m.onBeforeCompile=s=>{
   s.uniforms.formationPositions={value:positionTexture};s.uniforms.formationNormals={value:normalTexture};
   s.vertexShader=shader+'\n'+s.vertexShader;
   s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','vec3 transformed=formationPose(formationPositions);');
   s.vertexShader=s.vertexShader.replace('#include <beginnormal_vertex>','vec3 objectNormal=normalize(formationPose(formationNormals));');
  };
  m.customProgramCacheKey=()=>`native-formation-${count}-${height}`;
 };
 materials.forEach(patch);const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});patch(depth);
 actor.dispose();
 return {geometry,materials,depth,idleDuration,walkDuration,positionTexture,normalTexture,
  dispose(){geometry.dispose();materials.forEach(m=>m.dispose());ownedTextures.forEach(t=>t.dispose());depth.dispose();positionTexture.dispose();normalTexture.dispose();}};
}
