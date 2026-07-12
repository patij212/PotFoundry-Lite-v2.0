// ConformingWall.verdictRefine.test.ts — T4 of the Gyroid-knee ship plan (KEYSTONE).
//
// Pins the two properties the two-pass VERDICT loop must guarantee:
//   (a) FLAG OFF ⇒ `buildConformingWall` is BYTE-IDENTICAL to
//       `buildConformingWallOnce` (today's production body) — the load-bearing
//       non-regression proof. Proven by hashing the emitted buffers, not by a
//       structural sniff, so ANY drift in the default path fails here.
//   (b) FLAG ON ⇒ on a synthetic bump-on-a-feature-wall the measured outlier
//       count DROPS versus flag-off and the mesh stays watertight
//       (`nonManifold == 0`). Small/fast surface by design — the full Gyroid
//       production gate is T6, not here.
//
// The flag is a `globalThis.__pfConformingVerdictRefine` read; every test that
// sets it restores it in a `finally`.
import { describe, it, expect, afterEach } from 'vitest';
import { SyntheticCylinderSampler, type SurfaceSampler, type Vec3 } from './SurfaceSampler';
import {
  buildConformingWall,
  buildConformingWallOnce,
  type ConformingWallOptions,
} from './ConformingWall';
import { scoreCandidateFacets, type VerdictLiftSampler } from './verdictRefine';
import type { FeatureLine } from './FeatureLineGraph';

// ── flag plumbing ─────────────────────────────────────────────────────────────
const FLAG = '__pfConformingVerdictRefine';
type FlagHost = { [FLAG]?: boolean };
function setFlag(v: boolean | undefined): void {
  (globalThis as unknown as FlagHost)[FLAG] = v;
}
function getFlag(): boolean | undefined {
  return (globalThis as unknown as FlagHost)[FLAG];
}
afterEach(() => setFlag(undefined));

// ── FNV-1a 64-bit over a typed-array's bytes (matches ConformingWall.test.ts) ──
function fnv1a64(view: ArrayBufferView): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const mask = (1n << 64n) - 1n;
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/** A cylinder (R0,H) with a localized 2D Gaussian radial bulge centered at
 *  (bumpU,bumpT). The bump lives in the LIFT sampler only, so the base mesh
 *  (sized off a plain cylinder) under-tessellates it → coarse facets score high
 *  until the verdict loop escalates the feature cells over it. */
class BumpCylinderSampler implements SurfaceSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly bumpAmp: number,
    private readonly bumpU: number,
    private readonly bumpT: number,
    private readonly bumpWidth: number,
  ) {}

  position(u: number, t: number): Vec3 {
    const du = u - this.bumpU;
    const dt = t - this.bumpT;
    const bump =
      this.bumpAmp * Math.exp(-(du * du + dt * dt) / (2 * this.bumpWidth * this.bumpWidth));
    const r = this.R0 + bump;
    const theta = 2 * Math.PI * u;
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}

/** Adapt a SurfaceSampler (readonly Vec3) to the scorer's lift interface. */
function asLift(s: SurfaceSampler): VerdictLiftSampler {
  return {
    position: (u, t) => {
      const p = s.position(u, t);
      return [p[0], p[1], p[2]];
    },
  };
}

/** Facet indices whose centroid lands in a (u,t) window — isolates the localized
 *  bump from the ambient cylinder-arc chord elsewhere (which is unrelated to what
 *  the near-band verdict loop escalates), so the count measures the bump only. */
function facetsInWindow(
  indices: Uint32Array, vertices: Float32Array,
  uc: number, tc: number, halfU: number, halfT: number,
): number[] {
  const out: number[] = [];
  for (let f = 0; f < indices.length / 3; f++) {
    const ia = indices[3 * f], ib = indices[3 * f + 1], ic = indices[3 * f + 2];
    const cu = (vertices[ia * 3] + vertices[ib * 3] + vertices[ic * 3]) / 3;
    const ct = (vertices[ia * 3 + 1] + vertices[ib * 3 + 1] + vertices[ic * 3 + 1]) / 3;
    if (Math.abs(cu - uc) < halfU && Math.abs(ct - tc) < halfT) out.push(f);
  }
  return out;
}

/** Local refinement level near (uc,tc): log2(1/minTgap) over the distinct t
 *  coordinates of vertices in a small (u,t) box. A quadtree cell at level L emits
 *  t-lines spaced 1/2^L, so the finest local t-gap reveals the level reached
 *  there — the direct readout of how deep the verdict loop drove that cell. */
function localLevel(vertices: Float32Array, uc: number, tc: number, halfU: number, halfT: number): number {
  const ts = new Set<number>();
  for (let i = 0; i < vertices.length / 3; i++) {
    const u = vertices[i * 3], t = vertices[i * 3 + 1];
    if (Math.abs(u - uc) < halfU && Math.abs(t - tc) < halfT) ts.add(Math.round(t * (1 << 20)));
  }
  const sorted = [...ts].sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const g = (sorted[i] - sorted[i - 1]) / (1 << 20);
    if (g > 1e-9 && g < minGap) minGap = g;
  }
  return minGap === Infinity ? 0 : Math.round(Math.log2(1 / minGap));
}

/** Count edges shared by 3+ triangles (index-level non-manifold defect). Rim
 *  edges (t=0 / t=1 boundary) are legitimately used once, so only >2 is a fault. */
function nonManifoldByIndex(indices: Uint32Array): number {
  const use = new Map<string, number>();
  const bump = (i: number, j: number): void => {
    const k = i < j ? `${i}_${j}` : `${j}_${i}`;
    use.set(k, (use.get(k) ?? 0) + 1);
  };
  for (let f = 0; f < indices.length / 3; f++) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    bump(a, b); bump(b, c); bump(c, a);
  }
  let bad = 0;
  for (const count of use.values()) if (count > 2) bad++;
  return bad;
}

const BASE_OPTS: Omit<ConformingWallOptions, 'surfaceId'> = {
  // Loose sizing so ambient curvature adds little — the base density near the
  // feature comes from `featureLevel`, and the localized bump (lift-only) is what
  // the verdict loop must catch and escalate.
  maxSagMm: 5,
  maxEdgeMm: 200,
  minEdgeMm: 5,
  gradeRatio: 2,
  maxLevel: 9,
  resU: 33,
  resT: 17,
  nRing: 16,
  featureLevel: 6,
};

const BUMP_U = 0.5;
const featureVerticalCrease = (u: number): FeatureLine => ({
  kind: 'vertical-crease',
  label: 'test-crease',
  points: Array.from({ length: 19 }, (_, i) => ({ u, t: 0.05 + (0.9 * i) / 18 })),
});

describe('buildConformingWall — verdict-refine flag OFF is byte-identical to buildConformingWallOnce', () => {
  const s = new SyntheticCylinderSampler(50, 100, 3, 4);
  const opts: ConformingWallOptions = {
    ...BASE_OPTS,
    surfaceId: 0,
    featureLines: [featureVerticalCrease(BUMP_U)],
  };

  it('flag undefined ⇒ hash(buildConformingWall) === hash(buildConformingWallOnce)', () => {
    expect(getFlag()).toBeUndefined();
    const viaWrapper = buildConformingWall(s, opts);
    const viaOnce = buildConformingWallOnce(s, opts);

    expect(viaWrapper.vertices.length).toBe(viaOnce.vertices.length);
    expect(viaWrapper.indices.length).toBe(viaOnce.indices.length);
    expect(fnv1a64(viaWrapper.vertices)).toBe(fnv1a64(viaOnce.vertices));
    expect(fnv1a64(viaWrapper.indices)).toBe(fnv1a64(viaOnce.indices));
    expect(fnv1a64(viaWrapper.seamTriangles)).toBe(fnv1a64(viaOnce.seamTriangles));
    expect(viaWrapper.bottomRing).toEqual(viaOnce.bottomRing);
    expect(viaWrapper.topRing).toEqual(viaOnce.topRing);
  });

  it('flag EXPLICITLY false ⇒ still byte-identical (only === true enables the loop)', () => {
    setFlag(false);
    try {
      const viaWrapper = buildConformingWall(s, opts);
      const viaOnce = buildConformingWallOnce(s, opts);
      expect(fnv1a64(viaWrapper.vertices)).toBe(fnv1a64(viaOnce.vertices));
      expect(fnv1a64(viaWrapper.indices)).toBe(fnv1a64(viaOnce.indices));
    } finally {
      setFlag(undefined);
    }
  });

  it('a non-outer wall (surfaceId!==0) ignores the flag even when ON', () => {
    setFlag(true);
    try {
      const innerOpts: ConformingWallOptions = { ...opts, surfaceId: 1 };
      const viaWrapper = buildConformingWall(s, innerOpts);
      const viaOnce = buildConformingWallOnce(s, innerOpts);
      expect(fnv1a64(viaWrapper.vertices)).toBe(fnv1a64(viaOnce.vertices));
      expect(fnv1a64(viaWrapper.indices)).toBe(fnv1a64(viaOnce.indices));
    } finally {
      setFlag(undefined);
    }
  });
});

describe('buildConformingWall — verdict-refine flag ON drops outliers on a bump wall, stays watertight', () => {
  // A small (R=6) cylinder so the ambient circumferential arc is meshed below tol
  // by tight sizing (maxSag 0.008); `featureLevel 8` (≥ the ambient sizing level)
  // so the ONE-level escalation (featureLevel→featureLevel+1) actually adds
  // refinement at the feature. The localized radial bump (amp 0.6, width 0.02)
  // lives in the LIFT sampler only, so sizing under-tessellates it — the exact
  // shape of the P2.4 under-read the verdict loop exists to close.
  const R0 = 6, H = 40;
  const BUMP_T = 0.5;
  const FEATURE_LEVEL = 8;
  const U_BIAS = 0;
  const TOL_MM = 0.01;

  const plain = new SyntheticCylinderSampler(R0, H, 0, 0); // flat sizing base
  const bump = new BumpCylinderSampler(R0, H, 0.6, BUMP_U, BUMP_T, 0.02); // local bulge
  const bumpLift = asLift(bump);

  const opts: ConformingWallOptions = {
    maxSagMm: 0.008,
    maxEdgeMm: 200,
    minEdgeMm: 0.05,
    gradeRatio: 2,
    maxLevel: 10,
    resU: 33,
    resT: 17,
    nRing: 16,
    featureLevel: FEATURE_LEVEL,
    surfaceId: 0,
    featureLines: [featureVerticalCrease(BUMP_U)],
    // The LIFT sampler the verdict loop scores against (and the surface the
    // emitted triangles carry), so the measurement below is apples-to-apples.
    efgSampler: bump,
  };

  // Count outlier CELLS over the bump window only, so the ambient arc chord away
  // from the feature (irrelevant to the near-band loop) cannot mask the signal.
  const countBumpOutliers = (indices: Uint32Array, vertices: Float32Array): number =>
    scoreCandidateFacets(
      { vertices, indices },
      bumpLift,
      facetsInWindow(indices, vertices, BUMP_U, BUMP_T, 0.12, 0.12),
      TOL_MM,
      FEATURE_LEVEL,
      U_BIAS,
    ).length;

  it('flag ON reduces the outlier-cell count vs flag OFF and keeps nonManifold==0', () => {
    // Flag OFF baseline.
    setFlag(undefined);
    const wallOff = buildConformingWall(plain, opts);
    const outliersOff = countBumpOutliers(wallOff.indices, wallOff.vertices);

    // Flag ON — the two-pass verdict loop.
    setFlag(true);
    let wallOn: ReturnType<typeof buildConformingWall>;
    try {
      wallOn = buildConformingWall(plain, opts);
    } finally {
      setFlag(undefined);
    }
    const outliersOn = countBumpOutliers(wallOn.indices, wallOn.vertices);

    // The bump must actually stress the base mesh, else the test proves nothing.
    expect(outliersOff).toBeGreaterThan(0);
    // The keystone claim: escalating the near-band outliers' 1-rings reduces them.
    expect(outliersOn).toBeLessThan(outliersOff);
    // Watertight by construction — escalation must not manufacture a non-manifold edge.
    expect(nonManifoldByIndex(wallOn.indices)).toBe(0);
    // Flag-on must still add real geometry (a rebuild happened, not a no-op).
    expect(wallOn.indices.length).toBeGreaterThan(wallOff.indices.length);
  }, 30_000);
});

describe('buildConformingWall — verdict-refine loop ACCUMULATES + INCREMENTS across passes', () => {
  // A single sharp radial spike on the feature column at (0.5, 0.5). Its PEAK
  // cell is too curved to close at featureLevel+1, so it must climb two passes
  // (featureLevel → +1 → +2), while the surrounding APRON closes at +1 in pass 0.
  // In the FINAL mesh the peak sits at featureLevel+2 and the apron at
  // featureLevel+1 simultaneously — which proves BOTH loop properties at once:
  //  · INCREMENT: the peak reached +2, i.e. two escalation passes ran (a single
  //    +1 escalation, the old buggy loop, could never reach +2).
  //  · ACCUMULATE / NO-REOPEN: the apron was escalated to +1 in pass 0; by the
  //    pass that drove the peak to +2 the apron was no longer an outlier, so the
  //    ONLY way it stays at +1 in the final mesh is the persistent `targets` map.
  //    A replace-not-accumulate loop would have reset the apron to featureLevel.
  const R0 = 6, H = 40, L = 8;
  const plain = new SyntheticCylinderSampler(R0, H, 0, 0);
  const spike = new BumpCylinderSampler(R0, H, 2, 0.5, 0.5, 0.01);
  const opts: ConformingWallOptions = {
    maxSagMm: 0.008,
    maxEdgeMm: 200,
    minEdgeMm: 0.05,
    gradeRatio: 2,
    maxLevel: 12, // headroom well above featureLevel+2
    resU: 33,
    resT: 17,
    nRing: 16,
    featureLevel: L,
    surfaceId: 0,
    featureLines: [featureVerticalCrease(0.5)],
    efgSampler: spike,
  };

  it('peak climbs to featureLevel+2 (two passes) while the +1 apron persists (no reopen)', () => {
    setFlag(undefined);
    const off = buildConformingWall(plain, opts);
    setFlag(true);
    let on: ReturnType<typeof buildConformingWall>;
    try {
      on = buildConformingWall(plain, opts);
    } finally {
      setFlag(undefined);
    }

    // Baseline: the peak sits at the featureLevel floor before the loop runs.
    const peakOff = localLevel(off.vertices, 0.5, 0.5, 0.02, 0.006);
    expect(peakOff).toBe(L);

    // INCREMENT: two passes drove the peak cell to featureLevel+2.
    const peakOn = localLevel(on.vertices, 0.5, 0.5, 0.02, 0.006);
    expect(peakOn).toBe(L + 2);

    // ACCUMULATE / NO-REOPEN: an apron cell off the peak retains its pass-0
    // featureLevel+1 escalation in the final (+2-at-peak) mesh — it was neither
    // reset to featureLevel nor dragged to +2.
    const apronOn = localLevel(on.vertices, 0.5, 0.5 + 0.03, 0.02, 0.004);
    expect(apronOn).toBe(L + 1);

    // Still watertight after multi-pass escalation.
    expect(nonManifoldByIndex(on.indices)).toBe(0);
  }, 30_000);
});
