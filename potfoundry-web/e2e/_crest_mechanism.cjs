// Mechanism probe: classify the SHEAR (F) vs ANISOTROPY of the crest surfaces and
// the feature-line accounting (kind/count), to confirm SpiralRidges=helix-shear vs
// SFB@1=curve-insertion. No Vulkan.
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 400000);
const CASES = [
  { tag: 'SpiralRidges', style: 'SpiralRidges', params: null },
  { tag: 'SFB_s1', style: 'SuperformulaBlossom', params: { sf_strength: 1 } },
  { tag: 'SFB_s0', style: 'SuperformulaBlossom', params: { sf_strength: 0 } },
];
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(l + ' to')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const c of CASES) {
      try {
        await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), c.style), 60000, 'setStyle');
        if (c.params) await wt(page.evaluate((p) => window.__pfFidelity.setStyleParams(p), c.params), 30000, 'setParams');
        const fsh = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseFShear({ targetTriangles: t }), TARGET), 200000, 'fshear');
        const feat = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseFeatures({ targetTriangles: t }), TARGET), 200000, 'feat');
        const kinds = ((feat && (feat.perLine || feat.lines)) || []).reduce((a, l) => { a[l.kind] = (a[l.kind] || 0) + 1; return a; }, {});
        console.log(JSON.stringify({
          tag: c.tag,
          fshear: fsh && {
            maxURatio: Math.round(fsh.maxURatio * 100) / 100,
            maxTRatio: Math.round(fsh.maxTRatio * 100) / 100,
            irredByAxisFrac: Math.round((fsh.irreducibleByAxisFrac || 0) * 1000) / 1000,
            irredByAxisCount: fsh.irreducibleByAxisCount,
            sqSliv: fsh.sliverCountSquare,
            maxSqAspect: Math.round(fsh.maxSquareAspect),
            maxRotAspect: Math.round(fsh.maxRotatedAspect),
            maxRatioEG: Math.round((fsh.maxRatioEG || 0) * 100) / 100,
          },
          features: feat && { expected: feat.expected, present: feat.present, dropped: feat.dropped, kinds },
        }));
      } catch (e) { console.log(`${c.tag}: ${String(e.message || e).slice(0, 160)}`); }
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
