import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { networkInterfaces } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createLiubaiServer } from '../server.mjs';
import { createPreset } from '../lib/exhibit-pack.js';
import { createMask } from '../site/engine.js';

const lan = Object.values(networkInterfaces()).flat().find(item => !item.internal && item.family === 'IPv4')?.address;
async function availablePort() {
  const server = net.createServer();await new Promise(resolve => server.listen(0,'0.0.0.0',resolve));
  const port = server.address().port;await new Promise(resolve => server.close(resolve));return port;
}
async function fixture(t,{ready = true,...options} = {}) {
  const data = await mkdtemp(fileURLToPath(new URL('./.server-test-',import.meta.url)));
  const port = await availablePort();
  let app = await createLiubaiServer({host:'0.0.0.0',port,data,...(ready && lan ? {publicUrl:`http://${lan}:${port}`} : {}),...options});
  t.after(async () => {if (app) await app.close();await rm(data,{recursive:true,force:true});});
  return {get app(){return app;},port,data,async restart(extra = {}) {await app.close();app = await createLiubaiServer({host:'0.0.0.0',port,data,...(ready && lan ? {publicUrl:`http://${lan}:${port}`} : {}),...options,...extra});}};
}
function request(port,path,{method = 'GET',headers = {},body,hostname = '127.0.0.1'} = {}) {
  return new Promise((resolve,reject) => {
    const data = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({hostname,port,path,method,headers:{...(data !== undefined ? {'content-type':'application/json','content-length':Buffer.byteLength(data)} : {}),...headers}},res => {
      const parts = [];res.on('data',chunk => parts.push(chunk));res.on('end',() => {const text = Buffer.concat(parts).toString();let json;try {json = JSON.parse(text);} catch {}resolve({status:res.statusCode,headers:res.headers,json,text});});
    });req.on('error',reject);if (data !== undefined) req.write(data);req.end();
  });
}
async function bootstrap(port) {const result = await request(port,'/api/bootstrap');assert.equal(result.status,200);return result.json;}
function envelope(pack) {
  const choice = pack.choices[0],design = createPreset(pack,choice.id);design.coverage = [...createMask(design)];design.stage = 'reveal';
  return {schemaVersion:1,design,exhibit:{id:pack.id,version:pack.version,title:pack.title,venue:pack.venue},choice:{id:choice.id,title:choice.title},card:structuredClone(pack.card),sessionId:'server-test-session'};
}
function writeHeaders(port,csrfToken) {return {'X-Liubai-Token':csrfToken,Origin:`http://127.0.0.1:${port}`};}
function storedCounts(data) {
  const database = new DatabaseSync(`${data}/liubai.sqlite`,{readOnly:true});
  try {return {artworks:database.prepare('SELECT count(*) AS n FROM artworks').get().n,expired:database.prepare('SELECT count(*) AS n FROM expired_artworks').get().n};}
  finally {database.close();}
}

test('operator token and writes require loopback, allowed Host, CSRF and matching Origin',async t => {
  const f = await fixture(t), info = await bootstrap(f.port);
  assert.equal(info.operator,true);assert.match(info.csrfToken,/^[a-f0-9]{64}$/);
  const evil = await request(f.port,'/api/bootstrap',{headers:{Host:`evil.test:${f.port}`}});
  assert.equal(evil.json.operator,false);assert.ok(!('csrfToken' in evil.json));
  assert.equal((await request(f.port,'/api/packs',{headers:{Host:`evil.test:${f.port}`}})).status,403);
  const body = {id:'night'};
  assert.equal((await request(f.port,'/api/activate',{method:'POST',body})).status,403);
  assert.equal((await request(f.port,'/api/activate',{method:'POST',headers:{...writeHeaders(f.port,info.csrfToken),Origin:'https://evil.test'},body})).status,403);
  assert.equal((await request(f.port,'/api/activate',{method:'POST',headers:{...writeHeaders(f.port,info.csrfToken),'Sec-Fetch-Site':'cross-site'},body})).status,403);
  assert.equal((await request(f.port,'/api/activate',{method:'POST',headers:{...writeHeaders(f.port,info.csrfToken),'X-Liubai-Token':'é'.repeat(64)},body})).status,403);
  assert.equal((await request(f.port,'/api/activate',{method:'POST',headers:writeHeaders(f.port,info.csrfToken),body})).status,200);
  if (lan) {
    const remote = await request(f.port,'/api/bootstrap',{hostname:lan});
    assert.equal(remote.json.operator,false);assert.ok(!('csrfToken' in remote.json));
    assert.equal((await request(f.port,'/api/packs',{hostname:lan})).status,403);
    assert.equal((await request(f.port,'/api/activate',{hostname:lan,method:'POST',headers:writeHeaders(f.port,info.csrfToken),body})).status,403);
  }
});

test('pack updates are immutable by version, validate before save and retain the active version',async t => {
  const f = await fixture(t), info = await bootstrap(f.port),headers = writeHeaders(f.port,info.csrfToken);
  let result = await request(f.port,'/api/packs');assert.equal(result.json.packs.length,2);assert.equal(result.json.activeVersion,'1.0.0');
  const invalid = structuredClone(info.activePack);invalid.choices[0].preset.spacing = 1;
  assert.equal((await request(f.port,'/api/packs',{method:'POST',headers,body:{pack:invalid}})).status,400);
  assert.deepEqual((await bootstrap(f.port)).activePack,info.activePack);
  assert.equal((await request(f.port,'/api/activate',{method:'POST',headers,body:{id:'missing-pack'}})).status,404);
  assert.deepEqual((await bootstrap(f.port)).activePack,info.activePack);
  const update = structuredClone(info.activePack);update.title = '新花展';
  assert.equal((await request(f.port,'/api/packs',{method:'POST',headers,body:{pack:update}})).status,409);
  update.version = '1.1.0';
  assert.equal((await request(f.port,'/api/packs',{method:'POST',headers,body:{pack:update}})).status,200);
  assert.equal((await bootstrap(f.port)).activePack.title,info.activePack.title);
  result = await request(f.port,'/api/activate',{method:'POST',headers,body:{id:update.id}});assert.equal(result.json.activePack.version,'1.1.0');
  await f.restart();const restarted = await bootstrap(f.port);assert.equal(restarted.activePack.title,'新花展');
  assert.notEqual(restarted.csrfToken,info.csrfToken);
  assert.equal((await request(f.port,'/api/activate',{method:'POST',headers,body:{id:'night'}})).status,403);
  assert.equal((await request(f.port,'/api/activate',{method:'POST',headers:{'X-Liubai-Token':restarted.csrfToken},body:{id:'night'}})).status,200);
});

test('missing, loopback and unreachable public URL disable creation without localhost fallback',async t => {
  for (const publicUrl of [undefined,'http://localhost:8769','http://192.0.2.55:8769','javascript:alert(1)']) {
    const f = await fixture(t,{ready:false,publicUrl}),info = await bootstrap(f.port);
    assert.equal(info.claimReady,false);
    const result = await request(f.port,'/api/artworks',{method:'POST',headers:writeHeaders(f.port,info.csrfToken),body:{envelope:envelope(info.activePack)}});
    assert.equal(result.status,503);assert.ok(!result.json.claimUrl);
  }
});

test('claim snapshot is canonical, repeatable, survives restart and old pack sessions', {skip:!lan},async t => {
  const f = await fixture(t),info = await bootstrap(f.port);assert.equal(info.claimReady,true);
  const input = envelope(info.activePack);input.card.headline = 'Untrusted';input.choice.title = 'Untrusted';input.exhibit.title = 'Untrusted';
  const updated = structuredClone(info.activePack);updated.version = '2.0.0';updated.title = 'New title';updated.card.headline = 'New headline';
  const headers = writeHeaders(f.port,info.csrfToken);
  await request(f.port,'/api/packs',{method:'POST',headers,body:{pack:updated}});
  await request(f.port,'/api/activate',{method:'POST',headers,body:{id:updated.id}});
  const created = await request(f.port,'/api/artworks',{method:'POST',headers,body:{envelope:input}});
  assert.equal(created.status,201);assert.match(created.json.token,/^[a-f0-9]{64}$/);
  assert.equal(created.json.claimUrl,`http://${lan}:${f.port}/claim.html#${created.json.token}`);
  const path = `/api/artworks/${created.json.token}`;
  const first = await request(f.port,path,{hostname:lan});
  assert.equal(first.status,200);assert.equal(first.json.envelope.card.headline,info.activePack.card.headline);assert.equal(first.json.envelope.exhibit.title,info.activePack.title);
  assert.deepEqual((await request(f.port,path)).json,first.json);assert.equal(first.headers['cache-control'],'no-store');
  await f.restart();assert.deepEqual((await request(f.port,path)).json,first.json);
  assert.equal((await request(f.port,`/api/artworks/${'a'.repeat(64)}`)).status,404);
  const bytes = await readFile(`${f.data}/liubai.sqlite`);assert.ok(!bytes.includes(Buffer.from(created.json.token)));
});

test('TTL is checked on read and purged at restart with a bounded expired-token tombstone',{skip:!lan},async t => {
  let clock = 1_800_000_000_000;
  const f = await fixture(t,{now:() => clock,ttlMs:100}),info = await bootstrap(f.port);
  const created = await request(f.port,'/api/artworks',{method:'POST',headers:writeHeaders(f.port,info.csrfToken),body:{envelope:envelope(info.activePack)}});
  const path = `/api/artworks/${created.json.token}`;assert.equal(created.status,201);
  clock += 101;assert.equal((await request(f.port,path)).status,410);
  assert.deepEqual(storedCounts(f.data),{artworks:0,expired:1});
  const next = await request(f.port,'/api/artworks',{method:'POST',headers:writeHeaders(f.port,info.csrfToken),body:{envelope:envelope(info.activePack)}});
  assert.equal(next.status,201);clock += 101;
  // No expired GET or manual cleanup occurs before restart: startup must purge it.
  await f.restart();assert.deepEqual(storedCounts(f.data),{artworks:0,expired:2});
  assert.equal((await request(f.port,path)).status,410);
  assert.equal((await request(f.port,`/api/artworks/${next.json.token}`)).status,410);
});

test('scheduled expiry removes snapshots without a claim read',{skip:!lan},async t => {
  let clock = 1_800_000_000_000;
  const f = await fixture(t,{now:() => clock,ttlMs:100,cleanupIntervalMs:20}),info = await bootstrap(f.port);
  const created = await request(f.port,'/api/artworks',{method:'POST',headers:writeHeaders(f.port,info.csrfToken),body:{envelope:envelope(info.activePack)}});
  assert.equal(created.status,201);assert.equal(storedCounts(f.data).artworks,1);clock += 101;
  const deadline = Date.now() + 1000;
  while (storedCounts(f.data).artworks && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve,10));
  assert.deepEqual(storedCounts(f.data),{artworks:0,expired:1});
});

test('malformed requests and incomplete or tampered artworks preserve active configuration and stored work',{skip:!lan},async t => {
  const f = await fixture(t),info = await bootstrap(f.port),headers = writeHeaders(f.port,info.csrfToken);
  assert.equal((await request(f.port,'/api/packs',{method:'POST',headers,body:'{'})).status,400);
  assert.equal((await request(f.port,'/api/packs',{method:'POST',headers:{...headers,'content-type':'text/plain'},body:'{}'})).status,415);
  assert.equal((await request(f.port,'/api/activate',{method:'POST',headers,body:{id:'night',extra:true}})).status,400);
  const mutations = [
    data => data.design.stage = 'dye',
    data => data.design.coverage.fill(0),
    data => data.exhibit.version = 'not-saved',
    data => data.choice.id = 'not-here',
    data => data.design.seed++,
    data => data.completed = true
  ];
  for (const mutate of mutations) {
    const data = envelope(info.activePack);mutate(data);
    assert.equal((await request(f.port,'/api/artworks',{method:'POST',headers,body:{envelope:data}})).status,400);
  }
  const ready = envelope(info.activePack);
  assert.equal((await request(f.port,'/api/artworks',{method:'POST',headers:{...headers,Origin:'null'},body:{envelope:ready}})).status,403);
  assert.equal(storedCounts(f.data).artworks,0);
  assert.deepEqual((await bootstrap(f.port)).activePack,info.activePack);
  assert.equal((await request(f.port,'/api/packs')).json.packs.length,2);
});

test('API rejects oversized bodies and static serving exposes only public site and shared module',async t => {
  const f = await fixture(t), info = await bootstrap(f.port),headers = writeHeaders(f.port,info.csrfToken);
  assert.equal((await request(f.port,'/api/packs',{method:'POST',headers,body:' '.repeat(256*1024+1)})).status,413);
  for (const path of ['/server.mjs','/package.json','/packs/night.json','/data/liubai.sqlite','/lib/secret.js','/engine.test.mjs','/README.md','/%2e%2e%2fserver.mjs']) assert.equal((await request(f.port,path)).status,404,path);
  for (const path of ['/','/engine.js','/site/engine.js','/lib/exhibit-pack.js']) assert.equal((await request(f.port,path)).status,200,path);
  assert.equal((await request(f.port,'/api/exhibit',{headers:{Host:'visitor.invalid'}})).json.activePack.id,'flowers');
});
