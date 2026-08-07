/**
 * emitCertificate.test.ts — TWO-SIDED contract for the EMIT-TIME CERTIFICATE (S117 P1 part 2).
 *
 * WRITTEN BEFORE THE IMPLEMENTATION.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE LOAD-BEARING FACT THIS SUITE ENCODES
 *
 * The shipping emit closure (QuadtreeTriangulator.ts:627 and its FeatureConformingTriangulator mirror
 * at :1489) sees ONLY (u,t) PARAMETER coordinates and vertex indices. There are no 3D positions and no
 * analytic radius at that point in the pipeline — the lift to 3D happens two stages later
 * (WatertightAssembly `packedPosition`, theta = 2*pi*u). So `checkEmitInvariant`'s T3 (mm blade bar) and
 * T4 (orientation/position, which needs rA) are NOT COMPUTABLE THERE, and this suite does not pretend
 * they are. What IS computable, with zero extra emitter state, is T1 (degeneracy) and T2 (fold) — and
 * §BRIDGE below proves those two are the SAME QUANTITY as `checkEmitInvariant`'s, not an analogue.
 *
 * §BRIDGE  the exact-equality theorem: on the linear lift (theta = 2*pi*u, z = H*t, r = R constant),
 *          `checkEmitInvariantUV` with scaleU = 2*pi*R, scaleT = H reproduces `checkEmitInvariant`'s
 *          apS / qP / minAlt to f64 round-off. Same algebra, same constants, same normalisation.
 * §SIGN    the fold theorem on a REAL radial graph: for r = rA(theta,z) varying in BOTH arguments, the
 *          sign of the (u,t) area still equals the sign of the arc-space area, over a randomised
 *          sweep. This is what licenses the emit-site test to be called a fold test at all: the map
 *          (u,t) -> (theta,z) is diagonal with POSITIVE entries (2*pi, H), so it is orientation-
 *          preserving whatever rA does. rA enters only through rbar > 0, a positive scalar.
 * §NOPERT  the instrument does not perturb the mesh: flag ON vs flag OFF produce byte-identical
 *          vertices / indices / seamTriangles / triangleSource on both triangulators.
 * §GATE    the certificate refuses: with a planted violation and the gate flag on, the build throws.
 * §CLEAN   on a real shipping-shaped quadtree the emitter produces ZERO violations (a FLOOR assert —
 *          this suite fails if the predicate flags even one real triangle).
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  checkEmitInvariantUV, makeEmitUvVerdict, DEFENSIBLE_EMIT_UV,
} from './emitInvariant';
import { checkEmitInvariant, makeEmitVerdict } from './emitInvariant';
import {
  makeEmitCertificate, recordEmitUv, assertEmitCertificate, mergeEmitCertificate,
  getLastEmitCertificate, resetLastEmitCertificate,
  isEmitInvariantEnabled, isEmitInvariantGateEnabled,
  type EmitCertificate,
} from './emitCertificate';
import { triangulateQuadtree } from './QuadtreeTriangulator';
import { triangulateQuadtreeWithFeatures } from './FeatureConformingTriangulator';
import { PeriodicBalancedQuadtree } from './PeriodicBalancedQuadtree';
import { MetricSizingField } from './MetricSizingField';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import type { FeatureLine } from './FeatureLineGraph';

// ── flag plumbing (the tests own the globals; always restored) ────────────────────────────────────
interface Flags {
  __pfEmitInvariant?: boolean;
  __pfEmitInvariantGate?: boolean;
}
const G = globalThis as unknown as Flags;
function withFlags<T>(f: Flags, body: () => T): T {
  const a = G.__pfEmitInvariant;
  const b = G.__pfEmitInvariantGate;
  G.__pfEmitInvariant = f.__pfEmitInvariant;
  G.__pfEmitInvariantGate = f.__pfEmitInvariantGate;
  try {
    return body();
  } finally {
    G.__pfEmitInvariant = a;
    G.__pfEmitInvariantGate = b;
  }
}
afterEach(() => {
  G.__pfEmitInvariant = undefined;
  G.__pfEmitInvariantGate = undefined;
  resetLastEmitCertificate();
});

// ── a real quadtree, shaped like the shipping wall ────────────────────────────────────────────────
function buildTree(maxLevel = 6): PeriodicBalancedQuadtree {
  const sampler = new SyntheticCylinderSampler(40, 120, 4, 6);
  const field = new MetricSizingField(sampler, {
    maxSagMm: 0.05, minEdgeMm: 0.5, maxEdgeMm: 8, gradeRatio: 2, resU: 33, resT: 33,
  });
  return new PeriodicBalancedQuadtree(field, sampler, { maxLevel });
}

/** One vertical crease line, the shape `extractAnalyticFeatures` produces for a ribbed style. */
const CREASE: FeatureLine[] = [{
  kind: 'vertical-crease',
  label: 's117-emit-certificate-fixture',
  points: [{ u: 0.2, t: 0.05 }, { u: 0.2, t: 0.5 }, { u: 0.2, t: 0.95 }],
}];

function meshBytes(m: { vertices: Float32Array; indices: Uint32Array; seamTriangles: Uint8Array; triangleSource?: Uint8Array }): string {
  const parts = [
    Buffer.from(m.vertices.buffer, m.vertices.byteOffset, m.vertices.byteLength).toString('hex'),
    Buffer.from(m.indices.buffer, m.indices.byteOffset, m.indices.byteLength).toString('hex'),
    Buffer.from(m.seamTriangles.buffer, m.seamTriangles.byteOffset, m.seamTriangles.byteLength).toString('hex'),
    m.triangleSource
      ? Buffer.from(m.triangleSource.buffer, m.triangleSource.byteOffset, m.triangleSource.byteLength).toString('hex')
      : '-',
  ];
  return parts.join('|');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
describe('checkEmitInvariantUV — the zero-state core, stated in (u,t)', () => {
  const opts = { ...DEFENSIBLE_EMIT_UV };

  it('accepts the emitter own winding: SW -> SE -> NE is CCW in (u,t)', () => {
    const v = checkEmitInvariantUV(0.25, 0.25, 0.5, 0.25, 0.5, 0.5, opts);
    expect(v.ok).toBe(true);
    expect(v.reason).toBe('ok');
    expect(v.apUv).toBeGreaterThan(0);
  });

  it('REFUSES the reversed winding as a fold, not as a degeneracy', () => {
    const v = checkEmitInvariantUV(0.25, 0.25, 0.5, 0.5, 0.5, 0.25, opts);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('fold');
    expect(v.apUv).toBeLessThan(0);
  });

  it('REFUSES three collinear (u,t) points as degenerate', () => {
    const v = checkEmitInvariantUV(0.1, 0.1, 0.2, 0.2, 0.3, 0.3, opts);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('degenerate');
  });

  it('REFUSES a duplicated (u,t) vertex as degenerate', () => {
    const v = checkEmitInvariantUV(0.1, 0.1, 0.2, 0.2, 0.1, 0.1, opts);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('degenerate');
  });

  it('REFUSES a non-finite coordinate as degenerate', () => {
    const v = checkEmitInvariantUV(0.1, 0.1, Number.NaN, 0.2, 0.3, 0.4, opts);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('degenerate');
  });

  it('T1 shape floor is scale-FREE: shrinking a well-shaped triangle 1e6x keeps qUv', () => {
    const big = checkEmitInvariantUV(0, 0, 1, 0, 0.5, 0.866, opts);
    const tiny = checkEmitInvariantUV(0, 0, 1e-6, 0, 0.5e-6, 0.866e-6, opts);
    expect(tiny.ok).toBe(true);
    expect(tiny.qUv).toBeCloseTo(big.qUv, 9);
  });

  it('a SHAPE-degenerate needle is caught by T1, so T3 is not what catches needles', () => {
    // qUv = 4*sqrt(3)*ap/Lp^2 = 6.928*5e-10 ≈ 3.46e-9, far under tauQ=0.005. The SCALE-FREE
    // shape floor already refuses it — T3's absolute bar is NOT the term doing this work.
    const needle = checkEmitInvariantUV(0, 0, 1, 0, 0.5, 1e-9, opts);
    expect(needle.ok).toBe(false);
    expect(needle.reason).toBe('degenerate');
    expect(Math.abs(needle.qUv)).toBeLessThan(1e-6);
  });

  it('T3 is the ONLY term that can refuse a WELL-SHAPED but absolutely tiny triangle', () => {
    // An equilateral triangle scaled to 1e-9: qUv = 3 (the normalisation's equilateral value), so
    // it sails past T1 at any tauQ. Only an ABSOLUTE bar can refuse it — and the emit site has no
    // millimetre scale with which to set one, which is why DEFENSIBLE_EMIT_UV.minAltBar is 0.
    const S = 1e-9;
    const tiny: [number, number, number, number, number, number] =
      [0, 0, S, 0, 0.5 * S, (Math.sqrt(3) / 2) * S];
    const ungated = checkEmitInvariantUV(...tiny, opts);
    expect(ungated.ok).toBe(true);
    expect(ungated.qUv).toBeCloseTo(3, 6);
    expect(DEFENSIBLE_EMIT_UV.minAltBar).toBe(0);
    // Hand it a real mm scale AND a real bar and it DOES refuse — as `blade`, not `degenerate`.
    const gated = checkEmitInvariantUV(...tiny, {
      ...opts, scaleU: 2 * Math.PI * 40, scaleT: 120, minAltBar: 2e-3,
    });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toBe('blade');
    // ...and the SAME triangle at production size passes that same bar — so the bar is not vacuous.
    const big: [number, number, number, number, number, number] =
      [0, 0, 0.01, 0, 0.005, (Math.sqrt(3) / 2) * 0.01];
    const ok = checkEmitInvariantUV(...big, {
      ...opts, scaleU: 2 * Math.PI * 40, scaleT: 120, minAltBar: 2e-3,
    });
    expect(ok.ok).toBe(true);
  });

  it('allocation-free: the same scratch verdict is returned and fully rewritten', () => {
    const out = makeEmitUvVerdict();
    const a = checkEmitInvariantUV(0.25, 0.25, 0.5, 0.25, 0.5, 0.5, opts, out);
    expect(a).toBe(out);
    expect(a.reason).toBe('ok');
    const b = checkEmitInvariantUV(0.25, 0.25, 0.5, 0.5, 0.5, 0.25, opts, out);
    expect(b).toBe(out);
    expect(b.reason).toBe('fold');
    expect(b.apUv).toBeLessThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
describe('§BRIDGE — the UV core IS checkEmitInvariant T1/T2/T3, not an analogue', () => {
  const R = 40;
  const H = 120;
  const TWO_PI = Math.PI * 2;

  /** The exact linear lift the shipping assembly performs: theta = 2*pi*u, z = H*t, r = R. */
  function lift(u: number, t: number): { x: number; y: number; z: number; th: number } {
    const th = TWO_PI * u;
    return { x: R * Math.cos(th), y: R * Math.sin(th), z: H * t, th };
  }

  it('reproduces apS / qP / minAlt to f64 round-off on a cylinder', () => {
    const cases: [number, number, number, number, number, number][] = [
      [0.10, 0.10, 0.12, 0.10, 0.12, 0.13],
      [0.30, 0.40, 0.36, 0.41, 0.31, 0.55],
      [0.70, 0.05, 0.7002, 0.05, 0.7001, 0.0501],
      [0.01, 0.90, 0.02, 0.9000001, 0.015, 0.95],
    ];
    for (const [u0, t0, u1, t1, u2, t2] of cases) {
      const A = lift(u0, t0); const B = lift(u1, t1); const C = lift(u2, t2);
      // The arc-space form: rbar * theta. On a cylinder rbar == R exactly.
      const ref = checkEmitInvariant(
        A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z,
        A.th, B.th, C.th,
        { sigma: 1, tauQ: 0, minAltMm: 0 }, makeEmitVerdict(),
      );
      const uv = checkEmitInvariantUV(u0, t0, u1, t1, u2, t2, {
        sigma: 1, tauQ: 0, minAltBar: 0, scaleU: TWO_PI * R, scaleT: H,
      });
      expect(uv.apUv).toBeCloseTo(ref.apSMm2, 9);
      expect(uv.qUv).toBeCloseTo(ref.qP, 10);
      expect(uv.minAlt).toBeCloseTo(ref.minAltMm, 10);
      expect(uv.ok).toBe(ref.ok);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
describe('§SIGN — the fold theorem holds on a genuinely varying radial graph', () => {
  const H = 120;
  const TWO_PI = Math.PI * 2;
  /** A radial graph that varies in BOTH arguments — nothing like a cylinder. */
  const rA = (th: number, z: number): number =>
    38 + 9 * Math.cos(3 * th) + 5 * Math.sin(0.13 * z) + 2 * Math.cos(7 * th + 0.05 * z);

  it('sign(uv area) == sign(arc-space apS) over 4000 randomised triangles', () => {
    // Deterministic LCG — no test-run-to-run flake.
    let s = 12345;
    const rnd = (): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    let checked = 0;
    let mismatched = 0;
    let sawPositive = 0;
    let sawNegative = 0;
    const scratch = makeEmitVerdict();
    for (let i = 0; i < 4000; i++) {
      const u0 = rnd(); const t0 = rnd();
      const u1 = u0 + (rnd() - 0.5) * 0.2; const t1 = t0 + (rnd() - 0.5) * 0.2;
      const u2 = u0 + (rnd() - 0.5) * 0.2; const t2 = t0 + (rnd() - 0.5) * 0.2;
      const pt = (u: number, t: number): [number, number, number, number] => {
        const th = TWO_PI * u; const z = H * t; const r = rA(th, z);
        return [r * Math.cos(th), r * Math.sin(th), z, th];
      };
      const A = pt(u0, t0); const B = pt(u1, t1); const C = pt(u2, t2);
      const ref = checkEmitInvariant(
        A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], A[3], B[3], C[3],
        { sigma: 1, tauQ: 0, minAltMm: 0 }, scratch,
      );
      const uv = checkEmitInvariantUV(u0, t0, u1, t1, u2, t2, { sigma: 1, tauQ: 0, minAltBar: 0 });
      if (ref.apSMm2 === 0 || uv.apUv === 0) continue;
      checked++;
      if (ref.apSMm2 > 0) sawPositive++; else sawNegative++;
      if (Math.sign(ref.apSMm2) !== Math.sign(uv.apUv)) mismatched++;
    }
    expect(checked).toBeGreaterThan(3900);
    // FLOOR as well as ceiling: the sweep must actually exercise BOTH signs, or the
    // zero-mismatch result would be vacuous.
    expect(sawPositive).toBeGreaterThan(500);
    expect(sawNegative).toBeGreaterThan(500);
    expect(mismatched).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
describe('the certificate — counters, merge, refusal', () => {
  it('counts, accumulates UV area, and keeps the worst witness per term', () => {
    const cert = makeEmitCertificate();
    // 2 good, 1 fold, 1 degenerate.
    recordEmitUv(cert, 0.25, 0.25, 0.5, 0.25, 0.5, 0.5, 0);
    recordEmitUv(cert, 0.25, 0.25, 0.5, 0.25, 0.5, 0.75, 0);
    recordEmitUv(cert, 0.25, 0.25, 0.5, 0.5, 0.5, 0.25, 1);
    recordEmitUv(cert, 0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 1);
    expect(cert.checked).toBe(4);
    expect(cert.violations).toBe(2);
    expect(cert.byReason.fold).toBe(1);
    expect(cert.byReason.degenerate).toBe(1);
    expect(cert.byReason.blade).toBe(0);
    expect(cert.uvAreaTotal).toBeGreaterThan(0);
    expect(cert.uvAreaBad).toBeGreaterThan(0);
    expect(cert.uvAreaBad).toBeLessThan(cert.uvAreaTotal);
    // worst witnesses: the most-negative qUv (the deepest fold) and the smallest altitude.
    expect(cert.worstQUv).toBeLessThan(0);
    expect(cert.worstMinAlt).toBe(0);
    expect(cert.bySource[1]).toBe(2);
  });

  it('merges two certificates additively and keeps the worse witnesses', () => {
    const a = makeEmitCertificate();
    const b = makeEmitCertificate();
    recordEmitUv(a, 0.25, 0.25, 0.5, 0.25, 0.5, 0.5, 0);
    recordEmitUv(b, 0.25, 0.25, 0.5, 0.5, 0.5, 0.25, 3);
    mergeEmitCertificate(a, b);
    expect(a.checked).toBe(2);
    expect(a.violations).toBe(1);
    expect(a.byReason.fold).toBe(1);
    expect(a.bySource[3]).toBe(1);
    expect(a.worstQUv).toBeLessThan(0);
  });

  it('assertEmitCertificate PASSES a clean certificate and THROWS on one violation', () => {
    const clean = makeEmitCertificate();
    recordEmitUv(clean, 0.25, 0.25, 0.5, 0.25, 0.5, 0.5, 0);
    expect(() => assertEmitCertificate(clean)).not.toThrow();
    const dirty = makeEmitCertificate();
    recordEmitUv(dirty, 0.25, 0.25, 0.5, 0.5, 0.5, 0.25, 0);
    expect(() => assertEmitCertificate(dirty)).toThrow(/emit invariant/i);
    expect(() => assertEmitCertificate(dirty)).toThrow(/fold/);
  });

  it('the flag detectors are strict-true and default OFF', () => {
    expect(isEmitInvariantEnabled()).toBe(false);
    expect(isEmitInvariantGateEnabled()).toBe(false);
    withFlags({ __pfEmitInvariant: true }, () => {
      expect(isEmitInvariantEnabled()).toBe(true);
      expect(isEmitInvariantGateEnabled()).toBe(false);
    });
    withFlags({ __pfEmitInvariant: true, __pfEmitInvariantGate: true }, () => {
      expect(isEmitInvariantGateEnabled()).toBe(true);
    });
    // A truthy non-true value must NOT arm it.
    (G as unknown as { __pfEmitInvariant?: unknown }).__pfEmitInvariant = 1;
    expect(isEmitInvariantEnabled()).toBe(false);
    G.__pfEmitInvariant = undefined;
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
describe('§NOPERT — wiring the instrument does not perturb either triangulator', () => {
  it('triangulateQuadtree: flag ON is byte-identical to flag OFF', () => {
    const qt = buildTree();
    const off = withFlags({}, () => triangulateQuadtree(qt));
    const on = withFlags({ __pfEmitInvariant: true }, () => triangulateQuadtree(qt));
    expect(meshBytes(on)).toBe(meshBytes(off));
    expect(off.emitCertificate).toBeUndefined();
    expect(on.emitCertificate).toBeDefined();
  });

  it('triangulateQuadtreeWithFeatures: flag ON is byte-identical to flag OFF', () => {
    const qt = buildTree(5);
    const off = withFlags({}, () => triangulateQuadtreeWithFeatures(qt, CREASE, { cornerSnap: 0.001 }));
    const on = withFlags({ __pfEmitInvariant: true }, () => triangulateQuadtreeWithFeatures(qt, CREASE, { cornerSnap: 0.001 }));
    expect(meshBytes(on)).toBe(meshBytes(off));
    expect(off.emitCertificate).toBeUndefined();
    expect(on.emitCertificate).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
describe('§CLEAN — the real emitter produces ZERO violations (FLOOR assert)', () => {
  it('plain triangulateQuadtree: every emitted triangle passes, and the count is not vacuous', () => {
    const qt = buildTree();
    const mesh = withFlags({ __pfEmitInvariant: true }, () => triangulateQuadtree(qt));
    const cert = mesh.emitCertificate as EmitCertificate;
    // FLOOR: the instrument must actually have run on the whole mesh.
    expect(cert.checked).toBe(mesh.indices.length / 3);
    expect(cert.checked).toBeGreaterThan(1000);
    expect(cert.uvAreaTotal).toBeGreaterThan(0.5); // most of the unit square
    // CEILING: nothing refused.
    expect(cert.violations).toBe(0);
    expect(cert.uvAreaBad).toBe(0);
  });

  it('feature triangulateQuadtreeWithFeatures: every emitted triangle passes', () => {
    const qt = buildTree(5);
    const mesh = withFlags({ __pfEmitInvariant: true }, () =>
      triangulateQuadtreeWithFeatures(qt, CREASE, { cornerSnap: 0.001 }));
    const cert = mesh.emitCertificate as EmitCertificate;
    expect(cert.checked).toBeGreaterThan(1000);
    expect(cert.violations).toBe(0);
  });

  it('the worst-witness is NOT a constant: it tracks the tree depth (non-vacuity control)', () => {
    // A zero-violation verdict is only meaningful if the reported MAX witnesses are real
    // measurements. Refine the same surface harder and the smallest emitted (u,t) altitude MUST
    // shrink — roughly with the deepest cell. If it did not move, the witness would be a constant
    // and every "worst case" quoted from it would be worthless.
    const shallow = withFlags({ __pfEmitInvariant: true }, () => triangulateQuadtree(buildTree(4)));
    const deep = withFlags({ __pfEmitInvariant: true }, () => triangulateQuadtree(buildTree(7)));
    const aS = shallow.emitCertificate!.worstMinAlt;
    const aD = deep.emitCertificate!.worstMinAlt;
    expect(deep.indices.length).toBeGreaterThan(shallow.indices.length);
    expect(aD).toBeLessThan(aS);
    // ...and it is on the order of the deepest cell, not orders off it. maxLevel 4 -> 7 is 3 halvings.
    expect(aS / aD).toBeGreaterThan(2);
    expect(aS / aD).toBeLessThan(64);
  });

  it('the (u,t) area total is an EXACT unit-square cover — a free covering check', () => {
    // Every leaf of a periodic quadtree tiles [0,1)x[0,1] exactly once, and the templates partition
    // each leaf, so the summed |signed (u,t) area| must be 1 to f64 round-off. A gap OR an overlap
    // both move this number, so it is a two-sided covering control the certificate gets for free.
    const mesh = withFlags({ __pfEmitInvariant: true }, () => triangulateQuadtree(buildTree()));
    expect(mesh.emitCertificate!.uvAreaTotal).toBeCloseTo(1, 9);
  });

  it('the LAST_EMIT_CERTIFICATE accumulator sees the build the export path would gate on', () => {
    resetLastEmitCertificate();
    const qt = buildTree();
    withFlags({ __pfEmitInvariant: true }, () => triangulateQuadtree(qt));
    const last = getLastEmitCertificate();
    expect(last).toBeDefined();
    expect(last!.checked).toBeGreaterThan(1000);
    expect(last!.violations).toBe(0);
    expect(last!.builds).toBe(1);
    // A second build accumulates rather than replacing — an export builds several walls.
    withFlags({ __pfEmitInvariant: true }, () => triangulateQuadtree(qt));
    expect(getLastEmitCertificate()!.builds).toBe(2);
    expect(getLastEmitCertificate()!.checked).toBeGreaterThan(2000);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
describe('§GATE — a mesh with one violation is refused', () => {
  it('the gate throws when a violation is recorded and the gate flag is on', () => {
    withFlags({ __pfEmitInvariant: true, __pfEmitInvariantGate: true }, () => {
      const cert = makeEmitCertificate();
      recordEmitUv(cert, 0.25, 0.25, 0.5, 0.5, 0.5, 0.25, 0);
      expect(() => assertEmitCertificate(cert)).toThrow(/emit invariant/i);
    });
  });

  it('the gate does NOT throw on the real clean build', () => {
    const qt = buildTree();
    expect(() =>
      withFlags({ __pfEmitInvariant: true, __pfEmitInvariantGate: true }, () =>
        triangulateQuadtree(qt))).not.toThrow();
  });

  it('the gate is inert when the telemetry flag is OFF (it cannot fire on an unmeasured build)', () => {
    const qt = buildTree();
    const m = withFlags({ __pfEmitInvariantGate: true }, () => triangulateQuadtree(qt));
    expect(m.emitCertificate).toBeUndefined();
  });
});
