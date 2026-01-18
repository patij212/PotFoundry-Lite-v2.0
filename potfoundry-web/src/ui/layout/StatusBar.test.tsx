/**
 * StatusBar Component Tests
 * Tests for the StatusBar performance display.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBar } from './StatusBar';
import React from 'react';
import '@testing-library/jest-dom';

// Mock the performance hook
const mockUsePerformance = vi.fn();
vi.mock('../../state', () => ({
    usePerformance: () => mockUsePerformance(),
    useAppStore: (selector: any) => selector({
        performance: mockUsePerformance()
    })
}));

describe('StatusBar', () => {
    it('should render performance metrics', () => {
        mockUsePerformance.mockReturnValue({
            triangleCount: 1000,
            vertexCount: 500,
            generationTime: 16.5,
            volume: 250000,
        });

        render(<StatusBar />);

        // Check for formatted values
        expect(screen.getByText(/1,000 tris/)).toBeInTheDocument();
        expect(screen.getByText(/500 verts/)).toBeInTheDocument();
        expect(screen.getByText(/17 ms/)).toBeInTheDocument(); // 16.5 rounds to 17
    });

    it('should render zero values correctly', () => {
        mockUsePerformance.mockReturnValue({
            triangleCount: 0,
            vertexCount: 0,
            generationTime: 0,
            volume: 0,
        });

        render(<StatusBar />);
        expect(screen.getByText(/0 tris/)).toBeInTheDocument();
    });
});
