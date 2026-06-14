// ===== MISSIONS SYSTEM =====
// Daily (3 random) + Weekly (5 random) missions.
// Stored in tr_missions localStorage key, separate from gameState.

const MISSIONS_KEY = 'tr_missions';

// ─── Mission pools ────────────────────────────────────────────────────────────

const DAILY_POOL = [
  { id: 'd_play3',    title: 'Warm Up',        desc: 'Play 3 matches',          type: 'matches',      target: 3,   reward: { type: 'diamonds', amount: 25 } },
  { id: 'd_play5',    title: 'Keep Going',     desc: 'Play 5 matches',          type: 'matches',      target: 5,   reward: { type: 'diamonds', amount: 40 } },
  { id: 'd_top3_1',   title: 'Podium Finish',  desc: 'Reach Top 3 once',        type: 'top3',         target: 1,   reward: { type: 'diamonds', amount: 30 } },
  { id: 'd_top3_3',   title: 'Consistent',     desc: 'Reach Top 3 three times', type: 'top3',         target: 3,   reward: { type: 'diamonds', amount: 50 } },
  { id: 'd_win1',     title: 'Taste Victory',  desc: 'Win 1 match',             type: 'wins',         target: 1,   reward: { type: 'diamonds', amount: 40 } },
  { id: 'd_win2',     title: 'Double Down',    desc: 'Win 2 matches',           type: 'wins',         target: 2,   reward: { type: 'tickets',  amount: 1  } },
  { id: 'd_taps300',  title: 'Trigger Happy',  desc: 'Tap 300 tiles',           type: 'taps',         target: 300, reward: { type: 'diamonds', amount: 25 } },
  { id: 'd_taps500',  title: 'Tapmaster',      desc: 'Tap 500 tiles',           type: 'taps',         target: 500, reward: { type: 'diamonds', amount: 40 } },
  { id: 'd_xp100',    title: 'XP Grind',       desc: 'Earn 100 XP',             type: 'xp',           target: 100, reward: { type: 'diamonds', amount: 25 } },
  { id: 'd_xp250',    title: 'XP Surge',       desc: 'Earn 250 XP',             type: 'xp',           target: 250, reward: { type: 'diamonds', amount: 50 } },
  { id: 'd_ticket1',  title: 'In The Game',    desc: 'Use 1 ticket',            type: 'tickets',      target: 1,   reward: { type: 'diamonds', amount: 15 } },
  { id: 'd_wild',     title: 'Wild Side',      desc: 'Play a Wild mode match',  type: 'mode_wild',    target: 1,   reward: { type: 'diamonds', amount: 30 } },
  { id: 'd_buckshot', title: 'Buckshot Blast', desc: 'Play a Buckshot match',   type: 'mode_buckshot',target: 1,   reward: { type: 'diamonds', amount: 30 } },
];

const WEEKLY_POOL = [
  { id: 'w_win10',    title: 'Winner',        desc: 'Win 10 matches',                  type: 'wins',      target: 10,    reward: { type: 'diamonds', amount: 300 } },
  { id: 'w_win25',    title: 'Dominant',      desc: 'Win 25 matches',                  type: 'wins',      target: 25,    reward: { type: 'tickets',  amount: 3   } },
  { id: 'w_top3_20',  title: 'Podium Hunter', desc: 'Reach Top 3 twenty times',        type: 'top3',      target: 20,    reward: { type: 'diamonds', amount: 300 } },
  { id: 'w_top3_50',  title: 'Elite',         desc: 'Reach Top 3 fifty times',         type: 'top3',      target: 50,    reward: { type: 'tickets',  amount: 5   } },
  { id: 'w_taps5k',   title: 'Tile Storm',    desc: 'Tap 5,000 tiles',                 type: 'taps',      target: 5000,  reward: { type: 'diamonds', amount: 300 } },
  { id: 'w_taps10k',  title: 'Unstoppable',   desc: 'Tap 10,000 tiles',               type: 'taps',      target: 10000, reward: { type: 'spins',    amount: 2   } },
  { id: 'w_xp2k',     title: 'XP Hunter',     desc: 'Earn 2,000 XP',                  type: 'xp',        target: 2000,  reward: { type: 'diamonds', amount: 300 } },
  { id: 'w_xp5k',     title: 'Experience',    desc: 'Earn 5,000 XP',                  type: 'xp',        target: 5000,  reward: { type: 'tickets',  amount: 5   } },
  { id: 'w_play50',   title: 'Grinder',       desc: 'Play 50 matches',                 type: 'matches',   target: 50,    reward: { type: 'spins',    amount: 2   } },
  { id: 'w_allmodes', title: 'All Rounder',   desc: 'Play Rush, Buckshot & Wild',      type: 'all_modes', target: 3,     reward: { type: 'tickets',  amount: 3   } },
];

const ALL_MODES_TRACKED = ['rush', 'buckshot', 'wild'];
const ALL_POOL           = [...DAILY_POOL, ...WEEKLY_POOL];

// ─── Persistence ──────────────────────────────────────────────────────────────

function _msLoad() {
  try { const r = localStorage.getItem(MISSIONS_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}

function _msSave(s) {
  try { localStorage.setItem(MISSIONS_KEY, JSON.stringify(s)); } catch(e) {}
}

function _todayKey() { return new Date().toISOString().slice(0, 10); }

function _weekKey() {
  const d = new Date();
  const daysSinceMon = (d.getDay() + 6) % 7;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysSinceMon);
  return mon.toISOString().slice(0, 10); // ISO date of this week's Monday
}

function _pick(pool, n) {
  return [...pool].sort(() => Math.random() - 0.5).slice(0, n)
    .map(m => ({ id: m.id, progress: 0, claimed: false }));
}

function _getOrCreateMissions() {
  let s = _msLoad() || {};
  const today = _todayKey();
  const week  = _weekKey();
  let dirty   = false;

  if (!s.daily || s.daily.key !== today) {
    s.daily = { key: today, missions: _pick(DAILY_POOL, 3) };
    dirty = true;
  }
  if (!s.weekly || s.weekly.key !== week) {
    s.weekly = { key: week, missions: _pick(WEEKLY_POOL, 5) };
    dirty = true;
  }
  if (dirty) _msSave(s);
  return s;
}

// ─── Mission tracking ─────────────────────────────────────────────────────────
// Called from gameLoop.js (match_end) and tickets.js (ticket_used).

function trackMissionEvent(type, data) {
  try {
    const s = _getOrCreateMissions();
    let changed = false;

    const advance = mState => {
      const def = ALL_POOL.find(m => m.id === mState.id);
      if (!def || mState.claimed || (mState.progress || 0) >= def.target) return false;

      let inc = 0;
      switch (def.type) {
        case 'matches':       if (type === 'match_end')                                    inc = 1; break;
        case 'wins':          if (type === 'match_end' && data.placement === 1)            inc = 1; break;
        case 'top3':          if (type === 'match_end' && data.placement <= 3)             inc = 1; break;
        case 'taps':          if (type === 'match_end')                                    inc = data.taps  || 0; break;
        case 'xp':            if (type === 'match_end')                                    inc = data.xp    || 0; break;
        case 'tickets':       if (type === 'ticket_used')                                  inc = 1; break;
        case 'mode_wild':     if (type === 'match_end' && data.mode === 'wild')            inc = 1; break;
        case 'mode_buckshot': if (type === 'match_end' && data.mode === 'buckshot')        inc = 1; break;
        case 'all_modes': {
          if (type === 'match_end' && data.mode && ALL_MODES_TRACKED.includes(data.mode)) {
            const played = mState.modesPlayed ? [...mState.modesPlayed] : [];
            if (!played.includes(data.mode)) {
              mState.modesPlayed = [...played, data.mode];
              mState.progress    = mState.modesPlayed.length;
              return true;
            }
          }
          break;
        }
      }
      if (inc > 0) {
        mState.progress = Math.min(def.target, (mState.progress || 0) + inc);
        return true;
      }
      return false;
    };

    s.daily.missions.forEach(m  => { if (advance(m)) changed = true; });
    s.weekly.missions.forEach(m => { if (advance(m)) changed = true; });

    if (changed) { _msSave(s); updateMissionsBadge(); }
  } catch(e) {
    console.error('[Missions] track error:', e);
  }
}

// ─── Reward claiming ──────────────────────────────────────────────────────────

async function claimMissionReward(period, missionId) {
  try {
    const s      = _getOrCreateMissions();
    const group  = period === 'daily' ? s.daily  : s.weekly;
    const pool   = period === 'daily' ? DAILY_POOL : WEEKLY_POOL;
    const mState = group.missions.find(m => m.id === missionId);
    const def    = pool.find(m => m.id === missionId);
    if (!mState || !def || mState.claimed || (mState.progress || 0) < def.target) return;

    // Server-side idempotency + progress re-validation for game-based missions
    const periodKey = period === 'daily' ? s.daily.key : s.weekly.key;
    if (typeof PLAYER_ID !== 'undefined' && PLAYER_ID) {
      try {
        // Build period boundaries so server can recount game_results
        const now   = new Date();
        let periodStart, periodEnd;
        if (period === 'daily') {
          const d = new Date(s.daily.key);
          periodStart = d.toISOString();
          periodEnd   = new Date(d.getTime() + 86400000).toISOString();
        } else {
          const d = new Date(s.weekly.key);
          periodStart = d.toISOString();
          periodEnd   = new Date(d.getTime() + 7 * 86400000).toISOString();
        }
        const r = await fetch(`${getActiveServer().http}/missions/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId: PLAYER_ID, missionId, periodKey,
            missionType: def.type, target: def.target,
            periodStart, periodEnd,
          }),
          signal: AbortSignal.timeout(6000),
        });
        const data = r.ok ? await r.json() : null;
        if (data && !data.ok && !data.offline) {
          if (data.error === 'already_claimed' || data.error === 'not_completed') {
            if (data.error === 'already_claimed') {
              mState.claimed = true;
              _msSave(s);
            }
            renderMissionsPopup(); updateMissionsBadge();
            return;
          }
        }
      } catch(e) { /* offline fallback — allow local claim */ }
    }

    mState.claimed = true;
    _msSave(s);

    const r = def.reward;
    if (r.type === 'diamonds') {
      gameState.diamonds = (gameState.diamonds || 0) + r.amount;
    } else if (r.type === 'tickets') {
      const cap = typeof TICKETS_MAX !== 'undefined' ? TICKETS_MAX : 10;
      const cur = typeof getTickets === 'function' ? getTickets() : (gameState.tickets || 0);
      gameState.tickets = Math.min(cap, cur + r.amount);
    } else if (r.type === 'spins') {
      gameState.freeSpins = (gameState.freeSpins || 0) + r.amount;
    }
    try { saveState(); updateMenuStats(); } catch(e) {}

    const icon  = { diamonds: '💎', tickets: '🎟️', spins: '🎡' }[r.type] || '🎁';
    const label = r.type === 'spins' ? `${r.amount} Free Spins` : `${icon} ${r.amount}`;
    try { showToast(`🎯 ${label} claimed!`, 'var(--gold)'); } catch(e) {}
    try { playSound('achieve'); } catch(e) {}

    renderMissionsPopup();
    updateMissionsBadge();
  } catch(e) {
    console.error('[Missions] claim error:', e);
  }
}

// ─── Badge (top-bar) ──────────────────────────────────────────────────────────

function updateMissionsBadge() {
  try {
    const s   = _getOrCreateMissions();
    const all = [...(s.daily?.missions || []), ...(s.weekly?.missions || [])];
    let count = 0;

    all.forEach(m => {
      if (m.claimed) return;
      const def = ALL_POOL.find(p => p.id === m.id);
      if (def && (m.progress || 0) >= def.target) count++;
    });

    // Include daily login if claimable
    try {
      if (typeof _loadDailyState === 'function' && typeof _canClaimToday === 'function') {
        if (_canClaimToday(_loadDailyState())) count++;
      }
    } catch(e) {}

    const badge = document.getElementById('missionsTopBadge');
    if (badge) {
      badge.textContent = count > 9 ? '9+' : String(count);
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
    // keep old badge id working if still in DOM
    const oldBadge = document.getElementById('missionsBadge');
    if (oldBadge) oldBadge.style.display = count > 0 ? 'flex' : 'none';
  } catch(e) {}
}

// ─── Countdown helpers ────────────────────────────────────────────────────────

function _msTimeUntilMidnight() {
  const now = new Date();
  const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const ms  = mid - now;
  const h   = Math.floor(ms / 3600000);
  const m   = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function _msTimeUntilMonday() {
  const now          = new Date();
  const daysSinceMon = (now.getDay() + 6) % 7;
  const daysLeft     = daysSinceMon === 0 ? 7 : 7 - daysSinceMon;
  const mon          = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysLeft);
  mon.setHours(0, 0, 0, 0);
  const ms = mon - now;
  const d  = Math.floor(ms / 86400000);
  const h  = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
}

// ─── Render ───────────────────────────────────────────────────────────────────

let _msTab = 'daily';
const MS_ICON = { diamonds: '💎', tickets: '🎟️', spins: '🎡' };

function renderMissionsPopup() {
  const list    = document.getElementById('missionsList');
  const rewards = document.getElementById('missionsRewardsContent');
  const timer   = document.getElementById('missionsTimer');

  if (_msTab === 'rewards') {
    if (list)    list.style.display    = 'none';
    if (rewards) rewards.style.display = 'block';
    if (timer)   timer.textContent     = '';
    try { renderDailyCalendar(); } catch(e) {}
    return;
  }

  if (list)    list.style.display    = '';
  if (rewards) rewards.style.display = 'none';

  const s     = _getOrCreateMissions();
  const pool  = _msTab === 'daily' ? DAILY_POOL : WEEKLY_POOL;
  const group = _msTab === 'daily' ? s.daily    : s.weekly;

  if (timer) {
    timer.textContent = _msTab === 'daily'
      ? `Resets in ${_msTimeUntilMidnight()}`
      : `Resets in ${_msTimeUntilMonday()}`;
  }

  if (!list) return;
  if (!group?.missions?.length) { list.innerHTML = ''; return; }

  list.innerHTML = group.missions.map(mState => {
    const def = pool.find(m => m.id === mState.id);
    if (!def) return '';

    const prog    = Math.min(mState.progress || 0, def.target);
    const pct     = Math.round((prog / def.target) * 100);
    const done    = prog >= def.target;
    const claimed = !!mState.claimed;
    const cls     = claimed ? 'ms-claimed' : done ? 'ms-ready' : 'ms-active';

    const rewardStr = def.reward.type === 'spins'
      ? `🎡 ${def.reward.amount} Spins`
      : `${MS_ICON[def.reward.type] || '🎁'} ${def.reward.amount}`;

    let action;
    if (claimed) {
      action = `<div class="ms-claimed-label">✓ CLAIMED</div>`;
    } else if (done) {
      action = `<button class="ms-claim-btn" onclick="claimMissionReward('${_msTab}','${def.id}')">CLAIM ${rewardStr}</button>`;
    } else {
      action = `<div class="ms-reward-label">${rewardStr}</div>`;
    }

    return `<div class="ms-card ${cls}">` +
      `<div class="ms-card-title">${def.title}</div>` +
      `<div class="ms-card-desc">${def.desc}</div>` +
      `<div class="ms-progress-row">` +
        `<div class="ms-bar-wrap"><div class="ms-bar" style="width:${claimed ? 100 : pct}%"></div></div>` +
        `<div class="ms-prog-text">${prog}/${def.target}</div>` +
      `</div>` +
      action +
    `</div>`;
  }).join('');
}

// ─── Popup ────────────────────────────────────────────────────────────────────

function openMissions(tab) {
  if (tab) _msTab = tab;
  document.querySelectorAll('.ms-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`ms-tab-${_msTab}`)?.classList.add('active');
  renderMissionsPopup();
  showScreen('missionsScreen');
}

function openMissionsTab(tab) { openMissions(tab); }

function closeMissions() {
  showScreen('menuScreen');
  updateMissionsBadge();
}

function switchMissionsTab(tab) {
  _msTab = tab;
  document.querySelectorAll('.ms-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`ms-tab-${tab}`)?.classList.add('active');
  renderMissionsPopup();
}

// ─── Passive refresh ─────────────────────────────────────────────────────────

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    try { updateMissionsBadge(); } catch(e) {}
  }
});

setInterval(() => {
  try { updateMissionsBadge(); } catch(e) {}
}, 60 * 1000);
