import { Cell, FortBuilding } from '../models/GameState';

export const FORT_BUILD_COST = 500;

export interface FortBuildCheck {
  canBuild: boolean;
  reason?: string;
}

export function canStartFortConstruction(
  cell: Cell,
  playerGold: number
): FortBuildCheck {
  if (cell.building === 'fort') {
    return { canBuild: false, reason: '이미 요새가 있습니다' };
  }

  if (cell.building === 'castle') {
    return { canBuild: false, reason: '본진에는 요새를 지을 수 없습니다' };
  }

  if (cell.owner === null || cell.owner === undefined) {
    return { canBuild: false, reason: '소유한 땅에만 요새를 지을 수 있습니다' };
  }

  if (cell.unitCount < 3) {
    return { canBuild: false, reason: '최소 3명의 유닛이 필요합니다' };
  }

  if (playerGold < FORT_BUILD_COST) {
    return { canBuild: false, reason: `골드가 부족합니다 (필요: ${FORT_BUILD_COST}G)` };
  }

  return { canBuild: true };
}

export function startFortConstruction(cell: Cell): { updatedCell: Cell } {
  const fortState: FortBuilding = {
    stage: 1,
    turnsInStage: 0,
    garrisonUnits: cell.unitCount,
  };

  return {
    updatedCell: {
      ...cell,
      building: 'fort',
      fortState,
    },
  };
}

export function progressFortConstruction(fortState: FortBuilding): FortBuilding {
  const newTurnsInStage = fortState.turnsInStage + 1;

  if (fortState.stage === 1 && newTurnsInStage >= 2) {
    return {
      stage: 2,
      turnsInStage: 0,
      garrisonUnits: fortState.garrisonUnits,
    };
  }

  if (fortState.stage === 2 && newTurnsInStage >= 2) {
    return {
      stage: 3,
      turnsInStage: 0,
      garrisonUnits: fortState.garrisonUnits,
    };
  }

  if (fortState.stage === 3 && newTurnsInStage >= 2) {
    return {
      stage: 'complete',
      turnsInStage: 0,
      garrisonUnits: fortState.garrisonUnits,
    };
  }

  return {
    ...fortState,
    turnsInStage: newTurnsInStage,
  };
}

export function cancelFortConstruction(
  cell: Cell,
  fortState: FortBuilding
): { updatedCell: Cell; releasedUnits: number } {
  const releasedUnits = fortState.garrisonUnits;

  return {
    updatedCell: {
      ...cell,
      building: undefined,
      fortState: 'none',
      unitCount: cell.unitCount + releasedUnits,
    },
    releasedUnits,
  };
}

