import { createDocument, createMask, coatAll, renderPixels, validateDocument, MOTIFS } from './engine.js?v=61';
import { createClothScene } from './cloth-scene.js?v=61';
import { initWorkshopMotion } from './workshop-motion.js?v=61';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let pendingCloth = null, pendingLayers = null;
const isPanelVisible = node => !!node && !node.closest('[hidden]');
let current, signature = '', previousStage, latestTexture, scene, inspectionScene, heroEntrance, firstTexture = true;
const hero = $('hero-cloth');
const fallback = document.createElement('canvas'); fallback.id='hero-fallback'; fallback.width=900;fallback.height=900;fallback.hidden=true;fallback.setAttribute('aria-label','花布平面预览');
hero.after(fallback);
function showFallback(reason){hero.dataset.renderer='fallback';hero.dataset.fallbackReason=String(reason||'unavailable');hero.hidden=true;fallback.hidden=false;$('scene-hint').textContent='当前设备使用平面花布预览';$('motion-toggle').hidden=true;if(latestTexture)drawFallback(latestTexture);}
scene = createClothScene(hero, {
  sculpture: 1,
  onFallback: showFallback,
  onContextChange: ({state}) => { if(state==='lost')showFallback();if(state==='restored'){hero.dataset.renderer='webgl';hero.hidden=false;fallback.hidden=true;$('motion-toggle').hidden=false;$('scene-hint').textContent='拖动布面，看看光如何经过褶皱';} }
});
if(!scene&&!hero.hidden)showFallback();
if(scene)hero.dataset.renderer='webgl';
const heroWide = matchMedia('(min-width:721px)');
let closeup = false;
function frameHero(){scene?.setView({focus:[.5,.47],zoom:closeup?1.1:.7,yaw:closeup?.35:-.18,pitch:closeup?-.12:.08,roll:-.16});if(!fallback.hidden&&latestTexture)drawFallback(latestTexture);}
frameHero(); heroWide.addEventListener('change',frameHero);
$('hero-closeup').addEventListener('click',()=>{closeup=!closeup;frameHero();$('hero-closeup').setAttribute('aria-pressed',String(closeup));$('hero-closeup').textContent=closeup?'回看整幅 ↙':'近看经纬 ↗';});
window.addEventListener('indigo:quiet',event=>{scene?.setMotionPaused(event.detail||paused);inspectionScene?.setMotionPaused(true);});
let paused = false;
$('motion-toggle').addEventListener('click',()=>{paused=!paused;scene?.setMotionPaused(paused||document.documentElement.classList.contains('quiet'));$('motion-toggle').setAttribute('aria-pressed',String(paused));$('motion-toggle').textContent=paused?'让微风继续':'暂停微风';});
function texture(doc, size = 600) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  canvas.getContext('2d').putImageData(new ImageData(renderPixels(doc, createMask(doc, size), size), size, size), 0, 0);
  return canvas;
}
function finished(doc) {const copy=validateDocument({...doc,coverage:Array.from(doc.coverage)});coatAll(copy,createMask(copy));copy.stage='reveal';return copy;}
function drawFallback(cloth){const c=fallback.getContext('2d');c.clearRect(0,0,900,900);c.save();c.translate(450,430);c.rotate(-.2);c.shadowColor='#0008';c.shadowBlur=35;const size=closeup?900:600;c.drawImage(cloth,-size/2,-size/2,size,size);c.restore();}
function drawLayers(doc){
  const d=finished(doc), size=360, mask=createMask(d,size);
  document.querySelectorAll('[data-diagram]').forEach(element=>{
    const target=element.querySelector('canvas'), c=target.getContext('2d');
    target.width=target.height=size;
    const mode=element.dataset.diagram;
    if(mode==='cloth'){c.drawImage(texture(d,size),0,0);return;}
    const data=new Uint8ClampedArray(size*size*4);
    for(let i=0;i<mask.length;i++){
      const x=i%size,y=Math.floor(i/size),grain=((x*13+y*7)%11)-5;
      const visible=mode==='stencil'?!mask[i]:mask[i];
      data[i*4]=(mode==='stencil'?190:245)+grain;
      data[i*4+1]=(mode==='stencil'?173:239)+grain;
      data[i*4+2]=(mode==='stencil'?137:216)+grain;
      data[i*4+3]=visible?255:0;
    }
    c.putImageData(new ImageData(data,size,size),0,0);
  });
}
function drawCloth(doc){
  latestTexture=texture(doc.stage==='reveal'?doc:finished(doc),1200);
  if(scene){scene.setTexture(latestTexture);scene.setStage('reveal');}else drawFallback(latestTexture);
  if(!fallback.hidden)drawFallback(latestTexture);
  $('hero-pattern-name').textContent=MOTIFS[doc.motif];
  document.querySelector('.cloth-label small').textContent=doc.stage==='reveal'?'我的当前成布 · 实际留白':'当前花版 · 满浆预览';
  document.querySelectorAll('[data-start-motif]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.startMotif===doc.motif)));
  if(firstTexture&&!reduced.matches){firstTexture=false;heroEntrance=hero.animate([{opacity:0,transform:'translateY(35px)'},{opacity:1,transform:'translateY(0)'}],{duration:1100,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'});}
}
$('layer-toggle').addEventListener('click',()=>{
  const open=$('layer-toggle').getAttribute('aria-pressed')!=='true';
  $('layer-toggle').setAttribute('aria-pressed',String(open));$('layer-stack').classList.toggle('is-open',open);
  $('layer-toggle').querySelector('span').textContent=open?'合回这一方布':'掀开花版';
  $('layer-title').innerHTML=open?'白，在中间<br>被留下。':'三层相遇，<br>才有蓝白。';
  $('layer-description').textContent=open?'上层的孔洞决定白浆从哪里经过。中层是留在布上的防染浆；去掉它，底层就露出同样形状的白。':'花版让白浆经过孔洞，白浆保护棉布。染色后去浆，白花才从蓝里显出来。';
});
function update(doc){
  const revealFocused=document.activeElement===$('reveal-progress')||document.activeElement===$('reveal');
  current=doc;document.querySelector('.tools').dataset.stage=doc.stage;
  const key=JSON.stringify([doc.motif,doc.spacing,doc.rotation,doc.repeat,doc.motifScale,doc.bridge,doc.frame,doc.customPattern,doc.dyePalette,doc.dyeDepth,doc.stage==='reveal'?doc.coverage:null]);
  if(key!==signature){signature=key;pendingCloth=doc;pendingLayers=doc;flushMaterialPanels();}
  $('material-caption').textContent={coat:'花版 · 白浆经过孔洞',dye:'蓝染 · 浆下仍是白',reveal:'去浆 · 留白成花'}[doc.stage];
  $('stage-poem').innerHTML={coat:'顺着花版，<br>让白浆经过孔洞。<br>不用每一处都一样。',dye:'蓝渐渐漫过。<br>你留下的白，<br>还藏在浆的下面。',reveal:'漏下的，染成蓝。<br>留下的，显作白。<br>这一次，由你成花。'}[doc.stage];
  $('dye').hidden=doc.stage!=='coat';$('reveal').hidden=doc.stage!=='dye';
  $('inspect-cloth').hidden=doc.stage!=='reveal';
  document.querySelector('.mask-legend').hidden=doc.stage!=='coat';$('reveal-control').hidden=doc.stage!=='dye';
  const overlay=$('reveal-preview');overlay.style.visibility=doc.stage==='dye'?'visible':'hidden';
  if(doc.stage==='dye'){const d=validateDocument({...doc,coverage:Array.from(doc.coverage)});d.stage='reveal';overlay.getContext('2d').drawImage(texture(d,720),0,0);}
  if(doc.stage==='dye'&&previousStage!=='dye'){$('reveal-progress').value=0;overlay.style.clipPath='inset(0 100% 0 0)';}
  previousStage=doc.stage;
  if(doc.stage==='reveal'&&revealFocused)$('piece-name').focus({preventScroll:true});
}
function flushMaterialPanels(){
  if(pendingCloth&&isPanelVisible(hero)){drawCloth(pendingCloth);pendingCloth=null;}
  if(pendingLayers&&isPanelVisible($('layer-stack'))){drawLayers(pendingLayers);pendingLayers=null;}
}
window.addEventListener('indigo:change',event=>update(event.detail));
window.addEventListener('indigo:scene',event=>{if(!isPanelVisible(hero)){heroEntrance?.cancel();heroEntrance=null;}if(event.detail?.id==='craft')flushMaterialPanels();});
$('reveal-progress').addEventListener('input',event=>{const value=Number(event.target.value);$('reveal-preview').style.clipPath=`inset(0 ${100-value}% 0 0)`;if(value===100)$('reveal').click();});
initWorkshopMotion();
const inspection=$('cloth-inspection');
window.addEventListener('indigo:session-reset',()=>{
  if(inspection.open)inspection.close();
  inspectionScene?.destroy();inspectionScene=null;gripPointer=null;gripMoved=false;
  heroEntrance?.cancel();heroEntrance=null;signature='';previousStage=undefined;pendingCloth=null;pendingLayers=null;
  $('inspection-name').textContent='';$('inspection-note').textContent='';$('corner-height').value=0;
  for(const id of ['inspection-canvas','inspection-flat']){const c=$(id);c.getContext('2d')?.clearRect(0,0,c.width,c.height);}
  $('reveal-progress').value=0;$('reveal-preview').style.clipPath='inset(0 100% 0 0)';
  closeup=false;paused=false;frameHero();scene?.setLift(0);scene?.setMotionPaused(document.documentElement.classList.contains('quiet')||reduced.matches);
  $('hero-closeup').setAttribute('aria-pressed','false');$('hero-closeup').textContent='近看经纬 ↗';
  $('motion-toggle').setAttribute('aria-pressed','false');$('motion-toggle').textContent='暂停微风';
});
window.addEventListener('indigo:scene',()=>{if(inspection.open&&!isPanelVisible($('inspect-cloth')))inspection.close();});
function inspectionControls(enabled){for(const id of ['lift-corner','corner-height','flatten-cloth','cloth-grip'])$(id).disabled=!enabled;$('cloth-grip').hidden=!enabled;}
function setCorner(value){const v=Math.max(0,Math.min(100,Number(value)));$('corner-height').value=v;inspectionScene?.setLift(v/100);$('cloth-grip').setAttribute('aria-pressed',String(v>50));$('cloth-grip').querySelector('span').textContent=v>50?'放下这一角':'提起这一角';}
$('inspect-cloth').addEventListener('click',()=>{
  if(current?.stage!=='reveal')return;
  const actual=texture(current,720), canvas=$('inspection-canvas'), flat=$('inspection-flat');
  inspection.showModal();document.body.classList.add('inspecting-cloth');
  $('inspection-name').textContent=$('piece-name').value||MOTIFS[current.motif];
  flat.getContext('2d').drawImage(actual,0,0);canvas.hidden=false;flat.hidden=true;
  function flatMode(){canvas.hidden=true;flat.hidden=false;inspectionControls(false);$('inspection-note').textContent='当前显示平面成布；实际留白与导出一致。';}
  inspectionScene=createClothScene(canvas,{onFallback:flatMode,onFrame:({corner})=>{const grip=$('cloth-grip');grip.hidden=!corner.visible||canvas.hidden;grip.style.left=`${corner.x}px`;grip.style.top=`${corner.y}px`;},onContextChange:({state})=>{if(state==='restored'){canvas.hidden=false;flat.hidden=true;inspectionControls(true);$('inspection-note').textContent='拖动转向，沿着光看看自己留下的白。';}}});
  if(inspectionScene){const uploaded=inspectionScene.setTexture(actual);inspectionScene.setStage('reveal');inspectionScene.setView({focus:[.5,.48],zoom:.95,yaw:-.2,pitch:.14,roll:-.12});inspectionScene.setMotionPaused(true);if(uploaded)$('inspection-note').textContent='拖动转向，沿着光看看自己留下的白。';else flatMode();}else flatMode();
  setCorner(0);inspectionControls(!!inspectionScene&&!canvas.hidden);
  if(!reduced.matches&&!document.documentElement.classList.contains('quiet'))$('inspection-stage').animate([{opacity:0,transform:'translateY(80px) scale(.86)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:750,easing:'cubic-bezier(.22,1,.36,1)'});
});
$('close-inspection').addEventListener('click',()=>inspection.close());
inspection.addEventListener('close',()=>{inspectionScene?.destroy();inspectionScene=null;gripPointer=null;gripMoved=false;document.body.classList.remove('inspecting-cloth');if(isPanelVisible($('inspect-cloth')))$('inspect-cloth').focus({preventScroll:true});});
$('lift-corner').addEventListener('click',()=>setCorner(100));
$('corner-height').addEventListener('input',event=>setCorner(event.target.value));
$('flatten-cloth').addEventListener('click',()=>{setCorner(0);inspectionScene?.setView({yaw:0,pitch:0,roll:0,zoom:.95});});
$('inspection-export').addEventListener('click',()=>$('export-png').click());
let gripPointer=null,gripMoved=false;
$('cloth-grip').addEventListener('pointerdown',event=>{if(event.button!==0||gripPointer)return;gripMoved=false;gripPointer={id:event.pointerId,y:event.clientY,value:Number($('corner-height').value)};event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.focus({preventScroll:true});event.preventDefault();});
$('cloth-grip').addEventListener('pointermove',event=>{if(gripPointer?.id!==event.pointerId)return;const delta=gripPointer.y-event.clientY;if(Math.abs(delta)>4)gripMoved=true;setCorner(gripPointer.value+delta/1.8);event.preventDefault();});
for(const eventName of ['pointerup','pointercancel','lostpointercapture'])$('cloth-grip').addEventListener(eventName,()=>{gripPointer=null;});
$('cloth-grip').addEventListener('click',event=>{if(!gripMoved||event.detail===0)setCorner(Number($('corner-height').value)>50?0:100);});
document.querySelectorAll('[data-swatch]').forEach(canvas=>{const d=createDocument();d.motif=canvas.dataset.swatch;d.spacing=150;canvas.getContext('2d').drawImage(texture(finished(d),240),75,75,90,90,0,0,72,72);});

