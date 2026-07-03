// _close_smooth.test.ts — DEV-ONLY (env PF_SMOOTH=1). CLOSE the SMOOTH axis toward the PotFoundry export standard:
// honest true-3D perp <= 0.01mm vs the actual 3D object, zero serration by construction, on the 5 single-valued
// wavy-height-field styles: HarmonicRipple, RippleInterference, WaveInterference, SuperellipseMorph, FourierBloom.
//
// PRIMITIVE = uniform metric-square (buildInhouseMetricMesh under the surface metric M=g/h², uniform sizing +
// deep-sag chordSteiner). NO feature graph needed (no ridge/tile/weave/tangle) — these are single-valued fields.
// This axis is EXPECTED to pass (HarmonicRipple already proved 0.0029mm honest true-3D). LIGHT screen: confirm the
// honest triple (trustedP99 <= 0.01 / %<20 low / rawNonMan 0) at <=0.8M tris per style.
//
// HONEST RULERS (labkit):
//  - TRUE-3D GATE = bruteAnchoredRedPerp(...).trustedP99 (brute-anchored worst-red; GN single-seed overstates steep
//    up to 7x). If ZERO red facets (radial < 0.1mm everywhere) the anchor is vacuous -> the whole-mesh true-3D p99
//    from perFaceTrue3DSag IS the honest gate (smooth fields have no wrong-local-minimum feet). Report BOTH.
//  - QUALITY = triangleQualityDistribution on the PRIMITIVE mesh (min-angle, %<20).
//  - WATERTIGHT = RAW-INDEX non-manifold (undirected edges by LITERAL index shared by >2 tris) MUST be 0.
//
// One env-gated `it` PER STYLE + CHECKPOINT (ndjson row + heatmap bins) the INSTANT scored -> a killed run resumes
// by re-running only the unscored styles (a style whose row already exists is SKIPPED). ISOLATED: reuses labkit
// rulers + committed byte-identical-off kernel hooks READ-ONLY; edits NOTHING in src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, liftUtToRadial, buildMeshUt,
  perFaceChordSag, perFaceTrue3DSag, bruteAnchoredRedPerp,
  triangleQualityDistribution, dumpHeatmap,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_SMOOTH === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DIR = join('research', 'exchange', '_close_smooth');
const LEDGER = join(DIR, 'scorecard.ndjson');
const CAD_TOL = 0.01; // the SMOOTH-axis export standard: honest true-3D perp <= 0.01mm

// screening recipe = the current best GENERAL uniform metric-square (M=g/h²) + deep-sag chordSteiner, kept <=0.8M.
const RECIPE = {
  tolMm: 0.004, hMin: 0.006, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
  maxPoints: 800_000, splitThresh: 1.5, optimizeSweeps: 2,
  guardManifoldAlways: true, chordTolMm: 0.03, chordSteiner: true,
} as const;

const STYLES: StyleId[] = [
  'HarmonicRipple', 'RippleInterference', 'WaveInterference', 'SuperellipseMorph', 'FourierBloom',
] as unknown as StyleId[];

function p99(arr: ArrayLike<number>): number {
  const s = Float64Array.from(arr as ArrayLike<number>).sort();
  return s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0;
}
/** RAW-INDEX non-manifold: undirected edges (by literal index, no weld) shared by >2 tris. */
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
/** already-scored styles (resume): the ndjson rows on disk. */
function scoredSet(): Set<string> {
  if (!existsSync(LEDGER)) return new Set();
  const s = new Set<string>();
  for (const ln of readFileSync(LEDGER, 'utf8').split('\n')) {
    if (!ln.trim()) continue;
    try { s.add(JSON.parse(ln).style); } catch { /* skip */ }
  }
  return s;
}

function scoreStyle(style: StyleId): void {
  mkdirSync(DIR, { recursive: true });
  const rA = buildRadiusFn(style, {}, DIMS);
  const t0 = Date.now();
  const mesh = buildInhouseMetricMesh(rA, H, RECIPE);
  const buildMs = Date.now() - t0;
  const ut = Array.from(mesh.ut); const idx = mesh.indices;
  const tris = idx.length / 3;

  // TRUE-3D fidelity: radial screen (for the red pick) + honest whole-mesh true-3D p99, brute-anchor worst-red.
  const radial = perFaceChordSag(ut, idx, rA, H);
  const true3d = perFaceTrue3DSag(ut, idx, rA, H);
  const true3dP99 = p99(true3d.faceErr);
  const true3dMax = true3d.worstMm;
  const nRed = radial.fracOver(0.1) * tris;
  let anchor: { trustedP99: number; trustedMax: number; gnP99: number; gnOver: number; nRed: number; nSample: number } | null = null;
  if (nRed > 0) {
    const a = bruteAnchoredRedPerp(ut, idx, rA, H, { redMm: 0.1, sampleN: 40, radial });
    anchor = { trustedP99: a.trustedP99, trustedMax: a.trustedMax, gnP99: a.gnP99, gnOver: a.gnOver, nRed: a.nRed, nSample: a.nSample };
  }
  // honest verdict number: anchored trusted-p99 if any red facets, else the whole-mesh true-3D p99 (smooth => no
  // wrong-local-minimum feet, so GN true-3D IS trustworthy).
  const verdictP99 = anchor ? anchor.trustedP99 : true3dP99;

  // QUALITY on the PRIMITIVE mesh (3D lift).
  const xyz = liftUtToRadial(ut, rA, H).vertices;
  const tq = triangleQualityDistribution({ vertices: xyz, indices: idx });

  // WATERTIGHT: raw-index non-manifold on the primitive (rim boundary excluded — this is the open outer wall, so
  // rawNonMan captures interior manifold-ness which MUST be 0; a smooth wall has no legit >2-shared edge).
  const rawNonMan = auditNonManRaw(idx);

  const reaches001 = verdictP99 <= CAD_TOL;
  const residual = reaches001
    ? 'PASS'
    : (nRed > 0 && verdictP99 > CAD_TOL ? 'steep-EXCLUDE-radial-overstate-true3d-CAD-grade?' : 'density-responsive-need-more');

  const row = {
    style, tris,
    verdictTrue3dP99: +verdictP99.toFixed(4),
    true3dP99: +true3dP99.toFixed(4), true3dMax: +true3dMax.toFixed(4),
    anchorTrustedP99: anchor ? +anchor.trustedP99.toFixed(4) : null,
    anchorGnP99: anchor ? +anchor.gnP99.toFixed(4) : null,
    anchorNRed: anchor ? anchor.nRed : 0,
    radialMax: +radial.worstMm.toFixed(4),
    pctBelow20: +tq.pctBelow20.toFixed(2), pctBelow10: +tq.pctBelow10.toFixed(2),
    minAngleDeg: +tq.minAngleDeg.toFixed(2), medianMinAngle: +tq.medianMinAngleDeg.toFixed(2),
    rawNonMan,
    reaches001, residualMechanism: residual,
    buildMs, recipe: 'M-square+chordSteiner0.03@0.8M',
  };
  // CHECKPOINT — append the row + dump the heatmap the INSTANT scored.
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  const mu = buildMeshUt(ut, Array.from(idx), rA, H);
  dumpHeatmap(DIR, `smooth_${style}`, mu.xyz, ut, Array.from(idx), rA, H, { stl: false });
  // eslint-disable-next-line no-console
  console.log(
    `${String(style).padEnd(20)} tris=${String(tris).padStart(7)} verdictTrue3dP99=${row.verdictTrue3dP99} ` +
    `(gn-t3d=${row.true3dP99} max=${row.true3dMax}${anchor ? ` red=${anchor.nRed}->anchored=${anchor.trustedP99.toFixed(4)}` : ' red=0'}) ` +
    `reaches<=0.01=${reaches001} | %<20=${row.pctBelow20} minAng=${row.minAngleDeg} | rawNM=${rawNonMan} | ${residual} (${buildMs}ms)`,
  );
}

describe('CLOSE-SMOOTH — honest true-3D triple for the 5 single-valued wavy-field styles', () => {
  for (const style of STYLES) {
    it.skipIf(!RUN)(`score ${style}`, () => {
      if (scoredSet().has(style)) { console.log(`${style}: row exists — SKIP (resume)`); return; }
      scoreStyle(style);
      expect(true).toBe(true);
    }, 30 * 60 * 1000);
  }
});
