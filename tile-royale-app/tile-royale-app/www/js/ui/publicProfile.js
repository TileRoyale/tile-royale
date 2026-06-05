// ===== PUBLIC PLAYER PROFILE OVERLAY =====
// Opens a premium card overlay for any player via openPublicProfile(playerId).
// Lazy-loads data from /publicprofile/:playerId with 60s client-side cache.

const _ppCache = new Map(); // playerId → { data, ts }
const _PP_TTL  = 60_000;

function openPublicProfile(playerId) {
  if (!playerId) return;
  const overlay = document.getElementById('playerProfileOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  _ppLoad(playerId);
}

function closePublicProfile() {
  const overlay = document.getElementById('playerProfileOverlay');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
}

// Close on backdrop click
function _ppBackdropClick(e) {
  if (e.target === document.getElementById('playerProfileOverlay')) closePublicProfile();
}

async function _ppLoad(playerId) {
  const body = document.getElementById('ppBody');
  if (!body) return;

  body.innerHTML = _ppSkeleton();

  const cached = _ppCache.get(playerId);
  if (cached && Date.now() - cached.ts < _PP_TTL) {
    _ppRender(cached.data);
    return;
  }

  try {
    const viewerParam = (typeof PLAYER_ID !== 'undefined' && PLAYER_ID)
      ? `?viewerId=${encodeURIComponent(PLAYER_ID)}` : '';
    const resp = await fetch(
      `${getActiveServer().http}/publicprofile/${encodeURIComponent(playerId)}${viewerParam}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    if (!data.found) {
      body.innerHTML = '<div class="pp-error">Player not found.</div>';
      return;
    }
    _ppCache.set(playerId, { data, ts: Date.now() });
    _ppRender(data);
  } catch (e) {
    body.innerHTML = '<div class="pp-error">Could not load profile — check connection.</div>';
  }
}

function _ppSkeleton() {
  return `
    <div class="pp-skeleton-block" style="width:64px;height:64px;border-radius:50%;margin:0 auto 12px;"></div>
    <div class="pp-skeleton-block" style="width:60%;height:22px;margin:0 auto 8px;"></div>
    <div class="pp-skeleton-block" style="width:30%;height:14px;margin:0 auto 20px;"></div>
    <div class="pp-skeleton-block" style="width:100%;height:90px;border-radius:12px;margin-bottom:12px;"></div>
    <div class="pp-skeleton-block" style="width:100%;height:60px;border-radius:12px;margin-bottom:12px;"></div>
    <div class="pp-skeleton-block" style="width:100%;height:44px;border-radius:12px;"></div>
  `;
}

// ── League helpers (mirrors xp.js LEAGUES, no import needed) ─────────────────

const _PP_LEAGUES = [
  { name:'Bronze',  icon:'🥉', threshold:0    },
  { name:'Silver',  icon:'🥈', threshold:100  },
  { name:'Gold',    icon:'🥇', threshold:250  },
  { name:'Platinum',icon:'🔮', threshold:500  },
  { name:'Diamond', icon:'💎', threshold:800  },
  { name:'Master',  icon:'⚔️', threshold:1200 },
  { name:'Legend',  icon:'👑', threshold:1500 },
];

function _ppLeague(pts) {
  let l = _PP_LEAGUES[0];
  for (const x of _PP_LEAGUES) { if (pts >= x.threshold) l = x; else break; }
  return l;
}

function _ppNextLeague(pts) {
  for (const x of _PP_LEAGUES) { if (pts < x.threshold) return x; }
  return null;
}

// ── Date formatting ───────────────────────────────────────────────────────────

function _ppFmtJoined(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('default', { month: 'short', year: 'numeric' });
}

function _ppFmtLastSeen(ts) {
  if (!ts) return '—';
  const min = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1)  return 'Just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr  < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d   < 7)  return `${d}d ago`;
  return _ppFmtJoined(ts);
}

// ── Main render ───────────────────────────────────────────────────────────────

function _ppRender(d) {
  const body = document.getElementById('ppBody');
  if (!body) return;

  const isOwn = (typeof PLAYER_ID !== 'undefined') && d.player_id === PLAYER_ID;
  const wr    = d.win_rate       != null ? `${d.win_rate}%`                             : '—';
  const react = d.fastest_reaction_ms    ? `${d.fastest_reaction_ms}ms`                : '—';
  const tiles = d.total_tiles_tapped     ? Number(d.total_tiles_tapped).toLocaleString(): '—';
  const wrank = (d.weekly_rank  >= 9999 || !d.weekly_rank)  ? '—' : `#${d.weekly_rank}`;
  const arank = (d.alltime_rank >= 9999 || !d.alltime_rank) ? '—' : `#${d.alltime_rank}`;

  // ── Premium rank badges ───────────────────────────────────────────────────
  const rankBadges = [];
  if (d.weekly_rank  && d.weekly_rank  <= 10) rankBadges.push('<span class="pp-rank-badge pp-rank-badge--weekly">⭐ TOP 10 WEEKLY</span>');
  if (d.alltime_rank && d.alltime_rank <= 10) rankBadges.push('<span class="pp-rank-badge pp-rank-badge--elite">👑 ALL-TIME ELITE</span>');

  // ── Trophy Road ───────────────────────────────────────────────────────────
  let trophyHtml = '';
  try {
    // Own profile: use live local state (always accurate); other: use server-synced value
    const pts    = isOwn ? getTrophyPoints() : (d.trophy_points || 0);
    const league = _ppLeague(pts);
    const nextL  = _ppNextLeague(pts);
    const pct    = nextL
      ? Math.round((pts - league.threshold) / (nextL.threshold - league.threshold) * 100)
      : 100;
    const label  = nextL ? `${pts} / ${nextL.threshold}` : `${pts} (MAX)`;
    trophyHtml = `
      <div class="pp-section">
        <div class="pp-section-title">🏆 TROPHY ROAD</div>
        <div class="pp-trophy-row">
          <span class="pp-trophy-league">${league.icon} ${league.name} League</span>
          <span class="pp-trophy-pts">${label} pts</span>
        </div>
        <div class="pp-progress-bg"><div class="pp-progress-fill" style="width:${pct}%;"></div></div>
      </div>`;
  } catch(e) {}

  // ── Achievements ──────────────────────────────────────────────────────────
  let achHtml = '';
  try {
    const unlocked = isOwn ? (gameState.unlockedAch || []).length : (d.achievement_count || 0);
    const total    = isOwn ? ACHIEVEMENTS.length
                           : (d.achievement_total || (typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS.length : 0));
    const pct      = total > 0 ? Math.round(unlocked / total * 100) : 0;
    achHtml = `
      <div class="pp-section">
        <div class="pp-section-title">🏅 ACHIEVEMENTS</div>
        <div class="pp-ach-row">
          <span class="pp-ach-count">${unlocked} / ${total}</span>
          <span class="pp-ach-pct">${pct}% Complete</span>
        </div>
      </div>`;
  } catch(e) {}

  // ── Comparison (only when viewing another player and we have our own data) ─
  let comparisonHtml = '';
  if (!isOwn && typeof PLAYER_ID !== 'undefined' && PLAYER_ID) {
    try {
      const myPts   = getTrophyPoints();
      const myAch   = (gameState.unlockedAch || []).length;
      const myTotal = ACHIEVEMENTS.length;
      const thPts   = d.trophy_points    || 0;
      const thAch   = d.achievement_count|| 0;
      const thTotal = d.achievement_total|| 108;

      function _cmpArrow(mine, theirs) {
        if (theirs > mine) return '<span class="pp-cmp-behind">▲ Ahead of You</span>';
        if (theirs < mine) return '<span class="pp-cmp-ahead">▼ Behind You</span>';
        return '<span class="pp-cmp-equal">— Equal</span>';
      }

      comparisonHtml = `
        <div class="pp-section">
          <div class="pp-section-title">⚖️ COMPARISON</div>
          <div class="pp-cmp-row">
            <div class="pp-cmp-col">
              <div class="pp-cmp-label">YOUR TROPHIES</div>
              <div class="pp-cmp-val">${myPts}</div>
            </div>
            <div class="pp-cmp-mid">${_cmpArrow(myPts, thPts)}</div>
            <div class="pp-cmp-col pp-cmp-col--them">
              <div class="pp-cmp-label">THEIR TROPHIES</div>
              <div class="pp-cmp-val">${thPts}</div>
            </div>
          </div>
          <div class="pp-cmp-row" style="margin-top:10px;">
            <div class="pp-cmp-col">
              <div class="pp-cmp-label">YOUR ACHIEVEMENTS</div>
              <div class="pp-cmp-val">${myAch} / ${myTotal}</div>
            </div>
            <div class="pp-cmp-mid">${_cmpArrow(myAch, thAch)}</div>
            <div class="pp-cmp-col pp-cmp-col--them">
              <div class="pp-cmp-label">THEIR ACHIEVEMENTS</div>
              <div class="pp-cmp-val">${thAch} / ${thTotal}</div>
            </div>
          </div>
        </div>`;
    } catch(e) {}
  }

  // ── World Record Badges ───────────────────────────────────────────────────
  const BADGE_DEFS = {
    fastest_reaction:    { icon:'⚡', label:'Fastest Reaction Holder' },
    most_wins:           { icon:'🏆', label:'Most Wins Holder' },
    longest_win_streak:  { icon:'🔥', label:'Longest Win Streak Holder' },
    most_tiles_tapped:   { icon:'🎯', label:'Most Tiles Tapped Holder' },
    weekly_champion:     { icon:'👑', label:'Weekly Champion' },
  };
  const badges = (d.world_record_badges || []).map(b => {
    const def = BADGE_DEFS[b];
    return def ? `<div class="pp-wr-badge">${def.icon} ${def.label}</div>` : '';
  }).filter(Boolean).join('');
  const wrBadgesHtml = badges
    ? `<div class="pp-section"><div class="pp-section-title">🌍 WORLD RECORDS</div><div class="pp-wr-badges">${badges}</div></div>`
    : '';

  // ── Favorite Mode ─────────────────────────────────────────────────────────
  const MODE_LABELS = { rush:'Rush', wild:'Wild', buckshot:'Buckshot', koth:'KOTH' };
  const favMode = d.favorite_mode ? (MODE_LABELS[d.favorite_mode] || d.favorite_mode) : null;

  // ── Friend Action ─────────────────────────────────────────────────────────
  let friendHtml = '';
  if (!isOwn) {
    const fs = d.friendship_status || 'none';
    if (fs === 'friends') {
      friendHtml = `<div class="pp-friend-action pp-friend-action--friends">FRIENDS ✓</div>`;
    } else if (fs === 'request_sent') {
      friendHtml = `<div class="pp-friend-action pp-friend-action--pending">REQUEST SENT</div>`;
    } else {
      friendHtml = `<button class="pp-friend-action pp-friend-action--add" onclick="ppSendFriendReq('${d.player_id}','${(d.player_name||'').replace(/'/g,"\\'")}')">+ ADD FRIEND</button>`;
    }
  }

  body.innerHTML = `
    <!-- Avatar + Name + tag -->
    <div class="pp-header">
      <div class="pp-avatar-wrap">
        <div class="pp-avatar">${d.avatar || '🎮'}</div>
      </div>
      <div class="pp-name-col">
        <div class="pp-name">${(d.player_name||'Player').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        ${d.player_tag ? `<div class="pp-tag">#${String(d.player_tag).replace(/[^0-9]/g,'')}</div>` : ''}
        ${rankBadges.length ? `<div class="pp-rank-badges">${rankBadges.join('')}</div>` : ''}
      </div>
    </div>

    <!-- League + ranks + fav mode -->
    <div class="pp-meta-row">
      <div class="pp-meta-cell">
        <div class="pp-meta-label">WEEKLY</div>
        <div class="pp-meta-val">${wrank}</div>
      </div>
      <div class="pp-meta-cell">
        <div class="pp-meta-label">ALL-TIME</div>
        <div class="pp-meta-val">${arank}</div>
      </div>
      ${favMode ? `<div class="pp-meta-cell"><div class="pp-meta-label">FAV MODE</div><div class="pp-meta-val pp-meta-val--mode">${favMode}</div></div>` : ''}
    </div>

    <!-- Core Stats -->
    <div class="pp-section">
      <div class="pp-section-title">📊 STATS</div>
      <div class="pp-stats-grid">
        <div class="pp-stat"><div class="pp-stat-val">${d.games || 0}</div><div class="pp-stat-lbl">Games</div></div>
        <div class="pp-stat"><div class="pp-stat-val">${d.wins  || 0}</div><div class="pp-stat-lbl">Wins</div></div>
        <div class="pp-stat"><div class="pp-stat-val">${wr}</div><div class="pp-stat-lbl">Win Rate</div></div>
        <div class="pp-stat"><div class="pp-stat-val">${d.avg_placement ?? '—'}</div><div class="pp-stat-lbl">Avg Place</div></div>
        <div class="pp-stat"><div class="pp-stat-val">${d.best_win_streak || 0}×</div><div class="pp-stat-lbl">Best Streak</div></div>
        <div class="pp-stat"><div class="pp-stat-val">${react}</div><div class="pp-stat-lbl">Best Reaction</div></div>
        <div class="pp-stat pp-stat--full"><div class="pp-stat-val">${tiles}</div><div class="pp-stat-lbl">Tiles Tapped</div></div>
      </div>
    </div>

    ${trophyHtml}
    ${achHtml}
    ${comparisonHtml}
    ${wrBadgesHtml}

    <!-- Account info -->
    <div class="pp-section">
      <div class="pp-section-title">ℹ️ ACCOUNT</div>
      <div class="pp-account-row"><span class="pp-account-lbl">Joined</span><span class="pp-account-val">${_ppFmtJoined(d.created_at)}</span></div>
      <div class="pp-account-row"><span class="pp-account-lbl">Last Seen</span><span class="pp-account-val">${_ppFmtLastSeen(d.last_seen_at)}</span></div>
    </div>

    ${friendHtml ? `<div class="pp-friend-section">${friendHtml}</div>` : ''}
  `;
}

// ── Friend request from overlay ───────────────────────────────────────────────

async function ppSendFriendReq(targetId, targetName) {
  if (typeof PLAYER_ID === 'undefined' || !PLAYER_ID) {
    try { showToast('Log in to add friends', 'var(--muted)'); } catch(e) {}
    return;
  }
  const btn = document.querySelector('.pp-friend-action--add');
  if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }

  try {
    const resp = await fetch(`${getActiveServer().http}/friends/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId: PLAYER_ID, targetId }),
      signal: AbortSignal.timeout(8000),
    });
    const data = resp.ok ? await resp.json() : null;
    if (data?.ok) {
      if (btn) { btn.textContent = 'REQUEST SENT'; btn.className = 'pp-friend-action pp-friend-action--pending'; btn.disabled = true; }
      try { showToast(`✅ Request sent to ${targetName}!`, 'var(--green)'); playSound('achieve'); } catch(e) {}
      _ppCache.delete(targetId);
    } else {
      if (btn) { btn.textContent = '+ ADD FRIEND'; btn.disabled = false; }
      const msg = data?.status === 'already_friends' ? 'Already friends!' : 'Failed — try again';
      try { showToast(msg, 'var(--red)'); } catch(e) {}
    }
  } catch(e) {
    if (btn) { btn.textContent = '+ ADD FRIEND'; btn.disabled = false; }
    try { showToast('Network error — try again', 'var(--red)'); } catch(e2) {}
  }
}
