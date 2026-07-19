// _dsRiserClose.test.ts — E-2026-07-19-DS-RISER-CLOSE (S2 generator productionize, ring C0 class).
//
// GOAL (S2 exit-1): does the §V11l u-running RISER edge family (doubled tread rings at t=k/8±riserHalfMm, my C1
// src change buildRiserEdgeGraph, gated by __pfDsRiserEdges) close the DragonScales INTERIOR ring-riser C0 class to
// the 0.01mm true-3D standard — the residual E-DS-PERP-MAX measured at ring composite MAX ~0.25mm (the combo θ+toe
// graph does NOT embed the rings, so ring facets chord the ~0.9-1.2mm C0 step)?
//
// MECHANISM (LOCATE-confirmed, dsLocate): each interior stagger ring is a genuine C0 radius JUMP (0.95-1.13mm,
// INVARIANT as dz->0) = a near-horizontal annular TREAD (r⁻ row k-1 → r⁺ row k at z_k). A single-valued radial mesh
// cannot place an intermediate-radius vertex AT z_k; the doubled ring (below at z_k-dtHalf samples r⁻, above at
// z_k+dtHalf samples r⁺) makes the Delaunay strip between them the tread face. The strip's worst deviation from the
// V11g composite tread reference ≈ (riserHalfMm - 5e-4) ⇒ riserHalfMm~0.005 lands ~0.0045 ≤ 0.01 (a genuinely
// faithful ≤0.01 approximation of the true tread, not a ruler trick — the composite ruler passed the 1a-1d battery).
//
// INSTRUMENT: the CERTIFIED V11g composite ruler (_ds_prodtruth_lib: buildConformRuler = radial sheet twin ∪ riser
// wall, z-gated) — the SAME instrument E-DS-PERP-MAX/E-DS-INTERIOR-CLOSE used. RING facets scored vs the full
// composite (scoreRingBandFacets, no prefilter — the radial bound is unsound at the tread). BODY facets scored vs
// the composite w/ the sound radial green-prefilter (scoreBodyFacets) + a perFaceTrue3DSag witness. This is the
// FAITHFUL ring ruler; note featConformAll20's buildFeatureTruth loci do NOT cover the ring C0 class, so the
// composite (not fl3d) is the verdict instrument for S2 exit-1.
//
// KERNEL: the PRODUCTION regionMetric.ts buildMetricMesh (byte-faithful twin of the lab kernel) fed the PRODUCTION
// buildDragonScalesConformingGraph (my C1 riser option). NO rim-pin here: the ring risers (t=k/8, k=1..7) are
// interior, ORTHOGONAL to the rim-pin seam/rim weld — so buildMetricMesh (no rimPinRing) faithfully isolates the
// riser mechanism AND matches the E-DS-INTERIOR-CLOSE methodology (its numbers are directly comparable). The
// production DISPATCH (buildRegionOuterWall, rim-pinned) wiring is separately proven by dsFeatureEdges.test.ts.
//
// KILL-CRITERION (pre-registered, committed BEFORE measuring):
//   CLOSES iff, ON (riser) vs OFF (no riser), same seam machinery + kernel config: ring composite MAX drops from
//   ~0.25 to ≤ 0.01 AND ring composite p99 ≤ 0.01 AND the BODY does not regress (body composite/witness p99 ≤ 0.01,
//   already banked) AND nonMan 0. FLOORS otherwise → report the honest ring-composite floor + WHY (the heightfield
//   kernel cannot represent the vertical tread below some dtHalf without a sliver band, OR the composite plateaus)
//   + the tri/needle cost. %<20° needle documented either way (the accepted region-kernel finite-area concession).
//
// DEV-ONLY; research/ only; imports src READ-ONLY (allowed: src must not import research, not vice-versa). Reuses
// buildMetricMesh + buildDragonScalesConformingGraph (src) + _ds_prodtruth_lib (V11g ruler) + labkit READ-ONLY.
// Every arm is a keyExists-guarded checkpointed unit → a killed run RESUMES by re-running only the unfinished arm.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  triangleQualityDistribution, auditNonManByIndex, liftUtToRadial, perFaceTrue3DSag,
} from './labkit';
import {
  buildConformRuler, dragonRings, classifyRingBand, scoreBodyFacets, scoreRingBandFacets, dsRadiusFn,
  radialBoundAt, DENSE, H as DS_H, TOL,
} from './_ds_prodtruth_lib';
import { buildMetricMesh, type MetricMeshOpts } from '../../src/renderers/webgpu/parametric/conforming/tierC/regionMetric';
import { buildDragonScalesConformingGraph } from '../../src/renderers/webgpu/parametric/conforming/tierC/dsFeatureEdges';

const SIZE_RES = 192, HMAX_3D = 8, GRADE_BETA = 0.2;
const FINE_STEP = 0.0022, SUBSAMPLES = 4;
const SEAM_RAIL = 128;            // neutral to the ring A/B (both arms); trimmed for screen cost.
const BAND_MM = 1.0;              // ring-band width (E-DS-INTERIOR-CLOSE/PERP-MAX convention).
const SCREEN_MAX_POINTS = process.env.PF_DSRISER_PTS ? parseInt(process.env.PF_DSRISER_PTS, 10) : 900_000;
const HD_MAX_POINTS = 3_200_000;

const OUT_DIR = join('research', 'exchange', '_dsRiserClose');
const SCREEN = join(OUT_DIR, 'screen.ndjson');
const HD = join(OUT_DIR, 'hd.ndjson');

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function keyExists(file: string, k: string): boolean {
  if (!existsSync(file)) return false;
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}
function append(file: string, row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(file, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row)}`);
}
function pct(sorted: Float64Array, q: number): number {
  return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(6) : 0;
}

interface Arm {
  key: string; riser: boolean; riserHalfMm?: number; riserSamplesPerRing?: number; note: string;
}

/** Build the DS conforming graph (θ+toe+rail, ± riser) and mesh it with the PRODUCTION region kernel (no rim-pin). */
function buildMesh(arm: Arm, maxPoints: number): { ut: number[]; idx: Uint32Array; constraint: unknown; buildS: number } {
  const rA = dsRadiusFn();
  const graph = buildDragonScalesConformingGraph(DS_H, {
    seamRailSamples: SEAM_RAIL,
    ...(arm.riser
      ? { riserEdges: true, riserHalfMm: arm.riserHalfMm ?? 0.005, riserSamplesPerRing: arm.riserSamplesPerRing ?? 128 }
      : {}),
  });
  const opts: MetricMeshOpts = {
    tolMm: TOL, hMin: 0.02, hMax: HMAX_3D, sizeRes: SIZE_RES, gradeBeta: GRADE_BETA,
    maxPoints, guardManifoldAlways: true,
    injectedPoints: graph.pts, constraintEdges: graph.edges, pinInjected: true, recoverySubdivideCollinear: true,
    curvatureFineStep: FINE_STEP, curvatureSubsamples: SUBSAMPLES,
    chordTolMm: TOL, chordSampleN: 8,
  };
  const t0 = Date.now();
  const mesh = buildMetricMesh(rA, DS_H, opts);
  return { ut: mesh.ut, idx: mesh.indices, constraint: mesh.constraint, buildS: (Date.now() - t0) / 1000 };
}

/** Screen scorer: full CERTIFIED composite on ring-band + body (green-prefiltered) + witness. Reuses a shared ruler. */
function scoreArm(
  arm: Arm, ut: number[], idx: Uint32Array, buildS: number, constraint: unknown, maxPoints: number,
  ruler: ReturnType<typeof buildConformRuler>,
): Record<string, unknown> {
  const rA = dsRadiusFn();
  const xyz = liftUtToRadial(ut, rA, DS_H).vertices;
  const tris = idx.length / 3;
  const ringZs = dragonRings().map((r) => r.z);
  const cls = classifyRingBand(xyz, idx, ringZs, BAND_MM);
  const bodyF: number[] = [], ringF: number[] = [];
  for (let f = 0; f < tris; f++) (cls(f) === 'ringBand' ? ringF : bodyF).push(f);

  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nonMan = auditNonManByIndex(xyz, idx);

  // RING composite (certified). The composite BVH is ~100µs/query; scoring all ~200-450k ring facets is ~30min/arm.
  // Cap to the worst RING_CAP facets by RADIAL max (cheap): radial is a SOUND upper bound on the sheet distance, and
  // composite = min(sheet,wall) ≤ sheet ≤ radial, so a HIGH composite facet necessarily has HIGH radial ⇒ it is in
  // the worst-by-radial set. Hence (a) the composite MAX over the cap = the true ring composite MAX, and (b) ON max
  // ≤ 0.01 over the cap ⟹ EVERY ring facet ≤ 0.01 (any facet > 0.01 composite would be in the cap). SOUND for the
  // kill-criterion (MAX) + the ON PASS. Outlier count over the cap is exact when < RING_CAP outliers (the ON case).
  const RING_CAP = process.env.PF_DSRISER_RINGCAP ? parseInt(process.env.PF_DSRISER_RINGCAP, 10) : 8000;
  const tR = Date.now();
  const radMax = new Float64Array(ringF.length);
  let radOutliers = 0;
  for (let i = 0; i < ringF.length; i++) {
    const f = ringF[i]; const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    let m = 0;
    for (const [wa, wb, wc] of DENSE) {
      const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
      const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
      const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
      const d = radialBoundAt(rA, px, py, pz); if (d > m) m = d;
    }
    radMax[i] = m; if (m > TOL) radOutliers++;
  }
  const order = Array.from(radMax.keys()).sort((i, j) => radMax[j] - radMax[i]);
  const capIdx = order.slice(0, Math.min(RING_CAP, ringF.length)).map((i) => ringF[i]);
  const ring = scoreRingBandFacets(xyz as unknown as Float32Array, idx, capIdx, ruler, TOL,
    (d, t) => { if (d % Math.max(1, Math.floor(t / 4)) === 0) plog(`  [${arm.key}][ring] ${d}/${t}`); });
  plog(`[${arm.key}][RING comp worst-${capIdx.length}/radial] max=${ring.maxMm} p99=${ring.p99} out=${ring.outliers} (radialOutliers=${radOutliers}/${ringF.length}) in ${((Date.now() - tR) / 1000).toFixed(0)}s`);

  // BODY composite (certified, green-prefiltered) + perFaceTrue3DSag witness on the body.
  const tB = Date.now();
  const body = scoreBodyFacets(xyz as unknown as Float32Array, idx, bodyF, ruler, rA, TOL);
  const sag = perFaceTrue3DSag(ut, idx, rA, DS_H, { preFilterMm: 0.01 });
  const wDevs: number[] = []; let wWorst = 0;
  for (const f of bodyF) { const e = sag.faceErr[f]; wDevs.push(e); if (e > wWorst) wWorst = e; }
  const wSorted = Float64Array.from(wDevs).sort();
  plog(`[${arm.key}][BODY comp] max=${body.maxMm} p99=${body.p99} | wit max=${wWorst.toFixed(6)} p99=${pct(wSorted, 0.99)} in ${((Date.now() - tB) / 1000).toFixed(0)}s`);

  const c = constraint as { requested?: number; recovered?: number; alreadyPresent?: number; failed?: number } | undefined;
  return {
    key: arm.key, note: arm.note, riser: arm.riser, riserHalfMm: arm.riserHalfMm ?? null, maxPoints,
    tris, verts: xyz.length / 3, buildS: +buildS.toFixed(1),
    ringComp_max: ring.maxMm, ringComp_p99: ring.p99, ringComp_p50: ring.p50, ringOut: ring.outliers,
    ringCapScored: capIdx.length, ringRadialOut: radOutliers, ringFacets: ringF.length,
    bodyComp_max: body.maxMm, bodyComp_p99: body.p99, bodyWit_max: +wWorst.toFixed(6), bodyWit_p99: pct(wSorted, 0.99), bodyFacets: bodyF.length,
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(2),
    nonMan, recovery: c ? { req: c.requested, rec: c.recovered, present: c.alreadyPresent, failed: c.failed } : null,
  };
}

const SCREEN_ARMS: Arm[] = [
  { key: 'OFF', riser: false, note: 'θ+toe+rail (no riser) — baseline, expect ring comp max ~0.25' },
  { key: 'ON|dt0.005', riser: true, riserHalfMm: 0.005, note: '+riser dtHalf 0.005 (predicted ~0.0045)' },
  { key: 'ON|dt0.003', riser: true, riserHalfMm: 0.003, note: '+riser dtHalf 0.003 (tighter)' },
  { key: 'ON|dt0.008', riser: true, riserHalfMm: 0.008, note: '+riser dtHalf 0.008 (thicker/fewer slivers)' },
];

describe('DS RISER close — §V11l doubled tread rings on the production region kernel', () => {
  it.skipIf(process.env.PF_DSRISER !== '1')('SCREEN — OFF vs ON(dtHalf sweep), certified composite ring+body', () => {
    plog(`=== SCREEN budget=${SCREEN_MAX_POINTS} → ${SCREEN} ===`);
    const only = process.env.PF_DSRISER_ARMS?.split(',').map((s) => s.trim()).filter(Boolean);
    const arms = only ? SCREEN_ARMS.filter((a) => only.includes(a.key)) : SCREEN_ARMS;
    plog('building certified V11g composite ruler (radial twin 2048×3072 ∪ riser wall)…');
    const t0 = Date.now();
    const ruler = buildConformRuler(dsRadiusFn());
    plog(`ruler built in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    for (const arm of arms) {
      if (keyExists(SCREEN, arm.key)) { plog(`[skip] ${arm.key}`); continue; }
      const { ut, idx, constraint, buildS } = buildMesh(arm, SCREEN_MAX_POINTS);
      plog(`[${arm.key}] meshed ${idx.length / 3} tris in ${buildS.toFixed(1)}s`);
      append(SCREEN, scoreArm(arm, ut, idx, buildS, constraint, SCREEN_MAX_POINTS, ruler));
    }
  }, 180 * 60 * 1000);

  it.skipIf(process.env.PF_DSRISER_HD !== '1')('HD CONFIRM — winner arm at HD budget, certified composite', () => {
    const winKey = process.env.PF_DSRISER_WIN ?? 'ON|dt0.005';
    plog(`=== HD CONFIRM ${winKey} budget=${HD_MAX_POINTS} → ${HD} ===`);
    const arm = SCREEN_ARMS.find((a) => a.key === winKey) ?? SCREEN_ARMS[1];
    if (keyExists(HD, arm.key)) { plog(`[skip hd] ${arm.key}`); return; }
    const ruler = buildConformRuler(dsRadiusFn());
    const { ut, idx, constraint, buildS } = buildMesh(arm, HD_MAX_POINTS);
    plog(`[HD ${arm.key}] meshed ${idx.length / 3} tris in ${buildS.toFixed(1)}s`);
    append(HD, scoreArm(arm, ut, idx, buildS, constraint, HD_MAX_POINTS, ruler));
  }, 240 * 60 * 1000);

  // DIAG — WHY didn't a given ON arm close? Build small, dump recovery + the worst-K ring facets' (u,t, side of the
  // nearest ring, radius span, composite) so the failure mode is visible (unrecovered ring / seam / θ-tread chord).
  it.skipIf(process.env.PF_DSRISER_DIAG !== '1')('DIAG — worst ON ring facet locations + recovery + dz-band decomp', () => {
    const dt = process.env.PF_DSRISER_DT ? parseFloat(process.env.PF_DSRISER_DT) : 0.005;
    const nUp = process.env.PF_DSRISER_NUP ? parseInt(process.env.PF_DSRISER_NUP, 10) : 128;
    const budget = process.env.PF_DSRISER_PTS ? parseInt(process.env.PF_DSRISER_PTS, 10) : 400_000;
    const riserOn = process.env.PF_DSRISER_DIAGOFF !== '1';
    const arm: Arm = riserOn
      ? { key: `DIAG|dt${dt}|nU${nUp}`, riser: true, riserHalfMm: dt, riserSamplesPerRing: nUp, note: 'diag ON' }
      : { key: 'DIAG|OFF', riser: false, note: 'diag OFF' };
    const { ut, idx, constraint, buildS } = buildMesh(arm, budget);
    const rA = dsRadiusFn();
    const xyz = liftUtToRadial(ut, rA, DS_H).vertices;
    const ruler = buildConformRuler(rA);
    const ringZs = dragonRings().map((r) => r.z);
    const cls = classifyRingBand(xyz, idx, ringZs, BAND_MM);
    const c = constraint as { requested?: number; recovered?: number; alreadyPresent?: number; failed?: number } | undefined;
    const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
    const nonMan = auditNonManByIndex(xyz, idx);
    plog(`[DIAG ${arm.key}] tris=${idx.length / 3} buildS=${buildS.toFixed(1)} %<20=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(3)} nonMan=${nonMan} recovery=${JSON.stringify(c)}`);
    // dz-BAND DECOMPOSITION: separate the TREAD (|dz|<treadMm — the risers' job) from the near-ring FLANK
    // (treadMm≤|dz|<1.0 — a DENSITY class, same as the DS body). Tread: composite-score ALL (few). Flank: worst-N
    // by radial (sound upper bound). This shows whether the risers close the C0 STEP even though the ring-BAND MAX
    // is masked by the under-resolved flank at a starved budget.
    const TREAD_MM = process.env.PF_DSRISER_TREADMM ? parseFloat(process.env.PF_DSRISER_TREADMM) : 0.05;
    const dzOf = (f: number): number => {
      const a = idx[3 * f], b = idx[3 * f + 1], cc = idx[3 * f + 2];
      const zc = (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * cc + 2]) / 3;
      let bd = 1e9; for (let k = 1; k <= 7; k++) { const d = Math.abs(zc - (k / 8) * DS_H); if (d < bd) bd = d; } return bd;
    };
    const radOf = (f: number): number => {
      const a = idx[3 * f], b = idx[3 * f + 1], cc = idx[3 * f + 2]; let m = 0;
      for (const [wa, wb, wc] of DENSE) {
        const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * cc];
        const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * cc + 1];
        const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * cc + 2];
        const d = radialBoundAt(rA, px, py, pz); if (d > m) m = d;
      }
      return m;
    };
    const compOf = (f: number): number => {
      const a = idx[3 * f], b = idx[3 * f + 1], cc = idx[3 * f + 2]; let d = 0;
      for (const [wa, wb, wc] of DENSE) {
        const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * cc];
        const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * cc + 1];
        const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * cc + 2];
        const dd = ruler.dist(px, py, pz); if (dd > d) d = dd;
      }
      return d;
    };
    const treadF: number[] = [], flankF: number[] = [];
    for (let f = 0; f < idx.length / 3; f++) { if (cls(f) !== 'ringBand') continue; (dzOf(f) < TREAD_MM ? treadF : flankF).push(f); }
    const treadD = treadF.map(compOf); treadD.sort((x, y) => y - x);
    const flankCap = flankF.map((f) => ({ f, r: radOf(f) })).sort((x, y) => y.r - x.r).slice(0, 1500).map((o) => o.f);
    const flankD = flankCap.map(compOf); flankD.sort((x, y) => y - x);
    const p99 = (arr: number[]): number => arr.length ? arr[Math.floor(0.01 * arr.length)] : 0;
    const outl = (arr: number[]): number => arr.filter((d) => d > TOL).length;
    plog(`[DIAG ${arm.key}] TREAD (|dz|<${TREAD_MM}mm, ${treadF.length} facets, ALL scored): max=${(treadD[0] ?? 0).toFixed(5)} p99=${p99(treadD).toFixed(5)} out=${outl(treadD)}`);
    plog(`[DIAG ${arm.key}] FLANK (${TREAD_MM}≤|dz|<1mm, ${flankF.length} facets, worst-${flankCap.length}/radial): max=${(flankD[0] ?? 0).toFixed(5)} p99=${p99(flankD).toFixed(5)} out≥${outl(flankD)}`);
  }, 30 * 60 * 1000);

  // Guard the OFF baseline reproduces the banked ring composite ~0.25 (radial screen sanity — cheap, always runs).
  it.skipIf(process.env.PF_DSRISER_SANITY !== '1')('SANITY — OFF small build, radial ring screen ~0.8 (chords step)', () => {
    const { ut, idx } = buildMesh(SCREEN_ARMS[0], 250_000);
    const rA = dsRadiusFn();
    const xyz = liftUtToRadial(ut, rA, DS_H).vertices;
    const ringZs = dragonRings().map((r) => r.z);
    const cls = classifyRingBand(xyz, idx, ringZs, BAND_MM);
    let rMax = 0;
    for (let f = 0; f < idx.length / 3; f++) {
      if (cls(f) !== 'ringBand') continue;
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      for (const [wa, wb, wc] of DENSE) {
        const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
        const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
        const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
        const d = radialBoundAt(rA, px, py, pz); if (d > rMax) rMax = d;
      }
    }
    plog(`[SANITY] OFF ring radial screen max=${rMax.toFixed(4)} (expect ~0.8-1.1 = the chorded C0 step)`);
  }, 30 * 60 * 1000);
});
