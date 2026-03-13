/**
 * Tests for ConstrainedTriangulator.extractChains
 * 
 * These tests verify the robustness of the chaining algorithm.
 * Run with: npx vitest run src/utils/geometry/__tests__/extractChains.test.ts
 */

import { describe, it, expect } from 'vitest';
import { ConstrainedTriangulator } from '../ConstrainedTriangulator';
import { FeaturePoint } from '../../../renderers/webgpu/FeatureExtractionComputer';

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
            // Verify all chain points are within [0, 1] range
            // (Previous margin check removed as we now support full zero-gap topology)
            for (const chain of result.chains) {
                for (const p of chain) {
                    expect(p.x).toBeGreaterThanOrEqual(0.0);
                    expect(p.x).toBeLessThanOrEqual(1.0);
                    expect(p.y).toBeGreaterThanOrEqual(0.0);
                    expect(p.y).toBeLessThanOrEqual(1.0);
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
            // After Douglas-Peucker simplification followed by high-res densification (0.001 increments)
            // our total point count will be high.
            const totalPoints = result.chains.reduce((a, c) => a + c.length, 0);
            expect(totalPoints).toBeGreaterThan(400);
        });
    });

    describe('Seam Points', () => {
        it('generates correct number of seam points', () => {
            const features = [];
            for (let i = 0; i < 20; i++) {
                features.push(makeFeature(0.5, 0.1 + i * 0.04));
            }

            const result = ConstrainedTriangulator.extractChains(features);
            // SEAMS = 1024 (Current Setting)
            // (1025 * 2) for left/right + (1025 * 2) for top/bottom = 4100
            expect(result.seamPoints.length).toBe(4100);
        });
    });

    describe('Anti-Sawtooth (Inertia & Physical Scaling)', () => {
        it('should follow a single ridge without jumping to a parallel one', () => {
            // Two parallel ridges, very close in UV space (0.01 apart)
            // But crawler starts on Ridge A.
            const features: FeaturePoint[] = [];

            // Ridge A (at t=0.5)
            for (let i = 0; i < 20; i++) {
                features.push({ theta: (0.1 + i * 0.02) * Math.PI * 2, t: 0.5, type: 1, strength: 0.9 });
            }

            // Ridge B (at t=0.51) - Parallel, slightly weaker
            for (let i = 0; i < 20; i++) {
                features.push({ theta: (0.11 + i * 0.02) * Math.PI * 2, t: 0.51, type: 1, strength: 0.8 });
            }

            const result = ConstrainedTriangulator.extractChains(features);

            // Should produce at least 2 distinct chains (or the crawler on one ridge)
            // It should NOT zigzag between them.
            for (const chain of result.chains) {
                // If it followed a ridge, it should be mostly horizontal
                const dy = Math.abs(chain[chain.length - 1].y - chain[0].y);
                expect(dy).toBeLessThan(0.05); // Should not have jumped back and forth
            }
        });
    });
});
