/**
 * Gap1DirectionalRefine.test.ts — local/directional anisotropy (GAP 1 stage 2).
 *
 * After the committed global `uBias` B, residual short-WIDE slivers remain on
 * styles with PERVASIVE local relief (Crystalline / ArtDeco / HexagonalHive):
 * cells whose LOCAL √E/√G/2^B still exceeds the sliver bound. The fix is a
 * per-leaf integer `uExtra` (default 0) that splits ONLY those leaves once more
 * in u (effective u-level `eUL = level + uBias + uExtra`), making them
 * 3D-near-square, while leaving every other leaf — and EVERY leaf at default
 * dims — byte-identical.
 *
 * The SACRED invariant is no-op-at-default: with `directionalRefine` on, a pot
 * whose SHAPE anisotropy is in the default band trips the HARD gate
 * (median(2π·r/√G) ≤ AREF·√2, identical to computeUBias's B=0 gate) so the pass
 * touches zero cells → the leaf set is byte-identical to the default tree.
 *
 * F-SHEAR slivers (Voronoi / Gyroid, EG−F²→0) are explicitly OUT OF SCOPE: the
 * trigger uses the F-inclusive 3D-quad aspect + a physW>physH long-axis check so
 * shear cells (whose long axis is NOT u) are LEFT UNTOUCHED (uExtra stays 0),
 * never uselessly inflated.
 */
import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler, type SurfaceSampler, type Vec3 } from './SurfaceSampler';
import { MetricSizingField, type SizingOptions } from './MetricSizingField';
import { PeriodicBalancedQuadtree, type QuadLeaf } from './PeriodicBalancedQuadtree';
import { triangulateQuadtree, type QuadtreeMesh } from './QuadtreeTriangulator';
import { triangulateQuadtreeWithFeatures } from './FeatureConformingTriangulator';
import type { FeatureLine } from './FeatureLineGraph';
import { firstFundamentalForm, metricStepsForSampler } from './SurfaceMetricTensor';

function field(s: SyntheticCylinderSampler, opts: Partial<SizingOptions> = {}): MetricSizingField {
  return new MetricSizingField(s, {
    maxSagMm: 0.1, minEdgeMm: 0.2, maxEdgeMm: 8, gradeRatio: 2, resU: 128, resT: 128, ...opts,
  });
}

/**
 * Stable per-leaf key — keyed on the EFFECTIVE u-level (level + uBias + uExtra)
 * so a uExtra=0 cell and a uExtra=1 cell are distinguished (their u0 collides
 * under the bare level+uBias span). leafKeys(on) === leafKeys(off) iff the leaf
 * SETS coincide.
 */
function leafKeys(qt: PeriodicBalancedQuadtree): string[] {
  const B = qt.uBias();
  return qt
    .leaves()
    .map((l) => {
      const eUL = l.level + B + (l.uExtra ?? 0);
      return `${l.level}:${Math.round(l.u0 * (1 << eUL))}:${Math.round(l.t0 * (1 << l.level))}:${eUL}`;
    })
    .sort();
}

/** F-inclusive true 3D-quad aspect of a leaf (du = 1/2^eUL, dt = 1/2^level). */
function leafAspect3D(qt: PeriodicBalancedQuadtree, s: SyntheticCylinderSampler, l: QuadLeaf): number {
  const steps = metricStepsForSampler(s);
  const B = qt.uBias();
  const eUL = l.level + B + (l.uExtra ?? 0);
  const du = 1 / (1 << eUL);
  const dt = 1 / (1 << l.level);
  const uc = l.u0 + du / 2;
  const tc = l.t0 + dt / 2;
  const { E, F, G } = firstFundamentalForm(s, uc, tc, steps.hu, steps.ht);
  // The two physical edge vectors of the (du,dt) parallelogram are Pu·du and
  // Pt·dt; |Pu·du|=√E·du, |Pt·dt|=√G·dt, area = √(EG−F²)·du·dt. Aspect uses the
  // longest edge² over area (matches metrics.ts right-triangle aspect factor).
  const w = Math.sqrt(Math.max(E, 0)) * du;
  const h = Math.sqrt(Math.max(G, 0)) * dt;
  const area = Math.sqrt(Math.max(E * G - F * F, 0)) * du * dt;
  const longest2 = Math.max(w * w, h * h);
  if (area <= 1e-300) return 1e9;
  return (longest2 * Math.sqrt(3)) / (4 * (0.5 * area)); // == longest²·√3/(2·area)
}

/**
 * Max F-inclusive 3D aspect over the INTERIOR (non-boundary-row) leaves — the
 * wall body that directional refine governs. The t=0/t=1 boundary rows are the
 * PINNED shared rings (nRing-wide by design, matched on both walls); they are
 * deliberately never directionally split, so their aspect is a separate concern
 * (the nRing/pin knob), not the residual GAP this pass targets.
 */
function maxInteriorLeafAspect3D(qt: PeriodicBalancedQuadtree, s: SyntheticCylinderSampler): number {
  let max = 0;
  for (const l of qt.leaves()) {
    const onBoundary = Math.abs(l.t0) < 1e-9 || Math.abs(l.t0 + 1 / (1 << l.level) - 1) < 1e-9;
    if (onBoundary) continue;
    const a = leafAspect3D(qt, s, l);
    if (a > max) max = a;
  }
  return max;
}

/** Audit a wall mesh: T-junctions (interior edges used once) + non-manifold edges. */
function wallEdgeAudit(mesh: QuadtreeMesh): { nonManifold: number; interiorBoundary: number } {
  const tEps = 1e-9;
  const vt = (i: number): number => mesh.vertices[i * 3 + 1];
  const edges = new Map<string, number>();
  const tri = mesh.indices;
  for (let k = 0; k < tri.length; k += 3) {
    const [a, b, c] = [tri[k], tri[k + 1], tri[k + 2]];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let nonManifold = 0;
  let interiorBoundary = 0;
  for (const [key, count] of edges) {
    if (count > 2) nonManifold++;
    else if (count === 1) {
      const [iS, jS] = key.split(':');
      const onT0 = vt(Number(iS)) < tEps && vt(Number(jS)) < tEps;
      const onT1 = vt(Number(iS)) > 1 - tEps && vt(Number(jS)) > 1 - tEps;
      if (!(onT0 || onT1)) interiorBoundary++;
    }
  }
  return { nonManifold, interiorBoundary };
}

describe('GAP 1 directional refine — no-op at default + closes u-long slivers', () => {
  it('directional refine is a perfect no-op at default dims', () => {
    const s = new SyntheticCylinderSampler(57, 120, 8, 16);
    const f = field(s);
    const off = new PeriodicBalancedQuadtree(f, s, { maxLevel: 8 });
    const on = new PeriodicBalancedQuadtree(f, s, { maxLevel: 8, directionalRefine: true });
    expect(on.leaves().every((l) => (l.uExtra ?? 0) === 0)).toBe(true);
    expect(leafKeys(on)).toEqual(leafKeys(off));
  });

  // GAP fixture: a WIDE/FLAT pot (2π·r/√G ≈ 22.8 ≫ AREF·√2, so the gate is OPEN
  // — directional refine is NOT gated off) with strong LOCALized relief, at a
  // global bias too small for the local √E/√G. The cells in the high-relief band
  // are short-WIDE 3D slivers (aspect > 100) that one extra u-level fixes — the
  // exact residual directional refine targets. maxLevel 6 keeps it fast (~3k
  // leaves) while still producing the sliver band (level-independent — see
  // Gap1FoundationAspect).
  const GAP = { R: 145, H: 40, amp: 10, k: 80 } as const;
  const gapSampler = (): SyntheticCylinderSampler =>
    new SyntheticCylinderSampler(GAP.R, GAP.H, GAP.amp, GAP.k);

  it('the u-long residual sliver exists with directional refine OFF (the GAP)', () => {
    const s = gapSampler();
    const f = field(s);
    const off = new PeriodicBalancedQuadtree(f, s, { maxLevel: 6, pinBoundaryLevel: 4 });
    expect(maxInteriorLeafAspect3D(off, s)).toBeGreaterThan(100);
  });

  it('directional refine closes the u-long residual sliver field (aspect < 100)', () => {
    const s = gapSampler();
    const f = field(s);
    const on = new PeriodicBalancedQuadtree(f, s, {
      maxLevel: 6, pinBoundaryLevel: 4, directionalRefine: true,
    });
    // Some leaf actually got uExtra>0 (the fix engaged) and the interior field is gone.
    expect(on.leaves().some((l) => (l.uExtra ?? 0) > 0)).toBe(true);
    expect(maxInteriorLeafAspect3D(on, s)).toBeLessThan(100);
  }, 30000);

  it('directional cells keep 2:1 balance (effective u-level) across interior edges', () => {
    const s = gapSampler();
    const f = field(s);
    const on = new PeriodicBalancedQuadtree(f, s, {
      maxLevel: 6, pinBoundaryLevel: 4, directionalRefine: true,
    });
    const eul = (l: QuadLeaf): number => l.level + on.uBias() + (l.uExtra ?? 0);
    const onBoundary = (l: QuadLeaf): boolean =>
      Math.abs(l.t0) < 1e-9 || Math.abs(l.t0 + 1 / (1 << l.level) - 1) < 1e-9;
    for (const leaf of on.leaves()) {
      // The square-split (level) 2:1 balance holds EVERYWHERE — even against the
      // pinned ring (the existing levelCap grading guarantees it).
      for (const { leaf: nb } of on.neighbors(leaf)) {
        expect(Math.abs(leaf.level - nb.level)).toBeLessThanOrEqual(1);
      }
      // The effective-u 2:1 balance holds across INTERIOR edges. The pinned
      // boundary rows are exempt (never directionally split → uExtra=0); the
      // N-mid registry covers their t-edge subdivision watertightly (asserted by
      // the watertight + T-junction-free test).
      if (onBoundary(leaf)) continue;
      for (const { leaf: nb } of on.neighbors(leaf)) {
        if (onBoundary(nb)) continue;
        expect(Math.abs(eul(leaf) - eul(nb))).toBeLessThanOrEqual(1);
      }
    }
  }, 30000);

  it('directional cells triangulate watertight + T-junction-free', () => {
    const s = gapSampler();
    const f = field(s);
    const on = new PeriodicBalancedQuadtree(f, s, {
      maxLevel: 6, pinBoundaryLevel: 4, directionalRefine: true,
    });
    const mesh = triangulateQuadtree(on);
    const audit = wallEdgeAudit(mesh);
    expect(audit.nonManifold).toBe(0);
    expect(audit.interiorBoundary).toBe(0);
  }, 30000);

  it('boundary rows are NEVER directionally split (uExtra=0 → rings stay pinned)', () => {
    const s = gapSampler();
    const f = field(s);
    const PIN = 4;
    const on = new PeriodicBalancedQuadtree(f, s, {
      maxLevel: 6, pinBoundaryLevel: PIN, directionalRefine: true,
    });
    const B = on.uBias();
    const bottom = on.leaves().filter((l) => Math.abs(l.t0) < 1e-9);
    const top = on.leaves().filter((l) => Math.abs(l.t0 + 1 / (1 << l.level) - 1) < 1e-9);
    expect(bottom.every((l) => (l.uExtra ?? 0) === 0 && l.level === PIN)).toBe(true);
    expect(top.every((l) => (l.uExtra ?? 0) === 0 && l.level === PIN)).toBe(true);
    // The pinned ring still carries exactly 2^(PIN+B) uniform columns.
    expect(bottom.length).toBe(1 << (PIN + B));
    expect(top.length).toBe(1 << (PIN + B));
  }, 30000);
});

/** All edges used exactly once must lie on the open t=0/t=1 rings (else T-junction). */
function seamClosed(mesh: QuadtreeMesh): boolean {
  const tEps = 1e-9;
  const vt = (i: number): number => mesh.vertices[i * 3 + 1];
  const edges = new Map<string, number>();
  const tri = mesh.indices;
  for (let k = 0; k < tri.length; k += 3) {
    for (const [i, j] of [[tri[k], tri[k + 1]], [tri[k + 1], tri[k + 2]], [tri[k + 2], tri[k]]] as const) {
      if (i === j) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of edges) {
    if (count !== 1) continue;
    const [iS, jS] = key.split(':');
    const onT0 = vt(Number(iS)) < tEps && vt(Number(jS)) < tEps;
    const onT1 = vt(Number(iS)) > 1 - tEps && vt(Number(jS)) > 1 - tEps;
    if (!(onT0 || onT1)) return false;
  }
  return true;
}

describe('GAP 1 directional refine — Stage 5 integration (triangulators on directional trees)', () => {
  const gap = (): SyntheticCylinderSampler => new SyntheticCylinderSampler(145, 40, 10, 80);
  const gapField = (s: SyntheticCylinderSampler): MetricSizingField =>
    new MetricSizingField(s, { maxSagMm: 0.1, minEdgeMm: 0.2, maxEdgeMm: 8, gradeRatio: 2, resU: 128, resT: 128 });

  it('plain triangulator on a directional tree → watertight, T-junction-free, seam closed', () => {
    const s = gap();
    const on = new PeriodicBalancedQuadtree(gapField(s), s, {
      maxLevel: 6, pinBoundaryLevel: 4, directionalRefine: true,
    });
    // Sanity: directional cells exist (else the test is vacuous).
    expect(on.leaves().some((l) => (l.uExtra ?? 0) > 0)).toBe(true);
    const mesh = triangulateQuadtree(on);
    const audit = wallEdgeAudit(mesh);
    expect(audit.nonManifold).toBe(0);
    expect(audit.interiorBoundary).toBe(0);
    expect(seamClosed(mesh)).toBe(true);
  }, 30000);

  it('FeatureConformingTriangulator + a closed-loop feature on a directional tree → 0/0', () => {
    // A hand-built, fully 2:1-effective-u-balanced MIXED-uExtra tree (no boundary
    // exemption): a uniform level-2 base where the middle two t-rows are
    // directionally u-split once (uExtra=1 → eUL=3, 8 columns), the outer rows
    // stay eUL=2 (gap = 1). Production never combines features with the live
    // directional pass (it is DISABLED on feature walls — inserted styles stay
    // deferred), but the feature triangulator must still triangulate uExtra>0
    // cells correctly: its cellSet/neighbour reconstruction, the edge-snap, and
    // the corner-snap thresholds all read the integer address + effective u-level.
    const leaves: QuadLeaf[] = [];
    for (let it = 0; it < 4; it++) {
      if (it === 1 || it === 2) {
        for (let iu = 0; iu < 8; iu++) {
          leaves.push({ u0: iu / 8, t0: it / 4, level: 2, iu, it, uExtra: 1 });
        }
      } else {
        for (let iu = 0; iu < 4; iu++) {
          leaves.push({ u0: iu / 4, t0: it / 4, level: 2, iu, it, uExtra: 0 });
        }
      }
    }
    const qt = { leaves: () => leaves, uBias: () => 0 };
    // A closed loop crossing the directional-cell band (centred mid-wall).
    const pts: Array<{ u: number; t: number }> = [];
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const a = (2 * Math.PI * i) / N;
      pts.push({ u: 0.5 + 0.27 * Math.cos(a), t: 0.5 + 0.27 * Math.sin(a) });
    }
    const loop: FeatureLine = { kind: 'general-curve', points: pts, label: 'loop@directional' };
    // cornerSnap is a SINGLE absolute value (the t-extent fraction at the feature
    // level); the triangulator derives the finer u-threshold cornerSnap/2^B itself.
    // It is NOT per-cell-uExtra-scaled — both sides of every shared edge snap
    // identically regardless of a neighbour's uExtra.
    const cornerSnap = 0.06 / (1 << 2);
    const mesh = triangulateQuadtreeWithFeatures(qt, [loop], { cornerSnap });
    const audit = wallEdgeAudit(mesh);
    expect(audit.nonManifold).toBe(0);
    expect(audit.interiorBoundary).toBe(0);
    expect(seamClosed(mesh)).toBe(true);
  }, 30000);
});

/**
 * A SHEARED cylinder: the u-iso and t-iso directions are NOT orthogonal (F≠0),
 * and at high shear the cell area √(EG−F²) collapses → a high-aspect cell whose
 * LONG axis is along t (physW < physH), NOT u. This is the Voronoi/Gyroid F-shear
 * sliver mode: u-refinement provably cannot raise the area, so the trigger's
 * `physW>physH` guard must LEAVE these cells untouched (uExtra=0) — not inflate
 * them uselessly to MAX_U_EXTRA.
 */
class ShearedCylinderSampler implements SurfaceSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly shear: number, // θ advances by `shear` per unit t (twist)
  ) {}
  position(u: number, t: number): Vec3 {
    const theta = 2 * Math.PI * u + this.shear * t;
    return [this.R0 * Math.cos(theta), this.R0 * Math.sin(theta), t * this.H];
  }
}

describe('GAP 1 directional refine — Stage 7 efficacy + F-shear out-of-scope', () => {
  // Crystalline / ArtDeco / HexagonalHive analogue: a wide/flat pot with PERVASIVE
  // local relief → residual short-WIDE (u-long) slivers after the global bias.
  // Directional refine drives the INTERIOR-wall F-inclusive 3D aspect below the
  // sliver bound (ASPECT_MAX=100) and engages real uExtra refinement.
  it('u-long efficacy: a wide/flat high-relief wall → interior aspect < 100, slivers gone', () => {
    const s = new SyntheticCylinderSampler(145, 40, 10, 80);
    const f = new MetricSizingField(s, {
      maxSagMm: 0.1, minEdgeMm: 0.2, maxEdgeMm: 8, gradeRatio: 2, resU: 128, resT: 128,
    });
    const on = new PeriodicBalancedQuadtree(f, s, {
      maxLevel: 6, pinBoundaryLevel: 4, directionalRefine: true,
    });
    let interiorSlivers = 0;
    for (const l of on.leaves()) {
      const onBoundary = Math.abs(l.t0) < 1e-9 || Math.abs(l.t0 + 1 / (1 << l.level) - 1) < 1e-9;
      if (onBoundary) continue;
      if (leafAspect3D(on, s, l) > 100) interiorSlivers++;
    }
    expect(interiorSlivers).toBe(0);
    expect(on.leaves().some((l) => (l.uExtra ?? 0) > 0)).toBe(true);
  }, 30000);

  it('F-shear out-of-scope: sheared (EG−F²→0) cells are LEFT UNTOUCHED (uExtra stays 0)', () => {
    // Wide/flat so the gate is OPEN (the directional pass runs), but the sliver
    // mode is F-shear (long axis t, not u). The trigger's physW>physH guard must
    // refuse to u-refine: u-splitting cannot raise √(EG−F²), so inflating to
    // MAX_U_EXTRA would only waste triangles. Expect NO directional refinement.
    const s = new ShearedCylinderSampler(145, 40, 60); // strong twist → large F
    const steps = metricStepsForSampler(s);
    // Sanity: the metric really is F-sheared (F²/(EG) not negligible somewhere).
    let maxShearFrac = 0;
    for (let i = 0; i < 8; i++) {
      const { E, F, G } = firstFundamentalForm(s, i / 8, 0.5, steps.hu, steps.ht);
      maxShearFrac = Math.max(maxShearFrac, (F * F) / Math.max(E * G, 1e-12));
    }
    expect(maxShearFrac).toBeGreaterThan(0.3); // genuinely sheared

    const f = new MetricSizingField(s, {
      maxSagMm: 0.1, minEdgeMm: 0.2, maxEdgeMm: 8, gradeRatio: 2, resU: 128, resT: 128,
    });
    const on = new PeriodicBalancedQuadtree(f, s, {
      maxLevel: 6, pinBoundaryLevel: 4, directionalRefine: true,
    });
    // The trigger never fires (physW>physH is false for shear cells / the metric is
    // u-fine enough), so NO leaf is directionally refined — the pass is inert here.
    expect(on.leaves().every((l) => (l.uExtra ?? 0) === 0)).toBe(true);
  }, 30000);
});
