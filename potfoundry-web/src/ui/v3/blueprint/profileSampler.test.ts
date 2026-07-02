import { describe, it, expect } from 'vitest';
import { sampleProfile } from './profileSampler';
import { DEFAULT_GEOMETRY, GeometryParams } from '../../../state/types';

const BELL_ZERO: GeometryParams = { ...DEFAULT_GEOMETRY, bellAmp: 0 };

describe('sampleProfile', () => {
  // ── sample count ──────────────────────────────────────────────────────────

  it('returns n+1 samples for default n=48', () => {
    expect(sampleProfile(DEFAULT_GEOMETRY).samples).toHaveLength(49);
  });

  it('returns n+1 samples for custom n', () => {
    expect(sampleProfile(DEFAULT_GEOMETRY, 10).samples).toHaveLength(11);
  });

  // ── z span ────────────────────────────────────────────────────────────────

  it('first sample z = 0, last sample z = H', () => {
    const { samples, H } = sampleProfile(DEFAULT_GEOMETRY, 48);
    expect(samples[0].z).toBe(0);
    expect(samples[48].z).toBe(H);
  });

  it('z values are strictly increasing', () => {
    const { samples } = sampleProfile(DEFAULT_GEOMETRY, 48);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].z).toBeGreaterThan(samples[i - 1].z);
    }
  });

  // ── radii at endpoints (bell zeroed so power-law is exact) ────────────────

  it('samples[0].rOuter ≈ bottom_od/2 with bell zeroed', () => {
    const { samples } = sampleProfile(BELL_ZERO, 48);
    expect(samples[0].rOuter).toBeCloseTo(BELL_ZERO.bottom_od / 2, 5);
  });

  it('samples[n].rOuter ≈ top_od/2 with bell zeroed', () => {
    const { samples } = sampleProfile(BELL_ZERO, 48);
    expect(samples[48].rOuter).toBeCloseTo(BELL_ZERO.top_od / 2, 5);
  });

  // ── inner wall ────────────────────────────────────────────────────────────

  it('rInner = rOuter − t_wall when result ≥ 0.5', () => {
    const { samples } = sampleProfile(DEFAULT_GEOMETRY, 48);
    const { t_wall } = DEFAULT_GEOMETRY;
    for (const s of samples) {
      const expected = s.rOuter - t_wall;
      if (expected >= 0.5) {
        expect(s.rInner).toBeCloseTo(expected, 6);
      } else {
        expect(s.rInner).toBe(0.5);
      }
    }
  });

  it('rInner is never below the 0.5mm floor', () => {
    const { samples } = sampleProfile(DEFAULT_GEOMETRY, 48);
    for (const s of samples) {
      expect(s.rInner).toBeGreaterThanOrEqual(0.5);
    }
  });

  // ── maxR ──────────────────────────────────────────────────────────────────

  it('maxR equals the maximum rOuter across all samples', () => {
    const result = sampleProfile(DEFAULT_GEOMETRY, 48);
    const computed = Math.max(...result.samples.map(s => s.rOuter));
    expect(result.maxR).toBeCloseTo(computed, 6);
  });

  // ── bell bulge (core correctness) ─────────────────────────────────────────

  it('bellAmp > 0 genuinely bulges the middle vs a bell-zero baseline', () => {
    const gBell: GeometryParams = {
      ...DEFAULT_GEOMETRY,
      bellAmp: 0.3,
      bellCenter: 0.5,
      bellWidth: 0.22,
    };
    const r0 = sampleProfile(BELL_ZERO, 48);
    const r1 = sampleProfile(gBell, 48);
    // mid-point sample (index 24 ≈ z = H/2)
    expect(r1.samples[24].rOuter).toBeGreaterThan(r0.samples[24].rOuter);
  });

  it('negative bellAmp dents the middle vs a bell-zero baseline', () => {
    const gDent: GeometryParams = {
      ...DEFAULT_GEOMETRY,
      bellAmp: -0.2,
      bellCenter: 0.5,
      bellWidth: 0.22,
    };
    const r0 = sampleProfile(BELL_ZERO, 48);
    const r1 = sampleProfile(gDent, 48);
    expect(r1.samples[24].rOuter).toBeLessThan(r0.samples[24].rOuter);
  });

  // ── metadata passthrough ──────────────────────────────────────────────────

  it('H, topOD, bottomOD match the input GeometryParams', () => {
    const g = DEFAULT_GEOMETRY;
    const result = sampleProfile(g, 48);
    expect(result.H).toBe(g.H);
    expect(result.topOD).toBe(g.top_od);
    expect(result.bottomOD).toBe(g.bottom_od);
  });
});
