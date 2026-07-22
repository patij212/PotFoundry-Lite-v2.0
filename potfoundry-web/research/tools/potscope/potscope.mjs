#!/usr/bin/env node
/**
 * potscope — a lab instrument panel for the 0.01 mm certification campaign.
 *
 * Built by the session agent, for the session agent (2026-07-17): the three
 * frictions this tool removes are the ones that actually cost sessions —
 * probe results living only in transcripts, refusal cells hand-decoded with
 * the calibrated Gothic model, and never once SEEING a certified artifact.
 *
 * Zero dependencies. Plain node ESM.
 *
 *   node potscope.mjs ledger list [--grep <re>] [--last <n>]
 *   node potscope.mjs ledger add '<json>'
 *   node potscope.mjs run -- <command ...>      # spawn + EcoQoS bump + probe capture
 *   node potscope.mjs decode '<refusal line>' [--patch inner|outer] [--counts '<json>']
 *   node potscope.mjs view <file.stl> [--out <file.html>] [--decimate <k>]
 */
import { spawn, execFile } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEDGER = join(HERE, 'ledger.jsonl');

// ---------------------------------------------------------------- Gothic model
// The calibrated constants of the 2026-07-17 campaign (matrix Addenda 15-20).
const GOTHIC = {
  spring: 0.15,
  archHeight: 0.7 * (1 - 0.15),
  apex: 0.15 + 0.7 * (1 - 0.15),
  ribHalfWidth: 0.04,
  ribOffsets: [0.002, 0.0045, 0.0075, 0.011, 0.0155, 0.021, 0.028, 0.036],
  topStart: 0.53675,
  blendW: 0.05, // max(0.015, 1.25*gaBandW) at defaults
  bandSupport: 0.072, // 1.8*gaBandW
  kappa0: 0.595 * (12 * Math.PI) ** 2 / 2 / ((12 * Math.PI) ** 2 / 2) * 845, // = 845
  slopeMax: 0.595 * 12 * Math.PI,
  innerRemapT: (v) => (3 + 29 * v) / 32, // H32 pot
};

const archZ = (uStyle) =>
  GOTHIC.spring + GOTHIC.archHeight * (1 - Math.abs(Math.cos(12 * Math.PI * uStyle)));

function decodeVertex(uPatch, vPatch, patch) {
  const uStyle = patch === 'inner' ? 1 - uPatch : uPatch;
  const t = patch === 'inner' ? GOTHIC.innerRemapT(vPatch) : vPatch;
  const baseColumn = Math.round(uStyle * 12) / 12;
  const deltaBase = Math.abs(uStyle - baseColumn);
  const apexColumn = (Math.round(uStyle * 24 - 1) | 1) / 24; // nearest odd 24th
  const deltaApex = Math.abs(uStyle - apexColumn);
  const az = archZ(uStyle);
  const d = t - az;
  const kappa = 845 * Math.abs(Math.cos(12 * Math.PI * uStyle));
  const slope = GOTHIC.slopeMax * Math.abs(Math.sin(12 * Math.PI * uStyle));
  let nearestOffset = null;
  for (const o of GOTHIC.ribOffsets) {
    for (const signed of [o, -o]) {
      if (nearestOffset === null || Math.abs(d - signed) < Math.abs(d - nearestOffset)) {
        nearestOffset = signed;
      }
    }
  }
  return { uStyle, t, baseColumn, deltaBase, apexColumn, deltaApex, archZ: az, d, kappa, slope, nearestOffset };
}

function mechanismHints(vertices) {
  const hints = [];
  const ts = vertices.map((x) => x.t);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const deltaBase = Math.min(...vertices.map((x) => x.deltaBase));
  const deltaApex = Math.min(...vertices.map((x) => x.deltaApex));
  const dAbs = Math.min(...vertices.map((x) => Math.abs(x.d)));
  if (deltaBase < 0.025 && dAbs < 0.05) {
    hints.push(
      `CREASE COLLAR candidate: delta=${deltaBase.toFixed(4)} off a base column, |d|=${dAbs.toFixed(4)} ` +
        `from the kink. Crease chord model: R[um] ~ 2500*kappa*g^2 (kappa here ~${vertices[0].kappa.toFixed(0)}); ` +
        `offset-curve model: R ~ kappa*g^2/8 * f'(o), f'(o) = 20000*(1-|o|/0.04)^3 um/unit-t.`
    );
  }
  const blendLo = GOTHIC.topStart - GOTHIC.blendW;
  const blendHi = GOTHIC.topStart + GOTHIC.blendW;
  if (tMax > blendLo && tMin < blendHi) {
    hints.push(
      `TIER-BLEND zone [${blendLo.toFixed(4)}, ${blendHi.toFixed(4)}]: smoothstep curvature ` +
        `peaks at the ends (+-600/t^2 x crest delta ~140um at base columns / composite at apex).`
    );
  }
  if (tMax > GOTHIC.topStart - GOTHIC.bandSupport && tMin < GOTHIC.topStart + GOTHIC.bandSupport) {
    hints.push(
      `bandMid RIDGE support [${(GOTHIC.topStart - GOTHIC.bandSupport).toFixed(4)}, ` +
        `${(GOTHIC.topStart + GOTHIC.bandSupport).toFixed(4)}]: quartic flank f'' up to ~2315*A/t^2.`
    );
  }
  if (tMax > 1 - GOTHIC.bandSupport) {
    hints.push(`bandRim RIDGE flank (crest at t=1.0): same 1.8*gaBandW quartic as bandMid.`);
  }
  if (deltaApex < 0.006) {
    hints.push(
      `MULLION spike zone: delta=${deltaApex.toFixed(5)} off an apex column ` +
        `(kappa_u ~ 107,000/u^2, half-width ~0.0026u; j-spikes cover +-8/2048).`
    );
  }
  if (hints.length === 0) hints.push('No standard-mechanism zone matched: measure locally (TRUE-sag map first).');
  return hints;
}

function cmdDecode(args) {
  const line = args._[0] ?? '';
  const patchArg = argValue(args, '--patch');
  const countsArg = argValue(args, '--counts');
  const uvMatches = [...line.matchAll(/\(([\d.]+),([\d.]+)\)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
  const triMatch = line.match(/tri=(\d+)/);
  // Loc-backed, style-agnostic decode: when a pot is named AND its loc.bin sidecar
  // exists, resolve tri=<global> straight to patch + per-vertex (u,v) from the
  // sidecar instead of the hardcoded Gothic model. Gothic falls through so its
  // calibrated mechanismHints still print; every other style returns here.
  const potArg = argValue(args, '--pot');
  if (potArg && triMatch) {
    const locPath = potArg.endsWith('.loc.bin') ? resolve(potArg) : resolve(`${potArg}.stl.loc.bin`);
    if (existsSync(locPath)) {
      const r = resolveTriFromLoc(locPath, Number(triMatch[1]));
      console.log(`tri ${triMatch[1]} -> patch ${r.patch} (style ${r.style})`);
      r.vertices.forEach((v, i) => console.log(`  v${i}: patch-u ${v.u.toFixed(6)} patch-v ${v.v.toFixed(6)}`));
      if (r.style !== 'GothicArches') {
        console.log('  (style-agnostic loc decode; Gothic mechanism hints suppressed for non-Gothic style)');
        return;
      }
      // Gothic: fall through so the calibrated mechanismHints still print for GothicArches.
    }
  }
  const pmMatch = line.match(/(\d{7,}) pm/);
  let patch = patchArg ?? null;
  let localIndex = null;
  if (triMatch) {
    const globalIndex = Number(triMatch[1]);
    let counts = countsArg ? JSON.parse(countsArg) : latestTricountFromLedger();
    if (counts) {
      let offset = 0;
      for (const [patchId, count] of Object.entries(counts)) {
        if (globalIndex < offset + count) {
          patch = patch ?? (patchId.includes('inner') ? 'inner' : patchId.includes('outer') ? 'outer' : patchId);
          localIndex = globalIndex - offset;
          console.log(`tri ${globalIndex} -> ${patchId} local ${localIndex} of ${count} (${((100 * localIndex) / count).toFixed(1)}% of the patch sweep)`);
          break;
        }
        offset += count;
      }
    } else {
      console.log(`tri=${globalIndex}: GLOBAL artifact index (the Addendum-17 lesson!) — supply --counts or a [probe:tricount] ledger entry to resolve the patch.`);
    }
  }
  if (patch !== 'inner' && patch !== 'outer') {
    console.log(`patch unresolved (say --patch inner|outer for wall decode); defaulting to outer`);
    patch = 'outer';
  }
  if (pmMatch) {
    const pm = Number(pmMatch[1]);
    console.log(`residual ${pm} pm = ${(pm / 1e6).toFixed(6)} um (${pm - 9500000 >= 0 ? '+' : ''}${pm - 9500000} pm vs the 9.5 um bound)`);
  }
  if (uvMatches.length === 0) {
    console.log('no uv=(a,b) pairs found in the line');
    return;
  }
  const decoded = uvMatches.map(([u, v]) => decodeVertex(u, v, patch));
  for (let i = 0; i < decoded.length; i += 1) {
    const d = decoded[i];
    console.log(
      `v${i}: patch(${uvMatches[i][0].toFixed(6)}, ${uvMatches[i][1].toFixed(6)}) -> style-u ${d.uStyle.toFixed(6)}  t ${d.t.toFixed(6)}  ` +
        `dBase ${d.deltaBase.toFixed(5)}@${d.baseColumn.toFixed(4)}  dApex ${d.deltaApex.toFixed(5)}  ` +
        `archZ ${d.archZ.toFixed(5)}  d=t-archZ ${d.d.toFixed(5)} (nearest rib offset ${d.nearestOffset})  kappa ${d.kappa.toFixed(0)}  slope ${d.slope.toFixed(1)}`
    );
  }
  console.log('--- mechanism hints ---');
  for (const hint of mechanismHints(decoded)) console.log(`  * ${hint}`);
}

// -------------------------------------------------------------------- ledger
function ledgerAppend(entry) {
  mkdirSync(dirname(LEDGER), { recursive: true });
  appendFileSync(LEDGER, `${JSON.stringify(entry)}\n`);
}

function ledgerEntries() {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
}

function latestTricountFromLedger() {
  const entries = ledgerEntries().reverse();
  for (const entry of entries) {
    const line = entry.line ?? entry.raw ?? '';
    const m = typeof line === 'string' && line.match(/\[probe:tricount\][^]*?totalTris=\d+ (.*)$/);
    if (m) {
      const counts = {};
      for (const pair of m[1].trim().split(/\s+/)) {
        const [k, v] = pair.split('=');
        if (k && v && !Number.isNaN(Number(v))) counts[k] = Number(v);
      }
      if (Object.keys(counts).length > 0) return counts;
    }
    if (entry.tricount) return entry.tricount;
  }
  return null;
}

function cmdLedger(args) {
  const sub = args._[0];
  if (sub === 'add') {
    const json = args._[1];
    ledgerAppend({ ts: new Date().toISOString(), ...JSON.parse(json) });
    console.log('appended');
    return;
  }
  const grep = argValue(args, '--grep');
  const last = Number(argValue(args, '--last') ?? '50');
  let entries = ledgerEntries();
  if (grep) {
    const re = new RegExp(grep, 'i');
    entries = entries.filter((entry) => re.test(JSON.stringify(entry)));
  }
  for (const entry of entries.slice(-last)) {
    console.log(JSON.stringify(entry));
  }
  console.log(`-- ${entries.length} matching entries (ledger: ${LEDGER})`);
}

// ----------------------------------------------------------------------- run
function cmdRun(args) {
  const command = args._;
  if (command.length === 0) {
    console.error('usage: potscope run -- <command ...>');
    process.exit(2);
  }
  const startedAt = Date.now();
  // shell:true concatenates args without escaping, which re-splits any token
  // containing whitespace (a multi-word `-t` filter becomes stray file
  // filters). Quote such tokens before handing the line to the shell.
  const quoted = command.map((token) => (/\s/.test(token) ? `"${token.replace(/"/g, '\\"')}"` : token));
  const child = spawn(quoted[0], quoted.slice(1), { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  // The EcoQoS ritual, automated: Windows throttles detached node jobs 4-5x.
  setTimeout(() => {
    if (process.platform === 'win32') {
      execFile('powershell', ['-NoProfile', '-Command',
        "Get-Process node -ErrorAction SilentlyContinue | ForEach-Object { try { $_.PriorityClass = 'AboveNormal' } catch {} }"],
        () => console.log('[potscope] node priorities bumped to AboveNormal'));
    }
  }, 8000);
  const onData = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    for (const line of text.split('\n')) {
      if (/\[probe:[^\]]+\]/.test(line)) {
        ledgerAppend({
          ts: new Date().toISOString(),
          kind: 'probe',
          cmd: command.join(' '),
          line: line.replace(/\[[0-9;]*m/g, '').trim(),
        });
      }
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => {
    ledgerAppend({
      ts: new Date().toISOString(),
      kind: 'run-complete',
      cmd: command.join(' '),
      exitCode: code,
      elapsedMs: Date.now() - startedAt,
    });
    console.log(`[potscope] exit ${code} after ${((Date.now() - startedAt) / 1000).toFixed(1)}s (probe lines ledgered)`);
    process.exit(code ?? 0);
  });
}

// ---------------------------------------------------------------------- view
export function parseStl(stlPath, decimate = 1) {
  const bytes = readFileSync(stlPath);
  const triangleCount = bytes.readUInt32LE(80);
  const kept = Math.floor(triangleCount / decimate);
  const positions = new Float32Array(kept * 9);
  let write = 0;
  for (let i = 0; i < kept; i += 1) {
    const at = 84 + i * decimate * 50;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const va = at + 12 + vertex * 12;
      positions[write] = bytes.readFloatLE(va);
      positions[write + 1] = bytes.readFloatLE(va + 4);
      positions[write + 2] = bytes.readFloatLE(va + 8);
      write += 3;
    }
  }
  return { title: stlPath.split(/[\\/]/).pop(), triangleCount, kept, positions };
}

export function bboxOf(positions) {
  const bbox = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis];
      if (value < bbox.min[axis]) bbox.min[axis] = value;
      if (value > bbox.max[axis]) bbox.max[axis] = value;
    }
  }
  return bbox;
}

// Certification STLs carry derived/zero normal fields — every normal in the
// viewer is recomputed from windings so the lighting is honest.
export function flatNormals(positions) {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < positions.length; t += 9) {
    const e1x = positions[t + 3] - positions[t], e1y = positions[t + 4] - positions[t + 1], e1z = positions[t + 5] - positions[t + 2];
    const e2x = positions[t + 6] - positions[t], e2y = positions[t + 7] - positions[t + 1], e2z = positions[t + 8] - positions[t + 2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const norm = Math.hypot(nx, ny, nz) || 1;
    nx /= norm; ny /= norm; nz /= norm;
    for (let c = 0; c < 3; c += 1) { normals[t + c * 3] = nx; normals[t + c * 3 + 1] = ny; normals[t + c * 3 + 2] = nz; }
  }
  return normals;
}

// Ceramic mode: welded smooth normals (crease-preserving, 40° cone) plus a
// discrete "pointiness" — the mean of dot(edge direction, vertex normal) over
// the welded 1-ring. Positive in recesses (glaze pools and deepens), negative
// on crests (glaze thins toward the clay body). Normalised per mesh so
// p95(|cavity|) = 1: pooling reads consistently across styles and densities.
export function ceramicAttributes(positions) {
  const cornerCount = positions.length / 3;
  const faceCount = cornerCount / 3;
  const faceNX = new Float32Array(faceCount), faceNY = new Float32Array(faceCount), faceNZ = new Float32Array(faceCount);
  const crossX = new Float32Array(faceCount), crossY = new Float32Array(faceCount), crossZ = new Float32Array(faceCount);
  const cornerKey = new Array(cornerCount);
  const verts = new Map();
  for (let f = 0; f < faceCount; f += 1) {
    const t = f * 9;
    const e1x = positions[t + 3] - positions[t], e1y = positions[t + 4] - positions[t + 1], e1z = positions[t + 5] - positions[t + 2];
    const e2x = positions[t + 6] - positions[t], e2y = positions[t + 7] - positions[t + 1], e2z = positions[t + 8] - positions[t + 2];
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(cx, cy, cz) || 1;
    crossX[f] = cx; crossY[f] = cy; crossZ[f] = cz;
    faceNX[f] = cx / len; faceNY[f] = cy / len; faceNZ[f] = cz / len;
    for (let s = 0; s < 3; s += 1) {
      const i = t + s * 3;
      const key = `${positions[i]},${positions[i + 1]},${positions[i + 2]}`;
      cornerKey[f * 3 + s] = key;
      let entry = verts.get(key);
      if (!entry) { entry = { faces: [], sx: 0, sy: 0, sz: 0, rep: i, nb: new Set() }; verts.set(key, entry); }
      entry.faces.push(f);
      entry.sx += cx; entry.sy += cy; entry.sz += cz; // raw cross = area-weighted normal
    }
    for (let s = 0; s < 3; s += 1) {
      const a = cornerKey[f * 3 + s], b = cornerKey[f * 3 + ((s + 1) % 3)];
      if (a !== b) { verts.get(a).nb.add(b); verts.get(b).nb.add(a); }
    }
  }
  for (const entry of verts.values()) {
    const len = Math.hypot(entry.sx, entry.sy, entry.sz) || 1;
    entry.nx = entry.sx / len; entry.ny = entry.sy / len; entry.nz = entry.sz / len;
    let sum = 0, count = 0;
    for (const nbKey of entry.nb) {
      const o = verts.get(nbKey).rep;
      const ex = positions[o] - positions[entry.rep], ey = positions[o + 1] - positions[entry.rep + 1], ez = positions[o + 2] - positions[entry.rep + 2];
      const el = Math.hypot(ex, ey, ez) || 1;
      sum += (ex * entry.nx + ey * entry.ny + ez * entry.nz) / el;
      count += 1;
    }
    entry.cavity = count > 0 ? sum / count : 0;
  }
  const magnitudes = [];
  for (const entry of verts.values()) magnitudes.push(Math.abs(entry.cavity));
  magnitudes.sort((a, b) => a - b);
  const p95 = magnitudes[Math.min(magnitudes.length - 1, Math.floor(magnitudes.length * 0.95))] || 1;
  const cone = Math.cos((40 * Math.PI) / 180);
  const normals = new Float32Array(positions.length);
  const cavity = new Float32Array(cornerCount);
  for (let f = 0; f < faceCount; f += 1) {
    for (let s = 0; s < 3; s += 1) {
      const c = f * 3 + s;
      const entry = verts.get(cornerKey[c]);
      let sx = 0, sy = 0, sz = 0;
      for (const g of entry.faces) {
        if (faceNX[g] * faceNX[f] + faceNY[g] * faceNY[f] + faceNZ[g] * faceNZ[f] > cone) {
          sx += crossX[g]; sy += crossY[g]; sz += crossZ[g];
        }
      }
      const len = Math.hypot(sx, sy, sz);
      if (len > 0) { normals[c * 3] = sx / len; normals[c * 3 + 1] = sy / len; normals[c * 3 + 2] = sz / len; }
      else { normals[c * 3] = faceNX[f]; normals[c * 3 + 1] = faceNY[f]; normals[c * 3 + 2] = faceNZ[f]; }
      cavity[c] = Math.max(-1, Math.min(1, entry.cavity / p95));
    }
  }
  return { normals, cavity };
}

// Shelf layout — FULL RESOLUTION, no decimation. Every source triangle is kept
// (the certified-shelf mandate: "only full resolution is acceptable"). Each pot
// is base-aligned (centred in x/y, sitting on the floor at z=0), then placed on
// a centred grid of rows. The prior clusterDecimate() snapped pots onto a
// 24-96³ voxel grid to hit a ~22k-tri budget — at OD30 that is 0.3-1.25 mm
// cells vs the 0.01 mm certified feature scale, so it deleted exactly the
// certified detail (WaveInterference 1.27M -> 21k, 1.7% kept). Removed.
export function layoutShelf(models, opts = {}) {
  const perRow = opts.perRow ?? 7;
  const aligned = models.map((m) => {
    const bb = m.bbox ?? bboxOf(m.positions);
    const dx = -(bb.min[0] + bb.max[0]) / 2;
    const dy = -(bb.min[1] + bb.max[1]) / 2;
    const dz = -bb.min[2];
    const p = new Float32Array(m.positions.length);
    for (let i = 0; i < p.length; i += 3) {
      p[i] = m.positions[i] + dx;
      p[i + 1] = m.positions[i + 1] + dy;
      p[i + 2] = m.positions[i + 2] + dz;
    }
    return { ...m, positions: p, bbox: bboxOf(p) };
  });
  const count = aligned.length;
  const rows = Math.ceil(count / perRow);
  const cols = Math.ceil(count / rows);
  const footprint = Math.max(
    ...aligned.map((m) => Math.max(m.bbox.max[0] - m.bbox.min[0], m.bbox.max[1] - m.bbox.min[1])),
    1e-6
  );
  const spacing = footprint * 1.25;
  let totalFloats = 0;
  for (const m of aligned) totalFloats += m.positions.length;
  const positions = new Float32Array(totalFloats);
  const hasNormals = aligned.every((m) => m.normals);
  const hasCavity = aligned.every((m) => m.cavity);
  const normals = hasNormals ? new Float32Array(totalFloats) : null;
  const cavity = hasCavity ? new Float32Array(totalFloats / 3) : null;
  const layout = [];
  let writeAt = 0;
  aligned.forEach((m, i) => {
    const row = Math.floor(i / cols);
    const rowCount = Math.min(cols, count - row * cols);
    const col = i - row * cols;
    const ox = (col - (rowCount - 1) / 2) * spacing;
    const oy = ((rows - 1) / 2 - row) * spacing * 1.1;
    for (let j = 0; j < m.positions.length; j += 3) {
      positions[writeAt + j] = m.positions[j] + ox;
      positions[writeAt + j + 1] = m.positions[j + 1] + oy;
      positions[writeAt + j + 2] = m.positions[j + 2];
    }
    if (normals) normals.set(m.normals, writeAt);
    if (cavity) cavity.set(m.cavity, writeAt / 3);
    layout.push({ name: m.name, triStart: writeAt / 9, triCount: m.positions.length / 9 });
    writeAt += m.positions.length;
  });
  return {
    positions,
    normals,
    cavity,
    bbox: bboxOf(positions),
    keptTris: totalFloats / 9,
    potCount: count,
    layout,
  };
}

// The compact geometry payload the fetch-viewer loads: one JSON header line,
// then raw little-endian Float32 buffers (positions, then optional normals,
// cavity, per-corner error). Binary — no base64 inflation — so a 1.27M-tri pot
// is a ~46 MB fetch instead of a 116 MB embedded-base64 HTML, and the whole
// certified shelf loads at full resolution. All heavy/complex prep (welded
// ceramic normals, layout, error subsampling) stays in Node; the browser just
// slices buffers and uploads them (no logic duplicated across the boundary).
export function buildPack(view) {
  const { mode, positions } = view;
  const normals = view.normals ?? null;
  const cavity = view.cavity ?? null;
  const error = view.error ?? null;
  const header = {
    magic: 'potscope-pack/v1',
    mode,
    triangleCount: positions.length / 9,
    hasNormals: !!normals,
    hasCavity: !!cavity,
    hasError: !!error,
    ...view.meta,
  };
  const asBuf = (arr) => Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const parts = [Buffer.from(`${JSON.stringify(header)}\n`, 'utf8'), asBuf(positions)];
  if (normals) parts.push(asBuf(normals));
  if (cavity) parts.push(asBuf(cavity));
  if (error) parts.push(asBuf(error));
  return Buffer.concat(parts);
}

export function readPack(buffer) {
  const newline = buffer.indexOf(0x0a);
  const header = JSON.parse(buffer.subarray(0, newline).toString('utf8'));
  let offset = newline + 1;
  const take = (floats) => {
    const out = new Float32Array(floats);
    Buffer.from(out.buffer).set(buffer.subarray(offset, offset + floats * 4));
    offset += floats * 4;
    return out;
  };
  const triCount = header.triangleCount;
  const positions = take(triCount * 9);
  const normals = header.hasNormals ? take(triCount * 9) : null;
  const cavity = header.hasCavity ? take(triCount * 3) : null;
  const error = header.hasError ? take(triCount * 3) : null;
  return { header, positions, normals, cavity, error };
}

export function readLoc(path) {
  const raw = readFileSync(path);
  const nl = raw.indexOf(0x0a);
  const header = JSON.parse(raw.subarray(0, nl).toString('utf8'));
  if (header.magic !== 'potscope-loc/v1') throw new Error(`bad loc magic: ${header.magic}`);
  const body = new Float32Array(header.count * 7);
  Buffer.from(body.buffer).set(raw.subarray(nl + 1, nl + 1 + header.count * 7 * 4));
  return { header, body };
}

// Exact, style-agnostic resolution of a GLOBAL artifact triangle index to its
// patch + per-vertex (u,v) from the loc.bin sidecar (Task 2's reconstruct bakes
// one triangle-for-triangle with the STL). This replaces the calibrated Gothic
// analytic model in decode for the other 19 styles: the sidecar already carries
// the truth (which patch, which uv), so there is nothing to re-derive per style.
export function resolveTriFromLoc(locPath, globalTri) {
  const { header, body } = readLoc(locPath);
  if (globalTri < 0 || globalTri >= header.count) throw new Error(`tri ${globalTri} out of range 0..${header.count - 1}`);
  const patchIdx = body[globalTri * 7];
  const vertices = [0, 1, 2].map((k) => ({ u: body[globalTri * 7 + 1 + k * 2], v: body[globalTri * 7 + 2 + k * 2] }));
  return { patch: header.patches[patchIdx] ?? `patch${patchIdx}`, style: header.style, vertices };
}

export function readErrorRaw(path) {
  const raw = readFileSync(path);
  const nl = raw.indexOf(0x0a);
  const header = JSON.parse(raw.subarray(0, nl).toString('utf8'));
  if (header.magic !== 'potscope-error/v1') throw new Error(`bad error magic: ${header.magic}`);
  const values = new Float32Array(header.count);
  Buffer.from(values.buffer).set(raw.subarray(nl + 1, nl + 1 + header.count * 4));
  return { header, values };
}

// Surface metric (first fundamental form) of one triangle: the 2x2 SPD matrix M
// with |dXYZ|^2 = d^T M d for uv-edges d. Anisotropy = sqrt(largest/smallest
// eigenvalue) — this is the "wrong metric space" signal (M=g/h^2). Solved as a
// 3x3 linear system in (E,F,G) from the three squared edge lengths.
export function triAnisotropy(px, uv) {
  const sq = (i, j) => {
    const a = i * 3, b = j * 3;
    return (px[a] - px[b]) ** 2 + (px[a + 1] - px[b + 1]) ** 2 + (px[a + 2] - px[b + 2]) ** 2;
  };
  const du1 = uv[2] - uv[0], dv1 = uv[3] - uv[1];
  const du2 = uv[4] - uv[0], dv2 = uv[5] - uv[1];
  const du3 = du2 - du1, dv3 = dv2 - dv1;
  // rows: [du^2, 2*du*dv, dv^2] -> squared edge length
  const A = [
    [du1 * du1, 2 * du1 * dv1, dv1 * dv1],
    [du2 * du2, 2 * du2 * dv2, dv2 * dv2],
    [du3 * du3, 2 * du3 * dv3, dv3 * dv3],
  ];
  const rhs = [sq(0, 1), sq(0, 2), sq(1, 2)];
  const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const det = det3(A);
  if (Math.abs(det) < 1e-18) return NaN; // degenerate uv triangle
  const col = (c) => A.map((row, r) => row.map((val, k) => (k === c ? rhs[r] : val)));
  const E = det3(col(0)) / det;
  const F = det3(col(1)) / det;
  const G = det3(col(2)) / det;
  const trace = E + G;
  const disc = Math.sqrt(Math.max(0, (trace * trace) / 4 - (E * G - F * F)));
  const l1 = trace / 2 + disc;
  const l2 = trace / 2 - disc;
  if (l2 <= 0) return Infinity;
  return Math.sqrt(l1 / l2);
}

// Connected components of hot triangles via shared welded xyz vertex. Mirrors
// the vertex-key weld in ceramicAttributes; union-find over the hot set only.
export function weldClusters(positions, hotIndices) {
  const parent = new Map(hotIndices.map((t) => [t, t]));
  const find = (x) => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n; }
    return r;
  };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const owner = new Map(); // vertex key -> a hot triangle already touching it
  for (const t of hotIndices) {
    for (let s = 0; s < 3; s += 1) {
      const o = t * 9 + s * 3;
      const key = `${positions[o]},${positions[o + 1]},${positions[o + 2]}`;
      const prev = owner.get(key);
      if (prev === undefined) owner.set(key, t);
      else union(prev, t);
    }
  }
  const groups = new Map();
  for (const t of hotIndices) {
    const r = find(t);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(t);
  }
  return [...groups.values()];
}

// Feature-locus heuristic: axis positions where the resolved grid is locally
// dense. Rational feature ladders cluster rows/columns AT features, so a gap
// far below the median gap marks a feature line. Global per-axis (not per-patch)
// — a first proxy; FEATURE-ALIGNED simply never fires on uniform pots.
export function deriveFeatureLoci(locBody, count) {
  const axis = (offset) => {
    const vals = [];
    for (let t = 0; t < count; t += 1) {
      for (let k = 0; k < 3; k += 1) vals.push(locBody[t * 7 + offset + k * 2]);
    }
    const uniq = [...new Set(vals.map((x) => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b);
    if (uniq.length < 4) return [];
    const gaps = [];
    for (let i = 1; i < uniq.length; i += 1) gaps.push(uniq[i] - uniq[i - 1]);
    const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || 1;
    const loci = [];
    for (let i = 1; i < uniq.length; i += 1) {
      if (uniq[i] - uniq[i - 1] < 0.35 * median) loci.push((uniq[i] + uniq[i - 1]) / 2);
    }
    return loci;
  };
  return { u: axis(1), v: axis(2) };
}

const HOTSPOT_THRESHOLDS = {
  spikeMaxTris: 8,
  compactExtent: 0.05,
  elongRatio: 4,
  fullAxis: 0.9,
  anisoThresh: 3,
  // Tuned 0.3 -> 0: pearson returns its 0 sentinel whenever the cluster's error
  // is constant (zero variance) — as in a pure metric-stretch flank where every
  // triangle sits at the same residual. meanAniso (>=3) is the real stretch
  // discriminator; this gate only has to reject ANTI-correlation (corr<0: high
  // anisotropy where error is LOW, i.e. stretch is not the driver). >=0 admits
  // the "no counter-evidence" sentinel; a positive floor can never be met by a
  // uniform-error cluster, which is exactly the anisotropic case we must tag.
  anisoCorr: 0,
  featTol: 0.02,
};

export function classifyCluster(triIndices, ctx) {
  const { positions, locBody, errors, featureLoci } = ctx;
  const T = HOTSPOT_THRESHOLDS;
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  let peak = 0, sumErr = 0, sumAniso = 0, anisoN = 0;
  const anisoVals = [], errVals = [];
  for (const t of triIndices) {
    for (let k = 0; k < 3; k += 1) {
      const u = locBody[t * 7 + 1 + k * 2], v = locBody[t * 7 + 2 + k * 2];
      if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }
    const e = errors[t];
    peak = Math.max(peak, e); sumErr += e;
    const uv = [
      locBody[t * 7 + 1], locBody[t * 7 + 2],
      locBody[t * 7 + 3], locBody[t * 7 + 4],
      locBody[t * 7 + 5], locBody[t * 7 + 6],
    ];
    const a = triAnisotropy(positions.subarray(t * 9, t * 9 + 9), uv);
    if (Number.isFinite(a)) { sumAniso += a; anisoN += 1; anisoVals.push(a); errVals.push(e); }
  }
  const uExtent = uMax - uMin, vExtent = vMax - vMin;
  const meanAniso = anisoN > 0 ? sumAniso / anisoN : 1;
  const corr = pearson(anisoVals, errVals);

  const longAxis = Math.max(uExtent, vExtent), shortAxis = Math.min(uExtent, vExtent);
  let shape = 'DIFFUSE';
  if (triIndices.length <= T.spikeMaxTris && longAxis <= T.compactExtent) shape = 'SPIKE';
  else if (shortAxis <= 1e-6 || longAxis / Math.max(shortAxis, 1e-6) >= T.elongRatio) shape = 'BAND';

  const tags = [];
  if (shape === 'BAND' && longAxis >= T.fullAxis) tags.push('IRREDUCIBLE');
  if (meanAniso >= T.anisoThresh && corr >= T.anisoCorr) tags.push('ANISOTROPIC');
  const uc = (uMin + uMax) / 2, vc = (vMin + vMax) / 2;
  const near = (loci, c) => loci.some((x) => Math.abs(x - c) < T.featTol);
  if (near(featureLoci.u, uc) || near(featureLoci.v, vc)) tags.push('FEATURE-ALIGNED');

  let lever;
  if (shape === 'SPIKE') lever = 'localized singularity → conforming edge / seam pin / atlas patch';
  else if (tags.includes('ANISOTROPIC')) lever = 'anisotropic flank kernel (M=g/h²) — not more triangles';
  else if (tags.includes('IRREDUCIBLE')) lever = `full-${uExtent >= vExtent ? 'u' : 'v'} band ⇒ density-irreducible; envelope/redesign, not more triangles`;
  else if (shape === 'BAND') lever = `density/envelope along ${uExtent >= vExtent ? 'v' : 'u'} (the short axis)`;
  else lever = 'diffuse — measure locally (no single dominant structure)';

  return { shape, tags, lever, u: uc, v: vc, uExtent, vExtent, peak, mean: sumErr / triIndices.length, anisotropy: meanAniso };
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i += 1) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; syy += ys[i] * ys[i]; sxy += xs[i] * ys[i]; }
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
  return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : 0;
}

// Hot-triangle selection for cmdHotspots. The per-triangle error values are
// stored as f32 in the sidecar, so the worst certifies-at rung reads back one
// ULP BELOW an f64 hotThresh (e.g. f32(0.005) = 0.004999999888… < 0.005), which
// would silently drop the worst rung and print "0 hot clusters" on a pot that
// has them. Snap the threshold onto the f32 grid the values live on so a
// triangle sitting exactly at the worst rung is admitted. Math.fround is exact
// here: rungs are spaced by factors of ~2, so half-ULP rounding cannot cross to
// a lower rung. The comparison uses the snapped value; callers keep printing the
// intended f64 hotThresh.
export function selectHotTriangles(values, hotThresh) {
  const hotThreshF32 = Math.fround(hotThresh);
  const hot = [];
  for (let t = 0; t < values.length; t += 1) if (values[t] >= hotThreshF32) hot.push(t);
  return hot;
}

function cmdHotspots(args) {
  const nameOrStl = args._[0];
  if (!nameOrStl) { console.error('usage: potscope hotspots <name|stl> [--top N] [--budget mm] [--json]'); process.exit(2); }
  const stlPath = resolve(nameOrStl.endsWith('.stl') ? nameOrStl : `${nameOrStl}.stl`);
  const errPath = `${stlPath}.error.bin`;
  const locPath = `${stlPath}.loc.bin`;
  for (const [label, p] of [['STL', stlPath], ['error.bin', errPath], ['loc.bin', locPath]]) {
    if (!existsSync(p)) { console.error(`hotspots: missing ${label}: ${p}`); process.exit(2); }
  }
  const parsed = parseStl(stlPath);
  const err = readErrorRaw(errPath);
  const loc = readLoc(locPath);
  if (err.header.count !== parsed.triangleCount || loc.header.count !== parsed.triangleCount) {
    console.error(`count mismatch: stl ${parsed.triangleCount} error ${err.header.count} loc ${loc.header.count}`); process.exit(2);
  }
  const ep = err.header.provenance?.artifactByteSha256, lp = loc.header.provenance?.artifactByteSha256;
  if (ep && lp && ep !== lp) { console.error(`provenance mismatch: error.bin and loc.bin describe different meshes (${ep} vs ${lp}) — re-bake`); process.exit(2); }

  const budget = Number(argValue(args, '--budget') ?? err.header.budgetMm ?? 0.01);
  const p99 = err.header.stats?.p99Mm ?? budget * 0.5;
  const hotThresh = Math.max(budget * 0.5, p99);
  const hot = selectHotTriangles(err.values, hotThresh);
  const featureLoci = deriveFeatureLoci(loc.body, loc.header.count);
  const ctx = { positions: parsed.positions, locBody: loc.body, errors: err.values, budget, featureLoci };
  const clusters = weldClusters(parsed.positions, hot)
    .map((tris) => ({ tris, ...classifyCluster(tris, ctx) }))
    .sort((a, b) => b.peak - a.peak || b.tris.length - a.tris.length);
  const top = Number(argValue(args, '--top') ?? '5');
  const shown = clusters.slice(0, top);

  if (args.flags.includes('--json')) {
    console.log(JSON.stringify({ name: parsed.title, triangleCount: parsed.triangleCount, stats: err.header.stats, hotThresh, clusters: shown.map(({ tris, ...c }) => ({ ...c, triCount: tris.length })) }, null, 2));
    return;
  }
  const um = (mm) => (mm * 1000).toFixed(1);
  const s = err.header.stats ?? {};
  console.log(`${parsed.title} — ${parsed.triangleCount.toLocaleString()} tris, max ${um(s.maxMm ?? 0)}µm  p99 ${um(s.p99Mm ?? 0)}µm  p50 ${um(s.p50Mm ?? 0)}µm`);
  console.log(`worst residual structure (top ${top} of ${clusters.length} hot clusters, threshold ${um(hotThresh)}µm):\n`);
  shown.forEach((c, i) => {
    const patchIdx = loc.body[c.tris[0] * 7];
    const patch = loc.header.patches[patchIdx] ?? `patch${patchIdx}`;
    const tagStr = c.tags.length ? ` · ${c.tags.join(' · ')}` : '';
    console.log(`  [${i + 1}] ${c.shape}${tagStr} · ${patch}`);
    console.log(`      ${c.tris.length} tris · u∈[${(c.u - c.uExtent / 2).toFixed(2)},${(c.u + c.uExtent / 2).toFixed(2)}] v≈${c.v.toFixed(2)} · peak ${um(c.peak)}µm mean ${um(c.mean)}µm · anisotropy ${c.anisotropy.toFixed(1)}`);
    console.log(`      → ${c.lever}\n`);
  });
}

// ---------------------------------------------------------------------- status
// The generated certificate registry + drift guard. One row per baked pot: join
// the reconstruct sidecar (*.recon.json — style/tris/configDigest/verdict) with
// its error.bin header (max/p99) and optional certificate.txt (commit). masked
// raises the "certify on MAX, not p99" flag whenever max/p99 > 3x, so a pot that
// looks clean on p99 but hides a scale-tip cliff on MAX is never trusted blind.
export function buildStatusRows(dir) {
  const rows = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.recon.json')).sort()) {
    const recon = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const errPath = join(dir, `${recon.name}.stl.error.bin`);
    let maxMm = null, p99Mm = null, masked = false;
    if (existsSync(errPath)) {
      const raw = readFileSync(errPath);
      const hdr = JSON.parse(raw.subarray(0, raw.indexOf(0x0a)).toString('utf8'));
      maxMm = hdr.stats?.maxMm ?? null; p99Mm = hdr.stats?.p99Mm ?? null;
      // masked = the "certify on MAX, not p99" flag. No data (either stat null)
      // ⇒ not masked. With p99>0 it is the >3x ratio; with p99===0 a nonzero max
      // is the MAXIMALLY masked case (a hidden cliff over an all-clean p99), so
      // treating p99===0 as falsy — the old bug — silently cleared exactly it.
      if (maxMm != null && p99Mm != null) masked = p99Mm > 0 ? maxMm / p99Mm > 3 : maxMm > 0;
    }
    const certPath = join(dir, `${recon.name}.certificate.txt`);
    let commit = null;
    if (existsSync(certPath)) {
      const m = readFileSync(certPath, 'utf8').match(/\b([0-9a-f]{7,40})\b/);
      commit = m ? m[1] : null;
    }
    rows.push({ name: recon.name, style: recon.style, tris: recon.tris, configDigest: (recon.configDigest ?? '').slice(0, 8), maxMm, p99Mm, masked, commit, verdict: recon.verdict });
  }
  return rows;
}

// The --check drift gate, factored out so it is testable without intercepting
// process.exit: exit 1 iff --check is set AND some row drifted. Independent of
// output mode — the JSON path must gate identically to the table path (a CI job
// reads `status --check --json`, parses stdout, and relies on the exit code).
export function statusExitCode(rows, check) {
  return check && rows.some((r) => r.verdict === 'DRIFT') ? 1 : 0;
}

function cmdStatus(args) {
  const dir = resolve(argValue(args, '--dir') ?? join(HERE, '..', '..', 'exchange', '_certified_stl'));
  if (!existsSync(dir)) { console.error(`status: no such dir ${dir} (bake sidecars first: PF_CERT_RECON=all)`); process.exit(2); }
  const substr = args._[0];
  let rows = buildStatusRows(dir);
  if (substr) rows = rows.filter((r) => r.name.toLowerCase().includes(substr.toLowerCase()));
  // Emit output first (JSON stays pure on stdout; table gets its summary line),
  // THEN apply the drift gate in BOTH modes so a machine consumer of
  // `status --check --json` gets the same exit-1-on-drift contract as the table.
  if (args.flags.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const um = (mm) => (mm == null ? '   —' : (mm * 1000).toFixed(1));
    console.log('style/variant                                  tris     maxµm  p99µm  commit    verdict');
    for (const r of rows) {
      const flag = r.masked ? ' ⚠MASK' : '';
      console.log(`${r.name.padEnd(46)} ${String(r.tris).padStart(8)}  ${um(r.maxMm).padStart(5)}  ${um(r.p99Mm).padStart(5)}  ${(r.commit ?? '—').padEnd(8)}  ${r.verdict}${flag}`);
    }
    const drift = rows.filter((r) => r.verdict === 'DRIFT');
    console.log(`\n${rows.length} pots · ${rows.filter((r) => r.verdict === 'GREEN').length} GREEN · ${drift.length} DRIFT · ${rows.filter((r) => r.masked).length} max-masked`);
  }
  if (statusExitCode(rows, args.flags.includes('--check'))) {
    const drift = rows.filter((r) => r.verdict === 'DRIFT');
    console.error(`FAIL: ${drift.length} drifted certificate(s): ${drift.map((r) => r.name).join(', ')}`);
    process.exit(1);
  }
}

function cmdView(args) {
  const stlPaths = args._.map((p) => resolve(p));
  if (stlPaths.length === 0) { console.error('view: no STL given'); process.exit(2); }
  for (const p of stlPaths) if (!existsSync(p)) { console.error(`no such STL: ${p}`); process.exit(2); }
  const clay = args.flags.includes('--clay');
  const ceramic = !clay && (args.flags.includes('--ceramic') || stlPaths.length > 1);
  const decimate = Math.max(1, Number(argValue(args, '--decimate') ?? '1'));
  const embed = args.flags.includes('--embed');
  const errorMode = args.flags.includes('--error');
  if (argValue(args, '--pot-tris') !== undefined) {
    console.warn('note: --pot-tris is ignored — the shelf renders full resolution now (no cluster-decimation)');
  }
  if (errorMode && stlPaths.length > 1) {
    console.error('--error is per-pot only: evaluation views are individual, full resolution');
    process.exit(2);
  }

  // ---------------------------------------------------------------- single pot
  if (stlPaths.length === 1) {
    const stlPath = stlPaths[0];
    if (ceramic && decimate > 1) console.warn('note: stride decimation punches holes; ceramic looks best at --decimate 1');
    const outPath = resolve(argValue(args, '--out') ?? stlPath.replace(/\.stl$/i, '.view.html'));
    const parsed = parseStl(stlPath, decimate);
    const mode = errorMode ? 'error' : ceramic ? 'ceramic' : 'clay';
    // Ceramic welds crease-preserving normals in Node. clay/error let the
    // browser recompute flat normals from windings — trivial, and it keeps the
    // pack half the size (positions only) so a 1.27M-tri pot fetches ~46 MB
    // instead of embedding a 116 MB base64 HTML.
    const attrs = mode === 'ceramic' ? ceramicAttributes(parsed.positions) : { normals: null, cavity: null };
    const sidecar = errorMode ? loadErrorSidecar(args, stlPath, parsed, decimate) : { error: null, errorMeta: null };
    const certPath = stlPath.replace(/\.stl$/i, '.certificate.txt');
    const meta = {
      title: parsed.title,
      subtitle: '',
      triangleCount: parsed.triangleCount,
      kept: parsed.kept,
      decimate,
      bbox: bboxOf(parsed.positions),
      certificate: existsSync(certPath) ? readFileSync(certPath, 'utf8') : '',
      errorMeta: sidecar.errorMeta,
    };
    const pack = buildPack({ mode, positions: parsed.positions, normals: attrs.normals, cavity: attrs.cavity, error: sidecar.error, meta });
    writeViewer(outPath, mode, meta, pack, embed);
    return;
  }

  // ------------------------------------------------------ shelf: FULL RESOLUTION
  // Every certified triangle of every pot — no decimation (the mandate). Ceramic
  // by default so the certified feature curves outline themselves in celadon;
  // --clay is the fast path (browser flat normals, no Node welding).
  const outPath = resolve(argValue(args, '--out') ?? 'certified_shelf.view.html');
  const mode = clay ? 'clay' : 'ceramic';
  const models = [];
  for (const stlPath of stlPaths) {
    const parsed = parseStl(stlPath, decimate);
    const attrs = mode === 'ceramic' ? ceramicAttributes(parsed.positions) : { normals: null, cavity: null };
    models.push({
      name: parsed.title.replace(/\.stl$/i, ''),
      positions: parsed.positions,
      normals: attrs.normals,
      cavity: attrs.cavity,
      bbox: bboxOf(parsed.positions),
    });
    console.log(`  ${parsed.title}: ${parsed.triangleCount.toLocaleString()} tris (full resolution)`);
  }
  const shelf = layoutShelf(models);
  const meta = {
    title: argValue(args, '--title') ?? `certified collection — ${shelf.potCount} pots`,
    subtitle: `${models.map((m) => m.name).join(' · ')} — ${shelf.keptTris.toLocaleString()} triangles, full resolution`,
    triangleCount: shelf.keptTris,
    kept: shelf.keptTris,
    decimate: 1,
    bbox: shelf.bbox,
    certificate: '',
    errorMeta: null,
  };
  const pack = buildPack({ mode, positions: shelf.positions, normals: shelf.normals, cavity: shelf.cavity, error: null, meta });
  writeViewer(outPath, mode, meta, pack, embed);
}

function loadErrorSidecar(args, stlPath, parsed, decimate) {
  const sidecarPath = resolve(argValue(args, '--error-file') ?? `${stlPath}.error.bin`);
  if (!existsSync(sidecarPath)) {
    console.error(`no error sidecar: ${sidecarPath}`);
    console.error('bake one with the roster error-bake harness (PF_CERT_ERRORBAKE — see README)');
    process.exit(2);
  }
  const raw = readFileSync(sidecarPath);
  const newline = raw.indexOf(0x0a);
  const errorMeta = JSON.parse(raw.subarray(0, newline).toString('utf8'));
  if (errorMeta.magic !== 'potscope-error/v1') {
    console.error(`unrecognised sidecar magic: ${errorMeta.magic}`);
    process.exit(2);
  }
  if (errorMeta.count !== parsed.triangleCount) {
    console.error(`sidecar/STL mismatch: sidecar has ${errorMeta.count} triangles, STL has ${parsed.triangleCount} — refusing (provenance)`);
    process.exit(2);
  }
  const values = new Float32Array(errorMeta.count);
  Buffer.from(values.buffer).set(raw.subarray(newline + 1, newline + 1 + errorMeta.count * 4));
  const corners = new Float32Array(parsed.kept * 3);
  for (let t = 0; t < parsed.kept; t += 1) {
    const value = values[t * decimate];
    corners[t * 3] = value;
    corners[t * 3 + 1] = value;
    corners[t * 3 + 2] = value;
  }
  return { error: corners, errorMeta };
}

// Default: write <out>.pack next to the HTML and fetch it by basename (serve the
// dir). --embed inlines the pack as base64 for a portable single file (fine for
// small pots; heavy for dense ones). Either way the geometry is identical bytes.
function writeViewer(outPath, mode, meta, pack, embed) {
  let packUrl = null;
  let packB64 = null;
  if (embed) {
    packB64 = pack.toString('base64');
  } else {
    const packPath = `${outPath.replace(/\.html$/i, '')}.pack`;
    writeFileSync(packPath, pack);
    packUrl = packPath.split(/[\\/]/).pop();
  }
  const html = packViewerHtml({ ...meta, mode, packUrl, packB64 });
  writeFileSync(outPath, html);
  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  const viewName = outPath.split(/[\\/]/).pop();
  console.log(
    `wrote ${outPath} — ${meta.kept.toLocaleString()} tris ${mode}, ` +
      (embed ? `${mb(html.length)} MB self-contained` : `${mb(html.length)} MB html + ${packUrl} (${mb(pack.length)} MB)`)
  );
  if (!embed) {
    console.log(`  serve + open:  node potscope.mjs serve "${dirname(outPath)}"  ->  http://localhost:8099/${viewName}`);
  }
}

function packViewerHtml(model) {
  const certificateBlock = model.certificate
    ? `<details id="cert"><summary>certificate</summary><pre>${model.certificate
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</pre></details>`
    : '';
  const subtitleBlock = model.subtitle ? `<div id="sub">${model.subtitle}</div>` : '';
  const ceramic = model.mode === 'ceramic';
  const errorView = model.mode === 'error';
  const um = (mm) => (mm * 1000).toFixed(mm * 1000 >= 100 ? 0 : mm * 1000 >= 10 ? 1 : 2);
  const legendBlock = errorView
    ? `<div id="legend">
  <label><input type="checkbox" id="ovl" checked> error overlay <span class="dim">(press e)</span></label>
  <div id="bar"></div>
  <div id="ticks"><span>0</span><span>${um(model.errorMeta.budgetMm)}µm budget</span><span>${um(model.errorMeta.stats.maxMm)}µm max</span></div>
  <div id="stats">${model.errorMeta.semantics === 'certifies-at-level' ? 'per-triangle certifies-at level (guaranteed bound vs analytic target)' : 'true-3D error vs certified analytic target'} — p50 ${um(model.errorMeta.stats.p50Mm)}µm · p99 ${um(model.errorMeta.stats.p99Mm)}µm · max ${um(model.errorMeta.stats.maxMm)}µm<br>${model.errorMeta.variant} bake · ${model.errorMeta.enclosures.toLocaleString()} enclosures · ${model.errorMeta.unconverged} unconverged${model.errorMeta.decimalFallbacks ? ` · ${model.errorMeta.decimalFallbacks} decimal fallbacks` : ''}</div>
</div>`
    : '';
  const vsrc = errorView
    ? `attribute vec3 p; attribute vec3 n; attribute float err; uniform mat4 mvp; uniform mat4 mv; varying vec3 vn; varying vec3 vp; varying float verr;
void main(){ gl_Position = mvp * vec4(p,1.0); vn = mat3(mv) * n; vp = (mv * vec4(p,1.0)).xyz; verr = err; }`
    : ceramic
    ? `attribute vec3 p; attribute vec3 n; attribute float cav; uniform mat4 mvp; uniform mat4 mv; varying vec3 vn; varying vec3 vp; varying float vcav;
void main(){ gl_Position = mvp * vec4(p,1.0); vn = mat3(mv) * n; vp = (mv * vec4(p,1.0)).xyz; vcav = cav; }`
    : `attribute vec3 p; attribute vec3 n; uniform mat4 mvp; uniform mat4 mv; varying vec3 vn; varying vec3 vp;
void main(){ gl_Position = mvp * vec4(p,1.0); vn = mat3(mv) * n; vp = (mv * vec4(p,1.0)).xyz; }`;
  const fsrc = errorView
    ? `precision highp float; varying vec3 vn; varying vec3 vp; varying float verr;
uniform float uOverlay; uniform float uBudget; uniform float uMax;
void main(){
  vec3 N = normalize(vn); if (!gl_FrontFacing) N = -N;
  vec3 L1 = normalize(vec3(0.5, 0.7, 0.9)); vec3 L2 = normalize(vec3(-0.6, -0.2, 0.4));
  float d = max(dot(N,L1),0.0)*0.85 + max(dot(N,L2),0.0)*0.35 + 0.12;
  vec3 clay = vec3(0.82, 0.74, 0.62) * d + pow(max(dot(reflect(-L1, N), normalize(-vp)), 0.0), 24.0) * 0.25;
  float e = verr;
  vec3 overlay;
  // 0.5% comparison slack: an at-budget value must never render hot through
  // varying-interpolation rounding.
  if (e <= uBudget * 1.005) {
    float q = e / max(uBudget, 1e-9);
    overlay = mix(vec3(0.87, 0.88, 0.86), vec3(0.69, 0.74, 0.68), q);
  } else {
    float s = clamp(log2(e / uBudget) / max(log2(max(uMax, uBudget * 1.0001) / uBudget), 1e-6), 0.0, 1.0);
    vec3 c1 = vec3(0.99, 0.87, 0.22); vec3 c2 = vec3(0.96, 0.55, 0.12);
    vec3 c3 = vec3(0.86, 0.16, 0.10); vec3 c4 = vec3(0.72, 0.09, 0.56);
    overlay = s < 0.3333 ? mix(c1, c2, s * 3.0) : s < 0.6667 ? mix(c2, c3, (s - 0.3333) * 3.0) : mix(c3, c4, (s - 0.6667) * 3.0);
  }
  vec3 lit = overlay * (0.72 + 0.28 * d);
  gl_FragColor = vec4(mix(clay, lit, uOverlay), 1.0);
}`
    : ceramic
    ? `precision mediump float; varying vec3 vn; varying vec3 vp; varying float vcav;
void main(){
  vec3 N = normalize(vn); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(-vp);
  vec3 L1 = normalize(vec3(0.5, 0.75, 0.85));
  vec3 L2 = normalize(vec3(-0.7, -0.15, 0.35));
  vec3 L3 = normalize(vec3(-0.15, 0.9, -0.7));
  float pool = clamp(vcav, 0.0, 1.0);   // glaze pools in recesses
  float crest = clamp(-vcav, 0.0, 1.0); // glaze thins over crests
  vec3 glazeThick = vec3(0.286, 0.478, 0.412); // pooled sea-green
  vec3 glazeBody  = vec3(0.678, 0.788, 0.729); // pale celadon
  vec3 clayEdge   = vec3(0.816, 0.749, 0.639); // body showing through
  vec3 albedo = mix(glazeBody, glazeThick, pow(pool, 0.75) * 0.9);
  albedo = mix(albedo, clayEdge, pow(crest, 1.6) * 0.55);
  float diff = max(dot(N,L1),0.0)*0.9 + max(dot(N,L2),0.0)*0.3 + max(dot(N,L3),0.0)*0.22 + 0.16;
  float fres = pow(1.0 - max(dot(N,V),0.0), 3.0);
  vec3 col = albedo * diff + fres * vec3(0.10, 0.13, 0.13);
  vec3 H1 = normalize(L1 + V);
  float spec = pow(max(dot(N,H1),0.0), 140.0) * 0.9 + pow(max(dot(N,H1),0.0), 18.0) * 0.12;
  col += spec * vec3(1.0, 0.99, 0.95) * (0.55 + 0.45 * (1.0 - pool * 0.5));
  col = pow(col, vec3(1.0/1.9));
  gl_FragColor = vec4(col, 1.0);
}`
    : `precision mediump float; varying vec3 vn; varying vec3 vp;
void main(){
  vec3 N = normalize(vn); if (!gl_FrontFacing) N = -N;
  vec3 L1 = normalize(vec3(0.5, 0.7, 0.9)); vec3 L2 = normalize(vec3(-0.6, -0.2, 0.4));
  float d = max(dot(N,L1),0.0)*0.85 + max(dot(N,L2),0.0)*0.35 + 0.12;
  vec3 base = vec3(0.82, 0.74, 0.62); // fired clay
  vec3 col = base * d;
  float spec = pow(max(dot(reflect(-L1, N), normalize(-vp)), 0.0), 24.0) * 0.25;
  gl_FragColor = vec4(col + spec, 1.0);
}`;
  return `<!doctype html>
<meta charset="utf-8">
<title>potscope — ${model.title}</title>
<style>
  html,body{margin:0;height:100%;background:#0e1116;color:#c9d1d9;font:13px/1.5 ui-monospace,Consolas,monospace;overflow:hidden}
  #hud{position:fixed;top:10px;left:12px;z-index:2;background:rgba(14,17,22,.85);padding:10px 14px;border:1px solid #30363d;border-radius:8px;max-width:52ch}
  #hud b{color:#e6edf3}
  #sub{margin-top:4px;font-size:11px;color:#8b949e;max-height:14vh;overflow:auto}
  #cert{margin-top:6px}
  #cert pre{max-height:40vh;overflow:auto;font-size:11px;color:#8b949e}
  #legend{margin-top:8px;border-top:1px solid #30363d;padding-top:8px}
  #legend .dim{color:#8b949e}
  #status-load{margin-top:6px;color:#d9a441}
  #bar{height:10px;border-radius:3px;margin:6px 0 2px;background:linear-gradient(to right,#dedfdc 0%,#b0bcae 25%,#fcdd38 25%,#f58c1f 50%,#db2919 75%,#b8178f 100%)}
  #ticks{display:flex;justify-content:space-between;font-size:10px;color:#8b949e}
  #ticks span:nth-child(2){position:relative;left:-12%}
  #stats{margin-top:5px;font-size:10px;color:#8b949e;line-height:1.45}
  canvas{display:block;width:100vw;height:100vh;cursor:grab}
</style>
<div id="hud">
  <b>${model.title}</b><br>
  ${model.triangleCount.toLocaleString()} triangles${model.decimate > 1 ? ` (showing ${model.kept.toLocaleString()}, 1/${model.decimate})` : ''}<br>
  drag = orbit &nbsp; wheel = zoom &nbsp; shift-drag = pan
  <div id="status-load">loading geometry…</div>
  ${subtitleBlock}
  ${legendBlock}
  ${certificateBlock}
</div>
<canvas id="c"></canvas>
<script>
const MODE = ${JSON.stringify(model.mode)};
const PACK_URL = ${model.packUrl ? JSON.stringify(model.packUrl) : 'null'};
const PACK_B64 = ${model.packB64 ? JSON.stringify(model.packB64) : 'null'};
const bbox = ${JSON.stringify(model.bbox)};
const errorMeta = ${model.errorMeta ? JSON.stringify({ budgetMm: model.errorMeta.budgetMm, maxMm: model.errorMeta.stats.maxMm }) : 'null'};
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl', { antialias: true });
const vsrc = ${JSON.stringify(vsrc)};
const fsrc = ${JSON.stringify(fsrc)};
const statusEl = document.getElementById('status-load');
// Flat face normals from windings — mirrors potscope.mjs flatNormals(); the
// certified STL/pack carries positions only for clay/error to halve the fetch.
function flatNormals(p){ const n=new Float32Array(p.length); for(let t=0;t<p.length;t+=9){ const ax=p[t+3]-p[t],ay=p[t+4]-p[t+1],az=p[t+5]-p[t+2],bx=p[t+6]-p[t],by=p[t+7]-p[t+1],bz=p[t+8]-p[t+2]; let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx; const l=Math.hypot(nx,ny,nz)||1; nx/=l;ny/=l;nz/=l; for(let c=0;c<3;c++){n[t+c*3]=nx;n[t+c*3+1]=ny;n[t+c*3+2]=nz;} } return n; }
function parsePack(bytes){
  const nl = bytes.indexOf(10);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(0, nl)));
  let off = bytes.byteOffset + nl + 1;
  const take = (floats) => { const a = new Float32Array(bytes.buffer.slice(off, off + floats*4)); off += floats*4; return a; };
  const tc = header.triangleCount;
  const positions = take(tc*9);
  const normals = header.hasNormals ? take(tc*9) : flatNormals(positions);
  const cavity = header.hasCavity ? take(tc*3) : null;
  const errs = header.hasError ? take(tc*3) : null;
  return { positions, normals, cavity, errs };
}
async function loadBytes(){
  if (PACK_URL){ const r = await fetch(PACK_URL); if(!r.ok) throw new Error('pack '+r.status+' — serve the directory over http'); return new Uint8Array(await r.arrayBuffer()); }
  const bin = atob(PACK_B64); const a = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return a;
}
function shader(type, src){ const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; }
const m4 = { mul(a,b){ const o = new Float32Array(16); for(let r=0;r<4;r++)for(let c=0;c<4;c++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;} return o; },
  persp(fov,asp,n,f){ const t = 1/Math.tan(fov/2); return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)/(n-f),-1, 0,0,2*f*n/(n-f),0]); },
  rx(a){ const c=Math.cos(a),s=Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); },
  ry(a){ const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); },
  t(x,y,z){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]); } };
const center = [0,1,2].map(i => (bbox.min[i]+bbox.max[i])/2);
const radius = (Math.max(...[0,1,2].map(i => bbox.max[i]-bbox.min[i])) * 0.75) || 1;
let rotX = -1.2, rotY = 0.6, dist = radius * 3.4, panX = 0, panY = 0;
let prog = null, vcount = 0, overlayOn = true;
function draw(){
  if (!prog) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.055, 0.067, 0.086, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  let mv = m4.t(-center[0], -center[1], -center[2]);
  mv = m4.mul(m4.ry(rotY), mv); mv = m4.mul(m4.rx(rotX), mv);
  mv = m4.mul(m4.t(panX, panY, -dist), mv);
  const mvp = m4.mul(m4.persp(0.9, canvas.width / canvas.height, radius * 0.02, radius * 40), mv);
  gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'mvp'), false, mvp);
  gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'mv'), false, mv);
  if (errorMeta) gl.uniform1f(gl.getUniformLocation(prog, 'uOverlay'), overlayOn ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, vcount);
}
loadBytes().then((bytes) => {
  const { positions, normals, cavity, errs } = parsePack(bytes);
  vcount = positions.length / 3;
  prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, vsrc));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fsrc));
  gl.linkProgram(prog); gl.useProgram(prog);
  const attribs = [['p', positions, 3], ['n', normals, 3]];
  if (cavity) attribs.push(['cav', cavity, 1]);
  if (errs) attribs.push(['err', errs, 1]);
  for (const [name, data, size] of attribs) {
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, name); if (loc < 0) continue; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  if (errorMeta) {
    gl.uniform1f(gl.getUniformLocation(prog, 'uBudget'), errorMeta.budgetMm);
    gl.uniform1f(gl.getUniformLocation(prog, 'uMax'), errorMeta.maxMm);
  }
  gl.enable(gl.DEPTH_TEST);
  if (statusEl) statusEl.remove();
  draw();
}).catch((e) => { if (statusEl) { statusEl.textContent = 'load error: ' + e.message; statusEl.style.color = '#f66'; } });
const ovlBox = document.getElementById('ovl');
if (ovlBox) {
  const setOverlay = (on) => { overlayOn = on; ovlBox.checked = on; requestAnimationFrame(draw); };
  ovlBox.addEventListener('change', () => setOverlay(ovlBox.checked));
  addEventListener('keydown', (e) => { if (e.key === 'e') setOverlay(!overlayOn); });
}
let dragging = false, lastX = 0, lastY = 0, panning = false;
canvas.addEventListener('mousedown', (e) => { dragging = true; panning = e.shiftKey; lastX = e.clientX; lastY = e.clientY; });
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
  if (panning) { panX += dx * dist * 0.001; panY -= dy * dist * 0.001; }
  else { rotY += dx * 0.008; rotX += dy * 0.008; }
  requestAnimationFrame(draw);
});
addEventListener('wheel', (e) => { dist *= Math.exp(e.deltaY * 0.001); requestAnimationFrame(draw); }, { passive: true });
addEventListener('resize', () => requestAnimationFrame(draw));
</script>`;
}

// ----------------------------------------------------------------------- cli
function argValue(args, name) {
  const index = args.flags.indexOf(name);
  return index >= 0 ? args.flags[index + 1] : undefined;
}

const BOOLEAN_FLAGS = new Set(['--ceramic', '--error', '--embed', '--clay', '--json', '--check']);

// ----------------------------------------------------------------------- serve
// One command to serve a directory over http (fetch-viewers need it) with a
// clickable index of every *.view.html. Removes the "spin up a static server
// first" friction that made opening the big certified pots a chore.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.pack': 'application/octet-stream',
  '.stl': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
};

function serveIndex(dir) {
  const views = readdirSync(dir).filter((f) => f.endsWith('.view.html')).sort();
  const links = views.length
    ? views.map((v) => `<li><a href="/${encodeURIComponent(v)}">${v}</a></li>`).join('')
    : '<li>(no *.view.html here yet — run <code>potscope view ...</code>)</li>';
  return `<!doctype html><meta charset="utf-8"><title>potscope — ${dir}</title><style>body{background:#0e1116;color:#c9d1d9;font:14px/1.7 ui-monospace,Consolas,monospace;padding:24px}a{color:#79c0ff}h1{font-size:15px;color:#e6edf3}</style><h1>potscope — ${dir}</h1><ul>${links}</ul>`;
}

function cmdServe(args) {
  const dir = resolve(args._[0] ?? '.');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`potscope serve: not a directory: ${dir}`);
    console.error('  pass the folder holding the *.view.html / *.pack files, e.g.');
    console.error('  node <path>/potscope.mjs serve <path>/research/exchange/_certified_stl');
    process.exit(2);
  }
  const startPort = Number(argValue(args, '--port') ?? '8099');
  const handler = (req, res) => {
    try {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel === '/' || rel === '') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(serveIndex(dir));
        return;
      }
      const file = join(dir, rel);
      if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(readFileSync(file));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(err));
    }
  };
  // A stale server (or another potscope) can hold the default port; step past it
  // instead of dying with an EADDRINUSE stack trace.
  const tryListen = (port, attemptsLeft) => {
    const server = createServer(handler);
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
        console.log(`potscope: port ${port} busy — trying ${port + 1}`);
        tryListen(port + 1, attemptsLeft - 1);
      } else {
        console.error(`potscope serve: ${err.message}`);
        process.exit(1);
      }
    });
    server.listen(port, () => {
      console.log(`potscope serving ${dir}`);
      console.log(`  http://localhost:${port}/   (index of *.view.html)`);
    });
  };
  tryListen(startPort, 20);
}

function parseArgs(argv) {
  const positional = [];
  const flags = [];
  let afterDashDash = false;
  let awaitingValue = false;
  for (const token of argv) {
    if (token === '--') { afterDashDash = true; awaitingValue = false; continue; }
    if (afterDashDash) { positional.push(token); continue; }
    if (token.startsWith('--')) { flags.push(token); awaitingValue = !BOOLEAN_FLAGS.has(token); }
    else if (awaitingValue) { flags.push(token); awaitingValue = false; }
    else positional.push(token);
  }
  return { _: positional, flags };
}

function main() {
  const [, , command, ...rest] = process.argv;
  const args = parseArgs(rest);
  switch (command) {
    case 'ledger': cmdLedger(args); break;
    case 'run': cmdRun(args); break;
    case 'decode': cmdDecode(args); break;
    case 'view': cmdView(args); break;
    case 'hotspots': cmdHotspots(args); break;
    case 'status': cmdStatus(args); break;
    case 'serve': cmdServe(args); break;
    default:
      console.log('potscope — certification-lab instrument panel');
      console.log('  ledger list [--grep re] [--last n] | ledger add <json>');
      console.log('  run -- <command ...>');
      console.log("  decode '<refusal line>' [--patch inner|outer] [--counts json]");
      console.log('  view <file.stl> [--out html] [--decimate k] [--ceramic] [--embed]   (full-res pot)');
      console.log('  view <file.stl> --error [--error-file f.error.bin]   (true-3D error overlay)');
      console.log('  view <a.stl> <b.stl> ... [--out html] [--title t] [--clay]   (full-res shelf)');
      console.log('  hotspots <name|stl> [--top N] [--budget mm] [--json]   (residual structure)');
      console.log('  status [<substr>] [--check] [--json]   (certificate registry + drift guard)');
      console.log('  serve [dir] [--port n]   (http server + index for the fetch-viewers)');
  }
}

// Run the CLI only when invoked directly — importing this module (unit tests,
// the error-bake harness) must not dispatch.
const invokedDirectly =
  process.argv[1] !== undefined &&
  (() => {
    try {
      return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
      return false;
    }
  })();
if (invokedDirectly) main();
