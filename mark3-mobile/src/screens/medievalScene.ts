import * as THREE from 'three';
import { terrainField } from './campaignTerrain';
import { Cell, GameState, isExplored, isVisible, knownCell, NEUTRAL_COLOR, Terrain } from '../engine';

export type V3 = [number, number, number];
export type Shape = 'box' | 'stone' | 'tower' | 'roof' | 'metal' | 'cone' | 'trunk' | 'rock' | 'flag' | 'shield' | 'foliage';
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
    ground: [], pieces: { box: [], stone: [], tower: [], roof: [], metal: [], cone: [], trunk: [], rock: [], flag: [], shield: [], foliage: [] },
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
      add('trunk', px, base + height / 2, pz, 0.018, height, 0.018, '#d1b77c');
      add('flag', px + 0.18, base + height - 0.16, pz, 0.36, 0.24, 1, heraldry);
      add('cone', px, base + height + 0.035, pz, 0.045, 0.1, 0.045, '#d6b877');
    };

    const occupied = castle || stage > 0 || units > 0;
    // 작은 나무를 불규칙하게 겹쳐 숲의 수관을 만든다. 나무 모양은 매 턴 고정된다.
    const count=terrain==='forest'?(occupied?10:30):terrain==='plain'&&!occupied?3:0;
    for(let i=0;i<count;i++){
      const a=i*2.399+random(index)*2,r=occupied?.70:.15+random(index*17+i)*.68;
      const tx=Math.cos(a)*r,tz=occupied?-.48-Math.abs(Math.sin(a))*.23:Math.sin(a)*r;
      const size=.58+random(index*31+i)*.60;
      add('trunk',tx,.14*size,tz,.023,.28*size,.023,'#564c36');
      if(i%3===0){
        add('cone',tx,.34*size,tz,.14*size,.42*size,.14*size,'#31432a');
        add('cone',tx,.48*size,tz,.11*size,.32*size,.11*size,'#405130');
      }else{
        add('foliage',tx,.33*size,tz,.19*size,.24*size,.16*size,i%2?'#4c5b2e':'#667044');
        add('foliage',tx+.07,.43*size,tz-.025,.14*size,.17*size,.13*size,'#64713c');
      }
    }
    if(terrain==='mountain')for(let i=0;i<5;i++){
      const a=i*2.4, r=.45+random(index+i)*.34;
      add('rock',Math.cos(a)*r,.05,Math.sin(a)*r,.11,.12,.14,'#828273',[0,a,0]);
    }
    if (seen && cell.hasRoad) box(0, 0.014, 0, 0.23, 0.025, 1.65, '#b4a17a');

    // 수확한 밭·낮은 돌담·목골 가옥으로 성 밖에도 시대감을 준다. 미탐험 정보는 쓰지 않는다.
    if (!occupied && terrain === 'plain' && random(index*43) > .55) {
      for(let i=0;i<5;i++) box(-.3+i*.13,.02,.08,.065,.025,.65,i%2?'#8f7c50':'#766846');
      for(let i=0;i<5;i++) add('rock',-.4+i*.18,.06,-.36,.12,.10,.08,'#8b8a75');
      box(.38,.15,.28,.27,.3,.33,'#c0ae84');
      add('roof',.38,.4,.28,.23,.25,.27,'#635044');
      box(.38,.16,.455,.035,.28,.015,'#483f2f');
      box(.38,.21,.455,.27,.028,.015,'#483f2f');
    }

    if (castle || stage > 0) {
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
    if(castle)for(let i=0;i<17;i++){
      const a=i*2.399,r=i<5?.24:.58+random(index*41+i)*.17;
      const px=Math.cos(a)*r,pz=Math.sin(a)*r;
      if(Math.abs(px)<.15&&pz>.2)continue;
      const hh=.13+random(index*11+i)*.08;
      box(px,hh/2,pz,.15,hh,.18,i%2?'#b6a783':'#c2b89b');
      add('roof',px,hh+.065,pz,.14,.13,.16,i%3?'#695647':'#495751');
      box(px,hh*.53,pz+.092,.015,hh,.008,'#514535');
      box(px,hh*.65,pz+.094,.15,.013,.008,'#514535');
    }

    // 한 병력 표시는 소규모 대열로 그린다. 숫자와 실제 규칙의 병력은 바꾸지 않는다.

    for (let i = 0; i < Math.min(10, units)*3; i++) {
      const fortified = castle || stage > 0;
      const ux = (i % 6 - 2.5) * .105;
      const uz = (fortified ? .56 : -.22) + Math.floor(i/6)*.13;
      const s = .34;
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
    if (units > 0 && !castle && stage === 0) flag(-.38, 0, -.3, .58);
  });
  return scene;
}
