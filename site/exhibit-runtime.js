import { validateExhibitPack, createPreset, evaluateConditions } from '/lib/exhibit-pack.js';
import { createMask, coatAll, serializeDocument, validateDocument } from './engine.js?v=61';
import { renderDesign, renderCard, downloadCard, downloadJSON } from './artwork.js';

const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.search), personal = query.get('mode') === 'personal', preview = query.has('preview');
const labels = { choose:'选意', explore:'看手艺', create:'亲手做', reveal:'揭蓝', takeaway:'带走' };
let bootstrap, pack, choice, sessionId, step = 'choose', envelope, uploadEpoch = 0, busy = false, lastActive = Date.now(), bootEpoch = 0;
let countdownAt = null, idleTimer;
const workbench = () => window.indigoWorkbench;
function id() { return crypto.randomUUID?.() || `visitor_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
function announce(text) { $('exhibit-status').textContent = text; }
function navigate(anchor) { window.indigoSceneRouter?.navigate(anchor, { anchor, history:'push' }); }
function close(dialog) { if (dialog.open) dialog.close(); }
function open(dialog) { if (!dialog.open) dialog.showModal(); }
function updateStep(next) {
  step = next;
  for (const b of $('story-steps').children) b.setAttribute('aria-current', b.dataset.step === step ? 'step' : 'false');
  if (next === 'choose') open($('story-choice'));
  if (next === 'explore') navigate('anatomy');
  if (next === 'create' || next === 'reveal') navigate('studio');
  if (next === 'takeaway') showResult();
  updateProgress();
}
function updateProgress() {
  if (!pack || !choice || !workbench()) return;
  const doc = workbench().snapshot();
  let result;
  try { result = evaluateConditions(pack, doc); } catch { return; }
  const next = $('story-next'); next.disabled = false;
  if (step === 'create') {
    const following = pack.steps[pack.steps.indexOf(step) + 1];
    next.textContent = doc.stage === 'coat' ? '在布面施浆，再浸染' : `继续 · ${labels[following] || '这段旅程'} →`;
    next.disabled = doc.stage === 'coat';
  } else if (step === 'reveal') {
    next.textContent = doc.stage === 'reveal' ? '收起旅行作品 →' : '揭开这一方蓝 →';
    next.disabled = doc.stage === 'coat';
  } else if (step === 'takeaway') next.textContent = '查看我的纪念卡 ↗';
  else next.textContent = step === 'choose' ? '选择旅行意象 →' : '继续这段旅程 →';
  $('story-current').textContent = `${choice.title} · ${Number(result.coverage.toFixed(1))}% 留白施浆`;
  $('story-progress').textContent = doc.stage === 'reveal' ? (result.complete ? '作品已完成，可以带走。' : result.checks.filter(c => !c.passed).map(c => c.label).join('；')) : (step === 'explore' ? '看清三层关系，再把手艺变成自己的作品。' : '每一次施浆，都会留在最后的成布上。');
}
function makeEnvelope() {
  const doc = workbench().snapshot();
  return {schemaVersion:1,design:doc,exhibit:{id:pack.id,version:pack.version,title:pack.title,venue:pack.venue},choice:{id:choice.id,title:choice.title},card:{...pack.card},sessionId};
}
function choose(item) {
  choice = item;
  workbench().setAllowedControls?.(['motif','layout','custom','palette','bridge']);
  workbench().loadDesign(createPreset(pack, item.id));
  workbench().setAllowedControls?.(pack.allowedControls);
  $('story-rail').hidden = false; $('choice-label').textContent = item.title;
  close($('story-choice'));
  updateStep(pack.steps[1] || 'create');
}
function renderChoices() {
  $('exhibit-title').textContent = pack.title; $('choice-title').textContent = '想把什么，留在这段旅程？';
  $('choice-intro').textContent = pack.intro; $('venue-name').textContent = pack.venue;
  const grid = $('story-choices'); grid.replaceChildren();
  for (const [i, item] of pack.choices.entries()) {
    const button = document.createElement('button'); button.className = 'story-choice-card';
    const number = document.createElement('small'); number.textContent = `0${i + 1} / ${pack.title}`;
    const canvas = document.createElement('canvas'); canvas.width = 360; canvas.setAttribute('aria-label', `${item.title}花版满浆预览`);
    const design = validateDocument(createPreset(pack, item.id)); coatAll(design, createMask(design)); design.stage = 'reveal';
    renderDesign(canvas, serializeDocument(design));
    const title = document.createElement('h3'); title.textContent = item.title;
    const text = document.createElement('p'); text.textContent = item.description;
    const action = document.createElement('span'); action.textContent = '从这里开始 ↗';
    button.append(number, canvas, title, text, action); button.addEventListener('click', () => choose(item)); grid.append(button);
  }
  $('story-steps').replaceChildren();
  for (const s of pack.steps) {
    const b = document.createElement('button'); b.textContent = labels[s]; b.dataset.step = s;
    b.addEventListener('click', () => {
      if (s === 'takeaway' && !evaluateConditions(pack, workbench().snapshot()).complete) {
        announce('先完成这方布的施浆与揭纹，再收起作品。'); navigate('studio'); return;
      }
      updateStep(s);
    }); $('story-steps').append(b);
  }
}
async function beginVisitor() {
  const epoch = ++bootEpoch; uploadEpoch++; busy = false; choice = null; pack = null; envelope = null; countdownAt = null; lastActive = Date.now();
  $('enter-exhibit').disabled = true; $('story-rail').hidden = true; $('claim-block').hidden = true; $('share-status').textContent = '';
  for (const dialog of [$('story-choice'),$('story-result'),$('idle-dialog')]) close(dialog);
  sessionId = id(); workbench()?.beginVisitor({sessionId});
  try {
    const nextBootstrap = await fetch('/api/bootstrap', {cache:'no-store'}).then(async r => {if (!r.ok) throw new Error('展项服务暂时无法连接。'); return r.json();});
    if (epoch !== bootEpoch) return;
    bootstrap = nextBootstrap;
    pack = preview ? validateExhibitPack(JSON.parse(sessionStorage.getItem('liubai.preview.pack') || 'null')) : validateExhibitPack(bootstrap.activePack);
    renderChoices(); lastActive = Date.now();
    $('enter-exhibit').disabled = false; $('operator-link').hidden = !bootstrap.operator; $('reconnect-exhibit').hidden = true;
    $('preview-flag').hidden = !preview; $('preview-flag').textContent = '策展预览 · 尚未启用，作品不上传';
    announce('展项已就绪。选择一个意象，开始这段旅程。');
    if (!personal) window.indigoSceneRouter?.navigate('home', {history:'replace',instant:true});
  } catch (error) { if (epoch === bootEpoch) {announce(`${error.message} 请重试连接。`);$('reconnect-exhibit').hidden=false;} }
}
function showResult() {
  if (!choice) { open($('story-choice')); return; }
  const status = evaluateConditions(pack, workbench().snapshot());
  if (!status.complete) { announce(`再完成：${status.checks.filter(c=>!c.passed).map(c=>c.label).join('；')}`); navigate('studio'); return; }
  envelope = makeEnvelope(); uploadEpoch++; busy = false;
  renderCard($('souvenir-card'), envelope); $('result-name').value = envelope.design.name;
  $('result-ending').textContent = pack.ending; $('result-venue').textContent = `${pack.venue} / ${pack.title}`;
  $('claim-block').hidden = true; $('share-status').textContent = preview ? '当前为策展预览，可下载纪念卡。' : personal ? '作品保存在你的设备，可随时导出。' : '扫码后可在手机保存纪念卡，继续编辑自己的花布。';
  $('create-claim').hidden = preview || personal; $('create-claim').disabled = false;
  open($('story-result'));
}
async function share() {
  if (busy || !envelope) return;
  if (!bootstrap?.claimReady) { $('share-status').textContent = '手机领取尚未连接。请在策展工作台核对局域网地址；你的作品已保留，可下载。'; return; }
  const epoch = ++uploadEpoch, saved = structuredClone(envelope); busy = true; $('create-claim').disabled = true;
  $('share-status').textContent = '正在保存这一方蓝…';
  try {
    const response = await fetch('/api/artworks', {method:'POST',headers:{'Content-Type':'application/json','X-Liubai-Token':bootstrap.csrfToken},body:JSON.stringify({envelope:saved})});
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '保存未成功，请重试。');
    if (epoch !== uploadEpoch) return;
    const qr = window.qrcodegen.QrCode.encodeText(data.claimUrl, window.qrcodegen.QrCode.Ecc.MEDIUM);
    const canvas = $('claim-qr'), scale = 6, margin = 4; canvas.width = canvas.height = (qr.size + margin * 2) * scale;
    const c = canvas.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0,0,canvas.width,canvas.height); c.fillStyle = '#102c3e';
    for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y))c.fillRect((x+margin)*scale,(y+margin)*scale,scale,scale);
    $('claim-link').href = data.claimUrl; $('claim-link').textContent = '打开我的作品 ↗';
    $('claim-expiry').textContent = `与展屏连接同一网络 · ${new Date(data.expiresAt).toLocaleString('zh-CN')}前领取`;
    $('claim-block').hidden = false; $('share-status').textContent = '作品已保存。扫一扫，把这一方蓝带走。';
  } catch(error) { if(epoch===uploadEpoch) $('share-status').textContent=`${error instanceof TypeError ? '暂时无法连接领取服务。' : error.message} 当前作品仍在，可再次领取或下载。`; }
  finally {if(epoch===uploadEpoch){busy=false;$('create-claim').disabled=false;}}
}
function resetIdle() {lastActive=Date.now();if(countdownAt!==null){countdownAt=null;close($('idle-dialog'));}}
function checkIdle() {
  if (!pack || personal || preview) return;
  if(countdownAt===null && Date.now()-lastActive>=pack.idleSeconds*1000){
    for(const dialog of [$('story-result'),$('story-choice')])close(dialog);
    countdownAt=Date.now();open($('idle-dialog'));
  }
  if(countdownAt!==null){const left=Math.max(0,pack.countdownSeconds-Math.floor((Date.now()-countdownAt)/1000));$('idle-count').textContent=left;
    if(left===0)beginVisitor();}
}
$('enter-exhibit').addEventListener('click',()=>open($('story-choice')));
$('reconnect-exhibit').addEventListener('click',beginVisitor);
$('close-choice').addEventListener('click',()=>close($('story-choice')));
$('close-result').addEventListener('click',()=>close($('story-result')));
$('create-claim').addEventListener('click',share);
$('next-visitor').addEventListener('click',beginVisitor);
$('keep-creating').addEventListener('click',resetIdle);
$('idle-dialog').addEventListener('cancel',resetIdle);
$('idle-new-visitor').addEventListener('click',beginVisitor);
$('result-name').addEventListener('input',()=>{
  if(!envelope)return; const input=$('piece-name');input.value=$('result-name').value;input.dispatchEvent(new Event('input',{bubbles:true}));
  envelope=makeEnvelope();uploadEpoch++;busy=false;$('create-claim').disabled=false;$('claim-block').hidden=true;
  renderCard($('souvenir-card'),envelope);
});
$('download-souvenir').addEventListener('click',()=>{const epoch=bootEpoch;downloadCard($('souvenir-card'),()=>epoch===bootEpoch).catch(e=>{if(epoch===bootEpoch)$('share-status').textContent=e.message;});});
$('download-design').addEventListener('click',()=>envelope&&downloadJSON(envelope));
$('story-next').addEventListener('click',()=>{
  if(step==='takeaway'){showResult();return;}
  if(step==='reveal'&&workbench().snapshot().stage==='dye'){$('reveal').click();updateProgress();return;}
  updateStep(pack.steps[Math.min(pack.steps.indexOf(step)+1,pack.steps.length-1)]);
});
window.addEventListener('indigo:change',updateProgress);
for(const event of ['pointerdown','keydown','input'])document.addEventListener(event,e=>{if(!e.target.closest?.('#idle-dialog'))resetIdle();},{passive:true});
function resumeIdleTimer() {
  clearInterval(idleTimer);
  if (personal || preview) return;
  idleTimer=setInterval(checkIdle,1000);
  checkIdle();
}
window.addEventListener('pagehide',()=>clearInterval(idleTimer));
window.addEventListener('pageshow',async event=>{
  if (!event.persisted || personal) return;
  // A cached public document may belong to an earlier visitor. Start clean
  // synchronously through beginVisitor before awaiting its new bootstrap.
  await beginVisitor();
  resumeIdleTimer();
});
window.addEventListener('message', event => {
  if (!preview || event.origin !== location.origin || event.source !== window.opener || event.data?.type !== 'liubai:preview-pack') return;
  try {sessionStorage.setItem('liubai.preview.pack', JSON.stringify(validateExhibitPack(event.data.pack)));beginVisitor();}
  catch(error){announce(`展项预览无法更新：${error.message}`);}
});

async function start() {
  if(!workbench()){setTimeout(start,30);return;}
  if(personal){
    document.documentElement.classList.add('personal-visit');$('enter-exhibit').hidden=true;$('operator-link').hidden=true;
    $('exhibit-status').textContent='个人工坊 · 作品保存在当前设备';
    const raw=sessionStorage.getItem('liubai.handoff');
    if(query.has('handoff')&&raw){try{const data=JSON.parse(raw);workbench().loadDesign(data.design);sessionStorage.removeItem('liubai.handoff');navigate('studio');}catch{announce('未能打开领取作品，请返回领取页重新接续。');}}
    return;
  }
  await beginVisitor();resumeIdleTimer();
  if(preview&&window.opener)window.opener.postMessage({type:'liubai:preview-ready'},location.origin);
}
start();
