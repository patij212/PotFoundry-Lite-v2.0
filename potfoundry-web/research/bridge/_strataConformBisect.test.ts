// _strataConformBisect.test.ts — STRATA-001 follow-on: SHAPE-AGNOSTIC closure by FEATURE-DIRECTED CONFORMING BISECTION.
// Gated PF_STRATA_CB=1. RESEARCH ONLY — never touches src/, never touches the proven _strataVoronoiSolid harness.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE IDEA (three independent levers, each flag-gated, ALL DEFAULT OFF ⇒ this file reproduces STRATA grid+LEPP)
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// STRATA's `bisect(a,b)` already splits EVERY triangle incident to edge (a,b). That means bisecting an ARBITRARY
// edge at an ARBITRARY point is watertight and T-junction-free by construction. LEPP's longest-edge rule is NOT a
// topological requirement — it is only a triangle-QUALITY heuristic. That freedom is the whole lever:
//
//   L1  DIRECTED (PF_CB_DIRECTED=1) — split the edge with the largest EDGE CHORD SAG, not the longest edge.
//       An edge lying ALONG a straight ridge has ~0 sag; the edge ACROSS it has all of it. So refinement becomes
//       anisotropic *for free*, with no metric tensor, no M=g/h² field, no per-style code. (The analytic budget
//       probe measures this lever at 14× on GothicArches: 2.08 M isotropic vs 0.15 M anisotropic.)
//       Guarded by an ASPECT CAP: never split an edge already shorter than longest/AR — else needles.
//
//   L2  SNAP (PF_CB_SNAP=1) — when the chosen edge CROSSES a feature locus, put the new vertex exactly ON the locus
//       instead of at the midpoint. Because `bisect` splits both incident triangles at that same point, the two
//       neighbours agree by construction. After the 2nd crossing edge of a triangle is split, the chord joining the
//       two locus vertices IS a mesh edge — i.e. the CHAIN emerges from local edge splits; no chain contract, no
//       marching squares, no splitPolygonByChain, no fail-closed refusal needed. Junctions need no special case:
//       a cell with 3–4 crossings simply gets 3–4 splits.
//       Locus finding is a generic 1-D KINK LOCATOR (below): direction-agnostic, works on ANY r(θ,z).
//
//   L3  REPROJECT (PF_CB_REPROJECT=1) — an edge whose BOTH ends are on a locus runs ALONG it. Its arithmetic
//       midpoint leaves a CURVED locus by κ·L²/8, so conforming decays exactly as you refine. Re-solve that midpoint
//       by running the same 1-D kink locator on a short TRANSVERSE segment. Bounded move (≤ CB_REPROJ_FRAC·|ab|).
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE 1-D KINK LOCATOR (the single generic detector — no per-style code, no axis projection)
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Given ANY segment in (θ,z), find where the surface has a gradient discontinuity along it:
//   1. coarse scan of |Δ²r| over N bins → argmax bin → bracket
//   2. TWO-SCALE class test at the argmax: small/big ≈ 1/16 ⇒ smooth (reject), ≈1/4 ⇒ CREASE (accept), ≈1 ⇒ JUMP
//   3. BRACKET-HALVING kink bisection: keep the half whose |Δ²r| is larger. 24 halvings ⇒ ~1e-7 of the segment.
// Step 3 is the piece that matters and that the earlier crease-cut prototype lacked: placing the vertex within
// ~0.6 µm of the crest is REQUIRED (an offset δ costs ≈ 2·Δs·δ ≈ 16·δ of sag on GothicArches' rib), and a
// linear-fit intercept on a 20-bin scan is ~10 µm accurate — 20× too coarse. Sub-µm placement is not a polish
// detail, it is the difference between conforming and not.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_CB === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const TWO_PI = 2 * Math.PI;

type P3 = [number, number, number];

function envF(n: string, d: number): number {
  const r = process.env[n];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}
const envOn = (n: string): boolean => process.env[n] === '1';
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

describe('STRATA conforming-bisection', () => {
  it.runIf(RUN)('meshes any style by feature-directed conforming bisection', () => {
    const STYLE = process.env.PF_CB_STYLE ?? 'GothicArches';
    const TOL = envF('PF_CB_TOL', 0.01);
    const acceptTol = envF('PF_CB_ACCEPT', 0.007);
    const triCap = Math.round(envF('PF_CB_TRICAP', 2_500_000));
    const gu = Math.round(envF('PF_CB_GRIDU', 200));
    const gv = Math.round(envF('PF_CB_GRIDV', 140));
    const oracleN = Math.round(envF('PF_CB_ORACLE', 12)); // final audit (same as STRATA ⇒ comparable)
    const oracleRef = Math.round(envF('PF_CB_ORACLE_REF', 8)); // cheaper oracle while refining
    const ADAPT = process.env.PF_CB_ADAPT !== '0'; // resolution-bounded oracle (on by default; =0 for the STRATA ruler)
    const DIRECTED = envOn('PF_CB_DIRECTED');
    const SNAP = envOn('PF_CB_SNAP');
    const REPROJ = envOn('PF_CB_REPROJECT');
    const AR = envF('PF_CB_AR', 8); // aspect cap for directed splits
    const FLOOR_MM = envF('PF_CB_FLOOR_UM', 1.5) / 1000;
    const WELD_MM = envF('PF_CB_WELD_UM', 0.05) / 1000;
    const COLLAPSE_MM = envF('PF_CB_COLLAPSE_UM', 1) / 1000;
    const SNAP_ALPHA = envF('PF_CB_SNAP_ALPHA', 0.12); // reject crossings within α of an endpoint (sliver guard)
    const REPROJ_FRAC = envF('PF_CB_REPROJ_FRAC', 0.15); // max transverse move as a fraction of |ab|
    const KINK_RATIO = envF('PF_CB_KINK_RATIO', 0.15); // small/big above this ⇒ crease-or-jump (smooth ≈ 0.0625)
    const JUMP_RATIO = envF('PF_CB_JUMP_RATIO', 0.62); // small/big above this ⇒ C0 JUMP (needs a curtain, not a snap)
    const KINK_SCAN = Math.round(envF('PF_CB_KINK_SCAN', 16));
    const KINK_HALVINGS = Math.round(envF('PF_CB_KINK_HALVINGS', 24));
    const DEBUG = envOn('PF_CB_DEBUG');
    const t0ms = Date.now();

    const styleParams: Record<string, number> = { ...registryDefaults(STYLE) };
    if (process.env.PF_CB_PARAMS !== undefined) Object.assign(styleParams, JSON.parse(process.env.PF_CB_PARAMS) as Record<string, number>);
    const rA = buildRadiusFn(STYLE as StyleId, styleParams, DIMS);
    let rEvals = 0;
    const R = (th: number, z: number): number => { rEvals += 1; return rA(th, z); };

    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };

    // ───────────────────────────── mesh store (θ,z) with 3D spatial-hash weld ─────────────────────────────
    const vth: number[] = []; const vz: number[] = []; const vx: number[] = []; const vy: number[] = [];
    const vFeat: boolean[] = []; // vertex sits ON a detected feature locus
    const gcell = new Map<string, number[]>();
    const gi = (v: number): number => Math.floor(v / WELD_MM);
    const addV = (thetaRaw: number, z: number, feat = false): number => {
      const theta = canon(thetaRaw);
      const r = R(theta, z);
      const x = r * Math.cos(theta); const y = r * Math.sin(theta);
      const cx = gi(x); const cy = gi(y); const cz = gi(z);
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
        const list = gcell.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (list === undefined) continue;
        for (const j of list) if (Math.hypot(vx[j] - x, vy[j] - y, vz[j] - z) <= WELD_MM) { if (feat) vFeat[j] = true; return j; }
      }
      const idx = vth.length;
      vth.push(theta); vz.push(z); vx.push(x); vy.push(y); vFeat.push(feat);
      const key = `${cx},${cy},${cz}`;
      const b = gcell.get(key); if (b === undefined) gcell.set(key, [idx]); else b.push(idx);
      return idx;
    };
    /** shortest-arc θ delta from a to b (handles the θ=0≡2π seam). */
    const dTh = (a: number, b: number): number => {
      let d = vth[b] - vth[a];
      if (d > Math.PI) d -= TWO_PI; else if (d < -Math.PI) d += TWO_PI;
      return d;
    };
    /** point on edge (a,b) at parameter t∈[0,1], as (θ,z) — shortest arc. */
    const edgeParam = (a: number, b: number, t: number): [number, number] => [vth[a] + dTh(a, b) * t, vz[a] + (vz[b] - vz[a]) * t];

    const ta: number[] = []; const tb: number[] = []; const tc: number[] = []; const alive: boolean[] = [];
    const BIG = 1 << 27;
    const edgeMap = new Map<number, number[]>();
    const eKey = (a: number, b: number): number => (a < b ? a * BIG + b : b * BIG + a);
    const eAdd = (a: number, b: number, t: number): void => { const k = eKey(a, b); const l = edgeMap.get(k); if (l === undefined) edgeMap.set(k, [t]); else l.push(t); };
    const eDel = (a: number, b: number, t: number): void => { const l = edgeMap.get(eKey(a, b)); if (l === undefined) return; const i = l.indexOf(t); if (i >= 0) l.splice(i, 1); };
    const addT = (a: number, b: number, c: number): number => {
      if (a === b || b === c || c === a) return -1;
      const t = ta.length;
      ta.push(a); tb.push(b); tc.push(c); alive.push(true);
      eAdd(a, b, t); eAdd(b, c, t); eAdd(c, a, t);
      return t;
    };
    const killT = (t: number): void => { alive[t] = false; eDel(ta[t], tb[t], t); eDel(tb[t], tc[t], t); eDel(tc[t], ta[t], t); };
    const eLen = (a: number, b: number): number => Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]);

    // ───────────────────────────── THE GENERIC 1-D KINK LOCATOR ─────────────────────────────
    // Segment (th0,z0) → (th1,z1) in (θ,z). Returns the parameter of the gradient discontinuity + its class.
    // Direction-agnostic: this is the ONLY detector, and it is applied to whatever segment we hand it — mesh edges
    // (any orientation) and transverse probes. No z-scan, no θ-scan, no axis projection anywhere.
    interface Kink { t: number; big: number; ratio: number; jump: boolean }
    const locateKink = (th0: number, z0: number, th1: number, z1: number): Kink | null => {
      const dth = th1 - th0; const dz = z1 - z0;
      const at = (t: number): number => R(canon(th0 + dth * t), z0 + dz * t);
      // 1. coarse scan
      const N = KINK_SCAN;
      const rs = new Float64Array(N + 1);
      for (let k = 0; k <= N; k += 1) rs[k] = at(k / N);
      let bi = -1; let bv = 0;
      for (let k = 1; k < N; k += 1) { const d2 = Math.abs(rs[k + 1] - 2 * rs[k] + rs[k - 1]); if (d2 > bv) { bv = d2; bi = k; } }
      if (bi < 0 || bv <= 0) return null;
      // 2. bracket-halving kink bisection — keep the half with the larger |Δ²r|. Converges on the kink itself,
      //    NOT on the argmax bin centre; this is what buys sub-µm placement.
      let lo = (bi - 1) / N; let hi = (bi + 1) / N;
      let fLo = rs[bi - 1]; let fHi = rs[bi + 1]; let fMid = rs[bi];
      for (let it = 0; it < KINK_HALVINGS; it += 1) {
        const mid = 0.5 * (lo + hi);
        const q1 = 0.5 * (lo + mid); const q3 = 0.5 * (mid + hi);
        const fq1 = at(q1); const fq3 = at(q3);
        const dL = Math.abs(fLo - 2 * fq1 + fMid);
        const dR = Math.abs(fMid - 2 * fq3 + fHi);
        if (dL >= dR) { hi = mid; fHi = fMid; fMid = fq1; } else { lo = mid; fLo = fMid; fMid = fq3; }
      }
      const tStar = 0.5 * (lo + hi);
      // 3. TWO-SCALE class test AT the located point (window = the original bracket half-width)
      const w = 1 / N;
      const c = at(tStar);
      const big = Math.abs(at(tStar + w) - 2 * c + at(tStar - w));
      const small = Math.abs(at(tStar + w / 4) - 2 * c + at(tStar - w / 4));
      if (big <= 1e-12) return null;
      const ratio = small / big;
      if (ratio < KINK_RATIO) return null; // smooth curvature peak (≈1/16) — density handles it
      return { t: tStar, big, ratio, jump: ratio > JUMP_RATIO };
    };

    // ───────────────────────────── EDGE CHORD SAG (the anisotropy driver) ─────────────────────────────
    // max distance from the true surface curve over the edge's parametric span to the straight 3D edge.
    const ES_N = Math.round(envF('PF_CB_ESN', 8));
    const edgeSag = (a: number, b: number): number => {
      const ax = vx[a]; const ay = vy[a]; const az = vz[a];
      let ex = vx[b] - ax; let ey = vy[b] - ay; let ez = vz[b] - az;
      const eL2 = ex * ex + ey * ey + ez * ez;
      if (eL2 < 1e-24) return 0;
      const th0 = vth[a]; const d = dTh(a, b); const z0 = vz[a]; const dz = vz[b] - vz[a];
      let best = 0;
      for (let k = 1; k < ES_N; k += 1) {
        const t = k / ES_N;
        const th = th0 + d * t; const z = z0 + dz * t;
        const r = R(canon(th), z);
        const px = r * Math.cos(th) - ax; const py = r * Math.sin(th) - ay; const pz = z - az;
        const proj = (px * ex + py * ey + pz * ez) / eL2;
        const qx = px - proj * ex; const qy = py - proj * ey; const qz = pz - proj * ez;
        const dist = Math.hypot(qx, qy, qz);
        if (dist > best) best = dist;
      }
      return best;
    };

    // ───────────────────────────── TRIANGLE SAG ORACLE ─────────────────────────────
    const sagOfN = (t: number, n: number): number => {
      const a = ta[t]; const b = tb[t]; const c = tc[t];
      const ax = vx[a]; const ay = vy[a]; const az = vz[a];
      let nx = (vy[b] - ay) * (vz[c] - az) - (vz[b] - az) * (vy[c] - ay);
      let ny = (vz[b] - az) * (vx[c] - ax) - (vx[b] - ax) * (vz[c] - az);
      let nz = (vx[b] - ax) * (vy[c] - ay) - (vy[b] - ay) * (vx[c] - ax);
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-18) return 0;
      nx /= nl; ny /= nl; nz /= nl;
      const th0 = vth[a]; const dB = dTh(a, b); const dC = dTh(a, c);
      let s = 0;
      for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n - i; j += 1) {
        const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
        const theta = th0 + wb * dB + wc * dC;
        const z = wa * vz[a] + wb * vz[b] + wc * vz[c];
        const r = R(canon(theta), z);
        const dd = Math.abs((r * Math.cos(theta) - ax) * nx + (r * Math.sin(theta) - ay) * ny + (z - az) * nz);
        if (dd > s) s = dd;
      }
      return s;
    };
    // RESOLUTION-BOUNDED oracle. MEASURED TRAP: a FIXED barycentric sample count under-reports by up to 11× on a
    // coarse triangle straddling a thin sharp feature (GothicArches rib: 110 µm @ n=8, 790 µm @ n=12, 1257 µm @ n=44
    // — same triangle). That corrupts the priority queue (worst triangles look mild ⇒ never popped) AND the verdict.
    // Sampling must be bounded in ABSOLUTE mm, not in triangle fractions.
    const sagAdaptive = (t: number, hSample: number, nMin: number, nMax: number): number => {
      const le = Math.max(eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t]));
      const n = Math.max(nMin, Math.min(nMax, Math.ceil(le / hSample)));
      return sagOfN(t, n);
    };
    const REF_HS = envF('PF_CB_REF_HS', 0.15); const REF_NMIN = Math.round(envF('PF_CB_REF_NMIN', 6)); const REF_NMAX = Math.round(envF('PF_CB_REF_NMAX', 24));
    const AUD_HS = envF('PF_CB_AUD_HS', 0.03); const AUD_NMIN = Math.round(envF('PF_CB_AUD_NMIN', 12)); const AUD_NMAX = Math.round(envF('PF_CB_AUD_NMAX', 64));

    // ───────────────────────────── INIT: uniform θ×z grid, C0 z-bands ─────────────────────────────
    const zSteps: number[] = [];
    {
      const nZ = 12000; const d1 = H / nZ; const d2 = d1 / 8;
      const probes = [0.21, 1.03, 2.44, 3.77, 5.29];
      let run = -1; let bestJ2 = 0; let bestZ = 0;
      const flush = (): void => { if (run >= 0) { zSteps.push(bestZ); run = -1; bestJ2 = 0; } };
      for (let j = 1; j < nZ; j += 1) {
        const z = H * (j / nZ);
        let j1 = 0; let j2 = 0;
        for (const th of probes) {
          j1 = Math.max(j1, Math.abs(R(th, z + d1) - R(th, z - d1)));
          j2 = Math.max(j2, Math.abs(R(th, z + d2) - R(th, z - d2)));
        }
        if (j2 > 0.8 * j1 && j1 > TOL) { if (run < 0) run = z; if (j2 > bestJ2) { bestJ2 = j2; bestZ = z; } } else flush();
      }
      flush();
    }
    const stepEps = envF('PF_CB_STEP_EPS_UM', 4) / 1000;
    const bounds = [0, ...zSteps, H];
    for (let b = 0; b + 1 < bounds.length; b += 1) {
      const za = b === 0 ? 0 : bounds[b] + stepEps;
      const zb = b + 2 === bounds.length ? H : bounds[b + 1] - stepEps;
      const bandH = zb - za;
      if (bandH <= 0) continue;
      const rows = Math.max(1, Math.round((gv * bandH) / H));
      const grid: number[][] = [];
      for (let j = 0; j <= rows; j += 1) {
        const z = za + (bandH * j) / rows;
        const row: number[] = [];
        for (let i = 0; i < gu; i += 1) row.push(addV((TWO_PI * i) / gu, z));
        grid.push(row);
      }
      for (let j = 0; j < rows; j += 1) for (let i = 0; i < gu; i += 1) {
        const i1 = (i + 1) % gu;
        addT(grid[j][i], grid[j][i1], grid[j + 1][i1]);
        addT(grid[j][i], grid[j + 1][i1], grid[j + 1][i]);
      }
    }

    // ───────────────────────────── BISECTION ─────────────────────────────
    const created: number[] = [];
    let nSnap = 0; let nReproj = 0; let nJump = 0;
    /** split edge (a,b) at parameter t (0..1) — splits EVERY incident triangle ⇒ watertight, no T-junctions. */
    const bisectAt = (a: number, b: number, tPar: number, feat: boolean): boolean => {
      const [mth, mz] = edgeParam(a, b, tPar);
      const m = addV(mth, mz, feat);
      if (m === a || m === b) return false; // weld collapsed the split — nothing to do
      const list = (edgeMap.get(eKey(a, b)) ?? []).slice();
      // DEGENERACY GUARD (measured need): if the new vertex welds onto an incident triangle's APEX, both replacement
      // triangles are degenerate — the split then DELETES geometry and the refinement churns forever without growing
      // (SNAP+LEPP ablation: 6 M allocations, 68 k alive). Refuse the split so the caller falls back.
      for (const t of list) {
        if (!alive[t]) continue;
        if (ta[t] === m || tb[t] === m || tc[t] === m) return false;
      }
      let made = false;
      for (const t of list) {
        if (!alive[t]) continue;
        const apex = ta[t] !== a && ta[t] !== b ? ta[t] : tb[t] !== a && tb[t] !== b ? tb[t] : tc[t];
        const seq = [ta[t], tb[t], tc[t]];
        let oa = a; let ob = b;
        for (let i = 0; i < 3; i += 1) {
          if (seq[i] === a && seq[(i + 1) % 3] === b) { oa = a; ob = b; break; }
          if (seq[i] === b && seq[(i + 1) % 3] === a) { oa = b; ob = a; break; }
        }
        killT(t);
        created.push(addT(oa, m, apex));
        created.push(addT(m, ob, apex));
        made = true;
      }
      return made;
    };
    /** where to split edge (a,b): feature crossing (SNAP) → transverse re-solve (REPROJECT) → midpoint. */
    const splitEdge = (a: number, b: number): boolean => {
      if (SNAP) {
        const k = locateKink(vth[a], vz[a], vth[a] + dTh(a, b), vz[b]);
        if (k !== null && k.t > SNAP_ALPHA && k.t < 1 - SNAP_ALPHA) {
          if (k.jump) nJump += 1;
          nSnap += 1;
          if (bisectAt(a, b, k.t, true)) return true;
        }
      }
      if (REPROJ && vFeat[a] && vFeat[b]) {
        // edge runs ALONG a locus: re-solve the midpoint transversally so conforming survives refinement
        const [mth, mz] = edgeParam(a, b, 0.5);
        const rMid = R(canon(mth), mz);
        const eArc = rMid * dTh(a, b); const eZ = vz[b] - vz[a];
        const L = Math.hypot(eArc, eZ);
        if (L > 1e-9) {
          const span = REPROJ_FRAC * L;
          const pArc = -eZ / L; const pZ = eArc / L; // unit perpendicular in (arc,z)
          const dth = (pArc * span) / Math.max(1e-6, rMid); const dz = pZ * span;
          const k = locateKink(mth - dth, mz - dz, mth + dth, mz + dz);
          // GUARD: two vertices on the SAME locus put its chord deviation κ·L²/8 near the probe CENTRE. A kink found
          // near a probe END is a DIFFERENT locus (common once many vertices carry the feature tag) — following it
          // drags the midpoint across neighbouring geometry and manufactures 0.1 µm needles (measured). Reject it.
          if (k !== null && !k.jump && Math.abs(2 * k.t - 1) < 0.5) {
            const off = 2 * k.t - 1; // −1..1 across the transverse probe
            nReproj += 1;
            const m = addV(mth + off * dth, mz + off * dz, true);
            if (m !== a && m !== b) {
              const list = (edgeMap.get(eKey(a, b)) ?? []).slice();
              let made = false;
              for (const t of list) {
                if (!alive[t]) continue;
                const apex = ta[t] !== a && ta[t] !== b ? ta[t] : tb[t] !== a && tb[t] !== b ? tb[t] : tc[t];
                const seq = [ta[t], tb[t], tc[t]];
                let oa = a; let ob = b;
                for (let i = 0; i < 3; i += 1) {
                  if (seq[i] === a && seq[(i + 1) % 3] === b) { oa = a; ob = b; break; }
                  if (seq[i] === b && seq[(i + 1) % 3] === a) { oa = b; ob = a; break; }
                }
                killT(t);
                created.push(addT(oa, m, apex));
                created.push(addT(m, ob, apex));
                made = true;
              }
              if (made) return true;
            }
          }
        }
      }
      return bisectAt(a, b, 0.5, vFeat[a] && vFeat[b]);
    };

    // LEPP walk (quality-preserving longest-edge chain) — used when DIRECTED is off.
    const longestE = (t: number): number => {
      const l0 = eLen(ta[t], tb[t]); const l1 = eLen(tb[t], tc[t]); const l2 = eLen(tc[t], ta[t]);
      if (l0 >= l1 && l0 >= l2) return 0;
      if (l1 >= l0 && l1 >= l2) return 1;
      return 2;
    };
    const eVerts = (t: number, e: number): [number, number] => (e === 0 ? [ta[t], tb[t]] : e === 1 ? [tb[t], tc[t]] : [tc[t], ta[t]]);
    const neighbor = (t: number, a: number, b: number): number => {
      const l = edgeMap.get(eKey(a, b));
      if (l === undefined) return -1;
      for (const o of l) if (o !== t && alive[o]) return o;
      return -1;
    };
    const refineLepp = (t0: number): void => {
      let guard = 200_000;
      while (alive[t0] && guard-- > 0) {
        if (ta.length >= triCap) return;
        let t = t0; let inner = 200_000;
        for (;;) {
          if (inner-- <= 0 || ta.length >= triCap) return;
          const e = longestE(t); const [a, b] = eVerts(t, e);
          const nb = neighbor(t, a, b);
          if (nb === -1) { if (!splitEdge(a, b)) return; break; }
          const enb = longestE(nb); const [na, nv] = eVerts(nb, enb);
          if ((na === a && nv === b) || (na === b && nv === a)) { if (!splitEdge(a, b)) return; break; }
          t = nb;
        }
        if (!alive[t0]) break;
        const e0 = longestE(t0); const [a0, b0] = eVerts(t0, e0);
        const nb0 = neighbor(t0, a0, b0);
        if (nb0 === -1) { splitEdge(a0, b0); break; }
        const en0 = longestE(nb0); const [na0, nv0] = eVerts(nb0, en0);
        if ((na0 === a0 && nv0 === b0) || (na0 === b0 && nv0 === a0)) { if (!splitEdge(a0, b0)) return; break; }
      }
    };
    /** DIRECTED: split the edge with the largest chord sag, subject to an aspect cap. */
    const refineDirected = (t: number): void => {
      const vs: Array<[number, number]> = [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]];
      const ls = vs.map(([a, b]) => eLen(a, b));
      const lMax = Math.max(ls[0], ls[1], ls[2]);
      let pick = -1; let bestSag = -1;
      for (let e = 0; e < 3; e += 1) {
        if (ls[e] < FLOOR_MM) continue;
        if (ls[e] * AR < lMax) continue; // aspect guard: never thin an already-short edge further
        const s = edgeSag(vs[e][0], vs[e][1]);
        if (s > bestSag) { bestSag = s; pick = e; }
      }
      if (pick < 0) { // everything guarded → fall back to the longest edge
        const e = longestE(t);
        if (ls[e] >= FLOOR_MM) splitEdge(...eVerts(t, e));
        return;
      }
      splitEdge(vs[pick][0], vs[pick][1]);
    };

    // ───────────────────────────── worst-first refinement ─────────────────────────────
    const heapT: number[] = []; const heapK: number[] = [];
    const hswap = (i: number, j: number): void => { const t = heapT[i]; heapT[i] = heapT[j]; heapT[j] = t; const k = heapK[i]; heapK[i] = heapK[j]; heapK[j] = k; };
    const hpush = (t: number, k: number): void => {
      heapT.push(t); heapK.push(k);
      let i = heapT.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heapK[p] >= heapK[i]) break; hswap(i, p); i = p; }
    };
    const hpop = (): number => {
      const top = heapT[0]; const lt = heapT.pop() as number; const lk = heapK.pop() as number;
      if (heapT.length > 0) {
        heapT[0] = lt; heapK[0] = lk;
        let i = 0; const n = heapT.length;
        for (;;) {
          let big = i; const l = 2 * i + 1; const r = 2 * i + 2;
          if (l < n && heapK[l] > heapK[big]) big = l;
          if (r < n && heapK[r] > heapK[big]) big = r;
          if (big === i) break;
          hswap(i, big); i = big;
        }
      }
      return top;
    };
    const consider = (t: number): void => {
      if (t < 0 || !alive[t]) return;
      const le = Math.max(eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t]));
      if (le < FLOOR_MM) return;
      const s = ADAPT ? sagAdaptive(t, REF_HS, REF_NMIN, REF_NMAX) : sagOfN(t, oracleRef);
      if (s > acceptTol) hpush(t, s);
    };
    for (let t = 0; t < ta.length; t += 1) consider(t);
    const initTris = ta.length;
    let capped = false;
    let iters = 0;
    let stuck = 0;
    let lastKey = Infinity;
    let keyInversions = 0;
    while (heapT.length > 0) {
      const kTop = heapK[0];
      const t = hpop();
      if (kTop > lastKey + 1e-12) keyInversions += 1;
      lastKey = kTop;
      if (!alive[t]) continue;
      if (ta.length >= triCap) { capped = true; break; }
      created.length = 0;
      if (DIRECTED) refineDirected(t); else refineLepp(t);
      for (const nt of created) consider(nt);
      if (created.length > 0) consider(t);
      iters += 1;
      if (created.length === 0) stuck += 1; // split produced nothing (weld collapse) — do not spin on it
      if (DEBUG && iters % 200000 === 0) {
        let al = 0; for (let k = 0; k < alive.length; k += 1) if (alive[k]) al += 1;
        // eslint-disable-next-line no-console
        console.log(`   … ${iters} splits, ${al} alive, heap ${heapT.length}, ${((Date.now() - t0ms) / 1000).toFixed(0)}s, ${(rEvals / 1e6).toFixed(0)}M rA`);
      }
    }

    let heapLeftMax = 0;
    for (let i = 0; i < heapT.length; i += 1) if (alive[heapT[i]] && heapK[i] > heapLeftMax) heapLeftMax = heapK[i];

    // ───────────────────────────── needle collapse ─────────────────────────────
    const COLLAPSE_ON = process.env.PF_CB_COLLAPSE !== '0';
    const uf = new Int32Array(vth.length);
    for (let i = 0; i < uf.length; i += 1) uf[i] = i;
    const find = (x0: number): number => { let x = x0; while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
    const union = (a: number, b: number): void => { const ra = find(a); const rb = find(b); if (ra !== rb) uf[Math.max(ra, rb)] = Math.min(ra, rb); };
    if (COLLAPSE_ON) for (let t = 0; t < ta.length; t += 1) {
      if (!alive[t]) continue;
      const a = ta[t]; const b = tb[t]; const c = tc[t];
      const eab = eLen(a, b); const ebc = eLen(b, c); const eca = eLen(c, a);
      const mn = Math.min(eab, ebc, eca);
      if (mn < COLLAPSE_MM) { if (eab === mn) union(a, b); else if (ebc === mn) union(b, c); else union(c, a); }
    }
    let collapsedTris = 0;
    if (COLLAPSE_ON) for (let t = 0; t < ta.length; t += 1) {
      if (!alive[t]) continue;
      const a = find(ta[t]); const b = find(tb[t]); const c = find(tc[t]);
      if (a === b || b === c || c === a) { alive[t] = false; collapsedTris += 1; continue; }
      ta[t] = a; tb[t] = b; tc[t] = c;
    }

    // ───────── LINK-CONDITION-SAFE NEEDLE COLLAPSE (generic mesh-quality pass) ─────────
    // Adaptive bisection occasionally lands two vertices ~0.1 µm apart (two independent split points converging on the
    // same locus). The resulting needle (measured on GeometricStar: edges 983/983/0.1 µm) has a garbage plane normal,
    // so its sag reads ~84 µm even though the surface there is fine — and the 3D position weld in any downstream
    // audit/slicer merges the pair, turning the shared edges NON-MANIFOLD (measured 215).
    // The naive union-find collapse used by STRATA also creates non-manifold edges (measured 12 on GothicArches).
    // The standard guarantee is the LINK CONDITION: edge (u,v) is collapsible iff N(u) ∩ N(v) is exactly the set of
    // apexes of the triangles sharing (u,v). Enforce it; refuse otherwise. Style-agnostic, geometry-agnostic.
    let safeCollapses = 0; let refusedCollapses = 0;
    const SAFE_MM = envF('PF_CB_NEEDLE_UM', 0.2) / 1000;
    if (process.env.PF_CB_SAFE_COLLAPSE === '1') {
      const nbr = new Map<number, Set<number>>();
      const vTris = new Map<number, Set<number>>();
      const addNbr = (p: number, q: number): void => { let s = nbr.get(p); if (s === undefined) { s = new Set(); nbr.set(p, s); } s.add(q); };
      const addVT = (p: number, t: number): void => { let s = vTris.get(p); if (s === undefined) { s = new Set(); vTris.set(p, s); } s.add(t); };
      for (let t = 0; t < ta.length; t += 1) {
        if (!alive[t]) continue;
        const a = ta[t]; const b = tb[t]; const c = tc[t];
        addNbr(a, b); addNbr(b, a); addNbr(b, c); addNbr(c, b); addNbr(c, a); addNbr(a, c);
        addVT(a, t); addVT(b, t); addVT(c, t);
      }
      const shortEdges: Array<[number, number, number]> = [];
      const seenE = new Set<number>();
      for (let t = 0; t < ta.length; t += 1) {
        if (!alive[t]) continue;
        for (const [p, qv] of [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]] as Array<[number, number]>) {
          const k = eKey(p, qv);
          if (seenE.has(k)) continue;
          seenE.add(k);
          const L = eLen(p, qv);
          if (L < SAFE_MM) shortEdges.push([L, p, qv]);
        }
      }
      shortEdges.sort((x, y) => x[0] - y[0]);
      for (const [, u0, v0] of shortEdges) {
        const u = u0; const v = v0;
        const su = vTris.get(u); const sv = vTris.get(v);
        if (su === undefined || sv === undefined) continue;
        const shared: number[] = [];
        for (const t of su) if (alive[t] && sv.has(t)) shared.push(t);
        if (shared.length === 0) continue;
        const apex = new Set<number>();
        for (const t of shared) { for (const w of [ta[t], tb[t], tc[t]]) if (w !== u && w !== v) apex.add(w); }
        const nu = nbr.get(u); const nv = nbr.get(v);
        if (nu === undefined || nv === undefined) continue;
        let inter = 0; let ok = true;
        for (const w of nu) if (nv.has(w)) { inter += 1; if (!apex.has(w)) { ok = false; break; } }
        if (!ok || inter !== apex.size) { refusedCollapses += 1; continue; }
        // collapse v → u
        for (const t of shared) { alive[t] = false; collapsedTris += 1; }
        for (const t of Array.from(sv)) {
          if (!alive[t]) continue;
          if (ta[t] === v) ta[t] = u; if (tb[t] === v) tb[t] = u; if (tc[t] === v) tc[t] = u;
          addVT(u, t);
        }
        for (const w of nv) { if (w === u) continue; const nw = nbr.get(w); if (nw !== undefined) { nw.delete(v); nw.add(u); } addNbr(u, w); }
        nbr.delete(v); vTris.delete(v);
        nu.delete(v);
        safeCollapses += 1;
      }
    }

    // ───────────────────────────── soup + watertight audit (3D position weld) ─────────────────────────────
    const soup: Array<[P3, P3, P3]> = [];
    const PT = (i: number): P3 => [vx[i], vy[i], vz[i]];
    const liveIdx: number[] = [];
    for (let t = 0; t < ta.length; t += 1) if (alive[t]) { soup.push([PT(ta[t]), PT(tb[t]), PT(tc[t])]); liveIdx.push(t); }
    const wCell = new Map<string, number[]>(); const wpos: P3[] = [];
    const wIndex = (p: P3): number => {
      const cx = gi(p[0]); const cy = gi(p[1]); const cz = gi(p[2]);
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
        const l = wCell.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (l === undefined) continue;
        for (const j of l) if (Math.hypot(wpos[j][0] - p[0], wpos[j][1] - p[1], wpos[j][2] - p[2]) <= WELD_MM) return j;
      }
      const idx = wpos.length; wpos.push(p);
      const key = `${cx},${cy},${cz}`;
      const b = wCell.get(key); if (b === undefined) wCell.set(key, [idx]); else b.push(idx);
      return idx;
    };
    const ec = new Map<number, number>();
    const WB = 1 << 25;
    const bump = (a: number, b: number): void => { const k = a < b ? a * WB + b : b * WB + a; ec.set(k, (ec.get(k) ?? 0) + 1); };
    for (const [a, b, c] of soup) { const ia = wIndex(a); const ib = wIndex(b); const ic = wIndex(c); bump(ia, ib); bump(ib, ic); bump(ic, ia); }
    let nonManifold = 0; let boundary = 0;
    const bAdj = new Map<number, number[]>();
    for (const [k, cnt] of ec.entries()) {
      if (cnt === 2) continue;
      if (cnt > 2) { nonManifold += 1; continue; }
      boundary += 1;
      const a = Math.floor(k / WB); const b = k % WB;
      (bAdj.get(a) ?? (bAdj.set(a, []), bAdj.get(a) as number[])).push(b);
      (bAdj.get(b) ?? (bAdj.set(b, []), bAdj.get(b) as number[])).push(a);
    }
    const seen = new Set<number>(); const loops: number[][] = [];
    for (const s of bAdj.keys()) {
      if (seen.has(s)) continue;
      const loop: number[] = []; let cur = s; let prev = -1; let guard = bAdj.size + 5;
      while (guard-- > 0) {
        loop.push(cur); seen.add(cur);
        let next = -1;
        for (const n of bAdj.get(cur) ?? []) if (n !== prev && (!seen.has(n) || n === s)) { next = n; break; }
        if (next === -1 || next === s) break;
        prev = cur; cur = next;
      }
      if (loop.length > 2) loops.push(loop);
    }
    let seamCrack = 0;
    for (const loop of loops) {
      const mz = loop.reduce((sm, i) => sm + wpos[i][2], 0) / loop.length;
      if (mz > 1e-3 && mz < H - 1e-3) seamCrack += loop.length;
    }

    // ───────────────────────────── fidelity (oracle N) + tail re-measure ─────────────────────────────
    const sags: number[] = []; let maxSag = 0; let maxT = -1; let minEdge = Infinity;
    let maxFixed = 0; let maxFixedT = -1;
    for (const t of liveIdx) {
      const s = sagAdaptive(t, AUD_HS, AUD_NMIN, AUD_NMAX); // HONEST ruler (absolute-bounded sampling)
      const sf = sagOfN(t, oracleN); // STRATA-comparable fixed-N ruler
      sags.push(s);
      if (s > maxSag) { maxSag = s; maxT = t; }
      if (sf > maxFixed) { maxFixed = sf; maxFixedT = t; }
      minEdge = Math.min(minEdge, eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t]));
    }
    // ADVERSARIAL TAIL: the per-triangle barycentric oracle can UNDER-report a straddled crest (it may sample past
    // the tent tip). Re-measure the worst K at a much denser oracle so a PASS cannot be a sampling artifact.
    const tailK = Math.round(envF('PF_CB_TAILK', 3000));
    const tailN = Math.round(envF('PF_CB_TAILN', 44));
    const order = liveIdx.map((t, i) => i).sort((p, q) => sags[q] - sags[p]).slice(0, Math.min(tailK, liveIdx.length));
    let tailMax = 0; let tailT = -1;
    for (const i of order) { const t = liveIdx[i]; const s = sagOfN(t, tailN); if (s > tailMax) { tailMax = s; tailT = t; } }
    // ───────── LOCUS AUDIT = the CLOSURE INVARIANT (re-detect features ON the produced mesh) ─────────
    // Barycentric sampling CANNOT prove a tolerance on a surface with gradient jumps: a tent tip between two samples
    // is missed by up to Δs·pitch/2, and Δs ≈ 16.7 mm/mm on GothicArches' rib ⇒ a 17 µm pitch admits a 140 µm blind
    // spot. Denser sampling is hopeless (proving 10 µm would need a ~1.2 µm pitch ⇒ ~28 G evaluations).
    // The tractable proof is TARGETED: the sag maximum of a triangle sits either at a smooth interior critical point
    // (which moderate sampling does capture) or ON a feature locus crossing the triangle. So re-run the SAME generic
    // kink locator on every alive triangle's three edges; where ≥2 crossings are found, the locus crosses the
    // triangle — sample densely along the chord joining them, which is exactly where the tent tip lives.
    // If no triangle is crossed by a locus, no triangle has h¹ error character ⇒ the mesh is conformed, and the
    // barycentric ruler is then valid (smooth interiors only). This is self-verifying generality: it either passes
    // or names the exact triangles it could not conform.
    let locusMax = 0; let locusT = -1; let locusCrossed = 0;
    if (process.env.PF_CB_LOCUS_AUDIT === '1') {
      const LA_N = Math.round(envF('PF_CB_LOCUS_N', 40));
      for (const t of liveIdx) {
        const a = ta[t]; const b = tb[t]; const c = tc[t];
        const pairs: Array<[number, number]> = [[a, b], [b, c], [c, a]];
        const hits: Array<[number, number]> = [];
        for (const [p, qv] of pairs) {
          const k = locateKink(vth[p], vz[p], vth[p] + dTh(p, qv), vz[qv]);
          if (k !== null) hits.push(edgeParam(p, qv, k.t));
        }
        if (hits.length < 2) continue;
        locusCrossed += 1;
        const ax = vx[a]; const ay = vy[a]; const az = vz[a];
        let nx = (vy[b] - ay) * (vz[c] - az) - (vz[b] - az) * (vy[c] - ay);
        let ny = (vz[b] - az) * (vx[c] - ax) - (vx[b] - ax) * (vz[c] - az);
        let nz = (vx[b] - ax) * (vy[c] - ay) - (vy[b] - ay) * (vx[c] - ax);
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-18) continue;
        nx /= nl; ny /= nl; nz /= nl;
        let worst = 0;
        for (let i = 0; i < hits.length; i += 1) for (let j = i + 1; j < hits.length; j += 1) {
          const [t0h, z0h] = hits[i]; const [t1h, z1h] = hits[j];
          let dth2 = t1h - t0h;
          if (dth2 > Math.PI) dth2 -= TWO_PI; else if (dth2 < -Math.PI) dth2 += TWO_PI;
          for (let k = 0; k <= LA_N; k += 1) {
            const u = k / LA_N;
            const th = t0h + dth2 * u; const z = z0h + (z1h - z0h) * u;
            const r = R(canon(th), z);
            const dd = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
            if (dd > worst) worst = dd;
          }
        }
        if (worst > locusMax) { locusMax = worst; locusT = t; }
      }
    }

    const sorted = sags.slice().sort((a, b) => a - b);
    const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const over = sorted.filter((s) => s > TOL).length;
    const um = (mm: number): string => (mm * 1000).toFixed(3);
    const locus = (t: number): string => {
      if (t < 0) return 'n/a';
      const [a, b, c] = [ta[t], tb[t], tc[t]];
      const es = [eLen(a, b), eLen(b, c), eLen(c, a)].map((x) => (x * 1000).toFixed(1)).join('/');
      const zc = (vz[a] + vz[b] + vz[c]) / 3;
      return `z=[${[vz[a], vz[b], vz[c]].map((x) => x.toFixed(2)).join(',')}] (${((100 * zc) / H).toFixed(0)}% H) θ=[${[vth[a], vth[b], vth[c]].map((x) => x.toFixed(4)).join(',')}] edges(µm)=${es} feat=[${[vFeat[a], vFeat[b], vFeat[c]].map((f) => (f ? 1 : 0)).join('')}]`;
    };

    const outDir = join('research', 'exchange', '_strataConformBisect');
    mkdirSync(outDir, { recursive: true });
    const tag = `${STYLE.toLowerCase()}_${DIRECTED ? 'D' : 'l'}${SNAP ? 'S' : '-'}${REPROJ ? 'R' : '-'}`;
    const buf = Buffer.alloc(84 + soup.length * 50);
    buf.write('STRATA conforming-bisection', 0, 'ascii');
    buf.writeUInt32LE(soup.length, 80);
    let o = 84;
    for (const [a, b, c] of soup) {
      let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const nl = Math.hypot(nx, ny, nz) || 1;
      buf.writeFloatLE(nx / nl, o); buf.writeFloatLE(ny / nl, o + 4); buf.writeFloatLE(nz / nl, o + 8);
      for (const [k, p] of [a, b, c].entries()) { buf.writeFloatLE(p[0], o + 12 + k * 12); buf.writeFloatLE(p[1], o + 16 + k * 12); buf.writeFloatLE(p[2], o + 20 + k * 12); }
      buf.writeUInt16LE(0, o + 48); o += 50;
    }
    writeFileSync(join(outDir, `${tag}.stl`), buf);

    const report = [
      '',
      `===== STRATA CONFORMING-BISECTION: ${STYLE} RING  [${DIRECTED ? 'DIRECTED' : 'lepp'} | ${SNAP ? 'SNAP' : 'no-snap'} | ${REPROJ ? 'REPROJ' : 'no-reproj'}] =====`,
      `params ${JSON.stringify(styleParams)}`,
      `grid ${gu}×${gv} (${initTris} init tris) → ${soup.length} tris (alloc ${ta.length}/${triCap})${capped ? '  [CAPPED]' : ''}   ${((Date.now() - t0ms) / 1000).toFixed(0)}s, ${(rEvals / 1e6).toFixed(0)}M rA evals`,
      `splits ${iters}   snaps ${nSnap} (jump-class ${nJump})   transverse re-solves ${nReproj}   z-steps ${zSteps.length}   collapsed ${collapsedTris} (safe ${safeCollapses}, link-refused ${refusedCollapses})`,
      `heap: ${heapT.length} left, worst-left ${um(heapLeftMax)} µm, key-inversions ${keyInversions}, no-op splits ${stuck}   MAXtri@oracle${oracleRef} ${maxT >= 0 ? um(sagOfN(maxT, oracleRef)) : 'n/a'} µm`,
      '--- WATERTIGHT (3D position-weld) ---',
      `  non-manifold edges : ${nonManifold}  ${nonManifold === 0 ? 'OK' : 'FAIL'}`,
      `  seam-crack edges   : ${seamCrack}  ${seamCrack === 0 ? 'OK' : 'FAIL'}`,
      `  boundary edges     : ${boundary}   loops ${loops.length} (ring ⇒ top+bottom only)`,
      `--- FIDELITY (HONEST ruler: adaptive oracle, ≤${AUD_HS}mm sample pitch, n∈[${AUD_NMIN},${AUD_NMAX}]) ---`,
      `  MAX ${um(maxSag)} µm  ${maxSag <= TOL ? 'PASS' : 'FAIL'}   p99 ${um(q(0.99))}  p50 ${um(q(0.5))}  over-${TOL}mm ${over}/${sorted.length}`,
      `  MAX-locus: ${locus(maxT)}`,
      `  [STRATA-comparable fixed oracle ${oracleN}]: MAX ${um(maxFixed)} µm   locus ${locus(maxFixedT)}`,
      `  TAIL re-measure (worst ${order.length} @ oracle ${tailN}): MAX ${um(tailMax)} µm  ${tailMax <= TOL ? 'PASS' : 'FAIL'}`,
      `  TAIL-locus: ${locus(tailT)}`,
      ...(process.env.PF_CB_LOCUS_AUDIT === '1'
        ? [`  LOCUS AUDIT (closure invariant): ${locusCrossed} tris still crossed by a detected locus; worst on-locus sag ${um(locusMax)} µm  ${locusMax <= TOL ? 'PASS' : 'FAIL'}`,
           `  LOCUS-locus: ${locus(locusT)}`]
        : []),
      `  min edge ${um(minEdge)} µm`,
      '=========================================================',
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
    writeFileSync(join(outDir, `${tag}.report.txt`), report);
    expect(nonManifold).toBe(0);
    expect(seamCrack).toBe(0);
  }, 6_000_000);
});
