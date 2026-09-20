import * as THREE from 'three';
import { Cell, GameState, isExplored, isVisible, knownCell, NEUTRAL_COLOR, Terrain } from '../engine';

export type V3 = [number, number, number];
export type Shape = 'box' | 'stone' | 'metal' | 'cone' | 'trunk' | 'rock' | 'flag' | 'shield';
export interface Piece { position: V3; scale: V3; color: string; rotation?: V3 }
export interface Ground extends Piece { cell: Cell; height: number; seen: boolean; known: boolean }
export interface Mist { position: V3; memory: boolean }
export interface MedievalScene {
  ground: Ground[];
  pieces: Record<Shape, Piece[]>;
  mist: Mist[];
  span: number;
}

const HEIGHT: Record<Terrain, number> = { plain: 0.24, forest: 0.3, mountain: 0.5, desert: 0.26 };
const EARTH: Record<Terrain, string> = {
  plain: '#63734b', forest: '#3d5c43', mountain: '#777e76', desert: '#b8a074',
};
const world = (c: Cell): [number, number] => [Math.sqrt(3) * (c.col + (c.row % 2) * 0.5), c.row * 1.5];
// Stable decoration: taking a turn must never reshuffle the landscape.
const random = (seed: number) => { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };

/** Only project visible or remembered information into the render scene. */
export function buildMedievalScene(state: GameState, player: number, watching: boolean): MedievalScene {
  const cells = state.cells.filter(c => !c.offMap);
  const points = cells.map(world);
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  const minX = cells.length ? Math.min(...xs) : 0, maxX = cells.length ? Math.max(...xs) : 0;
  const minZ = cells.length ? Math.min(...zs) : 0, maxZ = cells.length ? Math.max(...zs) : 0;
  const ox = (minX + maxX) / 2, oz = (minZ + maxZ) / 2;
  const scene: MedievalScene = {
    ground: [], pieces: { box: [], stone: [], metal: [], cone: [], trunk: [], rock: [], flag: [], shield: [] },
    mist: [], span: Math.max(maxX - minX, maxZ - minZ) + 2.5,
  };

  cells.forEach((cell, index) => {
    const seen = watching || isVisible(state, player, cell);
    const known = seen || isExplored(state, player, cell);
    const memory = known && !seen ? knownCell(state, player, cell) : null;
    const terrain = seen ? cell.terrain : memory?.terrain ?? 'plain';
    const castle = seen ? cell.castle : memory?.castle ?? false;
    const stage = seen ? cell.fortStage : memory?.fortStage ?? 0;
    const owner = seen ? cell.owner : memory?.owner ?? null;
    const units = seen ? cell.units : 0;
    const [wx, wz] = points[index];
    const x = wx - ox, z = wz - oz, h = known ? HEIGHT[terrain] : 0.16;
    const heraldry = seen && cell.neutral ? NEUTRAL_COLOR[cell.neutral] : owner !== null ? state.nations[owner].color : '#bbad87';
    const tint = (color: string) => seen ? color : '#' + new THREE.Color(color).lerp(new THREE.Color('#26363d'), 0.68).getHexString();
    scene.ground.push({ cell, position: [x, h / 2, z], scale: [0.975, h, 0.975],
      color: known ? tint(EARTH[terrain]) : '#202f36', height: h, seen, known });
    if (!seen) scene.mist.push({ position: [x, known ? h + 0.52 : 0.62, z], memory: known });
    if (!known) return;

    const add = (shape: Shape, px: number, py: number, pz: number, sx: number, sy: number, sz: number, color: string, rotation?: V3) => {
      scene.pieces[shape].push({ position: [x + px, h + py, z + pz], scale: [sx, sy, sz], color: tint(color), rotation });
    };
    const box = (px: number, py: number, pz: number, sx: number, sy: number, sz: number, color: string) => add('box', px, py, pz, sx, sy, sz, color);
    const flag = (px: number, base: number, pz: number, height: number) => {
      add('trunk', px, base + height / 2, pz, 0.018, height, 0.018, '#d1b77c');
      add('flag', px + 0.18, base + height - 0.16, pz, 0.36, 0.24, 1, heraldry);
      add('cone', px, base + height + 0.035, pz, 0.045, 0.1, 0.045, '#d6b877');
    };

    // A narrow heraldic rim keeps both ownership and terrain readable.
    if (owner !== null || (seen && cell.neutral)) {
      for (let edge = 0; edge < 6; edge++) {
        const a = edge * Math.PI / 3;
        add('box', Math.cos(a) * 0.825, 0.018, Math.sin(a) * 0.825, 0.025, 0.035, 0.92, heraldry, [0, -a, 0]);
      }
    }

    const occupied = castle || stage > 0 || units > 0;
    if (terrain === 'forest') {
      const count = occupied ? 3 : 6;
      for (let i = 0; i < count; i++) {
        const a = i * 2.4 + random(index) * 2;
        const r = occupied ? 0.72 : 0.18 + random(index * 17 + i) * 0.48;
        const tx = Math.cos(a) * r, tz = occupied ? -0.36 - Math.abs(Math.sin(a)) * 0.24 : Math.sin(a) * r;
        const s = 0.7 + random(index * 31 + i) * 0.4;
        add('trunk', tx, 0.2 * s, tz, 0.055, 0.4 * s, 0.055, '#514331');
        add('cone', tx, 0.45 * s, tz, 0.26 * s, 0.58 * s, 0.26 * s, i % 2 ? '#294b38' : '#375b3c');
        add('cone', tx, 0.7 * s, tz, 0.19 * s, 0.48 * s, 0.19 * s, '#466b47');
      }
    } else if (terrain === 'mountain') {
      for (let i = 0; i < 3; i++) {
        const tx = (i - 1) * 0.4, tz = occupied ? -0.49 : (i % 2) * 0.32 - 0.15;
        const size = occupied ? 0.4 : 0.6 + random(index + i) * 0.35;
        add('rock', tx, size * 0.36, tz, size * 0.6, size, size * 0.6, i % 2 ? '#89938c' : '#606d69', [0, i, 0]);
        if (!occupied) add('cone', tx, size * 0.88, tz, size * 0.22, size * 0.35, size * 0.22, '#d3d6ca', [0, i, 0]);
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const a = random(index * 13 + i) * Math.PI * 2;
        const r = 0.66 + random(index + i * 7) * 0.13;
        if (terrain === 'desert') add('rock', Math.cos(a) * r, 0.055, Math.sin(a) * r, 0.12, 0.09, 0.09, '#c9b28a');
        else add('cone', Math.cos(a) * r, 0.06, Math.sin(a) * r, 0.035, 0.14, 0.035, '#90925a');
      }
    }
    if (seen && cell.hasRoad) box(0, 0.014, 0, 0.23, 0.025, 1.65, '#b4a17a');

    if (castle || stage > 0) {
      const complete = castle || stage === 4;
      const stone = '#b5afa0', lightStone = '#cec5ae';
      box(0, 0.055, -0.07, 1.14, 0.11, 1.0, '#77786d');
      const wallH = complete ? 0.42 : 0.12 * stage;
      // Three walls and a split front wall leave a real gateway.
      box(-0.47, wallH / 2 + 0.1, -0.07, 0.13, wallH, 0.9, stone);
      box(0.47, wallH / 2 + 0.1, -0.07, 0.13, wallH, 0.9, stone);
      box(0, wallH / 2 + 0.1, -0.48, 0.95, wallH, 0.13, stone);
      [-1, 1].forEach(side => box(side * 0.35, wallH / 2 + 0.1, 0.35, 0.3, wallH, 0.13, stone));
      if (complete) {
        for (const tx of [-0.47, 0.47]) for (const tz of [-0.46, 0.34]) {
          add('stone', tx, 0.42, tz, 0.28, 0.7, 0.28, lightStone);
          for (const bx of [-0.09, 0.09]) for (const bz of [-0.09, 0.09])
            box(tx + bx, 0.82, tz + bz, 0.09, 0.13, 0.09, stone);
          box(tx, 0.53, tz + 0.145, 0.045, 0.16, 0.012, '#323b38');
        }
        for (let i = 0; i < 5; i++) {
          box(-0.4 + i * 0.2, 0.57, -0.48, 0.1, 0.12, 0.14, lightStone);
          if (i !== 2) box(-0.4 + i * 0.2, 0.57, 0.35, 0.1, 0.12, 0.14, lightStone);
        }
        box(0, 0.22, 0.36, 0.22, 0.32, 0.07, '#57452f');
        box(0, 0.41, 0.39, 0.29, 0.11, 0.11, lightStone);
        if (castle) {
          add('stone', 0, 0.58, -0.14, 0.45, 1.05, 0.42, '#c5bca5');
          add('cone', 0, 1.25, -0.14, 0.4, 0.45, 0.4, '#4d6570', [0, Math.PI / 4, 0]);
          box(0, 0.79, 0.075, 0.07, 0.2, 0.012, '#384642');
          flag(0, 1.47, -0.14, 0.55);
        } else flag(0.47, 0.9, -0.46, 0.62);
        // Warm gate lanterns, emissive material without costly per-fort lights.
        [-0.2, 0.2].forEach(tx => add('shield', tx, 0.44, 0.43, 0.045, 0.065, 0.045, '#ffc777'));
      } else {
        // Timber scaffold grows with construction stages 1–3.
        for (const tx of [-0.57, 0.57]) {
          box(tx, 0.35, -0.28, 0.05, 0.7, 0.05, '#71543a');
          box(tx, 0.35, 0.2, 0.05, 0.7, 0.05, '#71543a');
          box(tx, 0.58, -0.04, 0.12, 0.04, 0.65, '#a78655');
        }
        for (let i = 0; i < stage; i++) box(-0.21 + i * 0.2, 0.15, 0, 0.15, 0.14, 0.19, lightStone);
      }
    }

    // One miniature per actual unit, up to the engine's stack limit of ten.
    for (let i = 0; i < Math.min(10, units); i++) {
      const fortified = castle || stage > 0;
      const ux = fortified ? (i % 5 - 2) * 0.24 : (i % 3 - 1) * 0.34;
      const uz = fortified ? 0.58 + Math.floor(i / 5) * 0.2 : -0.26 + Math.floor(i / 3) * 0.29;
      const s = fortified ? 0.7 : 1;
      const part = (shape: Shape, dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: string, rotation?: V3) =>
        add(shape, ux + dx * s, y * s, uz + dz * s, sx * s, sy * s, sz * s, color, rotation);
      part('box', -0.045, 0.07, 0, 0.06, 0.14, 0.085, '#343a35');
      part('box', 0.045, 0.07, 0, 0.06, 0.14, 0.085, '#343a35');
      part('box', 0, 0.23, 0, 0.17, 0.22, 0.12, heraldry);
      part('metal', 0, 0.3, 0.015, 0.18, 0.09, 0.13, '#aab6b2');
      part('rock', 0, 0.415, 0, 0.103, 0.12, 0.095, '#c0c9c5');
      part('box', 0, 0.415, 0.088, 0.125, 0.025, 0.016, '#26312f');
      part('shield', -0.105, 0.25, 0.09, 0.105, 0.14, 0.045, heraldry);
      part('metal', -0.105, 0.25, 0.135, 0.025, 0.16, 0.012, '#dac99d');
      part('trunk', 0.135, 0.35, 0, 0.012, 0.67, 0.012, '#9a7b4d');
      part('cone', 0.135, 0.73, 0, 0.035, 0.12, 0.035, '#ced5cb');
    }
    if (units > 0 && !castle && stage === 0) flag(-0.48, 0, -0.33, 1.02);
  });
  return scene;
}
