/**
 * Geometry Inspector tab for DevConsole.
 * 
 * Shows preview mesh stats and export results.
 * 
 * @module ui/debug/tabs/GeometryTab
 */

import React, { useEffect, useState } from 'react';
import { geometryInspector, GeometrySnapshot } from '../utils/GeometryInspector';

/**
 * Geometry Tab component.
 */
export const GeometryTab: React.FC = () => {
    const [snapshot, setSnapshot] = useState<GeometrySnapshot>(
        geometryInspector.getSnapshot()
    );

    useEffect(() => {
        return geometryInspector.subscribe(setSnapshot);
    }, []);

    const { preview, lastExport } = snapshot;

    return (
        <div className="pf-geometry-tab">
            {/* Preview Stats */}
            <div className="pf-gpu-section">
                <h3 className="pf-gpu-section-title">🎨 Preview Mesh</h3>
                {preview ? (
                    <div className="pf-gpu-grid">
                        <div className="pf-gpu-item">
                            <span className="pf-gpu-label">Vertices</span>
                            <span className="pf-gpu-value">{preview.vertexCount.toLocaleString()}</span>
                        </div>
                        <div className="pf-gpu-item">
                            <span className="pf-gpu-label">Triangles</span>
                            <span className="pf-gpu-value">{preview.triangleCount.toLocaleString()}</span>
                        </div>
                        <div className="pf-gpu-item">
                            <span className="pf-gpu-label">Draw Calls</span>
                            <span className="pf-gpu-value">{preview.drawCalls}</span>
                        </div>
                    </div>
                ) : (
                    <div className="pf-geometry-empty">No preview data available</div>
                )}
            </div>

            {/* Export Stats */}
            <div className="pf-gpu-section">
                <h3 className="pf-gpu-section-title">📦 Last Export</h3>
                {lastExport ? (
                    <>
                        <div className="pf-gpu-grid">
                            <div className="pf-gpu-item">
                                <span className="pf-gpu-label">Vertices</span>
                                <span className="pf-gpu-value">{lastExport.vertexCount.toLocaleString()}</span>
                            </div>
                            <div className="pf-gpu-item">
                                <span className="pf-gpu-label">Triangles</span>
                                <span className="pf-gpu-value">{lastExport.triangleCount.toLocaleString()}</span>
                            </div>
                            <div className="pf-gpu-item">
                                <span className="pf-gpu-label">Export Time</span>
                                <span className="pf-gpu-value">{lastExport.exportTimeMs.toFixed(0)}ms</span>
                            </div>
                            {lastExport.fileSize && (
                                <div className="pf-gpu-item">
                                    <span className="pf-gpu-label">File Size</span>
                                    <span className="pf-gpu-value">{lastExport.fileSize}</span>
                                </div>
                            )}
                            {lastExport.volumeMl !== undefined && (
                                <div className="pf-gpu-item">
                                    <span className="pf-gpu-label">Volume</span>
                                    <span className="pf-gpu-value">{lastExport.volumeMl.toFixed(1)} mL</span>
                                </div>
                            )}
                            {lastExport.surfaceAreaMm2 !== undefined && (
                                <div className="pf-gpu-item">
                                    <span className="pf-gpu-label">Surface Area</span>
                                    <span className="pf-gpu-value">{(lastExport.surfaceAreaMm2 / 100).toFixed(1)} cm²</span>
                                </div>
                            )}
                            {lastExport.maxSubdivisionDepth !== undefined && (
                                <div className="pf-gpu-item">
                                    <span className="pf-gpu-label">Subdivision Depth</span>
                                    <span className="pf-gpu-value">{lastExport.maxSubdivisionDepth}</span>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="pf-geometry-empty">Export a mesh to see stats</div>
                )}
            </div>

            {/* Clear Button */}
            <button 
                className="pf-console-btn pf-gpu-clear"
                onClick={() => geometryInspector.clear()}
            >
                Clear Data
            </button>
        </div>
    );
};
