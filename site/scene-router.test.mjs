import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneState, resolveSceneTarget, initSceneRouter } from './scene-router.js';

test('scene destinations preserve meaningful old anchors and reject unknown links', () => {
  const available = ['home', 'craft', 'atlas', 'studio', 'heritage'];
  assert.deepEqual(resolveSceneTarget('#journey', available), { id: 'craft', anchor: 'journey' });
  assert.deepEqual(resolveSceneTarget('#collection', available), { id: 'studio', anchor: 'collection' });
  assert.deepEqual(resolveSceneTarget('#sources', available), { id: 'heritage', anchor: 'sources' });
  assert.deepEqual(resolveSceneTarget('#experiments', available), { id: 'craft', anchor: 'experiments' });
  assert.deepEqual(resolveSceneTarget('#missions', available), { id: 'studio', anchor: 'missions' });
  assert.deepEqual(resolveSceneTarget('#living-gallery', available), { id: 'heritage', anchor: 'living-gallery' });
  assert.deepEqual(resolveSceneTarget('atlas', available), { id: 'atlas', anchor: null });
  for (const input of ['https://example.com/#atlas', '#unknown', '#%zz', '', null]) assert.equal(resolveSceneTarget(input, available), null);
});

test('rapid replacement prevents the obsolete cover animation committing', () => {
  const state = createSceneState('home');
  const first = state.begin('craft');
  const last = state.begin('atlas');
  assert.equal(state.commit(first), false);
  assert.equal(state.current, 'home');
  assert.equal(state.commit(last), true);
  assert.equal(state.current, 'atlas');
});

test('replacement after a scene commits starts from the actually visible scene', () => {
  const state = createSceneState('home');
  const first = state.begin('craft'); state.commit(first);
  const replacement = state.begin('studio');
  assert.equal(replacement.previous, 'craft');
  assert.equal(state.isLatest(first), false);
  assert.equal(state.commit(replacement), true);
  assert.equal(state.current, 'studio');
});

test('returning to the original scene supersedes a pending transition', () => {
  const state = createSceneState('home');
  const abandoned = state.begin('heritage');
  const back = state.begin('home');
  assert.equal(state.commit(back), true);
  assert.equal(state.commit(abandoned), false);
  assert.equal(state.current, 'home');
});

test('reading positions are independent and invalid offsets cannot poison return', () => {
  const state = createSceneState('home');
  state.remember('atlas', 1280); state.remember('studio', 482);
  state.remember('atlas', NaN); state.remember('home', -70);
  assert.equal(state.position('atlas'), 1280);
  assert.equal(state.position('studio'), 482);
  assert.equal(state.position('home'), 0);
  assert.equal(state.position('craft'), 0);
});

// A small event/animation harness exercises the actual async router, not GPU
// rendering, typography, compositor frames or the visible transition quality.
function bootRouter({ initialHash = '#home', initialHistory = null } = {}) {
  const animationLog = [], historyLog = [], ids = new Map();
  function classList() {
    const values = new Set();
    return { add: (...names) => names.forEach(n => values.add(n)), remove: (...names) => names.forEach(n => values.delete(n)), contains: n => values.has(n), toggle(n, value) { const next = value ?? !values.has(n); if (next) values.add(n); else values.delete(n); return next; } };
  }
  class Element extends EventTarget {
    constructor(id = '') { super(); this.id = id; this.dataset = {}; this.hidden = false; this.inert = false; this.classList = classList(); this.attributes = new Map(); this.nodes = new Map(); this.textContent = ''; this.owner = null; this.layoutTop = 0; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    querySelector(selector) { return this.nodes.get(selector) || null; }
    querySelectorAll(selector) { const result = this.nodes.get(selector); return Array.isArray(result) ? result : []; }
    contains(node) { for (let next = node; next; next = next.owner) if (next === this) return true; return false; }
    getBoundingClientRect() { return { top: this.layoutTop - window.scrollY }; }
    matches() { return false; }
    focus() { document.activeElement = this; }
    animate(keyframes, options) {
      let resolve, reject;
      const animation = { element: this, keyframes, options, settled: false, cancelled: false, finished: new Promise((a, b) => { resolve = a; reject = b; }), finish() { if (this.settled) return; this.settled = true; resolve(); }, cancel() { this.cancelled = true; if (this.settled) return; this.settled = true; reject(new Error('cancelled')); } };
      animationLog.push(animation); return animation;
    }
  }
  const scenes = ['home', 'craft', 'atlas', 'studio', 'heritage'].map(id => {
    const scene = new Element(id); scene.dataset.scene = id; scene.dataset.sceneTitle = id;
    const heading = new Element(`${id}-heading`); heading.owner = scene;
    scene.nodes.set('h1, h2, h3, [data-scene-heading]', heading); ids.set(id, scene); return scene;
  });
  const views = [], viewLinks = [], viewGroups = [], routeLinks = [], sectionNav = new Element('section-nav');
  for (const [sceneId, keys] of Object.entries({ craft: ['craft-intro', 'journey', 'anatomy', 'experiments', 'sample'], studio: ['studio', 'missions', 'collection'], heritage: ['living-gallery', 'sources'] })) {
    const owner = scenes.find(scene => scene.dataset.scene === sceneId), group = new Element(); group.dataset.viewNav = sceneId; viewGroups.push(group);
    const sceneViews = keys.map(key => {
      const view = new Element(key); view.dataset.view = key; view.owner = owner; ids.set(key, view); views.push(view);
      const heading = new Element(`${key}-heading`); heading.owner = view; view.nodes.set('h1, h2, h3, [data-scene-heading]', heading);
      const link = new Element(); link.dataset.viewLink = key; link.textContent = `功能 ${key}`; link.href = `#${key === 'craft-intro' ? 'craft' : key}`; viewLinks.push(link);
      return view;
    });
    owner.nodes.set('[data-view]', sceneViews);
  }
  for (const sceneId of ['craft', 'atlas', 'studio', 'heritage']) { const link = new Element(); link.dataset.route = sceneId; routeLinks.push(link); }
  for (const [id, owner, top] of [['creative-lab', 'studio', 600], ['custom-editor', 'studio', 900]]) {
    const anchor = new Element(id); anchor.owner = views.find(view => view.dataset.view === owner); anchor.layoutTop = top; ids.set(id, anchor);
  }
  const curtain = new Element('scene-curtain'), label = new Element(), panels = [new Element(), new Element(), new Element()], words = [new Element(), new Element()];
  curtain.nodes.set('.scene-curtain-panel', panels); curtain.nodes.set('.scene-curtain-label', label); curtain.nodes.set('.scene-curtain-words span', words);
  label.nodes.set('small', new Element()); label.nodes.set('.scene-curtain-number', new Element());
  ids.set(curtain.id, curtain); ids.set('scene-live', new Element('scene-live'));
  const doc = new EventTarget(); doc.documentElement = new Element(); doc.body = { append() {} }; doc.hidden = false;
  doc.getElementById = id => ids.get(id) || null; doc.createElement = () => new Element();
  doc.querySelectorAll = selector => ({ 'section[data-scene]': scenes, '[data-view-link]': viewLinks, '[data-view-nav]': viewGroups, '[data-route]': routeLinks })[selector] || [];
  doc.querySelector = selector => selector === '.section-nav' ? sectionNav : null;
  const win = new EventTarget(); win.scrollY = 0; win.scrollTo = ({ top }) => { win.scrollY = top; };
  const loc = { hash: initialHash, href: `http://localhost/${initialHash}` };
  const hist = { state: initialHistory, scrollRestoration: 'auto', pushState(value, _, hash) { this.state = value; loc.hash = hash; loc.href = `http://localhost/${hash}`; historyLog.push(hash); }, replaceState(value, _, url) { this.state = value; if (url.startsWith('#')) { loc.hash = url; loc.href = `http://localhost/${url}`; } } };
  const media = new EventTarget(); media.matches = false;
  const raf = new Map(); let rafId = 0;
  const names = { document: doc, window: win, location: loc, history: hist, matchMedia: () => media, getComputedStyle: element => ({ scrollPaddingTop: '0', ...element.computed }), requestAnimationFrame: fn => { raf.set(++rafId, fn); return rafId; }, cancelAnimationFrame: id => raf.delete(id) };
  const originals = new Map();
  for (const [name, value] of Object.entries(names)) { originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }); }
  const api = initSceneRouter();
  return {
    api, scenes, views, viewLinks, viewGroups, routeLinks, sectionNav, doc, win, hist, loc, historyLog, curtain, panels, label, words, animationLog, ids, media,
    clickContentLink(hash) {
      const link = { dataset: {}, target: '', hasAttribute: () => false, getAttribute: name => name === 'href' ? hash : null };
      const event = new Event('click', { cancelable: true });
      Object.defineProperties(event, { target: { value: { closest: () => link } }, button: { value: 0 }, detail: { value: 1 } });
      doc.dispatchEvent(event); return event;
    },
    clickViewLink(key, keyboard = false) {
      const source = viewLinks.find(link => link.dataset.viewLink === key);
      const link = { dataset: source.dataset, target: '', hasAttribute: () => false, getAttribute: name => name === 'href' ? source.href : null };
      const event = new Event('click', { cancelable: true });
      Object.defineProperties(event, { target: { value: { closest: () => link } }, button: { value: 0 }, detail: { value: keyboard ? 0 : 1 } });
      doc.activeElement = source; doc.dispatchEvent(event); return event;
    },
    clickSceneLink(id) {
      const link = { dataset: { route: id }, target: '', hasAttribute: () => false, getAttribute: () => `#${id}` };
      const event = new Event('click', { cancelable: true });
      Object.defineProperties(event, { target: { value: { closest: () => link } }, button: { value: 0 }, detail: { value: 1 } });
      doc.dispatchEvent(event); return event;
    },
    flushScroll() { win.dispatchEvent(new Event('scroll')); for (const fn of raf.values()) fn(); raf.clear(); },
    async finishPhase() { for (const animation of animationLog) if (!animation.settled) animation.finish(); for (let i = 0; i < 12; i++) await Promise.resolve(); },
    cleanup() { api.destroy(); for (const [name, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } }
  };
}

test('actual async route replacement commits only the latest target and clears all filled effects', async () => {
  const app = bootRouter();
  try {
    const first = app.api.navigate('craft');
    const last = app.api.navigate('atlas');
    await app.finishPhase(); await app.finishPhase(); await last; await first;
    assert.equal(app.api.current, 'atlas');
    assert.deepEqual(app.historyLog, ['#atlas']);
    assert.deepEqual(app.scenes.filter(scene => !scene.hidden).map(scene => scene.dataset.scene), ['atlas']);
    assert.equal(app.curtain.hidden, true);
    assert.equal(app.doc.documentElement.classList.contains('scene-switching'), false);
    assert.equal(app.animationLog.every(animation => animation.cancelled), true);
    assert.equal(app.scenes.find(scene => scene.dataset.scene === 'atlas').inert, false);
  } finally { app.cleanup(); }
});

test('changing a destination during cover reuses the currently painted carrier poses', async () => {
  const app = bootRouter();
  try {
    const first = app.api.navigate('craft'), source = app.scenes[0];
    source.computed = { opacity: '.63', transform: 'matrix(1.02, 0, 0, 1.02, -12, -7)' };
    app.panels.forEach((panel, i) => { panel.computed = { transform: `matrix(1, 0, -.17, 1, 0, ${340 + i * 40})` }; });
    app.label.computed = { opacity: '.46', transform: 'matrix(1, 0, 0, 1, 0, 4)' };
    app.words.forEach(word => { word.computed = { transform: 'matrix(1, 0, 0, 1, -15, 8)', clipPath: 'inset(0px 0px 35% 0px)' }; });
    const offset = app.animationLog.length;
    const replacement = app.api.navigate('atlas'), next = app.animationLog.slice(offset);
    assert.equal(app.curtain.hidden, false, 'the material stays on screen during replacement');
    for (const element of [source, ...app.panels, app.label, ...app.words]) {
      const animation = next.find(item => item.element === element);
      for (const [property, value] of Object.entries(element.computed)) assert.equal(animation.keyframes[0][property], value);
    }
    await app.finishPhase(); await app.finishPhase(); await replacement; await first;
    assert.equal(app.api.current, 'atlas'); assert.equal(app.curtain.hidden, true);
    assert.deepEqual(app.historyLog, ['#atlas']);
  } finally { app.cleanup(); }
});

test('changing direction during arrival covers the visible destination from its current pose', async () => {
  const app = bootRouter();
  try {
    const first = app.api.navigate('craft'); await app.finishPhase();
    assert.equal(app.api.current, 'craft');
    const source = app.scenes.find(scene => scene.dataset.scene === 'craft');
    source.computed = { opacity: '.54', transform: 'matrix(1.015, 0, 0, 1.015, 13, 9)' };
    app.panels[0].computed = { transform: 'matrix(1, 0, -.17, 1, 0, -230)' };
    app.label.computed = { opacity: '.2', transform: 'matrix(1, 0, 0, 1, 0, -24)' };
    const offset = app.animationLog.length, replacement = app.api.navigate('studio');
    const next = app.animationLog.slice(offset);
    assert.deepEqual(next.find(item => item.element === source).keyframes[0], source.computed);
    assert.equal(next.find(item => item.element === app.panels[0]).keyframes[0].transform, app.panels[0].computed.transform);
    assert.deepEqual(next.find(item => item.element === app.label).keyframes[0], app.label.computed);
    await app.finishPhase(); await app.finishPhase(); await replacement; await first;
    assert.equal(app.api.current, 'studio'); assert.equal(app.curtain.hidden, true);
    assert.deepEqual(app.scenes.filter(scene => !scene.hidden).map(scene => scene.dataset.scene), ['studio']);
  } finally { app.cleanup(); }
});

test('cancelling back to the visible scene retracts the current cover and leaves no blocking state', async () => {
  const app = bootRouter();
  try {
    const first = app.api.navigate('craft');
    app.panels[0].computed = { transform: 'matrix(1, 0, -.17, 1, 0, 180)' };
    const offset = app.animationLog.length, back = app.api.navigate('home');
    const panel = app.animationLog.slice(offset).find(item => item.element === app.panels[0]);
    assert.equal(panel.keyframes[0].transform, app.panels[0].computed.transform);
    assert.equal(panel.keyframes[1].transform, 'translate3d(0,112%,0) skewX(-10deg)');
    await app.finishPhase(); await back; await first;
    assert.equal(app.api.current, 'home'); assert.equal(app.curtain.hidden, true);
    assert.equal(app.scenes[0].inert, false);
    assert.equal(app.doc.documentElement.classList.contains('scene-switching'), false);
    assert.deepEqual(app.historyLog, []);
  } finally { app.cleanup(); }
});

test('hiding the page during cover settles the latest target without waiting for compositor frames', async () => {
  const app = bootRouter();
  try {
    const pending = app.api.navigate('studio');
    app.doc.hidden = true; app.doc.dispatchEvent(new Event('visibilitychange'));
    await app.finishPhase(); await pending;
    assert.equal(app.api.current, 'studio');
    assert.equal(app.curtain.hidden, true);
    assert.equal(app.doc.documentElement.classList.contains('scene-switching'), false);
    assert.deepEqual(app.historyLog, ['#studio']);
  } finally { app.cleanup(); }
});

test('an initial old content deep link selects its view at the top', () => {
  const app = bootRouter({ initialHash: '#journey' });
  try {
    assert.equal(app.api.current, 'craft');
    assert.equal(app.api.view, 'journey');
    assert.equal(app.win.scrollY, 0);
  } finally { app.cleanup(); }
});

test('browser history restores the reading position beyond a deep-link anchor', async () => {
  const app = bootRouter();
  try {
    await app.api.navigate('#journey', { instant: true });
    assert.equal(app.win.scrollY, 0);
    app.win.scrollY = 1430;
    await app.api.navigate('atlas', { instant: true });
    const pushes = app.historyLog.length;
    // Emulate the browser selecting the old entry before firing popstate.
    app.loc.hash = '#journey'; app.hist.state = { indigoScene: 'craft', indigoView: 'journey', indigoScrollY: 1430 };
    app.doc.hidden = true; app.win.dispatchEvent(new Event('popstate'));
    await app.finishPhase();
    assert.equal(app.api.current, 'craft');
    assert.equal(app.win.scrollY, 1430);
    assert.equal(app.historyLog.length, pushes, 'back navigation must not create another entry');
  } finally { app.cleanup(); }
});

test('a content link to studio selects the workspace rather than leaving the archive visible', async () => {
  const app = bootRouter();
  try {
    await app.api.navigate('#collection', { instant: true });
    app.win.scrollY = 2800;
    const event = app.clickContentLink('#studio');
    await app.finishPhase();
    assert.equal(event.defaultPrevented, true);
    assert.equal(app.api.current, 'studio');
    assert.equal(app.api.view, 'studio');
    assert.equal(app.win.scrollY, 0);
    assert.equal(app.loc.hash, '#studio');
    assert.equal(app.curtain.hidden, true, 'same-scene content navigation needs no covering transition');
  } finally { app.cleanup(); }
});

test('default and deep-link views expose exactly one matching panel and navigation group', () => {
  for (const [hash, sceneId, view] of [['#craft','craft','craft-intro'],['#experiments','craft','experiments'],['#missions','studio','missions'],['#collection','studio','collection'],['#heritage','heritage','living-gallery'],['#sources','heritage','sources']]) {
    const app = bootRouter({ initialHash: hash });
    try {
      assert.equal(app.api.current, sceneId); assert.equal(app.api.view, view);
      assert.equal(app.doc.documentElement.dataset.view, view);
      assert.deepEqual(app.views.filter(node => !node.hidden).map(node => node.dataset.view), [view]);
      assert.equal(app.views.filter(node => !node.inert).length, 1);
      assert.deepEqual(app.viewLinks.filter(node => node.getAttribute('aria-current') === 'page').map(node => node.dataset.viewLink), [view]);
      assert.deepEqual(app.viewGroups.filter(node => !node.hidden).map(node => node.dataset.viewNav), [sceneId]);
    } finally { app.cleanup(); }
  }
});

test('same-scene view navigation uses its short animation and keyboard focus stays on the view link', async () => {
  const app = bootRouter({ initialHash: '#studio' });
  try {
    const events = []; app.win.addEventListener('indigo:scene', event => events.push(event.detail));
    const event = app.clickViewLink('missions', true), link = app.viewLinks.find(node => node.dataset.viewLink === 'missions');
    assert.equal(event.defaultPrevented, true); assert.equal(app.api.view, 'missions'); assert.equal(app.curtain.hidden, true);
    assert.equal(app.animationLog.length, 1); assert.equal(app.animationLog[0].options.duration, 220);
    await app.finishPhase();
    assert.equal(app.doc.activeElement, link);
    assert(events.some(detail => detail.id === 'studio' && detail.view === 'missions' && detail.previousView === 'studio'));
    assert.match(app.ids.get('scene-live').textContent, /missions/);
  } finally { app.cleanup(); }
});

test('top-level scene navigation returns to its default view without preserving a stale panel offset', async () => {
  const app = bootRouter({ initialHash: '#missions' });
  try {
    app.win.scrollY = 940; app.clickSceneLink('studio'); await app.finishPhase();
    assert.equal(app.api.view, 'studio'); assert.equal(app.win.scrollY, 0); assert.equal(app.loc.hash, '#studio');
    assert.equal(app.curtain.hidden, true);
    assert.deepEqual(app.views.filter(node => !node.hidden).map(node => node.dataset.view), ['studio']);
  } finally { app.cleanup(); }
});

test('rapid view changes cancel the old fade and only the latest panel remains visible', async () => {
  const app = bootRouter({ initialHash: '#studio' });
  try {
    const first = app.api.navigate('missions'), last = app.api.navigate('collection');
    await app.finishPhase(); await first; await last;
    assert.equal(app.api.view, 'collection'); assert.equal(app.loc.hash, '#collection');
    assert.deepEqual(app.views.filter(node => !node.hidden).map(node => node.dataset.view), ['collection']);
    assert.equal(app.animationLog.every(animation => animation.cancelled), true);
    assert.equal(app.curtain.hidden, true);
  } finally { app.cleanup(); }
});

test('new view intent can retract an interrupted scene cover without leaving blocking material', async () => {
  const app = bootRouter({ initialHash: '#missions' });
  try {
    const cover = app.api.navigate('craft');
    app.panels.forEach(panel => { panel.computed = { transform: 'matrix(1,0,-.17,1,0,160)' }; });
    const view = app.api.navigate('collection');
    await app.finishPhase(); await cover; await view;
    assert.equal(app.api.current, 'studio'); assert.equal(app.api.view, 'collection');
    assert.equal(app.curtain.hidden, true); assert.equal(app.scenes.find(node => node.dataset.scene === 'studio').inert, false);
    assert.deepEqual(app.historyLog, ['#collection']);
    assert(app.animationLog.some(animation => animation.element === app.panels[0] && animation.keyframes[0].transform === 'matrix(1,0,-.17,1,0,160)'));
  } finally { app.cleanup(); }
});

test('child-anchor events and direct refresh select the containing studio view and target the child', async () => {
  for (const hash of ['#creative-lab', '#custom-editor']) {
    const app = bootRouter({ initialHash: hash });
    try {
      assert.equal(app.api.current, 'studio'); assert.equal(app.api.view, 'studio');
      assert.equal(app.loc.hash, hash); assert.equal(app.win.scrollY, hash === '#custom-editor' ? 900 : 600);
    } finally { app.cleanup(); }
  }
  const app = bootRouter({ initialHash: '#missions' });
  try {
    app.win.dispatchEvent(new CustomEvent('indigo:navigate', { detail: { id: 'studio', anchor: 'custom-editor', focus: 'custom-editor' } }));
    await app.finishPhase();
    assert.equal(app.api.view, 'studio'); assert.equal(app.win.scrollY, 900); assert.equal(app.doc.activeElement, app.ids.get('custom-editor'));
  } finally { app.cleanup(); }
});

test('history saves scrolling per view and a browser return restores the exact requested entry', async () => {
  const app = bootRouter({ initialHash: '#missions' });
  try {
    app.win.scrollY = 540; app.flushScroll();
    const missionEntry = { ...app.hist.state }; assert.equal(missionEntry.indigoView, 'missions'); assert.equal(missionEntry.indigoScrollY, 540);
    await app.api.navigate('collection', { instant: true }); assert.equal(app.win.scrollY, 0);
    app.win.scrollY = 930; app.flushScroll(); const collectionEntry = { ...app.hist.state };
    app.loc.hash = '#missions'; app.hist.state = missionEntry; app.doc.hidden = true; app.win.dispatchEvent(new Event('popstate')); await app.finishPhase();
    assert.equal(app.api.view, 'missions'); assert.equal(app.win.scrollY, 540);
    app.loc.hash = '#collection'; app.hist.state = collectionEntry; app.win.dispatchEvent(new Event('popstate')); await app.finishPhase();
    assert.equal(app.api.view, 'collection'); assert.equal(app.win.scrollY, 930);
    assert.deepEqual(app.historyLog, ['#collection']);
  } finally { app.cleanup(); }
});

test('manual scrolling never changes the active view and quiet mode settles a pending view selection', async () => {
  const app = bootRouter({ initialHash: '#craft' });
  try {
    app.win.scrollY = 7000; app.flushScroll(); assert.equal(app.api.view, 'craft-intro');
    const pending = app.api.navigate('experiments');
    app.media.matches = true; app.media.dispatchEvent(new Event('change')); await app.finishPhase(); await pending;
    assert.equal(app.api.view, 'experiments'); assert.equal(app.curtain.hidden, true);
    assert.deepEqual(app.views.filter(node => !node.inert).map(node => node.dataset.view), ['experiments']);
  } finally { app.cleanup(); }
});
