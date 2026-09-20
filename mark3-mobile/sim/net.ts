// 작은 다층 신경망 — 의존성 없이 TS 로만
//
// 가중치 14개짜리 선형식으로는 조건부 전략을 못 쓴다. "전선이 하나일 때만
// 뭉친다"는 특징들의 곱이라, 선형 결합으로는 표현이 안 된다. 은닉층이 있어야
// 학습기가 그런 상호작용을 스스로 찾는다.
//
// 은닉 tanh, 출력은 시그모이드(승률) 또는 그대로(후보끼리 비교할 선호도).
//
// 속도에 대하여 — 처음에는 number[][][] 로 짰다. 한 주기에 103초가 걸렸는데,
// 곱셈 횟수로 따지면 15 GFLOP 밖에 안 되는 일이다. 하드웨어가 아니라 자료
// 구조가 문제였다: 중첩 배열은 포인터를 두 번 따라가야 하고, 스텝마다 기울기
// 배열을 새로 할당하면 그만큼 GC 가 돈다. 평평한 Float32Array 와 미리 잡아둔
// 버퍼로 바꿨다.

import * as fs from 'fs';
import * as path from 'path';
import { RNG } from '../src/services/combatSystem';

export interface Net {
  sizes: number[];
  /** 층마다 (출력 x 입력) 을 평평하게. W[l][o * nin + i] */
  W: Float32Array[];
  b: Float32Array[];
  /** 아담 */
  mW: Float32Array[];
  vW: Float32Array[];
  mb: Float32Array[];
  vb: Float32Array[];
  steps: number;
  /** 출력을 시그모이드로 누르지 않는다. 후보끼리 비교할 '선호도'를 낼 때 쓴다. */
  linearOut?: boolean;

  /** 아래는 계산용 버퍼다. 매번 새로 잡지 않으려고 들고 다닌다. */
  acts: Float32Array[];
  delta: Float32Array[];
  gW: Float32Array[];
  gb: Float32Array[];
}

function buffers(sizes: number[]): Pick<Net, 'acts' | 'delta'> {
  return {
    acts: sizes.map((n) => new Float32Array(n)),
    delta: sizes.map((n) => new Float32Array(n)),
  };
}

export function createNet(sizes: number[], rng: RNG, linearOut = false): Net {
  const W: Float32Array[] = [];
  const b: Float32Array[] = [];
  const mW: Float32Array[] = [];
  const vW: Float32Array[] = [];
  const mb: Float32Array[] = [];
  const vb: Float32Array[] = [];
  const gW: Float32Array[] = [];
  const gb: Float32Array[] = [];

  for (let l = 0; l + 1 < sizes.length; l++) {
    const nin = sizes[l];
    const nout = sizes[l + 1];
    // 자비에 — 층을 지나며 신호가 죽거나 터지지 않게
    const scale = Math.sqrt(2 / (nin + nout)) * 1.7;
    const w = new Float32Array(nout * nin);
    for (let k = 0; k < w.length; k++) w[k] = (rng() * 2 - 1) * scale;
    W.push(w);
    mW.push(new Float32Array(nout * nin));
    vW.push(new Float32Array(nout * nin));
    gW.push(new Float32Array(nout * nin));
    b.push(new Float32Array(nout));
    mb.push(new Float32Array(nout));
    vb.push(new Float32Array(nout));
    gb.push(new Float32Array(nout));
  }

  return { sizes, W, b, mW, vW, mb, vb, gW, gb, steps: 0, linearOut, ...buffers(sizes) };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

/** 입력을 넣고 층마다의 활성값을 net.acts 에 채운다. 반환은 출력값. */
function forward(net: Net, x: ArrayLike<number>): number {
  const a0 = net.acts[0];
  for (let i = 0; i < a0.length; i++) a0[i] = x[i];

  const L = net.W.length;
  for (let l = 0; l < L; l++) {
    const w = net.W[l];
    const bl = net.b[l];
    const prev = net.acts[l];
    const out = net.acts[l + 1];
    const nin = prev.length;
    const last = l === L - 1;
    for (let o = 0; o < out.length; o++) {
      let s = bl[o];
      const base = o * nin;
      for (let i = 0; i < nin; i++) s += w[base + i] * prev[i];
      out[o] = last ? (net.linearOut ? s : sigmoid(s)) : Math.tanh(s);
    }
  }
  return net.acts[L][0];
}

export function predict(net: Net, x: ArrayLike<number>): number {
  return forward(net, x);
}

/** 옛 이름 — 층별 활성값을 배열로 떠서 준다. 진단용이라 느려도 된다. */
export function forwardAll(net: Net, x: ArrayLike<number>): number[][] {
  forward(net, x);
  return net.acts.map((a) => Array.from(a));
}

function zero(arrs: Float32Array[]): void {
  for (const a of arrs) a.fill(0);
}

/**
 * 출력단의 기울기를 바깥에서 받아 한 묶음 갱신한다.
 *
 * 무엇을 손실로 삼을지는 부르는 쪽이 정한다 — 승패 맞히기(교차엔트로피)든
 * 정책 기울기든 여기서는 신경 쓰지 않는다. 역전파만 한다.
 */
export function trainWithDeltas(net: Net, xs: ArrayLike<number>[], dOut: number[], lr: number): void {
  const L = net.W.length;
  zero(net.gW);
  zero(net.gb);

  for (let s = 0; s < xs.length; s++) {
    forward(net, xs[s]);

    const dTop = net.delta[L];
    dTop[0] = dOut[s];

    for (let l = L - 1; l >= 0; l--) {
      const a = net.acts[l];
      const nin = a.length;
      const d = net.delta[l + 1];
      const gw = net.gW[l];
      const gb = net.gb[l];
      const w = net.W[l];
      const nout = net.b[l].length;

      for (let o = 0; o < nout; o++) {
        const dv = d[o];
        if (dv === 0) continue;
        const base = o * nin;
        for (let i = 0; i < nin; i++) gw[base + i] += dv * a[i];
        gb[o] += dv;
      }

      if (l === 0) break;
      const prevD = net.delta[l];
      prevD.fill(0);
      for (let o = 0; o < nout; o++) {
        const dv = d[o];
        if (dv === 0) continue;
        const base = o * nin;
        for (let i = 0; i < nin; i++) prevD[i] += dv * w[base + i];
      }
      // tanh 의 미분
      for (let i = 0; i < nin; i++) prevD[i] *= 1 - a[i] * a[i];
    }
  }

  const n = Math.max(1, xs.length);
  net.steps++;
  const b1 = 0.9;
  const b2 = 0.999;
  const c1 = 1 - Math.pow(b1, net.steps);
  const c2 = 1 - Math.pow(b2, net.steps);
  const step = lr / c1;
  const norm = 1 / Math.sqrt(c2);

  for (let l = 0; l < L; l++) {
    const w = net.W[l];
    const gw = net.gW[l];
    const mw = net.mW[l];
    const vw = net.vW[l];
    for (let k = 0; k < w.length; k++) {
      const g = gw[k] / n;
      const m = (mw[k] = b1 * mw[k] + (1 - b1) * g);
      const v = (vw[k] = b2 * vw[k] + (1 - b2) * g * g);
      w[k] -= (step * m) / (Math.sqrt(v) * norm + 1e-8);
    }
    const bl = net.b[l];
    const gbl = net.gb[l];
    const mbl = net.mb[l];
    const vbl = net.vb[l];
    for (let o = 0; o < bl.length; o++) {
      const g = gbl[o] / n;
      const m = (mbl[o] = b1 * mbl[o] + (1 - b1) * g);
      const v = (vbl[o] = b2 * vbl[o] + (1 - b2) * g * g);
      bl[o] -= (step * m) / (Math.sqrt(v) * norm + 1e-8);
    }
  }
}

/** 승패 맞히기(이진 교차엔트로피). 출력이 시그모이드라 델타가 (예측 - 정답)이다. */
export function trainBatch(
  net: Net,
  xs: ArrayLike<number>[],
  ys: number[],
  lr: number
): number {
  const d: number[] = new Array(xs.length);
  let loss = 0;
  for (let i = 0; i < xs.length; i++) {
    const yhat = forward(net, xs[i]);
    d[i] = yhat - ys[i];
    loss += -(ys[i] * Math.log(yhat + 1e-9) + (1 - ys[i]) * Math.log(1 - yhat + 1e-9));
  }
  trainWithDeltas(net, xs, d, lr);
  return loss / Math.max(1, xs.length);
}

export function saveNet(net: Net, file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      sizes: net.sizes,
      W: net.W.map((w) => Array.from(w)),
      b: net.b.map((x) => Array.from(x)),
      linearOut: !!net.linearOut,
    })
  );
}

export function loadNet(file: string): Net {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    sizes: number[];
    W: number[][] | number[][][];
    b: number[][];
    linearOut?: boolean;
  };

  // 옛 형식은 층마다 (출력 x 입력) 의 중첩 배열이었다. 평평하게 펴서 받는다.
  const W = raw.W.map((layer) => {
    const rows = layer as number[] | number[][];
    if (Array.isArray(rows[0])) {
      const m = rows as number[][];
      const flat = new Float32Array(m.length * m[0].length);
      let k = 0;
      for (const row of m) for (const v of row) flat[k++] = v;
      return flat;
    }
    return Float32Array.from(rows as number[]);
  });

  const b = raw.b.map((x) => Float32Array.from(x));
  const like = (src: Float32Array[]) => src.map((x) => new Float32Array(x.length));

  return {
    sizes: raw.sizes,
    W,
    b,
    mW: like(W),
    vW: like(W),
    gW: like(W),
    mb: like(b),
    vb: like(b),
    gb: like(b),
    steps: 0,
    linearOut: !!raw.linearOut,
    ...buffers(raw.sizes),
  };
}
