// ===== PLAYER INBOX / NOTIFICATION CENTER =====
// Personal mailbox: friend accepts, rewards, admin messages, season rewards.
// Read state is server-side. Never blocks startup.

let _inboxNotifications = [];
let _inboxStartupShown  = false;

// ─── Network ─────────────────────────────────────────────────────────────────

async function _inboxFetch(path, opts) {
  try {
    const r = await fetch(`${getActiveServer().http}${path}`, {
      signal: AbortSignal.timeout(6000),
      ...opts,
    });
    return r.ok ? r.json() : null;
  } catch(e) { return null; }
}

// open/close are forwarded to the notification center (defined in notificationCenter.js)
function openInbox()  { openNotificationCenter('inbox'); }
function closeInbox() { closeNotificationCenter(); }

// ─── Load & Render ─────────────────────────────────────────────────────────────

async function loadInbox() {
  const feed = document.getElementById('inboxFeed');
  if (feed) feed.innerHTML = '<div class="inbox-loading">⏳ Loading...</div>';

  if (!PLAYER_ID) {
    if (feed) feed.innerHTML = `
      <div class="inbox-empty">
        <div style="font-size:36px;margin-bottom:10px;">📬</div>
        <div>Sign in to view your inbox.</div>
      </div>`;
    return;
  }

  const data = await _inboxFetch(`/notifications/${PLAYER_ID}`);
  _inboxNotifications = data?.notifications || [];
  _inboxRenderFeed(_inboxNotifications);
  _inboxBadgeUpdate(_inboxNotifications);
}

function _inboxRelTime(ts) {
  const now  = new Date();
  const d    = new Date(ts);
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayD = new Date(d.getFullYear(),   d.getMonth(),   d.getDate()).getTime();
  const diff = Math.round((day0 - dayD) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff  < 7)  return `${diff} days ago`;
  return d.toLocaleString('default', { month: 'short', day: 'numeric' });
}

const _INBOX_TYPE_META = {
  friend:  { icon: '🤝' },
  reward:  { icon: '🎁' },
  season:  { icon: '🏆' },
  message: { icon: '📢' },
  admin:   { icon: '📢' },
};

const _REWARD_LABEL = {
  diamonds: { icon: '💎', label: 'Diamonds' },
  tickets:  { icon: '🎟️', label: 'Tickets'  },
  spins:    { icon: '🎡', label: 'Free Spins' },
};

function _inboxRenderFeed(notifications) {
  const feed = document.getElementById('inboxFeed');
  if (!feed) return;

  if (!notifications || notifications.length === 0) {
    feed.innerHTML = `
      <div class="inbox-empty">
        <div style="font-size:36px;margin-bottom:10px;">📬</div>
        <div>Your inbox is empty.</div>
        <div style="font-size:11px;margin-top:6px;color:var(--muted);">Rewards and messages will appear here.</div>
      </div>`;
    return;
  }

  feed.innerHTML = notifications.map(n => {
    const meta     = _INBOX_TYPE_META[n.type] || _INBOX_TYPE_META.message;
    const isUnread = !n.read_at;
    const rewardMeta = n.reward_type ? (_REWARD_LABEL[n.reward_type] || { icon: '🎁', label: n.reward_type }) : null;
    const canClaim = rewardMeta && !n.claimed_at;
    const wasClaimed = rewardMeta && n.claimed_at;

    return `
      <div class="inbox-card${isUnread ? ' inbox-card--unread' : ''}" id="inbox-card-${n.id}"
           onclick="markNotificationRead(${n.id})">
        <div class="inbox-card-header">
          <span class="inbox-type-icon">${meta.icon}</span>
          <div class="inbox-card-titles">
            <div class="inbox-card-title">${n.title}</div>
            <div class="inbox-card-time">${_inboxRelTime(n.created_at)}</div>
          </div>
          ${isUnread ? '<div class="inbox-unread-dot"></div>' : ''}
        </div>
        <div class="inbox-card-body">${(n.body || '').replace(/\n/g, '<br>')}</div>
        ${canClaim ? `
          <div class="inbox-reward-row">
            <span class="inbox-reward-label">${rewardMeta.icon} ${n.reward_amount} ${rewardMeta.label}</span>
            <button class="inbox-claim-btn" onclick="event.stopPropagation(); claimNotificationReward(${n.id})">CLAIM</button>
          </div>` : ''}
        ${wasClaimed ? `<div class="inbox-claimed-row">✅ Claimed</div>` : ''}
      </div>`;
  }).join('');
}

// ─── Mark Read ─────────────────────────────────────────────────────────────────

async function markNotificationRead(notificationId) {
  const n = _inboxNotifications.find(x => Number(x.id) === Number(notificationId));
  if (!n || n.read_at) return;

  n.read_at = new Date().toISOString();
  const card = document.getElementById(`inbox-card-${notificationId}`);
  if (card) {
    card.classList.remove('inbox-card--unread');
    const dot = card.querySelector('.inbox-unread-dot');
    if (dot) dot.remove();
  }
  _inboxBadgeUpdate(_inboxNotifications);

  if (!PLAYER_ID) return;
  _inboxFetch('/notifications/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notificationId, playerId: PLAYER_ID }),
  });
}

// ─── Claim Reward ──────────────────────────────────────────────────────────────

async function claimNotificationReward(notificationId) {
  const n = _inboxNotifications.find(x => Number(x.id) === Number(notificationId));
  if (!n || n.claimed_at || !n.reward_type || !PLAYER_ID) return;

  const data = await _inboxFetch('/notifications/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notificationId, playerId: PLAYER_ID }),
  });

  if (!data?.success) {
    try { showToast('Could not claim reward — try again', 'var(--red)'); } catch(e) {}
    return;
  }

  const { reward_type, reward_amount } = data;
  if (reward_type === 'diamonds') {
    gameState.diamonds = (gameState.diamonds || 0) + reward_amount;
  } else if (reward_type === 'tickets') {
    gameState.tickets = Math.min((gameState.tickets || 0) + reward_amount, 10);
  } else if (reward_type === 'spins') {
    gameState.freeSpins = (gameState.freeSpins || 0) + reward_amount;
  }
  try { saveState(); }    catch(e) {}
  try { updateMenuStats(); } catch(e) {}

  n.claimed_at = new Date().toISOString();
  n.read_at    = n.read_at || new Date().toISOString();

  const card = document.getElementById(`inbox-card-${notificationId}`);
  if (card) {
    const rewardRow = card.querySelector('.inbox-reward-row');
    if (rewardRow) rewardRow.outerHTML = '<div class="inbox-claimed-row">✅ Claimed</div>';
    card.classList.remove('inbox-card--unread');
    const dot = card.querySelector('.inbox-unread-dot');
    if (dot) dot.remove();
  }

  const rm = _REWARD_LABEL[reward_type] || { icon: '🎁', label: reward_type };
  try { showToast(`${rm.icon} +${reward_amount} ${rm.label} claimed!`, 'var(--green)'); } catch(e) {}
  try { playSound('achieve'); } catch(e) {}
  _inboxBadgeUpdate(_inboxNotifications);
}

// ─── Badge ─────────────────────────────────────────────────────────────────────

function _inboxBadgeUpdate(notifications) {
  const unread = (notifications || []).filter(n => !n.read_at).length;
  const badge = document.getElementById('inboxBadge');
  if (!badge) return;
  if (unread > 0) {
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// Startup check is now handled by notificationCenter.js checkNotificationStartup().
