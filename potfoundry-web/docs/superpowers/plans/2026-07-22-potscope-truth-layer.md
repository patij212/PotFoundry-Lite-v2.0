# potscope Truth Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "synthesize truth" layer to potscope — a residual-characterization `hotspots` command, a generated certificate `status` registry with a staleness guard, and a style-agnostic `decode` — all fed by one cheap `_certRoster` reconstruct pass.

**Architecture:** A vitest/TS bridge harness rebuilds each certified pot (`atlas → tessellate`, the cheap prefix of the error bake — no enclosure loop) and emits two self-describing sidecars next to the STL: `loc.bin` (per-triangle patch + per-vertex normalized `(u,v)`) and `recon.json` (fresh provenance hashes + drift verdict). Zero-dependency `potscope.mjs` then reads those sidecars + the existing `error.bin` and does all interpretation (clustering, structural classification, registry join). The language boundary enforces "no re-implemented surface": only the TS side runs the style source; potscope only reads files.

**Tech Stack:** TypeScript + Vitest (bridge harness, `research/bridge/`, run via `npx vitest run`); zero-dependency Node ESM + `node:test` (potscope, `research/tools/potscope/`, run via `node --test`). No new npm dependencies.

## Global Constraints

- **No new npm dependencies.** potscope is `node potscope.mjs` with zero deps; keep it so. The bridge harness may import only from `src/` and `node:*`.
- **potscope never re-implements the analytic surface.** It reads sidecars/STL/ledger only. All surface evaluation stays on the TS side (the Voronoi hash-desync lesson: copies drift).
- **ESLint 0-max-warnings** on every `.ts`/`.tsx` file (a `PostToolUse` hook runs `eslint --max-warnings=0` after each edit; any warning fails CI). No unused vars, no un-disabled `any`. `.mjs` files are not hook-linted but must match existing `potscope.mjs` style.
- **`(u,v)` normalization is fixed:** `Number(numerator) / (Number(oddDenominatorFactor ?? '1') * 2 ** fractionBits)`, both fields read from the partition. Numerators are decimal strings.
- **Sidecars are count-bound and provenance-bound.** A reader MUST refuse a triangle-count mismatch, and `hotspots` MUST refuse when `error.bin` and `loc.bin` carry different `provenance.artifactByteSha256`.
- **Certified-config truth only.** No production-default column, no convergence-slope probe (both explicitly deferred in the spec).
- **Commit message trailer:** every commit ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Deviation from the spec (deliberate)

The spec placed `featureLoci` in `recon.json` (derived on the TS side from `pot.divisions`). This plan moves feature-locus derivation **into the potscope reader** (`hotspots` derives dense-grid loci from the `loc.bin` `(u,v)` distribution itself). Rationale: cleaner separation — the TS side emits raw geometry (patch + uv), the reader does *all* interpretation, including "what is a feature." `recon.json` therefore drops the `featureLoci` field. FEATURE-ALIGNED is honestly a density heuristic (documented as such), so it belongs with the other reader-side heuristics, not baked into the emitter.

## File Structure

**Create:**
- `research/bridge/_certRosterReconstructLib.ts` — pure reconstruct logic: `reconstructPot()`, `normalizeNumerator()`, `configDigest()`, verdict computation. Imports `src/` + `node:crypto`. One responsibility: turn a `CertifiedPot` into `{provenance, locBuffer, verdict}`.
- `research/bridge/_certRosterReconstruct.test.ts` — vitest driver: the standing drift **guard-gate** (asserts no committed pot drifts) + env-gated **sidecar writer** (`PF_CERT_RECON`).

**Modify:**
- `research/tools/potscope/potscope.mjs` — add readers (`readLoc`, `readErrorRaw`), math (`triAnisotropy`), clustering (`weldClusters`), classifier (`classifyCluster`, `deriveFeatureLoci`), and commands (`hotspots`, `status`); enrich `decode`.
- `research/tools/potscope/_potscope.test.mjs` — `node --test` cases for every new pure function.
- `research/tools/potscope/README.md` — document the three new surfaces + the reconstruct spine.

**Emitted artifacts (not committed — regenerated):** `<name>.stl.loc.bin`, `<name>.recon.json` in `research/exchange/_certified_stl/`.

---

## Phase 1 — the reconstruct spine

### Task 1: reconstruct library (`normalizeNumerator`, `reconstructPot`, `configDigest`)

**Files:**
- Create: `research/bridge/_certRosterReconstructLib.ts`
- Test: `research/bridge/_certRosterReconstruct.test.ts` (unit portion only in this task)

**Interfaces:**
- Consumes: `atlas`, `CERTIFIED_POTS`, `CertifiedPot` from `./_certRoster`; `tessellateAnnularRadialSolidTargetForCertification` from `../../src/geometry/targetSolid/annularSolidReferenceTessellation`; `createCompleteMappedGeometryTargetBindingFromSurfaceComplex` from `../../src/geometry/targetSolid/completeMappedArtifactGeometry`; `createFinalArtifactProofSession` from `../../src/geometry/targetSolid/finalArtifactProofSession`.
- Produces:
  - `normalizeNumerator(numeratorStr: string, fractionBits: number, oddFactorStr?: string): number`
  - `configDigest(pot: CertifiedPot): string` (sha256 hex of canonical config JSON)
  - `reconstructPot(pot: CertifiedPot): ReconstructResult` where
    `ReconstructResult = { stlBytes: Buffer; triangleCount: number; provenance: Provenance; patches: string[]; locBuffer: Buffer }`
    and `Provenance = { targetSha256: string; artifactByteSha256: string; parsedTriangleSetSha256: string }`.
  - `loc.bin` layout: JSON header line + `\n` + `Float32LE` body, 7 floats/triangle in `artifactTriangleIndex` order: `[patchIdx, u0, v0, u1, v1, u2, v2]`. Header: `{ magic:"potscope-loc/v1", style, variant, count, patches:[...], provenance }`.

- [ ] **Step 1: Write the failing unit test** (append to a fresh `research/bridge/_certRosterReconstruct.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeNumerator,
  configDigest,
  reconstructPot,
} from './_certRosterReconstructLib';
import { CERTIFIED_POTS } from './_certRoster';

describe('reconstruct lib — pure', () => {
  it('normalizes a numerator over oddFactor * 2^fractionBits into [0,1]', () => {
    // dyadic: 3 / 2^3 = 0.375
    expect(normalizeNumerator('3', 3)).toBeCloseTo(0.375, 12);
    // odd factor: 5 / (3 * 2^2) = 5/12
    expect(normalizeNumerator('5', 2, '3')).toBeCloseTo(5 / 12, 12);
  });

  it('configDigest is stable and order-independent for a pot', () => {
    const pot = CERTIFIED_POTS[0];
    expect(configDigest(pot)).toBe(configDigest(pot));
    expect(configDigest(pot)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('reconstruct lib — one small pot', () => {
  it('emits a loc buffer with count == triangleCount and (u,v) in [0,1]', () => {
    const pot = CERTIFIED_POTS.find((p) => p.name === 'HarmonicRipple_small_OD30');
    if (!pot) throw new Error('roster missing HarmonicRipple_small_OD30');
    const r = reconstructPot(pot);
    const nl = r.locBuffer.indexOf(0x0a);
    const header = JSON.parse(r.locBuffer.subarray(0, nl).toString('utf8'));
    expect(header.magic).toBe('potscope-loc/v1');
    expect(header.count).toBe(r.triangleCount);
    // COPY the body — the payload starts at an unaligned offset (nl+1), so a
    // Float32Array view over r.locBuffer.buffer would throw. Same pattern readLoc uses.
    const body = new Float32Array(r.triangleCount * 7);
    Buffer.from(body.buffer).set(r.locBuffer.subarray(nl + 1, nl + 1 + r.triangleCount * 7 * 4));
    for (let t = 0; t < r.triangleCount; t += 1) {
      for (let k = 0; k < 3; k += 1) {
        const u = body[t * 7 + 1 + k * 2];
        const v = body[t * 7 + 2 + k * 2];
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(r.provenance.targetSha256).toMatch(/^[0-9a-f]{64}$/);
  }, 60_000);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `potfoundry-web/`): `npx vitest run research/bridge/_certRosterReconstruct.test.ts`
Expected: FAIL — `Cannot find module './_certRosterReconstructLib'`.

- [ ] **Step 3: Write the library**

Create `research/bridge/_certRosterReconstructLib.ts`:

```ts
// _certRosterReconstructLib.ts — the cheap prefix of the certifies-at bake:
// atlas -> tessellate (NO enclosure loop), producing per-triangle localization
// (loc.bin) and freshly recomputed provenance hashes for the staleness guard.
// Reuses the shared roster (./_certRoster) and the same target/proof-session
// machinery the error bake uses — no re-implemented surface.
import { createHash } from 'node:crypto';
import { tessellateAnnularRadialSolidTargetForCertification } from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';
import { createCompleteMappedGeometryTargetBindingFromSurfaceComplex } from '../../src/geometry/targetSolid/completeMappedArtifactGeometry';
import { createFinalArtifactProofSession } from '../../src/geometry/targetSolid/finalArtifactProofSession';
import { atlas, type CertifiedPot } from './_certRoster';

export interface Provenance {
  readonly targetSha256: string;
  readonly artifactByteSha256: string;
  readonly parsedTriangleSetSha256: string;
}

export interface ReconstructResult {
  readonly stlBytes: Buffer;
  readonly triangleCount: number;
  readonly provenance: Provenance;
  readonly patches: string[];
  readonly locBuffer: Buffer;
}

export function normalizeNumerator(
  numeratorStr: string,
  fractionBits: number,
  oddFactorStr?: string
): number {
  const denominator = Number(oddFactorStr ?? '1') * 2 ** fractionBits;
  return Number(numeratorStr) / denominator;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function configDigest(pot: CertifiedPot): string {
  const canonical = canonicalJson({
    geometry: pot.geometry,
    styleParams: pot.styleParams,
    divisions: pot.divisions,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function reconstructPot(pot: CertifiedPot): ReconstructResult {
  const binding = atlas(pot.geometry, pot.styleParams, pot.styleId);
  const tessellation = tessellateAnnularRadialSolidTargetForCertification(
    binding,
    pot.divisions
  );
  const stlBytes = Buffer.from(
    tessellation.stlBytes.buffer,
    tessellation.stlBytes.byteOffset,
    tessellation.stlBytes.byteLength
  );
  const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
    binding.surfaceComplex
  );
  const session = createFinalArtifactProofSession(tessellation.stlBytes);
  const provenance: Provenance = {
    targetSha256: target.targetSha256,
    artifactByteSha256: session.byteSha256,
    parsedTriangleSetSha256: session.parsedTriangleSetSha256,
  };

  const patches = tessellation.partitions.map((partition) => partition.patchId);
  const patchIndex = new Map(patches.map((id, i) => [id, i]));
  const count = tessellation.triangleCount;
  const body = new Float32Array(count * 7);
  for (const partition of tessellation.partitions) {
    const pIdx = patchIndex.get(partition.patchId);
    if (pIdx === undefined) throw new Error(`unindexed patch ${partition.patchId}`);
    const oddFactor = partition.oddDenominatorFactor;
    for (const tri of partition.triangles) {
      const base = tri.artifactTriangleIndex * 7;
      body[base] = pIdx;
      for (let k = 0; k < 3; k += 1) {
        body[base + 1 + k * 2] = normalizeNumerator(
          tri.vertices[k].uNumerator,
          partition.fractionBits,
          oddFactor
        );
        body[base + 2 + k * 2] = normalizeNumerator(
          tri.vertices[k].vNumerator,
          partition.fractionBits,
          oddFactor
        );
      }
    }
  }

  const header = JSON.stringify({
    magic: 'potscope-loc/v1',
    style: pot.styleId,
    variant: pot.name,
    count,
    patches,
    provenance,
  });
  const locBuffer = Buffer.concat([
    Buffer.from(`${header}\n`, 'utf8'),
    Buffer.from(body.buffer, 0, body.byteLength),
  ]);

  return { stlBytes, triangleCount: count, provenance, patches, locBuffer };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run research/bridge/_certRosterReconstruct.test.ts`
Expected: PASS (3 tests). If the `(u,v)` range assertion fails, the normalization denominator is wrong — re-check `partition.fractionBits`/`oddDenominatorFactor` against `exactDyadicDomainPartition.ts:77-90` before touching anything else.

- [ ] **Step 5: Commit**

```bash
git add research/bridge/_certRosterReconstructLib.ts research/bridge/_certRosterReconstruct.test.ts
git commit -m "research(potscope): reconstruct lib — cheap atlas->tessellate loc.bin + provenance

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: sidecar writer + standing drift guard-gate

**Files:**
- Modify: `research/bridge/_certRosterReconstruct.test.ts` (add the driver `describe` block)
- Create at runtime: `<name>.stl.loc.bin`, `<name>.recon.json` in `research/exchange/_certified_stl/`

**Interfaces:**
- Consumes: `reconstructPot`, `configDigest` (Task 1); `CERTIFIED_POTS` from `./_certRoster`.
- Produces: `recon.json` shape `{ name, style, tris, configDigest, provenance, verdict, recorded }` where `verdict ∈ "GREEN" | "DRIFT" | "STL-MISSING"` and `recorded` is the provenance triple copied from the committed `error.bin` header (or `null`). The guard asserts no committed pot yields `DRIFT`.

- [ ] **Step 1: Write the failing test.** Add the two imports below to the **existing import block at the top** of `_certRosterReconstruct.test.ts` (ESLint `import/first` forbids mid-file imports), add `Provenance` to the existing `./_certRosterReconstructLib` import, then append the `describe` block after the Task 1 blocks.

```ts
// --- add to the top import block ---
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// and extend the lib import: import { normalizeNumerator, configDigest, reconstructPot, type Provenance } from './_certRosterReconstructLib';

const OUT_DIR = join(__dirname, '..', 'exchange', '_certified_stl');
const RECON_SELECTOR = process.env.PF_CERT_RECON;
const reconSelected = (name: string): boolean =>
  RECON_SELECTOR !== undefined &&
  (RECON_SELECTOR === 'all' ||
    name.toLowerCase().includes(RECON_SELECTOR.toLowerCase()));

type Verdict = 'GREEN' | 'DRIFT' | 'STL-MISSING';

function committedProvenance(errPath: string): Provenance | null {
  if (!existsSync(errPath)) return null;
  const raw = readFileSync(errPath);
  const nl = raw.indexOf(0x0a);
  const hdr = JSON.parse(raw.subarray(0, nl).toString('utf8'));
  return hdr.provenance ?? null;
}

describe('reconstruct driver — guard + writer', () => {
  for (const pot of CERTIFIED_POTS) {
    it(
      `guard: ${pot.name} does not drift from committed STL`,
      { timeout: 120_000 },
      () => {
        const stlPath = join(OUT_DIR, `${pot.name}.stl`);
        if (!existsSync(stlPath)) {
          // eslint-disable-next-line no-console
          console.log(`[probe:recon] ${pot.name} STL-MISSING (skip guard)`);
          return;
        }
        const result = reconstructPot(pot);
        const recorded = committedProvenance(`${stlPath}.error.bin`);
        const committed = readFileSync(stlPath);
        let verdict: Verdict;
        let targetStl = stlPath;
        if (!committed.equals(result.stlBytes)) {
          verdict = 'DRIFT';
          targetStl = join(OUT_DIR, `${pot.name}.regen.stl`);
        } else if (
          recorded &&
          recorded.targetSha256 !== result.provenance.targetSha256
        ) {
          verdict = 'DRIFT';
        } else {
          verdict = 'GREEN';
        }

        if (reconSelected(pot.name)) {
          if (verdict === 'DRIFT' && targetStl.endsWith('.regen.stl')) {
            writeFileSync(targetStl, result.stlBytes);
          }
          writeFileSync(`${targetStl}.loc.bin`, result.locBuffer);
          writeFileSync(
            join(OUT_DIR, `${pot.name}.recon.json`),
            JSON.stringify(
              {
                name: pot.name,
                style: pot.styleId,
                tris: result.triangleCount,
                configDigest: configDigest(pot),
                provenance: result.provenance,
                verdict,
                recorded,
              },
              null,
              2
            )
          );
          // eslint-disable-next-line no-console
          console.log(
            `[probe:recon] ${pot.name} ${verdict} tris=${result.triangleCount} wrote loc.bin+recon.json`
          );
        }

        expect(verdict, `${pot.name} drifted from committed STL`).not.toBe('DRIFT');
      }
    );
  }
});
```

- [ ] **Step 2: Run the guard on the committed roster (no writes yet)**

Run: `npx vitest run research/bridge/_certRosterReconstruct.test.ts`
Expected: PASS. Pots with a committed STL assert GREEN; pots without log `STL-MISSING` and return. If any real pot reports DRIFT, that is a genuine finding — STOP and report it (the committed certificate no longer reproduces), do not "fix" the test.

- [ ] **Step 3: Emit sidecars for the certified roster**

Run: `PF_CERT_RECON=all npx vitest run research/bridge/_certRosterReconstruct.test.ts`
Expected: PASS; each committed pot logs `[probe:recon] <name> GREEN ... wrote loc.bin+recon.json`. Verify one pair exists:

Run: `ls research/exchange/_certified_stl/*.loc.bin research/exchange/_certified_stl/*.recon.json | head`
Expected: `loc.bin` + `recon.json` for the committed pots.

- [ ] **Step 4: Sanity-check a loc.bin count against its STL**

Run: `node -e "const fs=require('fs');const p='research/exchange/_certified_stl/HarmonicRipple_small_OD30.stl';const stl=fs.readFileSync(p);const loc=fs.readFileSync(p+'.loc.bin');const nl=loc.indexOf(10);const h=JSON.parse(loc.subarray(0,nl));console.log('stl tris',stl.readUInt32LE(80),'loc count',h.count,'match',stl.readUInt32LE(80)===h.count)"`
Expected: `match true`.

- [ ] **Step 5: Commit** (the harness only — the `.loc.bin`/`.recon.json` are regenerated artifacts, not committed)

```bash
git add research/bridge/_certRosterReconstruct.test.ts
git commit -m "research(potscope): reconstruct driver — sidecar writer + standing drift guard-gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 2 — hotspots (headline)

### Task 3: potscope sidecar readers (`readLoc`, `readErrorRaw`)

**Files:**
- Modify: `research/tools/potscope/potscope.mjs`
- Test: `research/tools/potscope/_potscope.test.mjs`

**Interfaces:**
- Produces:
  - `readLoc(path): { header, body }` — `body` is `Float32Array`, 7/tri `[patchIdx,u0,v0,u1,v1,u2,v2]`.
  - `readErrorRaw(path): { header, values }` — `values` is `Float32Array`, 1/tri (mm).
  - Both throw on wrong magic; callers cross-check counts + provenance.

- [ ] **Step 1: Write the failing test** (append to `_potscope.test.mjs`)

```js
import { readLoc, readErrorRaw } from './potscope.mjs';

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
```

- [ ] **Step 2: Run to verify it fails**

Run (from `potfoundry-web/`): `node --test research/tools/potscope/_potscope.test.mjs`
Expected: FAIL — `readLoc`/`readErrorRaw` not exported.

- [ ] **Step 3: Add the readers to `potscope.mjs`** (after `readPack`, near the other parsers)

```js
export function readLoc(path) {
  const raw = readFileSync(path);
  const nl = raw.indexOf(0x0a);
  const header = JSON.parse(raw.subarray(0, nl).toString('utf8'));
  if (header.magic !== 'potscope-loc/v1') throw new Error(`bad loc magic: ${header.magic}`);
  const body = new Float32Array(header.count * 7);
  Buffer.from(body.buffer).set(raw.subarray(nl + 1, nl + 1 + header.count * 7 * 4));
  return { header, body };
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test research/tools/potscope/_potscope.test.mjs`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add research/tools/potscope/potscope.mjs research/tools/potscope/_potscope.test.mjs
git commit -m "research(potscope): loc.bin + error.bin raw readers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: residual geometry — `triAnisotropy` + `weldClusters`

**Files:**
- Modify: `research/tools/potscope/potscope.mjs`
- Test: `research/tools/potscope/_potscope.test.mjs`

**Interfaces:**
- Produces:
  - `triAnisotropy(px, uv): number` — `px` = 9 xyz floats, `uv` = 6 floats `[u0,v0,u1,v1,u2,v2]`. Returns `sqrt(λmax/λmin)` of the surface metric (first fundamental form) — 1 for isometric, large for anisotropic stretch, `Infinity`/`NaN` guarded for degenerate uv.
  - `weldClusters(positions, hotIndices): number[][]` — connected components of hot triangles that share a welded xyz vertex. Returns arrays of triangle indices.

- [ ] **Step 1: Write the failing test** (append to `_potscope.test.mjs`)

```js
import { triAnisotropy, weldClusters } from './potscope.mjs';

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test research/tools/potscope/_potscope.test.mjs`
Expected: FAIL — `triAnisotropy`/`weldClusters` not exported.

- [ ] **Step 3: Add the math + clustering to `potscope.mjs`**

```js
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test research/tools/potscope/_potscope.test.mjs`
Expected: PASS (all prior + 2 new).

- [ ] **Step 5: Commit**

```bash
git add research/tools/potscope/potscope.mjs research/tools/potscope/_potscope.test.mjs
git commit -m "research(potscope): surface-metric anisotropy + welded hot-triangle clustering

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: classifier + `hotspots` command

**Files:**
- Modify: `research/tools/potscope/potscope.mjs`
- Test: `research/tools/potscope/_potscope.test.mjs`

**Interfaces:**
- Consumes: `readLoc`, `readErrorRaw`, `parseStl`, `triAnisotropy`, `weldClusters`.
- Produces:
  - `deriveFeatureLoci(locBody, count): { u: number[], v: number[] }` — normalized axis positions where the grid is locally dense (a density heuristic for feature lines).
  - `classifyCluster(triIndices, ctx): { shape, tags, lever, u, v, uExtent, vExtent, peak, mean, anisotropy }` where `shape ∈ "SPIKE"|"BAND"|"DIFFUSE"`, `tags ⊆ {"IRREDUCIBLE","ANISOTROPIC","FEATURE-ALIGNED"}`, `lever` is a string, and `ctx = { positions, locBody, errors, budget, featureLoci }`.
  - `cmdHotspots(args)` — CLI: `hotspots <name|stl> [--top N] [--budget mm] [--json]`.

- [ ] **Step 1: Write the failing classifier tests** (append to `_potscope.test.mjs`)

```js
import { classifyCluster, deriveFeatureLoci } from './potscope.mjs';

// helper: build parallel positions/locBody/errors arrays for N triangles.
// place() returns a tiny scene where triangle t has uv centroid (uc,vc), a small
// uv footprint, xyz = uv mapped to a plane scaled by (sx,sy), and error e.
function scene(specs /* [{uc,vc,e,sx=1,sy=1}] */) {
  const n = specs.length;
  const positions = new Float32Array(n * 9);
  const locBody = new Float32Array(n * 7);
  const errors = new Float32Array(n);
  specs.forEach((s, t) => {
    const sx = s.sx ?? 1, sy = s.sy ?? 1, h = 0.004;
    const uv = [s.uc, s.vc, s.uc + h, s.vc, s.uc, s.vc + h];
    locBody[t * 7] = 0;
    for (let k = 0; k < 3; k += 1) { locBody[t * 7 + 1 + k * 2] = uv[k * 2]; locBody[t * 7 + 2 + k * 2] = uv[k * 2 + 1]; }
    const xyz = [uv[0] * sx, uv[1] * sy, 0, uv[2] * sx, uv[3] * sy, 0, uv[4] * sx, uv[5] * sy, 0];
    positions.set(xyz, t * 9);
    errors[t] = s.e;
  });
  return { positions, locBody, errors, budget: 0.01, featureLoci: { u: [], v: [] } };
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

test('deriveFeatureLoci finds a dense column among sparse ones', () => {
  // sparse u at 0,0.25,0.5,0.75 plus a dense trio near 0.5
  const us = [0, 0.25, 0.5, 0.75, 0.5, 0.505, 0.51];
  const body = new Float32Array(us.length * 7);
  us.forEach((u, t) => { for (let k = 0; k < 3; k += 1) body[t * 7 + 1 + k * 2] = u; });
  const loci = deriveFeatureLoci(body, us.length);
  assert.ok(loci.u.some((u) => Math.abs(u - 0.5) < 0.02), `u loci ${loci.u}`);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test research/tools/potscope/_potscope.test.mjs`
Expected: FAIL — `classifyCluster`/`deriveFeatureLoci` not exported.

- [ ] **Step 3: Add the classifier + feature-loci + command to `potscope.mjs`**

```js
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
  anisoCorr: 0.3,
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
  const hot = [];
  for (let t = 0; t < parsed.triangleCount; t += 1) if (err.values[t] >= hotThresh) hot.push(t);
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
```

- [ ] **Step 4: Wire `hotspots` into the CLI dispatcher** (`main()` switch + usage text)

In `main()`'s `switch (command)`, add:
```js
    case 'hotspots': cmdHotspots(args); break;
```
And add to the default-help block:
```js
      console.log('  hotspots <name|stl> [--top N] [--budget mm] [--json]   (residual structure)');
```

- [ ] **Step 5: Run the classifier tests**

Run: `node --test research/tools/potscope/_potscope.test.mjs`
Expected: PASS (all prior + 4 new). If SPIKE/BAND/ANISOTROPIC mis-classify, adjust only `HOTSPOT_THRESHOLDS` — the fixtures encode the intended boundaries.

- [ ] **Step 6: Smoke-test on a real certified pot** (requires Task 2 sidecars present)

Run: `node research/tools/potscope/potscope.mjs hotspots research/exchange/_certified_stl/GeometricStar_H32_OD30_fract`
Expected: prints ranked clusters; the known chevron residual should read as a `BAND` (likely `IRREDUCIBLE`/`ANISOTROPIC`) on `outer-wall`. Record the actual output in the commit message as the smoke evidence.

- [ ] **Step 7: Commit**

```bash
git add research/tools/potscope/potscope.mjs research/tools/potscope/_potscope.test.mjs
git commit -m "research(potscope): hotspots — residual structural classifier (spike/band/aniso/feature)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 3 — status registry + guard

### Task 6: `status` command

**Files:**
- Modify: `research/tools/potscope/potscope.mjs`
- Test: `research/tools/potscope/_potscope.test.mjs`

**Interfaces:**
- Produces:
  - `buildStatusRows(dir): Row[]` where `Row = { name, style, tris, configDigest, maxMm, p99Mm, masked, commit, verdict }`. Reads `*.recon.json` + sibling `*.stl.error.bin` header + optional `*.certificate.txt` in `dir`.
  - `cmdStatus(args)` — CLI: `status [<substr>] [--check] [--json]`; `--check` exits 1 if any row is `DRIFT`.

- [ ] **Step 1: Write the failing test** (append to `_potscope.test.mjs`)

```js
import { buildStatusRows } from './potscope.mjs';
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test research/tools/potscope/_potscope.test.mjs`
Expected: FAIL — `buildStatusRows` not exported.

- [ ] **Step 3: Add `buildStatusRows` + `cmdStatus` to `potscope.mjs`**

```js
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
      if (maxMm && p99Mm && maxMm / p99Mm > 3) masked = true;
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

function cmdStatus(args) {
  const dir = resolve(argValue(args, '--dir') ?? join(HERE, '..', '..', 'exchange', '_certified_stl'));
  if (!existsSync(dir)) { console.error(`status: no such dir ${dir} (bake sidecars first: PF_CERT_RECON=all)`); process.exit(2); }
  const substr = args._[0];
  let rows = buildStatusRows(dir);
  if (substr) rows = rows.filter((r) => r.name.toLowerCase().includes(substr.toLowerCase()));
  if (args.flags.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); return; }
  const um = (mm) => (mm == null ? '   —' : (mm * 1000).toFixed(1));
  console.log('style/variant                                  tris     maxµm  p99µm  commit    verdict');
  for (const r of rows) {
    const flag = r.masked ? ' ⚠MASK' : '';
    console.log(`${r.name.padEnd(46)} ${String(r.tris).padStart(8)}  ${um(r.maxMm).padStart(5)}  ${um(r.p99Mm).padStart(5)}  ${(r.commit ?? '—').padEnd(8)}  ${r.verdict}${flag}`);
  }
  const drift = rows.filter((r) => r.verdict === 'DRIFT');
  console.log(`\n${rows.length} pots · ${rows.filter((r) => r.verdict === 'GREEN').length} GREEN · ${drift.length} DRIFT · ${rows.filter((r) => r.masked).length} max-masked`);
  if (args.flags.includes('--check') && drift.length > 0) {
    console.error(`FAIL: ${drift.length} drifted certificate(s): ${drift.map((r) => r.name).join(', ')}`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Wire `status` into the CLI** (`main()` switch + help)

```js
    case 'status': cmdStatus(args); break;
```
```js
      console.log('  status [<substr>] [--check] [--json]   (certificate registry + drift guard)');
```

- [ ] **Step 5: Run tests + smoke the real registry**

Run: `node --test research/tools/potscope/_potscope.test.mjs`
Expected: PASS.
Run: `node research/tools/potscope/potscope.mjs status`
Expected: a table of the committed certified pots with GREEN verdicts (sidecars from Task 2). Confirm `--check` exits 0:
Run: `node research/tools/potscope/potscope.mjs status --check; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 6: Commit**

```bash
git add research/tools/potscope/potscope.mjs research/tools/potscope/_potscope.test.mjs
git commit -m "research(potscope): status — generated certificate registry + drift guard + mask flag

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 4 — decode enrichment

### Task 7: loc-backed, style-agnostic `decode`

**Files:**
- Modify: `research/tools/potscope/potscope.mjs` (`cmdDecode`)
- Test: `research/tools/potscope/_potscope.test.mjs`

**Interfaces:**
- Produces: `resolveTriFromLoc(locPath, globalTri): { patch, vertices:[{u,v}×3] }` — exact per-triangle resolution from a `loc.bin`. `cmdDecode` gains `--pot <name>`: when a sibling `loc.bin` exists it uses this (style-agnostic) instead of the Gothic model; Gothic `mechanismHints` fire only when the loc header's `style` is `GothicArches`.

- [ ] **Step 1: Write the failing test** (append to `_potscope.test.mjs`)

```js
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
```
(Reuses the `writeLoc` helper from Task 3.)

- [ ] **Step 2: Run to verify it fails**

Run: `node --test research/tools/potscope/_potscope.test.mjs`
Expected: FAIL — `resolveTriFromLoc` not exported.

- [ ] **Step 3: Add `resolveTriFromLoc` and branch `cmdDecode`**

Add:
```js
export function resolveTriFromLoc(locPath, globalTri) {
  const { header, body } = readLoc(locPath);
  if (globalTri < 0 || globalTri >= header.count) throw new Error(`tri ${globalTri} out of range 0..${header.count - 1}`);
  const patchIdx = body[globalTri * 7];
  const vertices = [0, 1, 2].map((k) => ({ u: body[globalTri * 7 + 1 + k * 2], v: body[globalTri * 7 + 2 + k * 2] }));
  return { patch: header.patches[patchIdx] ?? `patch${patchIdx}`, style: header.style, vertices };
}
```
Then, near the top of `cmdDecode`, after `const triMatch = line.match(/tri=(\d+)/);`, add a loc-backed branch:
```js
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test research/tools/potscope/_potscope.test.mjs`
Expected: PASS. Also confirm the legacy path is intact (no `--pot`):
Run: `node research/tools/potscope/potscope.mjs decode 'tri=5 uv=(0.5,0.5)'`
Expected: unchanged legacy behavior (tricount-offset patch note + Gothic hints).

- [ ] **Step 5: Commit**

```bash
git add research/tools/potscope/potscope.mjs research/tools/potscope/_potscope.test.mjs
git commit -m "research(potscope): decode --pot — loc-backed style-agnostic tri resolution

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 5 — docs + ledger

### Task 8: README + ledger/memory note

**Files:**
- Modify: `research/tools/potscope/README.md`

- [ ] **Step 1: Document the three surfaces + spine** — add a `## Truth layer` section to the README

```markdown
## Truth layer (2026-07-22)

potscope now synthesizes truth, not just captures/renders it. One cheap bridge
pass rebuilds each certified pot (`atlas → tessellate`, no enclosure bake) and
emits sidecars next to the STL; the three commands below read them.

Bake the sidecars (seconds/pot):
    PF_CERT_RECON=all npx vitest run research/bridge/_certRosterReconstruct.test.ts
This also runs the standing drift guard: any committed pot whose fresh
tessellation ≠ committed STL (or whose target hash moved) FAILS the test.

    node potscope.mjs hotspots <name|stl> [--top N] [--budget mm] [--json]
        Ranks the worst residual clusters and CLASSIFIES each — SPIKE / BAND
        (+IRREDUCIBLE when it spans an axis) / ANISOTROPIC (surface-metric
        stretch, the M=g/h² signal) / FEATURE-ALIGNED — and names the mesher
        lever each points at. Needs <name>.stl.error.bin + <name>.stl.loc.bin.

    node potscope.mjs status [<substr>] [--check] [--json]
        Generated certificate registry: style · tris · maxµm · p99µm · commit ·
        verdict (GREEN/DRIFT). ⚠MASK flags max/p99 > 3× (the "certify on MAX"
        canary). --check exits nonzero on any DRIFT. --json regenerates the
        all20-status-truth table instead of hand-typing it.

    node potscope.mjs decode '<line>' --pot <name>
        Now loc-backed: resolves tri=<global> → patch + per-vertex (u,v) from the
        sidecar (exact, style-agnostic). Gothic mechanism hints fire only for
        GothicArches; the other 19 styles are no longer silently mis-modeled.

Sidecars: `potscope-loc/v1` = per-triangle [patchIdx, per-vertex (u,v)];
`recon.json` = fresh provenance triple + drift verdict + config digest. Both are
generated artifacts — regenerate, don't commit.
```

- [ ] **Step 2: Update the `## Notes` bullet about `decode` being Gothic-specific**

Replace the existing note:
```markdown
- The style analytics in `decode` are Gothic-specific today (spring/archHeight/
  RIB_OFFSETS/H32 remap constants); extend `STYLE_ANALYTICS` for the next style
  on the certification ladder.
```
with:
```markdown
- `decode --pot <name>` is now style-agnostic via the loc.bin sidecar (exact
  patch + per-vertex uv). The hardcoded Gothic `mechanismHints` model is retained
  ONLY as an optional enrichment for GothicArches — it is no longer the resolver.
  `hotspots` is the general (style-agnostic) residual analyzer.
```

- [ ] **Step 3: Verify docs are coherent**

Run: `node research/tools/potscope/potscope.mjs` (no args)
Expected: the help block lists `hotspots` and `status`. Cross-check the README commands match the help text exactly.

- [ ] **Step 4: Commit**

```bash
git add research/tools/potscope/README.md
git commit -m "research(potscope): document the truth layer (hotspots/status/decode + reconstruct spine)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Append a ledger entry recording the tool addition**

Run:
```bash
node research/tools/potscope/potscope.mjs ledger add '{"kind":"tooling","note":"truth layer shipped: hotspots (residual structural classifier), status (generated cert registry + drift guard), loc-backed decode; fed by _certRosterReconstruct spine","date":"2026-07-22"}'
```
Expected: `appended`.

---

## Spec coverage map (self-review)

| Spec section | Task |
|---|---|
| Reconstruct spine (`loc.bin` + `recon.json`, cheap atlas→tessellate) | Task 1, 2 |
| `hotspots` — clustering + structural classification (SPIKE/BAND/ANISOTROPIC/FEATURE) | Task 4, 5 |
| — sidecar provenance cross-check before join | Task 5 (`cmdHotspots`) |
| — metric-distortion (first fundamental form) anisotropy | Task 4 (`triAnisotropy`) |
| `status` — generated registry + max-masking flag + `--check` drift guard | Task 6 |
| standing drift guard-gate (all committed pots GREEN) | Task 2 |
| `decode` — loc-backed, Gothic-gated hints | Task 7 |
| Testing (fixtures for each class; readers; guard fires) | Tasks 1–7 (TDD throughout) |
| Docs (README three surfaces + spine) | Task 8 |
| Non-goals honored (no prod column, no convergence probe, no re-implemented surface, no auto-bake) | design-level; nothing in any task violates them |

**Deviation logged:** `featureLoci` derivation moved from `recon.json` (TS side) to `deriveFeatureLoci` in the reader (Task 5) — see "Deviation from the spec" above.
