// 무역상 시스템 (Merchant/Trade System)

import { Cell, GameState } from '../models/GameState';
import { getHexCardinalOffsets, getHexNeighborOffsets, hexDistance } from '../utils/hexGrid';
import { calculateRoute, calculateDetourRoute } from './tradeSystem';

// 무역상 예상 수익 계산
export function calculateExpectedProfit(
  merchant: Cell,
  destination: Cell,
  gameState: GameState
): {
  baseGold: number;        // 기본 골드
  distance: number;        // 거리
  destinationMultiplier: number; // 목적지 배수 (본진=2.0, 요새=1.5)
  grossProfit: number;      // 총 수익 (세 전)
  taxAmount: number;       // 세금
  netProfit: number;       // 순 수익 (세 후)
  ownerName: string;       // 목적지 소유자 이름
} {
  const distance = hexDistance(merchant.row, merchant.col, destination.row, destination.col);
  const baseGold = merchant.merchantGold || 50;
  const destinationMultiplier = destination.building === 'castle' ? 2.0 : 1.5;
  const grossProfit = Math.floor(baseGold * destinationMultiplier * (1 + distance * 0.05));
  
  // 목적지 소유자의 세율 적용
  const destinationOwner = destination.owner;
  let taxRate = 0;
  let ownerName = '중립';
  
  if (destinationOwner === 0 || destinationOwner === 1) {
    const owner = gameState.players.find(p => p.id === destinationOwner);
    if (owner) {
      taxRate = owner.taxRate;
      ownerName = owner.name;
    }
  }
  
  const taxAmount = Math.floor(grossProfit * taxRate);
  const netProfit = grossProfit - taxAmount;
  
  return {
    baseGold,
    distance,
    destinationMultiplier,
    grossProfit,
    taxAmount,
    netProfit,
    ownerName,
  };
}

export interface MerchantSpawnInfo {
  cell: Cell;
  owner: 0 | 1;
  gold: number;
  route: string[];
  newCells?: Cell[];
}

// 요새에서 무역상 생성
export function spawnMerchantFromFort(
  fort: Cell,
  owner: 0 | 1,
  gameState: GameState
): MerchantSpawnInfo | null {
  // 완성된 요새만 무역상 생성 가능
  if (fort.building !== 'fort' || 
      !fort.fortState || 
      typeof fort.fortState === 'string' ||
      fort.fortState.stage !== 'complete') {
    return null;
  }

  console.log(`\n🏰 ${owner === 0 ? 'You' : 'AI'} 요새에서 무역상 생성`);

  // 무역상이 운반할 골드 (요새당 50~100 골드)
  const gold = Math.floor(50 + Math.random() * 51);

  // 무역 경로: 요새 → 성까지 최단 경로 (간단 구현)
  const castles = gameState.cells.filter(c => c.building === 'castle' && c.owner === owner);
  if (castles.length === 0) return null;

  const targetCastle = castles[0];
  const route = calculateTradeRoute(fort, targetCastle, gameState);

  console.log(`💰 골드: ${gold}, 경로 거리: ${route.length} 칸`);

  // 무역상은 항상 본진에 위치해야 함
  const castlesForOwner = gameState.cells.filter(c => c.building === 'castle' && c.owner === owner);
  if (castlesForOwner.length === 0) {
    console.log('❌ 본진을 찾을 수 없습니다.');
    return null;
  }

  const mainCastle = castlesForOwner[0];
  // 본진 자체에 무역상 배치 (본진 옆이 아니라 본진에)
  const adjacentCell = mainCastle;
  
  console.log(`🏰 무역상은 본진(${mainCastle.id})에 스폰됩니다.`);

  // 새로운 셀 배열 생성
  // 무역상은 본진에 위치하므로 본진 셀에 무역상 정보 추가
  const newCells = gameState.cells.map(cell => {
    if (cell.id === adjacentCell.id) {
      return {
        ...cell,
        owner: 'merchant' as Cell['owner'],
        merchantOwner: owner,
        merchantGold: gold,
        merchantRoute: undefined, // 목적지 선택 전까지는 경로 없음
        merchantState: 'idle' as Cell['merchantState'],
        merchantRoundTripCount: 0,
        unitCount: 2,
        unitType: 'INF' as Cell['unitType'],
      };
    }
    return cell;
  });

  console.log(`✅ 무역상이 본진(${adjacentCell.id})에 생성되었습니다.`);

  const merchantCell = { 
    ...adjacentCell, 
    owner: 'merchant' as Cell['owner'], 
    merchantOwner: owner, 
    merchantGold: gold, 
    merchantRoute: undefined,
    merchantState: 'idle' as Cell['merchantState'],
    merchantRoundTripCount: 0,
    unitCount: 2, 
    unitType: 'INF' as Cell['unitType'] 
  };
  
  return { cell: merchantCell, owner, gold, route: [], newCells };
}

// 무역 경로 계산 (헥사곤 그리드 최단 경로)
function calculateTradeRoute(
  from: Cell,
  to: Cell,
  gameState: GameState
): string[] {
  // calculateRoute 함수를 재사용 (헥사곤 거리 기반)
  return calculateRoute(from, to, gameState);
}

// 빈 인접 셀 찾기
function findAdjacentEmptyCell(cell: Cell, gameState: GameState): Cell | null {
  const directions = getHexCardinalOffsets(cell.row);

  for (const dir of directions) {
    const newRow = cell.row + dir.dr;
    const newCol = cell.col + dir.dc;
    const adjacent = gameState.cells.find(c => c.row === newRow && c.col === newCol);
    
    if (adjacent && adjacent.owner === null && adjacent.unitCount === 0) {
      return adjacent;
    }
  }

  return null;
}

// 무역상이 포위되었는지 체크 (모든 인접 셀이 적군으로 막혀있는지)
function isMerchantSurrounded(merchant: Cell, gameState: GameState): boolean {
  const directions = getHexNeighborOffsets(merchant.row);
  let blockedCount = 0;
  let totalAdjacent = 0;

  for (const dir of directions) {
    const newRow = merchant.row + dir.dr;
    const newCol = merchant.col + dir.dc;
    
    if (newRow < 0 || newRow >= gameState.rows || newCol < 0 || newCol >= gameState.cols) {
      blockedCount++;
      totalAdjacent++;
      continue;
    }
    
    const adjacent = gameState.cells.find(c => c.row === newRow && c.col === newCol);
    if (!adjacent) {
      blockedCount++;
      totalAdjacent++;
      continue;
    }
    
    totalAdjacent++;
    
    // 적군이 있으면 막힘
    const isEnemy = (adjacent.owner === 0 || adjacent.owner === 1) && 
                    adjacent.unitCount > 0 && 
                    adjacent.owner !== merchant.merchantOwner;
    
    // 빈 칸이거나 같은 편 칸이면 통과 가능
    const canPass = (adjacent.owner === null && adjacent.unitCount === 0) ||
                    (adjacent.owner === merchant.merchantOwner);
    
    if (isEnemy || !canPass) {
      blockedCount++;
    }
  }

  // 모든 인접 셀이 막혀있으면 포위됨
  return blockedCount === totalAdjacent && totalAdjacent > 0;
}

// 무역상 이동 (매 턴마다 경로를 따라 이동)
export function moveMerchant(merchant: Cell, gameState: GameState): { newCells: Cell[]; arrived: boolean; merchantId: string } {
  const baseCells = gameState.cells.map(c => ({ ...c }));
  const merchantIdx = baseCells.findIndex(c => c.id === merchant.id);
  if (merchantIdx === -1) return { newCells: baseCells, arrived: false, merchantId: merchant.id };

  let currentMerchant = { ...baseCells[merchantIdx] };
  
  // 디버깅: 무역상 상태 확인
  const ownerName = currentMerchant.merchantOwner === 0 ? '당신' : 'AI';
  if (currentMerchant.merchantState && currentMerchant.merchantState !== 'idle') {
    console.log(`🔍 무역상 상태 확인: ${ownerName}의 무역상 상태=${currentMerchant.merchantState}, 목적지=${currentMerchant.merchantDestinationId}, 출발지=${currentMerchant.merchantOriginId}, 경로길이=${currentMerchant.merchantRoute?.length || 0}`);
  } else if (currentMerchant.merchantState === 'idle' && currentMerchant.merchantRoute && currentMerchant.merchantRoute.length > 0) {
    // idle 상태인데 경로가 있으면 outbound로 변경
    console.log(`🔄 무역상이 idle 상태에서 outbound로 전환됩니다. 경로 길이: ${currentMerchant.merchantRoute.length}`);
    currentMerchant.merchantState = 'outbound';
  }

  // idle 상태이고 경로가 없으면 이동하지 않음
  if (currentMerchant.merchantState === 'idle' && (!currentMerchant.merchantRoute || currentMerchant.merchantRoute.length === 0)) {
    return { newCells: baseCells, arrived: false, merchantId: merchant.id };
  }

  // 목적지에서 머무는 중인 경우
  if (currentMerchant.merchantState === 'atTarget') {
    const stayTurnsLeft = (currentMerchant.merchantStayTurnsLeft || 0) - 1;
    
    if (stayTurnsLeft <= 0) {
      // 머무는 시간이 끝났으므로 돌아가기 시작
      const originId = currentMerchant.merchantOriginId;
      if (originId) {
        const originCell = baseCells.find(c => c.id === originId);
        if (originCell) {
          const returnRoute = calculateRoute(currentMerchant, originCell, gameState);
          const ownerName = currentMerchant.merchantOwner === 0 ? '당신' : 'AI';
          currentMerchant.merchantState = 'returning';
          currentMerchant.merchantRoute = returnRoute;
          currentMerchant.merchantStayTurnsLeft = undefined;
          console.log(`🚚 ${ownerName}의 무역상이 ${ownerName}의 본진으로 돌아가기 시작 (${returnRoute.length}칸)`);
        }
      }
    } else {
      currentMerchant.merchantStayTurnsLeft = stayTurnsLeft;
      baseCells[merchantIdx] = currentMerchant;
      return { newCells: baseCells, arrived: false, merchantId: merchant.id };
    }
  }

  // 경로가 없으면 현재 위치와 목적지를 비교해서 실제로 도착했는지 확인
  if (!currentMerchant.merchantRoute || currentMerchant.merchantRoute.length === 0) {
    const destinationId = currentMerchant.merchantDestinationId;
    const destination = destinationId ? baseCells.find(c => c.id === destinationId) : null;
    
    // 현재 위치와 목적지 비교
    const isAtDestination = destination && 
      currentMerchant.row === destination.row && 
      currentMerchant.col === destination.col;
    
    // 실제로 목적지에 도착했을 때만 도착 처리
    if (isAtDestination) {
      // 돌아오는 중이었다면 본진 도착
      if (currentMerchant.merchantState === 'returning') {
        const roundTripCount = (currentMerchant.merchantRoundTripCount || 0) + 1;
        const ownerName = currentMerchant.merchantOwner === 0 ? '당신' : 'AI';
        currentMerchant.merchantState = 'idle';
        currentMerchant.merchantRoundTripCount = roundTripCount;
        currentMerchant.merchantRoute = undefined;
        currentMerchant.merchantDestinationId = undefined;
        console.log(`✅ ${ownerName}의 무역상이 ${ownerName}의 본진에 도착했습니다. (왕복 ${roundTripCount}회)`);
        baseCells[merchantIdx] = currentMerchant;
        return { newCells: baseCells, arrived: true, merchantId: merchant.id };
      }
      
      // 목적지 도착
      if (currentMerchant.merchantState === 'outbound') {
        const ownerName = currentMerchant.merchantOwner === 0 ? '당신' : 'AI';
        const destName = destination 
          ? (destination.building === 'castle' 
            ? `${destination.owner === 0 ? '당신' : 'AI'}의 본진`
            : `${destination.owner === 0 ? '당신' : 'AI'}의 요새`)
          : '목적지';
        
        currentMerchant.merchantState = 'atTarget';
        currentMerchant.merchantStayTurnsLeft = 2; // 2턴 머무름
        currentMerchant.merchantRoute = undefined;
        console.log(`✅ ${ownerName}의 무역상이 ${destName}에 도착했습니다. (2턴 머무름)`);
        baseCells[merchantIdx] = currentMerchant;
        return { newCells: baseCells, arrived: true, merchantId: merchant.id };
      }
    } else {
      // 경로가 없지만 아직 목적지에 도착하지 않았으면 경로를 다시 계산
      if (destination && currentMerchant.merchantState === 'outbound') {
        const newRoute = calculateRoute(currentMerchant, destination, gameState);
        if (newRoute && newRoute.length > 0) {
          currentMerchant.merchantRoute = newRoute;
          const ownerName = currentMerchant.merchantOwner === 0 ? '당신' : 'AI';
          console.log(`🔄 무역상 경로 재계산: ${ownerName}의 무역상이 목적지(${destination.row},${destination.col})로 가는 경로를 다시 계산했습니다. (${newRoute.length}칸)`);
          baseCells[merchantIdx] = currentMerchant;
          // 경로를 재계산했으므로 이번 턴에는 이동하지 않고 다음 턴에 이동
          return { newCells: baseCells, arrived: false, merchantId: merchant.id };
        } else {
          // 경로를 계산할 수 없으면 에러
          const ownerName = currentMerchant.merchantOwner === 0 ? '당신' : 'AI';
          console.log(`❌ ${ownerName}의 무역상이 목적지(${destination.row},${destination.col})로 가는 경로를 찾을 수 없습니다. 현재 위치: (${currentMerchant.row},${currentMerchant.col})`);
          baseCells[merchantIdx] = currentMerchant;
          return { newCells: baseCells, arrived: false, merchantId: merchant.id };
        }
      }
    }
    
    return { newCells: baseCells, arrived: false, merchantId: merchant.id };
  }

  // 이동 속도 결정:
  // - 가는 길(outbound): 항상 1칸씩 이동
  // - 돌아오는 길(returning): 도로가 있으면 3칸씩, 없으면 1칸씩
  let moveDistance = 1;
  if (currentMerchant.merchantState === 'returning' && 
      currentMerchant.merchantRoute && 
      currentMerchant.merchantRoute.length > 0) {
    // 돌아오는 길: 경로의 첫 번째 셀에 도로가 있으면 3칸
    const firstNextCellId = currentMerchant.merchantRoute[0];
    const firstNextCell = baseCells.find(c => c.id === firstNextCellId);
    if (firstNextCell && firstNextCell.hasRoad) {
      moveDistance = 3;
    }
  }
  // 가는 길(outbound)은 항상 1칸씩 이동
  
  // 경로 길이 확인
  const routeLength = currentMerchant.merchantRoute?.length || 0;
  // 경로가 1칸이면 1칸만, 2칸이면 최대 1칸만 이동 (2칸 이동 방지)
  const maxMove = routeLength <= 2 ? 1 : moveDistance;
  const cellsToMove = Math.min(maxMove, routeLength);

  // 포위 상황 체크
  if (isMerchantSurrounded(currentMerchant, { ...gameState, cells: baseCells })) {
    const ownerName = currentMerchant.merchantOwner === 0 ? '당신' : 'AI';
    console.log(`🚨 ${ownerName}의 무역상이 적군에 포위되어 이동할 수 없습니다!`);
    baseCells[merchantIdx] = currentMerchant;
    return { newCells: baseCells, arrived: false, merchantId: merchant.id };
  }

  // 이동할 다음 셀 찾기
  let moved = false;
  let newMerchantId = merchant.id;
  let actualMovedCells = 0; // 실제로 이동한 칸 수 추적

  for (let i = 0; i < cellsToMove; i++) {
    if (!currentMerchant.merchantRoute || currentMerchant.merchantRoute.length === 0) break;

    const nextCellId = currentMerchant.merchantRoute[0];
    const nextIdx = baseCells.findIndex(c => c.id === nextCellId);

    if (nextIdx === -1) break;

    const next = { ...baseCells[nextIdx] };

    // 경로에 적군이 있는지 체크 (전쟁 중 무역상은 적군이 있는 칸을 지나갈 수 없음)
    const isEnemyOccupied = (next.owner === 0 || next.owner === 1) && 
                             next.unitCount > 0 && 
                             next.owner !== currentMerchant.merchantOwner;
    
    // 적군이 있으면 막힘 - 우회 경로 찾기 시도 (한 번만 시도)
    if (isEnemyOccupied) {
      const ownerName = currentMerchant.merchantOwner === 0 ? '당신' : 'AI';
      console.log(`🚫 ${ownerName}의 무역상이 적군(${next.owner === 0 ? '당신' : 'AI'})이 있는 칸(${next.id})에서 막혔습니다.`);
      
      // 우회 경로 찾기 시도 (이미 시도했는지 확인)
      const destinationId = currentMerchant.merchantDestinationId;
      if (destinationId && !currentMerchant.merchantRoute?.includes('DETOUR_ATTEMPTED')) {
        const destination = baseCells.find(c => c.id === destinationId);
        if (destination) {
          // 현재 위치에서 목적지까지 우회 경로 찾기
          const detourRoute = calculateDetourRoute(
            currentMerchant,
            destination,
            { ...gameState, cells: baseCells },
            currentMerchant.merchantOwner!
          );
          
          if (detourRoute && detourRoute.length > 0) {
            // 우회 경로를 찾았으면 경로 업데이트
            currentMerchant.merchantRoute = detourRoute;
            baseCells[merchantIdx] = currentMerchant;
            console.log(`🔄 우회 경로를 찾았습니다. (${detourRoute.length}칸)`);
            // 우회 경로로 다시 이동 시도 (이번 턴에는 이동하지 않고 다음 턴에 시도)
            return { newCells: baseCells, arrived: false, merchantId: merchant.id };
          } else {
            // 우회 경로를 찾을 수 없으면 대기
            console.log(`⏸️ 우회 경로를 찾을 수 없어 대기합니다.`);
            break;
          }
        }
      }
      
      // 우회 경로를 찾을 수 없으면 대기
      break;
    }
    
    // 다음 칸이 비어있거나 같은 편 칸이면 이동 가능
    if (next.owner === null && next.unitCount === 0) {
      // 빈 칸으로 이동
      next.owner = 'merchant' as Cell['owner'];
      next.merchantOwner = currentMerchant.merchantOwner;
      next.merchantGold = currentMerchant.merchantGold;
      next.merchantRoute = currentMerchant.merchantRoute.slice(1);
      next.merchantState = currentMerchant.merchantState;
      next.merchantDestinationId = currentMerchant.merchantDestinationId;
      next.merchantOriginId = currentMerchant.merchantOriginId;
      next.merchantRoundTripCount = currentMerchant.merchantRoundTripCount;
      next.merchantStayTurnsLeft = currentMerchant.merchantStayTurnsLeft;
      next.unitCount = currentMerchant.unitCount;
      next.unitType = currentMerchant.unitType;
      // 길 속성은 셀에 있으므로 유지 (hasRoad는 셀 속성)

      // 이전 셀 정리
      if (moved) {
        const prevMerchant = baseCells.find(c => c.id === newMerchantId);
        if (prevMerchant) {
          prevMerchant.owner = null;
          prevMerchant.merchantOwner = undefined;
          prevMerchant.merchantGold = undefined;
          prevMerchant.merchantRoute = undefined;
          prevMerchant.merchantState = undefined;
          prevMerchant.merchantDestinationId = undefined;
          prevMerchant.merchantOriginId = undefined;
          prevMerchant.merchantRoundTripCount = undefined;
          prevMerchant.merchantStayTurnsLeft = undefined;
          prevMerchant.unitCount = 0;
          prevMerchant.unitType = undefined;
        }
      } else {
        currentMerchant.owner = null;
        currentMerchant.merchantOwner = undefined;
        currentMerchant.merchantGold = undefined;
        currentMerchant.merchantRoute = undefined;
        currentMerchant.merchantState = undefined;
        currentMerchant.merchantDestinationId = undefined;
        currentMerchant.merchantOriginId = undefined;
        currentMerchant.merchantRoundTripCount = undefined;
        currentMerchant.merchantStayTurnsLeft = undefined;
        currentMerchant.unitCount = 0;
        currentMerchant.unitType = undefined;
      }

      baseCells[nextIdx] = next;
      if (!moved) {
        baseCells[merchantIdx] = currentMerchant;
      }

      moved = true;
      newMerchantId = next.id;
      actualMovedCells++; // 실제 이동한 칸 수 증가

      // 왕복 2번 후 3번째부터 다리 개척 (목적지로 가는 중일 때만)
      const roundTripCount = next.merchantRoundTripCount || 0;
      if (roundTripCount >= 2 && next.merchantState === 'outbound' && !next.hasRoad) {
        next.hasRoad = true;
        console.log(`🛤️ 무역상이 다리를 개척했습니다! (${next.id})`);
        baseCells[nextIdx] = next;
      }
      
      // 다음 이동을 위해 현재 위치 업데이트
      currentMerchant = next;
    } else if (next.owner === currentMerchant.merchantOwner && next.unitCount > 0) {
      // 같은 편 칸이면 통과 가능 (경로만 업데이트하고 실제 이동은 안 함)
      currentMerchant.merchantRoute = currentMerchant.merchantRoute.slice(1);
      // 다음 칸으로 계속 진행
      continue;
    } else {
      // 다른 이유로 막힘 (용병, 강도 등)
      console.log(`⏸️ 무역상이 ${nextCellId} 칸이 막혀 대기 중 (소유자: ${next.owner})`);
      break;
    }
  }

  if (moved) {
    const ownerName = currentMerchant.merchantOwner === 0 ? '당신' : 'AI';
    const destinationId = currentMerchant.merchantDestinationId;
    const destination = destinationId ? baseCells.find(c => c.id === destinationId) : null;
    const destName = destination 
      ? (destination.building === 'castle' 
        ? `${destination.owner === 0 ? '당신' : 'AI'}의 본진`
        : `${destination.owner === 0 ? '당신' : 'AI'}의 요새`)
      : '목적지';
    const originId = currentMerchant.merchantOriginId;
    const origin = originId ? baseCells.find(c => c.id === originId) : null;
    const originName = origin 
      ? `${currentMerchant.merchantOwner === 0 ? '당신' : 'AI'}의 본진`
      : '출발지';
    
    // 현재 위치 확인
    const currentCell = baseCells.find(c => c.id === newMerchantId);
    const currentLocation = currentCell 
      ? (currentCell.building === 'castle' 
        ? `${currentCell.owner === 0 ? '당신' : 'AI'}의 본진`
        : currentCell.building === 'fort'
        ? `${currentCell.owner === 0 ? '당신' : 'AI'}의 요새`
        : `(${currentCell.row}, ${currentCell.col})`)
      : '알 수 없음';
    
    // 상태에 따른 이동 방향 표시 (디버깅을 위해 상태도 표시)
    let stateText = '';
    if (currentMerchant.merchantState === 'outbound') {
      stateText = `${originName} → ${destName}`;
    } else if (currentMerchant.merchantState === 'returning') {
      stateText = `${destName} → ${originName}`;
    }
    
    // 디버깅: 상태와 실제 목적지 확인
    const debugInfo = `[상태: ${currentMerchant.merchantState}, 목적지ID: ${currentMerchant.merchantDestinationId}, 출발지ID: ${currentMerchant.merchantOriginId}]`;
    console.log(`🚚 ${ownerName}의 무역상이 ${stateText}로 ${actualMovedCells}칸 이동했습니다. (현재 위치: ${currentLocation}) ${debugInfo}`);
    return { newCells: baseCells, arrived: false, merchantId: newMerchantId };
  }

  console.log(`⏸️ 무역상이 막혀 대기 중`);
  return { newCells: baseCells, arrived: false, merchantId: merchant.id };
}

// 무역상이 성에 도착했을 때 골드 전달 (세율 적용)
export function deliverMerchantGold(
  merchantId: string,
  gameState: GameState
): { success: boolean; gold: number; taxAmount: number; netGold: number; newCells: Cell[]; newPlayers: typeof gameState.players } {
  const baseCells = gameState.cells.map(c => ({ ...c }));
  const idx = baseCells.findIndex(c => c.id === merchantId);

  if (idx === -1) return { success: false, gold: 0, taxAmount: 0, netGold: 0, newCells: baseCells, newPlayers: gameState.players };

  const merchant = baseCells[idx];
  if (!merchant.merchantGold || merchant.merchantOwner === undefined) {
    return { success: false, gold: 0, taxAmount: 0, netGold: 0, newCells: baseCells, newPlayers: gameState.players };
  }

  const owner = merchant.merchantOwner;
  const baseGold = merchant.merchantGold;
  
  // 목적지 정보 확인 (무역상이 도착한 셀 = 목적지)
  const destination = baseCells[idx]; // 현재 무역상이 있는 셀이 목적지
  
  // 출발지에서 목적지까지의 거리 계산
  const originId = merchant.merchantOriginId;
  const origin = originId ? baseCells.find(c => c.id === originId) : null;
  const distance = origin 
    ? Math.abs(origin.row - destination.row) + Math.abs(origin.col - destination.col)
    : 0;
  
  // 수익 계산 (거리, 목적지 배수 적용)
  const destinationMultiplier = destination?.building === 'castle' ? 2.0 : 1.5;
  const grossProfit = Math.floor(baseGold * destinationMultiplier * (1 + distance * 0.05));
  
  // 세율 적용 (목적지 소유자의 세율)
  const destinationOwner = destination?.owner;
  let taxRate = 0;
  if (destinationOwner === 0 || destinationOwner === 1) {
    const destPlayer = gameState.players.find(p => p.id === destinationOwner);
    if (destPlayer) {
      taxRate = destPlayer.taxRate;
    }
  }
  
  const taxAmount = Math.floor(grossProfit * taxRate);
  const netGold = grossProfit - taxAmount;

  // 플레이어 골드 증가 (immutable) - 순 수익만 추가
  const newPlayers = gameState.players.map((p, i) => 
    i === owner ? { ...p, gold: p.gold + netGold } : p
  );

  const ownerName = owner === 0 ? '당신' : 'AI';
  const destName = destination 
    ? (destination.building === 'castle' 
      ? `${destination.owner === 0 ? '당신' : 'AI'}의 본진`
      : `${destination.owner === 0 ? '당신' : 'AI'}의 요새`)
    : '목적지';
  
  console.log(`\n💰 무역 완료! ${ownerName}의 무역상이 ${destName}에서 무역했습니다.`);
  console.log(`   총 수익: ${grossProfit}💰`);
  if (taxAmount > 0) {
    console.log(`   세금 (${Math.floor(taxRate * 100)}%): -${taxAmount}💰`);
  }
  console.log(`   순 수익: +${netGold}💰`);

  // 무역상 제거
  baseCells[idx] = {
    ...baseCells[idx],
    owner: null,
    merchantOwner: undefined,
    merchantGold: undefined,
    merchantRoute: undefined,
    merchantDestinationId: undefined,
    merchantOriginId: undefined,
    merchantRoundTripCount: undefined,
    merchantStayTurnsLeft: undefined,
    merchantState: undefined,
    unitCount: 0,
    unitType: undefined,
  };

  return { success: true, gold: grossProfit, taxAmount, netGold, newCells: baseCells, newPlayers };
}

// 무역상 약탈 (강도가 무역상 공격)
export function plunderMerchant(
  merchant: Cell
): { gold: number } {
  const gold = merchant.merchantGold || 0;

  console.log(`\n💀 무역상이 약탈당했습니다! ${gold} 골드 손실`);

  // 무역상 제거
  merchant.owner = null;
  merchant.merchantOwner = undefined;
  merchant.merchantGold = undefined;
  merchant.merchantRoute = undefined;
  merchant.unitCount = 0;
  merchant.unitType = undefined;

  return { gold };
}

