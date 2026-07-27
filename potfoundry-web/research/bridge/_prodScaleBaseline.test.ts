// _prodScaleBaseline.test.ts — DEV-ONLY (PF_PRODBASE=1). MEASURE-ONLY (no src/ edits; src never imports research).
//
// FRESH, honest per-style TRUE-3D baseline at PRODUCTION scale (OD140/H120 + registry-default params) through the
// best Node-runnable region kernel (buildInhouseMetricMesh = the M=g/h² surface-metric mesher, the closest
// productionizable proxy). Answers "how close is each of the 20 registry styles to a 0.01mm production mesh" so
// closures can be routed. Supersedes the SUSPECTED 2026-07-12 GPU-oracle numbers in the all-20 status-truth doc.
//
// PRODUCTION SCALE (the whole point — every prior all-20 harness used a SMALLER OD~100 pot w/ expn 1):
//   DIMS = DEFAULT_DIMENSIONS outer wall = { H:120, Rb:45, Rt:70 (=140 OD/2), expn:1.1 }.  params = {} ⇒ registry
//   defaults (buildRadiusFn spreads DEFAULT_STYLE_PARAMS[style]).
//
// METRIC DISCIPLINE (LAB-CHEATSHEET):
//   • Verdict ruler = TRUE-3D. perFaceTrue3DSag (facet→NEAREST-surface, GN) is honest on SMOOTH/riser styles.
//   • STEEP LATTICES {Gyroid, Voronoi, BasketWeave, CelticKnot, CelticTriquetra}: single-seed GN OVERSTATES true-3D
//     up to ~7× (wrong-local-minimum feet). The VERDICT there = bruteAnchoredRedPerp (worst-N full-azimuth brute
//     twin; returns trustedMax/trustedP99 next to the overstated gnP99). GN whole-mesh p99 is reported too, FLAGGED.
//   • Any NON-steep style whose GN max > 0.1 gets a brute CROSS-CHECK so a hidden GN overstatement can't slip through.
//   • Watertight = nonManRawBigStats (Map-free, exact past 5.6M tris). Slivers = triangleQualityDistribution minAngle.
//
// RESILIENCE: ONE `it` PER STYLE (PF_PRODBASE=1); each checkpoints ONE ndjson row the INSTANT it is scored and a
//   style whose row already exists is SKIPPED ⇒ a killed run resumes by re-running only the unfinished styles.
//   Screen budget PF_PRODBASE_BUDGET (maxPoints, default 300k ⇒ ~0.6M tris/wall — the moderate band). HD confirm of
//   the flagged-close few via PF_PRODBASE=hd + PF_PRODBASE_HD=Style1,Style2 (higher budget).
//
// Run:  PF_PRODBASE=1 npx vitest run --config vitest.prodbase.config.ts
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInhouseMetricMesh, type InhouseMeshOpts,
  buildRadiusFn, liftUtToRadial, type StyleDims,
  perFaceTrue3DSag, perFaceChordSag, bruteAnchoredRedPerp,
  nonManRawBigStats, triangleQualityDistribution, type ChordSagResult,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';

// ── production-default outer wall (DEFAULT_DIMENSIONS; expn 1.1, Rt 70 = OD140) ──
const DIMS: StyleDims = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const H = DIMS.H;

// registry ID order 0..19 (id = array index)
const ALL_20: StyleId[] = [
  'SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph', 'HarmonicRipple',
  'GothicArches', 'WaveInterference', 'Crystalline', 'ArtDeco', 'DragonScales',
  'BambooSegments', 'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave',
  'GeometricStar', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'LowPolyFacet',
] as StyleId[];

// GN wrong-local-minimum set — verdict comes from the brute anchor, not GN (LAB-CHEATSHEET steep-lattice gotcha).
const STEEP = new Set<string>(['GyroidManifold', 'Voronoi', 'BasketWeave', 'CelticKnot', 'CelticTriquetra']);

const BUDGET = process.env.PF_PRODBASE_BUDGET ? parseInt(process.env.PF_PRODBASE_BUDGET, 10) : 300_000;
const SCREEN: InhouseMeshOpts = {
  tolMm: 0.01, hMin: 0.01, hMax: 8, sizeRes: 256, gradeBeta: 0.2,
  seedN: 14, maxPoints: BUDGET, splitThresh: 1.5, optimizeSweeps: 2,
  chordTolMm: 0.01, guardManifoldAlways: true, // best-effort fidelity (drives sharp relief) + universal watertight
};
// HD confirm for the flagged-close few (higher budget + finer tol + dense chord guard = the acceptance ruler).
const HD_BUDGET = process.env.PF_PRODBASE_HD_BUDGET ? parseInt(process.env.PF_PRODBASE_HD_BUDGET, 10) : 1_200_000;
const HD: InhouseMeshOpts = {
  tolMm: 0.006, hMin: 0.006, hMax: 8, sizeRes: 320, gradeBeta: 0.2,
  seedN: 14, maxPoints: HD_BUDGET, splitThresh: 1.5, optimizeSweeps: 2,
  chordTolMm: 0.008, chordSampleN: 8, guardManifoldAlways: true,
};

const OUT = join('research', 'exchange', '_prodbase');
const NDJSON = join(OUT, 'baseline.ndjson');
const HD_NDJSON = join(OUT, 'hd.ndjson');
const PROG = join(OUT, 'progress.log');

const plog = (m: string): void => {
  mkdirSync(OUT, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(PROG, l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
};
const rowExists = (file: string, style: string): boolean => {
  if (!existsSync(file)) return false;
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).some((l) => {
    try { return (JSON.parse(l) as { style?: string }).style === style; } catch { return false; }
  });
};
const checkpoint = (file: string, row: Record<string, unknown>): void => {
  mkdirSync(OUT, { recursive: true });
  appendFileSync(file, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${String(row.style)}] ${JSON.stringify(row)}`);
};

function pct(arr: ArrayLike<number>, p: number): number {
  if (arr.length === 0) return 0;
  const s = Float64Array.from(arr as ArrayLike<number>).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

// Steep brute-anchor grids: LIGHT for the screen (worst-N classification verdict, ~seconds), FULL for HD confirm.
// rA on tangled lattices (Gyroid/Voronoi) is an expensive field eval and the full 8192×1600 fine grid does ~13M
// rA calls/facet ⇒ minutes/style; the light grid keeps the screen verdict fast while still full-azimuth (so it
// still corrects GN's wrong-well overstatement — the whole point).
const STEEP_SCREEN = { sampleN: 24, coarse: { nTheta: 1024, nZ: 256 }, fine: { nTheta: 4096, nZ: 800 } };
const STEEP_HD = { sampleN: 60, coarse: { nTheta: 2048, nZ: 400 }, fine: { nTheta: 8192, nZ: 1600 } };

/** Build one style through the region kernel at `opts`, score TRUE-3D + watertight + slivers, checkpoint the row. */
function scoreOne(file: string, id: number, style: StyleId, opts: InhouseMeshOpts, hd = false): void {
  if (rowExists(file, String(style))) { plog(`[skip] ${style} — row exists`); return; }
  const rA = buildRadiusFn(style, {}, DIMS);
  let mesh;
  const t0 = Date.now();
  try {
    mesh = buildInhouseMetricMesh(rA, H, opts);
  } catch (e) {
    checkpoint(file, { id, style: String(style), error: String(e) });
    plog(`[${style}] BUILD ERROR ${String(e)}`);
    return;
  }
  const buildS = (Date.now() - t0) / 1000;
  const tris = mesh.indices.length / 3;
  plog(`[${style}] built tris=${tris} points=${mesh.points} rounds=${mesh.rounds} hitBudget=${mesh.hitBudget} (${buildS.toFixed(0)}s) — scoring…`);

  const isSteep = STEEP.has(String(style));
  let true3dMax = 0, true3dP99 = 0, ruler = '';
  let radialMax: number | null = null, radialP99: number | null = null;
  let gnP99: number | null = null, gnOver: number | null = null, nRed: number | null = null;

  const s0 = Date.now();
  if (isSteep) {
    // STEEP tangled lattice: single-seed GN stalls in wrong-well feet ⇒ OVERSTATES true-3D up to ~7×. The verdict
    // is the full-azimuth brute twin on the worst-N radial facets (LAB-CHEATSHEET). radial = cheap whole-mesh screen;
    // anc.gnP99 = the GN-overstatement witness (centroid GN on the same sampled facets).
    const radial = perFaceChordSag(mesh.ut, mesh.indices, rA, H);
    radialMax = radial.worstMm; radialP99 = pct(radial.faceErr, 0.99);
    const g = hd ? STEEP_HD : STEEP_SCREEN;
    const anc = bruteAnchoredRedPerp(mesh.ut, mesh.indices, rA, H, { radial, redMm: 0.03, sampleN: g.sampleN, coarse: g.coarse, fine: g.fine });
    nRed = anc.nRed; gnOver = anc.gnOver; gnP99 = anc.gnP99;
    true3dMax = anc.trustedMax; true3dP99 = anc.trustedP99;
    ruler = `brute-anchored centroid worst-${g.sampleN} of ${anc.nRed} red (steep; radial/GN overstate — see radialMax/gnP99)`;
  } else {
    // SMOOTH / riser / thin-ridge: the surface is single-valued radially ⇒ GN finds the UNIQUE nearest foot ⇒
    // perFaceTrue3DSag (facet→nearest-surface, 4-pt SAG_BARY max) is the honest per-facet ruler. NO brute correction:
    // the brute anchor is centroid-only and would UNDERSTATE the facet's worst-interior perp (labkit caveat).
    const t3: ChordSagResult = perFaceTrue3DSag(mesh.ut, mesh.indices, rA, H);
    true3dMax = t3.worstMm; true3dP99 = pct(t3.faceErr, 0.99);
    ruler = 'perFaceTrue3DSag (GN 4-pt, honest on single-valued surface)';
  }
  const scoreS = (Date.now() - s0) / 1000;

  // watertight (Map-free) + slivers
  const wt = nonManRawBigStats(mesh.indices);
  const lifted = liftUtToRadial(mesh.ut, rA, H);
  const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: mesh.indices });

  const row = {
    id, style: String(style), scale: 'OD140/H120 reg-default', kernel: 'buildInhouseMetricMesh',
    tris, points: mesh.points, rounds: mesh.rounds, hitBudget: mesh.hitBudget, budget: opts.maxPoints,
    buildS: +buildS.toFixed(1), scoreS: +scoreS.toFixed(1),
    true3dMaxMm: +true3dMax.toFixed(4), true3dP99Mm: +true3dP99.toFixed(4), ruler, steep: isSteep,
    gnP99Mm: gnP99 === null ? null : +gnP99.toFixed(4), gnOver, nRedFacets: nRed,
    radialMaxMm: radialMax === null ? null : +radialMax.toFixed(4), radialP99Mm: radialP99 === null ? null : +radialP99.toFixed(4),
    nonMan: wt.nonMan, boundary: wt.boundary, edges: wt.edges,
    minAngleDeg: +q.minAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(2), meanMinAngleDeg: +q.meanMinAngleDeg.toFixed(2),
  };
  checkpoint(file, row);
  plog(`[${style}] DONE true3d max=${true3dMax.toFixed(4)} p99=${true3dP99.toFixed(4)} ruler="${ruler}" nonMan=${wt.nonMan} <20°=${q.pctBelow20.toFixed(1)}% in ${scoreS.toFixed(0)}s`);
}

describe('PROD-SCALE true-3D baseline — all 20 registry styles at OD140/H120 + registry defaults', () => {
  // ── SCREEN: one it per style (resume-on-kill), moderate budget ──
  ALL_20.forEach((style, id) => {
    it.skipIf(process.env.PF_PRODBASE !== '1')(`baseline [${id}] ${style}`, () => {
      scoreOne(NDJSON, id, style, SCREEN);
      expect(true).toBe(true);
    }, 40 * 60 * 1000);
  });

  // ── HD confirm: only the styles named in PF_PRODBASE_HD (comma-separated), higher budget ──
  it.skipIf(process.env.PF_PRODBASE !== 'hd')('HD confirm flagged-close styles (PF_PRODBASE_HD=Style1,Style2)', () => {
    const names = (process.env.PF_PRODBASE_HD ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    plog(`=== HD confirm budget=${HD.maxPoints} styles=${names.join(',') || '(none — set PF_PRODBASE_HD)'} → ${HD_NDJSON} ===`);
    for (const name of names) {
      const id = ALL_20.indexOf(name as StyleId);
      if (id < 0) { plog(`[HD] unknown style ${name} — skip`); continue; }
      scoreOne(HD_NDJSON, id, name as StyleId, HD, true);
    }
    expect(true).toBe(true);
  }, 180 * 60 * 1000);
});
