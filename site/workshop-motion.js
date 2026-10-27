// Decorative feedback only. The application owns all pigment, masks and pointer capture.
const instances = new WeakMap();

export function initWorkshopMotion() {
  const board = document.getElementById('studio-canvas');
  const frame = board?.closest('.canvas-frame');
  if (!board || !frame) return { cleanup() {}, refresh() {} };
  if (instances.has(board)) return instances.get(board);
  const range = document.getElementById('reveal-progress');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const isQuiet = () => media.matches || document.documentElement.classList.contains('quiet');
  const root = document.createElement('div');
  root.className = 'wm-surface'; root.setAttribute('aria-hidden', 'true');
  const css = document.createElement('style');
  css.textContent = `
    .wm-surface{position:absolute;pointer-events:none!important;z-index:5;overflow:hidden;contain:layout paint;isolation:isolate}
    .wm-surface *{pointer-events:none!important}
    .wm-surface[hidden]{display:none!important}
    .wm-particles{position:absolute;inset:0;width:100%;height:100%;box-shadow:none!important}
    .wm-tool{position:absolute;left:0;top:0;width:var(--wm-tool-width,64px);height:14px;border-radius:2px;background:linear-gradient(180deg,#ddc39a,#b79a71 48%,#8f734e 50%,#c9ab7d);border:1px solid #806a4b;box-shadow:0 5px 7px #23362b30;transform-origin:50% 70%;opacity:0;will-change:transform}
    .wm-tool:after{content:'';position:absolute;bottom:-3px;left:3px;right:3px;height:4px;border-radius:0 0 40% 40%;background:#f3efda;box-shadow:0 1px 1px #8a8e7050}
    .wm-pressure{position:absolute;left:8%;right:8%;bottom:-8px;height:5px;border-radius:50%;background:#f6f1df75;filter:blur(2px)}
    .wm-edge{position:absolute;top:0;bottom:0;width:27px;transform:translateX(-50%);display:none;background:linear-gradient(90deg,transparent 0,#18382e30 29%,#f7f0d5b0 44%,#fff9e8 51%,#ccc5a1d0 58%,#314a3c25 79%,transparent);filter:drop-shadow(3px 0 3px #0b283a24)}
    .wm-edge:before{content:'';position:absolute;left:45%;top:0;bottom:0;width:1px;background:#fff9df;opacity:.8}
    .wm-wash,.wm-glint,.wm-settle{position:absolute;inset:0}
    .wm-wash{background:linear-gradient(180deg,transparent,#87a9ad30 42%,#163f6548 62%,#0d2e4b24);transform-origin:bottom}
    .wm-glint{background:linear-gradient(108deg,transparent 34%,#fff4d92b 48%,transparent 61%);mix-blend-mode:screen}
    .wm-settle{box-shadow:inset 0 0 0 1px #f3eac657,inset 0 -18px 35px #1233481c}
    @media(prefers-reduced-motion:reduce){.wm-tool{will-change:auto}.wm-particles{display:none}}
  `;
  const dust = document.createElement('canvas'); dust.className = 'wm-particles';
  const tool = document.createElement('div'); tool.className = 'wm-tool';
  tool.append(Object.assign(document.createElement('i'), { className: 'wm-pressure' }));
  const edge = document.createElement('div'); edge.className = 'wm-edge';
  root.append(dust, tool, edge); frame.append(root); document.head.append(css);
  const ctx = dust.getContext('2d');
  const disposers = [], animations = new Set(), transient = new Set();
  let stage = document.querySelector('.tools')?.dataset.stage || 'coat';
  let visible = true, destroyed = false, raf = 0, particles = [], last = null;
  let activePointer = null, lastEmission = 0, width = 1, height = 1, ratio = 1;

  function on(target, event, callback, options) {
    if (!target) return;
    target.addEventListener(event, callback, options);
    disposers.push(() => target.removeEventListener(event, callback, options));
  }
  const available = () => !destroyed && visible && !document.hidden;
  function clearParticles() {
    cancelAnimationFrame(raf); raf = 0; particles = [];
    ctx?.clearRect(0, 0, width, height);
  }
  function stopEffects() {
    clearParticles(); tool.style.opacity = '0'; last = null; activePointer = null;
    for (const animation of animations) animation.cancel();
    animations.clear();
    for (const node of transient) node.remove();
    transient.clear();
  }
  function revealEdge() {
    // Exactly the same normalized range that experience.js uses for its clip.
    const min = Number(range?.min || 0), max = Number(range?.max || 100);
    const value = Math.max(0, Math.min(1, (Number(range?.value || 0) - min) / (max - min || 1)));
    edge.style.left = `${value * 100}%`;
    edge.style.display = available() && stage === 'dye' && value > 0 && value < 1 ? 'block' : 'none';
  }
  function measure() {
    if (destroyed) return;
    const b = board.getBoundingClientRect(), f = frame.getBoundingClientRect();
    width = Math.max(1, b.width); height = Math.max(1, b.height);
    root.style.left = `${b.left - f.left - frame.clientLeft}px`;
    root.style.top = `${b.top - f.top - frame.clientTop}px`;
    root.style.width = `${width}px`; root.style.height = `${height}px`;
    ratio = Math.min(devicePixelRatio || 1, 2);
    dust.width = Math.round(width * ratio); dust.height = Math.round(height * ratio);
    ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
    root.style.setProperty('--wm-tool-width', `${width * 26 / 240}px`);
    clearParticles(); revealEdge();
  }
  function play(className, keyframes, duration, delay = 0) {
    if (!available() || isQuiet() || typeof root.animate !== 'function') return;
    const node = document.createElement('div'); node.className = className;
    root.insertBefore(node, dust); transient.add(node);
    const animation = node.animate(keyframes, { duration, delay, easing: 'cubic-bezier(.22,.65,.25,1)', fill: 'both' });
    animations.add(animation);
    animation.finished.catch(() => {}).finally(() => {
      animations.delete(animation); transient.delete(node); node.remove();
    });
  }
  function transition(from, to) {
    if (from === 'coat' && to === 'dye') {
      // The app's dyed pixels are already visible; this transparent wash adds rhythm only.
      play('wm-wash', [
        { transform: 'translateY(100%)', opacity: 0 },
        { transform: 'translateY(0)', opacity: .8, offset: .55 },
        { transform: 'translateY(-8%)', opacity: 0 }
      ], 760);
      play('wm-glint', [{ transform: 'translateX(-90%)', opacity: 0 }, { opacity: .55, offset: .35 }, { transform: 'translateX(90%)', opacity: 0 }], 580, 180);
    } else if (to === 'reveal' && from === 'dye') {
      play('wm-glint', [{ transform: 'translateX(-75%)', opacity: .1 }, { opacity: .7, offset: .3 }, { transform: 'translateX(90%)', opacity: 0 }], 680);
      play('wm-settle', [{ opacity: 0 }, { opacity: .8, offset: .3 }, { opacity: 0 }], 740, 80);
    }
  }
  function update(event) {
    const next = event.detail?.stage;
    if (!['coat', 'dye', 'reveal'].includes(next)) return;
    const before = stage;
    stage = next;
    if (before !== stage) { stopEffects(); transition(before, stage); }
    if (stage !== 'coat') tool.style.opacity = '0';
    // experience.js and this listener can be initialized in either order.
    queueMicrotask(() => { if (!destroyed) revealEdge(); });
  }
  function draw(time) {
    raf = 0;
    if (!available() || isQuiet() || !ctx) { clearParticles(); return; }
    ctx.clearRect(0, 0, width, height);
    particles = particles.filter(p => time - p.born < p.life);
    for (const p of particles) {
      const t = (time - p.born) / p.life;
      const elapsed = (time - p.born) / 1000;
      ctx.globalAlpha = (1 - t) ** 2 * .72;
      ctx.fillStyle = '#f8f1dc';
      ctx.save(); ctx.translate(p.x + p.vx * elapsed, p.y + p.vy * elapsed + 45 * elapsed ** 2);
      ctx.rotate(p.turn + elapsed * p.spin);
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * .55); ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (particles.length) raf = requestAnimationFrame(draw);
  }
  function move(event) {
    if (!available() || stage !== 'coat' || (event.pointerType === 'touch' && activePointer !== event.pointerId)) return;
    const rect = board.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > width || y > height) { tool.style.opacity = '0'; return; }
    const pressed = activePointer === event.pointerId && (event.pointerType !== 'mouse' || (event.buttons & 1));
    const now = performance.now();
    const dx = last ? x - last.x : 0, dy = last ? y - last.y : 0;
    const speed = last ? Math.min(2, Math.hypot(dx, dy) / Math.max(1, now - last.time)) : 0;
    const pressure = pressed ? Math.max(.2, event.pressure || .5) : 0;
    const tilt = isQuiet() ? -7 : -7 + Math.max(-13, Math.min(13, dx * .6));
    tool.style.opacity = '1';
    tool.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) rotate(${tilt}deg) scaleY(${1 - pressure * .13})`;
    tool.style.boxShadow = `0 ${pressed ? 2 : 6}px ${pressed ? 3 : 8}px #23362b35`;
    if (pressed && !isQuiet() && now - lastEmission > 14 && Math.hypot(dx, dy) > .5 && ctx) {
      lastEmission = now;
      for (let n = 0; n < 2 + Math.floor(speed * 2); n++) {
        particles.push({ x: x + (Math.random() - .5) * width * 26 / 240, y: y + 7,
          born: now, life: 200 + Math.random() * 230, vx: -dx * 1.7 + (Math.random() - .5) * 20,
          vy: -8 - Math.random() * 16, size: 1.4 + Math.random() * 2.3,
          turn: Math.random() * 3, spin: Math.random() * 5 - 2.5 });
      }
      if (particles.length > 90) particles.splice(0, particles.length - 90);
      if (!raf) raf = requestAnimationFrame(draw);
    }
    last = { x, y, time: now };
  }
  function end(event) {
    if (event?.pointerId != null && activePointer != null && event.pointerId !== activePointer) return;
    activePointer = null; last = null; tool.style.opacity = '0';
  }
  on(board, 'pointerdown', event => {
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    activePointer = event.pointerId; last = null; move(event);
  }, { passive: true });
  on(board, 'pointermove', move, { passive: true });
  on(board, 'pointerleave', end, { passive: true });
  on(window, 'pointerup', end, { passive: true });
  on(window, 'pointercancel', end, { passive: true });
  on(window, 'blur', () => { stopEffects(); revealEdge(); });
  on(window, 'indigo:change', update);
  on(range, 'input', () => queueMicrotask(revealEdge), { passive: true });
  on(window, 'resize', measure, { passive: true });
  on(document, 'visibilitychange', () => {
    root.hidden = !available();
    if (!available()) stopEffects();
    revealEdge();
  });
  const preferenceChange = () => { stopEffects(); revealEdge(); };
  on(window, 'indigo:quiet', preferenceChange);
  if (media.addEventListener) on(media, 'change', preferenceChange);
  else { media.addListener(preferenceChange); disposers.push(() => media.removeListener(preferenceChange)); }
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
  resize?.observe(board);
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    root.hidden = !available();
    if (!available()) stopEffects();
    revealEdge();
  }, { threshold: 0 }) : null;
  observer?.observe(board);
  function cleanup() {
    if (destroyed) return;
    destroyed = true; stopEffects(); resize?.disconnect(); observer?.disconnect();
    disposers.forEach(dispose => dispose()); root.remove(); css.remove(); instances.delete(board);
  }
  const api = { cleanup, refresh: measure };
  instances.set(board, api); measure(); root.hidden = !available();
  return api;
}
