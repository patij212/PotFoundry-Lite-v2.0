#!/usr/bin/env bash
set -euo pipefail

err=0
pattern='srv-[A-Za-z0-9_-]{20,}'

for file in "$@"; do
  # Skip binary files quickly
  if file "$file" | grep -qi 'binary'; then
    continue
  fi
  if grep -HnE "$pattern" "$file" >/dev/null 2>&1; then
    echo "ERROR: Possible Supabase service_role key found in: $file" >&2
    grep -HnE "$pattern" "$file" >&2 || true
    err=1
  fi
done

if [[ $err -ne 0 ]]; then
  cat >&2 <<'EOM'
Refusing commit containing a string that looks like a Supabase service_role key (srv-...).
Actions:
  1. Remove the secret from the file (or replace with placeholder).
  2. Rotate the key in Supabase if it was real.
  3. Re-run the commit.
If this is a false positive, adjust the pattern in scripts/precommit_forbid_service_role.sh.
EOM
  exit 1
fi
exit 0
