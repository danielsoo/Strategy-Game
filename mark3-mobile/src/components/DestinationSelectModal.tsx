import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, TouchableWithoutFeedback } from 'react-native';
import { Cell, GameState } from '../models/GameState';
import { calculateExpectedProfit } from '../services/merchantSystem';

interface DestinationSelectModalProps {
  visible: boolean;
  destinations: Cell[];
  merchant: Cell | null;
  gameState: GameState;
  onSelect: (cell: Cell) => void;
  onClose: () => void;
}

const DestinationSelectModal: React.FC<DestinationSelectModalProps> = ({ 
  visible, 
  destinations, 
  merchant,
  gameState,
  onSelect, 
  onClose 
}) => {
  // 출발지 정보 찾기
  const originCastle = merchant ? gameState.cells.find(c => 
    c.building === 'castle' && 
    c.owner === merchant.merchantOwner
  ) : null;
  
  const originName = originCastle 
    ? `${merchant?.merchantOwner === 0 ? '당신' : 'AI'}의 본진`
    : '알 수 없음';

  if (!visible) return null;
  
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity 
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity 
          style={styles.container}
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={styles.title}>무역 목적지 선택</Text>
          
          {merchant && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>출발지: {originName}</Text>
              <Text style={styles.infoText}>운반 골드: {merchant.merchantGold || 50}💰</Text>
            </View>
          )}
          
          <ScrollView style={styles.list}>
            {destinations.map(cell => {
              if (!merchant) return null;
              
              const profit = calculateExpectedProfit(merchant, cell, gameState);
              const destinationName = cell.building === 'castle' 
                ? `${cell.owner === 0 ? '당신' : 'AI'}의 본진`
                : `${cell.owner === 0 ? '당신' : 'AI'}의 요새 (${cell.row},${cell.col})`;
              
              return (
                <TouchableOpacity 
                  key={`${cell.row},${cell.col}`} 
                  style={styles.item} 
                  onPress={() => onSelect(cell)}
                >
                  <Text style={styles.destinationName}>{destinationName}</Text>
                  <View style={styles.profitInfo}>
                    <Text style={styles.profitLabel}>거리: {profit.distance}칸</Text>
                    <Text style={styles.profitLabel}>총 수익: {profit.grossProfit}💰</Text>
                    <Text style={styles.taxText}>
                      세금 ({profit.ownerName} {Math.floor(profit.taxAmount / profit.grossProfit * 100)}%): -{profit.taxAmount}💰
                    </Text>
                    <Text style={styles.netProfitText}>
                      순 수익: <Text style={styles.netProfitValue}>+{profit.netProfit}💰</Text>
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>닫기</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  infoText: {
    color: '#aaa',
    fontSize: 13,
    marginBottom: 4,
  },
  list: {
    marginBottom: 10,
  },
  item: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3a',
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    marginBottom: 8,
  },
  destinationName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  profitInfo: {
    marginTop: 4,
  },
  profitLabel: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 2,
  },
  taxText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 2,
  },
  netProfitText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 6,
  },
  netProfitValue: {
    color: '#10b981',
    fontSize: 16,
  },
  closeButton: {
    marginTop: 12,
    alignSelf: 'center',
    padding: 12,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default DestinationSelectModal;

