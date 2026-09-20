import React, { useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Cell, GameState } from '../engine';
import { buildMedievalScene, Ground, Mist, Piece, Shape, V3 } from './medievalScene';

interface Props {
  state: GameState;
  player: number;
  watching: boolean;
  selected: string | null;
  movable: Set<string>;
  /** 물어본 길 — 출발 칸부터 목적지까지, 밟는 턴과 함께 */
  path?: Array<{ id: string; turn: number }>;
  onCellPress: (c: Cell) => void;
}
const NO_RAYCAST = () => {};
const SHAPES: Shape[] = ['box', 'stone', 'metal', 'cone', 'trunk', 'rock', 'flag', 'shield'];

function Geometry({ shape }: { shape: Shape | 'hex' }) {
  if (shape === 'hex') return <cylinderGeometry args={[1, 1, 1, 6]} />;
  if (shape === 'cone') return <coneGeometry args={[1, 1, 5]} />;
  if (shape === 'trunk') return <cylinderGeometry args={[1, 1, 1, 5]} />;
  if (shape === 'rock' || shape === 'shield') return <icosahedronGeometry args={[1, 0]} />;
  if (shape === 'flag') return <planeGeometry args={[1, 1, 8, 1]} />;
  return <boxGeometry args={[1, 1, 1]} />;
}

/** Thousands of miniature parts share a handful of draw calls. */
function Instances({ shape, pieces, onClick }: {
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
    <meshStandardMaterial roughness={shape === 'metal' ? 0.45 : 0.95} metalness={shape === 'metal' ? 0.55 : 0}
      side={shape === 'flag' ? THREE.DoubleSide : THREE.FrontSide}
      onBeforeCompile={shader => {
        if (shape !== 'flag') return;
        shader.uniforms.uTime = time;
        shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          transformed.z += sin(position.x * 8.0 + uTime * 2.5 + instanceMatrix[3].x) * 0.12 * (position.x + 0.5);
        `);
      }} />
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

function TroopCount({ tile }: { tile: Ground }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#172327'; ctx.fillRect(23, 9, 82, 46);
    ctx.strokeStyle = '#bca674'; ctx.lineWidth = 2; ctx.strokeRect(23, 9, 82, 46);
    ctx.fillStyle = '#f2e6c8'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(tile.cell.units), 64, 33);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, [tile.cell.units]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <sprite position={[tile.position[0], tile.height + 0.3, tile.position[2] + 0.84]}
    scale={[0.58, 0.29, 1]} raycast={NO_RAYCAST} renderOrder={4}>
    <spriteMaterial map={texture} transparent depthTest={false} toneMapped={false} />
  </sprite>;
}

function TileRing({ tile, selected }: { tile: Ground; selected: boolean }) {
  return <mesh position={[tile.position[0], tile.height + 0.045, tile.position[2]]}
    rotation={[-Math.PI / 2, 0, Math.PI / 6]} raycast={NO_RAYCAST}>
    <ringGeometry args={[selected ? 0.86 : 0.91, 0.99, 6]} />
    <meshBasicMaterial color={selected ? '#fff1bc' : '#e5b960'} side={THREE.DoubleSide} toneMapped={false} />
  </mesh>;
}

function Rig({ yaw, pitch, span, zoom, target }: { yaw: number; pitch: number; span: number; zoom: number; target: V3 }) {
  const aim = useRef(new THREE.Vector3());
  const desired = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const halfFov = cam.fov * Math.PI / 360;
    const aspect = size.width / Math.max(1, size.height);
    const distance = Math.max(span / 2 / Math.tan(halfFov), span / 2 / (Math.tan(halfFov) * aspect)) * 1.12 * zoom;
    const smoothing = 1 - Math.exp(-delta * 12);
    aim.current.lerp(desired.set(...target), smoothing);
    desired.set(aim.current.x + Math.sin(yaw) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance, aim.current.z + Math.cos(yaw) * Math.cos(pitch) * distance);
    camera.position.lerp(desired, smoothing);
    camera.lookAt(aim.current);
  });
  return null;
}

class SceneBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <View style={styles.fallback}><Text style={styles.subtitle}>3D 화면을 불러오지 못했습니다. 아래 ‘2D 지도’로 전환해 주세요.</Text></View> : this.props.children;
  }
}

export default function Board3D({ state, player, watching, selected, movable, path, onCellPress }: Props) {
  const scene = useMemo(() => buildMedievalScene(state, player, watching), [state, player, watching]);

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

  const unknownMist = useMemo(() => scene.mist.filter(c => !c.memory), [scene]);
  const memoryMist = useMemo(() => scene.mist.filter(c => c.memory), [scene]);
  const [yaw, setYaw] = useState(0.12);
  const [pitch, setPitch] = useState(0.88);
  const [zoom, setZoom] = useState(1);
  const [target, setTarget] = useState<V3>([0, 0, 0]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const dragDistance = useRef(0);
  const selectedTile = scene.ground.find(t => t.cell.id === selected);
  const zoomBy = (amount: number) => setZoom(z => Math.max(0.22, Math.min(1.7, z * amount)));
  const reset = () => { setYaw(0.12); setPitch(0.88); setZoom(1); setTarget([0, 0, 0]); };
  useEffect(() => { reset(); }, [state.rows, state.cols]);
  const clearPointer = (e: React.PointerEvent<HTMLDivElement>) => { pointers.current.delete(e.pointerId); };
  return <View style={styles.container}>
    <SceneBoundary>
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, scene.span * 1.8, scene.span * 1.5], fov: 40, near: 0.1, far: 600 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }} style={{ touchAction: 'none' }}
        fallback={<View style={styles.fallback}><Text style={styles.subtitle}>WebGL을 지원하는 브라우저에서 3D 지도를 볼 수 있습니다.</Text></View>}
        onPointerDown={e => {
          if (pointers.current.size === 0) { moved.current = false; dragDistance.current = 0; }
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }}
        onPointerMove={e => {
          const prev = pointers.current.get(e.pointerId);
          if (!prev) return;
          const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
          dragDistance.current += Math.hypot(dx, dy);
          if (dragDistance.current > 5) moved.current = true;
          if (pointers.current.size === 2) {
            const other = Array.from(pointers.current.entries()).find(([id]) => id !== e.pointerId)![1];
            const before = Math.hypot(prev.x - other.x, prev.y - other.y);
            const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
            if (after > 4 && before > 4) zoomBy(before / after);
            moved.current = true;
          } else {
            setYaw(v => v + dx * 0.006);
            setPitch(v => Math.max(0.5, Math.min(1.35, v + dy * 0.004)));
          }
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }}
        onPointerUp={clearPointer} onPointerCancel={clearPointer} onPointerLeave={clearPointer}
        onWheel={e => zoomBy(Math.exp(e.deltaY * 0.001))}>
        <color attach="background" args={['#111e24']} />
        <hemisphereLight args={['#dae9e5', '#414333', 1.55]} />
        <directionalLight position={[-scene.span * 0.4, scene.span, scene.span * 0.35]} color="#ffe0a6" intensity={2.8}
          castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.04}
          shadow-camera-left={-scene.span * 0.7} shadow-camera-right={scene.span * 0.7}
          shadow-camera-top={scene.span * 0.7} shadow-camera-bottom={-scene.span * 0.7}
          shadow-camera-near={0.1} shadow-camera-far={scene.span * 3} />
        <directionalLight position={[0, 8, -12]} color="#a6c9e5" intensity={0.65} />
        <Rig yaw={yaw} pitch={pitch} span={scene.span} zoom={zoom} target={target} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} receiveShadow raycast={NO_RAYCAST}>
          <planeGeometry args={[scene.span * 8, scene.span * 8]} />
          <meshStandardMaterial color="#18272c" roughness={1} />
        </mesh>
        <Instances shape="hex" pieces={scene.ground} onClick={e => {
          e.stopPropagation();
          if (moved.current || e.delta > 5 || e.instanceId === undefined) return;
          onCellPress(scene.ground[e.instanceId].cell);
        }} />
        {SHAPES.map(shape => <Instances key={shape} shape={shape} pieces={scene.pieces[shape]} />)}
        {scene.ground.filter(t => movable.has(t.cell.id) || selected === t.cell.id).map(t =>
          <TileRing key={t.cell.id} tile={t} selected={selected === t.cell.id} />)}
        <WarMist cells={unknownMist} memory={false} />
        <WarMist cells={memoryMist} memory />
        {scene.ground.filter(t => t.seen && t.cell.units > 0).map(t => <TroopCount key={t.cell.id} tile={t} />)}
        {pathTiles.map((t, i) => i === 0 ? null :
          <PathArrow key={'a' + t.tile.cell.id} from={pathTiles[i - 1].tile.position} to={t.tile.position} />)}
        {turnStops.map(({ tile, turn }) => <TurnBadge key={'b' + tile.cell.id} tile={tile} turn={turn} />)}
      </Canvas>
    </SceneBoundary>
    <View pointerEvents="none" style={styles.heading}>
      <Text style={styles.eyebrow}>T H E   W A R   T A B L E</Text>
      <Text style={styles.title}>왕국의 전장</Text>
      <Text style={styles.subtitle}>{watching ? '관전 · 모든 영토 공개' : '정찰한 땅 너머에는 전장의 안개가 깔립니다'}</Text>
    </View>
    <View style={styles.bottom} pointerEvents="box-none">
      <View pointerEvents="none"><Text style={styles.hint}>드래그 회전 · 휠 / 두 손가락 확대 · 타일 선택</Text></View>
      <View style={styles.controls}>
        <TouchableOpacity accessibilityLabel="지도 축소" style={styles.control} onPress={() => zoomBy(1.2)}><Text style={styles.controlText}>−</Text></TouchableOpacity>
        <TouchableOpacity accessibilityLabel="지도 확대" style={styles.control} onPress={() => zoomBy(1 / 1.2)}><Text style={styles.controlText}>＋</Text></TouchableOpacity>
        <TouchableOpacity accessibilityLabel="카메라 초기화" style={styles.control} onPress={reset}><Text style={styles.smallControl}>전체 보기</Text></TouchableOpacity>
        {selectedTile && <TouchableOpacity style={styles.control} onPress={() => {
          setTarget([selectedTile.position[0], 0, selectedTile.position[2]]); setZoom(0.28);
        }}><Text style={styles.smallControl}>선택 확대</Text></TouchableOpacity>}
      </View>
      <View pointerEvents="none"><Text style={styles.legend}>깃발·테두리 = 소유국   /   금빛 테두리 = 이동 가능</Text></View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111e24', overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#3c4846' },
  heading: { position: 'absolute', top: 20, left: 22, right: 16 },
  eyebrow: { color: '#bda778', fontSize: 9, fontWeight: '600', marginBottom: 5 },
  title: { color: '#eee3c9', fontSize: 23, fontWeight: '700', letterSpacing: 2 },
  subtitle: { color: '#9cadad', fontSize: 11, marginTop: 6 },
  bottom: { position: 'absolute', bottom: 14, left: 8, right: 8, alignItems: 'center', gap: 8 },
  hint: { color: '#b2c0bc', fontSize: 10, textAlign: 'center' },
  controls: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: '#6c6955', backgroundColor: 'rgba(18,30,34,0.94)', overflow: 'hidden' },
  control: { minWidth: 42, minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  controlText: { color: '#eee0bf', fontSize: 22 },
  smallControl: { color: '#eee0bf', fontSize: 11 },
  legend: { color: '#849895', fontSize: 9, textAlign: 'center' },
  fallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
});
