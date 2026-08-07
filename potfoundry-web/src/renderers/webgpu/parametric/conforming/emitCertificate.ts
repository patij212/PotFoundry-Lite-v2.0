/**
 * emitCertificate.ts — THE EMIT-TIME CERTIFICATE: telemetry + export gate for the conforming
 * triangulators (S117 P1 part 2).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * A per-build counter that both shipping triangulators feed as they emit, plus an assertion an export
 * path can call to REFUSE a mesh that has even one violation. Both are behind `globalThis` flags that
 * DEFAULT OFF, following the `__pfConforming*` convention already used in this directory.
 *
 * *** IT IS RECORD-AND-COUNT, NOT REJECT. THAT IS A STRUCTURAL DECISION, NOT A PREFERENCE. ***
 * Three rejection behaviours were considered at the emit closure and two are provably unsafe there:
 *
 *   reject-and-drop     UNSAFE. The emit closure is the sole path for BOTH the plain-quad 2-triangle
 *                       split and the transition fan / Klincsek DP. Dropping one triangle punches a
 *                       hole: `boundaryEdges != 0`, the mesh stops being watertight, and STL/3MF
 *                       export produces an unprintable solid. Trading a fold for a hole is a strictly
 *                       worse defect, and the whole-mesh watertight control (`assembleWatertight`'s
 *                       C2) would fire on every such build.
 *   reject-and-resplit  IMPOSSIBLE AT THIS SITE. The boundary vertex SET of every leaf is fixed in
 *                       PASS A by the shared grid-line registry, precisely so that both sides of a
 *                       shared edge read the identical ordered vertex sequence (that is the
 *                       T-junction-free guarantee). Adding a vertex on one side to repair a triangle
 *                       de-syncs the other side and MANUFACTURES a T-junction. Any legal resplit must
 *                       happen upstream, in `PeriodicBalancedQuadtree.shouldRefine` — a different
 *                       module, a different decision, and one that changes triangle counts.
 *   record-and-count    SAFE. Reads the triangle, writes only to a counter. Cannot alter topology.
 *
 * So: record-and-count is the default AND the only behaviour implemented. The REFUSAL lives one level
 * up, in {@link assertEmitCertificate} — refusing to SHIP a mesh is safe in a way that refusing to EMIT
 * a triangle is not.
 *
 * ── AND THE FINDING THAT MOTIVATES THAT CHOICE ────────────────────────────────────────────────────
 * S117 P0 drove the shipping generator head-less and measured ZERO needles, ZERO inverted facets and
 * ZERO degeneracy poles. `emitCertificate.test.ts` §CLEAN re-asserts that as a FLOOR on a real
 * quadtree. This instrument is therefore expected to read zero in production. It is a REGRESSION
 * TRIPWIRE and a certificate, not a repair. Anything else would be manufacturing a win.
 *
 * ── TWO SCOPE LIMITS, STATED SO NOBODY QUOTES THIS AS WHOLE-MESH ─────────────────────────────────
 * (1) IT CERTIFIES THE WALLS, NOT THE SOLID. Only the two triangulators feed it. The assembly's ring
 *     strips and caps (`RingStrip.annulusStrip`, `discFan`) emit their triangles directly and never
 *     pass through either. On the measured CelticTriquetra smoke solid that is 12,544 of 483,596
 *     facets = 2.594% of the mesh, uncertified. `checked` is a wall count, never a solid count.
 * (2) IT IS PER-REALM. `LAST` is module state, so a build running in a worker thread publishes into
 *     THAT worker's accumulator, not the main thread's. Nothing in the shipping path triangulates off
 *     the main thread today, but an export path that gains one must aggregate across realms itself.
 *
 * @module conforming/emitCertificate
 */

import {
  checkEmitInvariantUV, makeEmitUvVerdict, DEFENSIBLE_EMIT_UV,
  type EmitUvVerdict, type EmitUvOptions,
} from './emitInvariant';

/**
 * Dev/opt-in detector for the EMIT-TIME INVARIANT TELEMETRY. Default OFF: when this returns false the
 * triangulators allocate no certificate, run no predicate, and attach no field — the emitted mesh is
 * byte-identical to the pre-instrument build (proved in `emitCertificate.test.ts` §NOPERT and, at
 * whole-mesh scale, by hashing the head-less shipping STL before and after).
 *
 * Same `globalThis` convention as `__pfConformingVerdictRefine` / `__pfRegionLayer`; strict `=== true`
 * so a truthy stray value cannot arm it.
 */
export function isEmitInvariantEnabled(): boolean {
  return (
    (globalThis as unknown as { __pfEmitInvariant?: boolean }).__pfEmitInvariant === true
  );
}

/**
 * Dev/opt-in detector for the EXPORT GATE. Default OFF. When ON *and* the telemetry flag is also on,
 * a build that recorded even one violation THROWS at the end of triangulation, so the export cannot
 * ship it. Inert on its own: the gate cannot fire on a build that was never measured (asserted in
 * `emitCertificate.test.ts` §GATE), which is deliberate — a silent "pass" from an unarmed instrument
 * must never look like a certificate.
 */
export function isEmitInvariantGateEnabled(): boolean {
  return (
    (globalThis as unknown as { __pfEmitInvariantGate?: boolean }).__pfEmitInvariantGate === true
  );
}

/**
 * One build's certificate.
 *
 * *** THE AREA FIELDS ARE (u,t) PARAMETER AREA, NOT mm^2, AND ARE NAMED SO. *** The emit site holds no
 * 3D positions (see the `emitInvariant.ts` note), so a millimetre area share is not available here and
 * is not invented. A 3D area share must be measured post-hoc on the finished mesh — that is what
 * `research/tools/s117EmitInvariantValidate.ts` is for.
 */
export interface EmitCertificate {
  /** How many builds fed this certificate (1 for a per-build one; N for the accumulator). */
  builds: number;
  /** Triangles the predicate actually ran on. Compare with `indices.length/3` — a FLOOR, not a total. */
  checked: number;
  /** Triangles that failed any enabled term. */
  violations: number;
  /** Violations split by term. */
  byReason: { degenerate: number; fold: number; blade: number };
  /** Violations split by TRI_SOURCE tag (index = tag), so a defect can be blamed on a template. */
  bySource: number[];
  /** Total |signed (u,t) area| over every checked triangle. The denominator for a share. */
  uvAreaTotal: number;
  /** Total |signed (u,t) area| over VIOLATING triangles. The numerator for a share. */
  uvAreaBad: number;
  /** Worst (most negative, i.e. deepest fold) qUv seen. +Infinity when nothing was checked. */
  worstQUv: number;
  /** Smallest (u,t) altitude seen. +Infinity when nothing was checked. */
  worstMinAlt: number;
  /** The (u,t) coordinates of the FIRST violating triangle, for a directed post-mortem. */
  firstViolation?: {
    reason: string;
    source: number;
    u: [number, number, number];
    t: [number, number, number];
    qUv: number;
    minAlt: number;
  };
}

/** A fresh, zeroed certificate. */
export function makeEmitCertificate(): EmitCertificate {
  return {
    builds: 1,
    checked: 0,
    violations: 0,
    byReason: { degenerate: 0, fold: 0, blade: 0 },
    bySource: [],
    uvAreaTotal: 0,
    uvAreaBad: 0,
    worstQUv: Number.POSITIVE_INFINITY,
    worstMinAlt: Number.POSITIVE_INFINITY,
  };
}

/** The predicate settings the triangulators use. Shared, frozen, and NOT caller-overridable. */
const EMIT_UV_OPTS: EmitUvOptions = DEFENSIBLE_EMIT_UV;

/** One scratch verdict per module — the record path allocates nothing in steady state. */
const SCRATCH: EmitUvVerdict = makeEmitUvVerdict();

/**
 * Run the emit-site predicate on one triangle and fold the result into `cert`.
 *
 * `source` is the `TRI_SOURCE` tag the emitter is currently emitting under, so a violation can be
 * attributed to the exact template that produced it (plain quad / transition fan / Klincsek DP /
 * feature CDT) rather than to "the mesher".
 */
export function recordEmitUv(
  cert: EmitCertificate,
  u0: number, t0: number,
  u1: number, t1: number,
  u2: number, t2: number,
  source: number,
): void {
  const v = checkEmitInvariantUV(u0, t0, u1, t1, u2, t2, EMIT_UV_OPTS, SCRATCH);
  const area = Math.abs(v.apUv);
  cert.checked += 1;
  cert.uvAreaTotal += area;
  if (v.qUv < cert.worstQUv) cert.worstQUv = v.qUv;
  if (v.minAlt < cert.worstMinAlt) cert.worstMinAlt = v.minAlt;
  if (v.ok) return;
  cert.violations += 1;
  cert.uvAreaBad += area;
  if (v.reason === 'degenerate') cert.byReason.degenerate += 1;
  else if (v.reason === 'fold') cert.byReason.fold += 1;
  else if (v.reason === 'blade') cert.byReason.blade += 1;
  cert.bySource[source] = (cert.bySource[source] ?? 0) + 1;
  if (cert.firstViolation === undefined) {
    cert.firstViolation = {
      reason: v.reason,
      source,
      u: [u0, u1, u2],
      t: [t0, t1, t2],
      qUv: v.qUv,
      minAlt: v.minAlt,
    };
  }
}

/** Fold `src` into `dst` additively, keeping the WORSE witness of each pair. */
export function mergeEmitCertificate(dst: EmitCertificate, src: EmitCertificate): void {
  dst.builds += src.builds;
  dst.checked += src.checked;
  dst.violations += src.violations;
  dst.byReason.degenerate += src.byReason.degenerate;
  dst.byReason.fold += src.byReason.fold;
  dst.byReason.blade += src.byReason.blade;
  for (let i = 0; i < src.bySource.length; i++) {
    const n = src.bySource[i];
    if (n === undefined) continue;
    dst.bySource[i] = (dst.bySource[i] ?? 0) + n;
  }
  dst.uvAreaTotal += src.uvAreaTotal;
  dst.uvAreaBad += src.uvAreaBad;
  if (src.worstQUv < dst.worstQUv) dst.worstQUv = src.worstQUv;
  if (src.worstMinAlt < dst.worstMinAlt) dst.worstMinAlt = src.worstMinAlt;
  if (dst.firstViolation === undefined && src.firstViolation !== undefined) {
    dst.firstViolation = src.firstViolation;
  }
}

// ── the accumulator an export path reads ────────────────────────────────────────────────────────────
// One export builds SEVERAL walls (outer, inner, and the assembly's caps), each its own triangulation
// call. A per-build certificate therefore cannot be the thing the export asserts on; this module-level
// accumulator is. Mirrors the `LAST_CONFORMING_STAGE_TIMINGS` precedent in ParametricExportComputer.
let LAST: EmitCertificate | undefined;

/** The accumulated certificate for every instrumented build since the last reset, or undefined. */
export function getLastEmitCertificate(): EmitCertificate | undefined {
  return LAST;
}

/** Clear the accumulator. An export path calls this before it starts building. */
export function resetLastEmitCertificate(): void {
  LAST = undefined;
}

/** Fold one build's certificate into the accumulator. Called by the triangulators. */
export function publishEmitCertificate(cert: EmitCertificate): void {
  if (LAST === undefined) {
    LAST = makeEmitCertificate();
    LAST.builds = 0;
  }
  mergeEmitCertificate(LAST, cert);
}

/**
 * THE EXPORT GATE. Throws when `cert` recorded even one violation.
 *
 * Safe to call unconditionally — it is a pure read of a counter. Callers that only want the gate when
 * armed should test {@link isEmitInvariantGateEnabled} first; the triangulators do exactly that, so a
 * gate-off build never throws no matter what the telemetry recorded.
 *
 * The message names the term, the template and the first witness's (u,t) triangle, so a failure is a
 * directed post-mortem rather than "the export failed".
 */
export function assertEmitCertificate(cert: EmitCertificate): void {
  if (cert.violations === 0) return;
  const fv = cert.firstViolation;
  const where = fv === undefined
    ? ''
    : ` first: ${fv.reason} from TRI_SOURCE ${fv.source} at`
      + ` (u,t) = (${fv.u[0]},${fv.t[0]}) (${fv.u[1]},${fv.t[1]}) (${fv.u[2]},${fv.t[2]});`
      + ` qUv=${fv.qUv} minAlt=${fv.minAlt}`;
  throw new Error(
    `emit invariant REFUSED this mesh: ${cert.violations} of ${cert.checked} emitted triangles`
    + ` violate the parameter-space invariant`
    + ` (degenerate ${cert.byReason.degenerate}, fold ${cert.byReason.fold},`
    + ` blade ${cert.byReason.blade});`
    + ` (u,t) area share ${cert.uvAreaTotal > 0 ? cert.uvAreaBad / cert.uvAreaTotal : 0}.${where}`,
  );
}
