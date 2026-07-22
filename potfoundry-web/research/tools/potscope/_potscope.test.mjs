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

test('classifyCluster: full-u row at fixed v -> BAND + IRREDUCIBLE', () => {
  const specs = [];
  for (let i = 0; i < 40; i += 1) specs.push({ uc: i / 40, vc: 0.87, e: 0.0099 });
  const ctx = scene(specs);
  const c = classifyCluster(specs.map((_, i) => i), ctx);
  assert.equal(c.shape, 'BAND');
  assert.ok(c.tags.includes('IRREDUCIBLE'), `tags ${c.tags}`);
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
