/**
 * MeshControls Tests
 * Tests for the mesh quality controls.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MeshControls } from './MeshControls';
import '@testing-library/jest-dom';

// Mock state hooks
const mockUseMesh = vi.fn();
const mockUseMeshActions = vi.fn();

vi.mock('../../state', () => ({
    useMesh: () => mockUseMesh(),
    useMeshActions: () => mockUseMeshActions(),
    QUALITY_PRESETS: {
        draft: { preview_n_theta: 256, preview_n_z: 128, export_n_theta: 512, export_n_z: 256 },
        standard: { preview_n_theta: 512, preview_n_z: 256, export_n_theta: 1024, export_n_z: 512 },
    },
    MESH_QUALITY_BOUNDS: {
        preview_n_theta: { min: 1, max: 2000, step: 1 },
        preview_n_z: { min: 1, max: 2000, step: 1 },
        export_n_theta: { min: 1, max: 2000, step: 1 },
        export_n_z: { min: 1, max: 2000, step: 1 },
        seamAngle: { min: 0, max: 360, step: 1 },
    },
}));

// Mock child components to simplify testing
vi.mock('../shared/Select', () => ({
    Select: ({ label, value, onChange, options }: any) => (
        <div data-testid="mock-select" data-label={label} data-value={value}>
            <select onChange={e => onChange(e.target.value)}>
                {options.map((o: any) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
        </div>
    )
}));

vi.mock('../shared/Slider', () => ({
    Slider: ({ label, value, onChange, min, max, step }: any) => (
        <div data-testid="mock-slider" data-label={label} data-value={value}>
            <input
                type="range"
                role="slider"
                aria-label={label}
                value={value || 0}
                min={min}
                max={max}
                step={step}
                onChange={e => {
                    const val = Number(e.target.value);
                    console.log(`Slider ${label} onChange called with ${val}`);
                    onChange(val);
                }}
            />
        </div>
    )
}));

vi.mock('../shared/Section', () => ({
    Section: ({ children, title }: any) => <div data-testid="mock-section" title={title}>{children}</div>,
    SectionGroup: ({ children, label }: any) => <div data-testid="mock-group" title={label}>{children}</div>
}));

describe('MeshControls', () => {
    const mockSetMeshParam = vi.fn((...args) => console.log('mockSetMeshParam called with:', args));
    const mockSetQualityPreset = vi.fn((...args) => console.log('mockSetQualityPreset called with:', args));
    const mockEstimateTriangles = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseMeshActions.mockReturnValue({
            setMeshParam: mockSetMeshParam,
            setQualityPreset: mockSetQualityPreset,
            estimateTriangles: mockEstimateTriangles,
        });
        mockEstimateTriangles.mockReturnValue(5000);
    });

    it('should render correct preset', () => {
        mockUseMesh.mockReturnValue({
            preview_n_theta: 256,
            preview_n_z: 128,
            export_n_theta: 512,
            export_n_z: 256,
        });

        render(<MeshControls />);

        const select = screen.getByTestId('mock-select');
        expect(select).toHaveAttribute('data-value', 'draft');
    });

    it('should detect custom preset', () => {
        mockUseMesh.mockReturnValue({
            preview_n_theta: 111, // Custom value
            preview_n_z: 128,
            export_n_theta: 512,
            export_n_z: 256,
        });

        render(<MeshControls />);

        const select = screen.getByTestId('mock-select');
        expect(select).toHaveAttribute('data-value', 'custom');
    });

    it('should handle preset change', () => {
        mockUseMesh.mockReturnValue({ preview_n_theta: 256 }); // valid mesh state
        render(<MeshControls />);

        const select = screen.getByRole('combobox');
        fireEvent.change(select, { target: { value: 'standard' } });

        expect(mockSetQualityPreset).toHaveBeenCalledWith('standard');
    });

    it('should handle manual slider changes', () => {
        // Mock state for manual handling (custom preset)
        mockUseMesh.mockReturnValue({});

        render(<MeshControls />);

        // Find the theta slider container
        const sliders = screen.getAllByTestId('mock-slider');
        const thetaSlider = sliders.find(s => s.getAttribute('data-label') === 'θ segments');
        expect(thetaSlider).toBeInTheDocument();

        const input = thetaSlider?.querySelector('input');
        expect(input).toBeInTheDocument();

        if (input) {
            // fireEvent.change works well for sliders
            fireEvent.change(input, { target: { value: '300' } });

            // Check if mock store action was called
            expect(mockSetMeshParam).toHaveBeenCalledWith('preview_n_theta', 300);
        }
    });

    it('should display triangle count estimate', () => {
        mockUseMesh.mockReturnValue({});
        mockEstimateTriangles.mockReturnValue(12345);

        render(<MeshControls />);

        expect(screen.getByText(/12,345/)).toBeInTheDocument();
    });
});
