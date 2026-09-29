import React, { Suspense, lazy } from 'react';
import { StatusBar } from 'expo-status-bar';
import { RealmLoading } from './src/screens/RealmMenu';
const GameScreen = lazy(() => import('./src/screens/GameScreen'));

export default function App() {
  return (
    <>
      <Suspense fallback={<RealmLoading />}><GameScreen /></Suspense>
      <StatusBar style="light" />
    </>
  );
}

