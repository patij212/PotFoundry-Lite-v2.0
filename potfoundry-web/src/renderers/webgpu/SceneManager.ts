import { WebGPURenderer } from './WebGPURenderer';
import { ShaderManager } from './ShaderManager';
import { UNIFORM_BUFFER_SIZE } from '../../camera_constants';
import { STYLE_FUNCTION_MAP } from '../../styles/registry';

export class SceneManager {
    private renderer: WebGPURenderer;
    public pipeline: GPURenderPipeline | null = null;
    public uniformBuffer: GPUBuffer | null = null;
    public styleParamBuffer: GPUBuffer | null = null;
    private bindGroup: GPUBindGroup | null = null;

    // Buffers for color/gradient data (temporary port from core)
    public bgBuffers: any = null;

    private pipelineCache: Map<number, GPURenderPipeline> = new Map();
    private compilationPromises: Map<number, Promise<GPURenderPipeline>> = new Map();
    private currentStyleId: number = -1;
    private initStartTime: number = 0;

    constructor(renderer: WebGPURenderer) {
        this.renderer = renderer;
    }

    public async init(initialStyleId: number = 0) {
        if (!this.renderer.device) return false;

        this.initStartTime = performance.now();
        console.log(`[SceneManager] Init started. Prioritizing request for Style ${initialStyleId}`);
        this.createBuffers();

        // 1. Compile ONLY the requested style first.
        // This ensures the user gets a result ASAP without competing with 17 other compilations.
        await this.activateStyle(initialStyleId);

        // 2. Start background compilation of remaining styles AFTER we have a result.
        // We run these SEQUENTIALLY to avoid choking the GPU driver with 18 concurrent requests.
        this.warmupPipelines(initialStyleId);

        return !!this.pipeline;
    }

    private async warmupPipelines(excludeId: number) {
        console.log('[SceneManager] Starting background shader warmup (Parallel Blast)...');

        const idsToWarm = Object.keys(STYLE_FUNCTION_MAP).map(Number).filter(id => id !== excludeId);

        // Launch all remaining styles in parallel. 
        // Browsers/Drivers are generally smart enough to queue these internally.
        // This avoids artificial delays where fast shaders wait for a batch to finish.
        const promises = idsToWarm.map(id => {
            return this.compilePipeline(id).catch(e => console.warn(`[SceneManager] Warmup warning for Style ${id}`, e));
        });

        // We don't await the result to block UI, but we log when everything is done.
        Promise.allSettled(promises).then(() => {
            console.log('[SceneManager] Background shader warmup complete.');
        });
    }

    public async activateStyle(styleId: number) {
        if (this.currentStyleId === styleId && this.pipeline) return;

        let newPipeline = this.pipelineCache.get(styleId);

        if (!newPipeline) {
            console.log(`[SceneManager] Cache miss for Style ID ${styleId}. Compiling/Joining...`);
            newPipeline = await this.compilePipeline(styleId);
        }

        this.pipeline = newPipeline;
        this.currentStyleId = styleId;
        this.createBindGroup();
    }

    private createBuffers() {
        const device = this.renderer.device!;

        // Uniform Buffer (Camera + Params)
        this.uniformBuffer = device.createBuffer({
            size: UNIFORM_BUFFER_SIZE, // 304 bytes
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Style Params Buffer (48 floats)
        this.styleParamBuffer = device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Helper to create simple vec4 buffer
        const createVec4Buffer = () => device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.bgBuffers = {
            c1: createVec4Buffer(),
            c2: createVec4Buffer(),
            c3: createVec4Buffer(),
            bg1: createVec4Buffer(), // binding 5
            bg2: createVec4Buffer(), // binding 6
            bg3: createVec4Buffer(), // binding 7
        };
    }

    private async compilePipeline(styleId: number): Promise<GPURenderPipeline> {
        // 1. Check completed cache
        if (this.pipelineCache.has(styleId)) return this.pipelineCache.get(styleId)!;

        // 2. Check in-flight promises (Deduplication)
        if (this.compilationPromises.has(styleId)) {
            return this.compilationPromises.get(styleId)!;
        }

        if (!this.renderer.device || !this.renderer.presentationFormat) {
            throw new Error("Renderer device or presentation format not available.");
        }

        // 3. Create new compilation promise
        const compileTask = (async () => {
            const wgsl = ShaderManager.getInstance().getStyleWGSL(styleId);
            const device = this.renderer.device!;

            const module = device.createShaderModule({
                label: `pot_preview_style_${styleId}.wgsl`,
                code: wgsl,
            });

            // Optional: check compilation info, but we skip to avoid noise unless needed

            const pipelineDescriptor: GPURenderPipelineDescriptor = {
                layout: 'auto',
                vertex: {
                    module,
                    entryPoint: 'vs_main',
                },
                fragment: {
                    module,
                    entryPoint: 'fs_main',
                    targets: [{
                        format: this.renderer.presentationFormat,
                        blend: {
                            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        },
                    }],
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
            };

            const start = performance.now();
            const pipeline = await device.createRenderPipelineAsync(pipelineDescriptor).catch(async (err) => {
                console.error(`[SceneManager] createRenderPipelineAsync failed for Style ${styleId}`, err);

                // Retrieve detailed compilation info
                const info = await module.getCompilationInfo();
                if (info.messages.length > 0) {
                    console.error(`[SceneManager] Shader Compilation Errors for Style ${styleId}:`);
                    for (const msg of info.messages) {
                        console.error(`Line ${msg.lineNum}:${msg.linePos} - ${msg.message}`);
                    }
                }
                throw err;
            });

            const duration = performance.now() - start;

            // Commit to cache
            this.pipelineCache.set(styleId, pipeline);
            // Cleanup promise map to free memory (optional, but good practice)
            this.compilationPromises.delete(styleId);

            const totalTime = performance.now() - this.initStartTime;
            console.log(`[SceneManager] Style ${styleId} compiled in ${duration.toFixed(0)}ms. (Ready at ${totalTime.toFixed(0)}ms)`);

            return pipeline;
        })();

        // Store promise
        this.compilationPromises.set(styleId, compileTask);

        // Catch errors to cleanup map if failed
        compileTask.catch(async (err) => {
            this.compilationPromises.delete(styleId);
            console.error(`[SceneManager] Pipeline compilation failed for Style ${styleId}:`, err);

            // Attempt to get detailed compilation info
            try {
                // accessing 'module' from the closure scope of the async IIFE above isn't easy here.
                // We need to move the logging INSIDE the async task.
            } catch (e) { /* ignore */ }
        });

        return compileTask;
    }

    private createBindGroup() {
        if (!this.pipeline || !this.renderer.device) return;

        this.bindGroup = this.renderer.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer! } },
                { binding: 1, resource: { buffer: this.bgBuffers.c1 } },
                { binding: 2, resource: { buffer: this.bgBuffers.c2 } },
                { binding: 3, resource: { buffer: this.bgBuffers.c3 } },
                { binding: 4, resource: { buffer: this.styleParamBuffer! } },
                { binding: 5, resource: { buffer: this.bgBuffers.bg1 } },
                { binding: 6, resource: { buffer: this.bgBuffers.bg2 } },
                { binding: 7, resource: { buffer: this.bgBuffers.bg3 } },
            ],
        });
    }

    public updateUniforms(data: Float32Array) {
        if (this.uniformBuffer && this.renderer.device) {
            this.renderer.device.queue.writeBuffer(this.uniformBuffer, 0, data as any);
        }
    }

    public updateStyleParams(data: Float32Array) {
        if (this.styleParamBuffer && this.renderer.device) {
            this.renderer.device.queue.writeBuffer(this.styleParamBuffer, 0, data as any);
        }
    }

    public updateColors(colors: any) { // Type to be defined
        // Implementation needed based on input structure
    }

    public draw(vertexCount: number) {
        if (!this.renderer.context || !this.pipeline || !this.bindGroup) return;

        const commandEncoder = this.renderer.device!.createCommandEncoder();
        const pass = this.renderer.startRenderPass(commandEncoder, { r: 0.1, g: 0.1, b: 0.1, a: 1.0 });

        if (pass) {
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, this.bindGroup);
            pass.draw(vertexCount);
            pass.end();
            this.renderer.device!.queue.submit([commandEncoder.finish()]);
        }
    }
}
