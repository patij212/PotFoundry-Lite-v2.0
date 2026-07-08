/**
 * _flankBand.test.ts — E-2026-07-08-TIERC-FLANKBAND (ROUND 9).
 *
 * The never-tried mechanism family on Gothic: CLIFF-CLASS flank-band embedding.
 * The §V11s ~1150-outlier floor (worst 0.469, dedupe-unfreeze makes it WORSE) is
 * the near-vertical rib-flank signature seen on Gyroid channel walls (§V11o/q) and
 * DragonScales risers (§V11l). The protected complex embeds rib CRESTS + needle
 * pickets but NOT the flank-band TOE contours (where the steep flank meets the
 * smooth panel). Facets straddling the flank→panel transition subdivide forever.
 *
 * STEP 1 (MODE=localize, this file first): build the §V11s p1 config to a PLATEAU
 *   maxPass, PERSIST the mesh (uv/tris — never rebuild), score EVERY facet with the
 *   honest interiorRuler, dump each OUTLIER's (uWorst,tWorst,dev) + local |∇r| +
 *   relief amplitude a=r−r̄_panel(t) + distance-to-nearest-crest. Classify STRADDLE
 *   (toe) vs MID-FLANK vs MID-PANEL. This is DECISIVE and gates the rest.
 *
 * STEP 2/3/4 (extract/embed/gate) land in later commits once STEP-1 verdict is in.
 *
 * Env: PF_FLANKBAND=1, PF_FB=localize|extract|embed|gate. PF_FB_MAXPASS (default 25).
 * Resumable: STEP-1 persists mesh_p1.{uv,tris}.json — a re-run SKIPs the build.
 * Per-step ndjson checkpoint written the INSTANT computed.
 */
import { describe, it } from 'vitest';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex, type PicketSpec } from './morseComplex';
import {
  refineToZeroOutliersParallel,
  type ChartDomain,
  type RefineOptions,
} from './noBridgeRefine';
import {
  DEFAULT_RULER,
  facetInteriorHonest,
  liftChartMesh,
  radialSurfaceFromSampler,
} from './interiorRuler';
import { GpuSurfaceSampler } from '../SurfaceSampler';
import { ParallelScorerPool, samplerGrid } from './parallelScorer';
import {
  extractToeBand,
  flankIsoResidual3D,
  type FlankContour,
  type FlankDomain,
} from './flankBand';
import { reduceDevArray } from './interiorRuler';
import type { BandContour } from './morseComplex';

const RUN = process.env.PF_FLANKBAND === '1';
const MODE = process.env.PF_FB ?? 'localize';
const OUT = 'research/exchange/_tierc_flankband';
const MAXPASS = process.env.PF_FB_MAXPASS ? +process.env.PF_FB_MAXPASS : 25;
const PROJ = 42;

const DOMAIN: ChartDomain = { uLo: 0.05, uHi: 0.15, tLo: 0.38, tHi: 0.62 };
const FDOMAIN: FlankDomain = { uLo: 0.05, uHi: 0.15, tLo: 0.38, tHi: 0.62 };
const TAU = 2 * Math.PI;

// Toe-band iso-values (amplitude fraction 0=panel, 1=crest), chosen from the
// STEP-1 dev-weighted histogram: the error mass concentrates at ampFrac 0.10-0.40
// (sumDev peak at 0.20-0.30). A DOUBLED/laddered band brackets that strip so the
// steep lower flank is FRAMED between the toe (below) and the mid-flank rail
// (above); the locked crest chain frames the top. Overridable via env for the
// design sweep.
const TOE_LO = process.env.PF_FB_TOELO ? +process.env.PF_FB_TOELO : 0.12;
const TOE_HI = process.env.PF_FB_TOEHI ? +process.env.PF_FB_TOEHI : 0.4;
const PICKET_MM = process.env.PF_FB_PICKET ? +process.env.PF_FB_PICKET : 0.1;
const GTAG = process.env.PF_FB_TAG ?? 'v1';

/** Round-7/8 PLACEMENT-1 pickets (banked needle-forbidding set). */
function placementPickets(chord = 0.09): PicketSpec[] {
  return [0.058, 0.1, 0.14].map((u) => ({ u, tLo: 0.44, tHi: 0.58, maxChordMm: chord }));
}

const DEDUPE = process.env.PF_FB_DEDUPE ? +process.env.PF_FB_DEDUPE : undefined;

/** The §V11s p1 refine options (all banked levers on). */
function p1Opts(): RefineOptions {
  return {
    tolMm: 0.01,
    maxPass: MAXPASS,
    bulkPasses7pt: 4,
    bgArcMm: 0.3,
    maxConstraintMm: 0.15,
    adaptiveSeed: true,
    hMinMm: 0.09,
    adaptiveMaxLevel: 5,
    adaptiveUSplit: false,
    splitMode: 'aniso',
    anisoDirection: 'edgeSag',
    anisoAspectTol: 0.15,
    dirtyFacetCache: true,
    dedupeCellMm: DEDUPE,
    ruler: { ...DEFAULT_RULER, thetaWindowRad: 0.5 },
  };
}

const MESH_PATH = `${OUT}/mesh_p1_mp${MAXPASS}`;

describe('Tier-C FLANK-BAND (round 9)', () => {
  // MODE=localize: BUILD the §V11s p1 plateau mesh and PERSIST it (the expensive
  // unit — kept separate from scoring so a scoring kill never loses the build).
  it.skipIf(!RUN || MODE !== 'localize')(
    'STEP 1a: build + persist the §V11s p1 plateau mesh',
    async () => {
      mkdirSync(OUT, { recursive: true });
      if (existsSync(`${MESH_PATH}.uv.json`)) {
        // eslint-disable-next-line no-console
        console.log('[localize BUILD] mesh already persisted — SKIP');
        return;
      }
      const sampler = styleSampler(
        'GothicArches',
        {},
        { H: 120, Rt: 50, Rb: 40 },
      ) as GpuSurfaceSampler;
      const pickets = placementPickets();
      const complex = buildProtectedComplex(sampler, 'GothicArches', undefined, pickets);
      const pool = new ParallelScorerPool(samplerGrid(sampler), 4);
      const passLog = `${OUT}/localize_build_pass.ndjson`;
      writeFileSync(passLog, '');
      let prevTris = 0;
      const t0 = Date.now();
      const refined = await refineToZeroOutliersParallel(
        sampler,
        complex,
        DOMAIN,
        p1Opts(),
        pool,
        (s) => {
          const dTris = s.nTris - prevTris;
          prevTris = s.nTris;
          appendFileSync(
            passLog,
            JSON.stringify({ ...s, projFullPot: Math.round(s.nTris * PROJ), dTris }) + '\n',
          );
        },
      );
      await pool.close();
      writeFileSync(`${MESH_PATH}.uv.json`, JSON.stringify(refined.uv));
      writeFileSync(`${MESH_PATH}.tris.json`, JSON.stringify(refined.tris));
      writeFileSync(
        `${MESH_PATH}.crest.json`,
        JSON.stringify({
          vertices: complex.vertices,
          edges: complex.edges,
          uToMm: complex.uToMm,
          tToMm: complex.tToMm,
        }),
      );
      // eslint-disable-next-line no-console
      console.log(
        `[localize BUILD] passes=${refined.passes} capped=${refined.capped} tris=${refined.tris.length / 3} sec=${((Date.now() - t0) / 1000).toFixed(0)}`,
      );
    },
    6 * 60 * 60 * 1000,
  );

  it.skipIf(!RUN || MODE !== 'localscore')(
    'STEP 1b: score the persisted plateau mesh, dump the floor scatter (straddle vs mid-flank)',
    async () => {
      mkdirSync(OUT, { recursive: true });
      const sampler = styleSampler(
        'GothicArches',
        {},
        { H: 120, Rt: 50, Rb: 40 },
      ) as GpuSurfaceSampler;
      const uv: number[] = JSON.parse(readFileSync(`${MESH_PATH}.uv.json`, 'utf8'));
      const tris: number[] = JSON.parse(readFileSync(`${MESH_PATH}.tris.json`, 'utf8'));
      // eslint-disable-next-line no-console
      console.log(`[localscore] mesh tris=${tris.length / 3} verts=${uv.length / 2}`);

      // ── measure r(u,t), |∇r| (mm), relief amplitude, crest distance ──────────
      const surface = radialSurfaceFromSampler(sampler);
      const { rA, H } = surface;
      const crestData = existsSync(`${MESH_PATH}.crest.json`)
        ? JSON.parse(readFileSync(`${MESH_PATH}.crest.json`, 'utf8'))
        : { vertices: [], uToMm: 1, tToMm: 1 };
      const uToMm: number = crestData.uToMm;
      const tToMm: number = crestData.tToMm;
      // crest vertices as (u,t): the complex verts are flat mm (x=u*uToMm, y=t*tToMm)
      const crestUt: Array<[number, number]> = [];
      const cv: number[] = crestData.vertices ?? [];
      for (let i = 0; i < cv.length / 2; i++) {
        crestUt.push([((cv[2 * i] / uToMm) % 1 + 1) % 1, cv[2 * i + 1] / tToMm]);
      }

      const rAt = (u: number, t: number): number =>
        rA(TAU * (((u % 1) + 1) % 1), Math.min(1, Math.max(0, t)) * H);
      // |∇r| in mm: dr/d(mm-u) and dr/d(mm-t) via central FD (h ~0.02mm).
      const gradMag = (u: number, t: number): number => {
        const hU = 0.02 / uToMm;
        const hT = 0.02 / tToMm;
        const dru = (rAt(u + hU, t) - rAt(u - hU, t)) / (2 * 0.02);
        const drt = (rAt(u, t + hT) - rAt(u, t - hT)) / (2 * 0.02);
        return Math.hypot(dru, drt);
      };
      // panel floor r̄_panel(t) = MIN radius over the domain u-range at t (the
      // valley/panel between ribs); relief amplitude a = r − r̄_panel.
      const NT = 200;
      const panelFloor = new Float64Array(NT + 1);
      const ribMax = new Float64Array(NT + 1); // MAX radius over u = rib crest
      for (let j = 0; j <= NT; j++) {
        const t = DOMAIN.tLo + (DOMAIN.tHi - DOMAIN.tLo) * (j / NT);
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i <= 400; i++) {
          const u = DOMAIN.uLo + (DOMAIN.uHi - DOMAIN.uLo) * (i / 400);
          const r = rAt(u, t);
          if (r < lo) lo = r;
          if (r > hi) hi = r;
        }
        panelFloor[j] = lo;
        ribMax[j] = hi;
      }
      const panelAt = (t: number): number => {
        const f = (Math.min(DOMAIN.tHi, Math.max(DOMAIN.tLo, t)) - DOMAIN.tLo) / (DOMAIN.tHi - DOMAIN.tLo);
        const j = Math.min(NT - 1, Math.max(0, Math.floor(f * NT)));
        const fr = f * NT - j;
        return panelFloor[j] * (1 - fr) + panelFloor[j + 1] * fr;
      };
      const ribAt = (t: number): number => {
        const f = (Math.min(DOMAIN.tHi, Math.max(DOMAIN.tLo, t)) - DOMAIN.tLo) / (DOMAIN.tHi - DOMAIN.tLo);
        const j = Math.min(NT - 1, Math.max(0, Math.floor(f * NT)));
        const fr = f * NT - j;
        return ribMax[j] * (1 - fr) + ribMax[j + 1] * fr;
      };

      const crestDist = (u: number, t: number): number => {
        let best = Infinity;
        const uu = ((u % 1) + 1) % 1;
        for (const [cu, ct] of crestUt) {
          let du = cu - uu;
          while (du > 0.5) du -= 1;
          while (du < -0.5) du += 1;
          const d = Math.hypot(du * uToMm, (ct - t) * tToMm);
          if (d < best) best = d;
        }
        return best;
      };

      // ── score every facet, keep outliers (dev>tol) ───────────────────────────
      const xyz = liftChartMesh(sampler, uv);
      const nF = tris.length / 3;
      const dense = (() => {
        const B: Array<[number, number, number]> = [];
        for (let i = 0; i <= 8; i++) for (let j = 0; j + i <= 8; j++) B.push([i / 8, j / 8, (8 - i - j) / 8]);
        return B;
      })();
      const outPath = `${OUT}/localize_outliers.ndjson`;
      writeFileSync(outPath, '');
      const scatterPath = `${OUT}/localize_scatter.json`;
      const scatter: Array<{ u: number; t: number; dev: number; grad: number; amp: number; ampFrac: number; crestMm: number }> = [];
      let outliers = 0;
      let worst = 0;
      const t1 = Date.now();
      for (let f = 0; f < nF; f++) {
        const g = facetInteriorHonest(
          surface,
          xyz,
          uv,
          tris[3 * f],
          tris[3 * f + 1],
          tris[3 * f + 2],
          dense,
          DEFAULT_RULER,
        );
        if (g.dev > worst) worst = g.dev;
        if (g.dev > 0.01) {
          outliers++;
          const u = ((g.uWorst % 1) + 1) % 1;
          const t = g.tWorst;
          const r = rAt(u, t);
          const pf = panelAt(t);
          const rm = ribAt(t);
          const amp = r - pf; // mm above the panel floor
          const ampFrac = rm - pf > 1e-6 ? (r - pf) / (rm - pf) : 0; // 0=panel,1=crest
          const row = {
            u: +u.toFixed(6),
            t: +t.toFixed(6),
            dev: +g.dev.toFixed(5),
            grad: +gradMag(u, t).toFixed(3),
            amp: +amp.toFixed(4),
            ampFrac: +ampFrac.toFixed(4),
            crestMm: +crestDist(u, t).toFixed(4),
          };
          scatter.push(row);
          appendFileSync(outPath, JSON.stringify(row) + '\n');
        }
        if (f % 20000 === 0 && f > 0) {
          // eslint-disable-next-line no-console
          console.log(`[localize scoring] ${f}/${nF} outliers=${outliers}`);
        }
      }
      writeFileSync(scatterPath, JSON.stringify(scatter));

      // ── histograms + classification ──────────────────────────────────────────
      const q = (arr: number[], p: number): number => {
        const s = [...arr].sort((a, b) => a - b);
        return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
      };
      const ampFracs = scatter.map((s) => s.ampFrac);
      const grads = scatter.map((s) => s.grad);
      const amps = scatter.map((s) => s.amp);
      const crestMms = scatter.map((s) => s.crestMm);
      // global gradient stats (for the "high-|∇r|" reference)
      let gGlobalMed = 0;
      {
        const gs: number[] = [];
        for (let i = 0; i < 40; i++)
          for (let j = 0; j < 40; j++)
            gs.push(gradMag(DOMAIN.uLo + (DOMAIN.uHi - DOMAIN.uLo) * (i / 40), DOMAIN.tLo + (DOMAIN.tHi - DOMAIN.tLo) * (j / 40)));
        gGlobalMed = q(gs, 0.5);
      }
      // ampFrac bins: [0,0.2) panel, [0.2,0.45) toe-lo, [0.45,0.7) mid-flank,
      // [0.7,0.9) toe-hi (near crest), [0.9,1] crest
      const bins = [0, 0, 0, 0, 0];
      for (const af of ampFracs) {
        if (af < 0.2) bins[0]++;
        else if (af < 0.45) bins[1]++;
        else if (af < 0.7) bins[2]++;
        else if (af < 0.9) bins[3]++;
        else bins[4]++;
      }
      const verdict = {
        mode: 'localize',
        maxPass: MAXPASS,
        tris: nF,
        projFullPot: Math.round(nF * PROJ),
        worstMm: +worst.toFixed(5),
        outliers,
        // amplitude-fraction histogram (0=panel floor, 1=rib crest)
        ampFracHist: {
          panel_0to0p2: bins[0],
          toeLo_0p2to0p45: bins[1],
          midFlank_0p45to0p7: bins[2],
          toeHi_0p7to0p9: bins[3],
          crest_0p9to1: bins[4],
        },
        ampFrac_p10: +q(ampFracs, 0.1).toFixed(4),
        ampFrac_p50: +q(ampFracs, 0.5).toFixed(4),
        ampFrac_p90: +q(ampFracs, 0.9).toFixed(4),
        amp_p50_mm: +q(amps, 0.5).toFixed(4),
        amp_p90_mm: +q(amps, 0.9).toFixed(4),
        grad_p50: +q(grads, 0.5).toFixed(3),
        grad_p90: +q(grads, 0.9).toFixed(3),
        gradGlobalMed: +gGlobalMed.toFixed(3),
        gradRatioToGlobal: +(q(grads, 0.5) / (gGlobalMed || 1)).toFixed(3),
        crestMm_p50: +q(crestMms, 0.5).toFixed(4),
        crestMm_p90: +q(crestMms, 0.9).toFixed(4),
        scoringSec: +((Date.now() - t1) / 1000).toFixed(0),
      };
      // eslint-disable-next-line no-console
      console.log('[localize VERDICT]', JSON.stringify(verdict, null, 2));
      writeFileSync(`${OUT}/localize_verdict.json`, JSON.stringify(verdict, null, 2));
    },
    6 * 60 * 60 * 1000,
  );

  // STEP 2: extract the doubled toe band + validate placement sub-0.01 (3D).
  it.skipIf(!RUN || MODE !== 'extract')(
    'STEP 2: extract the doubled toe-band contours + validate 3D placement',
    () => {
      mkdirSync(OUT, { recursive: true });
      const sampler = styleSampler(
        'GothicArches',
        {},
        { H: 120, Rt: 50, Rb: 40 },
      ) as GpuSurfaceSampler;
      const t0 = Date.now();
      const band = extractToeBand(
        sampler,
        FDOMAIN,
        TOE_LO,
        TOE_HI,
        { nu: 640, nt: 640, polishIters: 24 },
        PICKET_MM,
      );
      // Validate 3D placement: bounded 2D nearest-isolevel disp on every vertex.
      const validate = (
        contours: FlankContour[],
        c: number,
      ): { n: number; dispP50: number; dispP90: number; dispMax: number; afMax: number } => {
        const disps: number[] = [];
        const afs: number[] = [];
        for (const cont of contours)
          for (const [u, t] of cont.pts) {
            const r = flankIsoResidual3D(u, t, band.field, c, sampler);
            disps.push(r.disp3D);
            afs.push(r.afErr);
          }
        const q = (a: number[], p: number): number => {
          const s = [...a].sort((x, y) => x - y);
          return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
        };
        return {
          n: disps.length,
          dispP50: +q(disps, 0.5).toFixed(5),
          dispP90: +q(disps, 0.9).toFixed(5),
          dispMax: +Math.max(0, ...disps).toFixed(5),
          afMax: +Math.max(0, ...afs).toFixed(6),
        };
      };
      const vLo = validate(band.lo, TOE_LO);
      const vHi = validate(band.hi, TOE_HI);
      // Persist the contours (as (u,t) polylines) for the embed step.
      const dump = (cs: FlankContour[]): Array<Array<[number, number]>> => cs.map((c) => c.pts);
      writeFileSync(
        `${OUT}/toe_contours.json`,
        JSON.stringify({
          toeLo: TOE_LO,
          toeHi: TOE_HI,
          picketMm: PICKET_MM,
          lo: dump(band.lo),
          hi: dump(band.hi),
        }),
      );
      const verdict = {
        mode: 'extract',
        toeLo: TOE_LO,
        toeHi: TOE_HI,
        picketMm: PICKET_MM,
        loContours: band.lo.length,
        hiContours: band.hi.length,
        loKept: band.loKept,
        loDropped: band.loDropped,
        hiKept: band.hiKept,
        hiDropped: band.hiDropped,
        loVerts: band.lo.reduce((s, c) => s + c.pts.length, 0),
        hiVerts: band.hi.reduce((s, c) => s + c.pts.length, 0),
        placeLo: vLo,
        placeHi: vHi,
        placementSub0p01:
          vLo.dispP90 < 0.01 && vHi.dispP90 < 0.01 && vLo.dispMax < 0.02 && vHi.dispMax < 0.02,
        sec: +((Date.now() - t0) / 1000).toFixed(0),
      };
      // eslint-disable-next-line no-console
      console.log('[extract VERDICT]', JSON.stringify(verdict, null, 2));
      writeFileSync(`${OUT}/extract_verdict.json`, JSON.stringify(verdict, null, 2));
    },
    30 * 60 * 1000,
  );

  // STEP 3+4: embed the doubled toe band as BandContours + run the gate.
  it.skipIf(!RUN || MODE !== 'gate')(
    'STEP 3+4: embed the doubled toe band + gate to whole-mesh 0',
    async () => {
      mkdirSync(OUT, { recursive: true });
      const sampler = styleSampler(
        'GothicArches',
        {},
        { H: 120, Rt: 50, Rb: 40 },
      ) as GpuSurfaceSampler;
      const toe = JSON.parse(readFileSync(`${OUT}/toe_contours.json`, 'utf8')) as {
        picketMm: number;
        lo: Array<Array<[number, number]>>;
        hi: Array<Array<[number, number]>>;
      };
      const toBand = (polys: Array<Array<[number, number]>>): BandContour[] =>
        polys
          .filter((p) => p.length >= 2)
          .map((pts) => ({ pts, maxChordMm: toe.picketMm }));
      const bandContours: BandContour[] = [...toBand(toe.lo), ...toBand(toe.hi)];
      const pickets = placementPickets();
      const complex = buildProtectedComplex(
        sampler,
        'GothicArches',
        undefined,
        pickets,
        bandContours,
      );
      // eslint-disable-next-line no-console
      console.log(
        `[gate COMPLEX] bandContours=${bandContours.length} recovery=${complex.recoveryPct.toFixed(2)} residualCrossings=${complex.residualCrossings} edges=${complex.edges.length}`,
      );

      const pool = new ParallelScorerPool(samplerGrid(sampler), 4);
      const passLog = `${OUT}/gate_${GTAG}_pass.ndjson`;
      writeFileSync(passLog, '');
      let prevTris = 0;
      const t0 = Date.now();
      const refined = await refineToZeroOutliersParallel(
        sampler,
        complex,
        DOMAIN,
        p1Opts(),
        pool,
        (s) => {
          const dTris = s.nTris - prevTris;
          prevTris = s.nTris;
          appendFileSync(
            passLog,
            JSON.stringify({ ...s, projFullPot: Math.round(s.nTris * PROJ), dTris }) + '\n',
          );
        },
      );

      const xyz = liftChartMesh(sampler, refined.uv);
      const g = await pool.scoreDev(xyz, refined.uv, refined.tris, DEFAULT_RULER);
      await pool.close();
      const score = reduceDevArray(g.dev, 0.01, g.bruteCalls);

      // non-manifold by index (non-vacuous: cracked control must move the count).
      const nonMan = (tris: number[]): number => {
        const use = new Map<string, number>();
        for (let f = 0; f < tris.length / 3; f++) {
          const a = tris[3 * f];
          const b = tris[3 * f + 1];
          const c = tris[3 * f + 2];
          for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
            const k = i < j ? `${i}_${j}` : `${j}_${i}`;
            use.set(k, (use.get(k) ?? 0) + 1);
          }
        }
        let bad = 0;
        for (const n of use.values()) if (n > 2) bad++;
        return bad;
      };
      const nm = nonMan(refined.tris);
      const cracked = refined.tris.slice();
      cracked.push(refined.tris[0], refined.tris[1], refined.tris[2]);
      const nmCracked = nonMan(cracked);

      const tris = refined.tris.length / 3;
      const projFull = Math.round(tris * PROJ);
      const result = {
        mode: 'gate',
        tag: GTAG,
        dedupeCellMm: DEDUPE ?? 0.004,
        toeLo: TOE_LO,
        toeHi: TOE_HI,
        picketMm: toe.picketMm,
        bandContours: bandContours.length,
        recoveryPct: +complex.recoveryPct.toFixed(2),
        residualCrossings: complex.residualCrossings,
        capped: refined.capped,
        passes: refined.passes,
        tris,
        projFullPot: projFull,
        underBudget8M: projFull < 8_000_000,
        underBudget10M: projFull < 10_000_000,
        guardOutliers: score.outliers,
        guardMax: +score.maxMm.toFixed(5),
        guardP99: +score.p99.toFixed(5),
        nonManifold: nm,
        nonManCrackedControl: nmCracked,
        literal0:
          score.outliers === 0 &&
          !refined.capped &&
          nm === 0 &&
          nmCracked > nm &&
          projFull <= 10_000_000,
        sec: +((Date.now() - t0) / 1000).toFixed(0),
      };
      // eslint-disable-next-line no-console
      console.log('[gate RESULT]', JSON.stringify(result, null, 2));
      writeFileSync(`${OUT}/gate_${GTAG}_result.json`, JSON.stringify(result, null, 2));
    },
    6 * 60 * 60 * 1000,
  );
});
