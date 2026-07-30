// _sizingFieldArtifact.ts — PHASE-0 SIZING-FIELD ARTIFACT: schema, writer, and READER API.
// DEV-ONLY research module. Nothing in src/ may import this.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS IS FOR
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// `_sizingFeasibilityLib.ts` answers "does the demand fit the cap?" as an aggregate. A DRIVER cannot consume an
// aggregate. This module turns the same sweep into a per-cell artifact the driver's PHASE 0 can read:
//
//     for each (θ,z) cell   →   target edge length h,   measured decay exponent p,   class (smooth/crease/jump),
//                               local surface area,     and THE PERSISTENCE VERDICT (does the jump survive a
//                                                       halving of the probe pitch?)
//
// The persistence verdict is the routing signal: a cell whose jump class SURVIVES is genuine C0 and belongs to
// the CURTAIN stage; one that EVAPORATES is a steep crease and belongs to DIRECTED bisection. No style-keyed
// dispatch anywhere — the verdict is measured from the surface, which is what shape-agnostic has to mean.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE ARTIFACT IS TWO FILES, AND THE JSON IS AUTHORITATIVE
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//   <base>.cells.json   provenance + options + summary + CAVEATS + convergence + the binary's field table
//                       + a rounded copy of every per-cell column (so the artifact is self-contained and
//                         readable without the binary at all).
//   <base>.cells.bin    the same columns as exact IEEE-754 f32 / u8. ~35 B per cell; a 240×160 grid is 1.3 MB.
//                       Present because the JSON copy is ROUNDED (6 significant digits) and because a driver
//                       should not parse a 3 MB JSON per style on every run.
// A reader given only the JSON works. A reader given both prefers the binary and VERIFIES it (magic, grid,
// byte length) before doing so — a stale .bin next to a fresh .json is exactly the desync shape this repo has
// been bitten by before, so the mismatch is a hard error, not a fallback.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// PROVENANCE IS PART OF THE PAYLOAD, NOT A COMMENT
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The artifact records the style, the exact params, the pot dims, the tolerance, the grid, and every solver
// option it was computed at. `SizingFieldReader.verifyProvenance()` returns the list of MISMATCHES against what
// the consumer believes it is meshing, so a consumer can refuse rather than assume. A sizing field computed at
// other params is not "approximately right" — it is a different surface.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE CAVEATS ARE FIELDS. Read `artifact.caveats` before believing a count.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//   countsAreLowerBound      — the sweep measures 1-D EDGE sagitta; the auditor judges facet INTERIORS
//                              (point-to-triangle). Equal to within a small constant for well-shaped isotropic
//                              triangles, NOT equal for slivers or locus-straddling facets. Every triangle count
//                              in this artifact is therefore a LOWER bound on what a real mesher needs.
//   classSharesAreGridDependent — the class band is over-wide by ~1 cell either side (lib §A6) and narrows as
//                              the grid refines. NEVER consume a class SHARE as if it were grid-independent;
//                              consume the per-cell class as a local routing hint and the CURTAIN AREA (which is
//                              an area-element excess and does not suffer the band widening) as the quantity.
//   gridConverged            — per style, measured by re-running at 2× the grid, not asserted. null when the
//                              check was not run.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import {
  CELL_FLAG_ROUTED_CURTAIN, CELL_FLAG_PERSIST_JUMP,
  type SizingCell, type SizingClass, type SizingFeasOpts, type SizingFeasResult,
} from './_sizingFeasibilityLib';

export const SIZING_FIELD_SCHEMA = 'pf.sizingField/1';
export const SIZING_FIELD_MAGIC = 'PFSZFLD1';
/** magic(8) + u32 version + u32 nU + u32 nV + u32 nCells + u32 headerBytes + 2×u32 reserved */
export const SIZING_FIELD_HEADER_BYTES = 32;

const CLASS_CODE: Record<SizingClass, number> = { smooth: 0, crease: 1, jump: 2 };
const CODE_CLASS: readonly SizingClass[] = ['smooth', 'crease', 'jump'];

/** f32 columns, in binary order. */
const F32_COLUMNS = [
  'hConfMm', 'hConfMaxMm', 'hStrMm', 'pCoarse', 'pFine', 'areaMm2', 'cliffAreaMm2', 'jumpMm',
] as const;
/** u8 columns, in binary order (after every f32 column). */
const U8_COLUMNS = ['cls', 'clsFine', 'flags', 'present'] as const;

export type F32ColumnName = (typeof F32_COLUMNS)[number];
export type U8ColumnName = (typeof U8_COLUMNS)[number];

export interface SizingFieldDims { H: number; Rb: number; Rt: number; expn: number }

export interface SizingFieldProvenance {
  style: string;
  params: Record<string, number>;
  dims: SizingFieldDims;
  /** how the surface was built — the ONE definition both the driver and the auditor use. */
  radiusFn: string;
  /** stable single-line key of style+params+dims, for a cheap equality check. */
  key: string;
  node: string;
  generatedAt: string;
  tool: string;
  lib: string;
}

export interface SizingFieldGrid {
  nU: number;
  nV: number;
  nCells: number;
  /** θ of a cell centre = TAU*(iu+0.5)/nU. */
  dThetaRad: number;
  /** z of a cell centre = H*(iv+0.5)/nV. */
  dZmm: number;
  order: string;
  thetaOfCell: string;
  zOfCell: string;
}

/** Per-style roll-up. Every triangle count is a LOWER bound (see caveats). */
export interface SizingFieldSummary {
  areaMm2: number;
  areaNaiveMm2: number;
  /** cell counts by COARSE class. */
  cellsByClass: Record<SizingClass, number>;
  /** surface area by COARSE class, mm². */
  areaByClass: Record<SizingClass, number>;
  /** jump-classified cells, and how many of them SURVIVED the probe-pitch halving. */
  jumpCells: number;
  jumpPersistCells: number;
  jumpEvaporatedCells: number;
  /** cells not jump at the cell pitch but jump at half of it — a sub-cell cliff. Diagnostic only. */
  emergentJumpCells: number;
  /** cells routed to the curtain stage. */
  routedCells: number;
  /** curtain area implied by the ROUTED cells, mm² (the honest one), and by every jump cell (for comparison). */
  curtainAreaPersistMm2: number;
  curtainAreaAllJumpMm2: number;
  maxJumpMm: number;
  /** THE DEMAND SPLIT. bisection = nBisect (non-routed cells) + nRoutedFlat (a routed cell's non-cliff part). */
  nBisect: number;
  nRoutedFlat: number;
  nBisectTotal: number;
  nCurtain: number;
  nTotal: number;
  /** the un-routed reference numbers the aggregate tool prints, kept so the two reports can be reconciled. */
  nConfIsoNoRouting: number;
  nConfAnisoAR: number;
  nStraddle: number;
  triCap: number;
  /** nTotal / triCap. */
  xCap: number;
  worstConfMm: number;
  worstConfTheta: number;
  worstConfZ: number;
  flooredConfCells: number;
  saturatedConfCells: number;
  seconds: number;
  rEvals: number;
}

export interface SizingFieldConvergence {
  /** the comparison grid, or null when the check was not run. */
  nU: number | null;
  nV: number | null;
  /** ratio (fine / coarse) of the conforming-isotropic demand. */
  confIsoRatio: number | null;
  /** ratio of worst conforming h. */
  worstConfRatio: number | null;
  /** ratio of the persisted-jump curtain area. */
  curtainAreaPersistRatio: number | null;
  /** persisted-jump cell AREA share at each grid — the number that tells genuine C0 from a steep crease. */
  persistAreaShareCoarse: number | null;
  persistAreaShareFine: number | null;
  /** |ratio−1| ≤ tolerance on BOTH demand and worst h. null when not run. */
  converged: boolean | null;
  toleranceRel: number;
  note: string;
}

export interface SizingFieldCaveats {
  countsAreLowerBound: true;
  lowerBoundReason: string;
  classSharesAreGridDependent: true;
  gridDependenceReason: string;
  computedAtGrid: string;
  gridConverged: boolean | null;
  persistenceIsNotAProof: string;
  jsonColumnsAreRounded: string;
  notACertificate: string;
}

export interface SizingFieldCellsJson {
  order: string;
  encoding: string;
  hConfMm: number[];
  hConfMaxMm: number[];
  hStrMm: number[];
  pCoarse: number[];
  pFine: number[];
  areaMm2: number[];
  cliffAreaMm2: number[];
  jumpMm: number[];
  /** one digit per cell: 0 smooth, 1 crease, 2 jump. */
  cls: string;
  clsFine: string;
  /** one base-36 char per cell — CELL_FLAG_* bits. */
  flags: string;
  /** one char per cell: '1' emitted, '0' outside zMargin (no data). */
  present: string;
}

export interface SizingFieldBinaryDesc {
  file: string;
  magic: string;
  headerBytes: number;
  byteLength: number;
  /** f32 columns are written in the WRITER's native byte order. Recorded so a reader can refuse, not guess. */
  endian: 'little' | 'big';
  fields: { name: string; dtype: 'f32' | 'u8'; offset: number; count: number }[];
}

/** native byte order of the running process — the f32 columns are memcpy'd, not serialised field by field. */
export function nativeEndian(): 'little' | 'big' {
  const probe = new Uint8Array(new Uint16Array([1]).buffer);
  return probe[0] === 1 ? 'little' : 'big';
}

export interface SizingFieldArtifact {
  schema: string;
  provenance: SizingFieldProvenance;
  grid: SizingFieldGrid;
  opts: SizingFeasOpts;
  summary: SizingFieldSummary;
  convergence: SizingFieldConvergence;
  caveats: SizingFieldCaveats;
  binary: SizingFieldBinaryDesc | null;
  cells: SizingFieldCellsJson;
}

// ───────────────────────────── builder ─────────────────────────────

/** Column store filled by a `SizingCellSink`. Allocates the whole grid up front; unfilled cells read present=0. */
export class SizingFieldBuilder {
  readonly nU: number;
  readonly nV: number;
  readonly nCells: number;
  private readonly f32: Record<F32ColumnName, Float32Array>;
  private readonly u8: Record<U8ColumnName, Uint8Array>;
  private filled = 0;

  constructor(nU: number, nV: number) {
    this.nU = nU; this.nV = nV; this.nCells = nU * nV;
    const mk = (): Float32Array => new Float32Array(this.nCells);
    this.f32 = {
      hConfMm: mk(), hConfMaxMm: mk(), hStrMm: mk(), pCoarse: mk(), pFine: mk(),
      areaMm2: mk(), cliffAreaMm2: mk(), jumpMm: mk(),
    };
    this.u8 = {
      cls: new Uint8Array(this.nCells), clsFine: new Uint8Array(this.nCells),
      flags: new Uint8Array(this.nCells), present: new Uint8Array(this.nCells),
    };
  }

  /** the `SizingCellSink` to hand to `sizingFeasibility`. Copies out — the source object is reused. */
  readonly sink = (c: SizingCell): void => {
    const k = c.iv * this.nU + c.iu;
    if (k < 0 || k >= this.nCells) throw new Error(`cell (${c.iu},${c.iv}) outside grid ${this.nU}x${this.nV}`);
    this.f32.hConfMm[k] = c.hConfMm;
    this.f32.hConfMaxMm[k] = c.hConfMaxMm;
    this.f32.hStrMm[k] = c.hStrMm;
    this.f32.pCoarse[k] = c.p;
    this.f32.pFine[k] = c.pFine;
    this.f32.areaMm2[k] = c.areaMm2;
    this.f32.cliffAreaMm2[k] = c.cliffAreaMm2;
    this.f32.jumpMm[k] = c.jumpMm;
    this.u8.cls[k] = CLASS_CODE[c.cls];
    this.u8.clsFine[k] = CLASS_CODE[c.clsFine];
    this.u8.flags[k] = c.flags & 0xff;
    this.u8.present[k] = 1;
    this.filled += 1;
  };

  get cellsFilled(): number { return this.filled; }

  /** IEEE-754-exact payload, laid out exactly as `binaryDesc()` declares. */
  encodeBinary(): Uint8Array {
    const n = this.nCells;
    const bytes = SIZING_FIELD_HEADER_BYTES + n * (4 * F32_COLUMNS.length + U8_COLUMNS.length);
    const buf = new Uint8Array(bytes);
    for (let i = 0; i < 8; i += 1) buf[i] = SIZING_FIELD_MAGIC.charCodeAt(i);
    const dv = new DataView(buf.buffer);
    dv.setUint32(8, 1, true);
    dv.setUint32(12, this.nU, true);
    dv.setUint32(16, this.nV, true);
    dv.setUint32(20, n, true);
    dv.setUint32(24, SIZING_FIELD_HEADER_BYTES, true);
    dv.setUint32(28, 0, true);
    let off = SIZING_FIELD_HEADER_BYTES;
    for (const name of F32_COLUMNS) {
      const a = this.f32[name];
      buf.set(new Uint8Array(a.buffer, a.byteOffset, n * 4), off);
      off += n * 4;
    }
    for (const name of U8_COLUMNS) { buf.set(this.u8[name], off); off += n; }
    return buf;
  }

  binaryDesc(file: string): SizingFieldBinaryDesc {
    const n = this.nCells;
    const fields: SizingFieldBinaryDesc['fields'] = [];
    let off = SIZING_FIELD_HEADER_BYTES;
    for (const name of F32_COLUMNS) { fields.push({ name, dtype: 'f32', offset: off, count: n }); off += n * 4; }
    for (const name of U8_COLUMNS) { fields.push({ name, dtype: 'u8', offset: off, count: n }); off += n; }
    return {
      file, magic: SIZING_FIELD_MAGIC, headerBytes: SIZING_FIELD_HEADER_BYTES, byteLength: off,
      endian: nativeEndian(), fields,
    };
  }

  /** rounded, human-inspectable copy of every column. The binary is the exact one. */
  encodeJsonCells(): SizingFieldCellsJson {
    const sig = (a: Float32Array, digits: number): number[] => {
      const out = new Array<number>(a.length);
      for (let i = 0; i < a.length; i += 1) out[i] = a[i] === 0 ? 0 : Number(a[i].toPrecision(digits));
      return out;
    };
    const digits = (a: Uint8Array): string => {
      let s = '';
      for (let i = 0; i < a.length; i += 1) s += String(a[i]);
      return s;
    };
    const b36 = (a: Uint8Array): string => {
      let s = '';
      for (let i = 0; i < a.length; i += 1) s += a[i].toString(36);
      return s;
    };
    return {
      order: 'row-major, index = iv*nU + iu',
      encoding: 'cls/clsFine: one digit per cell (0 smooth, 1 crease, 2 jump). flags: one base-36 char per cell '
        + '(bit0 persistJump, bit1 routedCurtain, bit2 confFloored, bit3 confSaturated, bit4 strFloored). '
        + 'present: 1 = cell emitted, 0 = excluded by zMargin. Numeric columns are ROUNDED to 6 significant '
        + 'digits — use the .bin for exact f32 values.',
      hConfMm: sig(this.f32.hConfMm, 6),
      hConfMaxMm: sig(this.f32.hConfMaxMm, 6),
      hStrMm: sig(this.f32.hStrMm, 6),
      pCoarse: sig(this.f32.pCoarse, 6),
      pFine: sig(this.f32.pFine, 6),
      areaMm2: sig(this.f32.areaMm2, 6),
      cliffAreaMm2: sig(this.f32.cliffAreaMm2, 6),
      jumpMm: sig(this.f32.jumpMm, 6),
      cls: digits(this.u8.cls),
      clsFine: digits(this.u8.clsFine),
      flags: b36(this.u8.flags),
      present: digits(this.u8.present),
    };
  }
}

// ───────────────────────────── summary / caveats assembly ─────────────────────────────

export function styleKey(style: string, params: Record<string, number>, dims: SizingFieldDims, tolMm: number): string {
  const ps = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join(',');
  return `${style}|${ps}|H=${dims.H},Rb=${dims.Rb},Rt=${dims.Rt},expn=${dims.expn}|tol=${tolMm}`;
}

export function summarize(res: SizingFeasResult, triCap: number): SizingFieldSummary {
  const p = res.persist;
  const nBisectTotal = p.nBisect + p.nRoutedFlat;
  const nTotal = nBisectTotal + p.nCurtainPersist;
  return {
    areaMm2: res.areaMm2,
    areaNaiveMm2: res.areaNaiveMm2,
    cellsByClass: {
      smooth: res.byClass.smooth.samples, crease: res.byClass.crease.samples, jump: res.byClass.jump.samples,
    },
    areaByClass: {
      smooth: res.byClass.smooth.areaMm2, crease: res.byClass.crease.areaMm2, jump: res.byClass.jump.areaMm2,
    },
    jumpCells: p.jumpCells,
    jumpPersistCells: p.jumpPersistCells,
    jumpEvaporatedCells: p.jumpEvaporatedCells,
    emergentJumpCells: p.emergentJumpCells,
    routedCells: p.routedCells,
    curtainAreaPersistMm2: p.curtainAreaPersistMm2,
    curtainAreaAllJumpMm2: res.curtainAreaMm2,
    maxJumpMm: res.maxJumpMm,
    nBisect: p.nBisect,
    nRoutedFlat: p.nRoutedFlat,
    nBisectTotal,
    nCurtain: p.nCurtainPersist,
    nTotal,
    nConfIsoNoRouting: res.nConfIso,
    nConfAnisoAR: res.nConfAnisoAR,
    nStraddle: res.nStraddle,
    triCap,
    xCap: nTotal / triCap,
    worstConfMm: res.worstConfMm,
    worstConfTheta: res.worstConfTheta,
    worstConfZ: res.worstConfZ,
    flooredConfCells: res.flooredConfSamples,
    saturatedConfCells: res.saturatedConfSamples,
    seconds: res.seconds,
    rEvals: res.rEvals,
  };
}

export function makeCaveats(nU: number, nV: number, gridConverged: boolean | null): SizingFieldCaveats {
  return {
    countsAreLowerBound: true,
    lowerBoundReason:
      'This field is solved from 1-D EDGE sagitta (chord sag along a tangent direction). The facet-truth auditor '
      + 'judges point-to-triangle distance over a facet INTERIOR. The two agree to within a small constant for '
      + 'well-shaped isotropic triangles and do NOT agree for slivers or for facets straddling a locus. Every '
      + 'triangle count here is therefore a LOWER bound on what a real mesher needs. Additional lower-bound '
      + 'pressure: a finite set of probe directions, no Lipschitz grading of h, and 2 triangles per h-by-h patch '
      + '(an equilateral tiling needs 2.31).',
    classSharesAreGridDependent: true,
    gridDependenceReason:
      'The class exponent is read from a probe-centre scan spanning one cell, so the crease/jump BAND is '
      + 'over-wide by ~1 cell either side and narrows as the grid refines. Consume the per-cell class as a LOCAL '
      + 'routing hint, and the curtain AREA (an area-element excess, ~0 in a merely-adjacent cell) as the '
      + 'quantity. Do NOT consume a class SHARE as if it were grid-independent.',
    computedAtGrid: `${nU}x${nV} cells in (theta, z)`,
    gridConverged,
    persistenceIsNotAProof:
      'persistJump means "the straddling sag did not decay over a 2x range of probe pitch at the cell scale". '
      + 'That is the same discriminator as refining the integration grid, applied locally, and it is a routing '
      + 'signal — not a proof of C0. A feature narrower than the finest probe (span/8) can still be missed.',
    jsonColumnsAreRounded:
      'cells.* in this JSON are rounded to 6 significant digits. The sibling .bin holds the exact f32 values.',
    notACertificate:
      'A feasibility estimate, not a certificate. The only sound verdict on a mesh is the end-of-run facet-truth '
      + 'pass (H2, true 3D). Use this field to ALLOCATE, never to CLAIM.',
  };
}

export function noConvergence(note: string): SizingFieldConvergence {
  return {
    nU: null, nV: null, confIsoRatio: null, worstConfRatio: null, curtainAreaPersistRatio: null,
    persistAreaShareCoarse: null, persistAreaShareFine: null, converged: null, toleranceRel: 0.15, note,
  };
}

/**
 * Convergence flag from two grids. `coarse` is the emitted grid; `fine` is a re-run at (typically) 2×.
 * CONVERGED means the demand AND the worst h both moved by less than `toleranceRel`. It does NOT mean the
 * class shares converged — those are reported separately and are expected to move.
 */
export function convergenceFrom(
  coarse: SizingFeasResult, fine: SizingFeasResult, fineNU: number, fineNV: number, toleranceRel = 0.15,
): SizingFieldConvergence {
  const r = (a: number, b: number): number | null => (b > 0 && Number.isFinite(a) ? a / b : null);
  const confIsoRatio = r(fine.nConfIso, coarse.nConfIso);
  const worstConfRatio = r(fine.worstConfMm, coarse.worstConfMm);
  const curtainRatio = fine.persist.curtainAreaPersistMm2 > 0 || coarse.persist.curtainAreaPersistMm2 > 0
    ? r(fine.persist.curtainAreaPersistMm2, coarse.persist.curtainAreaPersistMm2)
    : 1;
  const ok = (x: number | null): boolean => x !== null && Math.abs(x - 1) <= toleranceRel;
  const shareC = coarse.areaMm2 > 0 ? coarse.persist.curtainAreaPersistMm2 / coarse.areaMm2 : null;
  const shareF = fine.areaMm2 > 0 ? fine.persist.curtainAreaPersistMm2 / fine.areaMm2 : null;
  return {
    nU: fineNU, nV: fineNV,
    confIsoRatio, worstConfRatio, curtainAreaPersistRatio: curtainRatio,
    persistAreaShareCoarse: shareC, persistAreaShareFine: shareF,
    converged: ok(confIsoRatio) && ok(worstConfRatio),
    toleranceRel,
    note: 'ratios are fine/coarse. converged = demand AND worst h both within toleranceRel. Class SHARES are '
      + 'expected to move and are not part of the flag.',
  };
}

// ───────────────────────────── writer ─────────────────────────────

export interface WriteResult { jsonPath: string; binPath: string; jsonBytes: number; binBytes: number }

export function writeSizingFieldArtifact(dir: string, base: string, artifact: SizingFieldArtifact, bin: Uint8Array): WriteResult {
  mkdirSync(dir, { recursive: true });
  const jsonPath = join(dir, `${base}.cells.json`);
  const binPath = join(dir, `${base}.cells.bin`);
  writeFileSync(binPath, bin);
  const text = JSON.stringify(artifact, null, 1);
  writeFileSync(jsonPath, text);
  return { jsonPath, binPath, jsonBytes: Buffer.byteLength(text), binBytes: bin.byteLength };
}

// ───────────────────────────── READER API ─────────────────────────────

/** A decoded cell. Plain object, freshly allocated — safe to keep. */
export interface SizingFieldCellView {
  iu: number;
  iv: number;
  theta: number;
  z: number;
  hConfMm: number;
  hConfMaxMm: number;
  hStrMm: number;
  pCoarse: number;
  pFine: number;
  areaMm2: number;
  cliffAreaMm2: number;
  jumpMm: number;
  cls: SizingClass;
  clsFine: SizingClass;
  flags: number;
  /** the routing verdict: true ⇒ curtain stage, false ⇒ bisection. */
  routedToCurtain: boolean;
  persistJump: boolean;
}

/** What a consumer believes it is meshing. Every field optional — only what is given is checked. */
export interface ProvenanceExpectation {
  style?: string;
  params?: Record<string, number>;
  dims?: Partial<SizingFieldDims>;
  tolMm?: number;
  nU?: number;
  nV?: number;
  /** relative tolerance for numeric comparisons (params, dims, tol). Default exact. */
  relTol?: number;
}

const TAU = 2 * Math.PI;

/**
 * Read-side of the artifact. Constructed by `readSizingFieldArtifact`.
 *
 * The two calls a driver's PHASE 0 actually needs are `verifyProvenance` (refuse a field computed for a
 * different surface) and `cellAt(theta, z)` (target h + class + routing verdict).
 */
export class SizingFieldReader {
  readonly artifact: SizingFieldArtifact;
  readonly nU: number;
  readonly nV: number;
  readonly H: number;
  /** 'bin' when the exact f32 payload was loaded, 'json' when only the rounded columns were available. */
  readonly source: 'bin' | 'json';
  private readonly f32: Record<F32ColumnName, Float32Array>;
  private readonly u8: Record<U8ColumnName, Uint8Array>;

  constructor(artifact: SizingFieldArtifact, binBuf: Uint8Array | null) {
    this.artifact = artifact;
    this.nU = artifact.grid.nU;
    this.nV = artifact.grid.nV;
    this.H = artifact.provenance.dims.H;
    const n = this.nU * this.nV;
    if (artifact.grid.nCells !== n) throw new Error(`artifact grid.nCells ${artifact.grid.nCells} != nU*nV ${n}`);

    if (binBuf !== null) {
      const desc = artifact.binary;
      if (desc === null) throw new Error('binary supplied but the JSON declares no binary layout');
      if (binBuf.byteLength !== desc.byteLength) {
        throw new Error(`binary length ${binBuf.byteLength} != declared ${desc.byteLength} — STALE .bin next to a fresh .json; regenerate, do not fall back`);
      }
      let magic = '';
      for (let i = 0; i < 8; i += 1) magic += String.fromCharCode(binBuf[i]);
      if (magic !== SIZING_FIELD_MAGIC) throw new Error(`binary magic '${magic}' != '${SIZING_FIELD_MAGIC}'`);
      if (desc.endian !== nativeEndian()) {
        throw new Error(`binary was written ${desc.endian}-endian, this host is ${nativeEndian()}-endian — read the JSON columns instead (preferJson:true)`);
      }
      // copy to a fresh, 4-aligned ArrayBuffer — a Node Buffer's byteOffset is not guaranteed aligned
      const ab = binBuf.buffer.slice(binBuf.byteOffset, binBuf.byteOffset + binBuf.byteLength);
      const dv = new DataView(ab);
      if (dv.getUint32(12, true) !== this.nU || dv.getUint32(16, true) !== this.nV) {
        throw new Error('binary grid header disagrees with the JSON grid');
      }
      const f32: Partial<Record<F32ColumnName, Float32Array>> = {};
      const u8: Partial<Record<U8ColumnName, Uint8Array>> = {};
      for (const f of desc.fields) {
        if (f.dtype === 'f32') f32[f.name as F32ColumnName] = new Float32Array(ab, f.offset, f.count);
        else u8[f.name as U8ColumnName] = new Uint8Array(ab, f.offset, f.count);
      }
      this.f32 = f32 as Record<F32ColumnName, Float32Array>;
      this.u8 = u8 as Record<U8ColumnName, Uint8Array>;
      this.source = 'bin';
    } else {
      const c = artifact.cells;
      const fromArr = (a: number[]): Float32Array => Float32Array.from(a);
      const fromDigits = (s: string): Uint8Array => {
        const out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) - 48;
        return out;
      };
      const fromB36 = (s: string): Uint8Array => {
        const out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i += 1) out[i] = Number.parseInt(s[i], 36);
        return out;
      };
      this.f32 = {
        hConfMm: fromArr(c.hConfMm), hConfMaxMm: fromArr(c.hConfMaxMm), hStrMm: fromArr(c.hStrMm),
        pCoarse: fromArr(c.pCoarse), pFine: fromArr(c.pFine), areaMm2: fromArr(c.areaMm2),
        cliffAreaMm2: fromArr(c.cliffAreaMm2), jumpMm: fromArr(c.jumpMm),
      };
      this.u8 = {
        cls: fromDigits(c.cls), clsFine: fromDigits(c.clsFine), flags: fromB36(c.flags), present: fromDigits(c.present),
      };
      this.source = 'json';
    }
    for (const name of U8_COLUMNS) {
      if (this.u8[name].length !== n) throw new Error(`column '${name}' has ${this.u8[name].length} entries, expected ${n}`);
    }
  }

  /** row-major index, or −1 outside the grid. θ wraps; z is NOT clamped (a z outside [0,H] is a caller bug). */
  indexAt(theta: number, z: number): number {
    let t = theta % TAU;
    if (t < 0) t += TAU;
    const iu = Math.min(this.nU - 1, Math.floor((t / TAU) * this.nU));
    const iv = Math.floor((z / this.H) * this.nV);
    if (iv < 0 || iv >= this.nV) return -1;
    return iv * this.nU + iu;
  }

  /** true when the cell carries data (cells excluded by zMargin do not). */
  isPresent(k: number): boolean { return k >= 0 && k < this.u8.present.length && this.u8.present[k] === 1; }

  at(iu: number, iv: number): SizingFieldCellView | null { return this.byIndex(iv * this.nU + iu); }

  cellAt(theta: number, z: number): SizingFieldCellView | null { return this.byIndex(this.indexAt(theta, z)); }

  byIndex(k: number): SizingFieldCellView | null {
    if (!this.isPresent(k)) return null;
    const iu = k % this.nU;
    const iv = (k - iu) / this.nU;
    const flags = this.u8.flags[k];
    return {
      iu, iv,
      theta: (TAU * (iu + 0.5)) / this.nU,
      z: (this.H * (iv + 0.5)) / this.nV,
      hConfMm: this.f32.hConfMm[k],
      hConfMaxMm: this.f32.hConfMaxMm[k],
      hStrMm: this.f32.hStrMm[k],
      pCoarse: this.f32.pCoarse[k],
      pFine: this.f32.pFine[k],
      areaMm2: this.f32.areaMm2[k],
      cliffAreaMm2: this.f32.cliffAreaMm2[k],
      jumpMm: this.f32.jumpMm[k],
      cls: CODE_CLASS[this.u8.cls[k]] ?? 'smooth',
      clsFine: CODE_CLASS[this.u8.clsFine[k]] ?? 'smooth',
      flags,
      routedToCurtain: (flags & CELL_FLAG_ROUTED_CURTAIN) !== 0,
      persistJump: (flags & CELL_FLAG_PERSIST_JUMP) !== 0,
    };
  }

  /** target edge length at (θ,z), or NaN where there is no data. */
  hAt(theta: number, z: number): number {
    const k = this.indexAt(theta, z);
    return this.isPresent(k) ? this.f32.hConfMm[k] : Number.NaN;
  }

  classAt(theta: number, z: number): SizingClass | null {
    const k = this.indexAt(theta, z);
    return this.isPresent(k) ? (CODE_CLASS[this.u8.cls[k]] ?? 'smooth') : null;
  }

  /** THE ROUTING QUESTION: does this cell go to the curtain stage instead of to bisection? */
  isCurtainAt(theta: number, z: number): boolean {
    const k = this.indexAt(theta, z);
    return this.isPresent(k) && (this.u8.flags[k] & CELL_FLAG_ROUTED_CURTAIN) !== 0;
  }

  /** iterate present cells. `fn` gets a fresh view per cell. */
  forEachCell(fn: (c: SizingFieldCellView) => void): void {
    for (let k = 0; k < this.u8.present.length; k += 1) {
      const v = this.byIndex(k);
      if (v !== null) fn(v);
    }
  }

  /** raw column access for bulk consumers that do not want per-cell objects. */
  column(name: F32ColumnName): Float32Array { return this.f32[name]; }
  columnU8(name: U8ColumnName): Uint8Array { return this.u8[name]; }

  /**
   * List of MISMATCHES against what the consumer believes it is meshing. Empty ⇒ the field is for this surface.
   * A non-empty list must be treated as "this field is for a different surface", not as a warning.
   */
  verifyProvenance(expect: ProvenanceExpectation): string[] {
    const out: string[] = [];
    const p = this.artifact.provenance;
    const rel = expect.relTol ?? 0;
    const numEq = (a: number, b: number): boolean => (rel === 0 ? a === b : Math.abs(a - b) <= rel * Math.max(1e-12, Math.abs(b)));
    if (expect.style !== undefined && expect.style !== p.style) out.push(`style '${p.style}' != expected '${expect.style}'`);
    if (expect.dims !== undefined) {
      for (const k of ['H', 'Rb', 'Rt', 'expn'] as const) {
        const want = expect.dims[k];
        if (want !== undefined && !numEq(p.dims[k], want)) out.push(`dims.${k} ${p.dims[k]} != expected ${want}`);
      }
    }
    if (expect.tolMm !== undefined && !numEq(this.artifact.opts.tolMm, expect.tolMm)) {
      out.push(`tolMm ${this.artifact.opts.tolMm} != expected ${expect.tolMm}`);
    }
    if (expect.nU !== undefined && expect.nU !== this.nU) out.push(`nU ${this.nU} != expected ${expect.nU}`);
    if (expect.nV !== undefined && expect.nV !== this.nV) out.push(`nV ${this.nV} != expected ${expect.nV}`);
    if (expect.params !== undefined) {
      for (const [k, want] of Object.entries(expect.params)) {
        const got = p.params[k];
        if (got === undefined) out.push(`param '${k}' missing from the artifact`);
        else if (!numEq(got, want)) out.push(`param '${k}' ${got} != expected ${want}`);
      }
      for (const k of Object.keys(p.params)) {
        if (expect.params[k] === undefined) out.push(`param '${k}' present in the artifact but not expected`);
      }
    }
    return out;
  }

  /** the caveat block, as lines, for anything that prints a number derived from this field. */
  caveatLines(): string[] {
    const c = this.artifact.caveats;
    return [
      `LOWER BOUND: ${c.lowerBoundReason}`,
      `GRID-DEPENDENT CLASS SHARES: ${c.gridDependenceReason}`,
      `computed at ${c.computedAtGrid}; grid-converged: ${c.gridConverged === null ? 'NOT CHECKED' : String(c.gridConverged)}`,
      `PERSISTENCE: ${c.persistenceIsNotAProof}`,
      `NOT A CERTIFICATE: ${c.notACertificate}`,
    ];
  }
}

/**
 * Load an artifact. `jsonPath` may be either the `<base>.cells.json` or the `<base>.cells.bin` — the JSON is
 * always the authoritative half and is loaded either way. The binary is used when present and consistent;
 * an inconsistent binary THROWS rather than silently degrading to the rounded JSON columns.
 */
export function readSizingFieldArtifact(path: string, opts: { preferJson?: boolean } = {}): SizingFieldReader {
  const jsonPath = path.endsWith('.bin') ? `${path.slice(0, -4)}.json` : path;
  const artifact = JSON.parse(readFileSync(jsonPath, 'utf8')) as SizingFieldArtifact;
  if (artifact.schema !== SIZING_FIELD_SCHEMA) {
    throw new Error(`artifact schema '${artifact.schema}' != '${SIZING_FIELD_SCHEMA}'`);
  }
  let bin: Uint8Array | null = null;
  if (opts.preferJson !== true && artifact.binary !== null) {
    const binPath = join(dirname(jsonPath), basename(artifact.binary.file));
    if (existsSync(binPath)) bin = new Uint8Array(readFileSync(binPath));
  }
  return new SizingFieldReader(artifact, bin);
}
