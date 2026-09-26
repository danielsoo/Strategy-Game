// 수비자의 선택 — 맞서 싸울까, 물러날까, 항복할까
//
// 규칙을 src/engine 으로 통합할 때(2ddf116) 통째로 사라졌던 기제를 되살린다.
// 다만 한 군데를 바꿨다. 예전에는 공격자가 버튼으로 '후퇴/항복'을 골랐는데,
// 그건 이치에 맞지 않는다 — 물러날지 항복할지는 맞는 쪽이 정하는 것이다.
//
// 이게 공포·정의 축을 전투에 직접 붙인다.
//   공포가 높은 정복자에게는 항복해봐야 죽는다 → 죽기 살기로 싸운다
//   정의로운 정복자에게는 항복하면 살아서 편입된다 → 가망 없으면 항복한다
//
// 그래서 공포로만 밀어붙이면 가는 곳마다 결사항전을 만나고, 정의를 쌓으면
// 싸우지 않고도 병력이 불어난다.

import { Cell, GameState, EconomyConfig, DEFAULT_ECONOMY } from './types';
import { RNG } from '../services/combatSystem';
import { effJ, effF } from './reputation';

export type DefenseChoice = 'fight' | 'retreat' | 'surrender';

export interface RetreatResult {
  survivors: number;
  to: Cell | null;
}

export interface SurrenderResult {
  deaths: number;
  recruited: number;
  escaped: number;
}

/**
 * 후퇴하면 얼마나 살아남는가.
 *
 * 연달아 물러날수록 대열이 무너져 더 많이 잃는다. 후퇴가 공짜면
 * 아무도 싸우지 않고 도망만 다닌다.
 */
export function retreatSurvivors(units: number, streak: number): number {
  const rate = Math.max(0.3, 0.7 - Math.min(0.3, streak * 0.1));
  return Math.max(1, Math.floor(units * rate));
}

/**
 * 항복한 병력의 운명. 공격자의 평판이 정한다.
 *
 * 처형 = (공포/100)² × 0.5
 * 편입 = (정의/100)² × 0.7 × 살아남은 수
 */
export function surrenderOutcome(
  units: number,
  attackerFear: number,
  attackerJustice: number
): SurrenderResult {
  const deaths = Math.floor(units * Math.pow(attackerFear / 100, 2) * 0.5);
  const recruited = Math.floor((units - deaths) * Math.pow(attackerJustice / 100, 2) * 0.7);
  return { deaths, recruited, escaped: units - deaths - recruited };
}

/**
 * 수비자가 무엇을 고를까.
 *
 * 가망이 있으면 싸운다. 없으면 도망갈 곳이 있는지 보고, 없으면 항복을 생각한다.
 * 항복은 '살 수 있을 때'만 뜻이 있다 — 공포가 높은 상대에게는 항복해도 죽으니
 * 차라리 싸운다.
 *
 * 성과 요새는 버티는 곳이다. 지키라고 지은 것을 두고 물러나지 않는다.
 */
export function decideDefense(
  state: GameState,
  attacker: Cell,
  defender: Cell,
  myPower: number,
  theirPower: number,
  escape: Cell | null,
  rng: RNG,
  eco: EconomyConfig = DEFAULT_ECONOMY,
  /**
   * 이 확률로 최선이 아닌 선택을 한다. 난이도가 여기에도 들어간다 —
   * 약한 AI 는 이길 싸움에서 도망가고 질 싸움에서 버틴다.
   */
  noise = 0
): DefenseChoice {
  // 중립 세력은 물러나지도 항복하지도 않는다. 잃을 나라가 없다.
  if (defender.neutral || defender.owner === null) return 'fight';
  if (defender.castle || defender.fortStage === 4) return 'fight';

  const odds = myPower / Math.max(0.001, theirPower);
  // 해볼 만하면 싸운다
  if (odds >= 0.65) return 'fight';

  const att = attacker.owner !== null ? state.nations[attacker.owner] : null;
  const fear = effF(att?.fear ?? 0);
  const justice = effJ(att?.justice ?? 0);

  // 항복해서 살아남을 확률이 곧 항복할 마음이다
  const { deaths } = surrenderOutcome(defender.units, fear, justice);
  const survivalIfSurrender = 1 - deaths / Math.max(1, defender.units);

  // 사기가 꺾였고, 가망이 없고, 항복해도 죽지 않을 상대라면 항복
  const hopeless = odds < 0.35;
  const broken = defender.morale < 45;
  if (hopeless && broken && survivalIfSurrender > 0.7 && rng() < 0.7) return 'surrender';

  // 물러날 곳이 있으면 물러난다
  if (escape) return 'retreat';

  // 갈 곳이 없으면 싸우는 수밖에 없다
  return 'fight';
}

/** 난이도를 태운 수비 판단 */
export function decideDefenseAt(
  state: GameState,
  attacker: Cell,
  defender: Cell,
  myPower: number,
  theirPower: number,
  escape: Cell | null,
  rng: RNG,
  eco: EconomyConfig,
  noise: number
): DefenseChoice {
  const best = decideDefense(state, attacker, defender, myPower, theirPower, escape, rng, eco);
  if (noise <= 0 || rng() >= noise) return best;
  // 헷갈린 선택 — 할 수 있는 것 중 아무거나
  const opts: DefenseChoice[] = ['fight'];
  if (escape && !defender.castle && defender.fortStage !== 4 && !defender.neutral) opts.push('retreat');
  if (defender.owner !== null && !defender.neutral && !defender.castle) opts.push('surrender');
  return opts[Math.floor(rng() * opts.length)];
}
