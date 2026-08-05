// s82HubCensus.ts — DOES GOTHIC HAVE SUPER-HUB VERTICES? (asked by COLLAPSE, answered in 30 s)
//
// COLLAPSE measured on Voronoi: 32 vertices of degree >= 1000 hold 5.62% of the whole mesh, worst
// degree 2,550, median 5. Every 1-RING operator — collapse, re-point, retriangulate, AND MY FLIP — is
// defeated by a 2,550-gon, because a flip can only re-cut one diagonal of one quad.
//
// H-L5: GothicArches, where the constrained flip WORKS (3.51x; 3.73x by area), has NO super-hub class,
//       and that is the structural reason the same pass is refuted on Voronoi.
// KILL: Gothic shows a comparable hub population (any vertex of degree >= 1000, or >1% of facets on
//       vertices of degree >= 100) => "hubs explain the split" is REFUTED and the difference between
//       the two styles is something else. Report the distribution either way; a null result here is
//       just as useful, because it would mean my lever's success is unexplained.
//
// Read-only over a finished STL. Weld is the exact f32 compare used everywhere in this campaign.
//
// Usage:  bash research/tools/run-s82-hub-census.sh     (env PF_S82_STEMS=a,b,c)
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { writeFileSync, mkdirSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const STEMS = (process.env.PF_S82_STEMS
  ?? 'gothicarches_ring_DS-HT_S39CTL,s60flip/gothicarches_ring_DS-HT_S39CTL_G3CHORD,voronoi_ring_D--').split(',');
const OUTDIR = 'research/exchange/_strataConformBisect/s80land';
mkdirSync(OUTDIR, { recursive: true });

log('===== S82 — SUPER-HUB VERTEX CENSUS (are 1-ring operators structurally defeated?) =====');
const out: Record<string, unknown>[] = [];
for (const stem of STEMS) {
  const path = `research/exchange/_strataConformBisect/${stem.trim()}.stl`;
  let m;
  try { m = readMeshFloat64(path, false); } catch { log(`\n${stem}: MISSING ${path}`); continue; }
  const { xyz, nTri } = m;
  const deg = new Int32Array(nTri * 3);
  let NV = 0;
  {
    const buf = new ArrayBuffer(24); const f64 = new Float64Array(buf); const u32 = new Uint32Array(buf);
    const map = new Map<number, number[]>();
    const VX = new Float64Array(nTri * 3); const VY = new Float64Array(nTri * 3); const VZ = new Float64Array(nTri * 3);
    for (let t = 0; t < nTri; t += 1) {
      for (let e = 0; e < 3; e += 1) {
        const i = t * 9 + e * 3;
        const x = xyz[i]; const y = xyz[i + 1]; const z = xyz[i + 2];
        f64[0] = x; f64[1] = y; f64[2] = z;
        let h = 2166136261;
        for (let k = 0; k < 6; k += 1) { h ^= u32[k]; h = Math.imul(h, 16777619); }
        h >>>= 0;
        const b = map.get(h);
        let found = -1;
        if (b !== undefined) { for (const v of b) if (VX[v] === x && VY[v] === y && VZ[v] === z) { found = v; break; } }
        if (found < 0) { found = NV; VX[NV] = x; VY[NV] = y; VZ[NV] = z; NV += 1; if (b === undefined) map.set(h, [found]); else b.push(found); }
        deg[found] += 1;                                    // facet-degree = triangles incident to the vertex
      }
    }
  }
  const d = Array.from(deg.subarray(0, NV)).sort((a, b) => a - b);
  const q = (f: number): number => d[Math.min(d.length - 1, Math.floor(f * d.length))];
  // "facets held" counts INCIDENCES, which is the quantity that matters to a 1-ring operator: it is the
  // share of the mesh whose repair must go through a vertex of that degree.
  const held = (min: number): number => { let s = 0; for (let v = 0; v < NV; v += 1) if (deg[v] >= min) s += deg[v]; return s; };
  const cnt = (min: number): number => { let s = 0; for (let v = 0; v < NV; v += 1) if (deg[v] >= min) s += 1; return s; };
  const tot = nTri * 3;
  log(`\n═════ ${stem.trim()}  (${nTri} facets, ${NV} welded vertices) ═════`);
  log(`  facet-degree  p50 ${q(0.5)}  p99 ${q(0.99)}  p999 ${q(0.999)}  MAX ${d[d.length - 1]}`);
  const rows: Array<[number, number, number]> = [];
  for (const k of [10, 20, 50, 100, 250, 500, 1000, 2000]) {
    const c = cnt(k); const hh = held(k);
    rows.push([k, c, hh]);
    log(`  degree >= ${String(k).padStart(4)}:  ${String(c).padStart(7)} vertices (${((100 * c) / NV).toFixed(4)}%)   holding ${String(hh).padStart(9)} incidences = ${((100 * hh) / tot).toFixed(4)}% of the mesh`);
  }
  const hub1000 = cnt(1000); const held100 = (100 * held(100)) / tot;
  log(`  *** H-L5 READ: degree>=1000 vertices ${hub1000}   share of mesh on degree>=100 vertices ${held100.toFixed(4)}% ***`);
  log(`  ${hub1000 === 0 && held100 < 1 ? '=> NO super-hub class: a 1-ring operator is NOT structurally defeated here.' : '=> HUBS PRESENT — H-L5 REFUTED on this mesh; 1-ring operators are structurally limited.'}`);
  out.push({ stem: stem.trim(), nTri, NV, p50: q(0.5), p99: q(0.99), p999: q(0.999), max: d[d.length - 1], rows, hub1000, heldPct100: held100 });
}
writeFileSync(`${OUTDIR}/S82_HUBS.json`, JSON.stringify(out, null, 2));
log('\nwritten research/exchange/_strataConformBisect/s80land/S82_HUBS.json');
