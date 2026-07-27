// _strataFacetTruthValidate.test.ts — VALIDATE THE RULER BEFORE TRUSTING ANY VERDICT.
// Gated PF_STRATA_FTV=1. RESEARCH ONLY.
//
// The STRATA-001 scorecard was produced by a ruler nobody had validated against a known answer. This file
// refuses to repeat that: every claim `_facetTruthLib` makes is checked here against either a CLOSED-FORM
// value or a deliberately constructed defect of known size, on synthetic surfaces where the truth is not in
// dispute. If these fail, no measurement made with this instrument means anything.
//
//   V1  cylinder chord sagitta        — H1 against the exact R(1-cos(dth/2))
//   V2  H1 monotone + bound soundness — bound >= witnessed, and the bound tightens as n rises
//   V3  H1 is BLIND to a missing ridge — proves H1 alone cannot audit this pipeline (the reason H2 exists)
//   V4  H2 finds a ridge the mesh never represents, to its true height
//   V5  THE BLIND SPOT ITSELF         — a feature narrower than the old ruler's 0.03 mm pitch: the old
//                                       ruler reads ~0, H2 reads the full relief
//   V6  agreement on an honest mesh   — a mesh that DOES resolve the ridge reads small in both directions,
//                                       so V4/V5 are detecting the defect and not an instrument bias
import { describe, it, expect } from 'vitest';
import { certifyTriangle, covRadius, detectZJumps, distRadial, pickLocatorCell, surfaceToMeshMax, type RadiusFn } from './_facetTruthLib';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';

const RUN = process.env.PF_STRATA_FTV === '1';
const TAU = 2 * Math.PI;
const H = 120;
const R0 = 45;

/** Plain cylinder. */
const cylinder: RadiusFn = () => R0;

/**
 * Cylinder + one vertical ridge at theta=thc of angular half-width `half` and height `amp`.
 * Triangular profile, so the crest is a genuine C1 crease of exactly known height.
 */
function ridged(thc: number, half: number, amp: number): RadiusFn {
  return (th: number) => {
    let d = th - thc;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    const a = Math.abs(d);
    return a >= half ? R0 : R0 + amp * (1 - a / half);
  };
}

/**
 * Structured theta x z mesh of a radial surface, with the theta columns given explicitly. Passing columns
 * that straddle a ridge without landing on its crest is how a "feature-spanning facet" is constructed.
 */
function structuredMesh(rA: RadiusFn, cols: number[], nZ: number): RefMesh {
  const nT = cols.length;
  const nRow = nZ + 1;
  const xyz = new Float64Array(nT * nRow * 3);
  for (let j = 0; j < nRow; j += 1) {
    const z = (H * j) / nZ;
    for (let i = 0; i < nT; i += 1) {
      const th = cols[i];
      const r = rA(th, z);
      const o = (j * nT + i) * 3;
      xyz[o] = r * Math.cos(th); xyz[o + 1] = r * Math.sin(th); xyz[o + 2] = z;
    }
  }
  const idx = new Uint32Array(nZ * nT * 6);
  let k = 0;
  for (let j = 0; j < nZ; j += 1) {
    for (let i = 0; i < nT; i += 1) {
      const i1 = (i + 1) % nT;
      const a = j * nT + i; const b = j * nT + i1; const c = (j + 1) * nT + i; const d = (j + 1) * nT + i1;
      idx[k] = a; idx[k + 1] = b; idx[k + 2] = d; k += 3;
      idx[k] = a; idx[k + 1] = d; idx[k + 2] = c; k += 3;
    }
  }
  return { xyz, idx, nV: nT * nRow, nF: nZ * nT * 2 };
}

/** The old ruler, re-implemented faithfully: plane distance on a fixed lattice, n = clamp(le/0.03, 12, 64). */
function oldRulerMax(rA: RadiusFn, mesh: RefMesh): number {
  const { xyz, idx, nF } = mesh;
  let worst = 0;
  for (let f = 0; f < nF; f += 1) {
    const ia = idx[f * 3] * 3; const ib = idx[f * 3 + 1] * 3; const ic = idx[f * 3 + 2] * 3;
    const ax = xyz[ia]; const ay = xyz[ia + 1]; const az = xyz[ia + 2];
    const bx = xyz[ib]; const by = xyz[ib + 1]; const bz = xyz[ib + 2];
    const cx = xyz[ic]; const cy = xyz[ic + 1]; const cz = xyz[ic + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-18) continue;
    nx /= nl; ny /= nl; nz /= nl;
    const le = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
    const n = Math.max(12, Math.min(64, Math.ceil(le / 0.03)));
    const tA = Math.atan2(ay, ax);
    const un = (x: number): number => { let d = x - tA; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
    const dB = un(Math.atan2(by, bx)); const dC = un(Math.atan2(cy, cx));
    for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n - i; j += 1) {
      const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
      const th = tA + wb * dB + wc * dC;
      const z = wa * az + wb * bz + wc * cz;
      const r = rA(th, z);
      const dd = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
      if (dd > worst) worst = dd;
    }
  }
  return worst;
}

/**
 * H1 witnessed max for a single facet that spans [thc-halfSpan, thc+halfSpan] with its vertices sitting on
 * the surface — i.e. a "feature-spanning facet" built on purpose.
 */
function certifyTriangleAcross(rA: RadiusFn, thc: number, halfSpan: number): number {
  const th0 = thc - halfSpan; const th1 = thc + halfSpan;
  const r0 = rA(th0, 50); const r1 = rA(th1, 50); const r2 = rA(th0, 51);
  return certifyTriangle(rA,
    r0 * Math.cos(th0), r0 * Math.sin(th0), 50,
    r1 * Math.cos(th1), r1 * Math.sin(th1), 50,
    r2 * Math.cos(th0), r2 * Math.sin(th0), 51,
    { H, tol: 0.01, nMax: 4096 }).witnessed;
}

describe('facet-truth ruler validation', () => {
  it.runIf(RUN)('V1: H1 reproduces the closed-form cylinder chord sagitta', () => {
    const dth = 0.02;
    const th0 = 0.3; const th1 = th0 + dth;
    const a: [number, number, number] = [R0 * Math.cos(th0), R0 * Math.sin(th0), 40];
    const b: [number, number, number] = [R0 * Math.cos(th1), R0 * Math.sin(th1), 40];
    const thm = 0.5 * (th0 + th1);
    const c: [number, number, number] = [R0 * Math.cos(thm), R0 * Math.sin(thm), 41];
    // deepest point is the midpoint of the a-b chord; nearest cylinder point is radially outward
    const exact = R0 * (1 - Math.cos(dth / 2));
    const v = certifyTriangle(cylinder, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
      { H, tol: 1e-7, nMax: 256 });
    // eslint-disable-next-line no-console
    console.log(`V1 exact ${(exact * 1000).toFixed(6)} um   witnessed ${(v.witnessed * 1000).toFixed(6)} um   n=${v.n}`);
    expect(Math.abs(v.witnessed - exact) / exact).toBeLessThan(0.01);
    expect(v.bound).toBeGreaterThanOrEqual(v.witnessed);
  });

  it.runIf(RUN)('V2: the certified bound is sound, and tightens with n while it still certifies', () => {
    const th0 = 1.1; const th1 = 1.1 + 0.05;
    const a: [number, number, number] = [R0 * Math.cos(th0), R0 * Math.sin(th0), 30];
    const b: [number, number, number] = [R0 * Math.cos(th1), R0 * Math.sin(th1), 30];
    const c: [number, number, number] = [R0 * Math.cos(th0), R0 * Math.sin(th0), 32];
    const cov = covRadius(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    expect(cov).toBeGreaterThan(0);
    // The chord sagitta of this facet is ~14 um, so tolerances below that CANNOT be certified and the
    // routine correctly stops early instead of burning resolution on a settled verdict. Monotonicity is
    // therefore asserted only across the tolerances where a certificate is actually attainable.
    let prev = Infinity;
    for (const tol of [0.05, 0.03, 0.02]) {
      const v = certifyTriangle(cylinder, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], { H, tol, nMax: 4096 });
      expect(v.certified).toBe(true);
      expect(v.bound).toBeGreaterThanOrEqual(v.witnessed - 1e-15);
      expect(v.bound).toBeLessThanOrEqual(tol + 1e-15);
      expect(v.bound).toBeLessThanOrEqual(prev + 1e-12);
      prev = v.bound;
    }
    // Below the true sagitta the verdict must be an honest NOT-CERTIFIED, never a silent pass.
    const tight = certifyTriangle(cylinder, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], { H, tol: 0.008, nMax: 4096 });
    expect(tight.certified).toBe(false);
    expect(tight.witnessed).toBeGreaterThan(0.008);
    // and the witness is a real point whose radial distance is genuinely what was reported
    const v = certifyTriangle(cylinder, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], { H, tol: 1e-7, nMax: 128 });
    expect(Math.abs(distRadial(cylinder, H, v.px, v.py, v.pz) - v.witnessed)).toBeLessThan(1e-9);
  });

  it.runIf(RUN)('V3: H1 UNDER-REPORTS missing relief by the feature width/height ratio', () => {
    // A facet spanning a ridge that the mesh never represents. H1 does not read zero — it reads roughly the
    // ridge HALF-WIDTH, because that is how far a facet point sits from the nearest SURVIVING surface. So a
    // thin, tall feature is invisible to H1 while hundreds of microns of geometry are absent. This is not a
    // defect of H1; it is the reason a mesh->surface number alone can never audit this pipeline.
    const thc = 0.5;
    const amp = 0.5;
    const wide = certifyTriangleAcross(ridged(thc, 0.004, amp), thc, 0.02);
    // eslint-disable-next-line no-console
    console.log(`V3 wide ridge (half-width ${(0.004 * R0 * 1000).toFixed(0)} um, relief ${amp * 1000} um): H1 ${(wide * 1000).toFixed(3)} um`);
    expect(wide).toBeLessThan(amp * 0.5);

    // Now the case that matters: a ridge 8 um in half-width and 400 um tall. H1 reads UNDER TOLERANCE.
    const thinAmp = 0.4;
    const thin = certifyTriangleAcross(ridged(thc, 0.008 / R0, thinAmp), thc, 0.02);
    // eslint-disable-next-line no-console
    console.log(`V3 thin ridge (half-width 8 um, relief ${thinAmp * 1000} um): H1 ${(thin * 1000).toFixed(3)} um  <-- passes a 10 um bar`);
    // 12 um against 400 um of absent relief: H1 under-reports by 33x. The exact threshold is not the
    // point — the ratio is, and it is set by width/height, so it is unbounded for a thin enough feature.
    expect(thin).toBeLessThan(0.02);
    expect(thinAmp / thin).toBeGreaterThan(20);
  });

  it.runIf(RUN)('V4: H2 finds an unrepresented ridge at its true height', () => {
    const thc = 0.5; const half = 0.004; const amp = 0.5;
    const rA = ridged(thc, half, amp);
    // columns deliberately straddle the crest without landing on it
    const cols: number[] = [];
    const nT = 240;
    for (let i = 0; i < nT; i += 1) cols.push(thc + 0.013 + (TAU * i) / nT);
    const mesh = structuredMesh(rA, cols, 60);
    const loc = buildRefLocator(mesh, pickLocatorCell(mesh.xyz, mesh.idx, mesh.nF));
    const res = surfaceToMeshMax(rA, loc.dist, { H, tol: 0.01, coveragePitch: 0.05, minPitch: 0.004, budget: 2e7 });
    // eslint-disable-next-line no-console
    console.log(`V4 H2 witnessed ${(res.max * 1000).toFixed(3)} um vs true ridge height ${amp * 1000} um (queries ${res.queries}, capped ${res.capped})`);
    // `capped` only truncates phase-B refinement; phase-A coverage of the whole domain always completes,
    // which is why the ridge is found regardless. Asserting on it would be asserting on a budget, not a
    // measurement.
    expect(res.max).toBeGreaterThan(amp * 0.9);
  });

  it.runIf(RUN)('V5: THE BLIND SPOT, deterministically — a crest placed BETWEEN the old rulers samples', () => {
    // The old ruler's sample positions are computable, not random. For a structured mesh every facet spans
    // the same [th_i, th_i+1] and its barycentric lattice puts theta samples exactly at th_i + k*dth/n with
    // n = clamp(ceil(longestEdge/0.03), 12, 64). Placing a crest at a HALF-INTEGER multiple of that pitch,
    // narrower than the pitch itself, guarantees NO sample ever lands on it. Nothing here is chance.
    const nT = 200; const nZ = 140;
    const dth = TAU / nT;
    const arc = dth * R0;                                   // 1.414 mm
    const dz = H / nZ;                                      // 0.857 mm
    const le = Math.hypot(arc, dz);                         // the facet diagonal is the longest edge
    const n = Math.max(12, Math.min(64, Math.ceil(le / 0.03)));
    const samplePitchArc = arc / n;                         // ~25 um
    const halfArc = 0.4 * samplePitchArc;                   // crest fits strictly between two samples
    const amp = 0.4;
    const i0 = 37;
    const thc = dth * i0 + (28 + 0.5) * (dth / n);          // exactly half-way between sample columns
    const rA = ridged(thc, halfArc / R0, amp);
    const cols: number[] = [];
    for (let i = 0; i < nT; i += 1) cols.push(dth * i);
    const mesh = structuredMesh(rA, cols, nZ);
    const oldMax = oldRulerMax(rA, mesh);
    const loc = buildRefLocator(mesh, pickLocatorCell(mesh.xyz, mesh.idx, mesh.nF));
    const res = surfaceToMeshMax(rA, loc.dist, {
      H, tol: 0.01, coveragePitch: 0.05, minPitch: 0.0015, structN: 48, budget: 4e7,
    });
    // eslint-disable-next-line no-console
    console.log(`V5 crest half-width ${(halfArc * 1000).toFixed(1)} um at half-pitch offset (sample pitch ${(samplePitchArc * 1000).toFixed(1)} um, n=${n})`);
    // eslint-disable-next-line no-console
    console.log(`V5 OLD ruler ${(oldMax * 1000).toFixed(3)} um   H2 ${(res.max * 1000).toFixed(3)} um   true relief ${amp * 1000} um   structPitch ${(res.structPitch * 1000).toFixed(2)} um`);
    expect(oldMax).toBeLessThan(0.02);                      // the old ruler calls this mesh clean
    expect(res.max).toBeGreaterThan(amp * 0.5);             // H2 reports most of the missing relief
    expect(res.max / Math.max(oldMax, 1e-9)).toBeGreaterThan(10);
  });

  it.runIf(RUN)('V6: on a mesh that DOES resolve the ridge, both directions read small', () => {
    // Same ridge, but columns placed ON the crest and on both flanks, plus a fine background. If the
    // instrument still screamed here it would be biased, not diagnostic.
    const thc = 1.9; const amp = 0.4;
    const half = 0.02 / R0;
    const rA = ridged(thc, half, amp);
    const cols: number[] = [];
    const nT = 600;
    for (let i = 0; i < nT; i += 1) cols.push((TAU * i) / nT);
    for (let k = -6; k <= 6; k += 1) cols.push(thc + (k * half) / 6);
    cols.sort((p, q) => p - q);
    const mesh = structuredMesh(rA, cols, 200);
    const loc = buildRefLocator(mesh, pickLocatorCell(mesh.xyz, mesh.idx, mesh.nF));
    const res = surfaceToMeshMax(rA, loc.dist, { H, tol: 0.05, u0: 512, v0: 128, maxDepth: 10, budget: 8e6 });
    // eslint-disable-next-line no-console
    console.log(`V6 resolved-ridge mesh: H2 ${(res.max * 1000).toFixed(3)} um (must be far below the ${amp * 1000} um relief)`);
    expect(res.max).toBeLessThan(amp * 0.1);
  });
});

/**
 * Cylinder with a single C0 z-step at zStep: radius jumps by `jump`. The printed solid carries a vertical
 * TREAD WALL there, which the mesher emits and which is correct geometry — but it is not on the bare graph.
 */
function stepped(zStep: number, jump: number): RadiusFn {
  return (_th: number, z: number) => (z < zStep ? R0 : R0 + jump);
}

describe('facet-truth closure at discontinuities', () => {
  it.runIf(RUN)('V7: a TREAD WALL facet is correct geometry and must not read as an error', () => {
    // A tread annulus quad: it lies in the plane z = zStep and spans the full radial jump. Scored against
    // the bare graph it reads ~the jump height; scored against the CLOSURE of the graph — which is what the
    // solid's boundary actually is — it reads ~0.
    //
    // This is the case that the first closure attempt silently failed: it probed a fixed z +/- 1e-6, so the
    // interval only opened if a probe landed within a micron of the step. H2 never exercised it (H2 samples
    // the surface), so it went unnoticed until H1 ran on ArtDeco and returned 2086 um on exactly this shape.
    const zStep = 60; const jump = 2.0;
    const rA = stepped(zStep, jump);
    const th0 = 0.4; const th1 = 0.4 + 0.09;              // ~4 mm of arc, like the real ArtDeco tread
    const rLo = R0; const rHi = R0 + jump;
    const v = certifyTriangle(rA,
      rLo * Math.cos(th0), rLo * Math.sin(th0), zStep,
      rHi * Math.cos(th0), rHi * Math.sin(th0), zStep,
      rHi * Math.cos(th1), rHi * Math.sin(th1), zStep,
      { H, tol: 0.01, nMax: 512, zJumps: detectZJumps(rA, H) });
    // eslint-disable-next-line no-console
    console.log(`V7 tread wall across a ${jump * 1000} um step: H1 witnessed ${(v.witnessed * 1000).toFixed(3)} um  (steps found: ${detectZJumps(rA, H).length})`);
    expect(v.witnessed).toBeLessThan(jump * 0.05);
  });

  it.runIf(RUN)('V7b: the closure must NOT forgive a genuinely misplaced facet on a smooth surface', () => {
    // Same machinery, but no discontinuity anywhere near: a facet pushed 0.4 mm off a plain cylinder must
    // still read 0.4 mm. If the two-scale test were sloppy it would widen the interval on ordinary slope
    // and quietly forgive real error — the failure direction that actually matters.
    const off = 0.4;
    const th0 = 0.4; const th1 = 0.4 + 0.02;
    const r = R0 - off;
    const v = certifyTriangle(cylinder,
      r * Math.cos(th0), r * Math.sin(th0), 50,
      r * Math.cos(th1), r * Math.sin(th1), 50,
      r * Math.cos(th0), r * Math.sin(th0), 51,
      { H, tol: 0.01, nMax: 512 });
    // eslint-disable-next-line no-console
    console.log(`V7b facet ${off * 1000} um inside a smooth cylinder: H1 witnessed ${(v.witnessed * 1000).toFixed(3)} um`);
    expect(v.witnessed).toBeGreaterThan(off * 0.9);
  });
});

describe('facet-truth closure must not forgive a NARROW FEATURE', () => {
  it.runIf(RUN)('V7c: a narrow ridge is NOT a discontinuity and must not widen the closure', () => {
    // REGRESSION LOCK. The two-scale jump test compares the radius range over a window w and over w/4. If w
    // is much wider than the feature, BOTH ranges saturate at the full relief, the ratio is 1, and a narrow
    // ridge is mistaken for a jump — so the closure widens and quietly forgives real error. That is the
    // unsound direction: it turns a missing feature into a pass.
    //
    // V7b does not catch it (smooth cylinder, no feature) and V3's threshold had been relaxed for an
    // unrelated reason, so the regression rode in green. Measured: an 8 um half-width, 400 um ridge read
    // 12.040 um before the closure rewrite and 9.000 um after — i.e. under a 10 um bar.
    //
    // A ridge is CONTINUOUS. Its closure interval must stay degenerate however wide the search window is.
    const thc = 0.5; const amp = 0.4;
    for (const halfUm of [8, 30, 120]) {
      const rA = ridged(thc, halfUm / 1000 / R0, amp);
      const d = certifyTriangleAcross(rA, thc, 0.02);
      // eslint-disable-next-line no-console
      console.log(`V7c ridge half-width ${halfUm} um, relief ${amp * 1000} um: H1 ${(d * 1000).toFixed(3)} um`);
      // H1 legitimately reads about the ridge HALF-WIDTH (see V3) — never materially less. If the closure
      // has wrongly opened, the reading collapses well below that.
      expect(d).toBeGreaterThan((halfUm / 1000) * 0.6);
    }
  });
});
