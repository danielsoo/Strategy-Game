import { GameState, Cell } from '../models/GameState';
import { getHexNeighborOffsets, hexDistance } from '../utils/hexGrid';

export interface TradeRequest {
  id: string;
  fromPlayer: 0 | 1;
  toPlayer: 0 | 1;
  merchantId: string;
  targetCellId: string;
  proposedTariff: number; // fraction 0..0.25
  proposedBribe: number; // gold amount
  expiresTurn: number;
  status: 'pending' | 'accepted' | 'declined';
}

// 헥사곤 그리드에서 최단 경로 계산 (각 단계에서 목적지에 가장 가까운 인접 셀 선택)
export function calculateRoute(from: Cell, to: Cell, gameState?: GameState): string[] {
  const route: string[] = [];
  
  // 게임 상태가 없으면 빈 경로 반환
  if (!gameState) {
    console.log(`⚠️ 경로 계산 실패: 게임 상태가 없음`);
    return route;
  }
  
  // 그리드 범위 확인
  if (to.row < 0 || to.row >= gameState.rows || to.col < 0 || to.col >= gameState.cols) {
    console.log(`⚠️ 경로 계산 실패: 목적지가 그리드 범위를 벗어남 (${to.row},${to.col})`);
    return route;
  }
  
  // 출발지와 목적지가 같으면 빈 경로 반환
  if (from.row === to.row && from.col === to.col) {
    return route;
  }
  
  let currentRow = from.row;
  let currentCol = from.col;
  const visited = new Set<string>();
  const maxIterations = 1000;
  let iterations = 0;
  
  // 목적지에 도달할 때까지 반복
  while ((currentRow !== to.row || currentCol !== to.col) && iterations < maxIterations) {
    iterations++;
    
    // 현재 위치에서 목적지까지의 거리
    const currentDistance = hexDistance(currentRow, currentCol, to.row, to.col);
    
    // 인접한 6개 셀 중 목적지에 가장 가까운 셀 찾기
    const offsets = getHexNeighborOffsets(currentRow);
    const candidates: Array<{ row: number; col: number; dist: number; cellId: string }> = [];
    
    for (const offset of offsets) {
      const newRow = currentRow + offset.dr;
      const newCol = currentCol + offset.dc;
      const cellId = `${newRow},${newCol}`;
      
      // 이미 방문한 셀은 제외
      if (visited.has(cellId)) continue;
      
      // 그리드 범위 확인
      if (newRow < 0 || newRow >= gameState.rows || newCol < 0 || newCol >= gameState.cols) {
        continue;
      }
      
      // 게임 상태에서 셀이 존재하는지 확인
      const cell = gameState.cells.find(c => c.row === newRow && c.col === newCol);
      if (!cell) {
        continue;
      }
      
      // 목적지까지의 거리 계산
      const dist = hexDistance(newRow, newCol, to.row, to.col);
      candidates.push({ row: newRow, col: newCol, dist, cellId });
    }
    
    // 후보가 없으면 종료
    if (candidates.length === 0) {
      if (iterations === 1) {
        console.log(`⚠️ 첫 번째 단계에서 사용 가능한 인접 셀이 없음: 현재 위치 (${currentRow},${currentCol}), 목적지 (${to.row},${to.col})`);
        console.log(`   그리드 크기: ${gameState.rows}x${gameState.cols}`);
        const allNeighbors = offsets.map(o => ({ row: currentRow + o.dr, col: currentCol + o.dc }));
        const inBounds = allNeighbors.filter(p => p.row >= 0 && p.row < gameState.rows && p.col >= 0 && p.col < gameState.cols);
        console.log(`   그리드 범위 내 인접 셀:`, inBounds.map(p => `(${p.row},${p.col})`).join(', '));
        const existing = inBounds.map(p => gameState.cells.find(c => c.row === p.row && c.col === p.col)).filter(c => c !== undefined);
        console.log(`   존재하는 셀:`, existing.map(c => `(${c!.row},${c!.col})`).join(', '));
      }
      break;
    }
    
    // 후보 중 가장 가까운 셀 선택
    candidates.sort((a, b) => a.dist - b.dist);
    const best = candidates[0];
    
    // 경로에 추가
    route.push(best.cellId);
    visited.add(best.cellId);
    
    currentRow = best.row;
    currentCol = best.col;
  }
  
  if (iterations >= maxIterations) {
    console.log(`⚠️ 경로 계산 최대 반복 횟수 초과: 출발지 (${from.row},${from.col}), 목적지 (${to.row},${to.col})`);
  }
  
  // 목적지에 도달했는지 확인
  if (currentRow === to.row && currentCol === to.col) {
    console.log(`✅ 경로 계산 성공: ${route.length}칸, 출발지 (${from.row},${from.col}) → 목적지 (${to.row},${to.col})`);
  } else {
    console.log(`❌ 경로 계산 실패: 출발지 (${from.row},${from.col}), 목적지 (${to.row},${to.col}), 현재 위치 (${currentRow},${currentCol}), 경로 길이: ${route.length}`);
  }
  
  return route;
}

// 우회 경로 계산 (적군이 막혀있을 때)
export function calculateDetourRoute(
  from: Cell,
  to: Cell,
  gameState: GameState,
  merchantOwner: 0 | 1
): string[] | null {
  // A* 스타일의 간단한 경로 찾기
  const visited = new Set<string>();
  const queue: Array<{ cell: Cell; path: string[]; cost: number }> = [
    { cell: from, path: [], cost: 0 }
  ];
  
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost); // 최소 비용 우선
    const current = queue.shift()!;
    
    if (visited.has(current.cell.id)) continue;
    visited.add(current.cell.id);
    
    // 목적지 도착
    if (current.cell.id === to.id) {
      return current.path;
    }
    
    // 인접 셀 확인
    const offsets = getHexNeighborOffsets(current.cell.row);
    for (const offset of offsets) {
      const newRow = current.cell.row + offset.dr;
      const newCol = current.cell.col + offset.dc;
      
      if (newRow < 0 || newRow >= gameState.rows || newCol < 0 || newCol >= gameState.cols) continue;
      
      const nextCell = gameState.cells.find(c => c.row === newRow && c.col === newCol);
      if (!nextCell) continue;
      
      // 적군이 있으면 통과 불가
      const isEnemy = (nextCell.owner === 0 || nextCell.owner === 1) && 
                      nextCell.unitCount > 0 && 
                      nextCell.owner !== merchantOwner;
      
      // 빈 칸이거나 같은 편 칸, 또는 무역상 칸만 통과 가능
      const canPass = !isEnemy && (
        nextCell.owner === null || 
        nextCell.owner === merchantOwner ||
        (nextCell.owner === 'merchant' && nextCell.merchantOwner === merchantOwner)
      );
      
      if (canPass) {
        const newPath = [...current.path, nextCell.id];
        const distance = hexDistance(newRow, newCol, to.row, to.col);
        const cost = current.cost + 1 + distance; // 이동 비용 + 휴리스틱
        
        if (!visited.has(nextCell.id)) {
          queue.push({ cell: nextCell, path: newPath, cost });
        }
      }
    }
  }
  
  return null; // 경로를 찾을 수 없음
}

export function evaluateRequest(
  gameState: GameState,
  req: TradeRequest
): { decision: 'accept' | 'decline' | 'counter'; counter?: { tariff: number; bribe: number } } {
  const merchant = gameState.cells.find(c => c.id === req.merchantId);
  const target = gameState.cells.find(c => c.id === req.targetCellId);
  if (!merchant || !target) return { decision: 'decline' };
  const distance = Math.abs(merchant.row - target.row) + Math.abs(merchant.col - target.col);
  const baseReward = 75;
  const destMultiplier = target.building === 'castle' ? 2.0 : 1.5;
  const expectedReward = baseReward * destMultiplier * (1 + distance * 0.05);
  const proposedTariff = req.proposedTariff;
  const proposedBribe = req.proposedBribe;
  const tariffRevenue = expectedReward * proposedTariff;
  const expectedLoss = expectedReward * (0.05 + distance * 0.02);
  const relation = gameState.tradeRelations && gameState.tradeRelations[req.toPlayer]
    ? gameState.tradeRelations[req.toPlayer][req.fromPlayer] || 0
    : 0;
  const acceptanceScore = proposedBribe / 25 + tariffRevenue - expectedLoss + relation / 20;
  const threshold = 5;
  if (acceptanceScore >= threshold) return { decision: 'accept' };
  if (acceptanceScore >= threshold - 4) {
    const counterTariff = Math.min(0.25, proposedTariff + 0.08);
    const counterBribe = Math.max(0, Math.floor((expectedLoss - tariffRevenue) * 0.5));
    return { decision: 'counter', counter: { tariff: counterTariff, bribe: counterBribe } };
  }
  return { decision: 'decline' };
}

export function applyAcceptance(
  gameState: GameState,
  req: TradeRequest
): { updatedCells: GameState['cells']; updatedPlayers: GameState['players'] } {
  const cells = gameState.cells.map(c => ({ ...c }));
  const players = gameState.players.map(p => ({ ...p }));
  const merchantIdx = cells.findIndex(c => c.id === req.merchantId);
  const targetIdx = cells.findIndex(c => c.id === req.targetCellId);
  if (merchantIdx === -1 || targetIdx === -1) return { updatedCells: cells, updatedPlayers: players };
  const merchant = { ...cells[merchantIdx] } as any;
  const target = cells[targetIdx];
  const route = calculateRoute(merchant, target, gameState);
  merchant.merchantRoute = route;
  merchant.merchantDestinationId = target.id;
  merchant.merchantState = 'outbound';
  if (req.proposedBribe && req.proposedBribe > 0) {
    const fromPlayer = players.find(p => p.id === req.fromPlayer)!;
    const toPlayer = players.find(p => p.id === req.toPlayer)!;
    if (fromPlayer.gold >= req.proposedBribe) {
      fromPlayer.gold -= req.proposedBribe;
      toPlayer.gold += req.proposedBribe;
    }
  }
  cells[merchantIdx] = merchant;
  return { updatedCells: cells, updatedPlayers: players };
}

