// _strataCertD.test.ts — PHASE D: THE AFFORDABLE FULL-COVERAGE CERTIFICATE. RESEARCH ONLY.
// Gated PF_D_RUN=1. Registered in full in research/lab/2026-07-29-strata-perf-convergence-worklog.md,
// section "PHASE D", BEFORE this file was written.
//
//   cd potfoundry-web
//   # the dev server must already be up on PF_GPU_ORIGIN (default http://127.0.0.1:3001) — see D3
//   NODE_OPTIONS=--max-old-space-size=12288 PF_D_RUN=1 PF_D_STAGE=xval \
//     npx vitest run -c vitest.strata.config.ts research/bridge/_strataCertD.test.ts \
//     --testTimeout=1800000 --hookTimeout=600000
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS FOR, AND WHAT IT IS NOT FOR
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// It is an INSTRUMENT, not an attempt to make a mesh win. `_S24i2` carries a witnessed H2 of 24.375 um, so
// the verdict is FAIL and that was registered before anything ran. What has never existed is a CERTIFIED H1
// BOUND AT 100% COVERAGE: every H1 number in this campaign came from a golden-ratio stride walk capped at
// 40,000 facets — 3.17% of this mesh — carrying both the subset-spread caveat and the rim-row caveat, and a
// full-coverage CPU walk was priced at ~39.8 h and rejected.
//
// The composition (D1, and the argument is in _certComposeLib.ts):
//   * the GPU screen triages ALL nTri facets at a stated resolving power; a facet whose SCREEN BOUND
//     (mx + covRad/n + margin) clears TOL is certified BY THE SCREEN, soundly, because that expression is an
//     upper bound on max_{p in T} dist(p,S) for exactly the reasons gpuRuler's header gives;
//   * every SURVIVOR gets certifyTriangle — the f64, V-fixture-validated instrument — pooled;
//   * the certificate is max(certified bounds) with the two populations printed SEPARATELY;
//   * H2 runs full, re-measured not inherited, at the campaign's standard Part-B depth;
//   * `judge()` is called UNMODIFIED.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE TRAPS THIS FILE IS BUILT AGAINST — all recorded, all previously paid for
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
//  * TRAP 3  Vite HMR kills a browser job when a file under the dev-server root changes. So this file writes
//            NOTHING under potfoundry-web while it runs: PF_D_OUT points outside the served root and the
//            artifacts are moved in afterwards. Nothing else may be edited for the duration either.
//  * TRAP 5  Assert the invariant an optimisation must preserve. The cascade asserts
//            `certified + survivors === in` at EVERY round and `screened + audited === nTri` at the end:
//            gpuRuler's false-PASS cursor bug was a skipped triangle silently never entering `survivors`,
//            and a count that must balance is the only thing that catches it.
//  * TRAP 6  Correlation on the MEASURED mx, never on covRad — covRad diverges as the angle goes to zero.
//  * n<=192  The cascade cap STANDS. Per-thread cost in KERNEL_SCREEN is O(n^2) and depends on n alone;
//            the device was lost at n=768 with a batch of TWO triangles. Survivors go to the CPU. The
//            kernel redesign is explicitly not attempted here.
//  * The FIRST DISPATCH SIZE IS THE WATCHDOG RISK, not the total. The bridge's default 4096-triangle chunk
//            is fine at n=12 and fatal at n=192 (4096 * 692k evals ~ 17 s, straight through the ~2 s TDR).
//            Each level therefore opens with its OWN seed chunk, sized from the recorded calibration
//            (n=192 @ 40 tris = 406 ms, @ 80 tris = 266 ms).
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import type { StyleDims } from './labkit';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';
import {
  certifyTriangle, detectThetaJumps, detectZJumps, pickLocatorCell, surfaceToMeshMax,
} from './_facetTruthLib';
import { type H1Job } from './_facetTruthH1';
import { buildAuditRadiusFn, radiusLattice } from './_facetTruthRA';
import { readMeshFloat64, resolveWorkerCount, runH1Pool } from './_facetTruthPool';
import { bladeGate, foldGate, meshShapeCensus, topologyGate } from './_judgeShape';
import { facetNormalCensus, normalGate } from './_judgeNormal';
import { judge, renderGates, NOT_RUN, type DirectionReading, type GateResult } from './_judgeVerdict';
import { openGpuRank } from './_gpuRankBridge';
import {
  buildResidualTable, classifyResidual, composeH1, facetGeom, screenBoundMm, scoreXval,
  type CpuSummary, type ResidualRow, type ScreenRound, type ScreenSummary, type XvalRow,
} from './_certComposeLib';

const RUN = process.env.PF_D_RUN === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;

function envF(n: string, d: number): number {
  const r = process.env[n];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}
const envI = (n: string, d: number): number => Math.round(envF(n, d));
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

/** Golden-ratio stride, coprime to n — the campaign's own low-discrepancy walk order. Verbatim rule. */
function goldenStride(n: number): number {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let s = Math.max(1, Math.round(n * 0.6180339887498949) | 1);
  while (s > 1 && gcd(s, n) !== 1) s += 2;
  return s >= n ? 1 : s;
}

describe('STRATA PHASE D — the composed full-coverage certificate', () => {
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  // LAYER 1 — the composition's own negative control. No GPU, no mesh, no rA. Runs unconditionally.
  // Every expectation here is provable by construction, and together they are the proof that the
  // composition CANNOT weaken judge(). If any of them fails, nothing below is worth running.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  it('composes without weakening the judge (layer 1, synthetic)', () => {
    const TOL = 0.01;
    expect(screenBoundMm(0.005, 0.192, 192, 0.001)).toBeCloseTo(0.007, 12);
    expect(() => screenBoundMm(0.005, 0.1, 0, 0.001)).toThrow(/level must be > 0/);

    const mkScreen = (nCertified: number, maxBound: number, nSurvivors: number): ScreenSummary => ({
      nTri: nCertified + nSurvivors,
      rounds: [{ n: 192, inCount: nCertified + nSurvivors, certified: nCertified, survivors: nSurvivors, maxCertBoundMm: maxBound, gpuMs: 1, wallMs: 1 } as ScreenRound],
      nCertified, nSurvivors, maxCertBoundMm: maxBound, maxCertBoundTri: 7,
      levels: [12, 48, 192], marginMm: 0.001, gnIters: 2, closureEps: 1e-6, parityUm: 0.303, gpuMs: 1, wallMs: 1,
    });
    const mkCpu = (nSurvivors: number, nAudited: number, bound: number, wit: number): CpuSummary => ({
      nSurvivors, nAudited, maxBoundMm: bound, maxBoundTri: 11, maxWitnessedMm: wit, maxWitnessedTri: 11,
      nOver: wit > 0.01 ? 1 : 0, nUncert: 0, nMax: 2048, workers: 8, facetsPerSec: 1, wallMs: 1,
    });

    // (a) FULL COVERAGE + both halves under TOL => complete, certified, bound is the max of the two.
    const a = composeH1({ nTri: 100, tolMm: TOL, screen: mkScreen(90, 0.009, 10), cpu: mkCpu(10, 10, 0.0095, 0.004) });
    expect(a.reading.complete).toBe(true);
    expect(a.reading.certified).toBe(true);
    expect(a.reading.boundMm).toBeCloseTo(0.0095, 12);
    expect(a.owner).toBe('cpu');
    expect(a.reading.witnessedMm).toBeCloseTo(0.004, 12);

    // (b) THE SCREEN HALF CAN OWN THE BOUND, and the composition must say so rather than hide it.
    const b = composeH1({ nTri: 100, tolMm: TOL, screen: mkScreen(90, 0.0099, 10), cpu: mkCpu(10, 10, 0.002, 0.001) });
    expect(b.owner).toBe('screen');
    expect(b.reading.boundMm).toBeCloseTo(0.0099, 12);

    // (c) A TRUNCATED CPU LEG IS NOT FULL COVERAGE. This is the INFEASIBLE path, and it must never be able
    //     to present itself as a full-coverage certificate.
    const c = composeH1({ nTri: 100, tolMm: TOL, screen: mkScreen(90, 0.009, 10), cpu: mkCpu(10, 6, 0.0095, 0.004) });
    expect(c.reading.complete).toBe(false);
    expect(c.reading.coverage).toMatch(/INCOMPLETE/);

    // (d) A CASCADE THAT LOST FACETS IS NOT FULL COVERAGE EITHER — the false-PASS cursor-bug shape.
    const d = composeH1({ nTri: 100, tolMm: TOL, screen: mkScreen(85, 0.009, 10), cpu: mkCpu(10, 10, 0.002, 0.001) });
    expect(d.reading.complete).toBe(false);

    // (e) judge() ACCEPTS A COMPOSED READING AND PASS IS REACHABLE. If this ever fails, the composition has
    //     drifted from the DirectionReading contract and no certificate it produces means anything.
    const gates: GateResult[] = [{ id: 'T', title: 't', applicable: true, count: 0, expected: 0, pass: true, detail: [] }];
    const h2ok: DirectionReading = { ran: true, complete: true, certified: false, witnessedMm: 0.004, boundMm: Infinity, coverage: 'full band' };
    expect(judge({ tolMm: TOL, gates, h1: a.reading, h2: h2ok }).verdict).toBe('PASS');
    // ... and the incomplete composition does NOT pass, for the coverage reason, not by accident.
    const inc = judge({ tolMm: TOL, gates, h1: c.reading, h2: h2ok });
    expect(inc.verdict).toBe('NOT-A-VERDICT');
    expect(inc.reasons.join(' ')).toMatch(/H1 coverage incomplete/);
    // ... and a witnessed exceedance in the CPU half still FAILS, from the composed reading alone.
    const bad = composeH1({ nTri: 100, tolMm: TOL, screen: mkScreen(90, 0.009, 10), cpu: mkCpu(10, 10, 0.9, 0.8) });
    expect(judge({ tolMm: TOL, gates, h1: bad.reading, h2: NOT_RUN }).verdict).toBe('FAIL');

    // (f) THE CROSS-VALIDATION GATE MUST BE ABLE TO FAIL. A screen that cannot fail is not an instrument.
    const row = (tri: number, mx: number, cov: number, wit: number, bnd: number): XvalRow =>
      ({ tri, mxGpu: mx, covGpu: cov, boundGpu: screenBoundMm(mx, cov, 192, 0.001), witCpu: wit, boundCpu: bnd });
    // X1/X4 fire on a screen bound that sits below a distance the CPU actually witnessed.
    const broken = scoreXval([row(1, 0.001, 0.01, 0.05, 0.06), row(2, 0.2, 0.01, 0.2, 0.21)], TOL, 3, 192);
    expect(broken.x1Violations).toBe(1);
    expect(broken.x4Violations).toBe(1);
    expect(broken.pass).toBe(false);
    expect(broken.stop).toBe(true);
    // X2 fires when nothing in the control is over TOL — the gate is VACUOUS, not passed.
    const vacuous = scoreXval([row(1, 0.0001, 0.001, 0.0002, 0.0003)], TOL, 3, 192);
    expect(vacuous.x2CpuOver).toBe(0);
    expect(vacuous.pass).toBe(false);
    expect(vacuous.stop).toBe(false);
    // X3 fires on a rate disagreement wider than the recorded precedent.
    const skew = scoreXval([row(1, 0.5, 0.01, 0.5, 0.51), row(2, 0.5, 0.01, 0.0001, 0.5),
      row(3, 0.5, 0.01, 0.0001, 0.5), row(4, 0.5, 0.01, 0.0001, 0.5)], TOL, 3, 192);
    expect(skew.x3DeltaPoints).toBeGreaterThan(3);
    expect(skew.pass).toBe(false);
    // A clean, non-vacuous control passes every bar.
    const good = scoreXval([row(1, 0.5, 0.01, 0.4, 0.52), row(2, 0.0001, 0.001, 0.00005, 0.0002)], TOL, 3, 192);
    expect(good.pass).toBe(true);
    expect(good.stop).toBe(false);
    // An EMPTY control is a wiring bug, not a pass.
    expect(() => scoreXval([], TOL, 3, 192)).toThrow(/EMPTY/);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  // THE CERTIFICATE
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  it.runIf(RUN)('certifies a finished mesh at FULL COVERAGE by composing GPU triage with a CPU confirm', async () => {
    const stlPath = process.env.PF_D_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S24i2.stl';
    const STYLE = process.env.PF_D_STYLE ?? 'GothicArches';
    const TOL = envF('PF_D_TOL_UM', 10) / 1000;
    const STAGE = process.env.PF_D_STAGE ?? 'full';
    const TAG = process.env.PF_D_TAG ?? 'CERTD';
    const OUT = process.env.PF_D_OUT ?? join('research', 'exchange', '_strataCertD');
    const LEVELS = (process.env.PF_D_LEVELS ?? '12,48,192').split(',').map((s) => Math.round(Number(s)));
    const MARGIN = envF('PF_D_MARGIN_UM', 1) / 1000;
    const GN = envI('PF_D_GN', 2);
    const CLOSURE = envF('PF_D_CLOSURE', 1e-6);
    const XVAL_N = envI('PF_D_XVAL_N', 512);
    const XVAL_BAR = envF('PF_D_XVAL_BAR', 3);
    const TOPK = envI('PF_D_TOPK', 24000);
    const NMAX = envI('PF_D_NMAX', 2048);
    const CPUSECS = envF('PF_D_CPUSECS', 7200);
    const DO_H2 = process.env.PF_D_H2 !== '0';
    const H2BUDGET = envF('PF_D_H2BUDGET', 4e7);
    const H2SECS = envF('PF_D_H2SECS', 1800);
    const ARCAP = envF('PF_D_ARCAP', 50);
    const GUARD_AR = envF('PF_D_GUARD_AR', 50);
    const EXPECT_BOUNDARY = process.env.PF_D_BOUNDARY === undefined ? null : envI('PF_D_BOUNDARY', 0);
    const RESID_SHOW = envI('PF_D_RESID_SHOW', 40);
    if (LEVELS.some((n) => !(n > 0) || n > 192)) {
      throw new Error(`PF_D_LEVELS: every level must be in (0,192]. The n<=192 cascade cap is a MEASURED device limit — per-thread cost in KERNEL_SCREEN is O(n^2) and the device was lost at n=768 with a batch of TWO triangles. Got ${LEVELS.join(',')}.`);
    }

    mkdirSync(OUT, { recursive: true });
    const progress = join(OUT, `${TAG}.progress.log`);
    const t0 = Date.now();
    const say = (s: string): void => {
      const line = `${new Date().toTimeString().slice(0, 8)} +${((Date.now() - t0) / 1000).toFixed(0)}s  ${s}`;
      try { appendFileSync(progress, `${line}\n`); } catch { /* a log write never aborts the run */ }
      // eslint-disable-next-line no-console
      console.log(`[PHASE D] ${line}`);
    };
    // Any chain that can throw must leave a FAILURE SENTINEL its watcher greps for — a chain that dies
    // silently and a chain that is still running look identical from outside (OPS TRAP 11).
    const fail = (e: unknown): never => {
      say(`*** PHASE D FAILED *** ${String(e).slice(0, 400)}`);
      throw e;
    };

    say(`START stage=${STAGE} stl=${stlPath} style=${STYLE} TOL=${um(TOL)} um levels=${LEVELS.join('/')} gn=${GN} margin=${um(MARGIN)} um`);

    const styleParams = registryDefaults(STYLE);
    const auditR = buildAuditRadiusFn(STYLE, styleParams, DIMS, H);
    const rA = auditR.rA;
    const { xyz, nTri } = readMeshFloat64(stlPath, false);
    const zJumps = detectZJumps(rA, H);
    const thJumps = detectThetaJumps(rA, H);
    say(`mesh ${nTri} facets; C0 z-steps ${zJumps.length}, theta-jumps ${thJumps.length}`);

    const lines: string[] = ['', `===== STRATA PHASE D — COMPOSED FULL-COVERAGE CERTIFICATE: ${STYLE} =====`,
      `stl: ${stlPath}  (${nTri} triangles)`,
      `params ${JSON.stringify(styleParams)}`,
      `TOL ${um(TOL)} um   detected C0 z-steps: ${zJumps.length}   theta-jumps: ${thJumps.length}`,
      'REGISTERED IN FULL BEFORE THIS FILE WAS WRITTEN — see the PHASE D block in',
      'research/lab/2026-07-29-strata-perf-convergence-worklog.md. The expected verdict is FAIL; the value',
      'of this arm is the CERTIFIED H1 BOUND AT 100% COVERAGE and the enumerated residual, not the verdict word.'];

    // ── the CPU-side certifier, one call, used by both the cross-validation gate and (via runH1Walk) the
    //    survivor confirm. The argument list is the one the pooled walk uses, so the two are bit-identical.
    const cpuOpts = { H, tol: TOL, nMax: NMAX, sampleCap: 4e6, zJumps, thJumps };
    const cpuCertify = (t: number): { witnessed: number; bound: number } => {
      const o = t * 9;
      const v = certifyTriangle(rA, xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5],
        xyz[o + 6], xyz[o + 7], xyz[o + 8], cpuOpts);
      return { witnessed: v.witnessed, bound: v.bound };
    };

    // f32 view of the soup for the GPU. The STL stores f32 and readMeshFloat64 widened it to f64, so this
    // narrowing is EXACT — the GPU sees the file's own bytes, not a rounded copy of them.
    const f32 = new Float32Array(nTri * 9);
    for (let i = 0; i < nTri * 9; i += 1) f32[i] = xyz[i];

    /** Screen a set of ORIGINAL triangle indices at one lattice level. Opens, measures, closes. */
    const screenAt = async (level: number, idx: Int32Array, seedChunk: number): Promise<{ res: Float32Array; parityUm: number; gpuMs: number; wallMs: number }> => {
      const part = new Float32Array(idx.length * 9);
      for (let s = 0; s < idx.length; s += 1) {
        const o = idx[s] * 9;
        for (let k = 0; k < 9; k += 1) part[s * 9 + k] = f32[o + k];
      }
      const w0 = Date.now();
      const gr = await openGpuRank({
        style: STYLE, params: styleParams, cpuRadius: rA, dims: DIMS,
        n: level, gnIters: GN, closureEps: CLOSURE, chunk: seedChunk, targetMs: 250, parityTolUm: 2,
        onPageLog: (l) => say(`  page: ${l.trim().slice(0, 200)}`),
      });
      try {
        say(`  screen n=${level}: parity ${gr.parityUm.toFixed(4)} um; dispatching ${idx.length} facets (seed chunk ${seedChunk})`);
        const res = await gr.score(part, idx.length);
        return { res, parityUm: gr.parityUm, gpuMs: gr.stats.gpuMs, wallMs: Date.now() - w0 };
      } finally {
        await gr.close();
      }
    };

    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    // D2 — THE CROSS-VALIDATION GATE. IT RUNS FIRST, BEFORE THE SWEEP COUNTS ANYTHING.
    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    // CONTROL SET, deterministic and registered: (a) the first XVAL_N facets of the campaign's OWN
    // golden-ratio-stride walk, so it is a uniform sample of the whole mesh rather than a low-index band,
    // SEEDED with (b) the eight facets FID_S24i2 publishes as its stage-3 global-confirm top-8. (b) exists
    // solely so the gate cannot be vacuous — a screen that cannot fail is not an instrument.
    const SEEDED = [420186, 690730, 1064879, 1062693, 756518, 1036911, 135194, 721541].filter((t) => t < nTri);
    const ctlSet = new Set<number>(SEEDED);
    {
      const st = goldenStride(nTri);
      for (let k = 0; ctlSet.size < XVAL_N + SEEDED.length && k < nTri; k += 1) ctlSet.add((k * st) % nTri);
    }
    const control = Int32Array.from([...ctlSet].sort((a, b) => a - b));
    say(`D2 control set: ${control.length} facets (${SEEDED.length} seeded from FID_S24i2's published top-8, rest a golden-stride sample)`);

    const topLevel = LEVELS[LEVELS.length - 1];
    const xg = await screenAt(topLevel, control, Math.max(8, Math.min(64, control.length))).catch(fail);
    const xrows: XvalRow[] = [];
    for (let i = 0; i < control.length; i += 1) {
      const mx = xg.res[i * 2]; const cov = xg.res[i * 2 + 1];
      const c = cpuCertify(control[i]);
      xrows.push({ tri: control[i], mxGpu: mx, covGpu: cov, boundGpu: screenBoundMm(mx, cov, topLevel, MARGIN), witCpu: c.witnessed, boundCpu: c.bound });
    }
    const xval = scoreXval(xrows, TOL, XVAL_BAR, topLevel);
    lines.push(...xval.lines,
      `  GPU-vs-CPU rA parity at startup: ${xg.parityUm.toFixed(4)} um over 32,768 samples of the WHOLE surface`,
      `  (recorded precedent for this style: 0.303 um. The screen's margin is ${um(MARGIN)} um.)`);
    say(`D2 ${xval.pass ? 'PASS' : 'FAIL'}  X1 ${xval.x1Violations}  X2 cpu ${xval.x2CpuOver}/gpu ${xval.x2GpuOver}  X3 ${xval.x3DeltaPoints.toFixed(3)} pts  X4 ${xval.x4Violations}`);
    // eslint-disable-next-line no-console
    console.log(xval.lines.join('\n'));

    const writeReport = (): void => {
      const report = lines.join('\n');
      // eslint-disable-next-line no-console
      console.log(report);
      writeFileSync(join(OUT, `${TAG}.report.txt`), report);
    };

    if (!xval.pass) {
      lines.push('', '*** D2 CROSS-VALIDATION FAILED. THE SCREEN IS NOT TRUSTED AS A CERTIFIER ON THIS MESH AND THE',
        '*** COMPOSITION IS NOT ATTEMPTED. This is a RESULT, not an error: it is the registered stop condition.');
      writeReport();
      say('*** PHASE D FAILED *** D2 cross-validation gate did not pass — registered STOP');
      expect(xval.pass, `D2 cross-validation gate failed: ${xval.bars.filter((b) => !b.pass).map((b) => b.id).join(', ')}`).toBe(true);
      return;
    }
    if (STAGE === 'xval') { writeReport(); say('DONE stage=xval'); expect(xval.pass).toBe(true); return; }

    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    // THE SHAPE + ORIENTATION CENSUSES AND THE GATES — unconditional, before any fidelity number
    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    const sc = meshShapeCensus(xyz, nTri, { arCap: ARCAP, H, nWorst: 12 });
    const nc = facetNormalCensus(rA, xyz, nTri, { H, zJumps, thJumps, nWorst: 12 });
    // THE TRANSCRIPTION CHECK. _certComposeLib.facetGeom re-implements the census's AR so the residual table
    // can be built without importing the census's internals. Two implementations of one quantity that are
    // never compared is exactly how this repo shipped four copies of a Voronoi hash with one updated. Prove
    // they agree over the WHOLE mesh, to the bit, or refuse to report.
    let myArMax = -1; let myArMaxTri = -1;
    for (let t = 0; t < nTri; t += 1) { const a = facetGeom(xyz, t).ar; if (a > myArMax) { myArMax = a; myArMaxTri = t; } }
    if (!(Object.is(myArMax, sc.arMax) && myArMaxTri === sc.arMaxTri)) {
      fail(new Error(`AR TRANSCRIPTION CHECK FAILED: _certComposeLib.facetGeom reads max ${myArMax} at tri ${myArMaxTri}; _judgeShape.meshShapeCensus reads ${sc.arMax} at tri ${sc.arMaxTri}. Two implementations of one quantity disagree — that is the bug report, and no residual table built on the second one may be quoted.`));
    }
    const shapeStamp = `[SHAPE: AR p99 ${sc.arP99.toFixed(2)} max ${sc.arMax.toFixed(1)}, blades(AR>${ARCAP}) ${sc.nBlade} det+${sc.nBladeIndet} f32indet, folds ${sc.nFoldDetermined} det+${sc.nIndeterminate} f32indet, back-facing ${nc.nBackFacing} (+${nc.nFeatureSpanBack} feature-span)]`;
    lines.push('', '--- MESH SHAPE + ORIENTATION CENSUSES (unconditional, every facet, from the audited STL itself) ---',
      `  3-D AR  p50 ${sc.arP50.toFixed(3)}  p90 ${sc.arP90.toFixed(3)}  p99 ${sc.arP99.toFixed(3)}  MAX ${sc.arMax.toFixed(3)} (tri ${sc.arMaxTri})`,
      `  AR TRANSCRIPTION CHECK: _certComposeLib.facetGeom agrees with _judgeShape.meshShapeCensus to the bit on the argmax over all ${nTri} facets`,
      `  blades(AR>${ARCAP}) ${sc.nBlade} determined (+${sc.nBladeIndet} f32-indeterminate, raw ${sc.nBladeRaw})   zero-area ${sc.nDegenerate}   min edge ${um(sc.minEdge)} um`,
      `  folds ${sc.nFoldDetermined} determined (+${sc.nIndeterminate} f32-indeterminate)   parametric AR p50 ${sc.parArP50.toFixed(3)} MAX ${sc.parArMax.toFixed(3)}`,
      `  normal deviation p50 ${nc.degP50.toFixed(4)}  p90 ${nc.degP90.toFixed(4)}  p99 ${nc.degP99.toFixed(4)}  MAX ${nc.degMax.toFixed(4)} deg`,
      `  off-locus >=90 ${nc.over90}   back-facing (gate) ${nc.nBackFacing}   census ${sc.secs.toFixed(1)}s + ${nc.secs.toFixed(1)}s`);
    const gates: GateResult[] = [foldGate(sc, true), normalGate(nc), bladeGate(sc, GUARD_AR), topologyGate(sc, EXPECT_BOUNDARY)];
    lines.push(...renderGates(gates).lines);
    say(`censuses + gates done: fold ${sc.nFoldDetermined}, blade ${sc.nBlade}, normal ${nc.nBackFacing}, AR max ${sc.arMax.toFixed(3)}`);

    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    // STAGE 1 — THE GPU CASCADE OVER ALL nTri FACETS. 100% COVERAGE TRIAGE.
    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    // SEED CHUNKS ARE PER LEVEL AND ARE THE WATCHDOG CONTROL. Per-thread cost is (n+1)(n+2)/2 lattice points
    // times (9 + gnIters*(5+9)) rA evals, all inside ONE thread, so the batch size sets how many threads run
    // and never how long one takes. The recorded calibration is n=192 @ 40 tris = 406 ms and @ 80 = 266 ms
    // against a ~2 s TDR; the bridge then steers toward targetMs from whatever seed it is given.
    const seedChunkFor = (n: number): number => (n <= 16 ? 8192 : n <= 64 ? 1024 : 64);
    let cur = new Int32Array(nTri);
    for (let i = 0; i < nTri; i += 1) cur[i] = i;
    const rounds: ScreenRound[] = [];
    let nCertified = 0; let maxCertBound = 0; let maxCertTri = -1;
    let gpuMsTotal = 0; let gpuWallTotal = 0; let parityUm = xg.parityUm;
    for (const level of LEVELS) {
      if (cur.length === 0) break;
      const r = await screenAt(level, cur, seedChunkFor(level)).catch(fail);
      parityUm = Math.max(parityUm, r.parityUm);
      gpuMsTotal += r.gpuMs; gpuWallTotal += r.wallMs;
      const keep: number[] = [];
      let roundCert = 0; let roundMax = 0;
      for (let i = 0; i < cur.length; i += 1) {
        const b = screenBoundMm(r.res[i * 2], r.res[i * 2 + 1], level, MARGIN);
        if (b <= TOL) {
          roundCert += 1;
          if (b > roundMax) roundMax = b;
          if (b > maxCertBound) { maxCertBound = b; maxCertTri = cur[i]; }
        } else keep.push(cur[i]);
      }
      // TRAP 5. The count MUST balance. A cascade that grew its batch and skipped triangles would report a
      // shorter survivor list and silently CERTIFY the skipped ones — gpuRuler's own false-PASS defect.
      if (roundCert + keep.length !== cur.length) {
        fail(new Error(`cascade round n=${level} lost facets: ${roundCert} certified + ${keep.length} survivors != ${cur.length} in. Do not trust this run.`));
      }
      rounds.push({ n: level, inCount: cur.length, certified: roundCert, survivors: keep.length, maxCertBoundMm: roundMax, gpuMs: r.gpuMs, wallMs: r.wallMs });
      nCertified += roundCert;
      cur = Int32Array.from(keep);
      say(`  cascade n=${level}: ${rounds[rounds.length - 1].inCount} in -> ${roundCert} certified, ${cur.length} survivors  (${(r.wallMs / 1000).toFixed(1)}s wall, ${(r.gpuMs / 1000).toFixed(1)}s GPU)`);
    }
    const survivors = cur;
    if (nCertified + survivors.length !== nTri) {
      fail(new Error(`cascade total does not balance: ${nCertified} certified + ${survivors.length} survivors != ${nTri}.`));
    }
    const screen: ScreenSummary = {
      nTri, rounds, nCertified, nSurvivors: survivors.length, maxCertBoundMm: maxCertBound, maxCertBoundTri: maxCertTri,
      levels: LEVELS, marginMm: MARGIN, gnIters: GN, closureEps: CLOSURE, parityUm, gpuMs: gpuMsTotal, wallMs: gpuWallTotal,
    };
    say(`STAGE 1 DONE: ${nCertified}/${nTri} certified by the screen (${((100 * nCertified) / nTri).toFixed(4)}%), ${survivors.length} survivors (${((100 * survivors.length) / nTri).toFixed(4)}%), ${(gpuWallTotal / 1000).toFixed(1)}s`);

    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    // STAGE 2 — THE CPU CONFIRM OVER THE SURVIVORS. certifyTriangle, unmodified, pooled.
    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    // The survivors are COMPACTED into their own SharedArrayBuffer and walked by the SAME `runH1Walk` the
    // full-mesh audit uses, with the SAME argument list — so every per-facet certificate here is
    // bit-identical to the one a full walk would have produced for that facet, and the ruler validation
    // suite is untouched by construction. The walk order is the golden-ratio stride over the SURVIVOR set,
    // so if the clock truncates it, what was audited is still a low-discrepancy sample of the survivors
    // rather than a prefix of them.
    const workers = resolveWorkerCount();
    const nSurv = survivors.length;
    const cpuT0 = Date.now();
    let cpu: CpuSummary;
    let kD: number[] = []; let kTri: number[] = [];
    if (nSurv === 0) {
      cpu = { nSurvivors: 0, nAudited: 0, maxBoundMm: 0, maxBoundTri: -1, maxWitnessedMm: 0, maxWitnessedTri: -1, nOver: 0, nUncert: 0, nMax: NMAX, workers, facetsPerSec: 0, wallMs: 0 };
    } else {
      const survSab = new SharedArrayBuffer(nSurv * 9 * 8);
      const survXyz = new Float64Array(survSab);
      for (let s = 0; s < nSurv; s += 1) {
        const o = survivors[s] * 9;
        for (let k = 0; k < 9; k += 1) survXyz[s * 9 + k] = xyz[o + k];
      }
      const job: H1Job = {
        nTri: nSurv, stride: goldenStride(nSurv), kEnd: nSurv, H, tol: TOL, nMax: NMAX, sampleCap: 4e6,
        zJumps, thJumps, topK: TOPK, deadlineMs: cpuT0 + CPUSECS * 1000,
      };
      const lat = radiusLattice(H, zJumps, thJumps);
      const expectLat = new Float64Array(lat.th.length);
      for (let i = 0; i < expectLat.length; i += 1) expectLat[i] = rA(lat.th[i], lat.z[i]);
      say(`STAGE 2: ${nSurv} survivors -> CPU, ${workers} worker threads, stride ${job.stride}, topK ${TOPK}, deadline ${CPUSECS}s`);
      const out = await runH1Pool({
        sab: survSab, job, chunkMax: envI('PF_D_CHUNK', 64), budget: envF('PF_D_BUDGET', 1e13), workers,
        style: STYLE, styleParams, dims: DIMS, expectLat, latTh: lat.th, latZ: lat.z,
        workerHeapMb: envI('PF_D_WORKERMB', 2048),
      }).catch(fail);
      const m = out.merged;
      const wall = Date.now() - cpuT0;
      kD = m.kD; kTri = m.kTri;
      cpu = {
        nSurvivors: nSurv, nAudited: m.audited,
        maxBoundMm: m.worstUB, maxBoundTri: m.worstUBTri >= 0 ? survivors[m.worstUBTri] : -1,
        maxWitnessedMm: m.kD.length > 0 ? m.kD[0] : 0,
        maxWitnessedTri: m.kTri.length > 0 ? survivors[m.kTri[0]] : -1,
        nOver: m.nOver, nUncert: m.nUncert, nMax: NMAX, workers,
        facetsPerSec: (1000 * m.audited) / Math.max(1, wall), wallMs: wall,
      };
      lines.push('', `  H1 pool: ${out.workers} worker threads, chunk ${out.chunk}, esbuild bundle ${out.bundleMs} ms;`
        + ` per-worker rA rebuilt from (style, params, dims) and VERIFIED bit-identical to the parent's BEFORE the walk`
        + ` — ${out.latPoints} (worker x lattice-point) comparisons, ${out.latDiffCount} differing, max deviation ${out.latMaxDev.toExponential(3)} mm`);
      say(`STAGE 2 DONE: audited ${m.audited}/${nSurv} in ${(wall / 1000).toFixed(1)}s (${cpu.facetsPerSec.toFixed(2)} facets/s); bound ${um(m.worstUB)} um, witnessed ${um(cpu.maxWitnessedMm)} um, over ${m.nOver}, uncert ${m.nUncert}`);
    }

    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    // D1 — THE COMPOSITION
    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    const comp = composeH1({ nTri, tolMm: TOL, screen, cpu });
    lines.push(...comp.lines, `  ${shapeStamp}`);
    if (!comp.reading.complete) {
      lines.push('', '  *** INFEASIBLE AS REGISTERED — the composition did not reach full coverage. The bound above is a',
        '  *** bound over PART of the mesh and is labelled INCOMPLETE; judge() refuses to certify it, and it may',
        '  *** NEVER be quoted as a full-coverage number.');
      say(`*** INFEASIBLE *** coverage incomplete: screened ${nCertified} + audited ${cpu.nAudited} != ${nTri}`);
    }

    // ── THE RESIDUAL, ENUMERATED ─────────────────────────────────────────────────────────────────────────
    const bands = { rimMm: envF('PF_D_RIM_MM', 0.1), H, arCap: GUARD_AR, longMm: 0.5, midMm: 0.15 };
    const resid: ResidualRow[] = [];
    for (let i = 0; i < kD.length; i += 1) {
      if (!(kD[i] > TOL)) break; // kD is sorted by value descending; the first non-exceedance ends the list
      const tri = survivors[kTri[i]];
      const g = facetGeom(xyz, tri);
      resid.push({ tri, witnessedMm: kD[i], owner: classifyResidual(g, bands), geom: g });
    }
    const table = buildResidualTable(resid, cpu.nOver, TOPK, TOL, RESID_SHOW);
    lines.push(...table.lines,
      `  owner bands: rim row = any vertex within ${bands.rimMm} mm of z=0 or z=${H}; over-cap-AR = 3-D AR > ${bands.arCap} (the driver's own S1 cap);`,
      `  long-chord = longest edge >= ${(bands.longMm * 1000).toFixed(0)} um; mid-chord >= ${(bands.midMm * 1000).toFixed(0)} um (the recorded longest-edge buckets).`);
    writeFileSync(join(OUT, `${TAG}.residual.json`), JSON.stringify({
      schema: 'pf.strata.certD.residual/1', stl: stlPath, nTri, tolUm: TOL * 1000,
      screen: { levels: LEVELS, gnIters: GN, closureEps: CLOSURE, marginUm: MARGIN * 1000, parityUm, nCertified, nSurvivors: nSurv, maxCertBoundUm: maxCertBound * 1000 },
      cpu: { nAudited: cpu.nAudited, nOver: cpu.nOver, nUncert: cpu.nUncert, maxBoundUm: cpu.maxBoundMm * 1000, maxWitnessedUm: cpu.maxWitnessedMm * 1000 },
      enumerationComplete: table.enumerationComplete, byOwner: table.byOwner,
      rows: table.rows.slice(0, 4096).map((r) => ({ tri: r.tri, witnessedUm: r.witnessedMm * 1000, owner: r.owner, ar: r.geom.ar, longestUm: r.geom.longestMm * 1000, zMin: r.geom.zMin, zMax: r.geom.zMax, theta: r.geom.thetaA })),
    }, null, 1));
    // The survivor set IS the enumerated residual at the screen's resolving power, so it is frozen as an
    // artifact rather than described. S25 lost an arm to a population that had no serialized form.
    writeFileSync(join(OUT, `${TAG}.survivors.json`), JSON.stringify({
      schema: 'pf.strata.certD.survivors/1', stl: stlPath, nTri, tolUm: TOL * 1000,
      levels: LEVELS, gnIters: GN, marginUm: MARGIN * 1000, count: nSurv, tri: Array.from(survivors),
    }));
    say(`residual: ${cpu.nOver} witnessed exceedances, enumeration ${table.enumerationComplete ? 'COMPLETE' : 'TRUNCATED'}`);

    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    // H2 — SURFACE -> MESH, FULL, RE-MEASURED. Standard Part-B depth, so the number is comparable to the series.
    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    let h2Reading: DirectionReading = NOT_RUN;
    if (DO_H2) {
      const hT0 = Date.now();
      const idx = new Uint32Array(nTri * 3);
      for (let i = 0; i < nTri * 3; i += 1) idx[i] = i;
      const ref: RefMesh = { xyz, idx, nV: nTri * 3, nF: nTri };
      const cell = pickLocatorCell(xyz, idx, nTri);
      const loc = buildRefLocator(ref, cell);
      say(`H2: locator cell ${cell.toFixed(3)} mm, budget ${H2BUDGET}`);
      const h2 = surfaceToMeshMax(rA, loc.dist, {
        H, tol: TOL, coveragePitch: 0.04, minPitch: 0.00125, structN: 48, structLines: 5,
        budget: H2BUDGET, timeBudgetMs: H2SECS * 1000, zMin: 0, zMax: H, zJumps, thJumps,
      });
      const rw = h2.r;
      const wxp = rw * Math.cos(h2.th); const wyp = rw * Math.sin(h2.th);
      const dt = loc.distTri(wxp, wyp, h2.z);
      const brute = loc.bruteDist(wxp, wyp, h2.z);
      const fullBand = h2.zLo <= 0 && h2.zHi >= H;
      h2Reading = {
        ran: true, complete: fullBand, certified: false, witnessedMm: h2.max, boundMm: Infinity,
        coverage: `${(h2.queries / 1e6).toFixed(1)}M queries; phase-A UNIFORM coverage of z ${h2.zLo.toFixed(2)}..${h2.zHi.toFixed(2)} mm`
          + `${fullBand ? ' (the FULL band)' : ' *** SUB-BAND ***'} at structure pitch ${um(h2.structPitchUniform)} um`
          + `${h2.capped ? '; phase-B refinement TRUNCATED by budget, so the max is a floor AT THAT RESOLVING POWER' : '; phase-B refinement ran to exhaustion'}`,
      };
      lines.push('', '--- H2  SURFACE -> MESH   (witnessed lower bound; every reading is an exact point-to-triangle distance) ---',
        '  MEASUREMENTS, NOT A VERDICT — see the verdict block at the end of this report.',
        `  ${(h2.queries / 1e6).toFixed(1)}M locator queries, ${(h2.rEvalsStruct / 1e6).toFixed(0)}M structure evals, ${h2.secs.toFixed(0)}s   structure pitch ${um(h2.structPitchUniform)} um UNIFORM   locator cell ${cell.toFixed(3)} mm`,
        `  ${h2.capped ? 'phase-B refinement TRUNCATED by budget (phase-A coverage still completed in full over the audited band, so this is a floor)' : 'refinement ran to exhaustion'}`,
        `  WITNESSED max : ${um(h2.max)} um   ${h2.max <= TOL ? 'within TOL' : 'OVER TOL'}   [brute-force re-check of this point: ${um(brute)} um]   ${shapeStamp}`,
        `    at th=${h2.th.toFixed(6)} z=${h2.z.toFixed(5)}  r=${rw.toFixed(5)}  nearest tri ${dt.tri}`,
        `  audited z band ${h2.zLo.toFixed(2)}..${h2.zHi.toFixed(2)} mm   samples over TOL: ${h2.overCount} / ${h2.queries} = ${((100 * h2.overCount) / Math.max(1, h2.queries)).toFixed(5)}%`,
        `  z-histogram of exceedances (24 bins, base -> rim): ${h2.overZHist.join(' ')}`);
      say(`H2 DONE: ${um(h2.max)} um at th ${h2.th.toFixed(6)} z ${h2.z.toFixed(5)}, ${h2.overCount}/${h2.queries} over TOL, ${((Date.now() - hT0) / 1000).toFixed(0)}s`);
    }

    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    // THE VERDICT — judge(), UNMODIFIED. The one place PASS or FAIL may be written.
    // ═════════════════════════════════════════════════════════════════════════════════════════════════════
    const outcome = judge({ tolMm: TOL, gates, h1: comp.reading, h2: h2Reading });
    lines.push(...outcome.lines, '',
      '  HOW TO READ THE H1 LINE ABOVE: it is a COMPOSED certificate. The two populations, their instruments',
      '  and their resolving powers are printed separately further up, and neither is quoted without the other.',
      `  WALL: ${((Date.now() - t0) / 1000).toFixed(0)}s total   GPU triage ${(screen.wallMs / 1000).toFixed(0)}s   CPU survivors ${(cpu.wallMs / 1000).toFixed(0)}s`,
      `  ${((auditR.evals()) / 1e6).toFixed(1)}M rA evals in this process (worker-thread evals are not in this counter)`,
      '=========================================================');
    writeReport();
    say(`VERDICT ${outcome.verdict} — ${outcome.reasons.join('; ').slice(0, 300)}`);
    say(`DONE total ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    expect(nTri).toBeGreaterThan(0);
  }, 12 * 60 * 60 * 1000);
});
