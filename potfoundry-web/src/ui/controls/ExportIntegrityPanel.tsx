/**
 * ExportIntegrityPanel (Plan Task 4.1).
 *
 * Surfaces the surface-integrity invariants a 3D-print professional checks
 * before slicing — naked (boundary) edges, non-manifold edges, watertightness,
 * and sliver triangles — straight from the conforming export's
 * `validationSummary` (the shape produced by `summarizeConformingValidation`,
 * Plan Task 2.2). It is the in-app equivalent of Rhino's `CheckMesh` /
 * `ShowEdges`: the validator already computes these counts, this just shows them.
 *
 * The conforming `ValidationSummary` exposes the four headline defects as
 * pass/fail booleans plus human-readable `warnings` strings that embed the exact
 * counts (e.g. `"3 boundary edge(s) (naked / non-watertight)"`). We read the
 * count out of the matching warning when present and otherwise fall back to the
 * boolean flag (0 when OK, 1 as a "≥1" placeholder when the flag says fail but
 * no count string was attached). Watertight is derived from `manifoldOk`
 * (boundaryEdges + nonManifoldEdges === 0).
 *
 * When `validationSummary` is undefined/null (e.g. an export path that has not
 * populated it yet) the panel renders a neutral "validation pending" state
 * rather than crashing or implying a defect.
 */
import React from 'react';
import type { ValidationSummary } from '../../renderers/webgpu/parametric/types';
import './ExportIntegrityPanel.css';

export interface ExportIntegrityPanelProps {
    /**
     * The export result's validation summary. May be undefined/null when the
     * active export path has not produced one yet (e.g. conforming before Task
     * 2.2 lands, or before the first generation) → neutral pending state.
     */
    validationSummary?: ValidationSummary | null;
    /** Optional extra class on the root element. */
    className?: string;
}

/**
 * Extract the leading integer count from the first warning string that matches
 * `pattern`. The conforming validator formats each defect warning as
 * `"<N> <description>"`. Returns the parsed N, or `fallback` when no matching
 * warning is present (the count was not surfaced as a string).
 */
function countFromWarnings(
    warnings: readonly string[],
    pattern: RegExp,
    fallback: number,
): number {
    for (const w of warnings) {
        if (pattern.test(w)) {
            const m = w.match(/^\s*(\d+)/);
            if (m) return parseInt(m[1], 10);
            return fallback;
        }
    }
    return fallback;
}

interface IntegrityRow {
    label: string;
    /** Displayed value (a count, or "yes"/"no" for watertight). */
    value: string;
    /** True → render the warning style (defect present). */
    warn: boolean;
}

export const ExportIntegrityPanel: React.FC<ExportIntegrityPanelProps> = ({
    validationSummary,
    className,
}) => {
    const rootClass = className ? `eip ${className}` : 'eip';

    if (!validationSummary) {
        return (
            <div className={rootClass}>
                <div className="eip-label">SURFACE INTEGRITY</div>
                <div className="eip-pending">Validation pending</div>
            </div>
        );
    }

    const { warnings, manifoldOk, triangleQualityOk } = validationSummary;

    // Each warning is only present when its count is > 0, so a fail flag with no
    // matching warning string still surfaces as ≥1 (placeholder 1).
    const nakedEdges = countFromWarnings(
        warnings,
        /boundary edge|naked/i,
        manifoldOk ? 0 : 1,
    );
    const nonManifold = countFromWarnings(
        warnings,
        /non-?manifold/i,
        manifoldOk ? 0 : 1,
    );
    const slivers = countFromWarnings(
        warnings,
        /sliver/i,
        triangleQualityOk ? 0 : 1,
    );
    const watertight = manifoldOk;

    const rows: IntegrityRow[] = [
        { label: 'Naked edges', value: String(nakedEdges), warn: nakedEdges > 0 },
        { label: 'Non-manifold', value: String(nonManifold), warn: nonManifold > 0 },
        { label: 'Watertight', value: watertight ? 'yes' : 'no', warn: !watertight },
        { label: 'Slivers', value: String(slivers), warn: slivers > 0 },
    ];

    return (
        <div className={rootClass}>
            <div className="eip-label">SURFACE INTEGRITY</div>
            <div className="eip-grid">
                {rows.map((row) => (
                    <div
                        key={row.label}
                        className={`eip-row${row.warn ? ' eip-row--warn' : ''}`}
                    >
                        <span className="eip-row__label">{row.label}</span>
                        <span className="eip-row__value">{row.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ExportIntegrityPanel;
