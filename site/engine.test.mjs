// Run: node --test engine.test.mjs
// These checks exercise the finite binary model, not physical dyeing accuracy or browser UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, MOTIFS, STAGES, REPEATS, FRAMES, MAX_JSON_BYTES, createDocument, createMask,
  coatAll, coatStroke, coveragePercent, renderPixels,
  serializeDocument, validateDocument, parseDocument, analyzeStencil, DYE_PALETTES, createCustomPattern
} from './engine.js';

const count = bits => bits.reduce((sum, bit) => sum + bit, 0);
const freshJSON = () => serializeDocument(createDocument());

test('v1 documents without creative fields reopen with the original indigo recipe and pixels', () => {
  const current = createDocument(); coatAll(current, createMask(current)); current.stage = 'reveal';
  const old = serializeDocument(current); delete old.customPattern; delete old.dyeDepth; delete old.dyePalette;
  const restored = validateDocument(old);
  assert.equal(restored.dyePalette, 'indigo'); assert.equal(restored.dyeDepth, 3);
  assert.deepEqual(renderPixels(restored), renderPixels(current));
});

test('all color recipes and depths produce distinct blue while leaving paste white and geometry unchanged', () => {
  const current = createDocument(); coatAll(current, createMask(current)); current.stage = 'reveal';
  const baseMask = createMask(current), variants = new Set();
  const coatedIndex = baseMask.findIndex(Boolean), blueIndex = baseMask.findIndex(bit => !bit);
  for (const dyePalette of Object.keys(DYE_PALETTES)) for (let dyeDepth = 1; dyeDepth <= 5; dyeDepth++) {
    const doc = { ...current, dyePalette, dyeDepth }, pixels = renderPixels(doc);
    assert.deepEqual(createMask(doc), baseMask);
    assert(pixels[coatedIndex * 4] > 230);
    variants.add(Array.from(pixels.slice(blueIndex * 4, blueIndex * 4 + 3)).join(','));
    assert.deepEqual(renderPixels(parseDocument(JSON.stringify(serializeDocument(doc)))), pixels);
  }
  assert.equal(variants.size, 20);
});

test('custom grid changes real holes, obeys layout and round-trips without aliasing input arrays', () => {
  const doc = Object.assign(createDocument(), { motif: 'custom', customPattern: createCustomPattern() });
  const before = createMask(doc); doc.customPattern[0] = 1;
  assert.notDeepEqual(createMask(doc), before);
  assert.notDeepEqual(createMask({ ...doc, rotation: 35, repeat: 'staggered' }), createMask(doc));
  coatAll(doc, createMask(doc)); doc.stage = 'reveal';
  const json = serializeDocument(doc), restored = validateDocument(json);
  assert.deepEqual(renderPixels(restored), renderPixels(doc));
  json.customPattern[0] = 0; assert.equal(restored.customPattern[0], 1);
});

test('creative fields reject malformed, coercible and unknown input rather than silently normalizing it', () => {
  for (const patch of [{ customPattern: Array(255).fill(0) }, { customPattern: Array(256).fill('1') }, { customPattern: new Array(256) }, { customPattern: null }, { dyeDepth: 0 }, { dyeDepth: 6 }, { dyeDepth: 2.5 }, { dyeDepth: '3' }, { dyePalette: '__proto__' }, { dyePalette: ['indigo'] }, { dyePalette: null }]) assert.throws(() => validateDocument({ ...freshJSON(), ...patch }));
});

test('old JSON without layout fields reopens with the same mask and explicit default layout', () => {
  const old = freshJSON();
  delete old.rotation; delete old.repeat; delete old.motifScale; delete old.frame;
  const oldShape = createMask(old);
  const original = createDocument(); coatAll(original, oldShape);
  old.coverage = Array.from(original.coverage);
  const restored = parseDocument(JSON.stringify(old));
  assert.equal(restored.rotation, 0);
  assert.equal(restored.repeat, 'straight');
  assert.equal(restored.motifScale, 100);
  assert.equal(restored.frame, 'open');
  assert.deepEqual(createMask(restored), oldShape);
  assert.deepEqual(Array.from(restored.coverage), old.coverage);
  const modern = serializeDocument(restored);
  assert.equal(modern.schemaVersion, 1);
  assert.equal(modern.rotation, 0);
  assert.equal(modern.repeat, 'straight');
  assert.equal(modern.motifScale, 100);
  assert.equal(modern.frame, 'open');
});

test('open frame is the default and omitted frame retains the pre-frame geometry', () => {
  assert.equal(createDocument().frame, 'open');
  assert.deepEqual(FRAMES, ['open', 'bordered']);
  for (const motif of Object.keys(MOTIFS)) {
    const doc = Object.assign(createDocument(), { motif });
    const legacy = serializeDocument(doc); delete legacy.frame;
    assert.deepEqual(createMask(legacy), createMask(doc));
    assert.equal(parseDocument(JSON.stringify(legacy)).frame, 'open');
  }
});

for (const motif of Object.keys(MOTIFS)) {
  test(`${motif}: bordered cloth has real coatable bands, complete main units, connected material and a stable saved layout`, () => {
    const doc = Object.assign(createDocument(), { motif, frame: 'bordered' });
    const mask = createMask(doc);
    assert.equal(analyzeStencil(mask).count, 0);
    assert(mask.some(Boolean));
    // Every edge retains a complete blue margin. The white bands are actual holes.
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (x < 8 || y < 8 || x >= SIZE - 8 || y >= SIZE - 8) assert.equal(mask[y * SIZE + x], 0);
    }
    const bandCell = 11 * SIZE + 31;
    assert.equal(mask[bandCell], 1);
    assert.equal(doc.coverage[bandCell], 0);
    coatStroke(doc, mask, { x: 31.5, y: 11.5 }, { x: 31.5, y: 11.5 }, 1);
    assert.equal(doc.coverage[bandCell], 1, 'border holes accept the same paste brush as the main pattern');
    assert(doc.coverage.every((bit, i) => !bit || mask[i]));
    coatAll(doc, mask);
    assert.equal(coveragePercent(doc, mask), 100);
    doc.stage = 'reveal';
    const pixels = renderPixels(doc, mask);
    assert(pixels[bandCell * 4] > 230);
    assert(pixels[0] < 40);
    assert.deepEqual(renderPixels(parseDocument(JSON.stringify(serializeDocument(doc)))), pixels);
    const high = createMask(doc, 720);
    assert.equal(analyzeStencil(high, 720).count, 0);
    const highPixels = renderPixels(doc, high, 720);
    for (let i = 0; i < high.length; i++) assert.equal(highPixels[i * 4] > 200, !!high[i]);
    doc.bridge = false;
    const unbridged = createMask(doc);
    assert(mask.every((bit, i) => bit <= unbridged[i]), 'bridge only removes main/corner holes');
    assert.equal(unbridged[16 * SIZE + 16], 1, 'corner center exists before leaving a bridge');
    assert.equal(mask[16 * SIZE + 16], 0, 'corner center is retained as connected material when bridged');
    // At default spacing the nine complete cells have the exact open geometry;
    // partial units outside the 3×3 central group have been removed.
    const open = createMask({ ...doc, bridge: true, frame: 'open' });
    for (let y = 28; y < SIZE - 28; y++) for (let x = 28; x < SIZE - 28; x++) {
      assert.equal(mask[y * SIZE + x], open[y * SIZE + x]);
    }
  });
}

test('bordered layout keeps whole motifs when scale or spacing calls for an even number of cells', () => {
  for (const motif of Object.keys(MOTIFS)) for (const patch of [
    { spacing: 100, motifScale: 125 }, { spacing: 150, motifScale: 125 },
    { spacing: 60, motifScale: 70 }, { rotation: 37, repeat: 'staggered', motifScale: 125 }
  ]) {
    const doc = Object.assign(createDocument(), patch, { motif, frame: 'bordered' });
    const mask = createMask(doc);
    assert.equal(analyzeStencil(mask).count, 0, `${motif} ${JSON.stringify(patch)}`);
    const bodyCount = mask.reduce((sum, bit, index) => {
      const x = index % SIZE, y = Math.floor(index / SIZE);
      return sum + (bit && x >= 27 && x < SIZE - 27 && y >= 27 && y < SIZE - 27 ? 1 : 0);
    }, 0);
    assert(bodyCount > 50, 'the central composition still contains visible complete motifs');
  }
});

test('rotation, staggered repeat, mirrored repeat and scale independently change the asymmetric branch geometry', () => {
  const doc = createDocument(); doc.motif = 'sprig';
  const baseline = createMask(doc);
  const variants = [
    { rotation: 37 }, { rotation: 180 }, { repeat: 'staggered' },
    { repeat: 'mirror' }, { motifScale: 70 }, { motifScale: 125 }
  ];
  const masks = variants.map(patch => createMask({ ...doc, ...patch }));
  for (let i = 0; i < masks.length; i++) {
    assert.notDeepEqual(masks[i], baseline, JSON.stringify(variants[i]));
    for (let j = 0; j < i; j++) assert.notDeepEqual(masks[i], masks[j]);
  }
  assert.deepEqual(REPEATS, ['straight', 'staggered', 'mirror']);
});

const layouts = [
  { rotation: 0, motifScale: 70, spacing: 60, repeat: 'straight' },
  { rotation: 37, motifScale: 70, spacing: 60, repeat: 'mirror' },
  { rotation: 0, motifScale: 125, spacing: 60, repeat: 'staggered' },
  { rotation: 90, motifScale: 125, spacing: 150, repeat: 'straight' },
  { rotation: 180, motifScale: 70, spacing: 150, repeat: 'mirror' },
  { rotation: 17, motifScale: 100, spacing: 100, repeat: 'staggered' },
  { rotation: 37, motifScale: 125, spacing: 100, repeat: 'mirror' }
];
test('layout boundary combinations preserve bridge polarity, connectivity and deterministic JSON restoration', () => {
  for (const motif of Object.keys(MOTIFS)) for (const layout of layouts) {
    const label = `${motif} ${JSON.stringify(layout)}`;
    const doc = Object.assign(createDocument(), layout, { motif, bridge: false });
    const unbridged = createMask(doc);
    doc.bridge = true;
    const bridged = createMask(doc);
    assert(bridged.some(Boolean), label);
    assert(count(bridged) < count(unbridged), label);
    assert(bridged.every((bit, i) => bit <= unbridged[i]), label);
    assert.equal(analyzeStencil(bridged).count, 0, label);
    coatAll(doc, bridged); doc.stage = 'reveal';
    const json = serializeDocument(doc);
    const restored = parseDocument(JSON.stringify(json));
    assert.deepEqual(serializeDocument(restored), json, label);
    assert.deepEqual(renderPixels(restored), renderPixels(doc), label);
    assert.deepEqual(serializeDocument(doc), json, 'pure rendering leaves layout and coating unchanged');
  }
});

test('100 reproducible sampled layouts retain connected material with bridges enabled', () => {
  let state = 20261016;
  const next = limit => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % limit; };
  const motifs = Object.keys(MOTIFS);
  for (let i = 0; i < 100; i++) {
    const doc = Object.assign(createDocument(), {
      motif: motifs[i % motifs.length], spacing: 60 + next(91), rotation: next(181),
      repeat: REPEATS[next(REPEATS.length)], motifScale: 70 + next(56)
    });
    const mask = createMask(doc);
    assert.equal(analyzeStencil(mask).count, 0, `${doc.motif}/${doc.spacing}/${doc.rotation}/${doc.repeat}/${doc.motifScale}`);
    doc.bridge = false;
    const unbridged = createMask(doc);
    assert(mask.every((bit, index) => bit <= unbridged[index]));
  }
});

test('new botanical motifs retain detailed holes and correct white polarity in 720px exports', () => {
  for (const motif of ['lotus', 'sprig']) {
    const doc = Object.assign(createDocument(), { motif, rotation: 37, repeat: 'staggered', motifScale: 125 });
    coatAll(doc, createMask(doc)); doc.stage = 'reveal';
    const mask = createMask(doc, 720);
    const pixels = renderPixels(doc, mask, 720);
    assert.equal(analyzeStencil(mask, 720).count, 0);
    for (let i = 0; i < mask.length; i++) assert.equal(pixels[i * 4] > 200, !!mask[i]);
    assert.deepEqual(renderPixels(parseDocument(JSON.stringify(serializeDocument(doc))), mask, 720), pixels);
  }
});

test('motif enumeration rejects coercible array and object values', () => {
  for (const motif of [['flower'], {}, null, 1]) {
    const data = freshJSON(); data.motif = motif;
    assert.throws(() => validateDocument(data));
  }
});
test('high resolution final rendering preserves the white-hole polarity', () => {
  const doc = createDocument(); coatAll(doc, createMask(doc)); doc.stage = 'reveal';
  const mask = createMask(doc, 720), pixels = renderPixels(doc, mask, 720);
  assert.equal(pixels.length, 720 * 720 * 4);
  for (let i = 0; i < mask.length; i++) assert.equal(pixels[i * 4] > 200, !!mask[i]);
});

test('stencil detects isolated material and rejects diagonal-only contact', () => {
  const mask = Uint8Array.from(['00000','01110','01010','01110','00000'].join('').split('').map(Number));
  assert.equal(analyzeStencil(mask, 5).count, 1);
  mask[6] = 0;
  assert.equal(analyzeStencil(mask, 5).count, 1);
  mask[7] = 0;
  assert.equal(analyzeStencil(mask, 5).count, 0);
});
test('retained material connects to the border for all supported bridged patterns and spacings', () => {
  for (const motif of Object.keys(MOTIFS)) for (let spacing = 60; spacing <= 150; spacing++) {
    const doc = createDocument(); doc.motif = motif; doc.spacing = spacing;
    assert.equal(analyzeStencil(createMask(doc)).count, 0, `${motif} / ${spacing}`);
  }
});

for (const motif of Object.keys(MOTIFS)) {
  for (const spacing of [60, 100, 150]) {
    test(`${motif}, spacing ${spacing}: bridges retain material; coating and round-trip preserve the design`, () => {
      const doc = createDocument();
      doc.motif = motif;
      doc.spacing = spacing;
      doc.bridge = false;
      const unbridged = createMask(doc);
      doc.bridge = true;
      const bridged = createMask(doc);
      assert.equal(bridged.length, SIZE * SIZE);
      assert(count(bridged) > 0, 'the motif has usable holes');
      assert(count(bridged) < count(unbridged), 'every motif visibly changes when the bridge is enabled');
      assert(bridged.every((bit, i) => bit <= unbridged[i]), 'a bridge removes holes rather than adding them');
      for (let i = 0; i < SIZE; i++) {
        assert.equal(bridged[i], 0, 'top border retains material');
        assert.equal(bridged[(SIZE - 1) * SIZE + i], 0, 'bottom border retains material');
        assert.equal(bridged[i * SIZE], 0, 'left border retains material');
        assert.equal(bridged[i * SIZE + SIZE - 1], 0, 'right border retains material');
      }
      assert.equal(coveragePercent(doc, bridged), 0);
      assert.equal(coatStroke(doc, bridged, { x: 0, y: 0 }, { x: SIZE - 1, y: SIZE - 1 }), true);
      assert(doc.coverage.every((bit, i) => !bit || bridged[i]), 'dragging cannot deposit paste through retained paper');
      assert(coveragePercent(doc, bridged) > 0);
      assert(coveragePercent(doc, bridged) < 100, 'a narrow diagonal leaves some holes uncoated');
      coatAll(doc, bridged);
      assert.equal(coveragePercent(doc, bridged), 100);
      assert.deepEqual(doc.coverage, bridged);

      for (const stage of STAGES) {
        doc.stage = stage;
        const pixels = renderPixels(doc, bridged);
        assert.equal(pixels.length, SIZE * SIZE * 4);
        assert(pixels.every((value, index) => index % 4 !== 3 || value === 255), 'the exported surface is opaque');
        const encoded = JSON.stringify(serializeDocument(doc));
        assert(Buffer.byteLength(encoded, 'utf8') < MAX_JSON_BYTES, 'an ordinary export fits the import limit');
        const reloaded = parseDocument(encoded);
        assert.deepEqual(serializeDocument(reloaded), serializeDocument(doc));
        assert.deepEqual(renderPixels(reloaded), pixels, 'a reopened design renders exactly the same pixels');
      }
      const pixels = renderPixels(doc, bridged);
      const pastedIndex = bridged.findIndex(Boolean);
      const paperIndex = bridged.findIndex(bit => !bit);
      assert(pixels[pastedIndex * 4] > 230, 'paste-covered holes reveal white');
      assert(pixels[paperIndex * 4] < 40, 'retained paper leaves an uncoated area that dyes blue');

      // The region removed by the bridge must turn blue after full coating.
      const bridgeIndex = unbridged.findIndex((bit, i) => bit && !bridged[i]);
      assert(bridgeIndex >= 0);
      assert(pixels[bridgeIndex * 4] < 40);
      doc.bridge = false;
      coatAll(doc, unbridged);
      assert(renderPixels(doc, unbridged)[bridgeIndex * 4] > 230, 'the same point is white without a bridge');
    });
  }
}

test('an uncoated design reveals blue, including its open holes', () => {
  const doc = createDocument();
  doc.stage = 'reveal';
  const pixels = renderPixels(doc);
  for (let i = 0; i < SIZE * SIZE; i++) assert(pixels[i * 4] < 40);
});

test('a stroke entirely outside the cloth neither throws nor changes coverage', () => {
  const doc = createDocument();
  const changed = coatStroke(doc, createMask(doc), { x: -50, y: -50 }, { x: -30, y: -30 });
  assert.equal(changed, false);
  assert.equal(count(doc.coverage), 0);
});

const invalidPatches = [
  ['unsupported version', { schemaVersion: 2 }],
  ['unexpected dimensions', { size: SIZE + 1 }],
  ['prototype-looking motif', { motif: '__proto__' }],
  ['unavailable motif', { motif: 'external.svg' }],
  ['fractional spacing', { spacing: 60.1 }],
  ['spacing below range', { spacing: 59 }],
  ['spacing above range', { spacing: 151 }],
  ['rotation below range', { rotation: -1 }],
  ['rotation above range', { rotation: 181 }],
  ['fractional rotation', { rotation: 1.5 }],
  ['string rotation', { rotation: '45' }],
  ['null rotation', { rotation: null }],
  ['undefined rotation', { rotation: undefined }],
  ['unknown repeat', { repeat: 'tile' }],
  ['array repeat', { repeat: ['mirror'] }],
  ['null repeat', { repeat: null }],
  ['undefined repeat', { repeat: undefined }],
  ['scale below range', { motifScale: 69 }],
  ['scale above range', { motifScale: 126 }],
  ['fractional scale', { motifScale: 99.5 }],
  ['string scale', { motifScale: '100' }],
  ['null scale', { motifScale: null }],
  ['undefined scale', { motifScale: undefined }],
  ['unknown frame', { frame: 'closed' }],
  ['array frame', { frame: ['bordered'] }],
  ['null frame', { frame: null }],
  ['undefined frame', { frame: undefined }],
  ['NaN spacing', { spacing: NaN }],
  ['infinite spacing', { spacing: Infinity }],
  ['numeric bridge', { bridge: 1 }],
  ['negative seed', { seed: -1 }],
  ['seed above range', { seed: 2147483648 }],
  ['fractional seed', { seed: .5 }],
  ['non-text name', { name: { html: '<script>' } }],
  ['oversized name', { name: '蓝'.repeat(41) }],
  ['null-byte name', { name: 'name\u0000<script>' }],
  ['newline name', { name: 'name\nforged entry' }],
  ['escape-character name', { name: '\u001b[31m' }],
  ['DEL-character name', { name: 'name\u007f' }],
  ['unknown stage', { stage: 'uploaded' }],
  ['missing coverage cells', { coverage: [] }],
  ['array-like coverage object', { coverage: { length: SIZE * SIZE } }],
  ['unknown field', { externalScript: 'https://example.invalid/x.js' }]
];
for (const [name, patch] of invalidPatches) {
  test(`reject ${name}`, () => assert.throws(() => validateDocument({ ...freshJSON(), ...patch })));
}

test('reject non-object, array, inherited-only and incomplete documents', () => {
  for (const input of [null, [], 'design', 1, Object.create(freshJSON()), {}]) {
    assert.throws(() => validateDocument(input));
  }
  const missingName = freshJSON();
  delete missingName.name;
  assert.throws(() => validateDocument(missingName));
});

test('reject non-binary, extra-length, and out-of-mask coverage', () => {
  const invalidBit = freshJSON();
  invalidBit.coverage[100] = 2;
  assert.throws(() => validateDocument(invalidBit));
  const extraCell = freshJSON();
  extraCell.coverage.push(0);
  assert.throws(() => validateDocument(extraCell));
  const onPaper = freshJSON();
  onPaper.coverage[0] = 1;
  assert.throws(() => validateDocument(onPaper), /超出版孔/u);
});

test('reject malformed or oversized JSON before accepting a design', () => {
  assert.throws(() => parseDocument('{badjson'), /JSON/u);
  assert.throws(() => parseDocument('x'.repeat(MAX_JSON_BYTES + 1)), /过大/u);
  assert.throws(() => parseDocument(null), /过大/u);
  const prototypeField = JSON.stringify(freshJSON()).replace('{', '{"__proto__":{"polluted":true},');
  assert.throws(() => parseDocument(prototypeField), /未知/u);
  assert.equal({}.polluted, undefined);
});

test('accepted names remain literal data, without HTML interpretation or object merging', () => {
  // The app uses textContent. HTML-looking text is allowed as inert text;
  // forbidden controls and oversized payloads are tested separately above.
  const value = freshJSON();
  value.name = '<img src=x onerror=alert(1)>';
  const loaded = parseDocument(JSON.stringify(value));
  assert.equal(loaded.name, value.name);
  assert.equal(typeof loaded.name, 'string');
  assert.deepEqual(Object.keys(loaded).sort(), Object.keys(value).sort());
});
