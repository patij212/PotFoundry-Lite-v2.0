// potscope unit tests — zero-dep, run with:  node --test _potscope.test.mjs
// Encodes the anti-regression the certified-shelf complaint exposed: the viewer
// MUST preserve 100% of source triangles (no cluster-decimation), for single
// pots AND the shelf. Also round-trips the compact .pack the fetch-viewer loads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseStl,
  bboxOf,
  flatNormals,
  layoutShelf,
  buildPack,
  readPack,
  readLoc,
  readErrorRaw,
  triAnisotropy,
  weldClusters,
  selectHotTriangles,
} from './potscope.mjs';

// --- synthetic binary STL: header(80) + uint32 count + 50 bytes/triangle ------
function makeStl(triangles) {
  const buf = Buffer.alloc(84 + triangles.length * 50);
  buf.writeUInt32LE(triangles.length, 80);
  triangles.forEach((tri, t) => {
    const at = 84 + t * 50; // normal left zero (certification STLs carry no normals)
    for (let v = 0; v < 3; v += 1) {
      const o = at + 12 + v * 12;
      buf.writeFloatLE(tri[v][0], o);
      buf.writeFloatLE(tri[v][1], o + 4);
      buf.writeFloatLE(tri[v][2], o + 8);
    }
  });
  return buf;
}

const DIR = mkdtempSync(join(tmpdir(), 'potscope-'));
function writeStl(name, triangles) {
  const p = join(DIR, name);
  writeFileSync(p, makeStl(triangles));
  return p;
}

// two unit triangles in the z=0..1 range, footprint ~1mm
const TRIS_A = [
  [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
  [[0, 0, 1], [1, 0, 1], [0, 1, 1]],
];
const TRIS_B = [
  [[0, 0, 0], [2, 0, 0], [0, 2, 0]],
  [[0, 0, 1], [2, 0, 1], [0, 2, 1]],
  [[0, 0, 2], [2, 0, 2], [0, 2, 2]],
];

test('parseStl preserves every triangle at full resolution', () => {
  const parsed = parseStl(writeStl('a.stl', TRIS_A));
  assert.equal(parsed.triangleCount, 2);
  assert.equal(parsed.kept, 2);
  assert.equal(parsed.positions.length, 2 * 9);
  assert.equal(parsed.positions[3], 1); // second vertex x of first triangle
});

test('flatNormals yields unit-length face normals', () => {
  const parsed = parseStl(writeStl('a2.stl', TRIS_A));
  const n = flatNormals(parsed.positions);
  const len = Math.hypot(n[0], n[1], n[2]);
  assert.ok(Math.abs(len - 1) < 1e-6, `normal length ${len}`);
});

test('layoutShelf keeps 100% of triangles and separates pots (no obliteration)', () => {
  const a = parseStl(writeStl('sa.stl', TRIS_A));
  const b = parseStl(writeStl('sb.stl', TRIS_B));
  const models = [a, b].map((m) => ({
    name: m.title,
    positions: m.positions,
    normals: flatNormals(m.positions),
    cavity: null,
    bbox: bboxOf(m.positions),
  }));
  const shelf = layoutShelf(models);

  // THE regression guard: total triangles preserved exactly, nothing clustered.
  assert.equal(shelf.keptTris, TRIS_A.length + TRIS_B.length);
  assert.equal(shelf.positions.length, (TRIS_A.length + TRIS_B.length) * 9);

  // pots placed at distinct x offsets (a real shelf, not overlapping blobs)
  const centroidX = (pos, start, count) => {
    let s = 0;
    for (let i = start; i < start + count * 9; i += 3) s += pos[i];
    return s / (count * 3);
  };
  const xa = centroidX(shelf.positions, 0, TRIS_A.length);
  const xb = centroidX(shelf.positions, TRIS_A.length * 9, TRIS_B.length);
  assert.notEqual(xa, xb);
});

test('buildPack/readPack round-trips positions exactly (full fidelity)', () => {
  const a = parseStl(writeStl('pa.stl', TRIS_A));
  const positions = a.positions;
  const normals = flatNormals(positions);
  const pack = buildPack({
    mode: 'clay',
    positions,
    normals,
    cavity: null,
    error: null,
    meta: { title: 'a', triangleCount: 2, bbox: bboxOf(positions) },
  });
  assert.ok(Buffer.isBuffer(pack));
  const round = readPack(pack);
  assert.equal(round.header.magic, 'potscope-pack/v1');
  assert.equal(round.header.triangleCount, 2);
  assert.equal(round.positions.length, positions.length);
  for (let i = 0; i < positions.length; i += 1) {
    assert.equal(round.positions[i], positions[i]); // exact — no quantization loss
  }
});

// --- sidecar readers: loc.bin (patch + per-vertex uv) & error.bin (per-tri mm) --
// "JSON header line + \n + Float32LE body" — same envelope as the .pack, distinct
// magics. Both readers COPY the body (unaligned payload offset ⇒ a view throws).
function writeLoc(name, tris /* [[patchIdx,u0,v0,u1,v1,u2,v2],...] */) {
  const header = JSON.stringify({
    magic: 'potscope-loc/v1', style: 'X', variant: name, count: tris.length,
    patches: ['outer-wall'], provenance: { artifactByteSha256: 'abc' },
  });
  const body = new Float32Array(tris.flat());
  const p = join(DIR, name);
  writeFileSync(p, Buffer.concat([Buffer.from(header + '\n', 'utf8'), Buffer.from(body.buffer)]));
  return p;
}
function writeErr(name, values, extra = {}) {
  const header = JSON.stringify({
    magic: 'potscope-error/v1', count: values.length, budgetMm: 0.01,
    stats: { maxMm: Math.max(...values), p50Mm: 0.0025, p99Mm: 0.005 },
    provenance: { artifactByteSha256: 'abc' }, ...extra,
  });
  const p = join(DIR, name);
  writeFileSync(p, Buffer.concat([Buffer.from(header + '\n', 'utf8'), Buffer.from(new Float32Array(values).buffer)]));
  return p;
}

test('readLoc round-trips patch + per-vertex uv', () => {
  const p = writeLoc('t.loc.bin', [[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]]);
  const { header, body } = readLoc(p);
  assert.equal(header.count, 1);
  assert.ok(Math.abs(body[1] - 0.1) < 1e-6);
  assert.ok(Math.abs(body[6] - 0.6) < 1e-6);
});

test('readErrorRaw exposes per-triangle mm values + header stats', () => {
  const p = writeErr('t.error.bin', [0.002, 0.009]);
  const { header, values } = readErrorRaw(p);
  assert.equal(header.count, 2);
  assert.ok(Math.abs(values[1] - 0.009) < 1e-6);
  assert.equal(header.budgetMm, 0.01);
});

// Magic guards: each reader must refuse the OTHER sidecar's envelope (provenance —
// a mismatched magic means the file is not what the caller thinks it is).
test('readLoc rejects a non-loc magic', () => {
  assert.throws(() => readLoc(writeErr('x.error.bin', [0.001])), /bad loc magic/);
});
test('readErrorRaw rejects a non-error magic', () => {
  assert.throws(() => readErrorRaw(writeLoc('x.loc.bin', [[0, 0, 0, 0, 0, 0, 0]])), /bad error magic/);
});

// --- residual geometry: surface-metric anisotropy + welded hot-tri clustering --
test('triAnisotropy ~1 for an isometric triangle, large for a stretched one', () => {
  // uv unit right triangle; xyz identical scale -> isometric
  const uv = [0, 0, 1, 0, 0, 1];
  const iso = triAnisotropy([0, 0, 0, 1, 0, 0, 0, 1, 0], uv);
  assert.ok(Math.abs(iso - 1) < 1e-3, `iso ${iso}`);
  // xyz stretched 10x in u-direction only -> anisotropy ~10
  const aniso = triAnisotropy([0, 0, 0, 10, 0, 0, 0, 1, 0], uv);
  assert.ok(aniso > 9 && aniso < 11, `aniso ${aniso}`);
});

test('weldClusters groups hot triangles sharing a vertex, separates disjoint ones', () => {
  // tri0 & tri1 share vertex (0,0,0); tri2 is far away
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0, // tri0
    0, 0, 0, -1, 0, 0, 0, -1, 0, // tri1 (shares 0,0,0)
    9, 9, 9, 9, 8, 9, 8, 9, 9, // tri2 (disjoint)
  ]);
  const clusters = weldClusters(positions, [0, 1, 2]);
  assert.equal(clusters.length, 2);
  const sizes = clusters.map((c) => c.length).sort();
  assert.deepEqual(sizes, [1, 2]);
});

// --- residual structural classifier: SPIKE / BAND / DIFFUSE + tags + feature loci
import { classifyCluster, deriveFeatureLoci, isWallPatch } from './potscope.mjs';

// helper: build parallel positions/locBody/errors arrays for N triangles.
// place() returns a tiny scene where triangle t has uv centroid (uc,vc), a small
// uv footprint, xyz = uv mapped to a plane scaled by (sx,sy), and error e.
// opts.patches names the loc header's patch table; each spec's patchIdx (default 0)
// selects the patch that cluster's triangles sit on (default table = ['outer-wall'],
// so every existing fixture stays wall-gated and ANISOTROPIC still fires there).
function scene(specs /* [{uc,vc,e,sx=1,sy=1,patchIdx=0}] */, opts = {}) {
  const patches = opts.patches ?? ['outer-wall'];
  const n = specs.length;
  const positions = new Float32Array(n * 9);
  const locBody = new Float32Array(n * 7);
  const errors = new Float32Array(n);
  specs.forEach((s, t) => {
    const sx = s.sx ?? 1, sy = s.sy ?? 1, h = 0.004;
    const uv = [s.uc, s.vc, s.uc + h, s.vc, s.uc, s.vc + h];
    locBody[t * 7] = s.patchIdx ?? 0;
    for (let k = 0; k < 3; k += 1) { locBody[t * 7 + 1 + k * 2] = uv[k * 2]; locBody[t * 7 + 2 + k * 2] = uv[k * 2 + 1]; }
    const xyz = [uv[0] * sx, uv[1] * sy, 0, uv[2] * sx, uv[3] * sy, 0, uv[4] * sx, uv[5] * sy, 0];
    positions.set(xyz, t * 9);
    errors[t] = s.e;
  });
  return { positions, locBody, errors, budget: 0.01, featureLoci: { u: [], v: [] }, patches };
}

test('classifyCluster: compact high-error blob -> SPIKE', () => {
  const ctx = scene([
    { uc: 0.5, vc: 0.5, e: 0.0098 },
    { uc: 0.502, vc: 0.5, e: 0.0097 },
    { uc: 0.5, vc: 0.502, e: 0.0096 },
  ]);
  const c = classifyCluster([0, 1, 2], ctx);
  assert.equal(c.shape, 'SPIKE');
});

test('classifyCluster: full-u row at fixed v -> BAND + FULL-SPAN (structural, not the measured IRREDUCIBLE)', () => {
  const specs = [];
  for (let i = 0; i < 40; i += 1) specs.push({ uc: i / 40, vc: 0.87, e: 0.0099 });
  const ctx = scene(specs);
  const c = classifyCluster(specs.map((_, i) => i), ctx);
  assert.equal(c.shape, 'BAND');
  // the classifier reports the STRUCTURAL fact (band spans the full axis)...
  assert.ok(c.tags.includes('FULL-SPAN'), `tags ${c.tags}`);
  // ...and never claims 'IRREDUCIBLE' — that word is reserved for the convergence
  // probe's MEASURED verdict (a full-span band can still be density-responsive).
  assert.ok(!c.tags.includes('IRREDUCIBLE'), `structural classifier must not claim IRREDUCIBLE; tags ${c.tags}`);
  // its lever points at the convergence probe, not an irreducibility claim
  assert.match(c.lever, /run `converge` to measure/);
});

test('classifyCluster: metric-stretched cluster -> ANISOTROPIC tag', () => {
  const specs = [];
  for (let i = 0; i < 10; i += 1) specs.push({ uc: 0.3 + i * 0.01, vc: 0.4, e: 0.009, sx: 20, sy: 1 });
  const ctx = scene(specs);
  const c = classifyCluster(specs.map((_, i) => i), ctx);
  assert.ok(c.tags.includes('ANISOTROPIC'), `tags ${c.tags} aniso ${c.anisotropy}`);
});

// --- ANISOTROPIC is a WALL-patch-only verdict (radial cap/rim param-anisotropy is a coordinate artifact) ---
// triAnisotropy measures the uv->xyz first-fundamental-form STRETCH. On the (u=angular,
// v=height) WALL parameterization that stretch genuinely flags the feature-driven "wrong
// metric space" the M=g/h² lever names. But the polar/annular CAP/RIM/DRAIN parameterization
// (bottom-top, bottom-under, top-rim, drain-wall) is LEGITIMATELY, hugely anisotropic near
// the pole/axis independent of any feature or mesher defect — so tagging ANISOTROPIC there
// points the M=g/h² lever at a pure coordinate artifact. Real evidence: SpiralRidges
// bottom-top reads anisotropy ~8.7 and Voronoi top-rim ~29.5, both mislabeled pre-gate.
// The SAME high-anisotropy cluster: tagged on a wall, NOT tagged on a cap. The numeric
// anisotropy is informational and stays reported on BOTH.
const CAP_GATE_SPECS = [];
for (let i = 0; i < 10; i += 1) CAP_GATE_SPECS.push({ uc: 0.3 + i * 0.01, vc: 0.4, e: 0.009, sx: 20, sy: 1 });
const ANISO_LEVER = 'anisotropic flank kernel (M=g/h²) — not more triangles';

test('classifyCluster: high-anisotropy cluster on outer-wall -> ANISOTROPIC (wall gate open)', () => {
  const ctx = scene(
    CAP_GATE_SPECS.map((s) => ({ ...s, patchIdx: 0 })), // patchIdx 0 -> 'outer-wall'
    { patches: ['outer-wall', 'bottom-top'] }
  );
  const c = classifyCluster(CAP_GATE_SPECS.map((_, i) => i), ctx);
  assert.ok(c.tags.includes('ANISOTROPIC'), `wall cluster must stay ANISOTROPIC, tags ${c.tags} aniso ${c.anisotropy}`);
  assert.equal(c.lever, ANISO_LEVER); // and the lever is the M=g/h² one
  assert.ok(c.anisotropy > 3, `anisotropy ${c.anisotropy}`);
});

test('classifyCluster: SAME high-anisotropy cluster on bottom-top -> NOT ANISOTROPIC, number preserved', () => {
  const ctx = scene(
    CAP_GATE_SPECS.map((s) => ({ ...s, patchIdx: 1 })), // patchIdx 1 -> 'bottom-top' (radial cap)
    { patches: ['outer-wall', 'bottom-top'] }
  );
  const c = classifyCluster(CAP_GATE_SPECS.map((_, i) => i), ctx);
  assert.ok(!c.tags.includes('ANISOTROPIC'), `radial cap must NOT be tagged ANISOTROPIC, tags ${c.tags}`);
  assert.notEqual(c.lever, ANISO_LEVER); // never the M=g/h² lever on a cap
  // the anisotropy VALUE is still reported (informational) — not zeroed by the gate
  assert.ok(c.anisotropy > 3, `anisotropy value must survive the gate, got ${c.anisotropy}`);
  assert.equal(c.patch, 'bottom-top'); // classifier surfaces the resolved patch
});

test('isWallPatch: true only for outer-wall / inner-wall (drain-wall is NOT a wall)', () => {
  assert.equal(isWallPatch('outer-wall'), true);
  assert.equal(isWallPatch('inner-wall'), true);
  assert.equal(isWallPatch('top-rim'), false);
  assert.equal(isWallPatch('bottom-top'), false);
  assert.equal(isWallPatch('bottom-under'), false);
  assert.equal(isWallPatch('drain-wall'), false); // substring 'wall' must not open the gate
  assert.equal(isWallPatch(undefined), false);
});

test('deriveFeatureLoci finds a dense column among sparse ones', () => {
  // sparse u at 0,0.25,0.5,0.75 plus a dense trio near 0.5
  const us = [0, 0.25, 0.5, 0.75, 0.5, 0.505, 0.51];
  const body = new Float32Array(us.length * 7);
  us.forEach((u, t) => { for (let k = 0; k < 3; k += 1) body[t * 7 + 1 + k * 2] = u; });
  const loci = deriveFeatureLoci(body, us.length);
  assert.ok(loci.u.some((u) => Math.abs(u - 0.5) < 0.02), `u loci ${loci.u}`);
});

// --- hot-triangle selection: f32-tolerant default threshold (Task 5 review fix) --
// The sidecar stores per-triangle error as f32, so the worst certifies-at rung
// reads back as f32(0.005) = 0.004999999888… — one ULP BELOW an f64 hotThresh of
// 0.005 (= max(budget*0.5, p99) at defaults). A naive f64 `>=` drops it, so a
// healthy certified pot (GeometricStar) prints "0 hot clusters" at the default
// budget. selectHotTriangles snaps the threshold onto the f32 grid the values
// live on, so a triangle sitting exactly at the worst rung is admitted while a
// genuinely lower rung stays out.
test('selectHotTriangles admits the worst f32 rung at the f64 threshold, excludes lower rungs', () => {
  const hotThresh = 0.005; // f64, exactly as cmdHotspots computes it at defaults
  // a Float32Array containing f32(0.005) — the on-disk readback of the worst rung
  const values = new Float32Array([Math.fround(0.005)]);
  // pre-fix (plain f64 `>=`) this returned [] because f32(0.005) < f64(0.005)
  assert.deepEqual(selectHotTriangles(values, hotThresh), [0]);
  // a genuinely lower rung (f32(0.0025)) must NOT be selected at the same threshold
  assert.deepEqual(selectHotTriangles(new Float32Array([Math.fround(0.0025)]), hotThresh), []);
  // and a plain f64 `>=` really does drop it — pins the regression, not a tautology
  assert.ok(!(values[0] >= hotThresh), 'guard: f32(0.005) is below f64 0.005');
});

// --- status registry: joins recon.json + error.bin header + certificate.txt ----
// buildStatusRows is the generated certificate registry: one row per baked pot,
// with the "certify on MAX, not p99" mask flag raised when max/p99 > 3x.
import { buildStatusRows, statusExitCode } from './potscope.mjs';
import { mkdirSync } from 'node:fs';

test('buildStatusRows joins recon.json + error.bin header and flags masking', () => {
  const d = join(DIR, 'status1');
  mkdirSync(d, { recursive: true });
  // masked pot: max 0.010 but p99 0.002 -> ratio 5 > 3
  writeFileSync(join(d, 'Foo.recon.json'), JSON.stringify({ name: 'Foo', style: 'Foo', tris: 100, configDigest: 'abc', verdict: 'GREEN' }));
  writeFileSync(join(d, 'Foo.stl.error.bin'), Buffer.concat([
    Buffer.from(JSON.stringify({ magic: 'potscope-error/v1', count: 1, budgetMm: 0.01, stats: { maxMm: 0.010, p50Mm: 0.001, p99Mm: 0.002 } }) + '\n', 'utf8'),
    Buffer.from(new Float32Array([0.01]).buffer),
  ]));
  const rows = buildStatusRows(d);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].verdict, 'GREEN');
  assert.equal(rows[0].masked, true);
  assert.ok(Math.abs(rows[0].maxMm - 0.01) < 1e-6);
});

// p99===0 with a nonzero max is the MAXIMALLY masked case (a hidden cliff over an
// all-clean p99). The old `maxMm && p99Mm && …` guard read p99===0 as falsy and
// cleared exactly the flag it exists to raise; masked must be true here.
test('buildStatusRows flags p99===0 with nonzero max as masked (not cleared)', () => {
  const d = join(DIR, 'status_p99zero');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'Cliff.recon.json'), JSON.stringify({ name: 'Cliff', style: 'Cliff', tris: 50, configDigest: 'deadbeef', verdict: 'GREEN' }));
  writeFileSync(join(d, 'Cliff.stl.error.bin'), Buffer.concat([
    Buffer.from(JSON.stringify({ magic: 'potscope-error/v1', count: 1, budgetMm: 0.01, stats: { maxMm: 0.010, p50Mm: 0, p99Mm: 0 } }) + '\n', 'utf8'),
    Buffer.from(new Float32Array([0.01]).buffer),
  ]));
  const rows = buildStatusRows(d);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].masked, true);
});

// --- status resilience: one malformed sidecar must not abort the whole scan ----
// buildStatusRows parses every *.recon.json (+ sibling error.bin header) in the
// dir. A single truncated/corrupt file must be SKIPPED (with a warn) so the whole
// certificate registry / --check guard still reports the healthy pots — not throw
// and kill the run. (truth-layer merge fix #2)
test('buildStatusRows skips a malformed recon.json and returns only the valid rows', () => {
  const d = join(DIR, 'status_malformed');
  mkdirSync(d, { recursive: true });
  // one VALID pot: recon.json + sibling error.bin
  writeFileSync(
    join(d, 'Good.recon.json'),
    JSON.stringify({ name: 'Good', style: 'Good', tris: 100, configDigest: 'abc', verdict: 'GREEN' })
  );
  writeFileSync(join(d, 'Good.stl.error.bin'), Buffer.concat([
    Buffer.from(JSON.stringify({ magic: 'potscope-error/v1', count: 1, budgetMm: 0.01, stats: { maxMm: 0.006, p50Mm: 0.001, p99Mm: 0.005 } }) + '\n', 'utf8'),
    Buffer.from(new Float32Array([0.006]).buffer),
  ]));
  // one MALFORMED pot: unparseable recon.json — the WHOLE per-file body is guarded.
  // 'Bad' sorts before 'Good', so it is processed FIRST: proves the loop CONTINUES
  // past the throw rather than aborting the scan.
  writeFileSync(join(d, 'Bad.recon.json'), '{ not json');

  // capture the skip warning (keeps test output clean; also asserts it fired)
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  let rows;
  try {
    rows = buildStatusRows(d); // must NOT throw despite Bad.recon.json
  } finally {
    console.warn = origWarn;
  }
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Good');
  assert.ok(
    warnings.some((w) => w.includes('Bad.recon.json')),
    `expected a skip warning naming Bad.recon.json, got ${JSON.stringify(warnings)}`
  );
});

// --- status --check drift gate: pure exit-code helper (Task 6 review fix) -------
// statusExitCode is the headline drift guard, factored out so the exit decision
// is testable without intercepting process.exit. cmdStatus calls it identically
// after the JSON and table branches, so `status --check --json` gates on drift
// exactly as `status --check` (table) does — the regression this pins.
test('statusExitCode: --check + a DRIFT row exits 1; no --check or no drift exits 0', () => {
  const drifted = [{ verdict: 'GREEN' }, { verdict: 'DRIFT' }];
  const clean = [{ verdict: 'GREEN' }, { verdict: 'GREEN' }];
  assert.equal(statusExitCode(drifted, true), 1); // DRIFT present + --check → fail
  assert.equal(statusExitCode(drifted, false), 0); // DRIFT present but no --check → 0
  assert.equal(statusExitCode(clean, true), 0); // --check but all GREEN → 0
});

// --- loc-backed, style-agnostic tri resolution (Task 7) -------------------------
// resolveTriFromLoc maps a GLOBAL artifact triangle index straight to its patch +
// per-vertex (u,v) via the loc.bin sidecar — exact and style-agnostic, so decode
// no longer has to run the hardcoded Gothic analytic model on the other 19 styles.
// Reuses the writeLoc helper above (header carries the patch table + style).
import { resolveTriFromLoc } from './potscope.mjs';

test('resolveTriFromLoc returns patch + per-vertex uv for a global triangle index', () => {
  const p = writeLoc('dec.loc.bin', [
    [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    [0, 0.7, 0.8, 0.9, 0.1, 0.2, 0.3],
  ]);
  const r = resolveTriFromLoc(p, 1);
  assert.equal(r.patch, 'outer-wall');
  assert.ok(Math.abs(r.vertices[0].u - 0.7) < 1e-6);
  assert.ok(Math.abs(r.vertices[2].v - 0.3) < 1e-6);
});

// --- portable certificate manifest (Task P1) ------------------------------------
// research/exchange/ (the certified STLs + their *.recon.json / *.error.bin /
// *.certificate.txt sidecars) is git-ignored, so a fresh clone has NONE of them and
// `status` would be empty. buildManifest distills every on-disk pot into a small
// git-TRACKED certs.manifest.json; buildStatusRows falls back to it when a dir has
// no on-disk recon.json, so the registry still reports on a clean checkout.
import { buildManifest } from './potscope.mjs';

// write a valid recon.json + sibling error.bin (+ optional certificate.txt) pair
function writeCertifiedPot(dir, name, { style, tris, configDigest, verdict, provenance, stats, certText }) {
  writeFileSync(join(dir, `${name}.recon.json`), JSON.stringify({ name, style, tris, configDigest, provenance, verdict }));
  writeFileSync(join(dir, `${name}.stl.error.bin`), Buffer.concat([
    Buffer.from(JSON.stringify({ magic: 'potscope-error/v1', count: 1, budgetMm: 0.01, stats }) + '\n', 'utf8'),
    Buffer.from(new Float32Array([stats.maxMm]).buffer),
  ]));
  if (certText !== undefined) writeFileSync(join(dir, `${name}.certificate.txt`), certText);
}

test('buildManifest distills recon.json + error.bin + certificate.txt into a sorted, portable snapshot (skips malformed)', () => {
  const d = join(DIR, 'manifest1');
  mkdirSync(d, { recursive: true });
  // "Zeta" written FIRST but must sort AFTER "Alpha" in the manifest
  writeCertifiedPot(d, 'Zeta', {
    style: 'Voronoi', tris: 200, configDigest: 'zzz11111zzz', verdict: 'GREEN',
    provenance: { targetSha256: 'zt', artifactByteSha256: 'za', parsedTriangleSetSha256: 'zp' },
    stats: { maxMm: 0.009, p50Mm: 0.003, p99Mm: 0.008 },
  });
  writeCertifiedPot(d, 'Alpha', {
    style: 'Gothic', tris: 100, configDigest: 'aaa22222aaa', verdict: 'GREEN',
    provenance: { targetSha256: 'at', artifactByteSha256: 'aa', parsedTriangleSetSha256: 'ap' },
    stats: { maxMm: 0.010, p50Mm: 0.001, p99Mm: 0.002 },
    certText: 'certified at commit deadbeef1234 — all good\n',
  });
  // malformed recon.json → SKIPPED with a warn, scan continues
  writeFileSync(join(d, 'Bad.recon.json'), '{ not json');

  const warnings = [];
  const origWarn = console.warn;
  console.warn = (m) => warnings.push(String(m));
  let manifest;
  try { manifest = buildManifest(d); } finally { console.warn = origWarn; }

  assert.equal(manifest.magic, 'potscope-manifest/v1');
  assert.equal(manifest.pots.length, 2); // Bad skipped
  assert.deepEqual(manifest.pots.map((p) => p.name), ['Alpha', 'Zeta']); // sorted by name
  const alpha = manifest.pots[0];
  assert.equal(alpha.style, 'Gothic');
  assert.equal(alpha.tris, 100);
  assert.equal(alpha.configDigest, 'aaa22222aaa'); // FULL digest preserved in the snapshot
  assert.equal(alpha.verdict, 'GREEN');
  assert.deepEqual(alpha.provenance, { targetSha256: 'at', artifactByteSha256: 'aa', parsedTriangleSetSha256: 'ap' });
  assert.ok(Math.abs(alpha.stats.maxMm - 0.010) < 1e-6);
  assert.ok(Math.abs(alpha.stats.p50Mm - 0.001) < 1e-6);
  assert.ok(Math.abs(alpha.stats.p99Mm - 0.002) < 1e-6);
  assert.equal(alpha.cert.commit, 'deadbeef1234'); // parsed from certificate.txt
  assert.equal(manifest.pots[1].cert.commit, null); // Zeta had no certificate.txt
  assert.ok(warnings.some((w) => w.includes('Bad.recon.json')), `expected skip warning, got ${JSON.stringify(warnings)}`);
  assert.ok(!/\d{4}-\d\d-\d\dT/.test(JSON.stringify(manifest)), 'manifest must carry NO ISO timestamps (minimal regen diffs)');
});

test('buildStatusRows falls back to the committed manifest when a dir has no recon.json (source: manifest)', () => {
  const emptyDir = join(DIR, 'fresh_clone_empty');
  mkdirSync(emptyDir, { recursive: true }); // exists but holds no *.recon.json (fresh clone)
  const manifestPath = join(DIR, 'certs.manifest.fixture.json');
  writeFileSync(manifestPath, JSON.stringify({
    magic: 'potscope-manifest/v1',
    pots: [
      { name: 'Alpha', style: 'Gothic', configDigest: 'aaa22222aaa', tris: 100, verdict: 'GREEN',
        provenance: { targetSha256: 'at', artifactByteSha256: 'aa', parsedTriangleSetSha256: 'ap' },
        stats: { maxMm: 0.010, p50Mm: 0.001, p99Mm: 0.002 }, cert: { commit: 'deadbeef1234' } },
      { name: 'Zeta', style: 'Voronoi', configDigest: 'zzz11111zzz', tris: 200, verdict: 'GREEN',
        provenance: { targetSha256: 'zt', artifactByteSha256: 'za', parsedTriangleSetSha256: 'zp' },
        stats: { maxMm: 0.009, p50Mm: 0.003, p99Mm: 0.008 }, cert: { commit: null } },
    ],
  }, null, 2) + '\n');

  const rows = buildStatusRows(emptyDir, manifestPath);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.source === 'manifest'), `all rows manifest-sourced, got ${rows.map((r) => r.source)}`);
  const alpha = rows.find((r) => r.name === 'Alpha');
  assert.equal(alpha.style, 'Gothic');
  assert.equal(alpha.tris, 100);
  assert.equal(alpha.configDigest, 'aaa22222'); // sliced to 8, matching the sidecar Row
  assert.equal(alpha.commit, 'deadbeef1234');
  assert.equal(alpha.verdict, 'GREEN');
  assert.equal(alpha.masked, true); // 0.010/0.002 = 5 > 3, recomputed from stats (same formula)
  assert.ok(Math.abs(alpha.maxMm - 0.010) < 1e-6);
  assert.ok(Math.abs(alpha.p99Mm - 0.002) < 1e-6);
  assert.equal(rows.find((r) => r.name === 'Zeta').masked, false); // 0.009/0.008 < 3
});

test('buildStatusRows ignores the manifest when on-disk recon.json are present (source: sidecar)', () => {
  const d = join(DIR, 'sidecar_wins');
  mkdirSync(d, { recursive: true });
  writeCertifiedPot(d, 'OnDisk', {
    style: 'Ripple', tris: 42, configDigest: 'ondiskdigest', verdict: 'GREEN',
    provenance: { targetSha256: 'ot', artifactByteSha256: 'oa', parsedTriangleSetSha256: 'op' },
    stats: { maxMm: 0.006, p50Mm: 0.001, p99Mm: 0.005 },
  });
  // a manifest that, if wrongly consulted, would inject a DIFFERENT pot — proves it is ignored
  const manifestPath = join(DIR, 'certs.manifest.ignored.json');
  writeFileSync(manifestPath, JSON.stringify({
    magic: 'potscope-manifest/v1',
    pots: [{ name: 'FromManifest', style: 'X', configDigest: 'xxxxxxxxxx', tris: 999, verdict: 'DRIFT',
      provenance: { targetSha256: null, artifactByteSha256: null, parsedTriangleSetSha256: null },
      stats: { maxMm: null, p50Mm: null, p99Mm: null }, cert: { commit: null } }],
  }, null, 2) + '\n');

  const rows = buildStatusRows(d, manifestPath);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'OnDisk'); // on-disk, NOT 'FromManifest'
  assert.equal(rows[0].source, 'sidecar');
  assert.ok(!rows.some((r) => r.name === 'FromManifest'), 'manifest must be ignored when sidecars exist');
});

// --- convergence probe: refine-vs-redesign VERDICT (P2b) ------------------------
// The user-facing half of the probe. The harness (_certRosterConvergence.test.ts)
// bakes each pot's worst per-patch residual at TWO densities into a
// <name>.converge.json; the ratio coarseMax/fineMax is the signal (chord error
// ~h², so doubling density should ~quarter a smooth-surface residual). potscope
// turns that ratio into an actionable per-patch call.
import { convergeVerdict, readConverge, buildConvergeRows } from './potscope.mjs';

test('convergeVerdict: ratio thresholds map to the refine-vs-redesign verdict', () => {
  // measured roster anchors
  assert.equal(convergeVerdict(4.0).verdict, 'RESPONSIVE'); // HarmonicRipple walls 3.9-4.0
  assert.equal(convergeVerdict(2.12).verdict, 'PARTIAL'); // GeometricStar outer-wall
  assert.equal(convergeVerdict(1.07).verdict, 'IRREDUCIBLE'); // GeometricStar inner-wall
  // EXACT boundaries: >=3 RESPONSIVE, [1.8,3) PARTIAL, <1.8 IRREDUCIBLE
  assert.equal(convergeVerdict(3.0).verdict, 'RESPONSIVE');
  assert.equal(convergeVerdict(1.8).verdict, 'PARTIAL');
  assert.equal(convergeVerdict(1.79).verdict, 'IRREDUCIBLE');
  // each verdict carries a lever naming the action
  assert.match(convergeVerdict(4).lever, /refine:/);
  assert.match(convergeVerdict(2).lever, /mixed:/);
  assert.match(convergeVerdict(1).lever, /redesign:/);
  // degenerate ratios: +Infinity (fineMax 0) -> RESPONSIVE; NaN (missing coarse)
  // -> conservative IRREDUCIBLE (no evidence density helps)
  assert.equal(convergeVerdict(Number.POSITIVE_INFINITY).verdict, 'RESPONSIVE');
  assert.equal(convergeVerdict(Number.NaN).verdict, 'IRREDUCIBLE');
});

// synthetic converge.json fixture (real schema: magic + variant/style + perPatch
// object keyed by patchId, NOT a `patches` array — confirmed against the emitted
// GeometricStar/HarmonicRipple files). extra merges/overrides top-level keys.
function writeConverge(name, perPatch, extra = {}) {
  const p = join(DIR, name);
  writeFileSync(
    p,
    JSON.stringify({
      magic: 'potscope-converge/v1',
      variant: name.replace(/\.converge\.json$/, ''),
      style: 'X',
      depth: 2,
      coarseStep: 1,
      fineTrisTotal: 1000,
      coarseTrisTotal: 250,
      fineGlobalMaxMm: 0.0066,
      coarseGlobalMaxMm: 0.014,
      perPatch,
      ...extra,
    })
  );
  return p;
}

const CONVERGE_PATCHES = {
  'outer-wall': { fineMaxMm: 0.0066, coarseMaxMm: 0.014, ratio: 2.12, verdict: 'partial', fineTris: 100, coarseTris: 25 },
  'inner-wall': { fineMaxMm: 0.0059, coarseMaxMm: 0.0063, ratio: 1.07, verdict: 'irreducible', fineTris: 200, coarseTris: 100 },
  'top-rim': { fineMaxMm: 0.0022, coarseMaxMm: 0.0088, ratio: 4.0, verdict: 'responsive', fineTris: 50, coarseTris: 12 },
};

test('readConverge parses a converge.json and exposes the perPatch table', () => {
  const data = readConverge(writeConverge('good.converge.json', CONVERGE_PATCHES));
  assert.equal(data.variant, 'good');
  assert.equal(Object.keys(data.perPatch).length, 3);
  assert.ok(Math.abs(data.perPatch['outer-wall'].ratio - 2.12) < 1e-9);
});

test('readConverge throws on a wrong magic (provenance guard)', () => {
  const p = join(DIR, 'wrongmagic.converge.json');
  writeFileSync(p, JSON.stringify({ magic: 'potscope-error/v1', perPatch: {} }));
  assert.throws(() => readConverge(p), /bad converge magic/);
});

test('readConverge throws when perPatch is absent (not a convergence sidecar)', () => {
  const p = join(DIR, 'nopatches.converge.json');
  writeFileSync(p, JSON.stringify({ magic: 'potscope-converge/v1' }));
  assert.throws(() => readConverge(p), /perPatch/);
});

test('buildConvergeRows recomputes verdict+lever, sorts worst (lowest ratio) first, flags laddered patches', () => {
  const p = writeConverge('rows.converge.json', CONVERGE_PATCHES, {
    // inner-wall pinned by a vertical station-ladder → coarsens ANGULAR-only
    fineDivisions: {
      angularDivisionsLog2: 9,
      verticalDivisionsLog2ByPatch: { 'outer-wall': 6, 'inner-wall': 6, 'top-rim': 3 },
      verticalStationsByPatch: { 'inner-wall': { log2Denominator: 6, numerators: [0, 64] } },
    },
  });
  const rows = buildConvergeRows(readConverge(p));
  // worst-first = ascending ratio (the patch most demanding redesign at the top)
  assert.deepEqual(rows.map((r) => r.patchId), ['inner-wall', 'outer-wall', 'top-rim']);
  // verdict is RECOMPUTED via convergeVerdict on the ratio — NOT the stored
  // lowercase field (the harness lib uses different 2.5/1.5 thresholds)
  assert.equal(rows[0].verdict, 'IRREDUCIBLE');
  assert.equal(rows[1].verdict, 'PARTIAL');
  assert.equal(rows[2].verdict, 'RESPONSIVE');
  assert.ok(rows[0].lever.includes('redesign'));
  // laddered flag derived from fineDivisions.verticalStationsByPatch
  assert.equal(rows.find((r) => r.patchId === 'inner-wall').laddered, true);
  assert.equal(rows.find((r) => r.patchId === 'outer-wall').laddered, false);
  // row carries the raw residuals + ratio through
  assert.ok(Math.abs(rows[1].fineMaxMm - 0.0066) < 1e-9);
  assert.ok(Math.abs(rows[1].ratio - 2.12) < 1e-9);
});

test('buildConvergeRows: no station ladder -> every laddered flag false', () => {
  const rows = buildConvergeRows(readConverge(writeConverge('noladder.converge.json', CONVERGE_PATCHES)));
  assert.ok(rows.every((r) => r.laddered === false), 'no verticalStationsByPatch → nothing laddered');
});

// --- doctor: roster health roll-up (registry + hotspots + convergence) (P7) -----
// `hotspotClusters` is the shared cluster-builder extracted from cmdHotspots (DRY —
// both cmdHotspots and doctor call it). `buildDoctorReport` unifies the three truth
// layers per pot: registry row (buildStatusRows), worst hotspot cluster (if the
// stl+error.bin+loc.bin sidecars are present), worst-ratio converge patch (if a
// <name>.converge.json is present). Missing per-pot data (fresh clone) is
// available:false — never an error — and one bad pot must not sink the report.
import { hotspotClusters, buildDoctorReport } from './potscope.mjs';

// A full sidecar set (stl + error.bin + loc.bin) whose provenance binds, whose
// counts agree, and whose 3 triangles all share the vertex (0,0,0) so they weld
// into ONE cluster; the compact uv (near 0.5,0.5) + ≤8 tris makes it a SPIKE on
// outer-wall. Mirrors the on-disk certified layout the real doctor reads.
function writeHotPot(dir, name, { errors, locRows, stats, style = 'X', verdict = 'GREEN' }) {
  const tris = [
    [[0, 0, 0], [0.01, 0, 0], [0, 0.01, 0]],
    [[0, 0, 0], [-0.01, 0, 0], [0, -0.01, 0]],
    [[0, 0, 0], [0.01, 0.01, 0], [0.005, 0, 0]],
  ];
  writeFileSync(join(dir, `${name}.stl`), makeStl(tris));
  const errHeader = JSON.stringify({
    magic: 'potscope-error/v1', count: errors.length, budgetMm: 0.01, stats,
    provenance: { artifactByteSha256: 'bind' },
  });
  writeFileSync(join(dir, `${name}.stl.error.bin`), Buffer.concat([
    Buffer.from(errHeader + '\n', 'utf8'), Buffer.from(new Float32Array(errors).buffer),
  ]));
  const locHeader = JSON.stringify({
    magic: 'potscope-loc/v1', style, count: locRows.length, patches: ['outer-wall', 'inner-wall'],
    provenance: { artifactByteSha256: 'bind' },
  });
  writeFileSync(join(dir, `${name}.stl.loc.bin`), Buffer.concat([
    Buffer.from(locHeader + '\n', 'utf8'), Buffer.from(new Float32Array(locRows.flat()).buffer),
  ]));
  writeFileSync(join(dir, `${name}.recon.json`), JSON.stringify({ name, style, tris: 3, configDigest: 'digest', verdict }));
}

const SPIKE_LOC = [
  [0, 0.5, 0.5, 0.502, 0.5, 0.5, 0.502],
  [0, 0.5, 0.5, 0.498, 0.5, 0.5, 0.498],
  [0, 0.5, 0.5, 0.501, 0.501, 0.5005, 0.5],
];

test('hotspotClusters builds worst-first clusters + stats + hotThresh from the sidecars (shared extraction)', () => {
  const d = join(DIR, 'hc1');
  mkdirSync(d, { recursive: true });
  writeHotPot(d, 'Hot', { errors: [0.009, 0.008, 0.007], locRows: SPIKE_LOC, stats: { maxMm: 0.009, p50Mm: 0.002, p99Mm: 0.005 } });
  const { clusters, stats, hotThresh } = hotspotClusters(join(d, 'Hot.stl'));
  assert.ok(Math.abs(hotThresh - 0.005) < 1e-9, `hotThresh ${hotThresh}`); // max(budget*0.5, p99)
  assert.ok(Math.abs(stats.maxMm - 0.009) < 1e-6);
  assert.equal(clusters.length, 1); // all 3 tris welded on (0,0,0)
  const top = clusters[0];
  assert.equal(top.shape, 'SPIKE');
  assert.equal(top.patch, 'outer-wall');
  assert.ok(Math.abs(top.peak - 0.009) < 1e-6); // sorted worst-first: peak = max error
  // carries every field doctor projects into its top-cluster summary
  for (const k of ['tris', 'shape', 'tags', 'lever', 'u', 'v', 'peak', 'mean', 'anisotropy', 'patch']) {
    assert.ok(k in top, `cluster missing ${k}`);
  }
});

test('hotspotClusters throws (not exits) on a missing sidecar so doctor can degrade to available:false', () => {
  const d = join(DIR, 'hc_missing');
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'NoSidecars.stl'), makeStl([[[0, 0, 0], [1, 0, 0], [0, 1, 0]]]));
  assert.throws(() => hotspotClusters(join(d, 'NoSidecars.stl')), /missing/);
});

test('buildDoctorReport aggregates registry + hotspots + convergence; a sidecar-less pot degrades to available:false', () => {
  const d = join(DIR, 'doctor1');
  mkdirSync(d, { recursive: true });
  // pot "Full": full sidecar set (→ hotspots) + a converge.json (→ convergence)
  writeHotPot(d, 'Full', { style: 'Gothic', errors: [0.009, 0.008, 0.007], locRows: SPIKE_LOC, stats: { maxMm: 0.009, p50Mm: 0.002, p99Mm: 0.005 } });
  writeFileSync(join(d, 'Full.converge.json'), JSON.stringify({
    magic: 'potscope-converge/v1', variant: 'Full', style: 'Gothic', depth: 2,
    // calibrated (1.32 <= 2.5) → its IRREDUCIBLE inner-wall is a TRUSTED verdict and counts
    calibration: { certGlobalMaxMm: 0.005, certPerPatchMaxMm: {}, calibrationRatio: 1.32, tolerance: 2.5 },
    perPatch: {
      'outer-wall': { fineMaxMm: 0.0066, coarseMaxMm: 0.014, ratio: 2.12, fineTris: 100, coarseTris: 25 },
      'inner-wall': { fineMaxMm: 0.0059, coarseMaxMm: 0.0063, ratio: 1.07, fineTris: 200, coarseTris: 100 },
    },
  }));
  // pot "Bare": registry entry only (recon.json) — no stl/error/loc/converge sidecars
  writeFileSync(join(d, 'Bare.recon.json'), JSON.stringify({ name: 'Bare', style: 'Voronoi', tris: 100, configDigest: 'bd', verdict: 'GREEN' }));

  const report = buildDoctorReport(d);
  assert.equal(report.magic, 'potscope-doctor/v1');

  const full = report.pots.find((p) => p.name === 'Full');
  assert.equal(full.style, 'Gothic');
  assert.equal(full.verdict, 'GREEN');
  assert.equal(full.masked, false); // 0.009/0.005 = 1.8, not > 3
  assert.equal(full.hotspots.available, true);
  assert.equal(full.hotspots.top.shape, 'SPIKE');
  assert.equal(full.hotspots.top.patch, 'outer-wall');
  assert.ok(Math.abs(full.hotspots.top.peakMm - 0.009) < 1e-6);
  assert.equal(full.convergence.available, true);
  assert.equal(full.convergence.calibrated, true); // calibrationRatio 1.32 <= tolerance 2.5
  assert.equal(full.convergence.worst.patchId, 'inner-wall'); // lowest ratio = worst-first
  assert.equal(full.convergence.worst.verdict, 'IRREDUCIBLE'); // ratio 1.07 < 1.8

  const bare = report.pots.find((p) => p.name === 'Bare');
  assert.equal(bare.style, 'Voronoi'); // registry fields present
  assert.equal(bare.tris, 100);
  assert.equal(bare.verdict, 'GREEN');
  assert.equal(bare.hotspots.available, false); // no sidecars → not an error
  assert.equal(bare.hotspots.top, null);
  assert.equal(bare.convergence.available, false);
  assert.equal(bare.convergence.calibrated, false); // null-safe default when converge.json absent
  assert.equal(bare.convergence.worst, null);

  assert.deepEqual(report.summary, {
    pots: 2, green: 2, drift: 0, masked: 0,
    withIrreducibleConvergence: 1, convergeCalibrated: 1, convergeUncalibrated: 0,
    hotspotsAvailable: 1, convergeAvailable: 1,
  });
});

test('buildDoctorReport --fast elides the hotspots STL reads (registry + convergence only)', () => {
  const d = join(DIR, 'doctor_fast');
  mkdirSync(d, { recursive: true });
  writeHotPot(d, 'Full', { style: 'Gothic', errors: [0.009, 0.008, 0.007], locRows: SPIKE_LOC, stats: { maxMm: 0.009, p50Mm: 0.002, p99Mm: 0.005 } });
  writeFileSync(join(d, 'Full.converge.json'), JSON.stringify({
    magic: 'potscope-converge/v1', variant: 'Full', style: 'Gothic',
    perPatch: { 'inner-wall': { fineMaxMm: 0.0059, coarseMaxMm: 0.0063, ratio: 1.07, fineTris: 200, coarseTris: 100 } },
  }));
  const report = buildDoctorReport(d, { fast: true });
  const full = report.pots.find((p) => p.name === 'Full');
  assert.equal(full.hotspots.available, false); // elided by --fast even though sidecars exist
  assert.equal(full.hotspots.top, null);
  assert.equal(full.convergence.available, true); // convergence still read (cheap)
  assert.equal(report.summary.hotspotsAvailable, 0);
  assert.equal(report.summary.convergeAvailable, 1);
});

import { dashboardHtml } from './potscope.mjs';

// A doctor-report fixture exercising every card branch: a clean SPIKE pot with an
// IRREDUCIBLE converge patch, a max-MASKED BAND pot with a RESPONSIVE patch, a
// registry-only pot (hotspots/convergence unavailable), and a null-stats DRIFT.
const DASH_FIXTURE = {
  magic: 'potscope-doctor/v1',
  pots: [
    {
      name: 'AlphaSpirePot', style: 'Gothic', tris: 304808, verdict: 'GREEN',
      maxMm: 0.005, p99Mm: 0.0025, masked: false, source: 'sidecar',
      hotspots: { available: true, top: { shape: 'SPIKE', tags: ['FEATURE-ALIGNED'], patch: 'inner-wall', peakMm: 0.005, u: 0.5, v: 0.5, lever: 'localized singularity — conforming edge / seam pin / atlas patch' } },
      convergence: { available: true, worst: { patchId: 'inner-wall', ratio: 1.07, verdict: 'IRREDUCIBLE' } },
    },
    {
      name: 'BetaBandPot', style: 'HarmonicRipple', tris: 812345, verdict: 'GREEN',
      maxMm: 0.01, p99Mm: 0.005, masked: true, source: 'sidecar',
      hotspots: { available: true, top: { shape: 'BAND', tags: ['FULL-SPAN'], patch: 'outer-wall', peakMm: 0.01, u: 0.3, v: 0.7, lever: 'full-u band — run `converge` to measure: density-responsive (refine) vs truly irreducible (redesign)' } },
      convergence: { available: true, worst: { patchId: 'outer-wall', ratio: 3.92, verdict: 'RESPONSIVE' } },
    },
    {
      name: 'GammaBarePot', style: 'Voronoi', tris: 100000, verdict: 'GREEN',
      maxMm: 0.005, p99Mm: 0.005, masked: false, source: 'manifest',
      hotspots: { available: false, top: null },
      convergence: { available: false, worst: null },
    },
    {
      name: 'DeltaDriftPot', style: 'Crystalline', tris: 5000, verdict: 'DRIFT',
      maxMm: null, p99Mm: null, masked: false, source: 'sidecar',
      hotspots: { available: false, top: null },
      convergence: { available: false, worst: null },
    },
  ],
  summary: { pots: 4, green: 3, drift: 1, masked: 1, withIrreducibleConvergence: 1, hotspotsAvailable: 2, convergeAvailable: 2 },
};

test('dashboardHtml renders a self-contained certification command center', () => {
  const html = dashboardHtml(DASH_FIXTURE);
  assert.equal(typeof html, 'string');
  // (a) a real, complete HTML document
  assert.ok(html.toLowerCase().startsWith('<!doctype html'), 'must start with <!doctype html');
  // (b) every pot name is literal text in the page (server-rendered, not JS-only)
  for (const p of DASH_FIXTURE.pots) assert.ok(html.includes(p.name), `missing pot ${p.name}`);
  // (c) the summary counts are shown as stat tiles
  const s = DASH_FIXTURE.summary;
  for (const n of [s.pots, s.green, s.drift, s.masked, s.withIrreducibleConvergence]) {
    assert.ok(html.includes(`<div class="snum">${n}</div>`), `missing summary count ${n}`);
  }
  // (d) fully self-contained — NO external resource URLs (opens offline via file://)
  assert.ok(!/https?:\/\//.test(html), 'must contain no http(s) external URLs');
  // the report is embedded inline for inspection / client re-sort
  assert.ok(html.includes('const REPORT ='), 'REPORT data must be embedded inline');
  // verdict / convergence / hotspot semantics all surface in the roster
  assert.ok(html.includes('IRREDUCIBLE') && html.includes('RESPONSIVE'), 'convergence verdicts render');
  assert.ok(html.includes('SPIKE') && html.includes('BAND'), 'hotspot shapes render');
  assert.ok(html.includes('DRIFT'), 'drift verdict renders');
  // the two IRREDUCIBLE/FULL-SPAN paths stay separate: the hotspot-cluster tag
  // renders under its STRUCTURAL name (FULL-SPAN, class t-irr)...
  assert.ok(html.includes('t-irr">FULL-SPAN'), 'hotspot FULL-SPAN tag renders (structural)');
  assert.ok(!html.includes('t-irr">IRREDUCIBLE'), 'hotspot tag path must not render IRREDUCIBLE');
  // ...while the word IRREDUCIBLE survives ONLY as the MEASURED convergence badge
  // (class c-irr) — AlphaSpirePot inner-wall ratio 1.07.
  assert.ok(html.includes('c-irr">IRREDUCIBLE'), 'IRREDUCIBLE renders as the measured convergence verdict');
});

test('dashboardHtml tolerates an empty roster (no pots) and stays self-contained', () => {
  const html = dashboardHtml({ magic: 'potscope-doctor/v1', pots: [], summary: { pots: 0, green: 0, drift: 0, masked: 0, withIrreducibleConvergence: 0, hotspotsAvailable: 0, convergeAvailable: 0 } });
  assert.ok(html.toLowerCase().startsWith('<!doctype html'));
  assert.ok(!/https?:\/\//.test(html));
  assert.ok(html.includes('<div id="grid"></div>'), 'empty grid renders without throwing');
});

// === consolidation fixes (manifest guards, dominant-patch label, serve containment) ===

// --- Fix A: manifest schema guard on READ ---------------------------------------
// manifestStatusRows (the fresh-clone fallback) must VALIDATE the committed
// manifest's schema tag before mapping manifest.pots. A missing/foreign `magic`
// means the file is a future or unrelated schema, so it is refused with a warn and
// yields [] — never degraded rows from a shape we do not understand. The version tag
// was inert on the read side before this; now it is load-bearing. Exercised through
// buildStatusRows (empty dir → manifest fallback).
test('Fix A: buildStatusRows refuses a manifest with a wrong or missing magic (warn + [])', () => {
  const emptyDir = join(DIR, 'fixA_empty');
  mkdirSync(emptyDir, { recursive: true }); // no *.recon.json → forces the manifest fallback
  const wrongPath = join(DIR, 'certs.manifest.wrongmagic.json');
  writeFileSync(wrongPath, JSON.stringify({
    magic: 'potscope-manifest/v2', // NOT v1 — a future/foreign schema
    pots: [{ name: 'Ghost', style: 'X', tris: 1, verdict: 'GREEN', stats: { maxMm: 0.001, p99Mm: 0.001 } }],
  }));
  const missingPath = join(DIR, 'certs.manifest.nomagic.json');
  writeFileSync(missingPath, JSON.stringify({
    pots: [{ name: 'Ghost', style: 'X', tris: 1, verdict: 'GREEN', stats: { maxMm: 0.001, p99Mm: 0.001 } }],
  }));

  for (const badPath of [wrongPath, missingPath]) {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (m) => warnings.push(String(m));
    let rows;
    try {
      rows = buildStatusRows(emptyDir, badPath); // must NOT throw
    } finally {
      console.warn = origWarn;
    }
    // pre-fix this mapped the Ghost pot into a degraded row; post-fix it is refused
    assert.deepEqual(rows, [], `wrong/missing-magic manifest must yield no rows (${badPath})`);
    assert.ok(warnings.some((w) => /magic/.test(w)), `expected a schema warning for ${badPath}, got ${JSON.stringify(warnings)}`);
  }
});

// --- Fix B: per-entry resilience inside a valid manifest ------------------------
// A single malformed POT ENTRY (non-object, or missing `name`) inside an otherwise
// valid manifest must be SKIPPED with a warn — one bad entry cannot silently degrade
// (optional chaining) or sink the rest of the registry — mirroring the per-FILE
// hardening in buildStatusRows / buildManifest.
test('Fix B: buildStatusRows skips a malformed manifest entry and returns the good ones', () => {
  const emptyDir = join(DIR, 'fixB_empty');
  mkdirSync(emptyDir, { recursive: true });
  const manifestPath = join(DIR, 'certs.manifest.badentry.json');
  writeFileSync(manifestPath, JSON.stringify({
    magic: 'potscope-manifest/v1',
    pots: [
      { name: 'Good', style: 'Gothic', configDigest: 'aaa22222aaa', tris: 100, verdict: 'GREEN',
        stats: { maxMm: 0.010, p99Mm: 0.002 }, cert: { commit: 'deadbeef1234' } },
      null,                                                                 // non-object entry
      { style: 'X', tris: 5, verdict: 'GREEN', stats: { maxMm: 0.001, p99Mm: 0.001 } }, // missing name
    ],
  }));

  const warnings = [];
  const origWarn = console.warn;
  console.warn = (m) => warnings.push(String(m));
  let rows;
  try {
    rows = buildStatusRows(emptyDir, manifestPath); // must NOT throw despite the two bad entries
  } finally {
    console.warn = origWarn;
  }
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Good');
  assert.equal(rows[0].source, 'manifest');
  assert.equal(rows[0].masked, true); // 0.010/0.002 = 5 > 3 — the mask formula still applies
  assert.equal(rows[0].commit, 'deadbeef1234');
  assert.ok(warnings.some((w) => /malformed manifest entry/.test(w)),
    `expected skip warning(s) for the bad entries, got ${JSON.stringify(warnings)}`);
});

// --- Fix C: hotspot cluster patch label = DOMINANT patch, not tris[0] -----------
// A weld cluster can span a patch seam (the review flagged a SpiralRidges 23,752-tri
// cluster spanning u∈[0,1] mislabeled by its first triangle). The patch label must be
// the plurality patch over the cluster's triangles. Location 2 (classifyCluster):
test('Fix C: classifyCluster labels a seam-spanning cluster by the DOMINANT patch, not tris[0]', () => {
  const specs = [
    { uc: 0.10, vc: 0.5, e: 0.009, patchIdx: 0 }, // tris[0] sits on outer-wall...
    { uc: 0.30, vc: 0.5, e: 0.009, patchIdx: 1 },
    { uc: 0.50, vc: 0.5, e: 0.009, patchIdx: 1 },
    { uc: 0.70, vc: 0.5, e: 0.009, patchIdx: 1 },
    { uc: 0.90, vc: 0.5, e: 0.009, patchIdx: 1 }, // ...but 4 of 5 are inner-wall (plurality)
  ];
  const ctx = scene(specs, { patches: ['outer-wall', 'inner-wall'] });
  const c = classifyCluster(specs.map((_, i) => i), ctx);
  assert.equal(c.patch, 'inner-wall'); // dominant, NOT tris[0]'s 'outer-wall'
  assert.notEqual(c.patch, 'outer-wall'); // pre-fix (locBody[triIndices[0]*7]) returned this
});

// Location 1 (hotspotClusters): the same dominant-patch rule on the shared builder.
// 3 tris welded on (0,0,0); tri0 on outer-wall (patchIdx 0), tri1+tri2 on inner-wall
// (patchIdx 1) → plurality = inner-wall, first-triangle = outer-wall.
test('Fix C: hotspotClusters labels a seam-welded cluster by the DOMINANT patch', () => {
  const d = join(DIR, 'fixC_hc');
  mkdirSync(d, { recursive: true });
  const MIXED_PATCH_LOC = [
    [0, 0.5, 0.5, 0.502, 0.5, 0.5, 0.502],    // tri0 → outer-wall (sorts first)
    [1, 0.5, 0.5, 0.498, 0.5, 0.5, 0.498],    // tri1 → inner-wall
    [1, 0.5, 0.5, 0.501, 0.501, 0.5005, 0.5], // tri2 → inner-wall
  ];
  writeHotPot(d, 'Seam', { errors: [0.009, 0.008, 0.007], locRows: MIXED_PATCH_LOC, stats: { maxMm: 0.009, p50Mm: 0.002, p99Mm: 0.005 } });
  const { clusters } = hotspotClusters(join(d, 'Seam.stl'));
  assert.equal(clusters.length, 1); // all 3 welded on (0,0,0)
  assert.equal(clusters[0].patch, 'inner-wall'); // dominant (2 of 3), not tris[0]'s outer-wall
});

// --- Fix D: serve path-traversal containment ------------------------------------
// cmdServe's directory guard must reject a shared-prefix SIBLING: a bare
// `startsWith(dir)` admits `/x/_certified_stl_secret/...` past a guard on
// `/x/_certified_stl`. isInsideDir requires the resolved path to equal dir or begin
// with `dir + path.sep`.
import { isInsideDir } from './potscope.mjs';

test('Fix D: isInsideDir — descendant true, shared-prefix sibling false, dir itself true', () => {
  assert.equal(isInsideDir('/x/_certified_stl/a', '/x/_certified_stl'), true);   // descendant
  assert.equal(isInsideDir('/x/_certified_stl_secret/a', '/x/_certified_stl'), false); // sibling — the bug
  assert.equal(isInsideDir('/x/_certified_stl', '/x/_certified_stl'), true);      // dir itself
});

// === calibration gate: convergence ratios are only trustworthy when CALIBRATED (P2c) ===
// The roster bake attaches a `calibration` object to each converge.json:
// { certGlobalMaxMm, certPerPatchMaxMm, calibrationRatio, tolerance }. A pot is
// CALIBRATED when calibrationRatio <= tolerance — i.e. the cheap depth-N proxy's
// fine-density max sits within tolerance× of the pot's KNOWN certified max. When
// calibrationRatio > tolerance the proxy is too loose (Voronoi blows up 427×), so
// its per-patch ratios are NOT trustworthy and must never be shown as a measured
// verdict. These tests pin that honesty gate across readConverge/doctor/dashboard.

test('readConverge derives `calibrated` from calibrationRatio vs tolerance and surfaces both', () => {
  // ratio ABOVE tolerance → NOT calibrated (proxy fine-max too far above the cert)
  const uncal = readConverge(writeConverge('uncal.converge.json', CONVERGE_PATCHES, {
    depth: 2,
    calibration: { certGlobalMaxMm: 0.005, certPerPatchMaxMm: {}, calibrationRatio: 427.41, tolerance: 2.5 },
  }));
  assert.equal(uncal.calibrated, false);
  assert.ok(Math.abs(uncal.calibrationRatio - 427.41) < 1e-9, 'calibrationRatio surfaced (not lost)');
  assert.equal(uncal.tolerance, 2.5);

  // ratio BELOW tolerance → calibrated
  const cal = readConverge(writeConverge('cal.converge.json', CONVERGE_PATCHES, {
    calibration: { certGlobalMaxMm: 0.005, certPerPatchMaxMm: {}, calibrationRatio: 1.32, tolerance: 2.5 },
  }));
  assert.equal(cal.calibrated, true);
  assert.ok(Math.abs(cal.calibrationRatio - 1.32) < 1e-9);
  assert.equal(cal.tolerance, 2.5);

  // EXACT boundary calibrationRatio === tolerance → calibrated (the gate is <=)
  const edge = readConverge(writeConverge('edge.converge.json', CONVERGE_PATCHES, {
    calibration: { certGlobalMaxMm: 0.005, certPerPatchMaxMm: {}, calibrationRatio: 2.5, tolerance: 2.5 },
  }));
  assert.equal(edge.calibrated, true);

  // no calibration object at all → cannot verify ⇒ NOT calibrated (honest default)
  const none = readConverge(writeConverge('nocal.converge.json', CONVERGE_PATCHES));
  assert.equal(none.calibrated, false);
  assert.equal(none.calibrationRatio, null);
});

test('buildDoctorReport: an UNCALIBRATED irreducible is marked and excluded from the irreducible frontier', () => {
  const d = join(DIR, 'doctor_uncal');
  mkdirSync(d, { recursive: true });
  // "Uncal": worst verdict IS IRREDUCIBLE (ratio 0.62 < 1.8) but the probe is
  // UNCALIBRATED (calibrationRatio 427 > tol 2.5) — an unreliable irreducible.
  writeFileSync(join(d, 'Uncal.recon.json'), JSON.stringify({ name: 'Uncal', style: 'Voronoi', tris: 100, configDigest: 'u', verdict: 'GREEN' }));
  writeFileSync(join(d, 'Uncal.converge.json'), JSON.stringify({
    magic: 'potscope-converge/v1', variant: 'Uncal', style: 'Voronoi', depth: 2,
    calibration: { certGlobalMaxMm: 0.005, certPerPatchMaxMm: {}, calibrationRatio: 427.41, tolerance: 2.5 },
    perPatch: { 'outer-wall': { fineMaxMm: 2.13, coarseMaxMm: 1.32, ratio: 0.62, fineTris: 100, coarseTris: 25 } },
  }));
  // "Cal": worst IRREDUCIBLE (ratio 1.07) AND calibrated (1.32 <= 2.5) → the only one counted
  writeFileSync(join(d, 'Cal.recon.json'), JSON.stringify({ name: 'Cal', style: 'GeometricStar', tris: 100, configDigest: 'c', verdict: 'GREEN' }));
  writeFileSync(join(d, 'Cal.converge.json'), JSON.stringify({
    magic: 'potscope-converge/v1', variant: 'Cal', style: 'GeometricStar', depth: 2,
    calibration: { certGlobalMaxMm: 0.005, certPerPatchMaxMm: {}, calibrationRatio: 1.32, tolerance: 2.5 },
    perPatch: { 'inner-wall': { fineMaxMm: 0.0059, coarseMaxMm: 0.0063, ratio: 1.07, fineTris: 200, coarseTris: 100 } },
  }));

  const report = buildDoctorReport(d, { fast: true });
  const uncal = report.pots.find((p) => p.name === 'Uncal');
  const cal = report.pots.find((p) => p.name === 'Cal');
  assert.equal(uncal.convergence.available, true);
  assert.equal(uncal.convergence.calibrated, false);
  assert.equal(uncal.convergence.worst.verdict, 'IRREDUCIBLE'); // it IS irreducible...
  assert.equal(cal.convergence.calibrated, true);
  assert.equal(cal.convergence.worst.verdict, 'IRREDUCIBLE');

  // ...but an UNCALIBRATED irreducible is not trustworthy, so only the CALIBRATED one counts
  assert.equal(report.summary.withIrreducibleConvergence, 1);
  assert.equal(report.summary.convergeCalibrated, 1);
  assert.equal(report.summary.convergeUncalibrated, 1);
  assert.equal(report.summary.convergeAvailable, 2);
});

test('dashboardHtml renders an UNCALIBRATED convergence row as a muted chip, never an authoritative verdict badge', () => {
  const report = {
    magic: 'potscope-doctor/v1',
    pots: [{
      name: 'UncalVoronoiPot', style: 'Voronoi', tris: 172032, verdict: 'GREEN',
      maxMm: 0.005, p99Mm: 0.004, masked: false, source: 'sidecar',
      hotspots: { available: false, top: null },
      convergence: {
        available: true, calibrated: false, calibrationRatio: 427.41,
        worst: { patchId: 'outer-wall', ratio: 0.62, verdict: 'IRREDUCIBLE' },
      },
    }],
    summary: { pots: 1, green: 1, drift: 0, masked: 0, withIrreducibleConvergence: 0, convergeCalibrated: 0, convergeUncalibrated: 1, hotspotsAvailable: 0, convergeAvailable: 1 },
  };
  const html = dashboardHtml(report);
  assert.ok(html.includes('UncalVoronoiPot'), 'pot renders');
  // Scope the assertions to THIS pot's card (the footer legend always shows one of
  // every badge, incl. a sample c-irr">IRREDUCIBLE — a global absence check would
  // collide with that legend, not the pot's row).
  const cardStart = html.indexOf('data-name="UncalVoronoiPot"');
  assert.ok(cardStart >= 0, 'pot card present');
  const card = html.slice(cardStart, html.indexOf('</article>', cardStart));
  // the convergence row is explicitly marked uncalibrated (muted chip)...
  assert.ok(/uncalibrated/i.test(card), 'convergence row marked uncalibrated');
  assert.ok(card.includes('c-uncal'), 'uncalibrated chip uses the muted c-uncal class');
  // ...and NO authoritative RESPONSIVE/PARTIAL/IRREDUCIBLE verdict badge is rendered
  // for it — the ratio is unreliable, so a viewer must never read it as a measured verdict.
  assert.ok(!/c-(resp|part|irr)"/.test(card), `uncalibrated card must show no authoritative cBadge, card=${card}`);
  // the worst ratio is still surfaced as context (just not as a verdict)
  assert.ok(card.includes('×0.62'), 'worst ratio still shown as context');
});

// === run history: on-completion historical comparison (pure core, P5) ===========
// runHistory is the testable core of cmdRun's on-exit "prior runs of this cmd" line.
// It scans a SNAPSHOT of ledger entries for prior `run-complete` entries with the
// SAME cmd and summarizes them: count (how many matched), avgMs (mean of their
// elapsedMs), lastMs (the most-recent matching in ARRAY order — deliberately not the
// min/max/avg). cmdRun snapshots the ledger BEFORE appending this run's own entry,
// so the run that just finished is excluded by construction (nothing to strip here).
import { runHistory } from './potscope.mjs';

test('runHistory summarizes prior run-complete entries for the same cmd (count / avg / last)', () => {
  const entries = [
    { kind: 'run-complete', cmd: 'bake A', exitCode: 0, elapsedMs: 100 },
    { kind: 'probe', cmd: 'bake A', line: '[probe:x] ...' },               // wrong kind → ignored
    { kind: 'run-complete', cmd: 'bake B', exitCode: 0, elapsedMs: 9999 }, // wrong cmd → ignored
    { kind: 'run-complete', cmd: 'bake A', exitCode: 0, elapsedMs: 700 },
    { kind: 'run-complete', cmd: 'bake A', exitCode: 1, elapsedMs: 200 },
    { kind: 'run-complete', cmd: 'bake A', exitCode: 0, elapsedMs: 400 },  // last matching in array order
  ];
  const h = runHistory(entries, 'bake A');
  assert.equal(h.count, 4);                            // four 'bake A' run-complete entries
  assert.equal(h.avgMs, (100 + 700 + 200 + 400) / 4);  // = 350, mean of the matching elapsedMs
  // lastMs is the LAST matching in array order (400) — deliberately not the min (100),
  // max (700), or the avg (350), so the assertion pins array-order semantics exactly.
  assert.equal(h.lastMs, 400);
});

test('runHistory returns the null shape on empty / no-match / non-numeric elapsedMs', () => {
  const nullShape = { count: 0, avgMs: null, lastMs: null };
  assert.deepEqual(runHistory([], 'bake A'), nullShape); // empty snapshot
  assert.deepEqual(
    runHistory([{ kind: 'run-complete', cmd: 'other', elapsedMs: 50 }], 'bake A'),
    nullShape // entries exist but none match the cmd
  );
  // a run-complete for the right cmd but with a non-numeric elapsedMs cannot
  // contribute (it would poison the mean) → still the null shape, never { count: 1, avgMs: NaN }
  assert.deepEqual(
    runHistory([{ kind: 'run-complete', cmd: 'bake A', elapsedMs: undefined }], 'bake A'),
    nullShape
  );
});
