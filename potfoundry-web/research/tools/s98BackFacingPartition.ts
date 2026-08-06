// s98BackFacingPartition.ts — IS THE BACK-FACING CLASS A DEFECT, OR AN ARTEFACT OF THE CENSUS?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CLAIM UNDER TEST. S97 (`S97_FOLD_CLASS.report.txt`, commit 05e61f5c) reports on Gothic S39CTL:
// "BACK-FACING (normDeg > 90): 305/60,000 facets = 0.24338% of sampled AREA, max normDeg 174.68",
// measured by `orientOfFacet(..., {k:8, inset:0.02, orient:'outward'})` with `ns = fdNormalsCentral`.
//
// TWO STRUCTURAL PROBLEMS WITH THAT AS A BACK-FACING CENSUS, BOTH VISIBLE BY READING THE RULER:
//
//  (P1) `orient:'outward'` DISCARDS THE WINDING — the only thing a renderer uses. In that mode the ruler
//       computes d = f_winding . n_S(centroid) and, IF d < 0, REPLACES f WITH -f. So a facet whose STL
//       winding genuinely points into the solid is silently re-oriented outward and then scored, after
//       which angle(f, n_S(centroid)) <= 90 deg BY CONSTRUCTION. `normDeg > 90` can therefore only mean
//       "somewhere ELSE in the footprint the surface normal turned more than 90 deg away from the
//       outward-aligned facet plane". It is a SURFACE-TURN detector, not an inversion detector — and a
//       genuinely inverted facet on a smooth patch reads normDeg ~ 0 and is INVISIBLE to it.
//
//  (P2) `fdNormalsCentral` is the CENTRAL difference, which orientRuler's own header states returns the
//       AVERAGE of the two one-sided normals at a C0 crease — a normal belonging to neither flank.
//       `_judgeNormal` was given the five-candidate fix on 2026-07-30 after it was measured necessary.
//
// AND THE SIGN CONVENTION IS NOT AMBIGUOUS THE WAY THE FOLKLORE SAYS. For a radial graph r = rA(th,z),
//      N = (r cos th + r_th sin th,  r sin th - r_th cos th,  -r*r_z)   =>   N . rhat = r > 0 IDENTICALLY,
// for every r_th, every r_z, every cavity, every undercut. There is no deep-cavity sign ambiguity in the
// SURFACE. The only ambiguity is WHICH POINT OF THE FOOTPRINT YOU ASK. That is what this tool partitions.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE INSTRUMENT. One pass. Same covering as S97 (k=8, inset=0.02 => 45 lattice points/facet), same 5 rA
// evaluations per lattice point — but those 5 evals yield FIVE candidate normals (central + the four
// one-sided combinations) instead of one, at zero extra rA cost. Per lattice point p:
//
//      bestDot(p) = max over the 5 candidates of ( f_WINDING . n_j(p) )
//
// `bestDot(p) < 0` == "under NO defensible one-sided surface normal at p is this facet front-facing".
// That is the most-favourable-to-the-mesh test, which is the only safe bias for a gate.
//
//   nBack = #{ p in the 45 : bestDot(p) < 0 }
//     (a) UNAMBIGUOUS  nBack == 45   back-facing over its WHOLE footprint under EVERY admissible normal
//     (b) STRADDLE     1..44         front-facing on part of itself, back-facing on the rest
//     (c) FRONT-FACING nBack == 0    not back-facing anywhere — a false positive of the S97 census
//
// The S97 quantity is computed IN THE SAME LOOP from candidate 0 (the central one) under `outward`, so the
// cross-tabulation is on the same facets with the same lattice and the reproduction is exact-or-bust.
//
// NON-VACUITY, checked before anything here is believed:
//   1. On the same 60,000-facet golden sample the S97 column must print 305 folded / max 174.68.
//   2. RADIAL-GRAPH MEMBERSHIP: max | hypot(x,y) - rA(th,z) | over vertices ~ 0. Proves the style params
//      match the artefact AND that the mesh is a radial graph (which is what licenses N.rhat = r > 0).
//   3. GLOBAL WIND SIGN must be OUTWARD, else "back-facing" is a mesh-wide convention, not a defect.
//
// Usage: bash research/tools/run-s98-backfacing.sh
//   env: PF_S98BF_STYLE  PF_S98BF_STL  PF_S98BF_TAG  PF_S98BF_N(0 = FULL MESH)  PF_S98BF_K(8)
//        PF_S98BF_INSET(0.02)  PF_S98BF_H/RB/RT   PF_S98BF_OUT(dir)   PF_S98BF_MAXDUMP(20000)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S98BF_STYLE ?? 'GothicArches';
const STL = process.env.PF_S98BF_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S98BF_TAG ?? 'GOTH_S39CTL';
const NSAMP = Math.round(envF('PF_S98BF_N', 0));          // 0 = full mesh
const K = Math.round(envF('PF_S98BF_K', 8));
const INSET = envF('PF_S98BF_INSET', 0.02);
const MAXDUMP = Math.round(envF('PF_S98BF_MAXDUMP', 20000));
const OUTDIR = process.env.PF_S98BF_OUT ?? 'research/exchange/_strataConformBisect/s98bf';
const DIMS: StyleDims = { H: envF('PF_S98BF_H', 120), Rb: envF('PF_S98BF_RB', 40), Rt: envF('PF_S98BF_RT', 50), expn: 1 };
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

const T0 = Date.now();
const el = (): string => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
mkdirSync(OUTDIR, { recursive: true });
log('===== S98-BF — BACK-FACING: UNAMBIGUOUS DEFECT vs STRADDLE vs FALSE POSITIVE =====');
log(`style ${STYLE}   tag ${TAG}   covering k=${K} inset=${INSET} (${((K + 1) * (K + 2)) / 2} pts/facet)`);
log(`stl ${STL}`);
log(`dims H=${DIMS.H} Rb=${DIMS.Rb} Rt=${DIMS.Rt}`);

const params = registryDefaults(STYLE);
log(`params ${JSON.stringify(params)}`);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...params }, DIMS);
let RA_EVALS = 0;
const rA = (th: number, z: number): number => {
  RA_EVALS += 1;
  return rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
};

// ── STL reader that ALSO keeps the stored f32 normal. `readMeshFloat64` skips it (o += 12), and the
// stored normal is what some renderers light with, so a disagreement between it and the winding is its own
// defect class and must be measured rather than assumed away.
function readStl(path: string): { xyz: Float64Array; nrm: Float64Array; nTri: number } {
  const buf = readFileSync(path);
  if (buf.length < 84) throw new Error(`STL too short: ${path}`);
  const nTri = buf.readUInt32LE(80);
  if (buf.length !== 84 + nTri * 50) throw new Error(`STL size mismatch: ${buf.length} != 84 + ${nTri}*50`);
  const xyz = new Float64Array(nTri * 9);
  const nrm = new Float64Array(nTri * 3);
  let o = 84;
  for (let t = 0; t < nTri; t += 1) {
    for (let k = 0; k < 3; k += 1) { nrm[t * 3 + k] = buf.readFloatLE(o); o += 4; }
    for (let k = 0; k < 9; k += 1) { xyz[t * 9 + k] = buf.readFloatLE(o); o += 4; }
    o += 2;
  }
  return { xyz, nrm, nTri };
}

const M = readStl(STL);
log(`${M.nTri} facets read   [${el()}]`);

// ── the sample. Golden-ratio stride, the campaign's own construction (verbatim from s92FlipCoveringRescore
// so the S97 reproduction is on the IDENTICAL facet set).
function goldenIdx(n: number, count: number): Int32Array {
  let s = Math.round(n * 0.6180339887);
  if (s % 2 === 0) s += 1;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  while (gcd(s, n) !== 1) s += 2;
  const out = new Int32Array(Math.min(count, n));
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % n;
  return out;
}
const idx = NSAMP > 0 ? goldenIdx(M.nTri, NSAMP) : null;
const nScore = idx === null ? M.nTri : idx.length;
log(idx === null ? `scoring the FULL MESH (${nScore} facets)` : `sample ${nScore} facets (${((100 * nScore) / M.nTri).toFixed(3)}%), golden stride`);

// ── THE FIVE-CANDIDATE SAMPLER. Same 5 rA evals `fdNormalsCentral` spends; candidate 0 IS the central
// difference (so the S97 column is bit-comparable), candidates 1..4 are the one-sided combinations.
// The z window is SHIFTED inward at the domain ends exactly as orientRuler.fdNormals does, so the step is
// always 2*hZ and one ruler runs everywhere (orientRuler defect (4)).
const HARC = 2e-4; const HZ = 2e-4;
const cand = new Float64Array(15);
let lastRTh = 0; let lastRZ = 0; let lastR0 = 0;
function fiveNormals(th: number, z: number): void {
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
  const rtF = (rP - r0) / hTh;
  const rtB = (r0 - rM) / hTh;
  const rtC = (rP - rM) / (2 * hTh);
  const c = Math.cos(th); const s = Math.sin(th);
  const pair = [rtC, rzC, rtF, rzF, rtF, rzB, rtB, rzF, rtB, rzB];
  for (let q = 0; q < 5; q += 1) {
    const rt = pair[2 * q]; const rz = pair[2 * q + 1];
    let nx = rt * s + r0 * c; let ny = r0 * s - rt * c; let nz = -r0 * rz;
    const L = Math.hypot(nx, ny, nz);
    if (L > 0) { nx /= L; ny /= L; nz /= L; } else { nx = c; ny = s; nz = 0; }
    cand[3 * q] = nx; cand[3 * q + 1] = ny; cand[3 * q + 2] = nz;
  }
  lastRTh = rtC; lastRZ = rzC; lastR0 = r0;
}

// ── GLOBAL WIND SIGN (non-vacuity 3). A mesh that winds inward globally must be DETECTED, not reported as
// 100% back-facing.
{
  const ws = Math.min(M.nTri, 8192);
  let pos = 0; let tot = 0;
  const st = Math.max(1, Math.floor(M.nTri / ws));
  for (let t = 0; t < M.nTri; t += st) {
    const o = t * 9;
    const ax = M.xyz[o]; const ay = M.xyz[o + 1]; const az = M.xyz[o + 2];
    const bx = M.xyz[o + 3]; const by = M.xyz[o + 4]; const bz = M.xyz[o + 5];
    const cx = M.xyz[o + 6]; const cy = M.xyz[o + 7]; const cz = M.xyz[o + 8];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz);
    if (!(nl > 0)) continue;
    const tA = Math.atan2(ay, ax);
    const th = tA + (dThRaw(tA, Math.atan2(by, bx)) + dThRaw(tA, Math.atan2(cy, cx))) / 3;
    fiveNormals(th, (az + bz + cz) / 3);
    let best = -1;
    for (let q = 0; q < 5; q += 1) {
      const d = (nx * cand[3 * q] + ny * cand[3 * q + 1] + nz * cand[3 * q + 2]) / nl;
      if (d > best) best = d;
    }
    tot += 1; if (best > 0) pos += 1;
  }
  const frac = tot > 0 ? pos / tot : 0;
  log(`NON-VACUITY 3 — GLOBAL WIND: ${(100 * frac).toFixed(3)}% of a ${tot}-facet stride sample agrees with the analytic OUTWARD normal => mesh winds ${frac >= 0.75 ? 'OUTWARD' : frac <= 0.25 ? '*** INWARD ***' : '*** AMBIGUOUS ***'}`);
  if (frac < 0.75) { log('*** the mesh does not wind outward globally — every "back-facing" number below would be a convention. ABORT ***'); process.exit(1); }
}

// ── RADIAL-GRAPH MEMBERSHIP (non-vacuity 2)
{
  const nsamp = Math.min(M.nTri, 20000);
  const st = Math.max(1, Math.floor(M.nTri / nsamp));
  let mx = 0; const vals: number[] = [];
  for (let t = 0; t < M.nTri; t += st) {
    for (let v = 0; v < 3; v += 1) {
      const o = t * 9 + v * 3;
      const x = M.xyz[o]; const y = M.xyz[o + 1]; const z = M.xyz[o + 2];
      const d = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (d > mx) mx = d; vals.push(d);
    }
  }
  vals.sort((p, q) => p - q);
  log(`NON-VACUITY 2 — RADIAL MEMBERSHIP over ${vals.length} vertices: p50 ${(vals[vals.length >> 1] * 1000).toFixed(4)} um   p99 ${(vals[Math.floor(0.99 * vals.length)] * 1000).toFixed(4)} um   MAX ${(mx * 1000).toFixed(4)} um`);
  log('  (this is BOTH the params check and the "is it a radial graph" check — a wrong param set reads mm, not um)');
}

// ── the main census ─────────────────────────────────────────────────────────────────────────────────
interface Acc { n: number; area: number }
const mkAcc = (): Acc => ({ n: 0, area: 0 });
const BA = mkAcc(); const BB = mkAcc(); const BC = mkAcc();     // buckets a / b / c
const S97 = mkAcc();                                            // S97's normDeg>90 under 'outward'
const XA = mkAcc(); const XB = mkAcc(); const XC = mkAcc();     // S97-flagged, split by bucket
const AnotS = mkAcc();                                          // bucket (a) MISSED by S97
const DEG = mkAcc();                                            // zero-area / degenerate
const V4 = mkAcc();                                             // _judgeNormal-compatible: centroid+3 verts
const STORED = mkAcc();                                         // stored STL normal disagrees with winding
const CENTBACK = mkAcc();                                       // back-facing AT THE CENTROID only (crude)
let areaAll = 0;
let s97MaxDeg = 0;
let nearZeroBand = 0;                                           // |bestDot| < 1e-9 somewhere (determinacy)
let maxBackDeg = 0;                                             // worst true back-facing angle, winding ruler

// distributions for the mechanism step
// signMargin = |f_winding . n_S(centroid)| — the brief's "is the outward test near-degenerate?" quantity.
// Collected for the S97-FLAGGED population specifically, because that is the set whose membership the
// convention could be deciding. A SMALL margin means the flip was a coin toss and the facet's reported
// angle is not a property of the geometry.
const s97SignMargin: number[] = []; const allSignMargin: number[] = [];
let s97Flipped = 0;                                  // S97-flagged facets whose sign the outward mode FLIPPED
const aMinAng: number[] = []; const bMinAng: number[] = []; const allMinAng: number[] = [];
const aSpread: number[] = []; const bSpread: number[] = [];
const aDiam: number[] = []; const bDiam: number[] = [];
const aTilt: number[] = []; const bTilt: number[] = [];
const bBackFrac: number[] = [];
const aArea: number[] = [];

const dumpPath = `${OUTDIR}/S98BF_${TAG}_bucketA.ndjson`;
if (existsSync(dumpPath)) rmSync(dumpPath);
let nDumped = 0;
let dumpBuf = '';

const NPTS = ((K + 1) * (K + 2)) / 2;
const sh = 1 - INSET; const scw = INSET / 3;

for (let q = 0; q < nScore; q += 1) {
  const t = idx === null ? q : idx[q];
  const o = t * 9;
  const ax = M.xyz[o]; const ay = M.xyz[o + 1]; const az = M.xyz[o + 2];
  const bx = M.xyz[o + 3]; const by = M.xyz[o + 4]; const bz = M.xyz[o + 5];
  const cx = M.xyz[o + 6]; const cy = M.xyz[o + 7]; const cz = M.xyz[o + 8];
  // WINDING normal — never flipped. This is what a renderer lights with.
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  const ar = 0.5 * fl;
  areaAll += ar;
  if (!(fl > 0)) { DEG.n += 1; DEG.area += ar; continue; }
  fx /= fl; fy /= fl; fz /= fl;

  const eab = Math.hypot(bx - ax, by - ay, bz - az);
  const ebc = Math.hypot(cx - bx, cy - by, cz - bz);
  const eca = Math.hypot(ax - cx, ay - cy, az - cz);
  const diam = Math.max(eab, ebc, eca);
  const es = [eab, ebc, eca].sort((p, r) => p - r);
  const minAng = (Math.acos(Math.max(-1, Math.min(1, (es[1] * es[1] + es[2] * es[2] - es[0] * es[0]) / (2 * es[1] * es[2])))) * 180) / Math.PI;
  allMinAng.push(minAng);

  {
    const nx = M.nrm[t * 3]; const ny = M.nrm[t * 3 + 1]; const nz = M.nrm[t * 3 + 2];
    if (Math.hypot(nx, ny, nz) > 0 && nx * fx + ny * fy + nz * fz < 0) { STORED.n += 1; STORED.area += ar; }
  }

  const thA = Math.atan2(ay, ax);
  const thB = thA + dThRaw(thA, Math.atan2(by, bx));
  const thC = thA + dThRaw(thA, Math.atan2(cy, cx));

  // ── S97's outward sign: from candidate 0 (central) at the parametric centroid, exactly as
  // orientOfFacet({orient:'outward'}) does with fdNormalsCentral.
  const gth = (thA + thB + thC) / 3; const gz = (az + bz + cz) / 3;
  fiveNormals(gth, gz);
  const dRef = fx * cand[0] + fy * cand[1] + fz * cand[2];
  const s97sx = dRef < 0 ? -1 : 1;
  // TILT of the SURFACE normal off radial at the centroid — how steep the wall is here, in the ruler's own
  // terms: tan(tilt) = hypot(r_th, r*r_z)/r.
  const tiltDeg = (Math.atan2(Math.hypot(lastRTh, lastR0 * lastRZ), Math.max(1e-30, lastR0)) * 180) / Math.PI;
  {
    let bestC = -1;
    for (let m = 0; m < 5; m += 1) {
      const d = fx * cand[3 * m] + fy * cand[3 * m + 1] + fz * cand[3 * m + 2];
      if (d > bestC) bestC = d;
    }
    if (bestC < 0) { CENTBACK.n += 1; CENTBACK.area += ar; }
  }

  let nBack = 0; let s97best = -1;
  let sx = 0; let sy = 0; let sz = 0; let nAcc = 0;   // mean CENTRAL normal, for spreadRad
  let minBest = Infinity;
  let nearZero = false;
  for (let i = 0; i <= K; i += 1) {
    for (let j = 0; i + j <= K; j += 1) {
      const wa = sh * (i / K) + scw; const wb = sh * (j / K) + scw; const wc = 1 - wa - wb;
      const th = wa * thA + wb * thB + wc * thC;
      const z = wa * az + wb * bz + wc * cz;
      fiveNormals(th, z);
      // ── the PARTITION quantity: best over all 5 candidates, against the WINDING normal
      let best = -1;
      for (let m = 0; m < 5; m += 1) {
        const d = fx * cand[3 * m] + fy * cand[3 * m + 1] + fz * cand[3 * m + 2];
        if (d > best) best = d;
      }
      if (best < 0) nBack += 1;
      if (Math.abs(best) < 1e-9) nearZero = true;
      if (best < minBest) minBest = best;
      // ── the S97 quantity: candidate 0 only, after the outward flip
      let d0 = s97sx * (fx * cand[0] + fy * cand[1] + fz * cand[2]);
      d0 = d0 > 1 ? 1 : d0 < -1 ? -1 : d0;
      const a0 = Math.acos(d0);
      if (a0 > s97best) s97best = a0;
      sx += cand[0]; sy += cand[1]; sz += cand[2]; nAcc += 1;
    }
  }
  // the 4-point (_judgeNormal-compatible) test at the true corners, un-inset
  let vertBackAll = true;
  {
    const pts: Array<[number, number]> = [[gth, gz], [thA, az], [thB, bz], [thC, cz]];
    for (const [pt, pz] of pts) {
      fiveNormals(pt, pz);
      let best = -1;
      for (let m = 0; m < 5; m += 1) {
        const d = fx * cand[3 * m] + fy * cand[3 * m + 1] + fz * cand[3 * m + 2];
        if (d > best) best = d;
      }
      if (best > 0) { vertBackAll = false; break; }
    }
  }
  if (vertBackAll) { V4.n += 1; V4.area += ar; }
  if (nearZero) nearZeroBand += 1;

  const spreadDeg = (2 * Math.acos(Math.min(1, nAcc > 0 ? Math.hypot(sx, sy, sz) / nAcc : 1)) * 180) / Math.PI;
  const s97deg = (s97best * 180) / Math.PI;
  if (s97deg > s97MaxDeg) s97MaxDeg = s97deg;
  const isS97 = s97deg > 90;
  allSignMargin.push(Math.abs(dRef));
  if (isS97) { S97.n += 1; S97.area += ar; s97SignMargin.push(Math.abs(dRef)); if (s97sx < 0) s97Flipped += 1; }

  const bf = nBack / NPTS;
  if (nBack === NPTS) {
    BA.n += 1; BA.area += ar;
    const wDeg = (Math.acos(Math.max(-1, Math.min(1, minBest))) * 180) / Math.PI;
    if (wDeg > maxBackDeg) maxBackDeg = wDeg;
    aMinAng.push(minAng); aSpread.push(spreadDeg); aDiam.push(diam); aTilt.push(tiltDeg); aArea.push(ar);
    if (!isS97) { AnotS.n += 1; AnotS.area += ar; }
    if (nDumped < MAXDUMP) {
      dumpBuf += `${JSON.stringify({
        tri: t, th: gth, z: gz, areaMm2: ar, diam, minAng, spreadDeg, tiltDeg,
        s97deg, isS97, worstDeg: wDeg, v4: vertBackAll,
      })}\n`;
      nDumped += 1;
      if (nDumped % 200 === 0) { appendFileSync(dumpPath, dumpBuf); dumpBuf = ''; }
    }
  } else if (nBack > 0) {
    BB.n += 1; BB.area += ar;
    bMinAng.push(minAng); bSpread.push(spreadDeg); bDiam.push(diam); bTilt.push(tiltDeg); bBackFrac.push(bf);
  } else {
    BC.n += 1; BC.area += ar;
  }
  if (isS97) {
    if (nBack === NPTS) { XA.n += 1; XA.area += ar; } else if (nBack > 0) { XB.n += 1; XB.area += ar; } else { XC.n += 1; XC.area += ar; }
  }

  if ((q + 1) % 100000 === 0) {
    log(`  ${q + 1}/${nScore}   a=${BA.n} b=${BB.n} S97=${S97.n}   [${el()}]`);
    writeFileSync(`${OUTDIR}/S98BF_${TAG}.partial.json`, JSON.stringify({
      done: q + 1, of: nScore, BA, BB, BC, S97, XA, XB, XC, AnotS, V4, DEG, areaAll, s97MaxDeg,
    }));
  }
}
if (dumpBuf.length > 0) appendFileSync(dumpPath, dumpBuf);

const fmt = (a: Acc): string => `${a.n} (${((100 * a.n) / Math.max(1, nScore)).toFixed(4)}% cnt)  AREA ${((100 * a.area) / Math.max(1e-30, areaAll)).toFixed(5)}%`;
const med = (v: number[]): number => (v.length === 0 ? NaN : v.slice().sort((p, r) => p - r)[v.length >> 1]);
const pq = (v: number[], f: number): number => (v.length === 0 ? NaN : v.slice().sort((p, r) => p - r)[Math.min(v.length - 1, Math.floor(f * v.length))]);

log('');
log('═══ NON-VACUITY 1 — THE S97 REPRODUCTION ═══');
log(`  S97 quantity (normDeg > 90, orient:'outward', CENTRAL candidate, k=${K} inset=${INSET})`);
log(`    ${fmt(S97)}    max normDeg ${s97MaxDeg.toFixed(2)}`);
log('    S97 published (Gothic S39CTL, N=60000 golden sample): 305 facets, AREA 0.24338%, max normDeg 174.68');
log('');
log('═══ THE PARTITION — against the STL WINDING, best of 5 candidate analytic normals ═══');
log(`  scored ${nScore} facets, total area ${areaAll.toFixed(2)} mm^2, ${NPTS} lattice pts/facet`);
log(`  (a) UNAMBIGUOUS  back-facing at ALL ${NPTS} pts : ${fmt(BA)}`);
log(`  (b) STRADDLE     back-facing at 1..${NPTS - 1} pts: ${fmt(BB)}`);
log(`  (c) FRONT-FACING back-facing at 0 pts        : ${fmt(BC)}`);
log(`  DEGENERATE (zero area, no normal at all)     : ${fmt(DEG)}`);
log(`  worst back-facing angle in bucket (a), winding ruler: ${maxBackDeg.toFixed(2)} deg`);
log('');
log(`  CENTROID-only back-facing (crude, best-of-5)  : ${fmt(CENTBACK)}`);
log(`  4-POINT test (_judgeNormal-compatible)        : ${fmt(V4)}`);
log(`  determinacy band (|bestDot| < 1e-9 somewhere) : ${nearZeroBand}`);
log(`  STORED STL normal disagrees with winding      : ${fmt(STORED)}`);
log('');
log('═══ CROSS-TAB — where the S97-flagged facets actually land ═══');
log(`  S97-flagged AND bucket (a): ${fmt(XA)}`);
log(`  S97-flagged AND bucket (b): ${fmt(XB)}`);
log(`  S97-flagged AND bucket (c): ${fmt(XC)}`);
log(`  bucket (a) MISSED by S97  : ${fmt(AnotS)}   <-- (P1): outward mode cannot see an inversion on a smooth patch`);
const inter = XA.n; const uni = S97.n + BA.n - XA.n;
log(`  JACCARD( S97-flagged , bucket-a ) = ${(inter / Math.max(1, uni)).toFixed(4)}`);
log('');
log('═══ IS THE OUTWARD TEST NEAR-DEGENERATE ON THE FLAGGED SET? (the brief\'s signMargin question) ═══');
log(`  signMargin = |f_winding . n_S(centroid)|,  ALL facets   p10 ${pq(allSignMargin, 0.1).toFixed(4)}  p50 ${med(allSignMargin).toFixed(4)}`);
log(`  signMargin on the S97-FLAGGED set          p10 ${pq(s97SignMargin, 0.1).toFixed(4)}  p50 ${med(s97SignMargin).toFixed(4)}  p90 ${pq(s97SignMargin, 0.9).toFixed(4)}`);
log(`  S97-flagged facets whose sign the outward mode actually FLIPPED: ${s97Flipped}/${S97.n} = ${((100 * s97Flipped) / Math.max(1, S97.n)).toFixed(2)}%`);
log('    ^ a flip is the ONLY way the convention can change a verdict. 0% => the convention is INERT on this');
log('      population and the flag is NOT a convention artefact (it is a real >90 turn inside the footprint).');
log('');
log('═══ MECHANISM — distributions by bucket ═══');
log(`  minAngle deg   ALL p50 ${med(allMinAng).toFixed(3)}   (a) p50 ${med(aMinAng).toFixed(3)} p10 ${pq(aMinAng, 0.1).toFixed(3)} p90 ${pq(aMinAng, 0.9).toFixed(3)}   (b) p50 ${med(bMinAng).toFixed(3)}`);
log(`  spreadRad deg  (a) p50 ${med(aSpread).toFixed(3)} p90 ${pq(aSpread, 0.9).toFixed(3)}   (b) p50 ${med(bSpread).toFixed(3)} p90 ${pq(bSpread, 0.9).toFixed(3)}`);
log(`  diam mm        (a) p50 ${med(aDiam).toFixed(5)} p90 ${pq(aDiam, 0.9).toFixed(5)}   (b) p50 ${med(bDiam).toFixed(5)}`);
log(`  surface TILT off radial, deg  (a) p50 ${med(aTilt).toFixed(2)} p90 ${pq(aTilt, 0.9).toFixed(2)}   (b) p50 ${med(bTilt).toFixed(2)}`);
log(`  backFrac       (b) p10 ${pq(bBackFrac, 0.1).toFixed(4)} p50 ${med(bBackFrac).toFixed(4)} p90 ${pq(bBackFrac, 0.9).toFixed(4)}`);
log(`  bucket (a) area mm^2  p50 ${med(aArea).toExponential(3)}  p90 ${pq(aArea, 0.9).toExponential(3)}`);
log('');
log(`  bucket (a) facet records -> ${dumpPath}  (${nDumped} written, cap ${MAXDUMP})`);
writeFileSync(`${OUTDIR}/S98BF_${TAG}.summary.json`, JSON.stringify({
  style: STYLE, tag: TAG, stl: STL, nTri: M.nTri, nScore, K, INSET, NPTS, areaAll,
  BA, BB, BC, S97, XA, XB, XC, AnotS, V4, DEG, STORED, CENTBACK, s97MaxDeg, maxBackDeg, nearZeroBand,
  med: {
    allMinAng: med(allMinAng), aMinAng: med(aMinAng), bMinAng: med(bMinAng),
    aSpread: med(aSpread), bSpread: med(bSpread), aDiam: med(aDiam), bDiam: med(bDiam),
    aTilt: med(aTilt), bTilt: med(bTilt),
  },
}, null, 1));
log(`  summary -> ${OUTDIR}/S98BF_${TAG}.summary.json`);
log(`  ${(RA_EVALS / 1e6).toFixed(1)}M rA evals   done [${el()}]`);
