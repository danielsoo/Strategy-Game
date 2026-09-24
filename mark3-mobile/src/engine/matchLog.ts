// 사람이 둔 판의 기록
//
// 지금까지 이 게임에 대해 아는 것은 전부 AI 끼리 수천 판 돌린 결과다. 하네스는
// "AI 들끼리 균형이 맞나" 를 재지 "사람이 재미있나" 를 재지 않는다. 사람이 한
// 판을 끝까지 두면 그 한 판이 하네스 삼천 판보다 많은 것을 알려준다.
//
// 그래서 사람이 두는 판을 통째로 남긴다. sim/recorder.ts 의 TurnSnapshot 과
// 같은 모양으로 맞췄다 — 나중에 사람 기록과 AI 기록을 같은 눈으로 볼 수 있다.
//
// 남기는 것은 세 가지다.
//   판 짜기   이름·판 크기·난이도, 그리고 규칙 도장. 규칙이 바뀌면 옛 기록과
//             지금 기록을 섞어 보면 안 되므로 도장이 같이 있어야 한다.
//   턴마다    나라별 지표와 그 턴에 일어난 일
//   사람의 수 사람이 무엇을 했는지 — 공격·징병·명령·수비 선택
//
// 크기는 백 턴짜리가 50KB 남짓이다. 브라우저에 스무 판쯤 쌓아둘 수 있다.

import { GameState } from './types';
import { nationStats, computeLedger } from './rules';
import { influenceOf, vassalsOf } from './vassals';
import { rulesStamp } from './stamp';

/**
 * 2: id 와 resumes 가 붙었다. 1 에는 id 가 없으므로 startedAt 을 대신 쓴다.
 */
export const MATCH_LOG_VERSION = 2;

export interface MatchTurn {
  turn: number;
  nations: Array<{
    id: number;
    alive: boolean;
    cells: number;
    units: number;
    gold: number;
    net: number;
    influence: number;
    suzerain: number | null;
    loyalty: number;
    vassals: number;
    fear: number;
    justice: number;
  }>;
  /** 그 턴에 새로 생긴 사건들 */
  events: string[];
  /** 사람이 그 턴에 한 것 */
  human: {
    attacks: number;
    captured: number;
    recruited: number;
    /** 속국에게 내린 명령 */
    orders: number;
    /** 수비 선택 — 맞섬·후퇴·항복 */
    defense: string[];
  };
}

export interface MatchLog {
  version: number;
  /**
   * 판 하나에 하나. 저장 파일에도 같이 적어서, 이어하기를 해도 같은 기록에
   * 이어 붙는다. 전에는 이어할 때마다 새 기록이 열려 한 판이 '1~30턴' 과
   * '31~60턴' 두 판으로 쪼개졌고, 둘을 잇는 고리가 없었다.
   * 가족 여럿의 파일을 합칠 때도 이것으로 겹친 판을 걸러낸다.
   * (version 1 기록에는 없다 — 그때는 startedAt 이 열쇠다.)
   */
  id?: string;
  /** 규칙 도장. 다르면 다른 게임의 기록이다. */
  stamp: string;
  startedAt: string;
  player: string;
  setup: {
    rows: number;
    cols: number;
    nations: number;
    difficulty: string;
    /**
     * 길잡이를 따라 둔 판. 시키는 대로 누른 수라 '사람이 스스로 고른 수' 와
     * 섞어 보면 안 된다 — 모아서 볼 때 이것으로 거른다.
     */
    tutorial?: boolean;
  };
  turns: MatchTurn[];
  /**
   * 이어하기로 다시 연 턴들. 창을 닫았다 연 자리를 알면 '여기서 그만뒀다' 를
   * 읽을 수 있다. 기록이 브라우저에서 밀려나 새로 열었으면 첫 값이 곧
   * 이 기록의 첫 턴이다 — 그 앞은 turns 에 없다.
   */
  resumes?: number[];
  result?: { winner: number | null; winnerName: string; reason: string; turns: number };
}

/**
 * 판 기록을 연다. id 는 밖에서 받는다 — 엔진은 난수를 스스로 만들지 않는다.
 */
export function startMatch(
  state: GameState,
  player: string,
  difficulty: string,
  id: string
): MatchLog {
  return {
    version: MATCH_LOG_VERSION,
    id,
    stamp: rulesStamp(),
    startedAt: new Date().toISOString(),
    player,
    setup: {
      rows: state.rows,
      cols: state.cols,
      nations: state.nations.length,
      difficulty,
    },
    turns: [],
  };
}

/** 빈 '사람이 한 것' — 턴이 시작될 때 만들어 두고 채운다 */
export function emptyHumanTurn(): MatchTurn['human'] {
  return { attacks: 0, captured: 0, recruited: 0, orders: 0, defense: [] };
}

/**
 * 한 턴을 적는다.
 *
 * events 는 state.log 에서 이번 턴에 새로 늘어난 줄만 받는다 — state.log 는
 * 40줄에서 밀려나므로 전부를 여기 남겨야 나중에 되짚을 수 있다.
 */
export function recordTurn(
  log: MatchLog,
  state: GameState,
  events: string[],
  human: MatchTurn['human']
): void {
  log.turns.push({
    turn: state.turn,
    nations: state.nations.map((n) => {
      const st = nationStats(state, n.id);
      const led = computeLedger(state, n.id);
      return {
        id: n.id,
        alive: n.alive,
        cells: st.cells,
        units: st.units,
        gold: Math.round(n.gold),
        net: Math.round(led.net * 10) / 10,
        influence: Math.round(influenceOf(state, n.id) * 10) / 10,
        suzerain: n.suzerain,
        loyalty: Math.round(n.loyalty),
        vassals: vassalsOf(state, n.id).length,
        fear: Math.round(n.fear),
        justice: Math.round(n.justice),
      };
    }),
    events,
    human,
  });
}

export function finishMatch(log: MatchLog, state: GameState): void {
  log.result = {
    winner: state.winner,
    winnerName: state.winner !== null ? state.nations[state.winner].name : '',
    reason: state.winReason ?? (state.winner === null ? '끝나지 않음' : '승리'),
    turns: state.turn,
  };
}

/** 목록에 한 줄로 띄울 설명 */
export function describeMatch(m: MatchLog): string {
  const when = m.startedAt.slice(5, 16).replace('T', ' ');
  const size = `${m.setup.rows}x${m.setup.cols}`;
  const end = m.result
    ? m.result.winner === null
      ? '미완'
      : `${m.result.winnerName} 승리 · ${m.result.turns}턴`
    : `진행 중 · ${m.turns.length}턴`;
  return `${when} · ${m.player} · ${size} · ${m.setup.difficulty} · ${end}`;
}
