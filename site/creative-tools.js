import { CUSTOM_GRID, DYE_PALETTES, MOTIFS, coveragePercent, createCustomPattern, createDocument, createMask, coatAll, renderPixels } from './engine.js?v=61';

export function symmetricCells(x, y, symmetry = 'four') {
  const cells = [[x, y]];
  if (symmetry !== 'none') cells.push([15 - x, y]);
  if (symmetry === 'four') cells.push([x, 15 - y], [15 - x, 15 - y]);
  return [...new Set(cells.map(([cx, cy]) => cy * CUSTOM_GRID + cx))];
}

export function stencilPreset(name) {
  if (name === 'pearl') return createCustomPattern();
  return Array.from({ length: 256 }, (_, i) => {
    const x = i % 16 - 7.5, y = Math.floor(i / 16) - 7.5;
    if (name === 'star') return Number(Math.abs(x) + Math.abs(y) < 7 && Math.abs(x) > 1 && Math.abs(y) > 1);
    if (name === 'leaf') return Number(((x + y * .35) / 4) ** 2 + (y / 6) ** 2 < 1 && Math.abs(x + y * .35) > 1);
    if (name === 'rain') return Number((Math.abs(x) < 1.6 && y < 5 && y > -6) || (Math.abs(x) > 3 && Math.abs(x) < 5.5 && y < 2 && y > -3));
    return 0;
  });
}

export function initCreativeTools() {
  const studio = document.getElementById('studio');
  if (!studio || document.getElementById('creative-lab')) return;
  const root = document.createElement('details');
  root.id = 'creative-lab'; root.className = 'creative-lab';
  root.innerHTML = `<summary><span class="creative-kicker">DESIGN YOUR OWN / 自由造花</span><span class="creative-summary-title">从一笔，生万象。</span><span class="creative-summary-note">刻自己的花版 · 调一缸自己的蓝 <b aria-hidden="true">＋</b></span></summary>
    <div class="creative-body"><div class="stencil-desk">
      <div class="creative-panel-head"><h3>我的手刻花版</h3><span>16 × 16 / 一格一刀</span></div>
      <p class="creative-copy">刻开纸上的一格，白浆便从这里经过。试着画半朵花，让镜像替你完成另一半。</p>
      <div class="stencil-board"><canvas id="custom-editor" width="480" height="480" tabindex="0" role="img" aria-label="可编辑手刻花版，方向键移动，空格刻开或填回" aria-describedby="custom-help"></canvas></div>
      <p id="custom-help" class="creative-help">拖动刻孔；方向键移动，空格切换。浅色是孔，蓝色是保留的版材。</p>
      <div class="creative-row"><label>刀法<select id="custom-tool"><option value="cut">刻开</option><option value="fill">填回</option></select></label><label>对称<select id="custom-symmetry"><option value="four">四向对称</option><option value="mirror">左右镜像</option><option value="none">自由落刀</option></select></label><button type="button" id="custom-undo">撤销一刀</button></div>
      <div class="creative-presets" role="group" aria-label="花版起稿"><span>从这里起稿</span><button type="button" data-stencil-preset="star">四瓣星</button><button type="button" data-stencil-preset="leaf">叶脉</button><button type="button" data-stencil-preset="rain">疏雨</button><button type="button" data-stencil-preset="empty">清空</button></div>
      <details class="creative-coordinate"><summary>按行列精确落刀</summary><div class="creative-row"><label>行<input id="custom-row" type="number" min="1" max="16" value="8"></label><label>列<input id="custom-column" type="number" min="1" max="16" value="8"></label><button type="button" id="custom-cut-cell">刻开此格</button><button type="button" id="custom-fill-cell">填回此格</button></div></details>
      <button type="button" class="creative-apply" id="custom-apply">用我的花版铺布 <span>↗</span></button><p class="creative-help">应用后重新施浆，可用工坊的“撤销上一步”返回原作。</p><p id="custom-status" class="creative-status" role="status" aria-live="polite"></p>
    </div><div class="recipe-desk"><div class="creative-panel-head"><h3>一缸，四种蓝。</h3><span>COLOR RECIPE</span></div><div class="recipe-preview-wrap"><canvas id="recipe-preview" width="420" height="420" role="img" aria-label="配方样布，完整施浆示意"></canvas><span>配方样布 · 完整施浆预览</span></div>
      <div class="recipe-palettes" role="group" aria-label="选择染色配方">${Object.entries(DYE_PALETTES).map(([id, label]) => `<button type="button" data-dye-palette="${id}" aria-pressed="false"><i aria-hidden="true"></i><span>${label}</span></button>`).join('')}</div>
      <label class="recipe-depth-label" for="dye-depth"><span>浸染层次</span><output id="dye-depth-value">三叠 · 靛青</output></label><input id="dye-depth" type="range" min="1" max="5" step="1" value="3" aria-label="浸染层次，一至五叠"><div class="recipe-depth-ends"><span>浅染 · 通透</span><span>叠染 · 深邃</span></div><p class="creative-copy">颜色随你的选择改变，已经留下的白浆保持原样。可以在揭纹后反复比较，把合意的一种收进布册。</p><p class="recipe-stage-note"></p>
    </div></div>`;
  studio.querySelector('.studio-heading').after(root);
  const receipt = document.createElement('div');
  receipt.className = 'result-receipt'; receipt.hidden = true;
  receipt.innerHTML = `<span class="receipt-kicker">YOUR CLOTH / 制作手记</span><span class="receipt-seal" aria-hidden="true">成</span><h3 class="receipt-title"></h3><p class="receipt-motif"></p><div class="receipt-swatch"><canvas width="192" height="192" aria-label="当前布面制作结果"></canvas></div><dl><div><dt>亲手施浆</dt><dd class="receipt-coverage"></dd></div><div><dt>染色配方</dt><dd class="receipt-palette"></dd></div><div><dt>浸染层次</dt><dd class="receipt-depth"></dd></div></dl><p class="receipt-note"></p><button type="button" class="receipt-return">返回施浆，继续落笔 <span>↶</span></button><div class="receipt-links"><a href="#living-gallery">让它走进生活 <span>↗</span></a><a href="#missions">看看下一份委托 <span>↗</span></a></div>`;
  studio.querySelector('.tools').append(receipt);
  receipt.querySelector('.receipt-return').addEventListener('click', () => {
    const coatButton = document.querySelector('#step-options [data-stage="coat"]');
    coatButton?.click(); coatButton?.focus({ preventScroll: true });
  });
  const motifSelect = document.getElementById('motif');
  if (!motifSelect.querySelector('option[value="custom"]')) {
    const option = document.createElement('option'); option.value = 'custom'; option.textContent = '我的手刻花版'; motifSelect.append(option);
  }
  const $ = selector => root.querySelector(selector);
  const editor = $('#custom-editor'), context = editor.getContext('2d');
  const preview = $('#recipe-preview'), previewContext = preview.getContext('2d');
  let state = createDocument(), cells = createCustomPattern(), sourceSignature = '', dirty = false;
  let cursor = { x: 7, y: 7 }, stroke = null, history = [], pending = 0, previewAnimation = null;
  const depthNames = ['一叠', '二叠', '三叠', '四叠', '五叠'];
  const permits = group => !window.indigoWorkbench || window.indigoWorkbench.allowedControls.includes(group);
  function updateControls() {
    for (const input of root.querySelectorAll('.stencil-desk input, .stencil-desk select, .stencil-desk button')) input.disabled = !permits('custom');
    $('#custom-apply').disabled = !permits('custom') || !permits('motif') || state.stage !== 'coat';
    $('#custom-undo').disabled = !permits('custom') || !history.length;
    editor.setAttribute('aria-disabled', String(!permits('custom')));
    for (const button of root.querySelectorAll('[data-dye-palette]')) button.disabled = !permits('palette');
    $('#dye-depth').disabled = !permits('palette');
  }
  function say(text) { $('#custom-status').textContent = text; }
  function editSnapshot() { history.push([...cells]); if (history.length > 32) history.shift(); }
  function drawEditor() {
    const size = editor.width / 16;
    context.fillStyle = '#243d4e'; context.fillRect(0, 0, editor.width, editor.height);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      context.fillStyle = cells[y * 16 + x] ? '#ece8d9' : '#304c5d';
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    }
    if (document.activeElement === editor) {
      context.strokeStyle = '#e7b96f'; context.lineWidth = 3;
      context.strokeRect(cursor.x * size + 2, cursor.y * size + 2, size - 4, size - 4);
    }
    $('#custom-undo').disabled = !permits('custom') || !history.length;
  }
  function drawPreview() {
    const design = { ...state, customPattern: cells, stage: 'reveal', coverage: new Uint8Array(state.coverage) };
    if (dirty) design.motif = 'custom';
    coatAll(design, createMask(design));
    const mask = createMask(design, preview.width);
    previewContext.putImageData(new ImageData(renderPixels(design, mask, preview.width), preview.width, preview.height), 0, 0);
  }
  function schedule() {
    if (pending) return;
    pending = requestAnimationFrame(() => { pending = 0; drawEditor(); if (root.open) drawPreview(); });
  }
  function paint(x, y, value) {
    if (!permits('custom')) return;
    cursor = { x, y };
    for (const index of symmetricCells(x, y, $('#custom-symmetry').value)) cells[index] = value;
    dirty = true; schedule();
  }
  function point(event) {
    const box = editor.getBoundingClientRect();
    return { x: Math.max(0, Math.min(15, Math.floor((event.clientX - box.left) * 16 / box.width))), y: Math.max(0, Math.min(15, Math.floor((event.clientY - box.top) * 16 / box.height))) };
  }
  function endStroke() {
    if (!stroke) return;
    const id = stroke.id; stroke = null;
    try { if (editor.hasPointerCapture(id)) editor.releasePointerCapture(id); } catch { /* Capture may have ended. */ }
    say(`这一刀已留下，现有 ${cells.reduce((sum, cell) => sum + cell, 0)} 格孔洞。应用后可在布面刮浆。`);
  }
  editor.addEventListener('pointerdown', event => {
    if (!permits('custom') || stroke || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); editor.focus({ preventScroll: true }); editSnapshot();
    const p = point(event); stroke = { id: event.pointerId, last: p, value: $('#custom-tool').value === 'cut' ? 1 : 0 };
    try { editor.setPointerCapture(event.pointerId); } catch { /* Window end events remain available. */ }
    paint(p.x, p.y, stroke.value);
  });
  editor.addEventListener('pointermove', event => {
    if (!stroke || stroke.id !== event.pointerId) return;
    const p = point(event), last = stroke.last, steps = Math.max(Math.abs(p.x - last.x), Math.abs(p.y - last.y), 1);
    for (let step = 1; step <= steps; step++) paint(Math.round(last.x + (p.x - last.x) * step / steps), Math.round(last.y + (p.y - last.y) * step / steps), stroke.value);
    stroke.last = p;
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) editor.addEventListener(event, endStroke);
  window.addEventListener('pointerup', event => { if (event.pointerId === stroke?.id) endStroke(); });
  window.addEventListener('pointercancel', event => { if (event.pointerId === stroke?.id) endStroke(); });
  window.addEventListener('blur', endStroke);
  document.addEventListener('visibilitychange', () => { if (document.hidden) endStroke(); });
  editor.addEventListener('focus', schedule); editor.addEventListener('blur', schedule);
  editor.addEventListener('keydown', event => {
    if (!permits('custom')) return;
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[event.key]) {
      event.preventDefault(); const [dx, dy] = moves[event.key]; cursor.x = Math.max(0, Math.min(15, cursor.x + dx)); cursor.y = Math.max(0, Math.min(15, cursor.y + dy)); schedule();
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault(); editSnapshot(); paint(cursor.x, cursor.y, cells[cursor.y * 16 + cursor.x] ? 0 : 1);
    } else return;
    say(`第 ${cursor.y + 1} 行，第 ${cursor.x + 1} 列，${cells[cursor.y * 16 + cursor.x] ? '已刻开' : '保留版材'}。`);
  });
  $('#custom-undo').addEventListener('click', () => { if (history.length) { cells = history.pop(); dirty = true; schedule(); say('已撤销画板上的上一刀。'); } });
  for (const button of root.querySelectorAll('[data-stencil-preset]')) button.addEventListener('click', () => { endStroke(); editSnapshot(); cells = stencilPreset(button.dataset.stencilPreset); dirty = true; schedule(); say('起稿已更换，可以继续落刀，再应用到工坊。'); });
  for (const [id, value] of [['custom-cut-cell', 1], ['custom-fill-cell', 0]]) $(`#${id}`).addEventListener('click', () => {
    const row = Number($('#custom-row').value), col = Number($('#custom-column').value);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 1 || row > 16 || col < 1 || col > 16) { say('请填写 1–16 的整数行列。'); return; }
    editSnapshot(); paint(col - 1, row - 1, value); say(`第 ${row} 行，第 ${col} 列已${value ? '刻开' : '填回'}。`);
  });
  function apply(patch, recordHistory = true) {
    return window.dispatchEvent(new CustomEvent('indigo:creative-edit', { detail: { patch, recordHistory }, cancelable: true }));
  }
  $('#custom-apply').addEventListener('click', () => {
    endStroke();
    if (apply({ motif: 'custom', customPattern: [...cells] })) {
      dirty = false; say('手刻花版已应用。往下刮浆、浸染，看看它长成的布。');
      previewAnimation?.cancel();
      if (!document.documentElement.classList.contains('quiet') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) previewAnimation = preview.animate([{ transform: 'scale(.95)', opacity: .5 }, { transform: 'scale(1)', opacity: 1 }], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
    } else say('先在下方返回“施浆”工序，再应用花版。你的画稿仍留在这里。');
  });
  for (const button of root.querySelectorAll('[data-dye-palette]')) button.addEventListener('click', () => apply({ dyePalette: button.dataset.dyePalette }));
  let depthGesture = false;
  $('#dye-depth').addEventListener('input', () => { apply({ dyeDepth: Number($('#dye-depth').value) }, !depthGesture); depthGesture = true; });
  for (const event of ['change', 'blur', 'pointercancel']) $('#dye-depth').addEventListener(event, () => { depthGesture = false; });
  root.addEventListener('toggle', () => { if (root.open) schedule(); });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  window.addEventListener('indigo:quiet', () => { if (document.documentElement.classList.contains('quiet')) previewAnimation?.cancel(); });
  reduced.addEventListener('change', () => { if (reduced.matches) previewAnimation?.cancel(); });
  window.addEventListener('indigo:controls', updateControls);
  window.addEventListener('indigo:session-reset', () => {
    endStroke(); previewAnimation?.cancel(); previewAnimation = null;
    if (pending) { cancelAnimationFrame(pending); pending = 0; }
    state = createDocument(); cells = createCustomPattern(); sourceSignature = ''; dirty = false; history = []; depthGesture = false;
    cursor = { x: 7, y: 7 }; root.open = false; receipt.hidden = true;
    $('#custom-tool').value = 'cut'; $('#custom-symmetry').value = 'four'; $('#custom-row').value = '8'; $('#custom-column').value = '8';
    say(''); schedule(); updateControls();
  });
  window.addEventListener('indigo:change', event => {
    state = event.detail;
    receipt.hidden = state.stage === 'coat';
    if (!receipt.hidden) {
      receipt.querySelector('.receipt-title').textContent = state.stage === 'dye' ? '蓝已入布。' : '白已显形。';
      receipt.querySelector('.receipt-seal').textContent = state.stage === 'dye' ? '染' : '成';
      receipt.querySelector('.receipt-motif').textContent = MOTIFS[state.motif];
      const actualMask = createMask(state);
      receipt.querySelector('.receipt-coverage').textContent = `${coveragePercent(state, actualMask)}%`;
      receipt.querySelector('.receipt-palette').textContent = DYE_PALETTES[state.dyePalette];
      receipt.querySelector('.receipt-depth').textContent = depthNames[state.dyeDepth - 1];
      receipt.querySelector('.receipt-note').textContent = state.stage === 'dye' ? '白浆仍守着孔洞。揭开它，看看这一方留下的白。' : '每一道白，都是你留下的痕迹。把这方布带进生活，或回来添上下一笔。';
      receipt.querySelector('.receipt-links').hidden = state.stage !== 'reveal';
      const swatch = receipt.querySelector('canvas'), resolution = swatch.width;
      swatch.getContext('2d').putImageData(new ImageData(renderPixels(state, createMask(state, resolution), resolution), resolution, resolution), 0, 0);
    }
    motifSelect.value = state.motif;
    const signature = JSON.stringify(state.customPattern);
    if (signature !== sourceSignature) { cells = [...state.customPattern]; sourceSignature = signature; dirty = false; history = []; }
    for (const button of root.querySelectorAll('[data-dye-palette]')) button.setAttribute('aria-pressed', String(button.dataset.dyePalette === state.dyePalette));
    $('#dye-depth').value = state.dyeDepth;
    $('#dye-depth-value').textContent = `${depthNames[state.dyeDepth - 1]} · ${DYE_PALETTES[state.dyePalette]}`;
    $('.recipe-stage-note').textContent = state.stage === 'coat' ? '下方仍是待施浆的花版；浸染和揭纹后，成布采用这份配方。' : '下方成布与这份配方同步；样布展示完整施浆，你的成布保留实际手势。';
    updateControls();
    schedule();
  });
  window.dispatchEvent(new CustomEvent('indigo:request-state'));
}
