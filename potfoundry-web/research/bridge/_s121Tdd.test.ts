/**
 * _s121Tdd.test.ts — *** THE PRE-REGISTERED FAILING TEST. IT IS SUPPOSED TO FAIL. ***
 *
 *   PF_S121_TDD=1 npx vitest run --config vitest.s121unit.config.ts
 *
 * This is the TDD record for S121: the property the two emitters must satisfy, asserted against the code as
 * it stood BEFORE the fix, so that "it failed, then it passed" is a reproducible run and not a claim.
 *
 *   ARM 1  the tread emitter, driven through `stitchRingsGuarded` with `rounds: 0` — which is the driver's
 *          baseline θ-merge walk, bit for bit, through the same code path (see _s121TreadFix.ts). The
 *          fixture is the measured band: two rings 8 µm apart in z at CelticTriquetra's first detected C0
 *          step, 200 vs 137 columns, with a cliff that vanishes over half the circle.
 *   ARM 2  the seed-repair verdict, asserted on the measured GothicArches blade pair with the repair
 *          DISABLED (the verdict is asked to hold with `before` already under the cap, which it is not).
 *
 * IT IS GATED BEHIND PF_S121_TDD=1 SO IT NEVER RUNS IN CI OR IN THE UNIT GATE. Its only job is to be run
 * once, fail, and have that failure recorded. The passing side is _s121TreadUnit.test.ts /
 * _s121SeedUnit.test.ts, which assert the SAME properties against the fixed path.
 */
import { describe, expect, it } from 'vitest';
import { stitchRingsGuarded, type P3, type Tri3 } from './_s121TreadFix';
import { seedFlipVerdict, type FlipCorner } from './_s121SeedFix';

const RUN = process.env.PF_S121_TDD === '1';
const d = RUN ? describe : describe.skip;

const TWO_PI = 2 * Math.PI;
const CAP = 50;
const WELD = 0.05 / 1000;
const Z_A = 32.396; const Z_B = 32.404;
const N_A = 200; const N_B = 137; const R0 = 48;

const aspect3 = (A: P3, B: P3, C: P3): number => {
  const e0 = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
  const e1 = Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]);
  const e2 = Math.hypot(A[0] - C[0], A[1] - C[1], A[2] - C[2]);
  const ux = B[0] - A[0]; const uy = B[1] - A[1]; const uz = B[2] - A[2];
  const wx = C[0] - A[0]; const wy = C[1] - A[1]; const wz = C[2] - A[2];
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (!(area > 0)) return Infinity;
  return (Math.max(e0, e1, e2) * (e0 + e1 + e2)) / (4 * area);
};
const cliff = (th: number): number => (Math.cos(th) > 0 ? 0.8 * Math.cos(th) : 0);
const rA = (th: number): number => R0 + 0.05 * Math.cos(3 * th);
const rB = (th: number): number => rA(th) + cliff(th);

const buildFixture = (): { wall: Tri3[]; loops: Array<[P3[], P3[]]> } => {
  const ringA: P3[] = []; const ringB: P3[] = []; const ringA2: P3[] = []; const ringB2: P3[] = [];
  for (let i = 0; i < N_A; i += 1) {
    const th = (TWO_PI * i) / N_A;
    ringA.push([rA(th) * Math.cos(th), rA(th) * Math.sin(th), Z_A]);
    ringA2.push([rA(th) * Math.cos(th), rA(th) * Math.sin(th), Z_A - 1.2]);
  }
  for (let i = 0; i < N_B; i += 1) {
    const th = (TWO_PI * i) / N_B;
    ringB.push([rB(th) * Math.cos(th), rB(th) * Math.sin(th), Z_B]);
    ringB2.push([rB(th) * Math.cos(th), rB(th) * Math.sin(th), Z_B + 1.2]);
  }
  const wall: Tri3[] = [];
  for (let i = 0; i < N_A; i += 1) {
    const j = (i + 1) % N_A;
    wall.push([ringA[j], ringA[i], ringA2[i]]); wall.push([ringA[j], ringA2[i], ringA2[j]]);
  }
  for (let i = 0; i < N_B; i += 1) {
    const j = (i + 1) % N_B;
    wall.push([ringB[i], ringB[j], ringB2[j]]); wall.push([ringB[i], ringB2[j], ringB2[i]]);
  }
  return { wall, loops: [[ringA, ringB]] };
};

d('S121 — THE PRE-REGISTERED FAILING TEST (must fail before the fix)', () => {
  it('ARM 1 — the BASELINE tread emitter must put NO facet over the AR>50 cap', () => {
    const fx = buildFixture();
    const res = stitchRingsGuarded(fx.wall, fx.loops, { shapeAR: CAP, weldMm: WELD, maxK: 64, safe: 0.9, rounds: 0 });
    let over = 0; let max = 0;
    for (const [A, B, C] of res.treads) {
      const a = aspect3(A, B, C);
      if (a > CAP) { over += 1; if (a > max) max = a; }
    }
    // eslint-disable-next-line no-console
    console.log(`  BASELINE emitter: ${res.treads.length} facets, ${over} over the cap, worst ${max.toFixed(2)}`);
    expect(res.treads.length).toBeGreaterThan(0);   // two-sided: it must still emit the band
    expect(over).toBe(0);                            // *** THIS IS THE ASSERTION THAT MUST FAIL ***
  });

  it('ARM 2 — the measured seed blade pair must already be under the cap', () => {
    const R = 41.501; const Z = 18.0; const dTh = 2.559 / R; const th0 = 1.0;
    const mk = (th: number, z: number): FlipCorner => ({
      x: R * Math.cos(th), y: R * Math.sin(th), z, dth: th - th0, dz: z - Z, feat: false,
    });
    const v = seedFlipVerdict(mk(th0, Z), mk(th0 + dTh, Z), mk(th0 + dTh / 2, Z + 0.02815), mk(th0 + dTh / 2, Z - 0.02815));
    // eslint-disable-next-line no-console
    console.log(`  seed blade pair as BORN: worst aspect3 ${v.before.toFixed(2)}`);
    expect(v.before).toBeLessThanOrEqual(CAP);       // *** THIS IS THE ASSERTION THAT MUST FAIL ***
  });
});
