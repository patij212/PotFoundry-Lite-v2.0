/**
 * ExportPanel Tests
 * Tests for the export UI and tier logic.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportPanel } from './ExportPanel';
import { useExport, useExportTier } from '../../hooks';
import { useIsPro, useIsAuthenticated } from '../../context/AuthContext';
import '@testing-library/jest-dom';

// Mock dependencies
vi.mock('../../hooks', () => ({
    useExport: vi.fn(),
    useExportTier: vi.fn(),
    FREE_TIER_MONTHLY_LIMIT: 3,
}));

vi.mock('../../context/AuthContext', () => ({
    useIsPro: vi.fn(),
    useIsAuthenticated: vi.fn(),
}));

// Mock child components
vi.mock('../pricing', () => ({
    PricingModal: ({ open }: any) => open ? <div data-testid="pricing-modal">Pricing Modal</div> : null
}));

vi.mock('../auth', () => ({
    AuthModal: ({ open }: any) => open ? <div data-testid="auth-modal">Auth Modal</div> : null
}));

vi.mock('../shared/Section', () => ({
    Section: ({ children, title }: any) => <div data-testid="section" title={title}>{children}</div>
}));

vi.mock('../shared/Button', () => ({
    Button: ({ children, onClick, disabled, className }: any) => (
        <button
            data-testid="mock-button"
            onClick={onClick}
            disabled={disabled}
            className={className}
        >
            {children}
        </button>
    )
}));

describe('ExportPanel', () => {
    const mockExportActions = {
        progress: { status: 'idle', progress: 0, message: '' },
        stats: null,
        exportSTL: vi.fn(),
        generateMesh: vi.fn(),
        reset: vi.fn(),
    };

    const mockTierState = {
        checkExportAllowed: vi.fn().mockReturnValue({ canExport: true, exportsRemaining: 3 }),
        recordExport: vi.fn(),
        exportsThisMonth: 0,
    };

    beforeEach(() => {
        vi.clearAllMocks();

        (useExport as any).mockReturnValue(mockExportActions);
        (useExportTier as any).mockReturnValue(mockTierState);
        (useIsPro as any).mockReturnValue(false); // Default to Free tier
        (useIsAuthenticated as any).mockReturnValue(true); // Default to Authenticated
    });

    it('should show sign-in requirement when not authenticated', () => {
        (useIsAuthenticated as any).mockReturnValue(false);
        (useExportTier as any).mockReturnValue({ ...mockTierState, exportsThisMonth: 0 }); // Should be ignored if not auth

        render(<ExportPanel />);

        expect(screen.getByText(/Sign in required to export/i)).toBeInTheDocument();
        expect(screen.getByText(/Sign In to Export/i)).toBeInTheDocument();
    });

    it('should show open auth modal when clicking sign in', () => {
        (useIsAuthenticated as any).mockReturnValue(false);
        render(<ExportPanel />);

        const signInBtn = screen.getByText('Sign In');
        fireEvent.click(signInBtn);

        expect(screen.getByTestId('auth-modal')).toBeInTheDocument();
    });

    it('should show free tier status when authenticated but not pro', () => {
        render(<ExportPanel />);

        expect(screen.getByText(/exports used/i)).toBeInTheDocument();
        expect(screen.queryByText(/Pro/i)).not.toBeInTheDocument();
    });

    it('should show pro status when pro', () => {
        (useIsPro as any).mockReturnValue(true);
        render(<ExportPanel />);

        expect(screen.getByText(/Pro/i)).toBeInTheDocument();
        expect(screen.queryByText(/exports used/i)).not.toBeInTheDocument();
    });

    it('should handle export click when allowed', async () => {
        render(<ExportPanel />);

        const exportBtn = screen.getByText('Download STL');
        fireEvent.click(exportBtn);

        await waitFor(() => {
            expect(mockExportActions.exportSTL).toHaveBeenCalledWith('pot.stl');
            expect(mockTierState.recordExport).toHaveBeenCalled();
        });
    });

    it('should show pricing modal if limit reached', () => {
        (useExportTier as any).mockReturnValue({
            ...mockTierState,
            checkExportAllowed: vi.fn().mockReturnValue({ canExport: false, totalExports: 3 }),
        });

        render(<ExportPanel />);

        // Button should indicate limit reached
        const lockedBtn = screen.queryByText('Export Limit Reached');
        expect(lockedBtn).toBeInTheDocument();

        if (lockedBtn) {
            fireEvent.click(lockedBtn);
            expect(screen.getByTestId('pricing-modal')).toBeInTheDocument();
        }
    });

    it('should display mesh statistics', () => {
        (useExport as any).mockReturnValue({
            ...mockExportActions,
            stats: {
                triangleCount: 5000,
                vertexCount: 2500,
                fileSize: '1.2 MB',
                generationTimeMs: 150,
                volumeMl: 500,
                volumeMm3: 500000,
                surfaceAreaMm2: 20000,
            }
        });

        render(<ExportPanel />);

        expect(screen.getByText('5,000')).toBeInTheDocument(); // Triangles
        expect(screen.getByText('1.2 MB')).toBeInTheDocument(); // Size
        expect(screen.getByText('500.0 mL (500 cm³)')).toBeInTheDocument(); // Volume
    });

    it('should show progress bar during generation', () => {
        (useExport as any).mockReturnValue({
            ...mockExportActions,
            progress: { status: 'generating', progress: 50, message: 'Meshing...' }
        });

        render(<ExportPanel />);

        expect(screen.getByText('Meshing...')).toBeInTheDocument();
        expect(screen.getByText('Generating...')).toBeInTheDocument(); // Button text
    });
});
