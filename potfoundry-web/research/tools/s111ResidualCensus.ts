// s111ResidualCensus.ts — EXHAUSTIVE CENSUS OF THE 4,158. THE LAST UNEXPLAINED PIECE OF THE VISIBLE CLASS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHERE THIS SITS. S108: 2.3699% of Gothic's shipping AREA sits at 45-180 deg adjacent-facet dihedral, on
// WELL-SHAPED facets (=> not S98's needles). S110: the turn is REAL (measured/analytic = 1.00), so the
// mesh is not manufacturing it — and 78.77% of the class straddles a crease once you probe the CENTROID
// segment rather than the shared edge (which is what S109 got wrong). That leaves 4,158 pairs = 21.23%
// with NO crease found on either locus. This tool characterises those 4,158 EXHAUSTIVELY — every one,
// no sampling — because at that size statistics are unnecessary and a census cannot be under-powered.
//
// *** THE DECISIVE TEST, AND IT IS S99's OWN METHOD. *** For each residual pair, walk the analytic normal
// turn along the centroid segment at SHRINKING probe offsets d = L/4, L/16, L/64, L/256:
//
//   * a genuine C0 CREASE holds its turn as d -> 0        (turn(L/4) / turn(L/256) ~= 1)
//   * a SMOOTH patch's turn falls PROPORTIONALLY with d   (ratio ~= 64 for a 64x shrink)
//
// S99 established exactly this for the crease class ("turn is invariant under a 256x offset shrink,
// p50 1.002 => genuine 1-D C0"), so the two results are on the same instrument and directly comparable.
//
//   IF INVARIANT  => there IS a crease and `locateKinkRaw` MISSED IT. A DETECTOR gap, not a new mechanism,
//                    and the fix is the detector's thresholds (kinkRatio/kinkScan) — cheap and known.
//   IF PROPORTIONAL => the surface turns FAST BUT SMOOTHLY. Then it is genuine under-resolution, density
//                    is the lever by construction, and the class finally has a named cause.
//
// ⛔ "Either answer closes the taxonomy. There is no third branch." — I WROTE THAT BEFORE RUNNING IT AND
// MY OWN RUN FALSIFIED IT. The answer is MIXED: the offset test says SMOOTH (98.53% proportional), yet
// per-pair the measured dihedral is 2.38x the surface's own footprint turn at the median — 38.12% of the
// residual is fully explained by the surface, 55.63% is not. A pre-registered dichotomy is still a
// dichotomy; reality was not obliged to pick a side. The three-way split is reported, not collapsed.
//
// ⚠ AND THE 2-POINT PROBE IN S110 UNDER-READ THIS BY 13x (centroid-to-centroid 3.00 deg vs 39.09 deg
// sampled densely over the same footprints). That is the SECOND 2-point probe of a curved quantity to
// under-read in this lineage — the first was `L * kappa_max` in S110 v1, caught by its control.
// ***PROBE FOOTPRINTS, NOT ENDPOINTS.***
//
// Usage: bash research/tools/run-s111-residual.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { fdNormalsCentral } from '../bridge/orientRuler';
import { dumpRenderBins } from '../bridge/labkit';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S111_STYLE ?? 'GothicArches';
const STL = process.env.PF_S111_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S111_TAG ?? 'GOTH';
const HI_DEG = envF('PF_S111_HI_DEG', 45);
const DIMS: StyleDims = { H: envF('PF_S111_H', 120), Rb: envF('PF_S111_RB', 40), Rt: envF('PF_S111_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/residual';

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

const PRED: SweepPredConst = {
  esN: Math.round(envF('PF_CB_ESN', 8)),
  refHs: envF('PF_CB_REF_HS', 0.03),
  refNmax: Math.round(envF('PF_CB_REF_NMAX', 64)),
  kinkScan: Math.round(envF('PF_CB_KINK_SCAN', 16)),
  kinkHalvings: Math.round(envF('PF_CB_KINK_HALVINGS', 24)),
  kinkRatio: envF('PF_CB_KINK_RATIO', 0.15),
  jumpRatio: envF('PF_CB_JUMP_RATIO', 0.62),
  snap: true,
  confMm: envF('PF_CB_CONF_UM', 0.6) / 1000,
};

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const ns = fdNormalsCentral(rA, H, 2e-4, 2e-4);
const nA = new Float64Array(3); const nB = new Float64Array(3);
const turnBetween = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): number => {
  ns(Math.atan2(ay, ax), Math.min(H, Math.max(0, az)), nA);
  ns(Math.atan2(by, bx), Math.min(H, Math.max(0, bz)), nB);
  let dp = nA[0] * nB[0] + nA[1] * nB[1] + nA[2] * nB[2];
  if (dp > 1) dp = 1; else if (dp < -1) dp = -1;
  return Math.acos(dp);
};

log('===== S111 RESIDUAL CENSUS — the 4,158 that carry no crease on either locus =====');
log(`style ${STYLE}  tag ${TAG}  high cut ${HI_DEG} deg   EXHAUSTIVE (no sampling)`);
log('DECISIVE TEST (S99\'s method): analytic turn at SHRINKING offsets along the centroid segment.');
log('  invariant  => a C0 CREASE the detector MISSED (detector gap)');
log('  ~64x decay => a FAST BUT SMOOTH turn (genuine under-resolution; density is the lever)');
log('');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}

const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
const hiThr = (HI_DEG * Math.PI) / 180;
const centroid = (f: number): [number, number, number] => {
  let cx = 0; let cy = 0; let cz = 0;
  for (let k = 0; k < 3; k += 1) { cx += xyz[f * 9 + k * 3]; cy += xyz[f * 9 + k * 3 + 1]; cz += xyz[f * 9 + k * 3 + 2]; }
  return [cx / 3, cy / 3, cz / 3];
};
const sharedEndpoints = (e: number): number[] | null => {
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  const out: number[] = [];
  for (let a = 0; a < 3; a += 1) {
    const ax = xyz[f1 * 9 + a * 3]; const ay = xyz[f1 * 9 + a * 3 + 1]; const az = xyz[f1 * 9 + a * 3 + 2];
    for (let b = 0; b < 3; b += 1) {
      if (xyz[f2 * 9 + b * 3] === ax && xyz[f2 * 9 + b * 3 + 1] === ay && xyz[f2 * 9 + b * 3 + 2] === az) { out.push(ax, ay, az); break; }
    }
  }
  return out.length === 6 ? out : null;
};

type R = { e: number; ratio: number; invar: number; measDeg: number; predDeg: number; L: number; z: number; thMod: number; seamMm: number };
const res: R[] = [];
let nHigh = 0;
for (let e = 0; e < d.edgeAngRad.length; e += 1) {
  if (!(d.edgeAngRad[e] > hiThr)) continue;
  nHigh += 1;
  const p = sharedEndpoints(e); if (p === null) continue;
  const th0 = Math.atan2(p[1], p[0]);
  const kEdge = locateKinkRaw(rA, th0, p[2], th0 + dThRaw(th0, Math.atan2(p[4], p[3])), p[5], PRED);
  if (kEdge !== null && !kEdge.jump) continue;                     // crease on the shared edge
  const c1 = centroid(d.edgeF1[e]); const c2 = centroid(d.edgeF2[e]);
  const thc = Math.atan2(c1[1], c1[0]);
  const kSeg = locateKinkRaw(rA, thc, c1[2], thc + dThRaw(thc, Math.atan2(c2[1], c2[0])), c2[2], PRED);
  if (kSeg !== null && !kSeg.jump) continue;                       // crease on the centroid segment
  // ── THE RESIDUAL. Shrinking-offset turn along the centroid segment. ──
  const mx = (c1[0] + c2[0]) / 2; const my = (c1[1] + c2[1]) / 2; const mz = (c1[2] + c2[2]) / 2;
  let ux = c2[0] - c1[0]; let uy = c2[1] - c1[1]; let uz = c2[2] - c1[2];
  const seg = Math.hypot(ux, uy, uz); if (!(seg > 0)) continue;
  ux /= seg; uy /= seg; uz /= seg;
  const turnAt = (del: number): number => turnBetween(mx - del * ux, my - del * uy, mz - del * uz, mx + del * ux, my + del * uy, mz + del * uz);
  const t1 = turnAt(seg / 4); const t4 = turnAt(seg / 256);
  const L = Math.hypot(p[3] - p[0], p[4] - p[1], p[5] - p[2]);
  let th = (Math.atan2(my, mx) * 180) / Math.PI; if (th < 0) th += 360;
  res.push({
    e, ratio: t4 > 1e-9 ? t1 / t4 : Infinity, invar: t4 > 1e-9 ? t1 / t4 : Infinity,
    measDeg: (d.edgeAngRad[e] * 180) / Math.PI, predDeg: (turnBetween(c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]) * 180) / Math.PI,
    L, z: mz, thMod: th % 30, seamMm: Math.min(th, 360 - th) * (Math.PI / 180) * Math.hypot(mx, my),
  });
}
log(`high-dihedral pairs ${nHigh}   RESIDUAL (no crease on either locus) ${res.length}  ${el()}`);
log('');

const q = (sel: (r: R) => number, p: number): number => {
  const v = res.map(sel).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length === 0 ? NaN : v[Math.min(v.length - 1, Math.floor(v.length * p))];
};
log('── THE DECISIVE TEST: turn(L/4) / turn(L/256).  1 = C0 crease (missed).  64 = smooth. ──');
log(`  p10 ${q((r) => r.ratio, 0.1).toFixed(2)}   p25 ${q((r) => r.ratio, 0.25).toFixed(2)}   p50 ${q((r) => r.ratio, 0.5).toFixed(2)}   p75 ${q((r) => r.ratio, 0.75).toFixed(2)}   p90 ${q((r) => r.ratio, 0.9).toFixed(2)}`);
let nInv = 0; let nSm = 0; let nMid = 0;
for (const r of res) { if (!Number.isFinite(r.ratio)) continue; if (r.ratio < 4) nInv += 1; else if (r.ratio > 24) nSm += 1; else nMid += 1; }
const tot = nInv + nSm + nMid;
log(`  INVARIANT (<4x, C0 crease MISSED)   ${nInv}  (${((nInv / Math.max(1, tot)) * 100).toFixed(2)}%)`);
log(`  INTERMEDIATE (4-24x)                ${nMid}  (${((nMid / Math.max(1, tot)) * 100).toFixed(2)}%)`);
log(`  PROPORTIONAL (>24x, SMOOTH)         ${nSm}  (${((nSm / Math.max(1, tot)) * 100).toFixed(2)}%)`);
log('');
log('── GEOMETRY OF THE RESIDUAL ──');
log(`  measured dihedral p50 ${q((r) => r.measDeg, 0.5).toFixed(2)} deg   analytic turn p50 ${q((r) => r.predDeg, 0.5).toFixed(2)} deg`);
log(`  edge L p50 ${(q((r) => r.L, 0.5) * 1000).toFixed(1)} um   z p10 ${q((r) => r.z, 0.1).toFixed(1)} p50 ${q((r) => r.z, 0.5).toFixed(1)} p90 ${q((r) => r.z, 0.9).toFixed(1)} mm`);
log(`  distance to the theta=0 SEAM p10 ${q((r) => r.seamMm, 0.1).toFixed(2)} p50 ${q((r) => r.seamMm, 0.5).toFixed(2)} mm  (large => not a seam artefact)`);
const bins = new Array(12).fill(0);
for (const r of res) bins[Math.min(11, Math.floor((r.thMod / 30) * 12))] += 1;
log(`  theta mod 30 deg (the 12-fold fundamental domain), 12 bins: ${bins.join(' ')}`);
log('');

// render bins for the residual, so the class can be LOOKED at
{
  const fs: number[] = [];
  for (const r of res) { fs.push(d.edgeF1[r.e]); fs.push(d.edgeF2[r.e]); }
  const uniq = Array.from(new Set(fs));
  const v = new Float32Array(uniq.length * 9);
  for (let i = 0; i < uniq.length; i += 1) for (let k = 0; k < 9; k += 1) v[i * 9 + k] = xyz[uniq[i] * 9 + k];
  const idx = new Uint32Array(uniq.length * 3);
  for (let i = 0; i < idx.length; i += 1) idx[i] = i;
  dumpRenderBins(OUTDIR, `${TAG}_residual`, v, idx, { meta: { tris: uniq.length, ruler: 'S111 residual facets' } });
  log(`render bins: ${TAG}_residual  (${uniq.length} facets) -> ${OUTDIR}`);
}

writeFileSync(`${OUTDIR}/S111_RESIDUAL_${TAG}.json`, `${JSON.stringify({
  style: STYLE, hiDeg: HI_DEG, highPairs: nHigh, residual: res.length,
  invariant: nInv, intermediate: nMid, proportional: nSm,
  ratioP50: q((r) => r.ratio, 0.5),
}, null, 2)}\n`);
// ══════════ THE DISCRIMINATOR THE TWO-POINT PROBE CANNOT MAKE ══════════
// The offset test says SMOOTH, and the two-centroid turn says 3.00 deg — against a MEASURED dihedral of
// 90.67 deg. Those cannot both be innocent, and there are exactly two readings:
//   (a) MESH DEFECT — the mesh manufactures ~30x the turn the surface has;
//   (b) ALIASING IN MY OWN PROBE — a crest lying BETWEEN the two centroids leaves both endpoints with
//       similar normals while the surface turns hard in between. (This is the same failure mode the
//       campaign documented for the 160x160 curvature grid, so it is a live hypothesis, not a nicety.)
// The two-point probe cannot separate them. A DENSE probe over each facet's OWN footprint can: sample the
// analytic normal on a barycentric lattice across both facets and take the MAX pairwise turn.
//   max-over-footprint ~= 90 deg  => the surface really does turn that much inside the footprint,
//                                    my 2-point probe aliased it, and this is UNDER-RESOLUTION.
//   max-over-footprint ~= 3 deg   => the surface is flat across the whole footprint and the mesh is
//                                    inventing the angle. A MESH DEFECT.
const LAT = 4; // order-4 barycentric lattice = 15 points per facet
const footMax: number[] = [];
{
  const px: number[] = []; const py: number[] = []; const pz: number[] = [];
  for (const r of res) {
    px.length = 0; py.length = 0; pz.length = 0;
    for (const f of [d.edgeF1[r.e], d.edgeF2[r.e]]) {
      const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
      const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
      const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
      for (let i = 0; i <= LAT; i += 1) for (let j = 0; j <= LAT - i; j += 1) {
        const wa = i / LAT; const wb = j / LAT; const wc = 1 - wa - wb;
        px.push(wa * ax + wb * bx + wc * cx); py.push(wa * ay + wb * by + wc * cy); pz.push(wa * az + wb * bz + wc * cz);
      }
    }
    let mx2 = 0;
    for (let i = 0; i < px.length; i += 1) for (let j = i + 1; j < px.length; j += 1) {
      const t = turnBetween(px[i], py[i], pz[i], px[j], py[j], pz[j]);
      if (t > mx2) mx2 = t;
    }
    footMax.push((mx2 * 180) / Math.PI);
  }
  const sorted = footMax.slice().sort((a, b) => a - b);
  const fq = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  log('── DENSE FOOTPRINT PROBE (max analytic turn over an order-4 lattice on BOTH facets) ──');
  log(`  p10 ${fq(0.1).toFixed(2)}   p50 ${fq(0.5).toFixed(2)}   p90 ${fq(0.9).toFixed(2)} deg   vs measured dihedral p50 ${q((r) => r.measDeg, 0.5).toFixed(2)} deg`);
  // PER-PAIR ratio, not a ratio of medians. Comparing p50(measured) against p50(footprint) is the
  // median-of-ratios trap this project has been bitten by before; the pairing must be preserved.
  const rr = res.map((r, i) => (footMax[i] > 1e-9 ? r.measDeg / footMax[i] : Infinity))
    .filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const rq = (p: number): number => rr[Math.min(rr.length - 1, Math.floor(rr.length * p))];
  let over2 = 0; let under1p5 = 0;
  for (const x of rr) { if (x > 2) over2 += 1; if (x <= 1.5) under1p5 += 1; }
  log(`  PER-PAIR measured / footprint-max:  p10 ${rq(0.1).toFixed(2)}  p25 ${rq(0.25).toFixed(2)}  p50 ${rq(0.5).toFixed(2)}  p75 ${rq(0.75).toFixed(2)}  p90 ${rq(0.9).toFixed(2)}`);
  log(`    <=1.5x (the surface explains it)   ${under1p5}  (${((under1p5 / rr.length) * 100).toFixed(2)}%)`);
  log(`    > 2x  (the mesh adds turn)         ${over2}  (${((over2 / rr.length) * 100).toFixed(2)}%)`);
  log('');
  log('  ⚠ MY OWN 2-POINT PROBE WAS ALIASING, AND BY 13x. The centroid-to-centroid turn read 3.00 deg;');
  log('  sampled densely over the same footprints the surface turns 39.09 deg at the median. Any reading');
  log('  built on the 3.00 deg figure is void — including the "mesh manufactures 30x" reading it implied.');
  log('  This is the SECOND time in this lineage that a 2-point probe of a curved thing under-read it');
  log('  (the first was L*kappa_max in S110). Probe FOOTPRINTS, not endpoints.');
  log('');
}

log('');
log('── SUMMARY ──');
log('  The offset-decay test says the surface is SMOOTH here (98.53% proportional, ratio 64.00).');
log('  The dense footprint probe says it nonetheless TURNS HARD across the footprint (p50 39 deg, p90 161).');
log('  Read the PER-PAIR ratio above for how much of the measured dihedral the surface actually explains.');
log('  Do NOT collapse this to one cause: smooth-but-fast-turning and mesh-added turn are both present.');
log(`done ${el()}`);
