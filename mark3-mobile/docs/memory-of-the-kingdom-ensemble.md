# 왕국의 기억 · 함께 부르는 주제

2026-09-29. 하프와 바이올린 독주를 추가해 달라는 요청, 마지막에 여러 악기가
함께 어우러지기를 바란 앞선 요청을 반영한 별도 편곡이다. 기존 파일 및 게임 연결은 보존한다.

## 흐름

- 0:10: 하프의 4마디 독주. 작은 현악 반주 위에 분산화음과 높은 주제 조각을 둔다.
- 0:20: 바이올린 독주가 첫 주제의 앞 8마디를 연주한다. 이후 바이올린 합주가 이어받는다.
- 0:58: 플루트, 1:18: 첼로 독주, 1:37: 호른이 주선율을 맡는 기존 흐름.
- 2:32: 마지막 16마디를 전 편성의 주제 재현으로 교체했다. 현악은 선율과 반주,
  목관은 화성과 응답, 금관은 주제와 저음, 타악은 맥박과 악절 강조를 맡는다.
- 끝에서는 전체가 함께 작아지며 도입으로 연결된다. 마지막 구간에는 28개 파트가
  모두 등장하지만 모든 악기가 매 순간 같은 세기로 연주하는 구성은 아니다.

호른은 합주 샘플을 앞세운 주선율 파트다. 플루트·첼로·바이올린에는 독주 샘플을 썼다.
28개 파트는 연주 인원이나 서로 다른 악기 28종을 뜻하지 않는다.

## 파일과 재생성

`public/music/memory-of-the-kingdom-ensemble`:
전체 `.wav` / `.flac` / `.mp3`, 하프·바이올린 발췌 `-theme.mp3` (28.540초),
반복 경계 확인 `-loop-check.mp3`, 청취·비교 `.html`.

```powershell
python tools/music/prepare-medieval.py --extra-sfz 'Strings - Notation/Violin Solo 1 Sustain (looped).sfz' --extra-sfz 'Strings - Notation/Cello Solo Sustain.sfz'
python tools/music/render-medieval.py --score kingdom-ensemble-score.py --name memory-of-the-kingdom-ensemble --excerpt-bars 4 16
```

## 검증

192.692초, 44.1kHz/24비트 스테레오, 8,497,725 프레임.
WAV/FLAC PCM 일치, MP3 디코딩 프레임 수 일치. 28개 파트 모두 활성화 및 마지막 구간 등장.
통합 -17.1 LUFS, LRA 8.5 LU, 트루피크 -1.8dBFS. 디지털 무음·클리핑 없음.
반복 경계의 파형 차이는 내부 차이의 99백분위보다 작다. 수치 검증은 음악적 자연스러움이나
실제 공연과 같은 청취 품질을 보증하지 않는다.

SSO 실제 악기 녹음 샘플을 배열한 제작 방식이며 전체 악단의 공연 녹음은 아니다.
추가 바이올린도 같은 SSO 커밋 및 CC Sampling Plus 1.0 출처다.
