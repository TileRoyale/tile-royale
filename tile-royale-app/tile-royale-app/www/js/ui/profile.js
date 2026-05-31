// ===== ACHIEVEMENTS UI =====
let achCurrentFilter = 'all';

// ===== LEADERBOARD SYSTEM =====
let lbPeriod = 'weekly';
let lbCategory = 'wins';

function getPlayerVal(category) {
  const s = gameState.achStats || {};
  if (category === 'wins')     return gameState.wins || 0;
  if (category === 'taps')     return s.totalTaps || 0;
  if (category === 'diamonds') return s.totalDiamonds || 0;
  if (category === 'level')    return gameState.level || 1;
  if (category === 'practice') return s.bestPracticeTaps || 0;
  return 0;
}

function getCategoryLabel(category, val) {
  if (category === 'wins')     return `${val.toLocaleString()} wins`;
  if (category === 'taps')     return `${val.toLocaleString()} taps`;
  if (category === 'diamonds') return `💎 ${val.toLocaleString()}`;
  if (category === 'level')    return `Level ${val}`;
  if (category === 'practice') return `${val} tiles`;
  return val;
}

// ===== AVATAR PICKER =====
function openAvatarPicker() {
  renderAvatarPicker();
  document.getElementById('avatarPickerOverlay').classList.add('show');
}

function closeAvatarPicker() {
  document.getElementById('avatarPickerOverlay').classList.remove('show');
}

function renderAvatarPicker() {
  const c = document.getElementById('avatarPickerContent');
  c.innerHTML = '';
  const sectionLabels = {
    default:     '🎮 Default',
    achievement: '🏆 Achievement Unlocks',
    koth:        '👑 KOTH Exclusive',
    bundle:      '📦 Bundle Unlocks',
    whale:       '🐋 Whale Exclusive',
  };
  Object.entries(AVATARS).forEach(([section, avatars]) => {
    const lbl = document.createElement('div');
    lbl.className = 'avatar-section-lbl';
    lbl.textContent = sectionLabels[section] || section;
    c.appendChild(lbl);
    const grid = document.createElement('div');
    grid.className = 'avatar-grid';
    (avatars||[]).forEach(av => {
      const owned = isAvatarOwned(av);
      const active = gameState.activeAvatar === av.id;
      const div = document.createElement('div');
      div.className = 'avatar-option' + (active ? ' selected' : '') + (!owned ? ' locked' : '');
      div.onclick = owned ? () => selectAvatar(av.id) : null;
      const kothCount = av.kothCounter ? (gameState.kothTop3Count || 0) : 0;
      div.innerHTML = `
        <div class="avatar-frame ${av.whaleBorder ? 'whale-frame' : ''}"
          style="border-color:${av.border};background:${av.bg};width:52px;height:52px;font-size:26px;border:2px solid ${av.border};position:relative;">
          ${av.icon}
          ${!owned ? '<div class="avatar-lock">🔒</div>' : ''}
          ${av.kothCounter && owned ? `<div class="avatar-koth-count">×${kothCount}</div>` : ''}
        </div>
        <div class="avatar-name">${av.name}</div>
        ${!owned ? `<div class="avatar-unlock-hint">${av.unlockDesc || ''}</div>` : ''}
      `;
      grid.appendChild(div);
    });
    c.appendChild(grid);
  });
}

function selectAvatar(id) {
  gameState.activeAvatar = id;
  saveState();
  updateProfileAvatar();
  renderAvatarPicker();
  showToast('✅ Avatar updated!', 'var(--green)');
}

// updateProfileAvatar — see full version below

function getAvatarForPlayer(name) {
  // For bots — pick avatar based on name hash
  const botAvatars = ['🦊','👾','🤖','🐺','🦁','🐯','🦅','🐉','👻','💀','🔥','⚡','🌪️','🎯','💥'];
  const idx = name.split('').reduce((a,c) => a + c.charCodeAt(0), 0) % botAvatars.length;
  return { icon: botAvatars[idx], border: '#333350', bg: '#0a0a15', whaleBorder: false };
}

// ===== FRIENDS SYSTEM =====
function generateFriendCode() {
  if (gameState.friendCode) return gameState.friendCode;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  gameState.friendCode = code;
  saveState();
  return code;
}

function initFriendsScreen() {
  const code = generateFriendCode();
  document.getElementById('myFriendCode').textContent = code;
  const friends = gameState.friends || [];
  document.getElementById('friendCount').textContent = friends.length;
  const list = document.getElementById('friendsList');
  list.innerHTML = '';
  if (friends.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;letter-spacing:1px;padding:20px;">No friends yet — share your code!</div>';
  } else {
    (friends||[]).forEach(f => {
      list.innerHTML += `<div class="lb-entry"><div class="lb-entry-avatar">${f.avatar||'🎮'}</div><div class="lb-entry-name">${f.name}</div><div class="lb-entry-val">💎 ${(f.diamonds||0).toLocaleString()}</div></div>`;
    });
  }
}

function copyFriendCode() {
  const code = generateFriendCode();
  const text = `Join me in Tile Royale! Use my code: ${code} and we both get 💎 500!`;
  copyToClipboard(text);
}

function submitFriendCode() {
  const input = document.getElementById('friendCodeInput');
  const code = (input.value || '').trim().toUpperCase();
  const msg = document.getElementById('friendCodeMsg');
  if (!code || code.length < 6) { msg.textContent = 'Enter a 6-character code'; msg.className='redeem-msg error'; return; }
  if (code === generateFriendCode()) { msg.textContent = "That's your own code!"; msg.className='redeem-msg error'; return; }
  if (!gameState.usedFriendCodes) gameState.usedFriendCodes = [];
  if (gameState.usedFriendCodes.includes(code)) { msg.textContent = 'Already redeemed!'; msg.className='redeem-msg info'; return; }
  gameState.usedFriendCodes.push(code);
  gameState.friendsReferred = (gameState.friendsReferred || 0) + 1;
  if (gameState.friendsReferred <= 100) {
    gameState.diamonds = (gameState.diamonds || 0) + 100;
    showToast('💎 +100 diamonds! Friend referred (' + gameState.friendsReferred + '/100)', 'var(--gold)');
  } else {
    showToast('Referral limit reached (100/100)', 'var(--muted)');
  }
  if (!gameState.friends) gameState.friends = [];
  const botNames = ['TapKing','BlazeMaster','GridRipper','SwiftTile'];
  gameState.friends.push({ name: botNames[Math.floor(Math.random()*botNames.length)], avatar:'🎮', diamonds: Math.floor(Math.random()*5000) });
  saveState(); updateMenuStats();
  input.value = '';
  msg.textContent = '✅ Friend added! You both got 💎 500!';
  msg.className = 'redeem-msg success';
  initFriendsScreen();
  playSound('achieve');
}

// ===== SHARE PROFILE =====
function shareProfile() {
  const name   = gameState.playerName || 'Player';
  const wins   = gameState.wins || 0;
  const level  = gameState.level || 1;
  const cur    = gameState.kothCurrentTitle;
  const titles = gameState.kothTitles || {};

  let text = '';
  if (cur === 'gold') {
    const n = titles.gold || 1;
    text = `👑 ${name} has defended the Tile Royale KOTH throne ${n} time${n !== 1 ? 's' : ''}!\nThink you can take it? 🔥\n#TileRoyale`;
  } else if (cur === 'silver') {
    text = `🥈 ${name} is Tile Royale KOTH Elite — top 3 weeks in a row!\nCan you beat me? 😤\n#TileRoyale`;
  } else if (cur === 'bronze') {
    text = `🥉 ${name} is climbing the Tile Royale leaderboard!\nLevel ${level} · ${wins} wins 💎\n#TileRoyale`;
  } else {
    text = `🎮 ${name} is playing Tile Royale — ${wins} wins, level ${level}!\nLast tap loses 🔥\n#TileRoyale`;
  }

  if (navigator.share) {
    navigator.share({ title: 'Tile Royale', text }).catch(() => copyToClipboard(text));
  } else {
    copyToClipboard(text);
    showToast('📋 Profile share text copied!', 'var(--green)');
  }
}

