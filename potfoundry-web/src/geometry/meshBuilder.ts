/**
 * Mesh Builder - Watertight pot mesh generation
 * 
 * This module generates the complete 3D mesh for a parametric pot,
 * including outer wall, inner wall, rim cap, bottom surfaces, and drain hole.
 * The mesh is watertight and suitable for 3D printing.
 * 
 * This is a TypeScript port of Python potfoundry/geometry.py build_pot_mesh()
 */

import {
  TAU,
  StyleId,
  StyleOptions,
  PotDimensions,
  MeshQuality,
  MeshData,
  MeshDiagnostics,
  MeshResult,
  DEFAULT_DIMENSIONS,
  DEFAULT_QUALITY,
} from './types';

import { baseRadius, spinTwistRadians, getThetaGrid } from './profile';
import { getStyleFunctionVec, VectorizedStyleFunction } from './styles';

// ============================================================================
// Mesh Generation
// ============================================================================

/**
 * Generate a watertight triangular mesh for a parametric flower pot.
 * 
 * The mesh consists of:
 * - Outer wall surface
 * - Inner wall surface (offset by wall thickness)
 * - Rim cap (connects outer to inner at top)
 * - Bottom underside (outer base to drain)
 * - Top slab (inner base to drain)
 * - Drain cylinder wall
 * 
 * @param dimensions - Pot dimension parameters
 * @param quality - Mesh resolution settings
 * @param styleId - Style identifier
 * @param styleOpts - Style-specific and spin parameters
 * @returns Mesh data and diagnostics
 */
export function buildPotMesh(
  dimensions: Partial<PotDimensions> = {},
  quality: Partial<MeshQuality> = {},
  styleId: StyleId = 'SuperformulaBlossom',
  styleOpts: StyleOptions = {}
): MeshResult {
  const startTime = performance.now();

  // Merge with defaults
  const dim: PotDimensions = { ...DEFAULT_DIMENSIONS, ...dimensions };
  const qual: MeshQuality = { ...DEFAULT_QUALITY, ...quality };

  const { H, Rt, Rb, tWall, tBottom, rDrain, expn } = dim;
  const { nTheta, nZ } = qual;

  // Validate parameters
  if (H <= 0 || Rt <= 0 || Rb <= 0 || tWall <= 0 || tBottom < 2.0) {
    throw new Error('Invalid size parameters');
  }
  if (rDrain <= 0 || rDrain >= Rb - tWall - 2.0) {
    throw new Error(`Drain radius ${rDrain} too large for bottom radius ${Rb}`);
  }

  // Get cached theta grid
  const { thetas, cosThetas, sinThetas } = getThetaGrid(nTheta);

  // Z sample arrays
  const nZOuter = nZ + 1;
  const nZInner = nZ + 1;
  const zOuter = new Float32Array(nZOuter);
  const zInner = new Float32Array(nZInner);

  for (let i = 0; i < nZOuter; i++) {
    zOuter[i] = (i / nZ) * H;
  }
  for (let i = 0; i < nZInner; i++) {
    zInner[i] = tBottom + (i / nZ) * (H - tBottom);
  }

  // Get style function
  const styleFn = getStyleFunctionVec(styleId);

  // Inject seam angle into style options so the style function can handle 
  // phase offset and amplitude blending correctly
  if (qual.seamAngle !== undefined) {
    styleOpts.seamAngle = qual.seamAngle;
  }

  // Compute outer radii at each z level (with style modulation)
  const outerRadii: Float32Array[] = [];
  const twistOuter: number[] = [];

  for (let i = 0; i < nZOuter; i++) {
    const z = zOuter[i];
    const r0 = baseRadius(z, H, Rb, Rt, expn, styleOpts);
    const twist = spinTwistRadians(z, H, styleOpts);
    twistOuter.push(twist);

    // Apply twist to thetas and compute styled radii
    const twistedThetas = new Float32Array(nTheta);
    for (let j = 0; j < nTheta; j++) {
      twistedThetas[j] = thetas[j] + twist;
    }
    outerRadii.push(styleFn(twistedThetas, z, r0, H, styleOpts));
  }

  // Compute inner radii (outer - wall thickness, clamped above drain)
  const innerRadii: Float32Array[] = [];
  const twistInner: number[] = [];
  const minAllowed = rDrain + 1.0;
  let clampCount = 0;

  for (let i = 0; i < nZInner; i++) {
    const z = zInner[i];
    const r0 = baseRadius(z, H, Rb, Rt, expn, styleOpts);
    const twist = spinTwistRadians(z, H, styleOpts);
    twistInner.push(twist);

    const twistedThetas = new Float32Array(nTheta);
    for (let j = 0; j < nTheta; j++) {
      twistedThetas[j] = thetas[j] + twist;
    }
    const outerR = styleFn(twistedThetas, z, r0, H, styleOpts);
    const innerR = new Float32Array(nTheta);

    for (let j = 0; j < nTheta; j++) {
      let r = outerR[j] - tWall;
      if (r < minAllowed) {
        r = minAllowed;
        clampCount++;
      }
      innerR[j] = r;
    }
    innerRadii.push(innerR);
  }

  // =========================================================================
  // Seam Blending: Smooth the radius transition at the seam (j=0 and j=nTheta-1)
  // This fills in the sharp "V" valley where the walls meet
  // =========================================================================
  const seamAngleDeg = qual.seamAngle ?? 0;
  // logic handled by style function now
  if (false) {
    const seamSpreadRad = (seamAngleDeg * Math.PI) / 180;
    const deltaTheta = TAU / nTheta;
    const seamVertexCount = Math.ceil(seamSpreadRad / deltaTheta);

    // Smoothstep function for smooth blending
    const smoothstep = (t: number): number => {
      const x = Math.max(0, Math.min(1, t));
      return x * x * (3 - 2 * x);
    };

    // Apply seam blending to outer radii
    for (let i = 0; i < nZOuter; i++) {
      const radii = outerRadii[i];

      // Get radius at edge of blend zone as the target
      const targetIdx = Math.min(seamVertexCount, Math.floor(nTheta / 4));
      const rTarget = radii[targetIdx];

      // Blend vertices near j=0 (start of ring)
      for (let j = 0; j < targetIdx; j++) {
        const t = j / Math.max(1, targetIdx);
        const alpha = smoothstep(t);
        radii[j] = rTarget * (1 - alpha) + radii[j] * alpha;
      }

      // Blend vertices near j=nTheta-1 (end of ring, wrapping back)
      for (let j = nTheta - targetIdx; j < nTheta; j++) {
        const dist = nTheta - 1 - j;
        const t = dist / Math.max(1, targetIdx);
        const alpha = smoothstep(t);
        radii[j] = rTarget * (1 - alpha) + radii[j] * alpha;
      }
    }

    // Apply same blending to inner radii
    for (let i = 0; i < nZInner; i++) {
      const radii = innerRadii[i];
      const targetIdx = Math.min(seamVertexCount, Math.floor(nTheta / 4));
      const rTarget = radii[targetIdx];

      for (let j = 0; j < targetIdx; j++) {
        const t = j / Math.max(1, targetIdx);
        const alpha = smoothstep(t);
        radii[j] = rTarget * (1 - alpha) + radii[j] * alpha;
      }

      for (let j = nTheta - targetIdx; j < nTheta; j++) {
        const dist = nTheta - 1 - j;
        const t = dist / Math.max(1, targetIdx);
        const alpha = smoothstep(t);
        radii[j] = rTarget * (1 - alpha) + radii[j] * alpha;
      }
    }
  }

  // Calculate vertex and face counts
  const outerVerts = nZOuter * nTheta;
  const innerVerts = nZInner * nTheta;
  const drainVerts = 2 * nTheta; // under + top circles
  const totalVertices = outerVerts + innerVerts + drainVerts;

  const outerFaces = (nZOuter - 1) * nTheta * 2;
  const innerFaces = (nZInner - 1) * nTheta * 2;
  const rimFaces = nTheta * 2;
  const bottomUnderFaces = nTheta * 2;
  const bottomTopFaces = nTheta * 2;
  const drainCylFaces = nTheta * 2;
  const totalFaces = outerFaces + innerFaces + rimFaces + bottomUnderFaces + bottomTopFaces + drainCylFaces;

  // Allocate arrays
  const vertices = new Float32Array(totalVertices * 3);
  const indices = new Uint32Array(totalFaces * 3);

  // Helper to add a vertex
  let vCursor = 0;
  const addVertex = (x: number, y: number, z: number): number => {
    const idx = vCursor;
    vertices[vCursor * 3] = x;
    vertices[vCursor * 3 + 1] = y;
    vertices[vCursor * 3 + 2] = z;
    vCursor++;
    return idx;
  };

  // Index tracking for each ring
  const outerIdx: number[][] = [];
  const innerIdx: number[][] = [];
  const drainUnderIdx: number[] = [];
  const drainTopIdx: number[] = [];

  // Generate outer wall vertices
  for (let i = 0; i < nZOuter; i++) {
    const z = zOuter[i];
    const twist = twistOuter[i];
    const radii = outerRadii[i];
    const ring: number[] = [];

    const cTw = Math.cos(twist);
    const sTw = Math.sin(twist);

    for (let j = 0; j < nTheta; j++) {
      const r = radii[j];
      // Apply twist rotation
      const cx = cosThetas[j] * cTw - sinThetas[j] * sTw;
      const sy = sinThetas[j] * cTw + cosThetas[j] * sTw;
      ring.push(addVertex(r * cx, r * sy, z));
    }
    outerIdx.push(ring);
  }

  // Generate inner wall vertices
  for (let i = 0; i < nZInner; i++) {
    const z = zInner[i];
    const twist = twistInner[i];
    const radii = innerRadii[i];
    const ring: number[] = [];

    const cTw = Math.cos(twist);
    const sTw = Math.sin(twist);

    for (let j = 0; j < nTheta; j++) {
      const r = radii[j];
      const cx = cosThetas[j] * cTw - sinThetas[j] * sTw;
      const sy = sinThetas[j] * cTw + cosThetas[j] * sTw;
      ring.push(addVertex(r * cx, r * sy, z));
    }
    innerIdx.push(ring);
  }

  // Generate drain hole circles (no twist)
  for (let j = 0; j < nTheta; j++) {
    drainUnderIdx.push(addVertex(rDrain * cosThetas[j], rDrain * sinThetas[j], 0));
  }
  for (let j = 0; j < nTheta; j++) {
    drainTopIdx.push(addVertex(rDrain * cosThetas[j], rDrain * sinThetas[j], tBottom));
  }

  // Helper to add a face
  let fCursor = 0;
  const addFace = (a: number, b: number, c: number): void => {
    indices[fCursor * 3] = a;
    indices[fCursor * 3 + 1] = b;
    indices[fCursor * 3 + 2] = c;
    fCursor++;
  };

  // Generate outer wall faces
  for (let i = 0; i < nZOuter - 1; i++) {
    for (let j = 0; j < nTheta; j++) {
      const jn = (j + 1) % nTheta;
      const v00 = outerIdx[i][j];
      const v01 = outerIdx[i][jn];
      const v10 = outerIdx[i + 1][j];
      const v11 = outerIdx[i + 1][jn];
      addFace(v00, v10, v11);
      addFace(v00, v11, v01);
    }
  }

  // Generate inner wall faces (reverse winding for inward-facing normals)
  for (let i = 0; i < nZInner - 1; i++) {
    for (let j = 0; j < nTheta; j++) {
      const jn = (j + 1) % nTheta;
      const v00 = innerIdx[i][j];
      const v01 = innerIdx[i][jn];
      const v10 = innerIdx[i + 1][j];
      const v11 = innerIdx[i + 1][jn];
      addFace(v00, v11, v10);
      addFace(v00, v01, v11);
    }
  }

  // Generate rim cap (outer top to inner top)
  const outerTop = outerIdx[nZOuter - 1];
  const innerTop = innerIdx[nZInner - 1];
  for (let j = 0; j < nTheta; j++) {
    const jn = (j + 1) % nTheta;
    const vo0 = outerTop[j];
    const vo1 = outerTop[jn];
    const vi0 = innerTop[j];
    const vi1 = innerTop[jn];
    addFace(vo0, vi0, vi1);
    addFace(vo0, vi1, vo1);
  }

  // Generate bottom underside (outer bottom to drain under)
  const outerBottom = outerIdx[0];
  for (let j = 0; j < nTheta; j++) {
    const jn = (j + 1) % nTheta;
    const vo0 = outerBottom[j];
    const vo1 = outerBottom[jn];
    const vd0 = drainUnderIdx[j];
    const vd1 = drainUnderIdx[jn];
    addFace(vo0, vd1, vd0);
    addFace(vo0, vo1, vd1);
  }

  // Generate top of bottom slab (inner bottom to drain top)
  const innerBottom = innerIdx[0];
  for (let j = 0; j < nTheta; j++) {
    const jn = (j + 1) % nTheta;
    const vi0 = innerBottom[j];
    const vi1 = innerBottom[jn];
    const vd0 = drainTopIdx[j];
    const vd1 = drainTopIdx[jn];
    addFace(vi0, vi1, vd1);
    addFace(vi0, vd1, vd0);
  }

  // Generate drain cylinder wall
  for (let j = 0; j < nTheta; j++) {
    const jn = (j + 1) % nTheta;
    const vb0 = drainUnderIdx[j];
    const vb1 = drainUnderIdx[jn];
    const vt0 = drainTopIdx[j];
    const vt1 = drainTopIdx[jn];
    addFace(vb0, vt0, vt1);
    addFace(vb0, vt1, vb1);
  }

  // Calculate diagnostics
  const calcRingOD = (ringIdx: number[]): number => {
    let maxR = 0;
    for (const idx of ringIdx) {
      const x = vertices[idx * 3];
      const y = vertices[idx * 3 + 1];
      const r = Math.sqrt(x * x + y * y);
      if (r > maxR) maxR = r;
    }
    return 2.0 * maxR;
  };

  const endTime = performance.now();
  const totalInnerSamples = nZInner * nTheta;

  const diagnostics: MeshDiagnostics = {
    clampRatioAtBottom: clampCount / Math.max(1, totalInnerSamples),
    estimatedTopOdMm: calcRingOD(outerTop),
    estimatedBottomOdMm: calcRingOD(outerBottom),
    vertexCount: totalVertices,
    faceCount: totalFaces,
    generationTimeMs: endTime - startTime,
  };

  return {
    mesh: {
      vertices,
      indices,
      vertexCount: totalVertices,
      triangleCount: totalFaces,
    },
    diagnostics,
  };
}

// ============================================================================
// Mesh Statistics
// ============================================================================

/**
 * Calculate the approximate volume of the pot mesh in cubic mm
 * 
 * Uses the signed tetrahedron volume method where each triangle
 * forms a tetrahedron with the origin.
 */
export function calculateMeshVolume(mesh: MeshData): number {
  const { vertices, indices, triangleCount } = mesh;
  let volume = 0;

  for (let i = 0; i < triangleCount; i++) {
    const i0 = indices[i * 3];
    const i1 = indices[i * 3 + 1];
    const i2 = indices[i * 3 + 2];

    const v0x = vertices[i0 * 3];
    const v0y = vertices[i0 * 3 + 1];
    const v0z = vertices[i0 * 3 + 2];
    const v1x = vertices[i1 * 3];
    const v1y = vertices[i1 * 3 + 1];
    const v1z = vertices[i1 * 3 + 2];
    const v2x = vertices[i2 * 3];
    const v2y = vertices[i2 * 3 + 1];
    const v2z = vertices[i2 * 3 + 2];

    // Signed volume of tetrahedron with origin
    volume += (
      v0x * (v1y * v2z - v2y * v1z) -
      v1x * (v0y * v2z - v2y * v0z) +
      v2x * (v0y * v1z - v1y * v0z)
    ) / 6.0;
  }

  return Math.abs(volume);
}

/**
 * Calculate mesh surface area in square mm
 */
export function calculateMeshSurfaceArea(mesh: MeshData): number {
  const { vertices, indices, triangleCount } = mesh;
  let area = 0;

  for (let i = 0; i < triangleCount; i++) {
    const i0 = indices[i * 3];
    const i1 = indices[i * 3 + 1];
    const i2 = indices[i * 3 + 2];

    const v0x = vertices[i0 * 3];
    const v0y = vertices[i0 * 3 + 1];
    const v0z = vertices[i0 * 3 + 2];
    const v1x = vertices[i1 * 3];
    const v1y = vertices[i1 * 3 + 1];
    const v1z = vertices[i1 * 3 + 2];
    const v2x = vertices[i2 * 3];
    const v2y = vertices[i2 * 3 + 1];
    const v2z = vertices[i2 * 3 + 2];

    // Edge vectors
    const e1x = v1x - v0x;
    const e1y = v1y - v0y;
    const e1z = v1z - v0z;
    const e2x = v2x - v0x;
    const e2y = v2y - v0y;
    const e2z = v2z - v0z;

    // Cross product
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;

    // Area = half the magnitude of cross product
    area += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
  }

  return area;
}

/**
 * Get mesh bounding box
 */
export function getMeshBounds(mesh: MeshData): {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  size: [number, number, number];
} {
  const { vertices, vertexCount } = mesh;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < vertexCount; i++) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
  };
}
