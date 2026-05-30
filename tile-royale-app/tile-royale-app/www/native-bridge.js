/**
 * native-bridge.js
 * Drop this into www/ alongside index.html.
 * Bridges Capacitor native APIs into the game's existing JS functions.
 *
 * The game already calls:
 *   vibrate(ms)          → routes to Capacitor Haptics
 *   navigator.vibrate()  → already in game, Capacitor overrides
 *   Wake Lock API        → routes to Capacitor KeepAwake
 *   Push notifications   → handled here
 *   AdMob rewarded ads   → replaces simulateAdWatch()
 */

// Wait for Capacitor to be ready
window.addEventListener('load', async () => {
  if (typeof Capacitor === 'undefined') return;
  const { Capacitor: Cap } = window;

  // ── STATUS BAR ───────────────────────────────────────────────────────────
  try {
    const { StatusBar, Style } = await import('./node_modules/@capacitor/status-bar/dist/esm/index.js')
      .catch(() => ({ StatusBar: null }));
    if (StatusBar) {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#0a0a0f' });
      if (Cap.getPlatform() === 'android') {
        await StatusBar.setOverlaysWebView({ overlay: true });
      }
    }
  } catch(e) {}

  // ── SPLASH SCREEN ────────────────────────────────────────────────────────
  try {
    const { SplashScreen } = await import('./node_modules/@capacitor/splash-screen/dist/esm/index.js')
      .catch(() => ({ SplashScreen: null }));
    if (SplashScreen) {
      // Hide after game has initialised (500ms delay)
      setTimeout(() => SplashScreen.hide(), 500);
    }
  } catch(e) {}

  // ── HAPTICS (replaces navigator.vibrate) ─────────────────────────────────
  try {
    const { Haptics, ImpactStyle } = await import('./node_modules/@capacitor/haptics/dist/esm/index.js')
      .catch(() => ({ Haptics: null }));
    if (Haptics) {
      // Override the game's vibrate() function
      window._nativeVibrate = async (ms) => {
        if (Array.isArray(ms)) {
          // Pattern — use heavy impact for long, light for short
          for (let i = 0; i < ms.length; i++) {
            if (i % 2 === 0 && ms[i] > 0) {
              await Haptics.impact({ style: ms[i] > 100 ? ImpactStyle.Heavy : ImpactStyle.Light });
            }
            if (ms[i] > 0) await new Promise(r => setTimeout(r, ms[i]));
          }
        } else {
          await Haptics.impact({ style: ms > 100 ? ImpactStyle.Heavy : ImpactStyle.Light });
        }
      };
      console.log('[NativeBridge] Haptics ready');
    }
  } catch(e) {}

  // ── PUSH NOTIFICATIONS ───────────────────────────────────────────────────
  try {
    const { PushNotifications } = await import('./node_modules/@capacitor/push-notifications/dist/esm/index.js')
      .catch(() => ({ PushNotifications: null }));

    if (PushNotifications) {
      // Request permission when user enables notifications in settings
      window.requestPushPermission = async () => {
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive === 'granted') {
          await PushNotifications.register();
          return true;
        }
        return false;
      };

      PushNotifications.addListener('registration', (token) => {
        console.log('[Push] Token:', token.value);
        // In production: send token to your server
        // fetch('https://tile-royale-eu.railway.app/register-push', { ... })
        window.pushToken = token.value;
      });

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        // In-app notification display
        if (window.showToast) {
          window.showToast(`🔔 ${notification.title}: ${notification.body}`, 'var(--diamond)');
        }
      });
    }
  } catch(e) {}

  // ── ADMOB ────────────────────────────────────────────────────────────────
  try {
    const { AdMob, RewardAdPluginEvents, AdmobConsentStatus } = await import('./node_modules/@capacitor-community/admob/dist/esm/index.js')
      .catch(() => ({ AdMob: null }));

    if (AdMob) {
      await AdMob.initialize({
        // Real AdMob App ID: ca-app-pub-1687381057809117~9075174731
        testingDevices: ['EMULATOR'],
        initializeForGeography: 1, // EEA
      });

      // Real rewarded ad unit IDs
      window.simulateAdWatch = async (onComplete) => {
        try {
          const adId = Cap.getPlatform() === 'ios'
            ? 'ca-app-pub-1687381057809117/YOUR_IOS_REWARDED_ID'  // add iOS unit ID from AdMob console
            : 'ca-app-pub-1687381057809117/7980217936'; // Android rewarded — ticket_reward

          await AdMob.prepareRewardVideoAd({ adId });

          let rewarded = false;
          AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
            rewarded = true;
          });
          AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
            if (rewarded) onComplete();
            else if (window.showToast) window.showToast('Ad not completed', 'var(--muted)');
          });

          await AdMob.showRewardVideoAd();
        } catch(e) {
          console.warn('[AdMob] Error:', e);
          window.showToast('Ad unavailable — try again later', 'var(--muted)');
        }
      };

      console.log('[NativeBridge] AdMob ready');
    }
  } catch(e) {}

  // ── APP STATE (pause/resume) ─────────────────────────────────────────────
  try {
    const { App } = await import('./node_modules/@capacitor/app/dist/esm/index.js')
      .catch(() => ({ App: null }));
    if (App) {
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          // App went to background — pause music, save state
          if (window.stopMusic) window.stopMusic();
          if (window.saveState) window.saveState();
          if (window.gameState) {
            window.gameState.lastOnline = Date.now();
            window.saveState();
          }
        } else {
          // App came back — check offline rewards
          if (window.checkOfflineReward) setTimeout(window.checkOfflineReward, 500);
          if (window.checkTicketRefill) window.checkTicketRefill();
        }
      });

      App.addListener('backButton', ({ canGoBack }) => {
        // Android back button — go to menu if in game, else show exit dialog
        if (window.currentScreen && window.currentScreen !== 'menuScreen') {
          window.showScreen('menuScreen');
        }
        // Don't exit app on back button press
      });
    }
  } catch(e) {}

  console.log('[NativeBridge] All plugins initialised on', Cap.getPlatform());
});
