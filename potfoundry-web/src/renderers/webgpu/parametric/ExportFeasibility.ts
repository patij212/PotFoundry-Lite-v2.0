/**
 * Tolerance feasibility checks for parametric export.
 *
 * These estimates are conservative preflight gates. They do not replace the
 * post-tessellation validator; they prevent requests that are mathematically
 * or operationally unreasonable before expensive GPU work starts.
 */

import type { PotDimensions } from '../../../geometry/types';
import type { ExportTolerances } from './types';
import { MAX_BINARY_STL_BYTES, MAX_BINARY_STL_TRIANGLES } from './QualityProfiles';

/** Practical lower bound for browser-side mm-scale geometry tolerances. */
export const MIN_STABLE_POSITION_TOLERANCE_MM = 0.00005;

const MIN_CIRCUMFERENTIAL_SEGMENTS = 32;
const MIN_VERTICAL_SEGMENTS = 12;
const SURFACE_COMPLEXITY_FACTOR = 4;
const TRIANGLES_PER_GRID_CELL = 2;
const STL_HEADER_BYTES = 84;
const STL_TRIANGLE_BYTES = 50;

/** Inputs for tolerance feasibility assessment. */
export interface ToleranceFeasibilityRequest {
    /** Pot dimensions in millimeters. */
    dimensions: PotDimensions;
    /** Effective export tolerances. */
    tolerances: ExportTolerances;
    /** Triangle budget requested for this export attempt. */
    targetTriangles: number;
    /** Whether the user explicitly requested these tolerances. */
    explicitToleranceRequest: boolean;
}

/** Result of preflight tolerance feasibility assessment. */
export interface ToleranceFeasibilityReport {
    /** Whether the request can proceed. */
    ok: boolean;
    /** Blocking issues. */
    errors: string[];
    /** Non-blocking warnings. */
    warnings: string[];
    /** Conservative circumferential segment estimate. */
    estimatedCircumferentialSegments: number;
    /** Conservative vertical segment estimate. */
    estimatedVerticalSegments: number;
    /** Conservative triangle estimate needed to meet position tolerance. */
    estimatedTrianglesForTolerance: number;
    /** Estimated binary STL size for the tolerance-driven triangle count. */
    estimatedBinaryStlBytes: number;
}

/** Assess whether a requested tolerance/budget pair is feasible. */
export function assessToleranceFeasibility(
    request: ToleranceFeasibilityRequest,
): ToleranceFeasibilityReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    const epsPosMm = request.tolerances.epsPosMm;

    if (!Number.isFinite(epsPosMm) || epsPosMm <= 0) {
        errors.push(`epsPosMm must be a positive finite tolerance, got ${epsPosMm}`);
    }
    if (!Number.isFinite(request.targetTriangles) || request.targetTriangles <= 0) {
        errors.push(`targetTriangles must be a positive finite number, got ${request.targetTriangles}`);
    }
    if (request.targetTriangles > MAX_BINARY_STL_TRIANGLES) {
        errors.push(
            `targetTriangles=${Math.ceil(request.targetTriangles).toLocaleString()} would exceed the hard 1 GiB binary STL limit`,
        );
    }

    const stableEps = Number.isFinite(epsPosMm) && epsPosMm > 0
        ? epsPosMm
        : MIN_STABLE_POSITION_TOLERANCE_MM;
    const maxRadiusMm = estimateEnvelopeRadiusMm(request.dimensions);
    const maxEdgeLengthMm = Math.max(
        stableEps,
        Math.sqrt(8 * maxRadiusMm * stableEps),
    );
    const estimatedCircumferentialSegments = Math.max(
        MIN_CIRCUMFERENTIAL_SEGMENTS,
        Math.ceil((2 * Math.PI * maxRadiusMm) / maxEdgeLengthMm),
    );
    const estimatedVerticalSegments = Math.max(
        MIN_VERTICAL_SEGMENTS,
        Math.ceil(Math.max(request.dimensions.H, maxRadiusMm) / maxEdgeLengthMm),
    );
    const estimatedTrianglesForTolerance =
        estimatedCircumferentialSegments *
        estimatedVerticalSegments *
        SURFACE_COMPLEXITY_FACTOR *
        TRIANGLES_PER_GRID_CELL;
    const estimatedBinaryStlBytes = STL_HEADER_BYTES +
        estimatedTrianglesForTolerance * STL_TRIANGLE_BYTES;

    if (request.explicitToleranceRequest && epsPosMm < MIN_STABLE_POSITION_TOLERANCE_MM) {
        errors.push(
            `epsPosMm=${epsPosMm}mm is below the numerical stability floor ` +
            `${MIN_STABLE_POSITION_TOLERANCE_MM}mm for browser-side Float32 export`,
        );
    }

    if (estimatedBinaryStlBytes > MAX_BINARY_STL_BYTES) {
        errors.push(
            `requested tolerance needs about ${estimatedTrianglesForTolerance.toLocaleString()} triangles ` +
            `(${formatBytes(estimatedBinaryStlBytes)} binary STL), exceeding the hard 1 GiB limit`,
        );
    }

    if (
        request.explicitToleranceRequest &&
        Number.isFinite(request.targetTriangles) &&
        request.targetTriangles > 0 &&
        request.targetTriangles < estimatedTrianglesForTolerance
    ) {
        errors.push(
            `targetTriangles=${Math.floor(request.targetTriangles).toLocaleString()} is too low for ` +
            `epsPosMm=${epsPosMm}mm; estimated minimum is ` +
            `${estimatedTrianglesForTolerance.toLocaleString()} triangles`,
        );
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        estimatedCircumferentialSegments,
        estimatedVerticalSegments,
        estimatedTrianglesForTolerance,
        estimatedBinaryStlBytes,
    };
}

/** Throw an actionable error when a tolerance request is infeasible. */
export function assertToleranceFeasible(request: ToleranceFeasibilityRequest): void {
    const report = assessToleranceFeasibility(request);
    if (report.ok) return;
    throw new Error(
        '[ParametricExport] Cannot satisfy requested export tolerance: ' +
        report.errors.join('; '),
    );
}

function estimateEnvelopeRadiusMm(dimensions: PotDimensions): number {
    const baseRadius = Math.max(
        Math.abs(dimensions.Rt),
        Math.abs(dimensions.Rb),
        Math.abs(dimensions.rDrain),
    );
    return Math.max(1, baseRadius + Math.max(0, dimensions.tWall));
}

function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
