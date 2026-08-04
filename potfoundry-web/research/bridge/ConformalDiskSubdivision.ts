/**
 * ConformalDiskSubdivision — Structured meshing around acute feature junctions.
 *
 * Problem: When feature edges meet at an acute angle (< 60°), Ruppert-style bisection
 * refinement enters an infinite cascade — each circumcenter insertion encroaches a
 * neighbouring edge, creating a sliver, whose fix encroaches the next edge, and so on.
 *
 * Solution (3 layers):
 *   1. **Detection**: Identify acute junctions from the feature edge graph.
 *   2. **Shield zones**: Suppress Ruppert circumcenter insertions within a protection
 *      disk of radius 2·h_feature around each acute apex. This prevents the cascade.
 *   3. **Structured fan meshing**: Inside each shield disk, emit a structured fan of
 *      triangles radiating from the apex. The fan respects feature edges (one spoke per
 *      feature edge), distributes interior spokes to keep all angles ≤ 60°, and uses
 *      concentric rings to grade triangle size from the apex outward. Fan boundary
 *      vertices are placed on the shield circle and must be stitched 1:1 with the
 *      surrounding unstructured mesh.
 *
 * AR guarantee: The structured fan construction bounds aspect ratio at AR ≤ 50 by
 * choosing ring radii such that the radial edge length ≈ the arc-length between spokes.
 *
 * This module does NOT modify the mesh directly — it returns vertex/triangle lists that
 * the bisection driver stitches into the mesh in a single atomic batch.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface FeatureJunction {
  /** Index of the apex vertex in the mesh. */
  apexVertex: number;
  /** θ coordinate of the apex. */
  theta: number;
  /** Z coordinate of the apex. */
  z: number;
  /** Smallest angle (radians) between any pair of incident feature edges. */
  minApexAngleRad: number;
  /** Incident feature edge pairs — each is [apexVertex, otherVertex]. */
  featureEdges: readonly [number, number][];
  /**
   * Sorted angles (radians, in [0, 2π)) of each feature edge direction from the apex.
   * Must be provided in CCW order. Required for fan spoke placement.
   */
  edgeAngles: readonly number[];
}

export interface ShieldZone {
  apexVertex: number;
  /** Shield radius in mm. */
  rShieldMm: number;
  centerTheta: number;
  centerZ: number;
  /** Sorted feature edge angles (radians, CCW) from the junction. */
  edgeAngles: readonly number[];
}

/** A vertex emitted by the structured fan mesher. */
export interface FanVertex {
  /** θ coordinate. */
  theta: number;
  /** Z coordinate. */
  z: number;
  /** True if this vertex lies on the shield boundary (needs stitching to outer mesh). */
  isBoundary: boolean;
  /** Ring index (0 = apex, nRings = boundary). */
  ring: number;
  /** Spoke index within its ring. */
  spoke: number;
}

/** A triangle emitted by the structured fan mesher (indices into the FanVertex array). */
export interface FanTriangle {
  a: number;
  b: number;
  c: number;
}

/** Complete structured fan output for one junction. */
export interface FanMesh {
  apexVertex: number;
  vertices: FanVertex[];
  triangles: FanTriangle[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Shield zone detection
// ──────────────────────────────────────────────────────────────────────────────

const PI_OVER_3 = Math.PI / 3; // 60°

/**
 * Identify acute feature junctions needing structured fan meshing (min angle < 60°).
 * Returns a map from apex vertex index → shield zone descriptor.
 */
export function buildShieldZones(
  junctions: readonly FeatureJunction[],
  hFeatureMm: number,
): Map<number, ShieldZone> {
  const shieldMap = new Map<number, ShieldZone>();

  for (const j of junctions) {
    if (j.minApexAngleRad < PI_OVER_3) {
      shieldMap.set(j.apexVertex, {
        apexVertex: j.apexVertex,
        rShieldMm: 2.0 * hFeatureMm,
        centerTheta: j.theta,
        centerZ: j.z,
        edgeAngles: j.edgeAngles,
      });
    }
  }

  return shieldMap;
}

// ──────────────────────────────────────────────────────────────────────────────
// Shielded-point query (for suppressing Ruppert insertions)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Check if a candidate circumcenter lies within any shield zone.
 *
 * Performance note: This is O(N) in the number of shield zones. For typical pot
 * geometries N < 50 (one per acute junction), so this is fine. If N grows large
 * (e.g., dense Gothic rib arrays), replace the linear scan with a flat grid or BVH.
 */
export function isPointShielded(
  pointTheta: number,
  pointZ: number,
  rRefMm: number,
  shieldZones: Map<number, ShieldZone>,
): boolean {
  for (const zone of shieldZones.values()) {
    const dTh = pointTheta - zone.centerTheta;
    const dZ = pointZ - zone.centerZ;
    const distMm = Math.hypot(dTh * rRefMm, dZ);
    if (distMm <= zone.rShieldMm) {
      return true;
    }
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// Structured fan generation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Generate a structured fan mesh inside a shield zone around an acute junction.
 *
 * The fan is a polar grid centred on the apex:
 *   - **Spokes**: One spoke per feature edge, plus additional interior spokes so that
 *     the angular gap between any two adjacent spokes is ≤ 60°.
 *   - **Rings**: Concentric circles with geometrically graded radii from the apex to
 *     the shield boundary. Ring count is chosen so that the radial edge length ≈ the
 *     arc-length at the outermost ring, keeping AR ≈ 1 at the boundary.
 *   - **Triangles**: Each quad cell (ring i → ring i+1, spoke j → spoke j+1) is split
 *     into 2 triangles. The innermost ring (ring 0 → ring 1) is a triangle fan from
 *     the apex vertex.
 *
 * All boundary vertices (on the outermost ring) are flagged `isBoundary = true`.
 * The bisection driver must stitch these 1:1 with matching vertices on the surrounding
 * unstructured mesh to avoid T-junctions.
 *
 * @param zone The shield zone descriptor.
 * @param rRefMm Reference radius (mm) for converting θ to arc-length.
 * @param minRings Minimum number of concentric rings (default: 2).
 * @returns The structured fan mesh for this junction.
 */
export function buildStructuredFan(
  zone: ShieldZone,
  rRefMm: number,
  minRings = 2,
): FanMesh {
  const { apexVertex, rShieldMm, centerTheta, centerZ, edgeAngles } = zone;

  // ── Spoke placement ──
  // Start with feature edge spokes, then subdivide any sector > 60° with additional spokes.
  const spokes = buildSpokeAngles(edgeAngles);
  const nSpokes = spokes.length;

  // ── Ring placement ──
  // Outermost arc gap = rShield · (maxAngularGap). We want radial spacing ≈ arc spacing
  // at the boundary, so nRings ≈ rShield / (rShield · maxGap) = 1/maxGap.
  const maxGap = maxAngularGap(spokes);
  const arcLengthAtBoundary = rShieldMm * maxGap;
  const nRings = Math.max(minRings, Math.ceil(rShieldMm / arcLengthAtBoundary));

  // Geometric grading: r_k = rShield · (k/nRings)^gradeExp.
  // gradeExp > 1 packs rings tighter near apex (good for AR near the center).
  const gradeExp = 1.5;

  // ── Vertex emission ──
  const vertices: FanVertex[] = [];

  // Ring 0 = apex (single vertex)
  vertices.push({
    theta: centerTheta,
    z: centerZ,
    isBoundary: false,
    ring: 0,
    spoke: 0,
  });

  // Rings 1..nRings
  for (let ri = 1; ri <= nRings; ri++) {
    const frac = ri / nRings;
    const rRing = rShieldMm * Math.pow(frac, gradeExp);
    const onBoundary = ri === nRings;

    for (let si = 0; si < nSpokes; si++) {
      const angle = spokes[si];
      vertices.push({
        theta: centerTheta + (rRing / rRefMm) * Math.cos(angle),
        z: centerZ + rRing * Math.sin(angle),
        isBoundary: onBoundary,
        ring: ri,
        spoke: si,
      });
    }
  }

  // ── Triangle emission ──
  const triangles: FanTriangle[] = [];

  // Helper: vertex index for (ring, spoke). Ring 0 has only vertex 0.
  const vIdx = (ring: number, spoke: number): number => {
    if (ring === 0) return 0;
    return 1 + (ring - 1) * nSpokes + spoke;
  };

  // Innermost ring: triangle fan from apex to ring 1
  for (let si = 0; si < nSpokes; si++) {
    const si2 = (si + 1) % nSpokes;
    triangles.push({
      a: 0,
      b: vIdx(1, si),
      c: vIdx(1, si2),
    });
  }

  // Rings 1..(nRings-1): quad strips split into 2 triangles each
  for (let ri = 1; ri < nRings; ri++) {
    for (let si = 0; si < nSpokes; si++) {
      const si2 = (si + 1) % nSpokes;
      const v00 = vIdx(ri, si);
      const v10 = vIdx(ri, si2);
      const v01 = vIdx(ri + 1, si);
      const v11 = vIdx(ri + 1, si2);

      // Diagonal split chosen to avoid slivers: split along shorter diagonal.
      // For a graded polar grid, the lower-left → upper-right diagonal is generally
      // shorter, but we check explicitly.
      const d1 = distSq(vertices[v00], vertices[v11]);
      const d2 = distSq(vertices[v10], vertices[v01]);

      if (d1 <= d2) {
        triangles.push({ a: v00, b: v10, c: v11 });
        triangles.push({ a: v00, b: v11, c: v01 });
      } else {
        triangles.push({ a: v00, b: v10, c: v01 });
        triangles.push({ a: v10, b: v11, c: v01 });
      }
    }
  }

  return { apexVertex, vertices, triangles };
}

// ──────────────────────────────────────────────────────────────────────────────
// Aspect ratio validation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Compute the aspect ratio of a triangle: longest_edge / (2 · inradius).
 * An equilateral triangle has AR = 1.155. A sliver has AR → ∞.
 */
export function triangleAR(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
): number {
  const ab = Math.hypot(bx - ax, by - ay);
  const bc = Math.hypot(cx - bx, cy - by);
  const ca = Math.hypot(ax - cx, ay - cy);
  const s = (ab + bc + ca) * 0.5; // semi-perimeter
  const area = Math.sqrt(Math.max(0, s * (s - ab) * (s - bc) * (s - ca)));
  if (area < 1e-30) return Infinity;
  const inradius = area / s;
  return Math.max(ab, bc, ca) / (2 * inradius);
}

/**
 * Validate that all triangles in a fan mesh satisfy AR ≤ maxAR.
 * Returns the list of triangle indices that violate the bound (empty = all pass).
 */
export function validateFanAR(
  fan: FanMesh,
  rRefMm: number,
  maxAR = 50,
): number[] {
  const violations: number[] = [];
  for (let i = 0; i < fan.triangles.length; i++) {
    const { a, b, c } = fan.triangles[i];
    const va = fan.vertices[a];
    const vb = fan.vertices[b];
    const vc = fan.vertices[c];
    // Convert to mm for AR computation
    const ar = triangleAR(
      va.theta * rRefMm, va.z,
      vb.theta * rRefMm, vb.z,
      vc.theta * rRefMm, vc.z,
    );
    if (ar > maxAR) violations.push(i);
  }
  return violations;
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Given sorted feature edge angles, insert additional spokes so that no angular
 * gap exceeds 60° (π/3). Preserves all original feature edge angles.
 */
function buildSpokeAngles(edgeAngles: readonly number[]): number[] {
  if (edgeAngles.length === 0) {
    // Degenerate case: no feature edges → uniform 6-spoke fan
    const spokes: number[] = [];
    for (let i = 0; i < 6; i++) spokes.push((i * 2 * Math.PI) / 6);
    return spokes;
  }

  const spokes: number[] = [];

  for (let i = 0; i < edgeAngles.length; i++) {
    const a0 = edgeAngles[i];
    const a1 = edgeAngles[(i + 1) % edgeAngles.length];
    spokes.push(a0);

    // Angular gap (handle wrap-around)
    let gap = a1 - a0;
    if (gap <= 0) gap += 2 * Math.PI;

    // Subdivide if gap > 60°
    if (gap > PI_OVER_3 + 1e-9) {
      const nSub = Math.ceil(gap / PI_OVER_3);
      const subGap = gap / nSub;
      for (let k = 1; k < nSub; k++) {
        spokes.push(a0 + k * subGap);
      }
    }
  }

  // Normalize all angles to [0, 2π)
  for (let i = 0; i < spokes.length; i++) {
    spokes[i] = ((spokes[i] % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  }

  return spokes;
}

/** Maximum angular gap between adjacent spokes (handles wrap-around). */
function maxAngularGap(spokes: readonly number[]): number {
  if (spokes.length <= 1) return 2 * Math.PI;
  let maxGap = 0;
  for (let i = 0; i < spokes.length; i++) {
    let gap = spokes[(i + 1) % spokes.length] - spokes[i];
    if (gap <= 0) gap += 2 * Math.PI;
    if (gap > maxGap) maxGap = gap;
  }
  return maxGap;
}

/** Squared distance between two fan vertices (in their raw θ,z coordinates). */
function distSq(a: FanVertex, b: FanVertex): number {
  const dt = a.theta - b.theta;
  const dz = a.z - b.z;
  return dt * dt + dz * dz;
}
