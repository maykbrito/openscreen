#!/bin/bash
#
# Post-build helper for macOS development
#
# What it does:
#   1. Resets Screen Recording TCC permission (so the OS prompts again cleanly)
#   2. Copies the built .app to /Applications for easy testing
#
# Why: ad-hoc signed builds get a new identity each time, which invalidates
# the previous TCC grant. Without this reset, the app loops asking for
# screen recording permission forever.
#

set -euo pipefail

BUNDLE_ID="com.siddharthvaddem.openscreen"
APP_NAME="Openscreen"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(node -p "require('${PROJECT_ROOT}/package.json').version")

# ── Colors ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

echo ""
echo -e "${CYAN}${BOLD}▸ Post-build: resetting Screen Recording permission...${NC}"
tccutil reset ScreenCapture "$BUNDLE_ID" 2>/dev/null || tccutil reset ScreenCapture 2>/dev/null || true
echo -e "${GREEN}✓ TCC reset done — next launch will prompt for permission cleanly${NC}"

# ── Find the .app bundle ──────────────────────────────────────────────
RELEASE_DIR="${PROJECT_ROOT}/release/${VERSION}"
ARCH=$(uname -m)

if [[ "$ARCH" == "arm64" ]]; then
    APP_DIR="${RELEASE_DIR}/mac-arm64"
else
    APP_DIR="${RELEASE_DIR}/mac"
fi

APP_BUNDLE="${APP_DIR}/${APP_NAME}.app"

if [ ! -d "$APP_BUNDLE" ]; then
    # Fallback: search for any .app in the release dir
    APP_BUNDLE=$(find "$RELEASE_DIR" -maxdepth 2 -name "*.app" -type d 2>/dev/null | head -n1)
fi

if [ -z "$APP_BUNDLE" ] || [ ! -d "$APP_BUNDLE" ]; then
    echo -e "${YELLOW}⚠ Could not find .app bundle in ${RELEASE_DIR}${NC}"
    echo -e "${YELLOW}  Skipping copy to /Applications${NC}"
    exit 0
fi

# ── Copy to /Applications ────────────────────────────────────────────
echo -e "${CYAN}${BOLD}▸ Installing ${APP_NAME}.app to /Applications...${NC}"

# Kill the app if running (so we can overwrite)
pkill -f "${APP_NAME}" 2>/dev/null || true
sleep 0.5

rm -rf "/Applications/${APP_NAME}.app"
cp -R "$APP_BUNDLE" "/Applications/${APP_NAME}.app"

echo -e "${GREEN}✓ Installed to /Applications/${APP_NAME}.app${NC}"
echo ""
echo -e "${BOLD}  Open the app and grant Screen Recording when prompted.${NC}"
echo -e "${BOLD}  (It will only ask once until the next rebuild)${NC}"
echo ""
