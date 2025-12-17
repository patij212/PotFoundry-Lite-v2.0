/**
 * WebGPU Thumbnail Renderer Service
 * 
 * A singleton service that renders pot thumbnails using WebGPU.
 * Uses the same shader as the main renderer but renders to offscreen canvases.
 * 
 * Features:
 * - Single shared WebGPU device to avoid context limits
 * - Queue-based processing to prevent GPU conflicts
 * - Immediate disposal of per-render resources
 */

/// <reference types="vite/client" />
import potPreviewWgsl from '../assets/pot_preview.wgsl?raw';
import { buildStyleParamPayload } from '../utils/styleParams';
import type { LibraryDesign } from '../context/LibraryContext';

// Constants matching webgpu_core.ts
const UNIFORM_FLOAT_COUNT = 76;
const STYLE_PARAM_CAPACITY = 48;

interface ThumbnailRequest {
    design: LibraryDesign;
    width: number;
    height: number;
    resolve: (imageData: ImageData | null) => void;
}

interface RenderResources {
    device: GPUDevice;
    pipeline: GPURenderPipeline;
    uniformBuffer: GPUBuffer;
    styleParamBuffer: GPUBuffer;
    colorBuffers: { c1: GPUBuffer; c2: GPUBuffer; c3: GPUBuffer };
    bgBuffers: { c1: GPUBuffer; c2: GPUBuffer; c3: GPUBuffer };
    bindGroupLayout: GPUBindGroupLayout;
}

class ThumbnailRenderer {
    private static instance: ThumbnailRenderer | null = null;
    private resources: RenderResources | null = null;
    private queue: ThumbnailRequest[] = [];
    private processing = false;
    private initPromise: Promise<boolean> | null = null;

    private constructor() { }

    /**
     * Get the singleton instance
     */
    static getInstance(): ThumbnailRenderer {
        if (!ThumbnailRenderer.instance) {
            ThumbnailRenderer.instance = new ThumbnailRenderer();
        }
        return ThumbnailRenderer.instance;
    }

    /**
     * Initialize WebGPU resources (called once)
     */
    private async initialize(): Promise<boolean> {
        if (this.resources) return true;
        if (this.initPromise) return this.initPromise;

        this.initPromise = this._doInit();
        return this.initPromise;
    }

    private async _doInit(): Promise<boolean> {
        try {
            // Check WebGPU support
            if (!navigator.gpu) {
                console.warn('[ThumbnailRenderer] WebGPU not supported');
                return false;
            }

            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                console.warn('[ThumbnailRenderer] No GPU adapter available');
                return false;
            }

            const device = await adapter.requestDevice();
            if (!device) {
                console.warn('[ThumbnailRenderer] No GPU device available');
                return false;
            }

            // Create shader module
            const shaderModule = device.createShaderModule({
                label: 'thumbnail-shader',
                code: potPreviewWgsl,
            });

            // Create buffers
            const uniformBuffer = device.createBuffer({
                label: 'thumbnail-uniforms',
                size: UNIFORM_FLOAT_COUNT * 4,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            const styleParamBuffer = device.createBuffer({
                label: 'thumbnail-style-params',
                size: STYLE_PARAM_CAPACITY * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });

            const createColorBuffer = (label: string) =>
                device.createBuffer({
                    label,
                    size: 16, // vec4<f32>
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });

            const colorBuffers = {
                c1: createColorBuffer('thumbnail-c1'),
                c2: createColorBuffer('thumbnail-c2'),
                c3: createColorBuffer('thumbnail-c3'),
            };

            const bgBuffers = {
                c1: createColorBuffer('thumbnail-bg1'),
                c2: createColorBuffer('thumbnail-bg2'),
                c3: createColorBuffer('thumbnail-bg3'),
            };

            // Create bind group layout
            // Note: Color buffers (1-3) need VERTEX visibility because gradient_color() is called from vs_main
            const bindGroupLayout = device.createBindGroupLayout({
                label: 'thumbnail-bind-group-layout',
                entries: [
                    { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                    { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                    { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                    { binding: 3, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                    { binding: 4, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
                    { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                    { binding: 6, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                    { binding: 7, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
                ],
            });

            // Create pipeline
            const pipelineLayout = device.createPipelineLayout({
                label: 'thumbnail-pipeline-layout',
                bindGroupLayouts: [bindGroupLayout],
            });

            const pipeline = await device.createRenderPipelineAsync({
                label: 'thumbnail-pipeline',
                layout: pipelineLayout,
                vertex: {
                    module: shaderModule,
                    entryPoint: 'vs_main',
                },
                fragment: {
                    module: shaderModule,
                    entryPoint: 'fs_main',
                    targets: [{ format: 'rgba8unorm' }],
                },
                primitive: {
                    topology: 'triangle-list',
                    cullMode: 'none',
                },
                depthStencil: {
                    depthWriteEnabled: true,
                    depthCompare: 'less',
                    format: 'depth24plus',
                },
            });

            this.resources = {
                device,
                pipeline,
                uniformBuffer,
                styleParamBuffer,
                colorBuffers,
                bgBuffers,
                bindGroupLayout,
            };

            console.log('[ThumbnailRenderer] Initialized successfully');
            return true;
        } catch (err) {
            console.error('[ThumbnailRenderer] Initialization failed:', err);
            return false;
        }
    }

    /**
     * Request a thumbnail render
     */
    async renderThumbnail(design: LibraryDesign, width: number, height: number): Promise<ImageData | null> {
        return new Promise((resolve) => {
            this.queue.push({ design, width, height, resolve });
            this.processQueue();
        });
    }

    /**
     * Process the render queue (one at a time)
     */
    private async processQueue(): Promise<void> {
        if (this.processing || this.queue.length === 0) return;
        this.processing = true;

        const initialized = await this.initialize();
        if (!initialized || !this.resources) {
            // Fail all pending requests
            while (this.queue.length > 0) {
                const req = this.queue.shift()!;
                req.resolve(null);
            }
            this.processing = false;
            return;
        }

        while (this.queue.length > 0) {
            const request = this.queue.shift()!;
            try {
                const imageData = await this.doRender(request);
                request.resolve(imageData);
            } catch (err) {
                console.error('[ThumbnailRenderer] Render failed:', err);
                request.resolve(null);
            }
        }

        this.processing = false;
    }

    /**
     * Perform a single render
     */
    private async doRender(request: ThumbnailRequest): Promise<ImageData | null> {
        const { design, width, height } = request;
        const { device, pipeline, uniformBuffer, styleParamBuffer, colorBuffers, bgBuffers, bindGroupLayout } = this.resources!;

        // Create intermediate render target texture (with COPY_SRC for pixel readback)
        const renderTexture = device.createTexture({
            label: 'thumbnail-render-target',
            size: [width, height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });

        // Create depth texture for this render
        const depthTexture = device.createTexture({
            label: 'thumbnail-depth',
            size: [width, height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // Build uniforms from design
        const uniforms = this.buildUniforms(design, width, height);
        device.queue.writeBuffer(uniformBuffer, 0, uniforms.buffer);

        // Build style params
        const [, styleParams] = buildStyleParamPayload(design.style, design.opts as Record<string, unknown>);
        const styleData = new Float32Array(STYLE_PARAM_CAPACITY);
        for (let i = 0; i < styleParams.length && i < STYLE_PARAM_CAPACITY; i++) {
            styleData[i] = styleParams[i];
        }
        device.queue.writeBuffer(styleParamBuffer, 0, styleData.buffer);

        // Write color uniforms (terracotta gradient)
        const c1 = new Float32Array([0.78, 0.36, 0.22, 1.0]); // Bottom
        const c2 = new Float32Array([0.81, 0.48, 0.36, 1.0]); // Mid
        const c3 = new Float32Array([0.83, 0.65, 0.45, 1.0]); // Top
        device.queue.writeBuffer(colorBuffers.c1, 0, c1);
        device.queue.writeBuffer(colorBuffers.c2, 0, c2);
        device.queue.writeBuffer(colorBuffers.c3, 0, c3);

        // Write background gradient (dark blue)
        const bg1 = new Float32Array([0.10, 0.10, 0.18, 0.0]); // Bottom + angle
        const bg2 = new Float32Array([0.09, 0.13, 0.24, 0.0]); // Mid
        const bg3 = new Float32Array([0.08, 0.10, 0.20, 0.0]); // Top
        device.queue.writeBuffer(bgBuffers.c1, 0, bg1);
        device.queue.writeBuffer(bgBuffers.c2, 0, bg2);
        device.queue.writeBuffer(bgBuffers.c3, 0, bg3);

        // Create bind group
        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: colorBuffers.c1 } },
                { binding: 2, resource: { buffer: colorBuffers.c2 } },
                { binding: 3, resource: { buffer: colorBuffers.c3 } },
                { binding: 4, resource: { buffer: styleParamBuffer } },
                { binding: 5, resource: { buffer: bgBuffers.c1 } },
                { binding: 6, resource: { buffer: bgBuffers.c2 } },
                { binding: 7, resource: { buffer: bgBuffers.c3 } },
            ],
        });

        // Encode and submit render to intermediate texture
        const commandEncoder = device.createCommandEncoder({ label: 'thumbnail-render' });
        const renderTextureView = renderTexture.createView();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: renderTextureView,
                clearValue: { r: 0.1, g: 0.1, b: 0.18, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        });

        renderPass.setPipeline(pipeline);
        renderPass.setBindGroup(0, bindGroup);

        // Draw the pot (vertex shader generates vertices procedurally)
        // Resolution must match uniforms[16] (cells_x) and uniforms[17] (cells_outer_y)
        const cells_x = 120;      // matches uniforms[16]
        const cells_outer_y = 60; // matches uniforms[17]
        const vertexCount = this.calculateVertexCount(cells_x, cells_outer_y);
        renderPass.draw(vertexCount);
        renderPass.end();

        // Copy from render texture to buffer for pixel readback
        const bytesPerRow = Math.ceil(width * 4 / 256) * 256;
        const bufferSize = bytesPerRow * height;
        const readBuffer = device.createBuffer({
            label: 'thumbnail-read-buffer',
            size: bufferSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        commandEncoder.copyTextureToBuffer(
            { texture: renderTexture },
            { buffer: readBuffer, bytesPerRow },
            { width, height }
        );

        device.queue.submit([commandEncoder.finish()]);

        // Wait for GPU to finish
        await device.queue.onSubmittedWorkDone();

        // Read pixels from buffer
        await readBuffer.mapAsync(GPUMapMode.READ);
        const data = new Uint8ClampedArray(readBuffer.getMappedRange());

        // Copy to properly-sized array (remove padding)
        const pixels = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            const srcOffset = y * bytesPerRow;
            const dstOffset = y * width * 4;
            pixels.set(data.subarray(srcOffset, srcOffset + width * 4), dstOffset);
        }

        readBuffer.unmap();

        // Cleanup per-render resources
        readBuffer.destroy();
        renderTexture.destroy();
        depthTexture.destroy();

        return new ImageData(pixels, width, height);
    }

    /**
     * Build uniform buffer data for thumbnail rendering
     */
    private buildUniforms(design: LibraryDesign, width: number, height: number): Float32Array {
        const uniforms = new Float32Array(UNIFORM_FLOAT_COUNT);
        const size = design.size || {};
        const opts = (design.opts || {}) as Record<string, unknown>;

        // Core geometry (indices 0-3)
        const H = (size.height as number) || 120;
        const topOd = (size.top_od as number) || 140;
        const bottomOd = (size.bottom_od as number) || 90;
        const Rt = topOd * 0.5;
        const Rb = bottomOd * 0.5;
        const expn = (size.flare_exp as number) || 1.1;

        uniforms[0] = H;
        uniforms[1] = Rt;
        uniforms[2] = Rb;
        uniforms[3] = expn;

        // Spin/twist (indices 4-6)
        uniforms[4] = (opts.spin_turns as number) || 0;
        uniforms[5] = (opts.spin_phase as number) || 0;
        uniforms[6] = (opts.spin_curve as number) || 1;

        // Style ID (index 7)
        const [styleId] = buildStyleParamPayload(design.style, opts);
        uniforms[7] = styleId;

        // Superformula base params (indices 8-12)
        uniforms[8] = 6;   // sf_m_base
        uniforms[9] = 10;  // sf_m_top
        uniforms[10] = 0.35; // sf_n1
        uniforms[11] = 0.8;  // sf_n2
        uniforms[12] = 0.8;  // sf_n3

        // Drain radius (index 13)
        const rDrain = (size.drain_radius as number) || 10;
        uniforms[13] = Math.max(rDrain, 0.5);

        // Bell params (indices 14, 15, 72)
        uniforms[14] = (opts.bell_amp as number) || 0;
        uniforms[15] = (opts.bell_center as number) || 0.5;

        // Resolution (indices 16-17)
        uniforms[16] = 120; // cells_x (nTheta)
        uniforms[17] = 60;  // cells_outer_y (nZ)

        // Lighting params (indices 22-24)
        uniforms[22] = 0.3; // ambient
        uniforms[23] = 0.7; // diffuse
        uniforms[24] = 0.2; // fresnel

        // Wall/bottom thickness (indices 25-26)
        const tWall = (size.wall_thickness as number) || 3;
        const tBottom = (size.bottom_thickness as number) || 3;
        uniforms[25] = tWall;
        uniforms[26] = tBottom;

        // Mesh resolution (indices 27-30)
        uniforms[27] = 60;  // inner_y
        uniforms[28] = 20;  // bottom_rings
        uniforms[30] = 10;  // rim_rings

        // Scene radius (index 33)
        uniforms[33] = Math.max(Rt, H) * 2;

        // Camera setup - position camera for good thumbnail view
        // Note: WGSL shader centers pot at origin (z goes from -H/2 to +H/2)
        const aspect = width / height;
        const fov = 35 * Math.PI / 180;

        // Camera distance based on pot size
        const maxDim = Math.max(Rt * 2, H);
        const cameraDistance = maxDim * 2.2;

        // CRITICAL: Set near/far planes so pot projects AHEAD of background (Z=0.99)
        // Using tight near/far around the pot ensures good depth precision
        // and places pot geometry at NDC Z ≈ 0.5 (well in front of 0.99 background)
        const near = Math.max(cameraDistance - maxDim * 2, 1);
        const far = cameraDistance + maxDim * 2;

        // Camera at 30 degrees from front, slightly above
        const cameraAngle = Math.PI / 6; // 30 degrees
        const elevation = Math.PI / 8;   // ~22 degrees above

        const eyeX = Math.sin(cameraAngle) * Math.cos(elevation) * cameraDistance;
        const eyeY = -Math.cos(cameraAngle) * Math.cos(elevation) * cameraDistance;
        const eyeZ = Math.sin(elevation) * cameraDistance;

        // Target at pot center (origin, since shader centers the pot)
        const targetX = 0;
        const targetY = 0;
        const targetZ = 0;

        // Eye position (indices 36-38)
        uniforms[36] = eyeX;
        uniforms[37] = eyeY;
        uniforms[38] = eyeZ;

        // Camera mode (index 39) - 0 = perspective
        uniforms[39] = 0;

        // Build view-projection matrix (indices 40-55)
        const vpMatrix = this.buildViewProjectionMatrix(
            eyeX, eyeY, eyeZ,
            targetX, targetY, targetZ,
            aspect, fov, near, far
        );
        for (let i = 0; i < 16; i++) {
            uniforms[40 + i] = vpMatrix[i];
        }

        // Camera basis vectors (indices 56-67)
        // Calculate proper basis from forward direction
        const forward = this.normalize([targetX - eyeX, targetY - eyeY, targetZ - eyeZ]);
        const worldUp = [0, 0, 1];
        const right = this.normalize(this.cross(worldUp, forward));
        const up = this.cross(forward, right);

        // Right vector
        uniforms[56] = right[0]; uniforms[57] = right[1]; uniforms[58] = right[2]; uniforms[59] = 0;
        // Up vector  
        uniforms[60] = up[0]; uniforms[61] = up[1]; uniforms[62] = up[2]; uniforms[63] = 0;
        // Forward vector
        uniforms[64] = forward[0]; uniforms[65] = forward[1]; uniforms[66] = forward[2]; uniforms[67] = 0;

        // Grid flag (index 68) - 0 = no grid
        uniforms[68] = 0;

        // Specular/roughness (indices 69-70)
        uniforms[69] = 0.5; // specular
        uniforms[70] = 0.4; // roughness

        // Show inner (index 71)
        uniforms[71] = 1;

        // Bell width (index 72)
        uniforms[72] = (opts.bell_width as number) || 0.22;

        return uniforms;
    }

    /**
     * Build a view-projection matrix using LEFT-HANDED convention matching main renderer
     * WebGPU NDC: X left-to-right, Y bottom-to-top, Z from 0 (near) to 1 (far)
     */
    private buildViewProjectionMatrix(
        eyeX: number, eyeY: number, eyeZ: number,
        targetX: number, targetY: number, targetZ: number,
        aspect: number, fov: number, near: number, far: number
    ): Float32Array {
        // Build left-handed view matrix (lookAt LH)
        const eye: [number, number, number] = [eyeX, eyeY, eyeZ];

        // Forward = normalize(target - eye) for LEFT-HANDED
        const zAxis = this.normalize([targetX - eyeX, targetY - eyeY, targetZ - eyeZ]);

        // Right = normalize(cross(worldUp, forward))
        const worldUp: [number, number, number] = [0, 0, 1];
        let xAxis = this.normalize(this.cross(worldUp, zAxis));
        if (this.length(xAxis) < 1e-6) {
            xAxis = [1, 0, 0]; // Fallback
        }

        // Up = cross(forward, right)
        const yAxis = this.cross(zAxis, xAxis);

        // View matrix: camera axes form ROWS of rotation part (stored column-major)
        const view = new Float32Array(16);
        view[0] = xAxis[0]; view[1] = yAxis[0]; view[2] = zAxis[0]; view[3] = 0;
        view[4] = xAxis[1]; view[5] = yAxis[1]; view[6] = zAxis[1]; view[7] = 0;
        view[8] = xAxis[2]; view[9] = yAxis[2]; view[10] = zAxis[2]; view[11] = 0;
        view[12] = -this.dot(xAxis, eye);
        view[13] = -this.dot(yAxis, eye);
        view[14] = -this.dot(zAxis, eye);
        view[15] = 1;

        // Build LEFT-HANDED perspective projection (matching main renderer)
        // WebGPU NDC: Z from 0 (near) to 1 (far)
        const proj = new Float32Array(16);
        const f = 1 / Math.tan(Math.max(fov * 0.5, 1e-4));
        const range = 1 / (far - near || 1);
        proj[0] = f / Math.max(aspect, 1e-4);
        proj[5] = f;
        proj[10] = far * range;
        proj[11] = 1;  // Positive 1 for left-handed
        proj[14] = -near * far * range;
        // Other elements are 0 (default)

        // Multiply: proj * view
        return this.multiplyMatrices(proj, view);
    }

    // Vector math helpers
    private length(v: number[]): number {
        return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    }

    private normalize(v: number[]): number[] {
        const len = this.length(v);
        if (len < 1e-6) return [0, 0, 1];
        return [v[0] / len, v[1] / len, v[2] / len];
    }

    private cross(a: number[], b: number[]): number[] {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
        ];
    }

    private dot(a: number[], b: number[]): number {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    private multiplyMatrices(a: Float32Array, b: Float32Array): Float32Array {
        const result = new Float32Array(16);
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) {
                    sum += a[i + k * 4] * b[k + j * 4];
                }
                result[i + j * 4] = sum;
            }
        }
        return result;
    }

    /**
     * Calculate total vertex count for all segments
     * Must match the WGSL shader's vertex generation logic
     */
    private calculateVertexCount(cells_x: number, cells_outer_y: number): number {
        // Matching shader logic from vs_main:
        // - 3 vertices for background fullscreen triangle
        // - 6 vertices for ground plane (2 triangles)
        // - Pot mesh segments (each cell = 6 vertices for 2 triangles)

        const inner_y = 60;       // Must match uniforms[27]
        const bottom_rings = 20;  // Must match uniforms[28]
        const rim_rings = 10;     // Must match uniforms[30]

        const cells_outer = cells_x * cells_outer_y;
        const cells_inner = cells_x * inner_y;
        const cells_bottom_top = cells_x * bottom_rings;
        const cells_bottom_under = cells_x * bottom_rings;
        const cells_rim = cells_x * rim_rings;
        const cells_drain = cells_x * bottom_rings;

        const total_pot_cells = cells_outer + cells_inner + cells_bottom_top +
            cells_bottom_under + cells_rim + cells_drain;
        // 3 background + 6 ground + pot mesh vertices (6 per cell)
        return 3 + 6 + (total_pot_cells * 6);
    }

    /**
     * Dispose of resources (typically not called unless app unmounts)
     */
    dispose(): void {
        if (this.resources) {
            const { uniformBuffer, styleParamBuffer, colorBuffers, bgBuffers } = this.resources;
            uniformBuffer.destroy();
            styleParamBuffer.destroy();
            colorBuffers.c1.destroy();
            colorBuffers.c2.destroy();
            colorBuffers.c3.destroy();
            bgBuffers.c1.destroy();
            bgBuffers.c2.destroy();
            bgBuffers.c3.destroy();
            this.resources = null;
        }
        ThumbnailRenderer.instance = null;
    }
}

export default ThumbnailRenderer;
