// 작전 탐색 — 몇 갈래로 굴려보고 잘 풀리는 쪽을 고른다
//
// 바둑이나 자율주행이 쓰는 탐색 트리를 그대로 가져올 수는 없다. 저쪽은 한 번에
// 고를 수 있는 수가 체스 35, 바둑 250 인데 우리는 한 턴에 부대 전부를 움직인다.
// 부대 열에 각자 여덟 갈래면 8^10, 십억이다. 첫 턴에서 이미 터진다.
// 안개까지 있어서 갈라질 '지금 상태' 조차 확실하지 않다.
//
// 그래서 갈래를 '수' 가 아니라 '작전' 으로 잡는다. 이 판에서 작전이란 곧
// ctx.target — 이번 원정을 어디로 가느냐다. 후보는 많아야 대여섯이다.
//
//   북쪽 성으로 민다 / 동쪽 성으로 민다 / 안개를 걷는다 / 집을 굳힌다
//
// 각각을 몇 턴 굴려보고, 끝난 자리가 제일 나은 작전을 고른다. 막히는 갈래는
// 점수가 안 오르니 저절로 버려진다. 십억이 여섯으로 준다.
//
// 상대는 굴리지 않는다. 다섯 나라를 다 굴리면 비용이 다섯 배가 되는데, 어느
// 쪽으로 갈지 정하는 데에는 내 군대가 그리로 갈 수 있는지가 대부분이다.
// 이건 앞을 내다보는 것이지 상대의 수를 읽는 것이 아니다.

import { Cell, GameState, EconomyConfig, DEFAULT_ECONOMY } from './types';
import { RNG } from '../services/combatSystem';
import { nationStats } from './rules';

/** 굴려본 끝의 자리가 얼마나 좋은가 */
export interface PlanScore {
  target: Cell | null;
  score: number;
}

/**
 * 자리의 값어치.
 *
 * 이기는 길이 정복뿐이므로(dominanceShare 0) 성이 압도적으로 무겁다. 땅과
 * 병력은 그 성을 딸 수 있게 해주는 수단이다. 골드는 아직 병력이 아니라
 * 가볍게 센다.
 */
function positionValue(state: GameState, nationId: number): number {
  const st = nationStats(state, nationId);
  let castles = 0;
  for (const c of state.cells) {
    if (c.owner === nationId && c.castle) castles++;
  }
  const gold = state.nations[nationId]?.gold ?? 0;
  return st.cells + st.units * 1.5 + castles * 30 + gold * 0.03;
}

/**
 * 작전 하나를 굴려본다.
 *
 * 내 나라만 turns 번 두게 하고, 끝난 자리의 값어치에서 시작 자리의 값어치를
 * 뺀다. 목표로 못 가는 작전은 땅도 성도 안 늘어나므로 저절로 낮게 나온다.
 */
function rollout(
  state: GameState,
  nationId: number,
  target: Cell | null,
  turns: number,
  rng: RNG,
  eco: EconomyConfig,
  playOne: (s: GameState, id: number, target: Cell | null) => void
): number {
  const before = positionValue(state, nationId);
  for (let t = 0; t < turns; t++) {
    if (state.winner !== null) break;
    if (!state.nations[nationId]?.alive) break;
    playOne(state, nationId, target);
  }
  return positionValue(state, nationId) - before;
}

/**
 * 후보 작전들을 굴려보고 제일 나은 것을 고른다.
 *
 * clone 은 판을 통째로 복사한다. 21x21 이 150KB 이니 여섯 갈래면 1MB 쯤이고,
 * 한 번 고르는 데 그만큼이면 턴제 게임에서는 싸다.
 */
export function choosePlan(
  state: GameState,
  nationId: number,
  candidates: Array<Cell | null>,
  rng: RNG,
  playOne: (s: GameState, id: number, target: Cell | null) => void,
  turns = 3,
  eco: EconomyConfig = DEFAULT_ECONOMY
): PlanScore[] {
  const out: PlanScore[] = [];
  for (const target of candidates) {
    const copy: GameState = structuredClone(state);
    // 복사본에서는 같은 자리를 가리켜야 한다
    const mirrored = target ? copy.cells.find((c) => c.id === target.id) ?? null : null;
    const score = rollout(copy, nationId, mirrored, turns, rng, eco, playOne);
    out.push({ target, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
