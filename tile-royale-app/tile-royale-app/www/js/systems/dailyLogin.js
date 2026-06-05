// ===== DAILY LOGIN CALENDAR =====
// Stored separately from gameState so corrupt saves never break daily rewards.

const DAILY_LOGIN_KEY = 'tr_daily_login';

const DAILY_REWARDS = [
  { day: 1, type: 'diamonds', amount: 50,  icon: '💎', label: '50'       },
  { day: 2, type: 'tickets',  amount: 1,   icon: '🎟️', label: '×1'      },
  { day: 3, type: 'diamonds', amount: 75,  icon: '💎', label: '75'       },
  { day: 4, type: 'tickets',  amount: 2,   icon: '🎟️', label: '×2'      },
  { day: 5, type: 'diamonds', amount: 100, icon: '💎', label: '100'      },
  { day: 6, type: 'tickets',  amount: 3,   icon: '🎟️', label: '×3'      },
  { day: 7, type: 'spins',    amount: 2,   icon: '🎡', label: '×2 Spins' },
];

// ─── State ────────────────────────────────────────────────────────────────────

function _loadDailyState() {
  try {
    const raw = localStorage.getItem(DAILY_LOGIN_KEY);
    if (!raw) return { day: 1, lastClaim: null, history: [] };
    const s = JSON.parse(raw);
    return {
      day:       (Number.isInteger(s.day) && s.day >= 1 && s.day <= 7) ? s.day : 1,
      lastClaim: (typeof s.lastClaim === 'number') ? s.lastClaim : null,
      history:   Array.isArray(s.history) ? s.history : [],
    };
  } catch(e) {
    return { day: 1, lastClaim: null, history: [] };
  }
}

function _saveDailyState(state) {
  try { localStorage.setItem(DAILY_LOGIN_KEY, JSON.stringify(state)); } catch(e) {}
}

// Returns true if today's reward has not yet been claimed.
// Uses calendar date comparison (not 24h window) so midnight resets correctly.
function _canClaimToday(state) {
  if (!state.lastClaim) return true;
  const last  = new Date(state.lastClaim);
  const today = new Date();
  return last.getFullYear() !== today.getFullYear() ||
         last.getMonth()    !== today.getMonth()    ||
         last.getDate()     !== today.getDate();
}

// ─── Claim ───────────────────────────────────────────────────────────────────

// ISO date string "YYYY-MM-DD" in local time — consistent with _canClaimToday comparison.
function _dlTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Grants today's reward and advances the day counter.
// Returns the reward object, or null if already claimed today.
async function claimDailyReward() {
  const state = _loadDailyState();
  if (!_canClaimToday(state)) return null;

  // Server-side idempotency check — prevents re-claiming after localStorage clear.
  // Offline fallback: allow claim if server unreachable.
  if (typeof PLAYER_ID !== 'undefined' && PLAYER_ID) {
    try {
      const r = await fetch(`${getActiveServer().http}/daily-login/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: PLAYER_ID, day: state.day, claimDate: _dlTodayKey() }),
        signal: AbortSignal.timeout(6000),
      });
      const data = r.ok ? await r.json() : null;
      if (data && !data.ok && !data.offline && data.error === 'already_claimed') {
        // Server says already claimed today (localStorage was manipulated) — block it
        _saveDailyState({ ...state, lastClaim: Date.now() });
        return null;
      }
    } catch(e) {
      // Network error → proceed with local claim
    }
  }

  const reward = DAILY_REWARDS[state.day - 1];

  try {
    if (reward.type === 'diamonds') {
      gameState.diamonds = (gameState.diamonds || 0) + reward.amount;
    } else if (reward.type === 'tickets') {
      const cur = typeof getTickets === 'function' ? getTickets() : (gameState.tickets || 0);
      gameState.tickets = cur + reward.amount; // overflow allowed — rewards can exceed TICKETS_MAX
    } else if (reward.type === 'spins') {
      gameState.freeSpins = (gameState.freeSpins || 0) + reward.amount;
    }
    saveState();
    try { updateMenuStats(); } catch(e) {}
  } catch(e) {
    console.error('[DailyLogin] grant error:', e);
  }

  const claimedDay = state.day;
  _saveDailyState({
    day:       (state.day % 7) + 1,
    lastClaim: Date.now(),
    history:   [...state.history, { day: claimedDay, ts: Date.now() }],
  });

  return reward;
}

// ─── Calendar render ──────────────────────────────────────────────────────────

function renderDailyCalendar() {
  const grid = document.getElementById('dailyGrid');
  if (!grid) return;

  const state     = _loadDailyState();
  const claimable = _canClaimToday(state);
  const curDay    = state.day;

  grid.innerHTML = DAILY_REWARDS.map((r, i) => {
    const day = i + 1;

    let cardClass;
    if      (day < curDay)                      cardClass = 'claimed';   // previously collected
    else if (day === curDay &&  claimable)       cardClass = 'current';  // ready to claim now
    else if (day === curDay && !claimable)       cardClass = 'next';     // today already claimed, come back tomorrow
    else                                         cardClass = 'locked';   // future days

    const claimBtn = (cardClass === 'current')
      ? `<button class="daily-claim-btn" onclick="onDailyClaimClick()">CLAIM</button>`
      : '';
    const badge = (cardClass === 'claimed')
      ? `<div class="daily-claimed-badge">✓</div>`
      : '';

    return `<div class="daily-card ${cardClass}" id="daily-card-${day}">` +
      `<div class="daily-day">DAY ${day}</div>` +
      `<div class="daily-icon">${r.icon}</div>` +
      `<div class="daily-amount">${r.label}</div>` +
      claimBtn + badge +
    `</div>`;
  }).join('');
}

async function onDailyClaimClick() {
  const reward = await claimDailyReward();
  if (!reward) {
    try { showToast('Already claimed today — come back tomorrow!', 'var(--muted)'); } catch(e) {}
    return;
  }

  // Re-render calendar with updated state
  renderDailyCalendar();
  updateDailyLoginMenuBtn();

  const msgs = {
    diamonds: `💎 +${reward.amount} Diamonds!`,
    tickets:  `🎟️ +${reward.amount} Ticket${reward.amount > 1 ? 's' : ''}!`,
    spins:    `🎡 +${reward.amount} Free Spin${reward.amount > 1 ? 's' : ''}!`,
  };
  try { showToast(msgs[reward.type] || '🎁 Reward claimed!', 'var(--gold)'); } catch(e) {}
  try { playSound('achieve'); } catch(e) {}
}

// ─── Popup ────────────────────────────────────────────────────────────────────

function openDailyLogin() {
  // Daily Login lives in the REWARDS tab of the Mission Center
  try { openMissionsTab('rewards'); } catch(e) {}
}

function closeDailyLogin() {
  try { closeMissions(); } catch(e) {}
  updateDailyLoginMenuBtn();
}

// ─── Menu button state ────────────────────────────────────────────────────────

function updateDailyLoginMenuBtn() {
  try {
    // Refresh the unified missions badge (includes daily login claimable state)
    if (typeof updateMissionsBadge === 'function') updateMissionsBadge();
  } catch(e) {}
}

// ─── Auto-popup on launch ─────────────────────────────────────────────────────

let _dailyShownThisSession = false;

function checkAndShowDailyLogin() {
  if (_dailyShownThisSession) return;
  _dailyShownThisSession = true;
  updateDailyLoginMenuBtn();
  try {
    const state = _loadDailyState();
    if (_canClaimToday(state)) {
      setTimeout(openDailyLogin, 1500);
    }
  } catch(e) {
    console.error('[DailyLogin] startup check error:', e);
  }
}

// ─── Passive refresh listeners ────────────────────────────────────────────────

// Refresh badge when app comes back from background (works on Capacitor + browser)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    try { updateDailyLoginMenuBtn(); } catch(e) {}
  }
});

// Poll every 60 s — catches midnight rollover without a restart
setInterval(() => {
  try { updateDailyLoginMenuBtn(); } catch(e) {}
}, 60 * 1000);
