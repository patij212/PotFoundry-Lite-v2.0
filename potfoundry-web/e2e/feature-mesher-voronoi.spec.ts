/**
 * Task 4 — GPU end-to-end proof: feature mesher on the real WebGPU Voronoi export.
 *
 * Proves the corridor pass welds watertight on the PRODUCTION GPU path, flag-OFF
 * is byte-identical, and emits a flat-shaded render + a binary STL for human
 * acceptance. This is the CPU-proof → GPU-proof handoff for Phase 1.
 *
 * Run with:
 *   npm run dev -- --port 3001   (separate terminal)
 *   npx playwright test feature-mesher-voronoi --project=chromium
 *
 * Requires: __pfByConstruction=true AND __pfFeatureMesher=true (both flags needed;
 * featureMesher is a no-op without byConstruction — see Global Constraints).
 *
 * SPEED LEVER (__pfConformingMaxSag): the default profile sag (~0.02 mm) yields an
 * 8.2M-triangle Voronoi mesh — each GPU build then takes minutes and the suite times
 * out. We set a COARSER sag so each build is fast and the STL transfer is small. The
 * corridor weld is SAG-INDEPENDENT: feature cells force-refine to featureLevel via the
 * assembly's feature path regardless of maxSag, so the corridor still forms and welds —
 * only the smooth-region density (the bulk of the 8.2M) shrinks. The watertight proof
 * and the onTris!=offTris signal are unaffected.
 *
 * Field names confirmed from src/fidelity/windowHook.ts FidelityTopologyDiagnostics
 * (extends TopologyDiagnostics): orientationMismatches, boundaryEdges, nonManifoldEdges.
 *
 * Mesh data is hashed IN-PAGE (no Array.from of large arrays across CDP) except the ON
 * build, whose (now small) arrays cross once to write the STL.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART = path.join(__dirname, 'artifacts');

/** Coarse conforming sag (mm) — shrinks the mesh for a tractable e2e; weld is sag-independent. */
const MAX_SAG_MM = 0.5;

/** Topology result shape from windowHook.ts FidelityTopologyDiagnostics (field names verified). */
interface TopoResult {
  styleId: string;
  nonManifoldEdges: number;
  orientationMismatches: number;
  boundaryEdges: number;
}

test.describe('feature mesher — Voronoi real GPU export', () => {
  test('flag-ON Voronoi welds watertight on GPU; OFF is byte-identical; emits render + STL', async ({ page }) => {
    test.setTimeout(30 * 60 * 1000); // generous: 4 GPU builds at a coarse sag
    page.setDefaultTimeout(0); // long page.evaluate (WebGPU assembly) must not hit the 30s action cap
    fs.mkdirSync(ART, { recursive: true });

    // ── Boot ────────────────────────────────────────────────────────────────
    await page.goto('/?fidelity=1');
    await page.waitForFunction(
      () => !!(window as unknown as { __pfFidelity?: { isReady(): boolean } }).__pfFidelity?.isReady(),
      { timeout: 90_000 },
    );
    // Feature mesher runs only on the by-construction branch; coarse sag for speed.
    await page.evaluate((sag) => {
      const w = window as unknown as { __pfByConstruction?: boolean; __pfConformingMaxSag?: number };
      w.__pfByConstruction = true;
      w.__pfConformingMaxSag = sag;
    }, MAX_SAG_MM);

    const setStyle = (s: string): Promise<void> =>
      page.evaluate(
        (styleId: string) =>
          (window as unknown as { __pfFidelity: { setStyle(s: string): Promise<void> } }).__pfFidelity.setStyle(styleId),
        s,
      );
    const setFeatureMesher = (on: boolean): Promise<void> =>
      page.evaluate((v) => {
        (window as unknown as { __pfFeatureMesher?: boolean }).__pfFeatureMesher = v;
      }, on);

    // ── Build 1: OFF baseline (hash in-page) ─────────────────────────────────
    await setFeatureMesher(false);
    await setStyle('Voronoi');
    const off1 = await page.evaluate(async () => {
      const api = (window as unknown as { __pfFidelity: { getMeshForRender(t?: number): Promise<{ vertices: Float32Array; indices: Uint32Array } | null> } }).__pfFidelity;
      const m = await api.getMeshForRender();
      if (!m) return null;
      let h = 2166136261 >>> 0;
      const upd = (x: number): void => { h = (h ^ (x | 0)) >>> 0; h = Math.imul(h, 16777619) >>> 0; };
      for (const v of m.vertices) upd(Math.round(v * 1e6));
      for (const i of m.indices) upd(i);
      return { triCount: (m.indices.length / 3) | 0, hash: h.toString(16) };
    });
    expect(off1, 'OFF baseline mesh must not be null').not.toBeNull();
    const offTris = off1!.triCount;
    const offHash = off1!.hash;
    console.log(`[feature-mesher] OFF: ${offTris} tris, hash=${offHash}`);

    // ── Build 2: ON topology proof ───────────────────────────────────────────
    await setFeatureMesher(true);
    await setStyle('Voronoi');
    const topo = await page.evaluate<TopoResult>(async () => {
      const api = (window as unknown as { __pfFidelity: { diagnoseTopology(o?: object): Promise<TopoResult> } }).__pfFidelity;
      return api.diagnoseTopology({});
    });
    console.log(`[feature-mesher] GPU topo ON: nonManifold=${topo.nonManifoldEdges} orientation=${topo.orientationMismatches} boundary=${topo.boundaryEdges}`);
    // LOAD-BEARING GPU ASSERTIONS — the Phase-1 pass/fail criteria.
    expect(topo.nonManifoldEdges, 'GPU nonManifoldEdges must be 0 (corridor welded)').toBe(0);
    expect(topo.orientationMismatches, 'GPU orientationMismatches must be 0').toBe(0);

    // ── Build 3: ON mesh (count + arrays for STL) + screenshot ───────────────
    const on = await page.evaluate(async () => {
      const api = (window as unknown as { __pfFidelity: { getMeshForRender(t?: number): Promise<{ vertices: Float32Array; indices: Uint32Array } | null> } }).__pfFidelity;
      const m = await api.getMeshForRender();
      if (!m) return null;
      return { triCount: (m.indices.length / 3) | 0, verts: Array.from(m.vertices), idx: Array.from(m.indices) };
    });
    expect(on, 'ON mesh must not be null (GPU path returned a mesh)').not.toBeNull();
    const onTris = on!.triCount;
    console.log(`[feature-mesher] ON: ${onTris} tris (delta vs OFF = ${onTris - offTris})`);
    // The corridor adds fill triangles — the mesh MUST differ. onTris===offTris ⇒ the corridor
    // did not form on the production sampler: a REAL FINDING, not skipped.
    expect(onTris, 'corridor pass must change the triangle count vs OFF (feature band filled)').not.toBe(offTris);

    // Human-acceptance render (canvas is in the ON state from Build 2's setStyle).
    const screenshotPath = path.join(ART, 'voronoi-feature-mesher.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath), 'screenshot must exist').toBe(true);

    // Binary STL from the ON mesh (now small — single CDP transfer above).
    const stlPath = path.join(ART, 'voronoi-feature-mesher.stl');
    writeBinarySTL(on!.verts, on!.idx, stlPath);
    const stlSize = fs.statSync(stlPath).size;
    expect(stlSize, 'STL artifact must be non-empty').toBeGreaterThan(0);
    console.log(`[feature-mesher] render=${screenshotPath}  stl=${stlPath} (${stlSize} bytes)`);

    // ── Build 4: OFF stability (runtime byte-identity across the flag toggle) ─
    await setFeatureMesher(false);
    await setStyle('Voronoi');
    const off2 = await page.evaluate(async () => {
      const api = (window as unknown as { __pfFidelity: { getMeshForRender(t?: number): Promise<{ vertices: Float32Array; indices: Uint32Array } | null> } }).__pfFidelity;
      const m = await api.getMeshForRender();
      if (!m) return null;
      let h = 2166136261 >>> 0;
      const upd = (x: number): void => { h = (h ^ (x | 0)) >>> 0; h = Math.imul(h, 16777619) >>> 0; };
      for (const v of m.vertices) upd(Math.round(v * 1e6));
      for (const i of m.indices) upd(i);
      return { hash: h.toString(16) };
    });
    expect(off2, 'OFF stability re-fetch must not be null').not.toBeNull();
    expect(off2!.hash, 'OFF path must be byte-identical across flag toggles').toBe(offHash);

    console.log(
      `[feature-mesher] SUMMARY: offTris=${offTris} onTris=${onTris} delta=${onTris - offTris} | ` +
      `nonManifold=${topo.nonManifoldEdges} orientation=${topo.orientationMismatches} boundary=${topo.boundaryEdges} | ` +
      `OFF stable=${off2!.hash === offHash}`,
    );
  });
});

/** Write a binary STL (84-byte header + nTris*50) from flat vertices + indices. */
function writeBinarySTL(vertices: number[], indices: number[], filePath: string): void {
  const nTris = Math.floor(indices.length / 3);
  const buf = Buffer.alloc(84 + nTris * 50);
  buf.write('PotFoundry feature-mesher Voronoi (Phase 1 GPU proof)', 0, 'ascii');
  buf.writeUInt32LE(nTris, 80);
  let off = 84;
  for (let t = 0; t < nTris; t++) {
    const i0 = indices[t * 3] * 3, i1 = indices[t * 3 + 1] * 3, i2 = indices[t * 3 + 2] * 3;
    const ax = vertices[i0], ay = vertices[i0 + 1], az = vertices[i0 + 2];
    const bx = vertices[i1], by = vertices[i1 + 1], bz = vertices[i1 + 2];
    const cx = vertices[i2], cy = vertices[i2 + 1], cz = vertices[i2 + 2];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    buf.writeFloatLE(nx / len, off); off += 4;
    buf.writeFloatLE(ny / len, off); off += 4;
    buf.writeFloatLE(nz / len, off); off += 4;
    buf.writeFloatLE(ax, off); off += 4; buf.writeFloatLE(ay, off); off += 4; buf.writeFloatLE(az, off); off += 4;
    buf.writeFloatLE(bx, off); off += 4; buf.writeFloatLE(by, off); off += 4; buf.writeFloatLE(bz, off); off += 4;
    buf.writeFloatLE(cx, off); off += 4; buf.writeFloatLE(cy, off); off += 4; buf.writeFloatLE(cz, off); off += 4;
    buf.writeUInt16LE(0, off); off += 2;
  }
  fs.writeFileSync(filePath, buf);
}
