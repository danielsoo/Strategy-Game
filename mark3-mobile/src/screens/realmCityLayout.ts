import type {Ground,V3} from './medievalScene';
import {realmRandom as random,settlementPlan} from './realmLayout';

export interface CityPlacement{asset:string;x:number;z:number;scale:V3;yaw:number}
/** 전투 상태가 아닌 기억된 정착지와 좌표에서만 시가지를 만든다. */
export function cityLayout(g:Ground):CityPlacement[]{
  if(!g.known)return [];
  const {kind,seed,yaw,outline}=settlementPlan(g),out:CityPlacement[]=[];
  const place=(asset:string,x:number,z:number,width:number,angle=0,sy=width,sz=width)=>out.push({asset:'caro_'+asset,x:x*Math.cos(yaw)+z*Math.sin(yaw),z:-x*Math.sin(yaw)+z*Math.cos(yaw),scale:[width,sy,sz],yaw:yaw+angle});
  if(!g.castle){
    if(g.terrain==='plain'&&random(seed)>.48){place('farmstead',-.27,-.14,.23);place('house_02',-.37,.12,.14,.35);if(random(seed+3)>.55)place('storehouse',-.1,-.16,.13,Math.PI/2);}
    return out;
  }
  if(kind==='citadel'){place('fortress_struct_02',-.15,-.23,.49);place('church',.27,-.20,.39);place('market',.03,.24,.33);}
  else if(kind==='abbey'){place('abbey',-.10,-.21,.60);place('church',-.25,.16,.30);place('market',.23,.25,.27);}
  else{place('fortress_struct',-.16,-.23,.53);place('longhouse',.25,-.13,.30);place('market',.06,.26,.28);}
  const house=(x:number,z:number,i:number,angle:number)=>{
    const asset=i%7===0?'longhouse':i%2?'house_01':'house_02';place(asset,x,z,.17+random(seed+i*13)*.035,angle+(random(seed+i*17)-.5)*.42);
  };
  // 외벽 안의 좁은 가로와 성 밖의 불규칙한 주거 구획.
  for(let i=0;i<10;i++){const side=i%2?1:-1,row=Math.floor(i/2);house(side*.43,-.30+row*.17,i,side*Math.PI/2);}
  for(let i=0;i<28;i++){
    const side=i%2?1:-1,row=Math.floor(i/4),lane=Math.floor(i/2)%2;
    const x=side*(.76+lane*.23)+(random(seed+i*7)-.5)*.06,z=-.70+row*.24+(random(seed+i*5)-.5)*.05;
    house(x,z,i+17,side*Math.PI/2);
  }
  place('blacksmith',-.71,-.48,.24,.5);place('stable',.76,-.32,.23,-.7);place('storehouse',-.60,.51,.20,Math.PI/2);
  outline.forEach(([ax,az],i)=>{
    const [bx,bz]=outline[(i+1)%outline.length],length=Math.hypot(bx-ax,bz-az),angle=-Math.atan2(bz-az,bx-ax);
    const wall=(from:number,to:number)=>{const n=Math.ceil(length*(to-from)/.34);for(let k=0;k<n;k++){const t=from+(to-from)*(k+.5)/n;place('wall_long',ax+(bx-ax)*t,az+(bz-az)*t,length*(to-from)/n+.008,angle,.22,.25);}};
    if(i===0){const gap=.30/length;wall(0,.5-gap/2);wall(.5+gap/2,1);place('wall_gate',(ax+bx)/2,(az+bz)/2,.31,angle,.22,.25);}
    else wall(0,1);
    place('wall_tower',ax,az,.068,angle,.051,.068);
  });
  return out;
}
