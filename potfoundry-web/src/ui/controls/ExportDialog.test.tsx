import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ExportDialog } from './ExportDialog';

function renderDialog(overrides?: Partial<React.ComponentProps<typeof ExportDialog>>) {
    const onExport = vi.fn();
    const onPreview = vi.fn();

    render(
        <ExportDialog
            isOpen={true}
            onClose={vi.fn()}
            onExport={onExport}
            onPreview={onPreview}
            isGenerating={false}
            generationPhase=""
            generationProgress={0}
            stats={null}
            validation={null}
            diagnostics={null}
            isAvailable={true}
            showChainOverlay={false}
            showPeakOverlay={false}
            onChainOverlayChange={vi.fn()}
            onPeakOverlayChange={vi.fn()}
            {...overrides}
        />,
    );

    return { onExport, onPreview };
}

describe('ExportDialog corridor flags', () => {
    it('shows corridor controls in the debug tab', () => {
        renderDialog();

        fireEvent.click(screen.getByRole('button', { name: 'Debug' }));

        expect(screen.getByText('Outer-wall corridor planning')).toBeInTheDocument();
        expect(screen.getByText('Corridor diagnostics')).toBeInTheDocument();
    });

    it('emits corridor flags in preview config and auto-enables planning for diagnostics', () => {
        const { onPreview } = renderDialog();

        fireEvent.click(screen.getByRole('button', { name: 'Debug' }));

        const planningRow = screen.getByText('Outer-wall corridor planning').closest('.ed-param-row');
        const diagnosticsRow = screen.getByText('Corridor diagnostics').closest('.ed-param-row');

        expect(planningRow).not.toBeNull();
        expect(diagnosticsRow).not.toBeNull();

        const planningSwitch = within(planningRow!).getByRole('switch');
        const diagnosticsSwitch = within(diagnosticsRow!).getByRole('switch');

        expect(planningSwitch).toBeDefined();
        expect(diagnosticsSwitch).toBeDefined();

        fireEvent.click(diagnosticsSwitch!);
        fireEvent.click(screen.getByRole('button', { name: 'Preview Stats' }));

        expect(onPreview).toHaveBeenCalledTimes(1);
        expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({
            featureFlags: expect.objectContaining({
                outerWallCorridorPlanning: true,
                outerWallCorridorDiagnostics: true,
            }),
        }));
    });
});