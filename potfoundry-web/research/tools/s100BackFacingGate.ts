// research/tools/s100BackFacingGate.ts — S100 TASK 3: THE BACK-FACING SHIP GATE.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// A gate that runs on a SHIPPED STL and answers one question: does this export contain a facet that
// is back-facing over its WHOLE footprint under every admissible one-sided surface normal?
//
//   PASS  <=>  ZERO such facets.  That is the user's standard and there is no accept band.
//   FAIL  otherwise, with the count, the AREA, and the worst facets NAMED so they can be found.
//
// It is a SCREEN + CONFIRM, exactly as S98 §5.2 priced it:
//   SCREEN  the O(1) CENTROID test — 5 rA evals/facet, best of 5 one-sided candidate normals.
//           S98 measured recall 100% (690/690 Gothic, 488/488 Voronoi) at ~46% precision.
//   CONFIRM the 45-point covering (k=8, inset 0.02) on the ~0.13% the screen flags.
//           The covering is the VERDICT; the centroid test is only a screen.
// Cost on a 1.14 M-facet export: 5.7 M + ~0.34 M rA evals, a few seconds, against 268 M for the
// full covering. That is what makes this affordable at ship time.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// TWO THINGS THIS GATE HAD TO GET RIGHT, BOTH LEARNED THE HARD WAY (S97 -> S98)
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// 1. *** `normDeg > 90` UNDER `orient:'outward'` MEASURES THE EXACT COMPLEMENT OF THIS CLASS. ***
//    In that mode `orientOfFacet` computes d = f_winding . n_S(centroid) and, if d < 0, REPLACES f
//    with -f. A facet that is back-facing at its centroid is therefore flipped outward and then
//    scored, after which angle(f_out, n) <= 90 BY CONSTRUCTION. S98 proved the two sets are exactly
//    disjoint (Jaccard 0.0000 on four meshes) and that it is a theorem, not a statistic. THIS GATE
//    NEVER FLIPS: every dot product below is against the STL's OWN WINDING. If a re-implementation
//    of this gate ever reproduces S97's 305 rather than S98's 690, it is measuring the wrong class.
// 2. *** A CHECK THAT DID NOT RUN PRINTS `NOT-MEASURED`, NEVER 0. *** Every field below is carried
//    as `number | null` and rendered by `fmt()`, which prints NOT-MEASURED for null. A gate that
//    prints a passing number for a check it skipped is worse than no gate, so the VERDICT itself is
//    a three-way: PASS / FAIL / NOT-MEASURED, and any failed precondition forces NOT-MEASURED.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// DEFAULT MODE: REPORT-ONLY. Exit code 0 whatever the verdict.
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Other agents' long jobs are running against this tree and a new hard-failing gate would break
// them. Blocking is OPT-IN:  PF_S100_GATE_BLOCK=1  => exit 3 on FAIL, exit 4 on NOT-MEASURED.
// The report prints which mode it ran in, on its own line, every time.
//
// ARITHMETIC PROVENANCE. `fiveNormals`, the STL reader, the golden stride, the covering lattice and
// the winding-normal convention are transcribed from `research/tools/s98BackFacingPartition.ts`
// (S98's own instrument) so this gate is the SAME detector at a cheaper schedule — not a third one.
// The validation below is what proves that: it must reproduce S98's published figures exactly.
//
//   PRE-REGISTERED VALIDATION (S98 §2.1, full mesh):
//     Gothic  gothicarches_ring_DS-HT_S39CTL.stl : 690 facets / 0.00596% AREA
//     Voronoi voronoi_ring_D--H_S94CTL.stl       : 488 facets / 0.01298% AREA
//   If it does not reproduce BOTH, it is not wired correctly and must not ship.
//
// USAGE
//   PF_S100_STL=<path> PF_S100_STYLE=<StyleId> PF_S100_TAG=<tag> \
//     bash research/tools/run-s100-bf-gate.sh
//   PF_S100_GATE_BLOCK=1   -> blocking mode
//   PF_S100_FULLCOVER=1    -> ALSO run the 45-point covering on EVERY facet (S98's ~295 s path) and
//                             assert the screen's recall on THIS mesh. Off by default; when off, the
//                             recall field prints NOT-MEASURED rather than 100%.
//   PF_S100_N=<n>          -> golden-stride sample instead of the full mesh (n=0 = full).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envOn = (n: string): boolean => process.env[n] === '1';

const STYLE = process.env.PF_S100_STYLE ?? 'GothicArches';
const STL = process.env.PF_S100_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S100_TAG ?? 'GOTH_S39CTL';
const NSAMP = Math.round(envF('PF_S100_N', 0));            // 0 = FULL MESH (the ship-gate default)
const K = Math.round(envF('PF_S100_K', 8));
const INSET = envF('PF_S100_INSET', 0.02);
const BLOCK = envOn('PF_S100_GATE_BLOCK');
const FULLCOVER = envOn('PF_S100_FULLCOVER');
const NAMEN = Math.round(envF('PF_S100_NAME', 20));        // how many worst facets to NAME in the report
const OUTDIR = process.env.PF_S100_OUT ?? 'research/exchange/_strataConformBisect/s100';
const DIMS: StyleDims = { H: envF('PF_S100_H', 120), Rb: envF('PF_S100_RB', 40), Rt: envF('PF_S100_RT', 50), expn: 1 };
const H = DIMS.H;

/** A quantity that was NOT measured prints NOT-MEASURED. It never prints 0. */
const fmt = (v: number | null, d = 4, suffix = ''): string => (v === null ? 'NOT-MEASURED' : `${v.toFixed(d)}${suffix}`);
const fmtI = (v: number | null): string => (v === null ? 'NOT-MEASURED' : String(v));

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

log('══════════════════════════════════════════════════════════════════════════════════════════');
log('  S100 BACK-FACING SHIP GATE — unambiguous back-facing facets must be ZERO');
log('══════════════════════════════════════════════════════════════════════════════════════════');
log(`mode         : ${BLOCK ? '*** BLOCKING *** (PF_S100_GATE_BLOCK=1) — FAIL exits 3, NOT-MEASURED exits 4'
  : 'REPORT-ONLY (default) — always exits 0. Set PF_S100_GATE_BLOCK=1 to block.'}`);
log(`stl          : ${STL}`);
log(`style / tag  : ${STYLE} / ${TAG}`);
log(`dims         : H=${DIMS.H} Rb=${DIMS.Rb} Rt=${DIMS.Rt}`);
log(`confirm      : ${((K + 1) * (K + 2)) / 2}-point covering, k=${K} inset=${INSET}  (S98's verdict instrument)`);

const params = registryDefaults(STYLE);
log(`params       : ${JSON.stringify(params)}`);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...params }, DIMS);
let RA_EVALS = 0;
const rA = (th: number, z: number): number => {
  RA_EVALS += 1;
  return rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
};

// ── STL reader, keeping the stored f32 normal (its disagreement with the winding is its own class).
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
log(`facets       : ${M.nTri}   [${el()}]`);

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
log(`scope        : ${idx === null ? `FULL MESH (${nScore} facets)` : `golden-stride sample ${nScore} (${((100 * nScore) / M.nTri).toFixed(3)}%)`}`);

// ── THE FIVE-CANDIDATE ANALYTIC NORMAL SAMPLER — transcribed from s98BackFacingPartition.fiveNormals.
// Candidate 0 is the CENTRAL difference; 1..4 are the one-sided combinations. `bestDot < 0` at a point
// means: under NO admissible one-sided surface normal there is this facet front-facing. That is the
// most-favourable-to-the-mesh test, which is the only safe bias for a gate.
const HARC = 2e-4; const HZ = 2e-4;
const cand = new Float64Array(15);
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
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// PRECONDITIONS. A gate whose preconditions fail must say NOT-MEASURED, not PASS.
// ═════════════════════════════════════════════════════════════════════════════════════════════════
let windFrac: number | null = null;
let radialMaxUm: number | null = null;
/**
 * S103: the surface gate. A facet all of whose vertices lie within this of `rA` is OUTER WALL and is
 * scored; anything else is a tread/cap/floor-fan and is REPORTED SEPARATELY.
 * `PF_S100_SURF_GATE_MM=0` scores everything (the pre-S103 behaviour).
 *
 * DEFAULT 0.010 mm, NOT `landFlipPass`'s 0.05. Copying that value was a mistake and the probe caught it:
 * `landFlipPass` uses its gate to FREEZE facets, where loose is conservative; here the gate DEFINES THE
 * SCORED POPULATION, where loose admits boundary facets into the parameter check. Measured on
 * CelticTriquetra (the mesh that has treads):
 *     gate 50 um -> 98.857% on-surface, on-surface MAX 49.8117 um   (i.e. the gate's own value)
 *     gate  1 um -> 98.812% on-surface, on-surface MAX  0.0255 um   (i.e. Gothic's 0.0310 um)
 * A 50x tightening moved the population by 0.045 pp. **THE DISTRIBUTION IS BIMODAL** — wall at ~0.03 um,
 * treads at ~1500 um, ~9 facets in 20,038 between. The 49.81 um was boundary facets, not a loose wall.
 *
 * It is set EQUAL to the parameter-mismatch threshold on purpose, which makes the on-surface MAX check
 * vacuous by construction — so that check is REPORTED, NOT GATED, and parameter mismatch is detected by
 * the on-surface FRACTION instead. A criterion that can never fail must not be allowed to look like a
 * passing gate.
 */
const SURF_GATE = envF('PF_S100_SURF_GATE_MM', 0.010);
/** below this on-surface fraction the mesh is judged a PARAM MISMATCH, not a mesh with treads. */
const SURF_MINFRAC = envF('PF_S100_SURF_MINFRAC', 0.50);
let radialOnSurfMaxUm = NaN;
let precondOk = true;
const precondNotes: string[] = [];

{ // GLOBAL WIND — a mesh that winds inward would read ~100% back-facing as a CONVENTION, not a defect.
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
  windFrac = tot > 0 ? pos / tot : 0;
  const verdict = windFrac >= 0.75 ? 'OUTWARD' : windFrac <= 0.25 ? '*** INWARD ***' : '*** AMBIGUOUS ***';
  log(`PRECOND wind : ${(100 * windFrac).toFixed(3)}% of ${tot} stride facets agree with the analytic outward normal => ${verdict}`);
  if (windFrac < 0.75) { precondOk = false; precondNotes.push('mesh does not wind outward globally'); }
}
{ // RADIAL-GRAPH MEMBERSHIP — this is BOTH the params check and the "is rA the right surface" check.
  const nsamp = Math.min(M.nTri, 20000);
  const st = Math.max(1, Math.floor(M.nTri / nsamp));
  let mx = 0; let cnt = 0;
  for (let t = 0; t < M.nTri; t += st) {
    for (let v = 0; v < 3; v += 1) {
      const o = t * 9 + v * 3;
      const x = M.xyz[o]; const y = M.xyz[o + 1]; const z = M.xyz[o + 2];
      const d = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (d > mx) mx = d; cnt += 1;
    }
  }
  radialMaxUm = mx * 1000;
  log(`PRECOND radial: MAX |r_mesh - rA| over ${cnt} vertices = ${radialMaxUm.toFixed(4)} um  [WHOLE MESH]`);
  // ── S103. THE MAX OVER THE WHOLE MESH IS THE WRONG STATISTIC, AND IT VOIDED A GOOD MESH.
  //
  // A pot is not only its outer wall. CelticTriquetra's ring run emitted `1278000 outer wall + 4394
  // TREADS`, and TREAD-WALL VERTICES LEGITIMATELY DO NOT LIE ON rA — they are a different surface. One
  // such vertex at 1533.7 um therefore failed the whole mesh as "wrong style params", when the params
  // were right and the wall was fine. `landFlipPass` already solved this: its surface gate FREEZES
  // "end caps, floor fans, tread walls" instead of judging them against rA.
  //
  // So the precondition now discriminates the two cases it was conflating:
  //   * WRONG PARAMS  -> essentially EVERY facet is off rA, because rA itself is the wrong function.
  //   * TREADS/CAPS   -> the large majority are on rA and a small named minority are not.
  // The verdict is taken on the ON-SURFACE population; the rest is REPORTED, never silently included
  // and never allowed to void the run.
  let onS = 0; let offS = 0; let mxOn = 0;
  for (let t = 0; t < M.nTri; t += st) {
    let worst = 0;
    for (let v = 0; v < 3; v += 1) {
      const o = t * 9 + v * 3;
      const x = M.xyz[o]; const y = M.xyz[o + 1]; const z = M.xyz[o + 2];
      const d = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (d > worst) worst = d;
    }
    if (worst <= SURF_GATE) { onS += 1; if (worst > mxOn) mxOn = worst; } else offS += 1;
  }
  const onFrac = onS / Math.max(1, onS + offS);
  radialOnSurfMaxUm = mxOn * 1000;
  log(`PRECOND surface: ${onS} on-surface / ${offS} off-surface of ${onS + offS} sampled `
    + `(${(100 * onFrac).toFixed(3)}% on, gate ${(SURF_GATE * 1000).toFixed(0)} um)   `
    + `MAX |r_mesh - rA| ON-SURFACE = ${radialOnSurfMaxUm.toFixed(4)} um`);
  // PARAMETER MISMATCH IS DETECTED BY THE **FRACTION**, NOT BY THE ON-SURFACE MAX. The max is bounded by
  // `SURF_GATE` by construction, so gating on it would be a criterion that can never fail — the vacuous-bar
  // trap. It is printed above so a DEGRADING wall stays visible (Gothic 0.031 um is the reference), but the
  // verdict rests on this: with the wrong `rA`, essentially every facet leaves the gate and the fraction
  // collapses, whereas a tread/cap population is a small named minority.
  if (onFrac < SURF_MINFRAC) { precondOk = false; precondNotes.push(`only ${(100 * onFrac).toFixed(2)}% of facets lie on rA (< ${(100 * SURF_MINFRAC).toFixed(0)}%) — wrong style params, not a tread/cap population`); }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 1 — THE O(1) CENTROID SCREEN. 5 rA evals/facet. Sound by S98's measurement, not by proof.
// ═════════════════════════════════════════════════════════════════════════════════════════════════
interface FacetGeom { ax: number; ay: number; az: number; bx: number; by: number; bz: number; cx: number; cy: number; cz: number;
  fx: number; fy: number; fz: number; area: number; thA: number; thB: number; thC: number; minAng: number; diam: number }
function geomOf(t: number): FacetGeom | null {
  const o = t * 9;
  const ax = M.xyz[o]; const ay = M.xyz[o + 1]; const az = M.xyz[o + 2];
  const bx = M.xyz[o + 3]; const by = M.xyz[o + 4]; const bz = M.xyz[o + 5];
  const cx = M.xyz[o + 6]; const cy = M.xyz[o + 7]; const cz = M.xyz[o + 8];
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  const area = 0.5 * fl;
  if (!(fl > 0)) return null;
  fx /= fl; fy /= fl; fz /= fl;
  const eab = Math.hypot(bx - ax, by - ay, bz - az);
  const ebc = Math.hypot(cx - bx, cy - by, cz - bz);
  const eca = Math.hypot(ax - cx, ay - cy, az - cz);
  const es = [eab, ebc, eca].sort((p, r) => p - r);
  const minAng = (Math.acos(Math.max(-1, Math.min(1, (es[1] * es[1] + es[2] * es[2] - es[0] * es[0]) / (2 * es[1] * es[2])))) * 180) / Math.PI;
  const thA = Math.atan2(ay, ax);
  return { ax, ay, az, bx, by, bz, cx, cy, cz, fx, fy, fz, area, thA,
    thB: thA + dThRaw(thA, Math.atan2(by, bx)), thC: thA + dThRaw(thA, Math.atan2(cy, cx)), minAng, diam: es[2] };
}

const screenT0 = Date.now();
const flagged: number[] = [];
let areaAll = 0;
let nDegenerate = 0; let areaDegenerate = 0;
let storedDisagree = 0;
let nOffSurf = 0; let areaOffSurf = 0;
const allMinAng: number[] = [];
for (let q = 0; q < nScore; q += 1) {
  const t = idx === null ? q : idx[q];
  const g = geomOf(t);
  if (g === null) {
    const o = t * 9;
    // A zero-area facet has no normal at all. It cannot be scored and must not be silently PASSed.
    nDegenerate += 1; areaDegenerate += 0; void o;
    continue;
  }
  // ── S103 SURFACE SCOPE. A tread/cap/floor-fan facet is not on `rA`, so `rA` says nothing about
  // whether its normal is right and scoring it would be measuring the wrong surface. Excluded from the
  // VERDICT and COUNTED, never silently dropped — the report prints the population it set aside.
  if (SURF_GATE > 0) {
    let worst = 0;
    for (const [vx0, vy0, vz0] of [[g.ax, g.ay, g.az], [g.bx, g.by, g.bz], [g.cx, g.cy, g.cz]] as Array<[number, number, number]>) {
      const d = Math.abs(Math.hypot(vx0, vy0) - rA(Math.atan2(vy0, vx0), vz0));
      if (d > worst) worst = d;
    }
    if (worst > SURF_GATE) { nOffSurf += 1; areaOffSurf += g.area; continue; }
  }
  areaAll += g.area;
  allMinAng.push(g.minAng);
  {
    const nx = M.nrm[t * 3]; const ny = M.nrm[t * 3 + 1]; const nz = M.nrm[t * 3 + 2];
    if (Math.hypot(nx, ny, nz) > 0 && nx * g.fx + ny * g.fy + nz * g.fz < 0) storedDisagree += 1;
  }
  fiveNormals((g.thA + g.thB + g.thC) / 3, (g.az + g.bz + g.cz) / 3);
  let best = -1;
  for (let m = 0; m < 5; m += 1) {
    const d = g.fx * cand[3 * m] + g.fy * cand[3 * m + 1] + g.fz * cand[3 * m + 2];
    if (d > best) best = d;
  }
  if (best < 0) flagged.push(t);
}
const screenSecs = (Date.now() - screenT0) / 1000;
const screenEvals = RA_EVALS;
log(`SCREEN       : centroid best-of-5 flagged ${flagged.length} of ${nScore} (${((100 * flagged.length) / Math.max(1, nScore)).toFixed(4)}%)`
  + `   ${screenSecs.toFixed(1)}s   ${(screenEvals / 1e6).toFixed(2)}M rA evals   [${el()}]`);
if (SURF_GATE > 0) {
  log(`SCOPE        : OUTER WALL ${nScore - nOffSurf - nDegenerate} scored   |   OFF-SURFACE ${nOffSurf} `
    + `(treads/caps/floor-fans, area ${areaOffSurf.toFixed(3)} mm^2) NOT SCORED — rA does not describe them`);
  if (nOffSurf > 0) log('               (their orientation needs the surface THEY belong to; this gate does not have it)');
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// STEP 2 — CONFIRM with the 45-point covering. THIS is the verdict.
// ═════════════════════════════════════════════════════════════════════════════════════════════════
interface Hit { t: number; area: number; worstDeg: number; minAng: number; diam: number; x: number; y: number; z: number; th: number; nBack: number }
const NPTS = ((K + 1) * (K + 2)) / 2;
const sh = 1 - INSET; const scw = INSET / 3;

/** returns nBack (0..NPTS) and the worst (largest) angle between the winding normal and the best candidate */
function cover(g: FacetGeom): { nBack: number; worstDeg: number } {
  let nBack = 0; let worstDeg = 0;
  for (let i = 0; i <= K; i += 1) {
    for (let j = 0; i + j <= K; j += 1) {
      const wa = sh * (i / K) + scw; const wb = sh * (j / K) + scw; const wc = 1 - wa - wb;
      const th = wa * g.thA + wb * g.thB + wc * g.thC;
      const z = wa * g.az + wb * g.bz + wc * g.cz;
      fiveNormals(th, z);
      let best = -1;
      for (let m = 0; m < 5; m += 1) {
        const d = g.fx * cand[3 * m] + g.fy * cand[3 * m + 1] + g.fz * cand[3 * m + 2];
        if (d > best) best = d;
      }
      if (best < 0) nBack += 1;
      const deg = (Math.acos(Math.max(-1, Math.min(1, best))) * 180) / Math.PI;
      if (deg > worstDeg) worstDeg = deg;
    }
  }
  return { nBack, worstDeg };
}

const confirmT0 = Date.now();
const hits: Hit[] = [];
let straddleN = 0; let straddleArea = 0;
let backN = 0; let backArea = 0;
for (const t of flagged) {
  const g = geomOf(t);
  if (g === null) continue;
  const { nBack, worstDeg } = cover(g);
  if (nBack === NPTS) {
    backN += 1; backArea += g.area;
    hits.push({ t, area: g.area, worstDeg, minAng: g.minAng, diam: g.diam,
      x: (g.ax + g.bx + g.cx) / 3, y: (g.ay + g.by + g.cy) / 3, z: (g.az + g.bz + g.cz) / 3,
      th: (g.thA + g.thB + g.thC) / 3, nBack });
  } else if (nBack > 0) { straddleN += 1; straddleArea += g.area; }
}
const confirmSecs = (Date.now() - confirmT0) / 1000;
log(`CONFIRM      : ${NPTS}-pt covering on the ${flagged.length} flagged  =>  UNAMBIGUOUS ${backN}`
  + `   (screen precision ${flagged.length > 0 ? ((100 * backN) / flagged.length).toFixed(2) : '0.00'}%)`
  + `   ${confirmSecs.toFixed(1)}s   [${el()}]`);

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// OPTIONAL — FULL COVERING. The ONLY way to measure the screen's recall on THIS mesh. Off by default;
// when off, recall is NOT-MEASURED and is printed as such rather than assumed 100%.
// ═════════════════════════════════════════════════════════════════════════════════════════════════
let recallPct: number | null = null;
let fullBackN: number | null = null;
let fullBackArea: number | null = null;
if (FULLCOVER) {
  const fT0 = Date.now();
  let fN = 0; let fA = 0; let missed = 0;
  const flaggedSet = new Set(flagged);
  for (let q = 0; q < nScore; q += 1) {
    const t = idx === null ? q : idx[q];
    const g = geomOf(t);
    if (g === null) continue;
    const { nBack } = cover(g);
    if (nBack === NPTS) { fN += 1; fA += g.area; if (!flaggedSet.has(t)) missed += 1; }
    if ((q & 0xFFFFF) === 0 && q > 0) log(`  fullcover ${q}/${nScore}  a=${fN}  [${el()}]`);
  }
  fullBackN = fN; fullBackArea = fA;
  recallPct = fN > 0 ? (100 * (fN - missed)) / fN : 100;
  log(`FULLCOVER    : ${fN} unambiguous over the whole scope; the screen MISSED ${missed}`
    + `  => measured RECALL ${recallPct.toFixed(3)}%   ${((Date.now() - fT0) / 1000).toFixed(1)}s`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// SHAPE CONTEXT — free, and load-bearing: S98 proved the mechanism is NEEDLE SLIVERS (rho > 1 on
// 1178/1178), so an operator that manufactures slivers can TRADE a crease defect for this one.
// ═════════════════════════════════════════════════════════════════════════════════════════════════
const pct = (a: number[], p: number): number | null => (a.length === 0 ? null : a[Math.min(a.length - 1, Math.max(0, Math.floor(p * a.length)))]);
allMinAng.sort((a, b) => a - b);
const minAngP05 = pct(allMinAng, 0.05); const minAngP10 = pct(allMinAng, 0.10); const minAngP50 = pct(allMinAng, 0.50);
const hitMinAng = hits.map((h) => h.minAng).sort((a, b) => a - b);
const sliverShare = allMinAng.length === 0 ? null : (100 * allMinAng.filter((a) => a < 5).length) / allMinAng.length;

hits.sort((a, b) => b.area - a.area);

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// THE VERDICT
// ═════════════════════════════════════════════════════════════════════════════════════════════════
const backAreaPct = areaAll > 0 ? (100 * backArea) / areaAll : null;
const verdict: 'PASS' | 'FAIL' | 'NOT-MEASURED' = !precondOk ? 'NOT-MEASURED' : backN === 0 ? 'PASS' : 'FAIL';

log('');
log('──────────────────────────────────────────────────────────────────────────────────────────');
log('  SHAPE CONTEXT (whole scope)');
log('──────────────────────────────────────────────────────────────────────────────────────────');
log(`  minAngle deg  p05 ${fmt(minAngP05, 3)}   p10 ${fmt(minAngP10, 3)}   p50 ${fmt(minAngP50, 3)}`);
log(`  P(minAngle < 5 deg) : ${fmt(sliverShare, 4, '%')}`);
log(`  back-facing minAngle p05/p50 : ${fmt(pct(hitMinAng, 0.05), 3)} / ${fmt(pct(hitMinAng, 0.5), 3)}`);
log(`  degenerate (zero-area) facets : ${nDegenerate}   [these have NO normal and are NOT scored]`);
log(`  stored STL normal disagrees with winding : ${storedDisagree}`);
log('');
log('══════════════════════════════════════════════════════════════════════════════════════════');
log(`  GATE VERDICT: ${verdict}`);
log('══════════════════════════════════════════════════════════════════════════════════════════');
log(`  UNAMBIGUOUS BACK-FACING FACETS : ${fmtI(backN)}          (PASS requires exactly 0)`);
log(`  ... as a share of scope, COUNT : ${fmt(nScore > 0 ? (100 * backN) / nScore : null, 4, '%')}`);
log(`  ... as a share of scope, AREA  : ${fmt(backAreaPct, 5, '%')}   (${backArea.toFixed(6)} of ${areaAll.toFixed(3)} mm^2)`);
log(`  screen-flagged but STRADDLE only (a fidelity defect, not an orientation one): ${straddleN}  area ${((100 * straddleArea) / Math.max(1e-30, areaAll)).toFixed(5)}%`);
log(`  measured screen RECALL on this mesh : ${fmt(recallPct, 3, '%')}   ${FULLCOVER ? '' : '(PF_S100_FULLCOVER=1 to measure; S98 measured 100% on 2 meshes, NOT proved)'}`);
log(`  full-covering count (cross-check)    : ${fmtI(fullBackN)}`);
log(`  preconditions : wind ${fmt(windFrac === null ? null : windFrac * 100, 3, '%')}   radialMax ${fmt(radialMaxUm, 4, ' um')}   ${precondOk ? 'OK' : `*** FAILED: ${precondNotes.join('; ')} ***`}`);
log(`  cost          : ${(RA_EVALS / 1e6).toFixed(2)}M rA evals total, ${el()} wall`);
log('');
if (verdict === 'FAIL') {
  log('*** FAIL — THE EXPORT CONTAINS FACETS THAT ARE BACK-FACING OVER THEIR WHOLE FOOTPRINT. ***');
  log('*** The standard is ZERO. These will render as inverted normals; the lab renderer cannot   ***');
  log('*** show them (meshRender.cjs is DoubleSide) — use research/render/s98BackfaceRender.cjs.  ***');
  log('');
  log(`  THE ${Math.min(NAMEN, hits.length)} WORST BY AREA — find them by facet index in the STL:`);
  log('   rank   facetIdx        area mm^2   worstDeg   minAngle   diam mm        x         y         z      theta');
  for (let i = 0; i < Math.min(NAMEN, hits.length); i += 1) {
    const h = hits[i];
    log(`   ${String(i + 1).padStart(4)}   ${String(h.t).padStart(9)}   ${h.area.toExponential(4)}   ${h.worstDeg.toFixed(2).padStart(7)}   `
      + `${h.minAng.toFixed(3).padStart(8)}   ${h.diam.toFixed(5)}   ${h.x.toFixed(4).padStart(8)}  ${h.y.toFixed(4).padStart(8)}  ${h.z.toFixed(4).padStart(8)}  ${h.th.toFixed(5)}`);
  }
} else if (verdict === 'PASS') {
  log('*** PASS — ZERO unambiguous back-facing facets. ***');
} else {
  log('*** NOT-MEASURED — a precondition failed, so NO back-facing verdict is emitted. ***');
  for (const n of precondNotes) log(`      ${n}`);
}
log('');
log(`  MODE: ${BLOCK ? 'BLOCKING' : 'REPORT-ONLY (default) — exit 0 regardless of verdict'}`);

// artefacts
const jsonPath = `${OUTDIR}/S100_BFGATE_${TAG}.json`;
writeFileSync(jsonPath, `${JSON.stringify({
  schema: 'pf.s100BfGate/1', tag: TAG, style: STYLE, stl: STL, nTri: M.nTri, scope: nScore,
  verdict, blocking: BLOCK,
  backN, backArea, backAreaPct, backCountPct: nScore > 0 ? (100 * backN) / nScore : null,
  straddleN, straddleArea, screenFlagged: flagged.length,
  screenPrecisionPct: flagged.length > 0 ? (100 * backN) / flagged.length : null,
  recallPct, fullBackN, fullBackArea,
  minAngP05, minAngP10, minAngP50, sliverSharePct: sliverShare,
  degenerate: nDegenerate, storedDisagree,
  windFrac, radialMaxUm, precondOk, precondNotes,
  raEvals: RA_EVALS, secs: (Date.now() - T0) / 1000,
  worst: hits.slice(0, 200),
}, null, 2)}\n`);
log(`  json  -> ${jsonPath}`);
const ndPath = `${OUTDIR}/S100_BFGATE_${TAG}_backfacing.ndjson`;
writeFileSync(ndPath, hits.map((h) => JSON.stringify(h)).join('\n') + (hits.length > 0 ? '\n' : ''));
log(`  facets-> ${ndPath}`);

if (BLOCK) {
  if (verdict === 'FAIL') process.exit(3);
  if (verdict === 'NOT-MEASURED') process.exit(4);
}
process.exit(0);
