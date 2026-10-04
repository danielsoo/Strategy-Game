import type {DetailedCombatResult} from '../services/combatSystem';
import {WeaponKind,WEAPONS} from './battleWeapons';
export type FighterKind='knight'|'mercenary'|'bandit';
export const FIGHTER_NAMES:Record<FighterKind,string>={knight:'기사',mercenary:'용병',bandit:'도적'};
export const fighterKind=(neutral?:string):FighterKind=>neutral==='bandit'?'bandit':neutral==='mercenary'?'mercenary':'knight';
export type Defense='shield'|'parry'|'dodge'|'hit';
export type Combatant={id:number;side:0|1;kind:FighterKind;weapon?:WeaponKind;low:number;high:number;deathAt:number;heavyDeath?:boolean};
export type Exchange={at:number;attacker:number;target:number;defense:Defense;fatal:boolean;cut?:'diagonal'|'horizontal';move?:'cut'|'shove';counterOf?:number;heavy?:boolean};
export const COMBAT_PACE=1.35;
export const ATTACK_LEAD=.65/COMBAT_PACE,ATTACK_RECOVERY=.48/COMBAT_PACE;
export const attackLead=(e:Exchange)=>e.heavy?.9:ATTACK_LEAD;
export const HEAVY_RECOVERY=.64;
export const attackRecovery=(e:Exchange)=>e.heavy?HEAVY_RECOVERY:ATTACK_RECOVERY;
export const DODGE_COMMIT_LEAD=.45;
/** Heavy windup holds the coil longer, then accelerates into the same contact pose. */
export const attackPhase=(e:Exchange,time:number)=>{const dt=time-e.at,bind=e.defense==='shield'||e.defense==='parry'?.10:0;return e.heavy?(dt<-.18?-.243+(dt+.18)*(.407/.72):dt<0?dt*COMBAT_PACE:Math.max(0,dt-bind)*(.48/(HEAVY_RECOVERY-bind))):dt*COMBAT_PACE;};
export type ReplayStage={at:number;counts:[number,number];morale:[number,number];round:number};
export type BattleReplay={actors:Combatant[];exchanges:Exchange[];stages:ReplayStage[];initial:[number,number];final:[number,number];outcome:DetailedCombatResult['outcome'];reason:DetailedCombatResult['reason'];finish:number;duration:number};
const defense=(kind:FighterKind,n:number):Defense=>kind==='knight'?(n%5===3?'dodge':'shield'):kind==='bandit'?'dodge':n%3===2?'dodge':'parry';
// Local, reproducible choreography variation. This never consumes the combat RNG.
const choice=(n:number)=>{let x=Math.imul(n+17,0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b);return (x^(x>>>16))>>>0;};
/** Animation consumes the resolved log; it never rolls damage or modifies the game state. */
export function createBattleReplay(result:DetailedCombatResult,kinds:[FighterKind,FighterKind]=['knight','knight'],limit=10,weapons?:[WeaponKind[],WeaponKind[]]):BattleReplay{
 const first=result.rounds[0],initial:[number,number]=first?[first.attackerUnits+first.attackerLosses,first.defenderUnits+first.defenderLosses]:[result.attackerSurvivors,result.defenderSurvivors];
 const actors:Combatant[]=[],exchanges:Exchange[]=[],stages:ReplayStage[]=[{at:0,counts:initial,morale:[100,100],round:0}];
 for(const side of [0,1] as const){const count=Math.min(limit,initial[side]);for(let i=0;i<count;i++)actors.push({id:actors.length,side,kind:kinds[side],weapon:weapons?.[side][i%weapons[side].length]??'sword',low:Math.floor(i*initial[side]/count),high:Math.floor((i+1)*initial[side]/count),deathAt:Infinity});}
 const formationLane=(a:Combatant)=>{const side=actors.filter(b=>b.side===a.side);return side.indexOf(a)-(side.length-1)/2;};
 let start=1.8,serial=0;
 const addStage=(counts:[number,number],morale:[number,number],round:number)=>{
  const alive=actors.filter(a=>a.deathAt===Infinity),busy=new Map<number,number>();let end=start+2.6;
  // A visible actor may stand for several troops. Only exhausted groups die; HUD always reports exact counts.
  for(const victim of alive.filter(a=>counts[a.side]<=a.low).sort((a,b)=>b.id-a.id)){
   const enemies=alive.filter(a=>a.side!==victim.side);if(!enemies.length)continue;
   const killer=[...enemies].sort((a,b)=>(busy.get(a.id)??0)-(busy.get(b.id)??0)||Math.abs(formationLane(a)-formationLane(victim))-Math.abs(formationLane(b)-formationLane(victim))||a.id-b.id)[0];
   const wave=busy.get(killer.id)??0,at=start+2.18+wave*.92+(victim.id%3)*.045;
   busy.set(killer.id,wave+1);victim.deathAt=at+.10;victim.heavyDeath=wave===0;end=Math.max(end,at+.6);
   exchanges.push({at,attacker:killer.id,target:victim.id,defense:'hit',fatal:true,heavy:victim.heavyDeath,cut:'diagonal'});
  }
  // Initiative follows the previous encounter: a parry or sidestep opens a
  // counter, while a blocked cut can keep the attacker pressing. No two-hit turns.
  for(let beat=0;beat<3;beat++)for(const attacker of alive){
   const lane=alive.filter(a=>a.side===attacker.side).indexOf(attacker);
   const at=start+.42+beat*.87+(lane%3)*.045;
   if(at+ATTACK_RECOVERY>=attacker.deathAt)continue;
   const targets=alive.filter(a=>a.side!==attacker.side&&at+ATTACK_RECOVERY<a.deathAt);if(!targets.length)continue;
   const target=targets.sort((a,b)=>Math.abs(formationLane(a)-formationLane(attacker))-Math.abs(formationLane(b)-formationLane(attacker))||a.id-b.id)[0];
   const previous=exchanges.filter(e=>e.at<at&&!e.fatal&&((e.attacker===attacker.id&&e.target===target.id)||(e.attacker===target.id&&e.target===attacker.id))).sort((a,b)=>b.at-a.at)[0];
   const roll=choice(round*97+beat*23+Math.min(attacker.id,target.id)*13);
   const next=previous?(previous.defense==='parry'||previous.defense==='dodge'?previous.target:previous.move==='shove'?previous.attacker:roll%4===0?previous.target:previous.attacker):undefined;
   if(previous?attacker.id!==next:attacker.side!==lane%2)continue;
   // A single sword cannot attack and parry two different blows at once.
   const clashes=(id:number,lead=ATTACK_LEAD)=>exchanges.some(e=>(e.attacker===id||e.target===id)&&at-lead<e.at+ATTACK_RECOVERY&&at+ATTACK_RECOVERY>e.at-attackLead(e));
   if(clashes(attacker.id))continue;
   const occupied=clashes(target.id);
   const counter=previous&&(previous.defense==='parry'||previous.defense==='dodge')&&previous.target===attacker.id;
   const shove=!occupied&&previous!==undefined&&roll%4===1;
   const heavy=!shove&&!occupied&&(previous===undefined||roll%7===0)&&!clashes(attacker.id,.9)&&!clashes(target.id,.9);
   exchanges.push({at,attacker:attacker.id,target:target.id,defense:occupied||shove?'hit':defense(target.kind,serial++),fatal:false,move:shove?'shove':'cut',counterOf:counter?previous.at:undefined,heavy,cut:heavy?'diagonal':roll%2?'horizontal':'diagonal'});
  }
  stages.push({at:end,counts,morale,round});start=end+.06;
 };
 result.rounds.forEach(r=>addStage([r.attackerUnits,r.defenderUnits],[r.attackerMorale,r.defenderMorale],r.round));
 const final:[number,number]=[result.attackerSurvivors,result.defenderSurvivors],last=stages[stages.length-1];
 // Rout losses happen after the final combat round and must also appear in the replay.
 if(last.counts.some((n,i)=>n!==final[i]))addStage(final,[result.attackerMorale,result.defenderMorale],last.round+1);
 // Reserve time for absorbing/redirecting a heavy. Simultaneous blows share the
 // same pause, and all stage/casualty clocks follow the monotonic time mapping.
 const holds:number[]=[];for(const e of [...exchanges].filter(e=>e.heavy).sort((a,b)=>a.at-b.at)){const at=e.at+ATTACK_RECOVERY;if(!holds.length||at-holds[holds.length-1]>.2)holds.push(at);}
 const retime=(t:number)=>t+holds.filter(at=>at<t).length*(HEAVY_RECOVERY-ATTACK_RECOVERY);
 for(const e of exchanges){const old=e.at;e.at=retime(old);if(e.counterOf!==undefined)e.counterOf=retime(e.counterOf);if(e.fatal)actors[e.target].deathAt=e.at+.10;}
 stages.forEach(s=>s.at=retime(s.at));
 for(const e of exchanges){const target=actors[e.target];if(e.defense==='shield'&&WEAPONS[target.weapon??'sword'].twoHanded)e.defense='parry';if(e.defense==='parry'&&target.weapon==='flail')e.defense='dodge';}
 const finish=retime(start),deathEnd=Math.max(0,...actors.filter(a=>Number.isFinite(a.deathAt)).map(a=>a.deathAt+7.1));
 return {actors,exchanges:exchanges.sort((a,b)=>a.at-b.at||a.attacker-b.attacker),stages,initial,final,outcome:result.outcome,reason:result.reason,finish,duration:Math.max(finish+2.8,deathEnd)};
}
export function replayStage(plan:BattleReplay,time:number){let stage=plan.stages[0];for(const s of plan.stages){if(s.at>time)break;stage=s;}return stage;}
export function representedTroops(actor:Combatant,count:number){return Math.max(0,Math.min(actor.high,count)-actor.low);}
export const battleReplayDuration=(result:DetailedCombatResult)=>createBattleReplay(result).duration;

type Position={x:number;z:number;yaw:number;moving:number};
export type BattleFrame={positions:Position[];actions:({exchange:Exchange;role:'attack'|'defend'}|null)[]};
const smooth=(v:number)=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
/** Deterministic crowd navigation, sampled at 30 Hz and interpolated when rendered. */
export function bakeBattleMovement(plan:BattleReplay){
 const fps=30,frames:BattleFrame[]=[],positions=plan.actors.map(a=>{const row=plan.actors.filter(b=>b.side===a.side).indexOf(a),n=plan.actors.filter(b=>b.side===a.side).length;return {x:a.side===0?-3.1:3.1,z:(row-(n-1)/2)*1.9,yaw:a.side===0?Math.PI/2:-Math.PI/2,moving:0};});
 const commitments=new Map<Exchange,{attacker:Position;defender:Position;sideX:number;sideZ:number}>();
 for(let tick=0;tick<=Math.ceil(plan.duration*fps);tick++){
  const time=tick/fps,alive=plan.actors.filter(a=>time<a.deathAt),actions:BattleFrame['actions']=plan.actors.map(()=>null);
  for(const e of plan.exchanges){if(time<e.at-attackLead(e)||time>e.at+attackRecovery(e))continue;
   if(time<plan.actors[e.attacker].deathAt)actions[e.attacker]={exchange:e,role:'attack'};
   if(time<plan.actors[e.target].deathAt&&(!actions[e.target]||e.fatal))actions[e.target]={exchange:e,role:'defend'};
  }
  const assignments=new Map<number,number[]>(),targets=new Map<number,number>();
  for(const a of alive){
   const opponents=alive.filter(b=>b.side!==a.side);if(!opponents.length)continue;
   const action=actions[a.id],upcoming=plan.exchanges.find(e=>e.at>=time&&e.at-time<1.8&&(e.attacker===a.id||e.target===a.id)),target=action?(action.role==='attack'?action.exchange.target:action.exchange.attacker):upcoming?(upcoming.attacker===a.id?upcoming.target:upcoming.attacker):opponents.reduce((best,b)=>Math.hypot(positions[b.id].x-positions[a.id].x,positions[b.id].z-positions[a.id].z)<Math.hypot(positions[best.id].x-positions[a.id].x,positions[best.id].z-positions[a.id].z)?b:best).id;
   targets.set(a.id,target);const group=assignments.get(target)??[];group.push(a.id);assignments.set(target,group);
  }
  const old=positions.map(p=>({...p}));
  const planted=new Set<number>();
  for(const e of plan.exchanges){
   if(e.defense!=='dodge'||time<e.at-DODGE_COMMIT_LEAD||time>e.at+attackRecovery(e)||actions[e.attacker]?.exchange!==e)continue;
   planted.add(e.attacker);
   if(!commitments.has(e)){const a=old[e.attacker],d=old[e.target],dx=d.x-a.x,dz=d.z-a.z,n=Math.hypot(dx,dz)||1;commitments.set(e,{attacker:{...a},defender:{...d},sideX:-dz/n,sideZ:dx/n});}
  }
  for(const a of alive){const p=positions[a.id],target=targets.get(a.id);p.moving*=.8;
   if(time>plan.finish){const retreat=plan.outcome==='stalemate'||(plan.outcome==='attacker-win'?a.side===1:a.side===0);if(retreat){p.x+=(a.side===0?-1:1)*1.35/fps;const wanted=a.side===0?-Math.PI/2:Math.PI/2;p.yaw+=Math.max(-.08,Math.min(.08,Math.atan2(Math.sin(wanted-p.yaw),Math.cos(wanted-p.yaw))));p.moving+=.2;}continue;}
   if(target===undefined)continue;
   const enemy=old[target],partners=assignments.get(target)!,slot=partners.indexOf(a.id),angle=(a.side===0?-Math.PI/2:Math.PI/2)+(slot===0?0:(slot%2?1:-1)*Math.ceil(slot/2)*1.10);
   const own=alive.filter(b=>b.side===a.side).length,other=alive.length-own;
   const mobile=own>=other||actions[a.id]?.role==='attack';
   const reach=WEAPONS[a.weapon??'sword'].reach;
   let gx=mobile?enemy.x+Math.sin(angle)*reach:p.x,gz=mobile?enemy.z+Math.cos(angle)*reach:p.z;
   const action=actions[a.id];if(action?.exchange.move==='shove'){
    const dt=time-action.exchange.at,awayX=p.x-enemy.x,awayZ=p.z-enemy.z,n=Math.hypot(awayX,awayZ)||1;
    if(action.role==='attack'){gx=enemy.x+awayX/n*1.02;gz=enemy.z+awayZ/n*1.02;}
    else {const push=smooth(dt/.20)*(1-smooth((dt-.20)/.30));gx=p.x+awayX/n*.9*push;gz=p.z+awayZ/n*.9*push;}
   }
   if(action?.role==='attack'&&action.exchange.heavy&&action.exchange.defense==='parry'){
    const dt=time-action.exchange.at-.10,w=smooth(dt/.18)*(1-smooth((dt-.25)/.29)),dx=p.x-enemy.x,dz=p.z-enemy.z,n=Math.hypot(dx,dz)||1;gx+=dx/n*.65*w;gz+=dz/n*.65*w;
   }
   if(action?.role==='defend'&&action.exchange.heavy&&(action.exchange.defense==='shield'||action.exchange.defense==='parry')){
    const dt=time-action.exchange.at-.10,dx=p.x-enemy.x,dz=p.z-enemy.z,n=Math.hypot(dx,dz)||1,absorb=smooth(dt/.12)*(1-smooth((dt-.12)/.22)),answer=smooth((dt-.12)/.20)*(1-smooth((dt-.34)/.20));
    gx+=dx/n*.42*absorb;gz+=dz/n*.42*absorb;
    if(action.exchange.defense==='parry'){gx-=dz/n*.45*answer;gz+=dx/n*.45*answer;}else {gx-=dx/n*.30*answer;gz-=dz/n*.30*answer;}
   }
   if(action?.role==='defend'&&action.exchange.defense==='dodge'){
    const mark=commitments.get(action.exchange),w=smooth((time-(action.exchange.at-DODGE_COMMIT_LEAD))/.4)*(1-smooth((time-action.exchange.at-.1)/.38));
    if(mark){gx=mark.defender.x+mark.sideX*.95*w;gz=mark.defender.z+mark.sideZ*.95*w;}
   }
   const mark=action&&planted.has(a.id)?commitments.get(action.exchange):undefined;
   if(mark){gx=mark.attacker.x;gz=mark.attacker.z;p.yaw=mark.attacker.yaw;}
   const dx=gx-p.x,dz=gz-p.z,d=Math.hypot(dx,dz),speed=a.kind==='knight'?1.45:1.85,step=Math.min(d,speed/fps);
   if(d>.035){p.x+=dx/d*step;p.z+=dz/d*step;if(step>.012)p.moving+=.2;}
   const wanted=Math.atan2(enemy.x-p.x,enemy.z-p.z),delta=Math.atan2(Math.sin(wanted-p.yaw),Math.cos(wanted-p.yaw));
   if(!mark)p.yaw+=Math.max(-.16,Math.min(.16,delta));
  }
  // Body clearance includes friendly troops and fallen bodies until dissolution.
  for(let pass=0;pass<3;pass++)for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
   const a=plan.actors[i],b=plan.actors[j];if(time>a.deathAt+4.8||time>b.deathAt+4.8)continue;
   const p=positions[i],q=positions[j],dx=p.x-q.x,dz=p.z-q.z,d=Math.hypot(dx,dz),min=.90;if(d>=min)continue;
   const nx=d>1e-6?dx/d:1,nz=d>1e-6?dz/d:0,ma=time<a.deathAt&&!planted.has(i),mb=time<b.deathAt&&!planted.has(j),amount=(min-d)/(Number(ma)+Number(mb)||1);
   if(ma){p.x+=nx*amount;p.z+=nz*amount;}if(mb){q.x-=nx*amount;q.z-=nz*amount;}
  }
  frames.push({positions:positions.map(p=>({...p})),actions});
 }
 return {sample:(time:number):BattleFrame=>{const t=Math.max(0,Math.min(frames.length-1,time*fps)),i=Math.floor(t),a=frames[i],b=frames[Math.min(i+1,frames.length-1)];return {actions:a.actions,positions:a.positions.map((p,k)=>({...p,x:p.x+(b.positions[k].x-p.x)*(t-i),z:p.z+(b.positions[k].z-p.z)*(t-i),yaw:p.yaw+Math.atan2(Math.sin(b.positions[k].yaw-p.yaw),Math.cos(b.positions[k].yaw-p.yaw))*(t-i)}))};}};
}
