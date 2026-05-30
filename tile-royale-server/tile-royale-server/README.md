# Tile Royale — Multiplayer Server

Colyseus server with **lag compensation** and **multi-region** support.

## Local Development

```bash
npm install
npm run dev
# Server: http://localhost:3000
# Monitor: http://localhost:3000/colyseus
```

## Deploy to Railway — 3 Regions

Deploy 3 separate Railway services, one per region:

### Step 1 — Install Railway CLI
```bash
npm install -g @railway/cli
railway login
```

### Step 2 — Deploy EU (primary)
```bash
railway init --name tile-royale-eu
railway variables set REGION=EU
railway up
# Note URL: wss://tile-royale-eu.railway.app
```

### Step 3 — Deploy NA
```bash
railway init --name tile-royale-na
railway variables set REGION=NA
railway up
# Note URL: wss://tile-royale-na.railway.app
```

### Step 4 — Deploy ASIA
```bash
railway init --name tile-royale-asia
railway variables set REGION=ASIA
railway up
# Note URL: wss://tile-royale-asia.railway.app
```

### Step 5 — Update client (tile-royale.html)
```javascript
const SERVERS = {
  EU:   { ws: 'wss://tile-royale-eu.railway.app',   http: 'https://tile-royale-eu.railway.app' },
  NA:   { ws: 'wss://tile-royale-na.railway.app',   http: 'https://tile-royale-na.railway.app' },
  ASIA: { ws: 'wss://tile-royale-asia.railway.app', http: 'https://tile-royale-asia.railway.app' },
};
```

## Railway Free Tier
- 500 hours/month per service
- 3 services = 3 × 500h = sufficient for launch
- No credit card needed for hobby tier
- Upgrade to $5/month Pro when needed

## Lag Compensation — How It Works

```
Timeline (Tokyo player, 250ms ping):

Server ignites tile at T=0
  → Client receives ignition at T=+250ms (network delay)
  → Player reacts at T=+450ms (250ms delay + 200ms reaction)
  → Server receives tap at T=+700ms

WITHOUT compensation: reaction appears as 700ms (unfair)
WITH compensation:    reaction = 700ms - 125ms (half-RTT) = 575ms
                      True reaction = 575ms - 250ms = 325ms ✓
```

Key constants in TileRoyaleRoom.ts:
- `REACTION_FLOOR_MS = 80` — applied after compensation (fair for all regions)
- `PING_INTERVAL_MS = 3000` — measure ping every 3 seconds
- `MAX_ACCEPTED_PING = 400` — kick players with >400ms ping during waiting phase

## Messages

### Client → Server
| Message | Payload | Description |
|---------|---------|-------------|
| `tap` | `{ tileIndex }` | Player tapped a tile |
| `pong` | `{ id }` | Response to server ping |
| `ready` | — | Player ready |

### Server → Client  
| Message | Payload | Description |
|---------|---------|-------------|
| `ping` | `{ id, t }` | Latency measurement request |
| `your_ping` | `{ ping, region }` | Your measured RTT in ms |
| `tap_ok` | `{ reactionMs, halfRtt, compensated }` | Valid tap confirmed |
| `wrong_tile` | `{ tileIndex }` | Wrong tile — screen locked 1s |
| `golden_tap` | `{ reactionMs }` | Golden tile — immunity granted |
| `tap_rejected` | `{ reason }` | Tap rejected (locked) |
| `player_tapped` | `{ sessionId, name, avatar, reactionMs }` | Broadcast |
| `player_eliminated` | `{ sessionId, name, place, playersLeft }` | Broadcast |
| `immunity_used` | `{ sessionId, name }` | Shield absorbed |
| `game_over` | `{ place, won, winnerName, yourPing, ... }` | Game ended |
| `kicked` | `{ reason, ping }` | Kicked (ping too high) |
| `cheat_detected` | `{ reason, reactionMs }` | Anti-cheat triggered |
| `cheat_warning` | `{ stdDev, avg }` | Pattern warning |

## Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `REGION` | `EU` | Region identifier (EU/NA/ASIA) |
