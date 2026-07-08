/**
 * _junctionDiag.test.ts — DEV-ONLY diagnostic (E-2026-07-08-TIERC-JUNCTION).
 *
 * NOT a gate. Env-gated (PF_TIERC_JUNCTION=1), resumable, checkpoints to
 * research/exchange/_tierc_junction/. Runs the multi-bay Gothic gate to the
 * cap, then for every whole-mesh outlier facet dumps centroid (u,t) + three
 * per-facet measures to classify WHERE the ~380 floor outliers live:
 *   (i)   chart distance (mm) to nearest protected-complex constraint edge,
 *   (ii)  local ridge amplitude (mm) at the centroid,
 *   (iii) nearest-junction (degree≥3 node) chart distance (mm).
 *
 * Verdict per the pre-registered kill-criteria in EXPERIMENT-REGISTRY.md.
 *
 * This file imports only production tierC modules + the sampler bridge — it
 * never mutates production behaviour and is skipped unless the env flag is set.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import { refineToZeroOutliers, type ChartDomain } from './noBridgeRefine';
import {
  DEFAULT_RULER,
  denseBary,
  facetInteriorHonest,
  liftChartMesh,
  radialSurfaceFromSampler,
} from './interiorRuler';

const RUN = process.env.PF_TIERC_JUNCTION === '1';
const OUT = 'research/exchange/_tierc_junction';
const TIMEOUT = 4 * 60 * 60 * 1000;

describe('Tier-C multi-bay junction diagnostic', () => {
  it.skipIf(!RUN)(
    'dump outlier centroids + 3 measures (PF_TIERC_JUNCTION=1)',
    () => {
      const styleId = 'GothicArches' as const;
      const domain: ChartDomain = { uLo: 0, uHi: 0.1, tLo: 0.38, tHi: 0.62 };
      const bgArcMm = 0.5;
      const nTheta = 1024;

      const sampler = styleSampler(styleId, {}, { H: 120, Rt: 50, Rb: 40 });
      const complex = buildProtectedComplex(sampler, styleId);
      expect(complex.residualCrossings).toBe(0);
      const { uToMm, tToMm } = complex;

      // ── Run the multi-bay gate to the plateau (V10e: insertions no-op from
      // pass ~7; the floor population is stable by then). maxPass 9 keeps the
      // dense-pass grind bounded while still reaching the plateau. ──
      const loopRuler = { ...DEFAULT_RULER, nTheta, thetaWindowRad: 0.5 };
      const passLog = `${OUT}/passlog.ndjson`;
      writeFileSync(passLog, ''); // reset
      const t0 = Date.now();
      const refined = refineToZeroOutliers(
        sampler,
        complex,
        domain,
        { tolMm: 0.01, maxPass: 9, bulkPasses7pt: 4, bgArcMm, ruler: loopRuler },
        (s) => {
          // Liveness checkpoint (vitest buffers console in run mode; the file
          // is the only live signal). Append the INSTANT each pass computes.
          appendFileSync(passLog, JSON.stringify(s) + '\n');
          // eslint-disable-next-line no-console
          console.log(
            `[diag pass ${s.pass}${s.dense ? ' DENSE' : ' 7pt'}] tris=${s.nTris} ` +
              `out=${s.outliers} worst=${s.worstMm.toFixed(5)} ins=${s.inserted} ` +
              `${(s.ms / 1000).toFixed(0)}s`,
          );
        },
      );
      // eslint-disable-next-line no-console
      console.log(
        `[diag] capped=${refined.capped} passes=${refined.passes} ` +
          `tris=${refined.tris.length / 3} verts=${refined.uv.length / 2} ` +
          `${((Date.now() - t0) / 1000).toFixed(0)}s`,
      );

      // CHECKPOINT the capped mesh immediately (resumable — this is the
      // expensive artifact).
      writeFileSync(
        `${OUT}/capped_mesh.json`,
        JSON.stringify({
          domain,
          uToMm,
          tToMm,
          capped: refined.capped,
          passes: refined.passes,
          uv: refined.uv,
          tris: refined.tris,
          junctions: complex.junctions,
          complexVertices: complex.vertices,
          complexEdges: complex.edges,
          history: refined.history,
        }),
      );

      // ── Whole-mesh score for the DIAGNOSTIC. We use the per-facet θ-window
      // ruler here (the facetInteriorHonest per-sample window is provably
      // conservative — it only ever OVERSTATES, never hides an outlier), which
      // is ~10× cheaper than full-azimuth over ~75k facets. For a LOCATION
      // classification an outlier SUPERSET is exactly right; the FULL-azimuth
      // guard is the fidelity gate (wholeMesh0Outlier.test.ts), not this
      // diagnostic. A fixed 0.5rad window would understate on early-pass giant
      // facets, but by this point every facet is small (post-refine), so 0.5rad
      // ≈ ±3 ribs comfortably contains every foot. ──
      const surface = radialSurfaceFromSampler(sampler);
      const guardRuler = { ...DEFAULT_RULER, nTheta, thetaWindowRad: 0.5 };
      const xyz = liftChartMesh(sampler, refined.uv);
      const dense = denseBary(8);
      const nF = refined.tris.length / 3;

      // Per-facet honest dev + worst-sample (u,t). Checkpoint every 5000.
      const facetDev = new Float64Array(nF);
      const facetUw = new Float64Array(nF);
      const facetTw = new Float64Array(nF);
      for (let f = 0; f < nF; f++) {
        const g = facetInteriorHonest(
          surface,
          xyz,
          refined.uv,
          refined.tris[3 * f],
          refined.tris[3 * f + 1],
          refined.tris[3 * f + 2],
          dense,
          guardRuler,
        );
        facetDev[f] = g.dev;
        facetUw[f] = g.uWorst;
        facetTw[f] = g.tWorst;
        if (f > 0 && f % 5000 === 0) {
          // eslint-disable-next-line no-console
          console.log(`[diag score] ${f}/${nF}`);
        }
      }
      let outliers = 0;
      let maxMm = 0;
      for (let f = 0; f < nF; f++) {
        if (facetDev[f] > maxMm) maxMm = facetDev[f];
        if (facetDev[f] > 0.01) outliers++;
      }
      // eslint-disable-next-line no-console
      console.log(`[diag] whole-mesh outliers=${outliers} max=${maxMm.toFixed(5)}`);

      // ── Measure infrastructure ──────────────────────────────────────────
      // Constraint edges + junctions in CHART (u,t) space, mm-metric distance.
      // complex.vertices are in flat mm = (u*uToMm, t*tToMm); chart u = mm/uToMm.
      const cev = complex.vertices; // flat mm packed
      const cEdges = complex.edges;
      const junc = complex.junctions;

      // Nearest chart distance (mm) from a point (uu,tt chart) to any
      // constraint edge segment. Distances measured in mm with a u-seam-aware
      // du. Brute over all edges (complex is small: ~thousands of segments).
      const distToConstraint = (uu: number, tt: number): number => {
        const pxMm = uu * uToMm;
        const pyMm = tt * tToMm;
        let best = Infinity;
        for (let e = 0; e < cEdges.length; e++) {
          const a = cEdges[e][0];
          const b = cEdges[e][1];
          const axMm = cev[2 * a];
          const ayMm = cev[2 * a + 1];
          const bxMm = cev[2 * b];
          const byMm = cev[2 * b + 1];
          // u-seam: the complex is unwrapped continuously, edges may sit at
          // u slightly outside [0,uToMm). Compare against the query image
          // nearest each endpoint by shifting the query x by ±circumference.
          for (const shift of [-uToMm, 0, uToMm]) {
            const qx = pxMm + shift;
            const dx = bxMm - axMm;
            const dy = byMm - ayMm;
            const L2 = dx * dx + dy * dy || 1e-12;
            let s = ((qx - axMm) * dx + (pyMm - ayMm) * dy) / L2;
            s = Math.max(0, Math.min(1, s));
            const cxp = axMm + s * dx;
            const cyp = ayMm + s * dy;
            const d = Math.hypot(qx - cxp, pyMm - cyp);
            if (d < best) best = d;
          }
        }
        return best;
      };

      const distToJunction = (uu: number, tt: number): number => {
        const pxMm = uu * uToMm;
        const pyMm = tt * tToMm;
        let best = Infinity;
        for (const j of junc) {
          const jxMm = cev[2 * j];
          const jyMm = cev[2 * j + 1];
          for (const shift of [-uToMm, 0, uToMm]) {
            const d = Math.hypot(pxMm + shift - jxMm, pyMm - jyMm);
            if (d < best) best = d;
          }
        }
        return best;
      };

      // Local ridge amplitude (mm) at (uu,tt): radius-max over a ±2.5mm window
      // in BOTH chart axes (crude bimodal-robust: sample a 9x9 grid, take
      // max - median). Cheap enough per outlier.
      const rAt = (u: number, t: number): number => {
        const [x, y] = sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t)));
        return Math.hypot(x, y);
      };
      const WIN_MM = 2.5;
      const localAmplitude = (uu: number, tt: number): number => {
        const N = 9;
        const rs: number[] = [];
        for (let i = 0; i < N; i++) {
          const du = (-WIN_MM + (2 * WIN_MM * i) / (N - 1)) / uToMm;
          for (let k = 0; k < N; k++) {
            const dt = (-WIN_MM + (2 * WIN_MM * k) / (N - 1)) / tToMm;
            rs.push(rAt(uu + du, tt + dt));
          }
        }
        rs.sort((a, b) => a - b);
        const med = rs[Math.floor(rs.length / 2)];
        return rs[rs.length - 1] - med;
      };

      // ── Dump per-outlier-facet rows ─────────────────────────────────────
      type Row = {
        f: number;
        uc: number;
        tc: number;
        uw: number;
        tw: number;
        dev: number;
        dConstraint: number;
        dJunction: number;
        amp: number;
      };
      const rows: Row[] = [];
      for (let f = 0; f < nF; f++) {
        if (facetDev[f] <= 0.01) continue;
        const a = refined.tris[3 * f];
        const b = refined.tris[3 * f + 1];
        const c = refined.tris[3 * f + 2];
        let ua = refined.uv[2 * a];
        let ub = refined.uv[2 * b];
        let uc2 = refined.uv[2 * c];
        while (ub - ua > 0.5) ub -= 1;
        while (ua - ub > 0.5) ub += 1;
        while (uc2 - ua > 0.5) uc2 -= 1;
        while (ua - uc2 > 0.5) uc2 += 1;
        const ucent = (ua + ub + uc2) / 3;
        const tcent =
          (refined.uv[2 * a + 1] + refined.uv[2 * b + 1] + refined.uv[2 * c + 1]) / 3;
        rows.push({
          f,
          uc: ucent,
          tc: tcent,
          uw: facetUw[f],
          tw: facetTw[f],
          dev: facetDev[f],
          dConstraint: distToConstraint(ucent, tcent),
          dJunction: distToJunction(ucent, tcent),
          amp: localAmplitude(ucent, tcent),
        });
      }

      // ndjson checkpoint.
      writeFileSync(
        `${OUT}/outliers.ndjson`,
        rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
      );

      // ── Classification per the pre-registered kill-criteria ─────────────
      const near = (pred: (r: Row) => boolean): number =>
        rows.length ? rows.filter(pred).length / rows.length : 0;
      const fracJunction3 = near((r) => r.dJunction <= 3);
      const fracTedge1 = near(
        (r) =>
          Math.abs(r.tc - domain.tLo) * tToMm <= 1 ||
          Math.abs(r.tc - domain.tHi) * tToMm <= 1,
      );
      const junctionRows = rows.filter((r) => r.dJunction <= 3);
      const sortedC = junctionRows.map((r) => r.dConstraint).sort((a, b) => a - b);
      const medConstraintAtJunction = sortedC.length
        ? sortedC[Math.floor(sortedC.length / 2)]
        : NaN;
      const ampSorted = rows.map((r) => r.amp).sort((a, b) => a - b);
      const ampP50 = ampSorted.length ? ampSorted[Math.floor(ampSorted.length / 2)] : 0;
      const devSorted = rows.map((r) => r.dev).sort((a, b) => a - b);
      const devP50 = devSorted.length ? devSorted[Math.floor(devSorted.length / 2)] : 0;
      const devMax = devSorted.length ? devSorted[devSorted.length - 1] : 0;

      let verdict: string;
      if (fracJunction3 >= 0.6) {
        verdict = medConstraintAtJunction > 1 ? '(a) RECALL-GAP' : '(b) SNAP-AMBIGUITY';
      } else if (fracTedge1 >= 0.6 && fracJunction3 < 0.3) {
        verdict = '(c) T-EDGE-CLIP-STUB';
      } else if (fracJunction3 < 0.6 && fracTedge1 < 0.6 && ampP50 < 0.05) {
        verdict = '(d) DENSITY';
      } else {
        verdict = 'MIXED/INCONCLUSIVE';
      }

      const summary = {
        exp: 'E-2026-07-08-TIERC-JUNCTION',
        domain,
        capped: refined.capped,
        passes: refined.passes,
        nFacets: nF,
        outliers,
        devMax,
        devP50,
        fracJunction3,
        fracTedge1,
        medConstraintAtJunction,
        ampP50,
        nJunctions: junc.length,
        nConstraintEdges: cEdges.length,
        verdict,
      };
      // eslint-disable-next-line no-console
      console.log('[diag SUMMARY]', JSON.stringify(summary, null, 2));
      writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));

      // Not an assertion gate — the diagnostic always "passes" (it produces
      // data). Sanity: we did compute outliers.
      expect(rows.length).toBe(outliers);
    },
    TIMEOUT,
  );
});
