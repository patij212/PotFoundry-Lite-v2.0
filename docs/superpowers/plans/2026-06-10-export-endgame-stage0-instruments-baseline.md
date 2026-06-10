# Export Endgame — Stage 0: Instruments + Authoritative Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land every measurement instrument the export-endgame design needs (mesh hashes, CDT fold/drop counters, triangle provenance, sliver attribution, SpiralRidges ceiling map, seam/cap-band probe, TRUE-instrument B-sweep) and commit the authoritative 20-style × dimension-space baseline — with production mesh output **byte-identical** throughout (the only permitted conditional behavior change is the pre-registered `hasFeatures B≤2` containment cap, fired only by the B-sweep verdict).

**Architecture:** Spec = `docs/superpowers/specs/2026-06-10-export-metric-meshing-endgame-design.md` (Stage 0). Instruments live in the conforming mesher's existing diagnostic seams: counters extend `ConstrainedCellTriangulator`'s result, provenance extends `QuadtreeMesh`, diagnostics are new `window.__pfFidelity` methods following the exact `diagnoseCrestQuality` pattern (`src/fidelity/windowHook.ts`), e2e probes follow the exact `_baseline_matrix.cjs` pattern. Hash instrument lands FIRST so byte-identity is checkable before any production file is touched.

**Tech Stack:** TypeScript, Vitest (`npm run test`), Playwright headed Chromium probes run by node (NOT MCP playwright; `--enable-unsafe-webgpu`, never `--enable-features=Vulkan`), dev server `npm run dev -- --port 3001` (may land on :3003 — check the log; clear `node_modules/.vite` if `isReady` hangs).

**Cross-cutting gates (every commit):**
```bash
cd potfoundry-web
npx vitest run src/renderers/webgpu/parametric/conforming/ src/fidelity/ --test-timeout=30000
npm run typecheck
npx eslint <changed files> --max-warnings=0
```
Scoped `git add` of explicit paths only — NEVER `git add -A` (the tree has untracked scratch). GitNexus MCP is unusable here — gate via the suite, not `impact()`.

---

## File structure (touch map)

| File | Change | Task |
|---|---|---|
| `src/fidelity/metrics.ts` | add `meshHash`, `seamBandTriangleQuality` | 1, 5 |
| `src/fidelity/windowHook.ts` | add `_debugMeshHash`, `diagnoseCdtHealth`, `diagnoseSliverAttribution`, `diagnoseCellCeiling`, `diagnoseSeamBands` | 1–5 |
| `src/fidelity/meshHash.test.ts` (create) | hash unit tests | 1 |
| `parametric/conforming/ConstrainedCellTriangulator.ts` | extract `normalizeWinding` + counters (output byte-identical) | 2 |
| `parametric/conforming/ConstrainedCellTriangulator.test.ts` | counter tests | 2 |
| `parametric/conforming/FeatureConformingTriangulator.ts` | thread cdtStats; provenance tags | 2, 3 |
| `parametric/conforming/QuadtreeTriangulator.ts` | `triangleSource` channel + tags | 3 |
| `parametric/conforming/ConformingWall.ts`, `WatertightAssembly.ts` | pass-through cdtStats/provenance; cap tag fill | 2, 3 |
| `parametric/conforming/FShearDiagnostics.ts` (+ test) | `classifyCellCeiling` | 4 |
| `src/renderers/webgpu/ParametricExportComputer.ts` | record warps + pre-warp UT copy + cdtStats/provenance into the existing LAST_CONFORMING_* pattern (~:2498-2536) | 2–5 |
| `e2e/_mesh_hash.cjs`, `_b_sweep.cjs`, `_authoritative_matrix.cjs` (create) | probes | 1, 7, 9 |
| `e2e/baselines/mesh-hashes-default-2026-06.json`, `b-sweep-2026-06.json`, `authoritative-2026-06.json` (create) | committed artifacts | 1, 7, 9 |
| `parametric/conforming/WatertightAssembly.ts` `computeUBias` | CONDITIONAL `hasFeatures` cap (Task 7 verdict only) | 8 |
| `docs/superpowers/plans/2026-06-10-export-pipeline-cutover-plan.md`, `docs/superpowers/NEXT-SESSION-CREST-FIDELITY.md` | supersession banners | 10 |

Provenance tag vocabulary (used by Tasks 3, 9):

```typescript
export const TRI_SOURCE = {
  PLAIN_QUAD: 0,      // triangulateQuadtree plain-quad split
  TRANSITION_FAN: 1,  // triangulateQuadtree centroid transition fan
  EAR_CLIP: 2,        // dead today (leaf.efg never set) — reserved for Stage 1
  FCT_PLAIN_QUAD: 3,  // FeatureConformingTriangulator plain cell, 0-split
  FCT_PLAIN_FAN: 4,   // FeatureConformingTriangulator plain cell, centroid fan
  FCT_FEATURE_CDT: 5, // FeatureConformingTriangulator feature-cell CDT fill
  RING_OR_CAP: 6,     // assembly ring strips / caps
} as const;
```

---

### Task 1: Mesh-hash instrument + pre-change hash baseline (ARMS THE TRIPWIRE — must land before Tasks 2–5)

**Files:**
- Modify: `src/fidelity/metrics.ts` (append), `src/fidelity/windowHook.ts`
- Create: `src/fidelity/meshHash.test.ts`, `e2e/_mesh_hash.cjs`
- Commit artifact: `e2e/baselines/mesh-hashes-default-2026-06.json`

- [ ] **Step 1: Write the failing test** (`src/fidelity/meshHash.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import { meshHash } from './metrics';

describe('meshHash — FNV-1a dual-lane mesh fingerprint', () => {
  const verts = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const idx = new Uint32Array([0, 1, 2]);

  it('is deterministic', () => {
    const a = meshHash(verts, idx);
    const b = meshHash(new Float32Array(verts), new Uint32Array(idx));
    expect(a.vertexHash).toBe(b.vertexHash);
    expect(a.indexHash).toBe(b.indexHash);
    expect(a.vertexHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('changes when a single float changes by one ULP-scale step', () => {
    const v2 = new Float32Array(verts);
    v2[4] = v2[4] + 1e-7;
    expect(meshHash(v2, idx).vertexHash).not.toBe(meshHash(verts, idx).vertexHash);
    expect(meshHash(v2, idx).indexHash).toBe(meshHash(verts, idx).indexHash);
  });

  it('changes when connectivity changes', () => {
    const i2 = new Uint32Array([0, 2, 1]);
    expect(meshHash(verts, i2).indexHash).not.toBe(meshHash(verts, idx).indexHash);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd potfoundry-web && npx vitest run src/fidelity/meshHash.test.ts`
Expected: FAIL — `meshHash` is not exported.

- [ ] **Step 3: Implement** — append to `src/fidelity/metrics.ts`:

```typescript
/** One FNV-1a 32-bit lane over raw bytes (seeded so two lanes are independent). */
function fnv1a32(bytes: Uint8Array, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface MeshHashResult {
  vertexHash: string;
  indexHash: string;
}

/**
 * Byte-exact mesh fingerprint (two independent FNV-1a lanes per buffer → 64-bit
 * hex). Valid for SAME-machine/driver comparisons only — GPU-evaluated floats
 * are not portable across hardware. This is the Stage-0 byte-identity tripwire.
 */
export function meshHash(vertices: Float32Array, indices: Uint32Array): MeshHashResult {
  const vb = new Uint8Array(vertices.buffer, vertices.byteOffset, vertices.byteLength);
  const ib = new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength);
  const hex = (a: number, b: number): string =>
    a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  return {
    vertexHash: hex(fnv1a32(vb, 0x811c9dc5), fnv1a32(vb, 0xdeadbeef)),
    indexHash: hex(fnv1a32(ib, 0x811c9dc5), fnv1a32(ib, 0xdeadbeef)),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/fidelity/meshHash.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Expose the hook** — in `src/fidelity/windowHook.ts`, add to `PfFidelityApi` (after `_debugOuterMesh`, line ~176):

```typescript
_debugMeshHash(targetTriangles?: number): Promise<{
  styleId: string; vertexCount: number; triangleCount: number;
  vertexHash: string; indexHash: string;
} | null>;
```

and to the implementation object (mirror `_debugOuterMesh` at ~:483, which shows the exact `deps.generateMesh` pattern):

```typescript
async _debugMeshHash(targetTriangles?: number) {
  const styleId = currentStyleId();
  const mesh = await deps.generateMesh(targetTriangles);
  if (!mesh) return null;
  const h = meshHash(mesh.vertices, mesh.indices);
  return {
    styleId,
    vertexCount: Math.floor(mesh.vertices.length / 3),
    triangleCount: Math.floor(mesh.indices.length / 3),
    vertexHash: h.vertexHash,
    indexHash: h.indexHash,
  };
},
```

(Import `meshHash` from `./metrics`.) Run the cross-cutting gates.

- [ ] **Step 6: Write the hash probe** — create `e2e/_mesh_hash.cjs` (clone of `_baseline_matrix.cjs`'s loop, hash call instead of diagnostics):

```javascript
// Per-style default-dims mesh hashes — the Stage-0 byte-identity tripwire.
// Valid same-machine only. No Vulkan flag.
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 400000);
const OUT = process.env.PF_OUT || 'e2e/baselines/mesh-hashes-default-2026-06.json';
const STYLES = (process.env.PF_STYLES || [
  'SuperformulaBlossom', 'SuperellipseMorph', 'LowPolyFacet', 'ArtDeco', 'Crystalline',
  'BambooSegments', 'RippleInterference', 'WaveInterference', 'HarmonicRipple', 'GeometricStar',
  'BasketWeave', 'GyroidManifold', 'GothicArches', 'DragonScales', 'SpiralRidges',
  'FourierBloom', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'Voronoi',
].join(',')).split(',');
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(l + ' timeout')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const rows = [];
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const style of STYLES) {
      try {
        await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
        const h = await wt(page.evaluate((t) => window.__pfFidelity._debugMeshHash(t), TARGET), 220000, 'hash');
        rows.push({ style, ...h });
      } catch (e) { rows.push({ style, error: String(e.message || e).slice(0, 120) }); }
      console.log(JSON.stringify(rows[rows.length - 1]));
      fs.writeFileSync(OUT, JSON.stringify({ measuredAt: '2026-06', dims: 'default', rows }, null, 2));
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
```

- [ ] **Step 7: Run it twice and verify determinism** (dev server running):

```bash
cd potfoundry-web && node e2e/_mesh_hash.cjs
PF_OUT=C:/Users/patij212/AppData/Local/Temp/pf_hash_run2.json node e2e/_mesh_hash.cjs
```
Expected: both runs produce identical `vertexHash`/`indexHash` for all 20 styles. **If hashes differ between runs, STOP — the tripwire is invalid on this machine; record which styles wobble and gate byte-identity claims on connectivity (`indexHash`) only.**

- [ ] **Step 8: Commit** (the artifact is the PRE-CHANGE baseline for Tasks 2–5):

```bash
git add potfoundry-web/src/fidelity/metrics.ts potfoundry-web/src/fidelity/windowHook.ts potfoundry-web/src/fidelity/meshHash.test.ts potfoundry-web/e2e/_mesh_hash.cjs potfoundry-web/e2e/baselines/mesh-hashes-default-2026-06.json
git commit -m "test(stage0): mesh-hash instrument + pre-change 20-style hash baseline"
```

---

### Task 2: Dual masking-channel counters (fold-over flips + zero-area drops) + dump/replay

The two channels verified at `ConstrainedCellTriangulator.ts:82-87`: a negative-(u,t)-area triangle from cdt2d is silently winding-flipped (fold-over mask) and an area==0 triangle is silently dropped ((u,t)-collinear is not 3D-collinear ⇒ potential hole). Counting only — emitted triangles byte-identical.

**Files:**
- Modify: `parametric/conforming/ConstrainedCellTriangulator.ts`, `ConstrainedCellTriangulator.test.ts`, `FeatureConformingTriangulator.ts`, `QuadtreeTriangulator.ts` (type only), `ConformingWall.ts`, `WatertightAssembly.ts`, `ParametricExportComputer.ts`, `src/fidelity/windowHook.ts`

- [ ] **Step 1: Write the failing unit tests** (append to `ConstrainedCellTriangulator.test.ts`; matches its existing import style, lines 1–5):

```typescript
import { normalizeWinding } from './ConstrainedCellTriangulator';

describe('normalizeWinding — masking-channel counters', () => {
  const pts: CellPoint[] = [
    { u: 0, t: 0 }, { u: 1, t: 0 }, { u: 1, t: 1 }, { u: 0.5, t: 0 },
  ];

  it('passes CCW triangles through with zero counts', () => {
    const r = normalizeWinding(pts, [[0, 1, 2]]);
    expect(r.triangles).toEqual([[0, 1, 2]]);
    expect(r.inversionCount).toBe(0);
    expect(r.droppedCount).toBe(0);
  });

  it('counts a CW triangle as an inversion and flips it', () => {
    const r = normalizeWinding(pts, [[0, 2, 1]]);
    expect(r.triangles).toEqual([[0, 1, 2]]);
    expect(r.inversionCount).toBe(1);
  });

  it('counts a zero-area (collinear) triangle as a drop', () => {
    const r = normalizeWinding(pts, [[0, 3, 1]]); // 3 collinear points on t=0
    expect(r.triangles).toEqual([]);
    expect(r.droppedCount).toBe(1);
  });

  it('triangulateConstrainedCell reports zero counts on a clean square', () => {
    const boundary: CellPoint[] = [
      { u: 0, t: 0 }, { u: 1, t: 0 }, { u: 1, t: 1 }, { u: 0, t: 1 },
    ];
    const res = triangulateConstrainedCell({ boundary, interior: [], constraints: [] });
    expect(res.inversionCount).toBe(0);
    expect(res.droppedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator.test.ts` → FAIL (`normalizeWinding` not exported).

- [ ] **Step 3: Implement** — in `ConstrainedCellTriangulator.ts`, extend the result type and extract the existing loop (lines 81–87) verbatim into the counted form:

```typescript
/** Result of a single constrained cell triangulation. */
export interface ConstrainedCellResult {
  /** Combined point list (boundary first, then interior). */
  points: CellPoint[];
  /** CCW triangles as index triples into `points`. */
  triangles: Array<[number, number, number]>;
  /** cdt2d emitted a CW triangle that was flipped CCW — a fold-over signal. */
  inversionCount: number;
  /** Zero-(u,t)-area triangles dropped — (u,t)-collinear ≠ 3D-collinear ⇒ potential hole. */
  droppedCount: number;
}

/** Winding normalization with masking-channel counters (was silent at :82-87). */
export function normalizeWinding(
  points: CellPoint[],
  raw: Array<[number, number, number]>,
): { triangles: Array<[number, number, number]>; inversionCount: number; droppedCount: number } {
  const triangles: Array<[number, number, number]> = [];
  let inversionCount = 0;
  let droppedCount = 0;
  for (const [a, b, c] of raw) {
    const area = signedArea2(points[a], points[b], points[c]);
    if (area > 0) triangles.push([a, b, c]);
    else if (area < 0) {
      triangles.push([a, c, b]);
      inversionCount++;
    } else droppedCount++;
  }
  return { triangles, inversionCount, droppedCount };
}
```

and in `triangulateConstrainedCell` replace the loop (lines 79–87) with:

```typescript
  const norm = normalizeWinding(points, raw);
  return { points, triangles: norm.triangles, inversionCount: norm.inversionCount, droppedCount: norm.droppedCount };
```

- [ ] **Step 4: Run the file's full suite** → PASS (existing tests consume `{points, triangles}` only — additive fields).

- [ ] **Step 5: Thread the counts upward.** In `FeatureConformingTriangulator.ts`:
  (a) define and export near the top:

```typescript
/** One CDT cell that fired a masking channel (Stage-0 instrument). */
export interface CdtCellIncident {
  u0: number; t0: number; u1: number; t1: number;
  inversions: number; drops: number;
  /** Replay dump — only when `globalThis.__pfConformingCellDumps === true`. */
  input?: ConstrainedCellInput;
}
export interface CdtStats { inversions: number; drops: number; incidents: CdtCellIncident[] }
```

  (b) in `triangulateQuadtreeWithFeatures`, create `const cdtStats: CdtStats = { inversions: 0, drops: 0, incidents: [] };` before the leaf loop; directly after the `triangulateConstrainedCell` call (line ~822-826, where `u0,t0,u1,t1` for the current cell are in scope — the same values used to build `boundary`):

```typescript
    if (result.inversionCount > 0 || result.droppedCount > 0) {
      cdtStats.inversions += result.inversionCount;
      cdtStats.drops += result.droppedCount;
      const dump = (globalThis as { __pfConformingCellDumps?: boolean }).__pfConformingCellDumps === true;
      cdtStats.incidents.push({
        u0, t0, u1, t1,
        inversions: result.inversionCount, drops: result.droppedCount,
        ...(dump ? { input: { boundary, interior: survivingInterior, constraints: cellConstraints } } : {}),
      });
    }
```

  (c) attach to the return: extend `QuadtreeMesh` (in `QuadtreeTriangulator.ts`, after `seamTriangles`) with `cdtStats?: CdtStats;` (import type) and set `mesh.cdtStats = cdtStats` before returning.

- [ ] **Step 6: Pass through the wall + assembly.** `ConformingWallResult` (ConformingWall.ts:140-153) gains `cdtStats?: CdtStats;` — copy from the triangulated mesh. `WatertightAssemblyResult` (WatertightAssembly.ts:251-258) gains `cdtStats?: { outer?: CdtStats; inner?: CdtStats };` — populate from the two walls where present.

- [ ] **Step 7: Record + expose.** In `ParametricExportComputer.ts`, the conforming branch already records `LAST_CONFORMING_OUTER_WALL_MASK` / `LAST_CONFORMING_FEATURE_RESULT` (~:2498-2536) through a module that `windowHook.ts` reads via `getLastConformingOuterGrid()` / `getLastConformingOuterWallMask()`. Add, in that SAME module and following that exact setter/getter pattern: `setLastConformingCdtStats(asm.cdtStats)` at the same recording site, accessor `getLastConformingCdtStats()`. Then in `windowHook.ts` add to `PfFidelityApi` + implementation:

```typescript
async diagnoseCdtHealth(opts: { targetTriangles?: number } = {}) {
  const styleId = currentStyleId();
  const mesh = await deps.generateMesh(opts.targetTriangles);
  if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
  const stats = getLastConformingCdtStats();
  if (!stats) return null;
  const tot = (s?: CdtStats) => s ?? { inversions: 0, drops: 0, incidents: [] };
  const o = tot(stats.outer); const i = tot(stats.inner);
  return {
    styleId,
    inversions: o.inversions + i.inversions,
    drops: o.drops + i.drops,
    incidentCells: o.incidents.length + i.incidents.length,
    worstIncidents: [...o.incidents, ...i.incidents].slice(0, 20),
  };
},
```

- [ ] **Step 8: Replay fixture harness.** The replay IS `triangulateConstrainedCell(incident.input)` — add to `ConstrainedCellTriangulator.test.ts` a fixture-driven block (skips with no fixtures):

```typescript
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('CDT incident replays (drop e2e dumps into __fixtures__/cdt-incidents/)', () => {
  const dir = join(__dirname, '__fixtures__', 'cdt-incidents');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  it.skipIf(files.length === 0)('replays every dumped incident and re-reports its counters', () => {
    for (const f of files) {
      const input = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const res = triangulateConstrainedCell(input);
      // The dump exists BECAUSE a channel fired — replay must reproduce it (causal repro).
      expect(res.inversionCount + res.droppedCount, f).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 9: Gates + byte-identity spot-check.** Run the cross-cutting gates; then with the dev server up, re-run `node e2e/_mesh_hash.cjs` with `PF_OUT` to a temp file and diff against the Task-1 baseline for 3 styles (`PF_STYLES=SuperformulaBlossom,Voronoi,SpiralRidges`). Expected: identical hashes.

- [ ] **Step 10: Commit**

```bash
git add potfoundry-web/src/renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator.ts potfoundry-web/src/renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator.test.ts potfoundry-web/src/renderers/webgpu/parametric/conforming/FeatureConformingTriangulator.ts potfoundry-web/src/renderers/webgpu/parametric/conforming/QuadtreeTriangulator.ts potfoundry-web/src/renderers/webgpu/parametric/conforming/ConformingWall.ts potfoundry-web/src/renderers/webgpu/parametric/conforming/WatertightAssembly.ts potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts potfoundry-web/src/fidelity/windowHook.ts
git commit -m "feat(stage0): CDT fold/drop masking-channel counters + incident dump/replay (output byte-identical)"
```

---

### Task 3: Per-triangle provenance channel + sliver attribution

**Files:**
- Modify: `QuadtreeTriangulator.ts`, `FeatureConformingTriangulator.ts`, `ConformingWall.ts`, `WatertightAssembly.ts`, `ParametricExportComputer.ts`, `windowHook.ts`
- Test: `src/fidelity/featureQualityHarness.test.ts` (extend — it already builds synthetic walls through the production triangulators, see its `uniformQuadtree`/`buildWall` helpers)

- [ ] **Step 1: Write the failing test** (append to `featureQualityHarness.test.ts`):

```typescript
import { TRI_SOURCE } from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';

describe('triangle provenance channel', () => {
  it('tags every triangle and the tags partition the mesh', () => {
    const mesh = triangulateQuadtreeWithFeatures(uniformQuadtree(3), [vertical(0.3)]);
    const triCount = mesh.indices.length / 3;
    expect(mesh.triangleSource).toBeDefined();
    expect(mesh.triangleSource!.length).toBe(triCount);
    const counts = new Map<number, number>();
    for (const s of mesh.triangleSource!) counts.set(s, (counts.get(s) ?? 0) + 1);
    // A uniform grid with one vertical feature: plain FCT cells + feature CDT cells only.
    expect((counts.get(TRI_SOURCE.FCT_FEATURE_CDT) ?? 0)).toBeGreaterThan(0);
    expect((counts.get(TRI_SOURCE.FCT_PLAIN_QUAD) ?? 0)).toBeGreaterThan(0);
    let sum = 0; for (const v of counts.values()) sum += v;
    expect(sum).toBe(triCount);
  });
});
```

- [ ] **Step 2: Run** → FAIL (`triangleSource`/`TRI_SOURCE` undefined).

- [ ] **Step 3: Implement in `QuadtreeTriangulator.ts`:** export the `TRI_SOURCE` const (vocabulary above); extend `QuadtreeMesh` with `triangleSource?: Uint8Array;`. In `triangulateQuadtree`, alongside the existing `indices` accumulator add `const source: number[] = []` and a mutable `let curTag = TRI_SOURCE.PLAIN_QUAD`, wrapping the existing `emit` so every triple also records `source.push(curTag)`. Set `curTag` per emission region: `PLAIN_QUAD` before the plain-quad block (~:453), `TRANSITION_FAN` before the centroid-fan branch and `EAR_CLIP` before the `earClipMaxMinAngle` call (~:482-505). Return `triangleSource: Uint8Array.from(source)`.
  **In `FeatureConformingTriangulator.ts`:** same wrapper around its `emit`; tags `FCT_PLAIN_QUAD` / `FCT_PLAIN_FAN` in the plain branch (the 0-split vs centroid-fan arms at :687-707) and `FCT_FEATURE_CDT` before the per-cell emission loop (:843-844).

- [ ] **Step 4: Run** → PASS. Also run the FULL conforming suite (templates unchanged — only metadata added).

- [ ] **Step 5: Thread through wall + assembly.** `ConformingWallResult.triangleSource?: Uint8Array` (copy from mesh). In `WatertightAssembly.ts`, mirror the index concatenation (the `pushWallTris` pattern at :462-471): build a global `triangleSource` sized `indices.length/3`, copy each wall's array at its triangle offset, and fill every non-wall range (rings/caps/discs) with `TRI_SOURCE.RING_OR_CAP`. Add `triangleSource?: Uint8Array` to `WatertightAssemblyResult`. Record via the LAST_CONFORMING_* pattern (`setLastConformingTriangleSource`).

- [ ] **Step 6: Sliver-attribution diagnostic** in `windowHook.ts` (+ `PfFidelityApi` entry):

```typescript
async diagnoseSliverAttribution(opts: { targetTriangles?: number; angleBarDeg?: number } = {}) {
  const styleId = currentStyleId();
  const bar = opts.angleBarDeg ?? 15;
  const mesh = await deps.generateMesh(opts.targetTriangles);
  if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
  const src = getLastConformingTriangleSource();
  if (!src) return null;
  const v = mesh.vertices; const ix = mesh.indices;
  const byTag: Record<string, { tris: number; below: number; slivers: number }> = {};
  for (let t = 0; t < ix.length; t += 3) {
    const tag = String(src[t / 3]);
    const b = (byTag[tag] ??= { tris: 0, below: 0, slivers: 0 });
    b.tris++;
    const q = triMinAngleAndAspect(v, ix[t], ix[t + 1], ix[t + 2]); // helper below
    if (q.minAngleDeg < bar) b.below++;
    if (q.aspect > 100) b.slivers++;
  }
  return { styleId, angleBarDeg: bar, byTag };
},
```

with a small local helper `triMinAngleAndAspect(vertices, a, b, c)` computing the 3D min interior angle (law-of-cosines, exactly as `triangleQualityDistribution` does at metrics.ts:758-827) and aspect = longest²·√3/(2·area) (the `cellAspect3D` formula, PeriodicBalancedQuadtree.ts:804-818). Place the helper in `metrics.ts` and export it so the seam-band task reuses it.
**Thin-cell vs bad-template:** the per-incident cell rectangles from Task 2 (`u0,t0,u1,t1`) + the grid sampler give the thin-cell classification: a cell is *thin* (connectivity-immune) when `max(physW,physH)/min(physW,physH) ≥ 4` with `physW=√E·(u1−u0)`, `physH=√G·(t1−t0)` (`firstFundamentalForm` on `getLastConformingOuterGrid()`'s `GpuSurfaceSampler`). A 4:1 rectangle's best diagonal split already bottoms at atan(¼)≈14.0°<15° — pre-registered threshold. Add this classification to `diagnoseCdtHealth`'s incident rows (Task 2's hook) as `thinCell: boolean`; for PLAIN-path slivers (tags 0/1), attribution is by tag + the FShear thin-cell fraction — record both in the matrix probe (Task 9).

- [ ] **Step 7: Gates + hash spot-check** (same 3-style hash diff as Task 2 Step 9) → identical. **Commit:**

```bash
git add potfoundry-web/src/renderers/webgpu/parametric/conforming/QuadtreeTriangulator.ts potfoundry-web/src/renderers/webgpu/parametric/conforming/FeatureConformingTriangulator.ts potfoundry-web/src/renderers/webgpu/parametric/conforming/ConformingWall.ts potfoundry-web/src/renderers/webgpu/parametric/conforming/WatertightAssembly.ts potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts potfoundry-web/src/fidelity/windowHook.ts potfoundry-web/src/fidelity/metrics.ts potfoundry-web/src/fidelity/featureQualityHarness.test.ts
git commit -m "feat(stage0): per-triangle provenance channel + sliver attribution diagnostic"
```

---### Task 4: SpiralRidges per-cell corner-angle ceiling map (F-inclusive, warp-composed)

A cell sheared to a parallelogram with acute corner θ admits NO triangulation with min angle > θ — `cos θ = |F|/√(E·G)` of the (warp-composed) metric. This instrument decides Stage 5 (no-op / lattice alignment / certified floor).

**Files:**
- Modify: `parametric/conforming/FShearDiagnostics.ts`, `FShearDiagnostics.test.ts`, `ParametricExportComputer.ts`, `windowHook.ts`

- [ ] **Step 1: Write the failing test** (append to `FShearDiagnostics.test.ts`):

```typescript
import { classifyCellCeiling } from './FShearDiagnostics';
import { SyntheticCylinderSampler } from './SurfaceSampler';

describe('classifyCellCeiling — analytic min-angle ceiling under a domain shear', () => {
  it('reads ~90° corners on an unsheared cylinder', () => {
    const s = new SyntheticCylinderSampler(50, 120);
    const r = classifyCellCeiling(s, null);
    expect(r.minCornerDeg).toBeGreaterThan(89);
    expect(r.pctCornerBelow15).toBe(0);
  });

  it('matches the analytic corner angle under a pure shear warp', () => {
    const R = 50, H = 120, shear = 2; // u' = u − shear·t
    const s = new SyntheticCylinderSampler(R, H);
    const r = classifyCellCeiling(s, (u, t) => u - shear * t);
    // cylinder: E=(2πR)², G=H²; composed F = −shear·E ⇒
    // cosθ = shear·a / √(H² + shear²·a²), a=2πR
    const a = 2 * Math.PI * R;
    const expected = (Math.acos((shear * a) / Math.hypot(H, shear * a)) * 180) / Math.PI;
    expect(Math.abs(r.minCornerDeg - expected)).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2: Run** → FAIL (`classifyCellCeiling` not exported).

- [ ] **Step 3: Implement** in `FShearDiagnostics.ts` (same lattice skeleton as `classifySurfaceShear`, :168-249):

```typescript
export interface CellCeilingSummary {
  latticePoints: number;
  /** Worst (smallest) parallelogram corner angle over the lattice — the analytic
   *  min-angle CEILING for any triangulation of an axis-aligned cell there. */
  minCornerDeg: number;
  pctCornerBelow15: number;
  pctCornerBelow10: number;
  maxShearCos: number;
}

/**
 * Per-lattice-point corner angle of the metric parallelogram spanned by the
 * (du,0)/(0,dt) axes — F-inclusive (cosθ = |F|/√(EG)) — for the WARP-COMPOSED
 * map when `warp` is given (e.g. the SpiralRidges helix: (u,t) ↦ P(warp(u,t), t)).
 */
export function classifyCellCeiling(
  sampler: SurfaceSampler,
  warp: ((u: number, t: number) => number) | null,
  opts: { resU?: number; resT?: number; tMargin?: number } = {},
): CellCeilingSummary {
  const resU = opts.resU ?? 192;
  const resT = opts.resT ?? 192;
  const tMargin = opts.tMargin ?? 0.02;
  const composed: SurfaceSampler = warp
    ? { position: (u: number, t: number) => sampler.position(warp(u, t), t) }
    : sampler;
  const steps = metricStepsForSampler(sampler);
  let latticePoints = 0;
  let minCorner = 90;
  let below15 = 0;
  let below10 = 0;
  let maxCos = 0;
  for (let it = 0; it < resT; it++) {
    const t = it / (resT - 1);
    if (t < tMargin || t > 1 - tMargin) continue;
    for (let iu = 0; iu < resU; iu++) {
      const u = iu / resU;
      const { E, F, G } = firstFundamentalForm(composed, u, t, steps.hu, steps.ht);
      if (!(E > 0) || !(G > 0)) continue;
      latticePoints++;
      const cosAlpha = Math.min(1, Math.abs(F) / Math.max(Math.sqrt(E * G), 1e-30));
      const corner = (Math.acos(cosAlpha) * 180) / Math.PI;
      if (corner < minCorner) minCorner = corner;
      if (corner < 15) below15++;
      if (corner < 10) below10++;
      if (cosAlpha > maxCos) maxCos = cosAlpha;
    }
  }
  const pct = (n: number): number => (latticePoints ? Math.round((n / latticePoints) * 1000) / 10 : 0);
  return {
    latticePoints,
    minCornerDeg: Math.round(minCorner * 100) / 100,
    pctCornerBelow15: pct(below15),
    pctCornerBelow10: pct(below10),
    maxShearCos: Math.round(maxCos * 1000) / 1000,
  };
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Record the warp + wire the hook.** In `ParametricExportComputer.ts`, after `helixChoice` is final (~:2316) record it via the LAST_CONFORMING_* pattern: `setLastConformingHelixWarp(helixChoice.warp)`. In `windowHook.ts` add `diagnoseCellCeiling`:

```typescript
async diagnoseCellCeiling(opts: { targetTriangles?: number; resU?: number; resT?: number } = {}) {
  const styleId = currentStyleId();
  const mesh = await deps.generateMesh(opts.targetTriangles);
  if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
  const grid = getLastConformingOuterGrid();
  if (!grid) return null;
  const sampler = new GpuSurfaceSampler(grid.positions, grid.resU, grid.resT);
  const helix = getLastConformingHelixWarp();
  const warp = helix && !helix.isIdentity ? (u: number, t: number) => applyHelixWarp(helix, u, t) : null;
  const summary = classifyCellCeiling(sampler, warp, { resU: opts.resU, resT: opts.resT });
  return { styleId, warped: warp !== null, ...summary };
},
```

(import `applyHelixWarp` from `../renderers/webgpu/parametric/conforming/CreaseHelixWarp`).

- [ ] **Step 6: Gates; live sanity check** — dev server up:

```bash
cd potfoundry-web && node -e "console.log('run in probe instead')"
```
Add a temporary 6-line check inside `e2e/_b_sweep.cjs` later (Task 7 collects `diagnoseCellCeiling` for SpiralRidges) — no separate probe needed. **Commit:**

```bash
git add potfoundry-web/src/renderers/webgpu/parametric/conforming/FShearDiagnostics.ts potfoundry-web/src/renderers/webgpu/parametric/conforming/FShearDiagnostics.test.ts potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts potfoundry-web/src/fidelity/windowHook.ts
git commit -m "feat(stage0): F-inclusive warp-composed cell-ceiling instrument (SpiralRidges decision map)"
```

---

### Task 5: Seam/cap-band quality probe (the user-raised periodicity concern, measured)

**Files:**
- Modify: `src/fidelity/metrics.ts`, `src/fidelity/metrics.test.ts`, `ParametricExportComputer.ts`, `windowHook.ts`

- [ ] **Step 1: Write the failing test** (append to `metrics.test.ts`):

```typescript
import { seamBandTriangleQuality } from './metrics';

describe('seamBandTriangleQuality — periodic-seam and cap-ring bands vs bulk', () => {
  // Two wall triangles: one straddling the u-seam (u≈0.995/0.005), one mid-wall.
  // 3D positions: unit-ish triangles; quality values don't matter — bucketing does.
  const vertices = new Float32Array([
    0, 0, 0,   1, 0, 0,   0, 1, 0,   // tri A vertices
    5, 0, 0,   6, 0, 0,   5, 1, 0,   // tri B vertices
  ]);
  const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);
  const ut = new Float32Array([
    0.995, 0.5, 0,   0.005, 0.5, 0,   0.998, 0.52, 0, // tri A: wraps the seam, mid-t
    0.40, 0.5, 0,    0.42, 0.5, 0,    0.41, 0.52, 0,  // tri B: bulk
  ]);

  it('buckets the seam-wrapping triangle into seam, the other into bulk', () => {
    const r = seamBandTriangleQuality({ vertices, indices }, ut);
    expect(r.seam.triangles).toBe(1);
    expect(r.bulk.triangles).toBe(1);
    expect(r.capBottom.triangles).toBe(0);
    expect(r.capTop.triangles).toBe(0);
  });

  it('buckets a cap-adjacent triangle into the cap band', () => {
    const ut2 = new Float32Array(ut);
    ut2[1] = 0.01; ut2[4] = 0.012; ut2[7] = 0.015; // tri A now hugs t=0
    ut2[0] = 0.4; ut2[3] = 0.42; ut2[6] = 0.41;    // ...and is away from the seam
    const r = seamBandTriangleQuality({ vertices, indices }, ut2);
    expect(r.capBottom.triangles).toBe(1);
    expect(r.seam.triangles).toBe(0);
  });

  it('skips non-wall surfaces (surfaceId ≥ 2)', () => {
    const ut3 = new Float32Array(ut);
    ut3[2] = 2; ut3[5] = 2; ut3[8] = 2; // tri A is a rim-cap triangle
    const r = seamBandTriangleQuality({ vertices, indices }, ut3);
    expect(r.seam.triangles + r.bulk.triangles + r.capBottom.triangles + r.capTop.triangles).toBe(1);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** in `metrics.ts` (reuses the law-of-cosines min-angle helper from Task 3):

```typescript
export interface BandQuality { triangles: number; pctBelow15: number; worstMinAngleDeg: number }
export interface SeamBandQualityResult {
  seam: BandQuality; capBottom: BandQuality; capTop: BandQuality; bulk: BandQuality;
}

/**
 * Wall-triangle min-angle quality bucketed into: the periodic u-seam band, the
 * cap-adjacent pinned-ring bands (t≈0 / t≈1), and the bulk. `ut` is the PRE-WARP
 * assembly (u,t,surfaceId) parallel to the evaluated 3D `mesh.vertices` (same
 * vertex order — the registry's topological seam lives at pre-warp u=0/1).
 * Pre-registered defaults: seam half-width 0.01 in u, cap band 0.02 in t.
 */
export function seamBandTriangleQuality(
  mesh: MeshView,
  ut: Float32Array,
  opts: { seamHalfWidthU?: number; capBandT?: number; angleBarDeg?: number } = {},
): SeamBandQualityResult {
  const sw = opts.seamHalfWidthU ?? 0.01;
  const cb = opts.capBandT ?? 0.02;
  const bar = opts.angleBarDeg ?? 15;
  const mk = () => ({ triangles: 0, below: 0, worst: 180 });
  const acc = { seam: mk(), capBottom: mk(), capTop: mk(), bulk: mk() };
  const { vertices, indices } = mesh;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    // wall only (surfaceId 0/1 — outer/inner)
    if (ut[a * 3 + 2] >= 1.5 || ut[b * 3 + 2] >= 1.5 || ut[c * 3 + 2] >= 1.5) continue;
    const us = [ut[a * 3], ut[b * 3], ut[c * 3]];
    const ts = [ut[a * 3 + 1], ut[b * 3 + 1], ut[c * 3 + 1]];
    const nearSeam = us.some((u) => u < sw || u > 1 - sw)
      || Math.max(...us) - Math.min(...us) > 0.5; // u-span wrap = seam triangle
    const tc = (ts[0] + ts[1] + ts[2]) / 3;
    const bucket = nearSeam ? acc.seam : tc < cb ? acc.capBottom : tc > 1 - cb ? acc.capTop : acc.bulk;
    const mAng = triMinAngleAndAspect(vertices, a, b, c).minAngleDeg; // shared helper (Task 3)
    bucket.triangles++;
    if (mAng < bar) bucket.below++;
    if (mAng < bucket.worst) bucket.worst = mAng;
  }
  const out = (x: { triangles: number; below: number; worst: number }): BandQuality => ({
    triangles: x.triangles,
    pctBelow15: x.triangles ? Math.round((x.below / x.triangles) * 1000) / 10 : 0,
    worstMinAngleDeg: x.triangles ? Math.round(x.worst * 100) / 100 : 0,
  });
  return { seam: out(acc.seam), capBottom: out(acc.capBottom), capTop: out(acc.capTop), bulk: out(acc.bulk) };
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Record the PRE-WARP assembly UT + wire the hook.** In `ParametricExportComputer.ts`, **immediately after `assembleWatertight` returns (~:2409) and BEFORE the u/t/helix warp loops (:2418-2481) mutate `asm.vertices` in place**, record a copy via the LAST_CONFORMING_* pattern: `setLastConformingAssemblyUT(asm.vertices.slice())`. (Placement is load-bearing: the warps overwrite u in place; the registry's topological seam is pre-warp u=0/1.) Hook in `windowHook.ts`:

```typescript
async diagnoseSeamBands(opts: { targetTriangles?: number } = {}) {
  const styleId = currentStyleId();
  const mesh = await deps.generateMesh(opts.targetTriangles);
  if (!mesh) throw new Error('Fidelity: under-test generateMesh returned null');
  const ut = getLastConformingAssemblyUT();
  if (!ut || ut.length !== mesh.vertices.length) return null;
  return { styleId, ...seamBandTriangleQuality({ vertices: mesh.vertices, indices: mesh.indices }, ut) };
},
```

- [ ] **Step 6: Gates + final byte-identity verification for the whole instrument block** — re-run the FULL 20-style hash probe and diff against Task 1's committed baseline:

```bash
cd potfoundry-web
PF_OUT=C:/Users/patij212/AppData/Local/Temp/pf_hash_after_instruments.json node e2e/_mesh_hash.cjs
node -e "const a=require('./e2e/baselines/mesh-hashes-default-2026-06.json'),b=require('C:/Users/patij212/AppData/Local/Temp/pf_hash_after_instruments.json');let bad=0;for(let i=0;i<a.rows.length;i++){const x=a.rows[i],y=b.rows[i];if(x.vertexHash!==y.vertexHash||x.indexHash!==y.indexHash){bad++;console.log('DIFF',x.style)}}console.log(bad===0?'BYTE-IDENTICAL 20/20':bad+' styles differ — STOP')"
```
Expected: `BYTE-IDENTICAL 20/20`. Any diff = a Task 2–5 change altered production output — bisect with the per-task sub-flags before proceeding. **Commit:**

```bash
git add potfoundry-web/src/fidelity/metrics.ts potfoundry-web/src/fidelity/metrics.test.ts potfoundry-web/src/renderers/webgpu/ParametricExportComputer.ts potfoundry-web/src/fidelity/windowHook.ts
git commit -m "feat(stage0): seam/cap-band quality instrument (periodicity measured, not argued)"
```

---

### Task 6: Crest-variance pre-registration runs (defines ε for every later "≈bulk" gate)

- [ ] **Step 1:** With the dev server up, run `diagnoseCrestQuality` **3×** per style at default dims (reuse `_baseline_matrix.cjs` with `PF_OUT` to three temp files):

```bash
cd potfoundry-web
for /l %i in (1,1,3) do node e2e/_baseline_matrix.cjs & rem PowerShell: 1..3 | % { $env:PF_OUT="$env:TEMP/pf_var_run$_.json"; node e2e/_baseline_matrix.cjs }
```
(PowerShell form: `1..3 | ForEach-Object { $env:PF_OUT = "$env:TEMP\pf_var_run$_.json"; node e2e/_baseline_matrix.cjs }`.)

- [ ] **Step 2:** Compute per-style spread of `bandBelow15` across the 3 runs; **pre-register `ε_style = max(0.5, 3 × |max−min|)` percentage points** and write the table into the Step-3 artifact of Task 9. If any style's spread exceeds 2pp, flag it: its crest gate must use medians-of-3 in all later stages.

---

### Task 7: TRUE-instrument forced-B sweep (the B=3-vs-B=2 verdict; replaces the inadmissible −38% claim)

**Files:** Create `e2e/_b_sweep.cjs`; commit artifact `e2e/baselines/b-sweep-2026-06.json`.

- [ ] **Step 1: Write the probe:**

```javascript
// TRUE-instrument forced-B sweep over the 9 slivered styles + SFB@1.
// Decides the hasFeatures B<=2 containment cap (pre-registered rule in the
// Stage-0 plan). Decoupled chord reference via __pfReferenceDenseRes=1024.
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 400000);
const OUT = process.env.PF_OUT || 'e2e/baselines/b-sweep-2026-06.json';
const CASES = [
  { tag: 'ArtDeco', style: 'ArtDeco' }, { tag: 'Crystalline', style: 'Crystalline' },
  { tag: 'DragonScales', style: 'DragonScales' }, { tag: 'BasketWeave', style: 'BasketWeave' },
  { tag: 'GeometricStar', style: 'GeometricStar' }, { tag: 'BambooSegments', style: 'BambooSegments' },
  { tag: 'CelticTriquetra', style: 'CelticTriquetra' }, { tag: 'SpiralRidges', style: 'SpiralRidges' },
  { tag: 'Voronoi', style: 'Voronoi' },
  { tag: 'SFB_s1', style: 'SuperformulaBlossom', params: { sf_strength: 1 } },
];
const BS = [0, 1, 2, 3, 'auto'];
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(l + ' timeout')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const rows = [];
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; window.__pfReferenceDenseRes = 1024; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const c of CASES) {
      await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), c.style), 60000, 'setStyle');
      if (c.params) await wt(page.evaluate((p) => window.__pfFidelity.setStyleParams(p), c.params), 30000, 'setParams');
      for (const b of BS) {
        try {
          await page.evaluate((bb) => {
            if (bb === 'auto') delete window.__pfConformingUBias;
            else window.__pfConformingUBias = bb;
          }, b);
          const cq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t, angleBarDeg: 15 }), TARGET), 240000, 'cq');
          const tq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), TARGET), 240000, 'tq');
          const cdt = await wt(page.evaluate(() => window.__pfFidelity.diagnoseCdtHealth()), 60000, 'cdt').catch(() => null);
          const serr = await wt(page.evaluate(() => window.__pfFidelity.diagnoseSerration()), 240000, 'serr').catch(() => null);
          const ceil = c.style === 'SpiralRidges'
            ? await wt(page.evaluate(() => window.__pfFidelity.diagnoseCellCeiling()), 120000, 'ceil').catch(() => null) : null;
          rows.push({
            tag: c.tag, B: b,
            sliver: tq && tq.sliverCount, bnd: tq && tq.boundaryEdges, nonMan: tq && tq.nonManifoldEdges,
            orient: tq && tq.orientationMismatches, maxAspect: tq && Math.round(tq.maxAspect3D),
            bandPctBelow15: cq && cq.bandPctBelow15, wallPctBelow15: cq && cq.pctBelow15,
            worst: cq && cq.worstMinAngleDeg,
            inversions: cdt && cdt.inversions, drops: cdt && cdt.drops,
            crestBandRmsMm: serr && serr.crestBandRmsMm, serrationScore: serr && serr.serrationScore,
            ceiling: ceil && { minCornerDeg: ceil.minCornerDeg, pctBelow15: ceil.pctCornerBelow15, warped: ceil.warped },
          });
        } catch (e) { rows.push({ tag: c.tag, B: b, error: String(e.message || e).slice(0, 120) }); }
        console.log(JSON.stringify(rows[rows.length - 1]));
        fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));
      }
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
```

- [ ] **Step 2: Run it** (~60–90 min): `cd potfoundry-web && node e2e/_b_sweep.cjs`

- [ ] **Step 3: Apply the PRE-REGISTERED decision rule** (written here, before the data exists):
  - **Cap fires** iff, for SFB_s1: `B=3` row has `nonMan > 0` (reproducing the known defect) AND `B=3` does NOT beat `B=2` on BOTH true instruments by the margins: `bandPctBelow15(B3) < bandPctBelow15(B2) − 2.0` and `crestBandRmsMm(B3) < 0.9 × crestBandRmsMm(B2)`. (B3 must be both topology-broken and not meaningfully better to justify capping.)
  - **Cap is refused** if B=3 is topology-clean in this run (the nonMan was something else — record and route to Stage 3 diagnosis), or if B=3 shows a real true-instrument win (then Stage 3's root fix is the only path and SFB@1 ships its current auto-B with the known defect documented).
  - Either way: record the verdict + the full table in the Task 9 artifact. **Commit probe + artifact:**

```bash
git add potfoundry-web/e2e/_b_sweep.cjs potfoundry-web/e2e/baselines/b-sweep-2026-06.json
git commit -m "test(stage0): TRUE-instrument forced-B sweep — B2-vs-B3 verdict artifact"
```

---

### Task 8 (CONDITIONAL — only if Task 7's rule fired): `hasFeatures B≤2` temporary containment cap

- [ ] **Step 1: Failing test** (append to `ComputeUBias.test.ts`, matching its import style at :13-16):

```typescript
it('TEMPORARY containment (Stage 0): caps GATE B at 2 for feature-inserting styles', () => {
  // High u-relief sampler that reads B=3 without features (maxURatio ≈ 11.8 class).
  const hot = new SyntheticCylinderSampler(57, 120, 14, 9); // amp/k chosen to push maxURatio > 8
  expect(computeUBias(hot, false)).toBeGreaterThanOrEqual(3); // plain path keeps full B
  expect(computeUBias(hot, true)).toBe(2);                    // CDT-insertion path capped
});
```
(If `(57,120,14,9)` doesn't reach B≥3, raise `amp` until the *first* assertion passes — the test pins the cap, not the sampler constants.)

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — in `computeUBias` (WatertightAssembly.ts:149-151), change the GATE B return to:

```typescript
  const { maxURatio } = classifySurfaceShear(sampler);
  const b = Math.round(Math.log2(maxURatio / Math.sqrt(3)));
  // TEMPORARY Stage-0 containment (export-endgame spec §5 Stage 0): the auto-B
  // overshoot is NON-MANIFOLD on CDT-insertion styles (SFB@1 B=3, measured) and
  // the B-sweep showed no true-instrument gain over B=2. Lifted by Stage 3's gate.
  const capped = hasFeatures ? Math.min(b, 2) : b;
  return Math.max(0, Math.min(MAX_RELIEF_B, capped));
```

- [ ] **Step 4: Run full conforming suite** → PASS (non-feature styles unchanged; check `ComputeUBias.test.ts` existing expectations — none asserts hasFeatures B>2 today).
- [ ] **Step 5: Re-measure** the hasFeatures styles (SFB@1, Voronoi, CelticKnot, CelticTriquetra, BasketWeave, Hive, Gyroid) with `_b_sweep.cjs` at `BS=['auto']`; expected: SFB@1 `nonMan 3→0`, Voronoi `nonMan 1→0`, sliver counts fall on CDT styles, others unchanged. Re-run `_mesh_hash.cjs` and **re-archive the hashes for exactly the styles whose auto-B changed** (expected: only those; diff list must match the `hasFeatures` style set). **Commit:**

```bash
git add potfoundry-web/src/renderers/webgpu/parametric/conforming/WatertightAssembly.ts potfoundry-web/src/renderers/webgpu/parametric/conforming/ComputeUBias.test.ts potfoundry-web/e2e/baselines/mesh-hashes-default-2026-06.json potfoundry-web/e2e/baselines/b-sweep-2026-06.json
git commit -m "fix(stage0): TEMPORARY hasFeatures B<=2 containment cap (B-sweep verdict; lifted at Stage 3 gate)"
```

---

### Task 9: Authoritative 20×5 baseline matrix (the single source of truth)

**Files:** Create `e2e/_authoritative_matrix.cjs`; commit `e2e/baselines/authoritative-2026-06.json`; record the residual table in `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage0-residuals.md`.

- [ ] **Step 1: Write the driver** (extends the cutover plan Task 0.1 draft with the new instruments):

```javascript
// THE authoritative conforming baseline: 20 styles x 5 dim-sets + adversarial
// style params, production opts (auto uBias — no overrides), real WebGPU.
// Per cell: topo + quality + crest + features + serration(decoupled ref) + cdt
// health + seam bands + provenance attribution + hash + buildMs. 60-120 min.
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 400000);
const OUT = process.env.PF_OUT || 'e2e/baselines/authoritative-2026-06.json';
const STYLES = [
  'SuperformulaBlossom', 'SuperellipseMorph', 'LowPolyFacet', 'ArtDeco', 'Crystalline',
  'BambooSegments', 'RippleInterference', 'WaveInterference', 'HarmonicRipple', 'GeometricStar',
  'BasketWeave', 'GyroidManifold', 'GothicArches', 'DragonScales', 'SpiralRidges',
  'FourierBloom', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'Voronoi',
];
const DIMS = {
  default:    { H: 120, top_od: 140, bottom_od: 90 },
  shortWide:  { H: 40,  top_od: 300, bottom_od: 300 },
  tallNarrow: { H: 220, top_od: 70,  bottom_od: 60 },
  highFlare:  { H: 200, top_od: 240, bottom_od: 60 },
  noDrain:    { H: 120, top_od: 140, bottom_od: 90, r_drain: 0 },
};
// Adversarial style-param rows (default dims): the high-strength regimes.
const PARAM_CASES = [
  { tag: 'SFB_s1', style: 'SuperformulaBlossom', params: { sf_strength: 1 } },
];
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(l + ' timeout')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const rows = [];
  const save = () => fs.writeFileSync(OUT, JSON.stringify({ measuredAt: '2026-06', opts: 'production (auto uBias)', target: TARGET, rows }, null, 2));
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; window.__pfReferenceDenseRes = 1024; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    const measure = async (tag, style, dimName, dims, params) => {
      const t0 = Date.now();
      try {
        await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, 'setStyle');
        if (dims) await wt(page.evaluate((d) => window.__pfFidelity.setDimensions(d), dims), 30000, 'setDims');
        if (params) await wt(page.evaluate((p) => window.__pfFidelity.setStyleParams(p), params), 30000, 'setParams');
        const tq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), TARGET), 260000, 'tq');
        const cq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t, angleBarDeg: 15 }), TARGET), 260000, 'cq').catch(() => null);
        const feat = await wt(page.evaluate(() => window.__pfFidelity.diagnoseFeatures()), 120000, 'feat').catch(() => null);
        const serr = dimName === 'default'
          ? await wt(page.evaluate(() => window.__pfFidelity.diagnoseSerration()), 260000, 'serr').catch(() => null) : null;
        const cdt = await wt(page.evaluate(() => window.__pfFidelity.diagnoseCdtHealth()), 60000, 'cdt').catch(() => null);
        const seam = await wt(page.evaluate(() => window.__pfFidelity.diagnoseSeamBands()), 60000, 'seam').catch(() => null);
        const attr = await wt(page.evaluate(() => window.__pfFidelity.diagnoseSliverAttribution()), 60000, 'attr').catch(() => null);
        const ceil = style === 'SpiralRidges'
          ? await wt(page.evaluate(() => window.__pfFidelity.diagnoseCellCeiling()), 120000, 'ceil').catch(() => null) : null;
        const hash = dimName === 'default'
          ? await wt(page.evaluate((t) => window.__pfFidelity._debugMeshHash(t), TARGET), 120000, 'hash').catch(() => null) : null;
        rows.push({
          tag, dim: dimName, buildMs: Date.now() - t0,
          sliver: tq.sliverCount, bnd: tq.boundaryEdges, nonMan: tq.nonManifoldEdges,
          orient: tq.orientationMismatches, maxAspect: Math.round(tq.maxAspect3D), tris: tq.triangleCount,
          bandPctBelow15: cq && cq.bandPctBelow15, wallPctBelow15: cq && cq.pctBelow15, worst: cq && cq.worstMinAngleDeg,
          featDrop: feat && feat.featuresDropped, crestBandRmsMm: serr && serr.crestBandRmsMm,
          serrationScore: serr && serr.serrationScore,
          inversions: cdt && cdt.inversions, drops: cdt && cdt.drops,
          seam: seam && { seamPct: seam.seam.pctBelow15, bulkPct: seam.bulk.pctBelow15, capB: seam.capBottom.pctBelow15, capT: seam.capTop.pctBelow15, seamTris: seam.seam.triangles },
          attribution: attr && attr.byTag, ceiling: ceil,
          vertexHash: hash && hash.vertexHash, indexHash: hash && hash.indexHash,
        });
      } catch (e) {
        rows.push({ tag, dim: dimName, buildMs: Date.now() - t0, error: String(e.message || e).slice(0, 140) });
      }
      console.log(JSON.stringify(rows[rows.length - 1]));
      save();
    };
    for (const style of STYLES) {
      for (const [dimName, dims] of Object.entries(DIMS)) await measure(style, style, dimName, dims, null);
      await wt(page.evaluate((d) => window.__pfFidelity.setDimensions(d), DIMS.default), 30000, 'resetDims');
    }
    for (const pc of PARAM_CASES) await measure(pc.tag, pc.style, 'default+params', DIMS.default, pc.params);
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
```

**Note:** verify the `DIMS` parameter names against what `setDimensions` actually consumes — `_conforming_dimspace_probe.cjs` uses `{ H, top_od, bottom_od, r_drain }`; mirror its exact dim configs for the four extremes so the new matrix is comparable to the historical dimspace logs.

- [ ] **Step 2: Run** (~60–120 min; styles stream as JSON lines): `cd potfoundry-web && node e2e/_authoritative_matrix.cjs`

- [ ] **Step 3: Write the residual table** — from the artifact, produce `docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage0-residuals.md`: per (style, dim) the goal-vector failures with numbers; the per-style fix-class attribution (thin-cell vs bad-template vs CDT, from `attribution` + `inversions/drops`); the SpiralRidges ceiling verdict; the seam/cap outlier list (any style where `seamPct > bulkPct + ε_style` from Task 6 — if any, it becomes a named defect class per the spec); the Task 6 ε table; the Task 7 B-verdict. **This table is the gate input for Stages 1–3.**

- [ ] **Step 4: Commit**

```bash
git add potfoundry-web/e2e/_authoritative_matrix.cjs potfoundry-web/e2e/baselines/authoritative-2026-06.json docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage0-residuals.md
git commit -m "test(stage0): authoritative 20x5 conforming baseline + residual/attribution tables (production opts)"
```

---

### Task 10: Plan reconciliation (supersession banners; no code)

- [ ] **Step 1:** In `docs/superpowers/plans/2026-06-10-export-pipeline-cutover-plan.md`, insert directly under the title:

```markdown
> **SUPERSESSION NOTE (2026-06-10b):** The meshing work of Phase 1 is superseded by
> `docs/superpowers/specs/2026-06-10-export-metric-meshing-endgame-design.md`:
> Task 1.2 (GATE-A un-defer) stays deferred (wash, measured); Task 1.3 (rotated
> cells) is REJECTED (ArtDeco eUL-cascade evidence) — its successor is the spec's
> Stage 1/2 metric layer. Task 1.1 (CelticKnot bnd=6) moves to spec Stage 3.
> Task 2.3 (format bug) is already FIXED in live paths (verified at 407a091).
> NEW urgent Phase-2 item: the DEFAULT UI export never reaches the conforming
> mesher (classic default button → GPU-grid path; v2 StatusFooter → legacy
> battery) — the flag-source task must route ALL export paths. Phases 0/2/3/4/5
> remain valid and run in parallel with the spec's stages; the default flip uses
> the spec's Stage-6 dominance checkpoint.
```

- [ ] **Step 2:** In `docs/superpowers/NEXT-SESSION-CREST-FIDELITY.md`, insert under the `★ SESSION UPDATE 2026-06-10b` header:

```markdown
> **2026-06-10c:** The fix program is now governed by
> `docs/superpowers/specs/2026-06-10-export-metric-meshing-endgame-design.md`
> (adversarially-reviewed design). CORRECTION to "THE FIX TO BUILD NEXT" below:
> Step A's plain-sampler efg is WRONG as written — the u-warp and t-warp
> (ParametricExportComputer.ts:2418-2441) are post-triangulation remaps like the
> helix, so efg must be WARP-COMPOSED from day one; the greedy earClip is replaced
> by Klincsek DP (two crack hazards verified at QuadtreeTriangulator.ts:181,188-190).
> Stage 0 instruments + baseline plan:
> `docs/superpowers/plans/2026-06-10-export-endgame-stage0-instruments-baseline.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-06-10-export-pipeline-cutover-plan.md docs/superpowers/NEXT-SESSION-CREST-FIDELITY.md
git commit -m "docs(stage0): reconcile cutover plan + crest handoff with the endgame spec"
```

---

## Definition of Done (Stage 0)

- All instruments landed, unit-tested, dev-exposed via `window.__pfFidelity`; 318+ tests green; typecheck/lint clean.
- 20/20 default-dims mesh hashes **byte-identical** to the Task-1 pre-change baseline (sole permitted exception: Task 8's cap, with the changed-style list exactly matching the `hasFeatures` set and hashes re-archived).
- Committed artifacts: `mesh-hashes-default-2026-06.json`, `b-sweep-2026-06.json`, `authoritative-2026-06.json`, `stage0-residuals.md` (residuals + attribution + ε table + B-verdict + ceiling verdict + seam-band verdict).
- The Stage-1 gate inputs exist: per-style fix-class attribution and the SpiralRidges ceiling map.

## Self-review notes

- **Spec coverage:** Stage 0(a) baseline → Tasks 6/9; 0(b) instruments → Tasks 1–5 (counters+dump/replay = 2, provenance = 3, attribution = 3, ceiling = 4, seam-band = 5); 0(c) B-sweep + conditional containment → 7/8; 0(d) reconciliation + parallel-track flags → 10 (the cutover Phase-2 wiring itself is the parallel track's plan, not this one).
- **Byte-identity:** hash tripwire lands FIRST (Task 1), spot-checked per task, full-20 verified after the instrument block (Task 5 Step 6), re-archived only at Task 8 with a bounded expected diff set.
- **Pre-registration:** ε rule (Task 6), cap decision rule (Task 7 Step 3), thin-cell threshold (ratio ≥ 4, Task 3) are all written before their data exists.
- **Known environment-discovered points (not placeholders):** the LAST_CONFORMING_* recording module's filename (follow the existing `getLastConformingOuterGrid` import in `windowHook.ts`), exact local variable names at the FCT call site (:822 — `u0,t0,u1,t1` per the plain branch), and `setDimensions` dim-key names (mirror `_conforming_dimspace_probe.cjs`). Each is pinned to a verified reference location.
