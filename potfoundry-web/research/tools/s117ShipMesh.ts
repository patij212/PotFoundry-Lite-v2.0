// s117ShipMesh.ts — S117 P0: DRIVE THE SHIPPING CONFORMING GENERATOR HEAD-LESS AND EMIT ITS STL.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The S116 roadmap's P0: *** NOBODY HAS EVER MEASURED A CelticTriquetra (or, as this tool establishes, a
// GothicArches) MESH BUILT BY THE SHIPPING PATH. *** Every "by construction" claim about production is a
// code trace. This tool builds that mesh.
//
// It reproduces `ParametricExportComputer.compute()`'s `if (flags.conformingMesher)` branch
// (src/renderers/webgpu/ParametricExportComputer.ts:2468, DEFAULT TRUE via contracts.ts
// DEFAULT_FEATURE_FLAGS) STAGE FOR STAGE, calling THE SAME src/ functions in THE SAME ORDER with THE SAME
// resolved constants. Nothing is re-implemented except the two stages that are WebGPU, and those use the
// existing, regression-tested CPU ports (see "THE TWO SUBSTITUTIONS" below).
//
// ── THE STAGES, AND WHERE EACH ONE COMES FROM ─────────────────────────────────────────────────────────
//   PEC:2138        profile resolve            getQualityProfile(DEFAULT_EXPORT_QUALITY_PROFILE='high')
//   PEC:2536-2537   dense wall samplers 256²   *** GPU evaluatePoints -> CPU SUBSTITUTION #1 ***
//   PEC:2645-2727   the q-lever ladder         resolveSurfaceErrorMm / resolveQuadtreeMaxLevel / profile
//   PEC:2739-2796   extractAnalyticFeatures    src/ CPU, called verbatim
//   PEC:2778-2796   chooseCreaseGrid/T/Helix   src/ CPU, called verbatim
//   PEC:2833-2839   buildCreaseRefineLines     src/ CPU, called verbatim
//   PEC:2860-2874   composedWallSampler (efg)  src/ CPU, called verbatim (efgOn default TRUE)
//   PEC:3082-3175   assemblyOpts               field for field, same values
//   PEC:3185        assembleWatertight         *** THE GENERATOR. src/ CPU, called verbatim ***
//   PEC:3221-3290   u / t / helix warps        src/ applyUWarp/applyTWarp/applyHelixWarp, same guards
//   PEC:3300        GPU vertex eval            *** GPU evaluatePoints -> CPU SUBSTITUTION #2 ***
//   PEC:3423        decimation                 NOT REACHED (asserted: triCount <= conformingBudget)
//   PEC:3502        summarizeConformingValidation — reporting only, not mesh-affecting; skipped
//
// ── THE TWO SUBSTITUTIONS (say them out loud; they are the ONLY departures) ───────────────────────────
// Production evaluates (u,t,surfaceId) -> 3D on the GPU (`this.evaluatePoints` -> adaptive_mesh.wgsl
// `evaluate_vertices`, f32 throughout). There is no WebGPU in node. Both call sites are replaced by the
// EXISTING, REGRESSION-TESTED CPU ports that every Tier-C research twin in this repo already uses:
//   #1 the dense 256² sampler grids  -> `buildRegionWallGridCPU` (research/bridge/tierc_regionLayer.ts,
//      itself the dims-generic form of `_analytic_floor_lib.ts`'s `buildWallGridCPU`, documented
//      "CPU-f64 -> f32 wall sampler grid, formula-exact to WGSL evaluate_vertices");
//   #2 the final per-vertex 3D eval  -> `evaluatePackedAssemblyToXyz` (same file), the CPU port of
//      adaptive_mesh.wgsl:762-877 extended to all six surfaceIds, with its own single-z-mapping
//      regression test (tierc_regionLayer.test.ts).
// Both evaluate the analytic radius via `buildAnalyticRadiusFn` (src/geometry/analyticRadius.ts) in f64
// and store f32. The WGSL computes the same formula in f32.
// *** CONSEQUENCE, STATED BEFORE ANY NUMBER: the PRECOND ruler (|r_mesh - rA|) is VACUOUS on the outer
// wall of this mesh — the vertices were placed BY rA, so PRECOND can only ever read the f32 storage
// floor. It is reported as a FLOOR, never as evidence that the GPU path is on-surface. Everything else
// (chord position, orientation, folds, blades, topology, counts) is a property of the TRIANGULATION,
// which is 100% the shipping src/ code and is NOT substituted. ***
//
// ── CONTROLS (any failure => the run is VOID and says so) ─────────────────────────────────────────────
//   C1  triCount <= conformingBudget         — else shipping would have decimated and this is not it
//   C2  boundary edges == 0                  — watertight-by-construction claim, measured not assumed
//   C3  exhaustive max |r - rA| on the outer wall <= f32 floor bar (the vacuity check itself)
//   C4  no non-finite vertex
//   C5  the resolved ladder equals the traced production constants (printed, and hard-asserted)
//
// Usage: bash research/tools/run-s117-ship.sh
//   env PF_S117_STYLE=CelticTriquetra|GothicArches  PF_S117_TAG=<tag>  PF_S117_OUTDIR=<dir>
//       PF_S117_H/RB/RT/EXPN  PF_S117_TWALL/TBOTTOM/RDRAIN  PF_S117_DENSERES
//       PF_S117_SMOKE=1  (tiny config: proves the chain end to end in seconds)

import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { buildStyleParamPayload } from '../../src/utils/styleParams';
import {
  assembleWatertight,
  extractAnalyticFeatures,
  buildCreaseRefineLines,
  chooseCreaseGrid,
  applyUWarp,
  chooseCreaseTGrid,
  applyTWarp,
  chooseHelixGrid,
  applyHelixWarp,
  composedWallSampler,
  type AssemblyWallOptions,
} from '../../src/renderers/webgpu/parametric/conforming';
import { resolveUniformLevelOverride } from '../../src/renderers/webgpu/parametric/conforming/uniformLevelOverride';
import {
  getQualityProfile,
  resolveSurfaceErrorMm,
  resolveQuadtreeMaxLevel,
  resolveTriangleBudget,
  DEFAULT_EXPORT_QUALITY_PROFILE,
} from '../../src/renderers/webgpu/parametric/QualityProfiles';
import { buildRegionWallGridCPU, evaluatePackedAssemblyToXyz } from '../bridge/tierc_regionLayer';
import type { StyleId, StyleOptions } from '../../src/geometry/types';
import { writeFileSync, mkdirSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const TAU = Math.PI * 2;

const STYLE = envS('PF_S117_STYLE', 'CelticTriquetra') as StyleId;
const TAG = envS('PF_S117_TAG', STYLE);
const OUTDIR = envS('PF_S117_OUTDIR', 'research/exchange/_strataConformBisect/s117');
const SMOKE = envS('PF_S117_SMOKE', '0') === '1';
// Campaign-pinned dims (H=120 Rb=40 Rt=50 expn=1) — the same AF_DIMS every Tier-C twin uses, and the
// dims S116 measured. tWall/tBottom/rDrain are src/geometry/types.ts DEFAULT_DIMENSIONS (3/3/10).
const H = envF('PF_S117_H', 120);
const RB = envF('PF_S117_RB', 40);
const RT = envF('PF_S117_RT', 50);
const EXPN = envF('PF_S117_EXPN', 1);
const T_WALL = envF('PF_S117_TWALL', 3);
const T_BOTTOM = envF('PF_S117_TBOTTOM', 3);
const R_DRAIN = envF('PF_S117_RDRAIN', 10);
const DENSE_RES = envI('PF_S117_DENSERES', SMOKE ? 64 : 256); // PEC:2504 DENSE_RES_U = DENSE_RES_T = 256

mkdirSync(OUTDIR, { recursive: true });
log('══════════════════════════════════════════════════════════════════════════════════════════');
log('  S117 P0 — SHIPPING-PATH CONFORMING MESH, DRIVEN HEAD-LESS');
log('══════════════════════════════════════════════════════════════════════════════════════════');
log(`style        ${STYLE}`);
log(`dims         H=${H} Rb=${RB} Rt=${RT} expn=${EXPN}  tWall=${T_WALL} tBottom=${T_BOTTOM} rDrain=${R_DRAIN}`);
log(`denseRes     ${DENSE_RES}${SMOKE ? '   *** SMOKE MODE — NOT A PRODUCTION MESH ***' : ''}`);
log(`outdir       ${OUTDIR}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — the q-lever ladder, resolved EXACTLY as PEC:2645-2727 does it
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const profile = getQualityProfile(DEFAULT_EXPORT_QUALITY_PROFILE); // 'high' (PEC:2136-2138)
const targetTris = resolveTriangleBudget(undefined, profile);      // PEC:2143 -> profile.maxTriangleBudget
const cadFidelity = profile.name === 'high' || profile.name === 'ultra'; // PEC:2634
const CAD_SAG_MM = 0.003;         // PEC:2635
const CAD_MAX_LEVEL = 16;         // PEC:2636
const CAD_NRING = 2048;           // PEC:2637
const CAD_BUDGET_TRIS = 16_000_000; // PEC:2639
const profileSag = resolveSurfaceErrorMm(profile, undefined);      // PEC:2657
const conformingBudget = SMOKE ? envI('PF_S117_SMOKE_BUDGET', 400_000) : (cadFidelity ? Math.max(targetTris, CAD_BUDGET_TRIS) : targetTris);
const qMaxSag = SMOKE ? 0.05 : (cadFidelity ? Math.min(profileSag, CAD_SAG_MM) : profileSag);
const qMinEdge = Math.min(0.2, Math.max(0.04, profileSag * 2));    // PEC:2660
const qMaxLevel = SMOKE ? 9 : (cadFidelity ? Math.max(resolveQuadtreeMaxLevel(profileSag), CAD_MAX_LEVEL) : resolveQuadtreeMaxLevel(profileSag));
const qMaxEdge = profile.maxEdgeMm;                                // PEC:2678
const qNRing = SMOKE ? 128 : (cadFidelity ? Math.max(profile.nRing, CAD_NRING) : profile.nRing);
const qCellSamples = 1;   // PEC:2699-2702 — DEFAULT IS 1 (CAD_CELL_SAMPLES=2 is deliberately unwired)
const qSizingRes = 128;   // PEC:2707-2710 default
const qUniformLevel = 0;  // PEC:2683 — dev lever unset in production

log('── RESOLVED PRODUCTION LADDER (PEC:2645-2727) ────────────────────────────────────────────');
log(`  profile              ${profile.name}   (DEFAULT_EXPORT_QUALITY_PROFILE)`);
log(`  profile.epsPosMm     ${profileSag}          -> profileSag`);
log(`  cadFidelity          ${cadFidelity}`);
log(`  qMaxSag              ${qMaxSag} mm         = ${cadFidelity ? 'min(profileSag, CAD_SAG_MM)' : 'profileSag'}`);
log(`  qMinEdge             ${qMinEdge} mm          = min(0.2, max(0.04, profileSag*2))`);
log(`  qMaxEdge             ${qMaxEdge} mm          = profile.maxEdgeMm`);
log(`  qMaxLevel            ${qMaxLevel}             = max(resolveQuadtreeMaxLevel(${profileSag}), ${CAD_MAX_LEVEL})`);
log(`  qNRing               ${qNRing}           = max(profile.nRing=${profile.nRing}, ${CAD_NRING})`);
log(`  qSizingRes           ${qSizingRes}            (resU=resT)`);
log(`  qCellSamples         ${qCellSamples}`);
log(`  gradeRatio           2             (PEC:3086 hardcoded)`);
log(`  targetTriangles      ${conformingBudget}      budgetMode='cap'`);
log(`  featureLevel         11            (PEC:3141 default)`);
log('');

// C5 — hard-assert the ladder against the traced production constants (SMOKE exempt).
const C5: string[] = [];
if (!SMOKE) {
  if (profile.name !== 'high') C5.push(`profile ${profile.name} != high`);
  if (qMaxSag !== 0.003) C5.push(`qMaxSag ${qMaxSag} != 0.003`);
  if (qMinEdge !== 0.1) C5.push(`qMinEdge ${qMinEdge} != 0.1`);
  if (qMaxEdge !== 1) C5.push(`qMaxEdge ${qMaxEdge} != 1`);
  if (qMaxLevel !== 16) C5.push(`qMaxLevel ${qMaxLevel} != 16`);
  if (qNRing !== 2048) C5.push(`qNRing ${qNRing} != 2048`);
  if (conformingBudget !== 16_000_000) C5.push(`budget ${conformingBudget} != 16000000`);
}
if (C5.length > 0) { log(`*** CONTROL C5 FIRED — LADDER DOES NOT MATCH THE TRACE: ${C5.join('; ')} ***`); process.exit(3); }
log('  C5 ladder-vs-trace ................ PASS');
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — dense wall samplers (SUBSTITUTION #1)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const styleOpts: StyleOptions = {}; // {} => STYLE_REGISTRY / DEFAULT_STYLE_PARAMS defaults
const rA = buildAnalyticRadiusFn(STYLE, styleOpts, { H, Rb: RB, Rt: RT, expn: EXPN });
const dimsSD = { H, Rb: RB, Rt: RT, expn: EXPN };
let t0 = Date.now();
const outerGrid = buildRegionWallGridCPU(rA, 0, dimsSD, T_WALL, T_BOTTOM, DENSE_RES);
const innerGrid = buildRegionWallGridCPU(rA, 1, dimsSD, T_WALL, T_BOTTOM, DENSE_RES);
const outerSampler = outerGrid.sampler;
const innerSampler = innerGrid.sampler;
log(`── STAGE 2: dense samplers ${DENSE_RES}x${DENSE_RES} (CPU port of the GPU grid) — ${Date.now() - t0} ms`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — analytic feature graph + crease/helix warp selection (PEC:2739-2796), verbatim src/
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
t0 = Date.now();
const [, packedWarpParams] = buildStyleParamPayload(STYLE, styleOpts as Record<string, unknown>);
let featureGraph: ReturnType<typeof extractAnalyticFeatures> | null = null;
let creaseChoice: ReturnType<typeof chooseCreaseGrid> = { warp: { isIdentity: true, anchors: [] }, grid: 0, level: 0 };
let creaseTChoice: ReturnType<typeof chooseCreaseTGrid> = { warp: { isIdentity: true, anchors: [] }, grid: 0, level: 0 };
let helixChoice: ReturnType<typeof chooseHelixGrid> = { warp: { isIdentity: true, base: { isIdentity: true, anchors: [] }, shearRate: 0, offset: 0 }, grid: 0, level: 0 };
try {
  featureGraph = extractAnalyticFeatures(
    STYLE,
    Float32Array.from(packedWarpParams),
    { H, Rt: RT, Rb: RB },
    { surfaceFidelityExact: false }, // DEFAULT_FEATURE_FLAGS.surfaceFidelityExact === false
  );
  const creaseUSet = new Set<number>(); const creaseU: number[] = [];
  const creaseTSet = new Set<number>(); const creaseT: number[] = [];
  const helixLines = featureGraph.lines.filter((l) => l.kind === 'helical-crease');
  for (const line of featureGraph.lines) {
    if (line.kind === 'vertical-crease') {
      const u = line.points[0].u; const key = Math.round(u * 1e7);
      if (creaseUSet.has(key)) continue; creaseUSet.add(key); creaseU.push(u);
    } else if (line.kind === 'horizontal-band') {
      const t = line.points[0].t; const key = Math.round(t * 1e7);
      if (creaseTSet.has(key)) continue; creaseTSet.add(key); creaseT.push(t);
    }
  }
  creaseChoice = chooseCreaseGrid(creaseU);
  creaseTChoice = chooseCreaseTGrid(creaseT);
  if (helixLines.length > 0) {
    const k = helixLines.length;
    const l0 = helixLines[0].points; const p0 = l0[0]; const p1 = l0[Math.min(1, l0.length - 1)];
    let du = (p1.u - p0.u) % 1; if (du > 0.5) du -= 1; if (du < -0.5) du += 1;
    const dt = p1.t - p0.t; const slope = dt > 1e-9 ? du / dt : 0;
    helixChoice = chooseHelixGrid(k, -slope * k, p0.u * k);
  }
  const kinds = new Map<string, number>();
  for (const l of featureGraph.lines) kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + 1);
  log(`── STAGE 3: extractAnalyticFeatures — ${featureGraph.lines.length} lines  {${[...kinds].map(([k, v]) => `${k}:${v}`).join(', ')}}  gt=${featureGraph.groundTruthCount}`);
  log(`   creaseU ${creaseU.length} -> grid ${creaseChoice.grid} level ${creaseChoice.level} identity=${creaseChoice.warp.isIdentity}`);
  log(`   creaseT ${creaseT.length} -> grid ${creaseTChoice.grid} level ${creaseTChoice.level} identity=${creaseTChoice.warp.isIdentity}`);
  log(`   helix   ${helixLines.length} -> grid ${helixChoice.grid} level ${helixChoice.level} identity=${helixChoice.warp.isIdentity}`);
} catch (err) {
  featureGraph = null;
  log(`   [CONFORMING-FULL] crease grid selection skipped: ${String(err)}`);
}
const generalCurves = (featureGraph?.lines ?? []).filter((l) => l.kind === 'general-curve');
const creaseLines = featureGraph
  ? buildCreaseRefineLines(featureGraph, { uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helixWarp: helixChoice.warp })
  : [];
log(`   generalCurves ${generalCurves.length}   creaseRefineLines ${creaseLines.length}   (${Date.now() - t0} ms)`);

// efg samplers — PEC:2857-2874, efgOn default TRUE
const outerEfgSampler = composedWallSampler(outerSampler, { uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp });
const innerEfgSampler = composedWallSampler(innerSampler, { uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp });

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — assembleWatertight: THE SHIPPING GENERATOR (PEC:3082-3185)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// NOTE: `uBias` is deliberately NOT set — production does not set it either, so assembleWatertight
// auto-computes it via computeUBias(outerSampler, hasFeatures). Setting it would be a divergence.
const assemblyOpts: AssemblyWallOptions = {
  maxSagMm: qMaxSag,
  maxEdgeMm: qMaxEdge,
  minEdgeMm: qMinEdge,
  gradeRatio: 2,
  maxLevel: qMaxLevel,
  resU: qSizingRes,
  resT: qSizingRes,
  cellSamples: qCellSamples,
  nRing: qNRing,
  targetTriangles: conformingBudget,
  budgetMode: 'cap' as const,
  minUniformLevel: resolveUniformLevelOverride(
    Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level),
    qUniformLevel,
  ),
  outerFeatureLines: generalCurves.length > 0 ? generalCurves : undefined,
  featureLevel: 11,
  outerCreaseLines: creaseLines.length > 0 ? creaseLines : undefined,
  outerEfgSampler,
  innerEfgSampler,
};
log('');
log(`── STAGE 4: assembleWatertight  minUniformLevel=${assemblyOpts.minUniformLevel} ...`);
t0 = Date.now();
const asm = assembleWatertight(outerSampler, innerSampler, { H, tBottom: T_BOTTOM, rDrain: R_DRAIN }, assemblyOpts);
const asmMs = Date.now() - t0;
const nV = asm.vertices.length / 3;
const nT = asm.indices.length / 3;
log(`   built  verts=${nV}  tris=${nT}   ${asmMs} ms`);
log(`   surfaceRanges: ${asm.surfaceRanges.map((r) => `${r.surfaceId}:[${r.indexStart},${r.indexEnd})`).join(' ')}`);
if (asm.budgetReport) {
  const o = asm.budgetReport.outer; const i = asm.budgetReport.inner;
  log(`   budget: perWall=${asm.budgetReport.perWallBudget} outer{scale=${o?.chosenScale} sat=${o?.capSaturated}} inner{scale=${i?.chosenScale} sat=${i?.capSaturated}}`);
}
if (asm.cdtStats) log(`   cdtStats: ${JSON.stringify(asm.cdtStats)}`);

// C1 — decimation must NOT be reachable, or this is not the shipping mesh.
if (nT > conformingBudget) {
  log(`*** CONTROL C1 FIRED: triCount ${nT} > budget ${conformingBudget} — shipping WOULD have run decimateConforming ***`);
  log('*** THIS MESH IS THEREFORE NOT THE SHIPPING OUTPUT. RUN IS VOID. ***');
  process.exit(4);
}
log(`   C1 decimation-not-reached ......... PASS (${nT} <= ${conformingBudget})`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5 — the three domain warps (PEC:3221-3290), same guards as shipping
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// outerPreConformed is FALSE in production (adoptTierCOuter requires __pfPerfectMesher, default OFF).
t0 = Date.now();
if (!creaseChoice.warp.isIdentity) {
  for (let i = 0; i < asm.vertices.length; i += 3) asm.vertices[i] = applyUWarp(creaseChoice.warp, asm.vertices[i]);
}
if (!creaseTChoice.warp.isIdentity) {
  for (let i = 0; i < asm.vertices.length; i += 3) {
    if (asm.vertices[i + 2] < 1.5) asm.vertices[i + 1] = applyTWarp(creaseTChoice.warp, asm.vertices[i + 1]);
  }
}
if (!helixChoice.warp.isIdentity && creaseChoice.warp.isIdentity) {
  for (let i = 0; i < asm.vertices.length; i += 3) {
    const s = asm.vertices[i + 2];
    const tEval = s < 1.5 ? asm.vertices[i + 1] : s < 2.5 ? 1 : 0;
    asm.vertices[i] = applyHelixWarp(helixChoice.warp, asm.vertices[i], tEval);
  }
}
log(`── STAGE 5: warps applied (u=${!creaseChoice.warp.isIdentity} t=${!creaseTChoice.warp.isIdentity} helix=${!helixChoice.warp.isIdentity && creaseChoice.warp.isIdentity})  ${Date.now() - t0} ms`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 6 — vertex evaluation to 3D (SUBSTITUTION #2)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
t0 = Date.now();
const packedUT = asm.vertices.slice(); // keep (u,t,surfaceId) for the outer-wall controls below
const xyz = evaluatePackedAssemblyToXyz(asm.vertices, rA, H, T_WALL, T_BOTTOM, R_DRAIN);
log(`── STAGE 6: CPU vertex eval -> 3D   ${Date.now() - t0} ms`);

// ── C4: finiteness ────────────────────────────────────────────────────────────────────────────────────
let nonFinite = 0;
for (let i = 0; i < xyz.length; i++) if (!Number.isFinite(xyz[i])) nonFinite += 1;
if (nonFinite > 0) { log(`*** CONTROL C4 FIRED: ${nonFinite} non-finite coordinates. RUN IS VOID. ***`); process.exit(5); }
log(`   C4 finiteness ..................... PASS`);

// ── C3: EXHAUSTIVE outer-wall |r - rA| (scar 5: no stride). VACUOUS BY CONSTRUCTION — a floor. ────────
let preMax = 0; let preN = 0;
for (let v = 0; v < nV; v++) {
  if (packedUT[v * 3 + 2] >= 0.5) continue;
  preN += 1;
  const x = xyz[v * 3]; const y = xyz[v * 3 + 1]; const z = xyz[v * 3 + 2];
  const r = Math.hypot(x, y);
  const th = Math.atan2(y, x);
  const d = Math.abs(r - rA(th < 0 ? th + TAU : th, z));
  if (d > preMax) preMax = d;
}
const PRE_BAR = 5e-3; // f32 storage on a ~50mm radius is ~4e-6 mm; atan2 round-trip near a cliff dominates
log(`   C3 PRECOND exhaustive (n=${preN} outer verts): MAX |r-rA| = ${(preMax * 1000).toFixed(4)} um  ${preMax <= PRE_BAR ? 'PASS' : '*** FAIL ***'}`);
log('      ^ VACUOUS: these vertices were PLACED by rA. This is the f32/atan2 floor, not surface evidence.');

// ── C2 runs AFTER the STL is on disk (see runC2 below) ───────────────────────────────────────────────
// *** ORDERING IS LOAD-BEARING: the first CT run spent 203 s in assembleWatertight and then DIED in the
// topology control before writing anything, losing the whole build. The artefact goes to disk first. ***
let bnd = 0; let nonMan = 0; let inconsistent = 0;
let c2Ms = 0;
// A Map/Set keyed by edge BLOWS THE V8 MAP CAP on a 13.6M-triangle mesh (measured: "RangeError: Map
// maximum size exceeded" at 40.9M edge inserts — the same cap class as the detectSelfIntersections
// Set-cap crash). Sort two Float64Array key arrays instead. The key lo*nV + hi is EXACT in f64 as long
// as nV^2 < 2^53 (nV <= 94M), guarded below.
const runC2 = (): void => {
  t0 = Date.now();
  if (nV * nV >= 9.007199254740992e15) { log(`*** C2 SKIPPED: nV=${nV} too large for the exact f64 edge key ***`); }
  else {
    const nE = nT * 3;
    const keyAll = new Float64Array(nE);
    const keyFwd = new Float64Array(nE); // one entry per edge use with p<q; padded with +Inf
    let nf = 0;
    for (let t = 0; t < nT; t++) {
      const a = asm.indices[t * 3]; const b = asm.indices[t * 3 + 1]; const c = asm.indices[t * 3 + 2];
      const p0 = [a, b, c]; const p1 = [b, c, a];
      for (let e = 0; e < 3; e++) {
        const p = p0[e]; const q = p1[e];
        const lo = p < q ? p : q; const hi = p < q ? q : p;
        const key = lo * nV + hi;
        keyAll[t * 3 + e] = key;
        if (p < q) { keyFwd[nf++] = key; }
      }
    }
    keyFwd.fill(Infinity, nf);
    keyAll.sort(); keyFwd.sort();
    // linear merge of the two run-length streams
    let i = 0; let j = 0;
    while (i < nE) {
      const k = keyAll[i]; let tot = 0;
      while (i < nE && keyAll[i] === k) { tot += 1; i += 1; }
      while (j < nf && keyFwd[j] < k) j += 1;
      let fwd = 0;
      while (j < nf && keyFwd[j] === k) { fwd += 1; j += 1; }
      if (tot === 1) bnd += 1;
      else if (tot > 2) nonMan += 1;
      else if (fwd !== 1) inconsistent += 1; // tot===2: consistent iff exactly one forward use
    }
  }
  c2Ms = Date.now() - t0;
  log(`   C2 topology: boundaryEdges=${bnd}  nonManifoldEdges=${nonMan}  inconsistentWindingEdges=${inconsistent}   (${c2Ms} ms)`);
  if (bnd !== 0) log('   *** CONTROL C2 FIRED: the assembly is NOT closed. Reported, not hidden. ***');
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 7 — write the STL (RAW generator winding; orientMeshForSTL deliberately NOT applied)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// src/geometry/stlExport.ts's generateBinarySTL() runs orientMeshForSTL() first — a global
// consistent-orientation + outward pass. It moves NO vertex and changes NO connectivity; it can only
// rewrite winding. Applying it here would MASK the generator's own winding consistency, which is exactly
// what P0.3's topology column asks about. So the STL below carries the generator's raw winding, and the
// inconsistent-winding count above is the generator's, not the exporter's.
const stlPath = `${OUTDIR}/S117_SHIP_${TAG}.stl`;
const outerStlPath = `${OUTDIR}/S117_SHIP_${TAG}_OUTER.stl`;
// Range [tLo,tHi) of TRIANGLE ids; header text; returns [facets, area].
const writeStlRange = (path: string, tLo: number, tHi: number, header: string): [number, number] => {
  const n = tHi - tLo;
  const buf = Buffer.alloc(84 + n * 50);
  buf.write(header, 0, 79, 'ascii');
  buf.writeUInt32LE(n, 80);
  let o = 84; let area = 0;
  for (let t = tLo; t < tHi; t++) {
    const a = asm.indices[t * 3] * 3; const b = asm.indices[t * 3 + 1] * 3; const c = asm.indices[t * 3 + 2] * 3;
    const ux = xyz[b] - xyz[a], uy = xyz[b + 1] - xyz[a + 1], uz = xyz[b + 2] - xyz[a + 2];
    const vx = xyz[c] - xyz[a], vy = xyz[c + 1] - xyz[a + 1], vz = xyz[c + 2] - xyz[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    area += l / 2;
    buf.writeFloatLE(l > 0 ? nx / l : 0, o); buf.writeFloatLE(l > 0 ? ny / l : 0, o + 4); buf.writeFloatLE(l > 0 ? nz / l : 0, o + 8); o += 12;
    for (const base of [a, b, c]) {
      buf.writeFloatLE(xyz[base], o); buf.writeFloatLE(xyz[base + 1], o + 4); buf.writeFloatLE(xyz[base + 2], o + 8); o += 12;
    }
    buf.writeUInt16LE(0, o); o += 2;
  }
  writeFileSync(path, buf);
  return [n, area];
};
log('');
const [fullN, fullArea] = writeStlRange(stlPath, 0, nT, `S117 SHIPPING-PATH ${STYLE} full solid, assembleWatertight raw winding`);
log(`── STAGE 7: FULL SOLID STL -> ${stlPath}`);
log(`   facets ${fullN}   total 3D area ${fullArea.toFixed(3)} mm2`);
// OUTER-WALL-ONLY submesh. *** THIS is the mesh comparable with every committed campaign STL: the
// research driver's "ring"-stage meshes are outer-wall-only (Gothic S39CTL 38,453.259 mm2, CT guard-ON
// 48,535.770 mm2 vs its analytic 48,348.368 mm2 — those are wall areas, not whole-solid areas). ***
// surfaceRanges[0] is authoritative for which triangles the assembly attributes to surfaceId 0.
const r0 = asm.surfaceRanges.find((r) => r.surfaceId === 0);
let outerN = 0; let outerArea = 0;
if (!r0) {
  log('*** no surfaceId-0 range in surfaceRanges — OUTER STL NOT WRITTEN ***');
} else {
  [outerN, outerArea] = writeStlRange(outerStlPath, r0.indexStart / 3, r0.indexEnd / 3, `S117 SHIPPING-PATH ${STYLE} OUTER WALL only, raw winding`);
  log(`   OUTER-WALL STL -> ${outerStlPath}`);
  log(`   facets ${outerN}   outer-wall 3D area ${outerArea.toFixed(3)} mm2`);
}
// ── C2 now that the artefacts are safely on disk ──────────────────────────────────────────────────────
runC2();
// Analytic outer-wall area by quadrature at TWO resolutions (h-refinement shown, never one number).
{
  const quad = (nu: number, nz: number): number => {
    // exact-triangle area of the analytically-lifted (u,t) grid; refines to the true area from BELOW.
    // Two-row cache: (nu+1)*(nz+1) rA evaluations, not 4 per quad.
    let A = 0;
    const row = (j: number): Float64Array => {
      const out = new Float64Array((nu + 1) * 3);
      const z = (j / nz) * H;
      for (let i = 0; i <= nu; i++) {
        const th = (i / nu) * TAU; const r = rA(th, z);
        out[i * 3] = r * Math.cos(th); out[i * 3 + 1] = r * Math.sin(th); out[i * 3 + 2] = z;
      }
      return out;
    };
    let lo = row(0);
    for (let j = 0; j < nz; j++) {
      const hi = row(j + 1);
      for (let i = 0; i < nu; i++) {
        const q = i * 3; const q1 = (i + 1) * 3;
        const p00 = [lo[q], lo[q + 1], lo[q + 2]], p10 = [lo[q1], lo[q1 + 1], lo[q1 + 2]];
        const p01 = [hi[q], hi[q + 1], hi[q + 2]], p11 = [hi[q1], hi[q1 + 1], hi[q1 + 2]];
        for (const [a, b, c] of [[p00, p10, p11], [p00, p11, p01]] as Array<[number[], number[], number[]]>) {
          const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
          const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
          A += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
        }
      }
      lo = hi;
    }
    return A;
  };
  const nA = SMOKE ? 512 : envI('PF_S117_QUADA', 4096); const nB = SMOKE ? 1024 : envI('PF_S117_QUADB', 8192);
  const a1 = quad(nA, nA / 2); const a2 = quad(nB, nB / 2);
  log(`   analytic outer-wall area: ${nA}x${nA / 2} -> ${a1.toFixed(3)} mm2 ; ${nB}x${nB / 2} -> ${a2.toFixed(3)} mm2  (converging from below, delta ${(a2 - a1).toFixed(3)})`);
  if (outerN > 0) log(`   MESH-vs-ANALYTIC outer-wall area excess: ${(outerArea - a2).toFixed(3)} mm2 = ${(((outerArea - a2) / a2) * 100).toFixed(4)}%   [analytic is a LOWER bound, so this excess is an UPPER bound]`);
}

// per-surface facet split (so the wall can be separated from the caps downstream)
{
  const surfOfV = new Uint8Array(nV);
  for (let v = 0; v < nV; v++) surfOfV[v] = Math.round(packedUT[v * 3 + 2]);
  const counts = new Map<number, number>();
  for (let t = 0; t < nT; t++) {
    const s = Math.min(surfOfV[asm.indices[t * 3]], surfOfV[asm.indices[t * 3 + 1]], surfOfV[asm.indices[t * 3 + 2]]);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  log(`   facets by min-surfaceId: ${[...counts].sort((p, q) => p[0] - q[0]).map(([s, n]) => `${s}:${n}`).join('  ')}`);
}

const manifest = {
  tool: 's117ShipMesh', style: STYLE, tag: TAG, smoke: SMOKE,
  dims: { H, Rb: RB, Rt: RT, expn: EXPN, tWall: T_WALL, tBottom: T_BOTTOM, rDrain: R_DRAIN },
  denseRes: DENSE_RES,
  ladder: { profile: profile.name, profileSag, qMaxSag, qMinEdge, qMaxEdge, qMaxLevel, qNRing, qSizingRes, qCellSamples, gradeRatio: 2, budget: conformingBudget, budgetMode: 'cap', featureLevel: 11, minUniformLevel: assemblyOpts.minUniformLevel },
  features: {
    lines: featureGraph?.lines.length ?? 0,
    generalCurves: generalCurves.length,
    creaseRefineLines: creaseLines.length,
    uWarpIdentity: creaseChoice.warp.isIdentity, tWarpIdentity: creaseTChoice.warp.isIdentity, helixIdentity: helixChoice.warp.isIdentity,
  },
  mesh: { vertices: nV, triangles: nT, assembleMs: asmMs },
  controls: { C1: nT <= conformingBudget, C2boundary: bnd, C2nonManifold: nonMan, C2inconsistent: inconsistent, C3preMaxUm: preMax * 1000, C4nonFinite: nonFinite, C5: true },
  stl: stlPath, outerStl: outerStlPath, outerFacets: outerN, outerAreaMm2: outerArea, fullAreaMm2: fullArea,
};
writeFileSync(`${OUTDIR}/S117_SHIP_${TAG}.manifest.json`, JSON.stringify(manifest, null, 2));
log(`   manifest -> ${OUTDIR}/S117_SHIP_${TAG}.manifest.json`);
log('');
log('DONE.');
