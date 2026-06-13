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
  const setStyleOpts = useAppStore((s) => s.setStyleOpts);
  const setMeshParams = useAppStore((s) => s.setMeshParams);
  const styleName = useAppStore((s) => s.style.name);
  const parametricExport = useParametricExport();
  const gpuExport = useGPUExport();

  // Keep the latest hook handles in a ref so the window API (registered ONCE
  // below) always dereferences live values — no stale closures, no churny
  // re-registration when React re-renders these unstable hook objects.
  const setGeometryParams = useAppStore((s) => s.setGeometryParams);
  const depsRef = useRef<FidelityHookDeps>({
    setStyle: () => {},
    setDimensions: () => {},
    setStyleParams: () => {},
    isAvailable: () => false,
    isReferenceAvailable: () => false,
    generateMesh: async () => null,
    generateReference: async () => null,
  });
  depsRef.current = {
    setStyle: (name: string) => setStyle(name as Parameters<typeof setStyle>[0]),
    setDimensions: (params: Record<string, number>) =>
      setGeometryParams(params as Parameters<typeof setGeometryParams>[0]),
    setStyleParams: (params: Record<string, number>) => setStyleOpts(params),
    isAvailable: () => parametricExport.isAvailable,
    isReferenceAvailable: () => gpuExport.isGPUAvailable,
    // returnInvalidMesh: the harness must measure the pipeline's actual HEAD
    // output even when its own validator rejects it (non-manifold/sliver/etc).
    generateMesh: (n) => parametricExport.generateMesh(n, { returnInvalidMesh: true }),
    generateReference: () => gpuExport.generateMesh(),
    // Live style/geometry state for the analytic true-ridge construction
    // (diagnoseCrestLateralDeviation). r0 = mean wall radius — the radius
    // SCALE only (ridge loci are r0-independent; r0 keeps the f64 mirror's
    // prominence gate in physical mm). The spin/twist params mirror what
    // production useExport.buildStyleOptions injects into the style functions
    // — the diagnostic refuses (null) when they are non-zero, because its
    // analytic ridge is solved spin-free.
    getStyleState: () => {
      const s = useAppStore.getState();
      return {
        opts: { ...(s.style.opts ?? {}) } as Record<string, number>,
        H: s.geometry.H,
        r0: (s.geometry.top_od + s.geometry.bottom_od) / 4,
        spinTurns: s.geometry.spinTurns,
        spinPhaseDeg: s.geometry.spinPhase,
        spinCurveExp: s.geometry.spinCurve,
        // Per-t base PROFILE inputs for the B5 absolute surface-fidelity gate
        // (diagnoseSurfaceFidelity). The scalar mean `r0` above reads a CYLINDER
        // on a tapered pot — the gate needs Rt/Rb/expn to reconstruct
        // r0(t)=baseRadius(t·H,H,Rb,Rt,expn,bell), the EXPORT's true base radius.
        Rt: s.geometry.top_od / 2,
        Rb: s.geometry.bottom_od / 2,
        expn: s.geometry.expn,
        bellAmp: s.geometry.bellAmp,
        bellCenter: s.geometry.bellCenter,
        bellWidth: s.geometry.bellWidth,
      };
    },
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
      setDimensions: (params) => depsRef.current.setDimensions(params),
      setStyleParams: (params) => depsRef.current.setStyleParams(params),
      isAvailable: () => depsRef.current.isAvailable(),
      isReferenceAvailable: () => depsRef.current.isReferenceAvailable(),
      generateMesh: (n) => depsRef.current.generateMesh(n),
      generateReference: () => depsRef.current.generateReference(),
      // Forward absence HONESTLY: no fabricated `{ opts: {}, H: 0, r0: 0 }`
      // fallback — an all-zeros "pot" would read as a perfect (all-zero)
      // deviation result, inverting the documented null contract. When the
      // getter is missing, diagnoseCrestLateralDeviation returns null.
      getStyleState: () => depsRef.current.getStyleState?.() ?? null,
    });
    return () => {
      delete window.__pfFidelity;
    };
  }, []);

  return null;
}
