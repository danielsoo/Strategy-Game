# 왕국 연대기 — 그래픽 자산

Poly Haven의 CC0 1.0 자산을 게임에 포함했습니다. PC는 2K, 작은 화면은 1K 재질을 사용합니다. 실행 중 외부 자산 서버에 접속하지 않습니다.

- 성곽: [Modular Fort 01](https://polyhaven.com/a/modular_fort_01)
- 수목: [Tree Small 02](https://polyhaven.com/a/tree_small_02)
- 암벽: [Rock Face 01](https://polyhaven.com/a/rock_face_01)
- 지면: [Grass Ground](https://polyhaven.com/a/grass_ground)
- 산악 재질: [Aerial Rocks 02](https://polyhaven.com/a/aerial_rocks_02)
- 석재: [Medieval Blocks 05](https://polyhaven.com/a/medieval_blocks_05)
- 목재: [Medieval Wood](https://polyhaven.com/a/medieval_wood)
- 지붕: [Grey Roof Tiles](https://polyhaven.com/a/grey_roof_tiles)
- 회벽: [Rough Plaster 03](https://polyhaven.com/a/rough_plaster_03)
- 보조 재질 원본: [Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock)

[라이선스](https://polyhaven.com/license) / [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

수목 형상은 meshoptimizer(MIT)로 게임용 LOD를 만들었습니다. 원거리는 같은 모델을 네 방향에서 렌더링한 수목 카드, 근거리는 입체 형상을 사용합니다. 성곽 모듈은 배치·비례를 조정했습니다. 지형, 내성·시가지 조립, 병사, 지도 UI는 프로젝트 코드입니다.

`kingdom-view.png`는 이 게임의 실제 브라우저 렌더링을 캡처한 메인 화면 배경입니다. 생성 콘셉트 이미지가 아닙니다.

재생성: `python tools/fetch-realm-assets.py`, `node tools/prepare-realm-tree.cjs`.
