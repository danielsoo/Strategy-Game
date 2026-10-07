import type {DetailedCombatResult} from '../services/combatSystem';
import type {DuelSide} from './nativeDuel';

export const representativeCount=(troops:number)=>Math.min(3,Math.max(0,Math.floor(troops)));
export type Representative={id:number;side:DuelSide;slot:number;low:number;high:number};
export const representedCount=(a:Representative,count:number)=>Math.max(0,Math.min(count,a.high)-a.low);

/** Only the already resolved outcome constrains the film. Calculation rounds
 * are not animation beats, and cosmetic weapons never enter the resolver. */
export function nativeBattlePlan(result:DetailedCombatResult){
 const first=result.rounds[0],initial:[number,number]=first?[first.attackerUnits+first.attackerLosses,first.defenderUnits+first.defenderLosses]:[result.attackerSurvivors,result.defenderSurvivors];
 const final:[number,number]=[result.attackerSurvivors,result.defenderSurvivors],actors:Representative[]=[];
 for(const side of [0,1] as const){const n=representativeCount(initial[side]);for(let slot=0;slot<n;slot++)actors.push({id:actors.length,side,slot,low:Math.floor(slot*initial[side]/n),high:Math.floor((slot+1)*initial[side]/n)});}
 const fallen=actors.filter(a=>representedCount(a,final[a.side])===0).map(a=>a.id);
 return {actors,fallen,initial,final,outcome:result.outcome,reason:result.reason};
}
export type NativeBattlePlan=ReturnType<typeof nativeBattlePlan>;
