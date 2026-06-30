// potfoundry-web/research/bridge/surfaceSmoothing.ts
//
// ON-SURFACE Laplacian smoothing — the quality "polish" pass. Improves 3D triangle shape (drives min/mean
// angle toward equilateral) WITHOUT leaving the true surface, so the relief is preserved.
//
// Why averaging in 3D (not in (u,t)): a plain (u,t)-Laplacian would pull vertices toward parameter-uniform,
// which is exactly the 3D-distorted layout the surface metric fought to avoid. Instead we average each interior
// vertex's 1-ring in 3D, recover (θ,z) from that centroid, and re-snap the radius to the analytic surface
// rA(θ,z). The vertex therefore moves TANGENTIALLY on the surface (shape improves) but stays exactly on it
// (fidelity preserved — radius is never averaged, always re-evaluated). Boundary vertices of the (u,t) patch
// are pinned. Jacobi updates + under-relaxation for stability; interior vertices are clamped strictly inside.
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;

export function smoothSurfaceOnRadial(
  ut: number[], indices: ArrayLike<number>, rA: AnalyticRadiusFn, H: number,
  opts: { iterations?: number; relax?: number; boundaryEps?: number; pinned?: Set<number> } = {},
): number[] {
  const iterations = opts.iterations ?? 5;
  const relax = opts.relax ?? 0.5;
  const eps = opts.boundaryEps ?? 1e-6;
  // OPT-IN: extra vertex indices to PIN in place (e.g. injected feature-crest vertices) so the optimizer
  // cannot relax them off the locus they were placed on. STRICT NO-OP when undefined/empty — the pinned[]
  // array below is filled ONLY from the patch-boundary test, exactly as before.
  const pinExtra = opts.pinned;
  const n = ut.length / 2;
  const u = new Float64Array(n), t = new Float64Array(n);
  for (let i = 0; i < n; i++) { u[i] = ut[2 * i]; t[i] = ut[2 * i + 1]; }

  // 1-ring adjacency as a CSR (typed arrays, no Set) with O(1) mark-based dedup of distinct neighbours.
  const m = indices.length;
  const deg = new Int32Array(n);
  for (let k = 0; k < m; k += 3) { deg[indices[k]] += 2; deg[indices[k + 1]] += 2; deg[indices[k + 2]] += 2; }
  const rawOff = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) rawOff[i + 1] = rawOff[i] + deg[i];
  const rawNbr = new Int32Array(rawOff[n]);
  const fill = Int32Array.from(rawOff.subarray(0, n));
  for (let k = 0; k < m; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    rawNbr[fill[a]++] = b; rawNbr[fill[a]++] = c;
    rawNbr[fill[b]++] = a; rawNbr[fill[b]++] = c;
    rawNbr[fill[c]++] = a; rawNbr[fill[c]++] = b;
  }
  const off = new Int32Array(n + 1);
  const nbr = new Int32Array(rawOff[n]);
  const mark = new Int32Array(n).fill(-1);
  let w = 0;
  for (let i = 0; i < n; i++) {
    off[i] = w;
    for (let p = rawOff[i]; p < rawOff[i + 1]; p++) { const nb = rawNbr[p]; if (mark[nb] !== i) { mark[nb] = i; nbr[w++] = nb; } }
  }
  off[n] = w;

  // pin patch-boundary vertices (u or t at 0/1)
  const pinned = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (u[i] <= eps || u[i] >= 1 - eps || t[i] <= eps || t[i] >= 1 - eps) pinned[i] = 1;
  }
  // additionally pin any explicitly-requested vertices (no-op when pinExtra is undefined/empty)
  if (pinExtra !== undefined) for (const idx of pinExtra) if (idx >= 0 && idx < n) pinned[idx] = 1;

  const px = new Float64Array(n), py = new Float64Array(n), pz = new Float64Array(n);
  for (let iter = 0; iter < iterations; iter++) {
    // precompute every vertex's 3D position ONCE per iteration (rA is the expensive call) — the centroid loop
    // then just reads neighbour positions instead of re-evaluating rA per (neighbour × incidence).
    for (let i = 0; i < n; i++) { const th = TAU * u[i], z = t[i] * H, r = rA(th, z); px[i] = r * Math.cos(th); py[i] = r * Math.sin(th); pz[i] = z; }
    const nu = Float64Array.from(u), nt = Float64Array.from(t);
    for (let i = 0; i < n; i++) {
      const s = off[i], e = off[i + 1];
      if (pinned[i] || e === s) continue;
      // 3D centroid of the 1-ring
      let cx = 0, cy = 0, cz = 0; const cnt = e - s;
      for (let p = s; p < e; p++) { const j = nbr[p]; cx += px[j]; cy += py[j]; cz += pz[j]; }
      cx /= cnt; cy /= cnt; cz /= cnt;
      // recover (θ,z) → (u,t); radius is re-snapped to the surface at lift time (vertex stays ON the surface)
      let uNew = (Math.atan2(cy, cx) / TAU + 1) % 1;
      let tNew = cz / H;
      // under-relax toward the target, then clamp strictly interior
      uNew = u[i] + relax * (uNew - u[i]);
      tNew = t[i] + relax * (tNew - t[i]);
      nu[i] = Math.min(Math.max(uNew, eps), 1 - eps);
      nt[i] = Math.min(Math.max(tNew, eps), 1 - eps);
    }
    u.set(nu); t.set(nt);
  }

  const out = new Array<number>(n * 2);
  for (let i = 0; i < n; i++) { out[2 * i] = u[i]; out[2 * i + 1] = t[i]; }
  return out;
}
