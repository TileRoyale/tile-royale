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
  // Simulate a realistic pool based on week progress and some bot activity
  const weekData = getKothWeekData();
  const dayOfWeek = new Date().getDay();
  const botContributions = (dayOfWeek * 47 + 13) * KOTH_ENTRY_FEE * KOTH_POOL_PCT;
  return weekData.pool + botContributions;
}

// ===== KOTH DAILY TOP REWARD =====
const KOTH_DAILY_REWARDS = [
  { tier: 'TOP 1%',   maxPct: 1,  diamonds: 125, icon: '🥇', color: 'var(--gold)' },
  { tier: 'TOP 2–3%', maxPct: 3,  diamonds: 75,  icon: '🥈', color: '#c0c0c0' },
  { tier: 'TOP 4–5%', maxPct: 5,  diamonds: 25,  icon: '🥉', color: '#cd7f32' },
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

// Simulate total daily KOTH players and get player percentile
function getKothDailyPercentile(wins) {
  // Simulated player distribution — more players have fewer wins
  // With 0 wins, you're in bottom 70%
  // Each win roughly moves you up
  if (wins === 0) return 100;
  if (wins >= 20) return 1;
  if (wins >= 15) return 2;
  if (wins >= 12) return 3;
  if (wins >= 9)  return 4;
  if (wins >= 7)  return 5;
  if (wins >= 5)  return 8;
  if (wins >= 3)  return 15;
  if (wins >= 1)  return 40;
  return 100;
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
      rankEl.textContent = `Top ${pct}% (${wins} wins)`;
      rankEl.style.color = pct <= 5 ? 'var(--gold)' : 'var(--diamond)';
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

function openKothScreen() {
  const pool = getKothSimulatedPool();
  const weekData = getKothWeekData();

  document.getElementById('kothPoolAmount').textContent = `💎 ${Math.floor(pool).toLocaleString()}`;
  document.getElementById('kothPoolTimer').textContent = getKothWeekTimer();
  document.getElementById('kothPrize1').textContent = `💎 ${Math.floor(pool * 0.60).toLocaleString()}`;
  document.getElementById('kothPrize2').textContent = `💎 ${Math.floor(pool * 0.25).toLocaleString()}`;
  document.getElementById('kothPrize3').textContent = `💎 ${Math.floor(pool * 0.15).toLocaleString()}`;

  // Your stats
  document.getElementById('kothYourWins').textContent = weekData.wins || 0;
  document.getElementById('kothYourPool').textContent = `💎 ${(weekData.contributed || 0).toLocaleString()}`;
  document.getElementById('kothBalance').textContent = (gameState.diamonds || 0).toLocaleString();

  // Your rank (simulated)
  const yourWins = weekData.wins || 0;
  const rank = yourWins === 0 ? '—' : yourWins >= 20 ? '#1' : yourWins >= 10 ? '#2' : yourWins >= 5 ? '#3' : `#${Math.floor(30 - yourWins/2) + 3}`;
  document.getElementById('kothYourRank').textContent = rank;

  // Weekly leaderboard
  renderKothLeaderboard(weekData.wins || 0);

  // Daily reward section
  renderKothDailySection();
  checkKothDailyRewardOnOpen();

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
  const day = new Date().getDay();
  // Simulated leaderboard
  const bots = [
    { name:'TapKing',    avatar:'🦁', wins: 28 + day },
    { name:'BlazeMaster',avatar:'🔥', wins: 22 + day },
    { name:'GridRipper', avatar:'🐉', wins: 18 + Math.floor(day*0.8) },
    { name:'SwiftTile',  avatar:'⚡', wins: 15 + Math.floor(day*0.6) },
    { name:'NightTapper',avatar:'👻', wins: 11 + Math.floor(day*0.5) },
  ];

  // Insert player
  const allEntries = [...bots, {
    name: gameState.playerName || 'YOU', avatar:'🎮', wins: playerWins, isYou: true
  }].sort((a,b) => b.wins - a.wins);

  const rankIcons = {1:'🥇', 2:'🥈', 3:'🥉'};
  allEntries.slice(0, 7).forEach((e, i) => {
    const rank = i + 1;
    const row = document.createElement('div');
    row.className = 'lb-entry' + (rank===1?' top1':rank===2?' top2':rank===3?' top3':'') + (e.isYou?' is-you':'');
    row.innerHTML = `
      <div class="lb-entry-rank">${rankIcons[rank] || rank}</div>
      <div class="lb-entry-avatar">${e.avatar}</div>
      <div class="lb-entry-name">${e.name}${e.isYou?' <span style="font-size:10px;color:var(--fire)">(YOU)</span>':''}</div>
      <div class="lb-entry-val">${e.wins} wins</div>
    `;
    lb.appendChild(row);
  });
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

  // Simulate player's rank based on wins vs bots
  const wins = weekData.wins || 0;
  let place = 4; // outside top 3 by default
  if (wins >= 25) place = 1;
  else if (wins >= 18) place = 2;
  else if (wins >= 12) place = 3;

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

