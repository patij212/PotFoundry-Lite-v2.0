// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// *** THIS FILE HAS NEVER BEEN EXECUTED, TYPE-CHECKED OR LINTED. DO NOT TRUST IT BECAUSE IT IS IN THE  ***
// *** TREE. ***  The S28 session that wrote it could not run ANY program — `node <script>`, `sh <script>`
// and `npx` were all denied by the session's permission layer (the denial table is in the S28 RESULT block
// of research/lab/2026-07-29-strata-perf-convergence-worklog.md). It is committed UNVALIDATED, deliberately
// and with this header, under the same disposition `_S23R`/`_S23TC` gave the reduced-scale triple: it is
// DECLARED NOT RUN and it is never claimed unrun.
//
// *** THE FIRST THING THE NEXT SESSION MUST DO IS RUN THE SELF-CHECKS AND THE EXPECT-NONZERO PROBE BELOW,
// *** PLUS `tsc --noEmit` (research/tools/tsconfig.s28.json) AND eslint, BEFORE ANY MESHER RUN.
// If a check fails, FIX OR REPLACE THIS FILE. A field builder that cannot fail is not an instrument —
// `_phase2Field.test.ts` caught exactly that class twice on its own first draft.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// S28 FIELD BUILDER — CERTD H1 RESIDUAL  ->  PHASE-2 TIGHTENING FIELD (`pf.phase2Loci/1`).
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Phase D certified H1 <= 214.053 um at 100% coverage on `_S24i2` and enumerated the complete residual:
// 14,569 facets, of which 91.3% are chords under 500 um and only 5 (0.03%) exceed the driver's own AR cap.
// That is ORDINARY UNDER-REFINEMENT on well-shaped triangles — the accepted-blind population S24 proved
// Phase 2 annihilates (the pinned 25.062 um copy fell to 0.062 um, x404, for +0.68% triangles).
//
// The Phase-2 machinery already exists and consumes `PF_CB_TIGHTEN=<loci.json>`. What did not exist is a
// converter from an H1 (mesh -> surface, per FACET) residual to the loci format, which was designed for an
// H2 (surface -> mesh, per SAMPLE) audit. This is that converter and nothing more: it writes a file the
// driver already knows how to read, using `_phase2Loci.ts`'s own writer, clamps and provenance check
// VERBATIM so that no second implementation of the tightening contract can drift from the first.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE FOUR THINGS THAT ARE LOAD-BEARING AND WOULD BE WRONG IF DONE ANY OTHER WAY
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
//  1. RIM-ROW FACETS ARE EXCLUDED. The standing open-boundary caveat (BasketWeave, carried by every arm
//     since `_S21B`) forbids scoring the z=0 / z=H rim row as a wall defect. The rim row is 221 of 14,569
//     facets but owns ALL SIX facets over 200 um, 62 of the worst 100, and the certified argmax itself. A
//     field aimed at it would spend triangles on the one band the campaign declines to score, and would
//     make the headline move for a reason the diagnosis explicitly rejects. The excluded count is COUNTED
//     AND PRINTED, never silently dropped.
//  2. THE SUBSTITUTION IN THE `audit` BLOCK IS NAMED, NOT HIDDEN. `Phase2LociFile.audit` is documented as
//     an H2 audit (`maxMm` = "H2 witnessed max on this mesh"). This file's numbers are H1. Putting an H1
//     number in a field labelled H2 without saying so is exactly the "never quote driver self-report as
//     ROLE" failure the 2026-08-01 correction was written for, so the substitution is declared in
//     `caveats[0]` and in the tool name, and `maxMm` carries the H1 WITNESSED max with its own label.
//  3. `rawCount === overCount` IS TRUE HERE FOR A REAL REASON, NOT AS A FORMALITY. `verifyLociProvenance`
//     refuses a file whose recorder missed queries. Phase D's enumeration completeness is PROVEN (an
//     over-TOL facet's witnessed value strictly exceeds every non-over facet's, so the kept set contains
//     all of them), so every over-TOL facet IS captured and the two counts are equal by construction.
//     `residual.enumerationComplete` is checked and the tool REFUSES if it is false.
//  4. CENTROIDS COME FROM THE STL, NOT FROM THE RESIDUAL'S (theta, z). `residual.json` carries `theta`,
//     `zMin` and `zMax` but NO radius and NO Cartesian point, and the field is queried in Cartesian mm.
//     Reconstructing (x,y) as rA(th,z)*(cos,sin) would name a DIFFERENT point than the facet occupies
//     wherever the facet is off the surface — which is precisely the population this file is about. So the
//     facet's own centroid is read from the binary STL. (The same pass accumulates the mesh area, so
//     `predictTightenedCount` is priced on a MEASURED area rather than a recorded one.)
//
// ARTIFACT-ONLY. No mesher run, no audit, nothing under src/, no proven bridge file touched, imported by
// nothing. `_phase2Loci.ts` is imported READ-ONLY.
//
// USAGE
//   node <bundle> [residual.json] [run.json] [out.loci.json]
//   defaults: research/exchange/_strataCertD/CERTD_S24i2.residual.json
//             research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S24i2.run.json
//             research/exchange/_phase2/S28i1.loci.json
//   env: PF_S28_RADIUS_UM (500) PF_S28_CLUSTER_UM (250) PF_S28_FACTOR (2) PF_S28_MAXSCALE (64)
//        PF_S28_MAXCLUSTERS (20000) PF_S28_MODE (fixed|slope) PF_S28_SLOPE (2.0) PF_S28_DRYRUN (1 = do not write)

import { readFileSync, existsSync } from 'node:fs';
import {
  PHASE2_LOCI_SCHEMA,
  buildTightenField,
  clusterExceedances,
  predictTightenedCount,
  readRunManifest,
  scaleFromSlope,
  verifyLociProvenance,
  writeJsonFile,
  type Phase2Cluster,
  type Phase2LociFile,
  type RawExceedance,
} from '../bridge/_phase2Loci';

// eslint-disable-next-line no-console
const log = console.log;
const TWO_PI = 2 * Math.PI;

const RESIDUAL = process.argv[2] ?? 'research/exchange/_strataCertD/CERTD_S24i2.residual.json';
const RUNJ = process.argv[3] ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S24i2.run.json';
const OUT = process.argv[4] ?? 'research/exchange/_phase2/S28i1.loci.json';

const num = (k: string, d: number): number => {
  const v = process.env[k];
  if (v === undefined || v === '') return d;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${k}='${v}' is not a finite number`);
  return n;
};
const RADIUS_MM = num('PF_S28_RADIUS_UM', 500) / 1000;
const CLUSTER_MM = num('PF_S28_CLUSTER_UM', 250) / 1000;
const FACTOR = num('PF_S28_FACTOR', 2);
const MAXSCALE = num('PF_S28_MAXSCALE', 64);
const MAXCLUSTERS = num('PF_S28_MAXCLUSTERS', 20000);
const SLOPE = num('PF_S28_SLOPE', 2.0);
const MODE: 'fixed' | 'slope' = process.env.PF_S28_MODE === 'slope' ? 'slope' : 'fixed';
const DRYRUN = process.env.PF_S28_DRYRUN === '1';
const TRICAP = 8000000;

// ───────────────────────────── the residual artifact ─────────────────────────────

interface ResidualRow {
  tri: number; witnessedUm: number; owner: string;
  ar: number; longestUm: number; zMin: number; zMax: number; theta: number;
}
interface ResidualFile {
  schema: string; stl: string; nTri: number; tolUm: number;
  screen: { nCertified: number; nSurvivors: number; maxCertBoundUm: number };
  cpu: { nAudited: number; nOver: number; nUncert: number; maxBoundUm: number; maxWitnessedUm: number };
  enumerationComplete: boolean;
  byOwner: Record<string, { count: number; maxUm: number }>;
  rows: ResidualRow[];
}

const fail = (msg: string): never => {
  log(`\n*** S28 FIELD BUILDER FAILED: ${msg} ***\n`);
  process.exit(1);
  throw new Error(msg); // unreachable; keeps the return type honest
};

const res = JSON.parse(readFileSync(RESIDUAL, 'utf8')) as ResidualFile;
if (res.schema !== 'pf.strata.certD.residual/1') fail(`${RESIDUAL}: schema '${res.schema}'`);
// PROPERTY 3. A field built from an INCOMPLETE enumeration is a field with unknown holes in it, and the
// whole point of this input is that its completeness is proven rather than sampled.
if (!res.enumerationComplete) fail(`${RESIDUAL}: enumerationComplete is false — refusing to build a field from a partial residual`);
if (!Array.isArray(res.rows) || res.rows.length === 0) fail(`${RESIDUAL}: no rows`);
if (res.rows.length !== res.cpu.nOver) {
  fail(`${RESIDUAL}: rows ${res.rows.length} != cpu.nOver ${res.cpu.nOver} — the residual is truncated`);
}

const run = readRunManifest(RUNJ);
const STL = res.stl;
if (!existsSync(STL)) fail(`STL not found: ${STL}`);
if (run.nTri !== res.nTri) fail(`run.json nTri ${run.nTri} != residual nTri ${res.nTri}`);

// ───────────────────────────── PROPERTY 4: centroids + area from the binary STL ─────────────────────────────
// Binary STL: 80-byte header, uint32 count, then 50 bytes per facet (12 f32 = normal + 3 verts, uint16 attr).

const stl = readFileSync(STL);
const nTriStl = stl.readUInt32LE(80);
if (nTriStl !== res.nTri) fail(`STL declares ${nTriStl} facets, residual says ${res.nTri}`);
if (stl.length !== 84 + 50 * nTriStl) {
  fail(`STL length ${stl.length} != 84 + 50*${nTriStl} = ${84 + 50 * nTriStl} — not a binary STL of this size`);
}

const need = new Set<number>();
for (const r of res.rows) need.add(r.tri);
const cx = new Map<number, [number, number, number]>();
let meshAreaMm2 = 0;
for (let i = 0; i < nTriStl; i += 1) {
  const o = 84 + 50 * i + 12; // skip the normal
  const ax = stl.readFloatLE(o); const ay = stl.readFloatLE(o + 4); const az = stl.readFloatLE(o + 8);
  const bx = stl.readFloatLE(o + 12); const by = stl.readFloatLE(o + 16); const bz = stl.readFloatLE(o + 20);
  const dx = stl.readFloatLE(o + 24); const dy = stl.readFloatLE(o + 28); const dz = stl.readFloatLE(o + 32);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const vx = dx - ax; const vy = dy - ay; const vz = dz - az;
  const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
  meshAreaMm2 += 0.5 * Math.hypot(nx, ny, nz);
  if (need.has(i)) cx.set(i, [(ax + bx + dx) / 3, (ay + by + dy) / 3, (az + bz + dz) / 3]);
}
if (cx.size !== need.size) fail(`resolved ${cx.size} centroids for ${need.size} residual facets`);

// ───────────────────────────── PROPERTY 1: the rim-row exclusion, counted ─────────────────────────────

const RIM = 'rim-row';
const raw: RawExceedance[] = [];
let nRim = 0;
let interiorMaxUm = 0;
let rimMaxUm = 0;
for (const r of res.rows) {
  if (r.owner === RIM) {
    nRim += 1;
    if (r.witnessedUm > rimMaxUm) rimMaxUm = r.witnessedUm;
    continue;
  }
  const c = cx.get(r.tri);
  if (c === undefined) fail(`no centroid for tri ${r.tri}`);
  if (r.witnessedUm > interiorMaxUm) interiorMaxUm = r.witnessedUm;
  raw.push({ x: c[0], y: c[1], z: c[2], d: r.witnessedUm / 1000 });
}
const expectRim = res.byOwner[RIM]?.count ?? 0;
if (nRim !== expectRim) fail(`rim-row exclusion counted ${nRim}, byOwner says ${expectRim}`);
if (raw.length === 0) fail('every residual row was rim-row — nothing to tighten');

// ───────────────────────────── cluster, then scale ─────────────────────────────

const { cells, clusterMm, coarsenings } = clusterExceedances(raw, CLUSTER_MM, MAXCLUSTERS);
const tolMm = res.tolUm / 1000;
const clusters: Phase2Cluster[] = [];
for (const [, c] of cells) {
  const th = ((Math.atan2(c.y, c.x) % TWO_PI) + TWO_PI) % TWO_PI;
  // MODE 'fixed' is the registered default and it is S24's: the ladder is 2 -> 4 -> 8 across OUTER
  // iterations via PF_P2_CARRY, never inside one file. MODE 'slope' prices the divisor from the measured
  // magnitude instead, and is offered because the H1 residual spans 10 -> 190 um where S24's H2 loci
  // spanned a far narrower band — but it is NOT the default, because a per-cluster divisor makes the first
  // iterate's cost a function of the tail rather than of the population, and INFEASIBLE-AT-CAP must be
  // able to fire on a number the operator can predict.
  const tolScale = MODE === 'slope'
    ? scaleFromSlope(c.d, tolMm, SLOPE, MAXSCALE)
    : Math.min(MAXSCALE, Math.max(1, FACTOR));
  clusters.push({
    th, z: c.z, r: Math.hypot(c.x, c.y), x: c.x, y: c.y,
    count: c.count, maxErrMm: c.d, tolScale,
  });
}
// DETERMINISM: `cells` is a Map whose insertion order is the raw sweep order, which is `residual.rows`
// order, which is the certificate's own. Sorting anyway removes the last dependence on Map iteration.
clusters.sort((a, b) => (a.z - b.z) || (a.th - b.th) || (a.x - b.x) || (a.y - b.y));

const rNom = Math.max(run.dims.Rb, run.dims.Rt);

const file: Phase2LociFile = {
  schema: PHASE2_LOCI_SCHEMA,
  run,
  audit: {
    // PROPERTY 2 — the substitution is declared here and in caveats[0].
    tool: 's28Field.ts (H1 mesh->surface residual from the Phase-D composed certificate; NOT an H2 audit)',
    stlPath: STL,
    nTri: res.nTri,
    tolMm,
    coveragePitchMm: 0,
    minPitchMm: 0,
    maxMm: res.cpu.maxWitnessedUm / 1000,
    maxTh: 0, maxZ: 0, maxR: 0, maxOnWall: false,
    queries: res.nTri,
    overCount: res.cpu.nOver,
    rawCount: res.cpu.nOver,
    rawCapped: false,
    capped: false,
    structPitchUniformMm: 0,
    secs: 0,
    meshAreaMm2,
    generatedAt: new Date().toISOString(),
  },
  tighten: { radiusMm: RADIUS_MM, clusterMm, mode: MODE, factor: FACTOR, slope: SLOPE, maxScale: MAXSCALE },
  clusters,
  predict: { meshAreaMm2, nTri: res.nTri, densityPerMm2: 0, unionAreaMm2: 0, weightedExcessAreaMm2: 0, extraTris: 0, predictedTris: res.nTri, caveats: [] },
  caveats: [
    'SOURCE SUBSTITUTION, DECLARED: the `audit` block is typed for an H2 surface->mesh audit. This file is '
    + 'built from an H1 MESH->SURFACE residual (the Phase-D composed certificate). `maxMm` is the H1 '
    + 'WITNESSED max, `queries` is the facet count, and the pitch/locus fields are ZERO because they have '
    + 'no H1 meaning. Nothing downstream may read them as H2 numbers.',
    `RIM ROW EXCLUDED: ${nRim} of ${res.rows.length} residual facets are rim-row (a vertex within 0.1 mm of `
    + `z=0 or z=H) and are NOT in this field. Rim-row worst ${rimMaxUm.toFixed(3)} um; interior worst `
    + `${interiorMaxUm.toFixed(3)} um. The standing open-boundary caveat forbids scoring the rim row as a `
    + 'wall defect, so tightening it would move the headline for a reason the diagnosis rejects.',
    'INTERIOR CERTIFIED BOUND UNKNOWN: residual.json serializes per-facet WITNESSED only, never the '
    + 'per-facet certified bound, so every magnitude here is a WITNESS. See S28-U0 in the worklog.',
    'CLUSTER MAGNITUDES ARE PER-FACET WITNESSES AT FACET CENTROIDS, not surface samples: an H1 witness is '
    + 'the far point of a facet from the surface, so the ball is centred on the facet, not on the surface.',
  ],
};
file.predict = predictTightenedCount(file, rNom, res.nTri, meshAreaMm2);

// ═════════════════════════════ THE SELF-CHECKS (registered in S28-C5) ═════════════════════════════
// Every one of these must print PASS. They are the ONLY thing standing between this file and a plausible,
// fully formatted, entirely meaningless field.

let failures = 0;
const check = (name: string, ok: boolean, detail: string): void => {
  if (!ok) failures += 1;
  log(`  [${ok ? 'PASS' : '*** FAIL ***'}] ${name} — ${detail}`);
};

log('\n===== S28 FIELD BUILDER =====');
log(`residual ${RESIDUAL}   run ${RUNJ}   stl ${STL}`);
log(`rows ${res.rows.length}  (cpu.nOver ${res.cpu.nOver}, uncertified ${res.cpu.nUncert}, `
  + `certified bound ${res.cpu.maxBoundUm.toFixed(3)} um, witnessed ${res.cpu.maxWitnessedUm.toFixed(3)} um)`);
log(`RIM-ROW EXCLUDED ${nRim} of ${res.rows.length}  ->  ${raw.length} facets enter the field`);
log(`owner census of the INPUT: ${Object.entries(res.byOwner).map(([k, v]) => `${k} ${v.count}`).join(', ')}`);
log(`clusters ${clusters.length}   clusterMm ${clusterMm} (coarsenings ${coarsenings})   radiusMm ${RADIUS_MM}`);
log(`mode ${MODE}  factor ${FACTOR}  slope ${SLOPE}  maxScale ${MAXSCALE}`);
log(`mesh area MEASURED from the STL: ${meshAreaMm2.toFixed(1)} mm^2   density ${file.predict.densityPerMm2.toFixed(2)} tri/mm^2`);
log(`footprint: union ${file.predict.unionAreaMm2.toFixed(1)} mm^2 = `
  + `${((100 * file.predict.unionAreaMm2) / meshAreaMm2).toFixed(3)}% of the surface   `
  + `weighted excess ${file.predict.weightedExcessAreaMm2.toFixed(1)} mm^2`);
log(`PREDICTED TRIANGLES ${Math.round(file.predict.predictedTris)} (extra ${Math.round(file.predict.extraTris)}) vs triCap ${TRICAP}`);

log('\n--- SELF-CHECKS ---');
check('S1 every tolScale >= 1 (the field may only TIGHTEN)',
  clusters.every((c) => c.tolScale >= 1),
  `min ${Math.min(...clusters.map((c) => c.tolScale))}, max ${Math.max(...clusters.map((c) => c.tolScale))}`);

check('S2 rim-row exclusion is complete and counted',
  nRim === expectRim && raw.length === res.rows.length - nRim,
  `${nRim} excluded (byOwner ${expectRim}), ${raw.length} kept of ${res.rows.length}`);

const prov = verifyLociProvenance(file, {
  style: run.style, params: run.params, dims: run.dims, tolMm: run.tolMm, stage: run.stage,
});
check('S3 provenance verifies against the consuming run', prov.length === 0,
  prov.length === 0 ? 'no mismatches' : prov.join(' | '));

check('S4 INFEASIBLE-AT-CAP does not fire', file.predict.predictedTris <= TRICAP,
  `${Math.round(file.predict.predictedTris)} vs ${TRICAP}`);

// ── S5, THE EXPECT-NONZERO PROBE. A gate that cannot fail is not a gate. ────────────────────────────────
// Two probe sets, and BOTH directions are asserted:
//   HIT  — one probe at each cluster centre with a zero-radius sphere. Every one MUST tighten. If any does
//          not, the field does not cover its own loci and the build is void.
//   MISS — probes displaced far outside the field's own bounding box in +z and -z. NONE may tighten. If any
//          does, `scaleForSphere` is returning a scale for a point nowhere near a locus, and every cost
//          prediction and every INFEASIBLE reading built on it is meaningless.
// `_phase2Field.test.ts` failed exactly this class twice on its first draft, on probe sets that missed
// every locus and passed vacuously. That is why MISS is asserted as an expectation and not merely reported.
const fld = buildTightenField(file);
let hitMiss = 0;
for (const c of clusters) if (!(fld.scaleForSphere(c.x, c.y, c.z, 0) > 1)) hitMiss += 1;
check('S5a HIT probe — every cluster centre is tightened by the field it generated',
  hitMiss === 0, `${clusters.length - hitMiss} of ${clusters.length} tightened, ${hitMiss} MISSED`);

let zLo = Infinity; let zHi = -Infinity; let rHi = 0;
for (const c of clusters) {
  if (c.z < zLo) zLo = c.z; if (c.z > zHi) zHi = c.z;
  const rr = Math.hypot(c.x, c.y); if (rr > rHi) rHi = rr;
}
const away = 10 * (RADIUS_MM + 1);
const missProbes: Array<[number, number, number]> = [];
for (let i = 0; i < 64; i += 1) {
  const a = (TWO_PI * i) / 64;
  missProbes.push([(rHi + away) * Math.cos(a), (rHi + away) * Math.sin(a), zLo - away]);
  missProbes.push([(rHi + away) * Math.cos(a), (rHi + away) * Math.sin(a), zHi + away]);
}
let falseHits = 0;
for (const [px, py, pz] of missProbes) if (fld.scaleForSphere(px, py, pz, 0) > 1) falseHits += 1;
check('S5b MISS probe (EXPECT-NONZERO discipline) — a probe set that misses every locus must NOT tighten',
  falseHits === 0, `${missProbes.length} probes ${away.toFixed(2)} mm outside the field, ${falseHits} tightened`);

log(`\nfield: ${fld.clusters} clusters, cellMm ${fld.cellMm}, maxScale ${fld.maxScale}, linear scans ${fld.linearScans()}`);

if (failures > 0) fail(`${failures} self-check(s) failed — the field is NOT written`);

if (DRYRUN) {
  log(`\nPF_S28_DRYRUN=1 — all checks passed, ${OUT} NOT written.`);
} else {
  writeJsonFile(OUT, file);
  log(`\nWROTE ${OUT}  (${clusters.length} clusters)`);
  log(`NEXT: sh research/bridge/out/s24_iter.sh <N> ${OUT}  — but read the S28 registration first: the`);
  log('mesher command must carry PF_CB_DESHARD_CASCADE=0, and the header diff must be taken.');
}
log('===== END S28 FIELD BUILDER =====\n');
