import type {Ground,Shape,V3} from './medievalScene';
import {realmRandom as random,settlementPlan} from './realmLayout';

type Emit=(shape:Shape,x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string,rotation?:V3)=>void;
export function buildSettlement(g:Ground,emit:Emit){
  const plan=settlementPlan(g),{kind,seed,yaw,roof,stone}=plan;
  const add:Emit=(shape,x,y,z,sx,sy,sz,color,rotation=[0,0,0])=>emit(shape,x*Math.cos(yaw)+z*Math.sin(yaw),y,-x*Math.sin(yaw)+z*Math.cos(yaw),sx,sy,sz,color,[rotation[0],rotation[1]+yaw,rotation[2]]);
  const block=(x:number,y:number,z:number,w:number,h:number,d:number,color=stone)=>add('stone',x,y,z,w,h,d,color);
  const window=(x:number,y:number,z:number,w=.025,h=.049)=>add('box',x,y,z,w,h,.009,'#202726');
  const battlement=(x:number,z:number,w:number,d:number,h:number)=>{
    block(x,h/2,z,w,h,d);
    const count=Math.max(4,Math.round(w/.045));for(let i=0;i<count;i++)for(const side of [-1,1]){block(x-w/2+w*i/(count-1),h+.012,z+side*d/2,.024,.026,.024);block(x+side*w/2,h+.012,z-d/2+d*i/(count-1),.024,.026,.024);}
    for(const y of [h*.40,h*.73])for(const dx of [-.085,.085])window(x+dx,y,z+d/2+.006);
  };
  if(kind==='citadel'){
    // 주탑은 수평 흉벽과 계단식 석조 건물로 구성한다.
    battlement(-.20,-.26,.31,.32,.43);battlement(-.35,-.40,.13,.13,.55);
    block(.14,.13,-.31,.31,.26,.23);add('hipRoof',.14,.31,-.31,.36,.12,.28,roof);
    block(.30,.08,-.03,.17,.16,.20);add('roof',.30,.21,-.03,.14,.10,.16,roof);
  }else if(kind==='abbey'){
    for(const [tx,tz] of plan.outline)battlement(tx,tz,.115,.115,.26);
    block(-.19,.13,-.23,.24,.26,.49);add('roof',-.19,.34,-.23,.19,.16,.38,roof);
    block(-.19,.15,-.22,.48,.30,.16);add('roof',-.19,.37,-.22,.15,.14,.36,roof,[0,Math.PI/2,0]);
    battlement(-.19,-.02,.14,.16,.51);add('cone',-.19,.65,-.02,.11,.27,.11,'#687777');
    for(let j=0;j<5;j++)for(const side of [-1,1])block(.13+j*.064,.09,side*.14-.27,.016,.18,.019);
    for(const side of [-1,1]){block(.25,.19,side*.14-.27,.33,.03,.045);add('roof',.25,.23,side*.14-.27,.27,.06,.065,roof,[0,Math.PI/2,0]);}
  }else{
    block(.14,.12,-.18,.20,.24,.39);add('roof',.14,.32,-.18,.16,.17,.31,'#81766a');
    for(let i=0;i<4;i++)add('timber',-.19+i*.11,.055,.03,.014,.11,.016,'#756047');
    add('timber',-.03,.12,.03,.40,.022,.023,'#756047');
  }
  // 가로를 따라 구획·층수·박공지붕과 모임지붕을 달리한다.
  const house=(x:number,z:number,w:number,d:number,h:number,angle:number,id:number)=>{
    const local:Emit=(shape,dx,y,dz,sx,sy,sz,color,rot=[0,0,0])=>add(shape,x+dx*Math.cos(angle)+dz*Math.sin(angle),y,z-dx*Math.sin(angle)+dz*Math.cos(angle),sx,sy,sz,color,[rot[0],rot[1]+angle,rot[2]]);
    const timber=id%3!==0,wall=timber?['#d2c7ae','#b9b09b','#d6d0bb'][id%3]:stone;
    local(timber?'plaster':'stone',0,h/2,0,w,h,d,wall);
    local(id%4===0?'hipRoof':'roof',0,h+.04,0,id%4===0?w*1.1:w*.78,.09+random(id+seed)*.04,id%4===0?d*1.1:d*.78,id%3===0?'#9c7f67':roof);
    if(timber){for(const dx of [-w*.46,0,w*.46])local('timber',dx,h/2,d*.507,.007,h,.006,'#625442');
      for(const y of [.026,h*.52,h])local('timber',0,y,d*.511,w,.008,.007,'#625442');
      local('timber',w*.23,h*.73,d*.516,.007,h*.44,.007,'#625442',[0,0,-.55]);}
    local('box',-.025,.04,d*.514,.026,.08,.008,'#463c30');
    for(let i=0;i<(h>.18?2:1);i++)for(const dx of [-w*.25,w*.25])local('box',dx,.11+i*.08,d*.515,.025,.036,.009,'#29312e');
    if(id%3===0)local('stone',w*.27,h+.10,-d*.22,.025,.14,.026,'#a79780');
    if(id%5===0){local('box',0,.095,d*.78,w*.85,.016,.09,'#b3a17b',[-.18,0,0]);for(const dx of [-w*.38,w*.38])local('timber',dx,.042,d*.97,.008,.084,.008,'#65543d');}
  };
  for(let i=0;i<12;i++){
    const side=i%2?1:-1,row=Math.floor(i/2),x=side*(.28+random(seed+i)*.05),z=.01+row*.085;
    if(kind==='abbey'&&row<2||kind==='march'&&row<1)continue;
    house(x,z,.10+random(seed+i*7)*.055,.085+random(seed+i*3)*.035,.10+random(seed+i*11)*.12,side*Math.PI/2,i);
  }
  for(let i=0;i<(kind==='march'?12:22);i++){
    const side=i%2?1:-1,row=Math.floor(i/2),x=side*(.67+random(seed+i*13)*.13),z=-.50+row*.106;
    house(x,z,.09+random(seed+i*19)*.07,.12+random(seed+i*29)*.04,.08+random(seed+i*17)*.12,side*Math.PI/2,i+31);
  }
  // 우물과 짐을 쌓아 둔 작은 중정.
  add('tower',.055,.045,.16,.04,.09,.04,'#b8b09c');add('trunk',.055,.12,.16,.005,.15,.005,'#736047');
  add('roof',.055,.21,.16,.062,.055,.052,roof);
  for(let i=0;i<3;i++)add('timber',-.14+i*.028,.028,.33,.025,.055,.039,'#a18b69');
  const poleX=kind==='march'?-.19:-.20,poleZ=kind==='abbey'?-.02:-.26,height=kind==='abbey'?.8:kind==='march'?.58:.58;
  add('trunk',poleX,height+.09,poleZ,.003,.19,.003,'#9d8e6c');
  add('flag',poleX+.057,height+.15,poleZ,.115,.068,1,g.heraldry);
}
