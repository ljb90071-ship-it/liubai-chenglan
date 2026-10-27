import { SIZE, MOTIFS, MAX_JSON_BYTES, createDocument, createMask, coatAll, coatStroke,
  coveragePercent, renderPixels, serializeDocument, validateDocument, parseDocument, analyzeStencil } from './engine.js?v=61';
import { getVisitorSession, CONTROL_GROUPS } from './visitor-session.js?v=1';

const visitor = getVisitorSession(window);
const storage = visitor.storage;
let allowedControls = new Set(CONTROL_GROUPS);
const fieldGroups = { motif: 'motif', spacing: 'layout', rotation: 'layout', repeat: 'layout', motifScale: 'layout', frame: 'layout', customPattern: 'custom', dyePalette: 'palette', dyeDepth: 'palette', bridge: 'bridge' };
const fieldChanged = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
function permitsDesign(next) {
  return !(next.motif === 'custom' && next.motif !== doc.motif && !allowedControls.has('custom')) && Object.entries(fieldGroups).every(([field, group]) => allowedControls.has(group) || !fieldChanged(next[field], doc[field]));
}

const $ = id => document.getElementById(id);
const savedCollectionLink = document.createElement('a');
savedCollectionLink.id = 'saved-collection-link'; savedCollectionLink.className = 'saved-collection-link';
savedCollectionLink.href = '#collection'; savedCollectionLink.hidden = true;
savedCollectionLink.textContent = '去我的布册，查看已保存的作品 ↗';
$('save').after(savedCollectionLink);
const canvas = $('studio-canvas');
const ctx = canvas.getContext('2d');
const surface = document.createElement('canvas');
surface.width = surface.height = SIZE;
const surfaceCtx = surface.getContext('2d');
const STORAGE_KEY = 'yifanglan.collection.v1';
const DRAFT_KEY = 'yifanglan.draft.v1';
const LIMIT = 12;
function freshCloth() {
  const design = createDocument(); design.motif = 'lotus'; design.frame = 'bordered'; return design;
}
let doc = freshCloth();
let mask = createMask(doc), activeId = null;
let pointer = null, frame = 0, draftTimer;
let history = [];
let draftBlocked = false, originalDraft = null;
let recoveryButton = null;
const downloadUrls = new Set();
let checkedMask = null, stencilCheck;
const stencilInfo = document.createElement('p');
stencilInfo.id = 'stencil-health'; stencilInfo.className = 'tool-note';
$('bridge').closest('label').after(stencilInfo);
const stepLabels = { coat: '01 · 施浆', dye: '02 · 浸染', reveal: '03 · 揭纹' };
const hints = {
  coat: '在花版上拖动刮浆；浆只通过孔洞。也可选择“帮我完整刮一遍”。',
  dye: '蓝染覆盖布面，防染浆仍在。拉开揭纹滑杆，或直接揭纹。',
  reveal: '浆处留白，未施浆处成蓝。保存这一方蓝，或返回施浆继续修改。'
};

function announce(text) { $('status').textContent = text; }
function pushHistory() {
  history.push({ design: serializeDocument(doc), activeId });
  if (history.length > 20) history.shift();
}
function refresh() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; draw(); });
}
function draw(target = canvas, documentState = doc) {
  const targetCtx = target === canvas ? ctx : target.getContext('2d');
  const resolution = documentState.stage === 'reveal' ? target.width : SIZE;
  const currentMask = resolution === SIZE && documentState === doc ? mask : createMask(documentState, resolution);
  if (surface.width !== resolution) surface.width = surface.height = resolution;
  surfaceCtx.putImageData(new ImageData(renderPixels(documentState, currentMask, resolution), resolution, resolution), 0, 0);
  targetCtx.imageSmoothingEnabled = true;
  targetCtx.clearRect(0, 0, target.width, target.height);
  targetCtx.drawImage(surface, 0, 0, target.width, target.height);
  // 织纹是确定的画面处理，不影响孔洞与防染计算。
  targetCtx.save();
  targetCtx.globalAlpha = .035;
  targetCtx.strokeStyle = '#faf6e7';
  targetCtx.lineWidth = .65;
  targetCtx.beginPath();
  for (let n = 1; n < target.width; n += 4) { targetCtx.moveTo(n, 0); targetCtx.lineTo(n, target.height); }
  for (let n = 1; n < target.height; n += 4) { targetCtx.moveTo(0, n); targetCtx.lineTo(target.width, n); }
  targetCtx.stroke();
  targetCtx.restore();
}
function persistDraft() {
  clearTimeout(draftTimer);
  const ticket = visitor.generation;
  draftTimer = setTimeout(() => { if (visitor.isCurrent(ticket)) writeDraft(); }, 350);
}
function writeDraft() {
  if (draftBlocked) return;
  try { storage.setItem(DRAFT_KEY, JSON.stringify({ draftVersion: 1, design: serializeDocument(doc), activeId })); }
  catch { /* 正式保存和导出提供错误提示及恢复入口。 */ }
}
window.addEventListener('pagehide', () => {
  clearTimeout(draftTimer);
  writeDraft();
});
function sync(message) {
  savedCollectionLink.hidden = true;
  $('motif').value = doc.motif;
  $('spacing').value = doc.spacing;
  $('bridge').checked = doc.bridge;
  $('piece-name').value = doc.name;
  for (const [id, value] of [['rotation', doc.rotation ?? 0], ['repeat', doc.repeat ?? 'straight'], ['motif-scale', doc.motifScale ?? 100], ['frame', doc.frame ?? 'open']]) {
    if ($(id)) { $(id).value = value; $(id).disabled = doc.stage !== 'coat' || !allowedControls.has('layout'); }
  }
  if ($('rotation-value')) $('rotation-value').textContent = `${doc.rotation ?? 0}°`;
  if ($('finish-panel') && doc.stage === 'reveal') $('finish-panel').open = true;
  if (checkedMask !== mask) { stencilCheck = analyzeStencil(mask); checkedMask = mask; }
  stencilInfo.textContent = stencilCheck.count
    ? `赭色标出了悬空的版材。试试添加留桥，看看它如何连到外框。`
    : '保留版材已连到外框。';
  const percent = coveragePercent(doc, mask);
  $('coverage').textContent = `${percent}%`;
  $('pattern-options').textContent = `${MOTIFS[doc.motif]} · 间距 ${doc.spacing}% · ${doc.bridge ? '已留横桥' : '未留横桥'}。${hints[doc.stage]}`;
  for (const button of $('step-options').querySelectorAll('button')) {
    button.classList.toggle('is-active', button.dataset.stage === doc.stage);
    button.setAttribute('aria-current', button.dataset.stage === doc.stage ? 'step' : 'false');
    button.disabled = button.dataset.stage === 'reveal' && doc.stage === 'coat';
  }
  for (const id of ['motif', 'spacing', 'bridge', 'coat-all', 'clear-coat']) $(id).disabled = doc.stage !== 'coat';
  $('motif').disabled ||= !allowedControls.has('motif');
  $('spacing').disabled ||= !allowedControls.has('layout');
  $('bridge').disabled ||= !allowedControls.has('bridge');
  $('dye').disabled = doc.stage !== 'coat';
  $('reveal').disabled = doc.stage !== 'dye';
  $('undo').disabled = !history.length;
  canvas.style.touchAction = doc.stage === 'coat' ? 'none' : 'pan-y';
  canvas.style.cursor = doc.stage === 'coat' ? 'crosshair' : 'default';
  canvas.setAttribute('aria-label', `蓝印花布${stepLabels[doc.stage].slice(5)}画布，施浆覆盖 ${percent}%。可使用完整刮浆按钮完成操作。`);
  refresh();
  persistDraft();
  if (message) announce(message);
  if (typeof window.CustomEvent === 'function') window.dispatchEvent(new CustomEvent('indigo:change', { detail: serializeDocument(doc) }));
}
function changeStage(stage) {
  if (stage === doc.stage) return;
  if (stage === 'reveal' && doc.stage === 'coat') { announce('先完成浸染，再揭去防染浆。'); return; }
  endPointer();
  pushHistory();
  doc.stage = stage;
  sync(stage === 'coat' ? '已返回施浆，可继续修改花版和覆盖。' : hints[stage]);
}
for (const stage of ['coat', 'dye', 'reveal']) {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = stepLabels[stage]; button.dataset.stage = stage;
  button.addEventListener('click', () => changeStage(stage));
  $('step-options').append(button);
}
const undoButton = document.createElement('button');
undoButton.id = 'undo'; undoButton.type = 'button'; undoButton.textContent = '撤销上一步';
undoButton.addEventListener('click', () => {
  const previous = history.pop();
  if (!previous) return;
  endPointer(); doc = validateDocument(previous.design); activeId = previous.activeId; mask = createMask(doc); sync('已撤销上一步操作。');
});
$('step-options').after(undoButton);

function updateDesign(recordHistory = true) {
  if (doc.stage !== 'coat') return;
  const next = { ...serializeDocument(doc), motif: $('motif').value, spacing: Number($('spacing').value), bridge: $('bridge').checked,
    rotation: Number($('rotation')?.value || 0), repeat: $('repeat')?.value || 'straight', motifScale: Number($('motif-scale')?.value || 100), frame: $('frame')?.value || 'open', coverage: Array(SIZE * SIZE).fill(0) };
  if (!permitsDesign(next)) { sync('此展项保留了当前花版设置。'); return; }
  try { validateDocument(next); } catch { sync('花版参数无法读取，当前作品已保留。'); return; }
  endPointer();
  if (recordHistory) pushHistory();
  doc.motif = $('motif').value;
  doc.spacing = Number($('spacing').value);
  doc.bridge = $('bridge').checked;
  doc.rotation = Number($('rotation')?.value || 0);
  doc.repeat = $('repeat')?.value || 'straight';
  doc.motifScale = Number($('motif-scale')?.value || 100);
  doc.frame = $('frame')?.value || 'open';
  doc.coverage.fill(0);
  mask = createMask(doc);
  sync('花版已更新，施浆已清空；重新施浆可查看新的留白。');
}
$('motif').addEventListener('change', () => updateDesign());
$('bridge').addEventListener('change', () => updateDesign());
let spacingGesture = false;
$('spacing').addEventListener('input', () => {
  updateDesign(!spacingGesture);
  spacingGesture = true;
});
for (const eventName of ['change', 'blur', 'pointercancel']) {
  $('spacing').addEventListener(eventName, () => { spacingGesture = false; });
}
if ($('repeat')) $('repeat').addEventListener('change', () => updateDesign());
if ($('frame')) $('frame').addEventListener('change', () => updateDesign());
for (const id of ['rotation', 'motif-scale']) {
  const input = $(id); if (!input) continue;
  let gesture = false;
  input.addEventListener('input', () => { updateDesign(!gesture); gesture = true; });
  for (const event of ['change', 'blur', 'pointercancel']) input.addEventListener(event, () => { gesture = false; });
}
if (typeof document.querySelectorAll === 'function') {
  for (const button of document.querySelectorAll('[data-start-motif]')) button.addEventListener('click', () => {
    const motif = button.dataset.startMotif;
    if (!Object.hasOwn(MOTIFS, motif) || !allowedControls.has('motif')) return;
    const incoming = validateDocument({ ...serializeDocument(doc), motif, stage: 'coat', name: freshCloth().name, coverage: Array(SIZE * SIZE).fill(0) });
    endPointer(); pushHistory(); doc = freshCloth(); doc.motif = motif;
    doc = incoming;
    mask = createMask(doc); activeId = null;
    sync(`已铺好「${MOTIFS[motif]}」花版。调整排布，或直接刮下第一道白浆。`);
  });
}
// Starting from the atlas creates a separate piece. Validate the incoming
// pattern through the same engine boundary used for editable design files.
window.addEventListener('indigo:new-pattern', event => {
  let incoming;
  try {
    const values = event.detail;
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('花版参数无效');
    incoming = validateDocument({ ...serializeDocument(freshCloth()),
      motif: values.motif, repeat: values.repeat, motifScale: values.motifScale,
      spacing: values.spacing, frame: values.frame, bridge: values.bridge,
      ...Object.fromEntries(['rotation', 'customPattern', 'dyePalette', 'dyeDepth', 'name'].filter(key => Object.hasOwn(values, key)).map(key => [key, values[key]])) });
  } catch {
    event.preventDefault();
    announce('这张花版的参数无法读取，当前作品已保留。');
    return;
  }
  if (!permitsDesign(incoming)) { event.preventDefault(); announce('这张花版包含本展项未开放的调整。'); return; }
  endPointer(); pushHistory();
  doc = incoming; mask = createMask(doc); activeId = null;
  sync(`已为「${MOTIFS[doc.motif]}」铺好一方新布。原作品已保留，可撤销返回。`);
});
// Editing the personal stencil is one undoable operation. Color recipes keep
// the actual paste layer and can be compared even after revealing the cloth.
window.addEventListener('indigo:creative-edit', event => {
  const values = event.detail?.patch;
  if (!values || typeof values !== 'object' || Array.isArray(values)
    || Object.keys(values).some(key => !['motif', 'customPattern', 'dyePalette', 'dyeDepth'].includes(key))) {
    event.preventDefault(); return;
  }
  const changesMask = Object.hasOwn(values, 'motif') || Object.hasOwn(values, 'customPattern');
  if ((Object.hasOwn(values, 'customPattern') || values.motif === 'custom') && !allowedControls.has('custom')) { event.preventDefault(); announce('此展项未开放自刻花版。'); return; }
  if (changesMask && doc.stage !== 'coat') { event.preventDefault(); announce('请先返回施浆，再换上自刻花版。'); return; }
  let incoming;
  try {
    incoming = validateDocument({ ...serializeDocument(doc), ...values,
      ...(changesMask ? { coverage: Array(SIZE * SIZE).fill(0) } : {}) });
  } catch { event.preventDefault(); announce('这组创作参数无法读取，当前作品已保留。'); return; }
  if (!permitsDesign(incoming)) { event.preventDefault(); announce('此展项保留了当前创作设置。'); return; }
  endPointer();
  if (event.detail?.recordHistory !== false) pushHistory();
  doc = incoming;
  if (changesMask) mask = createMask(doc);
  sync(changesMask ? '你的手刻花版已铺好。现在刮浆，让这一笔长成一方布。' : '染色配方已更新，留白和施浆保持原样。');
});
window.addEventListener('indigo:request-state', () => {
  if (typeof window.CustomEvent === 'function') window.dispatchEvent(new CustomEvent('indigo:change', { detail: serializeDocument(doc) }));
});
$('piece-name').addEventListener('input', () => {
  savedCollectionLink.hidden = true;
  doc.name = $('piece-name').value.replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, 40);
  persistDraft();
  if (typeof window.CustomEvent === 'function') window.dispatchEvent(new CustomEvent('indigo:change', { detail: serializeDocument(doc) }));
});
$('coat-all').addEventListener('click', () => {
  if (doc.stage !== 'coat') return;
  pushHistory(); coatAll(doc, mask); sync('完整刮浆完成：全部版孔已覆盖，留桥处不会过浆。');
});
$('clear-coat').addEventListener('click', () => {
  if (doc.stage !== 'coat') return;
  pushHistory(); doc.coverage.fill(0); sync('已清空施浆，可重新刮浆。');
});
$('dye').addEventListener('click', () => {
  const percent = coveragePercent(doc, mask);
  changeStage('dye');
  if (percent < 100) announce(`已浸染。版孔施浆 ${percent}%，遗漏处将染蓝；可返回施浆补涂。`);
});
$('reveal').addEventListener('click', () => changeStage('reveal'));
$('reset').addEventListener('click', () => {
  if (draftBlocked && originalDraft !== null) {
    try {
      storage.setItem(`${DRAFT_KEY}.recovery`, originalDraft);
      draftBlocked = false;
    } catch {
      announce('旧草稿仍受保护，无法写入恢复备份。请先下载原始草稿；当前作品可导出 JSON。');
      return;
    }
  }
  const clean = serializeDocument(freshCloth());
  for (const [field, group] of Object.entries(fieldGroups)) if (!allowedControls.has(group)) clean[field] = serializeDocument(doc)[field];
  endPointer(); pushHistory(); doc = validateDocument(clean); mask = createMask(doc); activeId = null;
  sync('已换上一块新布。可撤销回到刚才的作品。');
});

function point(event) {
  const box = canvas.getBoundingClientRect();
  return { x: (event.clientX - box.left) / box.width * SIZE, y: (event.clientY - box.top) / box.height * SIZE };
}
function endPointer() {
  if (!pointer) return;
  const id = pointer.id;
  pointer = null;
  try { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch { /* 指针可能已取消。 */ }
  sync();
}
canvas.addEventListener('pointerdown', event => {
  if (doc.stage !== 'coat' || pointer || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault();
  pushHistory();
  pointer = { id: event.pointerId, last: point(event) };
  try { canvas.setPointerCapture(event.pointerId); } catch { /* window pointerup 仍可结束操作。 */ }
  coatStroke(doc, mask, pointer.last, pointer.last);
  sync();
});
canvas.addEventListener('pointermove', event => {
  if (!pointer || event.pointerId !== pointer.id) return;
  event.preventDefault();
  const next = point(event);
  coatStroke(doc, mask, pointer.last, next);
  pointer.last = next;
  sync();
});
window.addEventListener('pointerup', event => { if (pointer?.id === event.pointerId) endPointer(); });
window.addEventListener('pointercancel', endPointer);
window.addEventListener('blur', endPointer);
canvas.addEventListener('lostpointercapture', endPointer);

function readCollection() {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const records = JSON.parse(raw);
  if (!Array.isArray(records) || records.length > LIMIT) throw new Error('作品集格式损坏');
  const ids = new Set();
  return records.map(record => {
    if (!record || typeof record.id !== 'string' || !/^[a-z0-9-]{1,70}$/u.test(record.id) || ids.has(record.id)
      || typeof record.updatedAt !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error('作品记录损坏');
    ids.add(record.id);
    return { id: record.id, updatedAt: record.updatedAt, design: serializeDocument(validateDocument(record.design)) };
  });
}
function showCollection() {
  const gallery = $('gallery');
  gallery.replaceChildren();
  let records;
  try { records = readCollection(); }
  catch { gallery.textContent = '暂时无法读取本地作品。现有数据已保留；可先导出当前设计 JSON。'; return; }
  if (!records.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state';
    empty.textContent = '这里还没有收藏。做一方自己的蓝，把第一块布留在这里。'; gallery.append(empty); return;
  }
  for (const record of records) {
    const piece = validateDocument(record.design);
    const card = document.createElement('article'); card.className = 'piece-card';
    const thumbnail = document.createElement('canvas'); thumbnail.width = thumbnail.height = 240;
    thumbnail.setAttribute('role', 'img'); thumbnail.setAttribute('aria-label', `${piece.name || '未命名作品'}花布预览`);
    // 缩略图保持保存时工序，重开时恢复同一份设计。
    draw(thumbnail, piece);
    const title = document.createElement('h3'); title.textContent = piece.name || '未命名作品';
    const meta = document.createElement('p');
    meta.textContent = `${MOTIFS[piece.motif]} · ${new Date(record.updatedAt).toLocaleDateString('zh-CN')}`;
    const actions = document.createElement('div'); actions.className = 'piece-actions';
    const reopen = document.createElement('button'); reopen.type = 'button'; reopen.textContent = '继续制作';
    reopen.addEventListener('click', () => {
      if (!permitsDesign(record.design)) { announce('这件收藏使用了本展项未开放的设置。'); return; }
      endPointer(); pushHistory(); doc = validateDocument(record.design); mask = createMask(doc); activeId = record.id;
      sync(`已打开「${piece.name || '未命名作品'}」。返回施浆即可修改。`);
      if (document.documentElement?.dataset?.sceneRouter === 'ready') {
        window.dispatchEvent(new CustomEvent('indigo:navigate', { detail: { id: 'studio', anchor: 'studio', focus: 'studio-canvas' } }));
      } else { location.hash = '#studio'; canvas.focus({ preventScroll: true }); }
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删除';
    remove.setAttribute('aria-label', `删除作品 ${piece.name || '未命名作品'}`);
    remove.addEventListener('click', () => {
      if (!window.confirm(`删除「${piece.name || '未命名作品'}」？建议先导出 JSON 留存。`)) return;
      try {
        const remaining = readCollection().filter(item => item.id !== record.id);
        storage.setItem(STORAGE_KEY, JSON.stringify(remaining));
        if (activeId === record.id) { activeId = null; persistDraft(); }
        showCollection(); announce('已从本地作品集删除。');
      } catch { announce('删除失败，本地作品尚未变更。请检查浏览器存储权限。'); }
    });
    actions.append(reopen, remove); card.append(thumbnail, title, meta, actions); gallery.append(card);
  }
}
$('save').addEventListener('click', () => {
  savedCollectionLink.hidden = true;
  try {
    const records = readCollection();
    let index = records.findIndex(record => record.id === activeId);
    if (index < 0 && records.length >= LIMIT) { announce(`作品集已满 ${LIMIT} 件。请先导出并删除旧作品，或直接导出当前 JSON。`); return; }
    const id = index >= 0 ? activeId : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const record = { id, updatedAt: new Date().toISOString(), design: serializeDocument(doc) };
    if (index >= 0) records[index] = record; else records.unshift(record);
    storage.setItem(STORAGE_KEY, JSON.stringify(records));
    activeId = id; persistDraft(); showCollection(); announce(`「${doc.name || '未命名作品'}」已保存到当前浏览器。可前往“我的布册”查看，或继续制作。`);
    savedCollectionLink.hidden = false;
  } catch { announce('保存失败：浏览器存储不可用、空间不足或作品集损坏。请导出 JSON 留存当前设计。'); }
});

function filename(extension) {
  return `${(doc.name.trim() || '一方蓝').replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_')}.${extension}`;
}
function download(blob, name, message) {
  let url;
  try {
    url = URL.createObjectURL(blob);
    downloadUrls.add(url);
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => { URL.revokeObjectURL(url); downloadUrls.delete(url); }, 30000);
    announce(message);
  } catch {
    if (url) URL.revokeObjectURL(url);
    announce('无法发起下载，请检查浏览器下载设置后重试。');
  }
}
$('export-json').addEventListener('click', () => {
  download(new Blob([JSON.stringify(serializeDocument(doc))], { type: 'application/json;charset=utf-8' }), filename('json'), '已发起设计 JSON 下载，请在浏览器下载记录中确认。');
});
$('export-png').addEventListener('click', () => {
  const ticket = visitor.generation, exportName = filename('png');
  try {
    // 同步重绘，避免上一帧尚未显示时导出旧状态。
    draw();
    canvas.toBlob(blob => {
      if (!visitor.isCurrent(ticket)) return;
      if (!blob) { announce('图片生成失败，请重试或先导出设计 JSON。'); return; }
      download(blob, exportName, '已发起当前布面 PNG 下载，请在浏览器下载记录中确认。');
    }, 'image/png');
  } catch { announce('无法导出图片，请先导出设计 JSON 留存。'); }
});
$('import-json').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const ticket = visitor.generation;
  try {
    if (file.size > MAX_JSON_BYTES) throw new Error('文件过大，请选择本工具导出的设计 JSON（不超过 180 KB）。');
    const incoming = parseDocument(await file.text());
    if (!visitor.isCurrent(ticket)) return;
    if (!permitsDesign(incoming)) throw new Error('设计包含本展项未开放的调整。');
    endPointer(); pushHistory(); doc = incoming; mask = createMask(doc); activeId = null;
    sync(`已导入「${doc.name || '未命名作品'}」，可继续制作或保存为新作品。`);
  } catch (error) { if (visitor.isCurrent(ticket)) announce(`导入失败：${error.message} 当前设计已保留。`); }
  finally { if (visitor.isCurrent(ticket)) event.target.value = ''; }
});

function replaceWork(incoming, { resetSession = false, sessionId } = {}) {
  // Validate before cancelling the current visitor: malformed handoff never destroys a work.
  const next = validateDocument(incoming);
  if (resetSession && (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(sessionId))) throw new Error('游客会话编号无效');
  endPointer(); clearTimeout(draftTimer);
  if (resetSession) visitor.reset(sessionId); else visitor.invalidate();
  for (const url of downloadUrls) URL.revokeObjectURL(url);
  downloadUrls.clear();
  doc = next; mask = createMask(doc); activeId = null; history = [];
  draftBlocked = false; originalDraft = null; recoveryButton?.remove(); recoveryButton = null;
  spacingGesture = false; $('import-json').value = '';
  if ($('finish-panel')) $('finish-panel').open = doc.stage === 'reveal';
  if (typeof window.CustomEvent === 'function') window.dispatchEvent(new CustomEvent('indigo:session-reset', { detail: { sessionId: visitor.sessionId } }));
  showCollection(); sync(resetSession ? '新的旅程开始了。请为这一方蓝留下自己的故事。' : '作品已接续，可以继续创作。');
}
window.indigoWorkbench = Object.freeze({
  snapshot: () => serializeDocument(doc),
  get mode() { return visitor.mode; },
  get sessionId() { return visitor.sessionId; },
  get allowedControls() { return [...allowedControls]; },
  applyPreset(partial = {}) {
    if (!partial || typeof partial !== 'object' || Array.isArray(partial) || Object.keys(partial).some(key => !Object.hasOwn(fieldGroups, key) && key !== 'name')) throw new Error('展项花版参数无效');
    const next = validateDocument({ ...serializeDocument(freshCloth()), ...partial });
    endPointer(); history = []; activeId = null; doc = next; mask = createMask(doc); sync('展项花版已准备好。');
  },
  beginVisitor({ sessionId, design } = {}) { replaceWork(design || serializeDocument(freshCloth()), { resetSession: true, sessionId }); },
  loadDesign(design) { replaceWork(design); },
  setAllowedControls(values) {
    if (!Array.isArray(values) || values.some(value => !CONTROL_GROUPS.includes(value))) throw new Error('展项控制项无效');
    allowedControls = new Set(values); history = []; sync();
    if (typeof window.CustomEvent === 'function') window.dispatchEvent(new CustomEvent('indigo:controls', { detail: { allowedControls: [...allowedControls] } }));
  }
});
try {
  const draft = storage.getItem(DRAFT_KEY);
  originalDraft = draft;
  if (draft) {
    const value = JSON.parse(draft);
    if (value?.draftVersion === 1) {
      doc = validateDocument(value.design);
      activeId = typeof value.activeId === 'string' && readCollection().some(record => record.id === value.activeId) ? value.activeId : null;
    } else doc = parseDocument(draft);
    mask = createMask(doc); announce('已恢复上次未收起的布面。');
  }
} catch {
  draftBlocked = true;
  announce('旧草稿无法读取，原数据已保留且暂停覆盖。可下载原始草稿，或重新制作以另存恢复备份。');
  if (originalDraft !== null) {
    const recover = document.createElement('button'); recover.type = 'button'; recover.textContent = '下载原始草稿备份';
    recoveryButton = recover;
    recover.addEventListener('click', () => download(new Blob([originalDraft], { type: 'text/plain;charset=utf-8' }), '草稿恢复备份.txt', '已发起原始草稿下载；原数据仍受保护。'));
    $('status').after(recover);
  }
}
showCollection();
sync();



