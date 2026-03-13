import { describe, it, expect } from 'vitest';
import {
  ZOOM_CLAMP_MIN,
  ZOOM_CLAMP_MAX,
  wrapAngle,
  wrapTau,
  clampZoomValue,
  mulMat4Vec4Full,
} from './MathHelpers';

describe('MathHelpers', () => {
  describe('Zoom Constants', () => {
    it('should have correct ZOOM_CLAMP_MIN', () => {
      expect(ZOOM_CLAMP_MIN).toBe(0.25);
    });

    it('should have correct ZOOM_CLAMP_MAX', () => {
      expect(ZOOM_CLAMP_MAX).toBe(4.0);
    });
  });

  describe('wrapAngle', () => {
    it('should return 0 for 0', () => {
      expect(wrapAngle(0)).toBe(0);
    });

    it('should return value in (-π, π] for value > π', () => {
      const result = wrapAngle(Math.PI + 0.5);
      expect(result).toBeCloseTo(-Math.PI + 0.5, 10);
    });

    it('should return value in (-π, π] for value < -π', () => {
      const result = wrapAngle(-Math.PI - 0.5);
      expect(result).toBeCloseTo(Math.PI - 0.5, 10);
    });

    it('should handle multiple rotations', () => {
      const result = wrapAngle(5 * Math.PI);
      expect(result).toBeCloseTo(Math.PI, 10);
    });

    it('should preserve values already in range', () => {
      expect(wrapAngle(0.5)).toBe(0.5);
      expect(wrapAngle(-0.5)).toBe(-0.5);
    });
  });

  describe('wrapTau', () => {
    it('should return 0 for 0', () => {
      expect(wrapTau(0)).toBe(0);
    });

    it('should return value in (-π, π] for value > π', () => {
      const result = wrapTau(Math.PI + 0.5);
      expect(result).toBeCloseTo(-Math.PI + 0.5, 10);
    });

    it('should return value in (-π, π] for value < -π', () => {
      const result = wrapTau(-Math.PI - 0.5);
      expect(result).toBeCloseTo(Math.PI - 0.5, 10);
    });

    it('should handle large values efficiently', () => {
      const result = wrapTau(100 * Math.PI);
      expect(Math.abs(result)).toBeLessThanOrEqual(Math.PI);
    });
  });

  describe('clampZoomValue', () => {
    it('should return 1.0 for non-finite values', () => {
      expect(clampZoomValue(NaN)).toBe(1.0);
      expect(clampZoomValue(Infinity)).toBe(1.0);
      expect(clampZoomValue(-Infinity)).toBe(1.0);
    });

    it('should clamp to ZOOM_CLAMP_MIN for small values', () => {
      expect(clampZoomValue(0.1)).toBe(ZOOM_CLAMP_MIN);
      expect(clampZoomValue(0)).toBe(ZOOM_CLAMP_MIN);
      expect(clampZoomValue(-1)).toBe(ZOOM_CLAMP_MIN);
    });

    it('should clamp to ZOOM_CLAMP_MAX for large values', () => {
      expect(clampZoomValue(5)).toBe(ZOOM_CLAMP_MAX);
      expect(clampZoomValue(100)).toBe(ZOOM_CLAMP_MAX);
    });

    it('should preserve values in valid range', () => {
      expect(clampZoomValue(1.0)).toBe(1.0);
      expect(clampZoomValue(2.5)).toBe(2.5);
      expect(clampZoomValue(ZOOM_CLAMP_MIN)).toBe(ZOOM_CLAMP_MIN);
      expect(clampZoomValue(ZOOM_CLAMP_MAX)).toBe(ZOOM_CLAMP_MAX);
    });
  });

  describe('mulMat4Vec4Full', () => {
    it('should multiply identity matrix correctly', () => {
      const identity = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]);
      const result = mulMat4Vec4Full(identity, 1, 2, 3);
      expect(result.x).toBe(1);
      expect(result.y).toBe(2);
      expect(result.z).toBe(3);
      expect(result.w).toBe(1);
    });

    it('should apply translation correctly', () => {
      // Translation matrix: translate by (10, 20, 30)
      const translation = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        10, 20, 30, 1,
      ]);
      const result = mulMat4Vec4Full(translation, 1, 2, 3);
      expect(result.x).toBe(11);
      expect(result.y).toBe(22);
      expect(result.z).toBe(33);
      expect(result.w).toBe(1);
    });

    it('should apply scale correctly', () => {
      // Scale matrix: scale by (2, 3, 4)
      const scale = new Float32Array([
        2, 0, 0, 0,
        0, 3, 0, 0,
        0, 0, 4, 0,
        0, 0, 0, 1,
      ]);
      const result = mulMat4Vec4Full(scale, 1, 2, 3);
      expect(result.x).toBe(2);
      expect(result.y).toBe(6);
      expect(result.z).toBe(12);
      expect(result.w).toBe(1);
    });

    it('should handle perspective division setup correctly', () => {
      // Perspective-like matrix with non-1 w
      const perspective = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 1, // Note: m[11] = 1 makes w = z
        0, 0, 0, 0,
      ]);
      const result = mulMat4Vec4Full(perspective, 1, 2, 3);
      expect(result.x).toBe(1);
      expect(result.y).toBe(2);
      expect(result.z).toBe(3);
      expect(result.w).toBe(3); // w = z
    });
  });
});
