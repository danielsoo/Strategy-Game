// models/GameState.ts

export type DriftOutcome = 'dead' | 'alive';
export interface DriftState {
  deltaPP: number;     // 누적 조정치(%p). 예: +3 => +3%p
  last?: DriftOutcome; // 직전 판정 결과
}

export interface Reputation {
  fear: number;      // 0~100 (공포: 공격적이고 무서운 군대)
  justice: number;   // 0~100 (정의: 명예롭고 공정한 군대)
}

export interface Player {
  id: 0 | 1;
  name: string;
  reputation: Reputation;
  gold: number;  // 자원(골드)
  taxRate: number;  // 세율 (0~1, 예: 0.1 = 10%)
}

export type BuildingType = 'castle' | 'fort';

export interface FortBuilding {
  stage: 1 | 2 | 3 | 'complete';  // 건설 단계
  turnsInStage: number;           // 현재 단계에서 경과한 턴
  garrisonUnits: number;          // 수비대 유닛 수
  damaged?: boolean;              // 점령 후 손상 상태
  repairTurns?: number;           // 수리 남은 턴
}

export type FortState = 
  | 'none'
  | FortBuilding;

export interface Cell {
  id: string;               // `${row},${col}`
  row: number;
  col: number;
  owner: 0 | 1 | null | 'mercenary' | 'merchant' | 'bandit';  // 0=You, 1=AI, null=empty, 'mercenary'=중립 용병, 'merchant'=무역상, 'bandit'=강도
  unitCount: number;
  moveRange?: number;        // 유닛별 이동력 (없으면 타입으로 계산)
  unitType?: 'INF' | 'CAV' | 'SCOUT';
  terrain?: 'plain' | 'forest' | 'mountain' | 'water' | 'desert';
  mercenaryTurnsLeft?: number;  // 임시 고용된 용병의 남은 턴 (0이면 영구)
  building?: BuildingType;      // 건물 타입
  fortState?: FortState;        // 요새 상태
  
  // 무역상 관련
  merchantOwner?: 0 | 1;        // 무역상이 소속된 나라 (merchant owner일 때만)
  merchantGold?: number;        // 무역상이 운반 중인 골드
  merchantRoute?: string[];     // 무역 경로 (cell id 배열)
  merchantDestinationId?: string; // 목적지 셀 id (왕복 목적)
  merchantState?: 'idle' | 'requested' | 'outbound' | 'atTarget' | 'returning';
  merchantRoundTripCount?: number; // 왕복 횟수 (다리 개척 판단용)
  merchantStayTurnsLeft?: number;  // 목적지에서 머무는 남은 턴 수
  merchantOriginId?: string;       // 출발지(본진) 셀 id
  
  // 길/다리 관련
  hasRoad?: boolean;            // 이 셀에 길이 있는지

  drift?: { deltaPP: number; last?: 'dead'|'alive'};
  retreatStreak?: number;
  encircled?: boolean;
  exhausted?: boolean;
}

export interface GameState {
  rows: number;
  cols: number;
  cells: Cell[];
  turn: number;
  currentPlayer: 0 | 1;
  players: Player[];
  pendingTradeRequests?: any[];
  tradeRelations?: number[][]; // tradeRelations[from][to] in range -100..100
}

export function computeMoveRange(cell: Cell): number {
  if (cell.moveRange != null) return cell.moveRange;
  switch (cell.unitType) {
    case 'CAV':   return 3;
    case 'SCOUT': return 2;
    case 'INF':
    default:      return 1;
  }
}

export function createInitialGameState(
  rows: number,
  cols: number,
  seedUnits = 5
): GameState {
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `${r},${c}`;
      cells.push({
        id, row: r, col: c,
        owner: null,
        unitCount: 0,
        terrain: 'plain',
        exhausted: false,
        drift: { deltaPP: 0 },
        retreatStreak: 0,
        fortState: 'none',
        encircled: false,
      });
    }
  }

  // 플레이어 성 (좌하단)
  const playerCastle = cells.find(c => c.row === rows - 2 && c.col === 1)!;
  playerCastle.owner = 0;
  playerCastle.unitCount = 5;
  playerCastle.unitType = 'INF';
  playerCastle.building = 'castle';

  // 플레이어 추가 군대 (성 옆)
  const playerArmy2 = cells.find(c => c.row === rows - 2 && c.col === 2)!;
  playerArmy2.owner = 0;
  playerArmy2.unitCount = 5;
  playerArmy2.unitType = 'INF';

  // 기본 세팅: 플레이어 본진 옆에 무역상 1명 배치 (가능하면 인접 빈칸)
  (function placeInitialMerchant() {
    const castle = playerCastle;
    // 후보 인접 오프셋(간단히 8방향 순서)
    const offsets = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1],
    ];

    for (const [dr, dc] of offsets) {
      const nr = castle.row + dr;
      const nc = castle.col + dc;
      const target = cells.find(c => c.row === nr && c.col === nc);
      if (target && target.owner === null && target.unitCount === 0) {
        target.owner = 'merchant' as Cell['owner'];
        target.merchantOwner = 0;
        target.merchantGold = 50; // 기본 골드
        target.merchantRoute = [];
        target.unitCount = 2;
        target.unitType = 'INF';
        console.log(`初期 무역상 배치: ${target.id}`);
        break;
      }
    }
  })();

  // AI 성 (우상단)
  const aiCastle = cells.find(c => c.row === 1 && c.col === cols - 2)!;
  aiCastle.owner = 1;
  aiCastle.unitCount = 5;
  aiCastle.unitType = 'INF';
  aiCastle.building = 'castle';

  // AI 추가 군대 (성 옆)
  const aiArmy2 = cells.find(c => c.row === 1 && c.col === cols - 3)!;
  aiArmy2.owner = 1;
  aiArmy2.unitCount = 5;
  aiArmy2.unitType = 'INF';

  // 용병 배치 (맵 중앙 근처에 랜덤)
  const centerRow = Math.floor(rows / 2);
  const centerCol = Math.floor(cols / 2);
  const mercCell = cells.find(c => c.row === centerRow && c.col === centerCol)!;
  mercCell.owner = 'mercenary';
  mercCell.unitCount = 3;
  mercCell.unitType = 'INF';

  return { 
    rows, cols, cells,
    turn: 1,
    currentPlayer: 0,
    players: [
      { id: 0, name: 'You', reputation: { fear: 50, justice: 50 }, gold: 10000, taxRate: 0.15 }, // 15% 세율
      { id: 1, name: 'AI', reputation: { fear: 50, justice: 50 }, gold: 10000, taxRate: 0.20 }, // 20% 세율
    ],
    pendingTradeRequests: [],
    tradeRelations: [[0, 0], [0, 0]],
  };
}

// Fear/Justice 시스템
export function getFearPower(fear: number): number {
  return Math.pow(fear / 100, 2);
}

export function getJusticePower(justice: number): number {
  return Math.pow(justice / 100, 2);
}

export function adjustReputation(
  rep: Reputation,
  deltaFear: number
): Reputation {
  const newFear = Math.max(0, Math.min(100, rep.fear + deltaFear));
  const fearChange = newFear - rep.fear;
  const justiceChange = -fearChange * 0.7;
  const newJustice = Math.max(0, Math.min(100, rep.justice + justiceChange));
  
  return { fear: newFear, justice: newJustice };
}

export function processSurrender(
  troops: number,
  attackerFear: number,
  attackerJustice: number
): { deaths: number; recruited: number; escaped: number } {
  const fearPower = getFearPower(attackerFear);
  const justicePower = getJusticePower(attackerJustice);
  
  const executionRate = fearPower * 0.5;
  const deaths = Math.floor(troops * executionRate);
  
  const recruitRate = justicePower * 0.7;
  const recruited = Math.floor((troops - deaths) * recruitRate);
  
  const escaped = troops - deaths - recruited;
  
  return { deaths, recruited, escaped };
}

