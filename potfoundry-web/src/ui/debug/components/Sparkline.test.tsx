/**
 * Sparkline Component Tests
 * Tests for the Sparkline SVG chart component.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sparkline, MetricCard } from './Sparkline';

describe('Sparkline', () => {
    it('should render SVG element', () => {
        const { container } = render(<Sparkline data={[1, 2, 3, 4, 5]} />);
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
    });

    it('should display "No data" when data is empty', () => {
        render(<Sparkline data={[]} />);
        expect(screen.getByText('No data')).toBeInTheDocument();
    });

    it('should respect width and height props', () => {
        const { container } = render(
            <Sparkline data={[1, 2, 3]} width={200} height={50} />
        );
        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('width', '200');
        expect(svg).toHaveAttribute('height', '50');
    });

    it('should render path element for data', () => {
        const { container } = render(<Sparkline data={[1, 2, 3, 4, 5]} />);
        const path = container.querySelector('path');
        expect(path).toBeInTheDocument();
    });

    it('should render circle for current value', () => {
        const { container } = render(<Sparkline data={[1, 2, 3, 4, 5]} />);
        const circle = container.querySelector('circle');
        expect(circle).toBeInTheDocument();
    });

    it('should apply custom color', () => {
        const { container } = render(
            <Sparkline data={[1, 2, 3]} color="#ff0000" />
        );
        const path = container.querySelector('path');
        expect(path).toHaveAttribute('stroke', '#ff0000');
    });

    it('should apply className', () => {
        const { container } = render(
            <Sparkline data={[1, 2, 3]} className="custom-class" />
        );
        const svg = container.querySelector('svg');
        expect(svg).toHaveClass('custom-class');
    });

    it('should handle single data point', () => {
        const { container } = render(<Sparkline data={[42]} />);
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
    });

    it('should render fill when fillColor provided', () => {
        const { container } = render(
            <Sparkline data={[1, 2, 3]} fillColor="#00ff00" />
        );
        const paths = container.querySelectorAll('path');
        expect(paths.length).toBe(2); // Line path + fill path
    });
});

describe('MetricCard', () => {
    it('should render label', () => {
        render(<MetricCard label="FPS" value={60} />);
        expect(screen.getByText('FPS')).toBeInTheDocument();
    });

    it('should render value', () => {
        render(<MetricCard label="FPS" value={60} />);
        expect(screen.getByText('60')).toBeInTheDocument();
    });

    it('should render unit when provided', () => {
        render(<MetricCard label="Memory" value={256} unit="MB" />);
        expect(screen.getByText('MB')).toBeInTheDocument();
    });

    it('should render string value', () => {
        render(<MetricCard label="Status" value="Active" />);
        expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should render up trend indicator', () => {
        render(<MetricCard label="FPS" value={60} trend="up" />);
        expect(screen.getByText('↑')).toBeInTheDocument();
    });

    it('should render down trend indicator', () => {
        render(<MetricCard label="FPS" value={30} trend="down" />);
        expect(screen.getByText('↓')).toBeInTheDocument();
    });

    it('should render stable trend indicator', () => {
        render(<MetricCard label="FPS" value={60} trend="stable" />);
        expect(screen.getByText('→')).toBeInTheDocument();
    });

    it('should render sparkline when data provided', () => {
        const { container } = render(
            <MetricCard label="FPS" value={60} data={[55, 58, 60, 62, 60]} />
        );
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
    });

    it('should not render sparkline with single data point', () => {
        const { container } = render(
            <MetricCard label="FPS" value={60} data={[60]} />
        );
        const svg = container.querySelector('svg');
        expect(svg).toBeNull();
    });
});
