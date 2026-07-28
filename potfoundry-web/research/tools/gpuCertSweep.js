// gpuCertSweep.js — the page-side driver for the GPU certification sweep. RESEARCH ONLY.
//
// WHY THIS FILE EXISTS AT ALL. WebGPU needs a secure context and there is no Node binding in this repo, so
// the GPU ruler can only run inside the page. For two sessions this driver lived in browser console scratch,
// and the cost was exactly what you would predict: a ~40-minute sweep was lost when the pane closed, and
// the survivor table in the re-audit's §15e is not reproducible because the loop that produced it was never
// written down. The instrument (gpuRuler.js) was always on disk; the thing that EXERCISES it was not.
//
// Usage from the page console:
//    const S = await import('/research/tools/gpuCertSweep.js');
//    S.run();                                  // resume with defaults
//    S.run({ gnIters: 3, levels: [12,48,192] });
//    S.state();                                // read checkpoints without running
//    S.reset();                                // clear checkpoints
//
// Durability: every row is checkpointed to localStorage as it completes, and progress is POSTed to the
// statusSink (research/tools/statusSink.cjs) so a background Monitor can wake the agent on failure.

const KEY = 'pfCertGN';
const SINK = 'http://127.0.0.1:4599/';
const D = '/research/exchange/_strataConformBisect/';

export const ROWS = [
  ['LowPolyFacet', 'lowpolyfacet_ring_D--.stl'],
  ['SuperformulaBlossom', 'superformulablossom_ring_D--.stl'],
  ['RippleInterference', 'rippleinterference_ring_D--.stl'],
  ['SuperellipseMorph', 'superellipsemorph_ring_D--.stl'],
  ['WaveInterference', 'waveinterference_ring_D--.stl'],
  ['HexagonalHive', 'hexagonalhive_ring_D--.stl'],
  ['FourierBloom', 'fourierbloom_ring_D--.stl'],
  ['BambooSegments', 'bamboosegments_ring_D--.stl'],
  ['SpiralRidges', 'spiralridges_ring_D--.stl'],
  ['HarmonicRipple', 'harmonicripple_D--.stl'],
  ['ArtDeco', 'artdeco_ring_D--.stl'],
  ['DragonScales', 'dragonscales_ring_D--.stl'],
];

const post = (s) => { try { fetch(SINK, { method: 'POST', body: s, mode: 'cors', keepalive: true }).catch(() => {}); } catch { /* sink is optional */ } };
const load = () => JSON.parse(localStorage.getItem(KEY) || '{}');
const save = (o) => localStorage.setItem(KEY, JSON.stringify(o));

/**
 * The resume key INCLUDES the configuration, not just the style name.
 *
 * The mesher already learned this: `PF_CB_TAG_SUFFIX` exists because "two runs that differ only by an env
 * knob would share a filename and the second would silently destroy the first". A resume that keys on style
 * alone has the same hazard in the other direction — it SKIPS a row that was certified under different
 * settings, and the resulting table silently mixes configurations. Keying on the config makes a settings
 * change re-run the affected rows instead of inheriting stale ones.
 */
export const cfgKey = (o) => `L${o.levels.join('.')}_gn${o.gnIters}_c${o.chunkSamples}_tol${o.tolMm}`;

export function state() { return load(); }
export function reset() { localStorage.removeItem(KEY); return 'cleared'; }

async function loadStl(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  const n = dv.getUint32(80, true);
  const a = new Float32Array(n * 9);
  for (let t = 0; t < n; t += 1) {
    const o = 84 + t * 50 + 12;
    for (let k = 0; k < 9; k += 1) a[t * 9 + k] = dv.getFloat32(o + k * 4, true);
  }
  return { a, n };
}

export async function run(opts = {}) {
  const G = await import(`/research/gpu/gpuRuler.js?v=${Date.now()}`);
  // levels stops at 192 by default: per-thread cost is O(n^2) and n=768 exceeds the GPU watchdog on its own,
  // at ANY batch size (measured: device lost at n=768 with a batch of TWO triangles). See gpuRuler.js.
  const cfg = { levels: [12, 48, 192], gnIters: 2, chunkSamples: 4e7, tolMm: 0.01, marginMm: 0.001, rows: ROWS, ...opts };
  const ck = cfgKey(cfg);
  let dev = await G.makeDevice();

  if (window.__certHb) clearInterval(window.__certHb);
  window.__cert = { stage: 'run', row: '(starting)', cfg: ck };
  // Heartbeat so SILENCE becomes detectable: a caught device loss posts its own error, but a tab or
  // GPU-process crash posts nothing. NB Chrome throttles timers in hidden tabs, so treat a heartbeat gap as
  // a hint, not proof of death — ROW-DONE / ROW-ERR / HALTED are the trustworthy signals.
  window.__certHb = setInterval(() => post(`HEARTBEAT row=${window.__cert.row}`), 60000);
  const stop = () => clearInterval(window.__certHb);

  post(`SWEEP-START ${ck}`);
  for (const [style, f] of cfg.rows) {
    const st = load();
    if (st[style] && st[style].cfg === ck && !st[style].err) { post(`SKIP ${style}`); continue; }
    window.__cert.row = style;
    try {
      if (!(await navigator.gpu.requestAdapter())) {
        st.__halted__ = { at_style: style, why: 'no adapter' }; save(st);
        post(`HALTED ${style} no-adapter — reload the page and re-run to resume`); stop(); return st;
      }
    } catch (e) {
      st.__halted__ = { at_style: style, why: String(e).slice(0, 90) }; save(st);
      post(`HALTED ${style} ${String(e).slice(0, 90)}`); stop(); return st;
    }
    post(`ROW-START ${style}`);
    try {
      const { a, n } = await loadStl(D + f);
      const ctx = await G.styleContext(style);
      const t0 = performance.now();
      const r = await G.certifyMeshGpu(dev, ctx, a, n, cfg);
      const rec = {
        cfg: ck, nTri: n, certified: r.certified, survivors: r.nSurvivors,
        pct: +((100 * r.nSurvivors) / n).toFixed(4),
        rounds: r.rounds.map((x) => `${x.n}:${x.survivors}`).join(' → '),
        wallS: +((performance.now() - t0) / 1000).toFixed(1),
      };
      const cur = load(); cur[style] = rec; save(cur);
      post(`ROW-DONE ${style} certified=${rec.certified} survivors=${rec.survivors}/${n} (${rec.pct}%) wall=${rec.wallS}s`);
    } catch (e) {
      const cur = load(); cur[style] = { cfg: ck, err: String(e).slice(0, 120) }; save(cur);
      post(`ROW-ERR ${style} ${String(e).slice(0, 110)}`);
      try { dev = await G.makeDevice(); } catch {
        const c2 = load(); c2.__halted__ = { at_style: style, why: 'device unrecoverable' }; save(c2);
        post(`HALTED ${style} device-unrecoverable — reload the page and re-run to resume`); stop(); return c2;
      }
    }
  }
  const fin = load(); fin.__done__ = { at: new Date().toISOString(), cfg: ck }; save(fin);
  post('SWEEP-DONE'); stop(); window.__cert.stage = 'done';
  return fin;
}

/**
 * Measure real dispatch wall-time at a given (level, batch) so the chunk budget can be CALIBRATED rather
 * than modelled. The eval-count model is only a proxy for time — GN adds transcendentals and register
 * pressure, so effective throughput at n=192 is well below the simple-kernel peak.
 */
export async function calibrate(style = 'RippleInterference', file = 'rippleinterference_ring_D--.stl', probes = [[192, 40], [192, 80], [192, 214], [192, 400]]) {
  const G = await import(`/research/gpu/gpuRuler.js?v=${Date.now()}`);
  const dev = await G.makeDevice();
  const { a } = await loadStl(D + file);
  const ctx = await G.styleContext(style);
  const out = [];
  // warm the pipeline first so the first probe is not charged a shader compile
  await G.screenTriangles(dev, ctx, a.subarray(0, 8 * 9), 8, { n: 192, gnIters: 2, closureEps: 1e-6 });
  for (const [n, batch] of probes) {
    const r = await G.screenTriangles(dev, ctx, a.subarray(0, batch * 9), batch, { n, gnIters: 2, closureEps: 1e-6 });
    const samples = batch * (((n + 1) * (n + 2)) / 2);
    out.push({ n, batch, ms: r.computeMs, evalsPerSec: Math.round((samples * 25) / (r.computeMs / 1000)) });
  }
  return out;
}
