// _verify_smooth.test.ts — DEV-ONLY (env PF_VSMOOTH=1). ADVERSARIAL VERIFIER for the SMOOTH axis.
// Default verdict = REFUTED. The close-partner (_close_smooth.test.ts) claims all 5 single-valued wavy-field styles
// (HarmonicRipple/RippleInterference/WaveInterference/SuperellipseMorph/FourierBloom) reach honest true-3D perp
// <= 0.01mm at their RECIPE. Do NOT trust their numbers — INDEPENDENTLY re-mesh with their stated recipe and
// re-measure with the honest labkit rulers, then attack:
//   (A) RULER ARTIFACT — is the <=0.01 real true-3D or a lenient radial/own-region path? Cross-check radial vs a
//       genuinely-independent brute-anchored true-3D on the WORST-40 facets by TRUE-3D error (NOT the radial>0.1
//       gate their probe used — that gate never fired, so their true-3D was pure single-seed GN, un-anchored).
//   (B) DENSITY-FRAGILE — HALVE the point budget + coarsen hMin and re-measure. Over-fit to one density blows up.
//   (C) WATERTIGHT — RAW-INDEX non-manifold (literal index, no weld) MUST be 0. Non-vacuous control: an injected
//       fold must move the count.
//   (D) %<20 MASK — triangleQualityDistribution on the PRIMITIVE mesh (whole mesh, honest min-angle).
//
// One env-gated `it` PER STYLE + CHECKPOINT (ndjson row) the INSTANT scored -> resume by re-running unscored styles.
// ISOLATED: reuses labkit rulers READ-ONLY; edits NOTHING in src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, liftUtToRadial,
  perFaceChordSag, perFaceTrue3DSag, bruteNearestOnRadialSurface,
  triangleQualityDistribution,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_VSMOOTH === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DIR = join('research', 'exchange', '_verify_smooth');
const LEDGER = join(DIR, 'scorecard.ndjson');
const CAD_TOL = 0.01;

// EXACT close-partner recipe (research/bridge/_close_smooth.test.ts RECIPE).
const RECIPE = {
  tolMm: 0.004, hMin: 0.006, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
  maxPoints: 800_000, splitThresh: 1.5, optimizeSweeps: 2,
  guardManifoldAlways: true, chordTolMm: 0.03, chordSteiner: true,
} as const;
// HALF-density variant (attack B): halve the budget + coarsen the min-edge clamp.
const RECIPE_HALF = { ...RECIPE, maxPoints: 400_000, hMin: 0.012 } as const;

const STYLES: StyleId[] = [
  'HarmonicRipple', 'RippleInterference', 'WaveInterference', 'SuperellipseMorph', 'FourierBloom',
] as unknown as StyleId[];

function p99(arr: ArrayLike<number>): number {
  const s = Float64Array.from(arr as ArrayLike<number>).sort();
  return s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0;
}
/** RAW-INDEX non-manifold: undirected edges by LITERAL index (no weld) shared by >2 tris. */
function auditNonManRaw(indices: ArrayLike<number>): number {
  const ec = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      ec.set(key, (ec.get(key) ?? 0) + 1);
    }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}
function scoredSet(): Set<string> {
  if (!existsSync(LEDGER)) return new Set();
  const s = new Set<string>();
  for (const ln of readFileSync(LEDGER, 'utf8').split('\n')) {
    if (!ln.trim()) continue;
    try { s.add(JSON.parse(ln).style); } catch { /* skip */ }
  }
  return s;
}

/** INDEPENDENT true-3D on the worst-K facets by TRUE-3D error: brute-force full-azimuth nearest at each centroid,
 *  keep min(GN, brute). Fires regardless of the radial>0.1 gate — this is the honest cross-check the close probe
 *  SKIPPED (their anchor was vacuous). Returns the trusted worst + p99 over the sampled facets. */
function bruteAnchorWorstTrue3d(
  ut: number[], idx: ArrayLike<number>, rA: (th: number, z: number) => number,
  faceErr: Float64Array, sampleN: number,
): { gnP99: number; trustedP99: number; trustedMax: number; gnMax: number; nSample: number } {
  const nF = idx.length / 3;
  const order = Array.from({ length: nF }, (_, f) => f).sort((a, b) => faceErr[b] - faceErr[a]);
  const sample = order.slice(0, Math.min(sampleN, nF));
  const lift = (i: number): [number, number, number] => { const th = 2 * Math.PI * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const gnArr: number[] = [], trArr: number[] = [];
  for (const f of sample) {
    const [ax, ay, az] = lift(idx[3 * f]), [bx, by, bz] = lift(idx[3 * f + 1]), [cx2, cy2, cz2] = lift(idx[3 * f + 2]);
    const cx = (ax + bx + cx2) / 3, cy = (ay + by + cy2) / 3, cz = (az + bz + cz2) / 3;
    const gn = faceErr[f]; // the ruler's own per-face true-3D (max over SAG_BARY) — the number under attack
    const bf = bruteNearestOnRadialSurface(cx, cy, cz, rA, H, { nTheta: 4096, nZ: 800 }).dist;
    gnArr.push(gn); trArr.push(Math.min(gn, bf));
  }
  return { gnP99: p99(gnArr), trustedP99: p99(trArr), trustedMax: trArr.length ? Math.max(...trArr) : 0, gnMax: gnArr.length ? Math.max(...gnArr) : 0, nSample: sample.length };
}

function measure(rA: (th: number, z: number) => number, recipe: typeof RECIPE): {
  tris: number; radialMax: number; radialP99: number; true3dP99: number; true3dMax: number;
  pctBelow20: number; minAngleDeg: number; rawNonMan: number; anchor: ReturnType<typeof bruteAnchorWorstTrue3d>;
} {
  const mesh = buildInhouseMetricMesh(rA, H, recipe);
  const ut = Array.from(mesh.ut); const idx = mesh.indices;
  const tris = idx.length / 3;
  const radial = perFaceChordSag(ut, idx, rA, H);
  const true3d = perFaceTrue3DSag(ut, idx, rA, H);
  const xyz = liftUtToRadial(ut, rA, H).vertices;
  const tq = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const anchor = bruteAnchorWorstTrue3d(ut, idx, rA, true3d.faceErr, 40);
  return {
    tris, radialMax: radial.worstMm, radialP99: p99(radial.faceErr),
    true3dP99: p99(true3d.faceErr), true3dMax: true3d.worstMm,
    pctBelow20: tq.pctBelow20, minAngleDeg: tq.minAngleDeg, rawNonMan: auditNonManRaw(idx), anchor,
  };
}

function scoreStyle(style: StyleId): void {
  mkdirSync(DIR, { recursive: true });
  const rA = buildRadiusFn(style, {}, DIMS);
  const t0 = Date.now();
  const full = measure(rA, RECIPE);
  const half = measure(rA, RECIPE_HALF);
  const buildMs = Date.now() - t0;

  // The honest verdict number: independent brute-anchored true-3D p99 on the worst-40 (falls back to whole-mesh GN
  // p99 if the anchor lowered nothing — for smooth fields GN==brute so they should coincide).
  const verdictP99 = Math.min(full.true3dP99, full.anchor.trustedP99 > 0 ? full.anchor.trustedP99 : full.true3dP99);
  const reaches001 = verdictP99 <= CAD_TOL;
  const densityFragile = half.true3dP99 > CAD_TOL; // half-density blows past bar?
  const rulerArtifact = full.anchor.gnMax - full.anchor.trustedMax > 0.005; // GN overstated the worst facet
  const radialMasksTrue3d = full.true3dP99 > full.radialP99 + 0.005; // true-3D worse than radial (radial lenient)

  let verdict: 'CONFIRMED' | 'REFUTED' | 'PARTIAL';
  if (reaches001 && !densityFragile && full.rawNonMan === 0 && !rulerArtifact && !radialMasksTrue3d) verdict = 'CONFIRMED';
  else if (!reaches001 || full.rawNonMan > 0 || rulerArtifact) verdict = 'REFUTED';
  else verdict = 'PARTIAL'; // reaches bar independently but a secondary attack (density/quality) lands

  const row = {
    style, verdict,
    // full-density independent numbers
    tris: full.tris,
    verdictTrue3dP99: +verdictP99.toFixed(4),
    true3dP99Full: +full.true3dP99.toFixed(4), true3dMaxFull: +full.true3dMax.toFixed(4),
    radialP99Full: +full.radialP99.toFixed(4), radialMaxFull: +full.radialMax.toFixed(4),
    anchorGnP99: +full.anchor.gnP99.toFixed(4), anchorTrustedP99: +full.anchor.trustedP99.toFixed(4),
    anchorGnMax: +full.anchor.gnMax.toFixed(4), anchorTrustedMax: +full.anchor.trustedMax.toFixed(4),
    pctBelow20Full: +full.pctBelow20.toFixed(2), minAngleDegFull: +full.minAngleDeg.toFixed(2),
    rawNonManFull: full.rawNonMan,
    // half-density attack
    trisHalf: half.tris, true3dP99Half: +half.true3dP99.toFixed(4), true3dMaxHalf: +half.true3dMax.toFixed(4),
    pctBelow20Half: +half.pctBelow20.toFixed(2), rawNonManHalf: half.rawNonMan,
    // attack flags
    reaches001, densityFragile, rulerArtifact, radialMasksTrue3d,
    buildMs,
  };
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(
    `${String(style).padEnd(18)} VERDICT=${verdict} | full: tris=${full.tris} true3dP99=${row.true3dP99Full} (radialP99=${row.radialP99Full}) ` +
    `anchor gn=${row.anchorGnMax}->trusted=${row.anchorTrustedMax} | %<20=${row.pctBelow20Full} minAng=${row.minAngleDegFull} rawNM=${full.rawNonMan} ` +
    `|| HALF: tris=${half.tris} true3dP99=${row.true3dP99Half} rawNM=${half.rawNonMan} %<20=${row.pctBelow20Half} ` +
    `|| reaches=${reaches001} densFragile=${densityFragile} rulerArt=${rulerArtifact} radialMask=${radialMasksTrue3d} (${buildMs}ms)`,
  );
}

describe('VERIFY-SMOOTH — adversarial re-measure of the 5 wavy-field <=0.01 claims', () => {
  for (const style of STYLES) {
    it.skipIf(!RUN)(`verify ${style}`, () => {
      if (scoredSet().has(style)) { console.log(`${style}: row exists — SKIP (resume)`); return; }
      scoreStyle(style);
      expect(true).toBe(true);
    }, 40 * 60 * 1000);
  }
});

// Non-vacuous control for the RAW-index non-manifold auditor (attack C): an injected 3rd triangle on an edge MUST
// raise the count. Guards against a vacuous "rawNonMan=0".
describe('VERIFY-SMOOTH — rawNonMan auditor is non-vacuous', () => {
  it('injected fold moves the count', () => {
    const clean = [0, 1, 2, 2, 1, 3]; // two tris sharing edge 1-2
    expect(auditNonManRaw(clean)).toBe(0);
    const folded = [0, 1, 2, 2, 1, 3, 1, 2, 4]; // 3rd tri on edge 1-2 -> non-manifold
    expect(auditNonManRaw(folded)).toBe(1);
  });
});
