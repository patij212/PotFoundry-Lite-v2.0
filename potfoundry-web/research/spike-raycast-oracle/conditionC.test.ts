// research/spike-raycast-oracle/conditionC.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildSolidCPU } from './buildSolidCPU';
import { checkConditionC } from './conditionC';

describe('checkConditionC', () => {
  // CONTROL FIX (2026-07-12, Task 3b of the Raycast-Oracle Fidelity Spike):
  // the SuperformulaBlossom(sf_strength=0) "smooth control" formerly pinned
  // here was INVALID as a smooth control. The CPU `rOuterSuperformulaBlossom`
  // (src/geometry/styles.ts) IGNORES sf_strength entirely (always applies
  // full petal relief plus a theta=0 seam cliff), while the GPU path honors
  // it — so the CPU build under test was never actually smooth, and the 5
  // self-intersections previously measured here were a real consequence of
  // that seam cliff, not a harness/detector defect.
  //
  // Fixed by routing through the '__SmoothControl__' sentinel styleId
  // (buildSolidCPU.ts): outerRadius returns the bare base-profile radius r0
  // directly for that id, bypassing getStyleFunction and the analytic
  // feature extractor entirely — a genuine pure surface of revolution, with
  // no style modulation on either the CPU build or (via the exported
  // evalSurface) the sag scorer's lift function. Condition C now PASSES
  // clean on this true smooth control: watertight (boundaryEdges /
  // nonManifoldEdges / orientationMismatches all 0) AND self-intersection-free
  // (selfIntersections 0) — this `it.fails` pin is retired to a normal `it`.
  it('validates + emits an STL for the smooth control', () => {
    const outDir = join('research', 'spike-raycast-oracle', '__tmp_test__');
    try {
      const solid = buildSolidCPU('__SmoothControl__', { maxSagMm: 0.1, verdictRefine: false });
      const r = checkConditionC(solid, '__SmoothControl__', outDir);
      expect(r.triangleCount).toBeGreaterThan(1000);
      expect(r.boundaryEdges).toBe(0);
      expect(r.nonManifoldEdges).toBe(0);
      expect(r.orientationMismatches).toBe(0);
      expect(r.selfIntersections).toBe(0);
      expect(r.ok).toBe(true);
      expect(existsSync(r.stlPath)).toBe(true);
      expect(statSync(r.stlPath).size).toBeGreaterThan(84); // > STL header
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60000);
});
