/**
 * Geometry inspection service for DevConsole.
 * 
 * Tracks preview mesh stats and export results.
 * 
 * @module ui/debug/utils/GeometryInspector
 */

/** Stats from the preview/render mesh */
export interface PreviewStats {
    vertexCount: number;
    triangleCount: number;
    drawCalls: number;
}

/** Stats from the most recent export */
export interface ExportStats {
    vertexCount: number;
    triangleCount: number;
    exportTimeMs: number;
    fileSize?: string;
    volumeMl?: number;
    surfaceAreaMm2?: number;
    maxSubdivisionDepth?: number;
}

/** Full geometry snapshot */
export interface GeometrySnapshot {
    preview: PreviewStats | null;
    lastExport: ExportStats | null;
    lastUpdateTime: number;
}

type Listener = (snapshot: GeometrySnapshot) => void;

/**
 * Service for tracking geometry diagnostics.
 */
class GeometryInspectorService {
    private preview: PreviewStats | null = null;
    private lastExport: ExportStats | null = null;
    private listeners: Set<Listener> = new Set();

    /**
     * Update preview stats (called from render loop).
     */
    updatePreview(stats: PreviewStats): void {
        this.preview = stats;
        this.notify();
    }

    /**
     * Record export completion.
     */
    recordExport(stats: ExportStats): void {
        this.lastExport = stats;
        this.notify();
    }

    /**
     * Get current snapshot.
     */
    getSnapshot(): GeometrySnapshot {
        return {
            preview: this.preview,
            lastExport: this.lastExport,
            lastUpdateTime: Date.now(),
        };
    }

    /**
     * Subscribe to updates.
     */
    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        listener(this.getSnapshot());
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        const snapshot = this.getSnapshot();
        this.listeners.forEach(l => l(snapshot));
    }

    /**
     * Clear all recorded data.
     */
    clear(): void {
        this.preview = null;
        this.lastExport = null;
        this.notify();
    }
}

/** Singleton instance */
export const geometryInspector = new GeometryInspectorService();
