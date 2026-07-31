// _strataParARCensus.ts — S19. THE PARAMETRIC-AR CENSUS. AUDITOR-SIDE, MEASUREMENT ONLY, NO GATE.
// RESEARCH ONLY; nothing in src/ may import this.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS, AND WHY IT IS NOT A DRIVER CAP
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// The operator rejected the whole S9->S18 lineage from a screenshot. The S19 decomposition then located the
// population he was pointing at, and the decisive property is that NO EXISTING GATE CAN SEE IT: those facets
// carry mm-scale edges and 85-95 deg normal deviation with PARAMETRIC aspect ratio in the THOUSANDS while
// their 3-D aspect ratio sits comfortably under the cap of 50. That is the 2026-07-29 blade diagnosis
// verbatim — "a facet whose PARAMETRIC area collapses while its edges stay long" — and the AR-50 gate misses
// it because the gate is 3-D.
//
// SO THIS MAKES THE OPERATOR'S EYE MACHINE-VISIBLE. It is deliberately an AUDITOR instrument and NOT a
// driver refusal: legitimate anisotropy on a steep wall carries high parametric AR by construction (that is
// the whole point of DIRECTED refinement), so a driver-side parAR cap would refuse exactly the elements the
// campaign spent S10-S15 learning to place. A cap needs its own A/B against a measured guard-ON/OFF
// separation, which is what the `proposedGate` field below is for and nothing more.
//
// It is also a STANDALONE tool rather than an addition to `_judgeShape`: the hard gate is the campaign's
// spine, and a reporting-only instrument does not justify putting it at risk. Promoting this into the judge
// is an operator decision with its own before/after gate run.
import { readFileSync } from 'node:fs';
import { canonTheta, dThRaw } from './_sweepPredicate';

const R_REF = 45;

export interface ParARFacet {
  tri: number;
  parAR: number;
  ar3: number;
  devDeg: number;
  areaMm2: number;
  theta: number;
  z: number;
  edgesUm: [number, number, number];
}

export interface ParARCensus {
  nTri: number;
  p50: number; p90: number; p99: number; max: number;
  /** counts at candidate gate lines — the shape of the tail, not a verdict. */
  above: Array<{ line: number; count: number; frac: number }>;
  /** decade histogram, log10 floor -> count. */
  decades: Record<string, number>;
  /** the EYE population: deviation >= devDeg AND area >= areaMm2. */
  eye: { devDeg: number; areaMm2: number; n: number; parARp05: number; parARp50: number; minParAR: number };
  /** the largest parAR line that still leaves every eye facet above it. */
  proposedGate: number;
  worst: ParARFacet[];
}

export function parARCensus(
  stlPath: string,
  rA: (th: number, z: number) => number,
  opts: { eyeDevDeg?: number; eyeAreaMm2?: number; nWorst?: number; lines?: number[] } = {},
): ParARCensus {
  const eyeDev = opts.eyeDevDeg ?? 45;
  const eyeArea = opts.eyeAreaMm2 ?? 0.02;
  const nWorst = opts.nWorst ?? 12;
  const lines = opts.lines ?? [50, 100, 200, 400, 800, 1600, 3200];
  const hTh = 1e-6; const hZ = 1e-6;
  const bestDot = (th: number, z: number, fx: number, fy: number, fz: number): number => {
    const r0 = rA(th, z);
    const rTp = rA(th + hTh, z); const rTm = rA(th - hTh, z);
    const rZp = rA(th, z + hZ); const rZm = rA(th, z - hZ);
    const ct = Math.cos(th); const st = Math.sin(th);
    const c: Array<[number, number]> = [
      [(rTp - rTm) / (2 * hTh), (rZp - rZm) / (2 * hZ)], [(rTp - r0) / hTh, (rZp - r0) / hZ],
      [(rTp - r0) / hTh, (r0 - rZm) / hZ], [(r0 - rTm) / hTh, (rZp - r0) / hZ], [(r0 - rTm) / hTh, (r0 - rZm) / hZ],
    ];
    let best = -Infinity;
    for (const [rt, rz] of c) {
      const nx = r0 * ct + rt * st; const ny = r0 * st - rt * ct; const nz = -r0 * rz;
      const n = Math.hypot(nx, ny, nz) || 1;
      const d = (fx * nx + fy * ny + fz * nz) / n;
      if (d > best) best = d;
    }
    return best;
  };

  const buf = readFileSync(stlPath);
  const nTri = buf.readUInt32LE(80);
  const all = new Float64Array(nTri);
  const eyePar: number[] = [];
  const worst: ParARFacet[] = [];
  const decades: Record<string, number> = {};
  const P = new Float64Array(9);
  for (let t = 0; t < nTri; t += 1) {
    const o = 84 + t * 50 + 12;
    for (let k = 0; k < 9; k += 1) P[k] = buf.readFloatLE(o + k * 4);
    const th0 = canonTheta(Math.atan2(P[1], P[0]));
    const th1 = canonTheta(Math.atan2(P[4], P[3]));
    const th2 = canonTheta(Math.atan2(P[7], P[6]));
    // PARAMETRIC aspect ratio in the (arc, z) chart, shortest-arc deltas anchored at the first vertex —
    // the same normalisation `aspect3` uses, so the two numbers are directly comparable.
    const pe: [number, number, number] = [
      Math.hypot(R_REF * dThRaw(th0, th1), P[5] - P[2]),
      Math.hypot(R_REF * dThRaw(th1, th2), P[8] - P[5]),
      Math.hypot(R_REF * dThRaw(th2, th0), P[2] - P[8]),
    ];
    const sp2 = Math.abs(R_REF * (dThRaw(th0, th1) * (P[8] - P[2]) - dThRaw(th0, th2) * (P[5] - P[2])));
    const parAR = sp2 > 0 ? (Math.max(...pe) * (pe[0] + pe[1] + pe[2])) / (2 * sp2) : Infinity;
    all[t] = Number.isFinite(parAR) ? parAR : 1e12;
    const dk = Number.isFinite(parAR) && parAR > 0 ? String(Math.floor(Math.log10(parAR))) : 'inf';
    decades[dk] = (decades[dk] ?? 0) + 1;

    // the eye population needs the 3-D quantities too
    const ux = P[3] - P[0]; const uy = P[4] - P[1]; const uz = P[5] - P[2];
    const vx = P[6] - P[0]; const vy = P[7] - P[1]; const vz = P[8] - P[2];
    let fx = uy * vz - uz * vy; let fy = uz * vx - ux * vz; let fz = ux * vy - uy * vx;
    const fl = Math.hypot(fx, fy, fz);
    if (!(fl > 0)) continue;
    const area = 0.5 * fl;
    if (area < eyeArea) continue;
    fx /= fl; fy /= fl; fz /= fl;
    const cx = (P[0] + P[3] + P[6]) / 3; const cy = (P[1] + P[4] + P[7]) / 3; const cz = (P[2] + P[5] + P[8]) / 3;
    const cth = canonTheta(Math.atan2(cy, cx));
    const dev = Math.acos(Math.max(-1, Math.min(1, bestDot(cth, cz, fx, fy, fz)))) * (180 / Math.PI);
    if (dev < eyeDev) continue;
    eyePar.push(all[t]);
    const e3: [number, number, number] = [
      Math.hypot(P[3] - P[0], P[4] - P[1], P[5] - P[2]) * 1000,
      Math.hypot(P[6] - P[3], P[7] - P[4], P[8] - P[5]) * 1000,
      Math.hypot(P[0] - P[6], P[1] - P[7], P[2] - P[8]) * 1000,
    ];
    e3.sort((a, b) => a - b);
    const L = Math.max(...e3) / 1000;
    const per = (e3[0] + e3[1] + e3[2]) / 1000;
    worst.push({ tri: t, parAR: all[t], ar3: (L * per) / (4 * area), devDeg: dev, areaMm2: area, theta: cth, z: cz, edgesUm: e3 });
  }

  const sorted = Array.from(all).sort((a, b) => a - b);
  const q = (f: number): number => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  eyePar.sort((a, b) => a - b);
  worst.sort((a, b) => b.areaMm2 * b.devDeg - a.areaMm2 * a.devDeg);
  const minEye = eyePar.length > 0 ? eyePar[0] : Infinity;
  return {
    nTri,
    p50: q(0.5), p90: q(0.9), p99: q(0.99), max: sorted[sorted.length - 1],
    above: lines.map((line) => {
      const count = sorted.length - sorted.findIndex((v) => v > line);
      return { line, count: count < 0 ? 0 : count, frac: (count < 0 ? 0 : count) / Math.max(1, nTri) };
    }),
    decades,
    eye: {
      devDeg: eyeDev, areaMm2: eyeArea, n: eyePar.length,
      parARp05: eyePar.length > 0 ? eyePar[Math.floor(0.05 * eyePar.length)] : 0,
      parARp50: eyePar.length > 0 ? eyePar[Math.floor(0.5 * eyePar.length)] : 0,
      minParAR: minEye,
    },
    // THE PROPOSED LINE, and it is a REPORT not a gate: the largest round value that still leaves EVERY
    // eye facet above it. If that value is small enough to catch ordinary anisotropy, the census says so by
    // printing how many facets it would take with it — which is the guard-ON/OFF separation an A/B needs.
    proposedGate: Number.isFinite(minEye) ? 10 ** Math.floor(Math.log10(minEye)) : 0,
    worst: worst.slice(0, nWorst),
  };
}
