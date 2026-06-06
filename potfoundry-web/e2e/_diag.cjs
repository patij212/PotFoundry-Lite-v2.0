const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu','--enable-features=Vulkan,UseSkiaRenderer'] });
  const p = await b.newPage();
  p.on('requestfailed', r => console.log('REQFAIL', r.url().slice(0,120), r.failure() && r.failure().errorText));
  p.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url().slice(0,120)); });
  p.on('console', m => { const t = m.text(); if (/error|fail|webgpu|pipeline|dawn|adapter|device/i.test(t)) console.log('CON', t.slice(0,160)); });
  await p.goto('http://127.0.0.1:3001/?fidelity=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 60000 }).catch(()=>console.log('no __pfFidelity'));
  for (let i = 0; i < 24; i++) {
    const s = await p.evaluate(() => { try { return { ready: window.__pfFidelity && window.__pfFidelity.isReady(), gpu: !!navigator.gpu }; } catch(e){ return {err:String(e)}; } });
    console.log('t='+(i*5)+'s', JSON.stringify(s));
    if (s.ready) break;
    await new Promise(r=>setTimeout(r,5000));
  }
  await b.close();
})().catch(e=>{console.error(String(e).slice(0,200)); process.exit(1);});
