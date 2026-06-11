/**
 * Unit suite for the quality-bounded conforming decimator.
 *
 * EXPLICIT NON-EVIDENCE NOTE: a WASM-less green run is NOT evidence the
 * decimator fix works — the real-WASM tests below self-skip (with a warning)
 * when meshoptimizer is unavailable, and the mock-level tests only pin the
 * call CONTRACT (ErrorAbsolute + absolute-mm + stride=3). Only the WebGPU e2e
 * budget probe (`e2e/_conforming_budget_probe.cjs`, committed as
 * `e2e/baselines/budget-honesty-2026-06.json`) proves the shape/topology gate
 * on real conforming meshes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { MeshData } from '../../../../geometry/types';
import { validateMeshForExport } from '../../../../geometry/exportValidation';
import { topologyMetric, triangleQuality3D } from '../../../../fidelity/metrics';
import { WELD_TOL_MM } from '../../../../fidelity/types';
import { decimateConforming, isConformingDecimationAvailable } from './decimateConforming';

/**
 * Build a closed, outward-oriented icosphere (subdivided icosahedron).
 *
 * Unlike a UV-sphere, an icosphere is a true welded 2-manifold: no duplicate
 * seam vertices, no pole-collapse degenerate triangles. Every interior edge is
 * shared by exactly two triangles, winding is consistent, signed volume is
 * positive — a clean synthetic stand-in for the conforming pot mesh that
 * `decimateConforming` must shrink without breaking watertightness. Each
 * subdivision level quadruples the triangle count (20·4^level), so the test can
 * make it deliberately over-budget. Default radius 50mm keeps the fixture at
 * pot scale so absolute-mm error thresholds exercise representative regimes.
 */
function buildIcosphere(subdivisions: number, radius = 50): MeshData {
  type V = [number, number, number];
  const t = (1 + Math.sqrt(5)) / 2;
  const baseVerts: V[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const verts: V[] = baseVerts.map((v) => [...v] as V);
  const midCache = new Map<string, number>();
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const cached = midCache.get(key);
    if (cached !== undefined) return cached;
    const va = verts[a];
    const vb = verts[b];
    const mid: V = [
      (va[0] + vb[0]) / 2,
      (va[1] + vb[1]) / 2,
      (va[2] + vb[2]) / 2,
    ];
    const idx = verts.length;
    verts.push(mid);
    midCache.set(key, idx);
    return idx;
  };
  for (let s = 0; s < subdivisions; s++) {
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      // Keep the parent winding so orientation stays outward-consistent.
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  // Project onto the sphere of the requested radius (positive signed volume).
  const vertices = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    const [x, y, z] = verts[i];
    const len = Math.hypot(x, y, z) || 1;
    vertices[i * 3] = (x / len) * radius;
    vertices[i * 3 + 1] = (y / len) * radius;
    vertices[i * 3 + 2] = (z / len) * radius;
  }
  const indices = new Uint32Array(faces.length * 3);
  for (let i = 0; i < faces.length; i++) {
    indices[i * 3] = faces[i][0];
    indices[i * 3 + 1] = faces[i][1];
    indices[i * 3 + 2] = faces[i][2];
  }
  return {
    vertices,
    indices,
    vertexCount: verts.length,
    triangleCount: faces.length,
  };
}

/** Anisotropic fixture: stretch a mesh along z (collapse-prone long triangles). */
function stretchZ(mesh: MeshData, factor: number): MeshData {
  const vertices = mesh.vertices.slice();
  for (let i = 0; i < mesh.vertexCount; i++) {
    vertices[i * 3 + 2] *= factor;
  }
  return { ...mesh, vertices, indices: mesh.indices.slice() };
}

/**
 * Defective fixture: pull one vertex to ~1e-3 mm of a neighbour so its incident
 * triangles become genuine slivers (aspect ≫ 100) WITHOUT welding (the gap stays
 * above WELD_TOL_MM=1e-4, so topology metrics still read the clean manifold).
 */
function withPreexistingSliver(mesh: MeshData): MeshData {
  const vertices = mesh.vertices.slice();
  const a = mesh.indices[0];
  const b = mesh.indices[1];
  for (let k = 0; k < 3; k++) {
    const target = vertices[b * 3 + k];
    const from = vertices[a * 3 + k];
    vertices[a * 3 + k] = target + (from - target) * 1e-4;
  }
  return { ...mesh, vertices, indices: mesh.indices.slice() };
}

/** Set of "x|y|z" position keys for exact-subset assertions. */
function positionKeySet(vertices: Float32Array, vertexCount: number): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < vertexCount; i++) {
    set.add(`${vertices[i * 3]}|${vertices[i * 3 + 1]}|${vertices[i * 3 + 2]}`);
  }
  return set;
}

async function wasmOrSkip(label: string): Promise<boolean> {
  if (await isConformingDecimationAvailable()) return true;
  console.warn(`[decimateConforming.test] meshoptimizer unavailable — skipping ${label} (NOT fix evidence)`);
  return false;
}

describe('decimateConforming', () => {
  it('builds a watertight synthetic icosphere (test-fixture sanity)', () => {
    const mesh = buildIcosphere(4); // 20·4^4 = 5120 triangles
    const report = validateMeshForExport(mesh);
    expect(report.boundaryEdges).toBe(0);
    expect(report.nonManifoldEdges).toBe(0);
    expect(report.orientationMismatches).toBe(0);
    expect(report.ok).toBe(true);
  });

  it('is a no-op when the mesh is already under target', async () => {
    const mesh = buildIcosphere(3); // 1280 triangles, well under target
    const target = 1_000_000;
    const out = await decimateConforming(mesh, { target, errorAbsMm: 0.05 });
    expect(out.mesh.triangleCount).toBe(mesh.triangleCount);
    expect(out.mesh.vertices).toBe(mesh.vertices);
    expect(out.mesh.indices).toBe(mesh.indices);
    expect(out.report.applied).toBe(false);
    expect(out.report.refused).toBe(false);
    expect(out.report.reason).toBe('under-budget');
  });

  it('DE-VACUATED APPLY: decimates an over-budget closed mesh to <= target, gate-clean', async () => {
    if (!(await wasmOrSkip('de-vacuated apply'))) return;
    const mesh = buildIcosphere(6); // 20·4^6 = 81,920 triangles
    expect(mesh.triangleCount).toBeGreaterThan(20_000);

    const target = 20_000;
    // Generous 0.5mm seed (sag at this density is ~0.01mm) — an implementation
    // that always refuses MUST fail this hard-assert.
    const out = await decimateConforming(mesh, { target, errorAbsMm: 0.5 });

    expect(out.report.applied).toBe(true);
    expect(out.report.reason).toBe('accepted');
    expect(out.mesh.triangleCount).toBeLessThanOrEqual(target);
    expect(out.mesh.triangleCount).toBeGreaterThan(0);

    const q = triangleQuality3D({ vertices: out.mesh.vertices, indices: out.mesh.indices });
    expect(q.sliverCount).toBe(0);
    expect(q.maxAspect3D).toBeLessThan(100);
    const topo = topologyMetric({ vertices: out.mesh.vertices, indices: out.mesh.indices }, WELD_TOL_MM);
    expect(topo.boundaryEdges).toBe(0);
    expect(topo.nonManifoldEdges).toBe(0);
    expect(topo.orientationMismatches).toBe(0);
    const passed = out.report.attempts.find((a) => a.passed);
    expect(passed).toBeDefined();
    expect(passed!.resultErrorMm).toBeLessThanOrEqual(0.5);

    const report = validateMeshForExport(out.mesh);
    expect(report.ok).toBe(true);
  });

  it('EXACT-SUBSET: output vertices are an exact subset of input positions (removes, never moves)', async () => {
    if (!(await wasmOrSkip('exact-subset'))) return;
    const mesh = buildIcosphere(6);
    const out = await decimateConforming(mesh, { target: 20_000, errorAbsMm: 0.5 });
    expect(out.report.applied).toBe(true);
    // Pin that compaction actually ran (a compactMesh-throw fallback returns the
    // ORIGINAL array by reference, which would pass the subset loop vacuously).
    expect(out.mesh.vertices).not.toBe(mesh.vertices);
    expect(out.mesh.vertexCount).toBeLessThan(mesh.vertexCount);
    const inputKeys = positionKeySet(mesh.vertices, mesh.vertexCount);
    for (let i = 0; i < out.mesh.vertexCount; i++) {
      const key = `${out.mesh.vertices[i * 3]}|${out.mesh.vertices[i * 3 + 1]}|${out.mesh.vertices[i * 3 + 2]}`;
      expect(inputKeys.has(key)).toBe(true);
    }
  });

  it('ANISOTROPIC SHAPE GATE: never ships a slivered middle on a stretched mesh', async () => {
    if (!(await wasmOrSkip('anisotropic shape gate'))) return;
    const mesh = stretchZ(buildIcosphere(6), 20);
    const out = await decimateConforming(mesh, { target: 4_000, errorAbsMm: 0.5 });
    if (out.report.applied) {
      const q = triangleQuality3D({ vertices: out.mesh.vertices, indices: out.mesh.indices });
      expect(q.sliverCount).toBe(0);
      expect(q.maxAspect3D).toBeLessThan(100);
      const topo = topologyMetric({ vertices: out.mesh.vertices, indices: out.mesh.indices }, WELD_TOL_MM);
      expect(topo.boundaryEdges).toBe(0);
      expect(topo.nonManifoldEdges).toBe(0);
      expect(topo.orientationMismatches).toBe(0);
      const passed = out.report.attempts.find((a) => a.passed);
      expect(passed).toBeDefined();
      expect(passed!.foldedDelta).toBeLessThanOrEqual(0);
    } else {
      // Refusal is legal — but then the ORIGINAL untouched mesh must ship.
      expect(out.report.refused).toBe(true);
      expect(out.mesh.indices).toBe(mesh.indices);
      expect(out.mesh.vertices).toBe(mesh.vertices);
    }
  });

  it('HONEST REFUSAL: unreachable budget within a tiny ceiling returns the original mesh + reason', async () => {
    if (!(await wasmOrSkip('honest refusal'))) return;
    const mesh = buildIcosphere(6);
    const out = await decimateConforming(mesh, {
      target: 50, errorAbsMm: 0.0005, errorCeilingMm: 0.001,
    });
    expect(out.report.refused).toBe(true);
    expect(out.report.applied).toBe(false);
    expect(out.report.reason).toBe('budget-unreachable-within-error');
    expect(out.mesh.vertices).toBe(mesh.vertices);
    expect(out.mesh.indices).toBe(mesh.indices);
    expect(out.report.attempts.length).toBeGreaterThan(0);
  });

  it('LADDER GUARDS: errorAbsMm=0 terminates (clamped seed), seed>ceiling degrades to one rung', async () => {
    if (!(await wasmOrSkip('ladder guards'))) return;
    const mesh = buildIcosphere(4); // 5120 tris — small, the many-rung ladder stays fast
    // A naive `for (e = 0; e < ceiling; e *= 2)` would loop forever at seed 0.
    const zeroSeed = await decimateConforming(mesh, { target: 100, errorAbsMm: 0 });
    expect(zeroSeed.report.errorSeedMm).toBeGreaterThanOrEqual(1e-4);
    expect(zeroSeed.report.applied || zeroSeed.report.refused).toBe(true);

    const inverted = await decimateConforming(mesh, {
      target: 100, errorAbsMm: 0.5, errorCeilingMm: 0.1,
    });
    expect(inverted.report.errorCeilingMm).toBe(0.5); // clamped up to the seed
    expect(inverted.report.attempts.length).toBeLessThanOrEqual(2); // single rung (plain + Regularize)
  });

  it('DELTA GATE: pre-existing input slivers neither block apply nor get misattributed', async () => {
    if (!(await wasmOrSkip('delta gate'))) return;
    const mesh = withPreexistingSliver(buildIcosphere(6));
    const inQ = triangleQuality3D({ vertices: mesh.vertices, indices: mesh.indices });
    expect(inQ.sliverCount).toBeGreaterThanOrEqual(1); // fixture sanity

    const out = await decimateConforming(mesh, { target: 20_000, errorAbsMm: 0.5 });
    expect(out.report.inputDefects).not.toBeNull();
    expect(out.report.inputDefects!.sliverCount).toBe(inQ.sliverCount);
    expect(out.report.applied).toBe(true); // absolute-zero gating would refuse forever here
    const q = triangleQuality3D({ vertices: out.mesh.vertices, indices: out.mesh.indices });
    expect(q.sliverCount).toBeLessThanOrEqual(inQ.sliverCount); // no NEW slivers
  });

  it('CALLER GATE: rejection exhausts the ladder; acceptance sees RAW pre-compaction indices', async () => {
    if (!(await wasmOrSkip('caller gate'))) return;
    const mesh = buildIcosphere(6);

    const rejected = await decimateConforming(mesh, {
      target: 20_000, errorAbsMm: 0.5,
      validateCandidate: () => 'featureDrop=1 post-decimation',
    });
    expect(rejected.report.refused).toBe(true);
    expect(rejected.report.reason).toBe('no-quality-safe-point');
    expect(rejected.report.attempts.some((a) => a.externalReject === 'featureDrop=1 post-decimation')).toBe(true);
    expect(rejected.mesh.indices).toBe(mesh.indices);

    let seen: Uint32Array | null = null;
    const accepted = await decimateConforming(mesh, {
      target: 20_000, errorAbsMm: 0.5,
      validateCandidate: (idx) => { seen = idx; return null; },
    });
    expect(accepted.report.applied).toBe(true);
    expect(seen).not.toBeNull();
    let maxIdx = 0;
    for (const v of seen! as Uint32Array) maxIdx = Math.max(maxIdx, v);
    expect(maxIdx).toBeLessThan(mesh.vertexCount); // raw ids over the ORIGINAL vertex array
    expect(seen!).not.toBe(accepted.mesh.indices); // compaction renumbers; the gate saw pre-compaction ids
    expect(accepted.report.acceptedIndices).toBe(seen);
  });

  it('DETERMINISM: identical input twice produces byte-identical output', async () => {
    if (!(await wasmOrSkip('determinism'))) return;
    const mesh = buildIcosphere(6);
    const a = await decimateConforming(mesh, { target: 20_000, errorAbsMm: 0.5 });
    const b = await decimateConforming(mesh, { target: 20_000, errorAbsMm: 0.5 });
    expect(a.report.applied).toBe(true);
    expect(b.report.applied).toBe(true);
    expect(a.mesh.triangleCount).toBe(b.mesh.triangleCount);
    expect(a.mesh.vertexCount).toBe(b.mesh.vertexCount);
    expect(Buffer.from(a.mesh.indices.buffer).equals(Buffer.from(b.mesh.indices.buffer))).toBe(true);
    expect(Buffer.from(a.mesh.vertices.buffer).equals(Buffer.from(b.mesh.vertices.buffer))).toBe(true);
  });
});

describe('decimateConforming (mocked meshoptimizer — call-contract pins)', () => {
  afterEach(() => {
    vi.doUnmock('meshoptimizer');
    vi.resetModules();
  });

  it('UNITS PIN: simplify receives stride=3, target_error in ABSOLUTE mm, and the ErrorAbsolute flag', async () => {
    vi.resetModules();
    const captured: Array<{ stride: number; targetError: number; flags: string[] }> = [];
    vi.doMock('meshoptimizer', () => ({
      MeshoptSimplifier: {
        supported: true,
        ready: Promise.resolve(),
        simplify: (
          indices: Uint32Array,
          _positions: Float32Array,
          stride: number,
          targetIndexCount: number,
          targetError: number,
          flags?: string[],
        ): [Uint32Array, number] => {
          captured.push({ stride, targetError, flags: flags ?? [] });
          return [indices.slice(0, targetIndexCount), 0.01];
        },
      },
    }));
    const fresh = await import('./decimateConforming');
    const mesh = buildIcosphere(4); // 5120 tris
    await fresh.decimateConforming(mesh, { target: 1_000, errorAbsMm: 0.05 });

    expect(captured.length).toBeGreaterThan(0);
    const first = captured[0];
    expect(first.stride).toBe(3); // FLOAT elements for packed [x,y,z]
    // THE root-cause pin: the seed is passed through in mm — NOT multiplied by
    // the bbox diagonal into meshopt's relative slot.
    expect(first.targetError).toBe(0.05);
    expect(first.flags).toContain('ErrorAbsolute');
    expect(first.flags).toContain('LockBorder');
  });

  it('WASM-UNAVAILABLE: refuses with reason wasm-unavailable (never a silent no-op)', async () => {
    vi.resetModules();
    vi.doMock('meshoptimizer', () => ({
      MeshoptSimplifier: { supported: false, ready: Promise.resolve() },
    }));
    const fresh = await import('./decimateConforming');
    const mesh = buildIcosphere(4);
    const out = await fresh.decimateConforming(mesh, { target: 100, errorAbsMm: 0.05 });
    expect(out.report.refused).toBe(true);
    expect(out.report.reason).toBe('wasm-unavailable');
    expect(out.mesh.vertices).toBe(mesh.vertices);
    expect(out.mesh.indices).toBe(mesh.indices);
  });
});
