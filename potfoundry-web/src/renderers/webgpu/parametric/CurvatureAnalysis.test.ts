import { describe, it, expect } from 'vitest';
import {
  computeRawCurvature,
  normalizeProfile,
  smoothProfile,
} from './CurvatureAnalysis';

describe('CurvatureAnalysis', () => {
  describe('computeRawCurvature', () => {
    it('returns zero for linear positions', () => {
      // 5 points along a straight line: (0,0,0), (1,0,0), (2,0,0), (3,0,0), (4,0,0)
      const positions = new Float32Array([0,0,0, 1,0,0, 2,0,0, 3,0,0, 4,0,0]);
      const result = computeRawCurvature(positions, 5);
      expect(result.length).toBe(5);
      for (let i = 1; i < 4; i++) {
        expect(result[i]).toBeCloseTo(0, 6);
      }
    });

    it('detects curvature on a circular arc', () => {
      // 5 points on a circle of radius 10 in XY plane
      const n = 5;
      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const angle = (i / (n - 1)) * Math.PI * 0.5; // quarter circle
        positions[i * 3] = 10 * Math.cos(angle);
        positions[i * 3 + 1] = 10 * Math.sin(angle);
        positions[i * 3 + 2] = 0;
      }
      const result = computeRawCurvature(positions, n);
      // Interior points should have non-zero curvature
      for (let i = 1; i < n - 1; i++) {
        expect(result[i]).toBeGreaterThan(0);
      }
    });

    it('copies boundary values from neighbors', () => {
      const positions = new Float32Array([0,0,0, 1,0,0, 2,1,0, 3,0,0, 4,0,0]);
      const result = computeRawCurvature(positions, 5);
      expect(result[0]).toBe(result[1]);
      expect(result[4]).toBe(result[3]);
    });
  });

  describe('normalizeProfile', () => {
    it('normalizes to [0, 1] using percentile scaling', () => {
      const input = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
        11, 12, 13, 14, 15, 16, 17, 18, 19]);
      const result = normalizeProfile(input);
      expect(result.length).toBe(20);
      // All values should be in [0, 1]
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBeGreaterThanOrEqual(0);
        expect(result[i]).toBeLessThanOrEqual(1);
      }
    });

    it('returns zeros for constant profile', () => {
      const input = new Float32Array([5, 5, 5, 5, 5]);
      const result = normalizeProfile(input);
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBe(0);
      }
    });
  });

  describe('smoothProfile', () => {
    it('preserves profile length', () => {
      const input = new Float32Array([1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
      const result = smoothProfile(input, 2);
      expect(result.length).toBe(input.length);
    });

    it('reduces variation for alternating profile', () => {
      const input = new Float32Array([1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
      const result = smoothProfile(input, 2);
      const inputRange = 1 - 0;
      const resultMin = Math.min(...Array.from(result));
      const resultMax = Math.max(...Array.from(result));
      expect(resultMax - resultMin).toBeLessThan(inputRange);
    });

    it('does not change constant profile', () => {
      const input = new Float32Array([3, 3, 3, 3, 3]);
      const result = smoothProfile(input, 2);
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBeCloseTo(3, 6);
      }
    });
  });
});
