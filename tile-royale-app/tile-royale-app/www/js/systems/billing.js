// Google Play Billing bridge
// Wraps the native BillingPlugin Capacitor plugin.
// Resolves with { productId, purchaseToken, orderId } on success.
// Rejects with 'cancelled' if user cancelled, or an error string otherwise.

function nativePurchase(productId) {
  const plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Billing;
  if (!plugin) return Promise.reject('not_available');
  return plugin.purchase({ productId: productId });
}

// Queries Google Play for all unconsumed in-app purchases held by this account.
// Returns an array of { productId, purchaseToken, orderId } objects.
// Used on startup to re-verify any purchase that was delivered locally during a server outage.
async function queryPurchasesForRestore() {
  const plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Billing;
  if (!plugin) return [];
  try {
    const result = await plugin.queryPurchases();
    return Array.isArray(result && result.purchases) ? result.purchases : [];
  } catch(e) {
    console.warn('[Billing] queryPurchases failed:', e?.message || e);
    return [];
  }
}

// Retry purchases that were delivered locally during a server outage.
// These are stored in localStorage._pendingPurchases so they survive even if
// Google Play no longer returns them via queryPurchases() (already consumed).
async function _retryPendingPurchases() {
  if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) return;
  if (typeof getActiveServer !== 'function') return;
  let pending;
  try { pending = JSON.parse(localStorage.getItem('_pendingPurchases') || '[]'); } catch(e) { return; }
  if (!pending.length) return;

  const stillPending = [];
  for (const p of pending) {
    try {
      const r = await fetch(`${getActiveServer().http}/purchase/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PLAYER_ID, productId: p.productId,
                               purchaseToken: p.purchaseToken, orderId: p.orderId || '' }),
        signal: AbortSignal.timeout(12000),
      });
      const data = r.ok ? await r.json() : null;
      if (data?.ok || data?.error === 'already_processed') {
        // Successfully recorded — remove from queue (grant already applied locally at purchase time)
        console.log('[Billing] Pending purchase verified:', p.productId);
      } else {
        stillPending.push(p); // keep for next attempt
      }
    } catch(e) {
      stillPending.push(p); // network error — keep for next attempt
    }
  }
  try { localStorage.setItem('_pendingPurchases', JSON.stringify(stillPending)); } catch(e) {}
}

// Called once on app startup after cloud save loads.
// Sends any unacknowledged purchases to the server for verification and re-delivery.
// Handles the case where a purchase was granted locally during a server outage.
async function restorePurchasesOnStartup() {
  if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) return;
  if (typeof getActiveServer !== 'function') return;

  // First: retry any purchases that failed verification at purchase time
  await _retryPendingPurchases();

  const purchases = await queryPurchasesForRestore();
  if (!purchases.length) return;

  try {
    const r = await fetch(`${getActiveServer().http}/purchase/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: PLAYER_ID, purchases }),
      signal: AbortSignal.timeout(15000),
    });
    const data = r.ok ? await r.json() : null;
    if (!data?.ok || !data.restored?.length) return;

    // Apply any newly verified grants (missed during a previous server outage)
    for (const item of data.restored) {
      if (item.grant && typeof _applyPurchaseGrant === 'function') {
        _applyPurchaseGrant(item.grant);
        console.log('[Billing] Restored purchase:', item.grant.type, item.grant.diamonds || '');
      }
    }
  } catch(e) {
    console.warn('[Billing] restorePurchasesOnStartup failed:', e?.message || e);
  }
}

// User-triggered restore (tapped "Restore Purchases" button in store).
async function manualRestorePurchases() {
  try { showToast('Checking purchases…', 'var(--muted)'); } catch(e) {}
  const purchases = await queryPurchasesForRestore();
  if (!purchases.length) {
    try { showToast('No purchases to restore.', 'var(--muted)'); } catch(e) {}
    return;
  }
  try {
    const r = await fetch(`${getActiveServer().http}/purchase/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: PLAYER_ID, purchases }),
      signal: AbortSignal.timeout(15000),
    });
    const data = r.ok ? await r.json() : null;
    if (!data?.ok) {
      try { showToast('Restore failed — try again later.', 'var(--red)'); } catch(e) {}
      return;
    }
    if (!data.restored?.length) {
      try { showToast('All purchases already applied.', 'var(--muted)'); } catch(e) {}
      return;
    }
    for (const item of data.restored) {
      if (item.grant && typeof _applyPurchaseGrant === 'function') {
        _applyPurchaseGrant(item.grant);
      }
    }
    try { showToast(`✅ ${data.restored.length} purchase(s) restored!`, 'var(--green)'); } catch(e) {}
  } catch(e) {
    try { showToast('Restore failed — check your connection.', 'var(--red)'); } catch(e2) {}
  }
}
