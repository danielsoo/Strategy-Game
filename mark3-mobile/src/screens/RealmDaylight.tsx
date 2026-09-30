import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useLoader,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader';

/** 촬영된 하늘의 반사를 사용하고, 그림자 해상도를 현재 카메라 주변에 집중한다. */
export default function RealmDaylight(){
  const {scene,gl,size}=useThree(),hdr=useLoader(RGBELoader,'/realm/light/daylight.hdr');
  const sun=useRef<THREE.DirectionalLight>(null),target=useMemo(()=>new THREE.Object3D(),[]);
  const env=useMemo(()=>{const generator=new THREE.PMREMGenerator(gl);const map=generator.fromEquirectangular(hdr);generator.dispose();return map;},[gl,hdr]);
  useEffect(()=>{const old=scene.environment,intensity=scene.environmentIntensity;scene.environment=env.texture;scene.environmentIntensity=.7;return()=>{scene.environment=old;scene.environmentIntensity=intensity;env.dispose();};},[scene,env]);
  const direction=useMemo(()=>new THREE.Vector3(),[]),sunOffset=useMemo(()=>new THREE.Vector3(-12,22,15),[]);
  useFrame(({camera})=>{if(!sun.current)return;camera.getWorldDirection(direction);
    const distance=Math.max(0,(camera.position.y-.3)/Math.max(.1,-direction.y));
    target.position.copy(camera.position).addScaledVector(direction,distance);target.position.y=.25;target.updateMatrixWorld();
    const light=sun.current;light.position.copy(target.position).add(sunOffset);
    const reach=Math.max(1.1,Math.min(28,camera.position.y*.9));const shadow=light.shadow.camera;
    shadow.left=-reach;shadow.right=reach;shadow.top=reach;shadow.bottom=-reach;shadow.updateProjectionMatrix();
    light.shadow.normalBias=Math.min(.006,reach*.001);
  });
  return <><primitive object={target}/><hemisphereLight args={['#ccd9e4','#52503e',.6]}/><directionalLight ref={sun} target={target} color="#fff3df" intensity={2.4} castShadow shadow-mapSize={size.width<700?[2048,2048]:[4096,4096]} shadow-camera-near={.1} shadow-camera-far={90} shadow-bias={-.00004} shadow-radius={2}/></>;
}
