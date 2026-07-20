// _dsRingStrips.test.ts — E-2026-07-19-DS-CONVERGE-A (the UNIFIED structured ring-strip close).
//
// QUESTION (audit-first): does the CONVERGE-A structured ring-strip emitter (src tierC/dsRingStrips.ts — a
// watertight-by-construction cylinder grid: along-ring rows + across-ring columns + a double-valued tread pair at
// each t=k/8) close the DragonScales ring composite to the 0.01mm true-3D standard, where BOTH free-Delaunay levers
// FLOORED — S2's constraint-ring TREAD (recovery-gapped, max 0.266) and B's aniso FLANK (convergence floor 0.102)?
//
// WHY the structured strip is the untested mechanism (both prior verdicts named it): guaranteed connectivity
// REPLACES recovery (S2's subdivFailNonCollinear ~1094 gap disappears — the tread quad is EXPLICITLY emitted, never
// recovered) and the explicit across-ring columns give the along-flank resolution B's chord guard split the WRONG
// axis for. The tread is a doubled row at t=k/8 -/+ dtHalf (lower lifts r-, upper lifts r+ — the one-sided-limit weld
// studied read-only from src/geometry/doubleValued), so the quad between IS the near-vertical tread face.
//
// INSTRUMENT (IDENTICAL to S2/B ⇒ directly comparable): the CERTIFIED V11g composite ruler (_ds_prodtruth_lib
// buildConformRuler = radial sheet twin 2048x3072 ∪ riser wall, z-gated). Ring band = classifyRingBand (centroid
// ≤1mm of a ring), decomposed TREAD (|dz|<0.05mm, ALL scored) vs FLANK (0.05-1mm, worst-cap by radial). BODY =
// perFaceTrue3DSag witness. Slivers by minAngle; watertight by auditNonManByIndex (BY INDEX — the strip welds its
// u-seam by index, so nonMan MUST be 0 by construction; this is the non-vacuous check that it truly is).
//
// KILL-CRITERION (pre-registered, committed BEFORE measuring):
//   CLOSED iff STRIPS ring composite MAX ≤ 0.01 AND p99 ≤ 0.01, decomposed TREAD max ≤ 0.01 AND FLANK max ≤ 0.01,
//     AND whole-mesh nonMan = 0, AND body no-regress (bodyWit p99 ≤ ~0.012 — B's banked 0.0112). Report tri/CPU cost.
//   WALL otherwise: name the residual mechanism (which of tread / flank / body still floors + why the structured
//     strip does not fully close it), like S2/B. Do NOT force a claim.
//
// BEFORE (banked, SAME ruler): OFF region kernel ring composite ~0.30 / TREAD 0.266 / FLANK 0.343 (E-DS-RISER-CLOSE);
//   aniso (B, d23b8cbe) FLANK 0.102 floor / body p99 0.0112.
//
// DEV-ONLY; research/ only; imports src READ-ONLY (buildDsRingStripWallGeometric + buildDsRingTSchedule). Every arm
// is a keyExists-guarded checkpointed unit ⇒ a killed run RESUMES by re-running only the unfinished arm.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpuUsage } from 'node:process';
import { triangleQualityDistribution, auditNonManByIndex, perFaceTrue3DSag } from './labkit';
import {
  buildConformRuler, dragonRings, classifyRingBand, dsRadiusFn,
  radialBoundAt, DENSE, H as DS_H, TOL,
} from './_ds_prodtruth_lib';
import {
  buildDsRingStripWall, buildDsRingTSchedule, type DsTScheduleOpts,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/dsRingStrips';

const BAND_MM = 1.0;             // ring-band width (E-DS-INTERIOR-CLOSE convention).
const C0_MM = 0.012;             // |dz|<C0 ⇒ the actual double-tread QUAD (the C0 step itself), scored in full.
const FLANK_CAP = process.env.PF_DSRS_FLANKCAP ? parseInt(process.env.PF_DSRS_FLANKCAP, 10) : 8000;

const OUT_DIR = join('research', 'exchange', '_dsRingStrips');
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

interface Arm { key: string; nU: number; sched: DsTScheduleOpts; note: string; }

/** DENSE-bary composite distance of facet f (max over the 45-pt lattice). */
function compOf(xyz: Float32Array, idx: Uint32Array, f: number, ruler: ReturnType<typeof buildConformRuler>): number {
  const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2]; let d = 0;
  for (const [wa, wb, wc] of DENSE) {
    const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
    const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
    const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
    const dd = ruler.dist(px, py, pz); if (dd > d) d = dd;
  }
  return d;
}
/** Sound radial upper bound of facet f (max over the 45-pt lattice) — the cheap worst-cap key. */
function radOf(xyz: Float32Array, idx: Uint32Array, f: number, rA: (t: number, z: number) => number): number {
  const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2]; let m = 0;
  for (const [wa, wb, wc] of DENSE) {
    const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
    const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
    const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
    const d = radialBoundAt(rA, px, py, pz); if (d > m) m = d;
  }
  return m;
}
/** |dz| of facet f's centroid to the nearest interior ring. */
function dzOf(xyz: Float32Array, idx: Uint32Array, f: number): number {
  const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
  const zc = (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3;
  let bd = 1e9; for (let k = 1; k <= 7; k++) { const d = Math.abs(zc - (k / 8) * DS_H); if (d < bd) bd = d; } return bd;
}

function scoreArm(arm: Arm, out: 'SCREEN' | 'HD'): Record<string, unknown> {
  const rA = dsRadiusFn();
  const t0 = Date.now(); const cpu0 = cpuUsage();
  const tRows = buildDsRingTSchedule(DS_H, arm.sched);
  const wall = buildDsRingStripWall(rA, DS_H, arm.nU, tRows);
  const cpu = cpuUsage(cpu0);
  const buildS = (Date.now() - t0) / 1000, cpuS = (cpu.user + cpu.system) / 1e6;
  const xyz = wall.vertices, idx = wall.indices, tris = idx.length / 3;
  plog(`[${arm.key}][${out}] nU=${arm.nU} rows=${tRows.length} tris=${tris} verts=${xyz.length / 3} build=${buildS.toFixed(1)}s cpu=${cpuS.toFixed(1)}s`);

  const ruler = buildConformRuler(rA);
  const ringZs = dragonRings().map((r) => r.z);
  const cls = classifyRingBand(xyz, idx, ringZs, BAND_MM);

  // Partition: C0 QUAD = ring-band ∩ |dz|<0.012mm (the double-valued tread step — scored in FULL, SOUND: radial is
  // NOT a valid cap key on the wall, where it saturates at the ~1mm jump regardless of composite). FLANK = ring-band ∩
  // 0.012≤|dz|<1mm (capped by radial — the established _dsFlankAniso instrument; off the wall radial ≥ composite is a
  // useful selector). BODY = everything else (witness). NOTE for S2-comparability: S2/B's "TREAD |dz|<0.05" ⊇ this C0
  // (0.012) plus the inner FLANK (0.012-0.05); the C0 is the tightest, most-load-bearing sub-band.
  const c0F: number[] = [], flankF: number[] = [], bodyF: number[] = [];
  for (let f = 0; f < tris; f++) {
    if (cls(f) === 'ringBand') { (dzOf(xyz, idx, f) < C0_MM ? c0F : flankF).push(f); }
    else bodyF.push(f);
  }

  // Helper: score a facet list vs the composite, return {f,d}[] sorted DESC + derived stats. Distances are KEPT so the
  // worst-12 dump reuses them (never re-score — the earlier re-scoring of ALL tread facets was the throughput killer).
  const scoreList = (fs: number[]): { fd: { f: number; d: number }[]; max: number; p99: number; out: number } => {
    const fd = fs.map((f) => ({ f, d: compOf(xyz, idx, f, ruler) })).sort((x, y) => y.d - x.d);
    let out = 0; for (const o of fd) if (o.d > TOL) out++;
    return { fd, max: fd.length ? +fd[0].d.toFixed(6) : 0, p99: fd.length ? +fd[Math.floor(0.01 * fd.length)].d.toFixed(6) : 0, out };
  };

  // C0 QUAD (dz<0.012mm — the actual double-valued tread step): score ALL (few) — the mechanism headline: does the
  // structured double-valued strip close the ~1mm C0 step S2's recovery could not?
  const tC = Date.now();
  const c0 = scoreList(c0F);
  const c0Max = c0.max, c0P99 = c0.p99, c0Out = c0.out;
  plog(`[${arm.key}][C0 quad all ${c0F.length}] max=${c0Max} p99=${c0P99} out=${c0Out} in ${((Date.now() - tC) / 1000).toFixed(0)}s`);

  // FLANK: cap to worst-FLANK_CAP by radial (radial ≥ sheet ≥ composite ⇒ SOUND for MAX + the PASS).
  const tF = Date.now();
  const flankCap = flankF.map((f) => ({ f, r: radOf(xyz, idx, f, rA) })).sort((x, y) => y.r - x.r).slice(0, FLANK_CAP).map((o) => o.f);
  const flank = scoreList(flankCap);
  const flankMax = flank.max, flankP99 = flank.p99, flankOut = flank.out;
  plog(`[${arm.key}][FLANK worst-${flankCap.length}/${flankF.length}] max=${flankMax} p99=${flankP99} out≥${flankOut} in ${((Date.now() - tF) / 1000).toFixed(0)}s`);

  // RING COMPOSITE = C0 ∪ flank (the exit metric). MAX = max(c0,flank); combined p99 over the scored set.
  const ringAll = c0.fd.concat(flank.fd).map((o) => o.d).sort((x, y) => y - x);
  const ringMax = ringAll.length ? +ringAll[0].toFixed(6) : 0;
  const ringP99 = ringAll.length ? +ringAll[Math.floor(0.01 * ringAll.length)].toFixed(6) : 0;

  // Worst-12 ring facet dump (where does the residual live?) — REUSES the already-scored sets (no re-score).
  const worst = c0.fd.concat(flank.fd).sort((x, y) => y.d - x.d).slice(0, 12);
  for (const w of worst) {
    const a = idx[3 * w.f]; const uu = wall.ut[2 * a], tt = wall.ut[2 * a + 1];
    plog(`  [${arm.key}] d=${w.d.toFixed(4)} u=${uu.toFixed(4)} t=${tt.toFixed(5)} dz=${dzOf(xyz, idx, w.f).toFixed(4)}`);
  }

  // BODY witness (perFaceTrue3DSag = facet→nearest radial surface, faithful off-ring).
  const tB = Date.now();
  const sag = perFaceTrue3DSag(wall.ut, idx, rA, DS_H, { preFilterMm: 0.01 });
  const wDevs: number[] = []; let wWorst = 0;
  for (const f of bodyF) { const e = sag.faceErr[f]; wDevs.push(e); if (e > wWorst) wWorst = e; }
  const wSorted = Float64Array.from(wDevs).sort();
  let wOut = 0; for (const e of wDevs) if (e > TOL) wOut++;
  const bodyWitP99 = wSorted.length ? +wSorted[Math.floor(0.99 * wSorted.length)].toFixed(6) : 0;
  plog(`[${arm.key}][BODY wit] max=${wWorst.toFixed(6)} p99=${bodyWitP99} out=${wOut}/${bodyF.length} in ${((Date.now() - tB) / 1000).toFixed(0)}s`);

  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nonMan = auditNonManByIndex(xyz, idx);
  plog(`[${arm.key}] RING composite MAX=${ringMax} p99=${ringP99} | %<20°=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(3)} nonMan=${nonMan}`);

  return {
    key: arm.key, note: arm.note, out, nU: arm.nU, rows: tRows.length, sched: arm.sched,
    tris, verts: xyz.length / 3, buildS: +buildS.toFixed(1), cpuS: +cpuS.toFixed(1),
    ringMax, ringP99,
    c0Max, c0P99, c0Out, c0Facets: c0F.length,
    flankMax, flankP99, flankOut, flankScored: flankCap.length, flankFacets: flankF.length,
    bodyWit_max: +wWorst.toFixed(6), bodyWit_p99: bodyWitP99, bodyWit_out: wOut, bodyFacets: bodyF.length,
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(2),
    nonMan,
  };
}

// SCREEN arms: a clean DENSITY LADDER (nU + t-rows scaled together) to distinguish density-RESPONSIVE (closes at a
// tri cost) from CREASE-FLOORED (a fully-structured uniform-u grid cannot conform to the DS theta-valley + diagonal
// flank-toe creases ⇒ the body/flank MAX floors). Plus a fine-tread arm (dt0.003, flankGrade 1.3) that puts many more
// rows immediately at the tread to probe the C0 + near-tread flank. Valley-aligned nU (multiple of 32).
const SCREEN_ARMS: Arm[] = [
  { key: 'L0|nU512', nU: 512, sched: { treadHalfMm: 0.005, flankReachMm: 1.3, flankRows: 22, flankGrade: 1.4, bodyStepMm: 0.5 }, note: 'ladder coarse (~0.38M)' },
  { key: 'L1|nU1024', nU: 1024, sched: { treadHalfMm: 0.005, flankReachMm: 1.3, flankRows: 26, flankGrade: 1.3, bodyStepMm: 0.3 }, note: 'ladder mid (~1.5M)' },
  { key: 'L2|nU2048', nU: 2048, sched: { treadHalfMm: 0.005, flankReachMm: 1.3, flankRows: 30, flankGrade: 1.25, bodyStepMm: 0.2 }, note: 'ladder fine (~5M) — floor probe' },
  { key: 'FT|nU1024|dt0.003', nU: 1024, sched: { treadHalfMm: 0.003, flankReachMm: 0.6, flankRows: 30, flankGrade: 1.25, bodyStepMm: 0.3 }, note: 'fine-tread: many rows AT the tread + near-flank' },
];

describe('DS RING STRIPS — CONVERGE-A structured close (certified V11g composite ruler)', () => {
  it.skipIf(process.env.PF_DSRINGSTRIPS !== '1')('SCREEN — structured strip wall, tread+flank composite vs banked OFF', () => {
    plog(`=== SCREEN cap=${FLANK_CAP} → ${SCREEN} ===`);
    const only = process.env.PF_DSRS_ARMS?.split(',').map((s) => s.trim()).filter(Boolean);
    const arms = only ? SCREEN_ARMS.filter((a) => only.includes(a.key)) : SCREEN_ARMS;
    for (const arm of arms) {
      if (keyExists(SCREEN, arm.key)) { plog(`[skip] ${arm.key}`); continue; }
      append(SCREEN, scoreArm(arm, 'SCREEN'));
    }
  }, 180 * 60 * 1000);

  // DIAG — is the ~0.013 near-tread ring-composite residual the MESH or the certified-ruler's own near-ring floor?
  // The composite = min(sheet-twin, wall). The wall covers only |z−z_k|<wallEps=0.0005mm; the sheet-twin's near-ring
  // cell is ~0.039mm (nZ=3072 over ~15mm bands). So a near-tread facet in the [0.0005, 0.039]mm GAP is scored against
  // the twin's CHORD of the shoulder — which floors at ~0.013 regardless of mesh density. This DIAG scores the SAME
  // near-tread facets with an INDEPENDENT analytic witness: the facet-plane chord sag vs the TRUE rA at the facet's own
  // dense-bary (u,t) (no BVH, no twin), restricted to SAME-SIDE facets (all 3 verts one side of the ring ⇒ the lift is
  // continuous, no C0-crossing). If that witness is ~0 while the composite reads ~0.013 on the same facets, the mesh is
  // FAITHFUL there and 0.013 is the RULER's near-ring floor (trust the geometry, the metric floored).
  it.skipIf(process.env.PF_DSRINGSTRIPS_DIAG !== '1')('DIAG — near-tread residual: composite vs analytic same-side witness', () => {
    const nU = process.env.PF_DSRS_DIAGNU ? parseInt(process.env.PF_DSRS_DIAGNU, 10) : 2048;
    const rA = dsRadiusFn();
    const tRows = buildDsRingTSchedule(DS_H, { treadHalfMm: 0.005, flankReachMm: 1.3, flankRows: 30, flankGrade: 1.25, bodyStepMm: 0.2 });
    const wall = buildDsRingStripWall(rA, DS_H, nU, tRows);
    const xyz = wall.vertices, idx = wall.indices, tris = idx.length / 3;
    const ringZs = dragonRings().map((r) => r.z);
    const cls = classifyRingBand(xyz, idx, ringZs, BAND_MM);
    plog(`=== DIAG nU=${nU} tris=${tris} ===`);
    // nearest ring z of a facet centroid.
    const nearRingZ = (f: number): number => {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const zc = (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3;
      let bz = 0, bd = 1e9; for (const rz of ringZs) { const d = Math.abs(zc - rz); if (d < bd) { bd = d; bz = rz; } } return bz;
    };
    // analytic facet chord sag: max |true rA point − facet plane| over the dense-bary lattice (facet verts ARE on rA).
    const liftP = (u: number, t: number): [number, number, number] => { const th = 2 * Math.PI * u, z = t * DS_H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const analSag = (f: number): number => {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const A: [number, number, number] = [xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]];
      const B: [number, number, number] = [xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]];
      const C: [number, number, number] = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
      let nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
      let ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
      let nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const ua = wall.ut[2 * a], ta = wall.ut[2 * a + 1], tb = wall.ut[2 * b + 1], tc = wall.ut[2 * c + 1];
      // Unwrap ub/uc onto ua's branch so a seam-straddling facet (u≈0.9995 with u=0) interpolates on the SAME side of
      // the pot — else the bary-midpoint u lands on the opposite side and fabricates a ~2·radius phantom sag.
      const unw = (u: number): number => (u - ua > 0.5 ? u - 1 : u - ua < -0.5 ? u + 1 : u);
      const ub = unw(wall.ut[2 * b]), uc = unw(wall.ut[2 * c]);
      let mx = 0;
      for (const [w0, w1, w2] of DENSE) {
        const p = liftP(w0 * ua + w1 * ub + w2 * uc, w0 * ta + w1 * tb + w2 * tc);
        const d = Math.abs((p[0] - A[0]) * nx + (p[1] - A[1]) * ny + (p[2] - A[2]) * nz); if (d > mx) mx = d;
      }
      return mx;
    };
    const sameSide = (f: number): boolean => {
      const rz = nearRingZ(f); const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const za = xyz[3 * a + 2] - rz, zb = xyz[3 * b + 2] - rz, zc = xyz[3 * c + 2] - rz;
      return (za > 0 && zb > 0 && zc > 0) || (za < 0 && zb < 0 && zc < 0);
    };
    // near-tread ring-band facets (dz<0.012), split same-side (continuous) vs crossing (spans the C0 tread quad).
    let ssMax = 0, ssN = 0, xMax = 0, xN = 0; const ssArr: number[] = [];
    for (let f = 0; f < tris; f++) {
      if (cls(f) !== 'ringBand') continue;
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const zc = (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3;
      if (Math.abs(zc - nearRingZ(f)) >= C0_MM) continue;
      const s = analSag(f);
      if (sameSide(f)) { ssMax = Math.max(ssMax, s); ssArr.push(s); ssN++; } else { xMax = Math.max(xMax, s); xN++; }
    }
    ssArr.sort((x, y) => y - x);
    const ssP99 = ssArr.length ? ssArr[Math.floor(0.01 * ssArr.length)] : 0;
    plog(`[DIAG] near-tread SAME-SIDE (continuous, ${ssN} facets): analytic chord-sag MAX=${ssMax.toFixed(6)} p99=${ssP99.toFixed(6)} — vs composite ~0.0133`);
    plog(`[DIAG] near-tread RING-CROSSING (${xN} facets, the true C0 tread quad): analytic chord-sag MAX=${xMax.toFixed(6)} (spans the ~1mm step — the double-valued wall's own facet)`);
    plog(`[DIAG] VERDICT: if SAME-SIDE analytic MAX ≪ 0.0133 ⇒ the composite's near-tread 0.0133 is the RULER's twin-chord floor (mesh faithful), not the mesh.`);
    append(join(OUT_DIR, 'diag.ndjson'), { key: `DIAG|nU${nU}`, nU, tris, nearTreadSameSideAnalyticMax: +ssMax.toFixed(6), nearTreadSameSideAnalyticP99: +ssP99.toFixed(6), sameSideFacets: ssN, ringCrossingAnalyticMax: +xMax.toFixed(6), ringCrossingFacets: xN });
  }, 60 * 60 * 1000);

  it.skipIf(process.env.PF_DSRINGSTRIPS_HD !== '1')('HD CONFIRM — winner arm at higher density', () => {
    const winKey = process.env.PF_DSRS_WIN ?? 'nU1024|dt0.005|reach1.3';
    const base = SCREEN_ARMS.find((a) => a.key === winKey) ?? SCREEN_ARMS[1];
    // HD: bump nU + flank rows + tighter body.
    const hdNU = process.env.PF_DSRS_HDNU ? parseInt(process.env.PF_DSRS_HDNU, 10) : base.nU * 2;
    const arm: Arm = { key: `HD|${winKey}|nU${hdNU}`, nU: hdNU, sched: { ...base.sched, flankRows: 28, bodyStepMm: 0.35 }, note: `HD confirm of ${winKey}` };
    plog(`=== HD CONFIRM ${arm.key} → ${HD} ===`);
    if (keyExists(HD, arm.key)) { plog(`[skip hd] ${arm.key}`); return; }
    append(HD, scoreArm(arm, 'HD'));
  }, 240 * 60 * 1000);
});
