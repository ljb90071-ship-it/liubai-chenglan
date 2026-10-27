import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bumpVersion, clonePack, createDraftStore, defaultCondition, escapeHTML, moveStep, presetDocument, PREVIEW_STORAGE_KEY, requestJSON } from '../site/curator.js';
import { createMask, renderPixels } from '../site/engine.js';

const pack = () => ({ id: 'flowers', version: '1.2.3', choices: [{ id: 'flower', title: '团花', preset: { motif: 'flower', repeat: 'straight', frame: 'open', spacing: 100, rotation: 0, motifScale: 100, bridge: true, dyePalette: 'indigo', dyeDepth: 3 } }], title: '花开有时' });

test('editing a saved pack bumps patch once and preserves the saved snapshot', () => {
  const original = pack(), store = createDraftStore(original);
  store.edit(draft => { draft.title = '花开的地方'; });
  store.edit(draft => { draft.choices[0].title = '六瓣团花'; });
  assert.equal(store.pack.version, '1.2.4'); assert.equal(store.saved.title, '花开有时'); assert.equal(original.choices[0].title, '团花'); assert.equal(store.dirty, true);
  store.markSaved(store.pack); store.edit(draft => { draft.title = '再一版'; });
  assert.equal(store.pack.version, '1.2.5');
});

test('explicit version edits and imported unsaved packs retain the chosen version', () => {
  const store = createDraftStore(pack()); store.edit(draft => { draft.version = '2.0.0'; }, { bump: false });
  store.edit(draft => { draft.title = '新展览'; }); assert.equal(store.pack.version, '2.0.0');
  store.replace({ ...pack(), version: '4.0.0' }, { unsaved: true }); store.edit(draft => { draft.title = '导入后修改'; }); assert.equal(store.pack.version, '4.0.0');
});

test('moving the optional exploration step preserves mandatory visitor sequence', () => {
  const steps = ['choose', 'explore', 'create', 'reveal', 'takeaway'];
  assert.deepEqual(moveStep(steps, 1, 1), ['choose', 'create', 'explore', 'reveal', 'takeaway']);
  assert.deepEqual(moveStep(steps, 2, 1), steps);
  assert.deepEqual(moveStep(steps, 0, 1), steps);
  assert.deepEqual(moveStep(steps, 3, 1), steps);
  assert.deepEqual(steps, ['choose', 'explore', 'create', 'reveal', 'takeaway']);
});

test('condition field defaults have typed values suitable for human form controls', () => {
  assert.deepEqual(defaultCondition('stage'), { field: 'stage', operator: 'eq', value: 'reveal' });
  assert.deepEqual(defaultCondition('coverage'), { field: 'coverage', operator: 'gte', value: 70 });
  assert.equal(defaultCondition('dyeDepth').value, 3); assert.equal(defaultCondition('customCells').value, 1);
});

test('choice canvas preview uses actual engine geometry, dye and fully coated reveal', () => {
  const first = presetDocument(pack().choices[0].preset), second = presetDocument({ ...pack().choices[0].preset, motif: 'wave', dyePalette: 'teal' });
  assert.equal(first.stage, 'reveal'); assert(first.coverage.some(Boolean));
  assert.deepEqual(first.coverage, createMask(first)); assert.notDeepEqual(renderPixels(first), renderPixels(second));
  const custom = presetDocument({ ...pack().choices[0].preset, motif: 'custom', customPattern: Array(256).fill(1) }); assert(custom.coverage.some(Boolean));
});

test('pack cloning and HTML encoding do not alias state or turn stories into markup', () => {
  const original = pack(), copied = clonePack(original); copied.choices[0].title = '变更'; assert.equal(original.choices[0].title, '团花');
  assert.equal(escapeHTML('<img src="x" onerror=\'x\'> &'), '&lt;img src=&quot;x&quot; onerror=&#39;x&#39;&gt; &amp;');
  assert.equal(bumpVersion('1.0.9'), '1.0.10');
});

test('writes include the local token and expose actual server error messages', async () => {
  let sent;
  const result = await requestJSON('/api/packs', { method: 'POST', body: { pack: pack() }, token: 'local-token', fetcher: async (url, init) => { sent = { url, init }; return { ok: true, json: async () => ({ pack: pack() }) }; } });
  assert.equal(result.pack.id, 'flowers'); assert.equal(sent.init.headers['X-Liubai-Token'], 'local-token'); assert.equal(JSON.parse(sent.init.body).pack.version, '1.2.3');
  await assert.rejects(requestJSON('/api/packs', { fetcher: async () => ({ ok: false, json: async () => ({ error: 'conflict', message: '这个版本已经存在，请增加版本号。' }) }) }), /请增加版本号/);
  await assert.rejects(requestJSON('/api/packs', { fetcher: async () => ({ ok: false, json: async () => ({ error: '禁止保存' }) }) }), /禁止保存/);
});

test('curator entry keeps native forms, preview contract and local-only access gate', async () => {
  const html = await readFile(new URL('../site/curator.html', import.meta.url), 'utf8'), js = await readFile(new URL('../site/curator.js', import.meta.url), 'utf8');
  assert.equal(PREVIEW_STORAGE_KEY, 'liubai.preview.pack');
  assert.match(html, /请在展屏主机/); assert.match(html, /策展工作台/); assert.match(html, /name="intro"/); assert.match(html, /id="condition-list"/);
  assert.match(js, /window\.open\('\/\?preview=1', 'liubai-preview'\)/); assert.match(js, /!bootstrap\.operator \|\| !bootstrap\.csrfToken/);
});
