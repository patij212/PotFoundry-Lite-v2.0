/**
 * Test Setup File for Vitest
 * This file runs before each test file to set up the testing environment.
 */
import '@testing-library/jest-dom';
import { setupWebGPUMock } from './webgpu-mock';

// Mock ResizeObserver (needed for Radix UI components)
global.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// Setup WebGPU mocks for all tests
setupWebGPUMock();

// Suppress console noise during tests (optional)
// Uncomment to reduce console output:
// vi.spyOn(console, 'log').mockImplementation(() => {});
// vi.spyOn(console, 'warn').mockImplementation(() => {});

