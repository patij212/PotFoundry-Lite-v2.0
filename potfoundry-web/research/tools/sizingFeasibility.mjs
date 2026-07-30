// sizingFeasibility.mjs — SIZING-FIELD FEASIBILITY CALCULATOR (STRATA-001 / task R2).
//
//   "For style X at tolerance 0.01 mm, how many triangles does a conforming mesh actually NEED,
//    and is that within the triangle cap?"
//
// Answers it by arithmetic over the analytic surface in seconds per style. The empirical version of this
// question is a ~46 h full-coverage facet-truth audit. This is a FEASIBILITY ESTIMATE, NOT A CERTIFICATE —
// read the ASSUMPTIONS block printed at the end of every run, and the long header in
// research/bridge/_sizingFeasibilityLib.ts.
//
// PHASE 0 MODE (--emit): the same sweep, written out as a PER-CELL ARTIFACT a driver can consume —
//   per (theta,z) cell: target edge length h, the measured decay exponent p, the class (smooth h2 / crease h1 /
//   jump h0), the local surface area, and THE PERSISTENCE VERDICT (does the jump class survive a halving of the
//   probe pitch?). The persistence verdict is the shape-agnostic C0 detector: it routes a cell to the CURTAIN
//   stage instead of to bisection with no per-style flag anywhere. Schema + reader API live in
//   research/bridge/_sizingFieldArtifact.ts.
//
// RUN (from potfoundry-web/):
//   npx tsx research/tools/sizingFeasibility.mjs --selftest
//   npx tsx research/tools/sizingFeasibility.mjs
//   npx tsx research/tools/sizingFeasibility.mjs --styles GothicArches,Voronoi --nu 720 --nv 480 --dirs 8
//   npx tsx research/tools/sizingFeasibility.mjs --json research/exchange/sizingFeas.json
//   npx tsx research/tools/sizingFeasibility.mjs --emit research/exchange/sizingFeas/cells --nu 240 --nv 160
//
// FLAGS
//   --styles a,b,c   comma list (default: the R2 roster)
//   --tol   mm       chord tolerance                      (default 0.01)
//   --nu --nv        integration grid                     (default 360 x 240)
//   --dirs N         tangent directions per sample        (default 6)
//   --cap N          triangle cap to compare against      (default 2500000 = PF_CB_TRICAP)
//   --margin mm      exclude this z band at each end      (default 0)
//   --hmin --hmax mm edge-length solve bracket            (default 2e-4 .. 4)
//   --json PATH      also write the raw result as JSON
//   --converge       ALSO run each style at 2x the grid and print how every number moved (costs ~4x)
//   --persist        compute the per-cell C0 PERSISTENCE VERDICT (implied by --emit; ~3% cost)
//   --emit DIR       write the PHASE-0 per-cell artifact (<style>.cells.json + .cells.bin) to DIR.
//                    Implies --persist. Also runs the 2x-grid convergence check unless --noconv.
//   --noconv         skip the 2x-grid convergence check under --emit (leaves gridConverged: null)
//   --convmul N      grid multiplier for that check       (default 2)
//   --read PATH      inspect emitted artifacts THROUGH the reader API (a dir, or one <style>.cells.json) and
//                    exit. This is the worked example a driver author copies: verify provenance, then query.
//   --selftest       run the closed-form validation only and exit
//
// tsx is required (this .mjs imports the TypeScript lib + the style registry directly).

import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildRadiusFn } from '../bridge/runStyle.ts';
import { STYLE_REGISTRY } from '../../src/styles/registry.ts';
import {
  sizingFeasibility, SIZING_CLASSES,
  cylinderRadiusFn, coneRadiusFn, creaseRadiusFn, jumpRadiusFn, rampRadiusFn,
} from '../bridge/_sizingFeasibilityLib.ts';
import {
  SIZING_FIELD_SCHEMA, SizingFieldBuilder, writeSizingFieldArtifact, readSizingFieldArtifact,
  summarize, makeCaveats, convergenceFrom, noConvergence, styleKey,
} from '../bridge/_sizingFieldArtifact.ts';

// ───────────────────────────── canonical harness constants (must match the STRATA driver / auditor) ─────────────
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAU_ = 2 * Math.PI;
const DEFAULT_STYLES = ['GothicArches', 'GeometricStar', 'BasketWeave', 'Voronoi', 'HarmonicRipple', 'SpiralRidges'];

// ───────────────────────────── argv ─────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= argv.length) return dflt;
  return argv[i + 1];
};
const num = (name, dflt) => {
  const v = flag(name, null);
  if (v === null) return dflt;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : dflt;
};
const has = (name) => argv.includes(`--${name}`);

const TOL = num('tol', 0.01);
const NU = Math.round(num('nu', 360));
const NV = Math.round(num('nv', 240));
const DIRS = Math.round(num('dirs', 6));
const CAP = Math.round(num('cap', 2_500_000));
const MARGIN = num('margin', 0);
const HMIN = num('hmin', 2e-4);
const HMAX = num('hmax', 4);
const JSON_OUT = flag('json', null);
const STYLES = flag('styles', null) === null ? DEFAULT_STYLES : flag('styles', '').split(',').map((s) => s.trim()).filter(Boolean);

const EMIT_DIR = flag('emit', null);
const READ_PATH = flag('read', null);
const CONV_MUL = Math.max(2, Math.round(num('convmul', 2)));
const DO_CONV = EMIT_DIR !== null && !has('noconv');
const PERSIST = has('persist') || EMIT_DIR !== null;

const AR = num('ar', 8); // STRATA's PF_CB_AR aspect cap for directed splits
const OPTS = {
  tolMm: TOL, nU: NU, nV: NV, nDirs: DIRS, hMaxMm: HMAX, hMinMm: HMIN, zMarginMm: MARGIN, arCap: AR,
  persist: PERSIST,
};

// ───────────────────────────── registry defaults (the same reader every STRATA probe uses) ─────────────────────
const snakeToCamel = (s) => s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
function registryDefaults(id) {
  const cfg = STYLE_REGISTRY[id];
  if (cfg === undefined) throw new Error(`unknown style '${id}' — not in STYLE_REGISTRY`);
  const out = {};
  for (const g of [cfg.params, cfg.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

// ───────────────────────────── PHASE-0 artifact assembly ─────────────────────────────
// Everything a consumer needs to decide whether this field describes the surface IT is meshing, plus the
// caveats as FIELDS (not log lines) so they travel with the numbers.
function buildArtifact(style, params, res, builder, convergence) {
  return {
    schema: SIZING_FIELD_SCHEMA,
    provenance: {
      style,
      params,
      dims: DIMS,
      radiusFn: 'buildRadiusFn(style, params, dims) — research/bridge/runStyle.ts; the same analytic surface the '
        + 'STRATA driver meshes and the facet-truth auditor judges',
      key: styleKey(style, params, DIMS, res.opts.tolMm),
      node: process.version,
      generatedAt: new Date().toISOString(),
      tool: 'research/tools/sizingFeasibility.mjs --emit',
      lib: 'research/bridge/_sizingFeasibilityLib.ts (sizingFeasibility, persist:true)',
    },
    grid: {
      nU: res.opts.nU,
      nV: res.opts.nV,
      nCells: res.opts.nU * res.opts.nV,
      dThetaRad: TAU_ / res.opts.nU,
      dZmm: DIMS.H / res.opts.nV,
      order: 'row-major, index = iv*nU + iu',
      thetaOfCell: 'theta = 2*PI*(iu+0.5)/nU',
      zOfCell: 'z = H*(iv+0.5)/nV',
    },
    opts: res.opts,
    summary: summarize(res, CAP),
    convergence,
    caveats: makeCaveats(res.opts.nU, res.opts.nV, convergence.converged),
    binary: builder.binaryDesc(`${style}.cells.bin`),
    cells: builder.encodeJsonCells(),
  };
}

const fmtM = (n) => `${(n / 1e6).toFixed(3)}M`;
const fmtUm = (mm) => (mm >= 1 ? `${mm.toFixed(3)}mm` : `${(mm * 1000).toFixed(1)}um`);
const pct = (a, b) => (b > 0 ? `${((100 * a) / b).toFixed(1)}%` : '  -  ');
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

// ───────────────────────────── SELF-TEST: validate the ruler on closed-form surfaces ────────────────────────────
// The lab rule is "validate the ruler before trusting any verdict". Four surfaces with known answers:
//   cylinder  — exact h* = sqrt(8·ε·R), exact area 2πR·H, exact N = 2A/h² = πH/(2ε); must be SMOOTH (p≈2)
//   cone      — exact area π(Rb+Rt)·slant; the NAIVE r·dθ·dz area must UNDER-count it by the slant factor
//   crease    — triangular rib: straddling sag must decay h¹  ⇒ a CREASE band must appear
//   jump      — square rib:     straddling sag must not decay ⇒ a JUMP band must appear, h_str FLOORED
function selftest() {
  const lines = ['', '===== SELF-TEST: closed-form validation of the feasibility ruler ====='];
  let fails = 0;
  const check = (label, got, want, relTol) => {
    const rel = want === 0 ? Math.abs(got) : Math.abs(got - want) / Math.abs(want);
    const ok = rel <= relTol;
    if (!ok) fails += 1;
    lines.push(`  ${ok ? 'PASS' : 'FAIL'}  ${pad(label, 44)} got ${padL(got.toPrecision(6), 14)}  want ${padL(want.toPrecision(6), 14)}  rel ${(100 * rel).toFixed(3)}%`);
  };

  // 1. cylinder R=45, H=120, tol=0.01
  const R = 45;
  const cyl = sizingFeasibility(cylinderRadiusFn(R), H, { ...OPTS, tolMm: 0.01, nU: 180, nV: 60, nDirs: 6 });
  check('cylinder area (exact 2piRH)', cyl.areaMm2, TAU_ * R * H, 1e-4); // secant polygon: -3e-6 rel at this grid
  check('cylinder h* (exact sqrt(8*eps*R))', cyl.worstConfMm, Math.sqrt(8 * 0.01 * R), 0.01);
  check('cylinder N (exact 2A/h* = pi*H/(2*eps))', cyl.nConfIso, (Math.PI * H) / (2 * 0.01), 0.02);
  check('cylinder smooth-class area share', cyl.byClass.smooth.areaMm2 / cyl.areaMm2, 1, 1e-9);

  // 2. cone Rb=40 Rt=50 H=120 — the metric area vs the naive flat-parameter area
  const slant = Math.hypot(H, 50 - 40);
  const coneArea = Math.PI * (40 + 50) * slant;
  const naiveConeArea = TAU_ * 45 * H; // mean radius x height — what r*dtheta*dz gives
  const cone = sizingFeasibility(coneRadiusFn(40, 50, H), H, { ...OPTS, tolMm: 0.01, nU: 180, nV: 60, nDirs: 6 });
  check('cone area, METRIC (exact pi(Rb+Rt)*slant)', cone.areaMm2, coneArea, 1e-4);
  check('cone area, NAIVE r*dth*dz (under-counts)', cone.areaNaiveMm2, naiveConeArea, 1e-6);
  lines.push(`        -> the metric term is worth ${(100 * (coneArea / naiveConeArea - 1)).toFixed(2)}% on a mere 10mm-of-flare cone; on relief styles it is far larger.`);

  // 3. synthetic CREASE (triangular rib) — must produce a crease band, and NO jump band
  const cre = sizingFeasibility(creaseRadiusFn(45, 1.0, 24), H, { ...OPTS, tolMm: 0.01, nU: 720, nV: 24, nDirs: 6, persist: true });
  const creCrease = cre.byClass.crease.samples, creJump = cre.byClass.jump.samples;
  lines.push(`  ${creCrease > 0 && creJump === 0 ? 'PASS' : 'FAIL'}  ${pad('crease surface -> crease band, no jump band', 44)} crease ${creCrease} samples, jump ${creJump} samples`);
  if (!(creCrease > 0 && creJump === 0)) fails += 1;

  // 4. synthetic C0 JUMP (square rib) — must produce a jump band with the right jump height, and a curtain area
  //    that CONVERGES to the exact 48 x 1mm x 120mm as the sub-cell area resolution rises. It converges from
  //    BELOW: the sub-quad that contains the cliff measures the hypotenuse sqrt((arc/K)^2 + J^2) instead of the
  //    two legs, so the deficit is ~ (arc/K)/2 per cliff. That is a real, quantified, shrinking bias -- reported
  //    rather than hidden, because the curtain number is the one this tool exists to make honest.
  const exactCurtain = 48 * 1.0 * H;
  const jmp = sizingFeasibility(jumpRadiusFn(45, 1.0, 24), H, { ...OPTS, tolMm: 0.01, nU: 720, nV: 24, nDirs: 6, hMinMm: 2e-4, persist: true });
  const jmpJump = jmp.byClass.jump.samples;
  lines.push(`  ${jmpJump > 0 ? 'PASS' : 'FAIL'}  ${pad('jump surface -> jump band', 44)} jump ${jmpJump} samples, h_str floored on ${jmp.flooredStraddleSamples}`);
  if (!(jmpJump > 0)) fails += 1;
  check('jump height recovered (built 1.0mm)', jmp.maxJumpMm, 1.0, 0.02);
  const jmp16 = sizingFeasibility(jumpRadiusFn(45, 1.0, 24), H, { ...OPTS, tolMm: 0.01, nU: 720, nV: 24, nDirs: 6, areaSub: 16 });
  const f4 = jmp.curtainAreaMm2 / exactCurtain, f16 = jmp16.curtainAreaMm2 / exactCurtain;
  const conv = f4 > 0.85 && f4 <= 1.02 && f16 > 0.96 && f16 <= 1.02 && f16 > f4;
  if (!conv) fails += 1;
  lines.push(`  ${conv ? 'PASS' : 'FAIL'}  ${pad('curtain area converges (48x1mmx120mm)', 44)} areaSub=4 -> ${(100 * f4).toFixed(1)}% of exact, areaSub=16 -> ${(100 * f16).toFixed(1)}%`);

  // ── 5. THE PERSISTENCE VERDICT (lib §6) — the shape-agnostic C0 detector. Three surfaces, three verdicts:
  //      square rib  (w = 0)          -> jump class MUST SURVIVE the pitch halving   (genuine C0, BasketWeave-like)
  //      linear-ramp rib (w > 0)      -> jump class MUST EVAPORATE                   (steep crease, GothicArches-like)
  //      triangular rib (pure crease) -> must never read jump at either pitch
  //      The ramp width is CONSTRUCTED, not guessed: with rise J and width w the max-over-centres straddling sag
  //      is J/2 for probe L >= 2w and J*L/(4w) below it, so the class flips from jump to crease exactly when the
  //      probe pitch drops through 2w. Putting 2w between the fine probe (span/8) and the coarse one (span/4)
  //      makes the flip land between the two readings. w = 0.11*span does that with ~15% margin on both sides.
  //      A detector that cannot separate these three surfaces cannot be trusted to route a real cell.
//      THE ASSERTION IS ON CURTAIN AREA, NOT ON CELL COUNT, and that is a measured correction rather than a
//      loosened threshold. First run of this test: the square rib persisted on exactly 1152 of 2304 jump cells
//      (50.0 %) while retaining 5217 of 5217 mm^2 of curtain area — i.e. 100 % of the CLIFF-BEARING cells
//      persisted and 100 % of the merely-ADJACENT band cells dropped out. The reason is geometric: the centre
//      scan reaches +/-(span/2 + L/2), so the coarse probe (L = span/2) sees a cliff up to 0.75*span away and
//      the fine one (L = span/8) only 0.5625*span. A cell whose cliff lies between those radii is jump at the
//      cell pitch and not at half of it. So the pitch halving ALSO narrows the over-wide class band of lib §A6 —
//      a second, unplanned benefit — and the cell COUNT is therefore not the invariant. The area is.
  const areaKeep = (r) => (r.curtainAreaMm2 > 0 ? r.persist.curtainAreaPersistMm2 / r.curtainAreaMm2 : 0);
  const RAMP_W_FRAC = (0.11 * 24) / 720; // 0.11 of one cell arc, expressed as a fraction of the rib period
  const rmp = sizingFeasibility(rampRadiusFn(45, 1.0, 24, RAMP_W_FRAC), H, { ...OPTS, tolMm: 0.01, nU: 720, nV: 24, nDirs: 6, persist: true });
  const jKeep = areaKeep(jmp), rKeep = areaKeep(rmp);
  const pJump = jmp.persist.jumpPersistCells > 0 && jKeep > 0.99;
  lines.push(`  ${pJump ? 'PASS' : 'FAIL'}  ${pad('C0 jump PERSISTS (curtain area kept)', 44)} ${jmp.persist.curtainAreaPersistMm2.toFixed(0)}/${jmp.curtainAreaMm2.toFixed(0)} mm^2 = ${(100 * jKeep).toFixed(1)}% (want >99%), on ${jmp.persist.jumpPersistCells}/${jmp.persist.jumpCells} cells`);
  if (!pJump) fails += 1;
  const pJumpBand = jmp.persist.jumpEvaporatedCells > 0;
  lines.push(`  ${pJumpBand ? 'PASS' : 'FAIL'}  ${pad('...and the over-wide band is dropped', 44)} ${jmp.persist.jumpEvaporatedCells} adjacent cells de-classified while keeping ${(100 * jKeep).toFixed(1)}% of the area`);
  if (!pJumpBand) fails += 1;
  const pRamp = rmp.persist.jumpCells > 0 && rKeep < 0.01;
  lines.push(`  ${pRamp ? 'PASS' : 'FAIL'}  ${pad('finite-width cliff EVAPORATES', 44)} ${rmp.persist.curtainAreaPersistMm2.toFixed(0)}/${rmp.curtainAreaMm2.toFixed(0)} mm^2 = ${(100 * rKeep).toFixed(1)}% kept (want <1%), ${rmp.persist.jumpPersistCells}/${rmp.persist.jumpCells} cells`);
  if (!pRamp) fails += 1;
  const pCre = cre.persist.jumpCells === 0 && cre.persist.emergentJumpCells === 0;
  lines.push(`  ${pCre ? 'PASS' : 'FAIL'}  ${pad('pure crease reads jump at NEITHER pitch', 44)} coarse ${cre.persist.jumpCells}, emergent-at-fine ${cre.persist.emergentJumpCells}`);
  if (!pCre) fails += 1;
  lines.push(`        -> THE RAMP LINE IS THE POINT: both ribs are 1.0mm tall and both read JUMP at the cell pitch; only the`);
  lines.push(`           TRUE C0 one is still a jump at half that pitch. Without the gate the ramp is billed a curtain it does not need.`);

  // ── 5b. THE INVARIANT `persist` MUST PRESERVE. Turning the persistence verdict on adds a third probe level
  //       and MUST NOT move a single previously-published aggregate — otherwise every calibrated number in the
  //       lib header and the R2 worklog silently re-bases. Checked bit-for-bit, not approximately, on a surface
  //       that exercises all three classes. (rEvals and seconds are expected to move; they are excluded.)
  const invOpts = { ...OPTS, tolMm: 0.01, nU: 240, nV: 12, nDirs: 4 };
  const off = sizingFeasibility(jumpRadiusFn(45, 1.0, 24), H, { ...invOpts, persist: false });
  const on = sizingFeasibility(jumpRadiusFn(45, 1.0, 24), H, { ...invOpts, persist: true });
  const invKeys = ['areaMm2', 'areaNaiveMm2', 'nConfIso', 'nConfAniso', 'nConfAnisoAR', 'nStraddle', 'nCurtain',
    'curtainAreaMm2', 'maxJumpMm', 'worstConfMm', 'worstStraddleMm', 'flooredConfSamples', 'flooredStraddleSamples',
    'saturatedConfSamples', 'samples'];
  const moved = invKeys.filter((k) => off[k] !== on[k]);
  const clsMoved = SIZING_CLASSES.filter((c) => off.byClass[c].samples !== on.byClass[c].samples
    || off.byClass[c].nConfIso !== on.byClass[c].nConfIso);
  const invOK = moved.length === 0 && clsMoved.length === 0;
  lines.push(`  ${invOK ? 'PASS' : 'FAIL'}  ${pad('persist:true moves NO existing aggregate', 44)} ${moved.length === 0 ? 'all 15 scalars bit-identical' : `MOVED: ${moved.join(',')}`}; classes ${clsMoved.length === 0 ? 'identical' : clsMoved.join(',')}`);
  if (!invOK) fails += 1;

  // ── 6. ARTIFACT ROUND-TRIP. The reader must reproduce the writer's cells exactly from the binary, and the
  //      provenance check must REJECT a mismatched surface. An artifact that cannot be read back is not an
  //      artifact, and a provenance field nobody verifies is a comment.
  const rtDir = join(process.env.TEMP ?? '.', `pf-sizingfield-selftest-${process.pid}`);
  const rtNU = 180, rtNV = 24;
  const rtB = new SizingFieldBuilder(rtNU, rtNV);
  const ref = new Map(); // index -> the cell as the CALCULATOR produced it, before any encoding
  const rtRes = sizingFeasibility(
    jumpRadiusFn(45, 1.0, 24), H, { ...OPTS, tolMm: 0.01, nU: rtNU, nV: rtNV, nDirs: 4, persist: true },
    (c) => {
      rtB.sink(c);
      ref.set(c.iv * rtNU + c.iu, { h: c.hConfMm, p: c.p, pF: c.pFine, a: c.areaMm2, cls: c.cls, routed: c.persistJump });
    },
  );
  const rtArt = buildArtifact('SELFTEST_jumpRib', { R: 45, amp: 1.0, n: 24 }, rtRes, rtB, noConvergence('self-test'), null);
  const rtPaths = writeSizingFieldArtifact(rtDir, 'SELFTEST_jumpRib', rtArt, rtB.encodeBinary());
  const rd = readSizingFieldArtifact(rtPaths.jsonPath);
  let rtBad = 0, rtSeen = 0, rtRouted = 0;
  rd.forEachCell((c) => {
    const r0 = ref.get(c.iv * rtNU + c.iu);
    rtSeen += 1;
    if (c.routedToCurtain) rtRouted += 1;
    if (r0 === undefined
      || c.hConfMm !== Math.fround(r0.h) || c.pCoarse !== Math.fround(r0.p) || c.pFine !== Math.fround(r0.pF)
      || c.areaMm2 !== Math.fround(r0.a) || c.cls !== r0.cls || c.routedToCurtain !== r0.routed) rtBad += 1;
  });
  const rtOK = rd.source === 'bin' && rtSeen === ref.size && rtBad === 0 && rtRouted === rtRes.persist.routedCells;
  lines.push(`  ${rtOK ? 'PASS' : 'FAIL'}  ${pad('artifact round-trip (bin) is f32-exact', 44)} source=${rd.source}, ${rtSeen}/${ref.size} cells, ${rtBad} mismatched, routed ${rtRouted} vs ${rtRes.persist.routedCells}`);
  if (!rtOK) fails += 1;
  const provGood = rd.verifyProvenance({ style: 'SELFTEST_jumpRib', dims: DIMS, tolMm: 0.01, nU: 180, nV: 24 });
  const provBad = rd.verifyProvenance({ style: 'GothicArches', tolMm: 0.02, params: { R: 45, amp: 2.0, n: 24 } });
  const provOK = provGood.length === 0 && provBad.length >= 3;
  lines.push(`  ${provOK ? 'PASS' : 'FAIL'}  ${pad('provenance: accepts match, rejects mismatch', 44)} match -> ${provGood.length} complaints, mismatch -> ${provBad.length} complaints (want 0 / >=3)`);
  if (!provOK) fails += 1;
  const jsonOnly = readSizingFieldArtifact(rtPaths.jsonPath, { preferJson: true });
  const jOK = jsonOnly.source === 'json' && jsonOnly.artifact.summary.routedCells === rtRes.persist.routedCells;
  lines.push(`  ${jOK ? 'PASS' : 'FAIL'}  ${pad('artifact readable from JSON alone (no .bin)', 44)} source=${jsonOnly.source}`);
  if (!jOK) fails += 1;

  lines.push(`  ${fails === 0 ? 'ALL SELF-TESTS PASS' : `${fails} SELF-TEST FAILURE(S)`}`);
  lines.push('======================================================================');
  console.log(lines.join('\n'));
  return fails;
}

// ───────────────────────────── per-style report ─────────────────────────────
function reportStyle(style, res, params) {
  const L = [];
  L.push('');
  L.push(`----- ${style} @ registry defaults, tol ${TOL}mm, grid ${NU}x${NV}, ${DIRS} dirs -----`);
  L.push(`  params        ${JSON.stringify(params)}`);
  L.push(`  area          ${res.areaMm2.toFixed(0)} mm^2 metric   (flat-parameter r*dth*dz would say ${res.areaNaiveMm2.toFixed(0)} mm^2 = ${((100 * res.areaNaiveMm2) / res.areaMm2).toFixed(1)}%)`);
  L.push(`  PREDICTED TRIANGLE DEMAND`);
  L.push(`    conforming + isotropic       ${padL(fmtM(res.nConfIso), 10)}   ${padL((res.nConfIso / CAP).toFixed(2) + 'x cap', 12)}`);
  L.push(`    conforming + DIRECTED, AR${String(AR).padStart(2)} ${padL(fmtM(res.nConfAnisoAR), 10)}   ${padL((res.nConfAnisoAR / CAP).toFixed(2) + 'x cap', 12)}   <- what a real directed refiner can build`);
  L.push(`    conforming + DIRECTED, AR inf${padL(fmtM(res.nConfAniso), 8)}   ${padL((res.nConfAniso / CAP).toFixed(2) + 'x cap', 12)}   <- unconstrained aspect; an optimistic floor`);
  L.push(`    NOT conforming (density)     ${padL(fmtM(res.nStraddle), 10)}   ${padL((res.nStraddle / CAP).toFixed(2) + 'x cap', 12)}`);
  // UNIFORM references. These are what a NON-adaptive reading of the tolerance costs, and they are where the
  // prior "~100x allocation gap" comes from: it is a uniform-density number, not a sizing-field number.
  const uniWorst = (2 * res.areaMm2) / (res.worstConfMm * res.worstConfMm);
  const uni10um = (2 * res.areaMm2) / (0.01 * 0.01);
  L.push(`    [ref] UNIFORM at worst h     ${padL(fmtM(uniWorst), 10)}   ${padL((uniWorst / CAP).toFixed(2) + 'x cap', 12)}   adaptivity gain vs conf+iso: ${(uniWorst / res.nConfIso).toFixed(0)}x`);
  L.push(`    [ref] UNIFORM at 10um        ${padL(fmtM(uni10um), 10)}   ${padL((uni10um / CAP).toFixed(0) + 'x cap', 12)}   (the density the ruler-floor probe read off GothicArches)`);
  L.push(`  CLASS BREAKDOWN (share of the conforming+isotropic demand / of area)`);
  L.push(`    ${pad('class', 8)} ${padL('samples', 8)} ${padL('area%', 7)} ${padL('tris(conf)', 11)} ${padL('share', 7)} ${padL('tris(straddle)', 15)} ${padL('share', 7)} ${padL('worst h_conf', 13)}`);
  for (const c of SIZING_CLASSES) {
    const a = res.byClass[c];
    if (a.samples === 0) { L.push(`    ${pad(c, 8)} ${padL(0, 8)}   (none)`); continue; }
    L.push(`    ${pad(c, 8)} ${padL(a.samples, 8)} ${padL(pct(a.areaMm2, res.areaMm2), 7)} ${padL(fmtM(a.nConfIso), 11)} ${padL(pct(a.nConfIso, res.nConfIso), 7)} ${padL(fmtM(a.nStraddle), 15)} ${padL(pct(a.nStraddle, res.nStraddle), 7)} ${padL(fmtUm(a.worstConfMm), 13)}`);
  }
  L.push(`  WORST-CASE EDGE LENGTH`);
  L.push(`    conforming   h = ${fmtUm(res.worstConfMm)}  @ theta ${res.worstConfTheta.toFixed(4)} rad, z ${res.worstConfZ.toFixed(2)} mm`);
  L.push(`    straddling   h = ${fmtUm(res.worstStraddleMm)}  @ theta ${res.worstStraddleTheta.toFixed(4)} rad, z ${res.worstStraddleZ.toFixed(2)} mm`);
  L.push(`    h floored at hMin on ${res.flooredConfSamples} conforming / ${res.flooredStraddleSamples} straddling samples (of ${res.samples}); saturated at hMax on ${res.saturatedConfSamples} conforming`);
  if (res.byClass.jump.samples > 0) {
    L.push(`  C0 JUMP PRESENT -- the h^2 law does NOT apply on ${res.byClass.jump.samples} samples (${pct(res.byClass.jump.areaMm2, res.areaMm2)} of area).`);
    L.push(`    That class's NON-CONFORMING demand (${fmtM(res.byClass.jump.nStraddle)} of the ${fmtM(res.nStraddle)} total) is UNBOUNDED, not large. Near a cliff the`);
    L.push(`    straddling solve returns h ~ 2 x (distance to the cliff), so the integral behaves like 1/delta and is bounded only by`);
    L.push(`    the integration grid -- it is a RESOLUTION READING, not a demand (confirm with --converge). ${fmtM(res.byClass.jump.flooredStraddleTris)} of it is hMin-pinned.`);
    L.push(`    Smaller triangles never close a C0 jump. A CURTAIN does: ${res.curtainAreaMm2.toFixed(0)} mm^2 of cliff (max jump ${fmtUm(res.maxJumpMm)})`);
    L.push(`    meshed at the local smooth h => ${fmtM(res.nCurtain)} triangles. THAT is the finite, honest jump demand.`);
  } else {
    L.push(`  no C0 jump class detected at this grid resolution -- every sample's straddling sag decays (h^1 or h^2).`);
  }
  if (res.persist.enabled) L.push(persistBlock(res));
  L.push(`  cost: ${res.seconds.toFixed(1)} s, ${(res.rEvals / 1e6).toFixed(1)} M rA evals`);
  return L.join('\n');
}

// ───────────────────────────── the PERSISTENCE VERDICT block (lib §6) ─────────────────────────────
// The whole point: a jump CLASS at one probe pitch is not evidence of C0. Only the cells whose jump SURVIVES a
// halving of the probe pitch are billed a curtain; the rest are steep creases and keep their (finite) bisection
// demand. No style is named anywhere in this decision.
function persistBlock(res) {
  const p = res.persist;
  const L = [];
  const nBisectTotal = p.nBisect + p.nRoutedFlat;
  const nTotal = nBisectTotal + p.nCurtainPersist;
  L.push(`  C0 PERSISTENCE VERDICT (classify at the cell pitch AND at half of it; ${p.classCentres} probe centres)`);
  if (p.jumpCells === 0) {
    L.push(`    no jump-class cell at either pitch — nothing routes to a curtain. Every cell is bisectable.`);
  } else {
    const rate = p.jumpPersistCells / p.jumpCells;
    L.push(`    jump-class cells          ${padL(p.jumpCells, 8)}  of ${res.samples}`);
    L.push(`      PERSIST (genuine C0)    ${padL(p.jumpPersistCells, 8)}  ${padL(pct(p.jumpPersistCells, p.jumpCells), 7)}  -> ROUTE TO CURTAIN`);
    L.push(`      evaporate (steep crease)${padL(p.jumpEvaporatedCells, 8)}  ${padL(pct(p.jumpEvaporatedCells, p.jumpCells), 7)}  -> h^1, DIRECTED bisection closes it`);
    L.push(`    emergent at the fine pitch${padL(p.emergentJumpCells, 8)}  (not jump at the cell pitch, jump at half — a sub-cell cliff; NOT routed)`);
    L.push(`    curtain area, PERSISTED   ${padL(p.curtainAreaPersistMm2.toFixed(0) + ' mm^2', 12)}  vs ${res.curtainAreaMm2.toFixed(0)} mm^2 if every jump cell were believed`
      + `  (${pct(p.curtainAreaPersistMm2, res.curtainAreaMm2)} survives)`);
    L.push(`    VERDICT: ${rate > 0.5 ? 'GENUINE C0 CONTENT — a curtain stage is required; no bisection driver will close it.'
      : 'MOSTLY NOT C0 — what read as a jump is steep crease the cell pitch could not resolve.'}`);
  }
  L.push(`  PREDICTED DEMAND, SPLIT BY MECHANISM (the number PHASE 0 hands the driver)`);
  L.push(`    bisection  ${padL(fmtM(nBisectTotal), 10)}   ${padL((nBisectTotal / CAP).toFixed(2) + 'x cap', 12)}   = ${fmtM(p.nBisect)} un-routed cells + ${fmtM(p.nRoutedFlat)} non-cliff remainder of routed cells`);
  L.push(`    curtain    ${padL(fmtM(p.nCurtainPersist), 10)}   ${padL((p.nCurtainPersist / CAP).toFixed(2) + 'x cap', 12)}   = persisted cliff area at the local h, one-quad-strip floor`);
  L.push(`    TOTAL      ${padL(fmtM(nTotal), 10)}   ${padL((nTotal / CAP).toFixed(2) + 'x cap', 12)}   (conf+iso WITHOUT routing was ${fmtM(res.nConfIso)} = ${(res.nConfIso / CAP).toFixed(2)}x)`);
  L.push(`    LOWER BOUND — 1-D edge sagitta, not facet-interior; no grading; 2 tris per h-by-h patch.`);
  return L.join('\n');
}

// ───────────────────────────── main ─────────────────────────────
if (has('selftest')) {
  const f = selftest();
  process.exit(f === 0 ? 0 : 1);
}

// --read: inspect an emitted artifact THROUGH THE READER API. This is the worked example a driver author copies:
// verify provenance first, then query cells. Nothing here reaches into the JSON directly.
if (READ_PATH !== null) {
  const jsons = READ_PATH.endsWith('.json') && !READ_PATH.endsWith('INDEX.json')
    ? [READ_PATH]
    : readdirSync(READ_PATH.endsWith('INDEX.json') ? dirname(READ_PATH) : READ_PATH)
      .filter((f) => f.endsWith('.cells.json'))
      .map((f) => join(READ_PATH.endsWith('INDEX.json') ? dirname(READ_PATH) : READ_PATH, f));
  if (jsons.length === 0) { console.error(`no *.cells.json under ${READ_PATH}`); process.exit(1); }
  for (const jp of jsons) {
    const rd = readSizingFieldArtifact(jp);
    const a = rd.artifact;
    const style = a.provenance.style;
    console.log(`\n----- ${style}  (${rd.nU}x${rd.nV} cells, payload from the ${rd.source.toUpperCase()}) -----`);
    console.log(`  key        ${a.provenance.key}`);
    console.log(`  generated  ${a.provenance.generatedAt} by ${a.provenance.tool}`);
    // 1. PROVENANCE FIRST. A field computed for other params is a different surface, not an approximation.
    let expectParams = null;
    try { expectParams = registryDefaults(style); } catch { expectParams = null; }
    const complaints = expectParams === null
      ? ['(style not in STYLE_REGISTRY — provenance not checkable here)']
      : rd.verifyProvenance({ style, params: expectParams, dims: DIMS, tolMm: a.opts.tolMm });
    console.log(`  provenance vs registry defaults: ${complaints.length === 0 ? 'MATCH' : `MISMATCH -> ${complaints.join('; ')}`}`);
    // 2. bulk stats through the reader, not through the JSON
    const hist = { smooth: 0, crease: 0, jump: 0 };
    let routed = 0, curtainArea = 0, hMin = Infinity, hSum = 0, n = 0;
    rd.forEachCell((c) => {
      hist[c.cls] += 1; n += 1; hSum += c.hConfMm;
      if (c.hConfMm < hMin) hMin = c.hConfMm;
      if (c.routedToCurtain) { routed += 1; curtainArea += c.cliffAreaMm2; }
    });
    console.log(`  cells      ${n}   smooth ${hist.smooth} / crease ${hist.crease} / jump ${hist.jump}`);
    console.log(`  routing    ${routed} cells -> CURTAIN (${curtainArea.toFixed(1)} mm^2), ${n - routed} -> bisection`);
    console.log(`  h          min ${fmtUm(hMin)}, mean ${fmtUm(hSum / Math.max(1, n))}`);
    console.log(`  grid conv  ${a.caveats.gridConverged === null ? 'NOT CHECKED' : (a.caveats.gridConverged ? 'converged' : 'NOT CONVERGED — quote +/-50%')}`);
    // 3. the two point queries a driver's PHASE 0 actually makes
    const probe = [[0.0, 60], [Math.PI / 2, 30], [Math.PI, 90]];
    for (const [th, z] of probe) {
      const c = rd.cellAt(th, z);
      console.log(`  cellAt(theta=${th.toFixed(3)}, z=${z})  ->  ${c === null ? 'no data' : `h=${fmtUm(c.hConfMm)} class=${c.cls}/${c.clsFine} p=${c.pCoarse.toFixed(2)}/${c.pFine.toFixed(2)} ${c.routedToCurtain ? 'CURTAIN' : 'bisect'}`}`);
    }
    for (const line of rd.caveatLines()) console.log(`  ! ${line}`);
  }
  process.exit(0);
}

console.log(`\n===== SIZING-FIELD FEASIBILITY  |  dims H=${DIMS.H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=${DIMS.expn}  |  tol ${TOL}mm  |  cap ${CAP.toLocaleString('en-US')} =====`);

const rows = [];
const convRows = [];
const emitted = [];
for (const style of STYLES) {
  const params = registryDefaults(style);
  const rA = buildRadiusFn(style, params, DIMS);

  // PHASE-0 EMIT: the identical sweep, with a per-cell sink attached. The aggregate is unaffected by the sink.
  const builder = EMIT_DIR === null ? null : new SizingFieldBuilder(NU, NV);
  const res = sizingFeasibility(rA, H, OPTS, builder === null ? undefined : builder.sink);
  console.log(reportStyle(style, res, params));
  rows.push({ style, params, ...res });

  if (builder !== null) {
    // CONVERGENCE FLAG: measured against a 2x grid, not asserted. The three feature-bearing styles were NOT
    // grid-converged in the first R2 run (0.64x / 1.20x / 1.52x) — that is a property of the surface, and the
    // consumer has to be told which styles carry it.
    let convergence = noConvergence('--noconv: the 2x-grid check was not run, so nothing here is known to be grid-independent');
    if (DO_CONV) {
      const fineNU = NU * CONV_MUL, fineNV = NV * CONV_MUL;
      const fine = sizingFeasibility(rA, H, { ...OPTS, nU: fineNU, nV: fineNV });
      convergence = convergenceFrom(res, fine, fineNU, fineNV);
      const f = (x) => (x === null ? ' - ' : `${x.toFixed(2)}x`);
      console.log(`  GRID CONVERGENCE ${NU}x${NV} -> ${fineNU}x${fineNV}:  conf+iso ${f(convergence.confIsoRatio)}   worst h ${f(convergence.worstConfRatio)}   persisted curtain area ${f(convergence.curtainAreaPersistRatio)}`
        + `   persisted-area share ${(100 * (convergence.persistAreaShareCoarse ?? 0)).toFixed(2)}% -> ${(100 * (convergence.persistAreaShareFine ?? 0)).toFixed(2)}%`
        + `   => ${convergence.converged ? 'CONVERGED' : 'NOT CONVERGED (quote +/-50%)'}`);
    }
    const artifact = buildArtifact(style, params, res, builder, convergence);
    const w = writeSizingFieldArtifact(EMIT_DIR, style, artifact, builder.encodeBinary());
    // read it straight back — an artifact that cannot be re-read is not an artifact
    const rb = readSizingFieldArtifact(w.jsonPath);
    const complaints = rb.verifyProvenance({ style, params, dims: DIMS, tolMm: TOL, nU: NU, nV: NV });
    console.log(`  ARTIFACT  ${w.jsonPath} (${(w.jsonBytes / 1e6).toFixed(2)} MB) + ${w.binPath} (${(w.binBytes / 1e6).toFixed(2)} MB)`
      + `  readback source=${rb.source}, provenance ${complaints.length === 0 ? 'OK' : `MISMATCH: ${complaints.join('; ')}`}`);
    emitted.push({
      style, json: w.jsonPath, bin: w.binPath,
      summary: artifact.summary, convergence: artifact.convergence, grid: artifact.grid,
      provenanceKey: artifact.provenance.key,
    });
  }

  // --converge: re-run at 2x the integration grid. Everything grid-dependent is then VISIBLE rather than
  // asserted: a smooth-dominated demand should barely move, a jump-dominated non-conforming demand should
  // climb without settling, and the class shares should shift as the over-wide feature bands narrow.
  if (has('converge')) {
    const res2 = sizingFeasibility(rA, H, { ...OPTS, nU: NU * 2, nV: NV * 2 });
    const rat = (a, b) => (b > 0 ? (a / b).toFixed(2) + 'x' : '  -  ');
    const c = {
      style,
      confIso: [res.nConfIso, res2.nConfIso], confAniso: [res.nConfAniso, res2.nConfAniso],
      confAnisoAR: [res.nConfAnisoAR, res2.nConfAnisoAR],
      straddle: [res.nStraddle, res2.nStraddle], curtain: [res.nCurtain, res2.nCurtain],
      area: [res.areaMm2, res2.areaMm2], worstConf: [res.worstConfMm, res2.worstConfMm],
      jumpShare: [res.byClass.jump.nConfIso / Math.max(1, res.nConfIso), res2.byClass.jump.nConfIso / Math.max(1, res2.nConfIso)],
    };
    convRows.push(c);
    console.log(`  CONVERGENCE ${NU}x${NV} -> ${NU * 2}x${NV * 2}:  area ${rat(res2.areaMm2, res.areaMm2)}   conf+iso ${rat(res2.nConfIso, res.nConfIso)}   conf+dir ${rat(res2.nConfAniso, res.nConfAniso)}   no-conform ${rat(res2.nStraddle, res.nStraddle)}   curtain ${rat(res2.nCurtain, res.nCurtain)}   worst h ${fmtUm(res.worstConfMm)} -> ${fmtUm(res2.worstConfMm)}`);
  }
}

// summary table
console.log('');
console.log('===== SUMMARY =====');
console.log(`${pad('style', 16)} ${padL('area mm2', 9)} ${padL('conf+iso', 9)} ${padL('xcap', 6)} ${padL(`dir AR${AR}`, 9)} ${padL('xcap', 6)} ${padL('dir ARinf', 9)} ${padL('xcap', 6)} ${padL('no-conform', 10)} ${padL('xcap', 6)} ${padL('worst h', 9)} ${padL('smooth', 7)} ${padL('crease', 7)} ${padL('jump', 6)}`);
for (const r of rows) {
  const shr = (c) => pct(r.byClass[c].nConfIso, r.nConfIso);
  console.log(
    `${pad(r.style, 16)} ${padL(r.areaMm2.toFixed(0), 9)} ${padL(fmtM(r.nConfIso), 9)} ${padL((r.nConfIso / CAP).toFixed(2) + 'x', 6)} ${padL(fmtM(r.nConfAnisoAR), 9)} ${padL((r.nConfAnisoAR / CAP).toFixed(2) + 'x', 6)} ${padL(fmtM(r.nConfAniso), 9)} ${padL((r.nConfAniso / CAP).toFixed(2) + 'x', 6)} ${padL(fmtM(r.nStraddle), 10)} ${padL((r.nStraddle / CAP).toFixed(1) + 'x', 6)} ${padL(fmtUm(r.worstConfMm), 9)} ${padL(shr('smooth'), 7)} ${padL(shr('crease'), 7)} ${padL(shr('jump'), 6)}`,
  );
}

// ───────────────────────────── PHASE-0 summary + index ─────────────────────────────
if (emitted.length > 0) {
  console.log('');
  console.log('===== PHASE-0 PER-CELL ARTIFACTS: CLASS COUNTS, PERSISTENCE, AND THE DEMAND SPLIT =====');
  console.log(`${pad('style', 16)} ${padL('cells', 7)} ${padL('smooth', 7)} ${padL('crease', 7)} ${padL('jump', 6)} ${padL('persist', 8)} ${padL('%persist', 9)} ${padL('curtain mm2', 12)} ${padL('bisect', 9)} ${padL('curtain', 9)} ${padL('TOTAL', 9)} ${padL('xcap', 6)} ${padL('gridconv', 9)}`);
  for (const e of emitted) {
    const s = e.summary;
    const cells = s.cellsByClass.smooth + s.cellsByClass.crease + s.cellsByClass.jump;
    console.log(
      `${pad(e.style, 16)} ${padL(cells, 7)} ${padL(s.cellsByClass.smooth, 7)} ${padL(s.cellsByClass.crease, 7)} ${padL(s.cellsByClass.jump, 6)}`
      + ` ${padL(s.jumpPersistCells, 8)} ${padL(s.jumpCells > 0 ? pct(s.jumpPersistCells, s.jumpCells) : '  -  ', 9)}`
      + ` ${padL(s.curtainAreaPersistMm2.toFixed(0), 12)} ${padL(fmtM(s.nBisectTotal), 9)} ${padL(fmtM(s.nCurtain), 9)} ${padL(fmtM(s.nTotal), 9)}`
      + ` ${padL(s.xCap.toFixed(2) + 'x', 6)} ${padL(e.convergence.converged === null ? 'n/a' : (e.convergence.converged ? 'yes' : 'NO'), 9)}`,
    );
  }
  console.log(`
  persist  = jump-class cells whose jump SURVIVED a halving of the probe pitch. Those and only those route to
             the CURTAIN stage; the rest are steep creases and keep their (finite, h^1) bisection demand.
             There is no style-keyed dispatch in that decision — it is measured per cell from the surface.
  curtain mm2 = cliff area charged to the PERSISTED cells (area-element excess). The naive "every jump cell"
             figure is in each style's block above; the gap between them is what the persistence gate saves.
  TOTAL    = bisection + curtain. Compare against the conf+iso column in the first summary, which does no
             routing at all and therefore prices a curtain as if smaller triangles could close it.
  gridconv = BOTH the demand and the worst h moved <15% when the integration grid was doubled. 'NO' means
             quote that style's counts as +/-50%, exactly as the R2 run did.
  EVERY COUNT IS A LOWER BOUND: 1-D edge sagitta, not the facet-interior quantity the auditor judges.`);

  const indexPath = join(EMIT_DIR, 'INDEX.json');
  writeFileSync(indexPath, JSON.stringify({
    schema: SIZING_FIELD_SCHEMA,
    generatedAt: new Date().toISOString(),
    tool: 'research/tools/sizingFeasibility.mjs --emit',
    dims: DIMS, tolMm: TOL, grid: { nU: NU, nV: NV }, dirs: DIRS, triCap: CAP, zMarginMm: MARGIN,
    convergenceGridMultiplier: DO_CONV ? CONV_MUL : null,
    readerApi: 'research/bridge/_sizingFieldArtifact.ts — readSizingFieldArtifact(path).verifyProvenance(...) '
      + 'then cellAt(theta,z) / hAt / classAt / isCurtainAt',
    caveat: 'Counts are LOWER bounds (1-D edge sagitta vs the auditor facet-interior quantity). Class shares are '
      + 'grid-dependent. Per-style gridConverged says whether this grid is trustworthy for that style.',
    styles: emitted,
  }, null, 1));
  console.log(`\nwrote ${indexPath}`);
}

console.log(`
===== HOW TO READ THIS =====
  conf+iso   = a mesher that puts an edge on every feature locus and refines isotropically.
  dir AR${String(AR).padEnd(4)} = the same, refining ANISOTROPICALLY (2*dA/(h_min*h_long)) with the long edge capped at
               ${AR}x the short one -- STRATA's DIRECTED lever WITH its aspect guard (PF_CB_AR). This is the
               column to plan against.
  dir ARinf  = anisotropic with NO aspect cap (h_long free to reach hMax). A floor no refiner reaches;
               shown only to bound how much more anisotropy could theoretically buy.
  no-conform = pure density, triangles free to straddle loci. Where a jump class exists this column is
               UNBOUNDED (h ~ 2 x distance-to-cliff), i.e. a resolution reading -- see the per-style C0 block.
  worst h    = smallest conforming edge length demanded anywhere on the surface.
  class shares are shares of the conf+iso demand.

===== ASSUMPTIONS (a feasibility estimate, NOT a certificate) =====
  A1 EDGE sag, not FACET-INTERIOR sag. The auditor's verdict quantity is point-to-triangle over a facet
     interior; this measures the 1-D chord sagitta along an edge. Equal to within a small constant for
     well-shaped isotropic triangles, NOT equal for slivers or locus-straddling facets. => LOWER bound.
  A2 PERFECT CONFORMING for the conf+* columns (an edge exactly on every locus).
  A3 GRID RESOLUTION ${NU}x${NV}: a feature thinner than one cell (${((360 / NU)).toFixed(3)} deg in theta, ${(H / NV).toFixed(3)} mm in z)
     can be sampled once or missed. Re-run at --nu ${NU * 2} --nv ${NV * 2} before believing any number.
  A4 NO LIPSCHITZ GRADING. A real sizing field grades, which only lowers h => raises the count.
  A5 the ${DIRS} probe directions are a finite sample of the tangent circle; the true min over directions is <= what
     is reported => LOWER bound again.
  A5b z-BOUNDARY: probes within hMax=${HMAX}mm of z=0 or z=${H} read outside the domain, where baseRadius() is already
     flat (it clamps t internally) -- so the domain ends look like a crease. margin currently ${MARGIN}mm. If any
     worst-h above is located in the first/last few rows, re-run with --margin ${HMAX} before quoting it.
  A6 2 triangles per h-by-h patch. An equilateral tiling gives 2.31/h^2 => read counts with a +15% band.
  A7 the class exponent is measured at the tolerance scale (h and h/2), which is the right scale for this
     question but is not a claim about the analytic surface's smoothness.
  Validate with --selftest (closed-form cylinder / cone / crease / jump) before trusting a verdict.`);

if (JSON_OUT !== null) {
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify({ dims: DIMS, tol: TOL, nU: NU, nV: NV, dirs: DIRS, cap: CAP, rows, convRows }, null, 1));
  console.log(`\nwrote ${JSON_OUT}`);
}
