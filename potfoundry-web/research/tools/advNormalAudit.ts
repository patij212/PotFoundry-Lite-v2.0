// s50AdvNormal.ts — ADVERSARIAL AUDIT OF s49BackFacing: is the orientation number an instrument or an
// artefact? Scores the SAME shipped STLs with the campaign's OWN extrinsic instrument
// (`_judgeNormal.facetNormalCensus`) beside s49's re-derivation, in ONE pass, so the two are directly
// attributable rather than merely different.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY. s49BackFacing.ts re-codes an instrument this repo already owns, and drops BOTH of the
// corrections `_judgeNormal` was given on 2026-07-30 after they were MEASURED to be necessary:
//   (a) FIVE candidate analytic normals (central + the four one-sided difference pairs), max-dot —
//       s49 takes the central difference only. At a crease the central difference belongs to NEITHER
//       flank.
//   (b) THE FOOTPRINT TEST. `_judgeNormal` only calls a facet back-facing when it is back-facing at
//       the centroid AND at all three vertex parameter points. Its header records the measurement
//       that forced this: the centroid-only >=90 count GROWS with refinement (1,792 @ 61k tris ->
//       14,890 @ 351k, folds and blades both 0) because it is dominated by chords across steep C1
//       walls — a 1-D locus population that scales ~1/h. A centroid-only count therefore rises when
//       the mesh gets BETTER, which makes it unusable as a cross-arm comparison, which is exactly
//       what s49 uses it for.
// s49 also evaluates at theta = atan2(centroid_y, centroid_x) — the CARTESIAN centroid's angle —
// while the judge uses the PARAMETRIC centroid tA + (dB+dC)/3. On a facet chording a deep rib the
// two are not the same point.
//
// AND TWO INDEPENDENT MECHANISM COLUMNS THAT NEED NO ANALYTIC NORMAL AT ALL:
//   * PARAMETRIC FOLD: sign of the (theta,z) signed area against the mesh majority. A genuine
//     winding/topology flip shows here. Zero rA evals, no surface model, nothing to be wrong about.
//   * RADIAL PROXY: facet normal . rhat < 0 (the D51 census's crude proxy).
// For r = rA(theta,z) the analytic normal has radial component EXACTLY r > 0 everywhere, so a facet
// that is genuinely turned inward must also fail the radial proxy. The two columns bracket the claim.
//
// Read-only over finished STLs. Single-threaded.
//
// Usage:  PF_S50_TAGS=S39CTL,S40AR90 bash research/tools/run-s50-adv-normal.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { facetNormalCensus } from '../bridge/_judgeNormal';
import { detectZJumps, detectThetaJumps } from '../bridge/_facetTruthLib';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { canonTheta } from '../bridge/_sweepPredicate';
import type { StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TWO_PI = 2 * Math.PI;
const TAGS = (process.env.PF_S50_TAGS ?? 'S39CTL,S40AR65,S40AR90,S48CAV90,S48ADM90').split(',');
const BASE = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_';

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
const PARAMS = registryDefaults('GothicArches');
const { rA } = buildAuditRadiusFn('GothicArches', PARAMS, DIMS, H);

function dTh(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}

/** s49's normal, VERBATIM: central difference only, theta from the CARTESIAN centroid. */
function s49Normal(th: number, z: number, hTh: number, hZ: number): [number, number, number] {
  const r = rA(th, z);
  const rTh = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hTh);
  const rZ = (rA(th, Math.min(H, z + hZ)) - rA(th, Math.max(0, z - hZ))) / (2 * hZ);
  const ct = Math.cos(th); const st = Math.sin(th);
  const ax = rTh * ct - r * st; const ay = rTh * st + r * ct; const az = 0;
  const bx = rZ * ct; const by = rZ * st; const bz = 1;
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

log('===== S50 — ADVERSARIAL AUDIT OF THE ORIENTATION CLAIM =====');
log('Same STLs, same surface (buildAuditRadiusFn), three instruments side by side.');
const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
log(`C0 loci detected on this surface: zJumps ${zJ.length}, thetaJumps ${thJ.length}  (0/0 ⇒ nothing is excluded from the judge's gate)`);
log('');

const hdr = `${'arm'.padEnd(10)} ${'tris'.padStart(9)} | ${'s49 cos<0'.padStart(10)} | ${'judge>=90'.padStart(10)} ${'TRUE back'.padStart(10)} ${'featSpan'.padStart(9)} | ${'PARAM FOLD'.padStart(11)} ${'n.rhat<0'.padStart(9)} | ${'degMax'.padStart(8)} ${'degP99'.padStart(8)}`;
log(hdr); log('-'.repeat(hdr.length));

for (const tag of TAGS) {
  let mesh;
  try { mesh = readMeshFloat64(`${BASE}${tag}.stl`, false); } catch { log(`${tag.padEnd(10)} (no STL)`); continue; }
  const { xyz, nTri } = mesh;

  // ── the campaign's own instrument ──
  const nc = facetNormalCensus(rA, xyz, nTri, { H, zJumps: zJ, thJumps: thJ, nWorst: 8 });

  // ── s49's metric + the two rA-free mechanism columns, one pass ──
  let s49back = 0; let s49min = 1;
  let foldNeg = 0; let foldPos = 0; let radialNeg = 0;
  const foldSign = new Int8Array(nTri);
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
    const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
    const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
    let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const fl = Math.hypot(fx, fy, fz); if (!(fl > 0)) continue;
    fx /= fl; fy /= fl; fz /= fl;
    // (1) PARAMETRIC FOLD — pure combinatorics on (theta,z), no surface model
    const tA = Math.atan2(ay, ax);
    const dB = dTh(tA, Math.atan2(by, bx)); const dC = dTh(tA, Math.atan2(cy, cx));
    const sA = dB * (cz - az) - dC * (bz - az);
    foldSign[t] = sA > 0 ? 1 : sA < 0 ? -1 : 0;
    if (sA > 0) foldPos += 1; else if (sA < 0) foldNeg += 1;
    // (2) RADIAL PROXY at the Cartesian centroid
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3; const gz = (az + bz + cz) / 3;
    const gr = Math.hypot(gx, gy);
    if (gr > 0 && (fx * gx + fy * gy) / gr < 0) radialNeg += 1;
    // (3) s49, verbatim (coarse step, its headline row)
    const [nx, ny, nz] = s49Normal(canonTheta(Math.atan2(gy, gx)), gz, 1e-4, 1e-3);
    const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
    const c = (nx * fx + ny * fy + nz * fz) / nl;
    if (c < 0) s49back += 1;
    if (c < s49min) s49min = c;
  }
  const foldMinority = Math.min(foldPos, foldNeg);
  log(`${tag.padEnd(10)} ${String(nTri).padStart(9)} | ${String(s49back).padStart(10)} | ${String(nc.over90).padStart(10)} ${String(nc.nBackFacing).padStart(10)} ${String(nc.nFeatureSpanBack).padStart(9)} | ${String(foldMinority).padStart(11)} ${String(radialNeg).padStart(9)} | ${nc.degMax.toFixed(3).padStart(8)} ${nc.degP99.toFixed(3).padStart(8)}`);
  log(`${''.padEnd(10)} ${''.padStart(9)} | s49 minCos ${s49min.toFixed(4)}   judge wind ${nc.windSign > 0 ? 'OUTWARD' : nc.windSign < 0 ? 'INWARD' : 'AMBIGUOUS'} (${(100 * nc.windAgreeFrac).toFixed(1)}%)   degenerate ${nc.nDegenerate}   onLocus ${nc.nOnLocus}   ${(nc.rEvals / 1e6).toFixed(1)}M evals ${nc.secs.toFixed(1)}s`);
  log(`${''.padEnd(10)} ${''.padStart(9)} | judge ladder  >=15 ${nc.over15}  >=30 ${nc.over30}  >=45 ${nc.over45}  >=60 ${nc.over60}  >=90 ${nc.over90}  >=120 ${nc.over120}  >=150 ${nc.over150}`);
}

log('');
log('COLUMNS:');
log('  s49 cos<0   = s49BackFacing.ts, verbatim: CENTROID ONLY, CENTRAL DIFFERENCE ONLY, theta from atan2 of the CARTESIAN centroid.');
log('  judge>=90   = _judgeNormal centroid deviation >= 90 deg against the MOST FAVOURABLE of five candidate normals.');
log('  TRUE back   = _judgeNormal GATE: >=90 at the centroid AND at all three vertex parameter points (nBackFacing).');
log('  featSpan    = >=90 at the centroid but front-facing at one of its own vertices — a chord across a steep C1 wall.');
log('                _judgeNormal MEASURED that this population GROWS with refinement (1,792 @61k -> 14,890 @351k tris).');
log('  PARAM FOLD  = facets whose (theta,z) signed area disagrees with the mesh majority. A genuine winding flip. NO rA evals.');
log('  n.rhat<0    = the D51 crude proxy. The analytic normal of r=rA(th,z) has radial component EXACTLY r>0 everywhere,');
log('                so a facet that is truly turned inward MUST also appear here.');
