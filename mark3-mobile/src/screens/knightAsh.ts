import * as T from 'three';
import type {AuthoredRig} from './authoredKnightMotion';
import {ASH_DURATION} from './authoredKnightMotion';

// 같은 공간 함수를 메시의 소멸 경계와 입자 방출 시각에 사용한다.
export function ashField(x:number,y:number,z:number){return T.MathUtils.clamp(.5+.24*z+.16*x+.13*Math.sin(12*x+5*y)*Math.sin(11*z-6*y)+.07*Math.sin(31*x+17*z+9*y),.03,.97);}
const fieldGLSL=`float ashField(vec3 p){return clamp(.5+.24*p.z+.16*p.x+.13*sin(12.*p.x+5.*p.y)*sin(11.*p.z-6.*p.y)+.07*sin(31.*p.x+17.*p.z+9.*p.y),.03,.97);}`;
/** 재질·그림자에 같은 절단면을 적용하고 실제 변형된 표면에서 재를 방출한다. */
export function buildKnightAsh(rig:AuthoredRig,count=1800){
 const uniforms={ashProgress:{value:0},ashInverse:{value:new T.Matrix4()}},owned:T.Material[]=[],originals=new Map<T.Mesh,{material:T.Material|T.Material[];depth:T.Material|undefined;distance:T.Material|undefined}>();
 const meshes:T.Mesh[]=[];
 rig.mesh.traverse(o=>{if((o as T.Mesh).isMesh)meshes.push(o as T.Mesh);});
 const patch=(m:T.Material,color:boolean)=>{
  m.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,uniforms);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 ashInverse; varying vec3 vAshPosition;').replace('#include <project_vertex>','#include <project_vertex>\nvAshPosition=(ashInverse*modelMatrix*vec4(transformed,1.)).xyz;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float ashProgress; varying vec3 vAshPosition;\n'+fieldGLSL).replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat ashEdge=ashField(vAshPosition)-ashProgress; if(ashProgress>0. && ashEdge<0.) discard;');
   if(color)shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif(ashProgress>0.) diffuseColor.rgb=mix(vec3(.105,.09,.075),diffuseColor.rgb,smoothstep(0.,.07,ashEdge));');
  };
  m.customProgramCacheKey=()=>`knight-ash-v1-${color}`;owned.push(m);return m;
 };
 const clones=new Map<T.Material,T.Material>();
 for(const mesh of meshes){
  originals.set(mesh,{material:mesh.material,depth:mesh.customDepthMaterial,distance:mesh.customDistanceMaterial});
  const clone=(m:T.Material)=>{if(!clones.has(m))clones.set(m,patch(m.clone(),true));return clones.get(m)!;};
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);
  mesh.customDepthMaterial=patch(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide}),false);
  mesh.customDistanceMaterial=patch(new T.MeshDistanceMaterial({side:T.DoubleSide}),false);
 }
 // 표면 넓이에 비례해 손과 무기에도 고르게 입자를 배치한다.
 const triangles:{mesh:T.Mesh;ids:number[];area:number}[]=[],a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();let area=0;
 rig.mesh.updateMatrixWorld(true);const inverse=new T.Matrix4().copy(rig.mesh.matrixWorld).invert();
 for(const mesh of meshes){
  const g=mesh.geometry,p=g.getAttribute('position'),index=g.getIndex(),matrix=new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
  for(let i=0;i<(index?.count??p.count);i+=3){
   const ids=[0,1,2].map(n=>index?index.getX(i+n):i+n);
   a.fromBufferAttribute(p,ids[0]).applyMatrix4(matrix);b.fromBufferAttribute(p,ids[1]).applyMatrix4(matrix);c.fromBufferAttribute(p,ids[2]).applyMatrix4(matrix);
   const size=b.sub(a).cross(c.sub(a)).length()*.5;if(size<1e-10)continue;
   area+=size;triangles.push({mesh,ids,area});
  }
 }
 const rand=(n:number)=>{const v=Math.sin(n*127.1+19.7)*43758.5453;return v-Math.floor(v);};
 const samples=Array.from({length:count},(_,i)=>{
  const pick=(i+.5)/count*area;let low=0,high=triangles.length-1;while(low<high){const mid=(low+high)>>1;if(triangles[mid].area<pick)low=mid+1;else high=mid;}
  const u=Math.sqrt(rand(i*3+1)),v=rand(i*3+2);return {...triangles[low],weights:[1-u,u*(1-v),u*v]};
 });
 const positions=new Float32Array(count*3),birth=new Float32Array(count),seed=new Float32Array(count);
 seed.forEach((_,i)=>seed[i]=rand(i*7+3));
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));geometry.setAttribute('aBirth',new T.BufferAttribute(birth,1));geometry.setAttribute('aSeed',new T.BufferAttribute(seed,1));
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0}},vertexShader:`
  attribute float aBirth; attribute float aSeed; uniform float uTime; varying float vAlpha; varying float vSeed;
  void main(){float age=uTime-aBirth; float life=1.35+aSeed*.7; float t=max(0.,age); vec3 p=position;
   p.x+=t*(.3+aSeed*.42)+sin(t*3.+aSeed*31.)*t*.065;
   p.y+=t*(.18+aSeed*.24)-t*t*.035;
   p.z+=t*.12+sin(t*2.3+aSeed*23.)*t*.10;
   vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
   gl_PointSize=clamp((4.+aSeed*9.)/max(.2,-mv.z),1.,9.);
   vAlpha=age<0.?0.:(1.-smoothstep(life*.35,life,age))*.82;vSeed=aSeed;
  }`,fragmentShader:`varying float vAlpha;varying float vSeed;
  void main(){vec2 p=gl_PointCoord-.5;float d=length(p);if(d>.5||vAlpha<.005)discard;
   vec3 color=mix(vec3(.045,.037,.028),vec3(.25,.205,.155),vSeed);
   gl_FragColor=vec4(color,vAlpha*(1.-smoothstep(.23,.5,d)));
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});
 const points=new T.Points(geometry,material);points.frustumCulled=false;points.visible=false;rig.mesh.add(points);let captured=false;
 const capture=()=>{
  rig.mesh.updateMatrixWorld(true);rig.mesh.skeleton.update();inverse.copy(rig.mesh.matrixWorld).invert();
  const matrices=new Map(meshes.map(m=>[m,new T.Matrix4().multiplyMatrices(inverse,m.matrixWorld)])),p=new T.Vector3(),sum=new T.Vector3();
  samples.forEach((s,i)=>{sum.set(0,0,0);s.ids.forEach((id,k)=>{
   p.fromBufferAttribute(s.mesh.geometry.getAttribute('position'),id);
   if((s.mesh as T.SkinnedMesh).isSkinnedMesh)(s.mesh as T.SkinnedMesh).applyBoneTransform(id,p);
   sum.addScaledVector(p.applyMatrix4(matrices.get(s.mesh)!),s.weights[k]);
  });sum.toArray(positions,i*3);birth[i]=ashField(sum.x,sum.y,sum.z)*ASH_DURATION;});
  geometry.getAttribute('position').needsUpdate=true;geometry.getAttribute('aBirth').needsUpdate=true;captured=true;
 };
 return {points,update:(progress:number,elapsed:number)=>{
  uniforms.ashProgress.value=progress;uniforms.ashInverse.value.copy(rig.mesh.matrixWorld).invert();
  if(progress<=0){captured=false;points.visible=false;return;}
  if(!captured)capture();material.uniforms.uTime.value=elapsed;points.visible=elapsed<ASH_DURATION+2.1;
 },dispose:()=>{points.removeFromParent();geometry.dispose();material.dispose();owned.forEach(m=>m.dispose());originals.forEach((o,m)=>{m.material=o.material;m.customDepthMaterial=o.depth;m.customDistanceMaterial=o.distance;});}};
}
