import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateExhibitPack, createPreset, evaluateConditions, canonicalizeEnvelope } from '../lib/exhibit-pack.js';
import { createMask, coatStroke, validateDocument, serializeDocument } from '../site/engine.js';

const flowers = JSON.parse(await readFile(new URL('../packs/flowers.json',import.meta.url),'utf8'));
const night = JSON.parse(await readFile(new URL('../packs/night.json',import.meta.url),'utf8'));
const clone = value => structuredClone(value);
function envelope(pack,choiceId = pack.choices[0].id) {
  const design = createPreset(pack,choiceId);
  design.coverage = [...createMask(design)];design.stage = 'reveal';
  return {schemaVersion:1,design,exhibit:{id:pack.id,version:pack.version,title:pack.title,venue:pack.venue},choice:{id:choiceId,title:pack.choices[0].title},card:clone(pack.card),sessionId:'test-session-123'};
}

test('built-in packs are detached, serializable and have distinct stories and completion rules',() => {
  const first = validateExhibitPack(flowers), second = validateExhibitPack(night);
  assert.notEqual(first.title,second.title);assert.notDeepEqual(first.conditions,second.conditions);
  assert.equal(first.choices.length,3);assert.equal(second.choices.length,2);
  assert.ok(!second.allowedControls.includes('palette'));
  for (const pack of [first,second]) for (const choice of pack.choices) {
    const design = createPreset(pack,choice.id);
    assert.equal(design.coverage.length,57600);assert.ok(Array.isArray(design.coverage));
    assert.equal(evaluateConditions(pack,design).complete,false);
    assert.equal(evaluateConditions(pack,envelope(pack,choice.id).design).complete,true);
  }
  first.choices[0].preset.motif = 'wave';assert.equal(flowers.choices[0].preset.motif,'flower');
});

test('strict schemas reject scripts, resources, unknown keys, enums, malformed steps and ranges',() => {
  const mutations = [
    p => p.script = 'alert(1)',p => p.schemaVersion = 2,p => p.id = '../secret',p => p.version = '1@2',
    p => p.steps = ['choose','reveal','create','takeaway'],p => p.steps = ['choose','create','create','reveal','takeaway'],
    p => p.allowedControls.push('script'),p => p.choices[0].preset.rotation = 181,p => p.choices[0].preset.customPattern = [1],
    p => p.choices[0].preset.motif = 'bad',p => p.choices[0].preset.url = '/x.js',p => p.choices.push(clone(p.choices[0])),
    p => p.conditions = [{field:'name',operator:'eq',value:'x'}],p => p.conditions = [{field:'stage',operator:'gte',value:'coat'}],
    p => p.conditions = [{field:'coverage',operator:'gte',value:NaN}],p => p.sources[0].url = 'javascript:alert(1)',
    p => p.sources[0].url = 'https://user:secret@example.com',p => p.idleSeconds = 0,p => p.title = 'x'.repeat(81),
    p => delete p.card
  ];
  for (const mutate of mutations) {const value = clone(flowers);mutate(value);assert.throws(() => validateExhibitPack(value));}
  const short = clone(flowers);short.steps = ['choose','create','reveal','takeaway'];assert.equal(validateExhibitPack(short).steps.length,4);
});

test('even a pack without conditions requires actual reveal and computed coverage',() => {
  const pack = clone(flowers);pack.conditions = [];
  const design = createPreset(pack,'day');
  assert.equal(evaluateConditions(pack,design).complete,false);
  design.stage = 'reveal';assert.equal(evaluateConditions(pack,design).complete,true);
  const empty = envelope(flowers);empty.design.coverage.fill(0);assert.throws(() => canonicalizeEnvelope(empty,flowers));
  const tiny = envelope(flowers);tiny.design.coverage.fill(0);tiny.design.coverage[createMask(tiny.design).findIndex(bit => bit === 1)] = 1;
  assert.equal(evaluateConditions(flowers,tiny.design).complete,true);
});

test('server canonicalization freezes metadata and enforces pack choice and disabled controls',() => {
  const input = envelope(night);input.exhibit.title = 'Injected';input.exhibit.venue = 'Injected';input.choice.title = 'Injected';input.card = {headline:'Injected',caption:'Injected'};
  const frozen = canonicalizeEnvelope(input,night);
  assert.equal(frozen.exhibit.title,night.title);assert.deepEqual(frozen.card,night.card);assert.equal(frozen.choice.title,night.choices[0].title);
  for (const mutate of [e => e.design.dyeDepth = 4,e => e.design.dyePalette = 'indigo',e => e.design.seed++,e => e.choice.id = 'not-here',e => e.completed = true,e => e.sessionId = '<script>']) {
    const value = envelope(night);mutate(value);assert.throws(() => canonicalizeEnvelope(value,night));
  }
  const limited = clone(flowers);limited.allowedControls = ['motif'];
  const custom = envelope(limited);custom.design.motif = 'custom';custom.design.coverage = [...createMask(custom.design)];
  assert.throws(() => canonicalizeEnvelope(custom,limited),/未开放自刻花版/);
});

test('custom stencil partial coverage survives canonicalization without expanding to full coat',() => {
  const input = envelope(flowers);input.design.motif = 'custom';
  input.design.customPattern = Array.from({length:256},(_,i) => Number(i % 16 > 3 && i % 16 < 12 && Math.floor(i/16)>3 && Math.floor(i/16)<12));
  input.design.coverage.fill(0);
  const doc = validateDocument(input.design), mask = createMask(doc);
  coatStroke(doc,mask,{x:80,y:80},{x:160,y:160},18);
  input.design = serializeDocument(doc);
  const result = evaluateConditions(flowers,input.design);
  assert.ok(result.coverage > 0 && result.coverage < 100);
  const output = canonicalizeEnvelope(input,flowers);
  assert.deepEqual(output.design.coverage,input.design.coverage);
  assert.deepEqual(output.design.customPattern,input.design.customPattern);
  assert.equal(evaluateConditions(flowers,output.design).coverage,result.coverage);
  const invalid = clone(input);const outside = mask.findIndex(bit => bit === 0);invalid.design.coverage[outside] = 1;
  assert.throws(() => canonicalizeEnvelope(invalid,flowers),/超出版孔/);
});
