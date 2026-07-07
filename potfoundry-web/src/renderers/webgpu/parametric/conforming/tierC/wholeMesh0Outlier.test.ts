import { describe, it, expect } from 'vitest';
import { GpuSurfaceSampler } from '../SurfaceSampler';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import { refineToZeroOutliers, type ChartDomain } from './noBridgeRefine';
import {
  DEFAULT_RULER,
  denseBary,
  facetInteriorHonest,
  liftChartMesh,
  radialSurfaceFromSampler,
  scoreWholeMesh,
} from './interiorRuler';
import cdt2d from 'cdt2d';

// ── index-based non-manifold audit (mirrors the labkit ruler): an interior
// edge shared by >2 triangles is non-manifold. Boundary edges (1 tri) are
// legitimate on a patch.
function nonManifoldByIndex(tris: number[]): number {
  const use = new Map<string, number>();
  for (let f = 0; f < tris.length / 3; f++) {
    const a = tris[3 * f];
    const b = tris[3 * f + 1];
    const c = tris[3 * f + 2];
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const k = i < j ? `${i}_${j}` : `${j}_${i}`;
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const n of use.values()) if (n > 2) bad++;
  return bad;
}

const SMOKE_TIMEOUT_MS = 10 * 60 * 1000;
// A SYNCHRONOUS vitest test cannot be interrupted mid-run — the timeout only
// fires when the fn yields. Size it to the honest job (the full Gothic gate
// is a multi-hour single-thread brute grind), or the whole run is wasted:
// the work completes and is then retroactively marked failed. Measured the
// hard way (5h run discarded at a 1h timeout).
const FULL_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const FULL = process.env.PF_TIERC_WHOLEMESH === '1';

function runPatchGate(
  styleId: 'GothicArches' | 'GeometricStar',
  domain: ChartDomain,
  bgArcMm: number,
  nTheta: number,
): void {
  const sampler = styleSampler(styleId, {}, { H: 120, Rt: 50, Rb: 40 });
  const complex = buildProtectedComplex(sampler, styleId);
  expect(complex.residualCrossings).toBe(0);

  const ruler = { ...DEFAULT_RULER, nTheta };
  const refined = refineToZeroOutliers(
    sampler,
    complex,
    domain,
    {
      tolMm: 0.01,
      maxPass: 16,
      bulkPasses7pt: 4,
      bgArcMm,
      ruler,
    },
    (s) => {
      // Liveness + resumable diagnostics for the multi-hour full gates.
      // eslint-disable-next-line no-console
      console.log(
        `[tierC ${styleId} pass ${s.pass}${s.dense ? ' DENSE' : ' 7pt'}] ` +
          `tris=${s.nTris} out=${s.outliers} worst=${s.worstMm.toFixed(5)} ` +
          `inserted=${s.inserted} brute=${s.bruteCalls} ${(s.ms / 1000).toFixed(0)}s`,
      );
    },
  );
  expect(refined.capped).toBe(false);

  // MANDATORY whole-mesh guard: EVERY facet, dense 45-pt honest ruler.
  const surface = radialSurfaceFromSampler(sampler);
  const score = scoreWholeMesh(sampler, surface, refined, 0.01, ruler);
  expect(score.nFacets).toBe(refined.tris.length / 3); // no population cap
  expect(score.outliers).toBe(0);
  expect(score.maxMm).toBeLessThanOrEqual(0.0101);

  // Watertight by index, NON-VACUOUS: injecting a 3rd triangle on an
  // existing edge must move the count.
  const nonMan = nonManifoldByIndex(refined.tris);
  expect(nonMan).toBe(0);
  const cracked = refined.tris.slice();
  cracked.push(refined.tris[0], refined.tris[1], refined.tris[2]);
  expect(nonManifoldByIndex(cracked)).toBeGreaterThan(nonMan);
}

describe('Tier-C whole-mesh 0-outlier refine (the fidelity core)', () => {
  it(
    'Gothic smoke patch: literal whole-mesh 0 interior outliers + watertight',
    () => {
      runPatchGate(
        'GothicArches',
        { uLo: 0, uHi: 0.125, tLo: 0.48, tHi: 0.52 },
        0.6,
        512,
      );
    },
    SMOKE_TIMEOUT_MS,
  );

  it.skipIf(!FULL)(
    'FULL Gothic patch gate (PF_TIERC_WHOLEMESH=1)',
    () => {
      runPatchGate(
        'GothicArches',
        { uLo: 0, uHi: 0.25, tLo: 0.45, tHi: 0.55 },
        0.35,
        1024,
      );
    },
    FULL_TIMEOUT_MS,
  );

  it.skipIf(!FULL)(
    'FULL GeoStar patch gate (PF_TIERC_WHOLEMESH=1)',
    () => {
      runPatchGate(
        'GeometricStar',
        { uLo: 0, uHi: 0.25, tLo: 0.45, tHi: 0.55 },
        0.35,
        1024,
      );
    },
    FULL_TIMEOUT_MS,
  );
});

// ── The banked-mandate regression: a top-N-gradU guard population reads 0
// while the whole-mesh count is >0 (the VALIDATION-7/9 blind spot). The
// production API exposes ONLY whole-mesh scoring; this test proves why.
describe('top-N-gradU guard blindness (banked mandate)', () => {
  it('a low-gradU apex facet hides from top-N but not from whole-mesh', () => {
    // Synthetic cylinder r=50 with a sharp 2mm gaussian bump at (0.5, 0.5).
    const R = 50;
    const H = 40;
    const AMP = 2;
    const SIGMA = 1.5; // mm
    const TAU = 2 * Math.PI;
    const C = TAU * R;
    const rOf = (u: number, t: number): number => {
      let du = u - 0.5;
      while (du > 0.5) du -= 1;
      while (du < -0.5) du += 1;
      const dxMm = du * C;
      const dzMm = (t - 0.5) * H;
      return R + AMP * Math.exp(-(dxMm * dxMm + dzMm * dzMm) / (2 * SIGMA * SIGMA));
    };
    const RES_U = 1024;
    const RES_T = 256;
    const grid = new Float32Array(RES_U * RES_T * 3);
    for (let row = 0; row < RES_T; row++) {
      const t = row / (RES_T - 1);
      for (let col = 0; col < RES_U; col++) {
        const u = col / RES_U;
        const r = rOf(u, t);
        const base = (row * RES_U + col) * 3;
        grid[base] = r * Math.cos(TAU * u);
        grid[base + 1] = r * Math.sin(TAU * u);
        grid[base + 2] = t * H;
      }
    }
    const sampler = new GpuSurfaceSampler(grid, RES_U, RES_T);
    const surface = radialSurfaceFromSampler(sampler);

    // DENSE mesh everywhere EXCEPT a hole around the apex → one big
    // apex-spanning facet with near-zero centroid gradU (symmetric peak)
    // and a large interior chord; the dense flanks have the HIGH gradU but
    // tiny deviation. Exactly the artifact geometry.
    // Pitch fine enough that flank facets are sub-tolerance (κ≈0.9/mm →
    // sag ≈ κL²/8 ≈ 0.007mm at 0.25mm); hole small enough that the apex
    // facets' centroids stay on the LOW-gradU peak plateau (d ≲ 0.5mm,
    // gradU ≈ 0.4) while the σ-ring flank facets carry gradU ≈ 0.8 — so
    // top-N-by-gradU scores clean flanks and never the apex outlier.
    const uv: number[] = [];
    const pitchMm = 0.25;
    const U_SPAN = 0.03; // ±4.7mm around the bump
    const T_SPAN = 0.24; // ±4.8mm
    const nu = Math.round((U_SPAN * C) / pitchMm);
    const nt = Math.round((T_SPAN * H) / pitchMm);
    for (let i = 0; i <= nu; i++) {
      for (let k = 0; k <= nt; k++) {
        const u = 0.5 - U_SPAN / 2 + U_SPAN * (i / nu);
        const t = 0.5 - T_SPAN / 2 + T_SPAN * (k / nt);
        const dxMm = (u - 0.5) * C;
        const dzMm = (t - 0.5) * H;
        if (Math.hypot(dxMm, dzMm) < 0.8) continue; // the apex hole
        uv.push(u, t);
      }
    }
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < uv.length / 2; i++) {
      pts.push([uv[2 * i] * C, uv[2 * i + 1] * H]);
    }
    const trisRaw = cdt2d(pts, [], { exterior: true }) as number[][];
    const tris: number[] = [];
    for (const tr of trisRaw) tris.push(tr[0], tr[1], tr[2]);

    // Whole-mesh: the apex facet IS an outlier.
    const whole = scoreWholeMesh(sampler, surface, { uv, tris }, 0.01);
    expect(whole.outliers).toBeGreaterThan(0);

    // Top-N-by-gradU population (N=12): reads ZERO outliers — blind.
    const xyz = liftChartMesh(sampler, uv);
    const nF = tris.length / 3;
    const du = 1 / 8192;
    const gradU = new Float64Array(nF);
    for (let f = 0; f < nF; f++) {
      const a = tris[3 * f];
      const b = tris[3 * f + 1];
      const c = tris[3 * f + 2];
      const um = (uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3;
      const tm = (uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3;
      const z = tm * H;
      const wrap = (x: number): number => ((x % 1) + 1) % 1;
      gradU[f] =
        Math.abs(
          surface.rA(TAU * wrap(um + du), z) - surface.rA(TAU * wrap(um - du), z),
        ) /
        (2 * du * TAU);
    }
    const order = Array.from({ length: nF }, (_, i) => i).sort(
      (x, y) => gradU[y] - gradU[x],
    );
    const dense = denseBary(8);
    let topNOutliers = 0;
    for (const f of order.slice(0, 12)) {
      const g = facetInteriorHonest(
        surface,
        xyz,
        uv,
        tris[3 * f],
        tris[3 * f + 1],
        tris[3 * f + 2],
        dense,
        DEFAULT_RULER,
      );
      if (g.dev > 0.01) topNOutliers++;
    }
    expect(topNOutliers).toBe(0); // the blind guard
  }, 5 * 60 * 1000);
});
