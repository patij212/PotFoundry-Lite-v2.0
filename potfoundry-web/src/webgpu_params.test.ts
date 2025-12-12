import { fillGeometryBuffer } from './webgpu_geometry';
import { expect, test } from 'vitest';
import { WebGPUParams } from './types';

test('fillGeometryBuffer populates twist and resolution parameters correctly', () => {
    const f32 = new Float32Array(100);
    const cfg: WebGPUParams = {
        H: 200,
        Rt: 80,
        Rb: 60,
        expn: 1,
        spin_turns: 2.5,
        spin_phase: 0.5,
        spin_curve: 1.2,
        cells_x: 250,
        cells_outer_y: 150,
        inner_y: 150,
        bottom_rings: 30,
        rim_rings: 15,
        sceneRadius: 300
    };
    const current: WebGPUParams = {};

    fillGeometryBuffer(f32, cfg, current);

    // Verify twist parameters
    expect(f32[4]).toBe(2.5); // spin_turns
    expect(f32[5]).toBe(0.5); // spin_phase
    expect(f32[6]).toBe(1.2); // spin_curve
});

test('fillGeometryBuffer populates resolution parameters correctly', () => {
    const f32 = new Float32Array(100);
    const cfg: WebGPUParams = {
        cells_x: 250,
        cells_outer_y: 150,
    };
    const current: WebGPUParams = {};

    fillGeometryBuffer(f32, cfg, current);

    expect(f32[16]).toBe(250); // cells_x
    expect(f32[17]).toBe(150); // cells_outer_y
});

test('fillGeometryBuffer populates topology parameters correctly', () => {
    const f32 = new Float32Array(100);
    const cfg: WebGPUParams = {
        inner_y: 150,
        bottom_rings: 30,
        rim_rings: 15,
        sceneRadius: 300
    };
    const current: WebGPUParams = {};

    fillGeometryBuffer(f32, cfg, current);

    expect(f32[27]).toBe(150); // inner_y
    expect(f32[28]).toBe(30);  // bottom_rings
    expect(f32[30]).toBe(15);  // rim_rings
});

test('fillGeometryBuffer uses correct defaults when parameters missing', () => {
    const f32 = new Float32Array(100);
    const cfg: WebGPUParams = { H: 100 };
    const current: WebGPUParams = {};

    fillGeometryBuffer(f32, cfg, current);

    // Verify twist defaults
    expect(f32[4]).toBe(0); // spin_turns default

    // Verify resolution defaults
    expect(f32[16]).toBe(200); // default cells_x
    expect(f32[17]).toBe(100); // default cells_outer_y
});
