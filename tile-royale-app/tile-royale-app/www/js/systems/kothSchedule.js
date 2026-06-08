// ===== KOTH SCHEDULE — Early Access Time Windows =====
// KOTH is open 18:00–19:00 Europe/Berlin (DST-aware)
// and 18:00–19:00 America/Guatemala (UTC-6, no DST)

const KOTH_WINDOW_DURATION_MS = 60 * 60 * 1000; // 1 hour

// Returns the local hour (0-23) in a given IANA timezone for a Date.
function _kothHourIn(tz, date) {
  return parseInt(
    new Intl.DateTimeFormat('en', { timeZone: tz, hour: 'numeric', hour12: false }).format(date),
    10
  );
}

// Returns the local minute (0-59) in a given IANA timezone for a Date.
function _kothMinuteIn(tz, date) {
  return parseInt(
    new Intl.DateTimeFormat('en', { timeZone: tz, minute: 'numeric' }).format(date),
    10
  );
}

// True if the current moment falls inside an open window.
function isKothOpen() {
  const now = new Date();
  const tzs = ['Europe/Berlin', 'America/Guatemala'];
  for (const tz of tzs) {
    const h = _kothHourIn(tz, now);
    if (h === 18) return true; // 18:00:00 – 18:59:59
  }
  return false;
}

// Returns ms until the next window opens (0 if currently open).
function getNextKothOpenMs() {
  if (isKothOpen()) return 0;

  const now = new Date();
  const tzs = ['Europe/Berlin', 'America/Guatemala'];
  let nearest = Infinity;

  for (const tz of tzs) {
    const h = _kothHourIn(tz, now);
    const m = _kothMinuteIn(tz, now);

    // Minutes remaining until next 18:00 in this timezone
    let hoursUntil = (18 - h + 24) % 24;
    // If we're past 18:00 this hour cycle but before next day
    if (h === 18) hoursUntil = 0; // currently open — handled above
    if (h > 18) hoursUntil = 24 - h + 18;

    const msUntil = hoursUntil * 3600000 - m * 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
    const adjusted = msUntil <= 0 ? msUntil + 24 * 3600000 : msUntil;
    if (adjusted < nearest) nearest = adjusted;
  }
  return nearest;
}

function _kothFormatCountdown(ms) {
  if (ms <= 0) return 'now';
  const totalSecs = Math.ceil(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Card UI ──────────────────────────────────────────────────────────────────

function updateKothScheduleUI() {
  const card    = document.getElementById('kothModeCard');
  const icon    = document.getElementById('kothModeIcon');
  const name    = document.getElementById('kothModeName');
  const subtext = document.getElementById('kothModeSubtext');
  if (!card) return;

  if (isKothOpen()) {
    // Open state — full gold KOTH card
    card.classList.remove('koth-locked');
    card.style.opacity = '';
    if (icon)    { icon.textContent = '👑'; icon.style.filter = ''; }
    if (name)    { name.textContent = 'King of the Hill'; name.style.color = 'var(--gold)'; }
    if (subtext) { subtext.textContent = '💎 20 entry · OPEN NOW'; subtext.style.color = 'var(--gold)'; }
  } else {
    // Closed state — locked, show entry fee + timer
    card.classList.add('koth-locked');
    card.style.opacity = '0.6';
    if (icon)    { icon.textContent = '🔒'; icon.style.filter = 'grayscale(1)'; }
    if (name)    { name.textContent = 'King of the Hill'; name.style.color = 'var(--muted)'; }
    if (subtext) {
      const ms = getNextKothOpenMs();
      subtext.textContent = `💎 20 entry · Opens in ${_kothFormatCountdown(ms)}`;
      subtext.style.color = 'var(--muted)';
    }
  }
}

// ── Schedule popup ────────────────────────────────────────────────────────────

function showKothSchedulePopup() {
  const overlay = document.getElementById('kothScheduleOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  const nextLine = document.getElementById('kothScheduleNextLine');
  if (nextLine) {
    if (isKothOpen()) {
      nextLine.textContent = '🟢 KOTH is OPEN right now — join now!';
      nextLine.style.color = 'var(--green)';
    } else {
      const ms = getNextKothOpenMs();
      nextLine.textContent = `Next window opens in ${_kothFormatCountdown(ms)}`;
      nextLine.style.color = 'var(--muted)';
    }
  }
}

function closeKothSchedulePopup() {
  const overlay = document.getElementById('kothScheduleOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ── Card click handler ────────────────────────────────────────────────────────

function onKothCardClick() {
  if (!isKothOpen()) {
    showKothSchedulePopup();
    return;
  }
  // Open — proceed to KOTH screen as normal
  if (typeof selectMode === 'function') selectMode('koth', document.getElementById('kothModeCard'));
}

// ── Tick loop ─────────────────────────────────────────────────────────────────

let _kothScheduleTick = null;

function _kothScheduleStart() {
  updateKothScheduleUI();
  if (_kothScheduleTick) clearInterval(_kothScheduleTick);
  _kothScheduleTick = setInterval(() => {
    updateKothScheduleUI();
  }, 1000);
}

// Start on load, restart when menu becomes visible.
window.addEventListener('load', () => setTimeout(_kothScheduleStart, 500));

// Hook into screen transitions so timer refreshes when main menu reappears.
const _origShowScreen = window.showScreen;
if (typeof _origShowScreen === 'function') {
  window.showScreen = function(id) {
    _origShowScreen.call(this, id);
    if (id === 'menuScreen') updateKothScheduleUI();
  };
} else {
  // showScreen not yet defined — patch after scripts load
  window.addEventListener('load', () => {
    if (typeof showScreen === 'function') {
      const _orig = showScreen;
      window.showScreen = function(id) {
        _orig.call(this, id);
        if (id === 'menuScreen') updateKothScheduleUI();
      };
    }
  });
}
