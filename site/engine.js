// 原创参数花版。二值防染模型只表达“孔洞过浆、浆处留白”。
export const SIZE = 240;
export const SCHEMA_VERSION = 1;
export const MOTIFS = Object.freeze({ flower: '六瓣团花', wave: '回环水纹', seed: '三叶新生', lotus: '莲华珠露', sprig: '风过麦枝', custom: '我的手刻花版' });
export const CUSTOM_GRID = 16;
export const DYE_PALETTES = Object.freeze({ indigo: '靛青', teal: '青碧', midnight: '黛夜', slate: '烟蓝' });
const dyeColors = { indigo: [30, 66, 100], teal: [27, 91, 93], midnight: [40, 43, 77], slate: [72, 91, 110] };
export function createCustomPattern() {
  return Array.from({ length: CUSTOM_GRID * CUSTOM_GRID }, (_, i) => Number(Math.hypot(i % 16 - 7.5, Math.floor(i / 16) - 7.5) < 5.8));
}
export const REPEATS = Object.freeze(['straight', 'staggered', 'mirror']);
export const FRAMES = Object.freeze(['open', 'bordered']);
export const STAGES = Object.freeze(['coat', 'dye', 'reveal']);
export const MAX_JSON_BYTES = 180000;

export function createDocument() {
  return { schemaVersion: SCHEMA_VERSION, size: SIZE, motif: 'flower', spacing: 100, bridge: true,
    rotation: 0, repeat: 'straight', motifScale: 100, frame: 'open', customPattern: createCustomPattern(), dyePalette: 'indigo', dyeDepth: 3,
    seed: 16931, name: '我的第一方蓝', stage: 'coat', coverage: new Uint8Array(SIZE * SIZE) };
}

const petalDirections = Array.from({ length: 16 }, (_, i) => ({ c: Math.cos(i * Math.PI / 8), s: Math.sin(i * Math.PI / 8) }));
const sprigLeaves = [-5, 3, 11, 18].map((y, i) => {
  const angle = i % 2 ? -.55 : Math.PI + .55;
  return { x: 2.4 * Math.sin((y + 8) / 12), y, c: Math.cos(angle), s: Math.sin(angle) };
});

// 尖瓣由连续轮廓定义。留桥切开瓣心，连接内部保留材料；孔洞始终只会减少。
function pointedPetal(along, across, start, length, width, bridge, bridgeWidth) {
  const t = (along - start) / length;
  if (t <= 0 || t >= 1 || Math.abs(across) >= width) return false;
  const halfWidth = width * Math.sin(Math.PI * t) ** .78;
  if (Math.abs(across) >= halfWidth) return false;
  // 留桥像瓣脉一样贯穿瓣心，避免细轮廓在小栅格上围出单像素纸片。
  return !(bridge && Math.abs(across) < bridgeWidth);
}

function lotusHole(u, v, bridge, bridgeWidth) {
  const radius = Math.hypot(u, v), angle = Math.atan2(v, u);
  if (radius < 1.4) return true;
  // 八瓣外层和错位八瓣内层保留清楚间隙，避免成为实心齿轮。
  const outerIndex = (Math.round(angle / (Math.PI / 4)) * 2 + 16) % 16;
  const outer = petalDirections[outerIndex];
  if (pointedPetal(u * outer.c + v * outer.s, -u * outer.s + v * outer.c, 14, 10.2, 3.5, bridge, bridgeWidth)) return true;
  const innerIndex = ((Math.round((angle - Math.PI / 8) / (Math.PI / 4)) * 2 + 1) % 16 + 16) % 16;
  const inner = petalDirections[innerIndex];
  if (pointedPetal(u * inner.c + v * inner.s, -u * inner.s + v * inner.c, 6.5, 4.5, 1.8, bridge, bridgeWidth)) return true;
  // 外层十六珠与内层八点是独立孔洞，没有闭合的实心圆环。
  if (radius > 24.1 && radius < 26) {
    const direction = petalDirections[(Math.round(angle / (Math.PI / 8)) + 16) % 16];
    if (Math.hypot(u - direction.c * 25.05, v - direction.s * 25.05) < .82) return true;
  }
  if (radius > 3 && radius < 4.2) {
    const direction = petalDirections[(Math.round(angle / (Math.PI / 4)) * 2 + 16) % 16];
    if (Math.hypot(u - direction.c * 3.6, v - direction.s * 3.6) < .5) return true;
  }
  return false;
}

function sprigHole(u, v, bridge, bridgeWidth) {
  const stemDistance = Math.abs(u - 2.4 * Math.sin((v + 8) / 12));
  if (v > -23 && v < 23 && stemDistance < .7) return true;
  // 枝根留出贯通版材的窄隙，避免枝叶与茎相接时围出细小纸片。
  if (bridge && stemDistance < bridgeWidth + 1.7) return false;
  for (const leaf of sprigLeaves) {
    const x = u - leaf.x, y = v - leaf.y;
    if (Math.abs(x) > 13 || Math.abs(y) > 9) continue;
    if (pointedPetal(x * leaf.c + y * leaf.s, -x * leaf.s + y * leaf.c, .9, 12, 3.4, bridge, bridgeWidth)) return true;
  }
  // 梢头的六枚实心穗粒，不复制莲花的放射结构。
  for (let i = 0; i < 3; i++) {
    const y = -24 + i * 4.5;
    for (const side of [-1, 1]) {
      const x = side * (4 + i * .3) + 2.4 * Math.sin((y + 8) / 12);
      if (((u - x) / 1.1) ** 2 + ((v - y) / 1.45) ** 2 < 1) return true;
    }
  }
  return false;
}

// 边带本身也是过浆孔洞：两条断续细带与独立角花，不用闭合白线圈住纸版。
function frameHole(x, y, bridge) {
  const edgeX = Math.min(x, SIZE - x), edgeY = Math.min(y, SIZE - y);
  const band = (normal, along) => {
    if (along < 30 || along > SIZE - 30) return false;
    const outerCenter = 32 + Math.round((along - 32) / 8) * 8;
    const innerCenter = 36 + Math.round((along - 36) / 8) * 8;
    return (Math.abs(normal - 12) < .7 && Math.abs(along - outerCenter) < 1.6)
      || Math.hypot(normal - 18, along - innerCenter) < .82;
  };
  if (band(edgeY, x) || band(edgeX, y)) return true;
  if (edgeX > 26 || edgeY > 26) return false;
  const u = edgeX - 17, v = edgeY - 17;
  if (bridge && Math.abs(v) < 1) return false;
  if (Math.hypot(u, v) < .95) return true;
  for (let k = 0; k < 4; k++) {
    const direction = petalDirections[k * 4 + 2];
    const along = u * direction.c + v * direction.s;
    const across = -u * direction.s + v * direction.c;
    if (((along - 4.8) / 2.7) ** 2 + (across / 1.25) ** 2 < 1) return true;
  }
  return false;
}

/** 1 = 花版孔洞；留桥是保留纸版，所以会减少孔洞。 */
export function createMask(doc, resolution = SIZE) {
  const mask = new Uint8Array(resolution * resolution);
  const pitch = 64 * doc.spacing / 100;
  const scale = Math.min(pitch / 64, 1.2) * (doc.motifScale ?? 100) / 100;
  const rotation = (doc.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const repeat = doc.repeat ?? 'straight';
  const bordered = doc.frame === 'bordered';
  const extent = 27.2 * scale;
  const completeCount = Math.max(1, Math.floor((SIZE - 54 - 2 * extent) / pitch) + 1);
  const origin = SIZE / 2 + (bordered && completeCount % 2 === 0 ? pitch / 2 : 0);
  const transformedLayout = rotation !== 0 || repeat !== 'straight' || (doc.motifScale ?? 100) !== 100;
  const bridgeWidth = Math.max(1.05, 1.15 / scale);
  const customCells = doc.motif === 'custom' ? (doc.customPattern ?? createCustomPattern()) : null;
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const px = (x + .5) * SIZE / resolution, py = (y + .5) * SIZE / resolution;
      const row = Math.floor((py - origin + pitch / 2) / pitch);
      const offset = repeat === 'staggered' && Math.abs(row % 2) === 1 ? pitch / 2 : 0;
      const column = Math.floor((px - origin - offset + pitch / 2) / pitch);
      const dx = (px - origin - offset - column * pitch) / scale;
      const dy = (py - origin - row * pitch) / scale;
      // 坐标逆旋转到同一枚原创花版；镜像按相邻列交替，错列按行偏移半格。
      let u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      if (repeat === 'mirror' && Math.abs(column % 2) === 1) u = -u;
      const radius = Math.hypot(u, v), angle = Math.atan2(v, u);
      let hole = false;
      if (doc.motif === 'flower') hole = radius > 6.5 && radius < 21 + 4.8 * Math.cos(6 * angle);
      if (doc.motif === 'wave') {
        hole = Math.abs(radius - 20) < 2.5 || Math.abs(radius - 11) < 2.2;
        hole ||= Math.hypot(u, v) < 2.7;
      }
      if (doc.motif === 'seed') {
        let seedBridge = false;
        for (let k = 0; k < 3; k++) {
          const a = k * Math.PI * 2 / 3 - Math.PI / 2;
          const along = u * Math.cos(a) + v * Math.sin(a);
          const across = -u * Math.sin(a) + v * Math.cos(a);
          hole ||= ((along - 12) / 11) ** 2 + (across / 5.8) ** 2 < 1;
          // 新布局改变栅格相位；沿三叶叶脉留桥，防止旋转后出现单像素孤岛。
          if (doc.bridge && transformedLayout && Math.abs(across) < bridgeWidth) seedBridge = true;
        }
        if (seedBridge) hole = false;
      }
      if (doc.motif === 'lotus') hole = lotusHole(u, v, doc.bridge, bridgeWidth);
      if (doc.motif === 'sprig') hole = sprigHole(u, v, doc.bridge, bridgeWidth);
      if (doc.motif === 'custom') {
        const gx = Math.floor((u + 24) / 3), gy = Math.floor((v + 24) / 3);
        hole = gx >= 0 && gx < CUSTOM_GRID && gy >= 0 && gy < CUSTOM_GRID && customCells[gy * CUSTOM_GRID + gx] === 1;
      }
      if (doc.bridge && Math.abs(v) < 1.8) hole = false;
      if (bordered) {
        // 只保留整枚落在内框的花版单元，边缘不裁出半朵主体花。
        const centerX = origin + offset + column * pitch;
        const centerY = origin + row * pitch;
        const complete = centerX - extent >= 27 && centerX + extent <= SIZE - 27
          && centerY - extent >= 27 && centerY + extent <= SIZE - 27;
        hole = (complete && px >= 27 && py >= 27 && px <= SIZE - 27 && py <= SIZE - 27 && hole)
          || frameHole(px, py, doc.bridge);
      }
      // 完整外框使花版与布面的边界明确。
      if (px < 6 || py < 6 || px >= SIZE - 6 || py >= SIZE - 6) hole = false;
      mask[y * resolution + x] = Number(hole);
    }
  }
  return mask;
}

export function coatAll(doc, mask) {
  doc.coverage.set(mask);
  return doc;
}

/** 拖动线段的离散圆刷，只在版孔内写入防染浆。 */
export function coatStroke(doc, mask, from, to, radius = 13) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(length / Math.max(1, radius / 3)));
  let changed = false;
  for (let step = 0; step <= steps; step++) {
    const cx = from.x + (to.x - from.x) * step / steps;
    const cy = from.y + (to.y - from.y) * step / steps;
    const minX = Math.max(0, Math.floor(cx - radius)), maxX = Math.min(SIZE - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius)), maxY = Math.min(SIZE - 1, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const i = y * SIZE + x;
      if (mask[i] && !doc.coverage[i] && (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= radius ** 2) {
        doc.coverage[i] = 1;
        changed = true;
      }
    }
  }
  return changed;
}

export function coveragePercent(doc, mask) {
  let total = 0, coated = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { total++; coated += doc.coverage[i]; }
  return total ? Math.round(coated / total * 100) : 0;
}

export function renderPixels(doc, mask = createMask(doc), resolution = SIZE) {
  const pixels = new Uint8ClampedArray(resolution * resolution * 4);
  const baseMask = resolution === SIZE ? mask : createMask(doc);
  const fullCoat = coveragePercent(doc, baseMask) === 100 && baseMask.every((bit, i) => !bit || doc.coverage[i]);
  const disconnected = doc.stage === 'coat' ? analyzeStencil(mask, resolution).detached : null;
  const color = dyeColors[doc.dyePalette ?? 'indigo'];
  const depth = doc.dyeDepth ?? 3;
  const blue = color.map((channel, i) => depth < 3 ? channel + (3 - depth) * [25, 27, 27][i] : channel * (1 - (depth - 3) * .22));
  const wetBlue = blue.map((channel, i) => Math.max(0, channel - [5, 5, 11][i]));
  for (let y = 0; y < resolution; y++) for (let x = 0; x < resolution; x++) {
    const i = y * resolution + x;
    const sample = Math.floor(y * SIZE / resolution) * SIZE + Math.floor(x * SIZE / resolution);
    const pasted = mask[i] && (fullCoat || doc.coverage[sample]);
    const grain = ((Math.imul(x + 1, 374761393) ^ Math.imul(y + doc.seed, 668265263)) >>> 24) / 255;
    const weave = (x % 3 === 0 ? 1.1 : 0) + (y % 4 === 0 ? -.8 : 0) + (grain - .5) * 3;
    let rgb;
    if (doc.stage === 'coat') rgb = pasted ? [247, 242, 225] : mask[i] ? [175, 170, 144] : disconnected[i] ? [179, 110, 65] : [211, 202, 171];
    else if (doc.stage === 'dye') rgb = pasted ? [166, 186, 183] : wetBlue;
    else rgb = pasted ? [242, 239, 223] : blue;
    pixels[i * 4] = rgb[0] + weave;
    pixels[i * 4 + 1] = rgb[1] + weave;
    pixels[i * 4 + 2] = rgb[2] + weave;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

export function serializeDocument(doc) {
  return { schemaVersion: SCHEMA_VERSION, size: SIZE, motif: doc.motif, spacing: doc.spacing,
    rotation: doc.rotation ?? 0, repeat: doc.repeat ?? 'straight', motifScale: doc.motifScale ?? 100, frame: doc.frame ?? 'open',
    customPattern: Array.from(doc.customPattern ?? createCustomPattern()), dyePalette: doc.dyePalette ?? 'indigo', dyeDepth: doc.dyeDepth ?? 3,
    bridge: doc.bridge, seed: doc.seed, name: doc.name, stage: doc.stage, coverage: Array.from(doc.coverage) };
}

/** 不接收任意路径、脚本、尺寸或对象合并，导入数据只进入白名单字段。 */
export function validateDocument(value) {
  const fail = message => { throw new Error(message); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('设计文件应为 JSON 对象。');
  const fields = ['schemaVersion', 'size', 'motif', 'spacing', 'bridge', 'seed', 'name', 'stage', 'coverage'];
  const layoutFields = ['rotation', 'repeat', 'motifScale', 'frame', 'customPattern', 'dyePalette', 'dyeDepth'];
  if (Object.keys(value).some(key => !fields.includes(key) && !layoutFields.includes(key)) || fields.some(key => !Object.hasOwn(value, key))) fail('设计字段不完整或含未知内容。');
  if (value.schemaVersion !== SCHEMA_VERSION || value.size !== SIZE) fail('不支持此设计版本或画布尺寸。');
  if (typeof value.motif !== 'string' || !Object.hasOwn(MOTIFS, value.motif)) fail('纹样类型无效。');
  if (!Number.isInteger(value.spacing) || value.spacing < 60 || value.spacing > 150) fail('纹样间距应为 60–150 的整数。');
  const rotation = Object.hasOwn(value, 'rotation') ? value.rotation : 0;
  const repeat = Object.hasOwn(value, 'repeat') ? value.repeat : 'straight';
  const motifScale = Object.hasOwn(value, 'motifScale') ? value.motifScale : 100;
  const frame = Object.hasOwn(value, 'frame') ? value.frame : 'open';
  if (!Number.isInteger(rotation) || rotation < 0 || rotation > 180) fail('纹样角度应为 0–180 的整数。');
  if (typeof repeat !== 'string' || !REPEATS.includes(repeat)) fail('平铺方式无效。');
  if (!Number.isInteger(motifScale) || motifScale < 70 || motifScale > 125) fail('纹样尺度应为 70–125 的整数。');
  if (typeof frame !== 'string' || !FRAMES.includes(frame)) fail('成布边式无效。');
  const customPattern = Object.hasOwn(value, 'customPattern') ? value.customPattern : createCustomPattern();
  const dyePalette = Object.hasOwn(value, 'dyePalette') ? value.dyePalette : 'indigo';
  const dyeDepth = Object.hasOwn(value, 'dyeDepth') ? value.dyeDepth : 3;
  if (!Array.isArray(customPattern) || customPattern.length !== 256 || Array.from(customPattern).some(bit => bit !== 0 && bit !== 1)) fail('自刻花版应为 16×16 的二值网格。');
  if (typeof dyePalette !== 'string' || !Object.hasOwn(DYE_PALETTES, dyePalette)) fail('染色配方无效。');
  if (!Number.isInteger(dyeDepth) || dyeDepth < 1 || dyeDepth > 5) fail('浸染深度应为 1–5 的整数。');
  if (typeof value.bridge !== 'boolean') fail('留桥设置无效。');
  if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 2147483647) fail('织纹种子无效。');
  if (typeof value.name !== 'string' || value.name.length > 40 || /[\u0000-\u001f\u007f]/u.test(value.name)) fail('作品名应在 40 字以内，且不含控制字符。');
  if (!STAGES.includes(value.stage)) fail('工序状态无效。');
  if (!Array.isArray(value.coverage) || value.coverage.length !== SIZE * SIZE || value.coverage.some(bit => bit !== 0 && bit !== 1)) fail('施浆数据损坏。');
  const doc = { schemaVersion: SCHEMA_VERSION, size: SIZE, motif: value.motif, spacing: value.spacing,
    rotation, repeat, motifScale, frame, customPattern: [...customPattern], dyePalette, dyeDepth,
    bridge: value.bridge, seed: value.seed, name: value.name, stage: value.stage, coverage: Uint8Array.from(value.coverage) };
  const mask = createMask(doc);
  if (doc.coverage.some((bit, i) => bit && !mask[i])) fail('施浆数据超出版孔，请检查设计文件。');
  return doc;
}

export function parseDocument(text) {
  if (typeof text !== 'string' || text.length > MAX_JSON_BYTES) throw new Error('文件过大，请选择本工具导出的设计 JSON。');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('无法读取 JSON，请选择完整的设计文件。'); }
  return validateDocument(data);
}

// 四邻域连接检查：保留纸版（非孔洞）必须可达外框。
// 此检查用于数字结构解释，不能判定纸张强度或实物可刻制性。
export function analyzeStencil(mask, size = SIZE) {
  if (mask.length !== size * size) throw new Error('花版尺寸不匹配');
  const reached = new Uint8Array(mask.length), queue = new Int32Array(mask.length);
  let head = 0, tail = 0;
  const add = i => { if (!mask[i] && !reached[i]) { reached[i] = 1; queue[tail++] = i; } };
  for (let n = 0; n < size; n++) { add(n); add((size - 1) * size + n); add(n * size); add(n * size + size - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % size, y = Math.floor(i / size);
    if (x) add(i - 1); if (x < size - 1) add(i + 1);
    if (y) add(i - size); if (y < size - 1) add(i + size);
  }
  const detached = new Uint8Array(mask.length);
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (!mask[i] && !reached[i]) { detached[i] = 1; count++; }
  return { detached, count };
}
