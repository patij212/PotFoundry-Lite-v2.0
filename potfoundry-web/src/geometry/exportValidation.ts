/**
 * Shared slicer-oriented mesh validation for STL/OBJ/3MF export.
 *
 * This is intentionally format-agnostic. Format writers may still expose raw
 * serialization helpers for unit tests, but production export paths should use
 * this gate before offering a downloadable file.
 */

import type { MeshData } from './types';

/** Supported mesh export formats for size estimation. */
export type MeshExportFormat = 'stl' | 'obj' | '3mf';

/** Hard safety ceiling for generated slicer files: 1 GiB. */
export const HARD_MAX_EXPORT_BYTES = 1024 * 1024 * 1024;

const STL_HEADER_BYTES = 84;
const STL_TRIANGLE_BYTES = 50;
const OBJ_HEADER_BYTES = 200;
const OBJ_VERTEX_LINE_BYTES = 35;
const OBJ_NORMAL_LINE_BYTES = 35;
const OBJ_FACE_LINE_BYTES = 40;
const THREE_MF_XML_OVERHEAD_BYTES = 1000;
const THREE_MF_VERTEX_XML_BYTES = 40;
const THREE_MF_TRIANGLE_XML_BYTES = 35;
const THREE_MF_COMPRESSION_RATIO = 0.4;
const DEFAULT_MIN_TRIANGLE_AREA_MM2 = 1e-12;
const DEFAULT_MIN_EXTENT_MM = 1e-9;
const DEFAULT_TOPOLOGY_WELD_TOLERANCE_MM = 0.001;
const EXCESSIVE_SIZE_WARNING_RATIO = 0.75;

/** Options for export validation. */
export interface MeshExportValidationOptions {
  /** Format being exported. Defaults to STL. */
  format?: MeshExportFormat;
  /** Override size estimate when the caller has a more exact value. */
  estimatedSizeBytes?: number;
  /** Maximum allowed file size. Defaults to 1 GiB. */
  maxBytes?: number;
  /** Require every edge to have exactly two adjacent faces. Defaults to true. */
  requireClosed?: boolean;
  /** Minimum nonzero triangle area. Defaults to 1e-12 mm^2. */
  minTriangleAreaMm2?: number;
  /** Minimum extent on at least one axis. Defaults to 1e-9 mm. */
  minExtentMm?: number;
  /** Geometric weld tolerance for closure checks. Defaults to 0.001 mm. */
  topologyWeldToleranceMm?: number;
  /** Require adjacent faces to use opposing directed edges. Defaults to true. */
  requireConsistentOrientation?: boolean;
}

/** Structured export-readiness report. */
export interface MeshExportValidationReport {
  /** Overall pass/fail. */
  ok: boolean;
  /** Blocking issues that should prevent export. */
  errors: string[];
  /** Non-blocking issues worth showing to users. */
  warnings: string[];
  /** Format used for size estimation. */
  format: MeshExportFormat;
  /** Estimated output size in bytes. */
  estimatedSizeBytes: number;
  /** Number of non-finite vertex scalars. */
  invalidVertexScalars: number;
  /** Number of out-of-range vertex indices. */
  invalidIndices: number;
  /** Number of duplicate-index or zero-area triangles. */
  degenerateTriangles: number;
  /** Number of edges with one adjacent face. */
  boundaryEdges: number;
  /** Number of edges with more than two adjacent faces. */
  nonManifoldEdges: number;
  /** Number of two-face edges traversed in the same direction by both faces. */
  orientationMismatches: number;
  /** Number of coordinate axes whose extent is effectively zero. */
  zeroExtentAxes: number;
}

interface EdgeUse {
  total: number;
  forward: number;
  reverse: number;
}

function buildGeometricVertexRemap(
  vertices: Float32Array,
  vertexCount: number,
  epsilon: number,
): Uint32Array | undefined {
  if (epsilon <= 0 || vertexCount <= 0) return undefined;

  const remap = new Uint32Array(vertexCount);
  const precision = Math.max(1, Math.round(1 / epsilon));
  const quantized = new Int32Array(vertexCount * 4);
  const order = new Uint32Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    quantized[i * 4] = Math.round(vertices[i * 3] * precision);
    quantized[i * 4 + 1] = Math.round(vertices[i * 3 + 1] * precision);
    quantized[i * 4 + 2] = Math.round(vertices[i * 3 + 2] * precision);
    quantized[i * 4 + 3] = i;
    order[i] = i;
  }

  order.sort((a, b) => {
    const ax = quantized[a * 4];
    const bx = quantized[b * 4];
    if (ax !== bx) return ax - bx;

    const ay = quantized[a * 4 + 1];
    const by = quantized[b * 4 + 1];
    if (ay !== by) return ay - by;

    return quantized[a * 4 + 2] - quantized[b * 4 + 2];
  });

  let canonical = 0;
  let prevX = quantized[order[0] * 4];
  let prevY = quantized[order[0] * 4 + 1];
  let prevZ = quantized[order[0] * 4 + 2];
  remap[order[0]] = canonical;

  for (let sortedIdx = 1; sortedIdx < vertexCount; sortedIdx++) {
    const vertexIdx = order[sortedIdx];
    const x = quantized[vertexIdx * 4];
    const y = quantized[vertexIdx * 4 + 1];
    const z = quantized[vertexIdx * 4 + 2];
    if (x !== prevX || y !== prevY || z !== prevZ) {
      canonical++;
      prevX = x;
      prevY = y;
      prevZ = z;
    }
    remap[vertexIdx] = canonical;
  }

  return remap;
}

/** Estimate exported file size for a mesh and format. */
export function estimateMeshExportBytes(
  mesh: Pick<MeshData, 'vertexCount' | 'triangleCount'>,
  format: MeshExportFormat,
): number {
  switch (format) {
    case 'obj':
      return OBJ_HEADER_BYTES +
        mesh.vertexCount * OBJ_VERTEX_LINE_BYTES +
        mesh.triangleCount * (OBJ_NORMAL_LINE_BYTES + OBJ_FACE_LINE_BYTES);
    case '3mf': {
      const uncompressed = THREE_MF_XML_OVERHEAD_BYTES +
        mesh.vertexCount * THREE_MF_VERTEX_XML_BYTES +
        mesh.triangleCount * THREE_MF_TRIANGLE_XML_BYTES;
      return Math.ceil(uncompressed * THREE_MF_COMPRESSION_RATIO);
    }
    case 'stl':
    default:
      return STL_HEADER_BYTES + mesh.triangleCount * STL_TRIANGLE_BYTES;
  }
}

/** Validate whether a mesh is ready for slicer-oriented export. */
export function validateMeshForExport(
  mesh: MeshData,
  options: MeshExportValidationOptions = {},
): MeshExportValidationReport {
  const format = options.format ?? 'stl';
  const maxBytes = options.maxBytes ?? HARD_MAX_EXPORT_BYTES;
  const requireClosed = options.requireClosed ?? true;
  const requireConsistentOrientation = options.requireConsistentOrientation ?? true;
  const minArea = options.minTriangleAreaMm2 ?? DEFAULT_MIN_TRIANGLE_AREA_MM2;
  const minExtent = options.minExtentMm ?? DEFAULT_MIN_EXTENT_MM;
  const topologyWeldTolerance = options.topologyWeldToleranceMm ?? DEFAULT_TOPOLOGY_WELD_TOLERANCE_MM;
  const estimatedSizeBytes = options.estimatedSizeBytes ??
    estimateMeshExportBytes(mesh, format);

  const errors: string[] = [];
  const warnings: string[] = [];
  const expectedVertexScalars = mesh.vertexCount * 3;
  const expectedIndices = mesh.triangleCount * 3;

  if (mesh.vertexCount <= 0) {
    errors.push('mesh has no vertices');
  }
  if (mesh.triangleCount <= 0) {
    errors.push('mesh has no triangles');
  }
  if (mesh.vertices.length !== expectedVertexScalars) {
    errors.push(
      `vertex buffer length ${mesh.vertices.length} does not match vertexCount ${mesh.vertexCount}`,
    );
  }
  if (mesh.indices.length !== expectedIndices) {
    errors.push(
      `index buffer length ${mesh.indices.length} does not match triangleCount ${mesh.triangleCount}`,
    );
  }

  let invalidVertexScalars = 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < Math.min(mesh.vertices.length, expectedVertexScalars); i += 3) {
    const x = mesh.vertices[i];
    const y = mesh.vertices[i + 1];
    const z = mesh.vertices[i + 2];
    if (!Number.isFinite(x)) invalidVertexScalars++;
    if (!Number.isFinite(y)) invalidVertexScalars++;
    if (!Number.isFinite(z)) invalidVertexScalars++;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  if (invalidVertexScalars > 0) {
    errors.push(`${invalidVertexScalars} non-finite vertex coordinates`);
  }

  const zeroExtentAxes = [
    maxX - minX,
    maxY - minY,
    maxZ - minZ,
  ].filter(extent => !Number.isFinite(extent) || extent <= minExtent).length;
  if (zeroExtentAxes === 3) {
    errors.push('mesh bounds collapse on all coordinate axes');
  }

  const edgeUses = new Map<string, EdgeUse>();
  let invalidIndices = 0;
  let degenerateTriangles = 0;
  let signedVolumeMm3 = 0;
  const vertexRemap = buildGeometricVertexRemap(
    mesh.vertices,
    Math.min(mesh.vertexCount, Math.floor(mesh.vertices.length / 3)),
    topologyWeldTolerance,
  );

  const recordEdge = (a: number, b: number): void => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}:${hi}`;
    const use = edgeUses.get(key) ?? { total: 0, forward: 0, reverse: 0 };
    use.total++;
    if (a === lo && b === hi) use.forward++;
    else use.reverse++;
    edgeUses.set(key, use);
  };

  const triLimit = Math.min(mesh.indices.length, expectedIndices);
  for (let t = 0; t < triLimit; t += 3) {
    const i0 = mesh.indices[t];
    const i1 = mesh.indices[t + 1];
    const i2 = mesh.indices[t + 2];
    const hasInvalidIndex =
      i0 >= mesh.vertexCount ||
      i1 >= mesh.vertexCount ||
      i2 >= mesh.vertexCount;

    if (hasInvalidIndex) {
      if (i0 >= mesh.vertexCount) invalidIndices++;
      if (i1 >= mesh.vertexCount) invalidIndices++;
      if (i2 >= mesh.vertexCount) invalidIndices++;
      continue;
    }

    if (i0 === i1 || i1 === i2 || i0 === i2) {
      degenerateTriangles++;
      continue;
    }

    const area = triangleAreaMm2(mesh.vertices, i0, i1, i2);
    if (!Number.isFinite(area) || area <= minArea) {
      degenerateTriangles++;
      continue;
    }

    const c0 = vertexRemap ? vertexRemap[i0] : i0;
    const c1 = vertexRemap ? vertexRemap[i1] : i1;
    const c2 = vertexRemap ? vertexRemap[i2] : i2;
    if (c0 === c1 || c1 === c2 || c0 === c2) {
      degenerateTriangles++;
      continue;
    }

    signedVolumeMm3 += signedTetraVolumeMm3(mesh.vertices, i0, i1, i2);
    recordEdge(c0, c1);
    recordEdge(c1, c2);
    recordEdge(c2, c0);
  }

  if (invalidIndices > 0) {
    errors.push(`${invalidIndices} invalid vertex indices`);
  }
  if (degenerateTriangles > 0) {
    errors.push(`${degenerateTriangles} degenerate triangles`);
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  let orientationMismatches = 0;

  for (const use of edgeUses.values()) {
    if (use.total === 1) boundaryEdges++;
    else if (use.total > 2) nonManifoldEdges++;
    else if (use.forward !== 1 || use.reverse !== 1) orientationMismatches++;
  }

  if (requireClosed && boundaryEdges > 0) {
    errors.push(`${boundaryEdges} boundary edges (mesh is not closed)`);
  }
  if (nonManifoldEdges > 0) {
    errors.push(`${nonManifoldEdges} non-manifold edges`);
  }
  if (orientationMismatches > 0 && requireConsistentOrientation) {
    errors.push(`${orientationMismatches} inconsistent edge orientation pairs`);
  } else if (orientationMismatches > 0) {
    warnings.push(`${orientationMismatches} inconsistent edge orientation pairs`);
  }
  if (
    requireClosed &&
    invalidVertexScalars === 0 &&
    invalidIndices === 0 &&
    degenerateTriangles === 0 &&
    boundaryEdges === 0 &&
    nonManifoldEdges === 0 &&
    orientationMismatches === 0 &&
    signedVolumeMm3 <= 0
  ) {
    errors.push(`mesh is inside-out: signed volume ${signedVolumeMm3.toExponential(3)} mm^3, expected outward-facing positive volume`);
  }
  if (estimatedSizeBytes > maxBytes) {
    errors.push(
      `estimated ${format.toUpperCase()} size ${formatGiB(estimatedSizeBytes)} exceeds hard 1 GiB limit`,
    );
  } else if (estimatedSizeBytes > maxBytes * EXCESSIVE_SIZE_WARNING_RATIO) {
    warnings.push(
      `estimated ${format.toUpperCase()} size ${formatGiB(estimatedSizeBytes)} is close to the 1 GiB limit`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    format,
    estimatedSizeBytes,
    invalidVertexScalars,
    invalidIndices,
    degenerateTriangles,
    boundaryEdges,
    nonManifoldEdges,
    orientationMismatches,
    zeroExtentAxes,
  };
}

/** Throw when a mesh is not ready for slicer-oriented export. */
export function assertMeshExportable(
  mesh: MeshData,
  options: MeshExportValidationOptions = {},
): void {
  const report = validateMeshForExport(mesh, options);
  if (report.ok) return;
  throw new Error(
    `[ExportValidation] Mesh is not exportable as ${report.format.toUpperCase()}: ` +
    report.errors.join('; '),
  );
}

function triangleAreaMm2(
  vertices: Float32Array,
  i0: number,
  i1: number,
  i2: number,
): number {
  const ax = vertices[i0 * 3];
  const ay = vertices[i0 * 3 + 1];
  const az = vertices[i0 * 3 + 2];
  const bx = vertices[i1 * 3];
  const by = vertices[i1 * 3 + 1];
  const bz = vertices[i1 * 3 + 2];
  const cx = vertices[i2 * 3];
  const cy = vertices[i2 * 3 + 1];
  const cz = vertices[i2 * 3 + 2];

  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  return Math.sqrt(nx * nx + ny * ny + nz * nz) * 0.5;
}

function signedTetraVolumeMm3(
  vertices: Float32Array,
  i0: number,
  i1: number,
  i2: number,
): number {
  const ax = vertices[i0 * 3];
  const ay = vertices[i0 * 3 + 1];
  const az = vertices[i0 * 3 + 2];
  const bx = vertices[i1 * 3];
  const by = vertices[i1 * 3 + 1];
  const bz = vertices[i1 * 3 + 2];
  const cx = vertices[i2 * 3];
  const cy = vertices[i2 * 3 + 1];
  const cz = vertices[i2 * 3 + 2];

  return (
    ax * (by * cz - bz * cy) +
    ay * (bz * cx - bx * cz) +
    az * (bx * cy - by * cx)
  ) / 6;
}

function formatGiB(bytes: number): string {
  return `${(bytes / HARD_MAX_EXPORT_BYTES).toFixed(2)} GiB`;
}
