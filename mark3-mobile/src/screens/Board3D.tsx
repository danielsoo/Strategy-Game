import React, { Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { realm } from './realmTheme';
import CampaignLand, { TerrainRing } from './CampaignLand';
import RealmModels from './RealmModels';
import RealmArmy from './RealmArmy';
import type {BattleCue} from './armyTimeline';
import ArmyStandard from './ArmyStandard';
import RealmMinimap from './RealmMinimap';
import RealmDaylight from './RealmDaylight';
import RealmGrass from './RealmGrass';
import RealmLandscape from './RealmLandscape';
import RealmAtmosphere,{RenderStats} from './RealmAtmosphere';
import {useRealmMaterial} from './realmAssets';
import {terrainField} from './campaignTerrain';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Cell, GameState, relationOf } from '../engine';
import { buildMedievalScene, Ground, Mist, Piece, Shape, V3 } from './medievalScene';

interface Props {
  hud?: boolean;
  battles?: BattleCue[];
  state: GameState;
  player: number;
  watching: boolean;
  selected: string | null;
  movable: Set<string>;
  /** 물어본 길 — 출발 칸부터 목적지까지, 밟는 턴과 함께 */
  path?: Array<{ id: string; turn: number }>;
  /** 길잡이가 '여기를 누르세요' 하고 짚는 칸 */
  hint?: string | null;
  /** 스포트라이트 — 주면 이 칸들만 밝고 나머지는 어둡다 */
  lit?: string[] | null;
  onCellPress: (c: Cell) => void;
}
const NO_RAYCAST = () => {};
export const SHAPES: Shape[] = ['box', 'stone', 'tower', 'roof', 'metal', 'cone', 'trunk', 'rock', 'flag', 'shield', 'foliage','plaster','timber','body','limb','helmet','hipRoof'];

function AssetReady({onReady,onPending}:{onReady:()=>void;onPending:()=>void}){useLayoutEffect(()=>{onReady();return onPending;},[onReady,onPending]);return null;}
function StoneMaterial({asset}:{asset:string}){const maps=useRealmMaterial(asset,asset==='medieval_blocks_05'?4:asset==='grey_roof_tiles'?5:2);return <meshStandardMaterial {...maps} roughness={1} normalScale={new THREE.Vector2(.7,.7)}/>;}

function GableRoof(){
  const geometry=useMemo(()=>{
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute([-.7,-.5,-.7,.7,-.5,-.7,0,.5,-.7,-.7,-.5,.7,.7,-.5,.7,0,.5,.7],3));
    g.setIndex([0,2,1,3,4,5,0,3,5,0,5,2,1,2,5,1,5,4,0,1,4,0,4,3]);
    const flat=g.toNonIndexed(),p=flat.getAttribute('position'),uv:number[]=[];
    for(let i=0;i<p.count;i++)uv.push((p.getZ(i)+.7)/1.4,(p.getX(i)+.7)/1.4);
    flat.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));flat.computeVertexNormals();g.dispose();return flat;
  },[]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);return <primitive object={geometry} attach="geometry"/>;
}

// 여러 크기의 잎 무리를 하나의 인스턴스용 수관으로 합친다.
function TreeCrown() {
  const geometry=useMemo(()=>{
    const leaf=new THREE.IcosahedronGeometry(1,0), source=leaf.getAttribute('position');
    const vertices:number[]=[];
    const clusters=[[0,.3,0,.68],[-.48,0,.1,.52],[.43,.05,.22,.56],[.1,-.25,-.43,.53],[-.15,.65,-.1,.43],[.24,.4,-.3,.47],[0,-.36,.25,.44]];
    for(const [x,y,z,r] of clusters)for(let i=0;i<source.count;i++) {
      const jagged=1+.14*Math.sin(i*7.3+x*19);
      vertices.push(x+source.getX(i)*r*jagged,y+source.getY(i)*r,z+source.getZ(i)*r*jagged);
    }
    leaf.dispose();const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
  },[]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);return <primitive object={geometry} attach="geometry"/>;
}

function Geometry({ shape }: { shape: Shape | 'hex' }) {
  if (shape === 'hipRoof') return <coneGeometry args={[.71,1,4,1,false,Math.PI/4]}/>;
  if (shape === 'body') return <capsuleGeometry args={[.5,.4,4,8]}/>;
  if (shape === 'limb') return <cylinderGeometry args={[.5,.4,1,8]}/>;
  if (shape === 'helmet') return <sphereGeometry args={[1,10,8]}/>;
  if (shape === 'hex') return <cylinderGeometry args={[1, 1, 1, 6]} />;
  if (shape === 'cone') return <coneGeometry args={[1, 1, 9]} />;
  if (shape === 'roof') return <GableRoof/>;
  if (shape === 'foliage') return <TreeCrown/>;
  if (shape === 'tower') return <cylinderGeometry args={[1, 1.06, 1, 10]} />;
  if (shape === 'trunk') return <cylinderGeometry args={[1, 1, 1, 5]} />;
  if (shape === 'rock' || shape === 'shield') return <icosahedronGeometry args={[1, 0]} />;
  if (shape === 'flag') return <planeGeometry args={[1, 1, 8, 1]} />;
  return <boxGeometry args={[1, 1, 1]} />;
}

/** 수천 개의 지형 장식을 종류별로 묶어 그린다. */
export function Instances({ shape, pieces, onClick }: {
  shape: Shape | 'hex'; pieces: Piece[]; onClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const time = useMemo(() => ({ value: 0 }), []);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const obj = new THREE.Object3D(), color = new THREE.Color();
    pieces.forEach((piece, i) => {
      obj.position.set(...piece.position);
      obj.scale.set(...piece.scale);
      obj.rotation.set(...(piece.rotation ?? [0, 0, 0]));
      obj.updateMatrix();
      ref.current!.setMatrixAt(i, obj.matrix);
      ref.current!.setColorAt(i, color.set(piece.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [pieces]);
  useFrame(({ clock }) => { time.value = clock.elapsedTime; });
  if (!pieces.length) return null;
  return <instancedMesh key={pieces.length} ref={ref} args={[undefined, undefined, pieces.length]}
    castShadow={shape !== 'hex' && shape !== 'flag'} receiveShadow
    onClick={onClick} raycast={onClick ? undefined : NO_RAYCAST}>
    <Geometry shape={shape} />
    {['stone','roof','hipRoof','plaster','timber','tower'].includes(shape)?<StoneMaterial asset={shape==='roof'||shape==='hipRoof'?'grey_roof_tiles':shape==='plaster'?'rough_plaster_03':shape==='timber'?'medieval_wood':'medieval_blocks_05'}/>:<meshStandardMaterial roughness={shape === 'metal' ? 0.45 : 0.95} metalness={shape === 'metal' ? 0.55 : 0}
      side={shape === 'flag' ? THREE.DoubleSide : THREE.FrontSide}
      onBeforeCompile={shader => {
        if (shape === 'hex' || shape === 'stone' || shape === 'tower') {
          // 월드 좌표의 미세한 명암만 더한다. 텍스처 다운로드나 추가 draw call이 없다.
          shader.vertexShader='varying vec3 vStone;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStone=(instanceMatrix*vec4(position,1.0)).xyz;');
          shader.fragmentShader='varying vec3 vStone;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
            float grain=fract(sin(dot(floor(vStone*65.0),vec3(12.9898,78.233,45.164)))*43758.5453);
            float row=floor(vStone.y*15.0);
            float mortar=step(.89,fract(vStone.y*15.0))+step(.94,fract((vStone.x+vStone.z)*13.0+mod(row,2.0)*.5));
            diffuseColor.rgb *= (0.85 + grain*0.22)*(1.0-min(mortar,1.0)*.2);
          `);
        }
        if (shape === 'foliage' || shape === 'cone' || shape === 'roof') {
          shader.vertexShader='varying vec3 vDetail;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvDetail=(instanceMatrix*vec4(position,1.0)).xyz;');
          shader.fragmentShader='varying vec3 vDetail;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
            float speckle=fract(sin(dot(floor(vDetail*110.0),vec3(12.9898,78.233,45.164)))*43758.5453);
            diffuseColor.rgb*=.68+speckle*.49;
          `);
        }
        if (shape !== 'flag') return;
        shader.uniforms.uTime = time;
        shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          transformed.z += sin(position.x * 8.0 + uTime * 2.5 + instanceMatrix[3].x) * 0.12 * (position.x + 0.5);
        `);
      }} />}
  </instancedMesh>;
}

const mistVertex = `
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const mistFragment = `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float edge = 1.0 - smoothstep(0.25, 1.0, length(p));
    float drift = sin(p.x * 5.0 + uTime * 0.24 + vSeed) * cos(p.y * 6.0 - uTime * 0.18);
    float curls = sin(p.x * 11.0 - p.y * 8.0 + drift * 2.0 + uTime * 0.15);
    float density = 0.55 + drift * 0.2 + curls * 0.09;
    vec3 color = mix(vec3(0.12, 0.20, 0.24), vec3(0.34, 0.43, 0.45), density);
    gl_FragColor = vec4(color, edge * density * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function WarMist({ cells, memory }: { cells: Mist[]; memory: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uOpacity: { value: memory ? 0.36 : 0.83 } }), [memory]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const obj = new THREE.Object3D();
    cells.forEach((cell, i) => {
      for (let layer = 0; layer < 3; layer++) {
        obj.position.set(cell.position[0], cell.position[1] + layer * 0.22, cell.position[2]);
        obj.rotation.set(-Math.PI / 2, 0, layer * 1.3);
        obj.scale.set(2.8, 2.8, 1);
        obj.updateMatrix();
        ref.current!.setMatrixAt(i * 3 + layer, obj.matrix);
      }
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [cells]);
  useFrame(({ clock }) => { uniforms.uTime.value = clock.elapsedTime; });
  if (!cells.length) return null;
  return <instancedMesh key={cells.length} ref={ref} args={[undefined, undefined, cells.length * 3]} raycast={NO_RAYCAST} renderOrder={3}>
    <planeGeometry />
    <shaderMaterial vertexShader={mistVertex} fragmentShader={mistFragment} uniforms={uniforms}
      transparent depthWrite={false} side={THREE.DoubleSide} />
  </instancedMesh>;
}

/**
 * 길 위의 화살표 한 마디.
 *
 * 칸 사이에 가늘고 긴 상자를 눕히고 끝에 원뿔을 세운다. 2D 처럼 선을 그을 수
 * 없으니 실제 물체로 만든다. 판 위에 살짝 띄워 지형에 파묻히지 않게 한다.
 */
function PathArrow({ from, to }: { from: V3; to: V3 }) {
  const { mid, angle, length } = useMemo(() => {
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    const len = Math.hypot(dx, dz);
    return {
      mid: [from[0] + dx / 2, Math.max(from[1], to[1]) + 0.42, from[2] + dz / 2] as V3,
      angle: Math.atan2(dx, dz),
      length: len,
    };
  }, [from, to]);
  if (length <= 0.001) return null;
  const shaft = Math.max(0.05, length - 0.42);
  return (
    <group position={mid} rotation={[0, angle, 0]} raycast={NO_RAYCAST}>
      <mesh position={[0, 0, -0.21]} raycast={NO_RAYCAST} renderOrder={5}>
        <boxGeometry args={[0.11, 0.04, shaft]} />
        <meshBasicMaterial color="#38bdf8" toneMapped={false} depthTest={false} />
      </mesh>
      <mesh position={[0, 0, length / 2 - 0.19]} rotation={[Math.PI / 2, 0, 0]} raycast={NO_RAYCAST} renderOrder={5}>
        <coneGeometry args={[0.16, 0.34, 8]} />
        <meshBasicMaterial color="#38bdf8" toneMapped={false} depthTest={false} />
      </mesh>
    </group>
  );
}

/** 그 턴에 발이 멈추는 칸에 붙는 '3턴' 표 */
function TurnBadge({ tile, turn }: { tile: Ground; turn: number }) {
  const label = turn === 0 ? '지금' : `${turn}턴`;
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#082030'; ctx.fillRect(16, 9, 96, 46);
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3; ctx.strokeRect(16, 9, 96, 46);
    ctx.fillStyle = '#bae6fd'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, 33);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, [label]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={[tile.position[0], tile.height + 0.75, tile.position[2]]}
    scale={[0.66, 0.33, 1]} raycast={NO_RAYCAST} renderOrder={6}>
    <spriteMaterial map={texture} transparent depthTest={false} toneMapped={false} />
  </sprite>;
}

/**
 * 길잡이 표지. 금빛 고리(갈 수 있는 칸)와 헷갈리지 않게 분홍으로, 그리고
 * 숨 쉬듯 커졌다 작아진다 — 3D 판에서 가만히 있는 표시는 지형에 묻힌다.
 * 위에 거꾸로 선 뿔이 '여기' 를 가리킨다.
 */
function CoachMarker({ tile }: { tile: Ground }) {
  const ring = useRef<THREE.Mesh>(null);
  const cone = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const k = 1 + 0.08 * Math.sin(t * 4);
    ring.current?.scale.set(k, k, k);
    if (cone.current) cone.current.position.y = tile.height + 1.25 + 0.15 * Math.sin(t * 3);
  });
  return <group>
    <mesh ref={ring} position={[tile.position[0], tile.height + 0.06, tile.position[2]]}
      rotation={[-Math.PI / 2, 0, Math.PI / 6]} raycast={NO_RAYCAST}>
      <ringGeometry args={[0.78, 1.02, 6]} />
      <meshBasicMaterial color="#f472b6" side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
    <mesh ref={cone} position={[tile.position[0], tile.height + 1.25, tile.position[2]]}
      rotation={[Math.PI, 0, 0]} raycast={NO_RAYCAST}>
      <coneGeometry args={[0.22, 0.5, 12]} />
      <meshBasicMaterial color="#f472b6" toneMapped={false} />
    </mesh>
  </group>;
}

/**
 * 스포트라이트의 어둠. 밝힐 칸을 뺀 칸 위에 검은 반투명 판을 얇게 덮는다.
 *
 * 처음에는 병사·나무·성까지 감싸려고 높이 1.8 짜리 기둥을 씌웠다. 그랬더니 판 전체가
 * 검은 기둥 숲이 되어 '입체로 솟은 이상한 것' 으로 보였다(사람이 직접 보고 지적).
 * 이제 칸 윗면 바로 위의 얇은 판(0.12)이다. 조각들은 조금 덜 어두워지지만, 밝힌 칸의
 * 분홍 테두리와 대비만으로 어디를 봐야 하는지는 충분히 드러난다.
 * 누르는 것은 막지 않는다(raycast 없음). 모르는 칸(안개)은 뺀다.
 */
function DimVeil({ tiles, lit }: { tiles: Ground[]; lit: string[] }) {
  const keep = new Set(lit);
  return <group>
    {tiles.filter((t) => t.known && !keep.has(t.cell.id)).map((t) =>
      <mesh key={t.cell.id} position={[t.position[0], t.height + 0.08, t.position[2]]}
        raycast={NO_RAYCAST} renderOrder={10}>
        <cylinderGeometry args={[1.0, 1.0, 0.12, 6]} />
        <meshBasicMaterial color="#000" transparent opacity={0.6} depthWrite={false} />
      </mesh>)}
  </group>;
}

/** 캔버스 밖(포인터 처리)에서 카메라로 땅의 한 점을 짚으려고 카메라를 잡아 둔다 */
function CameraBridge({ into }: { into: React.MutableRefObject<THREE.Camera | null> }) {
  const { camera } = useThree();
  into.current = camera;
  return null;
}

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** 판 전체가 들어오는 거리 × 확대 — Rig 와 포인터 처리가 같은 식을 쓴다 */
function camDistance(span: number, fov: number, aspect: number, zoom: number): number {
  const halfFov = fov * Math.PI / 360;
  return Math.max(span / 2 / Math.tan(halfFov), span / 2 / (Math.tan(halfFov) * aspect)) * 1.12 * zoom;
}

/**
 * 카메라가 '가려는' 자리. 화면의 카메라는 부드럽게 따라가느라 한 박자 늦어서, 그걸로
 * 땅을 짚으면 휠을 연달아 굴릴 때 짚은 점이 미끄러졌다. 계산은 도착할 자리로 한다.
 */
const DEST = new THREE.PerspectiveCamera();
function clearTerrain(eye:THREE.Vector3,target:V3,height:(x:number,z:number)=>number){
  // 산과 카메라의 충돌뿐 아니라 수도를 향한 시선 중간의 능선도 피한다.
  for(let i=2;i<=12;i++){const t=i/12,x=target[0]+(eye.x-target[0])*t,z=target[2]+(eye.z-target[2])*t;
    eye.y=Math.max(eye.y,target[1]+(height(x,z)+.13-target[1])/t);}
}
function destCamera(like: THREE.PerspectiveCamera, span: number, yaw: number, pitch: number, zoom: number, target: V3,height:(x:number,z:number)=>number) {
  DEST.fov = like.fov;
  DEST.aspect = like.aspect;
  DEST.near = like.near;
  DEST.far = like.far;
  DEST.updateProjectionMatrix();
  const d = camDistance(span, like.fov, like.aspect, zoom);
  DEST.position.set(target[0] + Math.sin(yaw) * Math.cos(pitch) * d, target[1]+Math.sin(pitch) * d, target[2] + Math.cos(yaw) * Math.cos(pitch) * d);
  clearTerrain(DEST.position,target,height);
  DEST.lookAt(target[0], target[1], target[2]);
  DEST.updateMatrixWorld();
  return DEST;
}
const RAY = new THREE.Raycaster();

function Rig({ yaw, pitch, span, zoom, target,height }: { yaw: number; pitch: number; span: number; zoom: number; target: V3;height:(x:number,z:number)=>number }) {
  const aim = useRef(new THREE.Vector3());
  const desired = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const distance = camDistance(span, cam.fov, size.width / Math.max(1, size.height), zoom);
    const smoothing = 1 - Math.exp(-delta * 12);
    aim.current.lerp(desired.set(...target), smoothing);
    desired.set(aim.current.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      aim.current.y+Math.sin(pitch) * distance, aim.current.z + Math.cos(yaw) * Math.cos(pitch) * distance);
    clearTerrain(desired,[aim.current.x,aim.current.y,aim.current.z],height);
    camera.position.lerp(desired, smoothing);
    camera.lookAt(aim.current);
  });
  return null;
}

class SceneBoundary extends React.Component<{ children: React.ReactNode;onFailure?:()=>void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(){this.props.onFailure?.();}
  render() {
    return this.state.failed ? <View style={styles.fallback}><Text style={styles.subtitle}>3D 화면을 불러오지 못했습니다. 아래 ‘2D 지도’로 전환해 주세요.</Text></View> : this.props.children;
  }
}

export default function Board3D({ hud=false, battles, state, player, watching, selected, movable, path, hint, lit, onCellPress }: Props) {
  const [assetsReady,setAssetsReady]=useState(false);
  const [renderStats,setRenderStats]=useState<RenderStats|null>(null);
  const showStats=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('graphics')==='1';
  const ready=useCallback(()=>setAssetsReady(true),[]);
  const pending=useCallback(()=>setAssetsReady(false),[]);
  const {width:viewportWidth,height:viewportHeight}=useWindowDimensions();
  const compact=viewportWidth<900 || viewportHeight<500;
  const scene = useMemo(() => buildMedievalScene(state, player, watching), [state, player, watching]);
  const heightField=useMemo(()=>terrainField(scene.ground),[scene.ground]);

  /**
   * 길 위의 칸들을 실제 타일로 바꾼다. 화면에 없는 칸(안개 밖, 깎인 바깥)은
   * 빠지므로, 화살표는 이어진 부분만 그려진다.
   */
  const pathTiles = useMemo(() => {
    if (!path || path.length < 2) return [] as Array<{ tile: Ground; turn: number }>;
    const byId = new Map(scene.ground.map((t) => [t.cell.id, t]));
    const out: Array<{ tile: Ground; turn: number }> = [];
    for (const p of path) {
      const tile = byId.get(p.id);
      if (tile) out.push({ tile, turn: p.turn });
    }
    return out;
  }, [path, scene.ground]);

  /** 턴마다 발이 멈추는 마지막 칸. 칸마다 숫자를 붙이면 길이 숫자에 묻힌다. */
  const turnStops = useMemo(() => {
    const last = new Map<number, Ground>();
    for (const p of pathTiles) if (p.turn >= 0) last.set(p.turn, p.tile);
    return [...last.entries()].map(([turn, tile]) => ({ turn, tile }));
  }, [pathTiles]);

  const hintTile = useMemo(
    () => (hint ? scene.ground.find((t) => t.cell.id === hint) ?? null : null),
    [hint, scene.ground]
  );

  const unknownMist = useMemo(() => scene.mist.filter(c => !c.memory), [scene]);
  const memoryMist = useMemo(() => scene.mist.filter(c => c.memory), [scene]);
  const [yaw, setYaw] = useState(0.12);
  const [pitch, setPitch] = useState(0.88);
  const [zoom, setZoom] = useState(1);
  const [target, setTargetState] = useState<V3>([0, 0, 0]);
  /** 조준점을 옮긴다. 포인터 이벤트가 연달아 와도 앞의 것을 딛고 서게 ref 를 먼저 고친다. */
  const setTarget = (f: V3 | ((t: V3) => V3)) => {
    const next = typeof f === 'function' ? f(cam.current.target) : f;
    cam.current.target = next;
    setTargetState(next);
  };
  // 포인터 처리 안에서 바로 읽어야 해서 상태와 같은 값을 ref 로도 쥔다
  const zoomRef = useRef(1);
  const cam = useRef({ yaw: 0.12, pitch: 0.88, target: [0, 0, 0] as V3 });
  cam.current.yaw = yaw;
  cam.current.pitch = pitch;
  const focusedBattle=useRef(battles?.at(-1)?.sequence??0);
  useEffect(()=>{const cue=battles?.at(-1);if(!cue||cue.sequence<=focusedBattle.current)return;focusedBattle.current=cue.sequence;
    if(cue.attackerNation!==player&&cue.defenderNation!==player)return;
    const from=scene.ground.find(g=>g.cell.id===cue.fromId),to=scene.ground.find(g=>g.cell.id===cue.toId);if(!from?.known||!to?.seen)return;
    setTarget([(from.position[0]+to.position[0])/2,to.height,(from.position[2]+to.position[2])/2]);setZoom(.15);zoomRef.current=.15;setPitch(.72);
  },[battles,scene,player]);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /** 오른쪽 단추(또는 Ctrl/Shift)로 끄는 중이면 돌리기 */
  const rotating = useRef(false);
  const moved = useRef(false);
  const dragDistance = useRef(0);
  const selectedTile = scene.ground.find(t => t.cell.id === selected);
  const ZMIN = 0.075, ZMAX = 1.7;
  /** 판 밖으로 너무 멀리 끌려가지 않게 */
  const clampTarget = (x: number, z: number): V3 => {
    const r = scene.span * 0.62, d = Math.hypot(x, z);
    return d > r ? [x / d * r, 0, z / d * r] : [x, 0, z];
  };

  /**
   * 화면의 한 점 아래 땅(y=0)이 어디인가. 확대를 그 점으로, 끌기를 손가락 그대로 따라가게
   * 하는 데 쓴다. 전에는 확대가 늘 화면 한가운데로만 되어 원하는 곳을 크게 볼 수 없었다.
   */
  const groundAt = (clientX: number, clientY: number, el: Element): THREE.Vector3 | null => {
    const live = cameraRef.current as THREE.PerspectiveCamera | null;
    if (!live) return null;
    const c = cam.current;
    const dest = destCamera(live, scene.span, c.yaw, c.pitch, zoomRef.current, c.target,heightField.height);
    const r = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    RAY.setFromCamera(ndc, dest);
    const out = new THREE.Vector3();
    return RAY.ray.intersectPlane(GROUND, out) ? out : null;
  };

  /**
   * 한 점을 붙박고 확대한다. 카메라와 조준점을 그 점을 중심으로 같은 비율로 당기면
   * (닮음 변환) 그 점은 화면의 같은 자리에 남는다.
   */
  const zoomAt = (factor: number, at: THREE.Vector3 | null) => {
    const before = zoomRef.current;
    const after = Math.max(ZMIN, Math.min(ZMAX, before * factor));
    if (after === before) return;
    zoomRef.current = after;
    setZoom(after);
    if (!at) return;
    const k = after / before;
    setTarget(t => clampTarget(at.x + (t[0] - at.x) * k, at.z + (t[2] - at.z) * k));
  };
  const zoomBy = (amount: number) => zoomAt(amount, null);
  const reset = () => { setYaw(0.12); setPitch(0.88); setZoom(1); zoomRef.current = 1; setTarget([0, 0, 0]); };
  const capital=scene.ground.find(t=>t.known&&t.castle&&t.owner===player);
  useEffect(() => {
    if(capital&&!watching){setTarget([capital.position[0],capital.height+.25,capital.position[2]]);setPitch(.86);setZoom(.44);zoomRef.current=.44;}
    else reset();
  }, [state.rows, state.cols,capital?.cell.id]);
  const clearPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) rotating.current = false;
  };
  return <View style={styles.container}>
    <SceneBoundary onFailure={ready}>
      <Canvas shadows dpr={[1, compact?1.5:2]} camera={{ position: [0, scene.span * 1.8, scene.span * 1.5], fov: 40, near: 0.05, far: 600 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }} style={{ touchAction: 'none' }}
        fallback={<View style={styles.fallback}><Text style={styles.subtitle}>WebGL을 지원하는 브라우저에서 3D 지도를 볼 수 있습니다.</Text></View>}
        onContextMenu={e => e.preventDefault()}
        onPointerDown={e => {
          if (pointers.current.size === 0) {
            moved.current = false;
            dragDistance.current = 0;
            rotating.current = e.button === 2 || e.ctrlKey || e.shiftKey;
          }
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }}
        onPointerMove={e => {
          const prev = pointers.current.get(e.pointerId);
          if (!prev) return;
          const el = e.currentTarget as Element;
          const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
          dragDistance.current += Math.hypot(dx, dy);
          if (dragDistance.current > 5) moved.current = true;
          if (pointers.current.size === 2) {
            // 두 손가락: 벌리면 그 사이로 확대, 함께 끌면 이동, 비틀면 돌리기
            const other = Array.from(pointers.current.entries()).find(([id]) => id !== e.pointerId)![1];
            const before = Math.hypot(prev.x - other.x, prev.y - other.y);
            const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
            const midPrev = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
            const midNow = { x: (e.clientX + other.x) / 2, y: (e.clientY + other.y) / 2 };
            const a = groundAt(midPrev.x, midPrev.y, el), b = groundAt(midNow.x, midNow.y, el);
            if (a && b) setTarget(t => clampTarget(t[0] + a.x - b.x, t[2] + a.z - b.z));
            if (after > 4 && before > 4) zoomAt(before / after, b);
            const angPrev = Math.atan2(prev.y - other.y, prev.x - other.x);
            const angNow = Math.atan2(e.clientY - other.y, e.clientX - other.x);
            let twist = angNow - angPrev;
            if (twist > Math.PI) twist -= 2 * Math.PI;
            if (twist < -Math.PI) twist += 2 * Math.PI;
            if (Math.abs(twist) < 0.3) setYaw(v => v - twist);
            moved.current = true;
          } else if (rotating.current) {
            setYaw(v => v + dx * 0.006);
            setPitch(v => Math.max(0.5, Math.min(1.35, v + dy * 0.004)));
          } else {
            // 한 손가락·왼쪽 단추: 땅을 잡고 끈다 — 손가락 밑의 땅이 손가락을 따라온다
            const a = groundAt(prev.x, prev.y, el), b = groundAt(e.clientX, e.clientY, el);
            if (a && b) setTarget(t => clampTarget(t[0] + a.x - b.x, t[2] + a.z - b.z));
          }
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }}
        onPointerUp={clearPointer} onPointerCancel={clearPointer} onPointerLeave={clearPointer}
        onWheel={e => zoomAt(Math.exp(e.deltaY * 0.0012), groundAt(e.clientX, e.clientY, e.currentTarget as Element))}>
        <CameraBridge into={cameraRef} />
        <color attach="background" args={['#a6b9b7']} />
        <Rig yaw={yaw} pitch={pitch} span={scene.span} zoom={zoom} target={target} height={heightField.height}/>
        <RealmAtmosphere onStats={showStats?setRenderStats:undefined}/>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} receiveShadow raycast={NO_RAYCAST}>
          <planeGeometry args={[scene.span * 8, scene.span * 8]} />
          <meshStandardMaterial color="#18272c" roughness={1} />
        </mesh>
        <Suspense fallback={null}>
        <RealmDaylight/>
        <CampaignLand ground={scene.ground} onPick={(index,e) => {
          e.stopPropagation();
          if (moved.current || e.delta > 5) return;
          onCellPress(scene.ground[index].cell);
        }} />
        <RealmModels ground={scene.ground}/>
        <RealmGrass ground={scene.ground}/>
        <RealmLandscape ground={scene.ground}/>
        <RealmArmy ground={scene.ground} battles={battles}/>
        {SHAPES.map(shape => <Instances key={shape} shape={shape} pieces={scene.pieces[shape]} />)}
        {scene.ground.filter(t => movable.has(t.cell.id) || selected === t.cell.id).map(t =>
          <TerrainRing key={t.cell.id} tile={t} ground={scene.ground} selected={selected === t.cell.id} />)}
        <WarMist cells={unknownMist} memory={false} />
        <WarMist cells={memoryMist} memory />
        {scene.ground.filter(t => t.seen && t.cell.units > 0).map(t => <ArmyStandard key={t.cell.id} tile={t} own={t.owner===player} selected={selected===t.cell.id} label={t.owner===player?'내 군대':t.owner===null?'중립':`${relationOf(state,player,t.owner)==='alliance'?'동맹':relationOf(state,player,t.owner)==='truce'?'휴전':'적군'} · ${state.nations[t.owner].name}`} onPick={()=>onCellPress(t.cell)}/>)}
        {pathTiles.map((t, i) => i === 0 ? null :
          <PathArrow key={'a' + t.tile.cell.id} from={pathTiles[i - 1].tile.position} to={t.tile.position} />)}
        {turnStops.map(({ tile, turn }) => <TurnBadge key={'b' + tile.cell.id} tile={tile} turn={turn} />)}
        {lit && <DimVeil tiles={scene.ground} lit={lit} />}
        {hintTile && <CoachMarker tile={hintTile} />}
        <AssetReady onReady={ready} onPending={pending}/>
        </Suspense>
      </Canvas>
    </SceneBoundary>
    {!assetsReady&&<View pointerEvents="none" style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',backgroundColor:'#172322'}]}><Text style={styles.title}>왕국의 풍경을 준비합니다</Text><Text style={styles.subtitle}>성곽 · 수목 · 고해상도 지형 불러오는 중</Text></View>}
    {!hud&&<View pointerEvents="none" style={[styles.heading,compact&&{top:10,left:12,width:180,padding:8}]}>
      {!compact&&<Text style={styles.eyebrow}>C H R O N I C L E   O F   C R O W N S</Text>}
      <Text style={[styles.title,compact&&{fontSize:16}]}>왕국 연대기</Text>
      {!compact&&<Text style={styles.subtitle}>{watching ? '관전 · 모든 영토 공개' : '정찰한 땅 너머에는 전장의 안개가 깔립니다'}</Text>}
      {showStats&&renderStats&&<Text testID="render-stats" style={styles.subtitle}>{renderStats.fps} FPS · {renderStats.triangles.toLocaleString()} tris · {renderStats.calls} calls</Text>}
    </View>
    }
    {hud&&<RealmMinimap ground={scene.ground} target={target} onMove={tile=>setTarget([tile.position[0],tile.height,tile.position[2]])}/>}
    <View style={[styles.bottom,hud&&{bottom:compact?(selectedTile?245:184):18,left:compact?8:400,right:compact?8:245}]} pointerEvents="box-none">
      {!compact&&!hud&&<View pointerEvents="none"><Text style={styles.hint}>끌어서 이동 · 오른쪽 단추·Shift 끌기 / 두 손가락 비틀기 회전 · 휠 / 두 손가락 확대</Text></View>}
      <View style={styles.controls}>
        <TouchableOpacity accessibilityLabel="지도 축소" style={styles.control} onPress={() => zoomBy(1.2)}><Text style={styles.controlText}>−</Text></TouchableOpacity>
        <TouchableOpacity accessibilityLabel="지도 확대" style={styles.control} onPress={() => zoomBy(1 / 1.2)}><Text style={styles.controlText}>＋</Text></TouchableOpacity>
        <TouchableOpacity accessibilityLabel="카메라 초기화" style={styles.control} onPress={reset}><Text style={styles.smallControl}>전체 보기</Text></TouchableOpacity>
        <TouchableOpacity accessibilityLabel="수도 확대" style={styles.control} onPress={()=>{const home=scene.ground.find(t=>t.known&&t.castle&&t.owner===player);if(home){setTarget([home.position[0],home.height+.3,home.position[2]]);setPitch(1.02);setZoom(.17);zoomRef.current=.17;}}}><Text style={styles.smallControl}>수도</Text></TouchableOpacity>
        {selectedTile && <TouchableOpacity style={styles.control} onPress={() => {
          setTarget([selectedTile.position[0], 0, selectedTile.position[2]]); setZoom(0.28); zoomRef.current = 0.28;
        }}><Text style={styles.smallControl}>선택 확대</Text></TouchableOpacity>}
      </View>
      {!compact&&!hud&&<View pointerEvents="none"><Text style={styles.legend}>깃발·테두리 = 소유국   /   금빛 테두리 = 이동 가능</Text></View>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111e24', overflow: 'hidden', borderRadius: 0, borderWidth: 0, borderColor: '#3c4846' },
  heading: { position: 'absolute', top: 20, left: 22, width:350,padding:14,backgroundColor:'rgba(15,27,27,.76)',borderLeftWidth:2,borderLeftColor:'#bda778' },
  eyebrow: { color: '#bda778', fontSize: 9, fontWeight: '600', marginBottom: 5 },
  title: { color: '#eee3c9', fontFamily:realm.serif,fontSize: 23, fontWeight: '700', letterSpacing: 2 },
  subtitle: { color: '#9cadad', fontSize: 11, marginTop: 6 },
  bottom: { position: 'absolute', bottom: 14, left: 8, right: 8, alignItems: 'center', gap: 8 },
  hint: { color: '#d6ded5', fontSize: 10, textAlign: 'center',backgroundColor:'rgba(15,27,27,.7)',paddingHorizontal:10,paddingVertical:4 },
  controls: { flexDirection: 'row',flexWrap:'wrap',maxWidth:'100%', borderRadius: 8, borderWidth: 1, borderColor: '#6c6955', backgroundColor: 'rgba(18,30,34,0.94)', overflow: 'hidden' },
  control: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  controlText: { color: '#eee0bf', fontSize: 22 },
  smallControl: { color: '#eee0bf', fontSize: 11 },
  legend: { color: '#849895', fontSize: 9, textAlign: 'center' },
  fallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
});
