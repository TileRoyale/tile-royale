// ===== GOOGLE SIGN-IN =====
// Links player progress to a Google account so it survives reinstalls.
// PLAYER_ID switches from a local UUID to `google_<googleId>` on sign-in.

function _gAuth() {
  if (!window.Capacitor?.isNativePlatform?.()) return null;
  if (!window.Capacitor?.Plugins?.GoogleAuth && window.Capacitor?.registerPlugin) {
    try { window.Capacitor.registerPlugin('GoogleAuth', {}); } catch(e) {}
  }
  return window.Capacitor?.Plugins?.GoogleAuth ?? null;
}

function isSignedInWithGoogle() {
  return !!localStorage.getItem('tr_google_id');
}

async function googleSignIn() {
  const auth = _gAuth();
  if (!auth) {
    showToast('Google Sign-In not available — native app only', 'var(--muted)');
    return;
  }
  try {
    showToast('⏳ Opening Google Sign-In...', 'var(--muted)');

    // Pass options explicitly — don't rely on capacitor.config.ts being read correctly
    try {
      await auth.initialize({
        clientId: '129001782295-i2jtj0ppe4b7kjhmv1f5uvap6c8pnvdn.apps.googleusercontent.com',
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
      });
    } catch(initErr) {
      // initialize() may throw if already initialized — that's fine
      console.warn('[GoogleAuth] initialize warning (non-fatal):', initErr?.message || initErr);
    }

    const user = await auth.signIn();
    if (!user) throw new Error('signIn returned null');

    const googleId = user.id || user.sub || user.serverAuthCode;
    if (!googleId) throw new Error('no_google_id: ' + JSON.stringify(Object.keys(user)));

    const newPlayerId = `google_${googleId}`;

    localStorage.setItem('tr_google_id',    googleId);
    localStorage.setItem('tr_google_name',  user.name || user.displayName || user.givenName || 'Player');
    localStorage.setItem('tr_google_email', user.email || '');

    // Switch global PLAYER_ID to Google-based ID
    window.PLAYER_ID = newPlayerId;

    // Try to restore existing cloud save for this Google account
    showToast('☁️ Checking cloud save...', 'var(--muted)');
    const restored = await loadFromCloud();

    if (!restored) {
      await saveToCloud();
      showToast('✅ Signed in! Progress linked to Google account.', 'var(--green)');
    } else {
      showToast('✅ Progress restored from cloud!', 'var(--green)');
    }

    updateGoogleAuthUI();
  } catch(e) {
    console.warn('[GoogleAuth] sign-in failed:', e?.message || e);
    showToast('❌ Sign-in failed: ' + (e?.message || 'unknown error'), 'var(--red)');
  }
}

async function googleSignOut() {
  const auth = _gAuth();
  try { if (auth) await auth.signOut(); } catch(e) {}

  localStorage.removeItem('tr_google_id');
  localStorage.removeItem('tr_google_name');
  localStorage.removeItem('tr_google_email');

  // Revert to local UUID
  window.PLAYER_ID = localStorage.getItem('tr_player_id');
  updateGoogleAuthUI();
  showToast('Signed out from Google', 'var(--muted)');
}

function updateGoogleAuthUI() {
  const signedIn = isSignedInWithGoogle();
  const nameEl  = document.getElementById('googleAuthName');
  const descEl  = document.getElementById('googleAuthDesc');
  const btnEl   = document.getElementById('googleAuthBtn');
  if (!nameEl || !btnEl) return;

  if (signedIn) {
    const name  = localStorage.getItem('tr_google_name') || 'Google User';
    const email = localStorage.getItem('tr_google_email') || '';
    nameEl.textContent  = `✅ ${name}`;
    nameEl.style.color  = 'var(--green)';
    descEl.textContent  = email;
    btnEl.textContent   = 'Sign out';
    btnEl.onclick       = googleSignOut;
    btnEl.style.borderColor = 'var(--red)';
    btnEl.style.color       = 'var(--red)';
  } else {
    nameEl.textContent  = 'Not signed in';
    nameEl.style.color  = 'var(--muted)';
    descEl.textContent  = 'Sign in to save progress across reinstalls';
    btnEl.textContent   = 'Sign in with Google';
    btnEl.onclick       = googleSignIn;
    btnEl.style.borderColor = '';
    btnEl.style.color       = '';
  }
}

window.addEventListener('load', () => setTimeout(updateGoogleAuthUI, 300));
