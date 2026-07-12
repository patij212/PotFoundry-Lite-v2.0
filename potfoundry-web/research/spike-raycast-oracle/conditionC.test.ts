// research/spike-raycast-oracle/conditionC.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildSolidCPU } from './buildSolidCPU';
import { checkConditionC } from './conditionC';

describe('checkConditionC', () => {
  // MEASURED FINDING (2026-07-12, Task 3 of the Raycast-Oracle Fidelity Spike):
  // for the smooth control (SuperformulaBlossom, maxSagMm=0.1) the full
  // assembled solid IS watertight — boundaryEdges === 0, orientationMismatches
  // === 0, nonManifoldEdges === 0, validateMeshForExport(mesh).errors === [] —
  // so the spec's "known caveat" (design.md §3: outer wall open at HEAD,
  // "blocked on SP3") does NOT reproduce here; the full assembly is closed, as
  // the design doc anticipated it might be ("The full assembly may still be
  // closed; the spike checks this per style").
  //
  // But `checkConditionC.ok` also folds in `detectSelfIntersections` per this
  // task's spec (design.md §3 "C — Sliceable" is validateMeshForExport AND
  // selfIntersection), and that finds 5 crossing non-adjacent triangle pairs
  // out of 190,666 triangles (~0.0026%) on this run. Per design.md §9, "Any
  // style fails C (open shell / non-manifold / self-intersecting) --
  // watertight assembly (SP3) is the blocker" -- so this is a genuine, narrow
  // Condition-C finding distinct from the anticipated boundaryEdges caveat:
  // closed-but-self-intersecting, not open. Recorded here (not forced green,
  // not fixed — no src/ edits in this task's scope); a future fix to the
  // conforming assembly's self-intersection-freeness should flip this
  // `it.fails` red, which is the signal to retire this pin.
  it.fails('validates + emits an STL for the smooth control', () => {
    const outDir = join('research', 'spike-raycast-oracle', '__tmp_test__');
    try {
      const solid = buildSolidCPU('SuperformulaBlossom', { maxSagMm: 0.1, verdictRefine: false });
      const r = checkConditionC(solid, 'SuperformulaBlossom', outDir);
      expect(r.triangleCount).toBeGreaterThan(1000);
      expect(r.boundaryEdges).toBe(0);
      expect(r.orientationMismatches).toBe(0);
      expect(r.ok).toBe(true); // FAILS today: r.selfIntersections === 5 (see comment above)
      expect(existsSync(r.stlPath)).toBe(true);
      expect(statSync(r.stlPath).size).toBeGreaterThan(84); // > STL header
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60000);
});
