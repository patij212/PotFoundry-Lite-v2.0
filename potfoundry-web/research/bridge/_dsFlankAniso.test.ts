// _dsFlankAniso.test.ts — E-2026-07-19-DS-CONVERGE-B (FLANK half; the metric-side anisotropic accelerator).
//
// QUESTION (audit-first): does wiring the ANISOTROPIC (II,I) curvature metric + metric-in-circle flip into the
// PRODUCTION region kernel (my C1: regionMetric `aniso` opt) close / move the DragonScales NEAR-RING FLANK
// residual that the ISOTROPIC region kernel leaves budget-starved at ~0.34 (E-2026-07-19-DS-RISER-CLOSE:
// FLANK 0.05≤|dz|<1mm max 0.343 / p99 0.321 @1.2M tris)?
//
// WHY this is the untested gap (not a re-run): prior work tested (a) the aniso (II,I) metric in a DIFFERENT
// kernel `buildCreaseAlignedMesh` — which STALLED at 130k tris / 0.6mm because it has NO chord guard and its
// metric under-sizes (E-2026-07-14-DS-ANISO-RING BODY); and (b) the ISOTROPIC metric in THIS region kernel —
// which PLATEAUS on the near-vertical flank (sliver trap, E-2026-07-14-DS-PERP-MAX). NOBODY tested the aniso
// metric IN the region kernel, which KEEPS the chordTolMm chord-sag guard (the backstop the stalled mesher
// lacked). project_msurf_accelerator / DS-PERP-MAX both name exactly this as the pre-registered NEXT experiment.
//
// A/B (the ONLY variable is `aniso`): both arms mesh the SAME DS conforming graph (θ-valley ∪ flank-toe ∪ seam-
// rail, NO riser — the riser is the TREAD half / workstream A, and it barely moves the flank) with the SAME
// production config + SAME vertex budget on `regionMetric.buildMetricMesh`. ISO = today's kernel; ANISO = +aniso.
//
// INSTRUMENT: the CERTIFIED V11g composite ruler (_ds_prodtruth_lib.buildConformRuler = radial sheet-twin ∪ riser
// wall) — the E-DS-PERP-MAX instrument. FLANK facets (centroid within 1mm of a ring, 0.05≤|dz|<1mm) scored vs the
// full composite, capped to the worst-FLANK_CAP by RADIAL (radial ≥ sheet ≥ composite ⇒ SOUND for MAX + the PASS).
// BODY scored with the sound radial green-prefilter (shared-benefit note). Slivers by minAngle; watertight by index.
//
// KILL-CRITERION (pre-registered, committed BEFORE measuring):
//   CLOSE  iff ANISO flank composite MAX ≤ 0.01 AND p99 ≤ 0.01 at a reported tri/CPU cost, watertight nonMan 0.
//   MOVES  iff ANISO flank MAX < 0.7 × ISO flank MAX at EQUAL budget (mechanism confirmed, efficiency real) —
//          report the residual + where it concentrates (worst-facet dump) + the honest wall.
//   NO-OP / WALL iff ANISO flank MAX ≥ 0.9 × ISO (anisotropy does not move the flank in the region kernel) —
//          report why (flip fighting the chord guard / metric under-size / the residual is C0-straddle not smooth).
//   Slivers (%<20°, minAngle) reported either way; a regression is a documented cost, not a disqualifier.
//
// DEV-ONLY; research/ only; imports src READ-ONLY (buildMetricMesh + buildDragonScalesConformingGraph). Every arm
// is a keyExists-guarded checkpointed unit ⇒ a killed run RESUMES by re-running only the unfinished arm.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpuUsage } from 'node:process';
import { triangleQualityDistribution, auditNonManByIndex, liftUtToRadial, perFaceTrue3DSag } from './labkit';
import {
  buildConformRuler, dragonRings, classifyRingBand, dsRadiusFn,
  radialBoundAt, DENSE, H as DS_H, TOL,
} from './_ds_prodtruth_lib';
import { buildMetricMesh, type MetricMeshOpts } from '../../src/renderers/webgpu/parametric/conforming/tierC/regionMetric';
import { buildDragonScalesConformingGraph } from '../../src/renderers/webgpu/parametric/conforming/tierC/dsFeatureEdges';
import { metricMinAngleDeg } from './creaseAlignedMesh';
import { creaseMetricAt } from './onDemandMetric';

const SIZE_RES = 192, HMAX_3D = 8, GRADE_BETA = 0.2;
const FINE_STEP = 0.0022, SUBSAMPLES = 4;
const SEAM_RAIL = 128;
const BAND_MM = 1.0;             // ring-band width (E-DS-INTERIOR-CLOSE convention).
const TREAD_MM = 0.05;          // |dz|<TREAD ⇒ tread (workstream A); 0.05≤|dz|<1 ⇒ FLANK (this task).
const FLANK_CAP = process.env.PF_DSFLANK_CAP ? parseInt(process.env.PF_DSFLANK_CAP, 10) : 6000;
const SCREEN_MAX_POINTS = process.env.PF_DSFLANK_PTS ? parseInt(process.env.PF_DSFLANK_PTS, 10) : 500_000;
const HD_MAX_POINTS = process.env.PF_DSFLANK_HDPTS ? parseInt(process.env.PF_DSFLANK_HDPTS, 10) : 2_400_000;

const OUT_DIR = join('research', 'exchange', '_dsFlankAniso');
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

interface Arm { key: string; aniso: boolean; chordSteiner?: boolean; note: string; }

const SCREEN_ARMS: Arm[] = [
  { key: 'ISO', aniso: false, note: 'isotropic g/h² region kernel — reproduces flank ~0.34 baseline' },
  { key: 'ANISO', aniso: true, note: '+aniso (II,I) metric + metric-in-circle flip (C1)' },
  // The ANISO convergence floor (HD) is the chord guard splitting the metric-LONGEST (across-flank) edge while the
  // residual sag is ALONG-flank. chordSteiner inserts at the WORST-sag bary sample (interior) instead ⇒ the
  // along-flank bulge is directly reducible (an edge split can't converge an interior apex; a Steiner can). Tests
  // whether the pre-registered fix breaks the floor from 0.102 toward 0.01.
  { key: 'ANISO_STEINER', aniso: true, chordSteiner: true, note: '+aniso +chordSteiner (worst-sag Steiner split)' },
];

/** Build the DS conforming graph (θ+toe+rail, NO riser) and mesh with the PRODUCTION region kernel (no rim-pin,
 *  matching E-DS-INTERIOR-CLOSE / E-DS-RISER-CLOSE so the numbers are directly comparable). */
function buildMesh(arm: Arm, maxPoints: number): { ut: number[]; idx: Uint32Array; constraint: unknown; buildS: number; cpuS: number } {
  const rA = dsRadiusFn();
  const graph = buildDragonScalesConformingGraph(DS_H, { seamRailSamples: SEAM_RAIL });
  const opts: MetricMeshOpts = {
    tolMm: TOL, hMin: 0.02, hMax: HMAX_3D, sizeRes: SIZE_RES, gradeBeta: GRADE_BETA,
    maxPoints, guardManifoldAlways: true,
    injectedPoints: graph.pts, constraintEdges: graph.edges, pinInjected: true, recoverySubdivideCollinear: true,
    curvatureFineStep: FINE_STEP, curvatureSubsamples: SUBSAMPLES,
    chordTolMm: TOL, chordSampleN: 8,
    ...(arm.aniso ? { aniso: true } : {}),
    ...(arm.chordSteiner ? { chordSteiner: true } : {}),
  };
  const t0 = Date.now();
  const c0 = cpuUsage();
  const mesh = buildMetricMesh(rA, DS_H, opts);
  const cpu = cpuUsage(c0);
  return { ut: mesh.ut, idx: mesh.indices, constraint: mesh.constraint, buildS: (Date.now() - t0) / 1000, cpuS: (cpu.user + cpu.system) / 1e6 };
}

/** Score ONE arm: FLANK composite (worst-cap by radial) + BODY (green-prefilter) + slivers + watertight. */
function scoreArm(
  arm: Arm, ut: number[], idx: Uint32Array, buildS: number, cpuS: number, constraint: unknown, maxPoints: number,
  ruler: ReturnType<typeof buildConformRuler>,
): Record<string, unknown> {
  const rA = dsRadiusFn();
  const xyz = liftUtToRadial(ut, rA, DS_H).vertices;
  const tris = idx.length / 3;
  const ringZs = dragonRings().map((r) => r.z);
  const cls = classifyRingBand(xyz, idx, ringZs, BAND_MM);

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

  // FLANK population: ring-band, 0.05≤|dz|<1mm. Cap to worst-FLANK_CAP by radial (sound upper bound), composite-score.
  const flankF: number[] = [], bodyF: number[] = [];
  let treadN = 0;
  for (let f = 0; f < tris; f++) {
    if (cls(f) === 'ringBand') { const dz = dzOf(f); if (dz < TREAD_MM) treadN++; else flankF.push(f); }
    else bodyF.push(f);
  }
  const tF = Date.now();
  const cap = flankF.map((f) => ({ f, r: radOf(f) })).sort((x, y) => y.r - x.r).slice(0, FLANK_CAP);
  const flankD = cap.map((o) => compOf(o.f)).sort((x, y) => y - x);
  const flankMax = flankD.length ? +flankD[0].toFixed(6) : 0;
  const flankP99 = flankD.length ? +flankD[Math.floor(0.01 * flankD.length)].toFixed(6) : 0; // sorted DESC ⇒ [1%]=p99
  let flankOut = 0; for (const d of flankD) if (d > TOL) flankOut++;
  plog(`[${arm.key}][FLANK worst-${cap.length}/${flankF.length}] max=${flankMax} p99=${flankP99} out≥${flankOut} in ${((Date.now() - tF) / 1000).toFixed(0)}s`);

  // Worst-12 flank facet dump (where does the residual live?).
  const worst = cap.map((o) => ({ f: o.f, d: compOf(o.f) })).sort((x, y) => y.d - x.d).slice(0, 12);
  for (const w of worst) {
    const a = idx[3 * w.f], b = idx[3 * w.f + 1], cc = idx[3 * w.f + 2];
    const uc = (ut[2 * a] + ut[2 * b] + ut[2 * cc]) / 3, tc = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * cc + 1]) / 3;
    const rSpan = Math.max(Math.hypot(xyz[3 * a], xyz[3 * a + 1]), Math.hypot(xyz[3 * b], xyz[3 * b + 1]), Math.hypot(xyz[3 * cc], xyz[3 * cc + 1]))
      - Math.min(Math.hypot(xyz[3 * a], xyz[3 * a + 1]), Math.hypot(xyz[3 * b], xyz[3 * b + 1]), Math.hypot(xyz[3 * cc], xyz[3 * cc + 1]));
    plog(`  [${arm.key}] d=${w.d.toFixed(4)} u=${uc.toFixed(4)} t=${tc.toFixed(5)} dz=${dzOf(w.f).toFixed(4)} rSpan=${rSpan.toFixed(4)}`);
  }

  // BODY witness (perFaceTrue3DSag = facet→nearest radial surface). The body is FAR from rings ⇒ the composite's
  // wall component is z-gated off there, so this IS the faithful body ruler (E-DS-PERP-MAX witness, GN-honest for a
  // riser). Pre-filtered ⇒ only real-residual facets project. The full ALL-body composite scorer was dropped: 8+min
  // at 500k on the expensive DS rA, and the body is a SECONDARY shared-benefit note (the FLANK composite is the exit).
  const tB = Date.now();
  const sag = perFaceTrue3DSag(ut, idx, rA, DS_H, { preFilterMm: 0.01 });
  const wDevs: number[] = []; let wWorst = 0;
  for (const f of bodyF) { const e = sag.faceErr[f]; wDevs.push(e); if (e > wWorst) wWorst = e; }
  const wSorted = Float64Array.from(wDevs).sort();
  let wOut = 0; for (const e of wDevs) if (e > TOL) wOut++;
  plog(`[${arm.key}][BODY wit] max=${wWorst.toFixed(6)} p99=${pct(wSorted, 0.99)} out=${wOut}/${bodyF.length} in ${((Date.now() - tB) / 1000).toFixed(0)}s`);

  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nonMan = auditNonManByIndex(xyz, idx);

  // METRIC min-angle (aniso arm only): the ISOTROPIC %<20° OVERSTATES an anisotropic mesh (E-ANISO-RULER — a
  // correctly long-along-flank cell reads as a sliver in the 3D-isotropic ruler). Measure the min-angle IN the
  // crease-aligned metric M (the honest quality for an aniso mesh; msurf reported DS 22.7→2.3% under this ruler).
  let metricPct20 = -1, metricMinAng = -1;
  if (arm.aniso) {
    const mAt = (u: number, t: number): [number, number, number] => creaseMetricAt(rA, DS_H, u, t, { tolMm: TOL, hMin: 0.02, hMax: HMAX_3D, fdStep: FINE_STEP });
    let below = 0, mn = 180; const NF = tris;
    for (let f = 0; f < NF; f++) { const ang = metricMinAngleDeg(ut, idx[3 * f], idx[3 * f + 1], idx[3 * f + 2], mAt); if (ang < 20) below++; if (ang < mn) mn = ang; }
    metricPct20 = +(100 * below / NF).toFixed(2); metricMinAng = +mn.toFixed(3);
    plog(`[${arm.key}][metric-slivers] %<20°=${metricPct20} minAng=${metricMinAng} (iso %<20°=${q.pctBelow20.toFixed(2)})`);
  }
  const c = constraint as { requested?: number; recovered?: number; alreadyPresent?: number; failed?: number } | undefined;
  return {
    key: arm.key, note: arm.note, aniso: arm.aniso, maxPoints,
    tris, verts: xyz.length / 3, buildS: +buildS.toFixed(1), cpuS: +cpuS.toFixed(1),
    flankMax, flankP99, flankOut, flankScored: cap.length, flankFacets: flankF.length, treadFacets: treadN,
    bodyWit_max: +wWorst.toFixed(6), bodyWit_p99: pct(wSorted, 0.99), bodyWit_out: wOut, bodyFacets: bodyF.length,
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(2),
    metricPct20, metricMinAng,
    nonMan, recovery: c ? { req: c.requested, rec: c.recovered, present: c.alreadyPresent, failed: c.failed } : null,
  };
}

describe('DS FLANK aniso — (II,I) metric + metric-in-circle flip on the production region kernel', () => {
  it.skipIf(process.env.PF_DSFLANKANISO !== '1')('SCREEN — ISO vs ANISO at equal budget, certified flank composite', () => {
    plog(`=== SCREEN budget=${SCREEN_MAX_POINTS} cap=${FLANK_CAP} → ${SCREEN} ===`);
    const only = process.env.PF_DSFLANK_ARMS?.split(',').map((s) => s.trim()).filter(Boolean);
    const arms = only ? SCREEN_ARMS.filter((a) => only.includes(a.key)) : SCREEN_ARMS;
    plog('building certified V11g composite ruler (radial twin 2048×3072 ∪ riser wall)…');
    const t0 = Date.now();
    const ruler = buildConformRuler(dsRadiusFn());
    plog(`ruler built in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    for (const arm of arms) {
      if (keyExists(SCREEN, arm.key)) { plog(`[skip] ${arm.key}`); continue; }
      const { ut, idx, constraint, buildS, cpuS } = buildMesh(arm, SCREEN_MAX_POINTS);
      plog(`[${arm.key}] meshed ${idx.length / 3} tris in ${buildS.toFixed(1)}s (cpu ${cpuS.toFixed(1)}s)`);
      append(SCREEN, scoreArm(arm, ut, idx, buildS, cpuS, constraint, SCREEN_MAX_POINTS, ruler));
    }
  }, 180 * 60 * 1000);

  it.skipIf(process.env.PF_DSFLANKANISO_HD !== '1')('HD CONFIRM — winner arm at HD budget', () => {
    const winKey = process.env.PF_DSFLANK_WIN ?? 'ANISO';
    plog(`=== HD CONFIRM ${winKey} budget=${HD_MAX_POINTS} → ${HD} ===`);
    const arm = SCREEN_ARMS.find((a) => a.key === winKey) ?? SCREEN_ARMS[1];
    if (keyExists(HD, arm.key)) { plog(`[skip hd] ${arm.key}`); return; }
    const ruler = buildConformRuler(dsRadiusFn());
    const { ut, idx, constraint, buildS, cpuS } = buildMesh(arm, HD_MAX_POINTS);
    plog(`[HD ${arm.key}] meshed ${idx.length / 3} tris in ${buildS.toFixed(1)}s (cpu ${cpuS.toFixed(1)}s)`);
    append(HD, scoreArm(arm, ut, idx, buildS, cpuS, constraint, HD_MAX_POINTS, ruler));
  }, 240 * 60 * 1000);
});
