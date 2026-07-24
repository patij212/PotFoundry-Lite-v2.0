/**
 * STL Export - Binary and ASCII STL file generation
 * 
 * Binary STL is recommended for production use:
 * - 80% smaller file size
 * - 10x faster to write
 * - Universally supported by all modern slicers
 */

import { MeshData, Vec3, STLExportOptions } from './types';
import { assertMeshExportable } from './exportValidation';

// ============================================================================
// Export Format Types
// ============================================================================

/**
 * Supported export file formats
 */
export type ExportFormat = 'stl' | '3mf' | 'obj';

/**
 * Extended export options supporting multiple formats
 */
export interface ExportOptions extends Partial<STLExportOptions> {
  format?: ExportFormat;
  /** Run slicer-oriented print-readiness validation before export. Defaults to true. */
  validateMesh?: boolean;
  /** Require globally consistent adjacent face winding. Defaults to false for download paths. */
  requireConsistentOrientation?: boolean;
  /** Colors for 3MF color embedding (primaryColor, midColor, secondaryColor) */
  colors?: {
    primaryColor: string;
    midColor: string;
    secondaryColor: string;
  };
}

type STLDownloadOptions = Partial<STLExportOptions> & {
  /** Run slicer-oriented print-readiness validation before STL download. Defaults to true. */
  validateMesh?: boolean;
  /** Require globally consistent adjacent face winding. Defaults to false for download paths. */
  requireConsistentOrientation?: boolean;
  /** Reorder triangle winding coherently before writing STL. Defaults to true. */
  repairOrientation?: boolean;
};

interface EdgeUseForOrientation {
  tri: number;
  forward: boolean;
}

const STL_ORIENTATION_WELD_TOLERANCE_MM = 0.001;

/** Binary STL hard ceiling: 1 GiB / 50 bytes-per-triangle (mirrors QualityProfiles.MAX_BINARY_STL_TRIANGLES — a fixed
 *  format fact, duplicated here to avoid a geometry→renderers import). ≈ 21.47M triangles. */
const MAX_BINARY_STL_TRIANGLES = Math.floor((1024 * 1024 * 1024 - 84) / 50);

/**
 * 0.01mm-everywhere meshes can exceed the binary-STL 1 GiB cap (the dense analytic-scored styles land at ~25M tris).
 * Per the productionization decision, fidelity is NEVER compromised for size — so a too-large STL request auto-routes to
 * 3MF (compressed, far higher ceiling). Returns the effective format + whether it was rerouted (so the caller can tell
 * the user / fix the filename). Non-STL formats and meshes that fit pass through unchanged.
 */
export function resolveExportFormatForSize(
  format: ExportFormat,
  triangleCount: number,
): { format: ExportFormat; rerouted: boolean } {
  if (format === 'stl' && triangleCount > MAX_BINARY_STL_TRIANGLES) {
    return { format: '3mf', rerouted: true };
  }
  return { format, rerouted: false };
}

/**
 * Export mesh to the specified format
 *
 * @param mesh - Mesh data to export
 * @param format - Target format ('stl' or '3mf')
 * @param name - Model name
 * @returns Promise resolving to Blob
 */
export async function exportMesh(
  mesh: MeshData,
  format: ExportFormat = 'stl',
  name: string = 'PotFoundry',
  colors?: ExportOptions['colors']
): Promise<Blob> {
  const routed = resolveExportFormatForSize(format, mesh.triangleCount);
  if (routed.rerouted) {
    console.warn(
      `[export] ${mesh.triangleCount.toLocaleString()} triangles exceed the binary-STL cap ` +
      `(${MAX_BINARY_STL_TRIANGLES.toLocaleString()}); auto-routing STL → 3MF to preserve full fidelity.`,
    );
  }
  format = routed.format;
  assertMeshExportable(mesh, { format });

  if (format === '3mf') {
    const { exportTo3MF } = await import('./exporters/export3MF');
    return exportTo3MF(mesh, { name, colors });
  }
  if (format === 'obj') {
    const { exportToOBJ } = await import('./exporters/exportOBJ');
    return exportToOBJ(mesh, { name });
  }
  return generateSTLBlob(mesh, { name, binary: true });
}

/**
 * Download mesh to the specified format
 * 
 * @param mesh - Mesh data to export
 * @param filename - Download filename (extension determines format if not specified)
 * @param options - Export options
 */
export async function downloadMesh(
  mesh: MeshData,
  filename: string = 'pot.stl',
  options: ExportOptions = {}
): Promise<void> {
  // Infer format from filename if not specified
  let format = options.format;
  if (!format) {
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.endsWith('.3mf')) format = '3mf';
    else if (lowerFilename.endsWith('.obj')) format = 'obj';
    else format = 'stl';
  }
  const name = options.name ?? filename.replace(/\.(stl|3mf|obj)$/i, '');

  // Auto-route an oversized STL request to 3MF (fidelity is never compromised for size) + fix the download extension.
  const routed = resolveExportFormatForSize(format, mesh.triangleCount);
  if (routed.rerouted) {
    console.warn(
      `[export] ${mesh.triangleCount.toLocaleString()} triangles exceed the binary-STL cap ` +
      `(${MAX_BINARY_STL_TRIANGLES.toLocaleString()}); auto-routing STL → 3MF to preserve full fidelity.`,
    );
    format = routed.format;
    filename = filename.replace(/\.stl$/i, '.3mf');
  }

  if (options.validateMesh !== false) {
    assertMeshExportable(mesh, {
      format,
      requireConsistentOrientation: options.requireConsistentOrientation ?? false,
    });
  }

  if (format === '3mf') {
    const { download3MF } = await import('./exporters/export3MF');
    await download3MF(mesh, filename, { name, colors: options.colors });
    return;
  }

  if (format === 'obj') {
    const { downloadOBJ } = await import('./exporters/exportOBJ');
    await downloadOBJ(mesh, filename, { name });
    return;
  }

  // Use existing STL download
  downloadSTL(mesh, filename, { ...options, name, validateMesh: false });
}

// ============================================================================
// Normal Calculation
// ============================================================================

/**
 * Compute face normal from three vertices
 */
function computeNormal(
  v0: Vec3,
  v1: Vec3,
  v2: Vec3
): Vec3 {
  // Edge vectors
  const e1: Vec3 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
  const e2: Vec3 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

  // Cross product
  const n: Vec3 = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];

  // Normalize
  const len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
  if (!Number.isFinite(len) || len < 1e-9) {
    return [0, 0, 1];
  }
  return [n[0] / len, n[1] / len, n[2] / len];
}

function edgeKeyForOrientation(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function edgeForwardForOrientation(a: number, b: number): boolean {
  return a < b;
}

function buildOrientationVertexRemap(
  vertices: Float32Array,
  vertexCount: number,
  epsilon: number = STL_ORIENTATION_WELD_TOLERANCE_MM,
): Uint32Array {
  const remap = new Uint32Array(vertexCount);
  if (vertexCount === 0) return remap;

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

function triangleSignedVolume(vertices: Float32Array, i0: number, i1: number, i2: number): number {
  const ax = vertices[i0 * 3], ay = vertices[i0 * 3 + 1], az = vertices[i0 * 3 + 2];
  const bx = vertices[i1 * 3], by = vertices[i1 * 3 + 1], bz = vertices[i1 * 3 + 2];
  const cx = vertices[i2 * 3], cy = vertices[i2 * 3 + 1], cz = vertices[i2 * 3 + 2];
  return (
    ax * (by * cz - bz * cy) -
    ay * (bx * cz - bz * cx) +
    az * (bx * cy - by * cx)
  ) / 6;
}

/**
 * Reorient triangle winding so adjacent faces traverse shared edges in opposite
 * directions. This repairs STL facet normals without changing vertex positions.
 */
export function orientMeshForSTL(mesh: MeshData): MeshData {
  const { vertices, indices, vertexCount, triangleCount } = mesh;
  const oriented = new Uint32Array(indices);
  const edgeUses = new Map<string, EdgeUseForOrientation[]>();
  const remap = buildOrientationVertexRemap(vertices, vertexCount);

  const addEdge = (a: number, b: number, tri: number) => {
    if (a >= vertexCount || b >= vertexCount) return;
    const ca = remap[a];
    const cb = remap[b];
    if (ca === cb) return;
    const key = edgeKeyForOrientation(ca, cb);
    const uses = edgeUses.get(key);
    const use = { tri, forward: edgeForwardForOrientation(ca, cb) };
    if (uses) uses.push(use);
    else edgeUses.set(key, [use]);
  };

  for (let tri = 0; tri < triangleCount; tri++) {
    const base = tri * 3;
    const i0 = indices[base];
    const i1 = indices[base + 1];
    const i2 = indices[base + 2];
    if (
      i0 === i1 || i1 === i2 || i0 === i2 ||
      i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount ||
      remap[i0] === remap[i1] || remap[i1] === remap[i2] || remap[i0] === remap[i2]
    ) continue;
    addEdge(i0, i1, tri);
    addEdge(i1, i2, tri);
    addEdge(i2, i0, tri);
  }

  const adjacency: Array<Array<{ tri: number; sameDirection: boolean }>> =
    Array.from({ length: triangleCount }, () => []);
  for (const uses of edgeUses.values()) {
    if (uses.length !== 2) continue;
    const [a, b] = uses;
    const sameDirection = a.forward === b.forward;
    adjacency[a.tri].push({ tri: b.tri, sameDirection });
    adjacency[b.tri].push({ tri: a.tri, sameDirection });
  }

  const visited = new Uint8Array(triangleCount);
  const flip = new Uint8Array(triangleCount);
  const components: number[][] = [];

  for (let start = 0; start < triangleCount; start++) {
    if (visited[start]) continue;
    const stack = [start];
    const component: number[] = [];
    visited[start] = 1;

    while (stack.length > 0) {
      const tri = stack.pop()!;
      component.push(tri);
      for (const next of adjacency[tri]) {
        const nextFlip = next.sameDirection ? 1 - flip[tri] : flip[tri];
        if (visited[next.tri]) continue;
        visited[next.tri] = 1;
        flip[next.tri] = nextFlip;
        stack.push(next.tri);
      }
    }

    components.push(component);
  }

  for (let tri = 0; tri < triangleCount; tri++) {
    if (!flip[tri]) continue;
    const base = tri * 3;
    const tmp = oriented[base + 1];
    oriented[base + 1] = oriented[base + 2];
    oriented[base + 2] = tmp;
  }

  for (const component of components) {
    let volume = 0;
    for (const tri of component) {
      const base = tri * 3;
      volume += triangleSignedVolume(vertices, oriented[base], oriented[base + 1], oriented[base + 2]);
    }
    if (volume >= 0) continue;
    for (const tri of component) {
      const base = tri * 3;
      const tmp = oriented[base + 1];
      oriented[base + 1] = oriented[base + 2];
      oriented[base + 2] = tmp;
    }
  }

  return { ...mesh, indices: oriented };
}

/**
 * Write one binary STL facet without allocating temporary vertex or normal arrays.
 *
 * The arithmetic and sanitization intentionally mirror `getVert` plus
 * {@link computeNormal}, which the binary writers previously repeated per facet.
 */
function writeBinaryFacet(
  view: DataView,
  offset: number,
  vertices: Float32Array,
  indices: Uint32Array,
  triangleIndex: number,
): number {
  const indexOffset = triangleIndex * 3;
  const i0 = indices[indexOffset];
  const i1 = indices[indexOffset + 1];
  const i2 = indices[indexOffset + 2];

  let v0x = vertices[i0 * 3];
  let v0y = vertices[i0 * 3 + 1];
  let v0z = vertices[i0 * 3 + 2];
  if (!Number.isFinite(v0x) || !Number.isFinite(v0y) || !Number.isFinite(v0z)) {
    v0x = 0;
    v0y = 0;
    v0z = 0;
  }

  let v1x = vertices[i1 * 3];
  let v1y = vertices[i1 * 3 + 1];
  let v1z = vertices[i1 * 3 + 2];
  if (!Number.isFinite(v1x) || !Number.isFinite(v1y) || !Number.isFinite(v1z)) {
    v1x = 0;
    v1y = 0;
    v1z = 0;
  }

  let v2x = vertices[i2 * 3];
  let v2y = vertices[i2 * 3 + 1];
  let v2z = vertices[i2 * 3 + 2];
  if (!Number.isFinite(v2x) || !Number.isFinite(v2y) || !Number.isFinite(v2z)) {
    v2x = 0;
    v2y = 0;
    v2z = 0;
  }

  const e1x = v1x - v0x;
  const e1y = v1y - v0y;
  const e1z = v1z - v0z;
  const e2x = v2x - v0x;
  const e2y = v2y - v0y;
  const e2z = v2z - v0z;
  const rawNx = e1y * e2z - e1z * e2y;
  const rawNy = e1z * e2x - e1x * e2z;
  const rawNz = e1x * e2y - e1y * e2x;
  const length = Math.sqrt(rawNx * rawNx + rawNy * rawNy + rawNz * rawNz);

  let nx = 0;
  let ny = 0;
  let nz = 1;
  if (Number.isFinite(length) && length >= 1e-9) {
    nx = rawNx / length;
    ny = rawNy / length;
    nz = rawNz / length;
  }
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) {
    nx = 0;
    ny = 0;
    nz = 0;
  }

  view.setFloat32(offset, nx, true); offset += 4;
  view.setFloat32(offset, ny, true); offset += 4;
  view.setFloat32(offset, nz, true); offset += 4;
  view.setFloat32(offset, v0x, true); offset += 4;
  view.setFloat32(offset, v0y, true); offset += 4;
  view.setFloat32(offset, v0z, true); offset += 4;
  view.setFloat32(offset, v1x, true); offset += 4;
  view.setFloat32(offset, v1y, true); offset += 4;
  view.setFloat32(offset, v1z, true); offset += 4;
  view.setFloat32(offset, v2x, true); offset += 4;
  view.setFloat32(offset, v2y, true); offset += 4;
  view.setFloat32(offset, v2z, true); offset += 4;
  view.setUint16(offset, 0, true);
  return offset + 2;
}

// ============================================================================
// Binary STL Export
// ============================================================================

/**
 * Generate binary STL data from mesh
 * 
 * Binary STL format:
 * - 80 bytes: header (ASCII string)
 * - 4 bytes: number of triangles (uint32)
 * - For each triangle (50 bytes):
 *   - 12 bytes: normal vector (3 x float32)
 *   - 36 bytes: 3 vertices (9 x float32)
 *   - 2 bytes: attribute byte count (usually 0)
 * 
 * @param mesh - Mesh data with vertices and indices
 * @param name - Model name for header
 * @returns ArrayBuffer containing binary STL data
 */
export function generateBinarySTL(mesh: MeshData, name: string = 'PotFoundry'): ArrayBuffer {
  const exportMeshData = orientMeshForSTL(mesh);
  const { vertices, indices, triangleCount } = exportMeshData;

  // Calculate buffer size: 80 header + 4 count + 50 per triangle
  const bufferSize = 84 + triangleCount * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Write header (80 bytes, ASCII)
  const header = `Binary STL - ${name}`.padEnd(80, ' ');
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, header.charCodeAt(i));
  }

  // Write triangle count (4 bytes, uint32 little-endian)
  view.setUint32(80, triangleCount, true);

  // Write triangles
  let offset = 84;

  for (let i = 0; i < triangleCount; i++) {
    offset = writeBinaryFacet(view, offset, vertices, indices, i);
  }

  return buffer;
}

// ============================================================================
// Streaming Binary STL Export (for ultra-large meshes)
// ============================================================================

/**
 * Generate binary STL as Blob using chunked processing
 * 
 * This function writes triangles in batches to avoid allocating a single
 * massive ArrayBuffer, which can fail for meshes with millions of triangles.
 * 
 * @param mesh - Mesh data with vertices and indices
 * @param name - Model name for header
 * @param chunkSize - Number of triangles per chunk (default: 50000)
 * @param onProgress - Optional progress callback
 * @returns Blob containing binary STL data
 */
export function generateStreamingSTLBlob(
  mesh: MeshData,
  name: string = 'PotFoundry',
  chunkSize: number = 50000,
  onProgress?: (progress: number) => void
): Blob {
  const exportMeshData = orientMeshForSTL(mesh);
  const { vertices, indices, triangleCount } = exportMeshData;
  const chunks: ArrayBuffer[] = [];

  // Create header chunk (84 bytes: 80 header + 4 count)
  const headerBuffer = new ArrayBuffer(84);
  const headerView = new DataView(headerBuffer);

  const header = `Binary STL - ${name}`.padEnd(80, ' ');
  for (let i = 0; i < 80; i++) {
    headerView.setUint8(i, header.charCodeAt(i));
  }
  headerView.setUint32(80, triangleCount, true);
  chunks.push(headerBuffer);

  // Process triangles in chunks
  const totalChunks = Math.ceil(triangleCount / chunkSize);

  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const startTri = chunkIdx * chunkSize;
    const endTri = Math.min(startTri + chunkSize, triangleCount);
    const triCount = endTri - startTri;

    // Allocate buffer for this chunk (50 bytes per triangle)
    const chunkBuffer = new ArrayBuffer(triCount * 50);
    const view = new DataView(chunkBuffer);
    let offset = 0;

    for (let i = startTri; i < endTri; i++) {
      offset = writeBinaryFacet(view, offset, vertices, indices, i);
    }

    chunks.push(chunkBuffer);

    // Report progress
    onProgress?.((chunkIdx + 1) / totalChunks);
  }

  console.log(`[STL Export] Generated ${triangleCount.toLocaleString()} triangles in ${chunks.length} chunks`);

  return new Blob(chunks, { type: 'application/octet-stream' });
}

// ============================================================================
// ASCII STL Export (for debugging/compatibility)
// ============================================================================

/**
 * Generate ASCII STL string from mesh
 * 
 * Note: ASCII STL is deprecated for production use.
 * Use binary STL for smaller files and faster export.
 * 
 * @param mesh - Mesh data with vertices and indices
 * @param name - Model name
 * @returns ASCII STL string
 */
export function generateAsciiSTL(mesh: MeshData, name: string = 'PotFoundry'): string {
  const exportMeshData = orientMeshForSTL(mesh);
  const { vertices, indices, triangleCount } = exportMeshData;
  const lines: string[] = [];

  lines.push(`solid ${name}`);

  for (let i = 0; i < triangleCount; i++) {
    const i0 = indices[i * 3];
    const i1 = indices[i * 3 + 1];
    const i2 = indices[i * 3 + 2];

    const v0: Vec3 = [
      vertices[i0 * 3],
      vertices[i0 * 3 + 1],
      vertices[i0 * 3 + 2],
    ];
    const v1: Vec3 = [
      vertices[i1 * 3],
      vertices[i1 * 3 + 1],
      vertices[i1 * 3 + 2],
    ];
    const v2: Vec3 = [
      vertices[i2 * 3],
      vertices[i2 * 3 + 1],
      vertices[i2 * 3 + 2],
    ];

    const n = computeNormal(v0, v1, v2);

    lines.push(`  facet normal ${n[0].toExponential(6)} ${n[1].toExponential(6)} ${n[2].toExponential(6)}`);
    lines.push('    outer loop');
    lines.push(`      vertex ${v0[0].toExponential(6)} ${v0[1].toExponential(6)} ${v0[2].toExponential(6)}`);
    lines.push(`      vertex ${v1[0].toExponential(6)} ${v1[1].toExponential(6)} ${v1[2].toExponential(6)}`);
    lines.push(`      vertex ${v2[0].toExponential(6)} ${v2[1].toExponential(6)} ${v2[2].toExponential(6)}`);
    lines.push('    endloop');
    lines.push('  endfacet');
  }

  lines.push(`endsolid ${name}`);

  return lines.join('\n');
}

// ============================================================================
// Download Helpers
// ============================================================================

/**
 * Trigger browser download of STL file
 * 
 * @param mesh - Mesh data
 * @param filename - Download filename (should end in .stl)
 * @param options - Export options
 */
export function downloadSTL(
  mesh: MeshData,
  filename: string = 'pot.stl',
  options: STLDownloadOptions = {}
): void {
  const name = options.name ?? filename.replace(/\.stl$/i, '');
  const binary = options.binary ?? true;

  let blob: Blob;

  if (options.validateMesh !== false) {
    assertMeshExportable(mesh, {
      format: 'stl',
      estimatedSizeBytes: estimateSTLSize(mesh.triangleCount, binary),
      requireConsistentOrientation: options.requireConsistentOrientation ?? false,
    });
  }

  if (binary) {
    // Use streaming export for large meshes to avoid memory allocation failures
    const STREAMING_THRESHOLD = 1_000_000; // 1M triangles
    if (mesh.triangleCount > STREAMING_THRESHOLD) {
      console.log(`[downloadSTL] Using streaming export for ${mesh.triangleCount.toLocaleString()} triangles`);
      blob = generateStreamingSTLBlob(mesh, name);
    } else {
      const buffer = generateBinarySTL(mesh, name);
      blob = new Blob([buffer], { type: 'application/octet-stream' });
    }
  } else {
    const text = generateAsciiSTL(mesh, name);
    blob = new Blob([text], { type: 'text/plain' });
  }

  // Create download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;

  // Trigger download
  document.body.appendChild(a);
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate STL file as Blob
 * 
 * Useful for uploading to servers or further processing.
 */
export function generateSTLBlob(
  mesh: MeshData,
  options: Partial<STLExportOptions> = {}
): Blob {
  const name = options.name ?? 'PotFoundry';
  const binary = options.binary ?? true;

  if (binary) {
    const buffer = generateBinarySTL(mesh, name);
    return new Blob([buffer], { type: 'application/octet-stream' });
  } else {
    const text = generateAsciiSTL(mesh, name);
    return new Blob([text], { type: 'text/plain' });
  }
}

/**
 * Get STL file size estimate
 * 
 * @param triangleCount - Number of triangles
 * @param binary - Whether using binary format
 * @returns Estimated file size in bytes
 */
export function estimateSTLSize(triangleCount: number, binary: boolean = true): number {
  if (binary) {
    // 80 header + 4 count + 50 per triangle
    return 84 + triangleCount * 50;
  } else {
    // Rough estimate: ~220 bytes per triangle in ASCII
    return triangleCount * 220;
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}
