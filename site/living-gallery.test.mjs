import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, createMask, coatStroke, coveragePercent, serializeDocument } from './engine.js';
import { createLivingDesign, readLivingPreferences } from './living-gallery.js';

test('unfinished cloth becomes an explicitly marked full-coat sample without changing the original', () => {
  const original = createDocument();
  const before = serializeDocument(original);
  const result = createLivingDesign(original);
  assert.equal(result.preview, true);
  assert.equal(result.design.stage, 'reveal');
  assert.equal(coveragePercent(result.design, createMask(result.design)), 100);
  assert.deepEqual(serializeDocument(original), before);
});
test('completed cloth retains the real partial coverage, identity and layout', () => {
  const design = createDocument();
  design.name = '窗边的花'; design.rotation = 30; design.repeat = 'staggered';
  coatStroke(design, createMask(design), { x: 35, y: 30 }, { x: 80, y: 70 }, 16);
  design.stage = 'reveal';
  const result = createLivingDesign(design);
  assert.equal(result.preview, false);
  assert.deepEqual(serializeDocument(result.design), serializeDocument(design));
  result.design.coverage.fill(0);
  assert.ok(design.coverage.some(Boolean));
});
test('malformed gallery data cannot become a misleading render', () => {
  assert.throws(() => createLivingDesign({ motif: 'arbitrary', coverage: [] }));
});
test('gallery preferences accept only known products and constrained crop values', () => {
  assert.deepEqual(readLivingPreferences({ product: 'cushion', light: 'evening', scale: 123 }), { product: 'cushion', light: 'evening', scale: 123 });
  assert.deepEqual(readLivingPreferences({ product: '__proto__', light: 'anything', scale: Infinity }), { product: 'bag', light: 'day', scale: 100 });
});
