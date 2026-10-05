import React, { Suspense, lazy } from 'react';
import { StatusBar } from 'expo-status-bar';
import { RealmLoading } from './src/screens/RealmMenu';
const GameScreen = lazy(() => import('./src/screens/GameScreen'));
const RealmArtReview = lazy(() => import('./src/screens/RealmArtReview'));
const RealmMocapReview = lazy(() => import('./src/screens/RealmMocapReview'));

export default function App() {
  return (
    <>
      <Suspense fallback={<RealmLoading />}>{typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('art')==='1'?(new URLSearchParams(window.location.search).get('mocap')==='1'?<RealmMocapReview/>:<RealmArtReview/>):<GameScreen />}</Suspense>
      <StatusBar style="light" />
    </>
  );
}

