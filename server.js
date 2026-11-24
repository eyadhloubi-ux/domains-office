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
const BOARD_DEFS = [
  ['general', 'لوحة DOMAINS العامة'], ['training', 'مسار التدريب'], ['events', 'مسار الفعاليات'],
  ['projects', 'مسار المشاريع'], ['volunteer', 'مسار التطوع']];
let db = { profiles: {}, pairs: {}, meeting: { startedAt: 0, msgs: [] }, minutes: [], boards: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (e) { /* أول تشغيل */ }
const rid = () => crypto.randomBytes(6).toString('hex');
for (const [id, title] of BOARD_DEFS) {
  if (!db.boards[id]) db.boards[id] = { id, title, kpis: [], updatedAt: Date.now(),
    stages: ['التخطيط', 'التنفيذ', 'المتابعة والتقييم'].map(t => ({ id: rid(), title: t, tasks: [] })) };
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(db), e => { if (!e) fs.rename(tmp, FILE, () => {}); });
  }, 400);
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
const pub = (id, o) => ({ id, uid: o.uid, name: o.name, look: o.look, x: o.x, y: o.y, status: o.status, moving: o.moving, say: o.say, voice: o.voice || null });
const VOICE_RE = /^(meeting|board:[a-z]+|pair:p[a-f0-9]{16})$/;

function emitPair(key) { io.to('pair:' + key).emit('pair:doc', { key, doc: pairDoc(getPair(key)) }); }
function pushPairMsg(key, msg) {
  const p = getPair(key); p.msgs.push(msg); if (p.msgs.length > 300) p.msgs.splice(0, p.msgs.length - 300);
  save(); io.to('pair:' + key).emit('pair:msg', { key, msg });
}
function pushMeetMsg(msg) {
  db.meeting.msgs.push(msg); if (db.meeting.msgs.length > 300) db.meeting.msgs.splice(0, db.meeting.msgs.length - 300);
  save(); io.emit('meeting:msg', msg);
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

function applyBoardOp(b, op) {
  const st = b.stages.find(s => s.id === op.sid);
  switch (op.type) {
    case 'stage:add': if (str(op.title) && b.stages.length < 12) b.stages.push({ id: rid(), title: str(op.title, 60), tasks: [] }); break;
    case 'stage:rename': if (st && str(op.title)) st.title = str(op.title, 60); break;
    case 'stage:del': b.stages = b.stages.filter(s => s.id !== op.sid); break;
    case 'task:add': if (st && str(op.text) && st.tasks.length < 80) st.tasks.push({ id: rid(), text: str(op.text, 200), owner: str(op.owner, 60), due: /^\d{4}-\d{2}-\d{2}$/.test(op.due || '') ? op.due : '', done: false }); break;
    case 'task:update': { const t = st && st.tasks.find(x => x.id === op.tid); if (!t) break; const pch = op.patch || {};
      if ('done' in pch) t.done = !!pch.done; if ('text' in pch && str(pch.text)) t.text = str(pch.text, 200);
      if ('owner' in pch) t.owner = str(pch.owner, 60); if ('due' in pch) t.due = /^\d{4}-\d{2}-\d{2}$/.test(pch.due || '') ? pch.due : ''; break; }
    case 'task:del': if (st) st.tasks = st.tasks.filter(x => x.id !== op.tid); break;
    case 'kpi:add': if (str(op.name) && b.kpis.length < 8) b.kpis.push({ id: rid(), name: str(op.name, 60), target: Math.max(0, +op.target || 0), current: 0, unit: str(op.unit, 15) }); break;
    case 'kpi:set': { const k = b.kpis.find(x => x.id === op.kid); if (k) k.current = Math.max(0, +op.current || 0); break; }
    case 'kpi:del': b.kpis = b.kpis.filter(x => x.id !== op.kid); break;
    default: return false;
  }
  b.updatedAt = Date.now(); return true;
}

io.on('connection', socket => {
  const authed = () => !!socket.data.uid;

  socket.on('hello', ({ uid, code } = {}, ack) => {
    if (typeof ack !== 'function') return;
    if (ACCESS_CODE && str(code, 80) !== ACCESS_CODE) return ack({ ok: false, needCode: true });
    uid = str(uid, 64); if (!/^[a-zA-Z0-9_-]{8,64}$/.test(uid)) return ack({ ok: false });
    socket.data.uid = uid;
    const peers = [...online.entries()].map(([id, o]) => pub(id, o));
    ack({ ok: true, needCode: !!ACCESS_CODE, profile: db.profiles[uid] || null, profiles: db.profiles, peers,
      boards: db.boards, meeting: db.meeting, minutes: db.minutes.slice(-20).reverse(), ice: ICE, ai: !!AI_KEY, self: socket.id });
  });

  socket.on('profile:save', p => {
    if (!authed() || !p) return;
    const look = p.look || {};
    const prof = { name: str(p.name, 30), role: str(p.role, 40), desk: /^[a-z]\d$/.test(p.desk || '') ? p.desk : null, t: Date.now(),
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
      moving: !!s.moving, say: s.say ? { text: str(s.say.text, 120), t: Date.now() } : null });
    const first = !online.has(socket.id); online.set(socket.id, o);
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
  socket.on('ai:nour', async ({ history, context } = {}, ack) => {
    if (!authed() || typeof ack !== 'function') return;
    const hist = (Array.isArray(history) ? history : []).slice(-12).map(m => ({ by: m.me ? 'u' : 'nour', text: str(m.text, 800) })).filter(m => m.text);
    let guide = null;
    try {
      const text = await claudeWithTools({
        system: `أنت «نور»، موظفة الاستقبال الافتراضية (ذكاء اصطناعي) في المكتب الافتراضي لفريق DOMAINS، الطابق 3 من مبنى مجموعة سنكري القابضة الافتراضي (بقية الطوابق قريباً). ردّي بالعربية الفصحى بإيجاز ولطف (جملتان إلى أربع).
مخطط الطابق: الاستقبال والمصعد عند المدخل، مكتب مدير المشروع، أربع مجموعات مكاتب لمسارات التدريب والفعاليات والمشاريع والتطوع، غرفة الاجتماعات، الاستراحة، وغرفة «لوحة التخطيط المشترك» وفيها خمس لوحات (العامة، التدريب، الفعاليات، المشاريع، التطوع).
طريقة الاستخدام: الحركة بالأسهم أو WASD أو بالنقر. الاقتراب من مكتب زميل يفتح محادثة ومساحة مشتركة (اتفاقات، مهام، ملفات) وزر «مكالمة صوتية». دخول غرفة الاجتماعات يشغّل الصوت تلقائياً بين الحاضرين ويتيح مشاركة الشاشة وإنشاء محضر بالذكاء الاصطناعي يوزّع المهام. الوقوف أمام أي لوحة في غرفة التخطيط يفتحها ويضعك في قناة صوتية خاصة بها مع من يقف أمامها. الحالة (متاح/مشغول/تركيز) من الشريط العلوي، ووضع التركيز يجعل الزائر يطرق الباب.
${str(context, 2500)}
إذا سأل عن مكان أو شخص فاستخدمي أداة show_way لرسم الطريق إليه، ثم أخبريه أن الخط البنفسجي يدله.`,
        messages: toTurns(hist, 'nour'),
        tools: [{ name: 'show_way', description: 'رسم خط إرشاد على الخريطة من الزائر إلى مكان أو مكتب شخص', input_schema: { type: 'object', properties: { target: { type: 'string', description: 'أحد: manager, training, events, projects, volunteer, meeting, lounge, reception, planning, board_general, board_training, board_events, board_projects, board_volunteer, my_desk، أو اسم شخص' } }, required: ['target'] } }],
        handlers: { show_way: ({ target }) => { guide = str(target, 60); return { ok: true }; } }
      });
      ack({ text, guide });
    } catch (e) { if (!/no-key/.test(e.message)) console.warn(e.message); ack({ text: null, guide: null }); }
  });

  /* ----- غرفة الاجتماعات ----- */
  socket.on('meeting:msg', ({ text } = {}) => {
    if (!authed()) return; text = str(text, 1000); if (!text) return;
    pushMeetMsg({ id: rid(), by: socket.data.uid, name: nameOf(socket.data.uid), text, t: Date.now() });
  });
  socket.on('meeting:new', () => { if (!authed()) return; db.meeting.startedAt = Date.now(); save(); io.emit('meeting:state', { startedAt: db.meeting.startedAt }); });
  socket.on('ai:meetbots', async ({ bots } = {}) => {
    if (!authed()) return; const here = (Array.isArray(bots) ? bots : []).filter(b => BOTS[b]); if (!here.length) return;
    const tr = db.meeting.msgs.filter(m => m.t >= db.meeting.startedAt).slice(-16).map(m => `${m.name}: ${m.text}`).join('\n');
    let replies = [];
    try {
      const res = await claude({ system: 'تدير شخصيات تجريبية في اجتماع فريق. أعد JSON فقط.', messages: [{ role: 'user', content:
        `الشخصيات:\n${here.map(b => `- id=${b}: «${BOTS[b].name.replace(/ \(.*\)/, '')}»، ${BOTS[b].persona}`).join('\n')}\nنص الاجتماع:\n${tr}\n\nاكتب ردّاً أو ردّين فقط ممن لديه إضافة مفيدة، بالعربية الفصحى، جملة أو جملتان لكل رد، دون اختراع أرقام. الشكل: {"replies":[{"id":"bot-ahmad","text":"..."}]}` }] });
      replies = (parseJSON(res.content.map(c => c.text || '').join('')).replies || []).slice(0, 2);
    } catch (e) { if (!/no-key/.test(e.message)) console.warn(e.message); replies = [{ id: here[0], text: canned() }]; }
    for (const r of replies) if (BOTS[r.id] && r.text) { pushMeetMsg({ id: rid(), by: r.id, name: BOTS[r.id].name, text: str(r.text, 600), t: Date.now() }); io.emit('bot:say', { bot: r.id, text: str(r.text, 120) }); }
  });
  socket.on('minutes:make', async (_, ack) => {
    if (!authed() || typeof ack !== 'function') return;
    const l = db.meeting.msgs.filter(m => m.t >= db.meeting.startedAt);
    if (l.length < 2) return ack({ error: 'اكتبوا نقاشاً أولاً ثم أنشئوا المحضر' });
    if (!AI_KEY) return ack({ error: 'إنشاء المحضر يحتاج مفتاح الذكاء الاصطناعي في إعدادات الخادم' });
    try {
      const attendees = [...new Set(l.map(m => m.name))];
      const res = await claude({ fast: false, max: 1500, system: 'تكتب محاضر اجتماعات دقيقة بالعربية الفصحى. أعد JSON فقط.', messages: [{ role: 'user', content:
        `اكتب محضر اجتماع لفريق DOMAINS من النقاش التالي، دون إضافة ما لم يُذكر.\nالحاضرون: ${attendees.join('، ')}\nالنقاش:\n${l.map(m => `${m.name}: ${m.text}`).join('\n')}\n\nالشكل: {"title":"عنوان قصير","summary":"ملخص في جملتين","decisions":["..."],"actions":[{"who":"اسم أحد الحاضرين كما ورد","what":"المهمة","due":"الموعد إن ذُكر وإلا فارغ"}]}` }] });
      const j = parseJSON(res.content.map(c => c.text || '').join(''));
      const doc = { id: rid(), title: str(j.title || 'محضر اجتماع', 120), summary: str(j.summary, 800), decisions: (j.decisions || []).slice(0, 12).map(x => str(x)),
        actions: (j.actions || []).slice(0, 15).map(a => ({ who: str(a.who, 40), what: str(a.what), due: str(a.due, 60) })), attendees, t: Date.now(), by: socket.data.uid };
      db.minutes.push(doc); if (db.minutes.length > 60) db.minutes.shift();
      let n = 0;
      for (const a of doc.actions) {
        const id = findIdByName(a.who); if (!id || id === socket.data.uid) continue;
        const key = pairKey(socket.data.uid, id); const p = getPair(key);
        applyPairOp(p, socket.data.uid, id, { type: 'task:add', text: a.what + (a.due ? ' (' + a.due + ')' : '') }); emitPair(key); n++;
      }
      save(); io.emit('minutes', db.minutes.slice(-20).reverse()); ack({ ok: true, distributed: n });
    } catch (e) { console.warn(e.message); ack({ error: 'تعذّر إنشاء المحضر، حاول مرة أخرى' }); }
  });

  /* ----- لوحات التخطيط المشترك ----- */
  socket.on('board:op', ({ id, op } = {}) => {
    if (!authed() || !db.boards[id] || !op) return;
    if (applyBoardOp(db.boards[id], op)) { save(); io.emit('board', db.boards[id]); }
  });

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
  socket.on('voice:screen', ({ on } = {}) => {
    if (!socket.data.voice) return; socket.data.screen = !!on;
    socket.to('v:' + socket.data.voice).emit('voice:screen', { id: socket.id, on: !!on, name: nameOf(socket.data.uid) });
  });

  socket.on('disconnect', () => { leaveVoice(); if (online.delete(socket.id)) io.emit('peer:left', { id: socket.id }); });
});

server.listen(PORT, () => console.log(`DOMAINS office on :${PORT}  ai=${AI_KEY ? 'on' : 'off'}  code=${ACCESS_CODE ? 'on' : 'off'}  turn=${process.env.TURN_URL ? 'on' : 'off'}`));
