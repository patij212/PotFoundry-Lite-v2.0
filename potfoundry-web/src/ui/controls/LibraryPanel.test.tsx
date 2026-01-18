/**
 * LibraryPanel Tests
 * Tests for the library browser component.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LibraryPanel } from './LibraryPanel';
import { useLibraryMaybe, useAuth } from '../../context';
import { useToastMaybe } from '../shared/Toast';
import '@testing-library/jest-dom';

// Mock dependencies
vi.mock('../../context', () => ({
    useLibraryMaybe: vi.fn(),
    useAuth: vi.fn(),
}));

vi.mock('../shared/Toast', () => ({
    useToastMaybe: vi.fn(),
}));

vi.mock('../shared/DesignThumbnail', () => ({
    DesignThumbnail: ({ design }: any) => <div data-testid="mock-thumbnail">{design.title}</div>
}));

vi.mock('../shared/Button', () => ({
    Button: ({ children, onClick, disabled, variant }: any) => (
        <button data-testid="mock-button" data-variant={variant} onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
    IconButton: ({ icon, onClick, title }: any) => (
        <button data-testid="mock-icon-button" onClick={onClick} title={title}>
            {icon}
        </button>
    ),
}));

describe('LibraryPanel', () => {
    const mockLibraryActions = {
        fetchDesigns: vi.fn(),
        setSearchQuery: vi.fn(),
        setStyleFilter: vi.fn(),
        setFilterMyDesigns: vi.fn(),
        publish: vi.fn(),
        clearPublishStatus: vi.fn(),
        loadDesign: vi.fn(),
        downloadSTL: vi.fn(),
        loadMore: vi.fn(),
    };

    const mockLibraryState = {
        ready: true,
        loading: false,
        error: null,
        designs: [],
        searchQuery: '',
        styleFilter: null,
        filterMyDesigns: false,
        hasMore: false,
        publishSuccess: null,
        publishError: null,
        publishing: false,
    };

    const mockToast = {
        addToast: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();

        (useLibraryMaybe as any).mockReturnValue({
            state: mockLibraryState,
            actions: mockLibraryActions,
        });

        (useAuth as any).mockReturnValue({
            state: { user: { id: 'test-user' } }, // Authenticated by default
        });

        (useToastMaybe as any).mockReturnValue(mockToast);
    });

    it('should show empty state when library not available', () => {
        (useLibraryMaybe as any).mockReturnValue(null);
        render(<LibraryPanel />);
        expect(screen.getByText(/Library not available/i)).toBeInTheDocument();
    });

    it('should fetch designs on mount', () => {
        render(<LibraryPanel />);
        expect(mockLibraryActions.fetchDesigns).toHaveBeenCalledWith(true);
    });

    it('should render designs', () => {
        const designs = [
            { id: 1, title: 'Pot A', style: 'HarmonicRipple' },
            { id: 2, title: 'Pot B', style: 'SpiralRidges' },
        ];

        const state = { ...mockLibraryState, designs };
        (useLibraryMaybe as any).mockReturnValue({
            state,
            actions: mockLibraryActions,
        });

        render(<LibraryPanel />);

        // Use getAllByText because title appears in thumbnail AND card info
        expect(screen.getAllByText('Pot A')).toHaveLength(2);
        expect(screen.getAllByText('Pot B')).toHaveLength(2);
        expect(screen.getAllByTestId('mock-thumbnail')).toHaveLength(2);
    });

    it('should handle search input', () => {
        render(<LibraryPanel />);

        const searchInput = screen.getByPlaceholderText(/Search designs/i);
        fireEvent.change(searchInput, { target: { value: 'cool pot' } });

        expect(mockLibraryActions.setSearchQuery).toHaveBeenCalledWith('cool pot');
    });

    it('should handle style filter', () => {
        render(<LibraryPanel />);

        const filter = screen.getByRole('combobox');
        fireEvent.change(filter, { target: { value: 'HarmonicRipple' } });

        expect(mockLibraryActions.setStyleFilter).toHaveBeenCalledWith('HarmonicRipple');
    });

    it('should toggle my designs filter', () => {
        render(<LibraryPanel />);

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);

        expect(mockLibraryActions.setFilterMyDesigns).toHaveBeenCalledWith(true);
    });

    it('should show publish modal when clicking publish', () => {
        render(<LibraryPanel />);

        const publishBtn = screen.getByText('Publish Your Design');
        fireEvent.click(publishBtn);

        expect(screen.getByPlaceholderText(/Design title/i)).toBeInTheDocument();
    });

    it('should handle publishing', () => {
        render(<LibraryPanel />);

        // Open modal
        fireEvent.click(screen.getByText('Publish Your Design'));

        // Fill form
        fireEvent.change(screen.getByPlaceholderText(/Design title/i), { target: { value: 'My Awesome Pot' } });
        fireEvent.change(screen.getByPlaceholderText(/Tags/i), { target: { value: 'vase, modern' } });

        // Submit
        fireEvent.click(screen.getByText('Publish')); // Use exact text match for button

        expect(mockLibraryActions.publish).toHaveBeenCalledWith('My Awesome Pot', ['vase', 'modern'], 'CC BY-NC 4.0');
    });

    it('should show success toast after publishing', () => {
        // First render with success state
        (useLibraryMaybe as any).mockReturnValue({
            state: { ...mockLibraryState, publishSuccess: true },
            actions: mockLibraryActions,
        });

        render(<LibraryPanel />);

        expect(mockToast.addToast).toHaveBeenCalledWith('success', expect.stringContaining('published'));
        expect(mockLibraryActions.clearPublishStatus).toHaveBeenCalled();
    });

    it('should handle load design confirmation', () => {
        const designs = [{ id: 1, title: 'Pot A', style: 'HarmonicRipple' }];
        (useLibraryMaybe as any).mockReturnValue({
            state: { ...mockLibraryState, designs },
            actions: mockLibraryActions,
        });

        render(<LibraryPanel />);

        // Click load icon (mocked as button)
        const loadButtons = screen.getAllByTitle('Load into editor');
        fireEvent.click(loadButtons[0]);

        // Confirm dialog should appear
        expect(screen.getByText(/Load "Pot A"/i)).toBeInTheDocument();

        // Click confirm load
        fireEvent.click(screen.getByText('Load'));

        expect(mockLibraryActions.loadDesign).toHaveBeenCalledWith(designs[0]);
    });
});
