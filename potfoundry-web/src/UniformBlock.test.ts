/**
 * UniformBlock Tests
 * Tests for uniform buffer marshalling and offset constants.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  UNIFORM_OFFSETS,
  UNIFORM_FLOAT_COUNT,
  UNIFORM_BUFFER_SIZE,
  createUniformBlock,
  clampNumber,
  sanitizeInt,
  resolveStyleId,
  writeVec3,
  writeMat4,
  // Backward compatibility exports
  CAMERA_EYE_OFFSET,
  CAMERA_MODE_OFFSET,
  VP_MATRIX_OFFSET,
  CAMERA_RIGHT_OFFSET,
  CAMERA_UP_OFFSET,
  CAMERA_FORWARD_OFFSET,
  GRID_FLAG_OFFSET,
  DRAIN_RADIUS_OFFSET,
  SPECULAR_GAIN_OFFSET,
  ROUGHNESS_OFFSET,
  SHOW_INNER_OFFSET,
  BELL_WIDTH_OFFSET,
  SEAM_ANGLE_OFFSET,
  SEAM_RADIUS_OFFSET,
} from './UniformBlock';

// ============================================================================
// OFFSET CONSTANT TESTS
// ============================================================================

describe('UniformBlock Offset Constants', () => {
  it('should define all required offsets', () => {
    expect(UNIFORM_OFFSETS.H).toBe(0);
    expect(UNIFORM_OFFSETS.Rt).toBe(1);
    expect(UNIFORM_OFFSETS.Rb).toBe(2);
    expect(UNIFORM_OFFSETS.StyleId).toBe(7);
    expect(UNIFORM_OFFSETS.DrainRadius).toBe(13);
    expect(UNIFORM_OFFSETS.NTheta).toBe(16);
    expect(UNIFORM_OFFSETS.NZ).toBe(17);
    expect(UNIFORM_OFFSETS.CameraEye).toBe(36);
    expect(UNIFORM_OFFSETS.CameraMode).toBe(39);
    expect(UNIFORM_OFFSETS.ViewProjection).toBe(40);
    expect(UNIFORM_OFFSETS.SeamAngle).toBe(73);
    expect(UNIFORM_OFFSETS.SeamRadius).toBe(75);
  });

  it('should match WGSL shader offset definitions', () => {
    // These offsets MUST match common.wgsl exactly
    expect(UNIFORM_OFFSETS.CameraEye).toBe(36); // CAMERA_EYE_OFFSET : u32 = 36u
    expect(UNIFORM_OFFSETS.CameraMode).toBe(39); // CAMERA_MODE_OFFSET : u32 = 39u
    expect(UNIFORM_OFFSETS.ViewProjection).toBe(40); // VP_MATRIX_OFFSET : u32 = 40u
    expect(UNIFORM_OFFSETS.CameraRight).toBe(56); // CAMERA_RIGHT_OFFSET : u32 = 56u
    expect(UNIFORM_OFFSETS.CameraUp).toBe(60); // CAMERA_UP_OFFSET : u32 = 60u
    expect(UNIFORM_OFFSETS.CameraForward).toBe(64); // CAMERA_FORWARD_OFFSET : u32 = 64u
    expect(UNIFORM_OFFSETS.GridFlag).toBe(68); // GRID_FLAG_OFFSET : u32 = 68u
    expect(UNIFORM_OFFSETS.SpecularGain).toBe(69); // SPECULAR_GAIN_OFFSET : u32 = 69u
    expect(UNIFORM_OFFSETS.Roughness).toBe(70); // ROUGHNESS_OFFSET : u32 = 70u
    expect(UNIFORM_OFFSETS.ShowInner).toBe(71); // SHOW_INNER_OFFSET : u32 = 71u
    expect(UNIFORM_OFFSETS.DrainRadius).toBe(13); // DRAIN_RADIUS_OFFSET : u32 = 13u
  });

  it('should have UNIFORM_FLOAT_COUNT sufficient for all offsets', () => {
    // All offsets should be less than UNIFORM_FLOAT_COUNT
    const maxOffset = Math.max(...Object.values(UNIFORM_OFFSETS));
    expect(UNIFORM_FLOAT_COUNT).toBeGreaterThan(maxOffset);
    expect(UNIFORM_FLOAT_COUNT).toBe(76);
  });

  it('should calculate correct buffer size', () => {
    expect(UNIFORM_BUFFER_SIZE).toBe(UNIFORM_FLOAT_COUNT * 4);
    expect(UNIFORM_BUFFER_SIZE).toBe(304);
  });
});

describe('Backward Compatibility Exports', () => {
  it('should re-export offset constants with matching values', () => {
    expect(CAMERA_EYE_OFFSET).toBe(UNIFORM_OFFSETS.CameraEye);
    expect(CAMERA_MODE_OFFSET).toBe(UNIFORM_OFFSETS.CameraMode);
    expect(VP_MATRIX_OFFSET).toBe(UNIFORM_OFFSETS.ViewProjection);
    expect(CAMERA_RIGHT_OFFSET).toBe(UNIFORM_OFFSETS.CameraRight);
    expect(CAMERA_UP_OFFSET).toBe(UNIFORM_OFFSETS.CameraUp);
    expect(CAMERA_FORWARD_OFFSET).toBe(UNIFORM_OFFSETS.CameraForward);
    expect(GRID_FLAG_OFFSET).toBe(UNIFORM_OFFSETS.GridFlag);
    expect(DRAIN_RADIUS_OFFSET).toBe(UNIFORM_OFFSETS.DrainRadius);
    expect(SPECULAR_GAIN_OFFSET).toBe(UNIFORM_OFFSETS.SpecularGain);
    expect(ROUGHNESS_OFFSET).toBe(UNIFORM_OFFSETS.Roughness);
    expect(SHOW_INNER_OFFSET).toBe(UNIFORM_OFFSETS.ShowInner);
    expect(BELL_WIDTH_OFFSET).toBe(UNIFORM_OFFSETS.BellWidth);
    expect(SEAM_ANGLE_OFFSET).toBe(UNIFORM_OFFSETS.SeamAngle);
    expect(SEAM_RADIUS_OFFSET).toBe(UNIFORM_OFFSETS.SeamRadius);
  });
});

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe('clampNumber', () => {
  it('should return valid numbers unchanged', () => {
    expect(clampNumber(42, 0)).toBe(42);
    expect(clampNumber(-10.5, 0)).toBe(-10.5);
    expect(clampNumber(0, 100)).toBe(0);
  });

  it('should return fallback for invalid inputs', () => {
    expect(clampNumber(NaN, 99)).toBe(99);
    expect(clampNumber(Infinity, 88)).toBe(88);
    expect(clampNumber(-Infinity, 77)).toBe(77);
    expect(clampNumber(undefined, 66)).toBe(66);
    // Note: Number(null) returns 0, which is finite, so it returns 0 not fallback
    expect(clampNumber(null, 55)).toBe(0);
    expect(clampNumber('not-a-number', 44)).toBe(44);
  });

  it('should parse numeric strings', () => {
    expect(clampNumber('123', 0)).toBe(123);
    expect(clampNumber('45.67', 0)).toBe(45.67);
    expect(clampNumber('-89', 0)).toBe(-89);
  });
});

describe('sanitizeInt', () => {
  it('should return valid integers in range', () => {
    expect(sanitizeInt(5, 10, 1)).toBe(5);
    expect(sanitizeInt(100, 50, 1)).toBe(100);
  });

  it('should truncate floats', () => {
    expect(sanitizeInt(5.7, 10, 1)).toBe(5);
    expect(sanitizeInt(9.9, 10, 1)).toBe(9);
  });

  it('should return fallback for out-of-range values', () => {
    expect(sanitizeInt(-5, 10, 1)).toBe(10);
    expect(sanitizeInt(0, 10, 1)).toBe(10);
  });

  it('should handle min constraint', () => {
    expect(sanitizeInt(2, 10, 5)).toBe(10); // 2 < 5 (min), return fallback
    expect(sanitizeInt(5, 10, 5)).toBe(5);
    expect(sanitizeInt(3, 2, 3)).toBe(3); // fallback truncated to min
  });
});

describe('resolveStyleId', () => {
  it('should prioritize numeric styleId in cfg', () => {
    expect(resolveStyleId({ styleId: 5 }, {})).toBe(5);
    expect(resolveStyleId({ styleId: 13 }, { styleId: 0 })).toBe(13);
  });

  it('should fall back to current styleId', () => {
    expect(resolveStyleId({}, { styleId: 8 })).toBe(8);
  });

  it('should clamp negative values to 0', () => {
    expect(resolveStyleId({ styleId: -5 }, {})).toBe(0);
  });

  it('should return 0 for unknown styles', () => {
    expect(resolveStyleId({}, {})).toBe(0);
  });
});

describe('writeVec3', () => {
  it('should write 3 components to buffer', () => {
    const buffer = new Float32Array(10);
    writeVec3(buffer, 3, [1.5, 2.5, 3.5]);
    expect(buffer[3]).toBe(1.5);
    expect(buffer[4]).toBe(2.5);
    expect(buffer[5]).toBe(3.5);
  });
});

describe('writeMat4', () => {
  it('should write 16 components to buffer', () => {
    const buffer = new Float32Array(20);
    // Column-major identity matrix
    const mat: [number, number, number, number,
                number, number, number, number,
                number, number, number, number,
                number, number, number, number] = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    writeMat4(buffer, 2, mat);
    // Verify first element (index 0 of mat at offset 2)
    expect(buffer[2]).toBe(1);
    expect(buffer[3]).toBe(0);
    // mat[5] = 1 at offset 2+5=7
    expect(buffer[7]).toBe(1);
    // mat[10] = 1 at offset 2+10=12
    expect(buffer[12]).toBe(1);
    // mat[15] = 1 at offset 2+15=17
    expect(buffer[17]).toBe(1);
  });
});

// ============================================================================
// UNIFORMBLOCK INSTANCE TESTS
// ============================================================================

describe('createUniformBlock', () => {
  it('should create buffer with correct size', () => {
    const block = createUniformBlock();
    expect(block.buffer.length).toBe(76);
    expect(block.buffer.byteLength).toBe(304);
  });

  it('should create buffer with custom size', () => {
    const block = createUniformBlock(256);
    expect(block.buffer.length).toBe(64);
    expect(block.buffer.byteLength).toBe(256);
  });

  it('should initialize buffer to zeros', () => {
    const block = createUniformBlock();
    for (let i = 0; i < block.buffer.length; i++) {
      expect(block.buffer[i]).toBe(0);
    }
  });
});

describe('UniformBlock populateGeometry', () => {
  let block: ReturnType<typeof createUniformBlock>;

  beforeEach(() => {
    block = createUniformBlock();
  });

  it('should populate core geometry params', () => {
    block.populateGeometry(
      { H: 150, Rt: 80, Rb: 50, expn: 1.2 },
      {}
    );
    expect(block.buffer[UNIFORM_OFFSETS.H]).toBe(150);
    expect(block.buffer[UNIFORM_OFFSETS.Rt]).toBe(80);
    expect(block.buffer[UNIFORM_OFFSETS.Rb]).toBe(50);
    // Float32Array has precision limitations
    expect(block.buffer[UNIFORM_OFFSETS.Expn]).toBeCloseTo(1.2, 5);
  });

  it('should use default values for missing params', () => {
    block.populateGeometry({}, {});
    expect(block.buffer[UNIFORM_OFFSETS.H]).toBe(120); // default
    expect(block.buffer[UNIFORM_OFFSETS.Rt]).toBe(70); // default
    expect(block.buffer[UNIFORM_OFFSETS.Rb]).toBe(45); // default
    expect(block.buffer[UNIFORM_OFFSETS.Expn]).toBe(1); // default
  });

  it('should populate spin params', () => {
    block.populateGeometry(
      { spinTurns: 3.5, spinPhase: 0.25, spinCurve: 1.5 },
      {}
    );
    expect(block.buffer[UNIFORM_OFFSETS.SpinTurns]).toBe(3.5);
    expect(block.buffer[UNIFORM_OFFSETS.SpinPhase]).toBe(0.25);
    expect(block.buffer[UNIFORM_OFFSETS.SpinCurve]).toBe(1.5);
  });

  it('should populate style ID', () => {
    block.populateGeometry({ styleId: 5 }, {});
    expect(block.buffer[UNIFORM_OFFSETS.StyleId]).toBe(5);
  });

  it('should convert seam angle from degrees to radians', () => {
    block.populateGeometry({ seamAngle: 45 }, {});
    const expected = (45 * Math.PI) / 180.0;
    expect(block.buffer[UNIFORM_OFFSETS.SeamAngle]).toBeCloseTo(expected, 6);
  });

  it('should ensure drain radius is at least 0.5', () => {
    block.populateGeometry({ drainRadius: 0.1 }, {});
    expect(block.buffer[UNIFORM_OFFSETS.DrainRadius]).toBeGreaterThanOrEqual(0.5);
  });
});

describe('UniformBlock populateResolution', () => {
  let block: ReturnType<typeof createUniformBlock>;

  beforeEach(() => {
    block = createUniformBlock();
  });

  it('should populate resolution params', () => {
    block.populateResolution({ nTheta: 128, nZ: 64 }, {}, false);
    expect(block.buffer[UNIFORM_OFFSETS.NTheta]).toBe(128);
    expect(block.buffer[UNIFORM_OFFSETS.NZ]).toBe(64);
    expect(block.buffer[UNIFORM_OFFSETS.DebugFlag]).toBe(0);
  });

  it('should set debug flag when active', () => {
    block.populateResolution({ nTheta: 64, nZ: 32 }, {}, true);
    expect(block.buffer[UNIFORM_OFFSETS.DebugFlag]).toBe(1);
  });

  it('should clamp resolution to valid range', () => {
    block.populateResolution({ nTheta: 2000, nZ: 5000 }, {}, false);
    expect(block.buffer[UNIFORM_OFFSETS.NTheta]).toBe(1024); // max
    expect(block.buffer[UNIFORM_OFFSETS.NZ]).toBe(1024); // max
  });

  it('should use minimum values for too-low inputs', () => {
    // sanitizeInt returns fallback when value < min, so for nTheta=1 < min=3 → fallback=64
    // nZ=0 < min=2 → fallback=32
    block.populateResolution({ nTheta: 1, nZ: 0 }, {}, false);
    // These should clamp via Max to their minimums after sanitizeInt
    expect(block.buffer[UNIFORM_OFFSETS.NTheta]).toBe(64); // fallback when too low
    expect(block.buffer[UNIFORM_OFFSETS.NZ]).toBe(32); // fallback when too low
  });
});

describe('UniformBlock populateCamera', () => {
  let block: ReturnType<typeof createUniformBlock>;

  const mockCameraRig = {
    eye: [0, 0, 100] as [number, number, number],
    mode: 'perspective' as const,
    near: 0.1,
    far: 1000,
    fov: 0.785,
    viewProjection: [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ] as [number, number, number, number,
          number, number, number, number,
          number, number, number, number,
          number, number, number, number],
    basis: {
      right: [1, 0, 0] as [number, number, number],
      up: [0, 1, 0] as [number, number, number],
      forward: [0, 0, -1] as [number, number, number],
    },
  };

  beforeEach(() => {
    block = createUniformBlock();
  });

  it('should populate camera eye position', () => {
    block.populateCamera({ rotX: 0, rotY: 0, zoom: 1, canvasAspect: 1.5 }, mockCameraRig, 1.55);
    expect(block.buffer[UNIFORM_OFFSETS.CameraEye + 0]).toBe(0);
    expect(block.buffer[UNIFORM_OFFSETS.CameraEye + 1]).toBe(0);
    expect(block.buffer[UNIFORM_OFFSETS.CameraEye + 2]).toBe(100);
  });

  it('should populate camera mode', () => {
    block.populateCamera({}, mockCameraRig, 1.55);
    expect(block.buffer[UNIFORM_OFFSETS.CameraMode]).toBe(1); // perspective

    const orthoRig = { ...mockCameraRig, mode: 'ortho' as const };
    block.populateCamera({}, orthoRig, 1.55);
    expect(block.buffer[UNIFORM_OFFSETS.CameraMode]).toBe(0);
  });

  it('should populate view-projection matrix', () => {
    block.populateCamera({}, mockCameraRig, 1.55);
    // Identity matrix values at specific positions
    expect(block.buffer[UNIFORM_OFFSETS.ViewProjection + 0]).toBe(1);
    expect(block.buffer[UNIFORM_OFFSETS.ViewProjection + 5]).toBe(1);
    expect(block.buffer[UNIFORM_OFFSETS.ViewProjection + 10]).toBe(1);
    expect(block.buffer[UNIFORM_OFFSETS.ViewProjection + 15]).toBe(1);
  });

  it('should populate camera basis vectors', () => {
    block.populateCamera({}, mockCameraRig, 1.55);
    // Right vector
    expect(block.buffer[UNIFORM_OFFSETS.CameraRight + 0]).toBe(1);
    expect(block.buffer[UNIFORM_OFFSETS.CameraRight + 1]).toBe(0);
    expect(block.buffer[UNIFORM_OFFSETS.CameraRight + 2]).toBe(0);
    // Up vector
    expect(block.buffer[UNIFORM_OFFSETS.CameraUp + 0]).toBe(0);
    expect(block.buffer[UNIFORM_OFFSETS.CameraUp + 1]).toBe(1);
    expect(block.buffer[UNIFORM_OFFSETS.CameraUp + 2]).toBe(0);
    // Forward vector
    expect(block.buffer[UNIFORM_OFFSETS.CameraForward + 0]).toBe(0);
    expect(block.buffer[UNIFORM_OFFSETS.CameraForward + 1]).toBe(0);
    expect(block.buffer[UNIFORM_OFFSETS.CameraForward + 2]).toBe(-1);
  });
});

describe('UniformBlock populateLighting', () => {
  let block: ReturnType<typeof createUniformBlock>;

  beforeEach(() => {
    block = createUniformBlock();
  });

  it('should populate lighting params with defaults', () => {
    block.populateLighting({});
    expect(block.buffer[UNIFORM_OFFSETS.Ambient]).toBe(0);
    expect(block.buffer[UNIFORM_OFFSETS.Diffuse]).toBe(0);
    expect(block.buffer[UNIFORM_OFFSETS.Fresnel]).toBeCloseTo(0.25, 5);
    // Float32Array precision
    expect(block.buffer[UNIFORM_OFFSETS.SpecularGain]).toBeCloseTo(0.4, 5);
    expect(block.buffer[UNIFORM_OFFSETS.Roughness]).toBeCloseTo(0.45, 5);
  });

  it('should clamp specular to 0-1 range', () => {
    block.populateLighting({ specular: 1.5 });
    expect(block.buffer[UNIFORM_OFFSETS.SpecularGain]).toBe(1);

    block.populateLighting({ specular: -0.5 });
    expect(block.buffer[UNIFORM_OFFSETS.SpecularGain]).toBe(0);
  });

  it('should clamp roughness to 0.02-1 range', () => {
    block.populateLighting({ roughness: 0.01 });
    // Float32Array precision
    expect(block.buffer[UNIFORM_OFFSETS.Roughness]).toBeCloseTo(0.02, 5);

    block.populateLighting({ roughness: 1.5 });
    expect(block.buffer[UNIFORM_OFFSETS.Roughness]).toBe(1);
  });
});

describe('UniformBlock populateFeatureFlags', () => {
  let block: ReturnType<typeof createUniformBlock>;

  beforeEach(() => {
    block = createUniformBlock();
  });

  it('should enable showInner by default', () => {
    block.populateFeatureFlags({}, {});
    expect(block.buffer[UNIFORM_OFFSETS.ShowInner]).toBe(1);
  });

  it('should disable showInner when explicitly false', () => {
    block.populateFeatureFlags({ showInner: false }, {});
    expect(block.buffer[UNIFORM_OFFSETS.ShowInner]).toBe(0);
  });

  it('should set grid flag from state', () => {
    block.populateFeatureFlags({}, { showGrid: true });
    expect(block.buffer[UNIFORM_OFFSETS.GridFlag]).toBe(1);

    block.populateFeatureFlags({}, { showGrid: false });
    expect(block.buffer[UNIFORM_OFFSETS.GridFlag]).toBe(0);
  });
});

describe('UniformBlock getDiagnostics', () => {
  let block: ReturnType<typeof createUniformBlock>;

  beforeEach(() => {
    block = createUniformBlock();
  });

  it('should return initial diagnostics', () => {
    const diag = block.getDiagnostics();
    expect(diag.styleId).toBe(0);
    expect(diag.resolution).toEqual([0, 0]);
    expect(diag.cameraEye).toEqual([0, 0, 0]);
    expect(diag.cameraMode).toBe('ortho');
    expect(diag.hadInvalidValues).toBe(false);
  });

  it('should return updated diagnostics after population', () => {
    block.populateGeometry({ styleId: 13 }, {});
    block.populateResolution({ nTheta: 256, nZ: 128 }, {}, false);

    const diag = block.getDiagnostics();
    expect(diag.styleId).toBe(13);
    expect(diag.resolution).toEqual([256, 128]);
  });
});
