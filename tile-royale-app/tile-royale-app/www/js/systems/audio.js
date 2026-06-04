// ===== AUDIO SYSTEM =====
// ---- AUDIO MANAGER ----

let audioCtx = null;
const _sfxPool = {};
let _musicEl = null;
let currentMusicTrack = null;
const _sfxCooldowns = {};
const _SFX_COOLDOWN = { tap: 80, ignite: 80, wrong: 150 };

const _SFX_DEF = {
  tap:       { file: 'audio/tap.wav',         vol: 0.85, pool: 6 },
  wrong:     { file: 'audio/wrong.wav',        vol: 0.80, pool: 3 },
  elim:      { file: 'audio/defeat.wav',       vol: 0.85, pool: 2 },
  victory:   { file: 'audio/victory.wav',      vol: 0.90, pool: 2 },
  lobby:     { file: 'audio/match_found.wav',  vol: 0.80, pool: 2 },
  countdown: { file: 'audio/countdown.wav',    vol: 0.90, pool: 1 },
  levelup:   { file: 'audio/reward.wav',       vol: 0.80, pool: 2 },
  achieve:   { file: 'audio/reward.wav',       vol: 0.70, pool: 2 },
  menu:      { file: 'audio/menu_click.wav',   vol: 0.65, pool: 3 },
  tick:      { file: 'audio/menu_click.wav',   vol: 0.50, pool: 3 },
  wheelspin:  { file: 'audio/wheel_spin.wav',         vol: 0.85, pool: 1 },
  void_bomb:  { file: 'audio/void-bomb-explosion.wav', vol: 1.00, pool: 3 },
};

const _MUSIC_SRC = {
  lobby:   'audio/menu_music.wav',
  game:    'audio/match_music.wav',
  intense: 'audio/match_music.wav',
};

function _buildSfxPools() {
  const seen = {};
  for (const def of Object.values(_SFX_DEF)) {
    if (seen[def.file]) continue;
    seen[def.file] = true;
    _sfxPool[def.file] = Array.from({ length: def.pool }, () => {
      const el = new Audio(def.file);
      el.preload = 'auto';
      return el;
    });
  }
}

function _poolGet(file) {
  const pool = _sfxPool[file];
  if (!pool) return null;
  return pool.find(el => el.paused && el.currentTime === 0)
      || pool.find(el => el.paused)
      || pool[0];
}

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function masterGain() {
  const ctx = getAudioCtx();
  const g = ctx.createGain();
  g.gain.value = (settings.volume || 80) / 100;
  g.connect(ctx.destination);
  return g;
}

// Unlock audio on first interaction (required by mobile browsers)
function _onFirstInteraction() {
  _buildSfxPools();
  try { getAudioCtx(); } catch(e) {}
}
document.addEventListener('touchstart', _onFirstInteraction, { once: true, passive: true });
document.addEventListener('click',      _onFirstInteraction, { once: true });

// Also build pools immediately for desktop/browser testing
_buildSfxPools();

// ---- SOUND EFFECTS ----
// gameOnlySounds: only block AMBIENT in-game sounds from playing outside active round.
// wrong/elim/victory MUST play at game-end events regardless of roundActive state.
const _gameOnlySounds = new Set(['ignite', 'tap', 'tick']);

function playSound(type) {
  if (!settings.sfx) return;
  if (_gameOnlySounds.has(type) && !roundActive) return;

  const minCD = _SFX_COOLDOWN[type] || 0;
  if (minCD) {
    const now = Date.now();
    if (_sfxCooldowns[type] && now - _sfxCooldowns[type] < minCD) return;
    _sfxCooldowns[type] = now;
  }

  try {
    if (type === 'ignite') { sfxIgnite(getAudioCtx(), masterGain()); return; }

    const def = _SFX_DEF[type];
    if (!def) { console.warn('[SFX] unknown type:', type); return; }

    if (!_sfxPool[def.file]) _buildSfxPools();
    const el = _poolGet(def.file);
    if (!el) { console.warn('[SFX] no pool element for:', def.file); return; }

    const vol = (settings.volume || 80) / 100;
    el.currentTime = 0;
    el.volume = Math.min(1, def.vol * vol);
    el.play().catch(err => console.warn('[SFX] play rejected:', type, err && err.message));
  } catch(e) { console.warn('[SFX] error playing', type, e); }
}

function sfxIgnite(ctx, out) {
  // Whoosh + crackle
  const t = ctx.currentTime;
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.5);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.frequency.linearRampToValueAtTime(200, t + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.6, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  src.connect(filter); filter.connect(g); g.connect(out);
  src.start(t); src.stop(t + 0.3);

  // Low tone
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(80, t);
  osc.frequency.linearRampToValueAtTime(40, t + 0.2);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.3, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  osc.connect(g2); g2.connect(out);
  osc.start(t); osc.stop(t + 0.25);
}


// ---- MUSIC — HTML5 Audio with crossfade ----
function startMusic(track) {
  if (!settings.music) return;
  const src = _MUSIC_SRC[track];
  if (!src) return;
  if (currentMusicTrack === track) return;

  const musicVol = (settings.volume || 80) / 100 * 0.45;
  const STEPS = 20, MS = 500;

  // Fade out and stop current track
  if (_musicEl) {
    const prev = _musicEl;
    const startVol = prev.volume;
    let step = 0;
    const id = setInterval(() => {
      step++;
      prev.volume = Math.max(0, startVol * (1 - step / STEPS));
      if (step >= STEPS) { clearInterval(id); try { prev.pause(); } catch(e) {} }
    }, MS / STEPS);
    _musicEl = null;
  }

  currentMusicTrack = track;
  const el = new Audio(src);
  el.loop = true;
  el.volume = 0;
  _musicEl = el;
  el.play().catch(() => {});

  // Fade in new track
  let step = 0;
  const id = setInterval(() => {
    step++;
    if (el !== _musicEl) { clearInterval(id); return; }
    el.volume = Math.min(musicVol, musicVol * step / STEPS);
    if (step >= STEPS) clearInterval(id);
  }, MS / STEPS);
}

function stopMusic() {
  currentMusicTrack = null;
  if (!_musicEl) return;
  const el = _musicEl;
  _musicEl = null;
  const startVol = el.volume;
  let step = 0;
  const id = setInterval(() => {
    step++;
    el.volume = Math.max(0, startVol * (1 - step / 15));
    if (step >= 15) { clearInterval(id); try { el.pause(); } catch(e) {} }
  }, 20);
}

function updateMusicIntensity() {
  if (!settings.music) return;
  if (!currentMusicTrack) startMusic('game');
}

function vibrate(ms = 30) {
  if (!settings.vibration) return;
  if (!roundActive) return; // no vibration outside game
  if ('vibrate' in navigator) navigator.vibrate(ms);
}

function openSettings() {
  loadSettings();
  renderSettings();
  showScreen('settingsScreen');
}

function renderSettings() {
  // Toggles
  const toggleIds = ['sfx','music','vibration','autojoin','wakelock','colorblind','dailyReminder','ticketAlert'];
  (toggleIds||[]).forEach(id => {
    const el = document.getElementById('toggle' + id.charAt(0).toUpperCase() + id.slice(1));
    if (el) el.classList.toggle('on', !!settings[id]);
  });

  // Volume slider
  const slVol = document.getElementById('sliderVolume');
  if (slVol) { slVol.value = settings.volume; document.getElementById('valVolume').textContent = settings.volume + '%'; }

  // Volume row visibility
  const rowVol = document.getElementById('rowVolume');
  if (rowVol) rowVol.style.opacity = (settings.sfx || settings.music) ? '1' : '0.4';

  // Animation speed
  ['Normal','Fast','Off'].forEach(s => {
    const btn = document.getElementById('selAnim' + s);
    if (btn) btn.classList.toggle('active', settings.animSpeed === s.toLowerCase());
  });

  // Region
  ['Auto','EU','NA','ASIA'].forEach(r => {
    const btn = document.getElementById('selRegion' + r);
    if (btn) btn.classList.toggle('active', (settings.region || 'AUTO') === r.toUpperCase());
  });
  updateRegionUI();
}

function toggleSetting(key) {
  settings[key] = !settings[key];
  saveSettings();
  renderSettings();
  vibrate(20);
}

function updateSlider(key, val) {
  settings[key] = parseInt(val);
  document.getElementById('val' + key.charAt(0).toUpperCase() + key.slice(1)).textContent = val + '%';
  saveSettings();
  if (key === 'volume' && _musicEl) _musicEl.volume = parseInt(val) / 100 * 0.45;
}

function selectRegion(region) {
  selectedRegion = region;
  settings.region = region;
  saveSettings();
  colyseusClient = null; // force reconnect to new region
  renderSettings();
  updateRegionUI();
  showToast(`🌐 Region: ${region === 'AUTO' ? 'Auto' : region}`, 'var(--diamond)');
}

function selectAnimSpeed(speed) {
  settings.animSpeed = speed;
  saveSettings();
  renderSettings();
}

function confirmResetProgress() {
  document.getElementById('resetDialogOverlay').classList.add('show');
}

function closeResetDialog() {
  document.getElementById('resetDialogOverlay').classList.remove('show');
}

function executeReset() {
  try {
    localStorage.removeItem('tileRoyaleState');
    localStorage.removeItem('tileRoyaleSettings');
  } catch(e) {}
  closeResetDialog();
  showToast('Progress reset! Reloading...', 'var(--red)');
  setTimeout(() => location.reload(), 1500);
}

// Colorblind CSS
const colorblindStyle = document.createElement('style');
colorblindStyle.textContent = `
  .colorblind .tile.burning::after { content: '!'; font-size:16px; font-weight:900; color:white; }
  .colorblind .tile.tapped::after  { content: '✓'; font-size:16px; font-weight:900; }
  .colorblind .tile.burning { outline: 3px solid white; }
  .colorblind .tile.tapped  { outline: 3px dashed #00ff88; }
`;
document.head.appendChild(colorblindStyle);

// ── App visibility / background handling ────────────────────────────────────
function _pauseAllAudio() {
  // Pause music
  if (_musicEl && !_musicEl.paused) _musicEl.pause();
  // Pause any playing SFX
  for (const pool of Object.values(_sfxPool)) {
    pool.forEach(el => { if (!el.paused) el.pause(); });
  }
}

function _resumeAudioIfNeeded() {
  // Resume music only if there was an active track
  if (_musicEl && currentMusicTrack && _musicEl.paused) {
    _musicEl.play().catch(() => {});
  }
  // Resume AudioContext if suspended (required by some mobile browsers)
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    _pauseAllAudio();
  } else {
    _resumeAudioIfNeeded();
  }
});

// pagehide fires on iOS Safari when app is swiped away / phone locked
window.addEventListener('pagehide', _pauseAllAudio);

