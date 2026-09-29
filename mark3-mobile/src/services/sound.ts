// 효과음은 Web Audio, 배경음은 확정된 관현악 녹음 샘플 편곡을 사용한다.
// 첫 입력 후 재생하며, 설정의 음량·음소거를 따른다.

import { getSettings, onSettings } from './settings';

type AC = AudioContext;
let ctx: AC | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let unlocked = false;

function audio(): AC | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor() as AC;
  } catch {
    return null;
  }
  sfxBus = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus.connect(ctx.destination);
  musicBus.connect(ctx.destination);
  applyVolumes();
  return ctx;
}

function applyVolumes() {
  if (!ctx || !sfxBus || !musicBus) return;
  const s = getSettings();
  const now = ctx.currentTime;
  sfxBus.gain.setTargetAtTime(s.muted ? 0 : s.sfx, now, 0.05);
  // 배경음은 효과음보다 한참 뒤에 깔린다
  musicBus.gain.setTargetAtTime(s.muted ? 0 : s.music * 0.6, now, 0.3);
}

onSettings(() => {
  applyVolumes();
  if (musicWanted) syncMusic();
});

/** 첫 누름·첫 키에서 소리를 깨운다 */
export function installUnlock(): void {
  if (typeof window === 'undefined' || unlocked) return;
  const wake = () => {
    const c = audio();
    if (!c) return;
    c.resume?.();
    unlocked = true;
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
    if (musicWanted) syncMusic();
  };
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
}

// ── 재료 ─────────────────────────────────────────────

interface Tone {
  freq: number;
  type?: OscillatorType;
  at?: number; // 지금부터 몇 초 뒤
  dur?: number;
  vol?: number;
  attack?: number;
  slideTo?: number;
  lowpass?: number;
  bus?: 'sfx' | 'music';
}

function tone(t: Tone) {
  const c = audio();
  if (!c) return;
  const bus = t.bus === 'music' ? musicBus! : sfxBus!;
  const start = c.currentTime + (t.at ?? 0);
  const dur = t.dur ?? 0.2;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = t.type ?? 'sine';
  osc.frequency.setValueAtTime(t.freq, start);
  if (t.slideTo) osc.frequency.exponentialRampToValueAtTime(t.slideTo, start + dur);
  const peak = t.vol ?? 0.3;
  const atk = t.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  let node: AudioNode = osc;
  if (t.lowpass) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = t.lowpass;
    osc.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(bus);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
function noise(opts: { at?: number; dur?: number; vol?: number; band?: number; q?: number; low?: boolean }) {
  const c = audio();
  if (!c) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const start = c.currentTime + (opts.at ?? 0);
  const dur = opts.dur ?? 0.15;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = opts.low ? 'lowpass' : 'bandpass';
  f.frequency.value = opts.band ?? 1000;
  f.Q.value = opts.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(opts.vol ?? 0.3, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f);
  f.connect(g);
  g.connect(sfxBus!);
  src.start(start);
  src.stop(start + dur + 0.05);
}

// ── 효과음 ───────────────────────────────────────────

export type Sfx =
  | 'click'
  | 'select'
  | 'move'
  | 'recruit'
  | 'coin'
  | 'attack'
  | 'win'
  | 'lose'
  | 'turn'
  | 'chronicle'
  | 'event'
  | 'alert'
  | 'victory'
  | 'defeat';

const NOTE = (semi: number) => 293.66 * Math.pow(2, semi / 12); // D4 기준

const PLAY: Record<Sfx, () => void> = {
  click: () => tone({ freq: 1400, type: 'triangle', dur: 0.04, vol: 0.12 }),
  select: () => {
    tone({ freq: NOTE(7), type: 'triangle', dur: 0.09, vol: 0.14 });
    tone({ freq: NOTE(12), type: 'triangle', dur: 0.12, vol: 0.1, at: 0.05 });
  },
  // 흙을 밟는 발소리 — 낮은 쿵과 짧은 사각거림
  move: () => {
    tone({ freq: 120, type: 'sine', dur: 0.12, vol: 0.25, slideTo: 70 });
    noise({ dur: 0.08, vol: 0.12, band: 500, q: 0.7, at: 0.01 });
  },
  // 쇠붙이 부딪는 소리
  recruit: () => {
    tone({ freq: 1320, type: 'triangle', dur: 0.25, vol: 0.12 });
    tone({ freq: 1980, type: 'sine', dur: 0.3, vol: 0.07, at: 0.02 });
    tone({ freq: NOTE(0), type: 'sawtooth', dur: 0.25, vol: 0.08, lowpass: 900, at: 0.08 });
  },
  coin: () => {
    tone({ freq: 1760, type: 'square', dur: 0.08, vol: 0.05 });
    tone({ freq: 2349, type: 'square', dur: 0.18, vol: 0.05, at: 0.07 });
  },
  // 칼과 방패 — 쇳소리 섞인 잡음과 둔탁한 쿵
  attack: () => {
    noise({ dur: 0.18, vol: 0.35, band: 2400, q: 2 });
    tone({ freq: 90, type: 'sine', dur: 0.25, vol: 0.4, slideTo: 45 });
    noise({ dur: 0.12, vol: 0.2, band: 3500, q: 6, at: 0.09 });
  },
  win: () => {
    [0, 4, 7].forEach((s, i) =>
      tone({ freq: NOTE(s + 12), type: 'sawtooth', dur: 0.3, vol: 0.09, lowpass: 2200, at: i * 0.09 })
    );
  },
  lose: () => {
    [7, 3, 0].forEach((s, i) =>
      tone({ freq: NOTE(s), type: 'sawtooth', dur: 0.35, vol: 0.08, lowpass: 1200, at: i * 0.12 })
    );
  },
  // 망루의 종 — 한 턴이 돌아왔다
  turn: () => {
    tone({ freq: NOTE(12), type: 'sine', dur: 1.4, vol: 0.12 });
    tone({ freq: NOTE(12) * 2.76, type: 'sine', dur: 0.6, vol: 0.03 });
    tone({ freq: NOTE(19), type: 'sine', dur: 1.0, vol: 0.05, at: 0.01 });
  },
  // 연대기 — 낮은 징
  chronicle: () => {
    tone({ freq: 98, type: 'sine', dur: 3.2, vol: 0.35, attack: 0.02 });
    tone({ freq: 147, type: 'sine', dur: 2.6, vol: 0.18, attack: 0.03 });
    tone({ freq: 233, type: 'sine', dur: 1.8, vol: 0.06, attack: 0.04 });
    noise({ dur: 0.6, vol: 0.06, band: 400, q: 0.5 });
  },
  // 사건 — 하프를 훑는다
  event: () => {
    [0, 3, 7, 10, 12].forEach((s, i) =>
      tone({ freq: NOTE(s), type: 'triangle', dur: 0.7, vol: 0.09, at: i * 0.06 })
    );
  },
  // 경보 — 뿔나팔 두 번
  alert: () => {
    tone({ freq: 220, type: 'sawtooth', dur: 0.35, vol: 0.12, lowpass: 900, attack: 0.04 });
    tone({ freq: 220, type: 'sawtooth', dur: 0.55, vol: 0.12, lowpass: 900, attack: 0.04, at: 0.42 });
  },
  victory: () => {
    const seq = [0, 4, 7, 12, 7, 12, 16];
    seq.forEach((s, i) =>
      tone({ freq: NOTE(s), type: 'sawtooth', dur: i === seq.length - 1 ? 1.6 : 0.28, vol: 0.1, lowpass: 2600, at: i * 0.18 })
    );
    tone({ freq: NOTE(-12), type: 'sine', dur: 2.6, vol: 0.2, at: 1.08 });
  },
  defeat: () => {
    [12, 10, 7, 5, 3, 0].forEach((s, i) =>
      tone({ freq: NOTE(s - 12), type: 'triangle', dur: 0.8, vol: 0.12, at: i * 0.32 })
    );
    tone({ freq: 73, type: 'sine', dur: 3.5, vol: 0.2, at: 0.6, attack: 0.3 });
  },
};

export function sfx(name: Sfx): void {
  if (!unlocked) return;
  const s = getSettings();
  if (s.muted || s.sfx <= 0) return;
  try {
    PLAY[name]();
  } catch {
    /* 소리 하나 못 낸다고 판이 멈추면 안 된다 */
  }
}

// ── 배경음 ───────────────────────────────────────────
// 실제 악기를 녹음한 표본으로 미리 구운 관현악 한 곡(public/music/memory-of-the-kingdom-ensemble.mp3)을 되풀이한다.
// 끝의 울림을 처음에 겹쳐 구웠으므로 이음매 없이 돈다. 굽는 법은 docs/music.md.
//
// 버린 것: 브라우저에서 사인·톱니파로 빚은 관현악(orchestra.ts) — 사람이 들어보고
// "기계음 같다, 실제 악기 소리로" 라고 했다. 그 전의 '지속음 + 도리안 몇 음' 도 같은 까닭.

const MUSIC_URL = '/music/memory-of-the-kingdom-ensemble.mp3';
let musicWanted = false;
let musicBuf: AudioBuffer | null = null;
let loading = false;
let musicSrc: AudioBufferSourceNode | null = null;

async function loadMusic(c: AudioContext): Promise<AudioBuffer | null> {
  if (musicBuf || loading) return musicBuf;
  loading = true;
  try {
    const res = await fetch(MUSIC_URL);
    if (!res.ok) throw new Error('배경음 파일을 불러오지 못했습니다.');
    musicBuf = await c.decodeAudioData(await res.arrayBuffer());
  } catch {
    musicBuf = null; // 못 받으면 조용히 — 효과음은 그대로 난다
  }
  loading = false;
  return musicBuf;
}

async function syncMusic() {
  const s = getSettings();
  const on = musicWanted && unlocked && !s.muted && s.music > 0;
  const c = audio();
  if (on && !musicSrc && c && musicBus) {
    const buf = await loadMusic(c);
    // 받는 사이에 꺼졌을 수 있다
    const still = musicWanted && unlocked && !getSettings().muted && getSettings().music > 0;
    if (!buf || musicSrc || !still) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(musicBus);
    src.start();
    musicSrc = src;
  } else if (!on && musicSrc) {
    try {
      musicSrc.stop();
    } catch {
      /* 이미 멈췄다 */
    }
    musicSrc.disconnect();
    musicSrc = null;
  }
}

/** 배경음을 켜고 끈다. 소리가 깨어나기 전이면 깨어날 때 시작한다. */
export function setMusic(on: boolean): void {
  musicWanted = on;
  void syncMusic();
}
