import * as T from 'three';

export const ARROW_LENGTH=.935,GRAVITY=9.81;
export function arrowFlight(origin:T.Vector3,target:T.Vector3){
 const distance=Math.hypot(target.x-origin.x,target.z-origin.z);
 // A close shot is nearly flat. At long range the archer deliberately lofts it.
 const loft=T.MathUtils.smoothstep(distance,8,18)*3.8;
 const duration=Math.max(.08,(distance-ARROW_LENGTH)/24,Math.sqrt(8*loft/GRAVITY));
 const velocity=new T.Vector3(),end=target.clone();
 for(let i=0;i<10;i++){
  velocity.copy(end).sub(origin).divideScalar(duration);velocity.y+=GRAVITY*duration/2;
  const incoming=velocity.clone().add(new T.Vector3(0,-GRAVITY*duration,0)).normalize();
  end.copy(target).addScaledVector(incoming,-ARROW_LENGTH);
 }
 velocity.copy(end).sub(origin).divideScalar(duration);velocity.y+=GRAVITY*duration/2;
 return {origin:origin.clone(),velocity,duration};
}
export function arrowPose(flight:ReturnType<typeof arrowFlight>,time:number){
 const t=T.MathUtils.clamp(time,0,flight.duration),position=flight.origin.clone().addScaledVector(flight.velocity,t);
 position.y-=GRAVITY*t*t/2;
 const direction=flight.velocity.clone();direction.y-=GRAVITY*t;direction.normalize();
 return {position,direction};
}
