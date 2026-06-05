// ===== GAUNTLET MODE =====

// ── Constants ──
const GM_GRID_SIZE      = 25;       // 5×5
const GM_ROUND_SECS     = 35;
const GM_BASE_SPAWN_MS  = 600;
const GM_TILE_LIFE_MS   = 4000;     // regular tiles vanish after this
const GM_VOID_DURATION  = 1.2;      // seconds
const GM_MAX_VOID_BOMBS = 2;
const GM_SCORE_CORRECT  = 10;
const GM_SCORE_WRONG    = -10;
const GM_BOT_COUNT      = 29;       // simulated opponents (total lobby = 30)

// ── Key system ──
const GM_KEYS_MAX       = 10;
const GM_KEY_REFILL_MS  = 60 * 60 * 1000;   // 1 key per 60 min
const GM_KEY_GEM_COST   = 100;
let _gmKeyTimerInterval = null;

const GM_COLOURS = ['common','uncommon','rare','epic','legendary','secret'];
const GM_COLOUR_LABELS = {
  common:'GREY', uncommon:'GREEN', rare:'BLUE',
  epic:'PURPLE', legendary:'ORANGE', secret:'RED'
};

const GM_MMR_TABLE = [
  {from:1, to:1, delta:50}, {from:2, to:5, delta:30},
  {from:6, to:10, delta:15}, {from:11, to:15, delta:0},
  {from:16, to:20, delta:-10}, {from:21, to:30, delta:-30},
];

const GM_SURVIVAL_CHANCE = {
  common:10, uncommon:25, rare:40, epic:55, legendary:70, secret:90
};

// Effect values per rarity (percentages as decimals)
const GM_EFFECT_VALS = {
  common:    {bonusMmr:0.001,  voidTimer:0.05,  tileSpawn:0.0125, plusPoints:0.05,  minusPenalty:0.05 },
  uncommon:  {bonusMmr:0.002,  voidTimer:0.08,  tileSpawn:0.02,   plusPoints:0.08,  minusPenalty:0.08 },
  rare:      {bonusMmr:0.004,  voidTimer:0.11,  tileSpawn:0.0275, plusPoints:0.11,  minusPenalty:0.11 },
  epic:      {bonusMmr:0.006,  voidTimer:0.14,  tileSpawn:0.035,  plusPoints:0.14,  minusPenalty:0.14 },
  legendary: {bonusMmr:0.008,  voidTimer:0.17,  tileSpawn:0.0425, plusPoints:0.17,  minusPenalty:0.17 },
  secret:    {bonusMmr:0.01,   voidTimer:0.20,  tileSpawn:0.05,   plusPoints:0.20,  minusPenalty:0.20 },
};
const GM_EFFECT_KEYS = ['bonusMmr','voidTimer','tileSpawn','plusPoints','minusPenalty'];

// ── Data persistence ──
function gmLoadData() {
  const def = {mmr:0, totalGames:0, totalWins:0, gauntletUnlocked:false, weeklySnapshot:[]};
  try { return Object.assign({}, def, JSON.parse(localStorage.getItem('gauntletData') || '{}')); }
  catch { return def; }
}

function gmSaveData(d) {
  localStorage.setItem('gauntletData', JSON.stringify(d));
}

// ── Key system ──
function gmGetKeys() {
  const gd = gmLoadData();
  return Math.max(0, Math.min(GM_KEYS_MAX, gd.keys ?? GM_KEYS_MAX));
}

function gmCheckKeyRefill() {
  const gd = gmLoadData();
  if ((gd.keys ?? GM_KEYS_MAX) >= GM_KEYS_MAX) {
    gd.keyLastUse = null;
    gmSaveData(gd);
    return;
  }
  const last = gd.keyLastUse;
  if (!last) return;
  const refills = Math.floor((Date.now() - last) / GM_KEY_REFILL_MS);
  if (refills > 0) {
    const newKeys = Math.min(GM_KEYS_MAX, (gd.keys ?? 0) + refills);
    gd.keys       = newKeys;
    gd.keyLastUse = newKeys >= GM_KEYS_MAX ? null : last + refills * GM_KEY_REFILL_MS;
    gmSaveData(gd);
  }
}

function gmKeyRefillTime() {
  const gd = gmLoadData();
  if ((gd.keys ?? GM_KEYS_MAX) >= GM_KEYS_MAX) return null;
  const last = gd.keyLastUse || Date.now();
  const diff  = Math.max(0, (last + GM_KEY_REFILL_MS) - Date.now());
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${m}:${String(s).padStart(2,'0')}`;
}

function gmUseKey() {
  gmCheckKeyRefill();
  const gd = gmLoadData();
  const cur = gd.keys ?? GM_KEYS_MAX;
  if (cur <= 0) return false;
  gd.keys = cur - 1;
  if (!gd.keyLastUse) gd.keyLastUse = Date.now();
  gmSaveData(gd);
  gmUpdateKeyUI();
  return true;
}

function gmAddKey(n = 1) {
  const gd  = gmLoadData();
  const cur = gd.keys ?? GM_KEYS_MAX;
  gd.keys   = Math.min(GM_KEYS_MAX, cur + n);  // hard cap at 10
  if (!gd.keyLastUse && gd.keys < GM_KEYS_MAX) gd.keyLastUse = Date.now();
  gmSaveData(gd);
  gmUpdateKeyUI();
}

function gmUpdateKeyUI() {
  gmCheckKeyRefill();
  const keys   = gmGetKeys();
  const timer  = gmKeyRefillTime();
  const keyEl  = document.getElementById('ghKeyCount');
  const timerEl= document.getElementById('ghKeyTimer');
  const playBtn= document.getElementById('ghPlayBtn');

  if (keyEl) {
    keyEl.textContent = `🔑 ${keys} / ${GM_KEYS_MAX}`;
    keyEl.style.color = keys === 0 ? '#ff4444' : keys <= 2 ? '#ff8800' : '#fff';
  }
  if (timerEl) {
    timerEl.textContent = keys >= GM_KEYS_MAX ? 'Full' : timer ? `+1 in ${timer}` : '';
  }
  if (playBtn) {
    playBtn.disabled = false;
    playBtn.style.opacity = '1';
  }

  // Restart countdown timer
  clearInterval(_gmKeyTimerInterval);
  if (keys < GM_KEYS_MAX) {
    _gmKeyTimerInterval = setInterval(() => {
      gmCheckKeyRefill();
      const k  = gmGetKeys();
      const t  = gmKeyRefillTime();
      const kEl = document.getElementById('ghKeyCount');
      const tEl = document.getElementById('ghKeyTimer');
      if (kEl) { kEl.textContent = `🔑 ${k} / ${GM_KEYS_MAX}`; kEl.style.color = k === 0 ? '#ff4444' : k <= 2 ? '#ff8800' : '#fff'; }
      if (tEl) tEl.textContent = k >= GM_KEYS_MAX ? 'Full' : t ? `+1 in ${t}` : '';
      if (k >= GM_KEYS_MAX) clearInterval(_gmKeyTimerInterval);
    }, 1000);
  }
}

async function gmWatchAdForKey() {
  const btn = document.getElementById('ghAdKeyBtn');
  if (btn) btn.disabled = true;
  showToast('📺 Loading ad...', 'var(--muted)');
  const rewarded = await _watchRewardedAd();
  if (btn) btn.disabled = false;
  if (!rewarded) { showToast('Ad not available — try again later', 'var(--muted)'); return; }
  gmAddKey(2);
  document.getElementById('ghNoKeyPopup')?.remove();
  showToast('🔑🔑 +2 Keys earned!', '#ffd700');
  playSound('achieve');
}

function gmBuyKeyWithGems() {
  if ((gameState.diamonds || 0) < GM_KEY_GEM_COST) {
    showToast(`Need 💎 ${GM_KEY_GEM_COST}!`, 'var(--red)'); return;
  }
  gameState.diamonds -= GM_KEY_GEM_COST;
  saveState();
  gmAddKey(1);
  document.getElementById('ghNoKeyPopup')?.remove();
  showToast('🔑 Key purchased!', '#ffd700');
  playSound('achieve');
}

function gmShowNoKeyPopup() {
  const existing = document.getElementById('ghNoKeyPopup');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ghNoKeyPopup';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  const timer = gmKeyRefillTime();
  overlay.innerHTML = `
    <div style="background:linear-gradient(180deg,#0d0020,#070010);border:1px solid rgba(155,0,255,0.4);border-radius:18px;padding:24px 20px;max-width:320px;width:100%;text-align:center;">
      <div style="font-size:40px;margin-bottom:10px;">🔑</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:3px;color:#fff;margin-bottom:6px;">NO KEYS LEFT</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.45);letter-spacing:1px;margin-bottom:${timer ? '4px' : '18px'};">Keys regenerate 1 per hour (max ${GM_KEYS_MAX})</div>
      ${timer ? `<div style="font-size:13px;color:#9b00ff;letter-spacing:1px;margin-bottom:18px;">Next key in <b>${timer}</b></div>` : ''}
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
        <button id="ghAdKeyBtn" style="padding:13px;border-radius:12px;background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.35);color:#ffd700;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;cursor:pointer;" onclick="gmWatchAdForKey()">📺 WATCH AD — GET 2 KEYS</button>
        <button style="padding:13px;border-radius:12px;background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.3);color:var(--diamond);font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;cursor:pointer;" onclick="gmBuyKeyWithGems()">💎 ${GM_KEY_GEM_COST} GEMS — GET KEY</button>
      </div>
      <button style="width:100%;padding:10px;background:none;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:rgba(255,255,255,0.4);font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:2px;cursor:pointer;" onclick="document.getElementById('ghNoKeyPopup').remove()">CLOSE</button>
    </div>`;
  document.body.appendChild(overlay);
}

// ── Ring effects ──
function gmGetRingEffects() {
  const equipped = gameState.gauntlet || {};
  const fingers  = Object.values(equipped).filter(Boolean);
  const totals   = {bonusMmr:0, voidTimer:0, tileSpawn:0, plusPoints:0, minusPenalty:0};

  fingers.forEach(ringId => {
    const ring = getRingDef(ringId);
    if (!ring) return;
    const vals = GM_EFFECT_VALS[ring.rarityId] || GM_EFFECT_VALS.common;
    // Deterministic effect type per ring
    let hash = 0;
    for (let i = 0; i < ringId.length; i++) hash = ((hash << 5) - hash + ringId.charCodeAt(i)) | 0;
    const key = GM_EFFECT_KEYS[Math.abs(hash) % GM_EFFECT_KEYS.length];
    totals[key] += vals[key];
  });

  return totals;
}

// ── Survival bonus ──
function gmSurvivalChance() {
  const equipped = gameState.gauntlet || {};
  const fingers  = Object.values(equipped).filter(Boolean);
  if (fingers.length < 5) return 0; // needs all 5 slots filled
  const label = getGauntletRarityLabel();
  return label ? (GM_SURVIVAL_CHANCE[label] || 0) : 0;
}

function gmRollSurvival() {
  const chance = gmSurvivalChance();
  if (chance <= 0) return false;
  return Math.random() * 100 <= chance;
}

// ── Game state ──
let _gm     = null;
let _gmRoom = null;   // active Colyseus gauntlet room (null = bot fallback)

function _gmReset() {
  _gm = {
    active:          false,
    ending:          false,
    score:           0,
    targetColour:    null,
    timeLeft:        GM_ROUND_SECS,
    eliminated:      false,
    survivalUses:    0,
    correctTaps:     0,
    wrongTaps:       0,
    tiles:           {},      // pos → {colour, isVoid, countdown, tickId, lifeId}
    voidCount:       0,
    spawnId:         null,
    roundId:         null,
    effects:         null,
    botScores:       [],
    finalPlace:      1,
    mmrDelta:        0,
  };
}

// ── MMR helpers ──
function gmMmrDelta(place) {
  for (const row of GM_MMR_TABLE) {
    if (place >= row.from && place <= row.to) return row.delta;
  }
  return -30;
}

function gmRankLabel(mmr) {
  if (mmr >= 2000) return 'VOID CONQUEROR';
  if (mmr >= 1500) return 'GRANDMASTER';
  if (mmr >= 1000) return 'MASTER';
  if (mmr >= 600)  return 'DIAMOND';
  if (mmr >= 300)  return 'PLATINUM';
  if (mmr >= 100)  return 'GOLD';
  if (mmr >= 1)    return 'BRONZE';
  return 'UNRANKED';
}

// ── Season timer ──
function gmSeasonDaysLeft() {
  const now    = new Date();
  const end    = new Date(now.getFullYear(), now.getMonth() + 1, 1); // 1st of next month
  const diff   = end - now;
  return Math.max(0, Math.ceil(diff / 86400000));
}

// ── Hub screen ──
function openGauntletHub() {
  const gd = gmLoadData();
  if (gameState.gauntletUnlocked) gd.gauntletUnlocked = true;
  gmCheckKeyRefill();
  renderGauntletHub(gd);
  gmUpdateKeyUI();
  try { renderGauntletModeEffects(); } catch(e) {}
  showScreen('gauntletHubScreen');
}

function gmStartOrNoKey() {
  gmCheckKeyRefill();
  if (gmGetKeys() <= 0) {
    gmShowNoKeyPopup();
    return;
  }
  startGauntletLobby();
}

function renderGauntletHub(gd) {
  if (!gd) gd = gmLoadData();

  const mmr = gd.mmr || 0;
  const el = id => document.getElementById(id);

  if (el('ghMmrValue'))  el('ghMmrValue').textContent  = mmr.toLocaleString();
  if (el('ghMmrRank'))   el('ghMmrRank').textContent   = gmRankLabel(mmr);
  if (el('ghSeasonTimer')) el('ghSeasonTimer').textContent = `Season ends in ${gmSeasonDaysLeft()} days`;

  // Placement % and reward tier
  const place = _gmPlacementInfo(mmr);
  const badgeEl = el('ghPlacementBadge');
  const rewardEl = el('ghRewardPreview');
  if (badgeEl) {
    badgeEl.innerHTML = `<span style="display:inline-block;padding:3px 12px;border-radius:14px;font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:2px;background:${place.bg};color:${place.color};border:1px solid ${place.color}44;">${place.label}</span>`;
  }
  if (rewardEl) {
    rewardEl.textContent = `Weekly reward: ${place.reward}`;
  }

  // Weekly leaderboard (simulated — shows own entry + placeholders)
  const lb = el('ghLeaderboard');
  if (lb) {
    const snapshot = gd.weeklySnapshot || [];
    const rows = snapshot.length ? snapshot : _gmDefaultLeaderboard(mmr);
    lb.innerHTML = rows.slice(0, 5).map((r, i) => `
      <div class="gh-lb-row">
        <div class="gh-lb-rank ${i === 0 ? 'gh-rank-1' : ''}">#${i+1}</div>
        <div class="gh-lb-name">${r.name}</div>
        <div class="gh-lb-mmr">${r.mmr}</div>
      </div>`).join('');
  }
}

// Maps player rank in leaderboard → placement % tier → weekly reward info
function _gmPlacementInfo(myMmr) {
  const rows  = _gmDefaultLeaderboard(myMmr);
  const total = rows.length;
  const rank  = rows.findIndex(r => r.name === (gameState.playerName || 'You')) + 1 || total;
  const pct   = rank / total * 100;

  if (rank === 1)   return { label:'#1 THIS WEEK', color:'#ffd700', bg:'rgba(255,215,0,0.08)',    reward:'40 spins + 400💎' };
  if (pct <= 2)     return { label:'TOP 2%',        color:'#ffd700', bg:'rgba(255,215,0,0.08)',    reward:'25 spins + 250💎' };
  if (pct <= 3)     return { label:'TOP 3%',        color:'#ff8800', bg:'rgba(255,136,0,0.08)',    reward:'20 spins + 200💎' };
  if (pct <= 5)     return { label:'TOP 5%',        color:'#ff8800', bg:'rgba(255,136,0,0.08)',    reward:'15 spins + 150💎' };
  if (pct <= 10)    return { label:'TOP 10%',       color:'#9b00ff', bg:'rgba(155,0,255,0.08)',    reward:'10 spins + 100💎' };
  if (pct <= 25)    return { label:'TOP 25%',       color:'#9b00ff', bg:'rgba(155,0,255,0.08)',    reward:'7 spins + 70💎' };
  if (pct <= 50)    return { label:'TOP 50%',       color:'#00e5ff', bg:'rgba(0,229,255,0.06)',    reward:'5 spins + 50💎' };
  if (pct <= 75)    return { label:'TOP 75%',       color:'rgba(255,255,255,0.5)', bg:'rgba(255,255,255,0.04)', reward:'3 spins + 30💎' };
  return               { label:'TOP 100%',      color:'rgba(255,255,255,0.35)', bg:'rgba(255,255,255,0.03)', reward:'1 spin + 10💎' };
}

function _gmDefaultLeaderboard(myMmr) {
  const names = ['VoidSlayer','CrimsonAce','PhantomX','DarkMatter','NeonRift'];
  return names.map((name, i) => ({
    name: i === 0 ? (gameState.playerName || 'You') : name,
    mmr:  myMmr + (4 - i) * Math.floor(Math.random() * 40 + 10)
  })).sort((a,b) => b.mmr - a.mmr);
}

// ── Lobby / matchmaking ──
let _gmLobbyId   = null;
let _gmLobbyTick = 0;

async function startGauntletLobby() {
  try { _gmRestoreResultButtons(); } catch(e) {}
  if (!gmUseKey()) { gmShowNoKeyPopup(); return; }

  const gd    = gmLoadData();
  const myMmr = gd.mmr || 0;

  const glMmr = document.getElementById('glYourMmr');
  if (glMmr) glMmr.textContent = myMmr;

  _gmLobbyTick = 0;
  _gmUpdateLobbyUI(15, 0);
  showScreen('gauntletLobbyScreen');
  playSound('menu');

  // Try to join a real Colyseus gauntlet room
  const client = (typeof getColyseusClient === 'function') ? getColyseusClient() : null;
  if (!client) { _gmStartBotFallback(); return; }

  try {
    const effects  = gmGetRingEffects();
    const av       = (typeof getActiveAvatar === 'function') ? getActiveAvatar().icon : '🔥';
    _gmRoom = await client.joinOrCreate('gauntlet', {
      playerId: PLAYER_ID,
      name:     (gameState.playerName || 'Player').substring(0, 16),
      avatar:   av,
      mmr:      myMmr,
      effects,
    });
    console.log('[Gauntlet] Joined room:', _gmRoom.id);
    _gmSetupRoomListeners();

    // Local lobby timer for UI (server controls actual start)
    let lobbySecsLeft = 15;
    clearInterval(_gmLobbyId);
    _gmLobbyId = setInterval(() => {
      lobbySecsLeft--;
      const n = (_gmRoom?.state?.playerCount || 1) - 1;
      _gmUpdateLobbyUI(lobbySecsLeft, n);
      if (lobbySecsLeft <= 0) clearInterval(_gmLobbyId);
    }, 1000);
  } catch (err) {
    console.warn('[Gauntlet] Server join failed, bot fallback:', err?.message || err);
    _gmRoom = null;
    _gmStartBotFallback();
  }
}

function _gmSetupRoomListeners() {
  if (!_gmRoom) return;

  // Live player count during lobby
  _gmRoom.state.players.onAdd(() => {
    if (_gmRoom.state.phase !== 'lobby') return;
    const n = _gmRoom.state.playerCount || 1;
    _gmUpdateLobbyUI(_gmRoom.state.countdownValue ?? 15, n - 1);
  });

  _gmRoom.onMessage('ping', data => {
    try { _gmRoom.send('pong', { id: data.id }); } catch(e) {}
  });

  _gmRoom.onMessage('game_start', data => {
    clearInterval(_gmLobbyId);
    _gmStartGame(30, data.targetColour);
  });

  _gmRoom.onMessage('score_update', data => {
    // Sync server score — find our sessionId entry
    const sid = _gmRoom.sessionId;
    if (data.scores && data.scores[sid] !== undefined && _gm) {
      _gm.score = data.scores[sid];
      _gmUpdateHud();
    }
    if (data.timeLeft !== undefined && _gm) {
      _gm.timeLeft = data.timeLeft;
      _gmUpdateHud();
    }
  });

  _gmRoom.onMessage('results', data => {
    _gmHandleServerResults(data);
  });

  _gmRoom.onLeave(code => {
    console.log('[Gauntlet] Left room, code:', code);
    _gmRoom = null;
  });

  _gmRoom.onError((code, msg) => {
    console.error('[Gauntlet] Room error:', code, msg);
  });
}

// Old bot-only path — used when server is unreachable
function _gmStartBotFallback() {
  _gmLobbyTick = 0;
  clearInterval(_gmLobbyId);
  _gmLobbyId = setInterval(() => {
    _gmLobbyTick++;
    const totalSecs = 15;
    const secsLeft  = totalSecs - _gmLobbyTick;

    let playersFound;
    if (_gmLobbyTick <= 5)       playersFound = Math.min(GM_BOT_COUNT, Math.round((_gmLobbyTick / 5) * 15));
    else if (_gmLobbyTick <= 10) playersFound = Math.min(GM_BOT_COUNT, 15 + Math.round(((_gmLobbyTick-5)/5) * 12));
    else                         playersFound = Math.min(GM_BOT_COUNT, 27 + Math.round(((_gmLobbyTick-10)/5) * 2));

    _gmUpdateLobbyUI(secsLeft, playersFound);

    if (secsLeft <= 0 || playersFound >= GM_BOT_COUNT) {
      clearInterval(_gmLobbyId);
      _gmStartGame(playersFound + 1);
    }
  }, 1000);
}

function _gmUpdateLobbyUI(secsLeft, playersFound) {
  const el = id => document.getElementById(id);
  if (el('glCountdown'))    el('glCountdown').textContent    = Math.max(0, secsLeft);
  if (el('glPlayersFound')) el('glPlayersFound').textContent = `${playersFound + 1} players found`;
  if (el('glMatchFill'))    el('glMatchFill').style.width    = `${Math.min(100, ((playersFound+1)/30)*100)}%`;

  let rangeText = 'Searching ±100 MMR';
  if (_gmLobbyTick > 60) rangeText = 'Searching ALL MMR';
  else if (_gmLobbyTick > 30) rangeText = 'Searching ±200 MMR';
  if (el('glSearchRange')) el('glSearchRange').textContent = rangeText;
}

function cancelGauntletLobby() {
  clearInterval(_gmLobbyId);
  _gmLobbyId = null;
  if (_gmRoom) {
    try { _gmRoom.leave(); } catch(e) {}
    _gmRoom = null;
  }
  // Refund the key — game never started
  gmAddKey(1);
  showToast('🔑 Key refunded', 'var(--muted)');
  showScreen('gauntletHubScreen');
  renderGauntletHub();
  gmUpdateKeyUI();
}

// ── Game start ──
function _gmStartGame(totalPlayers, serverTargetColour) {
  _gmReset();
  _gm.active      = true;
  _gm.effects     = gmGetRingEffects();
  _gm.timeLeft    = GM_ROUND_SECS;
  _gm.totalPlayers = totalPlayers || 30;

  // Use server-provided target colour if in multiplayer, else random
  _gm.targetColour = serverTargetColour || GM_COLOURS[Math.floor(Math.random() * GM_COLOURS.length)];

  // Pre-roll bot scores only in fallback (bot) mode
  if (!_gmRoom) {
    const botCount = totalPlayers - 1;
    _gm.botScores = Array.from({length: botCount}, () => {
      const taps = Math.floor(Math.random() * 30 + 10);
      const acc  = 0.5 + Math.random() * 0.45;
      return Math.round(taps * acc * GM_SCORE_CORRECT - taps * (1-acc) * GM_SCORE_CORRECT);
    });
  } else {
    _gm.botScores = []; // server handles all scoring
  }

  showScreen('gauntletGameScreen');
  _gmBuildGrid();
  _gmUpdateHud();
  _gmUpdateTarget();

  // Hide eliminated overlay and restore leave button for this game
  const ov = document.getElementById('gmEliminatedOverlay');
  if (ov) {
    ov.style.display = 'none';
    const btn = ov.querySelector('button');
    if (btn) btn.style.display = '';
  }

  // Spawn interval (adjusted by ring tile-spawn effect)
  const spawnMs = Math.round(GM_BASE_SPAWN_MS * (1 - (_gm.effects.tileSpawn || 0)));
  _gm.spawnId = setInterval(_gmSpawnTile, Math.max(100, spawnMs));

  // Round countdown
  _gm.roundId = setInterval(() => {
    if (!_gm || !_gm.active || _gm.ending) return;
    _gm.timeLeft--;
    _gmUpdateHud();
    if (_gm.timeLeft <= 0) _gmEndGame();
  }, 1000);
}

// ── Grid ──
function _gmBuildGrid() {
  const grid = document.getElementById('gmGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < GM_GRID_SIZE; i++) {
    const tile = document.createElement('div');
    tile.className = 'gm-tile gm-empty';
    tile.dataset.pos  = i;
    tile.onclick = () => _gmClickTile(i);
    grid.appendChild(tile);
    _gm.tiles[i] = null;
  }
}

function _gmTileEl(pos) {
  const grid = document.getElementById('gmGrid');
  return grid ? grid.querySelector(`[data-pos="${pos}"]`) : null;
}

// ── Spawn tile ──
function _gmSpawnTile() {
  if (!_gm || !_gm.active) return;

  // Pick empty positions
  const empty = [];
  for (let i = 0; i < GM_GRID_SIZE; i++) { if (!_gm.tiles[i]) empty.push(i); }
  if (!empty.length) return;

  const pos = empty[Math.floor(Math.random() * empty.length)];

  // Decide void bomb vs colour
  const isVoid = _gm.voidCount < GM_MAX_VOID_BOMBS && Math.random() < 0.10;

  if (isVoid) {
    _gmPlaceVoidBomb(pos);
  } else {
    const colour = GM_COLOURS[Math.floor(Math.random() * GM_COLOURS.length)];
    _gmPlaceColourTile(pos, colour);
  }
}

function _gmPlaceColourTile(pos, colour) {
  const el = _gmTileEl(pos);
  if (!el) return;
  el.className = `gm-tile gm-${colour}`;
  el.textContent = '';

  const lifeId = setTimeout(() => {
    if (_gm && _gm.tiles[pos] && !_gm.tiles[pos].isVoid) _gmClearTile(pos);
  }, GM_TILE_LIFE_MS);

  _gm.tiles[pos] = {colour, isVoid:false, lifeId, tickId:null};
}

function _gmPlaceVoidBomb(pos) {
  const el = _gmTileEl(pos);
  if (!el) return;

  _gm.voidCount++;

  // Void bomb duration extended by ring effect
  const voidDur = GM_VOID_DURATION * (1 + (_gm.effects.voidTimer || 0));
  let countdown = parseFloat(voidDur.toFixed(1));

  el.className = 'gm-tile gm-void';
  el.innerHTML = `<img src="img/void-bomb.svg" class="gm-void-bomb-icon"><span class="gm-void-countdown">${countdown.toFixed(1)}</span>`;

  _gm.tiles[pos] = {colour:'void', isVoid:true, countdown, lifeId:null, tickId:null};

  // Countdown tick every 100ms
  const tickId = setInterval(() => {
    if (!_gm || !_gm.tiles[pos] || !_gm.tiles[pos].isVoid) {
      clearInterval(tickId); return;
    }
    countdown = parseFloat((countdown - 0.1).toFixed(1));
    _gm.tiles[pos].countdown = countdown;
    const cntEl = el.querySelector('.gm-void-countdown');
    if (cntEl) cntEl.textContent = countdown.toFixed(1);

    // Critical flash when < 0.3s
    if (countdown < 0.3) el.classList.add('gm-void-critical');

    if (countdown <= 0) {
      clearInterval(tickId);
      _gmVoidExplode(pos);
    }
  }, 100);

  _gm.tiles[pos].tickId = tickId;
}

function _gmClearTile(pos) {
  const t = _gm.tiles[pos];
  if (t) {
    if (t.tickId)  clearInterval(t.tickId);
    if (t.lifeId)  clearTimeout(t.lifeId);
    if (t.isVoid)  _gm.voidCount = Math.max(0, _gm.voidCount - 1);
  }
  _gm.tiles[pos] = null;
  const el = _gmTileEl(pos);
  if (el) { el.className = 'gm-tile gm-empty'; el.innerHTML = ''; }
}

// ── Click handler ──
function _gmClickTile(pos) {
  if (!_gm || !_gm.active || _gm.eliminated) return;
  const t = _gm.tiles[pos];
  if (!t) return; // empty tile

  if (t.isVoid) {
    // Clicking void bomb = defuse bonus +20
    if (!_gmRoom) _gmApplyScore(20);
    _gm.correctTaps++;
    _gmClearTile(pos);
    _gmFlashScore('+20', '#9b00ff');
    if (_gmRoom) try { _gmRoom.send('tap', { pos, correct: false, isVoid: true }); } catch(e) {}
  } else if (t.colour === _gm.targetColour) {
    // Correct!
    const pts = GM_SCORE_CORRECT * (1 + (_gm.effects.plusPoints || 0));
    if (!_gmRoom) _gmApplyScore(pts);
    _gm.correctTaps++;
    _gmClearTile(pos);
    // Change target colour
    _gm.targetColour = GM_COLOURS[Math.floor(Math.random() * GM_COLOURS.length)];
    _gmUpdateTarget();
    _gmFlashScore(`+${Math.round(pts)}`, '#00ff88');
    vibrate(20);
    if (_gmRoom) try { _gmRoom.send('tap', { pos, correct: true, isVoid: false }); } catch(e) {}
  } else {
    // Wrong colour
    const penalty = GM_SCORE_WRONG * (1 - (_gm.effects.minusPenalty || 0));
    if (!_gmRoom) _gmApplyScore(penalty);
    _gm.wrongTaps++;
    _gmFlashScore('WRONG! -10', '#ff4444');
    if (_gmRoom) try { _gmRoom.send('tap', { pos, correct: false, isVoid: false }); } catch(e) {}
  }
}

function _gmApplyScore(delta) {
  _gm.score = Math.round(_gm.score + delta);
  _gmUpdateHud();
}

function _gmFlashScore(text, color) {
  const el = document.getElementById('gmScore');
  if (!el) return;
  const old = el.style.color;
  el.style.color = color;
  setTimeout(() => { if (el) el.style.color = old; }, 300);
}

// ── Void bomb explosion ──
function _gmVoidExplode(pos) {
  if (!_gm || !_gm.tiles[pos]) return;
  _gmClearTile(pos);

  if (_gm.eliminated) return; // already out

  // Void bomb always makes a sound on explosion
  playSound('void_bomb');

  // Check survival bonus
  if (gmRollSurvival()) {
    _gm.survivalUses++;
    showToast('💣 Void Bomb survived! (Ring Bonus)', '#9b00ff');
    vibrate([30, 50, 30]);
    return;
  }

  // Elimination
  _gm.eliminated = true;
  _gm.score = 0;
  _gmUpdateHud();
  vibrate([100, 50, 100]);

  const ov = document.getElementById('gmEliminatedOverlay');
  if (ov) ov.style.display = 'flex';

  // Game continues counting down — player watches with 0 score
}

// ── HUD update ──
function _gmUpdateHud() {
  const el = id => document.getElementById(id);
  const scoreEl = el('gmScore');
  const timerEl = el('gmTimer');
  const aliveEl = el('gmAlive');

  if (scoreEl) {
    scoreEl.textContent = _gm.score;
    scoreEl.className   = `gm-score-display${_gm.score < 0 ? ' gm-score-neg' : ''}`;
  }
  if (timerEl) {
    timerEl.textContent = _gm.timeLeft;
    timerEl.className   = `gm-timer-display${_gm.timeLeft <= 5 ? ' gm-timer-low' : ''}`;
  }
  if (aliveEl) {
    const total = _gm.totalPlayers || (_gm.botScores.length + 1);
    aliveEl.textContent = `${total}/${total}`;
  }
}

function _gmUpdateTarget() {
  const tileEl = document.getElementById('gmTargetTile');
  const nameEl = document.getElementById('gmTargetName');
  const c = _gm.targetColour;
  if (tileEl) tileEl.className = `gm-target-tile gm-${c}`;
  if (nameEl) nameEl.textContent = GM_COLOUR_LABELS[c] || c.toUpperCase();
}

// ── End game ──
function _gmEndGame() {
  if (!_gm || _gm.ending) return;
  _gm.ending = true;
  _gm.active = false;
  clearInterval(_gm.spawnId);
  clearInterval(_gm.roundId);

  // Hide leave button so it can't be clicked again
  const ov = document.getElementById('gmEliminatedOverlay');
  if (ov) { const btn = ov.querySelector('button'); if (btn) btn.style.display = 'none'; }

  // Clear all active tiles
  for (let i = 0; i < GM_GRID_SIZE; i++) {
    if (_gm.tiles[i]) _gmClearTile(i);
  }

  if (_gmRoom) {
    // Server-authoritative mode: show "Calculating..." and wait for results message
    _gmShowWaitingForResults();
    // Results arrive via _gmRoom.onMessage('results', ...) → _gmHandleServerResults()
    // Safety fallback: if server doesn't respond in 10s, leave gracefully
    setTimeout(() => {
      if (_gm && _gm.ending && !_gm.resultsReceived) {
        console.warn('[Gauntlet] Results timeout — disconnecting');
        try { _gmRoom?.leave(); } catch(e) {}
        _gmRoom = null;
        showScreen('gauntletHubScreen');
        renderGauntletHub();
      }
    }, 10000);
    return;
  }

  // Bot fallback: calculate locally
  const allScores = [..._gm.botScores, _gm.score].sort((a,b) => b - a);
  const place = allScores.indexOf(_gm.score) + 1;
  _gm.finalPlace = Math.max(1, place);

  const baseDelta = gmMmrDelta(_gm.finalPlace);
  const bonusMult = 1 + (_gm.effects.bonusMmr || 0);
  _gm.mmrDelta = Math.round(baseDelta * bonusMult);

  const gd = gmLoadData();
  gd.mmr         = Math.max(0, (gd.mmr || 0) + _gm.mmrDelta);
  gd.totalGames  = (gd.totalGames || 0) + 1;
  if (_gm.finalPlace === 1) gd.totalWins = (gd.totalWins || 0) + 1;
  gmSaveData(gd);
  gameState.gauntletMmr = gd.mmr;
  saveState();

  setTimeout(() => _gmShowResults(), 800);
}

function _gmShowWaitingForResults() {
  const overlay = document.getElementById('gmEliminatedOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.innerHTML = '<div style="color:#fff;font-size:18px;text-align:center">⚔ Calculating results…</div>';
  }
}

function _gmHandleServerResults(data) {
  if (!_gm) return;
  _gm.resultsReceived = true;

  _gm.finalPlace  = data.placement  || 1;
  _gm.score       = data.score      ?? _gm.score;
  _gm.correctTaps = data.taps       ?? _gm.correctTaps;
  _gm.mmrDelta    = data.mmrDelta   ?? 0;
  _gm._serverLeaderboard = data.leaderboard || null;

  // Sync local MMR with server
  const gd = gmLoadData();
  gd.mmr        = data.newMmr ?? Math.max(0, (gd.mmr || 0) + _gm.mmrDelta);
  gd.totalGames = (gd.totalGames || 0) + 1;
  if (_gm.finalPlace === 1) gd.totalWins = (gd.totalWins || 0) + 1;
  gmSaveData(gd);
  gameState.gauntletMmr = gd.mmr;
  saveState();

  setTimeout(() => _gmShowResults(), 500);
}

// ── Build sorted leaderboard data ──
function _gmBuildLeaderboard() {
  // Use server leaderboard if available (multiplayer mode)
  if (_gm._serverLeaderboard && _gm._serverLeaderboard.length > 0) {
    return _gm._serverLeaderboard.map(e => ({
      name:  e.name,
      score: e.score,
      place: e.placement,
      isYou: e.isYou,
    }));
  }

  // Bot fallback
  const BOT_POOL = (typeof BOT_NAMES !== 'undefined' ? BOT_NAMES : [])
    .concat(['VoidSlayer','CrimsonAce','PhantomX','DarkMatter','NeonRift',
             'Spectral','AbyssWalker','VoidHunter','NullByte','GhostAce',
             'StarKiller','DuskBlade','ChaosEdge','VoidEcho','NightFall']);
  const entries = [];
  _gm.botScores.forEach((score, i) => {
    entries.push({ name: BOT_POOL[i % BOT_POOL.length] || `Player${i+2}`, score, isYou: false });
  });
  entries.push({ name: gameState.playerName || 'YOU', score: _gm.score, isYou: true });
  entries.sort((a, b) => b.score - a.score);
  entries.forEach((e, i) => { e.place = i + 1; });
  return entries;
}

// ── Render leaderboard in gauntletResultsScreen ──
function _gmRenderLeaderboard(entries) {
  const lb = document.getElementById('gmLeaderboard');
  if (!lb) return;
  lb.innerHTML = entries.map(p => {
    const placeClass = p.place === 1 ? 'gm-p1' : p.place === 2 ? 'gm-p2' : p.place === 3 ? 'gm-p3' : '';
    return `<div class="gm-lb-row${p.isYou ? ' gm-lb-you' : ''}">
      <div class="gm-lb-place ${placeClass}">#${p.place}</div>
      <div class="gm-lb-name">${p.name}</div>
      ${p.isYou ? '<div class="gm-lb-you-tag">YOU</div>' : ''}
      <div class="gm-lb-score">${p.score}</div>
    </div>`;
  }).join('');
}

// ── Populate gauntletResultsScreen ──
function _gmPopulateResultsScreen(entries) {
  const el  = id => document.getElementById(id);
  const place = _gm.finalPlace;
  const gd    = gmLoadData();

  const placeEl = el('grPlace');
  if (placeEl) {
    placeEl.textContent = `#${place}`;
    placeEl.className   = 'gr-place' + (place===1?' gr-first': place===2?' gr-second': place===3?' gr-third':'');
  }
  if (el('grScore'))       el('grScore').textContent = _gm.score;
  if (el('grCorrectTaps')) el('grCorrectTaps').textContent = _gm.correctTaps;
  if (el('grWrongTaps'))   el('grWrongTaps').textContent   = _gm.wrongTaps;
  if (el('grNewMmr'))      el('grNewMmr').textContent      = gd.mmr || 0;

  const mmrEl = el('grMmrChange');
  if (mmrEl) {
    const d = _gm.mmrDelta;
    mmrEl.textContent = d >= 0 ? `+${d} MMR` : `${d} MMR`;
    mmrEl.className   = `gr-mmr-change ${d > 0 ? 'gr-mmr-pos' : d < 0 ? 'gr-mmr-neg' : 'gr-mmr-zero'}`;
  }
  const survEl = el('grSurvivalTag');
  if (survEl) {
    survEl.style.display = _gm.survivalUses > 0 ? 'block' : 'none';
    if (_gm.survivalUses > 0) survEl.textContent = `💣 Survived ×${_gm.survivalUses}`;
  }
  _gmRenderLeaderboard(entries);
}

// ── Victory screen (reuses #resultScreen) ──
function _gmShowVictoryScreen() {
  const el = id => document.getElementById(id);
  const av = typeof getActiveAvatar === 'function' ? getActiveAvatar() : { icon:'🔥', border:'#ff4500', bg:'#1a0500' };

  // Winner display
  const crownEl = el('resultCrown');
  const winnerDisplayEl = el('winnerDisplay');
  if (crownEl) crownEl.style.display = 'none';
  if (winnerDisplayEl) winnerDisplayEl.style.display = 'flex';

  const frameEl = el('winnerAvatarFrame');
  const nameEl  = el('winnerName');
  if (frameEl) {
    frameEl.textContent    = av.icon;
    frameEl.style.borderColor = av.border;
    frameEl.style.background  = av.bg;
    frameEl.style.boxShadow   = `0 0 24px ${av.border}88`;
    frameEl.classList.remove('whale-frame');
  }
  if (nameEl) { nameEl.textContent = gameState.playerName || 'YOU'; nameEl.style.color = av.border; }

  const titleEl = el('resultTitle');
  const placeEl = el('resultPlace');
  if (titleEl) { titleEl.textContent = 'VICTORY!'; titleEl.className = 'result-title win'; }
  if (placeEl) { placeEl.textContent = '#1 PLACE'; placeEl.style.color = 'var(--gold)'; }

  // MMR reward in rewards box
  if (el('rewardDiamonds')) el('rewardDiamonds').textContent = `+${_gm.mmrDelta}`;
  if (el('rewardXP')) el('rewardXP').textContent = `+${_gm.score}`;
  const capRow = el('rewardCapRow'); if (capRow) capRow.style.display = 'none';
  const itemRow = el('rewardItemRow'); if (itemRow) itemRow.style.display = 'none';
  const levelRow = el('rewardLevelRow'); if (levelRow) levelRow.style.display = 'none';
  // Relabel to Gauntlet context
  const dmdLbl = document.querySelector('#resultScreen .reward-row .reward-lbl');
  if (dmdLbl && dmdLbl.textContent.includes('Diamonds')) dmdLbl.textContent = '⚔ MMR Gain';
  const xpRow = document.querySelectorAll('#resultScreen .reward-row')[1];
  if (xpRow) { const lbl = xpRow.querySelector('.reward-lbl'); if (lbl) lbl.textContent = '🎯 Score'; }

  // Leaderboard — top 5 in resultScreen leaderboard
  const lbEl = el('leaderboard');
  if (lbEl) {
    lbEl.innerHTML = '';
    const entries = _gmBuildLeaderboard().slice(0, 5);
    const placeColors = { 1:'var(--gold)', 2:'#c0c0c0', 3:'#cd7f32' };
    entries.forEach(p => {
      const row = document.createElement('div');
      row.className = 'lb-row' + (p.isYou ? ' you-row' : '');
      row.innerHTML = `
        <div class="lb-place" style="color:${placeColors[p.place]||'var(--muted)'}">${p.place}</div>
        <div class="lb-avatar">⚔️</div>
        <div class="lb-name">${p.name}${p.isYou?` <span style="color:var(--gold);font-size:11px">(YOU)</span>`:''}
        </div>
        <div class="lb-diamond">${p.score}pts</div>`;
      lbEl.appendChild(row);
    });
  }
  const gs = el('gameSummary'); if (gs) gs.style.display = 'none';
  const hl = el('gameHighlight'); if (hl) hl.style.display = 'none';

  // Override buttons — route back to Gauntlet
  const playBtn = el('resultPlayAgainBtn');
  const menuBtn = el('resultMenuBtn');
  if (playBtn) { playBtn.textContent = '⚔ PLAY AGAIN'; playBtn.onclick = () => startGauntletLobby(); }
  if (menuBtn) { menuBtn.textContent = '⚔ SEE FULL RESULTS'; menuBtn.onclick = () => { _gmRestoreResultButtons(); showScreen('gauntletResultsScreen'); }; }

  applyVictoryScreenSkin();
  showScreen('resultScreen');
  playSound('win');
  vibrate([50, 30, 100, 30, 80]);
}

function _gmRestoreResultButtons() {
  const playBtn = document.getElementById('resultPlayAgainBtn');
  const menuBtn = document.getElementById('resultMenuBtn');
  if (playBtn) { playBtn.textContent = '⚡ PLAY AGAIN'; playBtn.onclick = () => playAgain(); }
  if (menuBtn) { menuBtn.textContent = '← MAIN MENU';  menuBtn.onclick = () => showScreen('menuScreen'); }
}

function _gmShowResults() {
  const entries = _gmBuildLeaderboard();
  _gmPopulateResultsScreen(entries);

  if (_gm.finalPlace === 1) {
    _gmShowVictoryScreen();
  } else {
    showScreen('gauntletResultsScreen');
    playSound('menu');
  }
}

// ── Mystic Gauntlet effects panel ──
function renderGauntletModeEffects() {
  const el = document.getElementById('gmEffectsPanel');
  if (!el) return;

  const equipped = gameState.gauntlet || {};
  const fingers  = Object.values(equipped).filter(Boolean);
  const effects  = gmGetRingEffects();
  const label    = getGauntletRarityLabel();
  const survChance = gmSurvivalChance();
  const allFilled  = fingers.length >= 5;

  const LABELS = {
    bonusMmr:    'Bonus MMR',
    voidTimer:   'Void Timer',
    tileSpawn:   'Tile Speed',
    plusPoints:  '+ Points',
    minusPenalty:'- Penalty',
  };

  el.innerHTML = `
    <div class="gm-effects-title">⚔ GAUNTLET MODE EFFECTS</div>
    ${GM_EFFECT_KEYS.map(k => {
      const v = effects[k] || 0;
      const pct = (v * 100).toFixed(k === 'bonusMmr' ? 1 : 0);
      return `<div class="gm-effect-row">
        <div class="gm-effect-name">${LABELS[k]}</div>
        <div class="gm-effect-val${v > 0 ? ' gm-eff-active' : ''}">${v > 0 ? '+' : ''}${pct}%</div>
      </div>`;
    }).join('')}
    <div class="gm-survival-bonus${allFilled ? '' : ' gm-surv-locked'}">
      <div class="gm-surv-label">GAUNTLET SURVIVAL BONUS</div>
      ${allFilled
        ? `<div class="gm-surv-value">${survChance}% CHANCE</div>
           <div style="font-size:9px;color:rgba(155,0,255,0.6);letter-spacing:1px;margin-top:2px;">
             ${label ? label.toUpperCase() : '—'} LEVEL
           </div>`
        : `<div class="gm-surv-value" style="opacity:0.3;">—</div>
           <div class="gm-surv-locked-msg">Equip all 5 rings to activate</div>`
      }
    </div>`;
}

// ── Mid-game leave confirmation ──
function _gmConfirmLeave() {
  if (!_gm || !_gm.active || _gm.ending) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9997;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
  overlay.innerHTML = `
    <div style="background:linear-gradient(180deg,#0d0020,#070010);border:1px solid rgba(155,0,255,0.4);border-radius:18px;padding:24px 20px;max-width:300px;width:100%;text-align:center;">
      <div style="font-size:32px;margin-bottom:10px;">⚔️</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:3px;color:#9b00ff;margin-bottom:8px;">LEAVE GAME?</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5);letter-spacing:1px;margin-bottom:20px;">Your score will count and MMR will be calculated based on your current position.</div>
      <div style="display:flex;gap:10px;">
        <button id="_gmLeaveCancel" style="flex:1;padding:12px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);cursor:pointer;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;">STAY</button>
        <button id="_gmLeaveConfirm" style="flex:1;padding:12px;border-radius:10px;background:rgba(155,0,255,0.15);border:1px solid rgba(155,0,255,0.4);color:#fff;cursor:pointer;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;">LEAVE</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#_gmLeaveCancel').onclick  = () => document.body.removeChild(overlay);
  overlay.querySelector('#_gmLeaveConfirm').onclick = () => { document.body.removeChild(overlay); _gmEndGame(); };
  overlay.onclick = e => { if (e.target === overlay) document.body.removeChild(overlay); };
}

// ── Single ring effect lookup (used by inventory, equip picker, spin popup) ──
function gmGetSingleRingEffect(ringId) {
  const ring = getRingDef(ringId);
  if (!ring) return null;
  const vals = GM_EFFECT_VALS[ring.rarityId] || GM_EFFECT_VALS.common;
  let hash = 0;
  for (let i = 0; i < ringId.length; i++) hash = ((hash << 5) - hash + ringId.charCodeAt(i)) | 0;
  const key = GM_EFFECT_KEYS[Math.abs(hash) % GM_EFFECT_KEYS.length];
  const val = vals[key];
  const LABELS = {
    bonusMmr:    'Bonus MMR',
    voidTimer:   'Void Timer',
    tileSpawn:   'Tile Speed',
    plusPoints:  'Score+',
    minusPenalty:'Penalty−',
  };
  const pct = key === 'bonusMmr'
    ? `+${(val * 100).toFixed(1)}%`
    : `+${Math.round(val * 100)}%`;
  return { key, label: LABELS[key] || key, pct };
}

