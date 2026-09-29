# 왕국의 기억 · 서사 편곡

2026-09-29. 사용자가 좋아한 〈왕국의 기억〉의 선율을 유지하면서,
나니아 연대기와 오디세이 같은 OST의 깊은 분위기와 흐름을 참고해 편곡했다.
‘오디세이’는 작품 확인 답변이 없는 상태에서 **어쌔신 크리드 오디세이**를 잠정 기준으로 삼았다.
이후 사용자가 **놀란 감독의 영화 오디세이**로 정정했다.
[이를 반영하고 타악기를 강화한 후속 편곡](memory-of-the-kingdom-epic.md)이 있다.
모든 이전 음원과 게임 음악 설정을 보존했다.

## 참고한 자료와 적용

이번 조사에서는 OST 제작진의 인터뷰를 읽었다. OST 음원을 직접 청취·분석했다고
주장하는 기록이 아니며, 외부 OST의 녹음이나 선율을 가져오지 않았다.

- [나니아 작곡가 Harry Gregson-Williams 인터뷰](https://animatedviews.com/2008/harry-gregson-williams-scoring-the-return-to-narnia/):
  같은 주제를 장면에 맞춰 재편곡·발전시키고, 정서적인 주제가 영웅적인 장면에도
  쓰이도록 바꾸는 설명을 참고했다. 이 곡에서는 승인된 주제를 유지한 채
  악기 수, 음역, 대선율, 전후 문맥을 바꾼다.
- [Ubisoft의 The Flight 인터뷰](https://news.ubisoft.com/en-us/article/5Y0vBS44xVo7HJocYvb5Ej/composing-an-epic-score-for-assassins-creed-odyssey):
  부드럽고 인간적인 순간부터 큰 전투까지의 대비와 조용한 장면의 여백을 강조한다.
  이 곡에서는 하프·목관 중심의 8마디 간주를 추가하고 절정을 뒤로 미뤘다.

## 음악

첫 주제 49음과 재현 주제 47음의 **음 순서가 이전 악보와 동일함**을 확인했다.
전체 길이를 64마디에서 80마디, 2분 28초에서 3분 13초로 늘렸다.
도입은 기존 동기를 낮고 느리게 암시하고, 첫 주제 뒤에 별도의 풍경 같은 간주를 둔다.
제2바이올린·비올라는 절정에서 독립적으로 움직이며 주선율을 받친다.
모든 악기가 공유하는 완만한 템포 곡선을 적용했고, 마지막 템포는 처음으로 돌아온다.
홀 잔향은 조금 길게 하되 주선율의 직접음을 유지했다.

| 시간 | 역할 |
|---|---|
| 0:00 | 낮은 목관과 열린 현의 동기 |
| 0:20 | 좋아하셨던 16마디 주제 |
| 0:58 | 하프와 목관, 소리를 비우는 8마디 |
| 1:18 | 낮은 클라리넷에서 다시 전개 |
| 1:56 | 바이올린·호른의 주제 재현 |
| 2:14 | 높은 현과 금관의 절정 |
| 2:32 | 목관과 현악의 응답 |
| 2:52 | 여운, 시작으로 돌아가는 연결 |

## 파일과 검증

`public/music/memory-of-the-kingdom-cinematic` 이름으로 다음 파일을 추가했다.

- `.mp3`: 전체 곡 192.692초.
- `-theme.mp3`: 전개에서 절정으로 이어지는 중후반 약 55초. 단순 주제 발췌와 다르다.
- `.wav`, `.flac`: 반복용 무손실 원본, 44.1kHz/24비트 스테레오.
- `-loop-check.mp3`: 끝 8초 + 처음 8초.
- `.html`: 전체·발췌·반복·이전 버전 비교 청취 페이지.

WAV와 FLAC의 디코딩 PCM이 동일하고, MP3 디코딩 길이도 8,497,725프레임으로 같다.
요청된 악기를 포함한 24개 파트가 모두 활성화되어 있다.
통합 음량 -19.0 LUFS, LRA 10.3 LU, 트루피크 -1.8dBFS.
최저 10ms RMS -38.61dBFS로 무음 끊김은 없으며, 경계 샘플 차이는 내부의 99백분위보다 작다.
이 수치는 파일 검사 결과이며 주관적인 청취 품질의 검증을 대신하지 않는다.

악기 샘플과 실제 합주 재현의 한계는 [기존 기록](memory-of-the-kingdom.md)과 같다.
샘플: [Sonatina Symphonic Orchestra](https://github.com/peastman/sso), Mattias Westlund 및 기여자,
[CC Sampling Plus 1.0](https://creativecommons.org/licenses/sampling+/1.0/).

## 재생성

```powershell
python tools/music/render-medieval.py --score kingdom-cinematic-score.py --name memory-of-the-kingdom-cinematic --excerpt-bars 40 64
```

`kingdom-cinematic-score.py`가 기존 악보를 읽고 별도 편곡을 만든다.
렌더러는 악보의 마디별 시간을 읽어 템포가 달라져도 발췌 구간과 분석 구간을 정확히 자른다.
이전 악보는 기본 고정 템포와 잔향 설정을 계속 사용한다.
