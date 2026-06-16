# TILE ROYALE — Täielik Projekti Kontekst Claude Code jaoks

---

## ⚡ KRIITILISED PRIORITEEDID — LEIA ALATI SEDA ESIMESENA

**Tile Royale on REAKTSIOONIAJA MÄNG.**

### Optimeerimise prioriteedijärjekord (tähtsamast vähem tähtsani)
1. **Input responsiveness** — koputus peab tunduma KOHENE
2. **Perceived latency** — optimistlik UI enne server kinnitust
3. **Stable frame pacing** — ühtlane FPS, pole frames drops
4. **Network consistency** — WebSocket delay minimaalne
5. **Fast server reaction** — server tick kiire
6. **Lightweight sync** — minimaalne state sync
7. **Visual smoothness** — animatsioonid
8. **Graphics polish** — efektid, glow, particles

### Reeglid
- Visuaalseid efekte, particles-e, glow-d, CSS animatsioonide kihte **VÄHENDADA** kui need mõjutavad tap kiirust / frame stabiilsust
- `tapTile()` peab käivitama optimistliku UI **ENNE** `currentRoom.send('tap', ...)` — juba praegu tehtud
- Isegi 80ms–200ms lisadelay kahjustab competitive gameplay-d oluliselt
- Eesmärk: Brawl Stars / Clash Royale tase — "instant, snappy, competitive"

---

## Projekti ülevaade
Tile Royale on mobiilimäng (Android) mis on ehitatud ühe HTML failina koos Colyseus multiplayer serveriga.
Mäng on battle royale tap game: 5×5 ruudustik, ruut süttib, kõik peavad seda koputama, viimane koputaja elimineeritakse.

---

## Tehniline arhitektuur

### Frontend
- **1 fail:** `index.html` (~630KB) — kogu mäng, UI, JS, CSS
- **Raamistik:** Puhas vanilla JS + CSS, ei mingeid frameworke
- **Mobile:** Capacitor 3 Android wrap
- **Package:** `com.tileroyale.game`

### Backend  
- **Colyseus 0.15** — WebSocket multiplayer server
- **Railway EU:** `wss://tile-royale-eu-production.up.railway.app`
- **1 fail:** `TileRoyaleRoom.ts` — kogu serveri loogika

### Failide asukohad
```
C:\Users\Legend\Desktop\TileRoyale\
  tile-royale-app\tile-royale-app\
    www\index.html              ← mängu kood
    capacitor.config.ts         ← Capacitor seaded
    android\app\build.gradle    ← versionCode siin
  tile-royale-server\tile-royale-server\
    src\rooms\TileRoyaleRoom.ts ← serveri kood
```

---

## Mängu mehaanikad

### Core gameplay
- 5×5 grid (25 ruutu), kuni 30 mängijat
- Ruut süttib → kõik peavad koputama → viimane elimineeritakse
- Serveripoolne lag compensation (halfRTT)
- Bot reaktsiooniaeg: 600-850ms

### Game modes
- **Rush** — standard mode
- **Wild** — items saadaval (bomb, freeze, shadow tile, caltrops, pepper spray, muscle relaxant)
- **King of the Hill (KOTH)** — weekly leaderboard
- **Custom Lobby** — privaatne mäng sõpradega
- **Practice** — 30 sekundit, piiramatu ruute, dual leaderboard

### Wild mode items
- 💣 Bomb — elimineerib juhuslikud mängijad
- ❄️ Freeze — külmutab mängijad
- 🌑 Shadow Tile — lisa ruut mis pole nähtav teistele  
- 🔩 Caltrops — lukustab järgmise vale koputaja
- 🌶️ Pepper Spray — 4 punast ruutu 2 sekundiks poolte mängijate jaoks
- 💊 Muscle Relaxant — aeglustab teisi

---

## Majandussüsteem

### Valuutad
- 💎 Teemandid — premium valuuta
- 🎟️ Piletid — mängu mäng (max 10, taastub iga 30 min)
- Algbilanss: 500💎, 10 piletit

### Ostud
- Teemandid: $0.99–$99.99
- Whale paketid: Moby Dick, Blue Whale, Humpback, Sperm Whale, Narwhal
- Poe tabid: Featured, Tickets, Skins, Effects, Tables, Victory, Avatars, OnlyWhales

### Tasustamine
- Daily diamonds cap: 80💎 mängudest
- XP_PER_LEVEL: 200
- Daily missions, achievements

---

## Skin süsteem

### Tabelid (mängu taust)
- Tasuta: Default
- Ostmiseks: Neon Grid, Carbon, Marble, Wood, Stone, Glass, Holographic, Lava, Ice, Toxic, Diamond, Obsidian, Phoenix, Abyss
- Whale exclusive: Candy, Cheese, Disco, Money + rohkem

### Tile efektid (põleva ruudu efekt)
- 🔥 Fire (default), 💙 Neon Blue, 🩷 Neon Pink, ⚡ Electric, 🟣 Plasma
- ❄️ Ice, ☣️ Toxic, ☀️ Solar, 🌈 Rainbow, 🌑 Void, ✨ God Ray
- 🌀 Blackhole, 💥 Supernova

### Teemad (kogu visuaalne teema)
- 🩹 Pimple Popper — nahk/vistrike teema
- 👁️ Eye Popper — silm teema  
- 🐛 Bug Squasher — lepatriinu/putuk teema
- 🌌 Cosmic Popper — kosmos/planeet teema
- 🍓 Fruit Popper — maasikas teema

### Victory screens
- Klassid: Classic, Fireworks, Confetti, Golden, Royal, Champion, Legendary

---

## Gauntlet süsteem
- 5 sõrmuse slot
- Sõrmused harulduste järgi: Common, Uncommon, Rare, Epic, Legendary, Secret
- Lossimine spinneri abil (Spin Wheel)
- Gauntlet avab leveliga (level 3+)

---

## Multiplayer server loogika (TileRoyaleRoom.ts)

### Room lifecycle (DISPOSABLE MATCHES)
```
WAITING → LOCKED → IN_PROGRESS → FINISHED → DESTROYED
```

1. Esimene mängija liitub → 15s timer käivitub
2. 15s jooksul saavad teised liituda (sama mode)
3. 15s lõppeb → `this.lock()` → botid täidavad tühjad kohad → countdown
4. Mäng algab
5. `onLeave` on SYNC (mitte async) → reconnect võimatu
6. `joinedPlayers` Set → sama sessionId ei saa uuesti liituda
7. Room hävib 5-10s peale mängu lõppu

### Kriitilised reeglid
- `this.lock()` kutsutakse ALATI enne bot fill-i
- `onLeave` on SYNC — Colyseus async onLeave = reconnect lubatud!
- `joinedPlayers.has(sessionId)` → `client.leave(4002)` reconnect katse korral

---

## Kliendi multiplayer loogika

### Ühenduse flow
```javascript
tryMultiplayer(mode) → joinOrCreate('tile_royale', {mode, name, avatar})
→ setupRoomListeners(room)
→ phase=countdown → lobbyScreen countdown
→ phase=playing → startGameFromServer()
→ phase=gameOver → endGame()
```

### Kriitilised muutujad
```javascript
let currentRoom = null;
let isMultiplayer = false;
let mpListenersActive = false;
let colyseusClient = null;
```

### Multiplayer game lõpu flow (tähtis!)
```
Server: endGame() → client.send("game_over") → 10s → this.disconnect()
Client: room.onMessage("game_over") → endGameFromServer(data) → showScreen('resultScreen') → currentRoom.leave()
Fallback (kui game_over puudub): room.onLeave() → endGame(!playerEliminated)  [bot-mode]
```

### endGameFromServer vs endGame (bot-mode)
- `endGameFromServer` — multiplayer: võtab server data-st (winner name/avatar/skin/place), arvab tasud, näitab result screen
- `endGame(playerWon)` — bot-mode: kasutab `allPlayers` massiivi, arvab tasud, näitab result screen
- **`allPlayers` EI täitu multiplayer lobbys** — `room.state.players.onAdd` uuendab ainult DOM slotte, mitte `allPlayers`. Seega bot-mode `endGame` kaudu tuleva result screen-i leaderboard on tühi MP mängus.

### Lobby flow — server vs client
- Server: esimene join → 15s timer → bots fill → `startCountdown()` → `this.lock()`
- Client: `tryMultiplayer()` → 8s timeout → kui leitud: 15s progress bar + 35s safety fallback
- Safety fallback: kui room ei lähe >35s playing-sse → `currentRoom.leave()` → `startBotLobby()`
- Phase listener `"countdown"` tühistab `lobbySearchTimeout` ja `lobbyInterval`

### Cleanup (_fullGameCleanup)
```javascript
mpListenersActive = false;  // ESIMENE — peatab kõik listenerid
gameSessionId++;
window._activeSession = null;
roundActive = false;
isMultiplayer = false;
currentRoom.leave();
currentRoom = null;
colyseusClient = null;
```

### Capacitor config (olulised read)
```typescript
server: {
  androidScheme: 'https',
  hostname: 'tileroyale.app',  // KRIITILINE — muidu WebSocket Origin=null
  allowNavigation: ['tile-royale-eu-production.up.railway.app'],
},
android: {
  allowMixedContent: true,
  versionCode: 24,  // praegune versioon (järgmine deploy: 25)
}
```

---

## Android deploy protsess

```powershell
# 1. Sync Capacitor (kopeerib www/index.html → android assets)
cd "C:\Users\Legend\Desktop\TileRoyale\tile-royale-app\tile-royale-app"
npx cap sync android

# 2. Tõsta versionCode (asenda number praegusega+1)
$gradle = ".\android\app\build.gradle"
(Get-Content $gradle) -replace "versionCode \d+", "versionCode 25" | Set-Content $gradle

# 3. Android Studio → Build → Generate Signed App Bundle → release
#    Keystore: tile-royale.keystore
#    AAB asukoht: android\app\release\app-release.aab

# 4. Google Play Console → Internal Testing → Create new release → Upload AAB
```

### Server deploy
```powershell
cd "C:\Users\Legend\Desktop\TileRoyale\tile-royale-server\tile-royale-server"
railway up
```

---

## Teadaolevad probleemid / TODO

### Lahendamata
_(kõik teadaolevad bugid hetkel lahendatud)_

### Lahendatud hiljuti
- ✅ **Lobby progress bar** — `requestAnimationFrame` ei käivitanud CSS transition-it (element oli juba `width:0%`). Fix: `void bar.offsetWidth` (sunnib layout reflow).
- ✅ **Result screen ei ilmunud** — `endGameFromServer` polnud kaitstud `try-catch`-iga; crash enne `showScreen` tähendas 10s külmunud ekraani. Fix: kogu keha `try-catch`-is, `showScreen('resultScreen')` + `currentRoom.leave()` garanteeritud väljaspool.
- ✅ **Multiplayer tasud arvamata** — `endGameFromServer` ei andnud diamante/XP/wins; bot-mode `endGame` kutsuti ainult `onLeave` kaudu. Fix: täis rewards loogika (sama valem mis bot-mode) lisatud `endGameFromServer`-sse.
- ✅ **WatchBar jäi result screen peale** — `endGameFromServer` ei eemaldanud spectator bar-i. Fix: `watchBar.classList.remove('show')` lisatud.
- ✅ Reconnect bug — sama room jäi joinable peale lock-i (`this.lock()` puudus)
- ✅ Grid ei ilmunud multiplayer mängus (`GRID_SIZE` undefined, `applySkins()` vale järjekord)
- ✅ Bot compensatedTime vale arvutus (absoluutne vs relatiivne)
- ✅ Menüüs vibratsioon/heli kui mäng jäi taustal käima
- ✅ Musta ekraani bug (840KB CSS :root blokk)
- ✅ `_fullGameCleanup` ei katkestanud ühendust

### Architectuurilised otsused
- Kõik ühes failis → lihtsam deploy, Capacitor-iga hästi töötav
- Pilte/PNG asset-e EI kasutata — olid liiga suured, tekitasid musta ekraani
- CSS gradientid kõigele → kiire, väike failisuurus

---

## Redeem koodid (dev testimiseks)
| Kood | Efekt |
|---|---|
| WELCOME2025 | 500💎 + esemed |
| TILEROYALE | 1000💎 |
| DEV-GEMS | +10,000💎 |
| DEV-GAUNTLET | Avab Gauntlet |
| DEV-LEVEL10 | Level 10 |

---

## Google Play
- App ID: `com.tileroyale.game`
- Praegu: Internal Testing
- AdMob: `ca-app-pub-2005005437331878~7767995750`
