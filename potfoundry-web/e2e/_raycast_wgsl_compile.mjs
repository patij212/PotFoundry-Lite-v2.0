// Standalone WGSL compile check: composes getRaycastWGSL(9) via the app's own
// ShaderManager (Vite-served module) and compiles it on a FRESH device —
// no SceneManager warmup contention, full compilationInfo.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  headless: false,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'],
});
const page = await browser.newPage();
await page.goto('http://localhost:3000/?preview=mesh'); // app boots, no raycast contention
await page.waitForTimeout(3000);
const result = await page.evaluate(async () => {
  const mod = await import('/src/renderers/webgpu/ShaderManager.ts');
  const sm = mod.ShaderManager.getInstance();
  const wgsl = sm.getRaycastWGSL(9);
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const t0 = performance.now();
  const module = device.createShaderModule({ code: wgsl });
  const info = await module.getCompilationInfo();
  const msgs = info.messages.map((m) => `${m.type} L${m.lineNum}:${m.linePos} ${m.message}`);
  if (msgs.some((m) => m.startsWith('error'))) return { phase: 'module', msgs: msgs.slice(0, 10) };
  const t1 = performance.now();
  try {
    await Promise.race([
      device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs_raycast' },
        fragment: { module, entryPoint: 'fs_raycast', targets: [{ format: 'rgba16float', blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }] },
        primitive: { topology: 'triangle-list' },
        depthStencil: { depthWriteEnabled: true, depthCompare: 'always', format: 'depth24plus' },
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('pipeline timeout 90s')), 90_000)),
    ]);
    return { phase: 'ok', moduleMs: Math.round(t1 - t0), pipelineMs: Math.round(performance.now() - t1), msgs };
  } catch (e) {
    return { phase: 'pipeline', error: String(e), msgs };
  }
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
