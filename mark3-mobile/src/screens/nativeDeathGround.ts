import * as T from 'three';

/** Ground only visible equipment/body; the loose cloak folds onto the floor. */
export function nativeDeathGround(root:T.Object3D){
 const bodies:T.SkinnedMesh[]=[];let cloak:T.SkinnedMesh|undefined;
 root.traverse(o=>{if(o instanceof T.SkinnedMesh){if(o.name==='arissaCloak_Geo')cloak=o;else bodies.push(o);}});
 const active={value:0};const owned:T.Material[]=[];
 const original=cloak?.material,originalDepth=cloak?.customDepthMaterial;
 if(cloak){
  const patch=(material:T.Material)=>{material.onBeforeCompile=shader=>{
   shader.uniforms.realmGround=active;shader.vertexShader='uniform float realmGround;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <skinning_vertex>',`#include <skinning_vertex>
    vec3 floorRow=vec3(modelMatrix[0].y,modelMatrix[1].y,modelMatrix[2].y);
    float floorWorldY=(modelMatrix*vec4(transformed,1.0)).y;
    transformed+=floorRow*(max(0.0,0.012-floorWorldY)*realmGround/max(dot(floorRow,floorRow),0.000001));`);
  };material.customProgramCacheKey=()=> 'native-cloak-floor-v1';owned.push(material);return material;};
  cloak.material=Array.isArray(original)?original.map(m=>patch(m.clone())):patch((original as T.Material).clone());
  cloak.customDepthMaterial=patch(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking}));
 }
 return {update(dying:boolean){
  root.position.y=.025;active.value=dying?1:0;if(!dying)return;
  root.updateMatrixWorld(true);let min=Infinity;
  for(const body of bodies){if(!body.visible)continue;body.skeleton.update();body.computeBoundingBox();const box=body.boundingBox!.clone().applyMatrix4(body.matrixWorld);min=Math.min(min,box.min.y);}
  root.position.y+=Math.max(0,.008-min);root.updateMatrixWorld(true);
 },dispose(){if(cloak){cloak.material=original!;cloak.customDepthMaterial=originalDepth;}owned.forEach(m=>m.dispose());}};
}
