/**
 * Test Utilities
 *
 * Common testing utilities and render helpers.
 */

import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';

/**
 * Custom render function that wraps components with necessary providers
 */
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, {
    // Add any providers here if needed
    ...options,
  });
}

// Re-export everything from testing-library
export * from '@testing-library/react';
export { customRender as render };

/**
 * Helper to wait for async state updates
 */
export function waitForStateUpdate(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a mock function with type inference
 */
export function createMockFn<T extends (...args: never[]) => unknown>(): jest.Mock<ReturnType<T>, Parameters<T>> {
  return vi.fn() as unknown as jest.Mock<ReturnType<T>, Parameters<T>>;
}
