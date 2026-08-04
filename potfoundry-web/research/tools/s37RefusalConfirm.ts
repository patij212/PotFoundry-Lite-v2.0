// s37RefusalConfirm.ts — ARE THE VETO'S REFUSALS REAL, OR RADIAL CONSERVATISM?
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE QUESTION
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// S36 (commit 4db657d6) ran the certified accept veto and it cost 7.1x the rA evals without
// converging. 248,411 of its 443,491 decisions (56%) refused on a WITNESSED exceedance — i.e.
// `max_lattice distRadial > tol`. But `_facetTruthLib`'s own soundness note says:
//
//     "every candidate-based estimate OVER-estimates d. A PASS is therefore sound however crude the
//      nearest-point search; ONLY A FAIL CAN BE A SEARCH ARTIFACT. That artifact is ruled out by
//      re-measuring the worst facets with `distPerp`."
//
// `distRadial` is the RADIAL foot. On a gothic rib, where dr/dtheta is large, the radial distance
// far exceeds the true PERPENDICULAR distance. So those refusals may be mostly the ruler's own
// conservatism — and they are what bought the 7.1x. This measures what fraction survives.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY `distPerpFrom` AND NOT `distPerp` — a 65x difference, and it is sound in the direction needed
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Full `distPerp` costs ~23,500 rA evals per call, almost all of it the 180x121 GLOBAL SEED SWEEP.
// For a CONFIRM we already hold an excellent seed: the radial foot that produced the refusal. So
// `distPerpFrom` alone is ~360 evals (40 iters x 3 frames x 3 evals).
//
// It converges to a LOCAL closest point, so its answer is >= the true distance — the SAME
// over-estimate direction as distRadial, only much tighter. Therefore:
//     perp <= tol  =>  the true distance is <= tol  =>  THE REFUSAL WAS DEFINITIVELY AN ARTIFACT.
//     perp >  tol  =>  INCONCLUSIVE (could still be a local-minimum artifact) — counted separately
//                      and NEVER reported as a confirmed real exceedance.
// That asymmetry is the whole point: this probe can prove a refusal wrong, and cannot prove one
// right. It is built to answer "how much of the 7.1x was wasted", not "how bad is the mesh".
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ WHAT THIS IS NOT — read before quoting any number
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The 248,411 refusals happened DURING refinement, on facets at many sizes, most of which no longer
// exist in any finished mesh. This probe cannot recover that population without re-running the
// 5,472 s arm. It instead measures the artifact RATE on the CONTROL's FINAL facets, which is the
// right proxy for the same mechanism on the same style and geometry — but it is a DIFFERENT
// POPULATION, and the rate is what transfers, not the count.
//
// Read-only against a finished STL. Nothing here can move a vertex or touch a mesher.
//
// Usage:  bash research/tools/run-s37-refusal-confirm.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { distPerpFrom } from '../bridge/_facetTruthLib';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const REF_HS = 0.03; const REF_NMIN = 12; const REF_NMAX = 64;   // the driver's own lattice levers
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const TOL = envF('PF_S37_TOL_UM', 3.5) / 1000;                   // the driver's acceptTol
const STRIDE = Math.max(1, Math.round(envF('PF_S37_STRIDE', 1)));
const STL = process.env.PF_S37_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S36CTL.stl';

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>;
    advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const rA = buildRadiusFn('GothicArches' as StyleId, { ...registryDefaults('GothicArches') }, DIMS);
const rAc = (th: number, z: number): number => rA(canonTheta(th), z);

log('===== S37 — DO THE VETO\'S REFUSALS SURVIVE A PERPENDICULAR CONFIRM? =====');
const t0 = Date.now();
const { xyz, nTri } = readMeshFloat64(STL, false);
log(`STL ${STL}`);
log(`     ${nTri} triangles   tol ${(TOL * 1000).toFixed(2)} um   stride ${STRIDE}`);

let audited = 0; let blindAccepts = 0; let candidates = 0;
let artifact = 0; let inconclusive = 0;
const radialAtCand: number[] = []; const perpAtCand: number[] = []; const ratio: number[] = [];
let evalsRadial = 0; let evalsPerp = 0;

for (let t = 0; t < nTri; t += STRIDE) {
  const o = t * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  audited += 1;
  // facet plane
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-18) continue;
  nx /= nl; ny /= nl; nz /= nl;
  const le = Math.max(
    Math.hypot(bx - ax, by - ay, bz - az),
    Math.hypot(cx - bx, cy - by, cz - bz),
    Math.hypot(ax - cx, ay - cy, az - cz),
  );
  const n = Math.max(REF_NMIN, Math.min(REF_NMAX, Math.ceil(le / REF_HS)));
  const tha = Math.atan2(ay, ax); const dB = dThRaw(tha, Math.atan2(by, bx));
  const dC = dThRaw(tha, Math.atan2(cy, cx));
  let blind = 0; let radial = 0; let argPx = 0; let argPy = 0; let argPz = 0;
  for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n - i; j += 1) {
    const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
    // (1) THE BLIND READING — transcribed from _sagKernel.sagOfNRaw: the surface point over the
    // facet's PARAMETRIC footprint, measured to the facet's INFINITE PLANE.
    const theta = tha + wb * dB + wc * dC;
    const zz = wa * az + wb * bz + wc * cz;
    const r = rAc(theta, zz); evalsRadial += 1;
    const dPlane = Math.abs((r * Math.cos(theta) - ax) * nx + (r * Math.sin(theta) - ay) * ny + (zz - az) * nz);
    if (dPlane > blind) blind = dPlane;
    // (2) THE RADIAL READING — p ON THE TRIANGLE, distance to the surface point directly outward.
    const px = wa * ax + wb * bx + wc * cx;
    const py = wa * ay + wb * by + wc * cy;
    const pz = wa * az + wb * bz + wc * cz;
    const th2 = Math.atan2(py, px);
    const z2 = pz < 0 ? 0 : pz > H ? H : pz;
    const r2 = rA(th2, z2); evalsRadial += 1;
    const d2 = Math.hypot(px - r2 * Math.cos(th2), py - r2 * Math.sin(th2), pz - z2);
    if (d2 > radial) { radial = d2; argPx = px; argPy = py; argPz = pz; }
  }
  if (blind > TOL) continue;             // the blind ruler already refuses — not a veto-only refusal
  blindAccepts += 1;
  if (radial <= TOL) continue;           // the veto agrees to accept
  candidates += 1;                        // <- this is the S36 "witnessed exceedance" refusal class
  const seedTh = Math.atan2(argPy, argPx);
  const seedZ = argPz < 0 ? 0 : argPz > H ? H : argPz;
  const pr = distPerpFrom(rA, H, argPx, argPy, argPz, seedTh, seedZ);
  evalsPerp += 360;                       // 40 iters x 3 frames x 3 evals, per distPerpFrom's shape
  radialAtCand.push(radial); perpAtCand.push(pr.d);
  if (radial > 0) ratio.push(radial / Math.max(1e-12, pr.d));
  if (pr.d <= TOL) artifact += 1; else inconclusive += 1;
}

const secs = (Date.now() - t0) / 1000;
const pct = (a: number[], f: number): number => a[Math.min(a.length - 1, Math.floor(f * a.length))];
const dist = (nm: string, a: number[], sc: number, u: string): void => {
  if (a.length === 0) { log(`  ${nm.padEnd(26)} (empty)`); return; }
  const s = [...a].sort((x, y) => x - y);
  log(`  ${nm.padEnd(26)} p10 ${(pct(s, 0.1) * sc).toFixed(2).padStart(9)}  p50 ${(pct(s, 0.5) * sc).toFixed(2).padStart(9)}`
    + `  p90 ${(pct(s, 0.9) * sc).toFixed(2).padStart(9)}  max ${(s[s.length - 1] * sc).toFixed(2).padStart(10)} ${u}`);
};

log('');
log(`audited ${audited} facets in ${secs.toFixed(0)}s   (${((evalsRadial + evalsPerp) / 1e6).toFixed(0)} M rA evals: `
  + `${(evalsRadial / 1e6).toFixed(0)} M lattice + ${(evalsPerp / 1e6).toFixed(0)} M perp)`);
log(`  blind ruler ACCEPTS            ${blindAccepts}  (${((100 * blindAccepts) / Math.max(1, audited)).toFixed(1)}% of audited)`);
log(`  of those, veto REFUSES         ${candidates}  (${((100 * candidates) / Math.max(1, blindAccepts)).toFixed(1)}% of blind accepts)`);
log('     ^ this is S36\'s "witnessed exceedance" class, reconstructed on the final mesh');
log('');
log('══════════════════════════ THE ANSWER ══════════════════════════');
if (candidates === 0) log('  no candidates — nothing to confirm.');
else {
  log(`  *** ARTIFACT (perp <= tol, refusal DISPROVEN) : ${artifact}`
    + `  = ${((100 * artifact) / candidates).toFixed(1)}% ***`);
  log(`      inconclusive (perp > tol, NOT proven real) : ${inconclusive}`
    + `  = ${((100 * inconclusive) / candidates).toFixed(1)}%`);
  log('');
  dist('radial reading', radialAtCand, 1000, 'um');
  dist('perp reading (same point)', perpAtCand, 1000, 'um');
  dist('radial / perp over-read', ratio, 1, 'x');
}
log('');
log('READ IT LIKE THIS:');
log('  artifact HIGH  => the 7.1x was largely wasted on the ruler\'s own conservatism. The refuse path');
log('    needs the perp confirm, and the open question becomes only whether THAT is affordable.');
log('  artifact LOW   => the blind ruler really is passing this much bad geometry, and ~7x is close to');
log('    what soundness genuinely costs inside the loop. Then the honest move is to stop trying to make');
log('    the driver sound and put the certificate in the pipeline instead.');
log('  NOTE the asymmetry: "inconclusive" is NOT "real". distPerpFrom is a local search and still');
log('    over-estimates, so a survivor may yet be an artifact a global distPerp would kill.');
