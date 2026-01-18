/**
 * Toast Component Tests
 * Tests for the Toast notification system.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast, useToastMaybe } from './Toast';

// Test component to access toast context
function ToastTester() {
    const toast = useToast();
    return (
        <div>
            <button onClick={() => toast.success('Success!')}>Show Success</button>
            <button onClick={() => toast.error('Error!')}>Show Error</button>
            <button onClick={() => toast.warning('Warning!')}>Show Warning</button>
            <button onClick={() => toast.info('Info!')}>Show Info</button>
            <span data-testid="toast-count">{toast.toasts.length}</span>
        </div>
    );
}

function MaybeTester() {
    const toast = useToastMaybe();
    return <span data-testid="has-toast">{toast ? 'yes' : 'no'}</span>;
}

describe('ToastProvider', () => {
    it('should render children', () => {
        render(
            <ToastProvider>
                <p>App content</p>
            </ToastProvider>
        );
        expect(screen.getByText('App content')).toBeInTheDocument();
    });

    it('should provide toast context', () => {
        render(
            <ToastProvider>
                <ToastTester />
            </ToastProvider>
        );
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
    });
});

describe('useToast', () => {
    it('should throw error when used outside provider', () => {
        // Suppress console.error for this test
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        expect(() => render(<ToastTester />)).toThrow('useToast must be used within a ToastProvider');

        consoleSpy.mockRestore();
    });

    it('should add success toast', () => {
        render(
            <ToastProvider>
                <ToastTester />
            </ToastProvider>
        );

        fireEvent.click(screen.getByText('Show Success'));
        expect(screen.getByText('Success!')).toBeInTheDocument();
    });

    it('should add error toast', () => {
        render(
            <ToastProvider>
                <ToastTester />
            </ToastProvider>
        );

        fireEvent.click(screen.getByText('Show Error'));
        expect(screen.getByText('Error!')).toBeInTheDocument();
    });

    it('should add warning toast', () => {
        render(
            <ToastProvider>
                <ToastTester />
            </ToastProvider>
        );

        fireEvent.click(screen.getByText('Show Warning'));
        expect(screen.getByText('Warning!')).toBeInTheDocument();
    });

    it('should add info toast', () => {
        render(
            <ToastProvider>
                <ToastTester />
            </ToastProvider>
        );

        fireEvent.click(screen.getByText('Show Info'));
        expect(screen.getByText('Info!')).toBeInTheDocument();
    });
});

describe('useToastMaybe', () => {
    it('should return null outside provider', () => {
        render(<MaybeTester />);
        expect(screen.getByTestId('has-toast')).toHaveTextContent('no');
    });

    it('should return context inside provider', () => {
        render(
            <ToastProvider>
                <MaybeTester />
            </ToastProvider>
        );
        expect(screen.getByTestId('has-toast')).toHaveTextContent('yes');
    });
});

describe('Toast UI', () => {
    it('should have role="alert"', () => {
        render(
            <ToastProvider>
                <ToastTester />
            </ToastProvider>
        );

        fireEvent.click(screen.getByText('Show Success'));
        expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('should have close button', () => {
        render(
            <ToastProvider>
                <ToastTester />
            </ToastProvider>
        );

        fireEvent.click(screen.getByText('Show Success'));
        expect(screen.getByLabelText('Dismiss notification')).toBeInTheDocument();
    });

    it('should remove toast when close button clicked', () => {
        render(
            <ToastProvider>
                <ToastTester />
            </ToastProvider>
        );

        fireEvent.click(screen.getByText('Show Success'));
        expect(screen.getByText('Success!')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Dismiss notification'));
        expect(screen.queryByText('Success!')).not.toBeInTheDocument();
    });
});
