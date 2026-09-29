"""왕국의 기억 · 함께 부르는 주제: 하프와 바이올린 독주, 전 편성의 귀환."""
from pathlib import Path
import copy
import importlib.util
import random

spec = importlib.util.spec_from_file_location('voices', Path(__file__).with_name('kingdom-voices-score.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
journey = base.base
original = journey.base.base.original
TITLE = '왕국의 기억 · 함께 부르는 주제'
TITLE_EN = 'Memory of the Kingdom - Together'
RATE, BARS, BAR, EIGHTH, DURATION = base.RATE, base.BARS, base.BAR, base.EIGHTH, base.DURATION
bar_time, time_at = base.bar_time, base.time_at
SEED = 290932
ROOM = copy.deepcopy(base.ROOM)
REMOVE_INSTRUMENTS = base.REMOVE_INSTRUMENTS[:]
MIX_OVERRIDES = copy.deepcopy(base.MIX_OVERRIDES)
MIX_OVERRIDES['harp'].update(gain=.66, send=.15)
EXTRA_INSTRUMENTS = copy.deepcopy(base.EXTRA_INSTRUMENTS)
EXTRA_INSTRUMENTS['violin_solo'] = dict(
    sfz='Strings - Notation/Violin Solo 1 Sustain (looped).sfz', family='strings',
    pan=-.30, gain=.94, attack=.105, release=.24, send=.16, highpass=140)

def score():
    events = []
    rng = random.Random(SEED)
    for old in base.score():
        e = old.copy()
        if e['start'] >= bar_time(64):
            continue
        e['duration'] = min(e['duration'],bar_time(64)-e['start'])
        if 4 <= e['bar'] < 8:
            if e['part'] in ('harp','english_horn','flute','horn','bass_drum','timpani'):
                continue
            e['velocity'] *= .62
        if 8 <= e['bar'] < 16:
            if e['part'] == 'violin1':
                e['part'] = 'violin_solo'
            elif e['part'] in ('violin2','viola','cello','horn'):
                e['velocity'] *= .78
        events.append(e)

    def note(part,pitch,bar,beat,length,velocity,**options):
        start=bar*6+beat
        events.append(dict(part=part,pitch=pitch,start=time_at(start)+rng.uniform(-.004,.004),
            duration=time_at(start+length)-time_at(start),velocity=velocity*rng.uniform(.98,1.02),
            bar=bar,**options))

    # 하프의 높은 음에 주제 윤곽을 놓고, 낮은 분산화음은 작게 받친다.
    for b,key,melody in [(4,'Dp',[74,77,76]),(5,'Dp',[74,69,74]),
                         (6,'Gd',[79,77,74]),(7,'As',[74,76,73])]:
        root,cell,mid,upper=original.VOICINGS[key]
        for beat,pitch in [(0,cell),(.18,mid),(.36,upper)]:
            note('harp',pitch,b,beat,4,37)
        for beat,pitch in zip([.65,2.65,4.65],melody):
            note('harp',pitch,b,beat,2.4,76 if beat==.65 else 68)

    # 마지막 16마디: 주제는 현악, 화성은 목관·금관, 맥박은 북이 함께 맡는다.
    # 마지막 네 마디에서 전체가 함께 작아져 도입으로 연결된다.
    for k,key in enumerate(original.A_HARMONY):
        b=64+k
        root,cell,mid,upper=original.VOICINGS[key]
        level = 1 if k<12 else [1,.85,.66,.46][k-12]
        for part,pitch,v in [('violin2',upper,55),('viola',mid,50),('cello',cell,58),('bass',root,54),
                             ('clarinet',upper,42),('english_horn',upper,38),('bass_clarinet',cell,37),
                             ('bassoon',cell,41),('contrabassoon',root,35),('trombone',mid,46),
                             ('bass_trombone',cell,44),('tuba',root,43)]:
            note(part,pitch,b,.04,5.72,v*level,attack_scale=.7,
                 swell=[1,.66] if k==15 else [.92,1.03])
        # 하프와 독주 현도 합주 속에서 대선율·화음으로 돌아온다.
        note('cello_solo',cell+12,b,.1,5.55,42*level,attack_scale=.6)
        for beat,pitch in [(0,cell),(1,mid),(2,upper),(3,upper+12),(4,mid+12),(5,upper)]:
            note('harp',pitch,b,beat,2.2,44*level)
        phrase=journey.THEME[k]
        beat=0
        for pitch,length in phrase:
            if pitch is not None:
                for part,shift,v in [('violin1',0,78),('horn',-12,62),('flute',0,46)]:
                    note(part,pitch+shift,b,beat,max(.2,length-.15),v*level,attack_scale=.5)
                if k in (0,1,2,3,8,9,10,11):
                    note('trumpet',pitch-12,b,beat,max(.2,length-.2),48*level,attack_scale=.7)
                if k>=8:
                    note('violin_solo',pitch,b,beat,max(.2,length-.15),45*level,attack_scale=.5)
                if k%2==0:
                    note('oboe',pitch,b,beat,max(.2,length-.2),38*level)
                if 8<=k<12 and beat==0:
                    note('piccolo',pitch,b,beat,length-.2,34)
                    note('xylophone',min(pitch,82),b,beat,1.5,35)
            beat+=length
        timp=root
        while timp<36: timp+=12
        while timp>48: timp-=12
        for beat,v in [(0,68),(3,48)]:
            note('timpani',timp,b,beat,2.8,v*level)
            note('bass_drum',48,b,beat,2.5,v*level)
        if k<15:
            note('snare_drum',49,b,4,1,48*level)
        if k in (0,8):
            note('cymbals',55,b,0,6,53)
            note('tamtam',57,b,0,10,46)
            note('triangle',52,b,3,4,36)
    assert all(e['duration']>0 for e in events)
    return sorted(events,key=lambda e:e['start'])
