/**
 * WebGPU Device Loss Tests
 * Unit tests for the device loss handling logic in webgpu_core.ts.
 * Focuses on 'handleDeviceLost' to ensure graceful recovery and error reporting.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleDeviceLost } from '../webgpu_core';

// Mock MessageManager
vi.mock('../infra/logging/MessageManager', () => ({
    default: {
        send: vi.fn(),
        log: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        critical: vi.fn(),
        setMode: vi.fn(),
        setHeartbeatMs: vi.fn(),
        setDedupeEveryN: vi.fn(),
    }
}));

describe('WebGPU Device Loss Handling', () => {
    let mockEmit: ReturnType<typeof vi.fn>;
    let mockSetDeviceLostDuringInit: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockEmit = vi.fn();
        mockSetDeviceLostDuringInit = vi.fn();
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should emit device-lost event when initialized', () => {
        const info = {
            message: 'Driver crashed',
            reason: 'unknown'
        } as GPUDeviceLostInfo;

        handleDeviceLost(info, {
            getInitializationComplete: () => true,
            setDeviceLostDuringInit: mockSetDeviceLostDuringInit,
            lastOperation: 'render_frame',
            emit: mockEmit
        });

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[CRITICAL] WGPU_DEVICE_LOST'));
        expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({
            type: 'device-lost',
            reason: 'Driver crashed'
        }));
        expect(mockSetDeviceLostDuringInit).not.toHaveBeenCalled();
    });

    it('should mark device lost during init if not initialized', () => {
        const info = {
            message: 'Initialization failed',
            reason: 'unknown'
        } as GPUDeviceLostInfo;

        handleDeviceLost(info, {
            getInitializationComplete: () => false, // Not initialized yet
            setDeviceLostDuringInit: mockSetDeviceLostDuringInit,
            lastOperation: 'init_device',
            emit: mockEmit
        });

        expect(mockSetDeviceLostDuringInit).toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled(); // Should not emit to app if init fails, app handles mount result
    });

    it('should ignore intentional destruction', () => {
        const info = {
            message: 'Destroyed',
            reason: 'destroyed'
        } as GPUDeviceLostInfo;

        handleDeviceLost(info, {
            getInitializationComplete: () => true,
            setDeviceLostDuringInit: mockSetDeviceLostDuringInit,
            lastOperation: 'cleanup',
            emit: mockEmit
        });

        expect(console.error).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();
        expect(mockSetDeviceLostDuringInit).not.toHaveBeenCalled();
    });

    it('should handle missing emit callback gracefully', () => {
        const info = {
            message: 'Crash',
            reason: 'unknown'
        } as GPUDeviceLostInfo;

        // No emit passed
        handleDeviceLost(info, {
            getInitializationComplete: () => true,
            setDeviceLostDuringInit: mockSetDeviceLostDuringInit,
            lastOperation: 'render',
            emit: undefined
        });

        expect(console.error).toHaveBeenCalled();
        // Should not throw
    });
});
