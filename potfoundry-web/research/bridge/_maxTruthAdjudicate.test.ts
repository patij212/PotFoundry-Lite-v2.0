// _maxTruthAdjudicate.test.ts — STRATA-001: adjudicate the DISPUTED MAX. Gated PF_MAXADJ=1. RESEARCH ONLY.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE DISPUTE
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// On the SAME mesh (geometricstar_ring_D--.stl) two instruments disagree about the worst facet by ~6x:
//   GPU screen (research/gpu/gpuRuler.js)      max 1195.107 um
//   CPU auditor (certifyTriangle, H1)          max  193.846 um
// The 2026-07-28 results doc attributes the gap to the GPU over-stating, and that is the mathematically
// likely reading — both quantities are UPPER bounds on dist(p,S) obtained by exhibiting a surface point,
// so the SMALLER one is the truthful one. But the attribution was never measured, and there is a second
// mechanism pointing the other way that would make the CPU number too LOW:
//
//   (1) `certifyTriangle` BREAKS at the first witnessed exceedance (_facetTruthLib.ts:312). Correct for the
//       verdict — more resolution cannot un-fail a facet — but it means `witnessed` on a FAILING facet is
//       "first value found over tol", not "worst point on the facet". On the flagged GeoStar arm 72.5 % of
//       facets fail, so essentially every one short-circuits at its initial lattice level.
//   (2) The true perpendicular is evaluated at ONE point per facet — the argmax of the RADIAL reading
//       (_facetTruthLib.ts:304-306). The radial argmax is not the perpendicular argmax. Every other lattice
//       point keeps its inflated radial value or is never refined.
//
// So neither 194 nor 1195 is established as the true max, and the campaign has no instrument that reports
// it. This file builds one, for a selected facet set, and adjudicates.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS NEEDS NO GPU — and why that makes it a BETTER test
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// The GPU screen's ranking key is `max over a barycentric lattice of the RADIAL-foot distance`, tightened by
// a couple of Gauss-Newton steps with NO globalisation (gpuRuler.js:289-299, which states the radial foot
// over-states by 1/cos(tilt) and cites 19.871x MEASURED on a ridged surface). Pure radial — `distRadial`,
// one rA eval — is that same key WITHOUT the tightening, hence an even looser upper bound. Therefore:
//
//   * ranking every facet by CPU pure-radial produces a SUPERSET of the GPU's worst facets, so the disputed
//     facet cannot be missed by facet selection, and
//   * running radial and true-perpendicular over the SAME lattice on the SAME machine isolates the
//     radial-vs-perpendicular inflation with no cross-instrument, cross-precision or cross-process confound.
//
// If maxRadial lands near 1195 while the dense perpendicular lands near 194, the GPU number is fully
// explained as radial inflation and no GPU run is needed to say so.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IS COMPUTED PER SELECTED FACET
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
//   n            lattice level sized so the coverage radius rho = covRad/n hits PF_MA_RHO_UM (default 2 um)
//   maxRadial    max over that lattice of distRadial          — the GPU-proxy key
//   denseMax     max over that lattice of the TIGHTEST available distance:
//                  min(radial, coordinate-descent, Newton-from-descent), then for the top
//                  PF_MA_GCONF points a full `distPerp` GLOBAL confirm (720x480 sweep + polish)
//   bound        denseMax + rho  — a genuine upper bound on the continuum max over the facet, since every
//                per-point value is itself an upper bound on d and d is 1-Lipschitz
//   cpuWitnessed `certifyTriangle` on the same facet — the auditor's own early-break number
//
// The global confirm is spent on the top points ONLY because the maximum is the disputed quantity; a wrong
// well at a non-maximal point cannot change the verdict. That is what makes the cost tractable: full
// `distPerp` at every one of ~130k lattice points would be ~4.5e10 rA evals per facet.
//
// FALSIFIERS, stated before the run:
//   * "GPU over-states"      predicts maxRadial/denseMax ~ 5-6x and denseMax ~ 194 um.
//   * "CPU under-reports"    predicts denseMax >> cpuWitnessed on the selected facets.
//   These are independent: both, either, or neither may hold.
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { certifyTriangle, covRadius, detectThetaJumps, detectZJumps, distLocal, distPerp, distPerpFrom, distRadial } from './_facetTruthLib';

const RUN = process.env.PF_MAXADJ === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const TWO_PI = 2 * Math.PI;

function envF(n: string, d: number): number {
  const r = process.env[n];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const um = (mm: number): string => (mm * 1000).toFixed(3);

function readBinarySTL(path: string): { xyz: Float64Array; nTri: number } {
  const buf = readFileSync(path);
  if (buf.length < 84) throw new Error(`STL too short: ${path}`);
  const nTri = buf.readUInt32LE(80);
  if (buf.length !== 84 + nTri * 50) throw new Error(`STL size mismatch: ${buf.length} != 84 + ${nTri}*50`);
  const xyz = new Float64Array(nTri * 9);
  let o = 84;
  for (let t = 0; t < nTri; t += 1) {
    o += 12;
    for (let k = 0; k < 9; k += 1) { xyz[t * 9 + k] = buf.readFloatLE(o); o += 4; }
    o += 2;
  }
  return { xyz, nTri };
}

/** Deterministic LCG — control facets must be reproducible across re-runs. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

interface FacetRow {
  tri: number;
  why: string;
  covUm: number;
  edgesUm: [number, number, number];
  n: number;
  samples: number;
  rhoUm: number;
  maxRadialUm: number;
  denseMaxUm: number;
  boundUm: number;
  cpuWitnessedUm: number;
  cpuN: number;
  gConfMovedUm: number;
  secs: number;
}

describe('STRATA max-truth adjudication', () => {
  it.runIf(RUN)('measures the true perpendicular max on the disputed facets', () => {
    const stlPath = process.env.PF_MA_STL ?? '';
    const STYLE = process.env.PF_MA_STYLE ?? 'GeometricStar';
    const TOL = envF('PF_MA_TOL_UM', 10) / 1000;
    const RHO = envF('PF_MA_RHO_UM', 2) / 1000;      // target coverage radius for the dense lattice
    const PRE_N = envI('PF_MA_PRE_N', 24);           // lattice cap for the cheap all-facet radial pre-pass
    const NMAX = envI('PF_MA_NMAX', 512);            // dense lattice cap  (512 => 131841 samples)
    const K_RAD = envI('PF_MA_KRAD', 24);            // top-K by maxRadial   (the GPU-proxy worst)
    const K_COV = envI('PF_MA_KCOV', 12);            // top-K by covRad      (largest facets)
    const K_CTL = envI('PF_MA_KCTL', 24);            // random controls
    const GCONF = envI('PF_MA_GCONF', 64);           // global confirms per facet
    const GNU = envI('PF_MA_GNU', 720);
    const GNV = envI('PF_MA_GNV', 480);
    const tag = process.env.PF_MA_TAG ?? STYLE;
    if (stlPath === '') throw new Error('PF_MA_STL is required');

    const styleParams: Record<string, number> = { ...registryDefaults(STYLE) };
    if (process.env.PF_MA_PARAMS !== undefined) Object.assign(styleParams, JSON.parse(process.env.PF_MA_PARAMS) as Record<string, number>);
    const rAraw = buildRadiusFn(STYLE as StyleId, styleParams, DIMS);
    let rEvals = 0;
    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
    const rA = (th: number, z: number): number => { rEvals += 1; return rAraw(canon(th), z < 0 ? 0 : z > H ? H : z); };

    const { xyz, nTri } = readBinarySTL(stlPath);
    const zJumps = detectZJumps(rA, H);
    const thJumps = detectThetaJumps(rA, H);
    const t0 = Date.now();

    const lines: string[] = ['', `===== STRATA MAX-TRUTH ADJUDICATION: ${STYLE} =====`,
      `stl: ${stlPath}  (${nTri} triangles)`,
      `params ${JSON.stringify(styleParams)}`,
      `TOL ${um(TOL)} um   target rho ${um(RHO)} um   pre-pass n<=${PRE_N}   dense n<=${NMAX}`,
      `detected C0 z-steps: ${zJumps.length}   theta-jumps: ${thJumps.length}`];

    // ── STAGE 1: cheap radial pre-pass over EVERY facet — reproduces the GPU screen's ranking key ────────
    const maxRad = new Float64Array(nTri);
    const covs = new Float64Array(nTri);
    for (let t = 0; t < nTri; t += 1) {
      const o = t * 9;
      const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
      const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
      const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
      const cov = covRadius(ax, ay, az, bx, by, bz, cx, cy, cz);
      covs[t] = cov;
      if (!(cov > 0)) continue;
      const n = Math.min(PRE_N, Math.max(2, Math.ceil(cov / TOL)));
      const ubx = (bx - ax) / n; const uby = (by - ay) / n; const ubz = (bz - az) / n;
      const ucx = (cx - ax) / n; const ucy = (cy - ay) / n; const ucz = (cz - az) / n;
      let mx = 0;
      for (let i = 0; i <= n; i += 1) {
        const rx = ax + ucx * i; const ry = ay + ucy * i; const rz = az + ucz * i;
        for (let j = 0; j <= n - i; j += 1) {
          const d = distRadial(rA, H, rx + ubx * j, ry + uby * j, rz + ubz * j);
          if (d > mx) mx = d;
        }
      }
      maxRad[t] = mx;
    }
    let preArg = 0;
    for (let t = 1; t < nTri; t += 1) if (maxRad[t] > maxRad[preArg]) preArg = t;
    const preSecs = (Date.now() - t0) / 1000;
    lines.push('', '--- STAGE 1  radial pre-pass over ALL facets (the GPU screen\'s key, computed on CPU) ---',
      `  ${preSecs.toFixed(0)}s   ${(rEvals / 1e6).toFixed(1)}M rA evals`,
      `  GLOBAL MAX RADIAL : ${um(maxRad[preArg])} um   at tri ${preArg}   covRad ${um(covs[preArg])} um`);

    // ── STAGE 2: facet selection ────────────────────────────────────────────────────────────────────────
    const order = (key: Float64Array): Int32Array => {
      const idx = new Int32Array(nTri);
      for (let t = 0; t < nTri; t += 1) idx[t] = t;
      // partial selection is enough, but nTri log nTri once is cheap relative to stage 3
      const arr = Array.from(idx);
      arr.sort((p, q) => key[q] - key[p]);
      return Int32Array.from(arr);
    };
    const byRad = order(maxRad);
    const byCov = order(covs);
    const picked = new Map<number, string>();
    const add = (t: number, why: string): void => {
      const prev = picked.get(t);
      picked.set(t, prev === undefined ? why : `${prev}+${why}`);
    };
    for (let k = 0; k < K_RAD && k < nTri; k += 1) add(byRad[k], 'RAD');
    for (let k = 0; k < K_COV && k < nTri; k += 1) add(byCov[k], 'COV');
    // the CPU auditor's own reported argmax facet, located by its printed vertex z/theta triple
    const findZ = process.env.PF_MA_FINDZ;
    if (findZ !== undefined) {
      const want = findZ.split(',').map((s) => Number.parseFloat(s));
      let hits = 0;
      for (let t = 0; t < nTri && hits < 16; t += 1) {
        const o = t * 9;
        if (Math.abs(xyz[o + 2] - want[0]) < 2e-3 && Math.abs(xyz[o + 5] - want[1]) < 2e-3 && Math.abs(xyz[o + 8] - want[2]) < 2e-3) {
          add(t, 'CPUARG'); hits += 1;
        }
      }
      lines.push(`  located ${hits} facet(s) matching PF_MA_FINDZ=${findZ}`);
    }
    const rnd = lcg(20260729);
    for (let k = 0; k < K_CTL; k += 1) add(Math.floor(rnd() * nTri), 'CTL');
    const sel = Array.from(picked.keys());
    lines.push(`  selected ${sel.length} facets  (top ${K_RAD} radial, top ${K_COV} covRad, ${K_CTL} controls, plus located)`);

    // ── STAGE 3: dense adjudication ─────────────────────────────────────────────────────────────────────
    const rows: FacetRow[] = [];
    for (const t of sel) {
      const fT0 = Date.now();
      const o = t * 9;
      const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
      const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
      const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
      const cov = covs[t];
      const e1 = Math.hypot(bx - ax, by - ay, bz - az);
      const e2 = Math.hypot(cx - bx, cy - by, cz - bz);
      const e3 = Math.hypot(ax - cx, ay - cy, az - cz);
      if (!(cov > 0)) continue;
      const n = Math.min(NMAX, Math.max(2, Math.ceil(cov / RHO)));
      const nSamp = ((n + 1) * (n + 2)) / 2;
      const ubx = (bx - ax) / n; const uby = (by - ay) / n; const ubz = (bz - az) / n;
      const ucx = (cx - ax) / n; const ucy = (cy - ay) / n; const ucz = (cz - az) / n;

      const dT = new Float64Array(nSamp);
      const pts = new Float64Array(nSamp * 3);
      let mxRad = 0; let mxTight = 0; let s = 0;
      for (let i = 0; i <= n; i += 1) {
        const rx = ax + ucx * i; const ry = ay + ucy * i; const rz = az + ucz * i;
        for (let j = 0; j <= n - i; j += 1) {
          const px = rx + ubx * j; const py = ry + uby * j; const pz = rz + ubz * j;
          const dR = distRadial(rA, H, px, py, pz);
          if (dR > mxRad) mxRad = dR;
          // descent locates the well, Newton makes the foot perpendicular; every candidate is an upper
          // bound on d(p), so the min of them is too
          const seed = distLocal(rA, H, px, py, pz, Math.atan2(py, px), pz < 0 ? 0 : pz > H ? H : pz, Math.max(dR, TOL), 40, zJumps, thJumps);
          let d = dR < seed.d ? dR : seed.d;
          const pol = distPerpFrom(rA, H, px, py, pz, seed.th, seed.z);
          if (pol.d < d) d = pol.d;
          dT[s] = d; pts[s * 3] = px; pts[s * 3 + 1] = py; pts[s * 3 + 2] = pz;
          if (d > mxTight) mxTight = d;
          s += 1;
        }
      }

      // GLOBAL CONFIRM on the top GCONF points — the only place a wrong well can change the verdict
      const topIdx = Array.from({ length: nSamp }, (_v, k) => k).sort((p, q) => dT[q] - dT[p]).slice(0, Math.min(GCONF, nSamp));
      let moved = 0;
      for (const k of topIdx) {
        const g = distPerp(rA, H, pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2], { nu: GNU, nv: GNV, zJumps, thJumps });
        if (g.d < dT[k]) { moved = Math.max(moved, dT[k] - g.d); dT[k] = g.d; }
      }
      let denseMax = 0;
      for (let k = 0; k < nSamp; k += 1) if (dT[k] > denseMax) denseMax = dT[k];

      // the auditor's own number on the SAME facet, with its own settings
      const v = certifyTriangle(rA, ax, ay, az, bx, by, bz, cx, cy, cz, { H, tol: TOL, zJumps, thJumps });

      rows.push({
        tri: t, why: picked.get(t) ?? '?', covUm: cov * 1000, edgesUm: [e1 * 1000, e2 * 1000, e3 * 1000],
        n, samples: nSamp, rhoUm: (cov / n) * 1000,
        maxRadialUm: mxRad * 1000, denseMaxUm: denseMax * 1000, boundUm: (denseMax + cov / n) * 1000,
        cpuWitnessedUm: v.witnessed * 1000, cpuN: v.n, gConfMovedUm: moved * 1000,
        secs: (Date.now() - fT0) / 1000,
      });
    }

    rows.sort((p, q) => q.denseMaxUm - p.denseMaxUm);
    const worst = rows[0];
    const maxRadialSel = rows.reduce((m, r) => Math.max(m, r.maxRadialUm), 0);
    const inflations = rows.filter((r) => r.denseMaxUm > 1e-6).map((r) => r.maxRadialUm / r.denseMaxUm).sort((p, q) => p - q);
    const unders = rows.filter((r) => r.cpuWitnessedUm > 1e-6).map((r) => r.denseMaxUm / r.cpuWitnessedUm).sort((p, q) => p - q);
    const med = (a: number[]): number => (a.length === 0 ? 0 : a[Math.floor(a.length / 2)]);

    lines.push('', '--- STAGE 3  dense true-perpendicular adjudication ---',
      `  facets adjudicated : ${rows.length}`,
      `  WORST denseMax     : ${worst.denseMaxUm.toFixed(3)} um   (tri ${worst.tri}, ${worst.why}, n=${worst.n}, rho=${worst.rhoUm.toFixed(3)} um)`,
      `    certified upper bound on that facet : ${worst.boundUm.toFixed(3)} um`,
      `    same facet, maxRadial (GPU-proxy)   : ${worst.maxRadialUm.toFixed(3)} um`,
      `    same facet, certifyTriangle witness : ${worst.cpuWitnessedUm.toFixed(3)} um  (n=${worst.cpuN})`,
      `  max maxRadial over selected facets    : ${maxRadialSel.toFixed(3)} um`,
      '',
      `  RADIAL INFLATION  maxRadial/denseMax  : min ${inflations[0]?.toFixed(2) ?? 'n/a'}  med ${med(inflations).toFixed(2)}  max ${inflations[inflations.length - 1]?.toFixed(2) ?? 'n/a'}`,
      `  CPU UNDER-REPORT  denseMax/cpuWitness : min ${unders[0]?.toFixed(2) ?? 'n/a'}  med ${med(unders).toFixed(2)}  max ${unders[unders.length - 1]?.toFixed(2) ?? 'n/a'}`,
      '',
      '  tri        why      covUm     n   rho    maxRadial   denseMax    bound    cpuWitness  gMoved  secs');
    for (const r of rows) {
      lines.push(`  ${String(r.tri).padStart(9)}  ${r.why.padEnd(8)} ${r.covUm.toFixed(1).padStart(8)} ${String(r.n).padStart(5)} ${r.rhoUm.toFixed(2).padStart(5)} ${r.maxRadialUm.toFixed(3).padStart(11)} ${r.denseMaxUm.toFixed(3).padStart(10)} ${r.boundUm.toFixed(3).padStart(9)} ${r.cpuWitnessedUm.toFixed(3).padStart(11)} ${r.gConfMovedUm.toFixed(3).padStart(7)} ${r.secs.toFixed(1).padStart(6)}`);
    }
    lines.push('', `${((Date.now() - t0) / 1000).toFixed(0)}s   ${(rEvals / 1e6).toFixed(1)}M rA evals`,
      '=========================================================');

    const outDir = join(process.cwd(), 'research', 'exchange', '_maxTruthAdjudicate');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${tag}.report.txt`), `${lines.join('\n')}\n`);
    const csv = ['tri,why,covUm,e1Um,e2Um,e3Um,n,samples,rhoUm,maxRadialUm,denseMaxUm,boundUm,cpuWitnessedUm,cpuN,gConfMovedUm,secs',
      ...rows.map((r) => [r.tri, r.why, r.covUm, r.edgesUm[0], r.edgesUm[1], r.edgesUm[2], r.n, r.samples, r.rhoUm,
        r.maxRadialUm, r.denseMaxUm, r.boundUm, r.cpuWitnessedUm, r.cpuN, r.gConfMovedUm, r.secs].join(','))];
    writeFileSync(join(outDir, `${tag}.facets.csv`), `${csv.join('\n')}\n`);
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    expect(rows.length).toBeGreaterThan(0);
  }, 6_000_000);
});
