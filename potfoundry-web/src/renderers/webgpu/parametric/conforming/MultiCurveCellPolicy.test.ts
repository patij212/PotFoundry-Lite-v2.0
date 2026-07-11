/**
 * MultiCurveCellPolicy.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm A2.
 *
 * `multiCurveCellPolicy` is the opt-in remedy for the 2-locus (in practice,
 * 3-locus at stepMm 0.15) deterministic non-manifold defect at near-tangent
 * doubled general-curve passes (`research/lab/tierc/champion-spec-gyroid.md`
 * §1.5): production's per-cell constrained CDT leaves a mult=3 edge (one extra
 * triangle glued onto an edge) where the Gyroid champion's doubled band-edge
 * contours (inner |val|=0.135, outer |val|=0.15) pass within ~1-1.7
 * featureLevel-11 cells of each other. Default `'off'` MUST be byte-identical
 * to the pre-A2 export path.
 *
 * TWIN-SCALE VERDICT (`research/bridge/_tierc_a2_accept.test.ts`, the real
 * production twin, step 0.15): 'forceRefine' cleared 0/3 known loci (all 3
 * persist, bit-identical (u,t) to the banked baseline) and pushed outer tris
 * +1.44% (banked 2,242,987 -> 2,275,354), outside the +/-0.5% acceptance band,
 * while the other fidelity gates (outliers +4.00%, Newton-worst +0.00%,
 * coverage, zeroArea) held. 'fanRepair' clears the mult=3 edge at the
 * (0.4384,0.4421) locus CLEANLY at window scale (nonMan 1->0, boundary-edge
 * count UNCHANGED 499->499 — measured, not assumed; a first hand-analysis of a
 * partial neighbourhood dump wrongly predicted a new orphaned edge, corrected
 * by the automated measurement). See `research/bridge/_tierc_a2_accept.test.ts`
 * (`PF_TIERC_A2_POLICY=fanRepair`) for the twin-scale verdict on all 3 loci.
 *
 * Three test groups:
 *  1. MECHANICS — `forceRefineMultiCurveLeaves` in isolation (synthetic
 *     fixtures): the split itself, the "only 1 distinct curve" no-op, the two
 *     safety guards (coarser-neighbour, pinned t=0/t=1 boundary row), and the
 *     policy threading/inertness contract on `triangulateQuadtreeWithFeatures`.
 *  2. WINDOW REPRO — a small (u,t) window quadtree around the banked
 *     step-invariant locus (0.4384,0.4421) (`research/exchange/_gyroid_bandedge/
 *     nonman_loci.json`, step-0.15 row 3 / step-0.08 row 5 — bit-identical
 *     (u,t) across both steps), fed the REAL two clipped band-edge contour
 *     fragments (extracted verbatim from the banked
 *     `research/exchange/_gyroid_bandedge/contours_bandedge.json`, itself
 *     produced by `research/bridge/_gyroidContourLib.ts`'s `extractIsolevel` at
 *     `GBE_EXTRACT_DEFAULT` — transcribed as literals here, NOT a live import,
 *     since `src/` never imports `research/`). RED is genuine and strong: with
 *     policy 'off' the mesh reproduces the EXACT banked mult=3 edge bit-for-bit
 *     (same (u,t) endpoints as `nonman_loci.json`'s step-0.15 row) -- and the
 *     twin build later confirmed this SAME edge is one of the 3 real,
 *     production loci. 'forceRefine' is an honest no-op at this window's
 *     (uniform-level-11) scale (see the FINDING test); 'fanRepair' clears the
 *     mult=3 edge here cleanly (no new boundary edge, measured).
 *  3. FAN-REPAIR MECHANICS — `fanConsistencyRepair` in isolation (synthetic
 *     fixtures): drops a confidently-degenerate sliver on an over-multiplicity
 *     edge, leaves a genuinely ambiguous (non-degenerate) over-multiplicity
 *     edge untouched (the safety gate).
 */
import { describe, it, expect } from 'vitest';
import {
  triangulateQuadtreeWithFeatures,
  forceRefineMultiCurveLeaves,
  fanConsistencyRepair,
} from './FeatureConformingTriangulator';
import type { QuadLeaf } from './PeriodicBalancedQuadtree';
import type { QuadtreeLike } from './QuadtreeTriangulator';
import type { FeatureLine } from './FeatureLineGraph';

// ─────────────────────────────── shared audit helpers ───────────────────────────────

/** Undirected-edge usage counts across every triangle (a==b/b==c/c==a skipped). */
function edgeMultiplicities(indices: Uint32Array): Map<string, number> {
  const counts = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k];
    const b = indices[k + 1];
    const c = indices[k + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** Count of edges used > 2 times (the mult=3 defect's own signature; mirrors
 *  the project's `nonManRawBig` semantics). */
function nonManifoldEdgeCount(indices: Uint32Array): number {
  let n = 0;
  for (const c of edgeMultiplicities(indices).values()) if (c > 2) n++;
  return n;
}

function maxEdgeMultiplicity(indices: Uint32Array): number {
  let worst = 0;
  for (const c of edgeMultiplicities(indices).values()) if (c > worst) worst = c;
  return worst;
}

/** Count of edges used EXACTLY once -- a T-junction/crack signature in what
 *  should be a closed interior patch (never legitimate away from a true mesh
 *  perimeter). Used to catch a repair that trades non-manifold for a hole. */
function boundaryEdgeCount(indices: Uint32Array): number {
  let n = 0;
  for (const c of edgeMultiplicities(indices).values()) if (c === 1) n++;
  return n;
}

// ═══════════════════════════ 1. MECHANICS (synthetic fixtures) ═══════════════════════════

describe('forceRefineMultiCurveLeaves (mechanics, synthetic)', () => {
  it('splits a leaf crossed by 2 DISTINCT general-curve labels into 4 level+1 children', () => {
    // 4x4 block of level-6 leaves (iu,it = 10..13); the two lines both cross
    // ONLY the (iu=11,it=11) cell.
    const leaves: QuadLeaf[] = [];
    for (let it = 10; it <= 13; it++) {
      for (let iu = 10; iu <= 13; iu++) {
        leaves.push({ u0: iu / 64, t0: it / 64, level: 6, iu, it, uExtra: 0 });
      }
    }
    const lineP: FeatureLine = {
      kind: 'general-curve',
      label: 'P',
      points: [{ u: 11.3 / 64, t: 11.1 / 64 }, { u: 11.3 / 64, t: 11.9 / 64 }],
    };
    const lineQ: FeatureLine = {
      kind: 'general-curve',
      label: 'Q',
      points: [{ u: 11.7 / 64, t: 11.1 / 64 }, { u: 11.7 / 64, t: 11.9 / 64 }],
    };
    const out = forceRefineMultiCurveLeaves(leaves, [lineP, lineQ], 0);
    expect(out.length, '16 leaves - 1 split target + 4 children = 19').toBe(19);
    const children = out.filter((l) => l.level === 7 && (l.iu ?? -1) >= 22 && (l.iu ?? -1) <= 23 && (l.it ?? -1) >= 22 && (l.it ?? -1) <= 23);
    expect(children.length, 'exactly the 4 quadrant children of (11,11)').toBe(4);
    // The original (11,11) leaf itself must be gone.
    expect(out.some((l) => l.level === 6 && l.iu === 11 && l.it === 11)).toBe(false);
    // Every OTHER leaf is untouched (same level/iu/it as input).
    const untouched = leaves.filter((l) => !(l.iu === 11 && l.it === 11));
    for (const l of untouched) {
      expect(out.some((o) => o.level === l.level && o.iu === l.iu && o.it === l.it)).toBe(true);
    }
  });

  it('leaves a cell untouched when only 1 distinct general-curve label crosses it', () => {
    const leaves: QuadLeaf[] = [{ u0: 0, t0: 0, level: 6, iu: 0, it: 0, uExtra: 0 }];
    const lineP: FeatureLine = {
      kind: 'general-curve',
      label: 'P',
      points: [{ u: 0.001, t: 0 }, { u: 0.001, t: 1 / 64 }],
    };
    // Second segment of the SAME line (same label) also crosses the cell twice
    // -- still ONE distinct curve, must not count as 2.
    const lineP2: FeatureLine = {
      kind: 'general-curve',
      label: 'P',
      points: [{ u: 0.005, t: 0 }, { u: 0.005, t: 1 / 64 }],
    };
    const out = forceRefineMultiCurveLeaves(leaves, [lineP, lineP2], 0);
    expect(out).toEqual(leaves);
  });

  it('leaves non-general-curve kinds out of the distinct-curve count', () => {
    const leaves: QuadLeaf[] = [{ u0: 0, t0: 0, level: 6, iu: 0, it: 0, uExtra: 0 }];
    const generalCurve: FeatureLine = {
      kind: 'general-curve',
      label: 'P',
      points: [{ u: 0.001, t: 0 }, { u: 0.001, t: 1 / 64 }],
    };
    const verticalCrease: FeatureLine = {
      kind: 'vertical-crease',
      label: 'V',
      points: [{ u: 0.005, t: 0 }, { u: 0.005, t: 1 / 64 }],
    };
    const out = forceRefineMultiCurveLeaves(leaves, [generalCurve, verticalCrease], 0);
    expect(out, '1 general-curve + 1 non-general-curve is not 2 DISTINCT general-curves').toEqual(leaves);
  });

  it('SAFETY GUARD: skips a flagged leaf with an existing 1-level-COARSER neighbour', () => {
    // leafA (level 5) borders leafB (level 6) on leafB's WEST side -- a
    // pre-existing, legitimate 2:1 transition. Splitting leafB further would
    // create a 2-level gap against leafA. Both sit at t0=1/32 (an INTERIOR
    // row, not t=0) so this test isolates the coarser-neighbour guard from the
    // separate t=0/t=1 pinned-boundary guard (its own dedicated test below).
    const leafA: QuadLeaf = { u0: 0, t0: 1 / 32, level: 5, iu: 0, it: 1, uExtra: 0 };
    const leafB: QuadLeaf = { u0: 2 / 64, t0: 1 / 32, level: 6, iu: 2, it: 2, uExtra: 0 };
    const lineP: FeatureLine = {
      kind: 'general-curve',
      label: 'P',
      points: [{ u: 2.2 / 64, t: 1 / 32 }, { u: 2.2 / 64, t: 1 / 32 + 1 / 64 }],
    };
    const lineQ: FeatureLine = {
      kind: 'general-curve',
      label: 'Q',
      points: [{ u: 2.8 / 64, t: 1 / 32 }, { u: 2.8 / 64, t: 1 / 32 + 1 / 64 }],
    };
    const guarded = forceRefineMultiCurveLeaves([leafA, leafB], [lineP, lineQ], 0);
    expect(guarded, 'guard fires -> leafB left unsplit, tree unchanged').toEqual([leafA, leafB]);

    // POSITIVE control: same 2 curves, same leafB, but WITHOUT leafA present ->
    // no coarser neighbour -> the guard must NOT fire, proving the guard (not
    // something else) was the reason for the skip above.
    const unguarded = forceRefineMultiCurveLeaves([leafB], [lineP, lineQ], 0);
    expect(unguarded.length, 'no coarser neighbour -> split proceeds').toBe(4);
  });

  it('SAFETY GUARD: skips a flagged leaf touching the t=0/t=1 PINNED boundary row ' +
    '(would corrupt the shared-ring vertex count)', () => {
    // A single level-6 leaf AT t=0 (it=0), crossed by 2 distinct curves. Even
    // with NO coarser neighbour anywhere (nothing else in the tree), this leaf
    // must stay unsplit: it borders (or IS) the pinned t=0 row that both walls
    // share by index (assembleWatertight hard-throws on a ring-count mismatch).
    // This regression-guards the E-2026-07-11-TIERC-HEADTOHEAD Arm A2 twin-scale
    // finding: 'forceRefine' split a boundary-adjacent cell and grew the outer
    // wall's ring from 2048 to 2052 vertices ("wall ring mismatch (outer 2052,
    // inner 2048)") before this guard was added.
    const boundaryLeaf: QuadLeaf = { u0: 0, t0: 0, level: 6, iu: 0, it: 0, uExtra: 0 };
    const lineP: FeatureLine = {
      kind: 'general-curve',
      label: 'P',
      points: [{ u: 0.2 / 64, t: 0 }, { u: 0.2 / 64, t: 0.9 / 64 }],
    };
    const lineQ: FeatureLine = {
      kind: 'general-curve',
      label: 'Q',
      points: [{ u: 0.8 / 64, t: 0 }, { u: 0.8 / 64, t: 0.9 / 64 }],
    };
    const out = forceRefineMultiCurveLeaves([boundaryLeaf], [lineP, lineQ], 0);
    expect(out, 't=0 boundary row leaf must stay unsplit regardless of the multi-curve flag').toEqual([boundaryLeaf]);

    // Same 2 curves shifted one row up (t0=1/64, NOT touching the boundary) ->
    // no boundary conflict -> the guard must NOT fire, proving it (not
    // something else) was the reason for the skip above.
    const interiorLeaf: QuadLeaf = { u0: 0, t0: 1 / 64, level: 6, iu: 0, it: 1, uExtra: 0 };
    const lineP2: FeatureLine = { kind: 'general-curve', label: 'P', points: [{ u: 0.2 / 64, t: 1 / 64 }, { u: 0.2 / 64, t: 1.9 / 64 }] };
    const lineQ2: FeatureLine = { kind: 'general-curve', label: 'Q', points: [{ u: 0.8 / 64, t: 1 / 64 }, { u: 0.8 / 64, t: 1.9 / 64 }] };
    const outInterior = forceRefineMultiCurveLeaves([interiorLeaf], [lineP2, lineQ2], 0);
    expect(outInterior.length, 'no boundary conflict -> split proceeds').toBe(4);
  });

  it('is a no-op below 2 total general-curve lines (cannot have 2 distinct)', () => {
    const leaves: QuadLeaf[] = [{ u0: 0, t0: 0, level: 6, iu: 0, it: 0, uExtra: 0 }];
    const lineP: FeatureLine = {
      kind: 'general-curve',
      label: 'P',
      points: [{ u: 0.001, t: 0 }, { u: 0.001, t: 1 / 64 }],
    };
    expect(forceRefineMultiCurveLeaves(leaves, [lineP], 0)).toEqual(leaves);
    expect(forceRefineMultiCurveLeaves(leaves, [], 0)).toEqual(leaves);
  });
});

// ═══════════════════════════ threading / inertness on triangulateQuadtreeWithFeatures ═══════════════════════════

describe('multiCurveCellPolicy threading on triangulateQuadtreeWithFeatures', () => {
  // A 4x4 level-6 block with 2 distinct general-curve labels crossing one cell
  // (same fixture shape as the mechanics test above) so 'forceRefine' has a
  // real, non-vacuous effect to thread.
  function quadtreeAndFeatures(): { qt: QuadtreeLike; features: FeatureLine[] } {
    const leaves: QuadLeaf[] = [];
    for (let it = 10; it <= 13; it++) {
      for (let iu = 10; iu <= 13; iu++) {
        leaves.push({ u0: iu / 64, t0: it / 64, level: 6, iu, it, uExtra: 0 });
      }
    }
    const lineP: FeatureLine = {
      kind: 'general-curve',
      label: 'P',
      points: [{ u: 11.3 / 64, t: 11.05 }, { u: 11.3 / 64, t: 11.95 / 64 }],
    };
    const lineQ: FeatureLine = {
      kind: 'general-curve',
      label: 'Q',
      points: [{ u: 11.7 / 64, t: 11.05 / 64 }, { u: 11.7 / 64, t: 11.95 / 64 }],
    };
    return { qt: { leaves: () => leaves, uBias: () => 0 }, features: [lineP, lineQ] };
  }

  it('INERTNESS: omitted === "off" (byte-identical vertices/indices)', () => {
    const { qt, features } = quadtreeAndFeatures();
    const omitted = triangulateQuadtreeWithFeatures(qt, features, {});
    const off = triangulateQuadtreeWithFeatures(qt, features, { multiCurveCellPolicy: 'off' });
    expect(Array.from(off.indices)).toEqual(Array.from(omitted.indices));
    expect(Array.from(off.vertices)).toEqual(Array.from(omitted.vertices));
  });

  it('THREADING: "forceRefine" changes the built mesh vs "off" (non-vacuous)', () => {
    const { qt, features } = quadtreeAndFeatures();
    const off = triangulateQuadtreeWithFeatures(qt, features, { multiCurveCellPolicy: 'off' });
    const forced = triangulateQuadtreeWithFeatures(qt, features, { multiCurveCellPolicy: 'forceRefine' });
    expect(forced.indices.length, 'refined leaf set must produce more triangles').toBeGreaterThan(
      off.indices.length,
    );
  });

  it('"fanRepair" is a byte-identical no-op when no edge exceeds multiplicity 2', () => {
    const { qt, features } = quadtreeAndFeatures();
    const off = triangulateQuadtreeWithFeatures(qt, features, { multiCurveCellPolicy: 'off' });
    const repaired = triangulateQuadtreeWithFeatures(qt, features, { multiCurveCellPolicy: 'fanRepair' });
    expect(Array.from(repaired.indices)).toEqual(Array.from(off.indices));
  });
});

// ═══════════════════════════ 2. WINDOW REPRO (real gyroid band-edge data) ═══════════════════════════

// Real, decimated (u,t) contour points transcribed verbatim from the banked
// `research/exchange/_gyroid_bandedge/contours_bandedge.json` (produced by
// `research/bridge/_gyroidContourLib.ts`'s marching-squares extraction at
// `GBE_EXTRACT_DEFAULT` -- nu=nt=1200, stepMm=0.15), the full contiguous run of
// each polyline whose points fall within +/-0.02 (u,t) of the banked
// step-invariant locus (0.4384,0.4421) (`nonman_loci.json`, step-0.15 row:
// edge (839762,839777), aUt=(0.4384765625,0.44209006428718567),
// bUt=(0.4383925795555115,0.4420276880264282), mid|val|=0.13500 -- ON the inner
// isolevel to 3e-6, step-invariant at 0.08 too). Order preserved (a contiguous
// slice of the original polyline, so consecutive points are genuinely
// consecutive along the real curve) -- the wider window (vs. the +/-0.004 first
// attempt) carries the full local curve CONTEXT the tighter trim was missing;
// a +/-0.004 trim did NOT reproduce the defect (both fragments in isolation
// triangulated clean), this wider one does (see the RED test below). Min
// pairwise approach between the two fragments measures 0.000586 (u,t) =~ 1.2
// featureLevel-11 cells (1/2048 = 0.00048828125), matching the champion spec's
// "~1-1.7 cells" characterization.
const INNER_135_FRAGMENT: Array<[number, number]> = [
  [0.4583333333333333, 0.45716885293840576],
  [0.45767109790430766, 0.45666666666666667],
  [0.45666666666666667, 0.4559035731403853],
  [0.4558333333333333, 0.4552693253669809],
  [0.455, 0.45463418938322847],
  [0.4543872216152505, 0.45416666666666666],
  [0.4533333333333333, 0.45336181295097333],
  [0.4525, 0.45272485798253886],
  [0.45166666666666666, 0.45208758659839615],
  [0.45111637882865224, 0.45166666666666666],
  [0.45002697826809096, 0.4508333333333333],
  [0.44916666666666666, 0.45017539152623076],
  [0.4483333333333333, 0.4495383909587607],
  [0.4475, 0.4489018621438893],
  [0.44675498606526043, 0.4483333333333333],
  [0.44583333333333336, 0.44763090685185813],
  [0.445, 0.4469968363226965],
  [0.44416666666666665, 0.44636394982860195],
  [0.4434666051379054, 0.44583333333333336],
  [0.4425, 0.4451024993757134],
  [0.44166666666666665, 0.4444743346777277],
  [0.44083333333333335, 0.4438481527531354],
  [0.4401460157176601, 0.44333333333333336],
  [0.43916666666666665, 0.44260259963914256],
  [0.43833333333333335, 0.4419836744724631],
  [0.4375, 0.44136762415743075],
  [0.43677384133776903, 0.44083333333333335],
  [0.43583333333333335, 0.44014510538984736],
  [0.43983377375572963, 0.44309998250007626],
  [0.435, 0.43953913021647373],
  [0.43448515944979244, 0.43916666666666665],
  [0.43333333333333335, 0.4383390243970762],
  [0.4325, 0.4377454208117852],
  [0.43166666666666664, 0.4371564769884647],
  [0.43096823993346944, 0.43666666666666665],
  [0.43, 0.43599367928717914],
  [0.42916666666666664, 0.4354203923562306],
  [0.4285501865517338, 0.435],
  [0.4275, 0.4342914913865847],
  [0.4266666666666667, 0.4337364682017763],
  [0.42605502373241927, 0.43333333333333335],
  [0.425, 0.4326467769752575],
  [0.4241666666666667, 0.43211271668909695],
  [0.42346141843097856, 0.43166666666666664],
  [0.4225, 0.4310676992770873],
  [0.4216666666666667, 0.4305573582277579],
  [0.42083333333333334, 0.4300555400928257],
  [0.42, 0.4295625526819581],
  [0.41931936830846933, 0.42916666666666664],
];
const OUTER_150_FRAGMENT: Array<[number, number]> = [
  [0.4583333333333333, 0.4563352355418023],
  [0.45766175286501, 0.4558333333333333],
  [0.45666666666666667, 0.4550876483384908],
  [0.4558333333333333, 0.45446150489019826],
  [0.455, 0.45383401053025146],
  [0.4543362247174278, 0.4533333333333333],
  [0.4533333333333333, 0.4525756153865665],
  [0.4525, 0.4519450395937314],
  [0.45166666666666666, 0.4513137639447072],
  [0.45103294362762686, 0.4508333333333333],
  [0.45, 0.45004978226054754],
  [0.44916666666666666, 0.44941741745387204],
  [0.4483333333333333, 0.4487850360200109],
  [0.44773797600703635, 0.4483333333333333],
  [0.44666666666666666, 0.44752094292764827],
  [0.44583333333333336, 0.4468896011772255],
  [0.445, 0.44625898315879997],
  [0.44443685069661837, 0.44583333333333336],
  [0.44333333333333336, 0.4450007080610234],
  [0.4425, 0.4443734582906806],
  [0.44166666666666665, 0.44374774721152543],
  [0.4411134697495934, 0.44333333333333336],
  [0.44, 0.4425018138752258],
  [0.43916666666666665, 0.4418820417852534],
  [0.43833333333333335, 0.4412647088595099],
  [0.43774888506641685, 0.44083333333333335],
  [0.43666666666666665, 0.44003832272475135],
  [0.43583333333333335, 0.4394297647388787],
  [0.435, 0.4388246362832053],
  [0.4343196656054403, 0.43833333333333335],
  [0.43333333333333335, 0.43762571930256045],
  [0.4325, 0.4370324697433387],
  [0.43198300180843985, 0.43666666666666665],
  [0.43083333333333335, 0.43585977404551574],
  [0.43, 0.4352808965122821],
  [0.42916666666666664, 0.434707385662561],
  [0.4283733439905609, 0.43416666666666665],
  [0.4275, 0.43357764755720896],
  [0.4266666666666667, 0.4330220209202754],
  [0.42587461280322575, 0.4325],
  [0.425, 0.43193077644289546],
  [0.4241666666666667, 0.4313957753311621],
  [0.42333333333333334, 0.4308682689840467],
  [0.4225, 0.43034856928846954],
  [0.42193367308613067, 0.43],
  [0.42083333333333334, 0.4293338390777814],
  [0.42, 0.42883943228058163],
  [0.4191666666666667, 0.4283540783680856],
];

/** Production's real featureLevel for GyroidManifold (AF_PROD_OPTS.featureLevel). */
const FEATURE_LEVEL = 11;
/** Production's real cornerSnap formula (ConformingWall.ts buildWallMeshAtScale). */
const CORNER_SNAP = 0.06 / (1 << FEATURE_LEVEL);

/**
 * Production's real anisotropy bias for THIS exact build (`computeUBias` GATE
 * B, `WatertightAssembly.ts`): `champion-spec-gyroid.md` §2.5 states directly
 * "uBias=1 in both the baseline and the band-edge twin, unchanged" for
 * GyroidManifold at the pinned dims. Cells are therefore ANISOTROPIC:
 * `Δu = 1/2^(level+uBias)`, `Δt = 1/2^level` -- u is refined ONE level finer
 * than t at the same nominal `level`. A first window-repro attempt built with
 * `uBias=0` (isotropic) did NOT reproduce the defect (both the +/-0.004 and
 * +/-0.02 curve-context windows triangulated clean); this is the corrected,
 * production-faithful anisotropy.
 */
const PROD_U_BIAS = 1;

/** A uniform level-11 leaf grid (at PROD_U_BIAS) tiling a window around the
 *  locus (no pre-existing refinement gradient inside the window, so the
 *  safety guard in `forceRefineMultiCurveLeaves` never fires here -- it is
 *  exercised in isolation by the synthetic mechanics tests above). Window:
 *  iu 1714..1887 (at eUL=level+uBias=12), it 874..943 (at level=11)
 *  (174x70 = 12,180 leaves), i.e. u0..u1 = [0.41845703125, 0.4609375),
 *  t0..t1 = [0.4267578125, 0.4609375] -- comfortably containing both
 *  fragments' bounding boxes with margin. */
function windowQuadtree(): QuadtreeLike {
  const level = FEATURE_LEVEL;
  const eUL = level + PROD_U_BIAS;
  const uSpan = 1 << eUL;
  const tSpan = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 874; it <= 943; it++) {
    for (let iu = 1714; iu <= 1887; iu++) {
      leaves.push({ u0: iu / uSpan, t0: it / tSpan, level, iu, it, uExtra: 0 });
    }
  }
  return { leaves: () => leaves, uBias: () => PROD_U_BIAS };
}

function bandedgeFeatureLines(): FeatureLine[] {
  return [
    { kind: 'general-curve', points: INNER_135_FRAGMENT.map(([u, t]) => ({ u, t })), label: 'bandedge-inner[233]' },
    { kind: 'general-curve', points: OUTER_150_FRAGMENT.map(([u, t]) => ({ u, t })), label: 'bandedge-outer[230]' },
  ];
}

describe('window-scale repro at the banked (0.4384,0.4421) locus', () => {
  it('non-manifold audit is non-vacuous (injected duplicate triangle moves the count)', () => {
    const mesh = triangulateQuadtreeWithFeatures(windowQuadtree(), bandedgeFeatureLines(), {
      cornerSnap: CORNER_SNAP,
      multiCurveCellPolicy: 'off',
    });
    const before = nonManifoldEdgeCount(mesh.indices);
    const cracked = new Uint32Array(mesh.indices.length + 3);
    cracked.set(mesh.indices);
    cracked.set([mesh.indices[0], mesh.indices[1], mesh.indices[2]], mesh.indices.length);
    const after = nonManifoldEdgeCount(cracked);
    expect(after, 'the audit itself must be capable of detecting a non-manifold edge').toBeGreaterThan(before);
  });

  it('RED (policy "off"): reproduces THE BANKED mult=3 edge bit-identically', () => {
    const mesh = triangulateQuadtreeWithFeatures(windowQuadtree(), bandedgeFeatureLines(), {
      cornerSnap: CORNER_SNAP,
      multiCurveCellPolicy: 'off',
    });
    const nonMan = nonManifoldEdgeCount(mesh.indices);
    const worst = maxEdgeMultiplicity(mesh.indices);
    expect(nonMan, 'expected the known mult=3 defect to reproduce at window scale').toBeGreaterThan(0);
    expect(worst, 'the defect is specifically a MULTIPLICITY-3 edge (one extra triangle)').toBe(3);
    // The offending edge's endpoints must match `nonman_loci.json`'s step-0.15
    // row bit-for-bit: aUt=(0.4384765625,0.44209006428718567),
    // bUt=(0.4383925795555115,0.4420276880264282) -- not just "a" defect, THE
    // banked one.
    const counts = edgeMultiplicities(mesh.indices);
    let found = false;
    for (const [key, c] of counts) {
      if (c !== 3) continue;
      const [ai, bi] = key.split(':').map(Number);
      const pts: Array<[number, number]> = [
        [mesh.vertices[ai * 3], mesh.vertices[ai * 3 + 1]],
        [mesh.vertices[bi * 3], mesh.vertices[bi * 3 + 1]],
      ];
      const hasA = pts.some(([u, t]) => Math.abs(u - 0.4384765625) < 1e-6 && Math.abs(t - 0.44209006428718567) < 1e-6);
      const hasB = pts.some(([u, t]) => Math.abs(u - 0.4383925795555115) < 1e-6 && Math.abs(t - 0.4420276880264282) < 1e-6);
      if (hasA && hasB) found = true;
    }
    expect(found, 'the mult=3 edge must be the exact banked (u,t) pair from nonman_loci.json').toBe(true);
  });

  it('FINDING (twin-CONFIRMED): the literal same-cell criterion flags zero ' +
    'leaves in this window; forceRefine does not clear this locus on the real ' +
    'production twin either', () => {
    // At window scale this was originally an open question (does the window's
    // simplified uniform-level-11 construction merely lack the context a real
    // adaptive tree would have?). The twin-scale acceptance run
    // (research/bridge/_tierc_a2_accept.test.ts, the REAL production quadtree)
    // answered it: this exact locus (bit-identical (u,t)) is one of 3 residual
    // mult=3 edges 'forceRefine' left UNCHANGED on the full twin. So the
    // window-scale result below is not a tooling limitation -- it is the same
    // finding the twin confirms: forceRefine's literal "one leaf hosts both
    // curves" condition does not hold at this locus, at any scale tested.
    const off = triangulateQuadtreeWithFeatures(windowQuadtree(), bandedgeFeatureLines(), {
      cornerSnap: CORNER_SNAP,
      multiCurveCellPolicy: 'off',
    });
    const forced = triangulateQuadtreeWithFeatures(windowQuadtree(), bandedgeFeatureLines(), {
      cornerSnap: CORNER_SNAP,
      multiCurveCellPolicy: 'forceRefine',
    });
    expect(Array.from(forced.indices), 'forceRefine is byte-identical to off in this window (0 leaves flagged)').toEqual(
      Array.from(off.indices),
    );
  });

  it('fanRepair clears the mult=3 edge at this locus WITHOUT introducing a new ' +
    'boundary edge -- measured, not assumed', () => {
    const off = triangulateQuadtreeWithFeatures(windowQuadtree(), bandedgeFeatureLines(), {
      cornerSnap: CORNER_SNAP,
      multiCurveCellPolicy: 'off',
    });
    const repaired = triangulateQuadtreeWithFeatures(windowQuadtree(), bandedgeFeatureLines(), {
      cornerSnap: CORNER_SNAP,
      multiCurveCellPolicy: 'fanRepair',
    });
    const beforeNonMan = nonManifoldEdgeCount(off.indices);
    const afterNonMan = nonManifoldEdgeCount(repaired.indices);
    const afterBoundary = boundaryEdgeCount(repaired.indices);
    const beforeBoundary = boundaryEdgeCount(off.indices);
    // eslint-disable-next-line no-console -- diagnostic breadcrumb for the A2 report
    console.log(
      `[A2 fanRepair window] nonMan off=${beforeNonMan} repaired=${afterNonMan} | ` +
        `boundary off=${beforeBoundary} repaired=${afterBoundary}`,
    );
    expect(afterNonMan, 'fanRepair clears the non-manifold edge').toBe(0);
    // HONEST regression check, not skipped: a first hand-analysis of a partial
    // ("incident to 2 of the 3 relevant vertices") neighbourhood dump predicted
    // this drop would orphan a different edge to multiplicity 1. The FULL
    // automated measurement here contradicts that -- boundary count is
    // UNCHANGED (the window's own finite-patch perimeter accounts for all of
    // it, both before and after). Asserted as an EXACT delta, not just
    // "some number changed", so a future regression cannot silently slip by.
    expect(
      afterBoundary - beforeBoundary,
      'fanRepair introduces NO new boundary edge at this locus (measured, contradicting the earlier hand-analysis)',
    ).toBe(0);
  });
});

// ═══════════════════════════ 3. FAN-REPAIR MECHANICS (synthetic fixtures) ═══════════════════════════

describe('fanConsistencyRepair (mechanics, synthetic)', () => {
  it('drops a confidently-degenerate sliver on a multiplicity-3 edge', () => {
    // Two normal-sized triangles (0,1,2) and (1,3,2) share edge (1,2) as a
    // clean 2-manifold. A third, near-zero-area sliver (1,2,4) is glued onto
    // the SAME edge -- vertex 4 sits a hair off the line through 1 and 2.
    const vu = [0, 1, 1, 0, 1.0000001];
    const vt = [0, 0, 1, 1, 0.5000001];
    const indices = [0, 1, 2, 1, 3, 2, 1, 2, 4];
    const seam = [0, 0, 0];
    const source = [0, 0, 0];
    const result = fanConsistencyRepair(indices, seam, source, vu, vt);
    expect(result.dropped, 'exactly the sliver is dropped').toBe(1);
    expect(result.indices.length / 3, 'left with the 2 legitimate triangles').toBe(2);
    // The sliver's OTHER two edges (1,4) and (2,4) touch no other triangle in
    // this tiny fixture, so they simply vanish -- 0 orphaned (mult 2->1) edges.
    expect(result.orphanedEdges).toBe(0);
  });

  it('leaves a genuinely ambiguous (non-degenerate) multiplicity-3 edge untouched', () => {
    // Three COMPARABLY-sized triangles all sharing edge (1,2) -- not a sliver
    // signature (SLIVER_RATIO gate: none is confidently degenerate relative to
    // the others). The safety gate must decline to guess.
    const vu = [0, 1, 1, -1, 2];
    const vt = [0, 0, 1, 0.5, 0.5];
    const indices = [0, 1, 2, 1, 3, 2, 1, 2, 4];
    const seam = [0, 0, 0];
    const source = [0, 0, 0];
    const result = fanConsistencyRepair(indices, seam, source, vu, vt);
    expect(result.dropped, 'no confidently-degenerate triangle -- nothing dropped').toBe(0);
    expect(result.indices).toEqual(indices);
  });

  it('is a byte-identical no-op when every edge has multiplicity <= 2', () => {
    const vu = [0, 1, 1, 0];
    const vt = [0, 0, 1, 1];
    const indices = [0, 1, 2, 0, 2, 3];
    const seam = [0, 0];
    const source = [0, 0];
    const result = fanConsistencyRepair(indices, seam, source, vu, vt);
    expect(result.dropped).toBe(0);
    expect(result.indices).toEqual(indices);
    expect(result.seam).toEqual(seam);
    expect(result.source).toEqual(source);
  });
});

