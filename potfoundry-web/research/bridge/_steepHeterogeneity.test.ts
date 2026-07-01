// _steepHeterogeneity.test.ts — DEV-ONLY convene flip-probe (env PF_STEEP=1). Deciding measurement for the
// pre-registered contract: is the ACCEPT-broad-steep class HETEROGENEOUS?  For 4 steep styles (+1 smooth control)
// classify each red-facet chord as TRUE-CUSP-GAP / DEPTH-CAPPED-CLOSABLE / TRUE-RULER-ARTIFACT / UNMEASURABLE.
// The density-response SIGN of red-facet perp-3D p99 under maxSag-HALVING is the key discriminator.
//
// CPU-only, bounded (~0.3–0.8M pts/style). Instruments imported from labkit — NOT re-coded:
//   perFaceChordSag  = RADIAL same-(u,t) chord (legacy heatmap; OVERSTATES near-vertical relief)
//   perFaceTrue3DSag = TRUE-3D perpendicular facet→surface (projectPointToRadialSurface — the honest ruler)
// Both per-facet, SAME mesh, SAME sample points.  All instruments project against the CONTINUOUS f64 rA closure
// (no band-limited grid) → reference is self-consistent (no __pfReferenceDenseRes lever exists for the analytic
// projector). The equivalent trust check is the BRUTE-FORCE dense-nearest TWIN on the worst red facets: a denser
// reference cannot make perp SMALLER than the true analytic foot, and GN's known failure is to OVERSTATE (local
// minima) ⇒ GN ≥ brute is trusted; GN << brute ⇒ wrong-sheet (untrusted).
//
// Density lever note (Metrologist / Skeptic): this LAB kernel (buildInhouseMetricMesh) is metric-driven — its
// density lever is tolMm (chord target) + chordTolMm (per-facet Steiner split), NOT the production quadtree
// maxLevel. maxSag-HALVING here = tolMm 0.01→0.005 + chordTolMm 0.05→0.02 + budget↑. This is the honest
// density-response point available in this instrument; the Skeptic's "deep maxLevel" Gyroid bet was framed on
// the production conforming quadtree, so a FLAT response here is necessary-but-not-sufficient to REFUTE closability
// (flagged in the return).
//
// Controls (all checkpointed to ndjson the INSTANT computed):
//   (1) NON-VACUOUS smooth control (HarmonicRipple): perp p99 must be LOW-BUT-NONZERO (~0.02–0.08) — proves the
//       instrument is not "always low".
//   (2) TWIN: GN perFaceTrue3DSag vs brute-force dense-nearest on the worst ~40 red facets/style; GN ≥ brute in tol.
//   (3) SHEET-CONSISTENCY (CelticTriquetra braid): reject feet with n·(centroid−foot) sign flip (wrong strand),
//       report the flip count; nonzero flips VOID that style's p99 until sheet-locked.
//   (4) DENSITY-INVARIANCE: rebuild at HALVED maxSag, re-measure red-facet perp p99 — FALLS (closable) or FLAT (cusp)?
//
// Run: PF_STEEP=1 npx vitest run research/bridge/_steepHeterogeneity.test.ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { perFaceChordSag, perFaceTrue3DSag } from './labkit';
import { projectPointToRadialSurface, type AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const OUT = join('research', 'exchange', '_steep');
const TAU = 2 * Math.PI;
const RED = 0.1; // "red" facet = RADIAL per-face worst-sag > 0.1mm (the convene definition)

const LEDGER = join(OUT, 'ledger.ndjson');
function ckpt(unit: string, data: Record<string, unknown>): void {
  const row = JSON.stringify({ unit, ts: new Date().toISOString(), ...data });
  appendFileSync(LEDGER, row + '\n');
  // eslint-disable-next-line no-console
  console.log(`[ckpt ${unit}] ${row}`);
}

function pctile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = Float64Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

/** BRUTE-FORCE nearest-surface distance from P to S(θ,z): dense (θ,z) grid + local refine. The densest-cheap
 *  reference — a denser sample cannot make perp smaller than the true foot. `nth`/`nz` are the coarse grid res;
 *  a HI variant (finer grid) is used to break GN-vs-brute ties on sharp ribs where a coarse grid aliases and can
 *  MISS the true (closer) foot — in which case GN can legitimately read smaller. */
function bruteNearest(px: number, py: number, pz: number, rA: AnalyticRadiusFn, H: number, nth = 2048, nz = 400): { dist: number; th: number; z: number } {
  const d2 = (th: number, z: number): number => {
    const r = rA(th, z); const ex = px - r * Math.cos(th), ey = py - r * Math.sin(th), ez = pz - z; return ex * ex + ey * ey + ez * ez;
  };
  let best = Infinity, bth = 0, bz = pz;
  const zLo = Math.max(0, pz - 14), zHi = Math.min(H, pz + 14);
  for (let i = 0; i < nth; i++) {
    const th = (i / nth) * TAU;
    for (let j = 0; j <= nz; j++) {
      const z = zLo + (zHi - zLo) * (j / nz);
      const f = d2(th, z);
      if (f < best) { best = f; bth = th; bz = z; }
    }
  }
  let hTh = TAU / nth, hZ = (zHi - zLo) / nz;
  for (let it = 0; it < 60; it++) {
    let improved = false;
    for (const dth of [-hTh, 0, hTh]) for (const dz of [-hZ, 0, hZ]) {
      const f = d2(bth + dth, bz + dz);
      if (f < best) { best = f; bth += dth; bz += dz; improved = true; }
    }
    if (!improved) { hTh *= 0.5; hZ *= 0.5; }
    if (hTh < 1e-10 && hZ < 1e-10) break;
  }
  return { dist: Math.sqrt(best), th: bth, z: bz };
}

/** Analytic surface normal (unit) at (θ,z) via FD of r — for the sheet-consistency sign check. */
function surfNormal(th: number, z: number, rA: AnalyticRadiusFn): [number, number, number] {
  const hT = 1e-5, hZ = 1e-4;
  const r = rA(th, z);
  const rT = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
  const rZ = (rA(th, z + hZ) - rA(th, z - hZ)) / (2 * hZ);
  const cs = Math.cos(th), sn = Math.sin(th);
  const Sx = rT * cs - r * sn, Sy = rT * sn + r * cs, Sz = 0;
  const Zx = rZ * cs, Zy = rZ * sn, Zz = 1;
  const nx = Sy * Zz - Sz * Zy, ny = Sz * Zx - Sx * Zz, nz = Sx * Zy - Sy * Zx;
  const L = Math.hypot(nx, ny, nz) || 1;
  return [nx / L, ny / L, nz / L];
}

interface Built {
  ut: number[]; indices: number[]; rA: AnalyticRadiusFn;
  radial: ReturnType<typeof perFaceChordSag>; perp: ReturnType<typeof perFaceTrue3DSag>; xyz: Float64Array;
}

function buildAndMeasure(style: StyleId, tolMm: number, chordTolMm: number, hMin: number, maxPoints: number): Built {
  const rA = buildRadiusFn(style, {}, DIMS);
  const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
    tolMm, hMin, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints, splitThresh: 1.5, optimizeSweeps: 2, chordTolMm,
  });
  const idxArr = Array.from(mesh.indices);
  const radial = perFaceChordSag(mesh.ut, idxArr, rA, DIMS.H);
  const perp = perFaceTrue3DSag(mesh.ut, idxArr, rA, DIMS.H, { preFilterMm: 0.02 });
  const nV = mesh.ut.length / 2;
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const th = TAU * mesh.ut[2 * i], z = mesh.ut[2 * i + 1] * DIMS.H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  return { ut: mesh.ut, indices: idxArr, rA, radial, perp, xyz };
}

/** On the RED subset (radial faceErr > RED), report radial p99 + perp p99 + ratio + counts. */
function redSubset(b: Built): { nRed: number; nTotal: number; radP99: number; radMax: number; perpP99: number; perpMax: number; ratioP99: number } {
  const rad: number[] = [], per: number[] = [];
  const nF = b.radial.faceErr.length;
  for (let f = 0; f < nF; f++) { if (b.radial.faceErr[f] > RED) { rad.push(b.radial.faceErr[f]); per.push(b.perp.faceErr[f]); } }
  const radP99 = pctile(rad, 0.99), perpP99 = pctile(per, 0.99);
  return {
    nRed: rad.length, nTotal: nF, radP99, radMax: rad.length ? Math.max(...rad) : 0,
    perpP99, perpMax: per.length ? Math.max(...per) : 0, ratioP99: perpP99 > 1e-9 ? radP99 / perpP99 : Infinity,
  };
}

/** TWIN + SHEET on the worst ~40 red facets. The TRUSTED per-facet perp = min over {GN, coarse-brute, and (only
 *  where they disagree >0.02) a FINE-brute tie-break} — because GN can OVERSTATE (local minima) and a coarse brute
 *  can UNDERSTATE the reach OR alias-MISS the true foot on a sharp rib. Reports the trusted p99 + how the two
 *  primitives disagreed, and (for braids) the sheet-flip count. */
function twinSheet(b: Built, sheetCheck: boolean): Record<string, number> {
  const nF = b.radial.faceErr.length;
  const redIdx: number[] = [];
  for (let f = 0; f < nF; f++) if (b.radial.faceErr[f] > RED) redIdx.push(f);
  redIdx.sort((x, y) => b.radial.faceErr[y] - b.radial.faceErr[x]);
  const sample = redIdx.slice(0, Math.min(40, redIdx.length));
  let gnOver = 0;       // GN > brute by >0.02 (GN overstates local-min; brute is the floor)
  let bruteOver = 0;    // brute > GN by >0.02 (coarse brute aliased/short; needs fine tie-break)
  let fineConfirmGnSmaller = 0; // after fine brute, GN still smaller ⇒ GN found the real foot
  let sheetFlip = 0;
  let maxGnMinusBrute = -Infinity, maxBruteMinusGn = -Infinity, maxTrustedResidVsFine = 0;
  const gnDists: number[] = [], coarseBrute: number[] = [], trusted: number[] = [];
  let sheetPos = 0, sheetNeg = 0;
  for (const f of sample) {
    const a = b.indices[3 * f], bb = b.indices[3 * f + 1], c = b.indices[3 * f + 2];
    const cx = (b.xyz[3 * a] + b.xyz[3 * bb] + b.xyz[3 * c]) / 3;
    const cy = (b.xyz[3 * a + 1] + b.xyz[3 * bb + 1] + b.xyz[3 * c + 1]) / 3;
    const cz = (b.xyz[3 * a + 2] + b.xyz[3 * bb + 2] + b.xyz[3 * c + 2]) / 3;
    const gn = projectPointToRadialSurface(cx, cy, cz, b.rA);
    const bf = bruteNearest(cx, cy, cz, b.rA, DIMS.H);
    const gnMinusBrute = gn.dist - bf.dist;
    maxGnMinusBrute = Math.max(maxGnMinusBrute, gnMinusBrute);
    maxBruteMinusGn = Math.max(maxBruteMinusGn, -gnMinusBrute);
    // trusted foot = min(GN, coarse-brute); if they disagree >0.02, run a FINE brute and take the overall min.
    let tf = Math.min(gn.dist, bf.dist);
    if (gnMinusBrute > 0.02) gnOver++;             // GN overstated → brute floor already captured in tf
    if (-gnMinusBrute > 0.02) {                    // coarse brute > GN → suspect aliasing; fine tie-break
      bruteOver++;
      const bfHi = bruteNearest(cx, cy, cz, b.rA, DIMS.H, 8192, 1600);
      tf = Math.min(tf, bfHi.dist);
      if (gn.dist <= bfHi.dist + 1e-6) fineConfirmGnSmaller++; // GN's foot survives a fine brute ⇒ GN was right
      maxTrustedResidVsFine = Math.max(maxTrustedResidVsFine, Math.abs(tf - bfHi.dist));
    }
    gnDists.push(gn.dist); coarseBrute.push(bf.dist); trusted.push(tf);
    if (sheetCheck) {
      const [nx, ny, nz] = surfNormal(gn.theta, gn.z, b.rA);
      const fx = b.rA(gn.theta, gn.z) * Math.cos(gn.theta), fy = b.rA(gn.theta, gn.z) * Math.sin(gn.theta), fz = gn.z;
      const dot = nx * (cx - fx) + ny * (cy - fy) + nz * (cz - fz);
      if (dot > 0) sheetPos++; else sheetNeg++;
    }
  }
  // sheet-flip = minority-sign count (wrong-strand feet) for braids
  sheetFlip = sheetCheck ? Math.min(sheetPos, sheetNeg) : 0;
  return {
    nSample: sample.length, gnOver, bruteOver, fineConfirmGnSmaller, maxGnMinusBrute, maxBruteMinusGn,
    maxTrustedResidVsFine,
    gnP99: pctile(gnDists, 0.99), coarseBruteP99: pctile(coarseBrute, 0.99),
    // TRUSTED perp p99 on the worst-40 red facets — the number the CLASS verdict uses.
    trustedP99: pctile(trusted, 0.99), trustedMax: trusted.length ? Math.max(...trusted) : 0,
    sheetPos, sheetNeg, sheetFlip,
  };
}

// One style = one checkpointed unit. Each writes DEFAULT row → TWIN row → HALVED row → CLASS row, so a killed run
// leaves completed styles on disk and resumes at the first unwritten style.
interface Plan { style: StyleId; sheet: boolean; predicted: string; }
const PLAN: Plan[] = [
  { style: 'GothicArches' as StyleId, sheet: false, predicted: 'GAP p99≈0.26 ratio≈3.4 perp FALLS' },
  { style: 'GyroidManifold' as StyleId, sheet: false, predicted: 'Theorist GAP 0.08-0.15 vs Skeptic depth-capped-closable ≤0.05' },
  { style: 'CelticTriquetra' as StyleId, sheet: true, predicted: 'GAP 0.06-0.12 ratio 1.5-3; braid sheet-guard armed' },
  { style: 'Voronoi' as StyleId, sheet: false, predicted: 'Theorist TRUE-ACCEPT <0.02 vs Metrologist UNMEASURABLE ~0.14 hash floor' },
];

function classify(def: ReturnType<typeof redSubset>, half: ReturnType<typeof redSubset>, twin: Record<string, number>): string {
  // Braid sheet-flip VOIDS the reading (wrong-strand feet) — report UNMEASURABLE until sheet-locked.
  if (twin.sheetFlip > 0) return `UNMEASURABLE(sheet-flip=${twin.sheetFlip})`;
  // The TRUSTED perp = the twin's brute-anchored worst-40 p99 (min over GN / coarse-brute / fine-brute tie-break).
  // GN alone can overstate (local minima) OR understate (found a foot a coarse brute aliased past); the twin
  // reconciles both. The GN full-red p99 (def.perpP99) is an UPPER bound; trustedP99 is the honest authority.
  const perp = twin.trustedP99;
  const fell = half.perpP99 < def.perpP99 - 0.01; // full-red GN density-response SIGN (GN is monotone across density)
  const flat = Math.abs(half.perpP99 - def.perpP99) <= 0.01;
  // TRUE-RULER-ARTIFACT: trusted perp already CAD-grade (<0.05) AND radial overstates (ratio ≥ 3).
  if (perp < 0.05 && def.ratioP99 >= 3) return 'TRUE-RULER-ARTIFACT';
  // DEPTH-CAPPED-CLOSABLE: trusted perp measurable (≥0.05) and full-red perp FALLS under halving.
  if (perp >= 0.05 && fell) return 'DEPTH-CAPPED-CLOSABLE';
  // TRUE-CUSP-GAP: trusted perp measurable (≥0.05) and FLAT under halving → irreducible cusp/discontinuity.
  if (perp >= 0.05 && flat) return 'TRUE-CUSP-GAP';
  if (perp < 0.05) return 'TRUE-RULER-ARTIFACT(low-ratio)';
  return `AMBIGUOUS(perp=${perp.toFixed(3)} fell=${fell} flat=${flat})`;
}

describe('steep-class heterogeneity flip-probe', () => {
  it.skipIf(process.env.PF_STEEP !== '1')('4 steep + 1 smooth control', () => {
    mkdirSync(OUT, { recursive: true });
    // fresh ledger only if the RESET env is set — otherwise APPEND so a resumed run keeps prior styles.
    if (process.env.PF_STEEP_RESET === '1') writeFileSync(LEDGER, '');

    // ── NON-VACUOUS smooth control (HarmonicRipple) FIRST — proves the instrument is not "always low" ──
    if (process.env.PF_STEEP_ONLY === undefined || process.env.PF_STEEP_ONLY === 'HarmonicRipple') {
      const h = buildAndMeasure('HarmonicRipple' as StyleId, 0.01, 0.05, 0.05, 500_000);
      const hRed = redSubset(h);
      const allRad = Array.from(h.radial.faceErr), allPerp = Array.from(h.perp.faceErr);
      ckpt('control_harmonic', {
        tris: h.indices.length / 3, nRed: hRed.nRed,
        redRadP99: hRed.radP99, redPerpP99: hRed.perpP99, redRatioP99: hRed.ratioP99,
        allRadP99: pctile(allRad, 0.99), allPerpP99: pctile(allPerp, 0.99),
        worstPerpFull: h.perp.worstMm,
      });
    }

    // ── 4 steep styles, each a self-contained checkpointed unit ──
    for (const p of PLAN) {
      if (process.env.PF_STEEP_ONLY !== undefined && process.env.PF_STEEP_ONLY !== String(p.style)) continue;

      // DEFAULT density
      const def = buildAndMeasure(p.style, 0.01, 0.05, 0.05, 500_000);
      const defRed = redSubset(def);
      ckpt(`${p.style}_default`, { predicted: p.predicted, tris: def.indices.length / 3, ...defRed, worstRadialFull: def.radial.worstMm, worstPerpFull: def.perp.worstMm });

      // TWIN + SHEET on worst-40 red facets
      const twin = twinSheet(def, p.sheet);
      ckpt(`${p.style}_twin`, twin);

      // HALVED maxSag (density-response point): tolMm 0.01→0.005, chordTolMm 0.05→0.02, budget↑
      const half = buildAndMeasure(p.style, 0.005, 0.02, 0.03, 800_000);
      const halfRed = redSubset(half);
      ckpt(`${p.style}_halved`, {
        tris: half.indices.length / 3, ...halfRed,
        perpP99_default: defRed.perpP99, perpP99_halved: halfRed.perpP99,
        perpFell: halfRed.perpP99 < defRed.perpP99 - 0.01, perpFlat: Math.abs(halfRed.perpP99 - defRed.perpP99) <= 0.01,
      });

      // CLASS verdict
      const cls = classify(defRed, halfRed, twin);
      ckpt(`${p.style}_class`, {
        class: cls,
        // trusted (brute-anchored) perp is the AUTHORITY; GN full-red p99 is an upper bound for the density SIGN.
        trustedPerpP99: twin.trustedP99, gnDefPerpP99: defRed.perpP99, defRadP99: defRed.radP99, defRatio: defRed.ratioP99,
        gnHalfPerpP99: halfRed.perpP99, perpFellGN: halfRed.perpP99 < defRed.perpP99 - 0.01,
        sheetFlip: twin.sheetFlip, gnOver: twin.gnOver, bruteOver: twin.bruteOver, fineConfirmGnSmaller: twin.fineConfirmGnSmaller,
        maxTrustedResidVsFine: twin.maxTrustedResidVsFine,
      });
    }

    expect(true).toBe(true);
  }, 60 * 60 * 1000);
});
