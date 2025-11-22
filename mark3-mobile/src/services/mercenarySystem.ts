import { Cell } from '../models/GameState';

export interface MercenaryEncounter {
  autoAction?: 'join' | 'fight' | 'flee';
  autoJoin?: boolean;
  autoJoinMessage?: string;
}

export function checkMercenaryAutoAction(
  mercenary: Cell,
  attacker: Cell
): MercenaryEncounter | null {
  return null;
}

export function checkMercenaryAutoActionWithContext(
  mercenary: Cell,
  attacker: Cell,
  attackerFear: number,
  attackerJustice: number
): MercenaryEncounter {
  const justicePower = Math.pow(attackerJustice / 100, 2);
  const joinRate = justicePower * 0.3;

  if (Math.random() < joinRate) {
    return {
      autoAction: 'join',
      autoJoin: true,
      autoJoinMessage: '용병이 자발적으로 합류했습니다!',
    };
  }

  return {
    autoAction: 'fight',
  };
}

export function calculateHireCost(
  mercenary: Cell,
  playerJustice: number
): { temporary: number; permanent: number; discount: number } {
  const baseCost = mercenary.unitCount * 100;
  const justiceDiscount = Math.pow(playerJustice / 100, 2) * 0.3;
  const discount = baseCost * justiceDiscount;

  return {
    temporary: Math.floor(baseCost * 0.5 - discount),
    permanent: Math.floor(baseCost - discount),
    discount: Math.floor(discount),
  };
}

export function simulateRetreatFromMercenary(
  mercenary: Cell,
  attackerFear: number
): { pursued: boolean; survivors?: number } {
  const fearPower = Math.pow(attackerFear / 100, 2);
  const pursueRate = fearPower * 0.4;

  if (Math.random() < pursueRate) {
    return { pursued: true };
  }

  return { pursued: false };
}

export function simulateIntimidate(
  mercenary: Cell,
  attackerFear: number
): { success: boolean; survivors?: number } {
  const fearPower = Math.pow(attackerFear / 100, 2);
  const successRate = fearPower * 0.6;

  if (Math.random() < successRate) {
    return {
      success: true,
      survivors: Math.floor(mercenary.unitCount * 0.8),
    };
  }

  return { success: false };
}

export function simulatePersuade(
  mercenary: Cell,
  attackerJustice: number
): { success: boolean; survivors?: number } {
  const justicePower = Math.pow(attackerJustice / 100, 2);
  const successRate = justicePower * 0.5;

  if (Math.random() < successRate) {
    return {
      success: true,
      survivors: mercenary.unitCount,
    };
  }

  return { success: false };
}

