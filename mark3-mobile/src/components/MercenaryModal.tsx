import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface MercenaryModalProps {
  visible: boolean;
  mercenaryCount: number;
  playerGold: number;
  playerFear: number;
  playerJustice: number;
  temporaryCost: number;
  permanentCost: number;
  discount: number;
  autoJoin?: boolean;
  autoJoinMessage?: string;
  onRetreat: () => void;
  onFight: () => void;
  onHireTemporary: () => void;
  onHirePermanent: () => void;
  onAcceptAutoJoin: () => void;
  onDeclineAutoJoin: () => void;
}

const MercenaryModal: React.FC<MercenaryModalProps> = ({
  visible,
  mercenaryCount,
  playerGold,
  temporaryCost,
  permanentCost,
  autoJoin,
  autoJoinMessage,
  onRetreat,
  onFight,
  onHireTemporary,
  onHirePermanent,
  onAcceptAutoJoin,
  onDeclineAutoJoin,
}) => {
  if (!visible) return null;

  if (autoJoin && autoJoinMessage) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onDeclineAutoJoin}>
        <View style={styles.overlay}>
          <View style={styles.container}>
            <Text style={styles.title}>용병 합류</Text>
            <Text style={styles.message}>{autoJoinMessage}</Text>
            <TouchableOpacity style={styles.button} onPress={onAcceptAutoJoin}>
              <Text style={styles.buttonText}>수락</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.button} onPress={onDeclineAutoJoin}>
              <Text style={styles.buttonText}>거절</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDeclineAutoJoin}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>용병 고용</Text>
          <Text style={styles.info}>용병 수: {mercenaryCount}명</Text>
          <Text style={styles.info}>보유 골드: {playerGold}💰</Text>
          <TouchableOpacity 
            style={[styles.button, playerGold < temporaryCost && styles.disabledButton]} 
            onPress={onHireTemporary}
            disabled={playerGold < temporaryCost}
          >
            <Text style={styles.buttonText}>임시 고용 ({temporaryCost}💰)</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.button, playerGold < permanentCost && styles.disabledButton]} 
            onPress={onHirePermanent}
            disabled={playerGold < permanentCost}
          >
            <Text style={styles.buttonText}>영구 고용 ({permanentCost}💰)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={onRetreat}>
            <Text style={styles.buttonText}>후퇴</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={onFight}>
            <Text style={styles.buttonText}>전투</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    padding: 24,
    width: '80%',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    color: '#aaa',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  info: {
    color: '#aaa',
    fontSize: 16,
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#3b82f6',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#666',
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default MercenaryModal;

