# Knight
Original model and textures by **piacenti**.
[Original work](https://opengameart.org/content/knight-2) · [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
glTF distribution: Sascha Willems, [Vulkan-Assets](https://github.com/SaschaWillems/Vulkan-Assets/tree/a27c0e584434d59b7c7a714e9180eefca6f0ec4b/models/armor).
Adaptation for this game: lossless RGBA KTX to PNG container conversion, standard glTF material assignment, runtime proportions, equipment and formations; procedural skeletal weights, two-bone IK and paired combat choreography. 2026-09-30. No endorsement implied.

## 대련 동작 5 (2026-09-30)

Quaternius의 **Universal Animation Library Standard** 및 **Universal Animation Library 2 Standard** 동작과 손 메시를 사용했습니다. 라이선스: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

- [제작자 배포: Universal Animation Library](https://opengameart.org/content/universal-animation-library)
- [제작자 배포: Universal Animation Library 2](https://opengameart.org/content/universal-animation-library-2)
- 사용 클립: `Sword_Attack`, `Hit_Chest`, `Idle_Shield_Loop`, `Shield_OneShot`, `Sword_Regular_A`, `Death01`, `Sword_Idle`, `Walk_Loop`, `Crouch_Idle_Loop`, `Sword_Block`.

기사 체형에 맞춘 관절 재배치, 중갑에 맞춘 손목 회전 제한, 닫힌 손·장갑 연결, 동작 혼합, 대련 타이밍을 수정했습니다. 검은 새로 작성한 한손검 메시입니다. For Honor의 모델·애니메이션 파일은 포함하지 않습니다. 제작자의 보증이나 제휴를 뜻하지 않습니다.

## 병종별 부대 전투 (2026-09-30)

동일 원본 모델에서 방패·투구 제거, 체형과 재질 변경, 새 얼굴·철모·후드·가죽 장비 메시 추가로 용병과 도적을 제작했습니다. CC BY 3.0 원본의 변형입니다. 직물 무늬와 새 장비는 프로젝트에서 생성했습니다. 위 CC0 동작을 조합해 검 받아치기, 발 이동, 회피를 추가했습니다.

다대다 연출은 실제 전투 엔진의 라운드별 손실·패주·최종 생존 수를 읽습니다. 개별 타격의 순서와 위치는 연출용으로 생성하며 추가 전투 판정을 하지 않습니다. 큰 부대는 진영당 최대 10개의 대표 병사로 표시하고 실제 병력 수는 전투 결과에 유지합니다.

2026-10-03: 연속 사선·횡베기와 반격을 배치하고, 접촉 자세에서 계산한 발 위치와 몸 방향 사이를 보간하도록 수정했습니다. 기사·용병 1대1에서 검의 접촉점을 매 프레임 다시 맞추며 발생하던 순간 이동을 수정했습니다. 다대다의 밀집 상황에서는 별도 충돌 보정에 의한 위치 튐이 남아 있습니다. 검토 화면에서 다음 공방 단위로 확인할 수 있습니다.

2026-10-03 추가: 고정된 두 번 공격 교대 대신 패링·회피 결과에 따른 반격과 압박을 연결했습니다. 검을 쳐낸 뒤 공격자가 검을 거두는 반응, 방패 또는 빈손·팔로 밀쳐내기와 뒷걸음, 공격선에서 벗어나는 옆걸음을 기존 CC0 클립으로 조합했습니다. 개별 동작은 연출이며 엔진의 피해·생존 판정을 변경하지 않습니다.

2026-10-03 강공격: 0.9초의 준비와 몸통 회전, 패링 뒤 검 반동·뒷걸음, 치명타 충격에서 사망 자세로의 전환을 추가했습니다. [Ubisoft의 For Honor 공식 전투 가이드](https://www.ubisoft.com/en-ca/game/for-honor/news-updates/6XEM2qUiwcokp753uCzgkz/for-honor-terminology-guide)의 패링·반격 개념을 참고했습니다. For Honor 모델·모션 파일을 사용하지 않고 위 CC0 클립을 재조합했습니다. 해당 게임의 프레임 수나 피해 규칙을 복제한 구현은 아닙니다.

2026-10-03 강공격 동작 5: 머리 위로 검을 드는 준비 자세를 별도 구성하고, 불필요한 재차 올리기 없이 한 번의 큰 내려치기로 연결했습니다. 손목 대신 어깨·몸통과 팔 전체를 회전합니다. 접촉 직후 짧게 버틴 다음 무릎 굽힘·후퇴·검 흘리기 또는 방패 밀어 올리기로 이어지도록 회복 시간을 늘렸습니다. 짧은 한손검과 방패를 유지하므로 양손검 모션은 포함하지 않습니다. 전투 로그의 결과·손실 수를 유지하며 연출 시계만 조정합니다.

2026-10-03 동작 6: 회피 시작 전 공격자의 위치와 방향을 확정하고, 이동 경로와 접촉 보정 경로 모두 회수 구간까지 유지합니다. 회피자는 원래 공격선의 옆으로 이동합니다. 강공격 준비 자세는 팔꿈치를 접고 전완·손을 함께 회전하여 머리 위에 손잡이를 올리도록 다시 작성했습니다. 빗나간 강공격은 접촉 정지나 패링 반동 없이 낮게 휘두른 뒤 회수합니다. 검토 카메라도 회피자를 따라 움직이지 않도록 고정했습니다.

참고: [Ubisoft Black Prior 공식 시연](https://www.youtube.com/watch?v=DxaeIyW8RTk), [엘든링 공식 전투 가이드](https://www.bandainamcoent.com/news/elden-ring-introduction-part-4-combat-guide)와 [공식 강공격 시연](https://www.youtube.com/watch?v=_R89o87YN1c). 관찰한 준비·회수·방어 반응을 이 프로젝트의 연출에 맞춰 재구성했으며 원작의 자산이나 수치·추적 규칙을 복제하지 않았습니다.
