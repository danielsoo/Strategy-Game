// 작은 다층 신경망 — 의존성 없이 TS 로만
//
// 가중치 14개짜리 선형식으로는 조건부 전략을 못 쓴다. "전선이 하나일 때만
// 뭉친다"는 특징들의 곱이라, 선형 결합으로는 표현이 안 된다. 은닉층이 있어야
// 학습기가 그런 상호작용을 스스로 찾는다.
//
// 은닉 tanh, 출력 시그모이드. 내보내는 값은 "이 수를 두면 이 나라가 이길 확률".

import * as fs from 'fs';
import * as path from 'path';
import { RNG } from '../src/services/combatSystem';

export interface Net {
  sizes: number[];
  /** W[l][o][i] */
  W: number[][][];
  b: number[][];
  /** 아담 모멘텀 */
  mW: number[][][];
  vW: number[][][];
  mb: number[][];
  vb: number[][];
  steps: number;
}

export function createNet(sizes: number[], rng: RNG): Net {
  const W: number[][][] = [];
  const b: number[][] = [];
  const mW: number[][][] = [];
  const vW: number[][][] = [];
  const mb: number[][] = [];
  const vb: number[][] = [];
  for (let l = 0; l + 1 < sizes.length; l++) {
    const nin = sizes[l];
    const nout = sizes[l + 1];
    // 자비에 — 층을 지나며 신호가 죽거나 터지지 않게
    const scale = Math.sqrt(2 / (nin + nout));
    const w: number[][] = [];
    const mw: number[][] = [];
    const vw: number[][] = [];
    for (let o = 0; o < nout; o++) {
      const row: number[] = [];
      for (let i = 0; i < nin; i++) row.push((rng() * 2 - 1) * scale * 1.7);
      w.push(row);
      mw.push(new Array(nin).fill(0));
      vw.push(new Array(nin).fill(0));
    }
    W.push(w);
    mW.push(mw);
    vW.push(vw);
    b.push(new Array(nout).fill(0));
    mb.push(new Array(nout).fill(0));
    vb.push(new Array(nout).fill(0));
  }
  return { sizes, W, b, mW, vW, mb, vb, steps: 0 };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));

/** 각 층의 활성값. 마지막이 출력. */
export function forwardAll(net: Net, x: number[]): number[][] {
  const acts: number[][] = [x];
  let cur = x;
  const L = net.W.length;
  for (let l = 0; l < L; l++) {
    const w = net.W[l];
    const bl = net.b[l];
    const out = new Array(w.length);
    for (let o = 0; o < w.length; o++) {
      const row = w[o];
      let s = bl[o];
      for (let i = 0; i < row.length; i++) s += row[i] * cur[i];
      out[o] = l === L - 1 ? sigmoid(s) : Math.tanh(s);
    }
    acts.push(out);
    cur = out;
  }
  return acts;
}

export function predict(net: Net, x: number[]): number {
  const a = forwardAll(net, x);
  return a[a.length - 1][0];
}

/**
 * 한 묶음 학습. 손실은 이진 교차엔트로피.
 * 출력이 시그모이드라 델타가 (예측 - 정답) 으로 깔끔하게 떨어진다.
 */
export function trainBatch(net: Net, xs: number[][], ys: number[], lr: number): number {
  const L = net.W.length;
  const gW: number[][][] = net.W.map((w) => w.map((r) => new Array(r.length).fill(0)));
  const gb: number[][] = net.b.map((r) => new Array(r.length).fill(0));
  let loss = 0;

  for (let s = 0; s < xs.length; s++) {
    const acts = forwardAll(net, xs[s]);
    const yhat = acts[L][0];
    const y = ys[s];
    loss += -(y * Math.log(yhat + 1e-9) + (1 - y) * Math.log(1 - yhat + 1e-9));

    let delta = [yhat - y];
    for (let l = L - 1; l >= 0; l--) {
      const a = acts[l];
      for (let o = 0; o < net.W[l].length; o++) {
        const d = delta[o];
        if (d === 0) continue;
        const row = gW[l][o];
        for (let i = 0; i < a.length; i++) row[i] += d * a[i];
        gb[l][o] += d;
      }
      if (l === 0) break;
      const prev = new Array(a.length).fill(0);
      for (let o = 0; o < net.W[l].length; o++) {
        const d = delta[o];
        if (d === 0) continue;
        const row = net.W[l][o];
        for (let i = 0; i < row.length; i++) prev[i] += d * row[i];
      }
      // tanh 의 미분
      for (let i = 0; i < prev.length; i++) prev[i] *= 1 - a[i] * a[i];
      delta = prev;
    }
  }

  const n = Math.max(1, xs.length);
  net.steps++;
  const b1 = 0.9;
  const b2 = 0.999;
  const c1 = 1 - Math.pow(b1, net.steps);
  const c2 = 1 - Math.pow(b2, net.steps);

  for (let l = 0; l < L; l++) {
    for (let o = 0; o < net.W[l].length; o++) {
      const row = net.W[l][o];
      for (let i = 0; i < row.length; i++) {
        const g = gW[l][o][i] / n;
        net.mW[l][o][i] = b1 * net.mW[l][o][i] + (1 - b1) * g;
        net.vW[l][o][i] = b2 * net.vW[l][o][i] + (1 - b2) * g * g;
        row[i] -= (lr * (net.mW[l][o][i] / c1)) / (Math.sqrt(net.vW[l][o][i] / c2) + 1e-8);
      }
      const g = gb[l][o] / n;
      net.mb[l][o] = b1 * net.mb[l][o] + (1 - b1) * g;
      net.vb[l][o] = b2 * net.vb[l][o] + (1 - b2) * g * g;
      net.b[l][o] -= (lr * (net.mb[l][o] / c1)) / (Math.sqrt(net.vb[l][o] / c2) + 1e-8);
    }
  }

  return loss / n;
}

export function saveNet(net: Net, file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ sizes: net.sizes, W: net.W, b: net.b }));
}

export function loadNet(file: string): Net {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Pick<Net, 'sizes' | 'W' | 'b'>;
  const zerosLike = (x: number[][][]) => x.map((w) => w.map((r) => new Array(r.length).fill(0)));
  return {
    sizes: raw.sizes,
    W: raw.W,
    b: raw.b,
    mW: zerosLike(raw.W),
    vW: zerosLike(raw.W),
    mb: raw.b.map((r) => new Array(r.length).fill(0)),
    vb: raw.b.map((r) => new Array(r.length).fill(0)),
    steps: 0,
  };
}
