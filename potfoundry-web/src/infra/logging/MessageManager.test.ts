/**
 * MessageManager Tests
 * Tests for the logging message manager.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageManager } from './MessageManager';

describe('MessageManager', () => {
    let manager: MessageManager;

    beforeEach(() => {
        manager = new MessageManager();
    });

    afterEach(() => {
        manager.dispose();
    });

    it('should create instance', () => {
        expect(manager).toBeInstanceOf(MessageManager);
    });

    it('should set mode without error', () => {
        expect(() => manager.setMode('verbose')).not.toThrow();
        expect(() => manager.setMode('smart')).not.toThrow();
        expect(() => manager.setMode('errors-only')).not.toThrow();
    });

    it('should set heartbeat interval', () => {
        expect(() => manager.setHeartbeatMs(1000)).not.toThrow();
    });

    it('should set dedupe count', () => {
        expect(() => manager.setDedupeEveryN(5)).not.toThrow();
    });

    it('should dump recent messages as array', () => {
        const recent = manager.dumpRecent();
        expect(Array.isArray(recent)).toBe(true);
    });

    it('should reset window', () => {
        expect(() => manager.resetWindow()).not.toThrow();
    });

    it('should flush heartbeat', () => {
        const stats = manager.flushHeartbeat({ force: true });
        expect(stats).toBeDefined();
    });

    it('should set frame counters', () => {
        expect(() => manager.setFrameCounters({ frames: 60, draws: 120 })).not.toThrow();
    });

    it('should get UI stats', () => {
        const stats = manager.getUiStats();
        expect(stats).toBeDefined();
    });

    it('should dispose without error', () => {
        expect(() => manager.dispose()).not.toThrow();
    });

    it('should set console sink', () => {
        const sink = vi.fn();
        expect(() => manager.setConsoleSink(sink)).not.toThrow();
    });

    it('should get last heartbeat stats after flush', () => {
        manager.flushHeartbeat({ force: true });
        const stats = manager.getLastHeartbeatStats();
        expect(stats).toBeDefined();
    });
});
