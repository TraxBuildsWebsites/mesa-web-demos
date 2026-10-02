'use strict';
/* ===== boot + map-tab UI wiring ===== */
ACT.filter = el => {
  const k = el.dataset.v; meta.filter[k] = !meta.filter[k]; saveMeta(); refreshMarkers();
};
ACT.me = () => showMyLocation();
ACT.areas = () => openSheet({ view: 'areas' });
ACT.labels = el => { if (map.hasLayer(labelLayer)) { map.removeLayer(labelLayer); el.classList.remove('on'); } else { labelLayer.addTo(map); el.classList.add('on'); } };

function wireMapUi() {
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); doSearch($('#q').value); });
  $('#results').addEventListener('click', e => {
    const b = e.target.closest('[data-res]'); if (!b) return;
    const box = $('#results'); const it = box._list[+b.dataset.res]; box.hidden = true; $('#q').value = ''; pickResult(it);
  });
  $('#hoodSel').addEventListener('change', e => switchHood(e.target.value));
  $('#q').addEventListener('input', () => { if (!$('#q').value) $('#results').hidden = true; });
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const f = ACT[el.dataset.act]; if (f) f(el, e);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ctx && $('#modal').hidden) closeSheet(); });
$('#scrim').addEventListener('click', () => closeSheet());

(async function boot() {
  await loadAll();
  wireSheet(); wirePages(); wireMapUi();
  refreshBadges();
  const h = (location.hash || '').replace('#', '').toLowerCase();
  go(ALIASES[h] ? h : 'dashboard');
  window.addEventListener('hashchange', () => { const n = location.hash.replace('#', '').toLowerCase(); if (ALIASES[n] && n !== routeName()) go(n); });
  // keep "elapsed" times and due badges fresh without disturbing typing
  setInterval(() => {
    const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ($('#sheet').hidden && $('#modal').hidden && !typing && (page === 'dashboard' || (page === 'team' && seg.team === 'clock'))) renderPage();
    refreshBadges();
  }, 30000);
  document.body.dataset.ready = '1';
})();
