// _phase2Audit.test.ts — PHASE 2, STEP 1: run the honest certificate and EMIT THE EXCEEDANCE SET.
// Gated PF_P2_AUDIT=1. RESEARCH ONLY — never touches src/.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS IS, AND WHY IT IS NOT AN EDIT TO THE AUDITOR
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// `surfaceToMeshMax` already counts exceedances (`overCount`) and bins them by z (`overZHist`). What Phase 2
// needs is the per-sample LOCI, and the cheapest sound way to get them turned out to require NO CHANGE TO
// ANY PROVEN FILE:
//
//     `surfaceToMeshMax(rA, distToMesh, opts)` takes the locator as a PARAMETER. Wrapping it in a pure
//     decorator that records (x, y, z, d) whenever d > tol and returns the identical double changes nothing
//     the routine computes. `_facetTruthLib.ts`, `_h2PhaseA.ts`, `_strataFacetTruth.test.ts` and the whole
//     `_facetTruth*` / `_h2*` / `_sweep*` family are untouched, so the hard gate cannot move by construction
//     rather than by measurement.
//
// AND IT IS SELF-CHECKING. `distToMesh` is called from exactly two places in the auditor — `h2Query` (phases
// A and B) and `wallQuery` (phase C) — and each of them counts an exceedance on exactly the same `d > tol`
// test. So the recorder MUST see every query and MUST book every exceedance:
//
//     queriesSeen === h2.queries            and            rawCount === h2.overCount
//
// Both are asserted. A wrapper that missed a call path, or a tol that drifted between the two, fails here
// rather than silently emitting a loci set that is a subset of the real one — which would send the driver to
// refine the wrong places and look like a Phase-2 refutation.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE ONE REAL COST: THIS RUN IS SERIAL, AND IT SAYS SO
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// H2 phase A can be pooled (`PF_FT_H2WORKERS`, byte-equal 1-vs-8). A POOLED phase A rebuilds `distToMesh`
// INSIDE each worker from a recipe, so a caller-side decorator never runs there and most exceedances would
// simply not be recorded — while the reported max and overCount would look perfectly normal. That is a
// silent, partial loci set, i.e. the worst possible failure for a feedback loop. So this harness refuses the
// pool instead of quietly under-recording, and the emitting audit costs what an audit cost before the pool
// landed. Wiring the pool would mean adding a locus channel to `_h2PhaseA` / `_h2Pool` / `_h2PhaseAWorker`,
// which are freshly landed and proven; that is a deliberate NOT-NOW, not an oversight.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// ACCUMULATION LIVES IN THE FILE, NOT IN THE DRIVER
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// A locus that iteration i CLOSED does not appear in iteration i+1's exceedance set. If each file carried
// only the newest exceedances, iteration i+1 would re-mesh FROM SCRATCH with no tightening there, the error
// would come back, and the loop would oscillate forever between two meshes without either being wrong.
// So the emitted file is CUMULATIVE: every cluster of the field the audited run CONSUMED is carried forward
// with its scale, and a cluster that exceeded AGAIN has its scale multiplied by the step factor.
// The field is therefore pointwise MONOTONE across iterations — asserted here, not assumed — while the
// DRIVER stays a pure function of (flags, one file), which is the property that makes a run reproducible.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import type { StyleDims } from './labkit';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';
import { detectThetaJumps, detectZJumps, pickLocatorCell, surfaceToMeshMax } from './_facetTruthLib';
import { buildAuditRadiusFn } from './_facetTruthRA';
import { readMeshFloat64 } from './_facetTruthPool';
import {
  PHASE2_LOCI_SCHEMA, PHASE2_RUN_SCHEMA, buildTightenField, clusterExceedances, phase2Key, readLociFile,
  predictTightenedCount, readRunManifest, scaleFromSlope, writeJsonFile,
  type Phase2Cluster, type Phase2LociFile, type Phase2RunManifest, type RawExceedance,
} from './_phase2Loci';

const RUN = process.env.PF_P2_AUDIT === '1';
const TWO_PI = 2 * Math.PI;

function envF(n: string, d: number): number {
  const r = process.env[n];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}
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
const um = (mm: number): string => (mm * 1000).toFixed(3);

describe('PHASE 2 — honest certificate, emitting the exceedance set', () => {
  it.runIf(RUN)('audits a mesh and writes the tightening loci', () => {
    // ── INPUT. The normal path is the driver's own run manifest (`<tag>.run.json`, written beside the STL),
    // which carries style / params / dims / tol / stage as a payload. Auditing a mesh whose surface you have
    // to name by hand is how a GothicArches loci set ends up steering a GeometricStar run.
    const runPath = process.env.PF_P2_RUN ?? '';
    const manifest: Phase2RunManifest | null = runPath === '' ? null : readRunManifest(runPath);
    const DIMS: StyleDims = manifest === null
      ? { H: envF('PF_P2_H', 120), Rb: envF('PF_P2_RB', 40), Rt: envF('PF_P2_RT', 50), expn: envF('PF_P2_EXPN', 1) }
      : manifest.dims;
    const H = manifest === null ? DIMS.H : manifest.H;
    const STYLE = manifest === null ? (process.env.PF_P2_STYLE ?? 'GothicArches') : manifest.style;
    const STAGE = manifest === null ? (process.env.PF_P2_STAGE ?? 'ring') : manifest.stage;
    const TOL = manifest === null ? envF('PF_P2_TOL_UM', 10) / 1000 : manifest.tolMm;
    const styleParams: Record<string, number> = manifest === null ? { ...registryDefaults(STYLE) } : manifest.params;
    if (manifest === null && process.env.PF_P2_PARAMS !== undefined) {
      Object.assign(styleParams, JSON.parse(process.env.PF_P2_PARAMS) as Record<string, number>);
    }
    const stlPath = process.env.PF_P2_STL
      ?? (manifest === null ? '' : join(dirname(runPath), manifest.stl));
    if (stlPath === '') throw new Error('PF_P2_RUN (preferred) or PF_P2_STL is required');
    if (!existsSync(stlPath)) throw new Error(`PF_P2_STL: no such file ${stlPath}`);
    // A manifest names its own STL. Auditing a DIFFERENT mesh while copying that manifest verbatim into the
    // loci file would put the whole provenance chain a step out of phase — the file would truthfully describe
    // a run that did not produce the audited geometry, and every downstream check would pass.
    if (manifest !== null && process.env.PF_P2_STL !== undefined
      && resolve(process.env.PF_P2_STL) !== resolve(join(dirname(runPath), manifest.stl))) {
      throw new Error(
        `PF_P2_STL=${process.env.PF_P2_STL} is not the mesh PF_P2_RUN describes `
        + `(${join(dirname(runPath), manifest.stl)}). Drop one of the two.`,
      );
    }

    // ── SAMPLER CONTROLS. Defaults match _strataFacetTruth.test.ts's H2 block so the two harnesses report the
    // same number on the same mesh; anything else would make Phase 2's input incomparable with the campaign's
    // published H2 series.
    const PITCH = envF('PF_P2_PITCH_UM', 40) / 1000;
    const MINPITCH = envF('PF_P2_MINPITCH_UM', 1.25) / 1000;
    const STRUCTN = Math.round(envF('PF_P2_STRUCTN', 48));
    const LINES = Math.round(envF('PF_P2_LINES', 5));
    const BUDGET = envF('PF_P2_BUDGET', 1.5e8);
    const SECS = envF('PF_P2_SECS', 900);
    const ZMIN = envF('PF_P2_ZMIN', 0);
    const ZMAX = envF('PF_P2_ZMAX', H);

    // ── FIELD CONTROLS. See the long note on the factor below.
    const RADIUS = envF('PF_P2_RADIUS_UM', 500) / 1000;
    const CLUSTER = envF('PF_P2_CLUSTER_UM', 250) / 1000;
    const FACTOR = envF('PF_P2_FACTOR', 2);
    const MODE = (process.env.PF_P2_MODE ?? 'fixed') === 'slope' ? 'slope' : 'fixed';
    const SLOPE = envF('PF_P2_SLOPE', 1.45);
    const MAXSCALE = envF('PF_P2_MAXSCALE', 64);
    const MAXCLUSTERS = Math.round(envF('PF_P2_MAXCLUSTERS', 20000));
    const RAWCAP = Math.round(envF('PF_P2_RAWCAP', 4_000_000));
    const CARRY = process.env.PF_P2_CARRY !== '0';
    const outPath = process.env.PF_P2_OUT
      ?? join('research', 'exchange', '_phase2', `${basename(stlPath).replace(/\.stl$/i, '')}.loci.json`);

    // THE POOL IS REFUSED, NOT SILENTLY IGNORED. See the header: a pooled phase A rebuilds `distToMesh`
    // inside the worker, so this file's recorder would never run there and the loci set would be a silent
    // partial. `PF_FT_H2WORKERS` is the pool's own knob and is checked by name so a run that thinks it is
    // parallel cannot become a run that emits three quarters of its evidence.
    const wRaw = process.env.PF_FT_H2WORKERS;
    if (wRaw !== undefined && wRaw !== '' && Number.parseInt(wRaw, 10) > 1) {
      throw new Error(
        `PF_FT_H2WORKERS=${wRaw}: the emitting audit is SERIAL by necessity — a pooled phase A rebuilds `
        + `distToMesh inside each worker, where this harness's exceedance recorder does not run, and the `
        + `emitted loci set would be a SILENT PARTIAL. Unset it (or set 1).`,
      );
    }

    const auditR = buildAuditRadiusFn(STYLE, styleParams, DIMS, H);
    const rA = auditR.rA;
    const { xyz, nTri } = readMeshFloat64(stlPath, false);

    // ── PROVENANCE GUARD on the mesh itself, same shape as _strataFacetTruth's: a style/param/dims mismatch
    // moves the radial extents by millimetres while a real fidelity defect moves them by microns, so a
    // generous band is a wrong-artifact detector and not a fidelity gate.
    let meshArea = 0;
    let meshRMax = 0;
    {
      let obsRLo = Infinity; let obsRHi = -Infinity; let obsZLo = Infinity; let obsZHi = -Infinity;
      for (let i = 0; i < nTri * 9; i += 3) {
        const r = Math.hypot(xyz[i], xyz[i + 1]); const z = xyz[i + 2];
        if (r < obsRLo) obsRLo = r; if (r > obsRHi) obsRHi = r;
        if (z < obsZLo) obsZLo = z; if (z > obsZHi) obsZHi = z;
      }
      meshRMax = obsRHi;
      for (let t = 0; t < nTri; t += 1) {
        const o = t * 9;
        const ux = xyz[o + 3] - xyz[o]; const uy = xyz[o + 4] - xyz[o + 1]; const uz = xyz[o + 5] - xyz[o + 2];
        const vx2 = xyz[o + 6] - xyz[o]; const vy2 = xyz[o + 7] - xyz[o + 1]; const vz2 = xyz[o + 8] - xyz[o + 2];
        meshArea += 0.5 * Math.hypot(uy * vz2 - uz * vy2, uz * vx2 - ux * vz2, ux * vy2 - uy * vx2);
      }
      let anaRLo = Infinity; let anaRHi = -Infinity;
      for (let i = 0; i < 256; i += 1) {
        const th = (TWO_PI * i) / 256;
        for (let j = 0; j <= 128; j += 1) {
          const r = rA(th, (H * j) / 128);
          if (r < anaRLo) anaRLo = r; if (r > anaRHi) anaRHi = r;
        }
      }
      const slack = 0.05 * Math.max(1, anaRHi - anaRLo) + 1.0;
      if (obsRHi > anaRHi + slack || obsRLo < anaRLo - slack || obsZHi > H + 1 || obsZLo < -1) {
        throw new Error(
          `PROVENANCE: ${stlPath} does not match the ${STYLE} surface it would be scored against.\n`
          + `  observed r [${obsRLo.toFixed(3)}, ${obsRHi.toFixed(3)}]  z [${obsZLo.toFixed(3)}, ${obsZHi.toFixed(3)}]\n`
          + `  analytic r [${anaRLo.toFixed(3)}, ${anaRHi.toFixed(3)}]  H=${H}`,
        );
      }
    }

    const idx = new Uint32Array(nTri * 3);
    for (let i = 0; i < nTri * 3; i += 1) idx[i] = i;
    const ref: RefMesh = { xyz, idx, nV: nTri * 3, nF: nTri };
    const cell = pickLocatorCell(xyz, idx, nTri);
    const loc = buildRefLocator(ref, cell);
    const zJumps = detectZJumps(rA, H);
    const thJumps = detectThetaJumps(rA, H);

    // ── THE RECORDER. A pure decorator: it returns `loc.dist`'s own double, so nothing the auditor computes
    // can move. Cartesian in, Cartesian out — deliberately, because a phase-C witness lies on a tread wall or
    // curtain at a radius strictly BETWEEN the one-sided limits, and reconstructing it as rA(th,z) would name
    // a different point on the graph.
    const rx: number[] = []; const ry: number[] = []; const rz: number[] = []; const rd: number[] = [];
    let queriesSeen = 0; let rawCount = 0; let rawCapped = false;
    const dist = (x: number, y: number, z: number): number => {
      const d = loc.dist(x, y, z);
      queriesSeen += 1;
      if (d > TOL) {
        rawCount += 1;
        if (rx.length < RAWCAP) { rx.push(x); ry.push(y); rz.push(z); rd.push(d); } else rawCapped = true;
      }
      return d;
    };

    const t0 = Date.now();
    const h2 = surfaceToMeshMax(rA, dist, {
      H, tol: TOL, coveragePitch: PITCH, minPitch: MINPITCH, structN: STRUCTN, structLines: LINES,
      budget: BUDGET, timeBudgetMs: SECS * 1000, zMin: ZMIN, zMax: ZMAX, zJumps, thJumps,
      onProgress: (frac, q, mx) => {
        if (Math.round(frac * 512) % 64 !== 0) return;
        // eslint-disable-next-line no-console
        console.log(`  H2 coverage ${(frac * 100).toFixed(0)}%  ${(q / 1e6).toFixed(1)}M queries  ${((Date.now() - t0) / 1000).toFixed(0)}s  max ${um(mx)} µm`);
      },
    });

    // ── THE TWO IDENTITIES THAT MAKE THE LOCI SET THE AUDIT'S OWN EXCEEDANCE SET, not a resampling of it.
    expect(queriesSeen).toBe(h2.queries);
    if (!rawCapped) expect(rawCount).toBe(h2.overCount);

    // ── CLUSTER. Grid-snap is deterministic and coarsens by DOUBLING when it overflows, never by dropping
    // the smallest clusters — a magnitude-dependent filter would be exactly the hidden state the field is
    // forbidden to have.
    const raw: RawExceedance[] = rx.map((x, i) => ({ x, y: ry[i], z: rz[i], d: rd[i] }));
    const { cells, clusterMm, coarsenings } = clusterExceedances(raw, CLUSTER, MAXCLUSTERS);

    // ── THE STEP FACTOR, AND WHY 2.
    // Spec §5.3 writes the feedback in h: k = ceil(log2(E/tol)/log2(s)) halvings, s in [1.45, 3.2] measured.
    // The driver's lever is `acceptTol`, a threshold on a PLANE-distance witness, and plane distance on a
    // smooth patch is curvature*h^2/8 — so acceptTol ~ h^2 and ONE halving of h is a divisor of FOUR on
    // acceptTol, not two. Reading "one halving" as "acceptTol/2" under-tightens by a square root.
    // Applied to D25 (E = 19.247 µm, tol = 10 µm, so E/tol = 1.92):
    //     optimistic s = 3.2   ⇒ k = 1 ⇒ acceptTol / 4
    //     pessimistic s = 1.45 ⇒ k = 2 ⇒ acceptTol / 16
    // The DEFAULT here is a FIXED divisor of 2, i.e. HALF a halving of h and deliberately the smallest step
    // that can move anything, for three reasons and they are all about not spending the answer on the first
    // guess: (a) the local slope at these loci has never been measured — 1.45-3.2 is a whole-mesh range and
    // §5.3 itself says to switch to a measured s once one child has been re-certified; (b) triangles in a
    // tightened ball scale as the divisor (tris ~ 1/h^2 ~ 1/acceptTol), so 16 on a 4 %-of-surface region is
    // ~+60 % of the whole mesh, and D25 finished at 1.80M of a 2.5M cap — one wrong guess caps the run and
    // the iteration reports nothing; (c) the outer loop is the mechanism, so under-stepping costs an
    // iteration while over-stepping costs the budget. PF_P2_MODE=slope switches to the §5.3 formula and
    // PF_P2_FACTOR moves the fixed step; both are recorded in the file, so a run always says which it used.
    const stepFor = (maxErr: number): number => (MODE === 'slope'
      ? scaleFromSlope(maxErr, TOL, SLOPE, MAXSCALE)
      : Math.min(MAXSCALE, Math.max(1, FACTOR)));

    // ── CARRY. Union of the field the audited run consumed with the new exceedances (see the header).
    const prevPath = manifest?.tighten?.file ?? '';
    const prev = CARRY && prevPath !== '' && existsSync(prevPath) ? readLociFile(prevPath) : null;
    const acc = new Map<string, Phase2Cluster>();
    const key3 = (x: number, y: number, z: number): string => `${Math.floor(x / clusterMm)},${Math.floor(y / clusterMm)},${Math.floor(z / clusterMm)}`;
    if (prev !== null) {
      for (const c of prev.clusters) {
        acc.set(key3(c.x, c.y, c.z), { ...c, tolScale: Math.max(1, c.tolScale) });
      }
    }
    let newSites = 0; let escalated = 0;
    for (const [, p] of cells) {
      const k = key3(p.x, p.y, p.z);
      const th = ((Math.atan2(p.y, p.x) % TWO_PI) + TWO_PI) % TWO_PI;
      const r = Math.hypot(p.x, p.y);
      const cur = acc.get(k);
      const step = stepFor(p.d);
      if (cur === undefined) {
        newSites += 1;
        acc.set(k, { th, z: p.z, r, x: p.x, y: p.y, count: p.count, maxErrMm: p.d, tolScale: Math.min(MAXSCALE, step) });
      } else {
        escalated += 1;
        cur.count += p.count;
        if (p.d > cur.maxErrMm) { cur.maxErrMm = p.d; cur.th = th; cur.z = p.z; cur.r = r; cur.x = p.x; cur.y = p.y; }
        cur.tolScale = Math.min(MAXSCALE, cur.tolScale * step);
      }
    }
    // DETERMINISTIC ORDER. A Map iterates in insertion order, which depends on which loci were seen first —
    // fine for the field (a max over balls is order-free) but not for a file that gets diffed between runs.
    const clusters = [...acc.values()].sort((a, b) => (a.x - b.x) || (a.y - b.y) || (a.z - b.z));

    const outFile: Phase2LociFile = {
      schema: PHASE2_LOCI_SCHEMA,
      run: manifest ?? {
        schema: PHASE2_RUN_SCHEMA,
        style: STYLE, params: styleParams, dims: DIMS, H, stage: STAGE,
        tolMm: TOL, acceptTolMm: envF('PF_P2_ACCEPT', 0.007), gridU: 0, gridV: 0, triCap: 0,
        driver: 'unknown', rank: 'unknown', directed: false, snap: false, reproj: false,
        key: phase2Key(STYLE, styleParams, DIMS, TOL, STAGE),
        tag: '<synthesized>', stl: basename(stlPath), nTri, alloc: 0,
        unresolvedLeft: 0, capped: false, timeCapped: false, curtainSites: 0,
        verdict: 'unknown', headlineMaxMm: 0, secs: 0, tighten: null,
        generatedAt: new Date().toISOString(),
      },
      audit: {
        tool: 'research/bridge/_phase2Audit.test.ts',
        stlPath, nTri, tolMm: TOL, coveragePitchMm: PITCH, minPitchMm: MINPITCH,
        maxMm: h2.max, maxTh: h2.th, maxZ: h2.z, maxR: h2.r, maxOnWall: h2.onWall,
        queries: h2.queries, overCount: h2.overCount, rawCount, rawCapped, capped: h2.capped,
        structPitchUniformMm: h2.structPitchUniform, secs: h2.secs, meshAreaMm2: meshArea,
        generatedAt: new Date().toISOString(),
      },
      tighten: { radiusMm: RADIUS, clusterMm, mode: MODE, factor: FACTOR, slope: SLOPE, maxScale: MAXSCALE },
      clusters,
      // filled in below — `predictTightenedCount` needs the finished cluster list, which needs this object
      predict: { meshAreaMm2: 0, nTri, densityPerMm2: 0, unionAreaMm2: 0, weightedExcessAreaMm2: 0, extraTris: 0, predictedTris: 0, caveats: [] },
      caveats: [
        'H2 is a WITNESSED LOWER BOUND, never a certificate: no feature narrower than structPitchUniformMm is guaranteed to be seen.',
        'The loci are the auditor\'s OWN exceeding samples (rawCount === overCount is asserted), not a resampling of the surface.',
        'tolScale is a divisor on the driver\'s acceptTol, NOT a target error. acceptTol ~ h^2, so a divisor of 4 is one halving of h.',
        'The field can only TIGHTEN. A locus absent from this file leaves acceptTol untouched there.',
        ...(prev === null ? ['NOT CUMULATIVE: no previous field was carried, so this file describes only THIS audit\'s exceedances.']
          : [`CUMULATIVE: ${prev.clusters.length} clusters carried from ${prevPath}; ${escalated} of them exceeded again and were escalated.`]),
        ...(rawCapped ? [`*** RAW-CAPPED at PF_P2_RAWCAP=${RAWCAP}: ${rawCount} samples exceeded and only ${RAWCAP} were recorded. THIS LOCI SET IS INCOMPLETE. ***`] : []),
        ...(h2.capped ? ['phase-B refinement was TRUNCATED by budget; phase-A coverage still completed, so the max is a floor.'] : []),
        ...(coarsenings > 0 ? [`cluster pitch was DOUBLED ${coarsenings}x (to ${um(clusterMm)} µm) to stay under PF_P2_MAXCLUSTERS=${MAXCLUSTERS}.`] : []),
      ],
    };

    outFile.predict = predictTightenedCount(outFile, meshRMax, nTri, meshArea);

    // ── MONOTONICITY, ASSERTED. Every carried cluster's scale must be >= what it was, or the "can only
    // tighten" property is broken ACROSS iterations even though it holds within one.
    if (prev !== null) {
      const before = buildTightenField(prev);
      const after = buildTightenField(outFile);
      let violations = 0; let checked = 0;
      for (const c of prev.clusters) {
        checked += 1;
        if (after.scaleForSphere(c.x, c.y, c.z, 0) < before.scaleForSphere(c.x, c.y, c.z, 0)) violations += 1;
      }
      expect(checked).toBeGreaterThan(0);   // non-vacuity: an empty previous field would pass trivially
      expect(violations).toBe(0);
    }

    writeJsonFile(outPath, outFile);

    const report = [
      '',
      `===== PHASE 2 CERTIFICATE + EXCEEDANCE SET: ${STYLE} ${STAGE.toUpperCase()} =====`,
      `mesh   ${stlPath}   ${nTri} tris   area ${meshArea.toFixed(1)} mm²`,
      `run    ${runPath === '' ? '<no manifest — style/params/dims taken from PF_P2_* env, provenance is WEAKER>' : runPath}`,
      `        key ${outFile.run.key}`,
      `--- H2  SURFACE -> MESH (witnessed lower bound, exact point-to-triangle) ---`,
      `  ${(h2.queries / 1e6).toFixed(1)}M locator queries, ${(h2.rEvalsStruct / 1e6).toFixed(0)}M structure evals, ${h2.secs.toFixed(0)}s   structure pitch ${um(h2.structPitchUniform)} µm UNIFORM   locator cell ${cell.toFixed(3)} mm`,
      `  ${h2.capped ? 'phase-B TRUNCATED by budget (phase-A coverage completed ⇒ this is a floor)' : 'refinement ran to exhaustion'}`,
      `  WITNESSED max : ${um(h2.max)} µm   ${h2.max <= TOL ? 'within TOL' : 'EXCEEDS TOL'}   at th=${h2.th.toFixed(6)} z=${h2.z.toFixed(5)} r=${h2.r.toFixed(5)}${h2.onWall ? ' (ON A WALL)' : ''}`,
      `  samples over TOL: ${h2.overCount} / ${h2.queries} = ${((100 * h2.overCount) / Math.max(1, h2.queries)).toFixed(4)} %`,
      `  z-histogram (24 bins, base → rim): ${h2.overZHist.join(' ')}`,
      `--- RECORDER IDENTITIES (these are what make the loci the audit's OWN exceedances) ---`,
      `  queries seen by the wrapper ${queriesSeen} === h2.queries ${h2.queries}`,
      `  exceedances recorded ${rawCount} === h2.overCount ${h2.overCount}${rawCapped ? '   *** RAW-CAPPED — INCOMPLETE ***' : ''}`,
      `--- TIGHTENING FIELD ---`,
      `  mode ${MODE}${MODE === 'slope' ? ` (s=${SLOPE})` : ` (factor ${FACTOR}×)`}   maxScale ${MAXSCALE}×   ball radius ${um(RADIUS)} µm   cluster pitch ${um(clusterMm)} µm${coarsenings > 0 ? ` (doubled ${coarsenings}×)` : ''}`,
      `  ${cells.size} clusters from this audit: ${newSites} NEW sites, ${escalated} escalated`,
      `  ${prev === null ? 'no previous field carried' : `${prev.clusters.length} carried from ${prevPath}`}   ⇒ ${clusters.length} clusters in the emitted field`,
      `  scale histogram: ${(() => {
        const h = new Map<number, number>();
        for (const c of clusters) h.set(c.tolScale, (h.get(c.tolScale) ?? 0) + 1);
        return [...h.entries()].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}×:${n}`).join('  ');
      })()}`,
      `--- §5.4 COST PREDICTION (the INFEASIBLE-AT-CAP input — an ESTIMATE, read the caveats) ---`,
      `  tightened footprint ${outFile.predict.unionAreaMm2.toFixed(1)} mm² of ${meshArea.toFixed(1)} mm² = ${((100 * outFile.predict.unionAreaMm2) / Math.max(1e-9, meshArea)).toFixed(2)} % of the surface`,
      `  density ${outFile.predict.densityPerMm2.toFixed(1)} tris/mm²  ⇒  extra ${Math.round(outFile.predict.extraTris)} tris  ⇒  predicted ${Math.round(outFile.predict.predictedTris)} vs triCap ${outFile.run.triCap === 0 ? 'unknown' : outFile.run.triCap}`,
      ...outFile.predict.caveats.map((k) => `    ! ${k}`),
      `  wrote ${outPath}`,
      ...outFile.caveats.map((c) => `  ! ${c}`),
      '=========================================================',
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
  }, 6_000_000);
});
