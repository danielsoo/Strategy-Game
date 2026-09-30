import * as THREE from 'three';
export type ArmyAction='idle'|'walk';
export const ACTION_CODE:Record<ArmyAction,number>={idle:0,walk:1};
/** 원본 정적 메시의 관절 영역을 변형한다. 인스턴스와 그림자가 같은 동작을 사용한다. */
const rig=`
uniform float realmTime;
attribute vec2 realmMotion;
attribute float realmEquipment;
vec3 turnX(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x,c*p.y-s*p.z,s*p.y+c*p.z);}
vec3 turnZ(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
vec3 realmPose(vec3 p){
 p.x+=.079;
 float mode=realmMotion.x,t=realmTime+realmMotion.y;
 float walking=1.-step(.4,abs(mode-1.));
 float stepCycle=sin(t*7.5);
 float side=realmEquipment>1.5?1.:realmEquipment>.5?-1.:p.x<0.?-1.:1.;
 // 검과 방패까지 같은 어깨 회전을 적용해 손에서 분리되지 않게 한다.
 float arm=max(step(.5,realmEquipment),smoothstep(.20,.34,abs(p.x))*smoothstep(.76,.88,p.y));
 float legWeight=(1.-smoothstep(.82,.96,p.y))*(1.-arm);
 vec3 shoulder=vec3(side*.23,1.34,0.);
 float rest=-side*REALM_REST;
 float armZ=rest+walking*side*stepCycle*.13;
 float armX=walking*side*stepCycle*.48;
 vec3 posed=turnX(turnZ(p-shoulder,armZ),armX)+shoulder;
 p=mix(p,posed,arm);
 float leg=legWeight;
 vec3 hip=vec3(side*.13,.89,0.);
 float gait=walking*side*stepCycle*.62;
 vec3 stride=turnX(p-hip,gait)+hip;
 float knee=(1.-smoothstep(.37,.55,p.y));
 vec3 kneePivot=turnX(vec3(0.,-.44,0.),gait)+hip;
 stride=mix(stride,turnX(stride-kneePivot,-max(0.,side*stepCycle)*walking*.65)+kneePivot,knee);
 p=mix(p,stride,leg);
 p.y-=walking*.89*(1.-cos(stepCycle*.62));
 p.y+=sin(t*1.7)*.007*(1.-walking);
 p.x-=.079;
 return p;
}
`;
export function animateArmyMaterial(material:THREE.Material,time:{value:number},rest=.65){
 material.onBeforeCompile=shader=>{
  shader.uniforms.realmTime=time;
  shader.vertexShader=rig.replace('REALM_REST',rest.toFixed(3))+'\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed=realmPose(position);');
  shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=normalize(realmPose(position+normal*.002)-realmPose(position));');
 };
 material.customProgramCacheKey=()=>`realm-march-v2-${rest}`;
}

/** UV 경계의 중복 정점을 합쳐 방패 전체를 같은 관절에 묶는다. */
export function tagKnightEquipment(geometry:THREE.BufferGeometry,sword:boolean){
 const p=geometry.getAttribute('position'),parent=Array.from({length:p.count},(_,i)=>i),weld=new Map<string,number>();
 const root=(a:number):number=>{while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;};
 const join=(a:number,b:number)=>{parent[root(a)]=root(b);};
 for(let i=0;i<p.count;i++){const key=`${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;const old=weld.get(key);if(old!==undefined)join(i,old);else weld.set(key,i);}
 const idx=geometry.getIndex();for(let i=0;i<(idx?.count??p.count);i+=3){const a=idx?idx.getX(i):i,b=idx?idx.getX(i+1):i+1,c=idx?idx.getX(i+2):i+2;join(a,b);join(a,c);}
 const groups=new Map<number,{min:number;max:number}>();for(let i=0;i<p.count;i++){const r=root(i),g=groups.get(r)??{min:Infinity,max:-Infinity};g.min=Math.min(g.min,p.getX(i));g.max=Math.max(g.max,p.getX(i));groups.set(r,g);}
 const weights=new Float32Array(p.count);for(let i=0;i<p.count;i++){const g=groups.get(root(i))!;weights[i]=sword?1:g.min>20&&g.max-g.min>40?2:0;}
 geometry.setAttribute('realmEquipment',new THREE.BufferAttribute(weights,1));
}
