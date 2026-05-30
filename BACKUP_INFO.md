# Tile Royale — Repository Backup Info

## Repository

**URL:** https://github.com/TileRoyale/tile-royale

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Production / Play Store |
| `develop` | Active development |

## Tags

| Tag | Description | Date |
|-----|-------------|------|
| `v1.0.0` | First stable production release | 2026-05-30 |

## Recovery

If local files are lost, restore with:

```bash
git clone https://github.com/TileRoyale/tile-royale.git
cd tile-royale
git checkout develop
```

To restore a specific release:

```bash
git checkout v1.0.0
```

## Key Paths After Clone

| What | Path |
|------|------|
| Web app (HTML/JS/CSS) | `tile-royale-app/tile-royale-app/www/` |
| Android project | `tile-royale-app/tile-royale-app/android/` |
| Server source | `tile-royale-server/tile-royale-server/src/` |
| Assets | `sounds and logos/` |

## External Services

| Service | What |
|---------|------|
| Railway | Game server + PostgreSQL database |
| Google Play Console | Android app distribution |
