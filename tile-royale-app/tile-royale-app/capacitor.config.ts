import { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId:    'com.tileroyale.game',
  appName:  'Tile Royale',
  webDir:   'www',
  server: {
    androidScheme: 'https',
    hostname: 'tileroyale.app',
    allowNavigation: [
      'tile-royale-eu-production.up.railway.app'
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration:    2000,
      launchAutoHide:        true,
      backgroundColor:       '#0a0a0f',
      androidSplashResourceName: 'splash',
      androidScaleType:      'CENTER_CROP',
      showSpinner:           false,
      splashFullScreen:      true,
      splashImmersive:       true,
    },
    StatusBar: {
      style:           'DARK',
      backgroundColor: '#0a0a0f',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '1045465012102-vkc1iavujbscm8j1hrerj4fr440e1tjm.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
  android: {
    buildOptions: {
      keystorePath:  'tile-royale.keystore',
      keystoreAlias: 'tile-royale',
    },
    allowMixedContent: true,
    versionCode: 2,
  },
};
export default config;