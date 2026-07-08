// _gyroid_close.test.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
// E-2026-07-08-GYROID-CONFORMING-CLOSE. Env-gated resumable probes (PF_GYROID_CLOSE=1).
//   Q1 EXTRACT   (PF_GYROID_CLOSE=1 PF_GC=extract): analytic contour extraction + 3D placement validation + scatter overlay ndjson.
//   Q2 BUILD     (PF_GYROID_CLOSE=1 PF_GC=build):   conforming re-mesh (single vs doubled), constraint recovery stats, watertight, zeroArea, tris.
//   Q3 VERDICT   (PF_GYROID_CLOSE=1 PF_GC=verdict): whole-mesh Newton-ruler gate (off-wall outliers, wall serration).
import { describe, it, expect } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GYROID_DEFAULTS, wallIsolevels, gyroidVal, marchAbsIso, linkSegments, isoResidual3D, refineAndFilterContours,
} from './_gyroidContourLib';
import { radiusFn } from './_pf_tangledKernelLib';
import type { StyleDims } from './labkit';

const RUN = process.env.PF_GYROID_CLOSE === '1';
const DIR = join(process.cwd(), 'research/exchange/_gyroid_close');
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const P = GYROID_DEFAULTS;

describe('E-2026-07-08-GYROID-CONFORMING-CLOSE', () => {
  it.skipIf(!RUN || process.env.PF_GC !== 'extract')('Q1 extract + validate contour placement', () => {
    const rA = radiusFn('GyroidManifold', DIMS);
    const lv = wallIsolevels(P);
    // marching-squares grid: gmScale=4 ⇒ the val field oscillates ~4 periods in u and ~16/(2π)≈2.5 in t? zT=16t so
    // ~2.5 periods in t. A 1200×1200 grid gives ~150 cells/period in u — ample for the smooth field.
    const opts = { nu: 1200, nt: 1200, polishIters: 40 };
    const t0 = Date.now();
    const outSegs = marchAbsIso(lv.outer, P, opts);
    const innerSegs = marchAbsIso(lv.inner, P, opts);
    const midSegs = marchAbsIso(lv.mid, P, opts);
    // refine+filter: polish every vertex onto the true isolevel, DROP the ~0.3% saddle strays (valErr>1e-4).
    const rfOut = refineAndFilterContours(linkSegments(outSegs), lv.outer, P);
    const rfInner = refineAndFilterContours(linkSegments(innerSegs), lv.inner, P);
    const rfMid = refineAndFilterContours(linkSegments(midSegs), lv.mid, P);
    const outC = rfOut.contours, innerC = rfInner.contours, midC = rfMid.contours;
    const ms = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log('[Q1 refine] outer dropped', rfOut.dropped, 'kept', rfOut.kept, '| inner dropped', rfInner.dropped, 'kept', rfInner.kept, '| mid dropped', rfMid.dropped, 'kept', rfMid.kept);

    // ── placement validation: sample points ON each polyline, measure 3D disp off the target isolevel ──
    const validate = (contours: { pts: [number, number][] }[], c: number): { n: number; maxDisp: number; p99Disp: number; maxValErr: number } => {
      const disps: number[] = []; let maxValErr = 0;
      for (const cont of contours) for (const [u, t] of cont.pts) {
        const r = isoResidual3D(u, t, c, P, rA, DIMS.H);
        disps.push(r.disp3D); if (r.valErr > maxValErr) maxValErr = r.valErr;
      }
      disps.sort((a, b) => a - b);
      const p99 = disps.length ? disps[Math.min(disps.length - 1, Math.floor(0.99 * disps.length))] : 0;
      return { n: disps.length, maxDisp: disps.length ? disps[disps.length - 1] : 0, p99Disp: p99, maxValErr };
    };
    const vOut = validate(outC, lv.outer), vInner = validate(innerC, lv.inner), vMid = validate(midC, lv.mid);

    // checkpoint: counts + placement + isolevels
    const rec = {
      stage: 'Q1-EXTRACT', ms, isolevels: lv,
      outer: { nContours: outC.length, nSegs: outSegs.length, nPts: vOut.n, maxDisp: +vOut.maxDisp.toFixed(6), p99Disp: +vOut.p99Disp.toFixed(6), maxValErr: +vOut.maxValErr.toExponential(3) },
      inner: { nContours: innerC.length, nSegs: innerSegs.length, nPts: vInner.n, maxDisp: +vInner.maxDisp.toFixed(6), p99Disp: +vInner.p99Disp.toFixed(6), maxValErr: +vInner.maxValErr.toExponential(3) },
      mid: { nContours: midC.length, nSegs: midSegs.length, nPts: vMid.n, maxDisp: +vMid.maxDisp.toFixed(6), p99Disp: +vMid.p99Disp.toFixed(6), maxValErr: +vMid.maxValErr.toExponential(3) },
    };
    appendFileSync(join(DIR, 'extract.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[Q1]', JSON.stringify(rec, null, 2));

    // persist the refined contours for Q2 (resumable): JSON per isolevel, polyline arrays of [u,t].
    const serialize = (contours: { pts: [number, number][] }[]): number[][][] => contours.map((c) => c.pts);
    writeFileSync(join(DIR, 'contours_refined.json'), JSON.stringify({
      isolevels: lv, outer: serialize(outC), inner: serialize(innerC), mid: serialize(midC),
    }));

    // overlay scatter ndjson: dump all polyline points (u,t) for utScatter (one file per isolevel, tagged)
    const dumpPts = (contours: { pts: [number, number][] }[], tag: string): void => {
      let s = '';
      for (const cont of contours) for (const [u, t] of cont.pts) s += JSON.stringify({ uc: +u.toFixed(5), tc: +t.toFixed(5), dev: 0.05, tag }) + '\n';
      writeFileSync(join(DIR, `contour_${tag}.ndjson`), s);
    };
    dumpPts(outC, 'outer'); dumpPts(innerC, 'inner'); dumpPts(midC, 'mid');
    // combined (both band edges) for the doubled overlay
    writeFileSync(join(DIR, 'contour_both.ndjson'),
      [...outC, ...innerC].flatMap((cont) => cont.pts.map(([u, t]) => JSON.stringify({ uc: +u.toFixed(5), tc: +t.toFixed(5), dev: 0.05 }))).join('\n'));

    expect(vMid.maxDisp).toBeLessThan(0.01); // KILL: extractor must reach sub-0.01 placement
  }, 20 * 60_000);

  it.skipIf(!RUN || process.env.PF_GC !== 'diag')('DIAG: distribution of placement disp + bad-point loci', () => {
    const rA = radiusFn('GyroidManifold', DIMS);
    const lv = wallIsolevels(P);
    const segs = marchAbsIso(lv.mid, P, { nu: 1200, nt: 1200, polishIters: 40 });
    const conts = linkSegments(segs);
    const disps: number[] = []; const valErrs: number[] = []; const bad: Array<{ u: number; t: number; disp: number; valErr: number; av: number }> = [];
    for (const cont of conts) for (const [u, t] of cont.pts) {
      const r = isoResidual3D(u, t, lv.mid, P, rA, DIMS.H);
      disps.push(r.disp3D); valErrs.push(r.valErr);
      if (r.disp3D > 0.01 || r.valErr > 1e-4) { const v = gyroidVal(u, t, P); bad.push({ u: +u.toFixed(5), t: +t.toFixed(5), disp: +r.disp3D.toFixed(5), valErr: +r.valErr.toExponential(3), av: +Math.abs(v).toFixed(5) }); }
    }
    disps.sort((a, b) => a - b); valErrs.sort((a, b) => a - b);
    const pc = (arr: number[], q: number): number => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))];
    // eslint-disable-next-line no-console
    console.log('[DIAG disp3D] n=', disps.length, 'p50=', pc(disps, 0.5).toExponential(2), 'p90=', pc(disps, 0.9).toExponential(2), 'p99=', pc(disps, 0.99).toExponential(2), 'p999=', pc(disps, 0.999).toExponential(3), 'max=', pc(disps, 1).toFixed(4), 'nBad(disp>0.01)=', disps.filter((d) => d > 0.01).length);
    // eslint-disable-next-line no-console
    console.log('[DIAG valErr] p99=', pc(valErrs, 0.99).toExponential(2), 'p999=', pc(valErrs, 0.999).toExponential(2), 'max=', pc(valErrs, 1).toExponential(3), 'nBadVal(>1e-4)=', valErrs.filter((v) => v > 1e-4).length);
    // eslint-disable-next-line no-console
    console.log('[DIAG] worst 20 bad points:', JSON.stringify(bad.sort((a, b) => b.disp - a.disp).slice(0, 20)));
    expect(disps.length).toBeGreaterThan(0);
  }, 10 * 60_000);
});
