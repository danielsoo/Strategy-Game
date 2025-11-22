import { GameState, Cell } from '../models/GameState';

export interface AIMove {
  type: 'move' | 'attack' | 'hire-mercenary' | 'intimidate-mercenary';
  from: Cell;
  to: Cell;
}

export function getAIAction(gameState: GameState): AIMove | null {
  // 간단한 AI 로직
  const aiCells = gameState.cells.filter(c => c.owner === 1 && c.unitCount > 0);
  if (aiCells.length === 0) return null;

  const from = aiCells[0];
  const emptyCells = gameState.cells.filter(c => c.owner === null && c.unitCount === 0);
  if (emptyCells.length === 0) return null;

  return {
    type: 'move',
    from,
    to: emptyCells[0],
  };
}

export function getMercenaryAction(gameState: GameState): AIMove | null {
  return null;
}

export function executeAIMove(gameState: GameState, action: AIMove): GameState {
  const newCells = gameState.cells.map(c => ({ ...c }));
  const fromIdx = newCells.findIndex(c => c.id === action.from.id);
  const toIdx = newCells.findIndex(c => c.id === action.to.id);

  if (fromIdx === -1 || toIdx === -1) return gameState;

  const from = { ...newCells[fromIdx] };
  const to = { ...newCells[toIdx] };

  to.owner = from.owner;
  to.unitCount = from.unitCount;
  to.unitType = from.unitType;
  from.owner = null;
  from.unitCount = 0;
  from.unitType = undefined;

  newCells[fromIdx] = from;
  newCells[toIdx] = to;

  return { ...gameState, cells: newCells };
}

