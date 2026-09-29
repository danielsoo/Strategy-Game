import React from 'react';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle, G, Line } from 'react-native-svg';

/** 해상도에 관계없이 선명한 왕국 전경. UI와 독립된 장식이라 입력을 가로채지 않는다. */
export default function RealmBackdrop() {
  return <Svg width="100%" height="100%" viewBox="0 0 700 800" preserveAspectRatio="xMidYMid slice">
    <Defs><LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#263c39"/><Stop offset=".65" stopColor="#809082"/><Stop offset="1" stopColor="#162823"/></LinearGradient>
      <LinearGradient id="veil" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#10201c" stopOpacity=".3"/><Stop offset=".7" stopColor="#111a19" stopOpacity="0"/><Stop offset="1" stopColor="#111a19"/></LinearGradient></Defs>
    <Rect width="700" height="800" fill="url(#sky)"/>
    <Circle cx="493" cy="239" r="98" fill="#e4d8b1" opacity=".16"/>
    <Circle cx="493" cy="239" r="66" fill="#e4d8b1" opacity=".14"/>
    <Path d="M0 440L90 322 145 370 239 256 342 380 407 297 508 384 620 267 700 374V800H0Z" fill="#60776c"/>
    <Path d="M0 486L125 407 213 464 334 374 410 424 553 358 700 449V800H0Z" fill="#3e5c50"/>
    <Path d="M0 577Q170 530 278 426Q359 374 461 452Q575 548 700 522V800H0Z" fill="#293f34"/>
    <G fill="#a5aa8b" stroke="#344a3c" strokeWidth="3">
      <Path d="M236 467V397H254V385H272V397H292V385H311V397H330V385H349V397H369V385H388V397H408V385H427V397H445V478Z"/>
      <Path d="M285 425V309H344V425Z"/><Path d="M349 433V286H394V435Z"/>
      <Path d="M207 489V363H254V489Z"/><Path d="M423 485V363H470V491Z"/>
      <Path d="M296 309L315 266 335 309Z" fill="#354b44"/><Path d="M343 286L372 230 400 286Z" fill="#354b44"/>
      <Path d="M200 363L230 316 261 363Z" fill="#354b44"/><Path d="M415 363L447 316 479 363Z" fill="#354b44"/>
      <Path d="M277 476V431H390V487Z"/>
    </G>
    <Path d="M320 485V459Q339 424 358 459V492Z" fill="#26382d"/>
    <Path d="M333 488V461Q340 448 348 461V490Z" fill="#c1a46b" opacity=".7"/>
    {[225,442,309,367].map((x,i)=><G key={x}><Rect x={x} y={i<2?390:329} width="9" height="22" fill="#354534"/><Line x1={x+5} y1={i<2?316:236} x2={x+5} y2={i<2?285:195} stroke="#cbb783" strokeWidth="2"/><Path d={`M${x+6} ${i<2?285:195}l27 4-8 12-19-3Z`} fill={i%2?'#a58153':'#6a3430'}/></G>)}
    <Path d="M331 490Q315 530 400 566T361 692L440 800H218L280 690Q345 625 336 609T302 556Q287 512 321 489" fill="#968667" opacity=".6"/>
    {Array.from({length:22},(_,i)=>{const x=(i*83)%720-15,y=535+(i%5)*40,s=30+(i%4)*12;return <G key={i} fill={i%2?'#182e25':'#21392c'}><Path d={`M${x} ${y-s*2}l${-s} ${s*2}h${s*.5}l${-s*.7} ${s*.7}h${s*2.4}l${-s*.7} ${-s*.7}h${s*.5}Z`}/><Rect x={x-3} y={y} width="6" height="36"/></G>})}
    <Rect width="700" height="800" fill="url(#veil)"/>
    <Rect x="24" y="24" width="652" height="752" rx="2" fill="none" stroke="#d3bc86" strokeOpacity=".3"/>
    <Path d="M38 90V38H90M610 38H662V90M38 710V762H90M610 762H662V710" fill="none" stroke="#d3bc86" strokeOpacity=".5"/>
  </Svg>;
}
