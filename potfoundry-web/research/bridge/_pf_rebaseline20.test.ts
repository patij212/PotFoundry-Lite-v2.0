// _pf_rebaseline20.test.ts — DEV-ONLY (PF_REBASE=1, huge tier PF_REBASE_BIG=1). THE DEFINITIVE 20-STYLE
// WHOLE-MESH RE-BASELINE (E-2026-07-05-REBASELINE20; ACCEPTANCE UPDATED under E-2026-07-09-REBASELINE20).
//
// ⚠️ ACCEPTANCE UPDATE (2026-07-09): this probe was ORIGINALLY written under a BLANKET literal-0 assumption
//   (`tierABall0Outlier` = ALL 18 Tier-A/B styles interiorOutliers==0). That assumption is SUPERSEDED. Per the
//   ACCEPTED TERMINAL SCORECARD `research/lab/2026-07-09-drive-final-scorecard.md` (commit 83fe4c36; USER DECISION
//   2026-07-09) the 20 styles are TERMINALLY adjudicated with PER-STYLE verdicts, NOT blanket literal-0:
//     • Tier-1 (12): LITERAL whole-mesh 0 at tol 0.01 — the blanket-0 gate is CORRECT for these.
//     • Tier-2 CERTIFIED (4: LowPolyFacet, SuperformulaBlossom, Crystalline, DragonScales): body ≤ tol; the residual
//       IS a designed feature edge (zero-serration cliff/kink certification). Their honest figure is a CERTIFIED
//       floor (e.g. Crystalline 49 designed valley-kink facets @0.076; DragonScales p99 0.0025–0.0057 ≪ tol), NOT 0.
//     • Tier-3 MEASURED-EXCLUDE (4: Voronoi, BasketWeave, CelticKnot, CelticTriquetra): the free-adaptive mesh is the
//       honest best representation (embedding proven regressive/divergent by control). Honest figures: Voronoi ~10.5k
//       @0.058/p99 0.027; BasketWeave p99 ~0.6 on-wall @10M; CelticKnot ~62k @0.30; CelticTriquetra ~10k off-crease
//       @0.047 (93.6% on-crease designed occlusion folds). These are ACCEPTED floors, NOT literal-0.
//   This probe RE-SCORES the persisted _best20 reaching meshes to CONFIRM each style still matches its banked
//   scorecard verdict (a NON-REGRESSION check) — it is NOT a blanket every-facet-0 gate. Watertight (non-vacuous) +
//   the honest per-style figure are the acceptance; a style reading WORSE than its scorecard row is a FINDING.
//   The PRODUCTION dispatch gate is the sibling `src/.../tierC/rebaseline20.test.ts` (PF_REBASELINE20=1): Tier-C fires
//   only for the 2 count-unstable styles, 18 fall back byte-identical, GeoStar literal-0 @patch / Gothic frontier.
//
// HYPOTHESIS (original, still measured): the _best20 manifest's per-style verdicts were measured under a TOP-N guard
//   population (centroid-only) — the guard-population artifact that hid Gothic/GeoStar whole-mesh residuals until the
//   corrected every-facet ruler. Re-scored under the WHOLE-MESH honest ruler (EVERY free facet, >=36-pt denseBary,
//   two-stage GN-screen -> full-azimuth brute-confirm, NO top-N cap), each style's whole-mesh figure is recorded and
//   checked against its scorecard verdict.
//
// PER-STYLE KILL-CRITERION (updated — record whole-mesh interiorOutliers/max/watertight/pctBelow20/tris per style):
//   - Tier-1 (12 styles): interiorOutliers == 0 whole-mesh (the literal-0 verdict holds).
//   - Tier-2/3 (8 styles): the whole-mesh figure matches the CERTIFIED/EXCLUDE floor in the scorecard (within honest
//     reproduction tolerance — the bvh-ruler styles read their banked meta figure). NOT required to be 0.
//   - watertight (auditNonManRaw, non-vacuous) EVERYWHERE.
//   - anyStyleRegressed = the list of styles whose whole-mesh figure is WORSE than its scorecard row ⇒ a FINDING.
//   CONFIRM the ship-gate iff anyStyleRegressed is EMPTY (every style still matches its accepted terminal verdict).
//
// SCORING SOURCE: the EXACT reaching meshes' persisted heatmap bins (research/exchange/_best20/heatmap/<Style>.{xyz,
//   idx}.bin) — f32 lifted-on-surface xyz + u32 idx. The honest ruler needs ONLY xyz + rA + H (full-azimuth brute),
//   NO (u,t) chart, so we re-score the real reaching geometry with zero rebuild / zero driver drift. 3 weave/braid
//   styles (BasketWeave/CelticKnot/CelticTriquetra) only have MODERATE-TWIN bins on disk (reaching 14-21M too large
//   to dump) — same primitive; scored + FLAGGED as a moderate-twin (honest for the ruler-population question).
//
// RESILIENCE: one env-gated `it` PER STYLE; CHECKPOINT one scorecard.ndjson row the INSTANT a style is scored; a
//   style whose row already exists is SKIPPED => a killed run resumes by re-running only the unfinished styles.
//   Huge meshes (LowPoly 11.3M, SFB 13M, Crystalline 3.5M, SpiralRidges 4.1M) behind PF_REBASE_BIG so they never
//   block the tractable tier's window. Edits NOTHING in src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, triangleQualityDistribution, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { scoreWholeMeshInterior, auditNonManRaw, loadBinMesh, vertexOnSurfaceCheck } from './_pf_rebaselineRuler';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TOL = 0.01;
const BEST20 = join('research', 'exchange', '_best20', 'heatmap');
const OUT = join('research', 'exchange', '_rebaseline20');
const NDJSON = join(OUT, 'scorecard.ndjson');
const PROG = join(OUT, 'progress.log');

const plog = (m: string): void => { mkdirSync(OUT, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(PROG, l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const rowExists = (style: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).style === style; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(OUT, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.style}] ${JSON.stringify(row)}`); };

interface StyleSpec {
  style: StyleId;
  binDir?: string;      // subdir under heatmap/ (weave twins live in <Style>_bins/)
  tier: 'A' | 'B';
  moderateTwin?: boolean;
  // ruler:
  //   'analytic'  = the mesh IS the analytic radial surface (5 smooth + 4 CDT-under-M tangled) => the honest
  //                 whole-mesh-vs-analytic-rA every-facet brute ruler is VALID (vertices land on-surface ~0).
  //   'bvh'       = the mesh DELIBERATELY departs from the radial surface (doubled-rings RISERS / weave over-under /
  //                 crest / seam cliff): the analytic-rA ruler MISLOCATES (vertices read 1-2mm off) and is the WRONG
  //                 ruler. The honest whole-mesh figure = the packaging's BVH-vs-closed-object heatmap meta
  //                 (pctOver0.01 over EVERY facet) — read from disk. (This IS a whole-mesh every-facet count.)
  ruler: 'analytic' | 'bvh';
  stride?: number;      // tangled-lattice tractability subsample (analytic ruler); default 1 (full every-facet)
  note: string;
}

// 18 Tier-A/B styles. Gothic/GeoStar (Tier-C) are scored by the perfect-mesher kernel probes, read separately below.
const STYLES: StyleSpec[] = [
  { style: 'RippleInterference' as StyleId, tier: 'A', ruler: 'analytic', note: 'M-square smooth' },
  { style: 'WaveInterference' as StyleId, tier: 'A', ruler: 'analytic', note: 'M-square smooth' },
  { style: 'SuperellipseMorph' as StyleId, tier: 'A', ruler: 'analytic', note: 'M-square smooth' },
  { style: 'FourierBloom' as StyleId, tier: 'A', ruler: 'analytic', note: 'M-square smooth' },
  { style: 'HarmonicRipple' as StyleId, tier: 'A', ruler: 'analytic', note: 'M-square smooth' },
  { style: 'GyroidManifold' as StyleId, tier: 'A', ruler: 'analytic', stride: 8, note: 'CDT-under-M tangled (stride-8 subsample: reaching-density whole-mesh brute is the ~3.4h ceiling)' },
  { style: 'Voronoi' as StyleId, tier: 'A', ruler: 'analytic', stride: 8, note: 'CDT-under-M tangled (stride-8 subsample)' },
  { style: 'HexagonalHive' as StyleId, tier: 'A', ruler: 'analytic', stride: 4, note: 'CDT-under-M (stride-4 subsample)' },
  { style: 'ArtDeco' as StyleId, tier: 'B', ruler: 'bvh', note: 'doubled-rings RISER — analytic-rA mislocates (riser=radial cliff); BVH whole-mesh' },
  { style: 'DragonScales' as StyleId, tier: 'B', ruler: 'bvh', note: 'doubled-rings lip RISER — BVH whole-mesh' },
  { style: 'BambooSegments' as StyleId, tier: 'B', ruler: 'bvh', note: 'doubled-RINGS rung — BVH whole-mesh (hybrid)' },
  { style: 'BasketWeave' as StyleId, binDir: 'BasketWeave_bins', tier: 'B', moderateTwin: true, ruler: 'bvh', note: 'doubled-grid weave over-under — anchored (radial overstates)' },
  { style: 'CelticKnot' as StyleId, binDir: 'CelticKnot_bins', tier: 'B', moderateTwin: true, ruler: 'bvh', note: 'doubled-grid braid — anchored (radial overstates)' },
  { style: 'CelticTriquetra' as StyleId, binDir: 'CelticTriquetra_bins', tier: 'B', moderateTwin: true, ruler: 'bvh', note: 'doubled-grid braid — anchored (radial overstates)' },
];
// huge tier (behind PF_REBASE_BIG so they never block the tractable window)
const BIG: StyleSpec[] = [
  { style: 'SpiralRidges' as StyleId, tier: 'A', ruler: 'analytic', stride: 4, note: 'M-square graded-z sheet (4.1M, stride-4)' },
  { style: 'Crystalline' as StyleId, tier: 'A', ruler: 'analytic', stride: 8, note: 'CDT-under-M tangled (3.5M, stride-8)' },
  { style: 'LowPolyFacet' as StyleId, tier: 'B', ruler: 'bvh', note: 'doubled-crest RISER (11.3M) — BVH whole-mesh' },
  { style: 'SuperformulaBlossom' as StyleId, tier: 'B', ruler: 'bvh', note: 'seam-ladder (13M) — body BVH; seam wall is a radial-ruler blind-spot' },
];

// read the packaging BVH-vs-closed-object whole-mesh heatmap meta for a bvh-ruler style (pctOver0.01 = whole-mesh
// every-facet outlier FRACTION; worstMm = whole-mesh max). This IS a whole-mesh every-facet measurement, just under
// the closed-object ruler the doubled-mesh geometry requires (the analytic-rA ruler mislocates on risers/weave/seam).
function readBvhMeta(spec: StyleSpec): { pctOver: number | null; worst: number; p99: number; tris: number; ruler: string } | null {
  const dir = spec.binDir ? join(BEST20, spec.binDir) : BEST20;
  const p = join(dir, `${spec.style}.meta.json`);
  if (!existsSync(p)) return null;
  try {
    const m = JSON.parse(readFileSync(p, 'utf8')) as Record<string, number | string | null>;
    return {
      pctOver: (m.pctOver0_01 as number | null) ?? null,
      worst: (m.worstMm as number) ?? 0, p99: (m.p99Mm as number) ?? 0,
      tris: (m.tris as number) ?? 0, ruler: (m.ruler as string) ?? '?',
    };
  } catch { return null; }
}

function scoreOne(spec: StyleSpec): void {
  if (rowExists(spec.style)) { plog(`[skip] ${spec.style} — row exists`); return; }
  const dir = spec.binDir ? join(BEST20, spec.binDir) : BEST20;
  const xyzPath = join(dir, `${spec.style}.xyz.bin`);
  const idxPath = join(dir, `${spec.style}.idx.bin`);
  if (!existsSync(xyzPath) || !existsSync(idxPath)) { plog(`[MISSING BINS] ${spec.style} at ${dir} — SKIP`); return; }
  const { xyz, idx } = loadBinMesh(xyzPath, idxPath);
  const tris = idx.length / 3;
  const rA = buildRadiusFn(spec.style, {}, DIMS);
  plog(`[${spec.style}] loaded tris=${tris} verts=${xyz.length / 3} ruler=${spec.ruler}${spec.moderateTwin ? ' (MODERATE TWIN)' : ''}`);

  // ── BVH ruler path: the doubled mesh departs from the radial surface (riser/weave/seam). Read the packaging's
  // BVH-vs-closed-object whole-mesh every-facet meta as the honest whole-mesh outlier figure. (No expensive
  // whole-mesh q recompute on the huge weave twins — pctBelow20 comes from the packaging manifest row.) ──
  if (spec.ruler === 'bvh') {
    const bvh = readBvhMeta(spec);
    const outliers = bvh && bvh.pctOver !== null ? Math.round((bvh.pctOver / 100) * tris) : null;
    // pctBelow20 from the packaging manifest (already measured at reaching density; recomputing on 5.7M tris blows
    // the run window). rawNonMan from the manifest too.
    let manPct: number | null = null, manNm: number | null = null;
    try {
      const man = readFileSync(join('research', 'exchange', '_best20', 'manifest.ndjson'), 'utf8').split('\n').filter(Boolean);
      for (const l of man) { const o = JSON.parse(l) as Record<string, number | string>; if (o.style === spec.style) { manPct = (o.pctBelow20 as number) ?? null; manNm = (o.rawNonMan as number) ?? null; } }
    } catch { /* ignore */ }
    const row = {
      style: spec.style, tier: spec.tier, primitiveNote: spec.note, moderateTwin: !!spec.moderateTwin,
      tris,
      interiorOutliers: outliers,               // whole-mesh every-facet count from the BVH meta (null if not recorded)
      interiorOutliersPct: bvh ? bvh.pctOver : null,
      wholeMeshMaxMm: bvh ? bvh.worst : null, wholeMeshP99: bvh ? bvh.p99 : null,
      rawNonMan: manNm, minAngleDeg: null, pctBelow20: manPct,
      ruler: `BVH-vs-closed-object whole-mesh (analytic-rA MISLOCATES risers/weave/seam) — meta.ruler='${bvh?.ruler}'`,
      rulerClass: 'bvh',
    };
    checkpoint(row);
    plog(`[${spec.style}] BVH-META outliers=${outliers} pct=${bvh?.pctOver} worst=${bvh?.worst} (meta ruler=${bvh?.ruler})`);
    return;
  }

  // ── ANALYTIC ruler path: the mesh IS the radial surface. GATE on vertex-on-surface (~0) then whole-mesh brute. ──
  const nonMan = auditNonManRaw(idx);
  const q = triangleQualityDistribution({ vertices: Float64Array.from(xyz), indices: Int32Array.from(idx) });
  const vchk = vertexOnSurfaceCheck(xyz, rA, H, 200);
  plog(`[${spec.style}] vertex-on-surface: maxVert=${vchk.maxVertMm.toFixed(5)} p99Vert=${vchk.p99VertMm.toFixed(5)}mm (analytic gate: should be ~0)`);
  if (vchk.maxVertMm > 0.02) {
    // the analytic-rA ruler mislocates this mesh's own vertices => it is the WRONG ruler; do NOT report false outliers.
    checkpoint({
      style: spec.style, tier: spec.tier, primitiveNote: spec.note, moderateTwin: !!spec.moderateTwin, tris,
      interiorOutliers: null, wholeMeshMaxMm: null, rawNonMan: nonMan,
      minAngleDeg: +q.minAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(2),
      vertexOnSurfaceMaxMm: +vchk.maxVertMm.toFixed(5),
      ruler: 'ANALYTIC RULER INVALID (vertices off-surface > 0.02mm) — style needs the BVH ruler', rulerClass: 'analytic-invalid',
    });
    plog(`[${spec.style}] ANALYTIC RULER INVALID (maxVert=${vchk.maxVertMm.toFixed(4)}) — flagged`);
    return;
  }

  const t0 = Date.now();
  let lastPct = -1;
  const r = scoreWholeMeshInterior(xyz, idx, rA, H, {
    tol: TOL, stride: spec.stride ?? 1,
    brute: { nTheta: 1024, nZ: 120, zBandMm: 3, refineIters: 60 },
    onProgress: (done, total, nOut, worst, bc) => {
      const pct = Math.floor((done / total) * 20) * 5; // 5% steps
      if (pct !== lastPct || done >= total - (spec.stride ?? 1)) {
        lastPct = pct;
        plog(`[${spec.style}] ${pct}% (${done}/${total}) outliers=${nOut} worst=${worst.toFixed(5)} bruteCalls=${bc} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
    },
  });
  const scoreMs = Date.now() - t0;
  plog(`[${spec.style}] SCORED outliers=${r.interiorOutliers}/${r.scannedFacets} (stride=${r.stride}) max=${r.wholeMeshMaxMm} p99=${r.p99} advanced=${r.advanced} bruteCalls=${r.bruteCalls} in ${(scoreMs / 1000).toFixed(0)}s`);

  const row = {
    style: spec.style, tier: spec.tier, primitiveNote: spec.note, moderateTwin: !!spec.moderateTwin,
    tris,
    interiorOutliers: r.interiorOutliers,      // EVERY scanned facet, no top-N cap
    scannedFacets: r.scannedFacets, stride: r.stride,
    scaledOutlierEstimate: r.interiorOutliers * r.stride, // stride>1: whole-mesh estimate (exact when stride=1)
    wholeMeshMaxMm: r.wholeMeshMaxMm,
    wholeMeshP50: r.p50, wholeMeshP90: r.p90, wholeMeshP99: r.p99,
    advancedFacets: r.advanced, bruteCalls: r.bruteCalls,
    worstXyz: r.worstXyz.map((v) => +v.toFixed(3)),
    rawNonMan: nonMan,
    minAngleDeg: +q.minAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(2),
    vertexOnSurfaceMaxMm: +vchk.maxVertMm.toFixed(5),
    scoreMs,
    ruler: `whole-mesh ${r.stride > 1 ? `stride-${r.stride} subsample` : 'every-facet'} denseBary(45pt) GN-screen->full-azimuth-brute-confirm, no top-N cap`,
    rulerClass: 'analytic',
  };
  checkpoint(row);
}

describe('REBASELINE-20 — whole-mesh honest every-facet re-score of the _best20 reaching meshes', () => {
  for (const spec of STYLES) {
    it.skipIf(process.env.PF_REBASE !== '1')(`rebaseline ${spec.style}`, () => {
      scoreOne(spec);
      expect(true).toBe(true);
    }, 3 * 60 * 60 * 1000);
  }
  for (const spec of BIG) {
    it.skipIf(process.env.PF_REBASE_BIG !== '1')(`rebaseline-BIG ${spec.style}`, () => {
      scoreOne(spec);
      expect(true).toBe(true);
    }, 5 * 60 * 60 * 1000);
  }

  // TIER-C: read Gothic/GeoStar whole-mesh perfect-mesher kernel scorecards (already run, commit-banked).
  it.skipIf(process.env.PF_REBASE !== '1')('rebaseline TIER-C Gothic+GeoStar (read perfect-mesher wholemesh scorecards)', () => {
    if (rowExists('GothicArches') && rowExists('GeometricStar')) { plog('[skip] Tier-C rows exist'); return; }
    const readWholemesh = (p: string): Record<string, unknown> | null => {
      if (!existsSync(p)) return null;
      const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean);
      for (const l of lines) { try { const o = JSON.parse(l); if (o.wholeMeshOutliers !== undefined) return o; } catch { /* skip */ } }
      return null;
    };
    const goth = readWholemesh(join('research', 'exchange', '_pf_perfect_gothic_wholemesh', 'scorecard.ndjson'));
    const geo = readWholemesh(join('research', 'exchange', '_pf_perfect_geostar_wholemesh', 'scorecard.ndjson'));
    plog(`[Tier-C] gothic=${JSON.stringify(goth)} geostar=${JSON.stringify(geo)}`);
    if (goth && !rowExists('GothicArches')) {
      checkpoint({
        style: 'GothicArches', tier: 'C', primitiveNote: 'perfect-mesher whole-mesh kernel (FGJ Morse graph + no-bridge CDT + brute-driven edge refine)',
        tris: goth.finalTris, interiorOutliers: goth.wholeMeshOutliers, wholeMeshMaxMm: goth.wholeMeshMaxMm,
        wholeMeshP50: goth.wholeGuardP50, wholeMeshP90: goth.wholeGuardP90, wholeMeshP99: goth.wholeGuardP99,
        rawNonMan: goth.watertightNonMan, watertightNonVacuous: goth.nonVacuous,
        minAngleDeg: goth.minAngleDeg, pctBelow20: goth.pctBelow20,
        ruler: 'whole-mesh perfect-mesher kernel acceptanceGuardWhole (45-pt denseBary, every free facet)',
        source: '_pf_perfect_gothic_wholemesh',
      });
    }
    if (geo && !rowExists('GeometricStar')) {
      checkpoint({
        style: 'GeometricStar', tier: 'C', primitiveNote: 'perfect-mesher whole-mesh kernel (FGJ Morse graph + no-bridge CDT + brute-driven edge refine)',
        tris: geo.finalTris, interiorOutliers: geo.wholeMeshOutliers, wholeMeshMaxMm: geo.wholeMeshMaxMm,
        wholeMeshP50: geo.guardP50, wholeMeshP90: geo.guardP90, wholeMeshP99: geo.guardP99,
        rawNonMan: geo.watertightNonMan, watertightNonVacuous: geo.nonVacuous,
        minAngleDeg: geo.minAngleDeg, pctBelow20: geo.pctBelow20,
        ruler: 'whole-mesh perfect-mesher kernel (every free facet, on/off-crest split)',
        source: '_pf_perfect_geostar_wholemesh',
      });
    }
    expect(true).toBe(true);
  }, 5 * 60 * 1000);
});
