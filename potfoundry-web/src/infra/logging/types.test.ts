/**
 * Logging Types Tests
 * Tests for the logging type structure.
 */
import { describe, it, expect } from 'vitest';
import type { LogLevel, LogMessage, MessageManagerConfig, HeartbeatStats } from './types';

describe('LogLevel type', () => {
    it('should accept valid log levels', () => {
        const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
        expect(levels.length).toBe(5);
    });
});

describe('LogMessage structure', () => {
    it('should create valid log message', () => {
        const msg: LogMessage = {
            level: 'INFO',
            code: 'TEST',
            message: 'Test message',
            ts: Date.now(),
        };
        expect(msg.level).toBe('INFO');
        expect(msg.code).toBe('TEST');
        expect(msg.ts).toBeGreaterThan(0);
    });

    it('should support optional fields', () => {
        const msg: LogMessage = {
            level: 'DEBUG',
            code: 'TEST',
            message: 'Message with context',
            ts: Date.now(),
            context: { key: 'value' },
            signature: 'test-sig',
            repeat: 3,
        };
        expect(msg.context?.key).toBe('value');
        expect(msg.signature).toBe('test-sig');
        expect(msg.repeat).toBe(3);
    });
});

describe('MessageManagerConfig structure', () => {
    it('should create valid config', () => {
        const config: MessageManagerConfig = {
            heartbeatMs: 5000,
            bufferSize: 100,
            mode: 'smart',
        };
        expect(config.heartbeatMs).toBe(5000);
        expect(config.mode).toBe('smart');
    });
});

describe('HeartbeatStats structure', () => {
    it('should create valid heartbeat stats', () => {
        const stats: HeartbeatStats = {
            windowMs: 60000,
            counts: {
                DEBUG: 5,
                INFO: 10,
                WARN: 2,
                ERROR: 0,
                CRITICAL: 0,
            },
        };
        expect(stats.windowMs).toBe(60000);
        expect(stats.counts.INFO).toBe(10);
    });
});
