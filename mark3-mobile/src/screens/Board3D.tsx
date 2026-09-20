// 3D 판
//
// 엔진(src/engine)에는 React 도 three 도 들어 있지 않다. 규칙·전투·경제·시야가
// 전부 순수 TypeScript 라서, 3D 는 같은 상태 위에 껍데기를 하나 더 얹는 일이다.
// 2D 화면은 그대로 두고 토글로 오간다.
//
// 지금은 웹에서만 켠다. 네이티브에서 돌리려면 expo-gl 위에서
// '@react-three/fiber/native' 를 써야 하는데, 그건 따로 손봐야 한다.

import React, { useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Cell, GameState, NEUTRAL_COLOR } from '../engine';
import { isVisible, isExplored, knownCell } from '../engine';

/** 칸 반지름 1 기준. 뾰족한 꼭짓점이 위아래로 가는 배치(odd-r)다. */
const R = 1;
const HEX_W = Math.sqrt(3) * R;

/** 지형마다 두께가 다르다. 산이 높으면 지도를 안 읽어도 지형이 보인다. */
const TERRAIN_H: Record<string, number> = {
  plain: 0.22,
  desert: 0.3,
  forest: 0.55,
  mountain: 1.05,
};

const TERRAIN_COLOR: Record<string, string> = {
  plain: '#3f4a3a',
  desert: '#5c5334',
  forest: '#2f4030',
  mountain: '#4a4a55',
};

function worldOf(c: { row: number; col: number }): [number, number] {
  return [(c.col + (c.row % 2 === 0 ? 0 : 0.5)) * HEX_W, c.row * 1.5 * R];
}

interface Props {
  state: GameState;
  player: number;
  watching: boolean;
  selected: string | null;
  movable: Set<string>;
  onCellPress: (c: Cell) => void;
}

/** 한 칸 */
function Tile({
  cell,
  state,
  player,
  watching,
  selected,
  movable,
  onPress,
  origin,
}: {
  cell: Cell;
  state: GameState;
  player: number;
  watching: boolean;
  selected: boolean;
  movable: boolean;
  onPress: (c: Cell) => void;
  origin: [number, number];
}) {
  const seen = watching || isVisible(state, player, cell);
  const known = watching || isExplored(state, player, cell);
  const mem = known && !seen ? knownCell(state, player, cell) : null;

  const terrain = seen ? cell.terrain : mem?.terrain ?? 'plain';
  const owner = seen ? cell.owner : mem?.owner ?? null;
  const castle = seen ? cell.castle : mem?.castle ?? false;
  const fort = seen ? cell.fortStage : mem?.fortStage ?? 0;

  const h = known ? TERRAIN_H[terrain] ?? 0.22 : 0.12;

  let color = known ? TERRAIN_COLOR[terrain] ?? '#3f4a3a' : '#17171a';
  if (known && owner !== null) color = state.nations[owner].color;
  if (seen && cell.neutral) color = NEUTRAL_COLOR[cell.neutral];
  if (movable) color = '#fbbf24';

  const [x, z] = worldOf(cell);
  const px = x - origin[0];
  const pz = z - origin[1];

  const units = seen ? cell.units : 0;

  return (
    <group position={[px, 0, pz]}>
      <mesh
        position={[0, h / 2, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onPress(cell);
        }}
      >
        <cylinderGeometry args={[R * 0.97, R * 0.97, h, 6]} />
        <meshStandardMaterial
          color={color}
          roughness={0.85}
          metalness={0.05}
          emissive={selected ? '#ffffff' : movable ? '#7c5c10' : '#000000'}
          emissiveIntensity={selected ? 0.35 : movable ? 0.3 : 0}
          opacity={known ? 1 : 0.9}
          transparent={!known}
        />
      </mesh>

      {/* 본진은 탑, 완공 요새는 낮은 성벽. 멀리서도 형태로 구분된다. */}
      {castle && (
        <mesh position={[0, h + 0.55, 0]}>
          <boxGeometry args={[0.55, 1.1, 0.55]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
      )}
      {!castle && fort === 4 && (
        <mesh position={[0, h + 0.28, 0]}>
          <cylinderGeometry args={[0.62, 0.7, 0.55, 6]} />
          <meshStandardMaterial color="#a78bfa" roughness={0.6} />
        </mesh>
      )}
      {!castle && fort > 0 && fort < 4 && (
        <mesh position={[0, h + 0.15, 0]}>
          <boxGeometry args={[0.5, 0.3, 0.5]} />
          <meshStandardMaterial color="#6b7280" roughness={0.9} />
        </mesh>
      )}

      {/* 병력은 작은 기둥을 세워 센다. 한 칸에 최대 10 명이라 세어서 읽힌다. */}
      {units > 0 &&
        Array.from({ length: Math.min(10, units) }, (_, i) => {
          const ring = i < 6 ? i : i - 6;
          const rad = i < 6 ? 0.42 : 0.2;
          const a = (ring / (i < 6 ? 6 : 4)) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * rad, h + 0.2, Math.sin(a) * rad]}
            >
              <cylinderGeometry args={[0.1, 0.12, 0.4, 5]} />
              <meshStandardMaterial
                color={cell.owner !== null && !cell.neutral ? '#f8fafc' : '#cbd5e1'}
                roughness={0.7}
              />
            </mesh>
          );
        })}
    </group>
  );
}

/**
 * 카메라. 드래그로 돌리고 휠로 당긴다.
 *
 * 거리는 눈대중으로 두면 안 된다 — 화각과 화면 비율에 맞춰 판이 딱 들어오는
 * 거리를 계산한다. span * 0.95 로 뒀더니 판이 화면 밖으로 잘렸다.
 */
function Rig({ yaw, span, zoom }: { yaw: number; span: number; zoom: number }) {
  useFrame(({ camera, size }) => {
    const cam = camera as THREE.PerspectiveCamera;
    const vFov = (cam.fov * Math.PI) / 180;
    const aspect = size.width / Math.max(1, size.height);
    // 세로로 담을 수 있는 거리와 가로로 담을 수 있는 거리 중 먼 쪽
    const needV = span / 2 / Math.tan(vFov / 2);
    const needH = span / 2 / (Math.tan(vFov / 2) * aspect);
    const dist = Math.max(needV, needH) * 1.15 * zoom;

    const pitch = 0.92;
    camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.sin(pitch) * dist,
      Math.cos(yaw) * Math.cos(pitch) * dist
    );
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function Board3D({
  state,
  player,
  watching,
  selected,
  movable,
  onCellPress,
}: Props) {
  const cells = useMemo(() => state.cells.filter((c) => !c.offMap), [state.cells]);

  // 판의 한가운데를 원점으로 옮겨 카메라가 늘 가운데를 본다
  const { origin, span } = useMemo(() => {
    const pts = cells.map(worldOf);
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    return {
      origin: [(minX + maxX) / 2, (minZ + maxZ) / 2] as [number, number],
      span: Math.max(maxX - minX, maxZ - minZ) + 2,
    };
  }, [cells]);

  const [yaw, setYaw] = useState(0);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; yaw: number } | null>(null);

  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      camera={{ fov: 40, near: 0.1, far: 500 }}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, yaw };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        setYaw(drag.current.yaw + (e.clientX - drag.current.x) * 0.006);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerLeave={() => {
        drag.current = null;
      }}
      onWheel={(e) => setZoom((z) => Math.max(0.55, Math.min(2.2, z + e.deltaY * 0.0012)))}
    >
      <color attach="background" args={['#0e0e11']} />
      <hemisphereLight args={['#cfd8ff', '#20202a', 1.1]} />
      <directionalLight position={[span * 0.6, span, span * 0.4]} intensity={1.5} />

      <Rig yaw={yaw} span={span} zoom={zoom} />

      {cells.map((c) => (
        <Tile
          key={c.id}
          cell={c}
          state={state}
          player={player}
          watching={watching}
          selected={c.id === selected}
          movable={movable.has(c.id)}
          onPress={onCellPress}
          origin={origin}
        />
      ))}
    </Canvas>
  );
}
