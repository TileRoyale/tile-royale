#!/bin/bash
# =============================================================
# Tile Royale — Full Setup Script
# Run this on your development machine (Mac/Linux/WSL)
# =============================================================

set -e  # Exit on any error

echo ""
echo "🔥 TILE ROYALE SETUP"
echo "===================="
echo ""

# ── CHECK PREREQUISITES ──────────────────────────────────────

check_command() {
  if ! command -v $1 &> /dev/null; then
    echo "❌ $1 not found. Please install it first."
    echo "   $2"
    exit 1
  fi
  echo "✅ $1 found"
}

echo "Checking prerequisites..."
check_command "node"  "https://nodejs.org"
check_command "npm"   "Comes with Node.js"
check_command "git"   "https://git-scm.com"

echo ""
echo "Node version: $(node --version)"
echo "NPM version:  $(npm --version)"
echo ""

# ── STEP 1: SERVER SETUP ─────────────────────────────────────

echo "📦 Step 1: Setting up server..."
echo "──────────────────────────────"

cd tile-royale-server
npm install
npm run build
echo "✅ Server built successfully"
cd ..

echo ""
echo "🚂 Step 2: Deploy to Railway"
echo "────────────────────────────"
echo ""
echo "Option A — Railway CLI (recommended):"
echo "  1. Install: npm install -g @railway/cli"
echo "  2. Login:   railway login"
echo "  3. Deploy EU:"
echo "     cd tile-royale-server"
echo "     railway init --name tile-royale-eu"
echo "     railway variables set REGION=EU"
echo "     railway up"
echo ""
echo "  4. Deploy NA (optional, for wider launch):"
echo "     railway init --name tile-royale-na"
echo "     railway variables set REGION=NA"
echo "     railway up"
echo ""
echo "  5. Note your Railway URLs and update SERVERS in index.html"
echo ""
echo "Option B — Railway Dashboard:"
echo "  1. Go to railway.app → New Project → Deploy from GitHub"
echo "  2. Connect tile-royale-server folder"
echo "  3. Add REGION=EU variable"
echo ""

# ── STEP 3: CAPACITOR SETUP ──────────────────────────────────

echo "📱 Step 3: Capacitor (Android/iOS)"
echo "───────────────────────────────────"

cd tile-royale-app
npm install

echo ""
echo "Installing Capacitor CLI globally..."
npm install -g @capacitor/cli

echo ""
echo "Syncing Capacitor..."
npx cap sync

echo ""
echo "✅ Capacitor ready"
echo ""

echo "To open Android Studio:"
echo "  cd tile-royale-app && npx cap open android"
echo ""
echo "To open Xcode (Mac only):"
echo "  cd tile-royale-app && npx cap open ios"
echo ""

cd ..

# ── STEP 4: ADMOB SETUP ──────────────────────────────────────

echo "💰 Step 4: AdMob Setup"
echo "──────────────────────"
echo ""
echo "1. Go to admob.google.com"
echo "2. Create app → Android + iOS"
echo "3. Create Rewarded Ad units"
echo "4. Update native-bridge.js:"
echo "   - Replace 'ca-app-pub-3940256099942544/...' test IDs"
echo "   - With your real ad unit IDs"
echo ""

# ── DONE ─────────────────────────────────────────────────────

echo "════════════════════════════════════"
echo "✅ SETUP COMPLETE!"
echo "════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Deploy server to Railway"
echo "  2. Update SERVERS URLs in www/index.html"
echo "  3. npx cap open android  (in tile-royale-app/)"
echo "  4. Build APK in Android Studio"
echo "  5. Test on real device"
echo ""
echo "Good luck! 🔥"
