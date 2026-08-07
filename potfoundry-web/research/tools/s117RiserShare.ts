// s117RiserShare.ts — S117 P4: WHAT IS THE RESIDUAL MADE OF?
//
// A ratio ("APCR is Nx better") says how much moved. It does not say what is LEFT, and on the styles
// whose rA is DISCONTINUOUS (measured in S117_CLIFF_ALL: ArtDeco jumps 4.19793 mm, CelticTriquetra
// 1.63801 mm, both at zero width, the rise surviving a bracket collapse of 1e27x) part of what is left
// CANNOT be cleared by any refinement whatsoever:
//
//   A mesh that is a graph over the (theta, z) chart must contain RISER facets spanning the jump.
//   A riser's perpendicular distance to the radial graph rA is bounded below by about half the jump,
//   because the two sheets it connects are that far apart. Subdividing a riser produces smaller
//   risers at the SAME distance. That is a REPRESENTATION FLOOR of the ruler-plus-chart, not a
//   defect of the mesher — and it is why the campaign's own audit already warned that
//   measureProjectorMax INFLATES riser styles.
//
// This tool takes a mesh and its per-facet R3 (written by s117ApcrReach as an f64 sidecar in live
// order) and cross-tabulates the >bar defect by graphRatio band. graphRatio = 3D area / parametric
// area: a riser has a finite 3D area over a near-zero parametric footprint, so it sits in the high
// band. COUNT + AREA-share + MAX are reported for every cell — never a bare count, never a bare max.
//
// Usage: bash research/tools/run-s117-riser.sh
//   env PF_S117_STL(abs) PF_S117_R3(abs .f64, optional) PF_S117_LABEL PF_S117_BAR PF_S117_JUMP
//       PF_S117_TAG PF_S117_OUTDIR  (several meshes: ';' separated STL/R3/LABEL, parallel)
import { dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

const STLS = envS('PF_S117_STL', '').split(';').filter((s) => s.length > 0);
const R3S = envS('PF_S117_R3', '').split(';');
const LABELS = envS('PF_S117_LABEL', '').split(';');
const JUMPS = envS('PF_S117_JUMP', '').split(';').map((s) => Number(s || '0'));
const BAR = envF('PF_S117_BAR', 0.01);
const OUTDIR = envS('PF_S117_OUTDIR', 'research/exchange/_strataConformBisect/s117');
const TAG = envS('PF_S117_TAG', 'RISER');
if (STLS.length === 0) { log('*** PF_S117_STL required ***'); process.exit(2); }

const pct = (a: number, b: number): string => (b === 0 ? '   —   ' : ((a / b) * 100).toFixed(4));

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('===== S117 P4 — WHAT IS THE RESIDUAL MADE OF?  DEFECT x graphRatio CROSS-TAB =====');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`bar ${BAR} mm.  graphRatio = 3D area / parametric area. A RISER spanning a jump in rA has a finite`);
log('3D area over a near-zero parametric footprint, so it lands in the high band and CANNOT be cleared');
log('by refinement: subdividing a riser makes smaller risers at the same distance from the graph.');
log('');

interface Row { label: string; nT: number; area: number; defN: number; defA: number; defMax: number; bands: { name: string; n: number; a: number; mx: number; dn: number; da: number; dmx: number }[]; halfJump: number; nearHalfJumpN: number; nearHalfJumpA: number; }
const rows: Row[] = [];

for (let si = 0; si < STLS.length; si += 1) {
  const STL = STLS[si];
  const LABEL = (LABELS[si] ?? '').length > 0 ? LABELS[si] : STL.split(/[\\/]/).pop() ?? 'mesh';
  const R3P = (R3S[si] ?? '').trim();
  const jump = JUMPS[si] ?? 0;
  const src = readMeshFloat64(STL, false);
  const nT = src.nTri; const xyz = src.xyz;
  let r3: Float64Array | null = null;
  if (R3P.length > 0 && existsSync(R3P)) {
    const b = readFileSync(R3P);
    r3 = new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8);
    if (r3.length !== nT) { log(`   *** ${LABEL}: R3 sidecar has ${r3.length} entries but the STL has ${nT} facets — REFUSED, cannot align ***`); log(''); continue; }
  } else { log(`   *** ${LABEL}: no R3 sidecar at "${R3P}" — REFUSED. This tool does not invent a position ruler. ***`); log(''); continue; }

  const area = new Float64Array(nT); const gr = new Float64Array(nT);
  let areaTot = 0;
  for (let t = 0; t < nT; t += 1) {
    const o = t * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    area[t] = a3; areaTot += a3;
    const tha = Math.atan2(ay, ax);
    const thb = tha + dThRaw(tha, Math.atan2(by, bx));
    const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
    const rm = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
    const ua = tha * rm, ub = thb * rm, uc = thc * rm;
    const pa = 0.5 * Math.abs((ub - ua) * (cz - az) - (uc - ua) * (bz - az));
    gr[t] = pa > 0 ? a3 / pa : Infinity;
  }
  // NOTE the last two bands. A facet whose PARAMETRIC area is EXACTLY zero has graphRatio = +Infinity,
  // and a half-open [lo, hi) test excludes it from every band — it would vanish from the table without
  // a trace. It gets its OWN row, and the bands are asserted to sum to the facet count below.
  const BANDS: { name: string; lo: number; hi: number }[] = [
    { name: 'graphRatio < 2      (well-shaped in the chart)', lo: 0, hi: 2 },
    { name: 'graphRatio 2 - 10   (tilted)', lo: 2, hi: 10 },
    { name: 'graphRatio 10 - 100 (curtain)', lo: 10, hi: 100 },
    { name: 'graphRatio >= 100   (DEGENERACY POLE / RISER)', lo: 100, hi: Number.MAX_VALUE },
    { name: 'graphRatio = INF    (parametric area EXACTLY 0)', lo: Number.MAX_VALUE, hi: Infinity },
  ];
  let defN = 0; let defA = 0; let defMax = 0;
  for (let t = 0; t < nT; t += 1) { if (r3[t] > BAR) { defN += 1; defA += area[t]; } if (r3[t] > defMax) defMax = r3[t]; }
  const bands = BANDS.map((b) => {
    let n = 0, a = 0, mx = 0, dn = 0, da = 0, dmx = 0;
    for (let t = 0; t < nT; t += 1) {
      const g = gr[t];
      const inBand = b.hi === Infinity ? g >= b.lo : g >= b.lo && g < b.hi;
      if (!inBand) continue;
      n += 1; a += area[t]; if (r3[t] > mx) mx = r3[t];
      if (r3[t] > BAR) { dn += 1; da += area[t]; if (r3[t] > dmx) dmx = r3[t]; }
    }
    return { name: b.name, n, a, mx, dn, da, dmx };
  });
  // facets whose R3 sits at the HALF-JUMP — the riser signature, if a jump was measured for this style
  let njN = 0; let njA = 0;
  if (jump > 0) for (let t = 0; t < nT; t += 1) if (r3[t] >= 0.25 * jump) { njN += 1; njA += area[t]; }

  log(`──────── ${LABEL} ────────`);
  log(`   facets ${nT}   3D area ${areaTot.toFixed(3)} mm2   >${BAR} mm defect: COUNT ${defN} (${pct(defN, nT)}%)  AREA ${defA.toFixed(4)} mm2 (${pct(defA, areaTot)}%)  MAX ${defMax.toExponential(4)} mm`);
  log('   band                                              COUNT      %mesh     AREA mm2    %area    | defect COUNT   defect AREA   %OF DEFECT    band MAX R3');
  for (const b of bands) {
    log(`   ${b.name.padEnd(48)} ${String(b.n).padStart(9)}  ${pct(b.n, nT).padStart(9)}%  ${b.a.toFixed(3).padStart(11)}  ${pct(b.a, areaTot).padStart(7)}% | ${String(b.dn).padStart(12)}  ${b.da.toFixed(4).padStart(12)}  ${pct(b.da, defA).padStart(10)}%  ${b.dmx.toExponential(4).padStart(13)}`);
  }
  {
    // CONTROL: the bands must partition the mesh exactly. If they do not, facets are being dropped
    // silently and every percentage in the table above is wrong.
    const sumN = bands.reduce((s, b) => s + b.n, 0);
    const sumD = bands.reduce((s, b) => s + b.dn, 0);
    log(`   CONTROL  bands sum to ${sumN} facets of ${nT} (${sumN === nT ? 'PARTITION EXACT' : '*** FACETS DROPPED — TABLE VOID ***'});  defect rows sum to ${sumD} of ${defN} (${sumD === defN ? 'exact' : '*** MISMATCH ***'})`);
  }
  if (jump > 0) {
    log(`   RISER SIGNATURE (this style's rA jumps ${jump.toFixed(6)} mm; half-jump ${(jump / 2).toFixed(6)} mm):`);
    log(`      facets with R3 >= 1/4 of the jump (${(0.25 * jump).toFixed(4)} mm): COUNT ${njN} (${pct(njN, nT)}%)  AREA ${njA.toFixed(4)} mm2 = ${pct(njA, defA)}% OF THE >${BAR} mm DEFECT AREA`);
    log(`      => that share is a REPRESENTATION FLOOR of (radial chart + perpendicular-to-rA ruler). No refinement can move it.`);
  }
  log('');
  rows.push({ label: LABEL, nT, area: areaTot, defN, defA, defMax, bands, halfJump: jump / 2, nearHalfJumpN: njN, nearHalfJumpA: njA });
}

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   SUMMARY — the POLE/RISER share of the >bar defect AREA is the part refinement cannot reach');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   mesh                                        defect AREA mm2   POLE share of defect   MAX R3 mm');
for (const r of rows) {
  const pole = { da: r.bands[3].da + r.bands[4].da };
  log(`   ${r.label.padEnd(42)} ${r.defA.toFixed(4).padStart(15)}   ${pct(pole.da, r.defA).padStart(19)}%   ${r.defMax.toExponential(4)}`);
}
writeFileSync(`${OUTDIR}/S117_RISER_${TAG}.json`, JSON.stringify(rows, null, 1));
log(`json -> ${OUTDIR}/S117_RISER_${TAG}.json`);
log('S117 RISER SHARE DONE');
