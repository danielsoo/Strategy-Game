"""왕국의 기억 · 북과 금관 — 승인된 선율에 음향 타악의 추진력과 깊이를 추가.

오디세이 참고는 놀란 감독 영화로 정정했다. 나니아, 어벤져스, 갓 오브 워,
왕좌의 게임 제작진 자료에서 질감·등장 순서·감정의 대비를 참고한 자체 편곡이다.
"""
from pathlib import Path
import copy
import importlib.util
import random

spec=importlib.util.spec_from_file_location('cinematic',Path(__file__).with_name('kingdom-cinematic-score.py'))
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
TITLE='왕국의 기억 · 북과 금관'
TITLE_EN='Memory of the Kingdom - Drums and Banners'
RATE=base.RATE
BARS=base.BARS
EIGHTH=base.EIGHTH
BAR=base.BAR
DURATION=base.DURATION
bar_time=base.bar_time
time_at=base.time_at
SEED=290929
ROOM=base.ROOM.copy()

# 큰북과 작은북을 따로 믹스해 큰북의 저역이 작은북의 타격에 묻히지 않게 한다.
REMOVE_INSTRUMENTS=['drums']
EXTRA_INSTRUMENTS={
    'bass_drum':{'sfz':'Percussion/Bass Drum & Snare.sfz','pan':-.06,'gain':.94,'family':'percussion','attack':.002,'release':1.15,'send':.14,'highpass':26},
    'snare_drum':{'sfz':'Percussion/Bass Drum & Snare.sfz','pan':.16,'gain':.45,'family':'percussion','attack':.002,'release':.22,'send':.18,'highpass':90},
    'tamtam':{'sfz':'Percussion/Cymbals & Tamtam.sfz','pan':.28,'gain':.26,'family':'percussion','attack':.008,'release':2.4,'send':.25,'highpass':34},
}
MIX_OVERRIDES=copy.deepcopy(base.MIX_OVERRIDES)
MIX_OVERRIDES.pop('drums',None)
MIX_OVERRIDES['timpani'].update(gain=.81,release=.85,send=.18)
MIX_OVERRIDES['cymbals'].update(gain=.22,send=.23)
MIX_OVERRIDES['cello'].update(gain=.64,send=.19)
MIX_OVERRIDES['horn'].update(gain=.75)
MIX_OVERRIDES['trumpet'].update(gain=.34)
MIX_OVERRIDES['trombone'].update(gain=.41)
MIX_OVERRIDES['bass_trombone'].update(gain=.35)
MIX_OVERRIDES['tuba'].update(gain=.32)

def harmony(bar):
    if bar<4: return 'Dp'
    if bar<24: return base.original.PROGRESSION[bar-4]
    if bar<32: return ['Dp','Dp','B','B','Gd','Gd','As','A'][bar-24]
    if bar<72: return base.original.PROGRESSION[bar-12]
    if bar<76: return ['Dp','Gd','Dp','Dp'][bar-72]
    return base.original.PROGRESSION[bar-16]

def score():
    rng=random.Random(SEED)
    events=[]
    for item in base.score():
        e=item.copy()
        # 타악은 곡 전체의 리듬 설계로 다시 쓰고, 주선율은 유지한다.
        if e['part'] in ['drums','timpani','cymbals']:
            continue
        if e['part']=='cello' and 40<=e['bar']<64:
            end=e['start']+e['duration']
            if end>bar_time(64):
                e.update(start=bar_time(64),duration=end-bar_time(64),bar=64)
                events.append(e)
            continue
        events.append(e)

    def note(part,pitch,bar,beat,length,velocity,**options):
        start=bar*6+beat
        events.append(dict(part=part,pitch=pitch,start=time_at(start)+rng.uniform(-.007,.007),
            duration=time_at(start+length)-time_at(start),velocity=velocity*rng.uniform(.96,1.04),bar=bar,**options))

    # 먼저 먼 곳의 징과 큰북 한 번으로 질량을 보여 준다. 매 마디를 채우지 않는다.
    note('tamtam',57,0,0,15,38)
    for b in [2,6]:
        note('bass_drum',48,b,0,4.5,40)
    for b in range(8,24):
        if b%2==0:
            note('bass_drum',48,b,0,4.6,49 if b<16 else 59)
        if b>=16:
            note('bass_drum',48,b,3,2.5,43)
            note('snare_drum',49,b,4,1,40 if b%2 else 46)
        if b in [11,15,19,23]:
            note('snare_drum',49,b,4.5,.6,34)
            note('snare_drum',49,b,5.25,.6,43)
    # 낮게 울리는 징이 간주의 공간으로 이어진다.
    note('tamtam',59,24,0,17,39)
    note('bass_drum',48,28,0,4.8,39)

    for b in range(32,64):
        root,cell,mid,upper=base.original.VOICINGS[harmony(b)]
        timp=root
        while timp<36: timp+=12
        while timp>48: timp-=12
        if b<40:
            # 작은 움직임에서 출발해 8마디 뒤부터 맥박이 뚜렷해진다.
            if b%2==0:
                note('bass_drum',48,b,0,4,48)
                note('timpani',timp,b,3,2.5,48)
            continue
        tension=min(1,(b-40)/16)
        for beat,weight in [(0,1),(3,.73)]:
            note('bass_drum',48,b,beat,2.9,(65+19*tension)*weight)
        if b%4==3 and b!=63:
            note('bass_drum',48,b,5,1.7,51+10*tension)
        # 6/8의 호흡 안에서 음량·쉼·종지 장식이 바뀌는 북 패턴.
        snare=[(1.5,.65),(4,1)] if b%2==0 else [(2,.64),(4.5,1),(5.25,.55)]
        for beat,weight in snare:
            if b==47 and beat>4: continue
            note('snare_drum',49,b,beat,.6,(52+16*tension)*weight)
        for beat,weight in [(0,1),(3,.67)]:
            note('timpani',timp,b,beat,2.7,(63+14*tension)*weight)
        if b%4==2:
            fifth=timp+7 if timp<=41 else timp-5
            note('timpani',fifth,b,5,1.7,48+10*tension)
        # 저음 현은 같은 화음의 음으로 움직여 타악과 금관 사이를 연결한다.
        for beat,pitch,dur,v in [(0,cell,1.42,56),(1.5,mid,1.34,45),(3,cell,2.60,51)]:
            note('cello',pitch,b,beat,dur,v+12*tension,attack_scale=.45,release_scale=.42)
        if b in [48,50,52,54,62]:
            note('trombone',mid,b,.04,4.6,55)
            note('bass_trombone',cell,b,.06,4.6,51)
            note('tuba',root,b,.07,4.5,48)

    # 실제로 연주된 롤 녹음을 지속한다. 단타를 빠르게 복제하는 방식은 쓰지 않는다.
    for b in [15,39,47,55]:
        root=base.original.VOICINGS[harmony(b)][0]
        while root<36: root+=12
        while root>48: root-=12
        note('timpani',root+24,b,0,5.35,66 if b<47 else 79,sustain_loop=True,swell=[.13,1])
        if b>=39:
            note('snare_drum',50,b,3,2.35,59,sustain_loop=True,swell=[.12,.85])
    for b in [39,47,55]:
        note('cymbals',52,b,0,6,56)
    for b,vel in [(16,47),(40,52),(48,63),(56,70),(60,49)]:
        note('cymbals',55,b,0,6,vel)
    for b,pitch,vel in [(48,57,61),(56,60,68),(64,59,43)]:
        note('tamtam',pitch,b,0,16,vel)

    # 영웅적인 첫 진입에서 주제의 일부를 트럼펫이 한 옥타브 아래로 받는다.
    for e in list(events):
        if e['part']=='violin1' and 48<=e['bar']<52:
            trumpet=e.copy()
            trumpet.update(part='trumpet',pitch=e['pitch']-12,velocity=58,attack_scale=.8)
            events.append(trumpet)

    # 절정 이후 북이 먼저 물러나고, 낮은 잔향이 다시 시작으로 이어진다.
    for b,v in [(64,58),(66,46),(68,39)]:
        note('bass_drum',48,b,0,4.5,v)
    note('timpani',38,64,0,5,51)
    note('tamtam',57,76,0,18,30)
    return sorted(events,key=lambda e:e['start'])
