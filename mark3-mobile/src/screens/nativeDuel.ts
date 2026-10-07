import * as T from 'three';
import {GLTF} from 'three/examples/jsm/loaders/GLTFLoader';
import {clone} from 'three/examples/jsm/utils/SkeletonUtils';
import {CombatModel,NativeClip} from './nativeCombatModels';
import {createNativeWeapon,NativeWeaponKind,nativeWeaponClip} from './nativeWeaponRig';
import {nativeDeathGround} from './nativeDeathGround';
import {capturedGrip} from './nativeWeaponRig';
import {arrowFlight,arrowPose} from './duelBallistics';

export type DuelSide=0|1;
export type DuelFighter={model:CombatModel;weapon:NativeWeaponKind};
export type DuelOutcome='block'|'hit'|'death'|'miss';
export type DuelEvent={attacker:DuelSide;outcome:DuelOutcome;heavy?:boolean;jump?:boolean;variation?:number};
type Pose={clip:NativeClip;time:number};
export const hasShield=(f:DuelFighter)=>f.model==='paladin'&&['sword','hatchet','flail'].includes(f.weapon);
const twoHand=(w:NativeWeaponKind)=>['axe','halberd','spear'].includes(w);
function idle(f:DuelFighter):NativeClip{return f.weapon==='bow'?'bowIdle':f.weapon==='spear'?'spearGuard':twoHand(f.weapon)?'twoIdle':hasShield(f)?'idle':'axeIdle';}
function defense(f:DuelFighter):NativeClip{return hasShield(f)?'guard':f.weapon==='spear'||twoHand(f.weapon)?'twoBlock':f.weapon==='bow'?'bowIdle':'axeBlock';}
function impact(f:DuelFighter):NativeClip{return f.weapon==='bow'?'bowImpact':twoHand(f.weapon)?'twoImpact':hasShield(f)?'impactHeavy':'axeImpactHeavy';}
function death(f:DuelFighter):NativeClip{return f.weapon==='bow'?'bowDeath':twoHand(f.weapon)?'twoDeath':'death';}
function attack(f:DuelFighter,e:DuelEvent):NativeClip{return f.weapon==='bow'?'bowVolley':f.weapon==='spear'?'spearThrust':twoHand(f.weapon)?e.jump?'twoJump':e.heavy?'twoChop':'twoSweep':f.weapon==='sword'?e.jump?'jumpHeavy':e.heavy?'heavy':e.variation===1?'cross':'slash':e.heavy?'axeChop':'axeSweep';}

/** Demo events are explicit, not random animation outcomes. The same player
 * accepts an event list derived from a resolved battle without rerolling it. */
export function duelEvents(winner:DuelSide,ranged:boolean):DuelEvent[]{
 if(ranged)return winner===0?[{attacker:0,outcome:'block'},{attacker:0,outcome:'hit'},{attacker:0,outcome:'death'}]:[{attacker:0,outcome:'block'},{attacker:0,outcome:'block'},{attacker:1,outcome:'death',heavy:true}];
 return [{attacker:0,outcome:'block'},{attacker:1,outcome:'block'},{attacker:1,outcome:'hit',heavy:true},{attacker:0,outcome:'block',heavy:true},{attacker:winner,outcome:'death',heavy:true,jump:true}];
}

/** Equipment is solved in actor space, then the whole actor is placed once.
 * This avoids applying world translation/rotation twice to attached weapons. */
export function createDuelActor(asset:GLTF,fighter:DuelFighter){
 const root=clone(asset.scene),visual=new T.Group();
 const animations=asset.animations.map(source=>{const clip=source.clone();for(const track of clip.tracks){if(track.name==='mixamorigHips.position'){for(let i=0;i<track.values.length;i+=3){track.values[i]=0;track.values[i+2]=0;}}}return clip;});
 root.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
 const mixer=new T.AnimationMixer(root),equipment=createNativeWeapon(root,fighter.weapon,animations),ground=nativeDeathGround(root);
 const clips=new Map(animations.map(c=>[c.name,c])),actions=new Map<NativeClip,T.AnimationAction>();
 for(const clip of animations){const name=clip.name as NativeClip,a=mixer.clipAction(nativeWeaponClip(animations,name,hasShield(fighter),fighter.weapon));a.play();a.paused=true;actions.set(name,a);}
 function duration(name:NativeClip){return clips.get(name)!.duration;}
 const sword=root.getObjectByName('Paladin_J_Nordstrom') as T.SkinnedMesh|undefined;
 const strike=new T.Vector3(),guard=new T.Vector3(),bodyTarget=new T.Vector3(),backTarget=new T.Vector3();
 let aimChest=root.getObjectByName('mixamorigSpine2')!;
 // Arissa retains FBX pre/post-rotation wrappers. Rotate their common chest
 // ancestor so the arms and fingers move together, not just the leaf bone.
 while(aimChest.parent?.name.startsWith('mixamorigSpine2_'))aimChest=aimChest.parent;
 const chestNative=aimChest.quaternion.clone();
 const trail=new T.Line(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(18*3),3)),new T.LineBasicMaterial({color:'#ddceac',transparent:true,opacity:.48,depthWrite:false}));trail.visible=false;trail.frustumCulled=false;visual.add(trail);
 function meshCenter(mesh:T.SkinnedMesh){mesh.skeleton.update();mesh.computeBoundingBox();return mesh.boundingBox!.getCenter(new T.Vector3()).applyMatrix4(mesh.matrixWorld);}
 function evaluate(pose:Pose,other:Pose={clip:idle(fighter),time:0},weight=1,aimDirection?:T.Vector3){
  visual.remove(root);if(equipment.prop)visual.remove(equipment.prop);
  // Restore only our bow-aim correction. Resetting everyone to bind pose
  // invalidates AnimationMixer's unchanged-property cache on repeated guards.
  if(fighter.weapon==='bow')aimChest.quaternion.copy(chestNative);
  for(const a of actions.values())a.setEffectiveWeight(0);
  const set=(p:Pose,w:number)=>{const a=actions.get(p.clip)!;a.enabled=true;a.paused=true;a.time=T.MathUtils.clamp(p.time,0,duration(p.clip)-.00001);a.setEffectiveWeight(w);};
  if(other.clip===pose.clip)set(pose,1);else{set(other,1-weight);set(pose,weight);}mixer.update(0);chestNative.copy(aimChest.quaternion);
  if(fighter.weapon==='bow'&&aimDirection){
   // Turn the captured upper-body chain as a whole: both native grips and
   // elbow bends survive while the bow is raised towards its launch angle.
   root.updateMatrixWorld(true);
   const l=capturedGrip(root.getObjectByName('mixamorigLeftHand')!,new T.Vector3(),root),r=capturedGrip(root.getObjectByName('mixamorigRightHand')!,new T.Vector3(),root);
   const chest=aimChest,parent=chest.parent!.getWorldQuaternion(new T.Quaternion());
   const correction=new T.Quaternion().setFromUnitVectors(l.sub(r).normalize(),aimDirection.clone().normalize());
   chest.quaternion.premultiply(parent.clone().invert().multiply(correction).multiply(parent));
  }
  ground.update(/death/i.test(pose.clip)&&weight>.2);root.updateMatrixWorld(true);equipment.update(pose.clip,pose.time,duration(pose.clip));equipment.prop?.updateMatrixWorld(true);
  if(fighter.weapon==='sword'&&sword){
   sword.skeleton.update();strike.set(0,0,-Infinity);for(let i=0;i<sword.geometry.attributes.position.count;i++){const p=sword.getVertexPosition(i,new T.Vector3()).applyMatrix4(sword.matrixWorld);if(p.z>strike.z)strike.copy(p);}
  }else if(equipment.prop){
   const w=fighter.weapon;
   if(w==='flail'){equipment.prop.userData.ball.getWorldPosition(strike);strike.z+=.14;}
   else if(w==='bow')strike.copy(equipment.leftGrip);
   else{strike.set(0,0,-Infinity);equipment.prop.traverse(o=>{if(o instanceof T.Mesh){const vertices=o.geometry.attributes.position;for(let i=0;i<vertices.count;i++){const p=new T.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(o.matrixWorld);if(p.z>strike.z)strike.copy(p);}}});}
  }
  const shield=root.getObjectByName('Paladin_J_Nordstrom_Helmet') as T.SkinnedMesh|undefined;
  if(hasShield(fighter)&&shield)guard.copy(meshCenter(shield)).add(new T.Vector3(0,0,.035));
  else if(equipment.prop&&fighter.weapon!=='bow')guard.set(0,0,twoHand(fighter.weapon)?.4:.34).applyMatrix4(equipment.prop.matrixWorld);
  else guard.copy(root.getObjectByName('mixamorigSpine2')!.getWorldPosition(new T.Vector3())).add(new T.Vector3(0,.12,.2));
  const chest=root.getObjectByName('mixamorigSpine2')!.getWorldPosition(new T.Vector3());
  bodyTarget.copy(root.getObjectByName('mixamorigRightArm')!.getWorldPosition(new T.Vector3()));
  const outside=bodyTarget.clone().sub(chest).setY(0).normalize();
  // The sword-side shoulder is outside a late, still-low shield. Aim at that
  // exposed armour surface rather than pretending a guarded chest was hit.
  bodyTarget.addScaledVector(outside,.075).add(new T.Vector3(0,.035,.09));
  // A two-handed fighter has no shield covering the torso. A waist-height
  // sweep should hit that exposed torso, not pretend to reach the shoulder.
  if(!hasShield(fighter))bodyTarget.copy(chest).add(new T.Vector3(0,-.10,.16));
  backTarget.copy(chest).add(new T.Vector3(0,-.06,-.17));
  visual.add(root);if(equipment.prop)visual.add(equipment.prop);visual.updateMatrixWorld(true);
  // Contact sampling updates the bone palette in actor space. Refresh it after
  // placement as well, before either the shadow or colour pass consumes it.
  root.traverse(o=>{if(o instanceof T.SkinnedMesh)o.skeleton.update();});
 }
 evaluate({clip:idle(fighter),time:0});
 return {visual,root,equipment,fighter,animations,strike,guard,bodyTarget,backTarget,trail,duration,evaluate,idle:idle(fighter),defense:defense(fighter),failedGuard:(hasShield(fighter)?'block':defense(fighter)) as NativeClip,impact:impact(fighter),death:death(fighter),dispose(){trail.geometry.dispose();trail.material.dispose();ground.dispose();equipment.dispose();mixer.stopAllAction();mixer.uncacheRoot(root);}};
}
export type DuelActor=ReturnType<typeof createDuelActor>;
type PreparedEvent=DuelEvent&{start:number;contact:number;end:number;clip:NativeClip;marker:number;defenseTime:number;defenderClip:NativeClip;attackPosition:T.Vector3;defendPosition:T.Vector3;point:T.Vector3;flight:number;projectileOrigin:T.Vector3;approach:number;ballistic:ReturnType<typeof arrowFlight>|null;aimDirection:T.Vector3|null};
const ease=(n:number)=>T.MathUtils.smoothstep(n,0,1);
const transform=(p:T.Vector3,side:DuelSide)=>p.clone().applyAxisAngle(new T.Vector3(0,1,0),side===0?Math.PI/2:-Math.PI/2);

export type RearReceiver={side:DuelSide;yaw:number;position:T.Vector3;idleTime:number};
export function createNativeDuel(actors:[DuelActor,DuelActor],events:DuelEvent[],range=6,receiver?:RearReceiver){
 const ranged=actors[0].fighter.weapon==='bow',halfRange=T.MathUtils.clamp(range,6,22)/2,base=[new T.Vector3(ranged?-halfRange:-1.25,0,0),new T.Vector3(ranged?halfRange:1.25,0,0)];
 const facings=[Math.PI/2,-Math.PI/2];if(receiver){facings[receiver.side]=receiver.yaw;base[receiver.side].copy(receiver.position);}
 const face=(p:T.Vector3,side:number)=>p.clone().applyAxisAngle(new T.Vector3(0,1,0),facings[side]);
 const prepared:PreparedEvent[]=[];let start=.65;
 for(const event of events){
  const a=event.attacker,d=(1-a) as DuelSide,A=actors[a],D=actors[d],clip=attack(A.fighter,event),duration=A.duration(clip);
  // A successful block targets equipment. Hits must visibly reach an opening,
  // never reuse the same raised shield pose and then kill its defender.
  const rear=receiver?.side===d,defenderClip=rear?D.idle:event.outcome==='block'?D.defense:D.failedGuard;
  const defenseTime=rear?receiver!.idleTime:event.outcome==='block'?D.duration(defenderClip)*.65:Math.min(.11,D.duration(defenderClip)*.2);D.evaluate({clip:defenderClip,time:defenseTime});const guard=(rear?D.backTarget:event.outcome==='block'?D.guard:D.bodyTarget).clone();
  if(event.outcome==='miss')guard.x+=.8;
  let marker=duration*.45,point=new T.Vector3(),projectileOrigin=new T.Vector3(),best=-Infinity;
  const shot=A.fighter.weapon==='bow';
  if(shot){marker=A.duration('bowDraw')+.65+5/30;A.evaluate({clip,time:marker});point.copy(A.strike);projectileOrigin.copy(A.equipment.rightGrip);}
  else{
   // Find a forward-reaching point at the defender's upper guard height.
   // Searching the actual meshes accommodates different native body sizes.
   for(let i=25;i<=62;i++){const t=duration*i/100;A.evaluate({clip,time:t});const p=A.strike,score=p.z-Math.abs(p.y-guard.y)*1.8;if(score>best){best=score;marker=t;point.copy(p);}}
  }
  const defensePosition=base[d].clone(),attackPosition=base[a].clone();
  if(!shot){const p=face(point,a),g=face(guard,d);attackPosition.copy(defensePosition).add(g).sub(p);attackPosition.y=0;
   // Do not force bodies together for a short or badly matched capture.
   const sign=a===0?-1:1;attackPosition.x=defensePosition.x+sign*Math.max(1.15,Math.abs(attackPosition.x-defensePosition.x));
  }
  const contactPoint=face(guard,d).add(defensePosition);if(!shot)contactPoint.y=point.y;
  projectileOrigin.copy(transform(projectileOrigin,a)).add(attackPosition);
  let ballistic:ReturnType<typeof arrowFlight>|null=null,aimDirection:T.Vector3|null=null;
  if(shot){
   // Solve again after raising the chest because the nocking hand also moves.
   for(let i=0;i<5;i++){ballistic=arrowFlight(projectileOrigin,contactPoint);aimDirection=transform(ballistic.velocity.clone().normalize(),a===0?1:0);A.evaluate({clip,time:marker},undefined,1,aimDirection);projectileOrigin.copy(transform(A.equipment.rightGrip,a)).add(attackPosition);}
   ballistic=arrowFlight(projectileOrigin,contactPoint);aimDirection=transform(ballistic.velocity.clone().normalize(),a===0?1:0);
  }
  const flight=ballistic?.duration??0,approach=ranged&&!shot?Math.max(2.8,(range-1.5)/1.6):0;
  const windup=(shot?marker:event.jump?1.25:event.heavy?1.05:.76)+approach;
  const contact=start+windup+flight,end=contact+(event.outcome==='death'?D.duration(D.death)+.65:event.outcome==='hit'?D.duration(D.impact)+.25:.9);
  prepared.push({...event,start,contact,end,clip,marker,defenseTime,defenderClip,attackPosition,defendPosition:defensePosition,point:contactPoint,flight,projectileOrigin,approach,ballistic,aimDirection});start=end+.18;
 }
 const duration=prepared.at(-1)!.end+.6;
 // Root trajectories are also used by the squad's time-aware route planner.
 // Keep one source of truth for contact lunge, recoil and death placement.
 function positionsAt(time:number){
  const t=T.MathUtils.clamp(time,0,duration),positions=base.map(p=>p.clone());
  for(const e of prepared){
   if(t<e.start-.32)continue;
   const dead=e.outcome==='death'&&t>=e.contact;if(t>e.end&&!dead)continue;
   const a=e.attacker,d=1-a,before=t-e.start,after=t-e.contact,windup=e.contact-e.flight-e.start;
   positions[a].lerp(e.attackPosition,ease(before/Math.max(.15,windup*.8))*(1-ease((after-.15)/.65)));
   if(after>=0&&e.outcome==='block')positions[d].x+=(d===0?-1:1)*Math.sin(Math.min(1,after/.65)*Math.PI)*(e.heavy?.14:.07);
   if(dead){positions[d].copy(e.defendPosition);positions[a].copy(e.attackPosition);}
  }
  return positions;
 }
 const state={time:0,phase:'양측이 거리를 재고 있습니다',health:[100,100],contact:null as null|{point:T.Vector3;age:number;blocked:boolean},winner:null as DuelSide|null};
 function update(time:number,participation:[number,number]=[1,1],idleTimes?:[number,number]){
  const t=T.MathUtils.clamp(time,0,duration);state.time=t;state.health=[100,100];state.contact=null;state.winner=null;state.phase='양측이 거리를 재고 있습니다';
  const positions=positionsAt(t),poses:Pose[]=actors.map((A,i)=>({clip:A.idle,time:idleTimes?.[i]??t%A.duration(A.idle)})),others=poses.map(p=>({...p})),weights=[1,1],aims:(T.Vector3|undefined)[]=[];
  for(const e of prepared){
   const a=e.attacker,d=(1-a) as DuelSide,A=actors[a],D=actors[d];
   if(t>=e.contact){if(e.outcome==='death'){state.health[d]=0;state.winner=a;}else if(e.outcome==='hit')state.health[d]=Math.max(20,state.health[d]-32);}
   if(t<e.start-.32)continue;
   const ongoing=t<=e.end,dead=e.outcome==='death'&&t>=e.contact;
   if(!ongoing&&!dead)continue;
   const before=t-e.start,after=t-e.contact,windup=e.contact-e.flight-e.start;
   if(ongoing){
    let sourceTime=before<=windup?Math.max(0,before-e.approach)/(windup-e.approach)*e.marker:e.marker;
    if(after>0)sourceTime=e.marker+(e.outcome==='block'?-1:1)*Math.min(after,.15)*.65;
    if(A.fighter.weapon==='bow')sourceTime=Math.max(0,before);
    const recovery=e.outcome==='death'?.6:.48;
    weights[a]=ease(before/.18)*(1-ease((after-.14)/recovery));if(A.fighter.weapon==='bow')weights[a]=ease(before/.16)*(1-ease((sourceTime-A.duration(e.clip)+.18)/.18));
    poses[a]={clip:e.clip,time:Math.min(A.duration(e.clip),sourceTime)};
    if(e.aimDirection&&participation[a]>0){const release=e.contact-e.flight,drawStart=A.duration('bowDraw')*.55,blend=ease((before-drawStart)/.3)*(1-ease((t-release-.05)/.32));if(blend>0){A.evaluate(poses[a],others[a],weights[a]);const native=A.equipment.leftGrip.clone().sub(A.equipment.rightGrip).normalize();aims[a]=native.lerp(e.aimDirection,blend).normalize();}}
    if(before<e.approach){const walk:NativeClip=twoHand(A.fighter.weapon)?'twoWalk':hasShield(A.fighter)?'walk':'axeWalk';poses[a]={clip:walk,time:Math.max(0,before)%A.duration(walk)};}
    // Success raises the guard in time. Failure plays only the first part of
    // the actual guard capture, starting late; never freeze an attack pose.
    if(after<0||e.outcome==='block'){
     poses[d]={clip:e.defenderClip,time:e.defenseTime};weights[d]=ease((t-e.start+.2)/.36)*(1-ease((after-.2)/.48));
     if(e.outcome!=='block'){const attempt=T.MathUtils.clamp((after+.24)/.24,0,1);poses[d].time=e.defenseTime*attempt;weights[d]=ease(attempt/.6);}
     if(after>=0){const react:NativeClip=hasShield(D.fighter)?'impact':D.impact;poses[d]={clip:react,time:after};others[d]={clip:after<.3?D.defense:D.idle,time:after<.3?e.defenseTime:idleTimes?.[d]??0};weights[d]=ease(after/.06)*(1-ease((after-.45)/.4));}
    }else if(e.outcome!=='miss'){poses[d]={clip:dead?D.death:D.impact,time:Math.max(0,after)};others[d]={clip:after<.3?e.defenderClip:D.idle,time:after<.3?e.defenseTime:idleTimes?.[d]??0};weights[d]=ease(after/.12)*(dead?1:1-ease((after-D.duration(D.impact)+.14)/.22));}
    const actorLabel=a===0?'아군':'적군';state.phase=after<0?`${actorLabel} ${A.fighter.weapon==='bow'?'조준 · 발사':e.heavy?'강공격 준비':'공격'}`:e.outcome==='block'?`${hasShield(D.fighter)?'방패 방어':'무기 받아내기'} → 반격 준비`:e.outcome==='death'?`${d===0?'아군':'적군'} 쓰러짐`:'피격 · 자세 회복';
   }
   if(dead){poses[d]={clip:D.death,time:Math.min(D.duration(D.death),after)};others[d]={clip:e.defenderClip,time:e.defenseTime};weights[d]=ease(after/.14);positions[d].copy(e.defendPosition);positions[a].copy(e.attackPosition);if(!ongoing)state.phase=`${a===0?'아군':'적군'} 승리 · 공방 종료`;}
   if(after>=0&&after<.22&&e.outcome!=='miss')state.contact={point:e.point.clone(),age:after,blocked:e.outcome==='block'};
  }
  actors.forEach((A,i)=>{if(participation[i]<=0)return;A.trail.visible=false;A.visual.position.copy(positions[i]);A.visual.rotation.y=facings[i];A.evaluate(poses[i],others[i],weights[i]*participation[i],aims[i]);});
  // Replace free-flight review arrows with one event-driven projectile. Stop
  // at the shield/body contact instead of flying through the defender.
  for(const e of prepared){if(participation[e.attacker]<=0||actors[e.attacker].fighter.weapon!=='bow'||t<e.start||t>e.end)continue;const A=actors[e.attacker],arrow=A.equipment.prop!.userData.arrow as T.Group,release=e.contact-e.flight;
   if(t>=release&&e.ballistic){const {position,direction}=arrowPose(e.ballistic,t-release);
    arrow.position.copy(arrow.parent!.worldToLocal(position));arrow.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),direction.applyQuaternion(arrow.parent!.getWorldQuaternion(new T.Quaternion()).invert()));arrow.visible=t<e.contact+.12;
    A.trail.visible=e.flight>.5&&t<e.contact;const vertices=A.trail.geometry.attributes.position as T.BufferAttribute;
    if(A.trail.visible){for(let i=0;i<18;i++){const p=arrowPose(e.ballistic,Math.max(0,t-release-(1-i/17)*.17)).position;A.visual.worldToLocal(p);vertices.setXYZ(i,p.x,p.y,p.z);}vertices.needsUpdate=true;}
   }
  }
  return state;
 }
 return {actors,events:prepared,duration,state,update,positionsAt,facings,receiver,dispose(){actors.forEach(a=>a.dispose());}};
}
