// _voronoi_embed.test.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
// E-2026-07-09-VORONOI-EMBED (follow-up to §V11u-3 which REFUTED injection on Voronoi — cliff-class confirmed).
// Mirror the PROVEN Gyroid doubled-contour EMBED (§V11o/q) on the Voronoi cell-wall loci.
//
// Env-gated resumable stages (PF_VOR=1):
//   foldcheck (PF_VORSTAGE=foldcheck): the KILL-1 point-fold pre-check — RAMP (embeddable) vs FOLD (exclude). CHEAP, FIRST.
//   extract   (PF_VORSTAGE=extract):   derive cell-wall loci from the SAMPLER (marching squares on cellSdf), validate placement.
//   build     (PF_VORSTAGE=build):     doubled-contour conforming re-mesh (PF_VORVARIANT=doubled|crest|flat), recovery/watertight.
//   verdict   (PF_VORSTAGE=verdict):   whole-mesh Newton-ruler gate on the built mesh.
import { describe, it, expect } from 'vitest';
import { writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  VORONOI_DEFAULTS, wallIsolevels, cellSdf, webValue, marchSdfIso, linkSegments, refineAndFilterContours,
  decimateContours, contoursToConstraints, isoResidual3D, type Contour, type FoldProbe,
} from './_voronoiFieldLib';
import { radiusFn, TANGLED_BASE, buildTangled, auditNonManRaw, wholeMeshGuardRadialBound, worstFacetsByRadial } from './_pf_tangledKernelLib';
import { buildInhouseMetricMesh, auditNonManByIndex } from './labkit';
import { newtonNearest, type NewtonOpts } from './_gyroid_truthLib';
import type { StyleDims } from './labkit';

const RUN = process.env.PF_VOR === '1';
const DIR = join(process.cwd(), 'research/exchange/_voronoi_embed');
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const P = VORONOI_DEFAULTS;
const TAU = 2 * Math.PI;

describe('E-2026-07-09-VORONOI-EMBED', () => {
  // ── STAGE foldcheck (KILL-1) — CHEAP point-fold pre-check, run FIRST ──────────────────────────────────────────
  // Sample crest points (cellSdf≈0), march normal to the boundary, and measure whether the relief is a one-sided
  // monotone RAMP (Gyroid-embeddable) or a two-sided fold/multivalued cusp (CelticKnot-exclude). No build.
  it.skipIf(!RUN || process.env.PF_VORSTAGE !== 'foldcheck')('KILL-1 point-fold pre-check', () => {
    const rA = radiusFn('Voronoi', DIMS);
    // Find crest points: march the crest isolevel (small epsilon since cellSdf only touches 0) to get boundary pts.
    const lv = wallIsolevels(P);
    const crestC = Number(process.env.PF_VORCREST ?? '0.003'); // small positive offset into the band (near-crest)
    const segs = marchSdfIso(crestC, P, { nu: 1400, nt: 1400, polishIters: 30 });
    const contours = linkSegments(segs);
    // sample N crest points spread across contours
    const flat: Array<[number, number]> = [];
    for (const c of contours) for (const pt of c.pts) flat.push(pt);
    const Nsample = Math.min(400, flat.length);
    const stride = Math.max(1, Math.floor(flat.length / Nsample));
    const lift = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };

    // For each crest point: estimate the boundary NORMAL in (u,t) = ∇cellSdf direction (finite diff), then march
    // ±along the normal, sampling relief web·fade and 3D arc-length. Measure slope each side + monotonicity.
    const gradSdf = (u: number, t: number): [number, number] => {
      const h = 1e-3;
      const gu = (cellSdf(u + h, t, P) - cellSdf(u - h, t, P)) / (2 * h);
      const gt = (cellSdf(u, Math.min(1, t + h), P) - cellSdf(u, Math.max(0, t - h), P)) / (2 * h);
      return [gu, gt];
    };
    const reliefMm = (u: number, t: number): number => P.relief * webValue(u, t, P); // web·fade·relief in mm
    const probes: FoldProbe[] = [];
    let nMonoBoth = 0, nMultivalued = 0;
    const slopes: number[] = [];
    for (let k = 0; k < flat.length; k += stride) {
      const [u0, t0] = flat[k];
      let [gu, gt] = gradSdf(u0, t0);
      const gn = Math.hypot(gu, gt) || 1e-9; gu /= gn; gt /= gn; // unit normal in (u,t) (points into a cell interior)
      // march both directions; sample 20 steps out to ~0.6/scale in (u,t)
      const stepMax = 0.7 / P.scale, M = 24;
      const sampleSide = (sgn: number): { slope: number; mono: boolean; profile: number[] } => {
        let prevR = reliefMm(u0, t0); let prevXYZ = lift(u0, t0);
        let maxSlope = 0; let mono = true; const profile: number[] = [prevR];
        for (let m = 1; m <= M; m++) {
          const s = (stepMax * m) / M;
          const uu = u0 + sgn * gu * s, tt = Math.max(0, Math.min(1, t0 + sgn * gt * s));
          const r = reliefMm(uu, tt); const xyz = lift(uu, tt);
          const ds = Math.hypot(xyz[0] - prevXYZ[0], xyz[1] - prevXYZ[1], xyz[2] - prevXYZ[2]) || 1e-9;
          const slope = Math.abs(r - prevR) / ds;
          if (slope > maxSlope) maxSlope = slope;
          if (r > prevR + 1e-4) mono = false; // relief should DECAY away from crest (one-sided ramp)
          profile.push(r); prevR = r; prevXYZ = xyz;
        }
        return { slope: maxSlope, mono, profile };
      };
      const L = sampleSide(-1), Rr = sampleSide(+1);
      const rCrest = reliefMm(u0, t0);
      // multivalued/fold tell: relief RISES on both sides away from the sampled point (would mean the point is NOT a
      // crest but a valley, or the profile is non-monotone = a fold cusp). A clean one-sided ramp = mono both sides.
      const bothMono = L.mono && Rr.mono;
      if (bothMono) nMonoBoth++; else nMultivalued++;
      slopes.push(Math.max(L.slope, Rr.slope));
      // crest angle: from the two side-profiles' initial descent slopes (in relief-vs-arc), the interior angle at
      // the crest. atan(slope) each side; interior angle = 180 − (angleL + angleR) mapped; sharp cusp → small.
      const aL = Math.atan(L.slope), aR = Math.atan(Rr.slope);
      const crestAngleDeg = (Math.PI - (aL + aR)) * 180 / Math.PI;
      if (probes.length < 400) probes.push({ u: +u0.toFixed(5), t: +t0.toFixed(5), rCrest: +rCrest.toFixed(4), slopeLeft: +L.slope.toFixed(4), slopeRight: +Rr.slope.toFixed(4), monotoneLeft: L.mono, monotoneRight: Rr.mono, crestAngleDeg: +crestAngleDeg.toFixed(1) });
    }
    slopes.sort((a, b) => a - b);
    const pc = (q: number): number => slopes[Math.min(slopes.length - 1, Math.floor(q * slopes.length))];
    const nProbed = nMonoBoth + nMultivalued;
    const rec = {
      stage: 'foldcheck', crestC, nContours: contours.length, nCrestPts: flat.length, nProbed,
      monoBothFrac: +(nMonoBoth / Math.max(1, nProbed)).toFixed(4),
      multivaluedFrac: +(nMultivalued / Math.max(1, nProbed)).toFixed(4),
      slopeMed: +pc(0.5).toFixed(4), slopeP90: +pc(0.9).toFixed(4), slopeP99: +pc(0.99).toFixed(4), slopeMax: +slopes[slopes.length - 1].toFixed(4),
      // VERDICT tell: monoBothFrac ≈1 + moderate slope ⇒ RAMP (embeddable, Gyroid-class). multivaluedFrac high or
      // slope divergent ⇒ FOLD (CelticKnot-class, exclude).
      classification: nMonoBoth / Math.max(1, nProbed) >= 0.9 ? 'RAMP-embeddable' : 'FOLD-or-cusp',
    };
    appendFileSync(join(DIR, 'foldcheck.ndjson'), JSON.stringify(rec) + '\n');
    writeFileSync(join(DIR, 'foldcheck_probes.json'), JSON.stringify(probes));
    // eslint-disable-next-line no-console
    console.log('[foldcheck]', JSON.stringify(rec, null, 2));
    expect(nProbed).toBeGreaterThan(0);
  }, 30 * 60_000);

  // ── STAGE foldcheck2 (KILL-1, DECISIVE) — chord-sag HALVING test: ramp (reducible) vs fold (pinned) ───────────
  // The binary "monotone both sides" check conflates the wall NETWORK (a normal ray from one wall hits an adjacent
  // wall/junction) with a genuine occlusion fold. The DECISIVE discriminator (mission's ask): march crest→band-edge
  // cleanly into a cell interior (along +∇cellSdf), and measure whether the facet chord-sag across that span FALLS
  // geometrically under subdivision (RAMP, Gyroid-embeddable) or is PINNED (FOLD, CK-exclude). Radial r(u,t) is
  // single-valued so a literal occlusion fold is analytically impossible; this measures chord-REDUCIBILITY, the real
  // embeddability property.
  it.skipIf(!RUN || process.env.PF_VORSTAGE !== 'foldcheck2')('KILL-1 decisive — chord-sag halving (ramp vs fold)', () => {
    const rA = radiusFn('Voronoi', DIMS);
    const lift = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const gradSdf = (u: number, t: number): [number, number] => { const h = 5e-4; return [(cellSdf(u + h, t, P) - cellSdf(u - h, t, P)) / (2 * h), (cellSdf(u, Math.min(1, t + h), P) - cellSdf(u, Math.max(0, t - h), P)) / (2 * h)]; };
    const spanSag = (u0: number, t0: number, u1: number, t1: number, nSub: number): number => {
      let worst = 0;
      for (let seg = 0; seg < nSub; seg++) {
        const a0 = seg / nSub, a1 = (seg + 1) / nSub;
        const A = lift(u0 + (u1 - u0) * a0, t0 + (t1 - t0) * a0), B = lift(u0 + (u1 - u0) * a1, t0 + (t1 - t0) * a1);
        for (let k = 1; k < 16; k++) { const b = k / 16; const um = u0 + (u1 - u0) * (a0 + (a1 - a0) * b), tm = t0 + (t1 - t0) * (a0 + (a1 - a0) * b); const S = lift(um, tm); const Cx = A[0] + (B[0] - A[0]) * b, Cy = A[1] + (B[1] - A[1]) * b, Cz = A[2] + (B[2] - A[2]) * b; const d = Math.hypot(S[0] - Cx, S[1] - Cy, S[2] - Cz); if (d > worst) worst = d; }
      }
      return worst;
    };
    let seed = 999; const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const rows: Array<{ s1: number; s2: number; s4: number; s8: number }> = []; const ratios: number[] = [];
    const target = Number(process.env.PF_VORNSPAN ?? '400');
    for (let trial = 0; trial < 200000 && rows.length < target; trial++) {
      const u = rnd(), t = 0.15 + 0.7 * rnd(); if (cellSdf(u, t, P) > 0.003) continue;
      let [gu, gt] = gradSdf(u, t); const gn = Math.hypot(gu, gt) || 1e-9; gu /= gn; gt /= gn;
      let found = false, us = u, ts = t;
      for (let m = 1; m <= 300; m++) { const s = (0.9 / P.scale) * m / 300; const uu = u + gu * s, tt = Math.max(0, Math.min(1, t + gt * s)); if (cellSdf(uu, tt, P) >= P.thickness) { us = uu; ts = tt; found = true; break; } }
      if (!found) continue;
      const s1 = spanSag(u, t, us, ts, 1), s2 = spanSag(u, t, us, ts, 2), s4 = spanSag(u, t, us, ts, 4), s8 = spanSag(u, t, us, ts, 8);
      rows.push({ s1, s2, s4, s8 }); if (s1 > 1e-4) ratios.push(s8 / s1);
    }
    const colStats = (k: 's1' | 's2' | 's4' | 's8'): { med: number; p90: number; max: number } => { const v = rows.map((r) => r[k]).sort((a, b) => a - b); return { med: +v[(v.length / 2) | 0].toFixed(4), p90: +v[Math.floor(v.length * 0.9)].toFixed(4), max: +v[v.length - 1].toFixed(4) }; };
    ratios.sort((a, b) => a - b);
    const ratioMed = ratios.length ? +ratios[(ratios.length / 2) | 0].toFixed(4) : 0;
    const rec = {
      stage: 'foldcheck2', nSpans: rows.length,
      sag_nSub1: colStats('s1'), sag_nSub2: colStats('s2'), sag_nSub4: colStats('s4'), sag_nSub8: colStats('s8'),
      ratio_s8_s1_med: ratioMed,
      classification: ratioMed < 0.35 ? 'RAMP-embeddable (chord reduces geometrically)' : 'FOLD-pinned (chord density-invariant → CK-exclude)',
    };
    appendFileSync(join(DIR, 'foldcheck.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[foldcheck2]', JSON.stringify(rec, null, 2));
    expect(rows.length).toBeGreaterThan(0);
  }, 30 * 60_000);

  // ── STAGE extract — derive cell-wall loci FROM THE SAMPLER + validate placement sub-0.01 vs sampler ───────────
  it.skipIf(!RUN || process.env.PF_VORSTAGE !== 'extract')('extract cell-wall loci + validate placement', () => {
    const rA = radiusFn('Voronoi', DIMS);
    const lv = wallIsolevels(P);
    // crest isolevel: cellSdf only TOUCHES 0 (a valley crease), so extract a small positive near-crest offset AND
    // the flat-edge isolevel cellSdf=th. The DOUBLED pair brackets the ramp band.
    const crestC = Number(process.env.PF_VORCREST ?? '0.02'); // inner (near-crest) — inside the band
    const flatC = lv.flat; // outer band edge (cellSdf = th = 0.1)
    const nu = Number(process.env.PF_VORNU ?? '1600'), nt = Number(process.env.PF_VORNT ?? '1600');
    const opts = { nu, nt, polishIters: 40 };
    const t0 = Date.now();
    const crestSegs = marchSdfIso(crestC, P, opts);
    const flatSegs = marchSdfIso(flatC, P, opts);
    const rfCrest = refineAndFilterContours(linkSegments(crestSegs), crestC, P);
    const rfFlat = refineAndFilterContours(linkSegments(flatSegs), flatC, P);
    const crestC_ = rfCrest.contours, flatC_ = rfFlat.contours;
    const ms = Date.now() - t0;

    // placement validation: sample vertices ON each polyline, measure 3D displacement off the true isolevel (bounded
    // nearest-isolevel search vs the SAMPLER cellSdf) + valErr.
    const validate = (contours: Contour[], c: number): { n: number; maxDisp: number; p99Disp: number; maxValErr: number } => {
      const disps: number[] = []; let maxValErr = 0;
      for (const cont of contours) for (const [u, t] of cont.pts) {
        const r = isoResidual3D(u, t, c, P, rA, DIMS.H); disps.push(r.disp3D); if (r.valErr > maxValErr) maxValErr = r.valErr;
      }
      disps.sort((a, b) => a - b);
      return { n: disps.length, maxDisp: +(disps[disps.length - 1] ?? 0).toFixed(6), p99Disp: +(disps[Math.floor(0.99 * disps.length)] ?? 0).toFixed(6), maxValErr: +maxValErr.toFixed(6) };
    };
    const vCrest = validate(crestC_, crestC), vFlat = validate(flatC_, flatC);
    const nCrestPts = crestC_.reduce((a, c) => a + c.pts.length, 0), nFlatPts = flatC_.reduce((a, c) => a + c.pts.length, 0);
    const rec = {
      stage: 'extract', crestC, flatC, nu, nt, ms,
      crest: { nContours: crestC_.length, nPts: nCrestPts, dropped: rfCrest.dropped, ...vCrest },
      flat: { nContours: flatC_.length, nPts: nFlatPts, dropped: rfFlat.dropped, ...vFlat },
    };
    appendFileSync(join(DIR, 'extract.ndjson'), JSON.stringify(rec) + '\n');
    // persist refined contours for build (resumable)
    writeFileSync(join(DIR, 'contours_refined.json'), JSON.stringify({
      crestC, flatC,
      crest: crestC_.map((c) => c.pts), flat: flatC_.map((c) => c.pts),
    }));
    // eslint-disable-next-line no-console
    console.log('[extract]', JSON.stringify(rec, null, 2));
    expect(Math.max(vCrest.maxDisp, vFlat.maxDisp)).toBeLessThan(0.01); // KILL-1b: placement must reach sub-0.01 vs sampler
  }, 30 * 60_000);

  // ── STAGE build — doubled-contour conforming re-mesh ─────────────────────────────────────────────────────────
  // PF_VORVARIANT=doubled (crest+flat) | crest | flat.  PF_VORSTEP=<picket mm> PF_VORMAX=<maxPoints> PF_VORCHORD=<chordTol>
  it.skipIf(!RUN || process.env.PF_VORSTAGE !== 'build')('doubled-contour conforming build', () => {
    const rA = radiusFn('Voronoi', DIMS);
    const variant = process.env.PF_VORVARIANT ?? 'doubled';
    const stepMm = Number(process.env.PF_VORSTEP ?? '0.12');
    const maxPoints = Number(process.env.PF_VORMAX ?? '3500000');
    const chordTolMm = Number(process.env.PF_VORCHORD ?? '0.003');
    const raw = JSON.parse(readFileSync(join(DIR, 'contours_refined.json'), 'utf8')) as { crestC: number; flatC: number; crest: number[][][]; flat: number[][][]; };
    const asC = (arr: number[][][]): Contour[] => arr.map((pts) => ({ pts: pts as [number, number][] }));
    let contours: Contour[];
    if (variant === 'crest') contours = asC(raw.crest);
    else if (variant === 'flat') contours = asC(raw.flat);
    else if (variant === 'doubled') contours = [...asC(raw.crest), ...asC(raw.flat)];
    else throw new Error('variant must be doubled|crest|flat');
    const dec = decimateContours(contours, stepMm, rA, DIMS.H);
    const { injectedPoints, constraintEdges } = contoursToConstraints(dec);
    const nConstraintVerts = injectedPoints.length / 2, nConstraintEdges = constraintEdges.length / 2;

    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
      ...TANGLED_BASE, maxPoints, optimizeSweeps: 2,
      guardManifoldAlways: true, chordTolMm, chordSteiner: true,
      injectedPoints, constraintEdges, pinInjected: true,
      guardRecoveryManifold: true, recoveryRobust: true, recoverySubdivideCollinear: true,
      recoveryCollinearEps: Number(process.env.PF_VOREPS ?? '1e-9'),
    });
    const ms = Date.now() - t0;
    const ut = mesh.ut, idx = mesh.indices, tris = idx.length / 3;
    const nmRaw = auditNonManRaw(idx);
    const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const u = ut[2 * i], t = ut[2 * i + 1], th = TAU * u, z = t * DIMS.H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
    const nmIdx = auditNonManByIndex(xyz, idx);
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx as unknown as Uint32Array, 0.01);
    const tag = process.env.PF_VORTAG ?? variant;
    const rec = {
      stage: 'build', variant, tag, stepMm, chordTolMm, maxPoints, ms, tris, points: mesh.points, hitBudget: mesh.hitBudget,
      projFullPot: tris, nConstraintVerts, nConstraintEdges, recovery: mesh.constraint,
      nonManRaw: nmRaw, nonManIdx: nmIdx, zeroArea: sound.zeroArea,
      soundRadial: { outliers: sound.outliers, max: sound.maxMm, p99: sound.p99 },
    };
    appendFileSync(join(DIR, 'build.ndjson'), JSON.stringify(rec) + '\n');
    writeFileSync(join(DIR, `mesh_${tag}.ut.bin`), Buffer.from(Float64Array.from(ut).buffer));
    writeFileSync(join(DIR, `mesh_${tag}.idx.bin`), Buffer.from((idx as Uint32Array).buffer, (idx as Uint32Array).byteOffset, (idx as Uint32Array).byteLength));
    writeFileSync(join(DIR, `mesh_${tag}.meta.json`), JSON.stringify(rec));
    // eslint-disable-next-line no-console
    console.log('[build]', JSON.stringify(rec, null, 2));
    expect(mesh.constraint?.failed ?? 0).toBeLessThan(nConstraintEdges * 0.5);
  }, 180 * 60_000);

  // ── STAGE verdict — whole-mesh Newton-ruler gate ─────────────────────────────────────────────────────────────
  it.skipIf(!RUN || process.env.PF_VORSTAGE !== 'verdict')('Newton-ruler verdict', () => {
    const rA = radiusFn('Voronoi', DIMS);
    const tag = process.env.PF_VORTAG ?? 'doubled';
    const tol = Number(process.env.PF_VORTOL ?? '0.01');
    const utBuf = readFileSync(join(DIR, `mesh_${tag}.ut.bin`));
    const idxBuf = readFileSync(join(DIR, `mesh_${tag}.idx.bin`));
    const ut = Array.from(new Float64Array(utBuf.buffer, utBuf.byteOffset, utBuf.byteLength / 8));
    const idx = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, idxBuf.byteLength / 4);
    const tris = idx.length / 3;
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx, tol);
    const DENSE: Array<[number, number, number]> = [];
    { const n = 8; for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) DENSE.push([i / n, j / n, (n - i - j) / n]); }
    const lift = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const [x, y, z] = lift(ut[2 * i], ut[2 * i + 1]); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
    const radialBound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > DIMS.H) return Infinity; let th = Math.atan2(py, px); if (th < 0) th += TAU; return Math.abs(Math.hypot(px, py) - rA(th, pz)); };
    const nF = idx.length / 3;
    // wall proximity: on-wall = facet centroid within band of cellSdf ∈ [0, th+margin]
    const onWall = (uc: number, tc: number): boolean => { const s = cellSdf(uc, tc, P); return s <= P.thickness + 0.03; };
    const radOut: Array<{ f: number; wbnd: number; wp: [number, number, number]; uc: number; tc: number }> = [];
    for (let f = 0; f < nF; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const A = [xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]] as const, B = [xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]] as const, C = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]] as const;
      let wbnd = 0, wp: [number, number, number] = [A[0], A[1], A[2]];
      for (const [wa, wb, wc] of DENSE) { const px = wa * A[0] + wb * B[0] + wc * C[0], py = wa * A[1] + wb * B[1] + wc * C[1], pz = wa * A[2] + wb * B[2] + wc * C[2]; const d = radialBound(px, py, pz); if (d > wbnd) { wbnd = d; wp = [px, py, pz]; } }
      if (wbnd <= tol) continue;
      const uc = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, tc = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      radOut.push({ f, wbnd, wp, uc, tc });
    }
    const nRadOut = radOut.length;
    const literal = process.env.PF_VORLITERAL === '1';
    const sampleN = Number(process.env.PF_VORSAMPLE ?? '2500');
    radOut.sort((x, y) => y.wbnd - x.wbnd);
    let sampled = radOut;
    if (!literal) { const stride = Math.max(1, Math.floor(nRadOut / sampleN)); sampled = radOut.filter((_, i) => i % stride === 0).slice(0, sampleN); }
    const NW: NewtonOpts = { seedTheta: 0, seedZ: 0, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 };
    const trueDevs: number[] = []; let maxTrue = 0, nTrueOut = 0, nOnWall = 0, nOffWall = 0, newtonCalls = 0;
    const outRows: Array<{ uc: number; tc: number; trueDev: number; onWall: number }> = [];
    const scoredPath = join(DIR, `scored_${tag}.jsonl`);
    for (let si = 0; si < sampled.length; si++) {
      const s = sampled[si];
      const nr = newtonNearest(rA, DIMS.H, s.wp[0], s.wp[1], s.wp[2], NW); newtonCalls++;
      trueDevs.push(nr.dist);
      if (nr.dist > tol) {
        nTrueOut++; if (nr.dist > maxTrue) maxTrue = nr.dist;
        const ow = onWall(s.uc, s.tc); if (ow) nOnWall++; else nOffWall++;
        if (outRows.length < 6000) outRows.push({ uc: +s.uc.toFixed(5), tc: +s.tc.toFixed(5), trueDev: +nr.dist.toFixed(5), onWall: ow ? 1 : 0 });
      }
      if (literal && (si % 5000 === 4999)) appendFileSync(scoredPath, JSON.stringify({ done: si + 1, nTrueOut }) + '\n');
    }
    const trueOutFrac = sampled.length ? nTrueOut / sampled.length : 0;
    const scaledTrueOut = literal ? nTrueOut : Math.round(trueOutFrac * nRadOut);
    trueDevs.sort((x, y) => x - y);
    const pc = (q: number): number => trueDevs.length ? trueDevs[Math.min(trueDevs.length - 1, Math.floor(q * trueDevs.length))] : 0;
    const nmIdx = auditNonManByIndex(xyz, idx);
    const rec = {
      stage: 'verdict', tag, tol, tris, basis: literal ? 'LITERAL (every non-green)' : `stratified ${sampled.length}`,
      soundRadialOutliers: sound.outliers, soundRadialMax: sound.maxMm, nRadOutliers: nRadOut, newtonCalls,
      nTrueOutInSample: nTrueOut, scaledTrueOutliers: scaledTrueOut, trueMax: +maxTrue.toFixed(5),
      truep50: +pc(0.5).toFixed(5), truep90: +pc(0.9).toFixed(5), truep99: +pc(0.99).toFixed(5),
      nOnWall, nOffWall, offWallFrac: nTrueOut ? +(nOffWall / nTrueOut).toFixed(4) : 0,
      nonManIdx: nmIdx, zeroArea: sound.zeroArea,
    };
    appendFileSync(join(DIR, 'verdict.ndjson'), JSON.stringify(rec) + '\n');
    writeFileSync(join(DIR, `verdict_outliers_${tag}.ndjson`), outRows.map((r) => JSON.stringify(r)).join('\n'));
    // eslint-disable-next-line no-console
    console.log('[verdict]', JSON.stringify(rec, null, 2));
    expect(tris).toBeGreaterThan(0);
  }, 300 * 60_000);

  // ── STAGE anchor — reproduce the §V11u-3 base (no embed) to confirm the honest floor deterministically ────────
  it.skipIf(!RUN || process.env.PF_VORSTAGE !== 'anchor')('reproduce §V11u-3 honest floor', () => {
    const b = buildTangled('Voronoi', DIMS, { chordTolMm: Number(process.env.PF_VORB ?? '0.008'), maxPoints: 2_000_000, sizeRes: Number(process.env.PF_VORS ?? '224'), chordSampleN: 8 });
    const rA = radiusFn('Voronoi', DIMS);
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, b.ut, b.idx, 0.01);
    const rec = { stage: 'anchor', tris: b.tris, points: b.points, projFullPot: 2 * b.tris, radialOut: sound.outliers, radialMax: +sound.maxMm.toFixed(5), zeroArea: sound.zeroArea };
    appendFileSync(join(DIR, 'anchor.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[anchor]', JSON.stringify(rec, null, 2));
    expect(b.tris).toBeGreaterThan(0);
  }, 60 * 60_000);
});
