import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, stat, realpath } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { networkInterfaces } from 'node:os';
import { lookup } from 'node:dns/promises';
import { validateExhibitPack, canonicalizeEnvelope } from './lib/exhibit-pack.js';

const ROOT = fileURLToPath(new URL('.',import.meta.url));
const MAX_BODY = 256 * 1024;
const TTL = 24 * 60 * 60 * 1000;
const hash = token => createHash('sha256').update(token).digest('hex');
const loopback = address => address === '::1' || /^127\./.test(address ?? '') || /^::ffff:127\./i.test(address ?? '');
const normalizeAddress = value => value?.replace(/^::ffff:/i,'').split('%')[0];
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon'};

function httpError(status,message) { return Object.assign(new Error(message),{status}); }
async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) throw httpError(415,'请使用 application/json。');
  if (Number(request.headers['content-length']) > MAX_BODY) throw httpError(413,'请求内容超过 256 KiB。');
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY) throw httpError(413,'请求内容超过 256 KiB。'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError(400,'JSON 内容无效。'); }
}
function exactBody(value,key) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value,key)) throw httpError(400,'请求字段无效。');
  return value[key];
}
function send(response,status,value) {
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  response.end(JSON.stringify(value));
}

async function configurePublicUrl(value, host, port) {
  if (!value) return {publicUrl:null,claimReady:false};
  let parsed; try { parsed = new URL(value); } catch { return {publicUrl:null,claimReady:false}; }
  if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return {publicUrl:null,claimReady:false};
  const hostname = parsed.hostname.replace(/^\[|\]$/g,'');
  if (['localhost','0.0.0.0','::'].includes(hostname.toLowerCase()) || loopback(hostname) || host === 'localhost' || loopback(host)) return {publicUrl:parsed.origin,claimReady:false};
  const locals = new Set(Object.values(networkInterfaces()).flat().filter(Boolean).filter(item => !item.internal).map(item => normalizeAddress(item.address)));
  let addresses; try { addresses = await lookup(hostname,{all:true}); } catch { return {publicUrl:parsed.origin,claimReady:false}; }
  const ownAddress = addresses.some(item => locals.has(normalizeAddress(item.address)));
  const bindAllows = host === '0.0.0.0' || host === '::' || addresses.some(item => normalizeAddress(item.address) === normalizeAddress(host));
  const configuredPort = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
  // This HTTP server cannot validate an external reverse proxy: use its actual LAN URL.
  return {publicUrl:parsed.origin,claimReady:ownAddress && bindAllows && parsed.protocol === 'http:' && configuredPort === port};
}

/** Start a local exhibition server. Test seams now()/ttlMs never come from requests. */
export async function createLiubaiServer(options = {}) {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8769;
  const dataDir = resolve(options.data ?? join(ROOT,'data'));
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? TTL;
  await mkdir(dataDir,{recursive:true});
  const db = new DatabaseSync(join(dataDir,'liubai.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS pack_versions (id TEXT NOT NULL, version TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(id,version)); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS artworks (token_hash TEXT PRIMARY KEY, envelope TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS expired_artworks (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);');
  const putPack = db.prepare('INSERT INTO pack_versions (id,version,body) VALUES (?,?,?)');
  for (const filename of ['flowers.json','night.json']) {
    const pack = validateExhibitPack(JSON.parse(await readFile(join(ROOT,'packs',filename),'utf8')));
    if (!db.prepare('SELECT 1 FROM pack_versions WHERE id=? AND version=?').get(pack.id,pack.version)) putPack.run(pack.id,pack.version,JSON.stringify(pack));
  }
  db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('active','flowers@1.0.0')").run();
  const csrfToken = randomBytes(32).toString('hex');
  const cleanup = () => {
    const timestamp = now();
    db.exec('BEGIN');
    try {
      db.prepare('INSERT OR IGNORE INTO expired_artworks SELECT token_hash, expires_at FROM artworks WHERE expires_at <= ?').run(timestamp);
      db.prepare('DELETE FROM artworks WHERE expires_at <= ?').run(timestamp);
      db.prepare('DELETE FROM expired_artworks WHERE expires_at <= ?').run(timestamp - 7 * TTL);
      db.exec('COMMIT');
    } catch(error) { db.exec('ROLLBACK'); throw error; }
  };
  cleanup();
  let publicConfig = {publicUrl:null,claimReady:false};
  let actualPort = port;
  const packByVersion = (id,version) => {
    const row = db.prepare('SELECT body FROM pack_versions WHERE id=? AND version=?').get(id,version);
    return row ? JSON.parse(row.body) : null;
  };
  const activePack = () => {
    const key = db.prepare("SELECT value FROM settings WHERE key='active'").get().value;
    const split = key.lastIndexOf('@');
    return packByVersion(key.slice(0,split),key.slice(split+1));
  };
  const latestPacks = () => {
    const rows = db.prepare('SELECT body FROM pack_versions ORDER BY rowid').all();
    const map = new Map(); for (const row of rows) {const pack = JSON.parse(row.body);map.set(pack.id,pack);}
    return [...map.values()];
  };
  const allowedHostname = hostname => hostname === 'localhost' || loopback(hostname) || hostname === host || (publicConfig.publicUrl && hostname === new URL(publicConfig.publicUrl).hostname.replace(/^\[|\]$/g,''));
  const operator = request => {
    if (!loopback(request.socket.remoteAddress)) return false;
    try { const parsed = new URL(`http://${request.headers.host}`); return !parsed.username && !parsed.password && allowedHostname(parsed.hostname.replace(/^\[|\]$/g,'')) && Number(parsed.port || 80) === actualPort; } catch { return false; }
  };
  function authorize(request,writing = false) {
    if (!operator(request)) throw httpError(403,'此操作仅限本机展台。');
    if (!writing) return;
    const token = request.headers['x-liubai-token'];
    if (typeof token !== 'string' || Buffer.byteLength(token) !== Buffer.byteLength(csrfToken) || !timingSafeEqual(Buffer.from(token),Buffer.from(csrfToken))) throw httpError(403,'展台令牌无效，请刷新页面。');
    const origin = request.headers.origin;
    // CLI clients may omit Origin; browser writes must match the exact Host origin.
    if (origin !== undefined && origin !== `http://${request.headers.host}`) throw httpError(403,'请求来源与展台不一致。');
    if (request.headers['sec-fetch-site'] === 'cross-site') throw httpError(403,'拒绝跨站请求。');
  }
  const server = http.createServer(async (request,response) => {
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Cross-Origin-Resource-Policy','same-origin');
    response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const url = new URL(request.url,'http://liubai.invalid');
      const path = decodeURIComponent(url.pathname);
      if (path.startsWith('/api/')) {
        response.setHeader('Cache-Control','no-store');
        if (request.method === 'GET' && path === '/api/bootstrap') {
          const isOperator = operator(request);
          return send(response,200,{operator:isOperator,...(isOperator ? {csrfToken} : {}),...publicConfig,activePack:activePack()});
        }
        if (request.method === 'GET' && path === '/api/exhibit') return send(response,200,{activePack:activePack()});
        if (request.method === 'GET' && path === '/api/packs') {authorize(request);const current = activePack();return send(response,200,{packs:latestPacks(),activeId:current.id,activeVersion:current.version});}
        if (request.method === 'POST' && path === '/api/packs') {
          authorize(request,true);
          const pack = validateExhibitPack(exactBody(await readJson(request),'pack'));
          const existing = packByVersion(pack.id,pack.version);
          if (existing && JSON.stringify(existing) !== JSON.stringify(pack)) throw httpError(409,'相同版本已存在，请为修改后的展包增加版本号。');
          if (!existing) putPack.run(pack.id,pack.version,JSON.stringify(pack));
          return send(response,200,{pack});
        }
        if (request.method === 'POST' && path === '/api/activate') {
          authorize(request,true);
          const id = exactBody(await readJson(request),'id');
          const pack = latestPacks().find(item => item.id === id);
          if (!pack) throw httpError(404,'展包不存在。');
          db.prepare("UPDATE settings SET value=? WHERE key='active'").run(`${pack.id}@${pack.version}`);
          return send(response,200,{activePack:pack});
        }
        if (request.method === 'POST' && path === '/api/artworks') {
          authorize(request,true);
          if (!publicConfig.claimReady) throw httpError(503,'尚未配置可用的局域网领取地址。');
          const input = exactBody(await readJson(request),'envelope');
          const pack = input?.exhibit && packByVersion(input.exhibit.id,input.exhibit.version);
          if (!pack) throw httpError(400,'展包版本不存在。');
          const envelope = canonicalizeEnvelope(input,pack);
          const token = randomBytes(32).toString('hex');
          const createdAt = now(), expiresAt = createdAt + ttlMs;
          db.prepare('INSERT INTO artworks VALUES (?,?,?,?)').run(hash(token),JSON.stringify(envelope),createdAt,expiresAt);
          return send(response,201,{claimUrl:`${publicConfig.publicUrl}/claim.html#${token}`,expiresAt:new Date(expiresAt).toISOString(),token});
        }
        const claim = /^\/api\/artworks\/([a-f0-9]{64})$/.exec(path);
        if (request.method === 'GET' && claim) {
          const tokenHash = hash(claim[1]);
          const row = db.prepare('SELECT envelope,created_at,expires_at FROM artworks WHERE token_hash=?').get(tokenHash);
          if (row?.expires_at <= now()) {cleanup();throw httpError(410,'这份作品的领取时间已结束。');}
          if (!row) {
            const expired = db.prepare('SELECT 1 FROM expired_artworks WHERE token_hash=?').get(tokenHash);
            throw httpError(expired ? 410 : 404,expired ? '这份作品的领取时间已结束。' : '未找到这份作品。');
          }
          return send(response,200,{envelope:JSON.parse(row.envelope),createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString()});
        }
        throw httpError(404,'接口不存在。');
      }
      if (!['GET','HEAD'].includes(request.method)) throw httpError(405,'仅支持读取此资源。');
      let file;
      if (path === '/lib/exhibit-pack.js') file = join(ROOT,'lib','exhibit-pack.js');
      else if (path === '/site/engine.js') file = join(ROOT,'site','engine.js');
      else {
        if (path.startsWith('/lib/') || path.startsWith('/packs/') || path.startsWith('/data/') || path.includes('\0') || path.includes('\\')) throw httpError(404,'资源不存在。');
        const siteRoot = join(ROOT,'site');
        file = resolve(siteRoot,`.${path === '/' ? '/index.html' : path}`);
        if (!file.startsWith(siteRoot + sep) || /(?:^|[/\\])\./.test(path) || /(?:\.test\.mjs|README\.md)$/i.test(file)) throw httpError(404,'资源不存在。');
        const real = await realpath(file);
        if (!real.startsWith((await realpath(siteRoot)) + sep)) throw httpError(404,'资源不存在。');
      }
      const info = await stat(file); if (!info.isFile()) throw httpError(404,'资源不存在。');
      response.writeHead(200,{'Content-Type':mime[extname(file).toLowerCase()] ?? 'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store'});
      response.end(request.method === 'HEAD' ? undefined : await readFile(file));
    } catch(error) {
      if (response.headersSent) {response.end();return;}
      const status = error.status ?? (['ENOENT','ENOTDIR'].includes(error.code) ? 404 : error.code?.startsWith('ERR_SQLITE') ? 500 : 400);
      send(response,status,{error:status === 500 ? '服务暂时无法完成操作。' : error.message});
    }
  });
  await new Promise((accept,reject) => {server.once('error',reject);server.listen(port,host,accept);});
  actualPort = server.address().port;
  publicConfig = await configurePublicUrl(options.publicUrl,host,actualPort);
  const interval = setInterval(cleanup,options.cleanupIntervalMs ?? 60_000);interval.unref();
  return {server,port:actualPort,host,dataDir,get publicUrl(){return publicConfig.publicUrl;},get claimReady(){return publicConfig.claimReady;},cleanup,async close(){clearInterval(interval);await new Promise((accept,reject) => server.close(error => error ? reject(error) : accept()));db.close();}};
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index],value = argv[index+1];
    if (!['--host','--port','--public-url','--data'].includes(flag) || value === undefined) throw new Error('用法: node server.mjs --host 0.0.0.0 --port 8769 --public-url http://局域网地址:8769 --data ./data');
    options[{'--host':'host','--port':'port','--public-url':'publicUrl','--data':'data'}[flag]] = flag === '--port' ? Number(value) : value;
  }
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)) throw new Error('端口无效。');
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const instance = await createLiubaiServer(parseArgs(process.argv.slice(2)));
    console.log(`留白展台已启动：http://localhost:${instance.port}`);
    console.log(instance.claimReady ? `手机领取地址：${instance.publicUrl}` : '手机领取尚未就绪：请提供本机可访问的局域网 HTTP 地址。');
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async () => {await instance.close();process.exit(0);});
  } catch(error) {console.error(`启动失败：${error.message}`);process.exitCode = 1;}
}
