# 왕국의 기억 · 세 목소리

2026-09-29. 사용자가 여정 편곡을 좋아하며 플루트·호른·첼로를 추가로 요청했다.
플루트와 호른은 기존 파트를 선율의 중심으로 옮기고, 첼로 합주에 별도의 독주 샘플을 추가했다.
기존 곡과 게임 재생 설정은 보존했다. 음과 타이밍은 계속 수정 가능하다.

- 약 0:58–1:18: 플루트가 8마디 간주를 연주한다. 숨을 쉴 쉼표와 긴 음을 배치했다.
- 약 1:18–1:37: 독주 첼로가 중간 주제를 이어받는다. 첼로 합주 및 현악 반주를 낮췄다.
- 약 1:37–1:46: 호른이 전개 선율을 맡은 뒤 바이올린이 돌아온다.
- 이후에는 기존 북·팀파니·징 및 금관의 절정을 이어간다.
- 총 80마디, 192.692초, 27개 파트. 중간부 58.074초를 미리듣기로 제공한다.

## 파일과 재생성

`public/music/memory-of-the-kingdom-voices`의 `.wav`, `.flac`, `.mp3`가 전체 음원이다.
`-theme.mp3`는 세 악기가 순서대로 나오는 발췌, `-loop-check.mp3`는 8초 위치에서
끝과 처음이 연결되는 16초 발췌다. `.html`에서 전체 반복과 직전 버전 비교가 가능하다.

```powershell
python tools/music/prepare-medieval.py --extra-sfz 'Strings - Notation/Cello Solo Sustain.sfz'
python tools/music/render-medieval.py --score kingdom-voices-score.py --name memory-of-the-kingdom-voices --excerpt-bars 24 48
```

## 검증과 한계

44.1kHz/24비트 스테레오, WAV/FLAC PCM 일치, MP3 디코딩 프레임 수 8,497,725 일치.
27개 파트 모두 샘플이 매칭되며 연주 이벤트가 있다. 통합 음량 -18.2 LUFS,
LRA 8.4 LU, 트루피크 -1.8dBFS. 디지털 무음·클리핑 없음. 반복 경계의 파형 차이는
내부 파형 차이의 99백분위보다 작다. 이는 수치 검증이며 청취 품질의 보증은 아니다.

SSO의 실제 악기 녹음 샘플을 배열한 음원으로, 실제 악단 전체의 공연 녹음은 아니다.
추가 독주 첼로도 기존과 같은 SSO 커밋 및 CC Sampling Plus 1.0 출처다.
참고 작품과 출처는 [앞선 편곡 기록](memory-of-the-kingdom-epic.md)을 따른다.
