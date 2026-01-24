
// ============================================================================
// Preview Uniforms & Accessors
// ============================================================================

struct PreviewParamBlock {
  values: array<vec4<f32>, 19>, // 19 x 4 = 76 floats to match UNIFORM_FLOAT_COUNT
};

@group(0) @binding(0) var<uniform> PreviewParams : PreviewParamBlock;
@group(0) @binding(1) var<uniform> uC1 : vec4<f32>;
@group(0) @binding(2) var<uniform> uC2 : vec4<f32>;
@group(0) @binding(3) var<uniform> uC3 : vec4<f32>;
@group(0) @binding(5) var<uniform> uBg1 : vec4<f32>;
@group(0) @binding(6) var<uniform> uBg2 : vec4<f32>;
@group(0) @binding(7) var<uniform> uBg3 : vec4<f32>;

struct StyleParamBlock {
  // Uniform buffer alignment: array<vec4<f32>, 12> fits significantly within limit
  values: array<vec4<f32>, 12>,
};

// OPTIMIZATION: Use uniform buffer instead of storage buffer for speed
@group(0) @binding(4) var<uniform> StyleParams : StyleParamBlock;

fn style_param(i: u32) -> f32 {
  if (i >= STYLE_PARAM_CAPACITY) {
    return 0.0;
  }
  let elem = i / 4u;
  let comp = i % 4u;
  if (elem >= 12u) {
    return 0.0;
  }
  let v = StyleParams.values[elem];
  if (comp == 0u) { return v.x; }
  else if (comp == 1u) { return v.y; }
  else if (comp == 2u) { return v.z; }
  return v.w;
}

fn style_params_active() -> bool {
  return style_param(STYLE_PARAM_CAPACITY - 1u) > 0.5;
}

fn getf(i: u32) -> f32 {
  let elem = i / 4u;
  let comp = i % 4u;
  // Support 76 floats = 19 vec4 elements (indices 0-75)
  if (elem >= 19u) {
    return 0.0;
  }
  let v = PreviewParams.values[elem];
  if (comp == 0u) { return v.x; }
  else if (comp == 1u) { return v.y; }
  else if (comp == 2u) { return v.z; }
  return v.w;
}

fn vp_matrix() -> mat4x4<f32> {
  let c0 = vec4<f32>(
    getf(VP_MATRIX_OFFSET + 0u),
    getf(VP_MATRIX_OFFSET + 1u),
    getf(VP_MATRIX_OFFSET + 2u),
    getf(VP_MATRIX_OFFSET + 3u)
  );
  let c1 = vec4<f32>(
    getf(VP_MATRIX_OFFSET + 4u),
    getf(VP_MATRIX_OFFSET + 5u),
    getf(VP_MATRIX_OFFSET + 6u),
    getf(VP_MATRIX_OFFSET + 7u)
  );
  let c2 = vec4<f32>(
    getf(VP_MATRIX_OFFSET + 8u),
    getf(VP_MATRIX_OFFSET + 9u),
    getf(VP_MATRIX_OFFSET + 10u),
    getf(VP_MATRIX_OFFSET + 11u)
  );
  let c3 = vec4<f32>(
    getf(VP_MATRIX_OFFSET + 12u),
    getf(VP_MATRIX_OFFSET + 13u),
    getf(VP_MATRIX_OFFSET + 14u),
    getf(VP_MATRIX_OFFSET + 15u)
  );
  return mat4x4<f32>(c0, c1, c2, c3);
}
