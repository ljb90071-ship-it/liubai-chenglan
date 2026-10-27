// Run: node --test app.test.mjs
// Minimal DOM event regression harness. It does not test browser rendering or downloads.
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from './engine.js';
import * as visitorSession from './visitor-session.js';

const appSource = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from '\.\/engine\.js(?:\?[^']*)?';/, '')
  .replace(/^import .*?from '\.\/visitor-session\.js(?:\?[^']*)?';/m, '');
const COLLECTION_KEY = 'yifanglan.collection.v1';
const DRAFT_KEY = 'yifanglan.draft.v1';

function boot(storage = new Map(), { router = false, failCollectionWrite = false, mode = 'personal', blobCallbacks = [] } = {}) {
  const elements = new Map();
  const timers = new Map();
  const appended = [];
  let timerId = 0;
  class Element {
    constructor(tag = 'div') {
      this.tag = tag; this.children = []; this.listeners = new Map();
      this.style = {}; this.dataset = {}; this.value = ''; this.checked = false;
      this.width = this.height = 720;
      this.classList = { toggle() {} };
    }
    set id(value) { this._id = value; elements.set(value, this); }
    get id() { return this._id; }
    addEventListener(name, fn) {
      if (!this.listeners.has(name)) this.listeners.set(name, []);
      this.listeners.get(name).push(fn);
    }
    fire(name, detail = {}) {
      for (const fn of this.listeners.get(name) || []) fn({ target: this, preventDefault() {}, ...detail });
    }
    append(...items) { this.children.push(...items); }
    after(...items) { appended.push(...items); }
    closest(selector) {
      assert.equal(selector, 'label');
      if (!this.label) this.label = new Element('label');
      return this.label;
    }
    replaceChildren(...items) { this.children = [...items]; }
    querySelectorAll(tag) { return this.children.filter(element => element.tag === tag); }
    setAttribute() {} focus() {} remove() {}
    getContext() { return new Proxy({}, { get: () => () => {} }); }
    toBlob(fn) { blobCallbacks.push(fn); }
    click() { this.fire('click'); }
  }
  const get = id => {
    if (!elements.has(id)) { const element = new Element(); element.id = id; }
    return elements.get(id);
  };
  const window = new Element('window');
  const browserStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { if (failCollectionWrite && key === COLLECTION_KEY) throw new Error('storage unavailable'); storage.set(key, value); }, removeItem: key => storage.delete(key) };
  window.location = { search: mode ? `?mode=${mode}` : '' };
  window.localStorage = browserStorage;
  window.sessionStorage = browserStorage;
  window.confirm = () => true;
  const navigation = [];
  class CustomEvent { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } }
  if (router) {
    window.CustomEvent = CustomEvent;
    window.dispatchEvent = event => { if (event.type === 'indigo:navigate') navigation.push(event.detail); window.fire(event.type, event); return true; };
  }
  const context = vm.createContext({
    ...engine, ...visitorSession, console, Uint8Array, Date, Math, JSON, Number, Object, Set,
    ImageData: class { constructor(data) { this.data = data; } },
    document: { getElementById: get, createElement: tag => new Element(tag), body: new Element('body'), documentElement: router ? { dataset: { sceneRouter: 'ready' } } : undefined },
    CustomEvent,
    window, location: { hash: '', search: window.location.search },
    localStorage: browserStorage,
    requestAnimationFrame: () => 1,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(appSource + '\n globalThis.inspect = () => ({doc, activeId, history, draftBlocked});', context, { filename: 'app.js' });
  return {
    storage, get, appended, navigation, workbench: window.indigoWorkbench, visitor: window.indigoVisitorSession, window, blobCallbacks,
    importFile(file) { return get('import-json').listeners.get('change')[0]({ target: Object.assign(get('import-json'), { files: [file] }) }); },
    inspect: () => context.inspect(),
    click: id => get(id).fire('click'),
    fire: (id, name, detail) => get(id).fire(name, detail),
    newPattern(detail) {
      let rejected = false;
      window.fire('indigo:new-pattern', { detail, preventDefault() { rejected = true; } });
      return !rejected;
    },
    creativeEdit(patch, recordHistory = true) {
      let rejected = false;
      window.fire('indigo:creative-edit', { detail: { patch, recordHistory }, preventDefault() { rejected = true; } });
      return !rejected;
    },
    pagehide: () => window.fire('pagehide'),
    name(value) { get('piece-name').value = value; get('piece-name').fire('input'); },
    records: () => JSON.parse(storage.get(COLLECTION_KEY) || '[]'),
    flushTimers() {
      const pending = [...timers.values()]; timers.clear();
      for (const fn of pending) fn();
    },
    reopen(name) {
      const card = get('gallery').children.find(element => element.children[1]?.textContent === name);
      assert(card, `saved card ${name} exists`);
      card.children[3].children[0].fire('click');
    }
  };
}

test('public workbench ignores personal browser data and next visitor cannot undo or reopen a predecessor', () => {
  const privateDoc=engine.serializeDocument(engine.createDocument());privateDoc.name='个人旧作';
  const previous=new Map([[DRAFT_KEY,JSON.stringify(privateDoc)],['venue.config','keep']]);
  const h=boot(previous,{mode:'kiosk',router:true});
  assert.notEqual(h.workbench.snapshot().name,'个人旧作');
  h.name('游客A');h.click('coat-all');h.click('save');h.flushTimers();
  assert.equal(JSON.parse(h.visitor.storage.getItem(COLLECTION_KEY)).length,1);
  let resetEvent;h.window.addEventListener('indigo:session-reset',event=>{resetEvent=event.detail;});
  h.workbench.beginVisitor({sessionId:'visitor_B'});
  assert.equal(resetEvent.sessionId,'visitor_B');assert.equal(h.inspect().history.length,0);
  assert.equal(h.inspect().activeId,null);assert.notEqual(h.workbench.snapshot().name,'游客A');
  assert.equal(h.workbench.snapshot().coverage.some(Boolean),false);
  assert.equal(h.visitor.storage.getItem(COLLECTION_KEY),null);
  h.click('undo');h.pagehide();h.flushTimers();
  assert.notEqual(h.workbench.snapshot().name,'游客A');assert.equal(previous.get('venue.config'),'keep');
  assert.equal(previous.get(DRAFT_KEY),JSON.stringify(privateDoc));
  const reloaded=boot(previous,{mode:'kiosk'});assert.notEqual(reloaded.workbench.snapshot().name,'游客A');
});

test('handoff restores exact partial paste synchronously and snapshot cannot mutate live work', () => {
  const h=boot();const d=engine.createDocument();d.name='旅行中的蓝';d.motif='sprig';
  engine.coatStroke(d,engine.createMask(d),{x:50,y:50},{x:150,y:90});d.stage='reveal';
  const saved=engine.serializeDocument(d);h.click('coat-all');h.workbench.loadDesign(saved);
  assert.deepEqual(JSON.parse(JSON.stringify(h.workbench.snapshot())),saved);
  assert.equal(h.inspect().history.length,0);h.click('undo');assert.equal(h.workbench.snapshot().name,saved.name);
  const copy=h.workbench.snapshot();copy.coverage.fill(0);copy.name='changed';
  assert.equal(h.workbench.snapshot().name,saved.name);assert.deepEqual(Array.from(h.inspect().doc.coverage),saved.coverage);
  h.pagehide();assert.equal(JSON.parse(h.storage.get(DRAFT_KEY)).design.name,saved.name);
});

test('invalid new visitor and handoff leave the active work and its history intact', () => {
  const h=boot();h.name('保留');h.click('coat-all');const before=h.workbench.snapshot(),length=h.inspect().history.length;
  assert.throws(()=>h.workbench.beginVisitor({sessionId:'../bad'}));
  assert.throws(()=>h.workbench.beginVisitor({sessionId:'valid',design:{}}));
  assert.throws(()=>h.workbench.loadDesign({}));
  assert.deepEqual(JSON.parse(JSON.stringify(h.workbench.snapshot())),JSON.parse(JSON.stringify(before)));
  assert.equal(h.inspect().history.length,length);
});

test('disabled exhibit controls reject DOM edits, auxiliary events and imported designs', async () => {
  const h=boot();h.workbench.applyPreset({motif:'sprig',bridge:true});h.workbench.setAllowedControls([]);
  assert.equal(h.get('motif').disabled,true);assert.equal(h.get('bridge').disabled,true);
  h.get('motif').value='wave';h.fire('motif','change');assert.equal(h.workbench.snapshot().motif,'sprig');
  assert.equal(h.creativeEdit({dyePalette:'teal'}),false);
  assert.equal(h.creativeEdit({motif:'custom',customPattern:engine.createCustomPattern()}),false);
  assert.equal(h.newPattern({motif:'lotus',repeat:'straight',motifScale:100,spacing:100,frame:'bordered',bridge:true}),false);
  const other=engine.serializeDocument(engine.createDocument());
  await h.importFile({size:100,text:async()=>JSON.stringify(other)});
  assert.equal(h.workbench.snapshot().motif,'sprig');
  h.click('reset');assert.equal(h.workbench.snapshot().motif,'sprig');
  h.click('coat-all');h.click('dye');h.click('reveal');
  h.workbench.setAllowedControls(['motif','layout','custom','palette','bridge']);
  assert.equal(h.get('motif').disabled,true,'revealed stage still disables geometry even when the exhibit permits it');
});

test('a pending import and PNG callback from visitor A cannot alter or download visitor B work', async () => {
  const h=boot(new Map(),{mode:'kiosk'});let resolve;
  const reading=h.importFile({size:100,text:()=>new Promise(done=>{resolve=done;})});
  h.click('export-png');assert.equal(h.blobCallbacks.length,1);
  h.workbench.beginVisitor({sessionId:'B'});h.name('B');
  const old=engine.serializeDocument(engine.createDocument());old.name='A';resolve(JSON.stringify(old));await reading;
  assert.equal(h.workbench.snapshot().name,'B');
  // The VM deliberately has no URL/Blob APIs: stale export must return before using either.
  assert.doesNotThrow(()=>h.blobCallbacks[0]({}));assert.equal(h.workbench.snapshot().name,'B');
});

test('name editing emits the same serialized change state used by the handoff UI', () => {
  const h=boot(new Map(),{router:true});let latest;
  h.window.addEventListener('indigo:change',event=>{latest=event.detail;});h.name('把风留住');
  assert.equal(latest.name,'把风留住');assert.equal(h.workbench.snapshot().name,'把风留住');
});

test('reopening A, undoing to B, then saving updates B and preserves A', () => {
  const h = boot();
  h.name('A'); h.click('save');
  const idA = h.inspect().activeId;
  h.click('reset'); h.name('B'); h.click('save');
  const idB = h.inspect().activeId;
  assert.notEqual(idA, idB);
  h.reopen('A');
  assert.equal(h.inspect().activeId, idA);
  h.click('undo');
  assert.equal(h.inspect().doc.name, 'B');
  assert.equal(h.inspect().activeId, idB);
  h.name('B revised'); h.click('save');
  assert.equal(h.records().length, 2);
  assert.equal(h.records().find(record => record.id === idA).design.name, 'A');
  assert.equal(h.records().find(record => record.id === idB).design.name, 'B revised');
});

test('resetting then undoing restores the saved identity without creating a duplicate', () => {
  const h = boot();
  h.name('Original'); h.click('coat-all'); h.click('save');
  const id = h.inspect().activeId;
  const coverage = Array.from(h.inspect().doc.coverage);
  h.click('reset');
  assert.equal(h.inspect().activeId, null);
  h.click('undo');
  assert.equal(h.inspect().activeId, id);
  assert.deepEqual(Array.from(h.inspect().doc.coverage), coverage);
  h.click('save');
  assert.equal(h.records().length, 1);
  assert.equal(h.records()[0].id, id);
});

test('saving, refreshing from the draft envelope and saving again preserves the same ID', () => {
  const h = boot();
  h.name('Refresh proof'); h.click('save');
  const id = h.inspect().activeId;
  h.flushTimers();
  const draft = JSON.parse(h.storage.get(DRAFT_KEY));
  assert.equal(draft.draftVersion, 1);
  assert.equal(draft.activeId, id);
  const reloaded = boot(h.storage);
  assert.equal(reloaded.inspect().activeId, id);
  assert.equal(reloaded.inspect().doc.name, 'Refresh proof');
  reloaded.click('save');
  assert.equal(reloaded.records().length, 1);
  assert.equal(reloaded.records()[0].id, id);
});

test('successful save reveals an explicit archive entrance without leaving the current workbench', () => {
  const h = boot(new Map(), { router: true });
  assert.equal(h.get('saved-collection-link').hidden, true);
  h.name('蓝白手记'); h.click('save');
  assert.equal(h.get('saved-collection-link').hidden, false);
  assert.equal(h.get('saved-collection-link').href, '#collection');
  assert.equal(h.navigation.length, 0, 'saving must not replace the current view');
  assert.equal(h.records()[0].design.name, '蓝白手记');
  h.name('继续修改');
  assert.equal(h.get('saved-collection-link').hidden, true, 'edited work no longer shows a stale save confirmation');
});

test('failed save offers no false archive confirmation', () => {
  const h = boot(new Map(), { failCollectionWrite: true });
  h.click('save');
  assert.equal(h.get('saved-collection-link').hidden, true);
  assert.match(h.get('status').textContent, /保存失败/);
  assert.equal(h.records().length, 0);
});

test('opening a saved piece requests the visible workbench and restores its exact design', () => {
  const h = boot(new Map(), { router: true });
  h.name('已收藏的蓝'); h.click('coat-all'); h.click('dye'); h.click('reveal'); h.click('save');
  const saved = h.records()[0];
  h.click('reset');
  h.reopen('已收藏的蓝');
  assert.equal(h.inspect().doc.stage, 'reveal');
  assert.equal(h.inspect().activeId, saved.id);
  assert.deepEqual(Array.from(h.inspect().doc.coverage), saved.design.coverage);
  assert.deepEqual(JSON.parse(JSON.stringify(h.navigation.at(-1))), { id: 'studio', anchor: 'studio', focus: 'studio-canvas' });
});

test('a corrupt draft survives initialization, scheduled persistence and pagehide unchanged', () => {
  const original = '{"schemaVersion":1,"broken":';
  const storage = new Map([[DRAFT_KEY, original]]);
  const h = boot(storage);
  assert.equal(h.inspect().draftBlocked, true);
  assert(h.appended.some(element => element.textContent === '下载原始草稿备份'), 'recovery download button is present');
  h.flushTimers();
  assert.equal(storage.get(DRAFT_KEY), original);
  h.name('New draft must not overwrite original');
  h.click('coat-all');
  h.pagehide(); h.flushTimers();
  assert.equal(storage.get(DRAFT_KEY), original);
});

test('explicit reset backs up a corrupt draft before allowing new draft persistence', () => {
  const original = 'broken-original-data';
  const h = boot(new Map([[DRAFT_KEY, original]]));
  h.click('reset');
  assert.equal(h.storage.get(`${DRAFT_KEY}.recovery`), original);
  assert.equal(h.inspect().draftBlocked, false);
  h.pagehide();
  assert.equal(JSON.parse(h.storage.get(DRAFT_KEY)).draftVersion, 1);
  assert.equal(h.storage.get(`${DRAFT_KEY}.recovery`), original);
});

test('25 input events in one slider gesture undo as one action and restore full coating', () => {
  const h = boot();
  h.click('coat-all');
  const before = Array.from(h.inspect().doc.coverage);
  const previousSpacing = h.inspect().doc.spacing;
  const previousHistoryLength = h.inspect().history.length;
  assert(before.some(Boolean));
  for (let spacing = 101; spacing <= 125; spacing++) {
    h.get('spacing').value = String(spacing);
    h.fire('spacing', 'input');
  }
  h.fire('spacing', 'change');
  assert.equal(h.inspect().doc.spacing, 125);
  assert.equal(h.inspect().doc.coverage.some(Boolean), false);
  assert.equal(h.inspect().history.length, previousHistoryLength + 1);
  h.click('undo');
  assert.equal(h.inspect().doc.spacing, previousSpacing);
  assert.deepEqual(Array.from(h.inspect().doc.coverage), before);
  assert.equal(h.get('coverage').textContent, '100%');
});

const atlasPattern = { motif: 'wave', repeat: 'staggered', motifScale: 85, spacing: 110, frame: 'open', bridge: true };

test('starting from an atlas pattern then saving creates a new record and preserves the saved original', () => {
  const h = boot();
  h.name('原来的莲花'); h.click('coat-all'); h.click('dye'); h.click('reveal'); h.click('save');
  const original = h.records()[0];
  assert.equal(h.newPattern(atlasPattern), true);
  const next = h.inspect();
  assert.equal(next.activeId, null);
  assert.equal(next.doc.stage, 'coat');
  assert.equal(next.doc.coverage.some(Boolean), false);
  assert.equal(next.doc.name, '我的第一方蓝');
  for (const [field, value] of Object.entries(atlasPattern)) assert.equal(next.doc[field], value);
  h.name('新的一方水纹'); h.click('coat-all'); h.click('save'); h.flushTimers();
  const records = h.records();
  assert.equal(records.length, 2);
  assert.deepEqual(records.find(record => record.id === original.id), original);
  const newRecord = records.find(record => record.id !== original.id);
  assert.equal(newRecord.design.name, '新的一方水纹');
  assert.equal(newRecord.design.motif, 'wave');
  assert.equal(JSON.parse(h.storage.get(DRAFT_KEY)).activeId, newRecord.id);
});

test('one undo from atlas new-pattern restores the previous stage, coating and saved identity', () => {
  const h = boot();
  h.name('可回去的旧布'); h.click('coat-all'); h.click('dye'); h.click('reveal'); h.click('save');
  const before = JSON.stringify(engine.serializeDocument(h.inspect().doc));
  const id = h.inspect().activeId, historyLength = h.inspect().history.length;
  h.newPattern(atlasPattern);
  assert.equal(h.inspect().history.length, historyLength + 1);
  h.click('undo');
  assert.equal(h.inspect().activeId, id);
  assert.equal(JSON.stringify(engine.serializeDocument(h.inspect().doc)), before);
  h.click('save');
  assert.equal(h.records().length, 1);
  assert.equal(h.records()[0].id, id);
});

test('invalid atlas pattern parameters leave the active work and its saved identity untouched', () => {
  const h = boot();
  h.name('参数错误也不丢'); h.click('coat-all'); h.click('save');
  const before = JSON.stringify(engine.serializeDocument(h.inspect().doc));
  const id = h.inspect().activeId, historyLength = h.inspect().history.length;
  for (const bad of [null, { ...atlasPattern, motif: 'unknown' }, { ...atlasPattern, motifScale: 200 }, { ...atlasPattern, bridge: 'true' }]) {
    assert.equal(h.newPattern(bad), false);
    assert.equal(h.inspect().activeId, id);
    assert.equal(h.inspect().history.length, historyLength);
    assert.equal(JSON.stringify(engine.serializeDocument(h.inspect().doc)), before);
  }
  assert.equal(h.records().length, 1);
});

test('creative color recipes preserve revealed paste and undo as one slider gesture', () => {
  const h = boot(); h.click('coat-all'); h.click('dye'); h.click('reveal');
  const before = engine.serializeDocument(h.inspect().doc), length = h.inspect().history.length;
  assert(h.creativeEdit({ dyePalette: 'teal' }));
  assert.deepEqual(Array.from(h.inspect().doc.coverage), before.coverage);
  assert.equal(h.inspect().doc.stage, 'reveal');
  h.creativeEdit({ dyeDepth: 1 }); h.creativeEdit({ dyeDepth: 2 }, false); h.creativeEdit({ dyeDepth: 5 }, false);
  assert.equal(h.inspect().history.length, length + 2);
  h.click('undo'); assert.equal(h.inspect().doc.dyeDepth, 3); assert.equal(h.inspect().doc.dyePalette, 'teal');
  h.click('undo'); assert.equal(h.inspect().doc.dyePalette, 'indigo');
  assert.deepEqual(engine.serializeDocument(h.inspect().doc), before);
});

test('personal stencil applies in coat, is saved and recovered, and cannot erase a revealed work', () => {
  const h = boot(); h.click('coat-all');
  const pattern = engine.createCustomPattern(); pattern[0] = 1;
  assert(h.creativeEdit({ motif: 'custom', customPattern: pattern }));
  assert.equal(h.inspect().doc.coverage.some(Boolean), false);
  assert.equal(h.inspect().doc.motif, 'custom');
  h.click('coat-all'); h.click('dye'); h.click('reveal'); h.click('save'); h.pagehide();
  const before = engine.serializeDocument(h.inspect().doc);
  assert.equal(h.creativeEdit({ customPattern: Array(256).fill(0) }), false);
  assert.deepEqual(engine.serializeDocument(h.inspect().doc), before);
  const recovered = boot(h.storage);
  assert.deepEqual(engine.serializeDocument(recovered.inspect().doc), before);
  assert.deepEqual(recovered.records()[0].design.customPattern, pattern);
});

test('invalid creative fields are rejected without adding undo or replacing the current work', () => {
  const h = boot(), before = engine.serializeDocument(h.inspect().doc), count = h.inspect().history.length;
  for (const patch of [{ dyeDepth: 6 }, { dyePalette: '__proto__' }, { customPattern: Array(255).fill(1) }, { name: 'unexpected' }, null]) {
    assert.equal(h.creativeEdit(patch), false);
    assert.equal(h.inspect().history.length, count);
    assert.deepEqual(engine.serializeDocument(h.inspect().doc), before);
  }
});

test('a challenge can start a named custom stencil and recipe while retaining the previous work in undo', () => {
  const h = boot(), before = engine.serializeDocument(h.inspect().doc);
  assert(h.newPattern({ ...atlasPattern, motif: 'custom', customPattern: Array(256).fill(1), dyePalette: 'midnight', dyeDepth: 5, name: '我刻的星光', rotation: 35 }));
  assert.equal(h.inspect().doc.dyePalette, 'midnight'); assert.equal(h.inspect().doc.name, '我刻的星光');
  h.click('undo'); assert.deepEqual(engine.serializeDocument(h.inspect().doc), before);
});
