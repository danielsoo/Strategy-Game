import React from 'react';
import { View, Text, ScrollView, StyleSheet, useWindowDimensions, TouchableOpacity, ActivityIndicator } from 'react-native';
import RealmBackdrop from './RealmBackdrop';
import { realm } from './realmTheme';

export function RealmLoading() {
  return <View style={s.loading}><View style={StyleSheet.absoluteFill}><RealmBackdrop/></View>
    <Text style={s.kicker}>CHRONICLE OF CROWNS</Text><Text style={s.title}>왕국 연대기</Text>
    <ActivityIndicator color={realm.gold} size="large" style={{marginTop:32}}/><Text style={s.caption}>왕국의 지도를 펼치고 있습니다</Text></View>;
}

export default function RealmMenu({children,inMatch,onSettings}:{children:React.ReactNode;inMatch:boolean;onSettings:()=>void}) {
  const {width,height}=useWindowDimensions();
  const desktop=width>=960 && height>=600;
  return <View style={s.shell}><ScrollView style={{flex:1}} contentContainerStyle={[s.layout,desktop&&s.desktop]}>
    <View style={[s.art,desktop?{flex:1,minHeight:height-64}:{height:height<500?180:270}]}>
      <View style={StyleSheet.absoluteFill}><RealmBackdrop/></View>
      <View style={[s.identity,desktop&&{top:70,left:48,right:48}]}>
        <Text style={s.kicker}>CHRONICLE OF CROWNS</Text><Text style={[s.title,!desktop&&{fontSize:34} ]}>왕국 연대기</Text>
        <View style={s.rule}/><Text style={s.tagline}>당신의 선택이 왕국의 역사가 됩니다.</Text>
      </View>
      {desktop&&<View style={s.artFooter}><Text style={s.verse}>칼로 지킬 것인가.{ '\n' }맹약으로 이을 것인가.</Text><Text style={s.caption}>영토 · 외교 · 왕국의 기억</Text></View>}
    </View>
    <View style={[s.content,desktop&&{width:460,padding:32}]}>
      <View style={s.topline}><Text style={s.kicker}>{inMatch?'왕의 집무실':'새로운 연대기'}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="설정 열기" onPress={onSettings} style={s.settings}><Text style={s.settingsText}>설정</Text></TouchableOpacity></View>
      {children}
      <Text style={s.footnote}>왕국의 기억 · 오케스트라 주제곡</Text>
    </View>
  </ScrollView></View>;
}
const s=StyleSheet.create({
  shell:{flex:1,backgroundColor:realm.background},layout:{flexGrow:1,padding:12},desktop:{flexDirection:'row',padding:32,gap:24,alignItems:'stretch'},
  art:{overflow:'hidden',borderWidth:1,borderColor:realm.border},identity:{position:'absolute',top:30,left:28,right:28},
  kicker:{fontSize:10,letterSpacing:2.4,color:realm.gold,fontWeight:'600'},title:{fontFamily:realm.serif,fontSize:48,color:realm.text,marginTop:14,letterSpacing:3},
  rule:{width:44,height:1,backgroundColor:realm.gold,marginVertical:18},tagline:{fontSize:13,lineHeight:22,color:realm.text},
  artFooter:{position:'absolute',bottom:45,left:48},verse:{fontFamily:realm.serif,fontSize:25,lineHeight:40,color:realm.text},caption:{color:realm.gold,fontSize:12,marginTop:14},
  content:{padding:20,backgroundColor:realm.panel,borderWidth:1,borderColor:realm.border},topline:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:16},
  settings:{minWidth:60,minHeight:44,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:realm.border},settingsText:{color:realm.text,fontSize:13},
  footnote:{color:realm.muted,fontSize:11,marginTop:24,paddingTop:16,borderTopWidth:1,borderTopColor:realm.border},
  loading:{flex:1,backgroundColor:realm.background,justifyContent:'center',alignItems:'center'},
});
