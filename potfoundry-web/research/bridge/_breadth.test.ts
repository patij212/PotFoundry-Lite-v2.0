// _breadth.test.ts — DEV-ONLY (env PF_BREADTH=1 + per-style sub-gate). TEAM B — BREADTH.
// Does the ArtDeco 3D cliff-conforming breakthrough (E-2026-07-01-SHARP3D-ARTDECO) transfer CLEANLY to the other
// single-valued step/riser styles: DragonScales, GeometricStar, BambooSegments, LowPolyFacet?
//
// RAISED STANDARD: ≤0.01mm chord vs the ACTUAL CLOSED 3D object (connecting bands modeled as real geometry),
// feature/step edges embedded as mesh edges by construction (zero serration), watertight, min-angle > 15°.
//
// STEP-0 inspection (_breadthInspect / _breadthDragonSlope) established:
//   • DragonScales = ArtDeco-class step/riser — 7 TRUE C0 radius-step rings at z=k·15 (t=k/8, θ-INDEPENDENT),
//     two-sided jump 0.88–1.21mm (floor(t·8) stagger flip). ⇒ FULL recipe: tread bands + tread sub-rings.
//   • GeometricStar = in-plane steep-but-finite-slope strapwork creases (smoothstep edge≈0.02); NO z-step. ⇒ dense.
//   • BambooSegments = SMOOTH (Gaussian node ring + sine striations); max Δr < 0.03mm. ⇒ dense structured sheet.
//   • LowPolyFacet = bevel-smoothed polygon facet edges; mild in-plane crease; NO z-step. ⇒ dense.
//
// ISOLATION: research/ only. Reuses labkit + _sharp3dRef/_sharp3dMesh (READ-ONLY imports). Writes ONLY to
// research/exchange/_breadth/<style>/<config-tag>/. Per-style env sub-gate ⇒ resumable; checkpoint each config.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims,
  triangleQualityDistribution, auditNonManByIndex, vertErrColors, dumpRenderBins,
  perFaceTrue3DSag, perFaceTrue3DSagAnchored, bruteAnchoredRedPerp,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStepReference, buildRefLocator, type StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_breadth');
const ckDir = (style: string, tag: string): string => join(ROOT, style, tag);
const ck = (style: string, tag: string, name: string): string => join(ckDir(style, tag), `${name}.json`);
const save = (style: string, tag: string, name: string, obj: unknown): void => { mkdirSync(ckDir(style, tag), { recursive: true }); writeFileSync(ck(style, tag, name), JSON.stringify(obj, null, 2)); };
const has = (style: string, tag: string, name: string): boolean => existsSync(ck(style, tag, name));
const load = (style: string, tag: string, name: string): any => JSON.parse(readFileSync(ck(style, tag, name), 'utf8'));

// ─────────────── shared 3D metric: facet (3 edge-mids + centroid) → nearest point on reference mesh ───────────────
const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
function metric3D(mesh: BuiltMesh, loc: { dist: (x: number, y: number, z: number) => number }): { worst: number; p99: number; p50: number; over01: number; nF: number; faceErr: Float64Array } {
  const { xyz, idx, nF } = mesh;
  const faceErr = new Float64Array(nF);
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let mx = 0;
    for (const [w0, w1, w2] of BARY) {
      const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz;
      const d = loc.dist(px, py, pz); if (d > mx) mx = d;
    }
    faceErr[f] = mx;
  }
  const sorted = Float64Array.from(faceErr).sort();
  let over = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > 0.01) over++;
  return { worst: sorted.length ? sorted[sorted.length - 1] : 0, p99: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))] : 0,
    p50: sorted.length ? sorted[Math.floor(0.5 * sorted.length)] : 0, over01: over, nF, faceErr };
}

// per-facet 3D min-angle (deg)
function minAng(mesh: BuiltMesh, f: number): number {
  const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
  const ax = mesh.xyz[3 * a], ay = mesh.xyz[3 * a + 1], az = mesh.xyz[3 * a + 2];
  const bx = mesh.xyz[3 * b], by = mesh.xyz[3 * b + 1], bz = mesh.xyz[3 * b + 2];
  const cx = mesh.xyz[3 * c], cy = mesh.xyz[3 * c + 1], cz = mesh.xyz[3 * c + 2];
  const la = Math.hypot(bx - cx, by - cy, bz - cz), lb = Math.hypot(cx - ax, cy - ay, cz - az), lc = Math.hypot(ax - bx, ay - by, az - bz);
  if (la < 1e-9 || lb < 1e-9 || lc < 1e-9) return 0;
  const A = Math.acos(Math.max(-1, Math.min(1, (lb * lb + lc * lc - la * la) / (2 * lb * lc))));
  const B = Math.acos(Math.max(-1, Math.min(1, (la * la + lc * lc - lb * lb) / (2 * la * lc))));
  return Math.min(A, B, Math.PI - A - B) * 180 / Math.PI;
}

// DragonScales rings: t=k/8, z=k·15, θ-independent radius steps (measured). up flag = reporting only.
function dragonRings(H: number): StepRing[] {
  const rings: StepRing[] = [];
  for (let k = 1; k < 8; k++) { const t = k / 8; rings.push({ z: t * H, t, up: false }); }
  return rings;
}

// ─────────────── DRAGONSCALES — full step/riser recipe (tread bands + tread sub-rings) ───────────────
describe('BREADTH-DragonScales', () => {
  it.skipIf(process.env.PF_BREADTH !== '1' || process.env.PF_BREADTH_DS !== '1')('DragonScales: closed-3D reference + tread-conforming mesh → 3D/quality/serration/watertight', () => {
    const style = 'DragonScales';
    const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    const rings = dragonRings(DIMS.H);
    const ringZs = rings.map(r => r.z);
    const zEps = 5e-4;

    // FAITHFUL θ-SORTED reference: dense uniform θ (DragonScales' in-plane feature = scale-cell C0 creases, no
    // simple analytic kink loci to pin ⇒ dense uniform θ) + explicit tread bands at the 7 rings.
    const refNTheta = 2880, refNZband = 40;
    const buildRefFor = (nTheta: number, nZband: number) => buildStepReference(rA, DIMS.H, rings, { nTheta, nZperBand: nZband, zEps });
    const ref = buildRefFor(refNTheta, refNZband);
    // VALIDATE ref: on-true-surface points (off rings) must read ~0 vs BVH.
    const loc = buildRefLocator(ref, 3.0);
    let refOnSurf = 0;
    for (let s = 0; s < 400; s++) {
      const th = TAU * Math.random(), z = DIMS.H * (0.03 + 0.94 * Math.random());
      let nearRing = false; for (const rz of ringZs) if (Math.abs(z - rz) < 0.05) nearRing = true; if (nearRing) continue;
      const r = rA(th, z); const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z); if (d > refOnSurf) refOnSurf = d;
    }
    // ADVERSARIAL: BVH == brute on 150 random surface-adjacent points.
    let hashErr = 0;
    for (let s = 0; s < 150; s++) {
      const th = TAU * Math.random(), z = DIMS.H * (0.02 + 0.96 * Math.random());
      const r = rA(th, z) + (Math.random() - 0.5) * 2; const px = r * Math.cos(th), py = r * Math.sin(th), pz = z + (Math.random() - 0.5) * 4;
      const e = Math.abs(loc.dist(px, py, pz) - loc.bruteDist(px, py, pz)); if (e > hashErr) hashErr = e;
    }
    save(style, '_ref', 'meta', { refNTheta, refNZband, nV: ref.nV, nF: ref.nF, rings, refOnSurf, hashErr });

    // build tread-conforming rows: doubled ring rows + tread sub-rings + dense uniform θ.
    const buildRows = (nTh: number, nZband: number, treadSub: number): RowSpec[] => {
      const rows: RowSpec[] = [];
      const sorted = [...rings].sort((a, b) => a.z - b.z);
      const th = (): Float64Array => evenThetas(nTh);
      const pushSheetBand = (z0: number, z1: number, nrows: number): void => { for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); } };
      rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' });
      let cursor = 0;
      for (const ring of sorted) {
        pushSheetBand(cursor, ring.z, nZband);
        const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
        rows.push({ z: ring.z, rz: rzIn, thetas: th(), kind: 'ringBelow' });
        for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
        rows.push({ z: ring.z, rz: rzOut, thetas: th(), kind: 'ringAbove' });
        cursor = ring.z;
      }
      pushSheetBand(cursor, DIMS.H, nZband);
      rows.push({ z: DIMS.H, rz: DIMS.H - zEps, thetas: th(), kind: 'sheet' });
      return rows;
    };

    // ring serration: sample each ring row's true curve at 4× density; nearest to the row's mesh edges.
    const segPtDist = (px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number => {
      const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1;
      let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
      return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy), pz - (az + tt * dz));
    };
    const ringSerration = (mesh: BuiltMesh, rows: RowSpec[]): number => {
      let ser = 0;
      for (let r = 0; r < rows.length; r++) {
        if (rows[r].kind !== 'ringBelow' && rows[r].kind !== 'ringAbove') continue;
        const base = mesh.rowStart[r], n = rows[r].thetas.length, rz = rows[r].rz, z = rows[r].z;
        for (let s = 0; s < n * 2; s++) {
          const th = TAU * (s / (n * 2)); const rr = rA(th, rz); const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
          // nearest edge: columns even ⇒ index c ≈ th/dθ; check a small window around it.
          const c0 = Math.floor((th / TAU) * n); let best = Infinity;
          for (let dc = -1; dc <= 1; dc++) { const c = ((c0 + dc) % n + n) % n; const cn = (c + 1) % n; const va = base + c, vb = base + cn;
            const d = segPtDist(px, py, pz, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]); if (d < best) best = d; }
          if (best > ser) ser = best;
        }
      }
      return ser;
    };

    const measure = (nTh: number, nZ: number, ts: number, tag: string, dump = false): any => {
      const rows = buildRows(nTh, nZ, ts);
      const mesh = buildStructuredWall(rA, DIMS.H, rows);
      const m = metric3D(mesh, loc);
      const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
      const nm = auditNonManByIndex(mesh.xyz, mesh.idx);
      // classify over-tol: sliver vs well-shaped, by tread/sheet
      const rowOf = new Int32Array(mesh.nV); for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf[v] = r;
      const cls = { sliverOver: 0, wellShapedOver: 0, worstWellShaped: 0, tread: 0, nearRing: 0, sheet: 0 };
      for (let f = 0; f < mesh.nF; f++) { if (m.faceErr[f] <= 0.01) continue;
        if (minAng(mesh, f) < 5) cls.sliverOver++; else { cls.wellShapedOver++; if (m.faceErr[f] > cls.worstWellShaped) cls.worstWellShaped = m.faceErr[f]; }
        const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
        const kinds = [rows[rowOf[a]].kind, rows[rowOf[b]].kind, rows[rowOf[c]].kind];
        if (kinds.includes('tread') || (kinds.includes('ringBelow') && kinds.includes('ringAbove'))) cls.tread++;
        else if (kinds.some(k => k === 'ringBelow' || k === 'ringAbove')) cls.nearRing++; else cls.sheet++;
      }
      const ser = ringSerration(mesh, rows);
      // adversarial: brute vs BVH on top-30 worst facet centroids
      const order = Array.from({ length: mesh.nF }, (_, i) => i).sort((x, y) => m.faceErr[y] - m.faceErr[x]).slice(0, 30);
      let advMax = 0;
      for (const f of order) { const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
        const px = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, py = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, pz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
        const e = Math.abs(loc.dist(px, py, pz) - loc.bruteDist(px, py, pz)); if (e > advMax) advMax = e; }
      const rec = { tag, tris: mesh.nF, verts: mesh.nV, worst: m.worst, p99: m.p99, p50: m.p50, over01: m.over01, pctOver01: 100 * m.over01 / mesh.nF,
        minAngle: q.minAngleDeg, pctBelow20: q.pctBelow20, pctBelow10: q.pctBelow10, nonMan: nm, ringSerrMm: ser, advMax, cls };
      save(style, tag, 'rec', rec);
      if (dump) {
        const vertErr = new Float64Array(mesh.nV); for (let f = 0; f < mesh.nF; f++) { const e = m.faceErr[f]; for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * f + k]; if (e > vertErr[v]) vertErr[v] = e; } }
        dumpRenderBins(ckDir(style, tag), `${style}_heatmap`, mesh.xyz, mesh.idx, { colors: vertErrColors(vertErr, 0.01),
          meta: { ruler: 'true3d-reference', label: `${style} tread-conforming — 3D vs closed object (scale 0.01mm)`, worstMm: m.worst, p99Mm: m.p99, pctOver0_01: rec.pctOver01, scaleMm: 0.01 }, stl: true });
      }
      // eslint-disable-next-line no-console
      console.log(`[DS ${tag}] tris=${rec.tris} worst=${rec.worst.toFixed(4)} p99=${rec.p99.toFixed(4)} over01=${rec.over01}(${rec.pctOver01.toFixed(3)}%) minAng=${rec.minAngle.toFixed(1)} %<20=${rec.pctBelow20.toFixed(1)} nonMan=${nm} serr=${ser.toExponential(2)} adv=${advMax.toExponential(1)} | sliverOver=${cls.sliverOver} wsOver=${cls.wellShapedOver} worstWS=${cls.worstWellShaped.toFixed(4)}`);
      return rec;
    };

    const configs: Array<[number, number, number, string, boolean]> = [
      [1440, 30, 9, 'ds_c1440_z30_ts9', false],
      [2160, 44, 12, 'ds_c2160_z44_ts12', true],
    ];
    const results: any[] = [];
    for (const [nTh, nZ, ts, tag, dump] of configs) {
      if (has(style, tag, 'rec')) { results.push(load(style, tag, 'rec')); continue; }
      results.push(measure(nTh, nZ, ts, tag, dump));
    }
    save(style, '_summary', 'summary', { refOnSurf, hashErr, results });
    for (const r of results) expect(r.nonMan).toBe(0);
  }, 1_800_000);
});

// ─────────────── SMOOTH/CREASE styles (no z-step): dense structured mesh, metric = ANALYTIC surface ─────────
// These 3 have NO radius-vs-z discontinuity (STEP-0 inspection) ⇒ the closed 3D object IS the single-valued
// r(θ,z) sheet with NO connecting band. So the HONEST 3D metric is the facet→analytic-surface distance, computed
// WITHOUT a discrete reference mesh (which would impose a density FLOOR and OOM at the required density). We use
// labkit's perFaceTrue3DSagAnchored: fast single-seed GN body + the worst-K red facets brute-anchored via
// bruteNearestOnRadialSurface (full-azimuth analytic scan) — the F2 fix for GN's steep wrong-well overstatement.
// We report BOTH raw-GN (perFaceTrue3DSag) AND the brute-anchored worst-red floor (coordinator's mandate).
function smoothStyleTest(style: string, envSub: string, configs: Array<[number, number, string, boolean]>): void {
  describe(`BREADTH-${style}`, () => {
    it.skipIf(process.env.PF_BREADTH !== '1' || process.env[envSub] !== '1')(`${style}: dense structured mesh vs ANALYTIC surface (raw-GN + brute-anchored) → 3D/quality/watertight`, () => {
      const rA = buildRadiusFn(style as StyleId, {}, DIMS);

      const measure = (nTh: number, nZ: number, tag: string, dump = false): any => {
        const rows: RowSpec[] = [];
        for (let j = 0; j <= nZ; j++) { const z = DIMS.H * (j / nZ); rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' }); }
        const mesh = buildStructuredWall(rA, DIMS.H, rows);
        // RAW-GN true-3D per-face sag (facet→analytic surface, 4 SAG_BARY samples max).
        const gnSag = perFaceTrue3DSag(mesh.ut, mesh.idx, rA, DIMS.H, { preFilterMm: 0.005 });
        const gnSorted = Float64Array.from(gnSag.faceErr).sort();
        const gnP99 = gnSorted[Math.min(gnSorted.length - 1, Math.floor(0.99 * gnSorted.length))];
        const gnP50 = gnSorted[Math.floor(0.5 * gnSorted.length)];
        let gnOver01 = 0; for (let f = 0; f < mesh.nF; f++) if (gnSag.faceErr[f] > 0.01) gnOver01++;
        // BRUTE-ANCHORED worst-red floor (the trusted steep verdict number). redMm low (0.01) so a style whose worst
        // is only a few×0.01 still gets its red set anchored; topK generous.
        const anchored = bruteAnchoredRedPerp(mesh.ut, mesh.idx, rA, DIMS.H, {
          redMm: 0.01, sampleN: 60, coarse: { nTheta: 4096, nZ: 800 }, fine: { nTheta: 12288, nZ: 2400 },
        });
        const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
        const nm = auditNonManByIndex(mesh.xyz, mesh.idx);
        // classify over-tol (by raw-GN, the conservative-high ruler): sliver vs well-shaped
        const cls = { sliverOver: 0, wellShapedOver: 0, worstWellShaped: 0 };
        for (let f = 0; f < mesh.nF; f++) { if (gnSag.faceErr[f] <= 0.01) continue; if (minAng(mesh, f) < 5) cls.sliverOver++; else { cls.wellShapedOver++; if (gnSag.faceErr[f] > cls.worstWellShaped) cls.worstWellShaped = gnSag.faceErr[f]; } }
        const rec = { tag, tris: mesh.nF, verts: mesh.nV, metric: 'analytic-surface',
          gn_worst: gnSag.worstMm, gn_p99: gnP99, gn_p50: gnP50, gn_over01: gnOver01, gn_pctOver01: 100 * gnOver01 / mesh.nF,
          anch_nRed: anchored.nRed, anch_gnP99: anchored.gnP99, anch_trustedP99: anchored.trustedP99, anch_trustedMax: anchored.trustedMax, anch_gnOver: anchored.gnOver,
          minAngle: q.minAngleDeg, pctBelow20: q.pctBelow20, pctBelow10: q.pctBelow10, nonMan: nm, cls };
        save(style, tag, 'rec', rec);
        if (dump) {
          // heatmap coloured by the anchored true-3D ruler (worst-K red facets show TRUE colour); scale 0.01mm.
          const anSag = perFaceTrue3DSagAnchored(mesh.ut, mesh.idx, rA, DIMS.H, { preFilterMm: 0.005, redMm: 0.01, topK: 400, coarse: { nTheta: 4096, nZ: 800 }, fine: { nTheta: 12288, nZ: 2400 } });
          dumpRenderBins(ckDir(style, tag), `${style}_heatmap`, mesh.xyz, mesh.idx, { colors: vertErrColors(anSag.vertErr, 0.01),
            meta: { ruler: 'true3d-anchored', label: `${style} dense structured — true-3D vs analytic surface (anchored, scale 0.01mm)`, worstMm: anSag.worstMm, p99Mm: gnP99, pctOver0_01: rec.gn_pctOver01, scaleMm: 0.01 }, stl: true });
        }
        // eslint-disable-next-line no-console
        console.log(`[${style} ${tag}] tris=${rec.tris} | GN worst=${gnSag.worstMm.toFixed(4)} p99=${gnP99.toFixed(4)} over01=${gnOver01}(${rec.gn_pctOver01.toFixed(3)}%) | ANCHORED nRed=${anchored.nRed} gnP99=${anchored.gnP99.toFixed(4)} trustedP99=${anchored.trustedP99.toFixed(4)} trustedMax=${anchored.trustedMax.toFixed(4)} gnOver=${anchored.gnOver} | minAng=${q.minAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(1)} nonMan=${nm} | sliverOver=${cls.sliverOver} wsOver=${cls.wellShapedOver} worstWS=${cls.worstWellShaped.toFixed(4)}`);
        return rec;
      };
      const results: any[] = [];
      for (const [nTh, nZ, tag, dump] of configs) {
        if (has(style, tag, 'rec')) { results.push(load(style, tag, 'rec')); continue; }
        results.push(measure(nTh, nZ, tag, dump));
      }
      save(style, '_summary', 'summary', { metric: 'analytic-surface (raw-GN + brute-anchored red)', results });
      for (const r of results) expect(r.nonMan).toBe(0);
    }, 1_800_000);
  });
}

smoothStyleTest('BambooSegments', 'PF_BREADTH_BS', [
  [1440, 400, 'bs_c1440_z400', false],
  [2160, 700, 'bs_c2160_z700', true],
]);
smoothStyleTest('GeometricStar', 'PF_BREADTH_GS', [
  [2160, 700, 'gs_c2160_z700', false],
  [3600, 1100, 'gs_c3600_z1100', true],
]);
smoothStyleTest('LowPolyFacet', 'PF_BREADTH_LP', [
  [1440, 400, 'lp_c1440_z400', false],
  [2160, 700, 'lp_c2160_z700', true],
]);
