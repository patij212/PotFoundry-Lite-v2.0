// refineLoci.test.ts — fast synthetic guard (no env gate, ms). A point set ~0.4mm off a known analytic crest must
// snap ONTO the crest (higher radius, closer u) — and a smooth control must barely move.
import { describe, it, expect } from 'vitest';
import { refineLinesToExtremum } from './refineLoci';

const TAU = 2 * Math.PI;
// crests at u = 0, 1/3, 2/3 (cos(3θ)=1). Rb≈40 → uToMm ≈ 2π·40.
const rA = (th: number, _z: number): number => 40 + 5 * Math.cos(3 * th);
const H = 120, U2MM = TAU * 40, T2MM = H;

describe('refineLinesToExtremum', () => {
  it('snaps an off-crest point ONTO the analytic crest (u→0, r↑)', () => {
    const u0 = 0.4 / U2MM; // ~0.4mm off the crest at u=0 (within the 0.6mm search)
    const line = { points: [{ u: u0, t: 0.4 }, { u: u0, t: 0.5 }, { u: u0, t: 0.6 }] }; // vertical ridge line → perp is along u
    const [ref] = refineLinesToExtremum([line], rA, H, U2MM, T2MM, 0.6);
    const mid = ref.points[1];
    const rOrig = rA(TAU * u0, 0.5 * H), rRef = rA(TAU * mid.u, 0.5 * H);
    const perpDist = (u: number): number => Math.min(((u % 1) + 1) % 1, 1 - (((u % 1) + 1) % 1)); // periodic dist to u≡0
    expect(rRef).toBeGreaterThanOrEqual(rOrig - 1e-9);       // moved uphill toward the crest
    expect(perpDist(mid.u)).toBeLessThan(perpDist(u0));      // closer to the crest at u≡0 (periodic)
    expect(rRef).toBeGreaterThan(44.9);                       // essentially on the crest (r=45)
  });

  it('a point already on the crest barely moves', () => {
    const line = { points: [{ u: 0, t: 0.4 }, { u: 0, t: 0.5 }, { u: 0, t: 0.6 }] };
    const [ref] = refineLinesToExtremum([line], rA, H, U2MM, T2MM, 0.6);
    expect(Math.abs(ref.points[1].u)).toBeLessThan(1e-3);
  });
});
