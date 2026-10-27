import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitorSession, getVisitorSession, resolveVisitorMode } from './visitor-session.js';
const store = values => ({ getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,value), removeItem:key=>values.delete(key) });

test('only explicit personal mode persists; public exhibits default to kiosk', () => {
  assert.equal(resolveVisitorMode(''), 'kiosk');
  assert.equal(resolveVisitorMode('?mode=kiosk', 'personal'), 'kiosk');
  assert.equal(resolveVisitorMode('?other=1&mode=personal'), 'personal');
  assert.equal(resolveVisitorMode('?mode=unknown'), 'kiosk');
});
test('public visitor storage ignores previous browser work and resets without clearing unrelated data', () => {
  const previous=new Map([['yifanglan.draft.v1','previous'],['venue-config','kept']]);
  const visitor=createVisitorSession({persistent:store(previous)});
  assert.equal(visitor.storage.getItem('yifanglan.draft.v1'),null);
  visitor.storage.setItem('work','A');visitor.transient.setItem('mission','A');
  const ticket=visitor.generation;visitor.reset('visitor_B');
  assert.equal(visitor.storage.getItem('work'),null);assert.equal(visitor.transient.getItem('mission'),null);
  assert.equal(visitor.isCurrent(ticket),false);assert.equal(previous.get('yifanglan.draft.v1'),'previous');assert.equal(previous.get('venue-config'),'kept');
});
test('personal work persists and replacing async generation does not delete saved collection', () => {
  const values=new Map();const visitor=createVisitorSession({mode:'personal',persistent:store(values)});
  visitor.storage.setItem('yifanglan.collection.v1','saved');const ticket=visitor.generation;visitor.invalidate();
  assert.equal(values.get('yifanglan.collection.v1'),'saved');assert.equal(visitor.isCurrent(ticket),false);
});
test('one host shares one visitor boundary, including when persistent storage throws', () => {
  const host={location:{search:''},get localStorage(){throw new Error('denied');}};
  const a=getVisitorSession(host),b=getVisitorSession(host);assert.equal(a,b);
  a.storage.setItem('work','safe');assert.equal(b.storage.getItem('work'),'safe');
  assert.throws(()=>a.reset('../other'));assert.equal(a.storage.getItem('work'),'safe');
});
