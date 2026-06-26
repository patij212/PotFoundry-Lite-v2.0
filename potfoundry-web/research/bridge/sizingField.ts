// potfoundry-web/research/bridge/sizingField.ts
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;

export interface IsotropicSizingField { resU: number; resT: number; h: Float64Array; }

/**
 * Isotropic chord-control sizing field over (u,t). At each grid node we estimate
 * the surface's worst principal curvature κ by central differences of the radial
 * surface S(θ,z)=(r·cosθ, r·sinθ, z) (θ=u·TAU, z=t·H), then the chord-error edge
 * length in MM is h_mm ≈ sqrt(8·tol/κ). We convert to (u,t) units via the local
 * parametric speeds |S_u|,|S_t| (use the smaller speed → the conservative bound).
 */
export function buildIsotropicSizingField(
  rA: AnalyticRadiusFn, H: number,
  opts: { resU: number; resT: number; tolMm: number; hMin: number; hMax: number },
): IsotropicSizingField {
  const { resU, resT, tolMm, hMin, hMax } = opts;
  const S = (u: number, t: number): [number, number, number] => {
    const th = TAU * u, z = t * H, r = rA(th, z);
    return [r * Math.cos(th), r * Math.sin(th), z];
  };
  const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
  const h = new Float64Array(resU * resT);
  const du = 1 / Math.max(resU - 1, 1), dt = 1 / Math.max(resT - 1, 1);
  for (let it = 0; it < resT; it++) {
    for (let iu = 0; iu < resU; iu++) {
      const u = iu * du, t = it * dt;
      const uu = Math.min(Math.max(u, du), 1 - du), tt = Math.min(Math.max(t, dt), 1 - dt);
      const c = S(uu, tt);
      const su = sub(S(uu + du, tt), S(uu - du, tt)).map((v) => v / (2 * du));
      const st = sub(S(uu, tt + dt), S(uu, tt - dt)).map((v) => v / (2 * dt));
      // second differences → curvature magnitude proxy in each param direction
      const suu = [S(uu + du, tt), c, S(uu - du, tt)];
      const stt = [S(uu, tt + dt), c, S(uu, tt - dt)];
      const d2u = norm(sub(sub(suu[0], c), sub(c, suu[2]))) / (du * du);
      const d2t = norm(sub(sub(stt[0], c), sub(c, stt[2]))) / (dt * dt);
      const speedU = Math.max(norm(su), 1e-9), speedT = Math.max(norm(st), 1e-9);
      const kU = d2u / (speedU * speedU), kT = d2t / (speedT * speedT); // κ ≈ |S''|/|S'|²
      const kMax = Math.max(kU, kT, 1e-9);
      const hMm = Math.sqrt((8 * tolMm) / kMax);
      const speedMin = Math.min(speedU, speedT);
      const hUt = hMm / speedMin; // mm → (u,t) units (conservative: smaller speed)
      h[it * resU + iu] = Math.min(Math.max(hUt, hMin), hMax);
    }
  }
  return { resU, resT, h };
}
