import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument,createMask,coatAll } from './engine.js';
import { experimentDocument,missionProgress,readMissionSession } from './exploration-model.js';
import * as engine from './engine.js';
import * as model from './exploration-model.js';
import { getVisitorSession } from './visitor-session.js';
import fs from 'node:fs';
import vm from 'node:vm';
test('experiment sweep changes coverage rather than recolouring white pixels',()=>{const a=experimentDocument({coverage:0}),b=experimentDocument({coverage:50}),c=experimentDocument({coverage:100});assert.equal(a.coverage.reduce((x,y)=>x+y),0);assert.ok(b.coverage.some(Boolean));assert.ok(c.coverage.reduce((x,y)=>x+y)>b.coverage.reduce((x,y)=>x+y));for(let i=0;i<b.coverage.length;i++)if(i%b.size>=120)assert.equal(b.coverage[i],0);});
test('missions require actual completed design and exact choices',()=>{const d=createDocument();d.motif='lotus';d.repeat='staggered';coatAll(d,createMask(d));assert.equal(missionProgress('rhythm',d).complete,false);d.stage='reveal';assert.equal(missionProgress('rhythm',d).complete,true);d.repeat='straight';assert.equal(missionProgress('rhythm',d).complete,false);assert.equal(missionProgress('unknown',d).complete,false);});
test('partial paste challenge rejects empty and complete cloth',()=>{assert.equal(missionProgress('breath',experimentDocument({coverage:0})).complete,false);assert.equal(missionProgress('breath',experimentDocument({coverage:100})).complete,false);assert.equal(missionProgress('breath',experimentDocument({coverage:40})).complete,true);});

test('signature requires changed cells, real paste and reveal; recipe mission requires every choice',()=>{
  const d=createDocument();d.motif='custom';coatAll(d,createMask(d));d.stage='reveal';
  assert.equal(missionProgress('signature',d).complete,false);
  d.customPattern[0]=1;coatAll(d,createMask(d));assert.equal(missionProgress('signature',d).complete,true);
  d.coverage.fill(0);assert.equal(missionProgress('signature',d).complete,false);
  d.motif='wave';d.dyePalette='midnight';d.dyeDepth=5;coatAll(d,createMask(d));assert.equal(missionProgress('night',d).complete,true);
  d.dyeDepth=4;assert.equal(missionProgress('night',d).complete,false);
});

test('session restoration accepts a known mission and an explicit armed boolean only',()=>{
  assert.deepEqual(readMissionSession({id:'breath',armed:true}),{id:'breath',armed:true});
  assert.deepEqual(readMissionSession({id:'night',armed:'true'}),{id:'night',armed:false});
  for(const value of [null,[],{}, {id:'__proto__',armed:true}])assert.equal(readMissionSession(value),null);
});

const explorationSource=fs.readFileSync(new URL('./exploration.js',import.meta.url),'utf8')
  .replace(/^import .*?;\r?\n/gm,'').replace('export function initExploration','function initExploration');
const storageKey='indigo.exploration.v1';
function bootExploration({local=new Map(),session=new Map(),doc=createDocument(),rejectNew=false}={}){
  const ids=new Map(),nodes=[],raf=new Map();let rafId=0, latest=doc;
  class Element{
    constructor(tag='div'){this.tag=tag;this.dataset={};this.listeners=new Map();this.attributes={};this.hidden=false;this.disabled=false;this.width=this.height=480;this.value='';this.checked=false;this.textContent='';this.classList={toggle(){}};}
    addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);}
    dispatchEvent(event){event.target=this;for(const fn of this.listeners.get(event.type)||[])fn(event);return !event.defaultPrevented;}
    fire(type){return this.dispatchEvent(new Event(type));}
    set innerHTML(value){this._html=value;for(const match of value.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/g)){const attrs=match[2],id=attrs.match(/\bid="([^"]+)"/)?.[1],mission=attrs.match(/data-mission="([^"]+)"/)?.[1],stamp=attrs.match(/data-stamp="([^"]+)"/)?.[1];if(!id&&!mission&&!stamp)continue;const e=new Element(match[1]);if(id)ids.set(id,e);if(mission)e.dataset.mission=mission;if(stamp)e.dataset.stamp=stamp;e.value=attrs.match(/\bvalue="([^"]*)"/)?.[1]||'';e.checked=attrs.includes('checked');nodes.push(e);}}
    get innerHTML(){return this._html;}
    querySelectorAll(selector){if(selector==='[data-mission]')return nodes.filter(n=>n.dataset.mission);return [];}
    querySelector(selector){const m=selector.match(/\[data-(mission|stamp)="([^"]+)"\]/);return m?nodes.find(n=>n.dataset[m[1]]===m[2]):null;}
    setAttribute(name,value){this.attributes[name]=value;}getAttribute(name){return this.attributes[name];}
    closest(selector){return selector==='[hidden]'&&this.hidden?this:null;}
    scrollIntoView(){}focus(){this.focused=true;}animate(){return{cancel(){}};}
    getContext(){return{putImageData(){}};}
  }
  class Event{constructor(type,options={}){this.type=type;this.detail=options.detail;this.cancelable=options.cancelable;this.defaultPrevented=false;}preventDefault(){if(this.cancelable)this.defaultPrevented=true;}}
  for(const id of ['experiments','missions','creative-lab'])ids.set(id,new Element());
  const window=new Element('window'),store=map=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
  window.location={search:'?mode=personal'};window.localStorage=store(local);window.sessionStorage=store(session);
  const emitted=[],navigations=[];
  window.addEventListener('indigo:navigate',event=>navigations.push(event.detail));
  window.addEventListener('indigo:request-state',()=>window.dispatchEvent(new Event('indigo:change',{detail:engine.serializeDocument(latest)})));
  window.addEventListener('indigo:new-pattern',event=>{emitted.push(event.detail);if(rejectNew)event.preventDefault();});
  const context=vm.createContext({...engine,...model,getVisitorSession,console,window,sessionStorage:store(session),localStorage:store(local),document:{getElementById:id=>ids.get(id),documentElement:{dataset:{scene:'studio'},classList:{contains:()=>true}}},matchMedia:()=>({matches:true,addEventListener(){}}),CustomEvent:Event,ImageData:class{},requestAnimationFrame:fn=>{raf.set(++rafId,fn);return rafId;},cancelAnimationFrame:id=>raf.delete(id)});
  vm.runInContext(explorationSource+'\ninitExploration();',context);
  ids.get('lab-motif').value='lotus';
  return{ids,emitted,navigations,local,session,reset(){window.dispatchEvent(new Event('indigo:session-reset',{detail:{sessionId:'next'}}));},click:id=>ids.get(id).fire('click'),select:id=>nodes.find(n=>n.dataset.mission===id).fire('click'),update(value){latest=value;window.dispatchEvent(new Event('indigo:change',{detail:engine.serializeDocument(value)}));},newPattern(){window.dispatchEvent(new Event('indigo:new-pattern',{cancelable:true,detail:{motif:'lotus'}}));},input(id,value){ids.get(id).value=value;ids.get(id).fire('input');},pending:()=>raf.size};
}

test('use experiment reads the latest controls even before the scheduled redraw',()=>{
  const h=bootExploration();h.input('lab-depth','5');h.input('lab-motif','wave');assert.equal(h.pending(),1);h.click('lab-use');
  assert.equal(h.pending(),0);assert.equal(h.emitted[0].motif,'wave');assert.equal(h.emitted[0].dyeDepth,5);
});

test('active commission survives refresh and repeated selection without awarding until explicit valid claim',()=>{
  const h=bootExploration();h.select('breath');h.click('mission-start');
  const completed=experimentDocument({motif:'sprig',coverage:40});h.update(completed);assert.equal(h.ids.get('mission-claim').disabled,false);
  h.select('breath');assert.equal(h.ids.get('mission-claim').disabled,false);
  const resumed=bootExploration({local:h.local,session:h.session,doc:completed});
  assert.equal(resumed.ids.get('mission-active').hidden,false);assert.equal(resumed.ids.get('mission-claim').disabled,false);
  assert.deepEqual(JSON.parse(resumed.local.get(storageKey)).completed,[]);
  resumed.click('mission-claim');assert.deepEqual(JSON.parse(resumed.local.get(storageKey)).completed,['breath']);
  resumed.click('mission-claim');assert.deepEqual(JSON.parse(resumed.local.get(storageKey)).completed,['breath']);
});

test('new work cannot claim prematurely, undo can restore eligibility, and exit preserves the work',()=>{
  const doc=experimentDocument({motif:'sprig',coverage:40}),h=bootExploration({doc});h.select('breath');h.click('mission-start');h.update(doc);
  assert.equal(h.ids.get('mission-claim').disabled,false);h.newPattern();h.update(createDocument());assert.equal(h.ids.get('mission-claim').disabled,true);
  h.click('mission-claim');assert.deepEqual(JSON.parse(h.local.get(storageKey)).completed,[]);
  h.update(doc);assert.equal(h.ids.get('mission-claim').disabled,false);
  const beforeExit=engine.serializeDocument(doc), createdBeforeExit=h.emitted.length;
  h.click('mission-exit');assert.equal(h.ids.get('mission-active').hidden,true);assert.equal(h.session.has(`${storageKey}.active`),false);
  assert.deepEqual({...h.navigations.at(-1)},{id:'studio',anchor:'studio',focus:'studio-canvas'});
  assert.equal(h.emitted.length,createdBeforeExit);assert.deepEqual(engine.serializeDocument(doc),beforeExit);
  assert.equal(doc.stage,'reveal');assert.equal(missionProgress('breath',doc).complete,true);
});

test('rejected new-work event does not arm or overwrite an active commission session',()=>{
  const h=bootExploration({rejectNew:true,doc:experimentDocument({coverage:40})});h.select('breath');h.click('mission-start');
  assert.equal(h.ids.get('mission-claim').disabled,true);assert.equal(JSON.parse(h.session.get(`${storageKey}.active`)).armed,false);
});

test('visitor reset removes earned stamps and active commission and cancels pending experiment work',()=>{
  const h=bootExploration();h.select('breath');h.click('mission-start');h.update(experimentDocument({motif:'sprig',coverage:40}));h.click('mission-claim');
  assert.deepEqual(JSON.parse(h.local.get(storageKey)).completed,['breath']);
  h.input('lab-depth','5');assert.equal(h.pending(),1);h.reset();
  assert.equal(h.local.has(storageKey),false);assert.equal(h.session.has(`${storageKey}.active`),false);
  assert.equal(h.ids.get('mission-active').hidden,true);assert.equal(h.ids.get('mission-claim').disabled,true);
  assert.equal(h.pending(),0);assert.equal(h.ids.get('lab-depth').value,'3');
  h.click('mission-claim');assert.equal(h.local.has(storageKey),false);
});
