// 전투 시스템 (Combat System)
//
// 설계 원칙
//  1. 전투는 병력이 0이 되어 끝나지 않는다. 사기가 꺾여 붕괴(rout)하며 끝난다.
//     → 패배해도 병력이 남아 후퇴한다. "차지 아니면 전멸" 이분법이 사라진다.
//  2. 열세가 이기는 경로는 운이 아니라 조건이다.
//     → 포위 · 피로 · 지형 · 평판을 플레이어가 만들어내면 5명이 10명을 이길 수 있다.
//  3. 모든 난수는 주입받는다(RNG).
//     → 시뮬레이터에서 시드를 고정해 재현하고, 수만 번 돌려 승률을 튜닝한다.
//
// 이 파일은 React에 의존하지 않는 순수 로직이다. 헤드리스로 실행 가능해야 한다.

import { Cell } from '../models/GameState';

export type RNG = () => number;

/** 시드 고정 난수 생성기 (mulberry32). 시뮬레이터 재현용. */
export function makeRng(seed: number): RNG {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────
// 튜닝 상수 — 시뮬레이터가 이 객체를 바꿔가며 승률을 탐색한다
// ─────────────────────────────────────────────────────────────

export interface CombatConfig {
  /** 최대 교전 라운드. 다 버티면 교착(stalemate) */
  maxRounds: number;
  /** 사기가 이 아래로 떨어지면 붕괴 */
  routThreshold: number;
  /** 라운드당 기본 손실률 (전력이 대등할 때 양측이 잃는 비율) */
  baseLossRate: number;
  /** 손실률 난수 폭 (±) */
  lossJitter: number;
  /**
   * 라운드 주도권의 흔들림 폭.
   * 전력비를 한 번 계산해 6라운드를 굴리면 결과가 이미 정해져 있어 난수가 상쇄된다.
   * 매 라운드 주도권이 이만큼 흔들려야 "열세가 좋은 라운드를 연달아 잡아 이기는" 일이 생긴다.
   * 이 값이 이 전투 모델에서 결정론과 무작위성을 가르는 가장 중요한 손잡이다.
   */
  roundSwing: number;
  /** 사상자 비율 대비 사기 하락 배수 */
  moraleLossMultiplier: number;
  /**
   * 라운드가 갈수록 사기 하락이 줄어드는 비율 (참호를 판다).
   * 사기가 단조 감소만 하면 6라운드 안에 반드시 한쪽이 무너져 교착이 생기지 않는다.
   * 이 값이 있어야 "서로 못 밀어내고 대치하는" 전선이 만들어진다.
   */
  moraleDecayPerRound: number;
  /** 포위당했을 때 라운드당 추가 사기 하락 */
  encircleMoralePenalty: number;
  /** 상대의 공포 평판이 최대일 때 라운드당 추가 사기 하락 */
  fearMoraleMax: number;
  /** 자신의 정의 평판이 최대일 때 사기 하락을 줄이는 비율 */
  justiceResistMax: number;
  /** 열세일 때 받는 결사항전 보정 상한 (%p) */
  resolveCapPP: number;
  /** 열세 보정 기울기 — 전력비가 1/R일 때 (1/R - 1) * scale */
  resolvePowerScale: number;
  /** 결사항전이 사기 하락을 막아주는 비율 (보정 100%p 기준) */
  resolveMoraleResist: number;
  /** drift(기세) 누적 상한 (±%p) */
  driftCapPP: number;
  /** 붕괴한 쪽이 후퇴에 성공하는 병력 비율 */
  routSurvivalRate: number;
  /** 피로가 100일 때 전투력이 깎이는 최대 비율 */
  exhaustionPowerMax: number;
}

// `npm run sim:tune` 의 격자 탐색이 찾은 값. 감으로 고른 숫자가 아니다.
// 목표 승률은 sim/tuneCombat.ts 의 TARGETS 에 선언되어 있다.
//
// 알려진 상충: 교착률 목표(12%)는 나머지 목표와 양립하지 않는다. 탐색 결과
// 상위 조합이 전부 moraleDecayPerRound=0 을 골랐다 — 교착을 늘리면 다른
// 승률이 그보다 더 크게 어긋난다. 현재 교착률은 약 5%.
export const DEFAULT_COMBAT_CONFIG: CombatConfig = {
  maxRounds: 6,
  routThreshold: 25,
  baseLossRate: 0.08,
  lossJitter: 0.4,
  roundSwing: 0.95,
  moraleLossMultiplier: 1.4,
  moraleDecayPerRound: 0,
  encircleMoralePenalty: 5,
  fearMoraleMax: 8,
  justiceResistMax: 0.3,
  resolveCapPP: 15,
  resolvePowerScale: 10,
  resolveMoraleResist: 0.5,
  driftCapPP: 15,
  routSurvivalRate: 0.5,
  exhaustionPowerMax: 0.5,
};

// ─────────────────────────────────────────────────────────────
// 전투 입출력
// ─────────────────────────────────────────────────────────────

export interface CombatSide {
  units: number;
  morale?: number; // 기본 100
  exhaustion?: number; // 0~100, 기본 0
  driftPP?: number; // 누적 기세, 기본 0
  fear?: number; // 소속 국가 공포 평판, 기본 50
  justice?: number; // 소속 국가 정의 평판, 기본 50
  /** 지형/요새 방어 계수. 평지 1.0, 숲 1.25, 산 1.4, 완공 요새 ×1.3 */
  defenseMultiplier?: number;
  encircled?: boolean;
}

export interface CombatRound {
  round: number;
  attackerLosses: number;
  defenderLosses: number;
  attackerUnits: number;
  defenderUnits: number;
  attackerMorale: number;
  defenderMorale: number;
  /** 이 라운드에서 특기할 일 (포위 효과 등) */
  notes: string[];
}

export type CombatOutcome = 'attacker-win' | 'defender-win' | 'stalemate';
export type CombatReason = 'rout' | 'annihilation' | 'rounds-exhausted';

export interface DetailedCombatResult {
  outcome: CombatOutcome;
  reason: CombatReason;
  rounds: CombatRound[];
  attackerSurvivors: number;
  defenderSurvivors: number;
  attackerMorale: number;
  defenderMorale: number;
  /** 전투 후 drift(기세)에 더할 값 */
  attackerDriftDelta: number;
  defenderDriftDelta: number;
  /** 열세 보정이 실제로 얼마나 붙었는지 (연출/디버깅용) */
  attackerResolvePP: number;
  defenderResolvePP: number;
}

// ─────────────────────────────────────────────────────────────
// 핵심 엔진
// ─────────────────────────────────────────────────────────────

function basePower(side: CombatSide, cfg: CombatConfig): number {
  const units = Math.max(0, side.units);
  const drift = side.driftPP ?? 0;
  const def = side.defenseMultiplier ?? 1;
  const exh = clamp(side.exhaustion ?? 0, 0, 100);
  return units * (1 + drift / 100) * def * (1 - (exh / 100) * cfg.exhaustionPowerMax);
}

/** 열세일수록 커지는 결사항전 보정 (%p). 눈덩이 효과의 브레이크 역할. */
function resolveBonus(myPower: number, theirPower: number, cfg: CombatConfig): number {
  if (myPower <= 0 || theirPower <= 0) return 0;
  const ratio = myPower / theirPower;
  if (ratio >= 1) return 0;
  return Math.min(cfg.resolveCapPP, (1 / ratio - 1) * cfg.resolvePowerScale);
}

/** 기댓값을 보존하는 확률적 반올림. 병력이 적을 때 소모가 0으로 뭉개지는 걸 막는다. */
function stochasticRound(value: number, rng: RNG): number {
  const floor = Math.floor(value);
  return rng() < value - floor ? floor + 1 : floor;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function resolveCombat(
  attacker: CombatSide,
  defender: CombatSide,
  rng: RNG = Math.random,
  cfg: CombatConfig = DEFAULT_COMBAT_CONFIG
): DetailedCombatResult {
  let attUnits = Math.max(0, Math.floor(attacker.units));
  let defUnits = Math.max(0, Math.floor(defender.units));
  let attMorale = clamp(attacker.morale ?? 100, 0, 100);
  let defMorale = clamp(defender.morale ?? 100, 0, 100);

  const attFear = attacker.fear ?? 50;
  const attJustice = attacker.justice ?? 50;
  const defFear = defender.fear ?? 50;
  const defJustice = defender.justice ?? 50;

  // 전력과 결사항전 보정은 전투 시작 시 한 번 확정한다.
  const rawAtt = basePower(attacker, cfg);
  const rawDef = basePower(defender, cfg);
  const attResolve = resolveBonus(rawAtt, rawDef, cfg);
  const defResolve = resolveBonus(rawDef, rawAtt, cfg);
  const powerAtt = rawAtt * (1 + attResolve / 100);
  const powerDef = rawDef * (1 + defResolve / 100);

  const totalPower = powerAtt + powerDef;
  const attShare = totalPower > 0 ? powerAtt / totalPower : 0.5;

  const rounds: CombatRound[] = [];
  let outcome: CombatOutcome = 'stalemate';
  let reason: CombatReason = 'rounds-exhausted';

  for (let r = 1; r <= cfg.maxRounds; r++) {
    const notes: string[] = [];

    // 1. 이 라운드의 주도권 — 전력비를 중심으로 흔들린다.
    //    좋은 라운드를 잡은 쪽은 덜 잃고 더 입힌다(이중 레버리지). 열세의 역전은 여기서 나온다.
    const swing = (rng() - 0.5) * cfg.roundSwing;
    const edge = clamp(attShare + swing, 0.05, 0.95);
    if (swing > cfg.roundSwing * 0.35) notes.push('아군이 주도권을 잡았다');
    else if (swing < -cfg.roundSwing * 0.35) notes.push('적군이 주도권을 잡았다');

    // 2. 사상자 — 주도권을 잡은 쪽이 덜 잃는다
    const jitterA = 1 + (rng() * 2 - 1) * cfg.lossJitter;
    const jitterD = 1 + (rng() * 2 - 1) * cfg.lossJitter;
    const attLossRate = cfg.baseLossRate * (1 - edge) * 2 * jitterA;
    const defLossRate = cfg.baseLossRate * edge * 2 * jitterD;

    const attLosses = Math.min(attUnits, stochasticRound(attUnits * attLossRate, rng));
    const defLosses = Math.min(defUnits, stochasticRound(defUnits * defLossRate, rng));

    attUnits -= attLosses;
    defUnits -= defLosses;

    // 3. 사기 — 사상자 + 포위 + 상대의 공포, 자신의 정의와 결사항전으로 완화
    //
    // 사기는 반올림된 정수 사상자가 아니라 '압박의 크기'인 손실률로 계산한다.
    // 병력이 5명 남짓이면 정수 반올림에서 손실 0이 흔하게 나오는데, 그걸 그대로
    // 쓰면 소규모 부대가 사기를 거의 안 잃어 비정상적으로 질겨진다.
    attMorale -= moraleDrop(
      attLossRate, attacker.encircled === true, defFear, attJustice, attResolve, cfg, notes, r, '아군'
    );
    defMorale -= moraleDrop(
      defLossRate, defender.encircled === true, attFear, defJustice, defResolve, cfg, notes, r, '적군'
    );
    attMorale = clamp(attMorale, 0, 100);
    defMorale = clamp(defMorale, 0, 100);

    rounds.push({
      round: r,
      attackerLosses: attLosses,
      defenderLosses: defLosses,
      attackerUnits: attUnits,
      defenderUnits: defUnits,
      attackerMorale: Math.round(attMorale),
      defenderMorale: Math.round(defMorale),
      notes,
    });

    // 4. 전멸 판정이 붕괴보다 우선
    if (attUnits <= 0 || defUnits <= 0) {
      reason = 'annihilation';
      if (attUnits <= 0 && defUnits <= 0) outcome = 'defender-win'; // 공격 실패로 간주
      else if (attUnits <= 0) outcome = 'defender-win';
      else outcome = 'attacker-win';
      break;
    }

    // 5. 붕괴 판정 — 더 낮은 쪽이 먼저 무너진다
    const attRout = attMorale < cfg.routThreshold;
    const defRout = defMorale < cfg.routThreshold;
    if (attRout || defRout) {
      reason = 'rout';
      if (attRout && defRout) outcome = attMorale <= defMorale ? 'defender-win' : 'attacker-win';
      else if (attRout) outcome = 'defender-win';
      else outcome = 'attacker-win';
      break;
    }
  }

  // 붕괴한 쪽은 일부만 후퇴에 성공한다
  let attSurvivors = attUnits;
  let defSurvivors = defUnits;
  if (reason === 'rout') {
    if (outcome === 'attacker-win') defSurvivors = Math.floor(defUnits * cfg.routSurvivalRate);
    else attSurvivors = Math.floor(attUnits * cfg.routSurvivalRate);
  }

  // 기세(drift) — 열세로 이겼으면 더 크게 오른다
  const attWasUnderdog = attResolve > 0;
  const defWasUnderdog = defResolve > 0;
  let attDrift = 0;
  let defDrift = 0;
  if (outcome === 'attacker-win') {
    attDrift = 2 + (attWasUnderdog ? 3 : 0);
    defDrift = -3;
  } else if (outcome === 'defender-win') {
    defDrift = 2 + (defWasUnderdog ? 3 : 0);
    attDrift = -3;
  } else {
    attDrift = -1;
    defDrift = -1;
  }

  return {
    outcome,
    reason,
    rounds,
    attackerSurvivors: Math.max(0, attSurvivors),
    defenderSurvivors: Math.max(0, defSurvivors),
    attackerMorale: Math.round(attMorale),
    defenderMorale: Math.round(defMorale),
    attackerDriftDelta: clamp(attDrift, -cfg.driftCapPP, cfg.driftCapPP),
    defenderDriftDelta: clamp(defDrift, -cfg.driftCapPP, cfg.driftCapPP),
    attackerResolvePP: attResolve,
    defenderResolvePP: defResolve,
  };
}

function moraleDrop(
  lossRate: number,
  encircled: boolean,
  opponentFear: number,
  ownJustice: number,
  ownResolvePP: number,
  cfg: CombatConfig,
  notes: string[],
  round: number,
  label: string
): number {
  let drop = clamp(lossRate, 0, 1) * 100 * cfg.moraleLossMultiplier;

  if (encircled) {
    drop += cfg.encircleMoralePenalty;
    notes.push(`${label} 포위 -${cfg.encircleMoralePenalty}`);
  }

  const fearBite = (opponentFear / 100) * cfg.fearMoraleMax;
  if (fearBite > 0) drop += fearBite;

  // 정의로운 군대는 쉽게 무너지지 않는다
  drop *= 1 - (ownJustice / 100) * cfg.justiceResistMax;
  // 절망적인 상황일수록 버틴다 (배수의 진)
  drop *= 1 - (ownResolvePP / 100) * cfg.resolveMoraleResist;
  // 오래 버틸수록 자리를 잡는다 — 이게 있어야 교착이 생긴다
  drop *= Math.max(0.3, 1 - (round - 1) * cfg.moraleDecayPerRound);

  return Math.max(0, drop);
}

// ─────────────────────────────────────────────────────────────
// 기존 호출부 호환 어댑터
// ─────────────────────────────────────────────────────────────

export interface CombatResult {
  details: {
    winner: 'attacker' | 'defender';
    attackerSurvivors: number;
    defenderSurvivors: number;
  };
  /** 새 엔진의 전체 결과. 전투 연출 화면에서 라운드별로 펼쳐 보여준다. */
  detailed: DetailedCombatResult;
}

/** 지형별 방어 계수 */
export function terrainDefense(terrain: Cell['terrain']): number {
  switch (terrain) {
    case 'forest':
      return 1.25;
    case 'mountain':
      return 1.4;
    case 'desert':
      return 0.95;
    default:
      return 1.0;
  }
}

/** 셀을 전투 입력으로 변환 */
export function sideFromCell(
  cell: Cell,
  fear: number,
  justice: number,
  isDefender: boolean
): CombatSide {
  let def = 1;
  if (isDefender) {
    def = terrainDefense(cell.terrain);
    const fs = cell.fortState;
    if (cell.building === 'fort' && fs && typeof fs !== 'string' && fs.stage === 'complete') {
      def *= 1.3;
    }
  }
  return {
    units: cell.unitCount,
    morale: cell.morale ?? 100,
    exhaustion: cell.exhaustion ?? 0,
    driftPP: cell.drift?.deltaPP ?? 0,
    fear,
    justice,
    defenseMultiplier: def,
    encircled: cell.encircled === true,
  };
}

export function simulateCombat(
  attacker: Cell,
  defender: Cell,
  attackerFear: number,
  attackerJustice: number,
  defenderFear: number,
  defenderJustice = 50,
  rng: RNG = Math.random
): CombatResult {
  const detailed = resolveCombat(
    sideFromCell(attacker, attackerFear, attackerJustice, false),
    sideFromCell(defender, defenderFear, defenderJustice, true),
    rng
  );

  // 교착은 "공격 실패"로 취급한다 — 공격자는 제자리에 남고 수비자가 칸을 지킨다.
  const winner: 'attacker' | 'defender' =
    detailed.outcome === 'attacker-win' ? 'attacker' : 'defender';

  return {
    details: {
      winner,
      attackerSurvivors: detailed.attackerSurvivors,
      defenderSurvivors: detailed.defenderSurvivors,
    },
    detailed,
  };
}

export function simulateRetreat(
  defender: Cell,
  retreatStreak: number
): { survivors: number } {
  const baseSurvivalRate = 0.7;
  const streakPenalty = Math.min(0.3, retreatStreak * 0.1);
  const survivalRate = Math.max(0.3, baseSurvivalRate - streakPenalty);

  return {
    survivors: Math.max(1, Math.floor(defender.unitCount * survivalRate)),
  };
}

export function simulateSurrender(
  troops: number,
  attackerFear: number,
  attackerJustice: number
): { deaths: number; recruited: number; escaped: number } {
  const fearPower = Math.pow(attackerFear / 100, 2);
  const justicePower = Math.pow(attackerJustice / 100, 2);

  const executionRate = fearPower * 0.5;
  const deaths = Math.floor(troops * executionRate);

  const recruitRate = justicePower * 0.7;
  const recruited = Math.floor((troops - deaths) * recruitRate);

  const escaped = troops - deaths - recruited;

  return { deaths, recruited, escaped };
}
