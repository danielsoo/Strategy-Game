// 턴 기반 이벤트 처리 (무역상, 강도 등)

import { GameState } from '../models/GameState';
import { getHexCardinalOffsets } from '../utils/hexGrid';
import { spawnMerchantFromFort, moveMerchant, deliverMerchantGold } from './merchantSystem';
import { spawnBandit, moveBanditTowardTarget, getBanditAction } from './banditSystem';

export interface TurnEvent {
  type: 'merchant-spawn' | 'merchant-move' | 'merchant-arrive' | 'bandit-spawn' | 'bandit-move';
  message: string;
  cellId?: string;
}

// 매 턴마다 실행되는 이벤트
export function processTurnEvents(gameState: GameState): { 
  events: TurnEvent[];
  updatedState: GameState;
} {
  const events: TurnEvent[] = [];
  let currentState = { ...gameState };

  console.log(`\n🎲 턴 ${gameState.turn} 이벤트 처리`);

  // 1. 요새에서 무역상 생성 (나라별로 요새 2개부터 시작, 요새마다 1명씩)
  const completedForts = currentState.cells.filter(c => 
    c.building === 'fort' && 
    c.fortState && 
    typeof c.fortState !== 'string' && 
    c.fortState.stage === 'complete'
  );

  // 나라별로 요새 그룹화
  const player0Forts = completedForts.filter(f => f.owner === 0);
  const player1Forts = completedForts.filter(f => f.owner === 1);

  // 플레이어 무역상 생성 (요새 2개 이상부터)
  if (player0Forts.length >= 2) {
    const merchantsToSpawn = player0Forts.length - 1;  // 요새 개수 - 1명
    const existingMerchants = currentState.cells.filter(c => c.owner === 'merchant' && c.merchantOwner === 0).length;
    
    if (existingMerchants < merchantsToSpawn) {
      // 무역상 부족하면 랜덤 요새에서 1명 생성
      const randomFort = player0Forts[Math.floor(Math.random() * player0Forts.length)];
      const merchant = spawnMerchantFromFort(randomFort, 0, currentState);
      console.log('spawnMerchantFromFort returned:', !!merchant);
      if (merchant) {
        if (merchant.newCells) {
          currentState.cells = merchant.newCells;
          events.push({
            type: 'merchant-spawn',
            message: `당신의 요새에서 무역상이 출발했습니다. (${existingMerchants + 1}/${merchantsToSpawn})`,
            cellId: merchant.cell.id,
          });
          console.log(`✅ 플레이어 무역상 생성: ${existingMerchants + 1}/${merchantsToSpawn}`);
          const postMerchants = currentState.cells.filter(c => c.owner === 'merchant');
          console.log('POST-SPAWN MERCHANTS:', postMerchants.map(m => `${m.id} @ (${m.row},${m.col}) owner:${m.merchantOwner} gold:${m.merchantGold || 0}`));
          try {
            console.table(postMerchants.map(m => ({ id: m.id, row: m.row, col: m.col, owner: m.merchantOwner, gold: m.merchantGold })));
          } catch (e) {
            // 일부 환경에서 console.table이 없을 수 있음
          }
        } else {
          console.log('spawnMerchantFromFort returned no newCells (배치 실패 또는 빈칸 없음)');
        }
      }
    }
  }

  // AI 무역상 생성 (요새 2개 이상부터)
  if (player1Forts.length >= 2) {
    const merchantsToSpawn = player1Forts.length - 1;  // 요새 개수 - 1명
    const existingMerchants = currentState.cells.filter(c => c.owner === 'merchant' && c.merchantOwner === 1).length;
    
    if (existingMerchants < merchantsToSpawn) {
      // 무역상 부족하면 랜덤 요새에서 1명 생성
      const randomFort = player1Forts[Math.floor(Math.random() * player1Forts.length)];
      const merchant = spawnMerchantFromFort(randomFort, 1, currentState);
      console.log('spawnMerchantFromFort (AI) returned:', !!merchant);
      if (merchant) {
        if (merchant.newCells) {
          currentState.cells = merchant.newCells;
          events.push({
            type: 'merchant-spawn',
            message: `AI의 요새에서 무역상이 출발했습니다. (${existingMerchants + 1}/${merchantsToSpawn})`,
            cellId: merchant.cell.id,
          });
          console.log(`✅ AI 무역상 생성: ${existingMerchants + 1}/${merchantsToSpawn}`);
          const postMerchants = currentState.cells.filter(c => c.owner === 'merchant');
          console.log('POST-SPAWN MERCHANTS (AI):', postMerchants.map(m => `${m.id} @ (${m.row},${m.col}) owner:${m.merchantOwner} gold:${m.merchantGold || 0}`));
          try {
            console.table(postMerchants.map(m => ({ id: m.id, row: m.row, col: m.col, owner: m.merchantOwner, gold: m.merchantGold })));
          } catch (e) {}
        } else {
          console.log('spawnMerchantFromFort (AI) returned no newCells (배치 실패 또는 빈칸 없음)');
        }
      }
    }
  }

  // 2. 무역상 이동 (immutable)
  const merchants = currentState.cells.filter(c => c.owner === 'merchant');
  console.log(`\n🔄 무역상 이동 처리 시작: ${merchants.length}명의 무역상`);
  for (const merchant of merchants) {
    console.log(`  - 무역상 ${merchant.id} 처리: 상태=${merchant.merchantState}, 경로길이=${merchant.merchantRoute?.length || 0}, 위치=(${merchant.row},${merchant.col})`);
    const moveResult = moveMerchant(merchant, currentState);

    if (moveResult && moveResult.newCells) {
      // 이동 후 무역상 위치 확인
      const movedMerchant = moveResult.newCells.find(c => c.id === moveResult.merchantId && c.owner === 'merchant');
      if (movedMerchant) {
        console.log(`  ✅ 무역상 ${moveResult.merchantId} 이동 완료: 새 위치=(${movedMerchant.row},${movedMerchant.col})`);
      } else {
        console.log(`  ⚠️ 무역상 ${moveResult.merchantId} 이동 후 찾을 수 없음`);
      }
      currentState.cells = moveResult.newCells;
    } else {
      console.log(`  ⏸️ 무역상 ${merchant.id} 이동하지 않음`);
    }

    if (moveResult.arrived) {
      // 목적지(본진 또는 요새)에 도착했는지 판정: merchant 현재 위치 확인
      const currentMerchantCell = currentState.cells.find(c => c.id === moveResult.merchantId);
      if (currentMerchantCell && 
          (currentMerchantCell.building === 'castle' || 
           (currentMerchantCell.building === 'fort' && 
            currentMerchantCell.fortState && 
            typeof currentMerchantCell.fortState !== 'string' && 
            currentMerchantCell.fortState.stage === 'complete')) &&
          currentMerchantCell.merchantState === 'returning' &&
          currentMerchantCell.owner === currentMerchantCell.merchantOwner) {
        // 본진에 돌아왔을 때만 골드 전달
        const deliverResult = deliverMerchantGold(moveResult.merchantId, currentState);
        if (deliverResult.success) {
          currentState.cells = deliverResult.newCells;
          currentState.players = deliverResult.newPlayers as any;
          
          let message = `무역 완료! 순 수익: +${deliverResult.netGold}💰`;
          if (deliverResult.taxAmount > 0) {
            message += ` (총 ${deliverResult.gold}💰 - 세금 ${deliverResult.taxAmount}💰)`;
          }
          
          events.push({
            type: 'merchant-arrive',
            message,
            cellId: moveResult.merchantId,
          });
        }
      }
    } else {
      events.push({
        type: 'merchant-move',
        message: '무역상이 이동 중입니다...',
        cellId: moveResult.merchantId,
      });
    }
  }

  // 3. 강도 생성 (무역상이 있으면 10% 확률)
  if (merchants.length > 0) {
    const roll = Math.random();
    if (roll < 0.10) {  // 10% 확률
      const randomMerchant = merchants[Math.floor(Math.random() * merchants.length)];
      const bandit = spawnBandit(randomMerchant, currentState);
      
      if (bandit) {
        events.push({
          type: 'bandit-spawn',
          message: '⚠️ 강도가 출현했습니다!',
          cellId: bandit.cell.id,
        });
      }
    }
  }

  // 4. 강도 이동
  const bandits = currentState.cells.filter(c => c.owner === 'bandit');
  for (const bandit of bandits) {
    const nextCell = moveBanditTowardTarget(bandit, currentState);
    
    if (nextCell) {
      // 강도 이동
      nextCell.owner = 'bandit';
      nextCell.unitCount = bandit.unitCount;
      nextCell.unitType = bandit.unitType;

      bandit.owner = null;
      bandit.unitCount = 0;
      bandit.unitType = undefined;

      events.push({
        type: 'bandit-move',
        message: '강도가 이동 중입니다...',
        cellId: nextCell.id,
      });
    }
  }

  console.log(`✅ ${events.length}개 이벤트 발생`);

  return { events, updatedState: currentState };
}

// 강도가 무역상/군대를 공격할지 결정
export function checkBanditAttacks(gameState: GameState): {
  attacks: Array<{ bandit: string; target: string }>;
} {
  const attacks: Array<{ bandit: string; target: string }> = [];

  const bandits = gameState.cells.filter(c => c.owner === 'bandit');

  for (const bandit of bandits) {
    // 인접한 무역상이나 군대 찾기
    const adjacent = getAdjacentCells(bandit, gameState);
    
    for (const target of adjacent) {
      if (target.owner === 'merchant') {
        // 무역상 공격 (공포 기반)
        const merchantOwner = target.merchantOwner;
        if (merchantOwner !== undefined) {
          const countryFear = gameState.players[merchantOwner].reputation.fear;
          const action = getBanditAction(bandit, target, countryFear, gameState);
          
          if (action === 'attack') {
            attacks.push({ bandit: bandit.id, target: target.id });
          }
        }
      } else if (target.owner === 0 || target.owner === 1) {
        // 플레이어/AI 군대 공격 (공포 기반)
        const countryFear = gameState.players[target.owner].reputation.fear;
        const action = getBanditAction(bandit, target, countryFear, gameState);
        
        if (action === 'attack') {
          attacks.push({ bandit: bandit.id, target: target.id });
        }
      }
    }
  }

  return { attacks };
}

// 인접한 셀들 가져오기
function getAdjacentCells(cell: any, gameState: GameState): any[] {
  const directions = getHexCardinalOffsets(cell.row);

  const adjacent = [];
  for (const dir of directions) {
    const newRow = cell.row + dir.dr;
    const newCol = cell.col + dir.dc;
    const target = gameState.cells.find(c => c.row === newRow && c.col === newCol);
    
    if (target && target.unitCount > 0) {
      adjacent.push(target);
    }
  }

  return adjacent;
}

