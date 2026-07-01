// _crestAwarePure.test.ts — DEV-ONLY (env PF_CRESTPURE=1). E-2026-07-01-CRESTAWARE mechanism ISOLATION.
// The full-stack screen confounded sizing with a 4x density jump that WRECKED constraint recovery (fails 4290->20257
// -> worst REGRESSED). Isolate the SIZING mechanism ALONE: the plain metric kernel (NO conforming injection / NO
// constraint locks) with crest-aware sizing OFF vs ON, at a FINE sizing grid (sizeRes 512 -> narrow crest band).
// Question: does the overlay FLATTEN the fracU 0.35/0.65 aliasing peaks and cut YEL, without a runaway? This is the
// clean mechanism proof (no recovery interaction). Uses buildInhouseMetricMesh directly + a manually-built overlay
// from the FULL truth loci (refined), so it exercises exactly the kernel overlay path.
//
// Run: PF_CRESTPURE=1 npx vitest run research/bridge/_crestAwarePure.test.ts
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { kappaMaxAt, type CrestSizeSample } from './surfaceMetricField';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildMeshUt, buildFeatureTruth } from './featureLocalizedFidelity';
import { perFaceChordSag, auditNonManByIndex } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
const TRUTH_RES = 384;

function hist(fracs: number[], bins: number): number[] { const h = new Array(bins).fill(0); for (const f of fracs) h[Math.min(bins - 1, Math.floor(f * bins))]++; return h; }

function fracUOver(ut: number[], indices: Uint32Array, rA: (th: number, z: number) => number, H: number, period: number, thr: number): { over: number; histU: number[] } {
  const BARY: Array<[number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
  const nV = ut.length / 2, nF = indices.length / 3;
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  const fracU: number[] = []; let over = 0;
  for (let f = 0; f < nF; f++) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    let sag = 0;
    for (const [w0, w1, w2] of BARY) {
      const um = w0 * ua + w1 * ub + w2 * uc, tm = w0 * ta + w1 * tb + w2 * tc;
      const th = TAU * um, z = tm * H, r = rA(th, z);
      const d = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
      if (d > sag) sag = d;
    }
    if (sag > thr) { over++; const cu3 = ((((ua + ub + uc) / 3) % 1) + 1) % 1; fracU.push((((cu3 * period) % 1) + 1) % 1); }
  }
  return { over, histU: hist(fracU, 10) };
}

/** Build the crest-aware overlay from the FULL truth loci, refined to the true extremum along the mm-perpendicular. */
function buildOverlay(rA: (th: number, z: number) => number, H: number, truthRes: number, sizeTolMm: number, hMin: number, hMax: number, kStep: number, stepMm: number): CrestSizeSample[] {
  const truth = buildFeatureTruth(STYLE, {}, DIMS, truthRes);
  const uToMm = truth.uToMm, tToMm = H;
  const rAt = (u: number, t: number): number => { let uu = u - Math.floor(u); if (uu < 0) uu += 1; const tc = t < 0 ? 0 : t > 1 ? 1 : t; return rA(TAU * uu, tc * H); };
  const rowMeanCache = new Map<number, number>();
  const rowMean = (t: number): number => { const key = Math.round(t * 4096); const c = rowMeanCache.get(key); if (c !== undefined) return c; let s = 0; const N = 256; for (let i = 0; i < N; i++) s += rAt(i / N, t); const m = s / N; rowMeanCache.set(key, m); return m; };
  const GR = (Math.sqrt(5) - 1) / 2;
  const refine = (u0: number, t0: number, puU: number, ptU: number, seekMax: boolean): { u: number; t: number } => {
    const pxMm = puU * uToMm, pyMm = ptU * tToMm; const pl = Math.hypot(pxMm, pyMm) || 1; const duPerMm = puU / pl, dtPerMm = ptU / pl;
    const f = (sMm: number): number => { const v = rAt(u0 + duPerMm * sMm, t0 + dtPerMm * sMm); return seekMax ? v : -v; };
    const HALF = 0.6, STEPS = 16; let bestS = 0, bestV = f(0);
    for (let k = -STEPS; k <= STEPS; k++) { const sMm = (k / STEPS) * HALF; const v = f(sMm); if (v > bestV) { bestV = v; bestS = sMm; } }
    const w = HALF / STEPS; let a = bestS - w, b = bestS + w; let c = b - GR * (b - a), d = a + GR * (b - a); let fc = f(c), fd = f(d);
    for (let it = 0; it < 24; it++) { if (fc > fd) { b = d; d = c; fd = fc; c = b - GR * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + GR * (b - a); fd = f(d); } if (b - a < 1e-4) break; }
    const sBest = (a + b) / 2; let uN = u0 + duPerMm * sBest, tN = t0 + dtPerMm * sBest; uN -= Math.floor(uN); tN = tN < 0 ? 0 : tN > 1 ? 1 : tN; return { u: uN, t: tN };
  };
  // dedupe overlay samples
  const seen = new Set<number>(); const nUcells = Math.max(1, Math.round(uToMm / stepMm));
  const key = (u: number, t: number): number => { let uu = u - Math.floor(u); if (uu < 0) uu += 1; const gu = ((Math.round(uu * nUcells) % nUcells) + nUcells) % nUcells; return gu * 1_000_003 + Math.round((t < 0 ? 0 : t > 1 ? 1 : t) * (tToMm / stepMm)); };
  const out: CrestSizeSample[] = [];
  for (const line of truth.lines) {
    const pts = line.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const u0 = pts[i].u, u1 = pts[i + 1].u, t0 = pts[i].t, t1 = pts[i + 1].t;
      let du = u1 - u0; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1; const dt = t1 - t0;
      const lenMm = Math.hypot(du * uToMm, dt * tToMm); if (lenMm < 1e-9) continue;
      const txMm = du * uToMm, tyMm = dt * tToMm; const tl = Math.hypot(txMm, tyMm) || 1;
      const perpU = (-tyMm / tl) / uToMm, perpT = (txMm / tl) / tToMm; const n = Math.max(1, Math.ceil(lenMm / stepMm));
      for (let k = 0; k <= n; k++) {
        const ff = k / n; let u = u0 + du * ff; u -= Math.floor(u); const t = t0 + dt * ff;
        const seekMax = rAt(u, t) >= rowMean(t); const r = refine(u, t, perpU, perpT, seekMax);
        const kk = key(r.u, r.t); if (seen.has(kk)) continue; seen.add(kk);
        const kappa = kappaMaxAt(rA as never, H, r.u, r.t, kStep);
        const hRaw = kappa > 1e-9 ? Math.sqrt((8 * sizeTolMm) / kappa) : hMax;
        out.push({ u: r.u, t: r.t, h3DMm: Math.min(Math.max(hRaw, hMin), hMax) });
      }
    }
  }
  return out;
}

describe('crest-aware PURE sizing (mechanism isolation, no conform)', () => {
  it.skipIf(process.env.PF_CRESTPURE !== '1')('OFF vs ON on the plain kernel', () => {
    const OUT = join('research', 'exchange', '_crestaware'); mkdirSync(OUT, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS); const H = DIMS.H;
    // FINE sizing grid so the overlay band is NARROW. tolMm 0.03 baseline (green target). hMin 0.02.
    const OPTS: InhouseMeshOpts = { tolMm: 0.03, hMin: 0.02, hMax: 8, sizeRes: 512, gradeBeta: 0.2, seedN: 14, maxPoints: 6_000_000, splitThresh: 1.5, optimizeSweeps: 2, guardManifoldAlways: true, profile: true };

    // OFF: plain metric kernel, fine grid.
    const off = buildInhouseMetricMesh(rA, H, OPTS);
    const offIdx = Uint32Array.from(off.indices); const offM = buildMeshUt(off.ut, offIdx, rA, H);
    const sOff = perFaceChordSag(off.ut, offIdx, rA, H); const nmOff = auditNonManByIndex(offM.xyz, offIdx);
    const nfOff = offIdx.length / 3; let redOff = 0, yelOff = 0; for (let f = 0; f < nfOff; f++) { if (sOff.faceErr[f] > 0.15) redOff++; if (sOff.faceErr[f] > 0.05) yelOff++; }
    const hOff = fracUOver(off.ut, offIdx, rA, H, 512, 0.05);
    // eslint-disable-next-line no-console
    console.log(`OFF  tris=${nfOff} worst=${sOff.worstMm.toFixed(3)} RED=${(100 * redOff / nfOff).toFixed(4)}% YEL=${(100 * yelOff / nfOff).toFixed(4)}% nonMan=${nmOff} | fracU512 over05=${hOff.over} hist=[${hOff.histU.join(',')}]`);

    // ON: same, + crest-aware overlay (built from ALL truth loci), band=1 at sizeRes 512 (~0.6mm u band).
    const overlay = buildOverlay(rA, H, TRUTH_RES, 0.03, 0.02, 8, 1 / 2048, 0.08);
    let ovMin = Infinity; for (const s of overlay) if (s.h3DMm < ovMin) ovMin = s.h3DMm;
    const ovSorted = overlay.map(s => s.h3DMm).sort((a, b) => a - b);
    // eslint-disable-next-line no-console
    console.log(`overlay samples=${overlay.length} minH3D=${ovMin.toFixed(4)} medianH3D=${ovSorted[overlay.length >> 1].toFixed(4)} p90H3D=${ovSorted[Math.floor(overlay.length * 0.9)].toFixed(4)}`);
    const on = buildInhouseMetricMesh(rA, H, { ...OPTS, crestSizeOverlay: overlay, crestBandCells: 1 });
    const onIdx = Uint32Array.from(on.indices); const onM = buildMeshUt(on.ut, onIdx, rA, H);
    const sOn = perFaceChordSag(on.ut, onIdx, rA, H); const nmOn = auditNonManByIndex(onM.xyz, onIdx);
    const nfOn = onIdx.length / 3; let redOn = 0, yelOn = 0; for (let f = 0; f < nfOn; f++) { if (sOn.faceErr[f] > 0.15) redOn++; if (sOn.faceErr[f] > 0.05) yelOn++; }
    const hOn = fracUOver(on.ut, onIdx, rA, H, 512, 0.05);
    // eslint-disable-next-line no-console
    console.log(`ON   tris=${nfOn} worst=${sOn.worstMm.toFixed(3)} RED=${(100 * redOn / nfOn).toFixed(4)}% YEL=${(100 * yelOn / nfOn).toFixed(4)}% nonMan=${nmOn} | fracU512 over05=${hOn.over} hist=[${hOn.histU.join(',')}]`);
    // eslint-disable-next-line no-console
    console.log(`DELTA tris ${nfOff}->${nfOn} worst ${sOff.worstMm.toFixed(3)}->${sOn.worstMm.toFixed(3)} YEL ${(100 * yelOff / nfOff).toFixed(4)}->${(100 * yelOn / nfOn).toFixed(4)} over05 ${hOff.over}->${hOn.over}`);
    expect(nmOn).toBe(0);
  }, 60 * 60 * 1000);
});
