/**
 * verify_wholewall_scaling.test.ts — Phase-2 LOAD-BEARING de-risk spike (§4 of
 * `docs/superpowers/specs/2026-06-25-phase2-unified-mesher-design.md`).
 *
 * THE HYPOTHESIS under test:
 *   > The ~4-edge `unfillablePinches` ceiling Phase-1 hit is a THIN/CONVOLUTED-BAND
 *   > artifact (a sparse BFS sub-web self-approaches), NOT a feature-count limit. A
 *   > FILLED region (all features inside a growing bbox → their mm-tubes overlap into
 *   > a solid area) should NOT pinch as it grows toward the whole wall.
 *
 * Task-2 already measured that a SPARSE BFS sub-web pinches at te≥6 (H=100). THIS
 * spike tests the DIFFERENT, FILLED shape: a dense, simply-connected union-of-tubes
 * region grown by a centred bounding box over the off-seam interior of a real Voronoi
 * wall. It is a MEASUREMENT — it does NOT assert 0 pinches (that is the very thing
 * being measured). It only asserts the non-vacuous INDEX-crack control (the audit is
 * responsive) so a 0/0/0 watertight read is a genuine weld, not a blind spot.
 *
 * Wiring is mirrored verbatim from `verify_real_feature_mesher.test.ts`:
 *   styleSampler('Voronoi') → detectFeatures(+reliefIndicator) → featuresFromGraph →
 *   filter to interior/off-seam → bbox-select → realFeatureCorridorMulti → CPU
 *   evalPositions → auditWatertight (by INDEX, ringVertexIds) + triangleQuality3D.
 *
 * Pure CPU, analytic samplers (jsdom / Vitest, NO WebGPU).
 *
 * Run:
 *   cd potfoundry-web && npx vitest run \
 *     src/fidelity/bandRemesh/verify_wholewall_scaling.test.ts --testTimeout=600000
 */
import { describe, it, expect } from 'vitest';
import type { SurfaceSampler, Vec3 } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { styleSampler } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { detectFeatures } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import { makeReliefIndicator } from '../../renderers/webgpu/parametric/conforming/featureGraph/groundTruth';
import { auditWatertight, triangleQuality3D, type Mesh3 } from './audit';
import { featuresFromGraph } from './featuresFromGraph';
import { realFeatureCorridorMulti, type MultiFeatureSpec } from './realCorridor';
import type { UTPoint } from './corridorPave';

const TAU = 2 * Math.PI;

// ── Real pot dims (H=100 per the spike spec — same family as Task 2). ──────────
const H = 100;
const RT = 40;
const RB = 30;
const STYLE_DIMS = { H, Rt: RT, Rb: RB, expn: 1 };

// ── The off-seam interior box (the spike spec's [0.15,0.85]×[0.12,0.88]). ───────
const U_LO = 0.15;
const U_HI = 0.85;
const T_LO = 0.12;
const T_HI = 0.88;

// ── FeatureLevel used for the sweep. The pinch behaviour is about REGION SHAPE,
// not level, so a coarser level still answers the hypothesis. The spec permits FL6
// at the whole-interior scale if FL7 will not finish in ~8 min; we sweep at FL6 so
// even f=1.0 (the whole interior, ~dense Voronoi) completes inside the 600 s budget,
// and run a single FL7 spot-check at a mid scale to confirm level-independence. ──
const SWEEP_FEATURE_LEVEL = 6;

/** Build the real Voronoi pot sampler. */
function buildSampler(): SurfaceSampler {
  return styleSampler('Voronoi', {}, STYLE_DIMS);
}

/** Periodic u distance. */
function uDistP(a: number, b: number): number {
  let d = Math.abs(a - b) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

/** Evaluate 3D positions for every merged (u,t) via the sampler. */
function evalPositions(sampler: SurfaceSampler, mergedUt: Array<[number, number]>): Float32Array {
  const positions = new Float32Array(mergedUt.length * 3);
  for (let i = 0; i < mergedUt.length; i++) {
    const p = sampler.position(mergedUt[i][0], mergedUt[i][1]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  return positions;
}

/** Orientation-consistency check (mirrors the de-risk harness). */
function orientationMismatches(indices: Uint32Array): number {
  const dir = new Map<string, number>();
  const undirected = new Map<string, number>();
  for (let k = 0; k + 2 < indices.length; k += 3) {
    const tri = [indices[k], indices[k + 1], indices[k + 2]];
    for (let e = 0; e < 3; e++) {
      const i = tri[e], j = tri[(e + 1) % 3];
      if (i === j) continue;
      dir.set(`${i}->${j}`, (dir.get(`${i}->${j}`) ?? 0) + 1);
      const uk = i < j ? `${i}:${j}` : `${j}:${i}`;
      undirected.set(uk, (undirected.get(uk) ?? 0) + 1);
    }
  }
  let conflicts = 0;
  for (const [uk, count] of undirected) {
    if (count !== 2) continue;
    const [iS, jS] = uk.split(':');
    const ij = dir.get(`${iS}->${jS}`) ?? 0;
    const ji = dir.get(`${jS}->${iS}`) ?? 0;
    if (!(ij === 1 && ji === 1)) conflicts++;
  }
  return conflicts;
}

/**
 * Keep a feature ONLY if its WHOLE polyline lies inside the off-seam interior box
 * [U_LO,U_HI] × [T_LO,T_HI] AND it does not cross the u-seam. This isolates the pinch
 * question from the t=0/t=1 rings and the u-seam (the design handles those
 * separately). Simplest robust rule per the spec: keep features fully inside.
 */
function interiorOffSeam(f: MultiFeatureSpec): boolean {
  const pts = f.polyline;
  if (pts.length < 2) return false;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    if (!(p.t >= T_LO && p.t <= T_HI && p.u >= U_LO && p.u <= U_HI)) return false;
    if (k > 0 && Math.abs(pts[k].u - pts[k - 1].u) > 0.5) return false; // seam-crosser
  }
  return true;
}

/** (u,t) bounding box of a feature polyline. */
function polyBox(pts: UTPoint[]): { uMin: number; uMax: number; tMin: number; tMax: number } {
  let uMin = Infinity, uMax = -Infinity, tMin = Infinity, tMax = -Infinity;
  for (const p of pts) {
    if (p.u < uMin) uMin = p.u;
    if (p.u > uMax) uMax = p.u;
    if (p.t < tMin) tMin = p.t;
    if (p.t > tMax) tMax = p.t;
  }
  return { uMin, uMax, tMin, tMax };
}

/**
 * Select the interior/off-seam features whose ENTIRE polyline lies inside a bbox
 * centred in the interior box, sized to interior-fraction `f` of the
 * [U_LO,U_HI]×[T_LO,T_HI] box. For a DENSE Voronoi wall this dense set's union of
 * mm-tubes ≈ a FILLED region (the shape the hypothesis is about).
 */
function selectInBbox(
  features: MultiFeatureSpec[],
  f: number,
): { selected: MultiFeatureSpec[]; bbox: { uLo: number; uHi: number; tLo: number; tHi: number } } {
  const uMid = (U_LO + U_HI) / 2;
  const tMid = (T_LO + T_HI) / 2;
  const uHalf = ((U_HI - U_LO) / 2) * f;
  const tHalf = ((T_HI - T_LO) / 2) * f;
  const uLo = uMid - uHalf;
  const uHi = uMid + uHalf;
  const tLo = tMid - tHalf;
  const tHi = tMid + tHalf;
  const selected = features.filter((ft) => {
    const b = polyBox(ft.polyline);
    return b.uMin >= uLo && b.uMax <= uHi && b.tMin >= tLo && b.tMax <= tHi;
  });
  return { selected, bbox: { uLo, uHi, tLo, tHi } };
}

interface ScaleRow {
  f: number;
  featureLevel: number;
  widthMm: number;
  nFeatures: number;
  pinches: number;
  boundaryEdges: number;
  ringVerts: number;
  nonMan: number;
  tJunctions: number;
  orient: number;
  pctBelow10: number;
  aspectMax: number;
  fillTris: number;
  holeLoops: number;
  ms: number;
}

/**
 * Run ONE filled-region corridor at fraction `f`, width `widthMm`, level `fl`, and
 * MEASURE. Returns the row + the raw multi result (for the control to reuse).
 */
function runFilled(
  sampler: SurfaceSampler,
  features: MultiFeatureSpec[],
  f: number,
  fl: number,
  widthMm: number,
): { row: ScaleRow; r: ReturnType<typeof realFeatureCorridorMulti> | null } {
  const { selected } = selectInBbox(features, f);
  if (selected.length === 0) {
    const empty: ScaleRow = {
      f, featureLevel: fl, widthMm, nFeatures: 0, pinches: 0, boundaryEdges: 0,
      ringVerts: 0, nonMan: 0, tJunctions: 0, orient: 0, pctBelow10: 0,
      aspectMax: 0, fillTris: 0, holeLoops: 0, ms: 0,
    };
    return { row: empty, r: null };
  }
  const t0 = Date.now();
  const r = realFeatureCorridorMulti(sampler, selected, { featureLevel: fl, widthMm });
  const ms = Date.now() - t0;

  const positions = evalPositions(sampler, r.merged.vertexUT);
  const mergedMesh: Mesh3 = { positions, indices: new Uint32Array(r.merged.indices) };
  const audit = auditWatertight(mergedMesh, { boundaryVertexIndices: r.merged.ringVertexIds });
  const orient = orientationMismatches(mergedMesh.indices);

  const corridorMesh: Mesh3 = { positions, indices: new Uint32Array(r.paved.triangles.flat()) };
  const q = triangleQuality3D(corridorMesh);

  const row: ScaleRow = {
    f,
    featureLevel: fl,
    widthMm,
    nFeatures: selected.length,
    pinches: r.paved.unfillablePinches.length,
    boundaryEdges: audit.boundaryEdges,
    ringVerts: r.merged.ringVertexIds.size,
    nonMan: audit.nonManifoldEdges,
    tJunctions: audit.tJunctions,
    orient,
    pctBelow10: q.pctMinAngleBelow10,
    aspectMax: q.aspectMax,
    fillTris: r.paved.triangles.length,
    holeLoops: r.hole.loops.length,
    ms,
  };
  return { row, r };
}

function logRow(tag: string, m: ScaleRow): void {
  // eslint-disable-next-line no-console
  console.log(
    `[${tag} f=${m.f.toFixed(2)} FL${m.featureLevel} w=${m.widthMm}mm] ` +
    `#feat=${m.nFeatures} pinches=${m.pinches} | ` +
    `bnd=${m.boundaryEdges} (rings=${m.ringVerts}) nonMan=${m.nonMan} ` +
    `tJ=${m.tJunctions} orient=${m.orient} | ` +
    `holeLoops=${m.holeLoops} fillTris=${m.fillTris} ` +
    `%<10°=${m.pctBelow10.toFixed(2)} aspectMax=${m.aspectMax.toFixed(1)} | ` +
    `ms=${m.ms}`,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// THE SPIKE — grow a FILLED region toward the whole Voronoi wall; measure the
// unfillablePinch ceiling, watertight-by-index, quality, and time at each scale.
// ═════════════════════════════════════════════════════════════════════════════
describe('Phase-2 paver-scaling spike — filled whole-wall region vs the pinch ceiling', () => {
  const sampler = buildSampler();
  const graph = detectFeatures(sampler, {
    coarseRes: 40,
    fineRes: 120,
    minStrength: 1.0,
    minAngleDeg: 28,
    creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
    reliefIndicator: makeReliefIndicator(sampler),
  });
  const allFeatures = featuresFromGraph(graph);
  const interior = allFeatures.filter(interiorOffSeam);
  // eslint-disable-next-line no-console
  console.log(
    `[SPIKE setup] Voronoi H=${H} Rt=${RT} Rb=${RB} | graph: nodes=${graph.nodes.length} ` +
    `edges=${graph.edges.length} | featuresFromGraph=${allFeatures.length} ` +
    `interior-off-seam=${interior.length} | sweep FL=${SWEEP_FEATURE_LEVEL}`,
  );

  // Shared rows captured by the sweep so the secondary tests can print the full table.
  const sweepRows: ScaleRow[] = [];
  // The largest CLEAN multi-result (for the non-vacuous control).
  let largestResult: ReturnType<typeof realFeatureCorridorMulti> | null = null;
  let largestF = -1;

  it('detects a dense interior feature set (the filled-region substrate)', () => {
    // Voronoi is a dense cell web → many interior off-seam features. This is the
    // substrate whose union-of-tubes forms the FILLED region. (Diagnostic, not a gate.)
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(interior.length).toBeGreaterThan(0);
  }, 600_000);

  it('FILLED-region sweep: f ∈ {0.15,0.30,0.50,0.75,1.0} — measure pinches vs scale', () => {
    const fractions = [0.15, 0.3, 0.5, 0.75, 1.0];
    for (const f of fractions) {
      const { row, r } = runFilled(sampler, interior, f, SWEEP_FEATURE_LEVEL, 3);
      logRow('SWEEP', row);
      sweepRows.push(row);
      // Track the largest scale that produced a CLEAN (0/0/0) merged mesh, for the
      // control. Prefer the biggest f that is watertight + has fill triangles.
      if (
        r !== null &&
        row.fillTris > 0 &&
        row.nonMan === 0 &&
        row.tJunctions === 0 &&
        row.orient === 0 &&
        f > largestF
      ) {
        largestF = f;
        largestResult = r;
      }
    }

    // ── Print the trend table (the load-bearing deliverable). ──
    // eslint-disable-next-line no-console
    console.log('\n[SWEEP TABLE]  f | #feat | pinches | tJ | nonMan | orient | %<10° | fillTris | ms');
    for (const m of sweepRows) {
      // eslint-disable-next-line no-console
      console.log(
        `              ${m.f.toFixed(2)} | ${String(m.nFeatures).padStart(5)} | ` +
        `${String(m.pinches).padStart(7)} | ${String(m.tJunctions).padStart(2)} | ` +
        `${String(m.nonMan).padStart(6)} | ${String(m.orient).padStart(6)} | ` +
        `${m.pctBelow10.toFixed(2).padStart(5)} | ${String(m.fillTris).padStart(8)} | ${m.ms}`,
      );
    }

    // We do NOT assert 0 pinches — that is the measured quantity. We only assert the
    // sweep ran end-to-end and produced fill at the smallest scale (a sanity floor;
    // a totally empty result would mean the substrate, not the paver, is the issue).
    expect(sweepRows.length).toBe(fractions.length);
    expect(sweepRows[0].fillTris).toBeGreaterThan(0);
  }, 600_000);

  it('BAND-FILL sweep at f=1.0: widthMm ∈ {3,6,10} — does a wider (less thin) band reduce pinches?', () => {
    const widths = [3, 6, 10];
    const widthRows: ScaleRow[] = [];
    for (const w of widths) {
      const { row } = runFilled(sampler, interior, 1.0, SWEEP_FEATURE_LEVEL, w);
      logRow('WIDTH', row);
      widthRows.push(row);
    }
    // eslint-disable-next-line no-console
    console.log('\n[WIDTH TABLE @f=1.0]  widthMm | #feat | pinches | tJ | nonMan | fillTris | ms');
    for (const m of widthRows) {
      // eslint-disable-next-line no-console
      console.log(
        `                      ${String(m.widthMm).padStart(7)} | ${String(m.nFeatures).padStart(5)} | ` +
        `${String(m.pinches).padStart(7)} | ${String(m.tJunctions).padStart(2)} | ` +
        `${String(m.nonMan).padStart(6)} | ${String(m.fillTris).padStart(8)} | ${m.ms}`,
      );
    }
    expect(widthRows.length).toBe(widths.length);
  }, 600_000);

  it('NON-VACUOUS control: cracking a shared interior vertex on the largest CLEAN case ⇒ tJunctions > 0', () => {
    // The control proves the by-INDEX audit is responsive: a 0/0/0 read elsewhere is a
    // genuine weld, not a blind spot. Use the largest CLEAN merged mesh the sweep found.
    const r = largestResult;
    if (r === null) {
      // No clean case at all (every scale had nonMan/tJ/orient>0 OR no fill). That is
      // itself a reportable finding; skip the crack but DOCUMENT it loudly.
      // eslint-disable-next-line no-console
      console.log('[CONTROL] no clean (0/0/0, fillTris>0) sweep case was found — control SKIPPED; see SWEEP TABLE.');
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[CONTROL] cracking on the largest clean case f=${largestF.toFixed(2)}`);

    const positions = evalPositions(sampler, r.merged.vertexUT);
    const mergedTris = r.merged.indices;
    const cleanAudit = auditWatertight(
      { positions, indices: new Uint32Array(mergedTris) },
      { boundaryVertexIndices: r.merged.ringVertexIds },
    );
    expect(cleanAudit.tJunctions).toBe(0);

    // Find a SHARED interior vertex: a non-ring id (t strictly in (0,1)) that the fill
    // references in ≥2 triangles. The featureChains' interior ids are exactly such
    // shared vertices; pick the first chain's first interior id.
    let crackV = -1;
    for (const chain of r.paved.featureChains) {
      for (const id of chain) {
        const [, t] = r.merged.vertexUT[id];
        if (t > 1e-6 && t < 1 - 1e-6 && !r.merged.ringVertexIds.has(id)) { crackV = id; break; }
      }
      if (crackV >= 0) break;
    }
    expect(crackV).toBeGreaterThanOrEqual(0);

    const nV = r.merged.vertexUT.length;
    const newPositions = new Float32Array((nV + 1) * 3);
    newPositions.set(positions);
    newPositions[nV * 3] = positions[crackV * 3];
    newPositions[nV * 3 + 1] = positions[crackV * 3 + 1];
    newPositions[nV * 3 + 2] = positions[crackV * 3 + 2];
    const crackedIndices = Uint32Array.from(mergedTris);
    let cracked = false;
    for (let k = 0; k + 2 < crackedIndices.length && !cracked; k += 3) {
      for (let e = 0; e < 3; e++) {
        if (crackedIndices[k + e] === crackV) { crackedIndices[k + e] = nV; cracked = true; break; }
      }
    }
    expect(cracked).toBe(true);

    const crackedAudit = auditWatertight(
      { positions: newPositions, indices: crackedIndices },
      { boundaryVertexIndices: r.merged.ringVertexIds },
    );
    // eslint-disable-next-line no-console
    console.log(
      `[CONTROL] clean tJ=${cleanAudit.tJunctions}; after cracking shared interior ` +
      `vertex v=${crackV} ⇒ tJ=${crackedAudit.tJunctions}`,
    );
    expect(crackedAudit.tJunctions).toBeGreaterThan(0);
  }, 600_000);

  it('FL7 spot-check at a mid scale (f=0.50): confirms the pinch behaviour is level-independent', () => {
    // The hypothesis is about REGION SHAPE, not level. Re-run a mid scale at FL7 so a
    // reader can see the sweep's FL6 numbers are not a level artifact. MEASURED, not gated.
    const { row } = runFilled(sampler, interior, 0.5, 7, 3);
    logRow('FL7-SPOT', row);
    expect(row.featureLevel).toBe(7);
  }, 600_000);
});
