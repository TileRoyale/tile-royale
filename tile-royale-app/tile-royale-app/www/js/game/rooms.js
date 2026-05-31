// ===== KING OF THE HILL SYSTEM =====
const KOTH_ENTRY_FEE = 50;
const KOTH_POOL_PCT  = 0.5; // 50% to prize pool
const KOTH_PRIZES    = [0.60, 0.25, 0.15]; // 1st, 2nd, 3rd

function getKothWeekKey() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `koth_${now.getFullYear()}_w${week}`;
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
  const now = new Date();
  const nextMon = new Date(now);
  nextMon.setDate(now.getDate() + (7 - now.getDay() + 1) % 7 || 7);
  nextMon.setHours(0,0,0,0);
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
  return `kothDaily_${new Date().toDateString()}`;
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
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight - now;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// Returns null — real percentile requires server-side KOTH player data
function getKothDailyPercentile(wins) {
  return null;
}

function getEligibleDailyReward(wins) {
  const pct = getKothDailyPercentile(wins);
  return KOTH_DAILY_REWARDS.find(r => pct <= r.maxPct) || null;
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
      rankEl.textContent = `${wins} win${wins !== 1 ? 's' : ''} today`;
      rankEl.style.color = 'var(--diamond)';
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

function claimKothDailyReward() {
  const daily = getKothDailyData();
  if (daily.claimed) { showToast('Already claimed today!', 'var(--muted)'); return; }

  const eligible = getEligibleDailyReward(daily.wins || 0);
  if (!eligible) { showToast('Not eligible today — play more KOTH!', 'var(--muted)'); return; }

  daily.claimed = true;
  gameState.diamonds = (gameState.diamonds || 0) + eligible.diamonds;
  saveState();
  updateMenuStats();
  renderKothDailySection();

  // Show reward modal
  document.getElementById('kothDailyRewardIcon').textContent = eligible.icon;
  document.getElementById('kothDailyRewardTier').textContent = eligible.tier;
  document.getElementById('kothDailyRewardTier').style.color = eligible.color;
  document.getElementById('kothDailyRewardAmount').textContent = `💎 ${eligible.diamonds.toLocaleString()}`;
  document.getElementById('kothDailyRewardSub').textContent =
    `You were in the ${eligible.tier} of KOTH players today!`;
  document.getElementById('kothDailyRewardOverlay').classList.add('show');
  playSound('achieve');
  vibrate([50, 50, 200]);
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
  const pool  = getKothSimulatedPool();
  const weeklyPrize = Math.floor(pool * 0.10);

  const bestEl = document.getElementById('kothFastestBest');
  if (bestEl) bestEl.textContent = daily.bestReactionMs ? `Your best today: ${daily.bestReactionMs}ms` : 'Play KOTH to track your speed!';

  const weeklyPrizeEl = document.getElementById('kothFastestWeeklyPrize');
  if (weeklyPrizeEl) weeklyPrizeEl.textContent = `💎 ${weeklyPrize.toLocaleString()}`;

  const weeklyAmtEl = document.getElementById('kothFastestWeeklyClaimAmt');
  if (weeklyAmtEl) weeklyAmtEl.textContent = weeklyPrize.toLocaleString();

  const dailyWrap = document.getElementById('kothFastestDailyClaimWrap');
  if (dailyWrap) dailyWrap.style.display = (daily.bestReactionMs && !daily.fastestClaimed) ? 'block' : 'none';

  const weeklyWrap = document.getElementById('kothFastestWeeklyClaimWrap');
  if (weeklyWrap) weeklyWrap.style.display = (week.bestReactionMs && !week.fastestClaimed && weeklyPrize > 0) ? 'block' : 'none';
}

function claimKothFastestDaily() {
  const daily = getKothDailyData();
  if (daily.fastestClaimed || !daily.bestReactionMs) { showToast('No fastest clicker reward to claim!', 'var(--muted)'); return; }
  daily.fastestClaimed = true;
  gameState.diamonds = (gameState.diamonds || 0) + 50;
  saveState(); updateMenuStats(); renderKothFastestSection();
  showToast(`⚡ Fastest Clicker! +💎 50 (${daily.bestReactionMs}ms)`, '#00e5ff');
  playSound('achieve'); vibrate([50, 50, 200]);
}

function claimKothFastestWeekly() {
  const week  = getKothWeekData();
  const prize = Math.floor(getKothSimulatedPool() * 0.10);
  if (week.fastestClaimed || !week.bestReactionMs || prize <= 0) { showToast('No weekly fastest reward!', 'var(--muted)'); return; }
  week.fastestClaimed = true;
  gameState.diamonds = (gameState.diamonds || 0) + prize;
  saveState(); updateMenuStats(); renderKothFastestSection();
  showToast(`⚡ Weekly Fastest! +💎 ${prize} (${week.bestReactionMs}ms best)`, 'var(--gold)');
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

  // Weekly leaderboard
  renderKothLeaderboard(weekData.wins || 0);

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

function renderKothLeaderboard(playerWins) {
  const lb = document.getElementById('kothWeeklyLb');
  lb.innerHTML = '';

  const av = typeof getActiveAvatar === 'function' ? getActiveAvatar() : null;
  const playerAvatar = av ? av.icon : '🎮';
  const playerName   = gameState.playerName || 'YOU';

  // Show only the real player entry — server-side KOTH leaderboard coming soon
  if (playerWins > 0) {
    const row = document.createElement('div');
    row.className = 'lb-entry is-you';
    row.innerHTML =
      `<div class="lb-entry-rank">🏆</div>` +
      `<div class="lb-entry-avatar">${playerAvatar}</div>` +
      `<div class="lb-entry-name">${playerName} <span style="font-size:10px;color:var(--fire)">(YOU)</span></div>` +
      `<div class="lb-entry-val">${playerWins} wins</div>`;
    lb.appendChild(row);
  }

  const note = document.createElement('div');
  note.style.cssText = 'text-align:center;color:var(--muted);font-size:11px;letter-spacing:1px;padding:16px 8px;line-height:1.6;';
  note.textContent = playerWins > 0
    ? 'Global leaderboard coming soon — play more KOTH to build your score!'
    : 'Play KOTH matches to appear on the leaderboard!';
  lb.appendChild(note);
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

function distributeKothPrizes(weekKey) {
  const weekData = gameState.koth?.[weekKey];
  if (!weekData || weekData.wins === 0 || weekData.prizesClaimed) return;
  weekData.prizesClaimed = true;

  const pool = weekData.pool || 0;
  if (pool <= 0) return;

  // Prize distribution requires real server-side leaderboard — skip for now
  const wins = weekData.wins || 0;
  let place = 4;
  // Will be replaced with real server rank once KOTH backend is implemented

  if (place <= 3) {
    const prize = Math.floor(pool * KOTH_PRIZES[place-1]);
    gameState.diamonds = (gameState.diamonds || 0) + prize;
    saveState();
    updateMenuStats();
    assignKothTitle(place);
    showKothReward(place, prize);
  } else {
    // Lost title
    assignKothTitle(99);
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

