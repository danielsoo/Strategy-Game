import type {Ground,V3} from './medievalScene';
import {realmRandom as random,settlementPlan} from './realmLayout';

export interface CityPlacement{asset:string;x:number;z:number;scale:V3;yaw:number}
/** 전투 상태가 아닌 기억된 정착지와 좌표에서만 시가지를 만든다. */
export function cityLayout(g:Ground):CityPlacement[]{
  if(!g.known)return [];
  const {kind,seed,yaw}=settlementPlan(g),out:CityPlacement[]=[];
  const place=(asset:string,x:number,z:number,width:number,angle=0,sy=width,sz=width)=>out.push({asset:'caro_'+asset,x:x*Math.cos(yaw)+z*Math.sin(yaw),z:-x*Math.sin(yaw)+z*Math.cos(yaw),scale:[width,sy,sz],yaw:yaw+angle});
  if(!g.castle){
    if(g.terrain==='plain'&&random(seed)>.48){place('farmstead',-.27,-.14,.23);place('house_02',-.37,.12,.14,.35);if(random(seed+3)>.55)place('storehouse',-.1,-.16,.13,Math.PI/2);}
    return out;
  }
  if(kind==='citadel'){place('church',.27,-.20,.39);place('market',.03,.24,.33);}
  else if(kind==='abbey'){place('abbey',-.10,-.21,.60);place('church',-.25,.16,.30);place('market',.23,.25,.27);}
  else{place('longhouse',.25,-.13,.30);place('market',.06,.26,.28);}
  const house=(x:number,z:number,i:number,angle:number)=>{
    const asset=i%7===0?'longhouse':i%2?'house_01':'house_02';place(asset,x,z,.17+random(seed+i*13)*.035,angle+(random(seed+i*17)-.5)*.42);
  };
  // 길을 따라 밀집한 시가지. 성벽 안에 상업지와 주택을 둔다.
  for(let ring=0;ring<2;ring++)for(let i=0;i<(ring?22:15);i++){
    const a=i/(ring?22:15)*Math.PI*2+.12*random(seed+i),r=ring?.74:.51;
    house(Math.cos(a)*r,Math.sin(a)*r,i+ring*23,-a+Math.PI/2);
  }
  // 성문 밖에는 농장과 여관을 드문드문 연결한다.
  for(let i=0;i<9;i++){const side=i%2?1:-1;house(side*(.24+random(seed+i)*.2),.95+Math.floor(i/2)*.13,i+72,side*Math.PI/2);}
  place('blacksmith',-.34,.05,.21,.5);place('stable',.33,.40,.19,-.7);
  return out;
}
