// ===== NEWS & ANNOUNCEMENTS =====
// Fetches posts from /news and /news/latest.
// 5-minute client-side cache. Never blocks startup.
// Unread state stored in localStorage as tr_news_last_seen_id.

const _NEWS_TTL      = 5 * 60 * 1000;
const _NEWS_SEEN_KEY = 'tr_news_last_seen_id';

let _newsPostsCache  = null;
let _newsCacheTs     = 0;
let _newsStartupId   = null; // id shown in the startup popup

// ─── Network ─────────────────────────────────────────────────────────────────

async function _newsFetch(path) {
  try {
    const r = await fetch(`${getActiveServer().http}${path}`, {
      signal: AbortSignal.timeout(6000),
    });
    return r.ok ? r.json() : null;
  } catch(e) { return null; }
}

async function _newsGetPosts(force) {
  if (!force && _newsPostsCache && Date.now() - _newsCacheTs < _NEWS_TTL) {
    return _newsPostsCache;
  }
  const data = await _newsFetch('/news');
  if (data?.posts) {
    _newsPostsCache = data.posts;
    _newsCacheTs    = Date.now();
  }
  return _newsPostsCache || [];
}

// ─── Read state ──────────────────────────────────────────────────────────────

function _newsLastSeen() {
  return parseInt(localStorage.getItem(_NEWS_SEEN_KEY) || '0', 10);
}

function _newsMarkSeen(id) {
  localStorage.setItem(_NEWS_SEEN_KEY, String(id));
  _newsBadgeSet(false);
}

// ─── Badge ───────────────────────────────────────────────────────────────────

function _newsBadgeSet(visible) {
  const el = document.getElementById('newsBadge');
  if (!el) return;
  el.style.display = visible ? 'flex' : 'none';
  if (visible) el.classList.add('news-badge--pulse');
  else         el.classList.remove('news-badge--pulse');
}

// open/close are forwarded to the notification center (defined in notificationCenter.js)
function openNews()  { openNotificationCenter('news');  }
function closeNews() { closeNotificationCenter(); }

// ─── Feed rendering ───────────────────────────────────────────────────────────

const _NEWS_TYPE_META = {
  news:        { label: 'NEWS',        cls: 'news' },
  event:       { label: 'EVENT',       cls: 'event' },
  update:      { label: 'UPDATE',      cls: 'update' },
  maintenance: { label: 'MAINTENANCE', cls: 'maintenance' },
};

function _newsRelTime(ts) {
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

const _newsExpanded  = new Set();
const _newsBodies    = {};  // id → full body text; avoids embedding arbitrary strings in onclick attrs

function _newsToggleExpand(id) {
  const fullBody = _newsBodies[id] || '';
  const bodyEl   = document.getElementById(`nb-${id}`);
  const btnEl    = document.getElementById(`nxb-${id}`);
  if (!bodyEl || !btnEl) return;
  if (_newsExpanded.has(id)) {
    _newsExpanded.delete(id);
    bodyEl.innerHTML  = _newsPreview(fullBody);
    btnEl.textContent = '▼ Read More';
  } else {
    _newsExpanded.add(id);
    bodyEl.innerHTML  = fullBody.replace(/\n/g, '<br>');
    btnEl.textContent = '▲ Show Less';
  }
}

function _newsPreview(body) {
  return body.slice(0, 220).trimEnd().replace(/\n/g, '<br>') + '…';
}

function _newsRenderFeed(posts) {
  const feed = document.getElementById('newsFeed');
  if (!feed) return;

  if (!posts || posts.length === 0) {
    feed.innerHTML = `
      <div class="news-empty">
        <div style="font-size:36px;margin-bottom:10px;">📰</div>
        <div>No announcements yet.</div>
        <div style="font-size:11px;margin-top:6px;color:var(--muted);">Check back soon!</div>
      </div>`;
    return;
  }

  const _esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const _escLines = s => _esc(s).replace(/\n/g,'<br>');

  feed.innerHTML = posts.map(p => {
    const nid      = Number(p.id);
    _newsBodies[nid] = p.body || '';     // store body safely outside HTML attrs
    const meta     = _NEWS_TYPE_META[p.type] || { label: 'NEWS', cls: 'news' };
    const isLong   = (p.body || '').length > 220;
    const bodyHtml = _newsExpanded.has(nid)
      ? _escLines(p.body)
      : (isLong ? _newsPreview(_esc(p.body)) : _escLines(p.body));

    return `
      <div class="news-card${p.pinned ? ' news-card--pinned' : ''}">
        <div class="news-card-meta">
          ${p.pinned ? '<span class="news-pin">📌</span>' : ''}
          <span class="news-type-badge news-type-badge--${meta.cls}">${meta.label}</span>
          <span class="news-time">${_newsRelTime(p.created_at)}</span>
        </div>
        <div class="news-card-title">${_esc(p.title)}</div>
        <div class="news-card-body" id="nb-${nid}">${bodyHtml}</div>
        ${isLong
          ? `<button class="news-expand-btn" id="nxb-${nid}"
               onclick="_newsToggleExpand(${nid})">▼ Read More</button>`
          : ''}
      </div>`;
  }).join('');
}

// ─── Startup popup ────────────────────────────────────────────────────────────

async function _newsCheckStartup() {
  try {
    const data = await _newsFetch('/news/latest');
    if (!data?.post) return;

    const post     = data.post;
    const latestId = Number(post.id);
    const lastSeen = _newsLastSeen();

    if (latestId > lastSeen) _newsBadgeSet(true);
    if (latestId <= lastSeen) return;

    _newsStartupId = latestId;

    const overlay   = document.getElementById('newsAnnounceOverlay');
    if (!overlay) return;

    const meta    = _NEWS_TYPE_META[post.type] || { label: 'NEWS', cls: 'news' };
    const preview = (post.body || '').slice(0, 130).trimEnd();

    const typeEl    = document.getElementById('newsAnnounceType');
    const titleEl   = document.getElementById('newsAnnounceTitle');
    const prevEl    = document.getElementById('newsAnnouncePreview');

    if (typeEl) {
      typeEl.textContent = meta.label;
      typeEl.className   = `news-type-badge news-type-badge--${meta.cls}`;
    }
    if (titleEl)   titleEl.textContent = post.title;
    if (prevEl)    prevEl.textContent  = preview + ((post.body || '').length > 130 ? '…' : '');

    overlay.style.display = 'flex';
  } catch(e) {}
}

// Startup check is now handled by notificationCenter.js checkNotificationStartup().
