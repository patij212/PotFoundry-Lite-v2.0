// s115Table.cjs — post-hoc tables from S115_CROSS_*.json. Read-only; recomputes nothing.
// Usage: node research/tools/s115Table.cjs <path-to-json>
const fs = require('node:fs');
const path = process.argv[2];
const rows = JSON.parse(fs.readFileSync(path, 'utf8'));
const F = ['SLIVER', 'STRADDLE', 'UNDER_RES', 'MIS_ORIENT'];
const pad = (s, n) => String(s).padStart(n);
const padE = (s, n) => String(s).padEnd(n);

console.log('══════════════════════════════════════════════════════════════════════════════════════════════');
console.log('  S115 TABLE 3 — SENSITIVITY OF THE OPERATOR TARGET TO THE CURTAIN CUT R');
console.log('  (CURTAIN is an INSTRUMENT LIMIT, not a mechanism. Raising R admits more of the class to the');
console.log('   analytic ruler. If the dominant mechanism survives the whole ladder it is not an R artefact.)');
console.log('══════════════════════════════════════════════════════════════════════════════════════════════');
console.log('style              R=2     R=4     R=8    R=16    R=32   R=128   | dominant flagged mech at each R');
for (const r of rows) {
  if (r.refused || !r.rLadder) continue;
  const cells = [];
  const doms = [];
  for (const row of r.rLadder) {
    const s = row.shares;
    const flag = F.reduce((a, m) => a + s[m], 0);
    cells.push(pad(flag.toFixed(2), 6));
    const dm = F.reduce((a, m) => (s[m] > s[a] ? m : a), F[0]);
    doms.push(s[dm] > 0 ? dm.slice(0, 4) : '—');
  }
  console.log(`${padE(r.style, 17)} ${cells.join('  ')}   | ${doms.join(' ')}`);
}
console.log('');
console.log('══════════════════════════════════════════════════════════════════════════════════════════════');
console.log('  S115 TABLE 4 — SENSITIVITY OF THE SLIVER SHARE TO THE ALTITUDE CUT A (um)');
console.log('══════════════════════════════════════════════════════════════════════════════════════════════');
console.log('style              A=2um   A=5um  A=10um  A=20um  A=50um   | (SLIVER area% of class)');
for (const r of rows) {
  if (r.refused || !r.aLadder) continue;
  const cells = r.aLadder.map((row) => pad(row.shares.SLIVER.toFixed(2), 6));
  console.log(`${padE(r.style, 17)} ${cells.join('  ')}`);
}
console.log('');
console.log('══════════════════════════════════════════════════════════════════════════════════════════════');
console.log('  S115 TABLE 5 — h SENSITIVITY OF spreadDeg (the STRADDLE/UNDER_RES/MIS_ORIENT discriminator)');
console.log('  *** SCAR 3. A spread that moves with h is not a measurement. ***');
console.log('══════════════════════════════════════════════════════════════════════════════════════════════');
console.log('style             spread p50 @ h=2e-6 / 2e-5 / 2e-4 / 1e-3 / 5e-3      ratio  | normDeg p50 ratio');
for (const r of rows) {
  if (r.refused || !r.hLadder) continue;
  const sp = r.hLadder.map((x) => x.spP50);
  const nd = r.hLadder.map((x) => x.ndP50);
  const rat = Math.max(...sp) / Math.max(1e-12, Math.min(...sp));
  const ratN = Math.max(...nd) / Math.max(1e-12, Math.min(...nd));
  console.log(`${padE(r.style, 17)} ${sp.map((v) => pad(v.toFixed(3), 8)).join(' /')}   x${pad(rat.toFixed(2), 6)}  | x${ratN.toFixed(3)}`);
}
console.log('');
console.log('══════════════════════════════════════════════════════════════════════════════════════════════');
console.log('  S115 TABLE 6 — THE INVERTED CENSUS, WITH ITS DECISIVENESS');
console.log('  signMargin = |f . n_S(centroid)| under the OUTWARD convention. Near 0 = the facet is nearly');
console.log('  EDGE-ON to the surface and "inverted" is a hair-breadth call (the S98 scar).');
console.log('══════════════════════════════════════════════════════════════════════════════════════════════');
console.log('style             whole-mesh INV cnt%  whole-mesh INV AREA%  signMargin p50   class INV cnt%  class INV AREA%');
for (const r of rows) {
  if (r.refused || r.invWholeAreaPct === undefined) continue;
  console.log(`${padE(r.style, 17)} ${pad((r.invWholeCntPct ?? 0).toFixed(4), 18)}  ${pad((r.invWholeAreaPct ?? 0).toFixed(4), 20)}  ${pad(r.invWholeMarginP50 === null || r.invWholeMarginP50 === undefined ? 'n/a' : r.invWholeMarginP50.toFixed(4), 14)}   ${pad((r.invClassCntPct ?? 0).toFixed(4), 14)}  ${pad((r.invClassAreaPct ?? 0).toFixed(4), 15)}`);
}
console.log('');
console.log('══════════════════════════════════════════════════════════════════════════════════════════════');
console.log('  S115 TABLE 7 — CLASS SIZE vs THE VISIBILITY BAR (45 deg is a CONVENTION, never validated)');
console.log('══════════════════════════════════════════════════════════════════════════════════════════════');
console.log('style             AREA% of mesh over  30 /  45 /  60 /  90 / 120 deg');
for (const r of rows) {
  if (r.refused || !r.visLadder) continue;
  console.log(`${padE(r.style, 17)} ${r.visLadder.map((x) => pad(x.areaPct.toFixed(4), 9)).join(' /')}`);
}
