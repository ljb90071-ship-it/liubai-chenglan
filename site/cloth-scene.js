/*
 * Original WebGL cloth study: a parametric surface, not a physical textile solver.
 * All pattern pixels come from the canvas supplied by the caller.
 * Sources checked: MDN Using textures in WebGL, webglcontextlost,
 * Intersection Observer API, and touch-action.
 * Cloth-lighting reference (concept only, no copied code):
 * https://google.github.io/filament/main/filament.html#materialsystem/clothmodel
 * Sculpture is an art-directed parametric surface, not a physical simulation.
 */

const VERTEX_SHADER = `
precision highp float;
attribute vec2 aUV;
uniform mat4 uProjection;
uniform mat3 uRotation;
uniform mediump float uDistance;
uniform float uTime;
uniform float uMotion;
uniform mediump float uWet;
uniform mediump float uLift;
uniform mediump float uSculpture;
uniform vec3 uHand;
uniform vec2 uFocus;
varying mediump vec2 vUV;
varying mediump vec3 vNormal;
varying mediump vec3 vPosition;
varying mediump float vFold;
varying mediump vec3 vWarp;
varying mediump vec3 vWeft;

vec3 sculpture(vec2 uv) {
  float u = uv.x;
  float v = uv.y;
  float q = u - 0.5;
  float breathing = uMotion * sin(uTime * 0.31 + v * 3.5);
  // An S-shaped spine and opposing cross-section rotations produce a broad
  // sail, a narrow turned waist, and a returning lower hem in a single surface.
  float twist = 1.30 * sin(v * 5.3407075 - 0.9) - 0.08;
  twist += breathing * 0.035;
  float span = q * 3.12 * (0.80 + 0.20 * sin(v * 3.14159265));
  float edge = pow(abs(q) * 2.0, 5.0);
  float cup = 0.24 * (cos(q * 6.2831853) - 1.0);
  float pleat = sin(u * 17.0 + v * 5.5) * (0.055 + 0.05 * v);
  float curl = edge * (0.30 * sin(v * 5.2 + 0.5) + 0.17);
  float fold = cup + pleat + curl + breathing * 0.024;
  vec3 p;
  p.x = 0.42 * sin(v * 6.2831853 - 0.65) + span * cos(twist) + fold * sin(twist);
  p.y = (0.5 - v) * 3.40 + 0.12 * sin(v * 6.2831853);
  p.y += q * 0.48 * sin(v * 6.2831853 - 0.4) + q * q * 0.32 * cos(v * 4.0);
  p.z = 0.34 * cos(v * 6.2831853 - 0.2) + span * sin(twist) - fold * cos(twist);
  return p;
}

vec3 cloth(vec2 uv) {
  float u = uv.x;
  float v = uv.y;
  float freeEdge = v * v;
  float slow = uTime * 0.43;
  float arch = sin(u * 3.14159265);
  float broad = sin(u * 10.1 + v * 1.5 + 0.25);
  float narrow = sin(u * 23.5 - v * 3.3 + 0.7);
  float breeze = uMotion * sin(slow + u * 4.7 - v * 2.9);
  vec3 p;
  p.x = (u - 0.5) * 2.8;
  p.x += 0.075 * sin(v * 3.1 + 0.6) * arch;
  p.x += breeze * freeEdge * 0.045;
  p.y = (0.5 - v) * 2.8;
  p.y -= arch * (0.19 + 0.08 * uWet) * (1.0 - 0.55 * v);
  p.y += 0.042 * sin(u * 7.3 + 0.7) * freeEdge;
  p.z = broad * (0.13 + v * 0.12) + narrow * freeEdge * 0.035;
  p.z += 0.12 * cos(u * 3.5 - 0.5) * (1.0 - v);
  p.z += breeze * freeEdge * 0.075;
  // An open corner curl makes perspective and the cloth silhouette legible.
  p.z += pow(max(0.0, (u - 0.67) / 0.33), 2.0) * freeEdge * 0.25;
  p.x -= pow(max(0.0, (u - 0.8) / 0.2), 2.0) * freeEdge * 0.08;
  if (uSculpture > 0.0) p = mix(p, sculpture(uv), uSculpture);
  vec2 delta = uv - uHand.xy;
  float hand = exp(-dot(delta, delta) * 16.0) * uHand.z;
  p.z += hand * (0.65 + 0.35 * sin(u * 8.0 - v * 5.0));
  p.x += hand * 0.12;
  // Lift only the lower-right corner. The complete top edge has zero lift weight.
  float liftWeight = u * u * u * v * v;
  p += vec3(-0.32, 0.60, 1.15) * uLift * liftWeight;
  return p;
}

void main() {
  vec3 local = cloth(aUV);
  // The normal is the cross product of tangents of the actual displaced mesh.
  float e = 0.0015;
  vec3 du = cloth(aUV + vec2(e, 0.0)) - cloth(aUV - vec2(e, 0.0));
  vec3 dv = cloth(aUV + vec2(0.0, e)) - cloth(aUV - vec2(0.0, e));
  vNormal = normalize(uRotation * cross(dv, du));
  vWarp = normalize(uRotation * du);
  vWeft = normalize(uRotation * dv);
  vec3 world = uRotation * local;
  vPosition = world;
  vUV = aUV;
  vFold = local.z;
  vec4 projected = uProjection * vec4(world - vec3(0.0, 0.0, uDistance), 1.0);
  projected.xy += uFocus * projected.w;
  gl_Position = projected;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uTexture;
uniform mediump float uWet;
uniform mediump float uDistance;
uniform mediump float uSculpture;
uniform mediump float uDetail;
varying mediump vec2 vUV;
varying mediump vec3 vNormal;
varying mediump vec3 vPosition;
varying mediump float vFold;
varying mediump vec3 vWarp;
varying mediump vec3 vWeft;

void main() {
  vec3 normal = normalize(vNormal);
  if (!gl_FrontFacing) normal = -normal;
  // A bounded thread scale fades below a useful pixel footprint. No derivative
  // extension is required, so WebGL1 fallback devices use the same material.
  float detail = smoothstep(420.0, 1100.0, uDetail);
  float warp = sin(vUV.x * 2249.0 + sin(vUV.y * 97.0) * 0.8);
  float weft = sin(vUV.y * 2371.0 + sin(vUV.x * 83.0) * 0.65);
  normal = normalize(normal + (normalize(vWarp) * warp + normalize(vWeft) * weft) * 0.026 * detail);
  vec3 light = normalize(vec3(-0.52, 0.72, 1.1));
  vec3 fill = normalize(vec3(0.8, -0.25, 0.75));
  vec3 view = normalize(vec3(0.0, 0.0, uDistance) - vPosition);
  vec3 halfLight = normalize(light + view);
  vec3 textile = texture2D(uTexture, vec2(vUV.x, 1.0 - vUV.y)).rgb;
  // Exhibition lighting enriches the blue pigment while retaining all resist pixels.
  float bluePigment = (1.0 - smoothstep(0.28, 0.75, textile.r)) * uSculpture;
  textile = mix(textile, textile * vec3(0.62, 0.86, 1.42), bluePigment * 0.72);
  float diffuse = max(dot(normal, light), 0.0);
  float bounce = max(dot(normal, fill), 0.0);
  float weave = warp * weft * detail;
  float lightness = 0.23 + diffuse * 0.78 + bounce * 0.14;
  float softDepth = 0.94 + clamp(vFold, -0.7, 0.7) * 0.07;
  float rim = pow(1.0 - abs(dot(normal, view)), 3.5);
  float cotton = pow(max(dot(normal, halfLight), 0.0), 30.0);
  float yarn = sin(vUV.x * 733.0 + sin(vUV.y * 167.0)) * 0.5 + 0.5;
  vec3 color = textile * lightness * softDepth * (1.0 + weave * 0.027 + yarn * 0.014);
  // Dry cotton has broad grazing sheen rather than a plastic specular spot.
  float sheen = pow(max(1.0 - pow(max(dot(normal, halfLight), 0.0), 2.0), 0.0), 0.65);
  sheen *= (0.35 + diffuse * 0.65) * rim;
  color += vec3(0.71, 0.78, 0.83) * sheen * (0.13 + uSculpture * 0.075);
  color += vec3(0.83, 0.78, 0.66) * rim * 0.032;
  color += vec3(0.7, 0.8, 0.88) * cotton * (0.007 + uWet * 0.075);
  if (!gl_FrontFacing) color = color * vec3(0.86, 0.90, 0.94) + textile * 0.055;
  float hem = min(min(vUV.x, 1.0 - vUV.x), min(vUV.y, 1.0 - vUV.y));
  float selvage = 1.0 - smoothstep(0.001, 0.006, hem);
  color = mix(color, color * 0.80 + vec3(0.15, 0.17, 0.16) * (0.6 + yarn * 0.4), selvage * 0.35);
  // A soft highlight shoulder keeps the white resist pattern legible.
  color = min(color, vec3(0.90)) + (vec3(1.0) - exp(-max(color - vec3(0.90), vec3(0.0)) * 10.0)) * 0.10;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** A finite indexed grid; y=0 is the top of the supplied design canvas. */
export function buildClothGrid(columns = 80, rows = 96) {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 8 || rows < 8 || columns > 160 || rows > 160) {
    throw new RangeError('Cloth mesh subdivisions must be integers between 8 and 160.');
  }
  const uv = new Float32Array((columns + 1) * (rows + 1) * 2);
  const indices = new Uint16Array(columns * rows * 6);
  let vertex = 0, triangle = 0;
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
    uv[vertex++] = x / columns; uv[vertex++] = y / rows;
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const a = y * (columns + 1) + x, b = a + columns + 1;
    indices[triangle++] = a; indices[triangle++] = b; indices[triangle++] = a + 1;
    indices[triangle++] = a + 1; indices[triangle++] = b; indices[triangle++] = b + 1;
  }
  return { uv, indices };
}

function rotationMatrix(pitch, yaw, roll) {
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cz = Math.cos(roll), sz = Math.sin(roll);
  // Rz * Ry * Rx, column-major.
  return new Float32Array([
    cz * cy, sz * cy, -sy,
    cz * sy * sx - sz * cx, sz * sy * sx + cz * cx, cy * sx,
    cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx
  ]);
}

function projectionMatrix(aspect) {
  const f = 1 / Math.tan(Math.PI / 10);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, -1.002002, -1, 0, 0, -.2002002, 0]);
}

// Keep these surface equations in sync with vertex shader cloth()/sculpture().
// UV coordinates are design coordinates, not canvas pointer coordinates. This
// pure sampler also lets annotations use the renderer's real displaced surface.
export function sampleClothSurface(u, v, { time = 0, motion = 1, wet = 0, hand = [.65, .75, 0], lift = 0, sculpture = 0 } = {}) {
  const freeEdge = v * v, arch = Math.sin(u * Math.PI);
  const broad = Math.sin(u * 10.1 + v * 1.5 + .25);
  const narrow = Math.sin(u * 23.5 - v * 3.3 + .7);
  const breeze = motion * Math.sin(time * .43 + u * 4.7 - v * 2.9);
  let x = (u - .5) * 2.8 + .075 * Math.sin(v * 3.1 + .6) * arch + breeze * freeEdge * .045;
  let y = (.5 - v) * 2.8 - arch * (.19 + .08 * wet) * (1 - .55 * v) + .042 * Math.sin(u * 7.3 + .7) * freeEdge;
  let z = broad * (.13 + v * .12) + narrow * freeEdge * .035;
  z += .12 * Math.cos(u * 3.5 - .5) * (1 - v) + breeze * freeEdge * .075;
  z += Math.max(0, (u - .67) / .33) ** 2 * freeEdge * .25;
  x -= Math.max(0, (u - .8) / .2) ** 2 * freeEdge * .08;
  if (sculpture > 0) {
    const amount = clamp(sculpture, 0, 1), q = u - .5;
    const breathing = motion * Math.sin(time * .31 + v * 3.5);
    const twist = 1.30 * Math.sin(v * 5.3407075 - .9) - .08 + breathing * .035;
    const span = q * 3.12 * (.80 + .20 * Math.sin(v * Math.PI));
    const edge = (Math.abs(q) * 2) ** 5;
    const cup = .24 * (Math.cos(q * 6.2831853) - 1);
    const pleat = Math.sin(u * 17 + v * 5.5) * (.055 + .05 * v);
    const curl = edge * (.30 * Math.sin(v * 5.2 + .5) + .17);
    const fold = cup + pleat + curl + breathing * .024;
    const sx = .42 * Math.sin(v * 6.2831853 - .65) + span * Math.cos(twist) + fold * Math.sin(twist);
    const sy = (.5 - v) * 3.40 + .12 * Math.sin(v * 6.2831853)
      + q * .48 * Math.sin(v * 6.2831853 - .4) + q * q * .32 * Math.cos(v * 4);
    const sz = .34 * Math.cos(v * 6.2831853 - .2) + span * Math.sin(twist) - fold * Math.cos(twist);
    x += (sx - x) * amount; y += (sy - y) * amount; z += (sz - z) * amount;
  }
  const handWeight = Math.exp(-((u - hand[0]) ** 2 + (v - hand[1]) ** 2) * 16) * hand[2];
  z += handWeight * (.65 + .35 * Math.sin(u * 8 - v * 5));
  x += handWeight * .12;
  const lifted = u * u * u * v * v * lift;
  return [x - .32 * lifted, y + .60 * lifted, z + 1.15 * lifted];
}

/**
 * Project UV=(1,1), using exactly the renderer's surface/camera equations.
 * Returns canvas-local CSS pixels. `visible` includes viewport and near/far clipping.
 * WebGL's float rounding can cause subpixel differences from JavaScript doubles.
 */
export function projectClothCorner({ width, height, aspect = width / height, zoom = 1.06,
  focus = [.5, .5], pitch = .18, yaw = -.35, roll = -.22, time = 0, motion = 1,
  wet = 0, hand = [.65, .75, 0], lift = 0, sculpture = 0 } = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || !Number.isFinite(aspect) || aspect <= 0) {
    return { x: 0, y: 0, visible: false };
  }
  const point = sampleClothSurface(1, 1, { time, motion, wet, hand, lift, sculpture });
  const rotation = rotationMatrix(pitch, yaw, roll);
  const x = rotation[0] * point[0] + rotation[3] * point[1] + rotation[6] * point[2];
  const y = rotation[1] * point[0] + rotation[4] * point[1] + rotation[7] * point[2];
  const z = rotation[2] * point[0] + rotation[5] * point[1] + rotation[8] * point[2];
  const distance = 5.65 / Math.min(1, aspect) / zoom;
  const projection = projectionMatrix(aspect), w = distance - z;
  if (!Number.isFinite(w) || w <= 0) return { x: 0, y: 0, visible: false };
  const nx = projection[0] * x / w + (focus[0] - .5) * 2;
  const ny = projection[5] * y / w + (.5 - focus[1]) * 2;
  const nz = (projection[10] * (z - distance) + projection[14]) / w;
  return { x: (nx + 1) * width / 2, y: (1 - ny) * height / 2,
    visible: nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1 && nz >= -1 && nz <= 1 };
}

/**
 * createClothScene(canvas, options) -> renderer or null.
 * Extra options: focus:[x,y] (0..1), zoom (0.65..1.6), yaw/pitch/roll in radians;
 * onFallback(reason), onContextChange({state, reason}). All callbacks are optional.
 * setTexture(source) returns false for an unsupported/tainted source; setStage accepts
 * coat/dye/reveal. setView({focus,zoom,yaw,pitch,roll}) adjusts the camera composition.
 * setMotionPaused(boolean) freezes ambient wind while preserving manual viewing.
 * setLift(amount) smoothly lifts the lower-right corner; finite amounts clamp to 0..1.
 * sculpture:0..1 opts into the twisting hero form; the default 0 retains the
 * inspection surface. setSculpture(amount) morphs between them (instant if reduced).
 * onFrame({corner:{x,y,visible},lift}) runs after each actual draw. Corner x/y are
 * canvas-local layout CSS pixels (before ancestor transforms); position sibling
 * handles inside the same transformed container and add the canvas layout offset.
 */
export function createClothScene(canvas, options = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') return null;
  if (new URLSearchParams(canvas.ownerDocument?.defaultView?.location?.search || '').get('renderer') === 'canvas') return null;
  let gl;
  try {
    gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true, premultipliedAlpha: true, powerPreference: 'low-power' });
  } catch { return null; }
  if (!gl) return null;

  const win = canvas.ownerDocument?.defaultView || globalThis.window;
  const page = canvas.ownerDocument || globalThis.document;
  const notify = (name, value) => { try { options[name]?.(value); } catch { /* Host callbacks cannot break renderer lifecycle. */ } };
  const media = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced = typeof options.reducedMotion === 'boolean' ? options.reducedMotion : !!media?.matches;
  let resources, source = null, raf = 0, destroyed = false, lost = false;
  let visible = true, last = 0, time = 0, wet = 0, wetTarget = 0, motionPaused = false;
  let lift = 0, liftTarget = 0;
  let sculpture = Number.isFinite(options.sculpture) ? clamp(options.sculpture, 0, 1) : 0;
  let sculptureTarget = sculpture;
  let pointer = null, impulse = 0, handX = .65, handY = .75;
  let velocityYaw = 0, velocityPitch = 0;
  let focus = [.5, .5], zoom = 1.06;
  let home = { yaw: -.35, pitch: .18, roll: -.22 };
  let pose = { ...home };
  const removeListeners = [];
  const previousTouchAction = canvas.style.touchAction;
  const previousTabindex = canvas.getAttribute('tabindex');
  canvas.style.touchAction = 'pan-y';
  if (previousTabindex === null) canvas.setAttribute('tabindex', '0');

  function listen(target, type, handler, listenerOptions) {
    target.addEventListener(type, handler, listenerOptions);
    removeListeners.push(() => target.removeEventListener(type, handler, listenerOptions));
  }
  function stop() {
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0; last = 0;
  }
  function isActive() { return !destroyed && !lost && visible && !page.hidden; }
  function request() { if (isActive() && !raf) raf = win.requestAnimationFrame(tick); }

  function compile(type, text) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('shader-allocation');
    gl.shaderSource(shader, text); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const reason = gl.getShaderInfoLog(shader) || 'shader-compilation';
      gl.deleteShader(shader); throw new Error(reason);
    }
    return shader;
  }
  function release() {
    if (!resources) return;
    gl.deleteBuffer(resources.uv); gl.deleteBuffer(resources.indices);
    gl.deleteTexture(resources.texture); gl.deleteProgram(resources.program);
    resources = null;
  }
  function initialize() {
    let vertex, fragment, program, uv, indices, texture;
    try {
      vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
      fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
      program = gl.createProgram();
      if (!program) throw new Error('program-allocation');
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'program-link');
      const grid = buildClothGrid();
      uv = gl.createBuffer(); indices = gl.createBuffer(); texture = gl.createTexture();
      if (!uv || !indices || !texture) throw new Error('gpu-allocation');
      gl.bindBuffer(gl.ARRAY_BUFFER, uv); gl.bufferData(gl.ARRAY_BUFFER, grid.uv, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, grid.indices, gl.STATIC_DRAW);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([28, 62, 96, 255]));
      const uniform = {};
      for (const name of ['uProjection', 'uRotation', 'uDistance', 'uTime', 'uMotion', 'uWet', 'uLift', 'uSculpture', 'uDetail', 'uHand', 'uFocus', 'uTexture']) uniform[name] = gl.getUniformLocation(program, name);
      resources = { program, uv, indices, texture, uniform, attribute: gl.getAttribLocation(program, 'aUV'), count: grid.indices.length };
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
    } catch (error) {
      if (uv) gl.deleteBuffer(uv); if (indices) gl.deleteBuffer(indices);
      if (texture) gl.deleteTexture(texture); if (program) gl.deleteProgram(program);
      throw error;
    } finally {
      if (vertex) gl.deleteShader(vertex); if (fragment) gl.deleteShader(fragment);
    }
  }

  function resize() {
    if (destroyed || lost) return;
    const box = canvas.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const dpr = Math.min(2, win.devicePixelRatio || 1);
    const maximum = Math.min(2560, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 2560);
    const ratio = Math.min(1, maximum / (box.width * dpr), maximum / (box.height * dpr));
    const width = Math.max(1, Math.round(box.width * dpr * ratio));
    const height = Math.max(1, Math.round(box.height * dpr * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height); request();
  }

  function setTexture(next) {
    if (destroyed || !next || !Number.isFinite(next.width) || !Number.isFinite(next.height) || next.width <= 0 || next.height <= 0) return false;
    if (lost) { source = next; return true; }
    try {
      const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (next.width > maximum || next.height > maximum) throw new Error('texture-size');
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, resources.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, next);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('texture-upload');
      source = next; request(); return true;
    } catch {
      notify('onFallback', 'texture-upload-failed'); return false;
    }
  }

  function draw() {
    const aspect = canvas.width / Math.max(1, canvas.height);
    const distance = 5.65 / Math.min(1, aspect) / zoom;
    const r = resources, uniforms = r.uniform;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(r.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.uv);
    gl.enableVertexAttribArray(r.attribute); gl.vertexAttribPointer(r.attribute, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, r.indices);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, r.texture);
    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniformMatrix4fv(uniforms.uProjection, false, projectionMatrix(aspect));
    gl.uniformMatrix3fv(uniforms.uRotation, false, rotationMatrix(pose.pitch, pose.yaw, pose.roll));
    gl.uniform1f(uniforms.uDistance, distance); gl.uniform1f(uniforms.uTime, time);
    gl.uniform1f(uniforms.uMotion, reduced ? 0 : 1); gl.uniform1f(uniforms.uWet, wet);
    gl.uniform1f(uniforms.uLift, lift);
    gl.uniform1f(uniforms.uSculpture, sculpture);
    gl.uniform1f(uniforms.uDetail, Math.min(canvas.width, canvas.height) * zoom);
    gl.uniform3f(uniforms.uHand, handX, handY, impulse);
    gl.uniform2f(uniforms.uFocus, (focus[0] - .5) * 2, (.5 - focus[1]) * 2);
    gl.drawElements(gl.TRIANGLES, r.count, gl.UNSIGNED_SHORT, 0);
    if (typeof options.onFrame === 'function') {
      const rect = canvas.getBoundingClientRect();
      const corner = projectClothCorner({ width: canvas.clientWidth || rect.width, height: canvas.clientHeight || rect.height, aspect, zoom, focus,
        pitch: pose.pitch, yaw: pose.yaw, roll: pose.roll, time, motion: reduced ? 0 : 1,
        wet, hand: [handX, handY, impulse], lift, sculpture });
      notify('onFrame', { corner, lift });
    }
  }

  function tick(now) {
    raf = 0;
    if (!isActive()) { last = 0; return; }
    const interacting = pointer?.dragging || Math.abs(liftTarget - lift) > .003 || Math.abs(sculptureTarget - sculpture) > .003
      || Math.abs(velocityYaw) + Math.abs(velocityPitch) > .015
      || Math.abs(pose.yaw - home.yaw) + Math.abs(pose.pitch - home.pitch) > .015;
    const frameInterval = 1000 / (interacting ? 60 : 32);
    if (last && now - last < frameInterval - .75) { request(); return; }
    const dt = Math.min(.05, last ? (now - last) / 1000 : 1 / 30);
    last = now;
    if (!reduced) {
      if (!motionPaused) time += dt;
      if (!pointer?.dragging) {
        velocityYaw += ((home.yaw - pose.yaw) * 5.2 - velocityYaw * 4.2) * dt;
        velocityPitch += ((home.pitch - pose.pitch) * 5.2 - velocityPitch * 4.2) * dt;
        pose.yaw += velocityYaw * dt; pose.pitch += velocityPitch * dt;
      }
      impulse *= Math.exp(-dt * 3.4);
    }
    wet += (wetTarget - wet) * (reduced ? 1 : 1 - Math.exp(-dt * 5));
    lift += (liftTarget - lift) * (reduced ? 1 : 1 - Math.exp(-dt * 6.5));
    sculpture += (sculptureTarget - sculpture) * (reduced ? 1 : 1 - Math.exp(-dt * 5.0));
    draw();
    const settling = Math.abs(pose.yaw - home.yaw) + Math.abs(pose.pitch - home.pitch)
      + Math.abs(velocityYaw) + Math.abs(velocityPitch) + Math.abs(impulse) + Math.abs(wetTarget - wet) + Math.abs(liftTarget - lift) + Math.abs(sculptureTarget - sculpture) > .003;
    if (!reduced && (!motionPaused || settling)) request();
  }

  function setMotionPaused(paused) {
    if (typeof paused !== 'boolean' || destroyed) return false;
    motionPaused = paused;
    stop(); request(); return true;
  }

  function setLift(amount) {
    if (!Number.isFinite(amount) || destroyed) return false;
    liftTarget = clamp(amount, 0, 1);
    if (reduced) lift = liftTarget;
    request(); return true;
  }

  function setSculpture(amount) {
    if (!Number.isFinite(amount) || destroyed) return false;
    sculptureTarget = clamp(amount, 0, 1);
    if (reduced) sculpture = sculptureTarget;
    request(); return true;
  }

  function setStage(stage) {
    if (!['coat', 'dye', 'reveal'].includes(stage) || destroyed) return false;
    wetTarget = stage === 'dye' ? 1 : stage === 'coat' ? .1 : 0;
    if (reduced) wet = wetTarget;
    request(); return true;
  }
  function setView(view = {}) {
    if (destroyed) return;
    if (Array.isArray(view.focus) && view.focus.length === 2 && view.focus.every(Number.isFinite)) focus = view.focus.map(n => clamp(n, 0, 1));
    if (Number.isFinite(view.zoom)) zoom = clamp(view.zoom, .65, 1.6);
    for (const name of ['yaw', 'pitch', 'roll']) if (Number.isFinite(view[name])) home[name] = clamp(view[name], -Math.PI, Math.PI);
    pose = { ...home }; velocityYaw = velocityPitch = 0; impulse = 0;
    request();
  }

  function releasePointer(event, cancelled = false) {
    if (!pointer || (event?.pointerId !== undefined && event.pointerId !== pointer.id)) return;
    const previous = pointer; pointer = null;
    // Release velocity belongs to the latest movement, not the whole drag.
    // Holding still before letting go must not replay an old fast movement.
    const age = Number.isFinite(event?.timeStamp) ? Math.max(0, event.timeStamp - previous.time) : 0;
    if (cancelled || !event || age > 180) {
      velocityYaw = velocityPitch = 0; impulse = 0;
    } else if (age > 40) {
      const decay = Math.exp(-(age - 40) / 55);
      velocityYaw *= decay; velocityPitch *= decay; impulse *= decay;
    }
    try { if (canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id); } catch { /* UA may already have released capture. */ }
    if (previous.dragging) notify('onInteraction', { type: 'end', yaw: pose.yaw, pitch: pose.pitch });
    request();
  }
  function pointerDown(event) {
    if (destroyed || lost || pointer || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX,
      lastY: event.clientY, time: event.timeStamp, yaw: pose.yaw, pitch: pose.pitch, dragging: false, rejected: false, touch: event.pointerType === 'touch' };
    velocityYaw = velocityPitch = 0;
  }
  function pointerMove(event) {
    if (!pointer || event.pointerId !== pointer.id || pointer.rejected) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (!pointer.dragging) {
      if (Math.hypot(dx, dy) < 7) return;
      if (pointer.touch && Math.abs(dy) > Math.abs(dx) * 1.15) { pointer.rejected = true; return; }
      pointer.dragging = true;
      try { canvas.setPointerCapture(pointer.id); } catch { /* Window pointerup remains active. */ }
      notify('onInteraction', { type: 'start', yaw: pose.yaw, pitch: pose.pitch });
    }
    event.preventDefault();
    const box = canvas.getBoundingClientRect();
    const duration = Math.max(8, event.timeStamp - pointer.time) / 1000;
    pose.yaw = clamp(pointer.yaw + dx / Math.max(1, box.width) * 5, -3.15, 3.15);
    pose.pitch = clamp(pointer.pitch + (pointer.touch ? 0 : dy / Math.max(1, box.height) * 1.1), -.7, .7);
    velocityYaw = clamp((event.clientX - pointer.lastX) / Math.max(1, box.width) * 5 / duration, -3.5, 3.5);
    velocityPitch = pointer.touch ? 0 : clamp((event.clientY - pointer.lastY) / Math.max(1, box.height) / duration, -1, 1);
    handX = clamp((event.clientX - box.left) / Math.max(1, box.width), 0, 1);
    handY = clamp((event.clientY - box.top) / Math.max(1, box.height), 0, 1);
    impulse = reduced ? 0 : clamp(velocityYaw * .07, -.28, .28);
    pointer.lastX = event.clientX; pointer.lastY = event.clientY; pointer.time = event.timeStamp;
    notify('onInteraction', { type: 'move', yaw: pose.yaw, pitch: pose.pitch }); request();
  }
  function keyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') pose = { ...home };
    else if (event.key === 'ArrowLeft') pose.yaw -= .25;
    else if (event.key === 'ArrowRight') pose.yaw += .25;
    else if (event.key === 'ArrowUp') pose.pitch = clamp(pose.pitch - .12, -.7, .7);
    else pose.pitch = clamp(pose.pitch + .12, -.7, .7);
    velocityYaw = velocityPitch = 0;
    notify('onInteraction', { type: 'key', yaw: pose.yaw, pitch: pose.pitch }); request();
  }

  function checkVisible() {
    const rect = canvas.getBoundingClientRect();
    visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
      && rect.top < win.innerHeight && rect.left < win.innerWidth;
    if (visible) request(); else stop();
  }
  function contextLost(event) {
    event.preventDefault(); lost = true; stop(); releasePointer();
    notify('onContextChange', { state: 'lost', reason: 'context-lost' });
    notify('onFallback', 'context-lost');
  }
  function contextRestored() {
    if (destroyed) return;
    resources = null;
    try {
      initialize(); lost = false;
      if (source && !setTexture(source)) throw new Error('texture-restore');
      resize(); request(); notify('onContextChange', { state: 'restored' });
    } catch {
      lost = true; stop(); release();
      notify('onContextChange', { state: 'failed', reason: 'context-restore-failed' });
      notify('onFallback', 'context-restore-failed');
    }
  }

  let intersectionObserver, resizeObserver;
  function destroy() {
    if (destroyed) return;
    destroyed = true; stop(); releasePointer();
    for (const remove of removeListeners) remove();
    intersectionObserver?.disconnect(); resizeObserver?.disconnect();
    if (!lost) release(); else resources = null;
    source = null;
    canvas.style.touchAction = previousTouchAction;
    if (previousTabindex === null) canvas.removeAttribute('tabindex');
    else canvas.setAttribute('tabindex', previousTabindex);
  }

  try { initialize(); } catch (error) {
    canvas.style.touchAction = previousTouchAction;
    if (previousTabindex === null) canvas.removeAttribute('tabindex');
    const message = error instanceof Error ? error.message : String(error);
    canvas.dataset.clothError = message;
    console.warn('[cloth-scene] WebGL initialization failed:', message);
    notify('onFallback', `webgl-initialization-failed: ${message}`); return null;
  }
  setView(options);
  listen(canvas, 'pointerdown', pointerDown, { passive: true });
  listen(canvas, 'pointermove', pointerMove, { passive: false });
  listen(win, 'pointerup', releasePointer); listen(win, 'pointercancel', event => releasePointer(event, true));
  listen(win, 'blur', () => releasePointer(undefined, true)); listen(canvas, 'lostpointercapture', event => releasePointer(event, true));
  listen(canvas, 'keydown', keyDown);
  listen(canvas, 'webglcontextlost', contextLost); listen(canvas, 'webglcontextrestored', contextRestored);
  listen(page, 'visibilitychange', () => { if (page.hidden) { stop(); releasePointer(); } else { last = 0; request(); } });
  listen(win, 'resize', () => { resize(); checkVisible(); }, { passive: true });
  if (typeof options.reducedMotion !== 'boolean' && media?.addEventListener) {
    listen(media, 'change', event => { reduced = event.matches; impulse = 0; stop(); request(); });
  }
  if (win.IntersectionObserver) {
    intersectionObserver = new win.IntersectionObserver(entries => {
      visible = !!entries[0]?.isIntersecting;
      if (visible) request(); else { stop(); releasePointer(); }
    }, { threshold: .01 });
    intersectionObserver.observe(canvas);
  } else listen(win, 'scroll', checkVisible, { passive: true });
  if (win.ResizeObserver) {
    resizeObserver = new win.ResizeObserver(() => { resize(); checkVisible(); }); resizeObserver.observe(canvas);
  }
  resize(); checkVisible(); request();
  notify('onContextChange', { state: 'ready' });
  return { supported: true, setTexture, setStage, setView, setMotionPaused, setLift, setSculpture, resize, destroy };
}
