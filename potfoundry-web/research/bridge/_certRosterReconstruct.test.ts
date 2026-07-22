import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  normalizeNumerator,
  configDigest,
  reconstructPot,
  type Provenance,
} from './_certRosterReconstructLib';
import { CERTIFIED_POTS } from './_certRoster';

describe('reconstruct lib — pure', () => {
  it('normalizes a numerator over oddFactor * 2^fractionBits into [0,1]', () => {
    // dyadic: 3 / 2^3 = 0.375
    expect(normalizeNumerator('3', 3)).toBeCloseTo(0.375, 12);
    // odd factor: 5 / (3 * 2^2) = 5/12
    expect(normalizeNumerator('5', 2, '3')).toBeCloseTo(5 / 12, 12);
  });

  it('configDigest is stable and order-independent for a pot', () => {
    const pot = CERTIFIED_POTS[0];
    expect(configDigest(pot)).toBe(configDigest(pot));
    expect(configDigest(pot)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('configDigest is sensitive to styleId', () => {
    const pot = CERTIFIED_POTS[0];
    // styleId is a real input to atlas(...) and changes the geometry, so it must
    // participate in the digest — otherwise two distinct configs collide.
    expect(configDigest({ ...pot, styleId: 'ZZZ_nonexistent' })).not.toBe(
      configDigest(pot)
    );
  });
});

describe('reconstruct lib — one small pot', () => {
  it('emits a loc buffer with count == triangleCount and (u,v) in [0,1]', () => {
    const pot = CERTIFIED_POTS.find((p) => p.name === 'HarmonicRipple_small_OD30');
    if (!pot) throw new Error('roster missing HarmonicRipple_small_OD30');
    const r = reconstructPot(pot);
    const nl = r.locBuffer.indexOf(0x0a);
    const header = JSON.parse(r.locBuffer.subarray(0, nl).toString('utf8'));
    expect(header.magic).toBe('potscope-loc/v1');
    expect(header.count).toBe(r.triangleCount);
    // COPY the body — the payload starts at an unaligned offset (nl+1), so a
    // Float32Array view over r.locBuffer.buffer would throw. Same pattern readLoc uses.
    const body = new Float32Array(r.triangleCount * 7);
    Buffer.from(body.buffer).set(r.locBuffer.subarray(nl + 1, nl + 1 + r.triangleCount * 7 * 4));
    for (let t = 0; t < r.triangleCount; t += 1) {
      for (let k = 0; k < 3; k += 1) {
        const u = body[t * 7 + 1 + k * 2];
        const v = body[t * 7 + 2 + k * 2];
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(r.provenance.targetSha256).toMatch(/^[0-9a-f]{64}$/);
  }, 60_000);
});

const OUT_DIR = join(__dirname, '..', 'exchange', '_certified_stl');
const RECON_SELECTOR = process.env.PF_CERT_RECON;
const reconSelected = (name: string): boolean =>
  RECON_SELECTOR !== undefined &&
  (RECON_SELECTOR === 'all' ||
    name.toLowerCase().includes(RECON_SELECTOR.toLowerCase()));

type Verdict = 'GREEN' | 'DRIFT' | 'STL-MISSING';

function committedProvenance(errPath: string): Provenance | null {
  if (!existsSync(errPath)) return null;
  const raw = readFileSync(errPath);
  const nl = raw.indexOf(0x0a);
  const hdr = JSON.parse(raw.subarray(0, nl).toString('utf8'));
  return hdr.provenance ?? null;
}

describe('reconstruct driver — guard + writer', () => {
  for (const pot of CERTIFIED_POTS) {
    it(
      `guard: ${pot.name} does not drift from committed STL`,
      { timeout: 120_000 },
      () => {
        const stlPath = join(OUT_DIR, `${pot.name}.stl`);
        if (!existsSync(stlPath)) {
          // eslint-disable-next-line no-console
          console.log(`[probe:recon] ${pot.name} STL-MISSING (skip guard)`);
          return;
        }
        const result = reconstructPot(pot);
        const recorded = committedProvenance(`${stlPath}.error.bin`);
        const committed = readFileSync(stlPath);
        let verdict: Verdict;
        let targetStl = stlPath;
        if (!committed.equals(result.stlBytes)) {
          verdict = 'DRIFT';
          targetStl = join(OUT_DIR, `${pot.name}.regen.stl`);
        } else if (
          recorded &&
          recorded.targetSha256 !== result.provenance.targetSha256
        ) {
          verdict = 'DRIFT';
        } else {
          verdict = 'GREEN';
        }

        if (reconSelected(pot.name)) {
          if (verdict === 'DRIFT' && targetStl.endsWith('.regen.stl')) {
            writeFileSync(targetStl, result.stlBytes);
          }
          writeFileSync(`${targetStl}.loc.bin`, result.locBuffer);
          writeFileSync(
            join(OUT_DIR, `${pot.name}.recon.json`),
            JSON.stringify(
              {
                name: pot.name,
                style: pot.styleId,
                tris: result.triangleCount,
                configDigest: configDigest(pot),
                provenance: result.provenance,
                verdict,
                recorded,
              },
              null,
              2
            )
          );
          // eslint-disable-next-line no-console
          console.log(
            `[probe:recon] ${pot.name} ${verdict} tris=${result.triangleCount} wrote loc.bin+recon.json`
          );
        }

        expect(verdict, `${pot.name} drifted from committed STL`).not.toBe('DRIFT');
      }
    );
  }
});
