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
            generationStatus="idle"
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
    it('caps user-facing export file size controls at 1 GiB', () => {
        renderDialog();

        const sliders = screen.getAllByRole('slider');
        const fileSizeSlider = sliders[0];

        expect(fileSizeSlider).toHaveAttribute('max', '1024');
        expect(screen.getByText('1 GB')).toBeInTheDocument();
        expect(screen.queryByText('2 GB')).not.toBeInTheDocument();
    });

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

    it('shows the conforming mesher toggle in the debug tab', () => {
        renderDialog();

        fireEvent.click(screen.getByRole('button', { name: 'Debug' }));

        expect(screen.getByText(/Conforming mesher/i)).toBeInTheDocument();
    });

    it('emits conformingMesher in preview config when its toggle is enabled', () => {
        const { onPreview } = renderDialog();

        fireEvent.click(screen.getByRole('button', { name: 'Debug' }));

        const conformingRow = screen.getByText(/Conforming mesher/i).closest('.ed-param-row');
        expect(conformingRow).not.toBeNull();

        const conformingSwitch = within(conformingRow!).getByRole('switch');
        expect(conformingSwitch).toHaveAttribute('aria-checked', 'false');

        fireEvent.click(conformingSwitch);
        fireEvent.click(screen.getByRole('button', { name: 'Preview Stats' }));

        expect(onPreview).toHaveBeenCalledTimes(1);
        expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({
            featureFlags: expect.objectContaining({
                conformingMesher: true,
            }),
        }));
    });

    it('emits explicit tolerance overrides from the export tab', () => {
        const { onPreview } = renderDialog();

        fireEvent.change(screen.getByRole('spinbutton', { name: 'Surface error tolerance' }), {
            target: { value: '0.0008' },
        });
        fireEvent.change(screen.getByRole('spinbutton', { name: 'Feature drift tolerance' }), {
            target: { value: '0.0006' },
        });
        fireEvent.change(screen.getByRole('spinbutton', { name: 'Normal error tolerance' }), {
            target: { value: '2.5' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Preview Stats' }));

        expect(onPreview).toHaveBeenCalledTimes(1);
        expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({
            toleranceOverrides: expect.objectContaining({
                epsPosMm: 0.0008,
                epsFeatureMm: 0.0006,
                epsNormalDeg: 2.5,
            }),
        }));
    });

    it('surfaces generation errors inside the dialog', () => {
        renderDialog({
            generationStatus: 'error',
            generationPhase: 'Parametric export failed: requested tolerance needs about 75,445,704 triangles',
        });

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Parametric export failed: requested tolerance needs about 75,445,704 triangles',
        );
    });
});
