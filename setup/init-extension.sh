#!/usr/bin/env bash
# Quick instructions for loading the Movie Manager extension in Chrome/Edge.
# Usage: ./setup/init-extension.sh [chrome|edge]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BROWSER="${1:-chrome}"
EXT_DIR="$ROOT_DIR/extension"

echo "=== Movie Manager Extension Setup ==="
echo ""
echo "Browser: $BROWSER"
echo "Extension directory: $EXT_DIR"
echo ""

if [ "$BROWSER" = "chrome" ]; then
  URL="chrome://extensions"
elif [ "$BROWSER" = "edge" ]; then
  URL="edge://extensions"
else
  echo "Unknown browser: $BROWSER. Use chrome or edge."
  exit 1
fi

echo "Steps:"
echo "  1. Open $URL"
echo "  2. Enable 'Developer mode'"
echo "  3. Click 'Load unpacked'"
echo "  4. Select the directory: $EXT_DIR"
echo "  5. Extension should appear with icon in toolbar"
echo ""
echo "Done."
