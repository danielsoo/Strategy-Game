// 왕국 연대기 — 배경음 (전체 관현악). 브라우저 OfflineAudioContext 에서 돈다.
//
// 표본은 모두 실제 악기를 녹음한 것이다.
//   T  tonejs-instruments (MIT) — 바이올린(합주·비올라도 이것을 셋씩 겹쳐)·첼로·
//      콘트라베이스·하프·플루트·클라리넷·바순·호른·트럼펫·트롬본·튜바·실로폰
//   F  FluidR3 GM (Frank Wen, MIT) — 피치카토·오보에·잉글리시 호른·피콜로·
//      베이스 클라리넷(클라리넷 낮은 음)·팀파니·관현악 타악기(큰북·작은북·심벌즈·트라이앵글)
//   F 표본은 3.1초라 짧은 음(선율·타악)에만 쓴다. 길게 붙드는 음을 여기에 맡겼다가
//   이음매마다 꺼져 끊겨 들렸다(2026-09-29 사람이 들어보고 지적).
window.renderScore = async function (T, F) {
  const RATE = 44100, BEAT = 0.75, BAR = 3, BARS = 40, LEN = BARS * BAR, TAIL = 8;
  const c = new OfflineAudioContext(2, RATE * (LEN + TAIL), RATE);
  const PC = { C: 0, Cs: 1, Db: 1, D: 2, Ds: 3, Eb: 3, E: 4, F: 5, Fs: 6, Gb: 6, G: 7, Gs: 8, Ab: 8, A: 9, As: 10, Bb: 10, B: 11 };
  const midiOf = (n) => { const m = n.match(/^([A-G](?:s|b)?)(-?\d)$/); return m ? 12 * (+m[2] + 1) + PC[m[1]] : null; };
  const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const nameOf = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

  // ── 악기 목록: 어디서 가져오고, 어떤 성질인가 ──
  //   src T: 표본 몇 개를 늘여 쓴다 / F: 반음마다 표본이 있다(3.1초)
  const INST = {
    vln1:   { src: 'T', dir: 'violin', pan: -0.45, atk: 0.25, rel: 0.9, vol: 0.5 },
    // 현악 합주는 11~16초짜리 바이올린 표본을 셋씩 살짝 어긋나게 겹쳐 만든다(section()).
    // 처음에는 FluidR3 합주 표본(3.1초)을 2초마다 다시 겹쳤는데, 이음매마다 소리가 꺼져
    // "바이올린이 뚝뚝 끊긴다" 는 말을 들었다.
    ens:    { src: 'T', dir: 'violin', pan: -0.15, atk: 0.45, rel: 1.2, vol: 0.34 },
    ensHi:  { src: 'T', dir: 'violin', pan: -0.4, atk: 0.45, rel: 1.2, vol: 0.28 },
    viola:  { src: 'T', dir: 'violin', pan: 0.12, atk: 0.45, rel: 1.2, vol: 0.3 },
    pizz:   { src: 'F', dir: 'pizzicato_strings', pan: 0.35, atk: 0.003, rel: 0.4, vol: 0.5 },
    cello:  { src: 'T', dir: 'cello', pan: 0.3, atk: 0.12, rel: 0.6, vol: 0.55 },
    bass:   { src: 'T', dir: 'contrabass', pan: 0.45, atk: 0.2, rel: 0.9, vol: 0.55 },
    harp:   { src: 'T', dir: 'harp', pan: -0.55, atk: 0.004, rel: 1.6, vol: 0.5 },
    picc:   { src: 'F', dir: 'piccolo', pan: -0.2, atk: 0.05, rel: 0.4, vol: 0.25 },
    flute:  { src: 'T', dir: 'flute', pan: -0.2, atk: 0.07, rel: 0.5, vol: 0.4 },
    oboe:   { src: 'F', dir: 'oboe', pan: -0.05, atk: 0.06, rel: 0.4, vol: 0.4 },
    ehorn:  { src: 'F', dir: 'english_horn', pan: 0.0, atk: 0.07, rel: 0.5, vol: 0.45 },
    clar:   { src: 'T', dir: 'clarinet', pan: 0.1, atk: 0.06, rel: 0.5, vol: 0.4 },
    bclar:  { src: 'F', dir: 'clarinet', pan: 0.15, atk: 0.06, rel: 0.5, vol: 0.4 },
    bsn:    { src: 'T', dir: 'bassoon', pan: 0.2, atk: 0.06, rel: 0.5, vol: 0.45 },
    horn:   { src: 'T', dir: 'french-horn', pan: -0.15, atk: 0.09, rel: 0.6, vol: 0.5 },
    tpt:    { src: 'T', dir: 'trumpet', pan: 0.12, atk: 0.04, rel: 0.5, vol: 0.4 },
    tbn:    { src: 'T', dir: 'trombone', pan: 0.28, atk: 0.07, rel: 0.6, vol: 0.42 },
    tuba:   { src: 'T', dir: 'tuba', pan: 0.35, atk: 0.08, rel: 0.6, vol: 0.45 },
    timp:   { src: 'F', dir: 'timpani', pan: 0.0, atk: 0.003, rel: 1.2, vol: 0.7 },
    kit:    { src: 'F', dir: 'orchestra_kit', pan: 0.05, atk: 0.002, rel: 0.8, vol: 0.55 },
    xylo:   { src: 'T', dir: 'xylophone', pan: -0.3, atk: 0.002, rel: 0.6, vol: 0.25 },
  };
  const KIT = { bd: 36, snare: 38, crash: 49, cym2: 57, tri: 81, triMute: 80 };

  // ── 악보를 먼저 사건 목록으로 적는다(쓸 표본만 읽으려고) ──
  const ev = [];
  const rnd = (a) => (Math.random() * 2 - 1) * a;
  const play = (inst, midi, t, dur, vel, o = {}) => ev.push({ inst, midi, t, dur, vel, o });

  const CH = {
    Dm: { root: 38, str: [57, 62, 65], up: [69, 74, 77], arp: [50, 57, 62, 65, 69, 74] },
    Bb: { root: 34, str: [58, 62, 65], up: [70, 74, 77], arp: [46, 53, 58, 62, 65, 70] },
    F:  { root: 41, str: [57, 60, 65], up: [69, 72, 77], arp: [41, 48, 53, 57, 60, 65] },
    C:  { root: 36, str: [55, 60, 64], up: [67, 72, 76], arp: [48, 55, 60, 64, 67, 72] },
    Gm: { root: 43, str: [58, 62, 67], up: [70, 74, 79], arp: [43, 50, 55, 58, 62, 67] },
    A:  { root: 45, str: [57, 61, 64], up: [69, 73, 76], arp: [45, 52, 57, 61, 64, 69] },
  };
  const P1 = ['Dm', 'Bb', 'F', 'C'], P2 = ['Gm', 'Dm', 'Bb', 'A'], P3 = ['Bb', 'C', 'Dm', 'A'], CODA = ['Dm', 'Bb', 'Gm', 'A'];
  const THEME = [[[74, 1.5], [72, 0.5], [69, 2]], [[70, 1], [69, 1], [67, 2]], [[65, 1], [67, 1], [69, 1], [72, 1]], [[69, 3], [null, 1]]];
  const THEME_B = [[[69, 1], [74, 1], [77, 1.5], [76, 0.5]], [[74, 2], [72, 1], [70, 1]], [[72, 1.5], [74, 0.5], [77, 2]], [[76, 2], [72, 1], [67, 1]]];
  const DEV = [[[55, 2], [58, 2]], [[57, 2], [53, 2]], [[50, 2], [53, 1], [55, 1]], [[57, 3], [52, 1]]];
  const BUILD = [[[65, 4]], [[67, 4]], [[69, 4]], [[73, 4]]];
  const plan = ['intro', 'strings', 'horn', 'answer', 'dev', 'build', 'climax', 'climax2', 'calm', 'coda'];
  const progOf = { dev: P2, build: P3, coda: CODA };

  /** 한 무리(합주) — 같은 음을 셋이 몇 센트·몇 ms 어긋나게 낸다 */
  const section = (inst, midi, t, dur, vel, o = {}) => {
    [[-7, 0], [0, 0.018], [6, 0.031]].forEach(([cents, dt], i) => play(inst, midi, t + dt, dur, vel * (i === 1 ? 0.9 : 0.7), { ...o, cents, sus: true }));
  };
  /**
   * 선율은 이어서(레가토) — 다음 음이 앞 음이 끝나기 전에 들어온다. 전에는 박의 97% 만
   * 울려 음마다 틈이 났다("뚝뚝 끊긴다"). 둘째 음부터는 어택을 짧게 해 활을 바꾸지 않은 듯.
   */
  const mel = (inst, ph, bi, t, shift, vel, o = {}) => {
    let x = t, first = true;
    for (const [n, b] of ph[bi]) {
      if (n !== null) play(inst, n + shift, x, b * BEAT + 0.18, vel, { ...o, atk: first ? undefined : 0.07, legato: true });
      x += b * BEAT; first = false;
    }
  };
  const chord = (inst, notes, t, dur, vel, shift = 0, o) => notes.forEach((n) => play(inst, n + shift, t, dur, vel, { ...o, sus: true }));
  const strings = (inst, notes, t, dur, vel, shift = 0, o) => notes.forEach((n) => section(inst, n + shift, t, dur, vel, o));
  const roll = (inst, midi, t, dur, v0, v1, rate = 16) => { const n = Math.floor(dur * rate); for (let k = 0; k < n; k++) play(inst, midi, t + k / rate + rnd(0.012), 0.25, (v0 + (v1 - v0) * (k / n)) * (0.8 + Math.random() * 0.3), { rel: 0.6 }); };
  const harpArp = (ch, t, v, up) => { const ns = up ? ch.arp : [...ch.arp].reverse(); ns.forEach((n, i) => play('harp', n, t + i * BEAT / 2, 1.5, v * (i % 2 ? 0.85 : 1))); ns.slice(0, 2).forEach((n, i) => play('harp', n + 12, t + (6 + i) * BEAT / 2, 1.2, v * 0.8)); };

  plan.forEach((s, pi) => {
    const prog = progOf[s] ?? P1;
    prog.forEach((name, bi) => {
      const ch = CH[name], t = (pi * 4 + bi) * BAR, R = ch.root;
      const big = s === 'climax' || s === 'climax2';
      // 저음 — 콘트라베이스(+ 큰 대목에서 콘트라바순·튜바)
      play('bass', R, t, BAR, big ? 0.7 : 0.5, { sus: true });
      if (big || s === 'build') { play('tuba', R, t, BAR, 0.5, { sus: true }); play('bass', R + 12, t, BAR, 0.3, { sus: true }); }
      // 현악 합주 — 60명의 두께는 합주 표본이 맡고, 독주 바이올린이 결을 더한다
      if (s !== 'intro' && s !== 'calm') {
        const v = big ? 0.75 : s === 'build' ? 0.45 + bi * 0.1 : s === 'coda' ? 0.5 - bi * 0.08 : 0.5;
        strings('ens', ch.str, t, BAR, v, 0, { swell: s === 'build' ? 1.3 : undefined });
        play('cello', R + 12, t, BAR, v * 0.9, { sus: true });
        if (big || s === 'answer') strings('ensHi', ch.up, t, BAR, v * 0.7);
      } else {
        strings('ens', ch.str, t, BAR, 0.28);
        play('cello', R + 12, t, BAR, 0.3, { sus: true });
      }
      // 하프
      if (['intro', 'strings', 'horn', 'calm', 'coda'].includes(s)) harpArp(ch, t, s === 'coda' ? 0.35 : 0.5, bi % 2 === 0);

      if (s === 'intro') {
        if (bi === 0) { roll('timp', 38, t, 1.5, 0.15, 0.5); play('kit', KIT.tri, t + 1.5, 1, 0.3); }
        mel('ehorn', THEME, bi, t, -12, 0.55);
      }
      if (s === 'strings') {
        mel('flute', THEME, bi, t, 0, 0.5);
        chord('clar', [ch.str[1], ch.str[2]], t + BAR / 2, BAR / 2, 0.25);
      }
      if (s === 'horn') {
        mel('horn', THEME, bi, t, -12, 0.75);
        mel('horn', THEME, bi, t, -12, 0.35, { cents: 7 }); // 호른 둘째 — 같은 선율을 살짝 어긋나게
        play('timp', R + 12 <= 57 ? R + 12 : R, t, 1, 0.35);
        if (bi === 0) play('kit', KIT.tri, t, 1, 0.35);
        chord('bsn', [R + 12], t, BAR, 0.35);
      }
      if (s === 'answer') {
        mel('vln1', THEME_B, bi, t, 0, 0.6);
        mel('oboe', THEME_B, bi, t, 0, 0.35);
        chord('horn', ch.str.slice(0, 2), t, BAR, 0.35, -12);
      }
      if (s === 'dev') {
        mel('bsn', DEV, bi, t, 0, 0.6);
        mel('bclar', DEV, bi, t, -12, 0.45);
        mel('cello', DEV, bi, t, 12, 0.45);
        chord('tbn', ch.str, t, BAR, 0.35, -12);
        for (let k = 0; k < 4; k++) play('pizz', R + 12, t + k * BEAT, 0.3, 0.5);
        play('timp', R + 12 <= 57 ? R + 12 : R, t, 1, 0.4);
      }
      if (s === 'build') {
        mel('tpt', BUILD, bi, t, 0, 0.3 + bi * 0.1, { swell: 1.6 });
        chord('horn', ch.str, t, BAR, 0.3 + bi * 0.06, -12, { swell: 1.4 });
        strings('ensHi', ch.up, t, BAR, 0.25 + bi * 0.08, 0, { swell: 1.4 });
        // 작은북 연타(초당 10번)와 첼로 스타카토는 뺐다 — "1분 뒤부터 끊기는 소리가 심하다"
        play('kit', KIT.bd, t, 1, 0.2 + bi * 0.08);
        if (bi === 3) { roll('timp', 45, t, BAR, 0.3, 0.9, 14); roll('kit', KIT.cym2, t + 1.5, 1.5, 0.05, 0.35, 8); }
        else play('timp', R + 12 <= 57 ? R + 12 : R, t, 1, 0.3 + bi * 0.1);
      }
      if (s === 'climax') {
        mel('tpt', THEME, bi, t, 0, 0.65);
        mel('horn', THEME, bi, t, -12, 0.75);
        mel('horn', THEME, bi, t, -12, 0.4, { cents: 7 });
        mel('picc', THEME, bi, t, 12, 0.3);
        mel('xylo', THEME, bi, t, 12, 0.4);
        chord('tbn', ch.str, t, BAR, 0.5, -12);
        play('kit', KIT.bd, t, 1, 0.7);
        if (bi === 0) play('kit', KIT.crash, t, 2.5, 0.6);
        for (let k = 0; k < 4; k++) play('timp', R + 12 <= 57 ? R + 12 : R, t + k * BEAT, 0.8, k === 0 ? 0.8 : 0.45);
      }
      if (s === 'climax2') {
        mel('vln1', THEME_B, bi, t, 0, 0.8);
        mel('flute', THEME_B, bi, t, 12, 0.35);
        mel('oboe', THEME_B, bi, t, 0, 0.35);
        mel('clar', THEME_B, bi, t, -12, 0.3);
        chord('horn', ch.str, t, BAR, 0.5, -12);
        chord('tbn', ch.str, t, BAR, 0.3, -12);
        play('kit', KIT.bd, t, 1, 0.5);
        for (let k = 0; k < 4; k++) play('kit', KIT.snare, t + k * BEAT, 0.3, k % 2 ? 0.2 : 0.3);
        play('timp', R + 12 <= 57 ? R + 12 : R, t, 1, 0.55);
        if (bi === 3) play('kit', KIT.crash, t + BAR - BEAT, 2, 0.4);
      }
      if (s === 'calm') {
        mel('clar', THEME, bi, t, -12, 0.55);
        strings('viola', [ch.str[0], ch.str[2]], t, BAR, 0.25);
        if (bi === 2) play('kit', KIT.tri, t, 1, 0.25);
      }
      if (s === 'coda') {
        if (bi === 0) mel('ehorn', THEME, 0, t, -12, 0.45);
        if (bi === 1) mel('oboe', THEME, 1, t, 0, 0.3);
        if (bi === 3) roll('timp', 45, t + 1, 2, 0.1, 0.35);
      }
    });
  });

  // ── 쓸 표본만 읽는다 ──
  const need = new Map(); // key → {inst, file, m}
  const bank = {};
  const pickT = (dir, midi) => { let best = null; for (const f of T[dir]) { const m = midiOf(f.replace('.mp3', '')); if (m === null) continue; if (!best || Math.abs(m - midi) < Math.abs(best.m - midi)) best = { f, m }; } return best; };
  const pickF = (dir, midi) => { const has = new Set(F[dir]); let m = midi; for (let d = 0; d < 24; d++) { for (const x of [midi + d, midi - d]) if (has.has(nameOf(x) + '.mp3')) return { f: nameOf(x) + '.mp3', m: x }; } return null; };
  for (const e of ev) {
    const I = INST[e.inst];
    const p = I.src === 'T' ? pickT(I.dir, e.midi) : pickF(I.dir, e.midi);
    if (!p) { e.skip = true; continue; }
    e.key = I.src + '/' + I.dir + '/' + p.f; e.sm = p.m;
    if (!need.has(e.key)) need.set(e.key, { src: I.src, dir: I.dir, f: p.f });
  }
  for (const [key, x] of need) {
    const url = x.src === 'T' ? `/inst/${x.dir}/package/${encodeURIComponent(x.f)}` : `/inst/sfs/package/FluidR3_GM/${x.dir}-mp3/${x.f}`;
    bank[key] = await c.decodeAudioData(await (await fetch(url)).arrayBuffer());
  }

  // ── 홀과 믹스 ──
  const irLen = Math.floor(RATE * 3.6);
  const ir = c.createBuffer(2, irLen, RATE);
  for (let chn = 0; chn < 2; chn++) {
    const d = ir.getChannelData(chn); let lp = 0;
    for (let i = 0; i < irLen; i++) { lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = (i < RATE * 0.025 ? 0 : 1) * lp * Math.pow(1 - i / irLen, 2.4); }
  }
  const verb = c.createConvolver(); verb.buffer = ir;
  const master = c.createGain(); master.gain.value = 0.8;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.35;
  const wet = c.createGain(); wet.gain.value = 0.45;
  verb.connect(wet); wet.connect(master); master.connect(comp); comp.connect(c.destination);
  const bus = {};
  for (const [k, I] of Object.entries(INST)) {
    const g = c.createGain(); g.gain.value = I.vol;
    const p = c.createStereoPanner(); p.pan.value = I.pan;
    const send = c.createGain(); send.gain.value = k === 'harp' || k === 'timp' ? 0.6 : k === 'kit' ? 0.5 : 0.42;
    g.connect(p); p.connect(master); p.connect(send); send.connect(verb);
    bus[k] = g;
  }

  // ── 소리 내기 ──
  const lenOf = (e) => bank[e.key].duration / Math.pow(2, (e.midi - e.sm) / 12);
  /*
    지속음 잇기. 화음이 바뀌어도 같은 음은 활을 떼지 않는다 — 마디마다 다시 켜면 어택이
    겹쳐 박자마다 울컥거렸다. 같은 악기·같은 음·같은 어긋남(센트)이 이어지면 한 음으로
    합친다(표본 길이 안에서만). 그리고 바뀌는 음은 0.4초 겹쳐 서로 스며들게 한다.
  */
  const sus = ev.filter((e) => !e.skip && e.o.sus);
  const groups = new Map();
  for (const e of sus) {
    const k = `${e.inst}|${e.midi}|${e.o.cents ?? 0}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  for (const list of groups.values()) {
    list.sort((x, y) => x.t - y.t);
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], b = list[i + 1];
      const gap = b.t - (a.t + a.dur);
      const room = lenOf(a) - (INST[a.inst].rel + 0.1);
      if (gap < 0.15 && b.t + b.dur - a.t <= room && !a.o.swell && !b.o.swell) {
        a.dur = b.t + b.dur - a.t;
        a.vel = Math.max(a.vel, b.vel);
        b.skip = true;
        list.splice(i + 1, 1);
        i--;
      }
    }
  }
  for (const e of sus) if (!e.skip) e.dur += 0.4;

  function voice(e) {
    const I = INST[e.inst], buf = bank[e.key];
    const at = Math.max(0, e.t + (e.o.legato ? rnd(0.006) : rnd(0.01)));
    const src = c.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = Math.pow(2, (e.midi - e.sm) / 12);
    if (e.o.cents) src.detune.value = e.o.cents;
    const rel = e.o.rel ?? I.rel;
    const atk = e.o.atk ?? I.atk;
    // 표본보다 길게 붙들 수 없다 — 모자라면 거기서 놓는다
    const hold = Math.max(atk + 0.02, Math.min(e.dur, lenOf(e) - rel - 0.05));
    const v = e.vel * (1 + rnd(0.06));
    const g = c.createGain();
    // 곡선은 setTargetAtTime — 지수 경사를 0.0001 에서 시작하면 첫 몇 ms 가 뚝 끊긴 듯 들렸다
    g.gain.setValueAtTime(0, at);
    g.gain.setTargetAtTime(v, at, Math.max(0.002, atk / 3));
    if (e.o.swell) g.gain.linearRampToValueAtTime(v * e.o.swell, at + hold);
    g.gain.setTargetAtTime(0, at + hold, Math.max(0.02, rel / 3.5));
    src.connect(g); g.connect(bus[e.inst]);
    src.start(at); src.stop(Math.min(at + buf.duration / src.playbackRate.value, at + hold + rel * 1.6));
  }
  for (const e of ev) if (!e.skip) voice(e);

  const buf = await c.startRendering();
  // 끝을 처음에 겹쳐 이음매 없이 되풀이
  const n = RATE * LEN, tail = RATE * TAIL;
  const L = new Float32Array(n), Rr = new Float32Array(n);
  L.set(buf.getChannelData(0).subarray(0, n)); Rr.set(buf.getChannelData(1).subarray(0, n));
  for (let i = 0; i < tail; i++) { L[i] += buf.getChannelData(0)[n + i]; Rr[i] += buf.getChannelData(1)[n + i]; }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rr[i]));
  const k = 0.89 / peak;
  const toI16 = (a) => { const o = new Int16Array(a.length); for (let i = 0; i < a.length; i++) o[i] = Math.max(-32767, Math.min(32767, a[i] * k * 32767)); return o; };
  const b64 = (i16) => { const u8 = new Uint8Array(i16.buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  return { rate: RATE, left: b64(toI16(L)), right: b64(toI16(Rr)), peak, events: ev.length, samples: need.size };
};
