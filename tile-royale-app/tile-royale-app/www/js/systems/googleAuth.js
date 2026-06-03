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
    await auth.initialize();
    const user = await auth.signIn();
    const googleId = user.id;
    const newPlayerId = `google_${googleId}`;

    localStorage.setItem('tr_google_id',    googleId);
    localStorage.setItem('tr_google_name',  user.name || user.displayName || 'Player');
    localStorage.setItem('tr_google_email', user.email || '');

    // Switch global PLAYER_ID to Google-based ID
    window.PLAYER_ID = newPlayerId;

    // Try to restore existing cloud save for this Google account
    showToast('☁️ Checking cloud save...', 'var(--muted)');
    const restored = await loadFromCloud();

    if (!restored) {
      // No cloud save for this Google account yet — upload current progress
      await saveToCloud();
      showToast('✅ Signed in! Progress linked to Google account.', 'var(--green)');
    } else {
      showToast('✅ Progress restored from cloud!', 'var(--green)');
    }

    updateGoogleAuthUI();
  } catch(e) {
    console.warn('[GoogleAuth] sign-in failed:', e?.message || e);
    showToast('Sign-in cancelled or failed', 'var(--muted)');
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
