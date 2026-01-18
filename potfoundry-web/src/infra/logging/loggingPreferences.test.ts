/**
 * Logging Preferences Tests
 * Tests for the resolveLoggingPreferences function.
 */
import { describe, it, expect } from 'vitest';
import { resolveLoggingPreferences } from './loggingPreferences';

describe('resolveLoggingPreferences', () => {
    it('should return default preferences when no params provided', () => {
        const prefs = resolveLoggingPreferences();
        expect(prefs).toBeDefined();
        expect(prefs.mode).toBe('smart');
        expect(prefs.heartbeatMs).toBe(60000);
        expect(prefs.dedupeEveryN).toBe(0);
    });

    it('should return valid mode property', () => {
        const prefs = resolveLoggingPreferences();
        expect(['smart', 'verbose', 'errors-only']).toContain(prefs.mode);
    });

    it('should return positive heartbeat interval', () => {
        const prefs = resolveLoggingPreferences();
        expect(prefs.heartbeatMs).toBeGreaterThan(0);
    });

    it('should return non-negative dedupe value', () => {
        const prefs = resolveLoggingPreferences();
        expect(prefs.dedupeEveryN).toBeGreaterThanOrEqual(0);
    });

    it('should override mode from initial params', () => {
        const prefs = resolveLoggingPreferences({ __pf_log_mode: 'verbose' });
        expect(prefs.mode).toBe('verbose');
    });

    it('should override heartbeat from initial params', () => {
        const prefs = resolveLoggingPreferences({ __pf_log_heartbeat_ms: 30000 });
        expect(prefs.heartbeatMs).toBe(30000);
    });

    it('should handle errors-only mode alias', () => {
        const prefs = resolveLoggingPreferences({ __pf_log_mode: 'errors-only' });
        expect(prefs.mode).toBe('errors-only');
    });
});
