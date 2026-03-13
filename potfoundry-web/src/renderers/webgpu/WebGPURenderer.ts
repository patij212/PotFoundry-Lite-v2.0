

import { isMobileDevice } from '../../ResizeManager';
import { gpuDiagnostics } from '../../ui/debug/utils/GPUDiagnostics';

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
        // Use centralized mobile detection (handles VITE_MOBILE, UA, and touch+screen)
        const isMobile = isMobileDevice();
        console.log(`[WebGPURenderer] Adapter Strategy: ${isMobile ? 'Mobile (Default)' : 'Desktop (High-Performance)'}`);

        // Option 1: High Performance (Desktop Only)
        if (!isMobile) {
            try {
                const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
                if (adapter) {
                    console.log('[WebGPURenderer] Acquired High-Performance Adapter');
                    return adapter;
                }
            } catch (e) {
                console.warn('[WebGPURenderer] High-performance adapter request failed:', e);
            }
        }

        // Option 2: Default (Preferred for Mobile to avoid instability)
        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) {
                console.log('[WebGPURenderer] Acquired Default Adapter');
                return adapter;
            }
        } catch (e) {
            console.warn('[WebGPURenderer] Default adapter request failed:', e);
        }

        // Option 3: Compatibility Mode
        try {
            console.warn('[WebGPURenderer] Trying compatibility mode...');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Non-spec Chrome extension for Android compatibility mode
            const adapter = await navigator.gpu.requestAdapter({ compatibilityMode: true } as any);
            if (adapter) {
                console.log('[WebGPURenderer] Acquired Compatibility Adapter');
                return adapter;
            }
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

            // Diagnostic Logging
            try {
                // Use standard property if available (latest spec), fallback to async method
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter.info not yet in @webgpu/types; requestAdapterInfo deprecated in latest spec
                const info = (this.adapter as any).info || await (this.adapter as any).requestAdapterInfo?.();

                if (info) {
                    console.log('[WebGPURenderer] Adapter Info:', {
                        vendor: info.vendor,
                        architecture: info.architecture,
                        device: info.device,
                        description: info.description
                    });
                }

                console.log('[WebGPURenderer] Adapter Limits:', {
                    maxTextureDimension2D: this.adapter.limits.maxTextureDimension2D,
                    maxBufferSize: this.adapter.limits.maxBufferSize,
                    maxStorageBufferBindingSize: this.adapter.limits.maxStorageBufferBindingSize,
                    maxComputeWorkgroupStorageSize: this.adapter.limits.maxComputeWorkgroupStorageSize,
                });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- isFallbackAdapter not yet in @webgpu/types
                console.log('[WebGPURenderer] Is Fallback:', (this.adapter as any).isFallbackAdapter);

                // Emit to GPU diagnostics service for DevConsole
                gpuDiagnostics.setAdapterInfo(
                    {
                        vendor: info?.vendor ?? 'Unknown',
                        architecture: info?.architecture ?? 'Unknown',
                        device: info?.device ?? 'Unknown',
                        description: info?.description ?? 'Unknown',
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- isFallbackAdapter not yet in @webgpu/types
                        isFallbackAdapter: (this.adapter as any).isFallbackAdapter ?? false,
                    },
                    {
                        maxTextureDimension2D: this.adapter.limits.maxTextureDimension2D,
                        maxBufferSize: this.adapter.limits.maxBufferSize,
                        maxStorageBufferBindingSize: this.adapter.limits.maxStorageBufferBindingSize,
                        maxComputeWorkgroupStorageSize: this.adapter.limits.maxComputeWorkgroupStorageSize,
                    }
                );
            } catch (e) {
                console.warn('[WebGPURenderer] Failed to log adapter details (non-critical):', e);
            }

            const deviceDescriptor: GPUDeviceDescriptor = {
                requiredLimits: {
                    // Request limits that match the adapter to avoid "exceeds default" errors
                    // especially on mobile where defaults might be conservative
                    maxTextureDimension2D: this.adapter.limits.maxTextureDimension2D,
                    maxStorageBufferBindingSize: this.adapter.limits.maxStorageBufferBindingSize,
                    maxBufferSize: this.adapter.limits.maxBufferSize,
                }
            };
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
        // Mobile optimization: Cap at 1.5x on mobile to save memory (7MP -> 4MP)
        const isMobile = isMobileDevice();
        const maxDpr = isMobile ? 1.5 : 2.0;
        const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

        const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
        const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));

        console.log(`[WebGPURenderer] Configuring Context. Mobile: ${isMobile}, DPR: ${dpr}, Size: ${width}x${height}`);

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
