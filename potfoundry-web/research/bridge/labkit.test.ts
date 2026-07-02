// labkit.test.ts — fast, synthetic regression guard for the consolidated lab-kit helpers. No mesh build (runs in
// ms), so it is crash-proof and safe to keep ungated. Proves: manifold audit is non-vacuous (an injected 3rd
// triangle on a shared edge MUST move the count), binary STL header/size are correct, per-face chord sag is
// non-negative and shrinks under refinement, the heat ramp maps 0→green / large→red, and the barrel re-exports resolve.
import { describe, it, expect } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  auditNonManByIndex, perFaceChordSag, perFaceTrue3DSag, chordSagColor, vertErrColors, writeBinarySTL, dumpHeatmap,
  buildInhouseMetricMesh, featureLineChord3D, computeMeasuredGate, recoverAndLockEdges, perpendicular3DDeviation, projectPointToRadialSurface,
  bruteNearestOnRadialSurface, bruteAnchoredRedPerp, perFaceTrue3DSagAnchored,
  // these three were mis-routed in the barrel (caught by verification) — import them so the guard is non-vacuous:
  honestGate, lockedPredicate, crestBandTriangleQuality,
} from './labkit';

describe('labkit helpers', () => {
  it('auditNonManByIndex is non-vacuous (injected 3rd tri on a shared edge moves the count)', () => {
    // unit quad split into 2 tris sharing edge 0-2 → manifold.
    const xyz = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
    expect(auditNonManByIndex(xyz, [0, 1, 2, 0, 2, 3])).toBe(0);
    // add a 3rd triangle on the SAME edge 0-2 (with a new out-of-plane vertex) → edge shared by 3 → non-manifold.
    const xyz3 = [...xyz, 0.5, 0.5, 1];
    expect(auditNonManByIndex(xyz3, [0, 1, 2, 0, 2, 3, 0, 2, 4])).toBeGreaterThanOrEqual(1);
  });

  it('writeBinarySTL header + size are correct', () => {
    const p = join(tmpdir(), 'labkit_stl_test.stl');
    writeBinarySTL(p, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    const buf = readFileSync(p);
    expect(buf.length).toBe(84 + 50); // 80 header + 4 count + 1 tri × 50
    expect(buf.readUInt32LE(80)).toBe(1);
    rmSync(p, { force: true });
  });

  it('perFaceChordSag is non-negative and SHRINKS under refinement', () => {
    const rA = (th: number, _z: number): number => 40 + 5 * Math.cos(3 * th); // synthetic radial bump
    const H = 120;
    // one triangle spanning a WIDE u band (coarse) vs a NARROW band (fine), same t.
    const big = perFaceChordSag([0.0, 0.5, 0.2, 0.5, 0.1, 0.55], [0, 1, 2], rA, H);
    const small = perFaceChordSag([0.0, 0.5, 0.02, 0.5, 0.01, 0.505], [0, 1, 2], rA, H);
    expect(big.worstMm).toBeGreaterThan(0);
    expect(small.worstMm).toBeGreaterThanOrEqual(0);
    expect(big.worstMm).toBeGreaterThan(small.worstMm); // refinement reduces chord sag
    expect(Number.isFinite(big.worstMm)).toBe(true);
    expect(big.fracOver(0)).toBeGreaterThan(0);
  });

  it('perFaceTrue3DSag ≤ the same-(u,t) bound, projection finds a NEARER surface point, and shrinks under refinement', () => {
    const rA = (th: number, _z: number): number => 40 + 5 * Math.cos(3 * th); // synthetic radial bump (curved)
    const H = 120;
    const ut = [0.0, 0.5, 0.2, 0.5, 0.1, 0.55]; const idx = [0, 1, 2]; // one WIDE facet (bound ≫ preFilter → projects)
    // preFilterMm huge ⇒ never projects ⇒ returns the same-(u,t) full-3D distance (the guaranteed UPPER BOUND);
    // preFilterMm 0 ⇒ always projects ⇒ the true-3D nearest distance. Nearest must be ≤ the bound, and strictly less
    // where the surface curves (the nearest foot sits at a different (u,t) than the bary) — that's the whole point.
    const bound = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 1e9 });
    const projected = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0 });
    expect(projected.worstMm).toBeGreaterThan(0);
    expect(Number.isFinite(projected.worstMm)).toBe(true);
    expect(projected.worstMm).toBeLessThanOrEqual(bound.worstMm + 1e-9); // nearest ≤ any specific same-(u,t) point
    expect(projected.worstMm).toBeLessThan(bound.worstMm);                // projection genuinely finds a nearer point
    const small = perFaceTrue3DSag([0.0, 0.5, 0.02, 0.5, 0.01, 0.505], idx, rA, H, { preFilterMm: 0 });
    expect(projected.worstMm).toBeGreaterThan(small.worstMm);            // refinement reduces true-3D sag
    expect(projected.faceErr.length).toBe(1); expect(projected.vertErr.length).toBe(3);
  });

  it('bruteNearestOnRadialSurface: closed-form on a cylinder, ≡ GN on a smooth bump, ~0 on the surface', () => {
    const H = 120;
    // (a) cylinder r=40 → nearest foot is radial, dist = |ρ − 40|; P at ρ=50 ⇒ 10.
    const cyl = (): number => 40;
    expect(Math.abs(bruteNearestOnRadialSurface(50, 0, 60, cyl, H).dist - 10)).toBeLessThan(1e-3);
    // (b) smooth curved bump: single-seed GN already finds the unique foot ⇒ brute ≡ GN (the anchor is a NO-OP here).
    const bump = (th: number): number => 40 + 5 * Math.cos(3 * th);
    const gn = projectPointToRadialSurface(55, 3, 60, bump).dist;
    const br = bruteNearestOnRadialSurface(55, 3, 60, bump, H).dist;
    expect(br).toBeGreaterThan(0); expect(Number.isFinite(br)).toBe(true);
    expect(Math.abs(br - gn)).toBeLessThan(1e-2);
    // (c) a point ON the surface projects to ~0.
    const th0 = 0.7, r0 = bump(th0);
    expect(bruteNearestOnRadialSurface(r0 * Math.cos(th0), r0 * Math.sin(th0), 60, bump, H).dist).toBeLessThan(1e-2);
  });

  it('bruteAnchoredRedPerp: shape + smooth no-op (GN≡brute, gnOver 0) + empty-safe', () => {
    const bump = (th: number): number => 40 + 5 * Math.cos(3 * th); // smooth ⇒ no wrong-well ⇒ fix must be a no-op
    const H = 120;
    const ut = [0.0, 0.5, 0.2, 0.5, 0.1, 0.55], idx = [0, 1, 2]; // one wide, curved facet
    const r = bruteAnchoredRedPerp(ut, idx, bump, H, { redMm: 0.001, sampleN: 5, coarse: { nTheta: 512, nZ: 100 }, fine: { nTheta: 1024, nZ: 200 } });
    expect(r.nRed).toBe(1); expect(r.nSample).toBe(1);
    expect(r.gnP99).toBeGreaterThan(0);
    expect(r.trustedP99).toBeLessThanOrEqual(r.gnP99 + 1e-9); // the anchor only ever takes the SMALLER distance
    expect(Math.abs(r.trustedP99 - r.gnP99)).toBeLessThan(1e-2); // smooth ⇒ GN≡brute
    expect(r.gnOver).toBe(0);                                    // no wrong-well overstatement fabricated on a smooth surface
    expect(Number.isFinite(r.trustedMax)).toBe(true);
    // empty-safe: no red facets ⇒ all-zero result, no crash.
    const empty = bruteAnchoredRedPerp(ut, idx, bump, H, { redMm: 100 });
    expect(empty.nRed).toBe(0); expect(empty.nSample).toBe(0); expect(empty.trustedP99).toBe(0); expect(empty.gnP99).toBe(0);
  });

  it('perFaceTrue3DSagAnchored: no-op with no red facets, anchors + never worsens a red facet, drop-in shape', () => {
    const bump = (th: number): number => 40 + 5 * Math.cos(3 * th); // smooth curved ⇒ GN≡brute ⇒ anchor is a no-op
    const H = 120;
    const ut = [0.0, 0.5, 0.2, 0.5, 0.1, 0.55], idx = [0, 1, 2];
    const plain = perFaceTrue3DSag(ut, idx, bump, H, { preFilterMm: 0.02 });
    // no red facets (redMm huge) ⇒ byte-identical to perFaceTrue3DSag.
    const noop = perFaceTrue3DSagAnchored(ut, idx, bump, H, { preFilterMm: 0.02, redMm: 100 });
    expect(noop.faceErr[0]).toBeCloseTo(plain.faceErr[0], 10);
    expect(noop.faceErr.length).toBe(1); expect(noop.vertErr.length).toBe(3); expect(typeof noop.fracOver).toBe('function');
    // facet flagged red (redMm tiny) ⇒ it gets brute-anchored; the anchor can only LOWER a facet's error, and on a
    // smooth surface (GN≡brute) it lands ≈ the GN value (i.e. it does NOT over-colour).
    const anc = perFaceTrue3DSagAnchored(ut, idx, bump, H, { preFilterMm: 0.02, redMm: 0.001, topK: 5, coarse: { nTheta: 512, nZ: 100 }, fine: { nTheta: 1024, nZ: 200 } });
    expect(anc.faceErr[0]).toBeGreaterThan(0);
    expect(anc.faceErr[0]).toBeLessThanOrEqual(plain.faceErr[0] + 1e-9); // anchor never INCREASES a facet's error
    expect(Math.abs(anc.faceErr[0] - plain.faceErr[0])).toBeLessThan(1e-2); // smooth ⇒ ≈ GN
    expect(anc.worstMm).toBeGreaterThanOrEqual(anc.faceErr[0] - 1e-9);      // worstMm recomputed from corrected faceErr
  });

  it('dumpHeatmap anchorSteep: writes a true3d-anchored heatmap + coverage meta', () => {
    const bump = (th: number): number => 40 + 5 * Math.cos(3 * th);
    const H = 120, TAU = 2 * Math.PI;
    const ut = [0.0, 0.5, 0.2, 0.5, 0.1, 0.55], idx = [0, 1, 2];
    const xyz: number[] = [];
    for (let i = 0; i < 3; i++) { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = bump(th); xyz.push(r * Math.cos(th), r * Math.sin(th), z); }
    const dir = tmpdir(), name = 'labkit_anchor_heatmap_test';
    dumpHeatmap(dir, name, xyz, ut, idx, bump, H, { anchorSteep: { redMm: 0.001, topK: 5, coarse: { nTheta: 512, nZ: 100 }, fine: { nTheta: 1024, nZ: 200 } } });
    const meta = JSON.parse(readFileSync(join(dir, `${name}.meta.json`), 'utf8'));
    expect(meta.ruler).toBe('true3d-anchored');
    expect(meta.anchoredK).toBe(1); expect(meta.nRedTotal).toBe(1); // the one facet is red and gets anchored
    for (const ext of ['.xyz.bin', '.idx.bin', '.meta.json', '.col.bin']) rmSync(join(dir, `${name}${ext}`), { force: true });
  });

  it('chordSagColor maps 0→green and ≥scale→red; vertErrColors packs rgb', () => {
    const g = chordSagColor(0, 0.15); expect(g[1]).toBeGreaterThan(g[0]); expect(g[1]).toBeGreaterThan(g[2]); // green dominant
    const r = chordSagColor(0.3, 0.15); expect(r[0]).toBeGreaterThan(r[1]); // red dominant (clamped)
    const col = vertErrColors(Float64Array.from([0, 0.3]), 0.15);
    expect(col.length).toBe(6); expect(col[1]).toBeGreaterThan(col[0]); expect(col[3]).toBeGreaterThan(col[4]);
  });

  it('barrel re-exports resolve to callables (incl. the cross-module ones)', () => {
    // honestGate←honestMetrics, lockedPredicate←constraintRecovery, crestBandTriangleQuality←src/fidelity/metrics
    // are re-routed through the barrel — a mis-routed `export {x} from './wrong'` yields undefined here.
    for (const fn of [buildInhouseMetricMesh, featureLineChord3D, computeMeasuredGate, recoverAndLockEdges, perpendicular3DDeviation, projectPointToRadialSurface, perFaceTrue3DSag, perFaceTrue3DSagAnchored, dumpHeatmap, bruteNearestOnRadialSurface, bruteAnchoredRedPerp, honestGate, lockedPredicate, crestBandTriangleQuality]) {
      expect(typeof fn).toBe('function');
    }
  });
});
