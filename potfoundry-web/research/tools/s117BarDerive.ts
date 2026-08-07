// s117BarDerive.ts — S117 P5. RETIRE THE INHERITED 45 DEG BAR AND DERIVE ITS REPLACEMENTS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE PROVENANCE OF THE THING BEING RETIRED (read, not guessed)
//   S108 (5caba0b0) printed a four-row REPORTING ladder — bars 1 / 5 / 20 / 45 deg — on
//   gothicarches_ring_DS-HT_S39CTL.stl. 45 was the last row of a table. s108AngleBarCalib.ts's own named
//   colour bands stop at 10 deg, so 45 is not even a band edge. s109CreaseCrossTab.ts:52 made it a
//   default (`PF_S109_HI_DEG`, 45) and named the selected set "the visible class"; s111:54, s112:146,
//   revS113SplitReach:44, revS113SplitReachXStyle:45 ("verbatim"), revS116PlaceboMatched:98 ("a
//   CONVENTION, per the brief") inherited it unchanged. It was never tied to an observation.
//
// WHAT THIS TOOL MEASURES — the three things a bar could protect, separately, on the same facets:
//   (a) EXPORT / TOPOLOGY   non-manifold and inconsistently-wound edges; dihedral above the surface's own
//                           ANALYTIC CEILING (CEIL = 2*atan(max|grad r|), computed with h SWEPT by
//                           s116zFinalScore and passed in here); and the f32 PLANE-INTERSECTION
//                           DETERMINACY floor on min altitude. A slicer intersects planes with triangles
//                           in exact arithmetic — sampling is irrelevant to this criterion.
//   (b) VISIBILITY          the WEBER CONTRAST of the shading step across each interior edge, maximised
//                           over an orbit of headlight directions, GATED on the crease band being wide
//                           enough to be resolved at a STATED mm/sample. research/tools/s117VisBarKernel.ts.
//   (c) FIDELITY            normDeg and perpendicular position residual, read from the EXHAUSTIVE S116 /
//                           S117 per-facet dumps (so scars 1-3 are inherited already-swept, not re-run).
//
// REPRODUCTION CONTROL, ASSERTED NOT ASSUMED: the >45 deg per-facet COUNT / AREA / %MESH printed here
// must equal the committed S116 numbers for the same file. If it does not, this run is VOID and says so.
//
// UPPER-BOUND DISCLOSURE: the orbit test asks "is this crease ever supra-threshold from some direction",
// with no occlusion test. A crease inside the pot, or behind it, is counted as visible. Every visibility
// figure here is therefore an UPPER bound on what is seen, which is the safe direction for a bar that is
// being used to condemn geometry.
//
// Usage: bash research/tools/run-s117-barderive.sh
//   env PF_S117BD_STL(abs) PF_S117BD_TAG PF_S117BD_CEIL_DEG PF_S117BD_NORMDEG(f64) PF_S117BD_R3UM(f64)
//       PF_S117BD_ONLYTEST=1  PF_S117BD_NAZ  PF_S117BD_ELS("-15,0,20,40")
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { facetDihedralsBig } from '../bridge/dihedralRulerBig';
import { renderView, facetAreas, buildCylinder } from './s116Render';
import { contrastOfPair, dihedralForContrast, CLAY_SH, prismDihedralRad } from './s117VisBarKernel';
import type { V3 } from './s117VisBarKernel';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const DEG = 180 / Math.PI;

const OUTDIR = envS('PF_S117BD_OUTDIR', 'research/exchange/_strataConformBisect/s117');
mkdirSync(OUTDIR, { recursive: true });

const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : '0.0000');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE V — INSTRUMENT VALIDATION. Runs first, every time. Exits non-zero on failure.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Chk { name: string; ok: boolean; detail: string }
const checks: Chk[] = [];
const chk = (name: string, ok: boolean, detail: string): void => { checks.push({ name, ok, detail }); };

function facetNormalsOf(xyz: Float64Array, nTri: number): { nx: Float64Array; ny: Float64Array; nz: Float64Array } {
  const nx = new Float64Array(nTri); const ny = new Float64Array(nTri); const nz = new Float64Array(nTri);
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const ux = xyz[o + 3] - xyz[o]; const uy = xyz[o + 4] - xyz[o + 1]; const uz = xyz[o + 5] - xyz[o + 2];
    const wx = xyz[o + 6] - xyz[o]; const wy = xyz[o + 7] - xyz[o + 1]; const wz = xyz[o + 8] - xyz[o + 2];
    const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
    const l = Math.hypot(cx, cy, cz);
    if (l > 0) { nx[t] = cx / l; ny[t] = cy / l; nz[t] = cz / l; }
  }
  return { nx, ny, nz };
}

function selfTest(): void {
  log('══════════════════════════════════════════════════════════════════════════════════════════');
  log('PHASE V — INSTRUMENT VALIDATION (two-sided; floors AND ceilings). Nothing below is trusted');
  log('          unless every line here says PASS.');
  log('══════════════════════════════════════════════════════════════════════════════════════════');

  // ── V1: the N-gon prism's side-wall dihedral is exactly 360/N. ────────────────────────────────────
  log('');
  log('── V1  N-gon prism: facetDihedrals must report the SIDE-WALL dihedral as exactly 360/N ──');
  log('        N     expected deg      measured deg          abs err rad     wall facets');
  for (const N of [6, 12, 24, 48, 96, 180, 360, 720]) {
    const { xyz, nTri } = buildCylinder(20, 0, 40, N, 2, false); // caps off => pure side wall
    const idx = new Int32Array(nTri * 3); for (let i = 0; i < nTri * 3; i += 1) idx[i] = i;
    const D = facetDihedrals(xyz, idx);
    // the VERTICAL seam edges carry the 360/N turn; the horizontal/diagonal ones carry 0.
    let mx = 0; let nWall = 0;
    for (let e = 0; e < D.edgeAngRad.length; e += 1) {
      const a = D.edgeAngRad[e];
      if (a > 1e-9) { nWall += 1; if (a > mx) mx = a; }
    }
    const want = prismDihedralRad(N);
    const err = Math.abs(mx - want);
    log(`     ${String(N).padStart(4)}   ${(want * DEG).toFixed(6).padStart(12)}   ${(mx * DEG).toFixed(6).padStart(14)}   ${err.toExponential(3).padStart(14)}   ${String(nWall).padStart(8)}`);
    chk(`V1 N=${N} dihedral == 360/N`, err < 1e-9 && mx > 0 && nWall > 0, `err ${err.toExponential(3)} rad, ${nWall} turning edges`);
  }

  // ── V2: the kernel must PREDICT THE RASTERISER'S OWN 8-BIT PIXELS. ────────────────────────────────
  log('');
  log('── V2  the contrast kernel must predict research/tools/s116Render.ts pixel values to <= 1/255 ──');
  log('        N    band pairs    max |predicted - rendered| code values     max rendered step');
  for (const N of [12, 24, 48, 96]) {
    const { xyz, nTri } = buildCylinder(20, -20, 20, N, 2, false);
    const area = facetAreas(xyz, nTri);
    const W = 1200; const Hpx = 400;
    const R = renderView({
      xyz, nTri, area, W, Hpx, ss: 1, mode: 'clay',
      azDeg: 0, elDeg: 0, halfHmm: 22, target: [0, 0, 0],
      caption: `V2 PRISM N=${N}`,
    });
    // read a scanline BELOW the overlay text block; each painted run of equal grey is one facet band.
    const y = Math.floor(Hpx * 0.75);
    const runs: Array<{ v: number; x0: number; x1: number }> = [];
    for (let x = 0; x < W; x += 1) {
      const v = R.rgb[(y * W + x) * 3];
      const g = R.rgb[(y * W + x) * 3 + 1]; const b = R.rgb[(y * W + x) * 3 + 2];
      // background is a dark blue-grey gradient (r < g < b); clay is r > g > b.
      if (!(v > g && g > b)) continue;
      const last = runs[runs.length - 1];
      if (last !== undefined && last.v === v && last.x1 === x - 1) last.x1 = x;
      else runs.push({ v, x0: x, x1: x });
    }
    // predicted code for each prism facet at az=0,el=0: d = (1,0,0); side facet j has normal at angle
    // phi_j = 2*pi*(j+0.5)/N (facet centre between two rim vertices).
    const codes: number[] = [];
    for (let j = 0; j < N; j += 1) {
      const phi = (2 * Math.PI * (j + 0.5)) / N;
      const lam = Math.cos(phi); // n . d with d = +x
      if (lam <= 0) continue;
      codes.push(Math.min(255, Math.round(214 * CLAY_SH(Math.abs(lam)))));
    }
    codes.sort((p, q) => p - q);
    const seen = runs.map((r) => r.v).filter((v, i, arr) => arr.indexOf(v) === i).sort((p, q) => p - q);
    // every distinct rendered grey must be one of the predicted codes
    let maxErr = 0;
    for (const v of seen) {
      let best = Infinity;
      for (const c of codes) best = Math.min(best, Math.abs(c - v));
      maxErr = Math.max(maxErr, best);
    }
    let maxStep = 0;
    for (let i = 1; i < runs.length; i += 1) maxStep = Math.max(maxStep, Math.abs(runs[i].v - runs[i - 1].v));
    log(`     ${String(N).padStart(4)}   ${String(runs.length).padStart(10)}   ${String(maxErr).padStart(42)}   ${String(maxStep).padStart(17)}`);
    chk(`V2 N=${N} kernel predicts renderer pixels`, maxErr <= 1 && runs.length >= 3 && maxStep > 0,
      `maxErr ${maxErr} codes, ${runs.length} bands, maxStep ${maxStep}`);
  }

  // ── V3: the CONVERSE floor — one dihedral, both sides of the JND, on ONE fixture. ────────────────
  log('');
  log('── V3  H4 fixture: ONE dihedral must be BOTH above and below the 1% Weber bar on one prism ──');
  {
    const N = 720; const dih = prismDihedralRad(N);
    const a = 0.12;
    const d: V3 = [1, 0, 0];
    let lo = Infinity; let hi = 0; let nBoth = 0;
    for (let j = 0; j < N; j += 1) {
      const p1 = (2 * Math.PI * (j + 0.5)) / N; const p2 = (2 * Math.PI * (j + 1.5)) / N;
      const n1: V3 = [Math.cos(p1), Math.sin(p1), 0]; const n2: V3 = [Math.cos(p2), Math.sin(p2), 0];
      const c = contrastOfPair(n1, n2, d, a);
      if (!Number.isFinite(c) || !(c > 0)) continue;
      nBoth += 1; if (c < lo) lo = c; if (c > hi) hi = c;
    }
    log(`     N=${N}  dihedral ${(dih * DEG).toFixed(4)} deg CONSTANT   pairs both-front-facing ${nBoth}`);
    log(`     Weber contrast  MIN ${lo.toExponential(4)}   MAX ${hi.toExponential(4)}   ratio ${(hi / lo).toFixed(1)}x`);
    log(`     1% bar sits INSIDE that range: ${lo < 0.01 && hi > 0.01 ? 'YES' : 'NO'}`);
    chk('V3 one dihedral straddles the JND', lo < 0.01 && hi > 0.01 && hi / lo > 30,
      `min ${lo.toExponential(3)} max ${hi.toExponential(3)} ratio ${(hi / lo).toFixed(1)}x`);
  }

  // ── V4: the kernel separates a SMOOTH body from a FACETED one at the same triangle count. ────────
  log('');
  log('── V4  discrimination floor: a 360-gon (smooth-ish) vs a 12-gon (faceted) at 0.0873 mm/sample ──');
  {
    const a = 0.12;
    const eval1 = (N: number): { visFrac: number; maxC: number } => {
      const dih = prismDihedralRad(N);
      let vis = 0; let tot = 0; let mx = 0;
      for (let j = 0; j < N; j += 1) {
        const p1 = (2 * Math.PI * (j + 0.5)) / N; const p2 = (2 * Math.PI * (j + 1.5)) / N;
        const n1: V3 = [Math.cos(p1), Math.sin(p1), 0]; const n2: V3 = [Math.cos(p2), Math.sin(p2), 0];
        let best = 0;
        for (let k = 0; k < 180; k += 1) {
          const th = (k / 180) * 2 * Math.PI;
          const c = contrastOfPair(n1, n2, [Math.cos(th), Math.sin(th), 0], a);
          if (Number.isFinite(c) && c > best) best = c;
        }
        // band width across the crease on a R=20 prism: the facet chord 2*R*sin(pi/N)
        const w = 2 * 20 * Math.sin(Math.PI / N);
        tot += 1; if (best >= 0.01 && w >= 0.0873) vis += 1;
        if (best > mx) mx = best;
        void dih;
      }
      return { visFrac: vis / tot, maxC: mx };
    };
    const smooth = eval1(3600);   // 0.1 deg facets, 0.035 mm bands => under the eye's resolution
    const faceted = eval1(12);    // 30 deg facets, 10 mm bands   => unmistakable
    log(`     N=3600 (0.100 deg, 0.0349 mm bands): visible fraction ${(smooth.visFrac * 100).toFixed(2)}%   maxC ${smooth.maxC.toExponential(3)}`);
    log(`     N=12   (30.00 deg, 10.353 mm bands): visible fraction ${(faceted.visFrac * 100).toFixed(2)}%   maxC ${faceted.maxC.toExponential(3)}`);
    chk('V4 separates smooth from faceted', smooth.visFrac < 0.05 && faceted.visFrac > 0.95,
      `smooth ${(smooth.visFrac * 100).toFixed(2)}% vs faceted ${(faceted.visFrac * 100).toFixed(2)}%`);
  }

  log('');
  let allOk = true;
  for (const c of checks) { if (!c.ok) allOk = false; log(`   ${c.ok ? 'PASS' : '*** FAIL ***'}  ${c.name}  — ${c.detail}`); }
  log('');
  if (!allOk) { log('*** INSTRUMENT VALIDATION FAILED — NO MESH NUMBER FROM THIS RUN IS TRUSTED ***'); process.exit(1); }
  log(`   ALL ${checks.length} VALIDATION CHECKS PASS.`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PHASE M — THE MESH
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Agg { n: number; area: number; max: number }
const mk = (): Agg => ({ n: 0, area: 0, max: 0 });
const add = (g: Agg, a: number, v: number): void => { g.n += 1; g.area += a; if (v > g.max) g.max = v; };

function runMesh(): void {
  const STL = envS('PF_S117BD_STL', '');
  const TAG = envS('PF_S117BD_TAG', 'BD');
  const CEIL_DEG = envF('PF_S117BD_CEIL_DEG', NaN);
  const ND_PATH = envS('PF_S117BD_NORMDEG', '');
  const R3_PATH = envS('PF_S117BD_R3UM', '');
  const R3_UNITS = envS('PF_S117BD_R3UNITS', 'um');
  const NAZ = Math.round(envF('PF_S117BD_NAZ', 24));
  const ELS = envS('PF_S117BD_ELS', '-15,0,20,40').split(',').map(Number);
  const EXPECT45_N = envF('PF_S117BD_EXPECT45_N', NaN);
  const EXPECT45_A = envF('PF_S117BD_EXPECT45_A', NaN);
  if (STL === '') { log('PF_S117BD_STL not set — validation only.'); return; }

  const J: Record<string, unknown> = { tag: TAG, stl: STL, ceilDeg: CEIL_DEG };
  const t0 = Date.now();
  const el = (): string => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`;

  log('══════════════════════════════════════════════════════════════════════════════════════════');
  log(`PHASE M — ${TAG}`);
  log('══════════════════════════════════════════════════════════════════════════════════════════');
  log(`mesh ${STL}`);

  const { xyz, nTri } = readMeshFloat64(STL, false);
  const area = facetAreas(xyz, nTri);
  let areaTot = 0; for (let t = 0; t < nTri; t += 1) areaTot += area[t];
  log(`facets ${nTri.toLocaleString()}   3D area ${areaTot.toFixed(4)} mm2   ${el()}`);

  const idx = new Int32Array(nTri * 3); for (let i = 0; i < nTri * 3; i += 1) idx[i] = i;
  const nEdgeEst = nTri * 3;
  const D = nEdgeEst > 8_000_000 ? facetDihedralsBig(xyz, idx) : facetDihedrals(xyz, idx);
  log(`TOPOLOGY  interior ${D.interiorEdges.toLocaleString()}   boundary ${D.boundaryEdges}   NON-MANIFOLD ${D.nonManifoldEdges}   INCONSISTENT ${D.inconsistentEdges}   ${el()}`);
  J.topology = { interior: D.interiorEdges, boundary: D.boundaryEdges, nonManifold: D.nonManifoldEdges, inconsistent: D.inconsistentEdges };

  const { nx, ny, nz } = facetNormalsOf(xyz, nTri);

  // ── REPRODUCTION CONTROL: the >45 deg per-facet class must equal the committed S116 numbers. ──────
  const dihDeg = new Float64Array(nTri);
  for (let f = 0; f < nTri; f += 1) dihDeg[f] = D.perFacetMaxRad[f] * DEG;
  let n45 = 0; let a45 = 0;
  for (let f = 0; f < nTri; f += 1) if (dihDeg[f] > 45) { n45 += 1; a45 += area[f]; }
  log('');
  log('── REPRODUCTION CONTROL (asserted, not assumed) ──');
  log(`   >45 deg per facet: COUNT ${n45.toLocaleString()}   AREA ${a45.toFixed(4)} mm2 = ${pct(a45, areaTot)}% OF MESH`);
  if (Number.isFinite(EXPECT45_N)) {
    const okN = n45 === EXPECT45_N;
    const okA = Math.abs(a45 - EXPECT45_A) < 1e-3;
    log(`   committed S116 value: COUNT ${EXPECT45_N}   AREA ${EXPECT45_A}`);
    log(`   ${okN && okA ? 'CONTROL HOLDS' : '*** CONTROL FIRED — THIS RUN IS VOID ***'}`);
    if (!(okN && okA)) { J.controlFired = true; }
  } else {
    log('   (no committed value supplied for this mesh — control not run)');
  }
  J.class45 = { n: n45, area: a45, frac: a45 / areaTot };

  // ── per-edge geometry: the shared edge, its length, and the two band widths. ─────────────────────
  const nE = D.interiorEdges;
  const eLen = new Float64Array(nE);
  const eB1 = new Float64Array(nE);   // 2*A1/L: facet 1's width ACROSS the crease
  const eB2 = new Float64Array(nE);
  const eDx = new Float64Array(nE); const eDy = new Float64Array(nE); const eDz = new Float64Array(nE);
  {
    const same = (o1: number, o2: number): boolean => xyz[o1] === xyz[o2] && xyz[o1 + 1] === xyz[o2 + 1] && xyz[o1 + 2] === xyz[o2 + 2];
    let unresolved = 0;
    for (let e = 0; e < nE; e += 1) {
      const f1 = D.edgeF1[e]; const f2 = D.edgeF2[e];
      const b1 = f1 * 9; const b2 = f2 * 9;
      let bestL = -1; let oa = -1; let ob = -1;
      for (let k = 0; k < 3; k += 1) {
        const ca = b1 + k * 3; const cb = b1 + ((k + 1) % 3) * 3;
        let ha = false; let hb = false;
        for (let m = 0; m < 3; m += 1) {
          const oc = b2 + m * 3;
          if (!ha && same(ca, oc)) ha = true;
          if (!hb && same(cb, oc)) hb = true;
        }
        if (ha && hb) { oa = ca; ob = cb; bestL = Math.hypot(xyz[cb] - xyz[ca], xyz[cb + 1] - xyz[ca + 1], xyz[cb + 2] - xyz[ca + 2]); break; }
      }
      if (bestL < 0) { unresolved += 1; eLen[e] = NaN; eB1[e] = NaN; eB2[e] = NaN; continue; }
      eLen[e] = bestL;
      eB1[e] = bestL > 0 ? (2 * area[f1]) / bestL : 0;
      eB2[e] = bestL > 0 ? (2 * area[f2]) / bestL : 0;
      if (bestL > 0) { eDx[e] = (xyz[ob] - xyz[oa]) / bestL; eDy[e] = (xyz[ob + 1] - xyz[oa + 1]) / bestL; eDz[e] = (xyz[ob + 2] - xyz[oa + 2]) / bestL; }
    }
    log(`   shared-edge recovery: ${unresolved} of ${nE.toLocaleString()} interior edges unresolved (${pct(unresolved, nE)}%)   ${el()}`);
    J.edgeUnresolved = unresolved;
    const lens: number[] = []; const bands: number[] = [];
    const STR0 = Math.max(1, Math.floor(nE / 200000));
    for (let e = 0; e < nE; e += STR0) { if (Number.isFinite(eLen[e])) { lens.push(eLen[e]); bands.push(Math.min(eB1[e], eB2[e])); } }
    lens.sort((p, q) => p - q); bands.sort((p, q) => p - q);
    const qq = (a: number[], f: number): number => a[Math.min(a.length - 1, Math.floor(f * a.length))];
    log(`   GEOMETRY (1-in-${STR0} sample, ${lens.length.toLocaleString()} edges): shared-edge LENGTH mm  p05 ${qq(lens, 0.05).toExponential(3)}  p50 ${qq(lens, 0.5).toExponential(3)}  p95 ${qq(lens, 0.95).toExponential(3)}`);
    log(`                                          narrower BAND WIDTH mm  p05 ${qq(bands, 0.05).toExponential(3)}  p50 ${qq(bands, 0.5).toExponential(3)}  p95 ${qq(bands, 0.95).toExponential(3)}`);
    J.geom = { lenP50: qq(lens, 0.5), bandP50: qq(bands, 0.5), bandP05: qq(bands, 0.05) };
  }

  // ── ORBIT. THE JOINT CONDITION, EVALUATED PER DIRECTION. ────────────────────────────────────────
  // The first cut of this tool maximised contrast FIRST and applied the resolvability gate to the
  // argmax direction. That is wrong and its own control caught it: Weber contrast is maximised at the
  // GRAZING LIMB, where the projected band width goes to zero, so P(resolvable at the argmax) came out
  // 0.1-0.3% in every dihedral bin and the whole visible class read as empty. The condition is a
  // CONJUNCTION AT ONE DIRECTION, so the maximum must be taken over the directions that already satisfy
  // the width gate. One running maximum per w_min.
  //
  // PROJECTED BAND WIDTH, exact. With {n, eHat, vHat} orthonormal (vHat across the crease in the facet
  // plane), d = lam*n + (eHat.d)*eHat + (vHat.d)*vHat, so the image-plane length of vHat is
  // sqrt(1 - (vHat.d)^2) = sqrt(lam^2 + (eHat.d)^2). BOTH sides must clear w_min: a step needs two bands.
  const AMB = envF('PF_S117BD_AMBIENT', 0.12);
  const dirs: V3[] = [];
  for (const elDeg of ELS) {
    for (let i = 0; i < NAZ; i += 1) {
      const az = (i / NAZ) * 2 * Math.PI; const e = elDeg / DEG;
      dirs.push([Math.cos(e) * Math.cos(az), Math.cos(e) * Math.sin(az), Math.sin(e)]);
    }
  }
  const CSTARS = [0.005, 0.01, 0.02, 0.05];
  const WMINS = [0.025, 0.0873, 0.4];   // SLA XY / eye 1 arcmin @300mm / FDM nozzle
  const WNAMES = ['SLA 25um', 'EYE 87.3um', 'FDM 400um'];
  const NW = WMINS.length;
  const eCmax = new Float32Array(nE);            // unconditional max contrast (no width gate)
  const eCmaxW = new Float32Array(nE * NW);      // max contrast among directions clearing w_min[j]
  {
    for (let e = 0; e < nE; e += 1) {
      const f1 = D.edgeF1[e]; const f2 = D.edgeF2[e];
      const a1x = nx[f1]; const a1y = ny[f1]; const a1z = nz[f1];
      const a2x = nx[f2]; const a2y = ny[f2]; const a2z = nz[f2];
      const b1 = eB1[e]; const b2 = eB2[e];
      const ex = eDx[e]; const ey = eDy[e]; const ez = eDz[e];
      let best = 0;
      const bw = [0, 0, 0];
      for (let k = 0; k < dirs.length; k += 1) {
        const d = dirs[k];
        const l1 = a1x * d[0] + a1y * d[1] + a1z * d[2];
        if (!(l1 > 0)) continue;
        const l2 = a2x * d[0] + a2y * d[1] + a2z * d[2];
        if (!(l2 > 0)) continue;
        const L1 = AMB + (1 - AMB) * l1; const L2 = AMB + (1 - AMB) * l2;
        const c = Math.abs(L1 - L2) / (0.5 * (L1 + L2));
        if (c > best) best = c;
        const ed = ex * d[0] + ey * d[1] + ez * d[2];
        const w1 = b1 * Math.sqrt(l1 * l1 + ed * ed);
        const w2 = b2 * Math.sqrt(l2 * l2 + ed * ed);
        const w = w1 < w2 ? w1 : w2;
        for (let j = 0; j < NW; j += 1) if (w >= WMINS[j] && c > bw[j]) bw[j] = c;
      }
      eCmax[e] = best;
      for (let j = 0; j < NW; j += 1) eCmaxW[e * NW + j] = bw[j];
    }
    log(`   orbit: ${dirs.length} headlight directions (${NAZ} az x ${ELS.length} el), ambient ${AMB}   ${el()}`);
  }

  log('');
  log('══ (b) VISIBILITY — THE MEASUREMENT THE CAMPAIGN HAS NEVER MADE ══════════════════════════');
  log('   Weber contrast of the flat-shading step across each interior edge, maximised over the orbit');
  log('   RESTRICTED to directions where BOTH bands project at least w_min wide. C* and w_min both swept.');
  log('   No occlusion test => every figure is an UPPER bound on what is actually seen.');
  log('');
  log('   C*      w_min          facets carrying a visible crease        AREA mm2      %MESH     MAXdih');
  const visIdx: Map<string, Uint8Array> = new Map();
  for (const cs of CSTARS) {
    for (let wi = 0; wi < NW; wi += 1) {
      const flag = new Uint8Array(nTri);
      for (let e = 0; e < nE; e += 1) {
        if (!(eCmaxW[e * NW + wi] >= cs)) continue;
        flag[D.edgeF1[e]] = 1; flag[D.edgeF2[e]] = 1;
      }
      const g = mk();
      for (let f = 0; f < nTri; f += 1) if (flag[f] === 1) add(g, area[f], dihDeg[f]);
      log(`   ${cs.toFixed(3)}   ${WNAMES[wi].padEnd(12)}   ${g.n.toLocaleString().padStart(14)}   ${g.area.toFixed(4).padStart(16)}   ${pct(g.area, areaTot).padStart(8)}%   ${g.max.toFixed(2).padStart(7)}`);
      visIdx.set(`${cs}|${wi}`, flag);
    }
  }
  const VIS = visIdx.get('0.01|1') as Uint8Array;   // the canonical bar: 1% Weber, eye at 300 mm
  let visArea = 0; let visN = 0;
  for (let f = 0; f < nTri; f += 1) if (VIS[f] === 1) { visN += 1; visArea += area[f]; }

  // ── WHAT BAR WOULD SELECT THE VISIBLE CLASS? the dihedral distribution INSIDE it. ────────────────
  log('');
  log('── (b1) THE DIHEDRAL DISTRIBUTION OF THE VISIBLE CLASS (canonical C*=0.01, EYE 87.3 um) ──');
  log('   If a single dihedral bar could stand in for visibility, this distribution would be narrow and');
  log('   its lower tail would BE the bar. Read the p01: that is the bar you would have to set to keep');
  log('   99% of what is actually visible.');
  {
    const dv: number[] = [];
    for (let e = 0; e < nE; e += 1) if (eCmaxW[e * NW + 1] >= 0.01) dv.push(D.edgeAngRad[e] * DEG);
    dv.sort((p, q) => p - q);
    const q = (f: number): number => (dv.length > 0 ? dv[Math.min(dv.length - 1, Math.floor(f * dv.length))] : NaN);
    log(`   visible EDGES ${dv.length.toLocaleString()} of ${nE.toLocaleString()} interior (${pct(dv.length, nE)}%)`);
    log(`   their dihedral deg:  min ${q(0).toExponential(3)}   p01 ${q(0.01).toExponential(3)}   p10 ${q(0.10).toExponential(3)}   p50 ${q(0.5).toFixed(4)}   p90 ${q(0.9).toFixed(4)}   max ${q(0.9999).toFixed(4)}`);
    J.visDih = { n: dv.length, min: q(0), p01: q(0.01), p10: q(0.1), p50: q(0.5), p90: q(0.9) };
  }

  // ── the KNEE: at what dihedral does visibility start to bite? ────────────────────────────────────
  log('');
  log('── (b2) THE VISIBILITY KNEE — P(visible | dihedral bin), per interior EDGE ──');
  log('   canonical bar C* = 0.01 (1% Weber), w_min = 0.0873 mm (1 arcmin at 300 mm)');
  log('     dihedral bin deg        edges     P(visible)   P(resolvable)   P(C>=1% anywhere)   medianC');
  const BINS = [0, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 45, 90, 135, 163, 175, 180];
  const knee: Array<Record<string, number>> = [];
  for (let b = 0; b + 1 < BINS.length; b += 1) {
    const lo = BINS[b]; const hi = BINS[b + 1];
    let n = 0; let nv = 0; let nr = 0; let nc = 0; const cs: number[] = [];
    for (let e = 0; e < nE; e += 1) {
      const dg = D.edgeAngRad[e] * DEG;
      if (!(dg >= lo && dg < hi)) continue;
      n += 1;
      if (eCmax[e] >= 0.01) nc += 1;
      if (eCmaxW[e * NW + 1] > 0) nr += 1;
      if (eCmaxW[e * NW + 1] >= 0.01) nv += 1;
      if (cs.length < 200000) cs.push(eCmax[e]);
    }
    cs.sort((p, q) => p - q);
    const med = cs.length > 0 ? cs[Math.floor(cs.length / 2)] : NaN;
    log(`   ${lo.toFixed(2).padStart(7)} .. ${hi.toFixed(2).padStart(7)}   ${n.toLocaleString().padStart(11)}   ${(n > 0 ? ((nv / n) * 100).toFixed(2) : '  n/a').padStart(9)}%   ${(n > 0 ? ((nr / n) * 100).toFixed(2) : '  n/a').padStart(11)}%   ${(n > 0 ? ((nc / n) * 100).toFixed(2) : '  n/a').padStart(15)}%   ${Number.isFinite(med) ? med.toExponential(2) : '  n/a'}`);
    knee.push({ lo, hi, n, nv, nr, nc, medC: med });
  }
  J.knee = knee;

  // ── H1 and H4 at a FIXED CAMERA. One picture, one light. ────────────────────────────────────────
  const CAMS: Array<{ name: string; d: V3 }> = [
    { name: 'az000 el14', d: [Math.cos(14 / DEG), 0, Math.sin(14 / DEG)] },
    { name: 'az090 el14', d: [0, Math.cos(14 / DEG), Math.sin(14 / DEG)] },
    { name: 'az045 el00', d: [Math.SQRT1_2, Math.SQRT1_2, 0] },
  ];
  log('');
  log('── (b3) H1 — d*(C*): THE DIHEDRAL AT WHICH THE SHADING STEP REACHES THE JND ──');
  log('   Closed form: d = 2*asin( C*(a+(1-a)*lamMean) / (2*(1-a)*|cos psi|) ).');
  log('   |cos psi| and lamMean are measured AT A FIXED CAMERA over the pairs that camera sees, so they');
  log('   are the mesh\'s own numbers rather than a best case chosen per edge.');
  {
    const cps: number[] = []; const lms: number[] = [];
    const STR = Math.max(1, Math.floor(nE / 300000));
    const d = CAMS[0].d;
    for (let e = 0; e < nE; e += STR) {
      const f1 = D.edgeF1[e]; const f2 = D.edgeF2[e];
      const l1 = nx[f1] * d[0] + ny[f1] * d[1] + nz[f1] * d[2];
      const l2 = nx[f2] * d[0] + ny[f2] * d[1] + nz[f2] * d[2];
      if (!(l1 > 0) || !(l2 > 0)) continue;
      const ux = nx[f1] - nx[f2]; const uy = ny[f1] - ny[f2]; const uz = nz[f1] - nz[f2];
      const ul = Math.hypot(ux, uy, uz);
      if (!(ul > 0)) continue;
      cps.push(Math.abs((ux * d[0] + uy * d[1] + uz * d[2]) / ul));
      lms.push((l1 + l2) / 2);
    }
    cps.sort((p, q) => p - q); lms.sort((p, q) => p - q);
    const q = (a: number[], f: number): number => (a.length > 0 ? a[Math.min(a.length - 1, Math.floor(f * a.length))] : NaN);
    log(`   camera ${CAMS[0].name}, 1-in-${STR} sample, ${cps.length.toLocaleString()} both-front-facing pairs:`);
    log(`      |cos psi|  p05 ${q(cps, 0.05).toFixed(4)}   p50 ${q(cps, 0.5).toFixed(4)}   p95 ${q(cps, 0.95).toFixed(4)}`);
    log(`      lamMean    p05 ${q(lms, 0.05).toFixed(4)}   p50 ${q(lms, 0.5).toFixed(4)}   p95 ${q(lms, 0.95).toFixed(4)}`);
    log('');
    log('        C*      lamMean   |cos psi|      d*(deg)     x smaller than the inherited 45 deg bar');
    const rows: Array<Record<string, number>> = [];
    const lmSet: Array<[string, number]> = [['p05', q(lms, 0.05)], ['p50', q(lms, 0.5)], ['p95', q(lms, 0.95)]];
    const cpSet: Array<[string, number]> = [['p50', q(cps, 0.5)], ['p05', q(cps, 0.05)], ['best', 1.0]];
    for (const cs of CSTARS) {
      for (const [, lm] of lmSet) {
        for (const [, cp] of cpSet) {
          const dd = dihedralForContrast(cs, AMB, lm, cp) * DEG;
          log(`     ${cs.toFixed(3)}      ${lm.toFixed(2)}      ${cp.toFixed(4)}    ${dd.toFixed(4).padStart(9)}     ${(45 / dd).toFixed(1).padStart(8)}x`);
          rows.push({ cs, lm, cp, dstar: dd, ratio: 45 / dd });
        }
      }
    }
    J.dstar = rows;
    J.cosPsi = { p05: q(cps, 0.05), p50: q(cps, 0.5), p95: q(cps, 0.95) };
    J.lamMean = { p05: q(lms, 0.05), p50: q(lms, 0.5), p95: q(lms, 0.95) };
  }

  log('');
  log('── (b4) H4 — AT A FIXED DIHEDRAL AND A FIXED CAMERA, HOW FAR DOES THE CONTRAST SPREAD? ──');
  log('   If this ratio is large, the dihedral does not determine visibility and no dihedral number is a');
  log('   visibility bar. Camera az000 el14 (the campaign\'s own render camera).');
  log('     dihedral band deg     pairs seen        C p01        p50        p99      p99/p01   frac>=1%');
  const h4: Array<Record<string, number>> = [];
  {
    const d = CAMS[0].d;
    for (const [lo, hi] of [[0.9, 1.1], [1.9, 2.1], [4.5, 5.5], [19, 21], [44, 46], [89, 91], [159, 161]] as Array<[number, number]>) {
      const v: number[] = []; let over = 0;
      for (let e = 0; e < nE; e += 1) {
        const dg = D.edgeAngRad[e] * DEG; if (!(dg >= lo && dg < hi)) continue;
        const f1 = D.edgeF1[e]; const f2 = D.edgeF2[e];
        const c = contrastOfPair([nx[f1], ny[f1], nz[f1]], [nx[f2], ny[f2], nz[f2]], d, AMB);
        if (!Number.isFinite(c)) continue;
        v.push(c); if (c >= 0.01) over += 1;
      }
      if (v.length < 20) { log(`   ${lo.toFixed(1)} .. ${hi.toFixed(1)}         ${v.length}   (too few to quantile)`); continue; }
      v.sort((p, q) => p - q);
      const qq = (f: number): number => v[Math.min(v.length - 1, Math.floor(f * v.length))];
      log(`   ${lo.toFixed(1).padStart(6)} .. ${hi.toFixed(1).padStart(6)}   ${v.length.toLocaleString().padStart(12)}   ${qq(0.01).toExponential(3)}   ${qq(0.5).toExponential(3)}   ${qq(0.99).toExponential(3)}   ${(qq(0.99) / Math.max(qq(0.01), 1e-12)).toFixed(1).padStart(8)}x   ${((over / v.length) * 100).toFixed(2).padStart(7)}%`);
      h4.push({ lo, hi, n: v.length, p01: qq(0.01), p50: qq(0.5), p99: qq(0.99), fracOver: over / v.length });
    }
  }
  J.h4 = h4;

  // ══ (a) EXPORT / TOPOLOGY ══════════════════════════════════════════════════════════════════════
  log('');
  log('══ (a) EXPORT / TOPOLOGY CORRECTNESS — where sampling is irrelevant ═══════════════════════');
  // f32 plane-intersection determinacy floor. STL stores f32; a slicer computes signed vertex-plane
  // distances in f32 or f64 FROM f32 coordinates. The sign is only determinate when the altitude is
  // many ulps of the coordinate magnitude.
  let zmax = 0;
  for (let i = 0; i < nTri * 9; i += 3) { const z = Math.abs(xyz[i + 2]); if (z > zmax) zmax = z; }
  const f32 = new Float32Array(1); f32[0] = zmax; const nxt = new Float32Array(1); nxt[0] = zmax * (1 + 2 ** -23);
  const ulp = Math.abs(nxt[0] - f32[0]) || 2 ** -23 * zmax;
  const minAlt = new Float64Array(nTri);
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const e0 = Math.hypot(xyz[o + 3] - xyz[o], xyz[o + 4] - xyz[o + 1], xyz[o + 5] - xyz[o + 2]);
    const e1 = Math.hypot(xyz[o + 6] - xyz[o + 3], xyz[o + 7] - xyz[o + 4], xyz[o + 8] - xyz[o + 5]);
    const e2 = Math.hypot(xyz[o] - xyz[o + 6], xyz[o + 1] - xyz[o + 7], xyz[o + 2] - xyz[o + 8]);
    const L = Math.max(e0, e1, e2);
    minAlt[t] = L > 0 ? (2 * area[t]) / L : 0;
  }
  log(`   f32 coordinate ulp at |z|max ${zmax.toFixed(3)} mm: ${ulp.toExponential(4)} mm`);
  log('     determinacy floor      facets       AREA mm2     %MESH      MAXdih deg');
  const detRows: Array<Record<string, number>> = [];
  for (const k of [1, 4, 16, 64, 256]) {
    const thr = k * ulp; const g = mk();
    for (let t = 0; t < nTri; t += 1) if (minAlt[t] < thr) add(g, area[t], dihDeg[t]);
    log(`   minAlt < ${String(k).padStart(4)} ulp (${thr.toExponential(2)} mm)   ${g.n.toLocaleString().padStart(9)}   ${g.area.toExponential(4).padStart(12)}   ${pct(g.area, areaTot).padStart(8)}%   ${g.max.toFixed(2).padStart(8)}`);
    detRows.push({ k, thr, n: g.n, area: g.area, max: g.max });
  }
  J.determinacy = { zmax, ulp, rows: detRows };

  // export-defect flag: over CEIL, or on a non-manifold/inconsistent edge, or below 16 ulp altitude.
  const EXP = new Uint8Array(nTri);
  const DET_THR = 16 * ulp;
  let ceilN = 0; let ceilA = 0;
  if (Number.isFinite(CEIL_DEG)) {
    for (let f = 0; f < nTri; f += 1) if (dihDeg[f] > CEIL_DEG) { EXP[f] = 1; ceilN += 1; ceilA += area[f]; }
  }
  let detN = 0; let detA = 0;
  for (let f = 0; f < nTri; f += 1) if (minAlt[f] < DET_THR) { EXP[f] = 1; detN += 1; detA += area[f]; }
  let expN = 0; let expA = 0; let expMax = 0;
  for (let f = 0; f < nTri; f += 1) if (EXP[f] === 1) { expN += 1; expA += area[f]; if (dihDeg[f] > expMax) expMax = dihDeg[f]; }
  log('');
  log(`   OVER ANALYTIC CEIL ${Number.isFinite(CEIL_DEG) ? CEIL_DEG.toFixed(3) : 'n/a'} deg (the surface CANNOT produce it):`);
  log(`      COUNT ${ceilN.toLocaleString()}   AREA ${ceilA.toFixed(4)} mm2 = ${pct(ceilA, areaTot)}% OF MESH`);
  log(`   BELOW 16-ulp DETERMINACY altitude (${DET_THR.toExponential(3)} mm):`);
  log(`      COUNT ${detN.toLocaleString()}   AREA ${detA.toExponential(4)} mm2 = ${pct(detA, areaTot)}% OF MESH`);
  log(`   NON-MANIFOLD edges ${D.nonManifoldEdges}   INCONSISTENT-WINDING edges ${D.inconsistentEdges}   BOUNDARY edges ${D.boundaryEdges}`);
  log(`   UNION "export defect": COUNT ${expN.toLocaleString()}   AREA ${expA.toFixed(4)} mm2 = ${pct(expA, areaTot)}% OF MESH   MAXdih ${expMax.toFixed(2)} deg`);
  J.exportDefect = { ceilN, ceilA, detN, detA, expN, expA, detThr: DET_THR };

  // ══ (c) FIDELITY ══════════════════════════════════════════════════════════════════════════════
  let ND: Float64Array | null = null; let R3: Float64Array | null = null;
  const readF64 = (p: string): Float64Array | null => {
    if (p === '' || !existsSync(p)) return null;
    const b = readFileSync(p);
    if (b.length !== nTri * 8) { log(`   *** scalar ${p} has ${b.length / 8} entries, mesh has ${nTri} — IGNORED ***`); return null; }
    return new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  };
  ND = readF64(ND_PATH); R3 = readF64(R3_PATH);
  log('');
  log('══ (c) FIDELITY — read from the EXHAUSTIVE S116/S117 per-facet dumps (scars 1-3 already swept) ══');
  const POSLABEL = envS('PF_S117BD_POSLABEL', 'R3 PERPENDICULAR (honest)');
  log(`   normDeg dump ${ND === null ? 'ABSENT' : ND_PATH}`);
  log(`   position dump ${R3 === null ? 'ABSENT' : `${R3_PATH} (${R3_UNITS})`}`);
  log(`   position ruler: ${POSLABEL}`);
  J.posLabel = POSLABEL;

  // ══ CROSS-TABS: precision and recall of the dihedral bar against each criterion ════════════════
  const BARS = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 150, 163, 168, 175, 179.5];
  const R3SCALE = R3_UNITS === 'um' ? 1e-3 : 1;
  const fidPos = new Uint8Array(nTri);
  const fidNd = new Uint8Array(nTri);
  let fidPosA = 0; let fidNdA = 0;
  if (R3 !== null) for (let f = 0; f < nTri; f += 1) if (R3[f] * R3SCALE > 0.01) { fidPos[f] = 1; fidPosA += area[f]; }
  if (ND !== null) for (let f = 0; f < nTri; f += 1) if (ND[f] > 5) { fidNd[f] = 1; fidNdA += area[f]; }

  log('');
  log('══ THE LADDER: WHAT EACH BAR SELECTS, AND WHAT IT CATCHES AND MISSES (AREA-WEIGHTED) ═══════');
  log('   PRECISION = of the AREA the bar selects, the share that is really <criterion>.');
  log('   RECALL    = of the criterion\'s OWN total AREA, the share the bar selects.');
  log('');
  log('   bar deg     selected      %MESH  |  VISIBLE prec/rec  |  EXPORT prec/rec  |  POS>0.01 prec/rec  |  normDeg>5 prec/rec');
  const ladder: Array<Record<string, number>> = [];
  for (const B of BARS) {
    let selA = 0; let selN = 0; let vA = 0; let eA = 0; let pA = 0; let ndA = 0;
    for (let f = 0; f < nTri; f += 1) {
      if (!(dihDeg[f] > B)) continue;
      selN += 1; selA += area[f];
      if (VIS[f] === 1) vA += area[f];
      if (EXP[f] === 1) eA += area[f];
      if (fidPos[f] === 1) pA += area[f];
      if (fidNd[f] === 1) ndA += area[f];
    }
    const p = (x: number, y: number): string => (y > 0 ? ((x / y) * 100).toFixed(1) : '  n/a');
    log(`   ${B.toFixed(1).padStart(7)}  ${selN.toLocaleString().padStart(11)}  ${pct(selA, areaTot).padStart(9)}%  |  ${p(vA, selA).padStart(5)}% ${p(vA, visArea).padStart(5)}%  |  ${p(eA, selA).padStart(5)}% ${p(eA, expA).padStart(5)}%  |  ${p(pA, selA).padStart(5)}% ${p(pA, fidPosA).padStart(5)}%  |  ${p(ndA, selA).padStart(5)}% ${p(ndA, fidNdA).padStart(5)}%`);
    ladder.push({ bar: B, selN, selA, visA: vA, expA: eA, posA: pA, ndA });
  }
  log('');
  log(`   criterion totals (AREA, mm2 and %MESH):`);
  log(`      VISIBLE  (C*=0.01, w_min=0.0873 mm)   ${visN.toLocaleString().padStart(11)} facets   ${visArea.toFixed(4).padStart(12)}   ${pct(visArea, areaTot)}%`);
  log(`      EXPORT DEFECT (CEIL | 16-ulp | topo)  ${expN.toLocaleString().padStart(11)} facets   ${expA.toFixed(4).padStart(12)}   ${pct(expA, areaTot)}%`);
  if (R3 !== null) log(`      POSITION > 0.01 mm                    ${'-'.padStart(11)}          ${fidPosA.toFixed(4).padStart(12)}   ${pct(fidPosA, areaTot)}%`);
  if (ND !== null) log(`      normDeg > 5 deg                       ${'-'.padStart(11)}          ${fidNdA.toFixed(4).padStart(12)}   ${pct(fidNdA, areaTot)}%`);
  J.ladder = ladder;
  J.totals = { visN, visArea, expN, expA, fidPosA, fidNdA, areaTot, nTri };

  // ── per-facet scalar dumps for research/tools/s116Render.ts (validated single-sided rasteriser). ──
  // SCS = the max Weber contrast, in PERCENT, of any crease this facet carries that is also resolvable
  // at the eye's 87.3 um. This is the replacement quantity; dumping it lets the picture be checked
  // against the number rather than asserted.
  {
    const scs = new Float64Array(nTri);
    for (let e = 0; e < nE; e += 1) {
      const c = eCmaxW[e * NW + 1] * 100;
      const f1 = D.edgeF1[e]; const f2 = D.edgeF2[e];
      if (c > scs[f1]) scs[f1] = c;
      if (c > scs[f2]) scs[f2] = c;
    }
    writeFileSync(`${OUTDIR}/S117_SCS_${TAG}.f64`, Buffer.from(scs.buffer));
    const v = Array.from(scs).sort((p, q) => p - q);
    const q = (f: number): number => v[Math.min(v.length - 1, Math.floor(f * v.length))];
    log('');
    log(`── SCS per-facet scalar (max resolvable Weber contrast, %) -> ${OUTDIR}/S117_SCS_${TAG}.f64 ──`);
    log(`   p05 ${q(0.05).toFixed(3)}   p50 ${q(0.5).toFixed(3)}   p95 ${q(0.95).toFixed(3)}   MAX ${q(1).toFixed(3)} %`);
    J.scs = { p05: q(0.05), p50: q(0.5), p95: q(0.95), max: q(1) };
  }

  // ══ PHASE R — THE PIXEL CENSUS. The prediction, checked against actual rendered pixels of THIS mesh.
  // V2 proved the kernel reproduces the rasteriser's shading law on prisms. This asks the observable
  // question directly: OF THE ADJACENT PIXEL PAIRS INSIDE THE PAINTED SILHOUETTE, WHAT SHARE CARRY A
  // SUPRA-JND LUMINANCE STEP? That is what "you can see the faceting" means, with no model in between.
  // Two-sided calibration in the same units and the same mm/pixel: a 3600-gon prism (0.1 deg, smooth to
  // the eye) must come out near zero and a 12-gon (30 deg) must come out high.
  log('');
  log('══ PHASE R — PIXEL CENSUS: supra-JND steps between ADJACENT PIXELS, measured on the image ═════');
  {
    const pixCensus = (rgb: Uint8Array, w: number, h: number, y0: number): { pairs: number; over: number; p50: number; p99: number; max: number } => {
      const vals: number[] = []; let pairs = 0; let over = 0; let max = 0;
      const clay = (i: number): number => {
        const r = rgb[i * 3]; const g = rgb[i * 3 + 1]; const b = rgb[i * 3 + 2];
        return (r > g && g > b) ? r : -1;   // clay is r>g>b; background gradient is r<g<b; overlay is flat grey
      };
      for (let y = y0; y < h; y += 1) {
        for (let x = 0; x + 1 < w; x += 1) {
          const a = clay(y * w + x); const b2 = clay(y * w + x + 1);
          if (a < 0 || b2 < 0) continue;
          pairs += 1;
          const c = Math.abs(a - b2) / (0.5 * (a + b2));
          if (c >= 0.01) over += 1;
          if (c > max) max = c;
          if (vals.length < 400000) vals.push(c);
        }
      }
      vals.sort((p, q) => p - q);
      const q = (f: number): number => (vals.length > 0 ? vals[Math.min(vals.length - 1, Math.floor(f * vals.length))] : NaN);
      return { pairs, over, p50: q(0.5), p99: q(0.99), max };
    };
    const W = 1100; const Hpx = 1100; const HALF = envF('PF_S117BD_RHALF', 1.5);
    const thDeg = envF('PF_S117BD_RTH', 15); const zMm = envF('PF_S117BD_RZ', 80);
    // camera looks radially inward at (thDeg, zMm); orthographic window 2*HALF mm tall.
    let rr = 0; let nrr = 0;
    for (let t = 0; t < nTri; t += 1) {
      const o = t * 9; const gz = (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3;
      if (Math.abs(gz - zMm) > 2) continue;
      const gx = (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3; const gy = (xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3;
      rr += Math.hypot(gx, gy); nrr += 1;
    }
    const rMean = nrr > 0 ? rr / nrr : 45;
    const tgt: [number, number, number] = [rMean * Math.cos(thDeg / DEG), rMean * Math.sin(thDeg / DEG), zMm];
    const mmPerPx = (2 * HALF) / Hpx;
    // THE INSTRUMENT'S OWN FLOOR, STATED BEFORE ITS NUMBERS. The renderer writes 8-bit greys, so the
    // smallest representable step at mid-grey 128 is 1/128 = 0.78% Weber — just UNDER the 1% JND. The
    // pixel census is therefore quantisation-limited at almost exactly the threshold it is testing:
    // it can confirm a supra-JND step but cannot resolve the sub-JND population at all.
    log(`   INSTRUMENT FLOOR: 8-bit output, smallest representable Weber step at mid-grey = 1/128 = 0.78%.`);
    log(`   The census can see supra-JND steps and NOTHING BELOW; it is a floor, not a two-sided ruler.`);
    log(`   window ${(2 * HALF).toFixed(2)}x${(2 * HALF).toFixed(2)} mm, ${W}x${Hpx} px => ${(mmPerPx * 1000).toFixed(1)} um/pixel`);
    // TWO CAMERAS. Normal incidence (camera azimuth == patch azimuth) is where the shading gradient of a
    // body of revolution VANISHES; oblique is where it is largest. The first cut of this census used
    // normal incidence for the controls and the CONTROL FIRED TWICE: first with a 12-gon whose single
    // facet filled the window, then with 3600/720-gons whose entire 3 mm window fell inside ONE 8-bit
    // code (at R=46.8 mm a 3 mm window subtends 1.84 deg, so lam varies by 5e-4 and 214*dsh = 0.08
    // code values). Both were mis-specified controls, not instrument failures — but a control that
    // cannot separate 0.1 deg from 0.5 deg proves nothing, so the calibration is run OBLIQUE as well.
    const OFF = envF('PF_S117BD_ROFF', 70);
    const arms: Array<{ name: string; xyz: Float64Array; nTri: number; area: Float64Array; az: number }> = [
      { name: `${TAG} normal incidence`, xyz, nTri, area, az: thDeg },
      { name: `${TAG} oblique ${OFF} deg`, xyz, nTri, area, az: thDeg + OFF },
    ];
    for (const [N, nm] of [[3600, 'CONTROL SMOOTH  3600-gon 0.100 deg, 81.7 um bands'], [720, 'CONTROL FACETED  720-gon 0.500 deg, 408 um bands']] as Array<[number, string]>) {
      const P = buildCylinder(rMean, zMm - 6, zMm + 6, N, 3, false);
      arms.push({ name: `${nm} oblique ${OFF} deg`, xyz: P.xyz, nTri: P.nTri, area: facetAreas(P.xyz, P.nTri), az: thDeg + OFF });
    }
    const got: number[] = [];
    for (const a of arms) {
      const R = renderView({ xyz: a.xyz, nTri: a.nTri, area: a.area, W, Hpx, ss: 3, mode: 'clay', azDeg: a.az, elDeg: 0, halfHmm: HALF, target: tgt, caption: `PHASE R ${a.name}` });
      const c = pixCensus(R.rgb, W, Hpx, Math.floor(Hpx * 0.2));
      log(`   ${a.name.padEnd(52)} pairs ${c.pairs.toLocaleString().padStart(9)}  SUPRA-JND ${pct(c.over, c.pairs).padStart(8)}%  p99 ${c.p99.toExponential(3)}  MAX ${c.max.toExponential(3)}`);
      got.push(c.over / Math.max(1, c.pairs));
      if (a.az === thDeg + OFF && a.name.startsWith(TAG)) J.pixCensus = { ...c, mmPerPx };
    }
    const sep = got[3] / Math.max(got[2], 1e-12);   // FACETED 0.5 deg vs SMOOTH 0.1 deg, same camera
    log('');
    log(`   *** CONTROL: the 0.500 deg arm reads ${sep.toFixed(3)}x the 0.100 deg arm. A 5x change in dihedral`);
    log(`       must move a visibility instrument. ${sep >= 1.5 ? 'It does — the census discriminates.' : 'IT DOES NOT — THE PIXEL CENSUS IS REFUTED BY ITS OWN CONTROL.'}`);
    if (sep < 1.5) {
      log('       CAUSE, and it is arithmetic, not a bug: 1% Weber at mid-grey 128 IS 1.28 code values, so');
      log('       the JND and the 8-bit quantum are the same size. What the census counts is dominated by');
      log('       the QUANTISATION STAIRCASE of the smooth shading gradient, which a smooth cylinder has');
      log('       just as much of as a faceted one. AN 8-BIT RASTERISER CANNOT CALIBRATE A 1% BAR.');
      log('       The measurement must be made in float from the facet normals — which is exactly what the');
      log('       kernel does, and V2 proves the kernel reproduces this renderer\'s shading law EXACTLY');
      log('       (0 code-value error) on fixtures where the steps are large enough to be representable.');
      log(`       => every PHASE R number above is WITHDRAWN as a visibility measurement. The GOTH figure`);
      log('          survives only as "how much of this image is NOT flat", which is not the question.');
    }
    J.pixCensusVerdict = { sep, discriminates: sep >= 1.5 };
  }

  writeFileSync(`${OUTDIR}/S117_BARDERIVE_${TAG}.json`, JSON.stringify(J, null, 1));
  log('');
  log(`json -> ${OUTDIR}/S117_BARDERIVE_${TAG}.json   ${el()}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('╔════════════════════════════════════════════════════════════════════════════════════════╗');
log('║  S117 P5 — RETIRING THE 45 DEG BAR.  s117BarDerive.ts                                  ║');
log('╚════════════════════════════════════════════════════════════════════════════════════════╝');
log('');
if (envF('PF_S117BD_SKIPTEST', 0) !== 1) selfTest();
if (envF('PF_S117BD_ONLYTEST', 0) !== 1) runMesh();
log('DONE');
