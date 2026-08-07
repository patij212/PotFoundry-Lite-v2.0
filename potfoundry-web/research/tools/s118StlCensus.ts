// research/tools/s118StlCensus.ts — S118. The SAME emit-invariant census, run offline on a written STL.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// *** READ THE RESOLUTION CAVEAT BEFORE READING ANY NUMBER THIS TOOL PRINTS. ***
//
// A binary STL stores f32 — a 24-bit mantissa. At r = 51 mm the coordinate quantum is 51 * 2^-23 =
// 6.1e-6 mm = 6.1 NANOMETRES. The tool computes and prints that floor per mesh rather than asserting it,
// because the first version of this header asserted 5.4 MICROmetres — a 1000x error, which would have
// condemned the entire 2 um ladder as noise when in fact the bar sits ~330x above the quantum.
//
//    SO: the ladder rows at 0.5 um and above are REAL MEASUREMENTS OF THE MESH.
//    Rows at or under the printed floor are the FILE FORMAT and are labelled as such.
//
// ONE CONSEQUENCE IS LOAD-BEARING AND MUST NOT BE FORGOTTEN. A facet whose (theta,z) footprint is
// near-degenerate has a signed parameter area that is a difference of nearly equal f32 products, so
// ROUNDING TO f32 ON WRITE CAN FLIP ITS SIGN. A small T2 "fold" count read off an STL is therefore NOT
// evidence that the emitter produced a fold; it may be evidence that the emitter produced something so thin
// that the file format cannot say which way round it is. Only the driver's own f64 census
// (PF_CB_S118_CENSUS=1), which scores the facet before it is ever rounded, can separate the two.
//
// Scar 6 still applies in the other direction: "under my resolution" is never "does not matter". A slicer
// does exact arithmetic on exactly these f32 values, so a facet that is degenerate AS STORED is degenerate
// for the consumer that matters, whatever the f64 original looked like.
//
//   bash research/tools/run-s118-stlcensus.sh <path.stl> [more.stl ...]
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { checkS118Admit, makeS118Verdict, unwrapTheta3 } from '../bridge/_s118EmitAdmit';

const LADDER_UM = [0.1, 0.5, 1, 2, 5, 10, 20, 50];

function census(path: string): void {
  const { xyz, nTri } = readMeshFloat64(path, false);
  const v = makeS118Verdict();
  // sigma is MEASURED, not assumed: the majority parametric winding over the whole mesh.
  let plus = 0; let minus = 0;
  let rMax = 0;
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const th = unwrapTheta3(
      Math.atan2(xyz[o + 1], xyz[o]), Math.atan2(xyz[o + 4], xyz[o + 3]), Math.atan2(xyz[o + 7], xyz[o + 6]));
    checkS118Admit(xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5],
      xyz[o + 6], xyz[o + 7], xyz[o + 8], th[0], th[1], th[2], { sigma: 1, tauQ: 0, minAltMm: 0 }, v);
    if (v.apSMm2 > 0) plus += 1; else if (v.apSMm2 < 0) minus += 1;
    for (let k = 0; k < 3; k += 1) {
      const r = Math.hypot(xyz[o + k * 3], xyz[o + k * 3 + 1]);
      if (r > rMax) rMax = r;
    }
  }
  const sigma: 1 | -1 = minus > plus ? -1 : 1;
  const f32FloorUm = rMax * 2 ** -23 * 1000;

  let area = 0; let degN = 0; let degA = 0; let foldN = 0; let foldA = 0; let foldMaxA = 0;
  let altMin = Number.POSITIVE_INFINITY;
  const ladN = new Array<number>(LADDER_UM.length).fill(0);
  const ladA = new Array<number>(LADDER_UM.length).fill(0);
  const ladMax = new Array<number>(LADDER_UM.length).fill(0);
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const th = unwrapTheta3(
      Math.atan2(xyz[o + 1], xyz[o]), Math.atan2(xyz[o + 4], xyz[o + 3]), Math.atan2(xyz[o + 7], xyz[o + 6]));
    checkS118Admit(xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5],
      xyz[o + 6], xyz[o + 7], xyz[o + 8], th[0], th[1], th[2], { sigma, tauQ: 0, minAltMm: 0 }, v);
    area += v.a3Mm2;
    if (v.minAltMm < altMin) altMin = v.minAltMm;
    if (!(v.a3Mm2 > 0) || !Number.isFinite(v.qP) || Math.abs(v.qP) < 0.005) { degN += 1; degA += v.a3Mm2 > 0 ? v.a3Mm2 : 0; }
    if (!(sigma * v.apSMm2 > 0)) { foldN += 1; foldA += v.a3Mm2; if (v.a3Mm2 > foldMaxA) foldMaxA = v.a3Mm2; }
    for (let k = 0; k < LADDER_UM.length; k += 1) {
      if (v.minAltMm < LADDER_UM[k] / 1000) {
        ladN[k] += 1; ladA[k] += v.a3Mm2; if (v.a3Mm2 > ladMax[k]) ladMax[k] = v.a3Mm2;
      }
    }
  }
  // ── WHERE ARE THE NEEDLES IN z? THE TREAD TEST. ────────────────────────────────────────────────────────
  // The driver emits its outer wall through `bisectAt` and then, for every detected C0 z-step, a TREAD
  // ANNULUS through `stitchRings` — a greedy angular zip between two boundary loops with NO admission test
  // of any kind and no parameter-space placement. If the needle class is tread-borne it must pile up at a
  // handful of DISCRETE z values (one per z-step); if it is wall-borne it must be spread over z. This
  // histogram is that test, and it is analytic-free.
  const zbN = new Map<number, number>();
  const zbA = new Map<number, number>();
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const th = unwrapTheta3(
      Math.atan2(xyz[o + 1], xyz[o]), Math.atan2(xyz[o + 4], xyz[o + 3]), Math.atan2(xyz[o + 7], xyz[o + 6]));
    checkS118Admit(xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5],
      xyz[o + 6], xyz[o + 7], xyz[o + 8], th[0], th[1], th[2], { sigma, tauQ: 0, minAltMm: 0 }, v);
    if (!(v.minAltMm < 2e-3)) continue;
    const zc = Math.round(((xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3) * 10) / 10;  // 0.1 mm bins
    zbN.set(zc, (zbN.get(zc) ?? 0) + 1);
    zbA.set(zc, (zbA.get(zc) ?? 0) + v.a3Mm2);
  }

  const pc = (x: number): string => (area > 0 ? ((100 * x) / area).toFixed(6) : 'n/a');
  process.stdout.write(`\n===== ${path}\n`);
  process.stdout.write(`  facets ${nTri}   area ${area.toFixed(3)} mm2   rMax ${rMax.toFixed(3)} mm\n`);
  process.stdout.write(`  sigma MEASURED ${sigma > 0 ? '+1' : '-1'}   (+${plus} / -${minus})\n`);
  process.stdout.write(`  *** f32 STORAGE FLOOR FOR THIS MESH: ${f32FloorUm.toFixed(3)} um.`
    + ' Ladder rows below this are the FILE FORMAT, not the mesh. ***\n');
  process.stdout.write(`  T1 degenerate |qP|<0.005 : COUNT ${degN}   AREA ${degA.toFixed(4)} = ${pc(degA)}%\n`);
  process.stdout.write(`  T2 fold sigma*apS<=0     : COUNT ${foldN}   AREA ${foldA.toFixed(4)} = ${pc(foldA)}%`
    + `   MAX single folded facet ${foldMaxA.toExponential(3)} mm2\n`);
  process.stdout.write(`  mesh-wide MIN arc altitude ${(altMin * 1e6).toFixed(3)} nm\n`);
  process.stdout.write('  LADDER  (COUNT + AREA-share + MAX facet area — never a bare count, never a bare max)\n');
  for (let k = 0; k < LADDER_UM.length; k += 1) {
    process.stdout.write(`    arcAlt < ${String(LADDER_UM[k]).padStart(5)} um : COUNT ${String(ladN[k]).padStart(9)}`
      + `   AREA ${ladA[k].toFixed(4).padStart(12)} mm2 = ${pc(ladA[k]).padStart(10)}%`
      + `   MAX facet ${ladMax[k].toExponential(3)}`
      + (LADDER_UM[k] < f32FloorUm ? '   [UNDER THE f32 FLOOR]' : '') + '\n');
  }
  const rows = [...zbN.entries()].sort((p, q) => (zbA.get(q[0]) ?? 0) - (zbA.get(p[0]) ?? 0));
  const totN = rows.reduce((s2, r) => s2 + r[1], 0);
  const totA = rows.reduce((s2, r) => s2 + (zbA.get(r[0]) ?? 0), 0);
  process.stdout.write(`  NEEDLE CLASS (<2 um) BY z, 0.1 mm bins — ${rows.length} occupied bins,`
    + ` ${totN} facets, ${totA.toFixed(4)} mm2. Top 12 by area:\n`);
  for (const [z, n] of rows.slice(0, 12)) {
    const a = zbA.get(z) ?? 0;
    process.stdout.write(`    z ${z.toFixed(1).padStart(7)} mm : COUNT ${String(n).padStart(8)}`
      + `   AREA ${a.toFixed(4).padStart(11)} mm2 = ${totA > 0 ? ((100 * a) / totA).toFixed(3) : 'n/a'}% of the class\n`);
  }
  const top3 = rows.slice(0, 3).reduce((s2, r) => s2 + (zbA.get(r[0]) ?? 0), 0);
  process.stdout.write(`    >>> TOP 3 z-BINS HOLD ${totA > 0 ? ((100 * top3) / totA).toFixed(2) : 'n/a'}%`
    + ' OF THE NEEDLE-CLASS AREA. Concentrated at a few discrete z ⇒ TREAD-BORNE (stitchRings);'
    + ' spread over z ⇒ WALL-BORNE (bisectAt).\n');
}

for (const p of process.argv.slice(2)) census(p);
