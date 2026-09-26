// 첫 판 길잡이
//
// 도움말(규칙 일곱 줄)을 읽고 시작하게 했더니, 읽어도 '그래서 뭘 누르지?'
// 가 남는다. 규칙은 읽어서가 아니라 한 번 해봐서 안다. 그래서 진짜 판
// (1대1 · 9x9 · 아주 쉬움) 위에서 한 단계씩, 누를 것을 판 위에서 직접
// 짚어주고(반짝이는 칸·단추), 해내면 방금 무슨 일이 일어났는지 풀어준다.
//
//   짚기    이 칸 / 이 단추를 누르세요
//   해보기  사람이 실제로 누른다 — 판정은 done()
//   풀이    방금 일어난 일과 그 까닭 (after) → '다음'
//
// 연습 지도를 따로 만들지 않은 것은 일부러다. 규칙이 바뀔 때마다 지도도
// 같이 고쳐야 하고, 안 고치면 튜토리얼이 거짓말을 한다. 진짜 판은 규칙과
// 같이 움직인다. 대신 판마다 짚을 칸이 달라지므로 coachTarget() 이 그때그때
// 고른다 — 못 고르면(옆에 적이 없음 등) pending 글로 바꿔 말한다.
//
// 여기는 글과 판정만 있다. 화면은 Coach.tsx, 숫자 세기는 GameScreen.

import {
  Cell,
  GameState,
  neighbors,
  isHostile,
  canMoveTo,
  canAttackFrom,
  isVisible,
  isExplored,
  recruitableCastles,
} from '../engine';

/** 길잡이가 보는 것. 카운터는 튜토리얼을 시작한 뒤로 누적이다. */
export interface CoachProgress {
  selected: boolean;
  moves: number;
  paths: number;
  recruits: number;
  attacks: number;
  turn: number;
}

/** 판 위에서 짚는 것 */
export type CoachTarget =
  | 'castle' // 내 성
  | 'unit' // 움직일 수 있는 내 부대
  | 'step' // 고른 부대가 갈 만한 옆 칸
  | 'far' // 고른 부대를 보낼 먼 칸
  | 'hostile' // 칠 수 있는 적 (또는 적 옆의 내 부대)
  | 'recruit' // 징병 단추
  | 'endTurn' // 턴 종료 단추
  | 'gold' // 머리말의 돈
  | 'diplo'; // 외교 단추

export interface CoachStep {
  title: string;
  /** 무엇을 누르라는가 */
  body: string;
  target?: CoachTarget;
  /** 짚을 것을 못 찾았을 때 body 대신 하는 말 */
  pending?: string;
  /**
   * 해냈나. base 는 이 단계가 시작될 때의 값이다 — 앞 단계에서 이미 한
   * 것으로 이 단계가 저절로 넘어가면 안 된다.
   * 없으면 글만 있는 단계로, '다음' 을 눌러 넘긴다.
   */
  done?: (now: CoachProgress, base: CoachProgress) => boolean;
  /** 해낸 뒤 — 방금 무슨 일이 일어났나 */
  after?: string;
  /**
   * 시킨 것을 지금 못 할 수도 있다(뽑을 성이 없음, 옆에 적이 없음).
   * 그런 단계에는 '다음에 해볼게요' 를 같이 띄워 막히지 않게 한다.
   */
  optional?: boolean;
}

export const COACH_STEPS: CoachStep[] = [
  {
    title: '당신의 나라',
    target: 'castle',
    body:
      '반짝이는 칸이 당신의 성입니다. 이 색 깃발이 꽂힌 칸이 모두 당신 땅이고, ' +
      '칸 위의 병사 인형과 숫자가 부대(병력 수)입니다.\n' +
      '이기는 법: 살아남은 나라를 모두 당신 진영으로 만들면 이깁니다 — 적의 마지막 성을 빼앗아 병합하거나 속국으로 삼으세요. 땅만 넓혀서는 이기지 못합니다.',
  },
  {
    title: '1. 부대 고르기',
    target: 'unit',
    body: '반짝이는 칸의 부대를 눌러 고르세요.',
    done: (now) => now.selected,
    after:
      '골랐습니다. 금빛 테두리(2D 지도는 노란 칸)가 이 부대가 이번 턴에 갈 수 있는 곳입니다.\n' +
      '왼쪽 아래에 이 부대의 병력·사기·행군력이 나옵니다. 병력이 많을수록 한 칸 가는 데 행군력이 많이 들어 느립니다.',
  },
  {
    title: '2. 움직이기',
    target: 'step',
    body: '반짝이는 칸을 누르세요 — 부대가 그리로 갑니다. (다른 금빛 칸을 눌러도 됩니다.)',
    pending: '부대 선택이 풀렸습니다. 반짝이는 부대를 다시 눌러 고르세요.',
    done: (now, base) => now.moves > base.moves,
    after:
      '옮겨갔습니다. 빈 칸에 들어가면 그 칸이 당신 땅이 되고, 주변의 안개가 걷힙니다.\n' +
      '이 부대는 이번 턴에 더 못 움직입니다 — 한 부대는 한 턴에 한 번입니다.',
  },
  {
    title: '3. 병사 뽑기',
    target: 'recruit',
    body: '왼쪽 아래의 반짝이는 "징병" 단추를 누르세요(키보드 R). 단추에 적힌 만큼 돈이 듭니다.',
    pending:
      '지금은 뽑을 수 있는 성이 없습니다 — 성에 병력이 꽉 차 있거나 이번 턴에 이미 뽑았습니다. ' +
      '성 안의 부대를 밖으로 내보내면 다음 턴에 뽑을 수 있습니다.',
    done: (now, base) => now.recruits > base.recruits,
    after:
      '성에 병사가 늘었습니다. 성마다 한 턴에 한 번 뽑을 수 있고, 한 칸에는 10명까지만 들어갑니다.\n' +
      '병사가 많을수록 매 턴 유지비가 나갑니다 — 무작정 뽑으면 돈이 마릅니다.',
    optional: true,
  },
  {
    title: '4. 턴 넘기기',
    target: 'endTurn',
    body: '이번 턴에 할 일은 끝났습니다. 반짝이는 "턴 종료" 를 누르세요(키보드 Enter).',
    done: (now, base) => now.turn > base.turn,
    after:
      '새 턴입니다. 그 사이 상대 나라와 중립 세력이 움직였고, 무슨 일이 있었는지는 왼쪽의 사건 목록에 적힙니다.\n' +
      '돈이 수지만큼 들어왔고, 모든 부대가 다시 움직일 수 있습니다. 가만히 있던 부대는 사기와 피로가 회복됩니다.',
  },
  {
    title: '5. 멀리 보내기',
    target: 'far',
    body:
      '부대를 고른 뒤, 반짝이는 먼 칸을 한 번 누르세요 — 가는 길과 몇 턴 걸리는지가 화살표로 보입니다. ' +
      '같은 칸을 한 번 더 누르면 출발합니다.',
    pending: '먼저 반짝이는 부대를 눌러 고르세요.',
    done: (now, base) => now.paths > base.paths,
    after:
      '보냈습니다. 이제 이 부대는 매 턴 알아서 그쪽으로 걸어갑니다. 안개 너머로도 보낼 수 있습니다.\n' +
      '가다가 적을 만나거나 길이 막히면 멈추고, 그 부대를 다시 골라 보여줍니다 — 싸울지는 당신이 정합니다.',
    optional: true,
  },
  {
    title: '6. 싸우기',
    target: 'hostile',
    body:
      '다른 나라 색 깃발은 적, 회색(용병)·갈색(도적) 깃발은 중립 세력입니다. ' +
      '반짝이는 부대를 고르면 옆의 적 칸에도 금빛 테두리가 뜹니다 — 반짝이는 적 칸을 누르면 공격입니다. ' +
      '도적·용병 무리를 누르면 먼저 조우 창이 뜹니다 — 계약하거나, 물러나라 하거나, "공격한다" 를 고르세요.',
    pending:
      '아직 부대 옆에 보이는 적이 없습니다. 부대를 앞으로 보내고 턴을 넘기며 다가가세요 — ' +
      '적과 붙으면 여기서 짚어드립니다.',
    done: (now, base) => now.attacks > base.attacks,
    after:
      '전투 결과가 떴습니다. 라운드마다 양쪽 사기가 깎이고, 먼저 꺾이는 쪽이 집니다 — 병력이 적어도 이길 수 있습니다.\n' +
      '이기면 그 칸으로 들어가고, 지면 제자리에 남습니다. 옆에 아군을 나란히 붙여두면 협공으로 힘을 보태고, 적을 둘러싸면 더 잘 이깁니다.\n' +
      '반대로 적이 쳐들어오면 게임이 멈추고 맞설지·물러날지·항복할지 묻습니다.',
    optional: true,
  },
  {
    title: '7. 돈',
    target: 'gold',
    body:
      '왼쪽 위 💰 옆의 +/- 가 한 턴 수지입니다. 병력 유지비와 행정비가 나가고, 행정비는 땅이 넓어질수록 가팔라집니다.\n' +
      '적자가 몇 턴 이어지면 병사들이 떠납니다.',
  },
  {
    title: '8. 외교와 평판',
    target: 'diplo',
    body:
      '아래 "외교" 단추로 다른 나라에 휴전이나 동맹을 청할 수 있습니다. 상대가 먼저 사신을 보내오기도 합니다.\n' +
      '조약을 깨면 배신입니다 — 정의가 깎이고, 다른 나라들이 당신의 말을 덜 믿습니다.\n' +
      '새 땅에 들어서면 가끔 마을·용병·도적을 만납니다. 정의로운 이름에는 환대가, 두려운 이름에는 공물과 원한이 따르기 쉽습니다 — 반드시는 아닙니다. 한 일이 쌓여 한쪽이 앞서면 나라의 성격이 바뀝니다.',
  },
  {
    title: '9. 속국',
    body:
      '적의 마지막 성을 빼앗으면 그 나라를 합칠지 속국으로 둘지 고릅니다.\n' +
      '속국은 조공을 바치고 행정비는 스스로 냅니다 — 넓어질수록 직접 먹는 것보다 부리는 쪽이 이득입니다. ' +
      '속국이 생기면 "속국 집무실" 단추로 명령을 내릴 수 있습니다.',
  },
  {
    title: '이제 혼자',
    body:
      '길잡이는 여기까지입니다. 이 판을 끝까지 둬보세요.\n' +
      '규칙은 언제든 왼쪽 아래 "도움말" 에서 다시 볼 수 있습니다.',
  },
];

/** 이 부대를 지금 움직일 수 있나 */
function canAct(state: GameState, c: Cell, acted: Set<string>): boolean {
  if (c.units <= 0 || c.neutral) return false;
  if (c.fortStage > 0 && c.fortStage < 4) return false;
  if (acted.has(c.id)) return false;
  return neighbors(state, c).some((n) =>
    isHostile(c, n) ? canAttackFrom(c, n) : canMoveTo(c, n)
  );
}

/** 걸어서 k 칸 떨어진 칸들 (바깥 칸 제외) */
function ring(state: GameState, from: Cell, k: number): Cell[] {
  let frontier = [from];
  const seen = new Set([from.id]);
  for (let d = 0; d < k; d++) {
    const next: Cell[] = [];
    for (const c of frontier) {
      for (const n of neighbors(state, c)) {
        if (n.offMap || seen.has(n.id)) continue;
        seen.add(n.id);
        next.push(n);
      }
    }
    frontier = next;
  }
  return frontier;
}

/**
 * 짚을 칸을 고른다. 없으면 null — 단추를 짚는 단계도 null 이다.
 *
 * 고를 수 있는 것이 여럿이면 '처음 하는 사람이 해서 헷갈리지 않을 것' 을
 * 고른다. 부대는 움직일 수 있는 칸이 많은 것(한 칸도 못 가는 대군을 짚으면
 * '눌렀는데 아무것도 안 된다' 가 된다), 옆 칸은 주인 없는 빈 칸(들어가면
 * 땅이 느는 게 바로 보인다).
 */
export function coachTarget(
  state: GameState,
  player: number,
  target: CoachTarget | undefined,
  selected: string | null,
  acted: Set<string>
): string | null {
  if (!target) return null;
  const mine = state.cells.filter((c) => c.owner === player && !c.neutral);
  const sel = selected ? state.cells.find((c) => c.id === selected) ?? null : null;

  const bestUnit = (): string | null => {
    let best: Cell | null = null;
    let bestScore = -Infinity;
    for (const c of mine) {
      if (!canAct(state, c, acted)) continue;
      const opts = neighbors(state, c).filter((n) => !n.offMap && canMoveTo(c, n)).length;
      const score = opts * 10 - c.units; // 갈 곳이 많고 가벼운 부대
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best?.id ?? null;
  };

  switch (target) {
    case 'castle':
      return mine.find((c) => c.castle)?.id ?? null;
    case 'unit':
      return sel ? null : bestUnit();
    case 'step': {
      if (!sel) return null; // pending: 다시 고르라
      const opts = neighbors(state, sel).filter(
        (n) => !n.offMap && !isHostile(sel, n) && canMoveTo(sel, n)
      );
      const empty = opts.filter((n) => n.owner === null && n.units === 0);
      return (empty[0] ?? opts[0])?.id ?? null;
    }
    case 'far': {
      if (!sel) return bestUnit(); // 먼저 보낼 부대를 짚는다
      // 3칸 밖, 가장 가까운 적 성 쪽이면 좋겠지만 모르는 것을 알려줄 수는 없다.
      // 주인 없는 칸 중 하나 — 그쪽 안개를 걷는 정찰이 된다.
      // 3D 판은 한 번도 못 가본 칸을 그리지 않는다 — 거기를 짚으면 표지가
      // 안 보인다. 가본 적 있는 칸을 먼저 고른다.
      const far = ring(state, sel, 3).filter((c) => !c.castle && c.owner !== player);
      const pick =
        far.find((c) => c.units === 0 && isExplored(state, player, c)) ??
        far.find((c) => isExplored(state, player, c)) ??
        far[0];
      return pick?.id ?? null;
    }
    case 'hostile': {
      const foesOf = (c: Cell) =>
        neighbors(state, c).filter(
          (n) => isHostile(c, n) && isVisible(state, player, n) && canAttackFrom(c, n)
        );
      if (sel) {
        const foe = foesOf(sel)[0];
        if (foe) return foe.id;
      }
      const attacker = mine.find((c) => canAct(state, c, acted) && foesOf(c).length > 0);
      return attacker?.id ?? null;
    }
    default:
      return null;
  }
}

/**
 * 짚을 것이 있나 — 없으면 pending 글을 띄운다.
 * 단추 단계는 누를 수 있는 상태인지로 본다.
 */
export function coachReady(
  state: GameState,
  player: number,
  step: CoachStep,
  cell: string | null,
  selected: string | null
): boolean {
  switch (step.target) {
    case 'recruit':
      return recruitableCastles(state, player).length > 0;
    case 'endTurn':
    case 'gold':
    case 'diplo':
    case 'castle':
    case undefined:
      return true;
    case 'unit':
      return cell !== null || selected !== null;
    case 'far':
      // 고르기 전에는 부대를, 고른 뒤에는 먼 칸을 짚는다
      return selected !== null ? cell !== null : true;
    default:
      return cell !== null;
  }
}
