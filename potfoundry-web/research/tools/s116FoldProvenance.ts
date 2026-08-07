// s116FoldProvenance.ts — S116 "FIND THE LINE THAT EMITS A FOLD".
//
// WHAT THIS DOES, and what it deliberately does NOT do.
//
// S115 established that CelticTriquetra's >45deg dihedral class is 67.67% FLANK-ALIGNED NEEDLE PAIRS and
// that 72.76% of its area carries a dihedral above the surface's own analytic ceiling (163.41 deg), i.e.
// the SURFACE cannot produce it. This tool takes the ACTUAL fold facets out of the shipped STL and asks
// ONE question per facet: WHICH GENERATOR CONSTRUCT PUT IT THERE?
//
// It is a PROVENANCE classifier, not a fidelity ruler. Nothing here scores accuracy; every bucket is a
// STRUCTURAL predicate on the facet's own (theta, z, r) footprint plus the surface's own discontinuity
// set, both computed exhaustively (NEVER stride-sampled — S115 scar #5).
//
// BUCKETS (evaluated in this order; first match wins, and the order is reported so it can be re-cut):
//   T  TREAD          — every vertex inside a detected C0 z-step's +-stepEps annulus. The driver's
//                       `stitchRings` tread emitter (_strataConformBisectL.test.ts:4415-4443).
//   B  BAND-EDGE      — the facet touches a band boundary z = zStep -+ stepEps but is not a tread.
//   C  THETA-CLIFF    — the facet's parameter footprint is a NEEDLE and rA JUMPS across its short axis.
//   D  DEGEN-OTHER    — needle footprint, no detected jump (pure parameter degeneracy).
//   S  SEAM           — footprint straddles theta = 0 (the periodic seam) and is not already T/B/C/D.
//   R  RIM            — a vertex within rimEps of z=0 or z=H.
//   U  UNEXPLAINED    — none of the above.
//
// EVERY bucket is reported as COUNT + AREA-share-of-mesh + AREA-share-of-class + MAX dihedral, per the
// campaign's measurement discipline. A bare count or a bare max is never printed alone.
//
// CONTROLS built in:
//   * the same census on a CONTROL mesh (PF_S116_STL2) — GothicArches, whose class is 0.73% on the same
//     instrument. If the classifier explains as much of Gothic's class as CelticTriquetra's, the buckets
//     are vacuous and the run is VOID.
//   * a CEILING LADDER (PF_S116_CEILS) — the class is re-cut at several dihedral bars so the result
//     cannot be an artefact of the inherited 163.41.
//   * a NEEDLE-THRESHOLD LADDER (PF_S116_NEEDLES) — same, for the degeneracy predicate.
//   * TOPOLOGY is printed (boundary / non-manifold / inconsistent-winding edges); a mesh whose weld
//     failed would under-read every dihedral and the run would be VOID.
//
// READ-ONLY on src/ and on research/bridge/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import type { StyleId, StyleDims, RadiusFn } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envL = (n: string, d: string): number[] => (process.env[n] ?? d).split(',').map(Number);

const TWO_PI = 2 * Math.PI;
const DEG = 180 / Math.PI;

const OUTDIR = process.env.PF_S116_OUTDIR
  ?? 'research/exchange/_strataConformBisect/s116';
const CEILS = envL('PF_S116_CEILS', '150,163.41,170,175,178');
const CEIL_MAIN = envF('PF_S116_CEIL', 163.41);
const NEEDLES = envL('PF_S116_NEEDLES', '0.5,1,2,5');   // needle bar: 3D area / paramArea, mm/rad-ish
const RIM_EPS = envF('PF_S116_RIMEPS', 0.02);           // mm
const SEAM_EPS = envF('PF_S116_SEAMEPS', 1e-6);         // rad
const STEP_EPS_UM = envF('PF_CB_STEP_EPS_UM', 4);       // the driver's own default
const JUMP_PROBE_N = envI('PF_S116_JUMPN', 64);         // samples across a needle's short axis

interface Job { tag: string; style: string; stl: string }

const JOBS: Job[] = [];
{
  const s1 = process.env.PF_S116_STL ?? '';
  const s2 = process.env.PF_S116_STL2 ?? '';
  if (s1.length > 0) JOBS.push({ tag: process.env.PF_S116_TAG ?? 'CT', style: process.env.PF_S116_STYLE ?? 'CelticTriquetra', stl: s1 });
  if (s2.length > 0) JOBS.push({ tag: process.env.PF_S116_TAG2 ?? 'GOTH', style: process.env.PF_S116_STYLE2 ?? 'GothicArches', stl: s2 });
}
if (JOBS.length === 0) { log('*** PF_S116_STL is required (ABSOLUTE path). ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  if (cfg === undefined) { log(`*** STYLE ${id} NOT IN STYLE_REGISTRY ***`); process.exit(3); }
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

const DIMS: StyleDims = { H: envF('PF_S116_H', 120), Rb: envF('PF_S116_RB', 40), Rt: envF('PF_S116_RT', 50), expn: 1 };
const H = DIMS.H;
mkdirSync(OUTDIR, { recursive: true });

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const f3 = (v: number, n = 3): string => (Number.isFinite(v) ? v.toFixed(n) : '—');

/**
 * The driver's OWN C0 z-step detector, transcribed VERBATIM from
 * research/bridge/_strataConformBisectL.test.ts:1144-1160 so the tread bucket brackets exactly the
 * z values the emitter used. Transcribed rather than imported because that file is a vitest `describe`
 * with the detector inline in the test body; importing it would run the whole driver.
 */
function detectZSteps(R: RadiusFn, tolMm: number): number[] {
  const zSteps: number[] = [];
  const nZ = 12000; const d1 = H / nZ; const d2 = d1 / 8;
  const probes = [0.21, 1.03, 2.44, 3.77, 5.29];
  let run = -1; let bestJ2 = 0; let bestZ = 0;
  const flush = (): void => { if (run >= 0) { zSteps.push(bestZ); run = -1; bestJ2 = 0; } };
  for (let j = 1; j < nZ; j += 1) {
    const z = H * (j / nZ);
    let j1 = 0; let j2 = 0;
    for (const th of probes) {
      j1 = Math.max(j1, Math.abs(R(th, z + d1) - R(th, z - d1)));
      j2 = Math.max(j2, Math.abs(R(th, z + d2) - R(th, z - d2)));
    }
    if (j2 > 0.8 * j1 && j1 > tolMm) { if (run < 0) run = z; if (j2 > bestJ2) { bestJ2 = j2; bestZ = z; } } else flush();
  }
  flush();
  return zSteps;
}

/**
 * EXHAUSTIVE discontinuity census of rA itself, in BOTH parameters, on a dense lattice. This is the
 * surface-side control for the whole classification: if rA has no jumps at all, no "cliff" bucket can be
 * real and the fold class must come from somewhere else entirely.
 *
 * For a jump we compare the central difference at pitch d and at pitch d/8: a genuine C0 jump keeps the
 * SAME magnitude as the probe shrinks (the driver's own criterion), a smooth-but-steep feature shrinks
 * linearly. Reported as the surviving magnitude at the tightest pitch.
 */
function jumpCensus(R: RadiusFn, nTh: number, nZ: number): {
  thJumpMax: number; zJumpMax: number; thJumpCount: number; zJumpCount: number;
  thJumpTop: Array<[number, number, number]>; zJumpTop: Array<[number, number, number]>;
} {
  const dTh = TWO_PI / nTh; const dZ = H / nZ;
  const e1Th = dTh / 4; const e2Th = e1Th / 64;
  const e1Z = dZ / 4; const e2Z = e1Z / 64;
  let thJumpMax = 0; let zJumpMax = 0; let thJumpCount = 0; let zJumpCount = 0;
  const thTop: Array<[number, number, number]> = [];
  const zTop: Array<[number, number, number]> = [];
  const BAR = 0.01; // the export standard, in mm
  for (let i = 0; i < nTh; i += 1) {
    const th = (TWO_PI * i) / nTh;
    for (let j = 1; j < nZ; j += 1) {
      const z = (H * j) / nZ;
      const a1 = Math.abs(R(th + e1Th, z) - R(th - e1Th, z));
      const a2 = Math.abs(R(th + e2Th, z) - R(th - e2Th, z));
      if (a2 > 0.5 * a1 && a2 > BAR) { thJumpCount += 1; if (a2 > thJumpMax) thJumpMax = a2; thTop.push([a2, th, z]); }
      const b1 = Math.abs(R(th, z + e1Z) - R(th, z - e1Z));
      const b2 = Math.abs(R(th, z + e2Z) - R(th, z - e2Z));
      if (b2 > 0.5 * b1 && b2 > BAR) { zJumpCount += 1; if (b2 > zJumpMax) zJumpMax = b2; zTop.push([b2, th, z]); }
    }
  }
  thTop.sort((p, q) => q[0] - p[0]); zTop.sort((p, q) => q[0] - p[0]);
  return { thJumpMax, zJumpMax, thJumpCount, zJumpCount, thJumpTop: thTop.slice(0, 8), zJumpTop: zTop.slice(0, 8) };
}

interface FacetGeom {
  th: Float64Array;   // unwrapped theta of the 3 vertices, 3 per facet
  zz: Float64Array;
  rr: Float64Array;
  paramArea: Float64Array;  // |(theta,z)| triangle area, rad*mm
  arcArea: Float64Array;    // same but theta scaled to arc length at the facet's mean radius, mm^2
  minAlt: Float64Array;     // min altitude of the ARC-space footprint (mm) — the needle measure
  dR: Float64Array;         // max-min radius over the 3 vertices, mm
}

function facetGeometry(xyz: Float64Array, nTri: number): FacetGeom {
  const th = new Float64Array(nTri * 3);
  const zz = new Float64Array(nTri * 3);
  const rr = new Float64Array(nTri * 3);
  const paramArea = new Float64Array(nTri);
  const arcArea = new Float64Array(nTri);
  const minAlt = new Float64Array(nTri);
  const dR = new Float64Array(nTri);
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const t0 = Math.atan2(xyz[o + 1], xyz[o]);
    th[f * 3] = t0;
    let rMin = Infinity; let rMax = -Infinity;
    for (let k = 0; k < 3; k += 1) {
      const x = xyz[o + k * 3]; const y = xyz[o + k * 3 + 1]; const z = xyz[o + k * 3 + 2];
      const r = Math.hypot(x, y);
      rr[f * 3 + k] = r; zz[f * 3 + k] = z;
      if (k > 0) th[f * 3 + k] = t0 + dThRaw(t0, Math.atan2(y, x));
      if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    }
    dR[f] = rMax - rMin;
    const a = [th[f * 3], zz[f * 3]]; const b = [th[f * 3 + 1], zz[f * 3 + 1]]; const c = [th[f * 3 + 2], zz[f * 3 + 2]];
    const cr = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    paramArea[f] = 0.5 * Math.abs(cr);
    const rBar = (rr[f * 3] + rr[f * 3 + 1] + rr[f * 3 + 2]) / 3;
    const A = 0.5 * Math.abs(cr) * rBar;   // arc-length-scaled parameter area, mm^2
    arcArea[f] = A;
    // longest arc-space edge -> min altitude = 2A / longest
    let L = 0;
    for (const [p, q] of [[0, 1], [1, 2], [2, 0]] as Array<[number, number]>) {
      const dt = (th[f * 3 + q] - th[f * 3 + p]) * rBar;
      const dz = zz[f * 3 + q] - zz[f * 3 + p];
      const e = Math.hypot(dt, dz);
      if (e > L) L = e;
    }
    minAlt[f] = L > 0 ? (2 * A) / L : 0;
  }
  return { th, zz, rr, paramArea, arcArea, minAlt, dR };
}

interface Census {
  count: number; area: number; maxDeg: number;
}
const newCensus = (): Census => ({ count: 0, area: 0, maxDeg: 0 });
const addC = (c: Census, area: number, deg: number): void => {
  c.count += 1; c.area += area; if (deg > c.maxDeg) c.maxDeg = deg;
};

const OUT: Record<string, unknown> = {
  schema: 'pf.s116.foldProvenance/1', dims: DIMS, ceilMain: CEIL_MAIN, ceils: CEILS,
  needles: NEEDLES, stepEpsUm: STEP_EPS_UM, jobs: [] as unknown[],
};

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('===== S116 FOLD PROVENANCE — WHICH CONSTRUCT EMITTED THE FOLD? =====');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt}   ceiling(main) ${CEIL_MAIN} deg   ladder ${CEILS.join('/')}`);
log(`needle ladder (arc-space min altitude, um) ${NEEDLES.map((n) => (n * 1000).toFixed(0)).join('/')}   stepEps ${STEP_EPS_UM} um`);

for (const job of JOBS) {
  log('');
  log('────────────────────────────────────────────────────────────────────────────────────────────────────');
  log(`── ${job.tag}  (${job.style})  ${job.stl}`);
  log('────────────────────────────────────────────────────────────────────────────────────────────────────');
  const DEFAULTS = registryDefaults(job.style);
  log(`params ${JSON.stringify(DEFAULTS)}`);
  const rAbase = buildRadiusFn(job.style as StyleId, { ...DEFAULTS }, DIMS);
  const rAraw: RadiusFn = (th: number, z: number): number => rAbase(canonTheta(th), z);
  const rA: RadiusFn = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

  // ── SURFACE-SIDE CONTROL: does rA jump at all, and where? ──
  const jc = jumpCensus(rAraw, envI('PF_S116_JC_TH', 720), envI('PF_S116_JC_Z', 480));
  log(`${el()} rA jump census (720x480 = 345,600 lattice points, EXHAUSTIVE):`);
  log(`   theta-direction: ${jc.thJumpCount} sites over 0.01mm, MAX ${f3(jc.thJumpMax, 5)} mm`);
  log(`   z-direction    : ${jc.zJumpCount} sites over 0.01mm, MAX ${f3(jc.zJumpMax, 5)} mm`);
  if (jc.thJumpTop.length > 0) log(`   top theta jumps: ${jc.thJumpTop.map(([m, t, z]) => `${f3(m, 4)}mm@(${f3(t, 4)},${f3(z, 2)})`).join('  ')}`);
  if (jc.zJumpTop.length > 0) log(`   top z jumps    : ${jc.zJumpTop.map(([m, t, z]) => `${f3(m, 4)}mm@(${f3(t, 4)},${f3(z, 2)})`).join('  ')}`);

  const zSteps = detectZSteps(rAraw, 0.01);
  log(`${el()} driver's own z-step detector: ${zSteps.length} step(s) at z = ${zSteps.map((z) => f3(z, 4)).join(', ')}`);

  // ── MESH ──
  const M = readMeshFloat64(job.stl, false);
  const nTri = M.nTri;
  log(`${el()} mesh: ${nTri.toLocaleString()} facets`);
  const idx = new Uint32Array(nTri * 3);
  for (let i = 0; i < idx.length; i += 1) idx[i] = i;
  const d = facetDihedrals(M.xyz, idx);
  let meshArea = 0;
  for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
  log(`${el()} topology: interior ${d.interiorEdges.toLocaleString()}  boundary ${d.boundaryEdges}  non-manifold ${d.nonManifoldEdges}  inconsistent-winding ${d.inconsistentEdges}`);
  log(`   total 3D area ${f3(meshArea, 3)} mm2`);
  if (d.nonManifoldEdges > 0 || d.inconsistentEdges > 0) {
    log('   *** CONTROL FIRED: non-manifold or inconsistent-winding edges present — dihedrals may be mis-paired. ***');
  }

  const G = facetGeometry(M.xyz, nTri);

  // ── CEILING LADDER ──
  log('');
  log(`${el()} CEILING LADDER — the class at each bar (COUNT + AREA-share + MAX):`);
  const ladder: Array<Record<string, unknown>> = [];
  for (const ceil of CEILS) {
    const thr = ceil / DEG;
    let c = 0; let a = 0; let mx = 0;
    for (let f = 0; f < nTri; f += 1) {
      if (d.perFacetMaxRad[f] > thr) { c += 1; a += d.areaMm2[f]; if (d.perFacetMaxRad[f] > mx) mx = d.perFacetMaxRad[f]; }
    }
    log(`   >${f3(ceil, 2)} deg : count ${c.toLocaleString().padStart(9)}  area ${f3(a, 3).padStart(10)} mm2  = ${pct(a, meshArea).padStart(8)}% of mesh  MAX ${f3(mx * DEG, 3)} deg`);
    ladder.push({ ceilDeg: ceil, count: c, areaMm2: a, areaPct: (a / meshArea) * 100, maxDeg: mx * DEG });
  }

  // ── THE CLASS AT THE MAIN BAR ──
  const thrMain = CEIL_MAIN / DEG;
  const cls: number[] = [];
  let clsArea = 0;
  for (let f = 0; f < nTri; f += 1) if (d.perFacetMaxRad[f] > thrMain) { cls.push(f); clsArea += d.areaMm2[f]; }
  log('');
  log(`${el()} CLASS at ${CEIL_MAIN} deg: ${cls.length.toLocaleString()} facets, ${f3(clsArea, 3)} mm2 = ${pct(clsArea, meshArea)}% of mesh`);

  // ── NEEDLE LADDER on the class ──
  log('');
  log(`${el()} NEEDLE LADDER — share of the CLASS whose arc-space min altitude is under the bar:`);
  const needleLadder: Array<Record<string, unknown>> = [];
  for (const nb of NEEDLES) {
    let c = 0; let a = 0;
    for (const f of cls) if (G.minAlt[f] < nb / 1000) { c += 1; a += d.areaMm2[f]; }
    log(`   minAlt < ${(nb * 1000).toFixed(0).padStart(5)} um : count ${c.toLocaleString().padStart(9)} (${pct(c, cls.length).padStart(8)}% of class)  area ${f3(a, 3).padStart(10)} mm2 (${pct(a, clsArea).padStart(8)}% of class area, ${pct(a, meshArea)}% of mesh)`);
    needleLadder.push({ barUm: nb * 1000, count: c, areaMm2: a, classAreaPct: (a / clsArea) * 100, meshAreaPct: (a / meshArea) * 100 });
  }

  // ── PROVENANCE CLASSIFICATION ──
  const stepEps = STEP_EPS_UM / 1000;
  const NEEDLE_MAIN = envF('PF_S116_NEEDLE', 2) / 1000;   // mm
  const buckets = ['T-tread', 'B-bandEdge', 'C-thetaCliff', 'D-degenOther', 'S-seam', 'R-rim', 'U-unexplained'];
  const cen: Record<string, Census> = {};
  for (const b of buckets) cen[b] = newCensus();
  // exemplars per bucket: the largest-area facet
  const exemplar: Record<string, { f: number; area: number } | null> = {};
  for (const b of buckets) exemplar[b] = null;

  const nearStep = (z: number): number => {
    for (const zs of zSteps) if (Math.abs(z - zs) <= stepEps * 3 + 1e-9) return zs;
    return NaN;
  };

  for (const f of cls) {
    const area = d.areaMm2[f];
    const deg = d.perFacetMaxRad[f] * DEG;
    const z0 = G.zz[f * 3]; const z1 = G.zz[f * 3 + 1]; const z2 = G.zz[f * 3 + 2];
    const zLo = Math.min(z0, z1, z2); const zHi = Math.max(z0, z1, z2);
    let bucket = 'U-unexplained';

    // T — every vertex inside a z-step annulus
    const s0 = nearStep(z0); const s1 = nearStep(z1); const s2 = nearStep(z2);
    if (Number.isFinite(s0) && Number.isFinite(s1) && Number.isFinite(s2) && s0 === s1 && s1 === s2) {
      bucket = 'T-tread';
    } else if (Number.isFinite(s0) || Number.isFinite(s1) || Number.isFinite(s2)) {
      bucket = 'B-bandEdge';
    } else if (G.minAlt[f] < NEEDLE_MAIN) {
      // NEEDLE. Is there a JUMP across its short axis? Probe rA along the segment joining the two
      // vertices that are FURTHEST APART IN RADIUS but CLOSEST IN PARAMETER — the flank pair.
      let bi = 0; let bj = 1; let bestScore = -Infinity;
      const rBar = (G.rr[f * 3] + G.rr[f * 3 + 1] + G.rr[f * 3 + 2]) / 3;
      for (const [p, q] of [[0, 1], [1, 2], [2, 0]] as Array<[number, number]>) {
        const dt = (G.th[f * 3 + q] - G.th[f * 3 + p]) * rBar;
        const dz = G.zz[f * 3 + q] - G.zz[f * 3 + p];
        const dpar = Math.hypot(dt, dz);
        const drad = Math.abs(G.rr[f * 3 + q] - G.rr[f * 3 + p]);
        const score = drad / (dpar + 1e-9);
        if (score > bestScore) { bestScore = score; bi = p; bj = q; }
      }
      // sample rA along that parameter segment; a JUMP shows as a single-step increment that survives
      // when the sample pitch is halved.
      const tA = G.th[f * 3 + bi]; const zA = G.zz[f * 3 + bi];
      const tB = G.th[f * 3 + bj]; const zB = G.zz[f * 3 + bj];
      let maxStep = 0;
      let prev = rA(tA, zA);
      for (let k = 1; k <= JUMP_PROBE_N; k += 1) {
        const u = k / JUMP_PROBE_N;
        const v = rA(tA + (tB - tA) * u, zA + (zB - zA) * u);
        const st = Math.abs(v - prev); if (st > maxStep) maxStep = st;
        prev = v;
      }
      let maxStep2 = 0;
      prev = rA(tA, zA);
      for (let k = 1; k <= JUMP_PROBE_N * 8; k += 1) {
        const u = k / (JUMP_PROBE_N * 8);
        const v = rA(tA + (tB - tA) * u, zA + (zB - zA) * u);
        const st = Math.abs(v - prev); if (st > maxStep2) maxStep2 = st;
        prev = v;
      }
      // a genuine C0 jump keeps its magnitude as the pitch is refined 8x; a steep-but-smooth rise falls ~8x
      bucket = (maxStep2 > 0.5 * maxStep && maxStep2 > 0.01) ? 'C-thetaCliff' : 'D-degenOther';
    } else {
      const t0 = canonTheta(G.th[f * 3]); const t1 = canonTheta(G.th[f * 3 + 1]); const t2 = canonTheta(G.th[f * 3 + 2]);
      const straddleSeam = (Math.min(t0, t1, t2) < SEAM_EPS) || (Math.max(t0, t1, t2) > TWO_PI - SEAM_EPS)
        || (Math.max(G.th[f * 3], G.th[f * 3 + 1], G.th[f * 3 + 2]) - Math.min(G.th[f * 3], G.th[f * 3 + 1], G.th[f * 3 + 2]) > Math.PI);
      if (straddleSeam) bucket = 'S-seam';
      else if (zLo < RIM_EPS || zHi > H - RIM_EPS) bucket = 'R-rim';
    }
    addC(cen[bucket], area, deg);
    const ex = exemplar[bucket];
    if (ex === null || area > ex.area) exemplar[bucket] = { f, area };
  }

  log('');
  log(`${el()} PROVENANCE OF THE ${CEIL_MAIN}-deg CLASS (first-match order ${buckets.join(' > ')}):`);
  log('   bucket           count      %count      area mm2     %class-area   %mesh-area    MAX deg');
  const prov: Array<Record<string, unknown>> = [];
  for (const b of buckets) {
    const c = cen[b];
    log(`   ${b.padEnd(15)} ${c.count.toLocaleString().padStart(9)}  ${pct(c.count, cls.length).padStart(9)}%  ${f3(c.area, 3).padStart(11)}  ${pct(c.area, clsArea).padStart(11)}%  ${pct(c.area, meshArea).padStart(10)}%  ${f3(c.maxDeg, 3).padStart(8)}`);
    prov.push({ bucket: b, count: c.count, areaMm2: c.area, classAreaPct: (c.area / clsArea) * 100, meshAreaPct: (c.area / meshArea) * 100, maxDeg: c.maxDeg });
  }

  log('');
  log(`${el()} EXEMPLARS (largest-area facet per bucket):`);
  for (const b of buckets) {
    const ex = exemplar[b];
    if (ex === null) { log(`   ${b.padEnd(15)} —`); continue; }
    const f = ex.f;
    const ths = [0, 1, 2].map((k) => f3(G.th[f * 3 + k], 5)).join(',');
    const zs = [0, 1, 2].map((k) => f3(G.zz[f * 3 + k], 4)).join(',');
    const rs = [0, 1, 2].map((k) => f3(G.rr[f * 3 + k], 4)).join(',');
    const ra = [0, 1, 2].map((k) => f3(rA(G.th[f * 3 + k], G.zz[f * 3 + k]), 4)).join(',');
    log(`   ${b.padEnd(15)} f=${f}  area ${f3(ex.area, 5)} mm2  dih ${f3(d.perFacetMaxRad[f] * DEG, 3)} deg  minAlt ${f3(G.minAlt[f] * 1000, 3)} um  dR ${f3(G.dR[f] * 1000, 1)} um`);
    log(`   ${' '.repeat(15)}   theta=[${ths}]  z=[${zs}]  r=[${rs}]  rA=[${ra}]`);
  }

  // ── THE BACK-TO-BACK PAIR TEST (the fold signature proper) ──
  // An EDGE whose two facets meet at > CEIL is a fold hinge. Report the hinge population by the same
  // buckets, keyed on the SHARED EDGE's own parameter footprint.
  let hinge = 0; let hingeArea = 0; let hingeMax = 0;
  let hingeDegen = 0; let hingeDegenArea = 0;
  const seen = new Set<number>();
  for (let e = 0; e < d.interiorEdges; e += 1) {
    if (d.edgeAngRad[e] <= thrMain) continue;
    hinge += 1;
    if (d.edgeAngRad[e] > hingeMax) hingeMax = d.edgeAngRad[e];
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    for (const f of [f1, f2]) if (!seen.has(f)) { seen.add(f); hingeArea += d.areaMm2[f]; if (G.minAlt[f] < NEEDLE_MAIN) { hingeDegen += 1; hingeDegenArea += d.areaMm2[f]; } }
  }
  log('');
  log(`${el()} FOLD HINGES (interior edges whose two facets meet above ${CEIL_MAIN} deg):`);
  log(`   hinges ${hinge.toLocaleString()}   facets touching a hinge ${seen.size.toLocaleString()}   area ${f3(hingeArea, 3)} mm2 = ${pct(hingeArea, meshArea)}% of mesh   MAX ${f3(hingeMax * DEG, 3)} deg`);
  log(`   of those facets, arc-space needles (<${(NEEDLE_MAIN * 1000).toFixed(0)} um alt): ${hingeDegen.toLocaleString()} = ${pct(hingeDegenArea, hingeArea)}% of hinge area`);

  (OUT.jobs as unknown[]).push({
    tag: job.tag, style: job.style, stl: job.stl, nTri, meshAreaMm2: meshArea,
    topology: { interior: d.interiorEdges, boundary: d.boundaryEdges, nonManifold: d.nonManifoldEdges, inconsistent: d.inconsistentEdges },
    jumpCensus: jc, zSteps, ladder, classCount: cls.length, classAreaMm2: clsArea, needleLadder, prov,
    hinges: { hinge, facets: seen.size, areaMm2: hingeArea, maxDeg: hingeMax * DEG, degenCount: hingeDegen, degenAreaMm2: hingeDegenArea },
  });
}

writeFileSync(`${OUTDIR}/S116_FOLD_PROVENANCE.json`, JSON.stringify(OUT, null, 2));
log('');
log(`${el()} wrote ${OUTDIR}/S116_FOLD_PROVENANCE.json`);
