/**
 * THROWAWAY probe — validates the pre-refine coincident-vertex weld.
 * Runs the FULL parametric pipeline (does NOT stop after source diagnostics) so
 * adaptiveRefine executes, then streams the [PRE-REFINE-WELD], PRE-REFINE-CANON,
 * [POST-REFINE-CANON] and validateMesh lines to confirm the boundary-edge
 * amplification (base ~10K -> refined ~137K) collapses after the weld.
 * Delete after the weld is validated.
 *
 * Dev server must be on :3001.  npx playwright test _gothic_weld --project=chromium
 */
import { test, expect } from '@playwright/test';

interface PfApi {
  listStyles(): string[];
  isReady(): boolean;
  setStyle(s: string): Promise<void>;
  measure(o: { targetTriangles: number; referenceTriangles: number }): Promise<unknown>;
}

declare global {
  interface Window {
    __pfFidelity?: PfApi;
  }
}

test('GothicArches pre-refine weld validation', async ({ browser }) => {
  test.setTimeout(20 * 60 * 1000);
  const page = await browser.newPage();
  const logs: string[] = [];
  const stamp = () => new Date().toISOString().slice(14, 23);
  page.on('console', (m) => logs.push(`${stamp()} ${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`${stamp()} PAGEERROR: ${e.message}\n${e.stack ?? ''}`));
  page.on('crash', () => logs.push(`${stamp()} PAGE CRASHED`));

  // NOTE: deliberately does NOT set __pfStopAfterSourceDiagnostics, so the full
  // pipeline (base-gen -> refine -> tail fills -> validateMesh) runs to completion.
  logs.push(`${stamp()} >>> MODE: full-pipeline weld validation`);

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
      new Promise((_, rej) => setTimeout(() => rej(new Error('CAP_1080s')), 1_080_000)),
    ]);
  } catch (e) {
    outcome = e instanceof Error ? e.message : String(e);
  }
  logs.push(`${stamp()} >>> outcome: ${outcome}`);

  try {
    const stageLog = await page.evaluate(
      () => (window as unknown as { __pfStageLog?: string[] }).__pfStageLog ?? [],
    );
    logs.push(`${stamp()} >>> __pfStageLog (${stageLog.length} entries):`);
    for (const line of stageLog) logs.push(`    ${line}`);
  } catch (e) {
    logs.push(`${stamp()} >>> failed to read __pfStageLog: ${e instanceof Error ? e.message : String(e)}`);
  }

  // eslint-disable-next-line no-console
  console.log('\n========= GOTHIC WELD LOG =========\n' + logs.join('\n') + '\n===================================\n');
  await page.close().catch(() => {});
  expect(true).toBe(true);
});
