// ===== SETTINGS SYSTEM =====
// DEFAULT_SETTINGS moved to top
settings = { ...DEFAULT_SETTINGS }; // updates placeholder from top
let wakeLock = null;

function loadSettings() {
  try {
    const saved = localStorage.getItem('tileRoyaleSettings');
    if (saved) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch(e) {}
}

function saveSettings() {
  try {
    localStorage.setItem('tileRoyaleSettings', JSON.stringify(settings));
  } catch(e) {}
  applySettings();
}

function applySettings() {
  // Animation speed
  const root = document.documentElement;
  if (settings.animSpeed === 'fast') {
    root.style.setProperty('--anim-speed', '0.5');
  } else if (settings.animSpeed === 'off') {
    root.style.setProperty('--anim-speed', '0');
  } else {
    root.style.setProperty('--anim-speed', '1');
  }

  // Colorblind mode
  if (settings.colorblind) {
    document.body.classList.add('colorblind');
  } else {
    document.body.classList.remove('colorblind');
  }

  // Screen wake lock
  if (settings.wakelock && 'wakeLock' in navigator) {
    navigator.wakeLock.request('screen').then(lock => { wakeLock = lock; }).catch(() => {});
  } else if (wakeLock) {
    wakeLock.release(); wakeLock = null;
  }
}

