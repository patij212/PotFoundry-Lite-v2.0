/**
 * verify_crossStyleFidelity.test.ts — #1 (priority): cross-style surface-fidelity
 * sweep. The dominant, refinement-immune fidelity error (#5) is the bilinear-256
 * vertex-placement flattening, which scales with each style's feature SHARPNESS.
 * This measures it for EVERY style at its default config, so we know which styles
 * deviate from the true surface and by how much (the "full resolution" the user
 * asked for — first pass: the dominant error, default-relief config).
 *
 * Faithfulness: drives each real CPU StyleFunction (geometry/styles.ts) with `{}`
 * opts => its own DEFAULT_* fallbacks (the registry's snake_case keys do NOT map
 * to the camelCase opts the functions read; `{}` is the only clean generic call).
 * True surface = the CPU style radius (the math model; matches the GPU/packed
 * sampler to ~um per the accuracy audit). Production proxy = bilinear-256 sampler
 * built from that true surface (DENSE_RES=256), and bilinear-1024 (the fix lever).
 *
 * Reports per style: max + p99 deviation (mm) of the bilinear sampler from the
 * true surface, sorted worst-first. Pure CPU, read-only, no production change.
 */
import { describe, it, expect } from 'vitest';
import { STYLE_FUNCTIONS, type StyleFunction } from '../geometry/styles';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';

const H = 120, Rt = 70, Rb = 45, expn = 1.1;
type V3 = readonly [number, number, number];

function exactPos(fn: StyleFunction, u: number, t: number): V3 {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  const theta = 2 * Math.PI * u;
  const z = tc * H;
  const r0 = Rb + (Rt - Rb) * Math.pow(tc, expn);
  let r = fn(theta, z, r0, H, {});
  if (!Number.isFinite(r)) r = r0;
  return [r * Math.cos(theta), r * Math.sin(theta), z];
}
function buildBilinear(fn: StyleFunction, res: number): GpuSurfaceSampler {
  const grid = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const tVal = row / (res - 1);
    for (let col = 0; col < res; col++) {
      const q = exactPos(fn, col / res, tVal);
      grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2];
    }
  }
  return new GpuSurfaceSampler(grid, res, res);
}
function devVsBilinear(fn: StyleFunction, bi: GpuSurfaceSampler): { max: number; p99: number } {
  const all: number[] = [];
  for (let it = 0; it <= 160; it++) {
    const t = it / 160;
    for (let iu = 0; iu < 768; iu++) {
      const u = iu / 768;
      const a = exactPos(fn, u, t);
      const b = bi.position(u, t) as V3;
      all.push(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
  }
  all.sort((x, y) => x - y);
  return { max: all[all.length - 1], p99: all[Math.floor(0.99 * all.length)] };
}

describe('VERIFY #1 cross-style surface fidelity (bilinear vertex placement vs true surface)', () => {
  it('sweeps every style: deviation of the production-class sampler from the true surface', () => {
    const rows: Array<{ id: string; max256: number; p99_256: number; max1024: number }> = [];
    for (const [id, fn] of Object.entries(STYLE_FUNCTIONS) as Array<[string, StyleFunction]>) {
      let d256, d1024;
      try {
        d256 = devVsBilinear(fn, buildBilinear(fn, 256));
        d1024 = devVsBilinear(fn, buildBilinear(fn, 1024));
      } catch {
        rows.push({ id, max256: -1, p99_256: -1, max1024: -1 });
        continue;
      }
      rows.push({ id, max256: d256.max, p99_256: d256.p99, max1024: d1024.max });
    }
    rows.sort((a, b) => b.max256 - a.max256);

    /* eslint-disable no-console */
    console.log('\n===== #1 CROSS-STYLE SURFACE FIDELITY (deviation of bilinear sampler from true surface, default config) =====');
    console.log('  style                         | bi256 max | bi256 p99 | bi1024 max   (mm)');
    for (const r of rows) {
      console.log(`  ${r.id.padEnd(28)} | ${r.max256.toFixed(3).padStart(8)} | ${r.p99_256.toFixed(3).padStart(8)} | ${r.max1024.toFixed(3).padStart(8)}`);
    }
    const over = rows.filter((r) => r.max256 > 0.1).length;
    console.log(`  => ${over}/${rows.length} styles exceed 0.1mm surface deviation at DENSE_RES=256 (default config); the fix is exact/denser vertex eval, worst at sharp-feature styles.`);
    console.log('===========================================================================================================\n');
    /* eslint-enable no-console */
    expect(rows.length).toBeGreaterThan(10);
  }, 180000);
});
