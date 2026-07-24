// _strataVoronoiSolid.test.ts — STRATA-001 S7: CLOSED PRINTABLE Voronoi pot solid.
// Built in stages, all watertight-audited from the final 3D triangle soup (position-weld → every edge shared by
// exactly 2 ⇒ boundary edges 0 ⇒ closed 2-manifold):
//   Stage A (PF_SOLID_STAGE=ring): full outer wall RING, θ-periodic, seam welded. Boundary = top+bottom loops only.
//   Stage B (PF_SOLID_STAGE=solid): + inner wall + rim + base + floor ⇒ closed hollow pot, boundary edges 0.
//
// Seam handling: vertices are (θ, z); θ welded canonically in [0,2π); edge midpoints use the SHORTEST arc — so an edge
// straddling θ=0 bisects at θ=0, not the far side. The seam then welds with no special code.
//
// Gated PF_STRATA_SOLID=1. DEV/LAB only; never edits src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { voronoiCenterCellular, type VoronoiLatticeParams } from '../../src/geometry/targetSolid/voronoiBisectorGuides';
import { baseRadius } from '../../src/geometry/profile';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_SOLID === '1';
const LATTICE: VoronoiLatticeParams = { scale: 8, jitter: 0.8, pulse: 0, zStretch: 1, period: 8 };
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const SCALE = 8;
const TWO_PI = 2 * Math.PI;
const TOL = 0.01;

type P2 = readonly [number, number];
type P3 = [number, number, number];

function envF(name: string, d: number): number {
  const r = process.env[name];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}

// ---- cell clipping in cellular (cx,cy) space ----
function clipHalfPlane(poly: P2[], nx: number, ny: number, d: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + ny * a[1] - d;
    const db = nx * b[0] + ny * b[1] - d;
    if (da <= 0) out.push(a);
    if (da <= 0 !== db <= 0) {
      const s = da / (da - db);
      out.push([a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1])]);
    }
  }
  return out;
}
// Voronoi cell polygon clipped to the vertical strip cy∈[0,SCALE] (z∈[0,H]).
function cellPolygon(cx: number, cy: number): P2[] {
  const [sx, sy] = voronoiCenterCellular(LATTICE, cx, cy);
  const R = 2.5;
  let poly: P2[] = [[sx - R, sy - R], [sx + R, sy - R], [sx + R, sy + R], [sx - R, sy + R]];
  for (let ox = -3; ox <= 3; ox += 1) {
    for (let oy = -3; oy <= 3; oy += 1) {
      if (ox === 0 && oy === 0) continue;
      const [nx, ny] = voronoiCenterCellular(LATTICE, cx + ox, cy + oy);
      const dx = nx - sx;
      const dy = ny - sy;
      if (Math.hypot(dx, dy) > 2 * R) continue;
      const mx = (sx + nx) / 2;
      const my = (sy + ny) / 2;
      poly = clipHalfPlane(poly, dx, dy, dx * mx + dy * my);
      if (poly.length < 3) return [];
    }
  }
  poly = clipHalfPlane(poly, 0, -1, 0); // cy >= 0
  poly = clipHalfPlane(poly, 0, 1, SCALE); // cy <= SCALE
  return poly.length >= 3 ? poly : [];
}

describe('STRATA-001 S7: closed printable Voronoi solid', () => {
  it.runIf(RUN)('builds a seam-welded ring / closed solid and audits watertightness', () => {
    const morph = envF('PF_SOLID_MORPH', 0);
    const stage = process.env.PF_SOLID_STAGE ?? 'ring';
    const oracleN = Math.round(envF('PF_SOLID_ORACLE', 12));
    const acceptTol = envF('PF_SOLID_ACCEPT_TOL', 0.007);
    const triCap = Math.round(envF('PF_SOLID_TRICAP', 4_000_000));
    const wallT = envF('PF_SOLID_WALLT', 4); // inner wall thickness (mm)
    const floorZ = envF('PF_SOLID_FLOORZ', 10); // cavity floor height (mm)
    const innerDiv = Math.round(envF('PF_SOLID_INNERDIV', 256)); // inner-wall angular divisions
    const innerRings = Math.round(envF('PF_SOLID_INNERRINGS', 48));
    // GENERALIZATION: any style via buildRadiusFn. INIT='voronoi' uses the Voronoi cell decomposition (conforming,
    // efficient — Voronoi only); INIT='grid' uses a uniform θ×z grid + sag-driven LEPP (universal, any style). Params
    // default to the registry defaults (snake_case → camelCase, feedback_verify_registry_defaults) with a PF_SOLID_PARAMS
    // JSON override; PF_SOLID_MORPH still overrides vMorph for Voronoi.
    const STYLE = process.env.PF_SOLID_STYLE ?? 'Voronoi';
    const INIT = process.env.PF_SOLID_INIT ?? (STYLE === 'Voronoi' ? 'voronoi' : 'grid');
    let stepZs: number[] = []; // C0 z-steps detected in the grid init (double-valued tread bridging)
    let creaseCuts = 0; // grid cells cut by a generic crease (shape-agnostic conforming)
    const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
    const registryDefaults = (id: string): Record<string, number> => {
      const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
      const out: Record<string, number> = {};
      for (const group of [cfg?.params, cfg?.advancedParams]) {
        if (group === undefined) continue;
        for (const [k, v] of Object.entries(group)) {
          if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
        }
      }
      return out;
    };
    const styleParams: Record<string, number> = { ...registryDefaults(STYLE) };
    if (STYLE === 'Voronoi') styleParams.vMorph = morph; // keep the morph knob for Voronoi
    if (process.env.PF_SOLID_PARAMS !== undefined) {
      Object.assign(styleParams, JSON.parse(process.env.PF_SOLID_PARAMS) as Record<string, number>);
    }
    const rA = buildRadiusFn(STYLE as StyleId, styleParams, DIMS);
    const rInner = (z: number): number => baseRadius(z, H, DIMS.Rb, DIMS.Rt, DIMS.expn ?? 1) - wallT;

    // ---- outer-wall mesh store in (θ, z), welded on canonical θ ----
    const vth: number[] = [];
    const vz: number[] = [];
    const vx: number[] = [];
    const vy: number[] = [];
    const vzz: number[] = [];
    const canon = (t: number): number => {
      let x = t % TWO_PI;
      if (x < 0) x += TWO_PI;
      return x;
    };
    // SPATIAL-HASH weld: adjacent cells compute a shared clip/bisector vertex with ~0.05um divergence (real, not ulp —
    // the z=0/z=H clip crossing is order-dependent), and the seam (θ=0≡2π) coincides in 3D. Exact-key welding splits
    // both; a merge-radius weld fuses them. WELD_MM well below the mesh min edge (verified) and far above the
    // divergence. Handles the seam for free (coincident 3D points merge).
    // Shared vertices across cells/seam are BIT-EXACT (measured: max merge dist 0nm), so the weld only needs to catch
    // exact matches — a tiny radius. A large radius merges DISTINCT close vertices (dense web near junctions) into
    // degenerate/non-manifold edges. WELD must be << min edge.
    const WELD_MM = envF('PF_SOLID_WELD_UM', 0.05) / 1000;
    // Refinement floor: a Voronoi triple-junction is a cusp tip; sag there shrinks only linearly, so LEPP chases it to
    // nm edges (min edge → 0) unless floored. Below FLOOR the residual cusp sag is sub-nm (bounded slope × µm) — far
    // under tol — so flooring costs no real fidelity while keeping every edge >> the weld radius.
    const FLOOR_MM = envF('PF_SOLID_FLOOR_UM', 1.5) / 1000;
    let maxMergeDist = 0;
    const gcell = new Map<string, number[]>();
    const gi = (v: number): number => Math.floor(v / WELD_MM);
    const addV = (thetaRaw: number, z: number): number => {
      const theta = canon(thetaRaw);
      const r = rA(theta, z);
      const x = r * Math.cos(theta);
      const y = r * Math.sin(theta);
      const cx = gi(x);
      const cy = gi(y);
      const cz = gi(z);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            const list = gcell.get(`${cx + dx},${cy + dy},${cz + dz}`);
            if (list === undefined) continue;
            for (const j of list) {
              const d = Math.hypot(vx[j] - x, vy[j] - y, vzz[j] - z);
              if (d <= WELD_MM) {
                if (d > maxMergeDist) maxMergeDist = d;
                return j;
              }
            }
          }
        }
      }
      const idx = vth.length;
      vth.push(theta);
      vz.push(z);
      vx.push(x);
      vy.push(y);
      vzz.push(z);
      const key = `${cx},${cy},${cz}`;
      const bucket = gcell.get(key);
      if (bucket === undefined) gcell.set(key, [idx]);
      else bucket.push(idx);
      return idx;
    };
    // Shortest-arc midpoint of two vertices (handles the θ=0 seam).
    const midV = (a: number, b: number): number => {
      let dth = vth[b] - vth[a];
      if (dth > Math.PI) dth -= TWO_PI;
      else if (dth < -Math.PI) dth += TWO_PI;
      return addV(vth[a] + dth / 2, (vz[a] + vz[b]) / 2);
    };

    // δ-MERGE for near-degenerate cell CORNERS (spec failure-mode #4): jitter can make 4 sites nearly cocircular ⇒ two
    // Voronoi vertices < 1µm apart ⇒ a micro-edge in the cell polygon ⇒ a permanent sliver (never refined — its sag is
    // fine; never floored — its longest edge is big). Merge corners closer than CORNER_MM to one canonical point BEFORE
    // meshing. δ well below the min LEGIT bisector edge (~tens of µm), well above the cocircular artifact (<1µm).
    // Shared corners across cells are bit-exact ⇒ they merge to the same canonical point ⇒ no cross-cell crack.
    const CORNER_MM = envF('PF_SOLID_CORNER_UM', 6) / 1000;
    const cGrid = new Map<string, Array<{ th: number; z: number; x: number; y: number }>>();
    const cgi = (v: number): number => Math.floor(v / CORNER_MM);
    const mergeCorner = (thetaRaw: number, z: number): [number, number] => {
      const theta = canon(thetaRaw);
      const r = rA(theta, z);
      const x = r * Math.cos(theta);
      const y = r * Math.sin(theta);
      const ix = cgi(x);
      const iy = cgi(y);
      const iz = cgi(z);
      for (let dx = -1; dx <= 1; dx += 1)
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dz = -1; dz <= 1; dz += 1) {
            const l = cGrid.get(`${ix + dx},${iy + dy},${iz + dz}`);
            if (l === undefined) continue;
            for (const c of l) if (Math.hypot(c.x - x, c.y - y, c.z - z) <= CORNER_MM) return [c.th, c.z];
          }
      const key = `${ix},${iy},${iz}`;
      const b = cGrid.get(key);
      const entry = { th: theta, z, x, y };
      if (b === undefined) cGrid.set(key, [entry]);
      else b.push(entry);
      return [theta, z];
    };

    const ta: number[] = [];
    const tb: number[] = [];
    const tc: number[] = [];
    const alive: boolean[] = [];
    const BIG = 1 << 27;
    const edgeMap = new Map<number, number[]>();
    const eKey = (a: number, b: number): number => (a < b ? a * BIG + b : b * BIG + a);
    const eAdd = (a: number, b: number, t: number): void => {
      const k = eKey(a, b);
      const l = edgeMap.get(k);
      if (l === undefined) edgeMap.set(k, [t]);
      else l.push(t);
    };
    const eDel = (a: number, b: number, t: number): void => {
      const l = edgeMap.get(eKey(a, b));
      if (l === undefined) return;
      const i = l.indexOf(t);
      if (i >= 0) l.splice(i, 1);
    };
    const addT = (a: number, b: number, c: number): number => {
      if (a === b || b === c || c === a) return -1; // degenerate (corner δ-merge collapsed an edge)
      const t = ta.length;
      ta.push(a);
      tb.push(b);
      tc.push(c);
      alive.push(true);
      eAdd(a, b, t);
      eAdd(b, c, t);
      eAdd(c, a, t);
      return t;
    };
    const killT = (t: number): void => {
      alive[t] = false;
      eDel(ta[t], tb[t], t);
      eDel(tb[t], tc[t], t);
      eDel(tc[t], ta[t], t);
    };

    // ---- initial fan triangulation of every ring cell ----
    // Mesh one extra row above and below, clipped to cy∈[0,SCALE], so the z=0/z=H edges are FLAT (every column reaches
    // the clip line). Without the extra rows, high-jitter cells don't reach z=0 and the bottom loop is jagged (z 0–2mm).
    const cyLo = Math.round(envF('PF_SOLID_CYLO', -1));
    const cyHi = Math.round(envF('PF_SOLID_CYHI', SCALE + 1));
    let cells = 0;
    if (INIT === 'voronoi') {
      for (let cx = 0; cx < SCALE; cx += 1) {
        for (let cy = cyLo; cy <= cyHi; cy += 1) {
          const poly = cellPolygon(cx, cy);
          if (poly.length < 3) continue;
          cells += 1;
          let mcx = 0;
          let mcy = 0;
          for (const p of poly) {
            mcx += p[0];
            mcy += p[1];
          }
          mcx /= poly.length;
          mcy /= poly.length;
          const cV = addV(TWO_PI * (mcx / SCALE), (mcy / SCALE) * H);
          const ring = poly.map((p) => {
            const [th, z] = mergeCorner(TWO_PI * (p[0] / SCALE), (p[1] / SCALE) * H);
            return addV(th, z);
          });
          for (let e = 0; e < ring.length; e += 1) addT(cV, ring[e], ring[(e + 1) % ring.length]);
        }
      }
    } else {
      // UNIVERSAL uniform θ×z grid: periodic in θ (column gu ≡ 0), flat z=0/z=H edges by construction. sag-driven LEPP
      // then refines it to the surface for ANY style — no style-specific decomposition. Crease styles just cost more
      // triangles (linear vs quadratic convergence, per E-2026-07-24-STRATA001-S2-CONVERGENCE).
      const gu = Math.round(envF('PF_SOLID_GRIDU', 96));
      const gv = Math.round(envF('PF_SOLID_GRIDV', 48));
      // GENERIC FEATURE-ALIGNED θ-COLUMNS (shape-agnostic conforming for near-vertical ridge styles: Gothic /
      // GeoStar / Gyroid / BasketWeave). PROVEN NEED (E-…-S7 pure-LEPP): uniform columns chord a steep θ-ridge,
      // and sag-LEPP bisects the LONGEST (usually Z) edge — never ACROSS the ridge — so MAX sticks at ~relief
      // (Gothic 1512µm at the 1.5µm floor, 4M cap). Fix: distribute the SAME gu columns by equidistribution of a
      // ridge-density ρ(θ)=1+A·score so they CLUSTER on ridges, and SNAP one column exactly onto each ridge crest
      // → a mesh edge lies on the ridge. Detector-driven (θ 2nd-difference, same test as _strataCreaseDetect),
      // zero per-style code, watertight by construction (structured grid). Off unless PF_SOLID_FCOLS=1.
      const fcolsOn = process.env.PF_SOLID_FCOLS === '1';
      const thetaCols: number[] = [];
      if (fcolsOn) {
        const M = 2048;
        const zLevels = [0.15, 0.35, 0.55, 0.75, 0.9].map((f) => f * H);
        const hth = TWO_PI / M;
        const scoreAt = (th: number): number => {
          let best = 0;
          for (const z of zLevels) {
            const r0 = rA(canon(th), z);
            const big = Math.abs(rA(canon(th + hth), z) - 2 * r0 + rA(canon(th - hth), z));
            const sm = Math.abs(rA(canon(th + hth / 4), z) - 2 * r0 + rA(canon(th - hth / 4), z));
            if (big < 1e-9) continue;
            // ratio sm/big → ~1 for a crease/jump (scale-invariant), ~0.06 for smooth curvature. Keep the crease loci.
            if (sm / big > 0.2 && big > best) best = big;
          }
          return best;
        };
        const score = new Float64Array(M);
        let sMax = 0;
        for (let k = 0; k < M; k += 1) {
          score[k] = scoreAt((TWO_PI * k) / M);
          if (score[k] > sMax) sMax = score[k];
        }
        const A = envF('PF_SOLID_FCOLS_A', 60);
        const rho = new Float64Array(M);
        for (let k = 0; k < M; k += 1) rho[k] = 1 + (sMax > 0 ? (A * score[k]) / sMax : 0);
        const C = new Float64Array(M + 1);
        for (let k = 0; k < M; k += 1) C[k + 1] = C[k] + rho[k];
        const Ctot = C[M];
        const invCDF = (target: number): number => {
          let lo = 0;
          let hi = M;
          while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (C[mid] <= target) lo = mid;
            else hi = mid;
          }
          const frac = (target - C[lo]) / (rho[lo] || 1);
          return (TWO_PI * (lo + frac)) / M;
        };
        for (let i = 0; i < gu; i += 1) thetaCols.push(canon(invCDF((i / gu) * Ctot)));
        thetaCols[0] = 0;
        thetaCols.sort((a, b) => a - b);
        // SNAP the nearest column exactly onto each ridge crest (local maxima of score) so an edge lies ON the ridge.
        const crests: number[] = [];
        for (let k = 0; k < M; k += 1) {
          const kp = (k + 1) % M;
          const km = (k - 1 + M) % M;
          if (score[k] > 0.25 * sMax && score[k] >= score[kp] && score[k] > score[km]) crests.push((TWO_PI * k) / M);
        }
        const nomSpacing = TWO_PI / gu;
        for (const cr of crests) {
          let bi = 0;
          let bd = Infinity;
          for (let i = 1; i < gu; i += 1) {
            const d = Math.abs(thetaCols[i] - cr);
            if (d < bd) {
              bd = d;
              bi = i;
            }
          }
          if (bi > 0 && bd < nomSpacing) thetaCols[bi] = cr; // never move the seam column [0]=0
        }
        thetaCols.sort((a, b) => a - b);
        // Guarantee exactly gu DISTINCT monotone columns: snapping can land two columns on one θ (degenerate
        // zero-width cell → non-manifold). Drop collisions (< 5% nominal spacing), then refill the largest gaps.
        const epsCol = nomSpacing * 0.05;
        const cols = thetaCols.filter((v, i) => i === 0 || v - thetaCols[i - 1] > epsCol);
        while (cols.length < gu) {
          let gIdx = 0;
          let gMax = -1;
          for (let i = 0; i < cols.length; i += 1) {
            const nxt = i + 1 < cols.length ? cols[i + 1] : TWO_PI;
            if (nxt - cols[i] > gMax) {
              gMax = nxt - cols[i];
              gIdx = i;
            }
          }
          const nxt = gIdx + 1 < cols.length ? cols[gIdx + 1] : TWO_PI;
          cols.splice(gIdx + 1, 0, (cols[gIdx] + nxt) / 2);
        }
        thetaCols.length = 0;
        for (const v of cols) thetaCols.push(v);
        if (process.env.PF_SOLID_DEBUG === '1') {
          let minDth = Infinity;
          for (let i = 1; i < gu; i += 1) minDth = Math.min(minDth, thetaCols[i] - thetaCols[i - 1]);
          // eslint-disable-next-line no-console
          console.log(`  feature-cols: ${crests.length} ridge crests, ${gu} cols (A=${A}), min Δθ ${((minDth * 180) / Math.PI).toFixed(3)}°`);
        }
      } else {
        for (let i = 0; i < gu; i += 1) thetaCols.push((TWO_PI * i) / gu);
      }
      // DOUBLE-VALUED STEP DETECTION (layered/C0 styles: Bamboo/DS/ArtDeco). rA jumps in z at each layer boundary
      // (Bamboo asymVar keys on the integer segment). A single-valued flat mesh chords the jump ⇒ 2+mm error. Detect
      // steps with jump > tol, mesh the smooth BANDS between them (disconnected — no strip crosses a step), then stitch
      // structural TREAD annuli between adjacent band loops (below). This is the proven double-valued / ring-strip
      // approach (DS/Bamboo) applied to the universal mesher.
      const zSteps: number[] = [];
      {
        // TWO-SCALE discontinuity test: a true C0 jump's |Δr| is scale-invariant (d2 vs d1), a steep-SMOOTH feature
        // (Bamboo's node bulge) shrinks ∝ δ. Step ⇔ jump(d2) > 0.5·jump(d1) AND jump(d1) > tol. Localize to the
        // sample where jump(d2) peaks within each run.
        const nZ = 12000;
        const d1 = H / nZ;
        const d2 = d1 / 8;
        const probes = [0.21, 1.03, 2.44, 3.77, 5.29];
        let runStartZ = -1;
        let bestJ2 = 0;
        let bestZ = 0;
        const flush = (): void => {
          if (runStartZ >= 0) {
            zSteps.push(bestZ);
            runStartZ = -1;
            bestJ2 = 0;
          }
        };
        for (let j = 1; j < nZ; j += 1) {
          const z = H * (j / nZ);
          let j1 = 0;
          let j2 = 0;
          for (const th of probes) {
            j1 = Math.max(j1, Math.abs(rA(th, z + d1) - rA(th, z - d1)));
            j2 = Math.max(j2, Math.abs(rA(th, z + d2) - rA(th, z - d2)));
          }
          // Ratio j2/j1 → 1.0 for a true C0 JUMP (scale-invariant), → 0.5 for a CREASE (gradient kink, r
          // continuous), → 0.125 for smooth. Threshold must sit ABOVE the crease value or z-creases (e.g.
          // Gothic arch tops) get misread as steps → bogus tread annuli → T-junction seam cracks. 0.8 separates.
          if (j2 > 0.8 * j1 && j1 > TOL) {
            if (runStartZ < 0) runStartZ = z;
            if (j2 > bestJ2) {
              bestJ2 = j2;
              bestZ = z;
            }
          } else {
            flush();
          }
        }
        flush();
      }
      stepZs = zSteps;
      if (process.env.PF_SOLID_DEBUG === '1') {
        // eslint-disable-next-line no-console
        console.log(`  detected ${zSteps.length} z-steps: ${zSteps.map((z) => z.toFixed(2)).join(', ')}`);
      }
      // Band boundaries: 0, step1, ..., stepN, H. Inset ε around each step so no band reaches the jump; the tread
      // (2ε thin, structural) later bridges r_below→r_above. ε well under tol keeps the step's geometric error < tol.
      const stepEps = envF('PF_SOLID_STEP_EPS_UM', 4) / 1000;
      const bounds = [0, ...zSteps, H];
      for (let b = 0; b + 1 < bounds.length; b += 1) {
        const za = b === 0 ? 0 : bounds[b] + stepEps;
        const zb = b + 2 === bounds.length ? H : bounds[b + 1] - stepEps;
        const bandH = zb - za;
        if (bandH <= 0) continue;
        const bandRows = Math.max(1, Math.round((gv * bandH) / H));
        const vgrid: number[][] = [];
        for (let j = 0; j <= bandRows; j += 1) {
          const row: number[] = [];
          const z = za + (bandH * j) / bandRows;
          for (let i = 0; i < gu; i += 1) row.push(addV(thetaCols[i], z));
          vgrid.push(row);
        }
        // GENERIC CREASE CONFORMING (shape-agnostic): where a crease (gradient discontinuity) crosses a cell edge,
        // insert a vertex ON the crease and cut the cell along the crease chord so LEPP gets an edge on the crease
        // (quadratic convergence) instead of chording it (linear). Off unless PF_SOLID_CREASE=1.
        const creaseOn = process.env.PF_SOLID_CREASE === '1';
        // Crease crossing on a grid edge (θ,z)a→b: kink of rA along it, accepted only if scale-INVARIANT (crease/jump),
        // not a smooth curvature peak. Returns the crease vertex index, or -1.
        const edgeCrease = (tha: number, za: number, thb: number, zb: number): number => {
          if (!creaseOn) return -1;
          const n = 20;
          const rs: number[] = [];
          for (let k = 0; k <= n; k += 1) {
            const tk = k / n;
            rs.push(rA(tha + (thb - tha) * tk, za + (zb - za) * tk));
          }
          let bi = -1;
          let bv = 0;
          for (let k = 1; k < n; k += 1) {
            const d2 = Math.abs(rs[k + 1] - 2 * rs[k] + rs[k - 1]);
            if (d2 > bv) {
              bv = d2;
              bi = k;
            }
          }
          if (bi < 0 || bv < TOL) return -1;
          // Sub-bin kink localization: intersect the left & right linear fits of r(t) near the argmax bin so the
          // crease vertex sits ON the crease (not ~half a cell off — the reason the coarse-grid prototype was useless).
          let t = bi / n;
          if (bi >= 2 && bi <= n - 2) {
            const sL = (rs[bi - 1] - rs[bi - 2]) * n;
            const sR = (rs[bi + 2] - rs[bi + 1]) * n;
            const denom = sL - sR;
            if (Math.abs(denom) > 1e-9) {
              const tL = (bi - 1) / n;
              const tR = (bi + 1) / n;
              const ti = (rs[bi + 1] - rs[bi - 1] + sL * tL - sR * tR) / denom;
              if (ti > (bi - 1.5) / n && ti < (bi + 1.5) / n) t = ti;
            }
          }
          const mth = tha + (thb - tha) * t;
          const mz = za + (zb - za) * t;
          const dth = (thb - tha) / n;
          const dz = (zb - za) / n;
          const cc = rA(mth, mz);
          const big = Math.abs(rA(mth + dth, mz + dz) - 2 * cc + rA(mth - dth, mz - dz));
          const small = Math.abs(rA(mth + dth / 4, mz + dz / 4) - 2 * cc + rA(mth - dth / 4, mz - dz / 4));
          // smooth ⇒ small ≈ big/16; crease ⇒ ≈ big/4; jump ⇒ ≈ big. Accept > 0.15·big AND big > tol.
          if (big > TOL && small > 0.15 * big) return addV(mth, mz);
          return -1;
        };
        const uOf = (i: number): number => thetaCols[i % gu];
        const zOfRow = (j: number): number => za + (bandH * j) / bandRows;
        const hCache = new Map<string, number>();
        const hEdge = (i: number, j: number): number => {
          const i1 = (i + 1) % gu;
          // Unordered-pair key: min_max so the WRAP edge (gu-1↔0) does NOT collide with edge 0 (0↔1),
          // which both hashed to min=0 before → wrap cell got a θ≈0 crease vertex → giant domain-spanning
          // triangle → refineLongest thrash. Adjacent cells still share the key (watertight crease vertex).
          const key = `h${Math.min(i, i1)}_${Math.max(i, i1)},${j}`;
          const hit = hCache.get(key);
          if (hit !== undefined) return hit;
          const c = edgeCrease(uOf(i), zOfRow(j), uOf(i1), zOfRow(j));
          hCache.set(key, c);
          return c;
        };
        const vEdge = (i: number, j: number): number => {
          const key = `v${i},${j}`;
          const hit = hCache.get(key);
          if (hit !== undefined) return hit;
          const c = edgeCrease(uOf(i), zOfRow(j), uOf(i), zOfRow(j + 1));
          hCache.set(key, c);
          return c;
        };
        // Fan-triangulate a convex boundary loop of vertex indices.
        const fan = (loop: number[]): void => {
          for (let k = 1; k + 1 < loop.length; k += 1) addT(loop[0], loop[k], loop[k + 1]);
        };
        for (let j = 0; j < bandRows; j += 1) {
          for (let i = 0; i < gu; i += 1) {
            const i1 = (i + 1) % gu;
            const A = vgrid[j][i];
            const B = vgrid[j][i1];
            const C = vgrid[j + 1][i1];
            const D = vgrid[j + 1][i];
            if (!creaseOn) {
              addT(A, B, C);
              addT(A, C, D);
              continue;
            }
            // boundary order A →(top)→ B →(right)→ C →(bottom←)→ D →(left←)→ A, inserting crease points.
            const top = hEdge(i, j);
            const right = vEdge(i1, j);
            const bot = hEdge(i, j + 1);
            const left = vEdge(i, j);
            const bnd: number[] = [A];
            const creaseIdx: number[] = [];
            const push = (x: number): void => {
              if (x >= 0) {
                creaseIdx.push(bnd.length);
                bnd.push(x);
              }
            };
            push(top);
            bnd.push(B);
            push(right);
            bnd.push(C);
            push(bot);
            bnd.push(D);
            push(left);
            if (creaseIdx.length === 2) {
              creaseCuts += 1;
              const [p, q] = creaseIdx;
              fan(bnd.slice(p, q + 1)); // arc p..q + closing edge q→p
              fan([...bnd.slice(q), ...bnd.slice(0, p + 1)]); // arc q..p (wrapping)
            } else {
              // 0, 1, or >2 crease hits on this cell — fall back to the plain split (LEPP still refines it).
              addT(A, B, C);
              addT(A, C, D);
            }
          }
        }
      }
      cells = gu * gv;
      if (process.env.PF_SOLID_DEBUG === '1' && process.env.PF_SOLID_CREASE === '1') {
        // eslint-disable-next-line no-console
        console.log(`  crease-conforming: ${creaseCuts} cells cut on the ${gu}×${gv} grid`);
      }
    }

    // ---- geometry + LEPP ----
    const eLen = (a: number, b: number): number => Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vzz[a] - vzz[b]);
    const longest = (t: number): number => {
      const l0 = eLen(ta[t], tb[t]);
      const l1 = eLen(tb[t], tc[t]);
      const l2 = eLen(tc[t], ta[t]);
      if (l0 >= l1 && l0 >= l2) return 0;
      if (l1 >= l0 && l1 >= l2) return 1;
      return 2;
    };
    const eVerts = (t: number, e: number): [number, number] => (e === 0 ? [ta[t], tb[t]] : e === 1 ? [tb[t], tc[t]] : [tc[t], ta[t]]);
    const sagOf = (t: number): number => {
      const a = ta[t];
      const b = tb[t];
      const c = tc[t];
      let nx = (vy[b] - vy[a]) * (vzz[c] - vzz[a]) - (vzz[b] - vzz[a]) * (vy[c] - vy[a]);
      let ny = (vzz[b] - vzz[a]) * (vx[c] - vx[a]) - (vx[b] - vx[a]) * (vzz[c] - vzz[a]);
      let nz = (vx[b] - vx[a]) * (vy[c] - vy[a]) - (vy[b] - vy[a]) * (vx[c] - vx[a]);
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-18) return 0;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      // sample in (θ,z) using shortest-arc from vertex a
      const th0 = vth[a];
      const dthB = ((vth[b] - th0 + Math.PI + TWO_PI) % TWO_PI) - Math.PI;
      const dthC = ((vth[c] - th0 + Math.PI + TWO_PI) % TWO_PI) - Math.PI;
      let s = 0;
      for (let i = 0; i <= oracleN; i += 1) {
        for (let j = 0; j <= oracleN - i; j += 1) {
          const wa = i / oracleN;
          const wb = j / oracleN;
          const wc = 1 - wa - wb;
          const theta = th0 + wb * dthB + wc * dthC;
          const z = wa * vz[a] + wb * vz[b] + wc * vz[c];
          const r = rA(canon(theta), z);
          const qx = r * Math.cos(theta);
          const qy = r * Math.sin(theta);
          const d = Math.abs((qx - vx[a]) * nx + (qy - vy[a]) * ny + (z - vzz[a]) * nz);
          if (d > s) s = d;
        }
      }
      return s;
    };
    const neighbor = (t: number, a: number, b: number): number => {
      const l = edgeMap.get(eKey(a, b));
      if (l === undefined) return -1;
      for (const o of l) if (o !== t && alive[o]) return o;
      return -1;
    };
    const created: number[] = [];
    const bisect = (a: number, b: number): void => {
      const m = midV(a, b);
      const list = (edgeMap.get(eKey(a, b)) ?? []).slice();
      for (const t of list) {
        if (!alive[t]) continue;
        const apex = ta[t] !== a && ta[t] !== b ? ta[t] : tb[t] !== a && tb[t] !== b ? tb[t] : tc[t];
        const seq = [ta[t], tb[t], tc[t]];
        let oa = a;
        let ob = b;
        for (let i = 0; i < 3; i += 1) {
          if (seq[i] === a && seq[(i + 1) % 3] === b) {
            oa = a;
            ob = b;
            break;
          }
          if (seq[i] === b && seq[(i + 1) % 3] === a) {
            oa = b;
            ob = a;
            break;
          }
        }
        killT(t);
        created.push(addT(oa, m, apex));
        created.push(addT(m, ob, apex));
      }
    };
    const refineLongest = (t0: number): void => {
      // CRITICAL: bail on triCap INSIDE the refine, not just in the outer stack loop. A single pathological
      // triangle (e.g. a domain-spanning one from a mis-placed crease vertex) can otherwise add millions of
      // triangles in ONE call — the 86s hang / OOM. Guards are a fail-fast backstop for a genuine cycle.
      let guard = 200_000;
      while (alive[t0] && guard-- > 0) {
        if (ta.length >= triCap) return;
        let t = t0;
        let inner = 200_000;
        for (;;) {
          if (inner-- <= 0 || ta.length >= triCap) return;
          const e = longest(t);
          const [a, b] = eVerts(t, e);
          const nb = neighbor(t, a, b);
          if (nb === -1) {
            bisect(a, b);
            break;
          }
          const enb = longest(nb);
          const [na, nbv] = eVerts(nb, enb);
          if ((na === a && nbv === b) || (na === b && nbv === a)) {
            bisect(a, b);
            break;
          }
          t = nb;
        }
        if (!alive[t0]) break;
        const e0 = longest(t0);
        const [a0, b0] = eVerts(t0, e0);
        const nb0 = neighbor(t0, a0, b0);
        if (nb0 === -1) {
          bisect(a0, b0);
          break;
        }
        const enb0 = longest(nb0);
        const [na0, nv0] = eVerts(nb0, enb0);
        if ((na0 === a0 && nv0 === b0) || (na0 === b0 && nv0 === a0)) {
          bisect(a0, b0);
          break;
        }
      }
    };
    const stack: number[] = [];
    for (let t = 0; t < ta.length; t += 1) stack.push(t);
    let capped = false;
    while (stack.length > 0) {
      const t = stack.pop() as number;
      if (!alive[t]) continue;
      // Accept if under tol OR the longest edge is already at the floor (cusp-tip guard — see FLOOR_MM).
      const le = Math.max(eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t]));
      if (sagOf(t) <= acceptTol || le < FLOOR_MM) continue;
      if (ta.length >= triCap) {
        capped = true;
        break;
      }
      created.length = 0;
      refineLongest(t);
      for (const nt of created) if (alive[nt]) stack.push(nt);
      if (alive[t]) stack.push(t);
    }

    // ---- NEEDLE-SLIVER COLLAPSE (generic, style-agnostic mesh-quality pass) ----
    // LEPP conforming bisection occasionally lands a vertex < 1µm from an existing one, making a needle: two triangles
    // sharing a sub-µm edge with much longer flanks (measured 0.76µm edge / 90µm flanks, aspect ~100). These never
    // refine (sag fine) nor floor (longest edge big). Collapse each such short edge (union its endpoints to the root's
    // position) — a < 1µm move, << the 10µm tol — and drop the two degenerate triangles. NOT a junction-cusp problem
    // (corner δ-merge and the floor both had zero effect); this is triangle quality, so a quality pass is the fix.
    const COLLAPSE_MM = envF('PF_SOLID_COLLAPSE_UM', 1) / 1000;
    const uf = new Int32Array(vth.length);
    for (let i = 0; i < uf.length; i += 1) uf[i] = i;
    const find = (x0: number): number => {
      let x = x0;
      while (uf[x] !== x) {
        uf[x] = uf[uf[x]];
        x = uf[x];
      }
      return x;
    };
    const union = (a: number, b: number): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) uf[Math.max(ra, rb)] = Math.min(ra, rb);
    };
    for (let t = 0; t < ta.length; t += 1) {
      if (!alive[t]) continue;
      const a = ta[t];
      const b = tb[t];
      const c = tc[t];
      const eab = eLen(a, b);
      const ebc = eLen(b, c);
      const eca = eLen(c, a);
      // Any edge below COLLAPSE_MM (<< tol) is collapsible regardless of aspect — the vertex move is negligible.
      const mn = Math.min(eab, ebc, eca);
      if (mn < COLLAPSE_MM) {
        if (eab === mn) union(a, b);
        else if (ebc === mn) union(b, c);
        else union(c, a);
      }
    }
    let collapsedTris = 0;
    for (let t = 0; t < ta.length; t += 1) {
      if (!alive[t]) continue;
      const a = find(ta[t]);
      const b = find(tb[t]);
      const c = find(tc[t]);
      if (a === b || b === c || c === a) {
        alive[t] = false;
        collapsedTris += 1;
        continue;
      }
      ta[t] = a;
      tb[t] = b;
      tc[t] = c;
    }

    // ---- collect outer-wall triangles as 3D soup ----
    const soup: Array<[P3, P3, P3]> = [];
    const P = (i: number): P3 => [vx[i], vy[i], vzz[i]];
    let outerCount = 0;
    for (let t = 0; t < ta.length; t += 1) {
      if (!alive[t]) continue;
      soup.push([P(ta[t]), P(tb[t]), P(tc[t])]);
      outerCount += 1;
    }

    // ---- position-welded topology (ONE source of truth; a slicer position-welds too) ----
    // Spatial-hash weld the soup, build edge adjacency, extract boundary loops. Everything downstream (cracks, loops
    // for caps, final closed-audit) reads THIS, not the mesh-index topology (which splits shared clip/seam vertices).
    const wCell = new Map<string, number[]>();
    const wpos: P3[] = [];
    const wgi = (v: number): number => Math.floor(v / WELD_MM);
    const wIndex = (p: P3): number => {
      const cx = wgi(p[0]);
      const cy = wgi(p[1]);
      const cz = wgi(p[2]);
      for (let dx = -1; dx <= 1; dx += 1)
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dz = -1; dz <= 1; dz += 1) {
            const l = wCell.get(`${cx + dx},${cy + dy},${cz + dz}`);
            if (l === undefined) continue;
            for (const j of l) if (Math.hypot(wpos[j][0] - p[0], wpos[j][1] - p[1], wpos[j][2] - p[2]) <= WELD_MM) return j;
          }
      const idx = wpos.length;
      wpos.push(p);
      const key = `${cx},${cy},${cz}`;
      const b = wCell.get(key);
      if (b === undefined) wCell.set(key, [idx]);
      else b.push(idx);
      return idx;
    };
    interface Topo {
      nonManifold: number;
      boundary: number;
      loops: number[][];
      interiorCracks: number;
    }
    const analyze = (tris: Array<[P3, P3, P3]>): Topo => {
      const ec = new Map<number, number>();
      const WB = 1 << 24;
      const bump = (a: number, b: number): void => {
        const k = a < b ? a * WB + b : b * WB + a;
        ec.set(k, (ec.get(k) ?? 0) + 1);
      };
      for (const [a, b, c] of tris) {
        const ia = wIndex(a);
        const ib = wIndex(b);
        const ic = wIndex(c);
        bump(ia, ib);
        bump(ib, ic);
        bump(ic, ia);
      }
      let nonManifold = 0;
      let boundary = 0;
      const bAdj = new Map<number, number[]>();
      for (const [k, cnt] of ec.entries()) {
        if (cnt === 2) continue;
        if (cnt > 2) {
          nonManifold += 1;
          continue;
        }
        boundary += 1;
        const a = Math.floor(k / WB);
        const b = k % WB;
        (bAdj.get(a) ?? (bAdj.set(a, []), bAdj.get(a) as number[])).push(b);
        (bAdj.get(b) ?? (bAdj.set(b, []), bAdj.get(b) as number[])).push(a);
      }
      const seen = new Set<number>();
      const loops: number[][] = [];
      for (const s of bAdj.keys()) {
        if (seen.has(s)) continue;
        const loop: number[] = [];
        let cur = s;
        let prev = -1;
        let guard = bAdj.size + 5;
        while (guard-- > 0) {
          loop.push(cur);
          seen.add(cur);
          let next = -1;
          for (const n of bAdj.get(cur) ?? []) if (n !== prev && (!seen.has(n) || n === s)) { next = n; break; }
          if (next === -1 || next === s) break;
          prev = cur;
          cur = next;
        }
        if (loop.length > 2) loops.push(loop);
      }
      let interiorCracks = 0;
      for (const loop of loops) {
        const mz = loop.reduce((sm, i) => sm + wpos[i][2], 0) / loop.length;
        if (mz > 1e-3 && mz < H - 1e-3) interiorCracks += loop.length;
      }
      return { nonManifold, boundary, loops, interiorCracks };
    };
    const loopZ = (loop: number[]): number => loop.reduce((s, i) => s + wpos[i][2], 0) / loop.length;
    const ang = (p: P3): number => {
      const a = Math.atan2(p[1], p[0]);
      return a < 0 ? a + TWO_PI : a;
    };
    // Angle-merge stitch between two full rings (different vertex counts OK) → an annular strip pushed to the soup.
    // Used for the rim (outer-top ↔ inner ring) and the double-valued TREADS (band-below ↔ band-above at a step).
    const stitchRings = (loopA: P3[], loopB: P3[]): number => {
      const a = loopA.slice().sort((p, q) => ang(p) - ang(q)).map((p) => ({ th: ang(p), p }));
      const b = loopB.slice().sort((p, q) => ang(p) - ang(q)).map((p) => ({ th: ang(p), p }));
      const na = a.length;
      const nb = b.length;
      if (na === 0 || nb === 0) return 0;
      let ia = 0;
      let ib = 0;
      let n = 0;
      while (ia < na || ib < nb) {
        const ath = a[ia % na].th + (ia >= na ? TWO_PI : 0);
        const bth = b[ib % nb].th + (ib >= nb ? TWO_PI : 0);
        if (ia < na && (ib >= nb || ath <= bth)) {
          soup.push([a[ia % na].p, a[(ia + 1) % na].p, b[ib % nb].p]);
          ia += 1;
        } else {
          soup.push([a[ia % na].p, b[(ib + 1) % nb].p, b[ib % nb].p]);
          ib += 1;
        }
        n += 1;
      }
      return n;
    };

    let outerTopo = analyze(soup);
    // ---- DOUBLE-VALUED TREADS: bridge each C0 step (band-below ring ↔ band-above ring) with a structural annulus ----
    // Bands are meshed disconnected (gap at each step); sorted by z the outer-wall loops are
    // [domain-bottom, s1-below, s1-above, s2-below, s2-above, …, domain-top]. Stitch each (below,above) pair.
    let treadTris = 0;
    if (stepZs.length > 0) {
      const sorted = outerTopo.loops
        .slice()
        .sort((p, q) => loopZ(p) - loopZ(q))
        .map((loop) => loop.map((i) => wpos[i]));
      for (let s = 0; s < stepZs.length; s += 1) {
        const below = sorted[1 + 2 * s];
        const above = sorted[2 + 2 * s];
        if (below !== undefined && above !== undefined) treadTris += stitchRings(below, above);
      }
      outerTopo = analyze(soup); // re-audit: internal loops now closed ⇒ only domain top/bottom remain
    }
    const sortedLoops = outerTopo.loops.slice().sort((p, q) => loopZ(p) - loopZ(q));
    const botLoop = (sortedLoops[0] ?? []).map((i) => wpos[i]);
    const topLoop = (sortedLoops[sortedLoops.length - 1] ?? []).map((i) => wpos[i]);
    const seamCrackEdges = outerTopo.interiorCracks;

    // ---- Stage B caps: base disk, floor disk, inner wall, rim ----
    let capTris = 0;
    if (stage === 'solid') {
      const byAngle = (loop: P3[]): P3[] => loop.slice().sort((i, j) => ang(i) - ang(j));
      const bot = byAngle(botLoop);
      const top = byAngle(topLoop);
      // base disk (z=0): fan bottom loop to center.
      const cBot: P3 = [0, 0, 0];
      for (let i = 0; i < bot.length; i += 1) {
        soup.push([cBot, bot[(i + 1) % bot.length], bot[i]]);
        capTris += 1;
      }
      // inner rings (uniform innerDiv), θ from 0..2π.
      const innerLoopAtZ = (z: number): P3[] => {
        const r = rInner(z);
        const pts: P3[] = [];
        for (let d = 0; d < innerDiv; d += 1) {
          const th = (TWO_PI * d) / innerDiv;
          pts.push([r * Math.cos(th), r * Math.sin(th), z]);
        }
        return pts;
      };
      // rim (z=H planar annulus): stitch outer top loop (variable) to the uniform inner ring by angle merge.
      capTris += stitchRings(top, innerLoopAtZ(H));
      // inner wall: uniform grid innerDiv × innerRings, z from H down to floorZ.
      const zrings: number[] = [];
      for (let k = 0; k <= innerRings; k += 1) zrings.push(H - ((H - floorZ) * k) / innerRings);
      for (let k = 0; k < innerRings; k += 1) {
        const z0 = zrings[k];
        const z1 = zrings[k + 1];
        const r0 = rInner(z0);
        const r1 = rInner(z1);
        for (let d = 0; d < innerDiv; d += 1) {
          const th0 = (TWO_PI * d) / innerDiv;
          const th1 = (TWO_PI * ((d + 1) % innerDiv)) / innerDiv;
          const A: P3 = [r0 * Math.cos(th0), r0 * Math.sin(th0), z0];
          const B: P3 = [r0 * Math.cos(th1), r0 * Math.sin(th1), z0];
          const C: P3 = [r1 * Math.cos(th1), r1 * Math.sin(th1), z1];
          const D: P3 = [r1 * Math.cos(th0), r1 * Math.sin(th0), z1];
          // inward-facing (cavity): wind so normals point toward the axis
          soup.push([A, C, B]);
          soup.push([A, D, C]);
          capTris += 2;
        }
      }
      // floor disk (z=floorZ): fan inner bottom ring to center (cavity floor).
      const cFloor: P3 = [0, 0, floorZ];
      const floorRing = innerLoopAtZ(floorZ);
      for (let d = 0; d < innerDiv; d += 1) {
        const a = floorRing[d];
        const b = floorRing[(d + 1) % innerDiv];
        soup.push([cFloor, a, b]); // cavity floor fan (a,b are P3)
        capTris += 1;
      }
    }

    // ---- final watertight audit (same position-weld topology as the loops) ----
    const finalTopo = stage === 'solid' ? analyze(soup) : outerTopo;
    const nonManifold = finalTopo.nonManifold;
    const boundary = finalTopo.boundary;

    // ---- outer-wall fidelity ----
    let maxSag = 0;
    let minEdge = Infinity;
    let subMicronEdges = 0;
    const sags: number[] = [];
    for (let t = 0; t < ta.length; t += 1) {
      if (!alive[t]) continue;
      const s = sagOf(t);
      sags.push(s);
      if (s > maxSag) maxSag = s;
      const e0 = eLen(ta[t], tb[t]);
      const e1 = eLen(tb[t], tc[t]);
      const e2 = eLen(tc[t], ta[t]);
      minEdge = Math.min(minEdge, e0, e1, e2);
      if (e0 < 1e-3) subMicronEdges += 1;
      if (e1 < 1e-3) subMicronEdges += 1;
      if (e2 < 1e-3) subMicronEdges += 1;
      if (process.env.PF_SOLID_DEBUG === '1' && Math.min(e0, e1, e2) < 1e-3) {
        const es = [e0, e1, e2].map((e) => (e * 1000).toFixed(2)).join('/');
        const mz = (vzz[ta[t]] + vzz[tb[t]] + vzz[tc[t]]) / 3;
        // eslint-disable-next-line no-console
        if (subMicronEdges < 30) console.log(`  sliver tri edges(um) ${es}  z=${mz.toFixed(1)}`);
      }
    }
    sags.sort((a, b) => a - b);
    const over = sags.filter((s) => s > TOL).length;
    const um = (mm: number): string => (mm * 1000).toFixed(3);
    const q = (p: number): number => sags[Math.min(sags.length - 1, Math.floor(p * sags.length))];

    // ---- emit STL ----
    const outDir = join('research', 'exchange', '_strataVoronoiSolid');
    mkdirSync(outDir, { recursive: true });
    const styleTag = STYLE === 'Voronoi' ? `voronoi_${morph === 0 ? 'bubble' : 'web'}` : STYLE.toLowerCase();
    const stlName = `${styleTag}_${stage}.stl`;
    const buf = Buffer.alloc(84 + soup.length * 50);
    buf.write(`STRATA-001 Voronoi ${stage} (watertight)`, 0, 'ascii');
    buf.writeUInt32LE(soup.length, 80);
    let o = 84;
    for (const [a, b, c] of soup) {
      let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const nl = Math.hypot(nx, ny, nz) || 1;
      buf.writeFloatLE(nx / nl, o);
      buf.writeFloatLE(ny / nl, o + 4);
      buf.writeFloatLE(nz / nl, o + 8);
      for (const [k, p] of [a, b, c].entries()) {
        buf.writeFloatLE(p[0], o + 12 + k * 12);
        buf.writeFloatLE(p[1], o + 16 + k * 12);
        buf.writeFloatLE(p[2], o + 20 + k * 12);
      }
      buf.writeUInt16LE(0, o + 48);
      o += 50;
    }
    writeFileSync(join(outDir, stlName), buf);

    const report = [
      '',
      `========== STRATA-001 S7 UNIVERSAL: ${STYLE} ${stage.toUpperCase()} (init=${INIT}) ==========`,
      `file: ${stlName}  (${soup.length} triangles: ${outerCount} outer wall + ${treadTris} treads + ${capTris} caps)${stepZs.length > 0 ? `  [${stepZs.length} C0 steps]` : ''}`,
      `${STYLE}${STYLE === 'Voronoi' ? ` ${morph === 0 ? 'BUBBLE' : 'WEB'}` : ''}, H120/Rb40/Rt50 — registry defaults · params ${JSON.stringify(styleParams)}`,
      `ring: ${cells} cells (cx 0..7 × cy ${cyLo}..${cyHi})${capped ? ' CAPPED' : ''}`,
      '',
      '--- WATERTIGHT AUDIT (3D position-weld) ---',
      `  non-manifold edges (>2)  : ${nonManifold}   ${nonManifold === 0 ? '✅' : '❌'}`,
      `  boundary edges           : ${boundary}   ${stage === 'solid' ? (boundary === 0 ? '✅ CLOSED SOLID' : '❌ open') : `(ring: top+bottom loops)`}`,
      `  seam-crack edges (ring)  : ${seamCrackEdges}   ${seamCrackEdges === 0 ? '✅ seam welded' : '❌ interior boundary'}`,
      `  boundary loops: ${finalTopo.loops.length}  (outer bottom n=${botLoop.length}, top n=${topLoop.length})`,
      '',
      '--- OUTER-WALL FIDELITY (oracle ' + oracleN + ') ---',
      `  MAX sag ${um(maxSag)} um  ${maxSag <= TOL ? '✅' : '❌'}   p99 ${um(q(0.99))}  p50 ${um(q(0.5))}  over-0.01mm ${over}/${sags.length}`,
      `  min edge ${um(minEdge)} um  sliver-collapsed tris ${collapsedTris}  sub-µm edges ${subMicronEdges}  ${subMicronEdges === 0 ? '✅' : '⚠️'}`,
      '=========================================================',
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
    writeFileSync(join(outDir, `${stlName}.report.txt`), report);

    expect(seamCrackEdges).toBe(0);
    expect(nonManifold).toBe(0);
    if (stage === 'solid') expect(boundary).toBe(0);
    expect(maxSag).toBeLessThanOrEqual(TOL);
  }, 6_000_000);
});
