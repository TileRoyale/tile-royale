// ===== MULTIPLAYER CLIENT =====
const SERVERS = {
  EU:   { ws: 'wss://tile-royale-eu-production.up.railway.app',   http: 'https://tile-royale-eu-production.up.railway.app' },
  NA:   { ws: 'wss://tile-royale-na.railway.app',   http: 'https://tile-royale-na.railway.app' },
  ASIA: { ws: 'wss://tile-royale-asia.railway.app', http: 'https://tile-royale-asia.railway.app' },
};
// For local dev:
const LOCAL_SERVER = { ws: 'ws://localhost:3000', http: 'http://localhost:3000' };
const IS_LOCAL = window.location.hostname === 'localhost';

let measuredPings   = {}; // { EU: 45, NA: 120, ASIA: 280 }
let bestRegion      = 'EU';
let myPingMs        = 0;

// Measure ping to all regions via HTTP
async function measureAllPings() {
  if (IS_LOCAL) { bestRegion = 'LOCAL'; return; }
  const results = {};
  await Promise.all(Object.entries(SERVERS).map(async ([region, srv]) => {
    try {
      const t0  = Date.now();
      const res = await fetch(`${srv.http}/ping`, { signal: AbortSignal.timeout(3000) });
      results[region] = Date.now() - t0;
    } catch {
      results[region] = 9999;
    }
  }));
  measuredPings = results;
  // Pick lowest ping region that actually responded (< 9999)
  const valid = Object.entries(results).filter(([,ms]) => ms < 9000);
  bestRegion = valid.length > 0
    ? valid.sort((a, b) => a[1] - b[1])[0][0]
    : 'EU'; // always fallback to EU
  updateRegionUI();
}

function getActiveServer() {
  if (IS_LOCAL) return LOCAL_SERVER;
  const region = selectedRegion === 'AUTO' ? bestRegion : selectedRegion;
  return SERVERS[region] || SERVERS.EU;
}

function updateRegionUI() {
  // Update settings region display
  const el = document.getElementById('settingsRegionVal');
  if (el) {
    const region = selectedRegion === 'AUTO' ? `AUTO (${bestRegion})` : selectedRegion;
    const ping   = measuredPings[bestRegion] || '—';
    el.textContent = `${region} · ${ping}ms`;
  }
  // Update lobby ping badge
  const pingEl = document.getElementById('lobbyPingBadge');
  if (pingEl && myPingMs > 0) {
    pingEl.textContent = `${myPingMs}ms`;
    pingEl.style.color = myPingMs < 80 ? 'var(--green)' : myPingMs < 150 ? 'var(--gold)' : 'var(--red)';
  }
}

function getColyseusClient() {
  const srv = getActiveServer();
  if (!colyseusClient || colyseusClient._endpoint !== srv.ws) {
    if (typeof Colyseus === 'undefined') return null;
    colyseusClient = new Colyseus.Client(srv.ws);
    colyseusClient._endpoint = srv.ws;
  }
  return colyseusClient;
}

// Try to find a real multiplayer game; fall back to bot game
async function tryMultiplayer(mode) {
  // Wait for Colyseus library to load (max 5s)
  let attempts = 0;
  while (typeof Colyseus === 'undefined' && attempts < 10) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }

  const client = getColyseusClient();
  if (!client) { console.warn('Colyseus not loaded — bot mode'); return false; }

  try {
    console.log('[MP] Connecting to', getActiveServer().ws);
    const room = await client.joinOrCreate('tile_royale', {
      mode,
      playerId: PLAYER_ID,
      name:    gameState.playerName || 'Player',
      avatar:  getActiveAvatar().icon,
      isWhale: isPlayerWhale(),
      victorySkin: activeSkins.victory || 'vic_classic',
      // Only join rooms in waiting phase
      phase:   'waiting',
    });
    currentRoom   = room;
    isMultiplayer = true;
    isMultiplayer = true;
    console.log('[MP] Joined room:', room.id);
    setupRoomListeners(room);
    return true;
  } catch (e) {
    console.warn('No multiplayer room available — bot mode:', e.message, JSON.stringify(e), e.code, e.status);
    isMultiplayer = false;
    return false;
  }
}

function setupRoomListeners(room) {
  mpListenersActive = true;
  // Handle server ping → respond with pong
  room.onMessage("ping", (data) => {
    room.send("pong", { id: data.id });
  });

  // Our measured RTT from server
  room.onMessage("your_ping", (data) => {
    myPingMs = data.ping;
    updateRegionUI();
    const pingEl = document.getElementById('lobbyPingBadge');
    if (pingEl) {
      pingEl.style.display = 'block';
      pingEl.textContent   = `${data.ping}ms`;
      pingEl.style.color   = data.ping < 80 ? 'var(--green)'
                           : data.ping < 150 ? 'var(--gold)' : 'var(--red)';
    }
  });

  // ── State sync ──────────────────────────────────────────────────────────
  room.state.listen("phase", (phase) => {
    if (!mpListenersActive) return;
    if (phase === 'countdown') {
      if (lobbySearchTimeout) {
        clearTimeout(lobbySearchTimeout);
        lobbySearchTimeout = null;
      }
      if (lobbyInterval) { clearInterval(lobbyInterval); lobbyInterval = null; }
      // Reset progress bar
      const bar = document.getElementById('lobbySearchBar');
      if (bar) { bar.style.transition = 'none'; bar.style.width = '100%'; }
      showScreen('lobbyScreen');
      document.getElementById('lobbyStatusWrap').style.display = 'none';
      document.getElementById('lobbyCountdownWrap').style.display = 'block';
    }
    if (phase === 'playing') {
      startGameFromServer();
    }
    if (phase === 'gameOver') {
      // game_over message is the authoritative multiplayer handler — nothing to do here
    }
  });

  room.state.listen("countdownValue", (val) => {
    const el = document.getElementById('lobbyTimer');
    if (el) el.textContent = val;
  });

  room.state.listen("roundNumber", () => {
    if (!mpListenersActive) return;
    if (gameState.mode === 'buckshot') return;
    const tileIdx = room.state.burningTile;
    if (!document.getElementById('gameScreen')?.classList.contains('active')) return;
    if (!document.getElementById('tile-0')) return;
    // Clear previous round tiles (crystal-candidate hints stay — they show next round's tile)
    document.querySelectorAll('.tile.burning, .tile.tapped').forEach(t => {
      t.className = 'tile'; t.innerHTML = '';
    });
    if (tileIdx < 0) return;
    tileStates.fill('idle');
    tileStates[tileIdx] = 'burning';
    const el = document.getElementById('tile-' + tileIdx);
    if (el) {
      el.className = 'tile burning';
      practiceTileIgniteTime = Date.now();
      playSound('ignite');
      vibrate(15);
    }
    // Apply shadow tile if active (from item_hit or player's own item)
    if (shadowTileActive && gameState.mode === 'wild') {
      applyShadowTileToRound(tileIdx);
    }
  });

  room.state.listen("burningTile", (tileIdx) => {
    if (!mpListenersActive) return;
    if (gameState.mode === 'buckshot') return;
    if (gameState.mode === 'wild') return; // wild mode handled entirely by roundNumber listener
    if (tileIdx < 0) return;
    const applyBurn = () => {
      if (!document.getElementById('gameScreen')?.classList.contains('active')) return;
      clearAllTiles();
      if (room.state.isGoldenTile) {
        igniteAsGolden(tileIdx);
        tileStates[tileIdx] = 'golden';
      } else {
        tileStates[tileIdx] = 'burning';
        const el = document.getElementById('tile-' + tileIdx);
        if (el) {
          el.className = 'tile burning';
        } else {
          setTimeout(applyBurn, 200);
          return;
        }
        practiceTileIgniteTime = Date.now();
        playSound('ignite');
      }
    };
    applyBurn();
  });

  room.state.listen("playersLeft", (n) => {
    if (!mpListenersActive) return;
    // previousPlayersLeft updated by updateDangerMode() — set playersLeft first
    playersLeft = n;
    updateMusicIntensity();
    updateDangerMode();
    document.getElementById('playersLeftCount').textContent = n;
  });

  room.state.listen("lastEliminated", (sessionId) => {
    if (!sessionId) return;
    const player = room.state.players.get(sessionId);
    if (!player) return;
    updateBotFeed(`💀 ${player.avatar} ${player.name} was last — OUT!`);
    playSound('elim');
    vibrate([50,50,100]);
  });

  // Lobby: populate player slots from real players
  room.state.players.onAdd((player, sessionId) => {
    updateLobbySlot(sessionId, player);
    updateBotFeed(`${player.avatar} ${player.name} joined`);
    playSound('lobby');
  });

  room.state.players.onRemove((player, sessionId) => {
    updateBotFeed(`${player.avatar} ${player.name} left`);
  });

  // ── Direct messages ─────────────────────────────────────────────────────
  room.onMessage("tap_ok", (data) => {
    // Server confirmed our tap
    recentReactions.push(data.reactionMs);
    if (recentReactions.length > 20) recentReactions.shift();
  });

  room.onMessage("wrong_tile", () => {
    playSound('wrong'); vibrate(80);
    flashWrongTap();
    showLockOverlay(500);
  });

  room.onMessage("golden_tap", () => {
    handleGoldenTap();
  });

  room.onMessage("tap_rejected", (data) => {
    // Locked — show lock overlay
    if (data.reason === 'locked') showLockOverlay(1000, 'var(--red)');
  });

  room.onMessage("player_tapped", (data) => {
    if (data.sessionId === room.sessionId) return; // own tap already handled
    updateBotFeed(`${data.avatar} ${data.name} tapped!`);
    // Whale tap — show effect for everyone
    if (data.isWhale && data.tileIndex !== undefined) {
      triggerWhaleTap(data.tileIndex);
    }
  });

  room.onMessage("player_eliminated", (data) => {
    // Round ended — clear muscle relaxant so it doesn't carry into next round
    muscleRelaxantActive = false;
    muscleRelaxantFirstTapped.clear();
    if (data.sessionId === room.sessionId) {
      // WE were eliminated
      playerEliminated = true;
      playerPlace = data.place;
      stopMusic();
      playSound('elim');
      vibrate([100,50,100]);
      document.getElementById('watchBar').classList.add('show');
      updateWatchBar();
      updateSpectatorTiles();
      showToast(`💀 You finished ${data.place}th place`, 'var(--red)');
    } else {
      updateBotFeed(`💀 ${data.avatar || '🎮'} ${data.name} OUT — ${data.playersLeft} left`);
    }
  });

  room.onMessage("immunity_used", (data) => {
    updateBotFeed(`🛡️ ${data.name} was immune — shield absorbed!`);
  });

  room.onMessage("buckshot_wave", (data) => {
    if (playerEliminated) return;
    // Reset all tiles
    tileStates = tileStates.map(() => 'idle');
    for (let i = 0; i < gameState.gridSize; i++) {
      const el = document.getElementById('tile-' + i);
      if (el) { el.className = 'tile'; el.innerHTML = ''; }
    }
    gridLocked = false;
    document.getElementById('tileGrid').classList.remove('locked');
    // Light up buckshot tiles
    burningTiles = [...data.tiles];
    data.tiles.forEach(idx => {
      tileStates[idx] = 'burning';
      const el = document.getElementById('tile-' + idx);
      if (el) {
        el.className = 'tile burning buckshot-pop';
        setTimeout(() => el.classList.remove('buckshot-pop'), 500);
      }
    });
    roundActive            = true;
    buckshotWaveStart      = data.waveStart;
    buckshotActiveTileCount = data.tiles.length;
    buckshotPlayerCleared  = 0;
    practiceTileIgniteTime  = data.waveStart;
    playSound('ignite');
    showBuckshotWaveStart(data.tiles.length);
    updatePendingCounter(buckshotAlivePlayers || playersLeft);
  });

  room.onMessage("buckshot_cleared", () => {
    showBuckshotCleared();
  });

  room.onMessage("item_hit", (data) => {
    if (!mpListenersActive || playerEliminated) return;
    const { attackerAvatar, attackerName, itemId } = data;
    showItemHitPopup(attackerAvatar, attackerName, itemId);
    if (itemId === 'caltrops') {
      playSound('wrong'); vibrate(60);
      document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = '#ff8800'; t.style.opacity = '0.5'; });
      showLockOverlay(700);
      setTimeout(() => { document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = ''; t.style.opacity = ''; }); }, 700);
    } else if (itemId === 'pepper_spray') {
      applyPepperSprayEffect();
    } else if (itemId === 'shadow_tile') {
      shadowTileActive = true;
    } else if (itemId === 'muscle_relaxant') {
      if (!muscleRelaxantActive) {
        muscleRelaxantActive = true;
        muscleRelaxantPrimed = false;
        muscleRelaxantFirstTapped.clear();
        muscleRelaxantTargets = new Set();
      }
    }
  });

  room.onMessage("crystal_hint", (data) => {
    if (!mpListenersActive) return;
    // Clear previous hints (always, so stale hints don't linger)
    document.querySelectorAll('.tile.crystal-candidate').forEach(el => el.classList.remove('crystal-candidate'));
    if (!selectedItems.has('crystal') || gameState.mode !== 'wild' || playersLeft <= 5) return;
    (data.candidates || []).forEach(idx => {
      const el = document.getElementById('tile-' + idx);
      if (el) el.classList.add('crystal-candidate');
    });
  });

  room.onMessage("cheat_detected", () => {
    showToast('⚠️ Unusual input detected', 'var(--red)');
  });

  room.onMessage("game_over", (data) => {
    // Clean up and show result screen
    isMultiplayer = false;
    if (!playerEliminated) {
      playerWon  = data.won;
      playerPlace = data.place;
    }
    endGameFromServer(data);
  });

  room.onError((code, message) => {
    console.error('Room error:', code, message);
    showToast('Connection error — switching to bot mode', 'var(--red)');
    isMultiplayer = false;
    currentRoom = null;
  });

  room.onLeave(() => {
    const gameWasActive = document.getElementById('gameScreen')?.classList.contains('active');
    isMultiplayer = false;
    currentRoom = null;
    if (gameWasActive && !document.getElementById('resultScreen')?.classList.contains('active')) {
      setTimeout(() => endGame(!playerEliminated), 300);
    }
  });
}

// Populate lobby slots with real player data
function updateLobbySlot(sessionId, player) {
  const slots = document.querySelectorAll('.player-slot');
  // Find first empty slot or slot for this sessionId
  let target = null;
  (slots||[]).forEach(s => {
    if (!target && (s.dataset.sessionId === sessionId || !s.dataset.sessionId || s.classList.contains('empty'))) {
      target = s;
    }
  });
  if (!target && slots.length > 0) target = slots[slots.length - 1];
  if (!target) return;
  target.dataset.sessionId = sessionId;
  target.className = 'player-slot filled';
  target.innerHTML = `<div class="player-avatar">${player.avatar}</div><div class="player-name">${player.name}</div>`;
}

// Start game when server says phase = 'playing'
function startGameFromServer() {
  // Set session tracking — same as startGame() bot mode
  gameSessionId++;
  const mySession = gameSessionId;
  window._activeSession = mySession;

  // Count whales in this game for Whale Song achievement
  let whaleCount = 0;
  if (currentRoom) {
    (currentRoom?.state?.players||[]).forEach(p => {
      if ((p).isWhale && p.sessionId !== currentRoom.sessionId) whaleCount++;
    });
  }
  if (whaleCount >= 3) {
    initAchStats();
    gameState.achStats.whaleSongGames = (gameState.achStats.whaleSongGames || 0) + 1;
    checkAchievements();
    saveState();
  }
  gameState.games++;
  showScreen('gameScreen');
  applySkins(); // Apply skin classes BEFORE creating tiles
  setupGameGrid();
  updateGameHeader();
  document.getElementById('itemHud').style.display = 'none';
  document.getElementById('kothGameBanner').style.display = 'none';
  document.getElementById('watchBar').classList.remove('show');
  document.getElementById('watchBar').style.display = '';   // clear inline style from _fullGameCleanup
  document.getElementById('elimOverlay').classList.remove('show');
  document.getElementById('elimOverlay').style.display = ''; // clear inline style from _fullGameCleanup
  startMusic('game');
  recentReactions = [];
  suspiciousCount = 0;
  shadowTileActive = false;
  itemShadowTileUsed = false;
  caltropsPrimed = false;
  shadowTilePrimed = false;
  playerEliminated = false;
  playerWon = false;
  playerPlace = 0;
  playersLeft         = currentRoom?.state?.playersLeft || gameState.players;
  playersLeftAtStart  = playersLeft;
  previousPlayersLeft = playersLeft;
  matchStarted        = true;  // multiplayer: game is already live when this is called
  roundActive = true;
  updateKothGameBanner();

  // Apply burning tile after everything is settled
  const applyPendingBurn = () => {
    const pendingTile = currentRoom?.state?.burningTile;

    if (pendingTile >= 0) {
      clearAllTiles();
      tileStates[pendingTile] = 'burning';
      const el = document.getElementById('tile-' + pendingTile);
      if (el) {
        el.className = 'tile burning';
        practiceTileIgniteTime = Date.now();
        playSound('ignite');
      }
    }
  };
  setTimeout(applyPendingBurn, 200);
  setTimeout(applyPendingBurn, 600); // double-apply in case first was too early
  setupWildAutoTriggers();
}

// Client-side constants matching server
const REACTION_FLOOR_MS = 80;

function setupGameGrid() {
  const GRID_SIZE = 25; // 5x5 grid
  const grid = document.getElementById('tileGrid');
  grid.style.gridTemplateColumns = 'repeat(5, 1fr)';
  grid.innerHTML = '';
  tileStates = Array(GRID_SIZE).fill('idle');
  for (let i = 0; i < GRID_SIZE; i++) {
    const t = document.createElement('div');
    t.className = 'tile'; t.id = `tile-${i}`;
    t.onclick = () => tapTile(i);
    grid.appendChild(t);
  }
}

function clearAllTiles() {
  tileStates = tileStates.map(s => s !== 'idle' ? 'idle' : s);
  for (let i = 0; i < GRID_SIZE; i++) {
    const el = document.getElementById('tile-' + i);
    if (el) { el.className = 'tile'; el.innerHTML = ''; }
  }
}

function flashWrongTap() {
  document.querySelectorAll('.tile').forEach(t => {
    t.style.borderColor = 'var(--red)'; t.style.opacity = '0.5';
  });
  setTimeout(() => {
    document.querySelectorAll('.tile').forEach(t => {
      t.style.borderColor = ''; t.style.opacity = '';
    });
  }, 300);
}

function showLockOverlay(durationMs, color = 'var(--red)') {
  gridLocked = true;
  document.getElementById('tileGrid').classList.add('locked');
  const lockEl = document.getElementById('lockOverlay');
  lockEl.querySelector('.lock-count').style.color = color;
  let steps = Math.round(durationMs / 100);
  lockEl.querySelector('.lock-count').textContent = (steps / 10).toFixed(1);
  lockEl.classList.add('show');
  const lockTick = setInterval(() => {
    steps--;
    lockEl.querySelector('.lock-count').textContent = (steps / 10).toFixed(1);
    if (steps <= 0) {
      clearInterval(lockTick);
      gridLocked = false;
      lockEl.classList.remove('show');
      lockEl.querySelector('.lock-count').style.color = 'var(--red)';
      document.getElementById('tileGrid').classList.remove('locked');
    }
  }, 100);
}

function endGameFromServer(data) {
  try {
    stopMusic();
    deactivateDangerMode();
    goldenTileActive = false;
    playerImmune     = false;
    surpriseShown    = false;
    document.getElementById('immunityBadge').style.display = 'none';
    document.getElementById('watchBar').classList.remove('show');

    // Winner display
    const winnerEl     = document.getElementById('winnerDisplay');
    const winnerFrame  = document.getElementById('winnerAvatarFrame');
    const winnerNameEl = document.getElementById('winnerName');
    document.getElementById('resultCrown').style.display = 'none';

    if (data.won) {
      const av = getActiveAvatar();
      winnerEl.style.display       = 'flex';
      winnerFrame.textContent      = av.icon;
      winnerFrame.style.borderColor = av.border;
      winnerFrame.style.background  = av.bg;
      winnerNameEl.textContent     = gameState.playerName || 'Player';
      winnerNameEl.style.color     = av.border;
      playSound('victory');
    } else {
      winnerEl.style.display        = 'flex';
      winnerFrame.textContent       = data.winnerAvatar || '🏆';
      winnerFrame.style.borderColor = '#555570';
      winnerFrame.style.background  = '#0a0a15';
      winnerNameEl.textContent      = data.winnerName || 'Winner';
      winnerNameEl.style.color      = 'var(--muted)';
      if (!playerEliminated) playSound('victory');
    }

    // Result title + place text
    const place = data.place;
    const total = data.totalPlayers || 30;
    const titleText = data.won ? 'VICTORY!' : place <= 3 ? `${place}${ordinal(place).toUpperCase()} PLACE!` : 'ELIMINATED!';
    document.getElementById('resultTitle').textContent  = titleText;
    document.getElementById('resultTitle').className    = 'result-title ' + (data.won ? 'win' : 'lose');
    document.getElementById('resultPlace').textContent  = `${place}${ordinal(place)} of ${total}`;
    document.getElementById('leaderboard').innerHTML    = '';
    const gs = document.getElementById('gameSummary'); if (gs) gs.style.display = 'none';

    // ── Rewards (same formula as bot endGame) ───────────────────────────────
    const today = new Date().toDateString();
    if (!gameState.dailyDiamondsEarned || gameState.dailyDiamondsEarned.date !== today)
      gameState.dailyDiamondsEarned = { date: today, amount: 0 };
    const dailyLeft = Math.max(0, 80 - (gameState.dailyDiamondsEarned.amount || 0));
    let diamonds = 0, xp = 0;
    if (data.won) {
      gameState.wins = (gameState.wins || 0) + 1;
      if (typeof recordModeWin === 'function') recordModeWin(gameState.mode);
      diamonds = Math.min(6, dailyLeft);
      xp = 120; // 1st place
    } else if (place === 2) {
      diamonds = Math.min(4, dailyLeft); xp = 100;
    } else if (place === 3) {
      diamonds = Math.min(2, dailyLeft); xp = 85;
    } else if (place <= 5) {
      diamonds = Math.min(1, dailyLeft); xp = 65;
    } else {
      diamonds = Math.min(1, dailyLeft); xp = 40; // participation minimum
    }
    // Bonus XP: win streak (current streak >= 1 means this would be 2nd+ consecutive win)
    const mpStreakBonus = (data.won && (gameState.achStats?.winStreak || 0) >= 1) ? 15 : 0;
    // Bonus XP: perfect survival (won = survived to the end)
    const mpSurvivalBonus = data.won ? 15 : 0;
    xp += mpStreakBonus + mpSurvivalBonus;
    // Apply XP Boost 2× (from store item)
    const mpXpBoostActive = (gameState.xpBoostGames || 0) > 0;
    if (mpXpBoostActive) { xp *= 2; gameState.xpBoostGames = Math.max(0, (gameState.xpBoostGames || 1) - 1); }

    gameState.dailyDiamondsEarned.amount = (gameState.dailyDiamondsEarned.amount || 0) + diamonds;
    gameState.diamonds = (gameState.diamonds || 0) + diamonds;
    const prevLevel = gameState.level || 1;
    const oldXP     = gameState.xp || 0;
    gameState.xp    = oldXP + xp;
    console.log("[XP]", { oldXP, gainedXP: xp, newXP: gameState.xp, levelBefore: prevLevel, streakBonus: mpStreakBonus, survivalBonus: mpSurvivalBonus, boost: mpXpBoostActive });
    try { awardLevelUp(); } catch(e) {}
    const newLevel = gameState.level || 1;

    // Moby Dick achievement flag before updateAchStats calls checkAchievements
    if (data.won && data.opponentWasWhale && data.totalPlayers <= 2) {
      initAchStats();
      gameState.achStats.mobyDickWins = (gameState.achStats.mobyDickWins || 0) + 1;
      setTimeout(() => showToast('🐋 MOBY DICK! You slayed the whale!', 'var(--diamond)'), 1500);
    }

    try {
      updateAchStats({ won: data.won, place, mode: gameState.mode, diamonds, taps: 0 });
    } catch(e) {
      console.warn('[endGameFromServer] updateAchStats:', e);
      try { saveState(); } catch(_) {}
    }

    // ── Reward UI ────────────────────────────────────────────────────────────
    document.getElementById('rewardDiamonds').textContent  = `+${diamonds}`;
    document.getElementById('rewardXP').textContent        = `+${xp}`;
    document.getElementById('rewardPlace').textContent     = `${place}${ordinal(place)}`;
    document.getElementById('rewardPlace').style.color     = place === 1 ? 'var(--gold)' : place <= 3 ? 'var(--fire2)' : 'var(--muted)';
    document.getElementById('rewardItemRow').style.display = 'none';
    const earned = gameState.dailyDiamondsEarned?.amount || 0;
    const capRow = document.getElementById('rewardCapRow');
    if (earned >= 80) {
      capRow.style.display = 'flex';
      document.getElementById('rewardCapVal').textContent = `${Math.min(earned, 80)}/80 — capped!`;
      document.getElementById('rewardCapVal').style.color = 'var(--red)';
    } else {
      capRow.style.display = 'none';
    }
    const levelRow = document.getElementById('rewardLevelRow');
    if (newLevel > prevLevel) {
      levelRow.style.display = 'flex';
      document.getElementById('rewardLevelVal').textContent = `→ Level ${newLevel} (+1 each item)`;
    } else {
      levelRow.style.display = 'none';
    }

    showPostGameHighlight();
    if (data.won) applyVictoryScreenSkin();
    else          applyVictoryScreenSkinById(data.winnerVictorySkin || 'vic_classic');
    showGameSummary(data.summary || [], data.mySessionId || null);
    updateMenuStats();
  } catch(e) {
    console.error('[endGameFromServer]', e);
  }
  // Always navigate — outside try-catch so a crash above can't block this
  showScreen('resultScreen');
  if (currentRoom) { try { currentRoom.leave(); } catch(_) {} currentRoom = null; }
}

// Multiplayer-aware tap — sends to server if in multiplayer
const _origTapTile = window.tapTile;
function tapTile(idx) {
  if (isMultiplayer && currentRoom) {
    // In multiplayer: send to server, server validates
    // Still do client-side pre-checks for golden/shadow
    if (gridLocked) return;
    if (tileStates[idx] === 'golden') {
      currentRoom.send('tap', { tileIndex: idx });
      return;
    }
    if (tileStates[idx] === 'shadow') {
      // Tapping shadow trap — server doesn't know about this, handle client-side
      showLockOverlay(1000, '#6600aa');
      showToast('🌑 Shadow trap! You were fooled!', '#b464ff');
      return;
    }
    // Send tap to server — check local tile state
    const isBurning = tileStates[idx] === 'burning' ||
                      (currentRoom?.state?.burningTile === idx);
    if (!isBurning) {
      if (!roundActive) return;
      // Buckshot: tapping an already-cleared tile is not a mistake
      if (gameState.mode === 'buckshot' && tileStates[idx] === 'tapped') return;
      playSound('wrong');
      vibrate(80);
      initAchStats();
      gameState.achStats.wrongTaps = (gameState.achStats.wrongTaps || 0) + 1;
      if (!isCustomLobbyGame) resetDcStreak();
      document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = 'var(--red)'; t.style.opacity = '0.5'; });
      showLockOverlay(700);
      setTimeout(() => {
        document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = ''; t.style.opacity = ''; });
      }, 700);
      return;
    }
    // Muscle relaxant: first tap dims tile, second tap counts
    if (muscleRelaxantActive && handleMuscleRelaxantFirstTap(idx)) return;
    currentRoom.send('tap', { tileIndex: idx });
    // Record KOTH reaction time for fastest clicker reward
    if (gameState.mode === 'koth' && practiceTileIgniteTime) {
      const reactionMs = Date.now() - practiceTileIgniteTime;
      if (typeof recordKothReactionTime === 'function') recordKothReactionTime(reactionMs);
    }
    // Optimistic UI
    if (tileStates[idx] === 'burning' || currentRoom?.state?.burningTile === idx) {
      tileStates[idx] = 'tapped';
      burningTiles = burningTiles.filter(i => i !== idx);
      const el = document.getElementById('tile-' + idx);
      if (el) {
        el.className = 'tile tapped'; el.innerHTML = '✓';
        const r = document.createElement('div'); r.className = getTapEffectClass(); el.appendChild(r);
        setTimeout(() => r.remove(), 400);
      }
      playSound('tap'); vibrate(25);
      hideFirstGameHint();
      // Buckshot: check if player cleared all tiles locally
      if (gameState.mode === 'buckshot') {
        buckshotPlayerCleared++;
        if (burningTiles.filter(i => tileStates[i] === 'burning').length === 0) {
          showBuckshotCleared();
        }
      }
    }
  } else {
    // Bot mode — original tap logic
    _botModeTapTile(idx);
  }
}

// ── Updated startLobby to try multiplayer first ──────────────────────────────

