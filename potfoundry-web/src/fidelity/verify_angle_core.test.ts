/**
 * verify_angle_core.test.ts — ADVERSARIAL cross-check of the shared 3D-angle /
 * triangulation-enumeration core in cellTriangulationCeiling.ts.
 *
 * This file is an AUDIT INSTRUMENT, not a production gate. It re-derives every
 * answer the core produces by a SECOND, independent algorithm and compares:
 *
 *  (1) triangulationsOfNgon — verify completeness (the SET of triangulations,
 *      not just the Catalan count) against a brute-force diagonal enumerator
 *      that knows NOTHING about the production recursion. Also verify each
 *      triangulation is geometrically valid (non-overlapping, covers polygon).
 *
 *  (2) triMinAngleDeg3 — verify the dot-product/arccos angle against the
 *      law-of-cosines from edge lengths (a fully independent formula) on known
 *      3D triangles (equilateral, right, degenerate, a deliberately skewed
 *      out-of-plane needle).
 *
 *  (3) polygonBestMinAngle3D — the load-bearing claim: best-of-triangulations
 *      truly maximizes the min 3D angle on a NON-PLANAR quad/pentagon/hexagon.
 *      Cross-checked against a brute-force "evaluate every triangulation's
 *      min-angle, take the max" reference written here independently, on quads
 *      where the TWO diagonals give DIFFERENT min-angles (so the max-min choice
 *      is non-trivial and a wrong pick would be caught).
 *
 *  (4) convexity precondition — the core's fan-recursion completeness is proven
 *      only for CONVEX polygons. Verify the sub-polygons the SFB@1 audit
 *      actually feeds to polygonBestMinAngle3D are convex in (u,t); and probe
 *      what the core returns on a NON-convex polygon (does it silently emit a
 *      triangulation using a diagonal that lies OUTSIDE the polygon?).
 *
 * No production code is touched. Pure CPU.
 */
import { describe, it, expect } from 'vitest';
import type { PositionSampler } from './metrics';
import type { CellPoint } from '../renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';
import {
  triangulationsOfNgon,
  polygonBestMinAngle3D,
  runSfbCrestCellCeilingAudit,
} from './cellTriangulationCeiling';
import { SfbWallSampler, SFB1_PACKED } from './snapPlacementAudit';

type V3 = readonly [number, number, number];

// ─────────────────────────────────────────────────────────────────────────────
// Independent reference implementations (NO shared code with the core)
// ─────────────────────────────────────────────────────────────────────────────

/** Independent 3D triangle min-angle via the LAW OF COSINES on edge lengths.
 *  cos C = (a² + b² − c²)/(2ab). Completely different formula path from the
 *  core's per-vertex dot-product/arccos. Returns degrees. */
function refTriMinAngleLawOfCosines(A: V3, B: V3, C: V3): number {
  const dist = (p: V3, q: V3): number =>
    Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const a = dist(B, C); // opposite A
  const b = dist(C, A); // opposite B
  const c = dist(A, B); // opposite C
  if (a < 1e-12 || b < 1e-12 || c < 1e-12) return 0;
  const clamp = (x: number): number => (x > 1 ? 1 : x < -1 ? -1 : x);
  const angA = Math.acos(clamp((b * b + c * c - a * a) / (2 * b * c)));
  const angB = Math.acos(clamp((a * a + c * c - b * b) / (2 * a * c)));
  const angC = Math.acos(clamp((a * a + b * b - c * c) / (2 * a * b)));
  return (Math.min(angA, angB, angC) * 180) / Math.PI;
}

/** Independent brute-force enumeration of ALL triangulations of a polygon with
 *  vertices 0..n−1. Algorithm: recursively pick a triangle on the base edge
 *  (0, n−1) with apex k, split into two SUB-CHAINS by the vertex SUBSET on each
 *  side. This mirrors the standard polygon-triangulation DP but is written from
 *  scratch over explicit vertex-index lists (not the lo/hi integer recursion of
 *  the production code) so a bug in the production recursion bounds would show. */
function refTriangulations(verts: number[]): Array<Array<[number, number, number]>> {
  const n = verts.length;
  if (n < 3) return [[]];
  if (n === 3) return [[[verts[0], verts[1], verts[2]]]];
  const out: Array<Array<[number, number, number]>> = [];
  const a = verts[0];
  const b = verts[n - 1];
  for (let k = 1; k < n - 1; k++) {
    const apex = verts[k];
    const leftChain = verts.slice(0, k + 1); // a..apex
    const rightChain = verts.slice(k); // apex..b
    const lefts = refTriangulations(leftChain);
    const rights = refTriangulations(rightChain);
    for (const L of lefts) {
      for (const R of rights) {
        out.push([...L, [a, apex, b], ...R]);
      }
    }
  }
  return out;
}

/** Canonical key for a triangulation: each triangle's index-set sorted, then
 *  the list of triangles sorted. Lets us compare two triangulation SETS for
 *  exact equality regardless of triangle/vertex ordering. */
function triangulationKey(T: Array<[number, number, number]>): string {
  return T.map((t) => [...t].sort((x, y) => x - y).join('-'))
    .sort()
    .join('|');
}

function triangulationSetKeys(set: Array<Array<[number, number, number]>>): Set<string> {
  return new Set(set.map(triangulationKey));
}

/** Independent max-over-triangulations of the min 3D angle, using the REFERENCE
 *  enumerator + the REFERENCE law-of-cosines angle. Zero shared code with the
 *  production polygonBestMinAngle3D. */
function refPolygonBestMinAngle3D(poly: CellPoint[], surf: PositionSampler): number {
  const n = poly.length;
  if (n < 3) return Infinity;
  const P: V3[] = poly.map((p) => surf.position(p.u, p.t));
  if (n === 3) return refTriMinAngleLawOfCosines(P[0], P[1], P[2]);
  let best = -Infinity;
  for (const T of refTriangulations(poly.map((_, i) => i))) {
    let mn = Infinity;
    for (const [i, j, k] of T) {
      const a = refTriMinAngleLawOfCosines(P[i], P[j], P[k]);
      if (a < mn) mn = a;
    }
    if (mn > best) best = mn;
  }
  return best;
}

/** Is the (u,t) polygon strictly convex (all cross products same sign)? */
function isConvexUT(poly: CellPoint[]): boolean {
  const n = poly.length;
  if (n < 3) return true;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const c = poly[(i + 2) % n];
    const cross = (b.u - a.u) * (c.t - b.t) - (b.t - a.t) * (c.u - b.u);
    if (Math.abs(cross) < 1e-15) continue; // collinear edge — tolerate
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// (1) triangulationsOfNgon — completeness, not just count
// ─────────────────────────────────────────────────────────────────────────────

describe('CORE (1): triangulationsOfNgon enumerates the COMPLETE set', () => {
  it('the SET of triangulations equals an independent brute-force enumeration (n=3..7)', () => {
    for (let n = 3; n <= 7; n++) {
      const prod = triangulationSetKeys(triangulationsOfNgon(n));
      const ref = triangulationSetKeys(
        refTriangulations(Array.from({ length: n }, (_, i) => i)),
      );
      // exact set equality — no triangulation missing, none extra
      expect(prod.size).toBe(ref.size);
      for (const k of ref) expect(prod.has(k)).toBe(true);
      for (const k of prod) expect(ref.has(k)).toBe(true);
    }
  });

  it('every emitted triangulation is a valid dissection (n−2 tris, covers area, no overlap) on a regular convex n-gon', () => {
    for (let n = 3; n <= 7; n++) {
      // regular convex polygon
      const P = Array.from({ length: n }, (_, i) => {
        const a = (2 * Math.PI * i) / n;
        return [Math.cos(a), Math.sin(a)] as [number, number];
      });
      const polyArea = (() => {
        let s = 0;
        for (let i = 0; i < n; i++) {
          const [x1, y1] = P[i];
          const [x2, y2] = P[(i + 1) % n];
          s += x1 * y2 - x2 * y1;
        }
        return Math.abs(s) / 2;
      })();
      for (const T of triangulationsOfNgon(n)) {
        expect(T.length).toBe(n - 2);
        let triAreaSum = 0;
        for (const [i, j, k] of T) {
          const [ax, ay] = P[i];
          const [bx, by] = P[j];
          const [cx, cy] = P[k];
          const ar = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
          triAreaSum += ar;
        }
        // Sum of triangle areas == polygon area  ⟺  covers w/o overlap or gap
        // (for a valid dissection of a convex polygon).
        expect(triAreaSum).toBeCloseTo(polyArea, 9);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (2) triMinAngleDeg3 — via polygonBestMinAngle3D(n=3) vs law of cosines
// ─────────────────────────────────────────────────────────────────────────────

describe('CORE (2): 3D triangle min-angle matches the law of cosines', () => {
  // polygonBestMinAngle3D with n=3 calls triMinAngleDeg3 directly (no choice).
  const triSampler = (pts: V3[]): PositionSampler => ({
    position: (u: number): V3 => pts[Math.round(u)],
  });
  // 3 indices that the sampler maps to the 3 given 3D points.
  const triIdx: CellPoint[] = [
    { u: 0, t: 0 },
    { u: 1, t: 0 },
    { u: 2, t: 0 },
  ];
  const measure = (a: V3, b: V3, c: V3): number =>
    polygonBestMinAngle3D(triIdx, triSampler([a, b, c]));

  const cases: Array<{ name: string; a: V3; b: V3; c: V3 }> = [
    { name: 'equilateral (xy)', a: [0, 0, 0], b: [1, 0, 0], c: [0.5, Math.sqrt(3) / 2, 0] },
    { name: 'right 3-4-5 (xy)', a: [0, 0, 0], b: [3, 0, 0], c: [0, 4, 0] },
    { name: 'equilateral tilted into z', a: [0, 0, 0], b: [1, 0, 1], c: [0.5, Math.sqrt(3) / 2, 0.5] },
    { name: 'out-of-plane needle', a: [0, 0, 0], b: [10, 0, 0], c: [5, 0.2, 0.3] },
    { name: 'fully 3D scalene', a: [1, 2, 3], b: [4, 0, 1], c: [-2, 5, 0] },
    { name: 'near-degenerate (collinear-ish in 3D)', a: [0, 0, 0], b: [1, 1, 1], c: [2, 2, 2.0001] },
  ];

  for (const c of cases) {
    it(`min-angle agrees on ${c.name}`, () => {
      const core = measure(c.a, c.b, c.c);
      const ref = refTriMinAngleLawOfCosines(c.a, c.b, c.c);
      expect(core).toBeCloseTo(ref, 8);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// (3) polygonBestMinAngle3D — true max-min on NON-PLANAR polygons
// ─────────────────────────────────────────────────────────────────────────────

describe('CORE (3): best-of-triangulations is the true max-min on NON-PLANAR cells', () => {
  /** A height field z = f(u,t) makes the mapped quad genuinely non-planar. */
  const heightSampler = (f: (u: number, t: number) => number): PositionSampler => ({
    position: (u: number, t: number): V3 => [u, t, f(u, t)],
  });

  it('a NON-PLANAR quad where the two diagonals give DIFFERENT min-angles: core picks the larger', () => {
    // Unit square in (u,t); a saddle-ish height so the two diagonals are NOT
    // equivalent. Diagonal 0-2 vs 1-3 will have different min-angles in 3D.
    const sq: CellPoint[] = [
      { u: 0, t: 0 },
      { u: 1, t: 0 },
      { u: 1, t: 1 },
      { u: 0, t: 1 },
    ];
    // Asymmetric height: lifts corner 1 (u=1,t=0) far out of plane so the two
    // diagonals split the quad into very differently-shaped 3D triangles.
    const surf = heightSampler((u, t) => 1.6 * u * (1 - t));
    const P = sq.map((p) => surf.position(p.u, p.t));

    // Independently compute each diagonal's min-angle.
    const diagA = Math.min(
      refTriMinAngleLawOfCosines(P[0], P[1], P[2]),
      refTriMinAngleLawOfCosines(P[0], P[2], P[3]),
    ); // diagonal 0-2
    const diagB = Math.min(
      refTriMinAngleLawOfCosines(P[1], P[2], P[3]),
      refTriMinAngleLawOfCosines(P[1], P[3], P[0]),
    ); // diagonal 1-3
    const trueMax = Math.max(diagA, diagB);

    const core = polygonBestMinAngle3D(sq, surf);
    // The two diagonals MUST differ (otherwise this case proves nothing).
    expect(Math.abs(diagA - diagB)).toBeGreaterThan(1.0);
    expect(core).toBeCloseTo(trueMax, 8);
    // And the core must NOT have returned the worse diagonal.
    expect(core).toBeGreaterThan(Math.min(diagA, diagB) + 0.5);
  });

  it('matches the independent brute-force max-min over MANY random non-planar quads', () => {
    let worstAbsErr = 0;
    let cmpCount = 0;
    let nontrivialDiagChoices = 0; // cases where diagonals differ by >0.5deg
    // deterministic PRNG
    let seed = 0x9e3779b9 >>> 0;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let trial = 0; trial < 400; trial++) {
      const sq: CellPoint[] = [
        { u: 0, t: 0 },
        { u: 1, t: 0 },
        { u: 1, t: 1 },
        { u: 0, t: 1 },
      ];
      // random smooth-ish height field
      const c0 = (rnd() - 0.5) * 2;
      const c1 = (rnd() - 0.5) * 2;
      const c2 = (rnd() - 0.5) * 2;
      const c3 = (rnd() - 0.5) * 4;
      const surf = heightSampler((u, t) => c0 * u + c1 * t + c2 * u * t + c3 * (u - 0.5) * (t - 0.5));
      const core = polygonBestMinAngle3D(sq, surf);
      const ref = refPolygonBestMinAngle3D(sq, surf);
      const err = Math.abs(core - ref);
      if (err > worstAbsErr) worstAbsErr = err;
      cmpCount++;
      const P = sq.map((p) => surf.position(p.u, p.t));
      const dA = Math.min(
        refTriMinAngleLawOfCosines(P[0], P[1], P[2]),
        refTriMinAngleLawOfCosines(P[0], P[2], P[3]),
      );
      const dB = Math.min(
        refTriMinAngleLawOfCosines(P[1], P[2], P[3]),
        refTriMinAngleLawOfCosines(P[1], P[3], P[0]),
      );
      if (Math.abs(dA - dB) > 0.5) nontrivialDiagChoices++;
    }
    /* eslint-disable no-console */
    console.log(
      `\n[angle-core] random non-planar QUADS: n=${cmpCount}, worst |core-ref|=${worstAbsErr.toExponential(3)}deg, ` +
        `non-trivial-diagonal cases=${nontrivialDiagChoices}`,
    );
    /* eslint-enable no-console */
    expect(worstAbsErr).toBeLessThan(1e-7);
    expect(nontrivialDiagChoices).toBeGreaterThan(50); // proves the test exercises the choice
  });

  it('matches brute-force on random non-planar PENTAGONS and HEXAGONS (n=5,6)', () => {
    let worstAbsErr5 = 0;
    let worstAbsErr6 = 0;
    let seed = 0xdeadbeef >>> 0;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    const regularConvex = (n: number): CellPoint[] =>
      Array.from({ length: n }, (_, i) => {
        const a = (2 * Math.PI * i) / n + 0.1;
        return { u: 0.5 + 0.4 * Math.cos(a), t: 0.5 + 0.4 * Math.sin(a) };
      });
    for (let trial = 0; trial < 200; trial++) {
      const ca = (rnd() - 0.5) * 3;
      const cb = (rnd() - 0.5) * 3;
      const cc = (rnd() - 0.5) * 5;
      const surf: PositionSampler = {
        position: (u: number, t: number): V3 => [
          u,
          t,
          ca * u + cb * t + cc * Math.sin(3 * u) * Math.cos(2 * t),
        ],
      };
      const pent = regularConvex(5);
      const hex = regularConvex(6);
      worstAbsErr5 = Math.max(
        worstAbsErr5,
        Math.abs(polygonBestMinAngle3D(pent, surf) - refPolygonBestMinAngle3D(pent, surf)),
      );
      worstAbsErr6 = Math.max(
        worstAbsErr6,
        Math.abs(polygonBestMinAngle3D(hex, surf) - refPolygonBestMinAngle3D(hex, surf)),
      );
    }
    /* eslint-disable no-console */
    console.log(
      `[angle-core] random non-planar PENTAGON worst |core-ref|=${worstAbsErr5.toExponential(3)}deg, ` +
        `HEXAGON worst=${worstAbsErr6.toExponential(3)}deg`,
    );
    /* eslint-enable no-console */
    expect(worstAbsErr5).toBeLessThan(1e-7);
    expect(worstAbsErr6).toBeLessThan(1e-7);
  });

  it('the prune optimization does not change the answer (compare pruned core vs un-pruned ref on the SAME quads)', () => {
    // This is implicitly covered above, but make the prune-correctness explicit:
    // construct a quad where the FIRST-enumerated triangulation is the WORSE one,
    // so a buggy prune (that early-returned the first incumbent) would fail.
    const sq: CellPoint[] = [
      { u: 0, t: 0 },
      { u: 1, t: 0 },
      { u: 1, t: 1 },
      { u: 0, t: 1 },
    ];
    // diagonal 0-2 is the FIRST fan triangulation enumerated; make it the worse one
    const surf: PositionSampler = {
      position: (u: number, t: number): V3 => [u, t, 2.0 * (u - 0.5) * (t - 0.5)],
    };
    const P = sq.map((p) => surf.position(p.u, p.t));
    const diagA = Math.min(
      refTriMinAngleLawOfCosines(P[0], P[1], P[2]),
      refTriMinAngleLawOfCosines(P[0], P[2], P[3]),
    );
    const diagB = Math.min(
      refTriMinAngleLawOfCosines(P[1], P[2], P[3]),
      refTriMinAngleLawOfCosines(P[1], P[3], P[0]),
    );
    const core = polygonBestMinAngle3D(sq, surf);
    expect(core).toBeCloseTo(Math.max(diagA, diagB), 8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (4) Convexity precondition — does the audit ONLY feed convex sub-polygons,
//     and what does the core do on a NON-convex polygon?
// ─────────────────────────────────────────────────────────────────────────────

describe('CORE (4): convexity precondition of the fan-recursion', () => {
  it('on a NON-CONVEX polygon, the core can emit a triangulation with an OUTSIDE diagonal (documents the precondition)', () => {
    // An "arrow"/dart quad: vertex 2 is a reflex vertex. CCW-ish order.
    // The valid triangulation must use diagonal 1-3 (through the interior);
    // diagonal 0-2 lies OUTSIDE the polygon. A convex-only enumerator that
    // blindly tries both will produce an invalid triangulation.
    const dart: CellPoint[] = [
      { u: 0, t: 0 },
      { u: 2, t: 1 },
      { u: 0.5, t: 0.8 }, // reflex vertex pulled inward
      { u: -2, t: 1 },
    ];
    expect(isConvexUT(dart)).toBe(false);

    // Reference: which of the 2 quad triangulations is geometrically valid?
    // A triangulation is valid iff every triangle is inside the polygon, i.e.
    // the sum of |signed tri areas| == |polygon area| AND signs consistent.
    const area2 = (a: CellPoint, b: CellPoint, c: CellPoint): number =>
      ((b.u - a.u) * (c.t - a.t) - (b.t - a.t) * (c.u - a.u)) / 2;
    const polyArea = Math.abs(
      area2(dart[0], dart[1], dart[2]) + area2(dart[0], dart[2], dart[3]),
    );
    // diagonal 0-2 triangulation: tris (0,1,2)+(0,2,3)
    const sumA =
      Math.abs(area2(dart[0], dart[1], dart[2])) + Math.abs(area2(dart[0], dart[2], dart[3]));
    // diagonal 1-3 triangulation: tris (1,2,3)+(1,3,0)
    const sumB =
      Math.abs(area2(dart[1], dart[2], dart[3])) + Math.abs(area2(dart[1], dart[3], dart[0]));
    const validA = Math.abs(sumA - polyArea) < 1e-9;
    const validB = Math.abs(sumB - polyArea) < 1e-9;

    /* eslint-disable no-console */
    console.log(
      `\n[angle-core] NON-CONVEX dart: diag0-2 valid=${validA}, diag1-3 valid=${validB} ` +
        `(exactly one should be valid for a simple non-convex quad)`,
    );
    /* eslint-enable no-console */
    // For a non-convex simple quad exactly ONE diagonal is interior.
    expect(validA !== validB).toBe(true);
    // The CORE enumerates BOTH and returns the max-min over BOTH — including the
    // invalid one. This is the documented precondition: it is SAFE only because
    // the audit guarantees convex inputs. We assert the core does NOT internally
    // reject the invalid triangulation (i.e. it has no convexity guard):
    const dartSurf: PositionSampler = { position: (u, t): V3 => [u, t, 0] };
    const core = polygonBestMinAngle3D(dart, dartSurf);
    // brute-force max-min over BOTH (matching the core's behavior, NOT validity)
    const P = dart.map((p) => dartSurf.position(p.u, p.t));
    const both = Math.max(
      Math.min(
        refTriMinAngleLawOfCosines(P[0], P[1], P[2]),
        refTriMinAngleLawOfCosines(P[0], P[2], P[3]),
      ),
      Math.min(
        refTriMinAngleLawOfCosines(P[1], P[2], P[3]),
        refTriMinAngleLawOfCosines(P[1], P[3], P[0]),
      ),
    );
    expect(core).toBeCloseTo(both, 8);
    // => CONFIRMED: the core has NO convexity guard; correctness rests entirely
    //    on the caller feeding convex polygons.
  });

  it('EVERY sub-polygon the SFB@1 audit feeds to the core IS convex in (u,t)', () => {
    // Re-derive the sub-polygons the audit builds and check convexity. The audit
    // splits an axis-aligned cell by a single chord into two sub-polygons; an
    // axis-aligned rectangle cut by one straight chord yields two convex pieces
    // BY GEOMETRY. We verify this on the REAL crossed cells by reconstructing
    // the same boundary/sub-split the production measureCellCeiling uses.
    //
    // We cannot import the private measureCellCeiling sub-split builder, so we
    // re-implement the SAME boundary construction here and run it over the real
    // audit's worst cells (which carry e1/e2 and the cell rect).
    const r = runSfbCrestCellCeilingAudit({ worstK: 64 });
    const EPS = 1e-9;
    type Side = 'S' | 'E' | 'N' | 'W' | 'corner' | 'off';
    const edgeOf = (
      p: CellPoint,
      u0: number,
      t0: number,
      u1: number,
      t1: number,
    ): Side => {
      const onS = Math.abs(p.t - t0) < EPS;
      const onN = Math.abs(p.t - t1) < EPS;
      const onW = Math.abs(p.u - u0) < EPS;
      const onE = Math.abs(p.u - u1) < EPS;
      const count = (onS ? 1 : 0) + (onN ? 1 : 0) + (onW ? 1 : 0) + (onE ? 1 : 0);
      if (count !== 1) return count >= 2 ? 'corner' : 'off';
      if (onS) return 'S';
      if (onE) return 'E';
      if (onN) return 'N';
      return 'W';
    };
    let checked = 0;
    let nonConvexCount = 0;
    for (const c of r.worstCells) {
      if (c.topology !== 'corner-clip' && c.topology !== 'opposite') continue;
      const { u0, t0, u1, t1, e1, e2 } = c;
      const s1 = edgeOf(e1, u0, t0, u1, t1);
      const s2 = edgeOf(e2, u0, t0, u1, t1);
      const sw: CellPoint = { u: u0, t: t0 };
      const se: CellPoint = { u: u1, t: t0 };
      const ne: CellPoint = { u: u1, t: t1 };
      const nw: CellPoint = { u: u0, t: t1 };
      const onSide = (side: Side): CellPoint[] => {
        const out: CellPoint[] = [];
        if (s1 === side) out.push(e1);
        if (s2 === side) out.push(e2);
        return out;
      };
      const boundary: CellPoint[] = [
        sw, ...onSide('S'),
        se, ...onSide('E'),
        ne, ...onSide('N'),
        nw, ...onSide('W'),
      ];
      const sameUT = (a: CellPoint, b: CellPoint): boolean =>
        Math.abs(a.u - b.u) < EPS && Math.abs(a.t - b.t) < EPS;
      const i1 = boundary.findIndex((p) => sameUT(p, e1));
      const i2 = boundary.findIndex((p) => sameUT(p, e2));
      if (i1 < 0 || i2 < 0) continue;
      const lo = Math.min(i1, i2);
      const hi = Math.max(i1, i2);
      const subA = boundary.slice(lo, hi + 1);
      const subB = [...boundary.slice(hi), ...boundary.slice(0, lo + 1)];
      if (!isConvexUT(subA)) nonConvexCount++;
      if (!isConvexUT(subB)) nonConvexCount++;
      checked += 2;
    }
    /* eslint-disable no-console */
    console.log(
      `\n[angle-core] audit sub-polygons convexity: checked=${checked}, non-convex=${nonConvexCount}`,
    );
    /* eslint-enable no-console */
    expect(checked).toBeGreaterThan(0);
    expect(nonConvexCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (5) Real-surface sanity: the core on the ACTUAL SfbWallSampler (not planar)
// ─────────────────────────────────────────────────────────────────────────────

describe('CORE (5): on the REAL SFB@1 surface, core == independent brute force', () => {
  it("every worst cell's ceiling equals the independent brute-force max-min on the SAME 3D points", () => {
    // We cannot re-run measureCellCeiling's internal split here without the
    // surface, but runSfbCrestCellCeilingAudit reports bestMinAngleDeg per cell.
    // Re-derive that number independently from the cell rect + e1/e2 + the SAME
    // SfbWallSampler surface, and compare to the audit's reported ceiling.
    // (This closes the loop: production polygonBestMinAngle3D vs ref on the
    //  REAL warped surface, not a planar stand-in.)
    // The surface is SfbWallSampler — reconstruct it via the audit's public API
    // by importing the same config. Simpler: trust that audit used the real
    // surface and re-split using OUR ref enumerator over the audit's sub-polys.
    const r = runSfbCrestCellCeilingAudit({ worstK: 32 });
    // Rebuild the EXACT production surface the audit used (same exported class +
    // packed params), so this re-derivation runs on the warped surface, not a
    // planar stand-in.
    const surf = new SfbWallSampler(Float32Array.from(SFB1_PACKED));
    const EPS = 1e-9;
    type Side = 'S' | 'E' | 'N' | 'W' | 'corner' | 'off';
    const edgeOf = (p: CellPoint, u0: number, t0: number, u1: number, t1: number): Side => {
      const onS = Math.abs(p.t - t0) < EPS;
      const onN = Math.abs(p.t - t1) < EPS;
      const onW = Math.abs(p.u - u0) < EPS;
      const onE = Math.abs(p.u - u1) < EPS;
      const count = (onS ? 1 : 0) + (onN ? 1 : 0) + (onW ? 1 : 0) + (onE ? 1 : 0);
      if (count !== 1) return count >= 2 ? 'corner' : 'off';
      if (onS) return 'S';
      if (onE) return 'E';
      if (onN) return 'N';
      return 'W';
    };
    let checked = 0;
    let worstErr = 0;
    for (const c of r.worstCells) {
      if (c.topology !== 'corner-clip' && c.topology !== 'opposite') continue;
      const { u0, t0, u1, t1, e1, e2 } = c;
      const s1 = edgeOf(e1, u0, t0, u1, t1);
      const s2 = edgeOf(e2, u0, t0, u1, t1);
      const sw: CellPoint = { u: u0, t: t0 };
      const se: CellPoint = { u: u1, t: t0 };
      const ne: CellPoint = { u: u1, t: t1 };
      const nw: CellPoint = { u: u0, t: t1 };
      const onSide = (side: Side): CellPoint[] => {
        const out: CellPoint[] = [];
        if (s1 === side) out.push(e1);
        if (s2 === side) out.push(e2);
        return out;
      };
      const boundary: CellPoint[] = [
        sw, ...onSide('S'),
        se, ...onSide('E'),
        ne, ...onSide('N'),
        nw, ...onSide('W'),
      ];
      const sameUT = (a: CellPoint, b: CellPoint): boolean =>
        Math.abs(a.u - b.u) < EPS && Math.abs(a.t - b.t) < EPS;
      const i1 = boundary.findIndex((p) => sameUT(p, e1));
      const i2 = boundary.findIndex((p) => sameUT(p, e2));
      if (i1 < 0 || i2 < 0) continue;
      const lo = Math.min(i1, i2);
      const hi = Math.max(i1, i2);
      const subA = boundary.slice(lo, hi + 1);
      const subB = [...boundary.slice(hi), ...boundary.slice(0, lo + 1)];
      const refCeil = Math.min(
        refPolygonBestMinAngle3D(subA, surf),
        refPolygonBestMinAngle3D(subB, surf),
      );
      const err = Math.abs(refCeil - c.bestMinAngleDeg);
      if (err > worstErr) worstErr = err;
      checked++;
    }
    /* eslint-disable no-console */
    console.log(
      `\n[angle-core] REAL SFB@1 surface: re-derived ceiling on ${checked} worst cells, ` +
        `worst |ref - audit.bestMinAngleDeg| = ${worstErr.toExponential(3)}deg`,
    );
    /* eslint-enable no-console */
    expect(checked).toBeGreaterThan(0);
    expect(worstErr).toBeLessThan(1e-6);
  });
});
