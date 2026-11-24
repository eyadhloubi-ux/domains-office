// مكتب DOMAINS الافتراضي — الخادم
// Express + Socket.io: الحضور والحركة، المحادثات والمساحات المشتركة، الاجتماعات والمحاضر،
// لوحات التخطيط المشترك، الذكاء الاصطناعي، وتمرير إشارات الصوت ومشاركة الشاشة (WebRTC).
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ACCESS_CODE = (process.env.ACCESS_CODE || '').trim();
const AI_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';
const AI_MODEL_FAST = process.env.AI_MODEL_FAST || 'claude-haiku-5-5';

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
if (process.env.TURN_URL) {
  ICE.push({ urls: process.env.TURN_URL.split(',').map(s => s.trim()).filter(Boolean),
    username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' });
}

/* ---------------- التخزين ---------------- */
fs.mkdirSync(DATA_DIR, { recursive: true });
const FILE = path.join(DATA_DIR, 'office.json');
const { FLOORS, SLOTS, BCATS } = require('./public/floors.js');
const FLOOR_IDS = FLOORS.map(f => f.id);
let db = { profiles: {}, pairs: {}, meetings: {}, archive: {}, minutes: [], boards: {}, users: {}, tokens: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (e) { /* أول تشغيل */ }
const rid = () => crypto.randomBytes(6).toString('hex');
if (db.meeting) { db.meetings.f3 = db.meeting; delete db.meeting; }
const NOTE_KEYS = ['y', 'o', 'p', 'v', 'b', 'g'];
// تحويل اللوحات من الصيغة السابقة (items/lines/pens) إلى صيغة العناصر الموحّدة
function migrateBoard(b) {
  if (!Array.isArray(b.items)) b.items = [];
  const hexToKey = { '#FFE27A': 'y', '#FFC98A': 'o', '#FFB3C7': 'p', '#D4C2FF': 'v', '#A9D8FF': 'b', '#B9EBA8': 'g' };
  b.items = b.items.map(i => i.txt !== undefined || ['rect', 'ell', 'dia', 'arrow', 'line', 'pen'].includes(i.t) ? i : ({
    id: i.id, t: i.t, x: i.x, y: i.y, w: i.w, h: i.h, txt: i.text || '', by: i.by, at: i.t0 || Date.now(),
    ...(i.t === 'note' ? { c: hexToKey[i.c] || 'y', done: !!i.done } : { ink: i.c || '#3A342B' }), ...(i.t === 'text' ? { fs: 22 } : {}) }));
  (b.lines || []).forEach(l => b.items.push({ id: l.id, t: 'arrow', a: l.a, b: l.b, ink: '#5B5346', by: l.by, at: Date.now() }));
  (b.pens || []).forEach(p => b.items.push({ id: p.id, t: 'pen', pts: p.pts, ink: p.c, sw: p.w || 3, by: p.by, at: Date.now() }));
  delete b.lines; delete b.pens; return b;
}
for (const f of FLOORS) {
  const m = db.meetings[f.id] || { startedAt: 0, msgs: [] }; m.sid = m.sid || null; db.meetings[f.id] = m;
  db.archive[f.id] = db.archive[f.id] || [];
  SLOTS.forEach((slot, i) => {
    const id = f.id + '.' + slot;
    const title = slot === 'general' ? 'اللوحة العامة' : f.tracks[i - 1];
    const b = db.boards[id];
    if (!b) db.boards[id] = { id, title, items: [], updatedAt: Date.now() };
    else { b.title = title; migrateBoard(b); }
  });
}
for (const k of Object.keys(db.boards)) if (!/^f\d\./.test(k)) delete db.boards[k];
const validFloor = f => FLOOR_IDS.includes(f);
const meetingOf = f => db.meetings[validFloor(f) ? f : 'f3'];
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(db), e => { if (!e) fs.rename(tmp, FILE, () => {}); });
  }, 400);
}

/* ---------------- الحسابات ---------------- */
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const normUser = u => String(u || '').trim().toLowerCase().slice(0, 30);
const USER_RE = /^[\p{L}\p{N}_.-]{3,30}$/u;
function newToken(uid) { const t = crypto.randomBytes(24).toString('hex'); db.tokens[t] = { uid, t: Date.now() }; save(); return t; }
function checkPw(user, pw) {
  try { const a = Buffer.from(hashPw(pw, user.salt), 'hex'), b = Buffer.from(user.hash, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

/* ---------------- أدوات ---------------- */
const str = (v, n = 300) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const pairKey = (a, b) => 'p' + crypto.createHash('sha1').update([a, b].sort().join('|')).digest('hex').slice(0, 16);
const getPair = (key, a, b) => { const p = db.pairs[key] = db.pairs[key] || { agreements: [], tasks: [], files: [], msgs: [] }; if (a && b && !p.users) p.users = [a, b]; return p; };
const pairDoc = p => ({ agreements: p.agreements, tasks: p.tasks, files: p.files });
const BOTS = {
  'bot-ahmad': { name: 'أحمد (تجريبي)', role: 'منسّق مسار التدريب', persona: 'منسّق مسار التدريب في DOMAINS، عملي ومنظّم ويحب الجداول والمواعيد الواضحة' },
  'bot-leen': { name: 'لين (تجريبية)', role: 'مسؤولة مسار الفعاليات', persona: 'مسؤولة مسار الفعاليات في DOMAINS، مبادِرة ومتحمسة وتفكر دائماً بتجربة الحضور والتفاصيل اللوجستية' } };
const nameOf = id => (BOTS[id] && BOTS[id].name) || (db.profiles[id] && db.profiles[id].name) || 'زميل';
function findIdByName(n) {
  n = str(n, 60); if (!n) return null; const f = n.split(' ')[0];
  for (const [id, b] of Object.entries(BOTS)) { const bn = b.name.split(' ')[0]; if (n.includes(bn) || bn.includes(f)) return id; }
  for (const [id, p] of Object.entries(db.profiles)) { const pn = p.name || ''; if (pn && (n.includes(pn.split(' ')[0]) || pn.includes(f))) return id; }
  return null;
}

/* ---------------- الذكاء الاصطناعي ---------------- */
async function claude({ system, messages, tools, fast = true, max = 700 }) {
  if (!AI_KEY) throw new Error('no-key');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: fast ? AI_MODEL_FAST : AI_MODEL, max_tokens: max, system, messages, ...(tools ? { tools } : {}) })
  });
  if (!r.ok) throw new Error('ai ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}
// حلقة استخدام الأدوات: يُنفَّذ كل طلب أداة ثم يُعاد الناتج حتى يكتب النموذج رده النهائي
async function claudeWithTools({ system, messages, tools, handlers, fast = true }) {
  const msgs = messages.slice();
  for (let i = 0; i < 4; i++) {
    const res = await claude({ system, messages: msgs, tools, fast });
    const uses = res.content.filter(c => c.type === 'tool_use');
    const text = res.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    if (res.stop_reason !== 'tool_use' || !uses.length) return text;
    msgs.push({ role: 'assistant', content: res.content });
    const results = [];
    for (const u of uses) {
      let out;
      try { out = await handlers[u.name](u.input || {}); } catch (e) { out = { error: String(e.message || e) }; }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
    }
    msgs.push({ role: 'user', content: results });
  }
  return 'حاضر.';
}
function toTurns(list, selfId) {
  const out = [];
  for (const m of list) {
    const role = m.by === selfId ? 'assistant' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += '\n' + m.text; else out.push({ role, content: m.text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length || out[out.length - 1].role !== 'user') out.push({ role: 'user', content: '(تابع)' });
  return out;
}
const parseJSON = s => { s = String(s || ''); return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); };
const CANNED = ['أهلاً! سعيد بزيارتك لمكتبي.', 'فكرة ممتازة، دعنا نسجّلها في مساحتنا المشتركة.', 'تمام، سأتابعها وأعود إليك اليوم.', 'يمكننا مناقشتها في غرفة الاجتماعات مع الفريق.'];
const canned = () => CANNED[Math.floor(Math.random() * CANNED.length)];

/* ---------------- الخادم ---------------- */
const app = express();
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m' }));
app.get('/health', (req, res) => res.json({ ok: true }));
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });

const online = new Map(); // socket.id -> حالة الحضور
const socketsOf = uid => [...io.sockets.sockets.values()].filter(s => s.data.uid === uid);
const pub = (id, o) => ({ id, uid: o.uid, name: o.name, look: o.look, x: o.x, y: o.y, floor: o.floor, face: o.face, status: o.status, moving: o.moving, say: o.say, voice: o.voice || null });
const VOICE_RE = /^(meeting:f[1-9]|board:f[1-9]\.(general|[a-d])|pair:p[a-f0-9]{16})$/;

function emitPair(key) { io.to('pair:' + key).emit('pair:doc', { key, doc: pairDoc(getPair(key)) }); }
function pushPairMsg(key, msg) {
  const p = getPair(key); p.msgs.push(msg); if (p.msgs.length > 300) p.msgs.splice(0, p.msgs.length - 300);
  save(); io.to('pair:' + key).emit('pair:msg', { key, msg });
}
function pushMeetMsg(floor, msg) {
  const m = meetingOf(floor); m.msgs.push(msg); if (m.msgs.length > 300) m.msgs.splice(0, m.msgs.length - 300);
  save(); io.emit('meeting:msg', { floor, msg });
}

function applyPairOp(p, by, owner, op) {
  const item = { id: rid(), by, t: Date.now() };
  switch (op.type) {
    case 'agr:add': if (str(op.text)) p.agreements.push({ ...item, text: str(op.text, 200) }); break;
    case 'task:add': if (str(op.text)) p.tasks.push({ ...item, text: str(op.text, 200), owner, done: false }); break;
    case 'file:add': if (str(op.title)) p.files.push({ ...item, title: str(op.title, 120), url: /^https:\/\//.test(str(op.url, 500)) ? str(op.url, 500) : '' }); break;
    case 'task:toggle': { const t = p.tasks.find(x => x.id === op.id); if (t) t.done = !!op.done; break; }
    case 'del': for (const k of ['agreements', 'tasks', 'files']) p[k] = p[k].filter(x => x.id !== op.id); break;
  }
}

// لوحة التخطيط: عناصر موحّدة على نمط منصة المسؤولية المجتمعية
// note · text · frame · rect · ell · dia (مربعات) | arrow · line (طرفاها عنصر a/b أو نقطة حرة) | pen (رسم حر)
const num = (v, d = 0) => { v = Math.round(+v); return Number.isFinite(v) ? Math.max(-50000, Math.min(50000, v)) : d; };
const clampN = (v, a, b, d) => { v = Math.round(+v); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
const COLOR = (c, d = '#3A342B') => /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : d;
const WB_T = ['note', 'text', 'frame', 'rect', 'ell', 'dia', 'arrow', 'line', 'pen'];
const BOX_T = ['note', 'text', 'frame', 'rect', 'ell', 'dia'];
const ID_RE = /^[a-z0-9]{6,24}$/;
function cleanItem(it, uid, old) {
  const t = WB_T.includes(it.t) ? it.t : 'note';
  const o = { id: old ? old.id : (ID_RE.test(it.id || '') ? it.id : rid()), t, by: old ? old.by : uid, at: old ? old.at : Date.now() };
  if (BOX_T.includes(t)) { o.x = num(it.x); o.y = num(it.y); o.w = clampN(it.w, 30, 5000, t === 'note' ? 200 : 160); o.h = clampN(it.h, 20, 5000, t === 'note' ? 130 : 90); o.txt = String(it.txt == null ? '' : it.txt).slice(0, 3000); }
  if (t === 'note') { o.c = NOTE_KEYS.includes(it.c) ? it.c : 'y'; o.done = !!it.done; if (it.fs) o.fs = clampN(it.fs, 10, 60, 15); }
  else o.ink = COLOR(it.ink, t === 'arrow' ? '#5B5346' : '#3A342B');
  if (t === 'text') o.fs = clampN(it.fs, 12, 120, 22);
  if (t === 'arrow' || t === 'line') {
    o.a = ID_RE.test(it.a || '') ? it.a : null; o.b = ID_RE.test(it.b || '') ? it.b : null;
    o.x1 = num(it.x1); o.y1 = num(it.y1); o.x2 = num(it.x2); o.y2 = num(it.y2);
  }
  if (t === 'pen') { o.pts = (Array.isArray(it.pts) ? it.pts : []).slice(0, 1500).map(q => [num(q && q[0]), num(q && q[1])]); o.sw = clampN(it.sw, 1, 16, 3); }
  return o;
}
function applyWb(b, op, uid) {
  const find = id => b.items.find(x => x.id === id);
  const add = it => { if (b.items.length >= 2000 || (ID_RE.test(it.id || '') && find(it.id))) return null; const n = cleanItem(it || {}, uid); if (n.t === 'pen' && n.pts.length < 2) return null; b.items.push(n); return n.id; };
  const upd = (id, patch) => { const i = b.items.findIndex(x => x.id === id); if (i < 0 || !patch) return null; b.items[i] = cleanItem({ ...b.items[i], ...patch, t: b.items[i].t }, uid, b.items[i]); return id; };
  switch (op.type) {
    case 'add': return Array.isArray(op.items) ? op.items.slice(0, 300).map(add).filter(Boolean).length > 0 : add(op.item);
    case 'upd': return upd(op.id, op.patch);
    case 'many': return (Array.isArray(op.list) ? op.list.slice(0, 500) : []).map(m => upd(m.id, m.patch)).filter(Boolean).length > 0;
    case 'del': {
      const ids = new Set((Array.isArray(op.ids) ? op.ids : [op.id]).filter(Boolean)); if (!ids.size) return null;
      b.items.forEach(l => { if (l.t !== 'arrow' && l.t !== 'line') return; for (const k of ['a', 'b']) if (l[k] && ids.has(l[k])) { const r = find(l[k]); if (r) { l[k === 'a' ? 'x1' : 'x2'] = Math.round(r.x + r.w / 2); l[k === 'a' ? 'y1' : 'y2'] = Math.round(r.y + r.h / 2); } l[k] = null; } });
      b.items = b.items.filter(x => !ids.has(x.id)); return true;
    }
  }
  return null;
}

/* ---------------- الصلاحيات ---------------- */
// role: admin | user · floors: الطوابق المسموحة · perms: { hr, finance, boards } كل منها none | view | edit
const PERM_KEYS = ['hr', 'finance', 'boards'], LEVELS = ['none', 'view', 'edit'];
const userEntry = uid => Object.entries(db.users).find(([, x]) => x.uid === uid) || null;
const userOf = uid => { const e = userEntry(uid); return e ? e[1] : null; };
const isAdmin = uid => { const u = userOf(uid); return !!(u && u.role === 'admin'); };
const floorsOf = uid => { const u = userOf(uid); if (!u) return []; return u.role === 'admin' ? FLOOR_IDS.slice() : (u.floors || []).filter(validFloor); };
const canFloor = (uid, f) => floorsOf(uid).includes(f);
const perm = (uid, k) => { const u = userOf(uid); if (!u) return 'none'; if (u.role === 'admin') return 'edit'; return LEVELS.includes((u.perms || {})[k]) ? u.perms[k] : (k === 'boards' ? 'edit' : 'none'); };
const permsOf = uid => { const o = {}; PERM_KEYS.forEach(k => o[k] = perm(uid, k)); return o; };
const meInfo = uid => { const e = userEntry(uid); return { uid, username: e ? e[0] : '', name: e ? e[1].name || '' : '', role: e ? e[1].role || 'user' : 'user', floors: floorsOf(uid), perms: permsOf(uid) }; };
const adminExists = () => Object.values(db.users).some(u => u.role === 'admin');
function cleanUser(u) {
  if (!u.role) u.role = 'user';
  if (!Array.isArray(u.floors)) u.floors = ['f3'];
  u.floors = u.floors.filter(validFloor);
  u.perms = u.perms || {}; PERM_KEYS.forEach(k => { if (!LEVELS.includes(u.perms[k])) u.perms[k] = k === 'boards' ? 'edit' : 'none'; });
  if (u.active === undefined) u.active = true;
  return u;
}
Object.values(db.users).forEach(cleanUser);
// إنشاء مسؤول النظام من متغيرات البيئة (أو ترقية حساب موجود)
if (process.env.ADMIN_USERNAME) {
  const u = normUser(process.env.ADMIN_USERNAME);
  if (USER_RE.test(u)) {
    const cur = db.users[u];
    if (cur) { cur.role = 'admin'; cur.active = true; if (process.env.ADMIN_PASSWORD) { cur.salt = rid() + rid(); cur.hash = hashPw(process.env.ADMIN_PASSWORD, cur.salt); } }
    else if (process.env.ADMIN_PASSWORD) { const salt = rid() + rid(); db.users[u] = cleanUser({ uid: 'u' + rid() + rid(), salt, hash: hashPw(process.env.ADMIN_PASSWORD, salt), role: 'admin', floors: FLOOR_IDS.slice(), t: Date.now() }); }
    save();
  }
}

// مسؤول النظام الافتراضي: يُنشأ تلقائياً عند التشغيل إذا لم يوجد أي مسؤول ولم تُضبط متغيرات المسؤول.
// تُحفظ هنا بصمة مشفّرة (scrypt) لكلمة المرور فقط، لا كلمة المرور نفسها.
const BOOT_ADMIN = { username: 'eyad', salt: '169160bf4e80cba0c0e077aa', hash: 'cb5931307721af3a014b3ce21f1c9b4fbeed38e64820958821108fd9f93e5e42' };
if (!adminExists() && !process.env.ADMIN_USERNAME) {
  const cur = db.users[BOOT_ADMIN.username];
  db.users[BOOT_ADMIN.username] = cleanUser({ ...(cur || {}), uid: cur ? cur.uid : 'u' + rid() + rid(), salt: BOOT_ADMIN.salt, hash: BOOT_ADMIN.hash, role: 'admin', active: true, floors: FLOOR_IDS.slice(), t: cur ? cur.t : Date.now() });
  save(); console.log('Bootstrap admin ready: ' + BOOT_ADMIN.username);
}

/* ---------------- الموارد البشرية والمالية والمهام ---------------- */
db.hr = db.hr || {}; db.fin = db.fin || {}; db.tasks = db.tasks || {};
FLOOR_IDS.forEach(f => { db.hr[f] = db.hr[f] || []; db.fin[f] = db.fin[f] || { cap: 0, capNote: '', cats: BCATS.map(c => ({ id: c[0], n: c[1], sal: !!c[2] })), rows: [] }; });
const money = v => { v = +v; return Number.isFinite(v) ? Math.max(0, Math.min(1e10, Math.round(v * 100) / 100)) : 0; };
function cleanHr(list) {
  const out = (Array.isArray(list) ? list : []).slice(0, 400).map(x => ({ id: ID_RE.test(x.id || '') ? x.id : rid(), title: str(x.title, 80), name: str(x.name, 60), parent: ID_RE.test(x.parent || '') ? x.parent : null, salary: money(x.salary), vacant: !!x.vacant, start: /^\d{4}-\d{2}-\d{2}$/.test(x.start || '') ? x.start : '' })).filter(x => x.title);
  const ids = new Set(out.map(x => x.id)); out.forEach(x => { if (!ids.has(x.parent) || x.parent === x.id) x.parent = null; }); return out;
}
function cleanFin(f) {
  const cats = (Array.isArray(f.cats) ? f.cats : []).slice(0, 20).map(c => ({ id: /^[a-z0-9]{2,24}$/.test(c.id || '') ? c.id : 'c' + rid(), n: str(c.n, 40), sal: !!c.sal })).filter(c => c.n);
  const cid = new Set(cats.map(c => c.id));
  const rows = (Array.isArray(f.rows) ? f.rows : []).slice(0, 120).filter(r => /^\d{4}-\d{2}$/.test(r.m || '')).map(r => { const v = {}; Object.keys(r.v || {}).forEach(k => { if (cid.has(k)) v[k] = money(r.v[k]); }); return { m: r.m, v, note: str(r.note, 200) }; });
  const seen = new Set(); return { cap: money(f.cap), capNote: str(f.capNote, 80), cats, rows: rows.filter(r => !seen.has(r.m) && seen.add(r.m)) };
}
const TSTAT = ['plan', 'doing', 'done'];
function cleanTasks(list, uid) {
  return (Array.isArray(list) ? list : []).slice(0, 200).map(t => ({ id: ID_RE.test(t.id || '') ? t.id : rid(), title: str(t.title, 200), status: TSTAT.includes(t.status) ? t.status : 'plan',
    due: /^\d{4}-\d{2}-\d{2}$/.test(t.due || '') ? t.due : '', t: +t.t || Date.now(), by: str(t.by || uid, 64), src: str(t.src, 120),
    subs: (Array.isArray(t.subs) ? t.subs : []).slice(0, 50).map(s => ({ id: ID_RE.test(s.id || '') ? s.id : rid(), text: str(s.text, 200), done: !!s.done })).filter(s => s.text),
    upds: (Array.isArray(t.upds) ? t.upds : []).slice(-50).map(u => ({ text: str(u.text, 600), by: str(u.by, 64), t: +u.t || Date.now() })).filter(u => u.text) })).filter(t => t.title);
}
function addTask(uid, task) { const l = db.tasks[uid] = db.tasks[uid] || []; l.unshift(cleanTasks([task], task.by)[0]); if (l.length > 200) l.length = 200; save(); io.emit('tasks', { uid, list: l }); }
const sendTo = (pred, ev, data) => { for (const s of io.sockets.sockets.values()) if (s.data.uid && pred(s.data.uid)) s.emit(ev, data); };

/* ---------------- غرفة الاجتماعات ---------------- */
// وضعان: «حديث عادي» لا يُحفظ ويُمحى بخروج الجميع، و«اجتماع رسمي» يبدأ بزر ويُحفظ في الأرشيف (مع محضر إن طُلب).
const inMeet = {}; FLOORS.forEach(f => inMeet[f.id] = new Set());
const isMeetZone = (x, y) => x > 1026 && x < 1388 && y > 12 && y < 414;
const archiveSummary = a => ({ sid: a.sid, title: a.title || '', startedAt: a.startedAt, endedAt: a.endedAt, attendees: a.attendees, count: a.msgs.length, startedBy: a.startedBy || '' });
const blankMeet = () => ({ sid: rid(), mode: 'chat', title: '', startedAt: Date.now(), msgs: [], startedBy: '' });
function emitMeet(floor) { io.emit('meeting:state', { floor, ...db.meetings[floor] }); }
function saveMeeting(floor) {
  const m = db.meetings[floor]; if (m.mode !== 'meeting') return null;
  const arch = db.archive[floor];
  const rec = { sid: m.sid, title: m.title, startedAt: m.startedAt, endedAt: Date.now(), msgs: m.msgs, startedBy: m.startedBy, attendees: [...new Set([...(m.att || []), ...m.msgs.map(x => x.name)])] };
  arch.unshift(rec); if (arch.length > 100) arch.length = 100; save();
  io.emit('meeting:archive', { floor, list: arch.map(archiveSummary) }); return rec;
}
function resetRoom(floor) { db.meetings[floor] = blankMeet(); save(); emitMeet(floor); }
function trackMeeting(sockId, floor, x, y) {
  for (const f of FLOOR_IDS) {
    const set = inMeet[f], inside = f === floor && isMeetZone(x, y), had = set.has(sockId);
    if (inside && !had) {
      set.add(sockId); const m = db.meetings[f];
      if (set.size === 1 && m.mode !== 'meeting') resetRoom(f);
      const o = online.get(sockId); if (o && db.meetings[f].mode === 'meeting') { const mm = db.meetings[f]; mm.att = [...new Set([...(mm.att || []), o.name])]; }
    } else if (!inside && had) {
      set.delete(sockId);
      if (set.size === 0) { if (db.meetings[f].mode === 'meeting') saveMeeting(f); resetRoom(f); }
    }
  }
}
for (const f of FLOOR_IDS) { const m = db.meetings[f]; if (!m || !m.mode) db.meetings[f] = blankMeet(); }

/* ---------------- محاضر الاجتماعات ---------------- */
async function makeMinutes(floor, rec, byUid) {
  const fl = FLOORS.find(f => f.id === floor), l = rec.msgs;
  const attendees = rec.attendees && rec.attendees.length ? rec.attendees : [...new Set(l.map(m => m.name))];
  const res = await claude({ fast: false, max: 1600, system: 'تكتب محاضر اجتماعات دقيقة بالعربية الفصحى. أعد JSON فقط.', messages: [{ role: 'user', content:
    `اكتب محضر اجتماع «${rec.title || 'اجتماع'}» لفريق ${fl.name} من النقاش التالي، دون إضافة ما لم يُذكر.\nالحاضرون: ${attendees.join('، ')}\nالنقاش:\n${l.map(m => `${m.name}: ${m.text}`).join('\n')}\n\nالشكل: {"title":"عنوان قصير","summary":"ملخص في جملتين","decisions":["..."],"actions":[{"who":"اسم أحد الحاضرين كما ورد","what":"المهمة","due":"YYYY-MM-DD إن ذُكر موعد واضح وإلا فارغ"}]}` }] });
  const j = parseJSON(res.content.map(c => c.text || '').join(''));
  const doc = { id: rid(), title: str(j.title || rec.title || 'محضر اجتماع', 120), summary: str(j.summary, 800), decisions: (j.decisions || []).slice(0, 12).map(x => str(x)),
    actions: (j.actions || []).slice(0, 15).map(a => ({ who: str(a.who, 40), what: str(a.what), due: str(a.due, 60) })), attendees, floor, sid: rec.sid, t: Date.now(), by: byUid };
  db.minutes.push(doc); if (db.minutes.length > 300) db.minutes.shift();
  let n = 0;
  for (const a of doc.actions) { // كل مهمة من المحضر تذهب إلى قائمة مهام صاحبها على مكتبه
    const id = findIdByName(a.who); if (!id || BOTS[id]) continue;
    addTask(id, { title: a.what, status: 'plan', due: /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? a.due : '', by: byUid, src: 'من محضر: ' + doc.title, t: Date.now() }); n++;
  }
  save(); io.emit('minutes', db.minutes.slice(-150).reverse()); return { doc, n };
}

io.on('connection', socket => {
  const authed = () => !!socket.data.uid;
  const admin = () => authed() && isAdmin(socket.data.uid);

  let attempts = 0;
  // إعداد أول مسؤول نظام (يعمل مرة واحدة فقط، حين لا يوجد أي مسؤول)
  socket.on('auth:setup', ({ username, password, code } = {}, ack) => {
    if (typeof ack !== 'function') return;
    if (adminExists()) return ack({ error: 'تم إعداد مسؤول النظام مسبقاً' });
    if (ACCESS_CODE && str(code, 80) !== ACCESS_CODE) return ack({ error: 'رمز الإعداد غير صحيح' });
    const u = normUser(username); if (!USER_RE.test(u)) return ack({ error: 'اسم المستخدم من 3 إلى 30 حرفاً أو رقماً، دون مسافات' });
    if (String(password || '').length < 8) return ack({ error: 'كلمة مرور المسؤول 8 أحرف على الأقل' });
    const salt = rid() + rid(); const prev = db.users[u];
    db.users[u] = cleanUser({ uid: prev ? prev.uid : 'u' + rid() + rid(), salt, hash: hashPw(password, salt), role: 'admin', floors: FLOOR_IDS.slice(), t: Date.now() });
    save(); ack({ token: newToken(db.users[u].uid) });
  });
  socket.on('auth:login', ({ username, password } = {}, ack) => {
    if (typeof ack !== 'function') return;
    if (++attempts > 20) return ack({ error: 'محاولات كثيرة، أعد تحميل الصفحة' });
    const user = db.users[normUser(username)];
    if (!user || !checkPw(user, password)) return ack({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    if (user.active === false) return ack({ error: 'هذا الحساب موقوف. راجع مسؤول النظام' });
    ack({ token: newToken(user.uid) });
  });
  socket.on('auth:password', ({ old, password } = {}, ack) => {
    if (typeof ack !== 'function' || !socket.data.uid) return;
    const entry = userEntry(socket.data.uid); if (!entry) return ack({ error: 'لا يوجد حساب' });
    if (!checkPw(entry[1], old)) return ack({ error: 'كلمة المرور الحالية غير صحيحة' });
    if (String(password || '').length < 6) return ack({ error: 'كلمة المرور 6 أحرف على الأقل' });
    entry[1].salt = rid() + rid(); entry[1].hash = hashPw(password, entry[1].salt); save(); ack({ ok: true });
  });
  socket.on('auth:logout', ({ token } = {}) => { if (db.tokens[token]) { delete db.tokens[token]; save(); } });

  socket.on('hello', ({ token } = {}, ack) => {
    if (typeof ack !== 'function') return;
    const tk = db.tokens[str(token, 64)], u = tk && userOf(tk.uid);
    if (!tk || !u || u.active === false) return ack({ ok: false, needLogin: true, setup: !adminExists(), needCode: !!ACCESS_CODE });
    const uid = tk.uid; socket.data.uid = uid;
    const fl = floorsOf(uid);
    const peers = [...online.entries()].map(([id, o]) => pub(id, o));
    const archive = {}; fl.forEach(f => archive[f] = db.archive[f].map(archiveSummary));
    const boards = {}; Object.values(db.boards).forEach(b => { if (fl.includes(b.id.split('.')[0]) && perm(uid, 'boards') !== 'none') boards[b.id] = b; });
    const meetings = {}; fl.forEach(f => meetings[f] = db.meetings[f]);
    ack({ ok: true, me: meInfo(uid), profile: db.profiles[uid] || null, profiles: db.profiles, peers, tasks: db.tasks,
      boards, meetings, archive, minutes: db.minutes.filter(m => fl.includes(m.floor || 'f3')).slice(-150).reverse(), ice: ICE, ai: !!AI_KEY, voiceMode: process.env.VOICE_MODE === 'relay' ? 'relay' : 'auto', self: socket.id });
  });

  /* ----- إدارة المستخدمين (مسؤول النظام فقط) ----- */
  const userList = () => Object.entries(db.users).map(([username, u]) => ({ username, uid: u.uid, role: u.role, floors: u.floors, perms: u.perms, active: u.active !== false, name: (db.profiles[u.uid] || {}).name || u.name || '', t: u.t, online: socketsOf(u.uid).length > 0 }));
  socket.on('admin:users', (_, ack) => { if (typeof ack === 'function') ack(admin() ? userList() : null); });
  socket.on('admin:save', (d = {}, ack) => {
    if (typeof ack !== 'function') return; if (!admin()) return ack({ error: 'هذه الصلاحية لمسؤول النظام فقط' });
    const u = normUser(d.username); if (!USER_RE.test(u)) return ack({ error: 'اسم المستخدم من 3 إلى 30 حرفاً أو رقماً، دون مسافات' });
    let rec = db.users[u];
    if (d.isNew) { if (rec) return ack({ error: 'اسم المستخدم موجود' }); if (String(d.password || '').length < 6) return ack({ error: 'كلمة المرور 6 أحرف على الأقل' }); rec = db.users[u] = { uid: 'u' + rid() + rid(), t: Date.now() }; }
    if (!rec) return ack({ error: 'لا يوجد مستخدم بهذا الاسم' });
    const self = rec.uid === socket.data.uid;
    if (d.password) { if (String(d.password).length < 6) return ack({ error: 'كلمة المرور 6 أحرف على الأقل' }); rec.salt = rid() + rid(); rec.hash = hashPw(d.password, rec.salt); if (!d.isNew) Object.keys(db.tokens).forEach(t => { if (db.tokens[t].uid === rec.uid && !self) delete db.tokens[t]; }); }
    rec.role = self ? 'admin' : (d.role === 'admin' ? 'admin' : 'user');
    rec.floors = (Array.isArray(d.floors) ? d.floors : []).filter(validFloor);
    rec.perms = {}; PERM_KEYS.forEach(k => rec.perms[k] = LEVELS.includes((d.perms || {})[k]) ? d.perms[k] : 'none');
    rec.active = self ? true : d.active !== false; if (d.name) rec.name = str(d.name, 30);
    cleanUser(rec);
    if (!rec.active) Object.keys(db.tokens).forEach(t => { if (db.tokens[t].uid === rec.uid) delete db.tokens[t]; });
    save();
    for (const s of socketsOf(rec.uid)) { if (!rec.active) s.disconnect(true); else s.emit('me:update', meInfo(rec.uid)); }
    ack({ ok: true, list: userList() });
  });
  socket.on('admin:delete', ({ username } = {}, ack) => {
    if (typeof ack !== 'function') return; if (!admin()) return ack({ error: 'هذه الصلاحية لمسؤول النظام فقط' });
    const u = normUser(username), rec = db.users[u]; if (!rec) return ack({ error: 'غير موجود' });
    if (rec.uid === socket.data.uid) return ack({ error: 'لا يمكنك حذف حسابك' });
    delete db.users[u]; Object.keys(db.tokens).forEach(t => { if (db.tokens[t].uid === rec.uid) delete db.tokens[t]; });
    if (db.profiles[rec.uid]) { db.profiles[rec.uid].desk = null; io.emit('profiles', db.profiles); }
    save(); for (const s of socketsOf(rec.uid)) s.disconnect(true); ack({ ok: true, list: userList() });
  });

  /* ----- خزانة الموارد البشرية وخزنة الملفات المالية ----- */
  socket.on('hr:get', ({ floor } = {}, ack) => {
    if (typeof ack !== 'function' || !authed() || !canFloor(socket.data.uid, floor) || perm(socket.data.uid, 'hr') === 'none') return typeof ack === 'function' && ack(null);
    const seeSal = perm(socket.data.uid, 'finance') !== 'none' || perm(socket.data.uid, 'hr') === 'edit';
    ack({ list: db.hr[floor].map(x => seeSal ? x : { ...x, salary: null }), seeSal });
  });
  socket.on('hr:save', ({ floor, list } = {}, ack) => {
    if (typeof ack !== 'function') return; if (!authed() || !canFloor(socket.data.uid, floor) || perm(socket.data.uid, 'hr') !== 'edit') return ack({ error: 'لا تملك صلاحية التعديل' });
    db.hr[floor] = cleanHr(list); save(); ack({ ok: true, list: db.hr[floor] });
    sendTo(u => u !== socket.data.uid && canFloor(u, floor) && perm(u, 'hr') !== 'none', 'hr:changed', { floor });
  });
  socket.on('fin:get', ({ floor } = {}, ack) => {
    if (typeof ack !== 'function') return; if (!authed() || !canFloor(socket.data.uid, floor) || perm(socket.data.uid, 'finance') === 'none') return ack(null);
    const sf = db.hr[floor].filter(x => !x.vacant).reduce((a, x) => a + (x.salary || 0), 0);
    ack({ fin: db.fin[floor], hrSalaries: sf });
  });
  socket.on('fin:save', ({ floor, fin } = {}, ack) => {
    if (typeof ack !== 'function') return; if (!authed() || !canFloor(socket.data.uid, floor) || perm(socket.data.uid, 'finance') !== 'edit') return ack({ error: 'لا تملك صلاحية التعديل' });
    db.fin[floor] = cleanFin(fin || {}); save(); ack({ ok: true, fin: db.fin[floor] });
    sendTo(u => u !== socket.data.uid && canFloor(u, floor) && perm(u, 'finance') !== 'none', 'fin:changed', { floor });
  });

  /* ----- مهام كل موظف على مكتبه ----- */
  socket.on('tasks:save', ({ uid, list } = {}, ack) => {
    if (!authed()) return; uid = str(uid, 64);
    if (uid !== socket.data.uid && !isAdmin(socket.data.uid)) return typeof ack === 'function' && ack({ error: 'تعديل المهام لصاحب المكتب أو مسؤول النظام' });
    db.tasks[uid] = cleanTasks(list, socket.data.uid); save(); io.emit('tasks', { uid, list: db.tasks[uid] }); if (typeof ack === 'function') ack({ ok: true });
  });
  socket.on('tasks:update', ({ uid, id, text } = {}, ack) => { // أي زميل يستطيع إضافة مستجد على مهمة زميله
    if (!authed()) return; const t = (db.tasks[str(uid, 64)] || []).find(x => x.id === id); text = str(text, 600);
    if (!t || !text) return; t.upds.push({ text, by: socket.data.uid, t: Date.now() }); if (t.upds.length > 50) t.upds.shift();
    save(); io.emit('tasks', { uid, list: db.tasks[uid] }); if (typeof ack === 'function') ack({ ok: true });
  });

  /* ----- سجل المحادثات ----- */
  socket.on('pair:list', (_, ack) => {
    if (typeof ack !== 'function' || !authed()) return; const me = socket.data.uid;
    ack(Object.entries(db.pairs).filter(([, p]) => p.users && p.users.includes(me) && p.msgs.length).map(([key, p]) => { const other = p.users.find(u => u !== me) || me; const last = p.msgs[p.msgs.length - 1]; return { key, other, name: nameOf(other), last: { text: last.text.slice(0, 120), t: last.t, by: last.by }, count: p.msgs.length }; }).sort((a, b) => b.last.t - a.last.t).slice(0, 100));
  });

  socket.on('profile:save', p => {
    if (!authed() || !p) return;
    const look = p.look || {};
    const prof = { name: str(p.name, 30), role: str(p.role, 40), desk: /^f[1-9]:(m1|[a-d][1-4])$/.test(p.desk || '') && canFloor(socket.data.uid, p.desk.split(':')[0]) ? p.desk : null, t: Date.now(),
      look: { gender: look.gender === 'f' ? 'f' : 'm', shirt: str(look.shirt, 9), hair: str(look.hair, 9), skin: str(look.skin, 9), style: str(look.style, 10) } };
    if (!prof.name) return;
    if (prof.desk) for (const [id, o] of Object.entries(db.profiles)) if (id !== socket.data.uid && o.desk === prof.desk) prof.desk = null;
    db.profiles[socket.data.uid] = prof; save(); io.emit('profiles', db.profiles);
  });

  socket.on('pos', s => {
    if (!authed() || !s) return;
    const prof = db.profiles[socket.data.uid] || {};
    const o = online.get(socket.id) || {};
    Object.assign(o, { uid: socket.data.uid, name: prof.name || str(s.name, 30), look: prof.look || {},
      x: Math.max(0, Math.min(2000, +s.x || 0)), y: Math.max(0, Math.min(1200, +s.y || 0)), status: ['free', 'busy', 'focus'].includes(s.status) ? s.status : 'free',
      moving: !!s.moving, floor: canFloor(socket.data.uid, s.floor) ? s.floor : (floorsOf(socket.data.uid)[0] || 'f3'), face: ['up', 'down', 'left', 'right'].includes(s.face) ? s.face : 'down', say: s.say ? { text: str(s.say.text, 120), t: Date.now() } : null });
    const first = !online.has(socket.id); online.set(socket.id, o);
    trackMeeting(socket.id, o.floor, o.x, o.y);
    if (first) socket.broadcast.emit('peer:join', pub(socket.id, o)); else socket.broadcast.volatile.emit('pos', pub(socket.id, o));
  });

  /* ----- المحادثة والمساحة المشتركة بين شخصين ----- */
  socket.on('pair:open', ({ other } = {}, ack) => {
    if (!authed() || typeof ack !== 'function') return;
    other = str(other, 64); if (!other || other === socket.data.uid) return ack(null);
    const key = pairKey(socket.data.uid, other); const p = getPair(key, socket.data.uid, other);
    for (const r of socket.rooms) if (r.startsWith('pair:')) socket.leave(r);
    socket.join('pair:' + key); ack({ key, doc: pairDoc(p), msgs: p.msgs.slice(-80) });
  });
  socket.on('pair:close', () => { for (const r of socket.rooms) if (r.startsWith('pair:')) socket.leave(r); });
  socket.on('pair:msg', ({ other, text } = {}) => {
    if (!authed()) return; other = str(other, 64); text = str(text, 1000); if (!other || !text) return;
    const key = pairKey(socket.data.uid, other); getPair(key, socket.data.uid, other);
    pushPairMsg(key, { id: rid(), by: socket.data.uid, text, t: Date.now() });
    for (const s of socketsOf(other)) if (!s.rooms.has('pair:' + key)) s.emit('dm', { from: socket.data.uid, name: nameOf(socket.data.uid), text: text.slice(0, 120) });
  });
  socket.on('pair:op', ({ other, op } = {}) => {
    if (!authed() || !op) return; other = str(other, 64); if (!other) return;
    const key = pairKey(socket.data.uid, other); const p = getPair(key);
    applyPairOp(p, socket.data.uid, op.owner === 'you' ? other : socket.data.uid, op); save(); emitPair(key);
  });
  socket.on('knock', ({ to } = {}) => { if (!authed()) return; for (const s of socketsOf(str(to, 64))) s.emit('knock', { name: nameOf(socket.data.uid) }); });

  /* ----- الزملاء التجريبيون ----- */
  socket.on('ai:bot', async ({ bot } = {}) => {
    if (!authed() || !BOTS[bot]) return;
    const me = socket.data.uid, key = pairKey(me, bot), p = getPair(key, me, bot), b = BOTS[bot];
    const prof = db.profiles[me] || {};
    let text = '';
    try {
      text = await claudeWithTools({
        system: `أنت «${b.name.replace(/ \(.*\)/, '')}»، ${b.persona}. أنت شخصية تجريبية في نموذج أولي لمكتب افتراضي لفريق DOMAINS (مجتمع شبابي في جامعة حلب يعمل عبر مسارات التدريب والفعاليات والمشاريع والتطوع). زميلك «${prof.name || 'زميل'}» (${prof.role || 'عضو في الفريق'}) وصل إلى مكتبك ويتحدث معك.
ردّ بالعربية الفصحى في جملة إلى ثلاث جمل، بأسلوب زميل عمل ودود وعملي. إذا اتفقتما على شيء محدد فسجّله بأداة add_agreement، وإذا ظهرت مهمة واضحة فسجّلها بأداة add_task (owner: "me" إن كانت عليك، و"you" إن كانت على الزميل). لا تخترع أرقاماً أو وقائع عن المؤسسة. اكتب ردك فقط.`,
        messages: toTurns(p.msgs.slice(-14), bot),
        tools: [
          { name: 'add_agreement', description: 'تسجيل نقطة اتفقتما عليها في المساحة المشتركة', input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
          { name: 'add_task', description: 'إضافة مهمة مشتركة مع تحديد المسؤول', input_schema: { type: 'object', properties: { text: { type: 'string' }, owner: { type: 'string', enum: ['me', 'you'] } }, required: ['text', 'owner'] } }],
        handlers: {
          add_agreement: ({ text }) => { applyPairOp(p, bot, bot, { type: 'agr:add', text }); save(); emitPair(key); return { ok: true }; },
          add_task: ({ text, owner }) => { applyPairOp(p, bot, owner === 'me' ? bot : me, { type: 'task:add', text }); save(); emitPair(key); return { ok: true }; } }
      });
    } catch (e) { if (!/no-key/.test(e.message)) console.warn(e.message); text = canned(); }
    pushPairMsg(key, { id: rid(), by: bot, text: str(text || 'حاضر.', 1200), t: Date.now() });
    socket.emit('bot:say', { bot, text: str(text, 120) });
  });

  /* ----- موظفة الاستقبال نور: مرشدة ذكية تعرف سياق المستخدم وتنفّذ أفعالاً ----- */
  socket.on('ai:nour', async ({ history, context, floor } = {}, ack) => {
    if (!authed() || typeof ack !== 'function') return;
    const uid = socket.data.uid, fl = FLOORS.find(f => f.id === floor) || FLOORS.find(f => f.id === 'f3');
    const hist = (Array.isArray(history) ? history : []).slice(-14).map(m => ({ by: m.me ? 'u' : 'nour', text: str(m.text, 900) })).filter(m => m.text);
    const info = meInfo(uid), prof = db.profiles[uid] || {}, myTasks = (db.tasks[uid] || []);
    const today = new Date().toISOString().slice(0, 10);
    const taskTxt = myTasks.length ? myTasks.slice(0, 25).map(t => `- [${({ plan: 'قيد التخطيط', doing: 'قيد التنفيذ', done: 'منجزة' })[t.status]}] ${t.title}${t.due ? ' · التسليم ' + t.due + (t.status !== 'done' && t.due < today ? ' (متأخرة)' : '') : ''}${t.subs.length ? ' · فرعية ' + t.subs.filter(s => s.done).length + '/' + t.subs.length : ''}`).join('\n') : 'لا مهام مسجّلة على مكتبه.';
    const lastMeet = (db.archive[fl.id] || [])[0]; const lastMin = lastMeet && db.minutes.find(m => m.sid === lastMeet.sid);
    const meetTxt = lastMeet ? `آخر اجتماع رسمي في هذا الطابق: «${lastMeet.title || 'اجتماع'}» بتاريخ ${new Date(lastMeet.startedAt).toISOString().slice(0, 10)}، الحاضرون: ${lastMeet.attendees.join('، ')}.${lastMin ? ' ملخص محضره: ' + lastMin.summary + (lastMin.actions.length ? ' المهام: ' + lastMin.actions.map(a => a.who + ': ' + a.what).join('؛ ') : '') : ' لم يُكتب له محضر بعد.'}\nأبرز ما قيل فيه: ${lastMeet.msgs.slice(-12).map(m => m.name + ': ' + m.text).join(' | ').slice(0, 1500)}` : 'لا اجتماعات رسمية مؤرشفة بعد في هذا الطابق.';
    const actions = [];
    try {
      const text = await claudeWithTools({
        system: `أنت «نور»، موظفة الاستقبال والمساعدة الذكية في مبنى مجموعة سنكري القابضة الافتراضي. تتحدثين بالعربية الفصحى بإيجاز ووضوح وودّ، وتقترحين دائماً خطوة عملية تالية واحدة أو اثنتين.
المستخدم: ${prof.name || info.username} (${prof.role || 'عضو'})، ${info.role === 'admin' ? 'وهو مسؤول النظام ويرى كل شيء' : 'مستخدم عادي'}. الطوابق المتاحة له: ${info.floors.map(f => (FLOORS.find(x => x.id === f) || {}).n).join('، ')}. صلاحياته: الموارد البشرية ${info.perms.hr}، المالية ${info.perms.finance}، لوحات التخطيط ${info.perms.boards} (none=لا وصول، view=اطلاع، edit=تعديل). اليوم ${today}.
الطابق الحالي ${fl.n}: ${fl.name}. طوابق المبنى: ${FLOORS.map(f => f.n + ' ' + f.name).join('، ')}.
مخطط الطابق: الاستقبال والمصعد عند المدخل؛ ${fl.manager} وفيه خزانة الموارد البشرية وخزنة الملفات المالية وحاسوب مسؤول النظام؛ غرفة «مكاتب البرامج» (${fl.programs.join('، ')})؛ غرفة «مكاتب العمليات» (${fl.operations.join('، ')})؛ غرفة الاجتماعات؛ الاستراحة؛ غرفة «لوحة التخطيط المشترك» وفيها خمس لوحات (العامة و${fl.tracks.join(' و')}).
ما يمكن فعله في المكتب: المشي بالأسهم أو بالنقر بالماوس؛ التوقف عند مكتب زميل يفتح المحادثة (محفوظة في سجل المحادثات) ومهامه ومساحتكما المشتركة وزر مكالمة صوتية؛ على مكتبك قائمة مهامك بحالاتها (قيد التخطيط/قيد التنفيذ/منجزة) ومهام فرعية ومستجدات وموعد تسليم؛ غرفة الاجتماعات فيها حديث عادي بالصوت لا يُحفظ، وزر «ابدأ اجتماعاً رسمياً» يُسجَّل ويُحفظ عند إنهائه مع محضر اختياري يوزّع المهام على مكاتب أصحابها؛ لوحات التخطيط بستيكي نوت وأشكال وأسهم؛ حالة الموظف (متاح/مشغول/تركيز).
مهام المستخدم:\n${taskTxt}
${meetTxt}
${str(context, 2500)}
الأدوات: show_way لرسم الطريق إلى مكان أو شخص؛ go_floor لنقله إلى طابق مسموح له؛ add_my_task لإضافة مهمة إلى مكتبه إذا طلب ذلك؛ open_feature لفتح ميزة (tasks مهامي، history سجل المحادثات، hr الموارد البشرية، finance المالية، admin إدارة المستخدمين). استخدميها حين يطلب المستخدم ذلك صراحة أو حين تكون الخطوة الواضحة. لا تخترعي أرقاماً أو وقائع غير مذكورة أعلاه.`,
        messages: toTurns(hist, 'nour'),
        tools: [
          { name: 'show_way', description: 'رسم خط إرشاد على الخريطة إلى مكان أو مكتب شخص', input_schema: { type: 'object', properties: { target: { type: 'string', description: 'أحد: manager, hr_cabinet, finance_safe, admin_pc, programs, operations, pod_a, pod_b, pod_c, pod_d, meeting, lounge, reception, elevator, planning, board_general, board_a, board_b, board_c, board_d, my_desk، أو اسم شخص' } }, required: ['target'] } },
          { name: 'go_floor', description: 'نقل المستخدم بالمصعد إلى طابق', input_schema: { type: 'object', properties: { n: { type: 'integer', description: 'رقم الطابق' } }, required: ['n'] } },
          { name: 'add_my_task', description: 'إضافة مهمة إلى قائمة مهام المستخدم على مكتبه', input_schema: { type: 'object', properties: { title: { type: 'string' }, due: { type: 'string', description: 'YYYY-MM-DD أو فارغ' } }, required: ['title'] } },
          { name: 'open_feature', description: 'فتح ميزة للمستخدم', input_schema: { type: 'object', properties: { feature: { type: 'string', enum: ['tasks', 'history', 'hr', 'finance', 'admin'] } }, required: ['feature'] } }],
        handlers: {
          show_way: ({ target }) => { actions.push({ type: 'way', target: str(target, 60) }); return { ok: true }; },
          go_floor: ({ n }) => { const f = FLOORS.find(x => x.n === +n); if (!f) return { error: 'لا يوجد طابق بهذا الرقم' }; if (!canFloor(uid, f.id)) return { error: 'هذا الطابق غير مسموح للمستخدم' }; actions.push({ type: 'floor', floor: f.id }); return { ok: true }; },
          add_my_task: ({ title, due }) => { addTask(uid, { title, due: /^\d{4}-\d{2}-\d{2}$/.test(due || '') ? due : '', status: 'plan', by: uid, src: 'أضافتها نور', t: Date.now() }); return { ok: true }; },
          open_feature: ({ feature }) => { actions.push({ type: 'open', feature: str(feature, 20) }); return { ok: true }; } }
      });
      ack({ text, actions });
    } catch (e) { if (!/no-key/.test(e.message)) console.warn(e.message); ack({ text: null, actions: [] }); }
  });

  /* ----- غرفة الاجتماعات ----- */
  socket.on('meeting:msg', ({ text, floor } = {}) => {
    if (!authed() || !canFloor(socket.data.uid, floor)) return; text = str(text, 1000); if (!text) return;
    pushMeetMsg(floor, { id: rid(), by: socket.data.uid, name: nameOf(socket.data.uid), text, t: Date.now() });
  });
  socket.on('meeting:start', ({ floor, title } = {}, ack) => {
    if (!authed() || !canFloor(socket.data.uid, floor)) return;
    const m = db.meetings[floor]; if (m.mode === 'meeting') return typeof ack === 'function' && ack({ error: 'يوجد اجتماع رسمي جارٍ' });
    const att = [...inMeet[floor]].map(id => (online.get(id) || {}).name).filter(Boolean);
    db.meetings[floor] = { sid: rid(), mode: 'meeting', title: str(title, 100) || 'اجتماع ' + new Date().toISOString().slice(0, 10), startedAt: Date.now(), msgs: [], startedBy: nameOf(socket.data.uid), att };
    save(); emitMeet(floor); if (typeof ack === 'function') ack({ ok: true });
  });
  socket.on('meeting:end', async ({ floor, save: how } = {}, ack) => {
    if (!authed() || !canFloor(socket.data.uid, floor) || typeof ack !== 'function') return;
    const m = db.meetings[floor]; if (m.mode !== 'meeting') return ack({ error: 'لا يوجد اجتماع رسمي جارٍ' });
    if (how === 'discard') { resetRoom(floor); return ack({ ok: true }); }
    const rec = saveMeeting(floor); resetRoom(floor);
    if (how === 'minutes') {
      if (!AI_KEY) return ack({ ok: true, warn: 'حُفظ الاجتماع، لكن كتابة المحضر تحتاج مفتاح الذكاء الاصطناعي في إعدادات الخادم' });
      if (rec.msgs.length < 2) return ack({ ok: true, warn: 'حُفظ الاجتماع دون محضر لأن النقاش المكتوب قصير جداً' });
      try { const r = await makeMinutes(floor, rec, socket.data.uid); return ack({ ok: true, minutes: true, distributed: r.n }); } catch (e) { console.warn(e.message); return ack({ ok: true, warn: 'حُفظ الاجتماع، وتعذّرت كتابة المحضر الآن؛ يمكنك إنشاؤه لاحقاً من الأرشيف' }); }
    }
    ack({ ok: true });
  });
  socket.on('meeting:session', ({ floor, sid } = {}, ack) => {
    if (!authed() || typeof ack !== 'function' || !canFloor(socket.data.uid, floor)) return;
    const a = db.archive[floor].find(x => x.sid === sid); ack(a ? { ...a, minutes: db.minutes.filter(m => m.sid === sid) } : null);
  });
  socket.on('minutes:make', async ({ floor, sid } = {}, ack) => { // محضر لاجتماع مؤرشف
    if (!authed() || typeof ack !== 'function' || !canFloor(socket.data.uid, floor)) return;
    const rec = db.archive[floor].find(x => x.sid === sid); if (!rec) return ack({ error: 'الاجتماع غير موجود' });
    if (!AI_KEY) return ack({ error: 'كتابة المحضر تحتاج مفتاح الذكاء الاصطناعي في إعدادات الخادم' });
    if (rec.msgs.length < 2) return ack({ error: 'النقاش المكتوب في هذا الاجتماع قصير جداً لكتابة محضر' });
    try { const r = await makeMinutes(floor, rec, socket.data.uid); ack({ ok: true, distributed: r.n }); } catch (e) { console.warn(e.message); ack({ error: 'تعذّرت كتابة المحضر، حاول مرة أخرى' }); }
  });
  socket.on('ai:meetbots', async ({ bots, floor } = {}) => {
    if (!authed() || !canFloor(socket.data.uid, floor)) return; const here = (Array.isArray(bots) ? bots : []).filter(b => BOTS[b]); if (!here.length) return;
    const mt = meetingOf(floor);
    const tr = mt.msgs.filter(m => m.t >= mt.startedAt).slice(-16).map(m => `${m.name}: ${m.text}`).join('\n');
    let replies = [];
    try {
      const res = await claude({ system: 'تدير شخصيات تجريبية في اجتماع فريق. أعد JSON فقط.', messages: [{ role: 'user', content:
        `الشخصيات:\n${here.map(b => `- id=${b}: «${BOTS[b].name.replace(/ \(.*\)/, '')}»، ${BOTS[b].persona}`).join('\n')}\nنص الاجتماع:\n${tr}\n\nاكتب ردّاً أو ردّين فقط ممن لديه إضافة مفيدة، بالعربية الفصحى، جملة أو جملتان لكل رد، دون اختراع أرقام. الشكل: {"replies":[{"id":"bot-ahmad","text":"..."}]}` }] });
      replies = (parseJSON(res.content.map(c => c.text || '').join('')).replies || []).slice(0, 2);
    } catch (e) { if (!/no-key/.test(e.message)) console.warn(e.message); replies = [{ id: here[0], text: canned() }]; }
    for (const r of replies) if (BOTS[r.id] && r.text) { pushMeetMsg(floor, { id: rid(), by: r.id, name: BOTS[r.id].name, text: str(r.text, 600), t: Date.now() }); io.emit('bot:say', { bot: r.id, text: str(r.text, 120) }); }
  });
  /* ----- لوحات التخطيط المشترك ----- */
  socket.on('wb:op', ({ bid, op } = {}, ack) => {
    const b = db.boards[bid]; if (!authed() || !b || !op) return;
    if (!canFloor(socket.data.uid, bid.split('.')[0]) || perm(socket.data.uid, 'boards') !== 'edit') { if (typeof ack === 'function') ack(null); return socket.emit('board', b); }
    const r = applyWb(b, op, socket.data.uid);
    if (typeof ack === 'function') ack(r);
    if (r) { b.updatedAt = Date.now(); save(); socket.broadcast.emit('board', b); socket.emit('board', b); }
  });
  socket.on('wb:move', ({ bid, list } = {}) => { if (authed() && db.boards[bid] && Array.isArray(list)) socket.broadcast.volatile.emit('wb:move', { bid, list: list.slice(0, 200) }); });
  socket.on('wb:cursor', ({ bid, x, y } = {}) => { if (authed() && db.boards[bid]) socket.broadcast.volatile.emit('wb:cursor', { bid, id: socket.id, name: nameOf(socket.data.uid), x: num(x), y: num(y) }); });

  /* ----- المكالمات والصوت (تمرير إشارات WebRTC) ----- */
  socket.on('call:invite', ({ to } = {}) => {
    if (!authed()) return; to = str(to, 64);
    const channel = 'pair:' + pairKey(socket.data.uid, to);
    for (const s of socketsOf(to)) s.emit('call:invite', { from: socket.data.uid, name: nameOf(socket.data.uid), channel });
  });
  function leaveVoice() {
    const ch = socket.data.voice; if (!ch) return;
    socket.leave('v:' + ch); socket.to('v:' + ch).emit('voice:left', { id: socket.id }); socket.data.voice = null; socket.data.screen = false;
    const o = online.get(socket.id); if (o) { o.voice = null; socket.broadcast.emit('pos', pub(socket.id, o)); }
  }
  socket.on('voice:join', ({ channel } = {}) => {
    if (!authed() || !VOICE_RE.test(channel || '')) return;
    const chFloor = (channel.match(/^(?:meeting:|board:)(f\d)/) || [])[1]; if (chFloor && !canFloor(socket.data.uid, chFloor)) return;
    if (channel.startsWith('pair:')) { // لا يدخل مكالمة ثنائية إلا طرفاها
      const others = Object.keys(db.profiles).concat(Object.keys(BOTS));
      if (!others.some(o => 'pair:' + pairKey(socket.data.uid, o) === channel)) return;
    }
    if (socket.data.voice === channel) return;
    leaveVoice();
    const members = [...(io.sockets.adapter.rooms.get('v:' + channel) || [])];
    socket.data.voice = channel; socket.join('v:' + channel);
    socket.emit('voice:peers', { channel, peers: members, screens: members.filter(id => io.sockets.sockets.get(id)?.data.screen) });
    socket.to('v:' + channel).emit('voice:joined', { id: socket.id });
    const o = online.get(socket.id); if (o) { o.voice = channel; socket.broadcast.emit('pos', pub(socket.id, o)); }
  });
  socket.on('voice:leave', leaveVoice);
  socket.on('voice:signal', ({ to, data } = {}) => {
    const t = io.sockets.sockets.get(to);
    if (t && socket.data.voice && t.data.voice === socket.data.voice) t.emit('voice:signal', { from: socket.id, data });
  });
  // نقل احتياطي للصوت عبر الخادم (Opus) حين يتعذّر الاتصال المباشر بين المتصفحين
  socket.on('voice:pkt', ({ to, f, sr, ch } = {}) => {
    const v = socket.data.voice; if (!v || !Array.isArray(to) || !Array.isArray(f) || f.length > 8) return;
    for (const id of to.slice(0, 20)) { const t = io.sockets.sockets.get(id); if (t && t.data.voice === v) t.volatile.emit('voice:pkt', { from: socket.id, f, sr, ch }); }
  });
  socket.on('voice:screen', ({ on } = {}) => {
    if (!socket.data.voice) return; socket.data.screen = !!on;
    socket.to('v:' + socket.data.voice).emit('voice:screen', { id: socket.id, on: !!on, name: nameOf(socket.data.uid) });
  });

  socket.on('disconnect', () => { leaveVoice(); trackMeeting(socket.id, null, 0, 0); if (online.delete(socket.id)) io.emit('peer:left', { id: socket.id }); });
});

server.listen(PORT, () => console.log(`DOMAINS office on :${PORT}  ai=${AI_KEY ? 'on' : 'off'}  code=${ACCESS_CODE ? 'on' : 'off'}  turn=${process.env.TURN_URL ? 'on' : 'off'}`));
