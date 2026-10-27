import { initAtlas } from './atlas.js?v=61';
import { createDyeField } from './dye-field.js?v=61';

initAtlas();
const $ = id => document.getElementById(id);
const preference = matchMedia('(prefers-reduced-motion: reduce)');
let manualQuiet=false;
try{manualQuiet=sessionStorage.getItem('indigo-quiet')==='1';}catch{}
let quiet=manualQuiet||preference.matches;
const field=createDyeField($('dye-field'),$('journey'));
function applyQuiet(){
  quiet=manualQuiet||preference.matches;
  document.documentElement.classList.toggle('quiet',quiet);
  $('quiet-toggle').setAttribute('aria-pressed',String(quiet));
  $('quiet-toggle').querySelector('span:last-child').textContent=quiet?'动态':'静观';
  $('quiet-toggle').title=quiet?'恢复动态（遵循系统偏好）':'暂停环境动态';
  if(quiet)document.getAnimations().forEach(a=>{if(a.effect?.target?.closest?.('main')&&Number.isFinite(a.effect.getTiming().iterations))a.finish?.();});
  field?.setQuiet(quiet);window.dispatchEvent(new CustomEvent('indigo:quiet',{detail:quiet}));
}
$('quiet-toggle').addEventListener('click',()=>{manualQuiet=!manualQuiet;try{sessionStorage.setItem('indigo-quiet',manualQuiet?'1':'0');}catch{}applyQuiet();});
preference.addEventListener('change',applyQuiet);applyQuiet();

const steps=[
 ['刻版 · 先把花藏进孔洞','用刀代笔，把纹样刻成可重复使用的花版。留一道桥，让细小的版材与四周相连。'],
 ['刮浆 · 给白留一个位置','防染浆透过花版的孔洞，留在棉布上。刮刀经过之处，决定了这一方布将在哪里开花。'],
 ['晾干 · 把白暂时封存','浆层晾干后，覆盖处受到保护。等待，是染色前的一道工序；每一步都与下一步相连。'],
 ['浸染 · 蓝在空气中醒来','布入染缸，再出缸接触空气。浸染与氧化反复进行，让蓝逐层加深，白浆覆盖处依然留白。'],
 ['去浆 · 白花终于显影','刮去布面干燥的防染浆，受保护的棉布重新露出。白从来没有被画上去，它只是被好好留下。'],
 ['洗晒 · 让一方布走进生活','清洗、晾晒之后，花纹成为布的一部分。从被面、包袱到日常衣物，一方蓝继续与人相伴。']
];
let currentStep=0,storyAnimation;
function setProcess(index){
 currentStep=Math.max(0,Math.min(5,index));
 document.querySelectorAll('[data-process]').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===currentStep)));
 $('process-index').textContent=`0${currentStep+1} / 六个工艺片段`;
 $('process-title').textContent=steps[currentStep][0];$('process-description').textContent=steps[currentStep][1];
 field?.setChapter(currentStep);storyAnimation?.cancel();
 if(!quiet)storyAnimation=document.querySelector('.journey-story').animate([{opacity:.2,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}],{duration:550,easing:'cubic-bezier(.16,1,.3,1)'});
}
document.querySelectorAll('[data-process]').forEach((button,i)=>{button.addEventListener('click',()=>setProcess(i));button.addEventListener('keydown',event=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?5:(currentStep+(event.key==='ArrowRight'?1:5))%6;setProcess(next);document.querySelector(`[data-process="${next}"]`).focus();}});});

// Native scroll, sampled only when the viewport changes. Each target has one transform owner.
let scrollFrame=0;
const photo=document.querySelector('.heritage-art');
function scrollScene(){scrollFrame=0;if(quiet)return;const rect=photo.getBoundingClientRect();if(rect.top<innerHeight&&rect.bottom>0){const p=(innerHeight/2-(rect.top+rect.height/2))/innerHeight;photo.style.setProperty('--photo-y',`${Math.max(-35,Math.min(35,p*50))}px`);}}
addEventListener('scroll',()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(scrollScene);},{passive:true});
const entries=document.querySelectorAll('.section-heading,.layer-story,.studio-heading,.heritage-content,.atlas-heading,.collection-tail');
entries.forEach(e=>e.setAttribute('data-enter',''));
if('IntersectionObserver' in window){const observer=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){e.target.classList.add('is-visible');observer.unobserve(e.target);}},{threshold:.08});entries.forEach(e=>observer.observe(e));document.documentElement.classList.add('motion-ready');}
if(!quiet){document.querySelectorAll('.hero-title-wrap .title-line').forEach((e,i)=>e.animate([{clipPath:'inset(100% 0 0 0)',transform:'translateY(35px)'},{clipPath:'inset(0 0 0 0)',transform:'translateY(0)'}],{duration:1300,delay:i*160,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}));}
// A visible saved state acknowledges the real action without an overlay or a timer gate.
$('save').addEventListener('click',()=>{if($('status').textContent.includes('已保存')){const b=$('save');b.textContent='已收入布册 ✓';setTimeout(()=>b.textContent='收进我的布册',2200);}});
addEventListener('indigo:scene',()=>{
  if($('journey').closest('[hidden]')){storyAnimation?.cancel();storyAnimation=null;}
  if(!photo.closest('[hidden]'))scrollScene();
});
addEventListener('pagehide',()=>{cancelAnimationFrame(scrollFrame);field?.setQuiet(true);});
addEventListener('pageshow',()=>field?.setQuiet(quiet));

