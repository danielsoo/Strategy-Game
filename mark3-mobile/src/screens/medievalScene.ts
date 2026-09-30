import * as THREE from 'three';
import { terrainField } from './campaignTerrain';
import { Cell, GameState, isExplored, isVisible, knownCell, NEUTRAL_COLOR, Terrain } from '../engine';

export type V3 = [number, number, number];
export type Shape = 'box' | 'stone' | 'tower' | 'roof' | 'metal' | 'cone' | 'trunk' | 'rock' | 'flag' | 'shield' | 'foliage' | 'plaster' | 'timber' | 'body' | 'limb' | 'helmet';
export interface Piece { position: V3; scale: V3; color: string; rotation?: V3 }
export interface Ground extends Piece { cell: Cell; height: number; seen: boolean; known: boolean; terrain: Terrain; castle: boolean; owner: number | null; heraldry: string }
export interface Mist { position: V3; memory: boolean }
export interface MedievalScene {
  ground: Ground[];
  pieces: Record<Shape, Piece[]>;
  mist: Mist[];
  span: number;
}

const HEIGHT: Record<Terrain, number> = { plain: 0.24, forest: 0.3, mountain: 0.5, desert: 0.26 };
const EARTH: Record<Terrain, string> = {
  plain: '#62694a', forest: '#344c39', mountain: '#747569', desert: '#ad976e',
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
    ground: [], pieces: { box: [], stone: [], tower: [], roof: [], metal: [], cone: [], trunk: [], rock: [], flag: [], shield: [], foliage: [], plaster: [], timber: [], body: [], limb: [], helmet: [] },
    mist: [], span: Math.max(maxX - minX, maxZ - minZ) + 2.5,
  };

  cells.forEach((cell, index) => {
    const seen = watching || isVisible(state, player, cell);
    const known = seen || isExplored(state, player, cell);
    const memory = known && !seen ? knownCell(state, player, cell) : null;
    const terrain = seen ? cell.terrain : memory?.terrain ?? 'plain';
    const castle = seen ? cell.castle : memory?.castle ?? false;
    const owner = seen ? cell.owner : memory?.owner ?? null;
    const [wx, wz] = points[index];
    const x = wx - ox, z = wz - oz, h = known ? HEIGHT[terrain] : 0.16;
    const heraldry = seen && cell.neutral ? NEUTRAL_COLOR[cell.neutral] : owner !== null ? state.nations[owner].color : '#bbad87';
    const tint = (color: string) => seen ? color : '#' + new THREE.Color(color).lerp(new THREE.Color('#26363d'), 0.68).getHexString();
    scene.ground.push({ cell, position: [x, h / 2, z], scale: [0.975, h, 0.975],
      terrain, castle, owner, heraldry, color: known ? tint('#'+new THREE.Color(EARTH[terrain]).multiplyScalar(.91+random(index)*.16).getHexString()) : '#202f36', height: h, seen, known });
  });
  const field=terrainField(scene.ground);
  scene.ground.forEach((g,index)=>{
    const cell=g.cell,seen=g.seen,known=g.known,terrain=g.terrain,castle=g.castle,owner=g.owner,heraldry=g.heraldry;
    const stage=seen?cell.fortStage:(knownCell(state,player,cell)?.fortStage??0), units=seen?cell.units:0;
    const x=g.position[0],z=g.position[2],h=field.height(x,z);
    g.height=h;g.position[1]=h;
    if(!seen) scene.mist.push({position:[x,h+.24,z],memory:known});
    const tint=(color:string)=>seen?color:'#'+new THREE.Color(color).lerp(new THREE.Color('#26363d'),.68).getHexString();
    if (!known) return;

    const add = (shape: Shape, px: number, py: number, pz: number, sx: number, sy: number, sz: number, color: string, rotation?: V3) => {
      scene.pieces[shape].push({ position: [x + px, field.height(x+px,z+pz) + py, z + pz], scale: [sx, sy, sz], color: tint(color), rotation });
    };
    const box = (px: number, py: number, pz: number, sx: number, sy: number, sz: number, color: string) => add('box', px, py, pz, sx, sy, sz, color);
    const flag = (px: number, base: number, pz: number, height: number) => {
      add('trunk', px, base + height / 2, pz, 0.008, height, 0.008, '#b8a17a');
      add('flag', px + 0.11, base + height - 0.10, pz, 0.22, 0.145, 1, heraldry);
      add('cone', px, base + height + 0.02, pz, 0.02, 0.05, 0.02, '#c4b18c');
    };

    const occupied = castle || stage > 0 || units > 0;
    // 수목과 암벽은 RealmModels의 실제 자산으로 그린다.
    if (seen && cell.hasRoad) box(0, 0.014, 0, 0.23, 0.025, 1.65, '#b4a17a');

    // 수확한 밭·낮은 돌담·목골 가옥으로 성 밖에도 시대감을 준다. 미탐험 정보는 쓰지 않는다.
    if (!occupied && terrain === 'plain' && random(index*43) > .55) {
      for(let i=0;i<5;i++) box(-.3+i*.13,.02,.08,.065,.025,.65,i%2?'#8f7c50':'#766846');
      for(let i=0;i<5;i++) add('rock',-.4+i*.18,.06,-.36,.12,.10,.08,'#8b8a75');
      add('plaster',.38,.15,.28,.27,.3,.33,'#e9e3d5');
      add('roof',.38,.4,.28,.23,.25,.27,'#635044');
      box(.38,.16,.455,.035,.28,.015,'#483f2f');
      box(.38,.21,.455,.27,.028,.015,'#483f2f');
    }

    if (!castle && stage > 0) {
      const complete = castle || stage === 4;
      const stone = '#8d9080', lightStone = '#b6b39a';
      box(0, 0.055, -0.07, 1.14, 0.11, 1.0, '#77786d');
      const wallH = complete ? 0.32 : 0.09 * stage;
      // Three walls and a split front wall leave a real gateway.
      box(-0.47, wallH / 2 + 0.1, -0.07, 0.13, wallH, 0.9, stone);
      box(0.47, wallH / 2 + 0.1, -0.07, 0.13, wallH, 0.9, stone);
      box(0, wallH / 2 + 0.1, -0.48, 0.95, wallH, 0.13, stone);
      [-1, 1].forEach(side => box(side * 0.35, wallH / 2 + 0.1, 0.35, 0.3, wallH, 0.13, stone));
      if (complete) {
        for (const tx of [-0.47, 0.47]) for (const tz of [-0.46, 0.34]) {
          add('tower', tx, 0.32, tz, 0.14, 0.54, 0.14, lightStone);
          for (const bx of [-0.09, 0.09]) for (const bz of [-0.09, 0.09])
            box(tx + bx, 0.63, tz + bz, 0.07, 0.1, 0.07, stone);
          box(tx, 0.42, tz + 0.145, 0.045, 0.16, 0.012, '#323b38');
        }
        for (let i = 0; i < 5; i++) {
          box(-0.4 + i * 0.2, 0.47, -0.48, 0.1, 0.12, 0.14, lightStone);
          if (i !== 2) box(-0.4 + i * 0.2, 0.47, 0.35, 0.1, 0.12, 0.14, lightStone);
        }
        box(0, 0.22, 0.36, 0.22, 0.32, 0.07, '#57452f');
        box(0, 0.41, 0.39, 0.29, 0.11, 0.11, lightStone);
        // 성문의 철창과 부벽. 개별 조명 대신 기존 인스턴스로 그려 모바일 부담을 줄인다.
        for(const gx of [-.075,0,.075]) box(gx,.24,.405,.018,.28,.015,'#292e29');
        for(const side of [-1,1]) for(const zz of [-.25,.12])
          box(side*.55,.25,zz,.10,.4,.14,'#787e6e');
        if (castle) {
          add('stone', -.12, 0.45, -.18, .29, .75, .27, '#a9a58e');
          add('roof', -.12, .95, -.18, .25, .26, .24, '#394a48');
          box(-.12, .61, -.037, .045, .14, .012, '#384642');
          flag(-.12, 1.08, -.18, .38);
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

    // 성은 단일 탑이 아니라 성 안팎의 작은 시가지로 읽히게 한다.
    if(castle){
      // 내성의 주탑·접견동·예배당은 외벽보다 높고 좁은 비례로 세운다.
      add('stone',-.16,.36,-.22,.32,.72,.32,'#ddd8c8');
      add('roof',-.16,.83,-.22,.27,.27,.27,'#b6c0c3');
      add('plaster',.13,.19,-.23,.30,.38,.25,'#e8dfcc');
      add('roof',.13,.50,-.23,.27,.28,.23,'#b0b9bc');
      add('stone',.32,.23,.10,.15,.46,.23,'#ded9cb');
      add('roof',.32,.58,.10,.14,.26,.20,'#a2adb3');
      for(const y of [.24,.47,.66])for(const dx of [-.235,-.09])box(dx,y,-.053,.035,.075,.012,'#263337');
      flag(-.16,.97,-.22,.30);
    }
    if(castle)for(let i=0;i<34;i++){
      const a=i*2.399,r=i<13?.17+random(index*43+i)*.22:.70+random(index*41+i)*.18;
      const px=Math.cos(a)*r,pz=Math.sin(a)*r;
      if(Math.abs(px)<.15&&pz>.2||i<13&&pz<-.08)continue;
      const hh=.13+random(index*11+i)*.08;
      add('plaster',px,hh/2,pz,.13,hh,.17,i%2?'#e5ddc8':'#d5cfbc');
      add('roof',px,hh+.065,pz,.12,.13,.15,i%3?'#b3a398':'#aab8c0');
      for(const dx of [-.057,0,.057])add('timber',px+dx,hh*.5,pz+.087,.009,hh,.008,'#756653');
      for(const yy of [.04,hh*.55,hh])add('timber',px,yy,pz+.088,.13,.008,.008,'#756653');
      box(px-.025,hh*.68,pz+.092,.026,.035,.008,'#222b29');
      box(px+.026,.033,pz+.09,.026,.065,.009,'#4b3d2e');
      if(i%3===0)add('stone',px+.04,hh+.12,pz-.04,.024,.15,.025,'#bcb5a0');
    }

    // 한 병력 표시는 소규모 대열로 그린다. 숫자와 실제 규칙의 병력은 바꾸지 않는다.

    for (let i = 0; i < Math.min(10, units)*3; i++) {
      const fortified = castle || stage > 0;
      const ux = (i % 6 - 2.5) * .105;
      const uz = (fortified ? .56 : -.22) + Math.floor(i/6)*.13;
      const s = .34;
      const part = (shape: Shape, dx: number, y: number, dz: number, sx: number, sy: number, sz: number, color: string, rotation?: V3) =>
        add(shape, ux + dx * s, y * s, uz + dz * s, sx * s, sy * s, sz * s, color, rotation);
      part('limb', -0.037, 0.075, 0, 0.055, 0.15, 0.055, '#3c3c31');
      part('limb', 0.037, 0.075, 0, 0.055, 0.15, 0.055, '#3c3c31');
      part('body', 0, 0.245, 0, 0.155, 0.15, 0.105, '#71786f');
      part('box', 0, 0.23, .052, 0.09, 0.19, 0.016, heraldry);
      part('limb', -.094, .25, .015, .047,.18,.047,'#72786e',[0,0,-.25]);
      part('limb', .094, .25, .015, .047,.18,.047,'#72786e',[0,0,.25]);
      part('helmet', 0, 0.39, 0, 0.055, 0.065, 0.053, '#9da7a2');
      part('box', 0, 0.415, 0.052, 0.073, 0.014, 0.009, '#26312f');
      part('shield', -0.105, 0.25, 0.09, 0.105, 0.14, 0.045, heraldry);
      part('metal', -0.105, 0.25, 0.135, 0.025, 0.16, 0.012, '#dac99d');
      part('trunk', 0.135, 0.35, 0, 0.012, 0.67, 0.012, '#9a7b4d');
      part('cone', 0.135, 0.73, 0, 0.035, 0.12, 0.035, '#ced5cb');
    }
    if (units > 0 && !castle && stage === 0) flag(-.38, 0, -.3, .58);
  });
  return scene;
}
