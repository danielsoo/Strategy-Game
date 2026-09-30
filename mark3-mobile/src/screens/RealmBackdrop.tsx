import React from 'react';
import {Image,StyleSheet,View} from 'react-native';
import Svg,{Defs,LinearGradient,Stop,Rect,Path} from 'react-native-svg';

/** 생성 시안 대신 실제 게임 렌더러에서 캡처한 성곽을 사용한다. */
export default function RealmBackdrop(){
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Image source={{uri:'/realm/kingdom-view.png'}} resizeMode="cover" style={StyleSheet.absoluteFill} accessible={false}/>
    <Svg width="100%" height="100%" viewBox="0 0 700 800" preserveAspectRatio="none">
      <Defs><LinearGradient id="realm-veil" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#101d1b" stopOpacity=".82"/>
        <Stop offset=".45" stopColor="#17231f" stopOpacity=".12"/>
        <Stop offset="1" stopColor="#101918" stopOpacity=".85"/>
      </LinearGradient></Defs>
      <Rect width="700" height="800" fill="url(#realm-veil)"/>
      <Rect x="24" y="24" width="652" height="752" fill="none" stroke="#d3bc86" strokeOpacity=".3"/>
      <Path d="M38 90V38H90M610 38H662V90M38 710V762H90M610 762H662V710" fill="none" stroke="#d3bc86" strokeOpacity=".5"/>
    </Svg>
  </View>;
}
