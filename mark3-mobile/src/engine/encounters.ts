// 행군 중에 만나는 일들
//
// 지금까지 이동은 '칸이 내 색이 된다' 뿐이었다. 그런데 이 게임에는 이미
// 정의와 공포라는 평판이 있다 — 항복한 적의 처우, 속국의 충성, 자발적 복속,
// 급여 유예가 모두 거기 걸려 있다. 그 평판이 전장 밖에서도 보이게 한다.
//
//   정의로운 군대가 지나가면  마을이 곡식을 내놓고, 용병이 합류를 청하고,
//                            청년들이 의병으로 따라나선다
//   두려운 군대가 지나가면    마을이 공물을 바치고, 도적이 흩어지지만,
//                            원한을 품은 주민이 우물에 독을 푼다
//
// 그리고 선택이 다시 평판을 만든다 — 마을의 선물을 사양하면 정의가 오르고,
// 장정을 끌고 가면 공포가 오르고 정의가 깎인다. 평판이 사건을 부르고, 사건
// 앞의 선택이 평판을 바꾼다.
//
// 새 땅(내 진영 땅이 아니던 칸)에 들어갈 때만 난다. 제 땅을 오가는 데 매번
// 마을이 튀어나오면 사건이 아니라 소음이다.
//
// AI 도 똑같이 겪는다(성향대로 자동으로 고른다). 사람만 겪으면 사람만 공짜
// 금과 병력을 얻고, 하네스가 재는 게임과 사람이 두는 게임이 달라진다.

import { RNG } from '../services/combatSystem';
import { Cell, GameState, EconomyConfig, DEFAULT_ECONOMY, Nation } from './types';
import { neighbors, stackCap, pushLog } from './rules';

export interface EncounterEffect {
  gold?: number;
  units?: number;
  justice?: number;
  fear?: number;
  morale?: number;
  exhaustion?: number;
  /** 흩어지는 도적 칸 */
  scatter?: string;
}

export interface EncounterOption {
  label: string;
  effect: EncounterEffect;
}

export interface Encounter {
  kind: string;
  title: string;
  story: string;
  /** 하나뿐이면 고를 것 없이 알리기만 한다 */
  options: EncounterOption[];
  nation: number;
  cellId: string;
}

interface Kind {
  kind: string;
  /** 이 나라에게 이 사건이 얼마나 자주 오나. 0 이면 안 온다. */
  weight: (n: Nation, ctx: Ctx) => number;
  make: (n: Nation, ctx: Ctx) => Omit<Encounter, 'kind' | 'nation' | 'cellId'>;
  /** AI 는 무엇을 고르나 */
  pick: (n: Nation, e: Encounter) => number;
}

interface Ctx {
  state: GameState;
  cell: Cell;
  eco: EconomyConfig;
  /** 옆에 있는 도적 칸 */
  bandit: Cell | null;
  room: number;
}

const J = (n: Nation) => n.justice / 100;
const F = (n: Nation) => n.fear / 100;

const KINDS: Kind[] = [
  {
    kind: 'village-gift',
    weight: (n) => 1.2 * J(n),
    make: (n) => {
      const g = 6 + Math.round(10 * J(n));
      return {
        title: '마을의 환대',
        story: '마을 사람들이 정의로운 군대를 반기며 곡식과 은을 내놓았다.',
        options: [
          { label: `고맙게 받는다 (+${g}G)`, effect: { gold: g } },
          { label: `사양하고 오히려 돕는다 (-${Math.round(g / 2)}G, 정의 +4)`, effect: { gold: -Math.round(g / 2), justice: 4 } },
        ],
      };
    },
    // 넉넉하고 정의로운 나라는 돕는다
    pick: (n) => (n.gold > 150 && n.justice > 65 ? 1 : 0),
  },
  {
    kind: 'merc-join',
    weight: (n, c) => (c.room >= 2 ? 1.0 * J(n) : 0),
    make: (_n, c) => {
      const cost = Math.round(c.eco.recruitCost * 1.5);
      return {
        title: '용병의 청',
        story: '떠돌이 용병 무리가 이 군대의 명성을 듣고 합류를 청한다.',
        options: [
          { label: `고용한다 (-${cost}G, 병력 +2)`, effect: { gold: -cost, units: 2 } },
          { label: '돌려보낸다', effect: {} },
        ],
      };
    },
    pick: (n, e) => (n.gold >= -(e.options[0].effect.gold ?? 0) * 2 ? 0 : 1),
  },
  {
    kind: 'volunteers',
    weight: (n, c) => (c.room >= 1 ? 0.6 * J(n) : 0),
    make: () => ({
      title: '의병',
      story: '마을 청년들이 이 군대를 따라나서겠다고 한다.',
      options: [{ label: '확인 (병력 +1)', effect: { units: 1 } }],
    }),
    pick: () => 0,
  },
  {
    kind: 'fear-tribute',
    weight: (n) => 1.2 * F(n),
    make: (n) => {
      const g = 5 + Math.round(10 * F(n));
      return {
        title: '겁먹은 공물',
        story: '군대가 온다는 소식에 마을이 공물을 들고 나와 엎드렸다.',
        options: [
          { label: `받아 챙긴다 (+${g}G, 공포 +2)`, effect: { gold: g, fear: 2 } },
          { label: '돌려주고 안심시킨다 (정의 +2)', effect: { justice: 2 } },
        ],
      };
    },
    pick: (n) => (n.justice > 70 ? 1 : 0),
  },
  {
    kind: 'bandits-scatter',
    weight: (n, c) => (c.bandit ? 1.3 * F(n) : 0),
    make: (_n, c) => ({
      title: '흩어지는 도적',
      story: '소문을 들은 이웃 도적 떼가 싸우지도 않고 달아났다.',
      options: [{ label: '확인 (옆 도적 소굴이 비었다)', effect: { scatter: c.bandit!.id, fear: 1 } }],
    }),
    pick: () => 0,
  },
  {
    kind: 'conscript',
    weight: (n, c) => (c.room >= 2 ? 0.9 * F(n) : 0),
    make: () => ({
      title: '징발',
      story: '마을에 장정들이 있다. 억지로 끌고 갈 수도 있다.',
      options: [
        { label: '끌고 간다 (병력 +2, 정의 -4, 공포 +3)', effect: { units: 2, justice: -4, fear: 3 } },
        { label: '그냥 지나간다', effect: {} },
      ],
    }),
    pick: (n) => (n.justice < 50 ? 0 : 1),
  },
  {
    kind: 'poisoned-well',
    weight: (n) => 0.8 * F(n) * (1 - J(n)),
    make: () => ({
      title: '독 푼 우물',
      story: '원한을 품은 주민들이 우물에 독을 풀었다. 병사들이 앓는다.',
      options: [{ label: '확인 (사기 -15, 피로 +15)', effect: { morale: -15, exhaustion: 15 } }],
    }),
    pick: () => 0,
  },
  {
    kind: 'supplies',
    weight: () => 0.5,
    make: () => ({
      title: '버려진 보급 마차',
      story: '길가에서 주인 잃은 보급 마차를 찾았다.',
      options: [{ label: '확인 (+5G)', effect: { gold: 5 } }],
    }),
    pick: () => 0,
  },
  {
    kind: 'sickness',
    weight: (_n, c) => (c.cell.units > 2 ? 0.4 : 0),
    make: () => ({
      title: '돌림병',
      story: '행군 중에 병이 돌아 한 사람을 잃었다.',
      options: [{ label: '확인 (병력 -1)', effect: { units: -1 } }],
    }),
    pick: () => 0,
  },
];

/**
 * 새 땅에 발을 들인 부대에게 사건이 나는가. 나면 사건을, 아니면 null.
 * 이미 내 진영 땅이던 칸이면 부르지 말 것 — 그 판단은 부르는 쪽이 한다
 * (moveStack 이 주인을 바꾼 뒤에는 알 수 없으므로).
 */
export function rollEncounter(
  state: GameState,
  cell: Cell,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY
): Encounter | null {
  if (eco.encounterChance <= 0 || cell.owner === null || cell.neutral || cell.units <= 0) return null;
  if (rng() >= eco.encounterChance) return null;
  const n = state.nations[cell.owner];
  if (!n) return null;

  const bandit =
    neighbors(state, cell).find((x) => x.neutral === 'bandit' && x.units > 0) ?? null;
  const ctx: Ctx = { state, cell, eco, bandit, room: stackCap(eco) - cell.units };
  const weights = KINDS.map((k) => Math.max(0, k.weight(n, ctx)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  let i = 0;
  for (; i < KINDS.length - 1; i++) {
    r -= weights[i];
    if (r < 0) break;
  }
  const k = KINDS[i];
  return { kind: k.kind, nation: n.id, cellId: cell.id, ...k.make(n, ctx) };
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** 고른 것을 판에 적용한다. 부대가 그 사이 사라졌으면 병력·사기 쪽은 건너뛴다. */
export function applyEncounter(
  state: GameState,
  e: Encounter,
  choice: number,
  eco: EconomyConfig = DEFAULT_ECONOMY
): void {
  const opt = e.options[Math.max(0, Math.min(choice, e.options.length - 1))];
  const fx = opt.effect;
  const n = state.nations[e.nation];
  if (!n) return;
  if (fx.gold) n.gold = Math.max(0, n.gold + fx.gold);
  if (fx.justice) n.justice = clamp(n.justice + fx.justice);
  if (fx.fear) n.fear = clamp(n.fear + fx.fear);

  const c = state.cells.find((x) => x.id === e.cellId);
  if (c && c.owner === e.nation && c.units > 0 && !c.neutral) {
    if (fx.units) c.units = Math.max(1, Math.min(stackCap(eco), c.units + fx.units));
    if (fx.morale) c.morale = clamp(c.morale + fx.morale);
    if (fx.exhaustion) c.exhaustion = clamp(c.exhaustion + fx.exhaustion);
  }
  if (fx.scatter) {
    const b = state.cells.find((x) => x.id === fx.scatter);
    if (b && b.neutral === 'bandit') {
      b.units = 0;
      b.neutral = undefined;
      b.morale = 100;
      b.exhaustion = 0;
    }
  }
  if (n.isHuman) pushLog(state, `${n.name}: ${e.title} — ${opt.label}`);
}

/** AI 의 몫 — 성향대로 골라 바로 적용한다 */
export function resolveEncounterAI(
  state: GameState,
  e: Encounter,
  eco: EconomyConfig = DEFAULT_ECONOMY
): number {
  const k = KINDS.find((x) => x.kind === e.kind);
  const n = state.nations[e.nation];
  const choice = k && n ? k.pick(n, e) : 0;
  applyEncounter(state, e, choice, eco);
  return choice;
}
