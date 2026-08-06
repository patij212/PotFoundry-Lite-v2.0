// s114qSubBias.cjs — IS MY STRIDED SUBSAMPLE BIASED? The pinned facet list is ordered by EDGE INDEX,
// which is spatially ordered, so a fixed stride can alias against the mesh's own periodicity. This
// compares the FULL-population per-facet spreadDeg (k=8, inset 0.05, straight from the pinned dump)
// against (a) the strided subsample s114Requote uses and (b) a golden-ratio decorrelated one.
// Usage: node research/tools/s114qSubBias.cjs
const fs = require('node:fs');
const NDJ = process.env.PF_S114Q_NDJSON
  || 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const rows = fs.readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
const q = (v, p) => { const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const log = console.log;
const pinF = []; const sp = new Map();
for (const r of rows) {
  if (!sp.has(r.f1)) { sp.set(r.f1, r.spread1); pinF.push(r.f1); }
  if (!sp.has(r.f2)) { sp.set(r.f2, r.spread2); pinF.push(r.f2); }
}
const full = pinF.map((f) => sp.get(f));
log(`FULL population n=${full.length}  spreadDeg(k=8, inset 0.05) p10 ${q(full, 0.1).toFixed(2)} p50 ${q(full, 0.5).toFixed(2)} p90 ${q(full, 0.9).toFixed(2)}`);
const strided = (n) => { const out = []; const st = pinF.length / n; for (let i = 0; i < n; i += 1) out.push(pinF[Math.floor(i * st)]); return out; };
const golden = (n) => {
  const gcd = (x, y) => (y === 0 ? x : gcd(y, x % y));
  let g = Math.max(1, Math.round(pinF.length * 0.6180339887498949) | 1);
  while (g > 1 && gcd(g, pinF.length) !== 1) g += 2;
  const out = []; for (let i = 0; i < n; i += 1) out.push(pinF[(i * g) % pinF.length]);
  return out;
};
for (const n of [80, 350, 1200]) {
  const a = strided(n).map((f) => sp.get(f));
  const b = golden(n).map((f) => sp.get(f));
  log(`  n=${String(n).padStart(4)}  STRIDED p50 ${q(a, 0.5).toFixed(2).padStart(7)} (${(q(a, 0.5) / q(full, 0.5)).toFixed(2)}x full)   GOLDEN p50 ${q(b, 0.5).toFixed(2).padStart(7)} (${(q(b, 0.5) / q(full, 0.5)).toFixed(2)}x full)`);
}
