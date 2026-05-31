// ===== KING OF THE HILL SYSTEM =====
const KOTH_ENTRY_FEE = 50;
const KOTH_POOL_PCT  = 0.5; // 50% to prize pool
const KOTH_PRIZES    = [0.60, 0.25, 0.15]; // 1st, 2nd, 3rd

function getKothWeekKey() {
  // Use UTC ISO week (Monday = start) to match server's date_trunc('week', ...) UTC boundary
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  const daysToMon = utcDay === 0 ? -6 : 1 - utcDay;
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToMon));
  return `koth_${mon.toISOString().slice(0, 10)}`; // e.g. "koth_2025-05-26"
}

function getKothWeekData() {
  const key = getKothWeekKey();
  if (!gameState.koth) gameState.koth = {};
  if (!gameState.koth[key]) {
    gameState.koth[key] = { pool: 0, wins: 0, contributed: 0, gamesPlayed: 0 };
  }
  return gameState.koth[key];
}

function getKothWeekTimer() {
  // Count down to next Monday 00:00 UTC — matches server's date_trunc('week') boundary
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun
  const daysToNextMon = utcDay === 0 ? 1 : 8 - utcDay;
  const nextMon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToNextMon));
  const diff = nextMon - now;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `Resets in ${d}d ${h}h ${m}m`;
}

function getKothSimulatedPool() {
  // Only real player contributions — no simulated bot additions
  return getKothWeekData().pool || 0;
}

// ===== KOTH DAILY TOP REWARD =====
const KOTH_DAILY_REWARDS = [
  { tier: 'TOP 1%', maxPct: 1,  diamonds: 125, icon: '🥇', color: 'var(--gold)' },
  { tier: 'TOP 3%', maxPct: 3,  diamonds: 75,  icon: '🥈', color: '#c0c0c0' },
  { tier: 'TOP 5%', maxPct: 5,  diamonds: 25,  icon: '🥉', color: '#cd7f32' },
];

function getKothDailyKey() {
  // UTC date string to match server's date_trunc('day', now()) UTC boundary
  const now = new Date();
  return `kothDaily_${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}`;
}

function getKothDailyData() {
  const key = getKothDailyKey();
  if (!gameState.kothDaily) gameState.kothDaily = {};
  if (!gameState.kothDaily[key]) {
    gameState.kothDaily[key] = { wins: 0, claimed: false };
  }
  return gameState.kothDaily[key];
}

function getKothDailyTimer() {
  const now = new Date();
  const nextUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const diff = nextUtcDay - now;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// Server-fetched KOTH cache (null = not yet fetched)
let _kothCachedPct        = null; // daily percentile (integer 1–100, lower = better)
let _kothCachedWeeklyRank = null; // weekly rank (integer)
let _kothCachedServerPool = null; // server-authoritative pool in diamonds
let _kothFetching         = false;

function getKothDailyPercentile(_wins) {
  return _kothCachedPct;
}

function getEligibleDailyReward(wins) {
  const pct = getKothDailyPercentile(wins);
  if (pct === null) return null;
  return KOTH_DAILY_REWARDS.find(r => pct <= r.maxPct) || null;
}

// Fetches KOTH weekly leaderboard + daily percentile from server.
// period: 'current' (default) for this week's data; 'prev' for last week (prize distribution).
// On success: caches percentile, re-renders leaderboard and daily section.
async function fetchKothLeaderboard(period) {
  if (_kothFetching) return null;
  _kothFetching = true;
  try {
    const srv = typeof getActiveServer === 'function' ? getActiveServer() : null;
    const pid = typeof PLAYER_ID !== 'undefined' ? PLAYER_ID : null;
    if (!pid || !srv) return null;

    const p = period === 'prev' ? 'prev' : 'current';
    const r = await fetch(
      `${srv.http}/koth/leaderboard?playerId=${encodeURIComponent(pid)}&period=${p}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return null;
    const data = await r.json();
    if (!data.dbAvailable) return null;

    // Cache server data
    _kothCachedPct        = data.daily?.playerPercentile ?? null;
    _kothCachedWeeklyRank = data.playerWeeklyRank        ?? null;
    if (data.serverPool !== undefined) _kothCachedServerPool = data.serverPool;

    // Only re-render if the KOTH screen is currently visible
    const kothScreen = document.getElementById('kothScreen');
    if (kothScreen && kothScreen.classList.contains('active')) {
      // Apply server-authoritative pool to prize display
      if (_kothCachedServerPool !== null) {
        const p = _kothCachedServerPool;
        const el = id => document.getElementById(id);
        if (el('kothPoolAmount'))    el('kothPoolAmount').textContent    = `💎 ${Math.floor(p).toLocaleString()}`;
        if (el('kothPrize1'))        el('kothPrize1').textContent        = `💎 ${Math.floor(p * 0.60).toLocaleString()}`;
        if (el('kothPrize2'))        el('kothPrize2').textContent        = `💎 ${Math.floor(p * 0.25).toLocaleString()}`;
        if (el('kothPrize3'))        el('kothPrize3').textContent        = `💎 ${Math.floor(p * 0.15).toLocaleString()}`;
        if (el('kothPrizeFastest'))  el('kothPrizeFastest').textContent  = `💎 ${Math.floor(p * 0.10).toLocaleString()}`;
      }

      const weekData = getKothWeekData();
      renderKothLeaderboard(weekData.wins || 0, data.weekly || []);
      renderKothDailySection();
      checkKothDailyRewardOnOpen();

      const rankEl = document.getElementById('kothYourRank');
      if (rankEl && _kothCachedWeeklyRank) rankEl.textContent = `#${_kothCachedWeeklyRank}`;

      // Prize preview: what the player would win if the week ended right now
      const prizePreviewEl = document.getElementById('kothYourRankPrize');
      if (prizePreviewEl) {
        const rank = _kothCachedWeeklyRank;
        const pool = _kothCachedServerPool ?? getKothSimulatedPool();
        if (rank && rank <= 3) {
          const PRIZES = [0.60, 0.25, 0.15];
          const prizeAmt = Math.floor(pool * PRIZES[rank - 1]);
          const labels = ['1st 🥇', '2nd 🥈', '3rd 🥉'];
          const colors = ['var(--gold)', '#c0c0c0', '#cd7f32'];
          prizePreviewEl.textContent = `${labels[rank-1]} → 💎 ${prizeAmt.toLocaleString()}`;
          prizePreviewEl.style.color = colors[rank - 1];
        } else if (rank) {
          prizePreviewEl.textContent = `#${rank} — outside prizes`;
          prizePreviewEl.style.color = 'var(--muted)';
        } else {
          prizePreviewEl.textContent = '—';
          prizePreviewEl.style.color = 'var(--muted)';
        }
      }
    }

    return data;
  } catch(e) {
    return null;
  } finally {
    _kothFetching = false;
  }
}

function renderKothDailySection() {
  const daily = getKothDailyData();
  const wins = daily.wins || 0;
  const pct = getKothDailyPercentile(wins);
  const eligible = getEligibleDailyReward(wins);

  // Timer
  const timerEl = document.getElementById('kothDailyTimer');
  if (timerEl) timerEl.textContent = getKothDailyTimer();

  // Rank display
  const rankEl = document.getElementById('kothDailyRank');
  if (rankEl) {
    if (wins === 0) {
      rankEl.textContent = 'Play to rank!';
      rankEl.style.color = 'var(--muted)';
    } else {
      const pct = _kothCachedPct;
      const pctLabel = pct !== null ? ` · TOP ${pct}%` : '';
      rankEl.textContent = `${wins} win${wins !== 1 ? 's' : ''} today${pctLabel}`;
      rankEl.style.color = pct !== null ? 'var(--gold)' : 'var(--diamond)';
    }
  }

  // Highlight eligible tier row
  document.querySelectorAll('.koth-daily-row').forEach((row, i) => {
    row.style.background = '';
  });
  if (eligible && !daily.claimed) {
    const tierIdx = KOTH_DAILY_REWARDS.indexOf(eligible);
    const rows = document.querySelectorAll('.koth-daily-row');
    if (rows[tierIdx]) {
      rows[tierIdx].style.background = 'rgba(255,215,0,0.06)';
      rows[tierIdx].style.borderLeft = `3px solid ${eligible.color}`;
    }
  }

  // Claim button
  const claimWrap = document.getElementById('kothDailyClaimWrap');
  if (claimWrap) {
    claimWrap.style.display = (eligible && !daily.claimed) ? 'block' : 'none';
  }
}

async function claimKothDailyReward() {
  const daily = getKothDailyData();
  if (daily.claimed) { showToast('Already claimed today!', 'var(--muted)'); return; }

  // Optimistic guard — prevents button spam before server responds
  const eligible = getEligibleDailyReward(daily.wins || 0);
  if (!eligible) { showToast('Not eligible today — play more KOTH!', 'var(--muted)'); return; }

  const srv = typeof getActiveServer === 'function' ? getActiveServer() : null;
  const pid = typeof PLAYER_ID !== 'undefined' ? PLAYER_ID : null;
  if (!srv || !pid) { showToast('Connection required to claim reward!', 'var(--red)'); return; }

  showToast('⏳ Claiming...', 'var(--muted)');

  let result = null;
  try {
    const r = await fetch(`${srv.http}/koth/daily/claim`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ playerId: pid }),
      signal:  AbortSignal.timeout(8000),
    });
    if (r.ok) result = await r.json();
  } catch(e) {}

  if (!result) { showToast('Server unavailable — try again!', 'var(--red)'); return; }

  if (result.reason === 'already_claimed') {
    daily.claimed = true; saveState(); renderKothDailySection();
    showToast('Already claimed today!', 'var(--muted)'); return;
  }
  if (!result.ok) { showToast('Not eligible today — play more KOTH!', 'var(--muted)'); return; }

  // Server confirmed — apply locally
  daily.claimed = true;
  gameState.diamonds = (gameState.diamonds || 0) + result.diamonds;
  saveState(); updateMenuStats(); renderKothDailySection();

  const tierInfo = KOTH_DAILY_REWARDS.find(r => r.tier === result.tier) || KOTH_DAILY_REWARDS[2];
  document.getElementById('kothDailyRewardIcon').textContent  = tierInfo.icon;
  document.getElementById('kothDailyRewardTier').textContent  = result.tier;
  document.getElementById('kothDailyRewardTier').style.color  = tierInfo.color;
  document.getElementById('kothDailyRewardAmount').textContent = `💎 ${result.diamonds.toLocaleString()}`;
  document.getElementById('kothDailyRewardSub').textContent   = `You were in the ${result.tier} of KOTH players today!`;
  document.getElementById('kothDailyRewardOverlay').classList.add('show');
  playSound('achieve'); vibrate([50, 50, 200]);
}

function closeKothDailyReward() {
  document.getElementById('kothDailyRewardOverlay').classList.remove('show');
}

function checkKothDailyRewardOnOpen() {
  const daily = getKothDailyData();
  const eligible = getEligibleDailyReward(daily.wins || 0);
  // Auto-show claim if eligible and unclaimed
  if (eligible && !daily.claimed) {
    setTimeout(() => {
      showToast(`🎁 You qualify for ${eligible.tier} daily reward! Claim it now.`, eligible.color);
    }, 500);
  }
}

// ===== KOTH FASTEST CLICKER =====

// Key for yesterday's KOTH daily data (pending fastest clicker claim)
function _kothYesterdayKey() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return `kothDaily_${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

// Key for last week's KOTH week data (pending weekly fastest clicker claim)
function _kothPrevWeekKey() {
  const d = new Date();
  const utcDay = d.getUTCDay();
  const daysToThisMon = utcDay === 0 ? -6 : 1 - utcDay;
  const prevMon = new Date(
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysToThisMon)).getTime()
    - 7 * 86400000
  );
  return `koth_${prevMon.toISOString().slice(0, 10)}`;
}

function recordKothReactionTime(ms) {
  if (!ms || ms <= 0 || ms > 5000) return;
  const daily = getKothDailyData();
  if (!daily.bestReactionMs || ms < daily.bestReactionMs) daily.bestReactionMs = ms;
  const week = getKothWeekData();
  if (!week.bestReactionMs || ms < week.bestReactionMs) week.bestReactionMs = ms;
  saveState();
}

function renderKothFastestSection() {
  const daily = getKothDailyData();
  const week  = getKothWeekData();
  const pool  = _kothCachedServerPool ?? getKothSimulatedPool();
  const weeklyPrize = Math.floor(pool * 0.10);

  // Pending = yesterday's locked result (claimable until tonight's midnight)
  const yKey         = _kothYesterdayKey();
  const yData        = gameState.kothDaily?.[yKey] || null;
  const pendingDailyMs = (yData && !yData.fastestClaimed && yData.bestReactionMs) ? yData.bestReactionMs : null;

  // Pending weekly = last week's locked result (claimable until next Monday)
  const pwKey        = _kothPrevWeekKey();
  const pwData       = gameState.koth?.[pwKey] || null;
  const pendingWeeklyMs    = (pwData && !pwData.fastestClaimed && pwData.bestReactionMs) ? pwData.bestReactionMs : null;
  const pendingWeeklyPrize = pwData ? Math.floor((pwData.pool || 0) * 0.10) : 0;

  // Status text — show pending first, then active
  const bestEl = document.getElementById('kothFastestBest');
  if (bestEl) {
    const lines = [];
    if (pendingDailyMs)
      lines.push(`⬇️ Yesterday: ${pendingDailyMs}ms — ready to claim!`);
    lines.push(daily.bestReactionMs
      ? `Today: ${daily.bestReactionMs}ms (results at midnight)`
      : 'Play KOTH to track your speed!');
    if (pendingWeeklyMs)
      lines.push(`⬇️ Last week: ${pendingWeeklyMs}ms — ready to claim!`);
    else if (week.bestReactionMs)
      lines.push(`This week: ${week.bestReactionMs}ms`);
    bestEl.innerHTML = lines.join('<br>');
  }

  // Current week prize display
  const weeklyPrizeEl = document.getElementById('kothFastestWeeklyPrize');
  if (weeklyPrizeEl) weeklyPrizeEl.textContent = `💎 ${weeklyPrize.toLocaleString()}`;

  // Pending weekly claim amount (from previous week's pool, not current)
  const weeklyAmtEl = document.getElementById('kothFastestWeeklyClaimAmt');
  if (weeklyAmtEl) weeklyAmtEl.textContent = pendingWeeklyPrize.toLocaleString();

  // Daily claim button — pending only
  const dailyWrap = document.getElementById('kothFastestDailyClaimWrap');
  const dailyBtn  = document.getElementById('kothFastestDailyBtn');
  if (dailyWrap) dailyWrap.style.display = pendingDailyMs ? 'block' : 'none';
  if (dailyBtn && pendingDailyMs)
    dailyBtn.textContent = `⚡ CLAIM DAILY FASTEST — ${pendingDailyMs}ms · 💎 50`;

  // Weekly claim button — pending only
  const weeklyWrap = document.getElementById('kothFastestWeeklyClaimWrap');
  const weeklyBtn  = document.getElementById('kothFastestWeeklyBtn');
  if (weeklyWrap) weeklyWrap.style.display = (pendingWeeklyMs && pendingWeeklyPrize > 0) ? 'block' : 'none';
  if (weeklyBtn && pendingWeeklyMs)
    weeklyBtn.innerHTML = `🏆 CLAIM WEEKLY FASTEST — ${pendingWeeklyMs}ms · 💎 <span id="kothFastestWeeklyClaimAmt">${pendingWeeklyPrize}</span>`;
}

function claimKothFastestDaily() {
  const yData = gameState.kothDaily?.[_kothYesterdayKey()];
  if (!yData || !yData.bestReactionMs || yData.fastestClaimed) {
    showToast('No daily fastest clicker reward to claim!', 'var(--muted)'); return;
  }
  yData.fastestClaimed = true;
  gameState.diamonds = (gameState.diamonds || 0) + 50;
  saveState(); updateMenuStats(); renderKothFastestSection();
  showToast(`⚡ Fastest Clicker! +💎 50 (${yData.bestReactionMs}ms yesterday)`, '#00e5ff');
  playSound('achieve'); vibrate([50, 50, 200]);
}

function claimKothFastestWeekly() {
  const pwData = gameState.koth?.[_kothPrevWeekKey()];
  if (!pwData || !pwData.bestReactionMs || pwData.fastestClaimed) {
    showToast('No weekly fastest reward!', 'var(--muted)'); return;
  }
  const prize = Math.floor((pwData.pool || 0) * 0.10);
  if (prize <= 0) { showToast('No weekly fastest reward!', 'var(--muted)'); return; }
  pwData.fastestClaimed = true;
  gameState.diamonds = (gameState.diamonds || 0) + prize;
  saveState(); updateMenuStats(); renderKothFastestSection();
  showToast(`⚡ Weekly Fastest! +💎 ${prize} (${pwData.bestReactionMs}ms last week)`, 'var(--gold)');
  playSound('achieve'); vibrate([50, 50, 200]);
}

function openKothScreen() {
  const pool = getKothSimulatedPool();
  const weekData = getKothWeekData();

  document.getElementById('kothPoolAmount').textContent = `💎 ${Math.floor(pool).toLocaleString()}`;
  document.getElementById('kothPoolTimer').textContent = getKothWeekTimer();
  document.getElementById('kothPrize1').textContent = `💎 ${Math.floor(pool * 0.60).toLocaleString()}`;
  document.getElementById('kothPrize2').textContent = `💎 ${Math.floor(pool * 0.25).toLocaleString()}`;
  document.getElementById('kothPrize3').textContent = `💎 ${Math.floor(pool * 0.15).toLocaleString()}`;
  document.getElementById('kothPrizeFastest').textContent = `💎 ${Math.floor(pool * 0.10).toLocaleString()}`;

  // Your stats
  document.getElementById('kothYourWins').textContent = weekData.wins || 0;
  document.getElementById('kothYourPool').textContent = `💎 ${(weekData.contributed || 0).toLocaleString()}`;
  document.getElementById('kothBalance').textContent = (gameState.diamonds || 0).toLocaleString();

  document.getElementById('kothYourRank').textContent = '—';
  const _prizePreviewEl = document.getElementById('kothYourRankPrize');
  if (_prizePreviewEl) { _prizePreviewEl.textContent = '—'; _prizePreviewEl.style.color = 'var(--muted)'; }

  // Weekly leaderboard — render local placeholder immediately, then load from server
  renderKothLeaderboard(weekData.wins || 0, null);
  fetchKothLeaderboard('current');

  // Daily reward section
  renderKothDailySection();
  checkKothDailyRewardOnOpen();

  // Fastest clicker section
  renderKothFastestSection();

  // Entry button
  const canPlay = (gameState.diamonds || 0) >= KOTH_ENTRY_FEE;
  const gamesNeeded = Math.max(0, 5 - (gameState.games || 0));
  const canEnter = canPlay && gamesNeeded === 0;

  document.getElementById('kothPlayBtn').style.opacity = canEnter ? '1' : '0.5';
  const insuffEl = document.getElementById('kothInsufficientMsg');
  if (gamesNeeded > 0) {
    insuffEl.style.display = 'block';
    insuffEl.textContent = `🔒 Play ${gamesNeeded} more game${gamesNeeded > 1 ? 's' : ''} to unlock KOTH`;
    insuffEl.style.color = 'var(--muted)';
  } else if (!canPlay) {
    insuffEl.style.display = 'block';
    insuffEl.textContent = 'Not enough diamonds! Need 💎 50';
    insuffEl.style.color = 'var(--red)';
  } else {
    insuffEl.style.display = 'none';
  }

  showScreen('kothScreen');
}

function renderKothLeaderboard(playerWins, serverRows) {
  const lb = document.getElementById('kothWeeklyLb');
  lb.innerHTML = '';

  const pid = typeof PLAYER_ID !== 'undefined' ? PLAYER_ID : null;
  const av  = typeof getActiveAvatar === 'function' ? getActiveAvatar() : null;
  const playerAvatar = av ? av.icon : '🎮';
  const playerName   = gameState.playerName || 'YOU';

  if (serverRows && serverRows.length > 0) {
    const medalMap     = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const playerInList = serverRows.some(e => e.player_id === pid);

    serverRows.forEach(entry => {
      const isYou    = entry.player_id === pid;
      const rankLabel = medalMap[entry.rank] || `#${entry.rank}`;
      const row = document.createElement('div');
      row.className = 'lb-entry' + (isYou ? ' is-you' : '');
      row.innerHTML =
        `<div class="lb-entry-rank">${rankLabel}</div>` +
        `<div class="lb-entry-avatar">${entry.avatar}</div>` +
        `<div class="lb-entry-name">${entry.player_name}` +
          (isYou ? ' <span style="font-size:10px;color:var(--fire)">(YOU)</span>' : '') +
        `</div>` +
        `<div class="lb-entry-val">${entry.wins} win${entry.wins !== 1 ? 's' : ''}</div>`;
      lb.appendChild(row);
    });

    // Player has wins but is outside top 20 — show below separator with real rank
    if (playerWins > 0 && !playerInList) {
      const sep = document.createElement('div');
      sep.style.cssText = 'text-align:center;color:var(--muted);font-size:11px;padding:6px 0;letter-spacing:1px;';
      sep.textContent = '· · ·';
      lb.appendChild(sep);
      const myRank = _kothCachedWeeklyRank;
      const row = document.createElement('div');
      row.className = 'lb-entry is-you';
      row.innerHTML =
        `<div class="lb-entry-rank">${myRank ? `#${myRank}` : '—'}</div>` +
        `<div class="lb-entry-avatar">${playerAvatar}</div>` +
        `<div class="lb-entry-name">${playerName} <span style="font-size:10px;color:var(--fire)">(YOU)</span></div>` +
        `<div class="lb-entry-val">${playerWins} win${playerWins !== 1 ? 's' : ''}</div>`;
      lb.appendChild(row);
    }
  } else {
    // Server data not yet loaded — show local entry while loading
    if (playerWins > 0) {
      const row = document.createElement('div');
      row.className = 'lb-entry is-you';
      row.innerHTML =
        `<div class="lb-entry-rank">🏆</div>` +
        `<div class="lb-entry-avatar">${playerAvatar}</div>` +
        `<div class="lb-entry-name">${playerName} <span style="font-size:10px;color:var(--fire)">(YOU)</span></div>` +
        `<div class="lb-entry-val">${playerWins} win${playerWins !== 1 ? 's' : ''}</div>`;
      lb.appendChild(row);
    }
    const note = document.createElement('div');
    note.style.cssText = 'text-align:center;color:var(--muted);font-size:11px;letter-spacing:1px;padding:16px 8px;';
    note.textContent = serverRows === null ? 'Loading leaderboard...' : 'Play KOTH matches to appear on the leaderboard!';
    lb.appendChild(note);
  }
}

function startKoth() {
  if ((gameState.diamonds || 0) < KOTH_ENTRY_FEE) {
    showToast('Not enough diamonds! Need 💎 50', 'var(--red)');
    return;
  }
  // Require 5 games before KOTH
  if ((gameState.games || 0) < 5) {
    const remaining = 5 - (gameState.games || 0);
    showToast(`Play ${remaining} more game${remaining > 1 ? 's' : ''} to unlock KOTH!`, 'var(--muted)');
    document.getElementById('kothInsufficientMsg').textContent =
      `Play ${remaining} more regular game${remaining > 1 ? 's' : ''} to unlock KOTH`;
    document.getElementById('kothInsufficientMsg').style.display = 'block';
    return;
  }
  // Deduct entry fee
  gameState.diamonds -= KOTH_ENTRY_FEE;
  const weekData = getKothWeekData();
  weekData.pool += KOTH_ENTRY_FEE * KOTH_POOL_PCT;
  weekData.contributed = (weekData.contributed || 0) + KOTH_ENTRY_FEE;
  weekData.gamesPlayed = (weekData.gamesPlayed || 0) + 1;
  saveState();
  updateMenuStats();
  // Start as rush mode game
  gameState.mode = 'koth';
  startLobby();
}

function updateKothGameBanner() {
  const banner = document.getElementById('kothGameBanner');
  if (gameState.mode !== 'koth') { banner.style.display = 'none'; return; }
  banner.style.display = 'flex';
  const pool = getKothSimulatedPool();
  document.getElementById('kothGamePool').textContent = `💎 ${Math.floor(pool).toLocaleString()}`;
  document.getElementById('kothGameWins').textContent = getKothWeekData().wins || 0;
}

function handleKothWin() {
  const weekData = getKothWeekData();
  weekData.wins = (weekData.wins || 0) + 1;
  // Track daily wins separately
  const daily = getKothDailyData();
  daily.wins = (daily.wins || 0) + 1;
  saveState();
  const pct = getKothDailyPercentile(daily.wins);
  const eligible = getEligibleDailyReward(daily.wins);
  let msg = `👑 KOTH win! ${weekData.wins} wins this week`;
  if (eligible && !daily.claimed) msg += ` · ${eligible.tier} today!`;
  showToast(msg, 'var(--gold)');
  checkKothWeeklyReset();
}

function checkKothWeeklyReset() {
  const lastReset = gameState.kothLastResetCheck;
  const thisWeek = getKothWeekKey();
  if (lastReset && lastReset !== thisWeek && gameState.koth?.[lastReset]) {
    // New week — distribute prizes for last week
    distributeKothPrizes(lastReset);
  }
  gameState.kothLastResetCheck = thisWeek;
  saveState();
}

// Derives the ISO Monday date string from a weekKey like "koth_2025-05-26"
function _kothWeekKeyToStart(weekKey) {
  return weekKey.replace('koth_', '');
}

async function distributeKothPrizes(weekKey) {
  const weekData = gameState.koth?.[weekKey];
  if (!weekData || weekData.wins === 0 || weekData.prizesClaimed) return;

  const weekStart = _kothWeekKeyToStart(weekKey);

  const srv = typeof getActiveServer === 'function' ? getActiveServer() : null;
  const pid = typeof PLAYER_ID !== 'undefined' ? PLAYER_ID : null;

  // If no connectivity, leave prizesClaimed=false so checkKothPrizesOnAppStart retries later
  if (!srv || !pid) return;

  let result = null;
  try {
    const r = await fetch(`${srv.http}/koth/prizes/claim`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ playerId: pid, weekStart }),
      signal:  AbortSignal.timeout(12000),
    });
    if (r.ok) result = await r.json();
  } catch(e) { /* server offline — leave prizesClaimed=false for retry */ }

  if (!result || result.reason === 'db_unavailable' || result.reason === 'server_error') {
    // Transient failure — do NOT mark as claimed; retry on next app start
    return;
  }

  // Definitive server response received — mark locally as claimed
  weekData.prizesClaimed = true;
  saveState();

  if (result.ok) {
    gameState.diamonds = (gameState.diamonds || 0) + result.prize;
    saveState(); updateMenuStats();
    assignKothTitle(result.rank);
    showKothReward(result.rank, result.prize);
  } else if (result.reason === 'already_claimed') {
    // Server already processed (prior response was lost) — restore local state from server data
    if (result.rank) assignKothTitle(result.rank);
  } else {
    // not_ranked / not_top3 — player did not place, revoke any active title
    assignKothTitle(99);
  }
}

// Called on app start after cloud save loads.
// Distributes prizes for any past week that has wins but no local claim yet.
// This covers the case where the player went inactive after the week ended.
async function checkKothPrizesOnAppStart() {
  if (!gameState.koth) return;
  const thisWeek = getKothWeekKey();
  for (const weekKey of Object.keys(gameState.koth)) {
    if (weekKey === thisWeek) continue; // never distribute for current week
    const wd = gameState.koth[weekKey];
    if (wd && wd.wins > 0 && !wd.prizesClaimed) {
      await distributeKothPrizes(weekKey);
    }
  }
}

function showKothReward(place, amount) {
  const crowns = {1:'👑', 2:'🥈', 3:'🥉'};
  const titles = {1:'WEEKLY WINNER!', 2:'RUNNER UP!', 3:'THIRD PLACE!'};
  const places = {1:'1ST PLACE', 2:'2ND PLACE', 3:'3RD PLACE'};
  document.getElementById('kothRewardCrown').textContent = crowns[place];
  document.getElementById('kothRewardTitle').textContent = titles[place];
  document.getElementById('kothRewardPlace').textContent = places[place];
  document.getElementById('kothRewardAmount').textContent = `💎 ${amount.toLocaleString()}`;
  document.getElementById('kothRewardOverlay').classList.add('show');
}

function closeKothReward() {
  document.getElementById('kothRewardOverlay').classList.remove('show');
}

// ===== KOTH TITLE SYSTEM =====
// Called after weekly KOTH reset to assign title
function assignKothTitle(place) {
  if (!gameState.kothTitles) gameState.kothTitles = { gold:0, silver:0, bronze:0 };
  const prev = gameState.kothCurrentTitle;

  if (place === 1) {
    gameState.kothTitles.gold++;
    gameState.kothCurrentTitle = 'gold';
    gameState.kothTop3Count = (gameState.kothTop3Count || 0) + 1;
    unlockAvatar('av_koth');
  } else if (place <= 3) {
    gameState.kothTitles.silver++;
    gameState.kothCurrentTitle = 'silver';
    gameState.kothTop3Count = (gameState.kothTop3Count || 0) + 1;
    unlockAvatar('av_koth');
  } else if (place <= 5) {
    gameState.kothTitles.bronze++;
    gameState.kothCurrentTitle = 'bronze';
  } else {
    gameState.kothCurrentTitle = null; // lost title
  }

  if (gameState.kothCurrentTitle && gameState.kothCurrentTitle !== prev) {
    const icons  = { gold:'👑', silver:'🥈', bronze:'🥉' };
    const labels = { gold:'KOTH CHAMPION', silver:'KOTH ELITE', bronze:'KOTH CONTENDER' };
    showToast(`${icons[gameState.kothCurrentTitle]} ${labels[gameState.kothCurrentTitle]} title earned!`, 'var(--gold)');
    playSound('achieve');
  }
  saveState();
  updateMenuCustomLobbyCard();
}

function getKothTitleFrame() {
  const t = gameState.kothCurrentTitle;
  if (t === 'gold')   return 'koth-frame-gold';
  if (t === 'silver') return 'koth-frame-silver';
  if (t === 'bronze') return 'koth-frame-bronze';
  return '';
}

function hasCustomLobbyAccess() {
  return ['gold','silver'].includes(gameState.kothCurrentTitle);
}

function updateProfileAvatar() {
  const av = getActiveAvatar();
  const frame = document.getElementById('profileAvatarFrame');
  if (frame) {
    frame.textContent = av.icon;
    frame.style.borderColor = av.border;
    frame.style.background  = av.bg;
    // KOTH title frame overrides avatar border
    const titleFrame = getKothTitleFrame();
    frame.classList.remove('whale-frame','koth-frame-gold','koth-frame-silver','koth-frame-bronze');
    if (av.whaleBorder) frame.classList.add('whale-frame');
    if (titleFrame) frame.classList.add(titleFrame);
  }

  // Medal badge
  let badge = document.getElementById('kothMedalBadge');
  const titles = gameState.kothTitles || {};
  const cur    = gameState.kothCurrentTitle;
  if (cur && frame) {
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'kothMedalBadge';
      badge.className = 'koth-medal-badge';
      frame.parentElement.style.position = 'relative';
      frame.parentElement.appendChild(badge);
    }
    const count = titles[cur] || 1;
    const medalClass = `koth-medal-${cur}`;
    badge.className = `koth-medal-badge ${medalClass}`;
    const icons = { gold:'🥇', silver:'🥈', bronze:'🥉' };
    badge.textContent = `${icons[cur]}${count}`;
    badge.title = `${count}× ${cur} title`;
    badge.style.display = 'flex';
  } else if (badge) {
    badge.style.display = 'none';
  }

  // Title strip
  const strip = document.getElementById('kothTitleStrip');
  if (strip) {
    if (cur) {
      strip.style.display = 'flex';
      const icons  = { gold:'👑', silver:'🥈', bronze:'🥉' };
      const labels = { gold:'KOTH CHAMPION', silver:'KOTH ELITE', bronze:'KOTH CONTENDER' };
      const colors = { gold:'var(--gold)', silver:'#c0c0c0', bronze:'#cd7f32' };
      document.getElementById('kothTitleIcon').textContent  = icons[cur];
      document.getElementById('kothTitleText').textContent  = labels[cur];
      document.getElementById('kothTitleText').style.color  = colors[cur];
      document.getElementById('kothTitleCount').textContent = `×${titles[cur] || 1}`;
      strip.style.borderColor = colors[cur] + '44';
    } else {
      strip.style.display = 'none';
    }
  }
}

function updateMenuCustomLobbyCard() {
  const card = document.getElementById('customLobbyModeCard');
  const sub  = document.getElementById('customLobbySubtext');
  const icon = document.getElementById('customLobbyIcon');
  if (!card) return;
  if (hasCustomLobbyAccess()) {
    card.classList.remove('locked-mode');
    card.style.borderColor = 'rgba(0,229,255,0.3)';
    sub.textContent  = 'Invite friends · Custom rules';
    sub.style.color  = 'var(--diamond)';
    icon.textContent = '🏟️';
  } else {
    card.classList.add('locked-mode');
    sub.textContent = '🔒 KOTH Top 3 required';
    sub.style.color = 'var(--muted)';
    icon.textContent = '🔒';
  }
}

