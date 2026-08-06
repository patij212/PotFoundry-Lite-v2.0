// s113dInteriorCrease.ts — S113c PHASE 2. Three follow-ups the phase-1 kill lines forced.
//
// PHASE 1 (`s113cScopeAudit.ts`, report S113C_SCOPE_GOTH.report.txt) reproduced S112's funnel to the digit
// (19,582 / 13,092 / 6,490 / 7,918 / 5,174 and 2.3699 / 1.7602 / 0.6111 / 1.5731 / 0.1872 %) and then fired
// TWO of its five pre-registered lines:
//   A1  the CURTAIN class is not non-graph: two-scale halving ratio p50 0.505 (Lipschitz-continuous),
//       only 0.08% of it by area carries a C0 jump, and the analytic area distortion J tops out at 9.6
//       while the cut sits at 8.
//   A3  vertex-on-crease does NOT separate CONFORMED from STRADDLING: 83.77% vs 88.71% by area = 0.94x,
//       flat across a 1-20% threshold sweep.
//   A5 did NOT fire — crease-free facets keep drop p50 0.956 — so the drop is not a generic boundary
//       artefact either. Leg 2 is therefore not simply wrong; it is measuring SOMETHING. This tool asks
//       what, and whether that something licenses DELETING 1.5731% of mesh area from a defect census.
//
// LOCATOR CONTROL, run before this tool and passed: in the pinned target set, `kSegT` (crease on the
// centroid segment) is spread over [0,1] — p50 0.5312, only 0.45% within 2% of an endpoint — while
// `kEdgeT` (crease on a shared MESH edge) is 77.76% at an endpoint. So `locateKinkRaw` returns interior
// parameters when the crease is interior; the endpoint pile-up on mesh edges is a PROPERTY OF THE MESH
// (the mesher does put vertices on creases), not a degenerate locator. That is what makes D4 readable —
// and it is also why vertex-on-crease cannot discriminate: it is true of BOTH classes.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// D7 — DOES THE CREASE ACTUALLY CROSS THE FACET INTERIOR? (S112's own words for the straddling class)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S112: "~1 => the footprint INTERIOR straddles the crease". That is a GEOMETRIC statement and it can be
// tested without the orientation ruler at all: shrink the parameter triangle toward its centroid by the
// SAME 0.05 the inset uses, and run `locateKinkRaw` (a |D2 r| test — no normals, no finite-difference
// Gauss map) on the boundary of the shrunken triangle. A crease found there passes through the inset
// footprint, i.e. through the facet interior. If CONFORMED facets carry interior creases at a rate
// comparable to STRADDLING ones, the label does not mean what it says and the 1.5731% cannot be deleted.
//   *** KILL LINE B1: if interior-crease rate(STRADDLING)/rate(CONFORMED) < 2.0 BY AREA, D7 refutes the
//   conformed/straddling separation on its own stated mechanism. ***
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// D8 — THE ONE-SIDEDNESS HOLE, MADE ARITHMETIC
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `orientRuler.ts:29-37` states the contract: normRad is a LOWER bound on the true sup — "SOUND FOR
// REFUSALS ... NOT sound for accepts", and at a C0 crease "there is NO accept-side certificate from this
// route, and the honest verdict for a crease-straddling facet is UNDECIDED-or-FAIL, never ACCEPT." The
// inset only makes it a weaker lower bound, so `normHi > 10 deg` is a SOUND REFUSAL at any inset.
// S112's CONFORMED class is defined by drop < 0.25 AND normLo > 10 — it says NOTHING about normHi. A facet
// with normLo 100 and normHi 20 is CONFORMED by that rule while the sound one-sided witness REFUSES it.
//   *** KILL LINE B2: if more than 5% of the CONFORMED class BY AREA has normHi > 10 deg, then S112
//   deleted facets its own refusal-sound instrument had already condemned, and the 9.40x is overstated by
//   at least that much. ***
// The honest floor is then reported directly: the area of the high-dihedral class whose inset-0.05
// witness exceeds the bar, with NO curtain scope and NO drop rule — every cut in S112's funnel only
// REMOVES facets, so this is a lower bound on the class under the same bar.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// D9 — WHAT THE "CURTAIN" CLASS ACTUALLY IS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// For a facet small against the surface's variation, graphRatio -> J(centroid) exactly. So graphRatio/J
// says whether a large ratio is genuine STEEPNESS (ratio/J ~ 1: a graph, just steep — the ruler is fine)
// or a FOOTPRINT-SHAPE / feature-spanning artefact (ratio/J >> 1). Phase 1 measured J's whole-surface
// distribution; this measures it AT the facets that were excluded.
//
// Usage: bash research/tools/run-s113d-interior.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S113D_STYLE ?? 'GothicArches';
const STL = process.env.PF_S113D_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S113D_TAG ?? 'GOTH';
const HI_DEG = envF('PF_S113D_HI_DEG', 45);
const K = Math.round(envF('PF_S113D_K', 8));
const INSET_LO = envF('PF_S113D_INSET_LO', 0);
const INSET_HI = envF('PF_S113D_INSET_HI', 0.05);
const CURTAIN_RATIO = envF('PF_S113D_CURTAIN', 8);
const DROP_CUT = envF('PF_S113D_DROP', 0.25);
const BAR_DEG = envF('PF_S113D_BAR', 10);
const DIMS: StyleDims = { H: envF('PF_S113D_H', 120), Rb: envF('PF_S113D_RB', 40), Rt: envF('PF_S113D_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/scopeaudit';

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

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;

const PRED: SweepPredConst = {
  esN: Math.round(envF('PF_CB_ESN', 8)),
  refHs: envF('PF_CB_REF_HS', 0.03),
  refNmax: Math.round(envF('PF_CB_REF_NMAX', 64)),
  kinkScan: Math.round(envF('PF_CB_KINK_SCAN', 16)),
  kinkHalvings: Math.round(envF('PF_CB_KINK_HALVINGS', 24)),
  kinkRatio: envF('PF_CB_KINK_RATIO', 0.15),
  jumpRatio: envF('PF_CB_JUMP_RATIO', 0.62),
  snap: true,
  confMm: envF('PF_CB_CONF_UM', 0.6) / 1000,
};

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsKink = fdNormals(rA, H, 2e-4, 2e-4);
const scratch = new Float64Array(12);

log('===== S113d — PHASE 2: interior creases, the one-sidedness hole, and what the curtain class is =====');
log(`style ${STYLE}  tag ${TAG}  dihedral>${HI_DEG}  k=${K}  insets ${INSET_LO}/${INSET_HI}  curtain ${CURTAIN_RATIO}x  drop ${DROP_CUT}  bar ${BAR_DEG} deg`);
log('');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S111/S112/S113 read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}

const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(1)} mm2  interior edges ${d.interiorEdges}  ${el()}`);
log('');

const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};
const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
  + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
function orientOf(f: number, inset: number): number {
  const [ath, bth, cth] = th3(f);
  return orientOfFacet(nsKink,
    xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
    xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K, inset, scratch }).normDeg;
}
function graphRatio(f: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const [ath, bth, cth] = th3(f);
  const rRef = rRefOf(f);
  const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}
/** analytic area distortion J = sqrt(1 + r_z^2 + (r_th/r)^2) at the facet's PARAMETER centroid. */
function jCentroid(f: number): number {
  const [ath, bth, cth] = th3(f);
  const th = (ath + bth + cth) / 3;
  const z = (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3;
  const hA = 2e-4; const r0 = rA(th, z);
  const hTh = hA / Math.max(1e-9, r0);
  const rt = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hTh);
  const zl = Math.max(0, z - hA); const zh = Math.min(H, z + hA);
  const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
  return Math.sqrt(1 + rz * rz + (rt / Math.max(1e-9, r0)) ** 2);
}
/** D7 — is there a crease on the boundary of the facet's INSET parameter triangle? */
function creaseInInterior(f: number, inset: number): boolean {
  const [ath, bth, cth] = th3(f);
  const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
  const ths = [ath, bth, cth];
  const sh = 1 - inset; const sc = inset / 3;
  const iw = [[sh + sc, sc, sc], [sc, sh + sc, sc], [sc, sc, sh + sc]];
  const pth = iw.map((w) => w[0] * ths[0] + w[1] * ths[1] + w[2] * ths[2]);
  const pz = iw.map((w) => w[0] * zs[0] + w[1] * zs[1] + w[2] * zs[2]);
  for (let i = 0; i < 3; i += 1) {
    const j = (i + 1) % 3;
    const kk = locateKinkRaw(rA, pth[i], pz[i], pth[j], pz[j], PRED);
    if (kk !== null && !kk.jump) return true;
  }
  return false;
}

const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mxOf = (v: number[]): number => { let m = -Infinity; for (const x of v) if (x > m) m = x; return m; };
const areaOfSet = (fs: Iterable<number>): number => { let a = 0; for (const f of fs) a += d.areaMm2[f]; return a; };
const uniq = (rs: Array<{ f1: number; f2: number }>): Set<number> => {
  const s = new Set<number>(); for (const r of rs) { s.add(r.f1); s.add(r.f2); } return s;
};
const repF = (name: string, fs: number[], denomFs: number[], maxOf: number[]): void => {
  const ar = areaOfSet(fs); const den = areaOfSet(denomFs);
  log(`  ${name.padEnd(40)} n=${String(fs.length).padStart(6)} (${((fs.length / Math.max(1, denomFs.length)) * 100).toFixed(2).padStart(6)}%)  AREA ${ar.toFixed(3).padStart(9)} mm2 = ${((ar / Math.max(1e-12, den)) * 100).toFixed(2).padStart(6)}% of class, ${((ar / meshArea) * 100).toFixed(4)}% of mesh  MAX ${maxOf.length > 0 ? mxOf(maxOf).toFixed(2) : 'n/a'}`);
};

// ── build the same classes phase 1 built (funnel reproduced there to the digit) ──
type Row = { e: number; f1: number; f2: number; measDeg: number; curtain: boolean; normHi: number; normLo: number; drop: number };
const facCache = new Map<number, { nHi: number; nLo: number; gr: number }>();
const facOf = (f: number): { nHi: number; nLo: number; gr: number } => {
  const c = facCache.get(f);
  if (c !== undefined) return c;
  const v = { nHi: orientOf(f, INSET_HI), nLo: orientOf(f, INSET_LO), gr: graphRatio(f) };
  facCache.set(f, v); return v;
};
const rows: Row[] = [];
const hiThr = (HI_DEG * Math.PI) / 180;
for (let e = 0; e < d.edgeAngRad.length; e += 1) {
  if (!(d.edgeAngRad[e] > hiThr)) continue;
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  const a = facOf(f1); const b = facOf(f2);
  const normHi = Math.max(a.nHi, b.nHi); const normLo = Math.max(a.nLo, b.nLo);
  rows.push({
    e, f1, f2, measDeg: (d.edgeAngRad[e] * 180) / Math.PI,
    curtain: a.gr > CURTAIN_RATIO || b.gr > CURTAIN_RATIO,
    normHi, normLo, drop: normLo > 1e-9 ? normHi / normLo : 1,
  });
}
const wall = rows.filter((r) => !r.curtain);
const curtain = rows.filter((r) => r.curtain);
const conformedP = wall.filter((r) => r.drop < DROP_CUT && r.normLo > 10);
const straddlingP = wall.filter((r) => r.drop >= DROP_CUT && r.normHi > 10);
log('── FUNNEL CONTROL (must match phase 1 / S112 exactly) ──');
log(`  all ${rows.length} (${((areaOfSet(uniq(rows)) / meshArea) * 100).toFixed(4)}%)  wall ${wall.length} (${((areaOfSet(uniq(wall)) / meshArea) * 100).toFixed(4)}%)  curtain ${curtain.length} (${((areaOfSet(uniq(curtain)) / meshArea) * 100).toFixed(4)}%)  conformed ${conformedP.length} (${((areaOfSet(uniq(conformedP)) / meshArea) * 100).toFixed(4)}%)  straddling ${straddlingP.length} (${((areaOfSet(uniq(straddlingP)) / meshArea) * 100).toFixed(4)}%)`);
log('  S112: 19582 (2.3699%)  13092 (1.7602%)  6490 (0.6111%)  7918 (1.5731%)  5174 (0.1872%)');
log(`  ${el()}`);
log('');

// facet-level classes (the mechanism claim is per FACET)
const wallF = [...uniq(wall)];
type FRow = { f: number; nHi: number; nLo: number; drop: number };
const fr: FRow[] = wallF.map((f) => {
  const a = facOf(f);
  return { f, nHi: a.nHi, nLo: a.nLo, drop: a.nLo > 1e-9 ? a.nHi / a.nLo : 1 };
});
const confF = fr.filter((r) => r.drop < DROP_CUT && r.nLo > 10);
const stradF = fr.filter((r) => r.drop >= DROP_CUT && r.nHi > 10);

// ═══════════════════════════ D7 — DOES THE CREASE CROSS THE INTERIOR? ═══════════════════════════
log('══════════ D7 — DOES THE CREASE ACTUALLY CROSS THE FACET INTERIOR? ══════════');
log(`  Test: locateKinkRaw on the boundary of the INSET-${INSET_HI} parameter triangle. No normals, no`);
log('  Gauss map, no finite differences of the ruler kind — a |D2 r| test on a shrunken triangle.');
{
  const cIn = confF.filter((r) => creaseInInterior(r.f, INSET_HI));
  const sIn = stradF.filter((r) => creaseInInterior(r.f, INSET_HI));
  repF('CONFORMED  facets', confF.map((r) => r.f), wallF, confF.map((r) => r.nLo));
  repF('  ...with a crease in the INTERIOR', cIn.map((r) => r.f), confF.map((r) => r.f), cIn.map((r) => r.nLo));
  repF('STRADDLING facets', stradF.map((r) => r.f), wallF, stradF.map((r) => r.nHi));
  repF('  ...with a crease in the INTERIOR', sIn.map((r) => r.f), stradF.map((r) => r.f), sIn.map((r) => r.nHi));
  const cR = areaOfSet(cIn.map((r) => r.f)) / Math.max(1e-12, areaOfSet(confF.map((r) => r.f)));
  const sR = areaOfSet(sIn.map((r) => r.f)) / Math.max(1e-12, areaOfSet(stradF.map((r) => r.f)));
  const cRn = cIn.length / Math.max(1, confF.length); const sRn = sIn.length / Math.max(1, stradF.length);
  log('');
  log(`  interior-crease rate  CONFORMED ${(cR * 100).toFixed(2)}% by area / ${(cRn * 100).toFixed(2)}% by count`);
  log(`  interior-crease rate  STRADDLING ${(sR * 100).toFixed(2)}% by area / ${(sRn * 100).toFixed(2)}% by count`);
  log(`  separation (straddling/conformed) ${(sR / Math.max(1e-9, cR)).toFixed(2)}x by area, ${(sRn / Math.max(1e-9, cRn)).toFixed(2)}x by count   (B1 KILL if < 2.0x by area)`);
  log(`  ${sR / Math.max(1e-9, cR) < 2.0 ? '*** B1 KILL LINE FIRED — CONFORMED facets carry interior creases at a comparable rate. The label does not mean what it says. ***'
    : '[B1 PASSES — STRADDLING facets really do carry the crease through their interior and CONFORMED ones do not.]'}`);
  log(`  ${el()}`);
}
log('');

// ═══════════════════════════ D8 — THE ONE-SIDEDNESS HOLE ═══════════════════════════
log('══════════ D8 — HOW MUCH OF THE "CONFORMED" CLASS DOES THE REFUSAL-SOUND WITNESS ALREADY CONDEMN? ══════════');
log('  orientRuler.ts:29-37: normRad is a LOWER bound — SOUND FOR REFUSALS, NOT for accepts, and at a C0');
log('  crease there is NO accept-side certificate at all. The inset only weakens the lower bound, so');
log(`  normHi > bar is a SOUND REFUSAL. S112's CONFORMED rule never looks at normHi.`);
{
  const nh = confF.map((r) => r.nHi);
  log(`  CONFORMED normHi (the inset-${INSET_HI} witness):  p10 ${q(nh, 0.1).toFixed(3)}  p50 ${q(nh, 0.5).toFixed(3)}  p90 ${q(nh, 0.9).toFixed(3)}  p99 ${q(nh, 0.99).toFixed(3)}  MAX ${mxOf(nh).toFixed(2)} deg`);
  for (const bar of [1, 5, 10, 20, 45]) {
    const over = confF.filter((r) => r.nHi > bar);
    repF(`CONFORMED with normHi > ${String(bar).padStart(2)} deg`, over.map((r) => r.f), confF.map((r) => r.f), over.map((r) => r.nHi));
  }
  const over10 = confF.filter((r) => r.nHi > BAR_DEG);
  const share = areaOfSet(over10.map((r) => r.f)) / Math.max(1e-12, areaOfSet(confF.map((r) => r.f)));
  log('');
  log(`  B2: ${(share * 100).toFixed(2)}% of the CONFORMED class BY AREA is REFUSED by the sound witness at ${BAR_DEG} deg   (KILL if > 5%)`);
  log(`  ${share > 0.05 ? '*** B2 KILL LINE FIRED — S112 deleted facets its own refusal-sound instrument condemns. ***'
    : '[B2 clear — the conformed class is genuinely under the bar on the inset witness.]'}`);
}
log('');
log('  THE HONEST FLOOR — every cut in S112\'s funnel only REMOVES facets, so the refusal-sound set with');
log('  NO curtain scope and NO drop rule is a LOWER BOUND on the class under the same bar.');
for (const bar of [1, 5, 10, 20, 45]) {
  const sel = rows.filter((r) => r.normHi > bar);
  const selF = [...uniq(sel)];
  const ar = areaOfSet(selF);
  const wsel = wall.filter((r) => r.normHi > bar);
  log(`    bar ${String(bar).padStart(2)} deg:  ALL high-dihedral pairs with normHi>bar  n=${String(sel.length).padStart(6)}  AREA ${ar.toFixed(2).padStart(8)} mm2 = ${((ar / meshArea) * 100).toFixed(4)}% of mesh    | WALL-only ${((areaOfSet(uniq(wsel)) / meshArea) * 100).toFixed(4)}%`);
}
log(`  ${el()}`);
log('');

// ═══════════════════════════ D9 — WHAT IS THE CURTAIN CLASS? ═══════════════════════════
log('══════════ D9 — WHAT THE EXCLUDED "CURTAIN" CLASS ACTUALLY IS ══════════');
log('  graphRatio / J(centroid). ~1 => a GRAPH, merely steep (the ruler is defined and fine).');
log('  >>1 => the ratio is a footprint-shape / feature-spanning artefact, not steepness.');
{
  const curtainF = [...uniq(curtain)];
  const wallOnlyF = wallF;
  for (const [nm, fs] of [['CURTAIN', curtainF], ['WALL', wallOnlyF]] as Array<[string, number[]]>) {
    const js = fs.map(jCentroid); const grs = fs.map(graphRatio);
    const rat = fs.map((f, i) => grs[i] / Math.max(1e-9, js[i]));
    log(`  ${nm.padEnd(8)} J(centroid) p50 ${q(js, 0.5).toFixed(3)} p90 ${q(js, 0.9).toFixed(3)} MAX ${mxOf(js).toFixed(2)}   graphRatio p50 ${q(grs, 0.5).toFixed(2)} p90 ${q(grs, 0.9).toFixed(2)}   ratio/J p10 ${q(rat, 0.1).toFixed(2)} p50 ${q(rat, 0.5).toFixed(2)} p90 ${q(rat, 0.9).toFixed(2)}`);
    const steep = fs.filter((f) => jCentroid(f) > CURTAIN_RATIO);
    repF(`  ${nm}: analytic J(centroid) > ${CURTAIN_RATIO}`, steep, fs, steep.map(jCentroid));
  }
  log('  (a CURTAIN facet whose J is small but whose graphRatio is huge is NOT on a steep patch of the');
  log('   surface at all — its parameter footprint is degenerate, which is a MESH property, not an');
  log('   analytic one, and it does not make the analytic normal undefined.)');
}
log(`  ${el()}`);
log('');

log('══════════ THE HONEST FIGURE, AS A BAND ══════════');
{
  const allA = (areaOfSet(uniq(rows)) / meshArea) * 100;
  const wallA = (areaOfSet(uniq(wall)) / meshArea) * 100;
  const stradA = (areaOfSet(uniq(straddlingP)) / meshArea) * 100;
  const floorAll = (areaOfSet(uniq(rows.filter((r) => r.normHi > BAR_DEG))) / meshArea) * 100;
  const floorWall = (areaOfSet(uniq(wall.filter((r) => r.normHi > BAR_DEG))) / meshArea) * 100;
  log(`  S108 unscoped high-dihedral                          ${allA.toFixed(4)}%`);
  log(`  S112 published (both legs)                           ${stradA.toFixed(4)}%   = ${(allA / stradA).toFixed(2)}x`);
  log(`  refusal-sound FLOOR, no curtain scope, no drop rule  ${floorAll.toFixed(4)}%   = ${(allA / floorAll).toFixed(2)}x   <== the defensible reduction`);
  log(`  refusal-sound floor, WALL scope kept                 ${floorWall.toFixed(4)}%   = ${(allA / floorWall).toFixed(2)}x`);
  log(`  UNDECIDED (in the class, not refused, no accept certificate): ${(allA - floorAll).toFixed(4)}% of mesh`);
  writeFileSync(`${OUTDIR}/S113D_INTERIOR_${TAG}.json`, `${JSON.stringify({
    style: STYLE, stl: STL, meshFacets: nTri, meshAreaMm2: meshArea, barDeg: BAR_DEG,
    areaPct: { all: allA, wall: wallA, s112Published: stradA, refusalFloorAll: floorAll, refusalFloorWall: floorWall },
  }, null, 2)}\n`);
}
log(`done ${el()}`);
