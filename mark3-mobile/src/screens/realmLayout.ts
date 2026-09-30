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
export function armyFormation(g:Ground){
  if(!g.seen||g.cell.units<=0)return [];
  const seed=g.cell.row*113+g.cell.col*31,fortified=g.castle||g.cell.fortStage>0;
  const count=Math.min(48,Math.max(6,g.cell.units*5));
  const yaw=(realmRandom(seed+7)-.5)*.8;
  return Array.from({length:count},(_,i)=>{
    const row=Math.floor(i/8),col=i%8;
    const kind:ArmyKind=i===0&&g.cell.units>=4?'rider':row<2?(i%3===0?'pike':'guard'):i%2?'archer':'pike';
    const x=(col-3.5)*.057+(realmRandom(seed+i*3)-.5)*.008;
    const z=(fortified?.99:.22)-row*.07+(kind==='rider'?.06:0);
    return {kind,x:x*Math.cos(yaw)+z*Math.sin(yaw),z:-x*Math.sin(yaw)+z*Math.cos(yaw),
      yaw:yaw+(realmRandom(seed+i*5)-.5)*.16,scale:.031+realmRandom(seed+i*11)*.003};
  });
}
