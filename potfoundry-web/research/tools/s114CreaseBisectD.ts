// s114CreaseBisectD.ts — THE FLOOR UNDER S114-D, DONE PROPERLY: LOCUS-SEEKING CREASE BISECTION.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS, AND WHY ITS PREDECESSOR IS VOID.
//
// s114AnalyticCreaseD.ts asked "does the analytic surface have creases?" by scanning a FIXED (theta, z)
// grid with a SHRINKING probe window delta, and calling the surface creased if the MAX turn stayed
// delta-independent. *** THAT TOOL'S OWN POSITIVE CONTROL FIRED AND I AM RECORDING THE FAILURE RATHER
// THAN THE NUMBER. *** GothicArches — which provably HAS 136 deg analytic creases — came out
// "SMOOTH, no analytic creases" at NTH=900 (MAX 168.125 -> 0.423 deg, shrinking 397x while delta shrank
// 64x) and "CREASED" at NTH=960 (167.24 -> 136.22, shrinking 1.23x). The only thing that changed is the
// grid: 960 is a multiple of Gothic's 12-fold symmetry and lands ON the loci; 900 is not and lands
// beside them.
//
// THE REASON IS STRUCTURAL, NOT A TUNING MISS. A crease is a MEASURE-ZERO set. A fixed grid probed with
// a window of half-width delta only sees it when a grid point lies within delta of the locus, so as
// delta -> 0 the hit probability -> 0 and MAX-over-grid collapses for ANY surface. The statistic cannot
// distinguish "no crease" from "grid missed the crease". Every number in
// S114_ANALYTIC_CREASE_D.report.txt is therefore VOID as a crease verdict. (Its coarse-delta columns
// and its mesh >45 location census are unaffected and are re-derived here.)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS TOOL DOES INSTEAD — SHRINK TOWARD THE LOCUS, NOT AROUND A FIXED POINT.
//
//   1. TILE the domain with segments (adjacent grid points, both directions). Segments TILE, so a locus
//      crossing the domain must cross some segment — there is no gap for it to hide in, and the result
//      does not depend on the grid landing on the locus.
//   2. Take the top-M segments by turn.
//   3. BISECT each: split at the midpoint, measure the turn on each half, KEEP THE HALF WITH THE LARGER
//      TURN, repeat L times. The segment shrinks 2^L while always CONTAINING the feature.
//   4. A genuine C0 crease keeps its turn as the segment shrinks (ratio ~ 1 over 2^L). Smooth curvature
//      halves its turn every level (ratio ~ 2^L).
//
// This is fixture H2's construction (the campaign's own: a crease straddle is invariant x0.9968 over
// five halvings while a smooth control decays x28.43), applied to the SURFACE rather than to a facet.
//
// THE PROBE STEP SHRINKS WITH THE SEGMENT. S113 §4 records that `locateTurn` loses asymmetric creases
// because its midpoint probe uses a finite-difference window that itself straddles the crease. Here the
// normal at each endpoint is taken with hProbe = segment/1000, so the window is always three orders
// below the bracket and never spans it.
//
// TWO-SIDED CONTROLS, BOTH REQUIRED TO PASS BEFORE ANY VERDICT IS ADMISSIBLE:
//   POS  GothicArches must come out CREASED (deepest turn >= 45 deg) at BOTH grid phases that broke the
//        predecessor — NTH = 900 (locus-missing) and NTH = 960 (locus-aligned). If the answer still
//        depends on the grid, this tool is no better than the last one.
//   NEG  A closed-form SMOOTH surface (r = 40 + 3*cos(3*theta)*sin(pi*z/H), no creases anywhere) must
//        come out SMOOTH, with its turn halving per level. A detector that says "creased" everywhere
//        passes the positive control and is worthless.
//
// Usage: bash research/tools/run-s114-crease-bisect-d.sh
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
const TAG = process.env.PF_S114CB_TAG ?? 'D';
const EXDIR = process.env.PF_S114CB_EXDIR
  ?? 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect';
const GOTH = 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const DEFAULT_STEMS = [
  `GothicArches:${GOTH}`,
  'SpiralRidges:spiralridges_ring_D--',
  'SuperellipseMorph:superellipsemorph_ring_D--',
  'SuperformulaBlossom:superformulablossom_ring_D--',
  'Voronoi:voronoi_ring_D--',
  'WaveInterference:waveinterference_ring_D--',
].join(',');
const STEMS = (process.env.PF_S114CB_STEMS ?? DEFAULT_STEMS).split(',').map((s) => s.trim()).filter((s) => s.length > 0);

const DIMS: StyleDims = { H: envF('PF_S114CB_H', 120), Rb: envF('PF_S114CB_RB', 40), Rt: envF('PF_S114CB_RT', 50), expn: 1 };
const H = DIMS.H;
const NTH = Math.round(envF('PF_S114CB_NTH', 900));
const NZ = Math.round(envF('PF_S114CB_NZ', 300));
const TOPM = Math.round(envF('PF_S114CB_TOPM', 40));    // segments carried into the bisection
const LEV = Math.round(envF('PF_S114CB_LEV', 14));      // bisection levels: the segment shrinks 2^LEV
const BAR = envF('PF_S114CB_BAR', 45);
const HI_DEG = envF('PF_S114CB_HI', 45);
const PHASES = (process.env.PF_S114CB_PHASES ?? '900,960').split(',').map(Number);  // Gothic control grids

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const o: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') o[snakeToCamel(k)] = v.default;
  }
  return o;
}

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

type RFn = (th: number, z: number) => number;

/** Unit normal at (th,z), central differences with an explicit probe half-step `hp` (mm). */
function normalAt(rA: RFn, th: number, z: number, hp: number, o: Float64Array): void {
  const r0 = rA(th, z);
  const hTh = hp / Math.max(1e-9, Math.abs(r0));
  const rt = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hTh);
  let zLo = z - hp; let zHi = z + hp;
  if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * hp); }
  if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * hp); }
  const rz = zHi > zLo ? (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo) : 0;
  radialNormal(r0, rt, rz, th, o, 0);
}
const nA = new Float64Array(3); const nB = new Float64Array(3);
const angOf = (a: Float64Array, b: Float64Array): number => {
  let dp = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  return Math.acos(dp);
};
/** Turn across the segment (th0,z0)-(th1,z1), endpoints probed with hp = |segment|/1000. */
function turnOf(rA: RFn, th0: number, z0: number, th1: number, z1: number, rRef: number): number {
  const arc = Math.hypot(rRef * (th1 - th0), z1 - z0);
  const hp = Math.max(1e-9, arc / 1000);
  normalAt(rA, th0, z0, hp, nA);
  normalAt(rA, th1, z1, hp, nB);
  return angOf(nA, nB) * DEG;
}
/** Bisect toward the feature: keep the half carrying the larger turn. Returns the turn at each level. */
function bisectLadder(rA: RFn, th0: number, z0: number, th1: number, z1: number, rRef: number, levels: number): number[] {
  let a0 = th0; let b0 = z0; let a1 = th1; let b1 = z1;
  const out: number[] = [turnOf(rA, a0, b0, a1, b1, rRef)];
  for (let L = 0; L < levels; L += 1) {
    const mt = (a0 + a1) / 2; const mz = (b0 + b1) / 2;
    const tL = turnOf(rA, a0, b0, mt, mz, rRef);
    const tR = turnOf(rA, mt, mz, a1, b1, rRef);
    if (tL >= tR) { a1 = mt; b1 = mz; out.push(tL); } else { a0 = mt; b0 = mz; out.push(tR); }
  }
  return out;
}

/** Full scan + bisection for one radius function. */
function creaseScan(rA: RFn, nth: number, nz: number): {
  coarseP50: number; coarseP99: number; coarseMax: number; coarseOverPct: number;
  deepestMax: number; level0OfBest: number; ratio: number; ladders: number[][]; segs: Array<{ th: number; z: number; dir: string }>;
} {
  const cand: Array<{ turn: number; th0: number; z0: number; th1: number; z1: number; rRef: number; dir: string }> = [];
  const all: number[] = [];
  let over = 0; let n = 0;
  for (let iz = 0; iz < nz; iz += 1) {
    const z = (H * iz) / (nz - 1);
    const zN = (H * Math.min(nz - 1, iz + 1)) / (nz - 1);
    for (let it = 0; it < nth; it += 1) {
      const th = (2 * Math.PI * it) / nth;
      const thN = (2 * Math.PI * (it + 1)) / nth;
      const rRef = Math.max(1e-9, rA(th, z));
      // theta-direction segment (tiles the circle)
      let t = turnOf(rA, th, z, thN, z, rRef);
      all.push(t); n += 1; if (t >= BAR) over += 1;
      cand.push({ turn: t, th0: th, z0: z, th1: thN, z1: z, rRef, dir: 'theta' });
      // z-direction segment (tiles the height)
      if (iz + 1 < nz) {
        t = turnOf(rA, th, z, th, zN, rRef);
        all.push(t); n += 1; if (t >= BAR) over += 1;
        cand.push({ turn: t, th0: th, z0: z, th1: th, z1: zN, rRef, dir: 'z' });
      }
    }
  }
  cand.sort((a, b) => b.turn - a.turn);
  const top = cand.slice(0, TOPM);
  const ladders = top.map((c) => bisectLadder(rA, c.th0, c.z0, c.th1, c.z1, c.rRef, LEV));
  let deepest = 0; let lvl0 = 0;
  for (let i = 0; i < ladders.length; i += 1) {
    const dv = ladders[i][ladders[i].length - 1];
    if (dv > deepest) { deepest = dv; lvl0 = ladders[i][0]; }
  }
  return {
    coarseP50: q(all, 0.5), coarseP99: q(all, 0.99), coarseMax: cand.length > 0 ? cand[0].turn : 0,
    coarseOverPct: (over / Math.max(1, n)) * 100,
    deepestMax: deepest, level0OfBest: lvl0, ratio: deepest > 0 ? lvl0 / deepest : Infinity,
    ladders, segs: top.map((c) => ({ th: c.th0 * DEG, z: c.z0, dir: c.dir })),
  };
}

log('===== S114-D FLOOR (v2) — LOCUS-SEEKING CREASE BISECTION =====');
log(`tiling grid ${NTH} theta x ${NZ} z   top ${TOPM} segments   ${LEV} bisection levels (segment shrinks ${2 ** LEV}x)   bar ${BAR} deg`);
log('DISCRIMINATOR: a C0 CREASE keeps its turn as the bracket shrinks; SMOOTH curvature halves it each level.');
log(`v1 (s114AnalyticCreaseD.ts) IS VOID: its own positive control flipped with the grid (900 -> NO, 960 -> YES).`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CONTROLS FIRST. No style verdict is printed until both pass.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
let ctlOk = true;
{
  log('── NEG CONTROL: a closed-form SMOOTH surface r = 40 + 3*cos(3*theta)*sin(pi*z/H). No creases exist. ──');
  const smooth: RFn = (th, z) => 40 + 3 * Math.cos(3 * th) * Math.sin((Math.PI * z) / H);
  const s = creaseScan(smooth, 240, 80);
  log(`   coarse MAX ${s.coarseMax.toFixed(4)} deg   ladder level0 ${s.level0OfBest.toFixed(4)} -> level${LEV} ${s.deepestMax.toExponential(3)} deg   shrink ${s.ratio.toExponential(2)}x  (2^${LEV} = ${2 ** LEV})`);
  const pass = s.deepestMax < 1;
  log(`   *** NEG CONTROL ${pass ? 'PASSES' : 'FAILS'} (deepest turn ${s.deepestMax.toExponential(3)} deg, must be < 1) ***`);
  if (!pass) ctlOk = false;
}
{
  log('── POS CONTROL: GothicArches, at BOTH grid phases that broke v1. Must come out CREASED at both. ──');
  const rAb = buildRadiusFn('GothicArches' as StyleId, { ...registryDefaults('GothicArches') }, DIMS);
  const rA: RFn = (th, z) => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  for (const ph of PHASES) {
    const s = creaseScan(rA, ph, 200);
    const pass = s.deepestMax >= BAR;
    log(`   NTH=${ph}: coarse MAX ${s.coarseMax.toFixed(3)}   ladder level0 ${s.level0OfBest.toFixed(3)} -> level${LEV} ${s.deepestMax.toFixed(3)} deg   shrink ${s.ratio.toFixed(3)}x   => ${pass ? 'CREASED' : '*** NOT CREASED — CONTROL FAILS ***'}`);
    if (!pass) ctlOk = false;
  }
  log(`   *** POS CONTROL ${ctlOk ? 'PASSES' : 'FAILS'} — and it is grid-INVARIANT, which is exactly what v1 was not ***`);
}
log('');
if (!ctlOk) { log('*** CONTROLS FIRED. THE RUN IS VOID. No style verdict is admissible. ***'); process.exit(6); }

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const out: Array<Record<string, unknown>> = [];
for (const stem of STEMS) {
  const ci = stem.indexOf(':');
  const style = stem.slice(0, ci); const file = stem.slice(ci + 1);
  const stl = file.includes('/') || file.includes('\\') ? file : `${EXDIR}/${file}.stl`;
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`═════ ${style} ═════`);
  const rAb = buildRadiusFn(style as StyleId, { ...registryDefaults(style) }, DIMS);
  const rA: RFn = (th, z) => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const rec: Record<string, unknown> = { style, stl };

  const s = creaseScan(rA, NTH, NZ);
  rec.coarseP50 = s.coarseP50; rec.coarseP99 = s.coarseP99; rec.coarseMax = s.coarseMax; rec.coarseOverPct = s.coarseOverPct;
  rec.level0 = s.level0OfBest; rec.deepest = s.deepestMax; rec.shrink = s.ratio; rec.levels = LEV;
  rec.creased = s.deepestMax >= BAR;
  log(`  tiling scan: turn p50 ${s.coarseP50.toExponential(3)}  p99 ${s.coarseP99.toFixed(4)}  MAX ${s.coarseMax.toFixed(4)} deg   segments over ${BAR} deg: ${s.coarseOverPct.toFixed(5)}%   ${el()}`);
  const deepAll = s.ladders.map((L) => L[L.length - 1]);
  log(`  BISECTION over the top ${TOPM} segments, ${LEV} levels (bracket shrinks ${2 ** LEV}x):`);
  log(`     best segment: level0 ${s.level0OfBest.toFixed(4)} deg  ->  level${LEV} ${s.deepestMax.toFixed(4)} deg   shrink ${s.ratio.toFixed(2)}x   (a crease shrinks ~1x, smooth curvature ~${2 ** LEV}x)`);
  log(`     deepest turn over all ${TOPM}: p50 ${q(deepAll, 0.5).toExponential(3)}  p90 ${q(deepAll, 0.9).toExponential(3)}  MAX ${s.deepestMax.toFixed(4)} deg`);
  log(`     segments over ${BAR} deg AT THE DEEPEST LEVEL: ${deepAll.filter((v) => v >= BAR).length}/${TOPM}`);
  log(`  *** ANALYTIC C0 CREASES >= ${BAR} deg ON ${style}: ${s.deepestMax >= BAR ? 'YES' : 'NO'} *** (deepest ${s.deepestMax.toFixed(4)} deg)`);

  // ── mesh >45 deg class: how much, and where ──
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
    const zs: number[] = []; let hiA = 0; let hiC = 0; let nearEnd = 0; let nearEndA = 0;
    const EPS = envF('PF_S114CB_ENDBAND', 0.5);
    for (let f = 0; f < nTri; f += 1) {
      if (!(d.perFacetMaxRad[f] > thr)) continue;
      hiC += 1; hiA += d.areaMm2[f];
      zs.push((xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3);
      const zmin = Math.min(xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]);
      const zmax = Math.max(xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]);
      if (zmin <= EPS || zmax >= H - EPS) { nearEnd += 1; nearEndA += d.areaMm2[f]; }
    }
    rec.meshFacets = nTri; rec.meshAreaMm2 = meshArea;
    rec.hiCnt = hiC; rec.hiAreaMm2 = hiA; rec.hiAreaPct = (hiA / meshArea) * 100;
    rec.hiEndBandCnt = nearEnd; rec.hiEndBandAreaPct = hiC > 0 ? (nearEndA / hiA) * 100 : NaN;
    log(`  MESH >${HI_DEG} deg class: COUNT ${hiC} (${((hiC / nTri) * 100).toFixed(4)}%)  AREA ${hiA.toFixed(4)} mm2 (${((hiA / meshArea) * 100).toFixed(4)}% of mesh)`);
    if (hiC > 0) {
      log(`     z  p10 ${q(zs, 0.1).toFixed(2)}  p50 ${q(zs, 0.5).toFixed(2)}  p90 ${q(zs, 0.9).toFixed(2)} mm (H=${H});  within ${EPS} mm of an end: ${((nearEnd / hiC) * 100).toFixed(2)}% by count, ${((nearEndA / hiA) * 100).toFixed(2)}% by area`);
    }
  }
  out.push(rec);
  writeFileSync(`${OUTDIR}/S114_CREASE_BISECT_${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`);
  log('');
}

log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('  FLOOR SUMMARY — does the ANALYTIC surface carry C0 creases? (per-style; never averaged)');
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log(`style | coarse MAX | bisect level0 | bisect level${LEV} | shrink (crease~1x, smooth~${2 ** LEV}x) | ANALYTIC CREASES >=${BAR} | mesh >45 area%`);
for (const r of out) {
  log([
    r.style as string,
    `${(r.coarseMax as number).toFixed(3)}`,
    `${(r.level0 as number).toFixed(3)}`,
    `${(r.deepest as number).toFixed(4)}`,
    `${(r.shrink as number).toFixed(2)}x`,
    (r.creased as boolean) ? 'YES' : 'NO',
    r.hiAreaPct === undefined ? 'n/a' : `${(r.hiAreaPct as number).toFixed(4)}%`,
  ].join(' | '));
}
writeFileSync(`${OUTDIR}/S114_CREASE_BISECT_${TAG}.json`, `${JSON.stringify(out, null, 2)}\n`);
log('');
log(`wrote ${OUTDIR}/S114_CREASE_BISECT_${TAG}.json`);
log(`done ${el()}`);
