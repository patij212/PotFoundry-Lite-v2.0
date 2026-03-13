/**
 * ExportComputer - GPU Compute Shader-based Mesh Generation
 * 
 * This class manages the WebGPU compute pipeline for generating
 * pot meshes on the GPU, matching the visual rendering exactly.
 * 
 * Architecture:
 * - Reuses `styles.wgsl` and `common.wgsl` from preview shaders
 * - Dispatches compute kernels to generate vertices and indices
 * - Reads back results for STL export
 */

import type { MeshData, PotDimensions, MeshQuality, StyleOptions, StyleId } from '../../geometry/types';

// ============================================================================
// Types
// ============================================================================

export interface ExportParams {
    dimensions: PotDimensions;
    quality: MeshQuality;
    styleId: StyleId;
    styleOpts: StyleOptions;
    /** Numeric style ID for shader (0-18) */
    styleIndex: number;
    optimize?: boolean; // New
}

export interface ExportResult {
    mesh: MeshData;
    computeTimeMs: number;
}

export interface ComputeBufferSizes {
    /** Number of vertices (grid points) */
    vertexCount: number;
    /** Number of triangles */
    triangleCount: number;
    /** Vertex buffer size in bytes (position + normal per vertex) */
    vertexBufferBytes: number;
    /** Index buffer size in bytes (3 indices per triangle) */
    indexBufferBytes: number;
}

/**
 * Configuration for a single tile in tiled export
 */
export interface TileConfig {
    /** Starting Z index (inclusive) */
    startZ: number;
    /** Ending Z index (exclusive) */
    endZ: number;
    /** 0-based tile index */
    tileIndex: number;
    /** Total number of tiles */
    totalTiles: number;
    /** Full angular resolution (unchanged per tile) */
    nTheta: number;
    /** Full vertical resolution (for reference) */
    fullNZ: number;
    /** Is this the first tile? */
    isFirst: boolean;
    /** Is this the last tile? */
    isLast: boolean;
}

/**
 * Progress callback for tiled export
 */
export type TiledExportProgressCallback = (tile: number, totalTiles: number, message: string) => void;

// ============================================================================
// Constants
// ============================================================================

/** Floats per vertex: 3 (pos only) */
const FLOATS_PER_VERTEX = 3;
/** Bytes per float */
const BYTES_PER_FLOAT = 4;
/** Indices per triangle */
const INDICES_PER_TRIANGLE = 3;
/** Bytes per index (uint32) */
const BYTES_PER_INDEX = 4;
/** Workgroup size for compute shaders (must match WGSL) */
const WORKGROUP_SIZE = 64;
/** Uniform buffer size (aligned to 16 bytes). 20 floats * 4 = 80 bytes */
const UNIFORM_BUFFER_SIZE = 80;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate buffer sizes for a given mesh resolution
 * 
 * The mesh consists of:
 * - Outer wall: nTheta * nZ grid
 * - Inner wall: nTheta * nZ grid
 * - Rim cap: nTheta * 2 vertices
 * - Bottom surfaces and drain hole: Additional vertices
 * 
 * For simplicity, we use a pessimistic upper bound.
 */
export function calculateBufferSizes(quality: MeshQuality): ComputeBufferSizes {
    const { nTheta, nZ } = quality;
    const nZOuter = nZ + 1;
    const nZInner = nZ + 1;

    // ----- Vertices -----
    // Outer wall: nTheta * nZOuter
    const outerVertices = nTheta * nZOuter;
    // Inner wall: nTheta * nZInner
    const innerVertices = nTheta * nZInner;
    // Drain rings: 2 rings (Under and Top)
    const drainVertices = nTheta * 2;

    const vertexCount = outerVertices + innerVertices + drainVertices;

    // ----- Triangles -----
    // Outer wall: nTheta * nZ * 2 (quads)
    const outerTris = nTheta * nZ * 2;
    // Inner wall: nTheta * nZ * 2
    const innerTris = nTheta * nZ * 2;
    // Rim cap: nTheta * 2
    const rimTris = nTheta * 2;
    // Bottom Under (Outer Base -> Drain Under): nTheta * 2
    const bottomUnderTris = nTheta * 2;
    // Bottom Top (Inner Base -> Drain Top): nTheta * 2
    const bottomTopTris = nTheta * 2;
    // Drain Cylinder (Drain Under -> Drain Top): nTheta * 2
    const drainCylTris = nTheta * 2;

    const triangleCount = outerTris + innerTris + rimTris + bottomUnderTris + bottomTopTris + drainCylTris;

    return {
        vertexCount,
        triangleCount,
        vertexBufferBytes: vertexCount * FLOATS_PER_VERTEX * BYTES_PER_FLOAT,
        indexBufferBytes: triangleCount * INDICES_PER_TRIANGLE * BYTES_PER_INDEX,
    };
}

/**
 * WebGPU max buffer size limit (conservative for compatibility)
 * Most GPUs support 1-2GB buffers, but we use 256MB as a safe limit
 * to leave headroom for other GPU operations.
 */
const MAX_BUFFER_SIZE_BYTES = 256 * 1024 * 1024; // 256 MB per buffer
const ABSOLUTE_MAX_BUFFER = 1024 * 1024 * 1024; // 1 GB absolute max

/**
 * Calculate the maximum safe resolution for GPU export
 * Returns the max nTheta and nZ that will fit within buffer limits
 */
export function calculateMaxSafeResolution(device: GPUDevice): { maxTheta: number; maxZ: number } {
    // Query device limits if available
    const maxBufferSize = device.limits?.maxStorageBufferBindingSize ?? MAX_BUFFER_SIZE_BYTES;
    const safeBufferSize = Math.min(maxBufferSize * 0.8, ABSOLUTE_MAX_BUFFER); // 80% of limit for safety

    // Index buffer is the limiting factor: triangleCount * 12 bytes
    // triangleCount ≈ 4 * nTheta * nZ (walls) + 8 * nTheta (caps/rim)
    // For square mesh: nTheta = nZ = n, so triangleCount ≈ 4n² + 8n ≈ 4n²
    // So: 4n² * 12 ≤ safeBufferSize => n² ≤ safeBufferSize / 48
    const maxN = Math.floor(Math.sqrt(safeBufferSize / 48));

    // Clamp to reasonable values
    const maxTheta = Math.min(maxN, 8192);
    const maxZ = Math.min(maxN, 8192);

    return { maxTheta, maxZ };
}

/**
 * Validate buffer sizes against GPU limits
 * Throws descriptive error if limits exceeded
 */
export function validateBufferSizes(
    sizes: ComputeBufferSizes,
    device: GPUDevice
): void {
    const maxBufferSize = device.limits?.maxStorageBufferBindingSize ?? MAX_BUFFER_SIZE_BYTES;

    if (sizes.vertexBufferBytes > maxBufferSize) {
        const maxRes = calculateMaxSafeResolution(device);
        throw new Error(
            `Vertex buffer (${(sizes.vertexBufferBytes / 1024 / 1024).toFixed(0)}MB) exceeds GPU limit (${(maxBufferSize / 1024 / 1024).toFixed(0)}MB). ` +
            `Try reducing resolution to ${maxRes.maxTheta}x${maxRes.maxZ} or lower.`
        );
    }

    if (sizes.indexBufferBytes > maxBufferSize) {
        const maxRes = calculateMaxSafeResolution(device);
        throw new Error(
            `Index buffer (${(sizes.indexBufferBytes / 1024 / 1024).toFixed(0)}MB) exceeds GPU limit (${(maxBufferSize / 1024 / 1024).toFixed(0)}MB). ` +
            `Try reducing resolution to ${maxRes.maxTheta}x${maxRes.maxZ} or lower.`
        );
    }

    console.log(`[ExportComputer] Buffer sizes OK: ` +
        `vertices=${(sizes.vertexBufferBytes / 1024 / 1024).toFixed(1)}MB, ` +
        `indices=${(sizes.indexBufferBytes / 1024 / 1024).toFixed(1)}MB, ` +
        `GPU max=${(maxBufferSize / 1024 / 1024).toFixed(0)}MB`);
}

/**
 * Calculate the number of workgroups needed for a given element count
 */
export function calculateWorkgroups(elementCount: number): number {
    return Math.ceil(elementCount / WORKGROUP_SIZE);
}

/**
 * Calculate tile configuration for tiled export
 * Divides the Z-axis into tiles that fit within GPU buffer limits
 * 
 * @param nTheta - Angular resolution
 * @param nZ - Total vertical resolution
 * @param device - GPU device for querying limits
 * @returns Array of TileConfig, or single tile if no splitting needed
 */
export function calculateTileConfig(
    nTheta: number,
    nZ: number,
    device: GPUDevice
): TileConfig[] {
    const maxBufferSize = device.limits?.maxStorageBufferBindingSize ?? MAX_BUFFER_SIZE_BYTES;

    // Increasing to 16MB to allow larger, healthier tiles (avoid degenerate strips)
    // Meshoptimizer typically provides 16MB+ heap, so 2MB was likely too restrictive.
    const WASM_SAFE_LIMIT = 16 * 1024 * 1024;
    const safeBufferSize = Math.min(maxBufferSize * 0.7, WASM_SAFE_LIMIT);

    // Calculate max nZ per tile that fits in buffer
    // Index buffer is limiting factor: ~4 * nTheta * nZ * 12 bytes
    // So: 48 * nTheta * nZ <= safeBufferSize
    // => nZ <= safeBufferSize / (48 * nTheta)
    let maxZPerTile = Math.floor(safeBufferSize / (48 * nTheta));

    // Safety: Ensure at least 2 Z rows per tile (minimum for a valid mesh)
    if (maxZPerTile < 2) {
        console.warn(`[ExportComputer] nTheta=${nTheta} is too large for GPU. Forcing minimum tile size.`);
        maxZPerTile = 2;
    }

    // If full mesh fits, return single tile
    if (nZ <= maxZPerTile) {
        return [{
            startZ: 0,
            endZ: nZ,
            tileIndex: 0,
            totalTiles: 1,
            nTheta,
            fullNZ: nZ,
            isFirst: true,
            isLast: true,
        }];
    }

    // Calculate number of tiles needed
    // Use disjoint tiles (coincident vertices at seams) - verified valid for STL/3MF
    const effectiveZPerTile = maxZPerTile;
    const numTiles = Math.ceil(nZ / effectiveZPerTile);

    // Safety cap: Limit to 2000 tiles max to prevent runaway
    // Raised from 100 to 2000 to support 4MB small-chunk tiling for 8k exports
    const MAX_TILES = 2000;
    if (numTiles > MAX_TILES) {
        throw new Error(
            `Resolution ${nTheta}x${nZ} would require ${numTiles} tiles, exceeding limit of ${MAX_TILES}. ` +
            `Try reducing nTheta to allow larger Z tiles.`
        );
    }

    console.log(`[ExportComputer] Tiled export: ${numTiles} tiles, ~${effectiveZPerTile} Z-rows each (max ${maxZPerTile})`);

    const tiles: TileConfig[] = [];
    for (let i = 0; i < numTiles; i++) {
        const startZ = i * effectiveZPerTile;
        const endZ = Math.min(startZ + maxZPerTile, nZ);

        tiles.push({
            startZ,
            endZ,
            tileIndex: i,
            totalTiles: numTiles,
            nTheta,
            fullNZ: nZ,
            isFirst: i === 0,
            isLast: i === numTiles - 1,
        });
    }

    return tiles;
}

/**
 * Pack style options into a Float32Array for GPU upload.
 * Uses buildStyleParamPayload from styleParams.ts to ensure exact parity with preview.
 */
import { buildStyleParamPayload } from '../../utils/styleParams';

function packStyleParams(opts: StyleOptions, styleId: string): Float32Array {
    // Use the same packer as preview to ensure parameter order matches shader
    const [_, paramArray] = buildStyleParamPayload(styleId, opts as Record<string, unknown>);
    return new Float32Array(paramArray);
}

// ============================================================================
// ExportComputer Class
// ============================================================================

export class ExportComputer {
    private device: GPUDevice;
    private vertexPipeline: GPUComputePipeline | null = null;
    private indexPipeline: GPUComputePipeline | null = null;
    private analyzePipeline: GPUComputePipeline | null = null; // 2x2 LOD analysis
    private dilatePipeline: GPUComputePipeline | null = null; // Dilation filter
    private analyze4x4Pipeline: GPUComputePipeline | null = null; // 4x4 ultra-flat analysis
    private adaptiveIndexPipeline: GPUComputePipeline | null = null; // Adaptive indexing
    private scanPipeline: GPUComputePipeline | null = null; // Profile Scanner
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private scanBindGroupLayout: GPUBindGroupLayout | null = null;
    private uniformBuffer: GPUBuffer | null = null;
    private styleParamBuffer: GPUBuffer | null = null;
    private dummyBuffer: GPUBuffer | null = null;
    private initialized: boolean = false;

    constructor(device: GPUDevice) {
        this.device = device;
    }

    /**
     * Initialize compute pipelines
     * 
     * @param computeShaderSource - Full WGSL source including styles.wgsl and export kernels
     */
    async init(computeShaderSource: string, scanShaderSource: string): Promise<void> {
        if (this.initialized) {
            console.warn('[ExportComputer] Already initialized');
            return;
        }

        try {
            // Create dummy buffer for unused bindings (to avoid validation errors)
            this.dummyBuffer = this.device.createBuffer({
                label: 'export_dummy',
                size: 16, // Min size
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            });

            // Create export shader module
            const shaderModule = this.device.createShaderModule({
                label: 'pot_export_compute',
                code: computeShaderSource,
            });

            // Create scanner shader module
            const scanShaderModule = this.device.createShaderModule({
                label: 'scan_compute',
                code: scanShaderSource,
            });

            // Create bind group layout
            this.bindGroupLayout = this.device.createBindGroupLayout({
                label: 'export_bind_group_layout',
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'uniform' },
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'read-only-storage' },
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'storage' },
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'storage' },
                    },
                    {
                        binding: 4,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'storage' }, // lod_flags
                    },
                    {
                        binding: 5,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'storage' }, // atomic_counter
                    },
                    {
                        binding: 6,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'storage' }, // lod_flags_temp
                    },
                    {
                        binding: 7,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: 'read-only-storage' }, // z_lut (Optional)
                    }
                ],
            });

            const pipelineLayout = this.device.createPipelineLayout({
                label: 'export_pipeline_layout',
                bindGroupLayouts: [this.bindGroupLayout],
            });

            // Create uniform buffer
            this.uniformBuffer = this.device.createBuffer({
                label: 'export_uniforms',
                size: UNIFORM_BUFFER_SIZE,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            // Create style parameter buffer
            this.styleParamBuffer = this.device.createBuffer({
                label: 'export_style_params',
                size: 48 * BYTES_PER_FLOAT,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });

            // Create compute pipelines
            this.vertexPipeline = await this.device.createComputePipelineAsync({
                label: 'calc_vertices',
                layout: pipelineLayout,
                compute: {
                    module: shaderModule,
                    entryPoint: 'calc_vertices',
                },
            });

            this.indexPipeline = await this.device.createComputePipelineAsync({
                label: 'calc_indices',
                layout: pipelineLayout,
                compute: {
                    module: shaderModule,
                    entryPoint: 'calc_indices',
                },
            });

            // Initialize Optimization Kernels (Multi-Pass: 2x2 -> 4x4)
            try {
                this.analyzePipeline = await this.device.createComputePipelineAsync({
                    label: 'analyze_lod',
                    layout: pipelineLayout,
                    compute: { module: shaderModule, entryPoint: 'analyze_lod' },
                });
                this.dilatePipeline = await this.device.createComputePipelineAsync({
                    label: 'dilate_lod',
                    layout: pipelineLayout,
                    compute: { module: shaderModule, entryPoint: 'dilate_lod' },
                });
                this.analyze4x4Pipeline = await this.device.createComputePipelineAsync({
                    label: 'analyze_lod_4x4',
                    layout: pipelineLayout,
                    compute: { module: shaderModule, entryPoint: 'analyze_lod_4x4' },
                });
                this.adaptiveIndexPipeline = await this.device.createComputePipelineAsync({
                    label: 'calc_indices_adaptive',
                    layout: pipelineLayout,
                    compute: { module: shaderModule, entryPoint: 'calc_indices_adaptive' },
                });
                console.log('[ExportComputer] Multi-pass optimization kernels loaded (2x2 + 4x4)');
            } catch (e) {
                console.warn('[ExportComputer] Opt kernels missing:', e);
            }

            // Initialize Scanner Pipeline (Separate Layout)
            try {
                // Scan Layout: 0:Uniforms, 1:StyleParams, 2:MetricOutput (Storage)
                this.scanBindGroupLayout = this.device.createBindGroupLayout({
                    label: 'scan_bind_group_layout',
                    entries: [
                        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                    ]
                });
                const scanLayout = this.device.createPipelineLayout({
                    bindGroupLayouts: [this.scanBindGroupLayout]
                });

                // We need to fetch the scan shader code. 
                // It interacts with styles.wgsl, which is included in computeShaderSource via concatenation in helper.
                // HOWEVER, `scan_profile.wgsl` has different bindings than `pot_export.wgsl`.
                // We assume computeShaderSource contains EVERYTHING (scan kernel + export kernels).
                // They can coexist in one module if bindings don't conflict or we use different pipeline layouts.
                // WGSL entry points define which bindings they use. Use separate BindGroups.

                this.scanPipeline = await this.device.createComputePipelineAsync({
                    label: 'scan_profile',
                    layout: scanLayout,
                    compute: { module: scanShaderModule, entryPoint: 'scan_metrics' } // Use scan module
                });
            } catch (e) {
                console.warn('[ExportComputer] Scanner init failed:', e);
            }

            this.initialized = true;
            console.log('[ExportComputer] Initialized successfully');

        } catch (error) {
            console.error('[ExportComputer] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Generate mesh using GPU compute
     * @param params Export parameters
     * @param tileInfo Optional tile information for tiled export
     */
    async compute(params: ExportParams, tileInfo?: {
        startZ: number;      // Global Z integer offset
        fullNZ: number;      // Full pot Z height (integer)
        tileFlags: number;   // 1=first, 2=last, 4=UseLUT
        lut?: Float32Array;  // Optional Adaptive LUT
    }): Promise<ExportResult> {
        if (!this.initialized || !this.vertexPipeline || !this.indexPipeline || !this.bindGroupLayout) {
            throw new Error('[ExportComputer] Not initialized. Call init() first.');
        }

        const startTime = performance.now();
        const sizes = calculateBufferSizes(params.quality);
        const { nTheta, nZ } = params.quality;

        // ----- Validate Buffer Sizes Against GPU Limits -----
        validateBufferSizes(sizes, this.device);

        // LUT Buffer (Optional)
        let lutBuffer: GPUBuffer | null = null;
        if (tileInfo?.lut) {
            lutBuffer = this.device.createBuffer({
                label: 'z_lut',
                size: tileInfo.lut.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Float32Array<ArrayBufferLike> vs GPUAllowSharedBufferSource strict mode mismatch
            this.device.queue.writeBuffer(lutBuffer, 0, tileInfo.lut as any);
        }

        // ----- Step 1: Write Uniforms -----
        const s = params.styleOpts;
        const spinTurns = s.spinTurns ?? 0;
        const spinPhaseDeg = s.spinPhaseDeg ?? 0;
        const spinPhase = spinPhaseDeg * (Math.PI / 180.0);
        const spinCurve = s.spinCurveExp ?? 1;
        const bellAmp = s.bellAmp ?? 0;
        const bellCenter = s.bellCenter ?? 0.5;
        const bellWidth = s.bellWidth ?? 0.22;
        const seamAngle = s.seamAngle ?? 0;

        const uniformData = new Float32Array([
            // 0-3
            params.dimensions.H,
            params.dimensions.Rt,
            params.dimensions.Rb,
            params.dimensions.tWall,
            // 4-7
            params.dimensions.tBottom,
            params.dimensions.rDrain,
            params.dimensions.expn,
            Math.fround(nTheta),
            // 8-11
            Math.fround(nZ),
            Math.fround(params.styleIndex),
            spinTurns,
            spinPhase,
            // 12-15
            spinCurve,
            bellAmp,
            bellCenter,
            bellWidth,
            // 16-19
            seamAngle,
            Math.fround(tileInfo?.startZ ?? 0),   // chunk4.y: startZ (integer)
            Math.fround(tileInfo?.fullNZ ?? 0),   // chunk4.z: fullNZ (integer)
            (tileInfo?.tileFlags ?? 0) | (tileInfo?.lut ? 4 : 0) // chunk4.w: flags (1=first, 2=last, 4=UseLUT)
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer!, 0, uniformData.buffer);

        // ----- Step 2: Write Style Parameters -----
        const styleParamData = packStyleParams(params.styleOpts, params.styleId);
        this.device.queue.writeBuffer(this.styleParamBuffer!, 0, styleParamData.buffer);

        // ----- Step 3: Create Output & Aux Buffers -----
        const vertexBuffer = this.device.createBuffer({
            label: 'export_vertices',
            size: sizes.vertexBufferBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        const indexBuffer = this.device.createBuffer({
            label: 'export_indices',
            size: sizes.indexBufferBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        // Optimization Buffers
        const lodFlagsBuffer = this.device.createBuffer({
            label: 'lod_flags',
            size: sizes.vertexCount * 4, // 1 uint per vertex (aligned to 4 bytes)
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        const atomicBuffer = this.device.createBuffer({
            label: 'atomic_counter',
            size: 4, // 1 uint32
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });

        // ----- Step 4: Create Staging Buffers for Readback -----
        const vertexStagingBuffer = this.device.createBuffer({
            label: 'export_vertices_staging',
            size: sizes.vertexBufferBytes,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        // Temp buffer for dilation pass (ping-pong)
        const lodFlagsTempBuffer = this.device.createBuffer({
            label: 'lod_flags_temp',
            size: sizes.vertexCount * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        const indexStagingBuffer = this.device.createBuffer({
            label: 'export_indices_staging',
            size: sizes.indexBufferBytes,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        const atomicStagingBuffer = this.device.createBuffer({
            label: 'atomic_staging',
            size: 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        // ----- Step 5: Create Bind Group -----
        const bindGroup = this.device.createBindGroup({
            label: 'export_bind_group',
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer! } },
                { binding: 1, resource: { buffer: this.styleParamBuffer! } },
                { binding: 2, resource: { buffer: vertexBuffer } },
                { binding: 3, resource: { buffer: indexBuffer } },
                { binding: 4, resource: { buffer: lodFlagsBuffer } },
                { binding: 5, resource: { buffer: atomicBuffer } },
                { binding: 6, resource: { buffer: lodFlagsTempBuffer } }, // Temporary Dilation Buffer
                { binding: 7, resource: { buffer: lutBuffer ?? this.dummyBuffer! } } // Z-LUT (Use dummy if null)
            ],
        });

        // ----- Step 6: Dispatch Compute Shaders -----
        const commandEncoder = this.device.createCommandEncoder({
            label: 'export_command_encoder',
        });

        // RESET Atomic Counter
        const zero = new Uint32Array([0]);
        this.device.queue.writeBuffer(atomicBuffer, 0, zero.buffer);

        // Helper for 2D dispatch to bypass 65535 limit
        const getDispatchSize = (totalWorkgroups: number) => {
            const MAX_DIM = 65535;
            if (totalWorkgroups <= MAX_DIM) {
                return [totalWorkgroups, 1, 1];
            }
            const y = Math.ceil(totalWorkgroups / MAX_DIM);
            return [MAX_DIM, y, 1];
        };

        // Pass 1: Vertex Gen (Always run)
        const vertexWorkgroups = calculateWorkgroups(sizes.vertexCount);
        const [vx, vy, vz] = getDispatchSize(vertexWorkgroups);
        const vertexPass = commandEncoder.beginComputePass({ label: 'calc_vertices_pass' });
        vertexPass.setPipeline(this.vertexPipeline);
        vertexPass.setBindGroup(0, bindGroup);
        vertexPass.dispatchWorkgroups(vx, vy, vz);
        vertexPass.end();

        // Pass 2/3: Indices
        const useOptimization = params.optimize && this.analyzePipeline !== null && this.adaptiveIndexPipeline !== null;
        console.log(`[ExportComputer] Optimization: ${useOptimization} (Req: ${params.optimize}, Pipes: ${!!this.analyzePipeline}/${!!this.adaptiveIndexPipeline})`);

        if (useOptimization) {
            // Pass 2A: Analyze LOD 2x2 (Initial flat candidate detection)
            const analyzePass = commandEncoder.beginComputePass({ label: 'analyze_lod_2x2_pass' });
            analyzePass.setPipeline(this.analyzePipeline!);
            analyzePass.setBindGroup(0, bindGroup);
            analyzePass.dispatchWorkgroups(vx, vy, vz); // Same grid as vertices
            analyzePass.end();

            // Pass 2A.5: Dilation (Buffer Zone)
            // Reads Binding 4 (lod_flags), Writes Binding 6 (lod_flags_temp)
            if (this.dilatePipeline) {
                // Run multiple iterations to extend protection range (e.g. 2 passes = radius 2)
                const ITERATIONS = 2;

                for (let k = 0; k < ITERATIONS; k++) {
                    const dilatePass = commandEncoder.beginComputePass({ label: `dilate_lod_pass_${k}` });
                    dilatePass.setPipeline(this.dilatePipeline);
                    dilatePass.setBindGroup(0, bindGroup);
                    // Grid is Quad Grid (nTheta * nZ).
                    dilatePass.dispatchWorkgroups(vx, vy, vz);
                    dilatePass.end();

                    // Copy Dilation Result Back to Main Buffer to propagate
                    // lodFlagsTempBuffer -> lodFlagsBuffer
                    commandEncoder.copyBufferToBuffer(
                        lodFlagsTempBuffer, 0,
                        lodFlagsBuffer, 0,
                        sizes.vertexCount * 4
                    );
                }
            }

            // Pass 2B: Analyze LOD 4x4 (Ultra-flat block detection)
            // Only runs if 4x4 pipeline is available
            if (this.analyze4x4Pipeline) {
                // 4x4 blocks: grid is nTheta/4 x nZ/4
                const blocks4x4 = Math.ceil((nTheta / 4) * (nZ / 4));
                const workgroups4x4 = calculateWorkgroups(blocks4x4);
                const [b4x, b4y, b4z] = getDispatchSize(workgroups4x4);

                const analyze4x4Pass = commandEncoder.beginComputePass({ label: 'analyze_lod_4x4_pass' });
                analyze4x4Pass.setPipeline(this.analyze4x4Pipeline);
                analyze4x4Pass.setBindGroup(0, bindGroup);
                analyze4x4Pass.dispatchWorkgroups(b4x, b4y, b4z);
                analyze4x4Pass.end();
            }

            // Pass 3: Adaptive Indices (Triangle Pass)
            const indexWorkgroups = calculateWorkgroups(sizes.triangleCount); // Base count, reduced inside shader
            const [ix, iy, iz] = getDispatchSize(indexWorkgroups);

            const adaptivePass = commandEncoder.beginComputePass({ label: 'adaptive_indices_pass' });
            adaptivePass.setPipeline(this.adaptiveIndexPipeline!);
            adaptivePass.setBindGroup(0, bindGroup);
            adaptivePass.dispatchWorkgroups(ix, iy, iz);
            adaptivePass.end();

            // C. Copy Atomic Count (to know how many indices we actually wrote)
            commandEncoder.copyBufferToBuffer(atomicBuffer, 0, atomicStagingBuffer, 0, 4);

        } else {
            // Legacy Path (Full Res)
            const indexWorkgroups = calculateWorkgroups(sizes.triangleCount);
            const [ix, iy, iz] = getDispatchSize(indexWorkgroups);

            const indexPass = commandEncoder.beginComputePass({ label: 'calc_indices_pass' });
            indexPass.setPipeline(this.indexPipeline);
            indexPass.setBindGroup(0, bindGroup);
            indexPass.dispatchWorkgroups(ix, iy, iz);
            indexPass.end();
        }

        // ----- Step 7: Copy Results to Staging Buffers -----
        commandEncoder.copyBufferToBuffer(
            vertexBuffer, 0,
            vertexStagingBuffer, 0,
            sizes.vertexBufferBytes
        );
        commandEncoder.copyBufferToBuffer(
            indexBuffer, 0,
            indexStagingBuffer, 0,
            sizes.indexBufferBytes
        );

        // Submit commands
        this.device.queue.submit([commandEncoder.finish()]);

        // ----- Step 8: Map Staging Buffers and Read Back Data -----
        const mapPromises = [
            vertexStagingBuffer.mapAsync(GPUMapMode.READ),
            indexStagingBuffer.mapAsync(GPUMapMode.READ),
        ];

        if (useOptimization) {
            mapPromises.push(atomicStagingBuffer.mapAsync(GPUMapMode.READ));
        }

        await Promise.all(mapPromises);

        // Copy data from mapped buffers
        const vertexArrayBuffer = vertexStagingBuffer.getMappedRange();
        const vertices = new Float32Array(vertexArrayBuffer.slice(0));

        let indices: Uint32Array;
        let finalTriangleCount = sizes.triangleCount;

        if (useOptimization) {
            const atomicArray = new Uint32Array(atomicStagingBuffer.getMappedRange());
            const indexCount = atomicArray[0];
            finalTriangleCount = indexCount / 3;

            // Copy only valid indices
            const indexArrayBuffer = indexStagingBuffer.getMappedRange();
            indices = new Uint32Array(indexArrayBuffer.slice(0, indexCount * 4));

            atomicStagingBuffer.unmap();
        } else {
            const indexArrayBuffer = indexStagingBuffer.getMappedRange();
            indices = new Uint32Array(indexArrayBuffer.slice(0));
        }

        // Unmap buffers
        vertexStagingBuffer.unmap();
        indexStagingBuffer.unmap();

        // ----- Step 9: Cleanup Buffers -----
        vertexBuffer.destroy();
        indexBuffer.destroy();
        vertexStagingBuffer.destroy();
        indexStagingBuffer.destroy();
        lodFlagsBuffer.destroy();
        atomicBuffer.destroy();
        atomicStagingBuffer.destroy();
        lodFlagsTempBuffer.destroy();
        // Don't destroy dummyBuffer, it's persistent (created in init)

        const computeTimeMs = performance.now() - startTime;
        console.log(`[ExportComputer] Compute complete: ${sizes.vertexCount} vertices, ${finalTriangleCount} triangles in ${computeTimeMs.toFixed(1)}ms`);

        return {
            mesh: {
                vertices,
                indices,
                vertexCount: sizes.vertexCount,
                triangleCount: finalTriangleCount,
            },
            computeTimeMs,
        };
    }

    /**
     * Generate mesh using tiled GPU compute for ultra-high resolutions
     * Automatically splits the mesh into tiles that fit within GPU buffer limits
     * 
     * @param params - Export parameters (uses full resolution, tiling is automatic)
     * @param onProgress - Optional progress callback
     * @returns Combined mesh from all tiles
     */
    async computeTiled(
        params: ExportParams,
        onProgress?: TiledExportProgressCallback
    ): Promise<ExportResult> {
        if (!this.initialized || !this.vertexPipeline || !this.indexPipeline) {
            throw new Error('[ExportComputer] Not initialized. Call init() first.');
        }

        const startTime = performance.now();
        const { nTheta, nZ } = params.quality;

        // Calculate tile configuration
        let tiles = calculateTileConfig(nTheta, nZ, this.device);
        let adaptiveLut: Float32Array | undefined;

        // ----- HYBRID ADAPTIVE SCANNER -----
        // If optimizing, run the high-res 200k scan to build a smart Z-LUT
        if (params.optimize && this.scanPipeline) {
            console.log('[ExportComputer] Running Adaptive Details Scanner...');
            try {
                const metrics = await this.scanProfile(params);
                adaptiveLut = this.buildAdaptiveLut(metrics);

                // Re-tile based on LUT size
                const newNZ = adaptiveLut.length;
                console.log(`[ExportComputer] Adaptive Mesh: Reduced Z from ${nZ} to ${newNZ} optimized rows.`);

                // Recalculate tiles for the NEW nZ (since we render 1:1 on the LUT)
                tiles = calculateTileConfig(nTheta, newNZ, this.device);

            } catch (e) {
                console.error('[ExportComputer] Scanner failed, falling back to grid:', e);
            }
        }

        // Optimization Setup
        let decimateFn: ((mesh: MeshData, opts: { targetRatio: number; errorThreshold?: number; lockBorders?: boolean }) => Promise<{ mesh: MeshData; error?: unknown }>) | null = null;
        let compactFn: ((mesh: MeshData) => MeshData) | null = null;
        let globalTargetRatio = 1.0;
        const TARGET_TRIS = 2_000_000;

        if (params.optimize) {
            // Estimate total triangles to determine ratio
            const totalEstTriangles = calculateBufferSizes(params.quality).triangleCount;

            if (totalEstTriangles > TARGET_TRIS) {
                globalTargetRatio = Math.max(0.05, TARGET_TRIS / totalEstTriangles);
                console.log(`[ExportComputer] Optimization enabled. Global target ratio: ${globalTargetRatio.toFixed(4)} (Est. ${totalEstTriangles.toLocaleString()} -> ~2M)`);

                onProgress?.(0, tiles.length, 'Initializing optimizer...');
                const mod = await import('../../geometry/meshDecimator');
                decimateFn = mod.decimateMesh;
                compactFn = mod.compactMesh;
            }
        }

        if (tiles.length === 1) {
            // Single tile - use regular GPU compute (no tiling needed)
            onProgress?.(1, 1, 'Generating mesh (GPU)...');
            const result = await this.compute(params);

            // Optimization for single tile
            if (decimateFn && globalTargetRatio < 1.0) {
                if (result.mesh.triangleCount > TARGET_TRIS) {
                    onProgress?.(1, 1, 'Optimizing mesh...');
                    try {
                        const decResult = await decimateFn(result.mesh, {
                            targetRatio: globalTargetRatio,
                            lockBorders: true // Keep consistent
                        });
                        result.mesh = compactFn!(decResult.mesh);
                    } catch (e) {
                        console.warn('[ExportComputer] Optimization failed', e);
                    }
                }
            }

            const computeTimeMs = performance.now() - startTime;
            console.log(`[ExportComputer] GPU compute complete: ${result.mesh.triangleCount} triangles in ${computeTimeMs.toFixed(1)}ms`);

            return {
                mesh: result.mesh,
                computeTimeMs,
            };
        }

        // Tiled GPU Execution
        console.log(`[ExportComputer] Starting tiled GPU export (${tiles.length} tiles)...`);

        const tileMeshes: MeshData[] = [];
        let totalComputeTime = 0;

        for (let i = 0; i < tiles.length; i++) {
            const tile = tiles[i];

            // Construct parameters for this specific tile
            const tileParams: ExportParams = {
                ...params,
                quality: {
                    nTheta: tile.nTheta,
                    nZ: tile.endZ - tile.startZ
                }
            };

            // Pass global tiling info to shader
            const tileInfo = {
                startZ: tile.startZ,          // Global Z Start Index (Integer)
                fullNZ: tile.fullNZ,          // Full Pot Height (nZ total Integer)
                tileFlags: (tile.isFirst ? 1 : 0) | (tile.isLast ? 2 : 0)
            };

            const msg = `Generating tile ${i + 1}/${tiles.length}`;
            onProgress?.(i, tiles.length, msg);

            // Execute GPU compute for this tile
            const result = await this.compute(tileParams, tileInfo);
            totalComputeTime += result.computeTimeMs;

            let meshToStore = result.mesh;

            // Per-Tile Optimization
            if (decimateFn && globalTargetRatio < 1.0) {
                try {
                    const decResult = await decimateFn(meshToStore, {
                        targetRatio: globalTargetRatio,
                        errorThreshold: 0.005,
                        lockBorders: true, // CRITICAL: Preserves seams for valid stitching
                    });

                    // Check for silent failures (caught inside decimateMesh)
                    if (decResult.error) {
                        console.warn(`[ExportComputer] Tile ${i} optimization returned error, disabling for remaining tiles.`, decResult.error);
                        globalTargetRatio = 1.0;
                        // Use original mesh (decResult.mesh is just original fallback in error case)
                        meshToStore = decResult.mesh;
                        // DO NOT nullify result.mesh here, as we are using it!
                    } else {
                        // Compact immediately to free memory
                        meshToStore = compactFn!(decResult.mesh);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentional: nullify for GC after data extraction
                        (result.mesh.vertices as any) = null;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Intentional: nullify for GC after data extraction
                        (result.mesh.indices as any) = null;
                    }

                } catch (e) {
                    console.warn(`[ExportComputer] Tile ${i} optimization failed for tile ${i}, disabling optimization for remaining tiles to prevent cascade failure.`, e);
                    // Critical: If one tile fails (likely OOM), stop trying to optimize subsequent tiles.
                    // This prevents thousands of console errors and potential browser freeze.
                    globalTargetRatio = 1.0;
                }
            }

            tileMeshes.push(meshToStore);

            // Allow UI to update
            await new Promise(r => setTimeout(r, 0));
        }

        onProgress?.(tiles.length, tiles.length, 'Stitching tiles...');

        // Stitch all tiles into a single mesh
        // This effectively concatenates buffers and offsets indices
        const finalMesh = this.stitchTileMeshes(tileMeshes, tiles, params.dimensions.H);

        const totalTime = performance.now() - startTime;
        console.log(`[ExportComputer] Tiled GPU export complete: ${finalMesh.triangleCount.toLocaleString()} triangles in ${totalTime.toFixed(1)}ms`);

        return {
            mesh: finalMesh,
            computeTimeMs: totalComputeTime
        };
    }

    /**
     * Stitch multiple tile meshes into a single mesh
     * Uses pre-allocated TypedArrays to handle large meshes efficiently
     */
    private stitchTileMeshes(
        tileMeshes: MeshData[],
        _tiles: TileConfig[], // Reserved for future vertex deduplication
        _totalH: number // Reserved for future vertex deduplication
    ): MeshData {
        if (tileMeshes.length === 1) {
            return tileMeshes[0];
        }

        // Calculate total sizes upfront
        let totalVertexFloats = 0;
        let totalIndices = 0;
        for (const mesh of tileMeshes) {
            totalVertexFloats += mesh.vertices.length;
            totalIndices += mesh.indices.length;
        }

        console.log(`[ExportComputer] Stitching ${tileMeshes.length} tiles: ` +
            `${totalVertexFloats / 3} total vertices, ${totalIndices / 3} total triangles`);

        // Pre-allocate TypedArrays
        const allVertices = new Float32Array(totalVertexFloats);
        const allIndices = new Uint32Array(totalIndices);

        let vertexWritePos = 0;
        let indexWritePos = 0;
        let vertexOffset = 0;

        for (let t = 0; t < tileMeshes.length; t++) {
            const mesh = tileMeshes[t];

            // Copy vertices directly into pre-allocated buffer
            allVertices.set(mesh.vertices, vertexWritePos);
            vertexWritePos += mesh.vertices.length;

            // Copy and remap indices
            for (let i = 0; i < mesh.indices.length; i++) {
                allIndices[indexWritePos + i] = mesh.indices[i] + vertexOffset;
            }
            indexWritePos += mesh.indices.length;

            vertexOffset += mesh.vertexCount;
        }

        return {
            vertices: allVertices,
            indices: allIndices,
            vertexCount: totalVertexFloats / 3,
            triangleCount: totalIndices / 3,
        };
    }

    /**
     * Check if tiled export is needed for given resolution
     */
    needsTiling(nTheta: number, nZ: number): boolean {
        const tiles = calculateTileConfig(nTheta, nZ, this.device);
        return tiles.length > 1;
    }

    /**
     * Get number of tiles needed for given resolution
     */
    getTileCount(nTheta: number, nZ: number): number {
        const tiles = calculateTileConfig(nTheta, nZ, this.device);
        return tiles.length;
    }

    /**
     * Check if the computer is initialized and ready
     */
    isReady(): boolean {
        return this.initialized && this.device !== null && this.vertexPipeline !== null;
    }

    /**
     * Cleanup GPU resources
     */
    destroy(): void {
        this.uniformBuffer?.destroy();
        this.styleParamBuffer?.destroy();
        this.uniformBuffer = null;
        this.styleParamBuffer = null;
        this.vertexPipeline = null;
        this.indexPipeline = null;
        this.bindGroupLayout = null;
        this.initialized = false;
        console.log('[ExportComputer] Destroyed');
    }

    // ============================================================================
    // ADAPTIVE SCANNER METHODS
    // ============================================================================

    private async scanProfile(params: ExportParams): Promise<Float32Array> {
        if (!this.scanPipeline || !this.scanBindGroupLayout) throw new Error('Scanner not init');

        const SCAN_RES = 100000; // 100k points (2 microns @ 200mm)
        const metricBufferSize = SCAN_RES * 4;

        const metricBuffer = this.device.createBuffer({
            label: 'scan_metrics',
            size: metricBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });

        const metricStaging = this.device.createBuffer({
            label: 'scan_staging',
            size: metricBufferSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        });

        const ub = this.device.createBuffer({
            size: UNIFORM_BUFFER_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Populate Uniforms (Simplified)
        const s = params.styleOpts;
        const uData = new Float32Array(20);
        uData[0] = params.dimensions.H;
        uData[1] = params.dimensions.Rt;
        uData[2] = params.dimensions.Rb;
        uData[3] = params.dimensions.tWall;
        uData[7] = params.styleIndex; // styleId is normally in chunk2.y (index 9)
        uData[9] = params.styleIndex;
        uData[10] = s.spinTurns || 0;
        uData[11] = (s.spinPhaseDeg || 0) * (Math.PI / 180);
        uData[12] = s.spinCurveExp || 1;
        uData[13] = s.bellAmp || 0;
        uData[14] = s.bellCenter || 0.5;
        uData[15] = s.bellWidth || 0.22;
        uData[16] = s.seamAngle || 0;

        this.device.queue.writeBuffer(ub, 0, uData);

        // Style Params
        const sb = this.device.createBuffer({
            size: 48 * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        const spData = packStyleParams(params.styleOpts, params.styleId);
        // Cast to any to avoid SharedArrayBuffer type mismatch in strict mode
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Float32Array<ArrayBufferLike> vs GPUAllowSharedBufferSource strict mode mismatch
        this.device.queue.writeBuffer(sb, 0, spData as any);

        const bindGroup = this.device.createBindGroup({
            layout: this.scanBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: ub } },
                { binding: 1, resource: { buffer: sb } },
                { binding: 2, resource: { buffer: metricBuffer } }
            ]
        });

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.scanPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.ceil(SCAN_RES / 64));
        pass.end();

        encoder.copyBufferToBuffer(metricBuffer, 0, metricStaging, 0, metricBufferSize);
        this.device.queue.submit([encoder.finish()]);

        await metricStaging.mapAsync(GPUMapMode.READ);
        const result = new Float32Array(metricStaging.getMappedRange().slice(0));
        metricStaging.unmap();

        metricBuffer.destroy();
        metricStaging.destroy();
        ub.destroy();
        sb.destroy();

        return result;
    }

    private buildAdaptiveLut(metrics: Float32Array): Float32Array {
        const keptT: number[] = [0.0];
        const SCAN_RES = metrics.length;

        // Configurable Thresholds
        const MIN_SCORE = 0.2; // Increased threshold to filter noise (was 0.05)
        const STEP_SCORE = 4.0; // Sharp edge threshold

        // Safety: Limit max output density to avoid exploding nZ
        // If we kept every point, nZ would be 100k. We want max ~10-20k adaptive.
        // So we enforce a minimum distance between non-critical points.
        const MIN_DIST = 4; // Min stride for low-curvature areas
        let lastKeptIdx = 0;

        const MAX_LUT_SIZE = 5000;

        // Loop through metrics
        for (let i = 1; i < SCAN_RES - 1; i++) {
            if (keptT.length >= MAX_LUT_SIZE) break; // Hard cap

            const score = metrics[i];
            const t = i / (SCAN_RES - 1);

            const dist = i - lastKeptIdx;

            if (score > STEP_SCORE) {
                // FEATURE SNAPPING: Double Vertex (Critical - always keep)
                const eps = 0.00001;
                keptT.push(t - eps);
                keptT.push(t + eps);
                lastKeptIdx = i;
            } else if (score > MIN_SCORE) {
                // High curvature area - keep if not too dense
                if (dist >= 1) {
                    keptT.push(t);
                    lastKeptIdx = i;
                }
            } else {
                // Low curvature - only keep sparse samples to maintain topology
                if (dist >= MIN_DIST) {
                    keptT.push(t);
                    lastKeptIdx = i;
                }
            }
        }
        keptT.push(1.0);

        return new Float32Array(keptT);
    }
}

export default ExportComputer;
