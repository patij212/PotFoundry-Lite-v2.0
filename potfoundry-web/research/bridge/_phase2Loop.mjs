#!/usr/bin/env node
// _phase2Loop.mjs — THE PHASE-2 OUTER LOOP (spec §5.4). RESEARCH ONLY.
//
//   for it in 1..OUTER_MAX:
//       PHASE 1   mesh from scratch, with iteration it-1's tightening field applied (none on it = 1)
//       PHASE 2   honest certificate on the finished mesh, emitting the exceedance set
//       decide:   PASS | INFEASIBLE-AT-CAP | NON-MONOTONE | (continue)
//   exit NOT-CONVERGED (outer budget)
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE EXIT CONDITIONS, STATED (§5.4). All five are implemented below; nothing is aspirational.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
//  PASS               H2 witnessed max <= TOL at 100 % phase-A coverage, AND the mesher reported
//                     unresolvedLeft = 0, not capped, not time-capped, and no unconsumed curtain sites.
//                     *** THIS LOOP'S PASS IS AN H2 PASS, NOT THE SPEC'S FULL PASS. ***  §5.2 also requires
//                     a GPU-screen triage at 100 % coverage and a CPU-H1 confirmation of the argmax top-K.
//                     Neither is run here (H1 is a separate harness, _strataFacetTruth.test.ts, and the GPU
//                     screen is _gpuRankBridge). H2 is a WITNESSED LOWER BOUND — it can only ever say
//                     "at least this bad", so an H2 pass is necessary and not sufficient. Confirm before
//                     claiming a style closed.
//  DEFERRED-TO-CURTAIN  as PASS but the mesher tagged h0 curtain sites and no curtain stage consumed them.
//                     A different fact from NOT-CONVERGED: no bisection driver can ever close an h0 jump.
//  INFEASIBLE-AT-CAP  the emitted field's own cost prediction exceeds triCap. NEVER loosen TOL — 0.01
//                     everywhere, no concessions. Raise the cap or tile.
//  NON-MONOTONE       max_it > max_{it-1} / 1.3 while tris_it > 1.5 * tris_{it-1}: the mesh got much bigger
//                     and barely better. That is the signature of h0 content misclassified as crease, and
//                     the answer is a curtain, not more density.
//  NOT-CONVERGED      outer budget exhausted, or the mesher reported unresolved / capped / time-capped.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY IT RE-MESHES FROM SCRATCH
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// The driver is deterministic in (style, params, flags, loci file). A from-scratch re-run is therefore a
// well-defined object with no dependence on the previous mesh's topology, and a reported iteration can be
// reproduced by anyone holding the file. Resuming a mesh would make the result a function of the path taken
// — which is precisely how this campaign ended up with committed baselines nobody can reproduce
// (project_strata_baselines_not_reproducible, 2026-07-28). It also costs less than it sounds: D25 drained in
// 1229 s, and the tightened re-run visits the same surface with a slightly finer target in ~4 % of it.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// USAGE
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
//   node research/bridge/_phase2Loop.mjs                    (from potfoundry-web/)
//
//   PF_P2L_OUTER_MAX   outer iterations, default 3
//   PF_P2L_STYLE       default GothicArches
//   PF_P2L_STAGE       default ring
//   PF_P2L_GRIDU/V     default 60 / 40
//   PF_P2L_TRICAP      default 2500000
//   PF_P2L_TOL_UM      default 10
//   PF_P2L_ACCEPT_UM   default 7
//   PF_P2L_RUNTAG      run label, default 'P2'   -> tag suffix _<RUNTAG>i<n>
//   PF_P2L_DRY         1 = print the plan and the commands, run nothing
//   every PF_CB_* / PF_P2_* in the environment is passed through, so the loop tunes exactly like a hand run.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CB_DIR = join('research', 'exchange', '_strataConformBisect');
const LOCI_DIR = join('research', 'exchange', '_phase2');

const envF = (n, d) => {
  const r = process.env[n];
  if (r === undefined || r === '') return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
};

const OUTER_MAX = Math.round(envF('PF_P2L_OUTER_MAX', 3));
const STYLE = process.env.PF_P2L_STYLE ?? 'GothicArches';
const STAGE = process.env.PF_P2L_STAGE ?? 'ring';
const GRIDU = Math.round(envF('PF_P2L_GRIDU', 60));
const GRIDV = Math.round(envF('PF_P2L_GRIDV', 40));
const TRICAP = Math.round(envF('PF_P2L_TRICAP', 2_500_000));
const TOL_UM = envF('PF_P2L_TOL_UM', 10);
const ACCEPT_UM = envF('PF_P2L_ACCEPT_UM', 7);
const RUNTAG = process.env.PF_P2L_RUNTAG ?? 'P2';
const DRY = process.env.PF_P2L_DRY === '1';
const MESH_TIMEOUT = Math.round(envF('PF_P2L_MESH_TIMEOUT_MS', 6_000_000));
const AUDIT_TIMEOUT = Math.round(envF('PF_P2L_AUDIT_TIMEOUT_MS', 6_000_000));

const log = (s) => process.stdout.write(`${s}\n`);

function run(label, file, extraEnv, timeoutMs, extraArgs) {
  // EACH STAGE NEEDS ITS OWN CONFIG, and neither can be replaced by CLI flags. The mesher runs under
  // vitest.strata.config.ts — environment 'node', pool 'forks', singleFork — which is what every measurement
  // in this campaign was taken under. The audit is not in that config's `include`, so it gets
  // research/bridge/_phase2Vitest.config.ts, which sets the same three.
  // MEASURED, not assumed: `--environment=node` ALONE fails before a test runs, because the repo's default
  // config also loads src/test/setup.ts, which dereferences HTMLCanvasElement at module scope, and there is
  // no --setupFiles flag to clear it. The first real run of this loop aborted on exactly that.
  const args = ['vitest', 'run', ...extraArgs, file, `--testTimeout=${timeoutMs}`, '--hookTimeout=600000'];
  const env = { ...process.env, ...extraEnv };
  log(`\n=== ${label} ===`);
  log(`  npx ${args.join(' ')}`);
  for (const [k, v] of Object.entries(extraEnv)) log(`    ${k}=${v}`);
  if (DRY) return true;
  const r = spawnSync('npx', args, { env, stdio: 'inherit', shell: true });
  return r.status === 0;
}

/** Find the driver's run manifest for a given tag suffix. The driver owns the tag; the loop must not guess it. */
function findManifest(suffix) {
  if (!existsSync(CB_DIR)) return null;
  const hits = readdirSync(CB_DIR).filter((f) => f.endsWith(`${suffix}.run.json`));
  if (hits.length !== 1) return null;
  return join(CB_DIR, hits[0]);
}

const history = [];
let fieldPath = '';
let verdict = 'NOT-CONVERGED';
let why = `outer budget of ${OUTER_MAX} iterations exhausted`;

for (let it = 1; it <= OUTER_MAX; it += 1) {
  const suffix = `_${RUNTAG}i${it}`;
  const meshEnv = {
    PF_STRATA_CB: '1',
    PF_CB_STYLE: STYLE,
    PF_CB_STAGE: STAGE,
    PF_CB_DRIVER: 'heap',
    PF_CB_RANK: 'plane',
    PF_CB_DIRECTED: '1',
    PF_CB_SNAP: '1',
    PF_CB_GRIDU: String(GRIDU),
    PF_CB_GRIDV: String(GRIDV),
    PF_CB_TRICAP: String(TRICAP),
    PF_CB_TOL: String(TOL_UM / 1000),
    PF_CB_ACCEPT: String(ACCEPT_UM / 1000),
    PF_CB_TAG_SUFFIX: suffix,
    ...(fieldPath === '' ? {} : { PF_CB_TIGHTEN: fieldPath }),
  };
  if (!run(`PHASE 1 — mesh, iteration ${it}/${OUTER_MAX}${fieldPath === '' ? ' (no field)' : ` (field ${fieldPath})`}`,
    'research/bridge/_strataConformBisect.test.ts', meshEnv, MESH_TIMEOUT, ['-c', 'vitest.strata.config.ts'])) {
    verdict = 'ABORTED'; why = `the mesher failed on iteration ${it}`; break;
  }
  if (DRY) { log('  [dry run — stopping after printing iteration 1]'); process.exit(0); }

  const manPath = findManifest(suffix);
  if (manPath === null) { verdict = 'ABORTED'; why = `no unique *${suffix}.run.json in ${CB_DIR}`; break; }
  const man = JSON.parse(readFileSync(manPath, 'utf8'));
  const lociOut = join(LOCI_DIR, `${man.tag}.loci.json`);

  const auditEnv = {
    PF_P2_AUDIT: '1',
    PF_P2_RUN: manPath,
    PF_P2_OUT: lociOut,
    PF_FT_H2WORKERS: '1',   // the emitting audit is serial by necessity — see _phase2Audit.test.ts's header
  };
  if (!run(`PHASE 2 — certificate + loci, iteration ${it}/${OUTER_MAX}`,
    'research/bridge/_phase2Audit.test.ts', auditEnv, AUDIT_TIMEOUT, ['-c', 'research/bridge/_phase2Vitest.config.ts'])) {
    verdict = 'ABORTED'; why = `the audit failed on iteration ${it}`; break;
  }
  const loci = JSON.parse(readFileSync(lociOut, 'utf8'));

  const rec = {
    it,
    tag: man.tag,
    tris: man.nTri,
    alloc: man.alloc,
    driverVerdict: man.verdict,
    driverMaxUm: man.headlineMaxMm * 1000,
    unresolved: man.unresolvedLeft,
    capped: man.capped,
    timeCapped: man.timeCapped,
    curtainSites: man.curtainSites,
    h2MaxUm: loci.audit.maxMm * 1000,
    overCount: loci.audit.overCount,
    queries: loci.audit.queries,
    clusters: loci.clusters.length,
    predictedTris: Math.round(loci.predict.predictedTris),
    lociFile: lociOut,
  };
  history.push(rec);
  log(`\n--- iteration ${it}: ${rec.tris} tris   driver ${rec.driverMaxUm.toFixed(3)} µm ${rec.driverVerdict}`
    + `   H2 ${rec.h2MaxUm.toFixed(3)} µm   over ${rec.overCount}/${rec.queries}   ${rec.clusters} loci`);

  // ── EXIT: PASS / DEFERRED-TO-CURTAIN ──────────────────────────────────────────────────────────────────
  const h2Pass = loci.audit.maxMm <= man.tolMm && !loci.audit.rawCapped;
  const driverClean = man.unresolvedLeft === 0 && !man.capped && !man.timeCapped;
  if (h2Pass && driverClean && man.curtainSites === 0) {
    verdict = 'PASS';
    why = `H2 witnessed ${rec.h2MaxUm.toFixed(3)} µm <= TOL ${(man.tolMm * 1000).toFixed(1)} µm, `
      + `driver drained with 0 unresolved. NOT the spec's full PASS: no GPU screen, no CPU-H1 top-K confirm.`;
    break;
  }
  if (h2Pass && driverClean && man.curtainSites > 0) {
    verdict = 'DEFERRED-TO-CURTAIN';
    why = `${man.curtainSites} h0 sites tagged and unconsumed; no bisection driver can close them.`;
    break;
  }

  // ── EXIT: NOT-CONVERGED on the driver's own signals ───────────────────────────────────────────────────
  if (!driverClean) {
    verdict = 'NOT-CONVERGED';
    why = `iteration ${it}: unresolved ${man.unresolvedLeft}, capped ${man.capped}, time-capped ${man.timeCapped}`
      + ` — the mesh was never refined to completion, so its max is a LOWER bound.`;
    break;
  }

  // ── EXIT: NON-MONOTONE (needs a previous iteration to compare against) ────────────────────────────────
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    if (rec.h2MaxUm > prev.h2MaxUm / 1.3 && rec.tris > 1.5 * prev.tris) {
      verdict = 'NON-MONOTONE';
      why = `H2 ${prev.h2MaxUm.toFixed(3)} → ${rec.h2MaxUm.toFixed(3)} µm (needed ≤ ${(prev.h2MaxUm / 1.3).toFixed(3)}) `
        + `while triangles ${prev.tris} → ${rec.tris} (>1.5×). Signature of h0 content misclassified as crease: `
        + `the answer is a curtain stage, not more density.`;
      break;
    }
  }

  // ── EXIT: INFEASIBLE-AT-CAP, priced BEFORE spending the next iteration ────────────────────────────────
  if (loci.predict.predictedTris > TRICAP) {
    verdict = 'INFEASIBLE-AT-CAP';
    why = `the emitted field predicts ${rec.predictedTris} triangles against triCap ${TRICAP} `
      + `(footprint ${loci.predict.unionAreaMm2.toFixed(1)} mm² at ${loci.predict.densityPerMm2.toFixed(1)} tris/mm²). `
      + `NEVER loosen TOL — raise the cap or tile. NB the estimate extrapolates the mesh's GLOBAL density into a `
      + `region that is already denser than average, so it OVER-states; check it before acting.`;
    break;
  }

  if (loci.clusters.length === 0) {
    verdict = 'NOT-CONVERGED';
    why = `iteration ${it}: H2 read ${rec.h2MaxUm.toFixed(3)} µm > TOL but emitted ZERO loci — the exceedance `
      + `recorder and the reported max disagree, which is a harness fault, not a mesh fault.`;
    break;
  }
  fieldPath = lociOut;
}

log('\n=========================================================');
log(`PHASE-2 OUTER LOOP: ${verdict}`);
log(`  ${why}`);
log('  trajectory (iteration: tris | driver self-report | H2 true-3D | samples over tol | loci):');
for (const r of history) {
  log(`    ${r.it}: ${r.tris} tris | ${r.driverMaxUm.toFixed(3)} µm ${r.driverVerdict} | ${r.h2MaxUm.toFixed(3)} µm | `
    + `${r.overCount}/${r.queries} | ${r.clusters} → ${r.lociFile}`);
}
log('=========================================================');
process.exit(verdict === 'PASS' || verdict === 'DEFERRED-TO-CURTAIN' ? 0 : 1);
