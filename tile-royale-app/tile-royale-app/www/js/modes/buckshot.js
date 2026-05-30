// ===== BUCKSHOT MODE — wave-completion survival =====
// Fundamentally different from Rush: ALL tiles must be cleared, slowest finisher is eliminated.

function igniteBuckshot() {
  if (roundActive) return;
  // startBuckshotWave always resets all tiles to idle first, so we don't need
  // to count idle tiles — just pick n from the full grid size.
  const maxN = Math.min(10, gameState.gridSize);
  const n = Math.floor(Math.random() * maxN) + 1; // 1–10 tiles
  console.log('[BUCKSHOT IGNITE]', { n, mode: gameState.mode, players: allPlayers.length });
  startBuckshotWave(n);
}

function startBuckshotWave(n) {
  roundActive = true;
  burnScheduled = false;

  // Reset wave tracking
  buckshotWaveStart       = Date.now();
  buckshotActiveTileCount = n;
  buckshotPlayerCleared   = 0;
  buckshotCompletions     = [];
  buckshotBotCleared      = {};
  tapOrder                = [];

  // Reset all tiles
  tileStates = tileStates.map(s => s !== 'idle' ? 'idle' : s);
  for (let i = 0; i < gameState.gridSize; i++) {
    const el = document.getElementById('tile-' + i);
    if (el) { el.className = 'tile'; el.innerHTML = ''; }
  }

  // Pick n random tiles
  const allIndices = Array.from({length: gameState.gridSize}, (_, i) => i)
    .sort(() => Math.random() - 0.5)
    .slice(0, n);
  burningTiles = [...allIndices];
  allIndices.forEach(idx => {
    tileStates[idx] = 'burning';
    const el = document.getElementById('tile-' + idx);
    if (el) {
      el.className = 'tile burning buckshot-pop';
      setTimeout(() => el.classList.remove('buckshot-pop'), 500);
    }
  });
  currentBurningTile = burningTiles[0];
  playerTilesLeft    = n;
  practiceTileIgniteTime = buckshotWaveStart;
  playSound('ignite');

  showBuckshotWaveStart(n);

  const activeBots = allPlayers.filter(p => p.isBot && !p.eliminated);
  buckshotAlivePlayers = activeBots.length + (playerEliminated ? 0 : 1);
  roundPlayerCount     = buckshotAlivePlayers;
  updatePendingCounter(buckshotAlivePlayers);

  scheduleBuckshotBots(allIndices, activeBots);

  const _deadlineSpeed = activeCustomBotSpeedMs !== null ? activeCustomBotSpeedMs : BOT_CLICK_SPEED_MS.max;
  const maxWaitMs = n * _deadlineSpeed + 1000;
  burnTimeout = setTimeout(() => {
    if (!roundActive) return;
    buckshotDeadlineExpired();
  }, maxWaitMs);

  const activeTileCount = n;
  const activeTiles = [...allIndices];
  console.log("[BUCKSHOT WAVE]", { activeTileCount, activeTiles, simultaneous: true, alivePlayers: buckshotAlivePlayers });
}

function scheduleBuckshotBots(tileIndices, activeBots) {
  (botTapTimeouts||[]).forEach(t => clearTimeout(t));
  botTapTimeouts = [];
  const n = tileIndices.length;

  activeBots.forEach(bot => {
    const botIdx = allPlayers.indexOf(bot);
    buckshotBotCleared[botIdx] = 0;

    const _bsSpeed = activeCustomBotSpeedMs !== null
      ? { min: activeCustomBotSpeedMs, max: activeCustomBotSpeedMs }
      : BOT_CLICK_SPEED_MS;
    let cumulativeDelay = 0;
    tileIndices.forEach((_, tapI) => {
      const tapDelay = _bsSpeed.min + Math.random() * (_bsSpeed.max - _bsSpeed.min);
      const jitter   = Math.random() * 80 - 40;
      cumulativeDelay += tapDelay;
      const delay = cumulativeDelay + jitter;

      const t = setTimeout(() => {
        if (!roundActive || bot.eliminated) return;
        buckshotBotCleared[botIdx] = (buckshotBotCleared[botIdx] || 0) + 1;
        if (buckshotBotCleared[botIdx] >= n) {
          const ms = Date.now() - buckshotWaveStart;
          buckshotRecordFinish(botIdx, bot.name, bot.avatar, ms);
        }
      }, delay);
      botTapTimeouts.push(t);
    });
  });
}

function buckshotRecordFinish(id, name, avatar, completionMs) {
  if (buckshotCompletions.find(c => c.id === id)) return; // already recorded
  buckshotCompletions.push({ id, name, avatar, completionMs });
  const stillPending = buckshotAlivePlayers - buckshotCompletions.length;
  updatePendingCounter(Math.max(0, stillPending));
  console.log("[BUCKSHOT]", { player: id === -1 ? 'YOU' : name, completionTime: completionMs, clearedCount: buckshotActiveTileCount, activated: true });
  if (buckshotCompletions.length >= buckshotAlivePlayers) {
    clearTimeout(burnTimeout);
    (botTapTimeouts||[]).forEach(t => clearTimeout(t));
    botTapTimeouts = [];
    setTimeout(buckshotFinalize, 250);
  }
}

function buckshotOnPlayerClear() {
  const completionMs = Date.now() - buckshotWaveStart;
  showBuckshotCleared();
  buckshotRecordFinish(-1, 'YOU', gameState.avatar || '🔥', completionMs);
}

function buckshotDeadlineExpired() {
  if (!roundActive) return;
  const worstMs = Date.now() - buckshotWaveStart + 9999;
  const activeBots = allPlayers.filter(p => p.isBot && !p.eliminated);
  activeBots.forEach(bot => {
    const botIdx = allPlayers.indexOf(bot);
    if (!buckshotCompletions.find(c => c.id === botIdx)) {
      buckshotRecordFinish(botIdx, bot.name, bot.avatar, worstMs);
    }
  });
  if (!playerEliminated && !buckshotCompletions.find(c => c.id === -1)) {
    // Player missed — give them the absolute worst time
    buckshotRecordFinish(-1, 'YOU', '🔥', worstMs + 1);
  }
  setTimeout(buckshotFinalize, 100);
}

function buckshotFinalize() {
  if (!roundActive) return;
  roundActive = false;
  clearTimeout(burnTimeout);
  (botTapTimeouts||[]).forEach(t => clearTimeout(t));
  botTapTimeouts = [];
  burnScheduled = false;
  burningTiles = [];
  currentBurningTile = null;
  updatePendingCounter(0);

  if (buckshotCompletions.length === 0) { scheduleBurn(); return; }

  // Slowest finisher (highest completionMs) is eliminated
  buckshotCompletions.sort((a, b) => b.completionMs - a.completionMs);
  const loser = buckshotCompletions[0];

  console.log("[BUCKSHOT]", {
    activeTiles: buckshotActiveTileCount,
    eliminated: loser.id === -1 ? 'YOU' : loser.name,
    completionTime: loser.completionMs,
    eliminated_flag: true,
    rankings: buckshotCompletions.map(c => ({ name: c.id === -1 ? 'YOU' : c.name, ms: c.completionMs }))
  });

  if (loser.id === -1 && !playerEliminated) {
    eliminatePlayer('slow');
  } else {
    const loserBot = allPlayers[loser.id];
    if (!loserBot || loserBot.eliminated) {
      setTimeout(() => { if (window._activeSession) scheduleBurn(); }, 300);
      return;
    }
    loserBot.eliminated = true;
    playersLeft = Math.max(1, playersLeft - 1);
    updateGameHeader();
    const ms = loser.completionMs;
    updateBotFeed(`💥 ${loserBot.avatar} ${loserBot.name} slowest — ${ms}ms — OUT!`);
    updateWatchBar();
    updateMusicIntensity();
    updateDangerMode();
    maybeTriggerSurprise();
    checkEliminationTrigger();
    const postElimDelay = playersLeft <= 5 ? 300 : 500;
    setTimeout(() => {
      if (playersLeft <= 1 && !playerEliminated) { endGame(true); return; }
      if (playersLeft <= 1) { endGame(false); return; }
      scheduleBurn();
    }, postElimDelay);
  }
}

function showBuckshotWaveStart(n) {
  const badge = document.getElementById('gameModeBadge');
  if (badge) {
    const prev = badge.textContent;
    badge.textContent = `💥 ${n} TILE${n > 1 ? 'S' : ''}!`;
    badge.style.cssText += ';background:var(--fire2);color:#000;transition:none;';
    setTimeout(() => {
      badge.textContent = prev;
      badge.style.background = '';
      badge.style.color = '';
    }, 700);
  }
}

function showBuckshotCleared() {
  showToast('💥 CLEARED! ✓', 'var(--green)');
  vibrate([25, 15, 25]);
}

// ---- Core: start a new round with N burning tiles ----
// ---- Wild mode: like rush but items active ----
function igniteWild() {
  if (roundActive) return;

  // Crystal Ball: show 3 candidates every round if selected
  if (selectedItems.has('crystal')) {
    if (playersLeft <= 5) {
      // Crystal disabled in final 5 — skip hint, go straight to round
      startRound(1);
      return;
    }
    showCrystalBall((realIdx) => startRoundAtIndex(realIdx));
    return;
  }
  startRound(1);
}

function showCrystalBall(cb) {
  // Reset all tiles first so we can pick from clean state
  tileStates = tileStates.map(s => s !== 'idle' ? 'idle' : s);
  for (let i = 0; i < gameState.gridSize; i++) {
    const el = document.getElementById('tile-' + i);
    if (el) { el.className = 'tile'; el.innerHTML = ''; }
  }

  // Pick the real tile index
  const allIdx = Array.from({length: gameState.gridSize}, (_, i) => i).sort(() => Math.random() - 0.5);
  const realIdx = allIdx[0];

  // Pick 2 decoys (different from real)
  const decoys = [allIdx[1], allIdx[2]];
  crystalCandidates = [realIdx, ...decoys].sort(() => Math.random() - 0.5);

  // Highlight all 3 candidates
  (crystalCandidates||[]).forEach(i => {
    const el = document.getElementById('tile-' + i);
    if (el) el.classList.add('crystal-candidate');
  });

  updateBotFeed('🔮 Crystal Ball active! One of the 3 glowing tiles will ignite...');

  // After 2s: decoys disappear, real tile ignites simultaneously
  setTimeout(() => {
    (crystalCandidates||[]).forEach(i => {
      const el = document.getElementById('tile-' + i);
      if (!el) return;
      if (i === realIdx) {
        // Real tile: remove hint style, ignite as burning immediately
        el.classList.remove('crystal-candidate');
        el.className = 'tile burning';
      } else {
        // Decoys: fade back to idle
        el.classList.remove('crystal-candidate');
      }
    });
    crystalCandidates = [];
    cb(realIdx); // startRoundAtIndex handles state + bots
  }, 2000);
}

function showCrystalBallMultiplayer(realIdx) {
  const others = Array.from({length: gameState.gridSize || 25}, (_, i) => i)
    .filter(i => i !== realIdx)
    .sort(() => Math.random() - 0.5);
  const candidates = [realIdx, others[0], others[1]].sort(() => Math.random() - 0.5);

  candidates.forEach(i => {
    const el = document.getElementById('tile-' + i);
    if (el) el.classList.add('crystal-candidate');
  });

  updateBotFeed('🔮 Crystal Ball! One of the 3 tiles will ignite...');

  setTimeout(() => {
    candidates.forEach(i => {
      const el = document.getElementById('tile-' + i);
      if (!el) return;
      el.classList.remove('crystal-candidate');
      if (i === realIdx) el.className = 'tile burning';
    });
    tileStates[realIdx] = 'burning';
    practiceTileIgniteTime = Date.now();
    playSound('ignite');
    vibrate(15);
  }, 2000);
}

// startRound with a specific tile index (used by crystal ball)
function startRoundAtIndex(forcedIdx) {
  roundActive = true;
  tapOrder = [];
  roundPlayerCount = 0;
  playerTilesLeft = 0;

  // Reset all tiles
  tileStates = tileStates.map(s => s !== 'idle' ? 'idle' : s);
  for (let i = 0; i < gameState.gridSize; i++) {
    const el = document.getElementById('tile-' + i);
    if (el) { el.className = 'tile'; el.innerHTML = ''; }
  }

  // Ignite exactly the forced tile
  burningTiles = [forcedIdx];
  tileStates[forcedIdx] = 'burning';
  const el = document.getElementById('tile-' + forcedIdx);
  if (el) el.className = 'tile burning';
  currentBurningTile = forcedIdx;
  playerTilesLeft = 1;

  // Shadow tile + pepper spray applied simultaneously with real tile
  let shadowFakeIdx = null;
  if (shadowTileActive && gameState.mode === 'wild') {
    shadowFakeIdx = applyShadowTileToRound(forcedIdx);
  }
  startRoundAtIndex._fakeIdx = shadowFakeIdx;
  if (pepperSprayActive && gameState.mode === 'wild') {
    applyPepperSprayEffect();
  }

  scheduleBotTaps();
  updatePendingCounter(roundPlayerCount);
}

// Caltrops: usable as long as more than 3 players remain AND have items in inventory
// Shadow Tile: next round shows 2 tiles for others — 1 real, 1 trap
