// _strataFacetTruth.test.ts — STRATA-001: an INDEPENDENT, TWO-SIDED facet auditor.
// Gated PF_STRATA_FT=1. RESEARCH ONLY. Reads a finished binary STL from disk — it does not import, call or
// otherwise depend on any mesher. That independence is the point: the scorecard's audit ruler and its
// refinement driver are the SAME sampler, so a facet spanning a feature that sampler cannot see is never
// refined AND never flagged. This file is a second opinion sharing no machinery with the first.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THE OLD RULER MEASURES, AND WHY IT CAN READ LOW
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// `sagOfN` samples a FIXED barycentric lattice (n = clamp(ceil(le/0.03mm), 12, 64)) and reports the largest
// distance from an analytic point to the triangle's INFINITE PLANE.
//   (1) NO BOUND. Nothing connects max-over-samples to max-over-the-continuum. The pitch is capped at
//       0.03 mm by n<=64 while the product bar is 0.01 mm, so a feature narrower than the pitch can sit
//       between samples and contribute exactly nothing.
//   (2) PER-TRIANGLE PLANE. It scores an analytic point against the plane of the ONE triangle whose
//       parametric footprint happens to contain it, not against the mesh.
//   (3) SHARED WITH THE DRIVER. Refinement is driven by the same numbers, so an invisible feature is also
//       an unrefined one. The verdict and the thing it judges are not independent.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS MEASURES — both directions, because one alone cannot see the defect
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// H1  MESH -> SURFACE   max over p in the mesh of dist(p, S)   — catches facets bulging OFF the surface.
// H2  SURFACE -> MESH   max over q in S      of dist(q, mesh)  — catches surface the mesh never represents.
//
// H1 ALONE IS BLIND TO THE DEFECT UNDER INVESTIGATION, and that is worth stating plainly: a facet chording
// across a ridge lies near the ridge's BASE, so every point of it has surface a few microns away and H1
// reads ~0 — while the ridge crest is the full relief height from the nearest triangle. An unrepresented
// feature is an H2 defect. Any auditor that reports only H1 reproduces the blind spot it is meant to catch.
//
// *** AND THAT RULE IS NOW ENFORCED, NOT DOCUMENTED. *** On 2026-07-29 this file emitted a night of PASS-
// shaped H2-only reports while PF_FT_H1 was off, and the mesh they described was 7.58% over tolerance. The
// header said one direction never suffices while the emission path happily emitted one. Every verdict now
// goes through `judge()` in _judgeVerdict.ts, which REFUSES to produce a PASS/FAIL line from one direction.
// Single-direction runs remain available as diagnostics; they are incapable of producing a verdict.
//
// H1 IS CERTIFIED. Distance-to-a-set is 1-Lipschitz for ANY set, so sampling a triangle on a barycentric
// lattice of level n bounds the continuum: max over T <= max over lattice + covRad(T)/n. Raise n until the
// bound clears TOL. No feature detector, no per-style envelope, no smoothness assumption. See _facetTruthLib.
//
// H2 IS WITNESSED, NOT CERTIFIED, and is labelled that way everywhere. Each reading is an EXACT 3-D
// point-to-triangle distance (Ericson closest-point over the `buildRefLocator` grid, adversarially equal to
// brute force to ~1e-6) from a real analytic surface point to the real audited mesh — so every exceedance
// it reports is a genuine defect. Sampling is COVERAGE-FIRST then WORST-FIRST: phase A sweeps the entire
// (theta,z) domain on a uniform lattice so nothing can be starved, then phase B spends what is left
// refining cells in priority order, keyed by what each cell could still be hiding (its reading plus a
// cheap rA-only measure of how far the surface departs from its own corner interpolant — which is how a
// feature living BETWEEN query samples still earns refinement). A certified H2 would need interval
// arithmetic on rA; this is a sound LOWER bound on the true H2, which is what is needed to refute a PASS.
//
// A/B is built in: PF_FT_OLDRULER=1 re-implements `sagOfN`'s adaptive plane ruler faithfully and runs it
// over the SAME triangles, so old-vs-new is one run on one mesh with nothing else varying.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE THIRD AND FOURTH INSTRUMENTS: SHAPE, AND ORIENTATION. NEITHER IS OPTIONAL.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// A user looked at a 1.43M-facet mesh in a viewer and saw thin flat BLADES protruding from the surface, many
// rendering back-facing. 48,130 facets (3.36%) had aspect ratio > 50 and 31,842 (2.22%) were INVERTED in
// (theta,z) — the parametrisation folds and the surface cuts through itself. Every automated check passed,
// and they all passed for ONE shared reason: each was combinatorial, or mediated by the parametrisation.
//
//   * H1 reads LOW on a blade — every one of its vertices is on the analytic surface to <= 9 nm.
//   * H2 CANNOT SEE PROTRUDING GEOMETRY AT ALL — a blade covers everything it should and ADDS geometry.
//   * The driver's plane ruler REWARDS blades — near-collinear vertices on the surface mean any plane
//     through them hugs it, so it read p50 0.63 um on the 2,000 worst, below its own accept threshold.
//   * WATERTIGHTNESS, ORIENTATION AND EULER ALL PASS ON A FOLDED SHEET — D51 measured 0 / 0 / V-E+F = 0.
//
// So the audit now carries two instruments that are functions of facet SHAPE and of ORIENTATION AGAINST THE
// ANALYTIC SURFACE, and both are GATES rather than columns:
//   research/bridge/_judgeShape.ts   — the census, and the representation-validity (fold) / blade / topology
//                                      gates. A lifted graph must have ONE parametric orientation; a sign
//                                      disagreement is a fold BY CONSTRUCTION and subsumes self-intersection.
//   research/bridge/_judgeNormal.ts  — the EXTRINSIC instrument: facet normal vs the analytic normal at the
//                                      facet's parametric centroid. The only quantity here not mediated by
//                                      the parametrisation, which is the whole point of it.
//   research/bridge/_judgeVerdict.ts — the ONE entry point a verdict may come from.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// H1 RUNS ON A WORKER-THREAD POOL (PF_FT_WORKERS; default = physical cores, capped)
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// H1 is ~98% of the audit cycle at ~186 ms/facet, so full coverage of an 885k-facet mesh is ~46 HOURS and at
// the default time budget the audit reaches ~0.9% of a mesh and caps. It does not complete. That is not a
// cosmetic problem: a driver whose ruler can only be consulted on 1% of its output cannot be evaluated.
//
// The work is embarrassingly parallel — every `certifyTriangle` call is independent and read-only against rA
// and the mesh — but "parallel" is only allowed here if it cannot move a reported number. What makes that
// true, and where each part lives:
//   * THREADS, NOT PROCESSES, and the STL in a SharedArrayBuffer  (_facetTruthPool.readMeshFloat64)
//   * AN ATOMIC CURSOR, NOT A STATIC SPLIT — per-facet cost spans 181x, so an nTri/W split finishes when the
//     unluckiest worker does                                       (_facetTruthH1Worker.ts)
//   * THE SAME GOLDEN-RATIO STRIDE WALK, consumed in parallel chunks, so a capped pooled run is still a
//     low-discrepancy sample of the whole mesh                     (_facetTruthH1.runH1Walk)
//   * rA REBUILT PER WORKER from (style, params, dims) and PROVEN bit-identical to the parent's over a
//     lattice bracketing every C0 locus, or the run is refused     (_facetTruthRA.ts / _facetTruthPool.ts)
//   * ORDER-INDEPENDENT REDUCTION with an explicit tie-break, so the witness never depends on interleaving
//                                                                  (_facetTruthH1.mergeH1)
//   * `certifyTriangle` CALLED UNMODIFIED, so every per-facet certificate is bit-identical and the ruler
//     validation suite (_strataFacetTruthValidate) is untouched by this.
// PF_FT_WORKERS=1 runs the serial path — the SAME `runH1Walk` with a claim that yields the whole range once.
// PF_FT_H1MAX caps the walk at N facets, which is what makes serial-vs-pooled an EXACT comparison rather
// than a race between two time-capped runs that audited different prefixes.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import type { StyleDims } from './labkit';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';
import { detectThetaJumps, detectZJumps, distPerp, pickLocatorCell, surfaceToMeshMax } from './_facetTruthLib';
import { runH1Walk, type H1Job, type H1Partial } from './_facetTruthH1';
import { buildAuditRadiusFn, radiusLattice } from './_facetTruthRA';
import { readMeshFloat64, resolveWorkerCount, runH1Pool } from './_facetTruthPool';
import { bladeGate, foldGate, meshShapeCensus, topologyGate } from './_judgeShape';
import { facetNormalCensus, normalGate } from './_judgeNormal';
import { judge, renderGates, NOT_RUN, type DirectionReading, type GateResult } from './_judgeVerdict';

const RUN = process.env.PF_STRATA_FT === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const TWO_PI = 2 * Math.PI;

function envF(n: string, d: number): number {
  const r = process.env[n];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}
const envOn = (n: string): boolean => process.env[n] === '1';
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const um = (mm: number): string => (Number.isFinite(mm) ? (mm * 1000).toFixed(3) : 'inf');

describe('STRATA facet truth', () => {
  it.runIf(RUN)('re-audits a finished mesh against the true 3D surface, both directions', async () => {
    const stlPath = process.env.PF_FT_STL ?? '';
    const STYLE = process.env.PF_FT_STYLE ?? 'GothicArches';
    const TOL = envF('PF_FT_TOL_UM', 10) / 1000;
    const DO_H1 = process.env.PF_FT_H1 !== '0';
    const DO_H2 = process.env.PF_FT_H2 !== '0';
    const NMAX = Math.round(envF('PF_FT_NMAX', 2048));
    const BUDGET = envF('PF_FT_BUDGET', 1.2e10);
    const H1SECS = envF('PF_FT_H1SECS', 1500);
    const OLD = envOn('PF_FT_OLDRULER');
    const TOPK = Math.round(envF('PF_FT_TOPK', 24));
    // H2 adaptive sampler controls
    const H2BUDGET = envF('PF_FT_H2BUDGET', 1.5e8);         // phase-B refinement budget (phase A is unconditional)
    const H2PITCH = envF('PF_FT_H2PITCH_UM', 40) / 1000;    // phase-A uniform coverage pitch
    const H2MINPITCH = envF('PF_FT_H2MINPITCH_UM', 1.25) / 1000;
    const H2STRUCTN = Math.round(envF('PF_FT_H2STRUCTN', 48));
    const H2LINES = Math.round(envF('PF_FT_H2LINES', 5));
    const H2SECS = envF('PF_FT_H2SECS', 900);
    const H2ZMIN = envF('PF_FT_ZMIN', 0);
    const H2ZMAX = envF('PF_FT_ZMAX', H);
    const tag = process.env.PF_FT_TAG ?? STYLE;
    if (stlPath === '') throw new Error('PF_FT_STL is required');
    // H1 pool controls. WORKERS=1 — or no SharedArrayBuffer, which is what a non-'node' Vitest environment
    // looks like — selects the serial path, unchanged. The pool is an accelerator, never a prerequisite.
    const WORKERS = DO_H1 ? resolveWorkerCount() : 1;
    const USE_POOL = DO_H1 && WORKERS > 1 && typeof SharedArrayBuffer === 'function';
    const CHUNKMAX = Math.round(envF('PF_FT_CHUNK', 256));
    const WORKERMB = Math.round(envF('PF_FT_WORKERMB', 2048));
    // PF_FT_GRAPH=0 declares the audited mesh NOT a single-valued graph over (theta,z) — a double-valued
    // tread/curtain mesh, or STAGE=solid with its inner wall and floor. It makes the representation-validity
    // gate NOT APPLICABLE, which is NOT a pass: `judge()` then refuses to certify the run.
    const GRAPH = process.env.PF_FT_GRAPH !== '0';
    // Expected boundary-edge count for the STAGE (a ring has two rims). Unset => the boundary count is
    // reported but not judged.
    const EXPECT_BOUNDARY = process.env.PF_FT_BOUNDARY === undefined ? null : Math.round(envF('PF_FT_BOUNDARY', 0));
    // PF_FT_STRICT=1 turns a non-PASS verdict into a vitest failure. DEFAULT OFF, deliberately: auditing a
    // known-bad control is a legitimate and frequent use of this file, and a thrown assertion there would
    // add nothing. The report is written to disk BEFORE the throw either way, so a strict run still leaves
    // its artifact.
    const STRICT = envOn('PF_FT_STRICT');

    const styleParams: Record<string, number> = { ...registryDefaults(STYLE) };
    if (process.env.PF_FT_PARAMS !== undefined) Object.assign(styleParams, JSON.parse(process.env.PF_FT_PARAMS) as Record<string, number>);
    // ONE definition of the audited surface, shared verbatim with every worker — see _facetTruthRA.ts.
    const auditR = buildAuditRadiusFn(STYLE, styleParams, DIMS, H);
    const rA = auditR.rA;

    const { xyz, nTri, sab } = readMeshFloat64(stlPath, USE_POOL);
    const zJumps = detectZJumps(rA, H);
    const thJumps = detectThetaJumps(rA, H);
    const t0 = Date.now();
    /** rA evals spent INSIDE the worker threads — the parent's own counter cannot see them. */
    let poolREvals = 0;
    const locus = (t: number): string => {
      if (t < 0) return 'n/a';
      const o = t * 9;
      const zs = [xyz[o + 2], xyz[o + 5], xyz[o + 8]];
      const ths = [Math.atan2(xyz[o + 1], xyz[o]), Math.atan2(xyz[o + 4], xyz[o + 3]), Math.atan2(xyz[o + 7], xyz[o + 6])];
      const e1 = Math.hypot(xyz[o + 3] - xyz[o], xyz[o + 4] - xyz[o + 1], xyz[o + 5] - xyz[o + 2]);
      const e2 = Math.hypot(xyz[o + 6] - xyz[o + 3], xyz[o + 7] - xyz[o + 4], xyz[o + 8] - xyz[o + 5]);
      const e3 = Math.hypot(xyz[o] - xyz[o + 6], xyz[o + 1] - xyz[o + 7], xyz[o + 2] - xyz[o + 8]);
      return `z=[${zs.map((v) => v.toFixed(3)).join(',')}] th=[${ths.map((v) => v.toFixed(4)).join(',')}] edges(um)=${um(e1)}/${um(e2)}/${um(e3)}`;
    };

    // ── PROVENANCE GUARD. Nothing ties the audited STL to the surface it is scored against: DIMS is a
    // file-local constant, STYLE defaults to 'GothicArches', and the mesher's STL header carries a fixed
    // string with no style, params, dims or revision. Auditing a GeometricStar mesh against the GothicArches
    // surface produces a fully formatted, entirely meaningless report and nothing detects it. A mesh built
    // on this surface must lie within a few mm of it, so compare the observed radius and z extents against
    // the analytic ones and refuse to report if they disagree grossly.
    {
      let obsRLo = Infinity; let obsRHi = -Infinity; let obsZLo = Infinity; let obsZHi = -Infinity;
      for (let i = 0; i < nTri * 9; i += 3) {
        const r = Math.hypot(xyz[i], xyz[i + 1]); const z = xyz[i + 2];
        if (r < obsRLo) obsRLo = r; if (r > obsRHi) obsRHi = r;
        if (z < obsZLo) obsZLo = z; if (z > obsZHi) obsZHi = z;
      }
      let anaRLo = Infinity; let anaRHi = -Infinity;
      for (let i = 0; i < 256; i += 1) {
        const th = (TWO_PI * i) / 256;
        for (let j = 0; j <= 128; j += 1) {
          const r = rA(th, (H * j) / 128);
          if (r < anaRLo) anaRLo = r; if (r > anaRHi) anaRHi = r;
        }
      }
      // Generous band: this is a wrong-artifact detector, not a fidelity gate. A style/param/dims mismatch
      // moves these extents by millimetres; a real fidelity defect moves them by microns.
      const slack = 0.05 * Math.max(1, anaRHi - anaRLo) + 1.0;
      const bad = obsRHi > anaRHi + slack || obsRLo < anaRLo - slack || obsZHi > H + 1 || obsZLo < -1;
      if (bad) {
        throw new Error(
          `PROVENANCE: the STL does not match the surface it would be scored against.\n`
          + `  stl   ${stlPath}\n`
          + `  style ${STYLE}  dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt}\n`
          + `  mesh  r ${obsRLo.toFixed(3)}..${obsRHi.toFixed(3)}  z ${obsZLo.toFixed(3)}..${obsZHi.toFixed(3)}\n`
          + `  rA    r ${anaRLo.toFixed(3)}..${anaRHi.toFixed(3)}  z 0..${H}\n`
          + `  Set PF_FT_STYLE / PF_FT_PARAMS to match the mesh, or point PF_FT_STL at the right file.`);
      }
    }

    const lines: string[] = ['', `===== STRATA FACET TRUTH: ${STYLE} =====`,
      `stl: ${stlPath}  (${nTri} triangles)`,
      `params ${JSON.stringify(styleParams)}`,
      `TOL ${um(TOL)} um   detected C0 z-steps: ${zJumps.length}   theta-jumps: ${thJumps.length}`];
    // PF_FT_PROBE=1 — report only the located discontinuities and stop. Cheap enough to ask "does this
    // style even have theta-jumps?" without paying for a full audit.
    if (process.env.PF_FT_PROBE === '1') {
      // eslint-disable-next-line no-console
      console.log(`PROBE ${STYLE}: zSteps ${zJumps.length} [${zJumps.map((z) => z.toFixed(2)).join(' ')}]  thetaJumps ${thJumps.length} [${thJumps.slice(0, 12).map((t) => t.toFixed(4)).join(' ')}${thJumps.length > 12 ? ' ...' : ''}]`);
      expect(nTri).toBeGreaterThan(0);
      return;
    }

    // ══════════════════ SHAPE + ORIENTATION — UNCONDITIONAL. NO FLAG TURNS THESE OFF. ══════════════════
    // Deliberately placed BEFORE H1 and H2, appended to `lines` first and echoed to the console immediately,
    // so a run truncated by an H1/H2 time budget still carries them — and so a long job that dies leaves the
    // gate results behind rather than nothing at all. Their headline is also stamped onto every fidelity
    // line below, so it is not possible to quote an H1 or H2 number without the shape state travelling with
    // it. ONE FLAG EXISTS FOR THE CENSUS AND IT IS ONLY THE THRESHOLD — PF_FT_ARCAP, default 50, which is
    // research/tools/_bladeCensus.mjs's own definition and therefore the one the D51 baseline is quoted at.
    const ARCAP = envF('PF_FT_ARCAP', 50);
    // PF_FT_GUARD_AR — the DRIVER-side split-guard cap (PF_CB_SHAPE_AR) of the run that produced this STL.
    // UNSET BY DEFAULT AND DELIBERATELY NOT GUESSED: it is a fact about a run this file did not perform, and a
    // wrong value would produce a confident false provenance claim. When it is supplied, the blade gate can
    // state EXACTLY which facets the driver guard could not have emitted — see bladeGate in _judgeShape.ts and
    // the FINDING 4 driver-gap note in research/lab/2026-07-29-strata-perf-convergence-worklog.md.
    const GUARD_AR = process.env.PF_FT_GUARD_AR === undefined ? null : envF('PF_FT_GUARD_AR', 50);
    const sc = meshShapeCensus(xyz, nTri, {
      arCap: ARCAP, H, nWorst: Math.max(1, Math.round(envF('PF_FT_SHAPE_TOPK', 12))),
    });
    const nc = facetNormalCensus(rA, xyz, nTri, {
      H, zJumps, thJumps, nWorst: Math.max(1, Math.round(envF('PF_FT_NORM_TOPK', 12))),
    });
    const bladePc = (100 * sc.nBlade) / Math.max(1, sc.nTri);
    const foldPc = (100 * sc.nFoldDetermined) / Math.max(1, sc.nTri);
    /** The stamp that travels with every fidelity number in this report. DETERMINED counts are the verdict
     *  quantities; the f32-indeterminate band rides along so a sub-floor population can never hide again. */
    const shapeStamp = `[SHAPE: AR p99 ${sc.arP99.toFixed(2)} max ${sc.arMax.toFixed(1)}, blades(AR>${ARCAP}) ${sc.nBlade} det+${sc.nBladeIndet} f32indet (${bladePc.toFixed(3)}%), folds ${sc.nFoldDetermined} det+${sc.nIndeterminate} f32indet (${foldPc.toFixed(4)}%), back-facing ${nc.nBackFacing} (+${nc.nFeatureSpanBack} feature-span)]`;
    lines.push('',
      '--- MESH SHAPE CENSUS (unconditional; every facet; computed from the audited STL itself) ---',
      '  AR = longest*perimeter/(4*area) = longest edge / (2*inradius).  1.0 equilateral, higher = thinner.',
      `  3-D ASPECT RATIO      p50 ${sc.arP50.toFixed(3)}   p90 ${sc.arP90.toFixed(3)}   p99 ${sc.arP99.toFixed(3)}   MAX ${sc.arMax.toFixed(3)}`,
      `  BLADES (AR > ${ARCAP})     : ${sc.nBlade} DETERMINED / ${sc.nTri}  (${bladePc.toFixed(4)}%)${sc.nBlade === 0 ? '   CLEAN' : '   *** SHAPE DEFECT ***'}   +${sc.nBladeIndet} f32-indeterminate at the cap (raw ${sc.nBladeRaw})`,
      `    zero-area facets    : ${sc.nDegenerate}     min edge ${um(sc.minEdge)} um  (tri ${sc.minEdgeTri})`,
      `    AR max-locus  ${locus(sc.arMaxTri)}`,
      `  FOLDS — facets INVERTED in (theta,z), i.e. the surface doubles back over itself:`,
      `    DETERMINED          : ${sc.nFoldDetermined} / ${sc.nTri}  (${foldPc.toFixed(4)}%)${sc.nFoldDetermined === 0 ? '   CLEAN' : '   *** SELF-OVERLAP ***'}   majority(det) ${sc.majoritySign > 0 ? '+' : '-'}`,
      `    f32-INDETERMINATE   : ${sc.nIndeterminate}  (${sc.nIndetNeg} read neg / ${sc.nIndetPos} read pos, incl. ${sc.nParZero} exact-zero) — sign below the STL's own noise floor, NOT defects (FOLD-ANOMALY 2026-07-29)`,
      `    raw minority+zero   : ${sc.nMinoritySign}`,
      `    historical '<0'     : ${sc.nFoldRaw}   of which AR>${ARCAP}: ${sc.nFoldRawBlade}   (the D51-comparable number)`,
      `    after exact-bit weld: ${sc.nFoldWeld}   well-shaped (parametric AR <= 8, so NOT float noise): ${sc.nWellShapedFold}`,
      `    fold components ${sc.foldComponents}   largest ${sc.foldLargest} facets`,
      `    facet normal radially INWARD (n.rhat < 0, the CRUDE proxy): ${sc.nInward}  (${((100 * sc.nInward) / Math.max(1, sc.nTri)).toFixed(4)}%)   of which AR>${ARCAP}: ${sc.nInwardBlade}`,
      `  PARAMETRIC (arc,z) AR p50 ${sc.parArP50.toFixed(3)}   p90 ${sc.parArP90.toFixed(3)}   p99 ${sc.parArP99.toFixed(3)}   MAX ${sc.parArMax.toFixed(3)}`,
      `  AR decade histogram (log10 floor -> count): ${sc.arDecades.map(([d, c]) => `1e${d}:${c}`).join('  ')}`,
      `  z-histogram of blades (24 bins, base -> rim): ${sc.bladeZHist.join(' ')}`,
      `  z-histogram of folds  (24 bins, base -> rim): ${sc.foldZHist.join(' ')}`,
      `  census ${sc.secs.toFixed(1)}s`,
      ...(sc.worst.length === 0 ? ['  (no facet over the cap)'] : [`  WORST ${sc.worst.length} BY AR:`,
        ...sc.worst.map((w) => `    tri ${String(w.tri).padStart(9)}  AR ${w.ar.toExponential(3)}  L ${um(w.L)} S ${um(w.S)} um  area ${(w.area * 1e6).toExponential(2)} um^2  ${w.fold ? 'FOLDED' : 'forward'}`)]),
      '',
      '--- EXTRINSIC ORIENTATION CENSUS (facet normal vs the ANALYTIC normal at the facet centroid) ---',
      '  THE ONLY INSTRUMENT HERE NOT MEDIATED BY THE (theta,z) PARAMETRISATION. A render shows a NORMAL;',
      '  this is the automated form of the human inspection that found the defect all four others missed.',
      `  deviation (deg)       p50 ${nc.degP50.toFixed(4)}   p90 ${nc.degP90.toFixed(4)}   p99 ${nc.degP99.toFixed(4)}   MAX ${nc.degMax.toFixed(4)}`,
      `    max-locus  ${locus(nc.degMaxTri)}`,
      `  off-locus counts      >=15 ${nc.over15}   >=30 ${nc.over30}   >=45 ${nc.over45}   >=60 ${nc.over60}   >=90 ${nc.over90}   >=120 ${nc.over120}   >=150 ${nc.over150}`,
      `  histogram, 12 bins of 15 deg: ${nc.hist.join(' ')}`,
      `  mesh winds ${nc.windSign > 0 ? 'OUTWARD' : nc.windSign < 0 ? '*** INWARD ***' : '*** AMBIGUOUS ***'} (${(100 * nc.windAgreeFrac).toFixed(2)}% of a ${nc.windSample}-facet stride sample)`,
      `  facets straddling a detected C0 locus: ${nc.nOnLocus}${nc.nOnLocus === 0 ? ' — NOTHING excluded, the gate saw every facet' : ` *** EXCLUDED FROM THE NORMAL GATE (${((100 * nc.nOnLocus) / Math.max(1, nc.nTri)).toFixed(4)}% of the mesh), ${nc.nBackFacingOnLocus} of them back-facing — READ THAT GATE AS PARTIAL ***`}`,
      `  ${(nc.rEvals / 1e6).toFixed(1)}M rA evals   ${nc.secs.toFixed(1)}s   step h_theta ${nc.hTh.toExponential(1)} rad  h_z ${nc.hZ.toExponential(1)} mm`);

    // ══════════════════ THE GATES — evaluated here, printed here, before any fidelity number ══════════════
    const gates: GateResult[] = [
      foldGate(sc, GRAPH),
      normalGate(nc),
      bladeGate(sc, GUARD_AR),
      topologyGate(sc, EXPECT_BOUNDARY),
    ];
    const gateBlock = renderGates(gates);
    lines.push(...gateBlock.lines);
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    let h1Reading: DirectionReading = NOT_RUN;
    let h2Reading: DirectionReading = NOT_RUN;

    // ══════════════════ H1 — MESH -> SURFACE, certified 1-Lipschitz bound ══════════════════
    if (DO_H1) {
      const tH1 = Date.now();
      // A RUNNING TOP-K BY VALUE, not the first K*8 encountered. The old collector pushed a facet only while
      // `offTri.length < TOPK*8`, in triangle-index order — and triangle order follows construction order,
      // which is essentially theta-major, so the collection window closed after one angular sector and the
      // "worst TOPK" that got the expensive global confirm was really "the worst of the first 192 in one
      // sector". Keep the genuine top K instead; it costs an insertion into a K-element array.
      // It now also carries an explicit tie-break (value desc, then triangle index asc) — see `h1Before` in
      // _facetTruthH1.ts. Without it, which of several exactly-equal facets is NAMED as the witness depends
      // on which worker thread reached it first, and "reproduce the exact values" becomes unmeetable.
      //
      // WALK THE MESH WITH A STRIDE, NOT AS A PREFIX. A budget/time cap breaks out of this loop, and walking
      // in index order meant a capped run audited a contiguous angular SECTOR while reporting its numbers as
      // if they described the mesh (MEASURED: GothicArches audited 22.4% in 1201 s). An odd stride visits the
      // whole mesh in one pass regardless of where the cap lands, so a partial audit is a uniform sample.
      // The stride is coprime to nTri by construction, so every triangle is visited exactly once.
      // THE STRIDE MUST BE LARGE, NOT SMALL. Any stride coprime to nTri visits every triangle exactly once
      // over the FULL walk, but that is not the property this needs — the walk is nearly always cut short by
      // the budget, so what matters is that a PREFIX is spread over the whole mesh. A small stride fails
      // that badly: at stride 27 a 21-facet prefix covers indices 0..540 of 202,210, which is a low-index
      // band, and the report would still print "uniform sample of the whole mesh". MEASURED: exactly that
      // happened — the stage-3 top-8 of a capped run all sat between tri 351 and tri 540.
      // The golden-ratio stride is the standard low-discrepancy choice: successive prefixes fill the index
      // range as evenly as any additive sequence can, so a run cut off at ANY point is a uniform sample.
      const stride = (() => {
        const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
        let s = Math.max(1, Math.round(nTri * 0.6180339887498949) | 1);
        while (s > 1 && gcd(s, nTri) !== 1) s += 2;
        return s >= nTri ? 1 : s;
      })();
      // PF_FT_H1MAX — audit exactly the first N facets OF THE WALK and stop. Default nTri, i.e. off. This is
      // not a performance lever: it is what makes serial-vs-pooled an exact comparison, because two runs
      // stopped by a CLOCK audit different prefixes and their headline numbers are then incomparable by
      // construction. Same N ⇒ same audited SET ⇒ the two reports must agree digit for digit.
      const kEnd = Math.max(1, Math.min(nTri, Math.round(envF('PF_FT_H1MAX', nTri))));
      const job: H1Job = {
        nTri, stride, kEnd, H, tol: TOL, nMax: NMAX, sampleCap: 4e6,
        zJumps, thJumps, topK: TOPK, deadlineMs: tH1 + H1SECS * 1000,
      };
      let merged: H1Partial;
      let poolLine: string;
      if (USE_POOL && sab !== null) {
        // The parent's own rA over the verification lattice. Computed HERE, from the same closure the serial
        // path would have used, so the comparison is against the surface actually in play — not a re-derived one.
        const lat = radiusLattice(H, zJumps, thJumps);
        const expectLat = new Float64Array(lat.th.length);
        for (let i = 0; i < expectLat.length; i += 1) expectLat[i] = rA(lat.th[i], lat.z[i]);
        const out = await runH1Pool({
          sab, job, chunkMax: CHUNKMAX, budget: BUDGET, workers: WORKERS,
          style: STYLE, styleParams, dims: DIMS,
          expectLat, latTh: lat.th, latZ: lat.z, workerHeapMb: WORKERMB,
        });
        merged = out.merged;
        poolREvals = merged.rEvals; // spent inside the workers, so not in the parent's counter
        poolLine = `  POOLED: ${out.workers} worker threads, atomic cursor, chunk ${out.chunk} facets, esbuild worker bundle ${out.bundleMs} ms`
          + `\n    per-worker rA rebuilt from (style, params, dims) and VERIFIED bit-identical to the parent's BEFORE the walk`
          + ` — ${out.latPoints} (worker x lattice-point) comparisons over ${expectLat.length} points (C0-bracketed + clamp boundaries):`
          + ` ${out.latDiffCount} differing, max deviation ${out.latMaxDev.toExponential(3)} mm`;
      } else {
        // SERIAL FALLBACK — the same `runH1Walk`, handed a claim that yields the whole range once.
        let total = 0; let done = false;
        const evals0 = auditR.evals();
        merged = runH1Walk(rA, xyz, job,
          () => { if (done) return null; done = true; return [0, kEnd] as const; },
          (n) => { total += n; return total > BUDGET; },
          () => auditR.evals() - evals0);
        poolLine = `  SERIAL: 1 thread (PF_FT_WORKERS=${WORKERS})`;
      }
      const { audited, samples, worstUB, worstUBTri, nOver, nUncert, nIncomplete, kD, kTri, kP } = merged;
      // Stopping early leaves triangles UNSEEN, and an unseen triangle is not a passing triangle. The audited
      // count is reported alongside nTri and the verdict is downgraded to INCOMPLETE, because a partial sweep
      // that prints PASS is exactly the failure this instrument exists to eliminate.
      const capped = audited < nTri;
      const conf = kD.map((d, i) => {
        const g = distPerp(rA, H, kP[i * 3], kP[i * 3 + 1], kP[i * 3 + 2], { zJumps, thJumps });
        return { tri: kTri[i], fast: d, truth: g.d, th: g.th, z: g.z };
      });
      // THE HEADLINE MUST BE THE BEST ESTIMATE THE TOOL HAS, NOT THE CHEAPEST ONE. The per-triangle value
      // comes from a LOCAL descent seeded at the radial foot; stage 3 sweeps the whole domain and polishes
      // several wells, and on the smooth styles it came back roughly 2x lower (WaveInterference 20.671 ->
      // 10.784, SpiralRidges 20.597 -> 10.602, HarmonicRipple 23.955 -> 13.963). Since every candidate
      // distance is an UPPER bound on the true one, the smaller number is the better one.
      //
      // BUT THE MAX MUST BE RE-TAKEN OVER THE CONFIRMED SET, NOT LOWERED IN PLACE. The previous version took
      // the argmax facet, re-measured that ONE point, and assigned the result straight to the headline —
      // a maximum over facets reduced by re-measuring a single member of the set. Facet A reading 20 um and
      // confirming to 5 um would then print 5 um for a mesh whose facet B genuinely sits at 18 um: a false
      // PASS in the unsafe direction, and the same defect the per-facet certifier was just repaired for.
      // Confirm the whole top K and take the max of the confirmed values.
      let worstWit = 0; let worstWitTri = -1; let wx = 0; let wy = 0; let wz = 0;
      for (let i = 0; i < conf.length; i += 1) {
        const c = conf[i];
        const v = Math.min(c.fast, c.truth);
        if (v > worstWit) { worstWit = v; worstWitTri = c.tri; wx = kP[i * 3]; wy = kP[i * 3 + 1]; wz = kP[i * 3 + 2]; }
      }
      const h1Secs = (Date.now() - tH1) / 1000;
      const coverage = `audited ${audited}/${nTri} triangles (stride ${stride})${kEnd < nTri ? `, walk capped at PF_FT_H1MAX=${kEnd}` : ''}${capped ? ' — INCOMPLETE' : ''}`;
      h1Reading = {
        ran: true, complete: !capped, certified: true,
        witnessedMm: worstWit, boundMm: worstUB, coverage,
      };
      lines.push('',
        '--- H1  MESH -> SURFACE   (certified: bound = witnessed + covering radius; TRUE PERPENDICULAR distance) ---',
        '  MEASUREMENTS, NOT A VERDICT — the verdict block at the end of this report is the only place a',
        '  PASS or FAIL may be read from, and it requires BOTH directions to have run.',
        poolLine,
        `  ${(samples / 1e6).toFixed(1)}M lattice samples   ${h1Secs.toFixed(0)}s   audited ${audited}/${nTri} triangles (stride ${stride}, uniform sample of the whole mesh)${kEnd < nTri ? `   [walk capped at PF_FT_H1MAX=${kEnd} facets]` : ''}${capped ? '   *** INCOMPLETE — budget/time/facet cap hit, the unseen triangles are UNKNOWN, not passing ***' : ''}`,
        `  throughput ${(audited / Math.max(1e-9, h1Secs)).toFixed(2)} facets/s   ${(1000 * h1Secs / Math.max(1, audited)).toFixed(1)} ms/facet   ${(merged.rEvals / 1e6).toFixed(1)}M rA evals in H1`,
        `  CERTIFIED UPPER BOUND : ${um(worstUB)} um   ${worstUB <= TOL ? 'within TOL' : 'OVER TOL'}   ${shapeStamp}`,
        '    (the bound is built from the per-triangle LOCAL estimate, which over-states; so "within TOL" is',
        '     sound, while "OVER TOL" may be pessimistic — compare the global confirm below before believing it)',
        `    bound-locus   ${locus(worstUBTri)}`,
        `  WITNESSED max         : ${um(worstWit)} um   ${worstWit <= TOL ? 'within TOL' : 'OVER TOL'}   (max over the globally-confirmed top ${conf.length})   ${shapeStamp}`,
        // The confirmed max is taken over the top K by LOCAL reading. A facet ranked K+1 could confirm
        // higher than a top-K facet that collapsed under confirmation, so state the residual explicitly:
        // every unconfirmed facet is bounded by its own local reading, hence by the K-th largest of them.
        `    facets outside the confirmed top ${conf.length} are bounded by ${um(kD.length > 0 ? kD[kD.length - 1] : 0)} um (their unconfirmed local readings)`,
        `    witness-locus ${locus(worstWitTri)}   at xyz ${wx.toFixed(5)},${wy.toFixed(5)},${wz.toFixed(5)}`,
        `  triangles with a witnessed exceedance : ${nOver} / ${audited} audited = ${((100 * nOver) / Math.max(1, audited)).toFixed(2)}% OVER TOL`,
        `  triangles left UNCERTIFIED            : ${nUncert}`,
        `  facets whose witnessed value is NOT a converged max (short-circuit or cap): ${nIncomplete} / ${audited}`,
        `  stage-3 global confirm of worst ${conf.length} (genuine top-${TOPK} by value): ${um(conf.reduce((m, c) => Math.max(m, c.truth), 0))} um`,
        ...conf.slice(0, 8).map((c) => `    tri ${c.tri}  fast ${um(c.fast)} -> global ${um(c.truth)} um  @th=${c.th.toFixed(5)} z=${c.z.toFixed(4)}`));
    }

    // ══════════════════ H2 — SURFACE -> MESH, adaptive, exact point-to-triangle ══════════════════
    if (DO_H2) {
      // soup RefMesh: the audited STL verbatim, no welding, no reinterpretation
      const idx = new Uint32Array(nTri * 3);
      for (let i = 0; i < nTri * 3; i += 1) idx[i] = i;
      const ref: RefMesh = { xyz, idx, nV: nTri * 3, nF: nTri };
      const cell = pickLocatorCell(xyz, idx, nTri);
      const loc = buildRefLocator(ref, cell);
      const h2 = surfaceToMeshMax(rA, loc.dist, {
        H, tol: TOL, coveragePitch: H2PITCH, minPitch: H2MINPITCH, structN: H2STRUCTN,
        structLines: H2LINES, budget: H2BUDGET, timeBudgetMs: H2SECS * 1000,
        zMin: H2ZMIN, zMax: H2ZMAX,
        // The SAME discontinuity loci H1 gets. Without these H2 sweeps only the graph, so a tread wall or
        // curtain that the mesher omitted is forgiven by H1 and never visited by H2 — a blind spot shared
        // by both directions rather than covered by either.
        zJumps, thJumps,
        onProgress: (frac, q, mx) => {
          if (Math.round(frac * 512) % 64 !== 0) return;
          // eslint-disable-next-line no-console
          console.log(`  H2 coverage ${(frac * 100).toFixed(0)}%  ${(q / 1e6).toFixed(1)}M queries  ${((Date.now() - t0) / 1000).toFixed(0)}s  max ${um(mx)} um`);
        },
      });
      // h2.r, NOT rA(h2.th, h2.z): a witness found on a tread wall or curtain lies at a radius strictly
      // between the one-sided limits, so reconstructing it from the graph would re-measure a different point
      // and the brute-force cross-check below would silently compare the wrong thing.
      const rw = h2.r;
      const wxp = rw * Math.cos(h2.th); const wyp = rw * Math.sin(h2.th);
      const dt = loc.distTri(wxp, wyp, h2.z);
      // The locator prunes by expanding rings; a pruning bug would OVER-state distance and so manufacture a
      // FAIL. Re-measure the single reported argmax against every triangle in the mesh — one brute query is
      // cheap and settles it, so no H2 verdict rests on the acceleration structure being right.
      const brute = loc.bruteDist(wxp, wyp, h2.z);
      // ── WHAT `complete` IS KEYED ON, AND WHY IT IS NOT `h2.capped` (review finding 3, 2026-07-29) ──
      // H2's coverage guarantee is PHASE A: it sweeps the whole audited (theta,z) band on a uniform lattice
      // and NOTHING can truncate it — `capped` is assigned in exactly one place, inside the phase-B loop of
      // `surfaceToMeshMax`, so it reports that WORST-FIRST REFINEMENT ran out of budget. That is true of
      // essentially every real run, so keying `complete` on it made PASS unreachable by construction: the
      // judge would have printed "H2 refinement truncated by budget" and refused to certify forever.
      // WHAT CAN GENUINELY BREAK H2's COVERAGE IS AUDITING A SUB-BAND. PF_FT_ZMIN / PF_FT_ZMAX restrict phase
      // A itself, and a report that swept z 80..115 and called itself complete would be this pass's own
      // failure mode wearing a different hat. So: full band => complete. Phase-B truncation is a RESOLVING-
      // POWER statement, not a coverage one, and it travels in `coverage`, which judge() reprints inside the
      // PASS block so the two can never be quoted apart.
      const fullBand = h2.zLo <= 0 && h2.zHi >= H;
      h2Reading = {
        ran: true, complete: fullBand, certified: false,
        witnessedMm: h2.max, boundMm: Infinity,
        coverage: `${(h2.queries / 1e6).toFixed(1)}M queries; phase-A UNIFORM coverage of z ${h2.zLo.toFixed(2)}..${h2.zHi.toFixed(2)} mm`
          + `${fullBand ? ' (the FULL band)' : ' *** SUB-BAND — the rest of the surface was NOT audited ***'}`
          + ` at structure pitch ${um(h2.structPitchUniform)} um`
          + `${h2.capped ? '; phase-B refinement TRUNCATED by budget, so the max is a floor AT THAT RESOLVING POWER' : '; phase-B refinement ran to exhaustion'}`,
      };
      lines.push('',
        '--- H2  SURFACE -> MESH   (witnessed lower bound; every reading is an exact point-to-triangle distance) ---',
        '  MEASUREMENTS, NOT A VERDICT — see the verdict block at the end of this report.',
        // structPitchUniform is the ACROSS-line gap of the structure cross — the honest area guarantee.
        // structPitchAlong is the along-line spacing, which is what this line used to print under the
        // "guarantee" label and what the historical series in this report is comparable to; both are shown
        // so a jump in the headline number is not mistaken for a change in the mesh.
        `  ${(h2.queries / 1e6).toFixed(1)}M locator queries, ${(h2.rEvalsStruct / 1e6).toFixed(0)}M structure evals, ${h2.secs.toFixed(0)}s   structure pitch ${um(h2.structPitchUniform)} um UNIFORM (the resolving-power guarantee; across-line gap) / ${um(h2.structPitchAlong)} um along-line / ${um(h2.structPitch)} um finest reached   locator cell ${cell.toFixed(3)} mm`,
        // The "phase-A still completed" clause is only true over the band phase A was ASKED to sweep, so the
        // band is stated with it. A sub-band audit (PF_FT_ZMIN/PF_FT_ZMAX) is NOT complete coverage and the
        // verdict block blocks PASS on it — see the `fullBand` note above.
        `  ${h2.capped ? 'phase-B refinement TRUNCATED by budget (phase-A coverage still completed in full over the audited band, so this is a floor)' : 'refinement ran to exhaustion — no cell left that could beat the reported max'}`
          + `${fullBand ? '' : `   *** SUB-BAND AUDIT: z ${h2.zLo.toFixed(2)}..${h2.zHi.toFixed(2)} of 0..${H} — the rest of the surface was NEVER QUERIED ***`}`,
        `  WITNESSED max : ${um(h2.max)} um   ${h2.max <= TOL ? 'within TOL' : 'OVER TOL'}   [brute-force re-check of this point: ${um(brute)} um]   ${shapeStamp}`,
        `    at th=${h2.th.toFixed(6)} z=${h2.z.toFixed(5)}  r=${rw.toFixed(5)}  nearest tri ${dt.tri}`,
        `    nearest-tri locus ${locus(dt.tri)}`,
        `  leaf cells still over TOL at max depth : ${h2.hotLeaves}`,
        `  audited z band ${h2.zLo.toFixed(2)}..${h2.zHi.toFixed(2)} mm   samples over TOL: ${h2.overCount} / ${h2.queries} = ${((100 * h2.overCount) / Math.max(1, h2.queries)).toFixed(5)}%`,
        `  z-histogram of exceedances (24 bins, base -> rim): ${h2.overZHist.join(' ')}`);
    }

    // ══════════════════ A/B against the old ruler on the same triangles ══════════════════
    if (OLD) {
      const AUD_HS = 0.03; const AUD_NMIN = 12; const AUD_NMAX = 64;
      let oldMax = 0; let oldMaxTri = -1;
      for (let t = 0; t < nTri; t += 1) {
        const o = t * 9;
        const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
        const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
        const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
        let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
        let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-18) continue;
        nx /= nl; ny /= nl; nz /= nl;
        const le = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
        const n = Math.max(AUD_NMIN, Math.min(AUD_NMAX, Math.ceil(le / AUD_HS)));
        const tA = Math.atan2(ay, ax);
        const un = (x: number): number => { let d = x - tA; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; };
        const dB = un(Math.atan2(by, bx)); const dC = un(Math.atan2(cy, cx));
        let s = 0;
        for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n - i; j += 1) {
          const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
          const th = tA + wb * dB + wc * dC;
          const z = wa * az + wb * bz + wc * cz;
          const r = rA(th, z);
          const dd = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
          if (dd > s) s = dd;
        }
        if (s > oldMax) { oldMax = s; oldMaxTri = t; }
      }
      lines.push('', '--- A/B: the OLD ruler on the SAME mesh (plane distance, n in [12,64] @ 0.03 mm pitch) ---',
        `  old-ruler MAX ${um(oldMax)} um   locus ${locus(oldMaxTri)}`);
    }

    // ══════════════════ THE VERDICT — the ONE place PASS or FAIL may be written ══════════════════
    const outcome = judge({ tolMm: TOL, gates, h1: h1Reading, h2: h2Reading });
    lines.push(...outcome.lines);

    lines.push('', `${((Date.now() - t0) / 1000).toFixed(0)}s   ${((auditR.evals() + poolREvals) / 1e6).toFixed(1)}M rA evals`,
      '=========================================================');
    const report = lines.join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
    const outDir = join('research', 'exchange', '_strataFacetTruth');
    mkdirSync(outDir, { recursive: true });
    // WRITTEN BEFORE THE STRICT THROW, so a failing strict run still leaves its artifact on disk.
    writeFileSync(join(outDir, `${tag}.report.txt`), report);
    expect(nTri).toBeGreaterThan(0);
    if (STRICT && outcome.verdict !== 'PASS') {
      throw new Error(`PF_FT_STRICT: verdict ${outcome.verdict} — ${outcome.reasons.join('; ')}`);
    }
  }, 24 * 60 * 60 * 1000);
});
