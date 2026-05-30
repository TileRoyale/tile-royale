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
    pendingOfflineDiamonds = Math.min(periods, 3) * OFFLINE_DIAMONDS; // max 3 periods = 150💎
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
  gameState.diamonds = (gameState.diamonds || 0) + pendingOfflineDiamonds;
  pendingOfflineDiamonds = 0;
  saveState();
  updateMenuStats();
  document.getElementById('offlineRewardOverlay').classList.remove('show');
  showToast(`💎 +${pendingOfflineDiamonds || OFFLINE_DIAMONDS} offline diamonds claimed!`, 'var(--diamond)');
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
// Codes: { reward: {diamonds, items, skins, avatars}, expires, maxUses, desc }
const PROMO_CODES = {
  'WELCOME2025':  { diamonds:500,  items:{crystal:2, caltrops:2}, desc:'Welcome gift!',              maxUses:999999 },
  'TILEROYALE':   { diamonds:1000, items:{crystal:3},             desc:'Official launch bonus!',     maxUses:999999 },
  'SUMMER2025':   { diamonds:750,  items:{caltrops:3},            desc:'Summer campaign reward',      maxUses:999999, expires:'2025-09-01' },
  'WILDMODE':     { diamonds:300,  items:{shadow_tile:3},         desc:'Wild mode launch reward',     maxUses:999999 },
  'KOTHWEEK1':    { diamonds:500,  items:{crystal:1,caltrops:1},  desc:'King of the Hill launch!',   maxUses:999999 },
  'WHALE4EVER':   { diamonds:2000, items:{shadow_tile:5},         desc:'Whale appreciation gift 🐋', maxUses:999999 },
  'BUGFIX':       { diamonds:200,                                  desc:'Thanks for your patience!',  maxUses:999999 },
  // ── Special codes ──
  'RAZ4WIN':      { _devAction:'koth_top3', desc:'KOTH Top 3 status + Custom Lobby unlock', maxUses:999999 },
  // ── Dev / test codes ──
  'DEV-GEMS':     { _devAction:'gems',    desc:'Dev: +10 000 diamonds', maxUses:999999 },
  'DEV-GAUNTLET': { _devAction:'gauntlet',desc:'Dev: Open Gauntlet',    maxUses:999999 },
  'DEV-LEVEL10':  { _devAction:'level10', desc:'Dev: Set Level 10',     maxUses:999999 },
};

function redeemCode() {
  const input = document.getElementById('redeemInput');
  const msg   = document.getElementById('redeemMsg');
  const code  = (input.value || '').trim().toUpperCase();

  if (!code) {
    showRedeemMsg('Enter a code first', 'error'); return;
  }

  const promo = PROMO_CODES[code];
  if (!promo) {
    showRedeemMsg('❌ Invalid code', 'error');
    input.value = '';
    return;
  }

  // Check expiry
  if (promo.expires && new Date() > new Date(promo.expires)) {
    showRedeemMsg('⏱ This code has expired', 'error'); return;
  }

  // Check already redeemed
  if (!gameState.redeemedCodes) gameState.redeemedCodes = [];
  if (gameState.redeemedCodes.includes(code)) {
    showRedeemMsg('✓ Already redeemed', 'info'); return;
  }

  // Apply rewards
  gameState.redeemedCodes.push(code);
  let rewardParts = [];

  // Dev actions — can be re-used (don't mark as redeemed permanently)
  if (promo._devAction) {
    gameState.redeemedCodes.pop(); // don't permanently mark dev codes
    if (promo._devAction === 'gems') {
      gameState.diamonds = (gameState.diamonds || 0) + 10000;
      saveState(); updateMenuStats();
      input.value = '';
      showRedeemMsg('💎 +10 000 diamonds added!', 'success');
      playSound('achieve');
    } else if (promo._devAction === 'gauntlet') {
      input.value = '';
      showRedeemMsg('🧤 Opening Gauntlet...', 'success');
      setTimeout(() => openGauntlet(), 400);
    } else if (promo._devAction === 'koth_top3') {
      if (!gameState.level || gameState.level < 1) gameState.level = 1;
      gameState.kothCustomUnlocked = true;
      assignKothTitle(1);
      saveState(); updateFeatureLocks(); updateMenuStats();
      input.value = '';
      showRedeemMsg('👑 KOTH Top 3 unlocked! Custom Lobby + KOTH King avatar!', 'success');
      playSound('achieve');
      showToast('👑 Raz4Win! KOTH Top 3 + Custom Lobby unlocked!', 'var(--gold)');
      return;
    } else if (promo._devAction === 'level10') {
      gameState.level = 10;
      gameState.xp = getXPForLevel(10); // 9*9*120 = 9720
      saveState(); updateFeatureLocks(); updateMenuStats();
      input.value = '';
      showRedeemMsg('⬆️ Level set to 10!', 'success');
      playSound('achieve');
    }
    return;
  }

  if (promo.diamonds) {
    gameState.diamonds = (gameState.diamonds || 0) + promo.diamonds;
    rewardParts.push(`💎 ${promo.diamonds.toLocaleString()}`);
  }
  if (promo.items) {
    Object.entries(promo.items).forEach(([id, qty]) => {
      addItemToInventory(id, qty);
      rewardParts.push(`${ITEM_TYPES[id]?.icon || '🎁'} ${ITEM_TYPES[id]?.name || id} ×${qty}`);
    });
  }
  if (promo.skins) {
    if (!gameState.ownedSkins) gameState.ownedSkins = {};
    (promo.skins||[]).forEach(id => {
      gameState.ownedSkins[id] = true;
      const skin = ALL_AVATARS.find(a => a.id === id);
      rewardParts.push(`🎨 ${skin?.name || id}`);
    });
  }

  saveState();
  updateMenuStats();
  updateInventoryUI();

  input.value = '';
  showRedeemMsg(`✅ ${promo.desc} — Claimed: ${rewardParts.join(' · ')}`, 'success');
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

