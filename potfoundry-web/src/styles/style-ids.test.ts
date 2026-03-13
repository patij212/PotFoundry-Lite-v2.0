/**
 * Style ID Snapshot Test
 *
 * Style IDs are permanent and serialized into localStorage and GPU buffers.
 * They must NEVER be renumbered. New styles must use ID >= 20.
 *
 * @see agents.md, copilot-instructions.md for rationale
 */
import { describe, it, expect } from 'vitest';
import { STYLE_REGISTRY, StyleConfig } from './registry';

describe('Style IDs', () => {
  /**
   * Snapshot of all style IDs.
   * If this test fails, you may have accidentally changed an ID.
   * DO NOT update this snapshot unless you're adding a NEW style.
   */
  const EXPECTED_STYLE_IDS: Record<string, number> = {
    SuperformulaBlossom: 0,
    FourierBloom: 1,
    SpiralRidges: 2,
    SuperellipseMorph: 3,
    HarmonicRipple: 4,
    GothicArches: 5,
    WaveInterference: 6,
    Crystalline: 7,
    ArtDeco: 8,
    DragonScales: 9,
    BambooSegments: 10,
    RippleInterference: 11,
    GyroidManifold: 12,
    Voronoi: 13,
    BasketWeave: 14,
    GeometricStar: 15,
    HexagonalHive: 16,
    CelticKnot: 17,
    CelticTriquetra: 18,
    LowPolyFacet: 19,
    // Add new styles here with ID >= 20
  };

  it('should have stable style IDs (never renumber)', () => {
    const actualIds: Record<string, number> = {};
    for (const [key, config] of Object.entries(STYLE_REGISTRY)) {
      actualIds[key] = (config as StyleConfig).id;
    }

    // Check that all expected IDs are present and unchanged
    for (const [styleName, expectedId] of Object.entries(EXPECTED_STYLE_IDS)) {
      expect(actualIds[styleName], `Style "${styleName}" has wrong ID`).toBe(expectedId);
    }
  });

  it('should have unique style IDs', () => {
    const ids = new Set<number>();
    for (const [key, config] of Object.entries(STYLE_REGISTRY)) {
      const id = (config as StyleConfig).id;
      expect(ids.has(id), `Duplicate style ID ${id} found in "${key}"`).toBe(false);
      ids.add(id);
    }
  });

  it('should use ID >= 20 for new styles (IDs 0-19 are legacy)', () => {
    const registeredIds = Object.values(EXPECTED_STYLE_IDS);
    for (const [key, config] of Object.entries(STYLE_REGISTRY)) {
      const id = (config as StyleConfig).id;
      // If it's a new style not in our snapshot, it must be >= 20
      if (!registeredIds.includes(id)) {
        expect(id, `New style "${key}" should have ID >= 20, got ${id}`).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it('should not have gaps in legacy IDs 0-19', () => {
    const ids = Object.values(STYLE_REGISTRY).map((c) => (c as StyleConfig).id);
    for (let i = 0; i <= 19; i++) {
      expect(ids, `Missing legacy style ID ${i}`).toContain(i);
    }
  });
});
