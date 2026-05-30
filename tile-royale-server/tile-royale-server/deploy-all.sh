#!/bin/bash
# =============================================================
# Tile Royale — Railway Multi-Region Deployment
# Run from the tile-royale-server/ directory
# Requires: npm install -g @railway/cli && railway login
# =============================================================

set -e

echo ""
echo "🚂 TILE ROYALE — RAILWAY DEPLOY"
echo "================================"
echo ""

REGIONS=("EU" "NA" "ASIA")
DECLARE -A URLS

# Deploy to each region
for REGION in "${REGIONS[@]}"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Deploying $REGION server..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  PROJECT_NAME="tile-royale-$(echo $REGION | tr '[:upper:]' '[:lower:]')"

  # Check if project exists
  if railway status --project $PROJECT_NAME 2>/dev/null; then
    echo "Project $PROJECT_NAME exists — updating..."
    railway up --project $PROJECT_NAME
  else
    echo "Creating new project: $PROJECT_NAME"
    railway init --name $PROJECT_NAME
    railway variables set REGION=$REGION
    railway up
  fi

  # Get URL
  URL=$(railway domain 2>/dev/null || echo "Check Railway dashboard")
  URLS[$REGION]=$URL
  echo "✅ $REGION deployed: $URL"
  echo ""
done

# Print summary
echo "════════════════════════════════════"
echo "✅ ALL REGIONS DEPLOYED"
echo "════════════════════════════════════"
echo ""
echo "Update SERVERS in tile-royale-app/www/index.html:"
echo ""
echo "const SERVERS = {"
for REGION in "${REGIONS[@]}"; do
  LOWER=$(echo $REGION | tr '[:upper:]' '[:lower:]')
  echo "  $REGION: { ws: 'wss://${URLS[$REGION]}', http: 'https://${URLS[$REGION]}' },"
done
echo "};"
echo ""
echo "Then run: npx cap sync (in tile-royale-app/)"
