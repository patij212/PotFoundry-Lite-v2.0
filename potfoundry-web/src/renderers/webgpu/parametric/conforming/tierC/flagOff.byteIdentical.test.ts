import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../SurfaceSampler';
import {
  buildConformingOuterWall,
  type ConformingOuterWallOptions,
} from '../ConformingOuterWall';
import { buildTierCOuterWall } from './index';
import { hashMesh } from './__testutil';

const OPTS: ConformingOuterWallOptions = {
  maxSagMm: 0.05,
  maxEdgeMm: 60,
  minEdgeMm: 0.5,
  gradeRatio: 2,
  maxLevel: 8,
  resU: 65,
  resT: 17,
};

// Full conforming build runs ~2 s in isolation; give it headroom (same
// convention as ConformingOuterWall.test.ts).
const HEAVY_BUILD_TIMEOUT_MS = 15_000;

describe('Tier-C flag-off is byte-identical', () => {
  it(
    'matches buildConformingOuterWall when the flag is off',
    () => {
      (
        globalThis as unknown as { __pfPerfectMesher?: boolean }
      ).__pfPerfectMesher = false;
      const sampler = new SyntheticCylinderSampler(50, 120, 3, 8);
      const base = buildConformingOuterWall(sampler, OPTS);
      const tierC = buildTierCOuterWall(sampler, OPTS);
      expect(hashMesh(tierC)).toBe(hashMesh(base));
    },
    HEAVY_BUILD_TIMEOUT_MS,
  );
});
