// s116SlopeAxis.ts — S116. WHERE DO THE NEEDLES SIT, AND WHICH WAY DO THEY POINT?
//
// s116CliffEnrich REFUTED the obvious hypothesis: only 1.29% of CelticTriquetra's fold-class AREA lies
// within 5 mm of the surface's own C0 discontinuity set (which is 3 raster cells = 0.0003% of the
// parameter domain). So the folds are NOT made by refining across a cliff.
//
// What survives from s116FoldProvenance is that 94.87% of the class AREA is arc-space NEEDLES under 2 um
// altitude (Gothic control: 1.78%). This tool asks the two questions that discriminate between the
// remaining mechanisms:
//
//   Q1  WHERE. Are the needles enriched on STEEP flank (high |grad rA|)? Null = the mesh's own area
//       distribution over the same slope buckets, so a class that merely follows the mesh reads 1.0x.
//   Q2  WHICH WAY. Is the needle's LONG AXIS along the contour (perpendicular to grad rA) or up the
//       flank (parallel to it)? A max-sag-directed bisector that always splits the same edge direction
//       makes needles ALIGNED one way; an isotropic sizing failure makes them isotropic.
//
// SCAR #3 — the finite-difference step is SWEPT. |grad rA| is computed at every h in the ladder and the
// enrichment is reported at each, so no conclusion rests on one undeclared step.
//
// READ-ONLY on src/ and research/bridge/.
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
const OUTDIR = process.env.PF_S116_OUTDIR ?? 'research/exchange/_strataConformBisect/s116';
const CEIL = envF('PF_S116_CEIL', 163.41);
const NEEDLE_UM = envF('PF_S116_NEEDLE', 2);
const HTAB = envL('PF_S116_HTAB', '0.0002,0.002,0.02,0.1');   // FD step, ARC mm — SWEPT (scar #3)
const SLOPE_BUCKETS = envL('PF_S116_SLOPES', '0.05,0.2,0.5,1,2,5,10');

interface Job { tag: string; style: string; stl: string }
const JOBS: Job[] = [];
for (const k of ['', '2', '3']) {
  const s = process.env[`PF_S116_STL${k}`] ?? '';
  if (s.length > 0) {
    JOBS.push({
      tag: process.env[`PF_S116_TAG${k}`] ?? `M${k === '' ? '1' : k}`,
      style: process.env[`PF_S116_STYLE${k}`] ?? 'CelticTriquetra',
      stl: s,
    });
  }
}
if (JOBS.length === 0) { log('*** PF_S116_STL is required. ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  if (cfg === undefined) { log(`*** STYLE ${id} NOT IN REGISTRY ***`); process.exit(3); }
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

const OUT: Record<string, unknown> = { schema: 'pf.s116.slopeAxis/1', dims: DIMS, ceilDeg: CEIL, needleUm: NEEDLE_UM, hTab: HTAB, jobs: [] as unknown[] };
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('===== S116 SLOPE + AXIS — WHERE THE NEEDLES SIT AND WHICH WAY THEY POINT =====');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`ceiling ${CEIL} deg   needle bar ${NEEDLE_UM} um   FD-step ladder (arc mm) ${HTAB.join('/')}`);

for (const job of JOBS) {
  log('');
  log('────────────────────────────────────────────────────────────────────────────────────────────────────');
  log(`── ${job.tag}  (${job.style})   ${job.stl}`);
  log('────────────────────────────────────────────────────────────────────────────────────────────────────');
  const DEFAULTS = registryDefaults(job.style);
  const rAbase = buildRadiusFn(job.style as StyleId, { ...DEFAULTS }, DIMS);
  const rA: RadiusFn = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

  const M = readMeshFloat64(job.stl, false);
  const nTri = M.nTri;
  const idx = new Uint32Array(nTri * 3);
  for (let i = 0; i < idx.length; i += 1) idx[i] = i;
  const d = facetDihedrals(M.xyz, idx);
  log(`${el()} mesh ${nTri.toLocaleString()} facets   boundary ${d.boundaryEdges}  non-manifold ${d.nonManifoldEdges}  inconsistent ${d.inconsistentEdges}`);
  const thrRad = CEIL / DEG;

  // per-facet: centroid (theta,z), arc-space min altitude, long-axis unit vector in arc space
  const cTh = new Float64Array(nTri); const cZ = new Float64Array(nTri);
  const minAlt = new Float64Array(nTri);
  const axU = new Float64Array(nTri); const axV = new Float64Array(nTri);   // long axis, arc space (unit)
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const t0 = Math.atan2(M.xyz[o + 1], M.xyz[o]);
    const th = [t0, 0, 0]; const zz = [0, 0, 0]; const rr = [0, 0, 0];
    for (let k = 0; k < 3; k += 1) {
      const x = M.xyz[o + k * 3]; const y = M.xyz[o + k * 3 + 1];
      rr[k] = Math.hypot(x, y); zz[k] = M.xyz[o + k * 3 + 2];
      if (k > 0) th[k] = t0 + dThRaw(t0, Math.atan2(y, x));
    }
    const rBar = (rr[0] + rr[1] + rr[2]) / 3;
    cTh[f] = canonTheta((th[0] + th[1] + th[2]) / 3);
    cZ[f] = Math.min(H, Math.max(0, (zz[0] + zz[1] + zz[2]) / 3));
    const cr = (th[1] - th[0]) * (zz[2] - zz[0]) - (th[2] - th[0]) * (zz[1] - zz[0]);
    const A = 0.5 * Math.abs(cr) * rBar;
    let L = 0; let lu = 1; let lv = 0;
    for (const [p, q] of [[0, 1], [1, 2], [2, 0]] as Array<[number, number]>) {
      const du = (th[q] - th[p]) * rBar; const dv = zz[q] - zz[p];
      const e = Math.hypot(du, dv);
      if (e > L) { L = e; lu = du / (e || 1); lv = dv / (e || 1); }
    }
    minAlt[f] = L > 0 ? (2 * A) / L : 0;
    axU[f] = lu; axV[f] = lv;
  }

  // ── the class, and the needle sub-class ──
  const cls: number[] = []; let clsArea = 0;
  let meshArea = 0;
  for (let f = 0; f < nTri; f += 1) {
    meshArea += d.areaMm2[f];
    if (d.perFacetMaxRad[f] > thrRad) { cls.push(f); clsArea += d.areaMm2[f]; }
  }
  const needles = cls.filter((f) => minAlt[f] < NEEDLE_UM / 1000);
  let needleArea = 0; for (const f of needles) needleArea += d.areaMm2[f];
  log(`${el()} class ${cls.length.toLocaleString()} facets ${f3(clsArea, 3)} mm2 (${pct(clsArea, meshArea)}% of mesh); needles ${needles.length.toLocaleString()} ${f3(needleArea, 3)} mm2 (${pct(needleArea, clsArea)}% of class area)`);

  const jobOut: Record<string, unknown> = { tag: job.tag, style: job.style, stl: job.stl, nTri, meshAreaMm2: meshArea, classCount: cls.length, classAreaMm2: clsArea, needleCount: needles.length, needleAreaMm2: needleArea, hSweep: [] as unknown[] };

  for (const hArc of HTAB) {
    // |grad rA| in ARC space at each facet centroid, plus the gradient direction.
    // gx = (1/r) drA/dtheta  ; gz = drA/dz. Step hArc is an ARC length, converted per facet.
    const slope = new Float64Array(nTri);
    const gU = new Float64Array(nTri); const gV = new Float64Array(nTri);
    for (let f = 0; f < nTri; f += 1) {
      const th = cTh[f]; const z = cZ[f];
      const r0 = rA(th, z);
      const dth = hArc / Math.max(r0, 1e-6);
      const gx = (rA(th + dth, z) - rA(th - dth, z)) / (2 * hArc);
      const zp = Math.min(H, z + hArc); const zm = Math.max(0, z - hArc);
      const gz = (zp > zm) ? (rA(th, zp) - rA(th, zm)) / (zp - zm) : 0;
      const g = Math.hypot(gx, gz);
      slope[f] = g;
      gU[f] = g > 0 ? gx / g : 1; gV[f] = g > 0 ? gz / g : 0;
    }

    // Q1 — enrichment by slope bucket (area-weighted; null = the mesh itself)
    const nB = SLOPE_BUCKETS.length + 1;
    const cA = new Float64Array(nB); const mA = new Float64Array(nB); const nA = new Float64Array(nB);
    const bOf = (s: number): number => { for (let b = 0; b < SLOPE_BUCKETS.length; b += 1) if (s <= SLOPE_BUCKETS[b]) return b; return SLOPE_BUCKETS.length; };
    for (let f = 0; f < nTri; f += 1) mA[bOf(slope[f])] += d.areaMm2[f];
    for (const f of cls) cA[bOf(slope[f])] += d.areaMm2[f];
    for (const f of needles) nA[bOf(slope[f])] += d.areaMm2[f];

    // Q2 — needle long-axis vs gradient direction (area-weighted histogram, 0..90 deg)
    const NBIN = 9;
    const axHist = new Float64Array(NBIN);      // needles
    const axHistAll = new Float64Array(NBIN);   // whole mesh — the null
    for (let f = 0; f < nTri; f += 1) {
      const c = Math.abs(axU[f] * gU[f] + axV[f] * gV[f]);
      const a = Math.acos(Math.min(1, c)) * DEG;
      axHistAll[Math.min(NBIN - 1, Math.floor((a / 90) * NBIN))] += d.areaMm2[f];
    }
    for (const f of needles) {
      const c = Math.abs(axU[f] * gU[f] + axV[f] * gV[f]);
      const a = Math.acos(Math.min(1, c)) * DEG;
      axHist[Math.min(NBIN - 1, Math.floor((a / 90) * NBIN))] += d.areaMm2[f];
    }

    log('');
    log(`${el()} h = ${hArc} arc-mm  ── Q1 SLOPE ENRICHMENT (|grad rA|, dimensionless). RISK = class share / mesh share.`);
    log('   slope bucket      class mm2    %class     mesh mm2     %mesh      RISK     needle mm2   %needle');
    const rows: Array<Record<string, unknown>> = [];
    for (let b = 0; b < nB; b += 1) {
      const lab = b < SLOPE_BUCKETS.length ? `<= ${f3(SLOPE_BUCKETS[b], 2)}` : `>  ${f3(SLOPE_BUCKETS[SLOPE_BUCKETS.length - 1], 2)}`;
      const cs = clsArea > 0 ? cA[b] / clsArea : 0;
      const ms = meshArea > 0 ? mA[b] / meshArea : 0;
      log(`   ${lab.padStart(12)}   ${f3(cA[b], 3).padStart(11)}  ${(cs * 100).toFixed(3).padStart(8)}%  ${f3(mA[b], 3).padStart(11)}  ${(ms * 100).toFixed(3).padStart(8)}%  ${f3(ms > 0 ? cs / ms : NaN, 3).padStart(7)}x  ${f3(nA[b], 3).padStart(11)}  ${pct(nA[b], needleArea).padStart(8)}%`);
      rows.push({ bucket: lab, classArea: cA[b], classShare: cs, meshArea: mA[b], meshShare: ms, risk: ms > 0 ? cs / ms : null, needleArea: nA[b] });
    }
    log(`   Q2 NEEDLE LONG-AXIS vs GRADIENT (0 deg = up the flank, 90 deg = along the contour), area-weighted:`);
    let l1 = '     needles :'; let l2 = '     mesh    :';
    for (let b = 0; b < NBIN; b += 1) {
      l1 += ` ${((b * 90) / NBIN).toFixed(0)}-${(((b + 1) * 90) / NBIN).toFixed(0)}:${pct(axHist[b], needleArea).padStart(7)}%`;
      l2 += ` ${((b * 90) / NBIN).toFixed(0)}-${(((b + 1) * 90) / NBIN).toFixed(0)}:${pct(axHistAll[b], meshArea).padStart(7)}%`;
    }
    log(l1); log(l2);
    (jobOut.hSweep as unknown[]).push({ hArc, rows, axHistNeedle: Array.from(axHist), axHistMesh: Array.from(axHistAll) });
  }
  (OUT.jobs as unknown[]).push(jobOut);
}

writeFileSync(`${OUTDIR}/S116_SLOPE_AXIS.json`, JSON.stringify(OUT, null, 2));
log('');
log(`${el()} wrote ${OUTDIR}/S116_SLOPE_AXIS.json`);
