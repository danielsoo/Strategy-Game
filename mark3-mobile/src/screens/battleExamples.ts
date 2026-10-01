import {resolveCombat,makeRng,DEFAULT_COMBAT_CONFIG} from '../services/combatSystem';
import {createBattleReplay,FighterKind} from './battleReplay';
export const BATTLE_EXAMPLES:{label:string;units:[number,number];kinds:[FighterKind,FighterKind];seed:number}[]=[
 {label:'기사 대 용병',units:[1,1],kinds:['knight','mercenary'],seed:73},
 {label:'용병 대 도적',units:[1,1],kinds:['mercenary','bandit'],seed:91},
 {label:'기사 1 대 도적 3',units:[1,3],kinds:['knight','bandit'],seed:18},
 {label:'기사 5 대 용병 5',units:[5,5],kinds:['knight','mercenary'],seed:41},
 {label:'교착 전투',units:[5,5],kinds:['mercenary','bandit'],seed:9},
];
export function exampleBattle(index:number){const e=BATTLE_EXAMPLES[index];return createBattleReplay(resolveCombat({units:e.units[0],morale:100,defenseMultiplier:index===2?1.4:1},{units:e.units[1],morale:100},makeRng(e.seed),index===4?{...DEFAULT_COMBAT_CONFIG,maxRounds:2,baseLossRate:0,routThreshold:0}:undefined),e.kinds);}
