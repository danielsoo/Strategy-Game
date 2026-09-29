"""왕국의 기억 · 서사 편곡 — 승인된 주제의 음을 유지하고 80마디로 흐름 확장.

나니아 작곡가의 주제 재편곡 설명을 참고한 독자 편곡.
기존 OST의 음원·선율을 가져오지 않는다. 조용한 여백, 성부의 점진적인 등장,
모든 악기가 함께 따르는 완만한 템포 변화로 곡의 원근과 호흡을 만든다.
"""
from pathlib import Path
import copy
import importlib.util
import random

spec=importlib.util.spec_from_file_location('kingdom',Path(__file__).with_name('kingdom-score.py'))
original=importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)

TITLE='왕국의 기억 · 서사 편곡'
TITLE_EN='Memory of the Kingdom - A Wider World'
RATE=44100
BARS=80
EIGHTH=original.EIGHTH
BAR=original.BAR
SEED=290928
ROOM={'seconds':2.65,'decay':3.65,'damping':3300,'predelay':.040}
MIX_OVERRIDES=copy.deepcopy(original.MIX_OVERRIDES)
MIX_OVERRIDES['violin1'].update(gain=1.13,send=.19)
MIX_OVERRIDES['violin2'].update(gain=.47,send=.23)
MIX_OVERRIDES['viola'].update(gain=.41,send=.23)
MIX_OVERRIDES['cello'].update(gain=.60,send=.20)
MIX_OVERRIDES['english_horn'].update(gain=.68,send=.23)
MIX_OVERRIDES['horn'].update(gain=.67,send=.29)
MIX_OVERRIDES['harp'].update(gain=.44,send=.19)

# 모든 성부가 공유하는 템포 곡선. 문장 끝에서 숨을 고른 뒤 함께 앞으로 간다.
TEMPO_ANCHORS=[(0,72),(4,73),(8,76),(20,77),(23,72),(24,70),
               (31,72),(32,74),(40,76),(47,78),(48,79),
               (56,82),(60,79),(63,73),(64,72),(72,70),(76,71),(80,72)]
def bpm(beat):
    bar=beat/6
    for (a,x),(b,y) in zip(TEMPO_ANCHORS,TEMPO_ANCHORS[1:]):
        if a<=bar<=b:
            f=(bar-a)/(b-a)
            f=f*f*(3-2*f)
            return x+(y-x)*f
    return TEMPO_ANCHORS[0 if bar<0 else -1][1]

# 8분음표의 1/8 간격으로 적분. 마지막 템포가 첫 템포와 같다.
STEP=.125
TIMES=[0.]
for i in range(int(BARS*6/STEP)):
    TIMES.append(TIMES[-1]+STEP*30/bpm((i+.5)*STEP))
DURATION=TIMES[-1]

def time_at(beat):
    if beat<0:
        return beat*30/bpm(0)
    if beat>=BARS*6:
        return DURATION+(beat-BARS*6)*30/bpm(BARS*6)
    pos=beat/STEP
    index=int(pos)
    return TIMES[index]+(TIMES[index+1]-TIMES[index])*(pos-index)

def bar_time(bar):
    return time_at(bar*6)

def remap_bar(bar):
    if bar<20: return bar+4
    if bar<60: return bar+12
    return bar+16

def score():
    events=[]
    rng=random.Random(SEED)
    for old in original.score():
        e=old.copy()
        b=remap_bar(e['bar'])
        start=b*6+(e['start']/original.EIGHTH-e['bar']*6)
        length=e['duration']/original.EIGHTH
        e.update(start=time_at(start),duration=time_at(start+length)-time_at(start),bar=b)
        # 조용한 장면에서는 일부 배경 성부를 비워 독주가 들릴 공간을 만든다.
        if e['part']=='violin1' and 32<=b<40:
            continue
        if e['part']=='oboe' and 8<=b<24:
            continue
        if e['part']=='harp' and b<8 and start-b*6>3.5:
            continue
        # 아래에 새로 쓴 현악 응답으로 기존 지속음을 교체한다.
        if e['part']=='violin2' and (16<=b<24 or 48<=b<64):
            continue
        if e['part']=='viola' and 48<=b<64:
            continue
        if b<8:
            scale=.82
        elif b<16:
            scale=.90
        elif b<24:
            scale=.92+.09*(b-16)/8
        elif b<40:
            scale=.84
        elif b<48:
            scale=.87+.16*(b-40)/8
        elif b<56:
            scale=.96+.08*(b-48)/8
        elif b<61:
            scale=1.07
        elif b<64:
            scale=1.05-.10*(b-61)
        elif b<72:
            scale=.88-.09*(b-64)/8
        else:
            scale=.81
        e['velocity']*=scale
        events.append(e)

    def note(part,pitch,bar,beat,length,velocity,attack_scale=1):
        if pitch is None:
            return
        start=bar*6+beat
        events.append(dict(part=part,pitch=pitch,start=time_at(start)+rng.uniform(-.005,.005),
            duration=time_at(start+length)-time_at(start),velocity=velocity*rng.uniform(.98,1.02),
            bar=bar,attack_scale=attack_scale))

    # 도입: 원래 주제의 D–F–E–D를 낮고 느리게 암시하고 성부 사이를 비운다.
    for b,pitch in [(0,62),(1,65),(2,64),(3,62)]:
        note('english_horn',pitch,b,1,3.9,43,.85)
    for b in [0,2]:
        note('bass',38,b,0,12.1,35)
        note('cello',50,b,.015,12.1,39)
        note('viola',57,b,.03,12.1,33)
        note('harp',50,b,0,5,35)
        note('harp',69,b,3,4,28)
    note('flute',81,2,3,7.7,32)

    # 첫 주제의 후반: 제2바이올린의 낮은 응답과 반진행.
    # 주선율의 음/리듬은 original.THEME 그대로 유지한다.
    for b in list(range(16,24))+list(range(48,64)):
        oldbar=b-4 if b<24 else b-12
        root,cell,mid,upper=original.VOICINGS[original.PROGRESSION[oldbar]]
        v=42 if b<24 else 45+(b-48)*.5
        note('violin2',upper,b,.02,3.10,v,.75)
        note('violin2',mid if mid>=55 else mid+12,b,3,3.10,v-3,.50)
        if b>=48:
            note('viola',mid,b,.03,3.1,v-3)
            note('viola',upper-12,b,3.02,3.1,v-1,.6)

    # 8마디의 풍경: 하프 두 음과 저음의 열린 5도 사이에 주제 조각이 떠오른다.
    interlude=['Dp','Dp','B','B','Gd','Gd','As','A']
    for k,key in enumerate(interlude):
        b=24+k
        root,cell,mid,upper=original.VOICINGS[key]
        note('bass',root,b,0,6.12,35)
        note('cello',cell,b,.015,6.12,36)
        if k>=4:
            note('viola',mid,b,.03,6.1,32)
        if k%2==0:
            note('harp',cell,b,0,5,33)
            note('harp',upper+12,b,3,5,28)
    for b,pitch,length in [(24,74,8),(26,77,7.5),(28,79,7),(30,76,5),(31,73,4)]:
        note('flute',pitch,b,.5,length,41,.8)
    note('clarinet',62,25,3,5.6,35)
    note('clarinet',65,27,3,5.6,36)
    note('horn',50,29,0,9,38)
    note('horn',57,31,0,4.6,39)

    # 두 번째 주제 끝의 호른 응답은 현악 절정을 예고한다.
    for b,pitches in [(40,(53,60)),(42,(50,58)),(44,(53,62)),(46,(52,57))]:
        for pitch in pitches:
            note('horn',pitch,b,.05,4.8,37+(b-40)*1.1)
    # 절정 직전에는 악기를 쌓기보다 한 박 물러서서 다음 진입을 선명하게 한다.
    for e in events:
        if e['bar']==47 and e['part'] in ['cello','viola','violin2','horn']:
            e['duration']=min(e['duration'],bar_time(48)-e['start']-.20)

    # 여운 8마디: 마지막 4마디는 승인된 버전의 목관 선율.
    # 새 4마디는 앞선 주제의 조각으로 연결해 같은 긴장도/음량으로 귀환한다.
    for b,key in [(72,'Dp'),(73,'Gd'),(74,'Dp'),(75,'Dp')]:
        root,cell,mid,upper=original.VOICINGS[key]
        note('bass',root,b,0,6.12,35)
        note('cello',cell,b,.02,6.12,38)
        note('viola',mid,b,.03,6.12,33)
        note('harp',cell,b,0,5,34)
        if b%2==0:
            note('harp',mid+12,b,3,4,29)
    for b,pitch in [(72,65),(73,67),(74,65),(75,62)]:
        note('clarinet',pitch,b,.3,4.6,40)

    # 같은 현의 음을 연속시켜 마디·루프 경계에 재어택을 만들지 않는다.
    merged=[]
    strings=['violin1','violin2','viola','cello','bass']
    for part in strings:
        line=sorted([e for e in events if e['part']==part],key=lambda e:e['start'])
        for e in line:
            if (merged and merged[-1]['part']==part and merged[-1]['pitch']==e['pitch']
                and abs(merged[-1]['start']+merged[-1]['duration']-e['start'])<.15):
                old=merged[-1]
                old['duration']=e['start']+e['duration']-old['start']
                old['velocity']=(old['velocity']+e['velocity'])/2
            else:
                merged.append(e.copy())
    events=[e for e in events if e['part'] not in strings]+merged
    assert all(e['duration']>0 for e in events)
    return sorted(events,key=lambda e:e['start'])
