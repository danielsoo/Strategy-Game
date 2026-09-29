// 배경음 굽기 — 클라우드 Chromium(Playwright)의 OfflineAudioContext 로 score.js 를 돌려
// 좌우 16비트 PCM 을 쓴 뒤, lamejs 로 mp3 를 만든다.
//
//   bash tools/music/fetch-samples.sh /tmp/mark3-music
//   (cd /tmp/mark3-music && python3 -m http.server 8777 &)
//   MUSIC=/tmp/mark3-music NODE_PATH=$(npm root -g) node tools/music/render.js
//   → public/music/theme.mp3
//
// 한 번 굽는 데 수 분 걸린다(사건 1100여 개, 표본 160여 개, 128초).
const { chromium } = require('playwright');
const fs = require('fs'), vm = require('vm'), path = require('path');
const M = process.env.MUSIC || '/tmp/mark3-music';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage();
  p.setDefaultTimeout(0);
  await p.goto('http://localhost:8777/');
  await p.addScriptTag({ path: path.join(__dirname, 'score.js') });
  const T = {}, F = {};
  for (const i of ['violin','cello','contrabass','french-horn','harp','trumpet','trombone','flute','clarinet','bassoon','tuba','xylophone'])
    T[i] = fs.readdirSync(`${M}/inst/${i}/package`).filter((f) => f.endsWith('.mp3'));
  for (const i of ['string_ensemble_1','viola','tremolo_strings','pizzicato_strings','piccolo','oboe','english_horn','clarinet','bassoon','french_horn','timpani','orchestra_kit'])
    F[i] = fs.readdirSync(`${M}/inst/sfs/package/FluidR3_GM/${i}-mp3`).filter((f) => f.endsWith('.mp3'));
  const r = await p.evaluate(async ([T, F]) => await window.renderScore(T, F), [T, F]);
  await b.close();
  const L = new Int16Array(Buffer.from(r.left, 'base64').buffer.slice(0));
  const R = new Int16Array(Buffer.from(r.right, 'base64').buffer.slice(0));
  // lamejs 의 index.js 는 Node 에서 MPEGMode 가 정의되지 않는 버그가 있어 lame.all.js 를 vm 으로 읽는다
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(`${M}/lame/package/lame.all.js`, 'utf8'), ctx);
  const enc = new ctx.lamejs.Mp3Encoder(2, r.rate, 128);
  const out = [];
  for (let i = 0; i < L.length; i += 1152) { const m = enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152)); if (m.length) out.push(Buffer.from(m)); }
  out.push(Buffer.from(enc.flush()));
  const dest = path.join(__dirname, '../../public/music/theme.mp3');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.concat(out));
  console.log(`사건 ${r.events} · 표본 ${r.samples} · ${(L.length / r.rate).toFixed(1)}초 → ${dest}`);
})();
