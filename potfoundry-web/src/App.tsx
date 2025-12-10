/**
 * PotFoundry Web App - Main Application Component
 * 
 * Standalone version of PotFoundry, running entirely in the browser
 * with no Python/Streamlit dependencies.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { mount, WebGPUController } from './webgpu_core';
import { AppUI } from './ui';
import { useRendererBridge, syncStoreFromParams, sendFullStoreToController, usePerformanceTracker, parseStatusMetrics } from './hooks';
import { useUIActions } from './state';
import { ControllerProvider, LibraryProvider } from './context';
import { AuthProvider } from './context/AuthContext';
import { UserMenu } from './ui/auth';
import { ToastProvider } from './ui/shared';
import './WebGPUPreview.css';

// ============================================================================
// Default Parameters
// ============================================================================

const DEFAULT_PARAMS = {
    H: 120,
    top_od: 140,
    bottom_od: 90,
    t_wall: 3,
    t_bottom: 3,
    r_drain: 10,
    expn: 1.1,
    n_theta: 168,
    n_z: 84,
    style: 'SuperformulaBlossom',
};

// ============================================================================
// App Component
// ============================================================================

const App: React.FC = () => {
    // Refs
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const controllerRef = useRef<WebGPUController | null>(null);
    const mountedRef = useRef<boolean>(true);
    const emitRef = useRef<(e: unknown) => void>(() => { });

    // State
    const [status, setStatus] = useState('Initializing WebGPU preview...');
    const [isReady, setIsReady] = useState(false);
    const [controllerReady, setControllerReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Refs for callbacks
    const localParamsLockUntilRef = useRef<number>(0);

    // UI actions
    const { setPanelOpen, toggleFullscreen } = useUIActions();

    // Performance tracking
    const { updateMetrics, setGenerating } = usePerformanceTracker({ debug: false });
    const setGeneratingRef = useRef(setGenerating);
    setGeneratingRef.current = setGenerating;

    // Status update handler
    const handleStatusUpdate = useCallback((newStatus: string) => {
        setStatus(newStatus);
        const metrics = parseStatusMetrics(newStatus);
        if (metrics) {
            updateMetrics({
                triangleCount: metrics.triangleCount ?? 0,
                vertexCount: Math.round((metrics.triangleCount ?? 0) * 0.6),
                generationTime: 0,
                renderTime: metrics.renderTime,
            });
        }
    }, [updateMetrics]);

    // Event emitter - standalone version just logs events
    const emitEvent = useCallback((e: unknown) => {
        const event = e as { type?: string; payload?: unknown };
        const eventType = event?.type ?? '';

        if (eventType === 'ready') {
            setIsReady(true);
            return;
        }

        // Log events for debugging
        console.debug('[PotFoundry] event', eventType, event);
    }, []);
    emitRef.current = emitEvent;

    // Bridge Zustand state to controller
    useRendererBridge(controllerReady ? controllerRef.current : null, { debug: false });

    // Initialize UI state
    useEffect(() => {
        setPanelOpen(true);
    }, [setPanelOpen]);

    // Sync initial params to store
    useEffect(() => {
        syncStoreFromParams(DEFAULT_PARAMS);
    }, []);

    // Mount WebGPU renderer
    useEffect(() => {
        let cancelled = false;
        const canvas = canvasRef.current;

        if (!canvas) {
            setError('Canvas element not found');
            return;
        }

        mountedRef.current = true;

        const mountRenderer = async () => {
            try {
                setGeneratingRef.current(true);

                const controller = await mount({
                    canvas,
                    canvasId: 'pf-main-canvas',
                    initialParams: DEFAULT_PARAMS,
                    emit: (e: unknown) => emitRef.current(e),
                    debugMode: false,
                    onAutoRotateChange: () => { },
                });

                if (cancelled) {
                    controller?.dispose();
                    return;
                }

                if (!controller) {
                    setError('WebGPU mount returned null - WebGPU may not be supported');
                    return;
                }

                controllerRef.current = controller;
                controller.updateParams(DEFAULT_PARAMS);
                // IMMEDIATELY send all Zustand state - this eliminates the "grey state"
                // by not waiting for React to re-render before useRendererBridge activates
                sendFullStoreToController(controller);
                setControllerReady(true);
                setIsReady(true);
                setGeneratingRef.current(false);

            } catch (err) {
                console.error('[PotFoundry] mount failed', err);
                setError(err instanceof Error ? err.message : String(err));
                setGeneratingRef.current(false);
            }
        };

        void mountRenderer();

        return () => {
            cancelled = true;
            mountedRef.current = false;
            controllerRef.current?.dispose();
            controllerRef.current = null;
        };
    }, []);

    // Intercept F11 to use our fullscreen toggle instead of browser's default
    // This ensures F11 and the fullscreen button behave consistently
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F11') {
                e.preventDefault();
                toggleFullscreen();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleFullscreen]);

    // Error state
    if (error) {
        return (
            <div className="pf-error">
                <h1>WebGPU Not Available</h1>
                <p>{error}</p>
                <p>
                    PotFoundry requires WebGPU support. Please use a modern browser like
                    Chrome 113+, Edge 113+, or Firefox with WebGPU enabled.
                </p>
            </div>
        );
    }

    return (
        <ToastProvider>
            <AuthProvider>
                <div className="pf-app">
                    {/* User Menu - Top Right */}
                    <div className="pf-app__header">
                        <UserMenu />
                    </div>

                    <div
                        className="pf-wgpu-preview"
                        data-embedded-ui="1"
                        style={{
                            height: '100vh',
                            background: '#242B46',
                        }}
                    >
                        {/* Canvas Layer */}
                        <canvas
                            ref={canvasRef}
                            className="pf-wgpu-preview__canvas"
                            id="pf-main-canvas"
                            tabIndex={0}
                            onClick={() => canvasRef.current?.focus()}
                            onPointerDown={() => canvasRef.current?.focus()}
                        />

                        {/* Embedded UI Overlay */}
                        <ControllerProvider
                            controllerRef={controllerRef}
                            isReady={controllerReady}
                            canvasRef={canvasRef}
                            localParamsLockRef={localParamsLockUntilRef}
                        >
                            <LibraryProvider libraryData={null}>
                                <AppUI />
                            </LibraryProvider>
                        </ControllerProvider>
                    </div>
                </div>
            </AuthProvider>
        </ToastProvider>
    );
};

export default App;
