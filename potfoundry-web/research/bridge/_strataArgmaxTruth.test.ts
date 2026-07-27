// _strataArgmaxTruth.test.ts — IS THE MESH WRONG, OR IS THE RULER WRONG?
// Gated PF_STRATA_ARGTRUTH=1. RESEARCH ONLY. Measures; fixes nothing.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
// Eight rounds have assumed the 598 µm reading is meaningful and tried to fix whatever produces it. Meanwhile the
// mesher side is now MEASURED sound: coverage complete on every row (0/3541 and 0/5810 misses), ghosts inert,
// watertight at both row counts, shear at the analytic floor, placement at the sagitta floor. And the residual keeps
// landing within NANOMETRES of a locus on a 1–2 µm triangle, having survived five structurally different fixes.
// That pattern is at least as consistent with a measurement artifact as with a geometric defect, and it has never
// been checked independently. This file checks it.
//
// THE INSTRUMENT KNOWS NOTHING ABOUT THE MESHER. It reads the emitted STL as bytes and evaluates the analytic
// surface. No branch tags, no curtain bookkeeping, no slot state, no vLocTh, no 1-ring — nothing that could inherit
// the mesher's own assumptions. The only shared input is `buildRadiusFn` at registry defaults, which is the ground
// truth both sides are supposed to agree with.
//
// THE DECISIVE TEST (the whole point). At a jump the analytic surface is TWO-VALUED, so the argmax (θ,z) carries two
// genuine surface points: P⁻ = r(θ−ε) and P⁺ = r(θ+ε). A correct mesh must contain BOTH within tolerance. So take
// each one-sided point and BRUTE-FORCE the nearest point over EVERY triangle in the file — not planes, not a 1-ring,
// not a neighbourhood. Two numbers settle eight rounds:
//   • both within ~10 µm ⇒ the printed part is right at that spot; the 598 µm has been an attribution artifact, and
//     the sample was simply charged to a triangle that does not own it;
//   • either one far ⇒ a genuine unmeshed sheet; the reading has been true all along and the mesher is the target.
// A one-off could be luck, so the same test is also swept over many independent locus points and reported as a
// distribution.
//
// PRECISION NOTE, stated up front so the numbers are read correctly: binary STL stores float32, so at r ≈ 45 mm the
// coordinate quantum is ~2.7 nm. That is 3700× below the 10 µm bar, so it cannot affect the verdict.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_ARGTRUTH === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const TWO_PI = 2 * Math.PI;

function envF(name: string, d: number): number {
  const r = process.env[name];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

describe('STRATA argmax ground truth — mesh or ruler?', () => {
  it.runIf(RUN)('measures the true one-sided surface points against the emitted STL by brute force', () => {
    const STYLE = process.env.PF_AT_STYLE ?? 'CelticKnot';
    const file = process.env.PF_AT_FILE ?? join('research', 'exchange', '_strataConformBisect', 'celticknot_ring_D--eP.stl');
    const EPS = envF('PF_AT_EPS', 1e-9);
    const TOL = envF('PF_AT_TOL', 0.01);
    const SWEEP = Math.round(envF('PF_AT_SWEEP', 300));

    const params = registryDefaults(STYLE);
    const rA = buildRadiusFn(STYLE as StyleId, params, DIMS);
    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };

    // ── read the STL as raw bytes ──
    const data = readFileSync(file);
    const nTris = data.readUInt32LE(80);
    expect(data.length).toBe(84 + 50 * nTris);
    const VX = new Float64Array(nTris * 9);
    for (let i = 0; i < nTris; i += 1) {
      const o = 84 + i * 50 + 12;
      for (let k = 0; k < 9; k += 1) VX[i * 9 + k] = data.readFloatLE(o + k * 4);
    }

    /** squared distance from p to triangle i of the file — Ericson, clamped to the face. */
    const d2Tri = (px: number, py: number, pz: number, i: number): number => {
      const b = i * 9;
      const ax = VX[b]; const ay = VX[b + 1]; const az = VX[b + 2];
      const abx = VX[b + 3] - ax; const aby = VX[b + 4] - ay; const abz = VX[b + 5] - az;
      const acx = VX[b + 6] - ax; const acy = VX[b + 7] - ay; const acz = VX[b + 8] - az;
      const apx = px - ax; const apy = py - ay; const apz = pz - az;
      const d1 = abx * apx + aby * apy + abz * apz; const d2 = acx * apx + acy * apy + acz * apz;
      const sq = (qx: number, qy: number, qz: number): number => qx * qx + qy * qy + qz * qz;
      if (d1 <= 0 && d2 <= 0) return sq(apx, apy, apz);
      const bpx = px - VX[b + 3]; const bpy = py - VX[b + 4]; const bpz = pz - VX[b + 5];
      const d3 = abx * bpx + aby * bpy + abz * bpz; const d4 = acx * bpx + acy * bpy + acz * bpz;
      if (d3 >= 0 && d4 <= d3) return sq(bpx, bpy, bpz);
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v2 = d1 / (d1 - d3); return sq(apx - v2 * abx, apy - v2 * aby, apz - v2 * abz); }
      const cpx = px - VX[b + 6]; const cpy = py - VX[b + 7]; const cpz = pz - VX[b + 8];
      const d5 = abx * cpx + aby * cpy + abz * cpz; const d6 = acx * cpx + acy * cpy + acz * cpz;
      if (d6 >= 0 && d5 <= d6) return sq(cpx, cpy, cpz);
      const vb = d5 * d2 - d1 * d6;
      if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w2 = d2 / (d2 - d6); return sq(apx - w2 * acx, apy - w2 * acy, apz - w2 * acz); }
      const va = d3 * d6 - d5 * d4;
      if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
        const w2 = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return sq(px - VX[b + 3] - w2 * (VX[b + 6] - VX[b + 3]), py - VX[b + 4] - w2 * (VX[b + 7] - VX[b + 4]), pz - VX[b + 5] - w2 * (VX[b + 8] - VX[b + 5]));
      }
      const den = 1 / (va + vb + vc); const v3 = vb * den; const w3 = vc * den;
      return sq(apx - v3 * abx - w3 * acx, apy - v3 * aby - w3 * acy, apz - v3 * abz - w3 * acz);
    };
    /** BRUTE FORCE over every triangle in the file. No acceleration, no neighbourhood, nothing to get wrong. */
    const nearest = (px: number, py: number, pz: number): { d: number; tri: number } => {
      let best = Infinity; let bi = -1;
      for (let i = 0; i < nTris; i += 1) { const d = d2Tri(px, py, pz, i); if (d < best) { best = d; bi = i; } }
      return { d: Math.sqrt(best), tri: bi };
    };
    const pointAt = (th: number, z: number, side: number): [number, number, number] => {
      const r = rA(canon(th + side * EPS), z);
      return [r * Math.cos(th), r * Math.sin(th), z];
    };
    const um = (mm: number): string => (mm * 1000).toFixed(3);

    const lines: string[] = ['', '===== ARGMAX GROUND TRUTH — is the MESH wrong or is the RULER wrong? =====',
      `file ${file}   ${nTris} triangles read from disk   style ${STYLE} at REGISTRY DEFAULTS`,
      `params ${JSON.stringify(params)}`,
      `one-sided offset ε = ${EPS} rad;  float32 STL quantum at r≈45mm ≈ 2.7 nm (3700× below the ${um(TOL)} µm bar)`,
      ''];

    // ── 1. THE EXACT ARGMAX POINTS reported by the harness ──
    const pts: Array<[string, number, number]> = [];
    const spec = process.env.PF_AT_POINTS;
    if (spec !== undefined) {
      for (const s of spec.split(';')) { const [th, z] = s.split(',').map(Number.parseFloat); if (Number.isFinite(th) && Number.isFinite(z)) pts.push([`env`, th, z]); }
    } else {
      pts.push(['plane-MAX (598.071 µm)', 3.486404, 68.8847]);
      pts.push(['HAUS-MAX  (565.325 µm)', 3.087388, 119.0811]);
    }
    /** the true locus θ nearest to `thPred` at this z, bisected to machine precision and ε→0 VERIFIED to be a jump.
     *  The harness prints argmax θ to 6 decimals, which is ~46 nm of arc — enough that ±ε around the PRINTED value
     *  need not straddle the locus, which is why the naive two-branch test degenerates. Re-locate here instead, so
     *  the decisive test is performed exactly ON the discontinuity at full precision. */
    const locusNear = (z: number, thPred: number, win: number): number => {
      const N = 4096; let best = NaN; let bd = Infinity;
      let pr = rA(canon(thPred - win), z);
      for (let i = 1; i <= N; i += 1) {
        const th = thPred - win + (2 * win * i) / N;
        const cur = rA(canon(th), z);
        if (Math.abs(cur - pr) > TOL) {
          let lo = th - (2 * win) / N; let hi = th;
          for (let k = 0; k < 80; k += 1) {
            const mid = 0.5 * (lo + hi);
            if (mid <= lo || mid >= hi) break;
            if (Math.abs(rA(canon(mid), z) - rA(canon(lo), z)) >= Math.abs(rA(canon(hi), z) - rA(canon(mid), z))) hi = mid; else lo = mid;
          }
          const c = 0.5 * (lo + hi);
          if (Math.abs(rA(canon(c + EPS), z) - rA(canon(c - EPS), z)) > TOL) { const d = Math.abs(c - thPred); if (d < bd) { bd = d; best = c; } }
        }
        pr = cur;
      }
      return best;
    };
    const triSize = (i: number): string => {
      const b = i * 9;
      const e = (p: number, q: number): number => Math.hypot(VX[b + p] - VX[b + q], VX[b + p + 1] - VX[b + q + 1], VX[b + p + 2] - VX[b + q + 2]);
      return `${(e(0, 3) * 1000).toFixed(1)}/${(e(3, 6) * 1000).toFixed(1)}/${(e(6, 0) * 1000).toFixed(1)} µm`;
    };
    lines.push('--- 1. THE EXACT ARGMAX POINTS: both one-sided surface points vs the WHOLE mesh (brute force) ---');
    let worstArg = 0;
    for (const [tag, th, z] of pts) {
      // (a) the surface point AT the reported argmax θ, as printed
      const pAt = pointAt(th, z, -1);
      const nAt = nearest(pAt[0], pAt[1], pAt[2]);
      lines.push(`  ${tag}  θ=${th.toFixed(6)} z=${z.toFixed(4)}`);
      lines.push(`      surface AT the printed argmax θ → nearest STL triangle #${nAt.tri} (${triSize(nAt.tri)}): ${um(nAt.d)} µm   ${nAt.d <= TOL ? 'WITHIN TOLERANCE' : '*** FAR ***'}`);
      // (b) the decisive test: re-locate the TRUE locus at full precision and evaluate BOTH branches exactly on it
      const thL = locusNear(z, th, 2e-4);
      if (!Number.isFinite(thL)) { lines.push('      no verified jump within ±2e-4 rad — nothing two-valued to test here'); worstArg = Math.max(worstArg, nAt.d); continue; }
      const rM = rA(canon(thL - EPS), z); const rP = rA(canon(thL + EPS), z);
      const pm: [number, number, number] = [rM * Math.cos(thL), rM * Math.sin(thL), z];
      const pp: [number, number, number] = [rP * Math.cos(thL), rP * Math.sin(thL), z];
      const nm = nearest(pm[0], pm[1], pm[2]);
      const np = nearest(pp[0], pp[1], pp[2]);
      worstArg = Math.max(worstArg, nAt.d, nm.d, np.d);
      lines.push(`      TRUE locus θ=${thL.toPrecision(17)} (${um(Math.abs(thL - th) * rM)} µm of arc from the argmax);  jump |r⁺−r⁻| = ${um(Math.abs(rP - rM))} µm`);
      lines.push(`      P⁻ (r=${rM.toFixed(6)}) → STL triangle #${nm.tri} (${triSize(nm.tri)}): ${um(nm.d)} µm   ${nm.d <= TOL ? 'WITHIN TOLERANCE' : '*** FAR ***'}`);
      lines.push(`      P⁺ (r=${rP.toFixed(6)}) → STL triangle #${np.tri} (${triSize(np.tri)}): ${um(np.d)} µm   ${np.d <= TOL ? 'WITHIN TOLERANCE' : '*** FAR ***'}`);
    }
    lines.push(`  ⇒ worst of the ${2 * pts.length} one-sided points: ${um(worstArg)} µm  ⇒ ${worstArg <= TOL ? 'MESH IS CORRECT AT THE ARGMAX — the 598 µm reading is an ATTRIBUTION ARTIFACT' : 'GENUINE UNMESHED SHEET — the reading has been true'}`);
    lines.push('');

    // ── 2. THE SAME TEST SWEPT OVER MANY INDEPENDENT LOCUS POINTS (a single point could be luck) ──
    // Find loci with a self-contained scan: bracket on |Δr| > TOL, bisect, then REQUIRE the ε→0 limit to be a jump.
    const lociAtZ = (z: number): number[] => {
      const N = 8192; const out: number[] = [];
      let pr = rA(0, z);
      for (let i = 1; i <= N; i += 1) {
        const th = (TWO_PI * i) / N;
        const cur = rA(canon(th), z);
        if (Math.abs(cur - pr) > TOL) {
          let lo = th - TWO_PI / N; let hi = th;
          for (let k = 0; k < 60; k += 1) {
            const mid = 0.5 * (lo + hi);
            if (mid <= lo || mid >= hi) break;
            if (Math.abs(rA(canon(mid), z) - rA(canon(lo), z)) >= Math.abs(rA(canon(hi), z) - rA(canon(mid), z))) hi = mid; else lo = mid;
          }
          const c = 0.5 * (lo + hi);
          if (Math.abs(rA(canon(c + EPS), z) - rA(canon(c - EPS), z)) > TOL) out.push(c);
        }
        pr = cur;
      }
      return out;
    };
    const ds: number[] = [];
    let sweepWorst = 0; let sweepAt = ''; let probed = 0;
    const far: Array<{ d: number; tri: number; th: number; z: number; side: number }> = [];
    for (let s = 0; s < SWEEP; s += 1) {
      const z = 1 + ((H - 2) * (s + 0.5)) / SWEEP;
      const L = lociAtZ(z);
      if (L.length === 0) continue;
      const th = L[s % L.length];
      for (const side of [-1, +1]) {
        const p = pointAt(th, z, side);
        const nn = nearest(p[0], p[1], p[2]);
        ds.push(nn.d); probed += 1;
        if (nn.d > TOL) far.push({ d: nn.d, tri: nn.tri, th, z, side });
        if (nn.d > sweepWorst) { sweepWorst = nn.d; sweepAt = `θ=${th.toFixed(6)} z=${z.toFixed(4)} side ${side > 0 ? '+' : '−'}`; }
      }
    }
    ds.sort((a, b) => a - b);
    const q = (f: number): number => (ds.length === 0 ? 0 : ds[Math.min(ds.length - 1, Math.floor(f * ds.length))]);
    lines.push(`--- 2. SWEEP: ${probed} one-sided points on ${probed / 2} independent loci, each vs the WHOLE mesh ---`);
    lines.push(`  p50 ${um(q(0.5))}  p90 ${um(q(0.9))}  p99 ${um(q(0.99))}  MAX ${um(sweepWorst)} µm  ${sweepAt === '' ? '' : `@ ${sweepAt}`}`);
    lines.push(`  over-${um(TOL)} µm: ${ds.filter((d) => d > TOL).length}/${ds.length}   ⇒ ${sweepWorst <= TOL ? 'EVERY one-sided surface point on every probed locus is within tolerance of the emitted mesh' : 'at least one genuine gap'}`);
    if (far.length > 0) {
      // DISCRIMINATOR: this STL is from a CAPPED run, so a far point sitting next to a LARGE triangle is ordinary
      // under-refinement (more budget fixes it), while a far point next to a TINY triangle is a structural gap that
      // refinement cannot close. The nearest triangle's edge lengths separate the two without any further runs.
      far.sort((a, b) => b.d - a.d);
      lines.push(`  the ${Math.min(10, far.length)} worst, with the NEAREST triangle's size (large ⇒ under-refinement on a CAPPED mesh; tiny ⇒ structural gap):`);
      for (const f of far.slice(0, 10)) lines.push(`      ${um(f.d).padStart(10)} µm | tri #${f.tri} edges ${triSize(f.tri)} | θ=${f.th.toFixed(6)} z=${f.z.toFixed(4)} side ${f.side > 0 ? '+' : '−'}`);
    }
    lines.push('===========================================================================');
    lines.push('');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  }, 3_000_000);
});
