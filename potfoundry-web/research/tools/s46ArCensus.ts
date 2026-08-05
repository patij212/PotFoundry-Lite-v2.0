// s46ArCensus.ts — WHAT DOES RAISING THE AR CAP ACTUALLY COST, ON THE CENSUS'S OWN THRESHOLD?
//
// The S40 sweep moved the driver's headline max 47.282 -> 10.830 um by raising PF_CB_SHAPE_AR from
// 50 to 90, at 0.25% FEWER triangles and 9% LESS wall. That is the benefit. This is the price.
//
// THE PRICE IS NOT THE ARM'S OWN CAP. Each arm reports "facets over the cap" against ITS OWN cap, so
// a cap-90 arm reporting 1 offender says nothing about what the BLADE GATE will count — that gate is
// `_bladeCensus.mjs`'s definition, AR > 50, fixed, and it is where the 50 default came from in the
// first place ("the loosest cap that zeroes the census"). So every mesh is scored here at the SAME
// fixed thresholds, and the AR metric is `_shapeGuard.aspect3` — the guard's own function, which is
// also the offline census's AR3, so guard and instrument measure the same object.
//
// Reported as a distribution rather than one number, because "how many blades" and "how bad is the
// worst" are different questions and the 50 default was chosen on the first while the campaign's
// FAIL is driven by the second.
//
// Read-only over finished STLs.
//
// Usage:  bash research/tools/run-s46-ar-census.sh [TAG ...]
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { aspect3 } from '../bridge/_shapeGuard';

// eslint-disable-next-line no-console
const log = console.log;
const TAGS = (process.env.PF_S46_TAGS ?? 'S39CTL,S40AR55,S40AR65,S40AR90').split(',');
const BASE = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_';
const BARS = [50, 65, 90, 120, 200];

log('===== S46 — AR CENSUS AT FIXED THRESHOLDS. The price of raising the split-guard cap. =====');
log('AR = _shapeGuard.aspect3 = longestEdge * perimeter / (4 * area), on the SHIPPED f32 coordinates.');
log('The blade gate counts AR > 50 and that threshold does NOT move with the driver\'s cap.');
log('');
const hdr = `${'arm'.padEnd(9)} ${'tris'.padStart(9)} ${'p50'.padStart(6)} ${'p90'.padStart(7)} ${'p99'.padStart(8)} ${'p99.9'.padStart(9)} ${'MAX'.padStart(9)}  ${BARS.map((b) => `>${b}`.padStart(8)).join(' ')}`;
log(hdr);
log('-'.repeat(hdr.length));
for (const tag of TAGS) {
  let mesh;
  try { mesh = readMeshFloat64(`${BASE}${tag}.stl`, false); } catch { log(`${tag.padEnd(9)} (no STL)`); continue; }
  const { xyz, nTri } = mesh;
  const ar = new Float64Array(nTri);
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    ar[t] = aspect3(xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8]);
  }
  const s = Array.from(ar).sort((a, b) => a - b);
  const q = (p: number): number => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  let mx = 0; for (let i = 0; i < ar.length; i += 1) if (Number.isFinite(ar[i]) && ar[i] > mx) mx = ar[i];
  const counts = BARS.map((b) => {
    let n = 0; for (let i = 0; i < ar.length; i += 1) if (ar[i] > b) n += 1; return n;
  });
  log(`${tag.padEnd(9)} ${String(nTri).padStart(9)} ${q(0.5).toFixed(2).padStart(6)} ${q(0.9).toFixed(2).padStart(7)} ${q(0.99).toFixed(2).padStart(8)} ${q(0.999).toFixed(2).padStart(9)} ${mx.toFixed(1).padStart(9)}  ${counts.map((c) => String(c).padStart(8)).join(' ')}`);
}
log('');
log('READ IT AS: the `>50` column is what the BLADE GATE will count, and it is the whole cost of the');
log('lever. Everything left of it is the bulk shape quality, which is what the cap was chosen to');
log('protect — if p90/p99 do not move, the loosening is reaching only the facets that needed it.');
