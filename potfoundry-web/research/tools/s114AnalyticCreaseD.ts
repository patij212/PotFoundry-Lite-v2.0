// s114AnalyticCreaseD.ts — DOES THE ANALYTIC SURFACE HAVE CREASES AT ALL? (the FLOOR under S114-D)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS. s114SweepD's oracle read IRREDUCIBLE = 0.00% on SpiralRidges and WaveInterference and
// 2.15% on Voronoi, against 98.52% on GothicArches. *** A ZERO IS EXACTLY WHAT A BROKEN DETECTOR
// RETURNS. *** The sweep's CTL-2b FLOOR (the conformed class must still be crease-labelled) is
// UNTESTABLE on those three styles because their conformed class is empty, so the sweep's floor is
// carried only by the Gothic calibration. That proves the CODE fires; it does not prove the detector
// would fire ON THIS STYLE'S rA.
//
// THIS TOOL IS MESH-FREE. It asks the surface directly, on a dense (theta, z) grid, with a DELTA LADDER:
//
//     turn(p, delta) := angle( n(p - delta*e), n(p + delta*e) )     for e in {theta-arc, z}
//
//   * A GENUINE C0 CREASE gives a turn that is INDEPENDENT of delta (the jump is there at every scale),
//     while the FRACTION of grid points seeing it shrinks ~proportionally to delta (the locus has
//     measure zero, so the band of width 2*delta around it thins).
//   * SMOOTH CURVATURE gives a turn PROPORTIONAL to delta (turn ~ kappa * 2*delta) and no fraction at
//     any fixed bar once delta is small enough.
//
// So the MAX-vs-delta column is the discriminator, and it is two-sided by construction: it can come out
// "creased" or "smooth" and both are informative. GothicArches is run as the POSITIVE CONTROL — it must
// come out delta-independent at >45 deg, or this tool is broken and its verdicts on the other styles are
// inadmissible.
//
// SECOND QUESTION, and the one that actually closes the loop: WHERE does the mesh's >45 deg dihedral
// class live? If a style has no analytic creases yet still carries >45 deg dihedrals, those facets are
// mesh artefacts and their (z, theta) distribution says which kind — a rim/base band, a theta-seam, or
// scattered slivers. That census is printed beside the analytic answer.
//
// Usage: bash research/tools/run-s114-analytic-crease-d.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { radialNormal } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const DEG = 180 / Math.PI;
const OUTDIR = 'research/exchange/_strataConformBisect/s114sweep';
const TAG = process.env.PF_S114AC_TAG ?? 'D';
const EXDIR = process.env.PF_S114AC_EXDIR
  ?? 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect';
const DEFAULT_STEMS = [
  'GothicArches:C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl',
  'SpiralRidges:spiralridges_ring_D--',
  'SuperellipseMorph:superellipsemorph_ring_D--',
  'SuperformulaBlossom:superformulablossom_ring_D--',
  'Voronoi:voronoi_ring_D--',
  'WaveInterference:waveinterference_ring_D--',
].join(',');
const STEMS = (process.env.PF_S114AC_STEMS ?? DEFAULT_STEMS).split(',').map((s) => s.trim()).filter((s) => s.length > 0);

const DIMS: StyleDims = { H: envF('PF_S114AC_H', 120), Rb: envF('PF_S114AC_RB', 40), Rt: envF('PF_S114AC_RT', 50), expn: 1 };
const H = DIMS.H;
const NTH = Math.round(envF('PF_S114AC_NTH', 900));      // theta samples
const NZ = Math.round(envF('PF_S114AC_NZ', 300));        // z samples
const DELTAS = (process.env.PF_S114AC_DELTAS ?? '4e-3,1e-3,2.5e-4,6.25e-5').split(',').map(Number);
const BAR = envF('PF_S114AC_BAR', 45);                   // the visibility cut
const HI_DEG = envF('PF_S114AC_HI', 45);                 // mesh dihedral cut for the location census

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
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

log('===== S114-D FLOOR — DOES THE ANALYTIC SURFACE HAVE CREASES AT ALL? (mesh-free delta ladder) =====');
log(`grid ${NTH} theta x ${NZ} z = ${NTH * NZ} points   deltas ${DELTAS.join(', ')} mm   bar ${BAR} deg`);
log('DISCRIMINATOR: a C0 CREASE gives a DELTA-INDEPENDENT turn; SMOOTH CURVATURE gives turn ~ delta.');
log('POSITIVE CONTROL: GothicArches must come out delta-independent over the bar, or this tool is broken.');
log('');

const out: Array<Record<string, unknown>> = [];
for (const stem of STEMS) {
  const ci = stem.indexOf(':');
  const style = stem.slice(0, ci); const file = stem.slice(ci + 1);
  const stl = file.includes('/') || file.includes('\\') ? file : `${EXDIR}/${file}.stl`;
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`═════ ${style} ═════`);
  const rAbase = buildRadiusFn(style as StyleId, { ...registryDefaults(style) }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const rec: Record<string, unknown> = { style, stl };

  // normal at (th, z) by central differences at a FIXED small probe step, well below every delta on the
  // ladder so the normal itself is not the thing being scanned.
  const HP = envF('PF_S114AC_HPROBE', 1e-5);
  const nbuf = new Float64Array(3);
  const normalAt = (th: number, z: number, o: Float64Array, oi: number): void => {
    const r0 = rA(th, z);
    const hTh = HP / Math.max(1e-9, Math.abs(r0));
    const rt = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hTh);
    let zLo = z - HP; let zHi = z + HP;
    if (zLo < 0) { zLo = 0; zHi = 2 * HP; }
    if (zHi > H) { zHi = H; zLo = H - 2 * HP; }
    const rz = (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo);
    radialNormal(r0, rt, rz, th, o, oi);
  };
  const ang = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => {
    let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    return Math.acos(dp);
  };

  const nA = new Float64Array(3); const nB = new Float64Array(3);
  const ladder: Array<Record<string, number>> = [];
  for (const dl of DELTAS) {
    const vals: number[] = [];
    let over = 0; let n = 0; let maxV = 0; let maxTh = 0; let maxZ = 0; let maxDir = 0;
    for (let iz = 1; iz < NZ - 1; iz += 1) {
      const z = (H * iz) / (NZ - 1);
      for (let it = 0; it < NTH; it += 1) {
        const th = (2 * Math.PI * it) / NTH;
        const r0 = rA(th, z);
        const dTh = dl / Math.max(1e-9, Math.abs(r0));
        // theta direction
        normalAt(th - dTh, z, nA, 0); normalAt(th + dTh, z, nB, 0);
        let a = ang(nA, 0, nB, 0) * DEG;
        if (a > maxV) { maxV = a; maxTh = th; maxZ = z; maxDir = 0; }
        n += 1; vals.push(a); if (a >= BAR) over += 1;
        // z direction (skip where the delta would leave the domain)
        if (z - dl >= 0 && z + dl <= H) {
          normalAt(th, z - dl, nA, 0); normalAt(th, z + dl, nB, 0);
          a = ang(nA, 0, nB, 0) * DEG;
          if (a > maxV) { maxV = a; maxTh = th; maxZ = z; maxDir = 1; }
          n += 1; vals.push(a); if (a >= BAR) over += 1;
        }
      }
    }
    ladder.push({ delta: dl, n, p50: q(vals, 0.5), p99: q(vals, 0.99), max: maxV, overPct: (over / n) * 100 });
    log(`  delta ${dl.toExponential(2)} mm   n ${n}   turn p50 ${q(vals, 0.5).toExponential(3)}  p99 ${q(vals, 0.99).toFixed(4)}  MAX ${maxV.toFixed(4)} deg   over ${BAR} deg: ${((over / n) * 100).toFixed(5)}%   argmax (th ${(maxTh * DEG).toFixed(3)} deg, z ${maxZ.toFixed(3)} mm, ${maxDir === 0 ? 'theta' : 'z'})   ${el()}`);
  }
  rec.ladder = ladder;
  // THE VERDICT. Compare MAX at the coarsest and finest delta. Crease => ratio ~1. Smooth => ratio ~
  // (coarse/fine) delta ratio.
  const first = ladder[0]; const last = ladder[ladder.length - 1];
  const dRatio = first.delta / last.delta;
  const mRatio = last.max > 0 ? first.max / last.max : Infinity;
  rec.maxRatio = mRatio; rec.deltaRatio = dRatio; rec.maxAtFinest = last.max;
  const creased = last.max >= BAR;
  rec.analyticCreasesPresent = creased;
  log(`  MAX turn: ${first.max.toFixed(4)} deg at delta ${first.delta.toExponential(2)}  ->  ${last.max.toFixed(4)} deg at delta ${last.delta.toExponential(2)}`);
  log(`     delta shrank ${dRatio.toFixed(0)}x;  MAX shrank ${mRatio.toFixed(2)}x   =>  ${mRatio > 0.5 * dRatio ? 'SMOOTH (turn tracks delta)' : 'DELTA-INDEPENDENT (a real C0 crease)'}`);
  log(`  *** ANALYTIC CREASES >= ${BAR} deg PRESENT AT THE FINEST DELTA: ${creased ? 'YES' : 'NO'} *** (MAX ${last.max.toFixed(4)} deg)`);

  // ── WHERE DOES THE MESH'S >45 DEG CLASS LIVE? ──
  {
    const M = readMeshFloat64(stl, false);
    const xyz = M.xyz; const nTri = M.nTri;
    let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
    for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > worst) worst = dd;
    }
    rec.precondUm = worst * 1000;
    log(`  PRECOND max |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um`);
    if (worst * 1000 > 50) { log('  *** REFUSED: params/dims mismatch. ***'); rec.refused = true; out.push(rec); continue; }
    const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
    let meshArea = 0;
    for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
    const thr = (HI_DEG * Math.PI) / 180;
    const zs: number[] = []; let hiA = 0; let hiC = 0;
    let nearEnd = 0; let nearEndA = 0;
    const EPS = envF('PF_S114AC_ENDBAND', 0.5);   // mm from z=0 or z=H
    for (let f = 0; f < nTri; f += 1) {
      if (!(d.perFacetMaxRad[f] > thr)) continue;
      hiC += 1; hiA += d.areaMm2[f];
      const zc = (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3;
      zs.push(zc);
      const zmin = Math.min(xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]);
      const zmax = Math.max(xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]);
      if (zmin <= EPS || zmax >= H - EPS) { nearEnd += 1; nearEndA += d.areaMm2[f]; }
    }
    rec.meshFacets = nTri; rec.meshAreaMm2 = meshArea;
    rec.hiCnt = hiC; rec.hiAreaMm2 = hiA; rec.hiAreaPct = (hiA / meshArea) * 100;
    rec.hiEndBandCnt = nearEnd; rec.hiEndBandAreaPct = hiA > 0 ? (nearEndA / hiA) * 100 : NaN;
    log(`  MESH >${HI_DEG} deg class: COUNT ${hiC} (${((hiC / nTri) * 100).toFixed(4)}%)  AREA ${hiA.toFixed(4)} mm2 (${((hiA / meshArea) * 100).toFixed(4)}% of mesh)`);
    if (hiC > 0) {
      log(`     z of those facets  p10 ${q(zs, 0.1).toFixed(2)}  p50 ${q(zs, 0.5).toFixed(2)}  p90 ${q(zs, 0.9).toFixed(2)} mm   (H = ${H})`);
      log(`     within ${EPS} mm of z=0 or z=H (rim/base band): COUNT ${nearEnd} (${((nearEnd / hiC) * 100).toFixed(2)}%)   AREA ${((nearEndA / hiA) * 100).toFixed(2)}% of the class`);
    }
  }
  out.push(rec);
  writeFileSync(`${OUTDIR}/S114_ANALYTIC_CREASE_${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`);
  log('');
}

log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('  FLOOR SUMMARY — analytic creases present?  (never averaged; this is a per-style property)');
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('style | MAX turn @ coarsest | MAX turn @ finest | MAX shrink vs delta shrink | analytic creases >=45 deg | mesh >45 area% | in rim/base band');
for (const r of out) {
  const L = r.ladder as Array<Record<string, number>>;
  log([
    r.style as string,
    `${L[0].max.toFixed(3)} deg`,
    `${L[L.length - 1].max.toFixed(3)} deg`,
    `${(r.maxRatio as number).toFixed(2)}x vs ${(r.deltaRatio as number).toFixed(0)}x`,
    (r.analyticCreasesPresent as boolean) ? 'YES' : 'NO',
    r.hiAreaPct === undefined ? 'n/a' : `${(r.hiAreaPct as number).toFixed(4)}%`,
    r.hiEndBandAreaPct === undefined || !Number.isFinite(r.hiEndBandAreaPct as number) ? 'n/a' : `${(r.hiEndBandAreaPct as number).toFixed(1)}%`,
  ].join(' | '));
}
writeFileSync(`${OUTDIR}/S114_ANALYTIC_CREASE_${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`);
log('');
log(`wrote ${OUTDIR}/S114_ANALYTIC_CREASE_${TAG}.json`);
log(`done ${el()}`);
