// ===== CLOUD SAVE — Phase 1 =====
// Account identifier: PLAYER_ID (localStorage UUID, permanent per device install)
// Source of truth: server. Newest _localSavedAt timestamp wins.
// No login required — PLAYER_ID is generated on first launch.

const CLOUD_SAVE_DEBOUNCE_MS = 5000;

let _csSaveTimer = null;

// ─── Status UI ────────────────────────────────────────────────────────────────

function _csSetStatus(status) {
  const el = document.getElementById('cloudSaveStatus');
  if (!el) return;
  const map = {
    synced:  ['🟢', 'Synced',   'var(--green)'],
    syncing: ['🟡', 'Syncing…', '#ffaa00'],
    offline: ['🔴', 'Offline',  'var(--red)'],
    pending: ['🟡', 'Pending…', 'var(--muted)'],
  };
  const [icon, text, color] = map[status] || map.pending;
  el.innerHTML =
    `<span style="font-size:9px;letter-spacing:2px;color:var(--muted);">CLOUD SAVE</span>` +
    `<span style="font-size:11px;color:${color};font-weight:600;">${icon} ${text}</span>`;
}

// ─── Server URL ────────────────────────────────────────────────────────────────

function _csUrl() {
  try { return getActiveServer().http; } catch(e) { return null; }
}

// ─── Save ──────────────────────────────────────────────────────────────────────

// Bundle separate localStorage keys into the save blob so they survive reinstall.
function _csCollectExtras() {
  const keys = {
    _tr_missions:    'tr_missions',
    _tr_daily_login: 'tr_daily_login',
    _solo_progress:  'soloProgress',
    _solo_lives:     'soloLives',
    _gauntlet_data:  'gauntletData',
  };
  const out = {};
  for (const [field, lsKey] of Object.entries(keys)) {
    try { const v = localStorage.getItem(lsKey); if (v) out[field] = v; } catch(e) {}
  }
  return out;
}

// Restore bundled keys back to localStorage after a cloud load.
function _csRestoreExtras(saveData) {
  const keys = {
    _tr_missions:    'tr_missions',
    _tr_daily_login: 'tr_daily_login',
    _solo_progress:  'soloProgress',
    _solo_lives:     'soloLives',
    _gauntlet_data:  'gauntletData',
  };
  for (const [field, lsKey] of Object.entries(keys)) {
    try { if (saveData[field]) localStorage.setItem(lsKey, saveData[field]); } catch(e) {}
  }
}

async function saveToCloud() {
  if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) return;
  const url = _csUrl();
  if (!url) { _csSetStatus('offline'); return; }

  _csSetStatus('syncing');
  try {
    const saveData = Object.assign({}, gameState, _csCollectExtras());
    const r = await fetch(`${url}/save`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ playerId: PLAYER_ID, saveData }),
      signal:  AbortSignal.timeout(10000),
    });
    _csSetStatus(r.ok ? 'synced' : 'offline');
    if (!r.ok) { console.warn('[CloudSave] server rejected save:', r.status); return; }
    const resp = await r.json().catch(() => null);
    if (resp?.conflict) {
      // Another device saved a newer version — reload from cloud before next save
      console.warn('[CloudSave] conflict detected — reloading from cloud');
      await loadFromCloud();
      return;
    }
    // Track server version so next save can detect conflicts
    if (resp?.saveVersion !== undefined) {
      gameState._saveVersion = resp.saveVersion;
      try { saveState(); } catch(e) {}
    }
    // If server capped diamonds (tamper detected), apply the corrected value
    if (resp?.adjustedDiamonds !== undefined) {
      console.warn('[CloudSave] economy adjusted by server:', resp.adjustedDiamonds);
      gameState.diamonds = resp.adjustedDiamonds;
      try { saveState(); }      catch(e) {}
      try { updateMenuStats(); } catch(e) {}
    }
  } catch(e) {
    _csSetStatus('offline');
    console.warn('[CloudSave] save failed:', e?.message || e);
  }
}

// Debounced — coalesces rapid saves (e.g. achievement burst) into one upload
function scheduleSaveToCloud() {
  clearTimeout(_csSaveTimer);
  _csSetStatus('pending');
  _csSaveTimer = setTimeout(saveToCloud, CLOUD_SAVE_DEBOUNCE_MS);
}

// ─── Load (startup sync) ───────────────────────────────────────────────────────

async function loadFromCloud() {
  if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) return false;
  const url = _csUrl();
  if (!url) return false;

  _csSetStatus('syncing');
  try {
    const r = await fetch(`${url}/save/${PLAYER_ID}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { _csSetStatus('offline'); return false; }

    const data = await r.json();

    if (!data.found || !data.saveData) {
      // No cloud save exists yet — first launch after update. Upload local save.
      console.log('[CloudSave] No cloud save — uploading local (migration)');
      await saveToCloud();
      return false;
    }

    const cloudTs = data.saveData._localSavedAt || 0;
    const localTs = (typeof gameState !== 'undefined' && gameState._localSavedAt) || 0;

    if (cloudTs > localTs) {
      // Cloud is newer — restore it
      console.log(`[CloudSave] Restoring cloud save (cloud +${cloudTs - localTs}ms newer)`);
      Object.assign(gameState, data.saveData);
      // Track server version for conflict detection on next save
      if (data.saveVersion !== undefined) gameState._saveVersion = data.saveVersion;
      // Server-trusted diamond value overrides whatever is in the save blob
      if (data.trustedDiamonds !== undefined && data.trustedDiamonds !== null) {
        gameState.diamonds = data.trustedDiamonds;
      }
      // Restore separate localStorage keys bundled in the save
      _csRestoreExtras(data.saveData);
      try { saveState(); } catch(e) {}
      try { updateMenuStats(); } catch(e) {}
      try { updateInventoryUI(); } catch(e) {}
      try { if (gameState.activeSkins) activeSkins = gameState.activeSkins; } catch(e) {}
      try { updateFeatureLocks(); } catch(e) {}
      // Merge server-stored achievement IDs (union — never removes locally unlocked ones)
      _csMergeServerAchievements().catch(() => {});
      // Re-derive whale spend stats so whale achievements survive localStorage wipe
      _csRestoreWhaleSpendStats().catch(() => {});
      _csSetStatus('synced');
      return true;
    } else {
      // Local is current — push to cloud (server validates economy on receipt)
      console.log('[CloudSave] Local save is current — uploading');
      // Apply trusted ceiling from server before uploading so local matches
      if (data.trustedDiamonds !== undefined && data.trustedDiamonds !== null
          && data.trustedDiamonds < (gameState.diamonds || 0)) {
        gameState.diamonds = data.trustedDiamonds;
        try { saveState(); } catch(e) {}
      }
      await saveToCloud();
      return false;
    }
  } catch(e) {
    _csSetStatus('offline');
    console.warn('[CloudSave] load failed:', e?.message || e);
    return false;
  }
}

// Re-derives whale spend stats from purchase_receipts on the server and merges
// them into achStats — prevents whale achievement loss after a localStorage wipe.
async function _csRestoreWhaleSpendStats() {
  if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) return;
  const url = _csUrl();
  if (!url) return;
  try {
    const r = await fetch(`${url}/purchase/spend-stats/${PLAYER_ID}`,
                          { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return;
    const data = await r.json();
    if (!data.ok || !data.stats) return;
    const { totalSpentCents, singlePurchaseMax, bundlesBought, purchaseCount } = data.stats;
    if (purchaseCount === 0) return;
    if (typeof initAchStats === 'function') initAchStats();
    const s = gameState.achStats || {};
    let changed = false;
    if (totalSpentCents  > (s.totalSpentCents   || 0)) { s.totalSpentCents   = totalSpentCents;  changed = true; }
    if (singlePurchaseMax > (s.singlePurchaseMax || 0)) { s.singlePurchaseMax = singlePurchaseMax; changed = true; }
    if (bundlesBought    > (s.bundlesBought     || 0)) { s.bundlesBought     = bundlesBought;    changed = true; }
    if (purchaseCount    > (s.diamondsPurchased  || 0)) { s.diamondsPurchased  = purchaseCount;   changed = true; }
    if (changed) {
      gameState.achStats = s;
      try { saveState(); } catch(e) {}
      try { if (typeof checkAchievements === 'function') checkAchievements(); } catch(e) {}
      console.log('[CloudSave] Whale spend stats restored from server');
    }
  } catch(e) {}
}

// Fetches server-stored achievement IDs and merges with local (union only).
async function _csMergeServerAchievements() {
  if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) return;
  const url = _csUrl();
  if (!url) return;
  try {
    const r = await fetch(`${url}/player/achievements/${PLAYER_ID}`,
                          { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return;
    const data = await r.json();
    if (!Array.isArray(data.achievement_ids) || data.achievement_ids.length === 0) return;
    const local  = Array.isArray(gameState.unlockedAch) ? gameState.unlockedAch : [];
    const merged = [...new Set([...local, ...data.achievement_ids])];
    if (merged.length > local.length) {
      gameState.unlockedAch = merged;
      try { saveState(); updateMenuStats(); } catch(e) {}
      console.log(`[CloudSave] Merged ${merged.length - local.length} missing achievements from server`);
    }
  } catch(e) {}
}

// ─── Startup ───────────────────────────────────────────────────────────────────
// Runs after all scripts load. 2.5s delay lets colyseus.js pick the best
// server region via ping before we attempt the first cloud sync.

window.addEventListener('load', () => {
  setTimeout(async () => {
    try {
      await loadFromCloud();
    } catch(e) {
      console.warn('[CloudSave] startup sync error:', e);
      _csSetStatus('offline');
    }
    // Re-verify any purchases that were delivered locally during a server outage
    try { await restorePurchasesOnStartup(); } catch(e) {}
    // After state is loaded, check for any past KOTH weeks with unclaimed prizes
    try { await checkKothPrizesOnAppStart(); } catch(e) {}
  }, 2500);
});
