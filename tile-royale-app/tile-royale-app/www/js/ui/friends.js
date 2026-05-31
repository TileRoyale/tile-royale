// ===== FRIENDS SYSTEM — real backend implementation =====
// Loaded after profile.js; these global functions override the fake stubs.

function _frFetch(path, opts) {
  try {
    return fetch(`${getActiveServer().http}${path}`, {
      signal: AbortSignal.timeout(8000),
      ...opts,
    }).then(r => r.ok ? r.json() : null).catch(() => null);
  } catch(e) { return Promise.resolve(null); }
}

// ─── Your tag display ─────────────────────────────────────────────────────────

function copyFriendCode() {
  const tag  = _myTag || gameState?.player_tag;
  const name = gameState?.playerName || 'me';
  const text = tag
    ? `Add me in Tile Royale! Search for: ${name} #${tag} 🎮`
    : `Add me in Tile Royale! My name: ${name} 🎮`;
  copyToClipboard(text);
  try { showToast('📋 Tag copied — share with friends!', 'var(--green)'); } catch(e) {}
}

// ─── Init friends screen ──────────────────────────────────────────────────────

async function initFriendsScreen() {
  const tagEl = document.getElementById('myFriendCode');
  if (tagEl) tagEl.textContent = '...';

  if (!PLAYER_ID) { _frRenderList([]); return; }

  // Fetch player tag + friends list in parallel
  const [statsData, friendsData] = await Promise.all([
    _frFetch(`/playerstats/${PLAYER_ID}`),
    _frFetch(`/friends/${PLAYER_ID}`),
  ]);

  // Show own tag — update the global _myTag cache too
  if (statsData?.found && statsData.player_tag) {
    try { _myTag = statsData.player_tag; } catch(e) {}
  }
  const tag = (statsData?.player_tag) || _myTag;
  if (tagEl) tagEl.textContent = tag ? `#${tag}` : '—';

  const friends = friendsData?.friends || [];
  _frRenderList(friends);
  _updateProfileFriendCount(friends.length);
  await _frRefreshRequestsBadge();
}

// ─── Friends list render ──────────────────────────────────────────────────────

function _frRenderList(friends) {
  const count = document.getElementById('friendCount');
  const list  = document.getElementById('friendsList');
  if (count) count.textContent = friends.length;
  if (!list)  return;

  if (!friends.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;letter-spacing:1px;padding:20px;">No friends yet — enter their #tag above!</div>';
    return;
  }

  list.innerHTML = friends.map(f => {
    const online = f.is_online;
    const tag    = f.player_tag ? `<div class="lb-entry-tag">#${f.player_tag}</div>` : '';
    return `<div class="lb-entry pp-clickable" onclick="openPublicProfile('${f.player_id}')">` +
      `<div class="lb-entry-avatar">${f.avatar || '🎮'}</div>` +
      `<div class="lb-entry-name">` +
        `<div class="lb-entry-name-line">${f.player_name || 'Player'}</div>` +
        tag +
      `</div>` +
      `<div class="lb-entry-win-info">` +
        `<div style="font-size:12px;">${online ? '🟢' : '⚫'}</div>` +
        `<div class="lb-entry-winrate">${f.wins || 0}W</div>` +
      `</div>` +
    `</div>`;
  }).join('');
}

function _updateProfileFriendCount(n) {
  const el = document.getElementById('profileFriendsCount');
  if (el) el.textContent = n;
}

// ─── Add friend ───────────────────────────────────────────────────────────────

async function submitFriendCode() {
  const input = document.getElementById('friendCodeInput');
  const raw   = (input?.value || '').trim().replace('#', '');
  const msg   = document.getElementById('friendCodeMsg');

  if (!raw || !/^\d{4}$/.test(raw)) {
    if (msg) { msg.textContent = 'Enter a 4-digit player tag (e.g. 1234 or #1234)'; msg.className = 'redeem-msg error'; }
    return;
  }
  if (!PLAYER_ID) {
    if (msg) { msg.textContent = 'Log in to add friends'; msg.className = 'redeem-msg error'; }
    return;
  }

  if (msg) { msg.textContent = 'Sending request...'; msg.className = 'redeem-msg info'; }

  const data = await _frFetch('/friends/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requesterId: PLAYER_ID, targetTag: raw }),
  });

  if (input) input.value = '';

  if (!data) {
    if (msg) { msg.textContent = 'Server unavailable — try again'; msg.className = 'redeem-msg error'; }
    return;
  }

  const MSGS = {
    sent:           () => `✅ Request sent to ${data.targetName || ''}${data.targetTag ? ' #'+data.targetTag : ''}!`,
    already_sent:   () => '⏳ Request already pending.',
    already_friends:() => '✅ Already friends!',
    self:           () => "That's your own tag!",
    not_found:      () => '❌ No player found with that tag.',
    invalid_tag:    () => '❌ Invalid tag — must be 4 digits.',
  };
  if (msg) {
    const fn = MSGS[data.status];
    msg.textContent = fn ? fn() : (data.ok ? '✅ Request sent!' : '❌ Error — try again');
    msg.className = `redeem-msg ${data.ok ? 'success' : 'error'}`;
  }
  if (data.ok) { try { playSound('achieve'); } catch(e) {} }
}

// ─── Incoming requests ────────────────────────────────────────────────────────

let _frRequests = [];

async function _frRefreshRequestsBadge() {
  if (!PLAYER_ID) return;
  const data  = await _frFetch(`/friends/requests/${PLAYER_ID}`);
  _frRequests = data?.requests || [];
  const badge = document.getElementById('friendRequestsBadge');
  if (badge) badge.style.display = _frRequests.length > 0 ? 'flex' : 'none';
  _frRenderRequests();
}

function openFriendRequests() {
  const panel = document.getElementById('friendRequestsPanel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) _frRefreshRequestsBadge();
}

function _frRenderRequests() {
  const list = document.getElementById('friendRequestsList');
  if (!list) return;

  if (!_frRequests.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:11px;padding:12px;letter-spacing:1px;">No pending requests</div>';
    return;
  }

  list.innerHTML = _frRequests.map(r =>
    `<div class="lb-entry" style="gap:8px;margin-bottom:6px;">` +
      `<div class="lb-entry-avatar">${r.avatar || '🎮'}</div>` +
      `<div class="lb-entry-name">` +
        `<div class="lb-entry-name-line">${r.player_name}</div>` +
        (r.player_tag ? `<div class="lb-entry-tag">#${r.player_tag}</div>` : '') +
      `</div>` +
      `<div style="display:flex;gap:5px;flex-shrink:0;">` +
        `<button onclick="frRespond('${r.player_id}','accept')" ` +
          `style="background:rgba(0,255,136,0.15);border:1px solid rgba(0,255,136,0.4);border-radius:6px;padding:5px 10px;color:var(--green);font-size:12px;cursor:pointer;">✓</button>` +
        `<button onclick="frRespond('${r.player_id}','decline')" ` +
          `style="background:rgba(255,51,85,0.10);border:1px solid rgba(255,51,85,0.35);border-radius:6px;padding:5px 10px;color:var(--red);font-size:12px;cursor:pointer;">✕</button>` +
      `</div>` +
    `</div>`
  ).join('');
}

async function frRespond(requesterId, action) {
  if (!PLAYER_ID) return;
  const data = await _frFetch('/friends/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId: PLAYER_ID, requesterId, action }),
  });
  if (!data?.ok) { try { showToast('Failed — try again', 'var(--red)'); } catch(e) {} return; }

  _frRequests = _frRequests.filter(r => r.player_id !== requesterId);
  _frRenderRequests();
  const badge = document.getElementById('friendRequestsBadge');
  if (badge) badge.style.display = _frRequests.length > 0 ? 'flex' : 'none';

  if (action === 'accept') {
    try { showToast('✅ Friend added!', 'var(--green)'); } catch(e) {}
    try { playSound('achieve'); } catch(e) {}
    // Refresh friends list
    const fData = await _frFetch(`/friends/${PLAYER_ID}`);
    _frRenderList(fData?.friends || []);
    _updateProfileFriendCount((fData?.friends || []).length);
  } else {
    try { showToast('Request declined.', 'var(--muted)'); } catch(e) {}
  }
}

// ─── Friends leaderboard (used by menus.js) ───────────────────────────────────

async function loadFriendsLeaderboard(period) {
  if (!PLAYER_ID) return [];
  const data = await _frFetch(`/friends/${PLAYER_ID}/leaderboard?period=${period || 'alltime'}`);
  return data?.rankings || [];
}

// ─── Custom lobby: copy code for friend ──────────────────────────────────────

function inviteFriendToLobby() {
  const code = document.getElementById('clLobbyCode')?.textContent?.trim();
  if (!code) { try { showToast('Create a lobby first', 'var(--muted)'); } catch(e) {} return; }
  copyToClipboard(code);
  try { showToast(`📋 Lobby code copied — send it to your friend!`, 'var(--green)'); } catch(e) {}
}
