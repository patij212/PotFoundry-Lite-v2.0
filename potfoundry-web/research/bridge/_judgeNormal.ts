// research/bridge/_judgeNormal.ts — THE EXTRINSIC INSTRUMENT. RESEARCH ONLY, PURE (rA is a parameter).
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// A2 — THE AUTOMATED VERSION OF THE HUMAN EYE
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// The blade defect was found by a PERSON LOOKING AT A RENDER. Four automated instruments passed it, and they
// passed it for ONE shared reason: every one of them was combinatorial, or mediated by the (theta,z)
// parametrisation.
//     driver plane ruler  — samples a facet's PARAMETRIC footprint, so it never measured the blade at all
//     H2 surface -> mesh  — asks whether the surface is COVERED; added geometry cannot fail it
//     H1 mesh -> surface  — asks whether the facet is NEAR the surface; every blade vertex is ON it (<= 9 nm)
//     analyze() topology  — a folded sheet IS a consistently-oriented 2-manifold (D51: V-E+F = 0 exactly)
// Four instruments sharing one assumption are ONE instrument with four dials. A render is the only EXTRINSIC
// instrument in the room, and what a render shows is a NORMAL: shading, and back-facing culling.
//
// SO MEASURE THE NORMAL. Per facet: the angle between the facet's own normal and the ANALYTIC normal of the
// surface at the facet's parametric centroid. One gradient evaluation per facet. It is the only quantity in
// this pipeline that is not a function of the parametrisation's bookkeeping: it compares the emitted
// geometry's ORIENTATION against the surface's, and a blade screams on it because three near-collinear
// vertices give an ill-conditioned normal — a ~1 um altitude across a ~1 mm base — so the normal points
// anywhere. That is precisely the reported observation: "tangent", "protruding", "back-facing".
//
// THE ANALYTIC NORMAL, EXACTLY. For P(theta,z) = (r cos theta, r sin theta, z) with r = rA(theta,z):
//     P_theta = (r_t cos - r sin,  r_t sin + r cos,  0)
//     P_z     = (r_z cos,          r_z sin,          1)
//     N = P_theta x P_z = (r cos + r_t sin,  r sin - r_t cos,  -r * r_z)
// Check: N . rhat = r > 0 for every surface, i.e. N is OUTWARD by construction — which is also the identity
// the census's crude `n . rhat < 0` proxy leans on.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE THRESHOLD, AND WHY IT IS A SIGN TEST
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE GATE IS deviation >= 90 degrees, i.e. facet_normal . analytic_normal <= 0. Four reasons, in order of
// weight:
//
//  1. IT IS THRESHOLD-FREE IN THE ONLY SENSE THAT MATTERS. It is a SIGN test, not a magnitude test. No
//     constant is tuned, so there is no knob to be wrong about and no per-style calibration to go stale.
//
//  2. IT IS EXACTLY WHAT THE HUMAN SAW. "Many rendering BACK-FACING" is the statement that the facet normal
//     points into the solid. This gate reproduces that judgement automatically, against the analytic normal
//     rather than the eye.
//
//  3. IT IS MEASURED NON-EMPTY, AND THE CRUDE PROXY UNDERSTATES IT. The D51 census's `n . rhat < 0` proxy
//     already found 32,560 facets (2.2706 %) — while the driver reported 4.058 um PASS, H2 reported
//     15.508 um, and watertightness / orientation / Euler were perfect. This instrument is strictly sharper
//     than that proxy, because rhat is the surface normal ONLY where r_theta = r_z = 0; on 1.5 mm relief with
//     rib walls the two differ by tens of degrees, so the proxy both misses inverted facets on steep flanks
//     and can flag correct ones. Same population, honest reference.
//
//  4. LEGITIMATE GEOMETRY CANNOT PRODUCE IT. A facet spanning a crease of dihedral 2*phi has a normal within
//     phi < 90 degrees of at least one flank normal, and the ONE-SIDED candidates below ARE the flank
//     normals — so the gate gives every facet the benefit of both sides of every crease before it fires.
//
// FIVE CANDIDATE NORMALS, AND THE MINIMUM IS TAKEN. r_theta and r_z are formed by CENTRAL and by both
// ONE-SIDED differences, giving five (r_theta, r_z) pairs: central, and the four one-sided combinations. The
// reported deviation is the MINIMUM over all five. That bias is deliberate and it is the safe one for a
// GATE: a gate must not manufacture false FAILs, so a facet is judged against the most favourable admissible
// analytic normal at its own parametric centroid. (It also makes the z=0 and z=H clamp harmless: a clamped
// one-sided difference just contributes an extra candidate, and an extra candidate can only lower the
// reading.)
//
// THE STEP IS FIXED, NOT FACET-RELATIVE. h_theta = 1e-6 rad (~40 nm of arc at r = 40 mm) and h_z = 1e-6 mm.
// The reference must be a property of the SURFACE, not of the artifact under test — a facet-relative step
// would compute a different reference for a defective mesh than for a good one, which is exactly the
// circularity that let the driver's ruler judge its own output. Conditioning: rA ~ 40 mm so the roundoff
// floor on a difference quotient is ~7e-9, while GothicArches' relief presents r_theta ~ 600 (1.5 mm over a
// ~0.0025 rad feature). Nine orders of signal-to-noise.
//
// FACETS STRADDLING A DETECTED C0 LOCUS ARE REPORTED SEPARATELY AND EXCLUDED FROM THE GATE. At a genuine
// jump the surface has a cliff the graph cannot represent, so a bridging facet's normal is not comparable to
// either side's. (For GothicArches, detectZJumps and detectThetaJumps both return 0, so nothing is excluded
// and this exclusion cannot be quietly carrying the result — the report prints the count.)
//
// *** THE STYLE TO WATCH IS BASKETWEAVE, AND ON IT THE EXCLUSION LANDS EXACTLY WHERE THE DEFECTS WOULD BE. ***
// (Review finding 5, 2026-07-29.) GothicArches is the easy case and proves nothing about the hard one. The
// shape-agnostic C0 detector measured BasketWeave at 7,872 jump cells, 100 % of them PERSISTING under refine-
// ment, carrying 8,294 of 8,294 mm^2 of curtain area — i.e. genuinely C0 over its ENTIRE surface — against
// GothicArches' 168 of 3,696 cells and 56 of 759 mm^2 (worklog 2026-07-29, PHASE 0 table). On such a style
// this exclusion covers the curtain region, which is precisely where a mesher concentrates its refinement and
// therefore its defects, and a gate reading 0 would mean "0 outside the interesting part".
// THE EXCLUSION IS NOT REMOVED — it is correct, for the reason above, and widening the gate to cover bridging
// facets would manufacture false FAILs on every legitimate cliff. What is enforced instead is that it can
// never be quiet: the gate SHOUTS the excluded count and the back-facing count inside it whenever either is
// non-zero, and a run with a material exclusion must be read as a PARTIAL gate. The real closure for a
// curtain-bearing style is a double-valued-aware instrument — the same gap _judgeShape's fold gate declares
// NOT APPLICABLE for, and it is still unbuilt.
//
// WHAT IS REPORTED BUT NOT GATED: counts at 15 / 30 / 45 / 60 / 90 / 120 / 150 degrees, and a 12-bin
// histogram. Those columns are the CALIBRATION DATA for a possible tighter gate. Nothing tighter than the
// sign test should be adopted until the guard-ON / guard-OFF pair has been measured through this instrument
// and the two populations are seen to separate — see the pre-registration in the worklog.
import type { GateResult } from './_judgeVerdict';

const TWO_PI = 2 * Math.PI;
const RAD2DEG = 180 / Math.PI;

function dTh(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}

function pct(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

export interface NormalWorst { tri: number; deg: number; th: number; z: number; onLocus: boolean; featureSpan: boolean }

export interface NormalCensus {
  nTri: number;
  /** facets actually scored (everything except zero-area ones, which are counted and gated separately) */
  nScored: number;
  nDegenerate: number;
  /** facets whose parametric footprint contains a detected C0 locus — reported, excluded from the gate */
  nOnLocus: number;
  /** +1 the mesh winds outward, -1 inward, 0 ambiguous (=> the gate refuses) */
  windSign: number;
  windAgreeFrac: number;
  windSample: number;
  degP50: number; degP90: number; degP99: number; degMax: number; degMaxTri: number;
  /** counts at the reported ladder, off-locus facets only */
  over15: number; over30: number; over45: number; over60: number; over90: number; over120: number; over150: number;
  /** THE GATE COUNT: off-locus facets back-facing against the analytic normal EVERYWHERE in their own
   *  footprint (centroid AND all three vertex parameter points), plus zero-area facets. A point instrument
   *  cannot judge a feature-spanning chord — measured 2026-07-30: on guard-ON meshes the centroid-only >=90
   *  count GROWS with refinement depth (1,792 @61k -> 14,890 @351k tris, folds and blades both 0) because
   *  it is dominated by chords across steep C1 walls, a 1-D locus population ~ 1/h. A true flip is
   *  back-facing against the whole footprint field; a wall chord is front-facing at its own vertices. */
  nBackFacing: number;
  /** off-locus facets >= 90 deg at the CENTROID but front-facing somewhere in their footprint —
   *  feature-spanning chords. REPORTED, NEVER DEFECTS; their fidelity price is H1/H2's to charge. */
  nFeatureSpanBack: number;
  /** the same population but ON a locus — reported so the exclusion is never invisible */
  nBackFacingOnLocus: number;
  /** 12 bins of 15 degrees, off-locus facets only */
  hist: number[];
  worst: NormalWorst[];
  hTh: number; hZ: number; rEvals: number; secs: number;
}

export interface NormalOptions {
  H: number;
  hTh?: number;
  hZ?: number;
  zJumps?: readonly number[];
  thJumps?: readonly number[];
  nWorst?: number;
}

/**
 * Facet-normal deviation against the analytic normal. `rA` must be the SAME audited surface H1 and H2 use
 * (research/bridge/_facetTruthRA.buildAuditRadiusFn), so a deviation cannot be an artefact of a second,
 * differently-wrapped copy of the surface.
 */
export function facetNormalCensus(
  rA: (th: number, z: number) => number,
  xyz: Float64Array, nTri: number, opts: NormalOptions,
): NormalCensus {
  const t0 = Date.now();
  const hTh = opts.hTh ?? 1e-6;
  const hZ = opts.hZ ?? 1e-6;
  const zJumps = opts.zJumps ?? [];
  const thJumps = opts.thJumps ?? [];
  const nWorst = Math.max(1, opts.nWorst ?? 12);
  let rEvals = 0;
  const R = (th: number, z: number): number => { rEvals += 1; return rA(th, z); };

  /** the five candidate analytic normals at (th,z); returns the max dot with the given unit facet normal */
  const bestDot = (th: number, z: number, fx: number, fy: number, fz: number): number => {
    const r0 = R(th, z);
    const rTp = R(th + hTh, z); const rTm = R(th - hTh, z);
    const rZp = R(th, z + hZ); const rZm = R(th, z - hZ);
    const dtF = (rTp - r0) / hTh; const dtB = (r0 - rTm) / hTh; const dtC = (rTp - rTm) / (2 * hTh);
    const dzF = (rZp - r0) / hZ; const dzB = (r0 - rZm) / hZ; const dzC = (rZp - rZm) / (2 * hZ);
    const ct = Math.cos(th); const st = Math.sin(th);
    const cand: Array<[number, number]> = [[dtC, dzC], [dtF, dzF], [dtF, dzB], [dtB, dzF], [dtB, dzB]];
    let best = -1;
    for (const [rt, rz] of cand) {
      const nx = r0 * ct + rt * st;
      const ny = r0 * st - rt * ct;
      const nz = -r0 * rz;
      const nl = Math.hypot(nx, ny, nz);
      if (!(nl > 0)) continue;
      const d = (fx * nx + fy * ny + fz * nz) / nl;
      if (d > best) best = d;
    }
    return best;
  };

  /** does the facet's parametric footprint contain a detected C0 locus? */
  const straddles = (az: number, bz: number, cz: number, tA: number, dB: number, dC: number): boolean => {
    if (zJumps.length > 0) {
      const zlo = Math.min(az, bz, cz); const zhi = Math.max(az, bz, cz);
      for (const zj of zJumps) if (zj > zlo && zj < zhi) return true;
    }
    if (thJumps.length > 0) {
      const tlo = tA + Math.min(0, dB, dC); const thi = tA + Math.max(0, dB, dC);
      for (const tj of thJumps) {
        // tj is canonical in [0,2pi); shift it into the facet's own (possibly negative) theta window
        const k = Math.floor((tlo - tj) / TWO_PI) + 1;
        for (let m = k - 1; m <= k + 1; m += 1) {
          const t = tj + m * TWO_PI;
          if (t > tlo && t < thi) return true;
        }
      }
    }
    return false;
  };

  // ── orientation of the mesh as a whole, from a stride sample. The gate compares SIGNED dots, so a mesh
  // that winds inward globally must be detected rather than reported as 100% back-facing. Golden-ratio
  // stride so the sample is spread over the whole mesh rather than one construction sector.
  const windSample = Math.min(nTri, 8192);
  let windPos = 0; let windTot = 0;
  {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    let s = Math.max(1, Math.round(nTri * 0.6180339887498949) | 1);
    while (s > 1 && gcd(s, nTri) !== 1) s += 2;
    if (s >= nTri) s = 1;
    for (let k = 0; k < windSample; k += 1) {
      const t = (k * s) % nTri;
      const o = t * 9;
      const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
      const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
      const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const nl = Math.hypot(nx, ny, nz);
      if (!(nl > 0)) continue;
      const tA = Math.atan2(ay, ax);
      const dB = dTh(tA, Math.atan2(by, bx)); const dC = dTh(tA, Math.atan2(cy, cx));
      const th = tA + (dB + dC) / 3; const z = (az + bz + cz) / 3;
      windTot += 1;
      if (bestDot(th, z, nx / nl, ny / nl, nz / nl) > 0) windPos += 1;
    }
  }
  const windAgreeFrac = windTot > 0 ? windPos / windTot : 0;
  const windSign = windAgreeFrac >= 0.75 ? 1 : windAgreeFrac <= 0.25 ? -1 : 0;

  // ── the main pass ────────────────────────────────────────────────────────────────────────────────────
  const deg = new Float64Array(nTri);
  const hist = new Array<number>(12).fill(0);
  const worst: NormalWorst[] = [];
  let nScored = 0; let nDegenerate = 0; let nOnLocus = 0;
  let over15 = 0; let over30 = 0; let over45 = 0; let over60 = 0; let over90 = 0; let over120 = 0; let over150 = 0;
  let nBack = 0; let nBackOnLocus = 0; let nFeatureSpanBack = 0;
  let degMax = -1; let degMaxTri = -1;
  const flip = windSign < 0 ? -1 : 1;
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
    const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
    const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz);
    if (!(nl > 0)) {
      // A facet with no normal is not renderable geometry. 180 degrees, and it is GATED, not excluded.
      nDegenerate += 1; deg[t] = 180; nBack += 1;
      if (180 > degMax) { degMax = 180; degMaxTri = t; }
      continue;
    }
    nx = (flip * nx) / nl; ny = (flip * ny) / nl; nz = (flip * nz) / nl;
    const tA = Math.atan2(ay, ax);
    const dB = dTh(tA, Math.atan2(by, bx)); const dC = dTh(tA, Math.atan2(cy, cx));
    const th = tA + (dB + dC) / 3; const z = (az + bz + cz) / 3;
    const d = bestDot(th, z, nx, ny, nz);
    const a = Math.acos(Math.max(-1, Math.min(1, d))) * RAD2DEG;
    deg[t] = a;
    nScored += 1;
    if (a > degMax) { degMax = a; degMaxTri = t; }
    const onLocus = straddles(az, bz, cz, tA, dB, dC);
    let featureSpan = false;
    if (onLocus) {
      nOnLocus += 1;
      if (a >= 90) nBackOnLocus += 1;
    } else {
      hist[Math.min(11, Math.floor(a / 15))] += 1;
      if (a >= 15) over15 += 1;
      if (a >= 30) over30 += 1;
      if (a >= 45) over45 += 1;
      if (a >= 60) over60 += 1;
      if (a >= 90) {
        over90 += 1;
        // FOOTPRINT TEST (2026-07-30, lazy — runs only for this >=90 tail). Back-facing at the CENTROID is
        // not a verdict on a facet that SPANS a feature: sample the analytic normal at the facet's own three
        // vertex parameter points as well, the extreme points of its footprint. Front-facing at any of them
        // means the facet is a chord across a steep wall/crease — legitimate (if coarse) geometry whose
        // fidelity price H1/H2 charge — not an orientation defect. Max-dot over {centroid, A, B, C} is a
        // LOWER bound of the footprint max, so this can only over-count defects, never excuse a true flip:
        // a genuinely reversed facet is back-facing against the entire local field, vertices included.
        const dVA = bestDot(tA, az, nx, ny, nz);
        const dVB = dVA > 0 ? dVA : bestDot(tA + dB, bz, nx, ny, nz);
        const dVC = dVB > 0 ? dVB : bestDot(tA + dC, cz, nx, ny, nz);
        featureSpan = Math.max(dVA, dVB, dVC) > 0;
        if (featureSpan) nFeatureSpanBack += 1; else nBack += 1;
      }
      if (a >= 120) over120 += 1;
      if (a >= 150) over150 += 1;
    }
    if (worst.length < nWorst || a > worst[worst.length - 1].deg) {
      const rec: NormalWorst = { tri: t, deg: a, th, z, onLocus, featureSpan };
      let i = worst.length - 1;
      worst.push(rec);
      while (i >= 0 && worst[i].deg < a) { worst[i + 1] = worst[i]; i -= 1; }
      worst[i + 1] = rec;
      if (worst.length > nWorst) worst.pop();
    }
  }
  const sorted = Float64Array.from(deg).sort();
  return {
    nTri, nScored, nDegenerate, nOnLocus,
    windSign, windAgreeFrac, windSample: windTot,
    degP50: pct(sorted, 0.5), degP90: pct(sorted, 0.9), degP99: pct(sorted, 0.99), degMax, degMaxTri,
    over15, over30, over45, over60, over90, over120, over150,
    nBackFacing: nBack, nFeatureSpanBack, nBackFacingOnLocus: nBackOnLocus,
    hist, worst, hTh, hZ, rEvals, secs: (Date.now() - t0) / 1000,
  };
}

/** A2's gate: no facet may point away from the surface it is supposed to represent. */
export function normalGate(nc: NormalCensus): GateResult {
  const title = 'EXTRINSIC ORIENTATION — facet normal vs the ANALYTIC normal at the facet centroid';
  if (nc.windSign === 0) {
    return {
      id: 'NORMAL', title, applicable: false, count: nc.nBackFacing, expected: 0, pass: false,
      detail: [
        `AMBIGUOUS — only ${(100 * nc.windAgreeFrac).toFixed(1)}% of a ${nc.windSample}-facet stride sample`,
        'agrees with the analytic outward normal, so the mesh has no global orientation to score against.',
        'That is itself a severe finding, but this gate cannot produce a meaningful count from it.',
        'NOT APPLICABLE IS NOT A PASS.',
      ],
    };
  }
  // THE EXCLUSION MUST NEVER BE ABLE TO CARRY A RESULT QUIETLY (review finding 5). A single mild line saying
  // "N excluded" is what a reader skips; on a genuinely C0 style N can be the whole feature region — see the
  // BasketWeave note in this file's header — so the report shouts it and names the population inside it.
  const locusPc = (100 * nc.nOnLocus) / Math.max(1, nc.nTri);
  const locusLines: string[] = nc.nOnLocus === 0
    ? ['facets straddling a detected C0 locus: 0 — NOTHING was excluded, this gate saw every facet of the mesh']
    : [
      `*** ${nc.nOnLocus} facets (${locusPc.toFixed(4)}% of the mesh) straddle a detected C0 locus and are EXCLUDED from this gate ***`,
      `    ${nc.nBackFacingOnLocus} of the excluded facets ARE back-facing and are NOT part of the ${nc.nBackFacing} counted above.`,
      '    READ THIS GATE AS PARTIAL. The exclusion is correct (a facet bridging a cliff has no comparable',
      '    analytic normal on either flank) but it covers the curtain region, where defects concentrate.',
      '    Measured scale of the problem: BasketWeave is 100% persisting C0 over 8,294 of 8,294 mm^2, while',
      '    GothicArches is 56 of 759 mm^2 — the same exclusion is a rounding error on one style and the whole',
      '    feature set on another. A curtain-bearing style needs a double-valued-aware instrument, not this one.',
    ];
  const detail: string[] = [
    `deviation (degrees) p50 ${nc.degP50.toFixed(4)}   p90 ${nc.degP90.toFixed(4)}   p99 ${nc.degP99.toFixed(4)}   MAX ${nc.degMax.toFixed(4)} (tri ${nc.degMaxTri})`,
    `mesh winds ${nc.windSign > 0 ? 'OUTWARD' : '*** INWARD ***'} (${(100 * nc.windAgreeFrac).toFixed(2)}% of a ${nc.windSample}-facet stride sample)`,
    `off-locus counts   >=15 ${nc.over15}   >=30 ${nc.over30}   >=45 ${nc.over45}   >=60 ${nc.over60}   >=90 ${nc.over90}   >=120 ${nc.over120}   >=150 ${nc.over150}`,
    `histogram, 12 bins of 15 deg (off-locus): ${nc.hist.join(' ')}`,
    `zero-area facets (no normal at all, gated as 180 deg): ${nc.nDegenerate}`,
    `FEATURE-SPANNING chords (>= 90 deg at the centroid, front-facing at one of their own vertices): ${nc.nFeatureSpanBack}`,
    '  ^ REPORTED, NOT DEFECTS — a chord across a steep C1 wall legitimately reads back-facing at a mid-wall',
    '    sample point; its fidelity price is H1/H2\'s to charge. Measured 2026-07-30: this population GROWS',
    '    with refinement depth (1,792 @ 61k -> 14,890 @ 351k guard-ON tris; folds and blades both 0), i.e. a',
    '    centroid-only >= 90 gate is unmeasurable-as-specified on feature-bearing styles.',
    ...locusLines,
    `step h_theta ${nc.hTh.toExponential(1)} rad, h_z ${nc.hZ.toExponential(1)} mm   ${(nc.rEvals / 1e6).toFixed(1)}M rA evals   ${nc.secs.toFixed(1)}s`,
    'GATE = back-facing (>= 90 deg) against the MOST FAVOURABLE of five candidate analytic normals (central',
    'and both one-sided differences in each of theta and z), AT EVERY SAMPLED POINT OF THE FACET\'S OWN',
    'FOOTPRINT — centroid and all three vertex parameter points. A sign test, not a tuned threshold. The',
    'one-sided candidates handle a crease AT a sample point; the vertex samples handle a crease that crosses',
    'the footprint BETWEEN sample points (the case a centroid-only probe mis-reads, measured above).',
  ];
  if (nc.worst.length > 0) {
    detail.push('WORST BY DEVIATION (centroid angle):');
    for (const w of nc.worst) {
      detail.push(`  tri ${String(w.tri).padStart(9)}  ${w.deg.toFixed(3)} deg  th ${w.th.toFixed(5)}  z ${w.z.toFixed(4)}${w.onLocus ? '  [ON A C0 LOCUS — excluded]' : w.featureSpan ? '  [FEATURE-SPANNING — reported, not gated]' : ''}`);
    }
  }
  return {
    id: 'NORMAL', title, applicable: true,
    count: nc.nBackFacing, expected: 0, pass: nc.nBackFacing === 0, detail,
  };
}
