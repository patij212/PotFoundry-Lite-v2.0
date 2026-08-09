#!/usr/bin/env bash
# run-s121-c1-regression.sh — S121 TASK C1 item 4: the PROJECT SUITE DELTA, both sides taken by me.
#
#   bash research/tools/run-s121-c1-regression.sh after
#   bash research/tools/run-s121-c1-regression.sh before
#
# The repo's default vitest config includes BOTH 'src/**/*.test.{ts,tsx}' AND 'research/**/*.test.ts'
# (vite.config.ts), so the S121 work IS inside the suite's scope and an absolute failure count proves
# nothing. `before` reconstructs the pre-fix tree — the committed driver out of git, and every test file
# that did not exist at HEAD moved aside — runs the suite, and puts everything back. The restore is
# verified by md5 against a backup taken before the swap; if it does not match, the script says so loudly.
#
# NEVER `git stash` (concurrency hazard). Plain file copies only.
set -uo pipefail
cd "$(dirname "$0")/../.."
MODE="${1:-after}"
OUT=research/exchange/_strataConformBisect/s121
mkdir -p "$OUT"
HOLD=$OUT/_hold
DRV=research/bridge/_strataConformBisectL.test.ts
NEWTESTS="research/bridge/_s121TreadUnit.test.ts research/bridge/_s121SeedUnit.test.ts research/bridge/_s121Tdd.test.ts research/bridge/_c1VerifyBefore.test.ts research/bridge/_s121TreadFix.ts research/bridge/_s121SeedFix.ts"

if [ "$MODE" = "before" ]; then
  mkdir -p "$HOLD"
  cp "$DRV" "$HOLD/_driver_worktree_backup.ts"
  BEFORE_MD5=$(md5sum "$DRV" | awk '{print $1}')
  echo "worktree driver md5 (saved) $BEFORE_MD5"
  git show HEAD:./"$DRV" > "$DRV"
  echo "driver replaced by git HEAD, md5 now $(md5sum "$DRV" | awk '{print $1}')"
  for f in $NEWTESTS; do [ -f "$f" ] && mv "$f" "$HOLD/$(basename "$f")"; done
  echo "moved aside: $(ls -1 "$HOLD" | tr '\n' ' ')"
fi

echo "=== npx vitest run  (MODE=$MODE) ==="
t0=$(date +%s)
npx vitest run > "$OUT/C1_SUITE_${MODE}.log" 2>&1
RC=$?
echo "vitest exit $RC   wall $(( $(date +%s) - t0 )) s"
grep -aE "^ Test Files |^      Tests |^     Errors |^  Start at |^   Duration " "$OUT/C1_SUITE_${MODE}.log" | tail -8

if [ "$MODE" = "before" ]; then
  for f in $NEWTESTS; do b=$(basename "$f"); [ -f "$HOLD/$b" ] && mv "$HOLD/$b" "$f"; done
  cp "$HOLD/_driver_worktree_backup.ts" "$DRV"
  AFTER_MD5=$(md5sum "$DRV" | awk '{print $1}')
  if [ "$AFTER_MD5" = "$BEFORE_MD5" ]; then echo "RESTORE VERIFIED — driver md5 $AFTER_MD5"; else
    echo "*** RESTORE FAILED — driver md5 $AFTER_MD5 != $BEFORE_MD5 ***"; fi
  ls -1 research/bridge/_s121*.ts research/bridge/_c1VerifyBefore.test.ts
fi
