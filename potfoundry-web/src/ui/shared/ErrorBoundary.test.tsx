/**
 * ErrorBoundary Component Tests
 * Tests for the ErrorBoundary and related components.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary, InlineErrorBoundary, withErrorBoundary } from './ErrorBoundary';

// Component that throws an error
function ThrowingComponent({ shouldThrow = true }: { shouldThrow?: boolean }) {
    if (shouldThrow) {
        throw new Error('Test error message');
    }
    return <div>Working component</div>;
}

// Suppress console.error for error boundary tests
const suppressConsoleError = () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
    return () => spy.mockRestore();
};

describe('ErrorBoundary', () => {
    it('should render children when no error', () => {
        render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={false} />
            </ErrorBoundary>
        );
        expect(screen.getByText('Working component')).toBeInTheDocument();
    });

    it('should catch error and display fallback', () => {
        const restore = suppressConsoleError();

        render(
            <ErrorBoundary>
                <ThrowingComponent />
            </ErrorBoundary>
        );

        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        restore();
    });

    it('should display component name when provided', () => {
        const restore = suppressConsoleError();

        render(
            <ErrorBoundary name="TestComponent">
                <ThrowingComponent />
            </ErrorBoundary>
        );

        expect(screen.getByText(/TestComponent/)).toBeInTheDocument();
        restore();
    });

    it('should call onError callback', () => {
        const restore = suppressConsoleError();
        const handleError = vi.fn();

        render(
            <ErrorBoundary onError={handleError}>
                <ThrowingComponent />
            </ErrorBoundary>
        );

        expect(handleError).toHaveBeenCalled();
        restore();
    });

    it('should show Try Again button', () => {
        const restore = suppressConsoleError();

        render(
            <ErrorBoundary>
                <ThrowingComponent />
            </ErrorBoundary>
        );

        expect(screen.getByText('Try Again')).toBeInTheDocument();
        restore();
    });

    it('should show Reload Page button', () => {
        const restore = suppressConsoleError();

        render(
            <ErrorBoundary>
                <ThrowingComponent />
            </ErrorBoundary>
        );

        expect(screen.getByText('Reload Page')).toBeInTheDocument();
        restore();
    });

    it('should use custom fallback when provided', () => {
        const restore = suppressConsoleError();

        render(
            <ErrorBoundary fallback={(error, reset) => <div>Custom fallback: {error.message}</div>}>
                <ThrowingComponent />
            </ErrorBoundary>
        );

        expect(screen.getByText(/Custom fallback/)).toBeInTheDocument();
        expect(screen.getByText(/Test error message/)).toBeInTheDocument();
        restore();
    });
});

describe('InlineErrorBoundary', () => {
    it('should render children when no error', () => {
        render(
            <InlineErrorBoundary>
                <ThrowingComponent shouldThrow={false} />
            </InlineErrorBoundary>
        );
        expect(screen.getByText('Working component')).toBeInTheDocument();
    });

    it('should show default fallback message on error', () => {
        const restore = suppressConsoleError();

        render(
            <InlineErrorBoundary>
                <ThrowingComponent />
            </InlineErrorBoundary>
        );

        expect(screen.getByText('Failed to load')).toBeInTheDocument();
        restore();
    });

    it('should show custom fallback message', () => {
        const restore = suppressConsoleError();

        render(
            <InlineErrorBoundary fallbackMessage="Custom failed">
                <ThrowingComponent />
            </InlineErrorBoundary>
        );

        expect(screen.getByText('Custom failed')).toBeInTheDocument();
        restore();
    });

    it('should show Retry button', () => {
        const restore = suppressConsoleError();

        render(
            <InlineErrorBoundary>
                <ThrowingComponent />
            </InlineErrorBoundary>
        );

        expect(screen.getByText('Retry')).toBeInTheDocument();
        restore();
    });
});

describe('withErrorBoundary', () => {
    it('should wrap component with error boundary', () => {
        const SafeComponent = withErrorBoundary(
            () => <div>Safe content</div>,
            'SafeComponent'
        );

        render(<SafeComponent />);
        expect(screen.getByText('Safe content')).toBeInTheDocument();
    });

    it('should catch error in wrapped component', () => {
        const restore = suppressConsoleError();

        const UnsafeComponent = withErrorBoundary(
            ThrowingComponent,
            'UnsafeComponent'
        );

        render(<UnsafeComponent />);
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        restore();
    });
});
