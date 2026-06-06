// ===== DAILY CHALLENGE SYSTEM =====
const DAILY_CHALLENGES = [
  { id:'dc_rush_wins',   desc:'Win 3 Rush games',                     goal:3,  stat:'rushWins',    reward:15,  icon:'⚡' },
  { id:'dc_no_wrong',   desc:'Tap 20 tiles without a wrong tap',      goal:20, stat:'streakTaps',  reward:20,  icon:'🎯' },
  { id:'dc_buckshot',   desc:'Play 5 Buckshot games',                 goal:5,  stat:'buckshotGames',reward:15,  icon:'💥' },
  { id:'dc_top3',       desc:'Finish top 3 in 3 games',               goal:3,  stat:'top3Today',   reward:18,  icon:'🏅' },
  { id:'dc_wild',       desc:'Win 2 Wild mode games',                 goal:2,  stat:'wildWins',    reward:20,  icon:'🌀' },
  { id:'dc_taps',       desc:'Tap 50 tiles total today',              goal:50, stat:'tapsToday',   reward:10,  icon:'👆' },
  { id:'dc_koth',       desc:'Play 3 King of the Hill games',         goal:3,  stat:'kothGames',   reward:25,  icon:'👑' },
];

function getTodayDc() {
  const dc = gameState.dc;
  const today = new Date().toDateString();
  if (dc && dc.date === today && dc.customChallenge) return dc.customChallenge;
  const day = Math.floor(Date.now() / 86400000);
  return DAILY_CHALLENGES[day % DAILY_CHALLENGES.length];
}

function getDcProgress() {
  const today = new Date().toDateString();
  if (!gameState.dc) gameState.dc = {};
  if (gameState.dc.date !== today) {
    gameState.dc = { date: today, progress: 0, claimed: false, tapsToday: 0, top3Today: 0, streakTaps: 0 };
    saveState();
  }
  return gameState.dc;
}

function updateDcProgress(stat, amount = 1) {
  const dc = getDcProgress();
  const challenge = getTodayDc();
  if (dc.claimed) return;
  if (stat === challenge.stat || challenge.stat === stat) {
    if (stat === 'streakTaps') {
      dc.streakTaps = (dc.streakTaps || 0) + amount;
      dc.progress = dc.streakTaps;
    } else {
      dc.progress = Math.min(challenge.goal, (dc.progress || 0) + amount);
    }
    saveState();
    if (dc.progress >= challenge.goal && !dc.completed && !dc.claimed) {
      dc.completed = true;
      saveState();
      showToast(`🎯 Daily challenge done! Tap to collect 💎 ${challenge.reward}`, 'var(--green)');
      playSound('achieve');
    }
  }
  // Also update individual today stats
  if (stat === 'tapsToday') dc.tapsToday = (dc.tapsToday || 0) + amount;
  if (stat === 'top3Today') dc.top3Today = (dc.top3Today || 0) + amount;
  renderMenuDailyChallenge();
}

function renderMenuDailyChallenge() {
  const ch = getTodayDc();
  const dc = getDcProgress();
  const pct = Math.min(100, ((dc.progress || 0) / ch.goal) * 100);
  const now = new Date(); const midnight = new Date(now); midnight.setHours(24,0,0,0);
  const diff = Math.floor((midnight - now) / 3600000);

  const el = id => document.getElementById(id);
  if (el('menuDcDesc')) el('menuDcDesc').textContent = `${ch.icon} ${ch.desc}`;
  if (el('menuDcBar'))  el('menuDcBar').style.width = pct + '%';
  if (el('menuDcTimer')) el('menuDcTimer').textContent = `Resets in ${diff}h`;

  const box = document.getElementById('menuDailyChallenge');
  const overlay = document.getElementById('dcCompletedOverlay');
  const swapBtn = document.getElementById('dcSwapBtn');

  if (dc.claimed) {
    if (el('menuDcProg')) el('menuDcProg').textContent = '✓ Done!';
    if (el('menuDcReward')) el('menuDcReward').textContent = '✅ Claimed!';
    if (box) { box.classList.add('dc-done'); box.classList.remove('dc-ready'); box.style.cursor = 'default'; }
    if (overlay) { overlay.style.display = 'flex'; }
    if (swapBtn) swapBtn.style.display = 'none';
  } else if (dc.completed) {
    if (el('menuDcProg')) el('menuDcProg').textContent = `${dc.progress||0}/${ch.goal}`;
    if (el('menuDcReward')) el('menuDcReward').textContent = `👆 Tap to collect 💎 ${ch.reward}`;
    if (box) { box.classList.add('dc-ready'); box.classList.remove('dc-done'); box.style.cursor = 'pointer'; }
    if (overlay) { overlay.style.display = 'none'; }
    if (swapBtn) swapBtn.style.display = 'none';
  } else {
    if (el('menuDcProg')) el('menuDcProg').textContent = `${dc.progress||0}/${ch.goal}`;
    if (el('menuDcReward')) el('menuDcReward').textContent = `💎 ${ch.reward}`;
    if (box) { box.classList.remove('dc-done', 'dc-ready'); box.style.cursor = 'pointer'; }
    if (overlay) { overlay.style.display = 'none'; }
    if (swapBtn) swapBtn.style.display = dc.swapped ? 'none' : '';
  }
}

async function openDailyChallenge() {
  const dc = getDcProgress();
  if (dc.claimed) return;
  if (dc.completed) {
    const ch = getTodayDc();
    const challengeDate = new Date().toISOString().slice(0, 10);

    // Server-side idempotency — blocks re-claim after localStorage wipe
    if (typeof PLAYER_ID !== 'undefined' && PLAYER_ID && typeof getActiveServer === 'function') {
      try {
        const r = await fetch(`${getActiveServer().http}/dc/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: PLAYER_ID, challengeDate, challengeId: ch.id }),
          signal: AbortSignal.timeout(6000),
        });
        const data = r.ok ? await r.json() : null;
        if (data && !data.ok && !data.offline && data.error === 'already_claimed') {
          dc.claimed = true;
          saveState();
          renderMenuDailyChallenge();
          return;
        }
      } catch(e) { /* offline — allow local claim */ }
    }

    dc.claimed = true;
    gameState.diamonds = (gameState.diamonds || 0) + ch.reward;
    saveState();
    updateMenuStats();
    showToast(`💎 +${ch.reward} diamonds! Daily challenge rewarded!`, 'var(--diamond)');
    playSound('achieve');
    renderMenuDailyChallenge();
    return;
  }
  showToast('Complete the challenge to earn diamonds!', 'var(--diamond)');
}

function resetDcStreak() {
  const dc = getDcProgress();
  if (dc.completed || dc.claimed) return;
  const ch = getTodayDc();
  if (ch.stat !== 'streakTaps') return;
  if ((dc.streakTaps || 0) === 0) return;
  dc.streakTaps = 0;
  dc.progress = 0;
  saveState();
  renderMenuDailyChallenge();
}

async function swapDailyChallenge() {
  const dc = getDcProgress();
  if (dc.claimed || dc.completed) { showToast('Challenge already done!', 'var(--muted)'); return; }
  if (dc.swapped) { showToast('Already swapped today!', 'var(--muted)'); return; }
  if (adWatchInProgress) { showToast('Ad already playing...', 'var(--muted)'); return; }

  adWatchInProgress = true;
  showToast('📺 Loading ad...', 'var(--muted)');
  const rewarded = await _watchRewardedAd();
  adWatchInProgress = false;

  if (!rewarded) { showToast('Ad not available — try again later', 'var(--muted)'); return; }

  // Record the swap on the server (one per day, idempotent)
  const swapDate = new Date().toISOString().slice(0, 10);
  if (typeof PLAYER_ID !== 'undefined' && PLAYER_ID && typeof getActiveServer === 'function') {
    try {
      const r = await fetch(`${getActiveServer().http}/dc/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PLAYER_ID, swapDate }),
        signal: AbortSignal.timeout(5000),
      });
      const data = r.ok ? await r.json() : null;
      if (data && !data.ok && !data.offline && data.error === 'already_swapped') {
        showToast('Already swapped today!', 'var(--muted)');
        dc.swapped = true; saveState();
        return;
      }
    } catch(e) { /* offline — allow */ }
  }

  const current = getTodayDc();
  const others = DAILY_CHALLENGES.filter(c => c.id !== current.id);
  const newChallenge = others[Math.floor(Math.random() * others.length)];
  dc.customChallenge = newChallenge;
  dc.swapped = true;
  dc.progress = 0;
  dc.completed = false;
  saveState();
  renderMenuDailyChallenge();
  showToast(`🔄 New challenge: ${newChallenge.icon} ${newChallenge.desc}`, 'var(--diamond)');
}

// ===== 5. OFFLINE DIAMONDS =====
const OFFLINE_RATE_MS = 8 * 60 * 60 * 1000; // 8 hours
const OFFLINE_DIAMONDS = 3;
let pendingOfflineDiamonds = 0;

function checkOfflineReward() {
  const last = gameState.lastOnline || Date.now();
  const now = Date.now();
  const elapsed = now - last;
  const periods = Math.floor(elapsed / OFFLINE_RATE_MS);
  if (periods >= 1) {
    pendingOfflineDiamonds = Math.min(periods, 3) * OFFLINE_DIAMONDS; // max 3 periods = 9💎
    gameState._pendingOffline = pendingOfflineDiamonds; // mirror into gameState so claim always reads what was displayed
    const hours = Math.floor(elapsed / 3600000);
    document.getElementById('offlineRewardSub').textContent =
      `Away for ${hours}h — earned while offline`;
    document.getElementById('offlineRewardAmount').textContent =
      `+💎 ${pendingOfflineDiamonds}`;
    document.getElementById('offlineRewardOverlay').classList.add('show');
  }
  gameState.lastOnline = now;
  saveState();
}

async function claimOfflineReward() {
  const earned = gameState._pendingOffline || pendingOfflineDiamonds;
  if (!earned) { document.getElementById('offlineRewardOverlay').classList.remove('show'); return; }

  const claimDate = new Date().toISOString().slice(0, 10);
  if (typeof PLAYER_ID !== 'undefined' && PLAYER_ID && typeof getActiveServer === 'function') {
    try {
      const r = await fetch(`${getActiveServer().http}/offline-reward/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PLAYER_ID, claimDate, amount: earned }),
        signal: AbortSignal.timeout(6000),
      });
      const data = r.ok ? await r.json() : null;
      if (data && !data.ok && !data.offline) {
        gameState._pendingOffline = 0;
        pendingOfflineDiamonds = 0;
        saveState();
        document.getElementById('offlineRewardOverlay').classList.remove('show');
        return;
      }
    } catch(e) { /* offline — allow local claim */ }
  }

  gameState.diamonds = (gameState.diamonds || 0) + earned;
  gameState._pendingOffline = 0;
  pendingOfflineDiamonds = 0;
  saveState();
  updateMenuStats();
  document.getElementById('offlineRewardOverlay').classList.remove('show');
  showToast(`💎 +${earned} offline diamonds claimed!`, 'var(--diamond)');
}

// ===== 6. SURPRISE REWARD =====
const SURPRISE_CHANCE = 0.001; // 0.1% per game
let surpriseShown = false;

async function maybeTriggerSurprise() {
  if (surpriseShown) return;
  if (Math.random() > SURPRISE_CHANCE) return;
  surpriseShown = true;

  const grantDate = new Date().toISOString().slice(0, 10);
  let rewardIndex = null;

  if (typeof PLAYER_ID !== 'undefined' && PLAYER_ID && typeof getActiveServer === 'function') {
    try {
      const r = await fetch(`${getActiveServer().http}/surprise/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PLAYER_ID, grantDate }),
        signal: AbortSignal.timeout(5000),
      });
      const data = r.ok ? await r.json() : null;
      if (data && !data.ok && !data.offline) return; // already_claimed or db_error — skip
      if (data?.rewardIndex !== undefined) rewardIndex = data.rewardIndex;
    } catch(e) { /* offline — allow with local roll */ }
  }

  const surprises = [
    { text:'Found hidden gem!', reward: () => { gameState.diamonds += 15; return '+💎 15'; } },
    { text:'Lucky streak bonus!', reward: () => { addItemToInventory('crystal', 2); return '+🔮 Crystal Ball ×2'; } },
    { text:'Secret chest opened!', reward: () => { gameState.diamonds += 8; addItemToInventory('shadow_tile', 1); return '+💎 8 & Shadow Tile'; } },
    { text:'Fortune smiles!', reward: () => { addItemToInventory('caltrops', 3); return '+⚙️ Caltrops ×3'; } },
  ];
  // Use server-determined index when available; fall back to local roll only when offline
  const idx = (rewardIndex !== null && rewardIndex >= 0 && rewardIndex < surprises.length)
    ? rewardIndex
    : Math.floor(Math.random() * surprises.length);
  const s = surprises[idx];
  const rewardText = s.reward();
  saveState(); updateMenuStats(); updateInventoryUI();

  showToast(`🎁 ${s.text} ${rewardText}`, 'var(--gold)');
  vibrate([30, 30, 60]);
  playSound('achieve');
}

// ===== DIAMOND SPEND AUDIT =====
// Fire-and-forget: records every diamond spend in the server audit log.
// Does not block the local transaction — purely for server-side integrity monitoring.
function _auditDiamondSpend(itemId, amount) {
  if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID || typeof getActiveServer !== 'function') return;
  fetch(`${getActiveServer().http}/diamonds/spend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId: PLAYER_ID, itemId: String(itemId), amount: Number(amount) }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

// ===== PROMO CODE SYSTEM =====
// Validation and redemption tracking are server-side (POST /promo/redeem).
// The client applies the reward payload returned by the server.

const _PROMO_ERROR_MSGS = {
  invalid_code:     '❌ Invalid code',
  expired:          '⏱ This code has expired',
  already_redeemed: '✓ Already redeemed',
  db_unavailable:   '❌ Server unavailable — try again later',
  missing_player:   '❌ Account error — restart the app',
  invalid_player:   '❌ Account error — restart the app',
  server_error:     '❌ Server error — try again later',
};

async function redeemCode() {
  const input = document.getElementById('redeemInput');
  const code  = (input.value || '').trim().toUpperCase();

  if (!code) { showRedeemMsg('Enter a code first', 'error'); return; }

if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) {
    showRedeemMsg('❌ Account required — restart the app', 'error'); return;
  }

  showRedeemMsg('⏳ Verifying...', 'info');

  let data;
  try {
    const r = await fetch(`${getActiveServer().http}/promo/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: PLAYER_ID, code }),
      signal: AbortSignal.timeout(8000),
    });
    data = r.ok ? await r.json() : null;
  } catch(e) { data = null; }

  input.value = '';

  if (!data) { showRedeemMsg('❌ Server unavailable — try again later', 'error'); return; }

  if (!data.ok) {
    const msg = _PROMO_ERROR_MSGS[data.error] || '❌ Could not redeem — try again';
    showRedeemMsg(msg, data.error === 'already_redeemed' ? 'info' : 'error');
    return;
  }

  // Apply reward returned by server
  const reward = data.reward || {};
  const parts  = [];

  if (reward.diamonds) {
    gameState.diamonds = (gameState.diamonds || 0) + reward.diamonds;
    parts.push(`💎 ${reward.diamonds.toLocaleString()}`);
  }
  if (reward.items) {
    Object.entries(reward.items).forEach(([id, qty]) => {
      addItemToInventory(id, Number(qty));
      parts.push(`${ITEM_TYPES[id]?.icon || '🎁'} ${ITEM_TYPES[id]?.name || id} ×${qty}`);
    });
  }
  if (reward.skins) {
    if (!gameState.ownedSkins) gameState.ownedSkins = {};
    reward.skins.forEach(id => {
      gameState.ownedSkins[id] = true;
      const skin = (typeof ALL_AVATARS !== 'undefined' ? ALL_AVATARS : []).find(a => a.id === id);
      parts.push(`🎨 ${skin?.name || id}`);
    });
  }
  if (reward.action === 'koth_top3') {
    if (!gameState.level || gameState.level < 1) gameState.level = 1;
    gameState.kothCustomUnlocked = true;
    assignKothTitle(1);
    updateFeatureLocks();
    parts.push('👑 KOTH Top 3 unlocked!');
    showToast('👑 Raz4Win! KOTH Top 3 + Custom Lobby unlocked!', 'var(--gold)');
  } else if (reward.action === 'gauntlet') {
    setTimeout(() => openGauntlet(), 400);
  } else if (reward.action === 'level10') {
    gameState.level = 10;
    gameState.xp = getXPForLevel(10);
    updateFeatureLocks();
    parts.push('⬆️ Level 10');
  }

  saveState();
  updateMenuStats();
  updateInventoryUI();

  const claimedStr = parts.length ? ` — Claimed: ${parts.join(' · ')}` : '';
  showRedeemMsg(`✅ ${data.desc}${claimedStr}`, 'success');
  playSound('achieve');
  vibrate(100);
}

function showRedeemMsg(text, type) {
  const el = document.getElementById('redeemMsg');
  el.textContent = text;
  el.className = `redeem-msg ${type}`;
  if (type === 'success') {
    setTimeout(() => { el.textContent = ''; el.className = 'redeem-msg'; }, 6000);
  }
}

// ===== MODE REWARDS (Rush / Buckshot / Wild) =====

const MODE_DAILY_TIERS = [
  { tier: 'TOP 1%', minWins: 5,  tickets: 10, icon: '🥇', color: 'var(--gold)' },
  { tier: 'TOP 3%', minWins: 2,  tickets: 5,  icon: '🥈', color: '#c0c0c0'     },
  { tier: 'TOP 5%', minWins: 1,  tickets: 3,  icon: '🥉', color: '#cd7f32'     },
];
const MODE_WEEKLY_TIERS = [
  { tier: 'TOP 1%', minWins: 20, tickets: 30, icon: '🥇', color: 'var(--gold)' },
  { tier: 'TOP 3%', minWins: 10, tickets: 20, icon: '🥈', color: '#c0c0c0'     },
  { tier: 'TOP 5%', minWins: 3,  tickets: 10, icon: '🥉', color: '#cd7f32'     },
];

// UTC date string "YYYY-MM-DD" — aligns with server's date_trunc('day', now())
function _modeUtcDate() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

// ISO date of the most recent Wednesday 00:00 UTC — weekly period boundary
function _modeWeekStart() {
  const d = new Date();
  const utcDay = d.getUTCDay(); // 0=Sun … 6=Sat, 3=Wed
  const daysBack = (utcDay >= 3) ? (utcDay - 3) : (utcDay + 4);
  const wed = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysBack));
  return wed.toISOString().slice(0, 10);
}

// Countdown text to next UTC midnight (daily snapshot)
function _modeDailyTimeLeft() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const ms = next - now;
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// Countdown text to next Wednesday 00:00 UTC (weekly snapshot)
function _modeWeeklyTimeLeft() {
  const now = new Date();
  const daysToNextWed = ((3 - now.getUTCDay()) + 7) % 7 || 7; // always 1–7
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToNextWed));
  const ms = next - now;
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

// Returns mode reward state for the given mode.
//
// Data model:
//   m.daily        – active accumulation for the current UTC day (not claimable yet)
//   m.pendingDaily – yesterday's locked result (claimable until tonight's midnight)
//   m.weekly       – active accumulation for the current Wed-to-Wed period
//   m.pendingWeekly – last period's locked result (claimable until next Wednesday)
//
// Transitions fire automatically when the period boundary has passed.
function _getModeRewardsData(mode) {
  if (!gameState.modeRewards) gameState.modeRewards = {};
  if (!gameState.modeRewards[mode]) gameState.modeRewards[mode] = {};
  const m = gameState.modeRewards[mode];
  const today   = _modeUtcDate();
  const weekKey = _modeWeekStart();
  let dirty = false;

  // ── Daily rollover ────────────────────────────────────────────────────────────
  if (!m.daily || m.daily.date !== today) {
    if (m.daily && m.daily.wins > 0) {
      m.pendingDaily = { date: m.daily.date, wins: m.daily.wins, claimed: false };
    }
    m.daily = { date: today, wins: 0, claimed: false };
    dirty = true;
  }
  // Expire pendingDaily when it's older than yesterday
  if (m.pendingDaily && !m.pendingDaily.claimed) {
    const p = today.split('-').map(Number);
    const yesterday = new Date(Date.UTC(p[0], p[1]-1, p[2]-1)).toISOString().slice(0, 10);
    if (m.pendingDaily.date < yesterday) { m.pendingDaily = null; dirty = true; }
  }

  // ── Weekly rollover (Wednesday boundary) ──────────────────────────────────────
  if (!m.weekly || m.weekly.week !== weekKey) {
    if (m.weekly && m.weekly.wins > 0) {
      m.pendingWeekly = { week: m.weekly.week, wins: m.weekly.wins, claimed: false };
    }
    m.weekly = { week: weekKey, wins: 0, claimed: false };
    dirty = true;
  }
  // Expire pendingWeekly when it's from before the previous Wednesday period
  if (m.pendingWeekly && !m.pendingWeekly.claimed) {
    const prevWed = new Date(new Date(weekKey + 'T00:00:00Z').getTime() - 7 * 86400000).toISOString().slice(0, 10);
    if (m.pendingWeekly.week < prevWed) { m.pendingWeekly = null; dirty = true; }
  }

  if (dirty) saveState();
  return m;
}

let _modePopupMode   = 'rush';
let _modeTimerHandle = null; // setInterval for live countdown in popup

function recordModeWin(mode) {
  if (!['rush', 'buckshot', 'wild'].includes(mode)) return;
  const m = _getModeRewardsData(mode);
  m.daily.wins  = (m.daily.wins  || 0) + 1;
  m.weekly.wins = (m.weekly.wins || 0) + 1;
  saveState();
}

function _refreshModeTimers() {
  const de = document.getElementById('modeDailyTimer');
  const we = document.getElementById('modeWeeklyTimer');
  if (de) de.textContent = `results in ${_modeDailyTimeLeft()}`;
  if (we) we.textContent = `results in ${_modeWeeklyTimeLeft()}`;
}

function modePopupPlay() {
  closeModeRewardPopup();
  if (typeof tryFindMatch === 'function') tryFindMatch();
}

function openModeRewardPopup(mode) {
  _modePopupMode = mode;
  const popup = document.getElementById('modeRewardPopup');
  if (!popup) return;

  const labels = { rush: '⚡ Rush', buckshot: '💥 Buckshot', wild: '🌀 Wild', koth: '👑 King of the Hill', practice: '🎯 Practice', custom: '🏟️ Custom Lobby' };
  const titleEl = document.getElementById('modeRewardPopupTitle');
  if (titleEl) titleEl.textContent = labels[mode] || mode;

  // Update play button ticket/cost display
  const modeCounter = document.getElementById('modePopupTicketCounter');
  if (modeCounter) {
    if (mode === 'practice') {
      modeCounter.textContent = 'FREE';
      modeCounter.className = 'ticket-counter';
    } else if (mode === 'koth') {
      modeCounter.textContent = '💎 50';
      modeCounter.className = 'ticket-counter';
    } else {
      const t = typeof getTickets === 'function' ? getTickets() : (gameState.tickets || 0);
      modeCounter.textContent = `🎟️ ${t}`;
      modeCounter.className = 'ticket-counter' + (t <= 2 ? ' low' : '');
    }
  }

  // Mode description for non-reward modes
  const descEl = document.getElementById('modePopupDesc');
  const rewardSection = document.getElementById('modeRewardsSection');
  const isRewardMode = ['rush','buckshot','wild'].includes(mode);
  if (descEl) {
    if (mode === 'koth') {
      descEl.textContent = '💎 20 diamond entry fee · compete for top 3 position';
      descEl.style.display = 'block';
    } else if (mode === 'practice') {
      descEl.textContent = 'No tickets required · speed training · solo play';
      descEl.style.display = 'block';
    } else if (mode === 'custom') {
      descEl.textContent = 'Create or join a private lobby with friends';
      descEl.style.display = 'block';
    } else {
      descEl.style.display = 'none';
    }
  }
  if (rewardSection) rewardSection.style.display = isRewardMode ? '' : 'none';

  if (!isRewardMode) {
    popup.style.display = 'flex';
    return;
  }

  const data = _getModeRewardsData(mode);

  // Live countdown — refresh every 30 s while popup is open
  _refreshModeTimers();
  if (_modeTimerHandle) clearInterval(_modeTimerHandle);
  _modeTimerHandle = setInterval(_refreshModeTimers, 30000);

  // Pending = locked results from yesterday / last week (claimable now)
  // Active  = current accumulation (not yet claimable, shown for info)
  const pendingDailyTier  = data.pendingDaily
    ? MODE_DAILY_TIERS.find(t  => data.pendingDaily.wins  >= t.minWins) || null : null;
  const pendingWeeklyTier = data.pendingWeekly
    ? MODE_WEEKLY_TIERS.find(t => data.pendingWeekly.wins >= t.minWins) || null : null;

  // Highlight whichever tier the player has reached (pending if claimable, else active)
  const _highlightTierBox = (boxId, tiers, wins, isLocked) => {
    const box = document.getElementById(boxId);
    if (!box) return;
    const rows = box.querySelectorAll('.koth-daily-row');
    const qi = tiers.findIndex(t => wins >= t.minWins);
    rows.forEach((row, i) => {
      if (i === qi && !isLocked) {
        row.style.background   = 'rgba(255,215,0,0.08)';
        row.style.borderLeft   = `3px solid ${tiers[i].color}`;
        row.style.borderRadius = '6px';
      } else {
        row.style.background   = '';
        row.style.borderLeft   = '';
        row.style.borderRadius = '';
      }
    });
  };
  const dHW = (data.pendingDaily  && !data.pendingDaily.claimed)  ? data.pendingDaily.wins  : data.daily.wins;
  const wHW = (data.pendingWeekly && !data.pendingWeekly.claimed) ? data.pendingWeekly.wins : data.weekly.wins;
  const dHL = !data.pendingDaily  || data.pendingDaily.claimed;
  const wHL = !data.pendingWeekly || data.pendingWeekly.claimed;
  _highlightTierBox('modeDailyTierBox',  MODE_DAILY_TIERS,  dHW, dHL);
  _highlightTierBox('modeWeeklyTierBox', MODE_WEEKLY_TIERS, wHW, wHL);

  // Status block
  const rankEl = document.getElementById('modeRewardPopupRank');
  if (rankEl) {
    const buildPendingLine = (pending, tiers, label) => {
      if (!pending) return null;
      const tier = tiers.find(t => pending.wins >= t.minWins);
      const ws = `${pending.wins} win${pending.wins !== 1 ? 's' : ''}`;
      if (!tier)           return `${label}: <b>${ws}</b> · below threshold`;
      if (pending.claimed) return `${label}: <b>${ws}</b> · <span style="color:var(--muted)">${tier.tier} ✓ Claimed</span>`;
      return `${label}: <b>${ws}</b> · <span style="color:${tier.color};font-weight:700;">${tier.tier} → +${tier.tickets} 🎟️ READY!</span>`;
    };
    const buildActiveLine = (wins, tiers, label) => {
      const ws = `${wins} win${wins !== 1 ? 's' : ''}`;
      const tier = tiers.find(t => wins >= t.minWins);
      if (!wins) return `${label}: 0 wins`;
      if (!tier) {
        const need = tiers[tiers.length - 1].minWins - wins;
        return `${label}: <b>${ws}</b> · need ${need} more for ${tiers[tiers.length-1].tier}`;
      }
      return `${label}: <b>${ws}</b> · <span style="color:${tier.color}">${tier.tier}</span>`;
    };
    const lines = [];
    const pdLine = buildPendingLine(data.pendingDaily,  MODE_DAILY_TIERS,  'Yesterday');
    const pwLine = buildPendingLine(data.pendingWeekly, MODE_WEEKLY_TIERS, 'Last week');
    if (pdLine) lines.push(pdLine);
    lines.push(buildActiveLine(data.daily.wins,  MODE_DAILY_TIERS,  'Today'));
    if (pwLine) lines.push(pwLine);
    lines.push(buildActiveLine(data.weekly.wins, MODE_WEEKLY_TIERS, 'This week'));
    rankEl.innerHTML = lines.join('<br>');
  }

  // Claim buttons — pending results only, not active accumulation
  const canClaimDaily  = !!(pendingDailyTier  && !data.pendingDaily.claimed);
  const canClaimWeekly = !!(pendingWeeklyTier && !data.pendingWeekly.claimed);

  const dailyWrap = document.getElementById('modeDailyClaimWrap');
  const dailyBtn  = document.getElementById('modeDailyClaimBtn');
  if (dailyWrap) dailyWrap.style.display = canClaimDaily ? 'block' : 'none';
  if (dailyBtn && pendingDailyTier)
    dailyBtn.textContent = `🎟️ CLAIM YESTERDAY'S REWARD — ${pendingDailyTier.tier} · +${pendingDailyTier.tickets} Tickets`;

  const weeklyWrap = document.getElementById('modeWeeklyClaimWrap');
  const weeklyBtn  = document.getElementById('modeWeeklyClaimBtn');
  if (weeklyWrap) weeklyWrap.style.display = canClaimWeekly ? 'block' : 'none';
  if (weeklyBtn && pendingWeeklyTier)
    weeklyBtn.textContent = `🎟️ CLAIM LAST WEEK'S REWARD — ${pendingWeeklyTier.tier} · +${pendingWeeklyTier.tickets} Tickets`;

  popup.style.display = 'flex';
}

function closeModeRewardPopup() {
  if (_modeTimerHandle) { clearInterval(_modeTimerHandle); _modeTimerHandle = null; }
  const popup = document.getElementById('modeRewardPopup');
  if (popup) popup.style.display = 'none';
}

// Helper: UTC ISO date string for period boundaries
function _modeUtcIso(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

async function claimModeDailyReward() {
  const mode = _modePopupMode;
  const data = _getModeRewardsData(mode);
  const pending = data.pendingDaily;
  if (!pending || pending.claimed) { showToast('No daily reward to claim!', 'var(--muted)'); return; }

  // Server validates actual win count from game_results
  if (typeof PLAYER_ID !== 'undefined' && PLAYER_ID) {
    const periodStart = pending.date + 'T00:00:00Z';
    const d = new Date(pending.date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    const periodEnd = _modeUtcIso(d) + 'T00:00:00Z';
    try {
      const r = await fetch(`${getActiveServer().http}/mode-rewards/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PLAYER_ID, mode, period: 'daily',
                               periodKey: pending.date, periodStart, periodEnd }),
        signal: AbortSignal.timeout(8000),
      });
      const resp = r.ok ? await r.json() : null;
      if (resp && !resp.ok) {
        if (resp.error === 'already_claimed') { pending.claimed = true; saveState(); openModeRewardPopup(mode); return; }
        if (resp.error === 'no_reward') { showToast('Not enough wins for a reward!', 'var(--muted)'); return; }
        showToast('Claim failed — try again when online', 'var(--red)'); return;
      } else if (resp?.ok) {
        // Server granted — use server-authoritative tier
        pending.claimed = true;
        const tickets = resp.tickets;
        gameState.tickets = Math.min((gameState.tickets || 0) + tickets, 99);
        saveState(); updateMenuStats(); updateTicketUI();
        openModeRewardPopup(mode);
        showToast(`🎟️ ${resp.tier} Daily! +${tickets} Tickets`, 'var(--gold)');
        playSound('achieve'); vibrate([50, 50, 200]);
        return;
      }
    } catch(e) {
      showToast('Connection required to claim rewards', 'var(--red)');
      return;
    }
  }

  showToast('Sign in to claim your reward', 'var(--muted)');
}

async function claimModeWeeklyReward() {
  const mode = _modePopupMode;
  const data = _getModeRewardsData(mode);
  const pending = data.pendingWeekly;
  if (!pending || pending.claimed) { showToast('No weekly reward to claim!', 'var(--muted)'); return; }

  // Server validates actual win count from game_results
  if (typeof PLAYER_ID !== 'undefined' && PLAYER_ID) {
    const periodStart = pending.week + 'T00:00:00Z';
    // Weekly period ends 7 days later (Wednesday to Wednesday)
    const d = new Date(pending.week + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 7);
    const periodEnd = _modeUtcIso(d) + 'T00:00:00Z';
    try {
      const r = await fetch(`${getActiveServer().http}/mode-rewards/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PLAYER_ID, mode, period: 'weekly',
                               periodKey: pending.week, periodStart, periodEnd }),
        signal: AbortSignal.timeout(8000),
      });
      const resp = r.ok ? await r.json() : null;
      if (resp && !resp.ok) {
        if (resp.error === 'already_claimed') { pending.claimed = true; saveState(); openModeRewardPopup(mode); return; }
        if (resp.error === 'no_reward') { showToast('Not enough wins for a reward!', 'var(--muted)'); return; }
        showToast('Claim failed — try again when online', 'var(--red)'); return;
      } else if (resp?.ok) {
        pending.claimed = true;
        const tickets = resp.tickets;
        gameState.tickets = Math.min((gameState.tickets || 0) + tickets, 99);
        saveState(); updateMenuStats(); updateTicketUI();
        openModeRewardPopup(mode);
        showToast(`🎟️ ${resp.tier} Weekly! +${tickets} Tickets`, 'var(--gold)');
        playSound('achieve'); vibrate([50, 50, 200]);
        return;
      }
    } catch(e) {
      showToast('Connection required to claim rewards', 'var(--red)');
      return;
    }
  }

  showToast('Sign in to claim your reward', 'var(--muted)');
}

function toggleCaltropsPrimed() {
  if (!selectedItems.has('caltrops')) return;
  if ((gameState.inventory.caltrops || 0) <= 0) {
    showToast('No Caltrops left!', 'var(--muted)'); return;
  }
  if (playersLeft <= 3) {
    showToast('⚙️ Too few players left!', 'var(--muted)'); return;
  }
  caltropsPrimed = !caltropsPrimed;
  updateItemHudState();
  showToast(caltropsPrimed ? '⚙️ Caltrops ready — fires on next tap!' : '⚙️ Caltrops OFF', caltropsPrimed ? 'var(--fire2)' : 'var(--muted)');
}

function toggleShadowTilePrimed() {
  if (!selectedItems.has('shadow_tile')) return;
  if ((gameState.inventory.shadow_tile || 0) <= 0) {
    showToast('No Shadow Tile left!', 'var(--muted)'); return;
  }
  if (playersLeft <= 3) {
    showToast('🌑 Too few players left!', 'var(--muted)'); return;
  }
  shadowTilePrimed = !shadowTilePrimed;
  updateItemHudState();
  showToast(shadowTilePrimed ? '🌑 Shadow Tile ready — fires on next tap!' : '🌑 Shadow Tile OFF', shadowTilePrimed ? '#b464ff' : 'var(--muted)');
}

function updateItemHudState() {
  // Grey all item buttons when ≤5 players remain
  const itemsDisabled = playersLeft <= 5;
  ['hudCaltrops','hudShadowTile','hudPepperSpray'].forEach(id => {
    const el = document.getElementById(id);
    if (el && itemsDisabled) el.classList.add('used');
  });
  if (itemsDisabled) {
    const hudCrystal = document.getElementById('hudCrystal');
    if (hudCrystal) hudCrystal.classList.add('used');
    return; // skip rest of HUD update when disabled
  }
  const hudCalt = document.getElementById('hudCaltrops');
  const hudSD   = document.getElementById('hudShadowTile');
  const lCalt   = document.getElementById('hudCaltropsLabel');
  const lSD     = document.getElementById('hudShadowTileLabel');

  const caltCount = gameState.inventory.caltrops || 0;
  const sdCount   = gameState.inventory.shadow_tile || 0;

  if (hudCalt) {
    hudCalt.className = 'item-hud-btn' + (caltCount <= 0 ? ' used' : caltropsPrimed ? ' active' : '');
    if (lCalt) lCalt.textContent = caltropsPrimed ? '✓ NEXT TAP' : 'CALTROPS';
  }
  if (hudSD) {
    hudSD.className = 'item-hud-btn' + (sdCount <= 0 ? ' used' : shadowTilePrimed ? ' active' : '');
    if (lSD) lSD.textContent = shadowTilePrimed ? '✓ NEXT TAP' : 'SHADOW';
  }

  const hudPepperBtn = document.getElementById('hudPepperSpray');
  const hudPepperLbl = document.getElementById('hudPepperSprayLabel');
  const ppCount = gameState.inventory.pepper_spray || 0;
  if (hudPepperBtn) {
    hudPepperBtn.className = 'item-hud-btn' + (ppCount <= 0 ? ' used' : pepperSprayPrimed ? ' active' : '');
    if (hudPepperLbl) hudPepperLbl.textContent = pepperSprayPrimed ? '✓ NEXT TAP' : 'PEPPER';
  }

  const hudMRBtn = document.getElementById('hudMuscleRelaxant');
  const hudMRLbl = document.getElementById('hudMuscleRelaxantLabel');
  const mrCount  = gameState.inventory.muscle_relaxant || 0;
  const hudMRCnt = document.getElementById('hudMuscleRelaxantCount');
  if (hudMRBtn) {
    hudMRBtn.className = 'item-hud-btn' + (mrCount <= 0 ? ' used' : muscleRelaxantPrimed ? ' active' : '');
    if (hudMRLbl) hudMRLbl.textContent = muscleRelaxantPrimed ? '✓ NEXT TAP' : 'MUSCLE';
  }
  if (hudMRCnt) hudMRCnt.textContent = 'x' + mrCount;
}

function triggerShadowTile() {
  if (!selectedItems.has('shadow_tile')) return;
  if (itemShadowTileUsed) return;
  if (playersLeft <= 3) {
    showToast('🌑 Shadow Tile: too few players left!', 'var(--muted)');
    return;
  }
  if ((gameState.inventory.shadow_tile || 0) <= 0) {
    showToast('🌑 No Shadow Tile left!', 'var(--muted)');
    selectedItems.delete('shadow_tile');
    document.getElementById('hudShadowTile').className = 'item-hud-btn used';
    return;
  }
  itemShadowTileUsed = true;
  shadowTileActive = true;
  shadowTilePrimed = false;
  updateItemHudState();
  const remaining = gameState.inventory.shadow_tile || 0;
  const hudBtn = document.getElementById('hudShadowTile');
  hudBtn.className = 'item-hud-btn used';
  document.getElementById('hudShadowTileCount').textContent = `x${remaining}`;
  updateBotFeed('🌑 Shadow Tile activated! Next round is a trap for others...');
  showToast('🌑 Shadow Tile! Others will see a fake tile next round!', 'var(--fire2)');
}

// Apply shadow_tile effect to a round — add a fake trap tile
function applyShadowTileToRound(realIdx) {
  if (!shadowTileActive) return;
  shadowTileActive = false;
  itemShadowTileUsed = false; // allow reuse if player has more

  // Pick a fake tile (different from real)
  const allIdx = Array.from({length: gameState.gridSize}, (_, i) => i).filter(i => i !== realIdx);
  const fakeIdx = allIdx[Math.floor(Math.random() * allIdx.length)];

  // Show fake tile with a distinct "shadow" style
  tileStates[fakeIdx] = 'shadow';
  const el = document.getElementById('tile-' + fakeIdx);
  if (el) {
    el.className = 'tile burning';  // identical to real burning tile
  }

  updateBotFeed('🌑 Others see a shadow trap tile...');

  // After 1s, if player taps shadow tile — lock screen
  // Bots: randomly some tap the fake tile and get locked
  const activeBots = allPlayers.filter(p => p.isBot && !p.eliminated);
  const trapVictims = activeBots.filter(() => Math.random() < 0.4);
  (trapVictims||[]).forEach(bot => {
    updateBotFeed(`💫 ${bot.avatar} ${bot.name} tapped the shadow tile! Locked!`);
  });

  return fakeIdx;
}

function cleanupShadowTrap(fakeIdx) {
  if (fakeIdx === undefined || fakeIdx === null) return;
  if (tileStates[fakeIdx] === 'shadow') {
    tileStates[fakeIdx] = 'idle';
    const el = document.getElementById('tile-' + fakeIdx);
    if (el) { el.className = 'tile'; el.innerHTML = ''; }
  }
}

