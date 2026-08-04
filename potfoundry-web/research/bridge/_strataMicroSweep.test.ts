/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 * STRATA MICRO SWEEP — IS "AN EDGE CROSSING A CREASE" THE UNIVERSAL CAUSE? `PF_SWEEP=1`, INERT BY DEFAULT.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `_strataMicro.test.ts` proved, on ONE fundamental domain of GothicArches, that over-tolerance facets are
 * the ones whose edges CROSS A CREASE (risk ratio 74.4x, odds ratio 2202) and that 69.7% of them PASS the
 * driver's own accept test. This file asks whether that is a property of Gothic or of the mesher, by
 * running the same contingency on every style's mesh.
 *
 * ─── WHAT THIS FILE REFUSES TO DO, because it is the failure mode that would make the sweep worthless ───
 * **IT WILL NOT MEASURE A SMOOTH CYLINDER AND CALL IT A STYLE.** Two independent guards, both reported per
 * style, both able to disqualify a row:
 *   T0  the mesh's vertices must lie on the rA this file evaluates. Params are read from the mesh's OWN
 *       report header, never assumed from the registry, so a mesh built at non-default params is measured
 *       against the surface it was actually built on — and a mismatch is caught rather than averaged in.
 *   FA  FEATURE AMPLITUDE, measured on the analytic surface: the circumferential relief (departure of r
 *       from its own theta-mean at each z) and the max directional second difference at a fixed physical
 *       step. A style whose registry default switches its pattern OFF reads ~0 here and is FLAGGED, not
 *       silently included.
 * This guard exists because `SuperformulaBlossom`'s registry default is `sfStrength: 0`, and
 * `styles.ts:181` computes `r0 + (sfResult - r0) * strength` — so at the default it returns the smooth
 * base radius EXACTLY. Its committed mesh is a smooth cylinder. That is a control, not a style, and it is
 * labelled as one.
 *
 * ─── COVERAGE, AND WHY IT IS NOT A STRIDE ───
 * An earlier draft strided the facet index. That is wrong here for two reasons and the draft was replaced:
 *   1. **STL index order is the mesher's CONSTRUCTION order** — initial grid rows first, then split children
 *      appended in pairs. A fixed stride can alias with that structure and sample one child of every pair,
 *      or one grid column repeatedly. It is the same class of error as the campaign's own ruler-aliasing
 *      trap, where a 512x256 sampler against a 2^9 x 2^8 mesh landed every sample on a vertex and read
 *      500,000x wrong.
 *   2. **The defect is CLUSTERED** (12-fold, on the arch midline). A sparse sample dilutes exactly the
 *      pattern being looked for.
 * So: **complete coverage of several contiguous z-BANDS.** Every facet inside a band is measured — no
 * sampling within it, so local structure survives intact — and several bands spread up the wall cover
 * z-variation (Bamboo's 24 mm node period, DragonScales' 15 mm rows). Band width is auto-sized to a facet
 * budget; the bands actually used are printed, so the coverage is visible rather than assumed. Rim rows
 * (within `PF_SW_RIM_MM` of z=0 or z=H) are excluded under the standing BasketWeave caveat — that band is
 * a ring boundary, not a tessellation result.
 */
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StyleDims } from './labkit';
import { certifyTriangle, detectThetaJumps, detectZJumps, type RadiusFn } from './_facetTruthLib';
import { buildAuditRadiusFn } from './_facetTruthRA';
import { readMeshFloat64 } from './_facetTruthPool';
import { locateKinkRaw, canonTheta, dThRaw, type SweepPredConst } from './_sweepPredicate';
import { makeSagArgmax } from './_sagKernel';
import { TWO_PI, type Tri, driverAcceptQuantity } from './_strataMicroLib';

const RUN = process.env.PF_SWEEP === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const DIR = 'research/exchange/_strataConformBisect';

function envF(n: string, d: number): number {
  const r = process.env[n];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const q50 = (a: number[]): number => (a.length === 0 ? 0 : [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]);

const STYLE_KEYS: [string, string][] = [
  ['artdeco', 'ArtDeco'], ['bamboosegments', 'BambooSegments'], ['basketweave', 'BasketWeave'],
  ['celticknot', 'CelticKnot'], ['celtictriquetra', 'CelticTriquetra'], ['crystalline', 'Crystalline'],
  ['dragonscales', 'DragonScales'], ['fourierbloom', 'FourierBloom'], ['geometricstar', 'GeometricStar'],
  ['gothicarches', 'GothicArches'], ['gyroidmanifold', 'GyroidManifold'], ['harmonicripple', 'HarmonicRipple'],
  ['hexagonalhive', 'HexagonalHive'], ['lowpolyfacet', 'LowPolyFacet'], ['rippleinterference', 'RippleInterference'],
  ['spiralridges', 'SpiralRidges'], ['superellipsemorph', 'SuperellipseMorph'],
  ['superformulablossom', 'SuperformulaBlossom'], ['voronoi', 'Voronoi'], ['waveinterference', 'WaveInterference'],
];

/** Resolve a style's mesh + the params and acceptTol it was ACTUALLY built with, from its own report. */
function resolveMesh(key: string, prefer: string | null): {
  stl: string; params: Record<string, number>; acceptUm: number; tris: number; header: string;
} | null {
  const files = readdirSync(DIR);
  const stem = prefer !== null
    ? files.find((f) => f === `${prefer}.stl`)
    : files.filter((f) => f.startsWith(`${key}_ring_D--`) && f.endsWith('.stl') && !f.includes('GPURANK'))
      .sort()[0];
  if (stem === undefined) return null;
  const base = stem.replace(/\.stl$/, '');
  const rep = join(DIR, `${base}.report.txt`);
  if (!existsSync(rep)) return null;
  const txt = readFileSync(rep, 'utf8');
  const pm = txt.match(/^params (\{.*\})$/m);
  if (pm === null) return null;
  const am = txt.match(/acceptTol\s+([\d.]+)\s*µm/);
  const gm = txt.match(/→\s*(\d+)\s*tris/);
  const hm = txt.match(/^=====.*$/m);
  return {
    stl: join(DIR, stem),
    params: JSON.parse(pm[1]) as Record<string, number>,
    acceptUm: am === null ? 3.5 : Number(am[1]),
    tris: gm === null ? 0 : Number(gm[1]),
    header: hm === null ? '' : hm[0].trim(),
  };
}

/**
 * FEATURE AMPLITUDE — measured on the analytic surface, no mesh involved.
 * `reliefUm`  max |r(theta,z) - mean_theta r(.,z)| : the circumferential pattern depth. Zero for any
 *             body of revolution, so it alone would wrongly clear a z-only style (Bamboo's rings).
 * `d2Um`      max directional second difference at a fixed PHYSICAL step: catches features in either
 *             direction and is the same quantity the crease classifier uses.
 * A style that reads ~0 on BOTH is geometrically a smooth cylinder whatever its name says.
 */
/**
 * LOCUS STRENGTH — a THRESHOLD-FREE continuous predictor, and the reason it replaced the binary one.
 *
 * The first version asked `locateKinkRaw` whether an edge crosses a kink. That is the driver's own
 * detector and it carries the driver's own constants (`kinkRatio 0.15`, `jumpRatio 0.62`), which are tuned
 * for GothicArches-scale creases. On BasketWeave it fired on NOTHING — 0 of 2,680 facets, failing and
 * clean alike — so the test could not distinguish the two groups on a style with 72 real failures. A
 * predictor that returns a constant is not measuring anything.
 *
 * This one has no thresholds and no classification. It reports how sharply the SURFACE bends under each
 * facet: the largest second difference of r along the facet's own edges, at a fixed PHYSICAL step, in um.
 * Smooth wall reads near zero; a crease or a jump reads large. The contingency then becomes a comparison
 * of DISTRIBUTIONS (median locus strength of failing vs clean facets), which works on every style because
 * nothing has to be decided in advance about what counts as a feature.
 */
function locusStrength(rA: RadiusFn, t: Tri, nSamp: number, hMm: number): number {
  let worst = 0;
  for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) {
    const dth = dThRaw(t.th[i], t.th[j]);
    const dz = t.z[j] - t.z[i];
    for (let s = 1; s < nSamp; s += 1) {
      const u = s / nSamp;
      const th = t.th[i] + dth * u; const z = t.z[i] + dz * u;
      const r0 = rA(canonTheta(th), z);
      // step ALONG the edge, in physical mm, so long and short edges are measured on the same scale
      const segLen = Math.hypot(dth * Math.max(r0, 1e-9), dz);
      if (!(segLen > 0)) continue;
      const fth = (dth / segLen) * hMm; const fz = (dz / segLen) * hMm;
      const rp = rA(canonTheta(th + fth), Math.min(H, Math.max(0, z + fz)));
      const rm = rA(canonTheta(th - fth), Math.min(H, Math.max(0, z - fz)));
      const d2 = Math.abs(rp - 2 * r0 + rm);
      if (d2 > worst) worst = d2;
    }
  }
  return worst * 1000;
}

function featureAmplitude(rA: RadiusFn, nTh: number, nZ: number, hMm: number): { reliefUm: number; d2Um: number } {
  let relief = 0; let d2 = 0;
  for (let j = 0; j <= nZ; j += 1) {
    const z = (H * j) / nZ;
    let sum = 0; const rs = new Float64Array(nTh);
    for (let i = 0; i < nTh; i += 1) { const r = rA((TWO_PI * i) / nTh, z); rs[i] = r; sum += r; }
    const mean = sum / nTh;
    for (let i = 0; i < nTh; i += 1) if (Math.abs(rs[i] - mean) > relief) relief = Math.abs(rs[i] - mean);
    for (let i = 0; i < nTh; i += 1) {
      const th = (TWO_PI * i) / nTh;
      const r0 = rs[i];
      const dth = hMm / Math.max(r0, 1e-9);
      const a = Math.abs(rA(canonTheta(th + dth), z) - 2 * r0 + rA(canonTheta(th - dth), z));
      const zp = Math.min(H, z + hMm); const zm = Math.max(0, z - hMm);
      const b = Math.abs(rA(th, zp) - 2 * r0 + rA(th, zm));
      if (a > d2) d2 = a;
      if (b > d2) d2 = b;
    }
  }
  return { reliefUm: relief * 1000, d2Um: d2 * 1000 };
}

describe('STRATA MICRO SWEEP — crease-crossing as a cross-style cause', () => {
  it.runIf(RUN)('runs the crease/over-tolerance contingency on every style', () => {
    const TOL = envF('PF_SW_TOL_UM', 10) / 1000;
    const NSAMP = envI('PF_SW_SAMPLE', 6000);
    const RIM = envF('PF_SW_RIM_MM', 0.1);
    const NMAX = envI('PF_SW_NMAX', 256);
    const OUT = process.env.PF_SW_OUT ?? join('research', 'exchange', '_strataMicro');
    const TAG = process.env.PF_SW_TAG ?? 'SWEEP';
    const ONLY = (process.env.PF_SW_ONLY ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
    const EXTRA = (process.env.PF_SW_EXTRA ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
    const FA_BAR = envF('PF_SW_FA_BAR_UM', 10);

    mkdirSync(OUT, { recursive: true });
    const L: string[] = [];
    const t0 = Date.now();
    // Vitest BUFFERS a fork's stdout until the test finishes, so `console.log` is invisible while a
    // multi-hour sweep is running and a killed run leaves nothing at all. Progress goes to a FILE, the
    // same discipline the Phase D instrument uses.
    const progress = join(OUT, `${TAG}.progress.log`);
    writeFileSync(progress, '', 'utf8');
    const say = (s: string): void => {
      L.push(s);
      const line = `+${((Date.now() - t0) / 1000).toFixed(0)}s  ${s}`;
      try { appendFileSync(progress, `${line}\n`); } catch { /* a log write never aborts a run */ }
      // eslint-disable-next-line no-console
      console.log(`[SWEEP] ${s}`);
    };

    say('===== STRATA MICRO SWEEP — does an edge crossing a crease predict being over tolerance? =====');
    say(`TOL ${(TOL * 1000).toFixed(1)} um   stride sample ${NSAMP} facets/style   rim band excluded ${RIM} mm   certify nMax ${NMAX}`);
    say('params and acceptTol are read from each mesh\'s OWN report header, never assumed.');
    say('');

    interface Row {
      style: string; mesh: string; tris: number; sampled: number;
      t0WorstUm: number; t0Pass: boolean;
      reliefUm: number; d2Um: number; featured: boolean;
      over: number; overCross: number; clean: number; cleanCross: number;
      overCrease: number; overJump: number; cleanCrease: number; cleanJump: number;
      lsOverP50: number; lsCleanP50: number; lsSep: number;
      riskRatio: number; oddsRatio: number;
      acceptedBlind: number; blindP50: number; blindMax: number;
      zSteps: number; thJumps: number; acceptUm: number; wallSec: number;
      note: string;
    }
    const rows: Row[] = [];
    const targets: { key: string; style: string; prefer: string | null; label: string }[] = [];
    for (const [key, style] of STYLE_KEYS) {
      if (ONLY.length > 0 && !ONLY.includes(key)) continue;
      targets.push({ key, style, prefer: null, label: style });
    }
    // PF_SW_EXTRA takes explicit "<basename>:<StyleName>[:<label>]" triples — used for the SFB strength
    // pair, which is a CONTROLLED COMPARISON (one parameter apart, same code, same day) rather than a
    // corpus member. `style` must stay the real registry id because it selects the radius function; the
    // label only changes how the row prints, so the two arms are distinguishable in the table.
    for (const e of EXTRA) {
      const [base, style, label] = e.split(':');
      if (base !== undefined && style !== undefined) {
        targets.push({ key: base, style, prefer: base, label: label ?? base });
      }
    }

    for (const tgt of targets) {
      const ts = Date.now();
      const m = resolveMesh(tgt.key, tgt.prefer);
      if (m === null) { say(`${tgt.label.padEnd(20)} NO MESH/REPORT — skipped`); continue; }
      say(`>>> ${tgt.label} — ${m.stl.split(/[\\/]/).pop() ?? ''} (${m.tris} tris, acceptTol ${m.acceptUm} um) ...`);
      const auditR = buildAuditRadiusFn(tgt.style, m.params, DIMS, H);
      const rA = auditR.rA;
      const fa = featureAmplitude(rA, 720, 240, 0.2);
      const featured = fa.reliefUm >= FA_BAR || fa.d2Um >= FA_BAR;
      const { xyz, nTri } = readMeshFloat64(m.stl, false);
      const zJumps = detectZJumps(rA, H);
      const thJumps = detectThetaJumps(rA, H);
      const PRED: SweepPredConst = {
        esN: 8, refHs: 0.03, refNmax: 64, kinkScan: 16, kinkHalvings: 24,
        kinkRatio: 0.15, jumpRatio: 0.62, snap: true, confMm: 0.0006,
      };
      const build = (t: number): Tri => {
        const o = t * 9;
        const th0 = canonTheta(Math.atan2(xyz[o + 1], xyz[o]));
        const th1 = canonTheta(Math.atan2(xyz[o + 4], xyz[o + 3]));
        const th2 = canonTheta(Math.atan2(xyz[o + 7], xyz[o + 6]));
        return {
          x: [xyz[o], xyz[o + 3], xyz[o + 6]],
          y: [xyz[o + 1], xyz[o + 4], xyz[o + 7]],
          z: [xyz[o + 2], xyz[o + 5], xyz[o + 8]],
          th: [th0, th0 + dThRaw(th0, th1), th0 + dThRaw(th0, th2)],
        };
      };
      // T0 — vertex radial control
      let t0Worst = 0;
      {
        const st = Math.max(1, Math.floor(nTri / 300));
        for (let t = 0; t < nTri; t += st) {
          const o = t * 9;
          for (let k = 0; k < 3; k += 1) {
            const x = xyz[o + k * 3]; const y = xyz[o + k * 3 + 1]; const z = xyz[o + k * 3 + 2];
            const dr = Math.abs(Math.hypot(x, y) - rA(canonTheta(Math.atan2(y, x)), z)) * 1000;
            if (dr > t0Worst) t0Worst = dr;
          }
        }
      }
      const t0Pass = t0Worst <= envF('PF_SW_T0_BAR_UM', 1);
      // ── COMPLETE COVERAGE OF K CONTIGUOUS z-BANDS (no stride; see the header) ──
      // Band width is derived from the facet budget and the mesh's own facet density, then floored so a
      // band is never thinner than a plausible feature period in z. Every facet whose centroid falls in a
      // band is measured.
      // ── VERTICAL STRIPS, COMPLETE IN z, AT SEVERAL theta PHASES ──
      // An earlier draft used horizontal RINGS at fixed heights and it failed on its second style: the
      // rings sat at z=15/45/75/105 while BambooSegments' five nodes sit at z~12/36/60/84/108, so every
      // ring landed in the smooth barrel BETWEEN the features and the style read 0 over-tolerance facets.
      // That is the same aliasing hazard as an index stride, rotated 90 degrees.
      //
      // Strips invert the exposure and are the right way round for this corpus: z-features are FEW and
      // LOCALISED (Bamboo's 5 nodes, DragonScales' 8 rows), so a strip that spans the whole wall cannot
      // miss them; theta-features are MANY and PERIODIC (12 arches, 16 strands), so several strips at
      // different phases catch them even when one strip falls in a gap. Each strip is COMPLETE — every
      // facet inside it is measured — and the width is fitted to the facet budget by halving.
      // ── STRIP PHASES ARE GOLDEN-RATIO SPACED, NOT EVENLY SPACED, AND THAT IS LOAD-BEARING ──
      // Evenly spaced strips RESONATE with a style's own symmetry order and read a false zero. Measured:
      // 8 strips at 45 deg against GeometricStar's `gsPoints: 8` (45 deg period) put EVERY strip on the
      // identical phase of the pattern, and the style read 0 over-tolerance facets of 2,480 — against the
      // campaign's own full-coverage measurement of 16.9% over 10 um on the SAME 885,400-triangle
      // artifact. BasketWeave (`bwStrands 16` = 22.5 deg), Crystalline (`crFacetCount 12` = 30 deg) and
      // ArtDeco (`adFanCount 8`) all divide 45 deg the same way.
      // The golden angle is irrational with respect to every period, so no symmetry order can resonate
      // with it — the same low-discrepancy device the campaign's own rulers use after the 512x256-sampler
      // aliasing trap (prime counts + an irrational offset).
      const nStrips = envI('PF_SW_STRIPS', 8);
      const usableH = H - 2 * RIM;
      const PHI_INV = 0.6180339887498949;
      const phases: number[] = [];
      for (let s = 0; s < nStrips; s += 1) phases.push(TWO_PI * ((s * PHI_INV) % 1));
      let stripW = Math.min(TWO_PI / nStrips, Math.max(1e-4, (TWO_PI * NSAMP) / Math.max(1, nTri)));
      const collect = (w: number): number[] => {
        const out: number[] = [];
        for (let t = 0; t < nTri; t += 1) {
          const o = t * 9;
          const zmin = Math.min(xyz[o + 2], xyz[o + 5], xyz[o + 8]);
          const zmax = Math.max(xyz[o + 2], xyz[o + 5], xyz[o + 8]);
          if (zmin <= RIM || zmax >= H - RIM) continue;
          const thc = canonTheta(Math.atan2(
            (xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3,
            (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3,
          ));
          if (phases.some((p) => Math.abs(dThRaw(p, thc)) <= w / 2)) out.push(t);
        }
        return out;
      };
      let picked = collect(stripW);
      for (let guard = 0; guard < 14 && picked.length > NSAMP * 1.5; guard += 1) {
        stripW /= 2; picked = collect(stripW);
      }
      const arg = makeSagArgmax();
      let over = 0; let overCross = 0; let clean = 0; let cleanCross = 0; let sampled = 0;
      let overCrease = 0; let overJump = 0; let cleanCrease = 0; let cleanJump = 0;
      const lsOver: number[] = []; const lsClean: number[] = [];
      let accBlind = 0; const blind: number[] = [];
      for (const t of picked) {
        const tri = build(t);
        sampled += 1;
        const v = certifyTriangle(rA, tri.x[0], tri.y[0], tri.z[0], tri.x[1], tri.y[1], tri.z[1],
          tri.x[2], tri.y[2], tri.z[2], { H, tol: TOL, nMax: NMAX, zJumps, thJumps });
        // CLASSIFY ON A WITNESSED EXCEEDANCE, not on the bound. `witnessed > tol` is a point the ruler
        // actually found over the bar — definitive, and `certifyTriangle` SHORT-CIRCUITS on it, so the
        // failing facets are the cheap ones. Classifying on `bound` instead would force every clean facet
        // to be certified all the way to nMax, which is where an earlier draft spent all its time.
        // The cost is that a facet with a subtle exceedance the lattice misses lands in "clean" — which
        // DILUTES the contrast and makes the association measured below CONSERVATIVE, never inflated.
        const isOver = v.witnessed > TOL;
        // ── CROSSES A FEATURE LOCUS OF EITHER CLASS ──
        // The first draft tested `!k.jump` only — a crease. That was right for GothicArches, which is a
        // pure crease style, and WRONG as a general predictor: it scored BasketWeave (9 detected C0
        // z-steps) at risk-ratio 0.0 with 104 real failures, because every one of its loci is a JUMP and
        // the filter threw them all away. The hypothesis was never "crosses a crease" — it is "an edge
        // spans a FEATURE LOCUS the mesh does not conform to". Both classes are counted, and kept apart,
        // so the crease/jump split is visible rather than assumed.
        let crossCrease = false; let crossJump = false;
        for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) {
          const k = locateKinkRaw(rA, tri.th[i], tri.z[i], tri.th[i] + dThRaw(tri.th[i], tri.th[j]), tri.z[j], PRED);
          if (k === null || !(k.t > 0.02 && k.t < 0.98)) continue;
          if (k.jump) crossJump = true; else crossCrease = true;
        }
        const cross = crossCrease || crossJump;
        const ls = locusStrength(rA, tri, envI('PF_SW_LS_N', 12), envF('PF_SW_LS_H_UM', 50) / 1000);
        if (isOver) {
          lsOver.push(ls);
          over += 1; if (cross) overCross += 1;
          if (crossCrease) overCrease += 1;
          if (crossJump) overJump += 1;
          const acc = driverAcceptQuantity(rA, tri, 0.03, 12, 64, arg) * 1000;
          if (acc <= m.acceptUm) accBlind += 1;
          blind.push((v.witnessed * 1000) / Math.max(acc, 1e-9));
        } else {
          lsClean.push(ls);
          clean += 1; if (cross) cleanCross += 1;
          if (crossCrease) cleanCrease += 1;
          if (crossJump) cleanJump += 1;
        }
      }
      const pOver = overCross / Math.max(1, over);
      const pClean = cleanCross / Math.max(1, clean);
      blind.sort((a, b) => a - b);
      const row: Row = {
        style: tgt.label, mesh: m.stl.split(/[\\/]/).pop() ?? '', tris: nTri, sampled,
        t0WorstUm: t0Worst, t0Pass,
        reliefUm: fa.reliefUm, d2Um: fa.d2Um, featured,
        over, overCross, clean, cleanCross,
        overCrease, overJump, cleanCrease, cleanJump,
        lsOverP50: q50(lsOver), lsCleanP50: q50(lsClean), lsSep: q50(lsOver) / Math.max(q50(lsClean), 1e-9),
        riskRatio: pOver / Math.max(pClean, 1e-9),
        oddsRatio: (overCross * (clean - cleanCross)) / Math.max((over - overCross) * cleanCross, 1e-9),
        acceptedBlind: accBlind,
        blindP50: blind.length > 0 ? blind[Math.floor(0.5 * blind.length)] : 0,
        blindMax: blind.length > 0 ? blind[blind.length - 1] : 0,
        zSteps: zJumps.length, thJumps: thJumps.length, acceptUm: m.acceptUm,
        wallSec: (Date.now() - ts) / 1000,
        note: !t0Pass ? 'T0 FAIL — measured to the wrong surface' : !featured ? 'FEATURELESS — smooth control, not a style' : '',
      };
      rows.push(row);
      say(`${tgt.label.padEnd(20)} ${String(nTri).padStart(9)} tris  T0 ${t0Worst.toFixed(3).padStart(7)} um  `
        + `relief ${fa.reliefUm.toFixed(0).padStart(6)} um  d2 ${fa.d2Um.toFixed(1).padStart(7)} um  `
        + `over ${String(over).padStart(5)}/${String(sampled).padStart(6)}  RR ${row.riskRatio.toFixed(1).padStart(7)}  cr|jp ${String(overCrease)}|${String(overJump)}  LS ${q50(lsOver).toFixed(1)}/${q50(lsClean).toFixed(1)}  `
        + `blind ${(100 * accBlind / Math.max(1, over)).toFixed(0).padStart(3)}%  ${row.note}`);
      say(`${' '.repeat(20)} coverage: ${nStrips} vertical strips x ${(stripW * 180 / Math.PI).toFixed(3)} deg, `
        + `COMPLETE in z over [${RIM}, ${(H - RIM).toFixed(1)}] = ${(100 * sampled / Math.max(1, nTri)).toFixed(1)}% of facets`);
      writeFileSync(join(OUT, `${TAG}.json`), JSON.stringify({ schema: 'pf.strata.microSweep/1', tolUm: TOL * 1000, rows }, null, 1), 'utf8');
    }

    // ─── THE TABLE ───
    say('');
    say('═════ CONTINGENCY BY STYLE — over-tolerance vs crosses-a-crease, stride sample, rim excluded ═════');
    say('  "locus" = an edge crossing a located kink of EITHER class. The crease/jump split follows it.');
    say('style                 featured   over/sampled  locus|over  locus|clean    RISK    ODDS  crease|jump  LOCUS-STRENGTH p50 over/clean  SEP  blind%  blindness p50/max');
    for (const r of rows) {
      const po = 100 * r.overCross / Math.max(1, r.over);
      const pc = 100 * r.cleanCross / Math.max(1, r.clean);
      say(`${r.style.padEnd(20)} ${(r.featured ? 'yes' : 'NO ').padStart(6)}   `
        + `${String(r.over).padStart(5)}/${String(r.sampled).padEnd(6)} `
        + `${po.toFixed(1).padStart(9)}% ${pc.toFixed(1).padStart(11)}% `
        + `${r.riskRatio.toFixed(1).padStart(8)} ${r.oddsRatio.toFixed(0).padStart(7)}  `
        + `${String(r.overCrease).padStart(8)}|${String(r.overJump).padEnd(6)} `
        + `${r.lsOverP50.toFixed(1).padStart(8)}/${r.lsCleanP50.toFixed(1).padEnd(8)}${r.lsSep.toFixed(1).padStart(6)}x `
        + `${(100 * r.acceptedBlind / Math.max(1, r.over)).toFixed(0).padStart(5)}%  `
        + `${r.blindP50.toFixed(1).padStart(8)}x /${r.blindMax.toFixed(0).padStart(6)}x`);
    }
    const usable = rows.filter((r) => r.featured && r.t0Pass && r.over >= 20);
    say('');
    say(`ROWS SCORED: ${usable.length} of ${rows.length} (need featured + T0 pass + >=20 over-tol facets in the sample)`);
    if (usable.length > 0) {
      const rr = usable.map((r) => r.riskRatio).sort((a, b) => a - b);
      const bl = usable.map((r) => 100 * r.acceptedBlind / Math.max(1, r.over)).sort((a, b) => a - b);
      say(`  RISK RATIO across scored styles: min ${rr[0].toFixed(1)}  median ${rr[Math.floor(rr.length / 2)].toFixed(1)}  max ${rr[rr.length - 1].toFixed(1)}`);
      say(`  ACCEPTED-BLIND share:            min ${bl[0].toFixed(0)}%  median ${bl[Math.floor(bl.length / 2)].toFixed(0)}%  max ${bl[bl.length - 1].toFixed(0)}%`);
      const weak = usable.filter((r) => r.riskRatio < 2);
      say(`  styles where crease-crossing does NOT predict on the LOCUS test (RR < 2): ${weak.length === 0 ? 'NONE' : weak.map((r) => r.style).join(', ')}`);
    }
    for (const r of rows.filter((x) => x.note !== '')) say(`  NOTE  ${r.style}: ${r.note}`);
    say('');
    say(`wall ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    writeFileSync(join(OUT, `${TAG}.report.txt`), `${L.join('\n')}\n`, 'utf8');
    writeFileSync(join(OUT, `${TAG}.json`), JSON.stringify({ schema: 'pf.strata.microSweep/1', tolUm: TOL * 1000, rows }, null, 1), 'utf8');
  }, 6_000_000);
});
