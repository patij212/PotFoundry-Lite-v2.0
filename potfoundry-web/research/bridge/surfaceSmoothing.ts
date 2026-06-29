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
  opts: { iterations?: number; relax?: number; boundaryEps?: number } = {},
): number[] {
  const iterations = opts.iterations ?? 5;
  const relax = opts.relax ?? 0.5;
  const eps = opts.boundaryEps ?? 1e-6;
  const n = ut.length / 2;
  const u = new Float64Array(n), t = new Float64Array(n);
  for (let i = 0; i < n; i++) { u[i] = ut[2 * i]; t[i] = ut[2 * i + 1]; }

  // 1-ring adjacency
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b);
  }
  // pin patch-boundary vertices (u or t at 0/1)
  const pinned = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (u[i] <= eps || u[i] >= 1 - eps || t[i] <= eps || t[i] >= 1 - eps) pinned[i] = 1;
  }

  for (let iter = 0; iter < iterations; iter++) {
    const nu = Float64Array.from(u), nt = Float64Array.from(t);
    for (let i = 0; i < n; i++) {
      if (pinned[i] || adj[i].size === 0) continue;
      // 3D centroid of the 1-ring
      let cx = 0, cy = 0, cz = 0, cnt = 0;
      for (const j of adj[i]) {
        const th = TAU * u[j], z = t[j] * H, r = rA(th, z);
        cx += r * Math.cos(th); cy += r * Math.sin(th); cz += z; cnt++;
      }
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
