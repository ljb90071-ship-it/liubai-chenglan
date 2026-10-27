import { createDocument, createCustomPattern, createMask, coatAll, renderPixels, MOTIFS, DYE_PALETTES } from './engine.js';

export const PREVIEW_STORAGE_KEY = 'liubai.preview.pack';
export const STEP_NAMES = Object.freeze({ choose: '选择入场花版', explore: '观花探索', create: '亲手创作', reveal: '揭纹看蓝', takeaway: '带走作品卡' });
const STEP_NOTES = { choose: '体验的起点', explore: '走近纹样与手艺', create: '刮浆、染色与调整', reveal: '看见亲手留下的白', takeaway: '体验的终点' };
const CONTROL_NAMES = { motif: '更换纹样', layout: '排布、疏密与布边', custom: '手刻自定义花版', palette: '蓝色与染色深浅', bridge: '花版留桥' };
const REPEAT_NAMES = { straight: '齐整 · 四方连续', staggered: '错列 · 半格相接', mirror: '镜像 · 相向而生' };
const FIELD_NAMES = { stage: '制作阶段', coverage: '刮浆完成度（%）', motif: '使用纹样', repeat: '纹样排布', dyePalette: '染色色系', dyeDepth: '染色深度', customCells: '手刻孔洞格数' };
const STAGE_NAMES = { coat: '刮浆', dye: '染色', reveal: '揭纹完成' };
const ENUMS = { stage: STAGE_NAMES, motif: MOTIFS, repeat: REPEAT_NAMES, dyePalette: DYE_PALETTES };
const OP_NAMES = { eq: '等于', gte: '至少', lte: '至多' };
export const clonePack = pack => JSON.parse(JSON.stringify(pack));
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function bumpVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : `${version}-next`;
}

export function moveStep(steps, index, offset) {
  const target = index + offset;
  if (index <= 0 || index >= steps.length - 1 || target <= 0 || target >= steps.length - 1) return [...steps];
  const moved = [...steps]; [moved[index], moved[target]] = [moved[target], moved[index]];
  if (moved.indexOf('create') > moved.indexOf('reveal')) return [...steps];
  return moved;
}

export function defaultCondition(field = 'coverage') {
  return { field, operator: ENUMS[field] ? 'eq' : 'gte', value: ENUMS[field] ? Object.keys(ENUMS[field])[field === 'stage' ? 2 : 0] : field === 'coverage' ? 70 : field === 'dyeDepth' ? 3 : 1 };
}

export function presetDocument(preset) {
  const doc = Object.assign(createDocument(), clonePack(preset));
  doc.coverage = new Uint8Array(createDocument().coverage.length);
  coatAll(doc, createMask(doc)); doc.stage = 'reveal';
  return doc;
}

export async function requestJSON(url, { method = 'GET', body, token, fetcher = globalThis.fetch } = {}) {
  const response = await fetcher(url, { method, credentials: 'same-origin', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Liubai-Token': token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  let data;
  try { data = await response.json(); } catch { throw new Error('服务返回了无法读取的内容，请检查本机服务。'); }
  if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : typeof data.error === 'string' ? data.error : '操作未完成，请重试。');
  return data;
}

export function createDraftStore(initialPack) {
  let pack = clonePack(initialPack), saved = clonePack(initialPack), dirty = false;
  return {
    get pack() { return pack; }, get saved() { return saved; }, get dirty() { return dirty; },
    edit(change, { bump = true } = {}) {
      if (!dirty && bump) pack.version = bumpVersion(saved.version);
      change(pack); dirty = true; return pack;
    },
    replace(next, { unsaved = false } = {}) { pack = clonePack(next); saved = unsaved ? null : clonePack(next); dirty = unsaved; return pack; },
    markSaved(next) { pack = clonePack(next); saved = clonePack(next); dirty = false; return pack; }
  };
}

const options = (labels, selected) => Object.entries(labels).map(([value, label]) => `<option value="${escapeHTML(value)}"${value === selected ? ' selected' : ''}>${escapeHTML(label)}</option>`).join('');
const input = (label, key, value, extras = '') => `<label>${label}<input data-preset="${key}" value="${escapeHTML(value)}" ${extras}></label>`;

export async function initCurator() {
  const $ = selector => document.querySelector(selector);
  let validateExhibitPack, bootstrap, packs = [], store = null, activeId = '', activeVersion = '', pendingSwitch = '', busy = false;
  let currentPackKey = '', importBusy = false, lockedControls = [];
  const field = name => document.querySelector(`[name="${name}"]`);
  const status = (message, error = false) => { $('#work-status').textContent = message; $('#work-status').style.color = error ? 'var(--danger)' : ''; };
  const showError = message => { $('#validation-errors').textContent = message; $('#validation-errors').hidden = !message; };
  function setBusy(value) {
    busy = value; $('#workspace').setAttribute('aria-busy', String(value));
    if (value) {
      lockedControls = [...document.querySelectorAll('#workspace button,#workspace input,#workspace select,#workspace textarea')].map(control => [control, control.disabled]);
      lockedControls.forEach(([control]) => { control.disabled = true; });
    } else {
      lockedControls.forEach(([control, disabled]) => { if (control.isConnected) control.disabled = disabled; });
      lockedControls = [];
    }
  }
  function syncState(message) {
    if (!store) return;
    $('#draft-badge').textContent = store.dirty ? '未保存草稿' : '已保存版本';
    $('#save-pack').disabled = busy || !store.dirty;
    const isActive = !store.dirty && store.pack.id === activeId && (!activeVersion || store.pack.version === activeVersion);
    $('#activate-pack').disabled = busy || store.dirty || isActive;
    $('#activate-pack').textContent = isActive ? '正在展出' : '启用展陈';
    $('#preview-pack').disabled = busy;
    $('#add-choice').disabled = busy || store.pack.choices.length >= 8;
    $('#add-condition').disabled = busy || store.pack.conditions.length >= 12;
    $('#add-source').disabled = busy || store.pack.sources.length >= 12;
    const active = packs.find(pack => pack.id === activeId && (!activeVersion || pack.version === activeVersion)) || (bootstrap.activePack?.id === activeId && bootstrap.activePack?.version === activeVersion ? bootstrap.activePack : null);
    $('#active-pack').textContent = activeId ? `正在展出：${active?.title || activeId}${activeVersion ? ` · ${activeVersion}` : ''}` : '尚未启用展陈';
    if (message) status(message);
  }
  function edit(change, settings) {
    store.edit(change, settings); showError('');
    field('version').value = store.pack.version;
    syncState('修改已留在当前草稿。预览确认后保存版本。');
  }
  function populateShelf() {
    const select = $('#pack-select'), selected = currentPackKey || store?.pack.id;
    select.innerHTML = packs.map(pack => `<option value="${escapeHTML(pack.id)}">${escapeHTML(pack.title)} · ${escapeHTML(pack.version)}${pack.id === activeId && (!activeVersion || pack.version === activeVersion) ? ' · 展出中' : ''}</option>`).join('');
    if (selected && packs.some(pack => pack.id === selected)) select.value = selected;
    else if (packs.length) select.value = packs[0].id;
  }
  function renderChoices() {
    $('#choice-list').innerHTML = store.pack.choices.map((choice, index) => {
      const preset = choice.preset;
      return `<article class="choice-editor" data-choice="${index}"><div class="choice-head"><h3>花版 ${String(index + 1).padStart(2, '0')}</h3><button class="remove-button" data-action="remove-choice" type="button"${store.pack.choices.length <= 1 ? ' disabled' : ''} aria-label="移除第${index + 1}张花版">移除 ×</button></div><div class="choice-body"><div class="choice-fields"><label>花版名称<input data-choice-field="title" maxlength="48" value="${escapeHTML(choice.title)}"></label><label>选择提示<textarea data-choice-field="description" rows="2" maxlength="300">${escapeHTML(choice.description)}</textarea></label><div class="field-grid"><label>纹样<select data-preset="motif">${options(MOTIFS, preset.motif)}</select></label><label>色系<select data-preset="dyePalette">${options(DYE_PALETTES, preset.dyePalette)}</select></label></div></div><figure class="choice-preview"><canvas width="240" height="240" aria-label="${escapeHTML(choice.title)}的实际花版成布预览"></canvas><figcaption><div class="preview-swatches" aria-hidden="true"><i></i><i></i></div>花版成布预览<br>使用同一创作引擎<br>按完整刮浆呈现</figcaption></figure></div><details class="preset-details"><summary>调整花版预设</summary><div class="preset-controls"><label>排布<select data-preset="repeat">${options(REPEAT_NAMES, preset.repeat)}</select></label><label>布边<select data-preset="frame">${options({ open: '满幅 · 连续延展', bordered: '围合 · 珠点花边' }, preset.frame)}</select></label>${input('疏密（60–150）', 'spacing', preset.spacing, 'type="number" min="60" max="150" step="1"')}${input('转向（0–180°）', 'rotation', preset.rotation, 'type="number" min="0" max="180" step="5"')}${input('花幅（70–125）', 'motifScale', preset.motifScale, 'type="number" min="70" max="125" step="1"')}${input('染色深度（1–5）', 'dyeDepth', preset.dyeDepth, 'type="number" min="1" max="5" step="1"')}<label class="check-row"><input type="checkbox" data-preset="bridge"${preset.bridge ? ' checked' : ''}>花版保留连接桥</label></div><div class="grid-editor"${preset.motif === 'custom' ? '' : ' hidden'}><p class="helper">点选孔洞，编辑这张手刻花版。</p><div class="custom-cells" role="group" aria-label="十六行十六列的手刻花版">${(preset.customPattern || createCustomPattern()).map((value, cell) => `<button type="button" data-cell="${cell}" aria-label="第${Math.floor(cell / 16) + 1}行第${cell % 16 + 1}格" aria-pressed="${Boolean(value)}"></button>`).join('')}</div><small>浅色是孔洞；蓝色是保留的版材。方向键移动，空格切换。</small></div></details></article>`;
    }).join('');
    store.pack.choices.forEach((_, index) => drawChoice(index));
  }
  function drawChoice(index) {
    const canvas = document.querySelector(`[data-choice="${index}"] canvas`);
    if (!canvas) return;
    try {
      const doc = presetDocument(store.pack.choices[index].preset);
      canvas.getContext('2d').putImageData(new ImageData(renderPixels(doc), 240, 240), 0, 0);
    } catch { /* Keep the last valid preview while a numeric field is incomplete. */ }
  }
  function renderSteps() {
    $('#step-list').innerHTML = store.pack.steps.map((step, index) => `<li><span class="step-number">${index + 1}</span><span class="step-name">${STEP_NAMES[step]}<small>${STEP_NOTES[step]}</small></span><span class="step-moves"><button type="button" data-step="${index}" data-offset="-1" aria-label="向前移动${STEP_NAMES[step]}"${JSON.stringify(moveStep(store.pack.steps, index, -1)) === JSON.stringify(store.pack.steps) ? ' disabled' : ''}>↑</button><button type="button" data-step="${index}" data-offset="1" aria-label="向后移动${STEP_NAMES[step]}"${JSON.stringify(moveStep(store.pack.steps, index, 1)) === JSON.stringify(store.pack.steps) ? ' disabled' : ''}>↓</button></span></li>`).join('');
    $('#include-explore').checked = store.pack.steps.includes('explore');
  }
  function renderConditions() {
    $('#condition-list').innerHTML = store.pack.conditions.map((condition, index) => `<div class="condition-row" data-condition="${index}"><label>观察什么<select data-condition-field="field">${options(FIELD_NAMES, condition.field)}</select></label><label>满足关系<select data-condition-field="operator">${options(ENUMS[condition.field] ? { eq: '等于' } : OP_NAMES, condition.operator)}</select></label><label>目标${ENUMS[condition.field] ? `<select data-condition-field="value">${options(ENUMS[condition.field], condition.value)}</select>` : `<input data-condition-field="value" type="number" min="${condition.field === 'dyeDepth' ? 1 : 0}" max="${condition.field === 'coverage' ? 100 : condition.field === 'customCells' ? 256 : 5}" step="${condition.field === 'coverage' ? 'any' : '1'}" value="${escapeHTML(condition.value)}">`}</label><button class="remove-button" type="button" data-action="remove-condition" aria-label="移除第${index + 1}条完成条件">移除 ×</button></div>`).join('') || '<p class="draft-empty">没有额外条件。游客完成揭纹后即可继续带走作品。</p>';
  }
  function renderSources() {
    $('#source-list').innerHTML = store.pack.sources.map((source, index) => `<div class="source-row" data-source="${index}"><label>来源名称<input data-source-field="title" maxlength="160" value="${escapeHTML(source.title)}"></label><label>网页地址<input data-source-field="url" type="url" placeholder="https://" value="${escapeHTML(source.url)}"></label><button class="remove-button" type="button" data-action="remove-source" aria-label="移除第${index + 1}条来源">移除 ×</button></div>`).join('');
  }
  function renderPack() {
    for (const name of ['id', 'version', 'title', 'venue', 'intro', 'ending', 'idleSeconds', 'countdownSeconds']) field(name).value = store.pack[name];
    field('card.headline').value = store.pack.card.headline; field('card.caption').value = store.pack.card.caption;
    $('#allowed-controls').innerHTML = Object.entries(CONTROL_NAMES).map(([value, name]) => `<label class="check-row"><input type="checkbox" data-control="${value}"${store.pack.allowedControls.includes(value) ? ' checked' : ''}>${name}</label>`).join('');
    renderChoices(); renderSteps(); renderConditions(); renderSources(); showError(''); syncState();
  }
  function openPack(pack, unsaved = false) {
    if (store) store.replace(pack, { unsaved }); else store = createDraftStore(pack);
    if (unsaved && !store.dirty) store.replace(pack, { unsaved: true });
    currentPackKey = packs.some(item => item.id === pack.id) ? pack.id : '';
    populateShelf(); renderPack();
    syncState(unsaved ? '导入内容已作为未保存草稿打开。请预览后保存。' : `已打开「${pack.title}」${pack.version}。`);
  }
  async function refreshPacks({ initial = false } = {}) {
    try {
      const data = await requestJSON('/api/packs');
      packs = data.packs; activeId = data.activeId || ''; activeVersion = data.activeVersion || '';
      if (!store) {
        const selected = packs.find(pack => pack.id === activeId) || packs[0] || bootstrap.activePack;
        if (!selected) throw new Error('没有可编辑的展陈包。请先导入一份展陈包。');
        openPack(selected);
      } else { populateShelf(); syncState('展陈列表已刷新，当前草稿继续保留。'); }
      return true;
    } catch (error) {
      if (store) status(`读取列表失败，当前草稿仍在：${error.message}`, true);
      else if (initial && bootstrap.activePack) { packs = [bootstrap.activePack]; activeId = bootstrap.activePack.id; activeVersion = bootstrap.activePack.version; openPack(bootstrap.activePack); status(`已打开当前展陈；列表读取失败：${error.message}`, true); return true; }
      else throw error;
      return false;
    }
  }
  function checkedPack() {
    try { const pack = validateExhibitPack(clonePack(store.pack)); showError(''); return pack; }
    catch (error) { showError(`请先完成这些修改：${error.message}`); status('草稿尚未通过检查，请查看提示并继续编辑。', true); return null; }
  }
  function downloadDraft() {
    const blob = new Blob([JSON.stringify(store.pack, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${store.pack.id || 'liubai-exhibit'}-${store.pack.version || 'draft'}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('当前草稿已导出为展陈包。');
  }
  $('#editor').addEventListener('submit', event => event.preventDefault());
  $('#editor').addEventListener('input', event => {
    const target = event.target;
    if (target.name) {
      edit(pack => {
        const value = target.type === 'number' ? target.value === '' ? null : Number(target.value) : target.value;
        if (target.name.startsWith('card.')) pack.card[target.name.split('.')[1]] = value; else pack[target.name] = value;
      }, { bump: target.name !== 'version' }); return;
    }
    const choiceElement = target.closest('[data-choice]');
    if (choiceElement && (target.dataset.choiceField || target.dataset.preset)) {
      const index = Number(choiceElement.dataset.choice);
      edit(pack => {
        if (target.dataset.choiceField) pack.choices[index][target.dataset.choiceField] = target.value;
        else {
          const key = target.dataset.preset;
          pack.choices[index].preset[key] = target.type === 'checkbox' ? target.checked : target.type === 'number' ? target.value === '' ? null : Number(target.value) : target.value;
          if (key === 'motif' && target.value === 'custom' && !pack.choices[index].preset.customPattern) pack.choices[index].preset.customPattern = createCustomPattern();
        }
      });
      choiceElement.querySelector('.grid-editor').hidden = store.pack.choices[index].preset.motif !== 'custom'; drawChoice(index); return;
    }
    const conditionElement = target.closest('[data-condition]');
    if (conditionElement && target.dataset.conditionField) {
      const index = Number(conditionElement.dataset.condition), key = target.dataset.conditionField;
      edit(pack => {
        if (key === 'field') pack.conditions[index] = defaultCondition(target.value);
        else pack.conditions[index][key] = key === 'value' && !ENUMS[pack.conditions[index].field] ? target.value === '' ? null : Number(target.value) : target.value;
      });
      if (key === 'field') renderConditions(); return;
    }
    const sourceElement = target.closest('[data-source]');
    if (sourceElement && target.dataset.sourceField) edit(pack => { pack.sources[Number(sourceElement.dataset.source)][target.dataset.sourceField] = target.value; });
    if (target.dataset.control) edit(pack => { pack.allowedControls = [...document.querySelectorAll('[data-control]:checked')].map(item => item.dataset.control); });
  });
  $('#editor').addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    const action = button.dataset.action;
    if (action === 'remove-choice') { edit(pack => pack.choices.splice(Number(button.closest('[data-choice]').dataset.choice), 1)); renderChoices(); }
    if (action === 'remove-condition') { edit(pack => pack.conditions.splice(Number(button.closest('[data-condition]').dataset.condition), 1)); renderConditions(); }
    if (action === 'remove-source') { edit(pack => pack.sources.splice(Number(button.closest('[data-source]').dataset.source), 1)); renderSources(); }
    if (button.dataset.step !== undefined) { edit(pack => { pack.steps = moveStep(pack.steps, Number(button.dataset.step), Number(button.dataset.offset)); }); renderSteps(); }
    if (button.dataset.cell !== undefined) {
      const index = Number(button.closest('[data-choice]').dataset.choice), cell = Number(button.dataset.cell);
      edit(pack => { const preset = pack.choices[index].preset; if (!preset.customPattern) preset.customPattern = createCustomPattern(); preset.customPattern[cell] = Number(!preset.customPattern[cell]); });
      button.setAttribute('aria-pressed', String(Boolean(store.pack.choices[index].preset.customPattern[cell]))); drawChoice(index);
    }
  });
  $('#choice-list').addEventListener('keydown', event => {
    if (event.target.dataset.cell === undefined || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -16, ArrowDown: 16 }[event.key];
    event.target.closest('.custom-cells').querySelector(`[data-cell="${Math.max(0, Math.min(255, Number(event.target.dataset.cell) + offset))}"]`).focus();
  });
  $('#include-explore').addEventListener('change', event => { edit(pack => { pack.steps = pack.steps.filter(step => step !== 'explore'); if (event.target.checked) pack.steps.splice(1, 0, 'explore'); }); renderSteps(); });
  $('#add-choice').addEventListener('click', () => {
    const next = clonePack(store.pack.choices[0]); next.id = `choice-${Date.now().toString(36)}`; next.title = '新的一张花版'; next.description = '选择这一张，开始你的蓝白故事。';
    edit(pack => pack.choices.push(next)); renderChoices(); document.querySelector('.choice-editor:last-child input').focus();
  });
  $('#add-condition').addEventListener('click', () => { edit(pack => pack.conditions.push(defaultCondition())); renderConditions(); });
  $('#add-source').addEventListener('click', () => { edit(pack => pack.sources.push({ title: '', url: '' })); renderSources(); document.querySelector('.source-row:last-child input').focus(); });
  $('#copy-pack').addEventListener('click', () => {
    const next = clonePack(store.pack); next.version = bumpVersion(next.version);
    store.replace(next, { unsaved: true }); renderPack(); syncState(`已建立 ${next.version} 草稿，保存后保留此前版本。`); field('version').focus();
  });
  $('#pack-select').addEventListener('change', event => {
    const id = event.target.value;
    if (store.dirty) { pendingSwitch = id; $('#switch-dialog').showModal(); }
    else openPack(packs.find(pack => pack.id === id));
  });
  const cancelSwitch = () => { $('#switch-dialog').close(); populateShelf(); pendingSwitch = ''; };
  $('#cancel-switch').addEventListener('click', cancelSwitch);
  $('#switch-dialog').addEventListener('cancel', event => { event.preventDefault(); cancelSwitch(); });
  $('#confirm-switch').addEventListener('click', () => { const selected = packs.find(pack => pack.id === pendingSwitch); $('#switch-dialog').close(); if (selected) openPack(selected); pendingSwitch = ''; });
  $('#export-before-switch').addEventListener('click', downloadDraft);
  $('#refresh-packs').addEventListener('click', () => refreshPacks().catch(error => status(error.message, true)));
  $('#export-pack').addEventListener('click', downloadDraft);
  $('#import-pack').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file || importBusy) return; importBusy = true;
    try {
      if (file.size > 200000) throw new Error('文件过大，请选择 200 KB 以内的展陈包。');
      const parsed = validateExhibitPack(JSON.parse(await file.text()));
      openPack(parsed, true);
    } catch (error) { status(`导入失败，当前草稿继续保留：${error.message}`, true); }
    finally { importBusy = false; event.target.value = ''; }
  });
  $('#preview-pack').addEventListener('click', () => {
    const pack = checkedPack(); if (!pack) return;
    try {
      sessionStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(pack));
      const popup = window.open('/?preview=1', 'liubai-preview');
      if (!popup) throw new Error('浏览器拦截了预览窗口，请允许本站弹出窗口后重试。');
      popup.focus();
      // Reusing a named window does not copy sessionStorage again. The visitor accepts this update.
      popup.postMessage({ type: 'liubai:preview-pack', pack }, location.origin);
      status('已打开游客体验预览。此预览使用当前草稿，不会保存或启用展陈。');
    } catch (error) { status(`无法打开预览：${error.message}`, true); }
  });
  $('#save-pack').addEventListener('click', async () => {
    const pack = checkedPack(); if (!pack || busy) return; setBusy(true); syncState('正在保存展陈版本…');
    try {
      const response = await requestJSON('/api/packs', { method: 'POST', body: { pack }, token: bootstrap.csrfToken });
      store.markSaved(response.pack || pack); currentPackKey = store.pack.id;
      packs = [store.pack, ...packs.filter(item => item.id !== store.pack.id)]; populateShelf();
      status(`「${store.pack.title}」${store.pack.version} 已保存。启用后，下一位入场游客将使用这一版。`);
    } catch (error) { status(`保存未完成，草稿继续保留：${error.message}`, true); }
    finally { setBusy(false); renderPack(); syncState(); }
  });
  $('#activate-pack').addEventListener('click', async () => {
    if (busy || store.dirty) return; setBusy(true); syncState('正在启用展陈…');
    try {
      const result = await requestJSON('/api/activate', { method: 'POST', body: { id: store.pack.id }, token: bootstrap.csrfToken });
      activeId = result.activeId || result.activePack?.id || store.pack.id; activeVersion = result.activeVersion || result.activePack?.version || store.pack.version;
      populateShelf(); status(`已启用「${store.pack.title}」${store.pack.version}。下一位入场游客将看到新展陈。`);
    } catch (error) { status(`启用未完成：${error.message}`, true); }
    finally { setBusy(false); syncState(); }
  });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.data?.type !== 'liubai:preview-ready' || !store) return;
    const pack = checkedPack();
    if (pack) event.source?.postMessage({ type: 'liubai:preview-pack', pack }, location.origin);
  });
  window.addEventListener('beforeunload', event => { if (store?.dirty) { event.preventDefault(); event.returnValue = ''; } });
  async function boot() {
    $('#retry-bootstrap').hidden = true;
    try {
      bootstrap = await requestJSON('/api/bootstrap');
      if (!bootstrap.operator || !bootstrap.csrfToken) { $('#loading').hidden = true; $('#local-required').hidden = false; return; }
      ({ validateExhibitPack } = await import('/lib/exhibit-pack.js'));
      await refreshPacks({ initial: true });
      $('#loading').hidden = true; $('#workspace').hidden = false;
    } catch (error) { $('#loading-message').textContent = `连接未完成：${error.message}`; $('#retry-bootstrap').hidden = false; }
  }
  $('#retry-bootstrap').addEventListener('click', boot);
  await boot();
}

if (typeof document !== 'undefined') initCurator();
