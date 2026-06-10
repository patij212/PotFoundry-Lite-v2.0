/**
 * ExportIntegrityPanel Tests (Plan Task 4.1).
 *
 * The panel surfaces the surface-integrity invariants a 3D-print professional
 * cares about — naked edges, non-manifold edges, watertightness, slivers —
 * from the conforming export's `validationSummary` (the Task 2.2 shape produced
 * by `summarizeConformingValidation`). It is the in-app equivalent of Rhino's
 * `CheckMesh` / `ShowEdges`.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExportIntegrityPanel } from './ExportIntegrityPanel';
import type { ValidationSummary } from '../../renderers/webgpu/parametric/types';

/** A by-construction watertight conforming summary (all checks pass, no warnings). */
const CLEAN_SUMMARY: ValidationSummary = {
    valid: true,
    manifoldOk: true,
    degeneratesOk: true,
    normalsOk: true,
    triangleQualityOk: true,
    warnings: [],
    minAngleDeg: 42,
    maxAspectRatio: 1.7,
};

describe('ExportIntegrityPanel', () => {
    it('renders a clean summary as watertight with zero counts', () => {
        render(<ExportIntegrityPanel validationSummary={CLEAN_SUMMARY} />);

        expect(screen.getByText('Naked edges')).toBeInTheDocument();
        expect(screen.getByText('Non-manifold')).toBeInTheDocument();
        expect(screen.getByText('Slivers')).toBeInTheDocument();
        expect(screen.getByText('Watertight')).toBeInTheDocument();

        // All three counts read 0 and watertight reads "yes".
        expect(screen.getAllByText('0')).toHaveLength(3);
        expect(screen.getByText('yes')).toBeInTheDocument();
    });

    it('shows no warning rows for a clean summary', () => {
        const { container } = render(
            <ExportIntegrityPanel validationSummary={CLEAN_SUMMARY} />,
        );
        expect(container.querySelector('.eip-row--warn')).toBeNull();
    });

    it('surfaces a warning style and the naked-edge count when boundaryEdges > 0', () => {
        const defect: ValidationSummary = {
            valid: false,
            manifoldOk: false,
            degeneratesOk: true,
            normalsOk: true,
            triangleQualityOk: true,
            // The conforming validator embeds the count in the warning string.
            warnings: ['3 boundary edge(s) (naked / non-watertight)'],
            minAngleDeg: 40,
            maxAspectRatio: 2.1,
        };
        const { container } = render(
            <ExportIntegrityPanel validationSummary={defect} />,
        );

        // The naked-edge count parsed out of the warning string.
        expect(screen.getByText('3')).toBeInTheDocument();
        // Watertight flips to "no".
        expect(screen.getByText('no')).toBeInTheDocument();
        // At least one row is flagged with the warning style.
        expect(container.querySelector('.eip-row--warn')).not.toBeNull();
    });

    it('parses non-manifold and sliver counts from their warning strings', () => {
        const defect: ValidationSummary = {
            valid: false,
            manifoldOk: false,
            degeneratesOk: false,
            normalsOk: true,
            triangleQualityOk: false,
            warnings: [
                '2 non-manifold edge(s)',
                '5 sliver triangle(s) (aspect > 100 or degenerate)',
            ],
            minAngleDeg: 1,
            maxAspectRatio: 200,
        };
        render(<ExportIntegrityPanel validationSummary={defect} />);
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('renders a neutral pending state when validationSummary is undefined', () => {
        const { container } = render(
            <ExportIntegrityPanel validationSummary={undefined} />,
        );
        expect(screen.getByText(/validation pending/i)).toBeInTheDocument();
        // Pending must not look like a defect.
        expect(container.querySelector('.eip-row--warn')).toBeNull();
    });

    it('renders pending (does not crash) when validationSummary is null', () => {
        render(<ExportIntegrityPanel validationSummary={null} />);
        expect(screen.getByText(/validation pending/i)).toBeInTheDocument();
    });
});
