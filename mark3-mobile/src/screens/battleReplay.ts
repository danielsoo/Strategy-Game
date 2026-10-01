import type {DetailedCombatResult} from '../services/combatSystem';
export type FighterKind='knight'|'mercenary'|'bandit';
export const FIGHTER_NAMES:Record<FighterKind,string>={knight:'기사',mercenary:'용병',bandit:'도적'};
export const fighterKind=(neutral?:string):FighterKind=>neutral==='bandit'?'bandit':neutral==='mercenary'?'mercenary':'knight';
export type Defense='shield'|'parry'|'dodge'|'hit';
export type Combatant={id:number;side:0|1;kind:FighterKind;low:number;high:number;deathAt:number};
export type Exchange={at:number;attacker:number;target:number;defense:Defense;fatal:boolean};
export type ReplayStage={at:number;counts:[number,number];morale:[number,number];round:number};
export type BattleReplay={actors:Combatant[];exchanges:Exchange[];stages:ReplayStage[];initial:[number,number];final:[number,number];outcome:DetailedCombatResult['outcome'];reason:DetailedCombatResult['reason'];finish:number;duration:number};
const defense=(kind:FighterKind,n:number):Defense=>kind==='knight'?'shield':kind==='bandit'?'dodge':n%4===3?'dodge':'parry';
/** Animation consumes the resolved log; it never rolls damage or modifies the game state. */
export function createBattleReplay(result:DetailedCombatResult,kinds:[FighterKind,FighterKind]=['knight','knight'],limit=10):BattleReplay{
 const first=result.rounds[0],initial:[number,number]=first?[first.attackerUnits+first.attackerLosses,first.defenderUnits+first.defenderLosses]:[result.attackerSurvivors,result.defenderSurvivors];
 const actors:Combatant[]=[],exchanges:Exchange[]=[],stages:ReplayStage[]=[{at:0,counts:initial,morale:[100,100],round:0}];
 for(const side of [0,1] as const){const count=Math.min(limit,initial[side]);for(let i=0;i<count;i++)actors.push({id:actors.length,side,kind:kinds[side],low:Math.floor(i*initial[side]/count),high:Math.floor((i+1)*initial[side]/count),deathAt:Infinity});}
 let start=1.8,serial=0;
 const addStage=(counts:[number,number],morale:[number,number],round:number)=>{
  const alive=actors.filter(a=>a.deathAt===Infinity),busy=new Map<number,number>();let end=start+1.7;
  // A visible actor may stand for several troops. Only exhausted groups die; HUD always reports exact counts.
  for(const victim of alive.filter(a=>counts[a.side]<=a.low).sort((a,b)=>b.id-a.id)){
   const enemies=alive.filter(a=>a.side!==victim.side);if(!enemies.length)continue;
   const lane=(a:Combatant)=>{const side=actors.filter(b=>b.side===a.side);return side.indexOf(a)-(side.length-1)/2;};
   const killer=[...enemies].sort((a,b)=>(busy.get(a.id)??0)-(busy.get(b.id)??0)||Math.abs(lane(a)-lane(victim))-Math.abs(lane(b)-lane(victim))||a.id-b.id)[0];
   const wave=busy.get(killer.id)??0,at=start+.7+wave*1.12+(victim.id%3)*.045;
   busy.set(killer.id,wave+1);victim.deathAt=at+.10;end=Math.max(end,at+.6);
   exchanges.push({at,attacker:killer.id,target:victim.id,defense:'hit',fatal:true});
  }
  const initiative=(round-1)%2;
  for(const attacker of alive){
   if(attacker.side!==initiative||busy.has(attacker.id)||attacker.deathAt<end)continue;
   const targets=alive.filter(a=>a.side!==attacker.side&&a.deathAt>end);if(!targets.length)continue;
   const lane=alive.filter(a=>a.side===attacker.side).indexOf(attacker),target=targets[lane%targets.length],at=start+.65+(attacker.id%3)*.23;
   // A defender reacts to one attack at a time. Other blades can arrive from the flanks.
   const occupied=busy.has(target.id)||exchanges.some(e=>e.target===target.id&&Math.abs(e.at-at)<.55);
   exchanges.push({at,attacker:attacker.id,target:target.id,defense:occupied?'hit':defense(target.kind,serial++),fatal:false});
  }
  stages.push({at:end,counts,morale,round});start=end+.28;
 };
 result.rounds.forEach(r=>addStage([r.attackerUnits,r.defenderUnits],[r.attackerMorale,r.defenderMorale],r.round));
 const final:[number,number]=[result.attackerSurvivors,result.defenderSurvivors],last=stages[stages.length-1];
 // Rout losses happen after the final combat round and must also appear in the replay.
 if(last.counts.some((n,i)=>n!==final[i]))addStage(final,[result.attackerMorale,result.defenderMorale],last.round+1);
 const finish=start,deathEnd=Math.max(0,...actors.filter(a=>Number.isFinite(a.deathAt)).map(a=>a.deathAt+7.1));
 return {actors,exchanges:exchanges.sort((a,b)=>a.at-b.at||a.attacker-b.attacker),stages,initial,final,outcome:result.outcome,reason:result.reason,finish,duration:Math.max(finish+2.8,deathEnd)};
}
export function replayStage(plan:BattleReplay,time:number){let stage=plan.stages[0];for(const s of plan.stages){if(s.at>time)break;stage=s;}return stage;}
export function representedTroops(actor:Combatant,count:number){return Math.max(0,Math.min(actor.high,count)-actor.low);}
export const battleReplayDuration=(result:DetailedCombatResult)=>createBattleReplay(result).duration;

type Position={x:number;z:number;yaw:number;moving:boolean};
export type BattleFrame={positions:Position[];actions:({exchange:Exchange;role:'attack'|'defend'}|null)[]};
const smooth=(v:number)=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
/** Deterministic crowd navigation, sampled at 30 Hz and interpolated when rendered. */
export function bakeBattleMovement(plan:BattleReplay){
 const fps=30,frames:BattleFrame[]=[],positions=plan.actors.map(a=>{const row=plan.actors.filter(b=>b.side===a.side).indexOf(a),n=plan.actors.filter(b=>b.side===a.side).length;return {x:a.side===0?-3.1:3.1,z:(row-(n-1)/2)*1.6,yaw:a.side===0?Math.PI/2:-Math.PI/2,moving:false};});
 for(let tick=0;tick<=Math.ceil(plan.duration*fps);tick++){
  const time=tick/fps,alive=plan.actors.filter(a=>time<a.deathAt),actions:BattleFrame['actions']=plan.actors.map(()=>null);
  for(const e of plan.exchanges){if(time<e.at-.65||time>e.at+.48)continue;
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
  for(const a of alive){const p=positions[a.id],target=targets.get(a.id);p.moving=false;
   if(time>plan.finish){const retreat=plan.outcome==='stalemate'||(plan.outcome==='attacker-win'?a.side===1:a.side===0);if(retreat){p.x+=(a.side===0?-1:1)*1.35/fps;p.yaw=a.side===0?-Math.PI/2:Math.PI/2;p.moving=true;}continue;}
   if(target===undefined)continue;
   const enemy=old[target],partners=assignments.get(target)!,slot=partners.indexOf(a.id),angle=(a.side===0?-Math.PI/2:Math.PI/2)+(slot===0?0:(slot%2?1:-1)*Math.ceil(slot/2)*.85);
   const own=alive.filter(b=>b.side===a.side).length,other=alive.length-own;
   const mobile=own>=other||actions[a.id]?.role==='attack';
   let gx=mobile?enemy.x+Math.sin(angle)*1.58:p.x,gz=mobile?enemy.z+Math.cos(angle)*1.58:p.z;
   const action=actions[a.id];if(action?.role==='defend'&&action.exchange.defense==='dodge'){
    const w=smooth((time-(action.exchange.at-.45))/.4)*(1-smooth((time-action.exchange.at-.1)/.38));gx+=Math.cos(angle)*.85*w;gz-=Math.sin(angle)*.85*w;
   }
   const dx=gx-p.x,dz=gz-p.z,d=Math.hypot(dx,dz),speed=a.kind==='knight'?1.45:1.85,step=Math.min(d,speed/fps);
   if(d>.035){p.x+=dx/d*step;p.z+=dz/d*step;p.moving=step>.012;}
   const wanted=Math.atan2(enemy.x-p.x,enemy.z-p.z),delta=Math.atan2(Math.sin(wanted-p.yaw),Math.cos(wanted-p.yaw));p.yaw+=Math.max(-.16,Math.min(.16,delta));
  }
  // Body clearance includes friendly troops and fallen bodies until dissolution.
  for(let pass=0;pass<3;pass++)for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
   const a=plan.actors[i],b=plan.actors[j];if(time>a.deathAt+4.8||time>b.deathAt+4.8)continue;
   const p=positions[i],q=positions[j],dx=p.x-q.x,dz=p.z-q.z,d=Math.hypot(dx,dz),min=.90;if(d>=min)continue;
   const nx=d>1e-6?dx/d:1,nz=d>1e-6?dz/d:0,ma=time<a.deathAt,mb=time<b.deathAt,amount=(min-d)/(Number(ma)+Number(mb)||1);
   if(ma){p.x+=nx*amount;p.z+=nz*amount;}if(mb){q.x-=nx*amount;q.z-=nz*amount;}
  }
  frames.push({positions:positions.map(p=>({...p})),actions});
 }
 return {sample:(time:number):BattleFrame=>{const t=Math.max(0,Math.min(frames.length-1,time*fps)),i=Math.floor(t),a=frames[i],b=frames[Math.min(i+1,frames.length-1)];return {actions:a.actions,positions:a.positions.map((p,k)=>({...p,x:p.x+(b.positions[k].x-p.x)*(t-i),z:p.z+(b.positions[k].z-p.z)*(t-i),yaw:p.yaw+Math.atan2(Math.sin(b.positions[k].yaw-p.yaw),Math.cos(b.positions[k].yaw-p.yaw))*(t-i)}))};}};
}
