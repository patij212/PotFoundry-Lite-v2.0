// potfoundry-web/research/bridge/exchange.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeOracleInput, readOracleOutput, type OracleInput, type OracleOutput } from './exchange';

describe('exchange round-trip', () => {
  it('writes OracleInput as JSON and reads OracleOutput back losslessly', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pf-oracle-'));
    try {
      const input: OracleInput = {
        style: 'Cyl', H: 120, domain: { uPeriodic: true },
        sizing: { resU: 2, resT: 2, h: [0.1, 0.1, 0.1, 0.1] }, ours: null,
      };
      writeOracleInput(dir, input);
      const parsed = JSON.parse(readFileSync(join(dir, 'input.json'), 'utf8'));
      expect(parsed.style).toBe('Cyl');
      expect(parsed.sizing.h).toHaveLength(4);

      const out: OracleOutput = { engine: 'triangle', config: { minAngle: 30 },
        ut: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2], engineMs: 5, engineVersion: '20230923' };
      writeFileSync(join(dir, 'out.json'), JSON.stringify(out));
      const back = readOracleOutput(join(dir, 'out.json'));
      expect(back.indices).toEqual([0, 1, 2]);
      expect(back.ut).toHaveLength(6);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
