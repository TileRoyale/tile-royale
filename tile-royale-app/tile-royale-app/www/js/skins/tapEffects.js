// ===== WHALE TAP SYSTEM =====
function isPlayerWhale() {
  return !!(gameState.whaleBadge);
}

function sfxWhale(ctx, out) {
  const t = ctx.currentTime;
  // Deep ocean bass thud
  const bass = ctx.createOscillator();
  bass.type = 'sine';
  bass.frequency.setValueAtTime(55, t);
  bass.frequency.exponentialRampToValueAtTime(30, t + 0.5);
  const bassGain = ctx.createGain();
  bassGain.gain.setValueAtTime(0.8, t);
  bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  bass.connect(bassGain); bassGain.connect(out);
  bass.start(t); bass.stop(t + 0.6);

  // Water splash — noise burst
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 0.8);
  }
  const splash = ctx.createBufferSource();
  splash.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2000, t);
  filter.frequency.exponentialRampToValueAtTime(500, t + 0.4);
  const splashGain = ctx.createGain();
  splashGain.gain.setValueAtTime(0.4, t);
  splashGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  splash.connect(filter); filter.connect(splashGain); splashGain.connect(out);
  splash.start(t); splash.stop(t + 0.4);

  // High shimmer — whale call
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, t);
  osc.frequency.linearRampToValueAtTime(400, t + 0.3);
  osc.frequency.linearRampToValueAtTime(600, t + 0.5);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0, t);
  oscGain.gain.linearRampToValueAtTime(0.3, t + 0.05);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  osc.connect(oscGain); oscGain.connect(out);
  osc.start(t); osc.stop(t + 0.55);
}

function playWhaleSound() {
  if (!settings.sfx) return;
  try {
    const ctx = getAudioCtx();
    const vol = masterGain();
    sfxWhale(ctx, vol);
  } catch(e) {}
}

function showWhaleTapEffect(tileIdx) {
  // Animate 3 concentric waves on the tile
  const el = document.getElementById('tile-' + tileIdx);
  if (!el) return;
  el.style.position = 'relative';
  [1,2,3].forEach(n => {
    const wave = document.createElement('div');
    wave.className = `whale-wave whale-wave-${n}`;
    el.appendChild(wave);
    setTimeout(() => wave.remove(), 1000);
  });

  // Show floating "🐋 WHALE!" text
  const toast = document.createElement('div');
  toast.className = 'whale-tap-toast';
  toast.textContent = '🐋 WHALE!';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1200);
}

function triggerWhaleTap(tileIdx) {
  // Called when a whale player taps — broadcast to all
  playWhaleSound();
  showWhaleTapEffect(tileIdx);
}

function confirmQuitGame() {
  // If already on result screen, just go to menu
  if (document.getElementById('resultScreen')?.classList.contains('active')) {
    returnToMainMenu();
    return;
  }
  // If game not active, just go to menu directly
  if (!roundActive && !playerEliminated) {
    _fullGameCleanup();
    showScreen('menuScreen');
    return;
  }
  // Show quit dialog during active game
  const overlay = document.getElementById('quitDialogOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.classList.add('show');
  }
}

function closeQuitDialog() {
  const overlay = document.getElementById('quitDialogOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.classList.remove('show');
  }
}

function _fullGameCleanup() {
  // Stop ALL room listeners and callbacks immediately
  mpListenersActive = false;
  gameSessionId++;
  window._activeSession = null;
  roundActive = false;
  isMultiplayer = false;

  // ── Stop all intervals ──
  clearInterval(gameLoop);
  clearInterval(timerInterval);
  clearInterval(botBurnInterval);
  clearInterval(inactivityTimer);
  clearInterval(lobbyInterval);
  clearInterval(lobbyFillInterval);
  clearInterval(customLobbyFillInterval);
  clearInterval(customLobbyPollInterval);
  clearTimeout(customLobbyStartTimeout);
  customLobbyStartTimeout = null;
  isCustomLobbyGame = false;
  activeCustomBotSpeedMs = null;
  BOT_CLICK_SPEED_MS = { ...BOT_CLICK_SPEED_DEFAULT };
  clearInterval(specInterval);

  // ── Stop all timeouts ──
  clearTimeout(burnTimeout);
  clearTimeout(lobbySearchTimeout);
  clearTimeout(firstHintTimer);
  (Array.isArray(botTapTimeouts) ? botTapTimeouts : []).forEach(t => clearTimeout(t));
  botTapTimeouts = [];
  wildItemTimeouts.forEach(t => clearTimeout(t));
  wildItemTimeouts = [];
  const _wmHud = document.getElementById('wildMatchHud');
  if (_wmHud) { _wmHud.style.display = 'none'; _wmHud.style.opacity = '1'; }

  // ── Reset game state flags ──
  roundActive       = false;
  gridLocked        = false;
  burnScheduled     = false;
  playerEliminated  = false;
  suddenDeathMode   = false;
  goldenTileActive  = false;
  pepperSprayActive = false;
  pepperSprayPrimed = false;
  muscleRelaxantActive = false;
  muscleRelaxantPrimed = false;
  shadowTileActive  = false;
  shadowTilePrimed  = false;
  caltropsPrimed    = false;
  specInterval      = null;

  // ── Stop music/audio ──
  try { stopMusic(); } catch(e) {}
  ['elimOverlay','watchBar','quitDialogOverlay','dangerBanner',
   'kothRewardOverlay','firstHintOverlay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.classList.remove('show','active'); }
  });
  try { deactivateDangerMode(); } catch(e) {}
  // Kill all pending callbacks — any setTimeout still in flight will self-cancel
  window._activeSession = null;
  gameSessionId++;
  stopBoardAtmosphere();

  // Cleanup current match — permanent, no reconnect
  if (currentRoom) {
    try { currentRoom.leave(); } catch(e) {}
    currentRoom = null;
  }
  colyseusClient = null;
  isMultiplayer = false;
  mpListenersActive = false;
  // Clear any stored room/reconnect data
  try {
    ['roomId','reconnectToken','activeMatch','colyseus-reconnection'].forEach(k => {
      localStorage.removeItem(k);
    });
  } catch(e) {}
}

function returnToMainMenu() {
  _fullGameCleanup();
  showScreen('menuScreen');
  updateTicketUI();
  try { updateMenuStats(); } catch(e) {}
  try { renderMenuGauntletWidget(); } catch(e) {}
}

function quitToMenu() {
  closeQuitDialog();
  if (currentRoom) { try { currentRoom.leave(); } catch(e) {} currentRoom = null; isMultiplayer = false; }
  gameState.games = (gameState.games || 0) + 1;
  saveState();
  _fullGameCleanup();
  showScreen('menuScreen');
  try { updateMenuStats(); } catch(e) {}
  try { updateTicketUI(); } catch(e) {}
  try { renderMenuGauntletWidget(); } catch(e) {}
}

