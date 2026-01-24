// pot_export.wgsl - Compute shader for generating pot geometry
// Optimized for strict alignment (vec4) and correct winding.

// ============================================================================
// Uniforms & Constants
// ============================================================================

struct ExportUniforms {
  // 16-byte aligned chunks to match Float32Array layout exactly
  chunk0: vec4<f32>, // x:H, y:Rt, z:Rb, w:tWall
  chunk1: vec4<f32>, // x:tBottom, y:rDrain, z:expn, w:nTheta
  chunk2: vec4<f32>, // x:nZ, y:styleId, z:spinTurns, w:spinPhase
  chunk3: vec4<f32>, // x:spinCurve, y:bellAmp, z:bellCenter, w:bellWidth
  chunk4: vec4<f32>, // x:seamAngle, y:startZ (tile), z:endZ (tile), w:tileFlags (1=first,2=last,3=both)
}

// Tile helper functions
fn get_tile_start_z() -> u32 {
  return u32(uniforms.chunk4.y);
}
fn get_tile_end_z() -> u32 {
  return u32(uniforms.chunk4.z);
}
fn is_first_tile() -> bool {
  let flags = u32(uniforms.chunk4.w);
  return (flags & 1u) != 0u;
}
fn is_last_tile() -> bool {
  let flags = u32(uniforms.chunk4.w);
  return (flags & 2u) != 0u;
}
fn is_tiled_mode() -> bool {
  // If startZ > 0 or endZ < nZ, we're in tiled mode
  let startZ = get_tile_start_z();
  let endZ = get_tile_end_z();
  let nZ = u32(uniforms.chunk2.x);
  return startZ > 0u || endZ < nZ;
}

@group(0) @binding(0) var<uniform> uniforms: ExportUniforms;
@group(0) @binding(1) var<storage, read> style_params: array<f32>;
@group(0) @binding(2) var<storage, read_write> vertices: array<f32>; // [x,z,y, x,z,y...] (Packed)
@group(0) @binding(3) var<storage, read_write> indices: array<u32>;
@group(0) @binding(4) var<storage, read_write> lod_flags: array<u32>;
@group(0) @binding(5) var<storage, read_write> atomic_counter: atomic<u32>;

// Helper to get vertex at grid index
fn get_v(effPath: u32, offset: u32) -> vec3<f32> {
   if (offset >= arrayLength(&vertices) / 3u) { return vec3<f32>(0.0); }
   let base = offset * 3u;
   return vec3<f32>(vertices[base], vertices[base+1u], vertices[base+2u]);
}

@compute @workgroup_size(64)
fn analyze_lod(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // 2D Dispatch Logic
  let stride = 65535u * 64u;
  let idx = global_id.x + global_id.y * stride; // This is the QUAD index (effectively)
  
  // Need to map idx to (theta, z) grid coordinates
  // But wait, `calc_indices` logic maps idx -> global quad index -> (qi, qj)
  // We should reuse that logic.
  
  let nTheta = u32(uniforms.chunk1.w);
  let nZ = u32(uniforms.chunk2.x);
  
  // Calculate which quad we are in
  // NOTE: This assumes idx maps 1:1 to triangles? No, calc_indices maps to *triangles*.
  // analyze_lod should probably map to *vertices* or *quads*.
  // Let's analyze per VERTEX (as the flag is per vertex).
  // Meaning check if the vertex is in a flat region.
  
  // ACTUALLY: The 2x2 Stitching requires flags per 2x2 PATCH (Quad).
  // But lod_flags is sized to vertexCount?
  // Let's simplify: 1 flag per QUAD.
  // Size of buffer should be quadCount = nTheta * nZ.
  // ExportComputer made it vertexCount size. That's fine, we'll use first nTheta*nZ entries.
  
  if (idx >= nTheta * nZ) { return; }
  
  // Decode Grid Coords
  let qi = idx / nTheta; // Z-row
  let qj = idx % nTheta; // Theta-col
  
  // We only optimize WALLS (Outer/Inner). Rim/Drain usually need detail.
  // Although the algorithm is generic.
  
  // Let's implement generic coplanarity check.
  // Get 4 corners of the quad
  // v00 -- v01
  //  |      |
  // v10 -- v11
  
  // We need to look up vertex indices.
  // Outer Wall start = 0.
  // This logic is tricky because vertices are laid out flat.
  // Let's just focus on Outer Wall for now to prove concept.
  
  // Check if we are in Outer Wall range
  let isOuter = true; // For now apply to everything, but vertex lookup differs.
  
  // Vertex Offsets
  let vOffOuter = 0u;
  // let vOffInner = nTheta * (nZ + 1u);
  
  // Indices
  let row0 = vOffOuter + qi * nTheta;
  let row1 = vOffOuter + (qi + 1u) * nTheta;
  let qjn = (qj + 1u) % nTheta;
  
  let i00 = row0 + qj;
  let i01 = row0 + qjn;
  let i10 = row1 + qj;
  let i11 = row1 + qjn;
  
  let v00 = vec3<f32>(vertices[i00*3u], vertices[i00*3u+1u], vertices[i00*3u+2u]);
  let v01 = vec3<f32>(vertices[i01*3u], vertices[i01*3u+1u], vertices[i01*3u+2u]);
  let v10 = vec3<f32>(vertices[i10*3u], vertices[i10*3u+1u], vertices[i10*3u+2u]);
  let v11 = vec3<f32>(vertices[i11*3u], vertices[i11*3u+1u], vertices[i11*3u+2u]);
  
  // Compare normals of the two potential triangles
  // T1: v00, v10, v11
  // T2: v00, v11, v01
  
  let n1 = cross(v10 - v00, v11 - v00);
  let n2 = cross(v11 - v00, v01 - v00);
  
  // If dot(n1, n2) is nearly 1 (aligned), it's flat.
  // Normalize
  let ln1 = length(n1);
  let ln2 = length(n2);
  
  if (ln1 < 1e-6 || ln2 < 1e-6) {
     lod_flags[idx] = 1u; // Degenerate counts as flat
     return;
  }
  
  let dn1 = n1 / ln1;
  let dn2 = n2 / ln2;
  
  let alignment = dot(dn1, dn2);
  
  if (alignment > 0.9) { // ~25 degrees - Relaxed again for Hybrid Strategy
     lod_flags[idx] = 1u; // Optimize candidate (2x2)
  } else {
     lod_flags[idx] = 0u; // Detail
  }
}

@group(0) @binding(6) var<storage, read_write> lod_flags_temp: array<u32>;
@group(0) @binding(7) var<storage, read> z_lut: array<f32>;

// ============================================================================
// Dilation Pass: Extend Protected (Detailed) Area
// ============================================================================
// Reads lod_flags, Writes lod_flags_temp.
// If any neighbor is Detailed (0u), self becomes Detailed (0u).
// Creates a 1-quad buffer zone around detailed features.

@compute @workgroup_size(64)
fn dilate_lod(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let stride = 65535u * 64u;
  let idx = global_id.x + global_id.y * stride;
  
  let nTheta = u32(uniforms.chunk1.w);
  let nZ = u32(uniforms.chunk2.x);
  
  if (idx >= nTheta * nZ) { return; }
  
  // If already detailed, stay detailed
  let currentFlag = lod_flags[idx];
  
  // Force Tile Boundaries (Top/Bottom) to be Detailed
  // This ensures seamless stitching between tiles in Adaptive Mode
  let qi = i32(idx / nTheta);
  if (qi == 0 || qi == i32(nZ) - 1) {
      lod_flags_temp[idx] = 0u;
      return;
  }

  if (currentFlag == 0u) {
      lod_flags_temp[idx] = 0u;
      return;
  }
  
  // Check 8 neighbors
  let qj = i32(idx % nTheta);
  
  var becomeDetailed = false;
  
  for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
          if (dx == 0 && dy == 0) { continue; }
          
          let ni = qi + dy;
          let nj = qj + dx;
          
          // Clamp Rows
          if (ni >= 0 && ni < i32(nZ)) {
              // Wrap Cols
              // Note: nj can be -1. (u32(-1) + N) % N works?
              // Safer: ((nj % N) + N) % N
              let col = u32((nj + i32(nTheta)) % i32(nTheta));
              let row = u32(ni);
              
              let nIdx = row * nTheta + col;
              if (lod_flags[nIdx] == 0u) {
                  becomeDetailed = true;
              }
          }
      }
      if (becomeDetailed) { break; }
  }
  
  if (becomeDetailed) {
      lod_flags_temp[idx] = 0u;
  } else {
      lod_flags_temp[idx] = currentFlag;
  }
}
// This kernel runs AFTER analyze_lod and vertices are computed.
// It checks if 4 adjacent 2x2 quads can be merged into a single 4x4 block.
// Uses ultra-strict 1μm edge / 2μm surface tolerance.
// Sets lod_flags to 2u for successful 4x4 candidates.

@compute @workgroup_size(64)
fn analyze_lod_4x4(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let stride = 65535u * 64u;
  let idx = global_id.x + global_id.y * stride;
  
  let nTheta = u32(uniforms.chunk1.w);
  let nZ = u32(uniforms.chunk2.x);
  
  // We process 4x4 blocks, so divide grid by 4
  let blocksTheta = nTheta / 4u;
  let blocksZ = nZ / 4u;
  let totalBlocks = blocksTheta * blocksZ;
  
  if (idx >= totalBlocks) { return; }
  
  // Decode 4x4 block coords
  let bi = idx / blocksTheta; // Z-block
  let bj = idx % blocksTheta; // Theta-block
  
  // Map to quad indices (top-left of each 2x2 in the 4x4)
  let qi = bi * 4u;
  let qj = bj * 4u;
  
  // Check boundary - need 5 vertex rows/cols (indices 0,1,2,3,4)
  if (qi + 4u > nZ || qj + 4u > nTheta) { return; }
  
  // Check if all 4 constituent 2x2 blocks are marked as flat (flag == 1u)
  let q00 = (qi + 0u) * nTheta + (qj + 0u);
  let q01 = (qi + 0u) * nTheta + (qj + 2u);
  let q10 = (qi + 2u) * nTheta + (qj + 0u);
  let q11 = (qi + 2u) * nTheta + (qj + 2u);
  
  if (lod_flags[q00] != 1u || lod_flags[q01] != 1u || 
      lod_flags[q10] != 1u || lod_flags[q11] != 1u) {
      return; // Not all 2x2 blocks are flat candidates
  }
  
  // Ultra-strict geometric validation for 4x4 merge
  // Get corner vertices of the 4x4 block
  let vOffOuter = 0u;
  let r0 = vOffOuter + qi * nTheta;
  let r4 = vOffOuter + (qi + 4u) * nTheta;
  
  let c0 = qj;
  let c4 = (qj + 4u) % nTheta;
  
  let i00 = r0 + c0;
  let i04 = r0 + c4;
  let i40 = r4 + c0;
  let i44 = r4 + c4;
  
  // Mid-edge vertices for linearity check
  let c2 = (qj + 2u) % nTheta;
  let r2 = vOffOuter + (qi + 2u) * nTheta;
  let i02 = r0 + c2;  // Top edge midpoint
  let i20 = r2 + c0;  // Left edge midpoint
  let i24 = r2 + c4;  // Right edge midpoint
  let i42 = r4 + c2;  // Bottom edge midpoint
  let i22 = r2 + c2;  // Center
  
  // Load all vertex positions
  let v00 = vec3<f32>(vertices[i00*3u], vertices[i00*3u+1u], vertices[i00*3u+2u]);
  let v04 = vec3<f32>(vertices[i04*3u], vertices[i04*3u+1u], vertices[i04*3u+2u]);
  let v40 = vec3<f32>(vertices[i40*3u], vertices[i40*3u+1u], vertices[i40*3u+2u]);
  let v44 = vec3<f32>(vertices[i44*3u], vertices[i44*3u+1u], vertices[i44*3u+2u]);
  let v02 = vec3<f32>(vertices[i02*3u], vertices[i02*3u+1u], vertices[i02*3u+2u]);
  let v20 = vec3<f32>(vertices[i20*3u], vertices[i20*3u+1u], vertices[i20*3u+2u]);
  let v24 = vec3<f32>(vertices[i24*3u], vertices[i24*3u+1u], vertices[i24*3u+2u]);
  let v42 = vec3<f32>(vertices[i42*3u], vertices[i42*3u+1u], vertices[i42*3u+2u]);
  let v22 = vec3<f32>(vertices[i22*3u], vertices[i22*3u+1u], vertices[i22*3u+2u]);
  
  // ULTRA-STRICT Edge Linearity Checks (1μm = 0.001mm = 0.000001 squared)
  let EDGE_TOL_SQ = 0.000001; // 1 micron squared
  
  // Top edge: v02 vs line v00-v04
  var isFlat = true;
  let v04_00 = v04 - v00;
  let L2_top = dot(v04_00, v04_00);
  if (L2_top > 1.0e-12) {
      let t = dot(v02 - v00, v04_00) / L2_top;
      let proj = v00 + v04_00 * t;
      let d = distance(v02, proj);
      if (d*d > EDGE_TOL_SQ) { isFlat = false; }
  }
  
  // Left edge: v20 vs line v00-v40
  if (isFlat) {
      let v40_00 = v40 - v00;
      let L2_left = dot(v40_00, v40_00);
      if (L2_left > 1.0e-12) {
          let t = dot(v20 - v00, v40_00) / L2_left;
          let proj = v00 + v40_00 * t;
          let d = distance(v20, proj);
          if (d*d > EDGE_TOL_SQ) { isFlat = false; }
      }
  }
  
  // Right edge: v24 vs line v04-v44
  if (isFlat) {
      let v44_04 = v44 - v04;
      let L2_right = dot(v44_04, v44_04);
      if (L2_right > 1.0e-12) {
          let t = dot(v24 - v04, v44_04) / L2_right;
          let proj = v04 + v44_04 * t;
          let d = distance(v24, proj);
          if (d*d > EDGE_TOL_SQ) { isFlat = false; }
      }
  }
  
  // Bottom edge: v42 vs line v40-v44
  if (isFlat) {
      let v44_40 = v44 - v40;
      let L2_bot = dot(v44_40, v44_40);
      if (L2_bot > 1.0e-12) {
          let t = dot(v42 - v40, v44_40) / L2_bot;
          let proj = v40 + v44_40 * t;
          let d = distance(v42, proj);
          if (d*d > EDGE_TOL_SQ) { isFlat = false; }
      }
  }
  
  // ULTRA-STRICT Planarity Check (2μm = 0.000004 squared)
  let SURF_TOL_SQ = 0.000004; // 2 microns squared
  
  if (isFlat) {
      let edge1 = v40 - v00;
      let edge2 = v04 - v00;
      let normal = cross(edge1, edge2);
      let L2 = dot(normal, normal);
      
      if (L2 > 1.0e-12) {
          // Check center v22
          let proj22 = dot(v22 - v00, normal);
          let distSq22 = (proj22 * proj22) / L2;
          if (distSq22 > SURF_TOL_SQ) { isFlat = false; }
          
          // Check far corner v44
          if (isFlat) {
              let proj44 = dot(v44 - v00, normal);
              let distSq44 = (proj44 * proj44) / L2;
              if (distSq44 > SURF_TOL_SQ) { isFlat = false; }
          }
          
          // Check all 4 mid-edge vertices for interior planarity
          if (isFlat) {
              let proj02 = dot(v02 - v00, normal);
              if ((proj02 * proj02) / L2 > SURF_TOL_SQ) { isFlat = false; }
          }
          if (isFlat) {
              let proj20 = dot(v20 - v00, normal);
              if ((proj20 * proj20) / L2 > SURF_TOL_SQ) { isFlat = false; }
          }
          if (isFlat) {
              let proj24 = dot(v24 - v00, normal);
              if ((proj24 * proj24) / L2 > SURF_TOL_SQ) { isFlat = false; }
          }
          if (isFlat) {
              let proj42 = dot(v42 - v00, normal);
              if ((proj42 * proj42) / L2 > SURF_TOL_SQ) { isFlat = false; }
          }
      }
  }
  
  // Mark all 4 constituent 2x2 blocks with flag 2u if ultra-flat
  if (isFlat) {
      lod_flags[q00] = 2u;
      lod_flags[q01] = 2u;
      lod_flags[q10] = 2u;
      lod_flags[q11] = 2u;
  }
}


// ============================================================================
// Helper Functions (Wrapped for Style Compatibility)
// ============================================================================

fn getf(u: u32) -> f32 {
  // Map legacy integer indices to uniform chunks
  // MATCHING VALIDATION: Checked against styles.wgsl usage
  switch(u) {
    // Dimensions
    case 0u: { return uniforms.chunk0.x; } // H
    case 1u: { return uniforms.chunk0.y; } // Rt
    case 2u: { return uniforms.chunk0.z; } // Rb
    case 3u: { return uniforms.chunk1.z; } // expn
    
    // Drain/Bottom
    case 13u: { return uniforms.chunk1.y; } // rDrain
    case 26u: { return uniforms.chunk1.x; } // tBottom

    // Wall Thickness (Implicitly used by styles sometimes?)
    case 25u: { return uniforms.chunk0.w; } // tWall

    // Spin/Twist
    case 4u: { return uniforms.chunk2.z; } // spinTurns
    case 5u: { return uniforms.chunk2.w; } // spinPhase
    case 6u: { return uniforms.chunk3.x; } // spinCurve

    // Style ID
    case 7u: { return uniforms.chunk2.y; } 

    // Bell Deformation
    case 14u: { return uniforms.chunk3.y; } // bellAmp
    case 15u: { return uniforms.chunk3.z; } // bellCenter
    case 72u: { return uniforms.chunk3.w; } // bellWidth
    
    // Seam
    case 73u: { return uniforms.chunk4.x; } // seamAngle
    
    // Grid/Camera props (unused in export but defined in common)
    // Return 0 for consistency
    
    default: { return 0.0; }
  }
}

fn style_param(idx: u32) -> f32 {
  return style_params[idx];
}

fn style_params_active() -> bool {
  return true;
}

// ============================================================================
// Kernels
// ============================================================================

// Helper to getting global tiling params
fn get_nz_local() -> u32 { return u32(uniforms.chunk2.x); } // Active buffer height
fn get_start_z() -> u32 { return u32(uniforms.chunk4.y); }  // Global Z offset
fn get_nz_total() -> u32 { return u32(uniforms.chunk4.z); } // Full pot height
fn get_tile_flags() -> u32 { return u32(uniforms.chunk4.w); }
fn use_lut() -> bool { return (u32(uniforms.chunk4.w) & 4u) != 0u; }

@compute @workgroup_size(64)
fn calc_vertices(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // Support 2D dispatch for large meshes (> 4M vertices)
  let stride = 65535u * 64u;
  let idx = global_id.x + global_id.y * stride;

  let H = uniforms.chunk0.x;
  let Rt = uniforms.chunk0.y;
  let Rb = uniforms.chunk0.z;
  let tWall = uniforms.chunk0.w;
  let tBottom = uniforms.chunk1.x;
  let rDrain = uniforms.chunk1.y;
  let expn = uniforms.chunk1.z;
  let nTheta = u32(uniforms.chunk1.w);
  
  // Tiling Params
  let nZ = get_nz_local();        // Height of THIS tile
  let startZ = get_start_z();     // Global Z offset
  let nZTotal = get_nz_total();   // Full pot height (for shape t-values)
  let tileFlags = get_tile_flags(); // 1=First, 2=Last
  let isFirst = (tileFlags & 1u) != 0u;
  let isLast = (tileFlags & 2u) != 0u;
  let usingLUT = (tileFlags & 4u) != 0u;

  // Implicit geometry params
  let nZOuter = nZ + 1u;
  let lenOuter = nTheta * nZOuter;
  let lenInner = lenOuter; // Same count
  
  // Cap/Drain vertices - ONLY generated on Last/First Tile
  let lenRim = select(0u, 2u * nTheta, isLast);           // Rim has Outer/Inner rings (2 * nTheta)
  let lenBotUnder = select(0u, nTheta, isFirst);          // BotUnder (1 ring)
  let lenBotTop = select(0u, nTheta, isFirst);            // BotTop (1 ring)
  let lenDrainCyl = select(0u, 2u * nTheta, isFirst);     // Drain Cylinder (2 rings: top/bottom)

  // Use variables for clarity in checks below (mapped to local names)
  let lenDrainUnder = lenBotUnder; 
  let lenDrainTop = lenBotTop;
  
  let totalVs = lenOuter + lenInner + lenRim + lenBotUnder + lenBotTop + lenDrainCyl + lenDrainUnder + lenDrainTop;

  if (idx >= totalVs) {
    return;
  }

  // Determine which section we are in
  let offInner = lenOuter;
  let offRim = offInner + lenInner;
  let offBotUnder = offRim + lenRim;
  let offBotTop = offBotUnder + lenBotUnder;
  let offDrainCyl = offBotTop + lenBotTop;
  let offDrainUnder = offDrainCyl + lenDrainCyl;
  let offDrainTop = offDrainUnder + lenDrainUnder;

  var p = vec3<f32>(0.0, 0.0, 0.0);
  let styleId = i32(uniforms.chunk2.y);
  let minR = 0.5;

  // --------------------------------------------------------------------------
  // Outer Wall
  // --------------------------------------------------------------------------
  if (idx < offInner) {
    let localIdx = idx;
    let zi = localIdx / nTheta;
    let ti = localIdx % nTheta;

    // Use Global Z for Shape
    let globalZi = startZ + zi;
    var t: f32;
    if (usingLUT) {
        if (globalZi < arrayLength(&z_lut)) { t = z_lut[globalZi]; } else { t = 1.0; }
    } else {
        t = f32(globalZi) / f32(nZTotal);
    }
    
    // Safety clamp t
    let t_clamped = clamp(t, 0.0, 1.0);
    // Z is derived from t (linear mapping assumed for generic, but non-linear if LUT)
    // Actually Z = t * H for pot.
    let z = t_clamped * H;
    
    let theta = (f32(ti) / f32(nTheta)) * TAU;

    let r0 = r_base(t_clamped);
    let r = style_radius(styleId, theta, t_clamped, r0);

    let th_twist = twist_theta(theta, t_clamped);

    let x = r * cos(th_twist);
    let y = r * sin(th_twist);
    p = vec3<f32>(x, y, z);
  }
  // --------------------------------------------------------------------------
  // Inner Wall
  // --------------------------------------------------------------------------
  else if (idx < offRim) {
    let localIdx = idx - offInner;
    let zi = localIdx / nTheta;
    let ti = localIdx % nTheta;

    let globalZi = startZ + zi;
    var t: f32;
    var z: f32;

    if (usingLUT) {
        if (globalZi < arrayLength(&z_lut)) { t = z_lut[globalZi]; } else { t = 1.0; }
        z = tBottom + t * (H - tBottom);
    } else {
        t = f32(globalZi) / f32(nZTotal);
        z = tBottom + t * (H - tBottom);
    }
    
    let theta = (f32(ti) / f32(nTheta)) * TAU;
    let t_clamped = clamp(t, 0.0, 1.0);

    let t_radius = z / H;
    let r_outer = style_radius(styleId, theta, t_radius, r_base(t_radius));
    var r = r_outer - tWall;
    if (r < minR) { r = minR; }

    let th_twist = twist_theta(theta, t_radius);

    let x = r * cos(th_twist);
    let y = r * sin(th_twist);
    p = vec3<f32>(x, y, z);
  }
  // --------------------------------------------------------------------------
  // Rim Cap (Top) - Only on Last Tile
  // --------------------------------------------------------------------------
  else if (idx < offBotUnder) {
    let localIdx = idx - offRim;
    let isInnerRing = (localIdx >= nTheta);
    let ti = localIdx % nTheta;
    let theta = (f32(ti) / f32(nTheta)) * TAU;
    
    let z = H; // Top
    let t = 1.0;
    let r0 = r_base(t);
    let r_outer = style_radius(styleId, theta, t, r0);
    
    var r = 0.0;
    if (isInnerRing) {
        r = r_outer - tWall;
        if (r < minR) { r = minR; }
    } else {
        r = r_outer;
    }
    
    let th_twist = twist_theta(theta, t);
    let x = r * cos(th_twist);
    let y = r * sin(th_twist);
    p = vec3<f32>(x, y, z);
  }
  // --------------------------------------------------------------------------
  // Bottom Under (Flat Bottom) - Only on First Tile
  // --------------------------------------------------------------------------
  else if (idx < offBotTop) {
     let localIdx = idx - offBotUnder;
     let ti = localIdx % nTheta;
     let theta = (f32(ti) / f32(nTheta)) * TAU;
     
     // Bottom Under connects Outer Wall Bottom (Z=0, t=0) to Drain Bottom?
     // Outer wall starts at Z=0? Yes. (t=0 -> z=0)
     let z = 0.0;
     let t = 0.0;
     let r0 = r_base(t);
     let r = style_radius(styleId, theta, t, r0); 
     
     let th_twist = twist_theta(theta, t);
     let x = r * cos(th_twist);
     let y = r * sin(th_twist);
     p = vec3<f32>(x, y, z);
  }
  // --------------------------------------------------------------------------
  // Bottom Top (Inside Floor) - Only on First Tile
  // --------------------------------------------------------------------------
  else if (idx < offDrainCyl) {
     let localIdx = idx - offBotTop;
     let ti = localIdx % nTheta;
     let theta = (f32(ti) / f32(nTheta)) * TAU;
     
     // Inner Floor at Z=tBottom
     let z = tBottom;
     let t_radius = tBottom / H;
     
     let r0 = r_base(t_radius);
     let r_outer = style_radius(styleId, theta, t_radius, r_base(t_radius));
     var r = r_outer - tWall; 
     if (r < minR) { r = minR; }
     
     let th_twist = twist_theta(theta, t_radius);
     let x = r * cos(th_twist);
     let y = r * sin(th_twist);
     p = vec3<f32>(x, y, z);
  }
  // --------------------------------------------------------------------------
  // Drain Cylinder - Only on First Tile
  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // Drain Cylinder - Only on First Tile
  // --------------------------------------------------------------------------
  else if (idx < offDrainUnder) {
      let localIdx = idx - offDrainCyl;
      let isTop = (localIdx >= nTheta);
      let ti = localIdx % nTheta;
      let theta = (f32(ti) / f32(nTheta)) * TAU;
      
      let z = select(0.0, tBottom, isTop);
      let t_radius = z / H;
      let th_twist = twist_theta(theta, t_radius);

      let x = rDrain * cos(th_twist);
      let y = rDrain * sin(th_twist);
      p = vec3<f32>(x, y, z);
  }
  // --------------------------------------------------------------------------
  // Drain Hole Under (Only valid if isFirst - Bottom Tile)
  // --------------------------------------------------------------------------
  else if (idx < offDrainTop) {
     if (isFirst) {
        let localIdx = idx - offDrainUnder;
        let ti = localIdx;
        let theta = (f32(ti) / f32(nTheta)) * TAU;
        let z = 0.0; // Bottom is at 0
        let r = rDrain;
        let th_twist = twist_theta(theta, 0.0);
        p = vec3<f32>(r * cos(th_twist), r * sin(th_twist), z);
     }
  }
  // --------------------------------------------------------------------------
  // Drain Hole Top (Only valid if isFirst - Bottom Tile)
  // --------------------------------------------------------------------------
  else {
      if (isFirst) {
        let localIdx = idx - offDrainTop;
        let ti = localIdx;
        let theta = (f32(ti) / f32(nTheta)) * TAU;
        let z = tBottom;
        let r = rDrain;
        let t = tBottom / H;
        let th_twist = twist_theta(theta, t);
        p = vec3<f32>(r * cos(th_twist), r * sin(th_twist), z);
      }
  }

  // Write (x, y, z) -> (p.x, p.y, p.z)
  // PotFoundry uses Z-Up logic internally, export keeps it.
  
  let base = idx * 3u;
  vertices[base] = p.x;
  vertices[base + 1u] = p.y;
  vertices[base + 2u] = p.z;
}

@compute @workgroup_size(64)
fn calc_indices(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // Support 2D dispatch for large meshes
  let stride = 65535u * 64u;
  let idx = global_id.x + global_id.y * stride; // Triangle index

  let nTheta = u32(uniforms.chunk1.w);
  let nZ = u32(uniforms.chunk2.x);

  // Triangle Counts
  let ctsWall = 2u * nTheta * nZ;
  let ctsRing = 2u * nTheta;

  // Offsets (Cumulative)
  let offOuter = 0u;
  let offInner = offOuter + ctsWall;
  let offRim = offInner + ctsWall;
  let offBotUnder = offRim + ctsRing;
  let offBotTop = offBotUnder + ctsRing;
  let offDrainCyl = offBotTop + ctsRing;
  let totalTris = offDrainCyl + ctsRing;

  if (idx >= totalTris) {
    return;
  }

  var i0 = 0u;
  var i1 = 0u;
  var i2 = 0u;

  // Vertex Offsets
  let vOffOuter = 0u;
  let vOffInner = nTheta * (nZ + 1u);
  let vOffDrainUnder = vOffInner + nTheta * (nZ + 1u);
  let vOffDrainTop = vOffDrainUnder + nTheta;

  // --------------------------------------------------------------------------
  // Outer Wall (CCW / Normal Out)
  // --------------------------------------------------------------------------
  if (idx < offInner) {
    let localIdx = idx - offOuter;
    let quadIdx = localIdx / 2u;
    let isSecond = (localIdx % 2u) == 1u;

    let qi = quadIdx / nTheta; 
    let qj = quadIdx % nTheta; 
    let qjn = (qj + 1u) % nTheta;

    let row0 = vOffOuter + qi * nTheta;
    let row1 = vOffOuter + (qi + 1u) * nTheta;

    let v00 = row0 + qj;
    let v01 = row0 + qjn;
    let v10 = row1 + qj;
    let v11 = row1 + qjn;

    // Aligned to CPU meshBuilder.ts (CCW Front)
    if (!isSecond) {
      i0 = v00; i1 = v10; i2 = v11; // CPU: addFace(v00, v10, v11)
    } else {
      i0 = v00; i1 = v11; i2 = v01; // CPU: addFace(v00, v11, v01)
    }
  }
  // --------------------------------------------------------------------------
  // Inner Wall (CW / Normal In)
  // --------------------------------------------------------------------------
  else if (idx < offRim) {
    let localIdx = idx - offInner;
    let quadIdx = localIdx / 2u;

    let isSecond = (localIdx % 2u) == 1u;

    let qi = quadIdx / nTheta;
    let qj = quadIdx % nTheta;
    let qjn = (qj + 1u) % nTheta;

    let row0 = vOffInner + qi * nTheta;
    let row1 = vOffInner + (qi + 1u) * nTheta;

    let v00 = row0 + qj;
    let v01 = row0 + qjn;
    let v10 = row1 + qj;
    let v11 = row1 + qjn;

    // Aligned to CPU meshBuilder.ts (Reverse Winding for Inward Normal)
    if (!isSecond) {
      i0 = v00; i1 = v11; i2 = v10; // CPU: addFace(v00, v11, v10)
    } else {
      i0 = v00; i1 = v01; i2 = v11; // CPU: addFace(v00, v01, v11)
    }
  }
  // --------------------------------------------------------------------------
  // Rim Cap (Upward)
  // --------------------------------------------------------------------------
  else if (idx < offBotUnder) {
    let localIdx = idx - offRim;
    let qj = localIdx / 2u; 
    let isSecond = (localIdx % 2u) == 1u;
    let qjn = (qj + 1u) % nTheta;

    let rowOuter = vOffOuter + nZ * nTheta; 
    let rowInner = vOffInner + nZ * nTheta;

    let vo0 = rowOuter + qj;
    let vo1 = rowOuter + qjn;
    let vi0 = rowInner + qj;
    let vi1 = rowInner + qjn;

    // Aligned to CPU meshBuilder.ts
    if (!isSecond) {
      i0 = vo0; i1 = vi0; i2 = vi1; // CPU: addFace(vo0, vi0, vi1)
    } else {
      i0 = vo0; i1 = vi1; i2 = vo1; // CPU: addFace(vo0, vi1, vo1)
    }
  }
  // --------------------------------------------------------------------------
  // Bottom Underside (Downward)
  // --------------------------------------------------------------------------
  else if (idx < offBotTop) {
    let localIdx = idx - offBotUnder;
    let qj = localIdx / 2u;
    let isSecond = (localIdx % 2u) == 1u;
    let qjn = (qj + 1u) % nTheta;

    let rowOuter = vOffOuter; 
    let rowDrain = vOffDrainUnder;

    let vo0 = rowOuter + qj;
    let vo1 = rowOuter + qjn;
    let vd0 = rowDrain + qj;
    let vd1 = rowDrain + qjn;

    // Aligned to CPU meshBuilder.ts
    if (!isSecond) {
      i0 = vo0; i1 = vd1; i2 = vd0; // CPU: addFace(vo0, vd1, vd0)
    } else {
      i0 = vo0; i1 = vo1; i2 = vd1; // CPU: addFace(vo0, vo1, vd1)
    }
  }
  // --------------------------------------------------------------------------
  // Bottom Top Side (Upward)
  // --------------------------------------------------------------------------
  else if (idx < offDrainCyl) {
    let localIdx = idx - offBotTop;
    let qj = localIdx / 2u;
    let isSecond = (localIdx % 2u) == 1u;
    let qjn = (qj + 1u) % nTheta;

    let rowInner = vOffInner; 
    let rowDrain = vOffDrainTop;

    let vi0 = rowInner + qj;
    let vi1 = rowInner + qjn;
    let vd0 = rowDrain + qj;
    let vd1 = rowDrain + qjn;

    // Facing Up (CCW) - kept original, appeared correct
    if (!isSecond) {
      i0 = vi0; i1 = vi1; i2 = vd1;
    } else {
      i0 = vi0; i1 = vd1; i2 = vd0;
    }
  }
  // --------------------------------------------------------------------------
  // Drain Cylinder (Inward)
  // --------------------------------------------------------------------------
  else {
    let localIdx = idx - offDrainCyl;
    let qj = localIdx / 2u;
    let isSecond = (localIdx % 2u) == 1u;
    let qjn = (qj + 1u) % nTheta;

    let vdBottom0 = vOffDrainUnder + qj;
    let vdBottom1 = vOffDrainUnder + qjn;
    let vdTop0 = vOffDrainTop + qj;
    let vdTop1 = vOffDrainTop + qjn;

    // Fixed Winding: Inward (Towards Center)
    if (!isSecond) {
      i0 = vdBottom0; i1 = vdTop0; i2 = vdTop1;
    } else {
      i0 = vdBottom0; i1 = vdTop1; i2 = vdBottom1;
    }
  }

  let base = idx * 3u;
  indices[base] = i0;
  indices[base + 1u] = i1;
  indices[base + 2u] = i2;
}

@compute @workgroup_size(64)
fn calc_indices_adaptive(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let stride = 65535u * 64u;
  let idx = global_id.x + global_id.y * stride;

  let nTheta = u32(uniforms.chunk1.w);
  let nZ = u32(uniforms.chunk2.x);
  
  let tileFlags = get_tile_flags();
  let isFirst = (tileFlags & 1u) != 0u;
  let isLast = (tileFlags & 2u) != 0u;

  // Triangle Counts
  let ctsWall = 2u * nTheta * nZ;
  let ctsRing = 2u * nTheta;

  let ctsOuter = ctsWall;
  let ctsInner = ctsWall;
  let ctsRim = select(0u, ctsRing, isLast);           // Only Last
  let ctsBotUnder = select(0u, ctsRing, isFirst);     // Only First
  let ctsBotTop = select(0u, ctsRing, isFirst);       // Only First
  let ctsDrain = select(0u, 2u * ctsRing, isFirst);   // Only First (2 rings of quads)
  
  // Offsets
  let offOuter = 0u;
  let offInner = offOuter + ctsOuter;
  let offRim = offInner + ctsInner;
  let offBotUnder = offRim + ctsRim;
  let offBotTop = offBotUnder + ctsBotUnder;
  let offDrain = offBotTop + ctsBotTop; 
  let totalTris = offDrain + ctsDrain;

  if (idx >= totalTris) { return; }

  // Vertex Offsets (Dynamic - Must match calc_vertices)
  let lenOuterV = nTheta * (nZ + 1u);
  let lenInnerV = nTheta * (nZ + 1u);
  let lenRimV = select(0u, 2u * nTheta, isLast);
  let lenBotUnderV = select(0u, nTheta, isFirst);
  let lenBotTopV = select(0u, nTheta, isFirst);
  let lenDrainV = select(0u, 2u * nTheta, isFirst); // Uses lenDrainCyl from calc_vertices 
  
  let vOffOuter = 0u;
  let vOffInner = vOffOuter + lenOuterV;
  let vOffRim = vOffInner + lenInnerV;
  let vOffBotUnder = vOffRim + lenRimV;
  let vOffBotTop = vOffBotUnder + lenBotUnderV;
  let vOffDrain = vOffBotTop + lenBotTopV;

  // ----------------------------------------------------------------------
  // Outer Wall (Adaptive) - Outward Winding
  // ----------------------------------------------------------------------
  if (idx < offInner) {
      let localIdx = idx - offOuter;
      // Only run for the first triangle of a quad to avoid duplication
      if (localIdx % 2u != 0u) { return; } 
      
      let quadIdx = localIdx / 2u;
      let qi = quadIdx / nTheta;
      let qj = quadIdx % nTheta;

      // Leader/Orphan Check
      let isEvenRow = (qi % 2u == 0u);
      let isEvenCol = (qj % 2u == 0u);
      let isLastRow = (qi == nZ - 1u);
      let isLastCol = (qj == nTheta - 1u);

      var shouldRun = false;
      if (isEvenRow && isEvenCol) { shouldRun = true; }
      else if (isEvenCol && !isEvenRow && isLastRow) { shouldRun = true; }
      else if (!isEvenCol && isEvenRow && isLastCol) { shouldRun = true; }
      else if (!isEvenCol && !isEvenRow && isLastRow && isLastCol) { shouldRun = true; }

      if (!shouldRun) { return; }

      // Determine Scope
      let hasRow = !isLastRow && (qi % 2u == 0u); 
      let hasCol = !isLastCol && (qj % 2u == 0u); 

      var outI: array<u32, 24>;
      var cnt = 0u;

      let r0 = vOffOuter + qi * nTheta;
      let r1 = vOffOuter + (qi + 1u) * nTheta;
      let r2 = vOffOuter + (qi + 2u) * nTheta; 

      let c0 = qj;
      let c1 = (qj + 1u) % nTheta;
      let c2 = (qj + 2u) % nTheta;

      let i00 = r0 + c0; let i01 = r0 + c1; let i02 = r0 + c2;
      let i10 = r1 + c0; let i11 = r1 + c1; let i12 = r1 + c2;
      let i20 = r2 + c0; let i21 = r2 + c1; let i22 = r2 + c2;

      let lodFlag = lod_flags[quadIdx];
      
      // 4x4 handling (flag=2u)
      if (lodFlag == 2u) {
          let is4x4Leader = (qi % 4u == 0u) && (qj % 4u == 0u);
          if (!is4x4Leader) { return; }
          
          let has4Rows = (qi + 4u <= nZ);
          let has4Cols = (qj + 4u <= nTheta);
          
          if (has4Rows && has4Cols) {
              let r4 = vOffOuter + (qi + 4u) * nTheta;
              let c4 = (qj + 4u) % nTheta;
              let i04 = r0 + c4;
              let i40 = r4 + c0;
              let i44 = r4 + c4;
              
              // Winding: Outward. 00->11->10 type equivalent.
              // 00 -> 04 -> 44 (Th x Z = Inward?)
              // 00 -> 44 -> 40 ((Z+Th) x Z = Th x Z = Outward).
              // T1: 00 -> 44 -> 40.
              // T2: 00 -> 04 -> 44. (Th x (Z+Th) = Th x Z = Outward).
              
              var outI4x4: array<u32, 6>;
              outI4x4[0] = i00; outI4x4[1] = i44; outI4x4[2] = i40;
              outI4x4[3] = i00; outI4x4[4] = i04; outI4x4[5] = i44;
              
              let baseOff = atomicAdd(&atomic_counter, 6u);
              if ((baseOff + 6u) * 4u <= arrayLength(&indices) * 4u) {
                  for (var k = 0u; k < 6u; k++) { indices[baseOff + k] = outI4x4[k]; }
              }
              return;
          }
      }
      
      // 2x2 or Detailed
      let isFlat = (lodFlag == 1u) || (lodFlag == 2u);

      if (hasRow && hasCol && isFlat) {
          // Optimized 2x2 - Outward
          // T1: 00 -> 22 -> 20. (Z+Th)xZ = ThxZ = Out.
          // T2: 00 -> 02 -> 22. Thx(Z+Th) = Out.
          outI[0] = i00; outI[1] = i22; outI[2] = i20;
          outI[3] = i00; outI[4] = i02; outI[5] = i22;
          cnt = 6u;
      } else {
          // Detailed - Outward
          // T1: 00 -> 11 -> 10
          // T2: 00 -> 01 -> 11
          outI[cnt] = i00; outI[cnt+1u] = i11; outI[cnt+2u] = i10; cnt += 3u;
          outI[cnt] = i00; outI[cnt+1u] = i01; outI[cnt+2u] = i11; cnt += 3u;

          if (hasCol) { // 01-12
             outI[cnt] = i01; outI[cnt+1u] = i12; outI[cnt+2u] = i11; cnt += 3u;
             outI[cnt] = i01; outI[cnt+1u] = i02; outI[cnt+2u] = i12; cnt += 3u;
          }
          if (hasRow) { // 10-21
             outI[cnt] = i10; outI[cnt+1u] = i21; outI[cnt+2u] = i20; cnt += 3u;
             outI[cnt] = i10; outI[cnt+1u] = i11; outI[cnt+2u] = i21; cnt += 3u;
          }
          if (hasRow && hasCol) { // 11-22
             outI[cnt] = i11; outI[cnt+1u] = i21; outI[cnt+2u] = i22; cnt += 3u;
             outI[cnt] = i11; outI[cnt+1u] = i12; outI[cnt+2u] = i22; cnt += 3u;
          }
      }

      let baseOff = atomicAdd(&atomic_counter, cnt);
      if ((baseOff + cnt) * 4u <= arrayLength(&indices) * 4u) {
          for (var k=0u; k<cnt; k++) { indices[baseOff + k] = outI[k]; }
      }
  } 
  else if (idx < offRim) {
      // ----------------------------------------------------------------------
      // Inner Wall (Adaptive) - Inward Winding
      // ----------------------------------------------------------------------
      let localIdx = idx - offInner;
      if (localIdx % 2u != 0u) { return; } 

      let quadIdx = localIdx / 2u;
      let qi = quadIdx / nTheta;
      let qj = quadIdx % nTheta;

      let isEvenRow = (qi % 2u == 0u);
      let isEvenCol = (qj % 2u == 0u);
      let isLastRow = (qi == nZ - 1u);
      let isLastCol = (qj == nTheta - 1u);

      var shouldRun = false;
      if (isEvenRow && isEvenCol) { shouldRun = true; }
      else if (isEvenCol && !isEvenRow && isLastRow) { shouldRun = true; }
      else if (!isEvenCol && isEvenRow && isLastCol) { shouldRun = true; }
      else if (!isEvenCol && !isEvenRow && isLastRow && isLastCol) { shouldRun = true; }

      if (!shouldRun) { return; }

      let hasRow = !isLastRow && (qi % 2u == 0u);
      let hasCol = !isLastCol && (qj % 2u == 0u);

      var outI: array<u32, 24>;
      var cnt = 0u;

      let r0 = vOffInner + qi * nTheta;
      let r1 = vOffInner + (qi + 1u) * nTheta;
      let r2 = vOffInner + (qi + 2u) * nTheta;

      let c0 = qj;
      let c1 = (qj + 1u) % nTheta;
      let c2 = (qj + 2u) % nTheta;

      let i00 = r0 + c0; let i01 = r0 + c1; let i02 = r0 + c2;
      let i10 = r1 + c0; let i11 = r1 + c1; let i12 = r1 + c2;
      let i20 = r2 + c0; let i21 = r2 + c1; let i22 = r2 + c2;

      let lodFlag = lod_flags[quadIdx];
      
      if (lodFlag == 2u) {
          let is4x4Leader = (qi % 4u == 0u) && (qj % 4u == 0u);
          if (!is4x4Leader) { return; }
          
          let has4Rows = (qi + 4u <= nZ);
          let has4Cols = (qj + 4u <= nTheta);
          
          if (has4Rows && has4Cols) {
              let r4 = vOffInner + (qi + 4u) * nTheta;
              let c4 = (qj + 4u) % nTheta;
              let i04 = r0 + c4;
              let i40 = r4 + c0;
              let i44 = r4 + c4;
              
              // Inward Winding: Z x Th. 00 -> 40 -> 44.
              var outI4x4: array<u32, 6>;
              outI4x4[0] = i00; outI4x4[1] = i40; outI4x4[2] = i44;
              outI4x4[3] = i00; outI4x4[4] = i44; outI4x4[5] = i04;
              
              let baseOff = atomicAdd(&atomic_counter, 6u);
              if ((baseOff + 6u) * 4u <= arrayLength(&indices) * 4u) {
                  for (var k = 0u; k < 6u; k++) { indices[baseOff + k] = outI4x4[k]; }
              }
              return;
          }
      }
      
      let isFlat = (lodFlag == 1u) || (lodFlag == 2u);

      if (hasRow && hasCol && isFlat) {
          // Optimized 2x2 - Inward
          // T1: 00->20->22
          // T2: 00->22->02
          outI[0] = i00; outI[1] = i20; outI[2] = i22;
          outI[3] = i00; outI[4] = i22; outI[5] = i02;
          cnt = 6u;
      } else {
          // Detailed - Inward
          // T1: 00->10->11
          // T2: 00->11->01
          outI[cnt] = i00; outI[cnt+1u] = i10; outI[cnt+2u] = i11; cnt += 3u;
          outI[cnt] = i00; outI[cnt+1u] = i11; outI[cnt+2u] = i01; cnt += 3u;

          if (hasCol) { // 01-12
             outI[cnt] = i01; outI[cnt+1u] = i11; outI[cnt+2u] = i12; cnt += 3u;
             outI[cnt] = i01; outI[cnt+1u] = i12; outI[cnt+2u] = i02; cnt += 3u;
          }
          if (hasRow) { // 10-21
             outI[cnt] = i10; outI[cnt+1u] = i20; outI[cnt+2u] = i21; cnt += 3u;
             outI[cnt] = i10; outI[cnt+1u] = i21; outI[cnt+2u] = i11; cnt += 3u;
          }
          if (hasRow && hasCol) { // 11-22
             outI[cnt] = i11; outI[cnt+1u] = i21; outI[cnt+2u] = i22; cnt += 3u;
             outI[cnt] = i11; outI[cnt+1u] = i22; outI[cnt+2u] = i12; cnt += 3u;
          }
      }

      let baseOff = atomicAdd(&atomic_counter, cnt);
      if ((baseOff + cnt) * 4u <= arrayLength(&indices) * 4u) {
          for (var k=0u; k<cnt; k++) { indices[baseOff + k] = outI[k]; }
      }
  }
  else {
      // ----------------------------------------------------------------------
      // Adaptive Ring Logic (Caps)
      // ----------------------------------------------------------------------
      var layerType = 0u; // 0=Rim, 1=BotUnder, 2=BotTop, 3=Drain
      var localIdx = 0u;
      
      if (idx < offBotUnder) { 
        if (!isLast) { return; } 
        layerType = 0u; 
        localIdx = idx - offRim; 
      }
      else if (idx < offBotTop) { 
        if (!isFirst) { return; }
        layerType = 1u; 
        localIdx = idx - offBotUnder; 
      }
      else if (idx < offDrain) { 
        if (!isFirst) { return; }
        layerType = 2u; 
        localIdx = idx - offBotTop; 
      }
      else { 
        if (!isFirst) { return; }
        layerType = 3u; 
        localIdx = idx - offDrain; 
      }
      
      if (localIdx % 4u != 0u) { return; }
      
      let qj = localIdx / 2u; 
      let qjn = (qj + 1u) % nTheta;     
      let qjn2 = (qj + 2u) % nTheta;    
      
      var rA = 0u; var rB = 0u; 
      
      if (layerType == 0u) { // Rim
          rA = vOffRim; 
          rB = vOffRim + nTheta;
      } else if (layerType == 1u) { // BotUnder
          rA = vOffBotUnder; 
          rB = vOffDrain;
      } else if (layerType == 2u) { // BotTop
          rA = vOffBotTop; 
          rB = vOffDrain + nTheta;
      } else { // Drain
          rA = vOffDrain; 
          rB = vOffDrain + nTheta;
      }
      
      let ia0 = rA + qj; let ia1 = rA + qjn; let ia2 = rA + qjn2;
      let ib0 = rB + qj; let ib1 = rB + qjn; let ib2 = rB + qjn2;

      // Force Flat for now (Simplified Adaptive Caps)
      // Or check planarity (skipped for brevity, assuming simple caps for now)
      // Actually, let's just emit Triangles.
      
      var outI: array<u32, 12>;
      var cnt = 0u;
      
      // Emit 4 Small Triangles (Detail Mode)
      // Winding:
      // Rim (Up): Inner->Outer->Next. vi0->vo0->vo1.
      if (layerType == 0u) { 
          // ia=Outer, ib=Inner.
          // T1: ib0->ia0->ia1. Inner->Outer->OuterNext. (R x Th = Z).
          outI[0] = ib0; outI[1] = ia0; outI[2] = ia1;
          outI[3] = ib0; outI[4] = ia1; outI[5] = ib1;
          outI[6] = ib1; outI[7] = ia1; outI[8] = ia2;
          outI[9] = ib1; outI[10] = ia2; outI[11] = ib2;
      } else if (layerType == 1u) { // BotUnder (Down)
          // ia=Outer, ib=Drain.
          // Outer->Drain = -R.
          // -R x Th = -Z (Down).
          // T1: ia0->ib0->ib1.
          outI[0] = ia0; outI[1] = ib0; outI[2] = ib1;
          outI[3] = ia0; outI[4] = ib1; outI[5] = ia1;
          outI[6] = ia1; outI[7] = ib1; outI[8] = ib2;
          outI[9] = ia1; outI[10] = ib2; outI[11] = ia2;
      } else if (layerType == 2u) { // BotTop (Up)
          // ia=Wall, ib=Drain. wall=outer, drain=inner.
          // Inner->Outer = R. (ib->ia).
          // R x Th = Z.
          // T1: ib0 -> ia0 -> ia1.
          outI[0] = ib0; outI[1] = ia0; outI[2] = ia1;
          outI[3] = ib0; outI[4] = ia1; outI[5] = ib1;
          outI[6] = ib1; outI[7] = ia1; outI[8] = ia2;
          outI[9] = ib1; outI[10] = ia2; outI[11] = ib2;
      } else { // Drain (Inward)
          // ia=Bot, ib=Top. 
          // Bot->Top = Z.
          // Z x Th = -R (Inward).
          // T1: ia0 -> ib0 -> ib1.
          outI[0] = ia0; outI[1] = ib0; outI[2] = ib1;
          outI[3] = ia0; outI[4] = ib1; outI[5] = ia1;
          outI[6] = ia1; outI[7] = ib1; outI[8] = ib2;
          outI[9] = ia1; outI[10] = ib2; outI[11] = ia2;
      }
      cnt = 12u;

      let baseOff = atomicAdd(&atomic_counter, cnt);
      if ((baseOff + cnt) * 4u <= arrayLength(&indices) * 4u) {
          for (var k=0u; k<cnt; k++) { indices[baseOff + k] = outI[k]; }
      }
  }
}
