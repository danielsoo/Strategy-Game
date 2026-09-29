// 배경음 — 합성한 작은 관현악
//
// 처음 배경음은 낮은 지속음 위에 음을 드문드문 뜯는 것이었다. 사람이 들어보고
// "안 어울린다, 오케스트라로" 라고 했다. 소리 파일은 여전히 못 쓰므로(받을 곳도
// 저작권도 없다) 악기마다 소리를 빚고, 홀의 잔향을 입혀 관현악처럼 들리게 한다.
//
//   현악     톱니파 셋을 몇 센트씩 어긋나게 겹치고 낮은음 거르개 — 합주의 두께
//   저음현   첼로·콘트라베이스 — 근음을 한 옥타브 아래로
//   호른     톱니파를 둥글게 거르고 늦게 붙는 떨림(비브라토) — 주제 선율
//   팀파니   음높이가 떨어지는 사인파 + 짧은 잡음
//   하프     세모파를 뜯어 화음을 아르페지오로
//   잔향     잡음을 지수로 줄여 만든 2.8초짜리 홀 — 이게 없으면 전자음처럼 들린다
//
// 곡: D 단조, 80bpm, 한 마디 3초. Dm – B♭ – F – C 네 마디를 한 악구로 돌리고,
// 악구마다 편성이 바뀐다 — 고요(현·하프) → 주제(+호른) → 절정(+팀파니, 호른 옥타브 위)
// → 여운(현만 여리게). 한 바퀴 48초. 같은 화음 위에서도 매번 조금씩 다르게 뜯는다.

const BEAT = 0.75;
const BAR = BEAT * 4;
const D4 = 293.66;
const hz = (semi: number) => D4 * Math.pow(2, semi / 12);

interface Chord {
  bass: number;
  voices: number[];
  /** 하프가 뜯을 음 */
  arp: number[];
}

// 반음 수는 D4 기준
const CHORDS: Chord[] = [
  { bass: -24, voices: [-12, -5, 0, 3, 7], arp: [-12, -5, 0, 3, 7, 12] }, // Dm
  { bass: -28, voices: [-16, -9, -4, 0, 3], arp: [-16, -9, -4, 0, 3, 8] }, // B♭
  { bass: -21, voices: [-9, -2, 3, 7, 10], arp: [-9, -2, 3, 7, 10, 15] }, // F
  { bass: -26, voices: [-14, -7, -2, 2, 5], arp: [-14, -7, -2, 2, 5, 10] }, // C
];

// 주제 — 마디마다 [반음, 박]
const THEME: Array<Array<[number, number]>> = [
  [[12, 1.5], [10, 0.5], [7, 2]],
  [[8, 1], [7, 1], [5, 2]],
  [[3, 1], [5, 1], [7, 1], [10, 1]],
  [[7, 3]],
];
const THEME_B: Array<Array<[number, number]>> = [
  [[7, 1], [12, 1], [15, 1.5], [14, 0.5]],
  [[12, 2], [10, 1], [8, 1]],
  [[10, 1.5], [12, 0.5], [15, 2]],
  [[14, 2], [10, 1], [7, 1]],
];

type Section = 'calm' | 'theme' | 'climax' | 'fade';
const FORM: Section[] = ['calm', 'theme', 'climax', 'fade'];

let ctx: BaseAudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextBarAt = 0;
let barIndex = 0;

function hall(c: BaseAudioContext): ConvolverNode {
  const len = Math.floor(c.sampleRate * 2.8);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  return conv;
}

function envGain(c: BaseAudioContext, at: number, peak: number, attack: number, hold: number, release: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.setValueAtTime(peak, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  return g;
}

/** 현악 한 음 — 어긋난 톱니파 셋 */
function strings(at: number, semi: number, dur: number, vol: number, bright = 1400) {
  const c = ctx!;
  const g = envGain(c, at, vol, 0.9, Math.max(0, dur - 0.9), 1.4);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = bright;
  f.Q.value = 0.4;
  f.connect(g);
  g.connect(out!);
  for (const cents of [-9, 0, 8]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(semi);
    o.detune.value = cents + (Math.random() * 4 - 2);
    o.connect(f);
    o.start(at);
    o.stop(at + dur + 1.6);
  }
}

/** 호른 — 둥근 톱니파, 늦게 붙는 떨림 */
function horn(at: number, semi: number, dur: number, vol: number) {
  const c = ctx!;
  const g = envGain(c, at, vol, 0.09, Math.max(0, dur - 0.2), 0.35);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(500, at);
  f.frequency.linearRampToValueAtTime(1100, at + 0.15);
  f.connect(g);
  g.connect(out!);
  const lfo = c.createOscillator();
  const depth = c.createGain();
  lfo.frequency.value = 5;
  depth.gain.setValueAtTime(0, at);
  depth.gain.linearRampToValueAtTime(7, at + Math.min(0.5, dur));
  lfo.connect(depth);
  for (const cents of [-4, 4]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(semi);
    o.detune.value = cents;
    depth.connect(o.detune);
    o.connect(f);
    o.start(at);
    o.stop(at + dur + 0.5);
  }
  lfo.start(at);
  lfo.stop(at + dur + 0.5);
}

function timpani(at: number, semi: number, vol: number) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(hz(semi) * 1.4, at);
  o.frequency.exponentialRampToValueAtTime(hz(semi), at + 0.06);
  const g = envGain(c, at, vol, 0.004, 0.02, 1.6);
  o.connect(g);
  g.connect(out!);
  o.start(at);
  o.stop(at + 1.8);
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const n = c.createBufferSource();
  n.buffer = noiseBuf;
  const nf = c.createBiquadFilter();
  nf.type = 'lowpass';
  nf.frequency.value = 350;
  const ng = envGain(c, at, vol * 0.5, 0.003, 0.01, 0.25);
  n.connect(nf);
  nf.connect(ng);
  ng.connect(out!);
  n.start(at);
  n.stop(at + 0.3);
}

function harp(at: number, semi: number, vol: number) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.value = hz(semi);
  const g = envGain(c, at, vol, 0.004, 0.02, 1.8);
  o.connect(g);
  g.connect(out!);
  o.start(at);
  o.stop(at + 2);
}

/** 한 마디를 at 에 맞춰 미리 적어 둔다 */
function scheduleBar(at: number, n: number) {
  const chord = CHORDS[n % 4];
  const section = FORM[Math.floor(n / 4) % FORM.length];
  const inPhrase = n % 4;
  const loud = section === 'climax' ? 1.25 : section === 'fade' ? 0.6 : 1;

  // 현악 — 화음 전체를 한 마디 내내
  for (const v of chord.voices) strings(at, v, BAR, 0.035 * loud, section === 'climax' ? 1900 : 1300);
  // 저음현 — 근음, 옥타브 겹침
  strings(at, chord.bass, BAR, 0.05 * loud, 600);
  if (section !== 'fade') strings(at, chord.bass + 12, BAR, 0.025 * loud, 700);

  // 하프 — 여덟 박자 아르페지오(고요·여운에서 더 많이)
  if (section === 'calm' || section === 'fade' || Math.random() < 0.4) {
    const up = Math.random() < 0.5;
    const notes = up ? chord.arp : [...chord.arp].reverse();
    notes.forEach((s, i) => harp(at + i * (BEAT / 2), s + 12, 0.05 * loud));
  }

  // 호른 주제
  if (section === 'theme' || section === 'climax') {
    const phrase = section === 'climax' ? THEME_B[inPhrase] : THEME[inPhrase];
    let t = at;
    for (const [semi, beats] of phrase) {
      horn(t, semi - (section === 'theme' ? 12 : 0), beats * BEAT * 0.95, 0.06 * loud);
      t += beats * BEAT;
    }
  }

  // 팀파니 — 절정에서 마디 머리, 악구 끝에는 연타
  if (section === 'climax') {
    timpani(at, chord.bass, 0.5);
    if (inPhrase === 3) for (let i = 0; i < 4; i++) timpani(at + BAR - BEAT + i * (BEAT / 4), -24, 0.28 + i * 0.06);
  } else if (section === 'theme' && inPhrase === 0) {
    timpani(at, chord.bass, 0.3);
  }
}

function tick() {
  if (!ctx) return;
  // 1.5초 앞까지 미리 적는다 — 탭이 잠깐 느려져도 끊기지 않게
  while (nextBarAt < ctx.currentTime + 1.5) {
    scheduleBar(nextBarAt, barIndex++);
    nextBarAt += BAR;
  }
}

/**
 * 관현악을 켠다. bus 로 보내면 거기서 크기(설정)가 먹는다.
 * 잔향은 bus 앞에 건다 — 마른 소리 0.7 + 홀 0.55.
 */
function wire(c: BaseAudioContext, bus: AudioNode) {
  ctx = c;
  out = c.createGain();
  const dry = c.createGain();
  dry.gain.value = 0.7;
  const wet = c.createGain();
  wet.gain.value = 0.55;
  const verb = hall(c);
  out.connect(dry);
  out.connect(verb);
  verb.connect(wet);
  dry.connect(bus);
  wet.connect(bus);
}

export function startOrchestra(c: AudioContext, bus: GainNode): void {
  if (timer) return;
  wire(c, bus);
  nextBarAt = c.currentTime + 0.2;
  barIndex = 0;
  tick();
  timer = setInterval(tick, 400);
}

/**
 * 미리 듣기용 — bars 마디를 한꺼번에 적는다(OfflineAudioContext 로 파일을 뽑을 때).
 * 게임에서는 쓰지 않는다.
 */
export function renderOrchestra(c: BaseAudioContext, bus: AudioNode, bars: number): void {
  wire(c, bus);
  for (let n = 0; n < bars; n++) scheduleBar(0.2 + n * BAR, n);
}

export function stopOrchestra(): void {
  if (timer) clearInterval(timer);
  timer = null;
  // 이미 적어 둔 음은 잔향과 함께 자연스럽게 사라지게 두지 않고 곧장 끊는다 —
  // 끄기를 눌렀는데 몇 초 더 울리면 고장 난 것처럼 들린다
  if (out && ctx) {
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    const dead = out;
    setTimeout(() => dead.disconnect(), 800);
  }
  out = null;
}
