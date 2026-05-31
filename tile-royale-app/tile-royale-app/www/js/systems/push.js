// Push token registration — sends FCM token to Railway server and tracks status

const _PUSH_REG_KEY = 'tr_push_reg';

function _pushGetUrl() {
  try { return window.getActiveServer?.().http ?? null; } catch(e) { return null; }
}

function _pushGetPlayerId() {
  return localStorage.getItem('tr_player_id');
}

function _pushGetSaved() {
  try { return JSON.parse(localStorage.getItem(_PUSH_REG_KEY) || 'null'); } catch(e) { return null; }
}

function _pushSetSaved(token, playerId) {
  localStorage.setItem(_PUSH_REG_KEY, JSON.stringify({ token, playerId }));
}

function _pushUpdateStatus(status) {
  const el = document.getElementById('pushRegStatus');
  if (!el) return;
  const labels = { registered: '🟢 Registered', registering: '🟡 Registering', not_registered: '🔴 Not Registered' };
  el.textContent = labels[status] || labels.not_registered;
}

async function _pushRegister(token, isRetry) {
  const playerId = _pushGetPlayerId();
  if (!playerId) { _pushUpdateStatus('not_registered'); return; }

  const saved = _pushGetSaved();
  if (saved && saved.token === token && saved.playerId === playerId) {
    _pushUpdateStatus('registered'); return;
  }

  _pushUpdateStatus('registering');
  const url = _pushGetUrl();
  if (!url) { _pushUpdateStatus('not_registered'); return; }

  try {
    const r = await fetch(`${url}/push/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, token, platform: 'android' }),
      signal: AbortSignal.timeout(8000),
    });
    const data = r.ok ? await r.json() : null;
    if (data?.success) {
      _pushSetSaved(token, playerId);
      _pushUpdateStatus('registered');
      return;
    }
  } catch(e) {}

  if (!isRetry) {
    setTimeout(() => _pushRegister(token, true), 5000);
  } else {
    _pushUpdateStatus('not_registered');
  }
}

// Called by native-bridge.js when FCM token arrives
window._onPushToken = function(token) {
  _pushRegister(token, false);
};

// On page load: register immediately if token already captured (e.g. app restart)
if (window.pushToken) {
  _pushRegister(window.pushToken, false);
} else {
  // Reflect cached registration state without a server round-trip
  const saved = _pushGetSaved();
  const pid   = _pushGetPlayerId();
  _pushUpdateStatus(saved && pid && saved.playerId === pid ? 'registered' : 'not_registered');
}
