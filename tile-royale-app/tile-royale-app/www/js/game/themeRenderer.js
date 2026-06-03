// ============================================================
// THEME RENDERER
// Renders tile artwork as <img class="theme-img"> elements.
// Bypasses all CSS background/border/shadow rules entirely.
// Images source: www/img/themes/{theme}/
// ============================================================

const THEME_ASSETS = {
  pimple: { tile: 'img/themes/pimple/tile.png', fx: ['img/themes/pimple/fx-1.png','img/themes/pimple/fx-2.png','img/themes/pimple/fx-3.png'] },
  eye:    { tile: 'img/themes/eye/tile.png',    fx: ['img/themes/eye/fx-1.png',   'img/themes/eye/fx-2.png',   'img/themes/eye/fx-3.png'   ] },
  bug:    { tile: 'img/themes/bug/tile.png',    fx: ['img/themes/bug/fx-1.png',   'img/themes/bug/fx-2.png',   'img/themes/bug/fx-3.png'   ] },
  cosmic: { tile: 'img/themes/cosmic/tile.png', fx: ['img/themes/cosmic/fx-1.png','img/themes/cosmic/fx-2.png','img/themes/cosmic/fx-3.png'] },
  fruit:  { tile: 'img/themes/fruit/tile.png',  fx: ['img/themes/fruit/fx-1.png', 'img/themes/fruit/fx-2.png', 'img/themes/fruit/fx-3.png' ] },
};

let _tr_burnFrame    = 0;
let _tr_burnTimer    = null;
let _tr_classObs     = null;   // MutationObserver watching tile class changes
let _tr_gridObs      = null;   // MutationObserver watching tileGrid children

function _tr_activeTheme() {
  return (typeof gameState !== 'undefined' && gameState.activeTheme && gameState.activeTheme !== 'default')
    ? gameState.activeTheme : null;
}

// Get or create the <img class="theme-img"> inside a tile
function _tr_getImg(tile) {
  let img = tile.querySelector('.theme-img');
  if (!img) {
    img = document.createElement('img');
    img.className = 'theme-img';
    img.draggable = false;
    tile.insertBefore(img, tile.firstChild);
  }
  return img;
}

// Set the correct src on a tile's theme-img based on its current state
function _tr_updateTile(tile) {
  const theme = _tr_activeTheme();
  if (!theme) return;
  const assets = THEME_ASSETS[theme];
  if (!assets) return;
  const img = _tr_getImg(tile);
  if (tile.classList.contains('burning')) {
    img.src = assets.fx[_tr_burnFrame % 3];
  } else {
    img.src = assets.tile;
  }
}

// Advance burn frame and update all burning tiles
function _tr_advanceBurn() {
  const theme = _tr_activeTheme();
  if (!theme) return;
  _tr_burnFrame = (_tr_burnFrame + 1) % 3;
  const src = THEME_ASSETS[theme]?.fx[_tr_burnFrame];
  if (!src) return;
  document.querySelectorAll('#tileGrid .tile.burning .theme-img').forEach(img => { img.src = src; });
}

function _tr_startBurn() {
  if (_tr_burnTimer) return;
  _tr_burnTimer = setInterval(_tr_advanceBurn, 300);
}
function _tr_stopBurn() {
  clearInterval(_tr_burnTimer);
  _tr_burnTimer = null;
  _tr_burnFrame = 0;
}

// Attach class-change observer to all tiles in grid
function _tr_watchTiles(grid) {
  if (_tr_classObs) _tr_classObs.disconnect();
  _tr_classObs = new MutationObserver(mutations => {
    if (!_tr_activeTheme()) return;
    mutations.forEach(m => { if (m.type === 'attributes') _tr_updateTile(m.target); });
  });
  grid.querySelectorAll('.tile').forEach(t => {
    _tr_classObs.observe(t, { attributes: true, attributeFilter: ['class'] });
  });
}

// Watch grid for new tiles being added (new game round, grid reset)
function _tr_watchGrid() {
  const grid = document.getElementById('tileGrid');
  if (!grid) return;
  if (_tr_gridObs) _tr_gridObs.disconnect();
  _tr_gridObs = new MutationObserver(() => {
    if (!_tr_activeTheme()) return;
    const tiles = grid.querySelectorAll('.tile');
    tiles.forEach(t => _tr_updateTile(t));
    _tr_watchTiles(grid);
    _tr_startBurn();
    updateThemeDebug();
  });
  _tr_gridObs.observe(grid, { childList: true });
}

// ── Public API ───────────────────────────────────────────────────────────────

function startThemeRenderer() {
  // Remove existing theme images
  document.querySelectorAll('.theme-img').forEach(img => img.remove());
  _tr_stopBurn();
  if (_tr_classObs) { _tr_classObs.disconnect(); _tr_classObs = null; }

  const theme = _tr_activeTheme();
  if (!theme) {
    updateThemeDebug();
    return;
  }

  const grid = document.getElementById('tileGrid');
  if (grid) {
    const tiles = grid.querySelectorAll('.tile');
    if (tiles.length > 0) {
      tiles.forEach(t => _tr_updateTile(t));
      _tr_watchTiles(grid);
      _tr_startBurn();
    }
  }

  _tr_watchGrid();
  updateThemeDebug();
}

// ── Debug overlay (requirement 7) ────────────────────────────────────────────

function updateThemeDebug() {
  let dbg = document.getElementById('themeDebugOverlay');
  const theme = _tr_activeTheme();

  if (!theme) {
    if (dbg) dbg.style.display = 'none';
    return;
  }

  if (!dbg) {
    dbg = document.createElement('div');
    dbg.id = 'themeDebugOverlay';
    dbg.style.cssText = [
      'display:none;position:fixed;bottom:8px;left:8px;z-index:99999;',
      'background:rgba(0,0,0,0.75);color:#0f0;font-size:10px;font-family:monospace;',
      'padding:6px 8px;border-radius:6px;pointer-events:none;line-height:1.6;',
    ].join('');
    document.body.appendChild(dbg);
  }

  const assets = THEME_ASSETS[theme];
  dbg.innerHTML = [
    `<b>THEME DEBUG</b>`,
    `Theme: <b>${theme}</b>`,
    `Idle:  ${assets?.tile ?? '?'}`,
    `FX-1:  ${assets?.fx?.[0] ?? '?'}`,
    `FX-2:  ${assets?.fx?.[1] ?? '?'}`,
    `FX-3:  ${assets?.fx?.[2] ?? '?'}`,
    `Tap:   img/themes/${theme}/tap-sprite.png`,
    `Frame: ${_tr_burnFrame}`,
  ].join('<br>');

  // Show debug if ?debug=theme is in URL
  if (typeof location !== 'undefined' && location.search.includes('debug=theme')) {
    dbg.style.display = 'block';
  }
}

// Enable debug with: toggleThemeDebug()
function toggleThemeDebug() {
  const dbg = document.getElementById('themeDebugOverlay');
  if (dbg) dbg.style.display = dbg.style.display === 'none' ? 'block' : 'none';
}
window.toggleThemeDebug = toggleThemeDebug;
