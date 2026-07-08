// _pf_dssteptwin.test.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-08-DS-STEPTWIN-CLOSE. FOLLOW-UP to E-2026-07-08-DRAGONSCALES-ZDENSITY (verdict MIXED). The prior arm
// found the V10b radial twin reads 263,536 DragonScales outliers but is a SINGLE-VALUED r(theta,z) that CANNOT
// represent the designed tread riser (a range of radii at one z) — so tread facets read (rOut-rIn)/2 away by
// construction; a STEP twin (buildStepReference, doubled ring radii) drops lip outliers 78%->0.66% on a 40k slice.
//
// This experiment METROLOGIST-GRADES the step twin BEFORE trusting it, then re-scores the whole DragonScales mesh
// under the VALIDATED instrument, then closes the residual with density.
//
// CRUX (found analytically pre-registration): DragonScales is NOT the ArtDeco explicit-step style. Its "riser" is a
// GENUINE C0 discontinuity from the STAGGER PARITY FLIP — at each integer rowPhase (t=k/scaleRows), Math.floor(row)
// increments, flipping the brick-stagger offset (0.5*TAU/scalesPerRow) ⇒ scaleTheta jumps ⇒ a real ~0.9-1.2mm
// radius jump at z=k/8*H. So the tread IS a real, designed near-vertical feature (matches [[feedback_export_standard]]:
// designed cliffs are real 3D features that must be meshed with feature edges embedded — the doubled-rings mesh does
// exactly this). The step twin must represent it faithfully AND must not extend past the designed wall.
//
// RESILIENCE: env-gated `it`; ndjson CHECKPOINT one row per unit the INSTANT computed; a key that already exists is
// SKIPPED ⇒ a killed run resumes on unfinished units. Edits NOTHING in src/.
//
//   PF_DS_STEP=1     — Task 1 (step-twin validation 1a-1d) + Task 2 (whole-mesh re-score) + Task 3 (density close).
//   PF_DS_CLOSE=1    — the closing units run at stride=1 (every facet). Default stride from PF_DS_STRIDE (screen).
//
// KILL CRITERIA (pre-registered):
//  - Task 1 (instrument): if the step twin FAILS 1a (riser faces off the analytic jump geometry, >0.01mm) OR 1b
//    (disagrees with radial twin on a SMOOTH control region) OR 1c (residual does NOT shrink with twin density) OR
//    1d (step-twin faces extend BEYOND the designed wall ⇒ it could UNDERSTATE a genuine gap) ⇒ STOP; report the
//    instrument defect and score DragonScales under whichever reference survives.
//  - Task 3 (close): CLOSE iff whole-mesh outliers==0 under the validated step twin AND rawNonMan==0 (non-vacuous)
//    AND zeroArea==0 AND %<20<10 AND tris<6M. If the sheet tail is density-INVARIANT past nZband 110, STOP the
//    density lever and characterize the floor population.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, triangleQualityDistribution } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';
import { buildRadialTwin } from './_pf_bvhRuler';
import { buildStepReference, buildRefLocator, type RefLocator, type RefMesh } from './_sharp3dRef';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TOL = 0.01;
const OUT = join('research', 'exchange', '_ds_steptwin');
const NDJSON = join(OUT, 'scorecard.ndjson');
// V10b DragonScales radial twin (2048 x 3072).
const RAD_TWIN = { nTheta: 2048, nZ: 3072 };
const CIRC = 2 * Math.PI * ((DIMS.Rb + DIMS.Rt) / 2);
const RAD_CELL = Math.max(0.35, 4 * (CIRC / RAD_TWIN.nTheta));
// Step twin: dense theta + fine per-band z; cell sized so ~a handful of tread tris per query cell.
const STEP_TWIN = { nTheta: 3840, nZperBand: 48, zEps: 5e-4 };
const STEP_CELL = 1.2;

const SHARD = ((): { k: number; n: number } | null => { const s = process.env.PF_DS_SHARD; if (!s) return null; const mm = /^(\d+)\/(\d+)$/.exec(s); return mm ? { k: +mm[1], n: +mm[2] } : null; })();

const plog = (m: string): void => { mkdirSync(OUT, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(join(OUT, 'run.log'), l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const keyExists = (k: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === k; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(OUT, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key}] ${JSON.stringify(row)}`); };

// ── watertight (RAW index) + zero-area, both non-vacuous. ─────────────────────
function auditNonManRaw(idx: Uint32Array): { nonMan: number; edges: number; boundary: number } {
  const ec = new Map<string, number>(); let edges = 0;
  for (let k = 0; k < idx.length; k += 3) { const a = idx[k], b = idx[k + 1], c = idx[k + 2]; if (a === b || b === c || a === c) continue; for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const key = p < q ? `${p}_${q}` : `${q}_${p}`; ec.set(key, (ec.get(key) ?? 0) + 1); edges++; } }
  let nm = 0, bd = 0; for (const v of ec.values()) { if (v > 2) nm++; if (v === 1) bd++; } return { nonMan: nm, edges, boundary: bd };
}
function zeroAreaCount(xyz: Float64Array | Float32Array, idx: Uint32Array): number {
  let n = 0;
  for (let f = 0; f < idx.length / 3; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const abx = xyz[3 * b] - xyz[3 * a], aby = xyz[3 * b + 1] - xyz[3 * a + 1], abz = xyz[3 * b + 2] - xyz[3 * a + 2];
    const acx = xyz[3 * c] - xyz[3 * a], acy = xyz[3 * c + 1] - xyz[3 * a + 1], acz = xyz[3 * c + 2] - xyz[3 * a + 2];
    const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx;
    if (0.5 * Math.hypot(cx, cy, cz) < 1e-9) n++;
  }
  return n;
}

// ── the doubled-rings DragonScales recipe (verbatim from _pf_dszdensity). ─────
function dragonRings(): StepRing[] { const r: StepRing[] = []; for (let k = 1; k < 8; k++) { const t = k / 8; r.push({ z: t * H, t, up: false }); } return r; }
function buildRows(rA: (t: number, z: number) => number, rings: StepRing[], nTh: number, nZband: number, treadCap: number): RowSpec[] {
  const zEps = 5e-4; const rows: RowSpec[] = []; const sorted = [...rings].sort((a, b) => a.z - b.z); const th = (): Float64Array => evenThetas(nTh);
  rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' }); let cursor = 0;
  const nearRing = (z: number): boolean => sorted.some(rg => Math.abs(z - rg.z) < 0.6 + 1e-6);
  const pushSheetBand = (z0: number, z1: number, n: number): void => { for (let i = 1; i < n; i++) { const z = z0 + (z1 - z0) * (i / n); if (nearRing(z)) continue; rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); } };
  for (const ring of sorted) {
    pushSheetBand(cursor, ring.z, nZband);
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    const rIn = rA(0, rzIn), rOut = rA(0, rzOut); const span = Math.abs(rOut - rIn); const rMean = 0.5 * (rIn + rOut); const arc = (TAU * rMean) / nTh;
    const treadSub = Math.max(2, Math.min(treadCap, Math.round(span / Math.max(arc, 1e-4)) + 1));
    rows.push({ z: ring.z, rz: rzIn, thetas: th(), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: ring.z, rz: rzOut, thetas: th(), kind: 'ringAbove' });
    cursor = ring.z;
  }
  pushSheetBand(cursor, H, nZband); rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' });
  return rows;
}
function toF32(mesh: BuiltMesh): { xyz: Float32Array; idx: Uint32Array } { return { xyz: Float32Array.from(mesh.xyz), idx: mesh.idx }; }
function facetClassifier(mesh: BuiltMesh): (f: number) => 'sheet' | 'lip' {
  const rows = mesh.rows; const rowStart = mesh.rowStart;
  const rowOf = new Int32Array(mesh.nV);
  for (let r = 0; r < rows.length; r++) for (let v = rowStart[r]; v < rowStart[r + 1]; v++) rowOf[v] = r;
  const isLipRow = (r: number): boolean => { const k = rows[r].kind; return k === 'ringBelow' || k === 'ringAbove' || k === 'tread'; };
  return (f: number): 'sheet' | 'lip' => {
    const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
    return (isLipRow(rowOf[a]) || isLipRow(rowOf[b]) || isLipRow(rowOf[c])) ? 'lip' : 'sheet';
  };
}

function denseBary(n = 8): Array<[number, number, number]> { const B: Array<[number, number, number]> = []; for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) B.push([i / n, j / n, (n - i - j) / n]); return B; }
const DENSE = denseBary(8);

// ── whole-mesh scorer under a SUPPLIED locator (validated step twin OR radial twin). Radial prefilter is NOT
//    sound against the step twin (the step twin has a wall at the ring z the radial bound doesn't know about), so
//    on the step twin we DENSE-score every facet directly. On the radial twin we keep the V10b radial prefilter. ─
function scoreMesh(
  key: string, arm: string, twin: 'step' | 'radial', nZband: number, tris: number,
  xyz: Float32Array, idx: Uint32Array, loc: RefLocator, rA: (t: number, z: number) => number,
  rowKindOf: ((f: number) => 'sheet' | 'lip') | null, stride: number,
): void {
  const t0 = Date.now();
  const nF = idx.length / 3;
  const advMargin = 0.7 * TOL;
  const radialBound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > H) return Infinity; let th = Math.atan2(py, px); if (th < 0) th += TAU; return Math.abs(Math.hypot(px, py) - rA(th, pz)); };
  const devS: number[] = []; let worst = 0, worstFacet = -1, scanned = 0;
  let outSheet = 0, outLip = 0;
  const shardK = SHARD?.k ?? 0, shardN = SHARD?.n ?? 1;
  const progEvery = Math.max(1, Math.floor((nF / (stride * shardN)) / 20));
  const usePrefilter = twin === 'radial';
  for (let f = shardK * stride; f < nF; f += stride * shardN) {
    scanned++;
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let dv: number;
    if (usePrefilter) {
      let bMax = 0;
      for (const [wa, wb, wc] of DENSE) { const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz; const bd = radialBound(px, py, pz); if (bd > bMax) { bMax = bd; if (bMax > advMargin) break; } }
      if (bMax <= advMargin) dv = bMax;
      else { dv = 0; for (const [wa, wb, wc] of DENSE) { const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz; const d = loc.dist(px, py, pz); if (d > dv) dv = d; } }
    } else {
      dv = 0; for (const [wa, wb, wc] of DENSE) { const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz; const d = loc.dist(px, py, pz); if (d > dv) dv = d; }
    }
    devS.push(dv);
    if (dv > worst) { worst = dv; worstFacet = f; }
    if (dv > TOL && rowKindOf) { if (rowKindOf(f) === 'lip') outLip++; else outSheet++; }
    if (scanned % progEvery === 0) { let no = 0; for (const d of devS) if (d > TOL) no++; plog(`[${key}] ${Math.floor(scanned / (nF / (stride * shardN)) * 100)}% out=${no} worst=${worst.toFixed(5)} ${((Date.now() - t0) / 1000).toFixed(0)}s`); }
  }
  let nOut = 0; for (const d of devS) if (d > TOL) nOut++;
  const s = Float64Array.from(devS).sort(); const pc = (q: number): number => s.length ? +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(6) : 0;
  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nm = auditNonManRaw(idx);
  const za = zeroAreaCount(xyz, idx);
  const scaledOut = nOut * stride * shardN;
  const closes = scaledOut === 0 && nm.nonMan === 0 && za === 0 && q.pctBelow20 < 10 && tris < 6_000_000;
  checkpoint({
    key, arm, style: 'DragonScales', twin, nZband, tris, stride, shard: SHARD ? `${shardK}/${shardN}` : null,
    scannedFacets: scanned, interiorOutliers: nOut, scaledOutlierEstimate: scaledOut,
    outSheet: outSheet * stride * shardN, outLip: outLip * stride * shardN,
    wholeMeshMaxMm: +worst.toFixed(6), p50: pc(0.5), p90: pc(0.9), p99: pc(0.99),
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
    rawNonMan: nm.nonMan, boundaryEdges: nm.boundary, auditEdges: nm.edges, zeroArea: za, closes,
    ruler: twin === 'step' ? 'whole-mesh STEP-twin BVH every-facet 45pt, NO prefilter (validated tread-representing)' : 'whole-mesh dense radial twin BVH every-facet 45pt, radial prefilter (EXACT V10b basis)',
    scoreMs: Date.now() - t0,
  });
  plog(`[${key}] out=${nOut}(×${stride * shardN}=${scaledOut}) sheet=${outSheet * stride * shardN} lip=${outLip * stride * shardN} max=${worst.toFixed(5)} p99=${pc(0.99)} %<20=${q.pctBelow20.toFixed(2)} rawNM=${nm.nonMan} bd=${nm.boundary} za=${za} tris=${tris} CLOSES=${closes} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  void worstFacet;
}

describe('DS-STEPTWIN — validate the step twin, then honest whole-mesh re-score + density close', () => {
  it.skipIf(process.env.PF_DS_STEP !== '1')('validate step twin (1a-1d) + re-score + close', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    const rings = dragonRings();

    // ═══════════════ TASK 1a — CONSTRUCTION AUDIT: step-twin riser faces sit on the analytic jump geometry. ═══════
    // The designed tread at ring z_k is the annulus at constant z between rIn(theta)=rA(theta,z-eps) and
    // rOut(theta)=rA(theta,z+eps). A point on that annulus at fraction s is P(theta,s) = ((1-s)rIn+s rOut)*(cos,sin), z.
    // Anchor: sample many such analytic tread points; each MUST lie within TOL of the step-twin surface (its tread
    // strip represents this annulus). Also verify the jump magnitude matches the analytic stagger-flip discontinuity.
    if (!keyExists('t1a_construction')) {
      const stepRef = buildStepReference(rA, H, rings, STEP_TWIN);
      const stepLoc = buildRefLocator(stepRef, STEP_CELL);
      plog(`[t1a] stepRef ${stepRef.nF} tris — anchoring tread annulus points...`);
      let maxTreadDist = 0; let sumJumpMax = 0; const jumps: number[] = [];
      const nTh = 360, nS = 12;
      for (const ring of rings) {
        const zEps = STEP_TWIN.zEps ?? 5e-4;
        let ringJumpMax = 0;
        for (let it = 0; it < nTh; it++) {
          const th = TAU * (it / nTh);
          const rIn = rA(th, ring.z - zEps), rOut = rA(th, ring.z + zEps);
          const jmp = Math.abs(rOut - rIn); if (jmp > ringJumpMax) ringJumpMax = jmp;
          for (let is = 0; is <= nS; is++) {
            const s = is / nS; const r = (1 - s) * rIn + s * rOut;
            const d = stepLoc.dist(r * Math.cos(th), r * Math.sin(th), ring.z);
            if (d > maxTreadDist) maxTreadDist = d;
          }
        }
        jumps.push(+ringJumpMax.toFixed(4)); sumJumpMax += ringJumpMax;
      }
      const pass1a = maxTreadDist <= TOL;
      checkpoint({ key: 't1a_construction', task: '1a-construction-audit', stepTwinTris: stepRef.nF,
        maxTreadAnnulusDistMm: +maxTreadDist.toFixed(6), ringJumpMaxMm: jumps, meanRingJumpMm: +(sumJumpMax / rings.length).toFixed(4),
        pass: pass1a, note: 'analytic tread annulus points must lie on the step-twin surface within tol; ringJump = the real stagger-flip discontinuity',
        verdict: pass1a ? '1a PASS: step twin represents the designed tread annulus' : '1a FAIL: step twin does NOT cover the tread annulus' });
      plog(`[t1a] maxTreadDist=${maxTreadDist.toFixed(5)} jumps=${jumps.join(',')} PASS=${pass1a}`);
    }

    // ═══════════════ TASK 1b — SMOOTH-CONTROL NON-VACUITY: on a smooth region away from treads the step twin must
    //    reproduce the RADIAL twin's outlier verdicts (byte-comparable on a shared facet sample). Build a MODERATE
    //    doubled-rings mesh, take SHEET facets far from any ring, score them under BOTH locators, compare. ═════════
    if (!keyExists('t1b_smoothctrl')) {
      const NTH = 2400, TREADCAP = 4, NZ = 70;
      const rows = buildRows(rA, rings, NTH, NZ, TREADCAP);
      const mesh = buildStructuredWall(rA, H, rows);
      const { xyz, idx } = toF32(mesh);
      const cls = facetClassifier(mesh);
      const stepRef = buildStepReference(rA, H, rings, STEP_TWIN);
      const stepLoc = buildRefLocator(stepRef, STEP_CELL);
      const radTwin = buildRadialTwin(rA, H, RAD_TWIN.nTheta, RAD_TWIN.nZ);
      const radLoc = buildRefLocator(radTwin, RAD_CELL);
      // facet z (centroid) must be >2mm from every ring z to be a clean smooth-control sheet facet.
      const centZ = (f: number): number => { const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2]; return (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3; };
      const farFromRing = (z: number): boolean => rings.every(rg => Math.abs(z - rg.z) > 2.0);
      plog(`[t1b] scoring smooth-control sheet facets under BOTH twins...`);
      let nSmooth = 0, agree = 0, disStep = 0, disRad = 0; let maxAbsDelta = 0; const deltas: number[] = [];
      const SAMPLE = 60000; // sample smooth sheet facets across the mesh
      const nF = mesh.nF; const strideS = Math.max(1, Math.floor(nF / (SAMPLE * 3)));
      for (let f = 0; f < nF; f += strideS) {
        if (cls(f) !== 'sheet' || !farFromRing(centZ(f))) continue;
        nSmooth++;
        const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
        const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
        const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
        const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
        let dS = 0, dR = 0;
        for (const [wa, wb, wc] of DENSE) { const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz; const s1 = stepLoc.dist(px, py, pz); if (s1 > dS) dS = s1; const r1 = radLoc.dist(px, py, pz); if (r1 > dR) dR = r1; }
        const oS = dS > TOL, oR = dR > TOL;
        if (oS === oR) agree++; else if (oS) disStep++; else disRad++;
        const del = Math.abs(dS - dR); if (del > maxAbsDelta) maxAbsDelta = del; deltas.push(del);
        if (nSmooth >= SAMPLE) break;
      }
      deltas.sort((x, y) => x - y); const dP99 = deltas.length ? deltas[Math.floor(0.99 * deltas.length)] : 0;
      const agreeFrac = nSmooth ? agree / nSmooth : 0;
      const pass1b = agreeFrac > 0.999 && dP99 < 0.005; // near-identical verdicts + small numeric delta on smooth
      checkpoint({ key: 't1b_smoothctrl', task: '1b-smooth-control-nonvacuity', smoothFacets: nSmooth,
        verdictAgree: agree, agreeFrac: +agreeFrac.toFixed(5), disagreeStepOnly: disStep, disagreeRadOnly: disRad,
        maxAbsDeltaMm: +maxAbsDelta.toFixed(6), deltaP99Mm: +dP99.toFixed(6), pass: pass1b,
        verdict: pass1b ? '1b PASS: step twin reproduces radial twin on smooth (non-vacuous, not hiding gaps)' : '1b FAIL: step twin disagrees with radial twin on SMOOTH region — it alters the body verdict' });
      plog(`[t1b] smooth=${nSmooth} agree=${agree}(${(agreeFrac * 100).toFixed(3)}%) disStep=${disStep} disRad=${disRad} maxDelta=${maxAbsDelta.toFixed(5)} p99=${dP99.toFixed(5)} PASS=${pass1b}`);
    }

    // ═══════════════ TASK 1c — DENSITY CONVERGENCE: the step-twin's own on-surface residual must SHRINK as the twin
    //    densifies (the V10 twin-gate pattern). Sample analytic surface points (sheet + tread) at half-cell offsets
    //    and measure to the step twin at nZperBand {24,48,96} and nTheta {2560,3840,5120}. Residual must fall. ═════
    if (!keyExists('t1c_density')) {
      const zEps = STEP_TWIN.zEps ?? 5e-4;
      const onSurfResid = (nTheta: number, nZperBand: number): { sheetMax: number; treadMax: number } => {
        const ref = buildStepReference(rA, H, rings, { nTheta, nZperBand, zEps });
        const loc = buildRefLocator(ref, STEP_CELL);
        let sheetMax = 0, treadMax = 0;
        // sheet: half-cell z offsets away from rings
        for (let iz = 0; iz < 240; iz++) {
          const z = ((iz + 0.5) / 240) * H; if (rings.some(rg => Math.abs(z - rg.z) < 1.0)) continue;
          for (let it = 0; it < 200; it++) { const th = TAU * ((it + 0.5) / 200); const r = rA(th, z); const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z); if (d > sheetMax) sheetMax = d; }
        }
        // tread: annulus interior points at each ring
        for (const ring of rings) for (let it = 0; it < 200; it++) { const th = TAU * ((it + 0.5) / 200); const rIn = rA(th, ring.z - zEps), rOut = rA(th, ring.z + zEps); for (let is = 1; is < 8; is++) { const s = is / 8; const r = (1 - s) * rIn + s * rOut; const d = loc.dist(r * Math.cos(th), r * Math.sin(th), ring.z); if (d > treadMax) treadMax = d; } }
        return { sheetMax, treadMax };
      };
      plog(`[t1c] density-convergence sweep...`);
      const configs: Array<[number, number]> = [[2560, 24], [3840, 48], [5120, 96]];
      const results = configs.map(([nt, nz]) => { const r = onSurfResid(nt, nz); plog(`[t1c] nTheta=${nt} nZperBand=${nz}: sheetMax=${r.sheetMax.toFixed(6)} treadMax=${r.treadMax.toFixed(6)}`); return { nTheta: nt, nZperBand: nz, sheetMaxMm: +r.sheetMax.toFixed(6), treadMaxMm: +r.treadMax.toFixed(6) }; });
      const shrinkSheet = results[2].sheetMaxMm <= results[0].sheetMaxMm + 1e-6;
      const shrinkTread = results[2].treadMaxMm <= results[0].treadMaxMm + 1e-6;
      const fineBelowTol = results[2].sheetMaxMm < TOL && results[2].treadMaxMm < TOL;
      const pass1c = shrinkSheet && shrinkTread && fineBelowTol;
      checkpoint({ key: 't1c_density', task: '1c-density-convergence', sweep: results, shrinkSheet, shrinkTread, fineBelowTol, pass: pass1c,
        verdict: pass1c ? '1c PASS: step-twin residual shrinks with density and the operating twin is sub-tol on-surface' : '1c FAIL: step-twin residual does not converge / operating twin not sub-tol' });
      plog(`[t1c] shrinkSheet=${shrinkSheet} shrinkTread=${shrinkTread} fineBelowTol=${fineBelowTol} PASS=${pass1c}`);
    }

    // ═══════════════ TASK 1d — ONE-SIDEDNESS: the step twin must NOT extend BEYOND the designed wall (else it could
    //    UNDERSTATE a genuine mesh gap by offering a spurious near face). Probe points KNOWN to be OFF the surface:
    //    push a sheet point radially OUTWARD by a controlled delta; the step twin distance must be >= delta - eps
    //    (it cannot report closer than the true nearest analytic surface). If step reads MUCH less than the radial
    //    twin at a genuine off-surface probe near a ring, the tread strip is a spurious catcher. ═══════════════════
    if (!keyExists('t1d_onesided')) {
      const stepRef = buildStepReference(rA, H, rings, STEP_TWIN);
      const stepLoc = buildRefLocator(stepRef, STEP_CELL);
      plog(`[t1d] one-sidedness: off-surface probes near rings...`);
      // For probe points at a KNOWN offset outside the true surface, both twins should read ~offset. The step twin
      // must not read materially LESS than the true offset (which would mean its tread face reaches out past the wall).
      let maxUnderstate = 0; const cases: Array<Record<string, number>> = []; let nProbe = 0;
      const zEps = STEP_TWIN.zEps ?? 5e-4;
      for (const ring of rings) {
        for (const dz of [-0.8, -0.3, 0.3, 0.8]) { // sheet points just off the ring, pushed OUTWARD by known delta
          const z = ring.z + dz; if (z <= 0 || z >= H) continue;
          for (let it = 0; it < 120; it++) {
            const th = TAU * (it / 120);
            const rTrue = rA(th, z);
            for (const delta of [0.05, 0.2]) { // push OUTWARD (larger radius) — a point provably off the surface
              const r = rTrue + delta;
              const d = stepLoc.dist(r * Math.cos(th), r * Math.sin(th), z);
              const understate = delta - d; // >0 means step twin reads CLOSER than the true off-surface distance ⇒ spurious face
              if (understate > maxUnderstate) { maxUnderstate = understate; }
              nProbe++;
            }
          }
        }
        cases.push({ ringZ: ring.z });
      }
      void zEps;
      // A tolerant threshold: the twin is a flat-facet approximation so tiny understatement (<~half its facet chord,
      // ~0.02mm on tread) is expected; a SPURIOUS catcher would understate by >~0.05mm (reaching across the wall).
      const pass1d = maxUnderstate < 0.05;
      checkpoint({ key: 't1d_onesided', task: '1d-one-sidedness', probes: nProbe, maxUnderstateMm: +maxUnderstate.toFixed(6), threshold: 0.05, pass: pass1d,
        verdict: pass1d ? '1d PASS: step twin does not extend beyond the designed wall (no spurious understatement)' : '1d FAIL: step twin reaches past the wall — it could HIDE a genuine gap' });
      plog(`[t1d] probes=${nProbe} maxUnderstate=${maxUnderstate.toFixed(5)} PASS=${pass1d}`);
    }

    // ═══════════════ TASK 2/3 — HONEST WHOLE-MESH RE-SCORE + DENSITY CLOSE under the VALIDATED step twin. ═══════════
    // Only proceed to scoring if 1a-1d all passed (read them back from the ledger). If any failed, STOP (kill).
    const readPass = (k: string): boolean | null => {
      if (!existsSync(NDJSON)) return null;
      const lines = readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean);
      for (const l of lines) { try { const r = JSON.parse(l); if (r.key === k) return !!r.pass; } catch { /* ignore */ } }
      return null;
    };
    const v1a = readPass('t1a_construction'), v1b = readPass('t1b_smoothctrl'), v1c = readPass('t1c_density'), v1d = readPass('t1d_onesided');
    plog(`[gate] 1a=${v1a} 1b=${v1b} 1c=${v1c} 1d=${v1d}`);
    const allValidated = v1a === true && v1b === true && v1c === true && v1d === true;
    if (!allValidated) {
      if (!keyExists('KILL_instrument')) checkpoint({ key: 'KILL_instrument', task: 'kill', v1a, v1b, v1c, v1d, verdict: 'STOP: step-twin validation FAILED a gate — do NOT trust it for scoring. Score DragonScales under the surviving reference and report the instrument defect.' });
      plog(`[KILL] step-twin validation failed — STOP before scoring.`);
      expect(true).toBe(true); return;
    }

    // Build the validated step twin ONCE (reused across all sweep meshes).
    plog(`[score] building VALIDATED step twin ${STEP_TWIN.nTheta}x(bands*${STEP_TWIN.nZperBand}) + BVH...`);
    const tw0 = Date.now();
    const stepRef: RefMesh = buildStepReference(rA, H, rings, STEP_TWIN);
    const stepLoc = buildRefLocator(stepRef, STEP_CELL);
    plog(`[score] step twin ${stepRef.nF} tris + BVH in ${((Date.now() - tw0) / 1000).toFixed(0)}s`);

    // Whole-mesh re-score of the doubled-rings sweep under the step twin. Screen at stride; close at stride=1.
    const NTH = 2400, TREADCAP = 4;
    const screenStride = Number(process.env.PF_DS_STRIDE ?? '8');
    const closeStride = process.env.PF_DS_CLOSE === '1' ? 1 : screenStride;
    // Density close: extend the sheet nZband lever beyond 110 if the sheet tail is still moving.
    for (const nZband of [70, 110, 160, 220]) {
      const key = `step_nTh${NTH}_nZ${nZband}${closeStride === 1 ? '_s1' : ''}`;
      if (keyExists(key)) { plog(`[skip] ${key} exists`); continue; }
      const tb = Date.now();
      const rows = buildRows(rA, rings, NTH, nZband, TREADCAP);
      const mesh = buildStructuredWall(rA, H, rows);
      const { xyz, idx } = toF32(mesh);
      const cls = facetClassifier(mesh);
      plog(`[${key}] built ${mesh.nF} tris (${((Date.now() - tb) / 1000).toFixed(1)}s) stride=${closeStride} — scoring under step twin...`);
      scoreMesh(key, 'steptwin-zsweep', 'step', nZband, mesh.nF, xyz, idx, stepLoc, rA, cls, closeStride);
    }
    expect(true).toBe(true);
  }, 6 * 60 * 60 * 1000);
});
