'use strict';
/* ===== Map tab: Leaflet + Esri imagery, search, neighborhoods, pins, filters ===== */
let map = null, markerLayer = null, labelLayer = null, tempMarker = null, meDot = null, meCircle = null, markers = {};
let moveTimer = null, suppressMove = false;

const STATES = 'alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming';
const ABBR = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC';
function biasQuery(q) {
  q = q.trim();
  if (new RegExp('\\b(' + STATES + ')\\b', 'i').test(q)) return q;
  if (new RegExp(',\\s*(' + ABBR + ')\\s*(\\d{5})?\\s*$', 'i').test(q)) return q;
  if (new RegExp('\\s(' + ABBR + ')(\\s+\\d{5})?\\s*$').test(q)) return q;
  return q + ', Arizona';
}

function ensureMap() {
  if (map) { map.invalidateSize(); return; }
  map = L.map('map', { zoomControl: false, attributionControl: true, doubleClickZoom: false, maxZoom: 21, tap: true });
  map.attributionControl.setPrefix(false);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 21, maxNativeZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }).addTo(map);
  labelLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19, opacity: 0.9 });
  labelLayer.addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  const h = findHood(curHood);
  map.setView(h.center, h.zoom);
  map.on('moveend', () => {
    if (suppressMove) return;
    const hh = findHood(curHood); if (!hh) return;
    const c = map.getCenter(); hh.center = [+c.lat.toFixed(6), +c.lng.toFixed(6)]; hh.zoom = map.getZoom();
    clearTimeout(moveTimer); moveTimer = setTimeout(saveMeta, 400);
  });
  map.on('click', e => { if (document.body.dataset.noMapClick) return; newPinAt(e.latlng); });
  refreshMarkers();
}

/* ---------- neighborhoods ---------- */
function renderHoodSelect() {
  const sel = $('#hoodSel'); if (!sel) return;
  sel.innerHTML = meta.hoods.map(h => `<option value="${esc(h.id)}" ${h.id === curHood ? 'selected' : ''}>${esc(h.name)} (${(pins[h.id] || []).length})</option>`).join('');
}
function switchHood(id, opts = {}) {
  const h = findHood(id); if (!h) return;
  curHood = id; meta.lastHood = id; saveMeta();
  renderHoodSelect();
  if (map) { if (!opts.keepView) map.setView(h.center, h.zoom); refreshMarkers(); }
}
function addHood(name, center, zoom) {
  const h = { id: uid(), name: name || 'New area', center, zoom: zoom || 17, created: Date.now() };
  meta.hoods.push(h); pins[h.id] = []; saveMeta(); savePins(h.id); return h;
}

/* ---------- search ---------- */
async function doSearch(q) {
  q = q.trim(); if (!q) return;
  const box = $('#results'); box.hidden = false; box.innerHTML = '<div class="res-msg">Searching…</div>';
  const full = biasQuery(q);
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=us&q=' + encodeURIComponent(full), { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const list = await r.json();
    if (!list.length) { box.innerHTML = `<div class="res-msg">No match for “${esc(full)}”. Try a street, subdivision or city.</div>`; return; }
    if (list.length === 1) { box.hidden = true; pickResult(list[0]); return; }
    box.innerHTML = list.map((it, i) => `<button type="button" data-res="${i}">${esc(it.display_name)}</button>`).join('');
    box._list = list;
  } catch (e) {
    box.innerHTML = `<div class="res-msg">Search failed (${esc(e.message)}). Check your connection and try again.</div>`;
  }
}
function pickResult(it) {
  const name = it.display_name.split(',').slice(0, 2).map(s => s.trim()).join(', ');
  const center = [+(+it.lat).toFixed(6), +(+it.lon).toFixed(6)];
  let h = meta.hoods.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (h) { h.center = center; h.zoom = 17; } else h = addHood(name, center, 17);
  saveMeta(); switchHood(h.id); toast('Saved neighborhood: ' + h.name);
}

/* ---------- pins ---------- */
function iconFor(p) {
  const s = STATUS[p.status];
  const od = p.plan && dueInfo(p.plan).cls === 'over';
  return L.divIcon({ className: 'pin', iconSize: [44, 44], iconAnchor: [22, 22],
    html: `<span class="dot s-${p.status}${od ? ' od' : ''}" style="background:${s.color}">${p.plan ? '↻' : ''}</span>` });
}
function passesFilter(p) {
  const f = meta.filter; if (!f[p.status]) return false;
  if (f.recurringOnly && !p.plan) return false; return true;
}
function refreshMarkers() {
  updateCounts();
  if (!map) return;
  markerLayer.clearLayers(); markers = {};
  (pins[curHood] || []).forEach(p => {
    if (!passesFilter(p)) return;
    const m = L.marker([p.lat, p.lng], { icon: iconFor(p), keyboard: false, title: pinTitle(p) });
    m.on('click', () => openSheet({ view: 'pin', hoodId: curHood, pinId: p.id }));
    m.addTo(markerLayer); markers[p.id] = m;
  });
}
function updateCounts() {
  const list = pins[curHood] || [];
  const c = { yes: 0, no: 0, maybe: 0, avoid: 0 }, rec = list.filter(p => p.plan).length;
  list.forEach(p => c[p.status]++);
  const f = meta.filter;
  const el = $('#chips'); if (!el) return;
  el.innerHTML = Object.entries(STATUS).map(([k, s]) => `<button class="chip ${f[k] ? '' : 'off'}" data-act="filter" data-v="${k}"><i style="background:${s.color}"></i>${s.label}<b>${c[k]}</b></button>`).join('')
    + `<button class="chip ${f.recurringOnly ? 'on' : ''}" data-act="filter" data-v="recurringOnly">↻<b>${rec}</b></button>`;
}
function newPinAt(latlng) {
  removeTemp();
  tempMarker = L.circleMarker(latlng, { radius: 14, color: '#fff', weight: 3, dashArray: '4 4', fillColor: '#38bdf8', fillOpacity: .5 }).addTo(map);
  openSheet({ view: 'new', lat: latlng.lat, lng: latlng.lng });
}
function removeTemp() { if (tempMarker && map) { map.removeLayer(tempMarker); } tempMarker = null; }
function createPin(lat, lng, status) {
  const p = cleanPin({ id: uid(), lat, lng, status, note: '', name: '', phone: '', email: '', created: Date.now(), updated: Date.now() });
  pins[curHood].push(p); savePins(curHood); removeTemp(); refreshMarkers(); renderHoodSelect(); return p;
}
function goToPin(hid, pid) {
  const p = findPin(hid, pid); if (!p) return;
  go('map');
  if (hid !== curHood) switchHood(hid, { keepView: true });
  map.setView([p.lat, p.lng], Math.max(map.getZoom(), 18));
  openSheet({ view: 'pin', hoodId: hid, pinId: pid });
}

/* ---------- my location ---------- */
function showMyLocation() {
  if (!navigator.geolocation) { toast('Location is not available on this device'); return; }
  toast('Finding you…');
  navigator.geolocation.getCurrentPosition(pos => {
    const ll = [pos.coords.latitude, pos.coords.longitude];
    if (meDot) { map.removeLayer(meDot); map.removeLayer(meCircle); }
    meCircle = L.circle(ll, { radius: pos.coords.accuracy, color: '#38bdf8', weight: 1, fillOpacity: .12, interactive: false }).addTo(map);
    meDot = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#0ea5e9', fillOpacity: 1, interactive: false }).addTo(map);
    map.setView(ll, Math.max(map.getZoom(), 19));
  }, err => toast('Could not get location: ' + err.message), { enableHighAccuracy: true, timeout: 15000 });
}
