#!/usr/bin/env bash
# s120-watch.sh — emit one line per state change while the S120 arms run. Watch only, no side effects.
cd "$(dirname "$0")/../.."
D=research/exchange/_strataConformBisect/s120
last=""
for i in $(seq 1 400); do
  b=$(grep -c "vitest exit" "$D/BYTEID_CT.txt" 2>/dev/null || true)
  m=$(grep -c "MD5" "$D/BYTEID_CT.txt" 2>/dev/null || true)
  c=$(wc -l < "$D/lineage/CelticTriquetra_S120CTL1.log" 2>/dev/null || echo 0)
  g=$(wc -l < "$D/lineage/GothicArches_S120GOR1.log" 2>/dev/null || echo 0)
  cur="byteid_arms=$b md5=$m ct_lines=$c goth_lines=$g"
  if [ "$cur" != "$last" ]; then echo "$cur"; last="$cur"; fi
  if [ "${m:-0}" -ge 1 ] && [ "${c:-0}" -gt 100 ]; then echo "DONE byteid+CT"; exit 0; fi
  sleep 45
done
echo "WATCH TIMEOUT"
