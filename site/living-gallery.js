import { createDocument, serializeDocument, validateDocument, createMask, coatAll, renderPixels, MOTIFS } from './engine.js?v=61';
import { getVisitorSession } from './visitor-session.js?v=1';

export const LIVING_PRODUCTS = Object.freeze({ bag: '随行提袋', cushion: '窗边靠枕', artwork: '一方挂画' });
export function createLivingDesign(value) {
  const design = value ? validateDocument(serializeDocument(value)) : createDocument();
  if (!value) { design.motif = 'lotus'; design.frame = 'bordered'; }
  const preview = design.stage !== 'reveal';
  if (preview) coatAll(design, createMask(design));
  design.stage = 'reveal';
  return { design, preview };
}
export function readLivingPreferences(value) {
  const candidate = value && typeof value === 'object' ? value : {};
  return {
    product: Object.hasOwn(LIVING_PRODUCTS, candidate.product) ? candidate.product : 'bag',
    light: candidate.light === 'evening' ? 'evening' : 'day',
    scale: Number.isInteger(candidate.scale) && candidate.scale >= 65 && candidate.scale <= 160 ? candidate.scale : 100
  };
}

// A softly filled textile face. The centre bows toward the viewer while the
// stitched rim stays on the backing plane; texture coordinates follow the face.
export function cushionSurface(u, v) {
  const dome = Math.max(0, Math.cos(u * Math.PI / 2) * Math.cos(v * Math.PI / 2)) ** .72;
  const depth = 94 * dome;
  const perspective = 1 + depth / 1500;
  return { x: u * (254 + 19 * (1 - v * v)) * perspective - depth * .23,
    y: v * (196 + 19 * (1 - u * u)) * perspective - depth * .47, depth };
}

export function initLivingGallery() {
  const root = document.getElementById('living-gallery');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = 'true'; root.classList.add('living-gallery');
  const visitor = getVisitorSession(window), storage = visitor.transient;
  let stored;
  try { stored = JSON.parse(storage.getItem('indigo.living.v1')); } catch {}
  const preferences = readLivingPreferences(stored);
  let current = createLivingDesign();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let animation = null, drawFrame = 0, sourceDirty = true;
  root.innerHTML = `
    <div class="living-heading"><div><p class="eyeline">04 / FROM CLOTH TO EVERYDAY</p><h2>把蓝，<br><em>带进生活。</em></h2></div><p>一枚花，走出花版。<br>让刚刚留下的蓝白，<br>成为每天用得到的物件。</p></div>
    <div class="living-workbench">
      <div class="living-visual"><canvas width="1440" height="1080" class="living-canvas" role="img" aria-label="当前花布应用在随行提袋上的效果"></canvas><div class="living-stage-label"><span>DESIGNED BY YOUR HANDS</span><b class="living-product-label">随行提袋</b></div><span class="living-view-number" aria-hidden="true">01 / 03</span><p class="living-render-note">满浆样布预览 · 完成揭纹后展示你的实际成布</p></div>
      <aside class="living-controls"><p class="living-controls-title">让它成为 <span>↙</span></p><div class="living-products" role="group" aria-label="选择生活用品">${Object.entries(LIVING_PRODUCTS).map(([id, name], i) => `<button type="button" data-living-product="${id}" aria-pressed="${preferences.product === id}"><small>0${i + 1}</small><span>${name}</span><b aria-hidden="true">↗</b></button>`).join('')}</div><div class="living-setting"><label for="living-scale">布面比例 <output id="living-scale-value">${preferences.scale}%</output></label><input type="range" min="65" max="160" step="1" id="living-scale" value="${preferences.scale}"><p>改变布面在物件上的取景，原花版保持不变。</p></div><fieldset class="living-light"><legend>看光经过</legend><label><input type="radio" name="living-light" value="day" ${preferences.light === 'day' ? 'checked' : ''}><span>午后天光</span></label><label><input type="radio" name="living-light" value="evening" ${preferences.light === 'evening' ? 'checked' : ''}><span>入夜灯下</span></label></fieldset><div class="living-piece"><small>这一方蓝的名字</small><strong></strong><span class="living-motif"></span></div><button class="living-download" type="button">收藏这幅生活画面 <span>↓</span></button><a href="#studio" class="living-back">回到工坊，继续改一改 <span>↗</span></a><p class="living-status" role="status" aria-live="polite"></p></aside>
    </div><div class="living-footnote"><span>BLUE, IN USE.</span><p>提袋装下出门的轻快，靠枕接住片刻的闲，挂画为房间留一方蓝。</p></div>`;
  const canvas = root.querySelector('.living-canvas'), context = canvas.getContext('2d');
  const texture = document.createElement('canvas'); texture.width = texture.height = 960;
  const source = document.createElement('canvas'); source.width = source.height = 720;
  const $ = selector => root.querySelector(selector);
  const environment = new Image();
  environment.onload = () => scheduleDraw();
  environment.src = 'assets/art-v6/living-studio.png';
  function quiet() { return motion.matches || document.documentElement.classList.contains('quiet'); }
  function savePreferences() { try { storage.setItem('indigo.living.v1', JSON.stringify(preferences)); } catch {} }
  function buildTexture() {
    if (sourceDirty) {
      const d = current.design;
      const pixels = renderPixels(d, createMask(d, source.width), source.width);
      source.getContext('2d').putImageData(new ImageData(pixels, source.width, source.height), 0, 0);
      sourceDirty = false;
    }
    const t = texture.getContext('2d');
    t.clearRect(0, 0, 960, 960);
    const size = 960 * preferences.scale / 100;
    const x = (960 - size) / 2;
    for (let row = -2; row <= 2; row++) for (let column = -2; column <= 2; column++) t.drawImage(source, x + column * size, x + row * size, size, size);
  }
  function scheduleDraw() { if (!drawFrame) drawFrame = requestAnimationFrame(() => { drawFrame = 0; draw(); }); }
  function sync(animate = true) {
    root.dataset.light = preferences.light;
    for (const button of root.querySelectorAll('[data-living-product]')) button.setAttribute('aria-pressed', String(button.dataset.livingProduct === preferences.product));
    $('.living-product-label').textContent = LIVING_PRODUCTS[preferences.product];
    $('.living-view-number').textContent = `0${Object.keys(LIVING_PRODUCTS).indexOf(preferences.product) + 1} / 03`;
    $('.living-render-note').textContent = current.preview ? '满浆样布预览 · 完成揭纹后展示你的实际成布' : '你的实际成布 · 保留这一次的施浆与留白';
    $('.living-piece strong').textContent = current.design.name || '未命名的一方蓝';
    $('.living-motif').textContent = `${MOTIFS[current.design.motif] || '自刻花版'} · ${current.preview ? '满浆预览' : '我的成布'}`;
    $('#living-scale-value').textContent = `${preferences.scale}%`;
    canvas.setAttribute('aria-label', `${current.preview ? '满浆样布' : '我的实际成布'}在${LIVING_PRODUCTS[preferences.product]}上的生活效果，${preferences.light === 'day' ? '午后天光' : '入夜灯下'}，布面比例${preferences.scale}%`);
    animation?.cancel(); animation = null;
    scheduleDraw(); savePreferences();
    if (animate && !quiet() && typeof canvas.animate === 'function') {
      animation = canvas.animate([{ opacity: .38, transform: 'translateY(15px) scale(.985)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 650, easing: 'cubic-bezier(.19,1,.22,1)' });
      animation.finished.catch(() => {});
    }
  }
  function gradient(stops, x1, y1, x2, y2) { const g = context.createLinearGradient(x1, y1, x2, y2); for (const [offset, color] of stops) g.addColorStop(offset, color); return g; }
  function ellipse(x,y,rx,ry,color) { context.beginPath(); context.ellipse(x,y,rx,ry,0,0,Math.PI*2); context.fillStyle=color; context.fill(); }
  function rounded(x,y,w,h,r) { context.beginPath(); context.roundRect(x,y,w,h,r); }
  function shadow(x,y,rx,ry,alpha=.3) { context.save(); context.filter='blur(19px)'; ellipse(x,y,rx,ry,`rgba(12,22,28,${alpha})`); context.restore(); }
  function stitch(drawPath, color='#e8e3c78c', width=1.5) { context.save(); context.strokeStyle=color; context.lineWidth=width; context.setLineDash([4,5]); context.beginPath(); drawPath(); context.stroke(); context.restore(); }
  function fillCloth(path, x,y,w,h,light = true) {
    context.save(); path(); context.clip(); context.drawImage(texture,x,y,w,h);
    if (light) { context.fillStyle=gradient([[0,'#ffffff18'],[.19,'#fff9d60a'],[.48,'#00132600'],[.82,'#00112233'],[1,'#000e2266']],x,y,x+w,y+h); context.fillRect(x,y,w,h); }
    context.restore();
  }
  function background() {
    const evening = preferences.light === 'evening';
    context.fillStyle = gradient([[0,evening?'#232c32':'#dbdcd1'],[.66,evening?'#4a4540':'#e6e0d1'],[1,evening?'#363532':'#c7bda9']],0,0,0,900); context.fillRect(0,0,1200,900);
    if (environment.complete && environment.naturalWidth) {
      context.save(); context.globalAlpha=evening ? .3 : .5;
      const ratio=Math.max(1200/environment.naturalWidth,900/environment.naturalHeight); const w=environment.naturalWidth*ratio,h=environment.naturalHeight*ratio;
      context.drawImage(environment,(1200-w)/2,(900-h)/2,w,h); context.restore();
    }
    context.fillStyle = gradient([[0,'#eee9d900'],[1,evening?'#221d1899':'#ded1b3b0']],0,600,0,900); context.fillRect(0,600,1200,300);
    context.save(); context.globalAlpha=evening?.12:.27; context.fillStyle='#fff9dc';
    context.beginPath(); context.moveTo(70,0);context.lineTo(210,0);context.lineTo(820,900);context.lineTo(570,900);context.closePath();context.fill();
    context.beginPath(); context.moveTo(240,0);context.lineTo(300,0);context.lineTo(1000,900);context.lineTo(890,900);context.closePath();context.fill();context.restore();
    // The pedestal establishes a shared floor and scale for each object.
    context.fillStyle=gradient([[0,evening?'#777267':'#ece7d9'],[1,evening?'#48453e':'#beb9a9']],0,650,0,850);
    context.beginPath();context.moveTo(260,700);context.lineTo(800,660);context.lineTo(1060,766);context.lineTo(500,817);context.closePath();context.fill();
    context.fillStyle=evening?'#3b3b35':'#b4b1a4';context.beginPath();context.moveTo(500,817);context.lineTo(1060,766);context.lineTo(1060,850);context.lineTo(500,900);context.closePath();context.fill();
    context.fillStyle=evening?'#5a574d':'#d0ccbd';context.beginPath();context.moveTo(260,700);context.lineTo(500,817);context.lineTo(500,900);context.lineTo(260,780);context.closePath();context.fill();
    context.strokeStyle=evening?'#e4d0a41f':'#ffffef70';context.lineWidth=1;context.beginPath();context.moveTo(260,700);context.lineTo(500,817);context.lineTo(1060,766);context.stroke();
    // Tiny plaster grain is deterministic; it is environmental detail, not data.
    context.fillStyle=evening?'#e3d5b509':'#403e2a08';for(let n=0;n<900;n++){const x=(n*113)%1200,y=(n*179)%900;context.fillRect(x,y,1,1);}
  }
  function bag() {
    shadow(650,751,225,20,.32);
    context.save();context.translate(65,28);context.rotate(-.055);
    // Deep indigo handles emerge behind the opening; fabric has visible thickness.
    const handle=(x1,x2,outer)=>{context.beginPath();context.moveTo(x1,363);context.bezierCurveTo(x1-5,130,x2+7,123,x2,363);context.strokeStyle=outer?'#1d3342':'#5e7480';context.lineWidth=outer?31:18;context.stroke();};
    handle(444,667,true); handle(493,708,false);
    stitch(()=>{context.moveTo(444,359);context.bezierCurveTo(439,130,674,123,667,359);},'#a3b7b54d',1);
    context.fillStyle='#102c41';context.beginPath();context.moveTo(391,347);context.lineTo(750,347);context.lineTo(807,382);context.lineTo(770,704);context.quadraticCurveTo(765,750,716,748);context.lineTo(406,737);context.closePath();context.fill();
    const shape=()=>{context.beginPath();context.moveTo(375,345);context.quadraticCurveTo(546,365,749,345);context.lineTo(722,711);context.quadraticCurveTo(721,746,681,748);context.lineTo(415,742);context.quadraticCurveTo(386,741,385,710);context.closePath();};
    fillCloth(shape,367,337,390,417);
    context.save();shape();context.clip();
    const folds=[[400,21,.19],[462,23,.08],[685,23,.15],[717,14,.3]];
    for(const [x,w,a] of folds){context.fillStyle=gradient([[0,'#061b3200'],[.5,`rgba(0,13,29,${a})`],[1,'#061b3200']],x-w,0,x+w,0);context.fillRect(x-w,350,w*2,400);}
    context.fillStyle=gradient([[0,'#fff6d918'],[.5,'#fff6d900'],[1,'#00112638']],380,360,380,750);context.fillRect(375,345,380,410);context.restore();
    context.fillStyle='#16354a';context.beginPath();context.moveTo(375,345);context.quadraticCurveTo(546,365,749,345);context.lineTo(747,365);context.quadraticCurveTo(546,386,376,365);context.closePath();context.fill();
    stitch(()=>{context.moveTo(383,371);context.quadraticCurveTo(555,391,740,370);});
    stitch(()=>{context.moveTo(397,387);context.lineTo(405,707);context.quadraticCurveTo(408,728,427,729);context.lineTo(677,735);context.quadraticCurveTo(705,736,707,711);context.lineTo(730,388);},'#d8ddd06b');
    context.fillStyle='#c7b58d';context.fillRect(621,390,48,38);context.fillStyle='#304c5b';context.font='15px serif';context.fillText('蓝',637,415);context.strokeStyle='#796e5544';context.strokeRect(626,395,38,28);
    for(const x of [437,655]){context.fillStyle='#233b49';rounded(x,346,27,48,3);context.fill();stitch(()=>{context.rect(x+4,352,19,34);},'#c4cebe7a',1);}
    context.restore();
  }
  function cushion() {
    // This shadow touches the lowest stitched edge; a second, tighter contact
    // band gives the filled object weight against the plinth rather than hover.
    shadow(586,755,225,21,.3);
    context.save();context.filter='blur(5px)';ellipse(548,751,146,7,'#13202b59');context.restore();
    context.save();context.translate(625,535);context.rotate(-.08);
    const rim = (inset=1, dx=0, dy=0) => {
      context.beginPath();
      const add=(u,v,first=false)=>{const p=cushionSurface(u*inset,v*inset);if(first)context.moveTo(p.x+dx,p.y+dy);else context.lineTo(p.x+dx,p.y+dy);};
      add(-1,-1,true);
      for(let n=1;n<=32;n++)add(-1+n/16,-1);
      for(let n=1;n<=32;n++)add(1,-1+n/16);
      for(let n=1;n<=32;n++)add(1-n/16,1);
      for(let n=1;n<=32;n++)add(-1,1-n/16);
      context.closePath();
    };
    // A shadowed gusset behind the face supplies actual side thickness.
    context.save();context.shadowColor='#101e2c66';context.shadowBlur=13;context.shadowOffsetY=8;
    rim(1,9,12);context.fillStyle='#142d43';context.fill();context.restore();
    rim();context.fillStyle='#24475e';context.fill();
    const triangle=(src,dst)=>{
      const [s0,s1,s2]=src,[p0,p1,p2]=dst;
      const det=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);
      if(Math.abs(det)<.0001)return;
      const a=(p0.x*(s1.y-s2.y)+p1.x*(s2.y-s0.y)+p2.x*(s0.y-s1.y))/det;
      const c=(p0.x*(s2.x-s1.x)+p1.x*(s0.x-s2.x)+p2.x*(s1.x-s0.x))/det;
      const e=(p0.x*(s1.x*s2.y-s2.x*s1.y)+p1.x*(s2.x*s0.y-s0.x*s2.y)+p2.x*(s0.x*s1.y-s1.x*s0.y))/det;
      const b=(p0.y*(s1.y-s2.y)+p1.y*(s2.y-s0.y)+p2.y*(s0.y-s1.y))/det;
      const d=(p0.y*(s2.x-s1.x)+p1.y*(s0.x-s2.x)+p2.y*(s1.x-s0.x))/det;
      const f=(p0.y*(s1.x*s2.y-s2.x*s1.y)+p1.y*(s2.x*s0.y-s0.x*s2.y)+p2.y*(s0.x*s1.y-s1.x*s0.y))/det;
      // Expand only the clip edge by a fraction of a pixel to avoid hairlines
      // between adjacent affine pieces. The fabric itself remains the real data.
      const cx=(p0.x+p1.x+p2.x)/3,cy=(p0.y+p1.y+p2.y)/3;
      context.save();context.beginPath();dst.forEach((p,i)=>{const length=Math.hypot(p.x-cx,p.y-cy)||1;const x=p.x+(p.x-cx)*.45/length,y=p.y+(p.y-cy)*.45/length;if(i)context.lineTo(x,y);else context.moveTo(x,y);});context.closePath();context.clip();
      context.transform(a,b,c,d,e,f);context.drawImage(texture,0,0);context.restore();
    };
    context.save();rim();context.clip();
    const columns=22,rows=20;
    const point=(x,y)=>cushionSurface(x/columns*2-1,y/rows*2-1);
    const uv=(x,y)=>({x:x/columns*texture.width,y:y/rows*texture.height});
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const p00=point(col,row),p10=point(col+1,row),p11=point(col+1,row+1),p01=point(col,row+1);
      const t00=uv(col,row),t10=uv(col+1,row),t11=uv(col+1,row+1),t01=uv(col,row+1);
      triangle([t00,t10,t11],[p00,p10,p11]);triangle([t00,t11,t01],[p00,p11,p01]);
    }
    // Broad continuous light describes the filling: warm upper-left crown,
    // rolled lower/right edges, and no uniform flat rectangular highlight.
    const crown=context.createRadialGradient(-68,-87,22,-10,-20,330);
    crown.addColorStop(0,'#fff1cf3b');crown.addColorStop(.40,'#e9e9cf16');crown.addColorStop(.69,'#0b213718');crown.addColorStop(.89,'#071a3b65');crown.addColorStop(1,'#05162b9c');
    context.fillStyle=crown;context.fillRect(-300,-270,610,540);
    context.fillStyle=gradient([[0,'#fff0c51b'],[.28,'#fff0c500'],[.72,'#00162b00'],[1,'#00112973']],0,-215,0,230);context.fillRect(-300,-250,610,520);
    context.fillStyle=gradient([[0,'#f1efd417'],[.25,'#f1efd400'],[.75,'#04182d00'],[1,'#04182d4d']],-270,0,285,0);context.fillRect(-300,-250,610,520);
    // Four restrained tension folds point from the sewn corners into the dome.
    for(const [x,y,rot] of [[-248,-186,-.65],[247,-186,.65],[-249,190,.65],[248,190,-.65]]){
      context.save();context.translate(x,y);context.rotate(rot);context.fillStyle=gradient([[0,'#00152f00'],[.48,'#00152f45'],[.54,'#e1ebd113'],[1,'#00152f00']],-12,0,12,0);context.fillRect(-12,-46,24,92);context.restore();
    }
    context.restore();
    rim();context.strokeStyle='#0c21354f';context.lineWidth=2.4;context.stroke();
    rim(.972);context.strokeStyle='#c8d3bf67';context.lineWidth=3;context.stroke();
    rim(.967);context.setLineDash([3,5]);context.lineWidth=1;context.strokeStyle='#f0ecdc91';context.stroke();context.setLineDash([]);
    context.save();context.translate(247,107);context.rotate(.08);context.fillStyle='#bca77e';context.fillRect(0,0,30,47);context.fillStyle='#253e4c';context.font='14px serif';context.fillText('蓝',8,29);context.restore();
    context.restore();
  }
  function artwork() {
    shadow(648,747,255,34,.24);
    context.save();context.translate(620,445);context.rotate(-.065);
    context.shadowColor='#131a2480';context.shadowBlur=24;context.shadowOffsetX=16;context.shadowOffsetY=17;
    context.fillStyle='#645443';context.fillRect(-254,-274,522,573);context.shadowColor='transparent';
    context.fillStyle=gradient([[0,'#c9b18b'],[.5,'#a88b63'],[1,'#766047']],-248,-270,255,280);context.fillRect(-259,-279,514,569);
    context.fillStyle='#e9e4d3';context.fillRect(-241,-261,478,533);
    context.fillStyle='#13283a';context.fillRect(-185,-210,366,422);
    context.drawImage(texture,-180,-205,356,412);
    context.fillStyle=gradient([[0,'#fbf6d61c'],[.5,'#fbf6d600'],[1,'#07172d22']],-180,-205,176,207);context.fillRect(-180,-205,356,412);
    context.strokeStyle='#74695244';context.lineWidth=1;context.strokeRect(-185,-210,366,422);
    context.strokeStyle='#fdf4de66';context.beginPath();context.moveTo(-259,290);context.lineTo(-259,-279);context.lineTo(255,-279);context.stroke();
    context.fillStyle='#7b7b6b';context.font='11px serif';context.fillText('BLUE / A STUDY OF EVERYDAY',-180,246);
    context.save();context.beginPath();context.rect(-241,-261,478,533);context.clip();context.fillStyle=gradient([[0,'#fffced00'],[.46,'#fffced00'],[.48,'#fffced12'],[.68,'#fffced03'],[1,'#fffced00']],-250,-270,250,280);context.fillRect(-250,-270,510,560);context.restore();
    context.restore();
  }
  function draw() {
    if (!context || root.closest('[hidden]')) return;
    buildTexture();
    context.save(); context.setTransform(canvas.width/1200,0,0,canvas.height/900,0,0);context.clearRect(0,0,1200,900);
    background();
    if (preferences.product === 'bag') bag(); else if (preferences.product === 'cushion') cushion(); else artwork();
    if(preferences.light==='evening'){context.fillStyle='#07182a26';context.fillRect(0,0,1200,900);const lamp=context.createRadialGradient(350,180,10,500,400,700);lamp.addColorStop(0,'#f5d49d20');lamp.addColorStop(1,'#f5d49d00');context.fillStyle=lamp;context.fillRect(0,0,1200,900);}
    context.restore();
  }
  for (const button of root.querySelectorAll('[data-living-product]')) button.addEventListener('click', () => { if(preferences.product===button.dataset.livingProduct)return;preferences.product=button.dataset.livingProduct;sync(); });
  $('#living-scale').addEventListener('input', event => { preferences.scale=Number(event.target.value);sync(false); });
  for(const input of root.querySelectorAll('input[name="living-light"]')) input.addEventListener('change',()=>{preferences.light=input.value;sync();});
  $('.living-download').addEventListener('click', () => {
    const ticket=visitor.generation;
    const exportName=`${(current.design.name||'一方蓝').replace(/[\\/:*?"<>|]/g,'')}_${LIVING_PRODUCTS[preferences.product]}.png`;
    animation?.cancel();draw();
    canvas.toBlob(blob=>{
      if(!visitor.isCurrent(ticket))return;
      if(!blob){$('.living-status').textContent='这次画面未能导出，请再试一次。';return;}
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=exportName;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('.living-status').textContent='生活画面已导出，1440 × 1080 像素。';
    },'image/png');
  });
  window.addEventListener('indigo:change', event => {
    try { current=createLivingDesign(event.detail);sourceDirty=true;sync(false); } catch { /* Keep the latest valid design on malformed external events. */ }
  });
  window.addEventListener('indigo:session-reset', () => {
    animation?.cancel();animation=null;
    if(drawFrame){cancelAnimationFrame(drawFrame);drawFrame=0;}
    Object.assign(preferences,readLivingPreferences());current=createLivingDesign();sourceDirty=true;
    $('#living-scale').value=preferences.scale;
    for(const input of root.querySelectorAll('input[name="living-light"]'))input.checked=input.value===preferences.light;
    $('.living-status').textContent='';sync(false);
  });
  window.addEventListener('indigo:scene', event => { if (event.detail?.id === 'heritage' && !root.closest('[hidden]')) window.dispatchEvent(new CustomEvent('indigo:request-state')); });
  const stop=()=>{if(quiet()){animation?.cancel();animation=null;}};
  window.addEventListener('indigo:quiet',stop);motion.addEventListener('change',stop);
  sync(false);
  window.dispatchEvent(new CustomEvent('indigo:request-state'));
  return { refresh:()=>sync(false) };
}
