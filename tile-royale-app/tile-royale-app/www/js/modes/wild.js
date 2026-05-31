// ===== WILD MODE ITEMS =====
let itemCrystalUsed = false;
let itemCaltropsUsed = false;
let crystalCandidates = [];

// ═══════════════════════════════════════════════
// TILE ROYALE — THEME ENGINE
// ═══════════════════════════════════════════════

const THEMES = [
  {
    id:    'default',
    name:  'Classic',
    desc:  'The original Tile Royale experience',
    price: 0,
    emoji: '🔥',
    preview: ['#1a1a25','#ff4500','#1a1a25','#222230'],
    previewBurn: '#ff4500',
    owned: true,
  },
  {
    id:    'pimple',
    name:  'Pimple Popper',
    desc:  'Gross-satisfying skin tiles. Pop \'em all!',
    price: 5000,
    emoji: '🩹',
    preview: ['#c4623a','#ff3300','#c4623a','#a04020'],
    previewBurn: '#ff3300',
  },
  {
    id:    'eye',
    name:  'Eye Popper',
    desc:  'Creepy cartoon eyeballs. Are they watching you?',
    price: 5000,
    emoji: '👁️',
    preview: ['#d4c49a','#cc2200','#d4c49a','#a09060'],
    previewBurn: '#cc2200',
  },
  {
    id:    'bug',
    name:  'Bug Squasher',
    desc:  'Squash the bugs before they squash you!',
    price: 5000,
    emoji: '🐛',
    preview: ['#2a5a1a','#ff4400','#2a5a1a','#1a4a0a'],
    previewBurn: '#ff4400',
  },
  {
    id:    'cosmic',
    name:  'Cosmic Popper',
    desc:  'Planets, nebulas and supernovas. Space is on fire.',
    price: 5000,
    emoji: '🌌',
    preview: ['#1a0a3a','#ff8800','#1a0a3a','#0a0520'],
    previewBurn: '#ff8800',
  },
  {
    id:    'fruit',
    name:  'Fruit Popper',
    desc:  'Juicy, fresh and satisfying. Tap before it over-ripens!',
    price: 5000,
    emoji: '🍓',
    preview: ['#3a7a14','#ff4400','#3a7a14','#2a6a0a'],
    previewBurn: '#ff4400',
  },
];

function getActiveTheme() { return gameState.activeTheme || 'default'; }

function applyTheme(themeId) {
  const body   = document.body;
  const game   = document.getElementById('gameScreen');
  const lobby  = document.getElementById('lobbyScreen');

  // Remove all theme classes
  ['pimple','eye','bug','cosmic','fruit'].forEach(t => {
    body.classList.remove('theme-' + t);
    body.classList.remove('theme-active');
  });

  if (themeId && themeId !== 'default') {
    body.classList.add('theme-' + themeId);
    body.classList.add('theme-active');
  }

  gameState.activeTheme = themeId || 'default';
  saveState();
}

function buyTheme(themeId) {
  const theme = THEMES.find(t => t.id === themeId);
  if (!theme) return;
  if (!gameState.ownedThemes) gameState.ownedThemes = ['default'];
  if (gameState.ownedThemes.includes(themeId)) {
    // Already owned — just activate
    applyTheme(themeId);
    showToast('🎨 ' + theme.name + ' activated!', 'var(--green)');
    renderThemeStore();
    return;
  }
  if (theme.price === 0) {
    // Free theme — no confirm needed
    gameState.ownedThemes.push(themeId);
    applyTheme(themeId);
    saveState();
    showToast('🎨 ' + theme.name + ' activated!', 'var(--green)');
    renderThemeStore();
    return;
  }
  if ((gameState.diamonds || 0) < theme.price) {
    showToast('💎 Need ' + theme.price + ' diamonds!', 'var(--red)');
    return;
  }
  // Confirm buy
  showConfirmDialog(
    '🎨 ' + theme.name,
    theme.price + ' 💎',
    () => {
      gameState.diamonds -= theme.price;
      gameState.ownedThemes.push(themeId);
      applyTheme(themeId);
      saveState();
      showToast('🎨 ' + theme.name + ' unlocked!', 'var(--green)');
      renderThemeStore();
      updateMenuStats();
    }
  );
}

function renderThemeStore() {
  const grid = document.getElementById('skinGrid-theme');
  if (!grid) return;
  if (!gameState.ownedThemes) gameState.ownedThemes = ['default'];
  const activeTheme = getActiveTheme();
  const diamonds    = gameState.diamonds || 0;

  grid.innerHTML = '<div style="font-size:12px;color:var(--muted);letter-spacing:2px;margin-bottom:4px;">🎨 VISUAL THEMES — Transform your entire game experience</div>';

  (THEMES||[]).forEach(theme => {
    const owned  = gameState.ownedThemes.includes(theme.id);
    const active = activeTheme === theme.id;
    const canAfford = diamonds >= theme.price;

    const card = document.createElement('div');
    card.className = 'theme-card' + (owned ? ' owned' : '') + (active ? ' active-theme' : '');

    // 2x2 preview grid
    const previewHtml = theme.preview.map((col, i) =>
      '<div class="theme-preview-tile" style="background:' + col + ';' +
        (i === 1 ? 'box-shadow:0 0 6px ' + theme.previewBurn + ';' : '') +
      '"></div>'
    ).join('');

    const badgeHtml = active
      ? '<div class="theme-card-badge active">✓ ACTIVE</div>'
      : owned
        ? '<div class="theme-card-badge owned">OWNED</div>'
        : '<div class="theme-card-badge locked">💎 ' + theme.price.toLocaleString() + '</div>';

    card.innerHTML =
      '<div class="theme-card-preview" style="background:#0a0a0f;">' + previewHtml + '</div>' +
      '<div class="theme-card-info">' +
        '<div class="theme-card-name">' + theme.emoji + ' ' + theme.name + '</div>' +
        '<div class="theme-card-desc">' + theme.desc + '</div>' +
        (owned
          ? '<div class="theme-card-price" style="color:var(--green);">' + (active ? '✓ Active theme' : 'Tap to activate') + '</div>'
          : '<div class="theme-card-price">💎 ' + theme.price.toLocaleString() + '</div>'
        ) +
      '</div>' +
      badgeHtml;

    card.onclick = () => buyTheme(theme.id);
    grid.appendChild(card);
  });
}

function showConfirmDialog(title, price, onConfirm) {
  // In-game confirm dialog — works in WebView (no window.confirm)
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:24px;max-width:320px;width:100%;text-align:center;">
      <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:2px;margin-bottom:8px;">${title}</div>
      <div style="color:var(--diamond);font-family:'Bebas Neue',sans-serif;font-size:28px;margin-bottom:20px;">${price}</div>
      <div style="display:flex;gap:10px;">
        <button id="_confirmNo"  style="flex:1;padding:12px;background:rgba(255,255,255,0.06);border:1px solid var(--border);border-radius:10px;color:var(--muted);font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:1px;cursor:pointer;">CANCEL</button>
        <button id="_confirmYes" style="flex:1;padding:12px;background:var(--fire);border:none;border-radius:10px;color:#fff;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:1px;cursor:pointer;">BUY</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#_confirmYes').onclick = () => { document.body.removeChild(overlay); onConfirm(); };
  overlay.querySelector('#_confirmNo').onclick  = () => { document.body.removeChild(overlay); };
  overlay.onclick = (e) => { if (e.target === overlay) document.body.removeChild(overlay); };
}

// Hook into switchSkinTab
const _origSwitchSkinTab = window.switchSkinTab;

// Init cinematic system on load (arrow fn defers lookup until effects.js is loaded)
(function() { document.addEventListener("DOMContentLoaded", () => initCinematicSystem()); })();

// Init theme on load
function initThemeEngine() {
  if (!gameState.ownedThemes) gameState.ownedThemes = ['default'];
  applyTheme(gameState.activeTheme || 'default');
}

// ═══════════════════════════════════════════════
// LEVEL GATE for wild items
// ═══════════════════════════════════════════════
const WILD_ITEM_LEVELS = {
  crystal:      1,   // always unlocked
  caltrops:     3,
  shadow_tile:  5,
  pepper_spray:     8,
  muscle_relaxant: 12,
};

const GAME_VERSION = "v0.5.6";
let wildLoadout = []; // [{itemId, mode}] — built on wildScreen, consumed by auto-trigger system
let wildItemCooldownEnd = 0;
const WILD_ITEM_COOLDOWN_MS = 4000;
let wildMatchUses = {};      // {itemId: remaining activations this match} for HUD display
let wildItemTimeouts = [];   // pending timeout IDs — cleared on elimination to cancel future activations

function updateWildItemGates() {
  const lvl = gameState.level || 1;
  Object.entries(WILD_ITEM_LEVELS).forEach(([itemId, minLvl]) => {
    const card = document.getElementById('item-' + itemId);
    if (!card) return;
    const lockBadge = document.getElementById('lock-' + itemId);
    const unlocked  = lvl >= minLvl;

    if (unlocked) {
      card.classList.add('unlocked');
      card.classList.remove('wild-locked');  // keep pointer-events
    } else {
      card.classList.remove('unlocked');
      if (!card.classList.contains('wild-locked')) card.classList.add('wild-locked');
    }

    // Update lock badge text
    if (lockBadge) {
      lockBadge.textContent = unlocked ? '' : `🔒 Level ${minLvl}`;
      lockBadge.style.display = unlocked ? 'none' : 'inline-block';
    }

    // If item was selected but now locked (shouldn't happen, but safety)
    if (!unlocked && selectedItems.has(itemId)) {
      selectedItems.delete(itemId);
    }
  });
}

function wildItemClick(itemId, el) {
  const lvl    = gameState.level || 1;
  const minLvl = WILD_ITEM_LEVELS[itemId] || 1;
  if (lvl < minLvl) {
    showToast(`🔒 ${itemId.replace('_',' ')} unlocks at Level ${minLvl}! (You are Level ${lvl})`, 'var(--muted)');
    vibrate([30]);
    return;
  }
  toggleItem(itemId, el);
}

function findMatch() {
  if (gameState.mode === 'wild') {
    selectedItems = new Set();
    wildLoadout = [];
    document.querySelectorAll('.item-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.item-mode-row').forEach(r => r.style.display = 'none');
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    updateWildItemGates();
    showScreen('wildScreen');
  } else if (gameState.mode === 'koth') {
    openKothScreen();
  } else if (gameState.mode === 'custom') {
    openCustomLobby();
  } else if (gameState.mode === 'practice') {
    startPractice();
  } else {
    startLobby();
  }
}


function toggleItem(id, el) {
  if (selectedItems.has(id)) {
    selectedItems.delete(id);
    el.classList.remove('selected');
    wildLoadout = wildLoadout.filter(e => e.itemId !== id);
    const modeRow = document.getElementById('mode-' + id);
    if (modeRow) { modeRow.style.display = 'none'; modeRow.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active')); }
    const qtyRow = document.getElementById('qty-row-' + id);
    if (qtyRow) qtyRow.style.display = 'none';
  } else {
    if (selectedItems.size >= 2) { showToast('Max 2 items!', 'var(--fire)'); return; }
    selectedItems.add(id);
    el.classList.add('selected');
    if (id === 'crystal') {
      wildLoadout = wildLoadout.filter(e => e.itemId !== 'crystal');
      wildLoadout.push({itemId: 'crystal', mode: 'AUTO'});
    } else {
      const modeRow = document.getElementById('mode-' + id);
      if (modeRow) modeRow.style.display = 'flex';
      // Init qty selector
      const maxQty = gameState.inventory[id] || 0;
      wildItemQty[id] = Math.min(wildItemQty[id] || 1, maxQty) || 1;
      const valEl = document.getElementById('qty-val-' + id);
      if (valEl) valEl.textContent = wildItemQty[id];
      const infoEl = document.getElementById('qty-info-' + id);
      if (infoEl) infoEl.textContent = `of ${maxQty} owned`;
      const qtyRow = document.getElementById('qty-row-' + id);
      if (qtyRow) qtyRow.style.display = 'flex';
    }
  }
}

function setLoadoutMode(itemId, mode, event) {
  if (event) event.stopPropagation();
  wildLoadout = wildLoadout.filter(e => e.itemId !== itemId);
  wildLoadout.push({itemId, mode});
  const modeRow = document.getElementById('mode-' + itemId);
  if (modeRow) {
    modeRow.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }
  console.log('[ITEM] Loadout updated:', JSON.stringify(wildLoadout));
}

let wildItemQty = {}; // {itemId: qty} — how many to use this game
let wildGameUsesLeft = {}; // {itemId: remaining activations this game}

function changeItemQty(itemId, delta, event) {
  if (event) event.stopPropagation();
  const maxQty = gameState.inventory[itemId] || 0;
  const current = wildItemQty[itemId] || 1;
  const newVal = Math.max(1, Math.min(maxQty, current + delta));
  wildItemQty[itemId] = newVal;
  const valEl = document.getElementById('qty-val-' + itemId);
  if (valEl) valEl.textContent = newVal;
  const infoEl = document.getElementById('qty-info-' + itemId);
  if (infoEl) infoEl.textContent = `of ${maxQty} owned`;
}

function confirmWildItems() {
  for (const id of selectedItems) {
    if (id === 'crystal') continue;
    const entry = wildLoadout.find(e => e.itemId === id);
    if (!entry) {
      showToast(`Choose activation mode for ${id.replace(/_/g,' ')}!`, 'var(--fire)');
      return;
    }
  }
  startLobby();
}

// ===== WILD LOADOUT AUTO-TRIGGER SYSTEM =====

function setupWildAutoTriggers() {
  if (gameState.mode !== 'wild') return;
  wildItemCooldownEnd = 0;
  wildItemTimeouts.forEach(t => clearTimeout(t));
  wildItemTimeouts = [];
  const mySession = window._activeSession;
  console.log('[WILD ITEM]', { event: 'setup', loadout: JSON.stringify(wildLoadout) });

  initWildMatchHud();

  wildLoadout.forEach(entry => {
    if (entry.mode === 'START') {
      const tid = setTimeout(() => {
        wildItemTimeouts = wildItemTimeouts.filter(t => t !== tid);
        if (window._activeSession !== mySession) return;
        autoActivateItem(entry.itemId, 'START');
      }, 2000);
      wildItemTimeouts.push(tid);
    } else if (entry.mode === 'RANDOM') {
      scheduleRandomItem(entry.itemId, mySession);
    }
    // ELIM mode is handled in checkEliminationTrigger()
  });

  setupBotWildItems(mySession);
}

const BOT_WILD_ITEMS = ['caltrops', 'shadow_tile', 'pepper_spray', 'muscle_relaxant'];

function showItemHitPopup(avatar, name, itemId) {
  const ICONS  = { caltrops:'⚙️', shadow_tile:'🌑', pepper_spray:'🌶️', muscle_relaxant:'💊' };
  const LABELS = { caltrops:'Caltrops', shadow_tile:'Shadow Tile', pepper_spray:'Pepper Spray', muscle_relaxant:'Muscle Relaxant' };
  const COLORS = { caltrops:'#ff8800', shadow_tile:'#b464ff', pepper_spray:'#ff4422', muscle_relaxant:'#aa88ff' };
  const icon  = ICONS[itemId]  || '🎮';
  const label = LABELS[itemId] || itemId;
  const color = COLORS[itemId] || 'var(--fire)';

  const el = document.createElement('div');
  // Position over the tile grid
  const grid = document.getElementById('tileGrid');
  const rect = grid ? grid.getBoundingClientRect() : null;

  el.className = 'item-hit-popup';
  el.style.border = `2px solid ${color}`;
  el.style.boxShadow = `0 0 28px ${color}55`;

  if (rect) {
    const popupHeight = 52;
    const rawTop = rect.top - popupHeight - 6;
    el.style.top = Math.max(4, rawTop + rect.height * 0.20) + 'px';
    el.style.left   = rect.left + 'px';
    el.style.width  = rect.width + 'px';
    el.style.transform = 'none';
    el.style.borderRadius = '10px';
  }

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;justify-content:center;">
      <span style="font-size:26px;">${icon}</span>
      <div style="text-align:left;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:16px;color:${color};letter-spacing:2px;">YOU WERE HIT</div>
        <div style="font-size:12px;color:var(--text);">${avatar} ${name} · <span style="color:var(--muted);text-transform:uppercase;letter-spacing:1px;">${label}</span></div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s, transform 0.3s';
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%,-50%) scale(0.85)';
    setTimeout(() => el.remove(), 350);
  }, 2200);
}

function setupBotWildItems(mySession) {
  if (gameState.mode !== 'wild') return;
  const activeBots = allPlayers.filter(p => p.isBot && !p.eliminated);
  if (!activeBots.length) return;

  // Pick 3–5 random bots as item users
  const itemBotCount = Math.min(activeBots.length, 3 + Math.floor(Math.random() * 3));
  const itemBots = [...activeBots].sort(() => Math.random() - 0.5).slice(0, itemBotCount);

  itemBots.forEach((bot, botIndex) => {
    const uses = Math.floor(Math.random() * 3) + 1; // 1–3 per bot
    for (let i = 0; i < uses; i++) {
      const itemId = BOT_WILD_ITEMS[Math.floor(Math.random() * BOT_WILD_ITEMS.length)];
      const delay = 6000 + botIndex * 4000 + i * (4000 + Math.random() * 6000);
      const tid = setTimeout(() => {
        wildItemTimeouts = wildItemTimeouts.filter(t => t !== tid);
        if (window._activeSession !== mySession) return;
        if (bot.eliminated || playerEliminated) return;
        if (playersLeft <= 5) return;
        activateBotWildItem(bot, itemId);
      }, delay);
      wildItemTimeouts.push(tid);
    }
  });
}

function activateBotWildItem(bot, itemId) {
  if (playerEliminated || playersLeft <= 5 || !roundActive) return;
  const NAMES = { caltrops:'Caltrops', shadow_tile:'Shadow Tile', pepper_spray:'Pepper Spray', muscle_relaxant:'Muscle Relaxant' };
  const ICONS = { caltrops:'⚙️', shadow_tile:'🌑', pepper_spray:'🌶️', muscle_relaxant:'💊' };
  const icon = ICONS[itemId] || '🎮';
  const name = NAMES[itemId] || itemId;

  updateBotFeed(`${icon} ${bot.avatar} ${bot.name} used ${name}!`);
  showItemHitPopup(bot.avatar, bot.name, itemId);

  if (itemId === 'caltrops') {
    if (!gridLocked) {
      playSound('wrong'); vibrate(60);
      document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = 'var(--fire2)'; t.style.opacity = '0.5'; });
      showLockOverlay(700);
      setTimeout(() => {
        document.querySelectorAll('.tile').forEach(t => { t.style.borderColor = ''; t.style.opacity = ''; });
      }, 700);
    }
  } else if (itemId === 'shadow_tile') {
    if (!shadowTileActive && !itemShadowTileUsed) {
      shadowTileActive = true;
    }
  } else if (itemId === 'pepper_spray') {
    applyPepperSprayEffect();
  } else if (itemId === 'muscle_relaxant') {
    if (!muscleRelaxantActive) {
      muscleRelaxantActive = true;
      muscleRelaxantPrimed = false;
      muscleRelaxantFirstTapped.clear();
      muscleRelaxantTargets = new Set();
    }
  }
}

function scheduleRandomItem(itemId, mySession) {
  const delay = 8000 + Math.random() * 12000; // 8–20s
  const tid = setTimeout(() => {
    wildItemTimeouts = wildItemTimeouts.filter(t => t !== tid);
    if (window._activeSession !== mySession) return;
    if (playerEliminated) return;
    if (playersLeft <= 5) return;
    if (Date.now() < wildItemCooldownEnd) { scheduleRandomItem(itemId, mySession); return; }
    if ((wildGameUsesLeft[itemId] || 0) <= 0) return;
    autoActivateItem(itemId, 'RANDOM');
    if ((wildGameUsesLeft[itemId] || 0) > 0) scheduleRandomItem(itemId, mySession);
  }, delay);
  wildItemTimeouts.push(tid);
}

function autoActivateItem(itemId, trigger) {
  const inv = gameState.inventory[itemId] || 0;
  if (playerEliminated) {
    console.log('[WILD ITEM]', { item: itemId, activated: false, reason: 'eliminated', remainingUses: inv });
    return;
  }
  if (playersLeft <= 5 && itemId !== 'crystal') {
    console.log('[WILD ITEM]', { item: itemId, activated: false, reason: '<=5 players', remainingUses: inv });
    return;
  }
  if (Date.now() < wildItemCooldownEnd && itemId !== 'crystal') {
    console.log('[WILD ITEM]', { item: itemId, activated: false, reason: 'cooldown', remainingUses: inv });
    return;
  }
  if (itemId !== 'crystal' && (wildGameUsesLeft[itemId] || 0) <= 0) {
    console.log('[WILD ITEM]', { item: itemId, activated: false, reason: 'game quota exhausted' });
    return;
  }

  // Ensure selectedItems knows this item (trigger guards check selectedItems.has())
  selectedItems.add(itemId);

  if (itemId === 'caltrops') {
    triggerCaltrops();
  } else if (itemId === 'shadow_tile') {
    triggerShadowTile();
  } else if (itemId === 'pepper_spray') {
    triggerPepperSpray();
  } else if (itemId === 'muscle_relaxant') {
    muscleRelaxantPrimed = true;
    triggerMuscleRelaxant();
  }

  if (itemId !== 'crystal' && wildGameUsesLeft[itemId] > 0) {
    wildGameUsesLeft[itemId]--;
  }
  const remaining = gameState.inventory[itemId] || 0;
  console.log('[WILD ITEM]', { item: itemId, activated: true, trigger, remainingUses: remaining, gameUsesLeft: wildGameUsesLeft[itemId] });
  updateWildMatchHud(itemId);

  if (itemId !== 'crystal') wildItemCooldownEnd = Date.now() + WILD_ITEM_COOLDOWN_MS;
}

function checkEliminationTrigger() {
  if (gameState.mode !== 'wild') return;
  if (playerEliminated) return;
  if (playersLeft <= 5) return;
  if (Date.now() < wildItemCooldownEnd) return;
  const mySession = window._activeSession;
  wildLoadout.filter(e => e.mode === 'ELIM').forEach(entry => {
    if ((wildGameUsesLeft[entry.itemId] || 0) <= 0) return;
    const tid = setTimeout(() => {
      wildItemTimeouts = wildItemTimeouts.filter(t => t !== tid);
      if (window._activeSession !== mySession) return;
      autoActivateItem(entry.itemId, 'ELIM');
    }, 500);
    wildItemTimeouts.push(tid);
  });
}

function initWildMatchHud() {
  const hud = document.getElementById('wildMatchHud');
  if (!hud) return;
  hud.innerHTML = '';
  wildMatchUses = {};
  const ICONS = { crystal:'🔮', caltrops:'⚙️', shadow_tile:'🌑', pepper_spray:'🌶️', muscle_relaxant:'💊' };

  if (wildLoadout.length === 0) { hud.style.display = 'none'; return; }

  // Crystal consumed at match start — deduct 1 from inventory immediately
  if (selectedItems.has('crystal')) {
    if ((gameState.inventory.crystal || 0) > 0) {
      gameState.inventory.crystal = (gameState.inventory.crystal || 0) - 1;
      saveState();
    }
    const el = document.createElement('div');
    el.className = 'wm-item';
    el.id = 'wm-crystal';
    el.innerHTML = `<span class="wm-item-icon">🔮</span><span class="wm-item-count" style="color:var(--muted);">∞</span>`;
    hud.appendChild(el);
  }

  wildLoadout.filter(e => e.itemId !== 'crystal').forEach(entry => {
    const allocated = wildItemQty[entry.itemId] || 1;
    const count = Math.min(allocated, gameState.inventory[entry.itemId] || 0);
    wildGameUsesLeft[entry.itemId] = count;
    wildMatchUses[entry.itemId] = count;
    // Deduct full allocation from inventory immediately at game start
    if (count > 0) {
      gameState.inventory[entry.itemId] = Math.max(0, (gameState.inventory[entry.itemId] || 0) - count);
    }
    const el = document.createElement('div');
    el.className = 'wm-item' + (count <= 0 ? ' used' : '');
    el.id = 'wm-' + entry.itemId;
    el.innerHTML = `<span class="wm-item-icon">${ICONS[entry.itemId] || '?'}</span><span class="wm-item-count" id="wm-count-${entry.itemId}">x${count}</span>`;
    hud.appendChild(el);
  });

  saveState(); // persist inventory deductions
  hud.style.display = 'flex';
}

function updateWildMatchHud(itemId) {
  if (itemId === 'crystal') return; // Crystal always shows ∞
  const count = gameState.inventory[itemId] || 0;
  const countEl = document.getElementById('wm-count-' + itemId);
  const itemEl  = document.getElementById('wm-' + itemId);
  if (countEl) countEl.textContent = 'x' + count;
  if (itemEl) {
    // Trigger activation animation
    itemEl.classList.remove('activating');
    void itemEl.offsetWidth;
    itemEl.classList.add('activating');
    if (count <= 0) setTimeout(() => itemEl.classList.add('used'), 450);
  }
}

function cancelWildItems() {
  if (gameState.mode !== 'wild') return;
  wildItemTimeouts.forEach(t => clearTimeout(t));
  wildItemTimeouts = [];
  // Refund unused allocations back to inventory
  wildLoadout.forEach(entry => {
    if (entry.itemId === 'crystal') return; // crystal consumed at start — no refund
    const unused = wildGameUsesLeft[entry.itemId] || 0;
    if (unused > 0) {
      gameState.inventory[entry.itemId] = (gameState.inventory[entry.itemId] || 0) + unused;
      wildGameUsesLeft[entry.itemId] = 0;
      console.log('[WILD ITEM]', { item: entry.itemId, refunded: unused });
    }
  });
  saveState();
  const hud = document.getElementById('wildMatchHud');
  if (hud) hud.style.opacity = '0.3';
}

// ===== MUSCLE RELAXANT ITEM =====
let muscleRelaxantTargets = new Set(); // player indices who need double-tap
let muscleRelaxantFirstTapped = new Set(); // indices who did first tap

function toggleMuscleRelaxantPrimed() {
  if ((gameState.inventory.muscle_relaxant || 0) <= 0) {
    showToast('💊 No Muscle Relaxant left!', 'var(--muted)'); return;
  }
  if (playersLeft <= 5) {
    showToast('💊 Items disabled — only 5 players left!', 'var(--muted)'); return;
  }
  muscleRelaxantPrimed = !muscleRelaxantPrimed;
  updateItemHudState();
  showToast(muscleRelaxantPrimed
    ? '💊 Muscle Relaxant ready — fires on next tap!'
    : '💊 Muscle Relaxant OFF', muscleRelaxantPrimed ? '#aa88ff' : 'var(--muted)');
}

function triggerMuscleRelaxant() {
  if (!selectedItems.has('muscle_relaxant') || !muscleRelaxantPrimed) return;
  if (playersLeft <= 5) return;
  if ((gameState.inventory.muscle_relaxant || 0) <= 0) return;
  muscleRelaxantActive  = true;
  muscleRelaxantPrimed  = false;
  muscleRelaxantFirstTapped.clear();

  // Pick half of active bots to be affected
  const activeBots = allPlayers.filter(p => p.isBot && !p.eliminated);
  muscleRelaxantTargets = new Set(
    activeBots
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.ceil(activeBots.length / 2))
      .map((_, i) => i)
  );

  updateBotFeed('💊 Muscle Relaxant! Half the players need to double-tap!');
  showToast('💊 MUSCLE RELAXANT! Half players need double-tap!', '#aa88ff');
  updateItemHudState();
}

// Call this in tapTile to handle first-tap dim effect
function handleMuscleRelaxantFirstTap(idx) {
  if (!muscleRelaxantActive) return false;
  if (muscleRelaxantFirstTapped.has(idx)) {
    // Second tap — counts as real
    muscleRelaxantFirstTapped.delete(idx);
    return false; // proceed normally
  }
  // First tap — just dim the tile
  muscleRelaxantFirstTapped.add(idx);
  const el = document.getElementById('tile-' + idx);
  if (el) {
    el.classList.add('muscle-dimmed');
    el.style.opacity = '0.45';
    showToast('💊 Tap again!', '#aa88ff');
  }
  return true; // block the real tap
}

// ===== PEPPER SPRAY ITEM =====
// (pepperSprayActive, pepperSprayPrimed, pepperFakeTileIndices declared at top)

function togglePepperSprayPrimed() {
  if ((gameState.inventory.pepper_spray || 0) <= 0) {
    showToast('🌶️ No Pepper Spray left!', 'var(--muted)'); return;
  }
  if (playersLeft <= 5) {
    showToast('🌶️ Items disabled — only 5 players left!', 'var(--muted)'); return;
  }
  pepperSprayPrimed = !pepperSprayPrimed;
  updateItemHudState();
  showToast(pepperSprayPrimed ? '🌶️ Pepper Spray ready — fires on next tap!' : '🌶️ Pepper Spray OFF',
    pepperSprayPrimed ? '#ff6633' : 'var(--muted)');
}

function triggerPepperSpray() {
  if (!selectedItems.has('pepper_spray')) return;
  if (playersLeft <= 5) {
    showToast('🌶️ Items disabled — final 5!', 'var(--muted)'); return;
  }
  if ((gameState.inventory.pepper_spray || 0) <= 0) {
    showToast('🌶️ No Pepper Spray left!', 'var(--muted)');
    selectedItems.delete('pepper_spray');
    const hudPP = document.getElementById('hudPepperSpray');
    if (hudPP) hudPP.className = 'item-hud-btn used';
    return;
  }
  pepperSprayActive = true;
  pepperSprayPrimed = false;
  // Effect applied in startRound() when the real tile ignites
}

function applyPepperSprayEffect() {
  // Show 4 random fake "burning" tiles to blinded players
  // Blinded = half of surviving players (random)
  const gridSize = gameState.gridSize || 25;
  const idleTiles = Array.from({length: gridSize}, (_, i) => i)
    .filter(i => tileStates[i] === 'idle');

  if (idleTiles.length < 4) return;

  // Pick 4 random idle tiles for fake burn
  const shuffled = idleTiles.sort(() => Math.random() - 0.5);
  pepperFakeTileIndices = shuffled.slice(0, 4);

  // Show them as burning (for THIS player too — they sprayed, they see chaos)
  (pepperFakeTileIndices||[]).forEach(idx => {
    const el = document.getElementById('tile-' + idx);
    if (el) el.classList.add('pepper-fake');
  });

  // Bot victims: half the active bots get confused
  const activeBots = allPlayers.filter(p => p.isBot && !p.eliminated);
  const blinded = activeBots.filter(() => Math.random() < 0.5);
  (blinded||[]).forEach(bot => {
    updateBotFeed(`🌶️ ${bot.avatar} ${bot.name} is blinded! Tapping wrong tile...`);
  });

  updateBotFeed('🌶️ Pepper Spray deployed! Half the players are blinded!');
  showToast('🌶️ PEPPER SPRAY! 4 fake tiles visible to half the players for 2s!', '#ff6633');

  // Remove fake tiles after 2 seconds
  setTimeout(() => {
    (pepperFakeTileIndices||[]).forEach(idx => {
      const el = document.getElementById('tile-' + idx);
      if (el) el.classList.remove('pepper-fake');
    });
    pepperFakeTileIndices = [];
    pepperSprayActive = false;
  }, 2000);
}

function triggerCaltrops() {
  if (!selectedItems.has('caltrops')) return;
  if (playersLeft <= 5) {
    showToast('⚙️ Items disabled — final 5!', 'var(--muted)');
    return;
  }
  caltropsPrimed = false;
  initAchStats();
  gameState.achStats.itemsUsed = (gameState.achStats.itemsUsed || 0) + 1;
  updateItemHudState();

  // Update HUD to show remaining count
  const remaining = gameState.inventory.caltrops || 0;
  const hudBtn = document.getElementById('hudCaltrops');
  if (remaining <= 0) {
    hudBtn.className = 'item-hud-btn used';
    selectedItems.delete('caltrops');
  }
  document.getElementById('hudCaltropsCount').textContent = `x${remaining}`;

  const activeBots = allPlayers.filter(p => p.isBot && !p.eliminated);
  const lockCount = Math.ceil(activeBots.length / 2);
  const toLock = [...activeBots].sort(() => Math.random() - 0.5).slice(0, lockCount);
  const names = toLock.map(b => b.name).slice(0, 2).join(', ');
  updateBotFeed(`⚙️ Caltrops! ${names}${toLock.length > 2 ? ' +' + (toLock.length - 2) + ' more' : ''} locked for 1s!`);
  showToast(`⚙️ Caltrops hit ${toLock.length} players! (x${remaining} left)`, 'var(--fire2)');
}

function startRound(numTiles, forcedGoldenIdx = null, isGolden = false) {
  if (gameState.mode === 'buckshot') {
    console.error('[BUCKSHOT BUG] startRound() called in buckshot mode — aborting Rush logic');
    return;
  }
  roundActive = true;
  tapOrder = [];
  roundPlayerCount = 0;

  // Always fully reset all tiles first
  tileStates = tileStates.map(s => (s !== 'idle') ? 'idle' : s);
  for (let i = 0; i < gameState.gridSize; i++) {
    const el = document.getElementById('tile-' + i);
    if (el) { el.className = 'tile'; el.innerHTML = ''; }
  }

  // Pick N random unique tiles
  const allIndices = Array.from({length: gameState.gridSize}, (_, i) => i)
    .sort(() => Math.random() - 0.5);
  burningTiles = [];
  const picks = Math.min(numTiles, gameState.gridSize);
  for (let k = 0; k < picks; k++) {
    const idx = isGolden && forcedGoldenIdx !== null ? forcedGoldenIdx : allIndices[k];
    burningTiles.push(idx);
    if (isGolden && k === 0) {
      tileStates[idx] = 'golden';
      igniteAsGolden(idx);
    } else {
      tileStates[idx] = 'burning';
      const el = document.getElementById('tile-' + idx);
      if (el) el.className = 'tile burning';
    }
    if (isGolden) break; // golden tile is always 1 tile
  }
  currentBurningTile = burningTiles[0];
  playerTilesLeft = burningTiles.length;
  practiceTileIgniteTime = Date.now(); // for reaction time tracking
  playSound('ignite');

  // Apply shadow_tile if active
  let shadowFakeIdx = null;
  if (shadowTileActive && gameState.mode === 'wild') {
    shadowFakeIdx = applyShadowTileToRound(burningTiles[0]);
  }
  startRound._fakeIdx = shadowFakeIdx;

  // Apply pepper spray if active — fake tiles ignite simultaneously with the real tile
  if (pepperSprayActive && gameState.mode === 'wild') {
    applyPepperSprayEffect();
  }

  scheduleBotTaps(); // sets roundPlayerCount
  updatePendingCounter(roundPlayerCount);
}

