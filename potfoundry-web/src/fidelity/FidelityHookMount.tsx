/**
 * FidelityHookMount — always-mounted, dev/test-gated registrar for the SP0
 * fidelity harness (see windowHook.ts). Renders nothing.
 *
 * Why a dedicated component instead of registering from a UI panel: the harness
 * must work regardless of which UI theme is active. The default theme is
 * 'classic', and the v2-only StatusFooter never mounts under it — so a panel-
 * scoped registration leaves window.__pfFidelity undefined in a fresh browser
 * context (the exact case Playwright hits). Mounting here, directly under
 * ControllerProvider in App.tsx, decouples the instrument from the UI theme.
 *
 * Self-gates via shouldEnableFidelityHook() (import.meta.env.DEV or ?fidelity).
 * No-op in production.
 *
 * @module fidelity/FidelityHookMount
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../state';
import { useParametricExport } from '../hooks/useParametricExport';
import { useGPUExport } from '../hooks/useGPUExport';
import { createFidelityApi, shouldEnableFidelityHook, type FidelityHookDeps } from './windowHook';

/**
 * Dense uniform-grid resolution for the GPU R_true reference under ?fidelity.
 * 1280×720 ≈ 1.84M triangles / 921k vertices — comfortably denser than the
 * 720×400 radial bin grid R_true is resampled into, while keeping per-style
 * metric binning and memory modest across all ~20 styles.
 */
const FIDELITY_REF_N_THETA = 1280;
const FIDELITY_REF_N_Z = 720;

/**
 * Only the explicit ?fidelity URL param flips the store into dense-reference
 * mode. Plain import.meta.env.DEV must NOT, because the mesh slice is persisted
 * to localStorage — a normal dev session would otherwise inherit a 2048×1024
 * export resolution permanently.
 */
function isFidelityRun(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).has('fidelity');
}

export function FidelityHookMount(): null {
  const setStyle = useAppStore((s) => s.setStyle);
  const setMeshParams = useAppStore((s) => s.setMeshParams);
  const styleName = useAppStore((s) => s.style.name);
  const parametricExport = useParametricExport();
  const gpuExport = useGPUExport();

  // Keep the latest hook handles in a ref so the window API (registered ONCE
  // below) always dereferences live values — no stale closures, no churny
  // re-registration when React re-renders these unstable hook objects.
  const depsRef = useRef<FidelityHookDeps>({
    setStyle: () => {},
    isAvailable: () => false,
    isReferenceAvailable: () => false,
    generateMesh: async () => null,
    generateReference: async () => null,
  });
  depsRef.current = {
    setStyle: (name: string) => setStyle(name as Parameters<typeof setStyle>[0]),
    isAvailable: () => parametricExport.isAvailable,
    isReferenceAvailable: () => gpuExport.isGPUAvailable,
    // returnInvalidMesh: the harness must measure the pipeline's actual HEAD
    // output even when its own validator rejects it (non-manifold/sliver/etc).
    generateMesh: (n) => parametricExport.generateMesh(n, { returnInvalidMesh: true }),
    generateReference: () => gpuExport.generateMesh(),
  };

  // Expose the current style id for the fidelity hook's row labelling.
  useEffect(() => {
    (window as unknown as { __pfCurrentStyle?: string }).__pfCurrentStyle = styleName;
  }, [styleName]);

  // Drive the GPU reference grid to a dense resolution — once, only on a real
  // fidelity run. The GPU init effect is keyed on style.name, so this store
  // write does not re-init the pipeline; it is read at generate time.
  useEffect(() => {
    if (!isFidelityRun()) return;
    setMeshParams({ export_n_theta: FIDELITY_REF_N_THETA, export_n_z: FIDELITY_REF_N_Z });
  }, [setMeshParams]);

  // Register the dev/test-gated 3D fidelity measurement hook (SP0) exactly once.
  // Methods read depsRef.current, so they pick up the latest pipeline handles.
  useEffect(() => {
    if (!shouldEnableFidelityHook()) return;
    window.__pfFidelity = createFidelityApi({
      setStyle: (name) => depsRef.current.setStyle(name),
      isAvailable: () => depsRef.current.isAvailable(),
      isReferenceAvailable: () => depsRef.current.isReferenceAvailable(),
      generateMesh: (n) => depsRef.current.generateMesh(n),
      generateReference: () => depsRef.current.generateReference(),
    });
    return () => {
      delete window.__pfFidelity;
    };
  }, []);

  return null;
}
