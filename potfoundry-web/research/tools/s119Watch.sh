#!/usr/bin/env bash
# s119Watch.sh — emit one line per S119 rung as its run.json appears. Monitor front-end.
cd "$(dirname "$0")/../exchange/_strataConformBisect" || exit 1
SEEN=" "
for i in $(seq 1 120); do
  for f in celtictriquetra_ring_D--H_S119CTA2X celtictriquetra_ring_D--H_S119CTA4X \
           gothicarches_ring_DS-HT_S119GO2X gothicarches_ring_DS-HT_S119GO4X \
           gothicarches_ring_DS-HT_S119GO05X gothicarches_ring_DS-HT_S119GO025X; do
    if [ -f "$f.run.json" ]; then
      case "$SEEN" in
        *" $f "*) ;;
        *) echo "LANDED $f  $(node -e "const j=require('./$f.run.json');process.stdout.write('nTri '+j.nTri+' alloc '+j.alloc+' acc '+j.acceptTolMm+' capped '+j.capped+' secs '+j.secs.toFixed(0))")"
           SEEN="$SEEN$f " ;;
      esac
    fi
  done
  sleep 60
done
echo "WATCH WINDOW ENDED"
