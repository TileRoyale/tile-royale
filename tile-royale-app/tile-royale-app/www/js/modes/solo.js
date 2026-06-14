// ===== SOLO MODE =====

// ── Lives (separate from multiplayer tickets) ──
const SOLO_MAX_LIVES    = 5;
const SOLO_REGEN_MS     = 30 * 60 * 1000; // 30 min

function soloGetLivesData() {
  try {
    const raw = localStorage.getItem('soloLives');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return { lives: SOLO_MAX_LIVES, lastRegenTime: Date.now(), maxLives: SOLO_MAX_LIVES, regenIntervalMs: SOLO_REGEN_MS };
}
function soloSaveLivesData(d) { localStorage.setItem('soloLives', JSON.stringify(d)); }

function soloCheckRegen() {
  const d = soloGetLivesData();
  if (d.lives >= SOLO_MAX_LIVES) { d.lastRegenTime = Date.now(); soloSaveLivesData(d); return d; }
  const gained = Math.floor((Date.now() - d.lastRegenTime) / SOLO_REGEN_MS);
  if (gained > 0) {
    d.lives = Math.min(SOLO_MAX_LIVES, d.lives + gained);
    d.lastRegenTime += gained * SOLO_REGEN_MS;
    soloSaveLivesData(d);
  }
  return d;
}
function soloGetLives()  { return soloCheckRegen().lives; }
function soloUseLive()   {
  const d = soloCheckRegen();
  if (d.lives <= 0) return false;
  if (d.lives === SOLO_MAX_LIVES) d.lastRegenTime = Date.now();
  d.lives--;
  soloSaveLivesData(d);
  return true;
}
function soloAddLife()   {
  const d = soloCheckRegen();
  d.lives = Math.min(SOLO_MAX_LIVES, d.lives + 1);
  if (d.lives >= SOLO_MAX_LIVES) d.lastRegenTime = Date.now();
  soloSaveLivesData(d);
}
function soloLivesEmoji(n) {
  return '❤️'.repeat(n) + (n < SOLO_MAX_LIVES ? '🖤'.repeat(SOLO_MAX_LIVES - n) : '');
}
function soloNextLifeTimer() {
  const d = soloCheckRegen();
  if (d.lives >= SOLO_MAX_LIVES) return 'Lives full';
  const ms = SOLO_REGEN_MS - (Date.now() - d.lastRegenTime);
  if (ms <= 0) return 'Next life soon';
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return `Next life in ${m}:${String(s).padStart(2,'0')}`;
}

// ── Progress ──
function soloGetProgress() {
  try {
    const raw = localStorage.getItem('soloProgress');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return { currentLevel:1, unlockedLevel:1, totalStars:0, claimedMilestones:[], levels:{} };
}
function soloSaveProgress(p) { localStorage.setItem('soloProgress', JSON.stringify(p)); }

// ── NEW: 1000-level constants ──────────────────────────────────────────────
const SOLO_LEVEL_DURATION_MS = 30_000;
const VOID_BOMB_FUSE_MS      = 1_200;
const GHOST_MULTIPLIER       = 0.4;
const DOUBLE_TAP_WINDOW_MS   = 400;
const SLOW_EFFECT_TAPS       = 5;
const SLOW_EFFECT_FACTOR     = 0.75;
const SURGE_EFFECT_ROUNDS    = 3;
const SURGE_EFFECT_FACTOR    = 1.20;

// ── Reward window ──────────────────────────────────────────────────────────
const SOLO_REWARD_LEVELS = Array.from({ length: 100 }, (_, i) => (i + 1) * 10);

function soloParseGemReward(rewardStr) {
  if (!rewardStr || rewardStr === '—') return 0;
  const m = rewardStr.match(/💎[×x](\d+)/);
  return m ? parseInt(m[1]) : 0;
}
function soloParseCosmetic(rewardStr) {
  if (!rewardStr || !rewardStr.includes('Ekskl')) return '';
  const parts = rewardStr.split('+').filter(p => p.includes('Ekskl'));
  return parts.length > 0 ? '   ' + parts[0].trim() : '';
}

function renderSoloRewardWindow() {
  const container = document.getElementById('soloMilestoneTrack');
  if (!container) return;

  const p = soloGetProgress();
  const completedMap = p.levels || {};

  const completedNums = Object.keys(completedMap)
    .filter(k => completedMap[k].completed)
    .map(Number);
  const highestCompleted = completedNums.length > 0 ? Math.max(...completedNums) : 0;

  const passedRewards = SOLO_REWARD_LEVELS.filter(lvl => lvl <= highestCompleted);
  const currentReward = passedRewards.length > 0 ? passedRewards[passedRewards.length - 1] : null;
  const currentIdx    = currentReward ? SOLO_REWARD_LEVELS.indexOf(currentReward) : -1;

  let winStart = currentIdx === -1
    ? 0
    : Math.max(0, Math.min(currentIdx - 3, SOLO_REWARD_LEVELS.length - 7));
  const window7 = SOLO_REWARD_LEVELS.slice(winStart, winStart + 7);

  container.innerHTML = '';

  window7.forEach(rewardLvl => {
    const cfg       = SOLO_LEVELS[rewardLvl - 1];
    const rewardStr = cfg ? cfg.reward : '—';
    const gemAmt    = soloParseGemReward(rewardStr);
    const hasTicket = rewardStr && rewardStr.includes('🎫');
    const hasExcl   = rewardStr && rewardStr.includes('Ekskl');
    const isCurrent = rewardLvl === currentReward;
    const isPassed  = rewardLvl <= highestCompleted;

    const card = document.createElement('div');
    card.className = 'solo-reward-card'
      + (isCurrent ? ' solo-reward-current' : '')
      + (isPassed  ? ' solo-reward-passed'  : ' solo-reward-locked');

    const lvlEl = document.createElement('div');
    lvlEl.className = 'solo-reward-lvl';
    lvlEl.textContent = `Lv ${rewardLvl}`;
    card.appendChild(lvlEl);

    if (gemAmt > 0) {
      const gemEl = document.createElement('div');
      gemEl.className = 'solo-reward-gems';
      gemEl.textContent = `💎${gemAmt}`;
      card.appendChild(gemEl);
    }

    if (hasTicket || hasExcl) {
      const extraEl = document.createElement('div');
      extraEl.className = 'solo-reward-extras';
      extraEl.textContent = (hasTicket ? '🎫 ' : '') + (hasExcl ? '⭐' : '');
      card.appendChild(extraEl);
    }

    const statusEl = document.createElement('div');
    statusEl.className = 'solo-reward-status';
    statusEl.textContent = isPassed ? '✓' : '🔒';
    card.appendChild(statusEl);

    container.appendChild(card);
  });

  const hint = document.createElement('div');
  hint.className = 'solo-reward-hint';
  if (currentReward) {
    const nextRewardIdx = currentIdx + 1;
    if (nextRewardIdx < SOLO_REWARD_LEVELS.length) {
      const nextLvl = SOLO_REWARD_LEVELS[nextRewardIdx];
      const remaining = nextLvl - highestCompleted;
      hint.textContent = `Next reward at Lv ${nextLvl} — ${remaining} levels to go`;
    } else {
      hint.textContent = '🏆 All rewards collected!';
    }
  } else {
    hint.textContent = `First reward at Lv 10 — ${10 - highestCompleted} levels to go`;
  }
  container.appendChild(hint);
}

// ── Analytics ──
function soloTrackAttempt(lvl) {
  try {
    const d = JSON.parse(localStorage.getItem('soloAnalytics') || '{"levels":{}}');
    if (!d.levels[lvl]) d.levels[lvl] = { attempts:0, completions:0, bombDeaths:0, timeoutDeaths:0 };
    d.levels[lvl].attempts++;
    localStorage.setItem('soloAnalytics', JSON.stringify(d));
  } catch(e) {}
}
function soloTrackCompletion(lvl) {
  try {
    const d = JSON.parse(localStorage.getItem('soloAnalytics') || '{"levels":{}}');
    if (!d.levels[lvl]) d.levels[lvl] = { attempts:0, completions:0, bombDeaths:0, timeoutDeaths:0 };
    d.levels[lvl].completions++;
    localStorage.setItem('soloAnalytics', JSON.stringify(d));
  } catch(e) {}
}
function soloTrackDeath(lvl, reason) {
  try {
    const d = JSON.parse(localStorage.getItem('soloAnalytics') || '{"levels":{}}');
    if (!d.levels[lvl]) d.levels[lvl] = { attempts:0, completions:0, bombDeaths:0, timeoutDeaths:0 };
    if (reason === 'bomb')    d.levels[lvl].bombDeaths++;
    if (reason === 'timeout' || reason === 'timeout_level') d.levels[lvl].timeoutDeaths++;
    localStorage.setItem('soloAnalytics', JSON.stringify(d));
  } catch(e) {}
}
window.soloGetAnalyticsSummary = function() {
  const d = JSON.parse(localStorage.getItem('soloAnalytics') || '{"levels":{}}');
  return Object.entries(d.levels).map(([lvl, s]) => ({
    level: +lvl, attempts: s.attempts, completions: s.completions,
    completionRate: s.attempts > 0 ? Math.round(s.completions / s.attempts * 100) + '%' : '0%',
    bombDeaths: s.bombDeaths, timeoutDeaths: s.timeoutDeaths,
  })).sort((a,b) => a.level - b.level);
};

// ── Game state ──
let soloCurrentLevelNum  = 1;
let soloSessionAttempts  = 0;
let soloRoundActive      = false;
let soloTapsDone         = 0;
let soloCountdownTimer   = null;
let soloGridCols         = 2;
let soloGridRows         = 2;
let soloLivesAtLevelStart = SOLO_MAX_LIVES;
let soloLastBurnPositions = [];

// ── NEW state variables ────────────────────────────────────────────────────
let soloLevelTimer       = null;
let soloTimeLeft         = 30;
let soloTapsRequired     = 0;
let soloCurrentSpeed     = 0;
let soloSlowTapsLeft     = 0;
let soloPendingSurge     = 0;
let soloTargetColorIdx   = 0;
let soloVoidTimers       = [];
let soloDoubleTapPending = null;
let soloChainSequence    = [];
let soloChainProgress    = 0;
let soloSessionVoidDefused = 0;
let soloSessionDoubleTaps  = 0;
let soloSessionChains      = 0;

// ── Hub ──
function openSoloHub() {
  soloCheckRegen();
  const p    = soloGetProgress();
  const lives = soloGetLives();
  const unlocked = p.unlockedLevel || 1;

  document.getElementById('soloHubLives').textContent      = soloLivesEmoji(lives);
  document.getElementById('soloHubLivesTimer').textContent  = soloNextLifeTimer();
  document.getElementById('soloHubStars').textContent       = `Lv ${unlocked} / 1000`;
  document.getElementById('soloHubProgressBar').style.width = Math.min(100, unlocked / 1000 * 100) + '%';
  document.getElementById('soloHubLevelLabel').textContent  = `Level ${unlocked} of 1000`;
  document.getElementById('soloContinueLevelNum').textContent = unlocked;
  updateSoloMenuLives();
  renderSoloRewardWindow();
  showScreen('soloScreen');
}

function updateSoloMenuLives() {
  const el = document.getElementById('soloMenuLives');
  if (el) el.textContent = `❤️ ${soloGetLives()}`;
}

function soloHideOverlays() {
  document.getElementById('soloGameOverOverlay').classList.remove('show');
  document.getElementById('soloLevelCompleteOverlay').classList.remove('show');
}

// ── Level select (paginated, 100 per page) ──
let soloLevelPage = 0;

function openSoloLevelSelect(page) {
  page = page || 0;
  soloLevelPage = page;
  soloHideOverlays();
  const p    = soloGetProgress();
  const grid = document.getElementById('soloLevelGrid');
  grid.innerHTML = '';

  const startLvl = page * 100 + 1;
  const endLvl   = Math.min(startLvl + 99, 1000);

  const nav = document.createElement('div');
  nav.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;grid-column:1/-1;';
  for (let z = 0; z < 10; z++) {
    const btn = document.createElement('button');
    btn.className = z === page ? 'btn-play' : 'btn-secondary';
    btn.style.cssText = 'flex:1;min-width:40px;padding:5px 2px;font-size:12px;';
    btn.textContent = `${z*100+1}–${(z+1)*100}`;
    const zz = z;
    btn.onclick = () => openSoloLevelSelect(zz);
    nav.appendChild(btn);
  }
  grid.appendChild(nav);

  /* OLD: for (let i = 1; i <= 100; i++) { */
  // NEW:
  for (let i = startLvl; i <= endLvl; i++) {
    const cell     = document.createElement('div');
    cell.className = 'solo-level-cell';
    const ld        = p.levels[i] || {};
    const unlocked  = i <= (p.unlockedLevel || 1);
    const completed = !!ld.completed;
    const isCurrent = i === (p.unlockedLevel || 1) && !completed;

    if (!unlocked) {
      cell.classList.add('locked');
      cell.innerHTML = `<div class="solo-level-num" style="font-size:11px;">🔒</div><div class="solo-level-num">${i}</div>`;
    } else {
      if (isCurrent)  cell.classList.add('current');
      if (completed)  cell.classList.add('completed');
      const doneStr = completed ? '✓' : '';
      cell.innerHTML = `<div class="solo-level-num">${i}</div><div class="solo-level-stars">${doneStr}</div>`;
      const lvl = i;
      cell.onclick = () => openSoloPreLevel(lvl);
    }
    grid.appendChild(cell);
  }
  showScreen('soloLevelSelectScreen');
}

// ── Pre-level ──
function openSoloPreLevel(levelNum) {
  soloSessionAttempts  = 0;
  soloCurrentLevelNum  = levelNum;
  const cfg  = SOLO_LEVELS[levelNum - 1];
  const p    = soloGetProgress();
  const ld   = p.levels[levelNum] || {};
  const lives = soloGetLives();

  document.getElementById('soloPreLevelTitle').textContent = `LEVEL ${levelNum}`;
  document.getElementById('soloPreGrid').textContent        = cfg.grid.replace('x','×');
  document.getElementById('soloPreDiff').textContent        = '⭐'.repeat(cfg.difficulty);
  document.getElementById('soloPreSpeed').textContent       = (cfg.speed / 1000).toFixed(1) + 's';
  /* OLD: document.getElementById('soloPreTiles').textContent = cfg.tiles; */
  // NEW:
  document.getElementById('soloPreRequired').textContent    = `${cfg.required} / 30s`;

  document.getElementById('soloPreBestRow').style.display = ld.completed ? 'flex' : 'none';
  if (ld.completed) document.getElementById('soloPreBest').textContent = '✓ Completed';

  if (cfg.bombs > 0) {
    document.getElementById('soloPreBombWarning').style.display  = 'block';
    document.getElementById('soloPreBombCount').textContent       = cfg.bombs;
  } else {
    document.getElementById('soloPreBombWarning').style.display  = 'none';
  }

  // NEW: void bomb warning
  const voidEl = document.getElementById('soloPreVoidWarning');
  if (voidEl) {
    if (cfg.voidBombs > 0) {
      voidEl.style.display = 'block';
      document.getElementById('soloPreVoidCount').textContent = cfg.voidBombs;
    } else {
      voidEl.style.display = 'none';
    }
  }

  document.getElementById('soloPreLivesInfo').textContent  = `❤️ ${lives} / ${SOLO_MAX_LIVES} lives`;
  document.getElementById('soloPreLivesTimer').textContent = soloNextLifeTimer();

  const playBtn    = document.getElementById('soloPlayBtn');
  const noLivesBox = document.getElementById('soloNoLivesBox');
  if (lives <= 0) {
    playBtn.style.display    = 'none';
    noLivesBox.style.display = 'block';
  } else {
    playBtn.style.display    = '';
    noLivesBox.style.display = 'none';
  }

  showScreen('soloPreLevelScreen');
}

function soloContinue() {
  const p = soloGetProgress();
  openSoloPreLevel(p.unlockedLevel || 1);
}

// ── Start level ──
function startSoloLevel() {
  const levelNum = soloCurrentLevelNum;

  // Reset all new state
  clearInterval(soloLevelTimer); soloLevelTimer = null;
  soloVoidTimers.forEach(v => { clearTimeout(v.timerId); cancelAnimationFrame(v.rafId); if (v.overlayEl) v.overlayEl.remove(); });
  soloVoidTimers        = [];
  soloTimeLeft          = 30;
  soloSlowTapsLeft      = 0;
  soloPendingSurge      = 0;
  soloTargetColorIdx    = 0;
  soloDoubleTapPending  = null;
  soloChainSequence     = [];
  soloChainProgress     = 0;
  soloSessionVoidDefused = 0;
  soloSessionDoubleTaps  = 0;
  soloSessionChains      = 0;

  if (!soloUseLive()) { showToast('No lives! Wait or watch an ad.', '#ff4444'); return; }
  soloSessionAttempts++;
  soloTrackAttempt(levelNum);
  soloLastBurnPositions = [];

  const cfg  = SOLO_LEVELS[levelNum - 1];
  const parts = cfg.grid.split('x');
  soloGridCols = parseInt(parts[0]);
  soloGridRows = parseInt(parts[1]);
  soloTapsDone          = 0;
  soloRoundActive       = false;
  soloLivesAtLevelStart = soloGetLives() + 1; // +1 because we just used one

  /* OLD: soloTapsRequired not used */
  // NEW:
  soloTapsRequired = cfg.required || cfg.tiles || 10;

  gameState.mode = 'solo';
  showScreen('gameScreen');

  const badge = document.getElementById('gameModeBadge');
  if (badge) badge.textContent = `🎯 SOLO — Lv ${levelNum}`;

  document.getElementById('kothGameBanner').style.display = 'none';
  document.getElementById('itemHud').style.display        = 'none';
  const watchBar = document.getElementById('watchBar');
  if (watchBar) watchBar.classList.remove('show');
  document.getElementById('dangerBanner').style.display   = 'none';
  document.getElementById('quitDialogOverlay').style.display = 'none';

  // Header: lives in players slot, timer in timer slot
  document.getElementById('gameTimer').textContent        = '30s';
  document.getElementById('playersLeftCount').innerHTML   = soloLivesEmoji(soloGetLives());

  // Grid
  const grid = document.getElementById('tileGrid');
  grid.style.gridTemplateColumns = `repeat(${soloGridCols}, 1fr)`;
  grid.innerHTML = '';
  const total = soloGridCols * soloGridRows;
  for (let i = 0; i < total; i++) {
    const t = document.createElement('div');
    t.className   = 'tile';
    t.dataset.idx = i;
    const capturedIdx = i;
    t.onclick = () => soloTileTap(capturedIdx);
    grid.appendChild(t);
  }

  // Color HUD
  let colorHud = document.getElementById('soloColorHud');
  if (!colorHud) {
    colorHud = document.createElement('div');
    colorHud.id = 'soloColorHud';
    colorHud.style.cssText = 'display:none;font-family:\'Bebas Neue\',sans-serif;font-size:22px;letter-spacing:3px;text-align:center;margin-bottom:4px;color:var(--text);';
    grid.parentNode.insertBefore(colorHud, grid);
  }
  colorHud.style.display = 'none';

  // Taps label
  let tapsLabel = document.getElementById('soloTapsLabel');
  if (!tapsLabel) {
    tapsLabel            = document.createElement('div');
    tapsLabel.id         = 'soloTapsLabel';
    tapsLabel.style.cssText = 'font-family:\'Bebas Neue\',sans-serif;font-size:16px;letter-spacing:2px;color:var(--text);text-align:center;margin-bottom:6px;';
    grid.parentNode.insertBefore(tapsLabel, grid);
  }
  tapsLabel.style.display = '';
  /* OLD: tapsLabel.textContent = `0 / ${cfg.tiles} taps`; */
  // NEW:
  tapsLabel.textContent = `0 / ${soloTapsRequired}`;

  // Hide old countdown bar if it exists from a previous session
  const oldCdWrap = document.getElementById('soloCountdownWrap');
  if (oldCdWrap) oldCdWrap.style.display = 'none';

  /* OLD: soloNextRound(); */
  // NEW:
  soloStartLevelTimer();
  soloNextRound();
}

// ── 30s level timer ───────────────────────────────────────────────────────
function soloStartLevelTimer() {
  soloTimeLeft = 30;
  updateSoloTimerDisplay();
  soloLevelTimer = setInterval(() => {
    soloTimeLeft--;
    updateSoloTimerDisplay();
    if (soloTimeLeft <= 0) {
      clearInterval(soloLevelTimer);
      soloLevelTimer = null;
      soloRoundActive = false;
      clearTimeout(soloCountdownTimer);
      soloVoidTimers.forEach(v => { clearTimeout(v.timerId); cancelAnimationFrame(v.rafId); if (v.overlayEl) v.overlayEl.remove(); });
      soloVoidTimers = [];
      if (soloTapsDone >= soloTapsRequired) {
        soloLevelComplete();
      } else {
        soloLevelFailed();
      }
    }
  }, 1000);
}

function updateSoloTimerDisplay() {
  const el = document.getElementById('gameTimer');
  if (el) el.textContent = soloTimeLeft + 's';
}

// ── Round loop ──
/* OLD soloNextRound — level ended when soloTapsDone >= cfg.tiles
function soloNextRound() { ... }
*/

// NEW soloNextRound — runs continuously for 30s, level ends via soloLevelTimer
function soloNextRound() {
  const levelNum = soloCurrentLevelNum;
  const cfg      = SOLO_LEVELS[levelNum - 1];
  if (!soloRoundActive && soloTimeLeft <= 0) return;

  clearTimeout(soloCountdownTimer);
  soloRoundActive = false;

  // Apply speed modifiers
  let speed = cfg.speed;
  if (soloSlowTapsLeft > 0)  { speed = Math.round(speed / SLOW_EFFECT_FACTOR); soloSlowTapsLeft--; }
  if (soloPendingSurge > 0)  { speed = Math.round(speed * SURGE_EFFECT_FACTOR); soloPendingSurge--; }
  soloCurrentSpeed = speed;

  // Decide special tile types this round
  const totalTiles = cfg.totalTiles || 1;
  const isGhostRound = (cfg.ghosts > 0)     && Math.random() < (cfg.ghosts / totalTiles);
  const isLifeRound  = (cfg.lifeTiles > 0)  && Math.random() < (cfg.lifeTiles / totalTiles);
  const isSlowRound  = (cfg.slowTiles > 0)  && Math.random() < (cfg.slowTiles / totalTiles);
  const isSurgeRound = (cfg.surgeTiles > 0) && Math.random() < (cfg.surgeTiles / totalTiles);
  const isDblRound   = (cfg.doubleTap > 0)  && Math.random() < (cfg.doubleTap / totalTiles);
  const isChainRound = (cfg.chainTiles > 0) && Math.random() < (cfg.chainTiles / totalTiles);
  const voidThisRound = (cfg.voidBombs > 0) && Math.random() < (cfg.voidBombs / totalTiles) ? 1 : 0;
  const decoyCount    = (cfg.decoys > 0)    && Math.random() < (cfg.decoys / totalTiles) ? 1 : 0;
  const simT = cfg.simT || 1;

  const { burnPos, bombPositions } = getSoloRoundPositions(
    soloGridCols, soloGridRows, cfg.bombs, voidThisRound, decoyCount, simT
  );

  const tiles = document.querySelectorAll('#tileGrid .tile');
  tiles.forEach(t => { t.className = 'tile'; t.style.cssText = ''; delete t.dataset.special; delete t.dataset.colorIdx; delete t.dataset.isTarget; });

  // Assign target color
  const colors = cfg.colors || 1;
  soloTargetColorIdx = Math.floor(Math.random() * colors);
  soloUpdateColorHud(colors, soloTargetColorIdx);

  // Burning tile(s)
  burnPos.forEach((pos, i) => {
    if (!tiles[pos]) return;
    const colorIdx = (colors > 1) ? (soloTargetColorIdx + i) % colors : 0;
    tiles[pos].classList.add('burning');
    tiles[pos].dataset.colorIdx = colorIdx;
    tiles[pos].dataset.isTarget = (colorIdx === soloTargetColorIdx) ? '1' : '0';
    if (colors > 1) {
      tiles[pos].classList.add('color-' + colorIdx);
      // Inline important overrides all skin/burning CSS (some skins use !important on background)
      const _c = _SOLO_COLORS[colorIdx] || _SOLO_COLORS[0];
      tiles[pos].style.setProperty('background', _c.bg, 'important');
      tiles[pos].style.setProperty('box-shadow', `0 0 22px ${_c.glow}, inset 0 0 10px rgba(255,255,255,0.12)`, 'important');
      tiles[pos].style.setProperty('border-color', _c.border, 'important');
      tiles[pos].style.setProperty('animation', 'none', 'important');
    }
    if (isGhostRound && i === 0) tiles[pos].classList.add('ghost-tile');
    if (isDblRound   && i === 0) tiles[pos].classList.add('double-tap-tile');
    if (isLifeRound  && i === 0) { tiles[pos].classList.add('life-tile'); tiles[pos].dataset.special = 'life'; }
    if (isSlowRound  && i === 0) { tiles[pos].classList.add('slow-tile'); tiles[pos].dataset.special = 'slow'; }
    if (isSurgeRound && i === 0) { tiles[pos].dataset.special = 'surge'; }
  });

  // Regular bomb tiles
  bombPositions.forEach(p => { if (tiles[p]) tiles[p].classList.add('bomb'); });

  // Void bomb
  if (voidThisRound && burnPos.voidPos !== undefined) {
    soloSpawnVoidBomb(tiles, burnPos.voidPos);
  }

  // Decoy tile
  if (decoyCount && burnPos.decoyPos !== undefined) {
    const pos = burnPos.decoyPos;
    if (tiles[pos]) {
      tiles[pos].classList.add('burning', 'decoy-tile');
      tiles[pos].dataset.colorIdx = soloTargetColorIdx;
      tiles[pos].dataset.isTarget = '0';
      if (colors > 1) {
        tiles[pos].classList.add('color-' + soloTargetColorIdx);
        const _c = _SOLO_COLORS[soloTargetColorIdx] || _SOLO_COLORS[0];
        tiles[pos].style.setProperty('background', _c.bg, 'important');
        tiles[pos].style.setProperty('box-shadow', `0 0 22px ${_c.glow}, inset 0 0 10px rgba(255,255,255,0.12)`, 'important');
        tiles[pos].style.setProperty('border-color', _c.border, 'important');
        tiles[pos].style.setProperty('animation', 'none', 'important');
      }
    }
  }

  soloRoundActive = true;

  const displayMs = isGhostRound ? Math.round(soloCurrentSpeed * GHOST_MULTIPLIER) : soloCurrentSpeed;

  soloCountdownTimer = setTimeout(() => {
    if (!soloRoundActive) return;
    soloRoundActive = false;
    if (isSurgeRound) soloPendingSurge = SURGE_EFFECT_ROUNDS;
    tiles.forEach(t => { t.className = 'tile'; t.style.cssText = ''; delete t.dataset.special; });
    soloNextRound();
  }, displayMs);
}


// ── getSoloRoundPositions — NEW version supporting simT, voidPos, decoyPos ──
/* OLD getSoloRoundPositions — returned single burnPos
function getSoloRoundPositions(cols, rows, bombCount) { ... }
*/

function getSoloRoundPositions(cols, rows, bombCount, voidCount, decoyCount, simT) {
  simT = simT || 1;
  bombCount  = bombCount  || 0;
  voidCount  = voidCount  || 0;
  decoyCount = decoyCount || 0;
  const total = cols * rows;
  const all   = Array.from({ length: total }, (_, i) => i);

  const candidates = all.filter(p => !soloLastBurnPositions.includes(p));
  const pool = candidates.length >= simT ? candidates : all;

  const burnPos = [];
  const usedSet = new Set(soloLastBurnPositions);
  for (let i = 0; i < simT && pool.length > 0; i++) {
    const eligible = pool.filter(p => !usedSet.has(p));
    const src = eligible.length > 0 ? eligible : pool;
    const pick = src[Math.floor(Math.random() * src.length)];
    burnPos.push(pick);
    usedSet.add(pick);
  }

  burnPos.forEach(p => {
    soloLastBurnPositions.push(p);
    if (soloLastBurnPositions.length > simT + 2) soloLastBurnPositions.shift();
  });

  const forbidden = new Set(burnPos);

  let voidPos;
  if (voidCount > 0) {
    const voidPool = all.filter(p => !forbidden.has(p));
    if (voidPool.length > 0) {
      voidPos = voidPool[Math.floor(Math.random() * voidPool.length)];
      forbidden.add(voidPos);
    }
  }

  let decoyPos;
  if (decoyCount > 0) {
    const decoyPool = all.filter(p => !forbidden.has(p));
    if (decoyPool.length > 0) {
      decoyPos = decoyPool[Math.floor(Math.random() * decoyPool.length)];
      forbidden.add(decoyPos);
    }
  }

  const remaining = all.filter(p => !forbidden.has(p));
  const bombPositions = [];
  for (let i = 0; i < Math.min(bombCount, remaining.length); i++) {
    const idx = Math.floor(Math.random() * remaining.length);
    bombPositions.push(remaining.splice(idx, 1)[0]);
  }

  burnPos.voidPos  = voidPos;
  burnPos.decoyPos = decoyPos;
  return { burnPos, bombPositions };
}

// ── Tap handler ──
/* OLD soloTileTap — only knew burning/bomb
function soloTileTap(idx) { ... }
*/

// NEW soloTileTap
function soloTileTap(idx) {
  if (!soloRoundActive) return;
  const tiles  = document.querySelectorAll('#tileGrid .tile');
  const tapped = tiles[idx];
  if (!tapped) return;

  const special = tapped.dataset.special;

  // Void bomb
  if (tapped.classList.contains('void-bomb')) {
    soloDefuseVoidBomb(idx);
    return;
  }

  // Regular bomb
  if (tapped.classList.contains('bomb')) {
    soloRoundActive = false;
    clearTimeout(soloCountdownTimer);
    setTimeout(() => tiles.forEach(t => { t.className = 'tile'; t.style.cssText = ''; }), 300);
    soloTakeDamage('bomb');
    return;
  }

  // Decoy
  if (tapped.classList.contains('decoy-tile')) {
    soloRoundActive = false;
    clearTimeout(soloCountdownTimer);
    setTimeout(() => tiles.forEach(t => { t.className = 'tile'; t.style.cssText = ''; }), 300);
    soloTakeDamage('decoy');
    return;
  }

  // Wrong tile clicked — flash red and lock input for 0.3s
  if (!tapped.classList.contains('burning')) {
    soloRoundActive = false;
    tapped.classList.add('wrong-tap');
    setTimeout(() => {
      tapped.classList.remove('wrong-tap');
      soloRoundActive = true;
    }, 300);
    return;
  }

  // Color check (multi-color mode)
  const cfg = SOLO_LEVELS[soloCurrentLevelNum - 1];
  const colors = cfg.colors || 1;
  if (colors > 1) {
    const colorIdx = parseInt(tapped.dataset.colorIdx || '0');
    if (colorIdx !== soloTargetColorIdx) {
      soloRoundActive = false;
      clearTimeout(soloCountdownTimer);
      tapped.classList.add('wrong-tap');
      setTimeout(() => tiles.forEach(t => { t.className = 'tile'; t.style.cssText = ''; }), 200);
      setTimeout(soloNextRound, 250);
      return;
    }
  }

  // Special tiles
  if (special === 'life') {
    soloAddLife();
    updateSoloMenuLives();
    soloShowFloatingText(tapped, '+❤️');
  } else if (special === 'slow') {
    soloSlowTapsLeft = SLOW_EFFECT_TAPS;
    soloShowFloatingText(tapped, '⏰ SLOW');
  } else if (special === 'surge') {
    soloPendingSurge = 0;
    soloShowFloatingText(tapped, '⚡ SAFE');
  }

  // Double-tap mechanic
  if (tapped.classList.contains('double-tap-tile')) {
    if (!soloDoubleTapPending || soloDoubleTapPending.pos !== idx) {
      soloDoubleTapPending = { pos: idx, time: Date.now() };
      tapped.classList.add('double-tap-first');
      soloShowFloatingText(tapped, '2×');
      return;
    } else {
      const elapsed = Date.now() - soloDoubleTapPending.time;
      soloDoubleTapPending = null;
      if (elapsed > DOUBLE_TAP_WINDOW_MS) {
        soloRoundActive = false;
        clearTimeout(soloCountdownTimer);
        tiles.forEach(t => { t.className = 'tile'; t.style.cssText = ''; });
        setTimeout(soloNextRound, 150);
        return;
      }
      soloSessionDoubleTaps++;
      soloShowFloatingText(tapped, '⚡×2');
    }
  }

  // Correct tap
  soloRoundActive = false;
  clearTimeout(soloCountdownTimer);
  soloTapsDone++;

  tapped.classList.remove('burning');
  tapped.classList.add('tapped');

  // Bomb explosion tap effect (carry-over cosmetic)
  if ((gameState.activeSkins?.tapeffect === 'tap_bomb_explosion') &&
      !!(gameState.ownedSkins?.tap_bomb_explosion)) {
    const rect = tapped.getBoundingClientRect();
    const exp = document.createElement('div');
    exp.className = 'solo-tap-explosion';
    exp.style.left = (rect.left + rect.width / 2) + 'px';
    exp.style.top  = (rect.top  + rect.height / 2) + 'px';
    exp.style.position = 'fixed';
    document.body.appendChild(exp);
    setTimeout(() => exp.remove(), 500);
  }

  const lbl = document.getElementById('soloTapsLabel');
  /* OLD: if (lbl) lbl.textContent = `${soloTapsDone} / ${cfg.tiles} taps`; */
  // NEW:
  if (lbl) lbl.textContent = `${soloTapsDone} / ${soloTapsRequired}`;

  if (cfg.chainTiles > 0 && soloChainSequence.length > 0) {
    soloHandleChainTap(tapped);
  }

  setTimeout(() => {
    tiles.forEach(t => { t.className = 'tile'; t.style.cssText = ''; delete t.dataset.special; });
    if (soloTapsDone >= soloTapsRequired) {
      clearInterval(soloLevelTimer); soloLevelTimer = null;
      soloLevelComplete();
    } else {
      soloNextRound();
    }
  }, 180);
}

// ── soloTakeDamage — lose a life but level continues ─────────────────────
function soloTakeDamage(reason) {
  soloTrackDeath(soloCurrentLevelNum, reason);
  if (typeof playSound === 'function') playSound('eliminated');

  const flash = document.createElement('div');
  flash.className = 'solo-flash-red';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 300);

  const d = soloGetLivesData();
  if (d.lives > 0) {
    if (d.lives === SOLO_MAX_LIVES) d.lastRegenTime = Date.now();
    d.lives--;
    soloSaveLivesData(d);
    document.getElementById('playersLeftCount').innerHTML = soloLivesEmoji(soloGetLives());
    updateSoloMenuLives();
  }

  if (soloGetLives() <= 0) {
    clearInterval(soloLevelTimer); soloLevelTimer = null;
    soloRoundActive = false;
    clearTimeout(soloCountdownTimer);
    soloVoidTimers.forEach(v => { clearTimeout(v.timerId); cancelAnimationFrame(v.rafId); if (v.overlayEl) v.overlayEl.remove(); });
    soloVoidTimers = [];
    soloShowGameOver(reason);
    return;
  }

  const tiles = document.querySelectorAll('#tileGrid .tile');
  tiles.forEach(t => { t.className = 'tile'; t.style.cssText = ''; });
  setTimeout(soloNextRound, 400);
}

// ── soloLevelFailed — time up but required not met ────────────────────────
function soloLevelFailed() {
  soloTrackDeath(soloCurrentLevelNum, 'timeout_level');
  if (typeof playSound === 'function') playSound('eliminated');
  soloShowGameOver('timeout_level');
}

// ── soloShowGameOver — replaces old soloGameOver ──────────────────────────
/* OLD soloGameOver(reason) { ... } */

function soloShowGameOver(reason) {
  const icon  = document.getElementById('soloGameOverIcon');
  const title = document.getElementById('soloGameOverTitle');
  const sub   = document.getElementById('soloGameOverSub');

  if (reason === 'bomb') {
    icon.textContent  = '💣';
    title.textContent = 'BOOM!';
    sub.textContent   = 'You hit a bomb tile';
  } else if (reason === 'decoy') {
    icon.textContent  = '⚠️';
    title.textContent = 'DECOY!';
    sub.textContent   = 'You clicked a decoy tile!';
  } else if (reason === 'void') {
    icon.textContent  = '💜';
    title.textContent = 'KABOOM!';
    sub.textContent   = 'Void bomb exploded — defuse next time!';
  } else {
    icon.textContent  = '⏱️';
    title.textContent = 'TIME\'S UP!';
    sub.textContent   = `${soloTapsDone} / ${soloTapsRequired} — need ${soloTapsRequired - soloTapsDone} more`;
  }

  const lives      = soloGetLives();
  const tryBtn     = document.getElementById('soloTryAgainBtn');
  const livesLabel = document.getElementById('soloTryAgainLives');
  livesLabel.textContent = `❤️ ${lives}`;
  tryBtn.disabled        = lives <= 0;
  tryBtn.style.opacity   = lives <= 0 ? '0.4' : '';

  document.getElementById('soloGameOverOverlay').classList.add('show');
  updateSoloMenuLives();
}

function soloTryAgain() {
  document.getElementById('soloGameOverOverlay').classList.remove('show');
  startSoloLevel();
}

// ── Void bomb spawn & defuse ───────────────────────────────────────────────
function soloSpawnVoidBomb(tiles, pos) {
  if (!tiles[pos]) return;
  tiles[pos].classList.add('void-bomb');

  const overlay = document.createElement('div');
  overlay.className = 'void-fuse-overlay';
  tiles[pos].appendChild(overlay);

  const startTime = Date.now();
  let rafId;
  function animFuse() {
    const pct = Math.max(0, 1 - (Date.now() - startTime) / VOID_BOMB_FUSE_MS);
    overlay.style.width = (pct * 100) + '%';
    overlay.style.background = pct > 0.5 ? '#9b59b6' : pct > 0.25 ? '#ff8c00' : 'var(--red)';
    if (pct > 0) rafId = requestAnimationFrame(animFuse);
  }
  rafId = requestAnimationFrame(animFuse);

  const timerId = setTimeout(() => {
    cancelAnimationFrame(rafId);
    if (overlay.parentNode) overlay.remove();
    soloVoidTimers = soloVoidTimers.filter(v => v.pos !== pos);
    const stillThere = tiles[pos];
    if (stillThere && stillThere.classList.contains('void-bomb')) {
      stillThere.classList.remove('void-bomb');
      soloTakeDamage('void');
    }
  }, VOID_BOMB_FUSE_MS);

  soloVoidTimers.push({ pos, timerId, overlayEl: overlay, rafId });
}

function soloDefuseVoidBomb(pos) {
  const entry = soloVoidTimers.find(v => v.pos === pos);
  if (!entry) return;
  clearTimeout(entry.timerId);
  cancelAnimationFrame(entry.rafId);
  if (entry.overlayEl && entry.overlayEl.parentNode) entry.overlayEl.remove();
  soloVoidTimers = soloVoidTimers.filter(v => v.pos !== pos);
  const tiles = document.querySelectorAll('#tileGrid .tile');
  if (tiles[pos]) { tiles[pos].classList.remove('void-bomb'); tiles[pos].classList.add('tapped'); }
  soloShowFloatingText(tiles[pos], '💜 DEFUSED!');
  soloSessionVoidDefused++;
  if (typeof playSound === 'function') playSound('join');
}

// ── Color constants ───────────────────────────────────────────────────────
const _SOLO_COLORS = [
  { bg: 'rgba(220,50,50,0.92)',  glow: 'rgba(220,50,50,1)',  border: 'rgb(220,50,50)'  },
  { bg: 'rgba(50,120,220,0.92)', glow: 'rgba(50,120,220,1)', border: 'rgb(50,120,220)' },
  { bg: 'rgba(210,185,20,0.92)', glow: 'rgba(210,185,20,1)', border: 'rgb(210,185,20)' },
  { bg: 'rgba(50,190,75,0.92)',  glow: 'rgba(50,190,75,1)',  border: 'rgb(50,190,75)'  },
];

// ── Color HUD ────────────────────────────────────────────────────────────
function soloUpdateColorHud(totalColors, targetIdx) {
  const bar = document.getElementById('soloTargetBar');
  if (!bar) return;
  if (totalColors <= 1) { bar.style.display = 'none'; return; }
  const c = _SOLO_COLORS[targetIdx] || _SOLO_COLORS[0];
  bar.style.display = 'flex';
  bar.innerHTML = `TAP → <div class="solo-target-tile" style="background:${c.bg};box-shadow:0 0 14px ${c.glow};border-color:${c.border};"></div>`;
}

// ── Floating text feedback ───────────────────────────────────────────────
function soloShowFloatingText(el, text) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'solo-float-text';
  f.textContent = text;
  f.style.cssText = `left:${rect.left + rect.width/2}px;top:${rect.top}px;position:fixed;`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 700);
}

// ── Chain tiles ──────────────────────────────────────────────────────────
function soloHandleChainTap(tappedEl) {
  const colorIdx = parseInt(tappedEl.dataset.colorIdx || '0');
  if (soloChainSequence.length === 0) {
    soloChainSequence = [colorIdx];
    soloChainProgress = 1;
    return;
  }
  if (colorIdx === soloChainSequence[soloChainProgress]) {
    soloChainProgress++;
    if (soloChainProgress >= soloChainSequence.length) {
      soloShowFloatingText(tappedEl, '🔗 CHAIN!');
      soloSessionChains++;
      soloChainSequence = [];
      soloChainProgress = 0;
    }
  } else {
    soloChainSequence = [colorIdx];
    soloChainProgress = 1;
  }
}

// ── Level complete ──
function soloLevelComplete() {
  const levelNum = soloCurrentLevelNum;
  clearInterval(soloLevelTimer); soloLevelTimer = null;
  soloTrackCompletion(levelNum);
  if (typeof playSound === 'function') playSound('win');

  soloAddLife();
  updateSoloMenuLives();

  const cfg = SOLO_LEVELS[levelNum - 1];
  const p   = soloGetProgress();

  if (!p.levels[levelNum]) p.levels[levelNum] = {};
  p.levels[levelNum].completed = true;
  if (levelNum >= (p.unlockedLevel || 1)) p.unlockedLevel = Math.min(1000, levelNum + 1);
  soloSaveProgress(p);

  const gemReward = soloParseGemReward(cfg.reward);
  gameState.diamonds = (gameState.diamonds || 0) + gemReward;

  // XP: scales slightly with level (20 base → up to 60 at lv1000)
  const soloXp = Math.min(60, 20 + Math.floor(levelNum / 25));
  const soloXpBoosted = (gameState.xpBoostGames || 0) > 0 ? soloXp * 2 : soloXp;
  if ((gameState.xpBoostGames || 0) > 0) gameState.xpBoostGames = Math.max(0, gameState.xpBoostGames - 1);
  gameState.xp = (gameState.xp || 0) + soloXpBoosted;
  if (typeof awardLevelUp === 'function') awardLevelUp();
  try { trackMissionEvent('match_end', { placement: 1, taps: 0, xp: soloXpBoosted, mode: 'solo' }); } catch(e) {}

  saveState();
  _recordSoloCompleteServer(levelNum, gemReward);

  // Update solo achievement stats
  if (typeof initAchStats === 'function') {
    initAchStats();
    const s = gameState.achStats;
    s.soloLevels       = Object.values(p.levels).filter(l => l.completed).length;
    s.soloHighestLevel = Math.max(s.soloHighestLevel || 0, levelNum);

    const livesLost = soloLivesAtLevelStart - soloGetLives();
    if (livesLost === 0) s.soloNoLifeLevels = (s.soloNoLifeLevels || 0) + 1;

    s.soloVoidDefused = (s.soloVoidDefused || 0) + soloSessionVoidDefused;
    s.soloDoubleTaps  = (s.soloDoubleTaps  || 0) + soloSessionDoubleTaps;
    s.soloChains      = (s.soloChains      || 0) + soloSessionChains;

    if (typeof checkAchievements === 'function') checkAchievements();
    saveState();
  }

  document.getElementById('soloCompleteTitle').textContent = levelNum === 1000 ? '🏆 ALL DONE!' : 'LEVEL COMPLETE!';
  document.getElementById('soloCompleteStars').style.display = 'none';
  /* OLD: document.getElementById('soloCompleteReward').textContent = `+1❤️   +${gemReward}💎`; */
  // NEW:
  document.getElementById('soloCompleteReward').textContent =
    '+1❤️' + (gemReward > 0 ? `   +${gemReward}💎` : '') + `   +${soloXpBoosted}XP` + soloParseCosmetic(cfg.reward);

  // Hide old milestone box (replaced by reward window)
  const mBox = document.getElementById('soloMilestoneBox');
  if (mBox) mBox.style.display = 'none';

  /* OLD:
  const nextBtn = document.getElementById('soloNextLevelBtn');
  nextBtn.style.display = levelNum >= 100 ? 'none' : '';
  */
  // NEW:
  const nextBtn = document.getElementById('soloNextLevelBtn');
  nextBtn.style.display = levelNum >= 1000 ? 'none' : '';

  // Victory art
  const overlay = document.getElementById('soloLevelCompleteOverlay');
  const SOLO_VIC_SKINS = [
    { id: 'vic_lone_wolf',   art: 'assets/victory-art/vic-lone-wolf.png'   },
    { id: 'vic_solo_legend', art: 'assets/victory-art/vic-solo-legend.png' },
  ];
  const ownedVic = SOLO_VIC_SKINS.filter(s => gameState.ownedSkins?.[s.id]);
  const activeVic = SOLO_VIC_SKINS.find(s => gameState.activeSkins?.victory === s.id && gameState.ownedSkins?.[s.id])
    || ownedVic[ownedVic.length - 1] || null;
  let vicImg = document.getElementById('soloVictoryArt');
  if (activeVic) {
    if (!vicImg) {
      vicImg = document.createElement('img');
      vicImg.id = 'soloVictoryArt';
      vicImg.style.cssText = 'width:100%;max-height:140px;object-fit:contain;border-radius:12px;margin-bottom:12px;';
      overlay.querySelector('.solo-overlay-card').insertBefore(vicImg, overlay.querySelector('.solo-complete-title'));
    }
    vicImg.src = activeVic.art;
    vicImg.style.display = 'block';
  } else if (vicImg) {
    vicImg.style.display = 'none';
  }

  overlay.classList.add('show');
}

/* OLD soloNextLevel — max 100 */
// NEW:
function soloNextLevel() {
  document.getElementById('soloLevelCompleteOverlay').classList.remove('show');
  const next = soloCurrentLevelNum + 1;
  if (next > 1000) { openSoloHub(); return; }
  openSoloPreLevel(next);
}

function soloReplayLevel() {
  document.getElementById('soloLevelCompleteOverlay').classList.remove('show');
  openSoloPreLevel(soloCurrentLevelNum);
}

async function soloWatchAdForLife() {
  if (typeof adWatchInProgress !== 'undefined' && adWatchInProgress) {
    showToast('Ad already playing...', 'var(--muted)');
    return;
  }
  if (typeof canWatchAd === 'function' && !canWatchAd()) {
    if (typeof getAdCooldownText === 'function') showToast(getAdCooldownText(), 'var(--muted)');
    else showToast('Ad not available yet — try later', 'var(--muted)');
    return;
  }
  showToast('📺 Loading ad...', 'var(--muted)');
  const earned = await _watchRewardedAd();
  if (!earned) {
    showToast('Watch the full ad to earn a life.', 'var(--muted)');
    return;
  }
  if (typeof _serverAdClaim === 'function') {
    const { allowed } = await _serverAdClaim();
    if (!allowed) { showToast('Ad reward already claimed recently', 'var(--muted)'); return; }
  }
  soloAddLife();
  updateSoloMenuLives();
  showToast('+1 ❤️ Life earned!', '#ff6b6b');
  openSoloPreLevel(soloCurrentLevelNum);
}

function _recordSoloCompleteServer(levelNum, gemReward) {
  try {
    if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) return;
    if (typeof getActiveServer !== 'function') return;
    fetch(`${getActiveServer().http}/solo/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: PLAYER_ID, levelNum, gemReward }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => {});
  } catch(e) {}
}
