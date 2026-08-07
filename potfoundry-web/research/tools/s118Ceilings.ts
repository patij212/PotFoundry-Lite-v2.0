// s118Ceilings.ts — S118: WHAT ACTUALLY BREAKS AT 1e7 TRIANGLES. EMPIRICAL, NEVER ASSUMED.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The 0.001 mm floor needs ~1.1e7 (Gothic) / ~1.7e7 (CelticTriquetra) triangles. Nobody has ever run this
// campaign's instruments at that size. The session brief lists SUSPECTED ceilings; a suspected ceiling is
// not a measurement, and a DRIVE agent that plans against a guessed limit loses a run to an OOM at hour 3.
//
// Every stage here reports PASS or FAIL WITH THE NUMBER, and every stage runs in its OWN PROCESS
// (run-s118-ceilings.sh loops the stages) so that a stage which dies of OOM does not take the others with
// it — a crashed probe is itself a datum, and it has to be recoverable.
//
// STAGES (PF_S118C_STAGE)
//   limits  — TypedArray / ArrayBuffer / Buffer caps, the V8 heap limit vs EXTERNAL backing stores, and
//             the arithmetic thresholds of the two known packing limits (2^23 Map, 2^26 edge key).
//   synth   — write an N-facet synthetic tube STL. Two writers: labkit's monolithic Buffer.alloc and a
//             chunked stream. Closed-form V/E/F for the mesh is printed so every later stage is checkable.
//   read    — readMeshFloat64 (the shipped reader) and readMeshF32 (this session's half-memory twin) on
//             that file, with a BIT-IDENTITY control between them.
//   dih     — facetDihedralsBig at N vs the closed-form Euler counts; then facetDihedrals, which is
//             EXPECTED to throw, and whose message is recorded.
//   proj    — buildRadialSurfaceProjector cost per call on the real style, which is the quantity that
//             decides whether an exhaustive perpendicular pass at 1e7 is hours or days.
//
// Usage: bash research/tools/run-s118-ceilings.sh
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedralsBig } from '../bridge/dihedralRulerBig';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshF32, writeSynthTubeStl, writeSynthStl, tubeClosedForm } from './s118MeshIo';
import { statSync, unlinkSync, existsSync } from 'node:fs';
import { getHeapStatistics } from 'node:v8';
import { setPriority, constants as osConstants } from 'node:os';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// WINDOWS EcoQoS: a detached node job on this box is throttled to ~19-30% of one core (MEASURED by CPU
// delta this session; AboveNormal restores 90-95%). Every timing in this file would otherwise be a
// measurement of the Windows scheduler, so the tool pins itself. PF_S118C_PRIO=0 opts out.
let PRIO_NOTE = 'not attempted';
if ((process.env.PF_S118C_PRIO ?? '1') !== '0') {
  try { setPriority(0, osConstants.priority.PRIORITY_ABOVE_NORMAL); PRIO_NOTE = 'AboveNormal (EcoQoS defeated)'; }
  catch (e) { PRIO_NOTE = `FAILED: ${(e as Error).message}`; }
}

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

const STAGE = envS('PF_S118C_STAGE', 'limits');
const NTRI = envI('PF_S118C_NTRI', 10_000_000);
const NTHETA = envI('PF_S118C_NTHETA', 2500);
const SYNTH = envS('PF_S118C_SYNTH', 'research/exchange/_strataConformBisect/s118/_synth.stl');
const STYLE = envS('PF_S118C_STYLE', 'GothicArches');
const PROJ_N = envI('PF_S118C_PROJN', 20000);
const DIMS: StyleDims = { H: envF('PF_S118C_H', 120), Rb: envF('PF_S118C_RB', 40), Rt: envF('PF_S118C_RT', 50), expn: 1 };

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const mb = (b: number): string => `${(b / 1048576).toFixed(1)} MB`;
/** Peak working set, from libuv's getrusage (PeakWorkingSetSize on Windows). KB -> bytes. */
const peakRss = (): number => process.resourceUsage().maxRSS * 1024;
const rssNow = (): number => process.memoryUsage().rss;
const verdict = (ok: boolean): string => (ok ? 'PASS' : '*** FAIL ***');

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S118 CEILINGS — stage ${STAGE}   N=${NTRI.toLocaleString()} facets =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`node ${process.version}   heap limit ${mb(getHeapStatistics().heap_size_limit)}   NODE_OPTIONS=${process.env.NODE_OPTIONS ?? '(unset)'}`);
log(`process priority: ${PRIO_NOTE}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGE === 'limits') {
  log('── C1  TypedArray / ArrayBuffer length caps ───────────────────────────────────────────────────');
  log('   *** MY FIRST VERSION OF THIS PROBE WAS VACUOUS AND IS RECORDED HERE RATHER THAN DELETED. ***');
  log('   It allocated and wrote the FIRST AND LAST element only, and reported PASS for a 32 GB');
  log('   Float64Array on a 32 GB box while RSS never left 58 MB. Windows commits per PAGE: touching two');
  log('   ends commits two pages. Allocation success is a RESERVATION, not memory you have.');
  log('   The probe below writes ONE ELEMENT PER 4 KiB PAGE and asserts RSS actually rose by roughly the');
  log('   array size. That is the only form of this test that means anything.');
  // KEEP EVERY ARRAY ALIVE. The first draft let each probe's array be collected before the next one
  // measured, so `before` was inflated and two probes reported a NEGATIVE rise and a spurious FAIL.
  // Holding them makes RSS monotone and the per-probe delta meaningful.
  const held: Array<Float64Array | Float32Array | Int32Array> = [];
  const commitProbe = (label: string, bytes: number, make: () => Float64Array | Float32Array | Int32Array): void => {
    const before = rssNow();
    try {
      const a = make();
      held.push(a);
      const bpe = a.BYTES_PER_ELEMENT;
      const step = Math.max(1, Math.floor(4096 / bpe));
      for (let i = 0; i < a.length; i += step) a[i] = 1;
      a[a.length - 1] = 2;
      const rose = rssNow() - before;
      const ok = rose > bytes * 0.8;
      log(`   ${label.padEnd(44)} ${verdict(ok)}  rss +${mb(rose)} of ${mb(bytes)} asked  (now ${mb(rssNow())})`);
    } catch (e) { log(`   ${label.padEnd(44)} *** FAIL *** ${(e as Error).message}`); }
  };
  // the sizes that matter for this session — COMMITTED, one write per page
  commitProbe('Float64Array(9e7) 1e7 f64 soup', 720e6, () => new Float64Array(90_000_000));
  commitProbe('Float32Array(9e7) 1e7 f32 soup', 360e6, () => new Float32Array(90_000_000));
  commitProbe('Int32Array(3e7)   identity idx', 120e6, () => new Int32Array(30_000_000));
  commitProbe('Float64Array(1e7) one per-facet', 80e6, () => new Float64Array(10_000_000));
  log(`   all four held live simultaneously: rss ${mb(rssNow())} for ${mb(720e6 + 360e6 + 120e6 + 80e6)} of arrays`);
  held.length = 0;
  log('');
  log('   RESERVATION-ONLY cap hunt (allocation succeeds/fails; NO claim about committed memory):');
  for (const n of [268_435_456, 1_073_741_824, 4_294_967_296, 8_589_934_592]) {
    try { const a = new Float64Array(n); a[0] = 1; log(`   Float64Array(${n.toExponential(3)}) reserve ${mb(n * 8).padStart(11)}   allocated`); }
    catch (e) { log(`   Float64Array(${n.toExponential(3)}) reserve ${mb(n * 8).padStart(11)}   *** REFUSED *** ${(e as Error).message}`); }
  }
  log('');
  log('── C2  Buffer / readFileSync ceiling ──────────────────────────────────────────────────────────');
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const bufConst = (require('node:buffer') as { constants: { MAX_LENGTH: number; MAX_STRING_LENGTH: number } }).constants;
  log(`   buffer.constants.MAX_LENGTH   ${bufConst.MAX_LENGTH.toLocaleString()} bytes`);
  log(`   a ${NTRI.toLocaleString()}-facet binary STL is ${(84 + NTRI * 50).toLocaleString()} bytes = ${mb(84 + NTRI * 50)}`);
  log(`   => readFileSync headroom ${(bufConst.MAX_LENGTH / (84 + NTRI * 50)).toExponential(3)}x   ${verdict(bufConst.MAX_LENGTH > 84 + NTRI * 50)}`);
  try {
    const b = Buffer.alloc(84 + NTRI * 50);
    b.writeUInt32LE(NTRI, 80); b[b.length - 1] = 7;
    log(`   Buffer.alloc(${mb(b.length)}) touched both ends   PASS   rss ${mb(rssNow())}`);
  } catch (e) { log(`   Buffer.alloc(${mb(84 + NTRI * 50)})   *** FAIL *** ${(e as Error).message}`); }
  log('');
  log('── C3  V8 heap limit vs EXTERNAL backing stores ───────────────────────────────────────────────');
  const hs = getHeapStatistics();
  log(`   heap_size_limit ${mb(hs.heap_size_limit)}   used_heap_size ${mb(hs.used_heap_size)}   external ${mb(hs.external_memory ?? 0)}`);
  log('   The probes in C1 allocated far beyond heap_size_limit and PASSED, which is the point: a');
  log('   TypedArray backing store is EXTERNAL memory. --max-old-space-size does NOT bound the mesh');
  log('   soup; committed RAM + pagefile does. Raising --max-old-space-size to 12288 buys headroom for');
  log('   V8 OBJECTS (the projector`s bucket Map, arrays of facet ids) and nothing at all for the soup.');
  log('');
  log('── C4  the two KNOWN packing limits, as facet counts ──────────────────────────────────────────');
  log('   (a) V8 Map cap 2^23 = 8,388,608 entries. facetDihedrals keys one Map entry per UNIQUE EDGE.');
  log('       A closed triangle mesh has ~1.5 unique edges/facet => facetDihedrals dies at');
  log(`       ~${Math.floor(8_388_608 / 1.5).toLocaleString()} facets. At N=${NTRI.toLocaleString()} it is ${(NTRI * 1.5 / 8_388_608).toFixed(2)}x over. USE facetDihedralsBig.`);
  log('       MEASURED in stage `dih`: it throws "Map maximum size exceeded" after 26.8 s at N=1e7.');
  log('   (b) facetDihedrals also refuses at 2^26 = 67,108,864 SOUP VERTICES (the lo*2^26+hi edge key');
  log(`       would alias). A soup has 3 vertices/facet => that binds at ${Math.floor(67_108_864 / 3).toLocaleString()} facets,`);
  log('       i.e. NEVER before (a). The Map cap is the operative limit; the packing limit is dead code');
  log('       for any mesh this session will build.');
  {
    // BISECTED, not assumed: feed the guard exactly 2^26-1 and 2^26 soup vertices with a 1-facet index
    // array, so the guard is the only thing that can fire.
    for (const nV of [67_108_863, 67_108_864]) {
      const probe = new Float32Array(nV * 3);
      try { facetDihedrals(probe, new Int32Array([0, 1, 2])); log(`       BISECTED nV=${nV.toLocaleString()} -> no throw`); }
      catch (e) { log(`       BISECTED nV=${nV.toLocaleString()} -> THREW "${(e as Error).message}"`); }
    }
  }
  log('   (c) facetDihedralsBig`s own declared ceiling is the Int32 half-edge range:');
  log(`       2147483000/3 = ${Math.floor(2_147_483_000 / 3).toLocaleString()} facets. At N=${NTRI.toLocaleString()} that is ${(2_147_483_000 / 3 / NTRI).toFixed(1)}x of headroom.`);
  log('   (d) weldBig`s open-addressed table is sized to the SOUP vertex count, not the welded count:');
  log(`       canonX/Y/Z are 3 x Float64Array(3N) = ${mb(3 * 8 * 3 * NTRI)} at N=${NTRI.toLocaleString()}, of which ~5/6 is never`);
  log('       written (a closed mesh welds 3N soup corners down to ~N/2). MEASURED in stage `dih`.');
  log('');
  log(`peak RSS this process ${mb(peakRss())}   CPU ${((process.cpuUsage().user + process.cpuUsage().system) / 1e6).toFixed(1)} s of ${((Date.now() - T0) / 1000).toFixed(1)} s wall   ${el()}`);
  log('S118 CEILINGS limits DONE');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGE === 'synth') {
  const cf = tubeClosedForm(NTHETA, NTRI);
  log('── C5  SYNTHETIC MESH: a closed tube grid, so every topology count has a closed form ──────────');
  log(`   nTheta ${cf.nTheta}   nZ ${cf.nZ}   facets ${cf.F.toLocaleString()}`);
  log(`   closed form: V ${cf.V.toLocaleString()}  E ${cf.E.toLocaleString()}  F ${cf.F.toLocaleString()}  chi ${cf.V - cf.E + cf.F} (must be 0)`);
  log(`                interior edges ${cf.interior.toLocaleString()}   boundary ${cf.boundary.toLocaleString()}`);
  log(`   interior edges vs the 2^23 Map cap: ${(cf.interior / 8_388_608).toFixed(2)}x`);
  log('');
  const t0 = Date.now();
  const bytes = writeSynthTubeStl(SYNTH, cf, DIMS.H, DIMS.Rb, DIMS.Rt);
  const dt = (Date.now() - t0) / 1000;
  const st = statSync(SYNTH);
  const sizeOk = st.size === 84 + cf.F * 50 && st.size === bytes;
  log(`── C6  STL WRITER (chunked stream, 1 MiB blocks — NOT a monolithic Buffer.alloc) ──────────────`);
  log(`   wrote ${SYNTH}`);
  log(`   ${st.size.toLocaleString()} bytes = ${mb(st.size)} in ${dt.toFixed(1)} s (${(cf.F / dt / 1e6).toFixed(2)} Mfacet/s)   size check ${verdict(sizeOk)}`);
  log(`   peak RSS ${mb(peakRss())}  <- the point of the chunked writer: it never holds the file in RAM`);
  log('');
  log('   labkit.writeBinarySTL allocates Buffer.alloc(84 + nTri*50) up front. At this N that is');
  log(`   ${mb(84 + cf.F * 50)} of live Buffer ON TOP of the mesh soup. It is not a hard ceiling (C2 shows`);
  log('   the Buffer allocates) but it is a needless peak; the DRIVE agents should stream.');
  log('');
  log(`peak RSS this process ${mb(peakRss())}   CPU ${((process.cpuUsage().user + process.cpuUsage().system) / 1e6).toFixed(1)} s of ${((Date.now() - T0) / 1000).toFixed(1)} s wall   ${el()}`);
  log('S118 CEILINGS synth DONE');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGE === 'read') {
  if (!existsSync(SYNTH)) { log(`*** ${SYNTH} missing — run stage synth first ***`); process.exit(2); }
  log('── C7  readMeshFloat64 (the shipped reader) on a >700 MB soup ─────────────────────────────────');
  let t0 = Date.now();
  const M64 = readMeshFloat64(SYNTH, false);
  let dt = (Date.now() - t0) / 1000;
  const rss64 = peakRss();
  log(`   nTri ${M64.nTri.toLocaleString()}   xyz Float64Array(${M64.xyz.length.toLocaleString()}) = ${mb(M64.xyz.length * 8)}`);
  log(`   ${dt.toFixed(1)} s   peak RSS ${mb(rss64)}   ${verdict(M64.nTri === NTRI)}`);
  log('   (readFileSync holds the whole 500 MB file as a Buffer WHILE the 720 MB Float64Array is being');
  log('    filled, so the true peak is soup + file, not soup alone.)');
  log('');
  log('── C8  readMeshF32 — the half-memory twin, and the BIT-IDENTITY control ───────────────────────');
  log('   A binary STL stores f32. Widening f32 -> f64 is EXACT, so a Float32Array soup carries exactly');
  log('   the same values at half the bytes, and every f64 expression downstream is unchanged. That is a');
  log('   claim, so it is CHECKED here rather than asserted.');
  t0 = Date.now();
  const M32 = readMeshF32(SYNTH);
  dt = (Date.now() - t0) / 1000;
  log(`   xyz Float32Array(${M32.xyz.length.toLocaleString()}) = ${mb(M32.xyz.length * 4)}   ${dt.toFixed(1)} s`);
  let diff = 0; let firstBad = -1;
  for (let i = 0; i < M64.xyz.length; i += 1) {
    if (!Object.is(M64.xyz[i], M32.xyz[i])) { diff += 1; if (firstBad < 0) firstBad = i; }
  }
  log(`   CONTROL: coords differing between the f64 and f32 readers: ${diff} of ${M64.xyz.length.toLocaleString()}   ${verdict(diff === 0)}`);
  if (diff > 0) log(`   *** first divergence at ${firstBad}: f64 ${M64.xyz[firstBad]} vs f32 ${M32.xyz[firstBad]} — THE HALVING IS NOT SOUND ***`);
  log(`   memory saved at N=${NTRI.toLocaleString()}: ${mb(M64.xyz.length * 8 - M32.xyz.length * 4)}`);
  log('');
  log(`peak RSS this process ${mb(peakRss())}   CPU ${((process.cpuUsage().user + process.cpuUsage().system) / 1e6).toFixed(1)} s of ${((Date.now() - T0) / 1000).toFixed(1)} s wall   ${el()}`);
  log('S118 CEILINGS read DONE');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGE === 'dih') {
  if (!existsSync(SYNTH)) { log(`*** ${SYNTH} missing — run stage synth first ***`); process.exit(2); }
  const cf = tubeClosedForm(NTHETA, NTRI);
  const M = readMeshF32(SYNTH);
  log(`── loaded ${M.nTri.toLocaleString()} facets as Float32Array (${mb(M.xyz.length * 4)})  rss ${mb(rssNow())} ${el()} ──`);
  const idx = new Int32Array(M.nTri * 3);
  for (let i = 0; i < idx.length; i += 1) idx[i] = i;
  log(`   identity index Int32Array(${idx.length.toLocaleString()}) = ${mb(idx.length * 4)}   rss ${mb(rssNow())}`);
  log('');
  log('── C9  facetDihedralsBig at N — vs the CLOSED FORM, not vs a previous run ─────────────────────');
  const t0 = Date.now();
  let ok = false;
  try {
    const R = facetDihedralsBig(M.xyz, idx);
    const dt = (Date.now() - t0) / 1000;
    ok = R.interiorEdges === cf.interior && R.boundaryEdges === cf.boundary && R.nonManifoldEdges === 0 && R.inconsistentEdges === 0;
    log(`   interior ${R.interiorEdges.toLocaleString()} (expect ${cf.interior.toLocaleString()})   boundary ${R.boundaryEdges.toLocaleString()} (expect ${cf.boundary.toLocaleString()})`);
    log(`   non-manifold ${R.nonManifoldEdges} (expect 0)   inconsistent ${R.inconsistentEdges} (expect 0)`);
    let mx = 0; for (let f = 0; f < R.perFacetMaxRad.length; f += 1) if (R.perFacetMaxRad[f] > mx) mx = R.perFacetMaxRad[f];
    let ar = 0; for (let f = 0; f < R.areaMm2.length; f += 1) ar += R.areaMm2[f];
    log(`   max dihedral ${(mx * 180 / Math.PI).toFixed(4)} deg   total area ${ar.toFixed(3)} mm2`);
    log(`   ${dt.toFixed(1)} s (${(M.nTri / dt / 1e6).toFixed(2)} Mfacet/s)   peak RSS ${mb(peakRss())}   ${verdict(ok)}`);
  } catch (e) {
    log(`   *** FAIL *** after ${((Date.now() - t0) / 1000).toFixed(1)} s: ${(e as Error).message}`);
    log(`   peak RSS ${mb(peakRss())}`);
  }
  log('');
  log('── C10  facetDihedrals (the Map version) at the same N — EXPECTED TO THROW ────────────────────');
  const t1 = Date.now();
  try {
    facetDihedrals(M.xyz, idx);
    log(`   *** IT DID NOT THROW *** in ${((Date.now() - t1) / 1000).toFixed(1)} s — the 2^23 ceiling is NOT where we thought`);
  } catch (e) {
    log(`   threw after ${((Date.now() - t1) / 1000).toFixed(1)} s: ${(e as Error).message}`);
    log('   PASS — the ceiling is real and facetDihedralsBig is mandatory at this N.');
  }
  log('');
  log(`peak RSS this process ${mb(peakRss())}   CPU ${((process.cpuUsage().user + process.cpuUsage().system) / 1e6).toFixed(1)} s of ${((Date.now() - T0) / 1000).toFixed(1)} s wall   ${el()}`);
  log('S118 CEILINGS dih DONE');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGE === 'proj') {
  const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
  const D: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
  const H = DIMS.H;
  const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
  const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  log(`── C11  buildRadialSurfaceProjector COST — ${STYLE}, params ${JSON.stringify(D)} ──`);
  log('   This single number decides whether an exhaustive perpendicular pass at 1e7 facets is hours or');
  log('   days, so it is measured on the real surface, at the two grids the two PUBLISHED baselines used.');
  log('');
  log('   grid          build s     us/call    calls/s     45-pt facets/s    1e7 facets x 45 pts');
  let s = 0x243f6a8885a308d3n;
  const rnd = (): number => { s = (s * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn; return Number(s >> 11n) / 9007199254740992; };
  for (const [nTh, nZ] of [[1024, 512], [1536, 768]] as Array<[number, number]>) {
    const tB = Date.now();
    const proj = buildRadialSurfaceProjector(rA, { H, nTheta: nTh, nZ, seedTopK: 6 });
    const build = (Date.now() - tB) / 1000;
    // sample points a realistic distance OFF the surface (a mesh facet interior sits ~1e-3..1e-1 mm off)
    const px = new Float64Array(PROJ_N); const py = new Float64Array(PROJ_N); const pz = new Float64Array(PROJ_N);
    for (let i = 0; i < PROJ_N; i += 1) {
      const th = 2 * Math.PI * rnd(); const z = H * rnd();
      const r = rA(th, z) * (1 + (rnd() - 0.5) * 2e-3);
      px[i] = r * Math.cos(th); py[i] = r * Math.sin(th); pz[i] = z;
    }
    const tC = Date.now(); let sink = 0;
    for (let i = 0; i < PROJ_N; i += 1) sink += proj.project(px[i], py[i], pz[i]).dist;
    const dt = (Date.now() - tC) / 1000;
    const usPer = (dt / PROJ_N) * 1e6;
    log(`   ${String(nTh)}x${String(nZ).padEnd(6)} ${build.toFixed(2).padStart(9)} ${usPer.toFixed(1).padStart(11)} ${Math.round(PROJ_N / dt).toLocaleString().padStart(10)}  ${(PROJ_N / dt / 45).toFixed(0).padStart(16)}    ${((1e7 * 45 * usPer) / 1e6 / 3600).toFixed(1)} h  (sink ${sink.toExponential(2)})`);
  }
  log('');
  log('   *** THIS IS THE BINDING CEILING AT 1e7, NOT MEMORY. *** A naive exhaustive perpendicular pass');
  log('   over 1e7 facets x 45 lattice points is measured above in HOURS, single threaded. s118Score');
  log('   breaks it with two SOUND reductions (per-point radial prefilter + early-out / branch-and-bound),');
  log('   not with a stride — see that tool`s header.');
  log('');
  log(`peak RSS this process ${mb(peakRss())}   CPU ${((process.cpuUsage().user + process.cpuUsage().system) / 1e6).toFixed(1)} s of ${((Date.now() - T0) / 1000).toFixed(1)} s wall   ${el()}`);
  log('S118 CEILINGS proj DONE');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (STAGE === 'synthstyle') {
  // A 1e7-facet uniform grid ON THE REAL STYLE SURFACE. This is the mesh the timing/RSS run scores:
  // a synthetic whose radius law does not match the surface would flag every facet and price a regime
  // nobody is heading for.
  const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  const cfg2 = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
  const D2: Record<string, number> = {};
  for (const g of [cfg2?.params, cfg2?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D2[snakeToCamel(k)] = v.default;
  const HH = DIMS.H;
  const rAb2 = buildRadiusFn(STYLE as StyleId, { ...D2 }, DIMS);
  const rA2 = (th: number, z: number): number => rAb2(canonTheta(th), z < 0 ? 0 : z > HH ? HH : z);
  const cf = tubeClosedForm(NTHETA, NTRI);
  const out = envS('PF_S118C_SYNTHSTYLE', 'research/exchange/_strataConformBisect/s118/_synth_style.stl');
  log(`── C12  SYNTHETIC ${STYLE} GRID at ${cf.F.toLocaleString()} facets (${cf.nTheta} x ${cf.nZ}) ──`);
  log(`   theta pitch ${((2 * Math.PI * DIMS.Rt) / cf.nTheta).toFixed(4)} mm at the rim;  z pitch ${(HH / cf.nZ).toFixed(4)} mm`);
  log(`   closed form: V ${cf.V.toLocaleString()}  E ${cf.E.toLocaleString()}  F ${cf.F.toLocaleString()}  interior ${cf.interior.toLocaleString()}  boundary ${cf.boundary}`);
  const t0 = Date.now();
  const bytes = writeSynthStl(out, cf, HH, rA2);
  log(`   wrote ${out}  ${bytes.toLocaleString()} bytes = ${mb(bytes)} in ${((Date.now() - t0) / 1000).toFixed(1)} s   peak RSS ${mb(peakRss())}`);
  log('');
  log(`peak RSS this process ${mb(peakRss())}   CPU ${((process.cpuUsage().user + process.cpuUsage().system) / 1e6).toFixed(1)} s of ${((Date.now() - T0) / 1000).toFixed(1)} s wall   ${el()}`);
  log('S118 CEILINGS synthstyle DONE');
}

if (STAGE === 'clean') {
  if (existsSync(SYNTH)) { unlinkSync(SYNTH); log(`removed ${SYNTH}`); }
  log('S118 CEILINGS clean DONE');
}
