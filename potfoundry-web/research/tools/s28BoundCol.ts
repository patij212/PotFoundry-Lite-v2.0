// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// S28-U0 — THE PER-FACET CERTIFIED BOUND COLUMN, RE-EMITTED FROM PHASE D'S OWN RECORDED INTERMEDIATES.
// RESEARCH ONLY. ARTIFACT-ONLY. Nothing under src/, no untouchable, no judge, no driver, no mesher.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHY THIS EXISTS. The S28 registration's decisive clause C1 is "the INTERIOR certified H1 bound falls".
// That quantity HAS NEVER BEEN COMPUTED. `CERTD_S24i2.residual.json` serializes, per facet, `witnessedUm`
// and geometry — never `boundUm`. The certified bound survives only as two scalars in the `cpu` block, and
// the argmax of those (tri 335660) is a RIM-ROW facet, which the standing open-boundary caveat forbids
// scoring as wall. So the interior certified bound was known only to lie in [190.100, 214.053] um, and a
// registration whose decisive quantity is not falsifiable is not a registration. This closes S28-U0.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS IS A RE-EMISSION AND NOT A RE-RUN — AND WHAT THAT COSTS
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Phase D is three stages. STAGE 1 is the GPU screen over all 1,260,110 facets (1,279.7 s, a browser, a dev
// server and a WebGPU device); STAGE 2 is `certifyTriangle` over the 19,984 SURVIVORS (1,311.1 s, pure CPU);
// STAGE 3 confirms the top-64 witnesses with `distPerp`.
//
// STAGE 1'S ENTIRE OUTPUT IS THE SURVIVOR LIST, AND THE SURVIVOR LIST IS A RECORDED ARTIFACT
// (`CERTD_S24i2.survivors.json`, schema `pf.strata.certD.survivors/1`, 19,984 triangle indices). So the GPU
// half does not have to be re-run to recover the CPU half's per-facet bounds: it has already been run, and
// what it produced is on disk. Only STAGE 2 is recomputed. ~22 minutes, not ~54.
//
// AND THE SCREEN HALF NEEDS NO BOUNDS AT ALL, which is what makes the shortcut sound rather than merely
// cheap: every one of the 1,240,126 screen-certified facets carries a bound <= TOL by construction
// (`maxCertBoundUm` 9.999995), so the max of the certified bound over ANY subset of the mesh — interior,
// rim, or the whole thing — is either that <=10 um screen ceiling or it is attained in the CPU half. The
// interior certified bound is therefore exactly
//     max( screen.maxCertBoundUm ,  max over INTERIOR survivors of certifyTriangle(...).bound )
// and the second term is the only unknown. That is what this file computes.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THE RESULT IS BIT-IDENTICAL TO WHAT PHASE D WOULD HAVE WRITTEN, AND HOW THAT IS PROVEN AND NOT ASSUMED
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// `certifyTriangle` is a pure function of (rA, the nine coordinates, opts). Phase D calls it through
// `runH1Walk` with `cpuOpts = { H, tol, nMax, sampleCap: 4e6, zJumps, thJumps }`; this file calls it with
// the IDENTICAL argument list, on the SAME nine f64 coordinates read by the SAME `readMeshFloat64`, against
// an rA built by the SAME `buildAuditRadiusFn` from the SAME registry defaults. Per-facet verdicts cannot
// differ. What differs is only the ACCUMULATOR: `H1Acc` keeps a running argmax of `bound` and throws every
// other per-facet bound away (that is the defect), while this file keeps all of them.
//
// THAT ARGUMENT IS NOT TAKEN ON TRUST. The tool RE-DERIVES the four scalars and the whole owner census that
// Phase D published, and REFUSES TO WRITE ANYTHING unless every one of them reproduces EXACTLY:
//     max certified bound       214.05299595266217 um   at tri 335660
//     max witnessed (raw local) 204.17437354016823 um   at tri 344521
//     nOver 14569      nUncert 8
//     byOwner  rim-row 221 / mid-chord 7123 / long-chord 1035 / fine 6185 / over-cap-AR 5
// A re-emission that cannot reproduce the run it re-emits is not a re-emission, and a bound column that
// silently disagrees with the certificate it claims to annotate is worse than no column at all. The
// expectations are read FROM THE RECORDED ARTIFACT, never hardcoded, so this check cannot pass vacuously
// against a different mesh.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE SECOND ARTIFACT DEFECT THIS FIXES, FOUND BY READING THE FILE
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// `_strataCertD.test.ts:616` writes `table.rows.slice(0, 4096)`. So `residual.json` carries 4,096 rows while
// `cpu.nOver` says 14,569 — the SERIALIZED residual is a 28% prefix of the enumerated one. The enumeration
// itself is complete (`byOwner` is computed over all 14,569 before the slice, and its counts sum to 14,569),
// but any tool that consumes `rows` sees a truncation. `s28Field.ts` refuses on exactly this, correctly.
// This file emits ALL nOver rows. The owner counts it re-derives are checked against the recorded `byOwner`,
// which is the one part of the recorded file that was NOT truncated — so the two agree or nothing is written.
//
// USAGE
//   node <bundle> [survivors.json] [residual.json] [out.json]
//   defaults: research/exchange/_strataCertD/CERTD_S24i2.survivors.json
//             research/exchange/_strataCertD/CERTD_S24i2.residual.json
//             research/exchange/_strataCertD/CERTD_S24i2.residual2.json
//   env: PF_S28U0_STL PF_S28U0_WORKERS PF_S28U0_NMAX (2048) PF_S28U0_SECS (7200)
//        PF_S28U0_RIM_MM (0.1) PF_S28U0_ARCAP (50) PF_S28U0_LONG_MM (0.5) PF_S28U0_MID_MM (0.15)
//        PF_S28U0_HEAPMB (2048) PF_S28U0_DRYRUN (1 = check only, do not write)
//        PF_S28U0_NOEXPECT (1 = no recorded run to reproduce; for a FRESH mesh, states so in the artifact)

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { certifyTriangle, detectThetaJumps, detectZJumps } from '../bridge/_facetTruthLib';
import { buildAuditRadiusFn, radiusLattice } from '../bridge/_facetTruthRA';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { classifyResidual, facetGeom, type ResidualOwner } from '../bridge/_certComposeLib';
import { STYLE_REGISTRY } from '../../src/styles/registry';
// StyleDims comes from `runStyle`, NOT from `labkit`. labkit re-exports `inhouseMetricMesh` and the
// feature-conforming family, which drag two files with PRE-EXISTING type errors into this tool's compile —
// errors that belong to other arms and that this arm must neither inherit nor "fix" in passing.
import type { StyleDims } from '../bridge/runStyle';

/* eslint-disable no-console */
const log = console.log;

interface JobData {
  meshSab: SharedArrayBuffer;   // f64 xyz of the SURVIVOR set, 9 per facet
  ctrlSab: SharedArrayBuffer;   // Int32Array [cursor, stop]
  boundSab: SharedArrayBuffer;  // Float64Array(nSurv)
  witSab: SharedArrayBuffer;    // Float64Array(nSurv)
  flagSab: SharedArrayBuffer;   // Uint8Array(nSurv): bit0 certified, bit1 witnessedComplete, bit2 visited
  nSurv: number;
  chunk: number;
  H: number; tol: number; nMax: number; sampleCap: number;
  zJumps: number[]; thJumps: number[];
  style: string; styleParams: Record<string, number>; dims: StyleDims;
  latTh: Float64Array; latZ: Float64Array;
  deadlineMs: number;
}
type WorkerMsg =
  | { kind: 'lattice'; lat: Float64Array }
  | { kind: 'result'; audited: number; stopped: boolean };

const CTRL_CURSOR = 0;
const CTRL_STOP = 1;
const F_CERTIFIED = 1;
const F_WITCOMPLETE = 2;
const F_VISITED = 4;

// ═════════════════════════════ THE WORKER HALF ═════════════════════════════
// One loop body, and it is the same call Phase D's `runH1Walk` makes. Every worker rebuilds rA from
// (style, params, dims) and posts it over the verification lattice BEFORE it certifies anything, so a
// mismatched surface aborts in the first second instead of at the end of a 22-minute walk — the discipline
// `_facetTruthPool` established and the only reason a pooled number may be believed at all.
function workerMain(): void {
  const d = workerData as JobData;
  const xyz = new Float64Array(d.meshSab);
  const ctrl = new Int32Array(d.ctrlSab);
  const bound = new Float64Array(d.boundSab);
  const wit = new Float64Array(d.witSab);
  const flag = new Uint8Array(d.flagSab);
  const rA = buildAuditRadiusFn(d.style, d.styleParams, d.dims, d.H).rA;

  const lat = new Float64Array(d.latTh.length);
  for (let i = 0; i < d.latTh.length; i += 1) lat[i] = rA(d.latTh[i], d.latZ[i]);
  parentPort?.postMessage({ kind: 'lattice', lat } satisfies WorkerMsg);

  const opts = { H: d.H, tol: d.tol, nMax: d.nMax, sampleCap: d.sampleCap, zJumps: d.zJumps, thJumps: d.thJumps };
  let audited = 0;
  let stopped = false;
  for (;;) {
    if (Atomics.load(ctrl, CTRL_STOP) !== 0) { stopped = true; break; }
    const lo = Atomics.add(ctrl, CTRL_CURSOR, d.chunk);
    if (lo >= d.nSurv) break;
    const hi = Math.min(d.nSurv, lo + d.chunk);
    for (let s = lo; s < hi; s += 1) {
      const o = s * 9;
      const v = certifyTriangle(rA,
        xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
        opts);
      bound[s] = v.bound;
      wit[s] = v.witnessed;
      flag[s] = F_VISITED | (v.certified ? F_CERTIFIED : 0) | (v.witnessedComplete ? F_WITCOMPLETE : 0);
      audited += 1;
    }
    if (Date.now() > d.deadlineMs) { Atomics.store(ctrl, CTRL_STOP, 1); stopped = true; break; }
  }
  parentPort?.postMessage({ kind: 'result', audited, stopped } satisfies WorkerMsg);
}

// ═════════════════════════════ THE PARENT HALF ═════════════════════════════

const num = (k: string, dflt: number): number => {
  const v = process.env[k];
  if (v === undefined || v === '') return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${k}='${v}' is not a finite number`);
  return n;
};
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

interface SurvivorsFile { schema: string; stl: string; nTri: number; tolUm: number; count: number; tri: number[] }
interface RecordedResidual {
  schema: string; stl: string; nTri: number; tolUm: number;
  screen: { nCertified: number; nSurvivors: number; maxCertBoundUm: number };
  cpu: { nAudited: number; nOver: number; nUncert: number; maxBoundUm: number; maxWitnessedUm: number };
  enumerationComplete: boolean;
  byOwner: Record<string, { count: number; maxUm: number }>;
  rows: Array<{ tri: number; witnessedUm: number; owner: string }>;
}

async function parentMain(): Promise<void> {
  const SURV = process.argv[2] ?? 'research/exchange/_strataCertD/CERTD_S24i2.survivors.json';
  const RESID = process.argv[3] ?? 'research/exchange/_strataCertD/CERTD_S24i2.residual.json';
  const OUT = process.argv[4] ?? 'research/exchange/_strataCertD/CERTD_S24i2.residual2.json';
  const PROG = `${OUT.replace(/\.json$/, '')}.progress.log`;
  const NOEXPECT = process.env.PF_S28U0_NOEXPECT === '1';
  const DRYRUN = process.env.PF_S28U0_DRYRUN === '1';

  const t0 = Date.now();
  // OPS TRAP 11: a chain that died silently and a chain that is still running look identical from outside,
  // so every long wait gets a timestamped progress line and a terminal sentinel a watcher can grep.
  const say = (s: string): void => {
    const line = `${new Date().toTimeString().slice(0, 8)} +${((Date.now() - t0) / 1000).toFixed(0)}s  ${s}`;
    try { appendFileSync(PROG, `${line}\n`); } catch { /* a log write never aborts the run */ }
    log(`[S28-U0] ${line}`);
  };
  const fail = (msg: string): never => {
    say(`*** S28-U0 FAILED *** ${msg}`);
    throw new Error(msg);
  };

  const surv = JSON.parse(readFileSync(SURV, 'utf8')) as SurvivorsFile;
  if (surv.schema !== 'pf.strata.certD.survivors/1') fail(`${SURV}: schema '${surv.schema}'`);
  if (!Array.isArray(surv.tri) || surv.tri.length !== surv.count) fail(`${SURV}: tri[] ${surv.tri?.length} != count ${surv.count}`);

  const rec = existsSync(RESID) ? JSON.parse(readFileSync(RESID, 'utf8')) as RecordedResidual : null;
  if (rec === null && !NOEXPECT) fail(`${RESID} not found; pass PF_S28U0_NOEXPECT=1 only if there is genuinely no recorded run to reproduce`);
  if (rec !== null && rec.stl !== surv.stl) fail(`survivors stl '${surv.stl}' != residual stl '${rec.stl}'`);

  const STL = process.env.PF_S28U0_STL ?? surv.stl;
  if (!existsSync(STL)) fail(`STL not found: ${STL}`);
  const TOL = surv.tolUm / 1000;
  const NMAX = Math.round(num('PF_S28U0_NMAX', 2048));
  const SAMPLECAP = num('PF_S28U0_SAMPLECAP', 4e6);
  const SECS = num('PF_S28U0_SECS', 7200);
  const STYLE = process.env.PF_S28U0_STYLE ?? 'GothicArches';
  const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
  const H = DIMS.H;
  const bands = {
    rimMm: num('PF_S28U0_RIM_MM', 0.1), H,
    arCap: num('PF_S28U0_ARCAP', 50),
    longMm: num('PF_S28U0_LONG_MM', 0.5), midMm: num('PF_S28U0_MID_MM', 0.15),
  };

  say(`START survivors=${SURV} (${surv.count}) residual=${RESID} stl=${STL} TOL=${(TOL * 1000).toFixed(3)} um nMax=${NMAX}`);

  const styleParams = registryDefaults(STYLE);
  const auditR = buildAuditRadiusFn(STYLE, styleParams, DIMS, H);
  const rA = auditR.rA;
  const { xyz, nTri } = readMeshFloat64(STL, false);
  if (nTri !== surv.nTri) fail(`STL has ${nTri} facets, survivors.json says ${surv.nTri}`);
  const zJumps = detectZJumps(rA, H);
  const thJumps = detectThetaJumps(rA, H);
  say(`mesh ${nTri} facets; C0 z-steps ${zJumps.length}, theta-jumps ${thJumps.length}`);

  // ── compact the survivors into a SharedArrayBuffer, exactly as Phase D's stage 2 does ─────────────────
  const nSurv = surv.count;
  if (nSurv === 0) fail('no survivors — nothing to certify');
  const meshSab = new SharedArrayBuffer(nSurv * 9 * 8);
  const survXyz = new Float64Array(meshSab);
  for (let s = 0; s < nSurv; s += 1) {
    const t = surv.tri[s];
    if (!Number.isInteger(t) || t < 0 || t >= nTri) fail(`survivor ${s} names triangle ${t}, out of range for ${nTri}`);
    const o = t * 9;
    for (let k = 0; k < 9; k += 1) survXyz[s * 9 + k] = xyz[o + k];
  }

  const workers = Math.max(1, Math.round(num('PF_S28U0_WORKERS', Math.max(1, Math.min(16, cpus().length)))));
  // The pool's own chunk rule, verbatim: >=64 chunks per worker under a ceiling, because per-facet cost was
  // measured to span 181x and a static split finishes when the unluckiest worker does.
  const chunk = Math.max(1, Math.min(64, Math.floor(nSurv / (64 * workers))));

  const ctrlSab = new SharedArrayBuffer(2 * 4);
  const ctrl = new Int32Array(ctrlSab);
  Atomics.store(ctrl, CTRL_CURSOR, 0); Atomics.store(ctrl, CTRL_STOP, 0);
  const boundSab = new SharedArrayBuffer(nSurv * 8);
  const witSab = new SharedArrayBuffer(nSurv * 8);
  const flagSab = new SharedArrayBuffer(nSurv);
  const boundMm = new Float64Array(boundSab);
  const witMm = new Float64Array(witSab);
  const flags = new Uint8Array(flagSab);

  const lat = radiusLattice(H, zJumps, thJumps);
  const expectLat = new Float64Array(lat.th.length);
  for (let i = 0; i < expectLat.length; i += 1) expectLat[i] = rA(lat.th[i], lat.z[i]);

  let latDiff = 0; let latChecked = 0; let latMaxDev = 0;
  const verifyLattice = (got: Float64Array): void => {
    latChecked += 1;
    for (let i = 0; i < expectLat.length; i += 1) {
      // Object.is so a NaN/NaN pair counts as identical and a +0/-0 pair does not.
      if (!Object.is(expectLat[i], got[i])) {
        latDiff += 1;
        const dv = Math.abs(expectLat[i] - got[i]);
        if (!(dv <= latMaxDev)) latMaxDev = dv;
      }
    }
    if (latDiff > 0) Atomics.store(ctrl, CTRL_STOP, 1);
  };

  say(`STAGE 2 RE-EMISSION: ${nSurv} survivors -> CPU, ${workers} worker threads, chunk ${chunk}, deadline ${SECS}s`);
  const data: JobData = {
    meshSab, ctrlSab, boundSab, witSab, flagSab, nSurv, chunk,
    H, tol: TOL, nMax: NMAX, sampleCap: SAMPLECAP, zJumps, thJumps,
    style: STYLE, styleParams, dims: DIMS, latTh: lat.th, latZ: lat.z,
    deadlineMs: Date.now() + SECS * 1000,
  };
  const heapMb = Math.round(num('PF_S28U0_HEAPMB', 2048));
  const ticker = setInterval(() => {
    const done = Atomics.load(ctrl, CTRL_CURSOR);
    say(`  progress ~${Math.min(done, nSurv)}/${nSurv} claimed (${((100 * Math.min(done, nSurv)) / nSurv).toFixed(1)}%)`);
  }, 60000);
  ticker.unref?.();

  const spawn = (): Promise<{ audited: number; stopped: boolean }> => new Promise((res, rej) => {
    const w = new Worker(__filename, { workerData: data, resourceLimits: { maxOldGenerationSizeMb: heapMb } });
    let got = false;
    w.on('message', (m: WorkerMsg) => {
      if (m.kind === 'lattice') { verifyLattice(m.lat); return; }
      got = true; res({ audited: m.audited, stopped: m.stopped }); void w.terminate();
    });
    w.on('error', (e) => { Atomics.store(ctrl, CTRL_STOP, 1); rej(e); });
    w.on('exit', (code) => { if (!got) { Atomics.store(ctrl, CTRL_STOP, 1); rej(new Error(`worker exited ${code} before reporting`)); } });
  });

  const settled = await Promise.allSettled(Array.from({ length: workers }, spawn));
  clearInterval(ticker);
  const rejected = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');
  if (latDiff > 0) {
    fail(`a worker's rebuilt rA is NOT bit-identical to the parent's — ${latDiff} of ${expectLat.length * Math.max(1, latChecked)} lattice points differ, worst ${(latMaxDev * 1000).toExponential(3)} um. Every number would be scored against a different surface. Refusing to report.`);
  }
  if (rejected.length > 0) fail(`${rejected.length}/${workers} workers failed — ${String(rejected[0].reason).slice(0, 300)}`);
  if (latChecked !== workers) fail(`only ${latChecked}/${workers} workers reported an rA verification lattice — refusing to report unverified work`);
  let audited = 0;
  for (const s of settled) if (s.status === 'fulfilled') audited += s.value.audited;
  const wallMs = Date.now() - t0;
  say(`STAGE 2 RE-EMISSION DONE: audited ${audited}/${nSurv} in ${(wallMs / 1000).toFixed(1)}s (${((1000 * audited) / Math.max(1, wallMs)).toFixed(2)} facets/s)`);

  // COVERAGE IS AN ASSERTION, NOT A HOPE. A facet the pool skipped is not a certified facet.
  let nVisited = 0;
  for (let s = 0; s < nSurv; s += 1) if ((flags[s] & F_VISITED) !== 0) nVisited += 1;
  if (nVisited !== nSurv || audited !== nSurv) {
    fail(`incomplete re-emission: ${nVisited} visited / ${audited} audited of ${nSurv}. A partial bound column may not be published.`);
  }

  // ── reduce: the two argmaxes under the campaign's own total order (value desc, then tri asc) ───────────
  let maxBoundMm = 0; let maxBoundTri = -1;
  let maxWitMm = 0; let maxWitTri = -1;
  let nOver = 0; let nUncert = 0; let nIncomplete = 0;
  const better = (d1: number, t1: number, d2: number, t2: number): boolean => d1 > d2 || (d1 === d2 && t2 >= 0 && t1 < t2);
  for (let s = 0; s < nSurv; s += 1) {
    const t = surv.tri[s];
    if (better(boundMm[s], t, maxBoundMm, maxBoundTri)) { maxBoundMm = boundMm[s]; maxBoundTri = t; }
    if (better(witMm[s], t, maxWitMm, maxWitTri)) { maxWitMm = witMm[s]; maxWitTri = t; }
    if (witMm[s] > TOL) nOver += 1;
    else if ((flags[s] & F_CERTIFIED) === 0) nUncert += 1;
    if ((flags[s] & F_WITCOMPLETE) === 0) nIncomplete += 1;
  }

  // ── the rows, ALL of them, with the bound column and the owner from the composer's own taxonomy ────────
  interface Row { tri: number; witnessedUm: number; boundUm: number; certified: boolean; owner: ResidualOwner;
    ar: number; longestUm: number; zMin: number; zMax: number; theta: number }
  const rows: Row[] = [];
  const byOwner: Record<string, { count: number; maxUm: number; maxBoundUm: number }> = {};
  for (let s = 0; s < nSurv; s += 1) {
    if (!(witMm[s] > TOL)) continue;
    const t = surv.tri[s];
    const g = facetGeom(xyz, t);
    const owner = classifyResidual(g, bands);
    rows.push({
      tri: t, witnessedUm: witMm[s] * 1000, boundUm: boundMm[s] * 1000,
      certified: (flags[s] & F_CERTIFIED) !== 0, owner,
      ar: g.ar, longestUm: g.longestMm * 1000, zMin: g.zMin, zMax: g.zMax, theta: g.thetaA,
    });
    const cur = byOwner[owner] ?? { count: 0, maxUm: 0, maxBoundUm: 0 };
    cur.count += 1;
    if (witMm[s] * 1000 > cur.maxUm) cur.maxUm = witMm[s] * 1000;
    if (boundMm[s] * 1000 > cur.maxBoundUm) cur.maxBoundUm = boundMm[s] * 1000;
    byOwner[owner] = cur;
  }
  rows.sort((p, q) => (q.witnessedUm - p.witnessedUm) || (p.tri - q.tri));

  // ── THE DECISIVE QUANTITY. The rim/interior split on CERTIFIED BOUNDS, over EVERY survivor and not only
  //    the over-TOL ones: a facet whose witness is under TOL can still carry the largest bound in its class,
  //    and C1 is a bound clause. The screen ceiling enters because the interior contains screen-certified
  //    facets too, and the composed interior bound is the max over the whole interior population. ─────────
  const screenCeilUm = rec !== null ? rec.screen.maxCertBoundUm : 0;
  let intBoundMm = 0; let intBoundTri = -1; let rimBoundMm = 0; let rimBoundTri = -1;
  let intWitMm = 0; let intWitTri = -1; let rimWitMm = 0; let rimWitTri = -1;
  let nRimSurv = 0;
  for (let s = 0; s < nSurv; s += 1) {
    const t = surv.tri[s];
    const isRim = classifyResidual(facetGeom(xyz, t), bands) === 'rim-row';
    if (isRim) {
      nRimSurv += 1;
      if (better(boundMm[s], t, rimBoundMm, rimBoundTri)) { rimBoundMm = boundMm[s]; rimBoundTri = t; }
      if (better(witMm[s], t, rimWitMm, rimWitTri)) { rimWitMm = witMm[s]; rimWitTri = t; }
    } else {
      if (better(boundMm[s], t, intBoundMm, intBoundTri)) { intBoundMm = boundMm[s]; intBoundTri = t; }
      if (better(witMm[s], t, intWitMm, intWitTri)) { intWitMm = witMm[s]; intWitTri = t; }
    }
  }
  const interiorCertUm = Math.max(intBoundMm * 1000, screenCeilUm);
  const interiorAttainedBy = intBoundMm * 1000 >= screenCeilUm ? 'cpu' : 'screen';

  // ═════════════════════ THE REPRODUCTION CHECK — the whole warrant for this shortcut ═════════════════════
  let failures = 0;
  const check = (name: string, ok: boolean, detail: string): void => {
    if (!ok) failures += 1;
    say(`  [${ok ? 'PASS' : '*** FAIL ***'}] ${name} — ${detail}`);
  };
  say('--- REPRODUCTION CHECK against the recorded Phase-D run (expectations READ FROM THE ARTIFACT) ---');
  if (rec === null) {
    say('  PF_S28U0_NOEXPECT=1 — no recorded run to reproduce. The artifact records this and no bound below is');
    say('  cross-checked against anything. Use ONLY for a mesh Phase D has not certified.');
  } else {
    check('R1 max certified bound reproduces to the bit',
      (maxBoundMm * 1000) === rec.cpu.maxBoundUm,
      `re-emitted ${(maxBoundMm * 1000).toFixed(14)} vs recorded ${rec.cpu.maxBoundUm.toFixed(14)} um`);
    check('R2 max witnessed (raw local) reproduces to the bit',
      (maxWitMm * 1000) === rec.cpu.maxWitnessedUm,
      `re-emitted ${(maxWitMm * 1000).toFixed(14)} at tri ${maxWitTri} vs recorded ${rec.cpu.maxWitnessedUm.toFixed(14)}`);
    check('R3 nOver reproduces', nOver === rec.cpu.nOver, `${nOver} vs ${rec.cpu.nOver}`);
    check('R4 nUncert reproduces', nUncert === rec.cpu.nUncert, `${nUncert} vs ${rec.cpu.nUncert}`);
    check('R5 nAudited reproduces', audited === rec.cpu.nAudited, `${audited} vs ${rec.cpu.nAudited}`);
    const mine = Object.entries(byOwner).map(([k, v]) => `${k}=${v.count}`).sort().join(',');
    const theirs = Object.entries(rec.byOwner).map(([k, v]) => `${k}=${v.count}`).sort().join(',');
    check('R6 the owner census reproduces exactly', mine === theirs, `${mine}  vs  ${theirs}`);
    let wmax = true;
    for (const [k, v] of Object.entries(rec.byOwner)) {
      if (byOwner[k] === undefined || byOwner[k].maxUm !== v.maxUm) wmax = false;
    }
    check('R7 the per-owner WITNESSED maxima reproduce to the bit', wmax,
      Object.entries(byOwner).map(([k, v]) => `${k} ${v.maxUm.toFixed(3)}`).join(' | '));
    // The recorded rows are a 4096 prefix by value; every one of them must appear with the same value here.
    let prefixOk = true; let firstBad = '';
    const mineByTri = new Map<number, number>();
    for (const r of rows) mineByTri.set(r.tri, r.witnessedUm);
    for (const r of rec.rows) {
      const v = mineByTri.get(r.tri);
      if (v === undefined || v !== r.witnessedUm) {
        prefixOk = false;
        if (firstBad === '') firstBad = `tri ${r.tri}: recorded ${r.witnessedUm} vs re-emitted ${v === undefined ? 'ABSENT' : v}`;
        break;
      }
    }
    check('R8 every recorded row reproduces to the bit (the 4096-row prefix)', prefixOk,
      prefixOk ? `all ${rec.rows.length} recorded rows matched inside the ${rows.length} re-emitted` : firstBad);
  }

  say('--- THE QUANTITY S28-U0 EXISTS TO CREATE ---');
  say(`  INTERIOR certified bound  : ${interiorCertUm.toFixed(3)} um   (cpu argmax tri ${intBoundTri} at ${(intBoundMm * 1000).toFixed(3)} um; screen ceiling ${screenCeilUm.toFixed(6)} um; attained by the ${interiorAttainedBy} half)`);
  say(`  INTERIOR witnessed max    : ${(intWitMm * 1000).toFixed(3)} um   (tri ${intWitTri})`);
  say(`  RIM-ROW certified bound   : ${(rimBoundMm * 1000).toFixed(3)} um   (tri ${rimBoundTri})`);
  say(`  RIM-ROW witnessed max     : ${(rimWitMm * 1000).toFixed(3)} um   (tri ${rimWitTri})`);
  say(`  rim-row survivors ${nRimSurv} of ${nSurv}; over-TOL rows ${rows.length}; incomplete witnesses ${nIncomplete}`);
  say(`  by owner (count / worst witnessed / worst BOUND): `
    + Object.entries(byOwner).sort((a, b) => b[1].count - a[1].count)
      .map(([k, v]) => `${k} ${v.count} / ${v.maxUm.toFixed(3)} / ${v.maxBoundUm.toFixed(3)}`).join('  |  '));

  if (failures > 0) fail(`${failures} reproduction check(s) failed — the bound column is NOT written`);

  const out = {
    schema: 'pf.strata.certD.residual/2',
    producedBy: 's28BoundCol.ts (S28-U0) — STAGE-2 RE-EMISSION from the RECORDED survivor list; the GPU screen was NOT re-run',
    stl: STL, nTri, tolUm: TOL * 1000,
    reproducedFrom: rec === null ? null : { residual: RESID, survivors: SURV, checks: 'R1-R8 all PASS' },
    screen: rec === null ? null : rec.screen,
    cpu: {
      nAudited: audited, nOver, nUncert, nIncomplete,
      maxBoundUm: maxBoundMm * 1000, maxBoundTri,
      maxWitnessedRawUm: maxWitMm * 1000, maxWitnessedRawTri: maxWitTri,
      nMax: NMAX, workers, wallMs,
    },
    // *** THE CLAUSE-C1 BLOCK. This is the whole point of the file. ***
    split: {
      bands,
      interior: {
        certifiedBoundUm: interiorCertUm, attainedBy: interiorAttainedBy,
        cpuBoundUm: intBoundMm * 1000, cpuBoundTri: intBoundTri,
        witnessedUm: intWitMm * 1000, witnessedTri: intWitTri,
      },
      rimRow: {
        certifiedBoundUm: rimBoundMm * 1000, certifiedBoundTri: rimBoundTri,
        witnessedUm: rimWitMm * 1000, witnessedTri: rimWitTri,
        survivors: nRimSurv,
      },
      note: 'INTERIOR EXCLUDES THE RIM ROW (any vertex within rimMm of z=0 or z=H) per the standing '
        + 'open-boundary caveat. interior.certifiedBoundUm is max(cpu interior bound, screen ceiling) and is '
        + 'a bound over EVERY interior facet of the mesh, screen-certified ones included.',
    },
    enumerationComplete: true,
    byOwner,
    rowsAreComplete: true,
    rows,
  };
  if (DRYRUN) {
    say(`PF_S28U0_DRYRUN=1 — all checks passed, ${OUT} NOT written.`);
  } else {
    writeFileSync(OUT, JSON.stringify(out, null, 1));
    say(`WROTE ${OUT}  (${rows.length} rows, every one carrying boundUm)`);
  }
  say('S28-U0 DONE');
}

if (!isMainThread) {
  workerMain();
} else {
  parentMain().catch((e: unknown) => {
    log(`\n*** S28-U0 FAILED: ${String(e)} ***\n`);
    process.exitCode = 1;
  });
}
