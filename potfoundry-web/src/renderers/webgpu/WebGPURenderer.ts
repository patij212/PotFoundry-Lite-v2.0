

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

    public async init(): Promise<boolean> {
        if (!navigator.gpu) {
            console.error('[WebGPURenderer] WebGPU not supported');
            return false;
        }

        try {
            // Try high-performance first (preferred for desktop)
            this.adapter = await navigator.gpu.requestAdapter({
                powerPreference: 'high-performance'
            });

            // Fallback to default if high-performance fails (common on mobile)
            if (!this.adapter) {
                console.warn('[WebGPURenderer] High-performance adapter not found, trying default...');
                this.adapter = await navigator.gpu.requestAdapter();
            }

            // Fallback to compatibility mode (Android/Chrome specific)
            if (!this.adapter) {
                console.warn('[WebGPURenderer] Default adapter not found, trying compatibility mode...');
                this.adapter = await navigator.gpu.requestAdapter({ compatibilityMode: true } as any);
            }

            if (!this.adapter) {
                console.error('[WebGPURenderer] No adapter found');
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
            console.error('[WebGPURenderer] Initialization failed', err);
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
