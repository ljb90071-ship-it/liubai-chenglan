/* Scene navigation and cloth-screen choreography. No runtime dependencies.
 * Each scene remains ordinary, scrollable DOM; only its visibility changes.
 */
const ALIASES = Object.freeze({ home: 'home', 'craft-intro': 'craft', journey: 'craft', anatomy: 'craft', experiments: 'craft', sample: 'craft', craft: 'craft', atlas: 'atlas', studio: 'studio', collection: 'studio', missions: 'studio', 'creative-lab': 'studio', 'custom-editor': 'studio', heritage: 'heritage', sources: 'heritage', 'living-gallery': 'heritage' });
const DEFAULT_VIEWS = Object.freeze({ craft: 'craft-intro', studio: 'studio', heritage: 'living-gallery' });
const TITLES = Object.freeze({
  home: ['留白', '成蓝', 'THE INDIGO ATELIER'],
  craft: ['白从', '何来', 'THE ART OF RESIST'],
  atlas: ['观花', '入微', 'PATTERN OBSERVATORY'],
  studio: ['让白', '发生', 'YOUR HANDS, YOUR BLUE'],
  heritage: ['青出', '于蓝', 'A LIVING TRADITION']
});

/** Resolve only known local destinations; arbitrary URLs never become routes. */
export function resolveSceneTarget(value, available = Object.values(ALIASES)) {
  if (typeof value !== 'string') return null;
  let key;
  try { key = decodeURIComponent(value.replace(/^#/, '')); } catch { return null; }
  const id = ALIASES[key] || key;
  if (!key || !new Set(available).has(id)) return null;
  return { id, anchor: key === id ? null : key };
}

/** A cancelled transition cannot commit after a more recent user intention. */
export function createSceneState(initial = 'home') {
  let current = initial, revision = 0;
  const scroll = new Map();
  return {
    get current() { return current; },
    begin(id) { return Object.freeze({ id, revision: ++revision, previous: current }); },
    isLatest(ticket) { return ticket?.revision === revision; },
    commit(ticket) { if (ticket?.revision !== revision) return false; current = ticket.id; return true; },
    remember(id, y) { if (Number.isFinite(y)) scroll.set(id, Math.max(0, y)); },
    position(id) { return scroll.get(id) || 0; }
  };
}

export function initSceneRouter() {
  const scenes = new Map(Array.from(document.querySelectorAll('section[data-scene]'), node => [node.dataset.scene, node]));
  if (!scenes.size) return null;
  if (document.documentElement.dataset.sceneRouter === 'ready') return window.indigoSceneRouter || null;
  document.documentElement.dataset.sceneRouter = 'ready';
  const available = Array.from(scenes.keys());
  const views = new Map(), viewOwners = new Map();
  for (const [sceneId, scene] of scenes) for (const view of scene.querySelectorAll('[data-view]')) {
    views.set(view.dataset.view, view); viewOwners.set(view.dataset.view, sceneId);
  }
  const defaultView = id => views.has(DEFAULT_VIEWS[id]) ? DEFAULT_VIEWS[id] : [...viewOwners].find(([, owner]) => owner === id)?.[0] || null;
  function resolveTarget(value, explicitAnchor) {
    let basic = resolveSceneTarget(value, available), key;
    try { key = typeof value === 'string' ? decodeURIComponent(value.replace(/^#/, '')) : ''; } catch { return null; }
    if (!basic && views.has(key)) basic = { id: viewOwners.get(key), anchor: key };
    let anchor = explicitAnchor !== undefined ? explicitAnchor : basic?.anchor;
    const node = document.getElementById(anchor || key);
    const containingView = node && [...views].find(([, view]) => view === node || view.contains(node));
    if (!basic && containingView) { basic = { id: viewOwners.get(containingView[0]), anchor: key }; anchor = key; }
    if (!basic) return null;
    if (anchor && !node && !Object.hasOwn(ALIASES, anchor)) return null;
    if (anchor && node && !scenes.get(basic.id).contains(node)) return null;
    const view = containingView && viewOwners.get(containingView[0]) === basic.id ? containingView[0]
      : views.has(anchor) && viewOwners.get(anchor) === basic.id ? anchor : defaultView(basic.id);
    return { id: basic.id, view, anchor: anchor && anchor !== view ? anchor : null };
  }
  const initial = resolveTarget(location.hash) || { id: scenes.has('home') ? 'home' : available[0], view: null, anchor: null };
  if (!initial.view) initial.view = defaultView(initial.id);
  const state = createSceneState(initial.id);
  let currentView = initial.view;
  const positionKey = (id, view) => `${id}:${view || ''}`;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  const oldRestoration = history.scrollRestoration;
  history.scrollRestoration = 'manual';
  let request = null, destroyed = false, scrollFrame = 0;

  let curtain = document.getElementById('scene-curtain');
  if (!curtain) { curtain = document.createElement('div'); curtain.id = 'scene-curtain'; document.body.append(curtain); }
  curtain.classList.add('scene-curtain');
  curtain.setAttribute('aria-hidden', 'true');
  curtain.hidden = true;
  curtain.innerHTML = '<div class="scene-curtain-panel" aria-hidden="true"></div><div class="scene-curtain-panel" aria-hidden="true"></div><div class="scene-curtain-panel" aria-hidden="true"></div><div class="scene-curtain-label"><span class="scene-curtain-number"></span><div class="scene-curtain-words"><span></span><span></span></div><small></small></div>';
  const panels = Array.from(curtain.querySelectorAll('.scene-curtain-panel'));
  const label = curtain.querySelector('.scene-curtain-label');
  const words = Array.from(curtain.querySelectorAll('.scene-curtain-words span'));
  let live = document.getElementById('scene-live');
  if (!live) { live = document.createElement('p'); live.id = 'scene-live'; document.body.append(live); }
  live.classList.add('scene-live'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
  const quiet = () => preference.matches || document.documentElement.classList.contains('quiet') || document.hidden;

  function play(element, frames, options) {
    if (!element || typeof element.animate !== 'function') return Promise.resolve();
    const animation = element.animate(frames, { fill: 'both', ...options });
    animations.add(animation);
    // Keep finished effects until the transaction ends: their fill freezes the
    // covered pose while the next carrier starts, then clearMotion removes it.
    return animation.finished.catch(() => {});
  }
  function clearMotion() {
    for (const animation of animations) animation.cancel();
    animations.clear();
  }
  function captureMotion() {
    // Read every carrier before cancelling its effect. The replacement WAAPI
    // effects are installed in this same task, so no reset pose reaches paint.
    const source = scenes.get(state.current), poses = new Map();
    for (const element of [source, views.get(currentView), ...panels, label, ...words, ...source.querySelectorAll('[data-scene-enter]')].filter(Boolean)) {
      const style = getComputedStyle(element), pose = {};
      for (const property of ['transform', 'opacity', 'clipPath']) if (style[property]) pose[property] = style[property];
      poses.set(element, pose);
    }
    return { phase: request?.phase, poses };
  }
  function fromPose(element, fallback, continuation) {
    const pose = continuation?.poses.get(element);
    if (!pose) return fallback;
    return Object.fromEntries(Object.entries(fallback).map(([key, value]) => [key, pose[key] || value]));
  }
  function setVisible(id, viewKey = currentView) {
    for (const [key, node] of scenes) {
      const active = key === id;
      node.hidden = !active; node.inert = !active;
      node.setAttribute('aria-hidden', String(!active));
      node.classList.toggle('is-current-scene', active);
    }
    for (const [key, node] of views) {
      const active = viewOwners.get(key) === id && key === viewKey;
      node.hidden = !active; node.inert = !active; node.setAttribute('aria-hidden', String(!active));
    }
    document.documentElement.dataset.scene = id;
    document.documentElement.dataset.view = viewKey || '';
    for (const link of document.querySelectorAll('[data-route]')) {
      const selected = resolveSceneTarget(link.dataset.route, available)?.id === id;
      if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    }
    for (const link of document.querySelectorAll('[data-view-link]')) {
      if (link.dataset.viewLink === viewKey) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    }
    for (const group of document.querySelectorAll('[data-view-nav]')) {
      group.hidden = group.dataset.viewNav !== id; group.inert = group.hidden;
    }
    const sectionNav = document.querySelector('.section-nav');
    if (sectionNav) sectionNav.hidden = !viewKey;
  }
  function readyLabel(id) {
    const title = TITLES[id] || [scenes.get(id).dataset.sceneTitle || id, '', 'THE INDIGO ATELIER'];
    words[0].textContent = title[0]; words[1].textContent = title[1];
    label.querySelector('small').textContent = title[2];
    label.querySelector('.scene-curtain-number').textContent = `${String(available.indexOf(id) + 1).padStart(2, '0')} / ${String(available.length).padStart(2, '0')}`;
    curtain.dataset.destination = id;
  }
  function moveTo(id, anchor, restoreY) {
    const node = anchor && document.getElementById(anchor);
    let y = Number.isFinite(restoreY) ? restoreY : 0;
    if (!Number.isFinite(restoreY) && node && scenes.get(id).contains(node) && (!currentView || views.get(currentView)?.contains(node))) {
      const offset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      y = node.getBoundingClientRect().top + window.scrollY - offset;
    }
    // Explicit 'instant' keeps native smooth-scroll from outliving a route.
    window.scrollTo({ top: Math.max(0, y), left: 0, behavior: 'instant' });
  }
  function updateURL(id, anchor, mode) {
    if (mode === 'none') return;
    const hash = `#${anchor || (currentView && currentView !== defaultView(id) ? currentView : id)}`;
    const next = { ...(history.state || {}), indigoScene: id, indigoView: currentView, indigoAnchor: anchor || null, indigoScrollY: window.scrollY };
    if (location.hash === hash) history.replaceState(next, '', hash);
    else if (mode === 'replace') history.replaceState(next, '', hash);
    else history.pushState(next, '', hash);
  }
  function announce(id, previous, previousView) {
    const title = scenes.get(id).dataset.sceneTitle || (TITLES[id] || []).slice(0, 2).join('') || id;
    const link = Array.from(document.querySelectorAll('[data-view-link]')).find(node => node.dataset.viewLink === currentView);
    const viewTitle = link?.textContent?.replace(/\s+/g, ' ').trim();
    live.textContent = `已进入：${title}${viewTitle ? ` · ${viewTitle}` : ''}`;
    window.dispatchEvent(new CustomEvent('indigo:scene', { detail: { id, previous, view: currentView, previousView } }));
  }
  function focusDestination(id, opts) {
    if (document.hidden) return;
    if (opts.keepFocus) return;
    const scope = views.get(currentView) || scenes.get(id);
    let target = typeof opts.focus === 'string' ? document.getElementById(opts.focus) : null;
    if (!target && opts.keyboard) target = scope.querySelector('h1, h2, h3, [data-scene-heading]');
    if (!target || !scope.contains(target)) return;
    if (!target.matches('button,a,input,select,textarea,[tabindex]')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
  function commit(ticket, opts) {
    if (!state.isLatest(ticket)) return false;
    const previous = state.current, previousView = currentView;
    state.remember(positionKey(previous, previousView), window.scrollY);
    currentView = ticket.view;
    setVisible(ticket.id, ticket.view);
    if (!state.commit(ticket)) return false;
    moveTo(ticket.id, opts.anchor, opts.restoreY);
    updateURL(ticket.id, opts.anchor, opts.history);
    announce(ticket.id, previous, previousView);
    return true;
  }

  async function run(ticket, opts, continuation) {
    const source = scenes.get(state.current), destination = scenes.get(ticket.id);
    try {
      if (ticket.id === state.current) {
        const changedView = ticket.view !== currentView;
        if (changedView) {
          if (!commit(ticket, opts)) return null;
          const destinationView = views.get(currentView) || source;
          if (!opts.instant && !quiet() && typeof destinationView.animate === 'function') {
            request.phase = 'view';
            const incoming = [play(destinationView,
              [fromPose(destinationView, { opacity: .3, transform: 'translate3d(0,12px,0)' }, continuation), { opacity: 1, transform: 'translate3d(0,0,0)' }],
              { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' })];
            if (continuation && continuation.phase !== 'view') {
              const exit = continuation.phase === 'cover' ? '112%' : '-112%';
              incoming.push(...panels.map(panel => play(panel, [fromPose(panel, { transform: 'translate3d(0,0,0) skewX(-10deg)' }, continuation), { transform: `translate3d(0,${exit},0) skewX(-10deg)` }], { duration: 220, easing: 'ease-out' })));
              incoming.push(play(label, [fromPose(label, { opacity: 1 }, continuation), { opacity: 0 }], { duration: 140 }));
              incoming.push(play(source, [fromPose(source, { opacity: 1, transform: 'none' }, continuation), { opacity: 1, transform: 'none' }], { duration: 220 }));
            }
            await Promise.all(incoming);
            if (!state.isLatest(ticket)) return null;
          }
          focusDestination(ticket.id, opts);
          return ticket.id;
        }
        setVisible(ticket.id, ticket.view);
        if (opts.anchor || Number.isFinite(opts.restoreY)) moveTo(ticket.id, opts.anchor, opts.restoreY);
        else moveTo(ticket.id, null, 0);
        updateURL(ticket.id, opts.anchor, opts.history);
        if (continuation && continuation.phase !== 'view' && !opts.instant && !quiet()) {
          source.inert = true;
          request.phase = continuation.phase;
          const exit = continuation.phase === 'cover' ? '112%' : '-112%';
          const settling = panels.map(panel => play(panel,
            [fromPose(panel, { transform: 'translate3d(0,0,0) skewX(-10deg)' }, continuation), { transform: `translate3d(0,${exit},0) skewX(-10deg)` }],
            { duration: 360, easing: 'cubic-bezier(.22,1,.36,1)' }));
          settling.push(play(label, [fromPose(label, { opacity: 1, transform: 'none' }, continuation), { opacity: 0, transform: 'translate3d(0,-20px,0)' }], { duration: 180 }));
          settling.push(play(source, [fromPose(source, { opacity: 1, transform: 'none' }, continuation), { opacity: 1, transform: 'none' }], { duration: 360, easing: 'ease-out' }));
          for (const word of words) {
            const pose = fromPose(word, { transform: 'none', clipPath: 'none' }, continuation);
            settling.push(play(word, [pose, pose], { duration: 360 }));
          }
          for (const node of source.querySelectorAll('[data-scene-enter]')) settling.push(play(node,
            [fromPose(node, { opacity: 1, transform: 'none' }, continuation), { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' }));
          await Promise.all(settling);
          if (!state.isLatest(ticket)) return null;
        } else if (continuation?.phase === 'view' && !opts.instant && !quiet()) {
          const view = views.get(currentView) || source;
          request.phase = 'view';
          await play(view, [fromPose(view, { opacity: 1, transform: 'none' }, continuation), { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
          if (!state.isLatest(ticket)) return null;
        }
        focusDestination(ticket.id, opts);
        return ticket.id;
      }
      if (opts.instant || quiet() || typeof source.animate !== 'function') {
        if (commit(ticket, opts)) focusDestination(ticket.id, opts);
        return ticket.id;
      }
      source.inert = true;
      request.phase = 'cover';
      document.documentElement.classList.add('scene-switching');
      curtain.hidden = false; readyLabel(ticket.id);
      const easeOut = 'cubic-bezier(.22,1,.36,1)';
      const cover = panels.map((panel, index) => play(panel,
        [fromPose(panel, { transform: 'translate3d(0,112%,0) skewX(-10deg)' }, continuation), { transform: 'translate3d(0,0,0) skewX(-10deg)' }],
        { duration: 360, delay: continuation ? 0 : index * 35, easing: 'cubic-bezier(.76,0,.24,1)' }));
      cover.push(play(source, [fromPose(source, { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 }, continuation), { transform: 'translate3d(-22px,-12px,0) scale(1.035)', opacity: .35 }], { duration: 390, easing: 'cubic-bezier(.4,0,.2,1)' }));
      cover.push(play(label, [fromPose(label, { opacity: 0, transform: 'none' }, continuation), { opacity: 1, transform: 'none' }], { duration: 260, delay: continuation ? 0 : 130 }));
      words.forEach((word, index) => cover.push(play(word,
        [fromPose(word, { transform: `translate3d(${index ? '60px' : '-60px'},35px,0)`, clipPath: 'inset(0 0 100% 0)' }, continuation), { transform: 'translate3d(0,0,0)', clipPath: 'inset(0 0 0 0)' }],
        { duration: 300, delay: continuation ? 0 : 100 + index * 30, easing: easeOut })));
      if (continuation) for (const node of source.querySelectorAll('[data-scene-enter]')) {
        const pose = fromPose(node, { opacity: 1, transform: 'none' }, continuation);
        cover.push(play(node, [pose, pose], { duration: 390 }));
      }
      if (continuation?.phase === 'view' && views.get(currentView)) {
        const view = views.get(currentView);
        cover.push(play(view, [fromPose(view, { opacity: 1, transform: 'none' }, continuation), { opacity: 1, transform: 'none' }], { duration: 390, easing: easeOut }));
      }
      await Promise.all(cover);
      if (!state.isLatest(ticket)) return null;
      if (!commit(ticket, opts)) return null;
      if (!state.isLatest(ticket)) return null;
      request.phase = 'reveal';
      const reveal = panels.map((panel, index) => play(panel,
        [{ transform: 'translate3d(0,0,0) skewX(-10deg)' }, { transform: 'translate3d(0,-112%,0) skewX(-10deg)' }],
        { duration: 470, delay: index * 30, easing: 'cubic-bezier(.76,0,.24,1)' }));
      reveal.push(play(label, [{ opacity: 1, transform: 'translate3d(0,0,0)' }, { opacity: 0, transform: 'translate3d(0,-36px,0)' }], { duration: 220, easing: 'ease-in' }));
      reveal.push(play(destination,
        [{ opacity: .15, transform: 'translate3d(28px,18px,0) scale(1.035)' }, { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }],
        { duration: 580, easing: easeOut }));
      Array.from((views.get(currentView) || destination).querySelectorAll('[data-scene-enter]')).slice(0, 7).forEach((node, index) => {
        reveal.push(play(node, [{ opacity: 0, transform: 'translate3d(0,26px,0)' }, { opacity: 1, transform: 'translate3d(0,0,0)' }], { duration: 450, delay: 75 + index * 24, easing: easeOut }));
      });
      await Promise.all(reveal);
      if (!state.isLatest(ticket)) return null;
      focusDestination(ticket.id, opts);
      return ticket.id;
    } catch (error) {
      // Resource/WAAPI failure still resolves the intended navigation.
      if (state.isLatest(ticket)) {
        if (state.current !== ticket.id || currentView !== ticket.view) commit(ticket, opts);
        focusDestination(ticket.id, opts);
        console.warn('Scene transition continued without animation.', error);
      }
      return state.current;
    } finally {
      if (state.isLatest(ticket)) {
        clearMotion(); curtain.hidden = true;
        setVisible(state.current);
        document.documentElement.classList.remove('scene-switching');
        request = null;
      }
    }
  }

  function navigate(value, options = {}) {
    if (destroyed) return Promise.resolve(null);
    const target = resolveTarget(value, Object.hasOwn(options, 'anchor') ? options.anchor : undefined);
    if (!target) return Promise.resolve(null);
    const opts = { history: 'push', anchor: target.anchor, ...options };
    if (opts.history === 'none' && !opts.anchor && !Number.isFinite(opts.restoreY)) opts.restoreY = state.position(positionKey(target.id, target.view));
    const key = `${target.id}:${target.view || ''}:${opts.anchor || ''}`;
    if (request?.key === key && !opts.instant && opts.history === request.opts.history && opts.restoreY === request.opts.restoreY) return request.promise;
    if (!request && opts.history !== 'none') rememberCurrent();
    // Capture the visible pose before cancelling all obsolete carriers together.
    // A new choice continues the material already on screen without a reset.
    const continuation = request && !opts.instant && !quiet() ? captureMotion() : null;
    clearMotion(); if (!continuation) curtain.hidden = true; setVisible(state.current);
    const ticket = Object.freeze({ ...state.begin(target.id), view: target.view });
    const next = { key, id: target.id, view: target.view, opts, promise: null };
    request = next;
    next.promise = run(ticket, opts, continuation);
    return next.promise;
  }

  function onClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('[data-route],[data-view-link],a[href^="#"]');
    if (!link || link.hasAttribute('download') || link.target === '_blank') return;
    const value = link.dataset.route || link.getAttribute('href');
    if (!resolveTarget(value)) return;
    event.preventDefault();
    const resolved = resolveTarget(value);
    const hashNode = document.getElementById(value.replace(/^#/, ''));
    const anchor = !link.dataset.route && hashNode && !hashNode.dataset.view && scenes.get(resolved.id).contains(hashNode) ? hashNode.id : resolved.anchor;
    navigate(value, { keyboard: event.detail === 0, keepFocus: !!link.dataset.viewLink, anchor: link.dataset.route ? null : anchor });
  }
  function onLocation() {
    const target = resolveTarget(location.hash);
    if (!target) return;
    const matches = history.state?.indigoScene === target.id && (!history.state.indigoView || history.state.indigoView === target.view);
    navigate(location.hash, { history: 'none', restoreY: matches ? history.state.indigoScrollY : undefined });
  }
  function onNavigate(event) {
    const detail = event.detail || {};
    if (!resolveTarget(detail.id || detail.route || '', detail.anchor)) return;
    event.preventDefault();
    navigate(detail.id || detail.route, { anchor: detail.anchor || null, focus: detail.focus, keyboard: !!detail.keyboard });
  }
  function finishForQuiet() {
    if (!quiet() || !request) return;
    const pending = request;
    navigate(pending.view || pending.id, { ...pending.opts, instant: true, keyboard: document.hidden ? false : pending.opts.keyboard });
  }
  function rememberCurrent() {
    state.remember(positionKey(state.current, currentView), window.scrollY);
    const resolved = resolveTarget(location.hash);
    if (!request && (!resolved || (resolved.id === state.current && resolved.view === currentView))) {
      history.replaceState({ ...(history.state || {}), indigoScene: state.current, indigoView: currentView, indigoScrollY: window.scrollY }, '', location.href);
    }
  }
  function onScroll() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; if (!destroyed) rememberCurrent(); });
  }

  document.addEventListener('click', onClick);
  window.addEventListener('popstate', onLocation);
  window.addEventListener('hashchange', onLocation);
  window.addEventListener('indigo:navigate', onNavigate);
  window.addEventListener('indigo:quiet', finishForQuiet);
  document.addEventListener('visibilitychange', finishForQuiet);
  preference.addEventListener('change', finishForQuiet);
  window.addEventListener('pagehide', rememberCurrent);
  window.addEventListener('scroll', onScroll, { passive: true });
  setVisible(initial.id, initial.view);
  const initialY = history.state?.indigoScene === initial.id && (!history.state.indigoView || history.state.indigoView === initial.view) ? history.state.indigoScrollY : undefined;
  moveTo(initial.id, initial.anchor, initialY);
  updateURL(initial.id, initial.anchor, 'replace');
  // The modules listening for the active scene can finish their own setup first.
  queueMicrotask(() => { if (!destroyed) announce(initial.id, null); });

  const api = {
    navigate,
    get current() { return state.current; },
    get view() { return currentView; },
    destroy() {
      if (destroyed) return;
      destroyed = true; state.begin(state.current); clearMotion(); curtain.hidden = true;
      document.removeEventListener('click', onClick); window.removeEventListener('popstate', onLocation); window.removeEventListener('hashchange', onLocation);
      window.removeEventListener('indigo:navigate', onNavigate); window.removeEventListener('indigo:quiet', finishForQuiet);
      document.removeEventListener('visibilitychange', finishForQuiet); preference.removeEventListener('change', finishForQuiet); window.removeEventListener('pagehide', rememberCurrent);
      window.removeEventListener('scroll', onScroll); if (scrollFrame) cancelAnimationFrame(scrollFrame);
      for (const node of scenes.values()) { node.hidden = false; node.inert = false; node.removeAttribute('aria-hidden'); node.classList.remove('is-current-scene'); }
      for (const node of views.values()) { node.hidden = false; node.inert = false; node.removeAttribute('aria-hidden'); }
      document.documentElement.classList.remove('scene-switching'); delete document.documentElement.dataset.sceneRouter;
      delete document.documentElement.dataset.view;
      history.scrollRestoration = oldRestoration; if (window.indigoSceneRouter === api) delete window.indigoSceneRouter;
    }
  };
  window.indigoSceneRouter = api;
  return api;
}
