// ===== VERSION GATE =====
function parseVersion(v) {
  return (v || '').replace(/^v/, '').split('.').map(Number);
}
function isVersionOutdated(client, minimum) {
  const c = parseVersion(client), m = parseVersion(minimum);
  for (let i = 0; i < 3; i++) {
    if ((c[i] || 0) < (m[i] || 0)) return true;
    if ((c[i] || 0) > (m[i] || 0)) return false;
  }
  return false;
}
async function checkClientVersion() {
  try {
    const res = await fetch('https://tile-royale-eu-production.up.railway.app/version', { cache: 'no-store' });
    const data = await res.json();
    const min = data.minClientVersion;
    if (min && isVersionOutdated(GAME_VERSION, min)) {
      const overlay = document.getElementById('updateRequiredOverlay');
      const info = document.getElementById('updateVersionInfo');
      if (info) info.textContent = `Your version: ${GAME_VERSION} · Required: ${min}`;
      if (overlay) overlay.style.display = 'flex';
    }
  } catch (e) {
    // Network unavailable — silently allow (don't block offline users)
  }
}

