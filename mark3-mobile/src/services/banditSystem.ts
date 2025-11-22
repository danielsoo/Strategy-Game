// 강도 시스템 (Bandit System)

import { Cell, GameState } from '../models/GameState';
import { getHexNeighborOffsets } from '../utils/hexGrid';

export interface BanditSpawnInfo {
  cell: Cell;
  spawnLocation: string;
}

// 강도 생성 (무역상 근처에 스폰)
export function spawnBandit(
  nearCell: Cell,
  gameState: GameState
): BanditSpawnInfo | null {
  console.log(`\n🦹 강도 스폰 시도 (${nearCell.id} 근처)`);

  // 빈 인접 셀 찾기
  const emptyCell = findAdjacentEmptyCell(nearCell, gameState);
  if (!emptyCell) {
    console.log('❌ 강도를 배치할 빈 칸이 없습니다.');
    return null;
  }

  // 강도 생성 (1~3명)
  const banditCount = Math.floor(1 + Math.random() * 3);
  
  emptyCell.owner = 'bandit';
  emptyCell.unitCount = banditCount;
  emptyCell.unitType = 'INF';

  console.log(`✅ 강도 ${banditCount}명이 ${emptyCell.id}에 생성되었습니다.`);

  return { cell: emptyCell, spawnLocation: emptyCell.id };
}

// 빈 인접 셀 찾기 (나라/군인 주변 제외)
function findAdjacentEmptyCell(cell: Cell, gameState: GameState): Cell | null {
  const directions = getHexNeighborOffsets(cell.row);

  // 랜덤 순서로 탐색
  const shuffled = directions.sort(() => Math.random() - 0.5);

  for (const dir of shuffled) {
    const newRow = cell.row + dir.dr;
    const newCol = cell.col + dir.dc;
    const adjacent = gameState.cells.find(c => c.row === newRow && c.col === newCol);
    
    if (adjacent && adjacent.owner === null && adjacent.unitCount === 0) {
      // 나라/군인 주변인지 확인 (2칸 이내에 성, 요새, 군대가 있으면 제외)
      if (!isNearNationOrMilitary(adjacent, gameState)) {
        return adjacent;
      }
    }
  }

  return null;
}

// 셀이 나라/군인 주변인지 확인 (2칸 이내)
function isNearNationOrMilitary(cell: Cell, gameState: GameState): boolean {
  const checkRadius = 2; // 2칸 이내
  
  for (let dr = -checkRadius; dr <= checkRadius; dr++) {
    for (let dc = -checkRadius; dc <= checkRadius; dc++) {
      const checkRow = cell.row + dr;
      const checkCol = cell.col + dc;
      const distance = Math.abs(dr) + Math.abs(dc);
      
      if (distance > checkRadius || distance === 0) continue;
      
      const checkCell = gameState.cells.find(c => c.row === checkRow && c.col === checkCol);
      if (!checkCell) continue;
      
      // 성, 요새, 또는 군대(플레이어/AI)가 있으면 제외
      if (checkCell.building === 'castle' || 
          checkCell.building === 'fort' ||
          (checkCell.owner === 0 || checkCell.owner === 1) && checkCell.unitCount > 0) {
        return true;
      }
    }
  }
  
  return false;
}

// 강도 AI 행동 결정 (공포 게이지 기반)
export function getBanditAction(
  bandit: Cell,
  target: Cell,
  targetFear: number,
  gameState: GameState
): 'attack' | 'wait' | 'move' {
  console.log(`\n🦹 강도 행동 결정`);
  console.log(`타겟: ${target.owner === 'merchant' ? '무역상' : target.owner === 0 ? 'You' : 'AI'}`);
  console.log(`타겟 공포: ${targetFear.toFixed(0)}`);

  // 타겟이 무역상인 경우
  if (target.owner === 'merchant' && target.merchantOwner !== undefined) {
    const merchantCountry = target.merchantOwner;
    const countryFear = gameState.players[merchantCountry].reputation.fear;
    
    console.log(`무역상 소속 국가 공포: ${countryFear.toFixed(0)}`);

    // 공포 게이지가 높을수록 공격 확률 감소
    const baseAttackRate = 0.80;  // 기본 80% 공격
    const fearPenalty = (countryFear / 100) * 0.60;  // 최대 -60%
    const attackRate = Math.max(0.20, baseAttackRate - fearPenalty);

    console.log(`공격 확률: ${(attackRate * 100).toFixed(1)}% (기본 80% - 공포 감소 ${(fearPenalty * 100).toFixed(1)}%)`);

    const roll = Math.random();
    if (roll < attackRate) {
      console.log(`주사위: ${(roll * 100).toFixed(1)}% → 🎯 무역상 공격!`);
      return 'attack';
    } else {
      console.log(`주사위: ${(roll * 100).toFixed(1)}% → 😨 너무 무서워서 공격 못함`);
      return 'wait';
    }
  }

  // 타겟이 플레이어/AI 군대인 경우
  if (target.owner === 0 || target.owner === 1) {
    const powerRatio = bandit.unitCount / target.unitCount;
    
    console.log(`전력 비율: ${powerRatio.toFixed(2)} (강도 ${bandit.unitCount} vs 적 ${target.unitCount})`);

    // 공포 게이지가 높을수록 공격 확률 감소
    const baseAttackRate = 0.70;  // 기본 70% 공격 (용병보다 조금 더 조심스러움)
    const fearPenalty = (targetFear / 100) * 0.50;  // 최대 -50%
    const attackRate = Math.max(0.15, baseAttackRate - fearPenalty);

    console.log(`공격 확률: ${(attackRate * 100).toFixed(1)}% (기본 70% - 공포 감소 ${(fearPenalty * 100).toFixed(1)}%)`);

    // 전력이 2배 이상 우세하고 공포가 낮으면 공격
    if (powerRatio >= 2.0) {
      const roll = Math.random();
      if (roll < attackRate) {
        console.log(`주사위: ${(roll * 100).toFixed(1)}% → 🎯 군대 공격! (2배 우세)`);
        return 'attack';
      }
    }

    // 전력이 비슷하면 30% 확률로만 공격 (공포 감소 적용)
    if (powerRatio >= 0.8 && powerRatio < 2.0) {
      const cautionAttackRate = Math.max(0.10, 0.30 - fearPenalty);
      const roll = Math.random();
      if (roll < cautionAttackRate) {
        console.log(`주사위: ${(roll * 100).toFixed(1)}% → 🎯 군대 공격! (비슷한 전력)`);
        return 'attack';
      }
    }

    console.log('😨 적이 너무 강하거나 무서워서 공격 안 함');
    return 'wait';
  }

  return 'wait';
}

// 강도 이동 (무역상이나 약한 목표를 찾아 이동)
export function moveBanditTowardTarget(
  bandit: Cell,
  gameState: GameState
): Cell | null {
  console.log(`\n🦹 강도 이동 (${bandit.id})`);

  // 가까운 무역상 찾기
  const merchants = gameState.cells.filter(c => c.owner === 'merchant');
  if (merchants.length > 0) {
    const nearest = findNearestCell(bandit, merchants);
    if (nearest) {
      const nextCell = moveToward(bandit, nearest, gameState);
      if (nextCell) {
        console.log(`🎯 무역상을 향해 ${nextCell.id}로 이동`);
        return nextCell;
      }
    }
  }

  // 무역상이 없으면 랜덤 배회
  console.log('🚶 배회 중...');
  return moveRandom(bandit, gameState);
}

// 가장 가까운 셀 찾기
function findNearestCell(from: Cell, targets: Cell[]): Cell | null {
  if (targets.length === 0) return null;

  let nearest = targets[0];
  let minDistance = distance(from, nearest);

  for (const target of targets) {
    const dist = distance(from, target);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = target;
    }
  }

  return nearest;
}

// 거리 계산 (맨해튼 거리)
function distance(a: Cell, b: Cell): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

// 목표를 향해 한 칸 이동
function moveToward(from: Cell, to: Cell, gameState: GameState): Cell | null {
  const directions = getHexNeighborOffsets(from.row);

  let bestCell: Cell | null = null;
  let bestDistance = Infinity;

  for (const dir of directions) {
    const newRow = from.row + dir.dr;
    const newCol = from.col + dir.dc;
    const cell = gameState.cells.find(c => c.row === newRow && c.col === newCol);

    if (cell && cell.owner === null && cell.unitCount === 0) {
      const dist = distance(cell, to);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestCell = cell;
      }
    }
  }

  return bestCell;
}

// 랜덤 이동
function moveRandom(from: Cell, gameState: GameState): Cell | null {
  const directions = getHexNeighborOffsets(from.row);

  const shuffled = directions.sort(() => Math.random() - 0.5);

  for (const dir of shuffled) {
    const newRow = from.row + dir.dr;
    const newCol = from.col + dir.dc;
    const cell = gameState.cells.find(c => c.row === newRow && c.col === newCol);

    if (cell && cell.owner === null && cell.unitCount === 0) {
      return cell;
    }
  }

  return null;
}

// 강도가 무역상을 약탈
export function banditPlunderMerchant(
  bandit: Cell,
  merchant: Cell
): { gold: number } {
  const gold = merchant.merchantGold || 0;

  console.log(`\n💰 강도가 무역상을 약탈했습니다! ${gold} 골드 획득`);

  // 무역상 제거
  merchant.owner = null;
  merchant.merchantOwner = undefined;
  merchant.merchantGold = undefined;
  merchant.merchantRoute = undefined;
  merchant.unitCount = 0;
  merchant.unitType = undefined;

  // 강도는 골드를 가지고 있지 않음 (그냥 약탈만 함)
  return { gold };
}

