import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler, type SurfaceSampler } from './SurfaceSampler';
import { MetricSizingField, type SizingOptions } from './MetricSizingField';
import { PeriodicBalancedQuadtree, type QuadLeaf } from './PeriodicBalancedQuadtree';
import {
  triangulateQuadtree,
  maxMinAngleTriangulation,
  type QuadtreeLike,
  type Efg,
} from './QuadtreeTriangulator';
import { triangleQualityDistribution } from '../../../../fidelity/metrics';

interface Tri {
  a: number;
  b: number;
  c: number;
}

function tris(indices: Uint32Array): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    out.push({ a: indices[i], b: indices[i + 1], c: indices[i + 2] });
  }
  return out;
}

function signedArea(verts: Float32Array, t: Tri, wrapsSeam: boolean): number {
  // Seam-aware: a right-seam triangle's u=1 corners were collapsed onto the u=0
  // column. Unwrap those (u=0 → u=1) so the area reflects true winding.
  let ax = verts[t.a * 3];
  let bx = verts[t.b * 3];
  let cx = verts[t.c * 3];
  const ay = verts[t.a * 3 + 1];
  const by = verts[t.b * 3 + 1];
  const cy = verts[t.c * 3 + 1];
  if (wrapsSeam) {
    if (ax < 1e-6) ax += 1;
    if (bx < 1e-6) bx += 1;
    if (cx < 1e-6) cx += 1;
  }
  return 0.5 * ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
}

/** Undirected edge-use counts keyed by deduped index pairs. */
function edgeUse(triangles: Tri[]): Map<string, number> {
  const m = new Map<string, number>();
  const bump = (i: number, j: number): void => {
    const k = i < j ? `${i}_${j}` : `${j}_${i}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  for (const t of triangles) {
    bump(t.a, t.b);
    bump(t.b, t.c);
    bump(t.c, t.a);
  }
  return m;
}

function assertCoreInvariants(
  verts: Float32Array,
  indices: Uint32Array,
  seamTriangles: Uint8Array,
): { boundaryEdges: [number, number][] } {
  const triangles = tris(indices);
  // Orientation: every triangle CCW (signed area > 0).
  for (let ti = 0; ti < triangles.length; ti++) {
    expect(signedArea(verts, triangles[ti], seamTriangles[ti] === 1)).toBeGreaterThan(0);
  }
  // Manifold: no edge used > 2 times.
  const eu = edgeUse(triangles);
  const boundaryEdges: [number, number][] = [];
  for (const [k, count] of eu) {
    expect(count).toBeLessThanOrEqual(2);
    if (count === 1) {
      const [i, j] = k.split('_').map(Number);
      boundaryEdges.push([i, j]);
    }
  }
  // Seam closed: boundary edges (used once) only where both endpoints are at
  // t≈0 or t≈1 — never along u≈0/u≈1.
  for (const [i, j] of boundaryEdges) {
    const ti = verts[i * 3 + 1];
    const tj = verts[j * 3 + 1];
    const bothBottom = ti < 1e-6 && tj < 1e-6;
    const bothTop = ti > 1 - 1e-6 && tj > 1 - 1e-6;
    expect(bothBottom || bothTop).toBe(true);
  }
  return { boundaryEdges };
}

describe('triangulateQuadtree — uniform level-2 tree', () => {
  it('2 triangles per quad, 32 triangles, invariants hold', () => {
    // Constant target forcing uniform level 2 (sqrt(E)=2πR0≈314 wide).
    // 314/2^L ≤ target ⇒ choose target=80 ⇒ 2^L≥3.93 ⇒ L=2.
    const s = new SyntheticCylinderSampler(50, 120);
    const opts: SizingOptions = {
      maxSagMm: 0.1,
      minEdgeMm: 80,
      maxEdgeMm: 80,
      gradeRatio: 2,
      resU: 9,
      resT: 9,
    };
    const field = new MetricSizingField(s, opts);
    const qt = new PeriodicBalancedQuadtree(field, s, { maxLevel: 5 });
    expect(qt.leaves().every((l) => l.level === 2)).toBe(true);
    expect(qt.leaves().length).toBe(16);

    const { vertices, indices, seamTriangles } = triangulateQuadtree(qt);
    expect(indices.length / 3).toBe(32);
    assertCoreInvariants(vertices, indices, seamTriangles);
  });
});

/**
 * A hand-built, 2:1-balanced quadtree: a 2×2 base (level 1) with the SW quad
 * split to level 2. The triangulator infers split sides from the leaf set, so
 * the fixture is just a list of leaves.
 */
function handForcedTree(): QuadtreeLike {
  const leaves: QuadLeaf[] = [
    // SW quadrant refined to level 2 (size 0.25 each).
    { u0: 0.0, t0: 0.0, level: 2 },
    { u0: 0.25, t0: 0.0, level: 2 },
    { u0: 0.0, t0: 0.25, level: 2 },
    { u0: 0.25, t0: 0.25, level: 2 },
    // The other three level-1 quads (size 0.5).
    { u0: 0.5, t0: 0.0, level: 1 },
    { u0: 0.0, t0: 0.5, level: 1 },
    { u0: 0.5, t0: 0.5, level: 1 },
  ];
  return { leaves: () => leaves };
}

describe('triangulateQuadtree — transition template (one quadrant finer)', () => {
  it('no T-junctions; mid-edge vertices shared; invariants hold', () => {
    const qt = handForcedTree();
    const { vertices, indices, seamTriangles } = triangulateQuadtree(qt);
    assertCoreInvariants(vertices, indices, seamTriangles);
    // Sanity: a transition mid-edge vertex (u=0.5,t=0.25 — between the two
    // east level-2 cells and the level-1 east quad) exists and is shared.
    const target = { u: 0.5, t: 0.25 };
    let found = -1;
    for (let v = 0; v < vertices.length / 3; v++) {
      if (
        Math.abs(vertices[v * 3] - target.u) < 1e-6 &&
        Math.abs(vertices[v * 3 + 1] - target.t) < 1e-6
      ) {
        found = v;
        break;
      }
    }
    expect(found).toBeGreaterThanOrEqual(0);
    // That mid-edge vertex must be an endpoint of at least one triangle edge of
    // the coarse (level-1) east quad — guaranteed by the template (else T-junc).
    const eu = edgeUse(tris(indices));
    let used = false;
    for (const k of eu.keys()) {
      const [i, j] = k.split('_').map(Number);
      if (i === found || j === found) {
        used = true;
        break;
      }
    }
    expect(used).toBe(true);
  });
});

/**
 * A hand-built periodic tree exercising the N-mid (quarter-point) transition
 * template (GAP 1 directional refine, Stage 3): the TOP row is coarse (level 1,
 * uExtra=0 → 2 u-columns of width 0.5 over t∈[0.5,1]); the BOTTOM row is
 * directionally u-refined TWICE (level 1, uExtra=2 → eUL=3 → 8 u-columns of width
 * 0.125 over t∈[0,0.5]). Each top cell's south edge (width 0.5) is therefore
 * subdivided at QUARTER points (u = +0.125, +0.25, +0.375) by 4 bottom cells —
 * the registry must hand the top cell all 3 interior points so the shared t=0.5
 * edge is T-junction-free.
 */
function quarterPointTree(): QuadtreeLike {
  const leaves: QuadLeaf[] = [];
  // Top row: 2 coarse columns, t∈[0.5,1].
  for (let iu = 0; iu < 2; iu++) {
    leaves.push({ u0: iu / 2, t0: 0.5, level: 1, iu, it: 1, uExtra: 0 });
  }
  // Bottom row: 8 directional columns (eUL=3, width 0.125), t∈[0,0.5].
  for (let iu = 0; iu < 8; iu++) {
    leaves.push({ u0: iu / 8, t0: 0.0, level: 1, iu, it: 0, uExtra: 2 });
  }
  return { leaves: () => leaves, uBias: () => 0 };
}

describe('triangulateQuadtree — N-mid quarter-point transition (directional)', () => {
  it('quarter-subdivided coarse edge is T-junction-free; invariants hold', () => {
    const qt = quarterPointTree();
    const { vertices, indices, seamTriangles } = triangulateQuadtree(qt);
    // No interior boundary edge anywhere except the open t=0 / t=1 rings.
    assertCoreInvariants(vertices, indices, seamTriangles);
    // The 3 quarter-point vertices on the first top cell's south edge exist and
    // are each used by some triangle edge (referenced by BOTH the top cell's
    // centre-fan and the bottom cells → shared, no T-junction).
    const eu = edgeUse(tris(indices));
    for (const u of [0.125, 0.25, 0.375]) {
      let found = -1;
      for (let v = 0; v < vertices.length / 3; v++) {
        if (Math.abs(vertices[v * 3] - u) < 1e-6 && Math.abs(vertices[v * 3 + 1] - 0.5) < 1e-6) {
          found = v;
          break;
        }
      }
      expect(found).toBeGreaterThanOrEqual(0);
      let used = false;
      for (const k of eu.keys()) {
        const [i, j] = k.split('_').map(Number);
        if (i === found || j === found) { used = true; break; }
      }
      expect(used).toBe(true);
    }
  });
});

describe('triangulateQuadtree — real mixed-level tree (5,6,7)', () => {
  it('invariants hold at scale (manifold, seam-closed, CCW)', () => {
    // Same fixture as the quadtree balance test: genuinely mixed levels with
    // many transition cells and full seam wrap.
    const s = new SyntheticCylinderSampler(50, 120, 8, 2);
    const opts: SizingOptions = {
      maxSagMm: 0.1,
      minEdgeMm: 0.5,
      maxEdgeMm: 120,
      gradeRatio: 4,
      resU: 65,
      resT: 9,
    };
    const field = new MetricSizingField(s, opts);
    const qt = new PeriodicBalancedQuadtree(field, s, { maxLevel: 7 });
    const levels = new Set(qt.leaves().map((l) => l.level));
    expect(levels.size).toBeGreaterThan(1);

    const { vertices, indices, seamTriangles } = triangulateQuadtree(qt);
    assertCoreInvariants(vertices, indices, seamTriangles);
  });
});

// ── Task 3 — Tier 1b: shape-aware templates ──────────────────────────────────
//
// A leaf may carry a per-leaf first fundamental form `efg = {E,F,G}` (tagged by
// the quadtree where the metric lives, Task 2). When present AND the cell is
// anisotropic (cellAspect3D > EPS) OR globally biased (B>0), the triangulator
// chooses the shorter 3D diagonal for a plain quad and ear-clips transition
// polygons by locally-max-min 3D angle, instead of the SW→NE diagonal /
// centroid fan. When `efg` is absent OR the cell is isotropic (E==G,F==0,B==0),
// the legacy templates are emitted byte-for-byte (smooth-style no-regression).

/**
 * A scaled-plane sampler: position(u,t) = (SX·u, SY·t, 0). Its first fundamental
 * form is constant: E = SX², F = 0, G = SY². So a leaf tagged `efg={SX²,0,SY²}`
 * is metric-exact, and 3D triangle angles equal the angles of the (SX·u, SY·t)
 * planar image — letting us gate quality on `triangleQualityDistribution`.
 */
class ScaledPlaneSampler implements SurfaceSampler {
  constructor(private readonly sx: number, private readonly sy: number) {}
  position(u: number, t: number): readonly [number, number, number] {
    return [this.sx * u, this.sy * t, 0];
  }
}

/**
 * A SHEARED plane sampler: position(u,t) = (SX·u + SHEAR·t, SY·t, 0). Constant
 * first fundamental form: E = SX², F = SX·SHEAR, G = SHEAR² + SY². With F≠0 the
 * two quad diagonals have genuinely different 3D lengths, so the shorter-3D-
 * diagonal template can lift the worst angle (an axis-aligned anisotropic cell's
 * diagonals are equal — only shear makes them differ).
 */
class ShearedPlaneSampler implements SurfaceSampler {
  constructor(
    private readonly sx: number,
    private readonly sy: number,
    private readonly shear: number,
  ) {}
  position(u: number, t: number): readonly [number, number, number] {
    return [this.sx * u + this.shear * t, this.sy * t, 0];
  }
  efg(): { E: number; F: number; G: number } {
    return { E: this.sx * this.sx, F: this.sx * this.shear, G: this.shear * this.shear + this.sy * this.sy };
  }
}

/** Map a (u,t,0)-packed quadtree mesh to 3D via a sampler, for the angle metric. */
function to3D(verts: Float32Array, sampler: SurfaceSampler): Float32Array {
  const out = new Float32Array(verts.length);
  for (let i = 0; i < verts.length / 3; i++) {
    const p = sampler.position(verts[i * 3], verts[i * 3 + 1]);
    out[i * 3] = p[0];
    out[i * 3 + 1] = p[1];
    out[i * 3 + 2] = p[2];
  }
  return out;
}

/**
 * Drop triangles flagged as seam-wrapping (their u=1 corners were collapsed onto
 * the u=0 column, so a direct sampler eval would mis-place them in 3D). The
 * shape-template quality is measured on the non-seam interior triangles.
 */
function nonSeamIndices(indices: Uint32Array, seam: Uint8Array): Uint32Array {
  const out: number[] = [];
  for (let i = 0; i < seam.length; i++) {
    if (seam[i] === 1) continue;
    out.push(indices[i * 3], indices[i * 3 + 1], indices[i * 3 + 2]);
  }
  return Uint32Array.from(out);
}

/** Min interior 3D angle (deg) over all non-degenerate, non-seam triangles. */
function minAngle3D(
  verts: Float32Array, indices: Uint32Array, seam: Uint8Array, sampler: SurfaceSampler,
): number {
  const v3 = to3D(verts, sampler);
  return triangleQualityDistribution({ vertices: v3, indices: nonSeamIndices(indices, seam) }).minAngleDeg;
}

/** Count non-seam triangles with 3D area ≤ 1e-12 (degenerate). */
function degenerate3D(
  verts: Float32Array, indices: Uint32Array, seam: Uint8Array, sampler: SurfaceSampler,
): number {
  const v3 = to3D(verts, sampler);
  return triangleQualityDistribution({ vertices: v3, indices: nonSeamIndices(indices, seam) }).degenerateCount;
}

/**
 * A single isotropic leaf with mid-edge subdivision on every side (so it takes
 * the singleMid transition branch), tagged isotropic so the legacy centroid fan
 * must be emitted verbatim. Surrounding finer neighbours create the mids.
 */
function isotropicTransitionTree(efg?: { E: number; F: number; G: number }): QuadtreeLike {
  const leaves: QuadLeaf[] = [
    // Centre coarse cell (level 1, the cell under test), tagged isotropic.
    { u0: 0.0, t0: 0.0, level: 1, iu: 0, it: 0, efg },
    // East coarse cell so the centre's east edge has no finer neighbour... no:
  ];
  // Simpler: a 2x2 base with SW refined to level 2 (the handForcedTree shape),
  // but tag the coarse cells isotropic. The level-1 east/north cells then carry
  // a single mid on the side facing the refined SW quadrant.
  leaves.length = 0;
  leaves.push({ u0: 0.0, t0: 0.0, level: 2, iu: 0, it: 0, efg });
  leaves.push({ u0: 0.25, t0: 0.0, level: 2, iu: 1, it: 0, efg });
  leaves.push({ u0: 0.0, t0: 0.25, level: 2, iu: 0, it: 1, efg });
  leaves.push({ u0: 0.25, t0: 0.25, level: 2, iu: 1, it: 1, efg });
  leaves.push({ u0: 0.5, t0: 0.0, level: 1, iu: 1, it: 0, efg }); // east, single mid on west edge
  leaves.push({ u0: 0.0, t0: 0.5, level: 1, iu: 0, it: 1, efg }); // north, single mid on south edge
  leaves.push({ u0: 0.5, t0: 0.5, level: 1, iu: 1, it: 1, efg });
  return { leaves: () => leaves, uBias: () => 0 };
}

describe('triangulateQuadtree — Tier 1b shape-aware templates (Task 3)', () => {
  it('(a) isotropic efg (E==G,F==0,B==0) emits byte-identical legacy indices', () => {
    // Two identical hand-built trees: one with NO efg (legacy), one tagged with a
    // perfectly isotropic efg. The aspect gate must NOT fire on the isotropic one,
    // so both emit identical vertices AND indices (the SW→NE diagonal + centroid
    // fan), proving the smooth-default path stays byte-identical.
    const legacy = triangulateQuadtree(isotropicTransitionTree(undefined));
    const isotropic = triangulateQuadtree(isotropicTransitionTree({ E: 4, F: 0, G: 4 }));
    expect(Array.from(isotropic.indices)).toEqual(Array.from(legacy.indices));
    expect(Array.from(isotropic.vertices)).toEqual(Array.from(legacy.vertices));
    expect(Array.from(isotropic.seamTriangles)).toEqual(Array.from(legacy.seamTriangles));
  });

  it('(a2) plain isotropic quad uses the legacy SW→NE diagonal (tie-break)', () => {
    // A 2×2 uniform isotropic tree: every cell is a plain quad with no mid. The
    // SW→NE vs SE→NW 3D diagonals are equal (square), so the tie must resolve to
    // SW→NE — byte-identical to the un-tagged legacy mesh.
    const plain = (efg?: { E: number; F: number; G: number }): QuadtreeLike => ({
      leaves: () => [
        { u0: 0.0, t0: 0.0, level: 1, iu: 0, it: 0, efg },
        { u0: 0.5, t0: 0.0, level: 1, iu: 1, it: 0, efg },
        { u0: 0.0, t0: 0.5, level: 1, iu: 0, it: 1, efg },
        { u0: 0.5, t0: 0.5, level: 1, iu: 1, it: 1, efg },
      ],
      uBias: () => 0,
    });
    const legacy = triangulateQuadtree(plain(undefined));
    const isotropic = triangulateQuadtree(plain({ E: 9, F: 0, G: 9 }));
    expect(Array.from(isotropic.indices)).toEqual(Array.from(legacy.indices));
  });

  it('(b) plain quad picks the shorter 3D diagonal on a sheared cell', () => {
    // A sheared metric (F≠0): the SW→NE 3D diagonal (legacy) is materially longer
    // than SE→NW, so the SW→NE split radiates a thinner triangle. The shorter-
    // diagonal template must split SE→NW instead, lifting the worst 3D min angle.
    // (An axis-aligned anisotropic cell's diagonals are EQUAL — only shear differs
    // them — which is why this fixture shears.) A 2×2 plain tree is used so the
    // measured SW cell does NOT wrap the periodic seam.
    const sampler = new ShearedPlaneSampler(6, 2, 8);
    const efg = sampler.efg();
    // A uniform 4×4 (level-2) tree; tag ONLY the strictly-interior cell at
    // (iu=1,it=1) so it flips diagonal while every neighbour stays legacy. Strict
    // interior ⇒ no seam-collapse coincidence (the 2×2 case has the right cell's
    // collapsed NE corner land on the left cell's diagonal endpoint).
    const TAG_IU = 1, TAG_IT = 1;
    const tree = (tag?: typeof efg): QuadtreeLike => {
      const leaves: QuadLeaf[] = [];
      for (let it = 0; it < 4; it++) {
        for (let iu = 0; iu < 4; iu++) {
          const isTag = iu === TAG_IU && it === TAG_IT;
          leaves.push({ u0: iu / 4, t0: it / 4, level: 2, iu, it, efg: isTag ? tag : undefined });
        }
      }
      return { leaves: () => leaves, uBias: () => 0 };
    };
    // Measure ONLY the tagged interior cell (its 2 triangles), so the comparison
    // isolates the diagonal choice.
    const cellTris = (m: ReturnType<typeof triangulateQuadtree>): Uint32Array => {
      const lo = TAG_IU / 4, hiU = (TAG_IU + 1) / 4, t0 = TAG_IT / 4, t1 = (TAG_IT + 1) / 4;
      const inCell = (vi: number): boolean => {
        const u = m.vertices[vi * 3], t = m.vertices[vi * 3 + 1];
        return u >= lo - 1e-9 && u <= hiU + 1e-9 && t >= t0 - 1e-9 && t <= t1 + 1e-9;
      };
      const out: number[] = [];
      for (let i = 0; i < m.indices.length; i += 3) {
        const a = m.indices[i], b = m.indices[i + 1], c = m.indices[i + 2];
        if (inCell(a) && inCell(b) && inCell(c)) out.push(a, b, c);
      }
      return Uint32Array.from(out);
    };
    const legacy = triangulateQuadtree(tree(undefined)); // SW→NE
    const shaped = triangulateQuadtree(tree(efg)); // shorter diagonal
    const v3l = to3D(legacy.vertices, sampler);
    const v3s = to3D(shaped.vertices, sampler);
    const legacyMin = triangleQualityDistribution({ vertices: v3l, indices: cellTris(legacy) }).minAngleDeg;
    const shapedMin = triangleQualityDistribution({ vertices: v3s, indices: cellTris(shaped) }).minAngleDeg;
    expect(shapedMin).toBeGreaterThan(legacyMin + 1e-6);
    expect(triangleQualityDistribution({ vertices: v3s, indices: cellTris(shaped) }).degenerateCount).toBe(0);
    assertCoreInvariants(shaped.vertices, shaped.indices, shaped.seamTriangles);
  });

  it('(b2) N-mid transition cell: ear-clip lifts worst 3D angle above the centroid fan', () => {
    // The quarter-point top cell carries THREE collinear mids on its south edge.
    // The centroid fan radiates 7 triangles from (um,tm) — under an anisotropic
    // (8:1) metric the fan spokes to the 3 south mids are needles. The apex-
    // anchored max-min-angle ear-clip triangulates the heptagon directly, lifting
    // the worst 3D angle. The measured iu=0 top cell does NOT wrap the seam; only
    // it is tagged, so the seam stays a clean cell edge.
    const SX = 8, SY = 1;
    const sampler = new ScaledPlaneSampler(SX, SY);
    const efg = { E: SX * SX, F: 0, G: SY * SY };
    const buildTree = (tag?: typeof efg): QuadtreeLike => {
      const leaves: QuadLeaf[] = [];
      leaves.push({ u0: 0 / 2, t0: 0.5, level: 1, iu: 0, it: 1, uExtra: 0, efg: tag }); // measured
      leaves.push({ u0: 1 / 2, t0: 0.5, level: 1, iu: 1, it: 1, uExtra: 0 }); // wraps seam — legacy
      for (let iu = 0; iu < 8; iu++) {
        leaves.push({ u0: iu / 8, t0: 0.0, level: 1, iu, it: 0, uExtra: 2 });
      }
      return { leaves: () => leaves, uBias: () => 0 };
    };
    const legacy = triangulateQuadtree(buildTree(undefined));
    const shaped = triangulateQuadtree(buildTree(efg));
    const legacyMin = minAngle3D(legacy.vertices, legacy.indices, legacy.seamTriangles, sampler);
    const shapedMin = minAngle3D(shaped.vertices, shaped.indices, shaped.seamTriangles, sampler);
    expect(shapedMin).toBeGreaterThan(legacyMin + 1e-6);
    assertCoreInvariants(shaped.vertices, shaped.indices, shaped.seamTriangles);
  });

  it('(c) N-mid ear-clip on a near-collinear mid set emits no zero-area triangle', () => {
    // The quarter-point tree's top cells carry THREE collinear mid points on the
    // south edge (a near-collinear mid set). Tagged anisotropic so the ear-clip
    // template fires, the result must contain NO degenerate (zero-area) triangle
    // and stay CCW + manifold + seam-closed.
    const SX = 8, SY = 1;
    const sampler = new ScaledPlaneSampler(SX, SY);
    const efg = { E: SX * SX, F: 0, G: SY * SY };
    const tree: QuadtreeLike = (() => {
      const leaves: QuadLeaf[] = [];
      for (let iu = 0; iu < 2; iu++) {
        leaves.push({ u0: iu / 2, t0: 0.5, level: 1, iu, it: 1, uExtra: 0, efg });
      }
      for (let iu = 0; iu < 8; iu++) {
        leaves.push({ u0: iu / 8, t0: 0.0, level: 1, iu, it: 0, uExtra: 2, efg });
      }
      return { leaves: () => leaves, uBias: () => 0 };
    })();
    const mesh = triangulateQuadtree(tree);
    expect(degenerate3D(mesh.vertices, mesh.indices, mesh.seamTriangles, sampler)).toBe(0);
    // (u,t)-space invariants: CCW positive area, manifold, seam-closed.
    assertCoreInvariants(mesh.vertices, mesh.indices, mesh.seamTriangles);
  });
});

// ── Stage-1 Task 3 — Klincsek max-min-angle DP (replaces the greedy ear-clip) ─
//
// The DP must be CERTIFIED: exactly k−2 triangles, every boundary sub-edge
// covered exactly once, every triangle strictly CCW in (u,t) — i.e. ZERO
// zero-area emissions BY CONSTRUCTION, even on the exact-collinear
// corner-mid-corner runs where the deleted greedy ear-clip emitted its
// measured tens of thousands of degenerate EAR_CLIP triangles (Task-2 armed
// state: DragonScales 45,331 / ArtDeco 27,177 / BasketWeave 32,639, worst=0°).

/** Deterministic seeded LCG (no Math.random in workflow contexts). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// ── Verbatim copies of the PRE-Task-3 production code, kept ONLY as the test
// oracle: the greedy ear-clip (deleted from QuadtreeTriangulator.ts by Task 3)
// plus the two scorers it closes over. Do NOT "fix" these — they document the
// exact defect the DP replaced (collinear ears skipped not scored, bestPrev<0
// break stranding boundary sub-edges, unguarded final-3 emission).

/** Verbatim copy of the production metricLen2 (the DP/oracle scorer basis). */
function metricLen2(efg: Efg, du: number, dt: number): number {
  return efg.E * du * du + 2 * efg.F * du * dt + efg.G * dt * dt;
}

/** Verbatim copy of the production triMinAngle3D (law-of-cosines min angle). */
function triMinAngle3D(
  efg: Efg,
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
): number {
  const a2 = metricLen2(efg, p2[0] - p1[0], p2[1] - p1[1]); // opposite p0
  const b2 = metricLen2(efg, p0[0] - p2[0], p0[1] - p2[1]); // opposite p1
  const c2 = metricLen2(efg, p1[0] - p0[0], p1[1] - p0[1]); // opposite p2
  const a = Math.sqrt(Math.max(a2, 0));
  const b = Math.sqrt(Math.max(b2, 0));
  const c = Math.sqrt(Math.max(c2, 0));
  const ang = (adj1: number, adj2: number, opp: number): number => {
    if (adj1 <= 0 || adj2 <= 0) return 0;
    let cos = (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2);
    if (cos > 1) cos = 1;
    if (cos < -1) cos = -1;
    return (Math.acos(cos) * 180) / Math.PI;
  };
  return Math.min(ang(b, c, a), ang(a, c, b), ang(a, b, c));
}

/** Verbatim copy of the production signedArea2 (>0 ⇒ CCW in (u,t)). */
function signedArea2(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
): number {
  return (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
}

/** Verbatim copy of the DELETED greedy earClipMaxMinAngle — the comparison oracle. */
function greedyOracle(
  efg: Efg,
  poly: readonly [number, number][],
  idx: readonly number[],
  emit: (a: number, b: number, c: number) => void,
): void {
  const n = poly.length;
  if (n < 3) return;
  const remaining: number[] = [];
  for (let i = 0; i < n; i++) remaining.push(i);
  const AREA_EPS = 1e-18;
  while (remaining.length > 3) {
    const m = remaining.length;
    let bestPrev = -1;
    let bestScore = -Infinity;
    for (let k = 0; k < m; k++) {
      const ip = remaining[(k - 1 + m) % m];
      const ic = remaining[k];
      const inx = remaining[(k + 1) % m];
      const pp = poly[ip];
      const pc = poly[ic];
      const pn = poly[inx];
      // Valid ear: convex corner (CCW, strictly positive area) and — for the
      // convex polygons here — no containment test is needed. Reject collinear.
      const area2 = signedArea2(pp, pc, pn);
      if (area2 <= AREA_EPS) continue;
      const score = triMinAngle3D(efg, pp, pc, pn);
      if (score > bestScore) {
        bestScore = score;
        bestPrev = k;
      }
    }
    if (bestPrev < 0) break; // no convex ear (should not happen for a convex poly)
    const ip = remaining[(bestPrev - 1 + m) % m];
    const ic = remaining[bestPrev];
    const inx = remaining[(bestPrev + 1) % m];
    emit(idx[ip], idx[ic], idx[inx]);
    remaining.splice(bestPrev, 1);
  }
  if (remaining.length === 3) {
    emit(idx[remaining[0]], idx[remaining[1]], idx[remaining[2]]);
  }
}

type Tri3 = readonly [number, number, number];
type Triangulator = (
  efg: Efg,
  poly: readonly [number, number][],
  idx: readonly number[],
  emit: (a: number, b: number, c: number) => void,
) => void;

/** Run a triangulator with a collecting emit; return the emitted triples. */
function collectTris(
  fn: Triangulator,
  efg: Efg,
  poly: readonly [number, number][],
  idx: readonly number[],
): Tri3[] {
  const out: Tri3[] = [];
  fn(efg, poly, idx, (a, b, c) => out.push([a, b, c]));
  return out;
}

/**
 * Certified-completeness check (throws with `label` on the first violation so
 * the 2·10⁴-case loop stays cheap): exactly k−2 triangles; all indices from
 * the input set; every triangle STRICTLY CCW in (u,t) (signedArea2 > 0 ⇒ zero
 * zero-area emissions); every boundary sub-edge (consecutive polygon pair,
 * wrap included) covered exactly once.
 *
 * PRECONDITION: the polygon must be CONVEX — the boundary-coverage check uses
 * UNDIRECTED edge keys, which is sound only because no interior chord of a
 * convex polygon can coincide with a boundary sub-edge.
 */
function checkCertified(
  tris: Tri3[],
  poly: readonly [number, number][],
  idx: readonly number[],
  label: string,
): void {
  const k = poly.length;
  if (tris.length !== k - 2) {
    throw new Error(`${label}: emitted ${tris.length} triangles, expected k-2=${k - 2}`);
  }
  const pos = new Map<number, number>();
  idx.forEach((v, i) => pos.set(v, i));
  const edgeKey = (a: number, b: number): string => (a < b ? `${a}_${b}` : `${b}_${a}`);
  const eu = new Map<string, number>();
  for (const [a, b, c] of tris) {
    for (const v of [a, b, c]) {
      if (!pos.has(v)) throw new Error(`${label}: emitted index ${v} not in the input idx set`);
    }
    const area2 = signedArea2(
      poly[pos.get(a) as number],
      poly[pos.get(b) as number],
      poly[pos.get(c) as number],
    );
    if (!(area2 > 0)) {
      throw new Error(`${label}: non-CCW/zero-area triangle (${a},${b},${c}) area2=${area2}`);
    }
    eu.set(edgeKey(a, b), (eu.get(edgeKey(a, b)) ?? 0) + 1);
    eu.set(edgeKey(b, c), (eu.get(edgeKey(b, c)) ?? 0) + 1);
    eu.set(edgeKey(c, a), (eu.get(edgeKey(c, a)) ?? 0) + 1);
  }
  for (let i = 0; i < k; i++) {
    const key = edgeKey(idx[i], idx[(i + 1) % k]);
    const count = eu.get(key) ?? 0;
    if (count !== 1) {
      throw new Error(`${label}: boundary sub-edge ${i}->${(i + 1) % k} covered ${count}x (want 1)`);
    }
  }
}

/**
 * A randomized convex transition polygon: an axis-aligned rectangle's 4
 * corners + 0..4 on-edge mids per side (total capped at 8 ⇒ k ≤ 12), walked
 * CCW (S→E→N→W, matching the production N-mid branch). Mids share the side's
 * EXACT t (or u) coordinate, so every corner-mid-corner run is exactly
 * collinear (signedArea2 === 0) — the regime that broke the greedy. Mid
 * fractions live on a distinct 1/32 lattice. idx values are non-trivial
 * (1000 + 7i) so index-mapping bugs surface.
 */
function rectWithMids(rand: () => number): {
  poly: [number, number][];
  idx: number[];
  midCounts: number[];
} {
  const u0 = rand();
  const t0 = rand();
  const u1 = u0 + 0.05 + rand();
  const t1 = t0 + 0.05 + rand();
  const midCounts: number[] = [];
  let total = 0;
  for (let side = 0; side < 4; side++) {
    let c = Math.floor(rand() * 5); // 0..4
    if (total + c > 8) c = 8 - total;
    midCounts.push(c);
    total += c;
  }
  const fracs = (c: number): number[] => {
    const set = new Set<number>();
    let guard = 0;
    while (set.size < c) {
      set.add((1 + Math.floor(rand() * 31)) / 32);
      if (++guard > 1000) throw new Error('rectWithMids: LCG starvation');
    }
    return [...set].sort((a, b) => a - b);
  };
  const south = fracs(midCounts[0]);
  const east = fracs(midCounts[1]);
  const north = fracs(midCounts[2]);
  const west = fracs(midCounts[3]);
  const poly: [number, number][] = [];
  poly.push([u0, t0]); // SW
  for (const f of south) poly.push([u0 + f * (u1 - u0), t0]); // u ascending
  poly.push([u1, t0]); // SE
  for (const f of east) poly.push([u1, t0 + f * (t1 - t0)]); // t ascending
  poly.push([u1, t1]); // NE
  for (let i = north.length - 1; i >= 0; i--) poly.push([u0 + north[i] * (u1 - u0), t1]); // u desc
  poly.push([u0, t1]); // NW
  for (let i = west.length - 1; i >= 0; i--) poly.push([u0, t0 + west[i] * (t1 - t0)]); // t desc
  const idx = poly.map((_, i) => 1000 + i * 7);
  return { poly, idx, midCounts };
}

/**
 * A strictly convex CCW k-gon on a random ellipse (jittered equispaced angles
 * ⇒ no duplicate and no 3-collinear vertices) — the greedy oracle completes at
 * full value on these, making the optimality comparison fair.
 */
function strictlyConvexPolygon(rand: () => number, k: number): [number, number][] {
  const cx = rand() * 2 - 1;
  const cy = rand() * 2 - 1;
  const a = 0.5 + 1.5 * rand();
  const b = 0.5 + 1.5 * rand();
  const pts: [number, number][] = [];
  for (let i = 0; i < k; i++) {
    const th = (2 * Math.PI * (i + 0.1 + 0.8 * rand())) / k;
    pts.push([cx + a * Math.cos(th), cy + b * Math.sin(th)]);
  }
  return pts;
}

describe('maxMinAngleTriangulation — Klincsek DP (Stage-1 Task 3)', () => {
  it('(dp-1) certified completeness: 2·10⁴ random convex transition polygons × {isotropic, 16:1 aniso, sheared}', () => {
    const metrics: Efg[] = [
      { E: 1, F: 0, G: 1 }, // isotropic
      { E: 256, F: 0, G: 1 }, // 16:1 anisotropic
      { E: 4, F: 3, G: 4 }, // sheared (F≠0, det=7>0)
    ];
    const rand = lcg(0xc0ffee);
    const CASES = 20000;
    let sawTwoMidSide = false;
    let sawFourMidSide = false;
    let sawCollinearRun = false;
    let sawK12 = false;
    for (let c = 0; c < CASES; c++) {
      const { poly, idx, midCounts } = rectWithMids(rand);
      if (midCounts.some((m) => m === 2)) sawTwoMidSide = true;
      if (midCounts.some((m) => m === 4)) sawFourMidSide = true;
      if (midCounts.some((m) => m >= 1)) sawCollinearRun = true;
      if (poly.length === 12) sawK12 = true;
      const efg = metrics[c % 3];
      const dpTris = collectTris(maxMinAngleTriangulation, efg, poly, idx);
      checkCertified(dpTris, poly, idx, `case ${c} (k=${poly.length}, metric ${c % 3})`);
    }
    // The corpus must have exercised the required shapes: a side with TWO mids,
    // a side with FOUR mids, exact-collinear corner-mid-corner runs, and k=12.
    expect(sawTwoMidSide).toBe(true);
    expect(sawFourMidSide).toBe(true);
    expect(sawCollinearRun).toBe(true);
    expect(sawK12).toBe(true);
  });

  it('(dp-2) optimality: DP min 3D angle ≥ greedy oracle on 500 strictly-convex sheared/aniso cases', () => {
    const metrics: Efg[] = [
      { E: 256, F: 0, G: 1 }, // 16:1 anisotropic
      { E: 4, F: 3, G: 4 }, // sheared
    ];
    const rand = lcg(0xbada55);
    for (let c = 0; c < 500; c++) {
      const k = 4 + Math.floor(rand() * 9); // 4..12
      const poly = strictlyConvexPolygon(rand, k);
      const idx = poly.map((_, i) => i);
      const efg = metrics[c % 2];
      const minOf = (ts: Tri3[]): number =>
        Math.min(...ts.map(([a, b, cc]) => triMinAngle3D(efg, poly[a], poly[b], poly[cc])));
      const dpTris = collectTris(maxMinAngleTriangulation, efg, poly, idx);
      const greedyTris = collectTris(greedyOracle, efg, poly, idx);
      expect(dpTris.length).toBe(k - 2);
      expect(greedyTris.length).toBe(k - 2); // strictly convex ⇒ the greedy completes
      expect(minOf(dpTris)).toBeGreaterThanOrEqual(minOf(greedyTris) - 1e-9);
    }
  });

  it('(dp-3) collinear corner-mid-corner run: DP certified where the greedy emits zero-area or strands edges', () => {
    // Unit square + ONE exact mid on the south edge (k=5): the greedy's
    // max-min-angle order removes NE then NW, leaving the exactly-collinear
    // (SW, mid, SE) as its UNGUARDED final-3 emission — a zero-area triangle
    // (the live DragonScales 45k-degenerate defect in miniature). The DP scores
    // that triangle −∞ and finds a positive-area 3-triangulation instead.
    const poly: [number, number][] = [
      [0, 0], // SW
      [0.5, 0], // exact-collinear south mid
      [1, 0], // SE
      [1, 1], // NE
      [0, 1], // NW
    ];
    const idx = [0, 1, 2, 3, 4];
    const efg: Efg = { E: 1, F: 0, G: 1 };
    // DP: certified — k−2 triangles, all strictly CCW, boundary covered once.
    const dpTris = collectTris(maxMinAngleTriangulation, efg, poly, idx);
    checkCertified(dpTris, poly, idx, 'dp-3');
    // Greedy oracle on the SAME input: at least one zero-area triangle OR fewer
    // than k−2 triangles (stranded boundary sub-edges) — what Task 3 fixed.
    const greedyTris = collectTris(greedyOracle, efg, poly, idx);
    const zeroArea = greedyTris.filter(
      ([a, b, c]) => signedArea2(poly[a], poly[b], poly[c]) <= 1e-18,
    ).length;
    expect(greedyTris.length < poly.length - 2 || zeroArea > 0).toBe(true);
  });

  it('(dp-4) degenerate inputs: n=3 passthrough, n<3 no-op, n>16 defensive throw with poly coords', () => {
    const efg: Efg = { E: 1, F: 0, G: 1 };
    // n=3: passthrough of the (idx-mapped) single triangle.
    const tri = collectTris(
      maxMinAngleTriangulation,
      efg,
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      [7, 8, 9],
    );
    expect(tri).toEqual([[7, 8, 9]]);
    // n<3: no emission, no throw.
    expect(
      collectTris(
        maxMinAngleTriangulation,
        efg,
        [
          [0, 0],
          [1, 0],
        ],
        [0, 1],
      ),
    ).toEqual([]);
    // n>16: defensive throw (transition polygons are ≤12 in production) that
    // carries the polygon coordinates for triage.
    const big: [number, number][] = [];
    for (let i = 0; i < 17; i++) {
      big.push([Math.cos((2 * Math.PI * i) / 17), Math.sin((2 * Math.PI * i) / 17)]);
    }
    const bigIdx = big.map((_, i) => i);
    expect(() => maxMinAngleTriangulation(efg, big, bigIdx, () => {})).toThrow(/n=17/);
    expect(() => maxMinAngleTriangulation(efg, big, bigIdx, () => {})).toThrow(/poly=\[\[1,0\]/);
  });
});
