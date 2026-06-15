#!/usr/bin/env bash
# Initialize a local Supabase instance for development.
# Prerequisites: Docker running, supabase CLI installed.
# Usage: ./setup/init-supabase.sh
#
# This script:
#   1. Checks that Docker and supabase CLI are available
#   2. Starts local Supabase stack
#   3. Pushes schema to the local database

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SUPABASE_DIR="$ROOT_DIR/supabase"

echo "=== Supabase Local Development Setup ==="
echo ""

# Check Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker not found."
  echo "Install from https://www.docker.com/products/docker-desktop"
  exit 1
fi

# Check supabase CLI
if ! command -v supabase >/dev/null 2>&1; then
  echo "Error: supabase CLI not found."
  echo "Install: brew install supabase/tap/supabase"
  echo "Or: npm install -g supabase"
  exit 1
fi

# Check if already linked
if [ -f "$SUPABASE_DIR/.temp/project-ref" ]; then
  PROJECT_REF=$(cat "$SUPABASE_DIR/.temp/project-ref")
  echo "Already linked to project: $PROJECT_REF"
  echo "To re-link: cd supabase && supabase link --project-ref NEW_REF"
else
  echo "Not linked to any project."
  echo "Run: cd supabase && supabase link --project-ref <YOUR_PROJECT_REF>"
  echo ""
  echo "If you already have a linked project, the project-ref file should exist."
  echo "Continuing with local-only mode..."
fi

# Start local supabase
echo ""
echo "Starting local Supabase..."
supabase start

# Apply schema
echo ""
echo "Applying schema to local database..."
supabase db push

echo ""
echo "=== Local Supabase is running ==="
echo ""
echo "  DB:      postgresql://postgres:postgres@127.0.0.1:54322/postgres"
echo "  Studio:  http://localhost:54323"
echo "  API:     http://localhost:54321"
echo "  Realtime: http://localhost:54326"
echo ""
echo "Set these in your Vercel/Node env to use locally:"
echo "  SUPABASE_URL=http://localhost:54321"
echo "  SUPABASE_SERVICE_ROLE_KEY=<your-key>"
echo ""
echo "To stop: supabase stop"
