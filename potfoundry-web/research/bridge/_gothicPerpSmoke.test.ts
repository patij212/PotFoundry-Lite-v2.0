// _gothicPerpSmoke.test.ts — DEV-ONLY smoke (env PF_GPERP=1). Deciding measurement for the convene hypothesis:
//   On GothicArches RED rib facets (radial per-face worst-sag > 0.1mm), is the PERPENDICULAR-3D deviation CAD-grade
//   (perp p99 < 0.02) while radial p99 > 0.10 → ratio ≥ 5×, AND density-invariant?  vs RIVAL A (genuine defect:
//   perp p99 > 0.10, ratio ≈ 1, perp FALLS under refinement).
//
// CPU-only. One GothicArches mesh at DEFAULT density (~0.3–0.8M). Instruments imported from labkit:
//   perFaceChordSag  = RADIAL same-(u,t) chord (what the legacy heatmap shows)
//   perFaceTrue3DSag = TRUE-3D perpendicular facet→surface (projectPointToRadialSurface — same projector as
//                      perpendicular3DDeviation). Both per-facet, SAME mesh, SAME sample points.
// Controls (all checkpointed to ndjson the instant computed):
//   (1) NON-VACUOUS smooth control (HarmonicRipple): both metrics → ratio ≈ 1 there.
//   (2) REFERENCE-TRUST: the analytic metric projects against the CONTINUOUS rA closure (no band-limited grid), so
//       there is no `__pfReferenceDenseRes` lever; the equivalent trust check is the BRUTE-FORCE twin (dense sampled
//       nearest-surface) on the worst red facets — a denser reference cannot lower perp below the analytic foot.
//   (3) TWIN: brute-force nearest-surface (dense (θ,z) grid + local polish) vs GN foot on worst ~40 red facets.
//       GN's known failure is to OVERSTATE (local minima) ⇒ expect GN ≥ brute; GN < brute ⇒ untrusted (wrong sheet).
//   (4) SHEET-CONSISTENCY: sign of n·(centroid − foot) must be consistent; disqualify wrong-sheet feet.
//   DENSITY-INVARIANCE: rebuild at tighter maxSag (tolMm 0.01→0.005) and re-measure red-facet perp p99 — FALLS or flat?
//
// Run: PF_GPERP=1 npx vitest run research/bridge/_gothicPerpSmoke.test.ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { perFaceChordSag, perFaceTrue3DSag } from './labkit';
import { projectPointToRadialSurface, type AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const OUT = join('research', 'exchange', '_gperp');
const TAU = 2 * Math.PI;

const LEDGER = join(OUT, 'ledger.ndjson');
function ckpt(unit: string, data: Record<string, unknown>): void {
  const row = JSON.stringify({ unit, ts: new Date().toISOString(), ...data });
  appendFileSync(LEDGER, row + '\n');
  // eslint-disable-next-line no-console
  console.log(`[ckpt ${unit}] ${row}`);
}

function pctile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = Float64Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

/** BRUTE-FORCE nearest-surface distance from P to S(θ,z)=(r cosθ, r sinθ, z): dense (θ,z) grid + local refine.
 *  This is the METROLOGIST's densest-cheap-reference — a denser sample cannot make perp smaller than the true foot. */
function bruteNearest(px: number, py: number, pz: number, rA: AnalyticRadiusFn, H: number): { dist: number; th: number; z: number } {
  const d2 = (th: number, z: number): number => {
    const r = rA(th, z); const ex = px - r * Math.cos(th), ey = py - r * Math.sin(th), ez = pz - z; return ex * ex + ey * ey + ez * ez;
  };
  // coarse global grid across the full azimuth + a z-band around P's own z (relief is local in z)
  let best = Infinity, bth = 0, bz = pz;
  const NTH = 2048, NZ = 400, zLo = Math.max(0, pz - 14), zHi = Math.min(H, pz + 14);
  for (let i = 0; i < NTH; i++) {
    const th = (i / NTH) * TAU;
    for (let j = 0; j <= NZ; j++) {
      const z = zLo + (zHi - zLo) * (j / NZ);
      const f = d2(th, z);
      if (f < best) { best = f; bth = th; bz = z; }
    }
  }
  // local golden-ish refine: shrink a box around (bth,bz)
  let hTh = TAU / NTH, hZ = (zHi - zLo) / NZ;
  for (let it = 0; it < 40; it++) {
    let improved = false;
    for (const dth of [-hTh, 0, hTh]) for (const dz of [-hZ, 0, hZ]) {
      const f = d2(bth + dth, bz + dz);
      if (f < best) { best = f; bth += dth; bz += dz; improved = true; }
    }
    if (!improved) { hTh *= 0.5; hZ *= 0.5; }
    if (hTh < 1e-9 && hZ < 1e-9) break;
  }
  return { dist: Math.sqrt(best), th: bth, z: bz };
}

/** Analytic surface normal (unnormalized ok) at (θ,z) via FD of r. */
function surfNormal(th: number, z: number, rA: AnalyticRadiusFn): [number, number, number] {
  const hT = 1e-5, hZ = 1e-4;
  const r = rA(th, z);
  const rT = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
  const rZ = (rA(th, z + hZ) - rA(th, z - hZ)) / (2 * hZ);
  const cs = Math.cos(th), sn = Math.sin(th);
  // S_theta = (rT cs - r sn, rT sn + r cs, 0); S_z = (rZ cs, rZ sn, 1); n = S_theta × S_z
  const Sx = rT * cs - r * sn, Sy = rT * sn + r * cs, Sz = 0;
  const Zx = rZ * cs, Zy = rZ * sn, Zz = 1;
  const nx = Sy * Zz - Sz * Zy, ny = Sz * Zx - Sx * Zz, nz = Sx * Zy - Sy * Zx;
  const L = Math.hypot(nx, ny, nz) || 1;
  return [nx / L, ny / L, nz / L];
}

function buildAndMeasure(style: StyleId, tolMm: number, hMin: number, maxPoints: number):
  { ut: number[]; indices: number[]; rA: AnalyticRadiusFn; radial: ReturnType<typeof perFaceChordSag>; perp: ReturnType<typeof perFaceTrue3DSag>; xyz: Float64Array } {
  const rA = buildRadiusFn(style, {}, DIMS);
  const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
    tolMm, hMin, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints, splitThresh: 1.5, optimizeSweeps: 2,
  });
  const idxArr = Array.from(mesh.indices);
  const radial = perFaceChordSag(mesh.ut, idxArr, rA, DIMS.H);
  const perp = perFaceTrue3DSag(mesh.ut, idxArr, rA, DIMS.H, { preFilterMm: 0.02 });
  // lift for centroids / normals
  const nV = mesh.ut.length / 2;
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const th = TAU * mesh.ut[2 * i], z = mesh.ut[2 * i + 1] * DIMS.H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  return { ut: mesh.ut, indices: idxArr, rA, radial, perp, xyz };
}

/** On the RED subset (radial faceErr > redMm), report radial p99 + perp p99 + ratio + counts. */
function redSubset(radial: ReturnType<typeof perFaceChordSag>, perp: ReturnType<typeof perFaceTrue3DSag>, redMm: number):
  { nRed: number; nTotal: number; radP99: number; radMax: number; perpP99: number; perpMax: number; ratioP99: number } {
  const rad: number[] = [], per: number[] = [];
  const nF = radial.faceErr.length;
  for (let f = 0; f < nF; f++) {
    if (radial.faceErr[f] > redMm) { rad.push(radial.faceErr[f]); per.push(perp.faceErr[f]); }
  }
  const radP99 = pctile(rad, 0.99), perpP99 = pctile(per, 0.99);
  return {
    nRed: rad.length, nTotal: nF, radP99, radMax: rad.length ? Math.max(...rad) : 0,
    perpP99, perpMax: per.length ? Math.max(...per) : 0, ratioP99: perpP99 > 1e-9 ? radP99 / perpP99 : Infinity,
  };
}

describe('GothicArches perp-vs-radial ruler-artifact smoke', () => {
  it.skipIf(process.env.PF_GPERP !== '1')('deciding measurement', () => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(LEDGER, ''); // fresh ledger
    const RED = 0.1; // "red" = radial per-face worst-sag > 0.1mm (the convene definition)

    // ── UNIT 1: GothicArches @ DEFAULT density ─────────────────────────────
    const g = buildAndMeasure('GothicArches' as StyleId, 0.01, 0.05, 500_000);
    const gRed = redSubset(g.radial, g.perp, RED);
    ckpt('gothic_default', { tris: g.indices.length / 3, RED, ...gRed, worstRadialFull: g.radial.worstMm, worstPerpFull: g.perp.worstMm });

    // ── UNIT 2: SMOOTH control (HarmonicRipple) — NON-VACUOUS ───────────────
    const h = buildAndMeasure('HarmonicRipple' as StyleId, 0.01, 0.05, 500_000);
    // On smooth style the "red" set may be tiny; report ratio on the WHOLE mesh top-decile too so it is non-vacuous.
    const hRed = redSubset(h.radial, h.perp, RED);
    // whole-mesh: p99 of radial vs perp across ALL facets (smooth ⇒ should track ≈1)
    const allRad: number[] = Array.from(h.radial.faceErr), allPerp: number[] = Array.from(h.perp.faceErr);
    const hAll = { radP99: pctile(allRad, 0.99), perpP99: pctile(allPerp, 0.99) };
    ckpt('harmonic_control', {
      tris: h.indices.length / 3, RED, nRed: hRed.nRed, redRadP99: hRed.radP99, redPerpP99: hRed.perpP99, redRatioP99: hRed.ratioP99,
      allRadP99: hAll.radP99, allPerpP99: hAll.perpP99, allRatioP99: hAll.perpP99 > 1e-9 ? hAll.radP99 / hAll.perpP99 : Infinity,
    });

    // ── UNIT 3: TWIN brute-force + SHEET-CONSISTENCY on worst ~40 red GothicArches facets ──
    // pick the 40 red facets with the largest radial sag
    const nF = g.radial.faceErr.length;
    const redIdx: number[] = [];
    for (let f = 0; f < nF; f++) if (g.radial.faceErr[f] > RED) redIdx.push(f);
    redIdx.sort((a, b) => g.radial.faceErr[b] - g.radial.faceErr[a]);
    const sample = redIdx.slice(0, Math.min(40, redIdx.length));
    let nDisagree = 0, nWrongSheet = 0, maxGnMinusBrute = -Infinity, maxBruteMinusGn = -Infinity;
    const twinRows: Array<Record<string, number>> = [];
    for (const f of sample) {
      const a = g.indices[3 * f], b = g.indices[3 * f + 1], c = g.indices[3 * f + 2];
      const cx = (g.xyz[3 * a] + g.xyz[3 * b] + g.xyz[3 * c]) / 3;
      const cy = (g.xyz[3 * a + 1] + g.xyz[3 * b + 1] + g.xyz[3 * c + 1]) / 3;
      const cz = (g.xyz[3 * a + 2] + g.xyz[3 * b + 2] + g.xyz[3 * c + 2]) / 3;
      const gn = projectPointToRadialSurface(cx, cy, cz, g.rA);
      const bf = bruteNearest(cx, cy, cz, g.rA, DIMS.H);
      const gnMinusBrute = gn.dist - bf.dist;
      maxGnMinusBrute = Math.max(maxGnMinusBrute, gnMinusBrute);
      maxBruteMinusGn = Math.max(maxBruteMinusGn, -gnMinusBrute);
      // GN should be >= brute within tol (GN overstates). If GN << brute ⇒ wrong sheet.
      if (Math.abs(gnMinusBrute) > 0.01) nDisagree++;
      if (gnMinusBrute < -0.01) nWrongSheet++;
      // SHEET-CONSISTENCY on the GN foot: n·(centroid − foot) sign
      const [nx, ny, nz] = surfNormal(gn.theta, gn.z, g.rA);
      const fx = g.rA(gn.theta, gn.z) * Math.cos(gn.theta), fy = g.rA(gn.theta, gn.z) * Math.sin(gn.theta), fz = gn.z;
      const dot = nx * (cx - fx) + ny * (cy - fy) + nz * (cz - fz);
      twinRows.push({ f, radial: g.radial.faceErr[f], perp: g.perp.faceErr[f], gnDist: gn.dist, bruteDist: bf.dist, gnMinusBrute, sheetDot: dot });
    }
    // sheet-consistency: are the dot signs consistent (all same side)? count minority sign as disqualified
    const pos = twinRows.filter((r) => r.sheetDot > 0).length, neg = twinRows.length - pos;
    const sheetMinority = Math.min(pos, neg);
    ckpt('twin_sheet', {
      nSample: sample.length, nDisagreeGt0p01: nDisagree, nWrongSheet, maxGnMinusBrute, maxBruteMinusGn,
      sheetPos: pos, sheetNeg: neg, sheetMinority,
      // perp p99 on the sampled worst-40 by both projectors (should agree)
      gnP99: pctile(twinRows.map((r) => r.gnDist), 0.99), bruteP99: pctile(twinRows.map((r) => r.bruteDist), 0.99),
    });
    writeFileSync(join(OUT, 'twin_rows.json'), JSON.stringify(twinRows, null, 2));

    // ── UNIT 4: DENSITY-INVARIANCE — rebuild GothicArches at TIGHTER maxSag, re-measure red-facet perp p99 ──
    const g2 = buildAndMeasure('GothicArches' as StyleId, 0.005, 0.03, 800_000);
    const g2Red = redSubset(g2.radial, g2.perp, RED);
    ckpt('gothic_refined', {
      tris: g2.indices.length / 3, RED, ...g2Red,
      // did perp on the red set FALL under refinement? (Skeptic's bet)
      perpP99_default: gRed.perpP99, perpP99_refined: g2Red.perpP99,
      perpP99_fell: g2Red.perpP99 < gRed.perpP99 - 0.005, perpP99_rose: g2Red.perpP99 > gRed.perpP99 + 0.005,
    });

    // ── VERDICT block (recorded, not asserted) ─────────────────────────────
    const confirmed = gRed.perpP99 < 0.02 && gRed.radP99 > 0.10 && gRed.ratioP99 >= 5;
    const killed = gRed.perpP99 >= 0.05 || gRed.ratioP99 < 3 || (g2Red.perpP99 > gRed.perpP99 + 0.005);
    ckpt('verdict', {
      confirmed, killed,
      rule_perpP99_lt_0p02: gRed.perpP99 < 0.02, rule_radP99_gt_0p10: gRed.radP99 > 0.10, rule_ratio_ge_5: gRed.ratioP99 >= 5,
      kill_perpP99_ge_0p05: gRed.perpP99 >= 0.05, kill_ratio_lt_3: gRed.ratioP99 < 3, kill_perp_rose: g2Red.perpP99 > gRed.perpP99 + 0.005,
    });

    expect(g.indices.length).toBeGreaterThan(0);
  }, 40 * 60 * 1000);
});
