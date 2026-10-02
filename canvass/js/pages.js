'use strict';
/* ===== Tab pages: Today, Map, Customers(+Recurring/Jobs/Messages), Schedule, Team(+Time clock/Settings) ===== */
let page = 'dashboard';
const seg = { customers: 'all', team: 'members' };
const view = { week: weekStart(todayStr()), tsWeek: weekStart(todayStr()), jobFilter: 'open', custQ: '' };
const ALIASES = { dashboard: ['dashboard'], today: ['dashboard'], map: ['map'], schedule: ['schedule'], customers: ['customers', 'all'], recurring: ['customers', 'recurring'], jobs: ['customers', 'jobs'],
  messages: ['customers', 'messages'], team: ['team', 'members'], clock: ['team', 'clock'], timeclock: ['team', 'clock'], settings: ['team', 'settings'] };
function routeName() {
  if (page === 'customers') return { all: 'customers', recurring: 'recurring', jobs: 'jobs', messages: 'messages' }[seg.customers];
  if (page === 'team') return { members: 'team', clock: 'clock', settings: 'settings' }[seg.team];
  return page;
}
function go(name) {
  const r = ALIASES[name] || ALIASES.dashboard;
  page = r[0]; if (r[1]) seg[page] = r[1];
  if (ctx) closeSheetQuiet();
  $$('.page').forEach(p => p.hidden = p.id !== 'p-' + page);
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === page));
  document.body.dataset.page = page;
  try { history.replaceState(null, '', '#' + routeName()); } catch (e) {}
  if (page === 'map') { ensureMap(); renderHoodSelect(); setTimeout(() => map.invalidateSize(), 50); refreshMarkers(); } else renderPage();
  window.scrollTo(0, 0);
}
function closeSheetQuiet() { $('#sheet').hidden = true; $('#scrim').hidden = true; ctx = null; if (typeof removeTemp === 'function') removeTemp(); }
function renderPage() {
  if (page === 'map') { updateCounts(); return; }
  const el = $('#p-' + page); if (!el) return;
  const y = window.scrollY, f = document.activeElement;
  el.innerHTML = RENDER[page]();
  window.scrollTo(0, y);
}

/* ---------- shared bits ---------- */
const userName = () => { const u = member(meta.currentUser); return u ? u.name : 'Who am I?'; };
const hdr = (t, sub) => `<header class="ph"><div><h1>${esc(t)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><button class="who" data-act="who">👤 ${esc(userName())}</button></header>`;
const segBar = (items, cur) => `<div class="segbar">${items.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-act="seg" data-v="${k}">${l}</button>`).join('')}</div>`;
const card = (title, body, right = '') => `<section class="card"><div class="row between"><h3>${title}</h3>${right}</div>${body}</section>`;
const empty = t => `<div class="empty">${t}</div>`;
const dot = id => { const m = member(id); return `<i class="mdot" style="background:${m ? m.color : '#94a3b8'}"></i>`; };
async function checkPin(m, why) {
  if (!m.pin) return true;
  const v = await askText('PIN for ' + m.name, why || '', '', { type: 'password', inputmode: 'numeric', ph: 'PIN' });
  if (v === null) return false; if (v === m.pin) return true; toast('Wrong PIN'); return false;
}
function refreshBadges() {
  const due = plannedList().filter(x => { const d = dueInfo(x.p.plan).d; return d != null && d <= 3; }).length;
  const t = $('#tabs [data-v="dashboard"] .bd'); if (t) { t.textContent = due; t.hidden = !due; }
}
const sumBy = (list, f) => list.reduce((s, x) => s + f(x), 0);
const jobSort = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || '');
function dueSoon(days = 3) { return plannedList().filter(x => { const d = dueInfo(x.p.plan).d; return d != null && d <= days; }); }
function upcomingBanner() {
  const l = dueSoon(3); if (!l.length) return '';
  return `<div class="banner" data-act="goto" data-v="recurring"><b>🔔 Upcoming visits</b> ${l.length} due within 3 days: ${l.slice(0, 4).map(x => esc(pinTitle(x.p)) + ' (' + (dueInfo(x.p.plan).d < 0 ? 'overdue' : dueInfo(x.p.plan).d === 0 ? 'today' : fmtDate(x.p.plan.next).split(',')[0]) + ')').join(', ')}${l.length > 4 ? '…' : ''} <u>View</u></div>`;
}

/* ---------- jobs UI ---------- */
function jobCard(j) {
  const c = jobCust(j), vir = j.virtual, pastDue = j.date && j.date < todayStr() && j.status !== 'paid' && j.status !== 'done';
  let btns = '';
  if (j.status === 'scheduled') btns = `<button class="btn sm" data-act="jobact" data-k="start" data-id="${esc(j.id)}">▶ Start</button><button class="btn sm ok" data-act="jobact" data-k="done" data-id="${esc(j.id)}">✔ Done</button>`;
  else if (j.status === 'in_progress') btns = `<button class="btn sm ok" data-act="jobact" data-k="done" data-id="${esc(j.id)}">✔ Done</button>`;
  else if (j.status === 'done') btns = `<button class="btn sm pri" data-act="jobact" data-k="paid" data-id="${esc(j.id)}">💵 Mark paid</button>`;
  return `<div class="job" data-act="${vir ? 'opencust' : 'editjob'}" data-id="${esc(j.id)}" data-h="${esc(j.hoodId)}" data-p="${esc(j.pinId)}">
    <div class="row between"><b>${esc(c.name)}</b><span><b>${money(j.price)}</b> <span class="badge js-${j.status}">${JOB_STATUS[j.status]}</span></span></div>
    <div class="mut small">${esc(j.service)}${vir || j.source === 'plan' ? ' · ↻' : ''}${c.addr ? ' · ' + esc(c.addr) : ''}</div>
    <div class="row between wrap"><span class="small">${fmtDate(j.date)}${j.time ? ' · ' + fmtTime(j.time) : ''} ${pastDue ? '<span class="badge over">Overdue</span>' : ''} · ${dot(j.assignee)}${esc(memberName(j.assignee) === '—' ? 'Unassigned' : memberName(j.assignee))}</span><span class="row">${btns}</span></div></div>`;
}
ACT.jobact = el => {
  const j = allJobs().find(x => x.id === el.dataset.id); if (!j) return;
  const pin = findPin(j.hoodId, j.pinId), k = el.dataset.k;
  if (j.virtual) {
    if (!pin) return;
    if (k === 'start') ensureJobFromPlan(pin, j.hoodId, 'in_progress'); else if (k === 'done') { completePlanVisit(pin, j.hoodId); toast('Visit logged · ' + money(j.price) + ' owed'); }
    savePins(j.hoodId);
  } else {
    if (k === 'start') j.status = 'in_progress'; else if (k === 'done') { setJobStatus(j, 'done'); toast('Done · ' + money(j.price) + ' owed'); } else if (k === 'paid') { setJobStatus(j, 'paid'); toast('Marked paid'); }
  }
  saveMeta(); refreshMarkers(); refreshBadges(); renderPage();
};
ACT.opencust = el => { if (el.dataset.h && el.dataset.p && findPin(el.dataset.h, el.dataset.p)) openSheet({ view: 'pin', hoodId: el.dataset.h, pinId: el.dataset.p }); };

/* ---------- identity ---------- */
ACT.who = async () => {
  const opts = activeTeam().map(m => ({ t: m.name + ' (' + m.role + ')', v: m.id })); opts.push({ t: 'No one (view all)', v: '' }); opts.push({ t: 'Cancel', v: null });
  const r = await ask('Who is using this device?', 'Choose your name. Pay figures are only shown to the Owner.', opts);
  if (r === null) return;
  if (r) { const m = member(r); if (!await checkPin(m, 'Enter your PIN to switch to this person')) return; }
  meta.currentUser = r; saveMeta(); renderPage();
};
ACT.seg = el => { seg[page] = el.dataset.v; try { history.replaceState(null, '', '#' + routeName()); } catch (e) {} renderPage(); };
ACT.tab = el => go(el.dataset.v);
ACT.close = () => closeSheet();
ACT.goto = el => go(el.dataset.v);

/* =====================  DASHBOARD  ===================== */
function renderDashboard() {
  const t = todayStr(), own = isOwner();
  const open = meta.clock.filter(e => e.out == null);
  const jobsToday = allJobs().filter(j => j.status !== 'paid' && ((j.date === t) || (j.virtual && j.date < t))).sort(jobSort);
  const owed = sumBy(meta.jobs.filter(j => j.status === 'done'), j => j.price);
  const mo = t.slice(0, 7);
  const paid = meta.jobs.filter(j => j.status === 'paid');
  const revMonth = sumBy(paid.filter(j => tsDate(j.paidAt || Date.now()).slice(0, 7) === mo), j => j.price), revAll = sumBy(paid, j => j.price);
  const shifts = meta.shifts.filter(s => s.date === t).sort((a, b) => a.start.localeCompare(b.start));
  const cnt = { yes: 0, no: 0, maybe: 0, avoid: 0 }; allPins().forEach(x => cnt[x.p.status]++);
  const total = cnt.yes + cnt.no + cnt.maybe + cnt.avoid;
  const planned = plannedList(), up = planned.filter(x => { const d = dueInfo(x.p.plan).d; return d != null && d <= 7; });
  const mrr = sumBy(planned, x => mrrOf(x.p.plan));
  return `${hdr('Today', fmtDate(t) + ' · Window Cleaning Blitz')}
  ${upcomingBanner()}
  <div class="tiles">
    <button class="tile" data-act="goto" data-v="clock"><small>Clocked in now</small><b>${open.length}</b></button>
    <button class="tile" data-act="goto" data-v="jobs"><small>Jobs today</small><b>${jobsToday.length}</b></button>
    ${own ? `<button class="tile warn" data-act="goto" data-v="jobs"><small>Money owed</small><b>${money(owed)}</b></button>
    <button class="tile good" data-act="goto" data-v="jobs"><small>Revenue (month)</small><b>${money(revMonth)}</b><em>${money(revAll)} all-time</em></button>` : ''}
  </div>
  ${card("Today's schedule", shifts.length ? shifts.map(s => { const m = member(s.memberId), e = openEntry(s.memberId); return `<div class="mini" data-act="editshift" data-id="${esc(s.id)}"><span>${dot(s.memberId)}<b>${esc(memberName(s.memberId))}</b> <span class="mut">${m ? m.role : ''}</span></span><span>${fmtTime(s.start)}–${fmtTime(s.end)} ${e ? '<span class="badge ok">in</span>' : ''}</span></div>`; }).join('') : empty('No shifts today.'), `<button class="btn sm" data-act="goto" data-v="schedule">Open</button>`)}
  ${card("Who's clocked in", open.length ? open.map(e => { const ob = openBreak(e); return `<div class="mini"><span>${dot(e.memberId)}<b>${esc(memberName(e.memberId))}</b> since ${fmtClock(e.in)}</span><span>${ob ? '<span class="badge soon">on break</span> ' : ''}${fmtHM(entryWorkedMin(e))}</span></div>`; }).join('') : empty('Nobody is clocked in.'), `<button class="btn sm" data-act="goto" data-v="clock">Time clock</button>`)}
  ${card('Jobs today', jobsToday.length ? jobsToday.map(jobCard).join('') : empty('No jobs scheduled today.'), `<button class="btn sm" data-act="goto" data-v="jobs">All jobs</button>`)}
  ${card('Canvass (all areas)', `<div class="cnts">${Object.entries(STATUS).map(([k, s]) => `<div><i style="background:${s.color}"></i><b>${cnt[k]}</b><small>${s.label}</small></div>`).join('')}</div>
    <div class="mut small">${total} houses pinned. Houses with no pin are still “open” – not yet approached.${total ? ' Yes-rate: ' + Math.round(cnt.yes / total * 100) + '%.' : ''}</div>`, `<button class="btn sm" data-act="goto" data-v="map">Open map</button>`)}
  ${card('Upcoming recurring visits', up.length ? up.slice(0, 6).map(x => { const di = dueInfo(x.p.plan); return `<div class="mini" data-act="opencust" data-h="${esc(x.h.id)}" data-p="${esc(x.p.id)}"><span><b>${esc(pinTitle(x.p))}</b><br><span class="mut small">Every ${x.p.plan.weeks} wks · ${money(x.p.plan.price)}</span></span><span class="right">${fmtDate(x.p.plan.next)}<br><span class="badge ${di.cls}">${di.label}</span></span></div>`; }).join('') : empty('Nothing due in the next 7 days.'),
    `<button class="btn sm" data-act="goto" data-v="recurring">All</button>`)}
  ${own && planned.length ? `<div class="mut small center">Est. monthly recurring revenue: <b>${money2(mrr)}</b> from ${planned.length} customer${planned.length > 1 ? 's' : ''}</div>` : ''}`;
}

/* =====================  CUSTOMERS  ===================== */
function custItem({ h, p }) {
  const di = p.plan ? dueInfo(p.plan) : null, jobs = jobsOfPin(h.id, p.id).filter(j => j.status !== 'paid').length;
  return `<div class="cust" data-act="opencust" data-h="${esc(h.id)}" data-p="${esc(p.id)}">
    <i class="sdot" style="background:${STATUS[p.status].color}"></i>
    <div class="grow"><b>${esc(pinTitle(p))}</b><div class="mut small">${esc(pinAddr(p) && p.name ? pinAddr(p) : (p.phone || h.name))}</div></div>
    <div class="right">${p.plan ? `<span class="badge ${di.cls}">↻ ${p.plan.weeks}w · ${di.label}</span>` : ''}${jobs ? `<span class="badge">${jobs} open job${jobs > 1 ? 's' : ''}</span>` : ''}${p.thread.length ? `<span class="badge">💬 ${p.thread.length}</span>` : ''}</div></div>`;
}
function custList() {
  const q = view.custQ.trim().toLowerCase();
  const l = allCustomers().filter(({ p }) => !q || (pinTitle(p) + ' ' + p.note + ' ' + p.phone + ' ' + p.email).toLowerCase().includes(q))
    .sort((a, b) => pinTitle(a.p).localeCompare(pinTitle(b.p)));
  return l.length ? l.map(custItem).join('') : empty(q ? 'No matches.' : 'No customers yet. Mark a house <b>Yes</b> on the map, or tap “＋ Add customer”.');
}
function recurringView() {
  const l = plannedList(), mrr = sumBy(l, x => mrrOf(x.p.plan));
  const tiers = TIERS.map(w => { const n = l.filter(x => x.p.plan.weeks === w); return n.length ? `<span class="badge">${n.length} × ${w}wk = ${money2(sumBy(n, x => mrrOf(x.p.plan)))}/mo</span>` : ''; }).join(' ');
  return `${upcomingBanner()}
  <div class="tiles"><div class="tile good"><small>Est. monthly recurring revenue</small><b>${money2(mrr)}</b><em>${l.length} customer${l.length === 1 ? '' : 's'}</em></div></div>
  <div class="mut small">${tiers} Estimate = price × 52 ÷ weeks ÷ 12.</div>
  <div class="row wrap"><button class="btn" data-act="icsall">📅 Export .ics</button><button class="btn" data-act="copydue">📋 Copy reminders (due ≤3 days)</button></div>
  ${l.length ? l.map(({ h, p }) => { const di = dueInfo(p.plan);
    return `<div class="cust col" data-act="opencust" data-h="${esc(h.id)}" data-p="${esc(p.id)}"><div class="row between"><div><b>${esc(pinTitle(p))}</b><div class="mut small">Every ${p.plan.weeks} wks · ${money(p.plan.price)}/visit · ${esc(h.name)}${p.plan.assignee ? ' · ' + esc(memberName(p.plan.assignee)) : ''}</div></div>
      <div class="right"><div>${fmtDate(p.plan.next)}</div><span class="badge ${di.cls}">${di.label}</span></div></div>
      <div class="row"><button class="btn sm" data-act="copyrem2" data-h="${esc(h.id)}" data-p="${esc(p.id)}">📋 Copy reminder</button><button class="btn sm" data-act="openmsg" data-h="${esc(h.id)}" data-p="${esc(p.id)}">💬 Message</button></div></div>`; }).join('')
    : empty('No recurring customers yet. Open a <b>Yes</b> pin and tap “Upgrade to recurring”.')}`;
}
ACT.copyrem2 = el => { const p = findPin(el.dataset.h, el.dataset.p); copyText(reminderText(p)); };
ACT.openmsg = el => { if (findPin(el.dataset.h, el.dataset.p)) openSheet({ view: 'msg', hoodId: el.dataset.h, pinId: el.dataset.p, draft: '', reply: '', backTo: null }); };
ACT.copydue = () => {
  const l = dueSoon(3); if (!l.length) { toast('Nothing due within 3 days'); return; }
  copyText(l.map(({ p }) => `${pinTitle(p)}${p.phone ? ' (' + p.phone + ')' : ''}:\n${reminderText(p)}`).join('\n\n'));
};
ACT.icsall = () => {
  const l = plannedList().filter(x => x.p.plan.next); if (!l.length) { toast('No recurring customers'); return; }
  const ics = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = l.map(({ p }) => ['BEGIN:VEVENT', 'UID:' + p.id + '-' + p.plan.next + '@blitz-canvass', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + p.plan.next.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDays(p.plan.next, 1).replace(/-/g, ''),
    'SUMMARY:' + ics('Window cleaning – ' + pinTitle(p)), 'DESCRIPTION:' + ics([pinAddr(p), p.phone, 'Every ' + p.plan.weeks + ' wks · ' + money(p.plan.price) + '/visit'].filter(Boolean).join('\n')), 'END:VEVENT'].join('\r\n'));
  download('window-cleaning-blitz-visits.ics', 'text/calendar', ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Window Cleaning Blitz//EN', ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n');
};
function jobsView() {
  const f = view.jobFilter, all = allJobs();
  const L = { open: all.filter(j => j.status === 'scheduled' || j.status === 'in_progress'), collect: all.filter(j => j.status === 'done'), paid: all.filter(j => j.status === 'paid'), all };
  const list = L[f].slice().sort(f === 'paid' ? (a, b) => (b.paidAt || 0) - (a.paidAt || 0) : jobSort);
  const owed = sumBy(L.collect, j => j.price);
  return `<div class="row between"><div class="chips">${[['open', 'Open'], ['collect', 'To collect'], ['paid', 'Paid'], ['all', 'All']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="jobfilter" data-v="${k}">${l}<b>${L[k].length}</b></button>`).join('')}</div></div>
  ${f === 'collect' ? `<div class="mut small">Money owed: <b>${money(owed)}</b></div>` : ''}
  <button class="btn big pri" data-act="newjob0">＋ New job</button>
  ${list.length ? list.map(jobCard).join('') : empty('No jobs here.')}
  <div class="mut small">Recurring-plan visits (↻) appear automatically on their due date.</div>`;
}
ACT.jobfilter = el => { view.jobFilter = el.dataset.v; renderPage(); };
ACT.newjob0 = () => { if (!allCustomers().length) { toast('Add a customer first (mark a house Yes)'); return; } openSheet({ view: 'job', backTo: null, d: newJobDraft('', '') }); };
function messagesView() {
  const list = allCustomers().map(x => ({ ...x, last: x.p.thread.length ? x.p.thread[x.p.thread.length - 1] : null }))
    .sort((a, b) => (b.last ? b.last.ts : 0) - (a.last ? a.last.ts : 0) || pinTitle(a.p).localeCompare(pinTitle(b.p)));
  return `<div class="note warn"><b>Nothing sends automatically.</b> “Approve &amp; send” opens your phone's Messages app with the text ready – you press Send. Replies are logged by hand. Real two-way SMS inside the app needs an SMS provider (e.g. Twilio) + a backend + a paid number – not set up.</div>
  ${list.length ? list.map(({ h, p, last }) => `<div class="cust" data-act="openmsg" data-h="${esc(h.id)}" data-p="${esc(p.id)}"><i class="sdot" style="background:${STATUS[p.status].color}"></i><div class="grow"><b>${esc(pinTitle(p))}</b>
    <div class="mut small clip">${last ? (last.dir === 'out' ? 'You: ' : 'Them: ') + esc(last.text) : (p.phone ? 'No messages yet – tap to compose' : 'No phone number yet')}</div></div><div class="right small mut">${last ? fmtTs(last.ts) : ''}</div></div>`).join('') : empty('No customers yet.')}`;
}
function renderCustomers() {
  const s = seg.customers;
  const body = s === 'all' ? `<input class="search" id="custQ" type="search" placeholder="Search name, address, phone…" value="${esc(view.custQ)}"><button class="btn" data-act="addcust">＋ Add customer</button><div id="custList">${custList()}</div>`
    : s === 'recurring' ? recurringView() : s === 'jobs' ? jobsView() : messagesView();
  return `${hdr('Customers')}${segBar([['all', 'Customers'], ['recurring', '↻ Recurring'], ['jobs', 'Jobs'], ['messages', 'Messages']], s)}${body}`;
}
ACT.addcust = () => {
  const h = findHood(curHood), p = createPin(h.center[0], h.center[1], 'yes');
  toast('Added at the centre of ' + h.name + ' – edit details below'); openSheet({ view: 'pin', hoodId: curHood, pinId: p.id });
};

/* =====================  SCHEDULE  ===================== */
function renderSchedule() {
  const ws = view.week, days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)), t = todayStr(), cap = meta.settings.weekCap;
  const jobsAll = allJobs();
  const totals = activeTeam().map(m => { const mins = weekShiftMin(m.id, ws); return `<span class="badge ${cap && mins / 60 > cap ? 'over' : ''}">${dot(m.id)}${esc(m.name)} ${fmtHM(mins)}${cap && mins / 60 > cap ? ' ⚠' : ''}</span>`; }).join(' ');
  return `${hdr('Schedule', fmtShort(ws) + ' – ' + fmtShort(days[6]))}
  <div class="row wk"><button class="btn" data-act="wk" data-v="-7">‹</button><button class="btn grow" data-act="wk" data-v="0">This week</button><button class="btn" data-act="wk" data-v="7">›</button></div>
  <div class="row wrap"><button class="btn pri" data-act="newshift" data-d="${t >= ws && t <= days[6] ? t : ws}">＋ Add shift</button><button class="btn" data-act="copyweek">⧉ Copy last week</button></div>
  <div class="chips">${totals}</div>
  ${cap ? `<div class="mut small">⚠ marks anyone scheduled over your ${cap}-hour weekly warning (Settings). Minors have legal work-hour limits – check the rules.</div>` : ''}
  ${days.map(d => {
    const sh = meta.shifts.filter(s => s.date === d).sort((a, b) => a.start.localeCompare(b.start)), jb = jobsAll.filter(j => j.date === d && j.status !== 'paid').sort(jobSort);
    return `<section class="card day ${d === t ? 'today' : ''}"><div class="row between"><h3>${fmtDate(d)}${d === t ? ' · Today' : ''}</h3><button class="btn sm" data-act="newshift" data-d="${d}">＋</button></div>
      ${sh.map(s => { const c = shiftConflicts(s).length; return `<div class="shift" data-act="editshift" data-id="${esc(s.id)}" style="border-left-color:${(member(s.memberId) || {}).color || '#94a3b8'}"><span><b>${esc(memberName(s.memberId))}</b>${s.note ? ' <span class="mut small">' + esc(s.note) + '</span>' : ''}</span><span>${c ? '<span class="badge over">⚠ conflict</span> ' : ''}${fmtTime(s.start)}–${fmtTime(s.end)}</span></div>`; }).join('')}
      ${jb.map(j => `<div class="shift jobline" data-act="${j.virtual ? 'opencust' : 'editjob'}" data-id="${esc(j.id)}" data-h="${esc(j.hoodId)}" data-p="${esc(j.pinId)}"><span>🧽 ${esc(jobCust(j).name)} <span class="mut small">${j.virtual ? '↻ ' : ''}${esc(memberName(j.assignee) === '—' ? 'unassigned' : memberName(j.assignee))}</span></span><span>${j.time ? fmtTime(j.time) : 'any time'} · ${money(j.price)}</span></div>`).join('')}
      ${!sh.length && !jb.length ? '<div class="mut small">Nothing scheduled</div>' : ''}</section>`; }).join('')}`;
}
ACT.wk = el => { const v = +el.dataset.v; view.week = v === 0 ? weekStart(todayStr()) : addDays(view.week, v); renderPage(); };
ACT.newshift = el => openShift({ memberId: meta.currentUser || (activeTeam()[0] || {}).id, date: el.dataset.d, start: '09:00', end: '13:00', note: '' });
ACT.editshift = el => { const s = meta.shifts.find(x => x.id === el.dataset.id); if (s) openShift(s); };
ACT.copyweek = async () => {
  const prev = addDays(view.week, -7), src = meta.shifts.filter(s => s.date >= prev && s.date <= addDays(prev, 6));
  if (!src.length) { toast('No shifts last week to copy'); return; }
  const have = meta.shifts.some(s => s.date >= view.week && s.date <= addDays(view.week, 6));
  if (have && !await ask('This week already has shifts', 'Copy last week\'s shifts anyway? Exact duplicates are skipped.', [{ t: 'Cancel', v: false }, { t: 'Copy', v: true, cls: 'pri' }])) return;
  let n = 0;
  src.forEach(s => { const d = addDays(s.date, 7); if (!meta.shifts.some(x => x.memberId === s.memberId && x.date === d && x.start === s.start && x.end === s.end)) { meta.shifts.push({ ...s, id: uid(), date: d }); n++; } });
  saveMeta(); renderPage(); const c = meta.shifts.filter(s => s.date >= view.week && s.date <= addDays(view.week, 6) && shiftConflicts(s).length).length;
  toast(n + ' shift' + (n === 1 ? '' : 's') + ' copied' + (c ? ' · ⚠ ' + c + ' conflict(s)' : ''));
};

/* =====================  TEAM / TIME CLOCK / SETTINGS  ===================== */
function renderTeam() {
  const s = seg.team;
  return `${hdr('Team')}${segBar([['members', 'Team'], ['clock', 'Time clock'], ['settings', 'Settings']], s)}${s === 'members' ? membersView() : s === 'clock' ? clockView() : settingsView()}`;
}
function membersView() {
  const own = isOwner(), arch = meta.team.filter(m => !m.active);
  return `<button class="btn big pri" data-act="addmember">＋ Add team member</button>
  ${activeTeam().map(m => `<div class="cust" data-act="editmember" data-id="${esc(m.id)}"><i class="avatar" style="background:${m.color}">${esc(m.name.slice(0, 1).toUpperCase())}</i><div class="grow"><b>${esc(m.name)}</b> ${meta.currentUser === m.id ? '<span class="badge ok">you</span>' : ''}<div class="mut small">${m.role}${m.phone ? ' · ' + esc(m.phone) : ''}${m.pin ? ' · 🔒 PIN' : ''}</div></div><div class="right">${own ? money2(m.rate) + '/hr' : ''}</div></div>`).join('')}
  ${arch.length ? `<h4 class="mut">Removed</h4>` + arch.map(m => `<div class="cust"><div class="grow mut">${esc(m.name)} (${m.role})</div><button class="btn sm" data-act="restoremember" data-id="${esc(m.id)}">Restore</button></div>`).join('') : ''}
  <div class="note">No logins: this is one shared device/browser. “Who am I” + optional PIN is a convenience, not real accounts or security.</div>`;
}
ACT.addmember = () => openMember({ name: '', role: 'Knocker', phone: '', rate: 0, pin: '' });
ACT.editmember = el => { const m = member(el.dataset.id); if (m) openMember(m); };
ACT.restoremember = el => { member(el.dataset.id).active = true; saveMeta(); renderPage(); };

function clockView() {
  const own = isOwner(), now = Date.now(), ws = view.tsWeek, we = addDays(ws, 6);
  const cards = activeTeam().map(m => {
    const e = openEntry(m.id), ob = openBreak(e);
    const state = !e ? '<span class="mut">Clocked out</span>' : ob ? `<span class="badge soon">On break</span> since ${fmtClock(ob.start)}` : `<span class="badge ok">Clocked in</span> ${fmtClock(e.in)} · ${fmtHM(entryWorkedMin(e, now))}`;
    const btns = !e ? `<button class="btn big ok" data-act="clk" data-k="in" data-m="${esc(m.id)}">Clock in</button>`
      : `<button class="btn big" data-act="clk" data-k="${ob ? 'bend' : 'bstart'}" data-m="${esc(m.id)}">${ob ? 'End break' : '☕ Break'}</button><button class="btn big danger" data-act="clk" data-k="out" data-m="${esc(m.id)}">Clock out</button>`;
    return `<div class="card clk"><div class="row between"><b>${dot(m.id)}${esc(m.name)}</b><span class="small">${state}</span></div><div class="row">${btns}</div></div>`;
  }).join('');
  const sheet = meta.team.filter(m => m.active || weekEntries(m.id, ws).length).map(m => {
    const es = weekEntries(m.id, ws), mins = es.reduce((s, e) => s + entryWorkedMin(e, now), 0), over = meta.settings.weekCap && mins / 60 > meta.settings.weekCap;
    return `<div class="card"><div class="row between"><b>${dot(m.id)}${esc(m.name)}</b><span><b>${fmtHM(mins)}</b> (${(mins / 60).toFixed(2)} h)${own ? ' · <b>' + money2(estPay(m.id, ws)) + '</b>' : ''} ${over ? '<span class="badge over">⚠ over cap</span>' : ''}</span></div>
      ${es.length ? es.map(e => `<div class="mini" data-act="editentry" data-id="${esc(e.id)}"><span>${fmtDate(tsDate(e.in))}</span><span>${fmtClock(e.in)}–${e.out ? fmtClock(e.out) : 'now'} · brk ${Math.round(entryBreakMin(e, now))}m · <b>${(entryWorkedMin(e, now) / 60).toFixed(2)}h</b></span></div>`).join('') : '<div class="mut small">No time this week.</div>'}</div>`;
  }).join('');
  const all = meta.team.filter(m => m.active || weekEntries(m.id, ws).length);
  return `<div class="note warn"><b>Estimates only – not payroll.</b> This does basic hours × rate math. It does not do tax withholding, overtime rules, payroll taxes, or filings. <b>Minors have legal work-hour limits and work-permit/age rules</b> (federal and Arizona) – check them for every team member${'' }.</div>
  ${cards}
  <h3>Timesheet</h3>
  <div class="row wk"><button class="btn" data-act="tsw" data-v="-7">‹</button><button class="btn grow" data-act="tsw" data-v="0">${fmtShort(ws)} – ${fmtShort(we)}</button><button class="btn" data-act="tsw" data-v="7">›</button></div>
  ${sheet}
  ${own ? `<div class="card total row between"><b>Week total</b><span><b>${(all.reduce((s, m) => s + weekWorkedMin(m.id, ws), 0) / 60).toFixed(2)} h</b> · <b>${money2(all.reduce((s, m) => s + estPay(m.id, ws), 0))}</b> est.</span></div>` : ''}
  <button class="btn" data-act="addentry">＋ Add / fix a time entry</button>
  <div class="mut small">Breaks are ${meta.settings.breakPaid ? 'paid' : 'unpaid (subtracted)'} – change in Settings. Entries count on the day they started.</div>`;
}
ACT.tsw = el => { const v = +el.dataset.v; view.tsWeek = v === 0 ? weekStart(todayStr()) : addDays(view.tsWeek, v); renderPage(); };
ACT.addentry = () => openEntry_(null);
ACT.editentry = el => { const e = meta.clock.find(x => x.id === el.dataset.id); if (e) openEntry_(e); };
ACT.clk = async el => {
  const m = member(el.dataset.m), k = el.dataset.k; if (!m) return;
  if (!await checkPin(m, 'Enter PIN to ' + ({ in: 'clock in', out: 'clock out', bstart: 'start break', bend: 'end break' })[k])) return;
  const e = openEntry(m.id), now = Date.now();
  if (k === 'in') { if (e) return; meta.clock.push({ id: uid(), memberId: m.id, in: now, out: null, breaks: [] }); toast(m.name + ' clocked in'); }
  else if (e) {
    if (k === 'bstart' && !openBreak(e)) { e.breaks.push({ start: now, end: null }); toast('Break started'); }
    else if (k === 'bend' && openBreak(e)) { openBreak(e).end = now; toast('Break ended'); }
    else if (k === 'out') { const b = openBreak(e); if (b) b.end = now; e.out = now; toast(m.name + ' clocked out · ' + fmtHM(entryWorkedMin(e))); }
  }
  saveMeta(); renderPage();
};

function settingsView() {
  const s = meta.settings;
  return `<section class="card"><h3>Recurring plan prices (per visit)</h3><div class="grid3">${TIERS.map(w => fld('Every ' + w + ' wks ($)', `<input type="number" inputmode="decimal" min="0" step="1" data-s="price${w}" value="${esc(s.prices[w])}">`)).join('')}</div>
    <div class="mut small">New plans start with these prices; you can override per customer.</div></section>
  <section class="card"><h3>Messages</h3>${fld('How you sign texts ({me})', `<input data-s="me" value="${esc(s.me)}">`)}${fld('Review link (added to thank-you text)', `<input type="url" inputmode="url" data-s="reviewLink" value="${esc(s.reviewLink)}" placeholder="https://g.page/…">`)}</section>
  <section class="card"><h3>Time &amp; pay</h3>${fld('Weekly hours warning (0 = off)', `<input type="number" inputmode="decimal" min="0" step="1" data-s="weekCap" value="${esc(s.weekCap)}">`)}
    <label class="chk"><input type="checkbox" data-s="breakPaid" ${s.breakPaid ? 'checked' : ''}> Breaks are paid</label>
    <div class="mut small">Warning is a reminder only. Check the legal limits for minors who work for you.</div></section>
  <section class="card"><h3>Backup &amp; restore</h3>
    <div class="row wrap"><button class="btn pri" data-act="export">⬇ Export JSON</button><button class="btn" data-act="importpick">⬆ Import JSON</button><button class="btn" data-act="copyjson">📋 Copy JSON</button></div>
    <div class="mut small">Everything (map pins, customers, plans, messages, team, shifts, time, jobs, settings) is saved <b>in this browser on this device only</b>. A different phone/browser starts empty – export a backup regularly and import it elsewhere. The export contains pay rates and PINs; keep it private.</div></section>
  <section class="card"><h3>About &amp; limits</h3><div class="mut small">Data: ${esc(DataStore.name || 'custom')} storage · ${meta.hoods.length} areas · ${allPins().length} pins. No multi-device sync, no accounts/logins, no push notifications, no real payroll, and no real two-way SMS (see Messages).</div></section>`;
}
ACT.export = () => download('blitz-canvass-' + todayStr() + '.json', 'application/json', JSON.stringify(buildExport(), null, 2));
ACT.copyjson = () => copyText(JSON.stringify(buildExport()));
ACT.importpick = () => $('#importFile').click();
async function onImportFile(file) {
  if (!file) return;
  let data; try { data = JSON.parse(await file.text()); } catch (e) { toast('That file is not valid JSON'); return; }
  const mode = await ask('Import “' + file.name + '”', 'Merge adds anything missing and keeps what you have. Replace wipes this device first and loads the file.', [{ t: 'Cancel', v: null }, { t: 'Merge', v: 'merge', cls: 'pri' }, { t: 'Replace all', v: 'replace', cls: 'danger' }]);
  if (!mode) return;
  try { applyImport(data, mode); curHood = meta.lastHood; if (map) { const h = findHood(curHood); map.setView(h.center, h.zoom); } refreshMarkers(); renderHoodSelect(); refreshBadges(); renderPage(); toast('Import complete (' + mode + ')'); }
  catch (e) { toast('Import failed: ' + e.message); }
}

const RENDER = { dashboard: renderDashboard, customers: renderCustomers, schedule: renderSchedule, team: renderTeam };

/* ---------- page-level inputs ---------- */
function wirePages() {
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'custQ') { view.custQ = t.value; $('#custList').innerHTML = custList(); }
    else if (t.dataset.s) {
      const s = meta.settings, k = t.dataset.s;
      if (k.startsWith('price')) s.prices[k.slice(5)] = Math.max(0, +t.value || 0);
      else if (k === 'weekCap') s.weekCap = Math.max(0, +t.value || 0);
      else if (k === 'breakPaid') s.breakPaid = t.checked;
      else s[k] = t.value;
      saveMeta();
    }
  });
  $('#importFile').addEventListener('change', e => { onImportFile(e.target.files[0]); e.target.value = ''; });
}
