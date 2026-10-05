/** Only standing actions approved for the strategy battle presentation. */
export const NATIVE_CLIPS={idle:'전투 대기',slash:'서서 베기 A',cross:'서서 베기 B',heavy:'강공격 · 내려치기',block:'방패 올리기',guard:'방패 경계',release:'방패 내리기',impact:'피격',walk:'전진',axeIdle:'한손 무기 경계',axeChop:'강공격 · 도끼 찍기',axeSweep:'도끼 가로 찍기',axeBlock:'무기로 받아내기',axeWalk:'무장 전진',twoIdle:'양손 경계',twoChop:'강공격 · 양손 내려치기',twoSweep:'양손 사선 베기',twoBlock:'양손 받아내기',twoWalk:'양손 전진',spearThrust:'창 전진 찌르기',spearGuard:'창 경계'};
export type NativeClip=keyof typeof NATIVE_CLIPS;
export const COMBAT_MODELS={
 paladin:{label:'기사 · 중갑',path:'/realm/paladin/model.gltf?v=weapons-1',note:'판금 갑옷 · 투구 · 검과 방패',armed:true},
 arissa:{label:'도적 · 외투 후보',path:'/realm/arissa/model.gltf?v=weapons-1',note:'가죽 장비 · 긴 외투 · 외형 검토용',armed:false},
 erika:{label:'용병 · 경장 후보',path:'/realm/erika/model.gltf?v=weapons-1',note:'후드 · 가죽 흉갑 · 외형 검토용',armed:false},
} as const;
export type CombatModel=keyof typeof COMBAT_MODELS;
