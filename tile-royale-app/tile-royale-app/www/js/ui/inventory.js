// ===== SKIN PREVIEW =====
let previewInterval = null;
let previewTimeout = null;
let _previewSessionId = 0; // incremented on close to cancel callbacks

function showSkinPreview(tab, skinId) {
  const skin = SKINS[tab].find(s => s.id === skinId);
  if (!skin) return;

  // Stop any running preview
  closeSkinPreview(false);

  // Setup modal text
  const tabNames = { table: 'Table Skin', tile: 'Tile Skin', tileeffect: 'Tile Effect', tapeffect: 'Tap Effect' };
  document.getElementById('previewTitle').textContent = skin.name;
  document.getElementById('previewSub').textContent = tabNames[tab];
  document.getElementById('previewLabel').textContent = 'Watch the preview...';

  // Build 4x4 mini grid
  const grid = document.getElementById('previewGrid');
  grid.innerHTML = '';
  // Apply tile and fx classes to grid
  grid.className = 'preview-grid';
  const tileClass = TILE_CLASS_MAP[tab === 'tile' ? skinId : activeSkins.tile] || '';
  const fxClass   = FX_CLASS_MAP[tab === 'tileeffect' ? skinId : activeSkins.tileeffect] || 'tfx-fire';
  if (tileClass) grid.classList.add(tileClass);
  grid.classList.add(fxClass);

  // Apply table skin to arena background
  const arena = document.getElementById('previewArena');
  arena.className = 'skin-preview-arena';
  if (tab === 'table') {
    const tableClass = TABLE_CLASS_MAP[skinId] || '';
    // Apply background inline based on table skin
    applyTableBgToEl(arena, skinId);
  } else {
    applyTableBgToEl(arena, activeSkins.table);
  }

  // Create 16 tiles — captured in closure for runStep
  let tiles = [];
  for (let i = 0; i < 16; i++) {
    const t = document.createElement('div');
    t.className = 'preview-tile';
    grid.appendChild(t);
    tiles.push(t);
  }

  document.getElementById('skinPreviewOverlay').classList.add('show');

  // Animate: cycle through burning → tapped states
  let step = 0;
  _previewSessionId++;
  const mySession = _previewSessionId;
  const previewActive = () => _previewSessionId === mySession;
  const tapFxClass = TAP_CLASS_MAP[tab === 'tapeffect' ? skinId : activeSkins.tapeffect] || 'tap-ripple';

  function safeSetTile(t, cls, html) {
    if (!t || !previewActive()) return;
    try { t.className = cls; if (html !== undefined) t.innerHTML = html; } catch(e) {}
  }

  function getTile(i) {
    // Always safe — returns null if tiles gone or session changed
    if (!previewActive() || !tiles || i >= tiles.length) return null;
    return tiles[i] || null;
  }

  function runStep() {
    if (!previewActive()) return;

    // Reset all
    (tiles || []).forEach(t => safeSetTile(t, 'preview-tile', ''));

    if (step === 0) {
      document.getElementById('previewLabel').textContent = '🔥 Tile ignites...';
      safeSetTile(getTile(5), 'preview-tile burning');
      previewTimeout = setTimeout(() => { step = 1; runStep(); }, 1200);

    } else if (step === 1) {
      document.getElementById('previewLabel').textContent = '👆 Player taps!';
      const t5 = getTile(5);
      if (t5) {
        safeSetTile(t5, 'preview-tile tapped', '✓');
        try {
          const r = document.createElement('div');
          r.className = tapFxClass;
          t5.appendChild(r);
          setTimeout(() => { try { r.remove(); } catch(e) {} }, 500);
        } catch(e) {}
      }
      previewTimeout = setTimeout(() => { step = 2; runStep(); }, 1000);

    } else if (step === 2) {
      document.getElementById('previewLabel').textContent = '💥 Round in progress...';
      [2, 7, 12].forEach(idx => safeSetTile(getTile(idx), 'preview-tile burning'));
      previewTimeout = setTimeout(() => { step = 3; runStep(); }, 1200);

    } else if (step === 3) {
      document.getElementById('previewLabel').textContent = '✅ Everyone tapped!';
      [2, 7, 12].forEach(idx => {
        const t = getTile(idx);
        if (!t) return;
        safeSetTile(t, 'preview-tile tapped', '✓');
        try {
          const r = document.createElement('div');
          r.className = tapFxClass;
          t.appendChild(r);
          setTimeout(() => { try { r.remove(); } catch(e) {} }, 500);
        } catch(e) {}
      });
      previewTimeout = setTimeout(() => {
        step = 0; runStep();
      }, 1000);
    }
  }

  runStep();
}

function applyMiniTileSkin(el, skinId) {
  // Use PNG assets for theme-based tile skins
  const pngSkins = {
    pimple_idle: '--pimple-idle', pimple_burning: '--pimple-burning',
    eye_idle:    '--eye-idle',    eye_burning:    '--eye-burning',
    bug_idle:    '--bug-idle',    bug_burning:    '--bug-burning',
    cosmic_idle: '--cosmic-idle', cosmic_burning: '--cosmic-burning',
    fruit_idle:  '--fruit-idle',  fruit_burning:  '--fruit-burning',
  };
  if (pngSkins[skinId]) {
    el.style.backgroundImage = `var(${pngSkins[skinId]})`;
    el.style.backgroundSize  = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.backgroundColor = 'transparent';
    el.style.border = 'none';
    el.innerHTML = '';
    return;
  }
  const bgMap = {
    tile_dark:   ['#12121a', '#1e1e2e'],
    tile_gold:   ['#1a1400', '#8a6a00'],
    tile_chrome: ['#111318', '#444466'],
    tile_wood:   ['#1a0e06', '#6b3a1a'],
    tile_stone:  ['#111114', '#444448'],
    tile_glass:  ['rgba(20,30,50,0.6)', '#334466'],
    tile_holo:   ['#050a1a', '#003366'],
    tile_lava:   ['#1a0500', '#6b1500'],
    tile_ice:    ['#050e1a', '#1a4466'],
    tile_toxic:    ['#050f05', '#1a5a1a'],
    tile_diamond:  ['#001a1a', '#00e5ff'],
    tile_obsidian: ['#050005', '#220033'],
    tile_phoenix:  ['#1a0800', '#ff6600'],
    tile_abyss:    ['#000510', '#003366'],
    table_candy:   ['#220030', '#ff00cc'],
    table_cheese:  ['#2a1500', '#ffcc00'],
    table_disco:   ['#150020', '#ff00ff'],
    table_money:   ['#001500', '#00cc00'],
  };
  const [bg, border] = bgMap[skinId] || bgMap.tile_dark;
  el.style.backgroundImage = 'none';
  el.style.background = bg;
  el.style.borderColor = border;
  el.style.boxShadow = 'none';
  el.style.transition = 'none';
  el.innerHTML = '';
}

function applyTableBgToEl(el, skinId) {
  const bgMap = {
    table_dark:    '#0a0a0f',
    table_lava:    'radial-gradient(ellipse at bottom center, #8B1A00 0%, #4a0a00 35%, #1a0200 65%, #0a0a0f 100%)',
    table_arctic:  'linear-gradient(180deg, #002244 0%, #003366 25%, #001a3a 60%, #0a0a1a 100%)',
    table_neon:    'linear-gradient(180deg, #001400 0%, #002800 40%, #001400 100%)',
    table_galaxy:  'radial-gradient(ellipse at 40% 30%, #200060 0%, #100040 30%, #050020 60%, #000010 100%)',
    table_desert:  'linear-gradient(180deg, #5c3800 0%, #3d2400 30%, #1e1000 70%, #0a0805 100%)',
    table_circuit: 'linear-gradient(180deg, #001200 0%, #001a00 50%, #000d00 100%)',
    table_marble:  'linear-gradient(135deg, #1a1a2e 0%, #2d2d4e 20%, #1a1a2e 40%, #252540 60%, #1a1a2e 80%, #2d2d4e 100%)',
    table_ocean:   'linear-gradient(180deg, #001830 0%, #002244 30%, #001530 60%, #000d1e 100%)',
    table_toxic:   'radial-gradient(ellipse at bottom, #003300 0%, #002200 40%, #001100 70%, #000a00 100%)',
    // Funny/weird skins
    table_candy:   'linear-gradient(135deg, #1a0020 0%, #2a0035 25%, #1a0020 50%, #200030 75%, #1a0020 100%)',
    table_cheese:  'linear-gradient(180deg, #3d2800 0%, #4a3200 40%, #2e1f00 100%)',
    table_disco:   'linear-gradient(135deg, #200015 0%, #001520 50%, #150020 100%)',
    table_money:   'linear-gradient(180deg, #001a00 0%, #002800 50%, #001200 100%)',
    // Prestige
    table_inferno: 'radial-gradient(ellipse at bottom, #5a0a00 0%, #3a0500 30%, #1a0200 60%, #0a0a0f 100%)',
    table_cosmos:  'radial-gradient(ellipse at center, #0a0030 0%, #05001a 40%, #020010 70%, #000008 100%)',
    // Mythic — artwork backgrounds (handled separately below)
    table_myth_neon:    '__myth__assets/victory/victory-neon.webp',
    table_myth_ice:     '__myth__assets/victory/victory-ice.webp',
    table_myth_galaxy:  '__myth__assets/victory/victory-galaxy.webp',
    table_myth_rainbow: '__myth__assets/victory/victory-rainbow.webp',
    table_myth_inferno: '__myth__assets/victory/victory-inferno.webp',
    table_myth_royal:   '__myth__assets/victory/victory-royal.webp',
    table_myth_classic: '__myth__assets/victory/victory-default.webp',
    // Whale
    table_obsidian:'linear-gradient(180deg, #050005 0%, #0a0008 50%, #050003 100%)',
    table_aurora:  'linear-gradient(180deg, #001a12 0%, #002218 40%, #001a0d 70%, #000d08 100%)',
  };
  const bgVal = bgMap[skinId] || 'var(--bg)';
  if (bgVal.startsWith('__myth__')) {
    const imgUrl = bgVal.slice(8); // strip '__myth__'
    el.style.background    = 'none';
    el.style.backgroundColor   = '#0a0a0f';
    el.style.backgroundImage   = `url('${imgUrl}')`;
    el.style.backgroundSize    = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.backgroundRepeat  = 'no-repeat';
  } else {
    el.style.background = bgVal;
    el.style.backgroundImage   = '';
    el.style.backgroundSize    = '';
    el.style.backgroundPosition = '';
    el.style.backgroundRepeat  = '';
  }
  // Apply texture overlay class
  el.className = el.className.replace(/tex-\S+/g, '').trim();
  if (skinId === 'table_circuit') el.classList.add('tex-circuit');
  if (skinId === 'table_marble')  el.classList.add('tex-marble');
  if (skinId === 'table_neon')    el.classList.add('tex-neon');
  if (skinId === 'table_toxic')   el.classList.add('tex-toxic');
  if (skinId === 'table_desert')  el.classList.add('tex-desert');
  if (skinId === 'table_candy')   el.classList.add('tex-candy');
  if (skinId === 'table_cheese')  el.classList.add('tex-cheese');
  if (skinId === 'table_disco')   el.classList.add('tex-disco');
  if (skinId === 'table_money')   el.classList.add('tex-money');
}

function closeSkinPreview(hide = true) {
  _previewSessionId++; // invalidates all runStep + getTile callbacks instantly
  clearTimeout(previewTimeout);
  clearInterval(previewInterval);
  previewTimeout = null;
  if (hide) {
    document.getElementById('skinPreviewOverlay').classList.remove('show');
    document.getElementById('previewGrid').innerHTML = '';
  }
}

