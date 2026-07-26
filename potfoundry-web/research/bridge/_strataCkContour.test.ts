// _strataCkContour.test.ts — CONTOUR TRACER + jump-family census for the h0 loci of ANY style.
// Gated PF_STRATA_CKC=1. RESEARCH ONLY — reads src/, never writes it.
//
// WHY THIS EXISTS
// The chain curtain represents each h0 locus as theta(z) sampled PER ROW and links rows by nearest-theta matching.
// That model has three failure modes it cannot see:
//   (a) IDENTITY — when two loci come within the match window, the greedy nearest-theta matcher can swap them or
//       cascade a mis-association; the mesh then carries a curtain on the wrong branch (an h0 error refinement can
//       never remove).
//   (b) TERMINATION — where two loci merge and annihilate, the last chord runs from the last live row to a parked
//       theta; if the true merge point is not a mesh vertex the chord cuts the corner.
//   (c) COVERAGE — the chain count m is fixed at the MAX loci found on any single row. A branch whose lifetime does
//       not overlap that row gets NO chain at all and therefore NO curtain.
// The fix for all three is the same object: trace the locus set as CONTINUOUS CURVES by connectivity, with exact
// merge points, instead of re-detecting per row and guessing the correspondence.
//
// NOTE: the TRACER section of research/exchange/_strataCkContour/celticknot.report.txt was produced BEFORE the
// corrector/closure fixes and is superseded by the tracer now living in _strataChainCurtain.test.ts (PF_CB_TRACE).
// The CENSUS section of that report stands: 528/528 theta-jumps at exactly 600.0 um, tangent min 34.0 deg.
//
// MEASURED TRAP (round 1 of this file): a corrector window that scales with the STEP (win ~ slope*dz) grows to
// ~0.14 rad, larger than the 0.09 rad median inter-locus gap, so the tracer silently HOPS to a neighbouring locus.
// Symptom: 71 curves each spanning the full height with max |dtheta/dz| = 1084 rad/mm and ZERO turning points, on a
// style whose loci are gentle sines. The corrector therefore needs BOTH a tight window AND a slope-continuity gate;
// at a genuine merge the partner branch has the OPPOSITE slope, so slope continuity is what separates
// "the curve turned" from "I jumped to the neighbour".
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_CKC === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const TWO_PI = 2 * Math.PI;
const RBAR = 45; // mm — nominal radius, used ONLY to express theta offsets as arc length

const envF = (n: string, d: number): number => {
  const r = process.env[n];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
};
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

describe('STRATA contour tracer', () => {
  it.runIf(RUN)('traces h0 loci as continuous curves and censuses the jump families', () => {
    const STYLE = process.env.PF_CKC_STYLE ?? 'CelticKnot';
    const TOL = envF('PF_CKC_TOL', 0.01);
    const SCAN = Math.round(envF('PF_CKC_SCAN', 16384));
    const ZSCAN = Math.round(envF('PF_CKC_ZSCAN', 4096));
    const SEED_ROWS = Math.round(envF('PF_CKC_SEEDROWS', 16));
    const CHORD_TOL = envF('PF_CKC_CHORD', 0.004);         // mm arc — traced-polyline chord tolerance
    const params = registryDefaults(STYLE);
    if (process.env.PF_CKC_PARAMS !== undefined) Object.assign(params, JSON.parse(process.env.PF_CKC_PARAMS) as Record<string, number>);
    const rA = buildRadiusFn(STYLE as StyleId, params, DIMS);
    let nEval = 0;
    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
    const R = (th: number, z: number): number => { nEval += 1; return rA(canon(th), Math.min(H, Math.max(0, z))); };
    const out: string[] = ['', `===== STRATA CONTOUR TRACER: ${STYLE} =====`, `params ${JSON.stringify(params)}`];
    const t0 = Date.now();
    const cyc = (a: number, b: number): number => { const d = Math.abs(a - b) % TWO_PI; return Math.min(d, TWO_PI - d); };

    // ─────────────────────── PRIMITIVE: every theta-jump on a row, gap-free ───────────────────────
    const lociAtZ = (z: number, nScan = SCAN): number[] => {
      const dth = TWO_PI / nScan;
      const brk: Array<[number, number]> = [];
      let start = 0; let prevIn = false; let prevR = R(0, z);
      for (let i = 1; i <= nScan; i += 1) {
        const th = (TWO_PI * i) / nScan;
        const cur = R(th, z);
        const isIn = Math.abs(cur - prevR) > TOL;
        if (isIn && !prevIn) start = th - dth;
        if (!isIn && prevIn) brk.push([start, th]);
        prevIn = isIn; prevR = cur;
      }
      if (prevIn) brk.push([start, TWO_PI]);
      const res: number[] = [];
      for (const [a0, b0] of brk) {
        let lo = a0; let hi = b0;
        for (let it = 0; it < 60; it += 1) {
          const mid = 0.5 * (lo + hi);
          if (mid <= lo || mid >= hi) break;
          if (Math.abs(R(mid, z) - R(lo, z)) >= Math.abs(R(hi, z) - R(mid, z))) hi = mid; else lo = mid;
        }
        const th = 0.5 * (lo + hi);
        const j9 = Math.abs(R(th + 1e-9, z) - R(th - 1e-9, z));
        const j3 = Math.abs(R(th + 1e-3, z) - R(th - 1e-3, z));
        if (j9 > TOL && j9 > 0.5 * j3) res.push(canon(th) >= TWO_PI - 1e-9 ? 0 : canon(th));
      }
      res.sort((x, y) => x - y);
      const uq: number[] = [];
      for (const x of res) if (!uq.some((u) => cyc(u, x) < 1e-7)) uq.push(x);
      return uq;
    };
    /** every theta-jump inside [c-w, c+w] at this z (a LOCAL, much finer scan than the global one). */
    const lociWin = (z: number, c: number, w: number, n: number): number[] => {
      const res: number[] = [];
      let pr = R(c - w, z);
      for (let i = 1; i <= n; i += 1) {
        const th = c - w + (2 * w * i) / n;
        const cur = R(th, z);
        if (Math.abs(cur - pr) > TOL) {
          let lo = th - (2 * w) / n; let hi = th;
          for (let it = 0; it < 60; it += 1) {
            const mid = 0.5 * (lo + hi);
            if (mid <= lo || mid >= hi) break;
            if (Math.abs(R(mid, z) - R(lo, z)) >= Math.abs(R(hi, z) - R(mid, z))) hi = mid; else lo = mid;
          }
          const c2 = 0.5 * (lo + hi);
          if (Math.abs(R(c2 + 1e-9, z) - R(c2 - 1e-9, z)) > TOL) res.push(c2);
        }
        pr = cur;
      }
      res.sort((x, y) => x - y);
      const uq: number[] = [];
      for (const x of res) if (!uq.some((u) => Math.abs(u - x) < 1e-9)) uq.push(x);
      return uq;
    };

    // ─────────────────────── 1. JUMP-FAMILY CENSUS (theta AND z) ───────────────────────
    const censusRows = Math.round(envF('PF_CKC_CENSUS_ROWS', 48));
    const censusCols = Math.round(envF('PF_CKC_CENSUS_COLS', 48));
    let thJumpTotal = 0; const thMags: number[] = [];
    for (let j = 0; j < censusRows; j += 1) {
      const z = (H * (j + 0.5)) / censusRows;
      const L = lociAtZ(z, 4096);
      thJumpTotal += L.length;
      for (const th of L) thMags.push(Math.abs(R(th + 1e-9, z) - R(th - 1e-9, z)));
    }
    // Z-jump sites, kept for attribution: a z-jump is NOT automatically a new family — a STEEP theta-locus is
    // crossed by a column scan too. What separates them is the LOCUS TANGENT: measure the direction along which the
    // jump vanishes. Near-vertical tangent ⇒ same family as the theta scan; near-horizontal ⇒ a locus that is a
    // graph over THETA, which no per-row theta scan can ever see.
    const zSites: Array<[number, number, number]> = []; // th, z, magnitude
    for (let i = 0; i < censusCols; i += 1) {
      const th = (TWO_PI * (i + 0.5)) / censusCols;
      let prev = R(th, 0);
      const dz = H / ZSCAN;
      for (let k = 1; k <= ZSCAN; k += 1) {
        const z = (H * k) / ZSCAN;
        const cur = R(th, z);
        if (Math.abs(cur - prev) > TOL) {
          let lo = z - dz; let hi = z;
          for (let it = 0; it < 50; it += 1) {
            const m = 0.5 * (lo + hi);
            if (m <= lo || m >= hi) break;
            if (Math.abs(R(th, m) - R(th, lo)) >= Math.abs(R(th, hi) - R(th, m))) hi = m; else lo = m;
          }
          const zc = 0.5 * (lo + hi);
          const j9 = Math.abs(R(th, zc + 1e-9) - R(th, zc - 1e-9));
          const j3 = Math.abs(R(th, zc + 1e-3) - R(th, zc - 1e-3));
          if (j9 > TOL && j9 > 0.5 * j3) zSites.push([th, zc, j9]);
        }
        prev = cur;
      }
    }
    /** the locus TANGENT angle at (th,z), in metric (arc,z) space: the direction minimising the two-sided jump. */
    const tangentAngle = (th: number, z: number): number => {
      const eps = 2e-6; // mm in metric space
      let bestA = 0; let bestJ = Infinity;
      for (let k = 0; k < 180; k += 1) {
        const a = (Math.PI * k) / 180;
        const dth = (Math.cos(a) * eps) / RBAR; const dzz = Math.sin(a) * eps;
        const j = Math.abs(R(th + dth, z + dzz) - R(th - dth, z - dzz));
        if (j < bestJ) { bestJ = j; bestA = a; }
      }
      return bestA; // 0 = horizontal locus (graph over theta), pi/2 = vertical locus (graph over z)
    };
    const stat = (a: number[]): string => {
      if (a.length === 0) return 'none';
      const s = a.slice().sort((x, y) => x - y);
      const qf = (p: number): number => s[Math.min(s.length - 1, Math.floor(p * s.length))];
      return `n=${s.length} min ${(qf(0) * 1000).toFixed(1)} p50 ${(qf(0.5) * 1000).toFixed(1)} max ${(s[s.length - 1] * 1000).toFixed(1)} um`;
    };
    const NTAN = Math.min(zSites.length, Math.round(envF('PF_CKC_NTAN', 400)));
    let nearHoriz = 0; const tanDeg: number[] = [];
    for (let k = 0; k < NTAN; k += 1) {
      const [th, z] = zSites[Math.floor((k * zSites.length) / Math.max(1, NTAN))];
      const a = (tangentAngle(th, z) * 180) / Math.PI;
      tanDeg.push(a);
      // 45 deg is the WRONG threshold and mislabels this style: a tangent of 34 deg means dz/darc = 0.67, i.e.
      // |darc/dz| = 1.48 mm/mm, which IS the analytic max slope of the strand sine — a steep theta-locus, not a
      // horizontal one. Only a tangent within a few degrees of 0 is a locus a per-row theta scan cannot see.
      if (a < 5 || a > 175) nearHoriz += 1;
    }
    out.push('--- 1. JUMP-FAMILY CENSUS ---');
    out.push(`  THETA-jumps: ${thJumpTotal} over ${censusRows} rows   magnitude ${stat(thMags)}`);
    out.push(`  Z-jump SITES: ${zSites.length} over ${censusCols} columns   magnitude ${stat(zSites.map((s) => s[2]))}`);
    out.push(`  locus TANGENT at ${NTAN} z-jump sites (0/180 deg = HORIZONTAL locus a theta-scan cannot see, 90 deg = vertical):`);
    out.push(`    near-horizontal (<5 deg from the theta axis) ${nearHoriz}/${NTAN}   ${nearHoriz === 0 ? '⇒ ONE family: every z-jump is a steep theta-locus crossed by the column scan' : '⇒ *** A SECOND, THETA-GRAPH FAMILY EXISTS ***'}`);
    if (tanDeg.length > 0) {
      const s = tanDeg.slice().sort((a, b) => a - b);
      out.push(`    tangent-angle distribution: min ${s[0].toFixed(1)} p10 ${s[Math.floor(0.1 * s.length)].toFixed(1)} p50 ${s[Math.floor(0.5 * s.length)].toFixed(1)} max ${s[s.length - 1].toFixed(1)} deg`);
    }

    // ─────────────────────── 2. CONTOUR TRACER ───────────────────────
    const DZ0 = envF('PF_CKC_DZ0', 1.0);
    const DZ_FIRST = envF('PF_CKC_DZFIRST', 0.02);
    const DZ_MIN = envF('PF_CKC_DZMIN', 1e-7);
    const WIN0 = envF('PF_CKC_WIN0', 1.5e-3);      // rad — corrector half-window FLOOR (~68 um arc)
    const WINCAP = envF('PF_CKC_WINCAP', 8e-3);    // rad — hard cap, well under the 0.09 rad inter-locus gap
    const WINN = Math.round(envF('PF_CKC_WINN', 32));
    const SLOPE_TOL = envF('PF_CKC_SLOPETOL', 4e-3); // rad/mm — slope-continuity gate
    const MERGE_WIN = envF('PF_CKC_MERGEWIN', 1e-2);
    const MAXNODES = Math.round(envF('PF_CKC_MAXNODES', 200000));
    interface Node { th: number; z: number; corner: boolean }
    interface Curve { pts: Node[]; closed: boolean; id: number }
    const correct = (z: number, thPred: number, win: number): number => {
      const L = lociWin(z, thPred, win, WINN);
      let best = NaN; let bd = Infinity;
      for (const x of L) { const d = Math.abs(x - thPred); if (d < bd) { bd = d; best = x; } }
      return best;
    };
    interface March { pts: Node[]; end: 'domain' | 'merge' | 'dead'; endTh: number; endZ: number; partner: number }
    const marchBranch = (th0: number, z0: number, dir: number, zLo: number, zHi: number): March => {
      const pts: Node[] = [{ th: th0, z: z0, corner: false }];
      let th = th0; let z = z0; let dz = DZ_FIRST; let slope = 0; let haveSlope = false;
      let guard = 400000;
      for (;;) {
        if (guard-- <= 0 || pts.length > MAXNODES) return { pts, end: 'dead', endTh: th, endZ: z, partner: NaN };
        let zN = z + dir * dz;
        if (zN > zHi) zN = zHi;
        if (zN < zLo) zN = zLo;
        if (Math.abs(zN - z) < 1e-12) return { pts, end: 'domain', endTh: th, endZ: z, partner: NaN };
        const pred = th + (haveSlope ? slope * (zN - z) : 0);
        const win = Math.min(WINCAP, WIN0 + (haveSlope ? SLOPE_TOL * Math.abs(zN - z) : 0));
        const thN = correct(zN, pred, win);
        // SLOPE-CONTINUITY GATE: at a merge the partner branch has the OPPOSITE slope, so a candidate whose implied
        // slope is inconsistent is a HOP, not a continuation. Refuse it and shrink the step.
        const okSlope = !haveSlope || (Number.isFinite(thN) && Math.abs((thN - th) / (zN - z) - slope) <= SLOPE_TOL + 0.5 * Math.abs(slope));
        if (!Number.isFinite(thN) || !okSlope) {
          if (dz > DZ_MIN) { dz *= 0.5; continue; }
          let lo = z; let hi = zN; let thLast = th;
          for (let it = 0; it < 60; it += 1) {
            const m = 0.5 * (lo + hi);
            if (m === lo || m === hi) break;
            const t2 = correct(m, thLast + (haveSlope ? slope * (m - lo) : 0), Math.min(WINCAP, WIN0 + SLOPE_TOL * Math.abs(m - lo)));
            if (Number.isFinite(t2) && (!haveSlope || Math.abs(t2 - thLast) < WINCAP)) { lo = m; thLast = t2; } else hi = m;
          }
          pts.push({ th: thLast, z: lo, corner: true });
          const back = lo - dir * 1e-6;
          const near = lociWin(back, thLast, MERGE_WIN, 128).filter((x) => Math.abs(x - thLast) > 1e-11);
          let partner = NaN; let bd = Infinity;
          for (const x of near) { const d = Math.abs(x - thLast); if (d < bd) { bd = d; partner = x; } }
          if (Number.isFinite(partner) && bd < MERGE_WIN) return { pts, end: 'merge', endTh: thLast, endZ: lo, partner };
          return { pts, end: 'dead', endTh: thLast, endZ: lo, partner: NaN };
        }
        // CHORD CONTROL — measure the real midpoint deviation rather than estimating curvature.
        const zm = 0.5 * (z + zN);
        const thm = correct(zm, 0.5 * (th + thN), Math.min(WINCAP, WIN0 + SLOPE_TOL * Math.abs(zN - z)));
        if (Number.isFinite(thm)) {
          const dev = Math.abs(thm - 0.5 * (th + thN)) * RBAR;
          if (dev > CHORD_TOL && dz > 64 * DZ_MIN) { dz *= 0.5; continue; }
          if (dev < 0.15 * CHORD_TOL) dz = Math.min(DZ0, dz * 1.7);
        }
        slope = (thN - th) / (zN - z); haveSlope = true;
        th = thN; z = zN;
        pts.push({ th, z, corner: false });
        if (z >= zHi - 1e-12 || z <= zLo + 1e-12) return { pts, end: 'domain', endTh: th, endZ: z, partner: NaN };
      }
    };
    const traceThrough = (th0: number, z0: number, zLo: number, zHi: number): Curve => {
      const half = (dir: number): Node[] => {
        const acc: Node[] = [];
        let th = th0; let z = z0; let d = dir; let hops = 0;
        for (;;) {
          const m = marchBranch(th, z, d, zLo, zHi);
          for (let i = 1; i < m.pts.length; i += 1) acc.push(m.pts[i]);
          if (m.end !== 'merge' || hops++ > 2000 || acc.length > MAXNODES) break;
          th = m.partner; z = m.endZ; d = -d;
          acc.push({ th, z, corner: false });
          if (cyc(th, th0) * RBAR < 1e-3 && Math.abs(z - z0) < 1e-6) break; // closed
        }
        return acc;
      };
      const up = half(+1); const dn = half(-1);
      const pts: Node[] = [...dn.slice().reverse(), { th: th0, z: z0, corner: false }, ...up];
      const closed = pts.length > 3 && cyc(pts[0].th, pts[pts.length - 1].th) * RBAR < 1e-3 && Math.abs(pts[0].z - pts[pts.length - 1].z) < 1e-6;
      return { pts, closed, id: 0 };
    };

    const seedZ: number[] = [];
    for (let j = 0; j < SEED_ROWS; j += 1) seedZ.push((H * (j + 0.5)) / SEED_ROWS);
    const seeds: Array<[number, number]> = [];
    for (const z of seedZ) for (const th of lociAtZ(z)) seeds.push([th, z]);
    out.push(`--- 2. TRACER --- seeds ${seeds.length} from ${SEED_ROWS} rows (${(nEval / 1e6).toFixed(2)}M evals so far)`);
    const curves: Curve[] = [];
    const nearCurve = (th: number, z: number): number => {
      let best = Infinity;
      for (const c of curves) {
        for (let i = 0; i + 1 < c.pts.length; i += 1) {
          const a = c.pts[i]; const b = c.pts[i + 1];
          if (z < Math.min(a.z, b.z) - 1e-9 || z > Math.max(a.z, b.z) + 1e-9) continue;
          const u = Math.abs(b.z - a.z) < 1e-12 ? 0 : (z - a.z) / (b.z - a.z);
          best = Math.min(best, cyc(a.th + (b.th - a.th) * u, th) * RBAR);
        }
      }
      return best;
    };
    for (const [th, z] of seeds) {
      if (nearCurve(th, z) < 0.05) continue;
      const c = traceThrough(th, z, 0, H);
      c.id = curves.length;
      curves.push(c);
    }

    // ─────────────────────── 3. CONTOUR STATS ───────────────────────
    let totArc = 0; let corners = 0; let maxSlope = 0; const wedge: number[] = [];
    let openC = 0; let closedC = 0; let nodes = 0;
    for (const c of curves) {
      if (c.closed) closedC += 1; else openC += 1;
      nodes += c.pts.length;
      for (let i = 0; i + 1 < c.pts.length; i += 1) {
        const a = c.pts[i]; const b = c.pts[i + 1];
        let dth = b.th - a.th; if (dth > Math.PI) dth -= TWO_PI; else if (dth < -Math.PI) dth += TWO_PI;
        totArc += Math.hypot(dth * RBAR, b.z - a.z);
        if (Math.abs(b.z - a.z) > 1e-9) maxSlope = Math.max(maxSlope, Math.abs(dth / (b.z - a.z)));
      }
      for (let i = 1; i + 1 < c.pts.length; i += 1) {
        const p = c.pts[i - 1]; const q = c.pts[i]; const s = c.pts[i + 1];
        if ((q.z - p.z) * (s.z - q.z) < 0) {
          corners += 1;
          const a1 = Math.atan2(q.z - p.z, (q.th - p.th) * RBAR);
          const a2 = Math.atan2(s.z - q.z, (s.th - q.th) * RBAR);
          let d = Math.abs(a2 - a1); if (d > Math.PI) d = TWO_PI - d;
          wedge.push(Math.PI - d);
        }
      }
    }
    out.push(`  curves ${curves.length} (${closedC} closed, ${openC} open)   nodes ${nodes}   total arc ${totArc.toFixed(1)} mm`);
    out.push(`  z-TURNING POINTS (merge corners) ${corners}   max |dtheta/dz| ${maxSlope.toFixed(5)} rad/mm (= ${(maxSlope * RBAR).toFixed(4)} mm arc per mm z)`);
    if (wedge.length > 0) {
      const w = wedge.slice().sort((a, b) => a - b);
      out.push(`  wedge angle at corners: min ${((w[0] * 180) / Math.PI).toFixed(3)} deg  p50 ${((w[Math.floor(w.length / 2)] * 180) / Math.PI).toFixed(3)} deg  max ${((w[w.length - 1] * 180) / Math.PI).toFixed(3)} deg`);
    }

    // ─────────────────────── 4. COVERAGE PROOF (independent rows) ───────────────────────
    const VROWS = Math.round(envF('PF_CKC_VROWS', 41));
    let vTot = 0; let vMiss = 0; let worstOff = 0; let worstAt = '';
    const liveHist = new Map<number, number>();
    for (let j = 0; j < VROWS; j += 1) {
      const z = (H * (j + 0.37)) / VROWS;
      const L = lociAtZ(z);
      vTot += L.length;
      liveHist.set(L.length, (liveHist.get(L.length) ?? 0) + 1);
      for (const th of L) {
        const best = nearCurve(th, z);
        if (best > 0.01) { vMiss += 1; if (best > worstOff) { worstOff = best; worstAt = `th=${th.toFixed(6)} z=${z.toFixed(4)}`; } }
      }
    }
    out.push('--- 3. COVERAGE (independent rows, tracer never saw them) ---');
    out.push(`  loci checked ${vTot} over ${VROWS} rows   NOT within 10 um of any traced curve: ${vMiss}  ${vMiss === 0 ? 'PASS' : 'FAIL'}${vMiss > 0 ? `  worst ${(worstOff * 1000).toFixed(1)} um @ ${worstAt}` : ''}`);
    out.push(`  live-loci-per-row histogram: ${[...liveHist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
    // OVER-coverage is the mirror failure and just as fatal: a traced curve where there is NO locus plants a curtain
    // on empty geometry. Check the reverse direction too.
    let ghost = 0; let ghostTot = 0;
    for (let j = 0; j < VROWS; j += 1) {
      const z = (H * (j + 0.37)) / VROWS;
      const L = lociAtZ(z);
      for (const c of curves) {
        for (let i = 0; i + 1 < c.pts.length; i += 1) {
          const a = c.pts[i]; const b = c.pts[i + 1];
          if (z < Math.min(a.z, b.z) || z > Math.max(a.z, b.z)) continue;
          const u = Math.abs(b.z - a.z) < 1e-12 ? 0 : (z - a.z) / (b.z - a.z);
          const thI = a.th + (b.th - a.th) * u;
          ghostTot += 1;
          let bd = Infinity;
          for (const th of L) bd = Math.min(bd, cyc(thI, th) * RBAR);
          if (bd > 0.01) ghost += 1;
          break;
        }
      }
    }
    out.push(`  GHOST check: ${ghost}/${ghostTot} traced-curve crossings with NO locus within 10 um  ${ghost === 0 ? 'PASS' : 'FAIL'}`);

    // ─────────────────────── 5. CHAIN-MODEL GAP ───────────────────────
    let branches = 0;
    for (const c of curves) {
      let segs = 1;
      for (let i = 1; i + 1 < c.pts.length; i += 1) { const p = c.pts[i - 1]; const q = c.pts[i]; const s = c.pts[i + 1]; if ((q.z - p.z) * (s.z - q.z) < 0) segs += 1; }
      branches += segs;
    }
    const mMax = Math.max(...[...liveHist.keys()]);
    out.push('--- 4. CHAIN-MODEL GAP ---');
    out.push(`  traced curves ${curves.length}, monotone branches ${branches}, MAX simultaneous loci on one row m=${mMax}`);
    out.push(`  ⇒ a fixed-m chain grid carries ${mMax} slots for ${branches} branches; ${Math.max(0, branches - mMax)} branch(es) must SHARE a slot (inert between lives).`);

    const DUMP = Math.round(envF('PF_CKC_DUMP', 10));
    for (let i = 0; i < Math.min(DUMP, curves.length); i += 1) {
      const c = curves[i];
      const zs = c.pts.map((p) => p.z);
      const ths = c.pts.map((p) => p.th);
      let seg = 1;
      for (let k = 1; k + 1 < c.pts.length; k += 1) if ((c.pts[k].z - c.pts[k - 1].z) * (c.pts[k + 1].z - c.pts[k].z) < 0) seg += 1;
      out.push(`  curve ${i}: ${c.pts.length} nodes ${c.closed ? 'CLOSED' : 'open'} branches ${seg} z=[${Math.min(...zs).toFixed(3)},${Math.max(...zs).toFixed(3)}] th=[${Math.min(...ths).toFixed(5)},${Math.max(...ths).toFixed(5)}]`);
    }
    out.push(`total ${(nEval / 1e6).toFixed(2)}M rA evals, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    out.push('=========================================================', '');
    const dir = join('research', 'exchange', '_strataCkContour');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${STYLE.toLowerCase()}.report.txt`), out.join('\n'));
    writeFileSync(join(dir, `${STYLE.toLowerCase()}.curves.json`), JSON.stringify(curves.map((c) => ({ closed: c.closed, pts: c.pts.map((p) => [p.th, p.z]) }))));
    // eslint-disable-next-line no-console
    console.log(out.join('\n'));
  }, 3_000_000);
});
