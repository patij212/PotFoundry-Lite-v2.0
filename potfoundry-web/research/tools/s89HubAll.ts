// s89HubAll.ts — HOW MANY STYLES ARE GOTHIC-CLASS (HUB-FREE)? i.e. HOW BIG IS "THE REMAINING STYLES"?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED (S89_PLANREVIEW_FINDINGS.md §0, H-P2a). WRITTEN BEFORE THE FIRST RUN.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//
// P2 of the plan under review says "land the constrained flip on the REMAINING STYLES". The flip is
// banked on GothicArches (2 mis-oriented facets) and REFUTED on Voronoi (1.33x), and S82 gave the
// structural reason: Voronoi has 32 vertices of degree >= 1000 holding 5.62% of the mesh, and every
// 1-ring operator (flip, collapse, re-point, cavity DP) is defeated by a 2,550-gon.
//
// NOBODY HAS COUNTED HOW MANY STYLES ARE ON EACH SIDE OF THAT LINE. This does, over every style the
// STRATA driver has an artifact for on disk, at the SAME `_ring_D--` arm (one driver, one flag set).
//
// H-P2a KILL: <= 2 of the styles satisfy S82's own hub-free read
//             (degree>=1000 count == 0 AND share-of-mesh on degree>=100 vertices < 1%).
//             Then "the remaining styles" is a set of one or two and P2 is not a plan item.
//
// C-S89-4 CONTROL: this must REPRODUCE S82's published rows for
//     gothicarches_ring_DS-HT_S39CTL   and   voronoi_ring_D--  (max facet-degree 2,550, 32 vertices
//     of degree >= 1000 holding 5.62% of the mesh).
//     The weld + degree code below is S82's, character for character (`s82HubCensus.ts:36-62`), so a
//     mismatch is a mesh/path problem, not a method problem. I RE-DERIVE rather than run s82HubCensus
//     because that tool unconditionally overwrites `s80land/S82_HUBS.json`, a file I do not own.
//
// WHAT THIS DOES NOT MEASURE: whether a hub-free style's flip actually WINS (that needs a flip arm);
// whether `_ring_D--` is the arm any style should be judged at; anything about position or orientation.
// It answers exactly one question: the SIZE of the set P2 addresses.
//
// Read-only. Usage: bash research/tools/run-s89-huball.sh   (env PF_S89_STEMS=a,b,c)
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const DIR = 'research/exchange/_strataConformBisect';
const DEFAULT_STEMS = [
  // C-S89-4 controls first, so a bad control is visible before any new row is read
  'gothicarches_ring_DS-HT_S39CTL', 'voronoi_ring_D--',
  // every style with a `_ring_D--` artifact from the same driver arm
  'artdeco_ring_D--', 'bamboosegments_ring_D--', 'basketweave_ring_D--', 'celticknot_ring_D--',
  'celtictriquetra_ring_D--', 'crystalline_ring_D--', 'dragonscales_ring_D--', 'fourierbloom_ring_D--',
  'geometricstar_ring_D--', 'gothicarches_ring_D--', 'gyroidmanifold_ring_D--', 'hexagonalhive_ring_D--',
  'lowpolyfacet_ring_D--', 'rippleinterference_ring_D--', 'spiralridges_ring_D--',
  'superellipsemorph_ring_D--', 'superformulablossom_ring_D--', 'waveinterference_ring_D--',
];
const STEMS = (process.env.PF_S89_STEMS ?? DEFAULT_STEMS.join(',')).split(',');
const OUTDIR = `${DIR}/s89cost`;
mkdirSync(OUTDIR, { recursive: true });

log('===== S89 — SUPER-HUB CENSUS ACROSS EVERY STYLE THE STRATA DRIVER HAS ON DISK =====');
log('(weld + facet-degree code re-derived character-for-character from s82HubCensus.ts:36-62)');
const out: Record<string, unknown>[] = [];
for (const stemRaw of STEMS) {
  const stem = stemRaw.trim();
  const path = `${DIR}/${stem}.stl`;
  if (!existsSync(path)) { log(`\n${stem}: MISSING ${path}`); continue; }
  let m;
  try { m = readMeshFloat64(path, false); } catch (e) { log(`\n${stem}: UNREADABLE (${String(e)})`); continue; }
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
        deg[found] += 1;
      }
    }
  }
  const d = Array.from(deg.subarray(0, NV)).sort((a, b) => a - b);
  const q = (f: number): number => d[Math.min(d.length - 1, Math.floor(f * d.length))];
  const held = (min: number): number => { let s = 0; for (let v = 0; v < NV; v += 1) if (deg[v] >= min) s += deg[v]; return s; };
  const cnt = (min: number): number => { let s = 0; for (let v = 0; v < NV; v += 1) if (deg[v] >= min) s += 1; return s; };
  const tot = nTri * 3;
  const hub1000 = cnt(1000); const held100 = (100 * held(100)) / tot;
  const hubFree = hub1000 === 0 && held100 < 1;
  log(`\n===== ${stem}  (${nTri} facets, ${NV} welded vertices) =====`);
  log(`  facet-degree  p50 ${q(0.5)}  p99 ${q(0.99)}  p999 ${q(0.999)}  MAX ${d[d.length - 1]}`);
  const rows: Array<[number, number, number]> = [];
  for (const k of [10, 20, 50, 100, 250, 500, 1000, 2000]) {
    const c = cnt(k); const hh = held(k);
    rows.push([k, c, hh]);
    log(`  degree >= ${String(k).padStart(4)}:  ${String(c).padStart(7)} vertices (${((100 * c) / NV).toFixed(4)}%)   holding ${String(hh).padStart(9)} incidences = ${((100 * hh) / tot).toFixed(4)}% of the mesh`);
  }
  log(`  *** degree>=1000 vertices ${hub1000}   share of mesh on degree>=100 vertices ${held100.toFixed(4)}%   => ${hubFree ? 'HUB-FREE (Gothic-class)' : 'HUBS PRESENT (1-ring operators structurally limited)'} ***`);
  out.push({ stem, nTri, NV, p50: q(0.5), p99: q(0.99), p999: q(0.999), max: d[d.length - 1], rows, hub1000, heldPct100: held100, hubFree });
}

log('\n═════ H-P2a — HOW BIG IS "THE REMAINING STYLES"? ═════');
const styleRows = out.filter((r) => String(r.stem).endsWith('_ring_D--'));
const free = styleRows.filter((r) => r.hubFree === true);
log(`  styles censused at the same _ring_D-- arm: ${styleRows.length}`);
log(`  HUB-FREE (Gothic-class, a 1-ring flip is not structurally defeated): ${free.length}`);
log(`    ${free.map((r) => String(r.stem).replace('_ring_D--', '')).join(', ') || '(none)'}`);
const hubbed = styleRows.filter((r) => r.hubFree !== true);
log(`  HUBBED: ${hubbed.length}`);
log(`    ${hubbed.map((r) => `${String(r.stem).replace('_ring_D--', '')}(max ${String(r.max)})`).join(', ') || '(none)'}`);
log(`  *** H-P2a pre-registered KILL was <= 2 hub-free. MEASURED ${free.length}. ${free.length <= 2 ? 'KILLED — P2 is a set of one or two.' : 'NOT KILLED — P2 addresses a real set.'} ***`);

writeFileSync(`${OUTDIR}/S89_HUBS_ALL.json`, JSON.stringify(out, null, 2));
log(`\nwritten ${OUTDIR}/S89_HUBS_ALL.json`);
