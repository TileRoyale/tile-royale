// ===== UI HELPERS =====
const FLOAT_BACK_HIDDEN = new Set([
  'gameScreen', 'lobbyScreen', 'menuScreen', 'onboardingScreen', 'appLoadScreen',
]);

// Screens where Android back gesture does nothing (game in progress)
const BACK_GESTURE_BLOCKED = new Set(['gameScreen', 'lobbyScreen']);

window.currentScreen = 'menuScreen';

function showScreen(id) {
  try { playSound('menu'); } catch(e) {}
  if (id === 'menuScreen') {
    try { startMusic('lobby'); } catch(e) {}
    try { updateMissionsBadge(); } catch(e) {}
    try { checkAndShowDailyLogin(); } catch(e) {}
    try { updateDailyLoginMenuBtn(); } catch(e) {}
  }
  try {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('active');
      window.scrollTo(0, 0);
    } else {
      console.error('[showScreen] missing:', id);
      document.getElementById('menuScreen')?.classList.add('active');
      window.scrollTo(0, 0);
    }
  } catch(e) {
    console.error('[showScreen] crash:', e);
    try {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById('menuScreen').classList.add('active');
      window.scrollTo(0, 0);
    } catch(e2) {}
  }
  window.currentScreen = id;
  const fab = document.getElementById('floatBackBtn');
  if (fab) fab.classList.toggle('visible', !FLOAT_BACK_HIDDEN.has(id));
}

// ===== ANDROID BACK GESTURE / BACK BUTTON =====
window.addEventListener('load', () => {
  if (!window.Capacitor?.isNativePlatform?.()) return;
  try {
    if (!window.Capacitor.Plugins?.App && window.Capacitor.registerPlugin) {
      window.Capacitor.registerPlugin('App', {});
    }
    const CapApp = window.Capacitor.Plugins?.App;
    if (!CapApp) return;
    CapApp.addListener('backButton', () => {
      const screen = window.currentScreen || 'menuScreen';
      if (BACK_GESTURE_BLOCKED.has(screen)) return;   // mängu ajal ei tee midagi
      if (screen === 'menuScreen') {
        try { CapApp.minimizeApp(); } catch(e) {}      // pealehel: saadab äpi tausta
        return;
      }
      showScreen('menuScreen');                         // kõigil teistel: tagasi menüüsse
    });
    console.log('[BackGesture] Android back handler registered');
  } catch(e) {
    console.warn('[BackGesture] setup failed:', e);
  }
});

// Safe navigation wrapper — prevents black screen on any crash
function safeNav(fn, fallbackScreen) {
  try { fn(); } catch(e) {
    console.error('[safeNav] crash in', fn.name || '?', e);
    showScreen(fallbackScreen || 'menuScreen');
  }
}

// ===== ONBOARDING =====
let obCurrentSlide = 0;
const OB_SLIDE_COUNT = 3;

function obNext() {
  if (obCurrentSlide < OB_SLIDE_COUNT - 1) {
    document.getElementById(`ob-slide-${obCurrentSlide}`).classList.remove('active');
    document.getElementById(`ob-dot-${obCurrentSlide}`).classList.remove('active');
    obCurrentSlide++;
    document.getElementById(`ob-slide-${obCurrentSlide}`).classList.add('active');
    document.getElementById(`ob-dot-${obCurrentSlide}`).classList.add('active');
    if (obCurrentSlide === OB_SLIDE_COUNT - 1) {
      document.getElementById('obNextBtn').textContent = "LET'S PLAY! ⚡";
      document.getElementById('obNextBtn').style.background = 'linear-gradient(135deg,#00aa44,#00ff88)';
      document.getElementById('obNextBtn').style.color = '#000';
    }
  } else {
    finishOnboarding();
  }
}

function finishOnboarding() {
  // Unlock AudioContext on first user interaction (Android requirement)
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  } else if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) {}
  }
  gameState.onboardingDone = true;

  // 🎁 Welcome gift — free starter skin
  if (!gameState.ownedSkins) gameState.ownedSkins = {};
  gameState.ownedSkins['table_neon'] = true;  // Neon Grid — first free skin
  activeSkins.table = 'table_neon';
  gameState.activeSkins = activeSkins;

  // Mark install time for first week offer
  if (!gameState.installTime) {
    gameState.installTime = Date.now();
  }

  saveState();
  showScreen('menuScreen');
  updateMenuStats();
  updateInventoryUI();
  gameState.firstGameHintPending = true;

  // Show welcome gift toast after short delay
  setTimeout(() => {
    showToast('🎁 Welcome gift — Neon Grid table unlocked!', 'var(--green)');
    playSound('achieve');
  }, 800);

  // Show first week offer after 2s
  setTimeout(showFirstWeekOffer, 2500);
}

// ===== FIRST GAME HINT =====
let firstHintTimer = null;

function showFirstGameHint() {
  if (!gameState.firstGameHintPending) return;
  const el = document.getElementById('firstHintOverlay');
  el.style.display = 'flex';
  // Hide after 4 seconds or on first tap
  firstHintTimer = setTimeout(hideFirstGameHint, 4000);
}

function hideFirstGameHint() {
  clearTimeout(firstHintTimer);
  document.getElementById('firstHintOverlay').style.display = 'none';
  gameState.firstGameHintPending = false;
  saveState();
}

function openLeaderboard() {
  lbPeriod = 'weekly';
  document.querySelectorAll('.lb-period-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('lbPeriodWeekly').classList.add('active');
  showScreen('leaderboardScreen');
  renderLeaderboard();
  try { _syncProgress(); } catch(e) {}
}

function switchLbPeriod(period, el) {
  lbPeriod = period;
  document.querySelectorAll('.lb-period-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderLeaderboard();
}

function switchLbCat(cat, el) {
  lbCategory = cat;
  document.querySelectorAll('.lb-cat-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderLeaderboard();
}

// ─── Premium Leaderboard ───────────────────────────────────────────────────────

const LB_MEDALS    = ['🥇','🥈','🥉'];
const LB_ROW_CLASS = ['lb-gold','lb-silver','lb-bronze'];
let _myTag = null; // populated from server stats on leaderboard open

// Fetch wrapper with 5s timeout — returns null on failure
async function _lbFetch(path) {
  try {
    const r = await fetch(`${getActiveServer().http}${path}`, { signal: AbortSignal.timeout(5000) });
    return r.ok ? await r.json() : null;
  } catch(e) {
    console.warn('[LB] fetch failed:', path, e.message);
    return null;
  }
}

// Render the premium player profile card using server stats
function _renderProfileCard(stats) {
  const name   = gameState.playerName || 'You';
  const avatar = getActiveAvatar().icon;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  document.getElementById('lbProfileAvatar').textContent = avatar;
  set('lbProfileName',       name);
  set('lbProfileTag',        stats?.player_tag ? `#${stats.player_tag}` : '');
  set('lbProfileWeeklyRank', stats ? `#${stats.weekly_rank || '—'}` : '#—');
  set('lbProfileAlltimeRank',stats ? `#${stats.rank || '—'}` : '#—');
  set('lbPsGames',           stats ? (stats.games || 0) : (gameState.games || 0));
  set('lbPsWins',            stats ? (stats.wins  || 0) : (gameState.wins  || 0));
  set('lbPsWinRate',         stats && stats.win_rate != null ? `${stats.win_rate}%` : (gameState.games ? Math.round((gameState.wins||0)/(gameState.games)*100) + '%' : '0%'));
  set('lbPsReaction',        stats && stats.fastest_reaction_ms ? `${stats.fastest_reaction_ms}ms` : '—');
  set('lbPsStreak',          stats && stats.best_win_streak != null ? `${stats.best_win_streak}×` : '—');
  set('lbPsTiles',           stats && stats.total_tiles_tapped ? (stats.total_tiles_tapped).toLocaleString() : '—');
}

// Render ranking rows for the period
function _renderRankingRows(rankings) {
  const list = document.getElementById('lbList');
  list.innerHTML = '';

  if (!rankings || rankings.length === 0) {
    list.innerHTML = '<div class="lb-loading">📊 No games this period yet.<br>Play a multiplayer match to appear here!</div>';
    return;
  }

  const myEntry = rankings.find(r => r.player_id === PLAYER_ID);

  rankings.forEach(r => {
    const rank  = Number(r.rank);
    const isYou = r.player_id === PLAYER_ID;
    const medal = rank <= 3 ? LB_MEDALS[rank - 1] : `#${rank}`;
    const rowCls = rank <= 3 ? LB_ROW_CLASS[rank - 1] : '';
    const youCls = isYou ? ' lb-you' : '';

    const row = document.createElement('div');
    row.className = `lb-entry ${rowCls}${youCls} pp-clickable`;
    row.onclick = () => openPublicProfile(r.player_id);
    row.innerHTML =
      `<div class="lb-entry-rank">${medal}</div>` +
      `<div class="lb-entry-avatar">${r.avatar}</div>` +
      `<div class="lb-entry-name">` +
        `<div class="lb-entry-name-line">${r.player_name}` +
          (isYou ? ` <span style="font-size:10px;color:var(--fire);letter-spacing:1px;">(YOU)</span>` : '') +
        `</div>` +
        (r.player_tag ? `<div class="lb-entry-tag">#${r.player_tag}</div>` : '') +
      `</div>` +
      `<div class="lb-entry-win-info">` +
        `<div class="lb-entry-wins">${r.wins} W</div>` +
        `<div class="lb-entry-winrate">${r.win_rate != null ? r.win_rate + '% WR' : ''}</div>` +
      `</div>`;
    list.appendChild(row);
  });

  // Current player not in top 50 — append at bottom
  if (!myEntry && (gameState.wins || 0) > 0) {
    const sep = document.createElement('div');
    sep.style.cssText = 'text-align:center;color:var(--muted);font-size:9px;padding:10px;letter-spacing:3px;';
    sep.textContent = '— YOUR POSITION —';
    list.appendChild(sep);

    const row = document.createElement('div');
    row.className = 'lb-entry lb-you';
    row.innerHTML =
      `<div class="lb-entry-rank">#—</div>` +
      `<div class="lb-entry-avatar">${getActiveAvatar().icon}</div>` +
      `<div class="lb-entry-name">` +
        `<div class="lb-entry-name-line">${gameState.playerName || 'You'} <span style="font-size:10px;color:var(--fire);">(YOU)</span></div>` +
        (_myTag ? `<div class="lb-entry-tag">#${_myTag}</div>` : '') +
      `</div>` +
      `<div class="lb-entry-win-info"><div class="lb-entry-wins">${gameState.wins || 0} W</div></div>`;
    list.appendChild(row);
  }
}

// Build a VS comparison card
function _vsCard(label, youVal, globalVal, isHigherBetter = true) {
  if (youVal == null || globalVal == null || parseFloat(globalVal) === 0) return '';
  const you = parseFloat(youVal), glob = parseFloat(globalVal);
  let status, badgeText;
  if (isHigherBetter) {
    status    = you > glob ? 'above' : you < glob ? 'below' : 'equal';
    badgeText = you > glob ? '▲ ABOVE AVERAGE' : you < glob ? '▼ BELOW AVERAGE' : '— AVERAGE';
  } else {
    // Lower is better (reaction time, avg placement)
    status    = you < glob ? 'above' : you > glob ? 'below' : 'equal';
    badgeText = you < glob ? '▲ BETTER THAN AVERAGE' : you > glob ? '▼ BELOW AVERAGE' : '— AVERAGE';
  }
  return `<div class="lb-vs-card">
    <div class="lb-vs-label">${label}</div>
    <div class="lb-vs-cols">
      <div class="lb-vs-col">
        <div class="lb-vs-col-lbl">YOU</div>
        <div class="lb-vs-col-val you">${youVal}</div>
      </div>
      <div class="lb-vs-col">
        <div class="lb-vs-col-lbl">GLOBAL AVG</div>
        <div class="lb-vs-col-val global">${globalVal}</div>
      </div>
    </div>
    <div class="lb-vs-badge ${status}">${badgeText}</div>
  </div>`;
}

// Render player vs global comparison section
function _renderVsGlobal(stats, globalStats) {
  const section = document.getElementById('lbVsSection');
  const grid    = document.getElementById('lbVsGrid');
  if (!section || !grid || !stats || !globalStats) { if (section) section.style.display = 'none'; return; }

  const fmt = n => n != null ? Number(n) : null;

  const html = [
    _vsCard('WIN RATE',
      stats.win_rate != null   ? `${stats.win_rate}%`         : null,
      globalStats.avg_win_rate ? `${globalStats.avg_win_rate}%`: null,
      true),
    _vsCard('AVERAGE PLACEMENT',
      stats.avg_placement      ? `${stats.avg_placement}`     : null,
      globalStats.avg_placement? `${globalStats.avg_placement}`: null,
      false), // lower is better
    _vsCard('FASTEST REACTION',
      stats.fastest_reaction_ms    ? `${stats.fastest_reaction_ms}ms`        : null,
      globalStats.avg_fastest_reaction_ms ? `${Math.round(globalStats.avg_fastest_reaction_ms)}ms` : null,
      false), // lower is better
    _vsCard('TOTAL TILES TAPPED',
      stats.total_tiles_tapped ? `${Number(stats.total_tiles_tapped).toLocaleString()}` : null,
      globalStats.avg_total_tiles_tapped ? `${Math.round(globalStats.avg_total_tiles_tapped).toLocaleString()}` : null,
      true),
    _vsCard('BEST WIN STREAK',
      stats.best_win_streak != null ? `${stats.best_win_streak}×` : null,
      globalStats.avg_best_win_streak ? `${Number(globalStats.avg_best_win_streak).toFixed(1)}×` : null,
      true),
  ].filter(Boolean).join('');

  if (!html) { section.style.display = 'none'; return; }

  grid.innerHTML = html;
  section.style.display = 'block';
}

// ─── World Records ─────────────────────────────────────────────────────────────

function _renderWorldRecords(records) {
  const section = document.getElementById('lbWorldRecords');
  const grid    = document.getElementById('lbWrGrid');
  if (!section || !grid) return;

  if (!records || !records.dbAvailable) { section.style.display = 'none'; return; }

  const items = [
    { icon: '⚡', label: 'Fastest Reaction',  val: records.fastest_reaction_ms    ? `${records.fastest_reaction_ms}ms`                 : null, player: records.fastest_reaction_player,    tag: records.fastest_reaction_player_tag,    avatar: records.fastest_reaction_avatar,    pid: records.fastest_reaction_player_id },
    { icon: '🔥', label: 'Longest Win Streak',val: records.longest_win_streak      ? `${records.longest_win_streak}×`                   : null, player: records.longest_win_streak_player,  tag: records.longest_win_streak_player_tag,  avatar: records.longest_win_streak_avatar,  pid: records.longest_win_streak_player_id },
    { icon: '🏆', label: 'Most Wins',         val: records.most_wins               ? `${records.most_wins}`                             : null, player: records.most_wins_player,           tag: records.most_wins_player_tag,           avatar: records.most_wins_avatar,           pid: records.most_wins_player_id },
    { icon: '🗓️', label: 'Most Weekly Wins',  val: records.most_weekly_wins        ? `${records.most_weekly_wins}`                     : null, player: records.most_weekly_wins_player,    tag: records.most_weekly_wins_player_tag,    avatar: records.most_weekly_wins_avatar,    pid: records.most_weekly_wins_player_id },
    { icon: '🎯', label: 'Most Tiles Tapped', val: records.most_tiles_tapped       ? Number(records.most_tiles_tapped).toLocaleString() : null, player: records.most_tiles_tapped_player,  tag: records.most_tiles_tapped_player_tag,   avatar: records.most_tiles_tapped_avatar,   pid: records.most_tiles_tapped_player_id },
  ].filter(i => i.val !== null);

  if (!items.length) {
    grid.innerHTML = '<div class="lb-no-data">More players are needed to establish world records.</div>';
    section.style.display = 'block';
    return;
  }

  grid.innerHTML = items.map(i =>
    `<div class="lb-wr-item">` +
      `<div class="lb-wr-icon">${i.icon}</div>` +
      `<div class="lb-wr-body">` +
        `<div class="lb-wr-label">${i.label}</div>` +
        `<div class="lb-wr-value">${i.val}</div>` +
        `<div class="lb-wr-holder pp-clickable" ${i.pid ? `onclick="openPublicProfile('${i.pid}')"` : ''}>` +
          `${i.avatar ? i.avatar + ' ' : ''}${i.player || ''}${i.tag ? '<span class="lb-wr-tag">#' + i.tag + '</span>' : ''}` +
        `</div>` +
      `</div>` +
    `</div>`
  ).join('');
  section.style.display = 'block';
}

// ─── Player Percentile Standing ────────────────────────────────────────────────

function _pctDisplay(p) {
  if (p == null) return '—';
  if (p <= 1)  return 'TOP 1%';
  if (p <= 5)  return 'TOP 5%';
  if (p <= 10) return 'TOP 10%';
  if (p <= 25) return 'TOP 25%';
  if (p <= 50) return 'TOP 50%';
  return 'BOTTOM 50%';
}

function _pctTier(p) {
  if (p == null) return 'none';
  if (p <= 1)  return 'tier1';
  if (p <= 5)  return 'tier2';
  if (p <= 10) return 'tier3';
  if (p <= 25) return 'tier4';
  return 'tier5';
}

function _renderStanding(playerStats, globalStats, percentiles) {
  const section = document.getElementById('lbStanding');
  const grid    = document.getElementById('lbStandingGrid');
  if (!section || !grid) return;

  // Require at least 5 players for meaningful percentiles
  if (!percentiles || !globalStats || (globalStats.total_players || 0) < 5) {
    section.style.display = 'none';
    return;
  }

  const items = [
    { icon: '🏆', label: 'Wins',          pct: percentiles.wins_pct     != null ? Number(percentiles.wins_pct)     : null },
    { icon: '📈', label: 'Win Rate',       pct: percentiles.win_rate_pct != null ? Number(percentiles.win_rate_pct) : null },
    { icon: '⚡', label: 'Reaction Speed', pct: playerStats && playerStats.fastest_reaction_ms
                                               ? (percentiles.reaction_pct != null ? Number(percentiles.reaction_pct) : null)
                                               : null },
    { icon: '🎯', label: 'Tiles Tapped',   pct: percentiles.tiles_pct    != null ? Number(percentiles.tiles_pct)   : null },
  ];

  grid.innerHTML = items.map(i => {
    const label = _pctDisplay(i.pct);
    const tier  = _pctTier(i.pct);
    return `<div class="lb-standing-item">` +
      `<div class="lb-standing-icon">${i.icon}</div>` +
      `<div class="lb-standing-label">${i.label}</div>` +
      `<div class="lb-standing-pct ${tier}">${label}</div>` +
    `</div>`;
  }).join('');
  section.style.display = 'block';
}

// ─── Solo leaderboard renderer ────────────────────────────────────────────────

async function _renderSoloLeaderboard() {
  const myStatsEl = document.getElementById('lbSoloMyStats');
  const lbListEl  = document.getElementById('lbSoloList');

  // Show player's own solo progress
  const totalStars = typeof soloGetTotalStars === 'function' ? soloGetTotalStars() : 0;
  const progress   = typeof soloGetProgress  === 'function' ? soloGetProgress()  : {};
  const unlockedLv = progress.unlockedLevel || 1;
  const levels     = progress.levels || {};
  const completed  = Object.values(levels).filter(l => l.completed).length;
  const threeStars = Object.values(levels).filter(l => (l.stars || 0) >= 3).length;

  if (myStatsEl) {
    const stat = (val, lbl) =>
      `<div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;">
        <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:2px;color:var(--text);">${val}</div>
        <div style="font-size:10px;color:var(--muted);letter-spacing:1px;">${lbl}</div>
      </div>`;
    myStatsEl.innerHTML =
      stat(`${totalStars} / 300`, '⭐ TOTAL STARS') +
      stat(`${unlockedLv - 1} / 100`, '✅ LEVELS DONE') +
      stat(threeStars, '⭐⭐⭐ PERFECT') +
      stat(`${Math.round(totalStars / 300 * 100)}%`, '🏆 COMPLETION');
  }

  // Try to fetch global solo rankings from server
  if (lbListEl) {
    lbListEl.innerHTML = '<div class="lb-loading">⏳ Loading...</div>';
    const data = PLAYER_ID ? await _lbFetch(`/solo-rankings`) : null;
    if (data && data.rankings && data.rankings.length > 0) {
      _renderRankingRows(data.rankings);
      if (lbListEl) lbListEl.innerHTML = document.getElementById('lbList').innerHTML;
    } else {
      lbListEl.innerHTML =
        '<div class="lb-loading" style="text-align:center;padding:20px;">' +
          '🎯 Solo rankings coming soon!<br>' +
          '<span style="font-size:11px;color:var(--muted);">Complete levels to submit your score.</span>' +
        '</div>';
    }
  }
}

// ─── Main leaderboard renderer ─────────────────────────────────────────────────

async function renderLeaderboard() {
  const list = document.getElementById('lbList');
  if (!list) return;
  list.innerHTML = '<div class="lb-loading">⏳ Loading rankings...</div>';

  // Show/hide solo section
  const soloSection = document.getElementById('lbSoloSection');
  const hallOfFame  = document.getElementById('lbHallOfFame');

  // ── Solo tab ─────────────────────────────────────────────────────────────────
  if (lbPeriod === 'solo') {
    list.innerHTML = '';
    if (soloSection) soloSection.style.display = 'block';
    if (hallOfFame)  hallOfFame.style.display  = 'none';
    ['lbVsSection','lbWorldRecords','lbStanding','lbProfileCard'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    _renderSoloLeaderboard();
    return;
  }

  // Restore sections hidden by solo tab
  if (soloSection) soloSection.style.display = 'none';
  if (hallOfFame)  hallOfFame.style.display  = '';
  const profileCard = document.getElementById('lbProfileCard');
  if (profileCard) profileCard.style.display = '';

  // ── Friends tab ─────────────────────────────────────────────────────────────
  if (lbPeriod === 'friends') {
    const [statsData, friendsData] = await Promise.all([
      PLAYER_ID ? _lbFetch(`/playerstats/${PLAYER_ID}`) : null,
      PLAYER_ID ? _lbFetch(`/friends/${PLAYER_ID}/leaderboard?period=alltime`) : null,
    ]);
    const playerStats = statsData?.found ? statsData : null;
    if (playerStats?.player_tag) _myTag = playerStats.player_tag;
    _renderProfileCard(playerStats);
    _renderRankingRows(friendsData?.rankings || []);
    // Hide global-only sections
    ['lbVsSection','lbWorldRecords','lbStanding'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    return;
  }

  // ── Global tabs (weekly / alltime) ──────────────────────────────────────────
  const [rankData, statsData, globalData, recordsData, percentilesData] = await Promise.all([
    _lbFetch(`/rankings?period=${lbPeriod}`),
    PLAYER_ID ? _lbFetch(`/playerstats/${PLAYER_ID}`) : null,
    _lbFetch('/globalstats'),
    _lbFetch('/worldrecords'),
    PLAYER_ID ? _lbFetch(`/playerpercentiles/${PLAYER_ID}`) : null,
  ]);

  const rankings    = rankData?.rankings   || [];
  const playerStats = statsData?.found ? statsData : null;
  const globalStats = globalData?.dbAvailable ? globalData : null;
  const records     = recordsData?.dbAvailable ? recordsData : null;
  const percentiles = percentilesData?.found ? percentilesData : null;

  if (playerStats?.player_tag) _myTag = playerStats.player_tag;

  _renderProfileCard(playerStats);
  _renderRankingRows(rankings);
  _renderVsGlobal(playerStats, globalStats);
  _renderWorldRecords(records);
  _renderStanding(playerStats, globalStats, percentiles);
}


function switchAchMainTab(tab, el) {
  document.querySelectorAll('.ach-main-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('achPanel').style.display   = tab === 'ach'   ? 'block' : 'none';
  document.getElementById('statsPanel').style.display = tab === 'stats' ? 'block' : 'none';
  if (tab === 'ach')   document.getElementById('achScreenTitle').textContent = '🏆 ACHIEVEMENTS';
  if (tab === 'stats') { document.getElementById('achScreenTitle').textContent = '📊 STATISTICS'; renderStats(); }
}

async function renderStats() {
  initAchStats();
  const s = gameState.achStats || {};
  const gs = gameState;
  const games = gs.games || 0;
  const wins  = gs.wins  || 0;
  const taps  = s.totalTaps || 0;
  const wrong = s.wrongTaps || 0;

  function wr(w, g) { return g > 0 ? Math.round(w/g*100) + '%' : '0%'; }
  function fmt(n) { return (n||0).toLocaleString(); }

  // General — local values shown immediately; server overwrites below
  set('st-games',   fmt(games));
  set('st-wins',    fmt(wins));
  set('st-winrate', wr(wins, games));
  set('st-streak',  fmt(s.bestWinStreak || 0));
  set('st-top3',    fmt(s.top3 || 0));
  set('st-top5',    fmt(s.top5 || 0));

  // By mode (local only — server stores mode but no dedicated breakdown endpoint)
  const rushG = s.rushGames || 0, rushW = s.rushWins || 0;
  const buckG = s.buckshotGames || 0, buckW = s.buckshotWins || 0;
  const wildG = s.wildGames || 0, wildW = s.wildWins || 0;
  set('st-rushGames',    fmt(rushG)); set('st-rushWins',    fmt(rushW)); set('st-rushWr',    wr(rushW, rushG));
  set('st-buckshotGames',fmt(buckG)); set('st-buckshotWins',fmt(buckW)); set('st-buckshotWr',wr(buckW, buckG));
  set('st-wildGames',    fmt(wildG)); set('st-wildWins',    fmt(wildW)); set('st-wildWr',    wr(wildW, wildG));

  // Tapping (local only)
  const totalTaps = taps + wrong;
  set('st-taps',       fmt(taps));
  set('st-tapsPerGame', games > 0 ? Math.round(taps/games) : 0);
  set('st-wrongTaps',  fmt(wrong));
  set('st-accuracy',   totalTaps > 0 ? Math.round(taps/totalTaps*100) + '%' : '100%');

  // Economy (local only)
  set('st-diamonds',      fmt(gs.diamonds || 0));
  set('st-totalDiamonds', fmt(s.totalDiamonds || 0));
  set('st-skinsBought',   fmt(Object.keys(gs.ownedSkins || {}).length));
  set('st-itemsUsed',     fmt(s.itemsUsed || 0));

  // Progression (local only)
  set('st-level',    gs.level || 1);
  set('st-xp',       fmt(gs.xp || 0));
  set('st-achCount', (gs.unlockedAch || []).length + ' / ' + ACHIEVEMENTS.length);
  set('st-spectate', fmt(s.spectateSessions || 0));

  // Render initial percentile estimates while server fetch is in-flight
  renderPercentile('pctWins',    'Wins',          fmt(wins),          computePct(wins,    [[0,50],[10,70],[50,85],[100,92],[200,96],[500,99],[999,100]]));
  renderPercentile('pctWinRate', 'Win Rate',       wr(wins, games),    computePct(wins/Math.max(games,1)*100, [[0,20],[10,40],[20,55],[35,70],[50,82],[65,92],[80,97],[100,100]]), true);
  renderPercentile('pctTaps',    'Taps',           fmt(taps),          computePct(taps,    [[0,40],[100,55],[500,65],[2000,75],[5000,85],[20000,93],[100000,99]]));
  renderPercentile('pctLevel',   'Reaction Time',  '…',                50);
  renderPercentile('pctDiamonds','Diamonds',       fmt(gs.diamonds||0),computePct(gs.diamonds||0, [[0,30],[500,50],[2000,65],[5000,75],[15000,85],[50000,94],[100000,99]]));

  // ── Live server data — replaces local estimates with real DB values ────────
  if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) return;
  try {
    const [sStats, sPct] = await Promise.all([
      _lbFetch(`/playerstats/${PLAYER_ID}`),
      _lbFetch(`/playerpercentiles/${PLAYER_ID}`),
    ]);

    // Update core stats from server (authoritative source)
    if (sStats?.found) {
      set('st-games',   fmt(sStats.games            || 0));
      set('st-wins',    fmt(sStats.wins             || 0));
      set('st-winrate', sStats.win_rate != null ? sStats.win_rate + '%' : '0%');
      set('st-streak',  fmt(sStats.best_win_streak  || 0));
      set('st-top3',    fmt(sStats.top3             || 0));
      set('st-top5',    fmt(sStats.top5             || 0));
    }

    // Update percentile bars from real DB PERCENT_RANK() values.
    // Server returns 0 = best player, 100 = worst → invert for bar display (higher bar = better).
    if (sPct?.found) {
      const toBar = p => 100 - Math.max(0, Math.min(100, Number(p) || 0));
      const sW  = sStats?.wins            ?? wins;
      const sWr = sStats?.win_rate != null ? sStats.win_rate + '%' : wr(wins, games);
      const sT  = sStats?.total_tiles_tapped ?? taps;
      const sR  = sStats?.fastest_reaction_ms;

      if (sPct.wins_pct     != null) renderPercentile('pctWins',    'Wins',          fmt(sW),              toBar(sPct.wins_pct));
      if (sPct.win_rate_pct != null) renderPercentile('pctWinRate', 'Win Rate',       sWr,                  toBar(sPct.win_rate_pct));
      if (sPct.tiles_pct    != null) renderPercentile('pctTaps',    'Taps',           fmt(sT),              toBar(sPct.tiles_pct));
      if (sPct.reaction_pct != null) renderPercentile('pctLevel',   'Reaction Time',  sR ? sR + 'ms' : '—', toBar(sPct.reaction_pct));
      if (sPct.diamonds_pct != null) renderPercentile('pctDiamonds','Diamonds',       fmt(gs.diamonds || 0), toBar(sPct.diamonds_pct));
    }
  } catch(e) {}
}

// Interpolate percentile from bracket table
function computePct(val, brackets) {
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (val >= brackets[i][0]) {
      if (i === brackets.length - 1) return brackets[i][1];
      const [v0, p0] = brackets[i];
      const [v1, p1] = brackets[i + 1];
      const t = Math.min(1, (val - v0) / (v1 - v0));
      return Math.round(p0 + (p1 - p0) * t);
    }
  }
  return brackets[0][1];
}

function renderPercentile(elId, label, displayVal, pct, isWinRate = false) {
  const el = document.getElementById(elId);
  if (!el) return;

  // Color and tier based on percentile
  let color, tierLabel;
  if (pct >= 99)      { color = '#00e5ff'; tierLabel = 'Top 1%';  }
  else if (pct >= 95) { color = '#ffd700'; tierLabel = 'Top 5%';  }
  else if (pct >= 85) { color = '#ff8c00'; tierLabel = 'Top 15%'; }
  else if (pct >= 70) { color = '#9b59b6'; tierLabel = 'Top 30%'; }
  else if (pct >= 50) { color = '#00ff88'; tierLabel = 'Top 50%'; }
  else                { color = '#555570'; tierLabel = 'Bottom half'; }

  el.innerHTML = `
    <div class="percentile-label">${label}</div>
    <div class="percentile-bar-wrap">
      <div class="percentile-bar-bg">
        <div class="percentile-bar-fill" style="width:${pct}%; background:linear-gradient(90deg, #333, ${color});"></div>
      </div>
      <div class="percentile-marker" style="left:${pct}%">🔺</div>
    </div>
    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
      <div class="percentile-val" style="color:${color}">${pct}%</div>
      <div class="percentile-tier" style="color:${color}">${tierLabel}</div>
    </div>
  `;
  // Animate bar after render
  setTimeout(() => {
    const fill = el.querySelector('.percentile-bar-fill');
    const marker = el.querySelector('.percentile-marker');
    if (fill) fill.style.width = pct + '%';
    if (marker) marker.style.left = pct + '%';
  }, 50);
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ===== ABOUT & LEGAL =====
function openAbout() { showScreen('aboutScreen'); }
function openLink(url) { if (typeof Capacitor !== 'undefined') Capacitor.Plugins.Browser?.open({url}); else window.open(url,'_blank'); }
function contactSupport() { openLink('mailto:TileRoyaleGame@gmail.com?subject=Tile Royale Support'); }
function rateApp() {
  showToast('⭐ Thank you! Redirecting to store...', 'var(--gold)');
  setTimeout(() => openLink('https://play.google.com/store/apps/details?id=com.tileroyale'), 1000);
}

const LEGAL_CONTENT = {
  privacy: {
    title: 'PRIVACY POLICY',
    html: `
      <p><b style="color:var(--text)">Last updated: January 1, 2025</b></p>
      <p>Tile Royale ("we", "our", or "the game") is committed to protecting your privacy. This policy explains what data we collect and how we use it.</p>

      <h2>1. Data We Collect</h2>
      <p>We collect the following data to provide and improve the game:</p>
      <ul>
        <li><b style="color:var(--text)">Game progress</b> — wins, diamonds, achievements, skins. Stored locally on your device.</li>
        <li><b style="color:var(--text)">Device identifiers</b> — anonymous device ID for anti-cheat and fraud prevention.</li>
        <li><b style="color:var(--text)">Purchase records</b> — transaction IDs for in-app purchases, processed by Google Play / Apple App Store. We do not store payment card details.</li>
        <li><b style="color:var(--text)">Analytics</b> — anonymous gameplay events (game started, mode selected, session length) to improve the game. No personal identifiers are attached.</li>
      </ul>

      <h2>2. Data We Do NOT Collect</h2>
      <ul>
        <li>Your real name, email address, or phone number (unless you contact support)</li>
        <li>Location data</li>
        <li>Contacts or other apps on your device</li>
        <li>Camera or microphone data</li>
      </ul>

      <h2>3. How We Use Your Data</h2>
      <ul>
        <li>To save and sync your game progress</li>
        <li>To process in-app purchases and prevent fraud</li>
        <li>To detect cheating and maintain fair gameplay</li>
        <li>To improve game balance and fix bugs</li>
      </ul>

      <h2>4. Third-Party Services</h2>
      <p>We use the following third-party services:</p>
      <ul>
        <li><b style="color:var(--text)">Google Play / Apple App Store</b> — for payments and app distribution</li>
        <li><b style="color:var(--text)">Firebase Analytics</b> — for anonymous usage statistics</li>
        <li><b style="color:var(--text)">Colyseus</b> — for real-time multiplayer matchmaking</li>
      </ul>

      <h2>5. Data Retention</h2>
      <p>Game progress is stored locally on your device and is deleted when you uninstall the app or use the Reset Progress function. Anonymous analytics data is retained for 12 months.</p>

      <h2>6. Children's Privacy</h2>
      <p>Tile Royale is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us data, contact us immediately.</p>

      <h2>7. Your Rights</h2>
      <p>You may request deletion of any data associated with your account by contacting TileRoyaleGame@gmail.com.</p>

      <h2>8. Contact</h2>
      <p>Questions? Email us: <b style="color:var(--diamond)">TileRoyaleGame@gmail.com</b></p>
    `
  },
  terms: {
    title: 'TERMS OF SERVICE',
    html: `
      <p><b style="color:var(--text)">Last updated: January 1, 2025</b></p>
      <p>By downloading or playing Tile Royale, you agree to these Terms of Service. Please read them carefully.</p>

      <h2>1. Eligibility</h2>
      <p>You must be at least 13 years old to play Tile Royale. By playing, you confirm you meet this requirement. In-app purchases require you to be 18 or older, or have parental consent.</p>

      <h2>2. Virtual Currency & Purchases</h2>
      <ul>
        <li>Diamonds are virtual currency with no real-world monetary value.</li>
        <li>All purchases are final and non-refundable, except where required by law.</li>
        <li>We reserve the right to modify diamond prices and item availability at any time.</li>
        <li>Diamonds cannot be transferred between accounts or exchanged for real money.</li>
        <li>King of the Hill prize pool rewards are in virtual diamonds only, not real money.</li>
      </ul>

      <h2>3. Fair Play</h2>
      <ul>
        <li>You may not use bots, auto-clickers, scripts, or any automation tools.</li>
        <li>You may not exploit bugs or glitches. Report them to support instead.</li>
        <li>You may not create multiple accounts to abuse promotions or referral codes.</li>
        <li>Violations may result in account suspension or permanent ban without refund.</li>
      </ul>

      <h2>4. User Conduct</h2>
      <p>You agree not to use the game to harass others, spread harmful content, or violate any applicable laws.</p>

      <h2>5. Intellectual Property</h2>
      <p>All game content — including art, sound, code, and design — is owned by Tile Royale. You may not copy, modify, or distribute any game content without written permission.</p>

      <h2>6. Availability</h2>
      <p>We do not guarantee uninterrupted access to the game. We may update, modify, or discontinue features at any time. We are not liable for any loss of progress due to technical issues.</p>

      <h2>7. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, Tile Royale is not liable for any indirect, incidental, or consequential damages arising from your use of the game.</p>

      <h2>8. Changes to Terms</h2>
      <p>We may update these terms at any time. Continued use of the game after changes constitutes acceptance of the new terms.</p>

      <h2>9. Contact</h2>
      <p>Questions? Email: <b style="color:var(--diamond)">TileRoyaleGame@gmail.com</b></p>
    `
  },
  licenses: {
    title: 'OPEN SOURCE LICENSES',
    html: `
      <p>Tile Royale is built with the following open source technologies:</p>

      <h2>Web Audio API</h2>
      <p>Browser-native audio API. Part of the Web Platform specification. No additional license required.</p>

      <h2>Capacitor (Ionic)</h2>
      <p>MIT License. Copyright © 2017-present Drifty Co.<br>
      Permission is hereby granted, free of charge, to any person obtaining a copy of this software to deal in the Software without restriction.</p>

      <h2>Colyseus</h2>
      <p>MIT License. Copyright © 2016 Endel Dreyer.<br>
      Multiplayer game server framework for Node.js.</p>

      <h2>Bebas Neue (Font)</h2>
      <p>SIL Open Font License 1.1. Copyright © Ryoichi Tsunekawa.<br>
      This font is free to use, study, modify and redistribute.</p>

      <h2>Rajdhani (Font)</h2>
      <p>SIL Open Font License 1.1. Copyright © Indian Type Foundry.<br>
      This font is free to use, study, modify and redistribute.</p>

      <h2>Firebase</h2>
      <p>Apache License 2.0. Copyright © Google LLC.<br>
      Licensed under the Apache License, Version 2.0.</p>

      <p style="margin-top:16px;">Full license texts available at: <b style="color:var(--diamond)">opensource.org/licenses</b></p>
    `
  }
};

function openLegal(type) {
  const content = LEGAL_CONTENT[type];
  if (!content) return;
  document.getElementById('legalTitle').textContent = content.title;
  document.getElementById('legalContent').innerHTML = content.html;
  showScreen('legalScreen');
}

// ===== FIRST WEEK OFFER =====
const FIRST_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isFirstWeekActive() {
  if (!gameState.installTime) return false;
  if (gameState.firstWeekClaimed) return false;
  return Date.now() - gameState.installTime < FIRST_WEEK_MS;
}

function getFirstWeekTimer() {
  if (!gameState.installTime) return '';
  const expires = gameState.installTime + FIRST_WEEK_MS;
  const diff = Math.max(0, expires - Date.now());
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `Offer expires in ${d}d ${h}h ${m}m`;
}

function showFirstWeekOffer() {
  if (!isFirstWeekActive()) return;
  const el = document.getElementById('firstWeekOverlay');
  if (!el) return;
  document.getElementById('firstWeekTimer').textContent = getFirstWeekTimer();
  el.classList.add('show');
}

function closeFirstWeekOffer() {
  document.getElementById('firstWeekOverlay').classList.remove('show');
}

async function buyFirstWeekOffer() {
  const deliverOffer = () => {
    gameState.firstWeekClaimed = true;
    gameState.diamonds = (gameState.diamonds || 0) + 300;
    gameState.totalDiamonds = (gameState.totalDiamonds || 0) + 300;
    if (!gameState.ownedSkins) gameState.ownedSkins = {};
    gameState.ownedSkins['table_lava'] = true;
    addItemToInventory('crystal', 5);
    gameState.tickets = (gameState.tickets || 0) + 5;
    initAchStats();
    gameState.achStats.totalSpentCents = (gameState.achStats.totalSpentCents || 0) + 199;
    checkAchievements();
    saveState(); updateMenuStats(); updateInventoryUI();
    closeFirstWeekOffer();
    showToast('🎉 Welcome offer claimed! Enjoy Tile Royale!', 'var(--gold)');
    playSound('achieve'); vibrate([50,50,200]);
  };

  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Billing) {
    try {
      showToast('Opening store...', 'var(--blue)');
      await nativePurchase('offer.firstweek');
      deliverOffer();
    } catch (e) {
      const msg = (e && (e.message || e.code || e));
      if (msg !== 'cancelled') showToast('Purchase failed. Try again.', 'var(--red)');
    }
    return;
  }

  // Web/dev fallback
  deliverOffer();
}

// Check first week offer on menu open (returning users)
function checkFirstWeekOnMenu() {
  if (!isFirstWeekActive()) return;
  // Show once per session, not every time
  if (window._firstWeekShownThisSession) return;
  window._firstWeekShownThisSession = true;
  // Show after 3 games played (user has seen value)
  if ((gameState.games || 0) >= 3) {
    setTimeout(showFirstWeekOffer, 1000);
  }
}

