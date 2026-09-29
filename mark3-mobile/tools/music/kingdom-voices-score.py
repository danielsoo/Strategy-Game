"""왕국의 기억 · 세 목소리 — 플루트, 독주 첼로, 호른이 주제를 이어받는다."""
from pathlib import Path
import copy
import importlib.util
import math
import random

spec = importlib.util.spec_from_file_location('journey', Path(__file__).with_name('kingdom-journey-score.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
TITLE = '왕국의 기억 · 세 목소리'
TITLE_EN = 'Memory of the Kingdom - Three Voices'
RATE, BARS, BAR, EIGHTH, DURATION = base.RATE, base.BARS, base.BAR, base.EIGHTH, base.DURATION
bar_time, time_at = base.bar_time, base.time_at
SEED = 290931
ROOM = copy.deepcopy(base.ROOM)
REMOVE_INSTRUMENTS = base.REMOVE_INSTRUMENTS[:]
MIX_OVERRIDES = copy.deepcopy(base.MIX_OVERRIDES)
MIX_OVERRIDES['flute'].update(gain=.66, send=.17)
MIX_OVERRIDES['horn'].update(gain=.88, send=.23)
EXTRA_INSTRUMENTS = copy.deepcopy(base.EXTRA_INSTRUMENTS)
EXTRA_INSTRUMENTS['cello_solo'] = dict(
    sfz='Strings - Notation/Cello Solo Sustain.sfz', family='strings',
    pan=.16, gain=.91, attack=.12, release=.26, send=.16, highpass=48)

# 같은 화성 위에서 긴 음과 짧은 응답이 이어지는 플루트 간주.
FLUTE = [
    [(74,3),(77,1),(76,2)], [(74,4),(None,2)],
    [(77,3),(74,2),(70,1)], [(74,4.5),(None,1.5)],
    [(79,3),(77,1),(74,2)], [(70,2),(74,3),(None,1)],
    [(74,2),(76,2),(74,2)], [(73,3),(69,2),(None,1)],
]

def score():
    replacements = {'flute': [(24,32)], 'clarinet': [(32,40)],
                    'violin1': [(40,44)], 'horn': [(40,44)]}
    events = [e.copy() for e in base.score()
              if not any(a <= e['bar'] < b for a,b in replacements.get(e['part'],[]))]
    # 솔로 동안 반주가 앞에 나오지 않도록 밀도를 낮춘다.
    for e in events:
        if 24 <= e['bar'] < 40:
            if e['part'] in ('violin1','violin2','viola','cello','horn'):
                e['velocity'] *= .76 if e['part'] != 'cello' else .61
            if e['part'] in ('bass_drum','timpani','tamtam'):
                e['velocity'] *= .83
        if 40 <= e['bar'] < 44 and e['part'] in ('trumpet','trombone','bass_trombone'):
            e['velocity'] *= .70
    rng = random.Random(SEED)
    def melody(part, phrase, start, shift, velocity):
        line = []
        for k, notes in enumerate(phrase):
            assert sum(n for _,n in notes) == 6
            beat = 0
            for j,(pitch,length) in enumerate(notes):
                next_pitch = notes[j+1][0] if j+1<len(notes) else phrase[k+1][0][0] if k+1<len(phrase) else None
                end = next_pitch is None or (k%4==3 and j==len(notes)-1)
                duration = length-.24 if end else length+.08
                if pitch is not None:
                    begin = (start+k)*6+beat
                    expression = .92+.13*math.sin(math.pi*(k%4+beat/6)/4)
                    e = dict(part=part,pitch=pitch+shift,start=time_at(begin)+rng.uniform(-.006,.006),
                             duration=time_at(begin+duration)-time_at(begin),
                             velocity=velocity*expression*rng.uniform(.985,1.015),bar=start+k,
                             attack_scale=1 if j==0 and k%4==0 else .48,
                             swell=[.88,1.04] if length>=3 else [.98,1.0])
                    if line and line[-1]['pitch']==e['pitch'] and abs(line[-1]['start']+line[-1]['duration']-e['start'])<.1:
                        line[-1]['duration']=e['start']+e['duration']-line[-1]['start']
                    else:
                        line.append(e)
                beat += length
        events.extend(line)
    melody('flute', FLUTE, 24, 0, 66)
    melody('cello_solo', base.SECOND[:8], 32, -12, 75)
    melody('horn', base.SECOND[8:12], 40, -12, 77)
    # 고조의 뒷부분에서 바이올린이 돌아오고 첼로는 짧게 화답한다.
    melody('cello_solo', [[(None,3),(65,2),(None,1)],[(62,4),(None,2)]], 44, 0, 48)
    return sorted(events,key=lambda e:e['start'])
