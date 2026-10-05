/** Only standing actions approved for the strategy battle presentation. */
export const NATIVE_CLIPS={idle:'전투 대기',slash:'서서 베기 A',cross:'서서 베기 B',block:'방패 올리기',guard:'방패 경계',release:'방패 내리기',impact:'피격',walk:'전진'};
export type NativeClip=keyof typeof NATIVE_CLIPS;
export const COMBAT_MODELS={
 paladin:{label:'기사 · 중갑',path:'/realm/paladin/model.gltf',note:'판금 갑옷 · 투구 · 검과 방패',armed:true},
 arissa:{label:'도적 · 외투 후보',path:'/realm/arissa/model.gltf',note:'가죽 장비 · 긴 외투 · 외형 검토용',armed:false},
 erika:{label:'용병 · 경장 후보',path:'/realm/erika/model.gltf',note:'후드 · 가죽 흉갑 · 외형 검토용',armed:false},
} as const;
export type CombatModel=keyof typeof COMBAT_MODELS;

