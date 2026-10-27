import test from 'node:test';
import assert from 'node:assert/strict';
import { symmetricCells, stencilPreset } from './creative-tools.js';

test('stencil tools reflect a cut across the requested axes without duplicate cells', () => {
  assert.deepEqual(symmetricCells(2, 4, 'none'), [66]);
  assert.deepEqual(symmetricCells(2, 4, 'mirror'), [66, 77]);
  assert.deepEqual(symmetricCells(2, 4, 'four'), [66, 77, 178, 189]);
});
test('stencil starters are distinct editable binary grids and clear removes all cuts', () => {
  const presets = ['pearl', 'star', 'leaf', 'rain', 'empty'].map(stencilPreset);
  for (const cells of presets) { assert.equal(cells.length, 256); assert(cells.every(bit => bit === 0 || bit === 1)); }
  assert.equal(new Set(presets.map(cells => cells.join(''))).size, 5);
  assert.equal(presets[4].some(Boolean), false);
});
