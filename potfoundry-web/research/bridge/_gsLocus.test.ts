// _gsLocus.test.ts — GeometricStar FEATURE-LOCUS classification probe (PF_GSLOCUS=1).
//
// QUESTION (task-assigned): GeoStar's sharp cliff/ridge "ZIGZAGS up and down around the wall"; the
// production extractor `extractGeometricStar` emits STRAIGHT FULL-HEIGHT verticals at u=(k+0.5)/N.
// Which loci are REALLY there, and what is each one's continuity class?
//
// This probe measures — it does not assume — directly on `rOuterGeometricStar` (src/geometry/styles.ts:1781),
// the exact CPU analytic used by every ruler in the lab:
//   L1 fold ridge     u_fold(row,j) = (j + 0.5 - (row%2)*shift)/N          [alleged stagger]
//   L2 strap edges    dStrap = 0 (strap top) and dStrap = edge (gap floor)  [the chevron ramp]
//   L3 row boundary   t = k/(layers*zoom)                                   [vFade -> 0]
//
// For each: VALUE jump across the locus (C0?) vs one-sided DERIVATIVE jump (C1?) vs smooth.
// Rule used (honest, absolute, at PROD dims H120/Rb45/Rt70): a locus is
//   C0-DISCONTINUOUS if |r(+eps) - r(-eps)| stays ~constant as eps -> 0 (a genuine radius jump),
//   C1-KINKED       if the value gap -> 0 but |dr/dx(+) - dr/dx(-)| stays ~constant,
//   SMOOTH          if both -> 0.
// Reported with the ACTUAL kink magnitudes so the reader can size the feature.
//
// Also measures WHERE the mesher's worst facets actually fall: the E-2026-07-23-GEOSTAR-SEAM-LOCK
// worst-facet loci (u,t) are re-scored against L1/L2/L3 so "conforms to the wrong locus" is a
// measurement, not a story.
import { describe, it } from 'vitest';
import { rOuterGeometricStar } from '../../src/geometry/styles';
import { DEFAULT_GEOMETRIC_STAR } from '../../src/geometry/types';

const TAU = 2 * Math.PI;

// PROD dims (registry defaults, the E-2026-07-23-HARDCARD / SEAM-LOCK config).
const H = 120, RB = 45, RT = 70, EXPN = 1.1;
function r0At(t: number): number {
  return RB + (RT - RB) * Math.pow(t, EXPN);
}

interface GSP { points: number; gap: number; detail: number; layers: number; interlace: number; relief: number; roundness: number; zoom: number; shift: number }
const DEF: GSP = {
  points: DEFAULT_GEOMETRIC_STAR.gsPoints!, gap: DEFAULT_GEOMETRIC_STAR.gsGap!,
  detail: DEFAULT_GEOMETRIC_STAR.gsDetail!, layers: DEFAULT_GEOMETRIC_STAR.gsLayers!,
  interlace: DEFAULT_GEOMETRIC_STAR.gsInterlace!, relief: DEFAULT_GEOMETRIC_STAR.gsRelief!,
  roundness: DEFAULT_GEOMETRIC_STAR.gsRoundness!, zoom: DEFAULT_GEOMETRIC_STAR.gsZoom!,
  shift: DEFAULT_GEOMETRIC_STAR.gsShift!,
};

function opts(p: GSP): Record<string, number> {
  return {
    gsPoints: p.points, gsGap: p.gap, gsDetail: p.detail, gsLayers: p.layers,
    gsInterlace: p.interlace, gsRelief: p.relief, gsRoundness: p.roundness,
    gsZoom: p.zoom, gsShift: p.shift,
  };
}

/** r(u,t) on the outer wall at PROD dims. */
function rAt(u: number, t: number, p: GSP): number {
  return rOuterGeometricStar(u * TAU, t * H, r0At(t), H, opts(p) as never);
}

/** dStrap(u,t) — the strapwork SDF re-derived here from styles.ts:1781 so the probe is self-checking. */
function dStrapAt(u: number, t: number, p: GSP): number {
  const N = Math.max(4, p.points);
  const vRaw = t * p.layers * p.zoom;
  const row = Math.floor(vRaw);
  const v = (vRaw - row - 0.5) * 2;
  const rowOffset = (row % 2) * (Math.PI / N) * p.shift * 2;
  const angle = TAU / N;
  const th = u * TAU + rowOffset;
  const sector = Math.floor(th / angle);
  const a = (th / angle - sector - 0.5) * angle;
  const pX = Math.abs(a * (N / 4));
  const starAngle = (0.2 + 0.6 * p.detail) * (Math.PI / 2);
  const dLine = pX * Math.sin(starAngle) + v * Math.cos(starAngle);
  return Math.abs(dLine) - p.gap;
}

/** Scan u at fixed t for the u where |dStrap| is minimal near a target level (bisection on a bracket). */
function findLevelU(t: number, level: number, uLo: number, uHi: number, p: GSP): number | null {
  const f = (u: number): number => dStrapAt(u, t, p) - level;
  let a = uLo, fa = f(a);
  const NS = 4000;
  for (let i = 1; i <= NS; i++) {
    const b = uLo + (uHi - uLo) * (i / NS), fb = f(b);
    if (fa === 0) return a;
    if (fa * fb < 0) {
      let lo = a, hi = b;
      for (let k = 0; k < 80; k++) {
        const m = 0.5 * (lo + hi);
        if (f(lo) * f(m) <= 0) hi = m; else lo = m;
      }
      return 0.5 * (lo + hi);
    }
    a = b; fa = fb;
  }
  return null;
}

interface Classification { valueGap: number[]; derivJump: number[]; verdict: string }

/** Classify a locus crossed along direction d=(du,dt), at eps = [1e-3,1e-4,1e-5,1e-6] (in u or t units). */
function classify(u0: number, t0: number, du: number, dt: number, p: GSP): Classification {
  const epss = [1e-3, 1e-4, 1e-5, 1e-6];
  const valueGap: number[] = [];
  const derivJump: number[] = [];
  for (const e of epss) {
    const rP = rAt(u0 + du * e, t0 + dt * e, p);
    const rM = rAt(u0 - du * e, t0 - dt * e, p);
    valueGap.push(Math.abs(rP - rM));
    // one-sided slopes evaluated on a stencil OFF the locus (2e..3e away) so the locus itself
    // is never straddled by the difference.
    const sP = (rAt(u0 + du * 3 * e, t0 + dt * 3 * e, p) - rAt(u0 + du * e, t0 + dt * e, p)) / (2 * e);
    const sM = (rAt(u0 - du * e, t0 - dt * e, p) - rAt(u0 - du * 3 * e, t0 - dt * 3 * e, p)) / (2 * e);
    derivJump.push(Math.abs(sP - sM));
  }
  const vShrink = valueGap[0] > 1e-12 ? valueGap[3] / valueGap[0] : 0;
  const dStable = derivJump[0] > 1e-9 ? derivJump[3] / derivJump[0] : 0;
  let verdict: string;
  if (valueGap[3] > 1e-4) verdict = 'C0-DISCONTINUOUS (radius JUMP)';
  else if (derivJump[3] > 1e-3 && dStable > 0.2) verdict = 'C1-KINK (value continuous, slope jumps)';
  else if (vShrink < 0.5 && derivJump[3] < 1e-3) verdict = 'SMOOTH (no feature)';
  else verdict = `AMBIGUOUS (vShrink=${vShrink.toExponential(2)} dStable=${dStable.toExponential(2)})`;
  return { valueGap, derivJump, verdict };
}

const fmt = (a: number[]): string => a.map((x) => x.toExponential(3)).join(' ');

describe.skipIf(process.env.PF_GSLOCUS !== '1')('GeometricStar locus classification', () => {
  it('A1 — row-parity STAGGER: is the ridge u the same in adjacent rows?', () => {
    /* eslint-disable no-console */
    const N = DEF.points;
    const rowsPerT = DEF.layers * DEF.zoom;
    const vTarget = -0.35;                        // a v where the ramp exists
    const tRow = (row: number): number => (row + 0.5 + vTarget / 2) / rowsPerT;
    console.log(`\n[A1 STAGGER] N=${N} layers=${DEF.layers} zoom=${DEF.zoom} DEFAULT shift=${DEF.shift}`);
    for (const shift of [0, 0.25, 0.5, 1.0]) {
      const p = { ...DEF, shift };
      const t0 = tRow(0), t1 = tRow(1);
      // (a) EXACT translation identity: dStrap_row1(u) === dStrap_row0(u + shift/N) for all u?
      const dU = shift / N;
      let worstId = 0;
      for (let i = 0; i < 20000; i++) {
        const u = i / 20000;
        worstId = Math.max(worstId, Math.abs(dStrapAt(u, t1, p) - dStrapAt(u + dU, t0, p)));
      }
      // (b) ALL dStrap=0 crossings inside ONE sector cell [0,1/N), both rows.
      const cross = (t: number): number[] => {
        const out: number[] = [];
        const NS = 20000;
        let prev = dStrapAt(0, t, p);
        for (let i = 1; i <= NS; i++) {
          const u = (i / NS) / N, cur = dStrapAt(u, t, p);
          if (prev === 0 || prev * cur < 0) {
            let lo = (i - 1) / NS / N, hi = u;
            for (let k = 0; k < 60; k++) {
              const m = 0.5 * (lo + hi);
              if (dStrapAt(lo, t, p) * dStrapAt(m, t, p) <= 0) hi = m; else lo = m;
            }
            out.push(0.5 * (lo + hi));
          }
          prev = cur;
        }
        return out;
      };
      const c0 = cross(t0), c1 = cross(t1);
      console.log(
        `  shift=${shift.toFixed(2)}: translation-identity |dStrap_row1(u) − dStrap_row0(u+shift/N)| worst = ${worstId.toExponential(3)}` +
        `  (predicted stagger Δu = ${dU.toFixed(6)}, cell = ${(1 / N).toFixed(6)})`,
      );
      console.log(`     row0 dStrap=0 crossings in cell: [${c0.map((x) => x.toFixed(6)).join(', ')}]`);
      console.log(`     row1 dStrap=0 crossings in cell: [${c1.map((x) => x.toFixed(6)).join(', ')}]`);
    }
    /* eslint-enable no-console */
  });

  it('A4 — how fine must a FLAT facet be across the strap ramp to reach 0.01mm true-3D?', () => {
    /* eslint-disable no-console */
    const p = DEF;
    const rowsPerT = p.layers * p.zoom;
    const t = (0 + 0.5 + -0.35 / 2) / rowsPerT;
    const rMid = r0At(t);
    // Walk a u-chord of arc length h centred on the ramp; measure max |chord − surface| (radial,
    // which on a u-chord at fixed t is the honest normal distance up to the (small) 3D tilt).
    console.log(`\n[A4 RAMP CHORD] t=${t.toFixed(5)} r0=${rMid.toFixed(3)}mm`);
    const uTop = findLevelU(t, 0, 0, 1 / p.points, p)!;
    const uFloor = findLevelU(t, 0.02 + p.roundness * 0.2, 0, 1 / p.points, p)!;
    const uMid = 0.5 * (uTop + uFloor);
    for (const hMm of [1.0, 0.5, 0.25, 0.125, 0.0625, 0.05, 0.0437, 0.03, 0.02]) {
      const hU = hMm / (TAU * rMid);
      let worst = 0;
      // scan the chord's centre across the whole ramp so we find the worst placement
      for (let c = -1.2; c <= 1.2; c += 0.02) {
        const uc = uMid + c * (uFloor - uTop);
        const ua = uc - hU / 2, ub = uc + hU / 2;
        const ra = rAt(ua, t, p), rb = rAt(ub, t, p);
        for (let s = 0.02; s < 1; s += 0.02) {
          const chord = ra + (rb - ra) * s;
          worst = Math.max(worst, Math.abs(chord - rAt(ua + (ub - ua) * s, t, p)));
        }
      }
      console.log(`  facet arc h=${hMm.toFixed(4)}mm (Δu=${hU.toExponential(3)}) ⇒ worst chord dev = ${worst.toFixed(5)}mm ${worst <= 0.01 ? ' <= 0.01 OK' : ''}`);
    }
    /* eslint-enable no-console */
  });

  it('A2 — locus continuity classification at PROD dims (default params)', () => {
    /* eslint-disable no-console */
    const p = DEF;
    const N = p.points;
    const rowsPerT = p.layers * p.zoom;
    console.log(`\n[A2 CLASSIFY] dims H${H}/Rb${RB}/Rt${RT}/expn${EXPN}; params ${JSON.stringify(p)}`);

    // ---- L1: fold ridge u=(k+0.5)/N, crossed in u, at several t (row centre, ramp band, plateau).
    const uFold = 0.5 / N;
    for (const tag of ['row-centre v=0', 'ramp |v|~0.085', 'far-plateau |v|~0.45']) {
      const v = tag.startsWith('row-centre') ? 0 : tag.startsWith('ramp') ? 0.085 : 0.45;
      const t = (0 + 0.5 + v / 2) / rowsPerT;
      const c = classify(uFold, t, 1, 0, p);
      console.log(`  L1 fold u=${uFold.toFixed(6)} t=${t.toFixed(5)} (${tag}) dStrap=${dStrapAt(uFold, t, p).toFixed(5)}`);
      console.log(`     valueGap[1e-3..1e-6]=${fmt(c.valueGap)}  derivJump=${fmt(c.derivJump)}  => ${c.verdict}`);
    }

    // ---- L2: strap edges dStrap=0 and dStrap=edge, crossed in u (perpendicular-ish).
    const edge = 0.02 + p.roundness * 0.2;
    for (const [lvl, name] of [[0, 'strap-top dStrap=0'], [edge, `gap-floor dStrap=edge(${edge})`]] as [number, string][]) {
      const t = (0 + 0.5 + -0.35 / 2) / rowsPerT;
      const u = findLevelU(t, lvl, 0, 1 / N, p);
      if (u === null) { console.log(`  L2 ${name}: no crossing found`); continue; }
      const c = classify(u, t, 1, 0, p);
      console.log(`  L2 ${name} at u=${u.toFixed(6)} t=${t.toFixed(5)}`);
      console.log(`     valueGap=${fmt(c.valueGap)}  derivJump=${fmt(c.derivJump)}  => ${c.verdict}`);
    }
    // L2 STEEPNESS: how big is the radius swing across the ramp, and over what Δu / Δz?
    {
      const t = (0 + 0.5 + -0.35 / 2) / rowsPerT;
      const uTop = findLevelU(t, 0, 0, 1 / N, p);
      const uFloor = findLevelU(t, edge, 0, 1 / N, p);
      if (uTop !== null && uFloor !== null) {
        const rTop = rAt(uTop, t, p), rFloor = rAt(uFloor, t, p);
        const arcMm = Math.abs(uTop - uFloor) * TAU * r0At(t);
        console.log(`  L2 RAMP: Δr=${Math.abs(rTop - rFloor).toFixed(4)}mm over Δu=${Math.abs(uTop - uFloor).toExponential(3)} (arc ${arcMm.toFixed(4)}mm) ⇒ slope ${(Math.abs(rTop - rFloor) / arcMm).toFixed(2)} mm/mm`);
      }
    }

    // ---- L3: row boundary t=k/(layers*zoom), crossed in t.
    for (let k = 1; k < rowsPerT; k++) {
      const tB = k / rowsPerT;
      for (const uProbe of [0.5 / N, 0.25 / N, 0.02]) {
        const c = classify(uProbe, tB, 0, 1, p);
        console.log(`  L3 row-boundary t=${tB.toFixed(5)} at u=${uProbe.toFixed(5)}  r=${rAt(uProbe, tB, p).toFixed(5)} (r0=${r0At(tB).toFixed(5)})`);
        console.log(`     valueGap=${fmt(c.valueGap)}  derivJump=${fmt(c.derivJump)}  => ${c.verdict}`);
      }
    }
    /* eslint-enable no-console */
  });

  it('A5 — over what t-EXTENT is the fold ridge actually sharp? (is the full-height verticalLine honest?)', () => {
    /* eslint-disable no-console */
    const p = DEF;
    const N = p.points, rowsPerT = p.layers * p.zoom;
    const uFold = 0.5 / N;
    const eps = 1e-6;
    const jumpAt = (t: number): number => {
      const sP = (rAt(uFold + 3 * eps, t, p) - rAt(uFold + eps, t, p)) / (2 * eps);
      const sM = (rAt(uFold - eps, t, p) - rAt(uFold - 3 * eps, t, p)) / (2 * eps);
      return Math.abs(sP - sM);
    };
    // Scan ONE row in v; report where the kink is non-trivial. Threshold: a slope jump of
    // 1 mm per mm of ARC (≈45°) — below that the "crease" is not a feature a mesher must align to.
    const rMid = r0At(0.125);
    const arcPerU = TAU * rMid;
    const SAMPLES = 20000;
    let sharpT = 0;
    const bands: Array<[number, number]> = [];
    let inBand = false, bandStart = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES / rowsPerT;                 // row 0 only
      const jArc = jumpAt(t) / arcPerU;                 // mm per mm of arc
      const sharp = jArc > 1;
      if (sharp && !inBand) { inBand = true; bandStart = t; }
      if (!sharp && inBand) { inBand = false; bands.push([bandStart, t]); sharpT += t - bandStart; }
    }
    if (inBand) { bands.push([bandStart, 1 / rowsPerT]); sharpT += 1 / rowsPerT - bandStart; }
    const rowT = 1 / rowsPerT;
    console.log(`\n[A5 FOLD EXTENT] u=${uFold} row 0 (t∈[0,${rowT.toFixed(4)}]); "sharp" = |Δslope| > 1 mm/mm-arc`);
    console.log(`  sharp bands: ${bands.map(([a, b]) => `[${a.toFixed(5)},${b.toFixed(5)}]`).join(' ')}`);
    console.log(`  sharp t-extent = ${sharpT.toFixed(5)} of row height ${rowT.toFixed(5)} ⇒ ${((sharpT / rowT) * 100).toFixed(1)}% of the row`);
    console.log(`  ⇒ the shipped full-height verticalLine(u,0,1) is ${(100 - (sharpT / rowT) * 100).toFixed(1)}% NON-FEATURE`);
    // Peak kink magnitude
    let peak = 0, peakT = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES / rowsPerT;
      const j = jumpAt(t) / arcPerU;
      if (j > peak) { peak = j; peakT = t; }
    }
    console.log(`  peak |Δslope| = ${peak.toFixed(3)} mm/mm-arc at t=${peakT.toFixed(5)} (dihedral ≈ ${(180 - 2 * Math.atan(peak / 2) * 180 / Math.PI).toFixed(1)}°)`);
    /* eslint-enable no-console */
  });

  it('A6 — SAMPLER FLOOR: how far is styleSampler (512×512 bilinear) from the exact analytic?', async () => {
    /* eslint-disable no-console */
    const { styleSampler } = await import('../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler');
    const p = DEF;
    for (const res of [512, 1024, 2048, 4096]) {
      const s = styleSampler('GeometricStar' as never, {}, { H, Rt: RT, Rb: RB, expn: EXPN, gridResU: res, gridResT: res });
      // Sample OFF the grid nodes (worst case for bilinear): a golden-ratio shear so we never
      // land on a node, and a scan concentrated where the ramp lives.
      let worst = 0, worstAt: [number, number] = [0, 0];
      let sum = 0, n = 0;
      const NU = 4001, NT = 1201;
      for (let i = 0; i < NU; i++) {
        const u = (i * 0.6180339887498949) % 1;
        for (let j = 0; j < NT; j++) {
          const t = (j + 0.5) / NT;
          const pos = s.position(u, t);
          const th = u * TAU, z = t * H;
          const r = rAt(u, t, p);
          const d = Math.hypot(pos[0] - r * Math.cos(th), pos[1] - r * Math.sin(th), pos[2] - z);
          sum += d; n++;
          if (d > worst) { worst = d; worstAt = [u, t]; }
        }
      }
      console.log(`\n[A6 SAMPLER FLOOR] grid ${res}×${res}: MAX |sampler − exact| = ${worst.toFixed(5)}mm at (u=${worstAt[0].toFixed(5)}, t=${worstAt[1].toFixed(5)}) ; mean=${(sum / n).toFixed(6)}mm  (${n} samples)`);
    }
    /* eslint-enable no-console */
  });

  it('A3 — where do the MEASURED worst facets fall? (SEAM-LOCK worst-facet loci re-scored)', () => {
    /* eslint-disable no-console */
    const p = DEF;
    const N = p.points, rowsPerT = p.layers * p.zoom;
    const edge = 0.02 + p.roundness * 0.2;
    // From E-2026-07-23-GEOSTAR-SEAM-LOCK §4 (post-fix worst-3 true-3D facets, PROD dims).
    const WORST: [number, number, string][] = [
      [0.7809, 0.0659, 'ub 0.991'],
      [0.6552, 0.3127, 'z37.5'],
      [0.7815, 0.0882, ''],
    ];
    console.log('\n[A3 WORST-FACET LOCUS] scoring the SEAM-LOCK worst facets against L1/L2/L3');
    for (const [u, t, note] of WORST) {
      const ds = dStrapAt(u, t, p);
      // distance to nearest fold line (u=(k+0.5)/N)
      const uc = u * N - 0.5;
      const dFold = Math.abs(uc - Math.round(uc)) / N;
      // distance to nearest row boundary
      const tr = t * rowsPerT;
      const dRow = Math.abs(tr - Math.round(tr)) / rowsPerT;
      const inRamp = ds >= -1e-9 && ds <= edge + 1e-9;
      console.log(
        `  (u=${u}, t=${t}) ${note}: dStrap=${ds.toFixed(5)} ${inRamp ? '*** IN RAMP BAND [0,edge] ***' : '(outside ramp)'}  ` +
        `| dist-to-fold=${dFold.toFixed(5)} u (=${(dFold * N).toFixed(3)} cells) | dist-to-row-boundary=${dRow.toFixed(5)} t`,
      );
    }
    /* eslint-enable no-console */
  });
});
