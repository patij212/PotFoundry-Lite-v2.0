// s117SizingFieldProbe.ts — S117 P2 item 4: WHAT DOES THE SHIPPING SIZING FIELD ACTUALLY ASK FOR?
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS TOOL EXISTS
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// s116Ladder / s117MinEdgeLadder price what the SURFACE NEEDS. That is not the same question as what
// the SHIPPING SIZING FIELD ASKS FOR. The field is:
//
//   ParametricExportComputer.ts:2507-2509  DENSE_RES_U = DENSE_RES_T = 256   (dev lever __pfConformingDenseRes)
//     -> GpuSurfaceSampler = BILINEAR interpolation of a 256x256 f32 grid
//   SurfaceMetricTensor.ts:33-46           hu = 1/resU, ht = 1/(resT-1)      = ONE SAMPLER CELL
//   MetricSizingField.ts:108               kappa = principalCurvatureMax(s, u, t, hu, ht)
//   MetricSizingField.ts:114               h = sqrt(8*maxSag/kappa)
//   MetricSizingField.ts:119               h = min(maxEdge, max(minEdge, h))   <== qMinEdge
//   MetricSizingField.ts:127               gradeLipschitz(gradeRatio)
//
// kappa is therefore the SECOND DIFFERENCE OF A 256-GRID, not the curvature of the analytic surface.
// A second difference over one cell is BOUNDED: it cannot report a kappa larger than the grid can
// carry. So h = sqrt(8*maxSag/kappa) HAS ITS OWN FLOOR, set by the sampler resolution — and if that
// floor is ABOVE qMinEdge, then qMinEdge IS NOT THE BINDING CONSTRAINT AND LOWERING IT IS A NO-OP.
//
// This tool runs THE SHIPPING CLASSES (imported, not reimplemented) against a faithful reconstruction
// of the production sampler (an f32 256x256 grid of the analytic surface — exactly what
// buildWallSampler writes) and reports, per (maxSag, minEdge, denseRes, sizingRes) rung:
//
//   hRawMin / p001 / p01 / p50      the PRE-CLAMP sagitta-law targets — what the field WANTS
//   clampedNodes%                   nodes where max(minEdge, h) actually changed h  (THE CLAMP BINDING RATE)
//   hFieldMin                       the POST-clamp POST-grading minimum — what the mesher is TOLD
//   kappaMax                        the largest curvature the sampler can report at this resolution
//
// CONTROLS
//   K1  minEdge = 0 arm (clamp removed): hRawMin must be IDENTICAL across every minEdge rung. If it
//       is not, the raw targets are not independent of the clamp and the run is VOID.
//   K2  denseRes sweep: kappaMax must RISE with resolution (a finer grid can carry more curvature).
//       If kappaMax is flat in denseRes the sampler is not the binding constraint after all.
//   K3  f32 arm: the grid is stored f32 exactly as production does. A f64 control arm is printed so
//       the f32 quantisation contribution to kappa is visible rather than assumed.
//   K4  grading: hFieldMin >= hRawMin always (grading only LOWERS neighbours toward a small node, it
//       can never push the minimum below the raw minimum). Asserted; a violation voids.
//
// Usage: bash research/tools/run-s117-sizing.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { GpuSurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import { MetricSizingField } from '../../src/renderers/webgpu/parametric/conforming/MetricSizingField';
import { principalCurvatureMax, metricStepsForSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceMetricTensor';
import { writeFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const STYLE = process.env.PF_S117_STYLE ?? 'GothicArches';
const TAG = process.env.PF_S117_TAG ?? 'X';
const OUTDIR = process.env.PF_S117_OUTDIR ?? 'research/exchange/_strataConformBisect/s117';
const DIMS: StyleDims = { H: envF('PF_S117_H', 120), Rb: envF('PF_S117_RB', 40), Rt: envF('PF_S117_RT', 50), expn: 1 };
const H = DIMS.H;
const DENSE_SWEEP = (process.env.PF_S117_DENSE ?? '256,512,1024,2048,4096').split(',').map(Number);
const SIZING_SWEEP = (process.env.PF_S117_SIZING ?? '128,512,2048').split(',').map(Number);
const MINEDGES = (process.env.PF_S117_MINEDGES ?? '0.2,0.1,0.04,0.01,0.004,0.0018,0.0006,0').split(',').map(Number);
const SAGS = (process.env.PF_S117_SAGS ?? '0.003,0.001').split(',').map(Number);
const MAXEDGE = envF('PF_S117_MAXEDGE', 1);
const GRADE = envF('PF_S117_GRADE', 2);

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`   S117 P2 item 4 — WHAT THE SHIPPING SIZING FIELD ASKS FOR — ${STYLE}`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`dims H ${H} Rb ${DIMS.Rb} Rt ${DIMS.Rt}   maxEdge ${MAXEDGE}  gradeRatio ${GRADE}`);
log(`production config: DENSE_RES 256 (ParametricExportComputer.ts:2509), sizingRes 128 (qSizingRes default), maxSag 0.003 (CAD_SAG_MM), minEdge 0.04`);
log('');

/** Build the production sampler EXACTLY as buildWallSampler does: an f32 resU x resT grid, bilinear. */
const buildSampler = (resU: number, resT: number, f32 = true): GpuSurfaceSampler => {
  const pos = f32 ? new Float32Array(resU * resT * 3) : (new Float64Array(resU * resT * 3) as unknown as Float32Array);
  let w = 0;
  for (let row = 0; row < resT; row += 1) {
    const t = row / (resT - 1);
    const z = t * H;
    for (let col = 0; col < resU; col += 1) {
      const th = (col / resU) * 2 * Math.PI;
      const r = rA(th, z);
      pos[w++] = r * Math.cos(th); pos[w++] = r * Math.sin(th); pos[w++] = z;
    }
  }
  return new GpuSurfaceSampler(pos, resU, resT);
};

const q = (a: Float64Array | number[], p: number): number => {
  const s = Float64Array.from(a); s.sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
};
/** min/max by LOOP — Math.min(...arr) blows the call stack past ~1e5 elements. */
const amin = (a: Float64Array | number[]): number => { let m = Infinity; for (let i = 0; i < a.length; i += 1) if (a[i] < m) m = a[i]; return m; };
const amax = (a: Float64Array | number[]): number => { let m = -Infinity; for (let i = 0; i < a.length; i += 1) if (a[i] > m) m = a[i]; return m; };

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// K2 — HOW MUCH CURVATURE CAN THE SAMPLER CARRY AT EACH RESOLUTION?
// ─────────────────────────────────────────────────────────────────────────────────────────────────
log('── K2: THE SAMPLER CURVATURE CEILING (kappa the 1-cell central difference can report) ──');
log('   denseRes   u node (mm)  t node (mm)   kappaMax(mm-1)  kappa p999   kappa p50   => h floor sqrt(8*0.003/kMax)   h floor @sag 0.001');
const kappaCeil = new Map<number, number>();
for (const dr of DENSE_SWEEP) {
  const s = buildSampler(dr, dr);
  const { hu, ht } = metricStepsForSampler(s);
  const NS = envI('PF_S117_KN', 200);        // NS x NS probe lattice, offset off the nodes
  const ks: number[] = [];
  for (let j = 0; j < NS; j += 1) {
    const t = (j + 0.5) / NS;
    for (let i = 0; i < NS; i += 1) {
      ks.push(Math.max(principalCurvatureMax(s, (i + 0.5) / NS, t, hu, ht), 1e-6));
    }
  }
  const kMax = amax(ks);
  kappaCeil.set(dr, kMax);
  const uNode = (2 * Math.PI * Math.max(DIMS.Rb, DIMS.Rt)) / dr;
  const tNode = H / (dr - 1);
  log(`   ${String(dr).padStart(8)}   ${uNode.toFixed(5).padStart(10)}  ${tNode.toFixed(5).padStart(10)}   ${kMax.toExponential(4).padStart(13)}  ${q(ks, 0.999).toExponential(3).padStart(10)}  ${q(ks, 0.5).toExponential(3).padStart(10)}   ${Math.sqrt((8 * 0.003) / kMax).toExponential(4).padStart(24)}   ${Math.sqrt((8 * 0.001) / kMax).toExponential(4)}`);
}
{
  const first = kappaCeil.get(DENSE_SWEEP[0]) as number;
  const last = kappaCeil.get(DENSE_SWEEP[DENSE_SWEEP.length - 1]) as number;
  log(`   K2: kappaMax ${last > first * 1.5 ? 'RISES' : '*** DOES NOT RISE ***'} with resolution (${first.toExponential(3)} -> ${last.toExponential(3)}, ${(last / first).toFixed(2)}x over ${DENSE_SWEEP[0]}->${DENSE_SWEEP[DENSE_SWEEP.length - 1]}).`);
  log(`   READ: h_floor = sqrt(8*maxSag/kappaMax) is the SMALLEST EDGE THE FIELD CAN EVER ASK FOR at that`);
  log(`   sampler resolution. If h_floor > qMinEdge, the clamp is DEAD and lowering it changes nothing.`);
}
log('');

// K3 — f32 control
log('── K3: f32 vs f64 SAMPLER GRID (production stores f32) ──');
{
  const dr = DENSE_SWEEP[0];
  for (const [nm, f32] of [['f32 (production)', true], ['f64 (control)', false]] as Array<[string, boolean]>) {
    const s = buildSampler(dr, dr, f32);
    const { hu, ht } = metricStepsForSampler(s);
    const NS = 200; const ks: number[] = [];
    for (let j = 0; j < NS; j += 1) for (let i = 0; i < NS; i += 1) ks.push(Math.max(principalCurvatureMax(s, (i + 0.5) / NS, (j + 0.5) / NS, hu, ht), 1e-6));
    log(`   denseRes ${dr}  ${nm.padEnd(18)} kappaMax ${amax(ks).toExponential(4)}   p50 ${q(ks, 0.5).toExponential(4)}`);
  }
  log('   READ: a large f32/f64 gap would mean the reported kappa is storage NOISE, not geometry.');
}
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE MAIN TABLE — the shipping MetricSizingField, per (denseRes, sizingRes, maxSag, minEdge)
// ─────────────────────────────────────────────────────────────────────────────────────────────────
type Row = { denseRes: number; sizingRes: number; sag: number; minEdge: number; hRawMin: number; hRawP001: number; hRawP50: number; clampedPct: number; hFieldMin: number; hFieldP001: number };
const rows: Row[] = [];
for (const dr of DENSE_SWEEP) {
  const s = buildSampler(dr, dr);
  const { hu, ht } = metricStepsForSampler(s);
  for (const sr of SIZING_SWEEP) {
    // Raw sagitta targets ONCE per (denseRes, sizingRes, sag) — independent of minEdge (K1).
    for (const sag of SAGS) {
      const raw = new Float64Array(sr * sr);
      for (let j = 0; j < sr; j += 1) {
        const t = sr > 1 ? j / (sr - 1) : 0;
        for (let i = 0; i < sr; i += 1) {
          const kappa = Math.max(principalCurvatureMax(s, i / sr, t, hu, ht), 1e-6);
          raw[j * sr + i] = Math.sqrt((8 * sag) / kappa);
        }
      }
      const hRawMin = amin(raw);
      for (const me of MINEDGES) {
        let clamped = 0;
        for (let i = 0; i < raw.length; i += 1) if (raw[i] < me) clamped += 1;
        // Run the SHIPPING class. rawTargets is NOT passed (that path skips the clamp entirely) —
        // we let it recompute so the clamp + grading are the production code path.
        const field = new MetricSizingField(s, {
          maxSagMm: sag, minEdgeMm: me, maxEdgeMm: MAXEDGE, gradeRatio: GRADE, resU: sr, resT: sr,
        });
        let fMin = Infinity; const fs: number[] = [];
        for (let j = 0; j < sr; j += 1) for (let i = 0; i < sr; i += 1) {
          const v = field.edgeLength(i / sr, sr > 1 ? j / (sr - 1) : 0);
          if (v < fMin) fMin = v; fs.push(v);
        }
        rows.push({
          denseRes: dr, sizingRes: sr, sag, minEdge: me, hRawMin, hRawP001: q(raw, 0.001), hRawP50: q(raw, 0.5),
          clampedPct: (clamped / raw.length) * 100, hFieldMin: fMin, hFieldP001: q(fs, 0.001),
        });
      }
    }
  }
}

for (const sag of SAGS) {
  log('════════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`   maxSag = ${sag} mm`);
  log('════════════════════════════════════════════════════════════════════════════════════════════════════');
  log('   denseRes  sizingRes  minEdge   hRaw MIN      hRaw p0.1%    hRaw p50     nodes CLAMPED%   hField MIN    hField p0.1%');
  for (const dr of DENSE_SWEEP) {
    for (const sr of SIZING_SWEEP) {
      for (const r of rows.filter((x) => x.denseRes === dr && x.sizingRes === sr && x.sag === sag)) {
        const mark = (dr === 256 && sr === 128 && r.minEdge === 0.04) ? '   <== SHIPPING TODAY' : '';
        log(`   ${String(dr).padStart(8)}  ${String(sr).padStart(9)}  ${r.minEdge.toFixed(4).padStart(7)}   ${r.hRawMin.toExponential(4)}  ${r.hRawP001.toExponential(4)}  ${r.hRawP50.toExponential(4)}   ${r.clampedPct.toFixed(4).padStart(12)}%   ${r.hFieldMin.toExponential(4)}  ${r.hFieldP001.toExponential(4)}${mark}`);
      }
      log('');
    }
  }
}

// ── K1 / K4 controls ──
log('── K1: raw targets must be INDEPENDENT of minEdge (the clamp is applied AFTER) ──');
{
  let bad = 0;
  for (const dr of DENSE_SWEEP) for (const sr of SIZING_SWEEP) for (const sag of SAGS) {
    const g = rows.filter((x) => x.denseRes === dr && x.sizingRes === sr && x.sag === sag);
    for (const r of g) if (Math.abs(r.hRawMin - g[0].hRawMin) > 1e-12) bad += 1;
  }
  log(`   ${bad === 0 ? 'HOLDS' : `*** VIOLATED on ${bad} rows — RUN VOID ***`}`);
}
log('── K4: hFieldMin >= min(hRawMin, minEdge) — grading cannot go below the clamped raw floor ──');
{
  let bad = 0;
  for (const r of rows) if (r.hFieldMin < Math.max(r.minEdge, r.hRawMin) - 1e-9 && r.minEdge > 0) bad += 1;
  log(`   ${bad === 0 ? 'HOLDS' : `*** VIOLATED on ${bad} rows — RUN VOID ***`}`);
}
log('');

// ── THE VERDICT LINE ──
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   IS qMinEdge THE BINDING CONSTRAINT ON THIS SIZING FIELD?');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
for (const sag of SAGS) {
  for (const dr of DENSE_SWEEP) {
    const r = rows.find((x) => x.denseRes === dr && x.sizingRes === 128 && x.sag === sag && x.minEdge === 0.04);
    const r0 = rows.find((x) => x.denseRes === dr && x.sizingRes === 128 && x.sag === sag && x.minEdge === 0);
    if (!r || !r0) continue;
    const binds = r.hRawMin < 0.04;
    log(`   sag ${sag}  denseRes ${String(dr).padStart(5)}  sizingRes 128:  hRawMin ${r.hRawMin.toExponential(4)}  vs qMinEdge 0.04  =>  ${binds ? `CLAMP BINDS on ${r.clampedPct.toFixed(4)}% of field nodes` : 'CLAMP IS DEAD (field never asks below it)'}`);
    log(`        clamp removed (minEdge 0): field min ${r0.hFieldMin.toExponential(4)}  vs clamped-at-0.04 field min ${r.hFieldMin.toExponential(4)}   ratio ${(r.hFieldMin / Math.max(1e-12, r0.hFieldMin)).toFixed(4)}x`);
  }
}
log('');
writeFileSync(`${OUTDIR}/S117_SIZINGFIELD_${TAG}.json`, JSON.stringify({ style: STYLE, DIMS, rows, kappaCeil: [...kappaCeil] }, null, 2));
log(`json -> ${OUTDIR}/S117_SIZINGFIELD_${TAG}.json`);
log('S117 SIZING FIELD PROBE DONE');
