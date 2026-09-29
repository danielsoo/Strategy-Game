# 왕국의 기억 · 북과 금관

2026-09-29. 요청에 따라 타악기·북의 존재감을 높이고, 웅장한 영화·게임·드라마 OST의
전개 방식을 추가로 참고했다. **오디세이는 크리스토퍼 놀란 감독의 영화**로 정정했다.
좋아한 첫 주제 49음과 후반 주제 47음은 직전 서사 편곡과 음·시작 시각·길이가 모두 같다.
게임 재생 설정과 모든 이전 버전은 보존했다.

## 실제 변경

- 큰북과 작은북을 별도 파트로 분리해 음량·저역·잔향을 각각 조절했다.
- 큰북 79회: 초반에는 드문 맥박, 중후반에는 6/8의 두 박, 종지에서는 변형.
- 작은북 77개 이벤트: 좌우 손 샘플을 교대하는 리듬과 실제 연주된 롤.
- 팀파니 63개 이벤트: 화성의 저음을 따라가는 타격과 4개의 점층적인 롤.
- 징(탐탐) 6회, 심벌즈 8회: 금속성 울림과 큰 장면 전환.
- 첼로는 중후반에서 화음 구성음을 오가는 리듬을 맡고, 금관의 진입도 확대했다.
- 절정 뒤에는 북이 먼저 물러나고 목관·현악·하프의 여운이 시작으로 이어진다.

빠른 단타 복제 대신 녹음된 롤을 쓴다. 해당 음에만 샘플의 지속 루프와 크레셴도 곡선을
적용했다. SFZ의 벨로시티 레이어 선택은 MIDI 정수로 판정해 63/64 사이처럼 소수점 값이
어느 레이어에도 속하지 않던 문제를 고쳤다. 연속적인 진폭 변화는 그대로 유지한다.

전자악기와 드럼 머신은 추가하지 않았다. 전체 원래 악기군은 유지하고 큰북/작은북 분리와
징 추가로 26개 믹스 파트가 되었다. 실제 26명 혹은 95명이 연주한 녹음이라는 뜻은 아니다.

## 참고 자료

아래는 제작진의 글·인터뷰에서 읽은 접근법이며, 적용은 이 곡을 위한 자체 편곡이다.
참고 OST의 전체 음원을 직접 청취·분석했다는 주장이나 멜로디·녹음의 인용은 아니다.

| 참고 작품 | 자료에서 확인한 내용 | 이번 곡에 적용한 선택 |
|---|---|---|
| 놀란의 오디세이 | [TIME 인터뷰](https://time.com/article/2026/05/12/christopher-nolan-odyssey-interview/)에서 고대 악기와 청동 징을 활용한 제작 설명 | 징의 긴 금속성 잔향과 낮은 북의 질량감 |
| 어벤져스: 엔드게임 | [D23의 Alan Silvestri 인터뷰](https://d23.com/avengers-endgame-composer-reveals-the-two-most-challenging-scenes-to-score/)에서 장면의 시작·끝, 포털 장면의 대규모 오케스트라 설명 | 절정 진입의 트럼펫·트롬본 보강과 큰북·심벌즈의 합류 |
| 갓 오브 워 | [Bear McCreary의 공식 PlayStation 글](https://blog.playstation.com/2018/04/13/how-bear-mccreary-composed-god-of-wars-soundtrack-out-today-on-spotify/)에서 강한 북·금관과 서정적인 주제의 제작 과정 | 북의 추진력을 더하되 중간의 서정적인 구간은 유지 |
| 왕좌의 게임 | [Ramin Djawadi의 Song Exploder 인터뷰](https://songexploder.net/transcripts/game-of-thrones-transcript.pdf)에서 첼로의 어두운 음색, 독주에서 합주로 확장하는 설명 | 움직이는 저음 현과 성부의 단계적인 합류 |
| 나니아 연대기 | [Harry Gregson-Williams 인터뷰](https://animatedviews.com/2008/harry-gregson-williams-scoring-the-return-to-narnia/)의 주제 재편곡 설명 | 이미 좋아한 멜로디의 정체성을 유지하면서 다른 규모로 전개 |

오디세이 원작의 모든 악기 구성·현대적 요소를 따르는 것은 아니다. 기존 요청의 어쿠스틱
오케스트라 편성에 맞춰 질감과 감정의 전개에서 참고한 요소를 반영했다.

## 출력과 확인

`public/music/memory-of-the-kingdom-epic`:

- `.mp3`: 전체 3분 12.692초.
- `-theme.mp3`: 북과 금관이 차오르는 중후반 55초.
- `.wav` / `.flac`: 44.1kHz, 24비트, 스테레오 반복 원본.
- `-loop-check.mp3`: 마지막 8초에서 첫 8초로 연결.
- `.html`: 청취와 직전 편곡 비교, 참고 자료.

검증: WAV/FLAC 디코딩 PCM 일치, MP3도 8,497,725프레임으로 원본과 동일.
26개 파트에 유효한 음표·샘플이 있고, 무음 끊김·클리핑 없음.
통합 음량 -18.1 LUFS, LRA 10.7 LU, 트루피크 -1.8dBFS.
루프 경계의 샘플 차이는 내부의 99백분위보다 작다.
이는 파일 검사 결과이며, 실제 공연 같은 자연스러움이나 주관적 몰입감을 보증하지 않는다.

샘플: [Sonatina Symphonic Orchestra](https://github.com/peastman/sso), Mattias Westlund 및 기여자,
[CC Sampling Plus 1.0](https://creativecommons.org/licenses/sampling+/1.0/).

## 재생성

```powershell
python tools/music/render-medieval.py --score kingdom-epic-score.py --name memory-of-the-kingdom-epic --excerpt-bars 40 64
```

샘플 준비는 이전 버전과 같다. 새 악보가 기존 서사 편곡을 읽고 타악·금관·저음 현의
역할을 바꾼다. 원본 악보와 음원을 덮어쓰지 않는다.
