/** Only standing actions approved for the strategy battle presentation. */
export const NATIVE_CLIPS={idle:'전투 대기',slash:'서서 베기 A',cross:'서서 베기 B',heavy:'강공격 · 내려치기',block:'방패 올리기',guard:'방패 경계',release:'방패 내리기',impact:'피격',walk:'전진',axeIdle:'한손 무기 경계',axeChop:'강공격 · 도끼 찍기',axeSweep:'도끼 가로 찍기',axeBlock:'무기로 받아내기',axeWalk:'무장 전진',twoIdle:'양손 경계',twoChop:'강공격 · 양손 내려치기',twoSweep:'양손 사선 베기',twoBlock:'양손 받아내기',twoWalk:'양손 전진',spearThrust:'창 전진 찌르기',spearGuard:'창 경계',jumpHeavy:'점프 강공격',death:'사망',impactHeavy:'강한 피격',axeImpact:'측면 피격',axeImpactHeavy:'복부 피격',axeJump:'점프 내려찍기',twoImpact:'양손 무기 피격',twoJump:'양손 점프 강공격',twoDeath:'양손 무기 사망',bowVolley:'장전 → 조준 → 발사',bowIdle:'활 경계',bowDraw:'화살 꺼내기 · 장전',bowAim:'시위 당기기 · 조준',bowShoot:'화살 발사',bowWalk:'궁수 전진',bowImpact:'궁수 피격',bowDeath:'궁수 사망'};
export type NativeClip=keyof typeof NATIVE_CLIPS;
export const COMBAT_MODELS={
 paladin:{label:'기사 · 중갑',path:'/realm/paladin/model.gltf?v=bow-jump-edge-2',note:'판금 갑옷 · 투구 · 검과 방패',armed:true},
 arissa:{label:'도적 · 외투 후보',path:'/realm/arissa/model.gltf?v=bow-jump-edge-2',note:'가죽 장비 · 긴 외투 · 외형 검토용',armed:false},
 erika:{label:'용병 · 경장 후보',path:'/realm/erika/model.gltf?v=bow-jump-edge-2',note:'후드 · 가죽 흉갑 · 외형 검토용',armed:false},
} as const;
export type CombatModel=keyof typeof COMBAT_MODELS;
