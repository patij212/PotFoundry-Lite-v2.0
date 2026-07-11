// tierc_gatesHarness.test.ts — TDD for the PROD-TIERC Phase-1 composite gates harness (build items
// 1-2, research/lab/E-2026-07-11-TIERC-HEADTOHEAD-prereg.md; spec: research/lab/tierc/gates-harness-spec.md
// §3). Exercises `scoreAllGates` against SMALL SYNTHETIC analytic surfaces only — a coarse open CONE
// shell — never production bins, so this suite is fast and runnable in the default loop.
//
// Why a cone: rA(theta,z) = R0 + (R1-R0)*(z/H) is THETA-INDEPENDENT and LINEAR in z, so a uniform
// (theta,z) grid mesh lies EXACTLY on the analytic surface along both z (linear -> zero z-chord-sag
// at any nZ) and, in the limit of fine-enough nTheta, along theta too. nTheta must still be fine
// enough that the FLAT-FACET chord sag of the circular cross-section (r*(1-cos(pi/nTheta))) stays well
// under tolMm=0.01 -- a coarse polygon approximating a circle has REAL, correct sag, and the ruler is
// right to flag it. nTheta=96 at r<=0.8mm gives sag ~0.00043mm (~23x margin), verified empirically
// below by the first test's maxMm assertion.
//
// Every scoreAllGates call passes FAST overrides (g2Lattice, g1Brute) that only change SAMPLE DENSITY,
// never the algorithm (mirrors scoreWholeMeshInterior's own `stride` parameter) -- see the doc-comments
// on ScoreAllGatesOpts.g2Lattice / g1Brute in tierc_gatesHarness.ts. Without these the suite is still
// CORRECT but multiple orders of magnitude slower (measured during development: a first pass omitting
// g1Brute took 527s total after a geometry bug made every facet a brute-confirm candidate).
//
// DEV-ONLY. research/ never imported by src/. Run via the dedicated config (no shared "all
// research/bridge tests" config exists in this repo — see vitest.tierc_gates.config.ts header):
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_gates.config.ts research/bridge/tierc_gatesHarness.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  scoreAllGates, zeroAreaCount, needleCount,
  type BinMesh, type StyleTruth,
} from './tierc_gatesHarness';

const TAU = Math.PI * 2;

// ─────────────────────────── synthetic analytic surface: a coarse open CONE shell ───────────────────────────
const H = 10, R0 = 0.5, R1 = 0.8;
function coneR(_theta: number, z: number): number {
  const zc = Math.min(H, Math.max(0, z));
  return R0 + (R1 - R0) * (zc / H);
}
const TRUTH: StyleTruth = { styleId: 'SyntheticCone', rA: coneR, H };

// Standard test-mesh resolution: fine enough in theta that flat-facet chord sag (~0.00043mm at
// R1=0.8) sits ~23x below tolMm=0.01 (verified by the first test below), coarse enough that prescreen
// + quality + G3/G4 all stay sub-millisecond on this facet count (96*7*2 = 1344 triangles).
const N_THETA = 96, N_Z = 8;

// FAST overrides for every scoreAllGates call: change only sample density (see the doc-comments in
// tierc_gatesHarness.ts), never which facets get flagged as outliers. Omitted only by the one test
// that specifically verifies the production DEFAULT G2 lattice resolution.
const FAST_G2 = { nu: 8, nt: 8 };
const FAST_G1_BRUTE = { nTheta: 32, nZ: 8 };
const FAST = { g2Lattice: FAST_G2, g1Brute: FAST_G1_BRUTE };

/** nTheta x nZ periodic-in-theta, open-in-z grid mesh, vertices placed EXACTLY on coneR. */
function buildCone(nTheta: number, nZ: number): BinMesh {
  const xyz = new Float32Array(nTheta * nZ * 3);
  for (let j = 0; j < nZ; j++) {
    const z = (H * j) / (nZ - 1);
    const r = coneR(0, z);
    for (let i = 0; i < nTheta; i++) {
      const th = (TAU * i) / nTheta;
      const o = (j * nTheta + i) * 3;
      xyz[o] = r * Math.cos(th);
      xyz[o + 1] = r * Math.sin(th);
      xyz[o + 2] = z;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j + 1 < nZ; j++) {
    for (let i = 0; i < nTheta; i++) {
      const a = j * nTheta + i, b = j * nTheta + ((i + 1) % nTheta);
      const c = (j + 1) * nTheta + i, d = (j + 1) * nTheta + ((i + 1) % nTheta);
      idx.push(a, b, d, a, d, c);
    }
  }
  return { xyz, idx: Uint32Array.from(idx) };
}

function cloneBin(m: BinMesh): BinMesh {
  return { xyz: m.xyz.slice(), idx: m.idx.slice() };
}

/** Appends one triangle (3 new vertices) to a BinMesh — for injecting defects in isolation. */
function appendTriangle(
  m: BinMesh,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
): BinMesh {
  const baseV = m.xyz.length / 3;
  const xyz = new Float32Array(m.xyz.length + 9);
  xyz.set(m.xyz);
  xyz.set([...a, ...b, ...c], m.xyz.length);
  const idx = new Uint32Array(m.idx.length + 3);
  idx.set(m.idx);
  idx.set([baseV, baseV + 1, baseV + 2], m.idx.length);
  return { xyz, idx };
}

/** Displaces one vertex radially outward by dMm (in place on a caller-owned clone). */
function displaceRadially(m: BinMesh, vertexIndex: number, dMm: number): void {
  const x = m.xyz[vertexIndex * 3], y = m.xyz[vertexIndex * 3 + 1];
  const r = Math.hypot(x, y);
  const scale = (r + dMm) / r;
  m.xyz[vertexIndex * 3] *= scale;
  m.xyz[vertexIndex * 3 + 1] *= scale;
}

describe('tierc_gatesHarness — scoreAllGates', () => {
  it('scores a clean synthetic cone with zero G1 outliers and the expected row shape', () => {
    const mesh = buildCone(N_THETA, N_Z);
    const row = scoreAllGates({ full: mesh, outer: mesh }, TRUTH, undefined, FAST);

    expect(row.style).toBe('SyntheticCone');
    expect(row.tolMm).toBe(0.01);
    expect(row.shard).toBe(0);
    expect(row.nShards).toBe(1);
    expect(row.merged).toBe(false);
    expect(row.dims).toEqual({ H, Rb: null, Rt: null, expn: null });

    expect(row.g1_forward.nFacets).toBe(mesh.idx.length / 3);
    expect(row.g1_forward.outliers).toBe(0);
    expect(row.g1_forward.maxMm).toBeLessThan(2e-3); // flat-facet chord sag floor (~0.00043mm), far below tol
    expect(row.g1_forward.newtonWorstMm).toBeNull();
    expect(row.g1_forward.rulerPremiseOk).toBe(true);
    expect(row.g1_forward.basis).toBe(
      'prescreen45(dense-radial-upperBound) -> scoreWholeMeshInterior(GNscreen+bruteConfirm-if-gn>5x) -> newtonNearest(worstPointOnly)',
    );
  });

  // ── (a) non-manifold non-vacuity ────────────────────────────────────────────────────────────────
  it('(a) internal non-manifold control: injecting a 3rd triangle on a shared edge moves nonManRaw', () => {
    const mesh = buildCone(N_THETA, N_Z);
    const row = scoreAllGates({ full: mesh, outer: mesh }, TRUTH, undefined, FAST);
    // The internal control (mirrors _prod_truth.test.ts's non-vacuity check) must have actually fired
    // and observed the injected duplicate triangle moving the count — else the audit is vacuous.
    expect(row.g3_watertight.nonManControlMoved).toBe(true);
    expect(row.g3_watertight.nonManRaw).toBe(0); // the clean cone itself has no >2-shared edges
  });

  it('(a2) an already-cracked input mesh reads nonManRaw > 0 (external correctness, not just the internal control)', () => {
    const mesh = buildCone(N_THETA, N_Z);
    const cracked = cloneBin(mesh);
    const extra = new Uint32Array(cracked.idx.length + 3);
    extra.set(cracked.idx);
    extra.set([cracked.idx[0], cracked.idx[1], cracked.idx[2]], cracked.idx.length);
    const crackedFull: BinMesh = { xyz: cracked.xyz, idx: extra };
    const row = scoreAllGates({ full: crackedFull, outer: mesh }, TRUTH, undefined, FAST);
    expect(row.g3_watertight.nonManRaw).toBeGreaterThan(0);
  });

  // ── (b) zero-area at the 1e-12 floor, not at 1e-8 ───────────────────────────────────────────────
  it('(b) zeroAreaCount counts an exact-zero-area triangle at the 1e-12 floor but NOT a 1e-8-area triangle', () => {
    const mesh = buildCone(8, 4); // pure function test — no scoreAllGates call, mesh size irrelevant
    const baseline = zeroAreaCount(mesh.xyz, mesh.idx);

    // Exactly zero area: a repeated vertex position (collinear degenerate).
    const withZero = appendTriangle(mesh, [0, 0, 100], [1, 0, 100], [0, 0, 100]);
    expect(zeroAreaCount(withZero.xyz, withZero.idx)).toBe(baseline + 1);

    // ~1e-8 mm^2 area (legs sqrt(2e-8) each, right triangle: area = 0.5*leg^2 = 1e-8) — above the floor.
    const leg = Math.sqrt(2e-8);
    const withTiny = appendTriangle(mesh, [0, 0, 200], [leg, 0, 200], [0, leg, 200]);
    expect(zeroAreaCount(withTiny.xyz, withTiny.idx)).toBe(baseline);

    // Sanity: the default floor is 1e-12, matching the mission's canonical value.
    expect(zeroAreaCount(withZero.xyz, withZero.idx, 1e-12)).toBe(baseline + 1);
  });

  // ── (c) displaced vertex → G1 outlier ──────────────────────────────────────────────────────────
  it('(c) a vertex displaced 0.3mm off the analytic surface produces a G1 outlier and the row records it', () => {
    const clean = buildCone(N_THETA, N_Z);
    const displaced = cloneBin(clean);
    // Interior row (not the top/bottom boundary ring) so the defect sits inside real interior facets.
    const v = 4 * N_THETA + 10;
    displaceRadially(displaced, v, 0.3); // 30x tolMm — unambiguous, proportional to the ~0.8mm radius

    const cleanRow = scoreAllGates({ full: clean, outer: clean }, TRUTH, undefined, FAST);
    const dirtyRow = scoreAllGates({ full: displaced, outer: displaced }, TRUTH, undefined, FAST);

    expect(cleanRow.g1_forward.outliers).toBe(0);
    expect(dirtyRow.g1_forward.outliers).toBeGreaterThan(0);
    expect(dirtyRow.g1_forward.maxMm).toBeGreaterThan(0.01);
    expect(dirtyRow.g1_forward.newtonWorstMm).not.toBeNull();
    expect(dirtyRow.g1_forward.newtonWorstMm as number).toBeGreaterThan(0.01);
    // vertexOnSurf's rulerPremiseOk is a p99-over-ALL-vertices statistic (~768 here) — by design it is
    // ROBUST to a single sparse-outlier vertex (p99 index sits well below the single worst entry once
    // n is a few hundred+), so it correctly stays true here; the FACET-level outliers count above is
    // the sensitive instrument for a localized defect like this one, not the whole-mesh premise check.
    expect(dirtyRow.g1_forward.rulerPremiseOk).toBe(true);
  });

  // ── (d) locator self-check ─────────────────────────────────────────────────────────────────────
  it('(d) G2 locator self-check passes < 1e-9 on the synthetic reference', () => {
    const mesh = buildCone(N_THETA, N_Z);
    const row = scoreAllGates({ full: mesh, outer: mesh }, TRUTH, undefined, {
      g2Lattice: { nu: 16, nt: 16 }, g1Brute: FAST_G1_BRUTE,
    });
    expect(row.g2_reverse.locatorSelfCheckMaxMm).not.toBeNull();
    expect(row.g2_reverse.locatorSelfCheckMaxMm as number).toBeLessThan(1e-9);
  });

  // ── (e) needleCount = sliverCount - degenerateCount ────────────────────────────────────────────
  it('(e) needleCount excludes a genuine degenerate triangle and counts only the finite-area needle', () => {
    const clean = buildCone(N_THETA, N_Z); // baseline: regular grid, expect 0 slivers / 0 degenerates
    let dirty = appendTriangle(clean, [0, 0, 300], [0, 0, 300], [1, 0, 300]); // degenerate: repeated position
    dirty = appendTriangle(dirty, [0, 0, 400], [100, 0, 400], [100, 0.0001, 400]); // needle: finite area, huge aspect

    // Isolate the quality gate from G1/G2 by keeping `outer` clean — full carries the debris.
    const row = scoreAllGates({ full: dirty, outer: clean }, TRUTH, undefined, FAST);

    expect(row.quality.degenerateCount).toBe(1);
    expect(row.quality.sliverCount).toBe(2); // the degenerate triangle AND the needle both count as slivers
    expect(row.quality.needleCount).toBe(1); // but needleCount excludes the genuine defect
    expect(row.quality.needleCount).toBe(row.quality.sliverCount - row.quality.degenerateCount);
  });

  it('needleCount() computes the sliverCount - degenerateCount identity directly', () => {
    expect(needleCount({ sliverCount: 5, degenerateCount: 2, maxAspect3D: 0, minAngleDeg: 0 })).toBe(3);
    expect(needleCount({ sliverCount: 0, degenerateCount: 0, maxAspect3D: 0, minAngleDeg: 0 })).toBe(0);
  });

  // ── (f) OPEN fields serialize as null/"OPEN", never fabricated ────────────────────────────────
  it('(f) g5/g7 OPEN fields serialize as null or "OPEN" literal, never 0/false', () => {
    const mesh = buildCone(N_THETA, N_Z);
    const row = scoreAllGates({ full: mesh, outer: mesh }, TRUTH, undefined, FAST);
    const parsed = JSON.parse(JSON.stringify(row));

    expect(parsed.g5_bridging.verdict).toBe('OPEN');
    expect(parsed.g5_bridging.detectorRecall).toBeNull();
    expect(parsed.g5_bridging.detectorPrecision).toBeNull();
    expect(parsed.g5_bridging.residualCrossings).toBeNull();
    expect(parsed.g5_bridging.constraintRecoveryFailed).toBeNull();

    expect(parsed.g7_assembly.seamSpecificCheck).toBe('OPEN');
    expect(parsed.g7_assembly.rimCheck).toBe('OPEN');
    expect(parsed.g7_assembly.baseCheck).toBe('OPEN');
    expect(parsed.g7_assembly.capCheck).toBe('OPEN');
    expect(parsed.g7_assembly.innerOuterStitchCheck).toBe('OPEN');
    expect(parsed.g7_assembly.outerWallSeamTriangleCount).toBeNull(); // no seamTriangles data supplied
    expect(parsed.g7_assembly.wholeMeshBoundaryEdges).not.toBeNull(); // this one IS computed (shard0)

    expect(parsed.g6_budget.generateMs).toBeNull();
    expect(parsed.g6_budget.assembleWatertightMs).toBeNull();
    expect(parsed.g6_budget.peakMemoryMB).toBeNull();

    // None of the above ever silently defaults to a fabricated pass.
    expect(parsed.g5_bridging.verdict).not.toBe(0);
    expect(parsed.g5_bridging.verdict).not.toBe(false);
  });

  it('(f2) shard-0-only gates are null on a non-owning shard row, but config fields stay populated', () => {
    const mesh = buildCone(N_THETA, N_Z);
    const shardRow = scoreAllGates({ full: mesh, outer: mesh }, TRUTH, undefined, {
      ...FAST, shard: 1, nShards: 2,
    });
    const parsed = JSON.parse(JSON.stringify(shardRow));

    expect(parsed.g2_reverse.maxMm).toBeNull();
    expect(parsed.g2_reverse.locatorSelfCheckMaxMm).toBeNull();
    expect(parsed.g3_watertight.nonManRaw).toBeNull();
    expect(parsed.g3_watertight.nonManControlMoved).toBeNull();
    expect(parsed.g4_zeroDefect.zeroAreaCount).toBeNull();
    expect(parsed.g4_zeroDefect.degenerateCount).toBeNull();
    expect(parsed.g1_forward.vertexOnSurfP99Mm).toBeNull();
    expect(parsed.g1_forward.rulerPremiseOk).toBeNull();
    expect(parsed.g7_assembly.wholeMeshBoundaryEdges).toBeNull();

    // Config/parameter fields are always stated, regardless of which shard computed the row.
    expect(parsed.g3_watertight.weldToleranceMm).toBe(0.0001);
    expect(parsed.g4_zeroDefect.areaFloorMm2).toBe(1e-12);
    expect(parsed.shard).toBe(1);
    expect(parsed.nShards).toBe(2);
  });

  // ── (g) shard partition unions to the unsharded result ─────────────────────────────────────────
  it('(g) a 2-shard run sums outliers and maxes maxMm to the same result as an unsharded run', () => {
    const clean = buildCone(N_THETA, N_Z);
    const dirty = cloneBin(clean);
    // Displace a LOCALIZED arc (16 consecutive columns, not the whole ring — keeps the affected-facet
    // count bounded regardless of N_THETA) spanning both shard parities.
    const j = 4;
    for (let i = 40; i < 56; i++) displaceRadially(dirty, j * N_THETA + i, 0.3);

    const common = { full: dirty, outer: dirty };
    const unsharded = scoreAllGates(common, TRUTH, undefined, FAST);
    const s0 = scoreAllGates(common, TRUTH, undefined, { ...FAST, shard: 0, nShards: 2 });
    const s1 = scoreAllGates(common, TRUTH, undefined, { ...FAST, shard: 1, nShards: 2 });

    // Sanity: the displacement actually produced outliers (else the union check below is vacuous).
    expect(unsharded.g1_forward.outliers).toBeGreaterThan(0);

    expect(s0.g1_forward.outliers + s1.g1_forward.outliers).toBe(unsharded.g1_forward.outliers);
    expect(Math.max(s0.g1_forward.maxMm, s1.g1_forward.maxMm)).toBeCloseTo(unsharded.g1_forward.maxMm, 6);
    // The two shards must not both silently score everything (a real partition, not a no-op).
    expect(s0.g1_forward.outliers).toBeLessThanOrEqual(unsharded.g1_forward.outliers);
    expect(s1.g1_forward.outliers).toBeLessThanOrEqual(unsharded.g1_forward.outliers);
  });

  it('(g2) quality is also sharded by facet index on the full mesh (sliver counts sum across shards)', () => {
    let mesh = buildCone(N_THETA, N_Z);
    mesh = appendTriangle(mesh, [0, 0, 400], [100, 0, 400], [100, 0.0001, 400]); // 1 needle
    mesh = appendTriangle(mesh, [0, 0, 500], [200, 0, 500], [200, 0.0002, 500]); // 1 more needle
    const common = { full: mesh, outer: mesh };
    const unsharded = scoreAllGates(common, TRUTH, undefined, FAST);
    const s0 = scoreAllGates(common, TRUTH, undefined, { ...FAST, shard: 0, nShards: 2 });
    const s1 = scoreAllGates(common, TRUTH, undefined, { ...FAST, shard: 1, nShards: 2 });
    expect(s0.quality.sliverCount + s1.quality.sliverCount).toBe(unsharded.quality.sliverCount);
    expect(s0.quality.degenerateCount + s1.quality.degenerateCount).toBe(unsharded.quality.degenerateCount);
  });

  // ── breadcrumbs (PF_PT_BREADCRUMB pattern) ─────────────────────────────────────────────────────
  it('writes stage-boundary breadcrumb rows when breadcrumbPath is set (env-gated pattern)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tierc-gates-crumb-'));
    const crumbPath = join(dir, 'crumbs.ndjson');
    try {
      const mesh = buildCone(N_THETA, N_Z);
      scoreAllGates({ full: mesh, outer: mesh }, TRUTH, undefined, { ...FAST, breadcrumbPath: crumbPath });
      const lines = readFileSync(crumbPath, 'utf8').trim().split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      const first = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(first).toHaveProperty('stage');
      expect(first).toHaveProperty('pid');
      expect(first.style).toBe('SyntheticCone');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes nothing when breadcrumbPath is unset (default: zero behavior change)', () => {
    const mesh = buildCone(N_THETA, N_Z);
    // Must not throw / must not require a path to exist.
    expect(() => scoreAllGates({ full: mesh, outer: mesh }, TRUTH, undefined, FAST)).not.toThrow();
  });

  // ── default G2 lattice matches the proven 1024x1024 composition when not overridden ───────────
  // g2_reverse.basis is built from the NU/NT default BEFORE the shard-0-only expensive branch runs
  // (see tierc_gatesHarness.ts), so scoring on a non-zero shard verifies the exact same default-value
  // wiring without paying for the real 1,048,576-query scan — the actual full-resolution scan (shard 0,
  // no override) is exercised by every other test's use of FAST_G2, just at a cheap density; this test
  // is only about which resolution the code reaches for by default, not about running it at full size.
  it('defaults the G2 lattice to 1024x1024 (the proven composition) when no override is given', () => {
    const mesh = buildCone(N_THETA, N_Z);
    const row = scoreAllGates({ full: mesh, outer: mesh }, TRUTH, undefined, {
      g1Brute: FAST_G1_BRUTE, shard: 1, nShards: 2,
    });
    expect(row.g2_reverse.basis).toBe('lattice1024x1024 + 4x-local-refine, boundaryBands(0.5mm)-separated');
  });

  // ── opt-in ndjson output (pure by default; file IO only when opts.outputPath is given) ─────────
  it('appends the row to opts.outputPath when provided, and the ndjson round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tierc-gates-out-'));
    const outPath = join(dir, 'gates.ndjson');
    try {
      const mesh = buildCone(N_THETA, N_Z);
      const row = scoreAllGates({ full: mesh, outer: mesh }, TRUTH, undefined, { ...FAST, outputPath: outPath });
      const saved = JSON.parse(readFileSync(outPath, 'utf8').trim());
      expect(saved.style).toBe(row.style);
      expect(saved.totalMs).toBe(row.totalMs);
      expect(saved.g1_forward.outliers).toBe(row.g1_forward.outliers);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ── manifest wiring (degrades gracefully when undefined; honored when supplied) ────────────────
  it('marks truthBridge UNCLASSIFIED (ok:null) with manifestRow undefined — never trusted-by-default', () => {
    const mesh = buildCone(N_THETA, N_Z);
    const row = scoreAllGates({ full: mesh, outer: mesh }, TRUTH, undefined, FAST);
    expect(row.g6_budget.policyMaxTris).toBe(10_000_000);
    expect(row.truthBridge.ok).toBeNull();
    expect(row.truthBridge.note).toContain('UNCLASSIFIED');
  });

  it('honors a supplied manifestRow budget + bridgeClass (KNOWN-BROKEN false, hash-int and exact true)', () => {
    const mesh = buildCone(N_THETA, N_Z);
    const row = scoreAllGates({ full: mesh, outer: mesh }, TRUTH, {
      styleId: 'SyntheticCone',
      truth: { rA: coneR, bridgeClass: 'KNOWN-BROKEN' },
      budget: { maxOuterTris: 123, maxFullTris: 456 },
    }, FAST);
    expect(row.g6_budget.policyMaxTris).toBe(456);
    expect(row.truthBridge.ok).toBe(false);
    expect(row.truthBridge.note).toBe('KNOWN-BROKEN');

    const rowHash = scoreAllGates({ full: mesh, outer: mesh }, TRUTH, {
      styleId: 'SyntheticCone',
      truth: { rA: coneR, bridgeClass: 'hash-int' },
      budget: { maxOuterTris: 123, maxFullTris: 456 },
    }, FAST);
    expect(rowHash.truthBridge.ok).toBe(true);
    expect(rowHash.truthBridge.note).toContain('hash-int');

    const rowExact = scoreAllGates({ full: mesh, outer: mesh }, TRUTH, {
      styleId: 'SyntheticCone',
      truth: { rA: coneR, bridgeClass: 'exact' },
      budget: { maxOuterTris: 123, maxFullTris: 456 },
    }, FAST);
    expect(rowExact.truthBridge).toEqual({ ok: true, note: null });
  });
});
