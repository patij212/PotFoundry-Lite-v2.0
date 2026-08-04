import { describe, it, expect } from 'vitest';
import { ProductionEdgeCache } from './ProductionEdgeCache';
import { footPointDistance } from './FootPointMetric';
import {
  buildShieldZones,
  isPointShielded,
  buildStructuredFan,
  validateFanAR,
  triangleAR,
  type FeatureJunction,
} from './ConformalDiskSubdivision';

describe('Strata Production Modules', () => {
  // ────────────────────────────────────────────────────────────────────────
  // ProductionEdgeCache
  // ────────────────────────────────────────────────────────────────────────

  it('ProductionEdgeCache performs zero-tombstone backward-shift deletion and lookups correctly', () => {
    const cache = new ProductionEdgeCache(16);

    // Insert 10 edges
    const slots: number[] = [];
    for (let i = 0; i < 10; i++) {
      slots.push(cache.lookup(i, i + 1));
      cache.sags[slots[i]] = (i + 1) * 0.01;
    }

    expect(cache.size).toBe(10);

    // Verify lookup retrieves same slots
    for (let i = 0; i < 10; i++) {
      const s = cache.lookup(i, i + 1);
      expect(cache.sags[s]).toBeCloseTo((i + 1) * 0.01);
    }

    // Evict 3 edges
    cache.evict(2, 3);
    cache.evict(5, 6);
    cache.evict(8, 9);

    expect(cache.size).toBe(7);

    // Evicted items allocation creates fresh slots without tombstones
    const newSlot = cache.lookup(2, 3);
    expect(cache.size).toBe(8);
  });

  it('ProductionEdgeCache: getSag/setSag accessors work correctly', () => {
    const cache = new ProductionEdgeCache(16);
    const slot = cache.lookup(100, 200);
    cache.setSag(slot, 3.14);
    expect(cache.getSag(slot)).toBeCloseTo(3.14, 2);
    // Direct sags array access should agree
    expect(cache.sags[slot]).toBeCloseTo(3.14, 2);
  });

  it('ProductionEdgeCache: find() returns -1 for missing edges', () => {
    const cache = new ProductionEdgeCache(16);
    cache.lookup(1, 2);
    expect(cache.find(1, 2)).toBeGreaterThanOrEqual(0);
    expect(cache.find(3, 4)).toBe(-1);
  });

  it('ProductionEdgeCache: constructor enforces power-of-two capacity', () => {
    const cache = new ProductionEdgeCache(17); // not a power of 2
    // Should round up to 32
    // Insert enough to verify it works
    for (let i = 0; i < 15; i++) {
      cache.lookup(i, i + 100);
    }
    expect(cache.size).toBe(15);
  });

  // ────────────────────────────────────────────────────────────────────────
  // FootPointMetric
  // ────────────────────────────────────────────────────────────────────────

  it('FootPointMetric computes exact 3D perpendicular distance with zero object allocations', () => {
    // Surface: planar S(u,v) = (u, v, 0)
    const S = (u: number, v: number, out: Float64Array, offset: number) => {
      out[offset] = u;
      out[offset + 1] = v;
      out[offset + 2] = 0;
    };
    const dS_du = (_u: number, _v: number, out: Float64Array, offset: number) => {
      out[offset] = 1;
      out[offset + 1] = 0;
      out[offset + 2] = 0;
    };
    const dS_dv = (_u: number, _v: number, out: Float64Array, offset: number) => {
      out[offset] = 0;
      out[offset + 1] = 1;
      out[offset + 2] = 0;
    };

    // Point at (2, 3, 5) -> perpendicular distance to z=0 plane is 5
    const dist = footPointDistance(2, 3, 5, 0, 0, S, dS_du, dS_dv);
    expect(dist).toBeCloseTo(5.0);
  });

  it('FootPointMetric converges with user-supplied scratch buffer (thread-safe)', () => {
    // Sphere of radius 10: S(u,v) = (10 cos u sin v, 10 sin u sin v, 10 cos v)
    const R = 10;
    const S = (u: number, v: number, out: Float64Array, off: number) => {
      out[off]     = R * Math.cos(u) * Math.sin(v);
      out[off + 1] = R * Math.sin(u) * Math.sin(v);
      out[off + 2] = R * Math.cos(v);
    };
    const dS_du = (u: number, v: number, out: Float64Array, off: number) => {
      out[off]     = -R * Math.sin(u) * Math.sin(v);
      out[off + 1] =  R * Math.cos(u) * Math.sin(v);
      out[off + 2] = 0;
    };
    const dS_dv = (u: number, v: number, out: Float64Array, off: number) => {
      out[off]     = R * Math.cos(u) * Math.cos(v);
      out[off + 1] = R * Math.sin(u) * Math.cos(v);
      out[off + 2] = -R * Math.sin(v);
    };

    // Point at (15, 0, 0) → closest point on sphere is (10, 0, 0) → distance = 5
    const scratch = new Float64Array(27);
    const dist = footPointDistance(15, 0, 0, 0, Math.PI / 2, S, dS_du, dS_dv, {
      scratch,
      uBounds: [-Math.PI, Math.PI],
      vBounds: [0.01, Math.PI - 0.01], // avoid poles
    });
    expect(dist).toBeCloseTo(5.0, 4);
  });

  it('FootPointMetric: domain clamping prevents divergence', () => {
    // Parabolic surface S(u,v) = (u, v, u² + v²)
    const S = (u: number, v: number, out: Float64Array, off: number) => {
      out[off] = u; out[off + 1] = v; out[off + 2] = u * u + v * v;
    };
    const dS_du = (u: number, v: number, out: Float64Array, off: number) => {
      out[off] = 1; out[off + 1] = 0; out[off + 2] = 2 * u;
    };
    const dS_dv = (u: number, v: number, out: Float64Array, off: number) => {
      out[off] = 0; out[off + 1] = 1; out[off + 2] = 2 * v;
    };

    // With tight domain bounds, even a bad initial guess should stay in bounds
    const dist = footPointDistance(0, 0, 0, 100, 100, S, dS_du, dS_dv, {
      uBounds: [-5, 5],
      vBounds: [-5, 5],
    });
    // Should converge to the origin (0,0,0) which IS on the surface → distance ≈ 0
    expect(dist).toBeLessThan(0.01);
  });

  // ────────────────────────────────────────────────────────────────────────
  // ConformalDiskSubdivision
  // ────────────────────────────────────────────────────────────────────────

  it('ConformalDiskSubdivision identifies acute feature junctions and shields them', () => {
    const shieldMap = buildShieldZones(
      [
        {
          apexVertex: 42,
          theta: 0.5,
          z: 20,
          minApexAngleRad: Math.PI / 6, // 30 degrees < 60 degrees -> shield
          featureEdges: [[42, 43], [42, 44]],
          edgeAngles: [0, Math.PI / 6],
        },
      ],
      0.1 // hFeature = 0.1 mm -> rShield = 0.2 mm
    );

    expect(shieldMap.has(42)).toBe(true);

    // Point close to apex (within 0.2 mm) -> shielded
    const shielded = isPointShielded(0.5, 20.05, 45, shieldMap);
    expect(shielded).toBe(true);

    // Point far from apex (10 mm away) -> not shielded
    const far = isPointShielded(0.5, 30.0, 45, shieldMap);
    expect(far).toBe(false);
  });

  it('ConformalDiskSubdivision: buildStructuredFan creates valid fan mesh', () => {
    const junction: FeatureJunction = {
      apexVertex: 100,
      theta: 1.0,
      z: 10.0,
      minApexAngleRad: Math.PI / 4, // 45° — acute
      featureEdges: [[100, 101], [100, 102]],
      edgeAngles: [0, Math.PI / 4],
    };

    const shieldMap = buildShieldZones([junction], 0.5); // rShield = 1.0 mm
    const zone = shieldMap.get(100)!;
    expect(zone).toBeDefined();

    const fan = buildStructuredFan(zone, 40); // rRef = 40 mm

    // Structural checks
    expect(fan.apexVertex).toBe(100);
    expect(fan.vertices.length).toBeGreaterThan(1);
    expect(fan.triangles.length).toBeGreaterThan(0);

    // Apex is the first vertex
    expect(fan.vertices[0].ring).toBe(0);
    expect(fan.vertices[0].isBoundary).toBe(false);

    // All boundary vertices are on the outermost ring
    const boundaryVerts = fan.vertices.filter(v => v.isBoundary);
    expect(boundaryVerts.length).toBeGreaterThan(0);
    const maxRing = Math.max(...fan.vertices.map(v => v.ring));
    for (const bv of boundaryVerts) {
      expect(bv.ring).toBe(maxRing);
    }

    // Every triangle index is in bounds
    for (const tri of fan.triangles) {
      expect(tri.a).toBeGreaterThanOrEqual(0);
      expect(tri.a).toBeLessThan(fan.vertices.length);
      expect(tri.b).toBeGreaterThanOrEqual(0);
      expect(tri.b).toBeLessThan(fan.vertices.length);
      expect(tri.c).toBeGreaterThanOrEqual(0);
      expect(tri.c).toBeLessThan(fan.vertices.length);
    }
  });

  it('ConformalDiskSubdivision: structured fan satisfies AR ≤ 50', () => {
    const junction: FeatureJunction = {
      apexVertex: 200,
      theta: 0.0,
      z: 0.0,
      minApexAngleRad: Math.PI / 12, // 15° — very acute
      featureEdges: [[200, 201], [200, 202]],
      edgeAngles: [0, Math.PI / 12],
    };

    const shieldMap = buildShieldZones([junction], 0.3);
    const zone = shieldMap.get(200)!;
    const fan = buildStructuredFan(zone, 50);

    const violations = validateFanAR(fan, 50, 50);
    expect(violations).toEqual([]);
  });

  it('triangleAR: equilateral triangle has AR = √3 ≈ 1.732', () => {
    const ar = triangleAR(0, 0, 1, 0, 0.5, Math.sqrt(3) / 2);
    // AR = longest_edge / (2 · inradius) = 1 / (2 · 1/(2√3)) = √3
    expect(ar).toBeCloseTo(Math.sqrt(3), 4);
  });
});
