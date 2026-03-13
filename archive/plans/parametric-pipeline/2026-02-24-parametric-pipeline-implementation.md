# Parametric Pipeline Modular Decomposition — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose the 6557-line `ParametricExportComputer.ts` monolith into 8 focused modules, add per-module tests, fix 3 critical bugs, and add mesh validation for SLA/resin print readiness.

**Architecture:** Extract leaf-dependency modules first (pure math), then work up the dependency graph. Each extraction is a zero-behavior-change refactoring step followed by a commit. Bug fixes come after modules are isolated so changes are scoped and testable.

**Tech Stack:** TypeScript, Vitest (jsdom), WebGPU compute shaders (WGSL), binary STL export.

---

## Unified Target Contract (Across All 3 Reference Docs)

This implementation plan is explicitly synchronized with:

- `docs/plans/2026-02-24-parametric-pipeline-modular-redesign.md`
- `docs/plans/WebGPU Advanced Tessellation for Precision.md`

“Fingerprint-level micro detail + knife-edge macro features” means all of the following must hold together:

1. **Modular architecture:** no shared mutable state across pipeline stages; typed module I/O only
2. **Tolerance-gated fidelity:** quality profiles are tolerance bundles, not triangle bundles
3. **Constrained features:** ridge/valley/crease graph remains locked through tessellation/refinement
4. **Periodic seam invariants:** seam correctness is topological + geometric, validated in report
5. **Future-safe evolution:** each new stage is pluggable behind stable interfaces and test gates

If any section in this file conflicts with those two reference docs, this unified contract is authoritative.

---

## Conventions

- **Test runner:** `npx vitest run <path> --reporter=verbose`
- **Typecheck:** `npx tsc --noEmit`
- **Lint:** `npx eslint <file> --max-warnings=0`
- **All existing tests must pass after every extraction step:** `npx vitest run src/renderers/webgpu/ParametricExportComputer.test.ts --reporter=verbose`
- **Module directory:** `src/renderers/webgpu/parametric/`
- **Import convention:** Modules export named functions/types. The orchestrator imports from modules.

---

## Task 1: Extract CurvatureAnalysis Module

**Files:**
- Create: `src/renderers/webgpu/parametric/CurvatureAnalysis.ts`
- Create: `src/renderers/webgpu/parametric/CurvatureAnalysis.test.ts`
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

### Step 1: Write the failing test

```typescript
// src/renderers/webgpu/parametric/CurvatureAnalysis.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeRawCurvature,
  normalizeProfile,
  smoothProfile,
} from './CurvatureAnalysis';

describe('CurvatureAnalysis', () => {
  describe('computeRawCurvature', () => {
    it('returns zero for linear positions', () => {
      // 5 points along a straight line: (0,0,0), (1,0,0), (2,0,0), (3,0,0), (4,0,0)
      const positions = new Float32Array([0,0,0, 1,0,0, 2,0,0, 3,0,0, 4,0,0]);
      const result = computeRawCurvature(positions, 5);
      expect(result.length).toBe(5);
      for (let i = 1; i < 4; i++) {
        expect(result[i]).toBeCloseTo(0, 6);
      }
    });

    it('detects curvature on a circular arc', () => {
      // 5 points on a circle of radius 10 in XY plane
      const n = 5;
      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const angle = (i / (n - 1)) * Math.PI * 0.5; // quarter circle
        positions[i * 3] = 10 * Math.cos(angle);
        positions[i * 3 + 1] = 10 * Math.sin(angle);
        positions[i * 3 + 2] = 0;
      }
      const result = computeRawCurvature(positions, n);
      // Interior points should have non-zero curvature
      for (let i = 1; i < n - 1; i++) {
        expect(result[i]).toBeGreaterThan(0);
      }
    });

    it('copies boundary values from neighbors', () => {
      const positions = new Float32Array([0,0,0, 1,0,0, 2,1,0, 3,0,0, 4,0,0]);
      const result = computeRawCurvature(positions, 5);
      expect(result[0]).toBe(result[1]);
      expect(result[4]).toBe(result[3]);
    });
  });

  describe('normalizeProfile', () => {
    it('normalizes to [0, 1] using percentile scaling', () => {
      const input = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        11, 12, 13, 14, 15, 16, 17, 18, 19]);
      const result = normalizeProfile(input);
      expect(result.length).toBe(20);
      // All values should be in [0, 1]
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBeGreaterThanOrEqual(0);
        expect(result[i]).toBeLessThanOrEqual(1);
      }
    });

    it('returns zeros for constant profile', () => {
      const input = new Float32Array([5, 5, 5, 5, 5]);
      const result = normalizeProfile(input);
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBe(0);
      }
    });
  });

  describe('smoothProfile', () => {
    it('preserves profile length', () => {
      const input = new Float32Array([1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
      const result = smoothProfile(input, 2);
      expect(result.length).toBe(input.length);
    });

    it('reduces variation for alternating profile', () => {
      const input = new Float32Array([1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
      const result = smoothProfile(input, 2);
      const inputRange = 1 - 0;
      const resultMin = Math.min(...Array.from(result));
      const resultMax = Math.max(...Array.from(result));
      expect(resultMax - resultMin).toBeLessThan(inputRange);
    });

    it('does not change constant profile', () => {
      const input = new Float32Array([3, 3, 3, 3, 3]);
      const result = smoothProfile(input, 2);
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBeCloseTo(3, 6);
      }
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/renderers/webgpu/parametric/CurvatureAnalysis.test.ts --reporter=verbose`
Expected: FAIL — module does not exist

### Step 3: Create module with extracted functions

```typescript
// src/renderers/webgpu/parametric/CurvatureAnalysis.ts
/**
 * CurvatureAnalysis — Pure math functions for computing, normalizing,
 * and smoothing curvature profiles from 3D position data.
 *
 * Extracted from ParametricExportComputer.ts (lines 163-226).
 * These are stateless utility functions with no GPU or DOM dependencies.
 */

/**
 * Compute RAW (unnormalized) curvature from 3D positions along a parameter.
 * Returns absolute second-derivative magnitudes — no clamping, no scaling.
 */
export function computeRawCurvature(positions: Float32Array, numSamples: number): Float32Array {
    const curvature = new Float32Array(numSamples);

    for (let i = 1; i < numSamples - 1; i++) {
        const x0 = positions[(i - 1) * 3], y0 = positions[(i - 1) * 3 + 1], z0 = positions[(i - 1) * 3 + 2];
        const x1 = positions[i * 3], y1 = positions[i * 3 + 1], z1 = positions[i * 3 + 2];
        const x2 = positions[(i + 1) * 3], y2 = positions[(i + 1) * 3 + 1], z2 = positions[(i + 1) * 3 + 2];

        const dx = x0 - 2 * x1 + x2;
        const dy = y0 - 2 * y1 + y2;
        const dz = z0 - 2 * z1 + z2;

        curvature[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    curvature[0] = curvature[1];
    curvature[numSamples - 1] = curvature[numSamples - 2];

    return curvature;
}

/**
 * Normalize a curvature profile to [0, 1] using percentile scaling.
 * Applied AFTER max-aggregation across all strips.
 */
export function normalizeProfile(curvature: Float32Array): Float32Array {
    const n = curvature.length;
    const result = new Float32Array(n);

    const sorted = Array.from(curvature).sort((a, b) => a - b);
    const p05 = sorted[Math.floor(n * 0.05)];
    const p95 = sorted[Math.floor(n * 0.95)];
    const range = p95 - p05;

    if (range > 1e-8) {
        for (let i = 0; i < n; i++) {
            result[i] = Math.max(0, Math.min(1, (curvature[i] - p05) / range));
        }
    }

    return result;
}

/**
 * Smooth a curvature profile using a moving average window.
 * Prevents CDF from creating excessively sharp density transitions.
 */
export function smoothProfile(profile: Float32Array, radius: number): Float32Array {
    const n = profile.length;
    const result = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let sum = 0;
        let count = 0;
        const lo = Math.max(0, i - radius);
        const hi = Math.min(n - 1, i + radius);
        for (let j = lo; j <= hi; j++) {
            sum += profile[j];
            count++;
        }
        result[i] = sum / count;
    }
    return result;
}
```

### Step 4: Run test to verify it passes

Run: `npx vitest run src/renderers/webgpu/parametric/CurvatureAnalysis.test.ts --reporter=verbose`
Expected: PASS (all 7 tests)

### Step 5: Update monolith to import from module

In `ParametricExportComputer.ts`:
- Add import: `import { computeRawCurvature, normalizeProfile, smoothProfile } from './parametric/CurvatureAnalysis';`
- Delete the function bodies of `computeRawCurvature` (lines 163-182), `normalizeProfile` (lines 188-205), `smoothProfile` (lines 211-226)
- Keep `SMOOTH_RADIUS` constant in the monolith (used by orchestrator)

### Step 6: Run all existing tests

Run: `npx vitest run src/renderers/webgpu/ParametricExportComputer.test.ts --reporter=verbose`
Expected: All 179+ tests PASS

Run: `npx vitest run src/renderers/webgpu/parametric/ --reporter=verbose`
Expected: All new tests PASS

### Step 7: Typecheck and lint

Run: `npx tsc --noEmit`
Run: `npx eslint src/renderers/webgpu/parametric/CurvatureAnalysis.ts --max-warnings=0`

### Step 8: Commit

```bash
git add src/renderers/webgpu/parametric/CurvatureAnalysis.ts \
        src/renderers/webgpu/parametric/CurvatureAnalysis.test.ts \
        src/renderers/webgpu/ParametricExportComputer.ts
git commit -m "refactor: extract CurvatureAnalysis module from parametric pipeline"
```

---

## Task 2: Extract FeatureDetection Module

**Files:**
- Create: `src/renderers/webgpu/parametric/FeatureDetection.ts`
- Create: `src/renderers/webgpu/parametric/FeatureDetection.test.ts`
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

### Step 1: Write the failing test

```typescript
// src/renderers/webgpu/parametric/FeatureDetection.test.ts
import { describe, it, expect } from 'vitest';
import { detectFeatureEdges } from './FeatureDetection';

describe('FeatureDetection', () => {
  describe('detectFeatureEdges', () => {
    it('returns empty array for flat curvature', () => {
      const flat = new Float32Array(100).fill(1);
      const result = detectFeatureEdges(flat, 100);
      expect(result).toEqual([]);
    });

    it('returns empty array for short input', () => {
      const short = new Float32Array([1, 2, 1]);
      const result = detectFeatureEdges(short, 3);
      expect(result).toEqual([]);
    });

    it('detects a single prominent peak', () => {
      const n = 100;
      const curvature = new Float32Array(n);
      // Create a gaussian-like peak at position 50
      for (let i = 0; i < n; i++) {
        const d = i - 50;
        curvature[i] = Math.exp(-d * d / 20);
      }
      const result = detectFeatureEdges(curvature, n);
      expect(result.length).toBeGreaterThanOrEqual(1);
      // Peak should be near position 0.5 (index 50 of 100)
      const peakPos = result[0];
      expect(peakPos).toBeGreaterThan(0.45);
      expect(peakPos).toBeLessThan(0.55);
    });

    it('detects multiple well-separated peaks', () => {
      const n = 200;
      const curvature = new Float32Array(n);
      // Two peaks at positions 50 and 150
      for (let i = 0; i < n; i++) {
        const d1 = i - 50;
        const d2 = i - 150;
        curvature[i] = Math.exp(-d1 * d1 / 20) + Math.exp(-d2 * d2 / 20);
      }
      const result = detectFeatureEdges(curvature, n);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('ignores low-prominence bumps', () => {
      const n = 100;
      const curvature = new Float32Array(n);
      // Large peak at 50, tiny bump at 80
      for (let i = 0; i < n; i++) {
        const d1 = i - 50;
        const d2 = i - 80;
        curvature[i] = Math.exp(-d1 * d1 / 20) + 0.01 * Math.exp(-d2 * d2 / 20);
      }
      const result = detectFeatureEdges(curvature, n);
      // Should detect the main peak but not the tiny bump
      expect(result.length).toBeGreaterThanOrEqual(1);
      // The main peak should be near 0.5
      expect(result[0]).toBeGreaterThan(0.45);
      expect(result[0]).toBeLessThan(0.55);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run src/renderers/webgpu/parametric/FeatureDetection.test.ts --reporter=verbose`
Expected: FAIL

### Step 3: Create module

Extract these functions from `ParametricExportComputer.ts` into `FeatureDetection.ts`:
- `detectFeatureEdges` (lines 315-416) — the core feature detection
- `detectRowFeaturesV16` (lines 2405-2672) — verified per-row detection
- `detectColumnFeaturesV16` (lines 2730-2921) — verified column detection
- `detectRowFeatures` (lines 2674-2689) — legacy wrapper
- `detectAllRowFeatures` (lines 2691-2712) — batch wrapper
- `detectColumnFeatures` (lines 2923-2957) — legacy wrapper
- `detectAndMergeColumnFeatures` (lines 2959-3147) — column merge

Import `FEATURE_PROMINENCE_THRESHOLD` from `./types` (already exported there).

All functions keep their exact signatures. Export them all as named exports.

### Step 4: Run tests

Run: `npx vitest run src/renderers/webgpu/parametric/FeatureDetection.test.ts --reporter=verbose`
Expected: PASS

### Step 5: Update monolith imports

Replace the function bodies in `ParametricExportComputer.ts` with imports from `./parametric/FeatureDetection`.

### Step 6: Run all existing tests

Run: `npx vitest run src/renderers/webgpu/ParametricExportComputer.test.ts --reporter=verbose`
Expected: All 179+ PASS

### Step 7: Typecheck and lint

### Step 8: Commit

```bash
git commit -m "refactor: extract FeatureDetection module from parametric pipeline"
```

---

## Task 3: Extract ChainLinker Module

**Files:**
- Create: `src/renderers/webgpu/parametric/ChainLinker.ts`
- Create: `src/renderers/webgpu/parametric/ChainLinker.test.ts`
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

### Step 1: Write the failing test

```typescript
// src/renderers/webgpu/parametric/ChainLinker.test.ts
import { describe, it, expect } from 'vitest';
import {
  circularDistance,
  circularSignedDelta,
  linkFeatureChainsByKind,
} from './ChainLinker';
import type { FeaturePoint, FeatureChain } from './types';

describe('ChainLinker', () => {
  describe('circularDistance', () => {
    it('returns direct distance for nearby points', () => {
      expect(circularDistance(0.1, 0.2)).toBeCloseTo(0.1, 10);
    });

    it('wraps around for points near seam', () => {
      expect(circularDistance(0.9, 0.1)).toBeCloseTo(0.2, 10);
    });

    it('returns 0 for same position', () => {
      expect(circularDistance(0.5, 0.5)).toBeCloseTo(0, 10);
    });

    it('never exceeds 0.5', () => {
      expect(circularDistance(0.0, 0.5)).toBeCloseTo(0.5, 10);
      expect(circularDistance(0.0, 0.99)).toBeCloseTo(0.01, 10);
    });
  });

  describe('circularSignedDelta', () => {
    it('returns positive for forward movement', () => {
      expect(circularSignedDelta(0.1, 0.3)).toBeCloseTo(0.2, 10);
    });

    it('wraps negative for backward seam crossing', () => {
      // From 0.9 to 0.1: shortest path is +0.2 (forward across seam)
      const delta = circularSignedDelta(0.9, 0.1);
      expect(delta).toBeCloseTo(0.2, 10);
    });
  });

  describe('linkFeatureChainsByKind', () => {
    it('links peaks independently from valleys', () => {
      // 3 rows, each with 1 peak at u=0.5 and 1 valley at u=0.8
      const allRowFeatures: FeaturePoint[][] = [];
      for (let row = 0; row < 3; row++) {
        allRowFeatures.push([
          { u: 0.5, kind: 'peak', radius: 1, prominence: 0.5, confidence: 0.9 },
          { u: 0.8, kind: 'valley', radius: 0.8, prominence: 0.3, confidence: 0.8 },
        ]);
      }

      const chains = linkFeatureChainsByKind(allRowFeatures);
      // Should produce at least 2 chains: one for peaks, one for valleys
      const peakChains = chains.filter(c => c.kind === 'peak');
      const valleyChains = chains.filter(c => c.kind === 'valley');
      expect(peakChains.length).toBeGreaterThanOrEqual(1);
      expect(valleyChains.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty array for empty input', () => {
      const chains = linkFeatureChainsByKind([]);
      expect(chains).toEqual([]);
    });
  });
});
```

### Step 2-8: Same pattern as Task 1

Extract these functions (lines 3165-3634):
- `circularDistance`, `circularSignedDelta`, `liftUToReference`, `unwrapChain`
- `chainRoughness`, `suppressDuplicateChains`, `resnapChainToMeasuredPeaks`
- `postProcessFeatureChains`, `linkFeatureChainsCore`, `linkFeatureChains`
- `linkFeatureChainsByKind`, `insertChainGuidedRows`

Import `FeaturePoint`, `FeatureChain`, `ChainPoint` from `./types`.

Commit: `git commit -m "refactor: extract ChainLinker module from parametric pipeline"`

---

## Task 4: Extract GridBuilder Module

**Files:**
- Create: `src/renderers/webgpu/parametric/GridBuilder.ts`
- Create: `src/renderers/webgpu/parametric/GridBuilder.test.ts`
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

### Step 1: Write the failing test

```typescript
// src/renderers/webgpu/parametric/GridBuilder.test.ts
import { describe, it, expect } from 'vitest';
import { computeGridDimensions, downsampleSortedPositions } from './GridBuilder';

describe('GridBuilder', () => {
  describe('computeGridDimensions', () => {
    it('respects triangle budget', () => {
      const { w, h } = computeGridDimensions(500_000, 0.72, 3.0);
      const tris = 2 * w * h; // 2 triangles per quad
      expect(tris).toBeLessThanOrEqual(500_000 * 0.72 * 1.05); // within 5%
      expect(tris).toBeGreaterThan(0);
    });

    it('adjusts for aspect ratio', () => {
      const wide = computeGridDimensions(500_000, 0.72, 5.0);
      const narrow = computeGridDimensions(500_000, 0.72, 1.0);
      expect(wide.w).toBeGreaterThan(narrow.w);
      expect(wide.h).toBeLessThan(narrow.h);
    });
  });

  describe('downsampleSortedPositions', () => {
    it('returns exact count', () => {
      const input = new Float32Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
      const result = downsampleSortedPositions(input, 5);
      expect(result.length).toBe(5);
    });

    it('preserves monotonic ordering', () => {
      const input = new Float32Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
      const result = downsampleSortedPositions(input, 5);
      for (let i = 1; i < result.length; i++) {
        expect(result[i]).toBeGreaterThan(result[i - 1]);
      }
    });

    it('returns input unchanged if target >= input length', () => {
      const input = new Float32Array([0, 0.5, 1.0]);
      const result = downsampleSortedPositions(input, 5);
      expect(result.length).toBe(3);
    });
  });
});
```

### Step 2-8: Same pattern

Extract these functions:
- `computeGridDimensions` (lines 4092-4121)
- `downsampleSortedPositions` (lines 4123-4147)
- `generateAdaptiveGrid` (lines 588-629)
- `generateCDFAdaptivePositions` (lines 516-578) — retained for reference
- `mergeFeaturePositions` (lines 438-514)
- `buildUnionFeatureGrid` (lines 3808-4041)
- `bsearchFloor` (lines 665-704) — move to `types.ts` as shared utility

Commit: `git commit -m "refactor: extract GridBuilder module from parametric pipeline"`

---

## Task 5: Extract OuterWallTessellator Module

**Files:**
- Create: `src/renderers/webgpu/parametric/OuterWallTessellator.ts`
- Create: `src/renderers/webgpu/parametric/OuterWallTessellator.test.ts`
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

This is the largest and highest-risk extraction. Take extra care.

### Step 1: Write the failing test

```typescript
// src/renderers/webgpu/parametric/OuterWallTessellator.test.ts
import { describe, it, expect } from 'vitest';
import { buildCDTOuterWall } from './OuterWallTessellator';

describe('OuterWallTessellator', () => {
  describe('buildCDTOuterWall', () => {
    it('produces watertight mesh for simple grid (no chains)', () => {
      const numU = 10;
      const numT = 5;
      const unionU = new Float32Array(numU);
      for (let i = 0; i < numU; i++) unionU[i] = i / numU;
      const tPositions = new Float32Array(numT);
      for (let i = 0; i < numT; i++) tPositions[i] = i / (numT - 1);

      const result = buildCDTOuterWall(
        numU, numT, unionU, tPositions,
        [], // no chains
        [], // no row features
        0,  // no chain vertices
      );

      // Check vertex count = numU * numT * 3 (xyz per vertex)
      expect(result.vertices.length).toBe(numU * numT * 3);

      // Check all indices in range
      const maxIdx = numU * numT;
      for (let i = 0; i < result.indices.length; i++) {
        expect(result.indices[i]).toBeLessThan(maxIdx);
      }

      // Check watertight: build edge adjacency
      const edgeCount = new Map<string, number>();
      const triCount = result.indices.length / 3;
      for (let t = 0; t < triCount; t++) {
        const i0 = result.indices[t * 3];
        const i1 = result.indices[t * 3 + 1];
        const i2 = result.indices[t * 3 + 2];
        for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]]) {
          const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
          edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
        }
      }
      // Interior edges: 2, boundary edges (top/bottom): 1
      // For a cylinder topology, left/right edges are shared (periodic)
      for (const [_edge, count] of edgeCount) {
        expect(count).toBeLessThanOrEqual(2);
        expect(count).toBeGreaterThanOrEqual(1);
      }
    });

    it('produces valid indices with chain vertices', () => {
      const numU = 20;
      const numT = 10;
      const unionU = new Float32Array(numU);
      for (let i = 0; i < numU; i++) unionU[i] = i / numU;
      const tPositions = new Float32Array(numT);
      for (let i = 0; i < numT; i++) tPositions[i] = i / (numT - 1);

      // One chain with 5 points
      const chains = [{
        points: [
          { u: 0.25, row: 2 },
          { u: 0.26, row: 3 },
          { u: 0.27, row: 4 },
          { u: 0.28, row: 5 },
          { u: 0.29, row: 6 },
        ],
        kind: 'peak' as const,
      }];

      const result = buildCDTOuterWall(
        numU, numT, unionU, tPositions,
        chains,
        [], // row features
        0,
      );

      // All indices must be valid
      const totalVerts = result.vertices.length / 3;
      for (let i = 0; i < result.indices.length; i++) {
        expect(result.indices[i]).toBeLessThan(totalVerts);
      }
    });
  });
});
```

### Step 2-8: Same pattern

Extract `buildCDTOuterWall` (lines 706-1449) and all its helper functions:
- `buildMergedRow` (embedded helper)
- `sweepRegion` / `constraintAwareTriangulate` / `simpleSweep` (embedded helpers)
- Per-row UV snapping logic (v20.0)
- Seam synchronization (v20.1)

**Critical:** This function takes `chainVertices`, `chainEdges`, `quadMap` as mutable output parameters. The extracted module should return these as part of its result object instead.

Also extract `patchRowFeatures` (lines 4043-4090) — may be dead code; verify with grep first.

Commit: `git commit -m "refactor: extract OuterWallTessellator module from parametric pipeline"`

---

## Task 6: Extract MeshOptimizer Module

**Files:**
- Create: `src/renderers/webgpu/parametric/MeshOptimizer.ts`
- Create: `src/renderers/webgpu/parametric/MeshOptimizer.test.ts`
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

### Step 1: Write the failing test

```typescript
// src/renderers/webgpu/parametric/MeshOptimizer.test.ts
import { describe, it, expect } from 'vitest';
import { flipEdges3D } from './MeshOptimizer';

describe('MeshOptimizer', () => {
  describe('flipEdges3D', () => {
    it('does not modify a perfect equilateral grid', () => {
      // 2x2 grid of equilateral-like triangles — already optimal
      // Flips should be 0 or very few
      const positions = new Float32Array([
        0,0,0,  1,0,0,  2,0,0,
        0,1,0,  1,1,0,  2,1,0,
      ]);
      const indices = new Uint32Array([
        0,1,4, 0,4,3,  // left quad
        1,2,5, 1,5,4,  // right quad
      ]);
      const quadMap = new Int32Array([0, 6]); // 2 quads
      const lockedQuads = new Set<number>();

      const flips = flipEdges3D(positions, indices, quadMap, 3, 2, lockedQuads);
      // For a flat, regular grid, the min-angle criterion shouldn't flip anything
      expect(flips).toBeGreaterThanOrEqual(0);
    });
  });
});
```

### Step 2-8: Same pattern

Extract:
- `chainDirectedFlip` (lines 1894-2141)
- `flipEdges3D` (lines 2143-2356)
- `flipFeatureAlignedDiagonals` (lines 1451-1596) — verify if still used
- `prepareStitchVertices` (lines 1598-1804) — verify if still used
- `applyStitchTriangulation` (lines 1806-1863) — verify if still used

**Dead code check:** Before extracting legacy functions, grep the codebase:
```bash
grep -n "flipFeatureAlignedDiagonals\|prepareStitchVertices\|applyStitchTriangulation" src/renderers/webgpu/ParametricExportComputer.ts
```
If they are only defined but never called, delete them instead of extracting.

Commit: `git commit -m "refactor: extract MeshOptimizer module from parametric pipeline"`

---

## Task 7: Extract MeshSubdivision Module

**Files:**
- Create: `src/renderers/webgpu/parametric/MeshSubdivision.ts`
- Create: `src/renderers/webgpu/parametric/MeshSubdivision.test.ts`
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

### Step 1: Identify subdivision code

The GPU-surface subdivision code lives in the `compute()` method of the class (around lines 5919-6117 based on journal). Read that section and extract the subdivision logic into a standalone function.

### Step 2: Write test

```typescript
// src/renderers/webgpu/parametric/MeshSubdivision.test.ts
import { describe, it, expect } from 'vitest';
import { identifyFeatureAdjacentTriangles } from './MeshSubdivision';
import type { FeatureChain } from './types';

describe('MeshSubdivision', () => {
  describe('identifyFeatureAdjacentTriangles', () => {
    it('finds triangles near chain points', () => {
      // Grid: 4x2 with vertices at known UV positions
      const numU = 4;
      const numT = 2;
      const vertices = new Float32Array(numU * numT * 3);
      for (let t = 0; t < numT; t++) {
        for (let u = 0; u < numU; u++) {
          const idx = (t * numU + u) * 3;
          vertices[idx] = u / numU;     // U
          vertices[idx + 1] = t / (numT - 1); // T
          vertices[idx + 2] = 0;
        }
      }

      const chains: FeatureChain[] = [{
        points: [{ u: 0.3, row: 0 }, { u: 0.3, row: 1 }],
        kind: 'peak',
      }];

      const gridSpacing = 1 / numU;
      const result = identifyFeatureAdjacentTriangles(
        vertices, numU, numT, chains, gridSpacing
      );

      // Should find at least the triangles containing u=0.3
      expect(result.size).toBeGreaterThan(0);
    });

    it('returns empty set when no chains', () => {
      const vertices = new Float32Array(12 * 3);
      const result = identifyFeatureAdjacentTriangles(
        vertices, 4, 3, [], 0.25
      );
      expect(result.size).toBe(0);
    });
  });
});
```

### Step 3-8: Extract, test, commit

The key fix here (Bug 1): replace the broken `vertexIdx >= outerGridVertexCount` check with UV-proximity-based identification using chain data.

Commit: `git commit -m "refactor: extract MeshSubdivision module with UV-proximity feature detection"`

---

## Task 8: Create MeshValidator Module

**Files:**
- Create: `src/renderers/webgpu/parametric/MeshValidator.ts`
- Create: `src/renderers/webgpu/parametric/MeshValidator.test.ts`

This is a NEW module (not extracted from existing code).

### Step 1: Write the failing test

```typescript
// src/renderers/webgpu/parametric/MeshValidator.test.ts
import { describe, it, expect } from 'vitest';
import { validateMesh, type ValidationReport } from './MeshValidator';

describe('MeshValidator', () => {
  // Helper: a valid tetrahedron (4 triangles, watertight)
  const tetraVerts = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0.5, 1, 0,
    0.5, 0.5, 1,
  ]);
  const tetraIndices = new Uint32Array([
    0, 1, 2,  // bottom
    0, 1, 3,  // front
    1, 2, 3,  // right
    0, 2, 3,  // left
  ]);

  describe('manifold check', () => {
    it('passes for a valid tetrahedron', () => {
      const report = validateMesh(tetraVerts, tetraIndices);
      expect(report.manifold.ok).toBe(true);
      expect(report.manifold.nonManifoldEdges).toBe(0);
    });

    it('detects non-manifold edges', () => {
      // 5 triangles sharing one edge (3 faces instead of 2)
      const verts = new Float32Array([
        0,0,0,  1,0,0,  0,1,0,  1,1,0,  0.5,0.5,1,
      ]);
      const indices = new Uint32Array([
        0,1,2,  0,1,3,  0,1,4,  // edge 0-1 has 3 faces
      ]);
      const report = validateMesh(verts, indices);
      expect(report.manifold.ok).toBe(false);
      expect(report.manifold.nonManifoldEdges).toBeGreaterThan(0);
    });
  });

  describe('degenerate check', () => {
    it('detects zero-area triangles', () => {
      const verts = new Float32Array([
        0,0,0,  1,0,0,  2,0,0,  // collinear
        0,1,0,
      ]);
      const indices = new Uint32Array([
        0,1,2,  // degenerate (collinear)
        0,1,3,  // valid
      ]);
      const report = validateMesh(verts, indices);
      expect(report.degenerates.ok).toBe(false);
      expect(report.degenerates.zeroAreaTriangles).toBeGreaterThan(0);
    });
  });

  describe('normal consistency', () => {
    it('passes for consistently wound tetrahedron', () => {
      const report = validateMesh(tetraVerts, tetraIndices);
      expect(report.normals.ok).toBe(true);
    });
  });
});
```

### Step 2: Run test to verify it fails

### Step 3: Implement MeshValidator

```typescript
// src/renderers/webgpu/parametric/MeshValidator.ts
/**
 * MeshValidator — Post-export mesh quality checks for 3D print readiness.
 *
 * Runs after the full pipeline completes. Reports issues but does NOT auto-fix.
 * Designed for SLA/resin printer compatibility (strictest requirements).
 */

export interface ValidationReport {
  valid: boolean;
  manifold: { ok: boolean; nonManifoldEdges: number; boundaryEdges: number };
  normals: { ok: boolean; invertedTriangles: number; inconsistentPairs: number };
  degenerates: { ok: boolean; zeroAreaTriangles: number; collapsedEdges: number };
  wallThickness: { ok: boolean; minThicknessMm: number; thinSpots: number };
  warnings: string[];
}

export function validateMesh(
  vertices: Float32Array,
  indices: Uint32Array,
  options?: { checkWallThickness?: boolean; innerVertices?: Float32Array }
): ValidationReport {
  const warnings: string[] = [];
  const triCount = indices.length / 3;
  const vertCount = vertices.length / 3;

  // ── Manifold Check ──
  const edgeFaceCount = new Map<string, number>();
  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];
    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as [number, number][]) {
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      edgeFaceCount.set(key, (edgeFaceCount.get(key) ?? 0) + 1);
    }
  }
  let nonManifoldEdges = 0;
  let boundaryEdges = 0;
  for (const count of edgeFaceCount.values()) {
    if (count > 2) nonManifoldEdges++;
    if (count === 1) boundaryEdges++;
  }

  // ── Degenerate Check ──
  let zeroAreaTriangles = 0;
  let collapsedEdges = 0;
  const AREA_EPSILON = 1e-10;
  const EDGE_EPSILON = 1e-6;

  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3], i1 = indices[t * 3 + 1], i2 = indices[t * 3 + 2];
    const ax = vertices[i1 * 3] - vertices[i0 * 3];
    const ay = vertices[i1 * 3 + 1] - vertices[i0 * 3 + 1];
    const az = vertices[i1 * 3 + 2] - vertices[i0 * 3 + 2];
    const bx = vertices[i2 * 3] - vertices[i0 * 3];
    const by = vertices[i2 * 3 + 1] - vertices[i0 * 3 + 1];
    const bz = vertices[i2 * 3 + 2] - vertices[i0 * 3 + 2];
    // Cross product magnitude = 2 * triangle area
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    const area2 = cx * cx + cy * cy + cz * cz;
    if (area2 < AREA_EPSILON) zeroAreaTriangles++;

    // Check edge lengths
    const edgeLen2_01 = ax * ax + ay * ay + az * az;
    const ex = vertices[i2 * 3] - vertices[i1 * 3];
    const ey = vertices[i2 * 3 + 1] - vertices[i1 * 3 + 1];
    const ez = vertices[i2 * 3 + 2] - vertices[i1 * 3 + 2];
    const edgeLen2_12 = ex * ex + ey * ey + ez * ez;
    const edgeLen2_20 = bx * bx + by * by + bz * bz;
    if (edgeLen2_01 < EDGE_EPSILON) collapsedEdges++;
    if (edgeLen2_12 < EDGE_EPSILON) collapsedEdges++;
    if (edgeLen2_20 < EDGE_EPSILON) collapsedEdges++;
  }

  // ── Normal Consistency ──
  // Check pairs of triangles sharing an edge have compatible normals
  let invertedTriangles = 0;
  let inconsistentPairs = 0;

  // Build edge→tri adjacency for normal consistency check
  const edgeToTris = new Map<string, number[]>();
  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3], i1 = indices[t * 3 + 1], i2 = indices[t * 3 + 2];
    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as [number, number][]) {
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      const tris = edgeToTris.get(key) ?? [];
      tris.push(t);
      edgeToTris.set(key, tris);
    }
  }

  function triNormal(t: number): [number, number, number] {
    const i0 = indices[t * 3], i1 = indices[t * 3 + 1], i2 = indices[t * 3 + 2];
    const ax = vertices[i1 * 3] - vertices[i0 * 3];
    const ay = vertices[i1 * 3 + 1] - vertices[i0 * 3 + 1];
    const az = vertices[i1 * 3 + 2] - vertices[i0 * 3 + 2];
    const bx = vertices[i2 * 3] - vertices[i0 * 3];
    const by = vertices[i2 * 3 + 1] - vertices[i0 * 3 + 1];
    const bz = vertices[i2 * 3 + 2] - vertices[i0 * 3 + 2];
    return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  }

  for (const tris of edgeToTris.values()) {
    if (tris.length === 2) {
      const [nx0, ny0, nz0] = triNormal(tris[0]);
      const [nx1, ny1, nz1] = triNormal(tris[1]);
      const dot = nx0 * nx1 + ny0 * ny1 + nz0 * nz1;
      if (dot < -0.1) inconsistentPairs++; // normals pointing opposite directions
    }
  }

  // ── Wall Thickness (optional) ──
  let minThicknessMm = Infinity;
  let thinSpots = 0;
  if (options?.checkWallThickness && options.innerVertices) {
    const innerVerts = options.innerVertices;
    const innerVertCount = innerVerts.length / 3;
    const checkCount = Math.min(vertCount, innerVertCount);
    for (let i = 0; i < checkCount; i++) {
      const dx = vertices[i * 3] - innerVerts[i * 3];
      const dy = vertices[i * 3 + 1] - innerVerts[i * 3 + 1];
      const dz = vertices[i * 3 + 2] - innerVerts[i * 3 + 2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < minThicknessMm) minThicknessMm = dist;
      if (dist < 0.8) thinSpots++; // SLA minimum
    }
  }

  const manifoldOk = nonManifoldEdges === 0;
  const degeneratesOk = zeroAreaTriangles === 0 && collapsedEdges === 0;
  const normalsOk = inconsistentPairs === 0 && invertedTriangles === 0;
  const wallOk = !options?.checkWallThickness || thinSpots === 0;

  if (!manifoldOk) warnings.push(`${nonManifoldEdges} non-manifold edges, ${boundaryEdges} boundary edges`);
  if (!degeneratesOk) warnings.push(`${zeroAreaTriangles} zero-area triangles, ${collapsedEdges} collapsed edges`);
  if (!normalsOk) warnings.push(`${inconsistentPairs} inconsistent normal pairs`);
  if (!wallOk) warnings.push(`${thinSpots} spots below 0.8mm wall thickness (min: ${minThicknessMm.toFixed(3)}mm)`);

  return {
    valid: manifoldOk && degeneratesOk && normalsOk && wallOk,
    manifold: { ok: manifoldOk, nonManifoldEdges, boundaryEdges },
    normals: { ok: normalsOk, invertedTriangles, inconsistentPairs },
    degenerates: { ok: degeneratesOk, zeroAreaTriangles, collapsedEdges },
    wallThickness: { ok: wallOk, minThicknessMm: minThicknessMm === Infinity ? 0 : minThicknessMm, thinSpots },
    warnings,
  };
}
```

### Step 4-8: Test, lint, commit

Commit: `git commit -m "feat: add MeshValidator module for 3D print readiness checks"`

---

## Task 9: Slim the Orchestrator

**Files:**
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

### Step 1: Verify all functions are extracted

```bash
grep -c "^function \|^export function " src/renderers/webgpu/ParametricExportComputer.ts
```

Target: Only the `ParametricExportComputer` class and a few private helpers remain. All standalone functions should be in modules.

### Step 2: Update imports

The orchestrator imports all pipeline functions from modules:

```typescript
import { computeRawCurvature, normalizeProfile, smoothProfile } from './parametric/CurvatureAnalysis';
import { detectFeatureEdges, detectRowFeaturesV16, detectColumnFeaturesV16, detectAllRowFeatures, detectAndMergeColumnFeatures } from './parametric/FeatureDetection';
import { linkFeatureChainsByKind, insertChainGuidedRows } from './parametric/ChainLinker';
import { computeGridDimensions, generateAdaptiveGrid, buildUnionFeatureGrid, downsampleSortedPositions } from './parametric/GridBuilder';
import { buildCDTOuterWall } from './parametric/OuterWallTessellator';
import { chainDirectedFlip, flipEdges3D } from './parametric/MeshOptimizer';
import { validateMesh } from './parametric/MeshValidator';
```

### Step 3: Re-export types for backward compatibility

```typescript
// Re-export types so downstream consumers don't break
export type { ParametricExportParams, ParametricExportResult, FeaturePoint, FeatureChain, ChainDebugData, PeakDebugData } from './parametric/types';
```

### Step 4: Delete dead code

Verify and remove functions that are no longer called:
- `flipFeatureAlignedDiagonals` — grep to confirm unused
- `prepareStitchVertices` — grep to confirm unused
- `applyStitchTriangulation` — grep to confirm unused
- `patchRowFeatures` — grep to confirm unused

### Step 5: Run full test suite

```bash
npx vitest run src/renderers/webgpu/ --reporter=verbose
```

Expected: ALL tests pass (existing 179+ plus new module tests)

### Step 6: Line count check

```bash
wc -l src/renderers/webgpu/ParametricExportComputer.ts
```

Target: < 2000 lines (down from 6557)

### Step 7: Commit

```bash
git commit -m "refactor: slim ParametricExportComputer orchestrator to ~1500 lines"
```

---

## Task 10: Fix Bug — Broken Subdivision (MeshSubdivision.ts)

**Files:**
- Modify: `src/renderers/webgpu/parametric/MeshSubdivision.ts`
- Modify: `src/renderers/webgpu/parametric/MeshSubdivision.test.ts`

### Step 1: Write the failing test

```typescript
it('identifies feature-adjacent triangles using UV proximity (v20.x fix)', () => {
  // Simulate v20.0 scenario: all vertices are grid vertices (no chain vertex indices)
  // but some have been UV-snapped to chain positions
  const numU = 10;
  const numT = 5;
  const vertices = new Float32Array(numU * numT * 3);
  for (let t = 0; t < numT; t++) {
    for (let u = 0; u < numU; u++) {
      const idx = (t * numU + u) * 3;
      vertices[idx] = u / numU;
      vertices[idx + 1] = t / (numT - 1);
      vertices[idx + 2] = 0;
    }
  }

  // Snap vertex at (row=2, col=3) to chain position u=0.35
  const snappedIdx = (2 * numU + 3) * 3;
  vertices[snappedIdx] = 0.35;

  const chains = [{
    points: [{ u: 0.35, row: 2 }],
    kind: 'peak' as const,
  }];

  const gridSpacing = 1 / numU;
  const result = identifyFeatureAdjacentTriangles(
    vertices, numU, numT, chains, gridSpacing
  );

  // Should find triangles adjacent to the snapped vertex
  expect(result.size).toBeGreaterThan(0);
});
```

### Step 2: Implement UV-proximity detection

Replace the old `vertexIdx >= outerGridVertexCount` check with:
1. Build a spatial lookup of chain point UV positions
2. For each triangle, compute its UV centroid
3. If any chain point is within `2 * gridSpacing` of the centroid, mark the triangle

### Step 3: Run tests, commit

```bash
git commit -m "fix: rework subdivision to use UV-proximity for feature detection (v20.x compat)"
```

---

## Task 11: Fix Bug — Sawtooth on Spiraling Features

**Files:**
- Modify: `src/renderers/webgpu/parametric/OuterWallTessellator.ts`
- Modify: `src/renderers/webgpu/parametric/OuterWallTessellator.test.ts`

### Step 1: Write the failing test

```typescript
it('inserts micro-rows for steep chain crossings (>1 column per row)', () => {
  const numU = 20;
  const numT = 5;
  const unionU = new Float32Array(numU);
  for (let i = 0; i < numU; i++) unionU[i] = i / numU;
  const tPositions = new Float32Array(numT);
  for (let i = 0; i < numT; i++) tPositions[i] = i / (numT - 1);

  // Steep spiral chain: moves 3 columns per row
  const chains = [{
    points: [
      { u: 0.10, row: 0 },
      { u: 0.25, row: 1 }, // +3 columns
      { u: 0.40, row: 2 }, // +3 columns
      { u: 0.55, row: 3 }, // +3 columns
    ],
    kind: 'peak' as const,
  }];

  const result = buildCDTOuterWall(
    numU, numT, unionU, tPositions, chains, [], 0,
  );

  // With micro-row insertion, total T-rows should be > original numT
  const totalVertices = result.vertices.length / 3;
  const expectedMinVertices = numU * numT; // at minimum, original grid
  expect(totalVertices).toBeGreaterThan(expectedMinVertices);
});
```

### Step 2: Implement targeted micro-row insertion

In `buildCDTOuterWall`, after chain vertices are mapped to grid columns:
1. Walk each chain's consecutive points
2. If `|col_j+1 - col_j| > 1`, compute the intermediate t-value: `t_mid = (t_j + t_j+1) / 2`
3. Insert a single row at `t_mid` with the grid vertex UV-snapped to the chain's interpolated U
4. This is LOCAL insertion — only adds rows where steep crossings occur

### Step 3: Run tests, commit

```bash
git commit -m "fix: targeted micro-row insertion for steep spiral chain crossings"
```

---

## Task 12: Fix Bug — 135 Missing Chain Edges at Seam

**Files:**
- Modify: `src/renderers/webgpu/parametric/ChainLinker.ts`
- Modify: `src/renderers/webgpu/parametric/ChainLinker.test.ts`

### Step 1: Write the failing test

```typescript
it('handles seam-crossing chains (U wraps from ~1.0 to ~0.0)', () => {
  // Chain crosses the seam at col734 (numU=735)
  const allRowFeatures: FeaturePoint[][] = [];
  for (let row = 0; row < 5; row++) {
    // Feature position wraps from 0.995 to 0.005 across the seam
    const u = (0.995 + row * 0.003) % 1.0;
    allRowFeatures.push([
      { u, kind: 'peak', radius: 1, prominence: 0.5, confidence: 0.9 },
    ]);
  }

  const chains = linkFeatureChainsByKind(allRowFeatures);

  // Should produce at least one chain that spans the seam
  expect(chains.length).toBeGreaterThanOrEqual(1);
  // The chain should have points on both sides of the seam
  const seam = chains.find(c =>
    c.points.some(p => p.u > 0.99) && c.points.some(p => p.u < 0.01)
  );
  expect(seam).toBeDefined();
});
```

### Step 2: Fix seam-crossing chain linking

In `linkFeatureChainsCore`, ensure the circular distance check correctly bridges the seam:
1. When computing candidate links, use `circularDistance` (already exists) for U-distance
2. When recording chain edges, handle the wrap: if `|u1 - u0| > 0.4`, split into two sub-edges that touch the seam boundary
3. Ensure interpolated chain points also wrap correctly

### Step 3: Run tests, commit

```bash
git commit -m "fix: seam-crossing chain edges now correctly wrap at U=0/1 boundary"
```

---

## Task 13: Integration Validation

**Files:**
- Create: `src/renderers/webgpu/parametric/integration.test.ts`

### Step 1: Write integration test

```typescript
// src/renderers/webgpu/parametric/integration.test.ts
import { describe, it, expect } from 'vitest';
import { computeRawCurvature, normalizeProfile, smoothProfile } from './CurvatureAnalysis';
import { detectFeatureEdges } from './FeatureDetection';
import { linkFeatureChainsByKind } from './ChainLinker';
import { computeGridDimensions } from './GridBuilder';
import { validateMesh } from './MeshValidator';

describe('Parametric Pipeline Integration', () => {
  it('curvature → features → chains pipeline produces valid chain data', () => {
    // Simulate a style with 6 lobes (like Superformula)
    const n = 4096;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const theta = (i / n) * 2 * Math.PI;
      const r = 50 + 5 * Math.cos(6 * theta); // 6 lobes
      positions[i * 3] = r * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(theta);
      positions[i * 3 + 2] = 0;
    }

    const curvature = computeRawCurvature(positions, n);
    const normalized = normalizeProfile(curvature);
    const smoothed = smoothProfile(normalized, 2);
    const features = detectFeatureEdges(curvature, n, positions);

    // 6 lobes → should detect ~12 features (6 peaks + 6 valleys)
    expect(features.length).toBeGreaterThanOrEqual(6);
    expect(features.length).toBeLessThanOrEqual(24);
  });

  it('grid dimensions respect budget for all surface configs', () => {
    const targetTris = 500_000;
    const surfaceConfigs = [
      { budgetFrac: 0.72, aspect: 3.0 }, // outer wall
      { budgetFrac: 0.14, aspect: 3.0 }, // inner wall
      { budgetFrac: 0.04, aspect: 1.0 }, // rim
    ];

    let totalTris = 0;
    for (const config of surfaceConfigs) {
      const { w, h } = computeGridDimensions(targetTris, config.budgetFrac, config.aspect);
      totalTris += 2 * w * h;
    }

    // Total should not exceed target by more than 10%
    expect(totalTris).toBeLessThan(targetTris * 1.1);
  });
});
```

### Step 2: Run full test suite

```bash
npx vitest run src/renderers/webgpu/ --reporter=verbose
```

### Step 3: Typecheck everything

```bash
npx tsc --noEmit
```

### Step 4: Commit

```bash
git commit -m "test: add parametric pipeline integration tests"
```

---

## Task 14: Update Documentation

**Files:**
- Modify: `CLAUDE.md` — update architecture section to reflect modular structure
- Modify: `docs/plans/2026-02-24-parametric-pipeline-modular-redesign.md` — mark as implemented

### Step 1: Update CLAUDE.md architecture section

Add `parametric/` module listing to the architecture code block. Update the export pipeline section to reference modules instead of line numbers.

### Step 2: Commit

```bash
git commit -m "docs: update CLAUDE.md for modular parametric pipeline"
```

---

## Summary

| Task | Type | Risk | Lines Changed |
|------|------|------|---------------|
| 1. Extract CurvatureAnalysis | Refactor | None | ~100 |
| 2. Extract FeatureDetection | Refactor | Low | ~800 |
| 3. Extract ChainLinker | Refactor | Medium | ~600 |
| 4. Extract GridBuilder | Refactor | Low | ~400 |
| 5. Extract OuterWallTessellator | Refactor | High | ~800 |
| 6. Extract MeshOptimizer | Refactor | Medium | ~600 |
| 7. Extract MeshSubdivision | Refactor | Medium | ~300 |
| 8. Create MeshValidator | New feature | None | ~200 |
| 9. Slim orchestrator | Refactor | Medium | -4500 |
| 10. Fix broken subdivision | Bug fix | Medium | ~50 |
| 11. Fix spiral sawtooth | Bug fix | Medium | ~100 |
| 12. Fix seam chain edges | Bug fix | Low | ~50 |
| 13. Integration tests | Test | None | ~100 |
| 14. Update docs | Docs | None | ~50 |

**Total: 14 tasks, ~8 commits for extraction, 3 bug fix commits, 3 supporting commits.**

---

## Critical Gaps Filled (Precision Addendum)

The 14-task plan is strong for modularization and defect isolation, but it is not sufficient by itself to guarantee near-perfect print fidelity on highly complex styles. The following requirements close that gap.

### Gap A: Triangle count is not a quality metric

8M triangles can still produce visible faceting if density is distributed poorly. Replace fixed-budget quality assumptions with explicit geometric error targets.

**Add export tolerances (in mm/degrees):**

- `eps_pos_mm` (surface position error): default 0.03mm (SLA), 0.08mm (FDM)
- `eps_normal_deg` (normal deviation): default 3.0°
- `eps_feature_mm` (ridge/valley drift): default 0.02mm
- `min_triangle_angle_deg`: default 22°
- `max_aspect_ratio`: default 8.0

### Gap B: Sharp ridges need constrained feature edges

Curvature-guided sampling plus smoothing cannot preserve knife-like transitions by itself.

**Required:**

- Build and maintain a feature graph (ridges, valleys, explicit creases)
- Mark feature edges as constrained in triangulation/edge-flip stages
- Prevent normal blending across hard creases (duplicate vertices by smoothing group where needed)

### Gap C: No anisotropic error-driven refinement loop

Current plan adds local fixes (micro-rows, UV snaps) but still lacks a formal refinement loop with stop conditions.

**Required adaptive loop:**

1. Estimate local position + normal error per triangle
2. Split worst triangles (anisotropic direction from curvature tensor/principal directions)
3. Reproject new vertices to the analytic surface (GPU evaluator)
4. Re-triangulate with constraints preserved
5. Repeat until all triangles satisfy tolerances or hard cap reached

### Gap D: MeshValidator missing geometric quality checks

Current validator is mainly topological/manifold-focused. Add geometric quality metrics that correlate with visible artifacts.

**Add validator checks:**

- Approximate Hausdorff/chord error histogram vs analytic surface
- Per-triangle normal error histogram
- Min angle / max aspect ratio / sliver count
- Feature-edge drift from chain reference
- Seam continuity error (U wrap continuity in position and normal)

---

## New Tasks (15-20) — High Fidelity Export Path

### Task 15: Add explicit quality targets and export profiles

**Files:**
- Modify: `src/renderers/webgpu/parametric/types.ts`
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`
- Create: `src/renderers/webgpu/parametric/QualityProfiles.ts`

Define quality profiles (`draft`, `standard`, `high`, `ultra`) as tolerance bundles (not triangle-count bundles). Preserve triangle budget only as a safety cap.

Commit: `feat: add tolerance-based quality profiles for parametric export`

### Task 16: Add constrained feature-edge pipeline

**Files:**
- Modify: `src/renderers/webgpu/parametric/FeatureDetection.ts`
- Modify: `src/renderers/webgpu/parametric/ChainLinker.ts`
- Modify: `src/renderers/webgpu/parametric/OuterWallTessellator.ts`

Output a stable feature-edge graph and ensure all downstream triangulation keeps those edges immutable.

Commit: `feat: add constrained feature-edge graph for ridge and crease preservation`

### Task 17: Implement anisotropic adaptive refinement loop

**Files:**
- Create: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts`
- Modify: `src/renderers/webgpu/parametric/MeshSubdivision.ts`
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`

Implement iterative error-driven refinement with stop criteria tied to `eps_pos_mm` and `eps_normal_deg`.

Commit: `feat: add anisotropic error-driven refinement loop`

### Task 18: Add seam-as-periodic-topology guarantees

**Files:**
- Modify: `src/renderers/webgpu/parametric/OuterWallTessellator.ts`
- Modify: `src/renderers/webgpu/parametric/ChainLinker.ts`
- Modify: `src/renderers/webgpu/parametric/MeshValidator.ts`

Treat seam as periodic topology first-class, then validate continuity with explicit seam metrics.

Commit: `fix: enforce periodic seam topology and continuity validation`

### Task 19: Expand MeshValidator to geometric QA

**Files:**
- Modify: `src/renderers/webgpu/parametric/MeshValidator.ts`
- Modify: `src/renderers/webgpu/parametric/MeshValidator.test.ts`

Add geometric error and triangle quality checks listed above. Fail `ultra` quality if thresholds exceeded.

Commit: `feat: expand mesh validator with geometric fidelity metrics`

### Task 20: Add style stress benchmark + regression snapshots

**Files:**
- Create: `src/renderers/webgpu/parametric/fidelity.integration.test.ts`
- Create: `artifacts/mesh-fidelity-baselines.json`

Benchmark all style families at high/ultra settings; track per-style max position error, max normal error, seam continuity, and feature drift.

Commit: `test: add per-style high-fidelity meshing regression suite`

---

## Updated Success Criteria (Supersedes previous quality assumptions)

An export is considered successful only if:

1. **Topology**: manifold/watertight with zero non-manifold edges
2. **Geometry**: 99.9th percentile position error <= `eps_pos_mm`
3. **Normals**: 99.9th percentile normal error <= `eps_normal_deg`
4. **Features**: ridge/valley drift <= `eps_feature_mm`
5. **Seam**: no visible seam; seam continuity error below tolerance
6. **Triangle quality**: min angle >= target; slivers below threshold
7. **Print readiness**: passes PrusaSlicer + ChiTuBox without auto-repair warnings

Notes:

- “Perfect” edges in a mathematical sense are not achievable with finite STL tessellation.
- This plan targets practical visual perfection by enforcing strict, measurable geometric error bounds.

---

## UV Metric-Space Refinement Addendum (Critical)

### Problem

UV-space tessellation stretches on flared regions and compresses in grooves/ridges. A fixed UV triangle size does not correspond to fixed 3D triangle size, so detail is lost in exactly the places that need it most.

### Required solution

Use metric-aware anisotropic refinement driven by the analytic surface Jacobian.

- Compute `J=[Xu Xv]` and `G=J^T J` at refinement samples
- Convert 3D edge target to local UV step bounds using principal stretches
- Refine triangles by metric length (`dξ^T M dξ`) rather than Euclidean UV length
- Reproject every inserted vertex via `SurfaceEvaluator`

### New Tasks

## Task 21: Implement UV metric field and anisotropic split criterion

**Files:**
- Create: `src/renderers/webgpu/parametric/SurfaceMetric.ts`
- Modify: `src/renderers/webgpu/parametric/AdaptiveRefinement.ts`
- Modify: `src/renderers/webgpu/parametric/MeshSubdivision.ts`

### Step 1: Add failing tests

Create tests proving 3D edge-length variance decreases after metric-aware refinement on:

- a flared vase profile
- a deep groove profile
- a mixed ridge+flare profile

### Step 2: Implement

In `SurfaceMetric.ts`:

1. Evaluate `Xu`, `Xv` by analytic derivatives or stable finite differences
2. Build `G = [[E,F],[F,G]]`
3. Eigendecompose `G` and produce principal stretch values
4. Return local metric tensor `M` for refinement decisions

In `AdaptiveRefinement.ts`:

5. Replace UV-only split priority with metric-length priority
6. Preserve constrained feature edges and seam periodicity during splits

### Step 3: Test gate

- `p95` 3D edge-length error decreases by >= 40% vs UV-uniform baseline on stress styles
- No regression in manifold/seam checks

Commit: `feat: add UV metric-aware anisotropic refinement for 3D-consistent triangle sizing`

## Task 22: Add distortion validation + quality gates

**Files:**
- Modify: `src/renderers/webgpu/parametric/MeshValidator.ts`
- Modify: `src/renderers/webgpu/parametric/MeshValidator.test.ts`
- Modify: `src/renderers/webgpu/parametric/fidelity.integration.test.ts`

### Step 1: Add metrics to ValidationReport

- `uvMetricDistortion.p95StretchRatio`
- `uvMetricDistortion.p999StretchRatio`
- `edgeLength3D.p95Mm`
- `edgeLength3D.p999Mm`

### Step 2: Add gates by profile

- High: `p95StretchRatio <= 1.8`, `p999StretchRatio <= 3.0`
- Ultra: `p95StretchRatio <= 1.5`, `p999StretchRatio <= 2.5`

### Step 3: Integration tests

Run on high-risk style families (`spiraling`, `high-frequency radial`, `2D texture`) and assert gate compliance.

Commit: `test: add UV distortion and 3D edge-length quality gates`

## Task 23: Lock modular extension points (maintainability + future growth)

**Files:**
- Create: `src/renderers/webgpu/parametric/contracts.ts`
- Modify: `src/renderers/webgpu/ParametricExportComputer.ts`
- Modify: `src/renderers/webgpu/parametric/integration.test.ts`

### Step 1: Define stable stage contracts

Add explicit stage interfaces so new algorithms can be swapped without touching unrelated modules:

- `RefinementStage`
- `ValidationStage`
- `FeatureConstraintStage`
- `TessellationStage`

Each stage receives immutable input and returns immutable output + metrics.

### Step 2: Add pipeline feature flags for safe upgrades

Support controlled adoption of advanced paths (for example, future MDC-inspired components) via config flags, with default behavior unchanged.

### Step 3: Add compatibility tests

Add tests that assert:

- orchestrator composes stages only through contract interfaces
- replacing one stage does not change type-level API contracts
- downgrade ladder behavior remains deterministic across profiles

Commit: `refactor: add stable stage contracts for modular pipeline evolution`

---

## Cross-Doc Traceability Matrix

| Research reference (`WebGPU Advanced Tessellation for Precision.md`) | Redesign phase | Implementation tasks |
|---|---|---|
| Metric-aware UV refinement | Phase 6 | Task 21, Task 22 |
| Error-bounded adaptive loop | Phase 5 | Task 17 |
| Constrained feature graph | Phase 5 + Additional gaps | Task 16 |
| Seam as periodic topology | Phase 3 + Phase 4 | Task 12, Task 18 |
| Unified topology + geometry validator | Phase 4 | Task 8, Task 19, Task 22 |
| Scalable compaction/memory fallback | Guardrails + roadmap | Task 20, Task 23 |
| Future MDC-style controls (phased, not first wave) | Advanced phase guidance | Task 23 (feature-flagged extension path) |

---

## What else is missing or wrong (now explicitly tracked)

1. **Hard edges are still under-specified unless styles emit explicit crease tags**
  - Action: add style-level crease metadata and enforce it in triangulation.

2. **Refinement can still create slivers unless min-angle cleanup runs every iteration**
  - Action: add mandatory post-split sliver suppression pass.

3. **Current checks focus on mesh validity but not print-process risk**
  - Action: add optional overhang/island risk warnings for SLA/FDM workflows.

4. **No deterministic fallback when memory/time cap is hit in Ultra mode**
  - Action: add profile downgrade ladder with explicit warning in export result.

5. **No visual-risk metric for specular highlight faceting**
  - Action: add local normal-variance risk scoring in validator report.
