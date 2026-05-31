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

function openDailyChallenge() {
  const dc = getDcProgress();
  if (dc.claimed) return;
  if (dc.completed) {
    const ch = getTodayDc();
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

function swapDailyChallenge() {
  const dc = getDcProgress();
  if (dc.claimed || dc.completed) { showToast('Challenge already done!', 'var(--muted)'); return; }
  if (dc.swapped) { showToast('Already swapped today!', 'var(--muted)'); return; }
  if (adWatchInProgress) { showToast('Ad already playing...', 'var(--muted)'); return; }

  adWatchInProgress = true;
  simulateAdWatch(() => {
    adWatchInProgress = false;
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
  });
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

function claimOfflineReward() {
  // Read from gameState mirror so the claimed amount always matches what the overlay displayed
  const earned = gameState._pendingOffline || pendingOfflineDiamonds;
  if (!earned) { document.getElementById('offlineRewardOverlay').classList.remove('show'); return; }
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

function maybeTriggerSurprise() {
  if (surpriseShown) return;
  if (Math.random() > SURPRISE_CHANCE) return;
  surpriseShown = true;

  const surprises = [
    { text:'Found hidden gem!', reward: () => { gameState.diamonds += 15; return '+💎 15'; } },
    { text:'Lucky streak bonus!', reward: () => { addItemToInventory('crystal', 2); return '+🔮 Crystal Ball ×2'; } },
    { text:'Secret chest opened!', reward: () => { gameState.diamonds += 8; addItemToInventory('shadow_tile', 1); return '+💎 8 & Shadow Tile'; } },
    { text:'Fortune smiles!', reward: () => { addItemToInventory('caltrops', 3); return '+⚙️ Caltrops ×3'; } },
  ];
  const s = surprises[Math.floor(Math.random() * surprises.length)];
  const rewardText = s.reward();
  saveState(); updateMenuStats(); updateInventoryUI();

  // Non-intrusive — toast only, no overlay
  showToast(`🎁 ${s.text} ${rewardText}`, 'var(--gold)');
  vibrate([30, 30, 60]);
  playSound('achieve');
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

function _modeWeekKey() {
  const n = new Date();
  const w = Math.ceil(((n - new Date(n.getFullYear(), 0, 1)) / 86400000 + new Date(n.getFullYear(), 0, 1).getDay() + 1) / 7);
  return `${n.getFullYear()}_w${w}`;
}

function _getModeRewardsData(mode) {
  if (!gameState.modeRewards) gameState.modeRewards = {};
  if (!gameState.modeRewards[mode]) gameState.modeRewards[mode] = {};
  const m = gameState.modeRewards[mode];
  const today = new Date().toDateString();
  const week  = _modeWeekKey();
  if (!m.daily  || m.daily.date   !== today) m.daily  = { date: today, wins: 0, claimed: false };
  if (!m.weekly || m.weekly.week  !== week)  m.weekly = { week,         wins: 0, claimed: false };
  return m;
}

let _modePopupMode = 'rush';

function recordModeWin(mode) {
  if (!['rush', 'buckshot', 'wild'].includes(mode)) return;
  const m = _getModeRewardsData(mode);
  m.daily.wins  = (m.daily.wins  || 0) + 1;
  m.weekly.wins = (m.weekly.wins || 0) + 1;
  saveState();
}

function openModeRewardPopup(mode) {
  _modePopupMode = mode;
  const popup = document.getElementById('modeRewardPopup');
  if (!popup) return;

  const labels = { rush: '⚡ Rush', buckshot: '💥 Buckshot', wild: '🌀 Wild' };
  const titleEl = document.getElementById('modeRewardPopupTitle');
  if (titleEl) titleEl.textContent = `${labels[mode] || mode} Rewards 🎟️`;

  const data       = _getModeRewardsData(mode);
  const dailyTier  = MODE_DAILY_TIERS.find(t  => data.daily.wins  >= t.minWins) || null;
  const weeklyTier = MODE_WEEKLY_TIERS.find(t => data.weekly.wins >= t.minWins) || null;

  const rankEl = document.getElementById('modeRewardPopupRank');
  if (rankEl) {
    const dw = data.daily.wins, ww = data.weekly.wins;
    rankEl.textContent = dw > 0
      ? `Today: ${dw} win${dw !== 1 ? 's' : ''} · Week: ${ww} win${ww !== 1 ? 's' : ''}`
      : 'Win matches to earn rewards!';
  }

  const dailyWrap = document.getElementById('modeDailyClaimWrap');
  const dailyBtn  = document.getElementById('modeDailyClaimBtn');
  if (dailyWrap) dailyWrap.style.display = (dailyTier && !data.daily.claimed) ? 'block' : 'none';
  if (dailyBtn && dailyTier) dailyBtn.textContent = `🎟️ CLAIM DAILY ${dailyTier.tier} — +${dailyTier.tickets} Tickets`;

  const weeklyWrap = document.getElementById('modeWeeklyClaimWrap');
  const weeklyBtn  = document.getElementById('modeWeeklyClaimBtn');
  if (weeklyWrap) weeklyWrap.style.display = (weeklyTier && !data.weekly.claimed) ? 'block' : 'none';
  if (weeklyBtn && weeklyTier) weeklyBtn.textContent = `🎟️ CLAIM WEEKLY ${weeklyTier.tier} — +${weeklyTier.tickets} Tickets`;

  popup.style.display = 'flex';
}

function closeModeRewardPopup() {
  const popup = document.getElementById('modeRewardPopup');
  if (popup) popup.style.display = 'none';
}

function claimModeDailyReward() {
  const mode = _modePopupMode;
  const data = _getModeRewardsData(mode);
  const tier = MODE_DAILY_TIERS.find(t => data.daily.wins >= t.minWins);
  if (!tier || data.daily.claimed) { showToast('No daily reward to claim!', 'var(--muted)'); return; }
  data.daily.claimed = true;
  gameState.tickets = Math.min((gameState.tickets || 0) + tier.tickets, 99);
  saveState(); updateMenuStats(); updateTicketUI();
  openModeRewardPopup(mode); // refresh popup
  showToast(`🎟️ ${tier.tier} Daily! +${tier.tickets} Tickets`, tier.color);
  playSound('achieve'); vibrate([50, 50, 200]);
}

function claimModeWeeklyReward() {
  const mode = _modePopupMode;
  const data = _getModeRewardsData(mode);
  const tier = MODE_WEEKLY_TIERS.find(t => data.weekly.wins >= t.minWins);
  if (!tier || data.weekly.claimed) { showToast('No weekly reward to claim!', 'var(--muted)'); return; }
  data.weekly.claimed = true;
  gameState.tickets = Math.min((gameState.tickets || 0) + tier.tickets, 99);
  saveState(); updateMenuStats(); updateTicketUI();
  openModeRewardPopup(mode); // refresh popup
  showToast(`🎟️ ${tier.tier} Weekly! +${tier.tickets} Tickets`, tier.color);
  playSound('achieve'); vibrate([50, 50, 200]);
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

