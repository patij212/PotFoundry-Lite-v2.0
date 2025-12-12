/**
 * STL Export - Binary and ASCII STL file generation
 * 
 * Binary STL is recommended for production use:
 * - 80% smaller file size
 * - 10x faster to write
 * - Universally supported by all modern slicers
 */

import { MeshData, Vec3, STLExportOptions } from './types';

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
  if (len < 1e-9) {
    return [0, 0, 0];
  }
  return [n[0] / len, n[1] / len, n[2] / len];
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
  const { vertices, indices, triangleCount } = mesh;
  
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
    const i0 = indices[i * 3];
    const i1 = indices[i * 3 + 1];
    const i2 = indices[i * 3 + 2];
    
    // Get vertices
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
    
    // Compute normal
    const n = computeNormal(v0, v1, v2);
    
    // Write normal (3 x float32)
    view.setFloat32(offset, n[0], true); offset += 4;
    view.setFloat32(offset, n[1], true); offset += 4;
    view.setFloat32(offset, n[2], true); offset += 4;
    
    // Write vertex 1
    view.setFloat32(offset, v0[0], true); offset += 4;
    view.setFloat32(offset, v0[1], true); offset += 4;
    view.setFloat32(offset, v0[2], true); offset += 4;
    
    // Write vertex 2
    view.setFloat32(offset, v1[0], true); offset += 4;
    view.setFloat32(offset, v1[1], true); offset += 4;
    view.setFloat32(offset, v1[2], true); offset += 4;
    
    // Write vertex 3
    view.setFloat32(offset, v2[0], true); offset += 4;
    view.setFloat32(offset, v2[1], true); offset += 4;
    view.setFloat32(offset, v2[2], true); offset += 4;
    
    // Write attribute byte count (2 bytes, usually 0)
    view.setUint16(offset, 0, true); offset += 2;
  }
  
  return buffer;
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
  const { vertices, indices, triangleCount } = mesh;
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
  options: Partial<STLExportOptions> = {}
): void {
  const name = options.name ?? filename.replace(/\.stl$/i, '');
  const binary = options.binary ?? true;
  
  let blob: Blob;
  
  if (binary) {
    const buffer = generateBinarySTL(mesh, name);
    blob = new Blob([buffer], { type: 'application/octet-stream' });
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
