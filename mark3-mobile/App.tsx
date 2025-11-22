import React from 'react';
import { StatusBar } from 'expo-status-bar';
import GameScreen from './src/screens/GameScreen';

export default function App() {
  return (
    <>
      <GameScreen />
      <StatusBar style="light" />
    </>
  );
}

