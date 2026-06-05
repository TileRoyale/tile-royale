// ===== AD REWARD SYSTEM =====
const AD_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

const ADMOB_REWARDED_ID = 'ca-app-pub-1687381057809117/7980217936';

// ─── AdMob Bridge ─────────────────────────────────────────────────────────────

// Returns true only when running inside the native Capacitor Android/iOS app
function _isNative() {
  const cap = window.Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
  if (typeof cap.isNative === 'boolean') return cap.isNative;
  // Last resort: nativePromise is only injected by the native bridge
  return typeof cap.nativePromise === 'function';
}

// Get the AdMob plugin proxy, auto-registering it if needed
function _adMob() {
  if (!window.Capacitor?.Plugins?.AdMob && window.Capacitor?.registerPlugin) {
    try { window.Capacitor.registerPlugin('AdMob', {}); } catch(e) {}
  }
  return window.Capacitor?.Plugins?.AdMob ?? null;
}

// Initialize AdMob — called once on app load
async function initAdMob() {
  if (!_isNative()) return;
  const cap = window.Capacitor;
  // Try plugin proxy first, fall back to nativePromise
  const admob = _adMob();
  try {
    if (admob) {
      await admob.initialize({ requestTrackingAuthorization: false, initializeForTesting: false });
    } else if (cap?.nativePromise) {
      await cap.nativePromise('AdMob', 'initialize', { requestTrackingAuthorization: false, initializeForTesting: false });
    }
    console.log('[AdMob] initialized');
  } catch(e) {
    console.warn('[AdMob] init error:', e?.message || e);
  }
}

// Show one rewarded ad. Returns true if user earned the reward (watched to end).
async function _showRewardedAd() {
  const cap = window.Capacitor;
  const admob = _adMob();
  // Prepare (load) the ad
  try {
    if (admob) {
      await admob.prepareRewardVideoAd({ adId: ADMOB_REWARDED_ID });
    } else if (cap?.nativePromise) {
      await cap.nativePromise('AdMob', 'prepareRewardVideoAd', { adId: ADMOB_REWARDED_ID });
    } else {
      return false;
    }
  } catch(e) {
    console.warn('[AdMob] load failed:', e?.message || e);
    return false;
  }
  // Show and wait for reward
  try {
    let result;
    if (admob) {
      result = await admob.showRewardVideoAd();
    } else {
      result = await cap.nativePromise('AdMob', 'showRewardVideoAd', {});
    }
    return !!(result?.type);
  } catch(e) {
    console.warn('[AdMob] dismissed or failed:', e?.message || e);
    return false;
  }
}

// Browser / dev fallback — 5-second fake countdown so the UI stays testable
function _simulateFallback() {
  return new Promise(resolve => {
    let t = 5;
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;bottom:100px;left:50%;transform:translateX(-50%);
      background:rgba(10,10,15,0.95);border:1px solid var(--border);border-radius:10px;
      padding:12px 20px;font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:2px;
      color:var(--text);z-index:999;text-align:center;`;
    el.textContent = `📺 AD PLAYING — ${t}s`;
    document.body.appendChild(el);
    const tick = setInterval(() => {
      t--;
      el.textContent = `📺 AD PLAYING — ${t}s`;
      if (t <= 0) { clearInterval(tick); el.remove(); resolve(true); }
    }, 1000);
  });
}

// Public: real ad on device, simulation in browser
async function _watchRewardedAd() {
  const native = _isNative();
  console.log('[AdMob] check —', {
    native,
    hasCapacitor: !!window.Capacitor,
    hasNativePromise: typeof window.Capacitor?.nativePromise,
    hasPlugin: !!window.Capacitor?.Plugins?.AdMob,
    hasRegister: typeof window.Capacitor?.registerPlugin,
  });
  if (native) return await _showRewardedAd();
  return await _simulateFallback();
}

// ─── Reward helpers ───────────────────────────────────────────────────────────

function rollAdReward() {
  const roll = Math.random() * 100;
  if (roll < 80)  return { type:'tickets',  id:'ticket',      icon:'🎟️', name:'1 Ticket',     qty:1 };
  if (roll < 90)  return { type:'item',     id:'crystal',     icon:'🔮', name:'Crystal Ball', qty:1 };
  if (roll < 97)  return { type:'item',     id:'caltrops',    icon:'⚙️', name:'Caltrops',     qty:1 };
  return               { type:'item',     id:'shadow_tile', icon:'🌑', name:'Shadow Tile',  qty:1 };
}

function canWatchAd() {
  return Date.now() - (gameState.lastAdWatch || 0) >= AD_COOLDOWN_MS;
}

function getAdCooldownText() {
  const diff = Math.max(0, AD_COOLDOWN_MS - (Date.now() - (gameState.lastAdWatch || 0)));
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `Available in ${m}:${s.toString().padStart(2,'0')}`;
}

async function _serverAdClaim(rewardType) {
  if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID || typeof getActiveServer !== 'function') return true;
  try {
    const r = await fetch(`${getActiveServer().http}/ads/reward/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: PLAYER_ID, rewardType }),
      signal: AbortSignal.timeout(5000),
    });
    const data = r.ok ? await r.json() : null;
    if (data && !data.ok && !data.offline && data.error === 'cooldown_active') return false;
    return true;
  } catch(e) { return true; } // offline — allow
}

async function giveAdReward(reward) {
  const allowed = await _serverAdClaim(reward.type === 'tickets' ? 'tickets' : reward.id);
  if (!allowed) { showToast('Ad reward already claimed recently', 'var(--muted)'); return; }
  if (reward.type === 'tickets') {
    gameState.tickets = Math.min(TICKETS_MAX, getTickets() + reward.qty);
    gameState.ticketLastUse = gameState.tickets < TICKETS_MAX ? (gameState.ticketLastUse || Date.now()) : null;
  } else {
    addItemToInventory(reward.id, reward.qty);
  }
  gameState.lastAdWatch = Date.now();
  saveState(); updateMenuStats(); updateInventoryUI(); updateTicketUI();
}

// ─── Public ad entry points ───────────────────────────────────────────────────

let adWatchInProgress = false;

// Watch 1 or 3 rewarded ads to earn tickets
async function watchAdsForTickets(count) {
  if (adWatchInProgress) { showToast('Ad already playing...', 'var(--muted)'); return; }
  const adKey = `lastAdTicket_${count}`;
  const last  = gameState[adKey] || 0;
  if (Date.now() - last < AD_COOLDOWN_MS) {
    const diff = AD_COOLDOWN_MS - (Date.now() - last);
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    showToast(`Available in ${m}:${s.toString().padStart(2,'0')}`, 'var(--muted)');
    return;
  }

  adWatchInProgress = true;

  if (count === 1) {
    showToast('📺 Loading ad...', 'var(--muted)');
    const rewarded = await _watchRewardedAd();
    adWatchInProgress = false;
    if (!rewarded) { showToast('Ad not available — try again later', 'var(--muted)'); return; }
    const allowed = await _serverAdClaim('tickets');
    if (!allowed) { showToast('Ad reward already claimed recently', 'var(--muted)'); return; }
    gameState.tickets = Math.min(TICKETS_MAX, getTickets() + 2);
    gameState[adKey]  = Date.now();
    saveState(); updateTicketUI(); updateStoreAdTimer();
    showToast('🎟️ +2 Tickets!', 'var(--gold)');
    playSound('achieve');
  } else {
    // Watch count ads in sequence — grant partial reward if chain breaks midway
    let earned = 0;
    for (let i = 1; i <= count; i++) {
      showToast(`📺 Ad ${i}/${count}...`, 'var(--muted)');
      const rewarded = await _watchRewardedAd();
      if (!rewarded) {
        adWatchInProgress = false;
        if (earned > 0) {
          const allowed = await _serverAdClaim('tickets');
          if (allowed) {
            gameState.tickets = Math.min(TICKETS_MAX, getTickets() + earned);
            gameState[adKey]  = Date.now();
            saveState(); updateTicketUI(); updateStoreAdTimer();
            showToast(`🎟️ +${earned} Ticket${earned > 1 ? 's' : ''} (stopped early)`, 'var(--gold)');
          }
        } else {
          showToast('Ad not available — try again later', 'var(--muted)');
        }
        return;
      }
      earned++;
    }
    adWatchInProgress = false;
    const allowed = await _serverAdClaim('tickets');
    if (!allowed) { showToast('Ad reward already claimed recently', 'var(--muted)'); return; }
    gameState.tickets = Math.min(TICKETS_MAX, getTickets() + count);
    gameState[adKey]  = Date.now();
    saveState(); updateTicketUI(); updateStoreAdTimer();
    showToast('🎟️🎟️🎟️ +3 Tickets! Well played!', 'var(--gold)');
    playSound('achieve'); vibrate([50, 50, 200]);
  }
}

// Single-ad shortcut used from the no-tickets box
function watchAdForTicket() {
  watchAdsForTickets(1);
}

// Store featured: watch one ad for a random item (1-hour cooldown)
async function watchAdForRandomItem() {
  if (!canWatchAd()) { showToast(getAdCooldownText(), 'var(--muted)'); return; }
  if (adWatchInProgress) { showToast('Ad already playing...', 'var(--muted)'); return; }
  adWatchInProgress = true;
  showToast('📺 Loading ad...', 'var(--muted)');
  const rewarded = await _watchRewardedAd();
  adWatchInProgress = false;
  if (!rewarded) { showToast('Ad not available — try again later', 'var(--muted)'); return; }
  const reward = rollAdReward();
  giveAdReward(reward);
  showToast(`🎁 You got: ${reward.icon} ${reward.name}!`, 'var(--gold)');
  playSound('achieve');
  updateStoreAdTimer();
}

function updateStoreAdTimer() {
  const box   = document.getElementById('storeAdRewardBox');
  const timer = document.getElementById('storeAdTimer');
  const btn   = document.getElementById('storeAdBtn');
  if (!box || !timer) return;
  if (canWatchAd()) {
    box.className     = 'ad-reward-box';
    timer.className   = 'ad-reward-timer';
    timer.textContent = 'Available now!';
    if (btn) btn.textContent = '▶ WATCH';
  } else {
    box.className     = 'ad-reward-box cooldown';
    timer.className   = 'ad-reward-timer cooldown-txt';
    timer.textContent = getAdCooldownText();
    if (btn) btn.textContent = '⏱ WAIT';
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────
window.addEventListener('load', () => initAdMob());
