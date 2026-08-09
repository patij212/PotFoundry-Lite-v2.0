/**
 * _s121SeedUnit.test.ts — S121 FIX 2, the TDD gate for the seed-repair flip verdict.
 *
 *   PF_S121_UNIT=1 npx vitest run --config vitest.s121unit.config.ts
 *
 * THE FIXTURE IS THE MEASURED FACET. GothicArches' worst seed blade, as the shipped STL reports it
 * (research/tools/s121TreadAnatomy.cjs on gothicarches_ring_DS-HT_S39CTL.stl):
 *
 *     AR 85.13   longest edge 2.559 mm   altitude 30.07 µm   dz 28.15 µm   dr 2.53 µm   r 41.501   z 18.0000
 *
 * i.e. a 2.56 mm chord lying flat at z = 18 with its opposite vertex 28 µm away in z. The quad is completed
 * by a second, mirror-image blade on the far side of that long edge — which is exactly the configuration a
 * constrained triangulation produces when a background lattice row lands a few tens of microns from a
 * constraint line — and the flip re-cuts the SHORT diagonal, turning two blades into two ordinary triangles.
 *
 * The tests are two-sided: the flip must fire and improve where it should, and must REFUSE on a locus edge,
 * on a non-convex quad, and where it would not strictly improve. A gate that only ever says yes is not a
 * gate.
 */
import { describe, expect, it } from 'vitest';
import { seedFlipVerdict, type FlipCorner } from './_s121SeedFix';

const RUN = process.env.PF_S121_UNIT === '1';
const d = RUN ? describe : describe.skip;

const R = 41.501;
const Z = 18.0;

/**
 * A corner from (θ,z), lifted to 3-D at radius R and expressed relative to `pv` (θ0,z0).
 * The driver hands the verdict exactly this: 3-D coordinates plus the shortest-arc (θ,z) offsets from pv.
 */
const mk = (th: number, z: number, th0: number, z0: number, feat = false): FlipCorner => ({
  x: R * Math.cos(th), y: R * Math.sin(th), z,
  dth: th - th0, dz: z - z0, feat,
});

/** the measured blade pair: a 2.559 mm chord at z=18, apexes 28.15 µm above and below it. */
const bladePair = (featP = false, featQ = false): [FlipCorner, FlipCorner, FlipCorner, FlipCorner] => {
  const dTh = 2.559 / R;                 // 2.559 mm of arc at r = 41.501
  const th0 = 1.0;
  const pv = mk(th0, Z, th0, Z, featP);
  const qv = mk(th0 + dTh, Z, th0, Z, featQ);
  // r0 above the middle of the chord, s0 below it — the two apexes of the quad the flip re-cuts.
  const r0 = mk(th0 + dTh / 2, Z + 0.02815, th0, Z);
  const s0 = mk(th0 + dTh / 2, Z - 0.02815, th0, Z);
  return [pv, qv, r0, s0];
};

d('S121 FIX 2 — the seed-repair flip verdict', () => {
  it('FIRES on the measured GothicArches blade pair and STRICTLY lowers the worst aspect', () => {
    const [pv, qv, r0, s0] = bladePair();
    const v = seedFlipVerdict(pv, qv, r0, s0);
    // eslint-disable-next-line no-console
    console.log(`  blade pair: before ${v.before.toFixed(2)}  after ${v.after.toFixed(2)}  ok ${v.ok}  why ${v.why}`);
    expect(v.before).toBeGreaterThan(50);      // the pair really is over the driver's cap
    expect(v.ok).toBe(true);
    expect(v.after).toBeLessThan(v.before);
    expect(v.after).toBeLessThan(50);          // and the repair actually clears the cap
  });

  it('REFUSES when BOTH endpoints of the edge sit on a traced locus', () => {
    const [pv, qv, r0, s0] = bladePair(true, true);
    const v = seedFlipVerdict(pv, qv, r0, s0);
    expect(v.ok).toBe(false);
    expect(v.why).toBe('locus');
    // and it is a real refusal, not a vacuous one: the same pair with only ONE endpoint on a locus fires.
    const [p2, q2, r2, s2] = bladePair(true, false);
    expect(seedFlipVerdict(p2, q2, r2, s2).ok).toBe(true);
  });

  it('REFUSES a non-convex quad (the flip would fold in (θ,z))', () => {
    const dTh = 2.559 / R; const th0 = 1.0;
    const pv = mk(th0, Z, th0, Z);
    const qv = mk(th0 + dTh, Z, th0, Z);
    const r0 = mk(th0 + dTh / 2, Z + 0.02815, th0, Z);
    // s0 pushed to the SAME side as r0: the quad p-r-q-s is then non-convex and the flip must refuse.
    const s0 = mk(th0 + dTh / 2, Z + 0.05, th0, Z);
    const v = seedFlipVerdict(pv, qv, r0, s0);
    expect(v.ok).toBe(false);
    expect(v.why).toBe('fold');
  });

  it('REFUSES when the flip would not STRICTLY improve — a well-shaped pair is left alone', () => {
    // an equilateral-ish quad: flipping it can only make things worse or leave them equal.
    const th0 = 1.0; const dTh = 1.0 / R;
    const pv = mk(th0, Z, th0, Z);
    const qv = mk(th0 + dTh, Z, th0, Z);
    const r0 = mk(th0 + dTh / 2, Z + 0.9, th0, Z);
    const s0 = mk(th0 + dTh / 2, Z - 0.9, th0, Z);
    const v = seedFlipVerdict(pv, qv, r0, s0);
    // eslint-disable-next-line no-console
    console.log(`  well-shaped pair: before ${v.before.toFixed(3)}  after ${v.after.toFixed(3)}  ok ${v.ok}  why ${v.why}`);
    expect(v.ok).toBe(false);
    expect(v.why).toBe('gain');
  });
});
