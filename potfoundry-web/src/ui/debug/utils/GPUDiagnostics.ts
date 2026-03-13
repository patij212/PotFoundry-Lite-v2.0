/**
 * GPU Diagnostics service for tracking WebGPU resources.
 * 
 * Provides adapter info, buffer allocations, and pipeline stats
 * for the GPU tab in DevConsole.
 * 
 * @module ui/debug/utils/GPUDiagnostics
 */

/** WebGPU adapter information */
export interface AdapterInfo {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
    isFallbackAdapter: boolean;
}

/** WebGPU adapter limits */
export interface AdapterLimits {
    maxTextureDimension2D: number;
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
    maxComputeWorkgroupStorageSize: number;
}

/** Recorded buffer allocation */
export interface BufferAllocation {
    label: string;
    size: number;
    usage: number;
    createdAt: number;
}

/** Recorded pipeline stats */
export interface PipelineStats {
    name: string;
    type: 'render' | 'compute';
    compileTimeMs: number;
    createdAt: number;
}

/** Full diagnostics snapshot */
export interface GPUDiagnosticsSnapshot {
    adapter: AdapterInfo | null;
    limits: AdapterLimits | null;
    buffers: BufferAllocation[];
    pipelines: PipelineStats[];
    totalBufferMemory: number;
    isWebGPUAvailable: boolean;
}

type Listener = (snapshot: GPUDiagnosticsSnapshot) => void;

/** Max allocations to track before eviction */
const MAX_BUFFERS = 100;

/** Max pipelines to track before eviction */
const MAX_PIPELINES = 50;

/**
 * Service for tracking GPU diagnostics.
 */
class GPUDiagnosticsService {
    private adapter: AdapterInfo | null = null;
    private limits: AdapterLimits | null = null;
    private buffers: BufferAllocation[] = [];
    private pipelines: PipelineStats[] = [];
    private listeners: Set<Listener> = new Set();
    private isWebGPUAvailable = false;

    /**
     * Initialize with adapter info from WebGPURenderer.
     */
    setAdapterInfo(info: AdapterInfo, limits: AdapterLimits): void {
        this.adapter = info;
        this.limits = limits;
        this.isWebGPUAvailable = true;
        this.notify();
    }

    /**
     * Record a buffer allocation.
     */
    recordBuffer(label: string, size: number, usage: number): void {
        this.buffers.push({
            label,
            size,
            usage,
            createdAt: Date.now(),
        });
        // Keep last MAX_BUFFERS to prevent memory bloat
        if (this.buffers.length > MAX_BUFFERS) {
            this.buffers = this.buffers.slice(-MAX_BUFFERS);
        }
        this.notify();
    }

    /**
     * Record a pipeline compilation.
     */
    recordPipeline(name: string, type: 'render' | 'compute', compileTimeMs: number): void {
        this.pipelines.push({
            name,
            type,
            compileTimeMs,
            createdAt: Date.now(),
        });
        // Keep last MAX_PIPELINES
        if (this.pipelines.length > MAX_PIPELINES) {
            this.pipelines = this.pipelines.slice(-MAX_PIPELINES);
        }
        this.notify();
    }

    /**
     * Get current diagnostics snapshot.
     */
    getSnapshot(): GPUDiagnosticsSnapshot {
        const totalBufferMemory = this.buffers.reduce((sum, b) => sum + b.size, 0);
        return {
            adapter: this.adapter,
            limits: this.limits,
            buffers: [...this.buffers],
            pipelines: [...this.pipelines],
            totalBufferMemory,
            isWebGPUAvailable: this.isWebGPUAvailable,
        };
    }

    /**
     * Subscribe to diagnostics updates.
     */
    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        // Emit current state immediately
        listener(this.getSnapshot());
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        const snapshot = this.getSnapshot();
        this.listeners.forEach(l => l(snapshot));
    }

    /**
     * Clear recorded data (not adapter info).
     */
    clear(): void {
        this.buffers = [];
        this.pipelines = [];
        this.notify();
    }
}

/** Singleton instance */
export const gpuDiagnostics = new GPUDiagnosticsService();
