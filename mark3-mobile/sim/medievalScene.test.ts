import assert from 'node:assert/strict';
import { createGameState } from '../src/engine';
import { makeRng } from '../src/services/combatSystem';
import { buildMedievalScene } from '../src/screens/medievalScene';

const state = createGameState(2, 9, 9, makeRng(42));
const cell = state.cells.find(c => !c.offMap)!;
const index = cell.row * state.cols + cell.col;
const vision = state.vision[0];
vision.visible.fill(false);
vision.explored.fill(false);
vision.memory.fill(null);
const hidden = buildMedievalScene(state, 0, false);
assert.equal(Object.values(hidden.pieces).flat().length, 0, 'unexplored terrain must contain no models');
assert.equal(hidden.mist.length, hidden.ground.length);

vision.explored[index] = true;
vision.memory[index] = { terrain: 'plain', owner: 0, castle: true, fortStage: 0, units: 8, seenTurn: 1 };
const remembered = buildMedievalScene(state, 0, false);
cell.owner = 1; cell.castle = false; cell.fortStage = 4; cell.terrain = 'mountain'; cell.units = 10;
const changedBehindFog = buildMedievalScene(state, 0, false);
assert.deepEqual(changedBehindFog.pieces, remembered.pieces, 'live enemy changes must not leak through remembered scenery');
assert.equal(changedBehindFog.pieces.metal.length, 0, 'remembered units must not be rendered');
assert.equal(changedBehindFog.ground.find(t => t.cell.id === cell.id)!.height, 0.24);

vision.visible[index] = true;
const visible = buildMedievalScene(state, 0, false);
assert.equal(visible.pieces.metal.length, 20, 'ten visible soldiers must have armor and shield details');
assert.equal(visible.mist.length, hidden.mist.length - 1);
assert.equal(visible.ground.find(t => t.cell.id === cell.id)!.height, 0.5);
assert.equal(buildMedievalScene(state, 0, true).mist.length, 0, 'spectating reveals the full board');

for (const size of [9, 21]) {
  const full = createGameState(5, size, size, makeRng(12));
  for (let stage = 0; stage <= 4; stage++) {
    full.cells.filter(c => !c.offMap).forEach(c => { c.fortStage = stage; c.units = 10; });
    const scene = buildMedievalScene(full, 0, true);
    assert.ok(scene.span > 0);
    assert.ok(Object.values(scene.pieces).flat().every(p => [...p.position, ...p.scale].every(Number.isFinite)));
  }
}
console.log('Medieval scene: fog privacy, memory, unit counts, spectator mode, construction and map sizes passed.');
