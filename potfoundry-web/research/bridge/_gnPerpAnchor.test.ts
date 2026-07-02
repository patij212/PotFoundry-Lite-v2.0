// _gnPerpAnchor.test.ts — DEV-ONLY regression probe (env PF_GNANCHOR=1) for the F2 instrument bug from
// E-2026-07-02-STEEP-HETEROGENEITY: labkit's single-seed Gauss-Newton nearest-point search
// (perFaceTrue3DSag / perpendicular3DDeviation → projectPointToRadialSurface) lands on WRONG-LOCAL-MINIMUM feet on
// tangled lattices (Gyroid, CelticTriquetra, …) and OVERSTATES the true perpendicular-3D deviation up to ~7×
// (convene: Gyroid GN 0.644 vs brute-trusted 0.092). See research/lab/steep-heterogeneity-transcript.md (F2).
//
// It pins the FIX — the brute-twin is now folded into labkit as `bruteAnchoredRedPerp` (worst-N red-facet centroid
// twin: cross-check each GN foot against a full-azimuth `bruteNearestOnRadialSurface` and keep the SMALLER distance,
// so GN can no longer overstate via a wrong well). The probe proves BOTH halves on a Gyroid mesh:
//   (1) REPRODUCE — raw single-seed GN overstates the brute-trusted perp on the worst red facets (p99 ratio ≥ 3,
//       many gnOver facets), exactly the F2 failure.
//   (2) ANCHOR TRUSTS BRUTE — the folded trusted p99 matches an INDEPENDENT brute reference within tol and never
//       exceeds the raw-GN value (the anchor only ever takes the smaller distance).
//
// CPU-only, ONE bounded Gyroid mesh, worst-40 red-facet twin (whole-mesh anchoring is ~3.4h — infeasible, see the
// bruteAnchoredRedPerp doc). Full azimuth is load-bearing: GN's own src coarse fallback only scans a ±0.22-rad LOCAL
// window, so the wrong-well foot in a different azimuth stays hidden from it but not from the brute scan.
//
// Run: PF_GNANCHOR=1 npx vitest run research/bridge/_gnPerpAnchor.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildInhouseMetricMesh, buildRadiusFn, type StyleDims,
  perFaceChordSag, bruteAnchoredRedPerp, bruteNearestOnRadialSurface, projectPointToRadialSurface,
  type AnalyticRadiusFn,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;

describe('labkit GN perp overstatement — brute anchor (F2)', () => {
  it.skipIf(process.env.PF_GNANCHOR !== '1')('bruteAnchoredRedPerp matches brute; raw GN overstates ~7×', () => {
    const rA: AnalyticRadiusFn = buildRadiusFn('GyroidManifold' as StyleId, {}, DIMS);
    // Match the convene's DEFAULT density (E-2026-07-02) so the documented ~7× overstatement reproduces: at coarser
    // density the true sag is genuinely larger (trusted rises), compressing the ratio; the brute cost is fixed at the
    // worst-40 facets regardless of mesh size, so only build + radial scale here.
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
      tolMm: 0.01, hMin: 0.05, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 500_000, splitThresh: 1.5, optimizeSweeps: 2, chordTolMm: 0.05,
    });
    const indices = Array.from(mesh.indices);
    const radial = perFaceChordSag(mesh.ut, indices, rA, DIMS.H);

    // THE FOLD: worst-40 red-facet brute twin (raw GN vs full-azimuth brute, keep the smaller).
    const anc = bruteAnchoredRedPerp(mesh.ut, indices, rA, DIMS.H, { radial });
    const ratio = anc.trustedP99 > 1e-9 ? anc.gnP99 / anc.trustedP99 : Infinity;
    // eslint-disable-next-line no-console
    console.log(`[gnAnchor] tris=${indices.length / 3} nRed=${anc.nRed} nSample=${anc.nSample} gnOver=${anc.gnOver} bruteOver=${anc.bruteOver} gnP99=${anc.gnP99.toFixed(4)} trustedP99=${anc.trustedP99.toFixed(4)} ratio=${ratio.toFixed(1)}x`);

    // (1) REPRODUCE F2: raw single-seed GN overstates the brute-trusted perp on the worst red facets (convene ~7×).
    expect(anc.nSample).toBeGreaterThan(10);            // Gyroid must produce steep red facets at this density
    expect(anc.gnOver).toBeGreaterThanOrEqual(10);      // many facets where raw GN overstates the brute floor (>0.1mm)
    expect(ratio).toBeGreaterThan(3);                   // multi-× overstatement (convene measured ~7× at this density)
    expect(anc.trustedP99).toBeLessThanOrEqual(anc.gnP99); // the anchor only ever takes the SMALLER distance

    // (2) ANCHOR TRUSTS BRUTE — independent reference via the exported primitive (no re-derivation of the twin):
    //     pure brute (coarse 2048×400 + fine 8192×1600 on aliasers) on the SAME worst-40 red facet centroids.
    const red: number[] = [];
    for (let f = 0; f < radial.faceErr.length; f++) if (radial.faceErr[f] > 0.1) red.push(f);
    red.sort((x, y) => radial.faceErr[y] - radial.faceErr[x]);
    const sample = red.slice(0, Math.min(40, red.length));
    const lift = (i: number): [number, number, number] => { const th = TAU * mesh.ut[2 * i], z = mesh.ut[2 * i + 1] * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const bruteOnly: number[] = [];
    let maxOver = -Infinity, moGn = 0, moBrute = 0; // the facet with the LARGEST GN-over-brute gap (the wrong-well signature)
    for (const f of sample) {
      const [ax, ay, az] = lift(indices[3 * f]), [bx, by, bz] = lift(indices[3 * f + 1]), [c0, c1, c2] = lift(indices[3 * f + 2]);
      const cx = (ax + bx + c0) / 3, cy = (ay + by + c1) / 3, cz = (az + bz + c2) / 3;
      const gn = projectPointToRadialSurface(cx, cy, cz, rA).dist;
      let br = bruteNearestOnRadialSurface(cx, cy, cz, rA, DIMS.H).dist;
      if (br - gn > 0.02) br = Math.min(br, bruteNearestOnRadialSurface(cx, cy, cz, rA, DIMS.H, { nTheta: 8192, nZ: 1600 }).dist);
      bruteOnly.push(br);
      if (gn - br > maxOver) { maxOver = gn - br; moGn = gn; moBrute = br; }
    }
    const s = Float64Array.from(bruteOnly).sort();
    const bruteOnlyP99 = s[Math.min(s.length - 1, Math.floor(0.99 * s.length))];
    // eslint-disable-next-line no-console
    console.log(`[gnAnchor] bruteOnlyP99=${bruteOnlyP99.toFixed(4)} worstWrongWell gn=${moGn.toFixed(4)} brute=${moBrute.toFixed(4)} over=${maxOver.toFixed(4)}`);

    // trusted = min(GN, brute) per facet ⇒ trustedP99 ≤ bruteOnlyP99, and they agree within tol (GN rarely beats brute).
    expect(anc.trustedP99).toBeLessThanOrEqual(bruteOnlyP99 + 1e-9);
    expect(bruteOnlyP99 - anc.trustedP99).toBeLessThan(0.03);
    expect(anc.gnP99).toBeGreaterThan(3 * bruteOnlyP99);          // raw GN overstates the independent brute too
    // concrete F2 signature on the worst wrong-well facet: single-seed GN overstates its true brute floor by a wide margin.
    expect(maxOver).toBeGreaterThan(0.1);
    expect(moBrute).toBeLessThan(moGn);
  }, 20 * 60 * 1000);
});
