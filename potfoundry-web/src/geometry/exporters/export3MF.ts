/**
 * 3MF Export - Modern 3D Manufacturing Format export
 *
 * 3MF is a ZIP-based format that offers:
 * - 50-66% smaller files than binary STL (due to shared vertices + ZIP compression)
 * - Better precision (string-based coordinates)
 * - Material and color support (future extensibility)
 * - Native support in modern slicers (Cura, PrusaSlicer, etc.)
 *
 * File structure:
 * └── .3mf (ZIP archive)
 *     ├── [Content_Types].xml
 *     ├── _rels/.rels
 *     └── 3D/3dmodel.model (XML mesh data)
 */

import JSZip from 'jszip';
import type { MeshData } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface Export3MFColors {
    /** Bottom color hex (e.g. '#8B4513') */
    primaryColor: string;
    /** Mid color hex */
    midColor: string;
    /** Top color hex */
    secondaryColor: string;
}

export interface Export3MFOptions {
    /** Model name (default: 'PotFoundry') */
    name?: string;
    /** Model unit (default: 'millimeter') */
    unit?: 'millimeter' | 'centimeter' | 'inch';
    /** Compression level 0-9 (default: 6) */
    compressionLevel?: number;
    /** Progress callback */
    onProgress?: (progress: number, message: string) => void;
    /** Optional creation timestamp. Omitted by default for deterministic exports. */
    createdAt?: string;
    /** Per-triangle colors via 3MF Materials Extension (optional) */
    colors?: Export3MFColors;
}

// ============================================================================
// XML Templates
// ============================================================================

/**
 * Content Types XML - Defines file types in the package
 */
const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

/**
 * Package relationships XML - Links to the main model file
 */
const RELS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model" Id="rel0"/>
</Relationships>`;

/** Stable ZIP timestamp used so default exports are byte-deterministic. */
const DETERMINISTIC_ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');

// ============================================================================
// Color Helpers
// ============================================================================

/** Parse hex color to [r,g,b] 0-255 */
function parseHex(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ];
}

/** Linearly interpolate between two colors */
function lerpColor(
    a: [number, number, number],
    b: [number, number, number],
    t: number,
): string {
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const b2 = Math.round(a[2] + (b[2] - a[2]) * t);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b2.toString(16).padStart(2, '0')}`.toUpperCase();
}

/**
 * Build a color palette: N evenly spaced colors from bottom→mid→top.
 * Returns hex strings for a <m:colorgroup>.
 */
function buildColorPalette(colors: Export3MFColors, steps: number): string[] {
    const cBottom = parseHex(colors.primaryColor);
    const cMid = parseHex(colors.midColor);
    const cTop = parseHex(colors.secondaryColor);
    const palette: string[] = [];
    for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1); // 0..1
        if (t <= 0.5) {
            palette.push(lerpColor(cBottom, cMid, t * 2));
        } else {
            palette.push(lerpColor(cMid, cTop, (t - 0.5) * 2));
        }
    }
    return palette;
}

/**
 * Map a triangle to a palette index based on its centroid Z height.
 * Z range is auto-detected from vertices.
 */
function triangleColorIndex(
    vertices: Float32Array,
    indices: Uint32Array,
    triIndex: number,
    zMin: number,
    zRange: number,
    paletteSize: number,
): number {
    const i0 = indices[triIndex * 3];
    const i1 = indices[triIndex * 3 + 1];
    const i2 = indices[triIndex * 3 + 2];
    const z = (vertices[i0 * 3 + 2] + vertices[i1 * 3 + 2] + vertices[i2 * 3 + 2]) / 3;
    const t = zRange > 0 ? Math.max(0, Math.min(1, (z - zMin) / zRange)) : 0;
    return Math.min(paletteSize - 1, Math.floor(t * paletteSize));
}

// ============================================================================
// 3MF Generation
// ============================================================================

/**
 * Generate 3D model XML content with chunked streaming for large meshes
 * 
 * For meshes over 1M vertices, generates XML in chunks to avoid memory issues.
 */
/** Number of discrete color steps in the palette */
const COLOR_PALETTE_SIZE = 64;

function generateModelXML(mesh: MeshData, options: Export3MFOptions = {}): string | Blob {
    const { name = 'PotFoundry', unit = 'millimeter', colors, createdAt } = options;
    const { vertices, indices, vertexCount, triangleCount } = mesh;

    // For very large meshes, use blob-based streaming (without color for simplicity)
    const STREAMING_THRESHOLD = 1_000_000;
    const useStreaming = vertexCount > STREAMING_THRESHOLD || triangleCount > STREAMING_THRESHOLD;

    if (useStreaming) {
        return generateStreamingModelXML(mesh, options);
    }

    // Pre-compute Z range for color mapping
    let zMin = Infinity;
    let zMax = -Infinity;
    if (colors) {
        for (let i = 0; i < vertexCount; i++) {
            const z = vertices[i * 3 + 2];
            if (z < zMin) zMin = z;
            if (z > zMax) zMax = z;
        }
    }
    const zRange = zMax - zMin;

    const palette = colors ? buildColorPalette(colors, COLOR_PALETTE_SIZE) : null;
    const hasColors = palette !== null;

    const lines: string[] = [];

    // XML header and model element
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    if (hasColors) {
        lines.push(
            '<model unit="' + unit + '" xml:lang="en-US"' +
            ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"' +
            ' xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">'
        );
    } else {
        lines.push('<model unit="' + unit + '" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">');
    }
    lines.push('  <metadata name="Title">' + escapeXml(name) + '</metadata>');
    lines.push('  <metadata name="Application">PotFoundry</metadata>');
    if (createdAt) {
        lines.push('  <metadata name="CreationDate">' + escapeXml(createdAt) + '</metadata>');
    }
    lines.push('  <resources>');

    // Color group resource (3MF Materials Extension)
    if (hasColors) {
        lines.push('    <m:colorgroup id="2">');
        for (const hex of palette) {
            lines.push(`      <m:color color="${hex}FF"/>`);
        }
        lines.push('    </m:colorgroup>');
    }

    lines.push('    <object id="1" type="model" name="' + escapeXml(name) + '">');
    lines.push('      <mesh>');

    // Vertices
    lines.push('        <vertices>');
    for (let i = 0; i < vertexCount; i++) {
        const x = vertices[i * 3];
        const y = vertices[i * 3 + 1];
        const z = vertices[i * 3 + 2];
        lines.push(`          <vertex x="${x.toFixed(6)}" y="${y.toFixed(6)}" z="${z.toFixed(6)}"/>`);
    }
    lines.push('        </vertices>');

    // Triangles (with optional per-triangle color)
    lines.push('        <triangles>');
    for (let i = 0; i < triangleCount; i++) {
        const v1 = indices[i * 3];
        const v2 = indices[i * 3 + 1];
        const v3 = indices[i * 3 + 2];
        if (hasColors) {
            const ci = triangleColorIndex(vertices, indices, i, zMin, zRange, COLOR_PALETTE_SIZE);
            lines.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}" pid="2" p1="${ci}"/>`);
        } else {
            lines.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`);
        }
    }
    lines.push('        </triangles>');

    lines.push('      </mesh>');
    lines.push('    </object>');
    lines.push('  </resources>');
    lines.push('  <build>');
    lines.push('    <item objectid="1"/>');
    lines.push('  </build>');
    lines.push('</model>');

    return lines.join('\n');
}

/**
 * Generate streaming model XML as Blob for ultra-large meshes
 */
function generateStreamingModelXML(mesh: MeshData, options: Export3MFOptions = {}): Blob {
    const { name = 'PotFoundry', unit = 'millimeter', createdAt } = options;
    const { vertices, indices, vertexCount, triangleCount } = mesh;
    const chunks: string[] = [];

    // Header
    chunks.push('<?xml version="1.0" encoding="UTF-8"?>\n');
    chunks.push(`<model unit="${unit}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n`);
    chunks.push(`  <metadata name="Title">${escapeXml(name)}</metadata>\n`);
    chunks.push('  <metadata name="Application">PotFoundry</metadata>\n');
    if (createdAt) {
        chunks.push(`  <metadata name="CreationDate">${escapeXml(createdAt)}</metadata>\n`);
    }
    chunks.push('  <resources>\n');
    chunks.push(`    <object id="1" type="model" name="${escapeXml(name)}">\n`);
    chunks.push('      <mesh>\n');
    chunks.push('        <vertices>\n');

    // Vertices in chunks
    const CHUNK_SIZE = 50000;
    const vertexBlobs: Blob[] = [new Blob(chunks)];
    chunks.length = 0;

    for (let start = 0; start < vertexCount; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE, vertexCount);
        let chunk = '';
        for (let i = start; i < end; i++) {
            const x = vertices[i * 3].toFixed(6);
            const y = vertices[i * 3 + 1].toFixed(6);
            const z = vertices[i * 3 + 2].toFixed(6);
            chunk += `          <vertex x="${x}" y="${y}" z="${z}"/>\n`;
        }
        vertexBlobs.push(new Blob([chunk]));
    }

    vertexBlobs.push(new Blob(['        </vertices>\n        <triangles>\n']));

    // Triangles in chunks
    for (let start = 0; start < triangleCount; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE, triangleCount);
        let chunk = '';
        for (let i = start; i < end; i++) {
            chunk += `          <triangle v1="${indices[i * 3]}" v2="${indices[i * 3 + 1]}" v3="${indices[i * 3 + 2]}"/>\n`;
        }
        vertexBlobs.push(new Blob([chunk]));
    }

    // Footer
    vertexBlobs.push(new Blob([`        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>`]));

    console.log(`[Export3MF] Generated XML in ${vertexBlobs.length} chunks`);
    return new Blob(vertexBlobs, { type: 'application/xml' });
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Export mesh to 3MF format
 *
 * @param mesh - Mesh data to export
 * @param options - Export options
 * @returns Blob containing the 3MF file
 */
export async function exportTo3MF(
    mesh: MeshData,
    options: Export3MFOptions = {}
): Promise<Blob> {
    const { compressionLevel = 6, onProgress } = options;

    onProgress?.(0, 'Creating 3MF package...');

    const zip = new JSZip();

    // Add required files
    zip.file('[Content_Types].xml', CONTENT_TYPES_XML, { date: DETERMINISTIC_ZIP_DATE });
    zip.file('_rels/.rels', RELS_XML, { date: DETERMINISTIC_ZIP_DATE });

    onProgress?.(0.3, 'Generating model data...');

    // Generate model XML (may be string or Blob for streaming)
    const modelData = generateModelXML(mesh, options);
    zip.file('3D/3dmodel.model', modelData, { date: DETERMINISTIC_ZIP_DATE });

    onProgress?.(0.6, 'Compressing...');

    // Generate ZIP blob
    const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: compressionLevel },
    });

    onProgress?.(1.0, '3MF export complete');

    console.log(
        `[Export3MF] Created 3MF: ${(blob.size / 1024 / 1024).toFixed(2)}MB ` +
        `(${mesh.triangleCount.toLocaleString()} triangles)`
    );

    return blob;
}

/**
 * Download mesh as 3MF file
 */
export async function download3MF(
    mesh: MeshData,
    filename: string = 'pot.3mf',
    options: Export3MFOptions = {}
): Promise<void> {
    const blob = await exportTo3MF(mesh, {
        ...options,
        name: options.name ?? filename.replace(/\.3mf$/i, ''),
    });

    // Create download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Estimate 3MF file size
 *
 * 3MF typically produces files 50-66% smaller than binary STL for the same mesh.
 * This is due to:
 * - Shared vertex indices (STL duplicates vertices per triangle)
 * - ZIP compression
 */
export function estimate3MFSize(mesh: { vertexCount: number; triangleCount: number }): number {
    // Base XML overhead
    const xmlOverhead = 1000;
    // Vertex data: ~40 bytes per vertex (x,y,z with 6 decimal places + XML tags)
    const vertexData = mesh.vertexCount * 40;
    // Triangle data: ~35 bytes per triangle (v1,v2,v3 + XML tags)
    const triangleData = mesh.triangleCount * 35;

    // Total uncompressed
    const uncompressed = xmlOverhead + vertexData + triangleData;

    // ZIP compression typically achieves 50-70% reduction on XML
    const compressionRatio = 0.4; // 40% of original size
    return Math.ceil(uncompressed * compressionRatio);
}
