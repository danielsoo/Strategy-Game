import type {Ground} from './medievalScene';

export const realmRandom=(n:number)=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
export type SettlementKind='citadel'|'abbey'|'march';
/** 소유권과 턴에 영향받지 않는 지역 건축 양식. 정복해도 도시가 다시 생성되지 않는다. */
export function settlementPlan(g:Ground){
  const seed=g.cell.row*113+g.cell.col*31;
  const kind: SettlementKind=(['citadel','abbey','march'] as const)[(g.cell.row+g.cell.col*2)%3];
  const yaw=(realmRandom(seed+13)-.5)*1.1;
  const outline: [number,number][]=kind==='citadel'
    ?[[-.56,.43],[.46,.43],[.65,.04],[.40,-.58],[-.27,-.66],[-.64,-.22]]
    :kind==='abbey'?[[-.59,.50],[.55,.50],[.55,-.47],[-.59,-.47]]
    :[[-.38,.57],[.42,.57],[.55,-.27],[.18,-.67],[-.45,-.42]];
  return {kind,seed,yaw,outline,wallHeight:kind==='citadel'?.24:kind==='abbey'?.19:.16,
    roof:kind==='citadel'?'#838f96':kind==='abbey'?'#a18a76':'#817968',
    stone:kind==='citadel'?'#d2cbb8':kind==='abbey'?'#c9c2af':'#aaa58f'};
}

export type ArmyKind='guard'|'pike'|'archer'|'rider';
// Campaign pieces are readable representatives, not a literal head count.
// Full army strength stays on the standard; battle actors use their own scale.
export const MAP_SOLDIER_SCALE=.30;
export const MAP_STANDARD_HEIGHT=1.12;
export function armyHeading(g:Ground){
  const previous=g.cell.lastFrom?.split(',').map(Number);
  if(previous?.length===2&&previous.every(Number.isFinite)){
    const [row,col]=previous,dx=Math.sqrt(3)*(g.cell.col+(g.cell.row%2)*.5-col-(row%2)*.5),dz=(g.cell.row-row)*1.5;
    if(Math.hypot(dx,dz)>0)return Math.atan2(dx,dz);
  }
  return 0;
}
export function armyAnchor(g:Ground):[number,number]{
  // Keep stationed troops outside the castle mesh; field formations occupy
  // the tile centre. The march renderer connects these berths continuously.
  return [g.position[0],g.position[2]+(g.castle||g.cell.fortStage>0?1.02:0)];
}
export function armyFormation(g:Ground){
  if(!g.seen||g.cell.units<=0)return [];
  // Appearance belongs to the army, not its tile: arriving must not reshuffle
  // ranks, resize soldiers or rotate the whole formation at the final frame.
  const seed=(g.owner??9)*31+(g.cell.neutral==='bandit'?113:g.cell.neutral==='mercenary'?71:0);
  const count=Math.min(3,g.cell.units);
  const yaw=armyHeading(g),anchor=armyAnchor(g);
  const slots=Array.from({length:count},(_,i)=>{
    const kind:ArmyKind=i===0?'guard':i===1?'pike':g.cell.units>=4?'rider':'archer';
    // A compact triangle leaves room for shields, spears and a mounted leader
    // while keeping every formation centred inside the hex as it turns.
    const x=count===2?(i-.5)*.48:count===3?[0,-.36,.36][i]:0;
    const z=count===3?(i===0?.28:-.14):0;
    return {kind,x:x*Math.cos(yaw)+z*Math.sin(yaw),z:-x*Math.sin(yaw)+z*Math.cos(yaw),
      yaw:yaw+(realmRandom(seed+i*5)-.5)*.16,scale:MAP_SOLDIER_SCALE+realmRandom(seed+i*11)*.015};
  });
  const cx=slots.reduce((sum,p)=>sum+p.x,0)/count,cz=slots.reduce((sum,p)=>sum+p.z,0)/count;
  return slots.map((p,index)=>({...p,index,x:p.x-cx+anchor[0]-g.position[0],z:p.z-cz+anchor[1]-g.position[2]}));
}
