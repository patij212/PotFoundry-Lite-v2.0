/**
 * ErrorBoundary Component
 *
 * React error boundary for graceful error handling.
 * Catches JavaScript errors anywhere in the child component tree.
 *
 * @module ui/shared/ErrorBoundary
 */

import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react';
import { Button } from './Button';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Optional fallback UI renderer */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Name of the boundary for debugging */
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Default error fallback UI
 */
function DefaultErrorFallback({
  error,
  onReset,
  name,
}: {
  error: Error;
  onReset: () => void;
  name?: string;
}) {
  const isProduction = import.meta.env.PROD;

  return (
    <div className="error-boundary-fallback">
      <div className="error-boundary-icon">
        <AlertTriangle size={48} />
      </div>

      <h2 className="error-boundary-title">Something went wrong</h2>

      <p className="error-boundary-message">
        {name
          ? `An error occurred in the ${name} component.`
          : 'An unexpected error occurred in this component.'}
      </p>

      {!isProduction && (
        <details className="error-boundary-details">
          <summary className="error-boundary-summary">
            <Bug size={14} />
            Error Details
          </summary>
          <pre className="error-boundary-stack">
            <code>{error.message}</code>
            {error.stack && (
              <>
                {'\n\n'}
                {error.stack}
              </>
            )}
          </pre>
        </details>
      )}

      <div className="error-boundary-actions">
        <Button
          variant="primary"
          onClick={onReset}
        >
          <RefreshCw size={14} />
          Try Again
        </Button>

        <Button
          variant="secondary"
          onClick={() => window.location.reload()}
        >
          Reload Page
        </Button>
      </div>
    </div>
  );
}

/**
 * ErrorBoundary Class Component
 *
 * React error boundaries must be class components.
 * Catches errors in child components and displays fallback UI.
 *
 * ## Features
 * - Catches JavaScript errors in child tree
 * - Displays user-friendly error message
 * - Shows stack trace in development
 * - Provides retry functionality
 * - Optional error callback for logging
 *
 * ## Usage
 *
 * ```tsx
 * <ErrorBoundary name="Preview" onError={logError}>
 *   <WebGPUPreview />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error details
    console.error('[ErrorBoundary]', this.props.name ?? 'Unknown', error, errorInfo);

    // Store error info for display
    this.setState({ errorInfo });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback, name } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback(error, this.handleReset);
      }

      // Default fallback
      return <DefaultErrorFallback error={error} onReset={this.handleReset} name={name} />;
    }

    return children;
  }
}

/**
 * Lightweight error boundary for non-critical components
 * Shows a simple inline error message
 */
export function InlineErrorBoundary({
  children,
  fallbackMessage = 'Failed to load',
}: {
  children: ReactNode;
  fallbackMessage?: string;
}) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div className="inline-error-boundary">
          <span className="inline-error-message">
            <AlertTriangle size={12} />
            {fallbackMessage}
          </span>
          <button className="inline-error-retry" onClick={reset}>
            Retry
          </button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * HOC to wrap a component with an error boundary
 *
 * @param Component - Component to wrap
 * @param name - Name for the error boundary
 * @returns Wrapped component with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  name?: string
) {
  return function WrappedWithErrorBoundary(props: P) {
    return (
      <ErrorBoundary name={name ?? Component.displayName ?? Component.name}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
