#!/usr/bin/env bash
# Install the Movie Manager native messaging host.
# Prerequisites: Python 3, Chrome or Edge browser installed.
# Usage: ./setup/init-native-helper.sh [chrome|edge]
#
# This script:
#   1. Copies the native host manifest to the browser's NativeMessagingHosts dir
#   2. Sets up the config.json with allowedRoots
#   3. Optionally installs the Python helper or C binary

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HELPER_DIR="$ROOT_DIR/native-helper"
BROWSER="${1:-chrome}"

if [ ! -f "$HELPER_DIR/install_native_host.py" ]; then
  echo "Error: install_native_host.py not found in native-helper/"
  exit 1
fi

echo "=== Native Messaging Host Setup ==="
echo ""
echo "Browser: $BROWSER"
echo "Helper directory: $HELPER_DIR"
echo ""

echo "Running installer..."
python3 "$HELPER_DIR/install_native_host.py" --browser "$BROWSER"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Copy or edit $HELPER_DIR/config.json (or create it from config.example.json)"
echo "  2. Add your video directories to 'allowedRoots' in config.json"
echo "  3. Set the 'player' field (e.g., 'iina', 'vlc', 'potplayer')"
echo "  4. Test: open the Chrome extension and use 'Open Local File'"
