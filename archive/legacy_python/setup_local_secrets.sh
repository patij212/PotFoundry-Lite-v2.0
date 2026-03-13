#!/usr/bin/env bash
set -euo pipefail
# Helper: create .streamlit/secrets.toml from template
# Usage:
#  SUPABASE_URL="..." SUPABASE_KEY="..." ./scripts/setup_local_secrets.sh

PROJECT_ROOT="$(dirname "$0")/.."
TEMPLATE="$PROJECT_ROOT/.streamlit/secrets.template.toml"
DEST="$PROJECT_ROOT/.streamlit/secrets.toml"

if [ ! -f "$TEMPLATE" ]; then
  echo "Template not found: $TEMPLATE"
  exit 1
fi

cp "$TEMPLATE" "$DEST"

# Use environment variables to replace placeholders if provided
if [ -n "${SUPABASE_URL:-}" ]; then
  sed -i "s|https://YOUR_PROJECT.supabase.co|${SUPABASE_URL}|g" "$DEST"
fi
if [ -n "${SUPABASE_KEY:-}" ]; then
  sed -i "s|REPLACE_WITH_SERVICE_ROLE_KEY|${SUPABASE_KEY}|g" "$DEST" || true
  sed -i "s|REPLACE_WITH_NEW_SERVICE_ROLE_KEY|${SUPABASE_KEY}|g" "$DEST" || true
fi
if [ -n "${SUPABASE_ANON_KEY:-}" ]; then
  # Insert anon key right after 'key =' line inside [connections.supabase]
  sed -i "/^key = /a anon = \"${SUPABASE_ANON_KEY}\"" "$DEST" || true
fi
if [ -n "${SUPABASE_BUCKET:-}" ]; then
  sed -i "s|bucket = \"pots\"|bucket = \"${SUPABASE_BUCKET}\"|g" "$DEST"
fi
if [ -n "${APP_URL:-}" ]; then
  sed -i "s|app_url = \"http://localhost:8501\"|app_url = \"${APP_URL}\"|g" "$DEST"
fi

chmod 600 "$DEST"
echo "Created $DEST (git-ignored). Edit it to verify values if needed."
