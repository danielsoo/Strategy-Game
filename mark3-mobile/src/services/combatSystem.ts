import { Cell } from '../models/GameState';

export interface CombatResult {
  details: {
    winner: 'attacker' | 'defender';
    attackerSurvivors: number;
    defenderSurvivors: number;
  };
}

export function simulateCombat(
  attacker: Cell,
  defender: Cell,
  attackerFear: number,
  attackerJustice: number,
  defenderFear: number
): CombatResult {
  const attackerPower = attacker.unitCount * (1 + attackerFear / 100);
  const defenderPower = defender.unitCount * (1 + defenderFear / 100);

  const totalPower = attackerPower + defenderPower;
  const attackerWinRate = attackerPower / totalPower;

  const roll = Math.random();
  const attackerWins = roll < attackerWinRate;

  if (attackerWins) {
    const survivalRate = 0.6;
    return {
      details: {
        winner: 'attacker',
        attackerSurvivors: Math.max(1, Math.floor(attacker.unitCount * survivalRate)),
        defenderSurvivors: 0,
      },
    };
  } else {
    const survivalRate = 0.6;
    return {
      details: {
        winner: 'defender',
        attackerSurvivors: 0,
        defenderSurvivors: Math.max(1, Math.floor(defender.unitCount * survivalRate)),
      },
    };
  }
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

