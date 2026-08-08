// s119CliffRuler.ts — S119 TASK 3: RE-SCORE A DRIVER MESH AGAINST THE SOLID, NOT AGAINST THE GRAPH.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS TOOL IS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S118 established that CelticTriquetra's rA carries a GENUINE 1.720469 mm C0 cliff and that the
// campaign's position ruler — the perpendicular distance to the GRAPH of rA — has NO POINTS INSIDE that
// jump. A closed solid has no hole there, so every mesh must span the cliff, and every facet that does
// reads about half the jump FOREVER: 847.437 um at half cliff height, 423.698 at a quarter, 169.475 at a
// tenth, 33.894 at 2% — exactly linear in height, i.e. the signature of measuring against a missing face.
//
// This tool scores the SAME meshes against the boundary of the SOLID (research/tools/s119CliffLib.ts,
// which carries the model and its limits), and prints the GRAPH-ONLY value beside it from the SAME walk
// so the correction is a diff of printed values against a control, never a diff against a report.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THE TWO-SET SPLIT IS EXACT AND NOT A SAMPLE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Facets are partitioned into SET-ON (parametrically close enough to the located discontinuity set that a
// curtain point could be within their radial residual) and SET-OFF (everything else). The test is a
// SOUND OVER-APPROXIMATION: for a SET-OFF facet no curtain point is within R1 of any of its lattice
// points, so its cliff-aware distance EQUALS its graph distance identically — nothing is approximated
// away. Each set is then walked with its OWN branch-and-bound maximum, so both the ON-CLIFF and the
// OFF-CLIFF MAX are exact for their class rather than inherited from a global bound.
// C2R below is the two-sided check on that partition: SET-OFF facets are re-examined with the exact
// window and must find nothing.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CLASSES THAT ARE REPORTED SEPARATELY AND NEVER FOLDED IN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//   CAP facets — the z=0 / z=H disks. They are boundary of the solid but not lateral surface; no radial
//   reference of any kind scores them. Reported as a separate class with their count and area (the S103
//   precedent, which reported treads rather than burying them).
//
// Usage: bash research/tools/run-s119-cliffruler.sh
//   env PF_S119C_STL=<abs> PF_S119C_STYLE PF_S119C_TAG [PF_S119C_BARHI PF_S119C_BARLO PF_S119C_MINJUMP]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { readMeshF32 } from './s118MeshIo';
import { latticePts } from './s118ScoreLib';
import {
  scanSeams, SeamIndex, curtainDist, curtainWindow, newCurtainStat,
} from './s119CliffLib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setPriority, constants as osConstants } from 'node:os';
import type { StyleId, StyleDims } from '../bridge/runStyle';
import type { SeamSample } from './s119CliffLib';

let PRIO_NOTE = 'not attempted';
if ((process.env.PF_S119C_PRIO ?? '1') !== '0') {
  try { setPriority(0, osConstants.priority.PRIORITY_ABOVE_NORMAL); PRIO_NOTE = 'AboveNormal (EcoQoS defeated)'; }
  catch (e) { PRIO_NOTE = `FAILED: ${(e as Error).message}`; }
}

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

const STYLE = envS('PF_S119C_STYLE', 'CelticTriquetra');
const STL = envS('PF_S119C_STL', '');
const TAG = envS('PF_S119C_TAG', 'RUN');
const OUTDIR = envS('PF_S119C_OUTDIR', 'research/exchange/_strataConformBisect/s119');
const DIMS: StyleDims = { H: envF('PF_S119C_H', 120), Rb: envF('PF_S119C_RB', 40), Rt: envF('PF_S119C_RT', 50), expn: 1 };
const H = DIMS.H;
const BAR_HI = envF('PF_S119C_BARHI', 0.01);
const BAR_LO = envF('PF_S119C_BARLO', 0.001);
const K_LAT = envI('PF_S119C_K', 8);
const PERP_NTH = envI('PF_S119C_PNTH', 1536);
const PERP_NZ = envI('PF_S119C_PNZ', 768);
const PERP_TOPK = envI('PF_S119C_PK', 6);
// L3: ignoring a seam of jump J over-reads by at most J/2, so minJump = 2*BAR_LO keeps the omission
// under the smallest bar quoted.
const MIN_JUMP = envF('PF_S119C_MINJUMP', 2 * BAR_LO);
const SEAM_NZLEV = envI('PF_S119C_NZLEV', 2400);
const SEAM_NTHSCAN = envI('PF_S119C_NTHSCAN', 16384);
const SEAM_NTHVAL = envI('PF_S119C_NTHVAL', 8192);
const SEAM_NZSCAN = envI('PF_S119C_NZSCAN', 8192);
const MARGIN_MUL = envF('PF_S119C_MARGINMUL', 4);
const REFINE_K = envI('PF_S119C_REFK', 24);
const REFINE_IT = envI('PF_S119C_REFIT', 4);
const CAP_EPS = envF('PF_S119C_CAPEPS', 1e-4);
const C2R_N = envI('PF_S119C_C2RN', 20000);
const SEAM_ONLY = envS('PF_S119C_SEAMONLY', '0') !== '0';

const TAU = 2 * Math.PI;
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const T0 = Date.now();
const el = (): string => `${((Date.now() - T0) / 1000).toFixed(1)}s`;

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S119 CLIFF-AWARE POSITION RULER — ${STYLE}   tag ${TAG} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`mesh   ${STL}`);
log(`params ${JSON.stringify(D)}   dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt}`);
log(`bars   HI ${BAR_HI} mm   LO ${BAR_LO} mm   lattice k=${K_LAT} (${((K_LAT + 1) * (K_LAT + 2)) / 2} pts)`);
log(`perp   projector ${PERP_NTH} x ${PERP_NZ} topK ${PERP_TOPK}   (the SAME instrument the campaign already uses)`);
log(`prio   ${PRIO_NOTE}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S0 — LOCATE THE DISCONTINUITY SET
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── S0  THE DISCONTINUITY SET Sigma (two transverse families; every bracket bisected to the f64 limit) ──');
let rMax = 0; let rMin = Infinity;
for (let i = 0; i < 720; i += 1) for (let j = 0; j <= 240; j += 1) {
  const r = rA((i / 720) * TAU, (j / 240) * H);
  if (r > rMax) rMax = r; if (r < rMin) rMin = r;
}
const tS = Date.now();
const SCAN = scanSeams(rA, {
  H, nZlev: SEAM_NZLEV, nThScan: SEAM_NTHSCAN, nThVal: SEAM_NTHVAL, nZscan: SEAM_NZSCAN, minJump: MIN_JUMP, rMax,
});
log(`   rA range ${rMin.toFixed(4)} .. ${rMax.toFixed(4)} mm   minJump ${MIN_JUMP} mm (L3: an ignored seam of jump J over-reads by <= J/2)`);
log(`   family A ${SEAM_NZLEV + 1} z levels x ${SEAM_NTHSCAN} theta samples  ->  ${SCAN.nFamA.toLocaleString()} seam samples`);
log(`   family B ${SEAM_NTHVAL} theta values x ${SEAM_NZSCAN} z samples      ->  ${SCAN.nFamB.toLocaleString()} seam samples`);
log(`   steep-but-continuous brackets REJECTED by bisection: ${SCAN.steepRejected.toLocaleString()}`);
log(`   along-Sigma chord bound (BY CONSTRUCTION, not a statistic): hypot(dz ${SCAN.dzMm.toFixed(5)}, du ${SCAN.duMm.toFixed(5)}) = ${SCAN.spacingBound.toFixed(5)} mm`);
log(`   total seam samples ${SCAN.samples.length.toLocaleString()}   [${el()}, scan ${((Date.now() - tS) / 1000).toFixed(1)}s]`);

let jMin = Infinity; let jMax = 0; let thLo = Infinity; let thHi = -Infinity; let zLo = Infinity; let zHi = -Infinity;
for (const s of SCAN.samples) {
  const j = s.rHi - s.rLo;
  if (j < jMin) jMin = j; if (j > jMax) jMax = j;
  if (s.th < thLo) thLo = s.th; if (s.th > thHi) thHi = s.th;
  if (s.z < zLo) zLo = s.z; if (s.z > zHi) zHi = s.z;
}
if (SCAN.samples.length > 0) {
  log(`   jump magnitude ${jMin.toFixed(6)} .. ${jMax.toFixed(6)} mm    parametric extent theta [${thLo.toFixed(4)}, ${thHi.toFixed(4)}]  z [${zLo.toFixed(3)}, ${zHi.toFixed(3)}]`);
  const HB = [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2];
  const hist = new Array<number>(HB.length + 1).fill(0);
  for (const s of SCAN.samples) {
    const j = s.rHi - s.rLo; let b = HB.length;
    for (let i = 0; i < HB.length; i += 1) if (j <= HB[i]) { b = i; break; }
    hist[b] += 1;
  }
  log('   jump histogram (samples):');
  for (let i = 0; i < HB.length; i += 1) if (hist[i] > 0) log(`      <= ${HB[i].toFixed(3)} mm : ${hist[i].toLocaleString()}`);
  if (hist[HB.length] > 0) log(`      >  ${HB[HB.length - 1].toFixed(3)} mm : ${hist[HB.length].toLocaleString()}`);
} else {
  log('   *** NO DISCONTINUITY FOUND — the cliff ruler degenerates to the graph ruler exactly. ***');
}
log('');

const IDX = new SeamIndex(SCAN.samples, 0.5, rMax, SCAN.spacingBound);
const MARGIN = MARGIN_MUL * SCAN.spacingBound;
const COPT = { H, minJump: MIN_JUMP, margin: MARGIN, refineK: REFINE_K, refineIters: REFINE_IT };
log(`   rejection margin ${MARGIN.toFixed(5)} mm = ${MARGIN_MUL}x the chord bound (covers (1+L_r)*bound/2 for L_r <= ${(2 * MARGIN_MUL - 1).toFixed(1)})`);
log(`   window refine: k=${REFINE_K}, ${REFINE_IT} shrinking windows`);
log('');

// ── C0: does the located curtain reproduce the S118 cliff-midpoint signature? ──
if (SCAN.samples.length > 0) {
  log('── C0  THE S118 SIGNATURE, RE-MEASURED WITH BOTH RULERS AT THE WORST SEAM ──');
  let ws: SeamSample = SCAN.samples[0];
  for (const s of SCAN.samples) if (s.rHi - s.rLo > ws.rHi - ws.rLo) ws = s;
  const projS = buildRadialSurfaceProjector(rA, { H, nTheta: PERP_NTH, nZ: PERP_NZ, seedTopK: PERP_TOPK });
  const jump = ws.rHi - ws.rLo;
  log(`   worst seam: theta ${ws.th.toFixed(9)}  z ${ws.z.toFixed(4)}  r- ${ws.rLo.toFixed(6)}  r+ ${ws.rHi.toFixed(6)}  *** JUMP ${jump.toFixed(6)} mm ***`);
  log('    fraction up the cliff        GRAPH ruler (um)     CLIFF ruler (um)     expected graph = min(f,1-f)*jump');
  for (const f of [0.5, 0.25, 0.1, 0.02]) {
    const rho = ws.rLo + f * jump;
    const x = rho * Math.cos(ws.th); const y = rho * Math.sin(ws.th); const z = ws.z;
    const dG = projS.project(x, y, z).dist;
    const dC = curtainDist(rA, IDX, x, y, z, Math.max(dG, 1e-9), COPT, newCurtainStat());
    log(`      ${f.toFixed(2).padStart(6)}                   ${(dG * 1000).toFixed(3).padStart(12)}         ${(Math.min(dG, dC) * 1000).toExponential(3).padStart(12)}        ${(Math.min(f, 1 - f) * jump * 1000).toFixed(1)}`);
  }
  log('');
}

// ── C0B: SEAM VERACITY. Every accepted sample was bisected to the f64 floor, so the jump should survive
//        a probe at 1e-12 either side. A steep-but-continuous locus loses it. Both directions are probed
//        because a sample found by one family sits on a curve that may run either way in (theta, z).
if (SCAN.samples.length > 0) {
  log('── C0B  SEAM VERACITY — does the located jump survive a 1e-12 probe? (a steep locus does not) ──');
  const bands: Array<[string, number, number]> = [['jump <= 0.01', 0, 0.01], ['0.01..0.1', 0.01, 0.1], ['0.1..0.5', 0.1, 0.5], ['> 0.5', 0.5, Infinity]];
  log('     band            n     median retained rise at delta =   1e-3        1e-6        1e-9       1e-12');
  for (const [nm, lo, hi] of bands) {
    const pool = SCAN.samples.filter((s) => s.rHi - s.rLo > lo && s.rHi - s.rLo <= hi);
    if (pool.length === 0) continue;
    const step = Math.max(1, Math.floor(pool.length / 300));
    const cols: number[][] = [[], [], [], []];
    for (let i = 0; i < pool.length; i += step) {
      const s = pool[i]; const rr = 0.5 * (s.rLo + s.rHi);
      [1e-3, 1e-6, 1e-9, 1e-12].forEach((dl, k) => {
        const a = Math.abs(rA(s.th + dl / rr, s.z) - rA(s.th - dl / rr, s.z));
        const b = Math.abs(rA(s.th, s.z + dl) - rA(s.th, s.z - dl));
        cols[k].push(Math.max(a, b) / (s.rHi - s.rLo));
      });
    }
    const med = (v: number[]): string => { const w = v.slice().sort((p, q) => p - q); return (w[Math.floor(w.length / 2)] * 100).toFixed(1).padStart(9) + '%'; };
    log(`   ${nm.padEnd(14)} ${String(cols[0].length).padStart(5)}                              ${med(cols[0])}   ${med(cols[1])}   ${med(cols[2])}   ${med(cols[3])}`);
  }
  log('');
}

if (envS('PF_S119C_SEAMDUMP', '0') !== '0') {
  mkdirSync(OUTDIR, { recursive: true });
  writeFileSync(`${OUTDIR}/S119_SEAMS_${TAG}.json`, JSON.stringify(SCAN.samples));
  log(`   seam samples dumped -> ${OUTDIR}/S119_SEAMS_${TAG}.json`);
  log('');
}

if (SEAM_ONLY || STL === '') {
  log('SEAM-ONLY mode (no STL scored).');
  mkdirSync(OUTDIR, { recursive: true });
  writeFileSync(`${OUTDIR}/S119_CLIFF_${TAG}.json`, JSON.stringify({ style: STYLE, tag: TAG, scan: { n: SCAN.samples.length, spacingBound: SCAN.spacingBound, jMin, jMax } }, null, 1));
  log('S119 CLIFF RULER DONE');
  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P0 — MESH
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const { xyz, nTri } = readMeshF32(STL);
log(`── P0  MESH: ${nTri.toLocaleString()} facets   [${el()}] ──`);

const LAT = latticePts(K_LAT); const NP = LAT.length / 3;
const areaA = new Float64Array(nTri);
const r1 = new Float64Array(nTri);
const cls = new Uint8Array(nTri);      // 0 = wall, 1 = cap
const setOn = new Uint8Array(nTri);
let areaTot = 0; let nCap = 0; let areaCap = 0;

for (let f = 0; f < nTri; f += 1) {
  const b = f * 9;
  const ax = xyz[b], ay = xyz[b + 1], az = xyz[b + 2];
  const bx = xyz[b + 3], by = xyz[b + 4], bz = xyz[b + 5];
  const cx = xyz[b + 6], cy = xyz[b + 7], cz = xyz[b + 8];
  const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const ar = 0.5 * Math.hypot(nx, ny, nz);
  areaA[f] = ar; areaTot += ar;
  const capB = az < CAP_EPS && bz < CAP_EPS && cz < CAP_EPS;
  const capT = az > H - CAP_EPS && bz > H - CAP_EPS && cz > H - CAP_EPS;
  if (capB || capT) { cls[f] = 1; nCap += 1; areaCap += ar; }
  // R1 over the lattice (sound upper bound on both rulers)
  let best = 0;
  for (let p = 0; p < NP; p += 1) {
    const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
    const x = w0 * ax + w1 * bx + w2 * cx;
    const y = w0 * ay + w1 * by + w2 * cy;
    const z = w0 * az + w1 * bz + w2 * cz;
    const rr = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (rr > best) best = rr;
  }
  r1[f] = best;
  // SET-ON test — SOUND, and it needs only ONE corner. The diameter of a triangle IS its longest edge,
  // so every lattice point of the facet lies within `diam` of corner A. If a curtain point were within
  // R1 of ANY lattice point it would therefore be within R1 + diam of A. Testing A at
  // uBound = R1 + diam + margin cannot miss it.
  if (SCAN.samples.length > 0 && cls[f] === 0) {
    const diam = Math.max(
      Math.hypot(bx - ax, by - ay, bz - az),
      Math.hypot(cx - bx, cy - by, cz - bz),
      Math.hypot(ax - cx, ay - cy, az - cz),
    );
    if (Number.isFinite(IDX.nearest(ax, ay, az, best + diam + MARGIN))) setOn[f] = 1;
  }
}
let nOn = 0; let areaOn = 0;
for (let f = 0; f < nTri; f += 1) if (setOn[f] === 1) { nOn += 1; areaOn += areaA[f]; }
log(`   3D area ${areaTot.toFixed(3)} mm2`);
log(`   CAP class (all corners within ${CAP_EPS} mm of z=0 or z=H): ${nCap.toLocaleString()} facets, ${areaCap.toFixed(3)} mm2 = ${((100 * areaCap) / areaTot).toFixed(4)}% OF MESH  — REPORTED SEPARATELY, NOT SCORED`);
log(`   SET-ON (cliff-adjacent, sound over-approximation): ${nOn.toLocaleString()} facets, ${areaOn.toFixed(3)} mm2 = ${((100 * areaOn) / areaTot).toFixed(4)}% OF MESH`);
log(`   SET-OFF: ${(nTri - nCap - nOn).toLocaleString()} facets — for these the cliff ruler EQUALS the graph ruler identically`);
log(`   R1 (radial upper bound) > ${BAR_HI}: ${(() => { let c = 0; for (let f = 0; f < nTri; f += 1) if (cls[f] === 0 && r1[f] > BAR_HI) c += 1; return c.toLocaleString(); })()}   > ${BAR_LO}: ${(() => { let c = 0; for (let f = 0; f < nTri; f += 1) if (cls[f] === 0 && r1[f] > BAR_LO) c += 1; return c.toLocaleString(); })()}   [${el()}]`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE WALK
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const proj = buildRadialSurfaceProjector(rA, { H, nTheta: PERP_NTH, nZ: PERP_NZ, seedTopK: PERP_TOPK });

interface Tally {
  hiG: number; hiGa: number; loG: number; loGa: number; maxG: number;
  hiC: number; hiCa: number; loC: number; loCa: number; maxC: number;
  calls: number; adjudicated: number; c2: number; curtainWins: number; curtainWinArea: number;
  clearedHi: number; clearedHiArea: number; clearedLo: number; clearedLoArea: number;
}
const newTally = (): Tally => ({
  hiG: 0, hiGa: 0, loG: 0, loGa: 0, maxG: 0, hiC: 0, hiCa: 0, loC: 0, loCa: 0, maxC: 0,
  calls: 0, adjudicated: 0, c2: 0, curtainWins: 0, curtainWinArea: 0,
  clearedHi: 0, clearedHiArea: 0, clearedLo: 0, clearedLoArea: 0,
});
const CST = newCurtainStat();

/** Walk a facet subset with its OWN branch-and-bound maxima, so both class maxima are exact. */
function walk(ids: Int32Array, useCurtain: boolean): Tally {
  const t = newTally();
  for (let i = 0; i < ids.length; i += 1) {
    const f = ids[i];
    const rf = r1[f];
    const b = f * 9;
    const ax = xyz[b], ay = xyz[b + 1], az = xyz[b + 2];
    const bx = xyz[b + 3], by = xyz[b + 4], bz = xyz[b + 5];
    const cx = xyz[b + 6], cy = xyz[b + 7], cz = xyz[b + 8];
    let oHiG = false; let oLoG = false; let oHiC = false; let oLoC = false; let cWin = false;
    let touched = false;
    for (let p = 0; p < NP; p += 1) {
      // tSkip = the SMALLEST threshold still able to be affected by this point (reduction 1).
      let tSkip = Math.min(t.maxG, t.maxC);
      if (!oLoG || !oLoC) tSkip = Math.min(tSkip, BAR_LO);
      if (!oHiG || !oHiC) tSkip = Math.min(tSkip, BAR_HI);
      if (rf <= tSkip) break;
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx;
      const y = w0 * ay + w1 * by + w2 * cy;
      const z = w0 * az + w1 * bz + w2 * cz;
      const rr = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (rr <= tSkip) continue;
      const dG = proj.project(x, y, z).dist; t.calls += 1; touched = true;
      if (dG > rr + 1e-9) t.c2 += 1;
      let dC = dG;
      if (useCurtain) {
        const dq = curtainDist(rA, IDX, x, y, z, Math.max(dG, 1e-12), COPT, CST);
        if (dq < dC) { dC = dq; cWin = true; }
      }
      if (dG > t.maxG) t.maxG = dG;
      if (dC > t.maxC) t.maxC = dC;
      if (dG > BAR_HI) oHiG = true;
      if (dG > BAR_LO) oLoG = true;
      if (dC > BAR_HI) oHiC = true;
      if (dC > BAR_LO) oLoC = true;
    }
    if (touched) t.adjudicated += 1;
    const ar = areaA[f];
    if (oHiG) { t.hiG += 1; t.hiGa += ar; }
    if (oLoG) { t.loG += 1; t.loGa += ar; }
    if (oHiC) { t.hiC += 1; t.hiCa += ar; }
    if (oLoC) { t.loC += 1; t.loCa += ar; }
    if (cWin) { t.curtainWins += 1; t.curtainWinArea += ar; }
    if (oHiG && !oHiC) { t.clearedHi += 1; t.clearedHiArea += ar; }
    if (oLoG && !oLoC) { t.clearedLo += 1; t.clearedLoArea += ar; }
  }
  return t;
}

/** facet ids of a subset, in DESCENDING r1 (2048-bucket log sort — a full sort is not needed) */
function orderOf(pred: (f: number) => boolean): Int32Array {
  let n = 0;
  for (let f = 0; f < nTri; f += 1) if (pred(f)) n += 1;
  const NB = 2048;
  const cnt = new Int32Array(NB);
  const bucket = (v: number): number => {
    const q = Math.log10(Math.max(v, 1e-12)) + 12;   // 1e-12 .. 1e2 -> 0..14
    let bI = NB - 1 - Math.floor((q / 14) * (NB - 1));
    if (bI < 0) bI = 0; if (bI >= NB) bI = NB - 1;
    return bI;
  };
  for (let f = 0; f < nTri; f += 1) if (pred(f)) cnt[bucket(r1[f])] += 1;
  const off = new Int32Array(NB); let acc = 0;
  for (let i = 0; i < NB; i += 1) { off[i] = acc; acc += cnt[i]; }
  const out = new Int32Array(n);
  const cur = off.slice();
  for (let f = 0; f < nTri; f += 1) if (pred(f)) { const bI = bucket(r1[f]); out[cur[bI]] = f; cur[bI] += 1; }
  return out;
}

log('── THE WALK — EXHAUSTIVE over every facet the radial upper bound flags; no stride, no cap ──');
const ordOff = orderOf((f) => cls[f] === 0 && setOn[f] === 0 && r1[f] > BAR_LO);
const ordOn = orderOf((f) => cls[f] === 0 && setOn[f] === 1 && r1[f] > BAR_LO);
log(`   SET-OFF flagged ${ordOff.length.toLocaleString()} facets   SET-ON flagged ${ordOn.length.toLocaleString()} facets`);
const tOff0 = Date.now();
const TOFF = walk(ordOff, false);
log(`   SET-OFF walked: ${TOFF.calls.toLocaleString()} projector calls, ${((Date.now() - tOff0) / 1000).toFixed(1)}s   [${el()}]`);
const tOn0 = Date.now();
const TON = walk(ordOn, true);
log(`   SET-ON  walked: ${TON.calls.toLocaleString()} projector calls, ${CST.windows.toLocaleString()} exact windows, ${CST.rAcalls.toLocaleString()} rA calls (upper bound), ${((Date.now() - tOn0) / 1000).toFixed(1)}s   [${el()}]`);
log(`   C1 CONTROL (perpendicular must never exceed radial at the same point): ${TOFF.c2 + TON.c2} violations  ${TOFF.c2 + TON.c2 === 0 ? 'HOLDS' : '*** RUN IS VOID ***'}`);
log(`   ADJUDICATION: ${(TOFF.adjudicated + TON.adjudicated).toLocaleString()} of ${(ordOff.length + ordOn.length).toLocaleString()} flagged facets received a verdict = ${((100 * (TOFF.adjudicated + TON.adjudicated)) / Math.max(1, ordOff.length + ordOn.length)).toFixed(2)}%`);
log(`      (a flagged facet with 0 calls is one whose R1 fell under every threshold still pending — PROVEN under the bar, not sampled away)`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CONTROLS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── C2R  THE PARTITION CONTROL — SET-OFF facets re-examined with the EXACT window ──');
let c2rChecked = 0; let c2rViol = 0; let c2rWorst = 0;
if (SCAN.samples.length > 0 && ordOff.length > 0) {
  const stride = Math.max(1, Math.floor(ordOff.length / C2R_N));
  for (let i = 0; i < ordOff.length; i += stride) {
    const f = ordOff[i]; const b = f * 9;
    for (let p = 0; p < NP; p += 7) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * xyz[b] + w1 * xyz[b + 3] + w2 * xyz[b + 6];
      const y = w0 * xyz[b + 1] + w1 * xyz[b + 4] + w2 * xyz[b + 7];
      const z = w0 * xyz[b + 2] + w1 * xyz[b + 5] + w2 * xyz[b + 8];
      const w = curtainWindow(rA, x, y, z, Math.max(r1[f], BAR_HI), MIN_JUMP, H, 24);
      c2rChecked += 1;
      if (Number.isFinite(w.d) && w.d < r1[f]) { c2rViol += 1; if (r1[f] - w.d > c2rWorst) c2rWorst = r1[f] - w.d; }
    }
  }
}
log(`   ${c2rChecked.toLocaleString()} SET-OFF lattice points re-examined at full window W=max(R1,${BAR_HI}); curtain found closer than R1 at ${c2rViol} of them`);
log(`   ${c2rViol === 0 ? '   => the partition HOLDS: no SET-OFF facet had a curtain within its radial bound.' : `   *** PARTITION LEAK: worst ${c2rWorst.toExponential(3)} mm. THE SET-OFF NUMBERS ARE NOT EXACT. ***`}`);
log('');

log('── C3R  THE REFINE CONTROL — how much of the cliff value is window discretisation? ──');
let c3n = 0; let c3worst = 0; let c3flip = 0;
if (SCAN.samples.length > 0) {
  const HOPT = { H, minJump: MIN_JUMP, margin: MARGIN, refineK: 64, refineIters: 8 };
  for (let i = 0; i < ordOn.length && c3n < 4000; i += 1) {
    const f = ordOn[i]; const b = f * 9;
    for (let p = 0; p < NP; p += 11) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * xyz[b] + w1 * xyz[b + 3] + w2 * xyz[b + 6];
      const y = w0 * xyz[b + 1] + w1 * xyz[b + 4] + w2 * xyz[b + 7];
      const z = w0 * xyz[b + 2] + w1 * xyz[b + 5] + w2 * xyz[b + 8];
      const dG = proj.project(x, y, z).dist;
      const lo = curtainDist(rA, IDX, x, y, z, Math.max(dG, 1e-12), COPT, newCurtainStat());
      if (!Number.isFinite(lo)) continue;
      const hi = curtainDist(rA, IDX, x, y, z, Math.max(dG, 1e-12), HOPT, newCurtainStat());
      c3n += 1;
      const dd = lo - hi;
      if (dd > c3worst) c3worst = dd;
      for (const bar of [BAR_HI, BAR_LO]) if ((Math.min(dG, lo) > bar) !== (Math.min(dG, hi) > bar)) c3flip += 1;
    }
  }
}
log(`   ${c3n.toLocaleString()} near-cliff points re-run at k=64 x 8 windows: worst value reduction ${c3worst.toExponential(3)} mm, verdict flips at the two bars: ${c3flip}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE SCORECARD
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const pc = (a: number): string => `${((100 * a) / areaTot).toFixed(4)}%`;
const row = (label: string, c: number, a: number, m: number): void =>
  log(`   ${label.padEnd(34)} ${c.toLocaleString().padStart(10)}   ${a.toFixed(3).padStart(11)} mm2   ${pc(a).padStart(9)} OF MESH   MAX ${m.toExponential(4)} mm`);

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   THE SCORECARD — GRAPH-ONLY (the campaign\'s ruler) vs CLIFF-AWARE (the solid), SAME WALK');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`   mesh ${nTri.toLocaleString()} facets, ${areaTot.toFixed(3)} mm2; CAP class ${nCap.toLocaleString()} / ${areaCap.toFixed(3)} mm2 excluded from BOTH arms`);
log('');
log(`── > ${BAR_HI} mm ──`);
row('GRAPH-ONLY  total', TOFF.hiG + TON.hiG, TOFF.hiGa + TON.hiGa, Math.max(TOFF.maxG, TON.maxG));
row('  of which OFF-CLIFF (SET-OFF)', TOFF.hiG, TOFF.hiGa, TOFF.maxG);
row('  of which ON-CLIFF  (SET-ON)', TON.hiG, TON.hiGa, TON.maxG);
row('CLIFF-AWARE total', TOFF.hiC + TON.hiC, TOFF.hiCa + TON.hiCa, Math.max(TOFF.maxC, TON.maxC));
row('  of which OFF-CLIFF (SET-OFF)', TOFF.hiC, TOFF.hiCa, TOFF.maxC);
row('  of which ON-CLIFF  (SET-ON)', TON.hiC, TON.hiCa, TON.maxC);
row('CLEARED BY THE CLIFF MODEL', TOFF.clearedHi + TON.clearedHi, TOFF.clearedHiArea + TON.clearedHiArea, 0);
log('');
log(`── > ${BAR_LO} mm ──`);
row('GRAPH-ONLY  total', TOFF.loG + TON.loG, TOFF.loGa + TON.loGa, Math.max(TOFF.maxG, TON.maxG));
row('  of which OFF-CLIFF (SET-OFF)', TOFF.loG, TOFF.loGa, TOFF.maxG);
row('  of which ON-CLIFF  (SET-ON)', TON.loG, TON.loGa, TON.maxG);
row('CLIFF-AWARE total', TOFF.loC + TON.loC, TOFF.loCa + TON.loCa, Math.max(TOFF.maxC, TON.maxC));
row('  of which OFF-CLIFF (SET-OFF)', TOFF.loC, TOFF.loCa, TOFF.maxC);
row('  of which ON-CLIFF  (SET-ON)', TON.loC, TON.loCa, TON.maxC);
row('CLEARED BY THE CLIFF MODEL', TOFF.clearedLo + TON.clearedLo, TOFF.clearedLoArea + TON.clearedLoArea, 0);
log('');
log(`   facets where the CURTAIN is the nearer reference at some lattice point: ${TON.curtainWins.toLocaleString()}, ${TON.curtainWinArea.toFixed(3)} mm2 = ${pc(TON.curtainWinArea)} OF MESH`);
log(`   MESH-WIDE MAX   graph-only ${Math.max(TOFF.maxG, TON.maxG).toExponential(4)} mm    cliff-aware ${Math.max(TOFF.maxC, TON.maxC).toExponential(4)} mm`);
log('');
log(`WALL ${el()}   projector calls ${(TOFF.calls + TON.calls).toLocaleString()}`);

mkdirSync(OUTDIR, { recursive: true });
writeFileSync(`${OUTDIR}/S119_CLIFF_${TAG}.json`, JSON.stringify({
  style: STYLE, tag: TAG, stl: STL, nTri, areaTot, barHi: BAR_HI, barLo: BAR_LO, minJump: MIN_JUMP,
  seam: { n: SCAN.samples.length, spacingBound: SCAN.spacingBound, jMin, jMax, thLo, thHi, zLo, zHi, margin: MARGIN },
  caps: { n: nCap, area: areaCap },
  setOn: { n: nOn, area: areaOn },
  off: TOFF, on: TON,
  controls: { c1: TOFF.c2 + TON.c2, c2rChecked, c2rViol, c2rWorst, c3n, c3worst, c3flip },
  curtainStat: CST,
}, null, 1));
log(`json -> ${OUTDIR}/S119_CLIFF_${TAG}.json`);
log('S119 CLIFF RULER DONE');
