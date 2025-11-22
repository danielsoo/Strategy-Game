import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface CombatModalProps {
  visible: boolean;
  attackerUnits: number;
  defenderUnits: number;
  onFight: () => void;
  onRetreat: () => void;
  onSurrender: () => void;
  onClose: () => void;
}

const CombatModal: React.FC<CombatModalProps> = ({
  visible,
  attackerUnits,
  defenderUnits,
  onFight,
  onRetreat,
  onSurrender,
  onClose,
}) => {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>전투</Text>
          <Text style={styles.info}>공격자: {attackerUnits}명</Text>
          <Text style={styles.info}>수비자: {defenderUnits}명</Text>
          <TouchableOpacity style={styles.button} onPress={onFight}>
            <Text style={styles.buttonText}>전투</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={onRetreat}>
            <Text style={styles.buttonText}>후퇴</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={onSurrender}>
            <Text style={styles.buttonText}>항복</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>닫기</Text>
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
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default CombatModal;

