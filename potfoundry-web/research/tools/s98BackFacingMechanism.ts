// s98BackFacingMechanism.ts — WHAT MAKES A BUCKET-(a) FACET? Step 2 of S98-BF, mechanism with a number.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE EXACT IDENTITY THIS IS BUILT ON — it is not a heuristic, it is the first-order expansion of the
// winding normal of a triangle whose three vertices lie on the radial graph r = rA(th,z).
//
//   Phi(th,z) = (r cos th, r sin th, z),   Phi_th x Phi_z = N_raw = (r cos + r_th sin, r sin - r_th cos, -r r_z)
//
// For a LINEAR map A: R^2 -> R^3 and u,v in R^2,  (Au) x (Av) = (u x v)_z * (A e1 x A e2). Applying it to
// the triangle's two parametric edge vectors u = p1-p0, v = p2-p0:
//
//        f_raw  =  (P1-P0) x (P2-P0)  =  2 * A_param_signed * N_raw(centroid)  +  R
//
// where `A_param_signed` is the SIGNED area of the triangle in the (th, z) plane and R is the remainder
// carrying every second- and higher-order variation of the surface across the footprint (the relief).
//
// So a facet whose vertices are all ON the surface (verified: radial membership MAX 0.031 um) can only be
// back-facing for one of exactly TWO reasons, and they demand different remedies:
//
//   (H4) A_param_signed < 0  — THE PARAMETRIC FOLD. The mesh has literally turned over in its own (th,z)
//        chart. A topological defect of the mesher. Remedy: a winding/orientation repair, which is free
//        and exact (swap two indices).
//   (H5) A_param_signed > 0 but |R| > |2 A_param N_raw| — THE CONDITIONING DEFECT. The leading term has
//        the right sign but is too SMALL to survive the relief remainder, because the triangle is a
//        sliver: A_param -> 0 while R does not. Remedy: kill the sliver (collapse/flip), NOT a re-winding
//        — re-winding such a facet would make it wrong the other way.
//
// `rho = |R| / |2 A_param N_raw|` is the discriminant, and `rho > 1` is the exact condition for the
// remainder to be able to flip the sign. It is DIMENSIONLESS and computable from the mesh alone.
//
// PRE-REGISTERED KILL LINES (written before the run):
//   H4 REFUTED if < 20% of bucket (a) has A_param_signed < 0.
//   H5 REFUTED if rho <= 1 on > 20% of the A_param > 0 subset.
//
// AND THE PREDICTOR MUST BE PRICED, NOT JUST CORRELATED. "bucket (a) facets are slivers" is worthless if
// slivers are common: this tool computes the whole-mesh minAngle marginal and reports P(sliver),
// P(sliver | back-facing) and the RISK RATIO, so the reader can see the precision, not just the recall.
// (The S93 crease-crossing cause was established exactly this way, at risk ratio 74x.)
//
// Usage: bash research/tools/run-s98-mechanism.sh
//   env: PF_S98M_STYLE  PF_S98M_STL  PF_S98M_NDJSON  PF_S98M_TAG  PF_S98M_H/RB/RT  PF_S98M_SLIVER(5)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S98M_STYLE ?? 'GothicArches';
const STL = process.env.PF_S98M_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const NDJSON = process.env.PF_S98M_NDJSON ?? 'research/exchange/_strataConformBisect/s98bf/S98BF_GOTH_S39CTL_FULL_bucketA.ndjson';
const TAG = process.env.PF_S98M_TAG ?? 'GOTH_S39CTL';
const SLIVER = envF('PF_S98M_SLIVER', 5);
const OUTDIR = process.env.PF_S98M_OUT ?? 'research/exchange/_strataConformBisect/s98bf';
const DIMS: StyleDims = { H: envF('PF_S98M_H', 120), Rb: envF('PF_S98M_RB', 40), Rt: envF('PF_S98M_RT', 50), expn: 1 };
const H = DIMS.H;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
log('===== S98-BF STEP 2 — MECHANISM OF THE UNAMBIGUOUS BACK-FACING CLASS =====');
log(`style ${STYLE}   tag ${TAG}   sliver bar minAngle < ${SLIVER} deg`);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

function readStl(path: string): { xyz: Float64Array; nTri: number } {
  const buf = readFileSync(path);
  const nTri = buf.readUInt32LE(80);
  const xyz = new Float64Array(nTri * 9);
  let o = 84;
  for (let t = 0; t < nTri; t += 1) {
    o += 12;
    for (let k = 0; k < 9; k += 1) { xyz[t * 9 + k] = buf.readFloatLE(o); o += 4; }
    o += 2;
  }
  return { xyz, nTri };
}
const M = readStl(STL);
log(`${M.nTri} facets`);

const rows = readFileSync(NDJSON, 'utf8').trim().split('\n').filter((s) => s.length > 0)
  .map((s) => JSON.parse(s) as { tri: number; minAng: number; areaMm2: number; worstDeg: number; z: number; th: number });
log(`bucket (a) records: ${rows.length}  from ${NDJSON}`);

const HARC = 2e-4; const HZ = 2e-4;
/** N_raw = Phi_th x Phi_z, UNNORMALISED, central differences. Its radial component is exactly r > 0. */
function nRaw(th: number, z: number): [number, number, number] {
  const r0 = rA(th, z);
  const hTh = HARC / Math.max(1e-9, Math.abs(r0));
  const rt = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hTh);
  let zLo = z - HZ; let zHi = z + HZ;
  if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * HZ); }
  if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * HZ); }
  const rz = zHi > zLo ? (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo) : 0;
  const c = Math.cos(th); const s = Math.sin(th);
  return [r0 * c + rt * s, r0 * s - rt * c, -r0 * rz];
}

// ── WHOLE-MESH minAngle MARGINAL (no rA — cheap) so the sliver predictor can be PRICED, not just correlated.
const minAngOf = (o: number): number => {
  const x = M.xyz;
  const eab = Math.hypot(x[o + 3] - x[o], x[o + 4] - x[o + 1], x[o + 5] - x[o + 2]);
  const ebc = Math.hypot(x[o + 6] - x[o + 3], x[o + 7] - x[o + 4], x[o + 8] - x[o + 5]);
  const eca = Math.hypot(x[o] - x[o + 6], x[o + 1] - x[o + 7], x[o + 2] - x[o + 8]);
  const es = [eab, ebc, eca].sort((p, r) => p - r);
  return (Math.acos(Math.max(-1, Math.min(1, (es[1] * es[1] + es[2] * es[2] - es[0] * es[0]) / (2 * es[1] * es[2])))) * 180) / Math.PI;
};
let nSliver = 0; let areaSliver = 0; let areaAll = 0;
for (let t = 0; t < M.nTri; t += 1) {
  const o = t * 9;
  const ux = M.xyz[o + 3] - M.xyz[o]; const uy = M.xyz[o + 4] - M.xyz[o + 1]; const uz = M.xyz[o + 5] - M.xyz[o + 2];
  const wx = M.xyz[o + 6] - M.xyz[o]; const wy = M.xyz[o + 7] - M.xyz[o + 1]; const wz = M.xyz[o + 8] - M.xyz[o + 2];
  areaAll += 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (minAngOf(o) < SLIVER) { nSliver += 1; areaSliver += 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx); }
}
const pSliver = nSliver / M.nTri;
log('');
log('── SLIVER MARGINAL (whole mesh, no rA) ──');
log(`  P(minAngle < ${SLIVER} deg) = ${nSliver}/${M.nTri} = ${(100 * pSliver).toFixed(4)}%   (AREA ${(100 * areaSliver / areaAll).toFixed(4)}%)`);

// ── PER-FACET MECHANISM ──────────────────────────────────────────────────────────────────────────────
let nNegParam = 0; let nPosParam = 0; let nRhoGt1 = 0; let nRhoLe1 = 0; let nSliverInA = 0;
let nCentContain = 0;   // bucket (a) facets ALSO caught by the O(1) centroid test — the containment a guard needs
const rhos: number[] = []; const aParams: number[] = []; const leadCos: number[] = [];
const detail: string[] = [];
/** the five candidate normals at (th,z), same 5 rA evals — for the O(1) centroid guard's containment check. */
function bestDotAt(th: number, z: number, fx: number, fy: number, fz: number): number {
  const r0 = rA(th, z);
  const hTh = HARC / Math.max(1e-9, Math.abs(r0));
  const rP = rA(th + hTh, z); const rM = rA(th - hTh, z);
  let zLo = z - HZ; let zHi = z + HZ;
  if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * HZ); }
  if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * HZ); }
  const rZp = rA(th, zHi); const rZm = rA(th, zLo);
  const dz = zHi - zLo;
  const rzF = dz > 0 ? (rZp - r0) / Math.max(1e-300, zHi - z) : 0;
  const rzB = dz > 0 ? (r0 - rZm) / Math.max(1e-300, z - zLo) : 0;
  const rzC = dz > 0 ? (rZp - rZm) / dz : 0;
  const rtF = (rP - r0) / hTh; const rtB = (r0 - rM) / hTh; const rtC = (rP - rM) / (2 * hTh);
  const c = Math.cos(th); const s = Math.sin(th);
  const pair = [rtC, rzC, rtF, rzF, rtF, rzB, rtB, rzF, rtB, rzB];
  let best = -1;
  for (let q = 0; q < 5; q += 1) {
    const rt = pair[2 * q]; const rz = pair[2 * q + 1];
    const nx = rt * s + r0 * c; const ny = r0 * s - rt * c; const nz = -r0 * rz;
    const L = Math.hypot(nx, ny, nz);
    if (!(L > 0)) continue;
    const d = (fx * nx + fy * ny + fz * nz) / L;
    if (d > best) best = d;
  }
  return best;
}
for (const rw of rows) {
  const o = rw.tri * 9;
  const ax = M.xyz[o]; const ay = M.xyz[o + 1]; const az = M.xyz[o + 2];
  const bx = M.xyz[o + 3]; const by = M.xyz[o + 4]; const bz = M.xyz[o + 5];
  const cx = M.xyz[o + 6]; const cy = M.xyz[o + 7]; const cz = M.xyz[o + 8];
  const thA = Math.atan2(ay, ax);
  const thB = thA + dThRaw(thA, Math.atan2(by, bx));
  const thC = thA + dThRaw(thA, Math.atan2(cy, cx));
  // SIGNED parametric area in (th, z). Sign convention fixed by the mesh's own global winding, established
  // below from the marginal; here we report the raw sign and reconcile after.
  const Ap = 0.5 * ((thB - thA) * (cz - az) - (bz - az) * (thC - thA));
  const gth = (thA + thB + thC) / 3; const gz = (az + bz + cz) / 3;
  const N = nRaw(gth, gz);
  const fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  const fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const lx = 2 * Ap * N[0]; const ly = 2 * Ap * N[1]; const lz = 2 * Ap * N[2];
  const lLen = Math.hypot(lx, ly, lz);
  const rx = fx - lx; const ry = fy - ly; const rz2 = fz - lz;
  const rho = Math.hypot(rx, ry, rz2) / Math.max(1e-300, lLen);
  const cosLead = (fx * lx + fy * ly + fz * lz) / Math.max(1e-300, Math.hypot(fx, fy, fz) * lLen);
  rhos.push(rho); aParams.push(Ap); leadCos.push(cosLead);
  if (Ap < 0) nNegParam += 1; else nPosParam += 1;
  if (Ap > 0) { if (rho > 1) nRhoGt1 += 1; else nRhoLe1 += 1; }
  if (rw.minAng < SLIVER) nSliverInA += 1;
  {
    const fLen = Math.max(1e-300, Math.hypot(fx, fy, fz));
    if (bestDotAt(gth, gz, fx / fLen, fy / fLen, fz / fLen) < 0) nCentContain += 1;
  }
  if (detail.length < 40) {
    detail.push(`  tri ${String(rw.tri).padStart(8)}  Ap ${Ap.toExponential(3).padStart(11)}  rho ${rho.toFixed(3).padStart(9)}  cos(f,lead) ${cosLead.toFixed(4).padStart(8)}  minAng ${rw.minAng.toFixed(2).padStart(6)}  worst ${rw.worstDeg.toFixed(1).padStart(6)}  z ${rw.z.toFixed(2)}`);
  }
}
const med = (v: number[]): number => (v.length === 0 ? NaN : v.slice().sort((p, r) => p - r)[v.length >> 1]);
const pq = (v: number[], f: number): number => (v.length === 0 ? NaN : v.slice().sort((p, r) => p - r)[Math.min(v.length - 1, Math.floor(f * v.length))]);

log('');
log('── H4 / H5 — THE TWO ADMISSIBLE MECHANISMS ──');
log(`  A_param_signed < 0 (PARAMETRIC FOLD)   : ${nNegParam}/${rows.length} = ${(100 * nNegParam / rows.length).toFixed(2)}%   [H4 kill line: < 20% => REFUTED]`);
log(`  A_param_signed > 0                      : ${nPosParam}/${rows.length} = ${(100 * nPosParam / rows.length).toFixed(2)}%`);
log(`    of those, rho > 1 (REMAINDER CAN FLIP): ${nRhoGt1}/${Math.max(1, nPosParam)} = ${(100 * nRhoGt1 / Math.max(1, nPosParam)).toFixed(2)}%   [H5 kill line: rho<=1 on > 20% => REFUTED]`);
log(`    of those, rho <= 1                    : ${nRhoLe1}/${Math.max(1, nPosParam)} = ${(100 * nRhoLe1 / Math.max(1, nPosParam)).toFixed(2)}%`);
log(`  rho   p10 ${pq(rhos, 0.1).toFixed(3)}  p50 ${med(rhos).toFixed(3)}  p90 ${pq(rhos, 0.9).toFixed(3)}  max ${Math.max(...rhos).toFixed(3)}`);
log(`  cos(f, lead)  p10 ${pq(leadCos, 0.1).toFixed(4)}  p50 ${med(leadCos).toFixed(4)}  p90 ${pq(leadCos, 0.9).toFixed(4)}`);
log('');
log('── THE SLIVER PREDICTOR, PRICED ──');
const pSliverGivenA = nSliverInA / Math.max(1, rows.length);
log(`  P(sliver)              = ${(100 * pSliver).toFixed(4)}%`);
log(`  P(sliver | bucket a)   = ${nSliverInA}/${rows.length} = ${(100 * pSliverGivenA).toFixed(2)}%`);
const rr = (pSliverGivenA / Math.max(1e-12, pSliver)) / Math.max(1e-12, (1 - pSliverGivenA) / Math.max(1e-12, 1 - pSliver));
log(`  RISK RATIO  P(back|sliver)/P(back|non-sliver) = ${rr.toFixed(1)}x`);
log(`  PRECISION of a "collapse every sliver" guard: ${rows.length} defects inside ${nSliver} slivers = ${(100 * rows.length / Math.max(1, nSliver)).toFixed(4)}%`);
log('    ^ THE PRICE. A guard keyed on sliverhood alone would touch that many facets to reach these.');
log('');
log('── THE O(1) CENTROID TEST AS A CANDIDATE GUARD KEY — is bucket (a) CONTAINED in it? ──');
log(`  bucket (a) facets ALSO back-facing at the parametric centroid (best of 5, 5 rA evals): ${nCentContain}/${rows.length} = ${(100 * nCentContain / Math.max(1, rows.length)).toFixed(2)}%`);
log('    RECALL 100% would make the O(1) test a SOUND screen for the 45-point covering verdict; anything less');
log('    means a centroid-keyed guard MISSES defects and must not be sold as complete.');
log('');
log('── SAMPLE (first 40) ──');
for (const d of detail) log(d);
writeFileSync(`${OUTDIR}/S98BF_${TAG}.mechanism.json`, JSON.stringify({
  style: STYLE, tag: TAG, nA: rows.length, nNegParam, nPosParam, nRhoGt1, nRhoLe1,
  nSliver, nTri: M.nTri, pSliver, pSliverGivenA, riskRatio: rr,
  rhoP10: pq(rhos, 0.1), rhoP50: med(rhos), rhoP90: pq(rhos, 0.9),
}, null, 1));
log('');
log(`done [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
