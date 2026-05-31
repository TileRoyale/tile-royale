// ===== SHARE RESULT =====
function shareResult() {
  const place = playerPlace;
  const name = gameState.playerName || 'Player';
  const mode = gameState.mode.toUpperCase();
  const placeEmoji = place === 1 ? '🏆' : place <= 3 ? '🥈' : '🎮';
  const text = `${placeEmoji} I finished ${place === 1 ? '1st' : place+'th'} in Tile Royale ${mode} mode!\n\nLast tap standing — can you beat me?\n🔥 Download Tile Royale`;
  if (navigator.share) {
    navigator.share({ title: 'Tile Royale', text }).catch(() => copyToClipboard(text));
  } else {
    copyToClipboard(text);
  }
}

// ===== VICTORY SKIN SYSTEM =====
function renderVictorySkins(grid) {
  const owned   = gameState.ownedSkins || {};
  const active  = (activeSkins.victory) || 'vic_classic';
  const skins   = SKINS.victory || [];

  const tierLabels = { common:'Common', rare:'Rare', epic:'Epic', legendary:'Legendary', prestige:'Prestige', default:'' };
  const tierColors  = { common:'tier-common', rare:'tier-rare', epic:'tier-epic', legendary:'tier-legendary', prestige:'tier-prestige' };

  grid.innerHTML = '';
  (skins||[]).forEach(skin => {
    const isOwned  = skin.owned || owned[skin.id];
    const isActive = active === skin.id;
    const card = document.createElement('div');
    card.className = 'skin-card' + (isActive ? ' active' : '') + (!isOwned ? ' locked' : '') + (skin.prestige ? ' prestige' : '');
    card.onclick = () => selectVictorySkin(skin, isOwned);

    const tierBadge = skin.tier && skin.tier !== 'default'
      ? `<span class="skin-tier-badge ${tierColors[skin.tier]||''}">${tierLabels[skin.tier]||''}</span>`
      : '';
    const priceText = skin.whale ? '🐋 Whale Only'
      : isOwned ? (isActive ? '✓ Active' : 'Owned')
      : `💎 ${skin.price}`;

    const artStyle = skin.art
      ? `background-image:url('${skin.art}');`
      : '';
    const artClass = skin.art ? ' has-art' : '';
    card.innerHTML = `
      <div class="vic-preview vic-${skin.preview}${artClass}" style="${artStyle}">${skin.art ? '' : skin.icon}</div>
      <div class="skin-card-info" style="flex:1;min-width:0;">
        <div class="skin-name">${skin.name}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px;flex-wrap:wrap;">
          <div class="skin-price">${priceText}</div>${tierBadge}
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

function selectVictorySkin(skin, isOwned) {
  if (skin.whale && !gameState.whaleBadge) {
    showToast('🐋 Whale exclusive — only for whale owners!', 'var(--diamond)'); return;
  }
  if (isOwned) {
    activeSkins.victory = skin.id;
    gameState.activeSkins = activeSkins;
    saveState();
    renderVictorySkins(document.getElementById('skinGrid-victory'));
    showToast(`✅ ${skin.name} victory screen active!`, 'var(--green)');
    return;
  }
  if (skin.price === 0) return;
  if ((gameState.diamonds || 0) < skin.price) {
    showToast(`Need 💎 ${skin.price}!`, 'var(--red)'); return;
  }
  // Purchase victory skin
  gameState.diamonds -= skin.price;
  if (!gameState.ownedSkins) gameState.ownedSkins = {};
  gameState.ownedSkins[skin.id] = true;
  activeSkins.victory = skin.id;
  gameState.activeSkins = activeSkins;
  saveState(); updateMenuStats();
  renderVictorySkins(document.getElementById('skinGrid-victory'));
  showToast(`✅ ${skin.name} unlocked!`, 'var(--green)');
  playSound('achieve');
}

// Victory skin custom messages
const VICTORY_MESSAGES = {
  vic_bacon:    { title:'ALL THE BACON!', sub:'Congratulations! You get all the bacon! 🥓' },
  vic_pizza:    { title:'PIZZA WINNER!',  sub:'You earned the most important thing — pizza. 🍕' },
  vic_grandma:  { title:"GRANDMA'S PROUD!", sub:'She made an extra portion of soup for you. 👵' },
  vic_disco:    { title:'STAYIN ALIVE!',  sub:"Everyone else left the dance floor. 🕺" },
  vic_goat:     { title:'G.O.A.T.',       sub:'Greatest Of All Taps. Scientifically proven. 🐐' },
  vic_cheese:   { title:'BIG CHEESE!',    sub:"You're the big cheese now. Literally. 🧀" },
  vic_404:      { title:'WINNER FOUND',   sub:'Error 404: Opponents not found. Check your internet. 💻' },
  vic_humble:   { title:'NO BIG DEAL',    sub:"It's not like you practiced or anything. 🙄" },
};

function _showVictoryArtwork(skin) {
  const wrap    = document.getElementById('victoryArtwork');
  const img     = document.getElementById('victoryArtworkImg');
  const tagline = document.getElementById('victoryTagline');
  if (wrap && img) {
    if (skin && skin.art) {
      img.src = skin.art;
      wrap.style.display = 'flex';
    } else {
      wrap.style.display = 'none';
      img.src = '';
    }
  }
  if (tagline) {
    if (skin && skin.tagline) {
      tagline.textContent = skin.tagline;
      tagline.style.display = 'block';
    } else {
      tagline.style.display = 'none';
      tagline.textContent = '';
    }
  }
}

function applyVictoryScreenSkinById(skinId) {
  const screen = document.getElementById('resultScreen');
  if (!screen) return;
  screen.className = (screen.className || '').replace(/result-vic-\S+/g, '').trim();
  const skin = (SKINS.victory || []).find(s => s.id === skinId);
  if (skin && skinId !== 'vic_classic') {
    screen.classList.add(`result-vic-${skin.preview}`);
  }
  _showVictoryArtwork(skin || null);
  // Show winner skin toast for non-classic skins shown to losers
  if (skin && skinId !== 'vic_classic') {
    setTimeout(() => showToast(`👑 Winner's screen: ${skin.icon} ${skin.name}`, 'var(--gold)'), 800);
  }
}

function applyVictoryScreenSkin() {
  const vic = activeSkins.victory || 'vic_classic';
  const screen = document.getElementById('resultScreen');
  if (!screen) return;
  screen.className = (screen.className || '').replace(/result-vic-\S+/g, '').trim();
  const skin = (SKINS.victory || []).find(s => s.id === vic);
  if (vic !== 'vic_classic' && skin) {
    if (skin.preview) screen.classList.add(`result-vic-${skin.preview}`);
  }
  _showVictoryArtwork(skin || null);
  // Apply custom message
  const msg = VICTORY_MESSAGES[vic];
  if (msg && (!playerEliminated || playerWon)) {
    const titleEl = document.getElementById('resultTitle');
    const subEl   = document.getElementById('resultSubText') || document.getElementById('resultPlace');
    if (titleEl && titleEl.textContent.includes('VICTORY')) {
      titleEl.textContent = msg.title;
    }
    // Show funny sub message as toast
    if (msg.sub) setTimeout(() => showToast(msg.sub, 'var(--gold)'), 800);
  }
}

function renderTrophyRoad() {
  const el = document.getElementById('trophyRoad');
  if (!el) return;

  const pts     = getTrophyPoints();
  const league  = getCurrentLeague();
  const claimed = gameState.trophyMilestonesClaimed || [];
  const idx     = LEAGUES.indexOf(league);
  const next    = LEAGUES[idx + 1] || null;
  const pct     = next
    ? Math.min(100, Math.round((pts - league.threshold) / (next.threshold - league.threshold) * 100))
    : 100;

  const RICON = { diamonds:'💎', tickets:'🎟️', spins:'🎡', title:'👑' };

  const milestoneHtml = TROPHY_MILESTONES.map(m => {
    const isClaimed = claimed.includes(m.pts);
    const isEarned  = pts >= m.pts && !isClaimed;
    const cls       = isClaimed ? 'claimed' : isEarned ? 'earned' : 'locked';
    const icon      = isClaimed ? '✓' : (RICON[m.reward.type] || '🎁');
    const click     = isEarned  ? `onclick="claimTrophyMilestone(${m.pts})"` : '';
    return `<div class="trophy-milestone ${cls}" ${click}>` +
      `<div class="trophy-milestone-pts">${m.pts}</div>` +
      `<div class="trophy-milestone-icon">${icon}</div>` +
      `<div class="trophy-milestone-label">${isClaimed ? 'Done' : m.label}</div>` +
    `</div>`;
  }).join('');

  el.innerHTML =
    `<div class="trophy-road">` +
      `<div class="trophy-road-top">` +
        `<div class="trophy-league-badge">${league.icon}</div>` +
        `<div class="trophy-league-info">` +
          `<div class="trophy-league-name">${league.name}</div>` +
          `<div class="trophy-league-pts">${pts.toLocaleString()} Trophy Points</div>` +
          (next
            ? `<div class="trophy-league-next">${next.icon} ${next.name} — ${(next.threshold - pts).toLocaleString()} pts away</div>`
            : `<div class="trophy-league-next">👑 Maximum League Reached!</div>`) +
          `<div class="trophy-road-bar-wrap"><div class="trophy-road-bar" style="width:${pct}%"></div></div>` +
        `</div>` +
      `</div>` +
      `<div class="trophy-milestones">${milestoneHtml}</div>` +
    `</div>`;
}

function openAchievements() {
  initAchStats();
  achCurrentFilter = 'all';
  document.querySelectorAll('.ach-filter').forEach(f => f.classList.remove('active'));
  document.querySelector('.ach-filter').classList.add('active');
  renderAchievements();
  showScreen('achievementsScreen');
}

function filterAch(filter, el) {
  achCurrentFilter = filter;
  document.querySelectorAll('.ach-filter').forEach(f => f.classList.remove('active'));
  el.classList.add('active');
  renderAchievements();
}

function renderAchievements() {
  try { renderTrophyRoad(); } catch(e) {}
  initAchStats();
  const unlocked = gameState.unlockedAch || [];
  const s = gameState.achStats || {};
  const list = document.getElementById('achList');
  list.innerHTML = '';

  // Add ring achievements section
  const ra = gameState.ringAchievements || {};
  const inv = gameState.ringInventory || [];
  const ringStats = {
    invSize:   inv.length,
    uncommon:  inv.filter(r=>{const rg=getRingDef(r);return rg&&['uncommon','rare','epic','legendary','secret'].includes(rg.rarityId);}).length,
    rare:      inv.filter(r=>{const rg=getRingDef(r);return rg&&['rare','epic','legendary','secret'].includes(rg.rarityId);}).length,
    epic:      inv.filter(r=>{const rg=getRingDef(r);return rg&&['epic','legendary','secret'].includes(rg.rarityId);}).length,
    legendary: inv.filter(r=>{const rg=getRingDef(r);return rg&&['legendary','secret'].includes(rg.rarityId);}).length,
    secret:    inv.filter(r=>{const rg=getRingDef(r);return rg&&rg.rarityId==='secret';}).length,
    trades:    gameState.tradesDone||0,
    slotsUsed: Object.values(gameState.gauntlet||{}).filter(Boolean).length,
  };
  const gr = getGauntletRarityLabel ? getGauntletRarityLabel() : null;
  if(gr){const idx=RARITY_ORDER.indexOf(gr);if(idx<=3)ringStats.gauntRare=1;if(idx<=2)ringStats.gauntEpic=1;if(idx<=1)ringStats.gauntLeg=1;if(idx<=0)ringStats.gauntSec=1;}

  if ((gameState.level||1) >= 3 && (achCurrentFilter === 'all' || achCurrentFilter === 'rings')) {
    const ringHdr = document.createElement('div');
    ringHdr.style.cssText = 'font-family:"Bebas Neue",sans-serif;font-size:18px;letter-spacing:3px;color:var(--diamond);margin:16px 0 8px;width:100%;';
    ringHdr.textContent = '🧤 RING ACHIEVEMENTS';
    list.appendChild(ringHdr);

    [...(typeof RING_ACHIEVEMENTS !== "undefined" ? RING_ACHIEVEMENTS : [])].sort((a,b) => (!!ra[a.id] ? 1 : 0) - (!!ra[b.id] ? 1 : 0)).forEach(ach => {
      const done = !!ra[ach.id];
      const cur  = Math.min(ringStats[ach.stat]||0, ach.goal);
      const pct  = Math.round(cur/ach.goal*100);
      const row  = document.createElement('div');
      row.className = 'ach-card' + (done ? ' unlocked' : '');
      row.innerHTML = '<div class="ach-icon">' + (done?'✅':'🏅') + '</div>' +
        '<div class="ach-body">' +
          '<div class="ach-name">' + ach.label + '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">' +
            '<div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden;">' +
              '<div style="height:100%;width:'+pct+'%;background:'+(done?'var(--green)':'var(--diamond)')+'"></div>' +
            '</div>' +
            '<div class="ach-progress">' + cur + '/' + ach.goal + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ach-reward">+'+ach.reward+'💎</div>';
      list.appendChild(row);
    });
  }

  if (achCurrentFilter === 'rings') return;

  const hdr = document.createElement('div');
  hdr.style.cssText = 'font-family:"Bebas Neue",sans-serif;font-size:18px;letter-spacing:3px;color:var(--fire2);margin:16px 0 8px;width:100%;';
  hdr.textContent = '🏅 GAME ACHIEVEMENTS';
  list.appendChild(hdr);

  const _CAT_SET = new Set(['general','multiplayer','speed','collection','special']);
  const filtered = ACHIEVEMENTS.filter(a => {
    if (achCurrentFilter === 'all') return true;
    if (achCurrentFilter === 'unlocked') return unlocked.includes(a.id);
    if (_CAT_SET.has(achCurrentFilter)) return (typeof ACH_CATEGORIES !== 'undefined' ? ACH_CATEGORIES[a.id] : null) === achCurrentFilter;
    return a.tier === achCurrentFilter;
  }).sort((a,b) => (unlocked.includes(a.id) ? 1 : 0) - (unlocked.includes(b.id) ? 1 : 0));

  (filtered||[]).forEach(a => {
    const isUnlocked = unlocked.includes(a.id);
    const isSecret = a.secret;
    const val = isSecret ? (isUnlocked ? 1 : 0) : Math.min(s[a.stat] || 0, a.goal);
    const pct = Math.round(val / a.goal * 100);

    const tierColors = { bronze:'🥉', silver:'🥈', gold:'🥇', diamond:'💎', secret:'🔐' };
    const card = document.createElement('div');
    card.className = 'ach-card' + (isUnlocked ? ' unlocked' : '') + (isSecret && !isUnlocked ? ' secret' : '');

    const descText = isSecret && !isUnlocked ? '??????' : a.desc;
    const iconText = isSecret && !isUnlocked ? '❓' : a.icon;

    card.innerHTML = `
      <div class="ach-icon">${iconText}</div>
      <div class="ach-body">
        <div class="ach-name">${isSecret && !isUnlocked ? '??????' : a.name}</div>
        <div class="ach-desc">${descText}</div>
      </div>
      <div class="ach-right">
        <div class="ach-tier ${a.tier}">${tierColors[a.tier]}</div>
        ${!isSecret ? `
        <div class="ach-progress-wrap">
          <div class="ach-progress-bar">
            <div class="ach-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="ach-progress-text">${isUnlocked ? '✓ Done' : `${val.toLocaleString()} / ${a.goal.toLocaleString()}`}</div>
        </div>` : `<div class="ach-progress-text">${isUnlocked ? '✓ Found!' : '???'}</div>`}
      </div>
    `;
    list.appendChild(card);
  });

  // Update stats
  const total = ACHIEVEMENTS.length;
  const done = unlocked.length;
  document.getElementById('achUnlocked').textContent = done;
  document.getElementById('achTotal').textContent = total;
  document.getElementById('achPct').textContent = Math.round(done/total*100) + '%';
}

function closeAchPopup() {
  document.getElementById('achPopupOverlay').classList.remove('show');
}

function showComingSoon(name) {
  showToast(`${name} — coming soon!`, 'var(--diamond)');
}

function selectMode(mode, el) {
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  gameState.mode = mode;
}

function selectSize(size, el) {}

// ===== 10. POST-GAME HIGHLIGHT =====
function generateHighlight() {
  const s = gameState.achStats || {};
  const taps = s.roundTapsThisGame || 0;
  const reactions = recentReactions;

  const highlights = [];

  if (reactions.length > 0) {
    const fastest = Math.min(...reactions);
    highlights.push({ icon:'⚡', val:`${fastest}ms fastest tap`, score: 1000 - fastest });
  }
  if (taps >= 5) {
    highlights.push({ icon:'👆', val:`${taps} tiles tapped this game`, score: taps * 10 });
  }
  if (playerPlace === 1) {
    highlights.push({ icon:'🏆', val:'First place — flawless victory!', score: 500 });
  }
  if (playerPlace <= 3 && playerPlace > 1) {
    highlights.push({ icon:'🥈', val:`Top ${playerPlace} finish!`, score: 300 });
  }
  if (recentReactions.length > 3) {
    const avg = Math.round(recentReactions.reduce((a,b)=>a+b,0)/recentReactions.length);
    highlights.push({ icon:'🎯', val:`${avg}ms avg reaction speed`, score: 800 - avg });
  }
  if (highlights.length === 0) return null;

  // Pick best highlight
  highlights.sort((a,b) => b.score - a.score);
  return highlights[0];
}

function showGameSummary(rows, mySessionId) {
  const wrap  = document.getElementById('gameSummary');
  const table = document.getElementById('summaryTable');
  if (!wrap || !table || !rows || !rows.length) { if (wrap) wrap.style.display = 'none'; return; }
  table.innerHTML = `
    <div class="summary-row summary-header">
      <div class="summary-place">#</div>
      <div class="summary-name">PLAYER</div>
      <div class="summary-taps">TAPS</div>
      <div class="summary-speed">AVG REACT</div>
    </div>`;
  rows.forEach((p, i) => {
    const isYou = mySessionId ? (p.sessionId === mySessionId) : !!p.isYou;
    const placeColor = i === 0 ? 'var(--gold)' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'var(--muted)';
    const row = document.createElement('div');
    row.className = 'summary-row' + (isYou ? ' summary-you' : '');
    row.innerHTML = `
      <div class="summary-place" style="color:${placeColor}">${p.place || (i + 1)}</div>
      <div class="summary-name">${p.avatar} ${p.name}${isYou ? ' <span class="summary-you-tag">(YOU)</span>' : ''}</div>
      <div class="summary-taps">${p.tapCount}</div>
      <div class="summary-speed">${p.avgReactionMs > 0 ? p.avgReactionMs + ' ms' : '—'}</div>`;
    table.appendChild(row);
  });
  wrap.style.display = 'block';
}

function showPostGameHighlight() {
  const h = generateHighlight();
  const el = document.getElementById('gameHighlight');
  if (!h || !el) { el && (el.style.display='none'); return; }
  el.style.display = 'flex';
  document.getElementById('highlightIcon').textContent = h.icon;
  document.getElementById('highlightVal').textContent = h.val;
}

