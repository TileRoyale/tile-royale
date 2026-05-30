# Tile Royale — Git Workflow

## Branch Structure

| Branch | Purpose |
|--------|---------|
| `main` | Production — Play Store live version only |
| `develop` | Active development — features, experiments, fixes |

---

## DEVELOP BRANCH

All day-to-day work happens here.

**Used for:**
- New features
- UI/UX changes
- Bug fixes
- Experiments and unfinished systems
- Backend endpoint additions

**Typical workflow:**

```bash
git checkout develop
git add .
git commit -m "feat: describe what changed"
git push
```

---

## MAIN BRANCH

Only receives merges from `develop` when a feature is complete and tested.

**Used for:**
- Play Store releases
- Stable, production-ready builds only

**Release workflow:**

```bash
# 1. Merge develop into main
git checkout main
git merge develop
git push

# 2. Tag the release
git tag -a v1.x.x -m "vX.X.X — description"
git push origin v1.x.x

# 3. Build and upload AAB to Play Console
```

---

## Commit Message Convention

```
feat: add friend request notifications
fix: correct ON CONFLICT clause in sendFriendRequest
ui: move missions to full-screen layout
chore: bump versionCode to 58
```

---

## Tag Convention

| Tag | Meaning |
|-----|---------|
| `v1.0.0` | First stable production release |
| `v1.1.0` | New feature release |
| `v1.0.1` | Hotfix / patch release |

---

## Emergency Hotfix

If a critical bug is found in production:

```bash
git checkout main
git checkout -b hotfix/description
# fix the bug
git commit -m "fix: critical bug description"
git checkout main
git merge hotfix/description
git push
git tag -a v1.x.x -m "hotfix"
git push origin v1.x.x
git checkout develop
git merge main
git push
```
