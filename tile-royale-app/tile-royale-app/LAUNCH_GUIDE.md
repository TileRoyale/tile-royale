# Tile Royale — Launch Guide

## Kõik sammud alates nullist kuni App Store'ini

---

## 1. Failid

```
tile-royale-server.zip  → Colyseus multiplayer server
tile-royale-app/        → Capacitor projekt (HTML → native app)
  www/index.html        → Mäng ise
  www/native-bridge.js  → Native plugin integratsioon
  capacitor.config.ts   → Capacitor seaded
  setup.sh              → Automaatne setup skript
```

---

## 2. Railway Server Deploy (30 min)

### 2.1 Registreeru
1. Ava **railway.app**
2. Sign up with GitHub (tasuta)
3. Ei nõua krediitkaart

### 2.2 Deploy EU server
```bash
# Installi CLI
npm install -g @railway/cli
railway login

# Unzip server
unzip tile-royale-server.zip
cd tile-royale-server

# Deploy
railway init --name tile-royale-eu
railway variables set REGION=EU
npm install && npm run build
railway up
```

### 2.3 Kopeeri URL
Railway annab URL kujul: `tile-royale-eu.up.railway.app`

### 2.4 Uuenda mäng
Ava `www/index.html`, leia `const SERVERS` ja asenda:
```javascript
const SERVERS = {
  EU:   { ws: 'wss://tile-royale-eu.up.railway.app',
          http: 'https://tile-royale-eu.up.railway.app' },
  NA:   { ws: 'wss://tile-royale-eu.up.railway.app',   // sama EU alguses
          http: 'https://tile-royale-eu.up.railway.app' },
  ASIA: { ws: 'wss://tile-royale-eu.up.railway.app',
          http: 'https://tile-royale-eu.up.railway.app' },
};
```

### 2.5 Testi serverit
Ava brauseris: `https://tile-royale-eu.up.railway.app`
Peaks näitama: `{"status":"ok","game":"Tile Royale",...}`

---

## 3. Android Setup (2–4 tundi)

### 3.1 Nõuded
- **Android Studio** — [developer.android.com/studio](https://developer.android.com/studio)
- **Java 17** — Android Studio installib automaatselt
- **Node.js 18+** — [nodejs.org](https://nodejs.org)

### 3.2 Capacitor install
```bash
cd tile-royale-app
npm install
npm install -g @capacitor/cli
npx cap sync
```

### 3.3 Ava Android Studio
```bash
npx cap open android
```

Android Studio avaneb automaatselt.

### 3.4 Esimene käivitus emulaatoris
1. Android Studio → `Run → Run 'app'`
2. Vali emulaator (loo uus kui pole)
3. Mäng peaks avanema

### 3.5 Päris seadmel testimine
1. Lülita telefonis sisse **Developer Options**
   - Settings → About Phone → Build Number (vajuta 7×)
2. Developer Options → USB Debugging → ON
3. Ühenda telefon USB kaabliga
4. Android Studio → vali oma telefon → Run

### 3.6 Build APK (jagamiseks)
```
Android Studio → Build → Build Bundle(s)/APK(s) → Build APK(s)
```
APK asukoht: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## 4. iOS Setup (Mac ainult)

### 4.1 Nõuded
- **Mac** (kohustuslik iOS jaoks)
- **Xcode 15+** — App Store'ist tasuta
- **Apple Developer account** — $99/aasta

### 4.2 Ava Xcode
```bash
cd tile-royale-app
npx cap open ios
```

### 4.3 Seadista Bundle ID
Xcode → Signing & Capabilities → Bundle Identifier: `com.tileroyale.game`

### 4.4 Testimine
Xcode → vali seade → Run (▶)

---

## 5. AdMob Setup (1–2 tundi)

### 5.1 Loo AdMob konto
1. Ava **admob.google.com**
2. Sign in with Google
3. Create App → Android → `com.tileroyale.game`
4. Create App → iOS → `com.tileroyale.game`

### 5.2 Loo Ad Unit
1. AdMob → Apps → Tile Royale → Ad units
2. Add ad unit → Rewarded
3. Name: `tile-royale-rewarded`
4. Kopeeri Ad Unit ID (kujul `ca-app-pub-XXXX/XXXX`)

### 5.3 Uuenda native-bridge.js
```javascript
// Leia need read ja asenda test ID-d:
const adId = Cap.getPlatform() === 'ios'
  ? 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX'  // sinu iOS ad unit ID
  : 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX'; // sinu Android ad unit ID
```

### 5.4 Lisa AdMob App ID manifestidesse

**Android** (`android/app/src/main/AndroidManifest.xml`):
```xml
<meta-data
  android:name="com.google.android.gms.ads.APPLICATION_ID"
  android:value="ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"/>
```

**iOS** (`ios/App/App/Info.plist`):
```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX</string>
```

---

## 6. Google Play Store (1–2 tundi)

### 6.1 Developer konto
1. **play.google.com/console** → Create account
2. Maks: **$25** (üks kord)
3. Identity verification (1–2 päeva)

### 6.2 Loo keystore (allkirjastamine)
```bash
keytool -genkey -v -keystore tile-royale.keystore \
  -alias tile-royale \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```
⚠️ **Hoia keystore faili turvaliselt** — ilma selleta ei saa äppi uuendada!

### 6.3 Build Release APK
Android Studio → Build → Generate Signed Bundle/APK
→ APK → kasuta loodud keystoret → Release

### 6.4 Play Console
1. Create app → Tile Royale → Game
2. Content rating → täida küsimustik
3. Privacy policy URL (kasuta About ekraani teksti)
4. Internal testing → upload APK
5. Production → publish

---

## 7. Apple App Store (3–7 päeva review)

### 7.1 App Store Connect
1. **appstoreconnect.apple.com**
2. My Apps → + → New App
3. Bundle ID: `com.tileroyale.game`
4. SKU: `tile-royale-001`

### 7.2 Screenshots
Vajad screenshots iga seadme suuruse jaoks:
- 6.7" iPhone (1290×2796) — kohustuslik
- 12.9" iPad (2048×2732) — kohustuslik

Tee screenshots emulaatoris: Xcode → Device → Take Screenshot

### 7.3 Submit
1. Täida App Information
2. Upload build Xcode kaudu: Product → Archive → Distribute
3. Submit for Review
4. Oota 1–7 päeva

---

## 8. Soft Launch checklist

Enne globaalset launchit:

- [ ] Server vastab: `curl https://tile-royale-eu.up.railway.app`
- [ ] Multiplayer töötab kahe telefoniga
- [ ] Reklaamid laevad
- [ ] Tickets deduct correctly
- [ ] Offline reward töötab
- [ ] No crashes in 1 hour of play
- [ ] Privacy Policy URL töötab
- [ ] Support email töötab

---

## Kiirkontakt

- Railway: railway.app/help
- Capacitor: capacitorjs.com/docs
- AdMob: support.google.com/admob
- Play Console: support.google.com/googleplay/android-developer
- App Store: developer.apple.com/support

---

*Tile Royale v1.0.0 — Launch Guide*
