// potfoundry-web/research/bridge/exchange.ts
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface OracleInput {
  style: string;
  H: number;
  domain: { uPeriodic: boolean };
  sizing: { resU: number; resT: number; h: number[] };
  /** Anisotropic metric field (optional). When present, the gmsh adapter uses BAMG (Algorithm 7). */
  metric?: { resU: number; resT: number; m: number[] };
  /** Our conforming (u,t) mesh for comparison; null if not extractable (use grid fallback). */
  ours: { ut: number[]; indices: number[] } | null;
}

export interface OracleOutput {
  engine: string;
  config: Record<string, unknown>;
  ut: number[];        // flat [u0,t0, u1,t1, ...]
  indices: number[];   // flat [i0,i1,i2, ...]
  engineMs: number;
  engineVersion: string;
}

export function writeOracleInput(dir: string, input: OracleInput): void {
  writeFileSync(join(dir, 'input.json'), JSON.stringify(input));
}

export function readOracleOutput(path: string): OracleOutput {
  return JSON.parse(readFileSync(path, 'utf8')) as OracleOutput;
}
