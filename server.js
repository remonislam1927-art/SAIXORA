'use strict';

/**
 * SAIXORA private school downloads.
 * Node 20+ built-ins only. Serve this server behind HTTPS in production.
 * Never deploy private/downloads to public static hosting.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream');

const ROOT = __dirname;
const PUBLIC = ROOT;
const PRIVATE = path.join(ROOT, 'private', 'downloads');
const PORT = Number(process.env.PORT || 8000);
const PRODUCTION = process.env.NODE_ENV === 'production';
const PIN = process.env.NOVA_DOWNLOAD_PIN || '';
const SECRET = process.env.NOVA_SESSION_SECRET || (PRODUCTION ? '' : crypto.randomBytes(40).toString('hex'));
const SESSION_SECONDS = 15 * 60;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const COOKIE_NAME = PRODUCTION ? '__Host-nova_access' : 'nova_access';
const failures = new Map();

if (PRODUCTION && (!PIN || SECRET.length < 32)) {
  console.error('Set NOVA_DOWNLOAD_PIN and a random NOVA_SESSION_SECRET (at least 32 characters) before production starts.');
  process.exit(1);
}

if (!PIN) console.warn('NOVA_DOWNLOAD_PIN is not configured: downloads are disabled.');

const releases = Object.freeze({
  windows: { file: 'Secure-Nova-Setup.exe', name: 'Secure Nova PC' },
  teachers: { file: 'N-Teachers.apk', name: 'N.Teachers' },
  admin: { file: 'N-Admin.apk', name: 'N.Admin' }
});
const publicDocuments = new Set(['index.html', 'main.html', 'contact.html', 'privacy.html', 'terms.html', 'nova-download.html', 'styles.css', 'main.css', 'script.js', 'site.js', 'config.js', 'nova-download.js']);
const assetTypes = Object.freeze({ '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.woff2':'font/woff2' });
const documentTypes = Object.freeze({ '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' });

function json(res, status, data, headers={}) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...headers });
  res.end(JSON.stringify(data));
}
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return req.headers['sec-fetch-site'] !== 'cross-site';
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function cookies(req) {
  const result = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index > -1) result[part.slice(0,index).trim()] = part.slice(index+1).trim();
  }
  return result;
}
function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('hex');
}
function validSession(req) {
  if (!PIN || !SECRET) return false;
  const cookie = cookies(req)[COOKIE_NAME] || '';
  const match = /^([0-9]{10,13})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(cookie);
  if (!match) return false;
  const created = Number(match[1]);
  if (!Number.isFinite(created) || created > Date.now() + 30000 || Date.now() - created > SESSION_SECONDS * 1000) return false;
  const body = `${match[1]}.${match[2]}`;
  return crypto.timingSafeEqual(Buffer.from(sign(body),'hex'), Buffer.from(match[3],'hex'));
}
function sessionCookie(value, clear=false) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${PRODUCTION ? '; Secure' : ''}`;
}
function isAvailable(id) {
  const meta = releases[id];
  if (!meta) return false;
  try {
    const filename = path.join(PRIVATE, meta.file);
    const info = fs.lstatSync(filename);
    return info.isFile() && !info.isSymbolicLink() && info.size > 0;
  } catch { return false; }
}
function clientKey(req) { return req.socket.remoteAddress || 'unknown'; }
function attemptState(key) {
  const now = Date.now();
  if (failures.size > 2500) {
    for (const [addr, entry] of failures) if (now > entry.until) failures.delete(addr);
  }
  let entry = failures.get(key);
  if (!entry || now > entry.until) { entry = {count:0,until:now+WINDOW_MS}; failures.set(key,entry); }
  return entry;
}
async function readJSON(req) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw Object.assign(new Error('JSON required'), {status:415});
  let content = '';
  for await (const chunk of req) {
    content += chunk.toString('utf8');
    if (Buffer.byteLength(content, 'utf8') > 1024) throw Object.assign(new Error('Request too large'), {status:413});
  }
  try { return JSON.parse(content); } catch { throw Object.assign(new Error('Invalid JSON'), {status:400}); }
}

async function api(req,res,pathname) {
  if (pathname === '/api/nova/session' && req.method === 'GET') return json(res,200,{authenticated:validSession(req)});
  if (pathname === '/api/nova/unlock' && req.method === 'POST') {
    if (!checkOrigin(req)) return json(res,403,{error:'Origin not allowed'});
    if (!PIN) return json(res,503,{error:'School downloads not configured'});
    const key = clientKey(req);
    const state = attemptState(key);
    if (state.count >= MAX_FAILURES) return json(res,429,{error:'Too many attempts'}, {'Retry-After':String(Math.ceil((state.until-Date.now())/1000))});
    let payload;
    try { payload = await readJSON(req); } catch(err) {return json(res,err.status||400,{error:'Invalid request'});}
    if (typeof payload.pin !== 'string' || Buffer.byteLength(payload.pin,'utf8') > 128) return json(res,400,{error:'Invalid PIN format'});
    // Compare fixed-length derived values to avoid early-return string comparisons.
    const expected = crypto.scryptSync(PIN,'saixora-school-download-v1',32);
    const entered = crypto.scryptSync(payload.pin,'saixora-school-download-v1',32);
    if (!crypto.timingSafeEqual(expected,entered)) {
      state.count += 1;
      return json(res,401,{error:'Invalid PIN'});
    }
    failures.delete(key);
    const body = `${Date.now()}.${crypto.randomBytes(16).toString('hex')}`;
    return json(res,200,{authenticated:true},{'Set-Cookie':sessionCookie(`${body}.${sign(body)}`)});
  }
  if (pathname === '/api/nova/logout' && req.method === 'POST') {
    if (!checkOrigin(req)) return json(res,403,{error:'Origin not allowed'});
    return json(res,200,{authenticated:false},{'Set-Cookie':sessionCookie('',true)});
  }
  if (pathname === '/api/nova/files' && req.method === 'GET') {
    if (!validSession(req)) return json(res,401,{error:'Access required'});
    return json(res,200,{files:Object.entries(releases).map(([id, meta]) => ({id,name:meta.name,available:isAvailable(id)}))});
  }
  const match = /^\/api\/nova\/download\/(windows|teachers|admin)$/.exec(pathname);
  if (match && req.method === 'GET') {
    if (!validSession(req)) return json(res,401,{error:'Access required'});
    const id = match[1];
    if (!isAvailable(id)) return json(res,404,{error:'Release file not uploaded'});
    const filename = path.join(PRIVATE,releases[id].file);
    const stats = fs.statSync(filename);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${releases[id].file}"`,
      'Content-Length': stats.size,
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff'
    });
    return pipeline(fs.createReadStream(filename),res,err => { if (err) console.error('Download interrupted:',err.message); });
  }
  return json(res,404,{error:'Not found'});
}
function serveStatic(req,res,pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res,405,{error:'Method not allowed'});
  let name = pathname.replace(/^\//,'') || 'index.html';
  if (name === 'favicon.ico') {res.writeHead(302,{Location:'/assets/favicon.png'});res.end();return;}
  const parts = name.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) return json(res,404,{error:'Not found'});
  const asset = parts[0] === 'assets' && parts.length >= 2;
  if (!asset && (!publicDocuments.has(name) || parts.length !== 1)) return json(res,404,{error:'Not found'});
  const type = asset ? assetTypes[path.extname(name).toLowerCase()] : documentTypes[path.extname(name).toLowerCase()];
  if (!type) return json(res,404,{error:'Not found'});
  const filename = path.resolve(PUBLIC, name);
  if (!filename.startsWith(PUBLIC + path.sep)) return json(res,404,{error:'Not found'});
  try {
    if (fs.lstatSync(filename).isSymbolicLink() || !fs.statSync(filename).isFile()) return json(res,404,{error:'Not found'});
    const stat = fs.statSync(filename);
    res.writeHead(200,{'Content-Type':type,'Content-Length':stat.size,'Cache-Control':name.endsWith('.html')?'no-store':'public, max-age=300','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});
    if (req.method === 'HEAD') return res.end();
    return pipeline(fs.createReadStream(filename),res,err => {if(err) console.error('Static response failed:',err.message);});
  } catch {return json(res,404,{error:'Not found'});}
}

const server = http.createServer(async (req,res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); }
  catch { return json(res,400,{error:'Bad URL'}); }
  try {
    if (pathname.startsWith('/api/')) return await api(req,res,pathname);
    return serveStatic(req,res,pathname);
  } catch(err) {
    console.error('Request error:',err.message);
    if (!res.headersSent) json(res,500,{error:'Server error'});
    else res.destroy();
  }
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`SAIXORA running on port ${PORT}`);
});
