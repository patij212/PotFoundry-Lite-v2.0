// s116CliffEnrich.ts — S116. IS THE FOLD CLASS ENRICHED ON THE SURFACE'S OWN C0 DISCONTINUITY SET?
//
// s116FoldProvenance established that 94.87% of CelticTriquetra's >163.41deg class AREA is arc-space
// NEEDLES under 2 um altitude (Gothic: 1.78%). That says WHAT they are. This says WHERE they are, and it
// is the measurement that decides whether the emitting mechanism is generic (any refinement driver) or
// specific to one code path.
//
// METHOD.
//  1. Raster the surface's OWN C0 discontinuity set: at every cell of a dense (theta,z) lattice, take the
//     central difference at pitch e and at pitch e/64 in BOTH parameters. A genuine C0 jump keeps its
//     magnitude as the probe shrinks; a steep-but-smooth feature falls off linearly. Mark the cell when
//     the surviving magnitude clears BAR. EXHAUSTIVE over the lattice — never strided (S115 scar #5).
//  2. Chamfer distance transform on that raster, in ARC-LENGTH mm, PERIODIC in theta.
//  3. For every facet, look up the distance at its (theta,z) centroid.
//  4. Report the fold class's AREA share inside each distance band AND the WHOLE MESH's area share in the
//     same band. The ratio of the two is the RISK RATIO — the null is the mesh itself, so a class that
//     merely follows the mesh's own density reads 1.0x and is correctly reported as NO enrichment.
//
// This is the placebo the discipline requires: the same predicate, evaluated on the population that did
// NOT fold. Plus the Gothic arm, whose analytic jump is 75x smaller, as the cross-style control.
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
const BANDS = envL('PF_S116_BANDS', '0.05,0.1,0.25,0.5,1,2,5');   // mm, arc length
const JBARS = envL('PF_S116_JBARS', '0.01,0.05,0.2');             // jump-magnitude bars, mm
const JBAR = envF('PF_S116_JBAR', 0.05);
const NTH = envI('PF_S116_NTH', 1536);
const NZ = envI('PF_S116_NZ', 768);
const NEEDLE_UM = envF('PF_S116_NEEDLE', 2);

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

/** radius used to convert d(theta) to arc length at a given z — the mesh's own mean radius per z row. */
const rOfZ = (z: number): number => DIMS.Rb + ((DIMS.Rt - DIMS.Rb) * z) / H;

const OUT: Record<string, unknown> = { schema: 'pf.s116.cliffEnrich/1', dims: DIMS, ceilDeg: CEIL, bands: BANDS, jbar: JBAR, nth: NTH, nz: NZ, jobs: [] as unknown[] };

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('===== S116 CLIFF ENRICHMENT — ARE THE FOLDS ON THE SURFACE\'S OWN C0 SET? =====');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`raster ${NTH} x ${NZ} = ${(NTH * NZ).toLocaleString()} cells   jump bar ${JBAR} mm   ceiling ${CEIL} deg   needle bar ${NEEDLE_UM} um`);

for (const job of JOBS) {
  log('');
  log('────────────────────────────────────────────────────────────────────────────────────────────────────');
  log(`── ${job.tag}  (${job.style})`);
  log(`   ${job.stl}`);
  log('────────────────────────────────────────────────────────────────────────────────────────────────────');
  const DEFAULTS = registryDefaults(job.style);
  const rAbase = buildRadiusFn(job.style as StyleId, { ...DEFAULTS }, DIMS);
  const rA: RadiusFn = (th: number, z: number): number => rAbase(canonTheta(th), z);

  // ── 1. RASTER THE C0 SET ──
  const dTh = TWO_PI / NTH; const dZ = H / NZ;
  const eT = dTh / 2; const eT2 = eT / 64;
  const eZ = dZ / 2; const eZ2 = eZ / 64;
  const jump = new Float32Array(NTH * NZ);
  let jMax = 0;
  const jbarCount = new Array<number>(JBARS.length).fill(0);
  for (let j = 0; j < NZ; j += 1) {
    const z = (H * (j + 0.5)) / NZ;
    for (let i = 0; i < NTH; i += 1) {
      const th = (TWO_PI * (i + 0.5)) / NTH;
      const a1 = Math.abs(rA(th + eT, z) - rA(th - eT, z));
      const a2 = Math.abs(rA(th + eT2, z) - rA(th - eT2, z));
      const jt = (a2 > 0.5 * a1) ? a2 : 0;
      let jz = 0;
      if (z - eZ >= 0 && z + eZ <= H) {
        const b1 = Math.abs(rA(th, z + eZ) - rA(th, z - eZ));
        const b2 = Math.abs(rA(th, z + eZ2) - rA(th, z - eZ2));
        jz = (b2 > 0.5 * b1) ? b2 : 0;
      }
      const v = Math.max(jt, jz);
      jump[j * NTH + i] = v;
      if (v > jMax) jMax = v;
      for (let b = 0; b < JBARS.length; b += 1) if (v > JBARS[b]) jbarCount[b] += 1;
    }
  }
  log(`${el()} C0 raster: MAX surviving jump ${f3(jMax, 5)} mm`);
  for (let b = 0; b < JBARS.length; b += 1) {
    log(`   cells over ${f3(JBARS[b], 3)} mm : ${jbarCount[b].toLocaleString()} = ${pct(jbarCount[b], NTH * NZ)}% of the parameter domain`);
  }

  // ── 2. CHAMFER DISTANCE TRANSFORM (arc-length mm, PERIODIC in theta) ──
  const INF = 1e9;
  const dist = new Float32Array(NTH * NZ);
  for (let k = 0; k < dist.length; k += 1) dist[k] = jump[k] > JBAR ? 0 : INF;
  const stepZ = dZ;
  const relax = (): void => {
    // forward
    for (let j = 0; j < NZ; j += 1) {
      const stepT = dTh * rOfZ((H * (j + 0.5)) / NZ);
      const diag = Math.hypot(stepT, stepZ);
      for (let i = 0; i < NTH; i += 1) {
        const k = j * NTH + i;
        let v = dist[k];
        const im = (i - 1 + NTH) % NTH;
        const c1 = dist[j * NTH + im] + stepT; if (c1 < v) v = c1;
        if (j > 0) {
          const c2 = dist[(j - 1) * NTH + i] + stepZ; if (c2 < v) v = c2;
          const c3 = dist[(j - 1) * NTH + im] + diag; if (c3 < v) v = c3;
          const c4 = dist[(j - 1) * NTH + ((i + 1) % NTH)] + diag; if (c4 < v) v = c4;
        }
        dist[k] = v;
      }
    }
    // backward
    for (let j = NZ - 1; j >= 0; j -= 1) {
      const stepT = dTh * rOfZ((H * (j + 0.5)) / NZ);
      const diag = Math.hypot(stepT, stepZ);
      for (let i = NTH - 1; i >= 0; i -= 1) {
        const k = j * NTH + i;
        let v = dist[k];
        const ip = (i + 1) % NTH;
        const c1 = dist[j * NTH + ip] + stepT; if (c1 < v) v = c1;
        if (j + 1 < NZ) {
          const c2 = dist[(j + 1) * NTH + i] + stepZ; if (c2 < v) v = c2;
          const c3 = dist[(j + 1) * NTH + ip] + diag; if (c3 < v) v = c3;
          const c4 = dist[(j + 1) * NTH + ((i - 1 + NTH) % NTH)] + diag; if (c4 < v) v = c4;
        }
        dist[k] = v;
      }
    }
  };
  relax(); relax(); relax();
  let anyZero = 0;
  for (let k = 0; k < dist.length; k += 1) if (dist[k] === 0) anyZero += 1;
  log(`${el()} distance transform done (3 relaxations, periodic in theta). seed cells ${anyZero.toLocaleString()}`);
  if (anyZero === 0) log('   *** NO C0 CELLS AT THIS BAR — every distance band below is vacuous for this style. ***');

  // ── 3. MESH ──
  const M = readMeshFloat64(job.stl, false);
  const nTri = M.nTri;
  const idx = new Uint32Array(nTri * 3);
  for (let i = 0; i < idx.length; i += 1) idx[i] = i;
  const d = facetDihedrals(M.xyz, idx);
  log(`${el()} mesh ${nTri.toLocaleString()} facets   boundary ${d.boundaryEdges}  non-manifold ${d.nonManifoldEdges}  inconsistent ${d.inconsistentEdges}`);

  const thrRad = CEIL / DEG;
  const nBands = BANDS.length + 1;
  const clsAreaBand = new Float64Array(nBands);
  const meshAreaBand = new Float64Array(nBands);
  const needleAreaBand = new Float64Array(nBands);
  let meshArea = 0; let clsArea = 0; let needleArea = 0;
  let clsCount = 0;
  const bandOf = (dd: number): number => {
    for (let b = 0; b < BANDS.length; b += 1) if (dd <= BANDS[b]) return b;
    return BANDS.length;
  };
  // arc-space min altitude, recomputed here so this tool stands alone
  const minAltOf = (f: number): number => {
    const o = f * 9;
    const t0 = Math.atan2(M.xyz[o + 1], M.xyz[o]);
    const th = [t0, 0, 0]; const zz = [0, 0, 0]; const rr = [0, 0, 0];
    for (let k = 0; k < 3; k += 1) {
      const x = M.xyz[o + k * 3]; const y = M.xyz[o + k * 3 + 1];
      rr[k] = Math.hypot(x, y); zz[k] = M.xyz[o + k * 3 + 2];
      if (k > 0) th[k] = t0 + dThRaw(t0, Math.atan2(y, x));
    }
    const rBar = (rr[0] + rr[1] + rr[2]) / 3;
    const cr = (th[1] - th[0]) * (zz[2] - zz[0]) - (th[2] - th[0]) * (zz[1] - zz[0]);
    const A = 0.5 * Math.abs(cr) * rBar;
    let L = 0;
    for (const [p, q] of [[0, 1], [1, 2], [2, 0]] as Array<[number, number]>) {
      const e = Math.hypot((th[q] - th[p]) * rBar, zz[q] - zz[p]);
      if (e > L) L = e;
    }
    return L > 0 ? (2 * A) / L : 0;
  };

  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const t0 = Math.atan2(M.xyz[o + 1], M.xyz[o]);
    let tSum = t0; let zSum = M.xyz[o + 2];
    for (let k = 1; k < 3; k += 1) {
      tSum += t0 + dThRaw(t0, Math.atan2(M.xyz[o + k * 3 + 1], M.xyz[o + k * 3]));
      zSum += M.xyz[o + k * 3 + 2];
    }
    const thC = canonTheta(tSum / 3);
    let zC = zSum / 3; if (zC < 0) zC = 0; if (zC > H) zC = H;
    const i = Math.min(NTH - 1, Math.max(0, Math.floor((thC / TWO_PI) * NTH)));
    const j = Math.min(NZ - 1, Math.max(0, Math.floor((zC / H) * NZ)));
    const dd = dist[j * NTH + i];
    const b = bandOf(dd);
    const a = d.areaMm2[f];
    meshArea += a; meshAreaBand[b] += a;
    if (d.perFacetMaxRad[f] > thrRad) {
      clsArea += a; clsAreaBand[b] += a; clsCount += 1;
      if (minAltOf(f) < NEEDLE_UM / 1000) { needleArea += a; needleAreaBand[b] += a; }
    }
  }

  log('');
  log(`${el()} class at ${CEIL} deg: ${clsCount.toLocaleString()} facets, ${f3(clsArea, 3)} mm2 = ${pct(clsArea, meshArea)}% of mesh`);
  log(`   of which arc-space needles (<${NEEDLE_UM} um alt): ${f3(needleArea, 3)} mm2 = ${pct(needleArea, clsArea)}% of the class area`);
  log('');
  log(`${el()} DISTANCE-TO-C0 ENRICHMENT (cumulative). RISK RATIO = class share / mesh share; 1.0x = NO enrichment.`);
  log('   band (mm)     class area mm2   %class     mesh area mm2   %mesh      RISK      needle area   %needle');
  const rows: Array<Record<string, unknown>> = [];
  let cCum = 0; let mCum = 0; let nCum = 0;
  for (let b = 0; b <= BANDS.length; b += 1) {
    cCum += clsAreaBand[b]; mCum += meshAreaBand[b]; nCum += needleAreaBand[b];
    const label = b < BANDS.length ? `<= ${f3(BANDS[b], 2)}` : '  all';
    const cs = clsArea > 0 ? cCum / clsArea : 0;
    const ms = meshArea > 0 ? mCum / meshArea : 0;
    const rr = ms > 0 ? cs / ms : NaN;
    log(`   ${label.padStart(9)}    ${f3(cCum, 3).padStart(12)}  ${(cs * 100).toFixed(3).padStart(8)}%   ${f3(mCum, 3).padStart(12)}  ${(ms * 100).toFixed(3).padStart(8)}%   ${f3(rr, 3).padStart(7)}x  ${f3(nCum, 3).padStart(12)}  ${pct(nCum, needleArea).padStart(8)}%`);
    rows.push({ band: b < BANDS.length ? BANDS[b] : null, classArea: cCum, classShare: cs, meshArea: mCum, meshShare: ms, risk: rr, needleArea: nCum });
  }

  (OUT.jobs as unknown[]).push({
    tag: job.tag, style: job.style, stl: job.stl, nTri, meshAreaMm2: meshArea,
    jumpMaxMm: jMax, jbarCells: JBARS.map((v, i2) => ({ barMm: v, cells: jbarCount[i2], domainPct: (jbarCount[i2] / (NTH * NZ)) * 100 })),
    seedCells: anyZero, classCount: clsCount, classAreaMm2: clsArea, needleAreaMm2: needleArea, rows,
  });
}

writeFileSync(`${OUTDIR}/S116_CLIFF_ENRICH.json`, JSON.stringify(OUT, null, 2));
log('');
log(`${el()} wrote ${OUTDIR}/S116_CLIFF_ENRICH.json`);
