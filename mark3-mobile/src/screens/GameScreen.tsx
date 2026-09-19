import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { createInitialGameState, GameState, Cell } from '../models/GameState';
import { getAIAction, getMercenaryAction, executeAIMove } from '../services/simpleAI';
import { AI_PRESETS, AIDifficulty, getAIByDifficulty } from '../services/aiTraining';
import CombatModal from '../components/CombatModal';
import MercenaryModal from '../components/MercenaryModal';
import DestinationSelectModal from '../components/DestinationSelectModal';
import { simulateCombat, simulateRetreat, simulateSurrender } from '../services/combatSystem';
import { 
  checkMercenaryAutoAction, 
  checkMercenaryAutoActionWithContext,
  calculateHireCost, 
  simulateRetreatFromMercenary,
  simulateIntimidate,
  simulatePersuade
} from '../services/mercenarySystem';
import { 
  progressFortConstruction, 
  startFortConstruction,
  cancelFortConstruction,
  canStartFortConstruction,
  FORT_BUILD_COST
} from '../services/fortSystem';
import { processTurnEvents, checkBanditAttacks, TurnEvent } from '../services/turnEventSystem';
import { banditPlunderMerchant } from '../services/banditSystem';
import { calculateRoute } from '../services/tradeSystem';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  header: {
    padding: 16,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
  },
  headerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  goldText: {
    color: '#fbbf24',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  reputationBar: {
    padding: 12,
    backgroundColor: '#2a2a2a',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
  },
  repItem: {
    marginBottom: 12,
  },
  repLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  repBarContainer: {
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  repBarFill: {
    height: '100%',
  },
  repValue: {
    color: '#aaa',
    fontSize: 11,
  },
  grid: {
    flex: 1,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
  },
  hexCell: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  hexContent: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    height: 52,
  },
  cell: {
    width: 40,
    height: 40,
    margin: 2,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedCell: {
    borderColor: '#fff',
    borderWidth: 3,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 8,
  },
  cellContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buildingIcon: {
    fontSize: 16,
    position: 'absolute',
    top: -8,
    right: -8,
  },
  cellText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionPanel: {
    padding: 12,
    backgroundColor: '#2a2a2a',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  actionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  fortInfo: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  fortInfoText: {
    color: '#fbbf24',
    fontSize: 12,
    marginBottom: 2,
  },
  actionButton: {
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 6,
  },
  fortButton: {
    backgroundColor: '#854d0e',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  disabledText: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  footer: {
    padding: 16,
    backgroundColor: '#2a2a2a',
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  endTurnButton: {
    backgroundColor: '#3b82f6',
  },
  resetButton: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  difficultyText: {
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  difficultyModal: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  difficultyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  difficultyName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  difficultyDesc: {
    color: '#aaa',
    fontSize: 12,
  },
  selectedMark: {
    color: '#3b82f6',
    fontSize: 24,
    fontWeight: 'bold',
  },
  eventsModal: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  eventsList: {
    maxHeight: 300,
    marginVertical: 16,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  eventIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  eventMessage: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  closeEventButton: {
    backgroundColor: '#3b82f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  debugPanel: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 8,
    maxWidth: 260,
    zIndex: 999,
  },
  debugTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  debugItem: {
    color: '#ddd',
    fontSize: 11,
  },
});

export default function GameScreen() {
  const [showDifficultyModal, setShowDifficultyModal] = useState(false);
  const [difficulty, setDifficulty] = useState<AIDifficulty>('normal');
  const [gameState, setGameState] = useState<GameState>(() => 
    createInitialGameState(7, 7, 5)
  );
  const [selected, setSelected] = useState<{row: number; col: number} | null>(null);
  const [combatModal, setCombatModal] = useState<{
    visible: boolean;
    attacker: Cell;
    defender: Cell;
  } | null>(null);
  const [mercenaryModal, setMercenaryModal] = useState<{
    visible: boolean;
    mercenary: Cell;
    attacker: Cell;
    autoJoin?: boolean;
    autoJoinMessage?: string;
  } | null>(null);
  const [turnEvents, setTurnEvents] = useState<TurnEvent[]>([]);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [destinationCandidates, setDestinationCandidates] = useState<Cell[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<Cell | null>(null);

  const getMovablePositions = (row: number, col: number): Set<string> => {
    const positions = new Set<string>();
    // 육각형 6방향 (짝수/홀수 행에 따라 다름)
    const isEvenRow = row % 2 === 0;
    const directions = isEvenRow ? [
      [-1, -1], [-1, 0],  // 위쪽 2개
      [0, -1],  [0, 1],   // 좌우
      [1, -1],  [1, 0],   // 아래쪽 2개
    ] : [
      [-1, 0], [-1, 1],   // 위쪽 2개
      [0, -1], [0, 1],    // 좌우
      [1, 0],  [1, 1],    // 아래쪽 2개
    ];
    
    for (const [dr, dc] of directions) {
      const newRow = row + dr;
      const newCol = col + dc;
      if (newRow >= 0 && newRow < gameState.rows && newCol >= 0 && newCol < gameState.cols) {
        positions.add(`${newRow},${newCol}`);
      }
    }
    
    return positions;
  };

  const movablePositions = selected ? getMovablePositions(selected.row, selected.col) : new Set<string>();

  const handleCellPress = (row: number, col: number) => {
    console.log('셀 터치됨:', row, col, '모달 상태:', { showDifficultyModal, showEventsModal, showDestinationModal });
    const cell = gameState.cells.find(c => c.row === row && c.col === col);
    if (!cell) return;

    // 무역상 클릭 시 목적지 선택 모달만 띄움 (행동 제한)
    const isPlayerMerchant = cell.owner === 'merchant' && cell.merchantOwner === 0;
    if (!selected && isPlayerMerchant && cell.unitCount > 0) {
      // 목적지 후보: 완공된 요새 또는 본진만
      const candidates = gameState.cells.filter(c =>
        (c.building === 'fort' && c.fortState && typeof c.fortState !== 'string' && c.fortState.stage === 'complete') ||
        c.building === 'castle'
      );
      setDestinationCandidates(candidates);
      setSelectedMerchant(cell);
      setShowDestinationModal(true);
      return;
    }

    // 기존 군대 선택 로직 (무역상 제외)
    if (!selected && cell.owner === 0 && cell.unitCount > 0) {
      if (cell.building === 'fort' && cell.fortState && typeof cell.fortState !== 'string') {
        if (cell.fortState.stage !== 'complete') {
          console.log('🏗️ 요새 건설 중인 수비대는 이동할 수 없습니다');
        } else {
          console.log('🏰 완성된 요새의 수비대는 이동할 수 없습니다');
        }
        return;
      }
      setSelected({ row, col });
      return;
    }

    // 이미 선택된 상태에서 클릭
    if (selected) {
      const fromCell = gameState.cells.find(c => c.row === selected.row && c.col === selected.col);
      if (!fromCell) return;

      // 같은 칸 클릭 → 선택 해제
      if (selected.row === row && selected.col === col) {
        setSelected(null);
        return;
      }

      // 이동 가능한 칸인지 체크
      const targetKey = `${row},${col}`;
      if (!movablePositions.has(targetKey)) {
        setSelected(null);
        return;
      }

      // 이동/공격 실행
      setGameState(prev => {
        const newCells = [...prev.cells];
        const fromIdx = newCells.findIndex(c => c.row === selected.row && c.col === selected.col);
        const toIdx = newCells.findIndex(c => c.row === row && c.col === col);

        if (fromIdx === -1 || toIdx === -1) return prev;

        const from = { ...newCells[fromIdx] };
        const to = { ...newCells[toIdx] };

        // 빈 칸으로 이동
        if (to.owner === null) {
          // Merchant 이동: preserve merchantOwner and merchantRoute/gold
          if (from.owner === 'merchant') {
            to.owner = 'merchant' as Cell['owner'];
            to.merchantOwner = from.merchantOwner;
            to.merchantGold = from.merchantGold;
            to.merchantRoute = from.merchantRoute ? [...from.merchantRoute] : undefined;
            to.unitCount = from.unitCount;
            to.unitType = from.unitType;

            from.owner = null;
            from.merchantOwner = undefined;
            from.merchantGold = undefined;
            from.merchantRoute = undefined;
            from.unitCount = 0;
            from.unitType = undefined;
          } else {
            to.owner = from.owner;
            to.unitCount = from.unitCount;
            to.unitType = from.unitType;
            from.owner = null;
            from.unitCount = 0;
            from.unitType = undefined;
          }
        }
        // 내 칸으로 이동 (병합)
        else if (to.owner === from.owner || (to.owner === 'merchant' && from.owner === 'merchant' && to.merchantOwner === from.merchantOwner)) {
          // merging same-owner armies or same-owner merchants
          to.unitCount += from.unitCount;
          // if merchants merging, preserve merchantOwner/gold/route
          if (from.owner === 'merchant') {
            to.merchantOwner = from.merchantOwner;
            to.merchantGold = (to.merchantGold || 0) + (from.merchantGold || 0);
            // prefer keeping existing route
            if (!to.merchantRoute && from.merchantRoute) to.merchantRoute = [...from.merchantRoute];
            to.owner = 'merchant' as Cell['owner'];
            to.unitType = from.unitType;
          }
          from.owner = null;
          from.unitCount = 0;
          from.unitType = undefined;
        }
        // 적 칸 공격
        else {
          // 플레이어가 용병 조우 → 용병 모달 표시
          if (to.owner === 'mercenary') {
            const player = prev.players.find(p => p.id === from.owner)!;
            const encounter = checkMercenaryAutoActionWithContext(
              to,
              from,
              currentPlayer.reputation.fear,
              currentPlayer.reputation.justice
            );

            // Ensure autoJoin is boolean (MercenaryEncounter에 autoJoin이 없을 수 있음)
            const autoJoin = Boolean((encounter as any).autoJoin);

            if (encounter && encounter.autoAction === 'join' && encounter.autoJoinMessage) {
              setMercenaryModal({
                visible: true,
                autoJoinMessage: encounter.autoJoinMessage,
                attacker: from,
                mercenary: to,
              });
              return prev;
            }
          }

          // 일반 전투 모달 표시
          setCombatModal({
            visible: true,
            attacker: from,
            defender: to,
          });
        }

        newCells[fromIdx] = from;
        newCells[toIdx] = to;

        return { ...prev, cells: newCells };
      });

      if (!combatModal) {
        setSelected(null);
      }
    }
  };

  const renderCell = (row: number, col: number) => {
    const cell = gameState.cells.find(c => c.row === row && c.col === col);
    if (!cell) return null;

    let bgColor = '#2a2a2a';
    if (cell.owner === 0) bgColor = '#3b82f6';
    if (cell.owner === 1) bgColor = '#ef4444';
    if (cell.owner === 'mercenary') bgColor = '#f59e0b';  // 주황색 (용병)
    if (cell.owner === 'merchant') bgColor = '#10b981';  // 초록색 (무역상)
    if (cell.owner === 'bandit') bgColor = '#8b5cf6';    // 보라색 (강도)

    // 선택된 유닛인지 체크
    const isSelected = selected && selected.row === row && selected.col === col;
    
    // 이동 가능한 칸인지 체크
    const cellKey = `${row},${col}`;
    const isMovable = movablePositions.has(cellKey) && !isSelected;

    // 이동 가능한 칸은 노란색 오버레이
    if (isMovable) {
      bgColor = '#fbbf24'; // 노란색
    }

    // 건물/유닛 아이콘 결정
    let buildingIcon = '';
    if (cell.building === 'castle') {
      buildingIcon = '🏴';
    } else if (cell.building === 'fort') {
      if (cell.fortState && typeof cell.fortState !== 'string') {
        if (cell.fortState.stage === 'complete') {
          buildingIcon = '🏰';
        } else {
          buildingIcon = '🏗️';
        }
      }
    } else if (cell.owner === 'merchant') {
      buildingIcon = '🚚';  // 무역상
    } else if (cell.owner === 'bandit') {
      buildingIcon = '🦹';  // 강도
    }

    // 육각형 좌표 계산 (pointy-top으로 변경)
    const hexSize = 30;
    const hexWidth = Math.sqrt(3) * hexSize;   // ~51.96
    const hexHeight = hexSize * 2;              // 60
    
    // Pointy-top 육각형 배치 (완전히 맞물리게)
    const horizontalSpacing = hexWidth;         // 육각형 간 수평 거리
    const verticalSpacing = hexHeight * 0.75;   // 육각형 간 수직 거리 (3/4)
    
    const xOffset = row % 2 === 0 ? 0 : hexWidth * 0.5;
    const x = col * horizontalSpacing + xOffset;
    const y = row * verticalSpacing;

    // 육각형 포인트 생성 (pointy-top - 위아래가 뾰족)
    const points = [
      [hexWidth * 0.5, 0],                    // 위 꼭짓점
      [hexWidth, hexHeight * 0.25],           // 오른쪽 위
      [hexWidth, hexHeight * 0.75],           // 오른쪽 아래
      [hexWidth * 0.5, hexHeight],            // 아래 꼭짓점
      [0, hexHeight * 0.75],                  // 왼쪽 아래
      [0, hexHeight * 0.25],                  // 왼쪽 위
    ].map(p => `${p[0]},${p[1]}`).join(' ');

    return (
      <TouchableOpacity
        key={cell.id}
        style={[
          styles.hexCell,
          { left: x, top: y },
        ]}
        onPress={() => handleCellPress(row, col)}
      >
        <Svg width={hexWidth} height={hexHeight}>
          <Polygon
            points={points}
            fill={bgColor}
            stroke={isSelected ? '#fff' : 'rgba(0,0,0,0.3)'}
            strokeWidth={isSelected ? 3 : 0.5}
          />
        </Svg>
        <View style={styles.hexContent}>
          {buildingIcon !== '' && <Text style={styles.buildingIcon}>{buildingIcon}</Text>}
          {cell.unitCount > 0 && (
            <Text style={styles.cellText}>{cell.unitCount}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderRow = (row: number) => (
    <View key={row}>
      {Array.from({ length: gameState.cols }, (_, col) => renderCell(row, col))}
    </View>
  );

  const handleFight = () => {
    if (!combatModal) return;

    const attacker = gameState.players.find(p => p.id === combatModal.attacker.owner)!;
    const defender = gameState.players.find(p => p.id === combatModal.defender.owner);

    // 용병은 기본 평판 사용
    const defenderFear = defender?.reputation.fear ?? 50;

    const result = simulateCombat(
      combatModal.attacker,
      combatModal.defender,
      attacker.reputation.fear,
      attacker.reputation.justice,
      defenderFear
    );

    setGameState(prev => {
      const newCells = [...prev.cells];
      const attIdx = newCells.findIndex(c => c.id === combatModal.attacker.id);
      const defIdx = newCells.findIndex(c => c.id === combatModal.defender.id);

      if (attIdx === -1 || defIdx === -1) return prev;

      const att = { ...newCells[attIdx] };
      const def = { ...newCells[defIdx] };

      att.unitCount = result.details.attackerSurvivors;
      def.unitCount = result.details.defenderSurvivors;

      // 용병 처치 시 골드 획득
      let goldReward = 0;
      if (result.details.winner === 'attacker' && combatModal.defender.owner === 'mercenary') {
        goldReward = combatModal.defender.unitCount * 50;
      }

      if (result.details.winner === 'attacker') {
        def.owner = att.owner;
        def.unitCount = att.unitCount;
        def.unitType = att.unitType;
        att.owner = null;
        att.unitCount = 0;
        att.unitType = undefined;
      } else if (att.unitCount <= 0) {
        att.owner = null;
        att.unitCount = 0;
        att.unitType = undefined;
      }

      newCells[attIdx] = att;
      newCells[defIdx] = def;
      
      // AI 학습: 전투 결과에 따라 평판 조정 + 골드 지급
      const newPlayers = prev.players.map(p => {
        if (p.id === combatModal.attacker.owner) {
          const isWin = result.details.winner === 'attacker';
          const casualties = combatModal.attacker.unitCount - result.details.attackerSurvivors;
          const kills = combatModal.defender.unitCount - result.details.defenderSurvivors;
          
          // 승리 시: Justice 소폭 증가, 많은 피해 시 Fear 증가
          // 패배 시: Justice 감소
          let fearDelta = 0;
          let justiceDelta = 0;
          
          if (isWin) {
            justiceDelta = kills > 5 ? 2 : 1; // 큰 승리는 정의 상승
            fearDelta = casualties > 3 ? 3 : 1; // 피해가 크면 공포도 상승 (희생 불사)
            console.log(`📈 평판 변화: Fear +${fearDelta}, Justice +${justiceDelta}`);
          } else {
            justiceDelta = -3; // 패배는 명성에 타격
            fearDelta = -1;
            console.log(`📉 평판 변화: Fear ${fearDelta}, Justice ${justiceDelta}`);
          }
          
          return {
            ...p,
            gold: p.gold + goldReward,
            reputation: {
              fear: Math.max(0, Math.min(100, p.reputation.fear + fearDelta)),
              justice: Math.max(0, Math.min(100, p.reputation.justice + justiceDelta)),
            },
          };
        }
        return p;
      });

      // AI가 공격했으면 턴 종료
      const isAIAttack = combatModal.attacker.owner === 1;
      return {
        ...prev,
        cells: newCells,
        players: newPlayers,
        turn: isAIAttack ? prev.turn + 1 : prev.turn,
        currentPlayer: isAIAttack ? 0 : prev.currentPlayer,
      };
    });

    setCombatModal(null);
    setSelected(null);
  };

  const handleRetreat = () => {
    if (!combatModal) return;

    const result = simulateRetreat(
      combatModal.defender,
      combatModal.defender.retreatStreak || 0
    );

    setGameState(prev => {
      const newCells = [...prev.cells];
      const attIdx = newCells.findIndex(c => c.id === combatModal.attacker.id);
      const defIdx = newCells.findIndex(c => c.id === combatModal.defender.id);

      if (attIdx === -1 || defIdx === -1) return prev;

      const att = { ...newCells[attIdx] };
      const def = { ...newCells[defIdx] };

      // 생존자가 있으면 인접 빈 칸으로 후퇴 (적과 최대한 멀리)
      if (result.survivors > 0) {
        const directions = [
          [-1, -1], [-1, 0], [-1, 1],
          [0, -1],           [0, 1],
          [1, -1],  [1, 0],  [1, 1],
        ];

        // 인접 빈 칸 찾기
        const emptyCells = directions
          .map(([dr, dc]) => {
            const newRow = def.row + dr;
            const newCol = def.col + dc;
            return newCells.find(c => 
              c.row === newRow && 
              c.col === newCol && 
              c.owner === null
            );
          })
          .filter(c => c !== undefined);

        // 빈 칸이 있으면 적 유닛과 최대한 멀리 떨어진 곳으로 후퇴
        if (emptyCells.length > 0) {
          // 각 빈 칸에 대해 적 유닛들과의 최소 거리 계산
          const cellScores = emptyCells.map(cell => {
            const enemyUnits = newCells.filter(c => c.owner === att.owner && c.unitCount > 0);
            const minDistance = Math.min(...enemyUnits.map(enemy => {
              const dx = cell!.col - enemy.col;
              const dy = cell!.row - enemy.row;
              return Math.sqrt(dx * dx + dy * dy);
            }));
            return { cell, minDistance };
          });

          // 최소 거리가 가장 큰 칸 선택 (적과 가장 멀리 떨어진 곳)
          const bestRetreat = cellScores.reduce((best, current) => 
            current.minDistance > best.minDistance ? current : best
          );

          const retreatIdx = newCells.findIndex(c => c.id === bestRetreat.cell!.id);
          
          newCells[retreatIdx] = {
            ...newCells[retreatIdx],
            owner: def.owner,
            unitCount: result.survivors,
            unitType: def.unitType,
            retreatStreak: (def.retreatStreak || 0) + 1,
          };
        }
        // 빈 칸이 없으면 생존자 전멸
      }

      // 공격자가 수비 칸 점령
      def.owner = att.owner;
      def.unitCount = att.unitCount;
      def.unitType = att.unitType;
      def.retreatStreak = 0;

      // 건설 중인 요새가 있었다면 취소
      if (def.building === 'fort' && def.fortState && typeof def.fortState !== 'string') {
        const cancelResult = cancelFortConstruction(def, def.fortState);
        console.log(`❌ 요새 건설 취소 (후퇴): 수비대 ${cancelResult.releasedUnits}명 해방`);
        def.fortState = cancelResult.updatedCell.fortState;
        def.building = cancelResult.updatedCell.building;
      }

      att.owner = null;
      att.unitCount = 0;
      att.unitType = undefined;

      newCells[attIdx] = att;
      newCells[defIdx] = def;

      // AI가 공격했으면 턴 종료
      const isAIAttack = combatModal.attacker.owner === 1;
      return {
        ...prev,
        cells: newCells,
        turn: isAIAttack ? prev.turn + 1 : prev.turn,
        currentPlayer: isAIAttack ? 0 : prev.currentPlayer,
      };
    });

    setCombatModal(null);
    setSelected(null);
  };

  const handleSurrender = () => {
    if (!combatModal) return;

    const attacker = gameState.players.find(p => p.id === combatModal.attacker.owner)!;

    const result = simulateSurrender(
      combatModal.defender.unitCount,
      attacker.reputation.fear,
      attacker.reputation.justice
    );

    setGameState(prev => {
      const newCells = [...prev.cells];
      const attIdx = newCells.findIndex(c => c.id === combatModal.attacker.id);
      const defIdx = newCells.findIndex(c => c.id === combatModal.defender.id);

      if (attIdx === -1 || defIdx === -1) return prev;

      const att = { ...newCells[attIdx] };
      const def = { ...newCells[defIdx] };

      // 공격자가 점령하고 편입된 병력 획득
      def.owner = att.owner;
      def.unitCount = att.unitCount + result.recruited;
      def.unitType = att.unitType;

      // 건설 중인 요새가 있었다면 취소
      if (def.building === 'fort' && def.fortState && typeof def.fortState !== 'string') {
        const cancelResult = cancelFortConstruction(def, def.fortState);
        console.log(`❌ 요새 건설 취소 (항복): 수비대 ${cancelResult.releasedUnits}명 해방`);
        def.fortState = cancelResult.updatedCell.fortState;
        def.building = cancelResult.updatedCell.building;
        def.unitCount += cancelResult.releasedUnits;  // 수비대도 편입
      }

      att.owner = null;
      att.unitCount = 0;
      att.unitType = undefined;

      newCells[attIdx] = att;
      newCells[defIdx] = def;

      // AI가 공격했으면 턴 종료
      const isAIAttack = combatModal.attacker.owner === 1;
      return {
        ...prev,
        cells: newCells,
        turn: isAIAttack ? prev.turn + 1 : prev.turn,
        currentPlayer: isAIAttack ? 0 : prev.currentPlayer,
      };
    });

    setCombatModal(null);
    setSelected(null);
  };

  // 용병 핸들러들
  const handleMercenaryRetreat = () => {
    if (!mercenaryModal) return;

    const player = gameState.players[gameState.currentPlayer];
    const result = simulateRetreatFromMercenary(mercenaryModal.mercenary, player.reputation.fear);

    if (result.pursued) {
      // 추격당함 → 전투 모달
      setCombatModal({
        visible: true,
        attacker: mercenaryModal.mercenary,
        defender: mercenaryModal.attacker,
      });
    }

    setMercenaryModal(null);
    setSelected(null);
  };

  const handleMercenaryFight = () => {
    if (!mercenaryModal) return;

    // 일반 전투 발생
    setCombatModal({
      visible: true,
      attacker: mercenaryModal.attacker,
      defender: mercenaryModal.mercenary,
    });

    setMercenaryModal(null);
  };

  const handleHireTemporary = () => {
    if (!mercenaryModal) return;

    const player = gameState.players[gameState.currentPlayer];
    const costs = calculateHireCost(mercenaryModal.mercenary, player.reputation.justice);

    if (player.gold < costs.temporary) return;

    setGameState((prev: GameState) => {
      const newCells = [...prev.cells];
      const mercIdx = newCells.findIndex(c => c.id === mercenaryModal.mercenary.id);
      const attIdx = newCells.findIndex(c => c.id === mercenaryModal.attacker.id);

      if (mercIdx === -1 || attIdx === -1) return prev;

      const merc = { ...newCells[mercIdx] };
      const att = { ...newCells[attIdx] };

      // 용병을 공격자 칸으로 이동 (임시 5턴)
      merc.owner = att.owner;
      merc.unitCount = att.unitCount + newCells[mercIdx].unitCount;
      merc.unitType = att.unitType;
      merc.mercenaryTurnsLeft = 5;

      att.owner = null;
      att.unitCount = 0;
      att.unitType = undefined;

      newCells[mercIdx] = merc;
      newCells[attIdx] = att;

      return { ...prev, cells: newCells };
    });

    setMercenaryModal(null);
    setSelected(null);
  };

  const handleHirePermanent = () => {
    if (!mercenaryModal) return;

    const player = gameState.players[gameState.currentPlayer];
    const costs = calculateHireCost(mercenaryModal.mercenary, player.reputation.justice);

    if (player.gold < costs.permanent) return;

    setGameState(prev => {
      const newCells = [...prev.cells];
      const mercIdx = newCells.findIndex(c => c.id === mercenaryModal.mercenary.id);
      const attIdx = newCells.findIndex(c => c.id === mercenaryModal.attacker.id);

      if (mercIdx === -1 || attIdx === -1) return prev;

      const merc = { ...newCells[mercIdx] };
      const att = { ...newCells[attIdx] };

      // 용병을 공격자 칸으로 영구 편입
      merc.owner = att.owner;
      merc.unitCount = att.unitCount + newCells[mercIdx].unitCount;
      merc.unitType = att.unitType;
      merc.mercenaryTurnsLeft = 0;  // 영구

      att.owner = null;
      att.unitCount = 0;
      att.unitType = undefined;

      newCells[mercIdx] = merc;
      newCells[attIdx] = att;

      const newPlayers = prev.players.map(p =>
        p.id === player.id ? { ...p, gold: p.gold - costs.permanent } : p
      );

      return { ...prev, cells: newCells, players: newPlayers };
    });

    setMercenaryModal(null);
    setSelected(null);
  };

  const handleIntimidate = () => {
    if (!mercenaryModal) return;

    const player = gameState.players[gameState.currentPlayer];
    const result = simulateIntimidate(mercenaryModal.mercenary, player.reputation.fear);

    if (result.success) {
      // 성공 → 무료 편입
      setGameState(prev => {
        const newCells = [...prev.cells];
        const mercIdx = newCells.findIndex(c => c.id === mercenaryModal.mercenary.id);
        const attIdx = newCells.findIndex(c => c.id === mercenaryModal.attacker.id);

        if (mercIdx === -1 || attIdx === -1) return prev;

        const merc = { ...newCells[mercIdx] };
        const att = { ...newCells[attIdx] };

        merc.owner = att.owner;
        merc.unitCount = att.unitCount + result.survivors!;
        merc.unitType = att.unitType;
        merc.mercenaryTurnsLeft = 0;

        att.owner = null;
        att.unitCount = 0;
        att.unitType = undefined;

        newCells[mercIdx] = merc;
        newCells[attIdx] = att;

        // Fear +10, Justice -5
        const newPlayers = prev.players.map(p =>
          p.id === player.id 
            ? { ...p, reputation: { fear: Math.min(100, p.reputation.fear + 10), justice: Math.max(0, p.reputation.justice - 5) }}
            : p
        );

        return { ...prev, cells: newCells, players: newPlayers };
      });

      setMercenaryModal(null);
      setSelected(null);
    } else {
      // 실패 → 전투 발생
      setCombatModal({
        visible: true,
        attacker: mercenaryModal.attacker,
        defender: mercenaryModal.mercenary,
      });
      setMercenaryModal(null);
    }
  };

  const handlePersuade = () => {
    if (!mercenaryModal) return;

    const player = gameState.players[gameState.currentPlayer];
    const result = simulatePersuade(mercenaryModal.mercenary, player.reputation.justice);

    if (result.success) {
      // 성공 → 무료 편입
      setGameState(prev => {
        const newCells = [...prev.cells];
        const mercIdx = newCells.findIndex(c => c.id === mercenaryModal.mercenary.id);
        const attIdx = newCells.findIndex(c => c.id === mercenaryModal.attacker.id);

        if (mercIdx === -1 || attIdx === -1) return prev;

        const merc = { ...newCells[mercIdx] };
        const att = { ...newCells[attIdx] };

        merc.owner = att.owner;
        merc.unitCount = att.unitCount + result.survivors!;
        merc.unitType = att.unitType;
        merc.mercenaryTurnsLeft = 0;

        att.owner = null;
        att.unitCount = 0;
        att.unitType = undefined;

        newCells[mercIdx] = merc;
        newCells[attIdx] = att;

        // Justice +3
        const newPlayers = prev.players.map(p =>
          p.id === player.id 
            ? { ...p, reputation: { ...p.reputation, justice: Math.min(100, p.reputation.justice + 3) }}
            : p
        );

        return { ...prev, cells: newCells, players: newPlayers };
      });

      setMercenaryModal(null);
      setSelected(null);
    } else {
      // 실패 → 그냥 거절당함
      setMercenaryModal(null);
      setSelected(null);
    }
  };

  const handleAcceptAutoJoin = () => {
    if (!mercenaryModal) return;

    // 자발적 합류 수락 → 무료 편입
    setGameState(prev => {
      const newCells = [...prev.cells];
      const mercIdx = newCells.findIndex(c => c.id === mercenaryModal.mercenary.id);
      const attIdx = newCells.findIndex(c => c.id === mercenaryModal.attacker.id);

      if (mercIdx === -1 || attIdx === -1) return prev;

      const merc = { ...newCells[mercIdx] };
      const att = { ...newCells[attIdx] };

      merc.owner = att.owner;
      merc.unitCount = att.unitCount + newCells[mercIdx].unitCount;
      merc.unitType = att.unitType;
      merc.mercenaryTurnsLeft = 0;

      att.owner = null;
      att.unitCount = 0;
      att.unitType = undefined;

      newCells[mercIdx] = merc;
      newCells[attIdx] = att;

      // Justice +5
      const player = prev.players[prev.currentPlayer];
      const newPlayers = prev.players.map(p =>
        p.id === player.id 
          ? { ...p, reputation: { ...p.reputation, justice: Math.min(100, p.reputation.justice + 5) }}
          : p
      );

      return { ...prev, cells: newCells, players: newPlayers };
    });

    setMercenaryModal(null);
    setSelected(null);
  };

  const handleDeclineAutoJoin = () => {
    setMercenaryModal(null);
    setSelected(null);
  };

  const currentPlayer = gameState.players[gameState.currentPlayer];

  // DEBUG: 현재 존재하는 무역상 목록 (렌더링 확인용)
  const merchantList = gameState.cells.filter(c => c.owner === 'merchant');

  const renderMerchantDebugPanel = () => (
    <View style={styles.debugPanel} pointerEvents="none">
      <Text style={styles.debugTitle}>Merchants: {merchantList.length}</Text>
      {merchantList.map(m => (
        <Text key={m.id} style={styles.debugItem}>{`${m.id} @ (${m.row},${m.col}) owner:${m.merchantOwner} gold:${m.merchantGold || 0}`}</Text>
      ))}
    </View>
  );

  // 턴 종료 시 임시 고용 용병 + 요새 건설 진행 + 무역상/강도 이벤트 처리
  useEffect(() => {
    if (gameState.currentPlayer === 0) {  // 플레이어 턴 시작 시
      setGameState(prev => {
        // 1. 턴 이벤트 처리 (무역상, 강도) - 이 함수가 무역상 이동을 처리함
        const { events, updatedState } = processTurnEvents(prev);
        
        // 턴 이벤트 모달은 표시하지 않음
        // if (events.length > 0) {
        //   setTurnEvents(events);
        //   setShowEventsModal(true);
        // }

        // 2. 강도 공격 체크
        const { attacks } = checkBanditAttacks(updatedState);
        
        for (const attack of attacks) {
          const bandit = updatedState.cells.find(c => c.id === attack.bandit);
          const target = updatedState.cells.find(c => c.id === attack.target);
          
          if (bandit && target) {
            if (target.owner === 'merchant') {
              // 무역상 약탈
              const result = banditPlunderMerchant(bandit, target);
              console.log(`💰 강도가 무역상에게서 ${result.gold} 골드를 약탈했습니다.`);
            } else if (target.owner === 0) {
              // 플레이어 군대 공격 → 전투 모달
              setCombatModal({
                visible: true,
                attacker: bandit,
                defender: target,
              });
            }
          }
        }

        // 3. 용병 및 요새 건설 진행 (무역상 이동 결과는 이미 updatedState.cells에 반영됨)
        // 무역상 이동 결과를 보존하기 위해 무역상이 아닌 셀만 업데이트
        const newCells = updatedState.cells.map(cell => {
          // 무역상은 이미 이동했으므로 그대로 유지
          if (cell.owner === 'merchant') {
            return cell;
          }

          let updatedCell = { ...cell };

          // 임시 고용 용병이 있는 경우
          if (cell.mercenaryTurnsLeft && cell.mercenaryTurnsLeft > 0) {
            const turnsLeft = cell.mercenaryTurnsLeft - 1;
            
            // 턴이 다 되면 중립 용병으로 전환
            if (turnsLeft === 0) {
              console.log(`⏰ 용병 계약 종료! (${cell.row}, ${cell.col})`);
              updatedCell = { 
                ...updatedCell, 
                owner: 'mercenary' as const, 
                mercenaryTurnsLeft: undefined 
              };
            } else {
              updatedCell = { ...updatedCell, mercenaryTurnsLeft: turnsLeft };
            }
          }

          // 요새 건설 중인 경우
          if (cell.building === 'fort' && cell.fortState && typeof cell.fortState !== 'string') {
            const oldStage = cell.fortState.stage;
            const newFortState = progressFortConstruction(cell.fortState);
            updatedCell = {
              ...updatedCell,
              fortState: newFortState,
            };
            
            if (newFortState.stage === 'complete' && oldStage !== 'complete') {
              console.log(`🏰 요새 건설 완료! (${cell.row}, ${cell.col})`);
            } else if (newFortState.stage !== oldStage) {
              console.log(`🏗️ 요새 건설 진행: Stage ${newFortState.stage} (${cell.row}, ${cell.col})`);
            }
          }

          return updatedCell;
        });

        // 무역상 이동 결과를 포함한 상태 반환
        return { ...updatedState, cells: newCells };
      });
    }
  }, [gameState.turn]);

  // AI 자동 턴
  useEffect(() => {
    if (gameState.currentPlayer === 1 && !combatModal) {
      const timer = setTimeout(() => {
        const action = getAIAction(gameState);
        
        if (!action) {
          // AI가 움직일 수 없으면 턴 종료
          setGameState(prev => ({
            ...prev,
            turn: prev.turn + 1,
            currentPlayer: 0,
          }));
          return;
        }

        if (action.type === 'attack') {
          // AI가 공격 → 플레이어에게 모달 표시
          setCombatModal({
            visible: true,
            attacker: action.from,
            defender: action.to,
          });
        } else if (action.type === 'hire-mercenary') {
          // AI가 용병 고용
          setGameState(prev => {
            const newCells = [...prev.cells];
            const mercIdx = newCells.findIndex(c => c.id === action.to.id);
            const aiIdx = newCells.findIndex(c => c.id === action.from.id);

            if (mercIdx === -1 || aiIdx === -1) return prev;

            const merc = { ...newCells[mercIdx] };
            const ai = { ...newCells[aiIdx] };

            const costs = calculateHireCost(action.to, prev.players[1].reputation.justice);

            // 용병 영구 편입
            merc.owner = 1;
            merc.unitCount = ai.unitCount + action.to.unitCount;
            merc.unitType = ai.unitType;
            merc.mercenaryTurnsLeft = 0;

            ai.owner = null;
            ai.unitCount = 0;
            ai.unitType = undefined;

            newCells[mercIdx] = merc;
            newCells[aiIdx] = ai;

            const newPlayers = prev.players.map(p =>
              p.id === 1 ? { ...p, gold: p.gold - costs.permanent } : p
            );

            return {
              ...prev,
              cells: newCells,
              players: newPlayers,
              turn: prev.turn + 1,
              currentPlayer: 0,
            };
          });
        } else if (action.type === 'intimidate-mercenary') {
          // AI가 용병 협박
          const aiPlayer = gameState.players.find(p => p.id === 1)!;
          const result = simulateIntimidate(action.to, aiPlayer.reputation.fear);

          if (result.success) {
            // 성공 → 무료 편입
            setGameState(prev => {
              const newCells = [...prev.cells];
              const mercIdx = newCells.findIndex(c => c.id === action.to.id);
              const aiIdx = newCells.findIndex(c => c.id === action.from.id);

              if (mercIdx === -1 || aiIdx === -1) return prev;

              const merc = { ...newCells[mercIdx] };
              const ai = { ...newCells[aiIdx] };

              merc.owner = 1;
              merc.unitCount = ai.unitCount + result.survivors!;
              merc.unitType = ai.unitType;
              merc.mercenaryTurnsLeft = 0;

              ai.owner = null;
              ai.unitCount = 0;
              ai.unitType = undefined;

              newCells[mercIdx] = merc;
              newCells[aiIdx] = ai;

              const newPlayers = prev.players.map(p =>
                p.id === 1 
                  ? { ...p, reputation: { fear: Math.min(100, p.reputation.fear + 10), justice: Math.max(0, p.reputation.justice - 5) }}
                  : p
              );

              return {
                ...prev,
                cells: newCells,
                players: newPlayers,
                turn: prev.turn + 1,
                currentPlayer: 0,
              };
            });
          } else {
            // 실패 → 전투 발생 (AI가 공격자)
            setCombatModal({
              visible: true,
              attacker: action.from,
              defender: action.to,
            });
          }
        } else {
          // AI가 이동 후 용병 턴 실행
          setGameState(prev => {
            let newState = executeAIMove(prev, action);
            
            // 용병 턴 (AI 턴 직후 자동 실행)
            const mercAction = getMercenaryAction(newState);
            if (mercAction) {
              if (mercAction.type === 'attack') {
                // 용병이 공격하면 즉시 전투 (모달 없이 자동 전투)
                const attacker = newState.players.find(p => p.id === 1) || { 
                  reputation: { fear: 50, justice: 50 } 
                };
                const defender = newState.players.find(p => 
                  p.id === mercAction.to.owner
                );
                
                const combatResult = simulateCombat(
                  mercAction.from,
                  mercAction.to,
                  50, // 용병 기본 Fear
                  50, // 용병 기본 Justice
                  defender?.reputation.fear ?? 50
                );
                
                const newCells = [...newState.cells];
                const attIdx = newCells.findIndex(c => c.id === mercAction.from.id);
                const defIdx = newCells.findIndex(c => c.id === mercAction.to.id);
                
                if (attIdx !== -1 && defIdx !== -1) {
                  const att = { ...newCells[attIdx] };
                  const def = { ...newCells[defIdx] };
                  
                  att.unitCount = combatResult.details.attackerSurvivors;
                  def.unitCount = combatResult.details.defenderSurvivors;
                  
                  if (combatResult.details.winner === 'attacker') {
                    def.owner = 'mercenary';
                    def.unitCount = att.unitCount;
                    def.unitType = att.unitType;
                    att.owner = null;
                    att.unitCount = 0;
                    att.unitType = undefined;
                  } else if (att.unitCount <= 0) {
                    att.owner = null;
                    att.unitCount = 0;
                    att.unitType = undefined;
                  }
                  
                  newCells[attIdx] = att;
                  newCells[defIdx] = def;
                  newState = { ...newState, cells: newCells };
                }
              } else {
                // 용병 이동
                newState = executeAIMove(newState, mercAction);
              }
            }
            
            return {
              ...newState,
              turn: newState.turn + 1,
              currentPlayer: 0,
            };
          });
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState.currentPlayer, combatModal]);

  const handleMerchantDestination = (destCell: Cell) => {
    if (!selectedMerchant) return;
    
    setGameState(prev => {
      const newCells = prev.cells.map(c => ({ ...c }));
      const merchantIdx = newCells.findIndex(c => c.id === selectedMerchant.id);
      
      if (merchantIdx === -1) return prev;
      
      const merchant = { ...newCells[merchantIdx] };
      
      // 현재 위치와 목적지가 같으면 경로를 계산하지 않음
      if (merchant.row === destCell.row && merchant.col === destCell.col) {
        console.log(`⚠️ 무역상이 이미 목적지에 있습니다. (${merchant.row},${merchant.col})`);
        return prev;
      }
      
      console.log(`🔍 경로 계산 시작: 출발지(${merchant.row},${merchant.col}) → 목적지(${destCell.row},${destCell.col}), 그리드 크기: ${prev.rows}x${prev.cols}`);
      const route = calculateRoute(merchant, destCell, prev);
      
      // 경로가 비어있으면 에러
      if (!route || route.length === 0) {
        console.log(`❌ 무역상 경로 계산 실패: 출발지(${merchant.row},${merchant.col}) → 목적지(${destCell.row},${destCell.col}), 그리드 크기: ${prev.rows}x${prev.cols}`);
        // 경로 계산 실패해도 상태는 설정 (다음 턴에 재시도)
        merchant.merchantDestinationId = destCell.id;
        merchant.merchantState = 'outbound';
        merchant.merchantOriginId = merchant.id;
        merchant.merchantRoundTripCount = merchant.merchantRoundTripCount || 0;
        newCells[merchantIdx] = merchant;
        return { ...prev, cells: newCells };
      }
      
      console.log(`✅ 무역상 경로 계산 성공: ${route.length}칸, 경로: ${route.slice(0, 5).join(', ')}${route.length > 5 ? '...' : ''}`);
      
      // 무역상은 항상 본진에 있으므로 현재 위치가 출발지
      merchant.merchantRoute = route;
      merchant.merchantDestinationId = destCell.id;
      merchant.merchantState = 'outbound'; // 목적지로 가는 중
      merchant.merchantOriginId = merchant.id; // 현재 위치(본진)가 출발지
      merchant.merchantRoundTripCount = merchant.merchantRoundTripCount || 0;
      
      console.log(`🎯 무역상 목적지 설정: ${merchant.merchantOwner === 0 ? '당신' : 'AI'}의 무역상이 ${destCell.building === 'castle' ? `${destCell.owner === 0 ? '당신' : 'AI'}의 본진` : `${destCell.owner === 0 ? '당신' : 'AI'}의 요새`}로 출발 (출발지: ${merchant.merchantOriginId}(${merchant.row},${merchant.col}), 목적지: ${destCell.id}(${destCell.row},${destCell.col}), 경로: ${route.length}칸)`);
      
      newCells[merchantIdx] = merchant;
      
      return { ...prev, cells: newCells };
    });
    
    setShowDestinationModal(false);
    setSelectedMerchant(null);
  };

  return (
    <View style={styles.container}>
      {/* 난이도 선택 모달 */}
      {showDifficultyModal && (
        <Modal 
          visible={showDifficultyModal} 
          transparent 
          animationType="slide"
          onRequestClose={() => setShowDifficultyModal(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowDifficultyModal(false)}
          >
            <TouchableOpacity 
              style={styles.difficultyModal}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.modalTitle}>난이도 선택</Text>
              <Text style={styles.modalSubtitle}>AI의 전략 수준을 선택하세요</Text>
              {Object.entries(AI_PRESETS).map(([key, preset]) => (
                <TouchableOpacity
                  key={key}
                  style={styles.difficultyOption}
                  onPress={() => {
                    setDifficulty(key as AIDifficulty);
                    setShowDifficultyModal(false);
                  }}
                >
                  <View>
                    <Text style={styles.difficultyName}>{preset.name}</Text>
                    <Text style={styles.difficultyDesc}>{preset.description}</Text>
                  </View>
                  {difficulty === key && <Text style={styles.selectedMark}>✓</Text>}
                </TouchableOpacity>
              ))}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerText}>
          턴 {gameState.turn} - {currentPlayer.name}
        </Text>
        <Text style={styles.goldText}>💰 {currentPlayer.gold} 골드</Text>
      </View>

      {/* 명성 바 */}
      <View style={styles.reputationBar}>
        <View style={styles.repItem}>
          <Text style={styles.repLabel}>공포 (Fear)</Text>
          <View style={styles.repBarContainer}>
            <View style={[styles.repBarFill, { width: `${currentPlayer.reputation.fear}%`, backgroundColor: '#ef4444' }]} />
          </View>
          <Text style={styles.repValue}>{currentPlayer.reputation.fear}/100</Text>
        </View>
        <View style={styles.repItem}>
          <Text style={styles.repLabel}>정의 (Justice)</Text>
          <View style={styles.repBarContainer}>
            <View style={[styles.repBarFill, { width: `${currentPlayer.reputation.justice}%`, backgroundColor: '#3b82f6' }]} />
          </View>
          <Text style={styles.repValue}>{currentPlayer.reputation.justice}/100</Text>
        </View>
      </View>

      {/* 그리드 */}
      <View style={styles.grid}>
        <ScrollView 
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
          nestedScrollEnabled={true}
          showsVerticalScrollIndicator={false}
          scrollEnabled={true}
        >
          <View style={{ position: 'relative', width: '100%', minHeight: gameState.rows * 60 }}>
            {Array.from({ length: gameState.rows }, (_, row) => renderRow(row))}
          </View>
        </ScrollView>
      </View>

      {/* 액션 패널 */}
      {selected && (() => {
        const cell = gameState.cells.find(c => c.row === selected.row && c.col === selected.col);
        if (!cell || cell.owner !== 0) return null;
        
        const player = gameState.players.find(p => p.id === cell.owner);
        const canBuild = canStartFortConstruction(cell, player?.gold || 0);
        
        return (
          <View style={styles.actionPanel}>
            <Text style={styles.actionTitle}>선택된 유닛: {cell.unitCount}명</Text>
            {cell.building === 'fort' && cell.fortState && typeof cell.fortState !== 'string' && (
              <View style={styles.fortInfo}>
                <Text style={styles.fortInfoText}>
                  요새 건설: {cell.fortState.stage === 'complete' ? '완료' : `단계 ${cell.fortState.stage}`}
                </Text>
              </View>
            )}
            {canBuild.canBuild && (
              <TouchableOpacity
                style={[styles.button, { marginTop: 8 }]}
                onPress={() => {
                  setGameState(prev => {
                    const newCells = [...prev.cells];
                    const newPlayers = [...prev.players];
                    const cellIdx = newCells.findIndex(c => c.id === cell.id);
                    const playerIdx = newPlayers.findIndex(p => p.id === cell.owner);
                    
                    if (cellIdx === -1 || playerIdx === -1) return prev;
                    
                    const targetCell = { ...newCells[cellIdx] };
                    const targetPlayer = { ...newPlayers[playerIdx] };
                    
                    if (targetPlayer.gold >= FORT_BUILD_COST) {
                      const result = startFortConstruction(targetCell);
                      targetPlayer.gold -= FORT_BUILD_COST;
                      
                      newCells[cellIdx] = result.updatedCell;
                      newPlayers[playerIdx] = targetPlayer;
                      
                      console.log(`🏗️ 요새 건설 시작! (${targetCell.row}, ${targetCell.col})`);
                      setSelected(null);
                    }
                    
                    return { ...prev, cells: newCells, players: newPlayers };
                  });
                }}
              >
                <Text style={styles.buttonText}>요새 건설 ({FORT_BUILD_COST}G)</Text>
              </TouchableOpacity>
            )}
            {!canBuild.canBuild && canBuild.reason && (
              <Text style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>
                {canBuild.reason}
              </Text>
            )}
          </View>
        );
      })()}

      {/* 푸터 */}
      <View style={styles.footer}>
        <View style={styles.footerButtons}>
          <TouchableOpacity
            style={[styles.button, styles.endTurnButton]}
            onPress={() => {
              setGameState(prev => ({
                ...prev,
                turn: prev.turn + 1,
                currentPlayer: prev.currentPlayer === 0 ? 1 : 0,
              }));
              setSelected(null);
            }}
          >
            <Text style={styles.buttonText}>턴 종료</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.resetButton]}
            onPress={() => {
              setGameState(createInitialGameState(7, 7, 5));
              setSelected(null);
            }}
          >
            <Text style={styles.buttonText}>리셋</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.difficultyText}>난이도: {difficulty}</Text>
      </View>

      {/* 전투 모달 */}
      {combatModal && (
        <CombatModal
          visible={combatModal.visible}
          attackerUnits={combatModal.attacker.unitCount}
          defenderUnits={combatModal.defender.unitCount}
          onFight={handleFight}
          onRetreat={handleRetreat}
          onSurrender={handleSurrender}
          onClose={() => setCombatModal(null)}
        />
      )}

      {/* 용병 모달 */}
      {mercenaryModal && (() => {
        const player = gameState.players.find(p => p.id === mercenaryModal.attacker.owner);
        const costs = calculateHireCost(mercenaryModal.mercenary, player?.reputation.justice || 50);
        return (
          <MercenaryModal
            visible={mercenaryModal.visible}
            mercenaryCount={mercenaryModal.mercenary.unitCount}
            playerGold={player?.gold || 0}
            playerFear={player?.reputation.fear || 50}
            playerJustice={player?.reputation.justice || 50}
            temporaryCost={costs.temporary}
            permanentCost={costs.permanent}
            discount={costs.discount}
            autoJoin={mercenaryModal.autoJoin}
            autoJoinMessage={mercenaryModal.autoJoinMessage}
            onRetreat={handleDeclineAutoJoin}
            onFight={handleDeclineAutoJoin}
            onHireTemporary={handleAcceptAutoJoin}
            onHirePermanent={handleAcceptAutoJoin}
            onAcceptAutoJoin={handleAcceptAutoJoin}
            onDeclineAutoJoin={handleDeclineAutoJoin}
          />
        );
      })()}

      {/* 이벤트 모달 */}
      {showEventsModal && (
        <Modal visible={showEventsModal} transparent animationType="slide" onRequestClose={() => setShowEventsModal(false)}>
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowEventsModal(false)}
          >
            <TouchableOpacity 
              style={styles.eventsModal}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
            <Text style={styles.modalTitle}>턴 이벤트</Text>
            <ScrollView style={styles.eventsList}>
              {turnEvents.map((event, idx) => (
                <View key={idx} style={styles.eventItem}>
                  <Text style={styles.eventIcon}>
                    {event.type === 'merchant-spawn' || event.type === 'merchant-move' || event.type === 'merchant-arrive' ? '🚚' : '⚔️'}
                  </Text>
                  <Text style={styles.eventMessage}>{event.message}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.closeEventButton} onPress={() => setShowEventsModal(false)}>
              <Text style={styles.buttonText}>확인</Text>
            </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* 목적지 선택 모달 */}
      <DestinationSelectModal
        visible={showDestinationModal}
        destinations={destinationCandidates}
        merchant={selectedMerchant}
        gameState={gameState}
        onSelect={handleMerchantDestination}
        onClose={() => {
          setShowDestinationModal(false);
          setSelectedMerchant(null);
        }}
      />
    </View>
  );
}

