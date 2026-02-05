

export class WebGPURenderer {
    public device: GPUDevice | null = null;
    public context: GPUCanvasContext | null = null;
    public adapter: GPUAdapter | null = null;
    public presentationFormat: GPUTextureFormat = 'bgra8unorm';
    public canvas: HTMLCanvasElement;

    private depthTexture: GPUTexture | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    private async getBestAdapter(): Promise<GPUAdapter | null> {
        // Option 1: High Performance
        try {
            const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
            if (adapter) return adapter;
        } catch (e) {
            console.warn('[WebGPURenderer] High-performance adapter request failed:', e);
        }

        // Option 2: Default
        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) return adapter;
        } catch (e) {
            console.warn('[WebGPURenderer] Default adapter request failed:', e);
        }

        // Option 3: Compatibility Mode
        try {
            console.warn('[WebGPURenderer] Trying compatibility mode...');
            const adapter = await navigator.gpu.requestAdapter({ compatibilityMode: true } as any);
            if (adapter) return adapter;
        } catch (e) {
            console.warn('[WebGPURenderer] Compatibility mode adapter request failed:', e);
        }

        return null;
    }

    public async init(): Promise<boolean> {
        if (!navigator.gpu) {
            console.error('[WebGPURenderer] WebGPU not supported');
            return false;
        }

        try {
            this.adapter = await this.getBestAdapter();

            if (!this.adapter) {
                console.error('[WebGPURenderer] No WebGPU adapter found after all attempts');
                return false;
            }

            const deviceDescriptor: GPUDeviceDescriptor = {};
            this.device = await this.adapter.requestDevice(deviceDescriptor);

            this.context = this.canvas.getContext('webgpu');
            if (!this.context) {
                console.error('[WebGPURenderer] Failed to get context');
                return false;
            }

            this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
            this.configureContext();

            this.device.lost.then((info) => {
                console.error(`[WebGPURenderer] Device lost: ${info.message}`);
                // Handle device loss logic here or notify upwards
            });

            return true;
        } catch (err) {
            console.error('[WebGPURenderer] Initialization failed (device/context creation):', err);
            return false;
        }
    }

    private configureContext() {
        if (!this.context || !this.device) return;

        // Handle High-DPI
        const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x
        const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
        const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: 'premultiplied',
        });

        this.recreateDepthTexture(width, height);
    }

    private recreateDepthTexture(width: number, height: number) {
        if (!this.device) return;
        if (this.depthTexture) this.depthTexture.destroy();

        this.depthTexture = this.device.createTexture({
            size: [width, height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    public resize() {
        this.configureContext();
    }

    public startRenderPass(commandEncoder: GPUCommandEncoder, clearColor: GPUColor) {
        if (!this.context || !this.depthTexture) return null;

        // Safety check for context status
        // Use getCurrentTexture(). If it fails, return null.
        let textureView: GPUTextureView;
        try {
            textureView = this.context.getCurrentTexture().createView();
        } catch (err) {
            return null;
        }

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: textureView,
                    clearValue: clearColor,
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        };

        return commandEncoder.beginRenderPass(renderPassDescriptor);
    }
}
