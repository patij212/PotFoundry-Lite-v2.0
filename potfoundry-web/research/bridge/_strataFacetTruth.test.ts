// _strataFacetTruth.test.ts — STRATA-001: an INDEPENDENT, TWO-SIDED facet auditor.
// Gated PF_STRATA_FT=1. RESEARCH ONLY. Reads a finished binary STL from disk — it does not import, call or
// otherwise depend on any mesher. That independence is the point: the scorecard's audit ruler and its
// refinement driver are the SAME sampler, so a facet spanning a feature that sampler cannot see is never
// refined AND never flagged. This file is a second opinion sharing no machinery with the first.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THE OLD RULER MEASURES, AND WHY IT CAN READ LOW
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// `sagOfN` samples a FIXED barycentric lattice (n = clamp(ceil(le/0.03mm), 12, 64)) and reports the largest
// distance from an analytic point to the triangle's INFINITE PLANE.
//   (1) NO BOUND. Nothing connects max-over-samples to max-over-the-continuum. The pitch is capped at
//       0.03 mm by n<=64 while the product bar is 0.01 mm, so a feature narrower than the pitch can sit
//       between samples and contribute exactly nothing.
//   (2) PER-TRIANGLE PLANE. It scores an analytic point against the plane of the ONE triangle whose
//       parametric footprint happens to contain it, not against the mesh.
//   (3) SHARED WITH THE DRIVER. Refinement is driven by the same numbers, so an invisible feature is also
//       an unrefined one. The verdict and the thing it judges are not independent.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS MEASURES — both directions, because one alone cannot see the defect
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// H1  MESH -> SURFACE   max over p in the mesh of dist(p, S)   — catches facets bulging OFF the surface.
// H2  SURFACE -> MESH   max over q in S      of dist(q, mesh)  — catches surface the mesh never represents.
//
// H1 ALONE IS BLIND TO THE DEFECT UNDER INVESTIGATION, and that is worth stating plainly: a facet chording
// across a ridge lies near the ridge's BASE, so every point of it has surface a few microns away and H1
// reads ~0 — while the ridge crest is the full relief height from the nearest triangle. An unrepresented
// feature is an H2 defect. Any auditor that reports only H1 reproduces the blind spot it is meant to catch.
//
// H1 IS CERTIFIED. Distance-to-a-set is 1-Lipschitz for ANY set, so sampling a triangle on a barycentric
// lattice of level n bounds the continuum: max over T <= max over lattice + covRad(T)/n. Raise n until the
// bound clears TOL. No feature detector, no per-style envelope, no smoothness assumption. See _facetTruthLib.
//
// H2 IS WITNESSED, NOT CERTIFIED, and is labelled that way everywhere. Each reading is an EXACT 3-D
// point-to-triangle distance (Ericson closest-point over the `buildRefLocator` grid, adversarially equal to
// brute force to ~1e-6) from a real analytic surface point to the real audited mesh — so every exceedance
// it reports is a genuine defect. Sampling is COVERAGE-FIRST then WORST-FIRST: phase A sweeps the entire
// (theta,z) domain on a uniform lattice so nothing can be starved, then phase B spends what is left
// refining cells in priority order, keyed by what each cell could still be hiding (its reading plus a
// cheap rA-only measure of how far the surface departs from its own corner interpolant — which is how a
// feature living BETWEEN query samples still earns refinement). A certified H2 would need interval
// arithmetic on rA; this is a sound LOWER bound on the true H2, which is what is needed to refute a PASS.
//
// A/B is built in: PF_FT_OLDRULER=1 re-implements `sagOfN`'s adaptive plane ruler faithfully and runs it
// over the SAME triangles, so old-vs-new is one run on one mesh with nothing else varying.
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';
import { certifyTriangle, distGlobal, pickLocatorCell, surfaceToMeshMax } from './_facetTruthLib';

const RUN = process.env.PF_STRATA_FT === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const TWO_PI = 2 * Math.PI;

function envF(n: string, d: number): number {
  const r = process.env[n];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}
const envOn = (n: string): boolean => process.env[n] === '1';
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const um = (mm: number): string => (mm * 1000).toFixed(3);

/** Binary STL -> flat Float64Array of 9 coords per triangle. Stored facet normals are ignored. */
function readBinarySTL(path: string): { xyz: Float64Array; nTri: number } {
  const buf = readFileSync(path);
  if (buf.length < 84) throw new Error(`STL too short: ${path}`);
  const nTri = buf.readUInt32LE(80);
  if (buf.length !== 84 + nTri * 50) throw new Error(`STL size mismatch: ${buf.length} != 84 + ${nTri}*50`);
  const xyz = new Float64Array(nTri * 9);
  let o = 84;
  for (let t = 0; t < nTri; t += 1) {
    o += 12;
    for (let k = 0; k < 9; k += 1) { xyz[t * 9 + k] = buf.readFloatLE(o); o += 4; }
    o += 2;
  }
  return { xyz, nTri };
}

describe('STRATA facet truth', () => {
  it.runIf(RUN)('re-audits a finished mesh against the true 3D surface, both directions', () => {
    const stlPath = process.env.PF_FT_STL ?? '';
    const STYLE = process.env.PF_FT_STYLE ?? 'GothicArches';
    const TOL = envF('PF_FT_TOL_UM', 10) / 1000;
    const DO_H1 = process.env.PF_FT_H1 !== '0';
    const DO_H2 = process.env.PF_FT_H2 !== '0';
    const NMAX = Math.round(envF('PF_FT_NMAX', 2048));
    const BUDGET = envF('PF_FT_BUDGET', 8e8);
    const OLD = envOn('PF_FT_OLDRULER');
    const TOPK = Math.round(envF('PF_FT_TOPK', 24));
    // H2 adaptive sampler controls
    const H2BUDGET = envF('PF_FT_H2BUDGET', 1.5e8);         // phase-B refinement budget (phase A is unconditional)
    const H2PITCH = envF('PF_FT_H2PITCH_UM', 40) / 1000;    // phase-A uniform coverage pitch
    const H2MINPITCH = envF('PF_FT_H2MINPITCH_UM', 1.25) / 1000;
    const H2STRUCTN = Math.round(envF('PF_FT_H2STRUCTN', 32));
    const tag = process.env.PF_FT_TAG ?? STYLE;
    if (stlPath === '') throw new Error('PF_FT_STL is required');

    const styleParams: Record<string, number> = { ...registryDefaults(STYLE) };
    if (process.env.PF_FT_PARAMS !== undefined) Object.assign(styleParams, JSON.parse(process.env.PF_FT_PARAMS) as Record<string, number>);
    const rAraw = buildRadiusFn(STYLE as StyleId, styleParams, DIMS);
    let rEvals = 0;
    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
    const rA = (th: number, z: number): number => { rEvals += 1; return rAraw(canon(th), z < 0 ? 0 : z > H ? H : z); };

    const { xyz, nTri } = readBinarySTL(stlPath);
    const t0 = Date.now();
    const locus = (t: number): string => {
      if (t < 0) return 'n/a';
      const o = t * 9;
      const zs = [xyz[o + 2], xyz[o + 5], xyz[o + 8]];
      const ths = [Math.atan2(xyz[o + 1], xyz[o]), Math.atan2(xyz[o + 4], xyz[o + 3]), Math.atan2(xyz[o + 7], xyz[o + 6])];
      const e1 = Math.hypot(xyz[o + 3] - xyz[o], xyz[o + 4] - xyz[o + 1], xyz[o + 5] - xyz[o + 2]);
      const e2 = Math.hypot(xyz[o + 6] - xyz[o + 3], xyz[o + 7] - xyz[o + 4], xyz[o + 8] - xyz[o + 5]);
      const e3 = Math.hypot(xyz[o] - xyz[o + 6], xyz[o + 1] - xyz[o + 7], xyz[o + 2] - xyz[o + 8]);
      return `z=[${zs.map((v) => v.toFixed(3)).join(',')}] th=[${ths.map((v) => v.toFixed(4)).join(',')}] edges(um)=${um(e1)}/${um(e2)}/${um(e3)}`;
    };

    const lines: string[] = ['', `===== STRATA FACET TRUTH: ${STYLE} =====`,
      `stl: ${stlPath}  (${nTri} triangles)`,
      `params ${JSON.stringify(styleParams)}`,
      `TOL ${um(TOL)} um`];

    // ══════════════════ H1 — MESH -> SURFACE, certified 1-Lipschitz bound ══════════════════
    if (DO_H1) {
      let samples = 0; let capped = false;
      let worstUB = 0; let worstUBTri = -1;
      let worstWit = 0; let worstWitTri = -1; let wx = 0; let wy = 0; let wz = 0;
      let nOver = 0; let nUncert = 0;
      const offTri: number[] = []; const offD: number[] = []; const offP: number[] = [];
      for (let t = 0; t < nTri; t += 1) {
        const o = t * 9;
        const v = certifyTriangle(rA,
          xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
          { H, tol: TOL, nMax: NMAX, sampleCap: 4e6 });
        samples += v.samples;
        if (v.bound > worstUB) { worstUB = v.bound; worstUBTri = t; }
        if (v.witnessed > worstWit) { worstWit = v.witnessed; worstWitTri = t; wx = v.px; wy = v.py; wz = v.pz; }
        if (v.witnessed > TOL) {
          nOver += 1;
          if (offTri.length < TOPK * 8) { offTri.push(t); offD.push(v.witnessed); offP.push(v.px, v.py, v.pz); }
        } else if (!v.certified) nUncert += 1;
        if (samples > BUDGET) { capped = true; break; }
      }
      const ord = offD.map((d, i) => [d, i] as [number, number]).sort((p, q) => q[0] - p[0]).slice(0, TOPK);
      const conf = ord.map(([, i]) => {
        const g = distGlobal(rA, H, offP[i * 3], offP[i * 3 + 1], offP[i * 3 + 2]);
        return { tri: offTri[i], fast: offD[i], truth: g.d, th: g.th, z: g.z };
      });
      lines.push('',
        '--- H1  MESH -> SURFACE   (certified: bound = witnessed + covering radius) ---',
        `  ${(samples / 1e6).toFixed(1)}M lattice samples${capped ? '   *** CAPPED ***' : ''}`,
        `  CERTIFIED UPPER BOUND : ${um(worstUB)} um   ${worstUB <= TOL ? 'PASS' : 'NOT CERTIFIED'}`,
        `    bound-locus   ${locus(worstUBTri)}`,
        `  WITNESSED max         : ${um(worstWit)} um   ${worstWit <= TOL ? 'within TOL' : 'EXCEEDS TOL'}`,
        `    witness-locus ${locus(worstWitTri)}   at xyz ${wx.toFixed(5)},${wy.toFixed(5)},${wz.toFixed(5)}`,
        `  triangles with a witnessed exceedance : ${nOver} / ${nTri}`,
        `  triangles left UNCERTIFIED            : ${nUncert}`,
        `  stage-3 global confirm of worst ${conf.length}: ${um(conf.reduce((m, c) => Math.max(m, c.truth), 0))} um`,
        ...conf.slice(0, 8).map((c) => `    tri ${c.tri}  fast ${um(c.fast)} -> global ${um(c.truth)} um  @th=${c.th.toFixed(5)} z=${c.z.toFixed(4)}`));
    }

    // ══════════════════ H2 — SURFACE -> MESH, adaptive, exact point-to-triangle ══════════════════
    if (DO_H2) {
      // soup RefMesh: the audited STL verbatim, no welding, no reinterpretation
      const idx = new Uint32Array(nTri * 3);
      for (let i = 0; i < nTri * 3; i += 1) idx[i] = i;
      const ref: RefMesh = { xyz, idx, nV: nTri * 3, nF: nTri };
      const cell = pickLocatorCell(xyz, idx, nTri);
      const loc = buildRefLocator(ref, cell);
      const h2 = surfaceToMeshMax(rA, loc.dist, {
        H, tol: TOL, coveragePitch: H2PITCH, minPitch: H2MINPITCH, structN: H2STRUCTN, budget: H2BUDGET,
        onProgress: (frac, q, mx) => {
          if (Math.round(frac * 512) % 64 !== 0) return;
          // eslint-disable-next-line no-console
          console.log(`  H2 coverage ${(frac * 100).toFixed(0)}%  ${(q / 1e6).toFixed(1)}M queries  ${((Date.now() - t0) / 1000).toFixed(0)}s  max ${um(mx)} um`);
        },
      });
      const rw = rA(h2.th, h2.z);
      const wxp = rw * Math.cos(h2.th); const wyp = rw * Math.sin(h2.th);
      const dt = loc.distTri(wxp, wyp, h2.z);
      // The locator prunes by expanding rings; a pruning bug would OVER-state distance and so manufacture a
      // FAIL. Re-measure the single reported argmax against every triangle in the mesh — one brute query is
      // cheap and settles it, so no H2 verdict rests on the acceleration structure being right.
      const brute = loc.bruteDist(wxp, wyp, h2.z);
      lines.push('',
        '--- H2  SURFACE -> MESH   (witnessed lower bound; every reading is an exact point-to-triangle distance) ---',
        `  ${(h2.queries / 1e6).toFixed(1)}M locator queries   structure pitch ${um(h2.structPitch)} um (resolving power)`,
        `  ${h2.capped ? 'phase-B refinement TRUNCATED by budget (phase-A coverage of the whole surface still completed, so this is a floor)' : 'refinement ran to exhaustion — no cell left that could beat the reported max'}`,
        `  WITNESSED max : ${um(h2.max)} um   ${h2.max <= TOL ? 'within TOL' : 'EXCEEDS TOL'}   [brute-force re-check of this point: ${um(brute)} um]`,
        `    at th=${h2.th.toFixed(6)} z=${h2.z.toFixed(5)}  r=${rw.toFixed(5)}  nearest tri ${dt.tri}`,
        `    nearest-tri locus ${locus(dt.tri)}`,
        `  leaf cells still over TOL at max depth : ${h2.hotLeaves}`);
    }

    // ══════════════════ A/B against the old ruler on the same triangles ══════════════════
    if (OLD) {
      const AUD_HS = 0.03; const AUD_NMIN = 12; const AUD_NMAX = 64;
      let oldMax = 0; let oldMaxTri = -1;
      for (let t = 0; t < nTri; t += 1) {
        const o = t * 9;
        const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
        const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
        const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
        let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
        let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-18) continue;
        nx /= nl; ny /= nl; nz /= nl;
        const le = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
        const n = Math.max(AUD_NMIN, Math.min(AUD_NMAX, Math.ceil(le / AUD_HS)));
        const tA = Math.atan2(ay, ax);
        const un = (x: number): number => { let d = x - tA; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; };
        const dB = un(Math.atan2(by, bx)); const dC = un(Math.atan2(cy, cx));
        let s = 0;
        for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n - i; j += 1) {
          const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
          const th = tA + wb * dB + wc * dC;
          const z = wa * az + wb * bz + wc * cz;
          const r = rA(th, z);
          const dd = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
          if (dd > s) s = dd;
        }
        if (s > oldMax) { oldMax = s; oldMaxTri = t; }
      }
      lines.push('', '--- A/B: the OLD ruler on the SAME mesh (plane distance, n in [12,64] @ 0.03 mm pitch) ---',
        `  old-ruler MAX ${um(oldMax)} um   locus ${locus(oldMaxTri)}`);
    }

    lines.push('', `${((Date.now() - t0) / 1000).toFixed(0)}s   ${(rEvals / 1e6).toFixed(1)}M rA evals`,
      '=========================================================');
    const report = lines.join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
    const outDir = join('research', 'exchange', '_strataFacetTruth');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${tag}.report.txt`), report);
    expect(nTri).toBeGreaterThan(0);
  }, 24 * 60 * 60 * 1000);
});
