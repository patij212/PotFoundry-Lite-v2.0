// s117BigScore.ts — S117 P0: THE HONEST FINAL SCORECARD, FOR MESHES ABOVE THE 2^23 EDGE CEILING.
//
// THIS IS `research/tools/s116zFinalScore.ts` WITH EXACTLY ONE LINE CHANGED — the dihedral import.
// Reproduce with `python research/tools/_mkS117BigScore.py`; the only deltas are this header block and
//     -import { facetDihedrals } from '../bridge/dihedralRuler';
//     +import { facetDihedralsBig as facetDihedrals } from '../bridge/dihedralRulerBig';
// Nothing else. That is deliberate and load-bearing: P0 asks for the shipping CelticTriquetra, the
// shipping GothicArches and the two research-driver meshes to be reported SIDE BY SIDE ON ONE
// INSTRUMENT, and a re-implemented scorer would not be one instrument.
//
// WHY IT WAS NEEDED. `facetDihedrals` pairs half-edges through a V8 `Map`, which caps at 2^23 =
// 8,388,608 entries (MEASURED). The shipping CT outer wall is 6,767,774 facets => ~10.15 M unique edges,
// so the S117 scorecard run for it died with `RangeError: Map maximum size exceeded` at
// dihedralRuler.ts:113, AFTER printing PRECOND and BEFORE topology, dihedral, folds, blades, position
// and orientation. The shipping Gothic wall (1,415,280 facets => 2.12 M edges) fits, which is exactly
// why only the CT half was missing. `facetDihedralsBig` is the same geometry over a counting-sort CSR
// instead of a Map; research/bridge/dihedralRulerBig.test.ts asserts field-for-field equivalence with
// `facetDihedrals` on closed / open / mis-wound / non-manifold / soup fixtures and proves the old ruler
// throws on a >2^23-edge grid where the new one returns the closed-form Euler counts.
//
// CONTROL FOR THIS TOOL (run it before believing any number it prints): score
// celtictriquetra_ring_D--H_S102.stl with it and diff the report against the one s116zFinalScore
// produced for the same mesh. Same instrument, different container => the reports must be identical.
//
// Usage: bash research/tools/run-s117-bigscore.sh   (same env vars as run-s116z-final.sh)
// s116zFinalScore.ts — S116 PHASE 3: THE HONEST FINAL SCORECARD FOR ONE MESH.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS AND WHY IT IS SEPARATE FROM s116Champion
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// s116Champion RANKS candidate meshes on the cheap rulers and applies the pre-registered kill lines.
// This tool SCORES THE WINNER on every ruler the brief asks for, including the two s116Champion
// deliberately left out because they are too slow to run on four meshes:
//
//   * ORIENTATION (orientOfFacet) — whole-mesh EXHAUSTIVE at one canonical setting, plus the three
//     instrument scars swept on a strided sample: inset (scar 1), lattice order k (scar 2), and the
//     finite-difference step h (scar 3). COUNT + AREA + MAX at every rung, never a bare max.
//   * TRUE PERPENDICULAR DISTANCE (buildRadialSurfaceProjector) — the radial residual R1 that every
//     cheap ruler in this campaign uses is pointwise >= the perpendicular distance, and s116RulerBridge
//     measured it over-charging the refinement bill by 1/0.66 on this very style. So the radial number
//     is an OVER-READ of the thing the user actually asked about ("0.01 mm precision"), and a verdict
//     quoted from it alone is not honest. Here the radial pass PREFILTERS (a facet whose witnessed
//     radial residual is under the bar cannot have a perpendicular residual over it AT THE SAME
//     SAMPLE POINTS) and the projector ADJUDICATES the flagged set.
//
// ── WHAT IS AND IS NOT PROVEN, STATED BEFORE ANY NUMBER ────────────────────────────────────────────────
//   R1 and Rperp are both WITNESSED over an order-k barycentric lattice. A lattice max is a LOWER bound
//   on the facet's true sup, so both are UNDER-reads of the per-facet sup and the k-ladder is printed so
//   the reader can see how far from converged it is. Pointwise, radial >= perpendicular, so at a FIXED
//   lattice `Rperp <= R1` is exact and the prefilter is sound: no facet is dropped that the projector
//   could have flagged at those same points.
//   PRECOND is EXHAUSTIVE over every facet corner — no stride (scar 5: S115 found 4 facets at 1,374.8 um,
//   27x the gate, that a stride sample missed completely).
//
// Usage: bash research/tools/run-s116z-final.sh
//   env PF_S116Z_STL=<abs>  PF_S116Z_TAG=<tag>  [PF_S116Z_STYLE=CelticTriquetra]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedralsBig as facetDihedrals } from '../bridge/dihedralRulerBig';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { writeFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const DEG = 180 / Math.PI;

const STYLE = envS('PF_S116Z_STYLE', 'CelticTriquetra');
const STL = envS('PF_S116Z_STL', '');
const TAG = envS('PF_S116Z_TAG', 'FINAL');
const OUTDIR = envS('PF_S116Z_OUTDIR', 'research/exchange/_strataConformBisect/s116');
const DIMS: StyleDims = { H: envF('PF_S116Z_H', 120), Rb: envF('PF_S116Z_RB', 40), Rt: envF('PF_S116Z_RT', 50), expn: 1 };
const H = DIMS.H;
const BAR_HI = envF('PF_S116Z_BARHI', 0.01);
const BAR_LO = envF('PF_S116Z_BARLO', 0.001);
const K_R1 = envI('PF_S116Z_K', 8);
const KSW = envS('PF_S116Z_KSWEEP', '4,8,16,24').split(',').map(Number);
const KSW_N = envI('PF_S116Z_KSWEEP_N', 30000);
const CEIL_N = envI('PF_S116Z_CEILN', 1200);
const H_REF = envF('PF_S116Z_HFD', 2e-6);
const MC_N = envI('PF_S116Z_MCN', 400000);
// orientation
const OR_K = envI('PF_S116Z_ORK', 8);
const OR_INSET = envF('PF_S116Z_ORINSET', 0.05);
const OR_H = envF('PF_S116Z_ORH', 2e-4);
const OR_BARS = envS('PF_S116Z_ORBARS', '1,5,15,45,90,163').split(',').map(Number);
const OR_SWEEP_N = envI('PF_S116Z_ORSWEEPN', 40000);
const OR_WHOLE = envS('PF_S116Z_ORWHOLE', '1') !== '0';
// perpendicular adjudication
const PERP_ON = envS('PF_S116Z_PERP', '1') !== '0';
const PERP_K = envI('PF_S116Z_PERPK', 8);
const PERP_CAP = envI('PF_S116Z_PERPCAP', 220000);
const PERP_CAP_LO = envI('PF_S116Z_PERPCAPLO', 60000);
const PERP_NTH = envI('PF_S116Z_PNTH', 1536);
const PERP_NZ = envI('PF_S116Z_PNZ', 768);
const PERP_TOPK = envI('PF_S116Z_PK', 6);
const PRECOND_TOPN = envI('PF_S116Z_PRETOPN', 400);
const WRITE_SCALARS = envS('PF_S116Z_SCALARS', '1') !== '0';
if (STL.length === 0) { log('*** PF_S116Z_STL required (ABSOLUTE path) ***'); process.exit(2); }

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const ex = (v: number): string => (Number.isFinite(v) ? v.toExponential(3) : 'inf');
const qt = (v: number[] | Float64Array, p: number): number => (v.length === 0 ? NaN : v[Math.min(v.length - 1, Math.floor(v.length * p))]);

// ── analytic ────────────────────────────────────────────────────────────────────────────────────────
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

interface JsonOut { [k: string]: unknown }
const J: JsonOut = { tag: TAG, stl: STL, style: STYLE, params: D, dims: DIMS, barHi: BAR_HI, barLo: BAR_LO };

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S116 PHASE 3 — THE HONEST FINAL SCORECARD.  ${STYLE}  tag ${TAG} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`mesh   ${STL}`);
log(`params ${JSON.stringify(D)}   dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=1`);
log(`bars   HI ${BAR_HI} mm   LO ${BAR_LO} mm`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ANALYTIC CEILING (scar 3: h swept) + BAND AREA
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function ceilingAt(hfd: number, N: number): { gmax: number; deg: number } {
  let gmax = 0;
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const th = (2 * Math.PI * (i + 0.5)) / N; const z = (H * (j + 0.5)) / N;
      const r0 = rA(th, z);
      const hT = hfd / Math.max(1e-9, r0);
      const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
      let zl = z - hfd; let zh = z + hfd;
      if (zl < 0) { zl = 0; zh = Math.min(H, 2 * hfd); }
      if (zh > H) { zh = H; zl = Math.max(0, H - 2 * hfd); }
      const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
      const g = Math.hypot(rt / r0, rz);
      if (g > gmax) gmax = g;
    }
  }
  return { gmax, deg: 2 * Math.atan(gmax) * DEG };
}
log('── ANALYTIC CEILING  CEIL = 2*atan(max|grad r|), h SWEPT (scar 3) ──');
const ceilLad: Array<{ h: number; gmax: number; deg: number }> = [];
for (const hh of [2e-6, 2e-5, 2e-4, 1e-3]) {
  const c = ceilingAt(hh, 400); ceilLad.push({ h: hh, ...c });
  log(`   h=${ex(hh)} (400^2)  max|grad r| ${c.gmax.toFixed(4)}  CEIL ${c.deg.toFixed(3)} deg`);
}
const CREF = ceilingAt(H_REF, CEIL_N);
const CEIL_DEG = CREF.deg;
log(`   REFERENCE h=${ex(H_REF)} on ${CEIL_N}^2: max|grad r| ${CREF.gmax.toFixed(4)}  *** CEIL = ${CEIL_DEG.toFixed(3)} deg *** ${el()}`);
J.ceiling = { ladder: ceilLad, refDeg: CEIL_DEG, refGmax: CREF.gmax };
log('');

let mcArea = 0; let mcSe = 0;
{
  let s = 0x9e3779b97f4a7c15n;
  const rnd = (): number => { s = (s + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn; let z = s; z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn; z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn; z ^= z >> 31n; return Number(z >> 11n) / 9007199254740992; };
  const hfd = H_REF; let sum = 0; let sum2 = 0;
  for (let i = 0; i < MC_N; i += 1) {
    const th = 2 * Math.PI * rnd(); const z = H * rnd();
    const r0 = rA(th, z);
    const hT = hfd / Math.max(1e-9, r0);
    const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
    let zl = z - hfd; let zh = z + hfd;
    if (zl < 0) { zl = 0; zh = Math.min(H, 2 * hfd); }
    if (zh > H) { zh = H; zl = Math.max(0, H - 2 * hfd); }
    const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
    const Jc = Math.sqrt(rt * rt + r0 * r0 * (1 + rz * rz));
    sum += Jc; sum2 += Jc * Jc;
  }
  const dom = 2 * Math.PI * H;
  const mean = sum / MC_N; const varr = Math.max(0, sum2 / MC_N - mean * mean);
  mcArea = mean * dom; mcSe = dom * Math.sqrt(varr / MC_N);
  log(`── ANALYTIC BAND AREA (Monte-Carlo, fixed seed, n=${MC_N}): ${mcArea.toFixed(3)} +/- ${mcSe.toFixed(3)} mm2 (1 s.e.) ${el()} ──`);
}
J.analyticBandMm2 = mcArea; J.analyticBandSe = mcSe;
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// LOAD + PER-FACET GEOMETRY
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const latticePts = (k: number): Float64Array => {
  const out: number[] = [];
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) out.push((k - i - j) / k, i / k, j / k);
  return new Float64Array(out);
};
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`── MESH: ${nTri.toLocaleString()} facets ${el()} ──`);

const areaA = new Float64Array(nTri);
const r1 = new Float64Array(nTri);
const grA = new Float64Array(nTri);
const minAltUm = new Float64Array(nTri);
const apsSign = new Int8Array(nTri);
const thA = new Float64Array(nTri * 3); // UNWRAPPED theta per corner (scar: orientOfFacet requires it)
let area3D = 0;
{
  const LAT = latticePts(K_R1); const NP = LAT.length / 3;
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const ar = 0.5 * Math.hypot(nx, ny, nz);
    areaA[f] = ar; area3D += ar;
    const tha = Math.atan2(ay, ax);
    const thb = tha + dThRaw(tha, Math.atan2(by, bx));
    const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
    thA[f * 3] = tha; thA[f * 3 + 1] = thb; thA[f * 3 + 2] = thc;
    const rm = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
    const ua = tha * rm, ub = thb * rm, uc = thc * rm;
    const aps = 0.5 * ((ub - ua) * (cz - az) - (uc - ua) * (bz - az));
    apsSign[f] = aps > 0 ? 1 : aps < 0 ? -1 : 0;
    const apa = Math.abs(aps);
    grA[f] = apa > 0 ? ar / apa : Infinity;
    const e1 = Math.hypot(ub - ua, bz - az), e2 = Math.hypot(uc - ub, cz - bz), e3 = Math.hypot(ua - uc, az - cz);
    const emax = Math.max(e1, e2, e3);
    minAltUm[f] = emax > 0 ? (2 * apa / emax) * 1000 : 0;
    let w = 0;
    for (let p = 0; p < NP; p += 1) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > w) w = dd;
    }
    r1[f] = w;
  }
}
log(`   3D area ${area3D.toFixed(3)} mm2   analytic band ${mcArea.toFixed(3)} mm2   EXCESS ${(area3D - mcArea).toFixed(3)} mm2 = ${pct(area3D - mcArea, mcArea)}%  ${el()}`);
J.nTri = nTri; J.area3D = area3D; J.areaExcessPct = ((area3D - mcArea) / mcArea) * 100;
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRECOND — EXHAUSTIVE over EVERY corner (scar 5)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const preFacetUm = new Float64Array(nTri);
const preWorst: Array<{ f: number; v: number; um: number }> = [];
{
  const devs: number[] = [];
  let mx = 0; let o10 = 0; let o50 = 0; let o1 = 0;
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9; let w = 0;
    for (let v = 0; v < 3; v += 1) {
      const x = xyz[o + v * 3]; const y = xyz[o + v * 3 + 1]; const z = xyz[o + v * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z)) * 1000;
      if (dd > w) w = dd;
      if (dd > 1) o1 += 1;
      if (dd > 10) { o10 += 1; preWorst.push({ f, v, um: dd }); }
      if (dd > 50) o50 += 1;
      if (((f * 3 + v) % 37) === 0) devs.push(dd);
    }
    preFacetUm[f] = w; if (w > mx) mx = w;
  }
  devs.sort((a, b) => a - b);
  let aOver10 = 0; for (let f = 0; f < nTri; f += 1) if (preFacetUm[f] > 10) aOver10 += areaA[f];
  log('── PRECOND  max |r_mesh - rA| at EVERY facet corner — EXHAUSTIVE, NO STRIDE (scar 5) ──');
  log(`   corners ${(nTri * 3).toLocaleString()}   p50 ${ex(qt(devs, 0.5))} um   p99 ${ex(qt(devs, 0.99))} um   *** MAX ${mx.toFixed(3)} um ***`);
  log(`   over 1 um ${o1.toLocaleString()} (${pct(o1, nTri * 3)}%)   over 10 um ${o10.toLocaleString()} (${pct(o10, nTri * 3)}%)   over 50 um ${o50.toLocaleString()}`);
  log(`   AREA of facets with a corner over 10 um: ${aOver10.toFixed(4)} mm2 = ${pct(aOver10, area3D)}% OF MESH`);
  J.precond = { max: mx, p50: qt(devs, 0.5), p99: qt(devs, 0.99), over1: o1, over10: o10, over50: o50, areaOver10: aOver10, corners: nTri * 3 };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// TOPOLOGY + DIHEDRAL + FOLD CLASSES
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const idx = new Int32Array(nTri * 3);
for (let i = 0; i < nTri * 3; i += 1) idx[i] = i;
const DR = facetDihedrals(xyz, idx);
log('── TOPOLOGY ──');
log(`   interior ${DR.interiorEdges.toLocaleString()}   boundary ${DR.boundaryEdges}   NON-MANIFOLD ${DR.nonManifoldEdges}   INCONSISTENT WINDING ${DR.inconsistentEdges}`);
J.topology = { interior: DR.interiorEdges, boundary: DR.boundaryEdges, nonManifold: DR.nonManifoldEdges, inconsistent: DR.inconsistentEdges };
log('');

const dihDeg = new Float64Array(nTri);
for (let f = 0; f < nTri; f += 1) dihDeg[f] = DR.perFacetMaxRad[f] * DEG;
log('── DIHEDRAL LADDER (COUNT + AREA + MAX, per facet; scar 4 = the bar is SWEPT) ──');
log('      bar deg        count       area mm2     %MESH area     MAX deg');
const dihLad: Array<{ bar: number; count: number; area: number; frac: number; max: number }> = [];
for (const bar of [45, 90, 150, CEIL_DEG, 170, 175, 178, 179.5]) {
  let c = 0; let a = 0; let mx = 0;
  for (let f = 0; f < nTri; f += 1) if (dihDeg[f] > bar) { c += 1; a += areaA[f]; if (dihDeg[f] > mx) mx = dihDeg[f]; }
  dihLad.push({ bar, count: c, area: a, frac: (a / area3D) * 100, max: mx });
  log(`   ${bar.toFixed(2).padStart(10)} ${String(c).padStart(12)} ${a.toFixed(3).padStart(14)} ${(pct(a, area3D) + '%').padStart(15)} ${mx.toFixed(3).padStart(11)}`);
}
J.dihedralLadder = dihLad;

// over-ceiling class + blades + poles + inverted
let ceilC = 0; let ceilA = 0; let ndlC = 0; let ndlA = 0;
let bladeC = 0; let bladeA = 0; let invC = 0; let invA = 0; let poleC = 0; let poleA = 0;
for (let f = 0; f < nTri; f += 1) {
  const over = dihDeg[f] > CEIL_DEG;
  if (over) { ceilC += 1; ceilA += areaA[f]; if (minAltUm[f] < 2) { ndlC += 1; ndlA += areaA[f]; } }
  if (minAltUm[f] < 2) { bladeC += 1; bladeA += areaA[f]; }
  if (apsSign[f] < 0) { invC += 1; invA += areaA[f]; }
  if (grA[f] >= 100) { poleC += 1; poleA += areaA[f]; }
}
log('');
log('── FOLD / BLADE / DEGENERACY CLASSES (COUNT + AREA + share OF MESH — never a sub-class share) ──');
log(`   OVER-ANALYTIC-CEILING (dihedral > ${CEIL_DEG.toFixed(3)} deg; the surface CANNOT produce it):`);
log(`      ${ceilC.toLocaleString()} facets (${pct(ceilC, nTri)}% of count)   ${ceilA.toFixed(3)} mm2 = ${pct(ceilA, area3D)}% OF MESH`);
log(`      of which arc-space NEEDLES (<2 um min altitude): ${ndlC.toLocaleString()}, ${ndlA.toFixed(3)} mm2 = ${pct(ndlA, area3D)}% OF MESH`);
log(`   BLADE class whole-mesh (<2 um arc-space min altitude, regardless of dihedral):`);
log(`      ${bladeC.toLocaleString()} facets (${pct(bladeC, nTri)}%)   ${bladeA.toFixed(3)} mm2 = ${pct(bladeA, area3D)}% OF MESH`);
log(`   INVERTED parametric footprint (negative signed area):`);
log(`      ${invC.toLocaleString()} facets (${pct(invC, nTri)}%)   ${invA.toFixed(3)} mm2 = ${pct(invA, area3D)}% OF MESH`);
log(`   DEGENERACY POLE (graphRatio >= 100):`);
log(`      ${poleC.toLocaleString()} facets (${pct(poleC, nTri)}%)   ${poleA.toFixed(3)} mm2 = ${pct(poleA, area3D)}% OF MESH`);
J.folds = {
  ceilDeg: CEIL_DEG, ceilCount: ceilC, ceilArea: ceilA, ceilPct: (ceilA / area3D) * 100,
  needleCount: ndlC, needleArea: ndlA, needlePct: (ndlA / area3D) * 100,
  bladeCount: bladeC, bladeArea: bladeA, bladePct: (bladeA / area3D) * 100,
  invCount: invC, invArea: invA, invPct: (invA / area3D) * 100,
  poleCount: poleC, poleArea: poleA, polePct: (poleA / area3D) * 100,
};
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// POSITION — RADIAL R1 (scar 2: k SWEPT), COUNT + AREA + MAX at both bars
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── POSITION, RADIAL RESIDUAL R1 — EXHAUSTIVE over all facets at k=' + K_R1 + ' ──');
{
  let cH = 0, aH = 0, cL = 0, aL = 0, mx = 0;
  const samp: number[] = [];
  for (let f = 0; f < nTri; f += 1) {
    const v = r1[f];
    if (v > BAR_HI) { cH += 1; aH += areaA[f]; }
    if (v > BAR_LO) { cL += 1; aL += areaA[f]; }
    if (v > mx) mx = v;
    if ((f % 31) === 0) samp.push(v);
  }
  samp.sort((a, b) => a - b);
  log(`   > ${BAR_HI} mm : ${cH.toLocaleString()} facets (${pct(cH, nTri)}%)   ${aH.toFixed(3)} mm2 = ${pct(aH, area3D)}% OF MESH`);
  log(`   > ${BAR_LO} mm : ${cL.toLocaleString()} facets (${pct(cL, nTri)}%)   ${aL.toFixed(3)} mm2 = ${pct(aL, area3D)}% OF MESH`);
  log(`   p50 ${ex(qt(samp, 0.5))}  p90 ${ex(qt(samp, 0.9))}  p99 ${ex(qt(samp, 0.99))}  *** MAX ${ex(mx)} mm ***`);
  J.r1 = { overHi: cH, areaHi: aH, pctHi: (aH / area3D) * 100, overLo: cL, areaLo: aL, pctLo: (aL / area3D) * 100, max: mx, p50: qt(samp, 0.5), p90: qt(samp, 0.9), p99: qt(samp, 0.99) };
}
log('   SCAR 2 — barycentric lattice order k (strided ladder; the numbers above are EXHAUSTIVE at k=' + K_R1 + '):');
log('     k    pts   MAX R1 mm      mean R1 mm      >HI      >LO   (n)');
{
  const st = Math.max(1, Math.floor(nTri / KSW_N));
  const kl: Array<{ k: number; max: number; mean: number; oh: number; ol: number; n: number }> = [];
  for (const k of KSW) {
    const L = latticePts(k); const np = L.length / 3;
    let mx = 0, sum = 0, n = 0, oh = 0, ol = 0;
    for (let f = 0; f < nTri; f += st) {
      const o = f * 9;
      const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
      const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
      const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
      let w = 0;
      for (let p = 0; p < np; p += 1) {
        const w0 = L[p * 3], w1 = L[p * 3 + 1], w2 = L[p * 3 + 2];
        const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
        const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
        if (dd > w) w = dd;
      }
      if (w > mx) mx = w; sum += w; n += 1; if (w > BAR_HI) oh += 1; if (w > BAR_LO) ol += 1;
    }
    kl.push({ k, max: mx, mean: sum / n, oh, ol, n });
    log(`   ${String(k).padStart(4)} ${String(np).padStart(6)}  ${ex(mx).padStart(12)}  ${ex(sum / n).padStart(12)}  ${String(oh).padStart(7)}  ${String(ol).padStart(7)}   (${n})`);
  }
  J.r1KLadder = kl;
}
log(`   ${el()}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// POSITION — TRUE PERPENDICULAR, adjudicating the radially-flagged set
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const rPerp = new Float64Array(nTri); rPerp.fill(-1);
if (PERP_ON) {
  log('── POSITION, TRUE PERPENDICULAR DISTANCE (buildRadialSurfaceProjector) ──');
  log('   The radial residual is pointwise >= the perpendicular distance, so a facet under the bar');
  log('   radially is under it perpendicularly AT THE SAME POINTS. Only the flagged set is adjudicated.');
  const tP = Date.now();
  const proj = buildRadialSurfaceProjector(rA, { H, nTheta: PERP_NTH, nZ: PERP_NZ, seedTopK: PERP_TOPK });
  log(`   projector grid ${proj.gridThetaCount} x ${proj.gridZCount} = ${proj.sampleCount.toLocaleString()} samples, built in ${((Date.now() - tP) / 1000).toFixed(1)} s`);
  const L = latticePts(PERP_K); const np = L.length / 3;
  const perpOfFacet = (f: number): number => {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    let w = 0;
    for (let p = 0; p < np; p += 1) {
      const w0 = L[p * 3], w1 = L[p * 3 + 1], w2 = L[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      const dd = proj.project(x, y, z).dist;
      if (dd > w) w = dd;
    }
    return w;
  };
  // ---- HI bar: full adjudication of the flagged set (subsampled only if it exceeds the cap) ----
  const flagHi: number[] = [];
  for (let f = 0; f < nTri; f += 1) if (r1[f] > BAR_HI) flagHi.push(f);
  const runHi = flagHi.length <= PERP_CAP ? flagHi : flagHi.filter((_v, i) => i % Math.ceil(flagHi.length / PERP_CAP) === 0);
  const fullHi = runHi.length === flagHi.length;
  let stillC = 0; let stillA = 0; let clearC = 0; let clearA = 0; let mxP = 0; let runA = 0;
  const tH = Date.now();
  for (const f of runHi) {
    const dp = perpOfFacet(f); rPerp[f] = dp; runA += areaA[f];
    if (dp > BAR_HI) { stillC += 1; stillA += areaA[f]; if (dp > mxP) mxP = dp; } else { clearC += 1; clearA += areaA[f]; }
  }
  const scale = fullHi ? 1 : flagHi.length / runHi.length;
  log(`   HI bar ${BAR_HI} mm: radially flagged ${flagHi.length.toLocaleString()} facets; adjudicated ${runHi.length.toLocaleString()}${fullHi ? ' (ALL)' : ` (strided 1-in-${Math.ceil(flagHi.length / PERP_CAP)})`} in ${((Date.now() - tH) / 1000).toFixed(1)} s`);
  log(`      STILL OVER perpendicularly: ${Math.round(stillC * scale).toLocaleString()} facets   ${(stillA * scale).toFixed(3)} mm2 = ${pct(stillA * scale, area3D)}% OF MESH   MAX ${ex(mxP)} mm`);
  log(`      CLEARED by the honest ruler: ${Math.round(clearC * scale).toLocaleString()} facets   ${(clearA * scale).toFixed(3)} mm2 = ${pct(clearA * scale, area3D)}% OF MESH`);
  log(`      => the radial ruler OVER-READS the >${BAR_HI} mm area by ${(runA / Math.max(1e-12, stillA)).toFixed(3)}x on this class`);
  J.perpHi = { flagged: flagHi.length, adjudicated: runHi.length, full: fullHi, stillCount: Math.round(stillC * scale), stillArea: stillA * scale, stillPct: (stillA * scale / area3D) * 100, clearedCount: Math.round(clearC * scale), clearedArea: clearA * scale, max: mxP };
  // ---- LO bar: strided sample of the flagged set, with a block s.e. ----
  const flagLo: number[] = [];
  for (let f = 0; f < nTri; f += 1) if (r1[f] > BAR_LO) flagLo.push(f);
  const stL = Math.max(1, Math.ceil(flagLo.length / PERP_CAP_LO));
  const runLo = flagLo.filter((_v, i) => i % stL === 0);
  let sC = 0; let sA = 0; let sMx = 0; let totA = 0;
  const NB = 8; const bl = new Float64Array(NB); const blTot = new Float64Array(NB); const per = Math.ceil(runLo.length / NB);
  const tL = Date.now();
  for (let i = 0; i < runLo.length; i += 1) {
    const f = runLo[i]; const b = Math.min(NB - 1, Math.floor(i / per));
    const dp = rPerp[f] >= 0 ? rPerp[f] : perpOfFacet(f); rPerp[f] = dp;
    totA += areaA[f]; blTot[b] += areaA[f];
    if (dp > BAR_LO) { sC += 1; sA += areaA[f]; bl[b] += areaA[f]; if (dp > sMx) sMx = dp; }
  }
  const shr = totA > 0 ? sA / totA : 0;
  const bs: number[] = []; for (let b = 0; b < NB; b += 1) if (blTot[b] > 0) bs.push(bl[b] / blTot[b]);
  const bm = bs.reduce((a, x) => a + x, 0) / Math.max(1, bs.length);
  const bse = Math.sqrt(bs.reduce((a, x) => a + (x - bm) * (x - bm), 0) / Math.max(1, bs.length - 1)) / Math.sqrt(Math.max(1, bs.length));
  const areaLoFlag = J.r1 !== undefined ? (J.r1 as { areaLo: number }).areaLo : 0;
  log(`   LO bar ${BAR_LO} mm: radially flagged ${flagLo.length.toLocaleString()} facets; adjudicated a 1-in-${stL} sample (${runLo.length.toLocaleString()}) in ${((Date.now() - tL) / 1000).toFixed(1)} s`);
  log(`      share of the FLAGGED AREA that is still over perpendicularly: ${(shr * 100).toFixed(3)}% +/- ${(bse * 100).toFixed(3)} (8-block s.e.)`);
  log(`      => estimated mesh area still over ${BAR_LO} mm: ${(areaLoFlag * shr).toFixed(3)} mm2 = ${pct(areaLoFlag * shr, area3D)}% OF MESH   sample MAX ${ex(sMx)} mm`);
  J.perpLo = { flagged: flagLo.length, sampled: runLo.length, shareOfFlaggedArea: shr, se: bse, estAreaPct: (areaLoFlag * shr / area3D) * 100, sampleMax: sMx };

  // ---- PRECOND worst corners adjudicated perpendicularly ----
  if (preWorst.length > 0) {
    preWorst.sort((a, b) => b.um - a.um);
    const top = preWorst.slice(0, Math.min(PRECOND_TOPN, preWorst.length));
    let mxRad = 0; let mxPerp = 0; let sumRatio = 0;
    for (const w of top) {
      const o = w.f * 9 + w.v * 3;
      const dp = proj.project(xyz[o], xyz[o + 1], xyz[o + 2]).dist * 1000;
      if (w.um > mxRad) mxRad = w.um;
      if (dp > mxPerp) mxPerp = dp;
      sumRatio += w.um / Math.max(1e-9, dp);
    }
    log('');
    log(`   PRECOND ADJUDICATION — the ${top.length} worst corners by RADIAL deviation, re-measured PERPENDICULARLY:`);
    log(`      radial MAX ${mxRad.toFixed(3)} um   ***PERPENDICULAR MAX ${mxPerp.toFixed(3)} um***   mean over-read ${(sumRatio / top.length).toFixed(1)}x`);
    log('      (a large gap here means those corners sit ON a cliff and the RADIAL ruler, not the mesh, is at fault)');
    J.precondPerp = { n: top.length, radialMax: mxRad, perpMax: mxPerp, meanOverRead: sumRatio / top.length };
  }
  log(`   ${el()}`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ORIENTATION — normDeg. SCARS 1 (inset), 2 (k), 3 (h) ALL SWEPT.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const normDeg = new Float64Array(nTri);
{
  const scratch = new Float64Array(12);
  const orientOne = (f: number, k: number, inset: number, ns: (th: number, z: number, out: Float64Array) => number, mode: 'winding' | 'outward'): number => {
    const o = f * 9;
    const r = orientOfFacet(ns,
      xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
      thA[f * 3], thA[f * 3 + 1], thA[f * 3 + 2], { k, inset, orient: mode, scratch });
    return r.normDeg;
  };
  log('── ORIENTATION normDeg (deg).  ALL THREE INSTRUMENT SCARS SWEPT. ──');
  log(`   canonical: k=${OR_K}  inset=${OR_INSET}  hArc=hZ=${ex(OR_H)}  convention=winding (an inverted facet reads ~180)`);
  if (OR_WHOLE) {
    const ns = fdNormals(rA, H, OR_H, OR_H);
    const tO = Date.now();
    let mx = 0; let nan = 0;
    for (let f = 0; f < nTri; f += 1) {
      const v = orientOne(f, OR_K, OR_INSET, ns, 'winding');
      normDeg[f] = Number.isFinite(v) ? v : 0;
      if (!Number.isFinite(v)) nan += 1;
      if (normDeg[f] > mx) mx = normDeg[f];
    }
    log(`   WHOLE-MESH EXHAUSTIVE at the canonical setting, ${((Date.now() - tO) / 1000).toFixed(1)} s (${nan} degenerate facets scored 0):`);
    log('      bar deg        count       area mm2     %MESH area');
    const orLad: Array<{ bar: number; count: number; area: number; frac: number }> = [];
    for (const bar of OR_BARS) {
      let c = 0; let a = 0;
      for (let f = 0; f < nTri; f += 1) if (normDeg[f] > bar) { c += 1; a += areaA[f]; }
      orLad.push({ bar, count: c, area: a, frac: (a / area3D) * 100 });
      log(`   ${bar.toFixed(2).padStart(10)} ${String(c).padStart(12)} ${a.toFixed(3).padStart(14)} ${(pct(a, area3D) + '%').padStart(15)}`);
    }
    const sm: number[] = []; for (let f = 0; f < nTri; f += 31) sm.push(normDeg[f]); sm.sort((a, b) => a - b);
    log(`      p50 ${qt(sm, 0.5).toFixed(4)}  p90 ${qt(sm, 0.9).toFixed(4)}  p99 ${qt(sm, 0.99).toFixed(4)}  *** MAX ${mx.toFixed(4)} deg ***`);
    J.orientWhole = { k: OR_K, inset: OR_INSET, h: OR_H, ladder: orLad, max: mx, p50: qt(sm, 0.5), p90: qt(sm, 0.9), p99: qt(sm, 0.99) };
  }
  // ---- SWEEPS on a strided sample ----
  const st = Math.max(1, Math.floor(nTri / OR_SWEEP_N));
  const samp: number[] = []; let sampArea = 0;
  for (let f = 0; f < nTri; f += st) { samp.push(f); sampArea += areaA[f]; }
  const swp: Array<Record<string, unknown>> = [];
  const row = (label: string, k: number, inset: number, hh: number, mode: 'winding' | 'outward'): void => {
    const ns = fdNormals(rA, H, hh, hh);
    let mx = 0; let c5 = 0; let a5 = 0; let c45 = 0; let a45 = 0; let c1 = 0; let a1 = 0;
    for (const f of samp) {
      const v = orientOne(f, k, inset, ns, mode);
      if (!Number.isFinite(v)) continue;
      if (v > mx) mx = v;
      if (v > 1) { c1 += 1; a1 += areaA[f]; }
      if (v > 5) { c5 += 1; a5 += areaA[f]; }
      if (v > 45) { c45 += 1; a45 += areaA[f]; }
    }
    log(`   ${label.padEnd(34)} ${mx.toFixed(3).padStart(9)} ${String(c1).padStart(7)} ${(pct(a1, sampArea) + '%').padStart(9)} ${String(c5).padStart(7)} ${(pct(a5, sampArea) + '%').padStart(9)} ${String(c45).padStart(6)} ${(pct(a45, sampArea) + '%').padStart(9)}`);
    swp.push({ label, k, inset, h: hh, mode, max: mx, c1, a1pct: (a1 / sampArea) * 100, c5, a5pct: (a5 / sampArea) * 100, c45, a45pct: (a45 / sampArea) * 100 });
  };
  log('');
  log(`   SWEEPS on a 1-in-${st} strided sample (${samp.length.toLocaleString()} facets, ${sampArea.toFixed(1)} mm2). AREA shares are OF THE SAMPLE.`);
  log('   setting                                  MAX     >1deg   area%    >5deg   area%   >45deg   area%');
  log('   -- SCAR 1: inset (default 0 is WRONG on crease classes; honest value 0.05) --');
  for (const ins of [0, 0.02, 0.05, 0.10, 0.20]) row(`inset=${ins.toFixed(2)}  k=${OR_K} h=${ex(OR_H)}`, OR_K, ins, OR_H, 'winding');
  log('   -- SCAR 2: lattice order k --');
  for (const k of [2, 4, 8, 16]) row(`k=${k}  inset=${OR_INSET} h=${ex(OR_H)}`, k, OR_INSET, OR_H, 'winding');
  log('   -- SCAR 3: finite-difference step h --');
  for (const hh of [2e-5, 5e-5, 2e-4, 5e-4, 1e-3]) row(`h=${ex(hh)}  k=${OR_K} inset=${OR_INSET}`, OR_K, OR_INSET, hh, 'winding');
  log('   -- CONVENTION (the ruler warns maxima move a lot between them) --');
  row(`orient=outward  k=${OR_K} inset=${OR_INSET}`, OR_K, OR_INSET, OR_H, 'outward');
  J.orientSweep = { stride: st, n: samp.length, sampleArea: sampArea, rows: swp };
  log(`   ${el()}`);
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// SCALARS FOR THE RENDERER
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (WRITE_SCALARS) {
  const p1 = `${OUTDIR}/S116Z_${TAG}_normdeg.f64`;
  const p2 = `${OUTDIR}/S116Z_${TAG}_r1um.f64`;
  const r1um = new Float64Array(nTri); for (let f = 0; f < nTri; f += 1) r1um[f] = r1[f] * 1000;
  writeFileSync(p1, Buffer.from(normDeg.buffer, normDeg.byteOffset, normDeg.byteLength));
  writeFileSync(p2, Buffer.from(r1um.buffer, r1um.byteOffset, r1um.byteLength));
  log(`── scalars for s116Render: ${p1}`);
  log(`                            ${p2}`);
  J.scalarNormDeg = p1; J.scalarR1um = p2;
}

const jp = `${OUTDIR}/S116Z_FINAL_${TAG}.json`;
writeFileSync(jp, JSON.stringify(J, null, 2));
log('');
log(`json -> ${jp}  ${el()}`);
log('S116 PHASE 3 FINAL SCORECARD DONE');
