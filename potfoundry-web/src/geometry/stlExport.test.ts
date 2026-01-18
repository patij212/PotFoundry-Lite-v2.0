/**
 * STL Export Tests
 * Tests for STL file size estimation and formatting utilities.
 */
import { describe, it, expect } from 'vitest';
import {
    estimateSTLSize,
    formatFileSize,
} from './stlExport';

describe('estimateSTLSize', () => {
    it('should estimate binary size correctly', () => {
        // Binary: 80 header + 4 count + triangles * 50
        const size = estimateSTLSize(10, true);
        expect(size).toBe(80 + 4 + 10 * 50);
    });

    it('should estimate ASCII size larger than binary', () => {
        const binarySize = estimateSTLSize(100, true);
        const asciiSize = estimateSTLSize(100, false);
        expect(asciiSize).toBeGreaterThan(binarySize);
    });

    it('should handle zero triangles', () => {
        const size = estimateSTLSize(0, true);
        expect(size).toBe(84); // Just header + count
    });

    it('should scale linearly with triangle count (binary)', () => {
        const size1 = estimateSTLSize(100, true);
        const size2 = estimateSTLSize(200, true);
        expect(size2 - size1).toBe(100 * 50);
    });
});

describe('formatFileSize', () => {
    it('should format bytes', () => {
        expect(formatFileSize(500)).toContain('B');
    });

    it('should format kilobytes', () => {
        const result = formatFileSize(2048);
        expect(result).toContain('KB');
    });

    it('should format megabytes', () => {
        const result = formatFileSize(2 * 1024 * 1024);
        expect(result).toContain('MB');
    });

    it('should handle zero', () => {
        expect(formatFileSize(0)).toBeDefined();
    });

    it('should format large files', () => {
        const result = formatFileSize(1024 * 1024 * 1024);
        expect(result).toBeDefined();
    });
});
