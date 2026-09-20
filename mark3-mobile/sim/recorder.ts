// 경기 기록
//
// 지금까지는 승률 표만 보고 판단했다. 왜 그런 결과가 나왔는지는 알 수 없었다.
// 한 판을 통째로 남겨 되짚어 볼 수 있어야 한다.
//
// 두 단계로 남긴다.
//   summary   턴마다 나라별 지표와 사건 — 판을 훑어보기 위한 것
//   decisions 부대마다 어떤 선택지가 있었고 무엇을 골랐는지 — 학습에 쓰는 것
//
// decisions 까지 켜면 파일이 커진다. 필요할 때만 켠다.

import * as fs from 'fs';
import * as path from 'path';
import { GameState } from '../src/engine/types';
import { nationStats, computeLedger } from '../src/engine/rules';
import { influenceOf, vassalsOf } from '../src/engine/vassals';
import { AIWeights } from '../src/engine/ai';

export type LogLevel = 'off' | 'summary' | 'decisions';

export interface TurnSnapshot {
  turn: number;
  nations: Array<{
    id: number;
    alive: boolean;
    cells: number;
    units: number;
    forts: number;
    gold: number;
    net: number;
    influence: number;
    suzerain: number | null;
    loyalty: number;
    vassals: number;
    fear: number;
    justice: number;
  }>;
  events: string[];
}

/** 한 부대가 한 턴에 내린 결정 — 학습이 먹을 수 있는 형태 */
export interface DecisionRecord {
  turn: number;
  nation: number;
  cellId: string;
  units: number;
  /** 고른 행동 */
  chosen: { kind: string; target?: string; score: number };
  /** 다음으로 좋았던 행동 — 얼마나 아슬아슬한 선택이었는지 */
  runnerUp?: { kind: string; target?: string; score: number };
  /** 이 부대가 본 전력비와 태세 */
  posture?: string;
}

export interface MatchLog {
  runId: string;
  gameIndex: number;
  seed: number;
  rows: number;
  cols: number;
  nations: Array<{ id: number; name: string; label: string; weights: AIWeights }>;
  snapshots: TurnSnapshot[];
  decisions: DecisionRecord[];
  result: {
    winner: number | null;
    winnerLabel: string;
    turns: number;
    reachedTurnLimit: boolean;
    attacksPerNation: number[];
    finalInfluence: number[];
  };
}

export function snapshot(state: GameState, sinceLog: number): TurnSnapshot {
  return {
    turn: state.turn,
    nations: state.nations.map((n) => {
      const s = nationStats(state, n.id);
      const l = computeLedger(state, n.id);
      return {
        id: n.id,
        alive: n.alive,
        cells: s.cells,
        units: s.units,
        forts: s.forts,
        gold: Math.round(n.gold),
        net: Math.round(l.net * 10) / 10,
        influence: Math.round(influenceOf(state, n.id) * 10) / 10,
        suzerain: n.suzerain,
        loyalty: Math.round(n.loyalty),
        vassals: vassalsOf(state, n.id).length,
        fear: Math.round(n.fear),
        justice: Math.round(n.justice),
      };
    }),
    events: state.log.slice(sinceLog),
  };
}

export class Recorder {
  private logs: MatchLog[] = [];
  readonly runId: string;
  readonly dir: string;

  constructor(readonly level: LogLevel, baseDir = path.join(process.cwd(), 'sim', 'logs')) {
    this.runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.dir = path.join(baseDir, this.runId);
  }

  get enabled(): boolean {
    return this.level !== 'off';
  }

  add(log: MatchLog): void {
    if (!this.enabled) return;
    this.logs.push(log);
  }

  /** 판별 파일 하나 + 전체 요약 하나 */
  flush(): string | null {
    if (!this.enabled || this.logs.length === 0) return null;
    fs.mkdirSync(this.dir, { recursive: true });

    for (const log of this.logs) {
      const file = path.join(this.dir, `game-${String(log.gameIndex).padStart(4, '0')}.json`);
      fs.writeFileSync(file, JSON.stringify(log, null, this.level === 'decisions' ? 0 : 1));
    }

    const index = this.logs.map((l) => ({
      game: l.gameIndex,
      seed: l.seed,
      winner: l.result.winnerLabel,
      turns: l.result.turns,
      turnLimit: l.result.reachedTurnLimit,
      roster: l.nations.map((n) => n.label),
      influence: l.result.finalInfluence.map((v) => Math.round(v)),
      attacks: l.result.attacksPerNation,
    }));
    const indexFile = path.join(this.dir, 'index.json');
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 1));
    return this.dir;
  }
}
