#!/usr/bin/env bash
set -euo pipefail

# Apply Supabase schema/migrations to the linked project
# Usage: ./scripts/apply_schema.sh [project-ref]

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI not found. Install from https://supabase.com/docs/guides/cli"
  exit 1
fi

if [ -n "${1:-}" ]; then
  echo "Pushing schema to project ref: $1"
  supabase db push --project-ref "$1"
else
  echo "Pushing schema to linked project (supabase link must be set)"
  supabase db push
fi

echo "Done."
