import * as T from 'three';
import {buildAuthoredKnight} from './authoredKnightMotion';
import type {FighterKind} from './battleReplay';
import {WeaponKind,WEAPONS} from './battleWeapons';

/** Shared anatomical rig, separate equipment, silhouettes and material sets. */
export function buildFighter(scene:T.Group,kind:FighterKind,color='#456eaa',weapon:WeaponKind='sword'){
 const rig=buildAuthoredKnight(scene,weapon),extras:T.Mesh[]=[],materials:T.MeshStandardMaterial[]=[],ownedTextures:T.Texture[]=[];
 const hasShield=kind==='knight'&&!WEAPONS[weapon].twoHanded;
 if(!hasShield){rig.shield.visible=false;rig.shield.removeFromParent();}
 const material=(hex:string,metalness=0,roughness=.92)=>{const m=new T.MeshStandardMaterial({color:hex,metalness,roughness});materials.push(m);return m;};
 const cloth=material(kind==='bandit'?'#4b4435':'#71604c'),leather=material('#33251e',0,.82),steel=material('#686c68',.55,.57),skin=material(kind==='bandit'?'#96715a':'#ba8c6b',0,.85),hair=material('#292018'),eye=material('#171716');
 const add=(g:T.BufferGeometry,m:T.Material,bone:number,p:[number,number,number],scale:[number,number,number]=[1,1,1])=>{const mesh=new T.Mesh(g,m);mesh.position.fromArray(p);mesh.scale.fromArray(scale);mesh.castShadow=true;mesh.receiveShadow=true;rig.bones[bone].add(mesh);extras.push(mesh);return mesh;};
 const team=material(color,0,.85);
 // A shoulder tie gives allegiance without painting the entire body blue or red.
 add(new T.CylinderGeometry(.101,.10,.045,14,1,true),team,1,[0,-.07,0]).rotation.z=-.58;
 if(kind!=='knight'){
  rig.shield.visible=false;rig.shield.removeFromParent();
  const g=rig.mesh.geometry,p=g.getAttribute('position'),skinIds=g.getAttribute('skinIndex'),weights=g.getAttribute('skinWeight'),index=g.getIndex()!;
  const buckets:number[][]=[[],[],[]];
  const dominant=(i:number)=>{let k=0;for(let j=1;j<4;j++)if(weights.getComponent(i,j)>weights.getComponent(i,k))k=j;return skinIds.getComponent(i,k);};
  for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];if(ids.some(j=>dominant(j)===7))continue;
   const y=ids.reduce((n,j)=>n+p.getY(j),0)/3,x=ids.reduce((n,j)=>n+Math.abs(p.getX(j)),0)/3;
   const bin=y<.25||y>.80&&y<.91?1:kind==='mercenary'&&x>.39&&y>.91&&y<1.2?2:0;buckets[bin].push(...ids);
  }
  // Reduce the projecting plate shoulders, breastplate and greaves into fitted layers.
  for(let i=0;i<p.count;i++){
   let x=p.getX(i),y=p.getY(i),z=p.getZ(i),ax=Math.abs(x);
   if(ax>.22&&y>1.16){x=Math.sign(x)*(.22+(ax-.22)*.70);z*=.72;}
   if(ax<.25&&y>.91&&y<1.4)z*=kind==='bandit'?.70:.83;
   if(y<.72&&y>.25){const center=Math.sign(x)*.14;x=center+(x-center)*.86;z*=.83;}
   p.setXYZ(i,x,y,z);
  }
  g.clearGroups();let offset=0;for(let i=0;i<buckets.length;i++){g.addGroup(offset,buckets[i].length,i);offset+=buckets[i].length;}g.setIndex(buckets.flat());g.computeVertexNormals();
  // Woven cloth microtexture, generated deterministically; no metallic coat or heraldic breastplate.
  const pixels=new Uint8Array(128*128*4);for(let y=0;y<128;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4,n=190+((x*17+y*31)%23)+(x%4===0||y%4===0?-28:0);pixels.set([n,n,n,255],i);}
  const weave=new T.DataTexture(pixels,128,128);weave.wrapS=weave.wrapT=T.RepeatWrapping;weave.repeat.set(22,22);weave.needsUpdate=true;ownedTextures.push(weave);cloth.map=weave;cloth.bumpMap=weave;cloth.bumpScale=.003;
  (rig.mesh as T.SkinnedMesh<T.BufferGeometry,T.Material|T.Material[]>).material=[cloth,leather,steel];
  for(const hand of rig.hands){hand.material=leather;for(const cuff of hand.children)(cuff as T.Mesh).material=leather;}
  // Open face, ears, nose, brow and beard: no closed knight visor on poorly equipped troops.
  add(new T.SphereGeometry(1,24,18),skin,7,[0,.075,0],[.097,.137,.094]);
  for(const s of [-1,1]){
   add(new T.SphereGeometry(1,12,8),skin,7,[s*.098,.067,0],[.019,.036,.022]);
   add(new T.SphereGeometry(1,12,8),eye,7,[s*.035,.112,.084],[.016,.007,.006]);
   add(new T.SphereGeometry(1,12,8),hair,7,[s*.037,.129,.081],[.026,.008,.009]);
  }
  add(new T.SphereGeometry(1,14,10),skin,7,[0,.077,.089],[.017,.037,.025]);
  add(new T.SphereGeometry(1,18,12),hair,7,[0,.010,.038],[.076,.053,.066]);
  if(kind==='mercenary'){
   add(new T.SphereGeometry(1,24,14,0,Math.PI*2,0,Math.PI*.52),steel,7,[0,.113,-.009],[.119,.130,.112]);
   add(new T.TorusGeometry(.118,.009,6,32),steel,7,[0,.108,-.009]).rotation.x=Math.PI/2;
   add(new T.BoxGeometry(.055,.42,.012),leather,0,[.02,.25,.12]).rotation.z=-.45;
   for(const s of [-1,1])add(new T.BoxGeometry(.03,.035,.009),steel,0,[s*.074,.28,.143]);
  }else{
   const hood=new T.SphereGeometry(1,28,20),hp=hood.getAttribute('position'),hi=hood.getIndex()!,keep:number[]=[];
   for(let i=0;i<hi.count;i+=3){const ids=[hi.getX(i),hi.getX(i+1),hi.getX(i+2)];const z=ids.reduce((n,j)=>n+hp.getZ(j),0)/3,y=ids.reduce((n,j)=>n+hp.getY(j),0)/3;if(z>.30&&y<.62&&y>-.65)continue;keep.push(...ids);}hood.setIndex(keep);
   cloth.side=T.DoubleSide;add(hood,cloth,7,[0,.095,-.025],[.135,.171,.134]);
   add(new T.TorusGeometry(.10,.036,8,24),cloth,7,[0,-.025,0],[1,1,.8]).rotation.x=Math.PI/2;
   add(new T.BoxGeometry(.23,.07,.012),leather,7,[0,.014,.080]);
  }
 }
 return {...rig,kind,weapon,hasShield,dispose:()=>{extras.forEach(m=>m.geometry.dispose());materials.forEach(m=>m.dispose());ownedTextures.forEach(t=>t.dispose());rig.dispose();}};
}
