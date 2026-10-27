/*
 * Native WebGL indigo field. Art-directed domain warping, not a fluid solver.
 * The silk() domain and layered ribbon-color approach are adapted from the
 * installed frontend-spectacle skill's assets/react/flow-field/FlowField.tsx.
 * This version uses one native WebGL pass: no Three.js, textures, downloads,
 * floating-point framebuffer, or remote dependencies.
 */

const VERTEX = `
attribute vec2 aPosition;
varying mediump vec2 vUV;
void main() { vUV = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying mediump vec2 vUV;
uniform vec2 uResolution;
uniform float uTime;
uniform float uTouchTime;
uniform float uChapter;
uniform vec4 uPointer;
uniform float uEnergy;
uniform vec4 uRipples[6];

vec2 turn(vec2 p, float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c) * p;
}

float silk(vec2 p, float t) {
  vec2 q = turn(p, -.43 + uChapter * .135);
  q += .48 * vec2(sin(q.y * 1.55 + t * .19) + .36 * cos(q.x * 1.3 - t * .11), cos(q.x * 1.2 - t * .15));
  q += .23 * vec2(sin(q.y * 2.45 + q.x * .75 - t * .1), cos(q.x * 2.2 - q.y * .8 + t * .12));
  vec2 pocketOffset = q - vec2(.55 + sin(t * .09) * .25, -.35);
  float pocket = exp(-dot(pocketOffset, pocketOffset) * .65);
  q += pocket * vec2(.12 * sin(q.y * 12.5 + q.x * 2.3 + t * .2), .055 * sin(q.x * 7.0 - q.y * 3.0));
  // A slow secondary eddy stretches the narrow dye veins into the broad bands.
  q += .09 * vec2(cos(q.y * 4.3 + uChapter * .35), sin(q.x * 3.1 - t * .08));
  return q.x * .85 + q.y * .34 + .48 * sin(q.y * 1.65 + t * .14)
    + .17 * cos(length(q + vec2(.8, -.5)) * 2.2 - t * .12);
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 uv = vUV;
  vec2 pointerDelta = (uv - uPointer.xy) * vec2(aspect, 1.0);
  float influence = exp(-dot(pointerDelta, pointerDelta) * 8.0) * uEnergy;
  vec2 swirl = vec2(-pointerDelta.y, pointerDelta.x) * .09;
  uv += (swirl + uPointer.zw * .045) * influence / vec2(aspect, 1.0);
  for (int i = 0; i < 6; i++) {
    float age = max(0.0, uTouchTime - uRipples[i].z);
    if (uRipples[i].w > .001 && age < 4.0) {
      vec2 d = (uv - uRipples[i].xy) * vec2(aspect, 1.0);
      float r = length(d);
      float wave = sin(r * 49.0 - age * 8.0) * exp(-age * 1.8);
      wave *= exp(-pow((r - age * .23) * 6.5, 2.0)) * uRipples[i].w;
      uv += d / max(r, .001) / vec2(aspect, 1.0) * wave * .021;
    }
  }
  vec2 p = (uv - .5) * vec2(aspect, 1.0) * (2.6 + .08 * uChapter);
  p += vec2(sin(uChapter * 1.3) * .6, cos(uChapter * .7) * .35);
  float h = silk(p, uTime + uChapter * 1.7);
  float phase = h * (4.0 + .18 * sin(uChapter * 1.7));
  float fold = sin(phase);
  float cycle = fract(phase / 6.2831853 + .22);
  float edgeWidth = 3.0 / max(min(uResolution.x, uResolution.y), 360.0);
  vec2 gradient = vec2(cos(phase) * .7, sin(phase) * .4);
#ifdef HAS_DERIVATIVES
  edgeWidth = max(.0015, fwidth(phase) / 6.2831853 * 1.2);
  gradient = vec2(dFdx(h) * uResolution.x, dFdy(h) * uResolution.y) * .12;
#endif
  vec3 normal = normalize(vec3(-gradient, 1.0));
  float light = .34 + .66 * max(dot(normal, normalize(vec3(-.6, .7, 1.0))), 0.0);
  // Six states stay within the indigo family; oxidation moves the pigment from
  // dense ink through cobalt to the colder, pale edges of rinsed dye.
  vec3 deep = vec3(.006, .019, .079);
  vec3 indigo = mix(vec3(.018, .074, .25), vec3(.022, .10, .35), uChapter / 5.0);
  vec3 cobalt = mix(vec3(.035, .24, .62), vec3(.045, .30, .69), uChapter / 5.0);
  vec3 cream = vec3(.74, .86, .90);
  float face = smoothstep(-.55, .7, fold);
  vec3 color = mix(deep, indigo, face);
  float suspended = smoothstep(-.15, .85, sin(h * 1.4 - p.y * .6 + uTime * .025));
  color = mix(color, cobalt, suspended * (.2 + .5 * smoothstep(-.2, .9, cos(phase))));
  color *= light;
  float shoulder = exp(-pow((cycle - .27) / .085, 2.0));
  color = mix(color, cobalt * 1.3, shoulder * .66);
  float valley = 1.0 - smoothstep(.008, .085, min(cycle, 1.0 - cycle));
  color = mix(color, deep * .23, valley * .9);
  // Offset highlights and multiple line widths expose the underlying curves.
  float whiteVein = exp(-pow((cycle - .145) / max(edgeWidth * 1.4, .0028), 2.0));
  float halo = exp(-pow((cycle - .156) / .018, 2.0));
  color = mix(color, cream, whiteVein * .75);
  color += cobalt * halo * .20;
  float fineCycle = abs(fract(h * 10.5 + .035 * sin(p.y * 2.0 + uTime * .07)) - .5);
  float fineWidth = max(edgeWidth * 6.0, .016);
  float fine = 1.0 - smoothstep(.0, fineWidth, fineCycle);
  float tide = smoothstep(.3, .9, sin(h * 2.0 + p.y * .7));
  color += cream * fine * tide * (.055 + .012 * uChapter);
  // The middle stays deep enough for live chapter text. Side veins retain the
  // bright detail; composition is completed by the host's DOM vignette.
  float middle = exp(-pow((vUV.x - .51) * 2.9, 2.0));
  color *= 1.0 - middle * .20;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

/**
 * Decorative, pointer-responsive dye field. The container retains native input.
 * Returns null when WebGL cannot initialize; the host's CSS remains visible.
 * Quiet/reduced modes render on explicit input only, with no autonomous RAF.
 */
export function createDyeField(canvas, container = canvas?.parentElement) {
  if (!canvas?.getContext || !container?.addEventListener) return null;
  const page = canvas.ownerDocument, win = page?.defaultView;
  if (!win) return null;
  if (new URLSearchParams(win.location?.search || '').get('renderer') === 'canvas') return null;
  let gl;
  try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }); }
  catch { return null; }
  if (!gl) return null;
  const originalVisibility = canvas.style.visibility, originalPointerEvents = canvas.style.pointerEvents;
  const originalState = canvas.dataset.dyeState;
  canvas.style.pointerEvents = 'none';
  canvas.style.visibility = 'hidden';
  const media = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced = !!media?.matches, quiet = false, destroyed = false, lost = false;
  let visible = true, resources = null, raf = 0, previous = 0;
  let ambient = 4.2, touchTime = 0, chapter = 0, energy = 0;
  let pointerX = .5, pointerY = .5, velocityX = 0, velocityY = 0;
  let known = false, pointerTime = 0, lastRipple = -100, rippleIndex = 0;
  const ripples = new Float32Array(24);
  const removers = [];
  let sizeObserver, intersection;

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    removers.push(() => target.removeEventListener(type, handler, options));
  }
  function stop() { if (raf) win.cancelAnimationFrame(raf); raf = 0; previous = 0; }
  function active() { return !destroyed && !lost && visible && !page.hidden && resources; }
  function schedule() { if (active() && !raf) raf = win.requestAnimationFrame(tick); }
  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('shader-allocation');
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'shader-compilation';
      gl.deleteShader(shader); throw new Error(message);
    }
    return shader;
  }
  function release() {
    if (!resources) return;
    gl.deleteBuffer(resources.buffer); gl.deleteProgram(resources.program); resources = null;
  }
  function initialize() {
    let vertex, fragment, program, buffer;
    try {
      const derivatives = gl.getExtension('OES_standard_derivatives');
      const header = derivatives ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIVATIVES\n' : '';
      vertex = compile(gl.VERTEX_SHADER, VERTEX); fragment = compile(gl.FRAGMENT_SHADER, header + FRAGMENT);
      program = gl.createProgram();
      if (!program) throw new Error('program-allocation');
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program-link');
      buffer = gl.createBuffer(); if (!buffer) throw new Error('buffer-allocation');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const uniforms = {};
      for (const name of ['uResolution', 'uTime', 'uTouchTime', 'uChapter', 'uPointer', 'uEnergy', 'uRipples[0]']) uniforms[name] = gl.getUniformLocation(program, name);
      resources = { program, buffer, uniforms, position: gl.getAttribLocation(program, 'aPosition') };
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    } catch (error) {
      if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program);
      throw error;
    } finally {
      if (vertex) gl.deleteShader(vertex); if (fragment) gl.deleteShader(fragment);
    }
  }
  function resize() {
    if (destroyed || lost || !resources) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const maximum = Math.min(2400, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 2400);
    const ratio = Math.min(win.devicePixelRatio || 1, 1.35, Math.sqrt(1_500_000 / (rect.width * rect.height)), maximum / Math.max(rect.width, rect.height));
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    gl.viewport(0, 0, canvas.width, canvas.height); schedule();
  }
  function tick(now) {
    raf = 0;
    if (!active()) { previous = 0; return; }
    const autonomous = !quiet && !reduced;
    if (autonomous && previous && now - previous < 1000 / 30 - .75) { schedule(); return; }
    const dt = Math.min(.05, previous ? Math.max(0, (now - previous) / 1000) : 1 / 30);
    previous = now;
    if (autonomous) { ambient += dt; touchTime += dt; energy *= Math.exp(-dt * 1.8); }
    const { program, buffer, uniforms: u, position } = resources;
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(u.uResolution, canvas.width, canvas.height);
    gl.uniform1f(u.uTime, ambient); gl.uniform1f(u.uTouchTime, touchTime); gl.uniform1f(u.uChapter, chapter);
    gl.uniform4f(u.uPointer, pointerX, pointerY, velocityX, velocityY);
    gl.uniform1f(u.uEnergy, energy * (reduced ? .3 : 1));
    gl.uniform4fv(u['uRipples[0]'], ripples);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.style.visibility = 'visible'; canvas.dataset.dyeState = 'ready';
    if (autonomous) schedule(); else previous = 0;
  }
  function checkVisibility() {
    const rect = container.getBoundingClientRect();
    visible = rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < win.innerWidth && rect.top < win.innerHeight;
    if (visible) schedule(); else { known = false; stop(); }
  }
  function stamp(x, y, strength) {
    const offset = (rippleIndex++ % 6) * 4;
    ripples.set([x, y, touchTime, strength], offset); lastRipple = touchTime;
  }
  function pointerMove(event) {
    if (!active()) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const now = Number.isFinite(event.timeStamp) ? event.timeStamp : 0;
    if (known) {
      const elapsed = clamp((now - pointerTime) / 1000, 1 / 120, .1);
      velocityX = clamp((x - pointerX) / elapsed * .16, -1, 1);
      velocityY = clamp((y - pointerY) / elapsed * .16, -1, 1);
    } else velocityX = velocityY = 0;
    pointerX = x; pointerY = y; pointerTime = now; known = true;
    const speed = Math.hypot(velocityX, velocityY);
    energy = clamp(.28 + speed, 0, 1);
    if (!quiet && !reduced && speed > .06 && touchTime - lastRipple > .07) stamp(x, y, Math.min(.55, speed));
    schedule();
  }
  function pointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    pointerMove(event);
    if (active() && !reduced && !quiet) { stamp(pointerX, pointerY, 1); energy = 1; schedule(); }
  }
  function clearTransient() { ripples.fill(0); energy = 0; known = false; velocityX = velocityY = 0; }
  function setQuiet(value) {
    if (destroyed || typeof value !== 'boolean') return false;
    quiet = value; clearTransient(); stop(); schedule(); return true;
  }
  function setChapter(value) {
    if (destroyed || !Number.isFinite(value)) return false;
    chapter = clamp(Math.round(value), 0, 5); schedule(); return true;
  }
  function contextLost(event) {
    event.preventDefault(); lost = true; resources = null; stop(); clearTransient();
    canvas.style.visibility = 'hidden'; canvas.dataset.dyeState = 'lost';
  }
  function contextRestored() {
    if (destroyed) return;
    try { initialize(); lost = false; resize(); checkVisibility(); }
    catch { lost = true; release(); canvas.style.visibility = 'hidden'; canvas.dataset.dyeState = 'failed'; }
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true; stop();
    for (const remove of removers) remove();
    sizeObserver?.disconnect(); intersection?.disconnect();
    if (!lost) release(); else resources = null;
    canvas.style.visibility = originalVisibility; canvas.style.pointerEvents = originalPointerEvents;
    if (originalState === undefined) delete canvas.dataset.dyeState; else canvas.dataset.dyeState = originalState;
  }

  try { initialize(); }
  catch {
    canvas.style.pointerEvents = originalPointerEvents;
    canvas.style.visibility = 'hidden'; canvas.dataset.dyeState = 'failed'; return null;
  }
  listen(container, 'pointermove', pointerMove, { passive: true });
  listen(container, 'pointerdown', pointerDown, { passive: true });
  listen(container, 'pointerleave', () => { known = false; }, { passive: true });
  listen(canvas, 'webglcontextlost', contextLost); listen(canvas, 'webglcontextrestored', contextRestored);
  listen(page, 'visibilitychange', () => { clearTransient(); if (page.hidden) stop(); else { previous = 0; checkVisibility(); } });
  listen(win, 'resize', () => { resize(); checkVisibility(); }, { passive: true });
  if (media?.addEventListener) listen(media, 'change', event => { reduced = !!event.matches; clearTransient(); stop(); schedule(); });
  if (win.ResizeObserver) { sizeObserver = new win.ResizeObserver(() => { resize(); checkVisibility(); }); sizeObserver.observe(container); }
  if (win.IntersectionObserver) {
    intersection = new win.IntersectionObserver(entries => {
      visible = !!entries[0]?.isIntersecting;
      if (visible) schedule(); else { known = false; stop(); }
    }, { threshold: .01 });
    intersection.observe(container);
  } else listen(win, 'scroll', checkVisibility, { passive: true });
  resize(); checkVisibility();
  return { setQuiet, setChapter, destroy };
}
