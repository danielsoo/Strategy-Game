import type {FighterKind} from './battleReplay';
import type {DuelFighter} from './nativeDuel';
import type {NativeWeaponKind} from './nativeWeaponRig';

/** One equipment roster for the campaign and its resolved-battle film. */
export function armyFighter(kind:FighterKind,slot=0):DuelFighter {
 const base:DuelFighter=kind==='knight'?{model:'paladin',weapon:'sword'}:kind==='bandit'?{model:'arissa',weapon:'hatchet'}:{model:'erika',weapon:'axe'};
 return formationFighter(base,slot);
}
export function formationFighter(base:DuelFighter,slot:number,mixed=true):DuelFighter {
 const weapons:NativeWeaponKind[]=base.weapon==='bow'?['bow']:base.model==='paladin'?[base.weapon,'spear','halberd']:[base.weapon,'hatchet','axe'];
 return {...base,weapon:mixed?weapons[slot%weapons.length]:base.weapon};
}
