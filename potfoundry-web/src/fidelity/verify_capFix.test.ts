/**
 * verify_capFix.test.ts — does a COARSENING concentric disc fix the cap sliver?
 *
 * capJunctionFloor showed the production cap (emitRadialCap: nRing verts at EVERY
 * radius + 64-band clamp) slivers — default annulus min ~5deg, 37% sub-15 at
 * nRing=1024 — because the radial step stays ~constant while the tangential
 * spacing shrinks toward the inner radius (6:1+ cells near the drain). This is a
 * SEPARATE, pre-existing defect (affects current production), but it dominates the
 * ASSEMBLED-mesh worst angle, so "every triangle perfect" needs it fixed.
 *
 * Standard fix = concentric-disc coarsening: vertex count ∝ radius so cells stay
 * ~square (tangential ≈ radial spacing), with angle-stripped transition bands.
 * This builds that and measures 3D min-angle, vs the current (constant-count)
 * cap, on a circular base (the petal modulation is second-order for this
 * feasibility check). If coarsening clears the floor, the cap is fixable.
 *
 * Pure CPU, no production change.
 */
import { describe, it, expect } from 'vitest';

type P2 = [number, number];
function angAt(X: P2, Y: P2, Z: P2): number {
  const x1 = Y[0] - X[0], y1 = Y[1] - X[1];
  const x2 = Z[0] - X[0], y2 = Z[1] - X[1];
  const l1 = Math.hypot(x1, y1), l2 = Math.hypot(x2, y2);
  if (l1 < 1e-12 || l2 < 1e-12) return 0;
  let cs = (x1 * x2 + y1 * y2) / (l1 * l2);
  cs = cs > 1 ? 1 : cs < -1 ? -1 : cs;
  return (Math.acos(cs) * 180) / Math.PI;
}
const triMin = (a: P2, b: P2, c: P2): number => Math.min(angAt(a, b, c), angAt(b, c, a), angAt(c, a, b));

interface Ring { r: number; n: number }
function ringVerts(r: number, n: number): P2[] {
  const v: P2[] = [];
  for (let k = 0; k < n; k++) { const th = (2 * Math.PI * k) / n; v.push([r * Math.cos(th), r * Math.sin(th)]); }
  return v;
}
/** Triangulate the band between two concentric rings of possibly-different vertex
 *  counts by angle-merge (advance whichever next vertex has the smaller angle). */
function stripBand(outer: Ring, inner: Ring, out: number[]): void {
  const O = ringVerts(outer.r, outer.n);
  const I = ringVerts(inner.r, inner.n);
  const angO = (k: number): number => (2 * Math.PI * (k % outer.n)) / outer.n + 2 * Math.PI * Math.floor(k / outer.n);
  const angI = (k: number): number => (2 * Math.PI * (k % inner.n)) / inner.n + 2 * Math.PI * Math.floor(k / inner.n);
  let io = 0, ii = 0;
  while (io < outer.n || ii < inner.n) {
    const co = O[io % outer.n], ci = I[ii % inner.n];
    const advanceOuter = io < outer.n && (ii >= inner.n || angO(io + 1) <= angI(ii + 1));
    if (advanceOuter) { pushTri(out, co, O[(io + 1) % outer.n], ci); io++; }
    else { pushTri(out, co, I[(ii + 1) % inner.n], ci); ii++; }
  }
}
function pushTri(angles: number[], a: P2, b: P2, c: P2): void { angles.push(triMin(a, b, c)); }

interface Dist { n: number; min: number; b15: number; b20: number; median: number }
function distOf(v: number[]): Dist {
  const s = [...v].sort((x, y) => x - y);
  const n = s.length;
  let b15 = 0, b20 = 0;
  for (const x of s) { if (x < 15) b15++; if (x < 20) b20++; }
  return { n, min: n ? s[0] : 0, b15: n ? 100 * b15 / n : 0, b20: n ? 100 * b20 / n : 0, median: n ? s[Math.floor(n / 2)] : 0 };
}

function buildCap(rOuter: number, rInner: number, nOuter: number, coarsen: boolean, maxBands: number): number[] {
  const s = (2 * Math.PI * rOuter) / nOuter; // outer tangential spacing = radial step target
  const rings: Ring[] = [];
  if (coarsen) {
    let r = rOuter;
    while (r > rInner + 1e-9) {
      rings.push({ r, n: Math.max(6, Math.round((2 * Math.PI * r) / s)) });
      r -= s; // square radial step
    }
    rings.push({ r: rInner, n: Math.max(6, Math.round((2 * Math.PI * rInner) / s)) });
  } else {
    // production model: nOuter verts at EVERY ring, band count clamped to maxBands.
    const nBands = Math.min(maxBands, Math.max(1, Math.round((rOuter - rInner) / s)));
    for (let b = 0; b <= nBands; b++) rings.push({ r: rOuter + (rInner - rOuter) * (b / nBands), n: nOuter });
  }
  const angles: number[] = [];
  for (let b = 0; b < rings.length - 1; b++) stripBand(rings[b], rings[b + 1], angles);
  return angles;
}

describe('VERIFY cap fix: coarsening concentric disc vs production constant-count clamp', () => {
  it('measures cap 3D min-angle, current-clamp vs coarsen, default annulus', () => {
    const rOuter = 45, rInner = 10, nOuter = 1024; // production nRing=1024 (high)
    const current = distOf(buildCap(rOuter, rInner, nOuter, false, 64));
    const fixed = distOf(buildCap(rOuter, rInner, nOuter, true, 0));

    /* eslint-disable no-console */
    console.log('\n===== CAP FIX (annulus r 45->10, nOuter=1024) =====');
    console.log(`  CURRENT (1024 verts/ring, 64-band clamp): n=${current.n} min ${current.min.toFixed(2)} median ${current.median.toFixed(2)} <15 ${current.b15.toFixed(1)}% <20 ${current.b20.toFixed(1)}%`);
    console.log(`  COARSEN (verts proportional to radius)  : n=${fixed.n} min ${fixed.min.toFixed(2)} median ${fixed.median.toFixed(2)} <15 ${fixed.b15.toFixed(1)}% <20 ${fixed.b20.toFixed(1)}%`);
    console.log('===================================================\n');
    /* eslint-enable no-console */

    expect(current.n).toBeGreaterThan(100);
    expect(fixed.n).toBeGreaterThan(100);
    // The feasibility claim: coarsening lifts the cap floor well above the clamp.
    expect(fixed.min).toBeGreaterThan(current.min);
  });
});
