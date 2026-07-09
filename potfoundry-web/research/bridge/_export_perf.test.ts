// E-2026-07-09-EXPORT-PERF — measurement arm (audit-first: no fix without a number).
// Times the PRODUCTION validation stage (topologyMetric = string-keyed weld + string-keyed
// directed-edge Map, src/fidelity/metrics.ts) on the REAL captured default-export artifacts
// (research/exchange/_prod_truth), and demonstrates the latent Map-size-cap crash: JS Maps hold
// at most 2^24 (~16.7M) entries, and a full pot has ~1.5 unique edges per triangle, so any export
// above ~11.2M tris (the CAD budget cap is 16M) crashes the production validator — the exact
// failure class the research audits hit twice (§V11w/§V11x). DEV-ONLY; src/ never imports research/.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { topologyMetric, triangleQuality3D } from '../../src/fidelity/metrics';
import { loadBinMesh } from './_pf_bvhRuler';

const ON = process.env.PF_EXPORT_PERF === '1';
const ROOT = join('research', 'exchange', '_prod_truth');
const WELD_TOL_MM = 1e-4; // production value (summarizeConformingValidation)

describe('E-2026-07-09-EXPORT-PERF — production validation-stage cost on real artifacts', () => {
  for (const style of ['HarmonicRipple', 'DragonScales']) {
    it.skipIf(!ON)(`${style}: time topologyMetric + triangleQuality3D on the captured full pot`, () => {
      const dir = join(ROOT, style);
      if (!existsSync(join(dir, 'full.xyz.bin'))) {
        console.log(`[export-perf] ${style}: SKIP (no capture)`);
        return;
      }
      const full = loadBinMesh(join(dir, 'full.xyz.bin'), join(dir, 'full.idx.bin'));
      const mesh = { vertices: full.xyz, indices: full.idx };
      const tris = full.idx.length / 3;

      const t0 = Date.now();
      const topo = topologyMetric(mesh, WELD_TOL_MM);
      const topoMs = Date.now() - t0;
      const t1 = Date.now();
      const quality = triangleQuality3D(mesh);
      const qualityMs = Date.now() - t1;
      console.log(
        `[export-perf] ${style}: ${tris} tris | topologyMetric ${(topoMs / 1000).toFixed(1)}s ` +
          `(boundary ${topo.boundaryEdges}, nonMan ${topo.nonManifoldEdges}, orient ${topo.orientationMismatches}) | ` +
          `triangleQuality3D ${(qualityMs / 1000).toFixed(1)}s (slivers ${quality.sliverCount})`,
      );
      expect(topo).toBeDefined();
    }, 3_600_000);
  }

  it.skipIf(!ON)('latent production crash: topologyMetric exceeds the JS Map cap above ~11.2M tris', () => {
    // Build a >11.2M-tri mesh by tiling the DragonScales capture (8.73M tris) with an offset copy
    // (disjoint vertex ranges => edge keys unique per copy => unique-edge count doubles).
    const dir = join(ROOT, 'DragonScales');
    if (!existsSync(join(dir, 'full.xyz.bin'))) {
      console.log('[export-perf] crash-demo: SKIP (no DragonScales capture)');
      return;
    }
    const full = loadBinMesh(join(dir, 'full.xyz.bin'), join(dir, 'full.idx.bin'));
    const nV = full.xyz.length / 3;
    const xyz2 = new Float32Array(full.xyz.length * 2);
    xyz2.set(full.xyz);
    for (let i = 0; i < full.xyz.length; i += 3) {
      xyz2[full.xyz.length + i] = full.xyz[i] + 500; // shifted copy, disjoint weld cells
      xyz2[full.xyz.length + i + 1] = full.xyz[i + 1];
      xyz2[full.xyz.length + i + 2] = full.xyz[i + 2];
    }
    const idx2 = new Uint32Array(full.idx.length * 2);
    idx2.set(full.idx);
    for (let i = 0; i < full.idx.length; i++) idx2[full.idx.length + i] = full.idx[i] + nV;
    const tris = idx2.length / 3;
    console.log(`[export-perf] crash-demo: ${tris} tris (${((tris * 1.5) / 1e6).toFixed(1)}M expected unique edges)`);
    let crashed: string | null = null;
    try {
      topologyMetric({ vertices: xyz2, indices: idx2 }, WELD_TOL_MM);
    } catch (e) {
      crashed = String(e);
    }
    console.log(`[export-perf] crash-demo: ${crashed ? `CRASHED — ${crashed.slice(0, 120)}` : 'no crash (cap not reached)'}`);
    // Report-only: the demo documents whether the cap fires at this size (17.5M tris > the 16M CAD cap).
    expect(true).toBe(true);
  }, 3_600_000);
});
