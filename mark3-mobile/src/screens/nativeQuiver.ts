import * as T from 'three';

/** A physical back quiver follows the chest on every native bow action. */
export function createNativeQuiver(root:T.Object3D){
 const mount=new T.Group(),caseGroup=new T.Group();mount.name='archer-quiver';mount.add(caseGroup);root.add(mount);
 const leather=new T.MeshStandardMaterial({color:'#583820',roughness:.9,side:T.DoubleSide}),rim=new T.MeshStandardMaterial({color:'#af8350',roughness:.7}),wood=new T.MeshStandardMaterial({color:'#b18a51',roughness:.8}),feather=new T.MeshStandardMaterial({color:'#e0d5b7',roughness:1,side:T.DoubleSide});
 const body=new T.Mesh(new T.CylinderGeometry(.095,.07,.56,14,1,true),leather);caseGroup.add(body);
 const bottom=new T.Mesh(new T.CircleGeometry(.07,14),leather);bottom.rotation.x=Math.PI/2;bottom.position.y=-.28;caseGroup.add(bottom);
 for(const y of [-.25,.24,.28]){const band=new T.Mesh(new T.TorusGeometry(y<0?.074:.095,.009,5,18),rim);band.rotation.x=Math.PI/2;band.position.y=y;caseGroup.add(band);}
 for(let i=0;i<7;i++){
  const a=i*2.4,x=Math.cos(a)*.055,z=Math.sin(a)*.055,top=.52+(i%3)*.024;
  const shaft=new T.Mesh(new T.CylinderGeometry(.004,.004,.64,6),wood);shaft.position.set(x,top-.32,z);caseGroup.add(shaft);
  for(let j=0;j<3;j++){const vane=new T.Mesh(new T.PlaneGeometry(.028,.105),feather);vane.position.set(x,top-.075,z);vane.rotation.y=j*Math.PI*2/3;caseGroup.add(vane);}
 }
 caseGroup.position.set(.18,-.14,-.19);caseGroup.rotation.z=-.24;
 // Visible shoulder strap lies outside the torso, attached to the same frame.
 const strapCurve=new T.CatmullRomCurve3([new T.Vector3(.23,-.28,-.20),new T.Vector3(-.14,.22,-.16),new T.Vector3(-.15,.27,.04),new T.Vector3(.24,-.28,.24)]);
 const strap=new T.Mesh(new T.TubeGeometry(strapCurve,20,.016,6,false),leather);mount.add(strap);
 mount.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});
 const spine=root.getObjectByName('mixamorigSpine2')!,neck=root.getObjectByName('mixamorigNeck')!;
 function update(){
  root.updateMatrixWorld(true);
  const origin=spine.getWorldPosition(new T.Vector3()),up=neck.getWorldPosition(new T.Vector3()).sub(origin).normalize();
  const front=new T.Vector3(0,0,1).applyQuaternion(root.getWorldQuaternion(new T.Quaternion()));front.addScaledVector(up,-front.dot(up)).normalize();
  const side=new T.Vector3().crossVectors(up,front).normalize();front.crossVectors(side,up).normalize();
  const matrix=new T.Matrix4().makeBasis(side,up,front).setPosition(origin).premultiply(root.matrixWorld.clone().invert());matrix.decompose(mount.position,mount.quaternion,mount.scale);
  mount.updateMatrixWorld(true);
 }
 return {mount,update,dispose(){root.remove(mount);const gs=new Set<T.BufferGeometry>(),ms=new Set<T.Material>();mount.traverse(o=>{if(o instanceof T.Mesh){gs.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>ms.add(m));}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}};
}
