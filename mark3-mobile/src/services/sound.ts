// 소리 — 파일 없이 브라우저에서 합성한다
//
// 왜 합성인가. 소리 파일을 받을 곳이 없었고(클라우드에서 바깥 자료를 못 받는다),
// 파일을 넣으면 저작권과 용량을 따져야 한다. Web Audio 로 짧은 음을 빚으면 둘 다
// 없다. PC 브라우저·폰 브라우저·홈 화면에 설치한 웹 앱 모두 같은 코드로 운다.
// 웹이 아닌 곳(네이티브 앱)에서는 조용히 아무것도 하지 않는다.
//
// 브라우저는 사람이 한 번 누르기 전에는 소리를 못 내게 막는다. 첫 누름에서 깨운다.
//
// 배경음은 곡이 아니라 규칙이다 — 낮은 지속음 위에 도리안 음계에서 몇 음씩
// 드문드문 뜯는다. 매번 조금씩 달라서 한 시간을 틀어놔도 덜 지친다.

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
  musicBus.gain.setTargetAtTime(s.muted ? 0 : s.music * 0.5, now, 0.3);
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

let musicWanted = false;
let timer: ReturnType<typeof setInterval> | null = null;
let bar = 0;
// D 도리안 — 옛 느낌이 나면서 너무 슬프지 않다
const DORIAN = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15];

function playBar() {
  const c = audio();
  if (!c) return;
  // 네 마디마다 낮은 지속음 (D 와 A)
  if (bar % 4 === 0) {
    const root = bar % 16 < 8 ? -24 : -19; // D2 ↔ G2 를 오가며 조금 움직인다
    tone({ freq: NOTE(root), type: 'sine', dur: 9.5, vol: 0.22, attack: 2.2, bus: 'music' });
    tone({ freq: NOTE(root + 7), type: 'sine', dur: 9.0, vol: 0.12, attack: 2.6, bus: 'music' });
  }
  // 한 마디에 0~3음을 드문드문 뜯는다
  const notes = Math.random() < 0.25 ? 0 : 1 + Math.floor(Math.random() * 3);
  let t = Math.random() * 0.4;
  for (let i = 0; i < notes; i++) {
    const deg = DORIAN[Math.floor(Math.random() * DORIAN.length)];
    tone({ freq: NOTE(deg), type: 'triangle', dur: 1.6, vol: 0.09, lowpass: 1800, at: t, bus: 'music' });
    t += 0.5 + Math.random() * 0.8;
  }
  bar++;
}

function syncMusic() {
  const s = getSettings();
  const on = musicWanted && unlocked && !s.muted && s.music > 0;
  if (on && !timer) {
    playBar();
    timer = setInterval(playBar, 2400);
  } else if (!on && timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** 배경음을 켜고 끈다. 소리가 깨어나기 전이면 깨어날 때 시작한다. */
export function setMusic(on: boolean): void {
  musicWanted = on;
  syncMusic();
}
