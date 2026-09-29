"""왕국의 기억 · 여정 — 멜로디와 타이밍을 고정하지 않고 전체 흐름에 맞춰 수정.

서정적인 주제의 도약과 종지를 다듬고, 북의 맥박 위에서 긴 음이 숨 쉴 공간을 만든다.
절정의 고음은 한 번 길게 펼친 뒤 가라앉힌다. 이전 모든 시안은 그대로 보존한다.
"""
from pathlib import Path
import importlib.util
import math
import random

spec=importlib.util.spec_from_file_location('epic',Path(__file__).with_name('kingdom-epic-score.py'))
base=importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
TITLE='왕국의 기억 · 여정'
TITLE_EN='Memory of the Kingdom - The Journey'
RATE=base.RATE
BARS=base.BARS
BAR=base.BAR
EIGHTH=base.EIGHTH
DURATION=base.DURATION
bar_time=base.bar_time
time_at=base.time_at
SEED=290930
ROOM=base.ROOM
MIX_OVERRIDES=base.MIX_OVERRIDES
REMOVE_INSTRUMENTS=base.REMOVE_INSTRUMENTS
EXTRA_INSTRUMENTS=base.EXTRA_INSTRUMENTS

# 앞선 시안의 첫 동기에서 출발하지만 음 순서와 길이는 자유롭게 다시 쓴다.
THEME=[
    [(74,3),(77,1),(76,1),(74,1)],
    [(69,3),(74,2),(76,1)],
    [(77,4.5),(74,1.5)],
    [(72,5),(None,1)],
    [(74,2),(79,3),(77,1)],
    [(76,1),(74,4),(None,1)],
    [(70,1),(69,2),(67,2),(69,1)],
    [(73,4),(69,1),(None,1)],
    [(77,3),(81,3)],
    [(79,4),(76,2)],
    [(77,3),(74,3)],
    [(72,4),(69,1),(72,1)],
    [(74,1),(79,2),(77,1),(74,2)],
    [(76,1),(77,2),(76,1),(74,2)],
    [(73,3),(76,2),(73,1)],
    [(74,5),(None,1)],
]
SECOND=[
    [(69,6)],
    [(72,3),(76,2),(74,1)],
    [(74,4),(70,2)],
    [(69,5),(None,1)],
    [(70,2),(74,4)],
    [(65,3),(69,2),(None,1)],
    [(67,3),(69,2),(70,1)],
    [(73,4),(None,2)],
    [(70,2),(74,2),(77,2)],
    [(81,3),(79,1),(77,2)],
    [(79,4),(74,2)],
    [(77,3),(76,1),(74,2)],
    [(77,2),(82,3),(81,1)],
    [(79,3),(77,1),(74,2)],
    [(76,2),(74,4)],
    [(73,3),(76,2),(None,1)],
]
REPRISE=THEME[:8]+[
    [(77,3),(81,2),(79,1)],
    [(79,3),(84,3)],
    [(82,4),(81,1),(77,1)],
    [(81,3),(79,1),(77,2)],
    [(79,2),(82,3),(81,1)],
    [(77,3),(76,1),(74,2)],
    [(76,3),(73,2),(76,1)],
    [(74,5),(None,1)],
]

def score():
    replacements={
        'violin1':[(8,24),(40,64),(68,72)],
        'flute':[(20,24),(68,72)],
        'clarinet':[(32,40)],
        'english_horn':[(44,48)],
        'horn':[(48,56)],
        'trumpet':[(48,60)],
        'piccolo':[(56,60)],
        'oboe':[(64,68)],
    }
    events=[e.copy() for e in base.score() if not any(a<=e['bar']<b for a,b in replacements.get(e['part'],[]))]
    rng=random.Random(SEED)
    def melody(part,phrase,start,shift,velocity):
        line=[]
        for k,notes in enumerate(phrase):
            assert sum(length for _,length in notes)==6
            beat=0
            for j,(pitch,length) in enumerate(notes):
                next_pitch=notes[j+1][0] if j+1<len(notes) else phrase[k+1][0][0] if k+1<len(phrase) else None
                phrase_end=next_pitch is None or (k%4==3 and j==len(notes)-1)
                duration=length-.22 if phrase_end else length+.10
                if pitch is not None:
                    begin=(start+k)*6+beat
                    position=(k%4+beat/6)/4
                    expression=.92+.13*math.sin(math.pi*position)
                    event=dict(part=part,pitch=pitch+shift,start=time_at(begin)+rng.uniform(-.005,.005),
                        duration=time_at(begin+duration)-time_at(begin),velocity=velocity*expression*rng.uniform(.985,1.015),
                        bar=start+k,attack_scale=1 if k%4==0 and j==0 else .44)
                    if line and line[-1]['pitch']==event['pitch'] and abs(line[-1]['start']+line[-1]['duration']-event['start'])<.1:
                        previous=line[-1]
                        previous['duration']=event['start']+event['duration']-previous['start']
                    else:
                        line.append(event)
                beat+=length
        events.extend(line)

    melody('violin1',THEME,8,0,73)
    melody('flute',THEME[12:],20,0,39)
    melody('clarinet',SECOND[:8],32,-12,56)
    melody('violin1',SECOND[8:],40,0,68)
    melody('english_horn',SECOND[12:],44,-12,43)
    melody('violin1',REPRISE,48,0,88)
    melody('horn',THEME[:8],48,-12,65)
    melody('trumpet',THEME[:4],48,-12,56)
    melody('trumpet',REPRISE[8:12],56,-12,55)
    melody('piccolo',REPRISE[8:12],56,0,44)
    melody('oboe',THEME[:4],64,0,48)
    melody('violin1',THEME[4:8],68,0,50)
    melody('flute',THEME[4:8],68,0,38)
    return sorted(events,key=lambda e:e['start'])
