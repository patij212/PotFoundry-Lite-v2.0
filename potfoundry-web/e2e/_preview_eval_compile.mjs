// On-hardware compile gate for the preview eval/normal compute pipelines.
// Prereq: generate fixtures first —
//   npx vitest run src/renderers/webgpu/ShaderManager.evalArtifacts.test.ts --environment jsdom
// Then:
//   node e2e/_preview_eval_compile.mjs
// Gate (real hardware): eval_pos <= 20000 ms, norm_from_nbr <= 300 ms, adapter not fallback.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const artDir = fileURLToPath(new URL('./.artifacts/', import.meta.url));
mkdirSync(artDir, { recursive: true });
const evalPos = readFileSync(process.argv[2] || `${artDir}eval_pos.wgsl`, 'utf8');
const neighborNormal = readFileSync(process.argv[3] || `${artDir}neighbor_normal.wgsl`, 'utf8');

// file:// page gives WebGPU a secure context (about:blank/setContent hides navigator.gpu).
const blank = `${artDir}blank.html`;
writeFileSync(blank, '<!doctype html><html><body>gate</body></html>');

const GATE = { evalPosMaxMs: 20000, normMaxMs: 300 };

const browser = await chromium.launch({
  channel: 'msedge', headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'],
});
let failed = false;
try {
  const page = await browser.newPage();
  await page.goto('file:///' + blank);
  const result = await page.evaluate(async ({ evalPos, neighborNormal }) => {
    if (!navigator.gpu) return { error: 'no navigator.gpu' };
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { error: 'no adapter' };
    const info = adapter.info || {};
    const isFallback = adapter.isFallbackAdapter ?? false;
    const device = await adapter.requestDevice();
    const timePipe = async (code, entryPoint) => {
      const module = device.createShaderModule({ code });
      const ci = await module.getCompilationInfo();
      const errs = ci.messages.filter(m => m.type === 'error').map(m => `L${m.lineNum}: ${m.message}`);
      if (errs.length) return { entryPoint, ok: false, ms: 0, errs };
      const t0 = performance.now();
      let ok = true, err = null;
      try { await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint } }); }
      catch (e) { ok = false; err = String(e && e.message || e); }
      return { entryPoint, ok, ms: Math.round(performance.now() - t0), err, errs: [] };
    };
    return {
      vendor: info.vendor, arch: info.architecture, isFallback,
      evalPos: await timePipe(evalPos, 'eval_pos'),
      norm: await timePipe(neighborNormal, 'norm_from_nbr'),
    };
  }, { evalPos, neighborNormal });

  console.log('\n=== PREVIEW EVAL COMPILE GATE ===');
  console.log(JSON.stringify(result, null, 2));
  const checks = [
    ['hardware adapter', result.isFallback === false],
    [`eval_pos ok & <= ${GATE.evalPosMaxMs}ms`, result.evalPos?.ok && result.evalPos.ms <= GATE.evalPosMaxMs],
    [`norm_from_nbr ok & <= ${GATE.normMaxMs}ms`, result.norm?.ok && result.norm.ms <= GATE.normMaxMs],
  ];
  for (const [name, pass] of checks) {
    console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`);
    if (!pass) failed = true;
  }
  console.log('=================================\n');
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
