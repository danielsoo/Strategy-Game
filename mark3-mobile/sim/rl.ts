// 자가대전 정책 학습 — 모방으로 시작해서 정책 기울기로 올린다
//
//   npm run sim:rl
//   npm run sim:rl -- --clone 150 --iters 12 --games 150
//   npm run sim:rl -- --eval sim/nets/best.json
//
// 여기까지 두 번 틀렸고, 둘 다 재서 원인을 찾았다.
//
// 1) "이 수를 두면 이길 확률"을 승패로 직접 배우게 했다 → 39.7%.
//    망의 출력이 후보 사이에서 갈리는 폭(0.087)이 판 상황에 따라 갈리는
//    폭(0.223)보다 훨씬 작았다. 학습 노력의 대부분이 수를 고르는 데가 아니라
//    '내 나라 형편이 좋은가'를 맞히는 데 쓰였다. 형편은 이미 아는 값이다.
//    → 한 결정 안의 후보끼리만 소프트맥스로 겨루게 바꿨다. 후보 전체에 공통으로
//      얹힌 형편 항은 정규화되며 사라지고, "이 후보가 저 후보보다 나은가"만 남는다.
//
// 2) 그렇게 바꿔도 3.3% 였다. 엔트로피가 한 번의 갱신에 1.47 → 0.08 로 무너졌다.
//    무작위 망으로 시작하니 두는 수가 거의 무작위고, 그러면 이기는 판이 안 나와
//    배울 거리가 없다. 이득이 늘 음수라 자기가 둔 수를 밀어내기만 한다.
//    → 손으로 쓴 평가식을 먼저 모방시켜 출발점을 만든다. 알파스타도 사람 기보로
//      지도학습을 먼저 했다. 그 다음에야 자가대전으로 그 위를 올린다.
//
// 모방과 정책 기울기는 같은 식이다. 손실이 -이득 * log p(고른 수) 인데,
// 모방은 이득을 1 로 두고 '손평가식이 고른 수'를 따라가는 것뿐이다.

import * as fs from 'fs';
import { makeRng, RNG } from '../src/services/combatSystem';
import { playGame } from './gameSim';
import { AIWeights, LEARNED_WEIGHTS, PERSONALITIES, Policy, Ctx, Action } from '../src/engine/ai';
import { extractFeatures, FEATURE_COUNT, STATE_FEATURE_COUNT } from '../src/engine/features';
import { Cell } from '../src/engine/types';
import { createNet, loadNet, saveNet, predict, trainBatch, trainWithDeltas, Net } from './net';

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

function parseStr(name: string): string | null {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}

function wilson(p: number, n: number): [number, number] {
  const z = 1.96;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - s) / d, (c + s) / d];
}

function softmax(v: number[]): number[] {
  let m = -Infinity;
  for (const x of v) if (x > m) m = x;
  let sum = 0;
  const out = v.map((x) => {
    const e = Math.exp(Math.max(-40, x - m));
    sum += e;
    return e;
  });
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

/** 한 번의 선택 — 그 자리에 있던 후보 전부와, 실제로 고른 것 */
interface Decision {
  cands: number[][];
  chosen: number;
  /** 고를 당시 이 수를 고를 확률. 정책이 그때로부터 얼마나 멀어졌는지 재는 데 쓴다. */
  pOld: number;
}

const ROSTER: AIWeights[] = [
  LEARNED_WEIGHTS,
  PERSONALITIES['확장형'],
  PERSONALITIES['공격형'],
  PERSONALITIES['수비형'],
  PERSONALITIES['균형'],
];

/** 후보 전부의 특징을 떠서 기록한다 */
function record(
  ctx: Ctx,
  c: Cell,
  chosen: Action,
  all: Action[],
  cache: WeakMap<Action, number[]> | null,
  temp: number,
  sink: (d: Decision) => void
): void {
  if (all.length < 2) return;
  const cands: number[][] = [];
  let idx = -1;
  for (let i = 0; i < all.length; i++) {
    const x = cache?.get(all[i]) ?? extractFeatures(ctx, c, all[i]);
    if (all[i] === chosen) idx = i;
    cands.push(x);
  }
  if (idx < 0) return;
  // 망이 둔 자리라면 점수가 이미 선호도다. 손평가식 기보에는 확률 개념이 없다.
  const pOld = cache ? softmax(all.map((a) => a.score / temp))[idx] : 0;
  sink({ cands, chosen: idx, pOld });
}

/** 손으로 쓴 평가식으로 두면서, 고른 수를 기록한다 (모방용 기보) */
function handPolicy(rate: number, rng: RNG, sink: (d: Decision) => void): Policy {
  return {
    onChoose: (ctx, c, chosen, all) => {
      if (rng() >= rate) return;
      record(ctx, c, chosen, all, null, 1, sink);
    },
  };
}

interface NetOptions {
  greedy: boolean;
  temp: number;
  rng: RNG;
  rate: number;
  sink?: (d: Decision) => void;
}

/**
 * 망으로 두는 정책.
 *
 * 학습 중에는 소프트맥스로 뽑는다. 최고점만 두면 안 둬본 수가 좋은지 영영
 * 모르고, 정책 기울기 자체가 '내가 이 확률로 뽑았다'를 전제로 한다.
 * 평가할 때는 최고점만 둔다.
 */
function netPolicy(net: Net, opts: NetOptions): Policy {
  const feat = new WeakMap<Action, number[]>();
  return {
    score: (ctx: Ctx, c: Cell, a: Action) => {
      const x = extractFeatures(ctx, c, a);
      feat.set(a, x);
      return predict(net, x);
    },
    select: (actions: Action[], r: RNG) => {
      if (opts.greedy || actions.length === 1) return actions[0];
      const p = softmax(actions.map((a) => a.score / opts.temp));
      let acc = 0;
      const u = r();
      for (let i = 0; i < p.length; i++) {
        acc += p[i];
        if (u <= acc) return actions[i];
      }
      return actions[actions.length - 1];
    },
    onChoose: opts.sink
      ? (ctx, c, chosen, all) => {
          if (opts.rng() >= opts.rate) return;
          record(ctx, c, chosen, all, feat, opts.temp, opts.sink!);
        }
      : undefined,
  };
}

/** 손평가식의 기보를 모은다 */
function collectHand(games: number, size: number, rate: number, rng: RNG): Decision[] {
  const out: Decision[] = [];
  for (let g = 0; g < games; g++) {
    const policies = ROSTER.map(() => handPolicy(rate, rng, (d) => out.push(d)));
    playGame(ROSTER, size, size, rng, 180, undefined, undefined, policies);
  }
  return out;
}

/**
 * 자가대전 자료. 자리마다 망과 손평가식을 섞는다.
 * 다섯 자리를 모두 망에게 맡기면 망이 나빠질 때 나쁜 판만 쌓여 같이 무너진다.
 * 기록은 망이 둔 자리에서만 — 정책 기울기는 자기가 뽑은 수에 대해서만 성립한다.
 */
function collectSelf(
  net: Net,
  games: number,
  size: number,
  netShare: number,
  temp: number,
  rate: number,
  rng: RNG
): { decisions: Decision[]; returns: number[]; winShare: number } {
  const decisions: Decision[] = [];
  const returns: number[] = [];

  for (let g = 0; g < games; g++) {
    const bucket: Decision[][] = ROSTER.map(() => []);
    const isNet = ROSTER.map(() => rng() < netShare);
    if (!isNet.some(Boolean)) isNet[Math.floor(rng() * ROSTER.length)] = true;

    const policies = ROSTER.map((_, seat) =>
      isNet[seat]
        ? netPolicy(net, { greedy: false, temp, rate, rng, sink: (d) => bucket[seat].push(d) })
        : undefined
    );

    const r = playGame(ROSTER, size, size, rng, 180, undefined, undefined, policies);
    for (let seat = 0; seat < ROSTER.length; seat++) {
      if (!isNet[seat]) continue;
      const R = r.winner === seat ? 1 : 0;
      for (const d of bucket[seat]) {
        decisions.push(d);
        returns.push(R);
      }
    }
  }

  const winShare = returns.reduce((a, b) => a + b, 0) / Math.max(1, returns.length);
  return { decisions, returns, winShare };
}

/**
 * 기준선 — "이 형편이면 원래 얼마나 이기던 자리인가".
 *
 * 이게 없으면 한 판의 결정 수만 개가 모두 같은 라벨을 받는다. 이미 크게
 * 앞선 나라가 둔 평범한 수도 전부 '좋은 수'로, 밀리던 나라가 둔 최선의 수도
 * 전부 '나쁜 수'로 배운다. 형편을 빼고 나야 수 자체의 값어치가 남는다.
 *
 * 행동과 무관한 앞 21개만 본다. 같은 결정 안의 후보들은 그 구간이 모두 같으니
 * 후보를 고르는 데는 아무 영향이 없고, 오직 이득의 기준선 노릇만 한다.
 */
function fitCritic(
  critic: Net,
  decisions: Decision[],
  returns: number[],
  lr: number,
  epochs: number,
  rng: RNG
): { loss: number; advantages: number[] } {
  const xs = decisions.map((d) => d.cands[d.chosen].slice(0, STATE_FEATURE_COUNT));
  const order = xs.map((_, i) => i);
  let loss = 0;

  for (let e = 0; e < epochs; e++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let sum = 0;
    let n = 0;
    for (let s0 = 0; s0 < order.length; s0 += 64) {
      const part = order.slice(s0, s0 + 64);
      sum += trainBatch(
        critic,
        part.map((k) => xs[k]),
        part.map((k) => returns[k]),
        lr
      );
      n++;
    }
    loss = sum / Math.max(1, n);
  }

  const advantages = xs.map((x, i) => returns[i] - predict(critic, x));
  return { loss, advantages };
}

/**
 * 정책 기울기 한 바퀴.
 *
 *   손실 = -이득 * log p(고른 수)  -  beta * 엔트로피
 *   d손실/d선호도_j = 이득 * (p_j - 원핫_j) + beta * p_j * (log p_j + H)
 *
 * 이득을 전부 1 로 주면 그대로 모방 학습이 된다.
 *
 * 문제는 한 회에 스텝이 수천 번 나간다는 것이다. 아담은 기울기 크기를
 * 정규화하니 매 스텝이 lr 만큼 움직이고, 그게 쌓이면 정책이 너무 멀리 간다.
 * 실제로 엔트로피가 0.30 → 0.01 로 무너지고 다시는 안 돌아왔다.
 *
 * 그래서 신뢰 영역을 씌운다(PPO). 자료를 모을 때의 정책에서 확률이 (1±clip)
 * 배를 벗어나면 그쪽으로는 더 밀지 않는다. 그리고 KL 이 한도를 넘으면
 * 그 회는 거기서 멈춘다. 한 번에 갈 수 있는 거리를 정해두는 것이다.
 */
function policyStep(
  net: Net,
  decisions: Decision[],
  advantages: number[],
  lr: number,
  temp: number,
  beta: number,
  batch: number,
  rng: RNG,
  /** 0 이면 신뢰 영역 없이 그냥 민다 (모방 단계) */
  clip = 0,
  klLimit = Infinity
): { entropy: number; agree: number; kl: number; stopped: boolean } {
  const order = decisions.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  let entSum = 0;
  let agree = 0;
  let klSum = 0;
  let seen = 0;
  let stopped = false;

  let xs: number[][] = [];
  let ds: number[] = [];
  let inBatch = 0;

  const flush = () => {
    if (xs.length === 0) return;
    trainWithDeltas(net, xs, ds, lr);
    xs = [];
    ds = [];
    inBatch = 0;
  };

  for (const k of order) {
    const d = decisions[k];
    const p = softmax(d.cands.map((x) => predict(net, x) / temp));
    seen++;

    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    if (best === d.chosen) agree++;

    let H = 0;
    for (const q of p) H += -q * Math.log(q + 1e-9);
    entSum += H;

    // 자료를 모을 때와 지금이 얼마나 벌어졌나
    const ratio = clip > 0 && d.pOld > 0 ? p[d.chosen] / d.pOld : 1;
    if (clip > 0 && d.pOld > 0) klSum += Math.log(d.pOld / Math.max(1e-9, p[d.chosen]));

    // 이미 너무 멀리 간 방향으로는 더 밀지 않는다
    const adv = advantages[k];
    const frozen =
      clip > 0 &&
      ((adv > 0 && ratio > 1 + clip) || (adv < 0 && ratio < 1 - clip));

    for (let i = 0; i < p.length; i++) {
      xs.push(d.cands[i]);
      const pg = frozen ? 0 : adv * ratio * (p[i] - (i === d.chosen ? 1 : 0));
      const ent = beta * p[i] * (Math.log(p[i] + 1e-9) + H);
      ds.push((pg + ent) / temp);
    }
    if (++inBatch >= batch) flush();

    if (seen % 512 === 0 && klSum / seen > klLimit) {
      stopped = true;
      break;
    }
  }
  flush();

  const n = Math.max(1, seen);
  return { entropy: entSum / n, agree: agree / n, kl: klSum / n, stopped };
}

function evaluate(net: Net, games: number, size: number, seed: number): number {
  const rng = makeRng(seed);
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const policies: (Policy | undefined)[] = [
      netPolicy(net, { greedy: true, temp: 1, rate: 0, rng }),
      undefined,
      undefined,
      undefined,
      undefined,
    ];
    const r = playGame(ROSTER, size, size, rng, 180, undefined, undefined, policies);
    if (r.winner === 0) wins++;
  }
  return wins / games;
}

function report(label: string, p: number, n: number): void {
  const [lo, hi] = wilson(p, n);
  console.log(
    `${label} ${n}판 — ${(p * 100).toFixed(1)}%  [${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(
      1
    )}]  (학습형 78.3%, 무작위 20%)`
  );
}

function main() {
  const evalOnly = parseStr('eval');
  const size = parseArg('size', 11);
  const evalGames = parseArg('evalgames', 300);

  if (evalOnly) {
    console.log(evalOnly);
    report('5인 게임', evaluate(loadNet(evalOnly), evalGames, size, 20260919), evalGames);
    return;
  }

  const cloneGames = parseArg('clone', 150);
  const cloneEpochs = parseArg('cloneepochs', 6);
  const iters = parseArg('iters', 10);
  const games = parseArg('games', 150);
  const lr = parseArg('lr', 0.0015);
  const cloneLr = parseArg('clonelr', 0.004);
  const temp = parseArg('temp', 1);
  const beta = parseArg('beta', 0.05);
  const clip = parseArg('clip', 0.2);
  const klLimit = parseArg('kl', 0.02);
  const ppoEpochs = parseArg('ppoepochs', 3);
  const revertGap = parseArg('revert', 0.1);
  const iterGames = parseArg('itergames', 200);
  const criticLr = parseArg('criticlr', 0.004);
  const staleLimit = parseArg('patience', 8);
  const rate = parseArg('sample', 0.25);
  const netShare = parseArg('share', 0.6);
  const rng = makeRng(parseArg('seed', 20260919));

  const h1 = parseArg('h1', 24);
  const h2 = parseArg('h2', 16);
  const net = createNet([FEATURE_COUNT, h1, h2, 1], rng, true);
  fs.mkdirSync('sim/nets', { recursive: true });

  console.log(`정책 학습 — 특징 ${FEATURE_COUNT}개 · 망 ${net.sizes.join('-')} · 온도 ${temp}\n`);

  // 1단계: 손평가식 모방
  console.log(`1단계 모방 — 기보 ${cloneGames}판`);
  const demos = collectHand(cloneGames, size, rate, rng);
  const ones = demos.map(() => 1);
  for (let e = 1; e <= cloneEpochs; e++) {
      const { entropy, agree } = policyStep(net, demos, ones, cloneLr, temp, beta, 24, rng);
    console.log(
      `  ${e}주기 | 결정 ${demos.length} · 일치 ${(agree * 100).toFixed(1)}% · 엔트로피 ${entropy.toFixed(2)}`
    );
  }
  const cloned = evaluate(net, 150, size, 4242);
  report('  모방 결과', cloned, 150);
  saveNet(net, 'sim/nets/clone.json');

  // 2단계: 자가대전으로 그 위를 올린다
  const critic = createNet([STATE_FEATURE_COUNT, 16, 1], rng);
  console.log(`\n2단계 자가대전 — ${iters}회 · 회당 ${games}판 · 기준선망 ${critic.sizes.join('-')}`);
  let bestRate = cloned;
  let stale = 0;
  saveNet(net, 'sim/nets/best.json');

  for (let it = 1; it <= iters; it++) {
    const t0 = Date.now();
    const { decisions, returns, winShare } = collectSelf(
      net,
      games,
      size,
      netShare,
      temp,
      rate,
      rng
    );
    const gen = ((Date.now() - t0) / 1000).toFixed(0);

    // 형편을 먼저 빼낸다. 남는 것이 수 자체의 값어치다.
    const { loss: vLoss, advantages } = fitCritic(critic, decisions, returns, criticLr, 2, rng);

    // 같은 자료를 여러 번 보되, 처음 정책에서 너무 멀어지면 멈춘다
    let entropy = 0;
    let kl = 0;
    let epochs = 0;
    for (let e = 0; e < ppoEpochs; e++) {
      const r = policyStep(net, decisions, advantages, lr, temp, beta, 24, rng, clip, klLimit);
      entropy = r.entropy;
      kl = r.kl;
      epochs++;
      if (r.stopped) break;
    }

    const score = evaluate(net, iterGames, size, 777000 + it);

    console.log(
      `  ${String(it).padStart(2)}회 | 결정 ${String(decisions.length).padStart(6)} · 승 ${(
        winShare * 100
      ).toFixed(0)}% · 기준선손실 ${vLoss.toFixed(3)} · 엔트로피 ${entropy.toFixed(
        2
      )} · KL ${kl.toFixed(3)} · ${epochs}주기 · ${gen}초 | 평가 ${(score * 100).toFixed(1)}%`
    );

    saveNet(net, `sim/nets/iter${it}.json`);
    if (score > bestRate) {
      bestRate = score;
      saveNet(net, 'sim/nets/best.json');
      stale = 0;
    } else if (score < bestRate - revertGap) {
      // 무너졌으면 되돌린다. 무너진 망으로 자료를 더 모으면 같이 썩는다.
      const back = loadNet('sim/nets/best.json');
      net.W = back.W;
      net.b = back.b;
      // 아담의 관성까지 같이 되돌린다. 안 그러면 무너지던 방향으로 계속 민다.
      net.mW = back.mW;
      net.vW = back.vW;
      net.mb = back.mb;
      net.vb = back.vb;
      net.steps = 0;
      console.log(`     ↳ ${(bestRate * 100).toFixed(1)}% 로 되돌림`);
      stale++;
    } else {
      stale++;
    }
    if (stale >= staleLimit) {
      console.log(`     ↳ ${staleLimit}회째 나아지지 않아 멈춤`);
      break;
    }
  }

  console.log(`\n모방 직후 ${(cloned * 100).toFixed(1)}% → 가장 좋았던 망 ${(bestRate * 100).toFixed(1)}%`);
  report('본 평가', evaluate(loadNet('sim/nets/best.json'), evalGames, size, 20260919), evalGames);
}

main();
