// 전장의 안개
//
// 모두가 전지적 시점이면 정찰할 이유도, 기동할 이유도 없다. 앉아서 최적해를
// 계산하는 게 언제나 낫다. 자가대전 학습이 "전진 0, 집결 0"으로 수렴한 데에도
// 이 점이 깔려 있었다.
//
// 세 단계로 나눈다.
//   미탐색  한 번도 가보지 않았다 — 지형조차 모른다
//   기억    가봤지만 지금은 보는 눈이 없다 — 지형과 건물은 알되 지금 누가
//           있는지는 모른다. 마지막으로 본 시점의 기억만 남는다
//   가시    지금 보고 있다 — 전부 안다

import { Cell, GameState, EconomyConfig, DEFAULT_ECONOMY, Owner, Terrain } from './types';
import { hexDistance } from '../utils/hexGrid';

/** 마지막으로 그 칸을 봤을 때의 기억 */
export interface CellMemory {
  terrain: Terrain;
  castle: boolean;
  fortStage: number;
  /** 마지막으로 봤을 때의 주인. 지금도 그런지는 알 수 없다. */
  owner: Owner;
  /** 마지막으로 봤을 때의 병력. 참고용일 뿐 현재값이 아니다. */
  units: number;
  seenTurn: number;
}

export interface NationVision {
  /** 한 번이라도 본 칸 */
  explored: boolean[];
  /** 지금 보고 있는 칸 */
  visible: boolean[];
  /** 탐색했으나 지금은 안 보이는 칸의 기억 */
  memory: Array<CellMemory | null>;
}

export function createVision(cellCount: number): NationVision {
  return {
    explored: new Array(cellCount).fill(false),
    visible: new Array(cellCount).fill(false),
    memory: new Array(cellCount).fill(null),
  };
}

function idxOf(state: GameState, c: Cell): number {
  return c.row * state.cols + c.col;
}

/**
 * 시야를 다시 계산한다.
 * 부대는 주변을, 본진과 요새는 더 넓게 본다.
 */
export function recomputeVision(
  state: GameState,
  nationId: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): void {
  const v = state.vision[nationId];
  if (!v) return;

  v.visible.fill(false);

  // 눈이 되는 것들 — 내 부대, 내 본진, 내 완공 요새
  const eyes: Array<{ cell: Cell; radius: number }> = [];
  for (const c of state.cells) {
    if (c.owner !== nationId) continue;
    if (c.castle || c.fortStage === 4) {
      eyes.push({ cell: c, radius: eco.visionRadiusHub });
    } else if (c.units > 0 && !c.neutral) {
      eyes.push({ cell: c, radius: eco.visionRadiusUnit });
    }
  }
  // 이동 중인 무역상도 눈 노릇을 한다
  for (const m of state.merchants) {
    if (m.nation !== nationId) continue;
    const c = state.cells[m.row * state.cols + m.col];
    if (c) eyes.push({ cell: c, radius: 1 });
  }

  for (const e of eyes) {
    for (const c of state.cells) {
      if (hexDistance(e.cell.row, e.cell.col, c.row, c.col) > e.radius) continue;
      const i = idxOf(state, c);
      v.visible[i] = true;
      v.explored[i] = true;
      v.memory[i] = {
        terrain: c.terrain,
        castle: c.castle,
        fortStage: c.fortStage,
        owner: c.owner,
        units: c.units,
        seenTurn: state.turn,
      };
    }
  }
}

export function isVisible(state: GameState, nationId: number, c: Cell): boolean {
  return state.vision[nationId]?.visible[idxOf(state, c)] ?? true;
}

export function isExplored(state: GameState, nationId: number, c: Cell): boolean {
  return state.vision[nationId]?.explored[idxOf(state, c)] ?? true;
}

export function memoryOf(state: GameState, nationId: number, c: Cell): CellMemory | null {
  return state.vision[nationId]?.memory[idxOf(state, c)] ?? null;
}

/**
 * 이 나라가 아는 한도에서의 칸 상태.
 *
 * 보이면 실제 값, 기억만 있으면 마지막으로 본 값, 미탐색이면 null.
 * AI 는 이것만 보고 판단해야 한다. 그러지 않으면 안개를 넣어도 전지적으로
 * 둔다.
 */
export function knownCell(state: GameState, nationId: number, c: Cell): CellMemory | null {
  const v = state.vision[nationId];
  if (!v) {
    return {
      terrain: c.terrain,
      castle: c.castle,
      fortStage: c.fortStage,
      owner: c.owner,
      units: c.units,
      seenTurn: state.turn,
    };
  }
  const i = idxOf(state, c);
  if (v.visible[i]) {
    return {
      terrain: c.terrain,
      castle: c.castle,
      fortStage: c.fortStage,
      owner: c.owner,
      units: c.units,
      seenTurn: state.turn,
    };
  }
  return v.memory[i];
}

/** 아직 한 번도 못 본 칸들 — 정찰할 가치가 있는 곳 */
export function unexploredCount(state: GameState, nationId: number, around: Cell, radius = 2): number {
  const v = state.vision[nationId];
  if (!v) return 0;
  let n = 0;
  for (const c of state.cells) {
    if (hexDistance(around.row, around.col, c.row, c.col) > radius) continue;
    if (!v.explored[idxOf(state, c)]) n++;
  }
  return n;
}
