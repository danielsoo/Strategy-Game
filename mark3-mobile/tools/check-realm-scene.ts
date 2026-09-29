// 장식이 미탐험 영토의 정보를 누설하거나 게임 상태를 바꾸지 않는지 확인한다.
import assert from 'node:assert/strict';
import {createGameState, isExplored, isVisible} from '../src/engine';
import {makeRng} from '../src/services/combatSystem';
import {buildMedievalScene} from '../src/screens/medievalScene';

for (const size of [11,21]) {
  const state=createGameState(5,size,size,makeRng(290929));
  const before=JSON.stringify(state);
  const project=(s:typeof state)=>{
    const scene=buildMedievalScene(s,0,false);
    return {...scene,ground:scene.ground.map(({cell,...visible})=>visible)};
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
  assert(full.pieces.tower.length>0 && full.pieces.roof.length>0);
  console.log(`${size}×${size}: 장식 결정성·상태 보존·미탐험 정보 비노출·유효 지형 통과`);
}
