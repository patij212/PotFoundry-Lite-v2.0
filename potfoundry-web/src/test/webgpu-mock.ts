/**
 * WebGPU Mock Implementation
 * Provides mocks for WebGPU APIs to enable testing without a real GPU.
 * Tracks buffer allocations/deallocations to detect device loss scenarios.
 */
// Vitest types are available globally via the test config

// Polyfill WebGPU usage constants for test environment
if (typeof GPUBufferUsage === 'undefined') {
    (globalThis as any).GPUBufferUsage = {
        MAP_READ: 0x0001,
        MAP_WRITE: 0x0002,
        COPY_SRC: 0x0004,
        COPY_DST: 0x0008,
        INDEX: 0x0010,
        VERTEX: 0x0020,
        UNIFORM: 0x0040,
        STORAGE: 0x0080,
        INDIRECT: 0x0100,
        QUERY_RESOLVE: 0x0200,
    };
}

if (typeof GPUTextureUsage === 'undefined') {
    (globalThis as any).GPUTextureUsage = {
        COPY_SRC: 0x01,
        COPY_DST: 0x02,
        TEXTURE_BINDING: 0x04,
        STORAGE_BINDING: 0x08,
        RENDER_ATTACHMENT: 0x10,
    };
}

if (typeof GPUMapMode === 'undefined') {
    (globalThis as any).GPUMapMode = {
        READ: 0x0001,
        WRITE: 0x0002,
    };
}

// Track allocated buffers for debugging device loss
let allocatedBuffers: Map<number, { size: number; destroyed: boolean; label?: string }> = new Map();
let bufferIdCounter = 0;
let deviceLostCallback: ((info: { reason: string; message: string }) => void) | null = null;
let isDeviceLost = false;

/**
 * Mock GPUBuffer implementation
 */
class MockGPUBuffer {
    private _id: number;
    private _size: number;
    private _destroyed: boolean = false;
    label?: string;
    mapState: 'unmapped' | 'pending' | 'mapped' = 'unmapped';
    usage: number;

    constructor(descriptor: GPUBufferDescriptor) {
        this._id = bufferIdCounter++;
        this._size = descriptor.size;
        this.label = descriptor.label;
        this.usage = descriptor.usage;
        allocatedBuffers.set(this._id, { size: this._size, destroyed: false, label: this.label });
    }

    get size() { return this._size; }

    destroy() {
        if (this._destroyed) {
            console.warn(`[MockGPUBuffer] Attempting to destroy already destroyed buffer: ${this.label}`);
            return;
        }
        this._destroyed = true;
        const info = allocatedBuffers.get(this._id);
        if (info) info.destroyed = true;
    }

    getMappedRange(_offset?: number, size?: number): ArrayBuffer {
        if (this._destroyed) throw new Error('Buffer is destroyed');
        return new ArrayBuffer(size ?? this._size);
    }

    mapAsync(_mode: GPUMapModeFlags, _offset?: number, _size?: number): Promise<void> {
        if (this._destroyed) return Promise.reject(new Error('Buffer is destroyed'));
        this.mapState = 'mapped';
        return Promise.resolve();
    }

    unmap() {
        this.mapState = 'unmapped';
    }

    isDestroyed() { return this._destroyed; }
}

/**
 * Mock GPUTexture implementation
 */
class MockGPUTexture {
    label?: string;
    width: number;
    height: number;
    depthOrArrayLayers: number = 1;
    mipLevelCount: number = 1;
    sampleCount: number = 1;
    dimension: GPUTextureDimension = '2d';
    format: GPUTextureFormat;
    usage: number;
    private _destroyed = false;

    constructor(descriptor: GPUTextureDescriptor) {
        this.label = descriptor.label;
        this.width = typeof descriptor.size === 'number' ? descriptor.size : (descriptor.size as GPUExtent3DDict).width;
        this.height = typeof descriptor.size === 'number' ? 1 : ((descriptor.size as GPUExtent3DDict).height ?? 1);
        this.format = descriptor.format;
        this.usage = descriptor.usage;
    }

    createView(_descriptor?: GPUTextureViewDescriptor): GPUTextureView {
        return {} as GPUTextureView;
    }

    destroy() { this._destroyed = true; }
}

/**
 * Mock GPUDevice implementation
 */
class MockGPUDevice {
    label?: string;
    features = new Set<string>();
    limits = {
        maxTextureDimension1D: 8192,
        maxTextureDimension2D: 8192,
        maxTextureDimension3D: 2048,
        maxTextureArrayLayers: 256,
        maxBindGroups: 4,
        maxBindingsPerBindGroup: 1000,
        maxBufferSize: 268435456,
        maxUniformBufferBindingSize: 65536,
        maxStorageBufferBindingSize: 134217728,
        maxVertexBuffers: 8,
        maxVertexAttributes: 16,
        maxVertexBufferArrayStride: 2048,
        maxInterStageShaderComponents: 60,
        maxComputeWorkgroupStorageSize: 16384,
        maxComputeInvocationsPerWorkgroup: 256,
        maxComputeWorkgroupSizeX: 256,
        maxComputeWorkgroupSizeY: 256,
        maxComputeWorkgroupSizeZ: 64,
        maxComputeWorkgroupsPerDimension: 65535,
    };
    lost: Promise<GPUDeviceLostInfo>;
    private _lostResolve!: (info: GPUDeviceLostInfo) => void;
    queue: MockGPUQueue;

    constructor() {
        this.lost = new Promise((resolve) => {
            this._lostResolve = resolve;
        });
        this.queue = new MockGPUQueue();
    }

    createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer {
        if (isDeviceLost) throw new Error('Device is lost');
        return new MockGPUBuffer(descriptor) as unknown as GPUBuffer;
    }

    createTexture(descriptor: GPUTextureDescriptor): GPUTexture {
        if (isDeviceLost) throw new Error('Device is lost');
        return new MockGPUTexture(descriptor) as unknown as GPUTexture;
    }

    createShaderModule(_descriptor: GPUShaderModuleDescriptor): GPUShaderModule {
        if (isDeviceLost) throw new Error('Device is lost');
        return {
            getCompilationInfo: () => Promise.resolve({ messages: [] }),
        } as unknown as GPUShaderModule;
    }

    createBindGroup(_descriptor: GPUBindGroupDescriptor): GPUBindGroup {
        if (isDeviceLost) throw new Error('Device is lost');
        return {} as GPUBindGroup;
    }

    createBindGroupLayout(_descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout {
        if (isDeviceLost) throw new Error('Device is lost');
        return {} as GPUBindGroupLayout;
    }

    createPipelineLayout(_descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout {
        if (isDeviceLost) throw new Error('Device is lost');
        return {} as GPUPipelineLayout;
    }

    createRenderPipeline(_descriptor: GPURenderPipelineDescriptor): GPURenderPipeline {
        if (isDeviceLost) throw new Error('Device is lost');
        return {
            getBindGroupLayout: () => ({} as GPUBindGroupLayout),
        } as unknown as GPURenderPipeline;
    }

    createComputePipeline(_descriptor: GPUComputePipelineDescriptor): GPUComputePipeline {
        if (isDeviceLost) throw new Error('Device is lost');
        return {
            getBindGroupLayout: () => ({} as GPUBindGroupLayout),
        } as unknown as GPUComputePipeline;
    }

    createCommandEncoder(_descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder {
        if (isDeviceLost) throw new Error('Device is lost');
        return new MockGPUCommandEncoder() as unknown as GPUCommandEncoder;
    }

    createSampler(_descriptor?: GPUSamplerDescriptor): GPUSampler {
        return {} as GPUSampler;
    }

    createRenderBundleEncoder(_descriptor: GPURenderBundleEncoderDescriptor): GPURenderBundleEncoder {
        return {} as GPURenderBundleEncoder;
    }

    createQuerySet(_descriptor: GPUQuerySetDescriptor): GPUQuerySet {
        return { destroy: () => { } } as unknown as GPUQuerySet;
    }

    pushErrorScope(_filter: GPUErrorFilter) { }
    popErrorScope(): Promise<GPUError | null> { return Promise.resolve(null); }

    destroy() {
        isDeviceLost = true;
        this._lostResolve({ reason: 'destroyed', message: 'Device was explicitly destroyed' } as GPUDeviceLostInfo);
    }

    // Test helper to simulate device loss
    _simulateDeviceLoss(reason: string = 'unknown', message: string = 'Simulated device loss') {
        isDeviceLost = true;
        this._lostResolve({ reason, message } as GPUDeviceLostInfo);
        if (deviceLostCallback) {
            deviceLostCallback({ reason, message });
        }
    }
}

/**
 * Mock GPUQueue implementation
 */
class MockGPUQueue {
    label?: string;

    submit(_commandBuffers: GPUCommandBuffer[]) {
        if (isDeviceLost) throw new Error('Device is lost');
    }

    writeBuffer(buffer: GPUBuffer, _bufferOffset: number, _data: BufferSource, _dataOffset?: number, _size?: number) {
        if (isDeviceLost) throw new Error('Device is lost');
        const mockBuffer = buffer as unknown as MockGPUBuffer;
        if (mockBuffer.isDestroyed && mockBuffer.isDestroyed()) {
            throw new Error('Buffer used in submit while destroyed');
        }
    }

    writeTexture(
        _destination: GPUImageCopyTexture,
        _data: BufferSource,
        _dataLayout: GPUImageDataLayout,
        _size: GPUExtent3DStrict
    ) {
        if (isDeviceLost) throw new Error('Device is lost');
    }

    copyExternalImageToTexture(
        _source: GPUImageCopyExternalImage,
        _destination: GPUImageCopyTextureTagged,
        _copySize: GPUExtent3DStrict
    ) { }

    onSubmittedWorkDone(): Promise<void> {
        return Promise.resolve();
    }
}

/**
 * Mock GPUCommandEncoder implementation
 */
class MockGPUCommandEncoder {
    label?: string;

    beginRenderPass(_descriptor: GPURenderPassDescriptor): GPURenderPassEncoder {
        return new MockGPURenderPassEncoder() as unknown as GPURenderPassEncoder;
    }

    beginComputePass(_descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder {
        return {} as GPUComputePassEncoder;
    }

    copyBufferToBuffer(
        _source: GPUBuffer, _sourceOffset: number,
        _destination: GPUBuffer, _destinationOffset: number,
        _size: number
    ) { }

    copyBufferToTexture(
        _source: GPUImageCopyBuffer,
        _destination: GPUImageCopyTexture,
        _copySize: GPUExtent3DStrict
    ) { }

    copyTextureToBuffer(
        _source: GPUImageCopyTexture,
        _destination: GPUImageCopyBuffer,
        _copySize: GPUExtent3DStrict
    ) { }

    copyTextureToTexture(
        _source: GPUImageCopyTexture,
        _destination: GPUImageCopyTexture,
        _copySize: GPUExtent3DStrict
    ) { }

    finish(_descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer {
        return {} as GPUCommandBuffer;
    }

    pushDebugGroup(_groupLabel: string) { }
    popDebugGroup() { }
    insertDebugMarker(_markerLabel: string) { }

    resolveQuerySet(
        _querySet: GPUQuerySet,
        _firstQuery: number,
        _queryCount: number,
        _destination: GPUBuffer,
        _destinationOffset: number
    ) { }

    clearBuffer(_buffer: GPUBuffer, _offset?: number, _size?: number) { }
}

/**
 * Mock GPURenderPassEncoder implementation
 */
class MockGPURenderPassEncoder {
    setPipeline(_pipeline: GPURenderPipeline) { }
    setBindGroup(_index: number, _bindGroup: GPUBindGroup | null, _dynamicOffsets?: Uint32Array | number[]) { }
    setVertexBuffer(_slot: number, _buffer: GPUBuffer | null, _offset?: number, _size?: number) { }
    setIndexBuffer(_buffer: GPUBuffer, _indexFormat: GPUIndexFormat, _offset?: number, _size?: number) { }
    draw(_vertexCount: number, _instanceCount?: number, _firstVertex?: number, _firstInstance?: number) { }
    drawIndexed(_indexCount: number, _instanceCount?: number, _firstIndex?: number, _baseVertex?: number, _firstInstance?: number) { }
    drawIndirect(_indirectBuffer: GPUBuffer, _indirectOffset: number) { }
    drawIndexedIndirect(_indirectBuffer: GPUBuffer, _indirectOffset: number) { }
    setViewport(_x: number, _y: number, _width: number, _height: number, _minDepth: number, _maxDepth: number) { }
    setScissorRect(_x: number, _y: number, _width: number, _height: number) { }
    setBlendConstant(_color: GPUColor) { }
    setStencilReference(_reference: number) { }
    executeBundles(_bundles: GPURenderBundle[]) { }
    end() { }
    pushDebugGroup(_groupLabel: string) { }
    popDebugGroup() { }
    insertDebugMarker(_markerLabel: string) { }
    beginOcclusionQuery(_queryIndex: number) { }
    endOcclusionQuery() { }
}

/**
 * Mock GPUAdapter implementation
 */
class MockGPUAdapter {
    features = new Set<string>();
    limits = new MockGPUDevice().limits;
    isFallbackAdapter = false;
    info = {
        vendor: 'Mock',
        architecture: 'Mock',
        device: 'Mock Device',
        description: 'Mock WebGPU Adapter for Testing',
    };

    async requestDevice(_descriptor?: GPUDeviceDescriptor): Promise<GPUDevice> {
        return new MockGPUDevice() as unknown as GPUDevice;
    }

    async requestAdapterInfo(): Promise<GPUAdapterInfo> {
        return this.info as GPUAdapterInfo;
    }
}

/**
 * Mock GPU implementation
 */
class MockGPU {
    async requestAdapter(_options?: GPURequestAdapterOptions): Promise<GPUAdapter | null> {
        return new MockGPUAdapter() as unknown as GPUAdapter;
    }

    getPreferredCanvasFormat(): GPUTextureFormat {
        return 'bgra8unorm';
    }

    wgslLanguageFeatures = new Set<string>();
}

/**
 * Setup WebGPU mocks on the global navigator object
 */
export function setupWebGPUMock() {
    // Reset state
    allocatedBuffers.clear();
    bufferIdCounter = 0;
    isDeviceLost = false;
    deviceLostCallback = null;

    // Mock navigator.gpu
    Object.defineProperty(navigator, 'gpu', {
        value: new MockGPU(),
        writable: true,
        configurable: true,
    });

    // Mock userAgent for device detection logic
    Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        writable: true,
        configurable: true,
    });
}

/**
 * Get current buffer allocation stats (for testing)
 */
export function getBufferStats() {
    let totalAllocated = 0;
    let totalDestroyed = 0;
    let leakedBuffers: { id: number; size: number; label?: string }[] = [];

    allocatedBuffers.forEach((info, id) => {
        totalAllocated++;
        if (info.destroyed) {
            totalDestroyed++;
        } else {
            leakedBuffers.push({ id, size: info.size, label: info.label });
        }
    });

    return {
        totalAllocated,
        totalDestroyed,
        leakedCount: totalAllocated - totalDestroyed,
        leakedBuffers,
    };
}

/**
 * Reset all mock state
 */
export function resetMockState() {
    allocatedBuffers.clear();
    bufferIdCounter = 0;
    isDeviceLost = false;
    deviceLostCallback = null;
}

/**
 * Simulate device loss for testing error handling
 */
export function simulateDeviceLoss(device: GPUDevice, reason?: string, message?: string) {
    const mockDevice = device as unknown as MockGPUDevice;
    if (mockDevice._simulateDeviceLoss) {
        mockDevice._simulateDeviceLoss(reason, message);
    }
}

/**
 * Register a callback for device loss events
 */
export function onDeviceLost(callback: (info: { reason: string; message: string }) => void) {
    deviceLostCallback = callback;
}
