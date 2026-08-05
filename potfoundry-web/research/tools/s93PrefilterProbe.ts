// s93PrefilterProbe.ts — IS THE PRE-REGISTERED PER-POINT ORIENTATION PREFILTER SOUND, AND WHAT WOULD IT PRUNE?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT S90 PROPOSED, AND WHY IT IS WORTH ATTACKING. `tighten` is 95.68% / 97.85% of ALL rA evals — an
// independent reproduction of S50's 95.22% on two meshes. The lattice level is 2-4% of the money. S90's
// pre-registered successor points the orientation inequality at the object that costs it:
//
//     for any point p of the facet, with v its NEAREST VERTEX:   dist(p, S) <= tan(theta) * |p - v|
//
// used as an extra `min()` in `certifyTriangle`'s pass-2 threshold test, pruning points that provably
// cannot reach `thresh` before `tighten` is ever called. Cost: ZERO rA evals once theta is known
// ("15 evals for the whole facet at k=1"). Predicted 40-60% cut of the tightening budget.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// *** THE REASON THIS PROBE EXISTS RATHER THAN A PATCH: THE BOUND IS NOT OBVIOUSLY SOUND. ***
//
// `orientRuler.ts:31` states the family's own sound facet-level construct as
//     `bound = normRad + kappa * cov`  — an UPPER bound on theta*, WHEN a valid `kappa` is supplied
// i.e. the sound version carries a CURVATURE term. The proposed per-point bound has none, and the
// theta -> 0 case is a clean counterexample in principle: a facet lying exactly in the tangent plane at
// v has tan(theta)*|p-v| = 0, while a tangent plane to a curved surface sags by ~kappa*L^2/2 > 0.
//
// It is rescued ONLY if `theta` is a genuine SUP over the footprint, because then theta itself carries
// the curvature. 1-D circular arc, chord D: tan(theta*)*(D/2) = kappa*D^2/4 against a true sag of
// kappa*D^2/8 — sound, with 2x slack. But S90 specifies theta from a k=1 lattice (3 points, 15 evals),
// and a finite lattice max is a LOWER bound on the sup (`normRad`'s own docstring says so). With a
// lower bound in place of the sup, the rescue does not apply.
//
// So soundness is a HYPOTHESIS, not a premise — and it can be tested WITHOUT touching `certifyTriangle`.
// This probe tests the proposal EXACTLY AS PRE-REGISTERED (theta = k=1 lattice normRad) and, for
// contrast, with the higher-k sup, so the answer distinguishes "the idea is wrong" from "the cheap
// theta is wrong".
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// METHOD. Facets sampled by golden stride. For each, the lattice `certifyTriangle` would actually use
// (n = min(nMax, max(2, ceil(cov/tol))), rho = cov/n, thresh = tol - rho). For every lattice point whose
// cheap radial reading exceeds `thresh` — i.e. exactly the points that enter pass 2 and pay for
// `tighten` — record:
//     ub      = tan(theta) * |p - nearest vertex|        the proposed bound
//     dTrue   = distGlobal(p)                            the reference
//     PRUNE   = ub <= thresh                             the point would be skipped
//     VIOLATION = ub < dTrue - band                      the bound is BELOW a real distance
//
// REFERENCE CAVEAT, STATED UP FRONT: `distGlobal` is itself an UPPER bound (global scan + local
// descent), so `ub < dTrue` does not PROVE `ub < dist(p,S)`. It is the campaign's standard ground truth
// and is treated as such here; a violation is therefore strong evidence, not a proof, and the converse
// (no violations) is evidence of soundness on the sampled population only, never a theorem.
//
// Usage: bash research/tools/run-s93-prefilter-probe.sh
//   env: PF_S93_STYLE PF_S93_STEM PF_S93_FACETS(200) PF_S93_MAXPTS(40) PF_S93_TOL_MM(0.010)
//        PF_S93_NMAX(512) PF_S93_KCHEAP(1) PF_S93_KSUP(8) PF_S93_NU(360) PF_S93_NV(240) PF_S93_H/RB/RT
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { covRadius, distRadial, distGlobal } from '../bridge/_facetTruthLib';
import { orientOfFacet, fdNormalsCentral } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S93_STYLE ?? 'GothicArches';
const STEM = process.env.PF_S93_STEM ?? 'gothicarches_ring_DS-HT_S39CTL';
const NFACET = Math.round(envF('PF_S93_FACETS', 200));
const MAXPTS = Math.round(envF('PF_S93_MAXPTS', 40));
const TOL = envF('PF_S93_TOL_MM', 0.010);
const NMAX = Math.round(envF('PF_S93_NMAX', 512));
const KCHEAP = Math.round(envF('PF_S93_KCHEAP', 1));
const KSUP = Math.round(envF('PF_S93_KSUP', 8));
const NU = Math.round(envF('PF_S93_NU', 360));
const NV = Math.round(envF('PF_S93_NV', 240));
const DIMS: StyleDims = { H: envF('PF_S93_H', 120), Rb: envF('PF_S93_RB', 40), Rt: envF('PF_S93_RT', 50), expn: 1 };
const H = DIMS.H;
/** f64 determinacy band on a mm distance — a difference below this is not a finding. */
const BAND = 1e-9;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

const T0 = Date.now();
log('===== S93 — IS THE PER-POINT ORIENTATION PREFILTER SOUND? =====');
log(`style ${STYLE}  stem ${STEM}  tol ${TOL} mm  nMax ${NMAX}`);
log(`facets ${NFACET}  max checked points/facet ${MAXPTS}  theta: cheap k=${KCHEAP} vs sup k=${KSUP}`);
log(`reference distGlobal nu=${NU} nv=${NV}   determinacy band ${BAND} mm`);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const ns = fdNormalsCentral(rA, H);

const M = readMeshFloat64(`research/exchange/_strataConformBisect/${STEM}.stl`, false);
const nTri = M.nTri; const xyz = M.xyz as unknown as Float64Array;
log(`${nTri} facets read   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

let s = Math.round(nTri * 0.6180339887); if (s % 2 === 0) s += 1;
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
while (gcd(s, nTri) !== 1) s += 2;

interface Agg {
  cand: number; checked: number; prune: number; viol: number;
  worstViolRatio: number; worstViolUb: number; worstViolTrue: number; worstViolTri: number;
}
const mk = (): Agg => ({ cand: 0, checked: 0, prune: 0, viol: 0, worstViolRatio: 0, worstViolUb: 0, worstViolTrue: 0, worstViolTri: -1 });
const cheap = mk(); const sup = mk();
const scratch = new Float64Array(12);
let facetsWithCand = 0;

for (let q = 0; q < NFACET; q += 1) {
  const t = (q * s) % nTri;
  const o = t * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const cov = covRadius(ax, ay, az, bx, by, bz, cx, cy, cz);
  if (!(cov > 0)) continue;
  const n = Math.min(NMAX, Math.max(2, Math.ceil(cov / TOL)));
  const rho = cov / n;
  const thresh = TOL - rho;
  if (!(thresh > 0)) continue;  // every point is above threshold; the prefilter has nothing to prune

  const thA = Math.atan2(ay, ax);
  const thB = thA + dThRaw(thA, Math.atan2(by, bx));
  const thC = thA + dThRaw(thA, Math.atan2(cy, cx));
  const oC = orientOfFacet(ns, ax, ay, az, bx, by, bz, cx, cy, cz, thA, thB, thC,
    { k: KCHEAP, inset: 0, orient: 'outward', scratch });
  const oS = orientOfFacet(ns, ax, ay, az, bx, by, bz, cx, cy, cz, thA, thB, thC,
    { k: KSUP, inset: 0, orient: 'outward', scratch });
  const tanCheap = Math.tan(Math.min(oC.normRad, Math.PI / 2 - 1e-9));
  const tanSup = Math.tan(Math.min(oS.normRad, Math.PI / 2 - 1e-9));
  if (!Number.isFinite(tanCheap) || !Number.isFinite(tanSup)) continue;

  const ubx = (bx - ax) / n; const uby = (by - ay) / n; const ubz = (bz - az) / n;
  const ucx = (cx - ax) / n; const ucy = (cy - ay) / n; const ucz = (cz - az) / n;
  let checkedHere = 0; let sawCand = false;
  for (let i = 0; i <= n && checkedHere < MAXPTS; i += 1) {
    const rx = ax + ucx * i; const ry = ay + ucy * i; const rz = az + ucz * i;
    for (let j = 0; j <= n - i && checkedHere < MAXPTS; j += 1) {
      const px = rx + ubx * j; const py = ry + uby * j; const pz = rz + ubz * j;
      const dR = distRadial(rA, H, px, py, pz);
      if (!(dR > thresh)) continue;              // not a pass-2 candidate; costs no tighten
      sawCand = true;
      cheap.cand += 1; sup.cand += 1;
      const Lv = Math.min(
        Math.hypot(px - ax, py - ay, pz - az),
        Math.hypot(px - bx, py - by, pz - bz),
        Math.hypot(px - cx, py - cy, pz - cz),
      );
      const ubC = tanCheap * Lv; const ubS = tanSup * Lv;
      const dTrue = distGlobal(rA, H, px, py, pz, NU, NV).d;
      checkedHere += 1;
      for (const [agg, ub] of [[cheap, ubC], [sup, ubS]] as [Agg, number][]) {
        agg.checked += 1;
        if (ub <= thresh) agg.prune += 1;
        if (ub < dTrue - BAND) {
          agg.viol += 1;
          const r = dTrue / Math.max(1e-30, ub);
          if (r > agg.worstViolRatio) { agg.worstViolRatio = r; agg.worstViolUb = ub; agg.worstViolTrue = dTrue; agg.worstViolTri = t; }
        }
      }
    }
  }
  if (sawCand) facetsWithCand += 1;
  if ((q + 1) % 25 === 0) log(`  ${q + 1}/${NFACET} facets   checked ${cheap.checked} pts   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
}

function report(label: string, a: Agg, kk: number): void {
  log('');
  log(`  ── theta from k=${kk}  (${label})`);
  log(`     pass-2 candidate points checked : ${a.checked}`);
  log(`     WOULD PRUNE (ub <= thresh)      : ${a.prune} (${((100 * a.prune) / Math.max(1, a.checked)).toFixed(2)}%)`);
  log(`     *** SOUNDNESS VIOLATIONS (ub < dTrue) : ${a.viol} (${((100 * a.viol) / Math.max(1, a.checked)).toFixed(2)}%) ***`);
  if (a.viol > 0) {
    log(`     worst violation: ub ${(a.worstViolUb * 1000).toFixed(4)} um  vs  dTrue ${(a.worstViolTrue * 1000).toFixed(4)} um`
      + `   = ${a.worstViolRatio.toFixed(1)}x TOO SMALL   (facet ${a.worstViolTri})`);
  }
}

log('');
log('═══ RESULT ═══');
log(`facets sampled ${NFACET}, of which with >=1 pass-2 candidate: ${facetsWithCand}`);
report('AS PRE-REGISTERED by S90 — "15 evals/facet"', cheap, KCHEAP);
report('higher-k sup, for contrast', sup, KSUP);
log('');
log('  READING: a violation means the bound is BELOW a real distance, so pruning on it would skip a point');
log('  that can raise `witnessed` — an unsound prune and a silent false PASS. Zero violations on this');
log('  sample is evidence for the sampled population, NOT a proof; `distGlobal` is itself an upper bound.');
log('');
log(`done  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
