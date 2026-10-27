import { createMask, renderPixels, serializeDocument, validateDocument, coveragePercent } from './engine.js?v=61';
import { MISSIONS, missionProgress, experimentDocument, readMissionSession } from './exploration-model.js?v=61';
import { getVisitorSession } from './visitor-session.js?v=1';

export function initExploration() {
  const lab=document.getElementById('experiments'), missions=document.getElementById('missions');
  if(!lab||!missions||lab.dataset.ready)return;
  lab.dataset.ready='true';
  const key='indigo.exploration.v1';
  const visitor=getVisitorSession(window), local=visitor.storage, session=visitor.transient;
  const sessionKey=`${key}.active`;
  let record={completed:[],visited:[]}, active=null, current=null, armed=false;
  try { const resumed=readMissionSession(JSON.parse(session.getItem(sessionKey)));if(resumed){active=MISSIONS.find(m=>m.id===resumed.id);armed=resumed.armed;} } catch {}
  try { const r=JSON.parse(local.getItem(key)); if(r&&typeof r==='object')record={completed:Array.isArray(r.completed)?r.completed.filter(id=>MISSIONS.some(m=>m.id===id)):[],visited:Array.isArray(r.visited)?r.visited.filter(id=>['craft','atlas','studio','heritage'].includes(id)):[]}; } catch {}
  const save=()=>{try{local.setItem(key,JSON.stringify(record));return true;}catch{return false;}};
  const saveSession=()=>{try{if(active)session.setItem(sessionKey,JSON.stringify({id:active.id,armed}));else session.removeItem(sessionKey);}catch{}};
  const quiet=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('quiet');
  const go=(id,anchor,focus)=>window.dispatchEvent(new CustomEvent('indigo:navigate',{detail:{id,anchor,focus}}));
  lab.innerHTML=`<header class="experiment-heading"><div><p class="eyeline">A QUESTION IN BLUE / 留白实验室</p><h2>如果，<br><em>少留一点白？</em></h2></div><p>不用猜，亲手改变它。<br>同一枚花版，同一块布，<br>看一个选择如何改变结果。</p></header>
  <div class="experiment-bench"><figure><span class="lab-number">A</span><canvas id="lab-reference" width="480" height="480" aria-label="完整施浆并留桥的基准样布"></canvas><figcaption>留桥 · 完整刮浆<small>REFERENCE / 基准样布</small></figcaption></figure><span class="lab-between" aria-hidden="true">→</span><figure><span class="lab-number">B</span><canvas id="lab-result" width="480" height="480" aria-label="随实验参数变化的成布"></canvas><figcaption>由你改变的留白<small>EXPERIMENT / 你的对照</small></figcaption></figure></div>
  <div class="experiment-controls"><label for="lab-motif">花版<select id="lab-motif"><option value="lotus">莲华珠露</option><option value="flower">六瓣团花</option><option value="wave">回环水纹</option><option value="sprig">风过麦枝</option></select></label><label for="lab-coverage">刮浆行程 <output id="lab-coverage-value">65%</output><input id="lab-coverage" type="range" min="0" max="100" value="65"></label><label for="lab-depth">蓝的深度 <output id="lab-depth-value">3 / 5</output><input id="lab-depth" type="range" min="1" max="5" value="3"></label><label class="lab-check" for="lab-bridge"><input id="lab-bridge" type="checkbox" checked> 给花版留桥</label></div>
  <div class="experiment-result"><p id="lab-observation" role="status"></p><button id="lab-use" type="button">带着这个想法去做一方布 <span>↗</span></button></div>`;
  const $=id=>document.getElementById(id);
  let state={motif:'lotus',coverage:65,depth:3,bridge:true}, labDoc, raf=0, lastReference='', labNeedsDraw=true;
  const paint=(canvas,doc)=>canvas.getContext('2d').putImageData(new ImageData(renderPixels(doc,createMask(doc,480),480),480,480),0,0);
  function drawLab(){raf=0;if(lab.closest('[hidden]')){labNeedsDraw=true;return;}labNeedsDraw=false;labDoc=experimentDocument(state);if(lastReference!==state.motif){paint($('lab-reference'),experimentDocument({motif:state.motif,coverage:100}));lastReference=state.motif;}
    paint($('lab-result'),labDoc);const n=coveragePercent(labDoc,createMask(labDoc));
    $('lab-coverage-value').textContent=`${state.coverage}%`;$('lab-depth-value').textContent=`${state.depth} / 5`;
    $('lab-observation').textContent=`刮过布面 ${state.coverage}% 的宽度，实际覆盖了 ${n}% 的版孔。${state.bridge?'桥下没有白浆，白花中会留一道蓝。':'去掉留桥，白花更连贯，也要留意花版中悬空的部分。'}${state.depth>=4?' 深蓝让白花的轮廓更鲜明。':''}`;
  }
  for(const id of ['lab-motif','lab-coverage','lab-depth','lab-bridge'])$(id).addEventListener('input',()=>{state={motif:$('lab-motif').value,coverage:Number($('lab-coverage').value),depth:Number($('lab-depth').value),bridge:$('lab-bridge').checked};labNeedsDraw=true;if(!raf)raf=requestAnimationFrame(drawLab);});
  $('lab-use').addEventListener('click',()=>{if(raf){cancelAnimationFrame(raf);raf=0;}drawLab();const event=new CustomEvent('indigo:new-pattern',{cancelable:true,detail:{...serializeDocument(labDoc),repeat:'straight',motifScale:100,spacing:100,frame:'open'}});window.dispatchEvent(event);if(!event.defaultPrevented){go('studio','studio','studio-canvas');$('lab-observation').textContent='已把花版与蓝色配方带入新布，请在工坊亲手施浆。';}});
  drawLab();

  missions.innerHTML=`<div class="mission-intro"><div><p class="eyeline">CREATIVE COMMISSIONS / 今日，试一点不一样</p><h2>给双手，<em>一个新念头。</em></h2></div><p>四封创作委托，四种看待蓝白的方式。<br>随时开始、退出；自由创作一直在这里。</p></div><div class="mission-list">${MISSIONS.map(m=>`<button type="button" data-mission="${m.id}" aria-pressed="false"><small>${m.tag}</small><span>${({breath:'给花<br>留一点风',rhythm:'让莲花<br>错落生长',signature:'刻一枚<br>自己的花',night:'把夜色<br>染进布里'})[m.id]}</span><i data-stamp="${m.id}" aria-label="未完成">${m.stamp}</i><p>${m.brief}</p><b>打开委托 ↗</b></button>`).join('')}</div>
  <div id="mission-active" class="mission-active" hidden><div><span class="eyeline">ON YOUR WORKBENCH</span><h3 id="mission-title"></h3><p id="mission-hint"></p><ul id="mission-checks"></ul></div><div class="mission-actions"><button id="mission-start" type="button">铺好这张花版 ↗</button><button id="mission-claim" type="button" disabled>验收这方布 · 留印</button><button id="mission-exit" type="button">回到自由创作</button><p id="mission-status" role="status" aria-live="polite"></p></div></div>
  <div class="exploration-passport"><span>我的蓝白手记</span><p id="passport-progress"></p><a href="#living-gallery">把作品带进生活 ↗</a></div>`;
  function stamps(){for(const m of MISSIONS){const stamp=missions.querySelector(`[data-stamp="${m.id}"]`);stamp.classList.toggle('earned',record.completed.includes(m.id));stamp.setAttribute('aria-label',record.completed.includes(m.id)?'已完成':'未完成');}$('passport-progress').textContent=`走进 ${new Set(record.visited).size} / 4 间展厅 · 留下 ${new Set(record.completed).size} / 4 枚创作印记`;}
  function progress(){if(!active)return;const p=missionProgress(active.id,current);$('mission-checks').innerHTML=p.checks.map(([yes,text])=>`<li class="${yes?'met':''}"><span>${yes?'✓':'○'}</span>${text}</li>`).join('');$('mission-claim').disabled=!armed||!p.complete;}
  function showActive(){
    missions.querySelectorAll('[data-mission]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mission===active?.id)));
    $('mission-active').hidden=!active;if(!active)return;
    $('mission-title').textContent=active.title;$('mission-hint').textContent=active.hint;$('mission-status').textContent=armed?'委托已开始。完成后回到这里验收留印。':'开始会铺一方新布；原作品可用工坊的撤销返回。';progress();
  }
  missions.querySelectorAll('[data-mission]').forEach(button=>button.addEventListener('click',()=>{
    if(active?.id!==button.dataset.mission){active=MISSIONS.find(m=>m.id===button.dataset.mission);armed=false;}
    saveSession();showActive();
    $('mission-active').scrollIntoView({behavior:quiet()?'instant':'smooth',block:'nearest'});
  }));
  let stampAnimation=null;
  $('mission-start').addEventListener('click',()=>{if(!active)return;const event=new CustomEvent('indigo:new-pattern',{cancelable:true,detail:{motif:active.motif,repeat:active.repeat,frame:active.frame,spacing:100,motifScale:100,bridge:true,dyePalette:'indigo',dyeDepth:3}});window.dispatchEvent(event);if(event.defaultPrevented)return;armed=true;saveSession();progress();$('mission-status').textContent='委托已开始。完成后回到这里验收留印。';if(active.id==='signature'){const creative=document.getElementById('creative-lab');if(creative)creative.open=true;go('studio','creative-lab','custom-editor');}else go('studio','studio','studio-canvas');});
  $('mission-claim').addEventListener('click',()=>{if(!armed||!active||!missionProgress(active.id,current).complete)return;
    record.completed=[...new Set([...record.completed,active.id])];const stored=save();stamps();$('mission-status').textContent=stored?'这一方蓝，已留下你的印记。去生活展台看看它。':'印记已完成，本次可见；浏览器未能保存手记。';
    const stamp=missions.querySelector(`[data-stamp="${active.id}"]`);stampAnimation?.cancel();if(!quiet())stampAnimation=stamp.animate([{transform:'scale(2.4) rotate(-25deg)',opacity:0},{transform:'scale(.85) rotate(8deg)',opacity:1},{transform:'scale(1) rotate(-8deg)',opacity:1}],{duration:650,easing:'cubic-bezier(.2,.8,.2,1)'});
  });
  $('mission-exit').addEventListener('click',()=>{active=null;armed=false;saveSession();showActive();go('studio','studio','studio-canvas');});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  reduced.addEventListener('change',()=>{if(reduced.matches)stampAnimation?.cancel();});
  window.addEventListener('indigo:quiet',()=>{if(quiet())stampAnimation?.cancel();});
  window.addEventListener('indigo:change',event=>{try{current=validateDocument(event.detail);progress();}catch{}});
  window.addEventListener('indigo:session-reset',()=>{
    stampAnimation?.cancel();stampAnimation=null;
    if(raf){cancelAnimationFrame(raf);raf=0;}
    record={completed:[],visited:[]};active=null;current=null;armed=false;
    local.removeItem(key);session.removeItem(sessionKey);
    state={motif:'lotus',coverage:65,depth:3,bridge:true};
    $('lab-motif').value='lotus';$('lab-coverage').value='65';$('lab-depth').value='3';$('lab-bridge').checked=true;
    labNeedsDraw=true;stamps();showActive();$('mission-status').textContent='';
    $('mission-checks').replaceChildren?.();$('mission-claim').disabled=true;
  });
  window.addEventListener('indigo:scene',event=>{const id=event.detail.id;if(!lab.closest('[hidden]')&&labNeedsDraw)drawLab();if(missions.closest('[hidden]')){stampAnimation?.cancel();stampAnimation=null;}if(['craft','atlas','studio','heritage'].includes(id)){record.visited=[...new Set([...record.visited,id])];save();stamps();}});
  const initialScene=document.documentElement.dataset.scene;if(['craft','atlas','studio','heritage'].includes(initialScene)){record.visited=[...new Set([...record.visited,initialScene])];save();}
  stamps();showActive();window.dispatchEvent(new CustomEvent('indigo:request-state'));
}
