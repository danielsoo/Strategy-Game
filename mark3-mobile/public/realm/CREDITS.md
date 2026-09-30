# 왕국 연대기 — 그래픽 자산

중세 건축 16종은 Millennium A.D.의 아트를 사용합니다. 원저작자: **The Council of Modders, Fallen Empire Studio, Scion Development**, 공유 재질: **Wildfire Games**. [Wildfire Games](http://www.wildfiregames.com/) / [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) / [상세 출처·변경 내역](medieval/CREDITS.md). 변환된 아트도 CC BY-SA 3.0입니다. 게임 소스 코드의 라이선스와 별개입니다.

Poly Haven의 CC0 1.0 자산을 게임에 포함했습니다. PC는 2K, 작은 화면은 1K 재질을 사용합니다. 실행 중 외부 자산 서버에 접속하지 않습니다.

- 성곽: [Modular Fort 01](https://polyhaven.com/a/modular_fort_01)
- 수목: [Tree Small 02](https://polyhaven.com/a/tree_small_02)
- 소나무: [Pine Sapling Small](https://polyhaven.com/a/pine_sapling_small)
- 관목: [Shrub 01](https://polyhaven.com/a/shrub_01)
- 암벽: [Rock Face 01](https://polyhaven.com/a/rock_face_01)
- 지면: [Grass Ground](https://polyhaven.com/a/grass_ground)
- 산악 재질: [Aerial Rocks 02](https://polyhaven.com/a/aerial_rocks_02)
- 석재: [Medieval Blocks 05](https://polyhaven.com/a/medieval_blocks_05)
- 목재: [Medieval Wood](https://polyhaven.com/a/medieval_wood)
- 지붕: [Grey Roof Tiles](https://polyhaven.com/a/grey_roof_tiles)
- 회벽: [Rough Plaster 03](https://polyhaven.com/a/rough_plaster_03)
- 보조 재질 원본: [Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock)

[라이선스](https://polyhaven.com/license) / [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

수목 형상은 meshoptimizer(MIT)로 게임용 LOD를 만들었습니다. 원거리는 같은 모델을 네 방향에서 렌더링한 수목 카드, 근거리는 입체 형상을 사용합니다. 이전 Poly Haven 성곽 파일은 보관되어 있지만 현재 도시는 Millennium A.D. 건축을 사용합니다. 지형, 시가지 배치, 병사, 지도 UI는 프로젝트 코드입니다.

`kingdom-view.png`는 이 게임의 실제 브라우저 렌더링을 캡처한 메인 화면 배경입니다. 생성 콘셉트 이미지가 아닙니다.
위 중세 건축 아트가 포함된 이 렌더 이미지도 CC BY-SA 3.0으로 제공합니다.

재생성: `python tools/fetch-realm-assets.py`, `node tools/prepare-realm-tree.cjs`.

추가 식생: `python tools/fetch-realm-diversity.py`, `node tools/prepare-realm-tree.cjs pine_sapling_small`, `node tools/prepare-realm-tree.cjs shrub_01`. 건축 변환: `python tools/build-medieval-architecture.py`. 3종 도시 배치와 4종 병력 모델은 프로젝트 코드이다.

## 사실적 그래픽 작업본 추가 자산

- 검·방패병: [Knight — piacenti](https://opengameart.org/content/knight-2), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). [변환·출처 기록](knight/CREDITS.md). 현재 검·방패병만 원본 모델로 교체했고 나머지 병종은 기존 모델이다.
- 풀: [Grass Medium 01](https://polyhaven.com/a/grass_medium_01), Poly Haven, CC0. 원본 glTF의 세 군락 변형을 사용하며 비례·UV·재질을 보존한다.
- 고사리: [Fern 02](https://polyhaven.com/a/fern_02), Poly Haven, CC0.
- 숲 바닥: [Forest Floor](https://polyhaven.com/a/forest_floor), Poly Haven, CC0. 색·법선·거칠기 원본을 PC 2K / 모바일 1K로 사용한다.
- 환경광: [Kloofendal 48d Partly Cloudy Pure Sky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), Greg Zaal / Jarod Guest, CC0.

재생성: `python -X utf8 tools/fetch-realm-floor.py`, `python -X utf8 tools/fetch-realm-undergrowth.py`, `python tools/prepare-realm-knight.py`.
