// _perfectPipeline.test.ts — DEV-ONLY (env PF_PERFECT_*=1). FRONTIER ROADMAP spike toward a PERFECT export
// pipeline: a TRUE-3D chord-error heatmap that is PURE GREEN (zero facets > 0.03mm) across all 20 styles, OR an
// honest, LOCALIZED, ADVERSARIALLY-VERIFIED bound where a residual is geometrically irreducible.
//
// Builds ON the settled facts (E-2026-07-01-SWEEP-METRIC-MAP / FRONTIER-BUILD3): the honest ruler is TRUE-3D
// (perpendicular3DDeviation / perFaceTrue3DSag). 5 CLEAN, 9 TAIL (broad-CAD-grade + steep tail), 6 BROAD (bridged
// vertical step/riser/weave discontinuity). This probe SPIKES the levers and MEASURES true-3D before/after:
//   PF_PERFECT_DIAG     — decompose each BROAD style into VERTEX-placement gap vs FACET-bridging gap (the fork:
//                         facet-bridging → step-edge conforming can fix; vertex-placement → EXCLUDE-class, cannot).
//   PF_PERFECT_ARTDECO  — proof-of-concept: inject the ArtDeco riser step edges as mesh CONSTRAINTS; does true-3D
//                         p99/worst go green? render before/after heatmaps.
//   PF_PERFECT_TAIL     — TAIL steep-tail closure: chordSteiner + a COARSE curvatureFineStep sweep (find the knee
//                         where the tail drops without budget blow-up). Per TAIL style: reachable worst/p99 + floor.
//   PF_PERFECT_CUSP     — GothicArches near-C0 arch-tip cusp: PROVE irreducible (localize + freeze) + spike a
//                         micro-rounded cusp rA; count all-green styles at 0.03 / 0.05 / 0.10 / 0.15mm bands.
//   PF_PERFECT_CRYST    — Crystalline nonMan=2 diagnosis (where, why guardManifoldAlways misses it).
//   PF_PERFECT_BROADGEN — generalize step-edge conforming to the remaining BROAD styles (BasketWeave / Bamboo / …).
//
// ISOLATION: NEW file, prefix _perfectPipeline*. CALLS the kernel + committed hooks (injectedPoints/constraintEdges/
// chordSteiner/guardManifoldAlways) + labkit instruments + the analytic step-loci helpers from analyticSurfaceGate.
// Edits NOTHING in src/ or existing research files. Does NOT touch the concurrent green-push files.
//
// RESILIENCE: env-gated blocks; each style/spike CHECKPOINTS to research/exchange/_perfectPipeline/<...>.json the
// instant it is measured; a re-run SKIPS a completed unit. Moderate density for sweeps; hi-density confirm the flagged.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt, buildLocator, featureLineChord3D,
  liftTrue, liftUtToRadial, auditNonManByIndex, perFaceTrue3DSag, perFaceChordSag, dumpHeatmap, dumpRenderBins,
  triangleQualityDistribution, perpendicular3DDeviation, projectPointToRadialSurface,
  type StyleDims, type AnalyticRadiusFn, type FeatureTruth,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { refineLinesToExtremum } from './refineLoci';
import {
  artDecoRiserTBands, basketWeaveCreaseLoci, celticKnotCreasePredicate,
} from '../../src/fidelity/analyticSurfaceGate';
import { DEFAULT_STYLE_PARAMS } from '../../src/geometry/types';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_perfectPipeline');
const SEAM = 0.01, TAU = 2 * Math.PI;
// MODERATE screen density (task-specified ~1-1.5M tris). Matches E-SWEEP-METRIC-MAP so numbers are comparable.
const OPTS = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 1_500_000, splitThresh: 1.5, optimizeSweeps: 2 } as const;
const BARY: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

const pctile = (a: Float64Array | number[], p: number): number => {
  const s = Array.from(a).sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};
const ckpt = (name: string, obj: unknown): void => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${name}.json`), JSON.stringify(obj, null, 2));
};
const done = (name: string): boolean => existsSync(join(DIR, `${name}.json`));
const load = (name: string): any => JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8'));

// ─── shared: build the b2_pin_nolock UNIFIED-MECHANISM mesh (crest-pinned), optionally + step constraint edges ───
interface BuildExtras {
  /** extra injected (u,t) point pairs (flat) to APPEND to the crest skeleton (e.g. step-loci polylines). */
  stepPoints?: number[];
  /** constraint-edge pairs as positions into the COMBINED injected array (crest ++ step). */
  stepConstraintPairs?: number[];
  chordSteiner?: boolean;
  chordTolMm?: number;
  curvatureFineStep?: number;
  curvatureSubsamples?: number;
  overrideRA?: AnalyticRadiusFn;
  maxPoints?: number;
  hMin?: number;
}
function buildUnified(style: StyleId, extra: BuildExtras = {}): {
  ut: number[]; idx: number[]; vtx: Float64Array; xyz: Float32Array; nonMan: number; tris: number;
  rA: AnalyticRadiusFn; injectedCount: number; constraint?: unknown; hitBudget: boolean;
} {
  const rA = extra.overrideRA ?? buildRadiusFn(style, {}, DIMS);
  const truth = buildFeatureTruth(style, {}, DIMS, 384);
  const refined = refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6);
  const pslg = planarizeSegments(segmentsFromLines(refined, SEAM));
  // combine crest points (pinned) with step points; step constraint pairs index into the combined array.
  const crest = pslg.points;
  const nCrest = crest.length / 2;
  const injected = extra.stepPoints ? crest.concat(extra.stepPoints) : crest;
  // shift step constraint pair positions by nCrest (they were expressed as positions into stepPoints)
  const constraintEdges = extra.stepConstraintPairs
    ? extra.stepConstraintPairs.map((p) => p + nCrest)
    : undefined;
  const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
    ...OPTS,
    ...(extra.maxPoints !== undefined ? { maxPoints: extra.maxPoints } : {}),
    ...(extra.hMin !== undefined ? { hMin: extra.hMin } : {}),
    guardManifoldAlways: true,
    injectedPoints: injected,
    pinInjected: true,
    ...(constraintEdges ? { constraintEdges, guardRecoveryManifold: true } : {}),
    ...(extra.chordSteiner ? { chordSteiner: true } : {}),
    ...(extra.chordTolMm !== undefined ? { chordTolMm: extra.chordTolMm } : {}),
    ...(extra.curvatureFineStep !== undefined ? { curvatureFineStep: extra.curvatureFineStep } : {}),
    ...(extra.curvatureSubsamples !== undefined ? { curvatureSubsamples: extra.curvatureSubsamples } : {}),
  });
  const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
  const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
  const vtx = liftUtToRadial(ut, rA, DIMS.H).vertices;
  const nonMan = auditNonManByIndex(meshUt.xyz, idx);
  return { ut, idx, vtx, xyz: meshUt.xyz, nonMan, tris: idx.length / 3, rA, injectedCount: injected.length / 2, constraint: mesh.constraint, hitBudget: mesh.hitBudget };
}

// ─── shared: TRUE-3D measurement (seam-excluded), matches E-SWEEP-METRIC-MAP ───
function measureTrue3D(ut: number[], idx: number[], vtx: Float64Array, rA: AnalyticRadiusFn): {
  chordMaxMm: number; p99DevMm: number; vertexMaxMm: number; pctOver0_03: number; worst: { theta: number; z: number; mm: number };
} {
  const nV = ut.length / 2;
  const ut3 = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { ut3[3 * i] = ut[2 * i]; ut3[3 * i + 1] = ut[2 * i + 1]; ut3[3 * i + 2] = 0; }
  const p3 = perpendicular3DDeviation({ vertices: vtx, indices: Uint32Array.from(idx) }, ut3, rA, { H: DIMS.H, tolMm: 0.03, seamExclU: SEAM, collectAboveTol: 30 });
  // pctOver0.03 via perFaceTrue3DSag (facet-level, matches the heatmap green definition)
  const sag = perFaceTrue3DSag(ut, idx, rA, DIMS.H, { preFilterMm: 0.02 });
  return { chordMaxMm: p3.chordMaxMm, p99DevMm: p3.p99DevMm, vertexMaxMm: p3.vertexMaxMm, pctOver0_03: 100 * sag.fracOver(0.03), worst: p3.worst };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 1 — DIAG: decompose each BROAD style into VERTEX-placement gap vs FACET-bridging gap.
//   The fork the roadmap hinges on: a HIGH vertexMax (mesh vertices themselves off-surface) = EXCLUDE-class
//   (occlusion/weave two-valued; step-edge conforming CANNOT help). A ~0 vertexMax with high facet chordMax =
//   the facet BRIDGES a vertical step between correctly-placed vertices → step-edge conforming CAN fix it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
const BROAD: StyleId[] = ['ArtDeco', 'BasketWeave', 'BambooSegments', 'DragonScales', 'CelticKnot', 'LowPolyFacet'];

describe('PERFECT-PIPELINE DIAG — vertex-placement vs facet-bridging decomposition (BROAD)', () => {
  it.skipIf(process.env.PF_PERFECT_DIAG !== '1')('decomposes each BROAD style (resumable)', () => {
    mkdirSync(DIR, { recursive: true });
    for (const style of BROAD) {
      const tag = `diag_${style}`;
      if (done(tag)) { console.log(`SKIP ${tag}`); continue; }
      console.log(`RUN  ${tag} ...`);
      const b = buildUnified(style);
      const nV = b.ut.length / 2, nF = b.idx.length / 3;
      // CHEAP honest decomposition (no O(nV) full projection):
      //   perFaceTrue3DSag → the worst FACETS. For the top-K worst facets, project EACH of their 3 vertices
      //   (perpendicular projMm) AND compute each vertex's radial-at-own-(u,t) residual.
      //   • projMm≈0 with a big FACET chordMax ⇒ vertices ON the single-valued surface, facet BRIDGES a vertical
      //     wall between them ⇒ FACET-BRIDGING class ⇒ step-edge conforming can help.
      //   • projMm large ⇒ the vertex itself is off the true surface ⇒ occlusion/two-valued ⇒ EXCLUDE-class.
      //   (radial-at-own-(u,t) is UNRELIABLE exactly AT a C0 step — it flips across the discontinuity — so the
      //    HONEST signal is projMm, the perpendicular distance.)
      const sag = perFaceTrue3DSag(b.ut, b.idx, b.rA, DIMS.H, { preFilterMm: 0.02 });
      const order = Array.from({ length: nF }, (_, f) => f).sort((x, y) => sag.faceErr[y] - sag.faceErr[x]).slice(0, 40);
      let maxVertProj = 0, maxFacetSag = 0; const rows: any[] = [];
      for (const f of order) {
        if (sag.faceErr[f] > maxFacetSag) maxFacetSag = sag.faceErr[f];
        const vids = [b.idx[3 * f], b.idx[3 * f + 1], b.idx[3 * f + 2]];
        let vpMax = 0, ru = 0, rt = 0;
        for (const vi of vids) {
          const x = b.vtx[3 * vi], y = b.vtx[3 * vi + 1], z = b.vtx[3 * vi + 2];
          const d = projectPointToRadialSurface(x, y, z, b.rA).dist;
          if (d > vpMax) { vpMax = d; ru = b.ut[2 * vi]; rt = b.ut[2 * vi + 1]; }
        }
        if (vpMax > maxVertProj) maxVertProj = vpMax;
        rows.push({ f, facetSag: sag.faceErr[f], worstVertProj: vpMax, u: ru, t: rt });
      }
      const cls = maxVertProj < 0.05
        ? 'FACET-BRIDGING (vertices on-surface projMm<0.05, facet bridges a vertical wall) ⇒ step-edge conforming CAN help'
        : 'VERTEX-PLACEMENT (worst-facet vertices themselves off-surface projMm≥0.05) ⇒ occlusion/two-valued EXCLUDE-class';
      const rec = {
        style, tris: b.tris, nonMan: b.nonMan, nV,
        worstFacetSagMm: maxFacetSag, worstFacetVertexProjMm: maxVertProj,
        topFacets: rows.slice(0, 8),
        class: cls,
      };
      ckpt(tag, rec);
      console.log(`DONE ${style.padEnd(14)} tris=${b.tris} nonMan=${b.nonMan} worstFacetSag=${maxFacetSag.toFixed(3)} worstFacetVertexProj=${maxVertProj.toFixed(4)} => ${cls.split('⇒')[1] ?? ''}`);
    }
    expect(BROAD.length).toBe(6);
  }, 60 * 60 * 1000);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 2 — ARTDECO step-edge conforming proof-of-concept.
//   Inject a dense constant-t polyline at each riser band edge (artDecoRiserTBands), emit consecutive pairs as
//   constraint edges → a mesh edge FOLLOWS the riser so no facet bridges the ~3.4mm vertical jump.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
function ringPolyline(tBand: number, nU: number): { pts: number[]; pairs: number[] } {
  const pts: number[] = []; const pairs: number[] = [];
  for (let i = 0; i < nU; i++) { pts.push(i / nU, tBand); }
  for (let i = 0; i < nU; i++) { pairs.push(i, (i + 1) % nU); } // closed ring (wraps u)
  return { pts, pairs };
}

describe('PERFECT-PIPELINE ARTDECO — riser step-edge conforming (proof of concept)', () => {
  it.skipIf(process.env.PF_PERFECT_ARTDECO !== '1')('injects riser constraint rings; measures true-3D before/after', () => {
    mkdirSync(DIR, { recursive: true });
    const style: StyleId = 'ArtDeco';
    const params = DEFAULT_STYLE_PARAMS[style] as { adStepCount: number };
    const tBands = artDecoRiserTBands(params.adStepCount);
    // BEFORE
    let before = done('artdeco_before') ? load('artdeco_before') : null;
    if (!before) {
      const b0 = buildUnified(style);
      const m0 = measureTrue3D(b0.ut, b0.idx, b0.vtx, b0.rA);
      dumpHeatmap(DIR, 'ArtDeco_before_true3d', b0.xyz, b0.ut, b0.idx, b0.rA, DIMS.H, { meta: { label: 'ArtDeco crest-only (before)' } });
      before = { tris: b0.tris, nonMan: b0.nonMan, ...m0 };
      ckpt('artdeco_before', before);
      console.log(`BEFORE tris=${b0.tris} nonMan=${b0.nonMan} chordMax=${m0.chordMaxMm.toFixed(3)} p99=${m0.p99DevMm.toFixed(3)} %>0.03=${m0.pctOver0_03.toFixed(2)}`);
    }
    // AFTER — the wall is a HARD vertical radius JUMP (measured: r 43.29 -> 47.06 = 3.79mm over ~0 t at t=0.775).
    // A SINGLE constraint ring AT the jump-t is a NO-OP (refuted, artdeco_after_singlering): the surface radius is
    // ambiguous exactly at the jump and the facets on either side still bridge half the wall. The fix is a DOUBLE
    // RING straddling the jump at t=jump±delta with delta TINY: this pins mesh edges at BOTH the top (full r) and
    // bottom (stepped r) of the wall, so the wall becomes a thin near-vertical facet strip whose chord sag -> 0 as
    // delta -> 0. Sweep delta to find the width where the strip is green.
    const nU = 720;
    const deltas = [5e-4, 1e-4, 2e-5];
    const results: any[] = [];
    for (const delta of deltas) {
      const tag = `artdeco_double_d${delta}`;
      if (done(tag)) { results.push(load(tag)); console.log(`SKIP ${tag}`); continue; }
      let stepPoints: number[] = []; let stepPairs: number[] = []; let off = 0;
      for (const tb of tBands) {
        for (const side of [tb - delta, tb + delta]) {
          const tClamp = Math.min(1 - 1e-4, Math.max(1e-4, side));
          const { pts, pairs } = ringPolyline(tClamp, nU);
          stepPoints = stepPoints.concat(pts);
          stepPairs = stepPairs.concat(pairs.map((p) => p + off));
          off += nU;
        }
      }
      const b1 = buildUnified(style, { stepPoints, stepConstraintPairs: stepPairs });
      const m1 = measureTrue3D(b1.ut, b1.idx, b1.vtx, b1.rA);
      const q1 = triangleQualityDistribution({ vertices: b1.vtx, indices: Uint32Array.from(b1.idx) });
      if (delta === deltas[deltas.length - 1]) {
        dumpHeatmap(DIR, 'ArtDeco_after_true3d', b1.xyz, b1.ut, b1.idx, b1.rA, DIMS.H, { meta: { label: `ArtDeco riser double-ring d=${delta} (after)` } });
      }
      const rec = { delta, tBands, nU, tris: b1.tris, nonMan: b1.nonMan, injected: b1.injectedCount, constraint: b1.constraint, minAngleDeg: q1.minAngleDeg, pctBelow20: q1.pctBelow20, ...m1 };
      ckpt(tag, rec);
      results.push(rec);
      console.log(`AFTER d=${delta} tris=${b1.tris} nonMan=${b1.nonMan} recov=${JSON.stringify(b1.constraint)} chordMax=${m1.chordMaxMm.toFixed(3)} p99=${m1.p99DevMm.toFixed(3)} %>0.03=${m1.pctOver0_03.toFixed(3)} minA=${q1.minAngleDeg.toFixed(1)}`);
    }
    ckpt('artdeco_after', { approach: 'double-ring sweep', results });
    expect(tBands.length).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});

// BLOCK 2b — ARTDECO WALL DIAGNOSTIC: why the double-ring did not green. Build at delta, then for the worst
//   perFaceTrue3DSag facets report their t-span + the two ring t's straddled, and whether a facet spans BOTH
//   rings (bridges the wall) — i.e. did the locked constraint edges actually stop the bridging facet, or does the
//   mesher still lay a big facet across the jump because the constrained ring vertices are too sparse in u / the
//   recovery left gaps / a facet with all 3 verts on ONE side of the jump still chords the tread corner?
describe('PERFECT-PIPELINE ARTDECO-DIAG — why double-ring underperforms', () => {
  it.skipIf(process.env.PF_PERFECT_ARTDIAG !== '1')('localizes the surviving bridging facets', () => {
    mkdirSync(DIR, { recursive: true });
    const style: StyleId = 'ArtDeco';
    const delta = Number(process.env.PF_ARTDIAG_DELTA ?? 1e-4);
    const params = DEFAULT_STYLE_PARAMS[style] as { adStepCount: number };
    const tBands = artDecoRiserTBands(params.adStepCount);
    const nU = 720;
    let stepPoints: number[] = []; let stepPairs: number[] = []; let off = 0;
    for (const tb of tBands) for (const side of [tb - delta, tb + delta]) {
      const tClamp = Math.min(1 - 1e-4, Math.max(1e-4, side));
      const { pts, pairs } = ringPolyline(tClamp, nU);
      stepPoints = stepPoints.concat(pts); stepPairs = stepPairs.concat(pairs.map((p) => p + off)); off += nU;
    }
    const b = buildUnified(style, { stepPoints, stepConstraintPairs: stepPairs });
    const sag = perFaceTrue3DSag(b.ut, b.idx, b.rA, DIMS.H, { preFilterMm: 0.02 });
    const nF = b.idx.length / 3;
    const order = Array.from({ length: nF }, (_, f) => f).sort((x, y) => sag.faceErr[y] - sag.faceErr[x]).slice(0, 30);
    const rows = order.map((f) => {
      const a = b.idx[3 * f], bb = b.idx[3 * f + 1], c = b.idx[3 * f + 2];
      const ts = [b.ut[2 * a + 1], b.ut[2 * bb + 1], b.ut[2 * c + 1]];
      const us = [b.ut[2 * a], b.ut[2 * bb], b.ut[2 * c]];
      const rs = [Math.hypot(b.vtx[3 * a], b.vtx[3 * a + 1]), Math.hypot(b.vtx[3 * bb], b.vtx[3 * bb + 1]), Math.hypot(b.vtx[3 * c], b.vtx[3 * c + 1])];
      const tMin = Math.min(...ts), tMax = Math.max(...ts);
      // which band does this facet straddle?
      const band = tBands.find((tb) => tb > tMin - 0.02 && tb < tMax + 0.02);
      return { f, sag: sag.faceErr[f], tSpan: [tMin, tMax], tExtent: tMax - tMin, uExtent: Math.max(...us) - Math.min(...us), rSpan: [Math.min(...rs), Math.max(...rs)], nearBand: band ?? null };
    });
    ckpt(`artdiag_d${delta}`, { style, delta, tBands, tris: b.tris, constraint: b.constraint, worstFacetSag: sag.worstMm, pctOver0_03: 100 * sag.fracOver(0.03), rows: rows.slice(0, 12) });
    console.log(`ARTDIAG d=${delta} worstSag=${sag.worstMm.toFixed(3)} %>0.03=${(100 * sag.fracOver(0.03)).toFixed(3)}`);
    for (const r of rows.slice(0, 8)) console.log(`  sag=${r.sag.toFixed(3)} tSpan=[${r.tSpan[0].toFixed(5)},${r.tSpan[1].toFixed(5)}] tExt=${r.tExtent.toExponential(2)} rSpan=[${r.rSpan[0].toFixed(2)},${r.rSpan[1].toFixed(2)}] band=${r.nearBand}`);
    expect(b.tris).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 2c — CLIFF-EXCLUDED GREEN (the reframe): the BROAD gap is a C0 RADIUS CLIFF (measured: ArtDeco 4.1mm jump
//   over ~0 t at t=0.975; NO analytic surface exists in the annular gap ⇒ a bridging facet is intrinsically
//   ~cliff/2 from the sheet, IRREDUCIBLE for a single-valued (u,t) mesh; the tread facet is CORRECT physical
//   step geometry that `perFaceTrue3DSag` cannot score because r(θ,z) has no tread). Honest green = EXCLUDE the
//   cliff facets. A facet is a CLIFF facet (style-AGNOSTIC detector) if the radius varies across its (u,t)
//   footprint far faster than a smooth relief would — probe r at a fine sub-facet grid and flag a jump
//   > cliffJumpMm within the footprint. Report %>0.03 among the NON-cliff facets + the cliff-facet count/fraction.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
/** Is facet f a C0-cliff facet? Probe r(θ,z) at a fine grid inside the facet's (u,t) footprint; flag if the
 *  radius RANGE exceeds cliffJumpMm AND the max single-step jump between adjacent probes is > 0.5·cliffJumpMm
 *  (a smooth steep relief ramps; a C0 cliff jumps between two adjacent probes). Style-agnostic. */
function isCliffFacet(ut: number[], idx: number[], f: number, rA: AnalyticRadiusFn, H: number, cliffJumpMm = 0.5): boolean {
  const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
  let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
  if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
  const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
  const uMin = Math.min(ua, ub, uc), uMax = Math.max(ua, ub, uc);
  const tMin = Math.min(ta, tb, tc), tMax = Math.max(ta, tb, tc);
  // Sample r on a fine REGULAR (u,t) grid over the facet's bounding box (padded), then look for a large
  // single-STEP jump between ADJACENT grid nodes in either u or t. A smooth (even steep) relief ramps → adjacent
  // steps small; a C0 radius cliff jumps > 0.5·cliffJumpMm between two adjacent probes. Style-agnostic, direction-
  // agnostic (catches constant-u strand walls AND constant-t risers AND diagonal knot ribbons).
  const M = 16, padU = (uMax - uMin) * 0.15 + 1e-4, padT = (tMax - tMin) * 0.15 + 1e-4;
  const u0 = uMin - padU, u1 = uMax + padU, t0 = Math.max(0, tMin - padT), t1 = Math.min(1, tMax + padT);
  const R: number[][] = [];
  for (let i = 0; i <= M; i++) { const row: number[] = []; const u = u0 + (u1 - u0) * (i / M); for (let j = 0; j <= M; j++) { const t = t0 + (t1 - t0) * (j / M); row.push(rA(TAU * u, t * H)); } R.push(row); }
  let maxStep = 0;
  for (let i = 0; i <= M; i++) for (let j = 0; j <= M; j++) {
    if (i < M) { const s = Math.abs(R[i + 1][j] - R[i][j]); if (s > maxStep) maxStep = s; }
    if (j < M) { const s = Math.abs(R[i][j + 1] - R[i][j]); if (s > maxStep) maxStep = s; }
  }
  return maxStep > 0.5 * cliffJumpMm;
}

describe('PERFECT-PIPELINE CLIFF-GREEN — cliff-excluded honest green for BROAD styles', () => {
  it.skipIf(process.env.PF_PERFECT_CLIFFGREEN !== '1')('measures %>0.03 among non-cliff facets (resumable)', () => {
    mkdirSync(DIR, { recursive: true });
    // ONLY can name ANY style (not just BROAD) — used to test whether a TAIL STALL (Gyroid/CelticTriquetra) is
    // cliff-driven too. Builds crest-only + chordSteiner@0.01 so the tail is the steiner-converged mesh.
    const only = (process.env.PF_PERFECT_CLIFFGREEN_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean) as StyleId[];
    const todo: StyleId[] = only.length ? only : BROAD;
    const useSteiner = process.env.PF_CLIFFGREEN_STEINER === '1';
    for (const style of todo) {
      const tag = `cliffgreen_${style}`;
      if (done(tag)) { console.log(`SKIP ${tag}`); continue; }
      console.log(`RUN  ${tag} ...`);
      const b = buildUnified(style, useSteiner ? { chordSteiner: true, chordTolMm: 0.01, maxPoints: 2_500_000 } : {});
      const sag = perFaceTrue3DSag(b.ut, b.idx, b.rA, DIMS.H, { preFilterMm: 0.02 });
      const nF = b.idx.length / 3;
      // classify facets: only test the ones over 0.03 (green facets are trivially non-cliff)
      let overAll = 0, overCliff = 0, overNonCliff = 0, worstNonCliff = 0, cliffFacets = 0;
      const nonCliffSags: number[] = [];
      for (let f = 0; f < nF; f++) {
        const e = sag.faceErr[f];
        if (e > 0.03) {
          overAll++;
          if (isCliffFacet(b.ut, b.idx, f, b.rA, DIMS.H)) { overCliff++; cliffFacets++; }
          else { overNonCliff++; if (e > worstNonCliff) worstNonCliff = e; nonCliffSags.push(e); }
        }
      }
      const rec = {
        style, tris: nF, worstAllMm: sag.worstMm,
        pctOver0_03_all: 100 * overAll / nF,
        over0_03_cliff: overCliff, over0_03_nonCliff: overNonCliff,
        pctOver0_03_nonCliff: 100 * overNonCliff / nF,
        worstNonCliffMm: worstNonCliff,
        p99NonCliffOverMm: nonCliffSags.length ? pctile(nonCliffSags, 0.99) : 0,
        interpretation: overNonCliff === 0
          ? 'ALL over-tol facets are C0 CLIFF facets (correct physical steps) ⇒ heatmap is PURE GREEN once cliffs excluded'
          : `${overNonCliff} non-cliff facets remain over-tol (worst ${worstNonCliff.toFixed(3)}) ⇒ residual under-tess beyond the cliff`,
      };
      ckpt(tag, rec);
      console.log(`DONE ${style.padEnd(14)} over0.03: all=${overAll} cliff=${overCliff} nonCliff=${overNonCliff} worstNonCliff=${worstNonCliff.toFixed(4)} => ${rec.interpretation}`);
    }
    expect(todo.length).toBeGreaterThan(0);
  }, 2 * 60 * 60 * 1000);
});

// BLOCK 2d — CLIFF-ADJACENCY: are the residual "nonCliff" over-tol facets genuine under-tess, or cliff-ADJACENT
//   facets (footprint grazes the cliff so the tight detector box misses it, but a WIDER box catches the jump)?
//   For the worst nonCliff facets, report maxStep at tight vs WIDE box + whether ANY vertex is within the cliff
//   band. Cliff-adjacent (wide box catches it) ⇒ IRREDUCIBLE (same C0 gap). Genuine ⇒ residual under-tess.
function facetMaxStepWide(ut: number[], idx: number[], f: number, rA: AnalyticRadiusFn, H: number, padFactor: number): number {
  const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
  let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
  if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
  const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
  const uMin = Math.min(ua, ub, uc), uMax = Math.max(ua, ub, uc), tMin = Math.min(ta, tb, tc), tMax = Math.max(ta, tb, tc);
  const eU = Math.max(uMax - uMin, 1e-4), eT = Math.max(tMax - tMin, 1e-4);
  const M = 20, padU = eU * padFactor, padT = eT * padFactor;
  const u0 = uMin - padU, u1 = uMax + padU, t0 = Math.max(0, tMin - padT), t1 = Math.min(1, tMax + padT);
  const R: number[][] = [];
  for (let i = 0; i <= M; i++) { const row: number[] = []; const u = u0 + (u1 - u0) * (i / M); for (let j = 0; j <= M; j++) { const t = t0 + (t1 - t0) * (j / M); row.push(rA(TAU * u, t * H)); } R.push(row); }
  let ms = 0;
  for (let i = 0; i <= M; i++) for (let j = 0; j <= M; j++) { if (i < M) { const s = Math.abs(R[i + 1][j] - R[i][j]); if (s > ms) ms = s; } if (j < M) { const s = Math.abs(R[i][j + 1] - R[i][j]); if (s > ms) ms = s; } }
  return ms;
}

describe('PERFECT-PIPELINE CLIFF-ADJ — residual nonCliff facets: adjacency vs genuine', () => {
  it.skipIf(process.env.PF_PERFECT_CLIFFADJ !== '1')('classifies residual nonCliff over-tol facets (resumable)', () => {
    mkdirSync(DIR, { recursive: true });
    const only = (process.env.PF_PERFECT_CLIFFADJ_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const todo = only.length ? BROAD.filter((s) => only.includes(s)) : BROAD;
    for (const style of todo) {
      const tag = `cliffadj_${style}`;
      if (done(tag)) { console.log(`SKIP ${tag}`); continue; }
      console.log(`RUN  ${tag} ...`);
      const b = buildUnified(style);
      const sag = perFaceTrue3DSag(b.ut, b.idx, b.rA, DIMS.H, { preFilterMm: 0.02 });
      const nF = b.idx.length / 3;
      // collect nonCliff (tight-box) over-tol facets
      const nonCliff: number[] = [];
      for (let f = 0; f < nF; f++) if (sag.faceErr[f] > 0.03 && !isCliffFacet(b.ut, b.idx, f, b.rA, DIMS.H)) nonCliff.push(f);
      nonCliff.sort((x, y) => sag.faceErr[y] - sag.faceErr[x]);
      // re-classify with a WIDE box (padFactor 4) — catches cliff-adjacent facets whose tight box grazed the jump
      let wideCliff = 0, stillGenuine = 0, worstGenuine = 0;
      const genuineRows: any[] = [];
      for (const f of nonCliff) {
        const wide = facetMaxStepWide(b.ut, b.idx, f, b.rA, DIMS.H, 4);
        if (wide > 0.25) { wideCliff++; } else {
          stillGenuine++; if (sag.faceErr[f] > worstGenuine) worstGenuine = sag.faceErr[f];
          if (genuineRows.length < 10) { const a = b.idx[3 * f]; genuineRows.push({ sag: sag.faceErr[f], u: b.ut[2 * a], t: b.ut[2 * a + 1], wideMaxStep: wide }); }
        }
      }
      const rec = {
        style, tris: nF, nonCliffTight: nonCliff.length, wideCliff, stillGenuine, worstGenuineMm: worstGenuine,
        genuineRows,
        interpretation: stillGenuine === 0
          ? 'ALL residual nonCliff facets are cliff-ADJACENT (wide box catches the jump) ⇒ same IRREDUCIBLE C0 gap'
          : `${stillGenuine} GENUINE non-cliff over-tol facets (worst ${worstGenuine.toFixed(3)}) ⇒ real under-tess/curved-cliff`,
      };
      ckpt(tag, rec);
      console.log(`DONE ${style.padEnd(14)} nonCliffTight=${nonCliff.length} wideCliff=${wideCliff} stillGenuine=${stillGenuine} worstGenuine=${worstGenuine.toFixed(4)} => ${rec.interpretation}`);
    }
    expect(todo.length).toBeGreaterThan(0);
  }, 2 * 60 * 60 * 1000);
});

// BLOCK 2e — CLIFF-EXCLUDED HEATMAP RENDER: colour cliff facets GREY (designed C0 step, excluded from the green
//   metric) and the rest by true-3D sag. Proves the roadmap heatmap: PURE GREEN except the greyed designed steps.
describe('PERFECT-PIPELINE CLIFF-RENDER — cliff-excluded heatmap for the roadmap proof', () => {
  it.skipIf(process.env.PF_PERFECT_CLIFFRENDER !== '1')('renders a cliff-greyed true-3D heatmap', () => {
    mkdirSync(DIR, { recursive: true });
    const style = (process.env.PF_CLIFFRENDER_STYLE ?? 'ArtDeco') as StyleId;
    const b = buildUnified(style);
    const sag = perFaceTrue3DSag(b.ut, b.idx, b.rA, DIMS.H, { preFilterMm: 0.02 });
    const nF = b.idx.length / 3, nV = b.vtx.length / 3;
    // per-vertex colour: cliff facets -> grey; else true-3D sag ramp (green->yellow->red @0.15).
    // COST: classify ONLY the over-0.03 facets (a green facet is trivially non-cliff) — the tight+wide cliff
    // probes are ~400 rA evals each, so restricting to the over-tol set (a few %) keeps this fast.
    const col = new Float32Array(nV * 3);
    const GREY: [number, number, number] = [0.55, 0.55, 0.6];
    const cliffVert = new Uint8Array(nV);
    let excluded = 0, worstNonCliff = 0, overNonCliff = 0;
    for (let f = 0; f < nF; f++) {
      if (sag.faceErr[f] <= 0.03) continue;
      const cliff = isCliffFacet(b.ut, b.idx, f, b.rA, DIMS.H) || facetMaxStepWide(b.ut, b.idx, f, b.rA, DIMS.H, 4) > 0.25;
      if (cliff) { excluded++; cliffVert[b.idx[3 * f]] = 1; cliffVert[b.idx[3 * f + 1]] = 1; cliffVert[b.idx[3 * f + 2]] = 1; }
      else { overNonCliff++; if (sag.faceErr[f] > worstNonCliff) worstNonCliff = sag.faceErr[f]; }
    }
    const ramp = (e: number): [number, number, number] => {
      const c = Math.max(0, Math.min(1, e / 0.15));
      const L = (a: number, z: number, k: number): number => a + (z - a) * k;
      const G: [number, number, number] = [0.13, 0.62, 0.23], Y: [number, number, number] = [0.98, 0.82, 0.10], R: [number, number, number] = [0.86, 0.13, 0.13];
      if (c < 0.5) { const k = c / 0.5; return [L(G[0], Y[0], k), L(G[1], Y[1], k), L(G[2], Y[2], k)]; }
      const k = (c - 0.5) / 0.5; return [L(Y[0], R[0], k), L(Y[1], R[1], k), L(Y[2], R[2], k)];
    };
    for (let v = 0; v < nV; v++) {
      const [r, g, bl] = cliffVert[v] ? GREY : ramp(sag.vertErr[v]);
      col[3 * v] = r; col[3 * v + 1] = g; col[3 * v + 2] = bl;
    }
    dumpRenderBins(DIR, `${style}_cliffExcluded`, b.xyz, b.idx, {
      colors: col,
      meta: { ruler: 'true3d (cliff-excluded)', worstMm: worstNonCliff, p99Mm: worstNonCliff, pctOver0_03: 100 * overNonCliff / nF, cliffFacetsExcluded: excluded, note: 'grey = designed C0 cliff/step (correct, unscoreable by analytic sheet)' },
    });
    ckpt(`cliffrender_${style}`, { style, tris: nF, cliffFacetsExcluded: excluded, overNonCliff, worstNonCliffMm: worstNonCliff });
    console.log(`CLIFFRENDER ${style} excluded=${excluded} overNonCliff=${overNonCliff} worstNonCliff=${worstNonCliff.toFixed(4)}`);
    expect(nF).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 3 — TAIL steep-tail closure. chordSteiner + a COARSE curvatureFineStep sweep. Per TAIL style: reachable
//   worst/p99/%>0.03 and the irreducible floor. Start with GothicArches / GyroidManifold / Voronoi.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
const TAIL_PROBE: StyleId[] = ['GothicArches', 'GyroidManifold', 'Voronoi', 'CelticTriquetra', 'Crystalline', 'GeometricStar', 'HexagonalHive', 'SpiralRidges', 'SuperformulaBlossom'];

describe('PERFECT-PIPELINE TAIL — steep-tail closure sweep', () => {
  it.skipIf(process.env.PF_PERFECT_TAIL !== '1')('chordSteiner + coarse curvatureFineStep sweep (resumable)', () => {
    mkdirSync(DIR, { recursive: true });
    const only = (process.env.PF_PERFECT_TAIL_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const todo = only.length ? TAIL_PROBE.filter((s) => only.includes(s)) : TAIL_PROBE;
    // recipes: A=crest-only baseline, B=chordSteiner@0.02, C=chordSteiner@0.01, D=chordSteiner+curvFine 1/512.
    // D is REFUTED on GothicArches (bloats to the 5M cap AND regresses chordMax vs C — see BLOCK 3 registry) so it
    // is GATED behind PF_PERFECT_TAIL_D=1 (kept for the GothicArches evidence; not re-run for every style).
    const recipes: { tag: string; extra: BuildExtras }[] = [
      { tag: 'A_base', extra: {} },
      { tag: 'B_steiner02', extra: { chordSteiner: true, chordTolMm: 0.02 } },
      { tag: 'C_steiner01', extra: { chordSteiner: true, chordTolMm: 0.01, maxPoints: 2_500_000 } },
      ...(process.env.PF_PERFECT_TAIL_D === '1' ? [{ tag: 'D_steiner_cf512', extra: { chordSteiner: true, chordTolMm: 0.01, curvatureFineStep: 1 / 512, curvatureSubsamples: 2, maxPoints: 2_500_000 } as BuildExtras }] : []),
    ];
    for (const style of todo) {
      for (const rec of recipes) {
        const tag = `tail_${style}_${rec.tag}`;
        if (done(tag)) { console.log(`SKIP ${tag}`); continue; }
        console.log(`RUN  ${tag} ...`);
        const t0 = Date.now();
        let out: unknown;
        try {
          const b = buildUnified(style, rec.extra);
          const m = measureTrue3D(b.ut, b.idx, b.vtx, b.rA);
          out = { style, recipe: rec.tag, tris: b.tris, nonMan: b.nonMan, hitBudget: b.hitBudget, timeMs: Date.now() - t0, ...m };
          console.log(`DONE ${tag.padEnd(34)} tris=${String(b.tris).padStart(8)} nonMan=${b.nonMan} budget=${b.hitBudget} chordMax=${m.chordMaxMm.toFixed(4)} p99=${m.p99DevMm.toFixed(4)} %>0.03=${m.pctOver0_03.toFixed(3)}`);
        } catch (e: unknown) {
          out = { style, recipe: rec.tag, error: String((e as Error)?.message ?? e), failed: true };
          console.log(`FAIL ${tag}: ${(e as Error)?.message}`);
        }
        ckpt(tag, out);
      }
    }
    expect(todo.length).toBeGreaterThan(0);
  }, 4 * 60 * 60 * 1000);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 4 — CUSP: GothicArches arch-tip near-C0 cusp. PROVE irreducible (localize + freeze across density) and
//   spike a MICRO-ROUNDED cusp rA (smoothing the near-vertical tip to single-valued) → does true-3D worst drop
//   below 0.03? Also: green-band census — how many of the 20 styles are ALL-GREEN at 0.03/0.05/0.10/0.15mm.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
describe('PERFECT-PIPELINE CUSP — GothicArches irreducible-cusp proof + micro-round spike', () => {
  it.skipIf(process.env.PF_PERFECT_CUSP !== '1')('localizes the cusp, freezes it, spikes a rounded rA (resumable)', () => {
    mkdirSync(DIR, { recursive: true });
    const style: StyleId = 'GothicArches';
    const rABase = buildRadiusFn(style, {}, DIMS);
    // MODERATE budget (1M) — the cusp worst is a LOCAL steep facet, visible at moderate density; the 2.5M builds
    // blew past the environment's kill window (4 sequential rounded builds, each rounded-rA is ~9× slower).
    const MAXP = 1_000_000;
    // MICRO-ROUND: low-pass filter the arch tip in z (9-tap boxcar over ±roundMm) → single-valued smooth cusp.
    const makeRounded = (roundMm: number): AnalyticRadiusFn => (theta: number, zz: number): number => {
      let s = 0; const N = 4;
      for (let k = -N; k <= N; k++) s += rABase(theta, zz + (k / N) * roundMm);
      return s / (2 * N + 1);
    };
    // BASE (sharp) — checkpoint separately so it is not re-run if a later rounded build is killed.
    if (!done('cusp_base_sharp')) {
      const b = buildUnified(style, { chordSteiner: true, chordTolMm: 0.01, maxPoints: MAXP });
      const m = measureTrue3D(b.ut, b.idx, b.vtx, rABase);
      const sag = perFaceTrue3DSag(b.ut, b.idx, rABase, DIMS.H, { preFilterMm: 0.02 });
      let wf = -1, wmx = 0;
      for (let f = 0; f < sag.faceErr.length; f++) if (sag.faceErr[f] > wmx) { wmx = sag.faceErr[f]; wf = f; }
      const a = b.idx[3 * wf], bb = b.idx[3 * wf + 1], c = b.idx[3 * wf + 2];
      const cu = (b.ut[2 * a] + b.ut[2 * bb] + b.ut[2 * c]) / 3, ct = (b.ut[2 * a + 1] + b.ut[2 * bb + 1] + b.ut[2 * c + 1]) / 3;
      const th = TAU * cu, z = ct * DIMS.H, dz = 0.02;
      const rzz = (rABase(th, z + dz) - 2 * rABase(th, z) + rABase(th, z - dz)) / (dz * dz);
      ckpt('cusp_base_sharp', { recipe: 'base_sharp', tris: b.tris, chordMaxMm: m.chordMaxMm, p99DevMm: m.p99DevMm, pctOver0_03: m.pctOver0_03, cuspU: cu, cuspT: ct, cuspCurvZZ: rzz, worst: m.worst });
      console.log(`CUSP base tris=${b.tris} chordMax=${m.chordMaxMm.toFixed(4)} p99=${m.p99DevMm.toFixed(4)} @u=${cu.toFixed(4)},t=${ct.toFixed(4)} curvZZ=${rzz.toExponential(2)}`);
    } else console.log('SKIP cusp_base_sharp');
    for (const roundMm of [1.0, 2.0]) {
      const tag = `cusp_round_${roundMm}`;
      if (done(tag)) { console.log(`SKIP ${tag}`); continue; }
      const rr = makeRounded(roundMm);
      const br = buildUnified(style, { chordSteiner: true, chordTolMm: 0.01, maxPoints: MAXP, overrideRA: rr });
      const mSelf = measureTrue3D(br.ut, br.idx, br.vtx, rr);
      const nV = br.ut.length / 2; const ut3 = new Float64Array(nV * 3);
      for (let i = 0; i < nV; i++) { ut3[3 * i] = br.ut[2 * i]; ut3[3 * i + 1] = br.ut[2 * i + 1]; ut3[3 * i + 2] = 0; }
      const pOrig = perpendicular3DDeviation({ vertices: br.vtx, indices: Uint32Array.from(br.idx) }, ut3, rABase, { H: DIMS.H, tolMm: 0.03, seamExclU: SEAM });
      ckpt(tag, { recipe: `round_${roundMm}mm`, tris: br.tris, selfChordMax: mSelf.chordMaxMm, selfP99: mSelf.p99DevMm, selfPctOver0_03: mSelf.pctOver0_03, deviationFromOriginalMax: pOrig.maxDevMm, deviationFromOriginalP99: pOrig.p99DevMm });
      console.log(`ROUND ${roundMm}mm: selfChordMax=${mSelf.chordMaxMm.toFixed(4)} selfP99=${mSelf.p99DevMm.toFixed(4)} devFromOrig=${pOrig.maxDevMm.toFixed(4)}`);
    }
    // aggregate for convenience
    const results = ['cusp_base_sharp', 'cusp_round_1', 'cusp_round_2'].filter(done).map(load);
    ckpt('cusp_gothic', { style, results });
    expect(results.length).toBe(3);
  }, 60 * 60 * 1000);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 5 — CRYSTALLINE nonMan=2 diagnosis. Build, weld by index, list the non-manifold edges + their (u,t),
//   and check whether they sit at a helical-ripple discontinuity the flip guard can't reject.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
describe('PERFECT-PIPELINE CRYST — Crystalline nonMan=2 root-cause', () => {
  it.skipIf(process.env.PF_PERFECT_CRYST !== '1')('localizes the 2 non-manifold edges', () => {
    mkdirSync(DIR, { recursive: true });
    const style: StyleId = 'Crystalline';
    const b = buildUnified(style);
    // re-derive the non-manifold edges (weld by index, list edges shared by >2 tris)
    const q = 1 / 1e-4; const n = b.xyz.length / 3;
    const canon = new Int32Array(n); const wmap = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(b.xyz[3 * i] * q)}_${Math.round(b.xyz[3 * i + 1] * q)}_${Math.round(b.xyz[3 * i + 2] * q)}`;
      const h = wmap.get(k); if (h !== undefined) canon[i] = h; else { wmap.set(k, i); canon[i] = i; }
    }
    const EK = n + 1; const key = (x: number, y: number): number => (x < y ? x * EK + y : y * EK + x);
    const ec = new Map<number, number[]>(); // edge -> tri list
    for (let t = 0; t < b.idx.length; t += 3) {
      const A = canon[b.idx[t]], B = canon[b.idx[t + 1]], C = canon[b.idx[t + 2]];
      if (A === B || B === C || A === C) continue;
      for (const [p, r] of [[A, B], [B, C], [C, A]] as const) { const kk = key(p, r); (ec.get(kk) ?? ec.set(kk, []).get(kk)!).push(t / 3); }
    }
    const bad: any[] = [];
    for (const [kk, tris] of ec) {
      if (tris.length > 2) {
        const av = Math.floor(kk / EK), bv = kk % EK;
        // recover a representative (u,t) from a vertex that welds to av
        let ui = -1; for (let i = 0; i < n; i++) if (canon[i] === av) { ui = i; break; }
        bad.push({ nTris: tris.length, tris: tris.slice(0, 6), avPos: [b.xyz[3 * av], b.xyz[3 * av + 1], b.xyz[3 * av + 2]], bvPos: [b.xyz[3 * bv], b.xyz[3 * bv + 1], b.xyz[3 * bv + 2]], u: ui >= 0 ? b.ut[2 * ui] : null, t: ui >= 0 ? b.ut[2 * ui + 1] : null });
      }
    }
    const rec = { style, tris: b.tris, nonManByIndex: b.nonMan, badEdges: bad };
    ckpt('cryst_nonman', rec);
    console.log(`CRYST nonMan=${b.nonMan} badEdges=${bad.length}: ${JSON.stringify(bad.map((x) => ({ nTris: x.nTris, u: x.u, t: x.t })))}`);
    expect(b.tris).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// BLOCK 6 — BROADGEN: generalize step-edge conforming to the other analytic-step BROAD styles. BasketWeave uses
//   basketWeaveCreaseLoci (constant-u strand walls + constant-t layer rings); we inject both families as rings.
//   (DragonScales/CelticKnot/Bamboo are occlusion/curved — checked via DIAG first; only conform the ones DIAG
//    classifies FACET-BRIDGING.)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
describe('PERFECT-PIPELINE BROADGEN — generalize step-edge conforming', () => {
  it.skipIf(process.env.PF_PERFECT_BROADGEN !== '1')('BasketWeave crease-ring conforming before/after', () => {
    mkdirSync(DIR, { recursive: true });
    const style: StyleId = 'BasketWeave';
    const p = DEFAULT_STYLE_PARAMS[style] as { bwStrands: number; bwLayers: number; bwPhase: number };
    const loci = basketWeaveCreaseLoci(p.bwStrands, p.bwLayers, p.bwPhase);
    // BEFORE
    const b0 = done('broadgen_bw_before') ? load('broadgen_bw_before') : (() => {
      const bb = buildUnified(style); const mm = measureTrue3D(bb.ut, bb.idx, bb.vtx, bb.rA);
      const r = { tris: bb.tris, nonMan: bb.nonMan, ...mm }; ckpt('broadgen_bw_before', r);
      dumpHeatmap(DIR, 'BasketWeave_before_true3d', bb.xyz, bb.ut, bb.idx, bb.rA, DIMS.H, { meta: { label: 'BasketWeave crest-only (before)' } });
      console.log(`BW BEFORE chordMax=${mm.chordMaxMm.toFixed(3)} p99=${mm.p99DevMm.toFixed(3)} vtxMax=${mm.vertexMaxMm.toFixed(3)} %>0.03=${mm.pctOver0_03.toFixed(2)}`);
      return r;
    })();
    // AFTER — inject constant-u strand rings (vertical polylines in t) + constant-t layer rings (horizontal in u)
    const nSeg = 480;
    let stepPoints: number[] = []; let stepPairs: number[] = []; let off = 0;
    // horizontal layer rings (constant t, sweep u, wraps)
    for (const tb of loci.creaseT) {
      for (let i = 0; i < nSeg; i++) stepPoints.push(i / nSeg, tb);
      for (let i = 0; i < nSeg; i++) stepPairs.push(off + i, off + ((i + 1) % nSeg));
      off += nSeg;
    }
    // vertical strand walls (constant u, sweep t, does NOT wrap — open polyline)
    for (const ub of loci.creaseU) {
      for (let i = 0; i <= nSeg; i++) stepPoints.push(ub, i / nSeg);
      for (let i = 0; i < nSeg; i++) stepPairs.push(off + i, off + i + 1);
      off += nSeg + 1;
    }
    const b1 = buildUnified(style, { stepPoints, stepConstraintPairs: stepPairs });
    const m1 = measureTrue3D(b1.ut, b1.idx, b1.vtx, b1.rA);
    const q1 = triangleQualityDistribution({ vertices: b1.vtx, indices: Uint32Array.from(b1.idx) });
    dumpHeatmap(DIR, 'BasketWeave_after_true3d', b1.xyz, b1.ut, b1.idx, b1.rA, DIMS.H, { meta: { label: 'BasketWeave crease-conformed (after)' } });
    const after = { loci: { nU: loci.creaseU.length, nT: loci.creaseT.length }, tris: b1.tris, nonMan: b1.nonMan, constraint: b1.constraint, minAngleDeg: q1.minAngleDeg, ...m1 };
    ckpt('broadgen_bw_after', after);
    console.log(`BW AFTER chordMax=${m1.chordMaxMm.toFixed(3)} p99=${m1.p99DevMm.toFixed(3)} vtxMax=${m1.vertexMaxMm.toFixed(3)} %>0.03=${m1.pctOver0_03.toFixed(2)} constraint=${JSON.stringify(b1.constraint)}`);
    void b0;
    expect(loci.creaseU.length + loci.creaseT.length).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});
