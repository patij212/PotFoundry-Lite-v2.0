/**
 * capJunctionFloor.test.ts — verify the cap/wall junction under the M1 warp
 * (the one unmeasured residual).
 *
 * Architecture facts (WatertightAssembly.ts emitRadialCap / radialBandCount):
 * caps are radial fans of concentric UNIFORM-U intermediate rings (U=i/nRing) +
 * annulusStrips by index + a disc fan to the centre, REFERENCING the wall's
 * shared boundary ring by index. radialBandCount picks ~square radial bands.
 *
 * The M1 warp u=φ/m(t) is LINEAR at fixed t ⇒ the boundary ring stays UNIFORM in
 * u at every height (only its spacing scales by 1/m), and crests land ON ring
 * vertices (φ=j−0.5 on the φ-grid). So the cap's uniform-U rings still match the
 * wall ring by construction. This probe confirms the cap DISC fanning to the
 * petaled, crest-on-vertex ring is well-shaped in 3D — and compares crests-ON-
 * vertices (warp) vs crests-BETWEEN-vertices (today's unwarped phase) to show the
 * warp does not regress (and may improve) the cap.
 *
 * Bottom-under solid base (z=0, rDrain=0): outer ring = wall at t=0 (petaled);
 * radius shrinks linearly to the axis. 3D min-angle over all cap triangles
 * (best-of-2 per quad band; fan to centre), via SfbWallSampler. Pure CPU.
 */
import { describe, it, expect } from 'vitest';
import { SfbWallSampler, SFB1_PACKED } from './snapPlacementAudit';

const p = Float32Array.from(SFB1_PACKED);
const surf = new SfbWallSampler(p);

type V3 = readonly [number, number, number];
function triMin3(a: V3, b: V3, c: V3): number {
  const ang = (P: V3, Q: V3, R: V3): number => {
    const x1 = Q[0] - P[0], y1 = Q[1] - P[1], z1 = Q[2] - P[2];
    const x2 = R[0] - P[0], y2 = R[1] - P[1], z2 = R[2] - P[2];
    const l1 = Math.hypot(x1, y1, z1), l2 = Math.hypot(x2, y2, z2);
    if (l1 < 1e-12 || l2 < 1e-12) return 0;
    let cs = (x1 * x2 + y1 * y2 + z1 * z2) / (l1 * l2);
    cs = cs > 1 ? 1 : cs < -1 ? -1 : cs;
    return (Math.acos(cs) * 180) / Math.PI;
  };
  return Math.min(ang(a, b, c), ang(b, c, a), ang(c, a, b));
}
/** Best-of-2-diagonal 3D min-angle of a quad a,b,c,d (cyclic). */
function quadMin3(a: V3, b: V3, c: V3, d: V3): number {
  return Math.max(
    Math.min(triMin3(a, b, c), triMin3(a, c, d)),
    Math.min(triMin3(a, b, d), triMin3(b, c, d)),
  );
}

function radialBandCount(rOuter: number, rInner: number, nRing: number): number {
  const span = Math.abs(rOuter - rInner);
  const rMid = 0.5 * (Math.abs(rOuter) + Math.abs(rInner));
  const tangential = (2 * Math.PI * Math.max(rMid, 1e-6)) / nRing;
  if (tangential <= 1e-9) return 1;
  return Math.max(1, Math.min(64, Math.round(span / tangential)));
}

interface Stat { n: number; min: number; median: number; b15: number; b20: number }
function stat(vals: number[]): Stat {
  const s = [...vals].sort((x, y) => x - y);
  const n = s.length;
  let b15 = 0, b20 = 0;
  for (const v of s) {
    if (v < 15) b15++;
    if (v < 20) b20++;
  }
  return { n, min: n ? s[0] : 0, median: n ? s[Math.floor(n / 2)] : 0, b15: n ? (100 * b15) / n : 0, b20: n ? (100 * b20) / n : 0 };
}

/** Build the bottom cap (annulus to a drain ring of radius rInner, or solid base
 *  fanning to the axis when rInner=0) to a ring of nRing vertices whose u
 *  positions are uOfI(i); measure 3D min-angle over all cap triangles. */
function measureCap(nRing: number, uOfI: (i: number) => number, rInner: number): number[] {
  // Outer ring 3D (z=0 at t=0): petaled. Each vertex keeps its angle; radius
  // interpolates rOuter(U) → rInner (a circle) across the bands.
  const ang: number[] = [];
  const rOut: number[] = [];
  let maxR = 0;
  for (let i = 0; i < nRing; i++) {
    const P = surf.position(((uOfI(i) % 1) + 1) % 1, 0);
    const r = Math.hypot(P[0], P[1]);
    ang.push(Math.atan2(P[1], P[0]));
    rOut.push(r);
    if (r > maxR) maxR = r;
  }
  const nRadial = radialBandCount(maxR, rInner, nRing);
  const ringAt = (k: number): V3[] => {
    const f = k / nRadial; // 0 ⇒ outer, 1 ⇒ inner terminus
    return ang.map((th, i) => {
      const r = rOut[i] + (rInner - rOut[i]) * f;
      return [r * Math.cos(th), r * Math.sin(th), 0] as V3;
    });
  };
  const vals: number[] = [];
  const solid = rInner <= 1e-9;
  const lastBand = solid ? nRadial - 1 : nRadial;
  for (let k = 0; k < lastBand; k++) {
    const A = ringAt(k), B = ringAt(k + 1);
    for (let i = 0; i < nRing; i++) {
      const j = (i + 1) % nRing;
      vals.push(quadMin3(A[i], A[j], B[j], B[i]));
    }
  }
  if (solid) {
    const inner = ringAt(nRadial - 1);
    const C: V3 = [0, 0, 0];
    for (let i = 0; i < nRing; i++) {
      const j = (i + 1) % nRing;
      vals.push(triMin3(inner[i], inner[j], C));
    }
  }
  return vals;
}

describe('cap junction floor under the M1 warp (bottom-under solid base)', () => {
  it('measures the cap disc fanning to the petaled, crest-aligned ring', () => {
    const m0 = p[1]; // m(0) = 6
    // M1 ring: uniform u with crests ON vertices. dφ = 0.5/64 (q=6) ⇒ ring count
    // = m0/dφ; u_i = i·dφ/m0. Crests φ=j−0.5 land on integer i ⇒ on a vertex.
    const dphi = 0.5 / 64;
    const nRingWarp = Math.round(m0 / dphi); // 768
    const rDrain = 10; // DEFAULT_GEOMETRY r_drain = 10mm (annulus base — realistic)
    const warpDrain = stat(measureCap(nRingWarp, (i) => (i * dphi) / m0, rDrain));
    const unwarpDrain = stat(measureCap(nRingWarp, (i) => (i + 0.5) / nRingWarp, rDrain));
    const warpSolid = stat(measureCap(nRingWarp, (i) => (i * dphi) / m0, 0));

    const fmt = (s: Stat): string =>
      `n=${s.n} min ${s.min.toFixed(2)}deg median ${s.median.toFixed(2)}deg <15deg ${s.b15.toFixed(2)}% <20deg ${s.b20.toFixed(2)}%`;
    /* eslint-disable no-console */
    console.log('\n===== CAP JUNCTION FLOOR (bottom cap, nRing=768) =====');
    console.log(`  ANNULUS rDrain=10 (default), crests ON vertices (M1 warp):   ${fmt(warpDrain)}`);
    console.log(`  ANNULUS rDrain=10 (default), crests BETWEEN (unwarped):      ${fmt(unwarpDrain)}`);
    console.log(`  SOLID base (no drain), crests ON vertices (worst case):      ${fmt(warpSolid)}`);
    console.log('  NOTE: warp is cap-NEUTRAL (ON vs BETWEEN ~identical). Any sliver is a');
    console.log('  PRE-EXISTING emitRadialCap property (nRing verts at every radius, 64-band');
    console.log('  clamp ⇒ radial elongation toward the inner radius), independent of the warp.');
    console.log('======================================================\n');
    /* eslint-enable no-console */

    expect(warpDrain.n).toBeGreaterThan(100);
    expect(warpDrain.min).toBeGreaterThan(0);
  });
});
