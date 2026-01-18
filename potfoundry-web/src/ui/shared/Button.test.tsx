/**
 * Button Component Tests
 * Tests for the Button and IconButton components.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button, IconButton } from './Button';

describe('Button', () => {
    it('should render with children', () => {
        render(<Button>Click me</Button>);
        expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('should call onClick when clicked', () => {
        const handleClick = vi.fn();
        render(<Button onClick={handleClick}>Click</Button>);
        fireEvent.click(screen.getByRole('button'));
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should be disabled when disabled prop is true', () => {
        render(<Button disabled>Disabled</Button>);
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should be disabled when loading', () => {
        render(<Button loading>Loading</Button>);
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should apply primary variant class by default', () => {
        const { container } = render(<Button>Primary</Button>);
        expect(container.querySelector('.pf-button--primary')).toBeInTheDocument();
    });

    it('should apply secondary variant class', () => {
        const { container } = render(<Button variant="secondary">Secondary</Button>);
        expect(container.querySelector('.pf-button--secondary')).toBeInTheDocument();
    });

    it('should apply ghost variant class', () => {
        const { container } = render(<Button variant="ghost">Ghost</Button>);
        expect(container.querySelector('.pf-button--ghost')).toBeInTheDocument();
    });

    it('should apply danger variant class', () => {
        const { container } = render(<Button variant="danger">Danger</Button>);
        expect(container.querySelector('.pf-button--danger')).toBeInTheDocument();
    });

    it('should apply sm size class', () => {
        const { container } = render(<Button size="sm">Small</Button>);
        expect(container.querySelector('.pf-button--sm')).toBeInTheDocument();
    });

    it('should apply lg size class', () => {
        const { container } = render(<Button size="lg">Large</Button>);
        expect(container.querySelector('.pf-button--lg')).toBeInTheDocument();
    });

    it('should apply full-width class', () => {
        const { container } = render(<Button fullWidth>Full Width</Button>);
        expect(container.querySelector('.pf-button--full-width')).toBeInTheDocument();
    });

    it('should render left icon', () => {
        const { container } = render(
            <Button iconLeft={<span data-testid="left-icon">🔥</span>}>With Icon</Button>
        );
        expect(screen.getByTestId('left-icon')).toBeInTheDocument();
    });

    it('should render right icon', () => {
        const { container } = render(
            <Button iconRight={<span data-testid="right-icon">→</span>}>With Icon</Button>
        );
        expect(screen.getByTestId('right-icon')).toBeInTheDocument();
    });

    it('should have loading class when loading', () => {
        const { container } = render(<Button loading>Loading</Button>);
        expect(container.querySelector('.pf-button--loading')).toBeInTheDocument();
    });

    it('should show spinner when loading', () => {
        const { container } = render(<Button loading>Loading</Button>);
        expect(container.querySelector('.pf-button__spinner')).toBeInTheDocument();
    });

    it('should not show left icon when loading', () => {
        render(
            <Button loading iconLeft={<span data-testid="left-icon">🔥</span>}>
                Loading
            </Button>
        );
        expect(screen.queryByTestId('left-icon')).not.toBeInTheDocument();
    });
});

describe('IconButton', () => {
    it('should render with icon', () => {
        render(
            <IconButton icon={<span data-testid="icon">★</span>} aria-label="Star" />
        );
        expect(screen.getByTestId('icon')).toBeInTheDocument();
    });

    it('should have aria-label', () => {
        render(
            <IconButton icon={<span>★</span>} aria-label="Star button" />
        );
        expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Star button');
    });

    it('should call onClick when clicked', () => {
        const handleClick = vi.fn();
        render(
            <IconButton icon={<span>★</span>} aria-label="Star" onClick={handleClick} />
        );
        fireEvent.click(screen.getByRole('button'));
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should apply ghost variant by default', () => {
        const { container } = render(
            <IconButton icon={<span>★</span>} aria-label="Star" />
        );
        expect(container.querySelector('.pf-icon-button--ghost')).toBeInTheDocument();
    });

    it('should apply custom variant', () => {
        const { container } = render(
            <IconButton icon={<span>★</span>} aria-label="Star" variant="primary" />
        );
        expect(container.querySelector('.pf-icon-button--primary')).toBeInTheDocument();
    });
});
