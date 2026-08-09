/**
 * _c1VerifyBefore.test.ts — S121 TASK C1: is `rounds: 0` REALLY the committed emitter?
 *
 *   PF_C1_VERIFY=1 npx vitest run --config vitest.c1verify.config.ts
 *
 * The S121 TDD's ARM 1 drives `stitchRingsGuarded(..., {rounds: 0})` and asserts on ITS output, on the
 * stated ground that this mode is the committed driver's `stitchRings` "bit for bit". If that were false,
 * the pre-registered failing test would be the new module failing against itself and would prove nothing
 * about the code the fix replaces.
 *
 * `research/exchange/_strataConformBisect/s121/c1BeforeState.cjs` extracts the committed `stitchRings`
 * SOURCE TEXT out of `git show HEAD:...` (annotations stripped mechanically, every substitution printed),
 * runs it on the TDD fixture and dumps all 337 emitted triangles. This test rebuilds the same fixture,
 * runs the shipped module at `rounds: 0`, and compares the two triangle lists COORDINATE BY COORDINATE
 * with Object.is — same count, same order, same winding, same bits. Summary statistics agreeing is not
 * enough: two different walks can produce the same over-cap count.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stitchRingsGuarded, type P3, type Tri3 } from './_s121TreadFix';

const RUN = process.env.PF_C1_VERIFY === '1';
const d = RUN ? describe : describe.skip;

const TWO_PI = 2 * Math.PI;
const CAP = 50;
const WELD = 0.05 / 1000;
const Z_A = 32.396; const Z_B = 32.404;
const N_A = 200; const N_B = 137; const R0 = 48;

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

d('S121 C1 — the control mode IS the committed emitter', () => {
  it('rounds:0 reproduces git HEAD stitchRings COORDINATE BY COORDINATE', () => {
    const before = JSON.parse(readFileSync(
      'research/exchange/_strataConformBisect/s121/c1_before_treads.json', 'utf8',
    )) as Tri3[];
    const fx = buildFixture();
    const res = stitchRingsGuarded(fx.wall, fx.loops, { shapeAR: CAP, weldMm: WELD, maxK: 64, safe: 0.9, rounds: 0, snapFrac: 0.05 });
    expect(res.treads.length).toBe(before.length);
    let bad = 0; let firstBad = -1;
    for (let t = 0; t < before.length; t += 1) {
      for (let v = 0; v < 3; v += 1) {
        for (let c = 0; c < 3; c += 1) {
          if (!Object.is(before[t][v][c], res.treads[t][v][c])) { bad += 1; if (firstBad < 0) firstBad = t; }
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`  BIT-IDENTITY vs git HEAD stitchRings: ${before.length} tris, ${bad} differing coordinates`
      + `${firstBad >= 0 ? ` (first at tri ${firstBad})` : ''}`);
    expect(bad).toBe(0);
    // and the fix must not have quietly re-triangulated the wall in the control mode either
    expect(res.stats.steiner).toBe(0);
    expect(res.stats.wallExtra).toBe(0);
  });
});
