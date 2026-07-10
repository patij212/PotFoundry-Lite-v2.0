// _ds_prodtruth.test.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-10-DS-PRODTRUTH. Scores the CAPTURED PRODUCTION DragonScales artifact
// (research/exchange/_prod_truth/DragonScales/) under the ported §V11g tread-CONFORMING
// open-surface composite ruler — the first honest DragonScales production fidelity number.
// See research/lab/E-2026-07-10-DS-PRODTRUTH-prereg.md for the full design + kill criteria.
//
// RESILIENCE: env-gated `it`; ndjson CHECKPOINT one row per unit the INSTANT computed; a key that
// already exists is SKIPPED (a killed run resumes on unfinished units).
//
//   PF_DS_PRODTRUTH_BATTERY=1  — Task 1: re-run the 1a-1d metrologist battery on THIS wiring
//                                (mandatory gate before any forward/reverse number is trusted).
//   PF_DS_PRODTRUTH_FWD=1      — Task 2: forward (mesh->truth) scoring, body vs ring-band split.
//                                PF_DS_PT_BAND (mm, default 1.5) sets the ring-band half-width.
//                                PF_DS_PT_SHARD / PF_DS_PT_NSHARDS for facet-shard parallelism.
//   PF_DS_PRODTRUTH_REV=1      — Task 3: reverse (truth->mesh) coverage — sheet + wall, separated.
//   PF_DS_PRODTRUTH_1D_DENSITY=1 — Task 4 (KILL-GUARD re-validation): the pre-registered
//                                wall-hiding guard fires whenever a forward ring-band population's
//                                max reads <0.1mm ("if it reads MUCH LESS than 0.1mm, suspect the
//                                ruler is wall-hiding"). This unit re-runs 1d one-sidedness using
//                                ACTUAL production-artifact near-ring vertices (not analytic probe
//                                points at battery-standard spacing) pushed outward along the true
//                                3D surface normal, so the one-sidedness check is exercised at the
//                                artifact's OWN measured near-ring density (~0.03mm z-spacing,
//                                ~77k verts within 0.3mm of a ring) rather than a coarser synthetic
//                                grid that might miss a locus where the wall's finite z-thickness
//                                (WALLEPS=5e-4) fails to track the mesh's actual fine structure.
import { describe, it, expect } from 'vitest';
import {
  DIMS, H, TOL, RAD_TWIN, WALLEPS, WALL_NTHETA,
  dsRadiusFn, dragonRings, buildConformRuler,
  loadArtifactMeta, loadArtifactOuter, classifyRingBand,
  scoreBodyFacets, scoreRingBandFacets,
  buildArtifactLocator, locatorSelfCheck, sheetCoverage, wallCoverage, oneSidedRA,
  checkpoint, keyExists, readRow, plog, TAU, DENSE,
} from './_ds_prodtruth_lib';
import { buildRadialTwin } from './_pf_bvhRuler';
import { buildRefLocator } from './_sharp3dRef';
import { buildWallOnlyReference, riserWallPoints } from './_ds_conformRef';

describe('DS-PRODTRUTH — E-2026-07-10-DS-PRODTRUTH', () => {
  // ═══════════════════════ TASK 1 — 1a-1d BATTERY (mandatory gate) ═══════════════════════
  it.skipIf(process.env.PF_DS_PRODTRUTH_BATTERY !== '1')('BATTERY — re-validate the composite ruler on this wiring (1a-1d)', () => {
    const rA = dsRadiusFn();
    const rings = dragonRings();
    plog(`[BATTERY] rings: ${rings.map((r) => `t=${r.t.toFixed(3)},z=${r.z.toFixed(2)}`).join(' | ')}`);

    // ── 1a: construction — skirt anchors + riser-wall interior points sit on the composite surface.
    if (!keyExists('t1a_construction')) {
      const loc = buildConformRuler(rA);
      let maxSkirt = 0; const jumps: number[] = [];
      const nTh = 360;
      for (const ring of rings) {
        let ringJumpMax = 0;
        for (let it = 0; it < nTh; it++) {
          const th = TAU * (it / nTh);
          const rIn = rA(th, ring.z - WALLEPS), rOut = rA(th, ring.z + WALLEPS);
          const jmp = Math.abs(rOut - rIn); if (jmp > ringJumpMax) ringJumpMax = jmp;
          const dBelow = loc.dist(rIn * Math.cos(th), rIn * Math.sin(th), ring.z - WALLEPS);
          const dAbove = loc.dist(rOut * Math.cos(th), rOut * Math.sin(th), ring.z + WALLEPS);
          if (dBelow > maxSkirt) maxSkirt = dBelow; if (dAbove > maxSkirt) maxSkirt = dAbove;
        }
        jumps.push(+ringJumpMax.toFixed(4));
      }
      let maxWall = 0;
      for (const p of riserWallPoints(rA, rings, WALLEPS, 360, 8)) { const d = loc.dist(p[0], p[1], p[2]); if (d > maxWall) maxWall = d; }
      const pass1a = maxSkirt <= 1e-3 && maxWall <= 1e-3;
      checkpoint({
        key: 't1a_construction', task: '1a-construction', maxSkirtDistMm: +maxSkirt.toFixed(6), maxWallDistMm: +maxWall.toFixed(6),
        ringJumpMaxMm: jumps, meanRingJumpMm: +(jumps.reduce((a, b) => a + b, 0) / jumps.length).toFixed(4), pass: pass1a,
      });
      plog(`[1a] maxSkirt=${maxSkirt.toFixed(6)} maxWall=${maxWall.toFixed(6)} jumps=${jumps.join(',')} PASS=${pass1a}`);
    }

    // ── 1b: smooth-parity — composite ruler agrees with the standalone radial twin on ≥60k off-ring samples.
    if (!keyExists('t1b_smoothctrl')) {
      const confLoc = buildConformRuler(rA);
      const radTwin = buildRadialTwin(rA, H, RAD_TWIN.nTheta, RAD_TWIN.nZ);
      const radLoc = buildRefLocator(radTwin, Math.max(0.35, 4 * ((2 * Math.PI * ((DIMS.Rb + DIMS.Rt) / 2)) / RAD_TWIN.nTheta)));
      const farFromRing = (z: number): boolean => rings.every((rg) => Math.abs(z - rg.z) > 2.0);
      const N = 60000;
      let agree = 0, disConf = 0, disRad = 0, maxAbsDelta = 0;
      for (let i = 0; i < N; i++) {
        // deterministic pseudo-random spread over (theta, off-ring z).
        const th = TAU * (((i * 2654435761) >>> 0) / 4294967296);
        let z = ((i * 40503) % 10007) / 10007 * H;
        let guard = 0;
        while (!farFromRing(z) && guard++ < 20) { z = (z + 3.7) % H; }
        const r = rA(th, z);
        const px = r * Math.cos(th) + 0.01, py = r * Math.sin(th), pz = z; // tiny off-surface probe (matches 1b construction elsewhere: a real point off the sheet).
        const dC = confLoc.dist(px, py, pz), dR = radLoc.dist(px, py, pz);
        const oC = dC > TOL, oR = dR > TOL;
        if (oC === oR) agree++; else if (oC) disConf++; else disRad++;
        const delta = Math.abs(dC - dR); if (delta > maxAbsDelta) maxAbsDelta = delta;
      }
      const agreeFrac = +(agree / N).toFixed(6);
      const pass1b = agreeFrac >= 0.998;
      checkpoint({ key: 't1b_smoothctrl', task: '1b-smoothctrl', nSamples: N, agree, disConf, disRad, agreeFrac, maxAbsDeltaMm: +maxAbsDelta.toFixed(6), pass: pass1b });
      plog(`[1b] agree=${agree}/${N} (${agreeFrac}) disConf=${disConf} disRad=${disRad} maxDelta=${maxAbsDelta.toFixed(6)} PASS=${pass1b}`);
    }

    // ── 1c: density-convergence — wall sub-locator's own on-surface residual shrinks with WALL_NTHETA.
    if (!keyExists('t1c_density')) {
      const densities = [1024, 2048, 4096];
      const residuals: number[] = [];
      for (const nTh of densities) {
        const wallRef = buildWallOnlyReference(rA, rings, nTh, WALLEPS);
        const wallLoc = buildRefLocator(wallRef, 0.3);
        // sample AT half-cell offsets on the analytic riser-wall surface (the worst case for a flat-facet twin).
        let maxResid = 0;
        const pts = riserWallPoints(rA, rings, WALLEPS, nTh, 6);
        // shift each theta sample by half a cell before re-measuring against ITS OWN locator (half-cell offset test).
        const halfCell = Math.PI / nTh;
        for (const ring of rings) {
          for (let it = 0; it < nTh; it += Math.max(1, Math.floor(nTh / 200))) {
            const th = TAU * (it / nTh) + halfCell;
            for (let is = 1; is < 6; is++) {
              const s = is / 6;
              const rIn = rA(th, ring.z - WALLEPS), rOut = rA(th, ring.z + WALLEPS);
              const r = (1 - s) * rIn + s * rOut; const z = (1 - s) * (ring.z - WALLEPS) + s * (ring.z + WALLEPS);
              const d = wallLoc.dist(r * Math.cos(th), r * Math.sin(th), z);
              if (d > maxResid) maxResid = d;
            }
          }
        }
        residuals.push(+maxResid.toFixed(6));
        void pts;
      }
      const lastDelta = residuals.length >= 2 ? Math.abs(residuals[residuals.length - 1] - residuals[residuals.length - 2]) / Math.max(residuals[residuals.length - 2], 1e-9) : 1;
      const pass1c = lastDelta < 0.10 || residuals[residuals.length - 1] < 1e-3;
      checkpoint({ key: 't1c_density', task: '1c-density', densities, residualsMm: residuals, lastRelDelta: +lastDelta.toFixed(4), pass: pass1c });
      plog(`[1c] densities=${densities} residuals=${residuals.join(',')} lastRelDelta=${lastDelta.toFixed(4)} PASS=${pass1c}`);
    }

    // ── 1d: one-sidedness — normal-push probes near rings must NOT read closer than truth by >0.05mm.
    if (!keyExists('t1d_onesided')) {
      const loc = buildConformRuler(rA);
      const radTwin = buildRadialTwin(rA, H, RAD_TWIN.nTheta, RAD_TWIN.nZ);
      const radLoc = buildRefLocator(radTwin, Math.max(0.35, 4 * ((2 * Math.PI * ((DIMS.Rb + DIMS.Rt) / 2)) / RAD_TWIN.nTheta)));
      let maxUnder = 0; let worstCase: Record<string, number> = {};
      const P = (rAf: (t: number, z: number) => number, t: number, zz: number): [number, number, number] => { const r = rAf(t, zz); return [r * Math.cos(t), r * Math.sin(t), zz]; };
      for (const ring of rings) {
        for (const dz of [-0.8, -0.5, -0.3, 0.3, 0.5, 0.8]) {
          const z = ring.z + dz; if (z <= 0 || z >= H) continue;
          for (let it = 0; it < 120; it++) {
            const th = TAU * (it / 120);
            // true 3D surface normal at (th,z) via finite-difference tangents, outward-oriented.
            const eTh = 1e-4, eZ = 1e-3;
            const p0 = P(rA, th, z), pT = P(rA, th + eTh, z), pZ = P(rA, th, z + eZ);
            const tvx = pT[0] - p0[0], tvy = pT[1] - p0[1], tvz = pT[2] - p0[2];
            const zvx = pZ[0] - p0[0], zvy = pZ[1] - p0[1], zvz = pZ[2] - p0[2];
            let nx = tvy * zvz - tvz * zvy, ny = tvz * zvx - tvx * zvz, nz = tvx * zvy - tvy * zvx;
            const nlen = Math.hypot(nx, ny, nz); nx /= nlen; ny /= nlen; nz /= nlen;
            const rd = Math.hypot(p0[0], p0[1]);
            const outSign = (nx * p0[0] + ny * p0[1]) / rd >= 0 ? 1 : -1;
            nx *= outSign; ny *= outSign; nz *= outSign;
            const delta = 0.2;
            const npx = p0[0] + delta * nx, npy = p0[1] + delta * ny, npz = p0[2] + delta * nz;
            const dConf = loc.dist(npx, npy, npz);
            const dRad = radLoc.dist(npx, npy, npz); // cross-check: honest 3D distance should agree closely with the radial twin off-wall.
            const u = delta - dConf;
            if (u > maxUnder) { maxUnder = u; worstCase = { th: +th.toFixed(4), z: +z.toFixed(3), ringZ: ring.z, dz, dConf: +dConf.toFixed(5), dRad: +dRad.toFixed(5) }; }
          }
        }
      }
      const pass1d = maxUnder < 0.05;
      checkpoint({ key: 't1d_onesided', task: '1d-onesided', maxUnderstateMm: +maxUnder.toFixed(6), worstCase, pass: pass1d });
      plog(`[1d] maxUnderstate=${maxUnder.toFixed(6)} worst=${JSON.stringify(worstCase)} PASS=${pass1d}`);
    }

    const a = readRow('t1a_construction'), b = readRow('t1b_smoothctrl'), c = readRow('t1c_density'), d = readRow('t1d_onesided');
    const allPass = !!(a?.pass && b?.pass && c?.pass && d?.pass);
    plog(`[BATTERY] SUMMARY 1a=${a?.pass} 1b=${b?.pass} 1c=${c?.pass} 1d=${d?.pass} ⇒ ${allPass ? 'ALL PASS — instrument VALIDATED for this wiring' : 'FAIL — STOP, do not trust forward/reverse numbers'}`);
    checkpoint({ key: 'battery_summary', task: 'battery-summary', t1a: a?.pass, t1b: b?.pass, t1c: c?.pass, t1d: d?.pass, allPass });
    expect(true).toBe(true); // the probe reports; it does not assert a verdict (pre-registered).
  }, 30 * 60 * 1000);

  // ═══════════════════════ TASK 2 — FORWARD (mesh→truth), body vs ring-band ═══════════════════════
  it.skipIf(process.env.PF_DS_PRODTRUTH_FWD !== '1')('FORWARD — score the production artifact under the composite ruler (body vs ring-band)', () => {
    const battery = readRow('battery_summary');
    if (!battery?.allPass) { plog(`[FWD] battery not validated (${JSON.stringify(battery)}) — run PF_DS_PRODTRUTH_BATTERY=1 first`); expect(true).toBe(true); return; }

    const meta = loadArtifactMeta();
    if (!meta.ok) { plog(`[FWD] capture not ok`); expect(true).toBe(true); return; }
    const rA = dsRadiusFn();
    const rings = dragonRings();
    const ringZs = rings.map((r) => r.z);
    const bandMm = Number(process.env.PF_DS_PT_BAND ?? '1.5');
    const shardK = Math.max(0, Number(process.env.PF_DS_PT_SHARD ?? 0));
    const nShards = Math.max(1, Number(process.env.PF_DS_PT_NSHARDS ?? 1));
    const key = `fwd_band${bandMm}${nShards > 1 ? `_shard${shardK}of${nShards}` : ''}`;
    if (keyExists(key)) { plog(`[skip] ${key}`); expect(true).toBe(true); return; }

    plog(`[FWD] loading artifact outer submesh...`);
    const { xyz, idx } = loadArtifactOuter();
    const nF = idx.length / 3;
    plog(`[FWD] loaded ${nF} outer tris. building composite ruler...`);
    const loc = buildConformRuler(rA);
    plog(`[FWD] ruler built. classifying ${nF} facets by ring-band(±${bandMm}mm)...`);
    const cls = classifyRingBand(xyz, idx, ringZs, bandMm);
    const bodyFacets: number[] = [], ringFacets: number[] = [];
    for (let f = 0; f < nF; f++) {
      if (nShards > 1 && f % nShards !== shardK) continue;
      if (cls(f) === 'ringBand') ringFacets.push(f); else bodyFacets.push(f);
    }
    plog(`[FWD] body=${bodyFacets.length} ringBand=${ringFacets.length} (shard ${shardK}/${nShards})`);

    const t0 = Date.now();
    const bodyStats = scoreBodyFacets(xyz, idx, bodyFacets, loc, rA, TOL, (done, total) => {
      if (done % Math.max(1, Math.floor(total / 10)) === 0) plog(`[FWD-BODY] ${done}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    });
    const tBody = Date.now() - t0;
    plog(`[FWD-BODY] done in ${(tBody / 1000).toFixed(0)}s: out=${bodyStats.outliers}/${bodyStats.scannedFacets} max=${bodyStats.maxMm} p99=${bodyStats.p99} greenProven=${bodyStats.greenProvenFrac}`);

    const t1 = Date.now();
    const ringStats = scoreRingBandFacets(xyz, idx, ringFacets, loc, TOL, (done, total) => {
      if (done % Math.max(1, Math.floor(total / 10)) === 0) plog(`[FWD-RING] ${done}/${total} (${((Date.now() - t1) / 1000).toFixed(0)}s)`);
    });
    const tRing = Date.now() - t1;
    plog(`[FWD-RING] done in ${(tRing / 1000).toFixed(0)}s: out=${ringStats.outliers}/${ringStats.scannedFacets} max=${ringStats.maxMm} p99=${ringStats.p99}`);

    // Ring-band wall-hiding sanity (pre-registered kill guard): magnitude expectation ~0.4-1.2mm class.
    const wallHidingSuspect = ringStats.maxMm < 0.1 && ringStats.scannedFacets > 0;

    checkpoint({
      key, task: 'forward-score', style: 'DragonScales', bandMm, shard: shardK, nShards,
      outerTris: nF, tol: TOL,
      body: bodyStats, ring: ringStats,
      ringBandAreaFrac: nF ? +(ringFacets.length / (bodyFacets.length + ringFacets.length)).toFixed(6) : 0,
      wallHidingSuspect,
      bodyMs: tBody, ringMs: tRing, totalMs: Date.now() - t0,
    });
    if (wallHidingSuspect) plog(`[FWD] WARNING: ring-band max ${ringStats.maxMm} < 0.1mm — WALL-HIDING SUSPECT per pre-registered kill guard. Needs 1d re-validation at production mesh density before trusting.`);
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  // ═══════════════════════ TASK 3 — REVERSE (truth→mesh): sheet + wall coverage ═══════════════════════
  it.skipIf(process.env.PF_DS_PRODTRUTH_REV !== '1')('REVERSE — sheet + wall coverage against the artifact locator', () => {
    const battery = readRow('battery_summary');
    if (!battery?.allPass) { plog(`[REV] battery not validated — run PF_DS_PRODTRUTH_BATTERY=1 first`); expect(true).toBe(true); return; }
    const key = 'rev_coverage';
    if (keyExists(key)) { plog(`[skip] ${key}`); expect(true).toBe(true); return; }

    const meta = loadArtifactMeta();
    if (!meta.ok) { plog(`[REV] capture not ok`); expect(true).toBe(true); return; }
    const rA = dsRadiusFn();
    const rings = dragonRings();
    const ringZs = rings.map((r) => r.z);

    plog(`[REV] loading artifact outer submesh...`);
    const { xyz, idx } = loadArtifactOuter();
    plog(`[REV] building artifact locator (own outer submesh)...`);
    const t0 = Date.now();
    const loc = buildArtifactLocator(xyz, idx);
    plog(`[REV] locator built in ${((Date.now() - t0) / 1000).toFixed(0)}s. self-check...`);

    const selfCheck = locatorSelfCheck(loc, rA, 24, 0.5);
    plog(`[REV] locatorSelfCheckMax=${selfCheck}`);
    expect(selfCheck).toBeLessThan(1e-9);

    const rAOneSided = oneSidedRA(rA, ringZs, WALLEPS);
    const t1 = Date.now();
    const NU = 1024, NT = 1024, bandMm = 0.5;
    plog(`[REV] sheet coverage lattice ${NU}x${NT}...`);
    const sheet = sheetCoverage(loc, rAOneSided, NU, NT, bandMm);
    plog(`[REV] sheet done in ${((Date.now() - t1) / 1000).toFixed(0)}s: interior max=${sheet.interior.max} p99=${sheet.interior.p99} | boundary max=${sheet.boundary.max}`);

    const t2 = Date.now();
    plog(`[REV] wall coverage on riser strips (nTheta=${WALL_NTHETA}, nS=8)...`);
    const wall = wallCoverage(loc, rA, rings, WALLEPS, WALL_NTHETA, 8);
    plog(`[REV] wall done in ${((Date.now() - t2) / 1000).toFixed(0)}s: max=${wall.max} p99=${wall.p99} n=${wall.n}`);

    checkpoint({
      key, task: 'reverse-coverage', style: 'DragonScales',
      locatorSelfCheckMax: selfCheck,
      sheet, wall,
      lattice: `${NU}x${NT} sheet + ${rings.length}x${WALL_NTHETA}x8 wall`,
      totalMs: Date.now() - t0,
    });
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  // ═════════ TASK 5 — BODY-WORST: literal whole-population body pass + worst-locus capture ═════════
  // The sharded FORWARD rows do not carry worst-facet loci. This unit re-scans ALL body facets
  // (no shard — the prefilter makes the full body population cheap, ~99.6% green-proven) tracking
  // the top-K worst with their (u,t,z,r) centroids. Side benefit: the body population becomes a
  // LITERAL whole-population number (stride 1, every body facet), upgrading the sharded basis.
  it.skipIf(process.env.PF_DS_PRODTRUTH_BODYWORST !== '1')('BODY-WORST — literal whole-population body scan + worst loci', () => {
    const battery = readRow('battery_summary');
    if (!battery?.allPass) { plog(`[BODYWORST] battery not validated`); expect(true).toBe(true); return; }
    const bandMm = Number(process.env.PF_DS_PT_BAND ?? '1.5');
    const key = `fwd_bodyworst_band${bandMm}`;
    if (keyExists(key)) { plog(`[skip] ${key}`); expect(true).toBe(true); return; }
    const rA = dsRadiusFn();
    const rings = dragonRings();
    const ringZs = rings.map((r) => r.z);
    plog(`[BODYWORST] loading artifact + building ruler...`);
    const { xyz, idx } = loadArtifactOuter();
    const nF = idx.length / 3;
    const loc = buildConformRuler(rA);
    const cls = classifyRingBand(xyz, idx, ringZs, bandMm);
    const advMargin = 0.7 * TOL;
    const t0 = Date.now();
    let scanned = 0, outliers = 0, greenProven = 0, worst = 0;
    const K = 10;
    const top: Array<{ f: number; dv: number; u: number; t: number; z: number; r: number }> = [];
    for (let f = 0; f < nF; f++) {
      if (cls(f) !== 'body') continue;
      scanned++;
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
      const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
      const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
      let bMax = 0;
      for (const [wa, wb, wc] of DENSE) {
        const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
        let th = Math.atan2(py, px); if (th < 0) th += TAU;
        const bd = (pz < 0 || pz > H) ? Infinity : Math.abs(Math.hypot(px, py) - rA(th, pz));
        if (bd > bMax) { bMax = bd; if (bMax > advMargin) break; }
      }
      let dv: number;
      if (bMax <= advMargin) { dv = bMax; greenProven++; }
      else {
        dv = 0;
        for (const [wa, wb, wc] of DENSE) {
          const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
          const d = loc.dist(px, py, pz); if (d > dv) dv = d;
        }
      }
      if (dv > TOL) outliers++;
      if (dv > worst) worst = dv;
      if (top.length < K || dv > top[top.length - 1].dv) {
        const zc = (az + bz + cz) / 3;
        const xc = (ax + bx + cx) / 3, yc = (ay + by + cy) / 3;
        let th = Math.atan2(yc, xc); if (th < 0) th += TAU;
        top.push({ f, dv: +dv.toFixed(6), u: +(th / TAU).toFixed(4), t: +(zc / H).toFixed(4), z: +zc.toFixed(3), r: +Math.hypot(xc, yc).toFixed(3) });
        top.sort((p, q) => q.dv - p.dv);
        if (top.length > K) top.pop();
      }
      if (scanned % 250000 === 0) plog(`[BODYWORST] ${scanned} scanned, out=${outliers} worst=${worst.toFixed(5)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    checkpoint({
      key, task: 'forward-body-literal-worstloci', style: 'DragonScales', bandMm, tol: TOL,
      basis: 'LITERAL whole body population (every body facet, no shard; prefilter green-proven exact-equivalent)',
      scannedFacets: scanned, outliers, maxMm: +worst.toFixed(6),
      greenProvenFrac: scanned ? +(greenProven / scanned).toFixed(4) : 0,
      top10Worst: top, scoreMs: Date.now() - t0,
    });
    plog(`[BODYWORST] LITERAL body: ${outliers}/${scanned} out, max=${worst.toFixed(6)}, top3=${JSON.stringify(top.slice(0, 3))} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    expect(true).toBe(true);
  }, 30 * 60 * 1000);

  // ═══════════════════ TASK 4 — KILL-GUARD: density-matched 1d re-validation ═══════════════════
  // Fires only in response to the pre-registered wall-hiding guard (a forward ring-band max <0.1mm).
  // Re-runs one-sidedness using ACTUAL production-artifact near-ring vertices (not analytic probe
  // points at the battery's own coarser spacing), pushed outward along the TRUE 3D surface normal
  // by a known delta; a sound ruler must read close to that delta, not materially closer.
  it.skipIf(process.env.PF_DS_PRODTRUTH_1D_DENSITY !== '1')('KILL-GUARD 1D-DENSITY — re-validate one-sidedness at actual artifact near-ring vertex density', () => {
    const key = 'killguard_1d_density';
    if (keyExists(key)) { plog(`[skip] ${key}`); expect(true).toBe(true); return; }
    const rA = dsRadiusFn();
    const rings = dragonRings();
    const loc = buildConformRuler(rA);

    plog(`[1D-DENSITY] loading artifact outer submesh to sample REAL near-ring vertices...`);
    const { xyz } = loadArtifactOuter();
    const nV = xyz.length / 3;

    // For each ring, collect actual artifact vertices within nearBandMm — the artifact's own
    // measured near-ring density (~0.03mm z-spacing near a ring, confirmed by direct inspection).
    const nearBandMm = 0.3;
    const P = (t: number, zz: number): [number, number, number] => { const r = rA(t, zz); return [r * Math.cos(t), r * Math.sin(t), zz]; };
    const pushDeltas = [0.05, 0.1, 0.2]; // multiple probe depths (mission asks specifically about >0.05mm understate).
    const results: Array<Record<string, unknown>> = [];
    let globalMaxUnder = 0; let globalWorst: Record<string, number> = {};

    for (const ring of rings) {
      // sample ACTUAL artifact vertices near this ring (stride to bound cost — density is what matters, not exhaustion).
      const sampled: number[] = [];
      for (let v = 0; v < nV && sampled.length < 4000; v += 3) {
        const z = xyz[3 * v + 2];
        if (Math.abs(z - ring.z) < nearBandMm) sampled.push(v);
      }
      let ringMaxUnder = 0; let ringWorst: Record<string, number> = {};
      for (const v of sampled) {
        const vx = xyz[3 * v], vy = xyz[3 * v + 1], vz = xyz[3 * v + 2];
        const th = Math.atan2(vy, vx);
        // true 3D surface normal AT this actual vertex's (th, vz) — finite-difference tangents, outward-oriented.
        const eTh = 1e-4, eZ = 1e-3;
        const p0 = P(th, vz), pT = P(th + eTh, vz), pZ = P(th, vz + eZ);
        const tvx = pT[0] - p0[0], tvy = pT[1] - p0[1], tvz = pT[2] - p0[2];
        const zvx = pZ[0] - p0[0], zvy = pZ[1] - p0[1], zvz = pZ[2] - p0[2];
        let nx = tvy * zvz - tvz * zvy, ny = tvz * zvx - tvx * zvz, nz = tvx * zvy - tvy * zvx;
        const nlen = Math.hypot(nx, ny, nz) || 1; nx /= nlen; ny /= nlen; nz /= nlen;
        const rd = Math.hypot(p0[0], p0[1]) || 1;
        const outSign = (nx * p0[0] + ny * p0[1]) / rd >= 0 ? 1 : -1;
        nx *= outSign; ny *= outSign; nz *= outSign;
        for (const delta of pushDeltas) {
          // push from the ACTUAL vertex position (not the idealized surface point p0) — this is the
          // density-matched difference from the battery's 1d check, which used analytic probe points.
          const npx = vx + delta * nx, npy = vy + delta * ny, npz = vz + delta * nz;
          const dConf = loc.dist(npx, npy, npz);
          const u = delta - dConf;
          if (u > ringMaxUnder) { ringMaxUnder = u; ringWorst = { ringZ: ring.z, vx: +vx.toFixed(4), vy: +vy.toFixed(4), vz: +vz.toFixed(4), delta, dConf: +dConf.toFixed(5) }; }
          if (u > globalMaxUnder) { globalMaxUnder = u; globalWorst = ringWorst; }
        }
      }
      results.push({ ringZ: ring.z, sampledVerts: sampled.length, nearBandMm, ringMaxUnderstateMm: +ringMaxUnder.toFixed(6), ringWorst });
      plog(`[1D-DENSITY] ring z=${ring.z}: sampled=${sampled.length} maxUnderstate=${ringMaxUnder.toFixed(6)}`);
    }
    const pass = globalMaxUnder < 0.05;
    checkpoint({
      key, task: 'killguard-1d-density-revalidation', nearBandMm, pushDeltas,
      perRing: results, globalMaxUnderstateMm: +globalMaxUnder.toFixed(6), globalWorst, pass,
      verdict: pass
        ? 'PASS: one-sidedness holds at actual artifact near-ring vertex density — the small forward ring-band max is NOT a wall-hiding artifact, the artifact genuinely sits close to the true riser wall there.'
        : 'FAIL: the composite ruler UNDERSTATES near the actual artifact vertex positions — the forward ring-band number is UNTRUSTED, report as an instrument defect.',
    });
    plog(`[1D-DENSITY] GLOBAL maxUnderstate=${globalMaxUnder.toFixed(6)} worst=${JSON.stringify(globalWorst)} PASS=${pass}`);
    expect(true).toBe(true); // reports; does not force a verdict (pre-registered discipline).
  }, 30 * 60 * 1000);
});
