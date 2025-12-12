import { describe, test, expect } from 'vitest';
import { mount } from '../../webgpu_core';
import { createCanvas } from '../test_helpers';

describe('WebGPU performance micro-benchmark', () => {
  test('stable camera state yields minimal uniform writes and rig rebuilds', async () => {
    const canvas = createCanvas();
    const mountId = 'perf-test-canvas';
    // mount returns a controller; ensure our debug global is present
    const ctrl = await mount({
      canvas,
      canvasId: mountId,
      initialParams: {},
      emit: null,
      debugMode: true,
    });
    if (!ctrl) {
      // WebGPU not available in this test environment (Node). Skip asserts.
      expect(ctrl).toBeNull();
      return;
    }
    // Ensure debug structure exists.
    const debug = (globalThis as any).__pf_webgpu_mounts?.[mountId]?.debug;
    expect(debug).toBeDefined();
    // Reset counters
    debug.metrics.uniformWrites = 0;
    debug.metrics.rigRebuilds = 0;
    // Simulate 60 stable frames using the controller's update logic
    for (let i = 0; i < 60; i += 1) {
      // No param change; invoke controller update hook indirectly by simulating a stale frame
      // In our test env, we cannot render, but we can call update via emitting a no-op param
      await ctrl.updateParams({});
    }
    // After steady frames, expect limited writes. Thresholds are conservative.
    expect(debug.metrics.rigRebuilds).toBeLessThanOrEqual(2);
    expect(debug.metrics.uniformWrites).toBeLessThanOrEqual(60);
    // cleanup
    ctrl.dispose();
  });
});

