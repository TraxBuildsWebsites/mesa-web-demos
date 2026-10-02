'use strict';
/* ===== Window Cleaning Blitz – core: utils, storage, data model ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

const STATUS = {
  yes:   { label: 'Yes',   color: '#22c55e' },
  no:    { label: 'No',    color: '#ef4444' },
  maybe: { label: 'Maybe', color: '#facc15' },
  avoid: { label: 'Avoid', color: '#374151' }
};
const TIERS = [4, 8, 12];
const ROLES = ['Owner', 'Knocker', 'Tech'];
const JOB_STATUS = { scheduled: 'Scheduled', in_progress: 'In progress', done: 'Done', paid: 'Paid' };
const COLORS = ['#38bdf8', '#f472b6', '#a78bfa', '#fb923c', '#34d399', '#f87171', '#fbbf24', '#2dd4bf'];

/* ---------- dates (all local "YYYY-MM-DD" strings; math done in UTC so no DST surprises) ---------- */
const pad = n => String(n).padStart(2, '0');
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function tsDate(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function pdate(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function addDays(s, n) { const t = new Date(pdate(s) + n * 864e5); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
function diffDays(a, b) { return Math.round((pdate(a) - pdate(b)) / 864e5); }
function weekStart(s) { const dow = new Date(pdate(s)).getUTCDay(); return addDays(s, -((dow + 6) % 7)); }
function fmtDate(s) { if (!s) return '—'; return new Date(pdate(s)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); }
function fmtShort(s) { return new Date(pdate(s)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
function fmtTs(ts) { return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function fmtClock(ts) { return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
function fmtTime(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); return ((h % 12) || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'AM' : 'PM'); }
function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function fmtHM(min) { min = Math.max(0, Math.round(min)); return Math.floor(min / 60) + 'h ' + pad(min % 60) + 'm'; }
function tsToLocalInput(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
const money = n => { n = Number(n) || 0; return '$' + (Number.isInteger(n) ? n : n.toFixed(2)); };
const money2 = n => '$' + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/, RE_TIME = /^\d{2}:\d{2}$/;

/* ---------- recurring-plan math ---------- */
const nextFrom = (last, weeks) => addDays(last, weeks * 7);
function dueInfo(pl) {
  if (!pl || !pl.next) return { cls: '', label: '', d: null };
  const d = diffDays(pl.next, todayStr());
  if (d < 0) return { cls: 'over', label: 'Overdue ' + (-d) + 'd', d };
  if (d === 0) return { cls: 'soon', label: 'Due today', d };
  if (d <= 7) return { cls: 'week', label: 'Due this week', d };
  return { cls: 'ok', label: 'In ' + d + ' days', d };
}
const visitsPerMonth = w => 52 / w / 12;
const mrrOf = pl => (Number(pl.price) || 0) * visitsPerMonth(pl.weeks);

/* ---------- state (persistence lives ONLY in storage.js → DataStore) ---------- */
let meta = null;        // everything except pins
let pins = {};          // pins[hoodId] = [pin]
let curHood = null;     // current neighborhood id

const defaultSettings = () => ({
  prices: { 4: 40, 8: 45, 12: 50 },
  me: 'Trax with Window Cleaning Blitz',
  reviewLink: '',
  weekCap: 0,          // 0 = off; weekly scheduled/worked hours warning threshold
  breakPaid: false
});

/* ---------- sanitizers (used for load AND import) ---------- */
const S_ = (v, max = 2000) => typeof v === 'string' ? v.slice(0, max) : '';
const N_ = (v, d = 0) => { v = Number(v); return isFinite(v) ? v : d; };
const D_ = v => typeof v === 'string' && RE_DATE.test(v) ? v : '';
const T_ = v => typeof v === 'string' && RE_TIME.test(v) ? v : '';
const O_ = (v, list, d) => list.includes(v) ? v : d;

function cleanPin(x) {
  if (!x || !isFinite(x.lat) || !isFinite(x.lng) || !STATUS[x.status]) return null;
  const p = { id: S_(x.id, 40) || uid(), lat: +x.lat, lng: +x.lng, status: x.status, note: S_(x.note), name: S_(x.name, 200), phone: S_(x.phone, 40), email: S_(x.email, 200),
    created: N_(x.created, Date.now()), updated: N_(x.updated, Date.now()), plan: null, thread: [] };
  if (x.plan && TIERS.includes(+x.plan.weeks)) {
    const pl = x.plan;
    p.plan = { weeks: +pl.weeks, price: N_(pl.price), start: D_(pl.start), last: D_(pl.last), next: D_(pl.next), assignee: S_(pl.assignee, 40),
      history: Array.isArray(pl.history) ? pl.history.filter(h => RE_DATE.test(h)).slice(0, 200) : [] };
    if (!p.plan.next) p.plan.next = p.plan.last ? nextFrom(p.plan.last, p.plan.weeks) : p.plan.start;
  }
  if (Array.isArray(x.thread)) p.thread = x.thread.map(m => m && typeof m.text === 'string' ? { id: S_(m.id, 40) || uid(), ts: N_(m.ts, Date.now()), dir: O_(m.dir, ['out', 'in'], 'out'), label: S_(m.label, 60), text: S_(m.text, 4000) } : null).filter(Boolean);
  return p;
}
function cleanHood(h) {
  if (!h || !Array.isArray(h.center) || !isFinite(h.center[0]) || !isFinite(h.center[1])) return null;
  return { id: S_(h.id, 40) || uid(), name: S_(h.name, 120) || 'Area', center: [+h.center[0], +h.center[1]], zoom: Math.min(21, Math.max(3, N_(h.zoom, 17))), created: N_(h.created, Date.now()) };
}
function cleanMember(m) {
  if (!m || !S_(m.name)) return null;
  return { id: S_(m.id, 40) || uid(), name: S_(m.name, 80), role: O_(m.role, ROLES, 'Knocker'), phone: S_(m.phone, 40), rate: Math.max(0, N_(m.rate)), pin: S_(m.pin, 12).replace(/\D/g, ''), color: S_(m.color, 20) || COLORS[0], active: m.active !== false };
}
function cleanShift(s) {
  if (!s || !D_(s.date) || !T_(s.start) || !T_(s.end) || toMin(s.end) <= toMin(s.start)) return null;
  return { id: S_(s.id, 40) || uid(), memberId: S_(s.memberId, 40), date: s.date, start: s.start, end: s.end, note: S_(s.note, 200) };
}
function cleanEntry(e) {
  if (!e || !isFinite(e.in)) return null;
  const out = e.out == null || e.out === '' ? null : N_(e.out, null);
  return { id: S_(e.id, 40) || uid(), memberId: S_(e.memberId, 40), in: +e.in, out,
    breaks: Array.isArray(e.breaks) ? e.breaks.filter(b => b && isFinite(b.start)).map(b => ({ start: +b.start, end: b.end == null ? null : N_(b.end, null) })) : [] };
}
function cleanJob(j) {
  if (!j) return null;
  return { id: S_(j.id, 40) || uid(), hoodId: S_(j.hoodId, 40), pinId: S_(j.pinId, 40), custName: S_(j.custName, 200), custAddr: S_(j.custAddr, 300), service: S_(j.service, 200) || 'Window cleaning',
    date: D_(j.date), time: T_(j.time), assignee: S_(j.assignee, 40), price: Math.max(0, N_(j.price)), status: O_(j.status, Object.keys(JOB_STATUS), 'scheduled'),
    paidAt: j.paidAt == null ? null : N_(j.paidAt, null), note: S_(j.note, 1000), source: O_(j.source, ['manual', 'plan'], 'manual'), planVisit: D_(j.planVisit), planApplied: !!j.planApplied, created: N_(j.created, Date.now()) };
}
function cleanSettings(s) {
  const d = defaultSettings(); s = s || {};
  const pr = s.prices || {};
  return { prices: { 4: Math.max(0, N_(pr[4], d.prices[4])), 8: Math.max(0, N_(pr[8], d.prices[8])), 12: Math.max(0, N_(pr[12], d.prices[12])) },
    me: S_(s.me, 120) || d.me, reviewLink: S_(s.reviewLink, 300), weekCap: Math.max(0, N_(s.weekCap)), breakPaid: !!s.breakPaid };
}
const arr = (v, f) => Array.isArray(v) ? v.map(f).filter(Boolean) : [];

/* normalize a whole data blob → { meta, pins } (never throws on odd data) */
function normalize(data) {
  data = data || {};
  const m = {
    settings: cleanSettings(data.settings),
    hoods: arr(data.hoods, cleanHood),
    lastHood: S_(data.lastHood, 40),
    filter: Object.assign({ yes: true, no: true, maybe: true, avoid: true, recurringOnly: false }, data.filter && typeof data.filter === 'object' ? {
      yes: data.filter.yes !== false, no: data.filter.no !== false, maybe: data.filter.maybe !== false, avoid: data.filter.avoid !== false, recurringOnly: !!data.filter.recurringOnly } : {}),
    team: arr(data.team, cleanMember),
    currentUser: S_(data.currentUser, 40),
    shifts: arr(data.shifts, cleanShift),
    clock: arr(data.clock, cleanEntry),
    jobs: arr(data.jobs, cleanJob)
  };
  const p = {};
  const src = data.pins && typeof data.pins === 'object' ? data.pins : {};
  m.hoods.forEach(h => { p[h.id] = arr(src[h.id], cleanPin); });
  return { meta: m, pins: p };
}

function seedDefaults() {
  if (!meta.hoods.length) meta.hoods.push({ id: uid(), name: 'Mesa, AZ', center: [33.4152, -111.8315], zoom: 16, created: Date.now() });
  meta.hoods.forEach(h => { if (!pins[h.id]) pins[h.id] = []; });
  if (!meta.hoods.some(h => h.id === meta.lastHood)) meta.lastHood = meta.hoods[0].id;
  if (!meta.team.length) meta.team.push({ id: uid(), name: 'Trax', role: 'Owner', phone: '', rate: 0, pin: '', color: COLORS[0], active: true });
  if (meta.currentUser && !meta.team.some(t => t.id === meta.currentUser && t.active)) meta.currentUser = '';
  curHood = meta.lastHood;
}

async function loadAll() {
  const raw = await DataStore.init();          // { meta, pins:{hoodId:[...]}}  (any backend)
  const base = raw.meta || {};
  base.pins = raw.pins || {};
  const n = normalize(base);
  meta = n.meta; pins = n.pins;
  seedDefaults();
}
function saveMeta() { DataStore.saveMeta(meta); }
function savePins(hid) { DataStore.savePins(hid, pins[hid] || []); }
function saveAll() { saveMeta(); meta.hoods.forEach(h => savePins(h.id)); }

/* ---------- export / import ---------- */
function buildExport() {
  return { app: 'blitz-canvass', version: 3, exported: new Date().toISOString(), settings: meta.settings, hoods: meta.hoods, lastHood: meta.lastHood, filter: meta.filter,
    team: meta.team, shifts: meta.shifts, clock: meta.clock, jobs: meta.jobs, pins };
}
function applyImport(data, mode) {
  const n = normalize(data);
  if (!n.meta.hoods.length && !n.meta.team.length && !n.meta.jobs.length) throw new Error('No neighborhoods, team or jobs found in that file');
  if (mode === 'replace') {
    meta.hoods.forEach(h => DataStore.deletePins(h.id));
    const keepUser = meta.currentUser;
    meta = n.meta; pins = n.pins; meta.currentUser = keepUser;
    seedDefaults();
  } else {
    const byId = (list, extra) => { const ids = new Set(list.map(x => x.id)); extra.forEach(x => { if (!ids.has(x.id)) list.push(x); }); };
    byId(meta.hoods, n.meta.hoods); byId(meta.team, n.meta.team); byId(meta.shifts, n.meta.shifts); byId(meta.clock, n.meta.clock);
    // jobs: imported wins if same id and it exists (keeps latest edits roughly) – otherwise add
    n.meta.jobs.forEach(j => { const i = meta.jobs.findIndex(x => x.id === j.id); if (i < 0) meta.jobs.push(j); });
    n.meta.hoods.forEach(h => {
      const cur = pins[h.id] || (pins[h.id] = []);
      (n.pins[h.id] || []).forEach(p => {
        const i = cur.findIndex(x => x.id === p.id);
        if (i < 0) cur.push(p); else if ((p.updated || 0) > (cur[i].updated || 0)) cur[i] = p;
      });
    });
    seedDefaults();
  }
  saveAll();
}

/* ---------- lookups ---------- */
const findHood = id => meta.hoods.find(h => h.id === id);
const findPin = (hid, pid) => (pins[hid] || []).find(p => p.id === pid);
const member = id => meta.team.find(t => t.id === id);
const activeTeam = () => meta.team.filter(t => t.active);
const memberName = id => { const m = member(id); return m ? m.name : '—'; };
const pinTitle = p => p.name || (p.note || '').split('\n')[0] || 'House pin';
const pinAddr = p => (p.note || '').split('\n')[0] || '';
function allPins() { const out = []; meta.hoods.forEach(h => (pins[h.id] || []).forEach(p => out.push({ h, p }))); return out; }
function jobsOfPin(hid, pid) { return meta.jobs.filter(j => j.hoodId === hid && j.pinId === pid); }
function isCustomer(h, p) { return p.status === 'yes' || !!p.plan || !!p.name || !!p.phone || p.thread.length > 0 || jobsOfPin(h.id, p.id).length > 0; }
function allCustomers() { return allPins().filter(({ h, p }) => isCustomer(h, p)); }
function plannedList() {
  return allPins().filter(x => x.p.plan).sort((a, b) => (a.p.plan.next || '9999').localeCompare(b.p.plan.next || '9999'));
}
const isOwner = () => { const u = member(meta.currentUser); return !u || u.role === 'Owner'; };

/* ---------- jobs (incl. virtual jobs from recurring plans) ---------- */
function planJobsVirtual() {
  const out = [];
  plannedList().forEach(({ h, p }) => {
    const pl = p.plan; if (!pl.next) return;
    const has = meta.jobs.some(j => j.source === 'plan' && j.pinId === p.id && j.planVisit === pl.next);
    if (has) return;
    out.push({ id: 'plan:' + p.id, virtual: true, hoodId: h.id, pinId: p.id, custName: pinTitle(p), custAddr: pinAddr(p), service: 'Recurring cleaning (every ' + pl.weeks + ' wks)',
      date: pl.next, time: '', assignee: pl.assignee || '', price: pl.price, status: 'scheduled', source: 'plan', planVisit: pl.next });
  });
  return out;
}
function allJobs() { return meta.jobs.concat(planJobsVirtual()); }
function jobCust(j) {
  const p = findPin(j.hoodId, j.pinId);
  return { name: p ? pinTitle(p) : (j.custName || 'Customer'), addr: p ? pinAddr(p) : (j.custAddr || '') };
}
function ensureJobFromPlan(pin, hid, status) {
  let j = meta.jobs.find(x => x.source === 'plan' && x.pinId === pin.id && x.planVisit === pin.plan.next && x.status !== 'done' && x.status !== 'paid');
  if (!j) {
    j = cleanJob({ hoodId: hid, pinId: pin.id, custName: pinTitle(pin), custAddr: pinAddr(pin), service: 'Recurring cleaning (every ' + pin.plan.weeks + ' wks)',
      date: pin.plan.next, assignee: pin.plan.assignee, price: pin.plan.price, status, source: 'plan', planVisit: pin.plan.next });
    meta.jobs.push(j);
  } else j.status = status;
  return j;
}
/* complete the current recurring visit: job→done (money owed), plan→last=today, next=last+weeks */
function completePlanVisit(pin, hid, on) {
  const j = ensureJobFromPlan(pin, hid, 'done');
  j.planApplied = true; j.date = on || todayStr();
  markCleaned(pin, on);
  return j;
}
function markCleaned(pin, on) {
  const pl = pin.plan; on = on || todayStr();
  pl.history = (pl.history || []).filter(d => d !== on); pl.history.unshift(on);
  pl.history.sort().reverse();
  pl.last = on; pl.next = nextFrom(on, pl.weeks); pin.updated = Date.now();
}
function setJobStatus(j, st) {
  const pin = findPin(j.hoodId, j.pinId);
  if (st === 'done' && j.source === 'plan' && !j.planApplied && pin && pin.plan) {
    j.planApplied = true; j.status = 'done'; j.date = todayStr(); markCleaned(pin, todayStr()); savePins(j.hoodId); return;
  }
  j.status = st;
  if (st === 'paid') { if (!j.paidAt) j.paidAt = Date.now(); } else j.paidAt = null;
}

/* ---------- time clock math ---------- */
const openEntry = mid => meta.clock.find(e => e.memberId === mid && e.out == null);
const openBreak = e => e && e.breaks.find(b => b.end == null);
function entryBreakMin(e, now) { const end = e.out || now; return e.breaks.reduce((s, b) => s + Math.max(0, ((b.end || end) - b.start) / 60000), 0); }
function entryWorkedMin(e, now) {
  now = now || Date.now();
  const tot = ((e.out || now) - e.in) / 60000;
  return Math.max(0, tot - (meta.settings.breakPaid ? 0 : entryBreakMin(e, now)));
}
function weekEntries(mid, ws) { const we = addDays(ws, 6); return meta.clock.filter(e => e.memberId === mid && tsDate(e.in) >= ws && tsDate(e.in) <= we).sort((a, b) => a.in - b.in); }
function weekWorkedMin(mid, ws) { return weekEntries(mid, ws).reduce((s, e) => s + entryWorkedMin(e), 0); }
function estPay(mid, ws) { const m = member(mid); return m ? Math.round((weekWorkedMin(mid, ws) / 60) * m.rate * 100) / 100 : 0; }

/* ---------- shifts ---------- */
function shiftOverlaps(a, b) { return a.memberId === b.memberId && a.date === b.date && a.id !== b.id && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end); }
function shiftConflicts(s) { return meta.shifts.filter(o => shiftOverlaps(s, o)); }
function weekShiftMin(mid, ws) { const we = addDays(ws, 6); return meta.shifts.filter(s => s.memberId === mid && s.date >= ws && s.date <= we).reduce((t, s) => t + toMin(s.end) - toMin(s.start), 0); }

/* ---------- messaging templates ---------- */
const TPLS = [
  { id: 'follow', label: 'Door follow-up', text: "Hi {name}, it's {me}. Thanks for chatting at your door today! I'd be happy to give you a free quote on the windows at {address}. Just reply here whenever works for you." },
  { id: 'quote', label: 'Quote follow-up', text: "Hi {name}, it's {me} following up on the window cleaning quote for {address}. The price would be {price}. Want me to put you on the schedule?" },
  { id: 'remind', label: 'Recurring reminder', text: "Hi {name}, friendly reminder from Window Cleaning Blitz: your window cleaning at {address} is coming up on {date} ({price}/visit). Reply if you need to change anything!" },
  { id: 'thanks', label: 'Thanks + review', text: "Hi {name}, thank you for choosing Window Cleaning Blitz! If you're happy with how your windows look, a quick review would mean a lot to a small local business.{link}" },
  { id: 'resched', label: 'Reschedule', text: "Hi {name}, it's {me}. I need to reschedule your window cleaning at {address}. Would {date} work, or another day that's better for you? Sorry for the change!" }
];
function fillTemplate(text, p) {
  const pl = p.plan;
  const link = meta.settings.reviewLink ? ' ' + meta.settings.reviewLink : '';
  return text.replace(/\{(name|address|price|date|me|link)\}/g, (_, k) => {
    if (k === 'name') return p.name || 'there';
    if (k === 'address') return pinAddr(p) || '[address]';
    if (k === 'price') return pl && pl.price ? money(pl.price) : '[price]';
    if (k === 'date') return pl && pl.next ? fmtDate(pl.next) : '[date]';
    if (k === 'me') return meta.settings.me;
    if (k === 'link') return link;
  });
}
const reminderText = p => fillTemplate(TPLS.find(t => t.id === 'remind').text, p);
const cleanPhone = s => { s = String(s || '').trim(); const plus = s.startsWith('+') ? '+' : ''; return plus + s.replace(/\D/g, ''); };

/* ---------- misc helpers ---------- */
let toastTimer;
function toast(msg) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2600); }
async function copyText(t) {
  let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (_) {} ta.remove();
  }
  toast(ok ? 'Copied to clipboard' : 'Copy failed – long-press to copy manually'); return ok;
}
async function download(name, mime, text) {
  // Native iOS (Capacitor): WKWebView can't save blob downloads, so write a temp file and open the share sheet (Save to Files / AirDrop / Mail).
  const cap = window.Capacitor, P = cap && cap.isNativePlatform && cap.isNativePlatform() ? cap.Plugins : null;
  if (P && P.Filesystem && P.Share) {
    try {
      const r = await P.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
      await P.Share.share({ title: name, url: r.uri, dialogTitle: 'Save or share ' + name });
    } catch (e) { if (!/cancel/i.test(String(e && e.message))) toast('Could not share file: ' + (e && e.message)); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function ask(title, msg, buttons, input) {
  return new Promise(res => {
    const m = $('#modal');
    m.innerHTML = `<div class="mbox"><h3>${esc(title)}</h3><p>${esc(msg)}</p>${input ? `<input id="mInput" type="${input.type || 'text'}" inputmode="${input.inputmode || 'text'}" autocomplete="off" placeholder="${esc(input.ph || '')}" value="${esc(input.value || '')}">` : ''}<div class="mbtns">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(b.t)}</button>`).join('')}</div></div>`;
    m.hidden = false;
    const inp = $('#mInput'); if (inp) setTimeout(() => inp.focus(), 50);
    const done = v => { m.hidden = true; m.onclick = null; res(v); };
    m.onclick = e => {
      const b = e.target.closest('button[data-i]');
      if (b) { const btn = buttons[+b.dataset.i]; done(input && btn.v === 'ok' ? { ok: true, value: $('#mInput').value } : btn.v); }
      else if (e.target === m) done(null);
    };
    if (inp) inp.onkeydown = e => { if (e.key === 'Enter') { const ok = buttons.find(b => b.v === 'ok'); if (ok) done({ ok: true, value: inp.value }); } };
  });
}
const confirmAsk = (title, msg, okLabel = 'Delete') => ask(title, msg, [{ t: 'Cancel', v: false }, { t: okLabel, v: true, cls: 'danger' }]);
async function askText(title, msg, value = '', opts = {}) {
  const r = await ask(title, msg, [{ t: 'Cancel', v: null }, { t: 'OK', v: 'ok', cls: 'pri' }], Object.assign({ value }, opts));
  return r && r.ok ? r.value : null;
}
