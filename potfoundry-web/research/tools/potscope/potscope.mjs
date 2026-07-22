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
 *   node potscope.mjs converge <name|path> [--json]   # per-patch refine-vs-redesign verdict
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
import { dirname, extname, join, resolve, sep } from 'node:path';
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
      let r;
      try {
        r = resolveTriFromLoc(locPath, Number(triMatch[1]));
      } catch (err) {
        // An out-of-range global tri index (or a corrupt loc.bin) throws inside
        // resolveTriFromLoc — print a clean one-line error, not a Node stack trace.
        console.error('decode: ' + err.message);
        return;
      }
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
// Pure, testable core of cmdRun's on-completion historical comparison. Given a
// SNAPSHOT of ledger entries (ledgerEntries()) and a command string, summarize the
// prior `run-complete` entries for the SAME cmd: count (how many matched), avgMs
// (mean of their elapsedMs), lastMs (the most-recent matching in ARRAY order).
// cmdRun snapshots the ledger BEFORE it appends this run's own run-complete entry,
// so the just-finished run is excluded by construction. An entry without a finite
// numeric elapsedMs cannot contribute and is skipped (it also cannot poison the
// mean). No match / empty → { count: 0, avgMs: null, lastMs: null }.
export function runHistory(entries, cmd) {
  const matching = entries.filter(
    (e) => e && e.kind === 'run-complete' && e.cmd === cmd && Number.isFinite(e.elapsedMs)
  );
  if (matching.length === 0) return { count: 0, avgMs: null, lastMs: null };
  const sum = matching.reduce((acc, e) => acc + e.elapsedMs, 0);
  return {
    count: matching.length,
    avgMs: sum / matching.length,
    lastMs: matching[matching.length - 1].elapsedMs,
  };
}

function cmdRun(args) {
  const command = args._;
  if (command.length === 0) {
    console.error('usage: potscope run -- <command ...>');
    process.exit(2);
  }
  const startedAt = Date.now();
  // Snapshot the ledger NOW — before this run appends its own run-complete entry —
  // so the on-exit historical comparison (runHistory) counts only PRIOR runs.
  const historySnapshot = ledgerEntries();
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
  // Progress visibility for the 10-90 min bakes this wraps. A heartbeat every
  // PF_RUN_HEARTBEAT_MS (default 60s) reports elapsed + time since the child last
  // emitted; once that silence passes PF_RUN_STALL_MS (default 120s) the line turns
  // into a stall warning. The lesson it encodes: Windows EcoQoS throttles detached
  // node ~4-5x, so a silent stretch is diagnosed by CPU delta (Task Manager), NOT
  // wall time. The interval is cleared on child exit.
  let lastActivityAt = Date.now();
  const heartbeatMs = Number(process.env.PF_RUN_HEARTBEAT_MS) || 60000;
  const stallMs = Number(process.env.PF_RUN_STALL_MS) || 120000;
  const dim = (s) => `\x1b[2m${s}\x1b[0m`;
  const heartbeat = setInterval(() => {
    const now = Date.now();
    const elapsedS = Math.round((now - startedAt) / 1000);
    const agoS = Math.round((now - lastActivityAt) / 1000);
    if (now - lastActivityAt > stallMs) {
      console.log(dim(`[potscope] ⚠ no output for ${agoS}s — possible EcoQoS throttle or hang; diagnose by CPU delta (Task Manager), not wall time`));
    } else {
      console.log(dim(`[potscope] ${elapsedS}s elapsed · last activity ${agoS}s ago`));
    }
  }, heartbeatMs);
  heartbeat.unref?.(); // child pipes keep the loop alive; the heartbeat must never hold it open alone
  const onData = (chunk) => {
    lastActivityAt = Date.now();
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
    clearInterval(heartbeat);
    const elapsedMs = Date.now() - startedAt;
    ledgerAppend({
      ts: new Date().toISOString(),
      kind: 'run-complete',
      cmd: command.join(' '),
      exitCode: code,
      elapsedMs,
    });
    console.log(`[potscope] exit ${code} after ${(elapsedMs / 1000).toFixed(1)}s (probe lines ledgered)`);
    // Historical comparison against PRIOR runs of this exact cmd (from the
    // start-of-run snapshot, so this run itself is excluded). Answers "is this bake
    // slower than usual?" — the >1.5x-avg flag points straight at a throttle.
    const hist = runHistory(historySnapshot, command.join(' '));
    if (hist.count > 0) {
      let line = `[potscope] prior runs of this cmd: ${hist.count} · avg ${(hist.avgMs / 1000).toFixed(1)}s · last ${(hist.lastMs / 1000).toFixed(1)}s`;
      if (elapsedMs > 1.5 * hist.avgMs) line += ' — ⚠ slower than usual (throttle?)';
      console.log(line);
    }
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

// The WALL patches. triAnisotropy measures uv->xyz parameterization stretch: on the
// (angular, height) wall param that stretch is the feature-driven "wrong metric space"
// (M=g/h²) signal, but the polar/annular cap/rim/drain param (bottom-top, bottom-under,
// top-rim, drain-wall) is legitimately, hugely anisotropic near the pole/axis regardless
// of any feature. So the ANISOTROPIC verdict is gated to walls only. Exact match — note
// 'drain-wall' merely CONTAINS 'wall' and must NOT open the gate.
export function isWallPatch(name) {
  return name === 'outer-wall' || name === 'inner-wall';
}

// A weld cluster can straddle a patch SEAM (welded across shared xyz where two
// patches meet). Its patch LABEL is the DOMINANT patch: the id held by the plurality
// of the cluster's triangles (mode of locBody[t*7]). A cluster welded across a seam
// (e.g. a band spanning u∈[0,1]) is then reported by the patch that actually owns
// most of it — not whichever triangle happened to sort first. Ties break to the
// lower index (deterministic, insertion-order-independent).
export function dominantPatchIdx(locBody, triIndices) {
  const counts = new Map();
  for (const t of triIndices) {
    const idx = locBody[t * 7];
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
  }
  let best = -1, bestCount = -1;
  for (const [idx, count] of counts) {
    if (count > bestCount || (count === bestCount && idx < best)) { best = idx; bestCount = count; }
  }
  return best;
}

export function classifyCluster(triIndices, ctx) {
  const { positions, locBody, errors, featureLoci, patches } = ctx;
  const T = HOTSPOT_THRESHOLDS;
  // A weld cluster can span a patch SEAM, so its label is the DOMINANT patch — the id
  // held by the plurality of its triangles (dominantPatchIdx) — NOT the patch of
  // whichever triangle sorted first. patches is the loc header's name-list; guard the
  // lookup so a caller without it simply never opens the ANISOTROPIC gate
  // (conservative) rather than throwing, and keep the `patchN` fallback for an index
  // absent from the table.
  const patchIdx = dominantPatchIdx(locBody, triIndices);
  const patch = patches ? (patches[patchIdx] ?? `patch${patchIdx}`) : undefined;
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
  // FULL-SPAN is a STRUCTURAL fact: the hot band spans (nearly) the whole u or v
  // axis. It is NOT an irreducibility CLAIM — density may still close it. The word
  // 'IRREDUCIBLE' is reserved for the convergence probe's MEASURED verdict
  // (convergeVerdict); the classifier only reports the structure it can see.
  if (shape === 'BAND' && longAxis >= T.fullAxis) tags.push('FULL-SPAN');
  // ANISOTROPIC (and its M=g/h² lever below) is WALL-ONLY: on outer/inner-wall the high
  // uv->xyz stretch is the feature-driven wrong-metric-space signal; on the polar/annular
  // cap/rim/drain patches it is a legitimate coordinate artifact near the pole/axis. The
  // numeric anisotropy (meanAniso) is still returned below for every cluster — only the
  // verdict is gated.
  if (isWallPatch(patch) && meanAniso >= T.anisoThresh && corr >= T.anisoCorr) tags.push('ANISOTROPIC');
  const uc = (uMin + uMax) / 2, vc = (vMin + vMax) / 2;
  const near = (loci, c) => loci.some((x) => Math.abs(x - c) < T.featTol);
  if (near(featureLoci.u, uc) || near(featureLoci.v, vc)) tags.push('FEATURE-ALIGNED');

  let lever;
  if (shape === 'SPIKE') lever = 'localized singularity → conforming edge / seam pin / atlas patch';
  else if (tags.includes('ANISOTROPIC')) lever = 'anisotropic flank kernel (M=g/h²) — not more triangles';
  else if (tags.includes('FULL-SPAN')) lever = `full-${uExtent >= vExtent ? 'u' : 'v'} band — run \`converge\` to measure: density-responsive (refine) vs truly irreducible (redesign)`;
  else if (shape === 'BAND') lever = `density/envelope along ${uExtent >= vExtent ? 'v' : 'u'} (the short axis)`;
  else lever = 'diffuse — measure locally (no single dominant structure)';

  return { shape, tags, lever, patch, u: uc, v: vc, uExtent, vExtent, peak, mean: sumErr / triIndices.length, anisotropy: meanAniso };
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

// The shared hotspot pipeline, extracted from cmdHotspots so `doctor` reuses it
// (DRY). Reads the three sidecars bound to <stlPath> (STL + .error.bin + .loc.bin),
// cross-checks their counts and provenance, selects the hot triangles at
// max(budget/2, p99), welds them into connected clusters, classifies each, and
// returns them sorted worst-first (peak desc, then size). THROWS a clean Error
// (NOT process.exit) on a missing sidecar / count mismatch / provenance mismatch,
// so a library caller — doctor — can degrade that pot to available:false while the
// CLI (cmdHotspots) turns the throw into its `hotspots: …` message + exit 2.
// opts.budget (CLI --budget) overrides the error.bin header budget, else 0.01.
export function hotspotClusters(stlPath, opts = {}) {
  const errPath = `${stlPath}.error.bin`;
  const locPath = `${stlPath}.loc.bin`;
  for (const [label, p] of [['STL', stlPath], ['error.bin', errPath], ['loc.bin', locPath]]) {
    if (!existsSync(p)) throw new Error(`missing ${label}: ${p}`);
  }
  const parsed = parseStl(stlPath);
  const err = readErrorRaw(errPath);
  const loc = readLoc(locPath);
  if (err.header.count !== parsed.triangleCount || loc.header.count !== parsed.triangleCount) {
    throw new Error(`count mismatch: stl ${parsed.triangleCount} error ${err.header.count} loc ${loc.header.count}`);
  }
  const ep = err.header.provenance?.artifactByteSha256, lp = loc.header.provenance?.artifactByteSha256;
  if (ep && lp && ep !== lp) {
    throw new Error(`provenance mismatch: error.bin and loc.bin describe different meshes (${ep} vs ${lp}) — re-bake`);
  }
  const budget = Number(opts.budget ?? err.header.budgetMm ?? 0.01);
  const p99 = err.header.stats?.p99Mm ?? budget * 0.5;
  const hotThresh = Math.max(budget * 0.5, p99);
  const hot = selectHotTriangles(err.values, hotThresh);
  const featureLoci = deriveFeatureLoci(loc.body, loc.header.count);
  const ctx = { positions: parsed.positions, locBody: loc.body, errors: err.values, budget, featureLoci, patches: loc.header.patches };
  // classifyCluster already resolves `patch` from the same patches table; re-apply
  // the loc-header fallback (`patchN` for an index absent from the table) so every
  // cluster's `patch` is exactly the string cmdHotspots printed inline — one source
  // of truth for both the CLI row and the doctor top-cluster summary.
  const clusters = weldClusters(parsed.positions, hot)
    .map((tris) => {
      const c = classifyCluster(tris, ctx);
      // DOMINANT patch (Fix C): plurality over the cluster's triangles, not tris[0]
      // — a seam-welded cluster reports the patch that owns most of it. Same helper
      // classifyCluster uses (so c.patch and this label agree); re-apply the
      // loc-header `patchN` fallback for an index absent from the table.
      const patchIdx = dominantPatchIdx(loc.body, tris);
      return { tris, ...c, patch: loc.header.patches[patchIdx] ?? `patch${patchIdx}` };
    })
    .sort((a, b) => b.peak - a.peak || b.tris.length - a.tris.length);
  return { clusters, stats: err.header.stats, hotThresh, triangleCount: parsed.triangleCount, title: parsed.title };
}

function cmdHotspots(args) {
  const nameOrStl = args._[0];
  if (!nameOrStl) { console.error('usage: potscope hotspots <name|stl> [--top N] [--budget mm] [--json]'); process.exit(2); }
  const stlPath = resolve(nameOrStl.endsWith('.stl') ? nameOrStl : `${nameOrStl}.stl`);
  let result;
  try {
    result = hotspotClusters(stlPath, { budget: argValue(args, '--budget') });
  } catch (e) {
    console.error(`hotspots: ${e.message}`);
    process.exit(2);
  }
  const { clusters, stats, hotThresh, triangleCount, title } = result;
  const top = Number(argValue(args, '--top') ?? '5');
  const shown = clusters.slice(0, top);

  if (args.flags.includes('--json')) {
    console.log(JSON.stringify({ name: title, triangleCount, stats, hotThresh, clusters: shown.map(({ tris, ...c }) => ({ ...c, triCount: tris.length })) }, null, 2));
    return;
  }
  const um = (mm) => (mm * 1000).toFixed(1);
  const s = stats ?? {};
  console.log(`${title} — ${triangleCount.toLocaleString()} tris, max ${um(s.maxMm ?? 0)}µm  p99 ${um(s.p99Mm ?? 0)}µm  p50 ${um(s.p50Mm ?? 0)}µm`);
  console.log(`worst residual structure (top ${top} of ${clusters.length} hot clusters, threshold ${um(hotThresh)}µm):\n`);
  shown.forEach((c, i) => {
    const tagStr = c.tags.length ? ` · ${c.tags.join(' · ')}` : '';
    console.log(`  [${i + 1}] ${c.shape}${tagStr} · ${c.patch}`);
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

// Parse ONE certified pot's sidecars: recon.json (name/style/tris/configDigest/
// verdict/provenance) + its sibling error.bin header (max/p50/p99) + optional
// certificate.txt (commit). Throws on a malformed recon.json so the caller's
// per-file try/catch can SKIP+warn (keeping the whole scan alive). Shared by the
// on-disk registry (buildStatusRows) and the portable snapshot (buildManifest) so
// the two representations can never drift.
function readCertifiedSidecar(dir, reconFile) {
  const recon = JSON.parse(readFileSync(join(dir, reconFile), 'utf8'));
  let maxMm = null, p50Mm = null, p99Mm = null;
  const errPath = join(dir, `${recon.name}.stl.error.bin`);
  if (existsSync(errPath)) {
    const raw = readFileSync(errPath);
    const hdr = JSON.parse(raw.subarray(0, raw.indexOf(0x0a)).toString('utf8'));
    maxMm = hdr.stats?.maxMm ?? null;
    p50Mm = hdr.stats?.p50Mm ?? null;
    p99Mm = hdr.stats?.p99Mm ?? null;
  }
  const certPath = join(dir, `${recon.name}.certificate.txt`);
  let commit = null;
  if (existsSync(certPath)) {
    const m = readFileSync(certPath, 'utf8').match(/\b([0-9a-f]{7,40})\b/);
    commit = m ? m[1] : null;
  }
  const prov = recon.provenance ?? {};
  return {
    name: recon.name,
    style: recon.style,
    tris: recon.tris,
    configDigest: recon.configDigest ?? '',
    verdict: recon.verdict,
    provenance: {
      targetSha256: prov.targetSha256 ?? null,
      artifactByteSha256: prov.artifactByteSha256 ?? null,
      parsedTriangleSetSha256: prov.parsedTriangleSetSha256 ?? null,
    },
    stats: { maxMm, p50Mm, p99Mm },
    commit,
  };
}

// The "certify on MAX, not p99" mask flag. No data (either stat null) ⇒ not
// masked. With p99>0 it is the >3x ratio; with p99===0 a nonzero max is the
// MAXIMALLY masked case (a hidden cliff over an all-clean p99). Shared so the
// on-disk and manifest row paths raise the flag identically.
function computeMasked(maxMm, p99Mm) {
  if (maxMm == null || p99Mm == null) return false;
  return p99Mm > 0 ? maxMm / p99Mm > 3 : maxMm > 0;
}

// Rebuild registry rows from the committed portable manifest (the fresh-clone
// path — see buildStatusRows). Same Row shape + masked formula as the sidecar
// path, source tagged 'manifest'; configDigest sliced to 8 to match.
function manifestStatusRows(manifestPath) {
  if (!existsSync(manifestPath)) return [];
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    console.warn(`potscope status: committed manifest unreadable (${manifestPath}): ${err.message}`);
    return [];
  }
  // Schema guard on READ (Fix A): the version tag is load-bearing here. A missing or
  // foreign `magic` means the file is not a potscope-manifest/v1 (a future or
  // unrelated schema); refuse it with a warn instead of silently mapping degraded
  // rows out of a shape we do not understand — the same provenance stance the loc/
  // error/converge readers already take on their magics.
  if (manifest?.magic !== 'potscope-manifest/v1') {
    console.warn(
      `potscope status: committed manifest has unexpected schema (magic=${JSON.stringify(manifest?.magic)}); ignoring ${manifestPath}`
    );
    return [];
  }
  // Per-entry resilience (Fix B): one malformed pot entry (non-object, or missing
  // `name`) is SKIPPED with a warn — consistent with the per-FILE hardening in
  // buildStatusRows / buildManifest — so a single bad entry never silently degrades
  // (via optional chaining) or sinks the rest of the registry.
  const rows = [];
  for (const p of manifest.pots ?? []) {
    try {
      if (p === null || typeof p !== 'object' || typeof p.name !== 'string') {
        throw new Error('non-object entry or missing/invalid `name`');
      }
      const maxMm = p.stats?.maxMm ?? null;
      const p99Mm = p.stats?.p99Mm ?? null;
      rows.push({
        name: p.name,
        style: p.style,
        tris: p.tris,
        configDigest: (p.configDigest ?? '').slice(0, 8),
        maxMm,
        p99Mm,
        masked: computeMasked(maxMm, p99Mm),
        commit: p.cert?.commit ?? null,
        verdict: p.verdict,
        source: 'manifest',
      });
    } catch (err) {
      console.warn(`potscope status: skipping malformed manifest entry: ${err.message}`);
    }
  }
  return rows;
}

export function buildStatusRows(dir, manifestPath = join(HERE, 'certs.manifest.json')) {
  let reconFiles = [];
  if (existsSync(dir)) {
    reconFiles = readdirSync(dir).filter((x) => x.endsWith('.recon.json')).sort();
  }
  // Fresh-clone fallback: research/exchange/ is git-ignored, so a clean checkout
  // has NO on-disk sidecars (the dir may not even exist). When no *.recon.json is
  // found, rebuild the rows from the committed, git-tracked certs.manifest.json.
  if (reconFiles.length === 0) return manifestStatusRows(manifestPath);
  const rows = [];
  for (const f of reconFiles) {
    // One malformed/truncated sidecar must not abort the whole registry scan:
    // guard the per-file body so a bad recon.json / error.bin is SKIPPED (with a
    // warn) and the loop keeps going, instead of throwing and killing `status`.
    try {
      const s = readCertifiedSidecar(dir, f);
      rows.push({
        name: s.name,
        style: s.style,
        tris: s.tris,
        configDigest: (s.configDigest ?? '').slice(0, 8),
        maxMm: s.stats.maxMm,
        p99Mm: s.stats.p99Mm,
        masked: computeMasked(s.stats.maxMm, s.stats.p99Mm),
        commit: s.commit,
        verdict: s.verdict,
        source: 'sidecar',
      });
    } catch (err) {
      console.warn(`potscope status: skipping ${f}: ${err.message}`);
    }
  }
  return rows;
}

// The portable convergence snapshot for one pot: read <name>.converge.json (if
// present) via readConverge and distill it to { calibrated, calibrationRatio, worst }
// where `worst` is the MIN-ratio (worst-first) patch — buildConvergeRows[0] — carrying
// its RECOMPUTED verdict (convergeVerdict on the stored ratio). This is what makes the
// roster's refine-vs-redesign map PORTABLE: research/exchange/ (with the on-disk
// converge.json) is git-ignored, so the manifest is the only copy that survives a fresh
// clone. No converge.json → null. A malformed one → null + a warn (the pot still lands
// in the manifest; only its convergence drops) — same per-file resilience stance as the
// recon.json scan. Only the derived numbers are carried (no timestamps ⇒ deterministic
// regen ⇒ clean git diffs).
function readManifestConvergence(dir, name) {
  const convPath = join(dir, `${name}.converge.json`);
  if (!existsSync(convPath)) return null;
  try {
    const conv = readConverge(convPath);
    const worst = buildConvergeRows(conv)[0] ?? null;
    return {
      calibrated: conv.calibrated,
      calibrationRatio: conv.calibrationRatio,
      worst: worst ? { patchId: worst.patchId, ratio: worst.ratio, verdict: worst.verdict } : null,
    };
  } catch (err) {
    console.warn(`potscope manifest: skipping malformed converge.json for ${name}: ${err.message}`);
    return null;
  }
}

// The portable certificate snapshot. research/exchange/ (where the certified STLs
// + sidecars live) is git-ignored, so a fresh clone has none of them and `status`
// would be empty. buildManifest distills every on-disk pot into a small tracked
// JSON — enough to rebuild the registry rows (name/style/config/tris/verdict/
// stats/commit) plus the full provenance digests for an integrity re-check, AND the
// per-pot convergence snapshot (readManifestConvergence) so the refine-vs-redesign
// map is portable too. Pots sorted by name; NO timestamps, so re-running on unchanged
// sidecars yields a byte-identical file (clean git diffs).
export function buildManifest(dir) {
  const pots = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.recon.json')).sort()) {
    try {
      const s = readCertifiedSidecar(dir, f);
      pots.push({
        name: s.name,
        style: s.style,
        configDigest: s.configDigest,
        tris: s.tris,
        verdict: s.verdict,
        provenance: s.provenance,
        stats: s.stats,
        cert: { commit: s.commit },
        // Portable refine-vs-redesign map: the pot's worst-patch convergence verdict,
        // distilled from its converge.json (null when absent/malformed). Carried in the
        // git-tracked manifest so a fresh clone still shows the frontier.
        convergence: readManifestConvergence(dir, s.name),
      });
    } catch (err) {
      console.warn(`potscope manifest: skipping ${f}: ${err.message}`);
    }
  }
  pots.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { magic: 'potscope-manifest/v1', pots };
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
  const manifestPath = join(HERE, 'certs.manifest.json');
  // A fresh clone has no exchange/ dir at all (it is git-ignored). Only bail when
  // there is ALSO no committed manifest to fall back to; otherwise proceed and let
  // buildStatusRows rebuild the registry from certs.manifest.json.
  if (!existsSync(dir) && !existsSync(manifestPath)) {
    console.error(`status: no such dir ${dir} (bake sidecars first: PF_CERT_RECON=all) and no committed manifest at ${manifestPath}`);
    process.exit(2);
  }
  const substr = args._[0];
  let rows = buildStatusRows(dir, manifestPath);
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
  // Fresh-clone note: some/all rows came from the committed manifest, not on-disk
  // sidecars. Emit on stderr so the --json stdout stays pure for machine consumers.
  if (rows.some((r) => r.source === 'manifest')) {
    console.error('(from committed manifest — no on-disk sidecars; run PF_CERT_RECON + potscope manifest to refresh)');
  }
  if (statusExitCode(rows, args.flags.includes('--check'))) {
    const drift = rows.filter((r) => r.verdict === 'DRIFT');
    console.error(`FAIL: ${drift.length} drifted certificate(s): ${drift.map((r) => r.name).join(', ')}`);
    process.exit(1);
  }
}

// --------------------------------------------------------------------- manifest
// Writes the portable certificate snapshot (buildManifest) to a git-TRACKABLE
// path so `status` works on a fresh clone even though the certified STLs/sidecars
// under research/exchange/ are git-ignored. Default --out is certs.manifest.json
// IN the potscope dir (which the potscope .gitignore does NOT ignore — unlike
// exchange/ and the *.recon.json sidecars); default --dir is the same
// _certified_stl the status registry scans.
function cmdManifest(args) {
  const dir = resolve(argValue(args, '--dir') ?? join(HERE, '..', '..', 'exchange', '_certified_stl'));
  if (!existsSync(dir)) {
    console.error(`manifest: no such dir ${dir} (bake sidecars first: PF_CERT_RECON=all)`);
    process.exit(2);
  }
  const outPath = resolve(argValue(args, '--out') ?? join(HERE, 'certs.manifest.json'));
  const manifest = buildManifest(dir);
  // 2-space indent + trailing newline: minimal, stable git diffs on regen.
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`potscope manifest: wrote ${manifest.pots.length} pots to ${outPath}`);
}

// --------------------------------------------------------------------- converge
// The refine-vs-redesign VERDICT layer over the convergence probe. The harness
// (research/bridge/_certRosterConvergence.test.ts) bakes each pot's worst
// per-patch residual at TWO densities into <name>.converge.json; the ratio
// coarseMax/fineMax is the signal — chord error scales ~h² where the surface is
// smooth, so DOUBLING density should ~quarter the residual (ratio ~4). Where a
// feature is under-resolvable by the current tessellation the residual barely
// drops (ratio ~1). This turns that ratio into a per-patch call.

const CONVERGE_LEVERS = {
  RESPONSIVE: 'refine: add density — error falls ~h², more triangles will certify this region',
  PARTIAL: 'mixed: density helps but a feature is limiting — targeted density + inspect the feature (hotspots)',
  IRREDUCIBLE: 'redesign: refinement barely helps — conforming edges / anisotropic kernel / atlas, NOT more triangles',
};

// PURE + exported. Map a coarse/fine worst-residual ratio to { verdict, lever }.
// Thresholds calibrated on the measured roster: HarmonicRipple walls 3.9-4.0
// (RESPONSIVE), GeometricStar outer-wall 2.12 (PARTIAL), inner-wall 1.07
// (IRREDUCIBLE). >=3 is within ~25% of the ideal h² quartering; <1.8 means the
// residual barely moved when density doubled. Degenerate inputs fall out of the
// same comparisons: +Infinity (fineMax 0, i.e. already exact) >=3 → RESPONSIVE;
// NaN (missing coarse) fails both >= tests → the conservative IRREDUCIBLE (no
// evidence density helps). NOTE these thresholds differ deliberately from the
// harness lib's classifyRatio (2.5/1.5, lowercase) — the CLI recomputes here.
export function convergeVerdict(ratio) {
  const verdict = ratio >= 3 ? 'RESPONSIVE' : ratio >= 1.8 ? 'PARTIAL' : 'IRREDUCIBLE';
  return { verdict, lever: CONVERGE_LEVERS[verdict] };
}

// Parse a <name>.converge.json (JSON object; see the harness writer). Throws on a
// wrong magic (provenance: the file is not a converge sidecar) and on a
// missing/non-object perPatch (the payload the verdict layer needs). The real
// schema keys the per-patch data by patchId in a `perPatch` OBJECT (not a
// `patches` array). Exported.
export function readConverge(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.magic !== undefined && data.magic !== 'potscope-converge/v1') {
    throw new Error(`bad converge magic: ${data.magic}`);
  }
  if (data.perPatch === null || typeof data.perPatch !== 'object' || Array.isArray(data.perPatch)) {
    throw new Error('converge: missing perPatch object (not a convergence sidecar?)');
  }
  // Calibration gate. The roster bake attaches
  //   calibration: { certGlobalMaxMm, certPerPatchMaxMm, calibrationRatio, tolerance }
  // where calibrationRatio = (probe fine-density global max) / (KNOWN certified max).
  // A pot is CALIBRATED only when calibrationRatio <= tolerance: the cheap depth-N
  // proxy's fine max sits within tolerance× of the pot's certified truth, so its
  // per-patch coarse/fine ratios can be trusted. When calibrationRatio > tolerance
  // (Voronoi blows up 427×) the proxy is too loose and EVERY ratio it reports is
  // unreliable. Absent calibration data → NOT calibrated (cannot verify ⇒ cannot
  // trust). Surface calibrationRatio/tolerance at top level (don't lose them) so the
  // CLI / doctor / dashboard can mark an uncalibrated pot's verdict as unverified.
  //
  // TWO calibration methods now feed the SAME `calibrated` flag + a `calibrationMethod`
  // tag saying which established trust:
  //   'cert'            — roster pot with a KNOWN certified max: calibrationRatio <= tolerance.
  //   'depth-stability' — arbitrary config (no cert to compare to) self-calibrated by
  //                       verdict stability across depths (selfCalibration.stable).
  //   'none'            — neither present ⇒ cannot verify ⇒ NOT calibrated.
  // The cert block WINS when both are present: the roster's known truth is stronger
  // evidence than self-stability. selfCalibration is surfaced (null when absent) so the
  // CLI can report its `reason` on an unstable self-calibration.
  const cal = data.calibration;
  const sc = data.selfCalibration;
  const calibrationRatio =
    cal && typeof cal.calibrationRatio === 'number' ? cal.calibrationRatio : null;
  const tolerance = cal && typeof cal.tolerance === 'number' ? cal.tolerance : null;
  let calibrated;
  let calibrationMethod;
  if (calibrationRatio !== null && tolerance !== null) {
    calibrated = calibrationRatio <= tolerance;
    calibrationMethod = 'cert';
  } else if (sc && typeof sc.stable === 'boolean') {
    calibrated = sc.stable;
    calibrationMethod = 'depth-stability';
  } else {
    calibrated = false;
    calibrationMethod = 'none';
  }
  return { ...data, calibrated, calibrationMethod, calibrationRatio, tolerance, selfCalibration: sc ?? null };
}

// PURE + exported. Flatten perPatch into rows carrying the RECOMPUTED verdict +
// lever (convergeVerdict on the stored ratio — the CLI's job is to apply the
// verdict thresholds, not to trust the harness's lowercase `verdict` field which
// uses different cutoffs), plus a `laddered` flag. A patch listed in
// fineDivisions.verticalStationsByPatch is pinned by a vertical station-ladder
// that coarsenDivisions passes through UNCHANGED (only the two uniform knobs
// coarsen), so that patch coarsens ANGULAR-only and its ratio reflects angular
// refinement alone. Rows sorted worst-first = ascending ratio (ties: larger fine
// residual first), so the patch most demanding redesign heads the table.
export function buildConvergeRows(data) {
  const perPatch = data.perPatch ?? {};
  const laddered = (data.fineDivisions && data.fineDivisions.verticalStationsByPatch) || {};
  const rows = Object.entries(perPatch).map(([patchId, p]) => {
    const { verdict, lever } = convergeVerdict(p.ratio);
    return {
      patchId,
      fineMaxMm: p.fineMaxMm,
      coarseMaxMm: p.coarseMaxMm,
      ratio: p.ratio,
      verdict,
      lever,
      fineTris: p.fineTris,
      coarseTris: p.coarseTris,
      laddered: Object.prototype.hasOwnProperty.call(laddered, patchId),
    };
  });
  rows.sort((a, b) => a.ratio - b.ratio || b.fineMaxMm - a.fineMaxMm);
  return rows;
}

const CERTIFIED_STL_DIR = () => join(HERE, '..', '..', 'exchange', '_certified_stl');

function cmdConverge(args) {
  const nameOrPath = args._[0];
  if (!nameOrPath) {
    console.error('usage: potscope converge <name|path> [--json] [--dir <certified_stl>]');
    process.exit(2);
  }
  const dir = resolve(argValue(args, '--dir') ?? CERTIFIED_STL_DIR());
  // Accept a bare pot name (resolve to <dir>/<name>.converge.json), an explicit
  // *.converge.json path, or any existing file path.
  const direct = resolve(nameOrPath);
  const path =
    existsSync(direct) && statSync(direct).isFile()
      ? direct
      : nameOrPath.endsWith('.converge.json')
      ? direct
      : join(dir, `${nameOrPath}.converge.json`);
  if (!existsSync(path)) {
    const name = nameOrPath.replace(/\.converge\.json$/i, '').split(/[\\/]/).pop();
    console.error(`converge: no converge.json at ${path}`);
    console.error('bake it first (~minutes; the probe runs through the EcoQoS wrapper):');
    console.error(
      `  PF_CONVERGE=${name} node research/tools/potscope/potscope.mjs run -- npx vitest run research/bridge/_certRosterConvergence.test.ts`
    );
    process.exit(2);
  }
  let data;
  try {
    data = readConverge(path);
  } catch (err) {
    console.error(`converge: ${err.message}`);
    process.exit(2);
  }
  const rows = buildConvergeRows(data);
  const worst = rows[0];
  const cert = data.calibration ? data.calibration.certGlobalMaxMm : undefined;
  const calibrated = data.calibrated;

  if (args.flags.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          variant: data.variant,
          style: data.style,
          depth: data.depth,
          coarseStep: data.coarseStep,
          fineGlobalMaxMm: data.fineGlobalMaxMm,
          coarseGlobalMaxMm: data.coarseGlobalMaxMm,
          certGlobalMaxMm: cert,
          calibrated,
          calibrationMethod: data.calibrationMethod,
          calibrationRatio: data.calibrationRatio,
          tolerance: data.tolerance,
          selfCalibration: data.selfCalibration ?? null,
          fineTrisTotal: data.fineTrisTotal,
          coarseTrisTotal: data.coarseTrisTotal,
          worstPatch: worst ? worst.patchId : null,
          // An uncalibrated probe's verdict is unverified — report null so no
          // consumer of the JSON reads it as a measured verdict.
          worstVerdict: worst ? (calibrated ? worst.verdict : null) : null,
          rows,
        },
        null,
        2
      )
    );
    return;
  }

  const um = (mm) => (mm == null || Number.isNaN(mm) ? '—' : (mm * 1000).toFixed(2));
  const ratioStr = (r) => (Number.isFinite(r) ? r.toFixed(2) : '∞');
  const n = (x) => (typeof x === 'number' ? x.toLocaleString() : '?');
  console.log(
    `${data.variant} (${data.style}) — convergence probe · depth ${data.depth} · coarseStep ${data.coarseStep}`
  );
  console.log(
    `fine global max ${um(data.fineGlobalMaxMm)}µm · coarse ${um(data.coarseGlobalMaxMm)}µm` +
      `${cert !== undefined ? ` · cert ${um(cert)}µm` : ''} · ${n(data.fineTrisTotal)}→${n(data.coarseTrisTotal)} tris`
  );
  // Calibration gate: warn LOUDLY before the table when the probe is uncalibrated, so
  // the per-patch ratios below are never read as trustworthy. The message names WHY it
  // is uncalibrated, which depends on the method: a roster pot's cert calibration cites
  // the calibrationRatio-vs-tolerance blow-up; an arbitrary config's depth-stability
  // self-calibration (no certified max to compare against) cites the self-cal `reason`
  // (e.g. "did not converge by maxDepth"). A stable self-calibration sets calibrated:true,
  // so this block never fires for it.
  if (!calibrated) {
    if (data.calibrationMethod === 'depth-stability') {
      const sc = data.selfCalibration || {};
      const reason = sc.reason ? `: ${sc.reason}` : '';
      const fd = Number.isFinite(sc.finalDepth) ? ` (finalDepth ${sc.finalDepth})` : '';
      console.log(
        `\n⚠ UNCALIBRATED: verdict-stability self-calibration did not stabilize${reason}${fd} — ` +
          `the ratios below are NOT trustworthy; re-bake at higher maxDepth.\n`
      );
    } else {
      const cr = Number.isFinite(data.calibrationRatio) ? data.calibrationRatio.toFixed(1) : '?';
      const tol = Number.isFinite(data.tolerance) ? data.tolerance : '?';
      console.log(
        `\n⚠ UNCALIBRATED: depth-${data.depth} proxy fine-max is ${cr}× the certified max ` +
          `(tolerance ${tol}×) — the ratios below are NOT trustworthy; re-bake at higher depth.\n`
      );
    }
  }
  console.log(
    `refine-vs-redesign by patch (ratio = coarseMax/fineMax; ~4 responsive · ~1 irreducible)` +
      `${calibrated ? '' : ' [UNCALIBRATED]'}:\n`
  );
  console.log('  patch           fineµm  coarseµm  ratio  verdict');
  for (const r of rows) {
    console.log(
      `  ${r.patchId.padEnd(14)} ${um(r.fineMaxMm).padStart(6)}  ${um(r.coarseMaxMm).padStart(7)}  ` +
        `${ratioStr(r.ratio).padStart(5)}  ${r.verdict}${r.laddered ? ' *' : ''}`
    );
  }
  // Coarsening caveat: a station-laddered patch coarsened on the ANGULAR axis
  // only — its vertical feature stations passed through the coarse transform
  // unchanged — so its ratio is the angular-refinement response, not a
  // full-density one. Surface it so an IRREDUCIBLE laddered patch is not
  // mis-read as "density-proof on every axis".
  const ladderedRows = rows.filter((r) => r.laddered);
  if (ladderedRows.length > 0) {
    console.log('');
    for (const r of ladderedRows) {
      console.log(
        `  * ${r.patchId}: vertical station-ladder held fixed across densities — ratio reflects` +
          ` ANGULAR refinement only (vertical feature stations are refinement-invariant)`
      );
    }
  }
  if (worst) {
    // The verdict is only a measured call when the probe is calibrated; otherwise
    // flag it as unverified so the summary line is never read as a certified result.
    const uncalSuffix = calibrated ? '' : ' [UNCALIBRATED — ratio unreliable]';
    console.log(
      `\nworst: ${worst.patchId} ${worst.verdict}${uncalSuffix} (ratio ${ratioStr(worst.ratio)}, fine ${um(worst.fineMaxMm)}µm)` +
        `\n  → ${worst.lever}`
    );
  }
}

// ---------------------------------------------------------------- convergeconfig
// The ergonomic builder for the Task-3 convergence probe's arbitrary-config input
// (PF_CONVERGE_CONFIG=<path.json>). It removes the last hand-authoring friction —
// writing the `divisions` block by hand — so a session agent converges an
// off-roster pot by naming a style + relief depth + geometry on the command line.

// The one legitimately style-specific bit: which styleParam is "relief". Extend
// per src/styles/registry.ts as styles are probed. Unknown -> explicit error.
const RELIEF_KEY = {
  GeometricStar: 'gs_relief', Crystalline: 'cr_facet_depth', Voronoi: 'v_relief',
  WaveInterference: 'wi_relief_depth', RippleInterference: 'ri_relief_depth',
  HarmonicRipple: 'hr_petal_amp', SpiralRidges: 'spiral_amp_max',
  SuperformulaBlossom: 'sf_strength',
};
export function reliefKeyForStyle(styleId) {
  const key = RELIEF_KEY[styleId];
  if (!key) throw new Error(`convergeconfig: no relief-key known for '${styleId}' — pass --relief-key <param> (see src/styles/registry.ts)`);
  return key;
}
export function buildConvergeConfig({ styleId, relief, reliefKey, od, h, ang, vert, name }) {
  const key = reliefKey ?? reliefKeyForStyle(styleId);
  const verticalDivisionsLog2ByPatch = {
    'outer-wall': vert, 'inner-wall': vert, 'top-rim': 3,
    'bottom-top': 4, 'bottom-under': 4, 'drain-wall': 0,
  };
  return {
    name: name ?? `${styleId}_arb_od${od}_h${h}_rel${String(relief).replace('.', 'p')}_a${ang}v${vert}`,
    styleId,
    styleParams: { [key]: relief },
    geometry: { H: h, top_od: od, bottom_od: od, r_drain: Math.min(6, Math.round(od / 5)) },
    divisions: { angularDivisionsLog2: ang, verticalDivisionsLog2ByPatch },
  };
}
function cmdConvergeConfig(args) {
  const styleId = args._[0];
  if (!styleId) { console.error('usage: convergeconfig <styleId> --relief r --od mm --h mm --ang log2 --vert log2 [--relief-key k] [--name n] [--out path]'); process.exit(2); }
  const num = (flag, dflt) => { const v = argValue(args, flag); return v === undefined ? dflt : Number(v); };
  // reliefKeyForStyle throws (its message already prefixed + names --relief-key) on an
  // unknown style with no --relief-key override. Catch it like every other cmd* here
  // (cmdConverge/cmdDecode/cmdHotspots) so the helpful hint prints as one clean line +
  // exit 2, not a raw Node stack trace.
  let cfg;
  try {
    cfg = buildConvergeConfig({
      styleId, relief: num('--relief', 0.08), reliefKey: argValue(args, '--relief-key'),
      od: num('--od', 30), h: num('--h', 32), ang: num('--ang', 8), vert: num('--vert', 5),
      name: argValue(args, '--name'),
    });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const out = resolve(argValue(args, '--out') ?? `${cfg.name}.convergeconfig.json`);
  writeFileSync(out, `${JSON.stringify(cfg, null, 2)}\n`);
  console.log(`wrote ${out}`);
  console.log(`  bake:  PF_CONVERGE_CONFIG="${out}" node ${'research/tools/potscope/potscope.mjs'} run -- npx vitest run research/bridge/_certRosterConvergence.test.ts`);
}

// --------------------------------------------------------------------- doctor
// The roster health roll-up: one row per registry pot (buildStatusRows) unified
// with its two on-disk truth layers when the sidecars are present — the worst
// residual cluster (hotspotClusters: needs stl + error.bin + loc.bin) and the
// worst-ratio convergence patch (buildConvergeRows: needs <name>.converge.json).
// Missing per-pot sidecars (a fresh clone, or a pot not yet probed) are
// available:false — NOT an error — and each pot's aggregation is wrapped in
// try/catch so one bad pot cannot sink the whole report (consistent with the
// status-scan hardening). The clean object it returns is what BOTH the CLI table
// and the dashboard `--json` consume, so it is the single source of roster truth.
// opts: { fast } skips the (expensive, ~45 MB) hotspots STL reads; { manifestPath }
// + { budget } pass through to buildStatusRows / hotspotClusters.
export function buildDoctorReport(dir, opts = {}) {
  const resolvedDir = resolve(dir);
  const rows = buildStatusRows(resolvedDir, opts.manifestPath);
  // Fresh-clone convergence map: research/exchange/ (with the on-disk converge.json)
  // is git-ignored, so a clean checkout drives buildStatusRows to its manifest fallback
  // (every row.source === 'manifest'). The refine-vs-redesign map is carried IN that
  // committed manifest (buildManifest attaches per-pot convergence), so read it once —
  // keyed by name — to populate each manifest-sourced pot's convergence exactly as the
  // on-disk path would. Only consulted when some row is manifest-sourced; a missing/
  // foreign/broken manifest simply leaves the map empty (convergence stays available
  // :false). Resolve the SAME manifest path buildStatusRows used (default when unset).
  const manifestConvByName = new Map();
  if (rows.some((r) => r.source === 'manifest')) {
    try {
      const manifest = JSON.parse(readFileSync(opts.manifestPath ?? join(HERE, 'certs.manifest.json'), 'utf8'));
      if (manifest && manifest.magic === 'potscope-manifest/v1') {
        for (const p of manifest.pots ?? []) {
          if (p && typeof p === 'object' && typeof p.name === 'string') {
            manifestConvByName.set(p.name, p.convergence ?? null);
          }
        }
      }
    } catch {
      /* no/unreadable manifest → no fallback convergence (available:false stays) */
    }
  }
  const pots = rows.map((row) => {
    const base = {
      name: row.name,
      style: row.style,
      tris: row.tris,
      verdict: row.verdict,
      maxMm: row.maxMm,
      p99Mm: row.p99Mm,
      masked: row.masked,
      source: row.source,
      hotspots: { available: false, top: null },
      // calibrated defaults false so a sidecar-less pot is null-safe AND is never
      // counted into the (calibrated-only) irreducible frontier.
      convergence: { available: false, calibrated: false, worst: null },
    };
    try {
      // Hotspots: elided entirely under --fast (reading a dozen STLs, some ~45 MB,
      // costs ~a minute). Otherwise attempt the sidecar read; any failure (missing
      // sidecar / count / provenance mismatch) simply leaves available:false.
      if (!opts.fast) {
        const stlPath = join(resolvedDir, `${row.name}.stl`);
        if (existsSync(stlPath) && existsSync(`${stlPath}.error.bin`) && existsSync(`${stlPath}.loc.bin`)) {
          try {
            const t = hotspotClusters(stlPath, { budget: opts.budget }).clusters[0] ?? null;
            base.hotspots = {
              available: true,
              top: t
                ? { shape: t.shape, tags: t.tags, patch: t.patch, peakMm: t.peak, u: t.u, v: t.v, lever: t.lever }
                : null,
            };
          } catch {
            /* corrupt/mismatched sidecar → leave hotspots available:false */
          }
        }
      }
      // Convergence: cheap (a small JSON), so read it whenever present.
      const convPath = join(resolvedDir, `${row.name}.converge.json`);
      if (existsSync(convPath)) {
        try {
          const conv = readConverge(convPath);
          const worst = buildConvergeRows(conv)[0] ?? null;
          base.convergence = {
            available: true,
            // Honor the calibration gate: carry the derived flag so an uncalibrated
            // pot's worst ratio is never trusted as a measured verdict downstream.
            calibrated: conv.calibrated,
            // How trust was established ('cert' | 'depth-stability' | 'none') — the
            // dashboard renders it as a small marker next to the verdict.
            calibrationMethod: conv.calibrationMethod,
            calibrationRatio: conv.calibrationRatio,
            worst: worst ? { patchId: worst.patchId, ratio: worst.ratio, verdict: worst.verdict } : null,
          };
        } catch {
          /* malformed converge.json → leave convergence available:false */
        }
      } else if (row.source === 'manifest') {
        // Fresh clone: no on-disk converge.json, but the committed manifest carries the
        // convergence snapshot (buildManifest). Mirror the on-disk shape so doctor/
        // dashboard show the same refine-vs-redesign map and the summary counts it
        // identically (only a CALIBRATED irreducible is a frontier). A manifest entry
        // whose convergence is null (no converge.json at bake time) leaves available
        // :false — the same as a not-yet-probed pot.
        const mc = manifestConvByName.get(row.name);
        if (mc && typeof mc === 'object') {
          base.convergence = {
            available: true,
            calibrated: !!mc.calibrated,
            // Carried through when the manifest snapshot recorded it; a manifest predating
            // the field yields null → the dashboard simply omits the marker (as before).
            calibrationMethod: mc.calibrationMethod ?? null,
            calibrationRatio: mc.calibrationRatio ?? null,
            worst: mc.worst
              ? { patchId: mc.worst.patchId, ratio: mc.worst.ratio, verdict: mc.worst.verdict }
              : null,
          };
        }
      }
    } catch (err) {
      base.error = err.message; // one bad pot must not sink the whole report
    }
    return base;
  });
  const summary = {
    pots: pots.length,
    green: pots.filter((p) => p.verdict === 'GREEN').length,
    drift: pots.filter((p) => p.verdict === 'DRIFT').length,
    masked: pots.filter((p) => p.masked).length,
    // The irreducible frontier counts ONLY calibrated pots: an uncalibrated probe's
    // IRREDUCIBLE is an unreliable verdict (its ratio can't be trusted), so counting
    // it would overstate how much of the roster is genuinely density-proof.
    withIrreducibleConvergence: pots.filter(
      (p) => p.convergence.calibrated && p.convergence.worst && p.convergence.worst.verdict === 'IRREDUCIBLE'
    ).length,
    convergeCalibrated: pots.filter((p) => p.convergence.available && p.convergence.calibrated).length,
    convergeUncalibrated: pots.filter((p) => p.convergence.available && !p.convergence.calibrated).length,
    hotspotsAvailable: pots.filter((p) => p.hotspots.available).length,
    convergeAvailable: pots.filter((p) => p.convergence.available).length,
  };
  return { magic: 'potscope-doctor/v1', pots, summary };
}

function cmdDoctor(args) {
  const dir = resolve(argValue(args, '--dir') ?? CERTIFIED_STL_DIR());
  const manifestPath = join(HERE, 'certs.manifest.json');
  // Fresh clone: exchange/ is git-ignored. Only bail when there is ALSO no
  // committed manifest to fall back to; otherwise proceed and let buildStatusRows
  // rebuild the registry from certs.manifest.json (hotspots/convergence then just
  // read available:false — no on-disk sidecars).
  if (!existsSync(dir) && !existsSync(manifestPath)) {
    console.error(`doctor: no such dir ${dir} (bake sidecars: PF_CERT_RECON=all) and no committed manifest at ${manifestPath}`);
    process.exit(2);
  }
  const fast = args.flags.includes('--fast');
  const report = buildDoctorReport(dir, { fast, manifestPath });
  const s = report.summary;

  if (args.flags.includes('--json')) {
    // stdout stays PURE JSON for the dashboard; every note goes to stderr.
    console.log(JSON.stringify(report, null, 2));
    if (fast) console.error('note: --fast elided hotspots (hotspots.available=false everywhere) — registry + convergence only');
    if (report.pots.some((p) => p.source === 'manifest')) {
      console.error('note: rows from committed manifest — no on-disk sidecars; convergence carried in the manifest, hotspots unavailable until re-baked');
    }
    return;
  }

  const um = (mm) => (mm == null ? '    —' : (mm * 1000).toFixed(1));
  if (fast) console.error('note: --fast elided the hotspots STL reads (drop --fast for worst-cluster shapes; ~a minute on the full roster)');
  console.log(`roster health — registry · hotspots · convergence${fast ? '   [--fast: hotspots elided]' : ''}`);
  console.log(
    `${'variant'.padEnd(44)} ${'style'.padEnd(18)} ${'tris'.padStart(9)}  ${'maxµm'.padStart(6)}  ${'verdict'.padEnd(7)}  ${'worst hotspot'.padEnd(26)} converge`
  );
  for (const p of report.pots) {
    const hot = !p.hotspots.available
      ? fast
        ? '— (fast)'
        : '—'
      : p.hotspots.top
      ? `${p.hotspots.top.shape}/${p.hotspots.top.patch}`
      : 'clean';
    // Uncalibrated probes never print a bare verdict here — show UNCAL so the
    // table can't be read as a measured call (same gate the dashboard applies).
    const conv = !p.convergence.available
      ? '—'
      : !p.convergence.calibrated
      ? 'UNCAL'
      : p.convergence.worst
      ? p.convergence.worst.verdict
      : '—';
    const flag = p.masked ? ' ⚠MASK' : '';
    console.log(
      `${p.name.padEnd(44)} ${String(p.style).padEnd(18)} ${String(p.tris).padStart(9)}  ${um(p.maxMm).padStart(6)}  ${String(p.verdict).padEnd(7)}  ${hot.padEnd(26)} ${conv}${flag}`
    );
  }
  console.log(
    `\n${s.pots} pots · ${s.green} GREEN · ${s.drift} DRIFT · ${s.masked} max-masked · ` +
      `${s.withIrreducibleConvergence} irreducible-converge (calibrated) · hotspots ${s.hotspotsAvailable}/${s.pots} · ` +
      `converge ${s.convergeAvailable}/${s.pots} (${s.convergeCalibrated} calibrated · ${s.convergeUncalibrated} uncalibrated)`
  );
  if (report.pots.some((p) => p.source === 'manifest')) {
    console.error('(from committed manifest — no on-disk sidecars; convergence carried in the manifest, hotspots unavailable until re-baked + reconstructed)');
  }
}

// -------------------------------------------------------------------- dashboard
// The doctor report, rendered as a self-contained "command center": one offline
// HTML page (inline CSS/JS, NO external fetches / fonts / CDNs) that opens
// straight off file:// and is listed by `potscope serve`. The roster is rendered
// SERVER-SIDE — every pot name and every summary count is literal text, not
// JS-dependent — while REPORT is also embedded for inspection / re-sort. Design:
// a ceramic studio-at-dusk lab instrument (celadon-glaze accents), not a table.
const DASHBOARD_DATE = '2026-07-22';
const CERT_BUDGET_MM = 0.01; // the campaign's 0.01 mm (10 µm) true-3D budget

export function dashboardHtml(report) {
  const summary = (report && report.summary) || {};
  const pots = Array.isArray(report && report.pots) ? report.pots : [];

  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const um = (mm) => (mm == null || !Number.isFinite(mm) ? '—' : (mm * 1000).toFixed(1));
  const barPct = (mm) => Math.max(0, Math.min(1, (Number.isFinite(mm) ? mm : 0) / CERT_BUDGET_MM)) * 100;
  const commas = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('en-US'));
  const N = (v) => (v == null ? 0 : v);

  // Server-side display order: any DRIFT first (the only thing needing action),
  // then worst-max-first so the eye lands on the tightest margins.
  const ordered = pots.slice().sort((a, b) => {
    const da = a.verdict === 'DRIFT' ? 0 : 1;
    const db = b.verdict === 'DRIFT' ? 0 : 1;
    if (da !== db) return da - db;
    return (b.maxMm == null ? -1 : b.maxMm) - (a.maxMm == null ? -1 : a.maxMm);
  });

  const stat = (num, label, cls) =>
    `<div class="stat ${cls}"><div class="snum">${esc(String(num))}</div><div class="slab">${esc(label)}</div></div>`;
  const chips = [
    stat(N(summary.pots) || pots.length, 'pots certified', 'k-clay'),
    stat(N(summary.green), 'GREEN', 'k-green'),
    stat(N(summary.drift), 'DRIFT', 'k-drift'),
    stat(N(summary.masked), 'max-masked', 'k-amber'),
    stat(N(summary.withIrreducibleConvergence), 'irreducible frontier', 'k-ember'),
  ].join('');

  const vBadge = (v) => `<span class="badge ${v === 'DRIFT' ? 'b-drift' : 'b-green'}">${esc(v || '—')}</span>`;
  const cBadge = (v) => {
    const cls = v === 'RESPONSIVE' ? 'c-resp' : v === 'PARTIAL' ? 'c-part' : 'c-irr';
    return `<span class="cbadge ${cls}">${esc(v)}</span>`;
  };
  // A small marker naming HOW trust was established, next to the (calibrated) verdict:
  // '(cert)'     = roster pot calibrated against its KNOWN certified max;
  // '(self-cal)' = arbitrary config self-calibrated by verdict stability across depths.
  // An unknown/legacy method (null on a pre-field report) → no marker (renders as before).
  const methodMark = (m) =>
    m === 'cert'
      ? `<span class="cmethod" title="calibrated against the pot's known certified max">(cert)</span>`
      : m === 'depth-stability'
      ? `<span class="cmethod" title="self-calibrated by verdict stability across depths (no certified max to compare against)">(self-cal)</span>`
      : '';
  const tagPill = (t) => {
    const cls = t === 'FULL-SPAN' ? 't-irr' : t === 'ANISOTROPIC' ? 't-aniso' : 't-feat';
    return `<span class="tag ${cls}">${esc(t)}</span>`;
  };

  const meter = (p) => {
    const drift = p.verdict === 'DRIFT';
    const masked = !!p.masked;
    const cls = drift ? 'm-drift' : masked ? 'm-masked' : 'm-green';
    const fill = barPct(p.maxMm);
    const mark = Number.isFinite(p.p99Mm) ? barPct(p.p99Mm) : null;
    const warn = masked ? ' <span class="warn" title="max-masked: max ≫ p99 — certify on MAX">⚠</span>' : '';
    return (
      `<div class="meter ${cls}">` +
      `<div class="mlab"><span>max <b>${um(p.maxMm)}</b> µm${warn}</span>` +
      `<span class="dim">p99 ${um(p.p99Mm)} µm</span>` +
      `<span class="bud">budget 10 µm</span></div>` +
      `<div class="track" role="img" aria-label="max ${um(p.maxMm)} micron of 10 micron budget">` +
      `<div class="fill" style="width:${fill.toFixed(1)}%"></div>` +
      (mark == null ? '' : `<i class="p99" style="left:${mark.toFixed(1)}%"></i>`) +
      `</div></div>`
    );
  };

  const hotRow = (p) => {
    const h = p.hotspots || { available: false, top: null };
    if (!h.available) return `<div class="line faint"><span class="lk">hotspot</span> no on-disk sidecar</div>`;
    const t = h.top;
    if (!t) return `<div class="line"><span class="lk">hotspot</span><span class="ok">clean — no cluster over threshold</span></div>`;
    const tags = Array.isArray(t.tags) ? t.tags.map(tagPill).join('') : '';
    return (
      `<div class="line"><span class="lk">hotspot</span>` +
      `<span class="shape s-${esc(t.shape)}">${esc(t.shape)}</span>${tags}` +
      `<span class="patch">${esc(t.patch || '—')}</span>` +
      `<span class="peak">peak ${um(t.peakMm)} µm</span></div>` +
      (t.lever ? `<div class="lever">${esc(t.lever)}</div>` : '')
    );
  };

  const convRow = (p) => {
    const c = p.convergence || { available: false, worst: null };
    if (!c.available) return `<div class="line faint"><span class="lk">converge</span> not probed</div>`;
    const w = c.worst;
    if (!w) return `<div class="line"><span class="lk">converge</span><span class="ok">no limiting patch</span></div>`;
    // Calibration gate: when the probe is UNCALIBRATED (its fine-density max sits far
    // above the pot's KNOWN certified max) its per-patch ratios are unreliable, so
    // NEVER render an authoritative RESPONSIVE/PARTIAL/IRREDUCIBLE badge. Show the
    // worst patch + ratio behind a muted "uncalibrated" chip (amber-dim) so a viewer
    // can't mistake it for a measured verdict. Only an EXPLICIT calibrated===false
    // demotes — a report predating the flag (undefined) renders authoritatively as before.
    if (c.calibrated === false) {
      const cr = Number.isFinite(c.calibrationRatio) ? `${Number(c.calibrationRatio).toFixed(1)}×` : '';
      const tip = `uncalibrated: proxy fine-max ${cr || 'is'} above the certified max — ratio not a measured verdict`;
      return (
        `<div class="line uncal"><span class="lk">converge</span>` +
        `<span class="patch">${esc(w.patchId)}</span>` +
        `<span class="ratio">×${Number(w.ratio).toFixed(2)}</span>` +
        `<span class="cbadge c-uncal" title="${esc(tip)}">uncalibrated${cr ? ` ${esc(cr)}` : ''}</span>` +
        `</div>`
      );
    }
    return (
      `<div class="line"><span class="lk">converge</span>` +
      `<span class="patch">${esc(w.patchId)}</span>` +
      `<span class="ratio">×${Number(w.ratio).toFixed(2)}</span>` +
      cBadge(w.verdict) +
      methodMark(c.calibrationMethod) +
      `</div>`
    );
  };

  const card = (p) =>
    `<article class="card${p.verdict === 'DRIFT' ? ' is-drift' : ''}${p.masked ? ' is-masked' : ''}"` +
    ` data-name="${esc(p.name)}" data-style="${esc(p.style)}" data-max="${Number.isFinite(p.maxMm) ? p.maxMm : ''}" data-verdict="${esc(p.verdict)}">` +
    `<header class="chead"><h2 title="${esc(p.name)}">${esc(p.name)}</h2>${vBadge(p.verdict)}</header>` +
    `<div class="cmeta"><span class="stylechip">${esc(p.style || '—')}</span><span class="tris">${commas(p.tris)} tris</span></div>` +
    meter(p) +
    `<div class="rows">${hotRow(p)}${convRow(p)}</div>` +
    `<div class="cfoot">source · ${esc(p.source || '—')}</div>` +
    `</article>`;

  const cardsHtml = ordered.map(card).join('');
  const cov = `hotspots ${N(summary.hotspotsAvailable)}/${N(summary.pots) || pots.length} · converge ${N(summary.convergeAvailable)}/${N(summary.pots) || pots.length}`;
  // Embed the report for inspection / client re-sort. Escape '<' so a string
  // value can never close the <script> or open a comment.
  const dataJson = JSON.stringify(report).replace(/</g, '\\u003c');

  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PotFoundry — Certification Command Center</title>
<style>
  :root{
    --bg:#0e1116; --panel:rgba(255,255,255,.035); --panel2:rgba(255,255,255,.06);
    --border:#2a3038; --hair:#20262e; --top:rgba(14,17,22,.82);
    --ink:#e6edf3; --body:#c9d1d9; --dim:#8b949e;
    --celadon:#6db38f; --celadon-deep:#497a69; --clay:#d0bfa3;
    --drift:#db2919; --ember:#f0883e; --amber:#d9a441; --responsive:#6db38f;
    --glaze-a:rgba(73,122,105,.22); --glaze-b:rgba(208,191,163,.10);
    --shadow:rgba(0,0,0,.45);
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --mono:ui-monospace,"SF Mono","Cascadia Code","Segoe UI Mono",Consolas,monospace;
  }
  @media (prefers-color-scheme: light){
    :root:not([data-theme="dark"]){
      --bg:#f4f0e8; --panel:rgba(28,38,32,.035); --panel2:rgba(28,38,32,.06);
      --border:#ddd6c8; --hair:#e8e2d6; --top:rgba(244,240,232,.82);
      --ink:#1c2429; --body:#3c464d; --dim:#6c757c;
      --celadon:#3c7c62; --celadon-deep:#2e5c49; --clay:#9c7c4e;
      --drift:#bd2417; --ember:#c05a17; --amber:#a9761f; --responsive:#3c7c62;
      --glaze-a:rgba(63,124,98,.14); --glaze-b:rgba(176,141,91,.10);
      --shadow:rgba(60,50,35,.14);
    }
  }
  :root[data-theme="light"]{
    --bg:#f4f0e8; --panel:rgba(28,38,32,.035); --panel2:rgba(28,38,32,.06);
    --border:#ddd6c8; --hair:#e8e2d6; --top:rgba(244,240,232,.82);
    --ink:#1c2429; --body:#3c464d; --dim:#6c757c;
    --celadon:#3c7c62; --celadon-deep:#2e5c49; --clay:#9c7c4e;
    --drift:#bd2417; --ember:#c05a17; --amber:#a9761f; --responsive:#3c7c62;
    --glaze-a:rgba(63,124,98,.14); --glaze-b:rgba(176,141,91,.10);
    --shadow:rgba(60,50,35,.14);
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{
    background:var(--bg); color:var(--body); font:14px/1.55 var(--sans);
    min-height:100vh; overflow-x:hidden; position:relative; -webkit-font-smoothing:antialiased;
  }
  body::before{
    content:""; position:fixed; inset:0; z-index:-1; pointer-events:none;
    background:
      radial-gradient(1100px 560px at 80% -10%, var(--glaze-a), transparent 62%),
      radial-gradient(820px 460px at 6% 112%, var(--glaze-b), transparent 58%);
  }
  a{color:var(--celadon)}
  code{font-family:var(--mono); font-size:.92em; color:var(--clay)}
  .num{font-family:var(--mono); font-variant-numeric:tabular-nums}

  header.top{
    position:sticky; top:0; z-index:10; padding:18px clamp(16px,4vw,40px) 14px;
    background:var(--top); backdrop-filter:saturate(1.3) blur(12px);
    -webkit-backdrop-filter:saturate(1.3) blur(12px);
    border-bottom:1px solid var(--border);
  }
  header.top h1{
    margin:0; font-size:clamp(17px,2.4vw,23px); font-weight:650; letter-spacing:.2px; color:var(--ink);
  }
  header.top .sub{margin:4px 0 0; font-size:12.5px; color:var(--dim)}
  header.top .sub .cov{font-family:var(--mono); color:var(--celadon)}
  .chips{display:flex; flex-wrap:wrap; gap:10px; margin-top:14px}
  .stat{
    flex:1 1 128px; min-width:118px; padding:11px 14px; border-radius:11px;
    background:var(--panel); border:1px solid var(--border);
    display:flex; flex-direction:column; gap:2px;
  }
  .stat .snum{font:600 25px/1 var(--mono); font-variant-numeric:tabular-nums; color:var(--ink)}
  .stat .slab{font-size:11px; letter-spacing:.4px; text-transform:uppercase; color:var(--dim)}
  .stat.k-green .snum{color:var(--celadon)}
  .stat.k-green{border-color:color-mix(in srgb, var(--celadon) 42%, var(--border))}
  .stat.k-drift .snum{color:var(--drift)}
  .stat.k-amber .snum{color:var(--amber)}
  .stat.k-ember .snum{color:var(--ember)}
  .stat.k-clay .snum{color:var(--clay)}

  .toolbar{display:flex; flex-wrap:wrap; align-items:center; gap:7px; margin-top:14px}
  .toolbar .tlab{font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:var(--dim); margin-right:2px}
  .toolbar button{
    font:500 12px var(--sans); color:var(--body); cursor:pointer;
    background:var(--panel); border:1px solid var(--border); border-radius:999px; padding:5px 12px;
    transition:background .15s, border-color .15s, color .15s;
  }
  .toolbar button:hover{background:var(--panel2); color:var(--ink)}
  .toolbar button.on{background:color-mix(in srgb, var(--celadon) 20%, transparent); border-color:var(--celadon); color:var(--ink)}
  .toolbar .theme{margin-left:auto}

  main{padding:clamp(16px,3vw,30px) clamp(16px,4vw,40px) 8px}
  #grid{
    display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px;
  }
  .card{
    background:var(--panel); border:1px solid var(--border); border-radius:14px;
    padding:15px 16px 12px; display:flex; flex-direction:column; gap:11px;
    position:relative; overflow:hidden;
    transition:transform .16s ease, border-color .16s ease, box-shadow .16s ease, background .16s ease;
  }
  .card::before{
    content:""; position:absolute; left:0; top:0; bottom:0; width:3px;
    background:linear-gradient(var(--celadon), var(--celadon-deep)); opacity:.75;
  }
  .card.is-drift::before{background:linear-gradient(var(--drift), #7a1109)}
  .card.is-masked::before{background:linear-gradient(var(--amber), var(--ember))}
  .card:hover{
    transform:translateY(-3px); border-color:color-mix(in srgb, var(--celadon) 34%, var(--border));
    box-shadow:0 10px 30px -12px var(--shadow); background:var(--panel2);
  }
  .chead{display:flex; align-items:flex-start; justify-content:space-between; gap:10px}
  .chead h2{
    margin:0; font-size:14.5px; font-weight:600; color:var(--ink); line-height:1.3;
    overflow-wrap:anywhere; word-break:break-word;
  }
  .badge{
    flex:none; font:600 10.5px/1 var(--mono); letter-spacing:.6px; padding:5px 9px; border-radius:7px;
    border:1px solid transparent; white-space:nowrap;
  }
  .b-green{color:var(--celadon); background:color-mix(in srgb, var(--celadon) 15%, transparent); border-color:color-mix(in srgb, var(--celadon) 40%, transparent)}
  .b-drift{color:var(--drift); background:color-mix(in srgb, var(--drift) 15%, transparent); border-color:color-mix(in srgb, var(--drift) 42%, transparent)}
  .cmeta{display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:-2px}
  .stylechip{
    font:500 11px var(--sans); color:var(--clay); padding:3px 9px; border-radius:999px;
    background:color-mix(in srgb, var(--clay) 12%, transparent); border:1px solid color-mix(in srgb, var(--clay) 26%, var(--border));
  }
  .tris{font-family:var(--mono); font-size:11px; color:var(--dim); margin-left:auto}

  .meter{display:flex; flex-direction:column; gap:6px}
  .mlab{display:flex; flex-wrap:wrap; align-items:baseline; gap:8px; font-family:var(--mono); font-size:11.5px}
  .mlab b{color:var(--ink); font-size:13px}
  .mlab .dim{color:var(--dim)}
  .mlab .bud{margin-left:auto; color:var(--dim); font-size:10.5px}
  .mlab .warn{color:var(--amber)}
  .track{
    position:relative; height:9px; border-radius:6px; background:var(--hair);
    border:1px solid var(--border); overflow:visible;
  }
  .fill{
    position:absolute; left:0; top:0; bottom:0; border-radius:6px 3px 3px 6px; min-width:2px;
    background:linear-gradient(90deg, var(--celadon-deep), var(--celadon));
  }
  .m-masked .fill{background:linear-gradient(90deg, var(--amber), var(--ember))}
  .m-drift .fill{background:linear-gradient(90deg, #7a1109, var(--drift))}
  .p99{
    position:absolute; top:-3px; bottom:-3px; width:2px; margin-left:-1px; border-radius:2px;
    background:var(--ink); opacity:.72; box-shadow:0 0 0 1px var(--bg);
  }

  .rows{display:flex; flex-direction:column; gap:6px; padding-top:2px; border-top:1px solid var(--hair)}
  .line{display:flex; flex-wrap:wrap; align-items:center; gap:6px; font-size:11.5px; padding-top:6px}
  .line:first-child{padding-top:8px}
  .lk{font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:var(--dim); min-width:56px}
  .line.faint{color:var(--dim); font-style:italic}
  .line .ok{color:var(--celadon)}
  .shape{font:600 10px/1 var(--mono); letter-spacing:.5px; padding:3px 7px; border-radius:6px; color:var(--ink); background:var(--panel2); border:1px solid var(--border)}
  .s-SPIKE{color:var(--ember); border-color:color-mix(in srgb, var(--ember) 40%, transparent)}
  .s-BAND{color:var(--amber); border-color:color-mix(in srgb, var(--amber) 40%, transparent)}
  .s-DIFFUSE{color:var(--dim)}
  .tag{font:600 9.5px/1 var(--mono); letter-spacing:.4px; padding:3px 6px; border-radius:5px; border:1px solid transparent}
  .t-irr{color:var(--ember); background:color-mix(in srgb, var(--ember) 13%, transparent); border-color:color-mix(in srgb, var(--ember) 34%, transparent)}
  .t-aniso{color:var(--celadon); background:color-mix(in srgb, var(--celadon-deep) 16%, transparent); border-color:color-mix(in srgb, var(--celadon) 32%, transparent)}
  .t-feat{color:var(--clay); background:color-mix(in srgb, var(--clay) 13%, transparent); border-color:color-mix(in srgb, var(--clay) 30%, transparent)}
  .patch{font-family:var(--mono); color:var(--body)}
  .peak,.ratio{font-family:var(--mono); color:var(--dim); margin-left:auto}
  .line .cbadge{margin-left:0}
  .cbadge{font:600 9.5px/1 var(--mono); letter-spacing:.4px; padding:4px 7px; border-radius:6px; border:1px solid transparent}
  .c-resp{color:var(--responsive); background:color-mix(in srgb, var(--responsive) 14%, transparent); border-color:color-mix(in srgb, var(--responsive) 36%, transparent)}
  .c-part{color:var(--amber); background:color-mix(in srgb, var(--amber) 14%, transparent); border-color:color-mix(in srgb, var(--amber) 36%, transparent)}
  .c-irr{color:var(--ember); background:color-mix(in srgb, var(--ember) 14%, transparent); border-color:color-mix(in srgb, var(--ember) 36%, transparent)}
  /* UNCALIBRATED: deliberately muted vs the authoritative verdict badges — a dim,
     dashed amber chip that reads as "not a measured verdict", not a status. */
  .c-uncal{color:var(--amber); background:color-mix(in srgb, var(--amber) 8%, transparent); border-color:color-mix(in srgb, var(--amber) 26%, transparent); border-style:dashed; opacity:.85; font-style:italic; text-transform:none}
  .line.uncal .patch{opacity:.62}
  .line.uncal .ratio{opacity:.62; text-decoration:line-through}
  /* method marker: how trust was established — (cert) vs (self-cal). Deliberately
     quiet (dim, small mono) so it annotates the verdict badge without competing. */
  .cmethod{font-family:var(--mono); font-size:9px; color:var(--dim); opacity:.8; margin-left:1px}
  .lever{font-size:11px; color:var(--dim); line-height:1.4; padding-left:2px; overflow-wrap:anywhere}
  .cfoot{font-family:var(--mono); font-size:10px; color:var(--dim); margin-top:auto; padding-top:2px}

  footer.legend{
    margin:14px clamp(16px,4vw,40px) 28px; padding:16px 18px; border-radius:12px;
    background:var(--panel); border:1px solid var(--border);
  }
  footer .keys{display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; font-size:11.5px; color:var(--dim)}
  footer .keys .badge,footer .keys .cbadge,footer .keys .tag{margin-right:2px}
  footer .gen{margin-top:12px; padding-top:11px; border-top:1px solid var(--hair); font-size:11px; color:var(--dim)}
  @media (max-width:520px){
    .tris{margin-left:0}
    .stat{flex-basis:calc(50% - 5px)}
  }
</style>

<header class="top">
  <h1>PotFoundry — Certification Command Center</h1>
  <p class="sub">0.01 mm true-3D certification campaign · ${DASHBOARD_DATE} · <span class="cov">${esc(cov)}</span></p>
  <div class="chips">${chips}</div>
  <div class="toolbar">
    <span class="tlab">sort</span>
    <button type="button" data-sort="error" class="on">max error</button>
    <button type="button" data-sort="name">name</button>
    <button type="button" data-sort="style">style</button>
    <button type="button" id="theme" class="theme">◑ theme</button>
  </div>
</header>

<main>
  <div id="grid">${cardsHtml}</div>
</main>

<footer class="legend">
  <div class="keys">
    <span class="badge b-green">GREEN</span> ≤ 10 µm certified
    <span class="badge b-drift">DRIFT</span> cert ↮ live
    <span class="cbadge c-resp">RESPONSIVE</span> density certifies
    <span class="cbadge c-part">PARTIAL</span> density + feature
    <span class="cbadge c-irr">IRREDUCIBLE</span> redesign, not density
    <span class="tag t-irr">FULL-SPAN</span><span class="tag t-aniso">ANISOTROPIC</span><span class="tag t-feat">FEATURE-ALIGNED</span> hotspot tags
  </div>
  <div class="gen">generated by <code>potscope dashboard</code> from the truth-layer sidecars · meter scale 0 → 10 µm budget · true-3D error vs the certified analytic target</div>
</footer>

<script>const REPORT = ${dataJson};</script>
<script>
(function(){
  var root = document.documentElement;
  var themeBtn = document.getElementById('theme');
  if (themeBtn) themeBtn.addEventListener('click', function(){
    var cur = root.getAttribute('data-theme');
    var sysDark = !window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next = cur === 'light' ? 'dark' : cur === 'dark' ? 'light' : (sysDark ? 'light' : 'dark');
    root.setAttribute('data-theme', next);
  });
  var grid = document.getElementById('grid');
  if (!grid) return;
  var cards = Array.prototype.slice.call(grid.children);
  var cmp = {
    error: function(a,b){ return (parseFloat(b.dataset.max)||-1) - (parseFloat(a.dataset.max)||-1); },
    name: function(a,b){ return a.dataset.name.localeCompare(b.dataset.name); },
    style: function(a,b){ return a.dataset.style.localeCompare(b.dataset.style) || a.dataset.name.localeCompare(b.dataset.name); }
  };
  var btns = document.querySelectorAll('[data-sort]');
  Array.prototype.forEach.call(btns, function(btn){
    btn.addEventListener('click', function(){
      Array.prototype.forEach.call(btns, function(b){ b.classList.remove('on'); });
      btn.classList.add('on');
      cards.slice().sort(cmp[btn.dataset.sort] || cmp.error).forEach(function(c){ grid.appendChild(c); });
    });
  });
})();
</script>
`;
}

function cmdDashboard(args) {
  const dir = resolve(argValue(args, '--dir') ?? CERTIFIED_STL_DIR());
  const manifestPath = join(HERE, 'certs.manifest.json');
  // Same fresh-clone contract as cmdDoctor: proceed on a committed manifest even
  // when the (git-ignored) certified_stl dir is absent — the report degrades to
  // registry-only rows (hotspots/convergence available:false).
  if (!existsSync(dir) && !existsSync(manifestPath)) {
    console.error(`dashboard: no such dir ${dir} (bake sidecars: PF_CERT_RECON=all) and no committed manifest at ${manifestPath}`);
    process.exit(2);
  }
  const fast = args.flags.includes('--fast');
  const report = buildDoctorReport(dir, { fast, manifestPath });
  const outPath = resolve(argValue(args, '--out') ?? join(HERE, 'dashboard.view.html'));
  const html = dashboardHtml(report);
  writeFileSync(outPath, html);
  const s = report.summary;
  const mb = (n) => (n / 1024 / 1024).toFixed(2);
  console.log(`wrote ${outPath} — ${mb(Buffer.byteLength(html))} MB self-contained (opens offline via file://)`);
  console.log(
    `${s.pots} pots · ${s.green} GREEN · ${s.drift} DRIFT · ${s.masked} max-masked · ` +
      `${s.withIrreducibleConvergence} irreducible-frontier · hotspots ${s.hotspotsAvailable}/${s.pots} · converge ${s.convergeAvailable}/${s.pots}` +
      (fast ? '   [--fast: hotspots elided]' : '')
  );
  if (report.pots.some((p) => p.source === 'manifest')) {
    console.error('(from committed manifest — no on-disk sidecars; hotspots/convergence unavailable until re-baked)');
  }
  const viewName = outPath.split(/[\\/]/).pop();
  console.log(`  serve + open:  node potscope.mjs serve "${dirname(outPath)}"  ->  http://localhost:8099/${viewName}`);
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

const BOOLEAN_FLAGS = new Set(['--ceramic', '--error', '--embed', '--clay', '--json', '--check', '--fast']);

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

// Directory containment for the static file server (Fix D). A bare
// `file.startsWith(dir)` admits a shared-prefix SIBLING — a guard on
// `/x/_certified_stl` lets `/x/_certified_stl_secret/...` slip through. Require the
// resolved request path to EQUAL dir or begin with `dir + path.sep`. Localhost-only
// lab tool, but the correct check is trivial. Exported so the predicate is unit-tested.
export function isInsideDir(file, dir) {
  const resolvedDir = resolve(dir);
  const resolvedFile = resolve(file);
  return resolvedFile === resolvedDir || resolvedFile.startsWith(resolvedDir + sep);
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
      if (!isInsideDir(file, dir) || !existsSync(file) || statSync(file).isDirectory()) {
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
    case 'manifest': cmdManifest(args); break;
    case 'converge': cmdConverge(args); break;
    case 'convergeconfig': cmdConvergeConfig(args); break;
    case 'doctor': cmdDoctor(args); break;
    case 'dashboard': cmdDashboard(args); break;
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
      console.log('  manifest [--dir <certified_stl>] [--out path]   (portable cert snapshot → fresh-clone status)');
      console.log('  converge <name|path> [--json]   (per-patch refine-vs-redesign verdict from the convergence probe)');
      console.log('  convergeconfig <styleId> --relief r --od mm --h mm --ang log2 --vert log2 [--relief-key k] [--name n] [--out path]   (write an arbitrary-config JSON for the probe)');
      console.log('  doctor [--dir <certified_stl>] [--json] [--fast]   (roster health: registry + hotspots + convergence)');
      console.log('  dashboard [--dir <certified_stl>] [--out path] [--fast]   (self-contained certification command center → dashboard.view.html)');
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
