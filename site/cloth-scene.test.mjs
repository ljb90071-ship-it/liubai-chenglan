// Run: node --test cloth-scene.test.mjs
// GPU lifecycle uses a WebGL API stub; real shader compilation and visual QA require a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClothGrid, createClothScene, projectClothCorner, sampleClothSurface } from './cloth-scene.js';

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  emit(type, detail = {}) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...detail };
    for (const handler of this.listeners.get(type) || []) handler(event);
    return event;
  }
}

function harness({ reduced = false, shaderFailure = false, canvasWidth = 600 } = {}) {
  const calls = [];
  const frames = new Map();
  const media = new Events(); media.matches = reduced;
  let id = 0, now = 0;
  const win = new Events();
  Object.assign(win, {
    innerWidth: 1500, innerHeight: 1000, devicePixelRatio: 3,
    matchMedia: () => media,
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: frame => frames.delete(frame)
  });
  const page = new Events(); page.defaultView = win; page.hidden = false;
  const canvas = new Events();
  canvas.ownerDocument = page; canvas.width = canvas.height = 720;
  canvas.style = { touchAction: 'auto' }; canvas.dataset = {};
  canvas.attributes = new Map();
  canvas.getAttribute = name => canvas.attributes.has(name) ? canvas.attributes.get(name) : null;
  canvas.setAttribute = (name, value) => canvas.attributes.set(name, String(value));
  canvas.removeAttribute = name => canvas.attributes.delete(name);
  canvas.rect = { width: canvasWidth, height: 600, left: 0, top: 0, right: canvasWidth, bottom: 600 };
  canvas.getBoundingClientRect = () => canvas.rect;
  const captured = new Set();
  canvas.setPointerCapture = pointer => captured.add(pointer);
  canvas.hasPointerCapture = pointer => captured.has(pointer);
  canvas.releasePointerCapture = pointer => captured.delete(pointer);
  const constants = ['VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS', 'ARRAY_BUFFER', 'ELEMENT_ARRAY_BUFFER',
    'STATIC_DRAW', 'TEXTURE_2D', 'TEXTURE_WRAP_S', 'TEXTURE_WRAP_T', 'CLAMP_TO_EDGE', 'TEXTURE_MIN_FILTER', 'TEXTURE_MAG_FILTER',
    'LINEAR', 'RGBA', 'UNSIGNED_BYTE', 'DEPTH_TEST', 'LEQUAL', 'CULL_FACE', 'BLEND', 'MAX_RENDERBUFFER_SIZE', 'MAX_TEXTURE_SIZE',
    'TEXTURE0', 'UNPACK_FLIP_Y_WEBGL', 'UNPACK_PREMULTIPLY_ALPHA_WEBGL', 'COLOR_BUFFER_BIT', 'DEPTH_BUFFER_BIT', 'FLOAT', 'TRIANGLES', 'UNSIGNED_SHORT'];
  let objectId = 0;
  const gl = { NO_ERROR: 0 };
  constants.forEach((key, index) => { gl[key] = index + 1; });
  for (const name of ['createShader', 'createProgram', 'createBuffer', 'createTexture']) {
    gl[name] = (...args) => { const object = { id: ++objectId, kind: name }; calls.push([name, ...args, object]); return object; };
  }
  for (const name of ['shaderSource', 'compileShader', 'deleteShader', 'attachShader', 'linkProgram', 'deleteProgram',
    'bindBuffer', 'bufferData', 'bindTexture', 'texParameteri', 'deleteTexture', 'deleteBuffer', 'enable', 'depthFunc',
    'disable', 'clearColor', 'viewport', 'activeTexture', 'pixelStorei', 'clear', 'useProgram', 'enableVertexAttribArray',
    'vertexAttribPointer', 'uniform1i', 'uniformMatrix4fv', 'uniformMatrix3fv', 'uniform1f', 'uniform3f', 'uniform2f', 'drawElements']) {
    gl[name] = (...args) => { calls.push([name, ...args]); };
  }
  gl.texImage2D = (...args) => {
    if (gl.failTexture) throw new Error('tainted-canvas');
    calls.push(['texImage2D', ...args]);
  };
  gl.getShaderParameter = () => !shaderFailure;
  gl.getShaderInfoLog = () => 'test shader compilation failure';
  gl.getProgramParameter = () => true;
  gl.getUniformLocation = (program, name) => name;
  gl.getAttribLocation = () => 0;
  gl.getError = () => 0;
  gl.getParameter = parameter => parameter === gl.MAX_RENDERBUFFER_SIZE ? 4096 : 4096;
  canvas.getContext = () => gl;
  return {
    canvas, win, page, gl, calls, frames, media, captured,
    advance(count = 1, delta = 40) {
      for (let i = 0; i < count; i++) {
        now += delta;
        const pending = [...frames.values()]; frames.clear();
        for (const callback of pending) callback(now);
      }
    },
    uniform(name) { return calls.filter(call => call[0] === 'uniform1f' && call[1] === name).at(-1)?.[2]; }
  };
}

test('the indexed cloth grid covers all UVs with valid, consistently wound triangles', () => {
  const { uv, indices } = buildClothGrid();
  assert.equal(uv.length, 81 * 97 * 2);
  assert.equal(indices.length, 80 * 96 * 6);
  assert.deepEqual(Array.from(uv.slice(0, 2)), [0, 0]);
  assert.deepEqual(Array.from(uv.slice(-2)), [1, 1]);
  assert(uv.every(value => value >= 0 && value <= 1));
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = Array.from(indices.slice(i, i + 3));
    assert(a < uv.length / 2 && b < uv.length / 2 && c < uv.length / 2);
    const cross = (uv[b * 2] - uv[a * 2]) * (uv[c * 2 + 1] - uv[a * 2 + 1])
      - (uv[b * 2 + 1] - uv[a * 2 + 1]) * (uv[c * 2] - uv[a * 2]);
    assert(cross < 0, 'winding faces the camera after mapping UV y downward');
  }
  assert(buildClothGrid(160, 160).indices.every(index => index < 65536));
  for (const parameters of [[0, 10], [10, 7], [161, 10], [10.5, 10], [10, NaN]]) assert.throws(() => buildClothGrid(...parameters));
});

test('unsupported WebGL returns null without consuming a canvas 2D context', () => {
  const requested = [];
  assert.equal(createClothScene(null), null);
  assert.equal(createClothScene({ getContext(type) { requested.push(type); return null; } }), null);
  assert.deepEqual(requested, ['webgl']);
});

test('explicit canvas renderer returns the cloth fallback before requesting GPU resources', () => {
  const h = harness();h.win.location = {search:'?mode=personal&renderer=canvas'};
  const originalStyle = {...h.canvas.style}, originalSize = [h.canvas.width,h.canvas.height];
  h.canvas.getContext = () => {throw new Error('Explicit canvas mode must not request a WebGL context');};
  assert.equal(createClothScene(h.canvas),null);
  assert.equal(h.calls.length,0);assert.equal(h.frames.size,0);
  assert.deepEqual(h.canvas.style,originalStyle);assert.deepEqual([h.canvas.width,h.canvas.height],originalSize);
});

test('shared uniforms and varyings use matching precision in both actual shader sources', () => {
  const h = harness(); const scene = createClothScene(h.canvas);
  const sources = h.calls.filter(call => call[0] === 'shaderSource').map(call => call[2]);
  const declarations = source => {
    const defaultPrecision = source.match(/precision\s+(lowp|mediump|highp)\s+float\s*;/)?.[1];
    return new Map([...source.matchAll(/\b(uniform|varying)\s+(?:(lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*;/gu)]
      .map(([, qualifier, precision, type, name]) => [name, { qualifier, type, precision: precision || defaultPrecision }]));
  };
  assert.equal(sources.length, 2);
  const vertex = declarations(sources[0]), fragment = declarations(sources[1]);
  for (const [name, declaration] of vertex) if (fragment.has(name)) {
    assert.deepEqual(fragment.get(name), declaration, `WebGL1 shared declaration ${name} matches across stages`);
  }
  scene.destroy();
});

test('texture upload accepts a real canvas-shaped source and caps backing DPR at 2', () => {
  const h = harness(); const scene = createClothScene(h.canvas);
  assert.equal(scene.supported, true);
  assert.equal(h.canvas.width, 1200); assert.equal(h.canvas.height, 1200);
  const source = { width: 720, height: 720 };
  assert.equal(scene.setTexture(source), true);
  assert(h.calls.some(call => call[0] === 'texImage2D' && call.at(-1) === source));
  assert(h.calls.some(call => call[0] === 'texParameteri' && call[2] === h.gl.TEXTURE_WRAP_S && call[3] === h.gl.CLAMP_TO_EDGE));
  assert(h.calls.some(call => call[0] === 'disable' && call[1] === h.gl.CULL_FACE), 'both sides of the cloth are rendered');
  assert.equal(scene.setTexture({ width: 0, height: 720 }), false);
  assert.equal(scene.setStage('invalid'), false);
  h.advance();
  assert(h.calls.some(call => call[0] === 'drawElements' && call[2] === 80 * 96 * 6));
  scene.destroy();
});

test('hidden and offscreen canvases pause scheduled rendering and resume when visible', () => {
  const h = harness(); const scene = createClothScene(h.canvas);
  h.advance(); assert.equal(h.frames.size, 1);
  h.page.hidden = true; h.page.emit('visibilitychange'); assert.equal(h.frames.size, 0);
  h.page.hidden = false; h.page.emit('visibilitychange'); assert.equal(h.frames.size, 1);
  h.canvas.rect.top = 1200; h.canvas.rect.bottom = 1800;
  h.win.emit('scroll'); assert.equal(h.frames.size, 0);
  h.canvas.rect.top = 0; h.canvas.rect.bottom = 600;
  h.win.emit('scroll'); assert.equal(h.frames.size, 1);
  scene.destroy();
});

test('reduced motion has no continuous frames but supports keyboard, stage and texture updates', () => {
  const h = harness({ reduced: true }); const scene = createClothScene(h.canvas);
  h.advance(); assert.equal(h.frames.size, 0); assert.equal(h.uniform('uMotion'), 0);
  const before = h.calls.filter(call => call[0] === 'uniformMatrix3fv').at(-1)[3];
  const key = h.canvas.emit('keydown', { key: 'ArrowRight' });
  assert.equal(key.defaultPrevented, true);
  h.advance(); assert.equal(h.frames.size, 0);
  assert.notDeepEqual(h.calls.filter(call => call[0] === 'uniformMatrix3fv').at(-1)[3], before);
  assert.equal(scene.setStage('dye'), true); h.advance();
  assert.equal(h.uniform('uWet'), 1);
  assert.equal(scene.setTexture({ width: 720, height: 720 }), true); h.advance();
  assert.equal(h.frames.size, 0);
  scene.destroy();
});

test('pause micro-wind stops ambient frames while retaining horizontal drag and vertical touch scrolling', () => {
  const h = harness(); const interactions = [];
  const scene = createClothScene(h.canvas, { onInteraction: event => interactions.push(event.type) });
  assert.equal(scene.setMotionPaused(true), true); h.advance();
  assert.equal(h.frames.size, 0);
  const time = h.uniform('uTime'); scene.resize(); h.advance(); assert.equal(h.uniform('uTime'), time);
  h.canvas.emit('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100, timeStamp: 0 });
  const vertical = h.canvas.emit('pointermove', { pointerId: 1, clientX: 102, clientY: 150, timeStamp: 40 });
  assert.equal(vertical.defaultPrevented, false); assert.equal(h.captured.size, 0);
  h.win.emit('pointerup', { pointerId: 1 });
  h.canvas.emit('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 100, clientY: 100, timeStamp: 80 });
  const horizontal = h.canvas.emit('pointermove', { pointerId: 2, clientX: 150, clientY: 102, timeStamp: 120 });
  assert.equal(horizontal.defaultPrevented, true); assert(h.captured.has(2));
  h.win.emit('pointercancel', { pointerId: 2 }); assert.equal(h.captured.size, 0);
  assert.deepEqual(interactions, ['start', 'move', 'end']);
  h.advance(200); assert.equal(h.frames.size, 0, 'inertia settles rather than running indefinitely while paused');
  assert.equal(scene.setMotionPaused(false), true); h.advance(); assert.equal(h.frames.size, 1);
  scene.destroy();
});

test('holding a dragged cloth still clears stale fling velocity and cancellation never flings', () => {
  function release({ hold = 1, cancelled = false } = {}) {
    const h = harness(); const scene = createClothScene(h.canvas);
    scene.setMotionPaused(true); h.advance();
    h.canvas.emit('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100, timeStamp: 0 });
    h.canvas.emit('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 100, timeStamp: 40 });
    h.advance(hold);
    h.win.emit(cancelled ? 'pointercancel' : 'pointerup', { pointerId: 1, timeStamp: 40 + hold * 40 });
    h.advance();
    const rotation = Array.from(h.calls.filter(call => call[0] === 'uniformMatrix3fv').at(-1)[3]);
    assert.equal(h.captured.size, 0);
    scene.destroy();
    return rotation;
  }
  const held = release({ hold: 50 });
  assert.deepEqual(held, release({ hold: 50, cancelled: true }), 'a two-second stationary hold releases with no cached fling');
  assert.deepEqual(held, release({ cancelled: true }), 'cancellation retains only the designed spring return');
  assert.notDeepEqual(held, release(), 'an immediate release still retains intentional flick feedback');
});

test('context loss pauses, announces fallback and rebuilds GPU resources with the newest queued canvas', () => {
  const h = harness(); const states = [], fallbacks = [];
  const scene = createClothScene(h.canvas, { onContextChange: event => states.push(event.state), onFallback: reason => fallbacks.push(reason) });
  const original = { width: 720, height: 720 }; scene.setTexture(original);
  const loss = h.canvas.emit('webglcontextlost');
  assert.equal(loss.defaultPrevented, true); assert.equal(h.frames.size, 0);
  assert.deepEqual(states, ['ready', 'lost']); assert.deepEqual(fallbacks, ['context-lost']);
  const queued = { width: 512, height: 512 }; assert.equal(scene.setTexture(queued), true);
  h.canvas.emit('webglcontextrestored');
  assert.equal(states.at(-1), 'restored');
  assert.equal(h.calls.filter(call => call[0] === 'createProgram').length, 2);
  assert.equal(h.calls.filter(call => call[0] === 'texImage2D').at(-1).at(-1), queued);
  h.advance(); assert.equal(h.frames.size, 1);
  scene.destroy();
});

test('corner lifting is bounded, smoothly reaches its target while wind is paused and reverses without an endless loop', () => {
  const h = harness(); const scene = createClothScene(h.canvas);
  scene.setMotionPaused(true); h.advance();
  assert.equal(h.uniform('uLift'), 0);
  assert.equal(scene.setLift(1), true); h.advance();
  const first = h.uniform('uLift');
  assert(first > 0 && first < 1, 'ordinary motion interpolates rather than jumping');
  h.advance(100);
  assert(Math.abs(h.uniform('uLift') - 1) < .003);
  assert.equal(h.frames.size, 0);
  assert.equal(scene.setLift(-100), true); h.advance(100);
  assert(h.uniform('uLift') >= 0 && h.uniform('uLift') < .003);
  assert.equal(h.frames.size, 0);
  for (const invalid of [NaN, Infinity, '1', null]) assert.equal(scene.setLift(invalid), false);
  scene.destroy(); assert.equal(scene.setLift(1), false);
});

test('reduced motion lifts immediately and keeps manual rotation available', () => {
  const h = harness({ reduced: true }); const scene = createClothScene(h.canvas);
  h.advance();
  assert.equal(scene.setLift(10), true); h.advance();
  assert.equal(h.uniform('uLift'), 1); assert.equal(h.frames.size, 0);
  h.canvas.emit('keydown', { key: 'ArrowRight' }); h.advance();
  assert.equal(h.uniform('uLift'), 1); assert.equal(h.frames.size, 0);
  scene.setLift(.25); h.advance(); assert.equal(h.uniform('uLift'), .25);
  scene.destroy();
});

test('corner projection is finite for default, frontal and lifted views and follows CSS focus exactly', () => {
  const defaultView = projectClothCorner({ width: 600, height: 600 });
  assert(Number.isFinite(defaultView.x) && Number.isFinite(defaultView.y));
  assert.equal(typeof defaultView.visible, 'boolean');
  const view = { width: 600, height: 600, zoom: .95, yaw: 0, pitch: 0, roll: 0, motion: 0 };
  const front = projectClothCorner(view);
  const lifted = projectClothCorner({ ...view, lift: 1 });
  assert.equal(front.visible, true); assert.equal(lifted.visible, true);
  assert(lifted.y < front.y, 'lifting the physical corner moves its screen projection upward');
  const focused = projectClothCorner({ ...view, focus: [.6, .7] });
  assert(Math.abs(focused.x - front.x - 60) < 1e-8);
  assert(Math.abs(focused.y - front.y - 120) < 1e-8);
  const drifted = projectClothCorner({ ...view, time: 2.3, motion: 1, hand: [.9, .9, .2] });
  assert.notDeepEqual(drifted, front, 'breeze and hand displacement are included in corner tracking');
  assert.deepEqual(projectClothCorner({ width: 0, height: 600 }), { x: 0, y: 0, visible: false });
  assert.equal(projectClothCorner({ ...view, focus: [10, 10] }).visible, false);
});

test('onFrame follows actual draws and reports the real projected corner and interpolated lift without scheduling extra work', () => {
  const h = harness({ reduced: true }); const frames = [];
  const scene = createClothScene(h.canvas, { reducedMotion: true, yaw: 0, pitch: 0, roll: 0, zoom: .95, onFrame: frame => frames.push(frame) });
  h.advance();
  assert.equal(frames.length, 1); assert.equal(h.frames.size, 0);
  assert.deepEqual(frames[0], { corner: projectClothCorner({ width: 600, height: 600, yaw: 0, pitch: 0, roll: 0, zoom: .95, motion: 0 }), lift: 0 });
  scene.setLift(1); h.advance();
  assert.equal(frames.length, 2); assert.equal(frames[1].lift, 1);
  assert(frames[1].corner.y < frames[0].corner.y);
  h.advance(100); assert.equal(frames.length, 2, 'a handle callback does not create idle frames');
  assert.equal(h.calls.filter(call => call[0] === 'drawElements').length, frames.length);
  scene.destroy();
});

test('lifting uses interaction-rate frames while idle breeze retains the lower frame cap', () => {
  const h = harness(); const scene = createClothScene(h.canvas);
  h.advance();
  let draws = h.calls.filter(call => call[0] === 'drawElements').length;
  h.advance(8, 1000 / 60);
  const idle = h.calls.filter(call => call[0] === 'drawElements').length - draws;
  assert(idle >= 3 && idle <= 5);
  scene.setLift(1); draws = h.calls.filter(call => call[0] === 'drawElements').length;
  h.advance(8, 1000 / 60);
  const active = h.calls.filter(call => call[0] === 'drawElements').length - draws;
  assert.equal(active, 8);
  scene.destroy();
});

test('corner coordinates stay in local layout pixels during an ancestor scale animation', () => {
  const h = harness({ reduced: true }); const frames = [];
  h.canvas.clientWidth = h.canvas.clientHeight = 600;
  h.canvas.rect.width = h.canvas.rect.height = 300;
  const scene = createClothScene(h.canvas, { reducedMotion: true, yaw: 0, pitch: 0, roll: 0, zoom: .95, onFrame: frame => frames.push(frame) });
  h.advance();
  assert.deepEqual(frames[0].corner, projectClothCorner({ width: 600, height: 600, yaw: 0, pitch: 0, roll: 0, zoom: .95, motion: 0 }));
  scene.destroy();
});

test('sculpture is a broad nondegenerate surface with an S spine and opposing front/back folds', () => {
  const settings = { sculpture: 1, motion: 0 };
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
  let front = 0, back = 0;
  for (let y = 0; y <= 24; y++) for (let x = 0; x <= 24; x++) {
    const u = x / 24, v = y / 24, point = sampleClothSurface(u, v, settings);
    assert(point.every(Number.isFinite));
    point.forEach((n, axis) => { minimum[axis] = Math.min(minimum[axis], n); maximum[axis] = Math.max(maximum[axis], n); });
    const du = sampleClothSurface(u + .0001, v, settings).map((n, i) => n - point[i]);
    const dv = sampleClothSurface(u, v + .0001, settings).map((n, i) => n - point[i]);
    const normal = [dv[1] * du[2] - dv[2] * du[1], dv[2] * du[0] - dv[0] * du[2], dv[0] * du[1] - dv[1] * du[0]];
    assert(Math.hypot(...normal) > 1e-8, 'the surface retains a usable normal through folded waists');
    if (normal[2] > 0) front++; else back++;
  }
  assert(maximum[0] - minimum[0] > 3, 'keeps a wide patterned sail');
  assert(maximum[1] - minimum[1] > 3.4, 'extends the long silhouette');
  assert(maximum[2] - minimum[2] > 3, 'has genuine depth rather than only small z ripples');
  assert(front > 100 && back > 5, 'both facing and turned folds are present');
  const spine = [0, .25, .5, .75, 1].map(v => sampleClothSurface(.5, v, settings)[0]);
  assert(spine[1] > spine[0] && spine[3] < spine[2] && spine[4] < spine[1], 'the centerline returns across the vertical axis');
  const original = sampleClothSurface(.78, .62, { motion: 0 });
  const sculpture = sampleClothSurface(.78, .62, settings);
  const midpoint = sampleClothSurface(.78, .62, { ...settings, sculpture: .5 });
  midpoint.forEach((n, i) => assert(Math.abs(n - (original[i] + sculpture[i]) / 2) < 1e-10));
  assert.deepEqual(sampleClothSurface(.9, 0, { ...settings, lift: 1 }), sampleClothSurface(.9, 0, settings), 'lift still leaves the top edge untouched');
});

test('sculpture opt-in, bounded morphing and reversal settle while ambient motion is paused', () => {
  const h = harness(); const scene = createClothScene(h.canvas);
  scene.setMotionPaused(true); h.advance();
  assert.equal(h.uniform('uSculpture'), 0, 'inspection is the default surface');
  assert.equal(scene.setSculpture(10), true); h.advance();
  assert(h.uniform('uSculpture') > 0 && h.uniform('uSculpture') < 1);
  h.advance(100); assert(Math.abs(h.uniform('uSculpture') - 1) < .003); assert.equal(h.frames.size, 0);
  assert.equal(scene.setSculpture(-10), true); h.advance(100);
  assert(h.uniform('uSculpture') >= 0 && h.uniform('uSculpture') < .003); assert.equal(h.frames.size, 0);
  for (const invalid of [NaN, Infinity, '1', null]) assert.equal(scene.setSculpture(invalid), false);
  scene.destroy(); assert.equal(scene.setSculpture(1), false);
});

test('reduced-motion sculpture tracks the exact lifted corner and survives context restoration', () => {
  const h = harness({ reduced: true }); const frames = [];
  const camera = { yaw: -.15, pitch: .08, roll: -.16, zoom: .98 };
  const scene = createClothScene(h.canvas, { ...camera, sculpture: 1, onFrame: frame => frames.push(frame) });
  h.advance(); assert.equal(h.frames.size, 0); assert.equal(h.uniform('uSculpture'), 1);
  assert.deepEqual(frames.at(-1).corner, projectClothCorner({ ...camera, width: 600, height: 600, motion: 0, sculpture: 1 }));
  scene.setLift(.7); scene.setSculpture(.6); h.advance();
  assert.equal(h.uniform('uSculpture'), .6); assert.equal(h.frames.size, 0);
  assert.deepEqual(frames.at(-1).corner, projectClothCorner({ ...camera, width: 600, height: 600, motion: 0, sculpture: .6, lift: .7 }));
  h.canvas.emit('webglcontextlost'); h.canvas.emit('webglcontextrestored'); h.advance();
  assert.equal(h.uniform('uSculpture'), .6); assert.equal(h.uniform('uLift'), .7); assert.equal(h.frames.size, 0);
  scene.destroy();
});

test('shader initialization failure returns null and texture failures never report success', () => {
  const bad = harness({ shaderFailure: true }); const failures = [];
  assert.equal(createClothScene(bad.canvas, { onFallback: reason => failures.push(reason) }), null);
  assert.deepEqual(failures, ['webgl-initialization-failed: test shader compilation failure']);
  assert.equal(bad.canvas.dataset.clothError, 'test shader compilation failure');
  assert.equal(bad.canvas.style.touchAction, 'auto'); assert.equal(bad.frames.size, 0);
  const h = harness(); const reasons = [];
  const scene = createClothScene(h.canvas, { onFallback: reason => reasons.push(reason) });
  h.gl.failTexture = true;
  assert.equal(scene.setTexture({ width: 720, height: 720 }), false);
  assert.deepEqual(reasons, ['texture-upload-failed']);
  scene.destroy();
});

test('destroy removes handlers, GPU resources and pending frames and restores host interaction styles', () => {
  const h = harness(); const scene = createClothScene(h.canvas);
  assert.equal(h.canvas.style.touchAction, 'pan-y'); assert.equal(h.canvas.getAttribute('tabindex'), '0');
  scene.destroy(); scene.destroy();
  assert.equal(h.frames.size, 0); assert.equal(h.canvas.style.touchAction, 'auto');
  assert.equal(h.canvas.getAttribute('tabindex'), null);
  assert([...h.canvas.listeners.values()].every(set => set.size === 0));
  assert([...h.page.listeners.values()].every(set => set.size === 0));
  assert([...h.win.listeners.values()].every(set => set.size === 0));
  assert.equal(h.calls.filter(call => call[0] === 'deleteBuffer').length, 2);
  assert.equal(h.calls.filter(call => call[0] === 'deleteTexture').length, 1);
  assert.equal(h.calls.filter(call => call[0] === 'deleteProgram').length, 1);
  assert.equal(scene.setStage('dye'), false); assert.equal(scene.setMotionPaused(false), false);
});
