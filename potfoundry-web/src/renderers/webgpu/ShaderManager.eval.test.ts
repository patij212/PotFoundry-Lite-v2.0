import { describe, it, expect } from 'vitest';
import { ShaderManager } from './ShaderManager';

describe('getEvalPositionWGSL', () => {
  it('is a compute shader that calls surface_point once and writes positions', () => {
    const wgsl = ShaderManager.getInstance().getEvalPositionWGSL();
    expect(wgsl).toMatch(/@compute\s+@workgroup_size\(64\)\s+fn\s+eval_pos/);
    // universal dispatch present (all styles reachable through style_radius)
    expect(wgsl).toContain('fn style_radius(');
    // writes a position storage buffer
    expect(wgsl).toMatch(/var<storage,\s*read_write>\s+\w+\s*:\s*array<vec3<f32>>/);
    // single surface_point call in the entry (position only — no normal re-eval)
    const body = wgsl.slice(wgsl.indexOf('fn eval_pos'));
    expect((body.match(/surface_point\(/g) || []).length).toBe(1);
    expect(body).not.toContain('surface_normal(');
  });
});

describe('getNeighborNormalWGSL', () => {
  it('is a style-free compute shader deriving normals from grid neighbors', () => {
    const wgsl = ShaderManager.getInstance().getNeighborNormalWGSL();
    expect(wgsl).toMatch(/@compute\s+@workgroup_size\(64\)\s+fn\s+norm_from_nbr/);
    // must NOT depend on any style code (that is the whole point — compiles once)
    expect(wgsl).not.toContain('style_radius');
    expect(wgsl).not.toContain('surface_point');
    // produces a normal storage buffer
    expect(wgsl).toMatch(/var<storage,\s*read_write>\s+\w+\s*:\s*array<vec3<f32>>/);
  });
});

describe('getInstantPreviewWGSL', () => {
  it('is a style-independent render shader reading position + normal from buffers', () => {
    const wgsl = ShaderManager.getInstance().getInstantPreviewWGSL();
    expect(wgsl).toContain('fn vs_main');
    expect(wgsl).toContain('fn fs_main');
    // pot branch reads the eval buffers
    expect(wgsl).toContain('pf_pos_in[local_vid]');
    expect(wgsl).toContain('pf_norm_in[local_vid]');
    // style-independent: no surface eval, no dispatch => compiles once
    expect(wgsl).not.toContain('surface_point(');
    expect(wgsl).not.toContain('surface_normal(');
    expect(wgsl).not.toContain('style_radius');
    // the surface-evaluating wireframe entries are excluded
    expect(wgsl).not.toContain('fn vs_wireframe');
  });
});
