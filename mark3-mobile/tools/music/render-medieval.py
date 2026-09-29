"""돌의 회랑: SSO의 녹음 샘플로 별도 WAV/FLAC/MP3 및 반복 청취판 생성.

이 악보에 쓰는 SFZ 기능(음역, 튜닝, 벨로시티 레이어, 라운드로빈,
샘플 루프)을 읽는 전용 렌더러다. 범용 SFZ 플레이어는 아니다.
원본 녹음에 없는 합주나 레가토 전이를 재현했다고 주장하지 않는다.
"""
from pathlib import Path
import argparse
import collections
import functools
import importlib.util
import json
import math
import re
import struct
import subprocess
import sys
from fractions import Fraction

ROOT=Path(__file__).resolve().parents[2]
CACHE=ROOT/'.music-cache'
sys.path.insert(0,str(CACHE/'python'))
import numpy as np
import soundfile as sf
from scipy import signal
import imageio_ffmpeg

parser=argparse.ArgumentParser(description='악보별로 별도 음원을 렌더링한다.')
parser.add_argument('--score',default='medieval-score.py')
parser.add_argument('--name',default='cloister-of-stone')
parser.add_argument('--excerpt-bars',nargs=2,type=int)
args=parser.parse_args()
if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',args.name):
    parser.error('--name에는 영문 소문자, 숫자, 하이픈만 쓸 수 있습니다.')
NAME=args.name
spec=importlib.util.spec_from_file_location('score',Path(__file__).with_name(args.score))
score=importlib.util.module_from_spec(spec)
spec.loader.exec_module(score)
RATE=score.RATE
N=round(score.DURATION*RATE)
bar_time=getattr(score,'bar_time',lambda bar:bar*score.BAR)
LIB=CACHE/'sso/Sonatina Symphonic Orchestra'
CONFIG=json.loads(Path(__file__).with_name('medieval-instruments.json').read_text(encoding='utf-8'))
for part in getattr(score,'REMOVE_INSTRUMENTS',[]):
    CONFIG.pop(part)
CONFIG.update(getattr(score,'EXTRA_INSTRUMENTS',{}))
for part,override in getattr(score,'MIX_OVERRIDES',{}).items():
    CONFIG[part].update(override)
OUT=ROOT/'public/music'

def midi(value):
    try:
        return int(value)
    except ValueError:
        match=re.fullmatch(r'([a-g])([#b]?)(-?\d+)',value.lower())
        if not match:
            raise ValueError(f'Invalid note {value}')
        letter,acc,octave=match.groups()
        return (int(octave)+1)*12+{'c':0,'d':2,'e':4,'f':5,'g':7,'a':9,'b':11}[letter]+{'':0,'#':1,'b':-1}[acc]

def expand(path):
    content=path.read_text(encoding='utf-8-sig')
    return re.sub(r'#include\s+"([^"]+)"',lambda m:expand(path.parent/m[1]),content)

def regions(filename):
    content=re.sub(r'//[^\n]*','',expand(LIB/filename))
    content=re.sub(r'^#.*$','',content,flags=re.M)
    group={}
    result=[]
    tokens=re.split(r'(<\w+>)',content)
    for tag,body in zip(tokens[1::2],tokens[2::2]):
        values=dict(re.findall(r'(\w+)\s*=\s*(.*?)(?=\s+\w+\s*=|$)',body,flags=re.S))
        values={k:v.strip() for k,v in values.items()}
        if tag=='<group>':
            group=values
        elif tag=='<region>':
            r={**group,**values}
            if r.get('trigger','attack')!='attack':
                continue
            if 'sample' not in r:
                continue
            if 'key' in r:
                r.update(lokey=r['key'],hikey=r['key'],pitch_keycenter=r['key'])
            for field,default in [('lokey','0'),('hikey','127'),('pitch_keycenter','60')]:
                r[field]=midi(r.get(field,default))
            r['path']=str(LIB/r['sample'].replace('\\','/').removeprefix('../'))
            assert Path(r['path']).is_file(),r['path']
            result.append(r)
    return result

def wav_loop(path):
    with open(path,'rb') as f:
        if f.read(4)!=b'RIFF':
            return None
        f.seek(12)
        while True:
            header=f.read(8)
            if len(header)<8:
                return None
            kind,size=struct.unpack('<4sI',header)
            if kind==b'smpl':
                data=f.read(size)
                if len(data)>=60 and struct.unpack_from('<I',data,28)[0]:
                    return struct.unpack_from('<II',data,44)
                return None
            f.seek(size+(size%2),1)

@functools.lru_cache(maxsize=100)
def sample(path,pitch,center,tune,transpose):
    x,sr=sf.read(path,dtype='float32',always_2d=True)
    # 좌석별 패닝 전에 원본의 극단적인 좌우 차이를 줄인다.
    if x.shape[1]==1:
        x=np.repeat(x,2,axis=1)
    else:
        mid=x.mean(axis=1,keepdims=True)
        x=mid+.48*(x-mid)
    ratio=2**((pitch-center+transpose+tune/100)/12)
    factor=Fraction(RATE/(sr*ratio)).limit_denominator(1200)
    y=signal.resample_poly(x,factor.numerator,factor.denominator,axis=0).astype(np.float32)
    return y,RATE/(sr*ratio),wav_loop(path)

def layer_weight(r,velocity):
    # SFZ의 lovel/hivel 경계는 MIDI 정수다. 사람다운 세기 변화는 아래 진폭에 남긴다.
    velocity=int(np.clip(round(velocity),0,127))
    if not float(r.get('lovel',0))<=velocity<=float(r.get('hivel',127)):
        return 0
    gain=1.
    for direction in ['in','out']:
        lo=r.get(f'xf{direction}_lovel')
        hi=r.get(f'xf{direction}_hivel')
        if lo is not None and hi is not None:
            frac=np.clip((velocity-float(lo))/max(1,float(hi)-float(lo)),0,1)
            gain*=frac if direction=='in' else 1-frac
    return float(gain)

def voice(event,r,config):
    x,factor,embedded=sample(r['path'],event['pitch'],r['pitch_keycenter'],float(r.get('tune',0)),float(r.get('transpose',0)))
    dur=event['duration']
    release=config['release']*event.get('release_scale',1)
    count=round((dur+release)*RATE)
    loop=None
    if 'loop_start' in r and 'loop_end' in r:
        loop=(int(r['loop_start']),int(r['loop_end']))
    elif embedded:
        loop=embedded
    if r.get('loop_mode') in ['one_shot','no_loop'] or (config['family'] in ['percussion','harp'] and not event.get('sustain_loop',False)):
        loop=None
    if loop:
        begin,end=(round(v*factor) for v in loop)
        end=min(end,len(x)-1)
        assert 0<=begin<end<len(x),(r['path'],begin,end,len(x))
        # 일부 원본 루프의 이음매를 20ms 겹친다. 샘플을 주기적으로 재어택하지 않는다.
        cross=min(round(.020*RATE),(end-begin)//5)
        indices=np.arange(count,dtype=np.int64)
        wrap=indices>=end
        indices[wrap]=begin+cross+(indices[wrap]-end)%(end-begin-cross)
        indices=np.clip(indices,0,len(x)-1)
        y=x[indices].copy()
        # 반복 구간 끝에서 시작 구간으로 같은 음을 선형 교차한다.
        mask=(indices>=end-cross)&(np.arange(count)>=begin)
        blend=(indices[mask]-(end-cross))/max(1,cross)
        other=begin+(indices[mask]-(end-cross))
        y[mask]=y[mask]*(1-blend[:,None])+x[other]*blend[:,None]
    else:
        count=min(count,len(x))
        y=x[:count].copy()
    t=np.arange(count)/RATE
    if config['family'] in ['harp','percussion']:
        env=np.minimum(1,t/max(.001,config['attack']))
    else:
        attack=min(config['attack']*event.get('attack_scale',1),dur*.26)
        env=np.sin(np.clip(t/attack,0,1)*math.pi/2)**2
        # 프레이즈 안에서 자연스럽게 부풀고 가라앉는 세기. 인공 비브라토 없음.
        env*=.91+.09*np.sin(np.pi*np.clip(t/dur,0,1))
    if 'swell' in event:
        low,high=event['swell']
        progression=np.sin(np.clip(t/dur,0,1)*math.pi/2)**2
        env*=low+(high-low)*progression
    env*=np.cos(np.clip((t-dur)/release,0,1)*math.pi/2)**2
    # 원본이 먼저 끝나는 비루프 샘플도 파형이 잘리지 않게 한다.
    fade=min(round(.025*RATE),count)
    env[-fade:]*=np.linspace(1,0,fade)
    y*=env[:,None].astype(np.float32)
    y*=10**(float(r.get('volume',0))/20)
    y*=((event['velocity']/85)**1.3)*layer_weight(r,event['velocity'])
    return y

def add_circular(dest,a,start):
    start%=len(dest)
    first=min(len(a),len(dest)-start)
    dest[start:start+first]+=a[:first]
    if first<len(a):
        dest[:len(a)-first]+=a[first:]

def main():
    OUT.mkdir(exist_ok=True)
    events=score.score()
    # 첫 마디와 마지막 마디가 같은 현악 음이면 경계에서도 활을 이어간다.
    for part in ['violin1','violin2','viola','cello','bass']:
        line=[e for e in events if e['part']==part]
        first,last=line[0],line[-1]
        if first['pitch']==last['pitch'] and first['start']<.1 and last['start']+last['duration']>=score.DURATION-.05:
            last['duration']=score.DURATION+first['start']+first['duration']-last['start']
            events.remove(first)
    dry=np.zeros((N,2),np.float32)
    send=np.zeros_like(dry)
    stats={}
    for part,config in CONFIG.items():
        regs=regions(config['sfz'])
        track=np.zeros_like(dry)
        line=[e for e in events if e['part']==part]
        assert line, f'Empty instrument {part}'
        used=set()
        for i,e in enumerate(line):
            selected=[r for r in regs if r['lokey']<=e['pitch']<=r['hikey'] and layer_weight(r,e['velocity'])>0
                      and (int(r.get('seq_position',1))-1)==i%int(r.get('seq_length',1))]
            if not selected:
                raise ValueError(f'No matching sample: {part} {e}')
            for r in selected:
                used.add(r['path'])
                y=voice(e,r,config)
                add_circular(track,y,round(e['start']*RATE))
        # 시간축을 두 번 연장해 필터의 시작 상태도 반복 경계와 일치시킨다.
        highpass=signal.butter(2,config.get('highpass',42 if part not in ['bass','contrabassoon','tuba','timpani','drums'] else 28),fs=RATE,btype='highpass',output='sos')
        cutoff={'strings':6100,'woodwinds':6800,'brass':4700,'harp':7200,'percussion':9000}[config['family']]
        lowpass=signal.butter(2,cutoff,fs=RATE,output='sos')
        for sos in [highpass,lowpass]:
            _,zi=signal.sosfilt(sos,track[-RATE:],axis=0,zi=np.zeros((len(sos),2,2)))
            track,_=signal.sosfilt(sos,track,axis=0,zi=zi)
            track=track.astype(np.float32)
        # 악기별 표본 녹음 레벨만 보정하고, 곡 안의 세기 변화는 유지한다.
        rmsblocks=np.sqrt(np.mean(track[:N//4410*4410].reshape(-1,4410,2)**2,axis=(1,2)))
        active=rmsblocks[rmsblocks>max(.00001,rmsblocks.max()*.14)]
        typical=float(np.median(active))
        target={'strings':.054,'woodwinds':.050,'brass':.052,'harp':.041,'percussion':.039}[config['family']]
        gain=min(12,target/max(typical,.0001))*config['gain']
        track*=gain
        pan=config['pan']
        track[:,0]*=math.sqrt(1-pan)
        track[:,1]*=math.sqrt(1+pan)
        dry+=track
        send+=track*config.get('send',{'strings':.19,'woodwinds':.22,'brass':.25,'harp':.16,'percussion':.23}[config['family']])
        stats[part]={'notes':len(line),'samples':len(used),'gain':round(gain,3),'rms':round(float(np.sqrt(np.mean(track**2))),5)}
        print(part,stats[part],flush=True)
    # 1.6초의 어두운 홀: 전 파트가 같은 공간에 들리게 한다.
    # 원형 convolution으로 지난 반복의 잔향까지 시작에 포함한다.
    rng=np.random.default_rng(score.SEED)
    room=getattr(score,'ROOM',{})
    irlen=round(room.get('seconds',1.8)*RATE)
    wet=np.zeros_like(dry)
    for ch in range(2):
        ir=rng.normal(0,1,irlen).astype(np.float32)
        t=np.arange(irlen)/RATE
        ir*=np.exp(-t*room.get('decay',5.1))
        ir[:round(room.get('predelay',.029)*RATE)]=0
        ir=signal.sosfilt(signal.butter(2,room.get('damping',3600),fs=RATE,output='sos'),ir)
        ir/=max(np.linalg.norm(ir),1e-9)
        for sec,amp in [(.031,.14),(.053,.105),(.079,.073),(.113,.044)]:
            ir[round((sec+ch*.004)*RATE)]+=amp
        conv=signal.fftconvolve(send[:,ch]*.83+send[:,1-ch]*.17,ir).astype(np.float32)
        wet[:,ch]=conv[:N]
        wet[:len(conv)-N,ch]+=conv[N:]
    mix=dry+wet
    mix-=mix.mean(axis=0)
    # 리미터로 세기를 눌러 없애지 않고, 여유 있는 고정 게인으로 마스터링.
    peak=float(np.max(np.abs(mix)))
    mix*=10**(-1.8/20)/peak
    assert np.isfinite(mix).all()
    filename=OUT/f'{NAME}.wav'
    sf.write(filename,mix,RATE,subtype='PCM_24')
    # 포맷별 float 양자화 반올림 차이를 없애 원본과 비트까지 같게 한다.
    pcm,_=sf.read(filename,dtype='int32')
    sf.write(OUT/f'{NAME}.flac',pcm,RATE,subtype='PCM_24')
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    def encode(src,dest):
        subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(src),'-codec:a','libmp3lame','-b:a','256k',
                        '-metadata',f'title={getattr(score,"TITLE_EN","Cloister of Stone")}','-metadata','artist=Mark3 Original Score',str(dest)],check=True)
    encode(filename,OUT/f'{NAME}.mp3')
    # 청취판의 8초 위치가 실제 반복 경계다. 실사용 루프는 WAV/FLAC.
    seam=np.concatenate([mix[-8*RATE:],mix[:8*RATE]])
    sf.write(CACHE/f'{NAME}-loop-check.wav',seam,RATE,subtype='PCM_24')
    encode(CACHE/f'{NAME}-loop-check.wav',OUT/f'{NAME}-loop-check.mp3')
    if args.excerpt_bars:
        a,b=args.excerpt_bars
        assert 0<=a<b<=score.BARS
        clip=mix[round(bar_time(a)*RATE):round(bar_time(b)*RATE)].copy()
        fade=round(.12*RATE)
        clip[:fade]*=np.linspace(0,1,fade)[:,None]
        clip[-fade:]*=np.linspace(1,0,fade)[:,None]
        sf.write(CACHE/f'{NAME}-theme.wav',clip,RATE,subtype='PCM_24')
        encode(CACHE/f'{NAME}-theme.wav',OUT/f'{NAME}-theme.mp3')
    block=np.sqrt(np.mean(mix[:N//441*441].reshape(-1,441,2)**2,axis=(1,2)))
    rms=float(np.sqrt(np.mean(mix**2)))
    report={'title':score.TITLE,'duration_seconds':N/RATE,'frames':N,'sample_rate':RATE,'seed':score.SEED,
            'sso_commit':json.loads((CACHE/'sso-tree.json').read_text())['commit'],
            'peak_dbfs':float(20*np.log10(np.max(np.abs(mix)))),
            'rms_dbfs':float(20*np.log10(rms)),
            'minimum_10ms_rms_dbfs':float(20*np.log10(block.min())),
            'seam_step':np.abs(mix[0]-mix[-1]).tolist(),
            'internal_step_p99':np.percentile(np.abs(np.diff(mix,axis=0)),99,axis=0).tolist(),
            'sections_rms_dbfs':[float(20*np.log10(np.sqrt(np.mean(mix[round(bar_time(i)*RATE):round(bar_time(min(i+8,score.BARS))*RATE)]**2)))) for i in range(0,score.BARS,8)],
            'instruments':stats}
    (ROOT/f'docs/{NAME}-analysis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (CACHE/f'{NAME}-score-events.json').write_text(json.dumps(events,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='instruments'},indent=2,ensure_ascii=True),flush=True)

if __name__=='__main__':
    main()
