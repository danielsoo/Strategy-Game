import type {DetailedCombatResult} from '../services/combatSystem';
import type {DuelEvent,DuelSide} from './nativeDuel';

export const representativeCount=(troops:number)=>Math.min(3,Math.max(0,Math.floor(troops)));
export type Representative={id:number;side:DuelSide;slot:number;low:number;high:number};
export type RecordedExchange={attacker:number;target:number;event:DuelEvent;delay:number};
export type RecordedRound={round:number;counts:[number,number];morale:[number,number];exchanges:RecordedExchange[];fallen:number[]};
const hash=(n:number)=>{let x=Math.imul(n+37,0x45d9f3b);return (x^(x>>>16))>>>0;};
export const representedCount=(a:Representative,count:number)=>Math.max(0,Math.min(count,a.high)-a.low);

/** Pure presentation adapter. Never calls the combat resolver or its RNG.
 * A representative dies only when its entire slice of the recorded army is lost. */
export function nativeBattlePlan(result:DetailedCombatResult){
 const first=result.rounds[0],initial:[number,number]=first?[first.attackerUnits+first.attackerLosses,first.defenderUnits+first.defenderLosses]:[result.attackerSurvivors,result.defenderSurvivors];
 const final:[number,number]=[result.attackerSurvivors,result.defenderSurvivors],actors:Representative[]=[],rounds:RecordedRound[]=[];
 for(const side of [0,1] as const){const n=representativeCount(initial[side]);for(let slot=0;slot<n;slot++)actors.push({id:actors.length,side,slot,low:Math.floor(slot*initial[side]/n),high:Math.floor((slot+1)*initial[side]/n)});}
 let previous=initial;
 const append=(counts:[number,number],morale:[number,number],round:number)=>{
  const alive=actors.filter(a=>representedCount(a,previous[a.side])>0),exchanges:RecordedExchange[]=[],pairs=new Set<string>();
  const fallen=alive.filter(a=>representedCount(a,counts[a.side])===0).map(a=>a.id),changed=counts.some((c,i)=>c!==previous[i]);
  for(const a of round===1||changed?alive:[]){
   const enemies=alive.filter(b=>b.side!==a.side).sort((b,c)=>Math.abs(b.slot-a.slot)-Math.abs(c.slot-a.slot)||b.id-c.id);
   const b=enemies[0];if(!b)continue;
   const pair=[a.id,b.id].sort((x,y)=>x-y).join(':');if(pairs.has(pair))continue;pairs.add(pair);
   const roll=hash(round*71+a.id*19+initial[0]*3+initial[1]),side=((round+a.slot)%2) as DuelSide;
   let A=a.side===side?a:b,D=A===a?b:a;
   const lossOf=(actor:Representative)=>representedCount(actor,previous[actor.side])-representedCount(actor,counts[actor.side]);
   if(round!==1&&lossOf(D)===0){if(lossOf(A)>0)[A,D]=[D,A];else continue;}
   if(fallen.includes(D.id))continue; // The recorded fatal exchange below covers this loss.
   const loss=lossOf(D);
   exchanges.push({attacker:A.id,target:D.id,event:{attacker:A.side,outcome:loss>0?'hit':'block',heavy:roll%3===0,variation:roll%3},delay:(roll%7)*.11});
   // Some fighters press a second cut; others recover while their neighbours
   // trade initiative. Variation changes native clips, not just start offsets.
   if(round===1&&roll%4===0){const counter=roll%2===0,B=counter?D:A,E=counter?A:D;
    exchanges.push({attacker:B.id,target:E.id,event:{attacker:B.side,outcome:'block',heavy:roll%4===1,variation:(roll+1)%3},delay:.25+(roll%5)*.13});}
  }
  rounds.push({round,counts:[...counts],morale:[...morale],exchanges,fallen});previous=counts;
 };
 for(const r of result.rounds)append([r.attackerUnits,r.defenderUnits],[r.attackerMorale,r.defenderMorale],r.round);
 if(previous.some((n,i)=>n!==final[i]))append(final,[result.attackerMorale,result.defenderMorale],rounds.at(-1)?.round??0);
 return {actors,rounds,initial,final,outcome:result.outcome,reason:result.reason};
}
export type NativeBattlePlan=ReturnType<typeof nativeBattlePlan>;
