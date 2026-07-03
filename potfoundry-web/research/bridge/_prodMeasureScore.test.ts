// _prodMeasureScore.test.ts — DEV-ONLY (PF_PRODSCORE=1). Score the PRODUCTION shipping-export meshes
// (extracted by e2e/_prodMeasure_extract.cjs into research/exchange/_prodmeasure/) under the CORRECTED labkit
// ruler: true-3D perp (own-region / brute-anchored steep), triangle quality, watertight (raw-index AND weld).
//
// The extract probe dumped, per style at dims {H:120,Rb:40,Rt:50,expn:1}, spin=0:
//   <style>.outer.xyz.bin  f32 OUTER-WALL 3D vertices (conforming outer-wall mask)
//   <style>.outer.idx.bin  u32 OUTER-WALL triangle indices
//   <style>.whole.xyz.bin  f32 WHOLE-pot 3D vertices (watertight audit needs the full closed pot)
//   <style>.whole.idx.bin  u32 WHOLE-pot triangle indices
//   <style>.diag.json      in-page corrected diagnostics (surfaceFidelity perp/radial, triQuality, topo)
//
// Outer-wall (u,t) is RECOVERED from 3D: u = atan2(y,x)/TAU (mod 1), t = z/H — EXACT at spin=0 (default dims have
// no twist), so labkit's perFaceTrue3DSag / perFaceChordSag / bruteAnchoredRedPerp can score against the analytic
// rA = buildRadiusFn(style, {}, dims) (the SAME STYLE_FUNCTIONS the production export + the research kernel use).
//
// Checkpoints one ndjson row per style the instant it is scored (resumable; env-kill safe).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, perFaceTrue3DSag, perFaceChordSag, bruteAnchoredRedPerp,
  auditNonManByIndex, triangleQualityDistribution,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_PRODSCORE === '1';
const DIR = join(process.cwd(), 'research', 'exchange', '_prodmeasure');
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAU = 2 * Math.PI;
const CAD_TOL = 0.11; // the arc's CAD-grade true-3D bar (matches E-SWEEP-METRIC-MAP classification)

// STEEP lattices/braids where single-seed GN overstates true-3D up to 7× (E-2026-07-02-STEEP-HETEROGENEITY):
// brute-anchor the worst-red facets for the honest verdict number.
const STEEP = new Set([
  'GyroidManifold', 'CelticTriquetra', 'CelticKnot', 'Voronoi', 'Crystalline', 'GothicArches',
  'BasketWeave', 'DragonScales', 'ArtDeco', 'BambooSegments', 'LowPolyFacet', 'SpiralRidges',
]);

function readF32(name: string): Float32Array | null {
  const p = join(DIR, name);
  if (!existsSync(p)) return null;
  const b = readFileSync(p);
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 4));
}
function readU32(name: string): Uint32Array | null {
  const p = join(DIR, name);
  if (!existsSync(p)) return null;
  const b = readFileSync(p);
  return new Uint32Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 4));
}
function p99(arr: ArrayLike<number>): number {
  const s = Float64Array.from(arr as ArrayLike<number>).sort();
  return s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0;
}
/** Raw-index non-manifold: count undirected edges (by literal index, no weld) shared by >2 tris. */
function auditNonManRaw(indices: ArrayLike<number>): number {
  const ec = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      ec.set(key, (ec.get(key) ?? 0) + 1);
    }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}
/** Count boundary edges (undirected, appearing exactly once) after 3D weld — open-mesh signal. */
function boundaryByWeld(xyz: Float32Array, indices: ArrayLike<number>, q = 1e-4): number {
  const n = xyz.length / 3; const canon = new Int32Array(n); const wm = new Map<string, number>();
  const iq = 1 / q;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(xyz[3 * i] * iq)}_${Math.round(xyz[3 * i + 1] * iq)}_${Math.round(xyz[3 * i + 2] * iq)}`;
    const h = wm.get(k); if (h !== undefined) canon[i] = h; else { wm.set(k, i); canon[i] = i; }
  }
  const ec = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = canon[indices[k]], b = canon[indices[k + 1]], c = canon[indices[k + 2]];
    if (a === b || b === c || a === c) continue;
    for (const [p, r] of [[a, b], [b, c], [c, a]] as const) {
      const key = p < r ? `${p}_${r}` : `${r}_${p}`;
      ec.set(key, (ec.get(key) ?? 0) + 1);
    }
  }
  let bnd = 0; for (const v of ec.values()) if (v === 1) bnd++; return bnd;
}

describe('production shipping-export scorecard (corrected labkit ruler)', () => {
  it.skipIf(!RUN)('score all extracted styles', () => {
    const diagFiles = require('node:fs').readdirSync(DIR).filter((f: string) => f.endsWith('.diag.json'));
    const styles = diagFiles.map((f: string) => f.replace('.diag.json', '')).sort();
    const ndjson = join(DIR, 'scorecard-production.ndjson');
    writeFileSync(ndjson, ''); // fresh (re-derived from the on-disk bins each score run)
    console.log(`\nscoring ${styles.length} styles from ${DIR}\n`);

    for (const style of styles) {
      const diag = JSON.parse(readFileSync(join(DIR, `${style}.diag.json`), 'utf8'));
      if (diag.error) { console.log(`${style}: EXTRACT ERROR — ${diag.error}`); appendFileSync(ndjson, JSON.stringify({ style, extractError: diag.error }) + '\n'); continue; }

      const oXyz = readF32(`${style}.outer.xyz.bin`), oIdx = readU32(`${style}.outer.idx.bin`);
      const wXyz = readF32(`${style}.whole.xyz.bin`), wIdx = readU32(`${style}.whole.idx.bin`);
      if (!oXyz || !oIdx) { console.log(`${style}: MISSING outer bins`); appendFileSync(ndjson, JSON.stringify({ style, missing: 'outer' }) + '\n'); continue; }

      const rA = buildRadiusFn(style as StyleId, {}, DIMS);

      // Recover OUTER-WALL (u,t) from 3D (spin=0 ⇒ exact). ut is stride-2 [u,t] per outer vertex.
      const nV = oXyz.length / 3;
      const ut: number[] = new Array(nV * 2);
      for (let i = 0; i < nV; i++) {
        const x = oXyz[3 * i], y = oXyz[3 * i + 1], z = oXyz[3 * i + 2];
        let u = Math.atan2(y, x) / TAU; if (u < 0) u += 1;
        ut[2 * i] = u; ut[2 * i + 1] = z / H;
      }

      // TRUE-3D fidelity (labkit): per-face true-3D sag (GN body) + radial (for the red-facet pick).
      const t0 = Date.now();
      const radial = perFaceChordSag(ut, oIdx, rA, H);
      const true3d = perFaceTrue3DSag(ut, oIdx, rA, H);
      const true3dMax = true3d.worstMm, true3dP99 = p99(true3d.faceErr);
      const radialMax = radial.worstMm;
      const nAbove01 = true3d.fracOver(0.01) * (oIdx.length / 3);

      // STEEP: brute-anchor the worst-red facets (GN overstates up to 7×) → trusted verdict number.
      let anchor: { gnP99: number; trustedP99: number; trustedMax: number; nRed: number; gnOver: number } | null = null;
      if (STEEP.has(style) && radial.fracOver(0.1) > 0) {
        const a = bruteAnchoredRedPerp(ut, oIdx, rA, H, { redMm: 0.1, sampleN: 40, radial });
        anchor = { gnP99: a.gnP99, trustedP99: a.trustedP99, trustedMax: a.trustedMax, nRed: a.nRed, gnOver: a.gnOver };
      }

      // TRIANGLE QUALITY on the OUTER wall (min-angle, %<20) — the ruler that dilutes if measured whole.
      const tq = triangleQualityDistribution({ vertices: oXyz, indices: oIdx });

      // WATERTIGHT on the WHOLE pot: weld-index AND raw-index (flag disagreement) + weld boundary.
      let weldNonMan = -1, rawNonMan = -1, weldBnd = -1, wholeTris = -1;
      if (wXyz && wIdx) {
        weldNonMan = auditNonManByIndex(wXyz, wIdx);
        rawNonMan = auditNonManRaw(wIdx);
        weldBnd = boundaryByWeld(wXyz, wIdx);
        wholeTris = wIdx.length / 3;
      }

      const verdictP99 = anchor ? anchor.trustedP99 : true3dP99;
      const row = {
        style,
        outerTris: oIdx.length / 3, wholeTris,
        radialMax: +radialMax.toFixed(4),
        true3dMax: +true3dMax.toFixed(4), true3dP99: +true3dP99.toFixed(4),
        anchorTrustedP99: anchor ? +anchor.trustedP99.toFixed(4) : null,
        anchorGnP99: anchor ? +anchor.gnP99.toFixed(4) : null,
        anchorNRed: anchor ? anchor.nRed : null, anchorGnOver: anchor ? anchor.gnOver : null,
        verdictTrue3dP99: +verdictP99.toFixed(4),
        nAbove01: Math.round(nAbove01),
        minAngleDeg: tq.minAngleDeg, pctBelow20: +tq.pctBelow20.toFixed(1), pctBelow10: +tq.pctBelow10.toFixed(1),
        medianMinAngle: tq.medianMinAngleDeg,
        weldNonMan, rawNonMan, weldBnd,
        watertight: weldNonMan === 0 && weldBnd === 0,
        cadGrade: verdictP99 <= CAD_TOL,
        // in-page cross-check (corrected perpendicular metric, authoritative outer-wall/seam exclusion)
        inPagePerpP99: diag.diag?.surfPerp?.p99DevMm ?? null,
        inPagePerpMax: diag.diag?.surfPerp?.chordMaxMm ?? null,
        inPagePerpNAbove: diag.diag?.surfPerp?.nAbove ?? null,
        inPageRefTrusted: diag.diag?.surfPerp?.referenceTrusted ?? null,
        inPageRefMode: diag.diag?.surfPerp?.referenceMode ?? null,
        inPageVtxMax: diag.diag?.surfPerp?.vertexMaxMm ?? null,
        scoreMs: Date.now() - t0,
      };
      appendFileSync(ndjson, JSON.stringify(row) + '\n');
      console.log(
        `${style}: verdictTrue3dP99=${row.verdictTrue3dP99} (gn-p99=${true3dP99.toFixed(4)}${anchor ? `→anchored ${anchor.trustedP99.toFixed(4)}` : ''}) ` +
        `radialMax=${row.radialMax} cad=${row.cadGrade} | %<20=${row.pctBelow20} minAng=${row.minAngleDeg} | ` +
        `weldNM=${weldNonMan} rawNM=${rawNonMan} bnd=${weldBnd} wt=${row.watertight} | inPagePerpP99=${row.inPagePerpP99} (${row.scoreMs}ms)`,
      );
    }
    expect(existsSync(ndjson)).toBe(true);
  }, 60 * 60 * 1000);
});
