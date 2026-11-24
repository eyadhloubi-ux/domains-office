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
const { FLOORS, SLOTS } = require('./public/floors.js');
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
    const title = slot === 'general' ? 'اللوحة العامة' : f.pods[i - 1];
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
const getPair = key => (db.pairs[key] = db.pairs[key] || { agreements: [], tasks: [], files: [], msgs: [] });
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

/* ---------------- جلسات غرفة الاجتماعات ---------------- */
// تبدأ جلسة جديدة عندما يدخل أول شخص غرفة فارغة، وتُؤرشف تلقائياً عندما يغادرها آخر شخص.
const inMeet = {}; FLOORS.forEach(f => inMeet[f.id] = new Set());
const isMeetZone = (x, y) => x > 1026 && x < 1388 && y > 12 && y < 414;
const archiveSummary = a => ({ sid: a.sid, startedAt: a.startedAt, endedAt: a.endedAt, attendees: a.attendees, count: a.msgs.length });
function archiveSession(floor) {
  const m = db.meetings[floor];
  if (m.msgs.length) {
    const arch = db.archive[floor];
    arch.unshift({ sid: m.sid || rid(), startedAt: m.startedAt, endedAt: Date.now(), msgs: m.msgs, attendees: [...new Set(m.msgs.map(x => x.name))] });
    if (arch.length > 80) arch.length = 80;
  }
  db.meetings[floor] = { sid: null, startedAt: 0, msgs: [] }; save();
  io.emit('meeting:state', { floor, ...db.meetings[floor] });
  io.emit('meeting:archive', { floor, list: db.archive[floor].map(archiveSummary) });
}
function startSession(floor) {
  if (db.meetings[floor].msgs.length) archiveSession(floor);
  db.meetings[floor] = { sid: rid(), startedAt: Date.now(), msgs: [] }; save();
  io.emit('meeting:state', { floor, ...db.meetings[floor] });
}
function trackMeeting(sockId, floor, x, y) {
  for (const f of FLOOR_IDS) {
    const set = inMeet[f], inside = f === floor && isMeetZone(x, y), had = set.has(sockId);
    if (inside && !had) { set.add(sockId); if (set.size === 1) startSession(f); }
    else if (!inside && had) { set.delete(sockId); if (set.size === 0) archiveSession(f); }
  }
}

io.on('connection', socket => {
  const authed = () => !!socket.data.uid;

  let attempts = 0;
  socket.on('auth:register', ({ username, password, code, legacy } = {}, ack) => {
    if (typeof ack !== 'function') return;
    if (++attempts > 20) return ack({ error: 'محاولات كثيرة، أعد تحميل الصفحة' });
    if (ACCESS_CODE && str(code, 80) !== ACCESS_CODE) return ack({ error: 'رمز الفريق غير صحيح' });
    const u = normUser(username); if (!USER_RE.test(u)) return ack({ error: 'اسم المستخدم من 3 إلى 30 حرفاً أو رقماً، دون مسافات' });
    if (String(password || '').length < 6) return ack({ error: 'كلمة المرور 6 أحرف على الأقل' });
    if (db.users[u]) return ack({ error: 'اسم المستخدم مستخدم من قبل، اختر غيره' });
    legacy = str(legacy, 64); const taken = new Set(Object.values(db.users).map(x => x.uid));
    const uid = /^[a-zA-Z0-9_-]{8,64}$/.test(legacy) && db.profiles[legacy] && !taken.has(legacy) ? legacy : 'u' + rid() + rid();
    const salt = rid() + rid(); db.users[u] = { uid, salt, hash: hashPw(password, salt), t: Date.now() };
    ack({ token: newToken(uid) });
  });
  socket.on('auth:login', ({ username, password } = {}, ack) => {
    if (typeof ack !== 'function') return;
    if (++attempts > 20) return ack({ error: 'محاولات كثيرة، أعد تحميل الصفحة' });
    const user = db.users[normUser(username)];
    if (!user || !checkPw(user, password)) return ack({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    ack({ token: newToken(user.uid) });
  });
  socket.on('auth:password', ({ old, password } = {}, ack) => {
    if (typeof ack !== 'function' || !socket.data.uid) return;
    const entry = Object.entries(db.users).find(([, x]) => x.uid === socket.data.uid); if (!entry) return ack({ error: 'لا يوجد حساب' });
    if (!checkPw(entry[1], old)) return ack({ error: 'كلمة المرور الحالية غير صحيحة' });
    if (String(password || '').length < 6) return ack({ error: 'كلمة المرور 6 أحرف على الأقل' });
    entry[1].salt = rid() + rid(); entry[1].hash = hashPw(password, entry[1].salt); save(); ack({ ok: true });
  });
  socket.on('auth:logout', ({ token } = {}) => { if (db.tokens[token]) { delete db.tokens[token]; save(); } });

  socket.on('hello', ({ token } = {}, ack) => {
    if (typeof ack !== 'function') return;
    const tk = db.tokens[str(token, 64)];
    if (!tk) return ack({ ok: false, needLogin: true, needCode: !!ACCESS_CODE });
    const uid = tk.uid; socket.data.uid = uid;
    const uname = (Object.entries(db.users).find(([, x]) => x.uid === uid) || [''])[0];
    const peers = [...online.entries()].map(([id, o]) => pub(id, o));
    const archive = {}; FLOOR_IDS.forEach(f => archive[f] = db.archive[f].map(archiveSummary));
    ack({ ok: true, uid, username: uname, profile: db.profiles[uid] || null, profiles: db.profiles, peers,
      boards: db.boards, meetings: db.meetings, archive, minutes: db.minutes.slice(-100).reverse(), ice: ICE, ai: !!AI_KEY, voiceMode: process.env.VOICE_MODE === 'relay' ? 'relay' : 'auto', self: socket.id });
  });

  socket.on('profile:save', p => {
    if (!authed() || !p) return;
    const look = p.look || {};
    const prof = { name: str(p.name, 30), role: str(p.role, 40), desk: /^f[1-9]:(m1|[a-d][1-4])$/.test(p.desk || '') ? p.desk : null, t: Date.now(),
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
      moving: !!s.moving, floor: validFloor(s.floor) ? s.floor : 'f3', face: ['up', 'down', 'left', 'right'].includes(s.face) ? s.face : 'down', say: s.say ? { text: str(s.say.text, 120), t: Date.now() } : null });
    const first = !online.has(socket.id); online.set(socket.id, o);
    trackMeeting(socket.id, o.floor, o.x, o.y);
    if (first) socket.broadcast.emit('peer:join', pub(socket.id, o)); else socket.broadcast.volatile.emit('pos', pub(socket.id, o));
  });

  /* ----- المحادثة والمساحة المشتركة بين شخصين ----- */
  socket.on('pair:open', ({ other } = {}, ack) => {
    if (!authed() || typeof ack !== 'function') return;
    other = str(other, 64); if (!other || other === socket.data.uid) return ack(null);
    const key = pairKey(socket.data.uid, other); const p = getPair(key);
    for (const r of socket.rooms) if (r.startsWith('pair:')) socket.leave(r);
    socket.join('pair:' + key); ack({ key, doc: pairDoc(p), msgs: p.msgs.slice(-80) });
  });
  socket.on('pair:close', () => { for (const r of socket.rooms) if (r.startsWith('pair:')) socket.leave(r); });
  socket.on('pair:msg', ({ other, text } = {}) => {
    if (!authed()) return; other = str(other, 64); text = str(text, 1000); if (!other || !text) return;
    const key = pairKey(socket.data.uid, other);
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
    const me = socket.data.uid, key = pairKey(me, bot), p = getPair(key), b = BOTS[bot];
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

  /* ----- موظفة الاستقبال نور ----- */
  socket.on('ai:nour', async ({ history, context, floor } = {}, ack) => {
    const fl = FLOORS.find(f => f.id === floor) || FLOORS.find(f => f.id === 'f3');
    if (!authed() || typeof ack !== 'function') return;
    const hist = (Array.isArray(history) ? history : []).slice(-12).map(m => ({ by: m.me ? 'u' : 'nour', text: str(m.text, 800) })).filter(m => m.text);
    let guide = null;
    try {
      const text = await claudeWithTools({
        system: `أنت «نور»، موظفة الاستقبال الافتراضية (ذكاء اصطناعي) في مبنى مجموعة سنكري القابضة الافتراضي. الزائر الآن في الطابق ${fl.n}: ${fl.name}. طوابق المبنى: ${FLOORS.map(f => f.n + ' ' + f.name).join('، ')}، والتنقل بينها بالمصعد في الاستقبال. ردّي بالعربية الفصحى بإيجاز ولطف (جملتان إلى أربع).
مخطط هذا الطابق: الاستقبال والمصعد عند المدخل، ${fl.manager}، أربع مجموعات مكاتب (${fl.pods.join('، ')})، غرفة الاجتماعات، الاستراحة، وغرفة «لوحة التخطيط المشترك» وفيها خمس لوحات بيضاء (العامة + لوحة لكل قسم) بملاحظات لاصقة وأسهم وأطر.
طريقة الاستخدام: الحركة بالأسهم أو WASD أو بالنقر. الاقتراب من مكتب زميل يفتح محادثة ومساحة مشتركة (اتفاقات، مهام، ملفات) وزر «مكالمة صوتية». دخول غرفة الاجتماعات يشغّل الصوت تلقائياً بين الحاضرين ويتيح مشاركة الشاشة وإنشاء محضر بالذكاء الاصطناعي يوزّع المهام. الوقوف أمام أي لوحة في غرفة التخطيط يفتحها (لوحة بيضاء بملاحظات لاصقة يمكن شطبها وأسهم وأطر وقلم) ويضعك في قناة صوتية خاصة بها مع من يقف أمامها. الحالة (متاح/مشغول/تركيز) من الشريط العلوي، ووضع التركيز يجعل الزائر يطرق الباب.
${str(context, 2500)}
إذا سأل عن مكان أو شخص فاستخدمي أداة show_way لرسم الطريق إليه، ثم أخبريه أن الخط البنفسجي يدله.`,
        messages: toTurns(hist, 'nour'),
        tools: [{ name: 'show_way', description: 'رسم خط إرشاد على الخريطة من الزائر إلى مكان أو مكتب شخص', input_schema: { type: 'object', properties: { target: { type: 'string', description: 'أحد: manager, pod_a, pod_b, pod_c, pod_d, meeting, lounge, reception, elevator, planning, board_general, board_a, board_b, board_c, board_d, my_desk، أو اسم شخص، أو اسم قسم' } }, required: ['target'] } }],
        handlers: { show_way: ({ target }) => { guide = str(target, 60); return { ok: true }; } }
      });
      ack({ text, guide });
    } catch (e) { if (!/no-key/.test(e.message)) console.warn(e.message); ack({ text: null, guide: null }); }
  });

  /* ----- غرفة الاجتماعات ----- */
  socket.on('meeting:msg', ({ text, floor } = {}) => {
    if (!authed() || !validFloor(floor)) return; text = str(text, 1000); if (!text) return;
    if (!meetingOf(floor).sid) { meetingOf(floor).sid = rid(); meetingOf(floor).startedAt = Date.now(); }
    pushMeetMsg(floor, { id: rid(), by: socket.data.uid, name: nameOf(socket.data.uid), text, t: Date.now() });
  });
  socket.on('meeting:new', ({ floor } = {}) => { if (!authed() || !validFloor(floor)) return; startSession(floor); });
  socket.on('meeting:session', ({ floor, sid } = {}, ack) => {
    if (!authed() || typeof ack !== 'function' || !validFloor(floor)) return;
    const a = db.archive[floor].find(x => x.sid === sid); ack(a ? { ...a, minutes: db.minutes.filter(m => m.sid === sid) } : null);
  });
  socket.on('ai:meetbots', async ({ bots, floor } = {}) => {
    if (!authed() || !validFloor(floor)) return; const here = (Array.isArray(bots) ? bots : []).filter(b => BOTS[b]); if (!here.length) return;
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
  socket.on('minutes:make', async ({ floor } = {}, ack) => {
    if (!authed() || typeof ack !== 'function' || !validFloor(floor)) return;
    const mt = meetingOf(floor), fl = FLOORS.find(f => f.id === floor);
    const l = mt.msgs.filter(m => m.t >= mt.startedAt);
    if (l.length < 2) return ack({ error: 'اكتبوا نقاشاً أولاً ثم أنشئوا المحضر' });
    if (!AI_KEY) return ack({ error: 'إنشاء المحضر يحتاج مفتاح الذكاء الاصطناعي في إعدادات الخادم' });
    try {
      const attendees = [...new Set(l.map(m => m.name))];
      const res = await claude({ fast: false, max: 1500, system: 'تكتب محاضر اجتماعات دقيقة بالعربية الفصحى. أعد JSON فقط.', messages: [{ role: 'user', content:
        `اكتب محضر اجتماع لفريق ${fl.name} من النقاش التالي، دون إضافة ما لم يُذكر.\nالحاضرون: ${attendees.join('، ')}\nالنقاش:\n${l.map(m => `${m.name}: ${m.text}`).join('\n')}\n\nالشكل: {"title":"عنوان قصير","summary":"ملخص في جملتين","decisions":["..."],"actions":[{"who":"اسم أحد الحاضرين كما ورد","what":"المهمة","due":"الموعد إن ذُكر وإلا فارغ"}]}` }] });
      const j = parseJSON(res.content.map(c => c.text || '').join(''));
      const doc = { id: rid(), title: str(j.title || 'محضر اجتماع', 120), summary: str(j.summary, 800), decisions: (j.decisions || []).slice(0, 12).map(x => str(x)),
        actions: (j.actions || []).slice(0, 15).map(a => ({ who: str(a.who, 40), what: str(a.what), due: str(a.due, 60) })), attendees, floor, sid: mt.sid, t: Date.now(), by: socket.data.uid };
      db.minutes.push(doc); if (db.minutes.length > 200) db.minutes.shift();
      let n = 0;
      for (const a of doc.actions) {
        const id = findIdByName(a.who); if (!id || id === socket.data.uid) continue;
        const key = pairKey(socket.data.uid, id); const p = getPair(key);
        applyPairOp(p, socket.data.uid, id, { type: 'task:add', text: a.what + (a.due ? ' (' + a.due + ')' : '') }); emitPair(key); n++;
      }
      save(); io.emit('minutes', db.minutes.slice(-100).reverse()); ack({ ok: true, distributed: n });
    } catch (e) { console.warn(e.message); ack({ error: 'تعذّر إنشاء المحضر، حاول مرة أخرى' }); }
  });

  /* ----- لوحات التخطيط المشترك ----- */
  socket.on('wb:op', ({ bid, op } = {}, ack) => {
    const b = db.boards[bid]; if (!authed() || !b || !op) return;
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
