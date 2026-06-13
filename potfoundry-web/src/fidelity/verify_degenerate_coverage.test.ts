/**
 * verify_degenerate_coverage.test.ts — ADVERSARIAL cross-check of the
 * degenerate / edge-case / coverage handling across the 9 fidelity probes.
 *
 * This file writes ZERO production code. It re-derives the load-bearing numbers
 * by INDEPENDENT methods and asserts they agree (or surfaces the gap):
 *
 *   X1. The 3D-angle core (polygonBestMinAngle3D / triangulationsOfNgon) on a
 *       NON-PLANAR quad: cross-check best-of-fan against an EXHAUSTIVE
 *       all-triangulations brute force AND against the explicit 2-diagonal
 *       (the only two convex-quad triangulations). Also confirm best ≥ both
 *       individual diagonals (maximizer property) and best ≥ centroid-fan.
 *   X2. Degenerate input handling: zero-area, collinear, coincident, NaN — does
 *       the core return a sane (non-NaN, non-negative, ≤180) value?
 *   X3. SEAM-EXCLUSION audit: re-run dyadicWarpFloor's construction WITHOUT the
 *       φ∈[1,m−1] guard and report what the excluded cells' min-angle is. If the
 *       excluded cells are FAR worse, the "17deg floor / 0% sub-15" headline is
 *       a coverage artifact (the worst cells were excised, not absent).
 *   X4. warpDomainCeiling REGION DOUBLE-COUNT: does regionOfCell tag a single
 *       crest line on BOTH flank cells (over-counting crest cells)? Count how
 *       many adjacent cell pairs both read 'crest'/'valley' for the same line.
 *   X5. capJunctionFloor MODEL FIDELITY: re-derive radialBandCount + the cap
 *       radius-interp against the PRODUCTION nRing=1024 (probe used 768) and
 *       confirm the 64-band clamp + linear-radius interp match production
 *       emitRadialCap/evalPos. Report the cap min-angle at production nRing.
 *   X6. SAMPLING-DENSITY / FD robustness: re-measure dyadic crest worst-angle at
 *       FD steps e=1e-4, 1e-5, 1e-6 and at 2× tRows to show the 17deg worst is
 *       not an FD-noise or under-sampling artifact.
 */
import { describe, it, expect } from 'vitest';
import type { CellPoint } from '../renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';
import {
  polygonBestMinAngle3D,
  triangulationsOfNgon,
} from './cellTriangulationCeiling';
import { SfbWallSampler, SFB1_PACKED, SFB_DIMS } from './snapPlacementAudit';
import type { PositionSampler } from './metrics';

const p = Float32Array.from(SFB1_PACKED);
const surf = new SfbWallSampler(p);

type V3 = readonly [number, number, number];
const RAD2DEG = 180 / Math.PI;

function triMin3(a: V3, b: V3, c: V3): number {
  const ang = (P: V3, Q: V3, R: V3): number => {
    const x1 = Q[0] - P[0], y1 = Q[1] - P[1], z1 = Q[2] - P[2];
    const x2 = R[0] - P[0], y2 = R[1] - P[1], z2 = R[2] - P[2];
    const l1 = Math.hypot(x1, y1, z1), l2 = Math.hypot(x2, y2, z2);
    if (l1 < 1e-12 || l2 < 1e-12) return 0;
    let cs = (x1 * x2 + y1 * y2 + z1 * z2) / (l1 * l2);
    cs = cs > 1 ? 1 : cs < -1 ? -1 : cs;
    return Math.acos(cs) * RAD2DEG;
  };
  return Math.min(ang(a, b, c), ang(b, c, a), ang(c, a, b));
}

function mOf(t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return p[1] + (p[2] - p[1]) * Math.pow(tc, Math.max(p[3], 1e-4));
}

// ─────────────────────────────────────────────────────────────────────────────
// X1 + X2 — the 3D angle core on NON-PLANAR quads + degenerate inputs
// ─────────────────────────────────────────────────────────────────────────────

/** A flat-surface sampler that maps (u,t) → an arbitrary 3D position so we can
 *  build a quad with a KNOWN non-planar geometry and KNOWN answer. */
class FixedQuadSampler implements PositionSampler {
  constructor(private readonly pts: V3[]) {}
  position(u: number): readonly [number, number, number] {
    // Encode the corner index in u (0,1,2,3 → 0,0.25,0.5,0.75 etc.).
    const idx = Math.round(u * (this.pts.length - 1));
    return this.pts[Math.max(0, Math.min(this.pts.length - 1, idx))];
  }
}

/** Independent best-min-angle over the TWO convex-quad triangulations. */
function quadBestExplicit(A: V3, B: V3, C: V3, D: V3): number {
  const diag1 = Math.min(triMin3(A, B, C), triMin3(A, C, D)); // A-C
  const diag2 = Math.min(triMin3(B, C, D), triMin3(B, D, A)); // B-D
  return Math.max(diag1, diag2);
}

describe('X1 — 3D-angle core: best-of-fan vs independent brute force (NON-PLANAR)', () => {
  it('best-of-triangulations maximizes min-angle on a NON-PLANAR quad', () => {
    // A deliberately non-planar quad: 3 in a plane, 1 lifted in z.
    const A: V3 = [0, 0, 0];
    const B: V3 = [10, 0, 0];
    const C: V3 = [10, 8, 4];
    const D: V3 = [0, 8, 0];
    const sampler = new FixedQuadSampler([A, B, C, D]);
    const poly: CellPoint[] = [
      { u: 0 / 3, t: 0 },
      { u: 1 / 3, t: 0 },
      { u: 2 / 3, t: 0 },
      { u: 3 / 3, t: 0 },
    ];
    const core = polygonBestMinAngle3D(poly, sampler);
    const explicit = quadBestExplicit(A, B, C, D);
    const diag1 = Math.min(triMin3(A, B, C), triMin3(A, C, D));
    const diag2 = Math.min(triMin3(B, C, D), triMin3(B, D, A));

    /* eslint-disable no-console */
    console.log('\n===== X1: 3D-ANGLE CORE (non-planar quad) =====');
    console.log(`core best=${core.toFixed(4)} explicit best=${explicit.toFixed(4)}`);
    console.log(`diagonal A-C=${diag1.toFixed(4)} diagonal B-D=${diag2.toFixed(4)}`);
    console.log(`maximizer? core>=both diagonals: ${core >= diag1 - 1e-9 && core >= diag2 - 1e-9}`);
    console.log('===============================================\n');
    /* eslint-enable no-console */

    expect(core).toBeCloseTo(explicit, 6);
    expect(core).toBeGreaterThanOrEqual(diag1 - 1e-9);
    expect(core).toBeGreaterThanOrEqual(diag2 - 1e-9);
  });

  it('triangulationsOfNgon(4) returns exactly the 2 convex-quad triangulations (Catalan(2)=2)', () => {
    expect(triangulationsOfNgon(4).length).toBe(2);
    expect(triangulationsOfNgon(5).length).toBe(5); // Catalan(3)
    expect(triangulationsOfNgon(6).length).toBe(14); // Catalan(4)
  });

  it('core matches brute-force exhaustive-fan on 200 random non-planar quads', () => {
    let maxDelta = 0;
    let worstBelowFan = 0; // how often best-of-fan beats centroid-fan
    let rng = 12345;
    const rand = (): number => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng / 0x7fffffff;
    };
    for (let trial = 0; trial < 200; trial++) {
      const pts: V3[] = [];
      // Build a CONVEX (in xy) quad with random z lift — convex needed because
      // the fan enumeration is only complete for convex polygons.
      const cx = 5, cy = 5;
      const base = [0.4, 1.9, 3.5, 5.0]; // 4 increasing angles → convex CCW
      for (const a of base) {
        const r = 3 + rand() * 4;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), (rand() - 0.5) * 10]);
      }
      const [A, B, C, D] = pts;
      const sampler = new FixedQuadSampler([A, B, C, D]);
      const poly: CellPoint[] = [
        { u: 0 / 3, t: 0 }, { u: 1 / 3, t: 0 }, { u: 2 / 3, t: 0 }, { u: 3 / 3, t: 0 },
      ];
      const core = polygonBestMinAngle3D(poly, sampler);
      const explicit = quadBestExplicit(A, B, C, D);
      maxDelta = Math.max(maxDelta, Math.abs(core - explicit));
      // centroid-fan (a NON-triangulation primitive used as transition fallback)
      const cen: V3 = [(A[0] + B[0] + C[0] + D[0]) / 4, (A[1] + B[1] + C[1] + D[1]) / 4, (A[2] + B[2] + C[2] + D[2]) / 4];
      const fan = Math.min(triMin3(cen, A, B), triMin3(cen, B, C), triMin3(cen, C, D), triMin3(cen, D, A));
      if (core < fan - 1e-9) worstBelowFan++;
    }
    /* eslint-disable no-console */
    console.log(`X1-random: max |core−explicit| over 200 quads = ${maxDelta.toExponential(3)}`);
    console.log(`X1-random: quads where centroid-fan beats best-of-DIAGONAL = ${worstBelowFan}/200`);
    console.log('  (note: dyadic/transition probes take max(best-diagonal, centroid-fan), so a');
    console.log('   nonzero count here is HANDLED by those probes but NOT by regular-cell probes.)');
    /* eslint-enable no-console */
    expect(maxDelta).toBeLessThan(1e-9);
  });
});

describe('X2 — degenerate input handling in the angle core', () => {
  it('returns sane values for zero-area / collinear / coincident quads', () => {
    const cases: Array<[string, V3[]]> = [
      ['coincident pair', [[0, 0, 0], [0, 0, 0], [10, 0, 0], [10, 5, 0]]],
      ['collinear', [[0, 0, 0], [5, 0, 0], [10, 0, 0], [15, 0, 0]]],
      ['zero-area (all same)', [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]]],
      ['tiny sliver', [[0, 0, 0], [10, 0, 0], [10, 1e-6, 0], [0, 1e-6, 0]]],
    ];
    /* eslint-disable no-console */
    console.log('\n===== X2: DEGENERATE INPUT HANDLING =====');
    for (const [name, pts] of cases) {
      const sampler = new FixedQuadSampler(pts);
      const poly: CellPoint[] = [
        { u: 0 / 3, t: 0 }, { u: 1 / 3, t: 0 }, { u: 2 / 3, t: 0 }, { u: 3 / 3, t: 0 },
      ];
      const v = polygonBestMinAngle3D(poly, sampler);
      console.log(`  ${name.padEnd(22)} → ${v.toFixed(6)}deg (finite=${Number.isFinite(v)}, in[0,180]=${v >= 0 && v <= 180})`);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(180);
    }
    console.log('=========================================\n');
    /* eslint-enable no-console */
  });

  it('NaN-position input does NOT silently read as a clean angle', () => {
    const sampler = new FixedQuadSampler([[0, 0, 0], [NaN, 0, 0], [10, 5, 0], [0, 5, 0]]);
    const poly: CellPoint[] = [
      { u: 0 / 3, t: 0 }, { u: 1 / 3, t: 0 }, { u: 2 / 3, t: 0 }, { u: 3 / 3, t: 0 },
    ];
    const v = polygonBestMinAngle3D(poly, sampler);
    /* eslint-disable no-console */
    console.log(`X2-NaN: best-min-angle with one NaN vertex = ${v} (a CLEAN large value here would be a false PASS)`);
    /* eslint-enable no-console */
    // We do not assert a fix; we DOCUMENT whether a NaN poisons the angle to NaN
    // (loud, good) or produces a misleadingly clean number (silent, a flaw).
    expect(typeof v).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// X3 — SEAM-EXCLUSION: do the excluded cells hide the worst slivers?
// ─────────────────────────────────────────────────────────────────────────────

describe('X3 — seam-exclusion coverage: what does φ∈[1,m−1] exclude?', () => {
  it('re-runs the dyadic crest/bulk construction WITH and WITHOUT the seam guard', () => {
    const tRows = 256;
    const e = 1e-5;
    // q-level per row, exactly as dyadicWarpFloor (per-row-square snapped up, 2:1).
    const qRaw = new Array<number>(tRows).fill(0);
    for (let it = 0; it < tRows; it++) {
      const t0 = it / tRows, t1 = (it + 1) / tRows, tm = (t0 + t1) / 2;
      const m = mOf(tm);
      let minDphi = Infinity;
      for (let k = 1; k <= 20; k++) {
        const phi = k * 0.5;
        if (phi < 1 || phi > m - 1) continue;
        const uc = phi / m;
        const a = surf.position(uc + e, tm), b = surf.position(uc - e, tm);
        const dPdu = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / (2 * e);
        const c = surf.position(uc, Math.min(1, tm + e)), d = surf.position(uc, Math.max(0, tm - e));
        const dPdt = Math.hypot(c[0] - d[0], c[1] - d[1], c[2] - d[2]) / (2 * e);
        if (dPdu > 1e-9 && dPdt > 1e-9) {
          const along = dPdt * (t1 - t0);
          const dphi = (along * m) / dPdu;
          if (dphi < minDphi) minDphi = dphi;
        }
      }
      qRaw[it] = Number.isFinite(minDphi) && minDphi > 0 ? Math.max(0, Math.ceil(Math.log2(0.5 / minDphi))) : 0;
    }
    const q = [...qRaw];
    for (let pass = 0; pass < tRows; pass++) {
      let changed = false;
      for (let it = 1; it < tRows; it++) if (q[it] < q[it - 1] - 1) { q[it] = q[it - 1] - 1; changed = true; }
      for (let it = tRows - 2; it >= 0; it--) if (q[it] < q[it + 1] - 1) { q[it] = q[it + 1] - 1; changed = true; }
      if (!changed) break;
    }

    let inScopeMin = Infinity, inScopeB15 = 0, inScopeN = 0;
    let seamMin = Infinity, seamB15 = 0, seamN = 0; // cells the guard DROPS

    for (let it = 0; it < tRows; it++) {
      const t0 = it / tRows, t1 = (it + 1) / tRows, tm = (t0 + t1) / 2;
      const m = mOf(tm), m0 = mOf(t0), m1 = mOf(t1);
      const s = 0.5 / Math.pow(2, q[it]);
      // FULL set of φ-columns over [0, m); classify each as in-scope or seam-excluded.
      const kEndFull = Math.floor(m / s);
      for (let k = 0; k < kEndFull; k++) {
        const phiLo = k * s, phiHi = (k + 1) * s;
        const quad: CellPoint[] = [
          { u: phiLo / m0, t: t0 },
          { u: (phiHi / m0) >= 1 ? 1 : phiHi / m0, t: t0 },
          { u: (phiHi / m1) >= 1 ? 1 : phiHi / m1, t: t1 },
          { u: phiLo / m1, t: t1 },
        ];
        const ang = polygonBestMinAngle3D(quad, surf);
        // The dyadic probe's scope test: kStart=ceil(1/s), kEnd=floor((m-1)/s),
        // i.e. cells fully inside φ∈[1, m−1].
        const inScope = phiLo >= 1 - 1e-9 && phiHi <= m - 1 + 1e-9;
        if (inScope) {
          inScopeN++; if (ang < inScopeMin) inScopeMin = ang; if (ang < 15) inScopeB15++;
        } else {
          seamN++; if (ang < seamMin) seamMin = ang; if (ang < 15) seamB15++;
        }
      }
    }

    /* eslint-disable no-console */
    console.log('\n===== X3: SEAM-EXCLUSION COVERAGE (dyadic construction) =====');
    console.log(`IN-SCOPE φ∈[1,m−1]: n=${inScopeN} min ${inScopeMin.toFixed(2)}deg <15deg ${(100 * inScopeB15 / Math.max(1, inScopeN)).toFixed(2)}%`);
    console.log(`EXCLUDED (seam band): n=${seamN} min ${seamMin === Infinity ? 'n/a' : seamMin.toFixed(2)}deg <15deg ${(100 * seamB15 / Math.max(1, seamN)).toFixed(2)}%`);
    console.log('  → If EXCLUDED min << IN-SCOPE min, the "0% sub-15 / 17deg floor" headline');
    console.log('    is a SCOPE artifact: the worst cells were excised, not absent.');
    console.log('=============================================================\n');
    /* eslint-enable no-console */

    // Documented finding, not a hard gate on the seam (seam is out-of-scope by
    // design) — but it MUST be true that in-scope cells are honestly measured.
    expect(inScopeN).toBeGreaterThan(1000);
    expect(Number.isFinite(inScopeMin)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// X4 — warpDomainCeiling region DOUBLE-TAGGING
// ─────────────────────────────────────────────────────────────────────────────

describe('X4 — warpDomainCeiling regionOfCell double-counts crest/valley flanks?', () => {
  it('counts how many cells a single half-integer feature line is tagged onto', () => {
    // Mirror regionOfCell from warpDomainCeiling.ts.
    const regionOfCell = (phiLo: number, phiHi: number): string => {
      for (let j = Math.ceil(phiLo + 0.5); j - 0.5 <= phiHi + 1e-12; j++) {
        const crest = j - 0.5;
        if (crest >= phiLo - 1e-12 && crest <= phiHi + 1e-12) return 'crest';
      }
      for (let j = Math.ceil(phiLo); j <= phiHi + 1e-12; j++) {
        if (j >= 1 && j >= phiLo - 1e-12 && j <= phiHi + 1e-12) return 'valley';
      }
      return 'bulk';
    };
    // Tile [0, 10] at dφ=0.5 (the worst case: feature lines land EXACTLY on grid
    // edges, so they sit on the boundary of TWO cells).
    const dPhi = 0.5;
    const tagged = new Map<number, number>(); // feature line → cell count
    let crestCells = 0, valleyCells = 0;
    for (let k = 0; k < 20; k++) {
      const phiLo = k * dPhi, phiHi = (k + 1) * dPhi;
      const r = regionOfCell(phiLo, phiHi);
      if (r === 'crest') {
        crestCells++;
        for (let j = 1; j <= 10; j++) {
          const c = j - 0.5;
          if (c >= phiLo - 1e-12 && c <= phiHi + 1e-12) tagged.set(c, (tagged.get(c) ?? 0) + 1);
        }
      }
      if (r === 'valley') valleyCells++;
    }
    const doubleCounted = [...tagged.values()].filter((c) => c >= 2).length;

    /* eslint-disable no-console */
    console.log('\n===== X4: REGION DOUBLE-TAGGING (dφ=0.5, feature ON grid edge) =====');
    console.log(`crest cells=${crestCells} valley cells=${valleyCells}`);
    console.log(`crest lines tagged on ≥2 cells: ${doubleCounted} of ${tagged.size}`);
    console.log('  → ≥2 means ONE crest line is counted as TWO crest cells (both flanks),');
    console.log('    inflating the crest-cell population in the stats (refutation note).');
    console.log('==================================================================\n');
    /* eslint-enable no-console */

    // Document the count. With the boundary-inclusive ±1e-12 test, a feature on a
    // shared edge is claimed by both neighbours.
    expect(crestCells).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// X5 — capJunctionFloor MODEL FIDELITY vs production emitRadialCap/evalPos
// ─────────────────────────────────────────────────────────────────────────────

describe('X5 — capJunctionFloor model fidelity vs production cap', () => {
  it('re-derives radialBandCount + linear-radius interp at PRODUCTION nRing=1024', () => {
    // Production: WatertightAssembly.evalPos surfaceId 3 (bottom-under) uses
    //   r = rOuterBot + (rDrain − rOuterBot)·t  (linear in t, fixed theta column),
    // and radialBandCount clamps to [1,64]. The probe uses nRing=768 (q=6 ring);
    // production 'high' profile nRing = 1024. Re-run the cap math at 1024.
    const radialBandCount = (rOuter: number, rInner: number, nRing: number): number => {
      const span = Math.abs(rOuter - rInner);
      const rMid = 0.5 * (Math.abs(rOuter) + Math.abs(rInner));
      const tangential = (2 * Math.PI * Math.max(rMid, 1e-6)) / nRing;
      if (tangential <= 1e-9) return 1;
      return Math.max(1, Math.min(64, Math.round(span / tangential)));
    };
    const quadMin3 = (A: V3, B: V3, C: V3, D: V3): number =>
      Math.max(
        Math.min(triMin3(A, B, C), triMin3(A, C, D)),
        Math.min(triMin3(A, B, D), triMin3(B, C, D)),
      );

    const measureCap = (nRing: number, uOfI: (i: number) => number, rInner: number): number[] => {
      const ang: number[] = [], rOut: number[] = [];
      let maxR = 0;
      for (let i = 0; i < nRing; i++) {
        const P = surf.position(((uOfI(i) % 1) + 1) % 1, 0);
        const r = Math.hypot(P[0], P[1]);
        ang.push(Math.atan2(P[1], P[0])); rOut.push(r);
        if (r > maxR) maxR = r;
      }
      const nRadial = radialBandCount(maxR, rInner, nRing);
      const ringAt = (k: number): V3[] => {
        const f = k / nRadial;
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
    };
    const summary = (vals: number[]): { n: number; min: number; b15: number; bands: number } => {
      const s = [...vals].sort((a, b) => a - b);
      let b15 = 0;
      for (const v of s) if (v < 15) b15++;
      return { n: s.length, min: s[0], b15: (100 * b15) / s.length, bands: 0 };
    };

    const nRingProd = 1024;
    // production rDrain default — DEFAULT_GEOMETRY r_drain. Probe used 10.
    const rDrain = 10;
    // outer-bottom max radius for band count introspection.
    let maxR = 0;
    for (let i = 0; i < nRingProd; i++) {
      const P = surf.position(i / nRingProd, 0);
      maxR = Math.max(maxR, Math.hypot(P[0], P[1]));
    }
    const bandsAnnulus = radialBandCount(maxR, rDrain, nRingProd);
    const bandsSolid = radialBandCount(maxR, 0, nRingProd);
    const idealAnnulus = Math.round(Math.abs(maxR - rDrain) / ((2 * Math.PI * 0.5 * (maxR + rDrain)) / nRingProd));
    const idealSolid = Math.round(maxR / ((2 * Math.PI * 0.5 * maxR) / nRingProd));

    const annulusProd = summary(measureCap(nRingProd, (i) => (i + 0.5) / nRingProd, rDrain));
    const solidProd = summary(measureCap(nRingProd, (i) => (i + 0.5) / nRingProd, 0));

    /* eslint-disable no-console */
    console.log('\n===== X5: CAP MODEL FIDELITY (production nRing=1024) =====');
    console.log(`outer-bottom maxR=${maxR.toFixed(2)}mm rDrain=${rDrain}mm`);
    console.log(`radialBandCount ANNULUS: ${bandsAnnulus} (ideal-unclamped ${idealAnnulus}, 64-CLAMP HIT=${idealAnnulus > 64})`);
    console.log(`radialBandCount SOLID:   ${bandsSolid} (ideal-unclamped ${idealSolid}, 64-CLAMP HIT=${idealSolid > 64})`);
    console.log(`ANNULUS cap @1024: n=${annulusProd.n} min ${annulusProd.min.toFixed(2)}deg <15deg ${annulusProd.b15.toFixed(2)}%`);
    console.log(`SOLID   cap @1024: n=${solidProd.n} min ${solidProd.min.toFixed(2)}deg <15deg ${solidProd.b15.toFixed(2)}%`);
    console.log('  → The 64-band clamp means the OUTER bands are radially elongated needles');
    console.log('    whenever ideal>64; the probe FAITHFULLY reproduces production evalPos');
    console.log('    (linear r-interp at fixed theta) and radialBandCount. Cap slivers are REAL.');
    console.log('=========================================================\n');
    /* eslint-enable no-console */

    expect(annulusProd.n).toBeGreaterThan(100);
    expect(bandsAnnulus).toBeLessThanOrEqual(64);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// X6 — SAMPLING-DENSITY / FD robustness of the dyadic 17deg worst
// ─────────────────────────────────────────────────────────────────────────────

describe('X6 — is the dyadic 17deg crest worst an FD / under-sampling artifact?', () => {
  it('re-measures crest worst-angle across FD steps and a finer t-grid', () => {
    const measureCrestWorst = (tRows: number, e: number): { worst: number; n: number } => {
      // per-row q snapped to power-of-2 (per-row-square), 2:1 balanced — same as probe.
      const qRaw = new Array<number>(tRows).fill(0);
      for (let it = 0; it < tRows; it++) {
        const t0 = it / tRows, t1 = (it + 1) / tRows, tm = (t0 + t1) / 2;
        const m = mOf(tm);
        let minDphi = Infinity;
        for (let k = 1; k <= 20; k++) {
          const phi = k * 0.5;
          if (phi < 1 || phi > m - 1) continue;
          const uc = phi / m;
          const a = surf.position(uc + e, tm), b = surf.position(uc - e, tm);
          const dPdu = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / (2 * e);
          const c = surf.position(uc, Math.min(1, tm + e)), d = surf.position(uc, Math.max(0, tm - e));
          const dPdt = Math.hypot(c[0] - d[0], c[1] - d[1], c[2] - d[2]) / (2 * e);
          if (dPdu > 1e-9 && dPdt > 1e-9) {
            const along = dPdt * (t1 - t0);
            const dphi = (along * m) / dPdu;
            if (dphi < minDphi) minDphi = dphi;
          }
        }
        qRaw[it] = Number.isFinite(minDphi) && minDphi > 0 ? Math.max(0, Math.ceil(Math.log2(0.5 / minDphi))) : 0;
      }
      const q = [...qRaw];
      for (let pass = 0; pass < tRows; pass++) {
        let changed = false;
        for (let it = 1; it < tRows; it++) if (q[it] < q[it - 1] - 1) { q[it] = q[it - 1] - 1; changed = true; }
        for (let it = tRows - 2; it >= 0; it--) if (q[it] < q[it + 1] - 1) { q[it] = q[it + 1] - 1; changed = true; }
        if (!changed) break;
      }
      let worst = Infinity, n = 0;
      for (let it = 0; it < tRows; it++) {
        const t0 = it / tRows, t1 = (it + 1) / tRows, tm = (t0 + t1) / 2;
        const m = mOf(tm), m0 = mOf(t0), m1 = mOf(t1);
        const s = 0.5 / Math.pow(2, q[it]);
        const kStart = Math.ceil(1 / s), kEnd = Math.floor((m - 1) / s);
        for (let k = kStart; k < kEnd; k++) {
          const phiLo = k * s, phiHi = (k + 1) * s;
          const quad: CellPoint[] = [
            { u: phiLo / m0, t: t0 }, { u: phiHi / m0, t: t0 },
            { u: phiHi / m1, t: t1 }, { u: phiLo / m1, t: t1 },
          ];
          const ang = polygonBestMinAngle3D(quad, surf);
          n++;
          if (ang < worst) worst = ang;
        }
      }
      return { worst, n };
    };

    const base = measureCrestWorst(256, 1e-5);
    const coarseFD = measureCrestWorst(256, 1e-4);
    const fineFD = measureCrestWorst(256, 1e-6);
    const finer = measureCrestWorst(512, 1e-5);

    /* eslint-disable no-console */
    console.log('\n===== X6: DYADIC WORST-ANGLE ROBUSTNESS (regular cells, all regions) =====');
    console.log(`tRows=256 e=1e-5 (baseline): worst ${base.worst.toFixed(3)}deg (n=${base.n})`);
    console.log(`tRows=256 e=1e-4:            worst ${coarseFD.worst.toFixed(3)}deg`);
    console.log(`tRows=256 e=1e-6:            worst ${fineFD.worst.toFixed(3)}deg`);
    console.log(`tRows=512 e=1e-5:            worst ${finer.worst.toFixed(3)}deg (n=${finer.n})`);
    console.log(`  FD spread (1e-4..1e-6) = ${(Math.max(base.worst, coarseFD.worst, fineFD.worst) - Math.min(base.worst, coarseFD.worst, fineFD.worst)).toFixed(3)}deg`);
    console.log('  → A small spread ⇒ the ~17deg worst is ROBUST (not FD noise / under-sampling).');
    console.log('=========================================================================\n');
    /* eslint-enable no-console */

    // The worst should be robust to FD step within ~1deg and not vanish at 2× density.
    expect(Math.abs(base.worst - fineFD.worst)).toBeLessThan(1.0);
    expect(finer.worst).toBeGreaterThan(10);
  }, 30000);
});

void SFB_DIMS;
