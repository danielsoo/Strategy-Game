// 행군 중에 만나는 일들
//
// 새 땅에 들어설 때 가끔 일이 생긴다. 무슨 일이 생기는지(마을·용병·도적·
// 보급 마차·돌림병)는 누구에게나 같다. 달라지는 것은 상대의 반응이다 —
// 정의로운 이름이 앞서 간 군대에게 마을은 곡식을 들고 나오고, 공포가 앞서 간
// 군대에게는 곡식을 숨기고 엎드린다. 다만 정해지지는 않는다. 반응마다 무게가
// 있고, 평판은 그 무게를 기울일 뿐이다. 정의의 나라에게도 문을 닫는 마을이 있고,
// 원한을 품는 마을이 있다.
//
//   반응의 무게 (J = 정의/100, F = 공포/100)
//     마을   반긴다 0.6+3J · 문을 닫는다 1.2 · 엎드린다 0.6+3F · 독을 푼다 0.2+1.5F(1-J)
//     용병   청한다 0.6+3J · 값을 부른다 1.2 · 겁먹는다 0.6+3F
//     도적   투항 0.4+2J · 기습 1.0 · 달아난다 0.4+3F
//
// 그리고 반응마다 고를 수 있는 대처가 다르다. 고른 것이 다시 평판이 된다 —
// 선물을 사양하면 공포가 누그러지고, 문을 부수면 정의가 깎이고 공포가 오른다.
//
// 새 땅(내 진영이 아니던 칸)에 들어갈 때만 난다. 제 땅을 오가는 데 매번
// 마을이 튀어나오면 사건이 아니라 소음이다.
//
// AI 도 똑같이 겪는다. 사람만 겪으면 사람만 공짜 금과 병력을 얻고, 하네스가
// 재는 게임과 사람이 두는 게임이 달라진다. AI 의 대처는 성격과 형편으로 고르되
// 평판이 한쪽으로 무너지지 않게 한다 — '정의가 낮으면 징발' 로 두었더니 한 번
// 50 아래로 내려간 나라가 끝없이 잔혹해졌다(21x21 판 끝 정의 43.7 → 29.5).

import { RNG } from '../services/combatSystem';
import { Cell, GameState, EconomyConfig, DEFAULT_ECONOMY, Nation } from './types';
import { neighbors, stackCap, pushLog } from './rules';
import { adjustRep, characterOf } from './reputation';

export interface EncounterEffect {
  gold?: number;
  units?: number;
  justice?: number;
  fear?: number;
  morale?: number;
  exhaustion?: number;
  /** 비는 도적 칸 */
  scatter?: string;
}

export interface EncounterOption {
  label: string;
  effect: EncounterEffect;
}

export interface Encounter {
  /** '사건:반응' — 기록과 AI 선택에 쓴다 */
  kind: string;
  title: string;
  story: string;
  /** 평판이 반응을 기울였을 때 한 줄 — '정의로운 이름이 앞서 갔다' */
  rumor?: string;
  /** 하나뿐이면 고를 것 없이 알리기만 한다 */
  options: EncounterOption[];
  nation: number;
  cellId: string;
}

interface Ctx {
  state: GameState;
  cell: Cell;
  eco: EconomyConfig;
  n: Nation;
  J: number;
  F: number;
  /** 옆에 있는 도적 칸 */
  bandit: Cell | null;
  /** 이 부대에 더 들어갈 수 있는 병력 */
  room: number;
}

interface Reaction {
  key: string;
  weight: (c: Ctx) => number;
  /** 이 반응이 평판 때문에 나왔다면 붙는 소문 */
  lean?: 'J' | 'F';
  make: (c: Ctx) => { title: string; story: string; options: EncounterOption[] };
  /** AI 는 무엇을 고르나 */
  pick: (c: Ctx, e: Encounter) => number;
}

interface EventKind {
  key: string;
  weight: (c: Ctx) => number;
  reactions: Reaction[];
}

const merc = (c: Ctx) => Math.round(c.eco.recruitCost * 1.5);

const EVENTS: EventKind[] = [
  {
    key: 'village',
    weight: () => 0.45,
    reactions: [
      {
        key: 'welcome',
        lean: 'J',
        weight: (c) => 0.6 + 3 * c.J,
        make: (c) => {
          const g = 6 + Math.round(8 * c.J);
          return {
            title: '마을의 환대',
            story: '마을 사람들이 곡식과 은을 들고 나와 군대를 반긴다.',
            options: [
              { label: `고맙게 받는다 (+${g}G)`, effect: { gold: g } },
              {
                label: `사양하고 오히려 돕는다 (-${Math.round(g / 2)}G, 공포 -3)`,
                effect: { gold: -Math.round(g / 2), fear: -3 },
              },
            ],
          };
        },
        // 넉넉하면 돕는다. 두려움이 쌓인 나라도 여유가 있으면 돕는다 — 공포를
        // 누그러뜨릴 몇 안 되는 길이다.
        pick: (c) => ((c.n.gold > 150 && c.J > 0.5) || (c.F > 0.4 && c.n.gold > 60) ? 1 : 0),
      },
      {
        key: 'wary',
        weight: () => 1.2,
        make: () => ({
          title: '닫힌 마을',
          story: '마을이 문을 닫아걸고 군대를 지켜본다.',
          options: [
            { label: '값을 치르고 곡식을 산다 (-5G, 사기 +10)', effect: { gold: -5, morale: 10 } },
            { label: '그냥 지나간다', effect: {} },
            { label: '문을 부수고 빼앗는다 (+8G, 정의 -1, 공포 +2)', effect: { gold: 8, justice: -1, fear: 2 } },
          ],
        }),
        pick: (c) =>
          characterOf(c.n) === 'feared' && c.F < 0.6 ? 2 : c.cell.morale < 60 && c.n.gold > 50 ? 0 : 1,
      },
      {
        key: 'bow',
        lean: 'F',
        weight: (c) => 0.6 + 3 * c.F,
        make: (c) => {
          const g = 5 + Math.round(8 * c.F);
          const opts: EncounterOption[] = [
            { label: `공물을 받아 챙긴다 (+${g}G, 공포 +2)`, effect: { gold: g, fear: 2 } },
            { label: '두고 간다 — 안심시킨다 (공포 -2)', effect: { fear: -2 } },
          ];
          if (c.room >= 2) {
            opts.push({
              label: '장정을 끌고 간다 (병력 +2, 정의 -4, 공포 +3)',
              effect: { units: 2, justice: -4, fear: 3 },
            });
          }
          return {
            title: '엎드린 마을',
            story: '군대가 온다는 소문에 마을이 곡식을 숨기고 길가에 엎드렸다.',
            options: opts,
          };
        },
        /*
          공포가 이미 높으면(60+) 두고 간다 — 공포가 끝없이 오르면 적이 항복하지
          않고 끝까지 싸워 판이 굳는다. 장정은 부대가 작고 정의가 바닥이 아닐
          때만 끌고 간다(정의가 낮을 때 끌고 가면 악순환이었다).
        */
        pick: (c, e) => {
          if (c.F >= 0.6) return 1;
          if (e.options.length > 2 && c.cell.units <= 3 && c.J >= 0.3) return 2;
          return 0;
        },
      },
      {
        key: 'poison',
        lean: 'F',
        weight: (c) => 0.2 + 1.5 * c.F * (1 - c.J),
        make: () => ({
          title: '독 푼 우물',
          story: '원한을 품은 주민들이 우물에 독을 풀었다. 병사들이 앓는다.',
          options: [
            { label: '참고 지나간다 (사기 -15, 피로 +15)', effect: { morale: -15, exhaustion: 15 } },
            {
              label: '마을을 불태워 본보기로 삼는다 (+6G, 사기 -15, 정의 -2, 공포 +4)',
              effect: { gold: 6, morale: -15, justice: -2, fear: 4 },
            },
          ],
        }),
        pick: (c) => (characterOf(c.n) === 'feared' && c.F < 0.6 ? 1 : 0),
      },
    ],
  },
  {
    key: 'mercs',
    weight: (c) => (c.room >= 2 ? 0.2 : 0),
    reactions: [
      {
        key: 'ask',
        lean: 'J',
        weight: (c) => 0.6 + 3 * c.J,
        make: (c) => ({
          title: '용병의 청',
          story: '떠돌이 용병 무리가 이 군대의 이름을 듣고 합류를 청한다.',
          options: [
            { label: `고용한다 (-${merc(c)}G, 병력 +2)`, effect: { gold: -merc(c), units: 2 } },
            { label: '돌려보낸다', effect: {} },
          ],
        }),
        pick: (c) => (c.n.gold >= merc(c) * 2 ? 0 : 1),
      },
      {
        key: 'haggle',
        weight: () => 1.2,
        make: (c) => {
          const cost = Math.round(merc(c) * 1.6);
          return {
            title: '흥정하는 용병',
            story: '용병 무리가 값을 부른다. 싸게 굴 생각은 없어 보인다.',
            options: [
              { label: `비싸게 고용한다 (-${cost}G, 병력 +2)`, effect: { gold: -cost, units: 2 } },
              { label: '거절한다', effect: {} },
            ],
          };
        },
        pick: (c) => (c.n.gold >= merc(c) * 3 ? 0 : 1),
      },
      {
        key: 'cowed',
        lean: 'F',
        weight: (c) => 0.6 + 3 * c.F,
        make: (c) => {
          const cheap = Math.round(merc(c) * 0.4);
          return {
            title: '겁먹은 용병',
            story: '이 군대를 알아본 용병들이 겁에 질려 있다.',
            options: [
              { label: `헐값에 부린다 (-${cheap}G, 병력 +2, 공포 +1)`, effect: { gold: -cheap, units: 2, fear: 1 } },
              { label: `제값을 치른다 (-${merc(c)}G, 병력 +2, 공포 -1)`, effect: { gold: -merc(c), units: 2, fear: -1 } },
              { label: '쫓아 보낸다', effect: {} },
            ],
          };
        },
        pick: (c) => (c.F < 0.6 ? 0 : c.n.gold >= merc(c) ? 1 : 2),
      },
    ],
  },
  {
    key: 'bandits',
    weight: (c) => (c.bandit ? 0.15 : 0),
    reactions: [
      {
        key: 'join',
        lean: 'J',
        weight: (c) => 0.4 + 2 * c.J,
        make: (c) => ({
          title: '투항하는 도적',
          story: '옆 소굴의 도적들이 무기를 내려놓고 받아달라 청한다.',
          options: [
            ...(c.room >= 1
              ? [{ label: '받아들인다 (소굴이 비고 병력 +1)', effect: { scatter: c.bandit!.id, units: 1 } }]
              : []),
            { label: '살려서 흩어 보낸다 (소굴이 비고 공포 -1)', effect: { scatter: c.bandit!.id, fear: -1 } },
          ],
        }),
        pick: () => 0,
      },
      {
        key: 'ambush',
        weight: () => 1.0,
        make: () => ({
          title: '도적의 기습',
          story: '옆 소굴의 도적들이 밤을 틈타 야영지를 덮쳤다.',
          options: [{ label: '확인 (병력 -1, 사기 -10)', effect: { units: -1, morale: -10 } }],
        }),
        pick: () => 0,
      },
      {
        key: 'flee',
        lean: 'F',
        weight: (c) => 0.4 + 3 * c.F,
        make: (c) => ({
          title: '달아나는 도적',
          story: '소문을 들은 도적 떼가 싸우지도 않고 소굴을 버리고 달아났다.',
          options: [{ label: '확인 (옆 도적 소굴이 비었다)', effect: { scatter: c.bandit!.id } }],
        }),
        pick: () => 0,
      },
    ],
  },
  {
    key: 'wagon',
    weight: () => 0.1,
    reactions: [
      {
        key: 'found',
        weight: () => 1,
        make: () => ({
          title: '버려진 보급 마차',
          story: '길가에서 주인 잃은 보급 마차를 찾았다. 근처 마을의 것으로 보인다.',
          options: [
            { label: '챙긴다 (+5G)', effect: { gold: 5 } },
            { label: '마을에 돌려준다 (공포 -1)', effect: { fear: -1 } },
          ],
        }),
        pick: (c) => (c.F >= 0.6 ? 1 : 0),
      },
    ],
  },
  {
    key: 'sickness',
    weight: (c) => (c.cell.units > 2 ? 0.1 : 0),
    reactions: [
      {
        key: 'plague',
        weight: () => 1,
        make: () => ({
          title: '돌림병',
          story: '행군 중에 병이 돌아 한 사람을 잃었다.',
          options: [{ label: '확인 (병력 -1)', effect: { units: -1 } }],
        }),
        pick: () => 0,
      },
    ],
  },
];

function roll<T>(items: T[], weights: number[], rng: RNG): T | null {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

function ctxOf(state: GameState, cell: Cell, eco: EconomyConfig): Ctx | null {
  if (cell.owner === null) return null;
  const n = state.nations[cell.owner];
  if (!n) return null;
  const bandit = neighbors(state, cell).find((x) => x.neutral === 'bandit' && x.units > 0) ?? null;
  return {
    state,
    cell,
    eco,
    n,
    J: n.justice / 100,
    F: n.fear / 100,
    bandit,
    room: stackCap(eco) - cell.units,
  };
}

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
  const c = ctxOf(state, cell, eco);
  if (!c) return null;

  const ev = roll(EVENTS, EVENTS.map((e) => e.weight(c)), rng);
  if (!ev) return null;
  const re = roll(ev.reactions, ev.reactions.map((r) => r.weight(c)), rng);
  if (!re) return null;
  const made = re.make(c);
  const ch = characterOf(c.n);
  const rumor =
    re.lean === 'J' && ch === 'just'
      ? '정의로운 이름이 군대보다 먼저 와 있었다.'
      : re.lean === 'F' && ch === 'feared'
      ? '공포가 군대보다 먼저 도착해 있었다.'
      : undefined;
  return { kind: `${ev.key}:${re.key}`, nation: c.n.id, cellId: cell.id, rumor, ...made };
}

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
  if (fx.justice || fx.fear) adjustRep(state, n.id, fx.justice ?? 0, fx.fear ?? 0);

  const c = state.cells.find((x) => x.id === e.cellId);
  if (c && c.owner === e.nation && c.units > 0 && !c.neutral) {
    if (fx.units) c.units = Math.max(1, Math.min(stackCap(eco), c.units + fx.units));
    if (fx.morale) c.morale = Math.max(0, Math.min(100, c.morale + fx.morale));
    if (fx.exhaustion) c.exhaustion = Math.max(0, Math.min(100, c.exhaustion + fx.exhaustion));
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

/** AI 의 몫 — 성격과 형편으로 골라 바로 적용한다 */
export function resolveEncounterAI(
  state: GameState,
  e: Encounter,
  eco: EconomyConfig = DEFAULT_ECONOMY
): number {
  const [evKey, reKey] = e.kind.split(':');
  const re = EVENTS.find((x) => x.key === evKey)?.reactions.find((r) => r.key === reKey);
  const cell = state.cells.find((x) => x.id === e.cellId);
  const c = cell ? ctxOf(state, cell, eco) : null;
  const choice = re && c ? re.pick(c, e) : 0;
  applyEncounter(state, e, choice, eco);
  return choice;
}
