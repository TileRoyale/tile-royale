// ===== NOTIFICATION CENTER =====
// Single 🔔 overlay with NEWS and INBOX tabs.
// Single source of truth for the bell badge count.
// Orchestrates _newsRenderFeed() and _inboxRenderFeed() from news.js / inbox.js.

let _notifCurrentTab    = 'news';
let _notifStartupShown  = false;

// ─── Open / Close ─────────────────────────────────────────────────────────────

async function openNotificationCenter(tab) {
  try { playSound('menu'); } catch(e) {}
  _notifCurrentTab = tab || 'news';
  _notifApplyTab(_notifCurrentTab);
  showScreen('notificationCenterOverlay');
  if (_notifCurrentTab === 'news') {
    await _notifLoadNewsTab();
  } else {
    await _notifLoadInboxTab();
  }
}

function closeNotificationCenter() {
  showScreen('menuScreen');
}

// ─── Tab switching ─────────────────────────────────────────────────────────────

function switchNotificationTab(tab) {
  if (_notifCurrentTab === tab) return;
  _notifCurrentTab = tab;
  _notifApplyTab(tab);
  if (tab === 'news') {
    _notifLoadNewsTab();
  } else {
    _notifLoadInboxTab();
  }
}

function _notifApplyTab(tab) {
  ['news', 'inbox'].forEach(t => {
    const btn     = document.getElementById(`notif-tab-${t}`);
    const content = document.getElementById(`notif-content-${t}`);
    const active  = t === tab;
    if (btn)     btn.className = `notif-tab${active ? ' notif-tab--active' : ''}`;
    if (content) content.style.display = active ? 'flex' : 'none';
  });
}

// ─── Tab loaders ──────────────────────────────────────────────────────────────

async function _notifLoadNewsTab() {
  const feed = document.getElementById('newsFeed');
  if (feed) feed.innerHTML = '<div class="news-loading">⏳ Loading...</div>';
  const posts = await _newsGetPosts();
  _newsRenderFeed(posts);
  if (posts.length > 0) {
    _newsMarkSeen(Math.max(...posts.map(p => Number(p.id))));
  }
  updateNotificationCenterBadge();
}

async function _notifLoadInboxTab() {
  await loadInbox();
  updateNotificationCenterBadge();
}

// ─── Badge ─────────────────────────────────────────────────────────────────────

function updateNotificationCenterBadge() {
  let count = 0;

  // Unread inbox (use already-fetched array from inbox.js)
  count += (_inboxNotifications || []).filter(n => !n.read_at).length;

  // Unread news (use cached posts from news.js)
  if (_newsPostsCache) {
    const lastSeen = _newsLastSeen();
    count += _newsPostsCache.filter(p => Number(p.id) > lastSeen).length;
  }

  const badge = document.getElementById('notificationCenterBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// ─── Startup popup ────────────────────────────────────────────────────────────

async function checkNotificationStartup() {
  if (_notifStartupShown) return;

  let unreadNews  = 0;
  let unreadInbox = 0;

  // ── News ──
  try {
    const data = await _newsFetch('/news/latest');
    if (data?.post) {
      const latestId = Number(data.post.id);
      const lastSeen = _newsLastSeen();
      if (latestId > lastSeen) {
        const posts = await _newsGetPosts();
        unreadNews = (posts || []).filter(p => Number(p.id) > lastSeen).length;
      }
    }
  } catch(e) {}

  // ── Inbox ──
  if (PLAYER_ID) {
    try {
      const data = await _inboxFetch(`/notifications/${PLAYER_ID}`);
      if (data?.notifications) {
        _inboxNotifications = data.notifications;
        unreadInbox = data.notifications.filter(n => !n.read_at).length;
      }
    } catch(e) {}
  }

  updateNotificationCenterBadge();

  const total = unreadNews + unreadInbox;
  if (total === 0) return;

  _notifStartupShown = true;

  const overlay = document.getElementById('notificationStartupOverlay');
  const bodyEl  = document.getElementById('notifStartupBody');
  if (!overlay) return;

  const lines = [];
  if (unreadNews  > 0) lines.push(`• ${unreadNews} unread news item${unreadNews  !== 1 ? 's' : ''}`);
  if (unreadInbox > 0) lines.push(`• ${unreadInbox} unread inbox message${unreadInbox !== 1 ? 's' : ''}`);
  if (bodyEl) bodyEl.innerHTML = lines.join('<br>');

  overlay.style.display = 'flex';
}

function closeNotificationStartup() {
  const overlay = document.getElementById('notificationStartupOverlay');
  if (overlay) overlay.style.display = 'none';
}

function openNotificationCenterFromStartup() {
  closeNotificationStartup();
  openNotificationCenter('news');
}

// ─── Boot ──────────────────────────────────────────────────────────────────────

setTimeout(checkNotificationStartup, 4000);
