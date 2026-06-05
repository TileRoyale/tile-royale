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

// Called once on app startup after cloud save loads.
// Sends any unacknowledged purchases to the server for verification and re-delivery.
// Handles the case where a purchase was granted locally during a server outage.
async function restorePurchasesOnStartup() {
  if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) return;
  if (typeof getActiveServer !== 'function') return;

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
