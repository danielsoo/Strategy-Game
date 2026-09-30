// 장식이 미탐험 영토의 정보를 누설하거나 게임 상태를 바꾸지 않는지 확인한다.
import assert from 'node:assert/strict';
import {createGameState, isExplored, isVisible} from '../src/engine';
import {makeRng} from '../src/services/combatSystem';
import {buildMedievalScene} from '../src/screens/medievalScene';
import {cityLayout} from '../src/screens/realmCityLayout';
import {campaignSurface,campaignBorders} from '../src/screens/campaignTerrain';
import * as THREE from 'three';

for (const size of [11,21]) {
  const state=createGameState(5,size,size,makeRng(290929));
  const before=JSON.stringify(state);
  const project=(s:typeof state)=>{
    const scene=buildMedievalScene(s,0,false);
    return {...scene,cities:scene.ground.flatMap(cityLayout),ground:scene.ground.map(({cell,...visible})=>visible)};
  };
  const first=project(state);
  assert.deepEqual(first,project(state),'동일한 판에서 장식이 바뀌면 안 된다');
  assert.equal(JSON.stringify(state),before,'렌더링은 게임 상태를 바꾸지 않는다');
  const hidden=JSON.parse(before) as typeof state;
  let changed=0;
  for(const cell of hidden.cells) {
    if(cell.offMap||isVisible(state,0,cell)||isExplored(state,0,cell)) continue;
    cell.terrain='mountain';cell.castle=true;cell.owner=1;cell.units=10;cell.hasRoad=true;changed++;
  }
  assert(changed>0);
  assert.deepEqual(first,project(hidden),'미탐험 지역의 변화가 화면에 드러나면 안 된다');
  const full=buildMedievalScene(state,0,true);
  for(const pieces of Object.values(full.pieces)) for(const piece of pieces) {
    assert([...piece.position,...piece.scale].every(Number.isFinite));
    assert(piece.scale.every(v=>v>0));
  }
  assert(full.ground.flatMap(cityLayout).some(p=>p.asset==='caro_market'));
  const surface=campaignSurface(full.ground,18),pos=surface.geometry.getAttribute('position');
  const normals=surface.geometry.getAttribute('normal'),indices=surface.geometry.getIndex()!;
  assert.equal(surface.faces.length,indices.count/3,'모든 삼각형에 선택할 게임 칸이 있어야 한다');
  assert.equal(surface.faces.length,full.ground.length*6*18*18);
  const unique=new Set<string>();
  for(let i=0;i<pos.count;i++) {
    const key=`${pos.getX(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    assert(!unique.has(key),'인접 칸 경계의 정점은 공유해야 한다');unique.add(key);
    assert(normals.getY(i)>0,'지표면은 위에서 보여야 한다');
  }
  // 실제 레이캐스트가 연속 메시의 면을 원래 게임 칸으로 정확히 연결하는지 확인한다.
  const mesh=new THREE.Mesh(surface.geometry,new THREE.MeshBasicMaterial());
  for(let i=0;i<full.ground.length;i++) {
    const tile=full.ground[i],x=tile.position[0]+.07,z=tile.position[2]+.03;
    const ray=new THREE.Raycaster(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(mesh)[0];assert(hit?.faceIndex!=null);
    assert.equal(surface.faces[hit.faceIndex],i,'높은 산에서도 클릭한 칸이 선택되어야 한다');
  }
  const borders=campaignBorders(full.ground,surface.field.height);
  assert(borders.getAttribute('position').count>0);
  borders.dispose();surface.geometry.dispose();(mesh.material as THREE.Material).dispose();
  console.log(`${size}×${size}: 정보 비노출·상태 보존·공유 지형·면 방향·모든 칸 레이캐스트 통과`);
}
