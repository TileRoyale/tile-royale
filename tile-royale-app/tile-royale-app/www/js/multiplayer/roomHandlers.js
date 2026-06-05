// ===== SPECTATOR IMPROVEMENTS =====
function updateSpectatorTiles() {
  if (!playerEliminated) return;
  // Show player names on tiles based on bot activity
  const activeBots = allPlayers.filter(p => p.isBot && !p.eliminated);
  // Assign bots to random tile positions visually
  (activeBots||[]).forEach((bot, i) => {
    const tileIdx = (i * 7 + 3) % gameState.gridSize;
    const el = document.getElementById(`tile-${tileIdx}`);
    if (el && tileStates[tileIdx] === 'idle') {
      // Add a subtle name badge
      if (!el.querySelector('.spectator-name-badge')) {
        const badge = document.createElement('div');
        badge.className = 'spectator-name-badge';
        badge.textContent = bot.avatar;
        badge.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:14px;opacity:0.4;';
        el.style.position = 'relative';
        el.appendChild(badge);
      }
    }
  });
}

// ===== CUSTOM LOBBY SYSTEM =====
let customLobbyMode        = 'rush';
let customLobbyCode        = null;
let customLobbySuddenDeath = false;
let suddenDeathMode        = false;
let customLobbyPlayers     = [];
let customLobbyMaxPlayers  = 10;
let customLobbyGridSize    = 5;
let customLobbyBuckshotTiles = 3;
let customLobbyWildItems   = ['crystal','caltrops','shadow_tile','pepper_spray','muscle_relaxant'];
let customLobbyPollInterval = null;
let customLobbyStartTimeout = null;
let isCustomLobbyGame = false;
let customLobbyBotSpeed = 2000;
let activeCustomBotSpeedMs = null; // set at game start, null = use normal BOT_CLICK_SPEED_MS

function openCustomLobby() {
  if (!hasCustomLobbyAccess()) {
    showToast('🔒 Finish KOTH Top 3 to unlock Custom Lobby!', 'var(--muted)');
    return;
  }
  // Reset state
  customLobbyCode = null;
  customLobbyPlayers = [];
  document.getElementById('clCodeBox').style.display    = 'none';
  document.getElementById('clCreateBtn').style.display  = 'block';
  document.getElementById('clJoinedBox').style.display  = 'none';
  document.getElementById('clJoinMsg').textContent      = '';
  document.getElementById('clJoinInput').value          = '';
  document.getElementById('clPhasePrivate').style.display = 'block';
  document.getElementById('clPhasePublic').style.display  = 'none';
  clearInterval(customLobbyFillInterval);
  switchCustomTab('create', document.getElementById('clTabCreate'));
  showScreen('customLobbyScreen');
}



function selectCustomMode(mode, el) {
  customLobbyMode = mode;
  document.querySelectorAll('#clCreatePanel .settings-select-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('clBuckshotSettings').style.display = mode === 'buckshot' ? 'block' : 'none';
  document.getElementById('clWildSettings').style.display     = mode === 'wild'     ? 'block' : 'none';
}

function updateCustomPlayers(val) {
  customLobbyMaxPlayers = parseInt(val);
  document.getElementById('clPlayersVal').textContent = val;
}

function updateCustomGrid(val) {
  customLobbyGridSize = parseInt(val);
  document.getElementById('clGridVal').textContent  = `${val}×${val}`;
  document.getElementById('clGridDesc').textContent = `${val}×${val} grid`;
}

function updateCustomBuckshot(val) {
  customLobbyBuckshotTiles = parseInt(val);
  document.getElementById('clBuckshotVal').textContent  = val;
  document.getElementById('clBuckshotDesc').textContent = `${val} tile${val > 1 ? 's' : ''} ignite each round`;
}

function updateCustomBotSpeed(val) {
  customLobbyBotSpeed = parseInt(val);
  const ms = parseInt(val);
  const label = ms === 0 ? 'Instant' : ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1).replace('.0','') + 's';
  document.getElementById('clBotSpeedVal').textContent = label;
  document.getElementById('clBotSpeedDesc').textContent = ms === 0 ? 'Bots tap instantly' : `Reaction time: ${ms}ms`;
}

function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createCustomLobby() {
  customLobbyCode       = generateLobbyCode();
  customLobbyIsPublic   = false;
  customLobbySuddenDeath   = document.getElementById('clSuddenDeath').classList.contains('on');
  customLobbyGridSize      = parseInt(document.getElementById('clGridSlider').value);
  customLobbyBuckshotTiles = parseInt(document.getElementById('clBuckshotSlider').value);
  customLobbyWildItems     = ['crystal','caltrops','shadow_tile','pepper_spray','muscle_relaxant'].filter(id => {
    const map = { crystal:'clWildCrystal', caltrops:'clWildCaltrops', shadow_tile:'clWildShadow', pepper_spray:'clWildPepper', muscle_relaxant:'clWildMuscle' };
    return document.getElementById(map[id])?.classList.contains('on');
  });
  clearInterval(customLobbyFillInterval);
  const av = getActiveAvatar();
  customLobbyPlayers = [{
    name:    gameState.playerName || 'YOU',
    avatar:  av.icon,
    isHost:  true,
    isYou:   true,
    border:  av.border,
  }];

  // Show lobby UI
  document.getElementById('clLobbyCode').textContent = customLobbyCode;
  document.getElementById('clCodeBox').style.display  = 'block';
  document.getElementById('clCreateBtn').style.display = 'none';

  // Sudden Death badge
  let sdBadge = document.getElementById('clSuddenDeathBadge');
  if (!sdBadge) {
    sdBadge = document.createElement('div');
    sdBadge.id = 'clSuddenDeathBadge';
    sdBadge.style.cssText = 'text-align:center;font-size:12px;color:var(--red);letter-spacing:2px;margin-bottom:8px;';
    document.getElementById('clCodeBox').insertBefore(sdBadge, document.getElementById('clCodeBox').children[2]);
  }
  sdBadge.textContent = customLobbySuddenDeath ? '⚡ SUDDEN DEATH MODE ACTIVE' : '';

  if (!gameState.customLobbies) gameState.customLobbies = {};
  if (gameState.customLobbies[customLobbyCode]) {
    gameState.customLobbies[customLobbyCode].suddenDeath = customLobbySuddenDeath;
  }
  renderCustomLobbyWaiting();

  spectatorCode = generateSpectatorCode();
  document.getElementById('clSpectatorCode').textContent = spectatorCode;
  gameState.customLobbies[customLobbyCode] = {
    code:          customLobbyCode,
    spectatorCode: spectatorCode,
    mode:          customLobbyMode,
    maxPlayers:    customLobbyMaxPlayers,
    host:          gameState.playerName || 'YOU',
    hostAvatar:    av.icon,
    players:       customLobbyPlayers,
    suddenDeath:   customLobbySuddenDeath,
    gridSize:      customLobbyGridSize,
    buckshotTiles: customLobbyBuckshotTiles,
    wildItems:     customLobbyWildItems,
    created:       Date.now(),
  };
  saveState();

  // Poll for new joiners (simulate)
  startCustomLobbyPoll();
  showToast(`🏟️ Lobby created! Code: ${customLobbyCode}`, 'var(--diamond)');
}


function startCustomLobbyPoll() {
  // Private phase: no auto-fill — friends join via code only
  clearInterval(customLobbyPollInterval);
}

function openLobbyToPublic() {
  customLobbyIsPublic = true;
  document.getElementById('clPhasePrivate').style.display = 'none';
  document.getElementById('clPhasePublic').style.display  = 'block';
  document.getElementById('clLobbyStatus').textContent    = 'PUBLIC';
  document.getElementById('clLobbyStatus').style.color    = 'var(--diamond)';
  if (customLobbyCode && gameState.customLobbies?.[customLobbyCode]) {
    gameState.customLobbies[customLobbyCode].isPublic = true;
    saveState();
  }
  showToast('🌐 Lobby open — filling from Rush queue!', 'var(--diamond)');
  startPublicFill();
}

function startPublicFill() {
  clearInterval(customLobbyFillInterval);
  const publicNames   = ['TapKing','SwiftTile','BlazeMaster','GridRipper','NightTapper',
                         'FlameRunner','QuickDraw','TileSlayer','IronFist','CyberTap',
                         'VoidTapper','UltraFast','HyperTile','AlphaTap','CrimsonTap',
                         'DarkFlame','SpeedAce','NeonTap','ChaosKing','FireBolt'];
  const publicAvatars = ['🦊','⚡','🔥','🐉','👻','🦁','🎯','🦂','⚔️','🤖',
                         '🌑','🦅','🧨','🏴‍☠️','🩸','🐍','💀','🔮','👑','💥'];

  // Show 15s countdown in lobby status
  const statusEl = document.getElementById('clLobbyStatus');
  const fillPct  = document.getElementById('clFillPct');
  let secondsLeft = 15;
  if (statusEl) { statusEl.textContent = `SEARCHING ${secondsLeft}s`; statusEl.style.color = 'var(--diamond)'; }

  const countTimer = setInterval(() => {
    secondsLeft--;
    if (statusEl) statusEl.textContent = secondsLeft > 0 ? `SEARCHING ${secondsLeft}s` : 'FILLING...';
    if (secondsLeft <= 0) {
      clearInterval(countTimer);
      // Fill remaining slots with bots rapidly
      let poolIdx = 0;
      customLobbyFillInterval = setInterval(() => {
        if (customLobbyPlayers.length >= customLobbyMaxPlayers) {
          clearInterval(customLobbyFillInterval);
          renderCustomLobbyWaiting();
          if (statusEl) { statusEl.textContent = 'FULL'; statusEl.style.color = 'var(--green)'; }
          showToast('✅ Lobby full — starting!', 'var(--green)');
          customLobbyStartTimeout = setTimeout(startCustomGame, 1500);
          return;
        }
        const idx = poolIdx % publicNames.length;
        customLobbyPlayers.push({
          name: publicNames[idx], avatar: publicAvatars[idx],
          isHost: false, isYou: false, public: true,
        });
        poolIdx++;
        renderCustomLobbyWaiting();
      }, 120);
    }
  }, 1000);
  customLobbyFillInterval = countTimer;
}

function renderCustomLobbyWaiting() {
  const list  = document.getElementById('clWaitingList');
  const count = customLobbyPlayers.length;
  const maxEl = document.getElementById('clMaxCount');
  if (maxEl) maxEl.textContent = customLobbyMaxPlayers;
  document.getElementById('clWaitingCount').textContent = count;
  document.getElementById('clStartCount').textContent   = count;

  // Progress bar
  const fillBar = document.getElementById('clFillBar');
  const fillPct = document.getElementById('clFillPct');
  if (fillBar) fillBar.style.width = ((count / customLobbyMaxPlayers) * 100) + '%';
  if (fillPct) fillPct.innerHTML = `${count}/${customLobbyMaxPlayers}`;

  // Start button
  const startBtn  = document.getElementById('clStartBtn');
  const startHint = document.getElementById('clStartHint');
  startBtn.disabled = count < 2;
  startBtn.style.opacity = count >= 2 ? '1' : '0.5';
  if (startHint) {
    if (count >= customLobbyMaxPlayers) {
      startHint.textContent = '✅ Lobby full — game starting!';
      startHint.style.color = 'var(--green)';
    } else if (customLobbyIsPublic) {
      startHint.textContent = `Filling from queue... · Start anytime`;
      startHint.style.color = 'var(--diamond)';
    } else {
      startHint.textContent = count >= 2 ? 'Ready · Or open to public to fill' : 'Need at least 2 players';
      startHint.style.color = 'var(--muted)';
    }
  }

  // Player list
  list.innerHTML = '';
  (customLobbyPlayers||[]).forEach(p => {
    const row = document.createElement('div');
    row.className = 'lb-entry' + (p.isYou ? ' is-you' : '');
    if (p.public) row.style.opacity = '0.75';
    row.innerHTML = `
      <div class="lb-entry-avatar">${p.avatar}</div>
      <div class="lb-entry-name">
        ${p.name}${p.isHost ? ' 👑' : ''}
        ${p.isYou   ? '<span style="font-size:10px;color:var(--fire)">(YOU)</span>' : ''}
        ${p.public  ? '<span style="font-size:9px;color:var(--muted);letter-spacing:1px;"> QUEUE</span>' : ''}
      </div>
      ${!p.isHost && !p.isYou && !p.public
        ? `<button onclick="kickFromLobby(${customLobbyPlayers.indexOf(p)})"
            style="font-size:10px;color:var(--red);background:none;border:none;cursor:pointer;">✕</button>`
        : ''}
    `;
    list.appendChild(row);
  });
}

function kickFromLobby(idx) {
  // Use index for safe removal — avoids name collision issues
  customLobbyPlayers = customLobbyPlayers.filter((_, i) => i !== idx);
  renderCustomLobbyWaiting();
}

function copyCustomCode() {
  if (!customLobbyCode) return;
  const text = `Join my Tile Royale custom lobby! Code: ${customLobbyCode}`;
  copyToClipboard(text);
}

function joinCustomLobby() {
  const code = (document.getElementById('clJoinInput').value || '').trim().toUpperCase();
  const msg  = document.getElementById('clJoinMsg');
  if (!code || code.length < 6) { msg.textContent = 'Enter a 6-character code'; msg.className = 'redeem-msg error'; return; }

  // Check if lobby exists
  const lobby = gameState.customLobbies?.[code];
  if (!lobby) { msg.textContent = '❌ Lobby not found'; msg.className = 'redeem-msg error'; return; }
  if (lobby.players.length >= lobby.maxPlayers) { msg.textContent = '❌ Lobby is full'; msg.className = 'redeem-msg error'; return; }

  // Join
  const av = getActiveAvatar();
  const me = { name: gameState.playerName || 'YOU', avatar: av.icon, isHost: false, isYou: true };
  lobby.players.push(me);
  saveState();

  document.getElementById('clJoinedBox').style.display = 'block';
  document.getElementById('clJoinedCode').textContent  = code;
  const modeLabels = { rush:'⚡ Rush Mode', buckshot:'💥 Buckshot', wild:'🌀 Wild' };
  const sdLabel = lobby.suddenDeath ? ' · ⚡ SUDDEN DEATH' : '';
  document.getElementById('clJoinedMode').textContent = `${modeLabels[lobby.mode] || 'Rush'} · Host: ${lobby.host}${sdLabel}`;
  if (lobby.suddenDeath) {
    document.getElementById('clJoinedMode').style.color = 'var(--red)';
    suddenDeathMode = true;
  }

  const joinedList = document.getElementById('clJoinedList');
  joinedList.innerHTML = '';
  (lobby.players || []).forEach(p => {
    const row = document.createElement('div');
    row.className = 'lb-entry' + (p.isYou ? ' is-you' : '');
    row.innerHTML = `<div class="lb-entry-avatar">${p.avatar}</div><div class="lb-entry-name">${p.name}${p.isHost?' 👑':''}</div>`;
    joinedList.appendChild(row);
  });

  msg.textContent = ''; msg.className = 'redeem-msg';
  showToast(`✅ Joined ${lobby.host}'s lobby!`, 'var(--green)');
}

function startCustomGame() {
  clearInterval(customLobbyPollInterval);
  clearInterval(customLobbyFillInterval);
  clearTimeout(customLobbyStartTimeout);
  customLobbyStartTimeout = null;
  suddenDeathMode = customLobbySuddenDeath;
  isCustomLobbyGame = true;
  activeCustomBotSpeedMs = Math.max(10, customLobbyBotSpeed);

  if (customLobbyCode && gameState.customLobbies) {
    delete gameState.customLobbies[customLobbyCode];
    saveState();
  }

  const playerCount = customLobbyPlayers.length;
  gameState.mode    = customLobbyMode;
  gameState.players = playerCount;

  // Build allPlayers directly from the custom lobby list
  allPlayers = [];
  playerEliminated = false;
  playerWon        = false;
  playerPlace      = 0;
  playersLeft      = playerCount;

  const av = getActiveAvatar();
  // Add real player first (slot 0)
  allPlayers.push({ name: gameState.playerName || 'YOU', avatar: av.icon, isBot: false, eliminated: false, place: 0, tapCount: 0, totalReactionMs: 0 });
  // Add other lobby members as bots, using their names/avatars
  customLobbyPlayers.forEach(p => {
    if (p.isYou) return;
    allPlayers.push({ name: p.name, avatar: p.avatar, isBot: true, eliminated: false, place: 0, tapCount: 0, totalReactionMs: 0 });
  });

  // Set up lobby screen UI
  const modeTitles = { rush:'RUSH MODE', buckshot:'BUCKSHOT MODE', wild:'WILD MODE' };
  document.getElementById('lobbyModeTitle').textContent = modeTitles[gameState.mode] || 'RUSH MODE';
  document.getElementById('lobbyGridSub').textContent   = `5×5 Grid${suddenDeathMode ? ' · ⚡ SD' : ''}`;
  document.getElementById('lobbyStatusWrap').style.display    = 'none';
  document.getElementById('lobbyCountdownWrap').style.display = 'none';

  // Build player grid slots
  const grid = document.getElementById('playersGrid');
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = '';
  allPlayers.forEach((p, i) => {
    const slot = document.createElement('div');
    slot.className = 'player-slot' + (i === 0 ? ' you filled' : ' filled');
    slot.id = `slot-${i}`;
    slot.innerHTML = `<div class="player-avatar">${p.avatar}</div><div class="player-name">${i === 0 ? 'YOU' : p.name}</div>`;
    grid.appendChild(slot);
  });

  showScreen('lobbyScreen');
  showToast(`Starting ${customLobbyMode} · ${playerCount} players`, 'var(--diamond)');

  // Short delay then straight to countdown — no matchmaking needed
  setTimeout(() => startLobbyCountdown(), 800);
}

// ===== SHARE LOBBY =====
function shareLobby() {
  if (!customLobbyCode) return;
  const mode   = { rush:'Rush 🚀', buckshot:'Buckshot 💥', wild:'Wild 🌀' }[customLobbyMode] || 'Rush 🚀';
  const sdText = customLobbySuddenDeath ? ' ⚡ SUDDEN DEATH' : '';
  const text   = `Let's play Tile Royale! 🎮\nLobby: ${mode}${sdText}\nCode: ${customLobbyCode}\n\nSpectators: ${spectatorCode || '—'}\n#TileRoyale`;

  if (navigator.share) {
    navigator.share({ title: 'Tile Royale Lobby', text }).catch(() => copyToClipboard(text));
  } else {
    copyToClipboard(text);
    showToast('📋 Lobby invite copied!', 'var(--green)');
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('📋 Copied to clipboard!', 'var(--green)'))
      .catch(() => _legacyCopy(text));
  } else {
    _legacyCopy(text);
  }
}

function _legacyCopy(text) {
  // Android WebView fallback — works without HTTPS/permissions
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(ok ? '📋 Copied!' : '📋 ' + text.substring(0,30), ok ? 'var(--green)' : 'var(--muted)');
  } catch(e) {
    showToast('📋 Code: ' + text.substring(0, 30), 'var(--muted)');
  }
}

// ===== SPECTATOR SYSTEM =====
let specInterval     = null;
let specPlayerData   = {}; // sessionId → { name, avatar, lastTile, lastReaction, taps }
let specRound        = 0;
let specPlayersLeft  = 0;

function generateSpectatorCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'S';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function switchCustomTab(tab, el) {
  document.querySelectorAll('#customLobbyScreen .lb-period-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('clCreatePanel').style.display  = tab === 'create'   ? 'block' : 'none';
  document.getElementById('clJoinPanel').style.display    = tab === 'join'     ? 'block' : 'none';
  document.getElementById('clSpectatePanel').style.display = tab === 'spectate' ? 'block' : 'none';
}

function copySpectatorCode() {
  if (!spectatorCode) return;
  copyToClipboard(`👁️ Watch live: Tile Royale spectator code: ${spectatorCode}`);
}

function joinAsSpectator() {
  const code = (document.getElementById('clSpectateInput').value || '').trim().toUpperCase();
  const msg  = document.getElementById('clSpectateMsg');
  if (!code || code.length < 6) { msg.textContent = 'Enter 6-character spectator code'; msg.className = 'redeem-msg error'; return; }

  // In production: send to server via currentRoom.send('spectate', {code})
  // For now: check local lobbies (same device only — cross-device needs server)
  const lobby = Object.values(gameState.customLobbies || {}).find(l => l.spectatorCode === code);
  if (!lobby) {
    msg.textContent = '❌ Code not found. Both players must be on same device (server spectating coming soon)';
    msg.className = 'redeem-msg error';
    return;
  }

  msg.textContent = ''; msg.className = 'redeem-msg';
  document.getElementById('clSpectatorView').style.display = 'block';
  document.getElementById('specGameMode').textContent = { rush:'⚡ Rush', buckshot:'💥 Buckshot', wild:'🌀 Wild' }[lobby.mode] || 'Rush';

  // Init spectator player data from lobby players
  specPlayerData = {};
  (lobby.players || []).forEach((p, i) => {
    specPlayerData[i] = { name: p.name, avatar: p.avatar, lastTile: -1, lastReaction: 0, taps: 0, eliminated: false };
  });
  specPlayersLeft = Object.keys(specPlayerData).length;
  specRound = 0;

  buildSpecGrid();
  updateSpecPlayerList();
  startSpecSimulation(lobby);
  showToast(`👁️ Watching ${lobby.host}'s game live!`, '#8888ff');
}

function buildSpecGrid() {
  const grid = document.getElementById('specGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 25; i++) {
    const t = document.createElement('div');
    t.className = 'spec-tile'; t.id = `spec-tile-${i}`;
    grid.appendChild(t);
  }
}

function startSpecSimulation(lobby) {
  clearInterval(specInterval);
  // Spectator shows real player list only — no simulated taps or reactions.
  addSpecFeed('👁️ Watching live — waiting for real match events...', 'tap');
  document.getElementById('specPlayerCount').textContent = `${specPlayersLeft} players`;
}

function highlightSpecTile(idx) {
  // Reset all
  document.querySelectorAll('.spec-tile').forEach(t => { if (!t.classList.contains('tapped')) { t.className = 'spec-tile'; t.innerHTML = ''; } });
  const tile = document.getElementById(`spec-tile-${idx}`);
  if (tile) tile.className = 'spec-tile burning';
}

function addSpecFeed(text, type) {
  const feed = document.getElementById('specFeed');
  if (!feed) return;
  const row = document.createElement('div');
  row.className = `spec-feed-row ${type}`;
  row.innerHTML = `<span style="color:var(--muted);font-size:9px;">#${specRound}</span> ${text}`;
  feed.insertBefore(row, feed.firstChild);
  while (feed.children.length > 30) feed.removeChild(feed.lastChild);
}

function updateSpecPlayerList() {
  const container = document.getElementById('specPlayerList');
  if (!container) return;
  const players = Object.values(specPlayerData);
  const alive = players.filter(p => !p.eliminated);
  const dead  = players.filter(p => p.eliminated);

  container.innerHTML = '';

  // Alive players first
  (alive||[]).forEach(p => {
    const row = document.createElement('div');
    row.className = 'spec-reaction-row';
    const ms = p.lastReaction;
    const barW = ms > 0 ? Math.min(100, Math.round((ms / 800) * 100)) : 0;
    const barCls = ms < 300 ? '' : ms < 500 ? 'slow' : 'very-slow';
    row.innerHTML = `
      <div style="font-size:18px;width:24px;text-align:center;">${p.avatar}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;color:var(--text);letter-spacing:0.5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
          ${p.name} <span style="font-size:9px;color:var(--green);">● ALIVE</span>
        </div>
        ${ms > 0 ? `
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
          <div class="spec-reaction-bar ${barCls}" style="width:${barW}px;"></div>
          <div style="font-size:10px;color:var(--muted);">${ms}ms</div>
        </div>` : `<div style="font-size:10px;color:var(--muted);margin-top:2px;">Waiting...</div>`}
      </div>
      <div style="font-size:10px;color:var(--muted);">${p.taps} taps</div>`;
    container.appendChild(row);
  });

  // Dead players (dimmed)
  (dead||[]).forEach(p => {
    const row = document.createElement('div');
    row.className = 'spec-reaction-row';
    row.style.opacity = '0.35';
    row.innerHTML = `
      <div style="font-size:18px;width:24px;text-align:center;">💀</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;color:var(--muted);letter-spacing:0.5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
          ${p.name}
        </div>
        <div style="font-size:10px;color:var(--muted);">Eliminated · ${p.taps} taps</div>
      </div>`;
    container.appendChild(row);
  });
}

function updateSpecReactions() {
  updateSpecPlayerList();

  // Also update the separate reaction bar section (sorted by speed)
  const container = document.getElementById('specReactions');
  if (!container) return;
  const players = Object.values(specPlayerData)
    .filter(p => p.lastReaction > 0 && !p.eliminated)
    .sort((a, b) => a.lastReaction - b.lastReaction);

  container.innerHTML = players.length === 0
    ? '<div style="font-size:11px;color:var(--muted);padding:8px;letter-spacing:1px;">Waiting for first round...</div>'
    : '';

  (players||[]).forEach((p, i) => {
    const ms     = p.lastReaction;
    const maxBar = 120;
    const barW   = Math.min(maxBar, Math.round((ms / 800) * maxBar));
    const barCls = ms < 300 ? '' : ms < 500 ? 'slow' : 'very-slow';
    const medal  = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    const row    = document.createElement('div');
    row.className = 'spec-reaction-row';
    row.innerHTML = `
      <div style="width:20px;text-align:center;font-size:12px;">${medal}</div>
      <div style="width:20px;text-align:center;">${p.avatar}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:10px;color:var(--text);letter-spacing:0.5px;overflow:hidden;white-space:nowrap;">${p.name}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
          <div class="spec-reaction-bar ${barCls}" style="width:${barW}px;"></div>
          <div style="font-size:10px;color:var(--muted);">${ms}ms</div>
        </div>
      </div>`;
    container.appendChild(row);
  });
}

// ===== LOBBY =====
async function startLobby() {
  const playerCount = 30; // Must match server MAX_PLAYERS
  gameState.players = playerCount;
  allPlayers = [];
  playerEliminated = false;
  playerWon = false;
  playerPlace = 0;
  playersLeft = playerCount;

  const av = getActiveAvatar();
  allPlayers.push({ name: gameState.playerName || 'YOU', avatar: av.icon, isBot: false, eliminated: false, place: 0, tapCount: 0, totalReactionMs: 0 });

  const modeTitles = { rush:'RUSH MODE', buckshot:'BUCKSHOT MODE', wild:'WILD MODE', koth:'KING OF THE HILL' };
  const modeTimes  = { rush:'', buckshot:'', wild:'', koth:'💎 50 entry' };
  const gridLabels = { 25:'5×5' };
  document.getElementById('lobbyModeTitle').textContent = modeTitles[gameState.mode] || 'RUSH MODE';
  const modeTimeStr = modeTimes[gameState.mode] || '';
  const modeTimePart = modeTimeStr ? ' · ' + modeTimeStr : '';
  document.getElementById('lobbyGridSub').textContent = `${gridLabels[gameState.gridSize]||'5×5'} Grid${modeTimePart}${suddenDeathMode ? ' · ⚡ SD' : ''}`;

  const grid = document.getElementById('playersGrid');
  grid.innerHTML = '';
  grid.style.gridTemplateColumns = '';
  for (let i = 0; i < playerCount; i++) {
    const slot = document.createElement('div');
    slot.className = 'player-slot' + (i === 0 ? ' you' : '');
    slot.id = `slot-${i}`;
    slot.innerHTML = i === 0
      ? `<div class="player-avatar">${av.icon}</div><div class="player-name">YOU</div>`
      : `<div class="player-avatar">?</div><div class="player-name">...</div>`;
    grid.appendChild(slot);
  }

  document.getElementById('lobbyStatusText').textContent = '🔍 Searching for players...';
  document.getElementById('lobbyStatusText').style.color = 'var(--muted)';
  document.getElementById('lobbyCountdownWrap').style.display = 'none';
  document.getElementById('lobbyStatusWrap').style.display = 'block';
  showScreen('lobbyScreen');

  // Try real multiplayer (8s timeout — Railway needs time to wake up)
  const mpFound = await Promise.race([
    tryMultiplayer(gameState.mode),
    new Promise(resolve => lobbySearchTimeout = setTimeout(() => resolve(false), 8000)),
  ]);

  if (mpFound && isMultiplayer) {
    document.getElementById('lobbyStatusText').textContent = '✅ Connected! Waiting for players...';
    document.getElementById('lobbyStatusText').style.color = 'var(--green)';

    // Animate the progress bar over 15s
    const bar = document.getElementById('lobbySearchBar');
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '0%';
      void bar.offsetWidth; // force layout reflow so transition fires from 0%
      bar.style.transition = 'width 15s linear';
      bar.style.width = '100%';
    }

    // Safety fallback: if room doesn't start within 35s, switch to bot lobby
    lobbySearchTimeout = setTimeout(() => {
      if (isMultiplayer && currentRoom) {
        currentRoom.leave();
        currentRoom = null;
        isMultiplayer = false;
        document.getElementById('lobbyStatusText').textContent = '🤖 Not enough players — switching to AI...';
        document.getElementById('lobbyStatusText').style.color = 'var(--muted)';
        allPlayers = allPlayers.filter(p => !p.isBot);
        setTimeout(() => startBotLobby(playerCount, grid), 500);
      }
    }, 35000);
    return;
  }

  // Fallback: 15s countdown then fill bots
  startMatchmakingCountdown(playerCount, grid);
}

function startMatchmakingCountdown(playerCount, grid) {
  let secondsLeft = 15;
  const statusEl = document.getElementById('lobbyStatusText');
  const barEl    = document.getElementById('lobbySearchBar');

  // Show searching UI — no bots yet
  statusEl.style.color = 'var(--diamond)';
  statusEl.textContent = '🔍 Finding players... ' + secondsLeft + 's';

  // Progress bar depletes over 15s
  if (barEl) {
    barEl.style.transition = 'none';
    barEl.style.width = '100%';
    requestAnimationFrame(() => {
      barEl.style.transition = 'width 15s linear';
      barEl.style.width = '0%';
    });
  }

  // Prepare bot pool — nobody added until countdown ends
  const botPool = [];
  const shuffledNames   = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const shuffledAvatars = [...BOT_AVATARS].sort(() => Math.random() - 0.5);
  for (let i = 0; i < playerCount - 1; i++) {
    botPool.push({
      name:   shuffledNames[i % shuffledNames.length],
      avatar: shuffledAvatars[i % shuffledAvatars.length],
      isBot: true, eliminated: false, place: 0, tapCount: 0, totalReactionMs: 0
    });
  }

  // Pure 15s countdown — slots stay empty the whole time
  const countTimer = setInterval(() => {
    secondsLeft--;
    if (secondsLeft > 0) {
      statusEl.textContent = '🔍 Finding players... ' + secondsLeft + 's';
    } else {
      clearInterval(countTimer);

      // Countdown done — show message then fill bots rapidly
      statusEl.textContent = '🤖 Filling lobby with bots...';
      statusEl.style.color = 'var(--fire2)';
      if (barEl) { barEl.style.transition = 'none'; barEl.style.width = '100%'; }

      let filledSlots = 1, botIdx = 0;
      const fillTimer = setInterval(() => {
        if (filledSlots >= playerCount || botIdx >= botPool.length) {
          clearInterval(fillTimer);
          setTimeout(() => startLobbyCountdown(), 350);
          return;
        }
        const slot = document.getElementById('slot-' + filledSlots);
        if (slot) {
          const bot = botPool[botIdx];
          slot.className = 'player-slot filled';
          slot.innerHTML = '<div class="player-avatar">' + bot.avatar + '</div><div class="player-name">' + bot.name + '</div>';
          allPlayers.push(bot);
          filledSlots++;
          botIdx++;
        }
      }, 55);
      lobbyFillInterval = fillTimer;
    }
  }, 1000);
  lobbyInterval = countTimer;
}

function startBotLobby(playerCount, grid) {
  const shuffledNames = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const shuffledAvatars = [...BOT_AVATARS].sort(() => Math.random() - 0.5);
  const botPool = [];
  for (let i = 0; i < playerCount - 1; i++) {
    const name = shuffledNames[i % shuffledNames.length];
    const avatar = shuffledAvatars[i % shuffledAvatars.length];
    botPool.push({ name, avatar, isBot: true, eliminated: false, place: 0, tapCount: 0, totalReactionMs: 0 });
  }

  document.getElementById('lobbyStatusText').textContent = '🤖 Filling lobby with AI players...';
  document.getElementById('lobbyStatusText').style.color = 'var(--fire2)';
  document.getElementById('lobbySearchBar').style.width = '100%';

  let filledSlots = 1, botIdx = 0;
  lobbyFillInterval = setInterval(() => {
    if (filledSlots >= playerCount) {
      clearInterval(lobbyFillInterval);
      startLobbyCountdown();
      return;
    }
    const slot = document.getElementById(`slot-${filledSlots}`);
    if (slot && botIdx < botPool.length) {
      const bot = botPool[botIdx];
      slot.className = 'player-slot filled';
      slot.innerHTML = `<div class="player-avatar">${bot.avatar}</div><div class="player-name">${bot.name}</div>`;
      allPlayers.push(bot);
      filledSlots++;
      botIdx++;
    }
  }, 80);
  lobbyInterval = lobbyFillInterval;
}

// Bot mode tap — delegate to original tapTile internals
function _botModeTapTile(idx) { _originalTapTile(idx); }

