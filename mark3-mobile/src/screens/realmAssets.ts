import * as THREE from 'three';
import {useLoader,useThree} from '@react-three/fiber';

export function useRealmAssetRoot(){const small=useThree(s=>s.size.width<700||s.size.height<480);return small?'/realm/mobile/':'/realm/';}

export function useRealmMaterial(asset:string,repeat=1) {
  const root=useRealmAssetRoot();
  const maps=useLoader(THREE.TextureLoader,['diff','nor_gl','rough'].map(c=>`${root}${asset}/${c}.jpg`));
  maps.forEach((map,i)=>{map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=8;map.colorSpace=i===0?THREE.SRGBColorSpace:THREE.NoColorSpace;map.repeat.set(repeat,repeat);});
  return {map:maps[0],normalMap:maps[1],roughnessMap:maps[2]};
}
