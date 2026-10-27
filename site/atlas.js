import { MOTIFS, createDocument, createMask, coatAll, renderPixels } from './engine.js?v=61';

// The atlas shares the workshop's masks. These are original digital patterns,
// not reproductions of museum collection objects.
const SPECIMENS = [
  { id: 'lotus', en: 'LOTUS / 01', form: '八瓣相叠 · 珠点环抱', word: '聚',
    text: '尖瓣向外舒展，圆珠绕着花心停留。把一朵花放大，是花瓣与点的秩序；把它反复铺开，又成了一方布的呼吸。',
    note: '从中心向外看：内瓣、外瓣、珠点，各自留出间隙。', meaning: '本作以莲瓣与露珠为造型线索，名为「莲华珠露」。' },
  { id: 'flower', en: 'ROSETTE / 02', form: '六瓣回转 · 团而不闭', word: '团',
    text: '六个方向围绕同一个中心，外缘有起伏，内部留出蓝色的花心。花可以独立成章，也可以在整幅布面上彼此呼应。',
    note: '顺着外缘数一圈，六次起伏把花收成一团。', meaning: '「六瓣团花」是本作对放射式花形的原创命名。' },
  { id: 'wave', en: 'RIPPLE / 03', form: '双环相套 · 断处相连', word: '环',
    text: '圆环向外一圈圈漾开，蓝色的横桥让完整的圆有了停顿。远看是水纹的节奏，近看是线与断点的关系。',
    note: '把下方的对照线移到花心，看看两个圆环怎样被桥截开。', meaning: '「回环水纹」以同心圆表现水波，是本作原创几何纹样。' },
  { id: 'seed', en: 'SPROUT / 04', form: '三叶相生 · 向外舒展', word: '生',
    text: '三片叶从中心展开，留下三角形的蓝色空隙。齐排时安静，换成错列，一枚枚叶片便沿着斜向接续生长。',
    note: '试试错列排布，追随相邻两行之间出现的斜向节奏。', meaning: '「三叶新生」借叶片表达生长的感受，为本作原创花形。' },
  { id: 'sprig', en: 'SPRIG / 05', form: '一茎数叶 · 穗粒轻垂', word: '风',
    text: '细茎略带弯曲，叶片左右伸展，梢头散落几枚穗粒。与团花不同，它让视线沿着枝条行走，疏处也成为图案的一部分。',
    note: '切到镜像排布，观察左右相向的枝叶怎样改变布面方向。', meaning: '「风过麦枝」以枝叶和穗粒为线索，是本作原创植物纹样。' }
];
const REPEAT_NAMES = { straight: '齐整', staggered: '错列', mirror: '镜像' };
const STORAGE_KEY = 'indigo.atlas.v1';

function readState() {
  const state = { motif: 'lotus', repeat: 'straight', scale: 100, split: 50 };
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (saved && SPECIMENS.some(s => s.id === saved.motif)) state.motif = saved.motif;
    if (saved && Object.hasOwn(REPEAT_NAMES, saved.repeat)) state.repeat = saved.repeat;
    if (saved && Number.isInteger(saved.scale) && saved.scale >= 70 && saved.scale <= 125) state.scale = saved.scale;
    if (saved && Number.isInteger(saved.split) && saved.split >= 0 && saved.split <= 100) state.split = saved.split;
  } catch { /* Browsing remains available when storage is blocked. */ }
  return state;
}

export function initAtlas() {
  const root = document.getElementById('atlas');
  if (!root || root.dataset.atlasReady) return;
  root.dataset.atlasReady = 'true';
  root.setAttribute('aria-labelledby', 'atlas-title');
  const state = readState();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isQuiet = () => reduced.matches || document.documentElement.classList.contains('quiet');
  const animations = new Set();
  function stopAnimations() {
    for (const animation of animations) animation.cancel();
    animations.clear();
  }
  function animateElement(element, keyframes, options) {
    const animation = element.animate(keyframes, options);
    animations.add(animation);
    animation.finished.catch(() => {}).finally(() => animations.delete(animation));
  }
  window.addEventListener('indigo:quiet', () => { if (isQuiet()) stopAnimations(); });
  reduced.addEventListener('change', () => { if (isQuiet()) stopAnimations(); });
  const $ = selector => root.querySelector(selector);
  root.innerHTML = `
    <div class="atlas-heading">
      <div class="atlas-kicker"><span>03 / PATTERN OBSERVATORY</span><span>五种花形，万般排布</span></div>
      <h2 id="atlas-title">纹样<span>标本室<i aria-hidden="true">↙</i></span></h2>
      <p class="atlas-heading-copy">先看一朵花，<br>再看它如何长成一方布。</p>
      <span class="atlas-stamp" aria-hidden="true">观<br>花</span>
    </div>
    <div class="atlas-index" role="group" aria-label="选择观察的原创纹样">
      ${SPECIMENS.map((s, i) => `<button type="button" data-atlas-motif="${s.id}" aria-pressed="${s.id === state.motif}"><span class="atlas-index-number">0${i + 1}</span><canvas width="96" height="96" data-atlas-swatch="${s.id}" aria-hidden="true"></canvas><span class="atlas-index-name">${MOTIFS[s.id]}<small>${s.en.split(' / ')[0]}</small></span><span class="atlas-index-arrow" aria-hidden="true">↗</span></button>`).join('')}
    </div>
    <div class="atlas-bench">
      <div class="atlas-cloth-stage">
        <div class="atlas-cloth-under" aria-hidden="true"></div>
        <div class="atlas-cloth-wrap"><canvas class="atlas-cloth" width="960" height="960" aria-label="当前纹样的完整刮浆成布预览"></canvas></div>
        <div class="atlas-cloth-annotation"><span>满浆样布 / 一枚花，反复成章</span><span class="atlas-layout-label"></span></div>
        <span class="atlas-ruler" aria-hidden="true">0 ┄┄┄┄┄ 5 ┄┄┄┄┄ 10 ┄┄┄┄┄ 15 ┄┄┄┄┄ 20</span>
        <span class="atlas-cloth-tag" aria-hidden="true">ORIGINAL<br>PATTERN STUDY</span>
      </div>
      <div class="atlas-specimen">
        <div class="atlas-specimen-meta"><span class="atlas-id"></span><span>原创花版 / 数字标本</span></div>
        <div class="atlas-flower-sheet"><canvas class="atlas-flower" width="800" height="800" aria-label="当前花形的局部放大"></canvas><span class="atlas-flower-cross" aria-hidden="true">＋</span><span class="atlas-sheet-scale">局部放大 / 看花，也看空隙</span></div>
        <div class="atlas-specimen-copy"><span class="atlas-word" aria-hidden="true"></span><div><p class="atlas-form"></p><h3 class="atlas-name"></h3></div></div>
        <p class="atlas-description"></p>
        <div class="atlas-layout-tools">
          <div class="atlas-repeat" role="group" aria-label="比较纹样排布">${Object.entries(REPEAT_NAMES).map(([key, value]) => `<button type="button" data-atlas-repeat="${key}" aria-pressed="${state.repeat === key}">${value}</button>`).join('')}</div>
          <label class="atlas-scale-label" for="atlas-scale">花幅 <output id="atlas-scale-value">${state.scale}%</output></label>
          <input id="atlas-scale" type="range" min="70" max="125" value="${state.scale}" aria-label="调整预览花幅">
        </div>
        <button type="button" class="atlas-use">用这张花版进入工坊<span aria-hidden="true">↗</span></button>
        <p class="atlas-state" role="status" aria-live="polite"></p>
      </div>
    </div>
    <div class="atlas-footnote"><span>01—05 / ORIGINAL DIGITAL PATTERNS</span><p class="atlas-meaning"></p></div>
    <div class="atlas-bridge-study">
      <div class="atlas-bridge-copy"><p class="atlas-small-title">近一点，看看刀留下的痕迹</p><h3>花要开，<br>版要<span>连。</span></h3><p>花版上的孔让白浆通过，保留的窄桥把版材连在一起。桥下没有白浆，染后就多了一道蓝。</p><p class="atlas-look-note"></p><div class="atlas-bridge-key"><span><i></i>白 / 孔洞过浆</span><span><i></i>蓝 / 留桥挡浆</span></div></div>
      <div class="atlas-compare">
        <div class="atlas-compare-top"><span>一枚花的两种状态</span><span>拖动对照 ↓</span></div>
        <div class="atlas-compare-picture"><canvas class="atlas-bridge-canvas" width="600" height="420" role="img" aria-label="左侧不留桥、右侧留桥的纹样对照"></canvas><span class="atlas-compare-label atlas-compare-left">不留桥</span><span class="atlas-compare-label atlas-compare-right">留一道桥</span><div class="atlas-compare-line" aria-hidden="true"><span>↔</span></div></div>
        <label class="atlas-compare-control" for="atlas-split"><span>完整的白</span><input id="atlas-split" type="range" min="0" max="100" value="${state.split}" aria-label="移动留桥前后对照线"><span>相连的版</span></label>
        <p class="atlas-compare-caption">移动分界线，看同一花形的蓝白变化。</p>
      </div>
    </div>
    <div class="atlas-reading">
      <p class="atlas-reading-label">花布小笺<span>READING THE CLOTH</span></p>
      <article><span>01 / 以花成团</span><h3>团花，看的是聚拢。</h3><p>花形围绕中心组织，视线便有了落点。中国非遗网的桐乡项目介绍中，把团花列为典型构图。这里的五种花版，则用自己的点、线与叶瓣重新组织。</p></article>
      <article><span>02 / 以花成布</span><h3>重复，看的是节奏。</h3><p>一枚单元向上下左右接续，形成连续的布面。试着改变齐整、错列与镜像：花形没有变，花与花之间的空隙、方向和疏密却变了。</p></article>
      <article><span>03 / 刀断意连</span><h3>断开，也是连接。</h3><p>南通蓝印花布的断刀兼顾造型和花版耐用。细看白花，会发现短线与点之间留着蓝。那些停顿，让花的形象和版的结构一起成立。</p></article>
    </div>
    <details class="atlas-sources"><summary>沿着纹样，读一手资料 <span>＋</span></summary><div><p>从工艺与构图认识蓝印花布，再带着自己的理解创作。</p><a href="https://www.ihchina.cn/project_details/11020/" target="_blank" rel="noopener noreferrer">中国非遗网 · 中国蓝印花布孤单的手艺 <span>断刀与构图 ↗</span></a><a href="https://www.ihchina.cn/art/detail/id/14299.html" target="_blank" rel="noopener noreferrer">中国非遗网 · 蓝印花布印染技艺（桐乡）<span>团花与生活 ↗</span></a><a href="https://fzfz.ntu.edu.cn/2019/1106/c2224a63310/page.htm" target="_blank" rel="noopener noreferrer">南通大学纺织服装学院 · 蓝印花布简介 <span>制版与印染 ↗</span></a></div></details>`;

  const cache = new Map();
  const CACHE_BYTES = 16 * 1024 * 1024;
  let cacheBytes = 0;
  let beforeBridge, afterBridge, drawFrame = 0;
  function remember() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Optional. */ }
  }
  function makeTexture(motif, bridge, repeat = 'straight', scale = 100, spacing = 110, size = 480) {
    const key = [motif, bridge, repeat, scale, spacing, size].join(':');
    if (cache.has(key)) {
      const cached = cache.get(key);
      cache.delete(key); cache.set(key, cached);
      return cached;
    }
    const design = createDocument();
    Object.assign(design, { motif, bridge, repeat, motifScale: scale, spacing, stage: 'reveal' });
    coatAll(design, createMask(design));
    const mask = createMask(design, size);
    const cloth = document.createElement('canvas'); cloth.width = cloth.height = size;
    cloth.getContext('2d').putImageData(new ImageData(renderPixels(design, mask, size), size, size), 0, 0);
    cache.set(key, cloth);
    cacheBytes += size * size * 4;
    // LRU is bounded by pixel bytes rather than a count of mixed-size images.
    while (cacheBytes > CACHE_BYTES) {
      const oldest = cache.keys().next().value, removed = cache.get(oldest);
      cacheBytes -= removed.width * removed.height * 4;
      cache.delete(oldest);
    }
    return cloth;
  }
  function drawFlower(target, source, paper = false) {
    const ctx = target.getContext('2d');
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(source, source.width * .32, source.height * .32, source.width * .36, source.height * .36, 0, 0, target.width, target.height);
    if (paper) {
      // Invert the textile to an ink-on-paper study, without changing geometry.
      const pixels = ctx.getImageData(0, 0, target.width, target.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        // Keep the interpolated edge coverage when reversing ink and paper;
        // thresholding after enlargement would reintroduce staircase edges.
        const ink = Math.max(0, Math.min(1, (pixels.data[i] - 30) / 212));
        pixels.data[i] = 238 + (18 - 238) * ink;
        pixels.data[i + 1] = 233 + (63 - 233) * ink;
        pixels.data[i + 2] = 221 + (176 - 221) * ink;
      }
      ctx.putImageData(pixels, 0, 0);
    }
  }
  function drawComparison() {
    const target = $('.atlas-bridge-canvas'), ctx = target.getContext('2d');
    const boundary = target.width * state.split / 100;
    const crop = source => ctx.drawImage(source, source.width * .32, source.height * .374, source.width * .36, source.height * .252, 0, 0, target.width, target.height);
    ctx.clearRect(0, 0, target.width, target.height);
    crop(afterBridge);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, boundary, target.height); ctx.clip(); crop(beforeBridge); ctx.restore();
    $('.atlas-compare-line').style.left = `${state.split}%`;
    $('#atlas-split').setAttribute('aria-valuetext', `不留桥区域 ${state.split}%，留桥区域 ${100 - state.split}%`);
  }
  function renderCloth(size = 960) {
    const texture = makeTexture(state.motif, true, state.repeat, state.scale, 110, size);
    const target = $('.atlas-cloth');
    const ctx = target.getContext('2d');
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(texture, 0, 0, target.width, target.height);
    $('.atlas-layout-label').textContent = `${REPEAT_NAMES[state.repeat]} / 花幅 ${state.scale}%`;
    target.setAttribute('aria-label', `${MOTIFS[state.motif]}，${REPEAT_NAMES[state.repeat]}排布，花幅 ${state.scale}%的完整刮浆成布预览`);
    $('#atlas-scale-value').value = `${state.scale}%`;
    $('#atlas-scale').setAttribute('aria-valuetext', `花幅 ${state.scale}%`);
    remember();
  }
  function selectMotif(motif, animate = true) {
    const index = SPECIMENS.findIndex(s => s.id === motif), item = SPECIMENS[index];
    if (!item) return;
    state.motif = motif;
    root.dataset.motif = motif;
    $('.atlas-id').textContent = item.en;
    $('.atlas-name').textContent = MOTIFS[motif];
    $('.atlas-word').textContent = item.word;
    $('.atlas-form').textContent = item.form;
    $('.atlas-description').textContent = item.text;
    $('.atlas-meaning').textContent = item.meaning;
    $('.atlas-look-note').textContent = item.note;
    $('.atlas-cloth').setAttribute('aria-label', `${MOTIFS[motif]}，${REPEAT_NAMES[state.repeat]}排布的完整刮浆成布预览`);
    $('.atlas-flower').setAttribute('aria-label', `${MOTIFS[motif]}花形局部放大`);
    root.querySelectorAll('[data-atlas-motif]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.atlasMotif === motif)));
    beforeBridge = makeTexture(motif, false, 'straight', 100, 150);
    afterBridge = makeTexture(motif, true, 'straight', 100, 150, 960);
    drawFlower($('.atlas-flower'), afterBridge, true);
    drawComparison(); renderCloth();
    stopAnimations();
    if (animate && !isQuiet() && typeof $('.atlas-cloth-wrap').animate === 'function') {
      animateElement($('.atlas-cloth-wrap'), [{ clipPath: 'inset(0 100% 0 0)', transform: 'translateX(-24px) rotate(-5deg)' }, { clipPath: 'inset(0 0 0 0)', transform: 'translateX(0) rotate(-5deg)' }], { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)' });
      animateElement($('.atlas-flower-sheet'), [{ transform: 'rotate(5deg) translateY(12px)', opacity: .3 }, { transform: 'rotate(3deg) translateY(0)', opacity: 1 }], { duration: 500, easing: 'ease-out' });
    }
    $('.atlas-state').textContent = `${MOTIFS[motif]}，${item.form}。`;
  }
  root.querySelectorAll('[data-atlas-swatch]').forEach(canvas => drawFlower(canvas, makeTexture(canvas.dataset.atlasSwatch, true, 'straight', 100, 150, 240), true));
  root.querySelectorAll('[data-atlas-motif]').forEach(button => {
    button.addEventListener('click', () => selectMotif(button.dataset.atlasMotif));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = SPECIMENS.findIndex(s => s.id === state.motif);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? SPECIMENS.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + SPECIMENS.length) % SPECIMENS.length;
      const target = root.querySelector(`[data-atlas-motif="${SPECIMENS[next].id}"]`);
      target.focus(); selectMotif(SPECIMENS[next].id);
    });
  });
  root.querySelectorAll('[data-atlas-repeat]').forEach(button => button.addEventListener('click', () => {
    state.repeat = button.dataset.atlasRepeat;
    root.querySelectorAll('[data-atlas-repeat]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    renderCloth();
    $('.atlas-state').textContent = `已换成${REPEAT_NAMES[state.repeat]}排布。`;
  }));
  $('#atlas-scale').addEventListener('input', event => {
    state.scale = Number(event.target.value);
    if (drawFrame) return;
    drawFrame = requestAnimationFrame(() => { drawFrame = 0; renderCloth(480); });
  });
  // Rebuild once at display quality after the gesture; pointer motion keeps a
  // lower-cost sample and coalesces all input received before the next frame.
  for (const eventName of ['change', 'blur', 'pointercancel']) $('#atlas-scale').addEventListener(eventName, () => {
    cancelAnimationFrame(drawFrame); drawFrame = 0; renderCloth();
  });
  $('#atlas-split').addEventListener('input', event => { state.split = Number(event.target.value); drawComparison(); remember(); });
  // The full comparison surface supports touch/pen dragging. The native range
  // below remains the keyboard equivalent and does not interfere with scrolling.
  const picture = $('.atlas-compare-picture');
  let comparisonPointer = null;
  function moveComparison(event) {
    const bounds = picture.getBoundingClientRect();
    state.split = Math.max(0, Math.min(100, Math.round((event.clientX - bounds.left) / bounds.width * 100)));
    $('#atlas-split').value = state.split; drawComparison(); remember();
  }
  picture.addEventListener('pointerdown', event => {
    if (event.button !== 0 || comparisonPointer !== null) return;
    comparisonPointer = event.pointerId; picture.setPointerCapture(event.pointerId); moveComparison(event);
  });
  picture.addEventListener('pointermove', event => { if (event.pointerId === comparisonPointer) moveComparison(event); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) picture.addEventListener(event, () => { comparisonPointer = null; });
  $('.atlas-use').addEventListener('click', () => {
    // The application validates and creates a separate piece, retaining the
    // previous piece's identity and coating together in one undo entry.
    const accepted = window.dispatchEvent(new CustomEvent('indigo:new-pattern', {
      cancelable: true,
      detail: { motif: state.motif, repeat: state.repeat, motifScale: state.scale,
        spacing: 110, frame: 'open', bridge: true }
    }));
    if (!accepted) {
      $('.atlas-state').textContent = '暂时无法带入这张花版，当前作品已保留。';
      return;
    }
    $('.atlas-state').textContent = `已用「${MOTIFS[state.motif]}」与当前排布铺好一方新布。`;
    if (document.documentElement.dataset.sceneRouter === 'ready') {
      window.dispatchEvent(new CustomEvent('indigo:navigate', { cancelable: true,
        detail: { id: 'studio', anchor: 'studio', focus: 'studio-canvas' } }));
    } else {
      document.getElementById('studio')?.scrollIntoView({ behavior: isQuiet() ? 'instant' : 'smooth', block: 'start' });
      document.getElementById('studio-canvas')?.focus({ preventScroll: true });
    }
  });
  window.addEventListener('indigo:scene', () => {
    if (root.closest('[hidden]')) {
      stopAnimations(); cancelAnimationFrame(drawFrame); drawFrame = 0;
    } else renderCloth();
  });
  selectMotif(state.motif, false);
}
