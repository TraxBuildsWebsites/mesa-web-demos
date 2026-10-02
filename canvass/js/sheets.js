'use strict';
/* ===== Bottom sheets: pin/customer, messages, shift, job, member, time entry, areas ===== */
const ACT = {};
let ctx = null;
const views = {};
const curPin = () => ctx && findPin(ctx.hoodId, ctx.pinId);
const touch = p => { p.updated = Date.now(); };
function persistPin() { savePins(ctx.hoodId); if (ctx.hoodId === curHood) refreshMarkers(); renderHoodSelect(); refreshBadges(); }

function openSheet(c) {
  ctx = c; $('#sheet').hidden = false; $('#scrim').hidden = (page === 'map'); renderSheet(true);
}
function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; ctx = null; removeTemp(); if (page !== 'map') renderPage(); }
function renderSheet(top) {
  if (!ctx) return;
  const sh = $('#sheet'), st = sh.scrollTop;
  $('#sheetBody').innerHTML = views[ctx.view]();
  sh.scrollTop = top ? 0 : st;
  const th = $('#thread'); if (th) th.scrollTop = th.scrollHeight;
}
const sheetHead = (title, back) => `<div class="hd">${back ? `<button class="x" data-act="back" aria-label="Back">‹</button>` : ''}<h2>${esc(title)}</h2><button class="x" data-act="close" aria-label="Close">✕</button></div>`;
const fld = (label, inner, cls = '') => `<label class="f ${cls}"><span>${esc(label)}</span>${inner}</label>`;
const memberOptions = (sel, none) => (none ? `<option value="">${esc(none)}</option>` : '') + meta.team.filter(t => t.active || t.id === sel).map(t => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)} (${t.role})</option>`).join('');

/* ---------- NEW PIN ---------- */
views.new = () => `${sheetHead('New pin here')}
  <p class="mut">Pick what happened at this house:</p>
  <div class="stbtns">${Object.entries(STATUS).map(([k, s]) => `<button class="st st-${k}" data-act="newstatus" data-v="${k}"><i></i>${s.label}</button>`).join('')}</div>
  <button class="btn ghost" data-act="close">Cancel</button>`;
ACT.newstatus = el => {
  const p = createPin(ctx.lat, ctx.lng, el.dataset.v);
  ctx = { view: 'pin', hoodId: curHood, pinId: p.id }; renderSheet(true);
};

/* ---------- PIN / CUSTOMER PROFILE ---------- */
function planHtml(p) {
  const pl = p.plan, di = dueInfo(pl), own = isOwner();
  return `<div class="card plan">
    <div class="row between"><b>↻ Recurring plan</b><span class="badge ${di.cls}">${di.label}</span></div>
    <div class="seg">${TIERS.map(w => `<button class="${pl.weeks === w ? 'on' : ''}" data-act="plantier" data-v="${w}">Every ${w} wks</button>`).join('')}</div>
    <div class="grid2">
      ${fld('Price / visit ($)', `<input type="number" inputmode="decimal" min="0" step="1" data-pf="price" value="${esc(pl.price)}">`)}
      ${fld('Assigned tech', `<select data-pf="assignee">${memberOptions(pl.assignee, 'Unassigned')}</select>`)}
      ${fld('Start date', `<input type="date" data-pf="start" value="${esc(pl.start)}">`)}
      ${fld('Last cleaning', `<input type="date" data-pf="last" value="${esc(pl.last)}">`)}
      ${fld('Next due', `<input type="date" data-pf="next" value="${esc(pl.next)}">`, 'span2')}
    </div>
    <button class="btn big ok" data-act="cleaned">✔ Mark cleaned today</button>
    <div class="row wrap"><button class="btn" data-act="copyrem">📋 Copy reminder text</button><button class="btn" data-act="undo">↶ Undo last visit</button></div>
    <div class="mut small" id="mrrLine">≈ ${money2(mrrOf(pl))} / month (${visitsPerMonth(pl.weeks).toFixed(2)} visits/mo)</div>
    <div class="mut small">Visits: ${pl.history && pl.history.length ? pl.history.slice(0, 6).map(fmtShort).join(' · ') + (pl.history.length > 6 ? ' …' : '') : 'none logged yet'}</div>
    <button class="btn ghost danger" data-act="endplan">End recurring plan</button>
  </div>`;
}
function upgradeHtml() {
  const u = ctx.up;
  return `<div class="card plan">
    <b>↻ Upgrade to recurring</b>
    <div class="seg">${TIERS.map(w => `<button class="${u.weeks === w ? 'on' : ''}" data-act="uptier" data-v="${w}">Every ${w} wks<small>${money(meta.settings.prices[w])}</small></button>`).join('')}</div>
    <div class="grid2">
      ${fld('Price / visit ($)', `<input type="number" inputmode="decimal" min="0" step="1" data-c="upPrice" value="${esc(u.price)}">`)}
      ${fld('Start date', `<input type="date" data-c="upStart" value="${esc(u.start)}">`)}
    </div>
    <label class="chk"><input type="checkbox" data-c="upDone" ${u.done ? 'checked' : ''}> First cleaning is done today (starts the clock)</label>
    <div class="row"><button class="btn big ok" data-act="startplan">Start plan</button><button class="btn" data-act="cancelup">Cancel</button></div>
  </div>`;
}
views.pin = () => {
  const p = curPin(); if (!p) return sheetHead('Not found');
  const jobs = jobsOfPin(ctx.hoodId, p.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `${sheetHead(pinTitle(p))}
  <div class="stbtns">${Object.entries(STATUS).map(([k, s]) => `<button class="st st-${k} ${p.status === k ? 'on' : ''}" data-act="status" data-v="${k}"><i></i>${s.label}</button>`).join('')}</div>
  <div class="grid2">
    ${fld('Name', `<input data-f="name" value="${esc(p.name)}" placeholder="Customer name" autocomplete="off">`)}
    ${fld('Phone', `<input type="tel" inputmode="tel" data-f="phone" value="${esc(p.phone)}" placeholder="480-555-0123">`)}
  </div>
  ${fld('Email', `<input type="email" inputmode="email" data-f="email" value="${esc(p.email)}" placeholder="optional">`)}
  ${fld('Address / notes', `<textarea rows="2" data-f="note" placeholder="123 E Main St – dog in yard, call before…">${esc(p.note)}</textarea>`)}
  ${p.plan ? planHtml(p) : (ctx.up ? upgradeHtml() : (p.status === 'yes' ? `<button class="btn big pri" data-act="upgrade">↻ Upgrade to recurring</button>` : `<div class="mut small">Mark this house <b>Yes</b> to offer a recurring plan.</div>`))}
  <div class="card">
    <div class="row between"><b>Jobs</b><button class="btn sm" data-act="newjob">＋ New job</button></div>
    ${jobs.length ? jobs.map(j => `<div class="mini" data-act="editjob" data-id="${esc(j.id)}"><span>${fmtShort(j.date || todayStr())} · ${esc(j.service)}</span><span><b>${money(j.price)}</b> <span class="badge js-${j.status}">${JOB_STATUS[j.status]}</span></span></div>`).join('') : '<div class="mut small">No jobs yet.</div>'}
  </div>
  <div class="row"><button class="btn big pri" data-act="msg">💬 Message${p.thread.length ? ' (' + p.thread.length + ')' : ''}</button></div>
  <div class="row"><button class="btn" data-act="gomap">🗺 Show on map</button><button class="btn ghost danger" data-act="delpin">🗑 Delete pin</button></div>`;
};
ACT.status = el => { const p = curPin(); p.status = el.dataset.v; touch(p); persistPin(); renderSheet(); };
ACT.gomap = () => { const hid = ctx.hoodId, pid = ctx.pinId; closeSheet(); goToPin(hid, pid); };
ACT.delpin = async () => {
  const p = curPin(); const ok = await confirmAsk('Delete this pin?', pinTitle(p) + ' will be removed (jobs keep a copy of the name).');
  if (!ok) return; const hid = ctx.hoodId;
  meta.jobs.forEach(j => { if (j.hoodId === hid && j.pinId === p.id) { const c = jobCust(j); j.custName = c.name; j.custAddr = c.addr; } });
  pins[hid] = pins[hid].filter(x => x.id !== p.id); savePins(hid); saveMeta();
  closeSheet(); refreshMarkers(); renderHoodSelect(); refreshBadges(); if (page !== 'map') renderPage();
};
ACT.upgrade = () => { const w = 8; ctx.up = { weeks: w, price: meta.settings.prices[w], start: todayStr(), done: false }; renderSheet(); };
ACT.uptier = el => { const w = +el.dataset.v; ctx.up.weeks = w; ctx.up.price = meta.settings.prices[w]; renderSheet(); };
ACT.cancelup = () => { ctx.up = null; renderSheet(); };
ACT.startplan = () => {
  const p = curPin(), u = ctx.up;
  if (!RE_DATE.test(u.start)) { toast('Pick a start date'); return; }
  p.plan = { weeks: u.weeks, price: Math.max(0, +u.price || 0), start: u.start, last: '', next: u.start, assignee: '', history: [] };
  touch(p);
  if (u.done) completePlanVisit(p, ctx.hoodId, todayStr());
  ctx.up = null; persistPin(); saveMeta(); renderSheet(); toast('Recurring plan started – next due ' + fmtDate(p.plan.next));
};
ACT.plantier = el => {
  const p = curPin(), pl = p.plan, w = +el.dataset.v, old = pl.weeks;
  if (Number(pl.price) === Number(meta.settings.prices[old])) pl.price = meta.settings.prices[w];
  pl.weeks = w; if (pl.last) pl.next = nextFrom(pl.last, w);
  touch(p); persistPin(); renderSheet();
};
ACT.cleaned = () => {
  const p = curPin(); completePlanVisit(p, ctx.hoodId, todayStr()); saveMeta(); persistPin(); renderSheet();
  toast('Cleaned today logged · job added (' + money(p.plan.price) + ' owed) · next due ' + fmtDate(p.plan.next));
};
ACT.undo = () => {
  const p = curPin(), pl = p.plan;
  if (!pl.history.length) { toast('No visits to undo'); return; }
  const d = pl.history.shift(); pl.last = pl.history[0] || ''; pl.next = pl.last ? nextFrom(pl.last, pl.weeks) : pl.start;
  const j = meta.jobs.slice().reverse().find(x => x.source === 'plan' && x.pinId === p.id && x.planApplied && x.status === 'done');
  if (j) meta.jobs = meta.jobs.filter(x => x !== j);
  touch(p); saveMeta(); persistPin(); renderSheet(); toast('Removed visit ' + fmtShort(d));
};
ACT.copyrem = () => copyText(reminderText(curPin()));
ACT.endplan = async () => {
  if (!await confirmAsk('End recurring plan?', 'The customer and message history stay; only the plan is removed.', 'End plan')) return;
  const p = curPin(); p.plan = null; touch(p); persistPin(); renderSheet();
};
/* plan field edits (change event) */
function onPlanField(t) {
  const p = curPin(), pl = p.plan, f = t.dataset.pf; if (!pl) return;
  if (f === 'price') { pl.price = Math.max(0, +t.value || 0); const m = $('#mrrLine'); if (m) m.textContent = '≈ ' + money2(mrrOf(pl)) + ' / month (' + visitsPerMonth(pl.weeks).toFixed(2) + ' visits/mo)'; touch(p); savePins(ctx.hoodId); refreshBadges(); return; }
  if (f === 'assignee') pl.assignee = t.value;
  else if (RE_DATE.test(t.value)) {
    pl[f] = t.value;
    if (f === 'last') pl.next = nextFrom(pl.last, pl.weeks);
    if (f === 'start' && !pl.last) pl.next = pl.start;
  } else if (f === 'last' && !t.value) { pl.last = ''; pl.next = pl.start || pl.next; }
  touch(p); persistPin(); renderSheet();
}

/* ---------- MESSAGES ---------- */
views.msg = () => {
  const p = curPin(); if (!p) return sheetHead('Not found');
  const th = p.thread;
  return `${sheetHead('Message · ' + pinTitle(p), true)}
  <div class="note warn"><b>Nothing sends automatically.</b> “Approve &amp; send” opens your phone's Messages app with this text filled in – you still press Send there. This is a composer + log, not an inbox: customer replies must be pasted in by hand.<br><span class="small">True two-way SMS inside the app (sending and receiving here) would need an SMS provider like Twilio, a backend server and a paid phone number – not set up.</span></div>
  ${fld('Phone', `<input type="tel" inputmode="tel" data-f="phone" value="${esc(p.phone)}" placeholder="480-555-0123">`)}
  <div class="thread" id="thread">${th.length ? th.map(m => `<div class="bub ${m.dir}"><div>${esc(m.text)}</div><small>${m.dir === 'out' ? esc(m.label || 'sent (approved)') : esc(m.label || 'reply')} · ${fmtTs(m.ts)}</small></div>`).join('') : '<div class="mut small center">No messages logged yet.</div>'}</div>
  <div class="tpls">${TPLS.map(t => `<button class="chip" data-act="tpl" data-v="${t.id}">${esc(t.label)}</button>`).join('')}</div>
  ${fld('Message to send (edit freely)', `<textarea rows="5" data-c="draft" placeholder="Pick a template above or type your own…">${esc(ctx.draft || '')}</textarea>`)}
  <button class="btn big pri" data-act="send">✅ Approve &amp; send</button>
  <div class="mut small">To: ${esc(p.phone || '— add a phone number —')}. It is logged as “sent (approved)” the moment you tap – the app can't see whether you then press Send in Messages.</div>
  <div class="card"><b>Log a customer reply</b>
    <textarea rows="2" data-c="reply" placeholder="Paste what the customer texted back…">${esc(ctx.reply || '')}</textarea>
    <button class="btn" data-act="logreply">＋ Log reply</button></div>`;
};
ACT.msg = () => { ctx = { view: 'msg', hoodId: ctx.hoodId, pinId: ctx.pinId, draft: '', reply: '', backTo: ctx.view === 'pin' ? 'pin' : null }; renderSheet(true); };
ACT.back = () => {
  if (ctx.view === 'msg' && ctx.backTo === 'pin') { ctx = { view: 'pin', hoodId: ctx.hoodId, pinId: ctx.pinId }; renderSheet(true); } else closeSheet();
};
ACT.tpl = el => {
  const t = TPLS.find(x => x.id === el.dataset.v); ctx.draft = fillTemplate(t.text, curPin()); renderSheet();
  const ta = $('[data-c="draft"]'); if (ta) ta.focus();
};
ACT.send = async () => {
  const p = curPin(), text = (ctx.draft || '').trim(), phone = cleanPhone(p.phone);
  if (!phone) { toast('Add a phone number first'); return; }
  if (!text) { toast('Pick a template or type a message first'); return; }
  if (/\[(name|address|price|date)\]/.test(text)) {
    const go_ = await ask('Unfilled placeholder', 'The message still has a [bracketed] blank to fill in. Send anyway?', [{ t: 'Edit it', v: false }, { t: 'Send anyway', v: true, cls: 'pri' }]);
    if (!go_) return;
  }
  p.thread.push({ id: uid(), ts: Date.now(), dir: 'out', label: 'sent (approved)', text }); touch(p);
  savePins(ctx.hoodId); ctx.draft = ''; renderSheet(); refreshBadges();
  const href = 'sms:' + phone + '?&body=' + encodeURIComponent(text);
  window.__lastSms = href;
  const a = document.createElement('a'); a.href = href; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
};
ACT.logreply = () => {
  const p = curPin(), text = (ctx.reply || '').trim(); if (!text) { toast('Paste the reply text first'); return; }
  p.thread.push({ id: uid(), ts: Date.now(), dir: 'in', label: 'reply (logged manually)', text }); touch(p);
  savePins(ctx.hoodId); ctx.reply = ''; renderSheet(); refreshBadges();
};

/* ---------- JOB ---------- */
function custOptions(selKey) {
  return `<option value="">— choose customer —</option>` + allCustomers().sort((a, b) => pinTitle(a.p).localeCompare(pinTitle(b.p)))
    .map(({ h, p }) => { const k = h.id + '|' + p.id; return `<option value="${esc(k)}" ${k === selKey ? 'selected' : ''}>${esc(pinTitle(p))}${pinAddr(p) && p.name ? ' – ' + esc(pinAddr(p)) : ''}</option>`; }).join('');
}
views.job = () => {
  const d = ctx.d, key = d.hoodId && d.pinId ? d.hoodId + '|' + d.pinId : '';
  return `${sheetHead(d.id ? 'Edit job' : 'New job', !!ctx.backTo)}
  ${fld('Customer / house', `<select data-d="cust">${custOptions(key)}</select>`)}
  ${fld('Service', `<input data-d="service" value="${esc(d.service)}">`)}
  <div class="grid2">
    ${fld('Date', `<input type="date" data-d="date" value="${esc(d.date)}">`)}
    ${fld('Time', `<input type="time" data-d="time" value="${esc(d.time)}">`)}
    ${fld('Assigned tech', `<select data-d="assignee">${memberOptions(d.assignee, 'Unassigned')}</select>`)}
    ${fld('Price ($)', `<input type="number" inputmode="decimal" min="0" step="1" data-d="price" value="${esc(d.price)}">`)}
  </div>
  ${fld('Status', `<select data-d="status">${Object.entries(JOB_STATUS).map(([k, v]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
  ${fld('Notes', `<textarea rows="2" data-d="note">${esc(d.note)}</textarea>`)}
  ${d.source === 'plan' ? '<div class="mut small">↻ Recurring-plan visit. Marking it Done also logs the cleaning and sets the next due date.</div>' : ''}
  <div class="row"><button class="btn big pri" data-act="savejob">Save job</button>${d.id && d.status !== 'paid' ? `<button class="btn big ok" data-act="paidjob">💵 Mark paid</button>` : ''}</div>
  ${d.id ? `<button class="btn ghost danger" data-act="deljob">🗑 Delete job</button>` : ''}`;
};
function openJob(j, backTo) {
  openSheet({ view: 'job', backTo: backTo || null, d: Object.assign({}, j) });
}
function newJobDraft(hid, pid) {
  const p = hid && pid ? findPin(hid, pid) : null;
  return { hoodId: hid || '', pinId: pid || '', service: 'Window cleaning', date: todayStr(), time: '', assignee: p && p.plan ? p.plan.assignee : '', price: p && p.plan ? p.plan.price : '', status: 'scheduled', note: '', source: 'manual' };
}
ACT.newjob = () => { const back = ctx && ctx.view === 'pin' ? { view: 'pin', hoodId: ctx.hoodId, pinId: ctx.pinId } : null; openSheet({ view: 'job', backTo: back, d: newJobDraft(ctx && ctx.hoodId, ctx && ctx.pinId) }); };
ACT.editjob = el => {
  const j = meta.jobs.find(x => x.id === el.dataset.id); if (!j) return;
  const back = ctx && ctx.view === 'pin' ? { view: 'pin', hoodId: ctx.hoodId, pinId: ctx.pinId } : null; openJob(j, back);
};
function saveJobDraft(forcePaid) {
  const d = ctx.d;
  if (!d.hoodId || !d.pinId) { toast('Choose a customer or house first'); return false; }
  if (!RE_DATE.test(d.date)) { toast('Pick a date'); return false; }
  const pin = findPin(d.hoodId, d.pinId);
  let j = d.id && meta.jobs.find(x => x.id === d.id);
  const status = forcePaid ? 'paid' : d.status;
  if (!j) { j = cleanJob({ ...d, status: 'scheduled', custName: pin ? pinTitle(pin) : '', custAddr: pin ? pinAddr(pin) : '' }); meta.jobs.push(j); }
  else Object.assign(j, cleanJob({ ...d, id: j.id, paidAt: j.paidAt, planApplied: j.planApplied, created: j.created, custName: pin ? pinTitle(pin) : j.custName, custAddr: pin ? pinAddr(pin) : j.custAddr, status: j.status }));
  if (status !== j.status) setJobStatus(j, status);
  saveMeta(); return true;
}
ACT.savejob = () => { if (saveJobDraft(false)) { toast('Job saved'); closeSheet(); refreshBadges(); } };
ACT.paidjob = () => { if (saveJobDraft(true)) { toast('Marked paid'); closeSheet(); refreshBadges(); } };
ACT.deljob = async () => {
  if (!await confirmAsk('Delete this job?', 'This removes it from schedule and revenue.')) return;
  meta.jobs = meta.jobs.filter(x => x.id !== ctx.d.id); saveMeta(); closeSheet(); refreshBadges();
};

/* ---------- SHIFT ---------- */
views.shift = () => {
  const d = ctx.d;
  return `${sheetHead(d.id ? 'Edit shift' : 'New shift')}
  ${fld('Team member', `<select data-d="memberId">${memberOptions(d.memberId)}</select>`)}
  <div class="grid2">
    ${fld('Date', `<input type="date" data-d="date" value="${esc(d.date)}">`, 'span2')}
    ${fld('Start', `<input type="time" data-d="start" value="${esc(d.start)}">`)}
    ${fld('End', `<input type="time" data-d="end" value="${esc(d.end)}">`)}
  </div>
  ${fld('Note', `<input data-d="note" value="${esc(d.note)}" placeholder="e.g. Knock Eastmark, Lot 3">`)}
  <button class="btn big pri" data-act="saveshift">Save shift</button>
  ${d.id ? `<button class="btn ghost danger" data-act="delshift">🗑 Delete shift</button>` : ''}`;
};
function openShift(s) { openSheet({ view: 'shift', d: Object.assign({}, s) }); }
ACT.saveshift = async () => {
  const d = ctx.d;
  if (!d.memberId) { toast('Choose a team member'); return; }
  if (!RE_DATE.test(d.date) || !RE_TIME.test(d.start) || !RE_TIME.test(d.end)) { toast('Set date, start and end'); return; }
  if (toMin(d.end) <= toMin(d.start)) { toast('End must be after start (no overnight shifts)'); return; }
  const cand = { id: d.id || '__new', memberId: d.memberId, date: d.date, start: d.start, end: d.end };
  const conf = meta.shifts.filter(o => o.id !== d.id && shiftOverlaps(cand, o));
  if (conf.length) {
    const ok = await ask('⚠ Shift conflict', memberName(d.memberId) + ' already has ' + conf.map(c => fmtTime(c.start) + '–' + fmtTime(c.end)).join(', ') + ' on ' + fmtDate(d.date) + '.', [{ t: 'Go back', v: false }, { t: 'Save anyway', v: true, cls: 'pri' }]);
    if (!ok) return;
  }
  const s = cleanShift({ ...d, id: d.id || uid() });
  const i = meta.shifts.findIndex(x => x.id === s.id); if (i >= 0) meta.shifts[i] = s; else meta.shifts.push(s);
  saveMeta(); closeSheet(); toast('Shift saved');
};
ACT.delshift = async () => {
  if (!await confirmAsk('Delete this shift?', '')) return;
  meta.shifts = meta.shifts.filter(x => x.id !== ctx.d.id); saveMeta(); closeSheet();
};

/* ---------- TEAM MEMBER ---------- */
views.member = () => {
  const d = ctx.d, own = isOwner();
  return `${sheetHead(d.id ? 'Edit team member' : 'Add team member')}
  ${fld('Name', `<input data-d="name" value="${esc(d.name)}" autocomplete="off">`)}
  <div class="grid2">
    ${fld('Role', `<select data-d="role">${ROLES.map(r => `<option ${d.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>`)}
    ${fld('Phone', `<input type="tel" inputmode="tel" data-d="phone" value="${esc(d.phone)}">`)}
    ${own ? fld('Hourly pay ($/hr)', `<input type="number" inputmode="decimal" min="0" step="0.25" data-d="rate" value="${esc(d.rate)}">`) : ''}
    ${fld('PIN (optional, 4 digits)', `<input type="password" inputmode="numeric" maxlength="6" data-d="pin" value="${esc(d.pin)}" autocomplete="off">`)}
  </div>
  <div class="mut small">The PIN only asks for a code before clocking in/out or switching “who I am” on this device. It is a convenience, <b>not security</b> – anyone with this browser can read the stored data.</div>
  <button class="btn big pri" data-act="savemember">Save</button>
  ${d.id ? `<button class="btn ghost danger" data-act="archivemember">Remove from team</button>` : ''}`;
};
function openMember(m) { openSheet({ view: 'member', d: Object.assign({}, m) }); }
ACT.savemember = () => {
  const d = ctx.d; if (!String(d.name || '').trim()) { toast('Enter a name'); return; }
  const old = d.id && member(d.id);
  const m = cleanMember({ ...d, name: d.name.trim(), id: d.id || uid(), color: (old && old.color) || COLORS[meta.team.length % COLORS.length], active: true, rate: old && !isOwner() ? old.rate : d.rate });
  if (old) Object.assign(old, m); else meta.team.push(m);
  saveMeta(); closeSheet(); refreshBadges(); toast('Saved ' + m.name);
};
ACT.archivemember = async () => {
  if (activeTeam().length <= 1) { toast('Keep at least one team member'); return; }
  if (!await confirmAsk('Remove from team?', 'They are hidden from pickers; past shifts and timesheets are kept (restore any time from Team).', 'Remove')) return;
  const m = member(ctx.d.id); m.active = false; if (meta.currentUser === m.id) meta.currentUser = ''; saveMeta(); closeSheet();
};

/* ---------- TIME ENTRY ---------- */
views.entry = () => {
  const d = ctx.d;
  return `${sheetHead(d.id ? 'Edit time entry' : 'Add time entry')}
  ${fld('Team member', `<select data-d="memberId">${memberOptions(d.memberId)}</select>`)}
  ${fld('Clock in', `<input type="datetime-local" data-d="inStr" value="${esc(d.inStr)}">`)}
  ${fld('Clock out (blank = still clocked in)', `<input type="datetime-local" data-d="outStr" value="${esc(d.outStr)}">`)}
  ${fld('Total break minutes', `<input type="number" inputmode="numeric" min="0" step="1" data-d="breakMin" value="${esc(d.breakMin)}">`)}
  <div class="mut small">Use this to fix a forgotten clock-out or add missed time.</div>
  <button class="btn big pri" data-act="saveentry">Save</button>
  ${d.id ? `<button class="btn ghost danger" data-act="delentry">🗑 Delete entry</button>` : ''}`;
};
function openEntry_(e, mid) {
  const d = e ? { id: e.id, memberId: e.memberId, inStr: tsToLocalInput(e.in), outStr: e.out ? tsToLocalInput(e.out) : '', breakMin: Math.round(entryBreakMin(e, Date.now())) }
    : { memberId: mid || meta.currentUser || (activeTeam()[0] || {}).id, inStr: tsToLocalInput(Date.now() - 36e5), outStr: tsToLocalInput(Date.now()), breakMin: 0 };
  openSheet({ view: 'entry', d });
}
ACT.saveentry = () => {
  const d = ctx.d, tin = new Date(d.inStr).getTime(), tout = d.outStr ? new Date(d.outStr).getTime() : null;
  if (!isFinite(tin)) { toast('Set a clock-in time'); return; }
  if (tout != null && (!isFinite(tout) || tout <= tin)) { toast('Clock-out must be after clock-in'); return; }
  const bm = Math.max(0, +d.breakMin || 0);
  const e = d.id && meta.clock.find(x => x.id === d.id);
  const old = e ? Math.round(entryBreakMin(e, Date.now())) : 0;
  const target = e || cleanEntry({ id: uid(), memberId: d.memberId, in: tin, out: tout, breaks: [] });
  target.memberId = d.memberId; target.in = tin; target.out = tout;
  if (!e || bm !== old) target.breaks = bm ? [{ start: tin, end: tin + bm * 60000 }] : [];
  if (!e) meta.clock.push(target);
  saveMeta(); closeSheet(); toast('Time entry saved');
};
ACT.delentry = async () => {
  if (!await confirmAsk('Delete time entry?', '')) return;
  meta.clock = meta.clock.filter(x => x.id !== ctx.d.id); saveMeta(); closeSheet();
};

/* ---------- AREAS (neighborhoods) ---------- */
views.areas = () => `${sheetHead('Saved neighborhoods')}
  ${meta.hoods.map(h => `<div class="mini ${h.id === curHood ? 'cur' : ''}"><div data-act="openhood" data-id="${esc(h.id)}" class="grow"><b>${esc(h.name)}</b><br><span class="mut small">${(pins[h.id] || []).length} pins · zoom ${h.zoom}</span></div>
    <button class="btn sm" data-act="renamehood" data-id="${esc(h.id)}">Rename</button><button class="btn sm danger" data-act="delhood" data-id="${esc(h.id)}">🗑</button></div>`).join('')}
  <button class="btn big pri" data-act="savehere">＋ Save current map view as new area</button>
  <div class="mut small">The map reopens the last neighborhood you used, at the zoom you left it. Pins are stored per neighborhood.</div>`;
ACT.openhood = el => { switchHood(el.dataset.id); closeSheet(); };
ACT.renamehood = async el => { const h = findHood(el.dataset.id); const n = await askText('Rename area', '', h.name); if (n && n.trim()) { h.name = n.trim().slice(0, 120); saveMeta(); renderHoodSelect(); renderSheet(); } };
ACT.delhood = async el => {
  if (meta.hoods.length <= 1) { toast('Keep at least one area'); return; }
  const h = findHood(el.dataset.id);
  if (!await confirmAsk('Delete “' + h.name + '”?', (pins[h.id] || []).length + ' pins in it will be deleted. Export first if unsure.')) return;
  meta.jobs.forEach(j => { if (j.hoodId === h.id) { const c = jobCust(j); j.custName = c.name; j.custAddr = c.addr; } });
  meta.hoods = meta.hoods.filter(x => x.id !== h.id); delete pins[h.id]; DataStore.deletePins(h.id);
  if (curHood === h.id) { curHood = meta.hoods[0].id; meta.lastHood = curHood; if (map) { map.setView(meta.hoods[0].center, meta.hoods[0].zoom); } }
  saveMeta(); refreshMarkers(); renderHoodSelect(); renderSheet();
};
ACT.savehere = async () => {
  const n = await askText('Name this area', 'e.g. Eastmark – Phase 2', ''); if (!n || !n.trim()) return;
  const c = map.getCenter(); const h = addHood(n.trim().slice(0, 120), [+c.lat.toFixed(6), +c.lng.toFixed(6)], map.getZoom());
  switchHood(h.id); closeSheet(); toast('Saved ' + h.name);
};

/* ---------- sheet input wiring ---------- */
function wireSheet() {
  const body = $('#sheetBody');
  body.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.f) { const p = curPin(); if (!p) return; p[t.dataset.f] = t.value; touch(p); persistPin(); }
    else if (t.dataset.c) {
      const k = t.dataset.c;
      if (k === 'upPrice') ctx.up.price = t.value; else if (k === 'upStart') ctx.up.start = t.value; else if (k === 'upDone') ctx.up.done = t.checked; else ctx[k] = t.value;
    } else if (t.dataset.d) {
      const k = t.dataset.d;
      if (k === 'cust') { const [h, p] = t.value.split('|'); ctx.d.hoodId = h || ''; ctx.d.pinId = p || ''; const pin = h && findPin(h, p); if (pin && pin.plan && !ctx.d.price) { ctx.d.price = pin.plan.price; ctx.d.price_ = 1; } }
      else ctx.d[k] = t.value;
    }
  });
  body.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.pf) onPlanField(t);
    else if (t.dataset.c === 'upDone') ctx.up.done = t.checked;
    else if (t.dataset.d === 'cust' && ctx.view === 'job') renderSheet();
  });
}
