/**
 * THROWAWAY isolation probe — localizes WHERE GothicArches (and the 13 cascade
 * styles) hang in generateMesh. Loads ?fidelity=1, sets GothicArches, then runs
 * measure() racing a 900s cap, capturing ALL page console + pageerror + crash.
 * The last [ParametricExport]/[AdaptiveRefinement] line before the cap localizes
 * the hanging stage. Delete after the root cause is pinned.
 *
 * Dev server must be on :3001.  npx playwright test _gothic_isolation --project=chromium
 */
import { test, expect } from '@playwright/test';

interface PfApi {
  listStyles(): string[];
  isReady(): boolean;
  setStyle(s: string): Promise<void>;
  measure(o: { targetTriangles: number; referenceTriangles: number }): Promise<unknown>;
}

interface TailDiagnosticStage {
  name: string;
  elapsedMs: number;
  trianglesBefore: number;
  trianglesAfter: number;
  outerTrianglesBefore: number;
  outerTrianglesAfter: number;
  details: Record<string, string | number | boolean>;
}

interface SourceTopologySampleVertex {
  index: number;
  kind: 'grid' | 'chain' | 'phantom';
  chainId?: number;
  u: number;
  t: number;
  surface: number;
}

interface SourceTopologySample {
  count: number;
  perimeter?: boolean;
  classKey: string;
  orientation: 'vertical' | 'horizontal' | 'diagonal';
  v0: SourceTopologySampleVertex;
  v1: SourceTopologySampleVertex;
  incidents: Array<{ triOffset: number; opposite: SourceTopologySampleVertex; provenance?: string }>;
}

interface SourceTopologyCounts {
  boundaryEdges: number;
  perimeterBoundaryEdges: number;
  interiorBoundaryEdges: number;
  nonManifoldEdges: number;
  byClass: Record<string, number>;
  byEndpointClass: Record<string, number>;
  byOrientation: Record<string, number>;
  boundarySamples: SourceTopologySample[];
  nonManifoldSamples: SourceTopologySample[];
}

interface SourceTopologyDiagnostic {
  label: string;
  vertexCount: number;
  triangleCount: number;
  raw: SourceTopologyCounts;
  uvCanonical: SourceTopologyCounts;
}

declare global {
  interface Window {
    __pfFidelity?: PfApi;
    __pfTailDiagnostics?: TailDiagnosticStage[];
    __pfEnableSourceDiagnostics?: boolean;
    __pfStopAfterSourceDiagnostics?: boolean;
    __pfSourceDiagnostics?: SourceTopologyDiagnostic[];
  }
}

test('GothicArches generateMesh stage localization', async ({ browser }) => {
  test.setTimeout(18 * 60 * 1000);
  const page = await browser.newPage();
  const logs: string[] = [];
  const stamp = () => new Date().toISOString().slice(14, 23);
  page.on('console', (m) => logs.push(`${stamp()} ${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`${stamp()} PAGEERROR: ${e.message}\n${e.stack ?? ''}`));
  page.on('crash', () => logs.push(`${stamp()} PAGE CRASHED`));

  const noMicro = process.env.PF_NO_MICROROWS === '1';
  if (noMicro) {
    await page.addInitScript(() => { (window as unknown as { __PF_NO_MICROROWS?: boolean }).__PF_NO_MICROROWS = true; });
  }
  await page.addInitScript(() => {
    window.__pfEnableSourceDiagnostics = true;
    window.__pfStopAfterSourceDiagnostics = true;
    window.__pfSourceDiagnostics = [];
  });
  logs.push(`${stamp()} >>> MODE: micro-rows ${noMicro ? 'DISABLED' : 'ENABLED (baseline)'}`);

  await page.goto('/?fidelity=1');
  await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', { timeout: 90000 });
  await page.waitForFunction(() => window.__pfFidelity!.isReady() === true, { timeout: 90000 });

  await page.evaluate((s) => window.__pfFidelity!.setStyle(s), 'GothicArches');
  logs.push(`${stamp()} >>> setStyle(GothicArches) returned, starting measure()`);

  let outcome = '';
  const startMs = Date.now();
  try {
    await Promise.race([
      page.evaluate(
        ({ t, r }) => window.__pfFidelity!.measure({ targetTriangles: t, referenceTriangles: r }),
        { t: 500_000, r: 8_000_000 },
      ).then((res) => {
        outcome = `measure RESOLVED after ${((Date.now() - startMs) / 1000).toFixed(1)}s :: ${JSON.stringify(res)}`;
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('CAP_900s')), 900_000)),
    ]);
  } catch (e) {
    outcome = e instanceof Error ? e.message : String(e);
  }
  logs.push(`${stamp()} >>> outcome: ${outcome}`);

  // The TEMP-TJPROBE inner-loop deadline throws TJPROBE_DEADLINE ~90s into
  // repairOuterWallTJunctions, unwinding the sync block so the page thread is free.
  // Read window.__pfStageLog now to recover the per-sub-pass / inner-loop timings.
  try {
    const stageLog = await page.evaluate(
      () => (window as unknown as { __pfStageLog?: string[] }).__pfStageLog ?? [],
    );
    logs.push(`${stamp()} >>> __pfStageLog (${stageLog.length} entries):`);
    for (const line of stageLog) logs.push(`    ${line}`);
  } catch (e) {
    logs.push(`${stamp()} >>> failed to read __pfStageLog: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const tailDiagnostics = await page.evaluate(() => window.__pfTailDiagnostics ?? []);
    logs.push(`${stamp()} >>> __pfTailDiagnostics (${tailDiagnostics.length} entries):`);
    for (const stage of tailDiagnostics) {
      logs.push(
        `    ${stage.name} ${stage.elapsedMs.toFixed(1)}ms ` +
        `tris=${stage.trianglesBefore}->${stage.trianglesAfter} ` +
        `outer=${stage.outerTrianglesBefore}->${stage.outerTrianglesAfter} ` +
        JSON.stringify(stage.details),
      );
    }
  } catch (e) {
    logs.push(`${stamp()} >>> failed to read __pfTailDiagnostics: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const sourceDiagnostics = await page.evaluate(() => window.__pfSourceDiagnostics ?? []);
    logs.push(`${stamp()} >>> __pfSourceDiagnostics (${sourceDiagnostics.length} entries):`);
    for (const diagnostic of sourceDiagnostics) {
      const topEntries = (record: Record<string, number>, limit: number): string =>
        Object.entries(record)
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, limit)
          .map(([key, value]) => `${key}:${value}`)
          .join(',');
      const aggregateKinds = (record: Record<string, number>): Record<string, number> => {
        const aggregated: Record<string, number> = {};
        for (const [key, value] of Object.entries(record)) {
          const kindKey = key.replace(/C\d+/g, 'C');
          aggregated[kindKey] = (aggregated[kindKey] ?? 0) + value;
        }
        return aggregated;
      };
      const fmtCounts = (counts: SourceTopologyCounts): string =>
        `boundary=${counts.boundaryEdges} interior=${counts.interiorBoundaryEdges} ` +
        `perimeter=${counts.perimeterBoundaryEdges} nonMan=${counts.nonManifoldEdges} ` +
        `kindTop=${topEntries(aggregateKinds(counts.byClass), 8)} ` +
        `endpointTop=${topEntries(counts.byEndpointClass, 8)} ` +
        `orient=${topEntries(counts.byOrientation, 4)}`;
      logs.push(
        `    ${diagnostic.label} verts=${diagnostic.vertexCount} tris=${diagnostic.triangleCount} ` +
        `raw{${fmtCounts(diagnostic.raw)}} uvCanon{${fmtCounts(diagnostic.uvCanonical)}}`,
      );
      const sampleLines = (name: string, samples: SourceTopologySample[]): void => {
        logs.push(`      ${name}:`);
        for (const sample of samples.slice(0, 8)) {
          const v = (p: SourceTopologySampleVertex): string =>
            `${p.kind}${p.chainId === undefined ? '' : p.chainId}@${p.index}(${p.u.toFixed(5)},${p.t.toFixed(5)},s${p.surface})`;
          const incidents = sample.incidents
            .map((incident) => `${incident.triOffset}:${v(incident.opposite)}:${incident.provenance ?? 'unknown'}`)
            .join('|');
          logs.push(`        count=${sample.count} ${sample.perimeter ? 'perimeter' : 'interior'} ${sample.classKey} ${sample.orientation} ${v(sample.v0)}-${v(sample.v1)} inc=${incidents}`);
        }
      };
      sampleLines('raw interior boundary samples', diagnostic.raw.boundarySamples);
      sampleLines('raw nonMan samples', diagnostic.raw.nonManifoldSamples);
      sampleLines('uvCanon interior boundary samples', diagnostic.uvCanonical.boundarySamples);
      sampleLines('uvCanon nonMan samples', diagnostic.uvCanonical.nonManifoldSamples);
    }
  } catch (e) {
    logs.push(`${stamp()} >>> failed to read __pfSourceDiagnostics: ${e instanceof Error ? e.message : String(e)}`);
  }

  // eslint-disable-next-line no-console
  console.log('\n========= GOTHIC ISOLATION LOG =========\n' + logs.join('\n') + '\n========================================\n');
  await page.close().catch(() => {});
  expect(true).toBe(true);
});
