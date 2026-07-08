/**
 * flankBand.ts — Tier-C CLIFF-CLASS flank-band toe-contour extraction
 * (E-2026-07-08-TIERC-FLANKBAND, round 9, flag-gated / dev-driver only).
 *
 * The §V11s near-vertical rib-flank chord floor (~1150 outliers, worst 0.469) is
 * the SAME signature as the Gyroid channel wall (§V11o/q): a steep relief wall
 * fought with subdivision instead of EMBEDDED. The protected complex embeds rib
 * CRESTS (the ridge maxima) but NOT the flank TOE (where the steep flank meets the
 * smooth panel). Facets straddling crest→flank→panel have irreducible chord-sag no
 * matter how small their (u,t) footprint.
 *
 * This module extracts the TOE contours as (u,t) polylines by marching-squares on
 * the relief-amplitude field a(u,t) = r(u,t) − r̄_panel(t) at a chosen iso-value
 * (the toe amplitude), root-polished onto the isolevel — the exact _gyroidContourLib
 * pattern, but on the NUMERICALLY-sampled Gothic field (style-agnostic, matching the
 * Tier-C philosophy; no re-derivation of the analytic rib pattern).
 *
 * ISOLATION: NEW file. Consumes a SurfaceSampler READ-ONLY. Wired into the protected
 * complex only through the flag-gated `bandContours` param on buildProtectedComplex
 * (default undefined ⇒ byte-identical off). No src/ behavioral change when unused.
 */

import type { SurfaceSampler } from '../SurfaceSampler';

const TAU = 2 * Math.PI;

/** Ordered (u,t) polyline. */
export interface FlankContour {
  pts: Array<[number, number]>;
}

/** Chart-domain window the extraction runs on. */
export interface FlankDomain {
  uLo: number;
  uHi: number;
  tLo: number;
  tHi: number;
}

/** The numerically-sampled relief-amplitude field a(u,t) = r − r̄_panel(t). */
export interface AmplitudeField {
  /** a(u,t): radius above the per-t panel floor (mm). */
  a(u: number, t: number): number;
  /** r(u,t) (mm). */
  r(u: number, t: number): number;
  /** r̄_panel(t): min radius over the domain u-range at t (the valley floor). */
  panel(t: number): number;
  /** rib crest r over the domain u-range at t (max radius). */
  ribCrest(t: number): number;
  /** amplitude fraction: 0 at panel, 1 at rib crest. */
  ampFrac(u: number, t: number): number;
}

/**
 * Build the relief-amplitude field from a sampler over a domain. The panel floor
 * r̄_panel(t) is the MIN radius across the domain u-range at each t (interpolated
 * from a dense t-table); rib crest is the MAX. a = r − panel, ampFrac = a/(crest−panel).
 */
export function buildAmplitudeField(
  sampler: SurfaceSampler,
  domain: FlankDomain,
  ntTable = 400,
  nuScan = 512,
): AmplitudeField {
  const r = (u: number, t: number): number => {
    const [x, y] = sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t)));
    return Math.hypot(x, y);
  };
  const panelTab = new Float64Array(ntTable + 1);
  const crestTab = new Float64Array(ntTable + 1);
  for (let j = 0; j <= ntTable; j++) {
    const t = domain.tLo + (domain.tHi - domain.tLo) * (j / ntTable);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i <= nuScan; i++) {
      const u = domain.uLo + (domain.uHi - domain.uLo) * (i / nuScan);
      const rr = r(u, t);
      if (rr < lo) lo = rr;
      if (rr > hi) hi = rr;
    }
    panelTab[j] = lo;
    crestTab[j] = hi;
  }
  const interp = (tab: Float64Array, t: number): number => {
    const f =
      (Math.min(domain.tHi, Math.max(domain.tLo, t)) - domain.tLo) /
      (domain.tHi - domain.tLo);
    const j = Math.min(ntTable - 1, Math.max(0, Math.floor(f * ntTable)));
    const fr = f * ntTable - j;
    return tab[j] * (1 - fr) + tab[j + 1] * fr;
  };
  const panel = (t: number): number => interp(panelTab, t);
  const ribCrest = (t: number): number => interp(crestTab, t);
  const a = (u: number, t: number): number => r(u, t) - panel(t);
  const ampFrac = (u: number, t: number): number => {
    const p = panel(t);
    const c = ribCrest(t);
    return c - p > 1e-6 ? (r(u, t) - p) / (c - p) : 0;
  };
  return { a, r, panel, ribCrest, ampFrac };
}

// ── marching squares on the AMPLITUDE-FRACTION field af(u,t) − c ────────────────
// We extract level sets of g(u,t) = af(u,t) − c over the domain. af is smooth away
// from the rib ridge-line critical points; a few bisection/secant steps nail the
// isolevel to machine precision in (u,t). u is NOT wrapped here (the domain is a
// sub-window u[0.05,0.15], well inside [0,1)); t is clamped to the domain.

export interface FlankMarchOpts {
  nu: number;
  nt: number;
  polishIters: number;
}

function edgeRoot(
  g: (u: number, t: number) => number,
  ua: number,
  ta: number,
  ub: number,
  tb: number,
  iters: number,
): [number, number] {
  let ga = g(ua, ta);
  let gb = g(ub, tb);
  let a = 0;
  let b = 1;
  for (let it = 0; it < iters; it++) {
    let s = ga !== gb ? a + (b - a) * (0 - ga) / (gb - ga) : 0.5 * (a + b);
    if (!(s > a && s < b)) s = 0.5 * (a + b);
    const us = ua + (ub - ua) * s;
    const ts = ta + (tb - ta) * s;
    const gs = g(us, ts);
    if (gs === 0) return [us, ts];
    if ((ga < 0) !== (gs < 0)) {
      b = s;
      gb = gs;
    } else {
      a = s;
      ga = gs;
    }
  }
  const sm = 0.5 * (a + b);
  return [ua + (ub - ua) * sm, ta + (tb - ta) * sm];
}

/**
 * Marching squares over the domain for the isolevel af = c. Returns UNORDERED
 * segments; ordering into polylines is done by `linkFlankSegments`.
 */
export function marchAmpFrac(
  field: AmplitudeField,
  domain: FlankDomain,
  c: number,
  opts: FlankMarchOpts,
): Array<[[number, number], [number, number]]> {
  const { nu, nt, polishIters } = opts;
  const g = (u: number, t: number): number => field.ampFrac(u, t) - c;
  const U = (i: number): number => domain.uLo + (domain.uHi - domain.uLo) * (i / nu);
  const T = (j: number): number => domain.tLo + (domain.tHi - domain.tLo) * (j / nt);
  const val = new Float64Array((nu + 1) * (nt + 1));
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nt; j++) val[i * (nt + 1) + j] = g(U(i), T(j));
  const at = (i: number, j: number): number => val[i * (nt + 1) + j];
  const segs: Array<[[number, number], [number, number]]> = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nt; j++) {
      const u0 = U(i);
      const u1 = U(i + 1);
      const t0 = T(j);
      const t1 = T(j + 1);
      const f00 = at(i, j);
      const f10 = at(i + 1, j);
      const f11 = at(i + 1, j + 1);
      const f01 = at(i, j + 1);
      const cross: Array<[number, number]> = [];
      if ((f00 < 0) !== (f10 < 0)) cross.push(edgeRoot(g, u0, t0, u1, t0, polishIters));
      if ((f10 < 0) !== (f11 < 0)) cross.push(edgeRoot(g, u1, t0, u1, t1, polishIters));
      if ((f01 < 0) !== (f11 < 0)) cross.push(edgeRoot(g, u0, t1, u1, t1, polishIters));
      if ((f00 < 0) !== (f01 < 0)) cross.push(edgeRoot(g, u0, t0, u0, t1, polishIters));
      if (cross.length === 2) segs.push([cross[0], cross[1]]);
      else if (cross.length === 4) {
        segs.push([cross[0], cross[1]]);
        segs.push([cross[2], cross[3]]);
      }
    }
  }
  return segs;
}

/** Link unordered segments into ordered polylines by welding shared endpoints. */
export function linkFlankSegments(
  segs: Array<[[number, number], [number, number]]>,
  weldEps = 1e-6,
): FlankContour[] {
  const q = 1 / weldEps;
  const key = (pt: [number, number]): string =>
    `${Math.round(pt[0] * q)}_${Math.round(pt[1] * q)}`;
  const adj = new Map<string, Array<{ s: number; e: 0 | 1 }>>();
  segs.forEach((s, i) => {
    for (const e of [0, 1] as const) {
      const k = key(s[e]);
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k)!.push({ s: i, e });
    }
  });
  const used = new Array(segs.length).fill(false);
  const contours: FlankContour[] = [];
  const nextFrom = (segIdx: number, fromEnd: 0 | 1): { s: number; e: 0 | 1 } | null => {
    const pt = segs[segIdx][fromEnd === 0 ? 1 : 0];
    const k = key(pt);
    const cands = adj.get(k) ?? [];
    for (const c of cands) if (!used[c.s] && c.s !== segIdx) return c;
    return null;
  };
  for (let start = 0; start < segs.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const pts: Array<[number, number]> = [segs[start][0], segs[start][1]];
    let cur = start;
    let curOtherEnd: 0 | 1 = 1;
    for (;;) {
      const nx = nextFrom(cur, curOtherEnd === 1 ? 0 : 1);
      if (!nx) break;
      used[nx.s] = true;
      pts.push(segs[nx.s][nx.e === 0 ? 1 : 0]);
      cur = nx.s;
      curOtherEnd = nx.e === 0 ? 1 : 0;
    }
    contours.push({ pts });
  }
  return contours;
}

/**
 * Polish every polyline vertex onto af = c by a bounded 2D descent of (af−c)²;
 * drop a vertex that cannot reach afErr ≤ afTol within the window (splits its
 * polyline). Sub-tol placement on every surviving constraint vertex.
 */
export function refineAndFilterFlank(
  contours: FlankContour[],
  field: AmplitudeField,
  c: number,
  afTol = 5e-4,
  window = 0.004,
): { contours: FlankContour[]; dropped: number; kept: number } {
  const polish = (u: number, t: number): { u: number; t: number; err: number } => {
    const N = 20;
    let bestF = Infinity;
    let bu = u;
    let bt = t;
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const uu = u + window * (i / N - 0.5) * 2;
        const tt = t + window * (j / N - 0.5) * 2;
        const e = field.ampFrac(uu, tt) - c;
        const f = e * e;
        if (f < bestF) {
          bestF = f;
          bu = uu;
          bt = tt;
        }
      }
    let h = window / N;
    for (let it = 0; it < 50; it++) {
      let improved = false;
      for (const ddu of [-h, 0, h])
        for (const ddt of [-h, 0, h]) {
          if (ddu === 0 && ddt === 0) continue;
          const e = field.ampFrac(bu + ddu, bt + ddt) - c;
          const f = e * e;
          if (f < bestF) {
            bestF = f;
            bu += ddu;
            bt += ddt;
            improved = true;
          }
        }
      if (!improved) h *= 0.5;
      if (h < 1e-9) break;
    }
    return { u: bu, t: bt, err: Math.sqrt(bestF) };
  };
  const out: FlankContour[] = [];
  let dropped = 0;
  let kept = 0;
  for (const cont of contours) {
    let run: Array<[number, number]> = [];
    for (const [u, t] of cont.pts) {
      const rr = polish(u, t);
      if (rr.err <= afTol) {
        run.push([rr.u, rr.t]);
        kept++;
      } else {
        dropped++;
        if (run.length >= 2) out.push({ pts: run });
        run = [];
      }
    }
    if (run.length >= 2) out.push({ pts: run });
    else if (run.length === 1) kept--;
  }
  return { contours: out, dropped, kept };
}

/**
 * 3D placement residual of a point placed on the extracted af=c contour: the
 * bounded 2D nearest-isolevel search (matching _gyroidContourLib.isoResidual3D —
 * bounded so it never blows up at ∇af→0 ridge critical points). disp3D small ⇒
 * the extractor placed the vertex on the toe to sub-tol.
 */
export function flankIsoResidual3D(
  u: number,
  t: number,
  field: AmplitudeField,
  c: number,
  sampler: SurfaceSampler,
): { afErr: number; disp3D: number } {
  const afErr = Math.abs(field.ampFrac(u, t) - c);
  const lift = (uu: number, tt: number): [number, number, number] => [
    ...sampler.position(((uu % 1) + 1) % 1, Math.min(1, Math.max(0, tt))),
  ];
  const [x0, y0, z0] = lift(u, t);
  const R = 0.004;
  const N = 24;
  let bestF = Infinity;
  let bu = u;
  let bt = t;
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const uu = u + R * (i / N - 0.5) * 2;
      const tt = t + R * (j / N - 0.5) * 2;
      const e = field.ampFrac(uu, tt) - c;
      const f = e * e;
      if (f < bestF) {
        bestF = f;
        bu = uu;
        bt = tt;
      }
    }
  let hstep = R / N;
  for (let it = 0; it < 40; it++) {
    let improved = false;
    for (const ddu of [-hstep, 0, hstep])
      for (const ddt of [-hstep, 0, hstep]) {
        if (ddu === 0 && ddt === 0) continue;
        const e = field.ampFrac(bu + ddu, bt + ddt) - c;
        const f = e * e;
        if (f < bestF) {
          bestF = f;
          bu += ddu;
          bt += ddt;
          improved = true;
        }
      }
    if (!improved) hstep *= 0.5;
    if (hstep < 1e-9) break;
  }
  const [x1, y1, z1] = lift(bu, bt);
  return { afErr, disp3D: Math.hypot(x1 - x0, y1 - y0, z1 - z0) };
}

/**
 * Decimate each polyline to a target 3D arc-length step (mm). Keeps endpoints +
 * every vertex ≥ stepMm (3D) from the last kept one. The near-vertical toe walls
 * mean a modest step keeps the constraint faithful; the mesher's chord-Steiner
 * inserts more where sag demands.
 */
export function decimateFlank(
  contours: FlankContour[],
  stepMm: number,
  sampler: SurfaceSampler,
): FlankContour[] {
  const lift = (u: number, t: number): [number, number, number] => [
    ...sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t))),
  ];
  const out: FlankContour[] = [];
  for (const cont of contours) {
    if (cont.pts.length < 2) continue;
    const kept: Array<[number, number]> = [cont.pts[0]];
    let [lx, ly, lz] = lift(cont.pts[0][0], cont.pts[0][1]);
    for (let i = 1; i < cont.pts.length - 1; i++) {
      const [x, y, z] = lift(cont.pts[i][0], cont.pts[i][1]);
      if (Math.hypot(x - lx, y - ly, z - lz) >= stepMm) {
        kept.push(cont.pts[i]);
        lx = x;
        ly = y;
        lz = z;
      }
    }
    kept.push(cont.pts[cont.pts.length - 1]);
    if (kept.length >= 2) out.push({ pts: kept });
  }
  return out;
}

/**
 * Extract the DOUBLED toe band for a domain at amplitude-fraction levels
 * [cLo, cHi] (the two flanking iso-lines that frame each rib flank strip). Each
 * level is marched → linked → polished → decimated. Returns both contour sets.
 */
/**
 * Drop vertices whose 3D placement residual exceeds `dispTolMm` (splits their
 * polyline). The af-space polish (`refineAndFilterFlank`) leaves ~0.1% of
 * vertices at ridge SADDLES where a tiny af error maps to a large 3D move (the
 * documented _gyroidContourLib validator artifact). Those saddle strays are a
 * locked-toe placement hazard (a slightly-off locked vertex spawns a
 * non-manifold junction) — remove them so the embedded toe is 3D-faithful.
 */
export function filterByDisp3D(
  contours: FlankContour[],
  field: AmplitudeField,
  c: number,
  sampler: SurfaceSampler,
  dispTolMm = 0.01,
): { contours: FlankContour[]; dropped: number } {
  const out: FlankContour[] = [];
  let dropped = 0;
  for (const cont of contours) {
    let run: Array<[number, number]> = [];
    for (const [u, t] of cont.pts) {
      const r = flankIsoResidual3D(u, t, field, c, sampler);
      if (r.disp3D <= dispTolMm) run.push([u, t]);
      else {
        dropped++;
        if (run.length >= 2) out.push({ pts: run });
        run = [];
      }
    }
    if (run.length >= 2) out.push({ pts: run });
  }
  return { contours: out, dropped };
}

/**
 * TAPERED rail levels (E-2026-07-08-TIERC-TAPERRAIL). Place `nRails` af-levels at
 * equal-cumulative-STEEPNESS intervals instead of fixed af values: finer rails
 * exactly where the flank is steepest, coarser where it eases. Steepness is |∇r|
 * (radius gradient magnitude in mm PER mm of (u,t) footprint) — the driver of a
 * facet's chord-sag: where |∇r| is high a fixed-(u,t)-size facet accrues more sag.
 * We sweep af∈[afLo,afHi], invert af→u at a representative t-band (the residual
 * concentrates near the arch mid-band t≈0.52), and integrate the cumulative
 * |∇r|·d(mm-param) as (u,t) advances. Rails then sit at af_k where the cumulative
 * steepness reaches k/(nRails+1) of its total — equal-|∇r| increments ⇒ denser
 * af-rails on the steep shoulder. Under a UNIFORM ladder the §V11v residual sat in
 * the widest inter-rail af-gap [0.08,0.18]; a taper concentrates the framing on the
 * steep shoulder. Pure geometry — no mesh, no side effects.
 *
 * NB: steepness is |∇r| (radius rise per parameter footprint), NOT total 3D arc-
 * length — the latter is dominated by the theta sweep (du/daf), which crowds rails
 * at HIGH af regardless of where the radius actually turns.
 *
 * afLo/afHi bracket the flank band to rail (default the lower-flank residual band).
 */
export function taperedLevels(
  sampler: SurfaceSampler,
  domain: FlankDomain,
  nRails: number,
  afLo = 0.02,
  afHi = 0.45,
  nSample = 512,
): number[] {
  const field = buildAmplitudeField(sampler, domain);
  // Representative t-band: the residual mid-band. Average steepness over a few t
  // slices so a single quirky t doesn't dominate the taper.
  const tSlices = [0.47, 0.5, 0.525, 0.55];
  // For a given (af,t): invert ampFrac→u by bisection on u∈[uLo,uHi] (af is
  // monotone in u along a single flank; the domain u-window is one flank side).
  const uForAf = (af: number, t: number): number => {
    let lo = domain.uLo;
    let hi = domain.uHi;
    const target = af;
    // ampFrac is increasing from panel(uLo side) toward crest; ensure orientation.
    const fLo = field.ampFrac(lo, t);
    const fHi = field.ampFrac(hi, t);
    const inc = fHi >= fLo;
    for (let it = 0; it < 40; it++) {
      const mid = 0.5 * (lo + hi);
      const fm = field.ampFrac(mid, t);
      if ((fm < target) === inc) lo = mid;
      else hi = mid;
    }
    return 0.5 * (lo + hi);
  };
  // |∇r| in mm: dr/d(mm-u) and dr/d(mm-t) via central FD (step ~0.02mm in mm-space).
  // uToMm/tToMm recovered from the domain span vs a mm probe (the flank is ~sub-mm
  // in u; use a fixed small param step and divide by its mm length).
  const rAt = (u: number, t: number): number => field.r(u, t);
  // mm-per-param scale (probe at domain centre): convert the 0.02mm FD step to a
  // param step so |∇r| is genuinely per-mm regardless of the u/t param scaling.
  const uMid = 0.5 * (domain.uLo + domain.uHi);
  const tMid = 0.5 * (domain.tLo + domain.tHi);
  const [xo, yo, zo] = sampler.position(uMid, tMid);
  const [xu1, yu1, zu1] = sampler.position(uMid + 1e-4, tMid);
  const uMmPerParam = Math.hypot(xu1 - xo, yu1 - yo, zu1 - zo) / 1e-4 || 1;
  const [xt1, yt1, zt1] = sampler.position(uMid, tMid + 1e-4);
  const tMmPerParam = Math.hypot(xt1 - xo, yt1 - yo, zt1 - zo) / 1e-4 || 1;
  const gradMag = (u: number, t: number): number => {
    const hUparam = 0.02 / uMmPerParam;
    const hTparam = 0.02 / tMmPerParam;
    const dru = (rAt(u + hUparam, t) - rAt(u - hUparam, t)) / (2 * 0.02);
    const drt = (rAt(u, t + hTparam) - rAt(u, t - hTparam)) / (2 * 0.02);
    return Math.hypot(dru, drt);
  };
  // Build cumulative steepness S(af) = ∫ |∇r|(af') · daf' over [afLo,afHi], averaged
  // over the t-slices. NB: weight against daf (NOT the mm footprint) — af is DEFINED
  // as (r−panel)/(crest−panel) so r is linear in af and ∫|dr| would be trivially
  // uniform; ∫|∇r|·daf instead crowds rails where the RADIUS-PER-PARAMETER gradient
  // is high (the steep shoulder = small parameter footprint per daf = high chord-sag
  // for a fixed-(u,t)-size facet).
  const afGrid = new Float64Array(nSample + 1);
  const Scum = new Float64Array(nSample + 1);
  const dAf = (afHi - afLo) / nSample;
  let gPrev = 0;
  for (let i = 0; i <= nSample; i++) {
    const af = afLo + (afHi - afLo) * (i / nSample);
    afGrid[i] = af;
    let g = 0;
    for (const t of tSlices) g += gradMag(uForAf(af, t), t);
    g /= tSlices.length;
    Scum[i] = i === 0 ? 0 : Scum[i - 1] + 0.5 * (g + gPrev) * dAf;
    gPrev = g;
  }
  const Stot = Scum[nSample];
  if (!(Stot > 1e-9)) {
    // Degenerate (flat) flank ⇒ fall back to uniform af spacing.
    return Array.from({ length: nRails }, (_, k) => afLo + (afHi - afLo) * ((k + 1) / (nRails + 1)));
  }
  // Invert S(af) at equal S-fractions.
  const levels: number[] = [];
  for (let k = 1; k <= nRails; k++) {
    const Starget = (Stot * k) / (nRails + 1);
    // find grid interval containing Starget
    let idx = 0;
    while (idx < nSample && Scum[idx + 1] < Starget) idx++;
    const s0 = Scum[idx];
    const s1 = Scum[idx + 1];
    const fr = s1 - s0 > 1e-12 ? (Starget - s0) / (s1 - s0) : 0;
    levels.push(+(afGrid[idx] + (afGrid[idx + 1] - afGrid[idx]) * fr).toFixed(5));
  }
  return levels;
}

/**
 * Extract a LADDER of toe rails at several amplitude-fraction levels. After a
 * doubled band frames the mid-flank, the residual DESCENDS to the panel-meets-
 * wall toe (measured: the worst-200 sit at ampFrac ~0.01-0.12, below a 0.12
 * rail). A ladder of rails across the whole lower flank frames every sub-strip.
 * Each level is marched → linked → af-polished → 3D-disp-cleaned → decimated.
 */
export function extractLadder(
  sampler: SurfaceSampler,
  domain: FlankDomain,
  levels: number[],
  march: FlankMarchOpts,
  stepMm: number,
): { field: AmplitudeField; rails: Array<{ level: number; contours: FlankContour[]; kept: number; dropped: number }> } {
  const field = buildAmplitudeField(sampler, domain);
  const rails = levels.map((c) => {
    const segs = marchAmpFrac(field, domain, c, march);
    const linked = linkFlankSegments(segs);
    const filtered = refineAndFilterFlank(linked, field, c);
    const dispClean = filterByDisp3D(filtered.contours, field, c, sampler);
    const deci = decimateFlank(dispClean.contours, stepMm, sampler);
    return {
      level: c,
      contours: deci,
      kept: filtered.kept - dispClean.dropped,
      dropped: filtered.dropped + dispClean.dropped,
    };
  });
  return { field, rails };
}

export function extractToeBand(
  sampler: SurfaceSampler,
  domain: FlankDomain,
  cLo: number,
  cHi: number,
  march: FlankMarchOpts,
  stepMm: number,
): {
  field: AmplitudeField;
  lo: FlankContour[];
  hi: FlankContour[];
  loKept: number;
  loDropped: number;
  hiKept: number;
  hiDropped: number;
} {
  const field = buildAmplitudeField(sampler, domain);
  const extract = (c: number): { contours: FlankContour[]; kept: number; dropped: number } => {
    const segs = marchAmpFrac(field, domain, c, march);
    const linked = linkFlankSegments(segs);
    const filtered = refineAndFilterFlank(linked, field, c);
    // 3D-disp filter BEFORE decimation so a dropped saddle stray splits the
    // polyline at the right place (the decimator would otherwise bridge it).
    const dispClean = filterByDisp3D(filtered.contours, field, c, sampler);
    const deci = decimateFlank(dispClean.contours, stepMm, sampler);
    return {
      contours: deci,
      kept: filtered.kept - dispClean.dropped,
      dropped: filtered.dropped + dispClean.dropped,
    };
  };
  const lo = extract(cLo);
  const hi = extract(cHi);
  return {
    field,
    lo: lo.contours,
    hi: hi.contours,
    loKept: lo.kept,
    loDropped: lo.dropped,
    hiKept: hi.kept,
    hiDropped: hi.dropped,
  };
}
