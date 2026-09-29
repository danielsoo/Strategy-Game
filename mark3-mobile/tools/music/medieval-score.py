"""돌의 회랑 — 기존 곡과 독립된 64마디, D 도리안, 6/8 관현악 악보.

박 단위는 8분음표다. 인위적인 음정 흔들림 대신 프레이징, 쉼, 보이싱,
셈여림과 연주 시작의 작은 차이를 쓴다. 전체 편성은 구간별로 나눠 등장한다.
"""
import math
import random

TITLE = '돌의 회랑 · Cloister of Stone'
RATE = 44100
BARS = 64
EIGHTH = 60 / 84 / 2
BAR = EIGHTH * 6
DURATION = BARS * BAR
SEED = 290926

# 저음, 첼로, 비올라, 제2바이올린: 좁은 저음 화음 대신 넓은 간격.
VOICINGS = {
    'D': (38, 50, 57, 65), 'Ds': (38, 50, 57, 64),
    'G': (43, 50, 59, 67), 'C': (36, 48, 55, 64),
    'F': (41, 48, 57, 65), 'A': (33, 45, 55, 64),
    'Dp': (38, 50, 57, 62),
}
PROGRESSION = (
    ['Dp','Dp','D','Ds','G','D','C','Ds'] +
    ['D','D','C','G','D','F','G','Ds'] * 2 +
    ['F','C','G','D','F','G','A','Ds'] +
    ['D','G','C','D','F','G','A','Ds'] +
    ['D','C','G','D','F','G','C','Ds'] +
    ['D','D','C','G','D','F','G','Ds'] +
    ['Dp','D','C','G','D','Dp','Ds','Dp']
)
# 8마디 주제: 점음표의 긴 호흡과 6/8 응답. None은 관악기의 숨.
THEME = [
    [(74,3),(76,1),(77,2)], [(81,3),(79,1),(77,1),(76,1)],
    [(76,2),(74,1),(72,2),(None,1)], [(71,2),(74,1),(79,2),(None,1)],
    [(77,2),(76,1),(74,3)], [(72,2),(69,1),(72,3)],
    [(71,2),(74,1),(76,2),(74,1)], [(76,3),(69,2),(None,1)]
]
SECOND = [
    [(69,3),(72,2),(77,1)], [(76,2),(74,1),(72,2),(None,1)],
    [(71,3),(74,2),(79,1)], [(77,2),(76,1),(74,3)],
    [(77,3),(81,2),(79,1)], [(79,2),(76,1),(74,2),(71,1)],
    [(72,3),(71,1),(69,2)], [(69,3),(76,2),(None,1)]
]

def score():
    rng = random.Random(SEED)
    events = []
    def note(part, pitch, bar, beat, length, velocity, phrase=0.5):
        if pitch is None:
            return
        # 合奏의 박을 보존하는 10ms 이내 차이. seed 고정으로 재현 가능.
        events.append(dict(part=part, pitch=pitch,
            start=(bar*6+beat)*EIGHTH+rng.uniform(-.009,.009),
            duration=length*EIGHTH, velocity=velocity*rng.uniform(.96,1.04),
            phrase=phrase, bar=bar))
    def melody(part, phrase, start, octave, velocity):
        for k, notes in enumerate(phrase):
            beat=0
            for j,(pitch,length) in enumerate(notes):
                # 문장 끝에서는 쉼, 중간은 짧게 겹쳐 레가토.
                dur=length + (0.13 if j<len(notes)-1 and notes[j+1][0] is not None else -0.22)
                arch=.92+.14*math.sin(math.pi*(k+beat/6)/8)
                note(part, None if pitch is None else pitch+octave, start+k,beat,dur,
                     velocity*arch, (k+beat/6)/8)
                beat+=length

    # 각 구간의 현악 밀도. 전환은 이웃 마디 사이에서 보간한다.
    levels=[.38,.53,.62,.53,.64,.80,.54,.38]
    for b,name in enumerate(PROGRESSION):
        root,cell,mid,upper=VOICINGS[name]
        section=b//8
        intensity=levels[section]
        if b%8>=6:
            intensity += (levels[(section+1)%8]-intensity)*(b%8-5)/3
        # 베이스는 2마디씩 같은 음이면 붙여 활을 이어간다(아래 병합).
        note('bass',root,b,0,6.1,41+20*intensity)
        note('cello',cell,b,0,6.12,45+21*intensity)
        note('viola',mid,b,.035,6.1,43+20*intensity)
        note('violin2',upper,b,.015,6.10,44+23*intensity)
        # 바이올린 주제가 쉬는 곳에는 긴 보조 성부가 남는다.
        if section in [0,3,7]:
            top=upper+12 if section==3 else 69 if name in ['D','Ds','Dp','F','A'] else 67
            note('violin1',top,b,.025,6.1,40+17*intensity)
        # 규칙적인 8분음표 연타 대신 2박의 뜯음과 드문 연결음.
        arp=[cell,mid,upper,mid+12]
        for beat,n,v in [(0,arp[0],54),(1,arp[1],44),(3,arp[2],50),(4,arp[3],42)]:
            if section==5 and beat==1:
                continue
            note('harp',n,b,beat,3.5,v*(.8+intensity*.30))
        if b%4==3:
            note('harp',upper+7 if name=='Dp' else mid+12,b,5,2,38)
        # 저음 목관은 중역을 비우고 현의 문장 끝에 응답한다.
        if section in [1,2,3,4,5,6] and b%2==0:
            note('bassoon',cell,b,0,4.9,40+intensity*14)
        if section in [3,4,5] and b%2==1:
            note('bass_clarinet',cell,b,.1,4.8,43)
        if section in [4,5] and b%2==0:
            note('contrabassoon',root,b,.08,4.6,44)
        if section in [2,4,5]:
            note('horn',mid,b,.05,5.25,48+intensity*14)
            if b%2==0:
                note('horn',cell,b,.06,5.2,42+intensity*12)
        # 금관은 절정의 긴 음을 받친다. 과한 팡파르/현대 드럼 비트 없음.
        if section==5:
            note('trumpet',upper+12,b,0,3.9,58)
            note('trombone',mid,b,.04,4.9,53)
            note('bass_trombone',cell,b,.07,4.8,48)
            if b%2==0:
                note('tuba',root,b,.10,4.7,49)
        if section in [2,4,5] and b%2==0:
            note('timpani',38 if name in ['D','Ds','Dp','F'] else 43 if name=='G' else 36,
                 b,0,4.4,58 if section==5 else 46)
        if section==5 and b%2==0:
            note('drums',48,b,0,4,62) # c3: 큰북
        if b in [39,43,47]:
            # 좌우 손 샘플 교대; 작은북은 문장 끝의 장식만.
            for beat,vel in [(3,43),(4.5,32),(5,39)]:
                note('drums',49,b,beat,.6,vel)
        if b in [7,23,55]:
            note('triangle',52,b,3,6,44)
        if b in [31,39]:
            note('cymbals',52,b,0,6,52) # 미리 녹음된 부드러운 심벌즈 롤
        if b==40:
            note('cymbals',55,b,0,6,50)
        if b in [21,37,45]:
            for beat,pitch in [(3,upper+12),(4,mid+12),(5,upper+12)]:
                note('xylophone',pitch,b,beat,1.1,43)

    # 도입에는 잉글리시 호른으로 주제를 낮게 암시한다.
    melody('english_horn',THEME[:4],2,-12,59)
    melody('violin1',THEME,8,0,70)
    melody('flute',THEME,8,0,55)
    melody('violin1',THEME,16,0,74)
    melody('oboe',THEME[4:],20,0,52)
    melody('clarinet',SECOND,24,-12,61)
    melody('english_horn',SECOND[4:],28,-12,50)
    melody('violin1',SECOND,32,0,77)
    melody('flute',SECOND[:4],32,0,52)
    melody('violin1',THEME,40,0,84)
    melody('piccolo',THEME[4:7],44,12,47)
    melody('violin1',THEME,48,0,66)
    melody('oboe',THEME[:4],48,0,49)
    melody('flute',THEME[4:],52,0,49)
    melody('english_horn',THEME[:4],56,-12,53)
    # 끝은 종지가 아닌 열린 D-A. 처음의 반주와 음량으로 되돌아간다.
    for b,pitch in [(60,65),(61,64),(62,62),(63,69)]:
        note('clarinet',pitch,b,0,4.8,44)

    # 같은 현악 음이 마디를 넘어가면 재어택 없이 연결한다.
    merged=[]
    for part in ['violin1','violin2','viola','cello','bass']:
        line=sorted([e for e in events if e['part']==part],key=lambda e:e['start'])
        for e in line:
            if (merged and merged[-1]['part']==part and merged[-1]['pitch']==e['pitch']
                and abs(merged[-1]['start']+merged[-1]['duration']-e['start'])<.15):
                prev=merged[-1]
                prev['duration']=e['start']+e['duration']-prev['start']
                prev['velocity']=(prev['velocity']+e['velocity'])/2
            else:
                merged.append(e.copy())
    events=[e for e in events if e['part'] not in ['violin1','violin2','viola','cello','bass']]+merged
    assert len(PROGRESSION)==BARS
    return sorted(events,key=lambda e:e['start'])
