// ===== SKIN DATA =====
const SKINS = {
  table: [
    { id: 'table_dark',       name: 'Dark Void',       icon: '⬛', price: 0,    owned: true,  tier:'default' },
    { id: 'table_desert',     name: 'Desert Sand',     icon: '🏜️', price: 80,   owned: false, tier:'common' },
    { id: 'table_arctic',     name: 'Arctic Ice',      icon: '🧊', price: 80,   owned: false, tier:'common' },
    { id: 'table_ocean',      name: 'Deep Ocean',      icon: '🌊', price: 80,   owned: false, tier:'common' },
    { id: 'table_marble',     name: 'Marble',          icon: '⚪', price: 200,  owned: false, tier:'rare' },
    { id: 'table_neon',       name: 'Neon Grid',       icon: '🟩', price: 200,  owned: false, tier:'rare' },
    { id: 'table_lava',       name: 'Lava Field',      icon: '🌋', price: 400,  owned: false, tier:'epic' },
    { id: 'table_circuit',    name: 'Circuit Board',   icon: '💚', price: 400,  owned: false, tier:'epic' },
    { id: 'table_galaxy',     name: 'Galaxy',          icon: '🌌', price: 800,  owned: false, tier:'legendary' },
    { id: 'table_toxic',      name: 'Toxic Waste',     icon: '☢️', price: 800,  owned: false, tier:'legendary' },
    { id: 'table_inferno',    name: 'Inferno',         icon: '🔥', price: 1500, owned: false, tier:'prestige', prestige:true },
    { id: 'table_cosmos',     name: 'Cosmos',          icon: '🌙', price: 1500, owned: false, tier:'prestige', prestige:true },
    { id: 'table_candy',      name: 'Candy Land',      icon: '🍬', price: 400,  owned: false, tier:'epic' },
    { id: 'table_cheese',     name: 'Cheese Floor',    icon: '🧀', price: 200,  owned: false, tier:'rare' },
    { id: 'table_disco',      name: 'Disco Night',     icon: '🪩', price: 800,  owned: false, tier:'legendary' },
    { id: 'table_money',      name: 'Money Moves',     icon: '💵', price: 800,  owned: false, tier:'legendary' },
    // Mythic — artwork arena backgrounds
    { id: 'table_myth_neon',    name: 'Neon',    icon: '⚡', price: 2000, owned: false, tier:'mythic', mythic:true },
    { id: 'table_myth_ice',     name: 'Ice',     icon: '❄️', price: 2000, owned: false, tier:'mythic', mythic:true },
    { id: 'table_myth_galaxy',  name: 'Galaxy',  icon: '🌌', price: 2000, owned: false, tier:'mythic', mythic:true },
    { id: 'table_myth_rainbow', name: 'Rainbow', icon: '🌈', price: 2000, owned: false, tier:'mythic', mythic:true },
    { id: 'table_myth_inferno', name: 'Inferno', icon: '🔥', price: 2000, owned: false, tier:'mythic', mythic:true },
    { id: 'table_myth_royal',   name: 'Royal',   icon: '👑', price: 2000, owned: false, tier:'mythic', mythic:true },
    { id: 'table_myth_classic', name: 'Classic', icon: '🏛️', price: 2000, owned: false, tier:'mythic', mythic:true },
    // Whale exclusive
    { id: 'table_obsidian',   name: 'Obsidian',        icon: '⬛', price: 0,    owned: false, whale: true },
    { id: 'table_aurora',     name: 'Aurora',          icon: '🌠', price: 0,    owned: false, whale: true },
  ],
  tile: [
    { id: 'tile_dark',     name: 'Classic Dark',  icon: '⬜', price: 0,    owned: true,  tier:'default' },
    { id: 'tile_wood',     name: 'Wooden',        icon: '🟫', price: 80,   owned: false, tier:'common' },
    { id: 'tile_stone',    name: 'Stone',         icon: '🪨', price: 80,   owned: false, tier:'common' },
    { id: 'tile_ice',      name: 'Ice',           icon: '🟦', price: 80,   owned: false, tier:'common' },
    { id: 'tile_gold',     name: 'Gold',          icon: '🟨', price: 200,  owned: false, tier:'rare' },
    { id: 'tile_glass',    name: 'Glass',         icon: '💠', price: 200,  owned: false, tier:'rare' },
    { id: 'tile_chrome',   name: 'Chrome',        icon: '🔲', price: 400,  owned: false, tier:'epic' },
    { id: 'tile_lava',     name: 'Lava',          icon: '🟧', price: 400,  owned: false, tier:'epic' },
    { id: 'tile_holo',     name: 'Hologram',      icon: '🔷', price: 800,  owned: false, tier:'legendary' },
    { id: 'tile_toxic',    name: 'Toxic',         icon: '🟩', price: 800,  owned: false, tier:'legendary' },
    { id: 'tile_phoenix',  name: 'Phoenix',       icon: '🦅', price: 1500, owned: false, tier:'prestige', prestige:true },
    { id: 'tile_abyss',    name: 'Abyss',         icon: '🌊', price: 1500, owned: false, tier:'prestige', prestige:true },
    { id: 'tile_diamond',  name: 'Diamond',       icon: '💎', price: 0,    owned: false, whale: true },
    { id: 'tile_obsidian', name: 'Obsidian',      icon: '🖤', price: 0,    owned: false, whale: true },
  ],
  tileeffect: [
    { id: 'fx_fire',       name: 'Fire',          icon: '🔥', price: 0,    owned: true,  tier:'default' },
    { id: 'fx_neonblue',   name: 'Neon Blue',     icon: '🔵', price: 80,   owned: false, tier:'common' },
    { id: 'fx_ice',        name: 'Ice Freeze',    icon: '❄️', price: 80,   owned: false, tier:'common' },
    { id: 'fx_neonpink',   name: 'Neon Pink',     icon: '🩷', price: 200,  owned: false, tier:'rare' },
    { id: 'fx_electric',   name: 'Electric',      icon: '⚡', price: 200,  owned: false, tier:'rare' },
    { id: 'fx_plasma',     name: 'Plasma',        icon: '🟣', price: 400,  owned: false, tier:'epic' },
    { id: 'fx_toxic',      name: 'Toxic Glow',    icon: '☣️', price: 400,  owned: false, tier:'epic' },
    { id: 'fx_solar',      name: 'Solar Flare',   icon: '☀️', price: 800,  owned: false, tier:'legendary' },
    { id: 'fx_void',       name: 'Void',          icon: '🌑', price: 800,  owned: false, tier:'legendary' },
    { id: 'fx_rainbow',    name: 'Rainbow',       icon: '🌈', price: 800,  owned: false, tier:'legendary' },
    { id: 'fx_supernova',  name: 'Supernova',     icon: '💥', price: 1500, owned: false, tier:'prestige', prestige:true },
    { id: 'fx_godray',     name: 'God Ray',       icon: '✨', price: 0,    owned: false, whale: true },
    { id: 'fx_blackhole',  name: 'Black Hole',    icon: '🌀', price: 0,    owned: false, whale: true },
    { id: 'fx_bomb',       name: 'Bomb Effect',   icon: '<img src="img/void-bomb.svg" style="width:24px;height:24px;vertical-align:middle;">', price: 0,    owned: false, solo: true, unlockDesc:'200 Solo ⭐' },
  ],
  victory: [
    { id:'vic_classic',   name:'Classic',             icon:'🏆', price:0,    owned:true,  tier:'default',   preview:'gold',      art:'assets/victory-art/vic-classic.webp',   tagline:'Victory never goes out of style.' },
    { id:'vic_neon',      name:'Neon Blaze',          icon:'⚡', price:80,   owned:false, tier:'common',    preview:'neon',      art:'assets/victory-art/vic-neon.webp',      tagline:'Leave nothing but afterimages.' },
    { id:'vic_confetti',  name:'Confetti Pop',        icon:'🎊', price:80,   owned:false, tier:'common',    preview:'confetti',  art:'assets/victory-art/vic-confetti.webp',  tagline:'Celebrate first. Ask questions later.' },
    { id:'vic_fire',      name:'Fire Storm',          icon:'🔥', price:200,  owned:false, tier:'rare',      preview:'fire',      art:'assets/victory-art/vic-fire.webp',      tagline:'Burn brighter than the rest.' },
    { id:'vic_ice',       name:'Ice Crown',           icon:'❄️', price:200,  owned:false, tier:'rare',      preview:'ice',       art:'assets/victory-art/vic-ice.webp',       tagline:'Stay cool. Win everything.' },
    { id:'vic_galaxy',    name:'Galaxy Burst',        icon:'🌌', price:400,  owned:false, tier:'epic',      preview:'galaxy',    art:'assets/victory-art/vic-galaxy.webp',    tagline:'Beyond the stars lies victory.' },
    { id:'vic_lightning', name:'Lightning God',       icon:'🌩️', price:400,  owned:false, tier:'epic',      preview:'lightning', art:'assets/victory-art/vic-lightning.webp', tagline:'Too fast. Too powerful.' },
    { id:'vic_void',      name:'Void King',           icon:'🌑', price:800,  owned:false, tier:'legendary', preview:'void',      art:'assets/victory-art/vic-void.webp',      tagline:'Darkness bows to no one.' },
    { id:'vic_rainbow',   name:'Rainbow Slam',        icon:'🌈', price:800,  owned:false, tier:'legendary', preview:'rainbow',   art:'assets/victory-art/vic-rainbow.webp',   tagline:'Win in every color.' },
    { id:'vic_inferno',   name:'Inferno Crown',       icon:'👑', price:1500, owned:false, tier:'prestige',  preview:'inferno',   art:'assets/victory-art/vic-inferno.webp',   tagline:'Rule through fire.',            prestige:true },
    { id:'vic_royal',     name:'Royal Victory',       icon:'👸', price:1500, owned:false, tier:'prestige',  preview:'royal',     art:'assets/victory-art/vic-royal.webp',     tagline:'Victory fit for royalty.',      prestige:true },
    { id:'vic_bacon',     name:'All The Bacon',       icon:'🥓', price:80,   owned:false, tier:'common',    preview:'bacon',     art:'assets/victory-art/vic-bacon.webp',     tagline:'Bringing home all the bacon.' },
    { id:'vic_pizza',     name:'Pizza Champion',      icon:'🍕', price:80,   owned:false, tier:'common',    preview:'pizza',     art:'assets/victory-art/vic-pizza.webp',     tagline:'Extra cheese. Extra wins.' },
    { id:'vic_grandma',   name:'Grandma Approved',    icon:'👵', price:200,  owned:false, tier:'rare',      preview:'grandma',   art:'assets/victory-art/vic-grandma.webp',   tagline:'Even grandma is impressed.' },
    { id:'vic_disco',     name:'Disco Survivor',      icon:'🕺', price:200,  owned:false, tier:'rare',      preview:'disco',     art:'assets/victory-art/vic-disco.webp',     tagline:'Still standing. Still dancing.' },
    { id:'vic_goat',      name:'Greatest Of All Taps',icon:'🐐', price:400,  owned:false, tier:'epic',      preview:'goat',      art:'assets/victory-art/vic-goat.webp',      tagline:'The GOAT has arrived.' },
    { id:'vic_cheese',    name:'Big Cheese Energy',   icon:'🧀', price:400,  owned:false, tier:'epic',      preview:'cheese',    art:'assets/victory-art/vic-cheese.webp',    tagline:'Respect the cheese.' },
    { id:'vic_404',       name:'404: Skill Found',    icon:'💻', price:800,  owned:false, tier:'legendary', preview:'404',      art:'assets/victory-art/vic-404.webp',      tagline:'Error: Defeat not found.' },
    { id:'vic_humble',    name:'Humble Brag',         icon:'🙄', price:800,  owned:false, tier:'legendary', preview:'humble',   art:'assets/victory-art/vic-humble.webp',   tagline:'Just lucky. Again.' },
    { id:'vic_mobydick',  name:'Moby Dick',           icon:'🐋', price:0,    owned:false, tier:'default',   preview:'mobydick', art:'assets/victory-art/vic-mobydick.webp', whale:true, tagline:'The ocean answers to you.' },
    { id:'vic_solo_legend', name:'Solo Legend',       icon:'👑', price:0,    owned:false, tier:'prestige',  preview:'solo-legend', art:'assets/victory-art/vic-solo-legend.png', tagline:'No team. No problem.', solo:true, unlockDesc:'300 Solo ⭐' },
    { id:'vic_lone_wolf',   name:'Lone Wolf',         icon:'🐺', price:0,    owned:false, tier:'legendary', preview:'lone-wolf',   art:'assets/victory-art/vic-lone-wolf.png',   tagline:'Hunted alone. Won alone.',        solo:true, unlockDesc:'250 Solo ⭐' },
  ],
  tapeffect: [
    { id: 'tap_ripple',    name: 'Ripple',        icon: '💧', price: 0,    owned: true,  tier:'default' },
    { id: 'tap_smoke',     name: 'Smoke Puff',    icon: '💨', price: 80,   owned: false, tier:'common' },
    { id: 'tap_explosion', name: 'Explosion',     icon: '💥', price: 80,   owned: false, tier:'common' },
    { id: 'tap_starburst', name: 'Star Burst',    icon: '⭐', price: 200,  owned: false, tier:'rare' },
    { id: 'tap_icecrack',  name: 'Ice Crack',     icon: '🧊', price: 200,  owned: false, tier:'rare' },
    { id: 'tap_shatter',   name: 'Shatter',       icon: '🪟', price: 400,  owned: false, tier:'epic' },
    { id: 'tap_lightning', name: 'Lightning',     icon: '🌩️', price: 400,  owned: false, tier:'epic' },
    { id: 'tap_confetti',  name: 'Confetti',      icon: '🎊', price: 800,  owned: false, tier:'legendary' },
    { id: 'tap_neonpulse', name: 'Neon Pulse',    icon: '🔆', price: 800,  owned: false, tier:'legendary' },
    { id: 'tap_portal',    name: 'Portal',        icon: '🌀', price: 800,  owned: false, tier:'legendary' },
    { id: 'tap_meteor',    name: 'Meteor',        icon: '☄️', price: 1500, owned: false, tier:'prestige', prestige:true },
    { id: 'tap_shockwave',       name: 'Shockwave',       icon: '💫', price: 0, owned: false, whale: true },
    { id: 'tap_goldcrack',       name: 'Gold Crack',       icon: '🥇', price: 0, owned: false, whale: true },
    { id: 'tap_bomb_explosion',  name: 'Bomb Explosion',   icon: '<img src="img/void-bomb.svg" style="width:24px;height:24px;vertical-align:middle;">', price: 0, owned: false, solo: true, unlockDesc:'200 Solo ⭐' },
  ]
};

// Active skins
// activeSkins moved to top

let currentSkinTab = 'table';

function openProfile() {
  Object.values(miniAnimIntervals).forEach(clearInterval);
  miniAnimIntervals = {};
  updateProfileUI();
  document.querySelectorAll('.skin-grid').forEach(g => g.style.display = 'none');
  document.querySelectorAll('.skin-grid, #skinGrid-theme').forEach(g => g.style.display = 'none');
  document.getElementById('skinGrid-table').style.display = 'flex';
  document.querySelectorAll('.skin-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.skin-tab').classList.add('active');
  currentSkinTab = 'table';
  renderSkinGrid('table');
  showScreen('profileScreen');
}

function updateProfileUI() {
  updateProfileAvatar();
  document.getElementById('profileNameDisplay').textContent = gameState.playerName || 'Player';
  document.getElementById('profileLevel').textContent = gameState.level || 1;
  document.getElementById('profileWins').textContent = gameState.wins || 0;
  document.getElementById('profileGames').textContent = gameState.games || 0;
  const xp            = gameState.xp || 0;
  const level         = gameState.level || 1;
  const curLevelXP    = getXPForLevel(level);
  const nextLevelXP   = getXPForLevel(level + 1);
  const xpInLevel     = xp - curLevelXP;
  const xpNeeded      = nextLevelXP - curLevelXP;
  const progress      = Math.max(0, Math.min(1, xpInLevel / xpNeeded));
  document.getElementById('profileXPText').textContent = `${xpInLevel} / ${xpNeeded} XP`;
  document.getElementById('profileXPBar').style.width = (progress * 100).toFixed(1) + '%';
  document.getElementById('profileDiamonds').textContent = (gameState.diamonds || 0).toLocaleString();
  // Whale badge
  const whaleBadgeEl = document.getElementById('profileWhaleBadge');
  if (whaleBadgeEl) whaleBadgeEl.style.display = gameState.whaleBadge ? 'inline-flex' : 'none';
  const renames = gameState.renames || 0;
  const costEl = document.getElementById('profileRenameCost');
  if (renames < 4) {
    costEl.textContent = `${4 - renames} free rename${4 - renames !== 1 ? 's' : ''} remaining`;
    costEl.style.color = 'var(--green)';
  } else {
    costEl.textContent = 'Next rename costs 💎 500';
    costEl.style.color = 'var(--diamond)';
  }
}

function toggleNameEdit() {
  const editDiv = document.getElementById('profileNameEdit');
  const isShowing = editDiv.style.display !== 'none';
  editDiv.style.display = isShowing ? 'none' : 'flex';
  if (!isShowing) {
    const input = document.getElementById('profileNameInput');
    input.value = gameState.playerName || '';
    input.focus();
  }
}

function savePlayerName() {
  const input = document.getElementById('profileNameInput');
  const newName = input.value.trim();
  if (!newName || newName.length < 2) {
    showToast('Name must be at least 2 characters!', 'var(--red)');
    return;
  }
  const renames = gameState.renames || 0;
  if (renames >= 4) {
    // Costs 500 diamonds
    if (gameState.diamonds < 500) {
      showToast('Not enough diamonds! Need 💎 500', 'var(--red)');
      return;
    }
    _auditDiamondSpend('name_change', 500);
    gameState.diamonds -= 500;
  }
  gameState.playerName = newName;
  gameState.renames = renames + 1;
  saveState();
  document.getElementById('profileNameDisplay').textContent = newName;
  document.getElementById('profileNameEdit').style.display = 'none';
  updateProfileUI();
  updateMenuStats();
  showToast('✅ Name updated!', 'var(--green)');
}

function switchSkinTab(tab, el) {
  (Object.values(miniAnimIntervals)||[]).forEach(clearInterval);
  miniAnimIntervals = {};
  document.querySelectorAll('.skin-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');

  // Hide ALL grids including theme
  document.querySelectorAll('.skin-grid').forEach(g => g.style.display = 'none');
  const themeGrid = document.getElementById('skinGrid-theme');
  if (themeGrid) themeGrid.style.display = 'none';

  currentSkinTab = tab;

  if (tab === 'theme') {
    if (themeGrid) themeGrid.style.display = 'flex';
    renderThemeStore();
  } else if (tab === 'victory') {
    const g = document.getElementById('skinGrid-victory');
    if (g) g.style.display = 'flex';
    renderVictorySkins(g);
  } else {
    const g = document.getElementById('skinGrid-' + tab);
    if (g) g.style.display = 'flex';
    renderSkinGrid(tab);
  }
}

function renderSkinGrid(tab) {
  if (tab === 'theme') { renderThemeStore(); return; } // safety redirect
  const grid = document.getElementById('skinGrid-' + tab);
  if (!grid) return;
  grid.innerHTML = '';
  const skins = SKINS[tab];
  const owned = gameState.ownedSkins || {};
  (skins||[]).forEach(skin => {
    const isOwned = skin.owned || owned[skin.id];
    const isActive = activeSkins[tab] === skin.id;
    const isPrestige = skin.prestige;
    const isWhale = skin.whale;
    const card = document.createElement('div');
    card.className = 'skin-card'
      + (isActive ? ' active' : '')
      + (isOwned ? '' : ' locked')
      + (isPrestige ? ' prestige' : '')
      + (skin.mythic ? ' mythic' : '');
    card.onclick = () => selectSkin(tab, skin, isOwned);

    const tierLabels = { common:'Common', rare:'Rare', epic:'Epic', legendary:'Legendary', prestige:'Prestige', mythic:'Mythic', default:'' };
    const tierColors  = { common:'tier-common', rare:'tier-rare', epic:'tier-epic', legendary:'tier-legendary', prestige:'tier-prestige', mythic:'tier-mythic' };
    const tierBadge = skin.tier && skin.tier !== 'default'
      ? `<span class="skin-tier-badge ${tierColors[skin.tier]||''}">${tierLabels[skin.tier]||''}</span>`
      : '';

    const isSolo = skin.solo;
    const priceText = isWhale  ? '🐋 Whale Only'
      : isSolo && !isOwned     ? `🎯 ${skin.unlockDesc || 'Solo Only'}`
      : isOwned                ? (isActive ? '✓ Equipped' : 'Owned')
      : isPrestige             ? `⭐ ${skin.price} 💎`
      : `💎 ${skin.price}`;
    const priceClass = (skin.price === 0 && !isWhale && !isSolo) ? 'free' : '';

    card.innerHTML = `
      <div class="skin-mini-preview" id="mini-${skin.id}"></div>
      <div class="skin-card-info">
        <div class="skin-name">${skin.name}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
          <div class="skin-price ${priceClass}">${priceText}</div>
          ${tierBadge}
        </div>
      </div>
    `;
    grid.appendChild(card);

    // Build the mini preview
    buildMiniPreview(skin.id, tab);
  });

  // Start animating active skin's burning tile
  startMiniAnimations(tab);
}

// More vivid gradients for 58×58 mini-preview thumbnails (game arena uses darker versions)
const MINI_TABLE_BG = {
  table_dark:         'linear-gradient(135deg, #1e1e30, #0e0e1e)',
  table_desert:       'linear-gradient(135deg, #b06828, #7a4010)',
  table_arctic:       'linear-gradient(135deg, #1a5ea0, #0a3060)',
  table_ocean:        'linear-gradient(135deg, #0a4888, #063060)',
  table_marble:       'linear-gradient(135deg, #3a3a5e, #28284a)',
  table_neon:         'linear-gradient(135deg, #004a00, #003200)',
  table_lava:         'linear-gradient(135deg, #aa2200, #6a1000)',
  table_circuit:      'linear-gradient(135deg, #003a00, #002400)',
  table_galaxy:       'linear-gradient(135deg, #2a0088, #160050)',
  table_toxic:        'linear-gradient(135deg, #005200, #003800)',
  table_inferno:      'linear-gradient(135deg, #991800, #620800)',
  table_cosmos:       'linear-gradient(135deg, #0a0068, #050040)',
  table_candy:        'linear-gradient(135deg, #550090, #38005e)',
  table_cheese:       'linear-gradient(135deg, #664400, #3e2800)',
  table_disco:        'linear-gradient(135deg, #380055, #001838)',
  table_money:        'linear-gradient(135deg, #005a00, #003800)',
  table_obsidian:     'linear-gradient(135deg, #1a0028, #0a0018)',
  table_aurora:       'linear-gradient(135deg, #005030, #003820)',
  // Mythic skins intentionally omitted — applyTableBgToEl handles them as webp images
};

function buildMiniPreview(skinId, tab) {
  const el = document.getElementById('mini-' + skinId);
  if (!el) return;
  el.innerHTML = '';
  el.className = 'skin-mini-preview';

  const tableSkin = tab === 'table' ? skinId : (activeSkins.table || 'table_dark');

  // Use vivid mini-preview colors so dark skins are distinguishable in the 58px thumbnail
  const miniColor = MINI_TABLE_BG[tableSkin];
  if (miniColor) {
    el.style.background = miniColor;
  } else {
    applyTableBgToEl(el, tableSkin);
  }

  // Table skin: show only background, no tiles
  if (tab === 'table') {
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    return;
  }

  // Other tabs: 9 mini tiles
  for (let i = 0; i < 9; i++) {
    const t = document.createElement('div');
    t.className = 'mini-tile';
    t.id = `minitile-${skinId}-${i}`;
    const tileSkin = tab === 'tile' ? skinId : (activeSkins.tile || 'tile_dark');
    applyMiniTileSkin(t, tileSkin);
    el.appendChild(t);
  }
}

// Returns inline style object for a burning tile (mini-preview in profile skin tabs).
// Themes use CSS image assets — no gradient needed here.
function getBurningStyle(fxSkinId) {
  const theme = (typeof gameState !== 'undefined' && gameState.activeTheme) ? gameState.activeTheme : 'default';
  // For active themes, mini-preview shows the fx-1 frame image (first burning frame)
  const THEME_IMG = {
    pimple: '../img/themes/pimple/fx-1.png',
    eye:    '../img/themes/eye/fx-1.png',
    bug:    '../img/themes/bug/fx-1.png',
    cosmic: '../img/themes/cosmic/fx-1.png',
    fruit:  '../img/themes/fruit/fx-1.png',
  };
  if (theme !== 'default' && THEME_IMG[theme]) {
    return { backgroundImage: `url('${THEME_IMG[theme]}')`, backgroundSize:'100% 100%', borderColor:'transparent', boxShadow:'none', icon:'' };
  }
  const styles = {
    fx_fire:     { background: 'linear-gradient(135deg,#ff2200,#ff6600,#ffaa00)', borderColor: '#ff4500', boxShadow: '0 0 8px rgba(255,69,0,0.9)', icon: '🔥' },
    fx_neonblue: { background: 'linear-gradient(135deg,#001aff,#00aaff,#00ffee)', borderColor: '#00aaff', boxShadow: '0 0 8px rgba(0,170,255,0.9)', icon: '💙' },
    fx_neonpink: { background: 'linear-gradient(135deg,#aa00ff,#ff00aa,#ff66cc)', borderColor: '#ff00aa', boxShadow: '0 0 8px rgba(255,0,170,0.9)', icon: '🩷' },
    fx_electric: { background: 'linear-gradient(135deg,#554400,#aaaa00,#ffff00)', borderColor: '#dddd00', boxShadow: '0 0 8px rgba(255,255,0,0.9)', icon: '⚡' },
    fx_plasma:   { background: 'linear-gradient(135deg,#330066,#9900ff,#cc44ff)', borderColor: '#9900ff', boxShadow: '0 0 8px rgba(150,0,255,0.9)', icon: '🟣' },
    fx_ice:      { background: 'linear-gradient(135deg,#003366,#0066aa,#aaddff)', borderColor: '#66ccff', boxShadow: '0 0 8px rgba(100,200,255,0.9)', icon: '❄️' },
    fx_toxic:    { background: 'linear-gradient(135deg,#003300,#00aa00,#88ff00)', borderColor: '#00ff44', boxShadow: '0 0 8px rgba(0,255,60,0.9)', icon: '☣️' },
    fx_solar:    { background: 'linear-gradient(135deg,#553300,#ffaa00,#ffffff)', borderColor: '#ffdd00', boxShadow: '0 0 10px rgba(255,220,0,1)', icon: '☀️' },
    fx_void:     { background: 'radial-gradient(circle,#220033 0%,#000000 100%)', borderColor: '#440066', boxShadow: '0 0 8px rgba(60,0,80,0.9)', icon: '🌑' },
    fx_rainbow:  { background: 'linear-gradient(135deg,#ff0000,#ffff00,#00ff00,#0000ff)', borderColor: '#ff00ff', boxShadow: '0 0 8px rgba(255,100,255,0.9)', icon: '🌈' },
    // Solo exclusive
    fx_bomb:     { background: 'radial-gradient(circle,#2a0a0a 0%,#0d0000 100%)', borderColor: '#ff0000', boxShadow: '0 0 10px rgba(255,0,0,0.8)', icon: '<img src="img/void-bomb.svg" style="width:10px;height:10px;">' },
    // Whale exclusive
    fx_godray:   { background: 'radial-gradient(circle,#ffffff 0%,#ffee88 40%,#ffaa00 100%)', borderColor: '#ffffff', boxShadow: '0 0 14px rgba(255,255,200,1)', icon: '✨' },
    fx_blackhole:{ background: 'radial-gradient(circle,#000000 0%,#1a0030 60%,#330066 100%)', borderColor: '#6600aa', boxShadow: '0 0 12px rgba(100,0,150,0.9)', icon: '🌀' },
    fx_supernova:{ background: 'radial-gradient(circle,#ffffff 0%,#ffff88 30%,#ff8800 70%,#ff0000 100%)', borderColor: '#ffffff', boxShadow: '0 0 20px rgba(255,255,255,1)', icon: '💥' },
  };
  return styles[fxSkinId] || styles.fx_fire;
}

// Returns inline style for tap effect overlay div
function getTapStyle(tapSkinId) {
  const styles = {
    tap_ripple:    { borderRadius:'50%', background:'rgba(255,255,255,0.35)', animation:'rippleAnim 0.8s ease-out forwards' },
    tap_explosion: { borderRadius:'20%', background:'radial-gradient(circle,#ff8800,#ff2200)', animation:'explodeAnim 0.8s ease-out forwards' },
    tap_starburst: { background:'radial-gradient(circle,#ffff00,#ffaa00)', clipPath:'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)', animation:'starAnim 0.9s ease-out forwards' },
    tap_shatter:   { border:'2px solid #aaddff', borderRadius:'4px', animation:'shatterAnim 0.8s ease-out forwards' },
    tap_lightning: { width:'3px', height:'100%', left:'50%', transform:'translateX(-50%)', background:'linear-gradient(to bottom,#ffff00,#ffffff)', boxShadow:'0 0 6px #ffff00', animation:'lightningAnim 0.6s ease-out forwards' },
    tap_smoke:     { borderRadius:'50%', background:'radial-gradient(circle,rgba(180,180,180,0.6),transparent)', animation:'smokeAnim 1.0s ease-out forwards' },
    tap_confetti:  { borderRadius:'30%', background:'conic-gradient(#ff0000,#ffff00,#00ff00,#0000ff,#ff00ff,#ff0000)', animation:'confettiAnim 1.0s ease-out forwards' },
    tap_icecrack:  { border:'2px solid #aaddff', background:'rgba(150,200,255,0.3)', animation:'icecrackAnim 0.8s ease-out forwards' },
    tap_portal:    { borderRadius:'50%', background:'conic-gradient(#8800ff,#0044ff,#8800ff)', animation:'portalAnim 1.0s ease-out forwards' },
    tap_neonpulse: { borderRadius:'50%', border:'2px solid #00ffff', boxShadow:'0 0 8px #00ffff', animation:'neonpulseAnim 0.8s ease-out forwards' },
    // Whale exclusive
    tap_shockwave: { borderRadius:'50%', border:'3px solid #00e5ff', boxShadow:'0 0 12px #00e5ff', animation:'shockwaveAnim 1.0s ease-out forwards' },
    tap_goldcrack: { borderRadius:'8px', background:'conic-gradient(#ffd700,#ffaa00,#ff8c00,#ffd700)', boxShadow:'0 0 12px rgba(255,215,0,0.8)', animation:'goldcrackAnim 0.9s ease-out forwards' },
    tap_meteor:    { borderRadius:'30% 70% 70% 30%', border:'2px solid #ff6600', background:'linear-gradient(135deg,#ff2200,#ff8800,#ffcc00)', boxShadow:'0 0 16px rgba(255,100,0,0.8)', animation:'meteorAnim 1.0s ease-out forwards' },
  };
  return styles[tapSkinId] || styles.tap_ripple;
}


function startMiniAnimations(tab, noClear) {
  if (!noClear) { Object.values(miniAnimIntervals).forEach(clearInterval); miniAnimIntervals = {}; }

  SKINS[tab].forEach(skin => {
    // Table skins have no tile animation — just static background
    if (tab === 'table') return;

    let burnIdx = Math.floor(Math.random() * 9);
    let step = 0;

    const fxSkinId   = tab === 'tileeffect' ? skin.id : (activeSkins.tileeffect || 'fx_fire');
    const tapSkinId  = tab === 'tapeffect'  ? skin.id : (activeSkins.tapeffect  || 'tap_ripple');
    const tileSkinId = tab === 'tile'       ? skin.id : (activeSkins.tile       || 'tile_dark');

    const interval = setInterval(() => {
      // Reset all tiles to idle
      for (let i = 0; i < 9; i++) {
        const t = document.getElementById(`minitile-${skin.id}-${i}`);
        if (!t) { clearInterval(interval); return; }
        t.className = 'mini-tile';
        t.innerHTML = '';
        applyMiniTileSkin(t, tileSkinId);
      }

      const tile = document.getElementById(`minitile-${skin.id}-${burnIdx}`);
      if (!tile) return;

      if (step === 0) {
        // Burning state — apply inline burning styles
        const bStyle = getBurningStyle(fxSkinId);
        tile.style.background = bStyle.background;
        tile.style.borderColor = bStyle.borderColor;
        tile.style.boxShadow   = bStyle.boxShadow;
        tile.style.transition  = 'none';
        tile.innerHTML = `<span style="font-size:10px">${bStyle.icon}</span>`;
        step = 1;
      } else {
        // Tapped state
        tile.style.background  = '#1a2a1a';
        tile.style.borderColor = '#00ff88';
        tile.style.boxShadow   = '0 0 4px rgba(0,255,136,0.5)';
        tile.innerHTML = '<span style="font-size:9px;color:#00ff88">✓</span>';

        // Tap effect overlay
        const r = document.createElement('div');
        const tStyle = getTapStyle(tapSkinId);
        r.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
        Object.assign(r.style, tStyle);
        tile.appendChild(r);
        setTimeout(() => r.remove(), 1000);

        step = 0;
        burnIdx = Math.floor(Math.random() * 9);
      }
    }, 900);

    miniAnimIntervals[skin.id] = interval;
  });
}

function selectSkin(tab, skin, isOwned) {
  if (!isOwned) {
    if (skin.solo) {
      showToast(`🎯 ${skin.unlockDesc || 'Earn stars in Solo Mode to unlock!'}`, 'var(--muted)');
      return;
    }
    if (skin.whale) {
      showToast('🐋 Whale exclusive — not for sale!', 'var(--muted)');
      return;
    }
    if (gameState.diamonds < skin.price) {
      showToast(`Need 💎 ${skin.price} — not enough diamonds!`, 'var(--red)');
      return;
    }
    showBuyDialog(skin, tab);
    return;
  }
  activeSkins[tab] = skin.id;
  gameState.activeSkins = activeSkins;
  saveState();
  renderSkinGrid(tab);
}

let pendingBuySkin = null;
let pendingBuyTab = null;

function showBuyDialog(skin, tab) {
  pendingBuySkin = skin;
  pendingBuyTab = tab;
  document.getElementById('buyDialogIcon').textContent = skin.icon;
  document.getElementById('buyDialogName').textContent = skin.name;
  document.getElementById('buyDialogPrice').textContent = skin.price.toLocaleString();
  document.getElementById('buyDialogBalance').textContent = (gameState.diamonds || 0).toLocaleString();
  document.getElementById('buyDialogOverlay').classList.add('show');
}

function closeBuyDialog() {
  document.getElementById('buyDialogOverlay').classList.remove('show');
  pendingBuySkin = null;
  pendingBuyTab = null;
  window._storeBuyMode = false;
  storePendingCb = null;
}

function confirmBuy() {
  // Store generic callback (bundles, items, ad rewards)
  if (window._storeBuyMode && storePendingCb) {
    const cb = storePendingCb;
    closeBuyDialog();
    cb();
    return;
  }
  if (!pendingBuySkin || !pendingBuyTab) return;
  const skin = pendingBuySkin;
  const tab = pendingBuyTab;
  if (gameState.diamonds < skin.price) {
    showToast(`Need 💎 ${skin.price} — not enough diamonds!`, 'var(--red)');
    closeBuyDialog();
    return;
  }
  _auditDiamondSpend(skin.id, skin.price);
  gameState.diamonds -= skin.price;
  if (!gameState.ownedSkins) gameState.ownedSkins = {};
  gameState.ownedSkins[skin.id] = true;
  activeSkins[tab] = skin.id;
  gameState.activeSkins = activeSkins;
  saveState();
  updateMenuStats();
  closeBuyDialog();
  showToast(`✅ ${skin.name} unlocked & equipped!`, 'var(--green)');
  renderSkinGrid(tab);
  updateProfileUI();
}

// ===== SKIN APPLICATION =====
const TABLE_CLASS_MAP = {
  table_dark:     'table-dark_void',
  table_lava:     'table-lava_field',
  table_arctic:   'table-arctic_ice',
  table_neon:     'table-neon_grid',
  table_galaxy:   'table-galaxy',
  table_desert:   'table-desert_sand',
  table_circuit:  'table-circuit_board',
  table_marble:   'table-marble',
  table_ocean:    'table-deep_ocean',
  table_toxic:    'table-toxic_waste',
  // Mythic
  table_myth_neon:    'table-myth-neon',
  table_myth_ice:     'table-myth-ice',
  table_myth_galaxy:  'table-myth-galaxy',
  table_myth_rainbow: 'table-myth-rainbow',
  table_myth_inferno: 'table-myth-inferno',
  table_myth_royal:   'table-myth-royal',
  table_myth_classic: 'table-myth-classic',
  // Whale exclusive
  table_obsidian: 'table-obsidian',
  table_aurora:   'table-aurora',
  table_inferno:  'table-inferno',
  table_cosmos:   'table-cosmos',
  table_candy:    'table-candy',
  table_cheese:   'table-cheese',
  table_disco:    'table-disco',
  table_money:    'table-money',
};
const TILE_CLASS_MAP = {
  tile_dark:    '', tile_gold: 'tskin-gold', tile_chrome: 'tskin-chrome',
  tile_wood:    'tskin-wood', tile_stone: 'tskin-stone', tile_glass: 'tskin-glass',
  tile_holo:    'tskin-holo', tile_lava: 'tskin-lava', tile_ice: 'tskin-ice', tile_toxic: 'tskin-toxic',
  // Whale exclusive
  tile_diamond:  'tskin-diamond',
  tile_obsidian: 'tskin-obsidian',
  tile_phoenix:  'tskin-phoenix',
  tile_abyss:    'tskin-abyss',
};
const FX_CLASS_MAP = {
  fx_fire: 'tfx-fire', fx_neonblue: 'tfx-neonblue', fx_neonpink: 'tfx-neonpink',
  fx_electric: 'tfx-electric', fx_plasma: 'tfx-plasma', fx_ice: 'tfx-ice',
  fx_toxic: 'tfx-toxic', fx_solar: 'tfx-solar', fx_void: 'tfx-void', fx_rainbow: 'tfx-rainbow',
  // Whale exclusive
  fx_godray:    'tfx-godray',
  fx_blackhole: 'tfx-blackhole',
  fx_supernova: 'tfx-supernova',
};
const TAP_CLASS_MAP = {
  tap_ripple: 'tap-ripple', tap_explosion: 'tap-explosion', tap_starburst: 'tap-starburst',
  tap_shatter: 'tap-shatter', tap_lightning: 'tap-lightning', tap_smoke: 'tap-smoke',
  tap_confetti: 'tap-confetti', tap_icecrack: 'tap-icecrack', tap_portal: 'tap-portal',
  tap_neonpulse: 'tap-neonpulse',
  // Whale exclusive
  tap_shockwave: 'tap-shockwave',
  tap_goldcrack: 'tap-goldcrack',
  tap_meteor:    'tap-meteor',
};

function applySkins() {
  const gs = document.getElementById('gameScreen');
  const grid = document.getElementById('tileGrid');
  if (!gs || !grid) return;

  // Remove old skin classes — fully defensive
  try {
    gs.className = (typeof gs.className === 'string' ? gs.className : '')
      .split(' ').filter(c => c && !c.startsWith('table-') && !c.startsWith('tskin-') && !c.startsWith('tfx-')).join(' ');
    grid.className = (typeof grid.className === 'string' ? grid.className : '')
      .split(' ').filter(c => c && !c.startsWith('tskin-') && !c.startsWith('tfx-')).join(' ');
  } catch(e) { /* ignore className errors */ }

  const skins = activeSkins;

  // Mythic skins: render via #mythicGameBg (position:fixed; z-index:-1 inside #gameScreen).
  // This paints above body::before but below in-flow tiles, bypassing all stacking issues.
  const MYTHIC_IMAGES = {
    table_myth_neon:    'assets/victory/victory-neon.webp',
    table_myth_ice:     'assets/victory/victory-ice.webp',
    table_myth_galaxy:  'assets/victory/victory-galaxy.webp',
    table_myth_rainbow: 'assets/victory/victory-rainbow.webp',
    table_myth_inferno: 'assets/victory/victory-inferno.webp',
    table_myth_royal:   'assets/victory/victory-royal.webp',
    table_myth_classic: 'assets/victory/victory-default.webp',
  };
  const mythImg = MYTHIC_IMAGES[skins.table];
  const mythicBgEl = document.getElementById('mythicGameBg');
  if (mythImg && mythicBgEl) {
    mythicBgEl.style.backgroundImage = `url('${mythImg}')`;
    mythicBgEl.style.display = 'block';
    gs.style.background = 'transparent'; // clear CSS class background so z:-1 child shows
  } else {
    if (mythicBgEl) { mythicBgEl.style.display = 'none'; mythicBgEl.style.backgroundImage = ''; }
    gs.style.background = ''; // restore — let CSS class apply its gradient/color
  }

  // Table skin → gameScreen CSS class (gradient/texture skins)
  const tableClass = TABLE_CLASS_MAP[skins.table] || 'table-dark_void';
  gs.classList.add(tableClass);
  // Tile skin → tileGrid class
  const tileClass = TILE_CLASS_MAP[skins.tile] || '';
  if (tileClass) grid.classList.add(tileClass);
  // Tile effect → tileGrid class
  const fxClass = FX_CLASS_MAP[skins.tileeffect] || 'tfx-fire';
  grid.classList.add(fxClass);
}

function getTapEffectClass() {
  const theme = (typeof gameState !== 'undefined' && gameState.activeTheme) ? gameState.activeTheme : 'default';
  const THEME_TAP = { pimple:'tap-theme-pimple', eye:'tap-theme-eye', bug:'tap-theme-bug', cosmic:'tap-theme-cosmic', fruit:'tap-theme-fruit' };
  if (theme !== 'default' && THEME_TAP[theme]) return THEME_TAP[theme];
  return TAP_CLASS_MAP[activeSkins.tapeffect] || 'tap-ripple';
}

