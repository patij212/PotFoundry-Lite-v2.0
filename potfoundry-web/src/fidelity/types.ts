/**
 * Shared types and pinned thresholds for the 3D export fidelity harness (SP0).
 * Pure declarations only — safe to import from both vitest and the app bundle.
 */

/** Analytic outer radius of the pottery surface at a given angle/height. */
export type RTrue = (theta: number, z: number) => number;

/** Minimal mesh view the pure metric functions operate on. */
export interface MeshView {
  vertices: Float32Array; // flat [x0,y0,z0, x1,y1,z1, ...]
  indices: Uint32Array;   // flat [i0,i1,i2, ...]
}

/** One row of the fidelity matrix — all numeric, transferable across CDP. */
export interface FidelityMetrics {
  styleId: string;
  triangleCount: number;
  vertexCount: number;
  referenceTriangleCount: number;

  // 1. Sag deviation (mm) from the dense radial reference.
  maxSagMm: number;
  rmsSagMm: number;
  sagReferenceBinThetaRad: number;
  sagReferenceBinZmm: number;

  // 2. 3D triangle quality.
  maxAspect3D: number;
  minAngleDeg: number;
  sliverCount: number;

  // 3. Watertightness.
  boundaryEdges: number;
  nonManifoldEdges: number;

  // 4. Normal consistency.
  orientationMismatches: number;

  // 5. Feature preservation (from pipeline chain accounting).
  featuresExpected: number;
  featuresPresent: number;
  featuresDropped: number;
}

export type FidelityMatrixRow = FidelityMetrics;

export interface FidelityBaseline {
  generatedAt: string;
  budget: number;
  referenceBudget: number;
  refDimensions: { H: number; Rt: number; Rb: number };
  rows: FidelityMatrixRow[];
}

// ── Pinned thresholds (see spec "Thresholds") ──────────────────────────────
/** Sag tolerance target (mm). Sub-tenth-mm, well above the dense-ref floor. */
export const SAG_TOL_MM = 0.1;
/** 3D aspect-ratio sliver bound (matches the UV audit B5 bound). */
export const ASPECT_MAX = 100;
/** Position weld tolerance (mm), matches exportValidation.ts. */
export const WELD_TOL_MM = 1e-4;
