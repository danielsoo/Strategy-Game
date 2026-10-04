import {resolveCombat,makeRng,DEFAULT_COMBAT_CONFIG} from '../services/combatSystem';
import {createBattleReplay,FighterKind} from './battleReplay';
import {WeaponKind} from './battleWeapons';
export const BATTLE_EXAMPLES:{label:string;units:[number,number];kinds:[FighterKind,FighterKind];seed:number;weapons?:[WeaponKind[],WeaponKind[]]}[]=[
 {label:'기사 대 용병',units:[1,1],kinds:['knight','mercenary'],seed:73},
 {label:'용병 대 도적',units:[1,1],kinds:['mercenary','bandit'],seed:91},
 {label:'기사 1 대 도적 3',units:[1,3],kinds:['knight','bandit'],seed:18},
 {label:'기사 5 대 용병 5',units:[5,5],kinds:['knight','mercenary'],seed:41},
 {label:'교착 전투',units:[5,5],kinds:['mercenary','bandit'],seed:9},
 {label:'전투 도끼 대 기사',units:[1,1],kinds:['mercenary','knight'],seed:73,weapons:[['axe'],['sword']]},
 {label:'손도끼 대 용병',units:[1,1],kinds:['bandit','mercenary'],seed:73,weapons:[['hatchet'],['sword']]},
 {label:'창 대 도적',units:[1,1],kinds:['mercenary','bandit'],seed:91,weapons:[['spear'],['hatchet']]},
 {label:'할버드 대 기사',units:[1,1],kinds:['knight','knight'],seed:73,weapons:[['halberd'],['sword']]},
 {label:'철퇴 대 기사',units:[1,1],kinds:['bandit','knight'],seed:73,weapons:[['flail'],['sword']]},
 {label:'혼성 무기 전투',units:[3,3],kinds:['knight','bandit'],seed:41,weapons:[['sword','spear','halberd'],['axe','hatchet','flail']]},
];
export function exampleBattle(index:number){const e=BATTLE_EXAMPLES[index];return createBattleReplay(resolveCombat({units:e.units[0],morale:100,defenseMultiplier:index===2?1.4:1},{units:e.units[1],morale:100},makeRng(e.seed),index===4?{...DEFAULT_COMBAT_CONFIG,maxRounds:2,baseLossRate:0,routThreshold:0}:undefined),e.kinds,10,e.weapons);}
