import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler, type SurfaceSampler } from './SurfaceSampler';
import { MetricSizingField, type SizingOptions } from './MetricSizingField';
import { PeriodicBalancedQuadtree, type QuadLeaf } from './PeriodicBalancedQuadtree';
import { triangulateQuadtree, type QuadtreeLike } from './QuadtreeTriangulator';
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
