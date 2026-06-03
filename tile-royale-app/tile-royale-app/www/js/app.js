window.onerror = function(msg, src, line, col, err) {
  const toast = document.getElementById('toastMsg') || document.body;
  const text = msg + ' | L' + line + ':' + col;
  console.error('[CRASH]', text, err);
  // Show on screen
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ff0033;color:#fff;padding:8px;font-size:11px;z-index:99999;word-break:break-all;';
  div.textContent = text;
  document.body.appendChild(div);
  // Keep error visible - tap to dismiss
  div.onclick = () => div.remove();
  return false;
};
// ===== PERSISTENT PLAYER IDENTITY =====
// If user is signed in with Google, their ID is used (survives reinstall).
// Otherwise falls back to a device-local UUID.
if (!localStorage.getItem('tr_player_id')) {
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
  localStorage.setItem('tr_player_id', uuid);
}
const _googleId = localStorage.getItem('tr_google_id');
let PLAYER_ID = _googleId
  ? `google_${_googleId}`
  : localStorage.getItem('tr_player_id');

// ===== STATE =====

// ── EARLY DECLARATIONS (moved for hoisting) ──
let activeSkins = {
  table: 'table_dark',
  tile: 'tile_dark',
  tileeffect: 'fx_fire',
  tapeffect: 'tap_ripple'
};

let selectedItems = new Set();
let miniAnimIntervals = {};
let storePendingCb = null;
let customLobbyIsPublic   = false;
let customLobbyFillInterval = null;
let spectatorCode    = null;
let selectedRegion  = 'AUTO'; // set properly on settings load
let colyseusClient  = null;
let currentRoom     = null;
let isMultiplayer   = false;
let mpListenersActive = false; // set false to instantly stop all room listeners
let roundActive = false;
let burnScheduled = false;
let roundPlayerCount = 0; // how many players must tap each round
let playerTilesLeft = 0;  // buckshot: how many tiles player still needs to tap
// ── Buckshot wave state ──
let buckshotWaveStart      = 0;   // timestamp when current wave ignited
let buckshotActiveTileCount = 0;  // tiles ignited this wave
let buckshotPlayerCleared  = 0;   // tiles THIS player cleared this wave
let buckshotCompletions    = [];  // [{id, name, avatar, completionMs}] in finish order
let buckshotBotCleared     = {};  // {playerArrayIdx: tilesCleared this wave}
let buckshotAlivePlayers   = 0;   // alive participants at wave start
let muscleRelaxantActive  = false;
let muscleRelaxantPrimed  = false;
// ── END EARLY DECLARATIONS ──
let tapOrder = [];       // ordered list of who tapped: -1 = human, botIdx = allPlayers index
const DEFAULT_SETTINGS = {
  sfx: true,
  music: true,
  volume: 80,
  vibration: true,
  autojoin: true,
  wakelock: true,
  animSpeed: 'normal',
  colorblind: false,
  dailyReminder: true,
  ticketAlert: true,
};


let settings = typeof DEFAULT_SETTINGS !== "undefined" ? { ...DEFAULT_SETTINGS } : {};

// ===== INVENTORY & PROGRESSION SYSTEM =====
// ===== AVATAR SYSTEM =====
const AVATARS = {
  // Default — always available
  default: [
    { id:'av_flame',   icon:'🔥', name:'Flame',      border:'#ff4500', bg:'#1a0500',  unlock:'default' },
    { id:'av_ghost',   icon:'👻', name:'Ghost',      border:'#555570', bg:'#111120',  unlock:'default' },
    { id:'av_robot',   icon:'🤖', name:'Robot',      border:'#334466', bg:'#050a1a',  unlock:'default' },
    { id:'av_wolf',    icon:'🐺', name:'Wolf',       border:'#443322', bg:'#150e06',  unlock:'default' },
    { id:'av_dragon',  icon:'🐉', name:'Dragon',     border:'#336633', bg:'#051405',  unlock:'default' },
    { id:'av_skull',   icon:'💀', name:'Skull',      border:'#444444', bg:'#111111',  unlock:'default' },
  ],
  // Achievement unlocks
  achievement: [
    { id:'av_crown',   icon:'👑', name:'Crown',      border:'#ffd700', bg:'#1a1400',  unlock:'on_fire',      unlockDesc:'Win 10 games' },
    { id:'av_lightning',icon:'⚡',name:'Lightning',  border:'#dddd00', bg:'#1a1a00',  unlock:'hat_trick',    unlockDesc:'Win 3 in a row' },
    { id:'av_trophy',  icon:'🏆', name:'Trophy',     border:'#ff8c00', bg:'#1a0a00',  unlock:'centurion',    unlockDesc:'Win 100 games' },
    { id:'av_diamond', icon:'💎', name:'Diamond',    border:'#00e5ff', bg:'#001a1a',  unlock:'diamond_hands',unlockDesc:'100k diamonds' },
    { id:'av_star',    icon:'🌟', name:'Star',       border:'#ffdd00', bg:'#1a1500',  unlock:'grand_master', unlockDesc:'Win 500 games' },
    { id:'av_legend',  icon:'🌌', name:'Legend',     border:'#8800ff', bg:'#0d0030',  unlock:'true_champion',unlockDesc:'Top 3 x1000' },
    { id:'av_phoenix', icon:'🦅', name:'Phoenix',    border:'#ff4500', bg:'#1a0500',  unlock:'unstoppable',  unlockDesc:'10 wins in a row' },
    { id:'av_void',    icon:'🌑', name:'Void',       border:'#440066', bg:'#050005',  unlock:'untouchable',  unlockDesc:'50 wins in a row' },
    { id:'av_secret',  icon:'👁️', name:'The Eye',   border:'#b464ff', bg:'#0a0015',  unlock:'ghost_tap',    unlockDesc:'Secret achievement' },
  ],
  // KOTH exclusive
  koth: [
    { id:'av_koth', icon:'👑', name:'KOTH King', border:'#ffd700', bg:'#1a1200', unlock:'koth_top3', unlockDesc:'Achieve KOTH Top 3', kothCounter:true },
  ],
  // Bundle unlocks
  bundle: [
    { id:'av_fire_lord',icon:'🌋', name:'Fire Lord',  border:'#ff6600', bg:'#1a0300',  unlock:'bundle.fire',      unlockDesc:'Fire Pack' },
    { id:'av_champion', icon:'⚔️', name:'Champion',   border:'#ffd700', bg:'#1a1400',  unlock:'bundle.champion',  unlockDesc:'Champion Bundle' },
    { id:'av_legend2',  icon:'🌠', name:'Aurora',     border:'#00aaff', bg:'#001020',  unlock:'bundle.legend',    unlockDesc:'Legend Bundle' },
  ],
  // Whale exclusive
  whale: [
    { id:'av_whale',    icon:'🐋', name:'Whale',       border:'#00e5ff', bg:'#001525',  unlock:'bundle.whale1', unlockDesc:'Whale Pack',       whaleBorder:true },
    { id:'av_ocean',    icon:'🌊', name:'Deep Ocean',  border:'#00e5ff', bg:'#000d1a',  unlock:'bundle.whale2', unlockDesc:'Deep Ocean Bundle',whaleBorder:true },
    { id:'av_obsidian', icon:'🖤', name:'Obsidian',    border:'#00e5ff', bg:'#050005',  unlock:'bundle.whale2', unlockDesc:'Deep Ocean Bundle',whaleBorder:true },
  ],
  // Solo Mode exclusive avatars — unlocked via star milestones
  solo: [
    { id:'av_solo_bullseye', icon:'🎯', name:'Bullseye',    border:'#ff4500', bg:'#1a0500', unlock:'solo_50stars',  unlockDesc:'50 Solo ⭐ needed' },
    { id:'av_solo_reaper',   icon:'💀', name:'Solo Reaper', border:'#555555', bg:'#111111', unlock:'solo_100stars', unlockDesc:'100 Solo ⭐ needed' },
    { id:'av_solo_star',     icon:'⭐', name:'Star Chaser', border:'#ffd700', bg:'#1a1400', unlock:'solo_150stars', unlockDesc:'150 Solo ⭐ needed' },
  ],
};

// Flat list for easy lookup
const ALL_AVATARS = Object.values(AVATARS).flat();

function getActiveAvatar() {
  const id = gameState.activeAvatar || 'av_flame';
  return ALL_AVATARS.find(a => a.id === id) || ALL_AVATARS[0];
}

function isAvatarOwned(av) {
  if (av.unlock === 'default') return true;
  if (!gameState.ownedAvatars) return false;
  return gameState.ownedAvatars.includes(av.id);
}

function unlockAvatar(id) {
  if (!gameState.ownedAvatars) gameState.ownedAvatars = [];
  if (!gameState.ownedAvatars.includes(id)) {
    gameState.ownedAvatars.push(id);
    const av = ALL_AVATARS.find(a => a.id === id);
    if (av) showToast(`🖼️ New avatar unlocked: ${av.name}!`, av.border);
    saveState();
  }
}

const ITEM_TYPES = {
  crystal:     { name: 'Crystal Ball', icon: '🔮' },
  caltrops:    { name: 'Caltrops',     icon: '⚙️' },
  shadow_tile:  { name: 'Shadow Tile',   icon: '🌑' },
  pepper_spray:    { name: 'Pepper Spray',     icon: '🌶️' },
  muscle_relaxant: { name: 'Muscle Relaxant', icon: '💊' },
};

// Sqrt progression: early levels feel fast and rewarding, slows naturally after level 10.
// Intentionally front-loaded — dopamine pacing is critical in a competitive reaction-time game.
// Participation XP exists so even losing feels worthwhile; players return and improve.
// Breakpoints: L2=120, L3=480, L5=1920, L10=9720, L12=14520, L20=43320
function getLevelFromXP(xp) {
  return Math.floor(Math.sqrt((xp || 0) / 120)) + 1;
}
function getXPForLevel(level) {
  return Math.pow((level || 1) - 1, 2) * 120;
}

function loadState() {
  try {
    const saved = localStorage.getItem('tileRoyaleState');
    if (!saved) return null;
    // New encrypted format has a '.' separator
    if (saved.includes('.') && !saved.startsWith('{')) {
      const [encPart, lenPart] = saved.split('.');
      const key = 'TileRoyale2025';
      const xored = atob(encPart);
      let enc = '';
      for (let i = 0; i < xored.length; i++) {
        enc += String.fromCharCode(xored.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      const raw = decodeURIComponent(escape(atob(enc)));
      const expectedLen = parseInt(atob(lenPart), 10);
      if (isNaN(expectedLen) || Math.abs(raw.length - expectedLen) > 5) {
        console.warn('[SaveState] Checksum mismatch — possible tampering');
        return null;
      }
      return JSON.parse(raw);
    }
    // Fallback: plain JSON (old saves)
    return JSON.parse(saved);
  } catch(e) {
    console.warn('[SaveState] Load failed:', e);
    return null;
  }
}

function saveState() {
  gameState._localSavedAt = Date.now(); // timestamp used by cloud save to determine newest
  try {
    const raw = JSON.stringify(gameState);
    const key = 'TileRoyale2025';
    const enc = btoa(unescape(encodeURIComponent(raw)));
    let xored = '';
    for (let i = 0; i < enc.length; i++) {
      xored += String.fromCharCode(enc.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    const payload = btoa(xored) + '.' + btoa(String(raw.length));
    localStorage.setItem('tileRoyaleState', payload);
  } catch(e) {
    // Fallback: plain save
    try { localStorage.setItem('tileRoyaleState', JSON.stringify(gameState)); } catch(e2) {}
  }
  // Debounced cloud upload — covers all triggers (match end, achievement, purchase, etc.)
  if (typeof scheduleSaveToCloud === 'function') scheduleSaveToCloud();
}

function claimDailyItems() {
  const today = new Date().toDateString();
  if (gameState.lastDailyClaim === today) return false;
  gameState.lastDailyClaim = today;
  Object.keys(ITEM_TYPES).forEach(id => {
    gameState.inventory[id] = (gameState.inventory[id] || 0) + 1;
  });
  saveState();
  return true;
}

function addItemToInventory(id, count = 1) {
  gameState.inventory[id] = (gameState.inventory[id] || 0) + count;
  saveState();
  updateInventoryUI();
}

function useItem(id) {
  if ((gameState.inventory[id] || 0) <= 0) return false;
  gameState.inventory[id]--;
  saveState();
  updateInventoryUI();
  return true;
}

function awardLevelUp() {
  const prevLevel = gameState.level || 1;
  const newLevel  = getLevelFromXP(gameState.xp || 0);
  gameState.level = newLevel;
  if (newLevel > prevLevel) {
    Object.keys(ITEM_TYPES).forEach(id => addItemToInventory(id, 1));
    onLevelUp(newLevel);
    playSound('levelup');
  }
}

function updateInventoryUI() {
  Object.keys(ITEM_TYPES).forEach(id => {
    const count = gameState.inventory[id] || 0;
    // Update wild screen item badge
    const badge = document.querySelector(`#item-${id} .item-badge`);
    if (badge) badge.textContent = `x${count} owned`;
    // Update wild screen card — grey out if 0
    const card = document.getElementById(`item-${id}`);
    if (card) {
      if (count <= 0) {
        card.style.opacity = '0.4';
        card.style.pointerEvents = 'none';
        if (selectedItems.has(id)) {
          selectedItems.delete(id);
          card.classList.remove('selected');
        }
      } else {
        card.style.opacity = '';
        card.style.pointerEvents = '';
      }
    }
  });

  // Update HUD counts in game
  const hudC = document.getElementById('hudCrystalCount');
  const hudCalt = document.getElementById('hudCaltropsCount');
  const hudSD = document.getElementById('hudShadowTileCount');
  if (hudC) hudC.textContent = `x${gameState.inventory.crystal || 0}`;
  if (hudCalt) hudCalt.textContent = `x${gameState.inventory.caltrops || 0}`;
  if (hudSD) hudSD.textContent = `x${gameState.inventory.shadow_tile || 0}`;
  const hudPP = document.getElementById('hudPepperSprayCount');
  if (hudPP) hudPP.textContent = 'x' + (gameState.inventory.pepper_spray || 0);
}

// Init gameState with saved data or defaults
const savedState = loadState();
let gameState = savedState || {
  mode: 'rush',
  gridSize: 25,
  players: 10,
  diamonds: 500,
  wins: 0,
  games: 0,
  tickets: 10,
  xp: 0,
  level: 1,
  inventory: { crystal: 3, caltrops: 3, shadow_tile: 3, pepper_spray: 2, muscle_relaxant: 2 },
  lastDailyClaim: null,
  playerName: 'Player',
  renames: 0,
  ownedSkins: {},
  activeSkins: { table: 'table_dark', tile: 'tile_dark', tileeffect: 'fx_fire', tapeffect: 'tap_ripple' }
};
// Always reset mode/gridSize/players to defaults
gameState.mode = 'rush';
gameState.gridSize = 25;
gameState.players = 10;
// Correct stale values from old saves
if ((gameState.diamonds || 0) > 10000 && !gameState._corrected) {
  gameState.diamonds = 500;
  gameState._corrected = true;
}
if ((gameState.tickets || 0) > 10) {
  gameState.tickets = 10;
}

let gameLoop = null;
let timerInterval = null;
let lobbyInterval = null;
let lobbyFillInterval = null;
let lobbySearchTimeout = null;
let timeLeft = 60;
let playersLeft = 10;
let playerEliminated = false;
let playerPlace = 1;
let currentBurningTile = null;
let burnTimeout = null;
const RARITY_ORDER = ['secret','legendary','epic','rare','uncommon','common'];
const RING_ACHIEVEMENTS = [
  // Collection count
  {id:'ra_collect5',   cat:'collect',  label:'Collect 5 rings',              goal:5,   stat:'invSize',   reward:15},
  {id:'ra_collect10',  cat:'collect',  label:'Collect 10 rings',             goal:10,  stat:'invSize',   reward:30},
  {id:'ra_collect25',  cat:'collect',  label:'Collect 25 rings',             goal:25,  stat:'invSize',   reward:75},
  {id:'ra_collect50',  cat:'collect',  label:'Collect 50 rings',             goal:50,  stat:'invSize',   reward:150},
  {id:'ra_collect100', cat:'collect',  label:'Collect 100 rings',            goal:100, stat:'invSize',   reward:300},
  // By rarity
  {id:'ra_uncommon',   cat:'rarity',   label:'Find your first UNCOMMON',     goal:1,   stat:'uncommon',  reward:10},
  {id:'ra_rare',       cat:'rarity',   label:'Find your first RARE',         goal:1,   stat:'rare',      reward:30},
  {id:'ra_rare5',      cat:'rarity',   label:'Collect 5 RARE+ rings',        goal:5,   stat:'rare',      reward:80},
  {id:'ra_epic',       cat:'rarity',   label:'Find your first EPIC',         goal:1,   stat:'epic',      reward:80},
  {id:'ra_epic3',      cat:'rarity',   label:'Collect 3 EPIC+ rings',        goal:3,   stat:'epic',      reward:150},
  {id:'ra_legendary',  cat:'rarity',   label:'Find your first LEGENDARY',    goal:1,   stat:'legendary', reward:200},
  {id:'ra_legendary2', cat:'rarity',   label:'Collect 2 LEGENDARY rings',    goal:2,   stat:'legendary', reward:400},
  {id:'ra_secret',     cat:'rarity',   label:'Find your first SECRET',       goal:1,   stat:'secret',    reward:500},
  // Gauntlet combined level
  {id:'ra_gauntrare',  cat:'gauntlet', label:'Gauntlet combined level: RARE',      goal:1, stat:'gauntRare', reward:50},
  {id:'ra_gauntepic',  cat:'gauntlet', label:'Gauntlet combined level: EPIC',      goal:1, stat:'gauntEpic', reward:120},
  {id:'ra_gauntlegend',cat:'gauntlet', label:'Gauntlet combined level: LEGENDARY', goal:1, stat:'gauntLeg',  reward:300},
  {id:'ra_gauntsecret',cat:'gauntlet', label:'Gauntlet combined level: SECRET',    goal:1, stat:'gauntSec',  reward:1000},
  // Slots filled
  {id:'ra_slots3',     cat:'gauntlet', label:'Fill 3 finger slots',                goal:3, stat:'slotsUsed', reward:40},
  {id:'ra_slots5',     cat:'gauntlet', label:'Fill all 5 finger slots',            goal:5, stat:'slotsUsed', reward:100},
  // Trading
  {id:'ra_trade1',     cat:'trade',    label:'Complete your first P2P trade',       goal:1, stat:'trades',    reward:75},
  {id:'ra_trade5',     cat:'trade',    label:'Complete 5 P2P trades',               goal:5, stat:'trades',    reward:200},
];
let gameSessionId = 0; // incremented each game start, callbacks check this to self-cancel
let botTapTimeouts = []; // declared early to prevent ReferenceError in cleanup
let botBurnInterval = null;
let tileStates = []; // 'idle', 'burning', 'tapped', 'missed'
let gridLocked = false;
let allPlayers = [];

// Inactivity timer
let inactivityTimer = null;
let inactivitySecsLeft = 5;
let lastTapTime = 0;

// Buckshot: multiple burning tiles
let burningTiles = []; // array of active burning tile indices
let shadowTileActive = false;
let pepperSprayActive = false;
let pepperSprayPrimed = false;
let pepperFakeTileIndices = [];
let itemShadowTileUsed = false;
let caltropsPrimed = false;   // player has toggled caltrops ON for next tap
let shadowTilePrimed = false; // player has toggled shadow tile ON for next round

// ===== SOLO MODE =====
const SOLO_LEVELS = [
  { level:  1, grid:'2x2', speed:1500, bombs:0, difficulty: 1, tiles:18 },
  { level:  2, grid:'2x2', speed:1400, bombs:0, difficulty: 1, tiles:20 },
  { level:  3, grid:'2x2', speed:1300, bombs:0, difficulty: 1, tiles:21 },
  { level:  4, grid:'2x2', speed:1200, bombs:0, difficulty: 1, tiles:23 },
  { level:  5, grid:'2x2', speed:1100, bombs:0, difficulty: 1, tiles:25 },
  { level:  6, grid:'2x2', speed:1000, bombs:0, difficulty: 1, tiles:27 },
  { level:  7, grid:'2x2', speed: 900, bombs:0, difficulty: 2, tiles:30 },
  { level:  8, grid:'2x2', speed: 800, bombs:1, difficulty: 2, tiles:34 },
  { level:  9, grid:'2x2', speed: 700, bombs:1, difficulty: 3, tiles:39 },
  { level: 10, grid:'3x3', speed:1000, bombs:0, difficulty: 2, tiles:27 },
  { level: 11, grid:'3x3', speed: 950, bombs:0, difficulty: 2, tiles:29 },
  { level: 12, grid:'3x3', speed: 900, bombs:0, difficulty: 2, tiles:30 },
  { level: 13, grid:'3x3', speed: 850, bombs:0, difficulty: 2, tiles:32 },
  { level: 14, grid:'3x3', speed: 800, bombs:0, difficulty: 3, tiles:34 },
  { level: 15, grid:'3x3', speed: 750, bombs:0, difficulty: 3, tiles:36 },
  { level: 16, grid:'3x3', speed: 700, bombs:0, difficulty: 3, tiles:39 },
  { level: 17, grid:'3x3', speed: 650, bombs:1, difficulty: 3, tiles:42 },
  { level: 18, grid:'3x3', speed: 600, bombs:1, difficulty: 4, tiles:45 },
  { level: 19, grid:'3x3', speed: 580, bombs:2, difficulty: 4, tiles:47 },
  { level: 20, grid:'3x3', speed: 560, bombs:2, difficulty: 4, tiles:49 },
  { level: 21, grid:'4x4', speed: 900, bombs:0, difficulty: 3, tiles:30 },
  { level: 22, grid:'4x4', speed: 870, bombs:0, difficulty: 3, tiles:32 },
  { level: 23, grid:'4x4', speed: 840, bombs:0, difficulty: 3, tiles:33 },
  { level: 24, grid:'4x4', speed: 810, bombs:0, difficulty: 3, tiles:34 },
  { level: 25, grid:'4x4', speed: 780, bombs:0, difficulty: 3, tiles:35 },
  { level: 26, grid:'4x4', speed: 750, bombs:0, difficulty: 4, tiles:36 },
  { level: 27, grid:'4x4', speed: 720, bombs:0, difficulty: 4, tiles:38 },
  { level: 28, grid:'4x4', speed: 700, bombs:1, difficulty: 4, tiles:39 },
  { level: 29, grid:'4x4', speed: 680, bombs:1, difficulty: 4, tiles:40 },
  { level: 30, grid:'4x4', speed: 660, bombs:1, difficulty: 4, tiles:41 },
  { level: 31, grid:'4x4', speed: 640, bombs:1, difficulty: 5, tiles:43 },
  { level: 32, grid:'4x4', speed: 620, bombs:1, difficulty: 5, tiles:44 },
  { level: 33, grid:'4x4', speed: 600, bombs:2, difficulty: 5, tiles:45 },
  { level: 34, grid:'4x4', speed: 585, bombs:2, difficulty: 5, tiles:47 },
  { level: 35, grid:'4x4', speed: 570, bombs:2, difficulty: 5, tiles:48 },
  { level: 36, grid:'4x4', speed: 560, bombs:2, difficulty: 5, tiles:49 },
  { level: 37, grid:'4x4', speed: 555, bombs:3, difficulty: 6, tiles:49 },
  { level: 38, grid:'4x4', speed: 552, bombs:3, difficulty: 6, tiles:49 },
  { level: 39, grid:'4x4', speed: 550, bombs:3, difficulty: 6, tiles:50 },
  { level: 40, grid:'5x5', speed: 900, bombs:0, difficulty: 5, tiles:30 },
  { level: 41, grid:'5x5', speed: 870, bombs:0, difficulty: 5, tiles:32 },
  { level: 42, grid:'5x5', speed: 840, bombs:0, difficulty: 5, tiles:33 },
  { level: 43, grid:'5x5', speed: 810, bombs:0, difficulty: 5, tiles:34 },
  { level: 44, grid:'5x5', speed: 790, bombs:0, difficulty: 5, tiles:35 },
  { level: 45, grid:'5x5', speed: 770, bombs:1, difficulty: 6, tiles:36 },
  { level: 46, grid:'5x5', speed: 750, bombs:1, difficulty: 6, tiles:36 },
  { level: 47, grid:'5x5', speed: 730, bombs:1, difficulty: 6, tiles:37 },
  { level: 48, grid:'5x5', speed: 710, bombs:1, difficulty: 6, tiles:39 },
  { level: 49, grid:'5x5', speed: 690, bombs:1, difficulty: 6, tiles:40 },
  { level: 50, grid:'5x5', speed: 670, bombs:2, difficulty: 6, tiles:41 },
  { level: 51, grid:'5x5', speed: 650, bombs:2, difficulty: 6, tiles:42 },
  { level: 52, grid:'5x5', speed: 630, bombs:2, difficulty: 7, tiles:43 },
  { level: 53, grid:'5x5', speed: 615, bombs:2, difficulty: 7, tiles:44 },
  { level: 54, grid:'5x5', speed: 600, bombs:2, difficulty: 7, tiles:45 },
  { level: 55, grid:'5x5', speed: 585, bombs:3, difficulty: 7, tiles:47 },
  { level: 56, grid:'5x5', speed: 570, bombs:3, difficulty: 7, tiles:48 },
  { level: 57, grid:'5x5', speed: 558, bombs:3, difficulty: 7, tiles:49 },
  { level: 58, grid:'5x5', speed: 545, bombs:3, difficulty: 7, tiles:50 },
  { level: 59, grid:'5x5', speed: 535, bombs:3, difficulty: 7, tiles:51 },
  { level: 60, grid:'5x5', speed: 525, bombs:3, difficulty: 7, tiles:52 },
  { level: 61, grid:'5x5', speed: 515, bombs:4, difficulty: 8, tiles:53 },
  { level: 62, grid:'5x5', speed: 508, bombs:4, difficulty: 8, tiles:54 },
  { level: 63, grid:'5x5', speed: 504, bombs:4, difficulty: 8, tiles:54 },
  { level: 64, grid:'5x5', speed: 502, bombs:4, difficulty: 8, tiles:54 },
  { level: 65, grid:'5x5', speed: 500, bombs:4, difficulty: 8, tiles:54 },
  { level: 66, grid:'5x5', speed: 495, bombs:5, difficulty: 8, tiles:55 },
  { level: 67, grid:'5x5', speed: 492, bombs:5, difficulty: 8, tiles:55 },
  { level: 68, grid:'5x5', speed: 490, bombs:5, difficulty: 8, tiles:56 },
  { level: 69, grid:'5x5', speed: 488, bombs:5, difficulty: 8, tiles:56 },
  { level: 70, grid:'6x6', speed: 850, bombs:2, difficulty: 7, tiles:32 },
  { level: 71, grid:'6x6', speed: 830, bombs:2, difficulty: 7, tiles:33 },
  { level: 72, grid:'6x6', speed: 810, bombs:2, difficulty: 7, tiles:34 },
  { level: 73, grid:'6x6', speed: 790, bombs:2, difficulty: 7, tiles:35 },
  { level: 74, grid:'6x6', speed: 770, bombs:2, difficulty: 7, tiles:36 },
  { level: 75, grid:'6x6', speed: 750, bombs:2, difficulty: 7, tiles:36 },
  { level: 76, grid:'6x6', speed: 730, bombs:3, difficulty: 7, tiles:37 },
  { level: 77, grid:'6x6', speed: 710, bombs:3, difficulty: 8, tiles:39 },
  { level: 78, grid:'6x6', speed: 695, bombs:3, difficulty: 8, tiles:39 },
  { level: 79, grid:'6x6', speed: 680, bombs:3, difficulty: 8, tiles:40 },
  { level: 80, grid:'6x6', speed: 665, bombs:3, difficulty: 8, tiles:41 },
  { level: 81, grid:'6x6', speed: 650, bombs:4, difficulty: 8, tiles:42 },
  { level: 82, grid:'6x6', speed: 635, bombs:4, difficulty: 8, tiles:43 },
  { level: 83, grid:'6x6', speed: 622, bombs:4, difficulty: 8, tiles:44 },
  { level: 84, grid:'6x6', speed: 610, bombs:4, difficulty: 8, tiles:45 },
  { level: 85, grid:'6x6', speed: 598, bombs:5, difficulty: 9, tiles:46 },
  { level: 86, grid:'6x6', speed: 586, bombs:5, difficulty: 9, tiles:47 },
  { level: 87, grid:'6x6', speed: 575, bombs:5, difficulty: 9, tiles:47 },
  { level: 88, grid:'6x6', speed: 565, bombs:5, difficulty: 9, tiles:48 },
  { level: 89, grid:'6x6', speed: 555, bombs:5, difficulty: 9, tiles:49 },
  { level: 90, grid:'6x6', speed: 545, bombs:6, difficulty: 9, tiles:50 },
  { level: 91, grid:'6x6', speed: 535, bombs:6, difficulty: 9, tiles:51 },
  { level: 92, grid:'6x6', speed: 527, bombs:6, difficulty: 9, tiles:52 },
  { level: 93, grid:'6x6', speed: 520, bombs:6, difficulty: 9, tiles:52 },
  { level: 94, grid:'6x6', speed: 513, bombs:6, difficulty: 9, tiles:53 },
  { level: 95, grid:'6x6', speed: 506, bombs:7, difficulty:10, tiles:54 },
  { level: 96, grid:'6x6', speed: 500, bombs:7, difficulty:10, tiles:54 },
  { level: 97, grid:'6x6', speed: 493, bombs:7, difficulty:10, tiles:55 },
  { level: 98, grid:'6x6', speed: 476, bombs:7, difficulty:10, tiles:57 },
  { level: 99, grid:'6x6', speed: 448, bombs:7, difficulty:10, tiles:61 },
  { level:100, grid:'6x6', speed: 420, bombs:8, difficulty:10, tiles:65 },
];

