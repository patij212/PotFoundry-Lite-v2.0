// _pinBandRelax.test.ts — is the `levelCap` PIN-GRADED BAND the mechanism that FREEZES the
// analytic-scored conforming mesh above 0.01mm, and does relaxing the grading (keeping ONLY the
// t=0/t=1 rim ROWS pinned) close it? (PF_PINBAND=1)
//
// HYPOTHESIS (pre-registered, written BEFORE any arm was run):
//   H1 (mechanism): every surviving >0.01mm facet of the analytic-scored mesh sits in a cell whose
//      level EQUALS `PeriodicBalancedQuadtree.levelCap(level,it) = min(maxLevel, pin +
//      floor(nearEdge*2^pin))` — i.e. CAP-limited, not sag-satisfied — while the exact-analytic sag
//      criterion still EXCEEDS its target there and the cell's longest edge is far above `minEdgeMm`
//      (so neither the scorer nor the physical floor is what stops the split). Because the cap does
//      not depend on `maxLevel` inside the band, the residual is DENSITY-INVARIANT by construction.
//   H2 (fix): replacing the LINEAR pin-row grading with the TIGHT 2:1-compatible GEOMETRIC grading
//      (a level-(pin+j) cell needs nearEdge >= (2 - 2^(1-j))/2^pin) frees the band INTERIOR to reach
//      `maxLevel` while the t=0/t=1 rows stay at exactly `pin`, dropping the whole-mesh true-3D MAX.
//
// KILL-CRITERION (pre-registered):
//   H1 CONFIRMED iff, for the frozen worst facet, level == levelCap AND analytic dev > sagMm AND
//     longestEdge > minEdgeMm, at >= 2 distinct maxLevels with an IDENTICAL cap.
//     H1 REFUTED iff level < levelCap (the cell could have refined and chose not to).
//   H2 CONFIRMED iff whole-mesh true-3D MAX drops >= 2x vs the same build with the flag OFF, with
//     bottomRing/topRing length == nRing (ascending U) and nonMan == 0 unchanged.
//     H2 CLOSED iff whole-mesh MAX <= 0.01. H2 REFUTED iff MAX >= 0.9x the flag-OFF MAX.
//     H2 NO-OP-ON-MAX (the pre-registered third outcome) iff the p99/band residual improves but the
//     MAX is unmoved because the worst facet sits in the PINNED ROW ITSELF (nearEdge < 1/2^pin),
//     which the relaxation deliberately does not touch — in which case the NEXT mechanism is the pin
//     LEVEL (nRing), and it must be demonstrated with its own density-invariance sweep.
//
// CONTROLS: ONE lever per arm (the `__pfConformingPinBandRelax` flag; analytic scoring is ON in
// BOTH arms, same dims / sizing / budget cap / nRing / uBias). ONE ruler both meshes:
// `perFaceTrue3DSag` (labkit) lifted with the exact `buildAnalyticRadiusFn`.
//
// Resilience: one it() per question, ndjson appended the INSTANT an arm finishes.
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildConformingWall } from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import { extractAnalyticFeatures } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { assembleWatertight, computeUBias } from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import { GpuSurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { buildStyleParamPayload } from '../../src/utils/styleParams';
import type { StyleId } from '../../src/geometry/types';
import type { SurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import {
  perFaceTrue3DSag, auditNonManByIndex, triangleQualityDistribution, vertErrColors, dumpRenderBins,
} from './labkit';

const OUT = join('research', 'exchange', '_pinBandRelax');
mkdirSync(OUT, { recursive: true });
const NDJSON = join(OUT, 'scorecard.ndjson');
const CAPJSON = join(OUT, 'capproof.ndjson');

/** PROD dims — the HARDCARD / ANALYTIC-SCORE config. */
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };

const LEVEL = Number(process.env.PF_PB_LEVEL ?? 13);
const CAP = Number(process.env.PF_PB_CAP ?? 12_000_000);
const SAG = Number(process.env.PF_PB_SAG ?? 0.05);
const ASAG = Number(process.env.PF_PB_ASAG ?? 0.01);
const ASAMP = Number(process.env.PF_PB_ASAMP ?? 3);
const PREFILTER = Number(process.env.PF_PB_PREFILTER ?? 0.004);
const NRING = Number(process.env.PF_PB_NRING ?? 2048);
const MINEDGE = Number(process.env.PF_PB_MINEDGE ?? 0.02);
const SEAM_BAND = 0.002;

type RelaxMode = 'off' | 'geometric' | 'rowsOnly';
function setRelax(mode: RelaxMode): void {
  const g = globalThis as unknown as { __pfConformingPinBandRelax?: string };
  if (mode === 'off') delete g.__pfConformingPinBandRelax;
  else g.__pfConformingPinBandRelax = mode;
}
function setAnalyticScore(on: boolean): void {
  (globalThis as unknown as { __pfConformingAnalyticScore?: boolean }).__pfConformingAnalyticScore = on;
}

/** The SHIPPED linear pin-row grading (mirrors PeriodicBalancedQuadtree.levelCap). */
function capLinear(level: number, it: number, pin: number, maxLevel: number): number {
  if (pin <= 0) return maxLevel;
  const span = 1 << level;
  const nearEdge = Math.min(it / span, 1 - (it + 1) / span);
  return Math.min(maxLevel, pin + Math.floor(nearEdge * (1 << pin) + 1e-9));
}
/** The TIGHT 2:1-compatible geometric grading (the proposed relaxation). */
function capGeometric(level: number, it: number, pin: number, maxLevel: number): number {
  if (pin <= 0) return maxLevel;
  const span = 1 << level;
  const nearEdge = Math.min(it / span, 1 - (it + 1) / span);
  const d = nearEdge * (1 << pin); // distance in pinned-row heights
  if (d < 1 - 1e-9) return pin; // the pinned row itself
  if (d >= 2 - 1e-9) return maxLevel;
  // largest j with d >= 2 - 2^(1-j)
  const j = Math.max(1, Math.ceil(1 - Math.log2(2 - d) - 1e-9));
  return Math.min(maxLevel, pin + j);
}

interface CellProbe {
  label: string; level: number; iu: number; it: number; pin: number; uBias: number;
  t0: number; t1: number; nearEdge: number; pinRow: number;
  capL11: number; capL12: number; capL13: number; capL14: number;
  capGeoL13: number; capGeoL14: number;
  cellArcMm: number; cellHeightMm: number; longestEdgeMm: number;
  /** exact-vs-bilinear deviation of the WHOLE cell (the criterion's own quantity). */
  dev: number;
  /** max sub-cell deviation under an (mu x mt) split — the u-vs-t decomposition. */
  split: Record<string, number>;
}

describe.skipIf(process.env.PF_PINBAND !== '1')('levelCap pin-graded band — mechanism + relaxation', () => {
  // ---------------------------------------------------------------- P1: cap proof
  it.skipIf(process.env.PF_PB_PROBE !== 'capproof')('P1 the frozen worst facet is CAP-LIMITED', () => {
    const style: StyleId = 'Crystalline';
    const [, packed] = buildStyleParamPayload(style, {});
    const sampler: SurfaceSampler = styleSampler(style, {}, DIMS);
    const uBias = computeUBias(sampler, false);
    const pin = Math.max(1, Math.round(Math.log2(NRING)) - uBias);
    const rA = buildAnalyticRadiusFn(style, {}, DIMS);
    void packed;
    const pos = (u: number, t: number): [number, number, number] => {
      const th = u * 2 * Math.PI, z = t * DIMS.H, r = rA(th, z);
      return [r * Math.cos(th), r * Math.sin(th), z];
    };
    /** exact-vs-bilinear-corner deviation on a k x k interior grid (mirrors analyticSagExceeds). */
    const cellDev = (u0: number, uSize: number, t0: number, tSize: number, k: number): number => {
      const p00 = pos(u0, t0), p10 = pos(u0 + uSize, t0);
      const p01 = pos(u0, t0 + tSize), p11 = pos(u0 + uSize, t0 + tSize);
      let worst = 0;
      for (let p = 0; p < k; p++) {
        const a = (p + 0.5) / k;
        for (let q = 0; q < k; q++) {
          const b = (q + 0.5) / k;
          const ex = pos(u0 + a * uSize, t0 + b * tSize);
          let d2 = 0;
          for (let c = 0; c < 3; c++) {
            const lo = p00[c] + (p10[c] - p00[c]) * a;
            const hi = p01[c] + (p11[c] - p01[c]) * a;
            const e = lo + (hi - lo) * b - ex[c];
            d2 += e * e;
          }
          if (d2 > worst) worst = d2;
        }
      }
      return Math.sqrt(worst);
    };
    const splitDev = (u0: number, uS: number, t0: number, tS: number, mu: number, mt: number): number => {
      let worst = 0;
      for (let a = 0; a < mu; a++) {
        for (let b = 0; b < mt; b++) {
          const d = cellDev(u0 + (a * uS) / mu, uS / mu, t0 + (b * tS) / mt, tS / mt, 13);
          if (d > worst) worst = d;
        }
      }
      return worst;
    };
    const dist = (a: number[], b: number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    // The two frozen loci measured in E-2026-07-24-ANALYTIC-SCORE (scorecard.ndjson):
    //   A = the whole-mesh MAX facet (0.07369, identical at L11/L12/L13/L14)
    //   B = the worst BAND-INTERIOR facet at L13/L14 (0.01517, pin-row 3)
    const loci: Array<{ label: string; u: number; t: number; level: number }> = [
      { label: 'A worst-of-mesh (pin row 0)', u: 0.800049, t: 0.999674, level: pin },
      { label: 'B worst band-interior (pin row 3)', u: 0.216878, t: 0.99349, level: pin + 3 },
    ];
    const probes: CellProbe[] = [];
    for (const L of loci) {
      const level = L.level;
      const uSpan = 1 << (level + uBias);
      const tSpan = 1 << level;
      const iu = Math.floor(L.u * uSpan);
      const it = Math.min(tSpan - 1, Math.floor(L.t * tSpan));
      const uSize = 1 / uSpan, tSize = 1 / tSpan;
      const u0 = iu * uSize, t0 = it * tSize;
      const p00 = pos(u0, t0), p10 = pos(u0 + uSize, t0), p01 = pos(u0, t0 + tSize), p11 = pos(u0 + uSize, t0 + tSize);
      const longest = Math.max(dist(p00, p10), dist(p01, p11), dist(p00, p01), dist(p10, p11));
      const split: Record<string, number> = {};
      for (const [mu, mt] of [
        [1, 1], [2, 1], [1, 2], [4, 1], [1, 4], [8, 1], [1, 8], [16, 1], [1, 16], [32, 1],
        [2, 2], [4, 4], [8, 8], [16, 16], [32, 32], [16, 4], [4, 16],
      ] as const) {
        split[`${mu}x${mt}`] = +splitDev(u0, uSize, t0, tSize, mu, mt).toFixed(5);
      }
      probes.push({
        label: L.label, level, iu, it, pin, uBias,
        t0: +t0.toFixed(6), t1: +(t0 + tSize).toFixed(6),
        nearEdge: +Math.min(t0, 1 - (t0 + tSize)).toFixed(6),
        pinRow: Math.floor(Math.min(t0, 1 - (t0 + tSize)) * (1 << pin) + 1e-9),
        capL11: capLinear(level, it, pin, 11), capL12: capLinear(level, it, pin, 12),
        capL13: capLinear(level, it, pin, 13), capL14: capLinear(level, it, pin, 14),
        capGeoL13: capGeometric(level, it, pin, 13), capGeoL14: capGeometric(level, it, pin, 14),
        cellArcMm: +dist(p00, p10).toFixed(4), cellHeightMm: +dist(p00, p01).toFixed(4),
        longestEdgeMm: +longest.toFixed(4),
        dev: +cellDev(u0, uSize, t0, tSize, 17).toFixed(5),
        split,
      });
    }
    /* eslint-disable no-console */
    console.log(`\n[PINBAND P1] Crystalline PROD dims, nRing=${NRING} uBias=${uBias} pin=${pin} ` +
      `(pinned rows t<${(1 / (1 << pin)).toFixed(6)} and t>${(1 - 1 / (1 << pin)).toFixed(6)}); ` +
      `analytic sagMm=${ASAG} minEdgeMm=${MINEDGE}`);
    for (const p of probes) {
      console.log(`  ${p.label}: cell level=${p.level} it=${p.it} t=[${p.t0},${p.t1}] nearEdge=${p.nearEdge} pinRow=${p.pinRow}`);
      console.log(`    LINEAR cap @maxLevel 11/12/13/14 = ${p.capL11}/${p.capL12}/${p.capL13}/${p.capL14}` +
        `  -> CAP-LIMITED=${p.level >= p.capL13 ? 'YES' : 'no'} (level ${p.level})`);
      console.log(`    GEOMETRIC cap @maxLevel 13/14 = ${p.capGeoL13}/${p.capGeoL14}`);
      console.log(`    cell arc=${p.cellArcMm}mm height=${p.cellHeightMm}mm longestEdge=${p.longestEdgeMm}mm ` +
        `(minEdgeMm floor ${MINEDGE} -> floor blocks? ${p.longestEdgeMm <= MINEDGE ? 'YES' : 'no'})`);
      console.log(`    exact-vs-bilinear dev = ${p.dev}mm  (criterion target ${ASAG} -> WANTS DEEPER? ${p.dev > ASAG ? 'YES' : 'no'})`);
      console.log(`    sub-split max dev: ${Object.entries(p.split).map(([k, v]) => `${k}=${v}`).join('  ')}`);
      appendFileSync(CAPJSON, JSON.stringify(p) + '\n');
    }
    /* eslint-enable no-console */
    // H1 assertions (non-vacuous: they fail if the cell was free to refine).
    for (const p of probes) {
      expect(p.level).toBe(p.capL13);
      expect(p.capL13).toBe(p.capL14); // density-INVARIANT: the cap does not move with maxLevel
      expect(p.dev).toBeGreaterThan(ASAG); // the analytic scorer WANTS deeper
      expect(p.longestEdgeMm).toBeGreaterThan(MINEDGE); // the physical floor is NOT the blocker
    }
  }, 600_000);

  // ---------------------------------------------------------------- P2: A/B arms
  const STYLE = (process.env.PF_PB_STYLE ?? 'Crystalline') as StyleId;
  const MODE = (process.env.PF_PB_MODE ?? 'off') as RelaxMode;
  const LOCI = process.env.PF_PB_LOCI === '1';
  it.skipIf(process.env.PF_PB_PROBE !== 'ab')(`P2 ${STYLE} relax=${MODE} L${LEVEL} nRing${NRING}`, () => {
    const [, packed] = buildStyleParamPayload(STYLE, {});
    const p = Float32Array.from(packed);
    const lines = LOCI
      ? extractAnalyticFeatures(STYLE, p, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb },
        { geoStarExactLoci: true, geoStarRampSteps: 4 }).lines
      : [];
    const sampler: SurfaceSampler = styleSampler(STYLE, {}, DIMS);
    const uBias = computeUBias(sampler, lines.length > 0);
    const rA = buildAnalyticRadiusFn(STYLE, {}, DIMS);
    const pin = Math.max(1, Math.round(Math.log2(NRING)) - uBias);

    setAnalyticScore(true);
    setRelax(MODE);
    const t0 = Date.now();
    const wall = buildConformingWall(sampler, {
      maxSagMm: SAG, maxEdgeMm: 8, minEdgeMm: MINEDGE, gradeRatio: 2,
      maxLevel: LEVEL, resU: 128, resT: 128, nRing: NRING,
      surfaceId: 0,
      featureLines: lines.length ? lines : undefined,
      featureLevel: LEVEL,
      targetTriangles: CAP, budgetMode: 'cap',
      uBias,
      efgSampler: sampler,
      analyticRA: rA, analyticH: DIMS.H, analyticSagMm: ASAG, analyticSagSamples: ASAMP,
    });
    const buildMs = Date.now() - t0;
    setRelax('off');
    setAnalyticScore(false);

    const vtx = wall.vertices, idx = wall.indices;
    const nV = vtx.length / 3;
    const ut: number[] = new Array(nV * 2);
    for (let i = 0; i < nV; i++) { ut[2 * i] = vtx[i * 3]; ut[2 * i + 1] = vtx[i * 3 + 1]; }

    const s0 = Date.now();
    const sag = perFaceTrue3DSag(ut, idx, rA, DIMS.H, { preFilterMm: PREFILTER });
    const scoreMs = Date.now() - s0;
    const sorted = Float64Array.from(sag.faceErr).sort();
    const q = (f: number): number => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];

    // Per-pin-row binning of the residual — the mechanism's own coordinate.
    const rowMax = new Map<number, number>();
    const rowOver = new Map<number, number>();
    let maxOffSeam = 0;
    let maxPinRow0 = 0;
    let maxAbovePinRow0 = 0;
    let over001 = 0;
    for (let f = 0; f < sag.faceErr.length; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const tt = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      const uu = [ut[2 * a], ut[2 * b], ut[2 * c]];
      const e = sag.faceErr[f];
      const row = Math.floor(Math.min(tt, 1 - tt) * (1 << pin) + 1e-9);
      if (e > (rowMax.get(row) ?? 0)) rowMax.set(row, e);
      if (e > 0.01) { rowOver.set(row, (rowOver.get(row) ?? 0) + 1); over001++; }
      if (!uu.some((x) => Math.min(x, 1 - x) < SEAM_BAND) && e > maxOffSeam) maxOffSeam = e;
      if (row === 0) { if (e > maxPinRow0) maxPinRow0 = e; } else if (e > maxAbovePinRow0) maxAbovePinRow0 = e;
    }

    const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) {
      const q3 = sampler.position(vtx[i * 3], vtx[i * 3 + 1]);
      xyz[i * 3] = q3[0]; xyz[i * 3 + 1] = q3[1]; xyz[i * 3 + 2] = q3[2];
    }
    const quality = triangleQualityDistribution({ vertices: xyz, indices: idx });
    const nonMan = auditNonManByIndex(xyz, idx);

    // Rim contract: exactly nRing entries, strictly ascending U, on BOTH rings.
    const ringU = (r: number[]): number[] => r.map((i) => vtx[i * 3]);
    const bU = ringU(wall.bottomRing), tU = ringU(wall.topRing);
    const ascending = (a: number[]): boolean => a.every((v, i) => i === 0 || v > a[i - 1]);
    const ringOk = wall.bottomRing.length === NRING && wall.topRing.length === NRING &&
      ascending(bU) && ascending(tU);

    const topRows = Array.from(rowMax.entries()).sort((x, y) => y[1] - x[1]).slice(0, 8)
      .map(([r, v]) => ({ row: r, max: +v.toFixed(5), over: rowOver.get(r) ?? 0 }));

    const row = {
      style: STYLE, mode: MODE, level: LEVEL, nRing: NRING, uBias, pin, aSag: ASAG, cap: CAP,
      lines: lines.length, tris: idx.length / 3, verts: nV, buildMs, scoreMs,
      chosenScale: wall.budget?.chosenScale, capSaturated: wall.budget?.capSaturated,
      max: +sag.worstMm.toFixed(5), p99: +q(0.99).toFixed(5), p999: +q(0.999).toFixed(5),
      over001: +(over001 / sag.faceErr.length).toFixed(5), over01: +sag.fracOver(0.1).toFixed(5),
      maxOffSeam: +maxOffSeam.toFixed(5),
      maxPinRow0: +maxPinRow0.toFixed(5), maxAbovePinRow0: +maxAbovePinRow0.toFixed(5),
      nonMan, pctBelow20: quality.pctBelow20, minAngle: quality.minAngleDeg,
      bottomRing: wall.bottomRing.length, topRing: wall.topRing.length, ringOk,
      topRows,
    };
    appendFileSync(NDJSON, JSON.stringify(row) + '\n');
    if (process.env.PF_PB_DUMP === '1') {
      dumpRenderBins(OUT, `${STYLE}_${MODE}_L${LEVEL}_n${NRING}`, Float32Array.from(xyz), idx, {
        colors: vertErrColors(sag.vertErr, 0.05),
        meta: {
          ruler: 'true3d', worstMm: sag.worstMm, p99Mm: q(0.99), pctOver0_03: 100 * sag.fracOver(0.03),
          mode: MODE, level: LEVEL, tris: idx.length / 3, nonMan,
        },
      });
    }
    /* eslint-disable no-console */
    console.log(`\n[PINBAND P2 ${STYLE} relax=${MODE} L${LEVEL} nRing${NRING} aSag${ASAG}] ` +
      `pin=${pin} uBias=${uBias} tris=${row.tris} build=${(buildMs / 1000).toFixed(1)}s score=${(scoreMs / 1000).toFixed(1)}s`);
    console.log(`  true-3D MAX=${row.max} p99=${row.p99} p99.9=${row.p999} over0.01=${(row.over001 * 100).toFixed(2)}% ` +
      `over0.1=${(row.over01 * 100).toFixed(3)}% offSeamMAX=${row.maxOffSeam}`);
    console.log(`  MAX in PINNED ROW 0 = ${row.maxPinRow0} | MAX everywhere ELSE = ${row.maxAbovePinRow0}`);
    console.log(`  rings: bottom=${row.bottomRing} top=${row.topRing} (need ${NRING}) ascendingU+len OK=${ringOk}`);
    console.log(`  nonMan=${row.nonMan} %<20deg=${row.pctBelow20} minAngle=${row.minAngle} chosenScale=${row.chosenScale}`);
    console.log(`  worst pin-rows: ${topRows.map((r) => `row${r.row}:${r.max}(${r.over} over)`).join(' ')}`);
    /* eslint-enable no-console */
  }, 7_200_000);

  // ------------------------------------------------- P3: WHOLE-SOLID assembly smoke
  it.skipIf(process.env.PF_PB_PROBE !== 'asm')(`P3 whole-solid assembly relax=${MODE}`, () => {
    const TBOTTOM = 6, RDRAIN = 0, TWALL = 3, RES = 256;
    const rA = buildAnalyticRadiusFn(STYLE, {}, DIMS);
    const grid = (surfaceId: 0 | 1): GpuSurfaceSampler => {
      const positions = new Float32Array(RES * RES * 3);
      let w = 0;
      for (let row = 0; row < RES; row++) {
        const t = row / (RES - 1);
        for (let col = 0; col < RES; col++) {
          const th = (col / RES) * 2 * Math.PI;
          const z = surfaceId === 0 ? t * DIMS.H : TBOTTOM + t * (DIMS.H - TBOTTOM);
          const r = surfaceId === 0 ? rA(th, z) : Math.max(rA(th, z) - TWALL, 0.5);
          positions[w++] = r * Math.cos(th); positions[w++] = r * Math.sin(th); positions[w++] = z;
        }
      }
      return new GpuSurfaceSampler(positions, RES, RES);
    };
    const outerSampler = grid(0), innerSampler = grid(1);
    const uBias = computeUBias(outerSampler, false);

    setAnalyticScore(true);
    setRelax(MODE);
    const t0 = Date.now();
    const asm = assembleWatertight(outerSampler, innerSampler,
      { H: DIMS.H, tBottom: TBOTTOM, rDrain: RDRAIN },
      {
        maxSagMm: SAG, maxEdgeMm: 8, minEdgeMm: MINEDGE, gradeRatio: 2,
        maxLevel: LEVEL, resU: 128, resT: 128, nRing: NRING,
        targetTriangles: CAP, budgetMode: 'cap', uBias,
        analyticRA: rA, analyticH: DIMS.H, analyticSagMm: ASAG, analyticSagSamples: ASAMP,
      });
    const buildMs = Date.now() - t0;
    setRelax('off');
    setAnalyticScore(false);

    // Lift the packed (u,t,surfaceId) assembly to 3D and audit BY INDEX.
    const nV = asm.vertices.length / 3;
    const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) {
      const u = asm.vertices[i * 3], t = asm.vertices[i * 3 + 1], sid = asm.vertices[i * 3 + 2];
      const th = u * 2 * Math.PI;
      let z: number, r: number;
      if (sid === 0) { z = t * DIMS.H; r = rA(th, z); }
      else if (sid === 1) { z = TBOTTOM + t * (DIMS.H - TBOTTOM); r = Math.max(rA(th, z) - TWALL, 0.5); }
      else if (sid === 2) { z = DIMS.H; r = rA(th, z) - t * TWALL; }
      else { z = sid === 3 ? 0 : TBOTTOM; r = (sid === 3 ? rA(th, 0) : Math.max(rA(th, TBOTTOM) - TWALL, 0.5)) * (1 - t); }
      xyz[i * 3] = r * Math.cos(th); xyz[i * 3 + 1] = r * Math.sin(th); xyz[i * 3 + 2] = z;
    }
    const audit = auditNonManByIndex(xyz, asm.indices);
    const counts = new Map<number, number>();
    for (let f = 0; f < asm.indices.length; f += 3) {
      const tri = [asm.indices[f], asm.indices[f + 1], asm.indices[f + 2]];
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e + 1) % 3];
        const key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    let boundary = 0, nonMan = 0;
    for (const n of counts.values()) { if (n === 1) boundary++; else if (n > 2) nonMan++; }
    const row = {
      probe: 'asm', style: STYLE, mode: MODE, level: LEVEL, nRing: NRING, uBias, aSag: ASAG,
      tris: asm.indices.length / 3, verts: nV, buildMs,
      boundaryEdges: boundary, nonManifoldEdges: nonMan, auditNonManByIndex: audit,
    };
    appendFileSync(NDJSON, JSON.stringify(row) + '\n');
    /* eslint-disable no-console */
    console.log(`\n[PINBAND P3 ASSEMBLY ${STYLE} relax=${MODE} L${LEVEL} nRing${NRING}] tris=${row.tris} ` +
      `build=${(buildMs / 1000).toFixed(1)}s`);
    console.log(`  WHOLE SOLID: boundaryEdges=${boundary} nonManifoldEdges=${nonMan} auditNonManByIndex=${audit}`);
    /* eslint-enable no-console */
    expect(boundary).toBe(0);
    expect(nonMan).toBe(0);
  }, 7_200_000);
});
