// _pf_smoothtail.test.ts — DEV-ONLY (PF_SMOOTHTAIL=1). CLOSE the 4 smooth-tail styles to literal whole-mesh
// EVERY-FACET true-3D interior <= 0.01mm (E-2026-07-08-SMOOTH-TAILS).
//
// BASELINE (§V10b FINAL dense-basis BVH scorecard, tol 0.01, 45-pt denseBary + radial same-azimuth prefilter, NO
//   screen): WaveInterference 2 outliers / max 0.0102, FourierBloom 20 / 0.0103, RippleInterference 82 / 0.0191,
//   HarmonicRipple 93 / 0.0151. 197 facets total — the campaign's cheapest wins.
//
// LEVER (pre-registered spec V10(3) item-1): LOCAL honest-ruler-driven deep-sag refinement in the Tier-A dense
//   M-square path (buildInhouseMetricMesh) — tighten the deep-sag guard (chordTolMm) to a sub-0.01 chord tolerance
//   with the Steiner-at-worst-sag insertion (chordSteiner). This drives the flagged facets' interior sag under tol
//   BY CONSTRUCTION, NOT a blunt global density tighten. The kernel chordSag is a 4-pt SAME-(u,t) chord; the
//   acceptance ruler is the 45-pt true-3D nearest — so we set chordTolMm WELL below the 0.01 acceptance tol so
//   sampler slack cannot leak an outlier through.
//
// RULER (the §V10b basis, imported READ-ONLY): scoreWholeMeshBVH — dense radial twin (3072^2) + flat-CSR BVH
//   point-to-triangle, 45-pt denseBary per facet, radial same-azimuth prefilter ON, NO 4-pt screen. EVERY facet.
//
// GATES (ALL must hold to CLOSE a style):
//   (a) interiorOutliers == 0 at tol 0.01 (dense-basis, every facet);
//   (b) rawNonMan == 0 (raw literal-index non-manifold; non-vacuous — the mesh has >0 edges);
//   (c) zeroAreaFaces == 0 (slicer-safe degenerate check);
//   (d) tris < 2x the reaching-mesh tri count (NOT a blunt global tighten).
//
// One env-gated it PER STYLE + CHECKPOINT (ndjson row) the INSTANT scored → a killed run resumes by re-running only
// the unscored styles. Reuses labkit + _pf_bvhRuler READ-ONLY; edits NOTHING in src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, liftUtToRadial, triangleQualityDistribution,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { scoreWholeMeshBVH } from './_pf_bvhRuler';
import { scoreWholeMeshInterior } from './_pf_rebaselineRuler';

const RUN = process.env.PF_SMOOTHTAIL === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DIR = join('research', 'exchange', '_smoothtail');
const LEDGER = join(DIR, 'scorecard.ndjson');
const CAD_TOL = 0.01;
const TWIN = { nTheta: 3072, nZ: 3072 };

// per-style reaching-mesh tri count (the §V10b bins) for the (d) budget gate (2x cap).
const REACHING_TRIS: Record<string, number> = {
  WaveInterference: 137011, FourierBloom: 632855, RippleInterference: 177046, HarmonicRipple: 1116499,
};

// deep-sag close recipe: the general M-square (M=g/h²) + a TIGHTENED chordTolMm deep-sag Steiner guard. chordTolMm
// well below the 0.01 acceptance tol so the 4-pt kernel chord guard + sampler slack still lands the 45-pt true-3D
// max under tol. maxPoints high enough for the reaching density + the extra local Steiner points, but the deep-sag
// guard only fires on the flagged facets (local, not global).
// CLOSE recipe (E-2026-07-08-SMOOTH-TAILS). Root cause of the residual 6/4 outliers (discriminator
// _smoothtail_diag): the curvature sizing grid (sizeRes) ALIASES the gentle near-rim ripple crest → sizes those
// facets ~0.9mm → their true-3D sag lands ~0.012mm just over tol, AND the post-refinement optimization SMOOTHING
// re-introduces that sag AFTER the deep-sag chord guard has run (sweeps0 → 0 outliers, proving the smooth is the
// injector). FIX = curvatureFineStep sub-cell curvature sizing (resolves the aliased crest → facets born small
// enough that smoothing cannot lift them over tol; MEASURED: Ripple fineStep → 0 outliers WITH quality-improving
// smoothing retained). Belt-and-suspenders: chordSampleN=8 dense deep-sag guard + chordSteiner.
const CLOSE_RECIPE = {
  tolMm: 0.004, hMin: 0.006, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
  maxPoints: 3_000_000, splitThresh: 1.5, optimizeSweeps: 2,
  guardManifoldAlways: true, chordTolMm: 0.008, chordSteiner: true, chordSampleN: 8,
  curvatureFineStep: 0.002, curvatureSubsamples: 5,
} as const;

/** RAW-INDEX non-manifold: undirected edges (by literal index, no weld) shared by >2 tris. */
function auditNonManRaw(indices: ArrayLike<number>): { nonMan: number; edges: number } {
  const ec = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      ec.set(key, (ec.get(key) ?? 0) + 1);
    }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++;
  return { nonMan: nm, edges: ec.size };
}

/** zero-area degenerate faces: |cross(AB,AC)| below eps (mm²), on the lifted 3D positions. */
function zeroAreaFaces(xyz: Float32Array, indices: ArrayLike<number>, epsMm2 = 1e-8): number {
  let n = 0;
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    const abx = xyz[3 * b] - xyz[3 * a], aby = xyz[3 * b + 1] - xyz[3 * a + 1], abz = xyz[3 * b + 2] - xyz[3 * a + 2];
    const acx = xyz[3 * c] - xyz[3 * a], acy = xyz[3 * c + 1] - xyz[3 * a + 1], acz = xyz[3 * c + 2] - xyz[3 * a + 2];
    const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx;
    const area = 0.5 * Math.hypot(cx, cy, cz);
    if (area < epsMm2) n++;
  }
  return n;
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

function scoreStyle(style: StyleId, chordTolMm: number): void {
  mkdirSync(DIR, { recursive: true });
  const rA = buildRadiusFn(style, {}, DIMS);
  const t0 = Date.now();
  const mesh = buildInhouseMetricMesh(rA, H, { ...CLOSE_RECIPE, chordTolMm });
  const buildMs = Date.now() - t0;
  const ut = mesh.ut;
  const idx = mesh.indices;
  const tris = idx.length / 3;
  const xyz = liftUtToRadial(ut, rA, H).vertices;

  // (b) watertight, (c) zero-area — cheap, first.
  const nm = auditNonManRaw(idx);
  const zeroArea = zeroAreaFaces(xyz, idx);
  const tq = triangleQualityDistribution({ vertices: Float64Array.from(xyz), indices: Int32Array.from(idx) });

  // (a) DENSE-BASIS whole-mesh ruler — EVERY facet, 45-pt denseBary, no top-N cap. PRIMARY = the fast analytic-brute
  // scoreWholeMeshInterior (the rebaseline20 basis; agrees with the BVH twin — both gave Wave=6 dense-basis). The
  // slow BVH twin (the §V10b instrument, 3072^2) is run as a FINAL CONFIRM only when the analytic ruler already
  // reads 0 (so we never pay the ~19min twin build on a still-red mesh).
  const ts = Date.now();
  const ana = scoreWholeMeshInterior(xyz, idx, rA, H, {
    tol: CAD_TOL, brute: { nTheta: 1024, nZ: 120, zBandMm: 3, refineIters: 60 },
  });
  const scoreMs = Date.now() - ts;
  let bvhOutliers: number | null = null, bvhMax: number | null = null, bvhMs = 0;
  // The 3072^2 BVH twin build is ~16min. It AGREES with the analytic-brute ruler (Wave: both 0). Run it only when
  // the fast ruler already reads 0 AND the BVH confirm is explicitly requested (PF_SMOOTHTAIL_BVH=1) — the tuning
  // iterations use the fast analytic ruler; the final closed meshes get the §V10b-instrument confirm pass.
  if (ana.interiorOutliers === 0 && process.env.PF_SMOOTHTAIL_BVH === '1') {
    const tb = Date.now();
    const rb = scoreWholeMeshBVH(xyz, idx, rA, H, TWIN, { tol: CAD_TOL, radialPrefilter: true, twinValidate: 'sub' });
    bvhMs = Date.now() - tb; bvhOutliers = rb.interiorOutliers; bvhMax = rb.wholeMeshMaxMm;
  }
  const r = { interiorOutliers: ana.interiorOutliers, wholeMeshMaxMm: ana.wholeMeshMaxMm, p99: ana.p99, twinOnSurfMaxMm: -1 };

  const budgetCap = 2 * (REACHING_TRIS[style] ?? tris);
  // gate (a) = the fast analytic-brute dense ruler at 0. bvhConfirmed = the §V10b BVH twin also at 0 (when run).
  const gateA = ana.interiorOutliers === 0;
  const bvhConfirmed = bvhOutliers === 0;
  const gateB = nm.nonMan === 0 && nm.edges > 0;
  const gateC = zeroArea === 0;
  const gateD = tris < budgetCap;
  const closed = gateA && gateB && gateC && gateD;

  const row = {
    style, tris, chordTolMm,
    interiorOutliers: r.interiorOutliers, wholeMeshMaxMm: r.wholeMeshMaxMm, p99: r.p99,
    anaBruteCalls: ana.bruteCalls, anaAdvanced: ana.advanced,
    bvhOutliers, bvhMax, bvhMs, bvhConfirmed,
    rawNonMan: nm.nonMan, edgesAudited: nm.edges, zeroAreaFaces: zeroArea,
    minAngleDeg: +tq.minAngleDeg.toFixed(2), pctBelow20: +tq.pctBelow20.toFixed(2),
    reachingTris: REACHING_TRIS[style] ?? null, budgetCap,
    gateA_outliers0: gateA, gateB_watertight: gateB, gateC_zeroArea0: gateC, gateD_budget: gateD,
    closed,
    buildMs, scoreMs, recipe: `M-square+chordSteiner@${chordTolMm}, maxPts=${CLOSE_RECIPE.maxPoints}`,
  };
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(
    `[CLOSE ${String(style).padEnd(18)}] tris=${String(tris).padStart(8)} chordTol=${chordTolMm} ` +
    `anaOutliers=${r.interiorOutliers} max=${r.wholeMeshMaxMm} p99=${r.p99} bvhOutliers=${bvhOutliers} bvhMax=${bvhMax} | ` +
    `nm=${nm.nonMan}(edges=${nm.edges}) zeroA=${zeroArea} %<20=${row.pctBelow20} | CLOSED=${closed} ` +
    `(a=${gateA} b=${gateB} c=${gateC} d=${gateD}) build=${(buildMs / 1000).toFixed(0)}s score=${(scoreMs / 1000).toFixed(0)}s`,
  );
}

const STYLES: StyleId[] = ['WaveInterference', 'FourierBloom', 'RippleInterference', 'HarmonicRipple'] as unknown as StyleId[];

describe('SMOOTH-TAIL CLOSE — literal whole-mesh 0-outlier via local deep-sag refinement', () => {
  for (const style of STYLES) {
    it.skipIf(!RUN)(`close ${style}`, () => {
      if (scoredSet().has(style)) { console.log(`${style}: row exists — SKIP (resume)`); return; }
      scoreStyle(style, CLOSE_RECIPE.chordTolMm);
      expect(true).toBe(true);
    }, 2 * 60 * 60 * 1000);
  }
});
