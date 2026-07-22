// _certRosterErrorBake.test.ts — DEV-ONLY. Bakes the per-triangle certifies-at
// error sidecar (<name>.stl.error.bin) for each pot in the PF_G2_POT certified
// roster, so `potscope view <pot>.stl --error` shows a true-3D error overlay for
// EVERY certified pot, the way GothicArches/WaveInterference already do. This is
// also an independent per-triangle re-derivation of each certificate: a pot with
// unconverged triangles or maxMm > budget FAILS its own test (a real finding).
//
// Reuses the exact gate reconstruction (atlas -> tessellate) from ./_certRoster
// and the shared prover from ./_certifiesAtBakeLib — no re-implemented surface
// (the Voronoi hash-desync lesson). HEAVY: prover-grade splits (20000 at/above
// budget) cost ~10-90 min/pot on relief-bearing walls; run one at a time.
//
// Select which pots to bake with PF_CERT_ERRORBAKE:
//   PF_CERT_ERRORBAKE=all              — every roster pot
//   PF_CERT_ERRORBAKE=HarmonicRipple   — only pots whose name contains this substring
//   PF_CERT_ERRORBAKE_FORCE=1          — re-bake even if a sidecar already exists
// Sidecars land in research/exchange/_certified_stl/ next to the STLs.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { tessellateAnnularRadialSolidTargetForCertification } from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';
import { createCompleteMappedGeometryTargetBindingFromSurfaceComplex } from '../../src/geometry/targetSolid/completeMappedArtifactGeometry';
import { createFinalArtifactProofSession } from '../../src/geometry/targetSolid/finalArtifactProofSession';
import { bakeCertifiesAtErrors } from './_certifiesAtBakeLib';
import { atlas, CERTIFIED_POTS } from './_certRoster';

const LADDER_MM = [0.0025, 0.005, 0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64];
const BUDGET_MM = 0.01;
const MAX_DEPTH = 24;
const OUT_DIR = join(__dirname, '..', 'exchange', '_certified_stl');

const SELECTOR = process.env.PF_CERT_ERRORBAKE;
const FORCE = process.env.PF_CERT_ERRORBAKE_FORCE === '1';
const selected = (name: string): boolean =>
  SELECTOR !== undefined &&
  (SELECTOR === 'all' || SELECTOR === '1' || name.toLowerCase().includes(SELECTOR.toLowerCase()));

describe('certified roster — per-triangle error sidecars', () => {
  for (const pot of CERTIFIED_POTS) {
    it.skipIf(!selected(pot.name))(
      `bakes certifies-at overlay for ${pot.name}`,
      { timeout: 10_800_000 },
      () => {
        const stlPath = join(OUT_DIR, `${pot.name}.stl`);
        const sidecarPath = `${stlPath}.error.bin`;
        if (existsSync(sidecarPath) && !FORCE) {
          // eslint-disable-next-line no-console
          console.log(`[probe:cert-errorbake] ${pot.name} SKIP (sidecar exists; PF_CERT_ERRORBAKE_FORCE=1 to redo)`);
          return;
        }
        const startedAt = Date.now();
        const binding = atlas(pot.geometry, pot.styleParams, pot.styleId);
        const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, pot.divisions);
        const freshBytes = Buffer.from(
          tessellation.stlBytes.buffer,
          tessellation.stlBytes.byteOffset,
          tessellation.stlBytes.byteLength
        );

        // Provenance: the sidecar binds to the mesh it was baked from. If the
        // committed STL is byte-identical (deterministic gate, no drift) the
        // sidecar drops in beside it. If it differs, DO NOT clobber the committed
        // certified artifact — write a .regen pair and flag the drift.
        let targetStl = stlPath;
        let provenance = 'matches-committed-stl';
        if (existsSync(stlPath)) {
          if (!readFileSync(stlPath).equals(freshBytes)) {
            targetStl = join(OUT_DIR, `${pot.name}.regen.stl`);
            provenance = 'DRIFT-regen (fresh tessellation != committed STL)';
            writeFileSync(targetStl, freshBytes);
          }
        } else {
          writeFileSync(stlPath, freshBytes);
          provenance = 'wrote-missing-stl';
        }
        const bakeSidecarPath = `${targetStl}.error.bin`;

        const session = createFinalArtifactProofSession(tessellation.stlBytes);
        const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(binding.surfaceComplex);
        const bake = bakeCertifiesAtErrors(binding, tessellation, target.targetSha256, {
          ladderMm: LADDER_MM,
          startLevel: LADDER_MM.indexOf(BUDGET_MM),
          maxDepth: MAX_DEPTH,
          checkSplitsFor: (thresholdMm) => (thresholdMm >= BUDGET_MM ? 20000 : 400),
          onPatchDone: (patchId, patchTriangles, enclosures) =>
            // eslint-disable-next-line no-console
            console.log(
              `[probe:cert-errorbake] ${pot.name} ${patchId} done tris=${patchTriangles}` +
                ` enclosures=${enclosures} elapsedMs=${Date.now() - startedAt}`
            ),
        });

        const sorted = Float32Array.from(bake.errors).sort();
        const quantile = (f: number): number =>
          sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
        const maxMm = sorted[sorted.length - 1];
        const header = JSON.stringify({
          magic: 'potscope-error/v1',
          style: pot.styleId,
          variant: pot.name,
          count: bake.errors.length,
          unitsMm: true,
          semantics: 'certifies-at-level',
          ladderMm: LADDER_MM,
          budgetMm: BUDGET_MM,
          maxDepth: MAX_DEPTH,
          checkSplits: { atOrAboveBudget: 20000, belowBudget: 400 },
          unconverged: bake.unconvergedCount,
          unknownChecks: bake.unknownCheckCount,
          enclosures: bake.enclosureCount,
          decimalFallbacks: bake.decimalFallbackCount,
          stats: { maxMm, p50Mm: quantile(0.5), p99Mm: quantile(0.99) },
          provenance: {
            note: provenance,
            targetSha256: target.targetSha256,
            artifactByteSha256: session.byteSha256,
            parsedTriangleSetSha256: session.parsedTriangleSetSha256,
          },
        });
        writeFileSync(
          bakeSidecarPath,
          Buffer.concat([
            Buffer.from(`${header}\n`, 'utf8'),
            Buffer.from(bake.errors.buffer, 0, bake.errors.byteLength),
          ])
        );
        // eslint-disable-next-line no-console
        console.log(
          `[probe:cert-errorbake] ${pot.name} WROTE ${bakeSidecarPath} tris=${bake.errors.length}` +
            ` maxMm=${maxMm.toFixed(6)} p99Mm=${quantile(0.99).toFixed(6)} p50Mm=${quantile(0.5).toFixed(6)}` +
            ` unconverged=${bake.unconvergedCount} unknownChecks=${bake.unknownCheckCount}` +
            ` enclosures=${bake.enclosureCount} provenance=${provenance} elapsedMs=${Date.now() - startedAt}`
        );

        // Independent per-triangle re-derivation of the 0.01 mm certificate.
        expect(bake.unconvergedCount).toBe(0);
        expect(maxMm).toBeLessThanOrEqual(BUDGET_MM);
      }
    );
  }
});
