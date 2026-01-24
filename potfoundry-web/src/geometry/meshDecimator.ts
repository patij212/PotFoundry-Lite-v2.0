/**
 * Mesh Decimator - CPU-based mesh simplification using meshoptimizer
 *
 * This module provides mesh decimation (triangle count reduction) while
 * preserving geometric detail. It uses the meshoptimizer.js library which
 * is a WebAssembly port of the high-quality meshoptimizer C++ library.
 *
 * Key features:
 * - Quadric error metrics for optimal vertex placement
 * - Topology preservation to avoid holes
 * - Configurable target ratios
 * - Progress callbacks for long operations
 */

import type { MeshData } from './types';
import { MeshoptSimplifier } from 'meshoptimizer';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for mesh decimation
 */
export interface DecimationOptions {
    /**
     * Target reduction ratio (0.0 to 1.0)
     * - 0.1 = reduce to 10% of original triangles
     * - 0.5 = reduce to 50% of original triangles
     * - 1.0 = no reduction
     */
    targetRatio: number;

    /**
     * Maximum allowed geometric error.
     * Higher values allow more aggressive decimation.
     * Default: 0.01 (1% of bounding box diagonal)
     */
    errorThreshold?: number;

    /**
     * Whether to lock boundary edges (prevent holes at mesh edges)
     * Default: true
     */
    lockBorders?: boolean;

    /**
     * Progress callback for long decimation operations
     */
    onProgress?: (progress: number, message: string) => void;
}

/**
 * Result of mesh decimation
 */
export interface DecimationResult {
    mesh: MeshData;
    originalTriangles: number;
    decimatedTriangles: number;
    reductionPercent: number;
    timeMs: number;
    error?: any;
}

// ============================================================================
// Module State
// ============================================================================

let meshoptReady = false;
let meshoptInitPromise: Promise<void> | null = null;

/**
 * Initialize the meshoptimizer WASM module
 */
async function ensureMeshoptReady(): Promise<void> {
    if (meshoptReady) return;

    if (!meshoptInitPromise) {
        meshoptInitPromise = (async () => {
            try {
                // Check if supported first
                if (!MeshoptSimplifier.supported) {
                    throw new Error('MeshoptSimplifier is not supported in this environment');
                }
                // meshoptimizer exposes a ready promise
                await MeshoptSimplifier.ready;
                meshoptReady = true;
                console.log('[MeshDecimator] meshoptimizer WASM initialized');
            } catch (error) {
                console.error('[MeshDecimator] Failed to initialize meshoptimizer:', error);
                throw error;
            }
        })();
    }

    await meshoptInitPromise;
}

// ============================================================================
// Mesh Analysis
// ============================================================================

/**
 * Calculate optimal decimation ratio based on mesh characteristics
 *
 * Ultra-high resolution meshes can be decimated more aggressively on flat
 * surfaces while preserving detail on curved regions.
 */
export function calculateOptimalDecimationRatio(mesh: MeshData): number {
    const triangleCount = mesh.triangleCount;

    // Target triangles based on common 3D printing/slicer limits
    // Most slicers handle 1-5M triangles well, struggle above 10M
    const TARGET_TRIANGLES = 2_000_000;
    const MAX_TRIANGLES = 5_000_000;

    if (triangleCount <= TARGET_TRIANGLES) {
        // Already within target, no decimation needed
        return 1.0;
    }

    if (triangleCount <= MAX_TRIANGLES) {
        // Light decimation
        return TARGET_TRIANGLES / triangleCount;
    }

    // Aggressive decimation for very large meshes
    // But never go below 5% to maintain reasonable detail
    const ratio = TARGET_TRIANGLES / triangleCount;
    return Math.max(0.05, ratio);
}

/**
 * Estimate file size after decimation
 */
export function estimateDecimatedFileSize(
    originalTriangles: number,
    targetRatio: number
): number {
    const targetTriangles = Math.ceil(originalTriangles * targetRatio);
    // Binary STL: 84 bytes header + 50 bytes per triangle
    return 84 + targetTriangles * 50;
}

// ============================================================================
// Core Decimation
// ============================================================================

/**
 * Decimate a mesh to reduce triangle count while preserving geometry
 *
 * Uses the meshoptimizer simplify algorithm which is based on
 * quadric error metrics for optimal vertex placement.
 *
 * @param mesh - Input mesh data
 * @param options - Decimation options
 * @returns Decimated mesh data
 */
export async function decimateMesh(
    mesh: MeshData,
    options: DecimationOptions
): Promise<DecimationResult> {
    const startTime = performance.now();
    const { targetRatio, errorThreshold = 0.01, lockBorders = true, onProgress } = options;

    onProgress?.(0, 'Initializing decimation engine...');

    // Ensure meshoptimizer is loaded
    await ensureMeshoptReady();

    const originalTriangles = mesh.triangleCount;
    const targetTriangles = Math.max(4, Math.ceil(originalTriangles * targetRatio));
    const targetIndexCount = targetTriangles * 3;

    // If target is >= original, just return the original mesh
    if (targetTriangles >= originalTriangles) {
        return {
            mesh,
            originalTriangles,
            decimatedTriangles: originalTriangles,
            reductionPercent: 0,
            timeMs: performance.now() - startTime,
        };
    }

    onProgress?.(0.1, `Preparing ${originalTriangles.toLocaleString()} triangles...`);

    // Get mesh data
    const vertexPositions = mesh.vertices;
    const indices = mesh.indices;

    // Calculate bounding box for error threshold scaling
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < mesh.vertexCount; i++) {
        const x = vertexPositions[i * 3];
        const y = vertexPositions[i * 3 + 1];
        const z = vertexPositions[i * 3 + 2];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
    }

    const diagonal = Math.sqrt(
        (maxX - minX) ** 2 + (maxY - minY) ** 2 + (maxZ - minZ) ** 2
    );
    const scaledError = errorThreshold * diagonal;

    onProgress?.(0.2, 'Running simplification algorithm...');

    try {
        // MeshoptSimplifier.simplify signature:
        // simplify(indices, vertex_positions, vertex_positions_stride, target_index_count, target_error, flags?)
        // Returns [newIndices, resultError]
        const flags: ('LockBorder')[] = lockBorders ? ['LockBorder'] : [];

        const [newIndices, _resultError] = MeshoptSimplifier.simplify(
            indices,
            vertexPositions,
            12, // stride: 3 floats * 4 bytes = 12
            targetIndexCount,
            scaledError,
            flags
        );

        onProgress?.(0.8, 'Building optimized mesh...');

        const newTriangleCount = newIndices.length / 3;

        // Create new mesh data
        // Note: We keep the original vertices since meshopt simplify just removes
        // unused triangles and updates indices. We can compact later if needed.
        const decimatedMesh: MeshData = {
            vertices: vertexPositions, // Original vertices preserved
            indices: newIndices,
            vertexCount: mesh.vertexCount,
            triangleCount: newTriangleCount,
        };

        onProgress?.(1.0, 'Decimation complete');

        const timeMs = performance.now() - startTime;
        const reductionPercent = ((originalTriangles - newTriangleCount) / originalTriangles) * 100;

        console.log(
            `[MeshDecimator] Decimated ${originalTriangles.toLocaleString()} → ` +
            `${newTriangleCount.toLocaleString()} triangles ` +
            `(${reductionPercent.toFixed(1)}% reduction) in ${timeMs.toFixed(0)}ms`
        );

        return {
            mesh: decimatedMesh,
            originalTriangles,
            decimatedTriangles: newTriangleCount,
            reductionPercent,
            timeMs,
        };
    } catch (error) {
        console.error('[MeshDecimator] Simplification failed:', error);

        // Fallback: return original mesh unchanged
        return {
            mesh,
            originalTriangles,
            decimatedTriangles: originalTriangles,
            reductionPercent: 0,
            timeMs: performance.now() - startTime,
            error // Propagate error so caller can decide to stop
        };
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Compact a mesh by removing unused vertices
 *
 * After decimation, many vertices may no longer be referenced.
 * This function creates a compact mesh with only referenced vertices.
 */
export function compactMesh(mesh: MeshData): MeshData {
    const { vertices, indices, triangleCount } = mesh;

    // Find which vertices are actually used
    const usedVertices = new Set<number>();
    const indexCount = triangleCount * 3;

    for (let i = 0; i < indexCount; i++) {
        usedVertices.add(indices[i]);
    }

    // Create mapping from old to new vertex indices
    const oldToNew = new Map<number, number>();
    let newIndex = 0;

    const sortedUsed = Array.from(usedVertices).sort((a, b) => a - b);
    for (const oldIdx of sortedUsed) {
        oldToNew.set(oldIdx, newIndex++);
    }

    const newVertexCount = usedVertices.size;

    // Create new compact arrays
    const newVertices = new Float32Array(newVertexCount * 3);
    const newIndices = new Uint32Array(indexCount);

    // Copy used vertices
    for (const [oldIdx, newIdx] of oldToNew) {
        newVertices[newIdx * 3] = vertices[oldIdx * 3];
        newVertices[newIdx * 3 + 1] = vertices[oldIdx * 3 + 1];
        newVertices[newIdx * 3 + 2] = vertices[oldIdx * 3 + 2];
    }

    // Remap indices
    for (let i = 0; i < indexCount; i++) {
        newIndices[i] = oldToNew.get(indices[i])!;
    }

    console.log(
        `[MeshDecimator] Compacted mesh: ${mesh.vertexCount} → ${newVertexCount} vertices`
    );

    return {
        vertices: newVertices,
        indices: newIndices,
        vertexCount: newVertexCount,
        triangleCount,
    };
}

/**
 * Check if mesh decimation is available
 */
export async function isDecimationAvailable(): Promise<boolean> {
    try {
        await ensureMeshoptReady();
        return true;
    } catch {
        return false;
    }
}
