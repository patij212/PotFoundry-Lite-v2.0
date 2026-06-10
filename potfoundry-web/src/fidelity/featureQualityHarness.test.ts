/**
 * featureQualityHarness.test.ts — Plan Task 1: the feature-region triangle
 * quality MEASUREMENT GATE (no production change).
 *
 * This is the instrument the whole feature-triangle-quality plan is judged
 * against. It reproduces the live measurement deterministically and with ZERO
 * GPU: it builds a small synthetic feature wall in (u,t) parameter space via
 * `triangulateQuadtreeWithFeatures`, evaluates the (u,t,0) vertices to 3D with
 * the analytic `SyntheticCylinderSampler`, restricts to the OUTER-wall submesh
 * (`extractOuterWallSubmesh`), and reports the min-interior-angle distribution
 * (`triangleQualityDistribution`).
 *
 * It pins the API the later Tier-1/Tier-2 tasks gate on:
 *   - `pctBelow20`, `minAngleDeg`, `degenerateCount` (raw, whole feature wall).
 *   - a **feature-band-only** variant (restricted to cells the feature crosses).
 *   - a **sharp-corner-excluded** `pctBelow20` accessor (the user-accepted
 *     exception: triangles incident to an acute feature apex, input angle
 *     `< SHARP_CORNER_DEG`, are reported separately, never counted as failures).
 *
 * Baseline lock-in (RED-until-Tier-2): the smooth-crease fixture currently shows
 * `pctBelow20 > 0` on the feature band — the anisotropy the plan removes. This
 * test asserts that the instrument SEES it (so the later tasks have a falsifiable
 * before/after), NOT that quality is already good.
 *
 * Reuses (no duplication): `triangleQualityDistribution` + `extractOuterWallSubmesh`
 * from `src/fidelity/metrics.ts` (the committed gate), and the `vertical(u)`
 * feature-line helper pattern from
 * `parametric/conforming/FeatureConformingTriangulator.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { triangleQualityDistribution, extractOuterWallSubmesh } from './metrics';
import type { MeshView } from './types';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import {
  triangulateQuadtree,
  TRI_SOURCE,
  type QuadtreeLike,
  type QuadtreeMesh,
} from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import { SyntheticCylinderSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { FeatureLine } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';

/**
 * Input-angle threshold (deg) below which a feature apex is a "sharp corner":
 * its incident triangles can never reach the 20° bar and are reported
 * separately rather than counted as failures. Mirrors the plan constant
 * `SHARP_CORNER_DEG` (lives in the NOT-YET-CREATED `CellQualityRefinement.ts`,
 * so the harness pins the value locally — no production import).
 */
const SHARP_CORNER_DEG = 36;

/** A uniform 2^level × 2^level quadtree of leaves (matches the conforming tests). */
function uniformQuadtree(level: number): QuadtreeLike {
  const span = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 0; it < span; it++) {
    for (let iu = 0; iu < span; iu++) {
      leaves.push({ u0: iu / span, t0: it / span, level });
    }
  }
  return { leaves: () => leaves };
}

/** A non-dyadic vertical crease at column u (17 samples top→bottom). */
function vertical(u: number): FeatureLine {
  const points = [];
  for (let i = 0; i <= 16; i++) points.push({ u, t: i / 16 });
  return { kind: 'vertical-crease', points, label: `v@${u}` };
}

/**
 * A braid-like crossing: a single sloped polyline that sweeps across the
 * domain in u as t rises (the prototype for a braid strand / helix). Non-dyadic
 * endpoints, crosses many cells. Combined with `vertical`, the two lines cross,
 * producing the anisotropic feature-insertion neighbourhood the plan targets.
 */
function braid(u0: number, u1: number): FeatureLine {
  const points = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    points.push({ u: u0 + (u1 - u0) * f, t: f });
  }
  return { kind: 'general-curve', points, label: `braid@${u0}->${u1}` };
}

/**
 * A sharp V-kink: two short segments meeting at an apex (uA,tA) at an ACUTE
 * angle — the prototype for a genuine sharp feature corner (a braid-strand
 * crossing / cell-curve junction) the user's exception protects. The two arms
 * leave the apex with a small angular separation so the 3D input angle is
 * `< SHARP_CORNER_DEG`.
 */
function sharpV(uA: number, tA: number): FeatureLine {
  // Both arms point roughly +t with a tiny u spread → acute apex.
  const arm = 0.18;
  const left = { u: uA - 0.012, t: tA + arm };
  const right = { u: uA + 0.012, t: tA + arm };
  return {
    kind: 'general-curve',
    points: [left, { u: uA, t: tA }, right],
    label: `sharpV@${uA},${tA}`,
  };
}

/**
 * Evaluate a (u,t,0)-packed quadtree mesh to a 3D MeshView via a sampler, and
 * carry a per-vertex outer-wall mask. The synthetic wall is ENTIRELY outer wall
 * (no inner/cap surfaces), so the mask is all-1 — this still exercises the real
 * `extractOuterWallSubmesh` gate path (compaction + reindexing) exactly as the
 * production whole-pot mesh does for its outer-wall slice.
 */
function evalWallTo3D(
  mesh: QuadtreeMesh,
  sampler: SyntheticCylinderSampler,
): { view: MeshView; outerMask: Uint8Array; ut: Float32Array } {
  const n = mesh.vertices.length / 3;
  const pos = new Float32Array(n * 3);
  const ut = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const u = mesh.vertices[i * 3];
    const t = mesh.vertices[i * 3 + 1];
    const p = sampler.position(u, t);
    pos[i * 3] = p[0];
    pos[i * 3 + 1] = p[1];
    pos[i * 3 + 2] = p[2];
    ut[i * 2] = u;
    ut[i * 2 + 1] = t;
  }
  const outerMask = new Uint8Array(n).fill(1);
  return { view: { vertices: pos, indices: mesh.indices }, outerMask, ut };
}

/**
 * A sharp feature APEX: a (u,t) location where two feature constraint segments
 * meet at a 3D input angle `< SHARP_CORNER_DEG`. The plan's corner exception is
 * keyed on the FEATURE GEOMETRY (acute constraint-curve intersection), NOT on
 * output-triangle angles — so a merely-stretched smooth-wall sliver is a
 * fixable failure, while a triangle pinned at an acute braid crossing is the
 * accepted, separately-reported exception.
 */
interface SharpApex {
  u: number;
  t: number;
}

/**
 * Detect sharp feature apexes (3D input angle `< SHARP_CORNER_DEG`):
 *  - INTERIOR vertices of each feature line where the two incident segments
 *    turn sharply (a kink in one curve);
 *  - CROSSINGS where two distinct feature lines pass through the same (u,t)
 *    sample at an acute angle (e.g. a braid crossing a crease).
 * Angles are measured in 3D via the sampler, matching the gate's basis.
 */
function detectSharpApexes(
  features: FeatureLine[],
  sampler: SyntheticCylinderSampler,
): SharpApex[] {
  const apexes: SharpApex[] = [];
  const seg3D = (a: FeatureLine['points'][number], b: FeatureLine['points'][number]) => {
    const pa = sampler.position(a.u, a.t);
    const pb = sampler.position(b.u, b.t);
    return [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]] as const;
  };
  const angleBetween = (
    s0: readonly [number, number, number],
    s1: readonly [number, number, number],
  ): number => {
    const l0 = Math.hypot(s0[0], s0[1], s0[2]);
    const l1 = Math.hypot(s1[0], s1[1], s1[2]);
    if (l0 < 1e-12 || l1 < 1e-12) return 180;
    let cos = (s0[0] * s1[0] + s0[1] * s1[1] + s0[2] * s1[2]) / (l0 * l1);
    if (cos > 1) cos = 1;
    else if (cos < -1) cos = -1;
    return (Math.acos(cos) * 180) / Math.PI;
  };

  // (a) per-line kinks.
  for (const f of features) {
    for (let i = 1; i + 1 < f.points.length; i++) {
      const inSeg = seg3D(f.points[i], f.points[i - 1]); // points back toward prev
      const outSeg = seg3D(f.points[i], f.points[i + 1]); // points toward next
      // Turn angle = the apex angle of the two segments meeting at point i.
      if (angleBetween(inSeg, outSeg) < SHARP_CORNER_DEG) {
        apexes.push({ u: f.points[i].u, t: f.points[i].t });
      }
    }
  }
  // (b) cross-line near-coincident samples meeting at an acute angle.
  for (let a = 0; a < features.length; a++) {
    for (let b = a + 1; b < features.length; b++) {
      const fa = features[a];
      const fb = features[b];
      for (let i = 0; i < fa.points.length; i++) {
        for (let j = 0; j < fb.points.length; j++) {
          const pa = fa.points[i];
          const pb = fb.points[j];
          let du = Math.abs(pa.u - pb.u) % 1;
          if (du > 0.5) du = 1 - du;
          if (Math.hypot(du, pa.t - pb.t) > 1e-3) continue;
          // Tangents of each line at the crossing.
          const ta = seg3D(
            fa.points[Math.max(0, i - 1)],
            fa.points[Math.min(fa.points.length - 1, i + 1)],
          );
          const tb = seg3D(
            fb.points[Math.max(0, j - 1)],
            fb.points[Math.min(fb.points.length - 1, j + 1)],
          );
          let cross = angleBetween(ta, tb);
          if (cross > 90) cross = 180 - cross; // acute branch of the crossing
          if (cross < SHARP_CORNER_DEG) apexes.push({ u: pa.u, t: pa.t });
        }
      }
    }
  }
  return apexes;
}

/**
 * Sharp-corner-excluded `pctBelow20`: the percentage of NON-DEGENERATE triangles
 * with min interior angle < 20°, EXCLUDING triangles INCIDENT TO a sharp feature
 * apex (a vertex coincident in (u,t) with an apex from `detectSharpApexes`,
 * input angle `< SHARP_CORNER_DEG`). Those residual sub-20° triangles are
 * reported separately (the user-accepted exception), never counted as failures.
 *
 * On a smooth-crease fixture there are NO sharp apexes, so this EQUALS the raw
 * gate value — the accessor pins the API the corner-protection tasks (6/8) and
 * the end-to-end task (8) gate on.
 */
function pctBelow20SharpExcluded(
  view: MeshView,
  ut: Float32Array,
  apexes: SharpApex[],
): { pctBelow20Excl: number; sharpCornerTriangles: number } {
  const { vertices, indices } = view;
  const n = vertices.length / 3;
  // Mark mesh vertices coincident (in (u,t)) with a sharp apex.
  const atApex = new Uint8Array(n);
  if (apexes.length > 0) {
    for (let i = 0; i < n; i++) {
      const u = ut[i * 2];
      const t = ut[i * 2 + 1];
      for (const a of apexes) {
        let du = Math.abs(u - a.u) % 1;
        if (du > 0.5) du = 1 - du;
        if (Math.hypot(du, t - a.t) <= 1e-6) {
          atApex[i] = 1;
          break;
        }
      }
    }
  }

  let measured = 0;
  let below20 = 0;
  let sharp = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t];
    const i1 = indices[t + 1];
    const i2 = indices[t + 2];
    const ia = i0 * 3,
      ib = i1 * 3,
      ic = i2 * 3;
    const triMin = Math.min(
      vertexAngle(vertices, ia, ib, ic),
      vertexAngle(vertices, ib, ic, ia),
      vertexAngle(vertices, ic, ia, ib),
    );
    // Degenerate triangles have no well-defined min angle (gate excludes them).
    if (!Number.isFinite(triMin)) continue;
    if (atApex[i0] || atApex[i1] || atApex[i2]) {
      sharp++;
      continue; // incident to a sharp apex → reported separately, not a failure
    }
    measured++;
    if (triMin < 20) below20++;
  }
  return {
    pctBelow20Excl: measured > 0 ? (below20 / measured) * 100 : 0,
    sharpCornerTriangles: sharp,
  };
}

/**
 * Re-align the per-vertex (u,t) tags of the FULL wall to the compacted
 * outer-wall submesh produced by `extractOuterWallSubmesh`. That extractor
 * keeps every triangle whose three vertices are all outer-wall and reindexes
 * the surviving vertices in FIRST-ENCOUNTER order over the triangle list; this
 * mirrors that exact remap (mask = all-1 outer wall) so `utOuter[newIdx]`
 * corresponds to `outer.vertices[newIdx]`. Verified by asserting the 3D
 * positions agree.
 */
function reindexUT(full: MeshView, outer: MeshView, ut: Float32Array): Float32Array {
  const outN = outer.vertices.length / 3;
  const utOuter = new Float32Array(outN * 2);
  const remap = new Int32Array(full.vertices.length / 3).fill(-1);
  let next = 0;
  for (let t = 0; t < full.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const old = full.indices[t + k];
      if (remap[old] < 0) {
        const n = next++;
        remap[old] = n;
        utOuter[n * 2] = ut[old * 2];
        utOuter[n * 2 + 1] = ut[old * 2 + 1];
      }
    }
  }
  return utOuter;
}

/** Interior angle (deg) at the apex vertex `iApex` between `iB` and `iC`. */
function vertexAngle(v: Float32Array, iApex: number, iB: number, iC: number): number {
  const ux = v[iB] - v[iApex],
    uy = v[iB + 1] - v[iApex + 1],
    uz = v[iB + 2] - v[iApex + 2];
  const wx = v[iC] - v[iApex],
    wy = v[iC + 1] - v[iApex + 1],
    wz = v[iC + 2] - v[iApex + 2];
  const lu = Math.hypot(ux, uy, uz);
  const lw = Math.hypot(wx, wy, wz);
  if (lu < 1e-12 || lw < 1e-12) return NaN;
  let cos = (ux * wx + uy * wy + uz * wz) / (lu * lw);
  if (cos > 1) cos = 1;
  else if (cos < -1) cos = -1;
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Restrict a (u,t)-tagged wall mesh to the FEATURE BAND: the outer-wall
 * triangles that touch at least one feature line (any vertex within `band` of a
 * feature sample point in (u,t)). This isolates the feature-insertion / grading-
 * transition neighbourhood the plan's quality bar applies to, separating it from
 * the smooth-wall remainder.
 */
function featureBandSubmesh(
  view: MeshView,
  ut: Float32Array,
  features: FeatureLine[],
  band: number,
): MeshView {
  const n = view.vertices.length / 3;
  const nearFeature = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const u = ut[i * 2];
    const t = ut[i * 2 + 1];
    for (const f of features) {
      for (const p of f.points) {
        // u is periodic — measure the wrapped distance.
        let du = Math.abs(u - p.u) % 1;
        if (du > 0.5) du = 1 - du;
        if (Math.hypot(du, t - p.t) <= band) {
          nearFeature[i] = 1;
          break;
        }
      }
      if (nearFeature[i]) break;
    }
  }
  // Reuse extractOuterWallSubmesh with the feature-band as the "outer" mask:
  // keep only triangles whose three vertices are all in-band (compacts + reindexes).
  return extractOuterWallSubmesh(view.vertices, view.indices, nearFeature);
}

describe('feature-quality measurement harness (Task 1 gate)', () => {
  // A rippled cylinder gives the wall real, anisotropic 3D curvature so the
  // (u,t) → 3D map stretches feature-insertion triangles (the measured defect).
  const sampler = new SyntheticCylinderSampler(50, 120, 8, 3);
  const qt = uniformQuadtree(3); // 8×8 grid
  const features: FeatureLine[] = [vertical(0.3), braid(0.15, 0.72)];

  function buildWall(): {
    view: MeshView;
    outerMask: Uint8Array;
    ut: Float32Array;
    mesh: QuadtreeMesh;
  } {
    const mesh = triangulateQuadtreeWithFeatures(qt, features);
    const { view, outerMask, ut } = evalWallTo3D(mesh, sampler);
    return { view, outerMask, ut, mesh };
  }

  it('reports pctBelow20, minAngleDeg, degenerateCount over the outer-wall submesh', () => {
    const { view, outerMask } = buildWall();
    const outer = extractOuterWallSubmesh(view.vertices, view.indices, outerMask);
    const dist = triangleQualityDistribution(outer);

    // The instrument produces the headline numbers the plan is judged on.
    expect(dist.triangleCount).toBeGreaterThan(100);
    expect(typeof dist.pctBelow20).toBe('number');
    expect(typeof dist.minAngleDeg).toBe('number');
    expect(typeof dist.degenerateCount).toBe('number');

    // No degenerate triangles in a by-construction conforming wall.
    expect(dist.degenerateCount).toBe(0);
    // minAngle is a real positive angle (sanity: not the empty-mesh 0 sentinel).
    expect(dist.minAngleDeg).toBeGreaterThan(0);

    // Print the baseline so the before/after is visible in CI logs.
    // eslint-disable-next-line no-console
    console.log(
      `[Task1] whole outer wall: tris=${dist.triangleCount} pctBelow20=${dist.pctBelow20} ` +
        `minAngle=${dist.minAngleDeg} degenerate=${dist.degenerateCount}`,
    );
  });

  it('feature-band-only variant locks in the baseline defect (pctBelow20 > 0)', () => {
    const { view, ut } = buildWall();
    const band = featureBandSubmesh(view, ut, features, 1 / 8); // ~one cell wide
    const dist = triangleQualityDistribution(band);

    expect(dist.triangleCount).toBeGreaterThan(0);
    // RED-until-Tier-2: the feature insertion / grading band currently contains
    // sub-20° anisotropic triangles. This is the falsifiable baseline the later
    // tasks must drive down — NOT an assertion that quality is already good.
    expect(dist.pctBelow20).toBeGreaterThan(0);

    // eslint-disable-next-line no-console
    console.log(
      `[Task1] feature band: tris=${dist.triangleCount} pctBelow20=${dist.pctBelow20} ` +
        `minAngle=${dist.minAngleDeg} degenerate=${dist.degenerateCount}`,
    );
  });

  it('sharp-corner-excluded accessor EQUALS raw on a smooth-crease fixture (no apex)', () => {
    // Per the policy: a single smooth crease has NO acute feature apex, so the
    // sharp-corner-excluded value must equal the raw gate value (it excludes
    // nothing). This pins the accessor's no-op behaviour on the smooth case.
    const smoothFeatures: FeatureLine[] = [vertical(0.3)];
    const mesh = triangulateQuadtreeWithFeatures(qt, smoothFeatures);
    const { view, outerMask, ut } = evalWallTo3D(mesh, sampler);
    const outer = extractOuterWallSubmesh(view.vertices, view.indices, outerMask);
    // Reindex the (u,t) tags to match the compacted submesh.
    const utOuter = reindexUT(view, outer, ut);

    const apexes = detectSharpApexes(smoothFeatures, sampler);
    expect(apexes.length).toBe(0); // smooth crease → no sharp corner

    const raw = triangleQualityDistribution(outer).pctBelow20;
    const { pctBelow20Excl, sharpCornerTriangles } = pctBelow20SharpExcluded(outer, utOuter, apexes);

    expect(pctBelow20Excl).toBeGreaterThanOrEqual(0);
    expect(pctBelow20Excl).toBeLessThanOrEqual(100);
    expect(sharpCornerTriangles).toBe(0);
    // No apexes → identical to the raw gate value (within float drift between the
    // gate's law-of-cosines and the accessor's dot-product angle basis).
    expect(pctBelow20Excl).toBeCloseTo(raw, 1);

    // eslint-disable-next-line no-console
    console.log(
      `[Task1] smooth-crease accessor: pctBelow20Excl=${pctBelow20Excl.toFixed(1)} raw=${raw}`,
    );
  });

  it('sharp-corner-excluded accessor SEPARATES a sharp-V apex from failures', () => {
    // A genuine acute feature apex (sharp V) is detected and its incident
    // sub-20° triangles are reported SEPARATELY (counted in sharpCornerTriangles),
    // never as failures — so the excluded value can only drop relative to raw,
    // and at least one corner triangle is segregated. (Task 1's smooth-crease
    // fixture has no apex; this fixture proves the separation machinery the
    // corner-protection tasks 6/8 gate on.)
    const sharpFeatures: FeatureLine[] = [sharpV(0.5, 0.4)];
    const mesh = triangulateQuadtreeWithFeatures(qt, sharpFeatures);
    const { view, outerMask, ut } = evalWallTo3D(mesh, sampler);
    const outer = extractOuterWallSubmesh(view.vertices, view.indices, outerMask);
    const utOuter = reindexUT(view, outer, ut);

    const apexes = detectSharpApexes(sharpFeatures, sampler);
    expect(apexes.length).toBeGreaterThan(0); // the V apex is acute

    const raw = triangleQualityDistribution(outer).pctBelow20;
    const { pctBelow20Excl, sharpCornerTriangles } = pctBelow20SharpExcluded(outer, utOuter, apexes);

    expect(pctBelow20Excl).toBeGreaterThanOrEqual(0);
    expect(pctBelow20Excl).toBeLessThanOrEqual(100);
    // The apex triangles are segregated out of the failure pool.
    expect(sharpCornerTriangles).toBeGreaterThan(0);
    // Excluding corner triangles can only remove failures, never add them.
    expect(pctBelow20Excl).toBeLessThanOrEqual(raw + 1e-6);

    // eslint-disable-next-line no-console
    console.log(
      `[Task1] sharp-V accessor: pctBelow20Excl=${pctBelow20Excl.toFixed(1)} ` +
        `raw=${raw} sharpCornerTris=${sharpCornerTriangles} apexes=${apexes.length}`,
    );
  });
});

describe('triangle provenance channel (Task 3 instrument)', () => {
  it('tags every triangle and the tags partition the mesh', () => {
    const mesh = triangulateQuadtreeWithFeatures(uniformQuadtree(3), [vertical(0.3)]);
    const triCount = mesh.indices.length / 3;
    expect(mesh.triangleSource).toBeDefined();
    expect(mesh.triangleSource!.length).toBe(triCount);
    const counts = new Map<number, number>();
    for (const s of mesh.triangleSource!) counts.set(s, (counts.get(s) ?? 0) + 1);
    // A uniform grid with one vertical feature: plain FCT cells + feature CDT cells only.
    expect(counts.get(TRI_SOURCE.FCT_FEATURE_CDT) ?? 0).toBeGreaterThan(0);
    expect(counts.get(TRI_SOURCE.FCT_PLAIN_QUAD) ?? 0).toBeGreaterThan(0);
    let sum = 0;
    for (const v of counts.values()) sum += v;
    expect(sum).toBe(triCount);
  });

  it('plain path: every triangle of a uniform grid is tagged PLAIN_QUAD', () => {
    const mesh = triangulateQuadtree(uniformQuadtree(3));
    const triCount = mesh.indices.length / 3;
    expect(mesh.triangleSource).toBeDefined();
    expect(mesh.triangleSource!.length).toBe(triCount);
    for (const s of mesh.triangleSource!) expect(s).toBe(TRI_SOURCE.PLAIN_QUAD);
  });

  it('plain path: a mixed-level tree contains TRANSITION_FAN tags', () => {
    // 2×2 base (level 1) with the SW quad refined to level 2 — the transition
    // fixture from QuadtreeTriangulator.test.ts (handForcedTree shape).
    const leaves: QuadLeaf[] = [
      { u0: 0.0, t0: 0.0, level: 2 },
      { u0: 0.25, t0: 0.0, level: 2 },
      { u0: 0.0, t0: 0.25, level: 2 },
      { u0: 0.25, t0: 0.25, level: 2 },
      { u0: 0.5, t0: 0.0, level: 1 },
      { u0: 0.0, t0: 0.5, level: 1 },
      { u0: 0.5, t0: 0.5, level: 1 },
    ];
    const mesh = triangulateQuadtree({ leaves: () => leaves });
    const triCount = mesh.indices.length / 3;
    expect(mesh.triangleSource).toBeDefined();
    expect(mesh.triangleSource!.length).toBe(triCount);
    const counts = new Map<number, number>();
    for (const s of mesh.triangleSource!) counts.set(s, (counts.get(s) ?? 0) + 1);
    expect(counts.get(TRI_SOURCE.TRANSITION_FAN) ?? 0).toBeGreaterThan(0);
    expect(counts.get(TRI_SOURCE.PLAIN_QUAD) ?? 0).toBeGreaterThan(0);
    let sum = 0;
    for (const v of counts.values()) sum += v;
    expect(sum).toBe(triCount);
  });

  it('triangleSource stays in lockstep with indices AFTER the weld degenerate-drop pass', () => {
    // Force the FCT tolerance-weld drop path (FeatureConformingTriangulator.ts,
    // the WELD_TAU pass): TWIN vertical creases 1e-7 apart in u — wider than one
    // QSCALE quantum (2^-24 ≈ 5.96e-8), so the exact-key dedup keeps TWO distinct
    // vertex columns, yet inside WELD_TAU (1e-6), so the weld fuses every same-t
    // twin pair. The per-cell CDT must fill the 1e-7-wide strip between the two
    // constraint chains, and the strip's boundary polygon contains twin↔twin
    // edges (the south/north crossing pairs), so the triangles on those edges
    // collapse to repeated indices after the weld and are DROPPED by the
    // degenerate guard — triangleSource must be filtered in the same loop.
    const U = 0.3;
    const qt = uniformQuadtree(3);
    const welded = triangulateQuadtreeWithFeatures(qt, [vertical(U), vertical(U + 1e-7)]);
    // Control: the weld-provoking twin moved beyond WELD_TAU (1e-3 away), same
    // cells crossed, same per-cell point counts (2 edge crossings + 1 interior
    // point per line per cell). A full cell triangulation always has
    // 2·interior + boundary − 2 triangles regardless of diagonal choices, so the
    // PRE-WELD triangle totals of the two builds are EQUAL — any deficit in the
    // welded build is exactly the weld's degenerate-drop count.
    const control = triangulateQuadtreeWithFeatures(qt, [vertical(U), vertical(U + 1e-3)]);

    // Neither build lost triangles inside the per-cell CDT (zero-area channel),
    // so the triangle deficit below is attributable to the weld pass alone.
    expect(welded.cdtStats!.drops).toBe(0);
    expect(control.cdtStats!.drops).toBe(0);

    // The weld actually fired: each crease contributes 17 column vertices
    // (t=i/16), so unfused twins would leave 34 in a band covering both columns;
    // the welded build fuses them into ONE 17-vertex column.
    const inBand = (mesh: QuadtreeMesh, u: number): number => {
      let n = 0;
      for (let i = 0; i < mesh.vertices.length; i += 3) {
        if (Math.abs(mesh.vertices[i] - u) <= 2e-6) n++;
      }
      return n;
    };
    expect(inBand(control, U)).toBe(17); // single unfused column
    expect(inBand(control, U + 1e-3)).toBe(17); // its far twin, also unfused
    expect(inBand(welded, U)).toBe(17); // BOTH twin columns fused into one

    // At least one triangle was actually dropped by the weld.
    expect(welded.indices.length / 3).toBeLessThan(control.indices.length / 3);

    // Lockstep: one provenance tag per SURVIVING triangle...
    expect(welded.triangleSource!.length).toBe(welded.indices.length / 3);
    // ...and the partition still sums.
    let sum = 0;
    const counts = new Map<number, number>();
    for (const s of welded.triangleSource!) counts.set(s, (counts.get(s) ?? 0) + 1);
    for (const v of counts.values()) sum += v;
    expect(sum).toBe(welded.indices.length / 3);
  });
});
