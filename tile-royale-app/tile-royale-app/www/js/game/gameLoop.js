// ===== ANTI-CHEAT =====
let recentReactions = []; // track last N reaction times
let suspiciousCount = 0;
let _lastReportTs   = 0;  // throttle: one server report per 60s

function _reportSuspicious(reason) {
  const now = Date.now();
  if (now - _lastReportTs < 60000) return; // throttle
  _lastReportTs = now;
  const pid = typeof PLAYER_ID !== 'undefined' ? PLAYER_ID : null;
  if (!pid) return;
  const srv = typeof getActiveServer === 'function' ? getActiveServer() : null;
  if (!srv) return;
  fetch(`${srv.http}/report/suspicious`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId: pid, reason }),
  }).catch(() => {});
}

function recordReactionTime(ms) {
  // Floor — physically impossible to tap faster than 80ms
  if (ms < 80) {
    suspiciousCount++;
    if (suspiciousCount >= 3) {
      showToast('⚠️ Unusual input detected', 'var(--red)');
      _reportSuspicious('ultra_fast_taps');
    }
    return false; // reject tap
  }

  recentReactions.push(ms);
  if (recentReactions.length > 20) recentReactions.shift();

  // Pattern check — too consistent = bot
  if (recentReactions.length >= 10) {
    const avg = recentReactions.reduce((a,b)=>a+b,0)/recentReactions.length;
    const variance = recentReactions.reduce((a,b)=>a+Math.pow(b-avg,2),0)/recentReactions.length;
    const stdDev = Math.sqrt(variance);
    // Human std dev is typically >40ms, bots are <15ms
    if (stdDev < 15 && avg < 200) {
      suspiciousCount++;
      if (suspiciousCount >= 5) {
        showToast('⚠️ Bot-like pattern detected', 'var(--red)');
        _reportSuspicious('bot_pattern');
      }
    }
  }
  return true;
}

// ===== 3. COMEBACK MECHANIC — Final 3 intensification =====
let isInDangerMode = false;
let playersLeftAtStart = 30;   // set at game start; guards danger mode from firing at match open
let previousPlayersLeft = 30;  // tracks last known count to detect the exact crossing of the threshold
let matchStarted = false;      // true only after first round fires — prevents lobby/init triggers

function activateDangerMode() {
  if (isInDangerMode) return;
  isInDangerMode = true;
  // Screen pulse
  document.getElementById('gameScreen').classList.add('danger-mode');
  // Show banner
  const banner = document.getElementById('dangerBanner');
  banner.classList.add('show');
  // Vibrate pattern
  vibrate([50, 100, 50, 100, 200]);
  showToast(`⚠️ FINAL ${playersLeft} — tiles ignite faster!`, 'var(--red)');
}

function deactivateDangerMode() {
  isInDangerMode = false;
  document.getElementById('gameScreen').classList.remove('danger-mode');
  document.getElementById('dangerBanner').classList.remove('show');
}

function updateDangerMode() {
  const banner = document.getElementById('dangerBanner');
  const triggered =
    matchStarted &&              // game is actually running (not lobby/init)
    playersLeft > 0 &&           // never trigger at 0 (bad server state)
    playersLeft <= 5 &&          // threshold crossed
    !playerEliminated &&         // player must still be alive
    previousPlayersLeft > 5;     // must have just crossed the threshold from above


  if (triggered) {
    activateDangerMode();
    if (banner) {
      document.getElementById('dangerPlayersLeft').textContent = `${playersLeft} players left`;
    }
  } else if (playersLeft > 5 || !matchStarted) {
    deactivateDangerMode();
  }
  previousPlayersLeft = playersLeft;
}

// ===== GAME =====
function startGame() {
  showScreen('gameScreen');
  // Hide solo-only overlays that persist in the DOM after a solo session
  const _sl = document.getElementById('soloTapsLabel');
  if (_sl) _sl.style.display = 'none';
  const _sc = document.getElementById('soloColorHud');
  if (_sc) _sc.style.display = 'none';
  // Restore tileGrid vertical centering (solo sets alignContent:'start')
  const _tg = document.getElementById('tileGrid');
  if (_tg) _tg.style.alignContent = '';
  playerEliminated = false;
  playersLeft = gameState.players;
  playerPlace = gameState.players;
  playersLeftAtStart   = gameState.players;
  previousPlayersLeft  = gameState.players;
  matchStarted         = false;
  // Reset danger mode and banner immediately
  isInDangerMode = false;
  try { deactivateDangerMode(); } catch(e) {}
  const dangerBanner = document.getElementById('dangerBanner');
  if (dangerBanner) dangerBanner.classList.remove('show');
  gridLocked = false;
  burningTiles = [];
  currentBurningTile = null;
  shadowTileActive = false;
  itemShadowTileUsed = false;
  caltropsPrimed = false;
  shadowTilePrimed = false;
  if (!customLobbySuddenDeath) suddenDeathMode = false;
  recentReactions = [];
  suspiciousCount = 0;
  roundActive = false;
  burnScheduled = false;
  tapOrder = [];
  roundPlayerCount = 0;
  playerTilesLeft = 0;
  (botTapTimeouts||[]).forEach(t => clearTimeout(t));
  botTapTimeouts = [];
  lastTapTime = Date.now();
  document.getElementById('watchBar').classList.remove('show');
  document.getElementById('watchBar').style.display = '';   // clear inline style from _fullGameCleanup
  document.getElementById('elimOverlay').classList.remove('show');
  document.getElementById('elimOverlay').style.display = ''; // clear inline style from _fullGameCleanup
  document.getElementById('inactivityBar').style.display = 'none';

  updateKothGameBanner();
  timeLeft = Infinity; // No time limit — game ends only when 1 player remains

  const cols = 5;
  const grid = document.getElementById('tileGrid');
  grid.style.gridTemplateColumns = 'repeat(5, 1fr)';
  grid.innerHTML = '';
  tileStates = Array(gameState.gridSize).fill('idle');

  for (let i = 0; i < gameState.gridSize; i++) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.id = `tile-${i}`;
    tile.onclick = () => tapTile(i);
    grid.appendChild(tile);
  }

  updateGameHeader();

  // Wild mode item setup
  itemCrystalUsed = false;
  itemCaltropsUsed = false;
  crystalCandidates = [];
  wildItemCooldownEnd = 0;
  document.getElementById('itemHud').style.display = 'none'; // HUD hidden — items fire automatically via wildLoadout
  // Buckshot wave state reset
  buckshotWaveStart = 0; buckshotActiveTileCount = 0; buckshotPlayerCleared = 0;
  wildGameUsesLeft = {};
  buckshotCompletions = []; buckshotBotCleared = {}; buckshotAlivePlayers = 0;

  applySkins();
  showFirstGameHint();
  startCountdown(() => { startGameLoop(); });
}

function startCountdown(cb) {
  const overlay = document.getElementById('countdownOverlay');
  const num = document.getElementById('countdownNum');
  overlay.style.display = 'flex';
  let c = 3;
  num.textContent = c;
  playSound('countdown');

  const ci = setInterval(() => {
    c--;
    if (c <= 0) {
      clearInterval(ci);
      num.textContent = 'GO!';
      num.style.color = 'var(--green)';
      setTimeout(() => {
        overlay.style.display = 'none';
        num.style.color = 'var(--fire)';
        cb();
      }, 700);
    } else {
      num.textContent = c;
      // re-trigger animation
      num.style.animation = 'none';
      num.offsetHeight;
      num.style.animation = 'countAnim 0.9s ease-out';
    }
  }, 1000);
}

function startGameLoop() {
  // New session — any old callbacks from previous game will self-cancel
  gameSessionId++;
  const mySession = gameSessionId;
  window._activeSession = mySession;
  matchStarted = true; // game is now live; unlocks danger-mode threshold checks
  // Start board atmosphere
  setTimeout(() => startBoardAtmosphere(), 400);

  // No game timer — match ends only when 1 player remains
  startMusic('game');
  scheduleBurn();
  botBurnInterval = setInterval(() => { if (window._activeSession !== mySession) return; botAction(); }, 400);
  startInactivityTimer();
  setupWildAutoTriggers();
}

// ===== INACTIVITY TIMER =====
// Inactivity is handled by scheduleBotTaps deadline — no separate timer needed
function startInactivityTimer() { /* disabled */ }
function resetInactivity() {
  lastTapTime = Date.now();
}


function scheduleBotTaps() {
  if (gameState.mode === 'buckshot') {
    console.error('[BUCKSHOT BUG] scheduleBotTaps() called in buckshot mode — aborting');
    return;
  }
  (botTapTimeouts||[]).forEach(t => clearTimeout(t));
  botTapTimeouts = [];

  const activeBots = allPlayers.filter(p => p.isBot && !p.eliminated);
  const totalTappers = activeBots.length + (playerEliminated ? 0 : 1);
  roundPlayerCount = totalTappers;

  const _speed = activeCustomBotSpeedMs !== null
    ? { min: activeCustomBotSpeedMs, max: activeCustomBotSpeedMs }
    : BOT_CLICK_SPEED_MS;
  const baseWindow = _speed.max;

  (activeBots||[]).forEach((bot, i) => {
    const delay = _speed.min + Math.random() * (_speed.max - _speed.min);

    const t = setTimeout(() => {
      if (!roundActive) return;
      recordTap(allPlayers.indexOf(bot), bot.avatar + ' ' + bot.name);
    }, delay);
    botTapTimeouts.push(t);
  });

  // Hard deadline — 300ms after last bot could tap
  burnTimeout = setTimeout(() => {
    if (!roundActive) return;
    if (!playerEliminated && !tapOrder.includes(-1)) {
      recordTap(-1, 'YOU');
    } else {
      finalizeRound();
    }
  }, baseWindow + 300);
}

// Record a tap in order
function recordTap(id, name) {
  if (tapOrder.includes(id)) return;
  tapOrder.push(id);
  const remaining = roundPlayerCount - tapOrder.length;
  updatePendingCounter(Math.max(0, remaining));

  // Track tap stats for game summary
  const rt = Math.max(0, Date.now() - (practiceTileIgniteTime || Date.now()));
  if (id === -1) {
    const playerObj = allPlayers.find(p => !p.isBot);
    if (playerObj) { playerObj.tapCount = (playerObj.tapCount || 0) + 1; playerObj.totalReactionMs = (playerObj.totalReactionMs || 0) + rt; }
    // Count player tap for achievements
    if (!gameState.achStats) gameState.achStats = {};
    gameState.achStats.roundTapsThisGame = (gameState.achStats.roundTapsThisGame || 0) + 1;
    if (!isCustomLobbyGame) updateDcProgress('streakTaps', 1);
  } else {
    const bot = allPlayers[id];
    if (bot) { bot.tapCount = (bot.tapCount || 0) + 1; bot.totalReactionMs = (bot.totalReactionMs || 0) + rt; }
    updateBotFeed(name + ' tapped!');
  }

  // If everyone has tapped, end round immediately
  if (tapOrder.length >= roundPlayerCount) {
    clearTimeout(burnTimeout);
    (botTapTimeouts||[]).forEach(t => clearTimeout(t));
    botTapTimeouts = [];
    setTimeout(finalizeRound, 150);
  }
}

// End the round — last in tapOrder loses
function finalizeRound() {
  if (!roundActive) return;
  roundActive = false;
  clearTimeout(burnTimeout);
  (botTapTimeouts||[]).forEach(t => clearTimeout(t));
  botTapTimeouts = [];
  burnScheduled = false;
  burningTiles = [];
  currentBurningTile = null;
  updatePendingCounter(0);
  // Cleanup any shadow trap tile
  cleanupShadowTrap(startRound._fakeIdx);
  // Reset muscle relaxant after each round
  if (muscleRelaxantActive) {
    muscleRelaxantActive = false;
    muscleRelaxantFirstTapped.clear();
  }
  startRound._fakeIdx = null;

  if (tapOrder.length === 0) { scheduleBurn(); return; }

  // Last tapper loses
  const loserId = tapOrder[tapOrder.length - 1];

  if (loserId === -1 && !playerEliminated) {
    eliminatePlayer('last');
  } else {
    const loserBot = allPlayers[loserId];
    if (!loserBot || loserBot.eliminated) {
      // Safety: bot already gone, just continue
      setTimeout(() => { if(window._activeSession) scheduleBurn(); }, 300);
      return;
    }
    loserBot.eliminated = true;
    playersLeft = Math.max(1, playersLeft - 1);
    updateGameHeader();
    updateBotFeed('💀 ' + loserBot.avatar + ' ' + loserBot.name + ' was last — OUT!');
    updateWatchBar();
    updateMusicIntensity();
    updateDangerMode();
    maybeTriggerSurprise();
    checkEliminationTrigger();
    // Short pause for readability, then immediately next round
    const postElimDelay = playersLeft <= 5 ? 300 : 500;
    setTimeout(() => {
        if (playersLeft <= 1 && !playerEliminated) { endGame(true); return; }
      if (playersLeft <= 1) { endGame(false); return; }
      scheduleBurn();
    }, postElimDelay);
  }
}

function _originalTapTile(idx) {
  if (playerEliminated) return;
  if (gridLocked) return;

  // Golden tile tap — must check BEFORE wrong tile penalty
  if (tileStates[idx] === 'golden') {
    handleGoldenTap();
    tileStates[idx] = 'tapped';
    const el = document.getElementById('tile-' + idx);
    if (el) { el.className = 'tile tapped'; el.innerHTML = '⭐'; }
    goldenTileActive = false;
    recordTap(-1, 'YOU');
    return;
  }

  // Muscle relaxant first-tap block
  if (muscleRelaxantActive && handleMuscleRelaxantFirstTap(idx)) return;

  // Buckshot: tapping already-cleared tile is not a mistake
  if (gameState.mode === 'buckshot' && tileStates[idx] === 'tapped') return;

  // Shadow trap tap — must be BEFORE wrong tile check
  if (tileStates[idx] === 'shadow') {
    // Lock screen for 1 second — same as wrong tap
    playSound('wrong'); vibrate(80);
    gridLocked = true;
    document.getElementById('tileGrid').classList.add('locked');
    document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = '#6600aa'; t.style.opacity = '0.5'; });
    const lockEl = document.getElementById('lockOverlay');
    lockEl.querySelector('.lock-count').textContent = '1.0';
    lockEl.querySelector('.lock-count').style.color = '#b464ff';
    lockEl.classList.add('show');
    let lockCount = 10;
    const lockTick = setInterval(() => {
      lockCount--;
      lockEl.querySelector('.lock-count').textContent = (lockCount / 10).toFixed(1);
      if (lockCount <= 0) {
        clearInterval(lockTick);
        gridLocked = false;
        lockEl.classList.remove('show');
        lockEl.querySelector('.lock-count').style.color = 'var(--red)';
        document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = ''; t.style.opacity = ''; });
        document.getElementById('tileGrid').classList.remove('locked');
        showToast('🌑 Shadow trap! You were fooled!', '#b464ff');
      }
    }, 100);
    return;
  }

  // Wrong tile penalty — all modes
  if (!roundActive || tileStates[idx] !== 'burning') {
    if (!roundActive) return;
    playSound('wrong');
    vibrate(80);
    initAchStats();
    gameState.achStats.wrongTaps = (gameState.achStats.wrongTaps || 0) + 1;
    if (!isCustomLobbyGame) resetDcStreak();

    if (suddenDeathMode) {
      document.getElementById('tileGrid').classList.add('locked');
      document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = 'var(--red)'; t.style.opacity = '0.4'; });
      showToast('⚡ SUDDEN DEATH — eliminated!', 'var(--red)');
      vibrate([100, 50, 200]);
      setTimeout(() => {
        document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = ''; t.style.opacity = ''; });
        document.getElementById('tileGrid').classList.remove('locked');
        eliminatePlayer('sudden_death');
      }, 400);
      return;
    }

    document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = 'var(--red)'; t.style.opacity = '0.5'; });
    showLockOverlay(700);
    setTimeout(() => {
      document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = ''; t.style.opacity = ''; });
    }, 700);
    return;
  }

  const reactionMs = Date.now() - (practiceTileIgniteTime || Date.now());
  if (!recordReactionTime(reactionMs)) return; // rejected — too fast

  // Valid tap on burning tile
  resetInactivity();
  vibrate(25);
  hideFirstGameHint();

  // Whale tap — special effect for all to see
  if (isPlayerWhale()) {
    triggerWhaleTap(idx);
  } else {
    playSound('tap');
  }
  // Wild mode items fire automatically via setupWildAutoTriggers — not on tap
  tileStates[idx] = 'tapped';
  const el = document.getElementById('tile-' + idx);
  if (el) {
    el.className = 'tile tapped'; el.innerHTML = '';
    const r = document.createElement('div'); r.className = getTapEffectClass(); el.appendChild(r);
    setTimeout(() => r.remove(), 800);
  }
  burningTiles = burningTiles.filter(i => i !== idx);
  currentBurningTile = burningTiles[0] ?? null;
  playerTilesLeft = burningTiles.filter(i => tileStates[i] === 'burning').length;

  if (gameState.mode === 'buckshot') {
    buckshotPlayerCleared++;
    if (playerTilesLeft === 0) {
      // Player cleared every tile — record completion time
      buckshotOnPlayerClear();
      if (isPlayerWhale()) triggerWhaleTap(idx);
    }
    // No pending counter update here — pendingWrap shows players-not-done count (managed by buckshotRecordFinish)
  } else {
    // Rush / Wild: register player as done when last tile hit
    if (playerTilesLeft === 0) {
      recordTap(-1, 'YOU');
      if (isPlayerWhale()) triggerWhaleTap(idx);
    } else {
      updatePendingCounter(playerTilesLeft);
    }
  }
}

function eliminatePlayer(reason = 'last') {
  // Check immunity
  if (playerImmune) {
    playerImmune = false;
    document.getElementById('immunityBadge').style.display = 'none';
    showToast('🛡️ Shield absorbed the hit!', 'var(--gold)');
    vibrate([100, 50, 100]);
    return;
  }
  playerEliminated = true;
  cancelWildItems(); // cancel future auto-activations and refund unused items
  playersLeft--;
  playSound('elim');
  vibrate([100, 50, 100]);
  stopMusic();
  roundActive = false;
  burnScheduled = false;
  clearInterval(inactivityTimer);
  document.getElementById('inactivityBar').style.display = 'none';
  const place = playersLeft + 1;
  playerPlace = place;
  document.getElementById('elimOverlay').classList.add('show');
  document.getElementById('elimPlace').textContent = place + ordinal(place) + ' PLACE';
  const subs = { last: 'You were last to tap!', inactivity: 'Too slow to react!', missed: 'You missed the tile!', slow: 'Slowest to clear all tiles!' };
  document.querySelector('.elim-sub').textContent = subs[reason] || subs.last;
  setTimeout(() => {
    document.getElementById('elimOverlay').classList.remove('show');
    document.getElementById('watchBar').classList.add('show');
    updateWatchBar();
    updateSpectatorTiles();
  }, 2000);
  updateGameHeader();
  updatePendingCounter(0);
  burnScheduled = false;
  setTimeout(() => { if (timeLeft > 0 && playersLeft > 1) scheduleBurn(); }, 300);
}

function botAction() {
  if (!window._activeSession || !roundActive) return;
  // Intentionally empty — bot taps handled by scheduleBotTaps
}

function updateBotFeed(msg) {
  document.getElementById('feedText').textContent = msg;
}

function updateGameHeader() {
  // No timer — show players remaining instead
  const timerEl = document.getElementById('gameTimer');
  timerEl.textContent = playersLeft > 1 ? `👥 ${playersLeft}` : '🏆 1';
  timerEl.className = 'game-timer' + (playersLeft <= 5 ? ' urgent' : '');

  // Players left
  document.getElementById('playersLeftCount').textContent = playersLeft;

  // Mode badge
  const badges = { rush: '⚡ RUSH', classic: '🔥 CLASSIC', marathon: '👑 MARATHON', buckshot: '💥 BUCKSHOT', wild: '🌀 WILD', koth: '👑 KING' };
  document.getElementById('gameModeBadge').textContent = badges[gameState.mode];
}

function updateWatchBar() {
  const el = document.getElementById('watchPlace');
  el.textContent = `${playerPlace}${ordinal(playerPlace)} PLACE · WATCHING · ${playersLeft} REMAINING`;
}

async function endGame(playerWon = false) {
  // Don't bail if session is null — game ending is always valid
  clearInterval(timerInterval);
  clearTimeout(burnTimeout);
  clearInterval(botBurnInterval);
  // Cleanup game state
  try { deactivateDangerMode(); } catch(e) {}
  isInDangerMode = false;
  goldenTileActive = false;
  suddenDeathMode = false;
  playerImmune = false;
  surpriseShown = false;
  try { document.getElementById('immunityBadge').style.display = 'none'; } catch(e) {}
  stopMusic();
  try { document.getElementById('watchBar').classList.remove('show'); } catch(e) {}
  setTimeout(() => playSound((!playerEliminated || playerWon) ? 'victory' : 'elim'), 300);

  gameState.games++;

  // Calculate rewards
  let diamonds = 0;
  let xp = 0;
  let crown = '💀';
  let titleClass = 'lose';
  let titleText = 'ELIMINATED';
  let bonusItem = null;

  // Daily diamond cap
  const today = new Date().toDateString();
  if (!gameState.dailyDiamondsEarned) gameState.dailyDiamondsEarned = {};
  if (gameState.dailyDiamondsEarned.date !== today) {
    gameState.dailyDiamondsEarned = { date: today, amount: 0 };
  }
  const dailyCap = 80;
  const dailyLeft = Math.max(0, dailyCap - (gameState.dailyDiamondsEarned.amount || 0));

  if (!playerEliminated || playerWon) {
    playerPlace = 1;
    crown = '🏆'; titleClass = 'win'; titleText = 'VICTORY!';
    if (!isCustomLobbyGame) {
      gameState.wins++;
      if (typeof recordModeWin === 'function') recordModeWin(gameState.mode);
      diamonds = Math.min(6, dailyLeft); xp = 120;
      bonusItem = Object.keys(ITEM_TYPES)[Math.floor(Math.random() * Object.keys(ITEM_TYPES).length)];
      if (gameState.mode === 'koth') handleKothWin();
      if (isMultiplayer) {
        const finalOpponent = allPlayers.find(p => p.isBot === false && !p.isYou && (p).isWhale);
        const wasFinale     = playersLeft <= 2 || (allPlayers.filter(p => !p.eliminated).length <= 2);
        if (finalOpponent && wasFinale) {
          initAchStats();
          gameState.achStats.mobyDickWins = (gameState.achStats.mobyDickWins || 0) + 1;
          checkAchievements();
          setTimeout(() => showToast('🐋 MOBY DICK! You slayed the whale!', 'var(--diamond)'), 1500);
        }
      }
    }
  } else if (!isCustomLobbyGame) {
    if (playerPlace === 2) {
      diamonds = Math.min(4, dailyLeft); xp = 100; crown = '🥇';
    } else if (playerPlace === 3) {
      diamonds = Math.min(2, dailyLeft); xp = 85; crown = '🥈';
      bonusItem = Object.keys(ITEM_TYPES)[Math.floor(Math.random() * Object.keys(ITEM_TYPES).length)];
    } else if (playerPlace <= 5) {
      diamonds = Math.min(1, dailyLeft); xp = 65; crown = '🥉';
    } else {
      diamonds = Math.min(1, dailyLeft); xp = 40; crown = '💀';
    }
  }

  const streakBonus   = (!isCustomLobbyGame && (!playerEliminated || playerWon) && (gameState.achStats?.winStreak || 0) >= 1) ? 15 : 0;
  const survivalBonus = (!isCustomLobbyGame && (!playerEliminated || playerWon)) ? 15 : 0;
  xp += streakBonus + survivalBonus;

  const xpBoostActive = (gameState.xpBoostGames || 0) > 0;
  if (!isCustomLobbyGame && xpBoostActive) { xp *= 2; gameState.xpBoostGames = Math.max(0, (gameState.xpBoostGames || 1) - 1); }

  // Fetch server-authoritative diamond and XP cap before applying rewards
  if (!isCustomLobbyGame) {
    try {
      const srv = typeof getActiveServer === 'function' ? getActiveServer() : null;
      const pid = typeof PLAYER_ID !== 'undefined' ? PLAYER_ID : null;
      if (srv && pid) {
        const resp = await fetch(`${srv.http}/game/end-rewards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: pid,
            placement: playerPlace,
            mode: gameState.mode,
            isCustomLobby: false,
            xpBoostActive,
            isBotMatch: !isMultiplayer,
            tilesTapped: gameState.achStats?.roundTapsThisGame || 0,
            totalPlayers: allPlayers.length || 30,
          }),
          signal: AbortSignal.timeout(5000),
        });
        const data = resp.ok ? await resp.json() : null;
        if (data?.ok) {
          diamonds = data.diamonds;             // server-authoritative diamond grant
          xp       = Math.min(xp, data.xp);    // cap XP at server-calculated maximum
        }
      }
    } catch (_e) { /* server unreachable — use local values; ceiling still protects */ }
  }

  const oldXP = gameState.xp || 0;
  if (!isCustomLobbyGame) {
    gameState.dailyDiamondsEarned.amount = (gameState.dailyDiamondsEarned.amount || 0) + diamonds;
    gameState.diamonds += diamonds;
    gameState.xp = oldXP + xp;
    console.log("[XP]", { oldXP, gainedXP: xp, newXP: gameState.xp, levelBefore: getLevelFromXP(oldXP), streakBonus, survivalBonus, boost: xpBoostActive });
    if (bonusItem) addItemToInventory(bonusItem, 1);
    awardLevelUp();

    // Update daily challenge progress
    const dc = getDcProgress();
    dc.tapsToday = (dc.tapsToday || 0) + (gameState.achStats?.roundTapsThisGame || 0);
    if (gameState.mode === 'koth') updateDcProgress('kothGames');
    if (!playerEliminated || playerWon) {
      if (gameState.mode === 'rush') updateDcProgress('rushWins');
      if (gameState.mode === 'wild') updateDcProgress('wildWins');
      if (playerPlace <= 3) updateDcProgress('top3Today');
    }
    if (gameState.mode === 'buckshot') updateDcProgress('buckshotGames');
    updateDcProgress('tapsToday', gameState.achStats?.roundTapsThisGame || 0);
    renderMenuDailyChallenge();

    updateAchStats({
      won: !playerEliminated || playerWon,
      place: playerPlace,
      mode: gameState.mode,
      diamonds: diamonds,
      taps: (gameState.achStats?.roundTapsThisGame || 0),
    });
    try { trackMissionEvent('match_end', { placement: playerPlace, taps: gameState.achStats?.roundTapsThisGame || 0, xp, mode: gameState.mode }); } catch(e) {}
  }
  if (!gameState.achStats) gameState.achStats = {};
  gameState.achStats.roundTapsThisGame = 0;

  saveState();
  updateMenuStats();

  // Build leaderboard
  const finalPlayers = [...allPlayers];
  // Sort: player first if won, otherwise by elimination order
  const lb = document.getElementById('leaderboard');
  lb.innerHTML = '';
  const gsSummary = document.getElementById('gameSummary'); if (gsSummary) gsSummary.style.display = 'none';

  // Determine winner name — always use real name
  const playerName = gameState.playerName || 'YOU';
  const winnerBot  = allPlayers.find(p => p.isBot && !p.eliminated);
  const winnerName = (!playerEliminated || playerWon) ? playerName : (winnerBot?.name || 'Bot');
  const winnerAv   = (!playerEliminated || playerWon) ? getActiveAvatar().icon : (winnerBot?.avatar || '🤖');

  // Top 5 results
  const showPlaces = [
    { place: 1, name: winnerName, avatar: winnerAv,
      isYou: !playerEliminated || playerWon, diamonds: diamonds },
  ];

  // Fill in some bots
  const activeBots = allPlayers.filter(p => p.isBot && !p.eliminated);
  let placeNum = playerEliminated && !playerWon ? 2 : 2;
  activeBots.slice(0, 4).forEach(bot => {
    showPlaces.push({ place: placeNum++, name: bot.name, avatar: bot.avatar, isYou: false, diamonds: 0 });
  });

  if (playerEliminated && !playerWon) {
    showPlaces.push({ place: playerPlace, name: 'YOU', avatar: '🎮', isYou: true, diamonds });
  }

  const _escLb = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  showPlaces.sort((a, b) => a.place - b.place).forEach(p => {
    const placeColors = { 1: 'var(--gold)', 2: '#c0c0c0', 3: '#cd7f32' };
    const row = document.createElement('div');
    row.className = 'lb-row' + (p.isYou ? ' you-row' : '');
    row.innerHTML = `
      <div class="lb-place" style="color:${placeColors[p.place] || 'var(--muted)'}">${p.place}</div>
      <div class="lb-avatar">${_escLb(p.avatar)}</div>
      <div class="lb-name">${_escLb(p.name)}${p.isYou ? ' <span style="color:var(--gold);font-size:11px">(YOU)</span>' : ''}</div>
      <div class="lb-diamond">💎 ${p.diamonds}</div>
    `;
    lb.appendChild(row);
  });

  // Winner display
  const winnerDisplay = document.getElementById('winnerDisplay');
  const winnerFrame = document.getElementById('winnerAvatarFrame');
  const winnerNameEl = document.getElementById('winnerName');
  const crownEl = document.getElementById('resultCrown');

  if (!playerEliminated || playerWon) {
    // Player won — show player's avatar
    const av = getActiveAvatar();
    crownEl.style.display = 'none';
    winnerDisplay.style.display = 'flex';
    winnerFrame.textContent = av.icon;
    winnerFrame.style.borderColor = av.border;
    winnerFrame.style.background = av.bg;
    winnerFrame.style.boxShadow = `0 0 24px ${av.border}88`;
    if (av.whaleBorder) winnerFrame.classList.add('whale-frame');
    winnerNameEl.textContent = gameState.playerName || 'Player';
    winnerNameEl.style.color = av.border;
  } else {
    // Bot won — show bot avatar
    const winner = allPlayers.find(p => p.isBot && !p.eliminated);
    crownEl.style.display = 'none';
    winnerDisplay.style.display = 'flex';
    if (winner) {
      winnerFrame.textContent = winner.avatar;
      winnerFrame.style.borderColor = '#555570';
      winnerFrame.style.background = '#0a0a15';
      winnerFrame.style.boxShadow = '0 0 12px rgba(80,80,120,0.4)';
      winnerNameEl.textContent = winner.name;
      winnerNameEl.style.color = 'var(--muted)';
    } else {
      crownEl.style.display = 'block';
      winnerDisplay.style.display = 'none';
    }
  }
  document.getElementById('resultTitle').textContent = titleText;
  document.getElementById('resultTitle').className = `result-title ${titleClass}`;
  document.getElementById('resultPlace').textContent = `${playerPlace}${ordinal(playerPlace).toUpperCase()} PLACE`;
  document.getElementById('rewardDiamonds').textContent = `+${diamonds}`;
  // Daily cap indicator
  const capRow = document.getElementById('rewardCapRow');
  const earned = gameState.dailyDiamondsEarned?.amount || 0;
  if (earned >= 80) {
    capRow.style.display = 'flex';
    document.getElementById('rewardCapVal').textContent = `${Math.min(earned,80)}/80 — capped!`;
    document.getElementById('rewardCapVal').style.color = 'var(--red)';
  } else if (earned > 65) {
    capRow.style.display = 'flex';
    document.getElementById('rewardCapVal').textContent = `${earned}/80 today`;
    document.getElementById('rewardCapVal').style.color = 'var(--fire2)';
  } else {
    capRow.style.display = 'none';
  }
  document.getElementById('rewardXP').textContent = `+${xp}`;
  document.getElementById('rewardPlace').textContent = `${playerPlace}${ordinal(playerPlace)}`;
  document.getElementById('rewardPlace').style.color = playerPlace === 1 ? 'var(--gold)' : playerPlace <= 3 ? 'var(--fire2)' : 'var(--muted)';

  // Bonus item row
  const itemRow = document.getElementById('rewardItemRow');
  if (bonusItem) {
    itemRow.style.display = 'flex';
    document.getElementById('rewardItemLabel').textContent = playerPlace <= 3 ? '🏆 Top 3 Bonus' : '🎁 Item Bonus';
    document.getElementById('rewardItemVal').textContent = `+1 ${ITEM_TYPES[bonusItem].icon} ${ITEM_TYPES[bonusItem].name}`;
  } else {
    itemRow.style.display = 'none';
  }

  // Level up row
  const prevLevel = getLevelFromXP(oldXP);
  const newLevel = gameState.level;
  const levelRow = document.getElementById('rewardLevelRow');
  if (newLevel > prevLevel) {
    levelRow.style.display = 'flex';
    document.getElementById('rewardLevelVal').textContent = `→ Level ${newLevel} (+1 each item)`;
  } else {
    levelRow.style.display = 'none';
  }

  showPostGameHighlight();

  // Game summary table
  const botSummary = allPlayers.map(p => ({
    name:         p.isBot ? p.name : (gameState.playerName || 'YOU'),
    avatar:       p.isBot ? p.avatar : getActiveAvatar().icon,
    isYou:        !p.isBot,
    place:        p.isBot ? (p.eliminated ? (allPlayers.filter(q => q.isBot && !q.eliminated).length + 2) : 2) : playerPlace,
    tapCount:     p.tapCount || 0,
    avgReactionMs: (p.tapCount || 0) > 0 ? Math.round(p.totalReactionMs / p.tapCount) : 0,
  })).sort((a, b) => b.tapCount - a.tapCount);
  // Winner always first
  if (!playerEliminated || playerWon) {
    const youIdx = botSummary.findIndex(p => p.isYou);
    if (youIdx > 0) { const [you] = botSummary.splice(youIdx, 1); botSummary.unshift(you); }
  }
  botSummary.forEach((p, i) => { p.place = i + 1; });
  showGameSummary(botSummary, null);

  // Apply victory screen skin (bot game — use playerWon flag)
  if (playerWon) {
    applyVictoryScreenSkin();
  } else {
    applyVictoryScreenSkinById('vic_classic');
  }
  showScreen('resultScreen');
  updateMenuStats();
  updateInventoryUI();
}

function playAgain() {
  if (gameState.mode === 'koth') {
    openKothScreen();
  } else {
    tryFindMatch();
  }
}

function leaveSpectate() {
  // Count spectate session for The Watcher achievement
  initAchStats();
  gameState.achStats.spectateSessions = (gameState.achStats.spectateSessions || 0) + 1;
  checkAchievements();
  saveState();
  _fullGameCleanup();
  if (gameState.mode === 'koth') {
    openKothScreen();
  } else {
    tryFindMatch();
  }
}

function leaveToMenu() {
  _fullGameCleanup();
  updateMenuStats();
  showScreen('menuScreen');
}

function ordinal(n) {
  if (n === 1) return 'st';
  if (n === 2) return 'nd';
  if (n === 3) return 'rd';
  return 'th';
}

// Init
if (gameState.activeSkins) activeSkins = gameState.activeSkins;
if (!gameState.ownedAvatars) gameState.ownedAvatars = [];
if (!gameState.activeAvatar) gameState.activeAvatar = 'av_flame';
loadSettings();
applySettings();
const dailyClaimed = claimDailyItems();
updateMenuStats();
updateInventoryUI();

// If onboarding already done, skip to menu
if (gameState.onboardingDone) {
  document.getElementById('onboardingScreen').classList.remove('active');
  document.getElementById('menuScreen').classList.add('active');
  // Start menu music on first user interaction (autoplay policy requires gesture)
  const _startMenuMusicOnce = () => {
    try { startMusic('lobby'); } catch(e) {}
    document.removeEventListener('touchstart', _startMenuMusicOnce);
    document.removeEventListener('click', _startMenuMusicOnce);
  };
  document.addEventListener('touchstart', _startMenuMusicOnce, { once: true, passive: true });
  document.addEventListener('click', _startMenuMusicOnce, { once: true });
}

// AudioContext unlock on first touch (Android WebView requirement)
document.addEventListener('touchstart', function _audioUnlock() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  document.removeEventListener('touchstart', _audioUnlock);
}, { once: true, passive: true });


// Init theme engine
initThemeEngine();

// PWA manifest injection
(function() {
  const m = {name:'Tile Royale',short_name:'Tile Royale',
    description:'Last tap standing — 30-player battle royale',
    start_url:'/',display:'standalone',
    background_color:'#0a0a0f',theme_color:'#ff4500',orientation:'portrait',
    icons:[{src:"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='80' fill='%230a0a0f'/%3E%3Ctext y='360' x='256' text-anchor='middle' font-size='300' fill='%23ff4500'%3E%E2%9A%A1%3C/text%3E%3C/svg%3E",sizes:'512x512',type:'image/svg+xml'}]};
  try {
    const el = document.createElement('link');
    el.rel = 'manifest';
    el.href = URL.createObjectURL(new Blob([JSON.stringify(m)],{type:'application/json'}));
    document.head.appendChild(el);
  } catch(e) {}
})();

// Check KOTH weekly reset
checkKothWeeklyReset();
// Feature gate update + menu widget
updateFeatureLocks();
renderMenuGauntletWidget();
updateVipStatDisplay();
// Init ring state
if (!gameState.ringInventory) gameState.ringInventory = [];
if (!gameState.gauntlet) gameState.gauntlet = {};
if (!gameState.activeTrades) gameState.activeTrades = {};
// Update custom lobby card state
updateMenuCustomLobbyCard();
// Render daily challenge
renderMenuDailyChallenge();
// Check if client is up to date
setTimeout(checkClientVersion, 1000);
// Check offline reward
setTimeout(checkOfflineReward, 1500);
// Measure server pings for region selection (arrow fn defers lookup until colyseus.js is loaded)
setTimeout(() => measureAllPings(), 2000);
// Ticket system init
checkTicketRefill();
updateTicketUI();
// Update ticket timer every second
setInterval(() => {
  checkTicketRefill();
  updateTicketUI();
  if (getTickets() <= 0) updateNoTicketsTimer();
}, 1000);
// Update lastOnline periodically
setInterval(() => { gameState.lastOnline = Date.now(); saveState(); }, 60000);

if (dailyClaimed) {
  setTimeout(() => showToast('🎁 Daily items claimed! +1 of each item', 'var(--green)'), 800);
}


// Clean disconnect when page closes
window.addEventListener('beforeunload', () => {
  if (currentRoom) {
    try { currentRoom.leave(); } catch(e) {}
    currentRoom = null;
  }
});

// Loading screen: stays until player taps.
// "TAP TO START" hint appears once init is complete + native splash has cleared (~2.2s).
(function() {
  const ls   = document.getElementById('appLoadScreen');
  const hint = document.getElementById('lsTapHint');
  if (!ls) return;
  const elapsed = Date.now() - (window._appLoadStart || Date.now());
  const delay   = Math.max(0, 2200 - elapsed);
  setTimeout(function() {
    // Reveal tap hint with pulse animation
    if (hint) {
      hint.style.color     = 'rgba(255,210,80,0.95)';
      hint.style.animation = 'ls-pulse 1.6s ease-in-out infinite';
    }
    // Dismiss on first touch or click
    function dismiss() {
      ls.style.transition = 'opacity 0.55s ease';
      ls.style.opacity    = '0';
      setTimeout(function() { if (ls.parentNode) ls.parentNode.removeChild(ls); }, 580);
    }
    ls.addEventListener('touchstart', dismiss, { once: true, passive: true });
    ls.addEventListener('click',      dismiss, { once: true });
  }, delay);
})();
