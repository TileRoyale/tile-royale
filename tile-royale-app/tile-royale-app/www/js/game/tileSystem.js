// ===== SECRET TILE HANDLERS =====
let logoTapCount = 0, logoTapTimer = null;
let diamondTapCount = 0, diamondTapTimer = null;
let profileNameTapCount = 0, profileNameTapTimer = null;

function handleLogoTap() {
  logoTapCount++;
  clearTimeout(logoTapTimer);
  logoTapTimer = setTimeout(() => logoTapCount = 0, 1000);
  if (logoTapCount >= 5) {
    logoTapCount = 0;
    triggerSecretTile('ghost_tap');
  }
}

function handleDiamondTap() {
  diamondTapCount++;
  clearTimeout(diamondTapTimer);
  diamondTapTimer = setTimeout(() => diamondTapCount = 0, 1500);
  if (diamondTapCount >= 7) {
    diamondTapCount = 0;
    triggerSecretTile('konami');
  }
}

function handleProfileNameTap() {
  profileNameTapCount++;
  clearTimeout(profileNameTapTimer);
  profileNameTapTimer = setTimeout(() => profileNameTapCount = 0, 800);
  if (profileNameTapCount >= 3) {
    profileNameTapCount = 0;
    triggerSecretTile('back_door');
  }
}

function triggerSecretTile(id) {
  initAchStats();
  if (gameState.unlockedAch.includes(id)) {
    showToast('Already unlocked!', 'var(--muted)');
    return;
  }
  unlockAchievement(id);
}

// ===== 4. GOLDEN TILE — rare immunity reward =====
let playerImmune = false;
let goldenTileActive = false;
const GOLDEN_TILE_CHANCE = 0.05; // 5%

function maybeIgniteGoldenTile() {
  if (playerEliminated || goldenTileActive) return false;
  if (playersLeft <= 5) return false; // no golden tile in danger mode
  if (Math.random() > GOLDEN_TILE_CHANCE) return false;
  return true;
}

function igniteAsGolden(idx) {
  goldenTileActive = true;
  tileStates[idx] = 'golden';
  const el = document.getElementById('tile-' + idx);
  if (el) {
    el.className = 'tile golden';
    el.innerHTML = '';
  }
  showToast('⭐ GOLDEN TILE — tap for immunity!', 'var(--gold)');
}

function handleGoldenTap() {
  goldenTileActive = false;
  playerImmune = true;
  const badge = document.getElementById('immunityBadge');
  badge.style.display = 'block';
  showToast('🛡️ IMMUNE next round!', 'var(--gold)');
  vibrate([50, 50, 200]);
  playSound('levelup');
  // Remove immunity after next round resolves
  setTimeout(() => {
    playerImmune = false;
    badge.style.display = 'none';
  }, 8000);
}

// ===== BURN LOGIC =====
// Per-round tracking: track tap ORDER — last tapper loses
// botTapTimeouts declared at top
// tapOrder moved to top

function scheduleBurn() {
  if (burnScheduled) return;
  if (!roundActive && !window._activeSession) return;
  burnScheduled = true;
  const mySession = window._activeSession;
  console.log('[BURN]', { mode: gameState.mode, playersLeft, session: mySession });
  const remaining = playersLeft / gameState.players;
  const speedMult = isInDangerMode ? 0.25 : 1;
  // Faster overall: max 600ms base delay (was 2500ms)
  const minDelay = Math.max(100, 400 * remaining * speedMult);
  const maxDelay = Math.max(300, 600 * remaining * speedMult);
  burnTimeout = setTimeout(() => {
    if (window._activeSession !== mySession) { burnScheduled = false; return; }
    burnScheduled = false;
    if (gameState.mode === 'buckshot') {
      igniteBuckshot();
    } else if (gameState.mode === 'wild') {
      igniteWild();
    } else {
      igniteTile();
    }
  }, minDelay + Math.random() * (maxDelay - minDelay));
}

function updatePendingCounter(n) {
  const wrap = document.getElementById('pendingWrap');
  const el = document.getElementById('pendingCount');
  if (n > 0) { wrap.style.display = 'block'; el.textContent = n; }
  else { wrap.style.display = 'none'; }
}

// ---- Ignite a single tile ----
function igniteTile() {
  if (gameState.mode === 'buckshot') {
    console.error('[BUCKSHOT BUG] igniteTile() called in buckshot mode — redirecting');
    igniteBuckshot();
    return;
  }
  if (roundActive) return;
  // 5% chance of golden tile
  if (maybeIgniteGoldenTile()) {
    const idx = Math.floor(Math.random() * gameState.gridSize);
    startRound(1, idx, true);
  } else {
    startRound(1);
  }
}

