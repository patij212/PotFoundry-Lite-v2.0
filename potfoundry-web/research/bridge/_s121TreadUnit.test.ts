/**
 * _s121TreadUnit.test.ts — S121 FIX 1, the TDD gate for the tread emitter.
 *
 *   PF_S121_UNIT=1 npx vitest run --config vitest.s121unit.config.ts
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * THE FIXTURE IS THE MEASURED GEOMETRY, NOT AN INVENTED ONE.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * Two rings 2*PF_CB_STEP_EPS_UM = 8 µm apart in z at the driver's own first detected CelticTriquetra step
 * (z = 32.396 / 32.404 — the exact pair the STL-side scan found, research/tools/s121TreadAnatomy.cjs), at
 * r ≈ 48, with DIFFERENT angular sampling (200 vs 137) and a radial cliff that VANISHES over half the
 * circle. That last property is the one that matters and it is why the defect exists at all: `zSteps` is a
 * scalar per step, so the wall is cut at that z across ALL θ — including the θ where R is smooth in z, where
 * the two loops are radially coincident and the "tread annulus" is nothing but an 8 µm ribbon.
 *
 * Each ring is given a real WALL: a quad strip down (ring A) or up (ring B) to a second ring 1.2 mm away,
 * triangulated so that every ring edge belongs to exactly ONE facet — which is what makes it a BOUNDARY
 * edge and is the whole reason shortening it forces the owning facet to be re-triangulated.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * THE CONTROL ARM IS THE SAME FUNCTION, NOT A COPY OF IT.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * `rounds: 0` disables densification and `stitchRingsGuarded` reduces EXACTLY to the driver's baseline
 * θ-merge walk. So the control cannot silently drift from the treatment the way a second transcription
 * would, and the SAME assertions are run against both arms.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * THE ASSERTIONS ARE TWO-SIDED. An emitter that emits nothing passes any "no facet over the cap" test, so
 * every arm is also required to CLOSE THE BAND:
 *   - facet count equals the zip's own invariant (one triangle per ring node, so nothing was dropped),
 *   - position-weld topology over wall+strip: non-manifold 0, winding mismatches 0, and the boundary is
 *     exactly the two FAR rims — i.e. the 8 µm gap is closed and no hole was opened,
 *   - the wall's total area is conserved to the last bit (the fan children tile their parent exactly).
 */
import { describe, expect, it } from 'vitest';
import { stitchRingsGuarded, type P3, type Tri3 } from './_s121TreadFix';

const RUN = process.env.PF_S121_UNIT === '1';
const d = RUN ? describe : describe.skip;

const TWO_PI = 2 * Math.PI;
const CAP = 50;          // PF_CB_SHAPE_AR
const WELD = 0.05 / 1000; // PF_CB_WELD_UM / 1000

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
const areaOf = (A: P3, B: P3, C: P3): number => {
  const ux = B[0] - A[0]; const uy = B[1] - A[1]; const uz = B[2] - A[2];
  const wx = C[0] - A[0]; const wy = C[1] - A[1]; const wz = C[2] - A[2];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};

/** the measured band: the driver's first detected CelticTriquetra step, ± PF_CB_STEP_EPS_UM. */
const Z_A = 32.396;
const Z_B = 32.404;
const N_A = 200;   // the driver's own PF_CB_GRIDU
const N_B = 137;   // deliberately different, so the two rings cannot be a matched quad strip by luck
const R0 = 48;

/** the cliff: 0.8 mm over half the circle, EXACTLY ZERO over the other half. */
const cliff = (th: number): number => (Math.cos(th) > 0 ? 0.8 * Math.cos(th) : 0);
const rA = (th: number): number => R0 + 0.05 * Math.cos(3 * th);
const rB = (th: number): number => rA(th) + cliff(th);

interface Fixture { wall: Tri3[]; loops: Array<[P3[], P3[]]>; farRimEdges: number }

const buildFixture = (): Fixture => {
  const ringA: P3[] = []; const ringB: P3[] = [];
  const ringA2: P3[] = []; const ringB2: P3[] = [];
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
  // ring A's band. The ring edge is traversed a_{i+1} -> a_i so that the strip, which traverses it
  // a_i -> a_{i+1}, closes it with CONSISTENT winding; the second triangle of each quad carries no ring edge.
  for (let i = 0; i < N_A; i += 1) {
    const j = (i + 1) % N_A;
    wall.push([ringA[j], ringA[i], ringA2[i]]);
    wall.push([ringA[j], ringA2[i], ringA2[j]]);
  }
  // ring B's band. The strip traverses B edges b_{i+1} -> b_i, so the wall traverses them b_i -> b_{i+1}.
  for (let i = 0; i < N_B; i += 1) {
    const j = (i + 1) % N_B;
    wall.push([ringB[i], ringB[j], ringB2[j]]);
    wall.push([ringB[i], ringB2[j], ringB2[i]]);
  }
  return { wall, loops: [[ringA, ringB]], farRimEdges: N_A + N_B };
};

interface Topo { nonManifold: number; boundary: number; orientMismatch: number }
/** exact-coordinate position weld — the fixture never places two distinct vertices within a weld radius. */
const analyze = (tris: Tri3[]): Topo => {
  const idx = new Map<string, number>();
  const wi = (p: P3): number => {
    const k = `${p[0]},${p[1]},${p[2]}`;
    const got = idx.get(k);
    if (got !== undefined) return got;
    const n = idx.size; idx.set(k, n); return n;
  };
  const ec = new Map<string, [number, number]>();   // [occupancy, a<b traversals]
  for (const [A, B, C] of tris) {
    const ia = wi(A); const ib = wi(B); const ic = wi(C);
    for (const [x, y] of [[ia, ib], [ib, ic], [ic, ia]]) {
      const k = x < y ? `${x}|${y}` : `${y}|${x}`;
      const v = ec.get(k) ?? [0, 0];
      v[0] += 1; if (x < y) v[1] += 1;
      ec.set(k, v);
    }
  }
  let nonManifold = 0; let boundary = 0; let orientMismatch = 0;
  for (const [cnt, fwd] of ec.values()) {
    if (cnt === 2) { if (fwd !== 1) orientMismatch += 1; continue; }
    if (cnt > 2) { nonManifold += 1; continue; }
    boundary += 1;
  }
  return { nonManifold, boundary, orientMismatch };
};

interface ArmResult {
  treadsOverCap: number; treadsOverCapArea: number; treadsOverCapMax: number;
  wallOverCap: number; wallOverCapMax: number;
  treads: number; nodes: number; steiner: number;
  topo: Topo; wallArea: number; refusals: string;
}

// THE SHIPPING SETTINGS, taken FROM the ladder below and not chosen ahead of it. At rounds 8 the ladder
// reaches over-cap 0 at (0.80, 0.05) and (0.90, 0.05); 0.90 is the cheaper of the two (1,654 vs 1,710
// facets). *** THE LADDER IS NOT MONOTONE *** — snap 0.15 and 0.25 are worse at every `safe`, and safe 0.40
// is worse than 0.90. That is reported, not smoothed: this is a heuristic whose zero is measured, not
// guaranteed by construction, and the residual on the real driver is reported per style for that reason.
const SAFE = 0.9;
const SNAP = 0.05;
const ROUNDS = 8;

const runArm = (rounds: number, safe = SAFE, snapFrac = SNAP): ArmResult => {
  const fx = buildFixture();
  const wallAreaBefore = fx.wall.reduce((s, t) => s + areaOf(t[0], t[1], t[2]), 0);
  const res = stitchRingsGuarded(fx.wall, fx.loops, { shapeAR: CAP, weldMm: WELD, maxK: 64, safe, rounds, snapFrac });
  let tOver = 0; let tArea = 0; let tMax = 0;
  const worst: string[] = [];
  for (const [A, B, C] of res.treads) {
    const a = aspect3(A, B, C);
    if (a > CAP) {
      tOver += 1; tArea += areaOf(A, B, C); if (a > tMax) tMax = a;
      // WHAT the residual actually is: a long base (densification refused) or a stranded apex (the mirror
      // was refused)? Those are different defects and only one of them is fixable by more rounds.
      const e = [Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]),
        Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]),
        Math.hypot(A[0] - C[0], A[1] - C[1], A[2] - C[2])];
      const th = [A, B, C].map((p) => { const q = Math.atan2(p[1], p[0]); return q < 0 ? q + TWO_PI : q; });
      worst.push(`AR ${a.toFixed(1)} edges ${e.map((v) => v.toExponential(2)).join('/')}`
        + ` alt ${((2 * areaOf(A, B, C)) / Math.max(...e)).toExponential(2)} θ ${th.map((v) => v.toFixed(5)).join('/')}`);
    }
  }
  if (worst.length > 0 && worst.length <= 12) {
    // eslint-disable-next-line no-console
    for (const w of worst) console.log(`      residual ${w}`);
  }
  let wOver = 0; let wMax = 0;
  const allWall = [...fx.wall, ...res.wallExtra];
  for (const [A, B, C] of allWall) {
    const a = aspect3(A, B, C);
    if (a > CAP) { wOver += 1; if (a > wMax) wMax = a; }
  }
  const wallArea = allWall.reduce((s, t) => s + areaOf(t[0], t[1], t[2]), 0);
  expect(Math.abs(wallArea - wallAreaBefore) / wallAreaBefore).toBeLessThan(1e-12);
  return {
    treadsOverCap: tOver, treadsOverCapArea: tArea, treadsOverCapMax: tMax,
    wallOverCap: wOver, wallOverCapMax: wMax,
    treads: res.treads.length, nodes: N_A + N_B + res.stats.steiner, steiner: res.stats.steiner,
    topo: analyze([...allWall, ...res.treads]), wallArea,
    refusals: `wallAR ${res.stats.refWallAR} maxK ${res.stats.refMaxK} weld ${res.stats.refWeld}`
      + ` multi ${res.stats.refMulti} unowned ${res.stats.unowned} snapped ${res.stats.snapped} rolledBack ${res.stats.rolledBack} rounds ${res.stats.rounds}`,
  };
};

d('S121 FIX 1 — the tread emitter', () => {
  it('CONTROL (rounds 0 = the baseline θ-merge walk) puts facets over the AR>50 cap', () => {
    const r = runArm(0);
    // eslint-disable-next-line no-console
    console.log(`  CONTROL   treads ${r.treads}  over cap ${r.treadsOverCap} (${((100 * r.treadsOverCap) / r.treads).toFixed(2)}%)`
      + `  area ${r.treadsOverCapArea.toFixed(6)} mm2  MAX ${r.treadsOverCapMax.toFixed(2)}`
      + `   wall over cap ${r.wallOverCap}   topo nm ${r.topo.nonManifold} bnd ${r.topo.boundary} wind ${r.topo.orientMismatch}`);
    // THE DEFECT, on the two-sided form. The band DOES close — that was never the bug — and the emitter
    // nonetheless ships facets 3.8x over the driver's own cap.
    expect(r.treads).toBe(r.nodes);
    expect(r.topo.nonManifold).toBe(0);
    expect(r.topo.orientMismatch).toBe(0);
    expect(r.topo.boundary).toBe(N_A + N_B);
    expect(r.treadsOverCap).toBeGreaterThan(0);
    expect(r.treadsOverCapMax).toBeGreaterThan(100);
  });

  it('TREATMENT (rounds 8) emits NO facet over the cap AND still closes the band', () => {
    const r = runArm(ROUNDS);
    // eslint-disable-next-line no-console
    console.log(`  TREATMENT treads ${r.treads}  over cap ${r.treadsOverCap}  MAX ${r.treadsOverCapMax.toFixed(2)}`
      + `   Steiner ${r.steiner}   wall over cap ${r.wallOverCap} (max ${r.wallOverCapMax.toFixed(2)})`
      + `   topo nm ${r.topo.nonManifold} bnd ${r.topo.boundary} wind ${r.topo.orientMismatch}   REFUSED ${r.refusals}`);
    // ── the headline ──
    expect(r.treadsOverCap).toBe(0);
    // ── and the other side of it: the emitter did not simply stop emitting ──
    expect(r.treads).toBeGreaterThan(N_A + N_B);
    expect(r.treads).toBe(r.nodes);              // the zip's own invariant: one triangle per ring node
    expect(r.steiner).toBeGreaterThan(0);
    // ── watertight, and no new over-cap facet anywhere in the WALL either ──
    expect(r.topo.nonManifold).toBe(0);
    expect(r.topo.orientMismatch).toBe(0);
    expect(r.topo.boundary).toBe(N_A + N_B);     // only the two FAR rims: the 8 µm gap is closed
    expect(r.wallOverCap).toBe(0);
  });

  it('the treatment is strictly better than the control on COUNT, AREA and MAX', () => {
    const c = runArm(0); const t = runArm(ROUNDS);
    // eslint-disable-next-line no-console
    console.log(`  COUNT ${c.treadsOverCap} -> ${t.treadsOverCap}   AREA ${c.treadsOverCapArea.toFixed(6)} -> ${t.treadsOverCapArea.toFixed(6)} mm2`
      + `   MAX ${c.treadsOverCapMax.toFixed(2)} -> ${t.treadsOverCapMax.toFixed(2)}   facets ${c.treads} -> ${t.treads}`);
    expect(t.treadsOverCap).toBeLessThan(c.treadsOverCap);
    expect(t.treadsOverCapArea).toBeLessThan(c.treadsOverCapArea);
    expect(t.treadsOverCapMax).toBeLessThan(c.treadsOverCapMax);
  });

  it('THE LADDER — and *** NO SETTING ANYWHERE ON IT IS WORSE THAN THE CONTROL ***', () => {
    // The monotone guard's whole claim, asserted across the whole parameter box rather than at the shipping
    // point. It is the property the first driver-scale run proved is not optional: at (0.9, 0.05) the unit
    // fixture reached 0/0/0 while CelticTriquetra's real loops went from MAX 190.93 to 14842.46. A guard
    // that commits a round only on a strict lexicographic improvement makes "worse than the baseline"
    // unreachable BY CONSTRUCTION — the worst case is that the fix is inert and the control is reproduced,
    // which is exactly what the (0.60,0.15), (0.80,0.15), (0.90,0.15) and (0.90,0.25) rows do.
    const ctl = runArm(0);
    const rows: string[] = [];
    for (const safe of [0.4, 0.6, 0.8, 0.9]) {
      for (const snap of [0.0, 0.05, 0.15, 0.25]) {
        const r = runArm(8, safe, snap);
        rows.push(`    safe ${safe.toFixed(2)} snap ${snap.toFixed(2)}:  over-cap ${String(r.treadsOverCap).padStart(4)}`
          + `  AREA ${r.treadsOverCapArea.toExponential(3)}  MAX ${r.treadsOverCapMax.toFixed(2).padStart(8)}`
          + `  facets ${String(r.treads).padStart(6)}  wall-over ${r.wallOverCap}  [${r.refusals}]`);
        expect(r.treadsOverCapMax).toBeLessThanOrEqual(ctl.treadsOverCapMax);
        expect(r.treadsOverCap).toBeLessThanOrEqual(ctl.treadsOverCap);
        expect(r.treadsOverCapArea).toBeLessThanOrEqual(ctl.treadsOverCapArea * (1 + 1e-12));
        expect(r.wallOverCap).toBe(0);
        expect(r.topo.nonManifold).toBe(0);
        expect(r.topo.orientMismatch).toBe(0);
        expect(r.topo.boundary).toBe(N_A + N_B);
      }
    }
    // eslint-disable-next-line no-console
    for (const row of rows) console.log(row);
    expect(rows.length).toBe(16);
  });

  it('rounds 0 is EXACTLY the baseline: the control arm cannot have been improved by accident', () => {
    // If `rounds: 0` ever started inserting a point, the control would flatter itself and the A/B would be
    // vacuous. Assert the zero it must have.
    const fx = buildFixture();
    const res = stitchRingsGuarded(fx.wall, fx.loops, { shapeAR: CAP, weldMm: WELD, maxK: 64, safe: SAFE, rounds: 0, snapFrac: SNAP });
    expect(res.stats.steiner).toBe(0);
    expect(res.stats.wallExtra).toBe(0);
    expect(res.stats.rounds).toBe(0);
    expect(res.treads.length).toBe(N_A + N_B);
  });
});
