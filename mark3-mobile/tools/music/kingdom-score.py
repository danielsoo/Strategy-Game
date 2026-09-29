"""왕국의 기억 — 16마디의 노래하는 주제와 후반 변주를 중심으로 다시 쓴 곡.

기존 돌의 회랑의 악보/음원을 덮어쓰지 않는다. D 단조, 6/8, 64마디.
음표를 늘리는 대신 주제의 도약, 긴 음, 응답, 종지를 명확하게 나눴다.
"""
import math
import random

TITLE='왕국의 기억 · Memory of the Kingdom'
TITLE_EN='Memory of the Kingdom'
RATE=44100
BARS=64
EIGHTH=60/78/2
BAR=EIGHTH*6
DURATION=BARS*BAR
SEED=290927

# 주제는 반주보다 앞으로. 음정 복제나 디튠으로 두껍게 만들지 않는다.
MIX_OVERRIDES={
    'violin1':{'gain':1.16,'attack':.16,'release':.24},
    'violin2':{'gain':.43,'release':.32},
    'viola':{'gain':.39,'release':.32},
    'cello':{'gain':.59,'release':.34},
    'bass':{'gain':.40},
    'harp':{'gain':.47},
    'english_horn':{'gain':.65},
    'clarinet':{'gain':.53},
    'flute':{'gain':.40},
    'oboe':{'gain':.39},
    'horn':{'gain':.66},
    'trumpet':{'gain':.24},
    'trombone':{'gain':.27},
    'bass_trombone':{'gain':.22},
    'tuba':{'gain':.21},
    'timpani':{'gain':.40},
    'drums':{'gain':.24},
    'cymbals':{'gain':.12},
    'triangle':{'gain':.12},
    'xylophone':{'gain':.11},
}

# 베이스 / 첼로 / 비올라 / 제2바이올린. 선율 아래의 반진행과 전위를 쓴다.
VOICINGS={
    'Dp':(38,50,57,62), 'D':(38,50,57,65), 'Dc':(36,50,57,65),
    'Df':(41,50,57,65), 'Da':(33,50,57,65),
    'B':(34,46,53,62), 'Bd':(38,46,53,62),
    'F':(41,48,57,65), 'Fa':(33,48,57,65),
    'G':(43,50,58,62), 'Gd':(38,50,58,67),
    'C':(36,48,55,64), 'Ce':(40,48,55,64),
    'As':(33,45,55,62), 'A':(33,45,57,61),
}
A_HARMONY=['D','Dc','B','Fa','G','Df','As','A',
           'D','C','B','Fa','G','Da','A','D']
B_HARMONY=['F','Ce','B','F','G','Df','As','A',
           'B','F','G','D','B','G','As','A']
PROGRESSION=['Dp','Dp','Gd','As']+A_HARMONY+B_HARMONY+A_HARMONY+[
    'D','Dc','B','Fa','G','Df','As','A']+['Dp','Gd','Dp','Dp']

# 식별되는 핵심: D–F–E–D에서 A로 내려앉고, 응답에서 A5까지 열린다.
# 한 마디의 모든 길이는 6이며, 붙임줄은 음이 이어지는 곳에서 실제로 병합한다.
THEME=[
    [(74,3),(77,1),(76,.5),(74,1.5)],
    [(69,4.5),(72,.5),(74,1)],
    [(77,3),(74,1),(70,2)],
    [(72,4),(69,1),(72,1)],
    [(74,3),(79,2),(77,1)],
    [(76,1),(74,2),(69,2),(None,1)],
    [(70,2),(69,1),(67,2),(64,1)],
    [(73,3),(69,2),(None,1)],
    [(74,3),(77,1),(81,2)],
    [(79,3),(76,2),(74,1)],
    [(77,4),(74,1),(70,1)],
    [(72,3),(69,1),(72,2)],
    [(79,3),(77,1),(74,2)],
    [(77,2),(76,1),(74,2),(72,1)],
    [(73,3),(76,1),(74,1),(73,1)],
    [(74,5),(None,1)],
]

# 두 번째 주제: 낮은 곳에서 시작하는 긴 음. 첫 주제의 리듬을 그대로 반복하지 않는다.
SECOND=[
    [(69,5),(72,1)],
    [(76,4),(74,1),(72,1)],
    [(74,3),(70,3)],
    [(69,4),(None,2)],
    [(70,2),(74,4)],
    [(69,3),(65,2),(None,1)],
    [(67,4),(69,2)],
    [(73,4),(None,2)],
    [(74,3),(77,2),(82,1)],
    [(81,4),(77,2)],
    [(79,3),(77,1),(74,2)],
    [(77,3),(76,1),(74,2)],
    [(70,3),(74,3)],
    [(74,2),(79,3),(77,1)],
    [(76,3),(74,3)],
    [(73,3),(69,2),(None,1)],
]

# 再현에서는 전반을 기억하게 두고 후반을 새로 써 절정이 한 번만 오게 한다.
REPRISE=THEME[:8]+[
    [(77,2),(81,4)],
    [(84,3),(83,1),(79,2)],
    [(82,4),(81,1),(77,1)],
    [(81,3),(79,1),(77,2)],
    [(79,3),(82,2),(81,1)],
    [(77,2),(76,1),(74,3)],
    [(73,3),(76,1),(74,1),(73,1)],
    [(74,5),(None,1)],
]

def score():
    rng=random.Random(SEED)
    events=[]
    def note(part,pitch,bar,beat,length,velocity,attack_scale=1):
        if pitch is None:
            return
        events.append(dict(part=part,pitch=pitch,start=(bar*6+beat)*EIGHTH+rng.uniform(-.006,.006),
            duration=length*EIGHTH,velocity=velocity*rng.uniform(.98,1.02),bar=bar,attack_scale=attack_scale))

    def melody(part,phrase,bar,shift=0,velocity=68):
        for k,notes in enumerate(phrase):
            assert abs(sum(n[1] for n in notes)-6)<1e-9
            beat=0
            for j,(pitch,length) in enumerate(notes):
                next_note=notes[j+1][0] if j+1<len(notes) else (phrase[k+1][0][0] if k+1<len(phrase) else None)
                phrase_end=(k%4==3 and j==len(notes)-1) or next_note is None
                duration=length-.18 if phrase_end else length+.12
                # 강박만 크게 치지 않고 문장 중간을 부풀린 뒤 문장 끝에서 물러난다.
                position=(k%4+beat/6)/4
                expression=.94+.11*math.sin(math.pi*position)
                note(part,None if pitch is None else pitch+shift,bar+k,beat,duration,velocity*expression,
                     1 if (k%4==0 and j==0) else .46)
                beat+=length

    for b,key in enumerate(PROGRESSION):
        root,cell,mid,upper=VOICINGS[key]
        # 구간별 대비를 두되 첫 반복과 마지막 반복은 같은 질감으로 돌아온다.
        if b<4: level=.25
        elif b<12: level=.40
        elif b<20: level=.56
        elif b<28: level=.27
        elif b<36: level=.40+(b-28)*.035
        elif b<44: level=.68
        elif b<49: level=.86
        elif b<52: level=.73-(b-49)*.10
        elif b<60: level=.35-(b-52)*.012
        else: level=.25

        note('bass',root,b,0,6.12,40+24*level)
        note('cello',cell,b,.01,6.12,43+27*level)
        note('viola',mid,b,.03,6.12,37+26*level)
        # 처음엔 중역의 세 성부만 남겨 잉글리시 호른이 잘 들리게 한다.
        if b>=4 and b<60:
            note('violin2',upper,b,.015,6.10,38+28*level)
        if 20<=b<28:
            # 낮은 클라리넷 주제를 덮지 않는 높은 현의 가는 지속음.
            note('violin1',upper+12,b,.02,6.08,35)

        # 4마디마다 분산화음 방향과 박을 바꿔 기계적인 4음 루프를 줄인다.
        pattern=[(0,cell,48),(1,mid,36),(3,upper,43)] if b%4<2 else [(0,cell,47),(2,upper,40),(4,mid+12,37)]
        if 44<=b<49:
            pattern=[(0,cell,54),(3,upper+12,47)]
        for beat,pitch,v in pattern:
            note('harp',pitch,b,beat,4,v+level*5)
        if b%4==3 and b<60:
            note('harp',mid+12,b,5,2,33)

        if (12<=b<20 or 28<=b<52) and b%2==0:
            note('bassoon',cell,b,.03,4.8,38+level*14)
        if 20<=b<36 and b%2==1:
            note('bass_clarinet',cell,b,0,4.7,38)
        if 36<=b<49 and b%2==0:
            note('contrabassoon',root,b,.05,4.7,40+level*8)
        # 호른이 선율을 맡는 구간에는 호른 화음을 겹치지 않는다.
        if 32<=b<36 or 44<=b<50:
            note('horn',mid,b,0,5.1,51+level*11)
            if b%2==0:
                note('horn',cell,b,.02,5,44+level*9)
        if 44<=b<49:
            note('trombone',mid,b,.03,4.5,54)
            note('bass_trombone',cell,b,.05,4.5,48)
            if b%2==0:
                note('tuba',root,b,.05,4.5,48)
        if b in [12,16,28,32,36,40,44,46,48]:
            timp=38 if key.startswith('D') or key=='B' else 43 if key.startswith('G') else 45 if key.startswith('A') else 41 if key.startswith('F') else 36
            note('timpani',timp,b,0,5,58 if b>=36 else 44)
        if b in [36,44,48]:
            note('drums',48,b,0,5,58)
        if b in [35,43,47]:
            for beat,v in [(4,35),(5,42),(5.5,31)]:
                note('drums',49,b,beat,.7,v)
        if b in [19,59]:
            note('triangle',52,b,3,5,40)
        if b in [35,43]:
            note('cymbals',52,b,0,6,44)
        if b==44:
            note('cymbals',55,b,0,5,46)
        if b in [18,34,58]:
            note('xylophone',73 if key=='A' else upper+12,b,3,1.5,38)
            note('xylophone',69 if key=='A' else mid+12,b,4.5,1.2,34)

    # 곡을 틀고 바로 동기를 들려준 뒤, 9초부터 완전한 첫 주제를 제시한다.
    melody('english_horn',THEME[:2],0,-12,61)
    melody('english_horn',[[(67,3),(70,2),(69,1)],[(69,4),(None,2)]],2,0,57)
    melody('violin1',THEME,4,0,76)
    # 목관은 바이올린 전체를 상시 복제하지 않고 문장 끝에만 색을 더한다.
    melody('oboe',THEME[4:8],8,0,43)
    melody('flute',THEME[12:16],16,0,43)
    melody('clarinet',SECOND[:8],20,-12,65)
    melody('violin1',SECOND[8:],28,0,70)
    melody('english_horn',SECOND[12:],32,-12,47)
    melody('violin1',REPRISE,36,0,85)
    melody('horn',THEME[:8],36,-12,64)
    melody('trumpet',REPRISE[8:12],44,-12,49)
    melody('piccolo',REPRISE[8:12],44,0,42)
    melody('oboe',THEME[:4],52,0,57)
    melody('violin1',THEME[4:8],56,0,59)
    melody('flute',THEME[4:8],56,0,43)
    melody('english_horn',[
        [(62,4),(65,2)],[(67,3),(65,1),(62,2)],
        [(65,2),(64,1),(62,3)],[(57,4),(None,2)]
    ],60,0,52)

    # 붙임줄: 같은 음이 연속될 때 새 활/새 어택을 만들지 않는다.
    merged=[]
    sustain=['violin1','violin2','viola','cello','bass']
    for part in sustain:
        line=sorted([e for e in events if e['part']==part],key=lambda e:e['start'])
        for e in line:
            if (merged and merged[-1]['part']==part and merged[-1]['pitch']==e['pitch']
                and abs(merged[-1]['start']+merged[-1]['duration']-e['start'])<.13):
                previous=merged[-1]
                previous['duration']=e['start']+e['duration']-previous['start']
                previous['velocity']=(previous['velocity']+e['velocity'])/2
            else:
                merged.append(e.copy())
    events=[e for e in events if e['part'] not in sustain]+merged
    assert len(PROGRESSION)==BARS
    return sorted(events,key=lambda e:e['start'])
