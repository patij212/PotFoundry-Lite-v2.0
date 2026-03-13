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

// Mock canvas getContext for JSDOM (which doesn't support canvas 2D rendering)
const mockContext = {
    canvas: null as HTMLCanvasElement | null,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    globalAlpha: 1,
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    setTransform: () => {},
    getTransform: () => new DOMMatrix(),
} as unknown as CanvasRenderingContext2D;

const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function <T extends '2d' | 'webgl' | 'webgl2' | 'bitmaprenderer'>(
    contextId: T,
    options?: CanvasRenderingContext2DSettings
): RenderingContext | null {
    if (contextId === '2d') {
        mockContext.canvas = this;
        return mockContext;
    }
    return originalGetContext.call(this, contextId, options);
} as typeof HTMLCanvasElement.prototype.getContext;

// Setup WebGPU mocks for all tests
setupWebGPUMock();

// Suppress console noise during tests (optional)
// Uncomment to reduce console output:
// vi.spyOn(console, 'log').mockImplementation(() => {});
// vi.spyOn(console, 'warn').mockImplementation(() => {});

