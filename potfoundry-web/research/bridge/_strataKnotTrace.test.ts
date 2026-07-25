// _strataKnotTrace.test.ts — GENERIC per-row θ-jump TRACING: turns h0 loci into ordered polylines in (θ,z).
// Gated PF_STRATA_KNOT=1. RESEARCH ONLY.
//
// WHY: the BasketWeave curtain worked because its loci are straight constant-θ lines that coincide with grid
// columns. CelticKnot's silhouette locus |localU − amp·sin(v·frq+phase)| = strandW is a CURVE, so before writing any
// mesher I need the measurement that decides which mechanism is even applicable:
//   • how many jump loci exist per z-row, and is that count CONSTANT over a band?
//   • do the loci keep their θ-ORDER (⇒ a curvilinear column grid works) or do they cross (⇒ Y-junctions)?
//   • where do chains are born / die, and with what jump magnitude (a chain that dies at |Δr|→0 PINCHES cleanly;
//     one that dies at a finite jump is a genuine Y-junction that needs a 3-sheet pinch)?
// Everything here is style-agnostic: the only inputs are rA and the two-scale ladder.
import { describe, it } from 'vitest';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_KNOT === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const TWO_PI = 2 * Math.PI;
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
const envF = (n: string, d: number): number => { const r = process.env[n]; if (r === undefined) return d; const v = Number.parseFloat(r); return Number.isFinite(v) ? v : d; };

describe('STRATA knot trace', () => {
  it.runIf(RUN)('traces h0 θ-loci per z-row and links them into ordered polylines', () => {
    const STYLE = process.env.PF_KNOT_STYLE ?? 'CelticKnot';
    const TOL = envF('PF_KNOT_TOL', 0.01);
    const nT = Math.round(envF('PF_KNOT_SCAN', 8192));
    const nRows = Math.round(envF('PF_KNOT_ROWS', 240));
    const params = registryDefaults(STYLE);
    const rA = buildRadiusFn(STYLE as StyleId, params, DIMS);
    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
    const R = (th: number, z: number): number => rA(canon(th), z);
    const out: string[] = ['', `===== KNOT TRACE: ${STYLE} =====`, `params ${JSON.stringify(params)}`];
    const t0 = Date.now();

    // ── z-steps (same detector as the mesher) → bands ──
    const zSteps: number[] = [];
    {
      const nZ = 12000; const e1 = H / nZ; const e2 = e1 / 8;
      const probes = [0.21, 1.03, 2.44, 3.77, 5.29];
      let run = -1; let bestJ2 = 0; let bestZ = 0;
      const flush = (): void => { if (run >= 0) { zSteps.push(bestZ); run = -1; bestJ2 = 0; } };
      for (let j = 1; j < nZ; j += 1) {
        const z = H * (j / nZ);
        let j1 = 0; let j2 = 0;
        for (const th of probes) {
          j1 = Math.max(j1, Math.abs(R(th, z + e1) - R(th, z - e1)));
          j2 = Math.max(j2, Math.abs(R(th, z + e2) - R(th, z - e2)));
        }
        if (j2 > 0.8 * j1 && j1 > TOL) { if (run < 0) run = z; if (j2 > bestJ2) { bestJ2 = j2; bestZ = z; } } else flush();
      }
      flush();
    }
    out.push(`z-steps ${zSteps.length}: ${zSteps.map((z) => z.toFixed(3)).join(', ')}`);

    // ── per-row θ-jump detection (coarse two-scale bracket → bisect → ε-limit verdict) ──
    const d1 = TWO_PI / nT; const d2 = d1 / 8;
    /** all h0 θ-loci at THIS z, ascending, with the signed jump r(θ*+ε) − r(θ*−ε). */
    const lociAt = (z: number): Array<{ th: number; dj: number }> => {
      // CONTIGUOUS-INTERVAL BRACKETING. The centred two-scale test (|Δr| at d vs d/8, accept if the ratio ≈ 1) is a
      // correct CLASSIFIER but a broken FINDER: it only fires when the locus lands within d/8 of a bin CENTRE, i.e.
      // ~25 % recall on an arbitrary style. (BasketWeave passed only by luck — its loci at 2πk/16 sit exactly on bin
      // centres when nT is a multiple of 16.) Instead cover [0,2π) with abutting intervals and flag every interval
      // across which r moves more than tol: that is gap-free, so no jump can hide between samples. Steep-but-smooth
      // flanks flag too — they are thrown out by the ε-limit verdict below, which is the actual classifier.
      const brk: Array<[number, number]> = [];
      let start = 0; let prevIn = false;
      let prevR = R(0, z);
      for (let i = 1; i <= nT; i += 1) {
        const th = (TWO_PI * i) / nT;
        const cur = R(th, z);
        const isIn = Math.abs(cur - prevR) > TOL;
        if (isIn && !prevIn) start = th - d1;
        if (!isIn && prevIn) brk.push([start, th]);
        prevIn = isIn;
        prevR = cur;
      }
      if (prevIn) brk.push([start, TWO_PI]);
      const res: Array<{ th: number; dj: number }> = [];
      for (const [a0, b0] of brk) {
        let lo = a0; let hi = b0;
        const jSpan = (x: number, y: number): number => Math.abs(R(y, z) - R(x, z));
        for (let it = 0; it < 60; it += 1) {
          const mid = 0.5 * (lo + hi);
          if (mid <= lo || mid >= hi) break;
          if (jSpan(lo, mid) >= jSpan(mid, hi)) hi = mid; else lo = mid;
        }
        const th = 0.5 * (lo + hi);
        // ε-LIMIT VERDICT: a bracket is a JUMP only if |Δr| SURVIVES ε→0. A very sharp crease also fails the
        // coarse d/d8 ratio test (measured on GothicArches: 96/96 brackets rejected here), so this filter is
        // load-bearing, not cosmetic.
        const j9 = R(th + 1e-9, z) - R(th - 1e-9, z);
        const j3 = Math.abs(R(th + 1e-3, z) - R(th - 1e-3, z));
        if (Math.abs(j9) > TOL && Math.abs(j9) > 0.5 * j3) res.push({ th: canon(th) >= TWO_PI - 1e-9 ? 0 : canon(th), dj: j9 });
      }
      res.sort((p, q) => p.th - q.th);
      // cyclic dedup (a locus at θ=0 is found at both ends of the scan)
      const uniq: Array<{ th: number; dj: number }> = [];
      for (const r of res) if (!uniq.some((u) => Math.min(Math.abs(u.th - r.th), TWO_PI - Math.abs(u.th - r.th)) < 1e-6)) uniq.push(r);
      return uniq;
    };

    // ── sample rows inside each band, trace, and link ──
    const stepEps = 0.004;
    const bounds = [0, ...zSteps, H];
    const colBoundary = (th: number): boolean => {
      const nc = 3; // reported, not used for detection: how many loci sit on θ = 2πk/numColumns
      for (let k = 0; k < nc; k += 1) { const c = (TWO_PI * k) / nc; if (Math.min(Math.abs(th - c), TWO_PI - Math.abs(th - c)) < 1e-6) return true; }
      return false;
    };
    let totRows = 0; let totLoci = 0; let bandsConstM = 0; let bandsVarM = 0;
    let chainsTotal = 0; let chainsFullBand = 0; let births = 0; let deaths = 0;
    let orderViolations = 0;
    const magHist = new Map<string, number>();
    const countHist = new Map<number, number>();
    const gaps: number[] = [];
    let rowsTight = 0;
    const bandLines: string[] = [];
    for (let b = 0; b + 1 < bounds.length; b += 1) {
      const za = b === 0 ? 0 : bounds[b] + stepEps;
      const zb = b + 2 === bounds.length ? H : bounds[b + 1] - stepEps;
      if (zb <= za) continue;
      const rows = Math.max(2, Math.round((nRows * (zb - za)) / H));
      const perRow: Array<Array<{ th: number; dj: number }>> = [];
      for (let j = 0; j <= rows; j += 1) perRow.push(lociAt(za + ((zb - za) * j) / rows));
      totRows += rows + 1;
      const ms = perRow.map((L) => L.length);
      const mMin = Math.min(...ms); const mMax = Math.max(...ms);
      for (const L of perRow) {
        totLoci += L.length;
        countHist.set(L.length, (countHist.get(L.length) ?? 0) + 1);
        for (const r of L) { const k = `${(Math.abs(r.dj) * 1000).toFixed(0)}µm`; magHist.set(k, (magHist.get(k) ?? 0) + 1); }
        let mg = Infinity;
        for (let k = 0; k < L.length; k += 1) {
          const nx = L[(k + 1) % L.length].th + (k + 1 === L.length ? TWO_PI : 0);
          const g = nx - L[k].th;
          if (L.length > 1) { gaps.push(g); if (g < mg) mg = g; }
        }
        if (mg < 0.01) rowsTight += 1;
      }
      if (mMin === mMax) bandsConstM += 1; else bandsVarM += 1;
      // link consecutive rows by nearest θ (cyclic); count births/deaths and order violations
      let localChains = mMax;
      for (let j = 0; j + 1 < perRow.length; j += 1) {
        const A = perRow[j]; const B = perRow[j + 1];
        const used = new Set<number>();
        let matched = 0;
        const idxMap: number[] = [];
        for (let ia = 0; ia < A.length; ia += 1) {
          let best = -1; let bd = Infinity;
          for (let ib = 0; ib < B.length; ib += 1) {
            if (used.has(ib)) continue;
            const dd = Math.min(Math.abs(A[ia].th - B[ib].th), TWO_PI - Math.abs(A[ia].th - B[ib].th));
            if (dd < bd) { bd = dd; best = ib; }
          }
          if (best >= 0 && bd < 0.12) { used.add(best); matched += 1; idxMap.push(best); } else idxMap.push(-1);
        }
        deaths += A.length - matched;
        births += B.length - matched;
        // order violation = the matched indices are not monotone (cyclically) ⇒ two loci CROSSED between rows
        const seq = idxMap.filter((x) => x >= 0);
        for (let k = 0; k + 1 < seq.length; k += 1) if (seq[k + 1] < seq[k]) orderViolations += 1;
      }
      chainsTotal += localChains;
      if (mMin === mMax) chainsFullBand += mMin; else localChains = 0;
      const onCol = perRow[0].filter((r) => colBoundary(r.th)).length;
      bandLines.push(`  band ${String(b).padStart(2)} z=[${za.toFixed(2)},${zb.toFixed(2)}] rows ${rows + 1}: loci/row min ${mMin} max ${mMax} ${mMin === mMax ? '✓ CONSTANT' : '✗ VARIES'}   on-column-boundary ${onCol}`);
    }
    out.push(...bandLines);
    out.push(`rows scanned ${totRows}, total locus samples ${totLoci}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    out.push(`bands with CONSTANT locus count ${bandsConstM}/${bandsConstM + bandsVarM}   ⇒ curvilinear-column curtain applicable to ${chainsFullBand} chain-instances`);
    out.push(`chain births ${births}, deaths ${deaths}, θ-ORDER violations (true crossings) ${orderViolations}`);
    out.push(`jump magnitude histogram: ${[...magHist.entries()].sort((p, q) => q[1] - p[1]).slice(0, 12).map(([k, v]) => `${k}×${v}`).join('  ')}`);
    out.push(`loci-per-row histogram: ${[...countHist.entries()].sort((p, q) => p[0] - q[0]).map(([k, v]) => `${k}:${v}`).join('  ')}`);
    // COALESCENCE = the real topology event. Two loci merge when the θ-gap between ADJACENT loci closes; that is
    // also exactly where bracket-merging makes the count flicker, so measure the gap directly instead of trusting
    // the birth/death counter (which was measured to scale ∝ rows ⇒ artifact, not events).
    gaps.sort((a, b) => a - b);
    const gq = (p: number): number => gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))];
    out.push(`adjacent-locus θ-gap over ${gaps.length} pairs: min ${gq(0).toExponential(2)}  p1 ${gq(0.01).toExponential(2)}  p50 ${gq(0.5).toFixed(4)}  max ${gq(0.999).toFixed(4)} rad`);
    out.push(`  rows whose MIN adjacent gap < 0.01 rad (a coalescence in progress) : ${rowsTight}/${totRows}`);
    out.push('=========================================================', '');
    // eslint-disable-next-line no-console
    console.log(out.join('\n'));
  }, 3_000_000);
});
