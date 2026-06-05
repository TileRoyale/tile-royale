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
function soloGetTotalStars() {
  const p = soloGetProgress();
  return Object.values(p.levels).reduce((sum, l) => sum + (l.stars || 0), 0);
}

// ── Milestones ──
const SOLO_MILESTONES = [
  { stars:  10, gems:  50, bonus:null },
  { stars:  20, gems:  80, bonus:null },
  { stars:  30, gems: 110, bonus:null },
  { stars:  40, gems: 140, bonus:null },
  { stars:  50, gems: 170, bonus:{ type:'avatar', id:'av_solo_bullseye', icon:'🎯', name:'Bullseye'      } },
  { stars:  60, gems: 200, bonus:null },
  { stars:  70, gems: 230, bonus:null },
  { stars:  80, gems: 260, bonus:null },
  { stars:  90, gems: 290, bonus:null },
  { stars: 100, gems: 320, bonus:{ type:'avatar', id:'av_solo_reaper',   icon:'💀', name:'Solo Reaper'  } },
  { stars: 110, gems: 350, bonus:null },
  { stars: 120, gems: 380, bonus:null },
  { stars: 130, gems: 410, bonus:null },
  { stars: 140, gems: 440, bonus:null },
  { stars: 150, gems: 470, bonus:{ type:'avatar', id:'av_solo_star',     icon:'⭐', name:'Star Chaser'  } },
  { stars: 160, gems: 500, bonus:null },
  { stars: 170, gems: 530, bonus:null },
  { stars: 180, gems: 560, bonus:null },
  { stars: 190, gems: 590, bonus:null },
  { stars: 200, gems: 620, bonus:{ type:'effect', id:'fx_bomb',          icon:'💣', name:'Bomb Effect', also:'tap_bomb_explosion' } },
  { stars: 210, gems: 650, bonus:null },
  { stars: 220, gems: 680, bonus:null },
  { stars: 230, gems: 710, bonus:null },
  { stars: 240, gems: 740, bonus:null },
  { stars: 250, gems: 770, bonus:{ type:'skin',   id:'vic_lone_wolf',    icon:'🐺', name:'Lone Wolf Trophy'    } },
  { stars: 260, gems: 800, bonus:null },
  { stars: 270, gems: 830, bonus:null },
  { stars: 280, gems: 860, bonus:null },
  { stars: 290, gems: 890, bonus:null },
  { stars: 300, gems: 920, bonus:{ type:'skin',   id:'vic_solo_legend',  icon:'👑', name:'Solo Legend Trophy'  } },
];

// Returns newly-reached milestones (not yet claimable by the user).
// Rewards are NOT auto-given here — the player must press CLAIM in Solo Hub.
function soloCheckMilestones(oldStars, newStars) {
  const triggered = [];
  for (const m of SOLO_MILESTONES) {
    if (newStars >= m.stars && oldStars < m.stars) {
      triggered.push(m);
    }
  }
  return triggered;
}

// Manually claim a milestone reward (called from the milestone track UI).
async function claimSoloMilestone(stars) {
  const p = soloGetProgress();
  const total = soloGetTotalStars();
  if (total < stars) return;
  const claimed = p.claimedMilestones || [];
  if (claimed.includes(stars)) return;
  const m = SOLO_MILESTONES.find(ms => ms.stars === stars);
  if (!m) return;

  // Server-side idempotency — blocks re-claim after save manipulation
  if (typeof PLAYER_ID !== 'undefined' && PLAYER_ID && typeof getActiveServer === 'function') {
    try {
      const r = await fetch(`${getActiveServer().http}/solo/milestone/claim`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PLAYER_ID, milestonePts: stars, gems: m.gems }),
        signal: AbortSignal.timeout(6000),
      });
      const data = r.ok ? await r.json() : null;
      if (data && !data.ok && !data.offline && data.error === 'already_claimed') {
        claimed.push(stars); p.claimedMilestones = claimed; soloSaveProgress(p);
        renderSoloMilestoneTrack(); return;
      }
    } catch(e) { /* offline — allow local claim */ }
  }

  claimed.push(stars);
  p.claimedMilestones = claimed;
  soloSaveProgress(p);

  gameState.diamonds = (gameState.diamonds || 0) + m.gems;
  if (m.bonus) {
    if (!gameState.ownedSkins)   gameState.ownedSkins   = {};
    if (!gameState.ownedAvatars) gameState.ownedAvatars = [];
    if (m.bonus.type === 'avatar') {
      if (!gameState.ownedAvatars.includes(m.bonus.id)) gameState.ownedAvatars.push(m.bonus.id);
    } else {
      gameState.ownedSkins[m.bonus.id] = true;
      if (m.bonus.also) gameState.ownedSkins[m.bonus.also] = true;
    }
  }
  saveState();
  if (typeof updateMenuStats === 'function') updateMenuStats();

  let rewardText = `+${m.gems}💎`;
  if (m.bonus) rewardText += `  +${m.bonus.icon} ${m.bonus.name}`;
  if (typeof showToast === 'function') showToast(`⭐ ${stars} Stars! ${rewardText}`, '#c39bd3');
  if (typeof playSound === 'function') playSound('achieve');
  if (typeof vibrate === 'function') vibrate([50, 50, 200]);

  renderSoloMilestoneTrack();
}

// Render horizontal milestone reward track in Solo Hub.
function renderSoloMilestoneTrack() {
  const container = document.getElementById('soloMilestoneTrack');
  if (!container) return;
  const p = soloGetProgress();
  const totalStars = soloGetTotalStars();
  const claimed = p.claimedMilestones || [];

  container.innerHTML = '';
  for (const m of SOLO_MILESTONES) {
    const reached    = totalStars >= m.stars;
    const isClaimed  = claimed.includes(m.stars);
    const claimable  = reached && !isClaimed;

    const card = document.createElement('div');
    card.style.cssText = [
      'display:flex;flex-direction:column;align-items:center;gap:4px;',
      'min-width:68px;padding:8px 6px;border-radius:10px;border:1px solid;',
      'font-family:"Bebas Neue",sans-serif;font-size:11px;letter-spacing:1px;text-align:center;',
      isClaimed  ? 'border-color:var(--green);background:rgba(0,255,136,0.06);color:var(--text);'
      : claimable ? 'border-color:#f0c040;background:rgba(240,192,64,0.10);color:var(--text);'
                  : 'border-color:var(--border);background:rgba(255,255,255,0.02);color:var(--muted);',
    ].join('');

    const starsSpan = document.createElement('div');
    starsSpan.textContent = `${m.stars} ⭐`;

    const gemSpan = document.createElement('div');
    gemSpan.style.cssText = 'font-size:10px;color:var(--diamond);';
    gemSpan.textContent = `+${m.gems}💎`;

    card.appendChild(starsSpan);
    card.appendChild(gemSpan);

    if (m.bonus) {
      const bonusSpan = document.createElement('div');
      bonusSpan.style.fontSize = '16px';
      bonusSpan.textContent = m.bonus.icon;
      card.appendChild(bonusSpan);
    }

    if (claimable) {
      const btn = document.createElement('button');
      btn.textContent = 'CLAIM';
      btn.style.cssText = 'margin-top:2px;padding:3px 8px;background:#f0c040;color:#000;border:none;border-radius:6px;font-family:"Bebas Neue",sans-serif;font-size:11px;letter-spacing:1px;cursor:pointer;';
      const s = m.stars;
      btn.onclick = () => claimSoloMilestone(s);
      card.appendChild(btn);
    } else if (isClaimed) {
      const doneEl = document.createElement('div');
      doneEl.style.cssText = 'margin-top:2px;font-size:14px;color:var(--green);';
      doneEl.textContent = '✓';
      card.appendChild(doneEl);
    } else {
      const lockEl = document.createElement('div');
      lockEl.style.cssText = 'margin-top:2px;font-size:13px;';
      lockEl.textContent = '🔒';
      card.appendChild(lockEl);
    }

    container.appendChild(card);
  }
}

// ── Randomisation ──
let soloLastBurnPositions = [];

function getSoloRoundPositions(cols, rows, bombCount) {
  const total = cols * rows;
  const all = Array.from({ length: total }, (_, i) => i);
  const candidates = all.filter(p => !soloLastBurnPositions.includes(p));
  const pool = candidates.length > 0 ? candidates : all;
  const burnPos = pool[Math.floor(Math.random() * pool.length)];
  soloLastBurnPositions.push(burnPos);
  if (soloLastBurnPositions.length > 3) soloLastBurnPositions.shift();
  // Explicitly exclude burnPos so a bomb can NEVER land on the burning tile
  const remaining = all.filter(p => p !== burnPos);
  const bombPositions = [];
  for (let i = 0; i < Math.min(bombCount, remaining.length); i++) {
    const idx = Math.floor(Math.random() * remaining.length);
    bombPositions.push(remaining.splice(idx, 1)[0]);
  }
  return { burnPos, bombPositions };
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
    if (reason === 'bomb') d.levels[lvl].bombDeaths++;
    if (reason === 'timeout') d.levels[lvl].timeoutDeaths++;
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

// ── Hub ──
function openSoloHub() {
  soloCheckRegen();
  const p    = soloGetProgress();
  const lives = soloGetLives();
  const total = soloGetTotalStars();

  document.getElementById('soloHubLives').textContent      = soloLivesEmoji(lives);
  document.getElementById('soloHubLivesTimer').textContent  = soloNextLifeTimer();
  document.getElementById('soloHubStars').textContent       = `${total} / 300 ⭐`;
  document.getElementById('soloHubProgressBar').style.width = Math.min(100, total / 300 * 100) + '%';
  const unlocked = p.unlockedLevel || 1;
  document.getElementById('soloHubLevelLabel').textContent  = `Level ${unlocked} of 100`;
  document.getElementById('soloContinueLevelNum').textContent = unlocked;
  updateSoloMenuLives();
  renderSoloMilestoneTrack();
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

// ── Level select ──
function openSoloLevelSelect() {
  soloHideOverlays();
  const p    = soloGetProgress();
  const grid = document.getElementById('soloLevelGrid');
  grid.innerHTML = '';
  for (let i = 1; i <= 100; i++) {
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
      const starStr = completed ? '⭐'.repeat(ld.stars || 0) : '';
      cell.innerHTML = `<div class="solo-level-num">${i}</div><div class="solo-level-stars">${starStr}</div>`;
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
  document.getElementById('soloPreTiles').textContent       = cfg.tiles;

  if (ld.completed) {
    document.getElementById('soloPreBestRow').style.display = 'flex';
    document.getElementById('soloPreBest').textContent      = '⭐'.repeat(ld.stars || 0);
  } else {
    document.getElementById('soloPreBestRow').style.display = 'none';
  }

  if (cfg.bombs > 0) {
    document.getElementById('soloPreBombWarning').style.display  = 'block';
    document.getElementById('soloPreBombCount').textContent       = cfg.bombs;
  } else {
    document.getElementById('soloPreBombWarning').style.display  = 'none';
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

  // Header: lives in players slot, taps in timer slot
  document.getElementById('gameTimer').textContent        = '';
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

  // Taps label
  let tapsLabel = document.getElementById('soloTapsLabel');
  if (!tapsLabel) {
    tapsLabel            = document.createElement('div');
    tapsLabel.id         = 'soloTapsLabel';
    tapsLabel.style.cssText = 'font-family:\'Bebas Neue\',sans-serif;font-size:16px;letter-spacing:2px;color:var(--text);text-align:center;margin-bottom:6px;';
    grid.parentNode.insertBefore(tapsLabel, grid);
  }
  tapsLabel.textContent = `0 / ${cfg.tiles} taps`;

  // Countdown bar
  let cdWrap = document.getElementById('soloCountdownWrap');
  if (!cdWrap) {
    cdWrap         = document.createElement('div');
    cdWrap.id      = 'soloCountdownWrap';
    cdWrap.className = 'solo-countdown-wrap';
    const cdBar    = document.createElement('div');
    cdBar.id       = 'soloCountdownBar';
    cdBar.className = 'solo-countdown-bar';
    cdWrap.appendChild(cdBar);
    grid.parentNode.insertBefore(cdWrap, grid);
  }
  const cdBar = document.getElementById('soloCountdownBar');
  cdBar.style.width      = '100%';
  cdBar.style.background = 'var(--green)';

  soloNextRound();
}

// ── Round loop ──
function soloNextRound() {
  const levelNum = soloCurrentLevelNum;
  const cfg      = SOLO_LEVELS[levelNum - 1];

  if (soloTapsDone >= cfg.tiles) { soloLevelComplete(); return; }

  clearTimeout(soloCountdownTimer);
  soloRoundActive = false;

  const { burnPos, bombPositions } = getSoloRoundPositions(soloGridCols, soloGridRows, cfg.bombs);
  const tiles = document.querySelectorAll('#tileGrid .tile');

  const bombSkinActive = cfg.bombs > 0 &&
    (gameState.activeSkins?.tileeffect === 'fx_bomb') &&
    !!(gameState.ownedSkins?.fx_bomb);

  tiles.forEach(t => { t.className = 'tile'; t.style.cssText = ''; });
  if (tiles[burnPos]) {
    tiles[burnPos].classList.add('burning');
    if (bombSkinActive) tiles[burnPos].classList.add('fx-bomb-effect');
  }
  // Safety: never apply bomb class to the burning tile, regardless of what positions were returned
  bombPositions.forEach(p => { if (p !== burnPos && tiles[p]) tiles[p].classList.add('bomb'); });

  soloRoundActive = true;
  soloAnimateCountdown(cfg.speed);

  soloCountdownTimer = setTimeout(() => {
    if (!soloRoundActive) return;
    soloRoundActive = false;
    soloGameOver('timeout');
  }, cfg.speed);
}

function soloAnimateCountdown(totalMs) {
  const bar   = document.getElementById('soloCountdownBar');
  if (!bar) return;
  const start = Date.now();
  function frame() {
    if (!soloRoundActive) { bar.style.width = '0%'; return; }
    const pct = Math.max(0, 1 - (Date.now() - start) / totalMs);
    bar.style.width      = (pct * 100) + '%';
    bar.style.background = pct > 0.5 ? 'var(--green)' : pct > 0.25 ? '#ff8c00' : 'var(--red)';
    if (pct > 0) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── Tap handler ──
function soloTileTap(idx) {
  if (!soloRoundActive) return;
  const tiles  = document.querySelectorAll('#tileGrid .tile');
  const tapped = tiles[idx];
  if (!tapped) return;

  if (tapped.classList.contains('bomb')) {
    soloRoundActive = false;
    clearTimeout(soloCountdownTimer);
    setTimeout(() => tiles.forEach(t => { t.className = 'tile'; t.style.cssText = ''; }), 300);
    soloGameOver('bomb');
    return;
  }
  if (!tapped.classList.contains('burning')) return;

  soloRoundActive = false;
  clearTimeout(soloCountdownTimer);
  soloTapsDone++;

  tapped.classList.remove('burning');
  tapped.classList.add('tapped');

  // Bomb explosion tap effect
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

  const cfg = SOLO_LEVELS[soloCurrentLevelNum - 1];
  const lbl = document.getElementById('soloTapsLabel');
  if (lbl) lbl.textContent = `${soloTapsDone} / ${cfg.tiles} taps`;

  setTimeout(() => {
    tiles.forEach(t => { t.className = 'tile'; t.style.cssText = ''; });
    soloNextRound();
  }, 200);
}

// ── Game over ──
function soloGameOver(reason) {
  soloTrackDeath(soloCurrentLevelNum, reason);
  if (typeof playSound === 'function') playSound('eliminated');

  const flash = document.createElement('div');
  flash.className = 'solo-flash-red';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 400);

  const icon  = document.getElementById('soloGameOverIcon');
  const title = document.getElementById('soloGameOverTitle');
  const sub   = document.getElementById('soloGameOverSub');

  if (reason === 'bomb') {
    icon.textContent  = '💣';
    title.textContent = 'BOOM!';
    sub.textContent   = 'You hit a bomb tile';
  } else {
    icon.textContent  = '⏱️';
    title.textContent = 'TOO SLOW!';
    sub.textContent   = 'Countdown expired';
  }

  const lives      = soloGetLives();
  const tryBtn     = document.getElementById('soloTryAgainBtn');
  const livesLabel = document.getElementById('soloTryAgainLives');
  livesLabel.textContent  = `❤️ ${lives}`;
  tryBtn.disabled         = lives <= 0;
  tryBtn.style.opacity    = lives <= 0 ? '0.4' : '';

  document.getElementById('soloGameOverOverlay').classList.add('show');
  updateSoloMenuLives();
}

function soloTryAgain() {
  document.getElementById('soloGameOverOverlay').classList.remove('show');
  startSoloLevel();
}

// ── Level complete ──
function soloLevelComplete() {
  const levelNum = soloCurrentLevelNum;
  soloTrackCompletion(levelNum);
  if (typeof playSound === 'function') playSound('win');

  soloAddLife(); // reward: +1 life on success
  updateSoloMenuLives();

  const cfg = SOLO_LEVELS[levelNum - 1];
  const p   = soloGetProgress();
  const ld  = p.levels[levelNum] || {};

  // Stars: based on attempts this session (1 attempt = 3 stars, 2 = 2 stars, 3+ = 1 star)
  const stars = soloSessionAttempts <= 1 ? 3 : soloSessionAttempts === 2 ? 2 : 1;
  const oldTotal = soloGetTotalStars();

  if (!p.levels[levelNum]) p.levels[levelNum] = {};
  // Save only if better
  if (stars > (ld.stars || 0)) p.levels[levelNum].stars = stars;
  p.levels[levelNum].completed = true;
  if (levelNum >= (p.unlockedLevel || 1)) p.unlockedLevel = Math.min(100, levelNum + 1);
  soloSaveProgress(p);

  const gemReward = cfg.difficulty * 10;
  gameState.diamonds = (gameState.diamonds || 0) + gemReward;
  saveState();
  _recordSoloCompleteServer(levelNum, gemReward);

  const newTotal   = soloGetTotalStars();
  const milestones = soloCheckMilestones(oldTotal, newTotal);

  // Update solo achievement stats
  if (typeof initAchStats === 'function') {
    initAchStats();
    const s = gameState.achStats;
    s.soloLevels  = Object.values(p.levels).filter(l => l.completed).length;
    s.soloStars   = newTotal;
    s.solo3Stars  = Object.values(p.levels).filter(l => (l.stars || 0) >= 3).length;
    if (typeof checkAchievements === 'function') checkAchievements();
    saveState();
  }

  // Show overlay
  const finalStars = p.levels[levelNum].stars || stars;
  document.getElementById('soloCompleteTitle').textContent = levelNum === 100 ? '🏆 ALL DONE!' : 'LEVEL COMPLETE!';
  document.getElementById('soloCompleteStars').textContent = '⭐'.repeat(finalStars) + '☆'.repeat(3 - finalStars);
  document.getElementById('soloCompleteReward').textContent = `+1❤️   +${gemReward}💎`;

  const mBox = document.getElementById('soloMilestoneBox');
  if (milestones.length > 0) {
    const m = milestones[0];
    mBox.style.display = 'block';
    document.getElementById('soloMilestoneTitle').textContent = `⭐ ${m.stars} STARS MILESTONE REACHED!`;
    let desc = `Go to Solo Hub to claim +${m.gems}💎`;
    if (m.bonus) desc += `  +${m.bonus.icon} ${m.bonus.name}`;
    document.getElementById('soloMilestoneDesc').textContent = desc;
  } else {
    mBox.style.display = 'none';
  }

  const nextBtn = document.getElementById('soloNextLevelBtn');
  nextBtn.style.display = levelNum >= 100 ? 'none' : '';

  // Victory art — show if player owns a solo victory skin
  const overlay = document.getElementById('soloLevelCompleteOverlay');
  const SOLO_VIC_SKINS = [
    { id: 'vic_lone_wolf',   art: 'assets/victory-art/vic-lone-wolf.png'   },
    { id: 'vic_solo_legend', art: 'assets/victory-art/vic-solo-legend.png' },
  ];
  const ownedVic = SOLO_VIC_SKINS.filter(s => gameState.ownedSkins?.[s.id]);
  // Use active victory skin if it's a solo one, otherwise latest unlocked
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

function soloNextLevel() {
  document.getElementById('soloLevelCompleteOverlay').classList.remove('show');
  const next = soloCurrentLevelNum + 1;
  if (next > 100) { openSoloHub(); return; }
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
  // Check global ad cooldown before showing ad
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
  // Record with server cooldown
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
