import type {BattleReplay,Exchange} from './battleReplay';
export type SpearTechnique='thrust'|'beat-riposte'|'disengage'|'high-low'|'sweep';
export type SpearGuard='beat'|'wind';
export const SPEAR_TECHNIQUES:Record<SpearTechnique,string>={thrust:'전진 찌르기','beat-riposte':'쳐내고 반격',disengage:'창끝 돌려 빼기','high-low':'상단 유인·하단 전환',sweep:'창날 가로 베기'};
export const SPEAR_GUARDS:Record<SpearGuard,string>={beat:'옆으로 쳐내기',wind:'감아 받아내기'};
/** Choreography follows the preceding exchange, never changes the resolved damage. */
export function assignSpearTechniques(actors:BattleReplay['actors'],exchanges:Exchange[]){
 const last=new Map<string,Exchange>(),uses=new Map<number,number>();
 for(const e of [...exchanges].sort((a,b)=>a.at-b.at)){
  const key=[e.attacker,e.target].sort((a,b)=>a-b).join(':'),previous=last.get(key);
  if(actors[e.attacker].weapon==='spear'&&e.move!=='shove'){
   const count=uses.get(e.attacker)??0;uses.set(e.attacker,count+1);
   e.spearTechnique=count===0?'thrust':previous?.attacker===e.target&&previous.defense==='parry'?'beat-riposte':
    previous?.attacker===e.attacker&&(previous.defense==='shield'||previous.defense==='parry')?'disengage':
    previous?.defense==='dodge'?(count%2?'high-low':'sweep'):count%2?'disengage':'high-low';
  }
  if(actors[e.target].weapon==='spear'&&e.defense==='parry')e.spearGuard=e.heavy||e.cut==='horizontal'?'wind':'beat';
  last.set(key,e);
 }
}
