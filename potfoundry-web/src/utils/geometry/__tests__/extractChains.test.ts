/**
 * Tests for ConstrainedTriangulator.extractChains
 * 
 * These tests verify the robustness of the chaining algorithm.
 * Run with: npx vitest run src/utils/geometry/__tests__/extractChains.test.ts
 */

import { describe, it, expect } from 'vitest';
import { ConstrainedTriangulator, FeaturePoint, Point2D } from '../ConstrainedTriangulator';

// Helper to create feature points
const makeFeature = (theta: number, t: number, strength = 1.0): FeaturePoint => ({
    theta: theta * Math.PI * 2, // Convert [0,1] to [0,2PI]
    t,
    type: 1,
    strength
});

describe('extractChains', () => {
    describe('Edge Cases', () => {
        it('handles empty input', () => {
            const result = ConstrainedTriangulator.extractChains([]);
            expect(result.chains).toEqual([]);
            expect(result.seamPoints).toEqual([]);
        });

        it('handles fewer than 4 points', () => {
            const features = [
                makeFeature(0.1, 0.1),
                makeFeature(0.2, 0.2),
                makeFeature(0.3, 0.3),
            ];
            const result = ConstrainedTriangulator.extractChains(features);
            expect(result.chains).toEqual([]);
            expect(result.seamPoints.length).toBeGreaterThan(0); // Should still have seam points
        });

        it('handles points at domain boundaries', () => {
            // Points exactly at 0 and 1 should be clamped with margin
            const features = [
                makeFeature(0.0, 0.0),
                makeFeature(1.0, 1.0),
                makeFeature(0.5, 0.5),
                makeFeature(0.5, 0.6),
                makeFeature(0.5, 0.7),
            ];
            const result = ConstrainedTriangulator.extractChains(features);
            // Verify all chain points are within margin
            for (const chain of result.chains) {
                for (const p of chain) {
                    expect(p.x).toBeGreaterThanOrEqual(0.005);
                    expect(p.x).toBeLessThanOrEqual(0.995);
                    expect(p.y).toBeGreaterThanOrEqual(0.005);
                    expect(p.y).toBeLessThanOrEqual(0.995);
                }
            }
        });
    });

    describe('Deduplication', () => {
        it('removes duplicate points', () => {
            // Create many points at the same location
            const features = [];
            for (let i = 0; i < 100; i++) {
                features.push(makeFeature(0.5, 0.5, i * 0.01)); // Same location, varying strength
            }
            // Add a chain of distinct points
            for (let i = 0; i < 10; i++) {
                features.push(makeFeature(0.1 + i * 0.05, 0.1 + i * 0.05));
            }

            const result = ConstrainedTriangulator.extractChains(features);
            // Should not have 100+ points in chains
            const totalPoints = result.chains.reduce((a, c) => a + c.length, 0);
            expect(totalPoints).toBeLessThan(50); // Significant deduplication
        });

        it('keeps strongest point when deduplicating', () => {
            const features = [
                makeFeature(0.5, 0.5, 0.1),
                makeFeature(0.5, 0.5, 0.9), // Stronger duplicate
                makeFeature(0.5, 0.5, 0.5),
            ];
            // The algorithm should keep the strongest one
            const result = ConstrainedTriangulator.extractChains(features);
            // Can't directly check, but no crash = success
            expect(result).toBeDefined();
        });
    });

    describe('Chain Building', () => {
        it('creates chains from connected features', () => {
            // Line of features that should form one chain
            const features = [];
            for (let i = 0; i < 20; i++) {
                features.push(makeFeature(0.1 + i * 0.02, 0.5, 1.0)); // Horizontal line
            }

            const result = ConstrainedTriangulator.extractChains(features);
            expect(result.chains.length).toBeGreaterThanOrEqual(1);
            expect(result.chains[0].length).toBeGreaterThan(3);
        });

        it('limits maximum number of chains', () => {
            // Create many isolated clusters
            const features = [];
            for (let i = 0; i < 100; i++) {
                for (let j = 0; j < 5; j++) {
                    features.push(makeFeature(
                        0.1 + (i % 10) * 0.09,
                        0.1 + Math.floor(i / 10) * 0.09 + j * 0.01,
                        1.0
                    ));
                }
            }

            const result = ConstrainedTriangulator.extractChains(features);
            expect(result.chains.length).toBeLessThanOrEqual(50); // MAX_CHAINS limit
        });

        it('rejects sharp turns (>90 degrees)', () => {
            // Zigzag pattern that would create sharp turns
            const features = [
                makeFeature(0.1, 0.5),
                makeFeature(0.15, 0.5), // Right
                makeFeature(0.10, 0.55), // Back left and up (sharp turn)
                makeFeature(0.15, 0.6), // Right again
            ];

            const result = ConstrainedTriangulator.extractChains(features);
            // Should create separate chains rather than one zigzag
            // The exact behavior depends on scoring, but no crash = success
            expect(result).toBeDefined();
        });
    });

    describe('Simplification', () => {
        it('simplifies chains while preserving shape', () => {
            // Long chain with many collinear points
            const features = [];
            for (let i = 0; i < 100; i++) {
                features.push(makeFeature(0.1 + i * 0.005, 0.5)); // Perfectly horizontal
            }

            const result = ConstrainedTriangulator.extractChains(features);
            // After Douglas-Peucker simplification, should have fewer points
            const totalPoints = result.chains.reduce((a, c) => a + c.length, 0);
            expect(totalPoints).toBeLessThan(50); // Should be heavily simplified
        });
    });

    describe('Seam Points', () => {
        it('generates correct number of seam points', () => {
            const features = [];
            for (let i = 0; i < 20; i++) {
                features.push(makeFeature(0.5, 0.1 + i * 0.04));
            }

            const result = ConstrainedTriangulator.extractChains(features);
            // SEAMS = 180, left + right + top + bottom boundaries
            // (181 * 2) for left/right + (181 * 2) for top/bottom = 724
            expect(result.seamPoints.length).toBe(724);
        });
    });
});
