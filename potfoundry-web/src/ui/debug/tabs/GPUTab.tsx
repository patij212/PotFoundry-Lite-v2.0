/**
 * GPU Diagnostics tab for DevConsole.
 * 
 * Shows WebGPU adapter info, limits, buffer allocations, and pipeline stats.
 * 
 * @module ui/debug/tabs/GPUTab
 */

import React, { useEffect, useState } from 'react';
import { gpuDiagnostics, GPUDiagnosticsSnapshot } from '../utils/GPUDiagnostics';

/** Number of recent items to display */
const DISPLAY_COUNT = 10;

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * GPU Diagnostics Tab component.
 */
export const GPUTab: React.FC = () => {
    const [snapshot, setSnapshot] = useState<GPUDiagnosticsSnapshot>(
        gpuDiagnostics.getSnapshot()
    );

    useEffect(() => {
        return gpuDiagnostics.subscribe(setSnapshot);
    }, []);

    if (!snapshot.isWebGPUAvailable) {
        return (
            <div className="pf-gpu-tab pf-gpu-tab--unavailable">
                <div className="pf-gpu-unavailable">
                    <span className="pf-gpu-unavailable-icon">⚠️</span>
                    <span>WebGPU not available</span>
                    <span className="pf-gpu-unavailable-hint">
                        Using WebGL fallback renderer
                    </span>
                </div>
            </div>
        );
    }

    const { adapter, limits, buffers, pipelines, totalBufferMemory } = snapshot;

    return (
        <div className="pf-gpu-tab">
            {/* Adapter Info */}
            <div className="pf-gpu-section">
                <h3 className="pf-gpu-section-title">🎮 Adapter</h3>
                <div className="pf-gpu-grid">
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Vendor</span>
                        <span className="pf-gpu-value">{adapter?.vendor ?? '-'}</span>
                    </div>
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Architecture</span>
                        <span className="pf-gpu-value">{adapter?.architecture ?? '-'}</span>
                    </div>
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Device</span>
                        <span className="pf-gpu-value">{adapter?.device ?? '-'}</span>
                    </div>
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Fallback</span>
                        <span className={`pf-gpu-value ${adapter?.isFallbackAdapter ? 'pf-gpu-value--warn' : ''}`}>
                            {adapter?.isFallbackAdapter ? 'Yes ⚠️' : 'No ✓'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Limits */}
            <div className="pf-gpu-section">
                <h3 className="pf-gpu-section-title">📊 Limits</h3>
                <div className="pf-gpu-grid">
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Max Texture 2D</span>
                        <span className="pf-gpu-value">{limits?.maxTextureDimension2D?.toLocaleString() ?? '-'}px</span>
                    </div>
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Max Buffer</span>
                        <span className="pf-gpu-value">{limits ? formatBytes(limits.maxBufferSize) : '-'}</span>
                    </div>
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Max Storage Binding</span>
                        <span className="pf-gpu-value">{limits ? formatBytes(limits.maxStorageBufferBindingSize) : '-'}</span>
                    </div>
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Workgroup Storage</span>
                        <span className="pf-gpu-value">{limits ? formatBytes(limits.maxComputeWorkgroupStorageSize) : '-'}</span>
                    </div>
                </div>
            </div>

            {/* Memory Summary */}
            <div className="pf-gpu-section">
                <h3 className="pf-gpu-section-title">💾 Memory</h3>
                <div className="pf-gpu-memory-summary">
                    <span className="pf-gpu-memory-total">{formatBytes(totalBufferMemory)}</span>
                    <span className="pf-gpu-memory-label">tracked buffer memory</span>
                    <span className="pf-gpu-memory-count">({buffers.length} buffers)</span>
                </div>
            </div>

            {/* Recent Buffers */}
            {buffers.length > 0 && (
                <div className="pf-gpu-section">
                    <h3 className="pf-gpu-section-title">📦 Recent Buffers</h3>
                    <div className="pf-gpu-list">
                        {buffers.slice(-DISPLAY_COUNT).reverse().map((b, i) => (
                            <div key={i} className="pf-gpu-list-item">
                                <span className="pf-gpu-buffer-label">{b.label || 'Unnamed'}</span>
                                <span className="pf-gpu-buffer-size">{formatBytes(b.size)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Pipelines */}
            {pipelines.length > 0 && (
                <div className="pf-gpu-section">
                    <h3 className="pf-gpu-section-title">⚡ Pipeline Compiles</h3>
                    <div className="pf-gpu-list">
                        {pipelines.slice(-DISPLAY_COUNT).reverse().map((p, i) => (
                            <div key={i} className="pf-gpu-list-item">
                                <span className="pf-gpu-pipeline-name">{p.name}</span>
                                <span className="pf-gpu-pipeline-type">{p.type}</span>
                                <span className={`pf-gpu-pipeline-time ${p.compileTimeMs > 100 ? 'pf-gpu-pipeline-time--slow' : ''}`}>
                                    {p.compileTimeMs.toFixed(1)}ms
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Clear Button */}
            <button 
                className="pf-console-btn pf-gpu-clear"
                onClick={() => gpuDiagnostics.clear()}
            >
                Clear History
            </button>
        </div>
    );
};
