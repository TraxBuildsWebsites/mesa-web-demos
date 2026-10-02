'use strict';
/* =====================================================================
   storage.js – the ONLY file that touches persistence.
   The UI keeps an in-memory copy of the data (meta + pins) and calls:
     DataStore.init()               -> Promise<{ meta, pins }>   (load everything once at start)
     DataStore.saveMeta(meta)       -> write team/shifts/clock/jobs/settings/hoods (fire-and-forget)
     DataStore.savePins(hid, list)  -> write one neighborhood's pins
     DataStore.deletePins(hid)      -> remove a neighborhood's pins
   Default backend = localStorage (with in-memory fallback if blocked).
   To move to Supabase later: implement the same 4 methods against your tables
   (init = select * … ; the save* calls = upsert, can be async/background)
   and set  window.DataStore = SupabaseStore  before app.js runs. No UI code changes.
   ===================================================================== */
const LocalStore = (() => {
  const K_META = 'blitz.meta.v3', K_PINS = 'blitz.pins.v3.';
  const mem = {};
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return mem[k] == null ? null : mem[k]; } };
  const set = (k, v) => {
    try { localStorage.setItem(k, v); return true; } catch (e) {
      mem[k] = v; if (typeof toast === 'function') toast('Could not save to this browser (storage blocked/full)'); return false;
    }
  };
  const del = k => { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } };
  return {
    name: 'localStorage',
    async init() {
      let meta = null;
      try { meta = JSON.parse(get(K_META) || 'null'); } catch (e) { meta = null; }
      const pins = {};
      ((meta && Array.isArray(meta.hoods)) ? meta.hoods : []).forEach(h => {
        if (!h || !h.id) return;
        try { pins[h.id] = JSON.parse(get(K_PINS + h.id) || '[]'); } catch (e) { pins[h.id] = []; }
      });
      return { meta, pins };
    },
    saveMeta(meta) { set(K_META, JSON.stringify(meta)); },
    savePins(hid, list) { set(K_PINS + hid, JSON.stringify(list)); },
    deletePins(hid) { del(K_PINS + hid); }
  };
})();
// eslint-disable-next-line no-unused-vars
var DataStore = window.DataStore || LocalStore;
