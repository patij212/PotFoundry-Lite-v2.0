/**
 * railKey.test.ts — Task 1 of the general-mesher integration spike: the #1 crux.
 *
 * The band-remesh module welds vertices by an EXACT string key `${u}|${t}`
 * (no quantization). The production complement {@link triangulateQuadtreeWithFeatures}
 * (FeatureConformingTriangulator) welds by a QUANTIZED key
 * `round(u·QSCALE)·(QSCALE·2+1) + round(t·QSCALE)` with `QSCALE = 1<<24`, plus a
 * grid-line registry. These are NOT bit-compatible: a non-dyadic rail (u,t) the
 * band treats as one vertex can round to a DIFFERENT quantized cell on the
 * complement side → two vertices → T-junction.
 *
 * This suite proves the reconciliation: `quantizeRailUT` snaps a rail vertex onto
 * the complement's QSCALE dyadic grid so BOTH keyers agree, and `railVertexKey`
 * replicates the complement's `vertexIndex()` packed key EXACTLY.
 *
 * PART 1 — round-trip equivalence (unit): idempotency, band-key ⇔ complement-key
 *          agreement (no split / no false merge), and seam closure (u≈0 ≡ u≈1).
 * PART 2 — the 2-cell adoption de-risk (the real gate): construct a MINIMAL
 *          2-leaf quadtree and drive the REAL `triangulateQuadtreeWithFeatures`
 *          with a single snapped rail FeatureLine. Assert the ON-EDGE snapped
 *          vertex resolves to ONE shared id (the gate) and DOCUMENT whether the
 *          INTERIOR one shares yet (expected NO → motivates Task 3).
 *
 * Pure CPU, no GPU/DOM. Safe for Vitest.
 */

import { describe, it, expect } from 'vitest';
import { quantizeRailUT, railVertexKey } from './railKey';
import { auditWatertight, type Mesh3 } from './audit';
import { triangulateQuadtreeWithFeatures } from '../../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import type { QuadtreeLike } from '../../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import type { QuadLeaf } from '../../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import type { FeatureLine } from '../../renderers/webgpu/parametric/conforming/FeatureLineGraph';

const QSCALE = 1 << 24;

/** The band's EXACT-string weld key (verbatim from paver.ts `utKey`). */
const bandKey = (u: number, t: number): string => `${u}|${t}`;

describe('railKey — Part 1: round-trip equivalence', () => {
  // A spread of arbitrary non-dyadic rail (u,t), incl. one near the u-seam and
  // one safely interior.
  const samples: Array<[number, number]> = [
    [0.31830988618, 0.27182818284], // π/10-ish, e/10-ish (irrational, non-dyadic)
    [0.99999, 0.5],                  // near the u-seam
    [0.123456789, 0.987654321],      // interior
    [0.7071067811865, 0.4142135623], // √2-ish
    [0.000001, 0.333333333],         // near u=0
  ];

  it('quantizeRailUT is idempotent (snapping a snapped point is a no-op)', () => {
    for (const [u, t] of samples) {
      const [qu, qt] = quantizeRailUT(u, t);
      const [qu2, qt2] = quantizeRailUT(qu, qt);
      expect(qu2).toBe(qu);
      expect(qt2).toBe(qt);
    }
  });

  it('a snapped point keys identically under the band exact-string and the complement quantizer', () => {
    // After snapping, the band's `${u}|${t}` and the complement's railVertexKey
    // must agree on identity: two snapped points equal under one are equal under
    // the other, and unequal under one are unequal under the other. The snapped
    // values are themselves exact `k/QSCALE` ratios, so the band string is a
    // faithful proxy for the quantized cell.
    for (let i = 0; i < samples.length; i++) {
      for (let j = 0; j < samples.length; j++) {
        const [ua, ta] = quantizeRailUT(samples[i][0], samples[i][1]);
        const [ub, tb] = quantizeRailUT(samples[j][0], samples[j][1]);
        const bandEq = bandKey(ua, ta) === bandKey(ub, tb);
        const compEq = railVertexKey(ua, ta) === railVertexKey(ub, tb);
        expect(compEq).toBe(bandEq);
      }
    }
  });

  it('two raw (u,t) the complement rounds to the SAME cell are merged by quantizeRailUT (no split)', () => {
    // Two raw points within half a QSCALE quantum of the SAME grid node round to
    // the same quantized cell on the complement side. Anchor on an already-snapped
    // node (so its u·QSCALE / t·QSCALE land on integers), then perturb by strictly
    // less than half a quantum either way: both raw points round back to the node,
    // and quantizeRailUT must map them to the IDENTICAL snapped (u,t) so the band
    // stores ONE vertex too.
    const node = quantizeRailUT(0.123456789, 0.654321); // exact k/QSCALE node
    const eps = 0.49 / QSCALE; // < half a quantum either side of the node
    const a = quantizeRailUT(node[0] + eps, node[1] + eps);
    const b = quantizeRailUT(node[0] - eps, node[1] - eps);
    expect(bandKey(a[0], a[1])).toBe(bandKey(node[0], node[1]));
    expect(bandKey(b[0], b[1])).toBe(bandKey(node[0], node[1]));
    expect(railVertexKey(a[0], a[1])).toBe(railVertexKey(b[0], b[1]));
  });

  it('railVertexKey replicates the complement vertexIndex packed formula exactly', () => {
    // Replicate the source formula independently and assert byte-equality on a
    // snapped point. (A one-bit difference would defeat the whole spike.)
    const [u, t] = quantizeRailUT(0.123456789, 0.987654321);
    const expected = Math.round(u * QSCALE) * (QSCALE * 2 + 1) + Math.round(t * QSCALE);
    expect(railVertexKey(u, t)).toBe(expected);
  });

  it('a seam pair (u≈0 and the matching u≈1 dyadic) maps to ONE key', () => {
    // The complement closes the seam (u=1 column → u=0 column). quantizeRailUT
    // takes u mod 1 BEFORE rounding, so a point at u≈1 and its twin at u≈0 (same
    // dyadic t) collapse to the IDENTICAL snapped (u,t) and the IDENTICAL key.
    const t = 0.375; // exact dyadic t (3/8)
    const nearOne = quantizeRailUT(1 - 0.3 / QSCALE, t); // rounds to u mod 1 = 0
    const nearZero = quantizeRailUT(0.3 / QSCALE, t);     // rounds to u = 0
    expect(nearOne[0]).toBe(0);
    expect(nearZero[0]).toBe(0);
    expect(railVertexKey(nearOne[0], nearOne[1])).toBe(railVertexKey(nearZero[0], nearZero[1]));
    expect(bandKey(nearOne[0], nearOne[1])).toBe(bandKey(nearZero[0], nearZero[1]));
  });
});

// ── A minimal hand-built 2-leaf quadtree: two same-level cells stacked in t,
//    sharing the horizontal edge t=0.5. Both span the full u-period [0,1].
//    QuadLeaf fixtures may omit iu/it/uExtra (uExtra=0) — the triangulator
//    reconstructs them. uBias=0 → isotropic. ──
function twoLeafQuadtree(): QuadtreeLike {
  const leaves: QuadLeaf[] = [
    { u0: 0, t0: 0, level: 1 },   // BOTTOM cell: t ∈ [0, 0.5]
    { u0: 0, t0: 0.5, level: 1 }, // TOP cell:    t ∈ [0.5, 1]
  ];
  return {
    leaves: () => leaves,
    uBias: () => 0,
  };
}

describe('railKey — Part 2: 2-cell adoption de-risk (the real gate)', () => {
  it('an ON-EDGE snapped rail vertex resolves to ONE id shared by both cells; interior documented', () => {
    const qt = twoLeafQuadtree();

    // The shared edge is the horizontal line t = 0.5. The rail runs across it:
    //   - ON-EDGE vertex:  (uMid, 0.5) — exactly on the shared edge.
    //   - INTERIOR vertex: (uMid, 0.25) — strictly inside the BOTTOM cell.
    // Snap both to the QSCALE dyadic grid (Task 1's contract). 0.5 and 0.25 are
    // already exact dyadic; uMid is chosen non-dyadic to exercise the snap.
    const uMid = 0.317; // non-dyadic
    const [onU, onT] = quantizeRailUT(uMid, 0.5);   // ON the shared edge
    const [inU, inT] = quantizeRailUT(uMid, 0.25);  // interior to BOTTOM cell

    // A short rail FeatureLine through both cells: it must CROSS the shared edge
    // so both cells classify it as a feature cell. Endpoints snapped too so every
    // vertex lives on the QSCALE grid.
    const [aU, aT] = quantizeRailUT(uMid, 0.1);  // inside BOTTOM
    const [bU, bT] = quantizeRailUT(uMid, 0.9);  // inside TOP
    const rail: FeatureLine = {
      kind: 'general-curve',
      label: 'rail',
      points: [
        { u: aU, t: aT },
        { u: inU, t: inT },  // interior point of the BOTTOM cell
        { u: onU, t: onT },  // ON the shared edge
        { u: bU, t: bT },
      ],
    };

    const mesh = triangulateQuadtreeWithFeatures(qt, [rail], { cornerSnap: 0 });

    const nV = mesh.vertices.length / 3;
    expect(nV).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);

    // Locate output vertices matching the ON-EDGE and INTERIOR snapped (u,t)
    // (within one QSCALE quantum — the dedup precision). A SHARED vertex appears
    // EXACTLY ONCE in the output vertex table (vertexIndex deduped it) and is
    // referenced by triangles owned by BOTH cells. We do not have per-triangle
    // ownership tags, so we use the topological proxy: the unique on-edge vertex
    // is referenced by triangles on both sides of t=0.5, and the watertight audit
    // shows no T-junction at the shared edge.
    const tol = 1.5 / QSCALE;
    const matches = (vi: number, u: number, t: number): boolean =>
      Math.abs(mesh.vertices[vi * 3] - u) <= tol &&
      Math.abs(mesh.vertices[vi * 3 + 1] - t) <= tol;

    const onEdgeIds: number[] = [];
    const interiorIds: number[] = [];
    for (let vi = 0; vi < nV; vi++) {
      if (matches(vi, onU, onT)) onEdgeIds.push(vi);
      if (matches(vi, inU, inT)) interiorIds.push(vi);
    }

    // ── THE GATE: the on-edge snapped vertex exists as EXACTLY ONE id ──
    expect(onEdgeIds.length).toBe(1);
    const onEdgeId = onEdgeIds[0];

    // …and that single id is referenced by triangles whose vertices span BOTH
    // sides of the shared edge (i.e. it is genuinely shared, not a one-sided
    // vertex that happens to be unique). Collect the t of every co-triangle
    // vertex; the on-edge vertex must touch a triangle reaching into t<0.5 AND
    // one reaching into t>0.5.
    let touchesBelow = false;
    let touchesAbove = false;
    for (let k = 0; k < mesh.indices.length; k += 3) {
      const tri = [mesh.indices[k], mesh.indices[k + 1], mesh.indices[k + 2]];
      if (!tri.includes(onEdgeId)) continue;
      for (const v of tri) {
        const tv = mesh.vertices[v * 3 + 1];
        if (tv < 0.5 - tol) touchesBelow = true;
        if (tv > 0.5 + tol) touchesAbove = true;
      }
    }
    expect(touchesBelow).toBe(true);
    expect(touchesAbove).toBe(true);

    // Watertight audit on the (u,t,0) mesh. The 2-leaf patch is the RECTANGLE
    // u∈[0,0.5]×t∈[0,1] (two level-1 cells span Δu=0.5 each, NOT the full period),
    // so its true OPEN boundary is the FULL outer perimeter: u=0, u=0.5, t=0, t=1.
    // The ONLY interior edge is the shared line t=0.5, u∈(0,0.5). Classify the
    // whole outer rectangle ring as boundary; any remaining count-1 edge can only
    // sit on the shared edge → a real crack (T-junction) there means the on-edge
    // vertex did NOT reconcile. This is the decisive seam test.
    const positions = new Float32Array(nV * 3);
    for (let vi = 0; vi < nV; vi++) {
      positions[vi * 3] = mesh.vertices[vi * 3];
      positions[vi * 3 + 1] = mesh.vertices[vi * 3 + 1];
      positions[vi * 3 + 2] = 0;
    }
    const uLo = 0;
    const uHi = 0.5;
    const onOuter = (uv: number, tv: number): boolean =>
      Math.round(tv * QSCALE) === 0 ||
      Math.round(tv * QSCALE) === QSCALE ||
      Math.round(uv * QSCALE) === Math.round(uLo * QSCALE) ||
      Math.round(uv * QSCALE) === Math.round(uHi * QSCALE);
    const boundary = new Set<number>();
    for (let vi = 0; vi < nV; vi++) {
      if (onOuter(mesh.vertices[vi * 3], mesh.vertices[vi * 3 + 1])) boundary.add(vi);
    }
    const auditMesh: Mesh3 = { positions, indices: mesh.indices };
    const audit = auditWatertight(auditMesh, { boundaryVertexIndices: boundary });

    // No T-junction on the shared edge → the on-edge vertex is shared watertight.
    expect(audit.tJunctions).toBe(0);
    expect(audit.nonManifoldEdges).toBe(0);

    // ── DOCUMENT the interior vertex (Task 3's force-register, NOT a Task-1 gate). ──
    // The interior rail vertex (uMid, 0.25) lies strictly inside the BOTTOM cell.
    // The complement's registry is ON-EDGE-ONLY (`registerBoundary` registers a
    // feature point only when it sits on a cell edge), so an interior rail vertex
    // is owned by exactly ONE cell — the neighbouring TOP cell never sees it and
    // could NOT adopt it even if a rail elsewhere shared that (u,t). It exists in
    // the table (it's a real feature vertex of the bottom cell) but it is NOT a
    // CROSS-CELL shared vertex. That cross-cell adoption is exactly what Task 3's
    // force-register adds. We confirm the interior vertex is touched ONLY by
    // bottom-cell triangles (every co-triangle vertex has t ≤ 0.5).
    expect(interiorIds.length).toBe(1);
    const interiorId = interiorIds[0];
    let interiorTouchesAbove = false;
    for (let k = 0; k < mesh.indices.length; k += 3) {
      const tri = [mesh.indices[k], mesh.indices[k + 1], mesh.indices[k + 2]];
      if (!tri.includes(interiorId)) continue;
      for (const v of tri) {
        if (mesh.vertices[v * 3 + 1] > 0.5 + tol) interiorTouchesAbove = true;
      }
    }
    // Interior vertex is confined to the bottom cell → NOT yet cross-cell shared.
    const interiorCrossCellShared = interiorTouchesAbove;
    // eslint-disable-next-line no-console
    console.log(
      `[Task1 gate] ON-EDGE=SHARES (id=${onEdgeId}, count=${onEdgeIds.length}, ` +
      `touchesBelow=${touchesBelow} touchesAbove=${touchesAbove}); ` +
      `INTERIOR cross-cell-shared=${interiorCrossCellShared ? 'YES' : 'NO (single-cell — needs Task 3 force-register)'}; ` +
      `tJunctions=${audit.tJunctions} nonManifold=${audit.nonManifoldEdges} nV=${nV}`,
    );
    // Task-1 expectation: interior is single-cell (NOT cross-cell shared yet).
    expect(interiorCrossCellShared).toBe(false);
  });
});
