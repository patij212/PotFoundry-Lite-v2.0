// Sliver-localization probe — WHERE are the residual short-wide slivers? Buckets
// the worst sliver triangles by 3D location (base/foot z≈0, rim z≈H, drain r≈rDrain,
// else wall) to tell a FOUNDATION-metric problem from a construction artifact.
// Usage: PF_STYLES=Crystalline,ArtDeco node e2e/_sliver_locate_probe.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);
const SAMPLE = Number(process.env.PF_SAMPLE || 4000);
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 180000);
const styles = (process.env.PF_STYLES || 'Crystalline,ArtDeco')
  .split(',').map((s) => s.trim()).filter(Boolean);
const DIM = process.env.PF_DIM ? JSON.parse(process.env.PF_DIM) : { H: 40, top_od: 300, bottom_od: 280, r_drain: 20 };

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  try {
    const page = await browser.newPage();
    const UBIAS = process.env.PF_UBIAS; // force a specific anisotropy bias (e.g. 0) to bisect
    await page.addInitScript((ub) => {
      window.__pfConforming = true;
      if (ub !== undefined && ub !== '') window.__pfConformingUBias = Number(ub);
    }, UBIAS);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    console.log(`dims=${JSON.stringify(DIM)} sampleLimit=${SAMPLE}`);
    const H = DIM.H, rDrain = DIM.r_drain;
    for (const s of styles) {
      const t0 = Date.now();
      try {
        await withTimeout(page.evaluate((x) => window.__pfFidelity.setStyle(x), s), 60000, `${s} setStyle`);
        await withTimeout(page.evaluate((d) => window.__pfFidelity.setDimensions(d), DIM), 30000, `${s} setDims`);
        const q = await withTimeout(
          page.evaluate((t) => window.__pfFidelity.diagnoseQuality({ targetTriangles: t.t, sampleLimit: t.s }), { t: targetTriangles, s: SAMPLE }),
          PER_OP_MS, `${s} quality`,
        );
        // Bucket worst slivers by location. worst[].centroid=[x,y,z]; aspect3D.
        const worst = (q.worst || []).filter((w) => w.aspect3D > 100);
        const buckets = { base: 0, rim: 0, drain: 0, wallSeam: 0, wall: 0 };
        const zEps = H * 0.03, rEps = 6;
        let zmin = 1e9, zmax = -1e9, rmin = 1e9, rmax = -1e9;
        for (const w of worst) {
          const [x, y, z] = w.centroid;
          const r = Math.hypot(x, y);
          zmin = Math.min(zmin, z); zmax = Math.max(zmax, z);
          rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
          if (r <= rDrain + rEps && z <= H * 0.5) buckets.drain++;
          else if (z <= zEps) buckets.base++;
          else if (z >= H - zEps) buckets.rim++;
          else buckets.wall++;
        }
        console.log(
          `${s.padEnd(18)} sliverCount=${q.sliverCount} maxAspect=${q.maxAspect3D.toFixed(1)} ` +
          `sampledSlivers=${worst.length} | base=${buckets.base} rim=${buckets.rim} drain=${buckets.drain} wall=${buckets.wall} ` +
          `| z[${zmin.toFixed(1)},${zmax.toFixed(1)}] r[${rmin.toFixed(0)},${rmax.toFixed(0)}] (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
        );
      } catch (e) {
        console.log(`${s.padEnd(18)} ERROR ${(e && e.message ? e.message : String(e)).slice(0, 80)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      }
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
