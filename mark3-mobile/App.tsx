import React, { Suspense, lazy } from 'react';
import { StatusBar } from 'expo-status-bar';
import { RealmLoading } from './src/screens/RealmMenu';
const GameScreen = lazy(() => import('./src/screens/GameScreen'));
const RealmArtReview = lazy(() => import('./src/screens/RealmArtReview'));

export default function App() {
  return (
    <>
      <Suspense fallback={<RealmLoading />}>{typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('art')==='1'?<RealmArtReview/>:<GameScreen />}</Suspense>
      <StatusBar style="light" />
    </>
  );
}

