/**
 * ExportPanel Tests
 * Tests for the export UI and tier logic.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// Mock GPU/Adaptive/Parametric export hooks (component imports these directly)
vi.mock('../../hooks/useGPUExport', () => ({
    default: vi.fn(() => ({
        progress: { status: 'idle', progress: 0, message: '' },
        stats: null,
        isGPUAvailable: false,
        exportSTL: vi.fn(),
        generateMesh: vi.fn(),
        reset: vi.fn(),
    })),
}));

vi.mock('../../hooks/useAdaptiveExport', () => ({
    default: vi.fn(() => ({
        progress: { status: 'idle', progress: 0, message: '' },
        stats: null,
        isAvailable: false,
        exportSTL: vi.fn(),
        generateMesh: vi.fn(),
        reset: vi.fn(),
    })),
}));

vi.mock('../../hooks/useParametricExport', () => ({
    default: vi.fn(() => ({
        progress: { status: 'idle', progress: 0, message: '' },
        stats: null,
        isAvailable: false,
        exportSTL: vi.fn(),
        generateMesh: vi.fn(),
        reset: vi.fn(),
    })),
    fileSizeToTriangles: vi.fn(() => 100000),
}));

// Mock Zustand store
vi.mock('../../state', () => ({
    useAppStore: vi.fn((selector: (state: any) => any) => {
        const mockState = {
            mesh: { preview_n_theta: 100 },
            style: { name: 'SuperformulaBlossom', opts: {} },
            setMeshParam: vi.fn(),
        };
        return selector(mockState);
    }),
}));

// Mock stlExport for downloadMesh
vi.mock('../../geometry/stlExport', () => ({
    downloadMesh: vi.fn(),
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

vi.mock('./ExportDialog', () => ({
    default: () => null,
}));

describe('ExportPanel', () => {
    const mockExportActions = {
        progress: { status: 'idle', progress: 0, message: '' },
        stats: null,
        exportSTL: vi.fn(),
        generateMesh: vi.fn().mockResolvedValue({ vertices: new Float32Array(), indices: new Uint32Array() }),
        reset: vi.fn(),
    };

    const mockTierState = {
        checkExportAllowed: vi.fn().mockReturnValue({ canExport: true, exportsRemaining: 3 }),
        recordExport: vi.fn().mockResolvedValue(undefined),
        exportsThisMonth: 0,
    };

    // Save the original DEV value and force production mode for auth tests
    const originalDEV = import.meta.env.DEV;

    beforeEach(() => {
        vi.clearAllMocks();
        // Force production mode so auth guards are active
        import.meta.env.DEV = false;

        (useExport as any).mockReturnValue(mockExportActions);
        (useExportTier as any).mockReturnValue(mockTierState);
        (useIsPro as any).mockReturnValue(false); // Default to Free tier
        (useIsAuthenticated as any).mockReturnValue(true); // Default to Authenticated
    });

    afterEach(() => {
        // Restore original DEV value
        import.meta.env.DEV = originalDEV;
    });

    it('should show sign-in requirement when not authenticated', () => {
        (useIsAuthenticated as any).mockReturnValue(false);
        (useExportTier as any).mockReturnValue({ ...mockTierState, exportsThisMonth: 0 });

        render(<ExportPanel />);

        // Auth-required banner shown in production mode when not authenticated
        expect(screen.getByText(/Sign in required to export/i)).toBeInTheDocument();
    });

    it('should show open auth modal when clicking sign in', () => {
        (useIsAuthenticated as any).mockReturnValue(false);
        render(<ExportPanel />);

        // The "Sign In" button is in the auth-required banner (not the mocked Button component)
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

        // In non-dev + authenticated + canExport mode, the button shows "Download STL"
        const exportBtn = screen.getByText(/Download STL/i);
        fireEvent.click(exportBtn);

        await waitFor(() => {
            // The component calls generateMesh(), then downloadMesh() (from stlExport)
            expect(mockExportActions.generateMesh).toHaveBeenCalled();
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
