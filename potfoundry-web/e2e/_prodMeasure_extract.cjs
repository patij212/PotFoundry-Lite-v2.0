// _prodMeasure_extract.cjs — DEV-ONLY. Extract the PRODUCTION shipping export mesh (parametric → conforming
// whole-mesh path, the default since the 2026-06-11 dominance checkpoint: conformingMesher=true,
// surfaceFidelityExact=false) for all 20 styles at the research-scorecard dims {H:120,Rb:40,Rt:50,expn:1}.
// Sets NEITHER hatch — the shipping default already routes to the conforming path.
//
// COST: each generateMesh runs the conforming assembly (~5–8 min/style in THIS env; the budget cap is IGNORED for
// smooth styles — HarmonicRipple emits ~4.9M tris at a 100k request). So we do EXACTLY ONE generate per style:
// _debugOuterMesh (conforming outer-wall submesh). It gives BOTH the outer-wall bins (true-3D fidelity + triangle
// quality, scored in Node/labkit) AND, since it is the WHOLE pot filtered by the outer-wall mask, is watertight-
// auditable on its own only as an open surface — whole-pot watertight is captured separately for a spot subset.
// Node scoring (labkit true-3D + brute-anchor + raw/weld watertight) is a SEPARATE probe on these bins.
//
// Outputs to research/exchange/_prodmeasure/:  <style>.outer.xyz.bin (f32), <style>.outer.idx.bin (u32),
//   <style>.diag.json (outerTris, evalVerts from the ParametricExport dispatch log, wallMs).
//
// Env: PF_PRODMEASURE=1, PF_BASE_URL (default http://127.0.0.1:3011/ — DEV server, hook via import.meta.env.DEV),
//      PF_STYLES (comma list), PF_BUDGET (targetTriangles; default undefined = profile 'high' default),
//      PF_WHOLE=1 (also dump the whole-pot mesh for watertight — DOUBLES cost; use on a subset).
const { chromium } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const path = require('path');

if (process.env.PF_PRODMEASURE !== '1') { console.log('PF_PRODMEASURE!=1 — skip'); process.exit(0); }

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3011/';
const OUT = path.join(__dirname, '..', 'research', 'exchange', '_prodmeasure');
fs.mkdirSync(OUT, { recursive: true });
const BUDGET = process.env.PF_BUDGET ? Number(process.env.PF_BUDGET) : undefined;
const WANT_WHOLE = process.env.PF_WHOLE === '1';
const DIMS = { H: 120, top_od: 100, bottom_od: 80, t_wall: 3, t_bottom: 3, r_drain: 10, expn: 1,
               bellAmp: 0, spinTurns: 0, spinPhase: 0, spinCurve: 1 };

// Binary out via exposeBinding (the app's NetworkMonitor wraps window.fetch and breaks a cross-origin POST, so
// no HTTP sink). Node receives (name, base64Chunk, done); appends to the file. The page base64-chunks each buffer.
const CHUNK = 24 * 1024 * 1024; // 24MB raw per chunk

let lastEvalVerts = null;
const onConsole = (m) => {
  const t = m.text();
  const em = t.match(/Eval batch split: ([\d,]+) vertices/);
  if (em) lastEvalVerts = Number(em[1].replace(/,/g, ''));
  const em2 = t.match(/Evaluating ([\d,]+) vertices/);
  if (em2) lastEvalVerts = Number(em2[1].replace(/,/g, ''));
  if (/Generation failed|memory access out of bounds|Decimator.*failed|RangeError|out of memory/i.test(t)) console.log('  [pg-err]', t.slice(0, 220));
};
const dumpBinding = (_src, name, b64, first) => { fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64'), { flag: first ? 'w' : 'a' }); return true; };

(async () => {
  let browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  let page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.exposeBinding('__pfDump', dumpBinding);
  page.on('console', onConsole);
  page.on('pageerror', (e) => console.log('  [PAGEERROR]', String(e).slice(0, 250)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 120000 });

  let styles = await page.evaluate(() => window.__pfFidelity.listStyles());
  if (process.env.PF_STYLES) { const only = new Set(process.env.PF_STYLES.split(',')); styles = styles.filter((s) => only.has(s)); }
  console.log(`styles (${styles.length}): ${styles.join(', ')}`);

  for (const style of styles) {
    const diagPath = path.join(OUT, `${style}.diag.json`);
    const outerXyz = path.join(OUT, `${style}.outer.xyz.bin`);
    // Skip a style already scored (bins present) OR already recorded as a persistent error/timeout (unless PF_RETRY).
    if (!process.env.PF_FORCE && fs.existsSync(diagPath)) {
      const okBins = fs.existsSync(outerXyz);
      let isErr = false;
      try { isErr = Boolean(JSON.parse(fs.readFileSync(diagPath, 'utf8')).error); } catch (_) { /* */ }
      if (okBins) { console.log(`${style}: on disk — skip`); continue; }
      if (isErr && !process.env.PF_RETRY) { console.log(`${style}: recorded error — skip (PF_RETRY=1 to retry)`); continue; }
    }
    const t0 = Date.now();
    lastEvalVerts = null;
    try {
      process.stdout.write(`${style}: setStyle+dims... `);
      await page.evaluate((s) => window.__pfFidelity.setStyle(s), style);
      await page.evaluate((d) => window.__pfFidelity.setDimensions(d), DIMS);
      process.stdout.write(`generate(outer)... `);
      const STYLE_TIMEOUT_MS = Number(process.env.PF_STYLE_TIMEOUT_MS || 11 * 60 * 1000);
      let timedOut = false;
      const meshInfo = await Promise.race([
        page.evaluate(async ({ style, budget, wantWhole, CHUNK }) => {
        // base64 without spread (avoids call-stack overflow on big buffers)
        const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
        const post = async (name, buf) => {
          const u8 = new Uint8Array(buf);
          for (let off = 0, first = true; off < u8.length || first; off += CHUNK, first = false) {
            const slice = u8.subarray(off, Math.min(off + CHUNK, u8.length));
            await window.__pfDump(name, toB64(slice), off === 0);
            if (off + CHUNK >= u8.length) break;
          }
        };
        const sub = await window.__pfFidelity._debugOuterMesh(budget);
        if (!sub) return { error: 'null outer mesh' };
        const xyz = sub.vertices instanceof Float32Array ? sub.vertices : Float32Array.from(sub.vertices);
        const idx = sub.indices instanceof Uint32Array ? sub.indices : Uint32Array.from(sub.indices);
        await post(`${style}.outer.xyz.bin`, xyz.buffer.slice(xyz.byteOffset, xyz.byteOffset + xyz.byteLength));
        await post(`${style}.outer.idx.bin`, idx.buffer.slice(idx.byteOffset, idx.byteOffset + idx.byteLength));
        const r = { outerVerts: xyz.length / 3, outerTris: idx.length / 3 };
        if (wantWhole) {
          const m = await window.__pfFidelity.getMeshForRender(budget);
          if (m) {
            const wx = m.vertices instanceof Float32Array ? m.vertices : Float32Array.from(m.vertices);
            const wi = m.indices instanceof Uint32Array ? m.indices : Uint32Array.from(m.indices);
            await post(`${style}.whole.xyz.bin`, wx.buffer.slice(wx.byteOffset, wx.byteOffset + wx.byteLength));
            await post(`${style}.whole.idx.bin`, wi.buffer.slice(wi.byteOffset, wi.byteOffset + wi.byteLength));
            r.wholeTris = wi.length / 3;
          }
        }
        return r;
        }, { style, budget: BUDGET, wantWhole: WANT_WHOLE, CHUNK }),
        new Promise((resolve) => setTimeout(() => { timedOut = true; resolve({ error: 'TIMEOUT ' + STYLE_TIMEOUT_MS + 'ms — style exceeded per-style budget' }); }, STYLE_TIMEOUT_MS)),
      ]);
      const wallMs = Date.now() - t0;
      if (timedOut) {
        console.log(`${style}: TIMEOUT (${(wallMs / 1000).toFixed(0)}s) — relaunching browser`);
        fs.writeFileSync(diagPath, JSON.stringify({ style, error: meshInfo.error, evalVerts: lastEvalVerts, wallMs }, null, 2));
        try { await browser.close(); } catch (_) { /* */ }
        browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
        page = await browser.newPage({ viewport: { width: 800, height: 600 } });
        await page.exposeBinding('__pfDump', dumpBinding);
        page.on('console', onConsole);
        page.on('pageerror', (e) => console.log('  [PAGEERROR]', String(e).slice(0, 250)));
        await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 120000 });
        continue;
      }
      if (meshInfo.error) {
        console.log(`${style}: ${meshInfo.error} (${(wallMs / 1000).toFixed(0)}s)`);
        fs.writeFileSync(diagPath, JSON.stringify({ style, error: meshInfo.error, evalVerts: lastEvalVerts, wallMs }, null, 2));
        continue;
      }
      const record = { style, dims: DIMS, budget: BUDGET ?? 'profile-high-default', ...meshInfo, evalVerts: lastEvalVerts, wallMs };
      fs.writeFileSync(diagPath, JSON.stringify(record, null, 2));
      console.log(`outerTris=${meshInfo.outerTris}${meshInfo.wholeTris ? ` wholeTris=${meshInfo.wholeTris}` : ''} evalVerts=${lastEvalVerts} (${(wallMs / 1000).toFixed(0)}s)`);
    } catch (e) {
      console.log(`${style}: FAILED — ${String(e).slice(0, 250)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      fs.writeFileSync(diagPath, JSON.stringify({ style, error: String(e).slice(0, 400), evalVerts: lastEvalVerts, wallMs: Date.now() - t0 }, null, 2));
    }
  }
  await browser.close();
  console.log('extract done');
})().catch((e) => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
