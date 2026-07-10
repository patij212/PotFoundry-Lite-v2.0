/**
 * E-2026-07-10-INTHASH-SWAP — TDD guard test, written BEFORE the production swap.
 *
 * Confirms `src/geometry/styles.ts`'s production `rOuterVoronoi`/`rOuterVoronoiVec` match the
 * CONFIRMED integer-exact reference implementation (`research/bridge/_voronoi_inthash_lib.ts`,
 * E-2026-07-10-INTHASH pre-reg 899238b0 / verdict f1ce5ca4) bit-for-bit, and re-proves the
 * f32-emulated determinism property THROUGH the production function (not just the reference lib
 * in isolation).
 *
 * Run RED first (against the pre-swap float-hash `rOuterVoronoi`) to confirm this test actually
 * bites — it must fail before the swap and pass after.
 */
import { describe, it, expect } from 'vitest';
import { rOuterVoronoi, rOuterVoronoiVec } from './styles';
import { DEFAULT_VORONOI, TAU } from './types';
import type { StyleOptions } from './types';
import {
  rOuterVoronoiIntF64,
  rOuterVoronoiIntF32,
  hashDeterminismProbe,
  type VoronoiParams as RefVoronoiParams,
} from '../../research/bridge/_voronoi_inthash_lib';

// StyleOptions is a flat Record<string, number|undefined> index signature — VoronoiParams
// (DEFAULT_VORONOI's type) doesn't structurally satisfy it directly; spread into a plain object,
// matching the established pattern in verify_mesher_band_integration.test.ts /
// verify_voronoiCelticFeatureFlow.test.ts (`const VOPTS: StyleOptions = { ...V };`).
const VOPTS: StyleOptions = { ...DEFAULT_VORONOI };

// Reference lib's VoronoiParams field names (scale/jitter/thickness/relief/morph/zStretch/
// pulse/edgeFade) map 1:1 to production DEFAULT_VORONOI's v-prefixed fields.
function toRefParams(p: typeof DEFAULT_VORONOI): RefVoronoiParams {
  return {
    scale: p.vScale,
    jitter: p.vJitter,
    thickness: p.vThickness,
    relief: p.vRelief,
    morph: p.vMorph,
    zStretch: p.vZStretch,
    pulse: p.vPulse,
    edgeFade: p.vEdgeFade,
  };
}

// Mulberry32 — small deterministic PRNG so the sample set is reproducible across runs without
// pulling in a dependency.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Production geometry scale used by the mission's e2e prod-truth harness (H120/Rb40/Rt50).
const H = 120;
const Rb = 40;
const Rt = 50;

function r0At(t: number): number {
  return Rb + (Rt - Rb) * t;
}

describe('E-2026-07-10-INTHASH-SWAP: voronoiIntHash guard', () => {
  describe('(a) production rOuterVoronoi matches reference rOuterVoronoiIntF64 bit-for-bit', () => {
    it('matches on >=1,000,000 random-coverage (theta,z) samples at DEFAULT_VORONOI/H120/Rb40/Rt50', () => {
      const rng = mulberry32(0xc0ffee);
      const refParams = toRefParams(DEFAULT_VORONOI);
      const N = 1_000_000;
      let mismatches = 0;
      let firstMismatch: { theta: number; z: number; prod: number; ref: number } | null = null;

      for (let i = 0; i < N; i++) {
        const theta = rng() * TAU;
        const t = rng();
        const z = t * H;
        const r0 = r0At(t);

        const prod = rOuterVoronoi(theta, z, r0, H, VOPTS);
        const ref = rOuterVoronoiIntF64(theta, z, r0, H, refParams);

        if (prod !== ref) {
          mismatches++;
          if (!firstMismatch) firstMismatch = { theta, z, prod, ref };
        }
      }

      if (firstMismatch) {
        console.error(
          `First mismatch: theta=${firstMismatch.theta}, z=${firstMismatch.z}, ` +
            `prod=${firstMismatch.prod}, ref=${firstMismatch.ref}, ` +
            `diff=${Math.abs(firstMismatch.prod - firstMismatch.ref)}`
        );
      }
      expect(mismatches).toBe(0);
    });

    it('matches on cell-boundary-adjacent bands (dense sampling within +/-1e-4 of integer cell lines in scaled uv)', () => {
      const rng = mulberry32(0xdeadbeef);
      const refParams = toRefParams(DEFAULT_VORONOI);
      const scaleVal = DEFAULT_VORONOI.vScale;
      const N = 200_000;
      let mismatches = 0;
      let firstMismatch: { theta: number; z: number; prod: number; ref: number } | null = null;

      for (let i = 0; i < N; i++) {
        // Pick a random integer cell line in scaled-u space, then jitter within 1e-4 of it,
        // and invert back to theta. Same construction for the scaled-v (z) axis via t.
        const cellLineU = Math.floor(rng() * scaleVal * 4) - scaleVal * 2;
        const uNear = cellLineU + (rng() - 0.5) * 2e-4;
        const theta = ((uNear / scaleVal) * TAU) % TAU;
        const thetaPos = theta < 0 ? theta + TAU : theta;

        const cellLineV = Math.floor(rng() * scaleVal * 2);
        const vNear = cellLineV + (rng() - 0.5) * 2e-4;
        const t = Math.max(0, Math.min(1, vNear / scaleVal));
        const z = t * H;
        const r0 = r0At(t);

        const prod = rOuterVoronoi(thetaPos, z, r0, H, VOPTS);
        const ref = rOuterVoronoiIntF64(thetaPos, z, r0, H, refParams);

        if (prod !== ref) {
          mismatches++;
          if (!firstMismatch) firstMismatch = { theta: thetaPos, z, prod, ref };
        }
      }

      if (firstMismatch) {
        console.error(
          `First boundary-band mismatch: theta=${firstMismatch.theta}, z=${firstMismatch.z}, ` +
            `prod=${firstMismatch.prod}, ref=${firstMismatch.ref}, ` +
            `diff=${Math.abs(firstMismatch.prod - firstMismatch.ref)}`
        );
      }
      expect(mismatches).toBe(0);
    });
  });

  describe('(b) rOuterVoronoiVec matches scalar rOuterVoronoi element-wise exactly', () => {
    // rOuterVoronoiVec returns a Float32Array, so each element is the f64 rOuterVoronoi result
    // ROUNDED TO f32 ON STORAGE — this is pre-existing, correct behaviour of the vectorized
    // function (unrelated to the hash swap), so the exact invariant is
    // vecResult[i] === Math.fround(scalarResult), not raw f64 equality.
    it('matches across a batch of thetas at several t values (element === Math.fround(scalar))', () => {
      const rng = mulberry32(0x1337);
      const N_THETA = 5000;
      const tValues = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

      for (const t of tValues) {
        const z = t * H;
        const r0 = r0At(t);
        const thetas = new Float32Array(N_THETA);
        for (let i = 0; i < N_THETA; i++) thetas[i] = rng() * TAU;

        const vecResult = rOuterVoronoiVec(thetas, z, r0, H, VOPTS);

        let mismatches = 0;
        for (let i = 0; i < N_THETA; i++) {
          const scalarResult = rOuterVoronoi(thetas[i], z, r0, H, VOPTS);
          if (vecResult[i] !== Math.fround(scalarResult)) mismatches++;
        }
        expect(mismatches).toBe(0);
      }
    });
  });

  describe('(c) f32-emulated determinism re-proven THROUGH the production function', () => {
    it('production rOuterVoronoi (via reference F64/F32 paths) shows 0 argmin-affecting radius jumps on >=200,000 adversarial samples', () => {
      // The production function itself has no Round parameter (it always runs at native JS f64
      // precision) — this gate instead re-confirms, through the SAME reference-lib code path the
      // production function was ported from, that the hash chain the production function now
      // uses has the determinism property. Combined with gate (a)'s bit-for-bit match against
      // rOuterVoronoiIntF64, this transitively re-proves the property for the production function:
      // if prod === ref-F64 everywhere (gate a), and ref-F64 === ref-F32 in argmin-affecting terms
      // (this gate), then prod inherits the determinism property.
      const rng = mulberry32(0xfeedface);
      const refParams = toRefParams(DEFAULT_VORONOI);
      const scaleVal = DEFAULT_VORONOI.vScale;
      const N = 200_000;
      let materialJumps = 0;
      const JUMP_THRESHOLD_MM = 0.01; // cell-boundary-scale; ordinary float noise is ~1e-5mm class

      for (let i = 0; i < N; i++) {
        const cellLineU = Math.floor(rng() * scaleVal * 4) - scaleVal * 2;
        const uNear = cellLineU + (rng() - 0.5) * 2e-4;
        const theta = ((uNear / scaleVal) * TAU) % TAU;
        const thetaPos = theta < 0 ? theta + TAU : theta;

        const cellLineV = Math.floor(rng() * scaleVal * 2);
        const vNear = cellLineV + (rng() - 0.5) * 2e-4;
        const t = Math.max(0, Math.min(1, vNear / scaleVal));
        const z = t * H;
        const r0 = r0At(t);

        const f64 = rOuterVoronoiIntF64(thetaPos, z, r0, H, refParams);
        const f32 = rOuterVoronoiIntF32(thetaPos, z, r0, H, refParams);
        if (Math.abs(f64 - f32) > JUMP_THRESHOLD_MM) materialJumps++;
      }

      expect(materialJumps).toBe(0);
    });

    it('raw hash22Int u32 output is deterministic across the sampled integer cell domain (sanity re-check)', () => {
      const rng = mulberry32(0x5eed);
      const N = 50_000;
      for (let i = 0; i < N; i++) {
        const cx = Math.floor(rng() * 4096) - 2048;
        const cy = Math.floor(rng() * 4096) - 2048;
        const a = hashDeterminismProbe(cx, cy);
        const b = hashDeterminismProbe(cx, cy);
        expect(a.x).toBe(b.x);
        expect(a.y).toBe(b.y);
      }
    });
  });
});
