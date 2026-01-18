/**
 * PotFoundry Web App - Main Application Component
 * 
 * Standalone version of PotFoundry, running entirely in the browser
 * with no Python/Streamlit dependencies.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRenderer, RendererController } from './renderers';
import { WebGPUController } from './webgpu_core';
import { AppUI } from './ui';
import { useRendererBridge, sendFullStoreToController, usePerformanceTracker } from './hooks';
import { useUIActions, useAppStore } from './state';
import { ControllerProvider, LibraryProvider } from './context';
import { AuthProvider } from './context/AuthContext';
import { UserMenu } from './ui/auth';
import { ToastProvider } from './ui/shared';
import './WebGPUPreview.css';

// ============================================================================
// Fallback Parameters (used only for WebGPU mount if no persisted state exists)
// ============================================================================

/**
 * Fallback parameters for initial WebGPU mount.
 * The actual pot state is loaded from localStorage by Zustand's persist middleware.
 * These defaults are only used to initialize the shader before persisted state is applied.
 */
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

// Define style name to ID mapping matching registry
import { STYLE_IDS } from './styles/registry';

// Re-export or alias for local usage compatibility
const STYLE_NAME_TO_ID = STYLE_IDS;


const App: React.FC = () => {
    // Refs
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const controllerRef = useRef<RendererController | WebGPUController | null>(null);
    const mountedRef = useRef<boolean>(true);
    const emitRef = useRef<(e: unknown) => void>(() => { });

    // State
    const [isReady, setIsReady] = useState(false);
    const [controllerReady, setControllerReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCompatibilityMode, setIsCompatibilityMode] = useState(false);
    // Force renderer remount on crash
    const [remountKey, setRemountKey] = useState(0);
    const [forcedRenderer, setForcedRenderer] = useState<'webgl' | 'webgpu' | undefined>(undefined);

    // Refs for callbacks
    const localParamsLockUntilRef = useRef<number>(0);

    // UI actions
    const { setPanelOpen, toggleFullscreen } = useUIActions();

    // Performance tracking - setGenerating shows loading indicator during mount
    const { setGenerating } = usePerformanceTracker({ debug: false });
    const setGeneratingRef = useRef(setGenerating);
    setGeneratingRef.current = setGenerating;



    // Event emitter - standalone version just logs events
    const emitEvent = useCallback((e: unknown) => {
        const event = e as { type?: string; payload?: unknown };
        const eventType = event?.type ?? '';

        if (eventType === 'ready') {
            setIsReady(true);
            return;
        }

        // Handle runtime device loss (crash)
        if (eventType === 'device-lost') {
            const reason = (event?.payload as any)?.reason || 'Unknown driver crash';
            console.warn('[PotFoundry] Runtime device loss detected:', reason);

            // If not already in compatibility mode, force fallback to WebGL
            if (!isCompatibilityMode && forcedRenderer !== 'webgl') {
                console.log('[PotFoundry] Triggering emergency fallback to WebGL...');
                setForcedRenderer('webgl');
                setRemountKey(k => k + 1);
                // Badge will be shown when WebGL renderer initializes and calls onFallback? 
                // Or we can set it now.
                setIsCompatibilityMode(true);
            }
            return;
        }

        // Log events for debugging (disabled - too verbose)
        // console.debug('[PotFoundry] event', eventType, event);
    }, []);
    emitRef.current = emitEvent;

    // Bridge Zustand state to controller
    useRendererBridge(controllerReady ? controllerRef.current : null, { debug: false });

    // Initialize UI state
    useEffect(() => {
        setPanelOpen(true);
    }, [setPanelOpen]);

    // NOTE: We removed syncStoreFromParams(DEFAULT_PARAMS) here because
    // the Zustand persist middleware already loads saved state from localStorage.
    // Calling syncStoreFromParams with defaults would overwrite user's saved pot.

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
            // Capture console logs for display on error page (since DevTools isn't accessible on mobile)
            const logs: string[] = [];
            const originalLog = console.log;
            const originalWarn = console.warn;
            const originalError = console.error;

            const captureLog = (type: string, ...args: unknown[]) => {
                const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                // Capture WebGPU, Renderer, and WebGL logs for diagnostics
                if (msg.includes('[WebGPU]') || msg.includes('[Renderer]') || msg.includes('[WebGL]')) {
                    logs.push(`${type}: ${msg}`);
                }
            };

            console.log = (...args) => { captureLog('LOG', ...args); originalLog.apply(console, args); };
            console.warn = (...args) => { captureLog('WARN', ...args); originalWarn.apply(console, args); };
            console.error = (...args) => { captureLog('ERR', ...args); originalError.apply(console, args); };

            const restoreConsole = () => {
                console.log = originalLog;
                console.warn = originalWarn;
                console.error = originalError;
            };

            try {
                setGeneratingRef.current(true);

                // DISABLED: Pre-mount WebGPU diagnostic checks crash Windows Dawn backends.
                // The initial requestAdapter() destabilizes the GPU, causing subsequent operations to fail.
                // const diagnostics: string[] = [];
                // diagnostics.push(`navigator.gpu exists: ${!!navigator.gpu}`);
                // if (navigator.gpu) {
                //     diagnostics.push('Attempting requestAdapter()...');
                //     try {
                //         const testAdapter = await navigator.gpu.requestAdapter();
                //         diagnostics.push(`requestAdapter() result: ${testAdapter ? 'SUCCESS' : 'null'}`);
                //         if (testAdapter) {
                //             const info = await (testAdapter as any).requestAdapterInfo?.();
                //             diagnostics.push(`Adapter vendor: ${info?.vendor || 'unknown'}`);
                //             diagnostics.push(`Adapter device: ${info?.device || 'unknown'}`);
                //         }
                //     } catch (adapterErr) {
                //         diagnostics.push(`requestAdapter() error: ${adapterErr}`);
                //     }
                // }
                // console.log('[Renderer Diagnostics]', diagnostics);


                // Use the renderer factory which automatically falls back to WebGL
                // Merge persisted state into initialParams to prevent double-compilation on startup
                const storeState = useAppStore.getState();
                const currentStyleName = storeState.style.name;
                // @ts-ignore - indexing by string/StyleName into StyleId record
                const currentStyleId = STYLE_NAME_TO_ID[currentStyleName] ?? 0;
                console.log(`[App] Mount resolving style: '${currentStyleName}' -> ${currentStyleId}`);
                const styleOpts = storeState.style.opts || {};

                const initialParams = {
                    ...DEFAULT_PARAMS,
                    ...storeState.geometry,
                    style: currentStyleId,
                    ...styleOpts,
                    // Ensure snake_case keys are present if webgpu_core prefers them, 
                    // though it handles both.
                };

                const controller = await createRenderer({
                    canvas,
                    canvasId: 'pf-main-canvas',
                    initialParams,
                    emit: (e: unknown) => emitRef.current(e),
                    debugMode: false,
                    forceRenderer: forcedRenderer, // Use forced renderer if set (e.g. after crash)
                    onAutoRotateChange: () => { },
                    onFallback: (reason) => {
                        console.log('[Renderer] Using fallback mode:', reason);
                        setIsCompatibilityMode(true);
                    },
                });

                if (cancelled) {
                    controller?.dispose();
                    restoreConsole();
                    return;
                }

                if (!controller) {
                    restoreConsole();
                    // Both WebGPU and WebGL failed
                    const logOutput = logs.length > 0 ? `\n\nConsole Logs:\n${logs.join('\n')}` : '';
                    setError(`Unable to initialize 3D renderer.\n\nNeither WebGPU nor WebGL could be initialized on your device.${logOutput}`);
                    return;
                }

                restoreConsole();
                controllerRef.current = controller;
                // IMMEDIATELY send all Zustand state (from localStorage persistence)
                // This eliminates the "grey state" and respects user's saved pot
                sendFullStoreToController(controller);
                setControllerReady(true);
                setIsReady(true);
                setGeneratingRef.current(false);

            } catch (err) {
                restoreConsole();
                const logOutput = logs.length > 0 ? `\n\nConsole Logs:\n${logs.join('\n')}` : '';
                console.error('[PotFoundry] mount failed', err);
                setError((err instanceof Error ? err.message : String(err)) + logOutput);
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
    }, [remountKey, forcedRenderer]);

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

    // Error state - show detailed troubleshooting help
    if (error) {
        const isAndroid = /android/i.test(navigator.userAgent);
        const isIOS = /iphone|ipad/i.test(navigator.userAgent);
        const isMobile = isAndroid || isIOS;
        const isSecure = typeof window !== 'undefined' && window.isSecureContext;
        const protocol = typeof window !== 'undefined' ? window.location?.protocol : '';

        return (
            <div className="pf-error">
                <h1>WebGPU Not Available</h1>
                <p style={{ whiteSpace: 'pre-line' }}>{error}</p>

                {!isSecure && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '16px',
                        textAlign: 'left'
                    }}>
                        <strong style={{ color: '#f87171' }}>🔒 HTTPS Required</strong>
                        <p style={{ fontSize: '13px', marginTop: '8px' }}>
                            WebGPU requires a secure connection. Current protocol: <code>{protocol}</code>
                            <br />Please access the app via <strong>https://</strong>
                        </p>
                    </div>
                )}

                <div style={{
                    background: 'rgba(99, 102, 241, 0.1)',
                    borderRadius: '8px',
                    padding: '16px',
                    textAlign: 'left',
                    maxWidth: '500px',
                    margin: '0 auto'
                }}>
                    <strong>Troubleshooting Steps:</strong>
                    <ul style={{ marginTop: '12px', paddingLeft: '20px', lineHeight: '1.8' }}>
                        {isAndroid && (
                            <>
                                <li>Ensure Chrome is version 121 or higher</li>
                                <li>Verify Android 12+ is installed</li>
                                <li>Try: <code style={{ fontSize: '11px' }}>chrome://flags</code> → enable "Unsafe WebGPU Support"</li>
                                <li>Check <code style={{ fontSize: '11px' }}>chrome://gpu</code> for WebGPU status</li>
                            </>
                        )}
                        {isIOS && (
                            <>
                                <li>Update to iOS 18.2+ (Safari)</li>
                                <li>Settings → Safari → Advanced → Feature Flags → enable WebGPU</li>
                            </>
                        )}
                        {!isMobile && (
                            <>
                                <li>Use Chrome 113+, Edge 113+, or Safari 18.2+</li>
                                <li>For Firefox: enable in <code>about:config</code> → <code>dom.webgpu.enabled</code></li>
                            </>
                        )}
                    </ul>
                </div>

                <details style={{ marginTop: '16px', textAlign: 'left', maxWidth: '500px', margin: '16px auto 0' }}>
                    <summary style={{ cursor: 'pointer', color: '#8b949e' }}>Device Info</summary>
                    <pre style={{
                        fontSize: '11px',
                        background: 'rgba(0,0,0,0.3)',
                        padding: '12px',
                        borderRadius: '6px',
                        marginTop: '8px',
                        overflow: 'auto'
                    }}>
                        {`User Agent: ${navigator.userAgent}
Platform: ${navigator.platform}
Secure Context: ${isSecure ? 'Yes' : 'No'}
Protocol: ${protocol}`}
                    </pre>
                </details>
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
                        className="pf-wgpu-preview pf-wgpu-preview--fullscreen"
                        data-embedded-ui="1"
                        data-ready={isReady}
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

                        {/* Compatibility Mode Indicator */}
                        {isCompatibilityMode && (
                            <div
                                style={{
                                    position: 'absolute',
                                    bottom: '10px',
                                    right: '10px',
                                    padding: '4px 10px',
                                    backgroundColor: 'rgba(255, 193, 7, 0.9)',
                                    color: '#1a1a2e',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                    zIndex: 10,
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                }}
                                title="Using WebGL renderer because WebGPU is not available on this device"
                            >
                                ⚠️ Compatibility Mode (WebGL)
                            </div>
                        )}

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
