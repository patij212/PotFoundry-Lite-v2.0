// _sharp3dArtDeco.test.ts — DEV-ONLY (env PF_SHARP3D=1). E-2026-07-01-SHARP3D-ARTDECO.
//
// MANDATE: prove — or find the honest 3D wall — that ArtDeco meshes to ≤0.01mm chord error against the ACTUAL
// CLOSED 3D OBJECT (with the 8 step-tread annular bands explicitly present), every feature/step ring embedded as
// mesh edges BY CONSTRUCTION (zero serration), treads tessellated as first-class 3D surfaces, watertight, good
// quality. This REJECTS the prior "irreducible C0 cliff / exclude / phantom" verdict (E-PERFECT-PIPELINE BLOCK 2),
// whose two faults are corrected here: (1) mesh the tread; (2) score against the closed object, not r(θ,z).
//
// ISOLATION: NEW files only (_sharp3d*). CALLS labkit instruments + the isolated _sharp3dRef/_sharp3dMesh helpers.
// Edits NOTHING in src/ or existing research files. RESILIENCE: env-gated; each stage checkpoints JSON to
// research/exchange/_sharp3d/ the instant computed; re-run SKIPS a completed stage.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims, type AnalyticRadiusFn,
  triangleQualityDistribution, auditNonManByIndex, projectPointToRadialSurface,
  dumpRenderBins, vertErrColors,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { artDecoStepRings, buildStepReference, buildRefLocator, type RefMesh, type StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, thetasWithKinks, conformingThetas, logicalColumnThetas, shearedThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STEP_COUNT = 4; // DEFAULT_ART_DECO.adStepCount
const DIR = join('research', 'exchange', '_sharp3d');
const ck = (name: string): string => join(DIR, `${name}.json`);
const save = (name: string, obj: unknown): void => { mkdirSync(DIR, { recursive: true }); writeFileSync(ck(name), JSON.stringify(obj, null, 2)); };
const load = (name: string): any => JSON.parse(readFileSync(ck(name), 'utf8'));

// ─────────────── shared: sample every export facet at 3 edge-mids + centroid, 3D dist to reference ───────────────
const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
function metric3D(mesh: BuiltMesh, loc: { dist: (x: number, y: number, z: number) => number }): {
  worst: number; p99: number; p50: number; over01: number; nF: number; faceErr: Float64Array;
} {
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
  return {
    worst: sorted.length ? sorted[sorted.length - 1] : 0,
    p99: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))] : 0,
    p50: sorted.length ? sorted[Math.floor(0.5 * sorted.length)] : 0,
    over01: over, nF, faceErr,
  };
}

// ─────────────── HYBRID metric (fast): sheet facets → analytic projector; ring/tread facets → reference BVH ──────
// The projector (projectPointToRadialSurface) is validated (stage1) to agree with the reference-mesh metric to
// <3e-3mm on C1 surface. It is INVALID only near the radius discontinuity (it has no tread in its model). So:
// classify each facet — if any vertex is within `ringGuardMm` (z) of a step ring, use the reference BVH (the
// genuine metric there); else use the fast projector. Cross-checked against the full BVH on the confirm.
function metric3DHybrid(
  mesh: BuiltMesh, loc: { dist: (x: number, y: number, z: number) => number }, rA: AnalyticRadiusFn,
  ringZs: number[], ringGuardMm: number,
): { worst: number; p99: number; p50: number; over01: number; nF: number; faceErr: Float64Array; bvhFacets: number } {
  const { xyz, idx, nF } = mesh;
  const faceErr = new Float64Array(nF);
  let bvhFacets = 0;
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const za = xyz[3 * a + 2], zb = xyz[3 * b + 2], zc = xyz[3 * c + 2];
    // near a ring? (any vertex within guard of a ring z)
    let nearRing = false;
    for (const rz of ringZs) { if (Math.abs(za - rz) < ringGuardMm || Math.abs(zb - rz) < ringGuardMm || Math.abs(zc - rz) < ringGuardMm) { nearRing = true; break; } }
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], bx = xyz[3 * b], by = xyz[3 * b + 1], cx = xyz[3 * c], cy = xyz[3 * c + 1];
    let mx = 0;
    for (const [w0, w1, w2] of BARY) {
      const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * za + w1 * zb + w2 * zc;
      const d = nearRing ? loc.dist(px, py, pz) : projectPointToRadialSurface(px, py, pz, rA).dist;
      if (d > mx) mx = d;
    }
    if (nearRing) bvhFacets++;
    faceErr[f] = mx;
  }
  const sorted = Float64Array.from(faceErr).sort();
  let over = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > 0.01) over++;
  return { worst: sorted.length ? sorted[sorted.length - 1] : 0, p99: sorted.length ? sorted[Math.floor(0.99 * sorted.length)] : 0,
    p50: sorted.length ? sorted[Math.floor(0.5 * sorted.length)] : 0, over01: over, nF, faceErr, bvhFacets };
}

// ─────────────── chevron/fan kink θ-loci for a given row t (analytic) ───────────────
// chevronPhase = θ*chevronFreq + t*TAU*2; |sin| kinks where chevronPhase = mπ.
// fanPhase*0.5 = θ*fanCount*0.5; |cos|^exp cusp where θ*fanCount*0.5 = π/2 + kπ.
function kinkThetas(t: number): number[] {
  const chevronFreq = 6, fanCount = 8;
  const out: number[] = [];
  const phase0 = t * TAU * 2;
  // chevron: θ = (mπ - phase0)/chevronFreq
  for (let m = -20; m <= 40; m++) { const th = (m * Math.PI - phase0) / chevronFreq; if (th >= 0 && th < TAU) out.push(th); }
  // fan: θ = (π/2 + kπ)/(fanCount*0.5) = (π/2+kπ)/4
  for (let k = 0; k < 20; k++) { const th = (Math.PI / 2 + k * Math.PI) / (fanCount * 0.5); if (th >= 0 && th < TAU) out.push(th); }
  return out;
}

// ─────────────── STAGE 1: reference + 3D metric + sanity check ───────────────
describe('E-2026-07-01-SHARP3D-ARTDECO', () => {
  it.skipIf(process.env.PF_SHARP3D !== '1')('stage1: build closed-3D reference + genuine 3D metric + sanity-check', () => {
    const rA = buildRadiusFn('ArtDeco', {}, DIMS);
    const rings = artDecoStepRings(DIMS.H, STEP_COUNT);
    // DENSE reference: fine θ + fine z per band + explicit treads.
    const ref = buildStepReference(rA, DIMS.H, rings, { nTheta: 1440, nZperBand: 40, zEps: 5e-4 });
    save('ref_meta', { nV: ref.nV, nF: ref.nF, rings });
    const loc = buildRefLocator(ref, 3.0);

    // SANITY A: on a SMOOTH style, the reference-mesh 3D metric must AGREE with projectPointToRadialSurface
    // (both measure facet→C1-surface distance where there is no discontinuity). Build a smooth reference +
    // sample a coarse test mesh; compare per-sample.
    const rSmooth = buildRadiusFn('HarmonicRipple', {}, DIMS);
    const smoothRef = buildStepReference(rSmooth, DIMS.H, [], { nTheta: 1440, nZperBand: 200, zEps: 0 });
    const smoothLoc = buildRefLocator(smoothRef, 3.0);
    let maxDiff = 0, sumDiff = 0, n = 0;
    for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
      const th = TAU * (i / 40) + 0.013, z = DIMS.H * ((j + 0.5) / 40);
      // a point OFF the surface: push it outward along the radial by 0.3mm to give both metrics a real distance
      const r = rSmooth(th, z), push = 0.3;
      const px = (r + push) * Math.cos(th), py = (r + push) * Math.sin(th), pz = z;
      const dRef = smoothLoc.dist(px, py, pz);
      const dProj = projectPointToRadialSurface(px, py, pz, rSmooth).dist;
      const diff = Math.abs(dRef - dProj); if (diff > maxDiff) maxDiff = diff; sumDiff += diff; n++;
    }
    const sanity = { maxDiff, meanDiff: sumDiff / n, samples: n };
    save('stage1_sanity', sanity);

    // SANITY B (adversarial): the hashed locator must equal brute-force on 200 random surface-adjacent points.
    let maxHashErr = 0;
    for (let s = 0; s < 200; s++) {
      const th = TAU * Math.random(), z = DIMS.H * (0.02 + 0.96 * Math.random());
      const r = rA(th, z) + (Math.random() - 0.5) * 2;
      const px = r * Math.cos(th), py = r * Math.sin(th), pz = z + (Math.random() - 0.5) * 4;
      const dh = loc.dist(px, py, pz), db = loc.bruteDist(px, py, pz);
      const e = Math.abs(dh - db); if (e > maxHashErr) maxHashErr = e;
    }
    save('stage1_hashcheck', { maxHashErr });

    // BASELINE (reproduce the failure): a structured mesh WITHOUT treads (single-valued rows only, uniform),
    // scored against the reference that HAS treads → should read ~cliff/2.
    const baseRows: RowSpec[] = [];
    const nZ = 200, nTh = 360;
    for (let i = 0; i <= nZ; i++) { const z = DIMS.H * (i / nZ); baseRows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' }); }
    const baseMesh = buildStructuredWall(rA, DIMS.H, baseRows);
    const baseM = metric3D(baseMesh, loc);
    save('stage1_baseline', { tris: baseMesh.nF, worst: baseM.worst, p99: baseM.p99, over01: baseM.over01 });

    // eslint-disable-next-line no-console
    console.log(`[stage1] ref nF=${ref.nF} sanity maxDiff=${sanity.maxDiff.toExponential(2)} hashErr=${maxHashErr.toExponential(2)} baseline(noTread) worst=${baseM.worst.toFixed(3)} p99=${baseM.p99.toFixed(3)} over01=${baseM.over01}`);
    expect(sanity.maxDiff).toBeLessThan(0.005); // metric agrees with projector on smooth C1
    expect(maxHashErr).toBeLessThan(1e-9);      // hash == brute
    // no-tread structured mesh is NOT green vs the closed object (thousands of facets > 0.01mm) — the failure to fix.
    expect(baseM.over01).toBeGreaterThan(1000);
  }, 600_000);

  // ─────────────── STAGE 2: discontinuity-conforming mesh (treads) + adaptive refine to 0.01mm ───────────────
  it.skipIf(process.env.PF_SHARP3D !== '1')('stage2: conforming mesh w/ treads, adaptive refine, measure 3D/quality/serration/watertight', () => {
    const rA = buildRadiusFn('ArtDeco', {}, DIMS);
    const rings = artDecoStepRings(DIMS.H, STEP_COUNT);
    const zEps = 5e-4;
    // reuse the dense reference (rebuild — cheap enough; keep params identical to stage1)
    const ref = buildStepReference(rA, DIMS.H, rings, { nTheta: 1440, nZperBand: 40, zEps });
    const loc = buildRefLocator(ref, 3.0);

    // build rows: doubled ring rows (treads) + sheet bands; θ per row = even + kink columns.
    // nTh = θ density; nZband = sheet rows per band; withKinks toggles θ-conforming at chevron/fan loci.
    const buildRows = (nTh: number, nZband: number, withKinks: boolean): RowSpec[] => {
      const rows: RowSpec[] = [];
      const sorted = [...rings].sort((a, b) => a.z - b.z);
      const thetasFor = (t: number): Float64Array => withKinks ? thetasWithKinks(nTh, kinkThetas(t)) : evenThetas(nTh);
      const pushSheetBand = (z0: number, z1: number, nrows: number): void => {
        for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: thetasFor(z / DIMS.H), kind: 'sheet' }); }
      };
      rows.push({ z: 0, rz: zEps, thetas: thetasFor(0), kind: 'sheet' });
      let cursor = 0;
      for (const ring of sorted) {
        pushSheetBand(cursor, ring.z, nZband);
        rows.push({ z: ring.z, rz: ring.z - zEps, thetas: thetasFor((ring.z - zEps) / DIMS.H), kind: 'ringBelow' });
        rows.push({ z: ring.z, rz: ring.z + zEps, thetas: thetasFor((ring.z + zEps) / DIMS.H), kind: 'ringAbove' });
        cursor = ring.z;
      }
      pushSheetBand(cursor, DIMS.H, nZband);
      rows.push({ z: DIMS.H, rz: DIMS.H - zEps, thetas: thetasFor(1), kind: 'sheet' });
      return rows;
    };

    const measure = (mesh: BuiltMesh, tag: string): any => {
      const m = metric3D(mesh, loc);
      const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
      const nm = auditNonManByIndex(mesh.xyz, mesh.idx);
      const rec = {
        tag, tris: mesh.nF, verts: mesh.nV,
        worst: m.worst, p99: m.p99, p50: m.p50, over01: m.over01,
        minAngle: q.minAngleDeg, p5Angle: q.p5MinAngleDeg, pctBelow20: q.pctBelow20, pctBelow10: q.pctBelow10,
        nonMan: nm,
      };
      return rec;
    };

    // A) conforming, moderate, NO kinks — isolate the tread contribution.
    const mA = buildStructuredWall(rA, DIMS.H, buildRows(720, 20, false));
    const recA = measure(mA, 'conf_noKink_720x20'); save('stage2_A', recA);
    // eslint-disable-next-line no-console
    console.log(`[stage2 A noKink] tris=${recA.tris} worst=${recA.worst.toFixed(4)} p99=${recA.p99.toFixed(4)} over01=${recA.over01} minAng=${recA.minAngle.toFixed(1)} nonMan=${recA.nonMan}`);

    // B) conforming + kink columns (θ-conforming) — should close the chevron/fan straddle tail.
    const mB = buildStructuredWall(rA, DIMS.H, buildRows(720, 20, true));
    const recB = measure(mB, 'conf_kink_720x20'); save('stage2_B', recB);
    // eslint-disable-next-line no-console
    console.log(`[stage2 B +kink] tris=${recB.tris} worst=${recB.worst.toFixed(4)} p99=${recB.p99.toFixed(4)} over01=${recB.over01} minAng=${recB.minAngle.toFixed(1)} nonMan=${recB.nonMan}`);

    save('stage2_summary', { A: recA, B: recB });
    expect(recA.nonMan).toBe(0);
    expect(recB.nonMan).toBe(0);
  }, 600_000);

  // ─────────────── STAGE 3: LOCALIZE the residual (which facets are >0.01mm, and what are they?) ───────────────
  it.skipIf(process.env.PF_SHARP3D !== '1')('stage3: localize the >0.01mm residual of the conforming (noKink) mesh', () => {
    const rA = buildRadiusFn('ArtDeco', {}, DIMS);
    const rings = artDecoStepRings(DIMS.H, STEP_COUNT);
    const zEps = 5e-4;
    const ref = buildStepReference(rA, DIMS.H, rings, { nTheta: 1440, nZperBand: 40, zEps });
    const loc = buildRefLocator(ref, 3.0);

    // rebuild the noKink conforming mesh (deterministic) — need row kinds to classify facets.
    const rows: RowSpec[] = [];
    const sorted = [...rings].sort((a, b) => a.z - b.z);
    const nTh = 720, nZband = 20;
    const pushSheetBand = (z0: number, z1: number, nrows: number): void => {
      for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' }); }
    };
    rows.push({ z: 0, rz: zEps, thetas: evenThetas(nTh), kind: 'sheet' });
    let cursor = 0;
    for (const ring of sorted) {
      pushSheetBand(cursor, ring.z, nZband);
      rows.push({ z: ring.z, rz: ring.z - zEps, thetas: evenThetas(nTh), kind: 'ringBelow' });
      rows.push({ z: ring.z, rz: ring.z + zEps, thetas: evenThetas(nTh), kind: 'ringAbove' });
      cursor = ring.z;
    }
    pushSheetBand(cursor, DIMS.H, nZband);
    rows.push({ z: DIMS.H, rz: DIMS.H - zEps, thetas: evenThetas(nTh), kind: 'sheet' });
    const mesh = buildStructuredWall(rA, DIMS.H, rows);

    // For each row, which row-index it is, and its z. A facet belongs to the band between its lowest and highest
    // row. Classify by: is any incident vertex on a ringBelow/ringAbove row (tread band) → TREAD; else SHEET.
    // vertex→row lookup via rowStart.
    const rowOf = new Int32Array(mesh.nV);
    for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf[v] = r;
    const m = metric3D(mesh, loc);
    const buckets: Record<string, { count: number; worst: number }> = {
      tread: { count: 0, worst: 0 }, sheet: { count: 0, worst: 0 }, nearRing: { count: 0, worst: 0 },
    };
    // gather worst facets for adversarial + 3D localization
    const worstList: Array<{ f: number; err: number; kind: string; z0: number; z1: number; rSpan: [number, number]; cls: string }> = [];
    for (let f = 0; f < mesh.nF; f++) {
      const e = m.faceErr[f]; if (e <= 0.01) continue;
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const ra = rows[rowOf[a]], rb = rows[rowOf[b]], rc = rows[rowOf[c]];
      const kinds = [ra.kind, rb.kind, rc.kind];
      const isTread = (kinds.includes('ringBelow') && kinds.includes('ringAbove'));
      const nearRing = !isTread && kinds.some(k => k === 'ringBelow' || k === 'ringAbove');
      const cls = isTread ? 'tread' : nearRing ? 'nearRing' : 'sheet';
      buckets[cls].count++; if (e > buckets[cls].worst) buckets[cls].worst = e;
      if (worstList.length < 60) {
        const zs = [ra.z, rb.z, rc.z]; const rr = [Math.hypot(mesh.xyz[3 * a], mesh.xyz[3 * a + 1]), Math.hypot(mesh.xyz[3 * b], mesh.xyz[3 * b + 1]), Math.hypot(mesh.xyz[3 * c], mesh.xyz[3 * c + 1])];
        worstList.push({ f, err: e, kind: kinds.join(','), z0: Math.min(...zs), z1: Math.max(...zs), rSpan: [Math.min(...rr), Math.max(...rr)], cls });
      }
    }
    worstList.sort((x, y) => y.err - x.err);

    // ADVERSARIAL: brute-force nearest on the top-30 worst facet centroids — must match hashed metric.
    let maxAdvErr = 0;
    for (const w of worstList.slice(0, 30)) {
      const a = mesh.idx[3 * w.f], b = mesh.idx[3 * w.f + 1], c = mesh.idx[3 * w.f + 2];
      const px = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3;
      const py = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3;
      const pz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
      const dh = loc.dist(px, py, pz), db = loc.bruteDist(px, py, pz);
      if (Math.abs(dh - db) > maxAdvErr) maxAdvErr = Math.abs(dh - db);
    }

    const rec = { tris: mesh.nF, over01: m.over01, worst: m.worst, buckets, top10: worstList.slice(0, 10), maxAdvErr };
    save('stage3_localize', rec);
    // eslint-disable-next-line no-console
    console.log(`[stage3] over01=${m.over01} worst=${m.worst.toFixed(4)} tread=${buckets.tread.count}(${buckets.tread.worst.toFixed(4)}) nearRing=${buckets.nearRing.count}(${buckets.nearRing.worst.toFixed(4)}) sheet=${buckets.sheet.count}(${buckets.sheet.worst.toFixed(4)}) advErr=${maxAdvErr.toExponential(2)}`);
    // eslint-disable-next-line no-console
    console.log(`[stage3] worst facet: err=${worstList[0].err.toFixed(4)} cls=${worstList[0].cls} kinds=[${worstList[0].kind}] z[${worstList[0].z0.toFixed(2)},${worstList[0].z1.toFixed(2)}] rSpan[${worstList[0].rSpan[0].toFixed(2)},${worstList[0].rSpan[1].toFixed(2)}]`);
    expect(maxAdvErr).toBeLessThan(1e-9);
  }, 600_000);

  // ─────────────── STAGE 4: full recipe — tread radial sub-rings (quality) + density (sheet residual) ───────────────
  it.skipIf(process.env.PF_SHARP3D !== '1')('stage4: tread-subdivided conforming mesh — density sweep to 0.01mm, quality + serration + watertight', () => {
    const rA = buildRadiusFn('ArtDeco', {}, DIMS);
    const rings = artDecoStepRings(DIMS.H, STEP_COUNT);
    const zEps = 5e-4;
    const ref = buildStepReference(rA, DIMS.H, rings, { nTheta: 2160, nZperBand: 60, zEps });
    const loc = buildRefLocator(ref, 3.0);

    // Build the conforming mesh with tread radial sub-rings. nTh=θ cols, nZband=sheet rows/band, treadSub=tread
    // radial sub-rings (so tread cells are ~square, not 8-40:1 slivers).
    const buildRows = (nTh: number, nZband: number, treadSub: number): RowSpec[] => {
      const rows: RowSpec[] = [];
      const sorted = [...rings].sort((a, b) => a.z - b.z);
      const th = (): Float64Array => evenThetas(nTh);
      const pushSheetBand = (z0: number, z1: number, nrows: number): void => {
        for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
      };
      rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' });
      let cursor = 0;
      for (const ring of sorted) {
        pushSheetBand(cursor, ring.z, nZband);
        const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
        // 'up' ring: below-radius is the INNER (reduced) boundary, above-radius is OUTER (full). 'down' ring: reversed.
        // Emit the tread as (treadSub+1) sub-rings at the SAME z from the inner boundary to the outer boundary.
        rows.push({ z: ring.z, rz: rzIn, thetas: th(), kind: 'ringBelow' });
        for (let s = 1; s < treadSub; s++) {
          rows.push({ z: ring.z, rz: ring.z, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
        }
        rows.push({ z: ring.z, rz: rzOut, thetas: th(), kind: 'ringAbove' });
        cursor = ring.z;
      }
      pushSheetBand(cursor, DIMS.H, nZband);
      rows.push({ z: DIMS.H, rz: DIMS.H - zEps, thetas: th(), kind: 'sheet' });
      return rows;
    };

    const measure = (mesh: BuiltMesh, tag: string): any => {
      const m = metric3D(mesh, loc);
      const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
      const nm = auditNonManByIndex(mesh.xyz, mesh.idx);
      return { tag, tris: mesh.nF, verts: mesh.nV, worst: m.worst, p99: m.p99, p50: m.p50, over01: m.over01,
        minAngle: q.minAngleDeg, p5Angle: q.p5MinAngleDeg, pctBelow20: q.pctBelow20, pctBelow10: q.pctBelow10, nonMan: nm };
    };

    // density sweep — checkpoint each the instant computed (resilience).
    const configs: Array<[number, number, number, string]> = [
      [720, 20, 9, 'c720_20_ts9'],
      [1440, 40, 9, 'c1440_40_ts9'],
      [2160, 60, 12, 'c2160_60_ts12'],
    ];
    const results: any[] = [];
    for (const [nTh, nZ, ts, tag] of configs) {
      if (existsSync(ck(`stage4_${tag}`))) { results.push(load(`stage4_${tag}`)); continue; }
      const mesh = buildStructuredWall(rA, DIMS.H, buildRows(nTh, nZ, ts));
      const rec = measure(mesh, tag);
      save(`stage4_${tag}`, rec); results.push(rec);
      // eslint-disable-next-line no-console
      console.log(`[stage4 ${tag}] tris=${rec.tris} worst=${rec.worst.toFixed(4)} p99=${rec.p99.toFixed(4)} over01=${rec.over01} minAng=${rec.minAngle.toFixed(1)} %<20=${rec.pctBelow20.toFixed(1)} nonMan=${rec.nonMan}`);
    }
    save('stage4_summary', results);
    for (const r of results) expect(r.nonMan).toBe(0);
  }, 900_000);

  // ─────────────── STAGE 5: FEATURE-CONFORMING (kink columns) + treads — the definitive recipe ───────────────
  // The residual (stage3) is θ chord sag at the chevron |sin| C1 corners (sag ~ LINEAR in facet width ⇒ uniform
  // density stalls, exactly like GothicArches V-ribs). Fix BY CONSTRUCTION: place a mesh column on every chevron
  // kink + fan cusp θ (per row), so each is a chain of mesh edges (zero serration) and no facet straddles a
  // corner. FAITHFUL reference: ALSO kink-conforming (dense) so the ground truth has no kink chord itself.
  it.skipIf(process.env.PF_SHARP3D !== '1')('stage5: conforming-column mesh (kinks+cusps) + treads → 3D/quality/serration/watertight', () => {
    const rA = buildRadiusFn('ArtDeco', {}, DIMS);
    const rings = artDecoStepRings(DIMS.H, STEP_COUNT);
    const zEps = 5e-4;

    // conforming θ generator: kinks/cusps at this row's t, subdivided to targetDth.
    const thetasFor = (targetDth: number) => (rz: number): Float64Array =>
      conformingThetas(kinkThetas(rz / DIMS.H), targetDth);

    // FAITHFUL conforming reference (dense between kinks + kinks pinned ⇒ near-zero reference chord everywhere).
    const refDth = 0.0022; // ~0.0027mm smooth chord; kinks are exact vertices ⇒ ~0 there
    const ref = buildStepReference(rA, DIMS.H, rings, { nTheta: 0, nZperBand: 60, zEps, thetasFor: thetasFor(refDth) });
    save('stage5_ref_meta', { nV: ref.nV, nF: ref.nF, refDth });
    const loc = buildRefLocator(ref, 2.0);

    // export conforming mesh: kink-conforming columns at targetDth + doubled ring rows + tread sub-rings.
    const buildRows = (targetDth: number, nZband: number, treadSub: number): RowSpec[] => {
      const rows: RowSpec[] = [];
      const sorted = [...rings].sort((a, b) => a.z - b.z);
      const th = (rz: number): Float64Array => conformingThetas(kinkThetas(rz / DIMS.H), targetDth);
      const pushSheetBand = (z0: number, z1: number, nrows: number): void => {
        for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: th(z), kind: 'sheet' }); }
      };
      rows.push({ z: 0, rz: zEps, thetas: th(zEps), kind: 'sheet' });
      let cursor = 0;
      for (const ring of sorted) {
        pushSheetBand(cursor, ring.z, nZband);
        const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
        rows.push({ z: ring.z, rz: rzIn, thetas: th(rzIn), kind: 'ringBelow' });
        for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(ring.z), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
        rows.push({ z: ring.z, rz: rzOut, thetas: th(rzOut), kind: 'ringAbove' });
        cursor = ring.z;
      }
      pushSheetBand(cursor, DIMS.H, nZband);
      rows.push({ z: DIMS.H, rz: DIMS.H - zEps, thetas: th(DIMS.H - zEps), kind: 'sheet' });
      return rows;
    };

    const measure = (mesh: BuiltMesh, tag: string): any => {
      const m = metric3D(mesh, loc);
      const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
      const nm = auditNonManByIndex(mesh.xyz, mesh.idx);
      return { tag, tris: mesh.nF, verts: mesh.nV, worst: m.worst, p99: m.p99, p50: m.p50, over01: m.over01,
        minAngle: q.minAngleDeg, p5Angle: q.p5MinAngleDeg, pctBelow20: q.pctBelow20, pctBelow10: q.pctBelow10, nonMan: nm };
    };

    // sweep the export θ-target + z-band density; checkpoint each.
    const configs: Array<[number, number, number, string]> = [
      [0.006, 24, 9, 'cf_dth006_z24_ts9'],
      [0.004, 32, 9, 'cf_dth004_z32_ts9'],
      [0.003, 40, 10, 'cf_dth003_z40_ts10'],
    ];
    const results: any[] = [];
    for (const [dth, nZ, ts, tag] of configs) {
      if (existsSync(ck(`stage5_${tag}`))) { results.push(load(`stage5_${tag}`)); continue; }
      const mesh = buildStructuredWall(rA, DIMS.H, buildRows(dth, nZ, ts));
      const rec = measure(mesh, tag);
      save(`stage5_${tag}`, rec); results.push(rec);
      // eslint-disable-next-line no-console
      console.log(`[stage5 ${tag}] tris=${rec.tris} worst=${rec.worst.toFixed(4)} p99=${rec.p99.toFixed(4)} over01=${rec.over01} minAng=${rec.minAngle.toFixed(1)} %<20=${rec.pctBelow20.toFixed(1)} nonMan=${rec.nonMan}`);
    }
    save('stage5_summary', results);
    for (const r of results) expect(r.nonMan).toBe(0);
  }, 900_000);

  // ─────────────── STAGE 6: DEFINITIVE — optimized locator, right-sized faithful reference, one confirm config ──
  it.skipIf(process.env.PF_SHARP3D !== '1')('stage6: definitive conforming mesh vs faithful conforming reference (optimized)', () => {
    const rA = buildRadiusFn('ArtDeco', {}, DIMS);
    const rings = artDecoStepRings(DIMS.H, STEP_COUNT);
    const zEps = 5e-4;
    // faithful conforming reference: kinks exact (chord 0 there), smooth chord ~0.0016mm @ dth0.004, dense z.
    const refDth = 0.004;
    const t0 = Date.now();
    const ref = buildStepReference(rA, DIMS.H, rings, { nTheta: 0, nZperBand: 50, zEps, thetasFor: (rz) => conformingThetas(kinkThetas(rz / DIMS.H), refDth) });
    const loc = buildRefLocator(ref, 2.0);
    const tRef = Date.now() - t0;
    save('stage6_ref_meta', { nV: ref.nV, nF: ref.nF, refDth, buildMs: tRef });

    const buildRows = (targetDth: number, nZband: number, treadSub: number): RowSpec[] => {
      const rows: RowSpec[] = [];
      const sorted = [...rings].sort((a, b) => a.z - b.z);
      const th = (rz: number): Float64Array => conformingThetas(kinkThetas(rz / DIMS.H), targetDth);
      const pushSheetBand = (z0: number, z1: number, nrows: number): void => {
        for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: th(z), kind: 'sheet' }); }
      };
      rows.push({ z: 0, rz: zEps, thetas: th(zEps), kind: 'sheet' });
      let cursor = 0;
      for (const ring of sorted) {
        pushSheetBand(cursor, ring.z, nZband);
        const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
        rows.push({ z: ring.z, rz: rzIn, thetas: th(rzIn), kind: 'ringBelow' });
        for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(ring.z), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
        rows.push({ z: ring.z, rz: rzOut, thetas: th(rzOut), kind: 'ringAbove' });
        cursor = ring.z;
      }
      pushSheetBand(cursor, DIMS.H, nZband);
      rows.push({ z: DIMS.H, rz: DIMS.H - zEps, thetas: th(DIMS.H - zEps), kind: 'sheet' });
      return rows;
    };

    // ONE moderate confirm config: export dth 0.005 (coarser than ref so ref is faithful), z-band 30, tread sub 9.
    const tag = 'cf_dth005_z30_ts9';
    const tm = Date.now();
    const mesh = buildStructuredWall(rA, DIMS.H, buildRows(0.005, 30, 9));
    const m = metric3D(mesh, loc);
    const tMetric = Date.now() - tm;
    const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
    const nm = auditNonManByIndex(mesh.xyz, mesh.idx);

    // ADVERSARIAL: brute-force on the top-40 worst facet centroids must match the hashed metric to <1e-9.
    const order = Array.from({ length: m.nF }, (_, i) => i).sort((x, y) => m.faceErr[y] - m.faceErr[x]).slice(0, 40);
    let maxAdv = 0;
    for (const f of order) {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const px = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3;
      const py = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3;
      const pz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
      const e = Math.abs(loc.dist(px, py, pz) - loc.bruteDist(px, py, pz)); if (e > maxAdv) maxAdv = e;
    }

    const rec = { tag, tris: mesh.nF, verts: mesh.nV, worst: m.worst, p99: m.p99, p50: m.p50, over01: m.over01,
      minAngle: q.minAngleDeg, p5Angle: q.p5MinAngleDeg, pctBelow20: q.pctBelow20, pctBelow10: q.pctBelow10,
      nonMan: nm, maxAdv, tMetricMs: tMetric, tRefMs: tRef, refTris: ref.nF };
    save('stage6_definitive', rec);
    // eslint-disable-next-line no-console
    console.log(`[stage6] refTris=${ref.nF}(${tRef}ms) meshTris=${rec.tris} metric=${tMetric}ms worst=${rec.worst.toFixed(4)} p99=${rec.p99.toFixed(4)} p50=${rec.p50.toFixed(5)} over01=${rec.over01} minAng=${rec.minAngle.toFixed(1)} %<20=${rec.pctBelow20.toFixed(1)} nonMan=${rec.nonMan} adv=${maxAdv.toExponential(1)}`);
    expect(nm).toBe(0);
    expect(maxAdv).toBeLessThan(1e-9);
  }, 900_000);

  // ─────────────── STAGE 7: LOGICAL-COLUMN conforming (no merge-strip slivers) + localize residual ───────────────
  // stage6 hit p99 0.006 (broad kink chord fixed) but worst 0.078 / over01 7496 / minAngle 0.1° (merge-strip
  // slivers from diagonal kinks). FIX: logical-column strip — every row has the SAME column structure (kink k +
  // j/subPerSeg) ⇒ structured quads (no slivers), kink = diagonal mesh-edge chain. Moderate export density for a
  // fast localize; classify the residual by kind + min-angle (sliver artifact vs genuine geometry).
  it.skipIf(process.env.PF_SHARP3D !== '1')('stage7: logical-column conforming — localize + classify the >0.01mm residual', () => {
    const rA = buildRadiusFn('ArtDeco', {}, DIMS);
    const rings = artDecoStepRings(DIMS.H, STEP_COUNT);
    const zEps = 5e-4;
    // moderate faithful reference (logical-column dense) — smaller for a fast diagnostic.
    const refSub = 22; // sub-samples per kink segment (dense ref: seg ~0.31rad/20segs → ~0.014rad, /22 ~ 6e-4rad)
    const ref = buildStepReference(rA, DIMS.H, rings, { nTheta: 0, nZperBand: 40, zEps, thetasFor: (rz) => logicalColumnThetas(kinkThetas(rz / DIMS.H), refSub) });
    const loc = buildRefLocator(ref, 2.0);
    save('stage7_ref_meta', { nV: ref.nV, nF: ref.nF, refSub });

    const subPerSeg = 8; // export: 8 even samples per kink segment (~0.038rad → smooth chord ~small; kink pinned)
    const nZband = 24, treadSub = 8;
    const rows: RowSpec[] = [];
    const sorted = [...rings].sort((a, b) => a.z - b.z);
    const th = (rz: number): Float64Array => logicalColumnThetas(kinkThetas(rz / DIMS.H), subPerSeg);
    const pushSheetBand = (z0: number, z1: number, nrows: number): void => {
      for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: th(z), kind: 'sheet' }); }
    };
    rows.push({ z: 0, rz: zEps, thetas: th(zEps), kind: 'sheet' });
    let cursor = 0;
    for (const ring of sorted) {
      pushSheetBand(cursor, ring.z, nZband);
      const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
      rows.push({ z: ring.z, rz: rzIn, thetas: th(rzIn), kind: 'ringBelow' });
      for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(ring.z), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
      rows.push({ z: ring.z, rz: rzOut, thetas: th(rzOut), kind: 'ringAbove' });
      cursor = ring.z;
    }
    pushSheetBand(cursor, DIMS.H, nZband);
    rows.push({ z: DIMS.H, rz: DIMS.H - zEps, thetas: th(DIMS.H - zEps), kind: 'sheet' });
    const mesh = buildStructuredWall(rA, DIMS.H, rows);

    // per-facet min angle (deg)
    const minAng = (f: number): number => {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const ax = mesh.xyz[3 * a], ay = mesh.xyz[3 * a + 1], az = mesh.xyz[3 * a + 2];
      const bx = mesh.xyz[3 * b], by = mesh.xyz[3 * b + 1], bz = mesh.xyz[3 * b + 2];
      const cx = mesh.xyz[3 * c], cy = mesh.xyz[3 * c + 1], cz = mesh.xyz[3 * c + 2];
      const la = Math.hypot(bx - cx, by - cy, bz - cz), lb = Math.hypot(cx - ax, cy - ay, cz - az), lc = Math.hypot(ax - bx, ay - by, az - bz);
      if (la < 1e-9 || lb < 1e-9 || lc < 1e-9) return 0;
      const A = Math.acos(Math.max(-1, Math.min(1, (lb * lb + lc * lc - la * la) / (2 * lb * lc))));
      const B = Math.acos(Math.max(-1, Math.min(1, (la * la + lc * lc - lb * lb) / (2 * la * lc))));
      const C = Math.PI - A - B;
      return Math.min(A, B, C) * 180 / Math.PI;
    };
    const rowOf = new Int32Array(mesh.nV);
    for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf[v] = r;

    const m = metric3D(mesh, loc);
    const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
    const nm = auditNonManByIndex(mesh.xyz, mesh.idx);

    // classify over-tol facets: sliver (minAng<5) vs by kind; also over-tol among WELL-SHAPED facets (the honest gap)
    const cls = { sliverOver: 0, tread: 0, nearRing: 0, sheet: 0, wellShapedOver: 0, worstWellShaped: 0 };
    const worst: Array<{ f: number; err: number; ang: number; kinds: string; z: number; r: number }> = [];
    for (let f = 0; f < mesh.nF; f++) {
      const e = m.faceErr[f]; if (e <= 0.01) continue;
      const ang = minAng(f);
      if (ang < 5) cls.sliverOver++;
      else { cls.wellShapedOver++; if (e > cls.worstWellShaped) cls.worstWellShaped = e; }
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const kinds = [rows[rowOf[a]].kind, rows[rowOf[b]].kind, rows[rowOf[c]].kind];
      const isTread = kinds.includes('ringBelow') && kinds.includes('ringAbove') || kinds.includes('tread');
      if (isTread) cls.tread++; else if (kinds.some(k => k === 'ringBelow' || k === 'ringAbove')) cls.nearRing++; else cls.sheet++;
      if (worst.length < 40) { const rr = Math.hypot(mesh.xyz[3 * a], mesh.xyz[3 * a + 1]); worst.push({ f, err: e, ang, kinds: kinds.join(','), z: mesh.xyz[3 * a + 2], r: rr }); }
    }
    worst.sort((x, y) => y.err - x.err);
    const rec = { tris: mesh.nF, verts: mesh.nV, worst: m.worst, p99: m.p99, p50: m.p50, over01: m.over01,
      minAngle: q.minAngleDeg, p5Angle: q.p5MinAngleDeg, pctBelow20: q.pctBelow20, pctBelow10: q.pctBelow10, nonMan: nm, cls, top10: worst.slice(0, 10) };
    save('stage7_localize', rec);
    // eslint-disable-next-line no-console
    console.log(`[stage7] tris=${mesh.nF} worst=${m.worst.toFixed(4)} p99=${m.p99.toFixed(4)} p50=${m.p50.toFixed(5)} over01=${m.over01} minAng=${q.minAngleDeg.toFixed(2)} %<20=${q.pctBelow20.toFixed(1)} nonMan=${nm}`);
    // eslint-disable-next-line no-console
    console.log(`[stage7 cls] sliverOver=${cls.sliverOver} wellShapedOver=${cls.wellShapedOver} worstWellShaped=${cls.worstWellShaped.toFixed(4)} | tread=${cls.tread} nearRing=${cls.nearRing} sheet=${cls.sheet}`);
    // eslint-disable-next-line no-console
    if (worst[0]) console.log(`[stage7 worst] err=${worst[0].err.toFixed(4)} ang=${worst[0].ang.toFixed(2)} kinds=[${worst[0].kinds}] z=${worst[0].z.toFixed(2)} r=${worst[0].r.toFixed(2)}`);
    expect(nm).toBe(0);
  }, 900_000);

  // ─────────────── STAGE 8: SHEARED-φ conforming (chevron = fixed columns, twist-free) — the winning recipe ──────
  // Logical-columns (stage7) TWISTED (kink cyclic order rotates across the θ=0 seam ⇒ self-crossing strips, 4.5mm).
  // FIX: φ = θ + shear·t, shear = 4π/chevronFreq ⇒ chevron kinks are FIXED φ-columns (z-independent, no seam
  // rotation). A φ-grid of nCol = k·(2·chevronFreq) even columns puts a column on EVERY chevron kink (conformed,
  // zero serration) with a clean structured strip; fan cusps are density-convergent (measured sub-linear) so the
  // φ-fill handles them. Treads + tread sub-rings on the same φ-grid. Reference: same sheared φ-grid, dense.
  it.skipIf(process.env.PF_SHARP3D !== '1')('stage8: sheared-φ conforming mesh + treads → 3D/quality/serration/watertight', () => {
    const rA = buildRadiusFn('ArtDeco', {}, DIMS);
    const rings = artDecoStepRings(DIMS.H, STEP_COUNT);
    const zEps = 5e-4;
    const chevronFreq = 6;
    const shear = (4 * Math.PI) / chevronFreq; // = 2π/3

    // faithful sheared reference (dense φ; chevrons are exact columns ⇒ conformed in ground truth too).
    const refCol = 12 * 180; // multiple of 2*chevronFreq=12 ⇒ chevrons pinned; dense φ (dφ ~ 0.0029rad → smooth chord tiny)
    const ref = buildStepReference(rA, DIMS.H, rings, { nTheta: 0, nZperBand: 55, zEps, thetasFor: (rz) => shearedThetas(rz / DIMS.H, refCol, shear) });
    const loc = buildRefLocator(ref, 2.0);
    save('stage8_ref_meta', { nV: ref.nV, nF: ref.nF, refCol });

    const buildRows = (nCol: number, nZband: number, treadSub: number): RowSpec[] => {
      const rows: RowSpec[] = [];
      const sorted = [...rings].sort((a, b) => a.z - b.z);
      const th = (rz: number): Float64Array => shearedThetas(rz / DIMS.H, nCol, shear);
      const pushSheetBand = (z0: number, z1: number, nrows: number): void => {
        for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: th(z), kind: 'sheet' }); }
      };
      rows.push({ z: 0, rz: zEps, thetas: th(zEps), kind: 'sheet' });
      let cursor = 0;
      for (const ring of sorted) {
        pushSheetBand(cursor, ring.z, nZband);
        const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
        rows.push({ z: ring.z, rz: rzIn, thetas: th(rzIn), kind: 'ringBelow' });
        for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(ring.z), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
        rows.push({ z: ring.z, rz: rzOut, thetas: th(rzOut), kind: 'ringAbove' });
        cursor = ring.z;
      }
      pushSheetBand(cursor, DIMS.H, nZband);
      rows.push({ z: DIMS.H, rz: DIMS.H - zEps, thetas: th(DIMS.H - zEps), kind: 'sheet' });
      return rows;
    };

    const rowClassify = (mesh: BuiltMesh, rows: RowSpec[]) => {
      const rowOf = new Int32Array(mesh.nV);
      for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf[v] = r;
      return rowOf;
    };
    const minAng = (mesh: BuiltMesh, f: number): number => {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const ax = mesh.xyz[3 * a], ay = mesh.xyz[3 * a + 1], az = mesh.xyz[3 * a + 2];
      const bx = mesh.xyz[3 * b], by = mesh.xyz[3 * b + 1], bz = mesh.xyz[3 * b + 2];
      const cx = mesh.xyz[3 * c], cy = mesh.xyz[3 * c + 1], cz = mesh.xyz[3 * c + 2];
      const la = Math.hypot(bx - cx, by - cy, bz - cz), lb = Math.hypot(cx - ax, cy - ay, cz - az), lc = Math.hypot(ax - bx, ay - by, az - bz);
      if (la < 1e-9 || lb < 1e-9 || lc < 1e-9) return 0;
      const A = Math.acos(Math.max(-1, Math.min(1, (lb * lb + lc * lc - la * la) / (2 * lb * lc))));
      const B = Math.acos(Math.max(-1, Math.min(1, (la * la + lc * lc - lb * lb) / (2 * la * lc))));
      return Math.min(A, B, Math.PI - A - B) * 180 / Math.PI;
    };

    // balanced quality point (from shear_aspect): φ-width < z-height offsets the shear tilt ⇒ minAngle rises.
    // nCol multiple of 2·chevronFreq(=12) puts a column on every chevron. nZband≈20/tier ⇒ dz≈0.3mm (tall cells).
    const configs: Array<[number, number, number, string]> = [
      [12 * 60, 20, 9, 's8_c720_z20_ts9'],   // dz≈0.3, φ-width 0.42mm ⇒ minAngle target ~24°
      [12 * 80, 24, 10, 's8_c960_z24_ts10'], // finer confirm
    ];
    const results: any[] = [];
    for (const [nCol, nZ, ts, tag] of configs) {
      if (existsSync(ck(`stage8_${tag}`))) { results.push(load(`stage8_${tag}`)); continue; }
      const rows = buildRows(nCol, nZ, ts);
      const mesh = buildStructuredWall(rA, DIMS.H, rows);
      const m = metric3D(mesh, loc);
      const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
      const nm = auditNonManByIndex(mesh.xyz, mesh.idx);
      // classify over-tol: sliver vs well-shaped, and by kind
      const rowOf = rowClassify(mesh, rows);
      const cls = { sliverOver: 0, wellShapedOver: 0, worstWellShaped: 0, tread: 0, nearRing: 0, sheet: 0 };
      for (let f = 0; f < mesh.nF; f++) {
        if (m.faceErr[f] <= 0.01) continue;
        if (minAng(mesh, f) < 5) cls.sliverOver++; else { cls.wellShapedOver++; if (m.faceErr[f] > cls.worstWellShaped) cls.worstWellShaped = m.faceErr[f]; }
        const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
        const kinds = [rows[rowOf[a]].kind, rows[rowOf[b]].kind, rows[rowOf[c]].kind];
        if (kinds.includes('tread') || (kinds.includes('ringBelow') && kinds.includes('ringAbove'))) cls.tread++;
        else if (kinds.some(k => k === 'ringBelow' || k === 'ringAbove')) cls.nearRing++; else cls.sheet++;
      }
      const rec = { tag, tris: mesh.nF, verts: mesh.nV, worst: m.worst, p99: m.p99, p50: m.p50, over01: m.over01,
        minAngle: q.minAngleDeg, p5Angle: q.p5MinAngleDeg, pctBelow20: q.pctBelow20, pctBelow10: q.pctBelow10, nonMan: nm, cls };
      save(`stage8_${tag}`, rec); results.push(rec);
      // eslint-disable-next-line no-console
      console.log(`[stage8 ${tag}] tris=${rec.tris} worst=${rec.worst.toFixed(4)} p99=${rec.p99.toFixed(4)} p50=${rec.p50.toFixed(5)} over01=${rec.over01} minAng=${rec.minAngle.toFixed(1)} %<20=${rec.pctBelow20.toFixed(1)} nonMan=${rec.nonMan} | sliverOver=${cls.sliverOver} wellShapedOver=${cls.wellShapedOver} worstWS=${cls.worstWellShaped.toFixed(4)}`);
    }
    save('stage8_summary', results);
    for (const r of results) expect(r.nonMan).toBe(0);
  }, 900_000);

  // ─────────────── STAGE 9: DEFINITIVE deliverable — sheared-φ mesh, FAST hybrid metric (+full-BVH cross-check),
  //                 serration, adversarial edge-check, quality, watertight, render dump ───────────────
  it.skipIf(process.env.PF_SHARP3D !== '1')('stage9: definitive ArtDeco sharp-3D scorecard (hybrid metric, serration, render)', () => {
    const rA = buildRadiusFn('ArtDeco', {}, DIMS);
    const rings = artDecoStepRings(DIMS.H, STEP_COUNT);
    const ringZs = rings.map(r => r.z);
    const zEps = 5e-4;
    const chevronFreq = 6;
    const shear = (4 * Math.PI) / chevronFreq;

    // faithful sheared reference (only needed for the ring-band BVH; keep moderate so the cross-check is fast).
    const refCol = 12 * 120;
    const ref = buildStepReference(rA, DIMS.H, rings, { nTheta: 0, nZperBand: 50, zEps, thetasFor: (rz) => shearedThetas(rz / DIMS.H, refCol, shear) });
    const loc = buildRefLocator(ref, 2.0);

    const buildRows = (nCol: number, nZband: number, treadSub: number): RowSpec[] => {
      const rows: RowSpec[] = [];
      const sorted = [...rings].sort((a, b) => a.z - b.z);
      const th = (rz: number): Float64Array => shearedThetas(rz / DIMS.H, nCol, shear);
      const pushSheetBand = (z0: number, z1: number, nrows: number): void => {
        for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: th(z), kind: 'sheet' }); }
      };
      rows.push({ z: 0, rz: zEps, thetas: th(zEps), kind: 'sheet' });
      let cursor = 0;
      for (const ring of sorted) {
        pushSheetBand(cursor, ring.z, nZband);
        const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
        rows.push({ z: ring.z, rz: rzIn, thetas: th(rzIn), kind: 'ringBelow' });
        for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(ring.z), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
        rows.push({ z: ring.z, rz: rzOut, thetas: th(rzOut), kind: 'ringAbove' });
        cursor = ring.z;
      }
      pushSheetBand(cursor, DIMS.H, nZband);
      rows.push({ z: DIMS.H, rz: DIMS.H - zEps, thetas: th(DIMS.H - zEps), kind: 'sheet' });
      return rows;
    };

    const nCol = 12 * 80, nZband = 22, treadSub = 10;
    const rows = buildRows(nCol, nZband, treadSub);
    const mesh = buildStructuredWall(rA, DIMS.H, rows);

    // FAST hybrid metric (sheet→projector, ring-band→BVH).
    const mh = metric3DHybrid(mesh, loc, rA, ringZs, 0.25);

    // CROSS-CHECK: full BVH on the ring-band facets vs hybrid there (must agree <1e-9 since both use loc.dist),
    // AND full BVH vs projector on 500 random SHEET facets far from rings (validates the projector branch <5e-3).
    let sheetCheckMax = 0, sc = 0;
    for (let f = 0; f < mesh.nF && sc < 500; f += Math.max(1, Math.floor(mesh.nF / 500))) {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const za = mesh.xyz[3 * a + 2], zb = mesh.xyz[3 * b + 2], zc = mesh.xyz[3 * c + 2];
      let near = false; for (const rz of ringZs) if (Math.abs(za - rz) < 0.6 || Math.abs(zb - rz) < 0.6 || Math.abs(zc - rz) < 0.6) { near = true; break; }
      if (near) continue;
      const px = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, py = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, pz = (za + zb + zc) / 3;
      const dProj = projectPointToRadialSurface(px, py, pz, rA).dist, dBvh = loc.dist(px, py, pz);
      if (Math.abs(dProj - dBvh) > sheetCheckMax) sheetCheckMax = Math.abs(dProj - dBvh); sc++;
    }
    // ADVERSARIAL: brute-force vs hashed BVH on the top-40 worst RING-band facets.
    const order = Array.from({ length: mesh.nF }, (_, i) => i).sort((x, y) => mh.faceErr[y] - mh.faceErr[x]).slice(0, 40);
    let advMax = 0;
    for (const f of order) {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const px = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, py = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, pz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
      const e = Math.abs(loc.dist(px, py, pz) - loc.bruteDist(px, py, pz)); if (e > advMax) advMax = e;
    }

    const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
    const nm = auditNonManByIndex(mesh.xyz, mesh.idx);

    // ── SERRATION: max distance from an analytic feature curve to the nearest MESH EDGE (of that feature's chain).
    // Build an undirected edge set of the mesh (dedup) for the edge-distance queries near features.
    // Step ring serration: sample the ring circle r(θ, z_ring∓zEps) densely; nearest distance to the ring-row
    // polyline edges (consecutive ring-row vertices). Since ring vertices ARE on the curve, this is the polyline
    // chord sag. Chevron serration: sample the chevron 3D line (φ=mπ/6 column) densely in t; nearest mesh edge.
    const segPointDist = (px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number => {
      const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1;
      let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
      const qx = ax + tt * dx, qy = ay + tt * dy, qz = az + tt * dz; return Math.hypot(px - qx, py - qy, pz - qz);
    };
    // ring serration: for each ring row (ringBelow/ringAbove), the row vertices are consecutive by column;
    // sample the true ring curve at fine θ and measure to the nearest row EDGE.
    const rowOf = new Int32Array(mesh.nV);
    for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf[v] = r;
    let ringSerr = 0;
    for (let r = 0; r < rows.length; r++) {
      if (rows[r].kind !== 'ringBelow' && rows[r].kind !== 'ringAbove') continue;
      const base = mesh.rowStart[r], n = rows[r].thetas.length, rz = rows[r].rz, z = rows[r].z;
      // sample the true curve at 4× the vertex density; nearest to the two bracketing row edges
      for (let s = 0; s < n * 4; s++) {
        const th = TAU * (s / (n * 4)) - shear * (rz / DIMS.H); const rr = rA(((th % TAU) + TAU) % TAU, rz);
        const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
        // find nearest vertex-column by matching φ index; check the two adjacent edges
        // (columns are φ-even so index ≈ (φ)/dφ). Cheap: scan a small window.
        let best = Infinity;
        for (let c = 0; c < n; c++) {
          const cn = (c + 1) % n; const va = base + c, vb = base + cn;
          const d = segPointDist(px, py, pz, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]);
          if (d < best) best = d;
        }
        if (best > ringSerr) ringSerr = best;
      }
    }
    // chevron serration: chevron line φ=mπ/6. Its vertices are column c0=m*(nCol/12) on every row (a vertical
    // column in φ). Consecutive (by row) vertices form the chevron mesh-edge chain. Sample the true chevron 3D
    // curve at fine t between rows; nearest to the chain edges.
    let chevSerr = 0;
    for (let mm = 0; mm < 12; mm++) {
      const col = mm * (nCol / 12); // integer since nCol multiple of 12
      // collect this column's vertices in row order
      const chain: number[] = [];
      for (let r = 0; r < rows.length; r++) chain.push(mesh.rowStart[r] + col);
      for (let r = 0; r + 1 < chain.length; r++) {
        const va = chain[r], vb = chain[r + 1];
        // sample true curve between the two rows' t at φ = mπ/6 (θ = φ - shear·t)
        const ta = mesh.xyz[3 * va + 2] / DIMS.H, tb = mesh.xyz[3 * vb + 2] / DIMS.H;
        for (let s = 1; s < 4; s++) {
          const t = ta + (tb - ta) * (s / 4); const phi = (mm * Math.PI) / chevronFreq; let th = phi - shear * t; th = ((th % TAU) + TAU) % TAU;
          const z = t * DIMS.H, rr = rA(th, z); const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
          const d = segPointDist(px, py, pz, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]);
          if (d > chevSerr) chevSerr = d;
        }
      }
    }

    // ── RENDER dump: color by hybrid 3D error at honest scale 0.02mm; STL for inspection.
    const vertErr = new Float64Array(mesh.nV);
    for (let f = 0; f < mesh.nF; f++) { const e = mh.faceErr[f]; for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * f + k]; if (e > vertErr[v]) vertErr[v] = e; } }
    const colors = vertErrColors(vertErr, 0.02);
    const p99 = Float64Array.from(mh.faceErr).sort()[Math.floor(0.99 * mesh.nF)];
    dumpRenderBins(DIR, 'artdeco_sharp3d_after', mesh.xyz, mesh.idx, { colors,
      meta: { ruler: 'true3d-reference', label: 'ArtDeco sheared-φ conforming (treads+chevron) — 3D vs closed object', worstMm: mh.worst, p99Mm: p99, pctOver0_01: 100 * mh.over01 / mesh.nF, scaleMm: 0.02 }, stl: true });

    const rec = {
      tag: `sheared_c${nCol}_z${nZband}_ts${treadSub}`, tris: mesh.nF, verts: mesh.nV, refTris: ref.nF,
      worst: mh.worst, p99, p50: mh.p50, over01: mh.over01, pctOver01: 100 * mh.over01 / mesh.nF, bvhFacets: mh.bvhFacets,
      minAngle: q.minAngleDeg, p5Angle: q.p5MinAngleDeg, pctBelow20: q.pctBelow20, pctBelow10: q.pctBelow10,
      nonMan: nm, ringSerrMm: ringSerr, chevSerrMm: chevSerr, sheetProjVsBvhMax: sheetCheckMax, advMax,
    };
    save('stage9_definitive', rec);
    // eslint-disable-next-line no-console
    console.log(`[stage9] tris=${rec.tris} worst=${rec.worst.toFixed(4)} p99=${p99.toFixed(4)} p50=${rec.p50.toFixed(5)} over01=${rec.over01}(${rec.pctOver01.toFixed(3)}%) minAng=${rec.minAngle.toFixed(1)} %<20=${rec.pctBelow20.toFixed(1)} nonMan=${nm}`);
    // eslint-disable-next-line no-console
    console.log(`[stage9] serration ring=${ringSerr.toExponential(2)} chevron=${chevSerr.toExponential(2)} | sheetProjVsBvh=${sheetCheckMax.toExponential(2)} adv=${advMax.toExponential(2)} bvhFacets=${mh.bvhFacets}`);
    expect(nm).toBe(0);
    expect(advMax).toBeLessThan(1e-9);
    expect(sheetCheckMax).toBeLessThan(5e-3);
  }, 900_000);

  // ─────────────── STAGE 10: DEFINITIVE (FIXED reference) — sheared-φ export vs a θ-SORTED conforming reference ──
  // BUG in stage9: the sheared reference fed φ-ordered (non-θ-sorted) rows to buildStepReference's merge-strip
  // (which advances by θ) ⇒ a broken/gapped reference ⇒ BVH read 0.23 where the true chord is 0.0027 (verified by
  // brute-nearest-on-true-surface). FIX: build the reference with conformingThetas (θ-SORTED + kinks pinned ⇒
  // faithful AND valid merge-strip). Export stays sheared-structured. Cross-check: sheet projector vs this ref BVH
  // must now agree (<5e-3), and a random sample of on-true-surface points must read ~0 against the reference.
  it.skipIf(process.env.PF_SHARP3D !== '1')('stage10: definitive ArtDeco sharp-3D scorecard (fixed θ-sorted reference)', () => {
    const rA = buildRadiusFn('ArtDeco', {}, DIMS);
    const rings = artDecoStepRings(DIMS.H, STEP_COUNT);
    const ringZs = rings.map(r => r.z);
    const zEps = 5e-4;
    const chevronFreq = 6;
    const shear = (4 * Math.PI) / chevronFreq;

    // FAITHFUL θ-SORTED reference: conformingThetas (kinks pinned, sorted) — valid merge-strip + faithful.
    const refDth = 0.0025;
    const ref = buildStepReference(rA, DIMS.H, rings, { nTheta: 0, nZperBand: 55, zEps, thetasFor: (rz) => conformingThetas(kinkThetas(rz / DIMS.H), refDth) });
    const loc = buildRefLocator(ref, 2.0);
    save('stage10_ref_meta', { nV: ref.nV, nF: ref.nF, refDth });

    // VALIDATE the reference: 300 on-true-surface points must read ~0 vs the reference BVH (no gaps/overlaps).
    let refOnSurfMax = 0;
    for (let s = 0; s < 300; s++) {
      const th = TAU * Math.random(), z = DIMS.H * (0.03 + 0.94 * Math.random());
      // avoid landing exactly on a ring z (would legitimately read the tread)
      let nearRing = false; for (const rz of ringZs) if (Math.abs(z - rz) < 0.05) nearRing = true;
      if (nearRing) continue;
      const r = rA(th, z); const px = r * Math.cos(th), py = r * Math.sin(th), pz = z;
      const d = loc.dist(px, py, pz); if (d > refOnSurfMax) refOnSurfMax = d;
    }
    save('stage10_ref_validate', { refOnSurfMax });

    const buildRows = (nCol: number, nZband: number, treadSub: number): RowSpec[] => {
      const rows: RowSpec[] = [];
      const sorted = [...rings].sort((a, b) => a.z - b.z);
      const th = (rz: number): Float64Array => shearedThetas(rz / DIMS.H, nCol, shear);
      const pushSheetBand = (z0: number, z1: number, nrows: number): void => {
        for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: th(z), kind: 'sheet' }); }
      };
      rows.push({ z: 0, rz: zEps, thetas: th(zEps), kind: 'sheet' });
      let cursor = 0;
      for (const ring of sorted) {
        pushSheetBand(cursor, ring.z, nZband);
        const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
        rows.push({ z: ring.z, rz: rzIn, thetas: th(rzIn), kind: 'ringBelow' });
        for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(ring.z), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
        rows.push({ z: ring.z, rz: rzOut, thetas: th(rzOut), kind: 'ringAbove' });
        cursor = ring.z;
      }
      pushSheetBand(cursor, DIMS.H, nZband);
      rows.push({ z: DIMS.H, rz: DIMS.H - zEps, thetas: th(DIMS.H - zEps), kind: 'sheet' });
      return rows;
    };

    const nCol = 12 * 80, nZband = 22, treadSub = 10;
    const rows = buildRows(nCol, nZband, treadSub);
    const mesh = buildStructuredWall(rA, DIMS.H, rows);
    const mh = metric3DHybrid(mesh, loc, rA, ringZs, 0.25);

    // sheet projector vs ref BVH on 500 sheet facets (validate the hybrid's projector branch).
    let sheetCheckMax = 0, sc = 0;
    for (let f = 0; f < mesh.nF && sc < 500; f += Math.max(1, Math.floor(mesh.nF / 500))) {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const za = mesh.xyz[3 * a + 2], zb = mesh.xyz[3 * b + 2], zc = mesh.xyz[3 * c + 2];
      let near = false; for (const rz of ringZs) if (Math.abs(za - rz) < 0.6) near = true;
      if (near) continue;
      const px = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, py = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, pz = (za + zb + zc) / 3;
      const e = Math.abs(projectPointToRadialSurface(px, py, pz, rA).dist - loc.dist(px, py, pz)); if (e > sheetCheckMax) sheetCheckMax = e; sc++;
    }
    // adversarial brute vs hashed on top-40 worst.
    const order = Array.from({ length: mesh.nF }, (_, i) => i).sort((x, y) => mh.faceErr[y] - mh.faceErr[x]).slice(0, 40);
    let advMax = 0;
    for (const f of order) {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const px = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, py = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, pz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
      const e = Math.abs(loc.dist(px, py, pz) - loc.bruteDist(px, py, pz)); if (e > advMax) advMax = e;
    }
    const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
    const nm = auditNonManByIndex(mesh.xyz, mesh.idx);

    // classify over-tol: sliver vs well-shaped; where.
    const minAng = (f: number): number => {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const la = Math.hypot(mesh.xyz[3 * b] - mesh.xyz[3 * c], mesh.xyz[3 * b + 1] - mesh.xyz[3 * c + 1], mesh.xyz[3 * b + 2] - mesh.xyz[3 * c + 2]);
      const lb = Math.hypot(mesh.xyz[3 * c] - mesh.xyz[3 * a], mesh.xyz[3 * c + 1] - mesh.xyz[3 * a + 1], mesh.xyz[3 * c + 2] - mesh.xyz[3 * a + 2]);
      const lc = Math.hypot(mesh.xyz[3 * a] - mesh.xyz[3 * b], mesh.xyz[3 * a + 1] - mesh.xyz[3 * b + 1], mesh.xyz[3 * a + 2] - mesh.xyz[3 * b + 2]);
      if (la < 1e-9 || lb < 1e-9 || lc < 1e-9) return 0;
      const A = Math.acos(Math.max(-1, Math.min(1, (lb * lb + lc * lc - la * la) / (2 * lb * lc))));
      const B = Math.acos(Math.max(-1, Math.min(1, (la * la + lc * lc - lb * lb) / (2 * la * lc))));
      return Math.min(A, B, Math.PI - A - B) * 180 / Math.PI;
    };
    const cls = { sliverOver: 0, wellShapedOver: 0, worstWellShaped: 0 };
    for (let f = 0; f < mesh.nF; f++) { if (mh.faceErr[f] <= 0.01) continue; if (minAng(f) < 5) cls.sliverOver++; else { cls.wellShapedOver++; if (mh.faceErr[f] > cls.worstWellShaped) cls.worstWellShaped = mh.faceErr[f]; } }

    // ring serration (θ-sorted true curve → nearest ring-row edge). windowed scan for speed.
    const rowOf2 = new Int32Array(mesh.nV);
    for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf2[v] = r;
    const segDist = (px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number => {
      const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1;
      let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
      return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy), pz - (az + tt * dz));
    };
    let ringSerr = 0;
    for (let r = 0; r < rows.length; r++) {
      if (rows[r].kind !== 'ringBelow' && rows[r].kind !== 'ringAbove') continue;
      const base = mesh.rowStart[r], n = rows[r].thetas.length, rz = rows[r].rz, z = rows[r].z, tR = rz / DIMS.H;
      for (let s = 0; s < n * 3; s++) {
        // sample true ring curve at φ, θ=φ-shear·t (matches the export column parameterization)
        const phi = TAU * (s / (n * 3)); let th = phi - shear * tR; th = ((th % TAU) + TAU) % TAU; const rr = rA(th, rz);
        const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
        // nearest edge = between columns floor(phi/dphi) and +1 (structured φ)
        const c0 = Math.floor((phi / TAU) * n) % n, c1 = (c0 + 1) % n;
        const d = segDist(px, py, pz, mesh.xyz[3 * (base + c0)], mesh.xyz[3 * (base + c0) + 1], mesh.xyz[3 * (base + c0) + 2], mesh.xyz[3 * (base + c1)], mesh.xyz[3 * (base + c1) + 1], mesh.xyz[3 * (base + c1) + 2]);
        if (d > ringSerr) ringSerr = d;
      }
    }
    // chevron serration (SKIP ring-straddling edges): chevron column m at col=m*(nCol/12); measure only between
    // rows that are NOT a ring pair (a ringBelow→ringAbove edge is a radial tread edge, not the chevron).
    let chevSerr = 0;
    for (let mm = 0; mm < 12; mm++) {
      const col = mm * (nCol / 12);
      for (let r = 0; r + 1 < rows.length; r++) {
        if (rows[r].z === rows[r + 1].z) continue; // same-z pair = tread radial edge, skip
        const va = mesh.rowStart[r] + col, vb = mesh.rowStart[r + 1] + col;
        const ta = rows[r].rz / DIMS.H, tb = rows[r + 1].rz / DIMS.H;
        for (let s = 1; s < 4; s++) {
          const t = ta + (tb - ta) * (s / 4); const phi = (mm * Math.PI) / chevronFreq; let th = phi - shear * t; th = ((th % TAU) + TAU) % TAU;
          const z = t * DIMS.H, rr = rA(th, z); const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
          const d = segDist(px, py, pz, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]);
          if (d > chevSerr) chevSerr = d;
        }
      }
    }

    // render dump (color by hybrid 3D error @ scale 0.02mm).
    const vertErr = new Float64Array(mesh.nV);
    for (let f = 0; f < mesh.nF; f++) { const e = mh.faceErr[f]; for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * f + k]; if (e > vertErr[v]) vertErr[v] = e; } }
    dumpRenderBins(DIR, 'artdeco_sharp3d_final', mesh.xyz, mesh.idx, { colors: vertErrColors(vertErr, 0.02),
      meta: { ruler: 'true3d-reference', label: 'ArtDeco sheared-φ conforming vs closed 3D object', worstMm: mh.worst, p99Mm: mh.p99, pctOver0_01: 100 * mh.over01 / mesh.nF, scaleMm: 0.02 }, stl: true });

    const rec = { tag: `sheared_c${nCol}_z${nZband}_ts${treadSub}`, tris: mesh.nF, verts: mesh.nV, refTris: ref.nF,
      worst: mh.worst, p99: mh.p99, p50: mh.p50, over01: mh.over01, pctOver01: 100 * mh.over01 / mesh.nF, bvhFacets: mh.bvhFacets,
      minAngle: q.minAngleDeg, p5Angle: q.p5MinAngleDeg, pctBelow20: q.pctBelow20, pctBelow10: q.pctBelow10, nonMan: nm,
      cls, ringSerrMm: ringSerr, chevSerrMm: chevSerr, sheetProjVsBvhMax: sheetCheckMax, advMax, refOnSurfMax };
    save('stage10_definitive', rec);
    // eslint-disable-next-line no-console
    console.log(`[stage10] tris=${rec.tris} refValid(onSurf)=${refOnSurfMax.toExponential(2)} worst=${rec.worst.toFixed(4)} p99=${rec.p99.toFixed(4)} p50=${rec.p50.toFixed(5)} over01=${rec.over01}(${rec.pctOver01.toFixed(3)}%)`);
    // eslint-disable-next-line no-console
    console.log(`[stage10] minAng=${rec.minAngle.toFixed(1)} %<20=${rec.pctBelow20.toFixed(1)} nonMan=${nm} sliverOver=${cls.sliverOver} wellShapedOver=${cls.wellShapedOver} worstWS=${cls.worstWellShaped.toFixed(4)}`);
    // eslint-disable-next-line no-console
    console.log(`[stage10] serration ring=${ringSerr.toExponential(2)} chev=${chevSerr.toExponential(2)} sheetProjVsBvh=${sheetCheckMax.toExponential(2)} adv=${advMax.toExponential(2)}`);
    expect(nm).toBe(0);
    expect(advMax).toBeLessThan(1e-9);
  }, 900_000);

  // ─────────────── STAGE 11: FINAL — best-diagonal quality + FAITHFUL reference + sheet/ring-band localization ──
  // stage10: worst 0.039 / p99 0.012 / serration ~0 / watertight — but (a) minAngle 8° (shear tilt, FIXED by the
  // build-time best-diagonal now in buildStructuredWall → ~50°) and (b) refOnSurf 0.0137 (reference too coarse at
  // the fan cusps — taints the ring-band BVH readings). This stage: faithful reference (fine dth) + best-diagonal
  // export + localize the over-tol into sheet(projector, exact) vs ring-band(BVH) to separate a true residual from
  // reference noise.
  it.skipIf(process.env.PF_SHARP3D !== '1')('stage11: FINAL ArtDeco sharp-3D — best-diagonal + faithful ref + localize', () => {
    const rA = buildRadiusFn('ArtDeco', {}, DIMS);
    const rings = artDecoStepRings(DIMS.H, STEP_COUNT);
    const ringZs = rings.map(r => r.z);
    const zEps = 5e-4;
    const chevronFreq = 6;
    const shear = (4 * Math.PI) / chevronFreq;

    // FAITHFUL reference: fine θ-sorted conforming (kinks pinned, dth small ⇒ smooth chord ~0.001) + dense z.
    const refDth = 0.0013;
    const ref = buildStepReference(rA, DIMS.H, rings, { nTheta: 0, nZperBand: 75, zEps, thetasFor: (rz) => conformingThetas(kinkThetas(rz / DIMS.H), refDth) });
    const loc = buildRefLocator(ref, 1.5);
    // validate reference faithfulness on-surface (must be << 0.01).
    let refOnSurfMax = 0;
    for (let s = 0; s < 400; s++) {
      const th = TAU * Math.random(), z = DIMS.H * (0.03 + 0.94 * Math.random());
      let near = false; for (const rz of ringZs) if (Math.abs(z - rz) < 0.05) near = true; if (near) continue;
      const r = rA(th, z); const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z); if (d > refOnSurfMax) refOnSurfMax = d;
    }
    save('stage11_ref', { nV: ref.nV, nF: ref.nF, refDth, refOnSurfMax });

    // export: nCol=960 (12·80, chevrons pinned), nZ=30/tier (best-diagonal → minAngle ~50°), tread sub 10.
    const nCol = 12 * 80, nZband = 30, treadSub = 10;
    const rows: RowSpec[] = [];
    const sorted = [...rings].sort((a, b) => a.z - b.z);
    const th = (rz: number): Float64Array => shearedThetas(rz / DIMS.H, nCol, shear);
    const pushSheetBand = (z0: number, z1: number, nrows: number): void => {
      for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: th(z), kind: 'sheet' }); }
    };
    rows.push({ z: 0, rz: zEps, thetas: th(zEps), kind: 'sheet' });
    let cursor = 0;
    for (const ring of sorted) {
      pushSheetBand(cursor, ring.z, nZband);
      const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
      rows.push({ z: ring.z, rz: rzIn, thetas: th(rzIn), kind: 'ringBelow' });
      for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(ring.z), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
      rows.push({ z: ring.z, rz: rzOut, thetas: th(rzOut), kind: 'ringAbove' });
      cursor = ring.z;
    }
    pushSheetBand(cursor, DIMS.H, nZband);
    rows.push({ z: DIMS.H, rz: DIMS.H - zEps, thetas: th(DIMS.H - zEps), kind: 'sheet' });
    const mesh = buildStructuredWall(rA, DIMS.H, rows);
    const mh = metric3DHybrid(mesh, loc, rA, ringZs, 0.25);

    // localize over-tol into sheet (projector branch, EXACT) vs ring-band (BVH branch, ref-limited).
    const rowOf = new Int32Array(mesh.nV);
    for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf[v] = r;
    const cls = { sheetOver: 0, sheetWorst: 0, ringBandOver: 0, ringBandWorst: 0, sliverOver: 0 };
    const minAng = (f: number): number => {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const la = Math.hypot(mesh.xyz[3 * b] - mesh.xyz[3 * c], mesh.xyz[3 * b + 1] - mesh.xyz[3 * c + 1], mesh.xyz[3 * b + 2] - mesh.xyz[3 * c + 2]);
      const lb = Math.hypot(mesh.xyz[3 * c] - mesh.xyz[3 * a], mesh.xyz[3 * c + 1] - mesh.xyz[3 * a + 1], mesh.xyz[3 * c + 2] - mesh.xyz[3 * a + 2]);
      const lc = Math.hypot(mesh.xyz[3 * a] - mesh.xyz[3 * b], mesh.xyz[3 * a + 1] - mesh.xyz[3 * b + 1], mesh.xyz[3 * a + 2] - mesh.xyz[3 * b + 2]);
      if (la < 1e-9 || lb < 1e-9 || lc < 1e-9) return 0;
      const A = Math.acos(Math.max(-1, Math.min(1, (lb * lb + lc * lc - la * la) / (2 * lb * lc))));
      const B = Math.acos(Math.max(-1, Math.min(1, (la * la + lc * lc - lb * lb) / (2 * la * lc))));
      return Math.min(A, B, Math.PI - A - B) * 180 / Math.PI;
    };
    for (let f = 0; f < mesh.nF; f++) {
      if (mh.faceErr[f] <= 0.01) continue;
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const za = mesh.xyz[3 * a + 2], zb = mesh.xyz[3 * b + 2], zc = mesh.xyz[3 * c + 2];
      let near = false; for (const rz of ringZs) if (Math.abs(za - rz) < 0.25 || Math.abs(zb - rz) < 0.25 || Math.abs(zc - rz) < 0.25) near = true;
      if (near) { cls.ringBandOver++; if (mh.faceErr[f] > cls.ringBandWorst) cls.ringBandWorst = mh.faceErr[f]; }
      else { cls.sheetOver++; if (mh.faceErr[f] > cls.sheetWorst) cls.sheetWorst = mh.faceErr[f]; }
      if (minAng(f) < 5) cls.sliverOver++;
    }

    // serration (ring + chevron, reusing stage10 logic).
    const segDist = (px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number => {
      const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1;
      let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
      return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy), pz - (az + tt * dz));
    };
    let ringSerr = 0;
    for (let r = 0; r < rows.length; r++) {
      if (rows[r].kind !== 'ringBelow' && rows[r].kind !== 'ringAbove') continue;
      const base = mesh.rowStart[r], n = rows[r].thetas.length, rz = rows[r].rz, z = rows[r].z, tR = rz / DIMS.H;
      for (let s = 0; s < n * 3; s++) {
        const phi = TAU * (s / (n * 3)); let thc = phi - shear * tR; thc = ((thc % TAU) + TAU) % TAU; const rr = rA(thc, rz);
        const px = rr * Math.cos(thc), py = rr * Math.sin(thc), pz = z;
        const c0 = Math.floor((phi / TAU) * n) % n, c1 = (c0 + 1) % n;
        const d = segDist(px, py, pz, mesh.xyz[3 * (base + c0)], mesh.xyz[3 * (base + c0) + 1], mesh.xyz[3 * (base + c0) + 2], mesh.xyz[3 * (base + c1)], mesh.xyz[3 * (base + c1) + 1], mesh.xyz[3 * (base + c1) + 2]);
        if (d > ringSerr) ringSerr = d;
      }
    }
    let chevSerr = 0;
    for (let mm = 0; mm < 12; mm++) {
      const col = mm * (nCol / 12);
      for (let r = 0; r + 1 < rows.length; r++) {
        if (rows[r].z === rows[r + 1].z) continue;
        const va = mesh.rowStart[r] + col, vb = mesh.rowStart[r + 1] + col;
        const ta = rows[r].rz / DIMS.H, tb = rows[r + 1].rz / DIMS.H;
        for (let s = 1; s < 4; s++) {
          const t = ta + (tb - ta) * (s / 4); const phi = (mm * Math.PI) / chevronFreq; let thc = phi - shear * t; thc = ((thc % TAU) + TAU) % TAU;
          const z = t * DIMS.H, rr = rA(thc, z); const d = segDist(rr * Math.cos(thc), rr * Math.sin(thc), z, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]);
          if (d > chevSerr) chevSerr = d;
        }
      }
    }

    // adversarial + quality + watertight.
    const order = Array.from({ length: mesh.nF }, (_, i) => i).sort((x, y) => mh.faceErr[y] - mh.faceErr[x]).slice(0, 40);
    let advMax = 0;
    for (const f of order) {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const px = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, py = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, pz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
      const e = Math.abs(loc.dist(px, py, pz) - loc.bruteDist(px, py, pz)); if (e > advMax) advMax = e;
    }
    const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
    const nm = auditNonManByIndex(mesh.xyz, mesh.idx);

    // render.
    const vertErr = new Float64Array(mesh.nV);
    for (let f = 0; f < mesh.nF; f++) { const e = mh.faceErr[f]; for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * f + k]; if (e > vertErr[v]) vertErr[v] = e; } }
    dumpRenderBins(DIR, 'artdeco_sharp3d_final', mesh.xyz, mesh.idx, { colors: vertErrColors(vertErr, 0.02),
      meta: { ruler: 'true3d-reference', label: 'ArtDeco sheared-φ conforming (best-diagonal) vs closed 3D object', worstMm: mh.worst, p99Mm: mh.p99, pctOver0_01: 100 * mh.over01 / mesh.nF, scaleMm: 0.02 }, stl: true });

    const rec = { tag: `final_c${nCol}_z${nZband}_ts${treadSub}`, tris: mesh.nF, verts: mesh.nV, refTris: ref.nF, refOnSurfMax,
      worst: mh.worst, p99: mh.p99, p50: mh.p50, over01: mh.over01, pctOver01: 100 * mh.over01 / mesh.nF, bvhFacets: mh.bvhFacets,
      minAngle: q.minAngleDeg, p5Angle: q.p5MinAngleDeg, pctBelow20: q.pctBelow20, pctBelow10: q.pctBelow10, nonMan: nm,
      cls, ringSerrMm: ringSerr, chevSerrMm: chevSerr, advMax };
    save('stage11_final', rec);
    // eslint-disable-next-line no-console
    console.log(`[stage11] tris=${rec.tris} refOnSurf=${refOnSurfMax.toExponential(2)} worst=${rec.worst.toFixed(4)} p99=${rec.p99.toFixed(4)} p50=${rec.p50.toFixed(5)} over01=${rec.over01}(${rec.pctOver01.toFixed(3)}%)`);
    // eslint-disable-next-line no-console
    console.log(`[stage11] minAng=${rec.minAngle.toFixed(1)} %<20=${rec.pctBelow20.toFixed(1)} nonMan=${nm} | sheetOver=${cls.sheetOver}(worst ${cls.sheetWorst.toFixed(4)}) ringBandOver=${cls.ringBandOver}(worst ${cls.ringBandWorst.toFixed(4)}) sliverOver=${cls.sliverOver}`);
    // eslint-disable-next-line no-console
    console.log(`[stage11] serration ring=${ringSerr.toExponential(2)} chev=${chevSerr.toExponential(2)} adv=${advMax.toExponential(2)}`);
    expect(nm).toBe(0);
    expect(advMax).toBeLessThan(1e-9);
  }, 1_200_000);
});
